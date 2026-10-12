import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { BalanceService } from '../services/balanceService';

export class RecalculateController {
  async recalculateAll(req: Request, res: Response) {
    try {
      const balanceService = new BalanceService();
      
      const records = await prisma.timeRecord.findMany({
        // Dias fechados/editados + pontes e plantões (que podem ficar com status OPEN)
        where: {
          OR: [
            { status: { not: 'OPEN' } },
            { isPonte: true },
            { isPlantao: true },
            { isHoliday: true },
          ],
        },
        include: { plantaoEvents: true },
      });

      let updatedCount = 0;

      for (const record of records) {
        // Recalcular saldo
        const newBalance = await balanceService.calculateDailyBalance(record);
        
        if (newBalance !== record.balanceDiff) {
          await prisma.timeRecord.update({
            where: { id: record.id },
            data: { balanceDiff: newBalance }
          });
          updatedCount++;
        }
      }

      res.json({ success: true, updatedCount, totalChecked: records.length });
    } catch (error) {
      console.error('Erro ao recalcular banco de horas:', error);
      res.status(500).json({ error: 'Erro interno ao recalcular banco de horas' });
    }
  }
}
