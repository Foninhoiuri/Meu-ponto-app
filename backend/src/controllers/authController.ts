import { Request, Response } from 'express';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { pin } = req.body;
      const expectedPin = process.env.DEFAULT_PASSWORD;

      if (!pin) {
        res.status(400).json({ error: 'PIN não fornecido' });
        return;
      }

      if (!expectedPin) {
        res.status(500).json({ error: 'Servidor mal configurado: senha padrão não definida' });
        return;
      }

      if (pin === expectedPin) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: 'PIN inválido' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao fazer login' });
    }
  }
}
