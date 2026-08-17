import { useEffect, useRef } from 'react';
import { showNotification } from '../lib/notifications';

const MAX_POPUPS = 5;

export function NotificationsManager({ userId }: { userId: string | null }) {
  const visto = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const CHAVE_VISTO = `notif-visto:${userId}`;
    visto.current = localStorage.getItem(CHAVE_VISTO);

    const check = async () => {
      try {
        const res = await fetch(`/api/notifications?userId=${userId}`);
        if (!res.ok) return;
        const notifications: any[] = await res.json();
        if (notifications.length === 0) return;
        
        const maisNova = notifications.reduce((max, n) => (n.ts > max ? n.ts : max), '');
        const marcar = () => {
          visto.current = maisNova;
          localStorage.setItem(CHAVE_VISTO, maisNova);
        };

        if (visto.current === null) return marcar();

        const novas = notifications
          .filter((n: any) => !n.read && n.ts > visto.current!)
          .sort((a: any, b: any) => a.ts.localeCompare(b.ts));
        
        if (novas.length === 0) return;
        marcar();
        for (const n of novas.slice(-MAX_POPUPS)) {
          showNotification(n.title, n.body, n.url || '/', n.kind);
        }
      } catch (e) {
        console.error(e);
      }
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  return null;
}
