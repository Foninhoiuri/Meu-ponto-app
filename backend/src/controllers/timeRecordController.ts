import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { BalanceService } from '../services/balanceService';
import { startOfDay } from 'date-fns';

const balanceService = new BalanceService();

export class TimeRecordController {
  
  async balance(req: Request, res: Response) {
    try {
      const { userId } = req.query;
      const uid = String(userId || 'default-user-id');
      
      // Fetch settings to get bankValidityMonths
      const settings = await prisma.settings.findUnique({
        where: { userId: uid }
      });
      const validMonths = settings?.bankValidityMonths || 6;
      
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - validMonths);

      const result = await prisma.timeRecord.aggregate({
        where: { 
          userId: uid,
          date: { gte: cutoffDate }
        },
        _sum: {
          balanceDiff: true
        }
      });

      const totalMinutes = result._sum.balanceDiff || 0;
      const isNegative = totalMinutes < 0;
      let absMin = Math.abs(totalMinutes);
      
      const y = Math.floor(absMin / (60 * 24 * 30 * 12));
      absMin %= (60 * 24 * 30 * 12);
      const mo = Math.floor(absMin / (60 * 24 * 30));
      absMin %= (60 * 24 * 30);
      const d = Math.floor(absMin / (60 * 24));
      absMin %= (60 * 24);
      const h = Math.floor(absMin / 60);
      const m = absMin % 60;

      const parts = [];
      if (y > 0) parts.push(`${y}a`);
      if (mo > 0) parts.push(`${mo}m`);
      if (d > 0) parts.push(`${d}d`);
      if (h > 0 || parts.length > 0) parts.push(`${h}h`);
      parts.push(`${m.toString().padStart(2, '0')}m`);

      const formatted = parts.join(' ');
      const totalBalanceFormatted = `${isNegative ? '-' : '+'} ${formatted}`;

      // Lógica de banco de horas (Dias/Semanas/Meses) - Considerando 8h por dia útil
      const minutesPerDay = 480;
      const minutesPerWeek = minutesPerDay * 5; // 2400 mins
      const minutesPerMonth = minutesPerWeek * 4; // 9600 mins

      let daysWeeksMonths = '';
      if (absMin >= minutesPerDay) {
        let remaining = absMin;
        const months = Math.floor(remaining / minutesPerMonth);
        remaining %= minutesPerMonth;
        const weeks = Math.floor(remaining / minutesPerWeek);
        remaining %= minutesPerWeek;
        const days = Math.floor(remaining / minutesPerDay);

        const dwmParts = [];
        if (months > 0) dwmParts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
        if (weeks > 0) dwmParts.push(`${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`);
        if (days > 0) dwmParts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);

        daysWeeksMonths = dwmParts.join(' e ');
        daysWeeksMonths = `${isNegative ? '-' : '+'} ${daysWeeksMonths}`;
      }

      // Projeção de férias: se o saldo está negativo, quantas horas/dias de
      // férias serão consumidos para cobrir a dívida (1 dia de férias = 8h).
      const MINUTES_PER_VACATION_DAY = 480;
      const vacationRiskMinutes = totalMinutes < 0 ? Math.abs(totalMinutes) : 0;
      const vacationDaysAtRisk = vacationRiskMinutes > 0
        ? Math.ceil((vacationRiskMinutes / MINUTES_PER_VACATION_DAY) * 2) / 2 // granularidade de meio-dia
        : 0;

      res.json({
        userId: uid,
        totalBalance: totalMinutes,
        totalBalanceFormatted,
        daysWeeksMonths,
        vacationRiskMinutes,
        vacationDaysAtRisk
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar saldo total' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const { userId, month, year } = req.query;
      const uid = String(userId || 'default-user-id');
      
      // Auto-bootstrap user if they don't exist yet
      await prisma.user.upsert({
        where: { id: uid },
        update: {},
        create: {
          id: uid,
          name: 'Colaborador Padrão',
        }
      });

      const records = await prisma.timeRecord.findMany({
        where: { userId: uid },
        orderBy: { date: 'desc' },
        include: { plantaoEvents: true }
      });
      res.json(records);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao listar registros' });
    }
  }

  async punch(req: Request, res: Response) {
    try {
      const { userId, type, reason, isPlantao, date } = req.body;
      const uid = String(userId || 'default-user-id');
      const now = date ? new Date(date) : new Date();
      // Zera segundos/ms: as batidas são "no minuto". Sem isso, os segundos do
      // relógio entram no cálculo e derrubam o saldo em 1–2 min por dia.
      now.setSeconds(0, 0);
      // Ajuste para o fuso do Brasil (UTC-3) para garantir que a virada de meia-noite (UTC) não jogue o dia para frente
      const localBrTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const targetDate = new Date(Date.UTC(localBrTime.getUTCFullYear(), localBrTime.getUTCMonth(), localBrTime.getUTCDate()));

      // Auto-bootstrap user if they don't exist yet
      await prisma.user.upsert({
        where: { id: uid },
        update: {},
        create: {
          id: uid,
          name: 'Colaborador Padrão',
        }
      });

      let record = await prisma.timeRecord.findUnique({
        where: {
          userId_date: { userId: uid, date: targetDate }
        }
      });

      if (!record) {
        // Criar registro do dia se não existir
        record = await prisma.timeRecord.create({
          data: {
            userId: uid,
            date: targetDate,
            isPlantao: isPlantao || false,
            reason: reason || null,
          }
        });
      }

      // Atualizar o horário conforme o tipo
      let updateData: any = {};
      
      if (type === 'PRE_DEFINE_PLANTAO') {
        // Apenas define a flag, não registra horário
        updateData.isPlantao = true;
      } else if (type === 'PRE_DEFINE_PONTE') {
        updateData.isPonte = true;
      } else if (record.isPlantao) {
        if (type === 'IN') {
          // Iniciar saída de plantão criando subcategoria
          await prisma.plantaoEvent.create({
            data: {
              timeRecordId: record.id,
              startTime: now,
              name: 'Saída Rápida',
            }
          });
        } else if (type === 'OUT') {
          // Finalizar saída de plantão
          const openEvent = await prisma.plantaoEvent.findFirst({
            where: { timeRecordId: record.id, endTime: null },
            orderBy: { startTime: 'desc' }
          });
          if (openEvent) {
            await prisma.plantaoEvent.update({
              where: { id: openEvent.id },
              data: { endTime: now }
            });
          }
        }
      } else {
        if (type === 'IN') updateData.punchIn = now;
        if (type === 'OUT') updateData.punchOut = now;
        if (type === 'LUNCH_START') updateData.lunchStart = now;
        if (type === 'LUNCH_END') updateData.lunchEnd = now;
      }

      const updatedRecord = await prisma.timeRecord.update({
        where: { id: record.id },
        data: updateData
      });

      // Recalcular balanço a cada batida para manter o saldo parcial correto
      // (necessário para a lógica de tolerância CLT Art. 58 §1º / Súmula 366 TST)
      if (type !== 'PRE_DEFINE_PLANTAO' && type !== 'PRE_DEFINE_PONTE') {
        const balanceDiff = await balanceService.calculateDailyBalance(updatedRecord);
        const newStatus = type === 'OUT' && !record.isPlantao ? 'CLOSED' : record.status;
        await prisma.timeRecord.update({
          where: { id: record.id },
          data: {
            balanceDiff,
            status: newStatus
          }
        });
      } else if (type === 'PRE_DEFINE_PONTE') {
        // Ponte desconta a jornada esperada do banco; grava o saldo e marca como
        // definido (status != OPEN) para não aparecer como pendência.
        const balanceDiff = await balanceService.calculateDailyBalance(updatedRecord);
        await prisma.timeRecord.update({
          where: { id: record.id },
          data: { balanceDiff, status: 'EDITED' }
        });
      }

      res.json(updatedRecord);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao bater ponto' });
    }
  }

  // Desfaz a última batida do dia (ex.: finalizou o expediente por engano e
  // quer reabrir para bater a saída de novo). Remove punchOut → lunchEnd →
  // lunchStart → punchIn nessa ordem; em plantão, remove o último evento.
  async undoLastPunch(req: Request, res: Response) {
    try {
      const { userId, date } = req.body;
      const uid = String(userId || 'default-user-id');
      const now = date ? new Date(date) : new Date();
      const localBrTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const targetDate = new Date(Date.UTC(localBrTime.getUTCFullYear(), localBrTime.getUTCMonth(), localBrTime.getUTCDate()));

      const record = await prisma.timeRecord.findUnique({
        where: { userId_date: { userId: uid, date: targetDate } },
        include: { plantaoEvents: true }
      });
      if (!record) {
        return res.status(404).json({ error: 'Nenhum registro para hoje.' });
      }

      let removed: string | null = null;

      if (record.isPlantao) {
        const last = await prisma.plantaoEvent.findFirst({
          where: { timeRecordId: record.id },
          orderBy: { createdAt: 'desc' }
        });
        if (last) {
          await prisma.plantaoEvent.delete({ where: { id: last.id } });
          removed = 'PLANTAO';
        }
      } else {
        const updateData: any = {};
        if (record.punchOut) { updateData.punchOut = null; removed = 'OUT'; }
        else if (record.lunchEnd) { updateData.lunchEnd = null; removed = 'LUNCH_END'; }
        else if (record.lunchStart) { updateData.lunchStart = null; removed = 'LUNCH_START'; }
        else if (record.punchIn) { updateData.punchIn = null; removed = 'IN'; }

        if (removed) {
          // Reabre o dia (status OPEN) para recalcular como expediente em andamento
          updateData.status = 'OPEN';
          await prisma.timeRecord.update({ where: { id: record.id }, data: updateData });
        }
      }

      if (!removed) {
        return res.status(400).json({ error: 'Nada para desfazer.' });
      }

      const fresh = await prisma.timeRecord.findUnique({
        where: { id: record.id },
        include: { plantaoEvents: true }
      });
      if (fresh) {
        const balanceDiff = await balanceService.calculateDailyBalance(fresh);
        await prisma.timeRecord.update({ where: { id: record.id }, data: { balanceDiff } });
      }

      res.json({ success: true, removed });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao desfazer batida' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { punchIn, punchOut, lunchStart, lunchEnd, reason, isAbsence, isJustified, isPlantao, isPonte, isHoliday, userId, date } = req.body;

      let recordId = id;

      if (id.startsWith('ghost-')) {
        const uid = String(userId || 'default-user-id');
        const targetDate = new Date(`${date.substring(0, 10)}T00:00:00Z`);
        
        const newRecord = await prisma.timeRecord.create({
          data: {
            userId: uid,
            date: targetDate,
            isPlantao: isPlantao || false,
            isPonte: isPonte || false,
            isHoliday: isHoliday || false,
            status: 'EDITED'
          }
        });
        recordId = newRecord.id;
      }

      // Allow resetting values to null when explicitly sent as null or empty string
      const record = await prisma.timeRecord.update({
        where: { id: recordId },
        data: {
          punchIn: punchIn === null || punchIn === '' ? null : (punchIn ? new Date(punchIn) : undefined),
          punchOut: punchOut === null || punchOut === '' ? null : (punchOut ? new Date(punchOut) : undefined),
          lunchStart: lunchStart === null || lunchStart === '' ? null : (lunchStart ? new Date(lunchStart) : undefined),
          lunchEnd: lunchEnd === null || lunchEnd === '' ? null : (lunchEnd ? new Date(lunchEnd) : undefined),
          reason: reason === null ? null : (reason !== undefined ? reason : undefined),
          isAbsence: isAbsence !== undefined ? isAbsence : undefined,
          isJustified: isJustified !== undefined ? isJustified : undefined,
          isPlantao: isPlantao !== undefined ? isPlantao : undefined,
          isPonte: isPonte !== undefined ? isPonte : undefined,
          isHoliday: isHoliday !== undefined ? isHoliday : undefined,
          status: 'EDITED'
        },
        include: { plantaoEvents: true }
      });

      // Recalcular saldo
      const balanceDiff = await balanceService.calculateDailyBalance(record);
      const finalRecord = await prisma.timeRecord.update({
        where: { id: recordId },
        data: { balanceDiff }
      });

      res.json(finalRecord);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar registro' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await prisma.timeRecord.delete({ where: { id } });
      res.json({ message: 'Registro deletado com sucesso' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao deletar registro' });
    }
  }
}
