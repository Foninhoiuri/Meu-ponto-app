import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const SEGREDOS_OBRIGATORIOS = ['DEFAULT_PASSWORD'];
const VALORES_PROIBIDOS = ['1234', '12345678', 'senha', 'password', '00000000'];

export function conferirAmbiente() {
  if (process.env.NODE_ENV !== 'production') return;

  const problemas: string[] = [];

  for (const chave of SEGREDOS_OBRIGATORIOS) {
    const valor = process.env[chave];
    if (!valor) problemas.push(`${chave} não configurado`);
    else if (valor.length < 8) problemas.push(`${chave} curto demais (mínimo 8 caracteres)`);
    else if (VALORES_PROIBIDOS.includes(valor.toLowerCase())) problemas.push(`${chave} está com valor de exemplo previsível`);
  }

  if (problemas.length) {
    throw new Error(`[boot] a aplicação não sobe em produção assim:\n  - ${problemas.join('\n  - ')}`);
  }
}

export const globalRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_MAX || 300), 
  message: { error: 'muitas requisições', detalhe: 'tente novamente em breve' },
});

export const loginRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { error: 'muitas tentativas de login', detalhe: 'tente novamente em 5 minutos' },
});

export const securityHeaders = helmet({
  contentSecurityPolicy: false, 
});

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  
  if (err.name === 'PrismaClientKnownRequestError') {
    console.error(`[Prisma Error] ${err.code} on ${req.method} ${req.originalUrl}:`, err.message);
    if (err.code === 'P2002') return res.status(409).json({ error: 'registro duplicado' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'não encontrado', details: err.message });
    return res.status(400).json({ error: 'requisição inválida' });
  }

  if (err.statusCode === 413) {
    return res.status(413).json({ error: 'corpo da requisição grande demais' });
  }

  console.error({ err, reqId }, `erro não tratado on ${req.method} ${req.originalUrl}`);
  res.status(500).json({ error: 'erro interno', id: reqId });
}

export function notFoundHandler(req: Request, res: Response) {
  console.log(`[404] Route not mapped: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'não encontrado', route: req.originalUrl });
}
