import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { vapidPublicKey } from '../services/notifyService';

export class NotifyController {
  async getVapid(req: Request, res: Response) {
    res.json({ publicKey: vapidPublicKey() });
  }

  async getNotifications(req: Request, res: Response) {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'userId required' });

      const notifications = await prisma.notification.findMany({
        where: { userId: String(userId) },
        orderBy: { ts: 'desc' },
        take: 50
      });

      res.json(notifications);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
  }

  async readAll(req: Request, res: Response) {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId required' });

      await prisma.notification.updateMany({
        where: { userId: String(userId), read: false },
        data: { read: true }
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao ler notificações' });
    }
  }

  async subscribe(req: Request, res: Response) {
    try {
      const { userId, endpoint, p256dh, auth } = req.body;
      if (!userId || !endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: 'Parâmetros inválidos' });
      }

      await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: { p256dh, auth, userId },
        create: { endpoint, p256dh, auth, userId }
      });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao inscrever push' });
    }
  }

  async unsubscribe(req: Request, res: Response) {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

      await prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao desinscrever push' });
    }
  }
}
