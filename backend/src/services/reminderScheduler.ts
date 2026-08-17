import { prisma } from '../prisma';
import { announce } from './notifyService';
import { BalanceService, type DaySchedule } from './balanceService';
import { HolidayService } from './holidayService';

/**
 * Agendador dos lembretes de ponto.
 *
 * Roda de minuto em minuto e, para cada usuário, decide se algum aviso do dia
 * "venceu". Os horários saem da JORNADA CONFIGURADA (Settings.schedule), não de
 * valores fixos — se a entrada é 08:00, o aviso prévio sai 07:55.
 *
 * O disparo é idempotente: antes de avisar, verifica se já existe uma
 * Notification daquele tipo no dia. Assim reiniciar o container não duplica.
 */

/** O app trabalha no fuso do Brasil (UTC-3). */
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Quanto tempo depois do horário-alvo ainda vale disparar (servidor parado etc). */
const JANELA_ATRASO_MIN = 15;

const balanceService = new BalanceService();

const minutosDe = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

interface Contexto {
  /** Minutos desde a meia-noite, no horário do Brasil. */
  agoraMin: number;
  /** Data do dia (UTC midnight), como o TimeRecord grava. */
  dataDoDia: Date;
  /** Instante UTC do início do dia brasileiro — recorte para a checagem de duplicados. */
  inicioDoDiaUtc: Date;
}

function contextoAgora(): Contexto {
  const br = new Date(Date.now() - BR_OFFSET_MS);
  const y = br.getUTCFullYear();
  const m = br.getUTCMonth();
  const d = br.getUTCDate();
  return {
    agoraMin: br.getUTCHours() * 60 + br.getUTCMinutes(),
    dataDoDia: new Date(Date.UTC(y, m, d)),
    inicioDoDiaUtc: new Date(Date.UTC(y, m, d, 3, 0, 0)), // 00:00 BRT = 03:00 UTC
  };
}

/** Minutos (BR) de um instante gravado no banco. */
function minutosLocais(dt: Date): number {
  const br = new Date(dt.getTime() - BR_OFFSET_MS);
  return br.getUTCHours() * 60 + br.getUTCMinutes();
}

/** Está na hora deste aviso? (venceu e ainda está dentro da janela) */
function venceu(alvoMin: number, agoraMin: number): boolean {
  return agoraMin >= alvoMin && agoraMin <= alvoMin + JANELA_ATRASO_MIN;
}

async function jaAvisou(userId: string, kind: string, desde: Date): Promise<boolean> {
  const achou = await prisma.notification.findFirst({
    where: { userId, kind, ts: { gte: desde } },
    select: { id: true },
  });
  return achou !== null;
}

interface Aviso {
  kind: string;
  alvoMin: number;
  title: string;
  body: string;
}

/**
 * Monta a lista de avisos que se aplicam ao estado atual do dia.
 * Cada aviso só entra na lista se a condição dele fizer sentido agora
 * (ex.: não lembra de bater entrada se a entrada já foi batida).
 */
function avisosDoDia(sched: DaySchedule, registro: any | null): Aviso[] {
  const avisos: Aviso[] = [];

  const entradaMin = minutosDe(sched.entrada);
  const saidaMin = minutosDe(sched.saida);
  const almocoMin = sched.almoco || 0;

  const bateuEntrada = Boolean(registro?.punchIn);
  const bateuSaida = Boolean(registro?.punchOut);
  const almocoAberto = Boolean(registro?.lunchStart && !registro?.lunchEnd);

  // 1 e 2 — lembrete de bater a entrada (antes e depois do horário)
  if (!bateuEntrada) {
    avisos.push({
      kind: 'entrada-previa',
      alvoMin: entradaMin - 5,
      title: 'Seu expediente começa em 5 min',
      body: `Entrada prevista para ${sched.entrada}.`,
    });
    avisos.push({
      kind: 'entrada-atrasada',
      alvoMin: entradaMin + 5,
      title: 'Você ainda não bateu a entrada',
      body: `O horário de entrada (${sched.entrada}) já passou.`,
    });
  }

  // 3 — volta do almoço, 5 min antes de acabar o intervalo
  if (almocoAberto && almocoMin > 5) {
    avisos.push({
      kind: 'almoco-volta',
      alvoMin: minutosLocais(registro.lunchStart) + almocoMin - 5,
      title: 'Almoço acaba em 5 min',
      body: 'Não esqueça de registrar a volta.',
    });
  }

  // 4 e 5 — fim do expediente e saída esquecida.
  // Chegou tarde? O fim anda junto (entrada + duração da jornada).
  if (bateuEntrada && !bateuSaida) {
    const duracaoJornada = saidaMin - entradaMin;
    const fimProporcional = minutosLocais(registro.punchIn) + duracaoJornada;
    const fimMin = Math.max(saidaMin, fimProporcional);
    const hh = String(Math.floor(fimMin / 60) % 24).padStart(2, '0');
    const mm = String(fimMin % 60).padStart(2, '0');

    avisos.push({
      kind: 'fim-proximo',
      alvoMin: fimMin - 15,
      title: 'Expediente termina em 15 min',
      body: `Saída prevista para ${hh}:${mm}.`,
    });
    avisos.push({
      kind: 'saida-esquecida',
      alvoMin: fimMin + 30,
      title: 'Esqueceu de bater a saída?',
      body: 'Seu expediente segue aberto no app.',
    });
  }

  return avisos;
}

async function verificarUsuario(userId: string, ctx: Contexto): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  const semana = balanceService.normalizeSchedule((settings as any)?.schedule);
  const sched = balanceService.getDaySchedule(ctx.dataDoDia, semana);

  // Dia sem jornada (folga/fim de semana) ou feriado: silêncio.
  if (!sched.enabled) return;
  if (await HolidayService.isHoliday(ctx.dataDoDia)) return;

  const registro = await prisma.timeRecord.findUnique({
    where: { userId_date: { userId, date: ctx.dataDoDia } },
  });

  // Plantão, ponte e falta têm dinâmica própria — não cobram ponto.
  if (registro?.isPlantao || registro?.isPonte || registro?.isAbsence) return;

  for (const aviso of avisosDoDia(sched, registro)) {
    if (!venceu(aviso.alvoMin, ctx.agoraMin)) continue;
    if (await jaAvisou(userId, aviso.kind, ctx.inicioDoDiaUtc)) continue;

    await announce([userId], {
      kind: aviso.kind,
      title: aviso.title,
      body: aviso.body,
      url: '/',
    }, { push: true });

    console.log(`[lembretes] ${aviso.kind} enviado para ${userId}`);
  }
}

async function rodarCiclo(): Promise<void> {
  const ctx = contextoAgora();
  const usuarios = await prisma.user.findMany({ select: { id: true } });
  for (const u of usuarios) {
    try {
      await verificarUsuario(u.id, ctx);
    } catch (err) {
      console.error(`[lembretes] falha ao verificar ${u.id}:`, err);
    }
  }
}

/** Liga o agendador (chamado no boot do servidor). */
export function iniciarLembretes(): void {
  const ciclo = () => { rodarCiclo().catch(err => console.error('[lembretes] ciclo falhou:', err)); };
  setTimeout(ciclo, 15_000);          // deixa o banco/VAPID subirem primeiro
  setInterval(ciclo, 60_000);         // e daí em diante, de minuto em minuto
  console.log('🔔 Lembretes de ponto agendados (verificação a cada minuto)');
}
