export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

export function isIOS(): boolean {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );
}

/** True quando aberto como app instalado (Tela de Início), não numa aba. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export interface ResultadoPush {
  ok: boolean;
  reason: string;
}

/**
 * Ativa o push.
 *
 * ORDEM IMPORTA: o pedido de permissão precisa ser a PRIMEIRA coisa, ainda
 * dentro do gesto do usuário. No iOS o "user activation" expira assim que a
 * função aguarda algo demorado (o `serviceWorker.ready` e o fetch da chave
 * VAPID); se `subscribe()` for chamado depois disso sem permissão concedida,
 * o Safari nega — e a negação fica gravada como "bloqueado".
 */
export async function enablePush(userId: string): Promise<ResultadoPush> {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) {
      return { ok: false, reason: 'No iPhone, toque em Compartilhar → "Adicionar à Tela de Início" e abra o app por lá.' };
    }
    return { ok: false, reason: 'Este dispositivo não suporta notificações push.' };
  }

  // iOS só oferece push para o app instalado na Tela de Início.
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: 'No iPhone, adicione o app à Tela de Início e ative por lá.' };
  }

  // --- Permissão primeiro, com o gesto ainda "quente" ---
  if (Notification.permission === 'denied') {
    return {
      ok: false,
      reason: isIOS()
        ? 'Notificações bloqueadas. Ajustes do iPhone → Notificações → Meu Ponto → permitir. Se não aparecer, remova o app da Tela de Início e adicione de novo.'
        : 'Notificações bloqueadas nas configurações do navegador.',
    };
  }
  if (Notification.permission !== 'granted') {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      return { ok: false, reason: 'Permissão de notificação não concedida.' };
    }
  }

  // --- Só agora as etapas demoradas ---
  try {
    const reg = await navigator.serviceWorker.ready;

    const resKey = await fetch('/api/push/vapid');
    if (!resKey.ok) return { ok: false, reason: 'Servidor não respondeu com a chave de push.' };
    const { publicKey } = await resKey.json();
    if (!publicKey) return { ok: false, reason: 'Servidor sem chave VAPID configurada.' };

    let sub = await reg.pushManager.getSubscription();

    // Inscrição antiga pode ter sido feita com outra chave VAPID (ex.: chaves
    // efêmeras de antes). Nesse caso ela nunca receberia nada — refaz.
    if (sub) {
      const atual = new Uint8Array(sub.options?.applicationServerKey ?? new ArrayBuffer(0));
      const desejada = urlBase64ToUint8Array(publicKey);
      const igual = atual.length === desejada.length && atual.every((b, i) => b === desejada[i]);
      if (!igual) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const payload = sub.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        endpoint: payload.endpoint,
        p256dh: payload.keys?.p256dh,
        auth: payload.keys?.auth,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'Não foi possível registrar a inscrição no servidor.' };

    return { ok: true, reason: 'Push ativado! Você receberá os lembretes com o app fechado.' };
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      return { ok: false, reason: 'O dispositivo negou o push. Tente novamente pelo app instalado na Tela de Início.' };
    }
    console.error('[push] falha ao ativar:', err);
    return { ok: false, reason: 'Falha ao ativar o push neste dispositivo.' };
  }
}

export async function disablePush(userId: string): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
