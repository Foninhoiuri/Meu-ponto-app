import { useState, useEffect } from 'react';
import { Cloud, Bell, Loader2 } from 'lucide-react';
import { pushSupported, isPushSubscribed, enablePush, disablePush } from '@/lib/push';
import { showNotification } from '@/lib/notifications';

interface Props {
  userId: string;
}

export function PushToggle({ userId }: Props) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isPushSubscribed().then(setOn);
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (on) {
        await disablePush(userId);
        setOn(false);
      } else {
        const ok = await enablePush(userId);
        setOn(ok);
        if (!ok) setError('Não foi possível ativar o push neste dispositivo.');
      }
    } catch {
      setError('Falha ao configurar o push do servidor.');
    } finally {
      setBusy(false);
    }
  }

  if (!pushSupported()) return null;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-white font-medium">
          <Cloud size={15} className="text-primary" /> Push Notificações
        </span>
        <button 
          onClick={toggle} 
          disabled={busy || on === null} 
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-primary' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-[2px]'}`} />
        </button>
      </div>
      <p className="text-[10px] text-textSecondary/70">
        Recebe lembretes mesmo com o app fechado (requer permissão do navegador).
      </p>
      {on && (
        <button 
          onClick={() => showNotification('Notificação de Teste', 'O push está configurado corretamente!')} 
          className="flex items-center gap-1.5 text-[11px] text-primary/80 hover:text-primary mt-1 w-max"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />} Enviar push de teste
        </button>
      )}
      {error && <div className="text-[11px] text-danger mt-1">{error}</div>}
    </div>
  );
}
