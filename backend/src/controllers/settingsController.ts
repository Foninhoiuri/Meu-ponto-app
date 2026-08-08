import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class SettingsController {
  async get(req: Request, res: Response) {
    try {
      const { userId } = req.query;
      const uid = String(userId || 'default-user-id');
      
      let settings = await prisma.settings.findUnique({
        where: { userId: uid }
      });

      if (!settings) {
        settings = await prisma.settings.create({
          data: {
            userId: uid,
            weeklyHours: 44,
            bankValidityMonths: 6,
            strictTolerance: false,
            theme: 'dark'
          }
        });
      }

      res.json(settings);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { userId, bankValidityMonths, strictTolerance, weeklyHours, schedule, countPontes } = req.body;
      const uid = String(userId || 'default-user-id');

      // schedule: aceita apenas array (jornada por dia) para não gravar lixo
      const scheduleValue = Array.isArray(schedule) ? schedule : undefined;

      const settings = await prisma.settings.upsert({
        where: { userId: uid },
        update: {
          bankValidityMonths: bankValidityMonths !== undefined ? Number(bankValidityMonths) : undefined,
          strictTolerance: strictTolerance !== undefined ? Boolean(strictTolerance) : undefined,
          weeklyHours: weeklyHours !== undefined ? Number(weeklyHours) : undefined,
          countPontes: countPontes !== undefined ? Boolean(countPontes) : undefined,
          schedule: scheduleValue
        },
        create: {
          userId: uid,
          weeklyHours: weeklyHours !== undefined ? Number(weeklyHours) : 44,
          bankValidityMonths: bankValidityMonths !== undefined ? Number(bankValidityMonths) : 6,
          strictTolerance: strictTolerance !== undefined ? Boolean(strictTolerance) : false,
          countPontes: countPontes !== undefined ? Boolean(countPontes) : true,
          schedule: scheduleValue
        }
      });

      res.json(settings);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
  }
}
