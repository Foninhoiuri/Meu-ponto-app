import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, LogOut, Shield, Info, Hourglass, Copy, Check, ChevronDown, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PushToggle } from './PushToggle';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  userId: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
  onRefresh: () => void;
}

interface DaySchedule {
  key: string;
  label: string;
  enabled: boolean;
  entrada: string; // HH:MM
  saida: string;   // HH:MM
  almoco: number;  // minutos de intervalo
}

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { key: 'seg', label: 'Segunda', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'ter', label: 'Terça', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'qua', label: 'Quarta', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'qui', label: 'Quinta', enabled: true, entrada: '08:00', saida: '18:00', almoco: 60 },
  { key: 'sex', label: 'Sexta', enabled: true, entrada: '08:00', saida: '17:00', almoco: 60 },
  { key: 'sab', label: 'Sábado', enabled: false, entrada: '08:00', saida: '12:00', almoco: 0 },
  { key: 'dom', label: 'Domingo', enabled: false, entrada: '08:00', saida: '12:00', almoco: 0 },
];

const toMin = (hhmm: string) => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Minutos trabalhados no dia = (saída - entrada) - almoço
const dailyMinutes = (d: DaySchedule) => {
  if (!d.enabled) return 0;
  return Math.max(0, toMin(d.saida) - toMin(d.entrada) - (d.almoco || 0));
};

const fmtHours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
};

export const SettingsModal = ({ isOpen, onClose, onLogout, userId, onToast, onRefresh }: Props) => {
  const [copied, setCopied] = useState(false);
  const [bankValidity, setBankValidity] = useState<number>(6);
  const [strictTolerance, setStrictTolerance] = useState<boolean>(false);
  const [countPontes, setCountPontes] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [recalculateCountdown, setRecalculateCountdown] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => {
    try {
      const raw = localStorage.getItem('work_schedule');
      if (raw) return JSON.parse(raw) as DaySchedule[];
    } catch { /* usa o padrão */ }
    return DEFAULT_SCHEDULE;
  });

  const weeklyMinutes = useMemo(
    () => schedule.reduce((acc, d) => acc + dailyMinutes(d), 0),
    [schedule]
  );

  const updateDay = (key: string, patch: Partial<DaySchedule>) => {
    setSchedule(prev => {
      const next = prev.map(d => (d.key === key ? { ...d, ...patch } : d));
      try { localStorage.setItem('work_schedule', JSON.stringify(next)); } catch { /* ignore */ }
      // Persiste o total semanal calculado (silencioso)
      const hours = Math.round(next.reduce((a, d) => a + dailyMinutes(d), 0) / 60);
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, weeklyHours: hours, schedule: next }),
      }).catch(() => {});
      return next;
    });
  };

  useEffect(() => {
    if (isOpen) {
      fetch(`/api/settings?userId=${userId}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.bankValidityMonths) {
            setBankValidity(data.bankValidityMonths);
          }
          if (data && data.strictTolerance !== undefined) {
            setStrictTolerance(data.strictTolerance);
          }
          if (data && data.countPontes !== undefined) {
            setCountPontes(data.countPontes);
          }
          // Jornada salva no servidor tem precedência (sync entre dispositivos)
          if (data && Array.isArray(data.schedule) && data.schedule.length > 0) {
            setSchedule(data.schedule);
            try { localStorage.setItem('work_schedule', JSON.stringify(data.schedule)); } catch { /* ignore */ }
          }
        })
        .catch(console.error);
    }
  }, [isOpen, userId]);

  useEffect(() => {
    let timer: number;
    if (recalculateCountdown > 0) {
      timer = window.setTimeout(() => {
        setRecalculateCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => window.clearTimeout(timer);
  }, [recalculateCountdown]);

  const handleDisconnect = () => {
    if (window.confirm('Tem certeza que deseja sair e bloquear o dispositivo?')) {
      localStorage.removeItem('auth_pin');
      onLogout();
      onClose();
    }
  };

  const handleCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(userId);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = userId;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveValidity = async (months: number) => {
    setIsSaving(true);
    setBankValidity(months);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, bankValidityMonths: months })
      });
      onToast('Validade salva com sucesso', 'success');
    } catch (err) {
      console.error(err);
      onToast('Erro ao salvar validade', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTolerance = async () => {
    const newValue = !strictTolerance;
    setStrictTolerance(newValue);
    setIsSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, strictTolerance: newValue })
      });
      onToast('Modo de tolerância atualizado', 'success');
    } catch (err) {
      console.error(err);
      setStrictTolerance(!newValue);
      onToast('Erro ao atualizar modo de tolerância', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCountPontes = async () => {
    const newValue = !countPontes;
    setCountPontes(newValue);
    setIsSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, countPontes: newValue }),
      });
      // Reprocessa os saldos para as pontes passarem a (não) contar
      await fetch('/api/records/recalculate', { method: 'POST' });
      onToast(newValue ? 'Pontes voltam a descontar do banco.' : 'Pontes não descontam mais do banco.', 'success');
      onRefresh();
    } catch (err) {
      console.error(err);
      setCountPontes(!newValue);
      onToast('Erro ao salvar preferência.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (recalculateCountdown > 0) return;
    setRecalculateCountdown(10);
    try {
      const res = await fetch('/api/records/recalculate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onToast(`Banco recalculado! ${data.updatedCount} registros alterados.`, 'success');
        onRefresh();
      } else {
        onToast('Erro ao recalcular o banco', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro ao comunicar com o servidor', 'error');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[78dvh]">
        {/* Header */}
        <DialogHeader className="border-b border-white/10">
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription className="sr-only">Preferências do aplicativo</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Info items */}
          <div className="space-y-3">
            <PushToggle userId={userId} />

            {/* User ID */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2 text-textSecondary text-xs">
                <Info size={14} />
                <span>ID do Usuário</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-white/50 bg-black/20 px-2 py-0.5 rounded max-w-[120px] truncate" title={userId}>
                  {userId}
                </span>
                <button 
                  onClick={handleCopy}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-primary transition-colors"
                >
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Jornada de Trabalho — colapsável, com cálculo automático das horas */}
            <div className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden">
              <button
                onClick={() => setScheduleOpen(o => !o)}
                className="w-full flex justify-between items-center p-3"
              >
                <div className="flex items-center gap-2 text-textSecondary text-xs">
                  <Hourglass size={14} />
                  <span>Jornada de Trabalho</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{fmtHours(weeklyMinutes)}/sem</span>
                  <ChevronDown
                    size={16}
                    className={`text-textSecondary transition-transform ${scheduleOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {scheduleOpen && (
                <div className="border-t border-white/5 p-3 space-y-2">
                  <p className="text-[10px] text-textSecondary/70">
                    Defina seus horários de cada dia; o total semanal é calculado automaticamente.
                  </p>
                  {schedule.map(d => (
                    <div
                      key={d.key}
                      className={`rounded-lg border p-2 transition-colors ${
                        d.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-transparent opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.enabled}
                            onChange={e => updateDay(d.key, { enabled: e.target.checked })}
                            className="w-4 h-4 rounded border-white/10 bg-transparent text-primary focus:ring-0 focus:ring-offset-0"
                          />
                          <span className="text-xs font-medium text-white">{d.label}</span>
                        </label>
                        <span className="text-[11px] font-semibold text-primary tabular-nums">
                          {d.enabled ? fmtHours(dailyMinutes(d)) : '—'}
                        </span>
                      </div>

                      {d.enabled && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[9px] text-textSecondary block mb-0.5">Entrada</label>
                            <input
                              type="time"
                              value={d.entrada}
                              onChange={e => updateDay(d.key, { entrada: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-white text-[11px] focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-textSecondary block mb-0.5">Saída</label>
                            <input
                              type="time"
                              value={d.saida}
                              onChange={e => updateDay(d.key, { saida: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-white text-[11px] focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-textSecondary block mb-0.5">Almoço (min)</label>
                            <input
                              type="number"
                              min="0"
                              max="240"
                              value={d.almoco}
                              onChange={e => updateDay(d.key, { almoco: Number(e.target.value) })}
                              className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-white text-[11px] focus:outline-none focus:border-primary/50"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-between items-center pt-1 border-t border-white/5 mt-2">
                    <span className="text-xs text-textSecondary">Total semanal</span>
                    <span className="text-sm font-bold text-white tabular-nums">{fmtHours(weeklyMinutes)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2 text-textSecondary text-xs">
                <Hourglass size={14} />
                <span>Validade do Banco de Horas (meses)</span>
              </div>
              <input
                type="number"
                min="1"
                max="60"
                value={bankValidity}
                onChange={(e) => handleSaveValidity(Number(e.target.value))}
                disabled={isSaving}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2 text-textSecondary text-xs">
                <Info size={14} />
                <span>Versão do App</span>
              </div>
              <span className="text-xs font-semibold text-white">v1.0.0</span>
            </div>
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-textSecondary text-xs">
                  <Shield size={14} />
                  <span>Modo Estrito (Súmula 366 TST)</span>
                </div>
                <button
                  onClick={handleToggleTolerance}
                  disabled={isSaving}
                  className={`w-10 h-5 rounded-full relative transition-colors ${strictTolerance ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${strictTolerance ? 'left-[22px]' : 'left-[2px]'}`} />
                </button>
              </div>
              <p className="text-[10px] text-textSecondary/70 mt-1">
                {strictTolerance
                  ? "Soma as variações. Se o total diário passar de 10 min, contabiliza TUDO (Súmula 366)."
                  : "Ignora qualquer variação individual de batida de até 10 minutos (flexível)."}
              </p>
            </div>

            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-textSecondary text-xs">
                  <Calendar size={14} />
                  <span>Contabilizar pontes no banco</span>
                </div>
                <button
                  onClick={handleToggleCountPontes}
                  disabled={isSaving}
                  className={`w-10 h-5 rounded-full relative transition-colors ${countPontes ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${countPontes ? 'left-[22px]' : 'left-[2px]'}`} />
                </button>
              </div>
              <p className="text-[10px] text-textSecondary/70 mt-1">
                {countPontes
                  ? "Dias de ponte descontam a jornada do banco (podem virar dias de férias)."
                  : "Dias de ponte NÃO descontam do banco (folga livre)."}
              </p>
            </div>

            <button
              onClick={handleRecalculate}
              disabled={recalculateCountdown > 0}
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl transition-all font-semibold text-sm border 
                ${recalculateCountdown > 0 
                  ? 'bg-white/5 text-textSecondary border-white/5 cursor-not-allowed' 
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 hover:border-primary/30 active:scale-[0.99]'}`}
            >
              <RefreshCw size={16} className={recalculateCountdown > 0 ? '' : 'animate-spin-slow'} />
              {recalculateCountdown > 0 
                ? `Recalcular em ${recalculateCountdown}s` 
                : 'Forçar Recálculo do Banco'}
            </button>

          </div>

          {/* Logout Action */}
          <button 
            onClick={handleDisconnect}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-danger/10 hover:bg-danger text-danger hover:text-white border border-danger/20 transition-all font-semibold text-sm active:scale-[0.99]"
          >
            <LogOut size={18} />
            Sair deste Dispositivo
          </button>

        </div>
      </DialogContent>
    </Dialog>
  );
};
