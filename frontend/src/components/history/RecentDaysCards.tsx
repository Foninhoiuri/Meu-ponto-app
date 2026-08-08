import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { workedMinutes, formatHm, formatBalance, isWithinTolerance } from '@/lib/records';

interface Props {
  records: any[];
  onOpenHistory: (targetId?: string) => void;
}

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const dayLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return { wd: weekdays[date.getDay()], dm: `${d} ${months[date.getMonth()]}` };
};

export const RecentDaysCards = ({ records, onOpenHistory }: Props) => {
  const days = records.filter(r => r.date && !r.isGhost).slice(0, 7);
  if (days.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5 snap-x snap-mandatory scrollbar-none">
        {days.map(day => {
          const { wd, dm } = dayLabel(day.date);
          const worked = workedMinutes(day);
          const balance = formatBalance(day.balanceDiff || 0);
          const isPos = (day.balanceDiff || 0) > 0;
          const tol = isWithinTolerance(day);
          const bal = day.balanceDiff || 0;

          return (
            <Card
              key={day.id}
              onClick={() => onOpenHistory(day.id)}
              className={cn(
                'min-w-[116px] snap-start cursor-pointer gap-0 py-3 shadow-none transition-colors active:scale-[0.98]',
                day.isAbsence
                  ? 'border-danger/40 bg-danger/15 hover:bg-danger/20'
                  : (day.isPonte || tol)
                    ? 'border-amber-500/30 bg-amber-500/[0.08] hover:bg-amber-500/[0.12]'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              )}
            >
              <CardContent className="px-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-white">{wd}</span>
                  <span className="text-[10px] text-textSecondary">{dm}</span>
                </div>
                {day.isAbsence ? (
                  <div className="mt-2 text-sm font-semibold text-white">
                    {day.isJustified ? 'Falta just.' : 'Falta'}
                  </div>
                ) : day.isPonte ? (
                  <>
                    <div className="mt-2 text-sm font-semibold tabular-nums text-danger">
                      {bal < 0 ? formatHm(bal) : 'folga'}
                    </div>
                    <div className="mt-0.5 h-3.5">
                      <span className="text-[10px] font-medium text-amber-400">ponte</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-2 text-sm font-semibold tabular-nums text-white">
                      {worked > 0 ? formatHm(worked) : '—'}
                    </div>
                    <div className="mt-0.5 h-3.5">
                      {tol ? (
                        <span className="text-[10px] font-medium text-amber-400">
                          {balance || 'tolerância'}
                        </span>
                      ) : balance ? (
                        <span className={`text-[10px] font-medium tabular-nums ${isPos ? 'text-success' : 'text-danger'}`}>
                          {balance}
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
