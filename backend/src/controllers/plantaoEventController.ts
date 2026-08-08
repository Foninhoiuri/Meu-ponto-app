import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { BalanceService } from '../services/balanceService';

export class PlantaoEventController {
  async list(req: Request, res: Response) {
    try {
      const { timeRecordId } = req.query;
      if (!timeRecordId) {
        return res.status(400).json({ error: 'timeRecordId is required' });
      }

      const events = await prisma.plantaoEvent.findMany({
        where: { timeRecordId: String(timeRecordId) },
        orderBy: { startTime: 'asc' }
      });

      res.json(events);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao listar eventos de plantão' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { timeRecordId, startTime, endTime, description, name } = req.body;
      
      const event = await prisma.plantaoEvent.create({
        data: {
          timeRecordId,
          name: name || null,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          description
        }
      });

      // Recalcular saldo
      const record = await prisma.timeRecord.findUnique({
        where: { id: timeRecordId },
        include: { plantaoEvents: true }
      });
      if (record) {
        const balanceService = new BalanceService();
        const newBalance = await balanceService.calculateDailyBalance(record);
        await prisma.timeRecord.update({
          where: { id: record.id },
          data: { balanceDiff: newBalance }
        });
      }

      res.json(event);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao criar evento de plantão' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { startTime, endTime, description, name } = req.body;
      
      const event = await prisma.plantaoEvent.update({
        where: { id },
        data: {
          name: name !== undefined ? (name || null) : undefined,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime !== undefined ? (endTime ? new Date(endTime) : null) : undefined,
          description: description !== undefined ? description : undefined
        }
      });

      // Recalcular saldo
      const record = await prisma.timeRecord.findUnique({
        where: { id: event.timeRecordId },
        include: { plantaoEvents: true }
      });
      if (record) {
        const balanceService = new BalanceService();
        const newBalance = await balanceService.calculateDailyBalance(record);
        await prisma.timeRecord.update({
          where: { id: record.id },
          data: { balanceDiff: newBalance }
        });
      }

      res.json(event);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar evento de plantão' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      
      const event = await prisma.plantaoEvent.delete({
        where: { id }
      });

      // Recalcular saldo
      const record = await prisma.timeRecord.findUnique({
        where: { id: event.timeRecordId },
        include: { plantaoEvents: true }
      });
      if (record) {
        const balanceService = new BalanceService();
        const newBalance = await balanceService.calculateDailyBalance(record);
        await prisma.timeRecord.update({
          where: { id: record.id },
          data: { balanceDiff: newBalance }
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao deletar evento de plantão' });
    }
  }
}
