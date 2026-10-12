import { TimeRecord } from '@prisma/client';
import { prisma } from '../prisma';
import { differenceInMinutes, startOfWeek, endOfWeek } from 'date-fns';
import { HolidayService } from './holidayService';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Horários esperados para o dia (jornada padrão).
 * Cada campo é um Date completo usando a mesma data do registro.
 */
export interface ExpectedSchedule {
  punchIn: Date;
  lunchStart: Date;
  lunchEnd: Date;
  punchOut: Date;
}

/**
 * Jornada configurável por dia da semana (Settings.schedule).
 * `entrada`/`saida` em HH:MM (horário local BRT), `almoco` em minutos.
 */
export interface DaySchedule {
  key: string;
  enabled: boolean;
  entrada: string;
  saida: string;
  almoco: number;
}

/** Jornada padrão (44h): Seg–Qui 08–18 c/ 1h almoço, Sex 08–17 c/ 1h. */
export const DEFAULT_WEEK_SCHEDULE: DaySchedule[] = [
  { key: 'dom', enabled: false, entrada: '08:00', saida: '12:00', almoco: 0 },
  { key: 'seg', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'ter', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'qua', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'qui', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'sex', enabled: true, entrada: '08:00', saida: '17:00', almoco: 60 },
  { key: 'sab', enabled: false, entrada: '08:00', saida: '12:00', almoco: 0 },
];

const DOW_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/**
 * Resultado da aplicação das regras de tolerância (CLT Art. 58 §1º / Súmula 366 TST).
 */
export interface ToleranceResult {
  /** Saldo final que vai para o banco de horas (em minutos). */
  balanceDiff: number;
  /** Soma absoluta das variações de cada batida (em minutos). */
  totalAbsoluteVariation: number;
  /** Se a tolerância foi aplicada (soma ≤ 10 min → saldo zerado). */
  toleranceApplied: boolean;
  /** Variação de cada batida em minutos (positivo = depois do esperado, negativo = antes). */
  variations: number[];
}

// ---------------------------------------------------------------------------
// Constantes de tolerância (CLT Art. 58 §1º)
// ---------------------------------------------------------------------------

/** Tolerância máxima por registro individual de ponto, em minutos. */
const TOLERANCE_PER_PUNCH_MINUTES = 10;

/** Tolerância máxima diária (soma de todas as variações), em minutos. */
const TOLERANCE_DAILY_MAX_MINUTES = 10;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BalanceService {

  // -------------------------------------------------------------------------
  // Cálculo principal
  // -------------------------------------------------------------------------

  /**
   * Calcula a diferença de saldo de um dia, aplicando as regras de tolerância
   * da CLT Art. 58 §1º e Súmula 366 do TST para dias úteis normais.
   *
   * Plantão, Ponte, Falta, Feriado e Final de semana seguem regras próprias
   * (sem tolerância).
   */
  async calculateDailyBalance(record: TimeRecord): Promise<number> {
    const isHoliday = await HolidayService.isHoliday(record.date);

    const settings = await prisma.settings.findUnique({
      where: { userId: record.userId }
    });
    const strictTolerance = settings?.strictTolerance ?? false;
    const countPontes = (settings as any)?.countPontes ?? true;
    const week = this.normalizeSchedule((settings as any)?.schedule);
    const daySched = this.getDaySchedule(record.date, week);

    // Garante que os eventos de plantão estejam carregados. Vários chamadores
    // (punch, recalculate) passam o registro sem o include, então buscamos aqui
    // para não zerar o saldo de plantão por engano.
    const events: any[] = (record as any).plantaoEvents
      ?? await prisma.plantaoEvent.findMany({ where: { timeRecordId: record.id } });
    const recordWithEvents = { ...record, plantaoEvents: events } as TimeRecord & { plantaoEvents?: any[] };

    // Horas extras de plantão lançadas em qualquer dia são somadas por cima.
    const plantaoExtra = this.sumPlantaoMinutes(events);

    // --- Plantão: carga esperada = 0, qualquer trabalho é HE (100%) ---
    if (record.isPlantao) {
      const worked = this.calculateWorkedMinutes(recordWithEvents);
      // Falta + plantão: a falta desconta a jornada e o plantão soma por cima.
      if (record.isAbsence && !(record as any).isJustified) {
        return -this.getExpectedMinutes(record.date, isHoliday, daySched) + worked;
      }
      return worked;
    }

    // --- Ponte de feriado: você folga, mas "deve" a jornada daquele dia.
    // O dia desconta as horas esperadas do banco; se o saldo total não cobrir,
    // a diferença vira dias de férias (projeção feita no cliente/endpoint). ---
    if (record.isPonte) {
      // Se o usuário optou por não contabilizar pontes, o dia não desconta.
      if (!countPontes) return plantaoExtra;
      return -this.getExpectedMinutes(record.date, isHoliday, daySched) + plantaoExtra;
    }

    // --- Falta Justificada: não desconta nada ---
    if (record.isAbsence && (record as any).isJustified) {
      return plantaoExtra;
    }

    // --- Falta: desconta a jornada completa esperada ---
    if (record.isAbsence) {
      return -this.getExpectedMinutes(record.date, isHoliday, daySched) + plantaoExtra;
    }

    // Feriado marcado à mão (ex.: municipal) zera a jornada do dia comum. Falta e ponte
    // acima seguem usando a jornada real, para manter o desconto que Igor lança de propósito.
    const expectedMinutes = (record as any).isHoliday
      ? 0
      : this.getExpectedMinutes(record.date, isHoliday, daySched);

    // Dia sem jornada (fds/feriado/dia desativado) → carga 0, trabalho = HE
    if (expectedMinutes === 0) {
      return this.calculateWorkedMinutes(recordWithEvents) + plantaoExtra;
    }

    // --- Dia útil normal: aplica tolerância CLT (+ plantão extra, se houver) ---
    const toleranceResult = this.applyToleranceRules(record, record.date, isHoliday, strictTolerance, daySched);
    return toleranceResult.balanceDiff + plantaoExtra;
  }

  // -------------------------------------------------------------------------
  // Jornada configurável
  // -------------------------------------------------------------------------

  /** Normaliza o JSON salvo em Settings.schedule; inválido → jornada padrão. */
  normalizeSchedule(raw: unknown): DaySchedule[] {
    if (!Array.isArray(raw)) return DEFAULT_WEEK_SCHEDULE;
    const byKey = new Map<string, any>();
    for (const item of raw) {
      if (item && typeof item.key === 'string') byKey.set(item.key, item);
    }
    return DEFAULT_WEEK_SCHEDULE.map(def => {
      const s = byKey.get(def.key);
      if (!s) return def;
      return {
        key: def.key,
        enabled: Boolean(s.enabled),
        entrada: typeof s.entrada === 'string' && /^\d{1,2}:\d{2}$/.test(s.entrada) ? s.entrada : def.entrada,
        saida: typeof s.saida === 'string' && /^\d{1,2}:\d{2}$/.test(s.saida) ? s.saida : def.saida,
        almoco: Number.isFinite(Number(s.almoco)) ? Math.max(0, Number(s.almoco)) : def.almoco,
      };
    });
  }

  /** Config do dia da semana correspondente à data (UTC, como salvo no banco). */
  getDaySchedule(date: Date, week: DaySchedule[]): DaySchedule {
    const key = DOW_KEYS[date.getUTCDay()];
    return week.find(d => d.key === key) ?? DEFAULT_WEEK_SCHEDULE[0];
  }

  private parseHHMM(hhmm: string): { h: number; m: number } {
    const [h, m] = hhmm.split(':').map(Number);
    return { h: h || 0, m: m || 0 };
  }

  // -------------------------------------------------------------------------
  // Tolerância CLT / Súmula 366
  // -------------------------------------------------------------------------

  /**
   * Aplica a tolerância configurada:
   * Para cada batida (Entrada, Saída e Duração do Almoço), se a variação for menor ou igual
   * a 10 minutos, a batida é "ajustada" para o horário esperado, ignorando aquela variação.
   * Se a variação for maior que 10 minutos, ela é contabilizada integralmente.
   */
  applyToleranceRules(
    record: TimeRecord,
    date: Date,
    isHoliday: boolean,
    strictTolerance: boolean,
    daySched?: DaySchedule
  ): ToleranceResult {
    const schedule = this.getExpectedSchedule(date, isHoliday, daySched);
    const expectedMinutes = this.getExpectedMinutes(date, isHoliday, daySched);
    const expectedLunch = daySched?.enabled ? daySched.almoco : 60;
    const rawWorkedMinutes = this.calculateWorkedMinutes(record, expectedLunch);

    // Se o dia não está concluído, não aplicamos a tolerância ainda
    if (record.status === 'OPEN') {
      return {
        balanceDiff: rawWorkedMinutes - expectedMinutes,
        totalAbsoluteVariation: 0,
        toleranceApplied: false,
        variations: [],
      };
    }

    let clampedPunchIn = record.punchIn;
    let clampedPunchOut = record.punchOut;
    const variations: number[] = [];
    let totalAbsoluteVariation = 0;

    // 1. Entrada (punchIn)
    if (record.punchIn) {
      const diffIn = this.diffMinutes(record.punchIn, schedule.punchIn);
      variations.push(diffIn);
      totalAbsoluteVariation += Math.abs(diffIn);
      if (!strictTolerance && Math.abs(diffIn) <= TOLERANCE_PER_PUNCH_MINUTES) {
        clampedPunchIn = schedule.punchIn;
      }
    }

    // 2. Saída (punchOut)
    if (record.punchOut) {
      const diffOut = this.diffMinutes(record.punchOut, schedule.punchOut);
      variations.push(diffOut);
      totalAbsoluteVariation += Math.abs(diffOut);
      if (!strictTolerance && Math.abs(diffOut) <= TOLERANCE_PER_PUNCH_MINUTES) {
        clampedPunchOut = schedule.punchOut;
      }
    }

    // Calcular worked minutes com os valores de entrada/saída ajustados
    const clampedRecord = {
      ...record,
      punchIn: clampedPunchIn,
      punchOut: clampedPunchOut,
    };
    
    let totalWorked = this.calculateWorkedMinutes(clampedRecord, expectedLunch);
    
    // 3. Almoço (variação da duração total em relação ao intervalo esperado)
    if (record.lunchStart && record.lunchEnd) {
      const originalLunchDuration = this.diffMinutes(record.lunchEnd, record.lunchStart);
      const lunchVariation = originalLunchDuration - expectedLunch;
      variations.push(lunchVariation);
      totalAbsoluteVariation += Math.abs(lunchVariation);
      
      if (!strictTolerance && Math.abs(lunchVariation) <= TOLERANCE_PER_PUNCH_MINUTES) {
        totalWorked += lunchVariation;
      }
    }

    // Se for o modelo ESTRITO (Súmula 366), usamos a regra do Gatilho Diário
    if (strictTolerance) {
      if (totalAbsoluteVariation <= TOLERANCE_DAILY_MAX_MINUTES) {
        return {
          balanceDiff: 0,
          totalAbsoluteVariation,
          toleranceApplied: true,
          variations,
        };
      } else {
        // Tolerância anulada
        return {
          balanceDiff: rawWorkedMinutes - expectedMinutes,
          totalAbsoluteVariation,
          toleranceApplied: false,
          variations,
        };
      }
    }

    // Se for o modelo FLEXÍVEL (o mais usado)
    return {
      balanceDiff: totalWorked - expectedMinutes,
      totalAbsoluteVariation,
      toleranceApplied: true,
      variations,
    };
  }

  // -------------------------------------------------------------------------
  // Horários esperados (jornada padrão)
  // -------------------------------------------------------------------------

  /**
   * Retorna os horários esperados do dia como Date completos, com base na
   * jornada configurada (Settings.schedule) ou na padrão de 44h.
   *
   * O app foca no horário do Brasil (UTC-3): 08:00 BRT = 11:00 UTC.
   * Para feriados/dias sem jornada retorna todos em 00:00.
   */
  getExpectedSchedule(date: Date, isHoliday: boolean, daySched?: DaySchedule): ExpectedSchedule {
    const sched = daySched ?? this.getDaySchedule(date, DEFAULT_WEEK_SCHEDULE);

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    // Feriado ou dia sem jornada configurada → sem horários esperados
    if (isHoliday || !sched.enabled) {
      const midnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
      return {
        punchIn: midnight,
        lunchStart: midnight,
        lunchEnd: midnight,
        punchOut: midnight,
      };
    }

    const inT = this.parseHHMM(sched.entrada);
    const outT = this.parseHHMM(sched.saida);
    const punchIn = new Date(Date.UTC(year, month, day, inT.h + 3, inT.m, 0));
    const punchOut = new Date(Date.UTC(year, month, day, outT.h + 3, outT.m, 0));

    // Almoço de referência: meio da jornada, com a duração configurada
    const midMs = punchIn.getTime() + (punchOut.getTime() - punchIn.getTime() - sched.almoco * 60000) / 2;
    const lunchStart = new Date(midMs);
    const lunchEnd = new Date(midMs + sched.almoco * 60000);

    return { punchIn, lunchStart, lunchEnd, punchOut };
  }

  // -------------------------------------------------------------------------
  // Cálculo bruto de minutos trabalhados
  // -------------------------------------------------------------------------

  /**
   * Diferença em minutos tratando as batidas como "no minuto".
   *
   * As batidas são gravadas com os segundos do relógio; o `differenceInMinutes`
   * padrão trunca a fração e enviesa o saldo para baixo, gerando os "−1/−2 min"
   * mesmo com horários corretos. Zeramos os segundos dos dois lados antes de
   * subtrair, de forma que o cálculo bata exatamente com os HH:MM exibidos.
   * (Também corrige registros antigos ao rodar o "Recalcular".)
   */
  private diffMinutes(a: Date, b: Date): number {
    const floor = (d: Date) => { const x = new Date(d); x.setSeconds(0, 0); return x; };
    return differenceInMinutes(floor(a), floor(b));
  }

  /** Soma a duração (min) de todos os eventos de plantão já finalizados. */
  private sumPlantaoMinutes(events?: any[]): number {
    if (!events || events.length === 0) return 0;
    let total = 0;
    for (const event of events) {
      if (event.startTime && event.endTime) {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        if (end < start) {
          end.setDate(end.getDate() + 1); // Cruzou a meia-noite
        }
        total += this.diffMinutes(end, start);
      }
    }
    return total;
  }

  calculateWorkedMinutes(record: TimeRecord & { punches?: Date[], plantaoEvents?: any[] }, lunchDeduction: number = 60): number {
    if (record.isPlantao && record.plantaoEvents && record.plantaoEvents.length > 0) {
      return this.sumPlantaoMinutes(record.plantaoEvents);
    }

    // Agrupa todos os pontos, do legado e do novo array, e ordena cronologicamente
    const allPunches = [
      record.punchIn,
      record.lunchStart,
      record.lunchEnd,
      record.punchOut,
      ...(record.punches || [])
    ].filter((p): p is Date => p !== null && p !== undefined)
     .sort((a, b) => a.getTime() - b.getTime());

    let total = 0;

    // Soma os pares (0-1, 2-3, 4-5...)
    for (let i = 0; i < allPunches.length - 1; i += 2) {
      total += this.diffMinutes(allPunches[i + 1], allPunches[i]);
    }

    // Se for um dia normal, expediente encerrado (punchOut ou status CLOSED), e só tiver 2 marcações,
    // significa que a pessoa não bateu ponto de almoço, então deduzimos o intervalo esperado.
    if (!record.isPlantao && allPunches.length === 2 && (record.punchOut || record.status === 'CLOSED')) {
      total -= lunchDeduction;
    }

    return total > 0 ? total : 0;
  }

  // -------------------------------------------------------------------------
  // Carga horária esperada do dia (em minutos)
  // -------------------------------------------------------------------------

  private getExpectedMinutes(date: Date, isHoliday: boolean, daySched?: DaySchedule): number {
    if (isHoliday) return 0; // Feriado nunca tem jornada esperada

    const sched = daySched ?? this.getDaySchedule(date, DEFAULT_WEEK_SCHEDULE);
    if (!sched.enabled) return 0; // Dia sem jornada configurada (fds, folga)

    const inT = this.parseHHMM(sched.entrada);
    const outT = this.parseHHMM(sched.saida);
    const span = (outT.h * 60 + outT.m) - (inT.h * 60 + inT.m);
    return Math.max(0, span - sched.almoco);
  }

  // -------------------------------------------------------------------------
  // Resumo semanal
  // -------------------------------------------------------------------------

  /**
   * Pega o saldo da semana atual
   */
  async getWeeklySummary(userId: string, currentDate: Date) {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Segunda
    const end = endOfWeek(currentDate, { weekStartsOn: 1 }); // Domingo

    const records = await prisma.timeRecord.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        }
      }
    });

    let balanceDiffTotal = 0;
    records.forEach(r => balanceDiffTotal += r.balanceDiff);

    return {
      records,
      balanceDiffTotal
    };
  }
}
