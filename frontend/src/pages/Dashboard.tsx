import { useState, useEffect, useMemo } from 'react';
import { Settings, Clock, Coffee, List, AlertTriangle } from 'lucide-react';
import { BigPunchButton, glassActionBase } from '../components/ui/BigPunchButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Toast } from '../components/ui/Toast';
import { HistoryModal } from '../components/history/HistoryModal';
import { SettingsModal } from '../components/settings/SettingsModal';
import { PlantaoEventsEditor } from '../components/history/PlantaoEventsEditor';
import { RecentDaysCards } from '../components/history/RecentDaysCards';
import { Badge } from '../components/ui/Badge';
import { Card } from '@/components/ui/card';

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>('todos');
  const [historyTargetId, setHistoryTargetId] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openHistory = (filter: string = 'todos', targetId?: string) => {
    setHistoryFilter(filter);
    setHistoryTargetId(targetId);
    setIsHistoryOpen(true);
  };
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  // Relógio que atualiza a cada 30s para manter o contador de fim de expediente vivo
  const [now, setNow] = useState(() => new Date());
  const [punchFx, setPunchFx] = useState(0); // dispara a animação de sucesso no botão

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isPonteCandidate = (dateStr: string, holidays: string[]) => {
    const date = new Date(`${dateStr.substring(0, 10)}T00:00:00Z`);
    const dayOfWeek = date.getUTCDay();

    // Fim de semana não é ponte
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    // Feriado em si não é "ponte" (já é folga natural)
    if (holidays.includes(dateStr.substring(0, 10))) return false;

    // Verifica se este dia útil fica entre um feriado e o fim de semana
    // Olha para trás: existe um feriado (em dia útil) antes deste dia,
    // com apenas feriados/fds entre ele e este dia?
    // Olha para frente: depois deste dia, o próximo dia é fds ou feriado?

    // Checa para trás (até 5 dias): todos os dias entre este e o feriado devem ser feriado ou fds
    let foundHolidayBefore = false;
    for (let i = 1; i <= 5; i++) {
      const prev = new Date(date);
      prev.setUTCDate(date.getUTCDate() - i);
      const prevStr = prev.toISOString().substring(0, 10);
      const prevDow = prev.getUTCDay();
      if (prevDow === 0 || prevDow === 6) continue; // fds, pula
      if (holidays.includes(prevStr)) { foundHolidayBefore = true; break; }
      break; // dia útil normal → para
    }

    // Checa para frente (até 5 dias): todos os dias entre este e o fds devem ser feriado ou ponte
    let reachesWeekend = false;
    for (let i = 1; i <= 5; i++) {
      const next = new Date(date);
      next.setUTCDate(date.getUTCDate() + i);
      const nextStr = next.toISOString().substring(0, 10);
      const nextDow = next.getUTCDay();
      if (nextDow === 0 || nextDow === 6) { reachesWeekend = true; break; }
      if (holidays.includes(nextStr)) continue; // feriado, pula
      break; // dia útil normal → para
    }

    if (foundHolidayBefore && reachesWeekend) return true;

    // Caso inverso: feriado está para frente e fds está para trás
    let foundHolidayAfter = false;
    for (let i = 1; i <= 5; i++) {
      const next = new Date(date);
      next.setUTCDate(date.getUTCDate() + i);
      const nextStr = next.toISOString().substring(0, 10);
      const nextDow = next.getUTCDay();
      if (nextDow === 0 || nextDow === 6) continue;
      if (holidays.includes(nextStr)) { foundHolidayAfter = true; break; }
      break;
    }

    let reachesWeekendBefore = false;
    for (let i = 1; i <= 5; i++) {
      const prev = new Date(date);
      prev.setUTCDate(date.getUTCDate() - i);
      const prevDow = prev.getUTCDay();
      if (prevDow === 0 || prevDow === 6) { reachesWeekendBefore = true; break; }
      if (holidays.includes(prev.toISOString().substring(0, 10))) continue;
      break;
    }

    if (foundHolidayAfter && reachesWeekendBefore) return true;

    return false;
  };

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/records?userId=default-user-id');
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro ao conectar ao servidor de banco de dados.', type: 'error' });
    }
  };

  useEffect(() => {
    fetchRecords();
    fetch(`/api/holidays/${new Date().getFullYear()}`)
      .then(res => res.json())
      .then(data => setHolidays(data))
      .catch(console.error);
  }, []);

  // Helper to format local date string YYYY-MM-DD
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayRecord = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    return records.find(r => {
      const rDate = r.date.substring(0, 10);
      return rDate === todayStr;
    });
  }, [records]);

  const status = useMemo(() => {
    if (!todayRecord) return 'OPEN';

    if (todayRecord.isPlantao) {
      if (todayRecord.plantaoEvents && todayRecord.plantaoEvents.length > 0) {
        const hasOpen = todayRecord.plantaoEvents.some((e: any) => !e.endTime);
        return hasOpen ? 'PLANTAO_WORKING' : 'PLANTAO_OPEN';
      }
      return 'PLANTAO_OPEN';
    }

    if (!todayRecord.punchIn) return 'OPEN';
    if (todayRecord.punchOut) return 'CLOSED';
    if (todayRecord.lunchStart && !todayRecord.lunchEnd) return 'LUNCH';
    return 'WORKING';
  }, [todayRecord]);

  const lunchCountdown = useMemo(() => {
    if (!todayRecord) return null;
    if (status !== 'LUNCH' || !todayRecord.lunchStart) return null;

    const dateStr = todayRecord.date.substring(0, 10);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=Dom..6=Sáb

    const DOW_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    let almoco = 60; // 60 minutos de almoço padrão
    let enabled = dow !== 0 && dow !== 6;
    try {
      const raw = localStorage.getItem('work_schedule');
      if (raw) {
        const sched = JSON.parse(raw).find((s: any) => s.key === DOW_KEYS[dow]);
        if (sched) {
          enabled = Boolean(sched.enabled);
          almoco = sched.almoco !== undefined ? sched.almoco : almoco;
        }
      }
    } catch { /* usa fallback */ }
    if (!enabled || almoco === 0) return null;

    const lunchStart = new Date(todayRecord.lunchStart);
    const targetEnd = new Date(lunchStart.getTime() + almoco * 60000);

    const remainingMin = Math.round((targetEnd.getTime() - now.getTime()) / 60000);
    const endLabel = `${String(targetEnd.getHours()).padStart(2, '0')}:${String(targetEnd.getMinutes()).padStart(2, '0')}`;
    return { remainingMin, endLabel, done: remainingMin <= 0 };
  }, [todayRecord, status, now]);

  // Ideia 1: tempo restante até o fim do expediente, usando a jornada
  // configurada em Ajustes (work_schedule). Chegou tarde → fim proporcional
  // (entrada + duração da jornada); chegou cedo → mira o fim do turno normal.
  const shiftCountdown = useMemo(() => {
    if (!todayRecord || todayRecord.isPlantao || todayRecord.isPonte) return null;
    if (!todayRecord.punchIn) return null;
    if (status !== 'WORKING' && status !== 'LUNCH') return null;

    const dateStr = todayRecord.date.substring(0, 10);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=Dom..6=Sáb
    if (holidays.includes(dateStr)) return null;

    // Jornada do dia (configurável) — fallback: seg-qui 08-18, sex 08-17
    const DOW_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    let entrada = '08:00';
    let saida = dow === 5 ? '17:00' : '18:00';
    let enabled = dow !== 0 && dow !== 6;
    try {
      const raw = localStorage.getItem('work_schedule');
      if (raw) {
        const sched = JSON.parse(raw).find((s: any) => s.key === DOW_KEYS[dow]);
        if (sched) {
          enabled = Boolean(sched.enabled);
          entrada = sched.entrada || entrada;
          saida = sched.saida || saida;
        }
      }
    } catch { /* usa fallback */ }
    if (!enabled) return null;

    const toMin = (s: string) => { const [h, mi] = s.split(':').map(Number); return (h || 0) * 60 + (mi || 0); };
    const [sh, sm] = saida.split(':').map(Number);
    const normalEnd = new Date(y, m - 1, d, sh || 18, sm || 0, 0, 0);
    const fullSpanMin = toMin(saida) - toMin(entrada); // jornada + almoço
    const punchIn = new Date(todayRecord.punchIn);
    const shiftedEnd = new Date(punchIn.getTime() + fullSpanMin * 60000);
    const targetEnd = shiftedEnd > normalEnd ? shiftedEnd : normalEnd;

    const remainingMin = Math.round((targetEnd.getTime() - now.getTime()) / 60000);
    const endLabel = `${String(targetEnd.getHours()).padStart(2, '0')}:${String(targetEnd.getMinutes()).padStart(2, '0')}`;
    return { remainingMin, endLabel, done: remainingMin <= 0 };
  }, [todayRecord, status, holidays, now]);

  const pendingDaysCount = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    let count = 0;

    // Check real records
    records.forEach(r => {
      const isPast = r.date.substring(0, 10) !== todayStr && new Date(r.date.substring(0, 10)) < new Date(todayStr);
      if (!isPast) return;

      if (r.isPlantao) {
        const hasPunches = r.punches && r.punches.length > 0;
        const hasEvents = r.plantaoEvents && r.plantaoEvents.length > 0;
        if (hasEvents && r.plantaoEvents.some((e: any) => !e.endTime)) count++;
        else if (hasPunches && r.punches.length % 2 !== 0) count++;
      } else {
        const dt = new Date(`${r.date.substring(0, 10)}T00:00:00Z`);
        const isWeekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
        const isHoliday = holidays.includes(r.date.substring(0, 10));
        const isPonte = isPonteCandidate(r.date, holidays);

        if (r.status === 'OPEN') count++;
        else if ((r.lunchStart && !r.lunchEnd) || (!r.lunchStart && r.lunchEnd)) {
          if (!isWeekend && !isHoliday && !isPonte) count++;
        }
      }
    });

    return count;
  }, [records, holidays]);

  const balance = useMemo(() => {
    let totalMinutes = 0;
    records.forEach(r => {
      totalMinutes += r.balanceDiff || 0;
    });
    const isNegative = totalMinutes < 0;
    let absMin = Math.abs(totalMinutes);
    
    const y = Math.floor(absMin / (60 * 24 * 30 * 12));
    absMin %= (60 * 24 * 30 * 12);
    const mo = Math.floor(absMin / (60 * 24 * 30));
    absMin %= (60 * 24 * 30);
    const d = Math.floor(absMin / (60 * 24));
    absMin %= (60 * 24);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;

    const parts = [];
    if (y > 0) parts.push(`${y}a`);
    if (mo > 0) parts.push(`${mo}m`);
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || parts.length > 0) parts.push(`${h}h`);
    parts.push(`${m.toString().padStart(2, '0')}m`);

    const formatted = parts.join(' ');
    
    // Lógica de banco de horas (Dias/Semanas/Meses)
    const minutesPerDay = 480;
    const minutesPerWeek = 2400;
    const minutesPerMonth = 9600;

    let daysWeeksMonths = '';
    if (Math.abs(totalMinutes) >= minutesPerDay) {
      let remaining = Math.abs(totalMinutes);
      const months = Math.floor(remaining / minutesPerMonth);
      remaining %= minutesPerMonth;
      const weeks = Math.floor(remaining / minutesPerWeek);
      remaining %= minutesPerWeek;
      const days = Math.floor(remaining / minutesPerDay);

      const dwmParts = [];
      if (months > 0) dwmParts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
      if (weeks > 0) dwmParts.push(`${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`);
      if (days > 0) dwmParts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);

      daysWeeksMonths = dwmParts.join(' e ');
      if (isNegative) daysWeeksMonths = '- ' + daysWeeksMonths;
    }
    
    // Projeção de férias: saldo negativo vira dias de férias (1 dia = 8h)
    const minutesPerVacationDay = 480;
    const vacationDaysAtRisk = isNegative
      ? Math.ceil((Math.abs(totalMinutes) / minutesPerVacationDay) * 2) / 2
      : 0;

    return {
      formatted,
      isPositive: !isNegative,
      daysWeeksMonths,
      isZero: totalMinutes === 0,
      vacationDaysAtRisk,
    };
  }, [records]);

  const handlePunch = async () => {
    let type: 'IN' | 'OUT' | 'LUNCH_END' | 'LUNCH_START' | null = null;
    let message = '';
    
    if (status === 'OPEN') {
      type = 'IN';
      message = 'Entrada registrada com sucesso!';
    } else if (status === 'WORKING') {
      type = 'OUT';
      message = 'Expediente finalizado. Bom descanso!';
    } else if (status === 'LUNCH') {
      type = 'LUNCH_END';
      message = 'Volta do almoço registrada.';
    } else if (status === 'PLANTAO_OPEN') {
      type = 'IN';
      message = 'Saída de plantão iniciada!';
    } else if (status === 'PLANTAO_WORKING') {
      type = 'OUT';
      message = 'Saída de plantão finalizada!';
    }

    if (!type) return;

    try {
      const res = await fetch('/api/records/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default-user-id',
          type,
          isPlantao: false,
        })
      });

      if (res.ok) {
        setToast({ message, type: 'success' });
        setPunchFx(k => k + 1); // animação de sucesso dentro do botão
        await fetchRecords();
      } else {
        setToast({ message: 'Erro ao registrar ponto.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão.', type: 'error' });
    }
  };

  const handleMarkPlantao = async () => {
    try {
      const res = await fetch('/api/records/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default-user-id',
          type: 'PRE_DEFINE_PLANTAO',
        })
      });

      if (res.ok) {
        setToast({ message: 'Dia marcado como Plantão.', type: 'success' });
        await fetchRecords();
      } else {
        setToast({ message: 'Erro ao marcar plantão.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão.', type: 'error' });
    }
  };

  const handleLunch = async () => {
    if (status !== 'WORKING') return;

    try {
      const res = await fetch('/api/records/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default-user-id',
          type: 'LUNCH_START',
        })
      });

      if (res.ok) {
        setToast({ message: 'Saída para almoço registrada.', type: 'info' });
        await fetchRecords();
      } else {
        setToast({ message: 'Erro ao registrar almoço.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão.', type: 'error' });
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background relative">
      {/* Toasts */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header — KPI estilo banco: saldo do banco de horas */}
      <header className="px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-1 shrink-0">
        <Card className="gap-0 border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] py-4 shadow-lg">
          <div className="px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 border border-primary/20">
                  <Clock size={15} className="text-primary" />
                </span>
                <span className="text-sm font-medium text-white/90">Banco de Horas</span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-textSecondary hover:text-white hover:bg-white/5 transition-colors"
              >
                <Settings size={17} />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              {balance.isZero ? (
                <span className="text-[2rem] leading-none font-bold tracking-tight text-white">Em dia</span>
              ) : (
                <span className="text-[2rem] leading-none font-bold tabular-nums tracking-tight text-white">
                  {balance.isPositive ? '' : '−'}{balance.formatted}
                </span>
              )}
              {!balance.isZero && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full
                  ${balance.isPositive ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                  {balance.isPositive ? '↑' : '↓'} {balance.daysWeeksMonths || (balance.isPositive ? 'positivo' : 'negativo')}
                </span>
              )}
            </div>

            {/* Alerta de férias — compacto, dentro do card */}
            {balance.vacationDaysAtRisk > 0 && (
              <button
                onClick={() => openHistory('debito')}
                className="mt-3 w-full flex items-center gap-2 rounded-xl border border-danger/15 bg-danger/10 px-3 py-2 text-left transition-colors hover:bg-danger/15"
              >
                <AlertTriangle className="text-danger flex-shrink-0" size={14} />
                <span className="text-[11px] text-white/90 leading-snug">
                  Pode custar{' '}
                  <strong className="text-danger">
                    {balance.vacationDaysAtRisk.toString().replace('.', ',')}{' '}
                    {balance.vacationDaysAtRisk === 1 ? 'dia' : 'dias'} de férias
                  </strong>{' '}
                  · ver dias
                </span>
              </button>
            )}
          </div>
        </Card>
      </header>

      {/* Ideia 2: cards compactos com os últimos dias */}
      <div className="px-5 shrink-0">
        <RecentDaysCards records={records} onOpenHistory={(id) => openHistory('todos', id)} />
      </div>

      {/* Main Action — o layout se molda aos botões (alturas garantidas) */}
      <main className="flex-1 min-h-0 flex flex-col px-5 pt-3 pb-2 gap-3">
        {status === 'LUNCH' && lunchCountdown ? (
          <div className="shrink-0 text-center animate-fade-in">
            {lunchCountdown.done ? (
              <span className="text-danger text-sm font-medium">Tempo de almoço esgotado · volte logo</span>
            ) : (
              <span className="text-textSecondary text-xs">
                Falta{' '}
                <strong className="text-white tabular-nums text-sm">
                  {Math.floor(lunchCountdown.remainingMin / 60)}h {String(lunchCountdown.remainingMin % 60).padStart(2, '0')}m
                </strong>{' '}
                de almoço · retorno ~ {lunchCountdown.endLabel}
              </span>
            )}
          </div>
        ) : shiftCountdown ? (
          <div className="shrink-0 text-center animate-fade-in">
            {shiftCountdown.done ? (
              <span className="text-success text-sm font-medium">Expediente completo · saída liberada</span>
            ) : (
              <span className="text-textSecondary text-xs">
                Falta{' '}
                <strong className="text-white tabular-nums text-sm">
                  {Math.floor(shiftCountdown.remainingMin / 60)}h {String(shiftCountdown.remainingMin % 60).padStart(2, '0')}m
                </strong>{' '}
                para o fim · saída ~ {shiftCountdown.endLabel}
              </span>
            )}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="w-full max-w-[14.5rem] aspect-square">
            <BigPunchButton status={status as any} fxKey={punchFx} onClick={handlePunch} />
          </div>
        </div>

        <div className="shrink-0 flex justify-center">
          {todayRecord?.isPlantao ? (
            <button
              onClick={() => setShowManualEditor(true)}
              className={`${glassActionBase} w-full max-w-[14.5rem] h-14 flex items-center justify-center text-sm font-semibold text-primary`}
            >
              Editar Saídas do Plantão
            </button>
          ) : status === 'OPEN' && !todayRecord ? (
            <button
              onClick={handleMarkPlantao}
              className={`${glassActionBase} w-full max-w-[14.5rem] h-14 flex items-center justify-center text-sm font-semibold text-primary`}
            >
              Hoje é dia de Plantão?
            </button>
          ) : todayRecord ? (
            <button
              onClick={() => setShowManualEditor(true)}
              className={`${glassActionBase} w-full max-w-[14.5rem] h-14 flex items-center justify-center text-sm font-semibold text-primary`}
            >
              Registrar Plantão
            </button>
          ) : null}
        </div>
      </main>

      {/* Editor de plantão (Radix Dialog) */}
      <Dialog open={Boolean(todayRecord && showManualEditor)} onOpenChange={(o) => !o && setShowManualEditor(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{todayRecord?.isPlantao ? 'Saídas do Plantão' : 'Registrar Plantão'}</DialogTitle>
            <DialogDescription>
              {todayRecord?.isPlantao
                ? 'Registre e gerencie as saídas manualmente'
                : 'Plantão avulso neste dia — somado como hora extra'}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 pb-6">
            {todayRecord && (
              <PlantaoEventsEditor
                timeRecordId={todayRecord.id}
                date={todayRecord.date}
                onToast={(message, type) => setToast({ message, type })}
                onRefresh={fetchRecords}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer Actions */}
      <footer className="shrink-0 px-8 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex justify-between items-center relative z-20">
        <button
          onClick={() => openHistory('todos')}
          className="flex flex-col items-center gap-2 text-textSecondary hover:text-white transition-colors"
        >
          <Badge.Anchor>
            <div className="w-12 h-12 rounded-full glass flex items-center justify-center">
              <List size={24} />
            </div>
            {pendingDaysCount > 0 && (
              <Badge color="danger" size="md" className="animate-pulse">
                {pendingDaysCount}
              </Badge>
            )}
          </Badge.Anchor>
          <span className="text-xs font-medium">Histórico</span>
        </button>

        {!todayRecord?.isPlantao && (
          <button 
            onClick={handleLunch}
            disabled={status !== 'WORKING'}
            className={`flex flex-col items-center gap-2 transition-colors ${
              status === 'WORKING' ? 'text-textSecondary hover:text-white' : 'text-textSecondary/30'
            }`}
          >
            <div className="w-12 h-12 rounded-full glass flex items-center justify-center">
              <Coffee size={24} />
            </div>
            <span className="text-xs font-medium">Almoço</span>
          </button>
        )}
      </footer>

      {/* Modals */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        records={records}
        onRefresh={fetchRecords}
        onToast={(message, type) => setToast({ message, type })}
        initialFilter={historyFilter}
        targetId={historyTargetId}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={onLogout}
        userId="default-user-id"
        onToast={(message, type) => setToast({ message, type })}
        onRefresh={fetchRecords}
      />
    </div>
  );
}
