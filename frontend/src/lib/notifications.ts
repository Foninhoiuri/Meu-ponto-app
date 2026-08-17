// Lembretes locais do dia (PWA). Funcionam enquanto o app/Service Worker está
// ativo. Notificações em segundo plano com o app fechado exigem Web Push
// (servidor + assinatura) — fica como evolução futura.

let timers: number[] = [];

export function clearReminders() {
  timers.forEach(t => clearTimeout(t));
  timers = [];
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationsGranted(): boolean {
  return notificationsSupported() && Notification.permission === 'granted';
}

export function isIOS(): boolean {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );
}

/** True quando rodando como PWA instalado (Tela de Início), não numa aba. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Pede permissão (precisa ser chamado a partir de um gesto do usuário).
 * Retorna também um motivo legível — no iOS os lembretes só funcionam com o
 * app adicionado à Tela de Início (PWA instalado, iOS 16.4+).
 */
export async function requestNotifications(): Promise<{ ok: boolean; reason: string }> {
  if (!notificationsSupported()) {
    if (isIOS() && !isStandalone()) {
      return {
        ok: false,
        reason: 'No iPhone/iPad, toque em Compartilhar → "Adicionar à Tela de Início" e abra por lá para ativar os lembretes.',
      };
    }
    return { ok: false, reason: 'Este dispositivo/navegador não suporta notificações.' };
  }
  if (Notification.permission === 'granted') return { ok: true, reason: 'Lembretes ativados!' };
  if (Notification.permission === 'denied') {
    return {
      ok: false,
      reason: isIOS()
        ? 'Notificações bloqueadas. Remova o app da Tela de Início e adicione novamente para permitir.'
        : 'Notificações bloqueadas nas configurações do navegador.',
    };
  }
  try {
    const res = await Notification.requestPermission();
    return res === 'granted'
      ? { ok: true, reason: 'Lembretes ativados!' }
      : { ok: false, reason: 'Permissão de notificação não concedida.' };
  } catch {
    return { ok: false, reason: 'Não foi possível solicitar permissão de notificação.' };
  }
}

export async function showNotification(title: string, body: string, url?: string, tag?: string) {
  if (!notificationsGranted()) return;
  const options: NotificationOptions = { body, data: { url }, tag, icon: '/icone.png', badge: '/icone.png' };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      reg.showNotification(title, options);
      return;
    }
  } catch {
    /* cai no fallback abaixo */
  }
  try {
    new Notification(title, options);
  } catch {
    /* navegador sem suporte a Notification direto (ex.: alguns mobile) */
  }
}

export interface ReminderInput {
  now: Date;
  status: string;
  isWorkday: boolean; // dia útil, não feriado, não plantão/ponte
  punchIn?: Date | null;
  lunchStart?: Date | null;
  targetEnd?: Date | null; // fim do expediente estimado
  entradaHour?: number; // hora padrão de entrada (default 8)
}

/** (Re)agenda todos os lembretes do dia com base no estado atual. */
export function scheduleReminders(input: ReminderInput) {
  clearReminders();
  if (!notificationsGranted()) return;

  const { now, status, isWorkday } = input;
  if (!isWorkday) return;

  const at = (when: Date, title: string, body: string, tag: string) => {
    const delay = when.getTime() - now.getTime();
    if (delay <= 0 || delay > 20 * 60 * 60 * 1000) return; // apenas futuro, dentro do dia
    timers.push(window.setTimeout(() => showNotification(title, body), delay));
  };

  // 1. Lembrete de entrada
  if (status === 'OPEN' && !input.punchIn) {
    const entrada = new Date(now);
    entrada.setHours(input.entradaHour ?? 8, 0, 0, 0);
    at(entrada, 'Bater ponto', 'Hora de registrar sua entrada.', 'entrada');
  }

  // 2. Volta do almoço (1h após a saída para o almoço)
  if (status === 'LUNCH' && input.lunchStart) {
    const back = new Date(input.lunchStart.getTime() + 60 * 60000);
    at(back, 'Volta do almoço', 'Já passou 1h — registre a volta do almoço.', 'lunch-back');
  }

  // 3. Fim do expediente perto + 4. Esqueceu de bater a saída
  if ((status === 'WORKING' || status === 'LUNCH') && input.targetEnd) {
    at(new Date(input.targetEnd.getTime() - 15 * 60000),
      'Fim do expediente', 'Faltam ~15 min para o fim do expediente.', 'shift-near');
    at(new Date(input.targetEnd.getTime() + 30 * 60000),
      'Esqueceu de sair?', 'Seu expediente passou do horário e segue aberto.', 'forgot-out');
  }
}
