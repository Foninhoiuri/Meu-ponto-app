import webpush from 'web-push';
import { prisma } from '../prisma';

let vapidPublic = '';

export function vapidPublicKey(): string {
  return vapidPublic;
}

export async function initVapid() {

  
  // We don't have vapid keys in Settings model directly, so we either add them to the Prisma schema or use a simpler approach.
  // For Meu Ponto app, we can just check ENV vars or generate them in memory if missing (this means subscriptions drop on restart without ENV).
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not found in .env. Generating ephemeral keys. Subscriptions will invalidate on server restart.');
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    vapidPublic = pub;
  } else {
    vapidPublic = pub;
  }
  
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@meuponto.com';
  webpush.setVapidDetails(subject, pub, priv);
}

export async function sendPush(userIds: string[], payload: { title: string; body?: string; url?: string; tag?: string }) {
  const ids = [...new Set(userIds)];
  if (!vapidPublic || ids.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } } });
  const data = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }
  }));
}

export interface Aviso {
  kind: string;
  title: string;
  body?: string;
  url?: string;
}

export async function announce(userIds: string[], n: Aviso, opts: { push?: boolean } = {}) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body ?? null, url: n.url ?? null })),
    });
  } catch { /* silencioso */ }
  if (opts.push) sendPush(ids, { title: n.title, body: n.body, url: n.url, tag: n.kind }).catch(() => {});
}
