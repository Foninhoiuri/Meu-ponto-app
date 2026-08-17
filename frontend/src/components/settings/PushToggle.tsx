import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2, AlertTriangle } from 'lucide-react';
import { pushSupported, isPushSubscribed, enablePush, disablePush, isIOS, isStandalone } from '@/lib/push';

interface Props {
  userId: string;
}

export function PushToggle({ userId }: Props) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    isPushSubscribed().then(setOn);
  }, []);

  const bloqueado = pushSupported() && Notification.permission === 'denied';
  const precisaInstalar = isIOS() && !isStandalone();

  async function toggle() {
    setBusy(true);
    setAviso(null);
    setErro(false);
    try {
      if (on) {
        await disablePush(userId);
        setOn(false);
        setAviso('Push desativado.');
      } else {
        const { ok, reason } = await enablePush(userId);
        setOn(ok);
        setAviso(reason);
        setErro(!ok);
      }
    } catch {
      setErro(true);
      setAviso('Falha ao configurar o push.');
    } finally {
      setBusy(false);
    }
  }

  if (!pushSupported() && !precisaInstalar) return null;

  const textoPadrao = precisaInstalar
    ? 'No iPhone, adicione o app à Tela de Início e ative por lá.'
    : bloqueado
      ? 'Bloqueado. Ajustes do iPhone → Notificações → Meu Ponto. Se não aparecer, remova o app da Tela de Início e adicione de novo.'
      : 'Recebe os lembretes de ponto mesmo com o app fechado.';

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-white font-medium">
          {on ? <Bell size={15} className="text-primary" /> : <BellOff size={15} className="text-textSecondary" />}
          Lembretes de Ponto
        </span>
        <button
          onClick={toggle}
          disabled={busy || on === null || bloqueado || precisaInstalar}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-primary' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-[2px]'}`} />
        </button>
      </div>

      <p className="text-[10px] text-textSecondary/70 leading-snug">
        {aviso ?? textoPadrao}
      </p>

      {(bloqueado || precisaInstalar) && !aviso && (
        <p className="flex items-start gap-1.5 text-[10px] text-amber-400/90 leading-snug">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          {precisaInstalar ? 'App precisa estar na Tela de Início.' : 'Permissão negada no dispositivo.'}
        </p>
      )}

      {erro && aviso && (
        <p className="flex items-start gap-1.5 text-[10px] text-danger leading-snug">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          Não foi possível ativar.
        </p>
      )}

      {busy && (
        <p className="flex items-center gap-1.5 text-[10px] text-textSecondary">
          <Loader2 size={12} className="animate-spin" /> Configurando...
        </p>
      )}
    </div>
  );
}
