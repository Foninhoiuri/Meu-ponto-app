import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { workedMinutes, dayCategory, isWithinTolerance } from '@/lib/records';

interface Props {
  records: any[];
  holidays: string[];
  onSelectDay: (recordId: string) => void;
}

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const weekInitials = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Cor por categoria (mesma linguagem dos cards recentes)
const catColor: Record<string, string> = {
  plantao: 'text-primary',
  ponte: 'text-primary',
  extra: 'text-success',
  debito: 'text-danger',
  normal: 'text-white',
};

export const HistoryCalendar = ({ records, holidays, onSelectDay }: Props) => {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const byDate = useMemo(() => {
    const map = new Map<string, any>();
    records.forEach(r => {
      if (r.date && !r.isGhost) map.set(r.date.substring(0, 10), r);
    });
    return map;
  }, [records]);

  const todayStr = (() => { const n = new Date(); return key(n.getFullYear(), n.getMonth(), n.getDate()); })();

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startDow = first.getDay(); // 0=Dom
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: ({ day: number; dateStr: string } | null)[] = [];
    for (let i = 0; i < startDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push({ day: d, dateStr: key(cursor.y, cursor.m, d) });
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const move = (delta: number) => {
    setCursor(c => {
      const nm = c.m + delta;
      return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  };

  return (
    <div>
      {/* Navegação do mês */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => move(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center text-textSecondary hover:text-white transition-colors">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-white">{monthNames[cursor.m]} {cursor.y}</span>
        <button onClick={() => move(1)} className="w-9 h-9 rounded-full glass flex items-center justify-center text-textSecondary hover:text-white transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {weekInitials.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-textSecondary">{w}</div>
        ))}
      </div>

      {/* Grade */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const rec = byDate.get(cell.dateStr);
          const isHoliday = holidays.includes(cell.dateStr);
          const isToday = cell.dateStr === todayStr;
          const worked = rec ? workedMinutes(rec) : 0;
          const cat = rec ? dayCategory(rec) : null;
          const tol = rec ? isWithinTolerance(rec) : false;
          const h = Math.floor(worked / 60);
          const min = worked % 60;

          return (
            <button
              key={i}
              disabled={!rec}
              onClick={() => rec && onSelectDay(rec.id)}
              className={cn(
                'aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors',
                rec
                  ? (rec.isAbsence
                      ? 'border-danger/40 bg-danger/20 hover:bg-danger/30 cursor-pointer'
                      : (rec.isPonte || tol)
                        ? 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/[0.16] cursor-pointer'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer')
                  : 'border-transparent',
                // Feriado tem prioridade visual (roxo) em dias sem registro
                isHoliday && !rec && 'border-purple-500/30 bg-purple-500/15',
                isToday && 'ring-1 ring-primary/60'
              )}
            >
              <span className={cn('text-[11px] font-semibold', isHoliday && !rec ? 'text-purple-300' : rec ? 'text-white' : 'text-textSecondary/60')}>
                {cell.day}
              </span>
              {rec ? (
                rec.isAbsence ? (
                  <span className="text-[8px] font-semibold text-white leading-none">falta</span>
                ) : rec.isPonte ? (
                  <span className="text-[8px] font-semibold text-danger leading-none tabular-nums">
                    {(rec.balanceDiff || 0) < 0
                      ? `${Math.floor(Math.abs(rec.balanceDiff) / 60)}h${Math.abs(rec.balanceDiff) % 60 > 0 ? pad(Math.abs(rec.balanceDiff) % 60) : ''}`
                      : 'folga'}
                  </span>
                ) : worked > 0 ? (
                  <span className={cn('text-[8px] font-semibold leading-none tabular-nums', tol ? 'text-amber-400' : cat ? catColor[cat] : 'text-white')}>
                    {h}h{min > 0 ? pad(min) : ''}
                  </span>
                ) : (
                  <span className="w-1 h-1 rounded-full bg-textSecondary/50" />
                )
              ) : isHoliday ? (
                <span className="text-[7px] font-semibold text-purple-300 leading-none">feriado</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-textSecondary">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> Hora extra</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger" /> Débito</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Tolerância</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Plantão/Ponte</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Feriado</span>
      </div>
    </div>
  );
};
