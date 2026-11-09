// Utilidades compartilhadas de cálculo/formatação de um registro de ponto.
// Usadas nos mini-cards (Home, Calendário) e no Resumo, para manter o mesmo
// significado de "total de horas do dia" em todo lugar.

const toDate = (v: any): Date | null => (v ? new Date(v) : null);

/** Soma a duração (min) dos eventos de plantão finalizados. */
export function plantaoMinutes(events?: any[]): number {
  let total = 0;
  for (const ev of events || []) {
    if (ev.startTime && ev.endTime) {
      const s = new Date(ev.startTime);
      const e = new Date(ev.endTime);
      if (e < s) e.setDate(e.getDate() + 1);
      total += Math.round((e.getTime() - s.getTime()) / 60000);
    }
  }
  return total;
}

/**
 * Total de horas efetivamente trabalhadas no dia, em minutos:
 * trabalho normal (batidas) + horas extras (eventos de plantão),
 * já descontando o intervalo de almoço quando registrado.
 */
export function workedMinutes(record: any): number {
  if (!record) return 0;

  // Dia de plantão puro: tudo vem dos eventos
  if (record.isPlantao) return plantaoMinutes(record.plantaoEvents);

  const punches = [
    toDate(record.punchIn),
    toDate(record.lunchStart),
    toDate(record.lunchEnd),
    toDate(record.punchOut),
    ...((record.punches || []).map(toDate)),
  ]
    .filter((p): p is Date => p !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  let total = 0;
  for (let i = 0; i + 1 < punches.length; i += 2) {
    total += Math.round((punches[i + 1].getTime() - punches[i].getTime()) / 60000);
  }
  // 2 batidas apenas (sem almoço registrado) num dia fechado → desconta 1h padrão
  if (punches.length === 2 && (record.punchOut || record.status === 'CLOSED')) {
    total -= 60;
  }
  if (total < 0) total = 0;

  // Soma plantão avulso lançado em dia normal
  total += plantaoMinutes(record.plantaoEvents);
  return total;
}

/** "8h 30m" / "0h 00m" */
export function formatHm(min: number): string {
  const abs = Math.abs(min);
  return `${Math.floor(abs / 60)}h ${(abs % 60).toString().padStart(2, '0')}m`;
}

/** Saldo com sinal: "+ 0h 30m" / "- 0h 15m"; null quando exatamente zero. */
export function formatBalance(min: number): string | null {
  if (min === 0) return null;
  return `${min > 0 ? '+' : '-'} ${formatHm(min)}`;
}

export type DayCategory = 'ghost' | 'plantao' | 'ponte' | 'debito' | 'extra' | 'normal';

/** Classifica um dia real para filtros/estilo. */
export function dayCategory(day: any): DayCategory {
  if (day.isGhost) return 'ghost';
  if (day.isPlantao) return 'plantao';
  if (day.isPonte) return 'ponte';
  const bal = day.balanceDiff || 0;
  if (bal < 0 || day.isAbsence) return 'debito';
  if (bal > 0) return 'extra';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Tolerância de 10 min (CLT) — cálculo no cliente para o destaque amarelo
// ---------------------------------------------------------------------------

const DOW_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

interface DaySched { enabled: boolean; entrada: string; saida: string; almoco: number; }

const DEFAULT_SCHED: Record<string, DaySched> = {
  dom: { enabled: false, entrada: '08:00', saida: '12:00', almoco: 0 },
  seg: { enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  ter: { enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  qua: { enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  qui: { enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  sex: { enabled: true, entrada: '08:00', saida: '17:00', almoco: 60 },
  sab: { enabled: false, entrada: '08:00', saida: '12:00', almoco: 0 },
};

function schedFor(dateStr: string): DaySched {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
  const key = DOW_KEYS[new Date(y, m - 1, d).getDay()];
  try {
    const raw = localStorage.getItem('work_schedule');
    if (raw) {
      const s = JSON.parse(raw).find((x: any) => x.key === key);
      if (s) return s;
    }
  } catch { /* usa o padrão */ }
  return DEFAULT_SCHED[key];
}

const localMin = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * True quando o dia útil completo ficou DENTRO da tolerância de 10 min
 * (houve variação, mas nenhuma batida passou de 10 min) — para o destaque amarelo.
 */
export function isWithinTolerance(record: any): boolean {
  if (!record || record.isGhost || record.isPlantao || record.isPonte || record.isAbsence) return false;
  if (!record.punchIn || !record.punchOut) return false;
  const sched = schedFor(record.date);
  if (!sched.enabled) return false;

  const diffIn = Math.abs(localMin(record.punchIn) - hhmm(sched.entrada));
  const diffOut = Math.abs(localMin(record.punchOut) - hhmm(sched.saida));
  let diffLunch = 0;
  if (record.lunchStart && record.lunchEnd) {
    diffLunch = Math.abs((localMin(record.lunchEnd) - localMin(record.lunchStart)) - sched.almoco);
  }
  const total = diffIn + diffOut + diffLunch;
  const maxSingle = Math.max(diffIn, diffOut, diffLunch);
  return total > 0 && maxSingle <= 10;
}

/**
 * Totais de todo o banco (histórico inteiro). O dia ainda aberto (status OPEN) fica de fora:
 * o saldo dele só é definitivo depois da saída.
 */
export function bankTotals(records: any[]) {
  const closed = records.filter(r => r.date && !r.isGhost && r.status !== 'OPEN');
  let saldo = 0, positivo = 0, trabalhado = 0, pontes = 0, pontesDias = 0;
  for (const r of closed) {
    const bal = r.balanceDiff || 0;
    saldo += bal;
    if (bal > 0) positivo += bal;
    trabalhado += workedMinutes(r);
    if (r.isPonte) { pontes += bal; pontesDias++; }
  }
  return { saldo, positivo, trabalhado, pontes, pontesDias, dias: closed.length };
}
