import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { workedMinutes, formatHm, bankTotals } from '@/lib/records';

interface Props {
  records: any[];
  pendingCount: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dkey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const HistorySummary = ({ records, pendingCount }: Props) => {
  const data = useMemo(() => {
    const byDate = new Map<string, any>();
    records.forEach(r => { if (r.date && !r.isGhost) byDate.set(r.date.substring(0, 10), r); });

    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth();

    // Série dos últimos 7 dias (horas trabalhadas por dia)
    const series: { label: string; min: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const rec = byDate.get(dkey(d));
      series.push({ label: dkey(d), min: rec ? workedMinutes(rec) : 0 });
    }
    const worked7 = series.filter(s => s.min > 0);
    const avg7 = worked7.length ? Math.round(worked7.reduce((a, s) => a + s.min, 0) / worked7.length) : 0;

    // Métricas do mês corrente
    let saldoMes = 0, extraMes = 0, plantoes = 0, workedMonthTotal = 0, workedMonthDays = 0, debitoPontes = 0, pontesCount = 0;
    records.forEach(r => {
      if (!r.date || r.isGhost) return;
      const dt = new Date(`${r.date.substring(0, 10)}T00:00:00`);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo) return;
      const bal = r.balanceDiff || 0;
      saldoMes += bal;
      if (bal > 0) extraMes += bal;
      if (r.isPlantao) plantoes++;
      if (r.isPonte) { debitoPontes += bal; pontesCount++; }
      const w = workedMinutes(r);
      if (w > 0) { workedMonthTotal += w; workedMonthDays++; }
    });
    const avgDiaMes = workedMonthDays ? Math.round(workedMonthTotal / workedMonthDays) : 0;

    const total = bankTotals(records);
    return { total, series, avg7, saldoMes, extraMes, plantoes, avgDiaMes, debitoPontes, pontesCount };
  }, [records]);

  // Geometria do gráfico de área
  const W = 300, H = 96, P = 6;
  const maxMin = Math.max(60, ...data.series.map(s => s.min));
  const stepX = (W - P * 2) / (data.series.length - 1);
  const xy = (i: number, min: number) => {
    const x = P + i * stepX;
    const yv = H - P - (min / maxMin) * (H - P * 2);
    return [x, yv] as const;
  };
  const linePath = data.series.map((s, i) => { const [x, yv] = xy(i, s.min); return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yv.toFixed(1)}`; }).join(' ');
  const areaPath = `${linePath} L${(P + (data.series.length - 1) * stepX).toFixed(1)},${H - P} L${P},${H - P} Z`;
  const avgY = H - P - (data.avg7 / maxMin) * (H - P * 2);

  const kpis = [
    { label: 'Média/dia (7d)', value: data.avg7 > 0 ? formatHm(data.avg7) : '—', color: 'text-white' },
    { label: 'Horas extras (mês)', value: data.extraMes > 0 ? `+ ${formatHm(data.extraMes)}` : '—', color: 'text-success' },
    { label: 'Média/dia (mês)', value: data.avgDiaMes > 0 ? formatHm(data.avgDiaMes) : '—', color: 'text-white' },
    { label: 'Saldo do mês', value: data.saldoMes === 0 ? 'Em dia' : `${data.saldoMes > 0 ? '+ ' : '- '}${formatHm(data.saldoMes)}`, color: data.saldoMes === 0 ? 'text-textSecondary' : data.saldoMes > 0 ? 'text-success' : 'text-danger' },
    { label: 'Plantões (mês)', value: String(data.plantoes), color: 'text-primary' },
    { label: 'Débito em pontes', value: data.debitoPontes < 0 ? `- ${formatHm(data.debitoPontes)}` : '—', color: data.debitoPontes < 0 ? 'text-danger' : 'text-textSecondary' },
    { label: 'Pendências', value: String(pendingCount), color: pendingCount > 0 ? 'text-danger' : 'text-success' },
  ];

  const t = data.total;
  const sgn = (m: number) => (m === 0 ? 'Em dia' : `${m > 0 ? '+ ' : '- '}${formatHm(m)}`);
  const totais = [
    { label: 'Saldo total do banco', value: sgn(t.saldo), color: t.saldo >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Saldo positivo (total)', value: t.positivo > 0 ? `+ ${formatHm(t.positivo)}` : '—', color: 'text-success' },
    { label: `Pontes (${t.pontesDias} dias)`, value: t.pontes < 0 ? `- ${formatHm(t.pontes)}` : '—', color: t.pontes < 0 ? 'text-danger' : 'text-textSecondary' },
    { label: 'Horas trabalhadas (total)', value: t.trabalhado > 0 ? formatHm(t.trabalhado) : '—', color: 'text-white' },
  ];

  return (
    <div className="space-y-4">
      {/* Totais de todo o banco (sem o dia aberto) */}
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wider text-textSecondary">Banco inteiro · sem o dia aberto</p>
        <div className="grid grid-cols-2 gap-2.5">
          {totais.map(k => (
            <Card key={k.label} className="gap-0 border-white/10 bg-white/[0.03] py-3 shadow-none">
              <div className="px-3.5">
                <p className="text-[10px] uppercase tracking-wider text-textSecondary truncate">{k.label}</p>
                <p className={cn('mt-1 text-base font-semibold tabular-nums truncate', k.color)}>{k.value}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Gráfico de horas trabalhadas (últimos 7 dias) */}
      <Card className="gap-0 border-white/10 bg-white/[0.03] py-4 shadow-none">
        <div className="px-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-wider text-textSecondary">Horas trabalhadas · 7 dias</p>
            <p className="text-sm font-semibold text-white tabular-nums">
              média {data.avg7 > 0 ? formatHm(data.avg7) : '—'}
            </p>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" preserveAspectRatio="none" style={{ height: '96px' }}>
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {data.avg7 > 0 && (
              <line x1={P} y1={avgY} x2={W - P} y2={avgY} stroke="var(--color-textSecondary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            )}
            <path d={areaPath} fill="url(#areaFill)" />
            <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </Card>

      {/* KPIs do mês */}
      <div className="grid grid-cols-2 gap-2.5">
        {kpis.map(k => (
          <Card key={k.label} className="gap-0 border-white/10 bg-white/[0.03] py-3 shadow-none">
            <div className="px-3.5">
              <p className="text-[10px] uppercase tracking-wider text-textSecondary truncate">{k.label}</p>
              <p className={cn('mt-1 text-base font-semibold tabular-nums truncate', k.color)}>{k.value}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
