import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AlertCircle, Trash2, Check, Calendar, Download, RotateCcw, X, List as ListIcon, LayoutGrid, PieChart, ChevronDown } from 'lucide-react';
import { PlantaoEventsEditor } from './PlantaoEventsEditor';
import { HistoryCalendar } from './HistoryCalendar';
import { HistorySummary } from './HistorySummary';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { isWithinTolerance } from '@/lib/records';
import { exportBankPdf } from '@/lib/exportPdf';

type ViewKey = 'lista' | 'calendario' | 'resumo';
const VIEWS: { key: ViewKey; label: string; icon: any }[] = [
  { key: 'lista', label: 'Lista', icon: ListIcon },
  { key: 'calendario', label: 'Calendário', icon: LayoutGrid },
  { key: 'resumo', label: 'Resumo', icon: PieChart },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  records: any[];
  onRefresh: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  initialFilter?: string;
  targetId?: string;
}

type FilterKey = 'todos' | 'normal' | 'extra' | 'debito' | 'plantao' | 'ponte';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'normal', label: 'Normais' },
  { key: 'extra', label: 'Hora extra' },
  { key: 'debito', label: 'Débito' },
  { key: 'plantao', label: 'Plantão' },
  { key: 'ponte', label: 'Pontes' },
];

// Classifica um dia real em uma categoria de filtro.
const dayCategory = (day: any): FilterKey | 'ghost' => {
  if (day.isGhost) return 'ghost';
  if (day.isPlantao) return 'plantao';
  if (day.isPonte) return 'ponte';
  const bal = day.balanceDiff || 0;
  if (bal < 0 || day.isAbsence) return 'debito';
  if (bal > 0) return 'extra';
  return 'normal';
};

// Helper to format Date objects to HH:MM time strings in local timezone
const formatTime = (isoString?: string | null) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Helper to extract YYYY-MM-DD local
const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Check if a day is a ponte candidate (weekday sandwiched between a holiday and a weekend)
const isPonteCandidateUtil = (dateStr: string, holidays: string[]) => {
  const date = new Date(`${dateStr.substring(0, 10)}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  if (holidays.includes(dateStr.substring(0, 10))) return false;

  // Check backward: is there a holiday before this day with only holidays/weekends in between?
  let foundHolidayBefore = false;
  for (let i = 1; i <= 5; i++) {
    const prev = new Date(date);
    prev.setUTCDate(date.getUTCDate() - i);
    const prevStr = prev.toISOString().substring(0, 10);
    const prevDow = prev.getUTCDay();
    if (prevDow === 0 || prevDow === 6) continue;
    if (holidays.includes(prevStr)) { foundHolidayBefore = true; break; }
    break;
  }

  // Check forward: does this day reach a weekend with only holidays in between?
  let reachesWeekend = false;
  for (let i = 1; i <= 5; i++) {
    const next = new Date(date);
    next.setUTCDate(date.getUTCDate() + i);
    const nextStr = next.toISOString().substring(0, 10);
    const nextDow = next.getUTCDay();
    if (nextDow === 0 || nextDow === 6) { reachesWeekend = true; break; }
    if (holidays.includes(nextStr)) continue;
    break;
  }

  if (foundHolidayBefore && reachesWeekend) return true;

  // Reverse: holiday is ahead and weekend is behind
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

// Helper to format ISO Date strings to Portuguese weekday representation
const formatRecordDate = (dateStr: string) => {
  const parts = dateStr.substring(0, 10).split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  const weekday = weekdays[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  
  return `${weekday}, ${day} ${month}`;
};

// Helper to find the Sunday of a given ISO date string
const getSundayOfISOString = (isoStr: string) => {
  const parts = isoStr.substring(0, 10).split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const day = date.getDay();
  const diff = date.getDate() - day;
  const sunday = new Date(date.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return sunday;
};

// Helper to format minutes into a "+/- Xh XXm" balance format
const formatBalance = (totalMinutes: number) => {
  const isPositive = totalMinutes >= 0;
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${isPositive ? '+' : '-'} ${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

// Helper to construct a local ISO date string from base date and input hours/minutes
const buildDateTime = (baseDateStr: string, timeStr: string) => {
  if (!timeStr) return null;
  const [year, month, day] = baseDateStr.substring(0, 10).split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(year, month - 1, day, hours, minutes);
  return d.toISOString();
};

interface MonthGroup {
  monthKey: string; // YYYY-MM
  title: string;
  summary: string;
  weeks: WeekGroup[];
}

interface WeekGroup {
  sunday: Date;
  title: string;
  summary: string;
  days: any[];
}

export const HistoryModal = ({ isOpen, onClose, records, onRefresh, onToast, initialFilter, targetId }: Props) => {
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holidayNames, setHolidayNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterKey>('todos');
  const [view, setView] = useState<ViewKey>('lista');
  const [exporting, setExporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportMonths, setSelectedExportMonths] = useState<string[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const currentDayRef = React.useRef<HTMLDivElement>(null);

  // Aplica o filtro inicial cada vez que o modal abre (ex.: vindo do aviso de férias)
  useEffect(() => {
    if (isOpen) {
      const valid = FILTERS.some(f => f.key === initialFilter);
      setFilter((valid ? initialFilter : 'todos') as FilterKey);
    }
  }, [isOpen, initialFilter]);

  // Ao abrir, rola até o dia alvo (ou hoje) e dá um glow para indicar o dia.
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => {
      const el = targetId
        ? document.getElementById(`record-${targetId}`)
        : currentDayRef.current;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('day-glow');
        window.setTimeout(() => el.classList.remove('day-glow'), 2100);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [isOpen, targetId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    fetch(`/api/holidays/${new Date().getFullYear()}/details`)
      .then(res => res.json())
      .then((data: { date: string; name: string }[]) => {
        setHolidays(data.map(h => h.date));
        const map: Record<string, string> = {};
        data.forEach(h => { map[h.date] = h.name; });
        setHolidayNames(map);
      })
      .catch(console.error);
  }, []);

  // Initialize expandedMonths: only the current month is expanded by default
  useEffect(() => {
    const now = new Date();
    const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    setExpandedMonths(prev => {
      if (Object.keys(prev).length === 0) {
        return { [currentMonthKey]: true };
      }
      return prev;
    });
  }, []);

  // Edit States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editLunchStart, setEditLunchStart] = useState('');
  const [editLunchEnd, setEditLunchEnd] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editIsAbsence, setEditIsAbsence] = useState(false);
  const [editIsJustified, setEditIsJustified] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [editIsPlantao, setEditIsPlantao] = useState(false);
  const [editIsPonte, setEditIsPonte] = useState(false);
  const [editIsHoliday, setEditIsHoliday] = useState(false);

  const isPonteCandidate = (dateStr: string, holidays: string[]) => isPonteCandidateUtil(dateStr, holidays);

  // Status States for feedback loader
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const [currentProblemIndex, setCurrentProblemIndex] = useState(-1);

  // Group real records by Month -> Sunday-to-Saturday weeks
  const groupedMonths = useMemo(() => {
    const monthGroups: { [key: string]: MonthGroup } = {};
    const weekGroups: { [key: string]: WeekGroup } = {};

    const now = new Date();
    // Default to generating from start of previous month to end of current month
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const allDays: any[] = [];
    records.forEach(r => allDays.push(r));

    // Fill in the ghost days
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const isoDate = new Date(year, d.getMonth(), d.getDate()).toISOString();
      const exists = allDays.some(r => r.date && r.date.startsWith(dateStr));
      
      if (!exists) {
        const isFuture = new Date(year, d.getMonth(), d.getDate()) > new Date(now.getFullYear(), now.getMonth(), now.getDate());
        allDays.push({
          id: `ghost-${dateStr}`,
          date: isoDate,
          balanceDiff: 0,
          isGhost: true,
          status: isFuture ? 'FUTURE' : 'MISSING'
        });
      }
    }

    allDays.forEach(r => {
      const sunday = getSundayOfISOString(r.date);
      const weekKey = sunday.getTime().toString();
      
      const rDateObj = new Date(`${r.date.substring(0, 10)}T00:00:00Z`);
      const monthKey = `${rDateObj.getUTCFullYear()}-${String(rDateObj.getUTCMonth() + 1).padStart(2, '0')}`;

      // Initialize MonthGroup
      if (!monthGroups[monthKey]) {
        const monthsNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        monthGroups[monthKey] = {
          monthKey,
          title: `${monthsNames[rDateObj.getUTCMonth()]} ${rDateObj.getUTCFullYear()}`,
          summary: '',
          weeks: []
        };
      }

      // Initialize WeekGroup
      if (!weekGroups[weekKey]) {
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        const formatDayMonth = (d: Date) => {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          return `${dd}/${mm}`;
        };
        weekGroups[weekKey] = {
          sunday,
          title: `Semana de ${formatDayMonth(sunday)} a ${formatDayMonth(saturday)}`,
          summary: '',
          days: []
        };
        monthGroups[monthKey].weeks.push(weekGroups[weekKey]);
      }
      weekGroups[weekKey].days.push(r);
    });

    // Calculate summaries, sort days, sort weeks
    const sortedMonths = Object.values(monthGroups).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    
    sortedMonths.forEach(m => {
      let monthTotalMinutes = 0;
      m.weeks.sort((a, b) => b.sunday.getTime() - a.sunday.getTime());
      
      m.weeks.forEach(w => {
        let weekTotalMinutes = 0;
        w.days.forEach(d => {
          weekTotalMinutes += d.balanceDiff || 0;
        });
        w.summary = formatBalance(weekTotalMinutes);
        monthTotalMinutes += weekTotalMinutes;
        w.days.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });
      m.summary = formatBalance(monthTotalMinutes);
    });

    return sortedMonths;
  }, [records]);

  const problemDays = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    const problems: string[] = [];
    groupedMonths.forEach(m => {
      m.weeks.forEach(w => {
        w.days.forEach(d => {
          const isPast = d.date.substring(0, 10) !== todayStr && new Date(d.date.substring(0, 10)) < new Date(todayStr);
          if (!isPast) return;

          let isProblem = false;
          
          if (d.isGhost) {
            return;
          } else if (d.isPlantao) {
            const hasPunches = d.punches && d.punches.length > 0;
            const hasEvents = d.plantaoEvents && d.plantaoEvents.length > 0;
            if (hasEvents && d.plantaoEvents.some((e: any) => !e.endTime)) isProblem = true;
            else if (hasPunches && d.punches.length % 2 !== 0) isProblem = true;
          } else {
            const dt = new Date(`${d.date.substring(0, 10)}T00:00:00Z`);
            const isWeekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
            const isHoliday = holidays.includes(d.date.substring(0, 10));
            const isPonte = isPonteCandidate(d.date, holidays);

            if (d.status === 'OPEN') isProblem = true;
            else if ((d.lunchStart && !d.lunchEnd) || (!d.lunchStart && d.lunchEnd)) {
              if (!isWeekend && !isHoliday && !isPonte) isProblem = true;
            }
          }

          if (isProblem) problems.push(d.id);
        });
      });
    });
    return problems;
  }, [groupedMonths]);

  // Mini-dashboard do mês corrente
  const monthKpis = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    let saldo = 0, plantoes = 0, debitoDias = 0, extraMin = 0;
    records.forEach(r => {
      if (!r.date || r.isGhost) return;
      const dt = new Date(`${r.date.substring(0, 10)}T00:00:00`);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo) return;
      const bal = r.balanceDiff || 0;
      saldo += bal;
      if (r.isPlantao) plantoes++;
      if (bal < 0 || r.isAbsence) debitoDias++;
      if (bal > 0) extraMin += bal;
    });
    return { saldo, plantoes, debitoDias, extraMin, pendentes: problemDays.length };
  }, [records, problemDays]);

  const applyFilter = (days: any[]) =>
    filter === 'todos' ? days : days.filter(d => dayCategory(d) === filter);

  const anyMatch = useMemo(
    () => groupedMonths.some(m => m.weeks.some(w => applyFilter(w.days).length > 0)),
    [groupedMonths, filter]
  );

  const handleNextProblem = () => {
    if (problemDays.length === 0) {
      onToast('Nenhum registro pendente.', 'info');
      return;
    }
    const nextIdx = (currentProblemIndex + 1) % problemDays.length;
    setCurrentProblemIndex(nextIdx);
    const element = document.getElementById(`record-${problemDays[nextIdx]}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-white/10');
      setTimeout(() => element.classList.remove('bg-white/10'), 1500);
    }
  };

  const handleSavePlantao = async (dateStr: string) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/records/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default-user-id',
          type: 'PRE_DEFINE_PLANTAO',
          date: dateStr
        })
      });

      if (res.ok) {
        onToast('Plantão agendado com sucesso!', 'success');
        onRefresh();
      } else {
        onToast('Erro ao agendar plantão.', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePonte = async (dateStr: string) => {
    setIsSaving(true);
    try {
      // Find all ponte candidate days in the same bridge period
      const baseDate = new Date(`${dateStr.substring(0, 10)}T00:00:00Z`);
      const ponteDays: string[] = [dateStr];

      // Scan nearby days (up to 7 in each direction) to find all related ponte days
      for (let offset = -7; offset <= 7; offset++) {
        if (offset === 0) continue;
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + offset);
        const dStr = d.toISOString().substring(0, 10);
        if (isPonteCandidate(dStr, holidays) && !ponteDays.includes(d.toISOString())) {
          // Only add if it's in the same contiguous bridge group
          ponteDays.push(d.toISOString());
        }
      }

      // Schedule each day as ponte
      let success = 0;
      for (const dayDate of ponteDays) {
        const res = await fetch('/api/records/punch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'default-user-id',
            type: 'PRE_DEFINE_PONTE',
            date: dayDate
          })
        });
        if (res.ok) success++;
      }

      if (success > 0) {
        onToast(`Ponte agendada! ${success} dia${success > 1 ? 's' : ''} configurado${success > 1 ? 's' : ''}.`, 'success');
        onRefresh();
      } else {
        onToast('Erro ao agendar ponte.', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Click card toggles inline edit mode
  const handleDayClick = (day: any) => {
    if (editingId === day.id) {
      setEditingId(null);
    } else {
      setEditingId(day.id);
      setEditIn(formatTime(day.punchIn));
      setEditLunchStart(formatTime(day.lunchStart));
      setEditLunchEnd(formatTime(day.lunchEnd));
      setEditOut(formatTime(day.punchOut));
      setEditReason(day.reason || '');
      setEditIsPlantao(day.isPlantao || false);
      setEditIsPonte(day.isPonte || false);
      setEditIsHoliday(day.isHoliday || false);
      setEditIsAbsence(day.isAbsence || false);
      setEditIsJustified(day.isJustified || false);
    }
  };

  // Perform inline PUT request
  const handleSave = async (day: any) => {
    setIsSaving(true);
    try {
      const payload = {
        userId: 'default-user-id',
        date: day.date,
        punchIn: editIn ? buildDateTime(day.date, editIn) : null,
        lunchStart: editLunchStart ? buildDateTime(day.date, editLunchStart) : null,
        lunchEnd: editLunchEnd ? buildDateTime(day.date, editLunchEnd) : null,
        punchOut: editOut ? buildDateTime(day.date, editOut) : null,
        reason: editReason || null,
        isPlantao: editIsPlantao,
        isPonte: editIsPonte,
        isHoliday: editIsHoliday,
        isAbsence: editIsAbsence,
        isJustified: editIsAbsence ? editIsJustified : false
      };

      const isGhost = day.id.startsWith('ghost-');
      const url = `/api/records/${day.id}`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        onToast('Registro atualizado com sucesso!', 'success');
        setEditingId(null);
        onRefresh();
      } else {
        onToast('Erro ao atualizar registro.', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Perform inline DELETE request
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Deseja realmente excluir este registro?')) return;
    
    setIsDeletingId(id);
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onToast('Registro excluído com sucesso!', 'success');
        setEditingId(null);
        onRefresh();
      } else {
        onToast('Erro ao excluir registro.', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão.', 'error');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Vai para a lista e destaca (glow) o dia — usado ao tocar num dia do calendário
  const scrollToDay = (id: string) => {
    setView('lista');
    setFilter('todos');
    setTimeout(() => {
      const el = document.getElementById(`record-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('day-glow');
        window.setTimeout(() => el.classList.remove('day-glow'), 2100);
      }
    }, 140);
  };

  const handleExport = () => {
    if (groupedMonths.length === 0) {
      onToast('Não há registros para exportar.', 'info');
      return;
    }
    // Seleciona todos por padrão
    setSelectedExportMonths(groupedMonths.map(m => m.monthKey));
    setExportModalOpen(true);
  };

  const confirmExport = async () => {
    if (exporting || selectedExportMonths.length === 0) return;
    setExporting(true);
    onToast('Gerando PDF...', 'info');
    try {
      const filteredRecords = records.filter(r => {
        if (!r.date || r.isGhost) return false;
        const rDateObj = new Date(`${r.date.substring(0, 10)}T00:00:00Z`);
        const monthKey = `${rDateObj.getUTCFullYear()}-${String(rDateObj.getUTCMonth() + 1).padStart(2, '0')}`;
        return selectedExportMonths.includes(monthKey);
      });

      const { shared } = await exportBankPdf(filteredRecords);
      if (!shared) onToast('PDF exportado.', 'success');
      setExportModalOpen(false);
    } catch (err) {
      console.error(err);
      onToast('Erro ao gerar o PDF.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Desfazer a última batida de HOJE (ex.: finalizou por engano)
  const todayRec = records.find(r => r.date?.substring(0, 10) === getLocalDateString(new Date()) && !r.isGhost);
  const canUndo = !!todayRec && (todayRec.punchIn || (todayRec.isPlantao && todayRec.plantaoEvents?.length > 0));

  const handleUndo = async () => {
    try {
      const res = await fetch('/api/records/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'default-user-id' }),
      });
      if (res.ok) {
        onToast('Última batida de hoje desfeita.', 'info');
        onRefresh();
      } else {
        const e = await res.json().catch(() => ({}));
        onToast(e.error || 'Nada para desfazer.', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão.', 'error');
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showClose={false} className="max-w-[32rem] p-0 overflow-hidden bg-surface border-white/10 flex flex-col h-[85vh] sm:h-[600px] outline-none">
        <DialogDescription className="sr-only">Histórico de registros de ponto</DialogDescription>

        {/* Header */}
        <div className="flex justify-between items-center gap-3 p-6 pt-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <DialogTitle className="text-xl">Histórico</DialogTitle>
            {problemDays.length > 0 && (
              <button
                onClick={handleNextProblem}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider shrink-0"
              >
                <AlertCircle size={12} />
                {problemDays.length}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canUndo && (
              <button
                onClick={handleUndo}
                title="Desfazer última batida de hoje"
                className="flex h-9 w-9 items-center justify-center rounded-full glass text-textSecondary hover:text-white transition-colors"
              >
                <RotateCcw size={17} />
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Exportar banco em PDF"
              className="flex h-9 w-16 items-center justify-center rounded-full glass text-textSecondary hover:text-white transition-colors disabled:opacity-50"
            >
              <Download size={18} />
            </button>
            <DialogClose asChild>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full glass text-textSecondary hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </DialogClose>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Header flutuante: alternador de visualização + filtros (sobreposto ao rolar) */}
          <div className="sticky top-0 z-20 bg-surface/90 backdrop-blur-md border-b border-white/10 px-6 pt-4 pb-3 space-y-3">
            <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/10">
              {VIEWS.map(v => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-colors',
                      view === v.key ? 'bg-primary text-primary-foreground' : 'text-textSecondary hover:text-white'
                    )}
                  >
                    <Icon size={13} /> {v.label}
                  </button>
                );
              })}
            </div>

            {/* Filtros — só na Lista */}
            {view === 'lista' && (
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      filter === f.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-white/10 bg-white/5 text-textSecondary hover:text-white'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conteúdo por visualização */}
          <div className="p-6 space-y-6">
          {view === 'calendario' ? (
            <HistoryCalendar records={records} holidays={holidays} onSelectDay={scrollToDay} />
          ) : view === 'resumo' ? (
            <HistorySummary records={records} pendingCount={problemDays.length} />
          ) : filter !== 'todos' && !anyMatch ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-textSecondary">
              <AlertCircle size={32} className="mb-2 text-primary opacity-60" />
              <p className="text-sm font-medium">Nenhum dia nesta categoria.</p>
            </div>
          ) : (
            groupedMonths.map((month) => {
              const isExpanded = expandedMonths[month.monthKey] || false;
              
              // Check if there's any visible day in this month to render at all
              const hasVisibleDays = month.weeks.some(w => applyFilter(w.days).length > 0);
              if (!hasVisibleDays) return null;

              return (
                <div key={month.monthKey} className="space-y-4 mb-8">
                  {/* Month Header / Collapsible Toggle */}
                  <div 
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors sticky top-[90px] z-10 backdrop-blur-md"
                    onClick={() => setExpandedMonths(p => ({ ...p, [month.monthKey]: !p[month.monthKey] }))}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown size={16} className={`text-textSecondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider">{month.title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-textSecondary uppercase tracking-wider hidden sm:inline">Resumo do Mês:</span>
                      <span className={`font-bold text-sm ${month.summary.startsWith('+') ? 'text-success' : 'text-danger'}`}>
                        {month.summary}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-6">
                      {month.weeks.map((week, wIdx) => {
                        const fdays = applyFilter(week.days);
                        if (fdays.length === 0) return null;
                        
                        // Determinar o número da semana para o label (Semana 1, etc)
                        // A última semana do mês no array será a mais antiga, então se ordenamos desc, 
                        // a semana mais recente é a última no mês, ou podemos apenas usar o week.title original.
                        // O usuário pediu "Semana 1 mes 3". Vamos injetar no week.title ou mantê-lo?
                        // O title já tem as datas "Semana de 05/07 a 11/07", que é ótimo. Vamos prefixar com "Semana N".
                        const weekNumber = month.weeks.length - wIdx;

                        return (
                          <div key={week.sunday.getTime()} className="space-y-3">
                            {/* Week Separator */}
                            <div className="flex justify-between items-baseline px-1">
                              <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-wider">Semana {weekNumber} · {week.title.replace('Semana de ', '')}</h3>
                              <span className={`font-semibold text-sm ${week.summary.startsWith('+') ? 'text-success' : 'text-danger'}`}>
                                {week.summary}
                              </span>
                            </div>

                            {/* Linha da semana: enfeite em sangria, fora do alinhamento dos cards */}
                            <div className="-mx-6 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                            {/* Days List */}
                            <div className="space-y-3">
                              {fdays.map((day) => {
                                const isEditing = editingId === day.id;
                                const isToday = day.date.substring(0, 10) === getLocalDateString(new Date());
                                
                                if (isEditing) {
                                  return (
                                    <div 
                                      key={day.id} 
                                      id={`record-${day.id}`}
                                      ref={isToday ? currentDayRef : null}
                                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 transition-colors duration-500"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {/* Inline Form Header */}
                                      <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                        <p className="text-white font-medium">{formatRecordDate(day.date)}</p>
                                        <span className="text-[10px] text-primary font-semibold uppercase tracking-wider">Editando Ponto</span>
                                      </div>

                                      {/* Time inputs grid OR Plantao Events Editor */}
                                      {!editIsPlantao ? (
                                        <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0 [&_input]:box-border">
                                          <div>
                                            <label className="text-[11px] text-textSecondary font-medium mb-1 block">Entrada</label>
                                            <input 
                                              type="time" 
                                              value={editIn}
                                              onChange={(e) => setEditIn(e.target.value)}
                                              disabled={editIsAbsence || isSaving}
                                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-30"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[11px] text-textSecondary font-medium mb-1 block">Saída</label>
                                            <input 
                                              type="time" 
                                              value={editOut}
                                              onChange={(e) => setEditOut(e.target.value)}
                                  disabled={editIsAbsence || isSaving}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-30"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-textSecondary font-medium mb-1 block">Início Intervalo</label>
                                <input 
                                  type="time" 
                                  value={editLunchStart}
                                  onChange={(e) => setEditLunchStart(e.target.value)}
                                  disabled={editIsAbsence || isSaving}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-30"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-textSecondary font-medium mb-1 block">Fim Intervalo</label>
                                <input 
                                  type="time" 
                                  value={editLunchEnd}
                                  onChange={(e) => setEditLunchEnd(e.target.value)}
                                  disabled={editIsAbsence || isSaving}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-30"
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs text-textSecondary mb-2">
                                Para dias de plantão, registre cada saída (subcategoria) separadamente.
                              </p>
                              {day.isGhost ? (
                                <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-primary/80">
                                  Por favor, clique em "Salvar" primeiro para criar o registro do dia e poder adicionar saídas.
                                </div>
                              ) : (
                                <PlantaoEventsEditor 
                                  timeRecordId={day.id} 
                                  date={day.date}
                                  onToast={onToast}
                                  onRefresh={onRefresh}
                                />
                              )}
                            </div>
                          )}

                          {/* Plantão avulso (hora extra) em dia normal */}
                          {!editIsPlantao && !day.isGhost && (
                            <div className="pt-1">
                              <PlantaoEventsEditor
                                timeRecordId={day.id}
                                date={day.date}
                                onToast={onToast}
                                onRefresh={onRefresh}
                              />
                            </div>
                          )}

                          {/* Checkboxes grid */}
                          <div className="grid grid-cols-2 gap-3">
                            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                              <input 
                                type="checkbox" 
                                checked={editIsPlantao} 
                                onChange={(e) => setEditIsPlantao(e.target.checked)}
                                disabled={isSaving}
                                className="rounded border-white/10 text-primary focus:ring-0 focus:ring-offset-0 bg-transparent w-4 h-4" 
                              />
                              <span className="text-xs font-medium text-white">Plantão</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                              <input
                                type="checkbox"
                                checked={editIsPonte}
                                onChange={(e) => setEditIsPonte(e.target.checked)}
                                disabled={isSaving}
                                className="rounded border-white/10 text-primary focus:ring-0 focus:ring-offset-0 bg-transparent w-4 h-4"
                              />
                              <span className="text-xs font-medium text-white">Ponte</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                              <input
                                type="checkbox"
                                checked={editIsHoliday}
                                onChange={(e) => setEditIsHoliday(e.target.checked)}
                                disabled={isSaving}
                                className="rounded border-white/10 text-primary focus:ring-0 focus:ring-offset-0 bg-transparent w-4 h-4"
                              />
                              <span className="text-xs font-medium text-white">Feriado</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                              <input
                                type="checkbox"
                                checked={editIsAbsence}
                                onChange={(e) => {
                                  setEditIsAbsence(e.target.checked);
                                  if (e.target.checked) {
                                    setEditIn('');
                                    setEditLunchStart('');
                                    setEditLunchEnd('');
                                    setEditOut('');
                                  }
                                }}
                                disabled={isSaving}
                                className="rounded border-white/10 text-danger focus:ring-0 focus:ring-offset-0 bg-transparent w-4 h-4" 
                              />
                              <span className="text-xs font-medium text-white">Falta</span>
                            </label>
                            
                            {editIsAbsence && (
                              <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors col-span-2">
                                <input 
                                  type="checkbox" 
                                  checked={editIsJustified} 
                                  onChange={(e) => setEditIsJustified(e.target.checked)}
                                  disabled={isSaving}
                                  className="rounded border-white/10 text-success focus:ring-0 focus:ring-offset-0 bg-transparent w-4 h-4" 
                                />
                                <span className="text-xs font-medium text-white">Falta Justificada (Não desconta no banco)</span>
                              </label>
                            )}
                          </div>

                          {/* Reason */}
                          <div>
                            <label className="text-[11px] text-textSecondary font-medium mb-1 block">Justificativa / Motivo</label>
                            <input 
                              type="text" 
                              placeholder="Ex: Esquecimento, viagem, etc."
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              disabled={isSaving}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary/50 transition-colors"
                            />
                          </div>

                          {/* Form Action Buttons */}
                          <div className="flex justify-between items-center gap-3 pt-2">
                            <button 
                              onClick={(e) => handleDelete(day.id, e)}
                              disabled={isSaving || isDeletingId === day.id}
                              className="px-3 py-2 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors text-xs font-semibold flex items-center gap-1.5"
                            >
                              <Trash2 size={13} />
                              Excluir
                            </button>

                            <div className="flex gap-2">
                              <button 
                                onClick={() => setEditingId(null)}
                                disabled={isSaving}
                                className="px-3 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-colors text-xs font-semibold"
                              >
                                Cancelar
                              </button>
                              
                              <button 
                                onClick={() => handleSave(day)}
                                disabled={isSaving}
                                className="px-4 py-2 rounded-xl bg-primary text-black hover:opacity-90 transition-opacity text-xs font-semibold flex items-center gap-1"
                              >
                                {isSaving ? 'Salvando...' : (
                                  <>
                                    <Check size={13} />
                                    Salvar
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    // Ghost days
                    if (day.isGhost) {
                      const ponteCandidate = isPonteCandidate(day.date, holidays);
                      const isWeekend = (() => {
                        const parts = day.date.substring(0, 10).split('-');
                        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        return d.getDay() === 0 || d.getDay() === 6;
                      })();
                      const canSchedulePlantao = isWeekend || holidays.includes(day.date.substring(0, 10));

                      const isPastGhost = day.status === 'MISSING';

                      return (
                        <Card
                          key={day.id}
                          id={`record-${day.id}`}
                          ref={isToday ? currentDayRef : null}
                          onClick={() => isPastGhost ? handleDayClick(day) : null}
                          className={`flex flex-col gap-0 p-4 rounded-2xl border ${ponteCandidate ? 'border-primary/40 bg-primary/5' : 'border-white/5'} transition-colors duration-500 ${day.status === 'FUTURE' && !ponteCandidate ? 'opacity-50' : 'bg-white/[0.02]'} ${isPastGhost ? 'cursor-pointer hover:border-white/20 hover:bg-white/5' : ''}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-white font-medium">{formatRecordDate(day.date)}</p>
                              {day.status === 'FUTURE' && <span className="text-[10px] text-textSecondary uppercase mt-1 inline-block">Futuro</span>}
                            </div>
                          </div>
                          
                          {ponteCandidate && (
                            <div className="mt-1 mb-2 p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-start gap-2">
                              <Calendar className="text-primary mt-0.5" size={14} />
                              <div className="flex-1">
                                <p className="text-xs text-primary font-medium">Possível Ponte de Feriado</p>
                                <p className="text-[10px] text-white/60">Este dia útil está entre um feriado e o final de semana.</p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-xs text-textSecondary">
                            <span>Nenhum registro</span>
                            
                            <div className="flex gap-2">
                              {ponteCandidate && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSavePonte(day.date);
                                  }}
                                  disabled={isSaving}
                                  className="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary text-[10px] transition-colors font-semibold border border-primary/30"
                                >
                                  Agendar Ponte
                                </button>
                              )}
                              {canSchedulePlantao && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSavePlantao(day.date);
                                  }}
                                  disabled={isSaving}
                                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white text-[10px] transition-colors font-medium border border-white/10"
                                >
                                  Agendar Plantão
                                </button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    }

                    // Otherwise, render standard Day Card
                    const tol = isWithinTolerance(day);
                    const statusColors = {
                      border: day.isPlantao || day.isPonte ? 'border-primary/20' : day.isAbsence ? 'border-danger/20' : tol ? 'border-amber-500/25' : 'border-white/5',
                      bg: day.isPlantao || day.isPonte ? 'bg-primary/5' : day.isAbsence ? 'bg-danger/5' : tol ? 'bg-amber-500/[0.06]' : 'bg-white/[0.02]'
                    };
                    return (
                      <Card
                        key={day.id}
                        id={`record-${day.id}`}
                        ref={isToday ? currentDayRef : null}
                        onClick={() => handleDayClick(day)}
                        className={`flex flex-col gap-0 p-4 rounded-2xl border ${statusColors.border} ${statusColors.bg} hover:border-white/20 hover:bg-white/5 transition-all duration-500 cursor-pointer group shadow-sm`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-white font-medium">{formatRecordDate(day.date)}</p>
                            
                            {/* Badges row */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {problemDays.includes(day.id) && (
                                <span className="text-[10px] bg-danger/20 text-danger border border-danger/30 px-1.5 py-0.5 rounded font-semibold animate-pulse">Pendente</span>
                              )}
                              {holidays.includes(day.date.substring(0, 10)) && (
                                <span
                                  title={holidayNames[day.date.substring(0, 10)] || 'Feriado'}
                                  className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-medium"
                                >
                                  {holidayNames[day.date.substring(0, 10)] || 'Feriado'}
                                </span>
                              )}
                              {day.isPlantao && (
                                <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-medium">Plantão</span>
                              )}
                              {day.isPonte && (
                                <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-medium">Ponte</span>
                              )}
                              {day.isHoliday && (
                                <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-medium">Feriado</span>
                              )}
                              {tol && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">Tolerância</span>
                              )}
                              {day.isAbsence && (
                                <span className="text-[10px] bg-danger/20 text-danger border border-danger/30 px-1.5 py-0.5 rounded font-medium">Falta</span>
                              )}
                              {day.status === 'EDITED' && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">Editado</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            {day.balanceDiff !== 0 && (
                              <span className={`text-sm font-semibold ${day.balanceDiff > 0 ? 'text-success' : 'text-danger'}`}>
                                {formatBalance(day.balanceDiff)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-xs text-textSecondary">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
                            {day.isAbsence ? (
                              <span className={`${day.isJustified ? 'text-success' : 'text-danger'} italic font-medium`}>
                                {day.isJustified ? 'Falta Justificada' : 'Falta Integral'}
                                {day.reason && ` - ${day.reason}`}
                              </span>
                            ) : day.isPlantao ? (
                              <div className="w-full space-y-1.5">
                                {day.plantaoEvents && day.plantaoEvents.length > 0 ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span className="text-primary font-semibold">
                                        {day.plantaoEvents.length} {day.plantaoEvents.length === 1 ? 'saída' : 'saídas'}
                                      </span>
                                      <span className="text-white/40">•</span>
                                      <span className="text-white font-medium">
                                        {(() => {
                                          let totalMin = 0;
                                          day.plantaoEvents.forEach((ev: any) => {
                                            if (ev.startTime && ev.endTime) {
                                              const start = new Date(ev.startTime);
                                              const end = new Date(ev.endTime);
                                              if (end < start) end.setDate(end.getDate() + 1);
                                              totalMin += Math.round((end.getTime() - start.getTime()) / 60000);
                                            }
                                          });
                                          const h = Math.floor(totalMin / 60);
                                          const m = totalMin % 60;
                                          return `${h}h ${m.toString().padStart(2, '0')}m total`;
                                        })()}
                                      </span>
                                    </div>
                                    {day.plantaoEvents.map((ev: any) => (
                                      <div key={ev.id} className="flex items-center gap-2 text-[10px] pl-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                                        <span className="text-white/80 font-medium">
                                          {ev.name || 'Sem nome'}
                                        </span>
                                        <span className="text-white/40">
                                          {formatTime(ev.startTime)}-{formatTime(ev.endTime) || '...'}
                                        </span>
                                        {ev.startTime && ev.endTime && (
                                          <span className="text-primary/70">
                                            ({(() => {
                                              const start = new Date(ev.startTime);
                                              const end = new Date(ev.endTime);
                                              if (end < start) end.setDate(end.getDate() + 1);
                                              return Math.round((end.getTime() - start.getTime()) / 60000);
                                            })()}min)
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </>
                                ) : (day.punches && day.punches.length > 0) || day.punchIn ? (
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    <span className="text-primary/70 italic text-[10px]">Formato antigo:</span>
                                    <span>Ent: <strong className="text-white">{formatTime(day.punchIn) || '--:--'}</strong></span>
                                    {(day.lunchStart || day.lunchEnd) && (
                                      <span>Alm: <strong className="text-white">{formatTime(day.lunchStart) || '--:--'} - {formatTime(day.lunchEnd) || '--:--'}</strong></span>
                                    )}
                                    <span>Sai: <strong className="text-white">{formatTime(day.punchOut) || '--:--'}</strong></span>
                                  </div>
                                ) : (
                                  <span className="text-white/40 italic">Nenhuma saída registrada</span>
                                )}
                              </div>
                            ) : (
                              <div className="w-full">
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  <span>Ent: <strong className="text-white">{formatTime(day.punchIn) || '--:--'}</strong></span>
                                  {(day.lunchStart || day.lunchEnd) && (
                                    <span>Alm: <strong className="text-white">{formatTime(day.lunchStart) || '--:--'} - {formatTime(day.lunchEnd) || '--:--'}</strong></span>
                                  )}
                                  <span>Sai: <strong className="text-white">{formatTime(day.punchOut) || '--:--'}</strong></span>
                                </div>

                                {/* Submenu de plantão lançado em dia normal (hora extra) */}
                                {day.plantaoEvents && day.plantaoEvents.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-primary/10 space-y-1">
                                    <span className="text-[10px] text-primary font-semibold uppercase tracking-wider">
                                      + Plantão (hora extra)
                                    </span>
                                    {day.plantaoEvents.map((ev: any) => (
                                      <div key={ev.id} className="flex items-center gap-2 text-[10px] pl-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                                        <span className="text-white/80 font-medium">{ev.name || 'Sem nome'}</span>
                                        <span className="text-white/40">
                                          {formatTime(ev.startTime)}-{formatTime(ev.endTime) || '...'}
                                        </span>
                                        {ev.startTime && ev.endTime && (
                                          <span className="text-primary/70">
                                            ({(() => {
                                              const s = new Date(ev.startTime);
                                              const e = new Date(ev.endTime);
                                              if (e < s) e.setDate(e.getDate() + 1);
                                              return Math.round((e.getTime() - s.getTime()) / 60000);
                                            })()}min)
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {day.reason && (
                              <span title={day.reason}>
                                <AlertCircle size={14} className="text-primary" />
                              </span>
                            )}
                            <button 
                              onClick={(e) => handleDelete(day.id, e)}
                              disabled={isDeletingId === day.id}
                              className="w-7 h-7 rounded-full bg-danger/10 text-danger flex items-center justify-center hover:bg-danger hover:text-white transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>

    {/* Export Modal Options */}
    <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
      <DialogContent className="max-w-xs p-6 bg-surface/95 backdrop-blur-xl border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="text-primary" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Exportar PDF</h2>
            <p className="text-[11px] text-textSecondary mt-0.5">Todos, um ano ou meses avulsos</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {['Todos', ...Array.from(new Set(groupedMonths.map(m => m.monthKey.slice(0, 4))))].map(label => {
            const keys = groupedMonths.filter(m => label === 'Todos' || m.monthKey.startsWith(label)).map(m => m.monthKey);
            const active = keys.length > 0 && keys.length === selectedExportMonths.length && keys.every(k => selectedExportMonths.includes(k));
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedExportMonths(keys)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
          {groupedMonths.map(m => (
            <label key={m.monthKey} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
              <span className="text-sm font-medium text-white">{m.title}</span>
              <input 
                type="checkbox"
                checked={selectedExportMonths.includes(m.monthKey)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedExportMonths(prev => [...prev, m.monthKey]);
                  } else {
                    setSelectedExportMonths(prev => prev.filter(key => key !== m.monthKey));
                  }
                }}
                className="w-4 h-4 rounded border-white/20 bg-transparent text-primary focus:ring-primary focus:ring-offset-0"
              />
            </label>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button 
            onClick={confirmExport}
            disabled={exporting || selectedExportMonths.length === 0}
            className="w-full bg-primary text-black font-bold py-3 px-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {exporting ? 'Gerando...' : 'Confirmar e Gerar'}
          </button>
          <button 
            onClick={() => setExportModalOpen(false)}
            className="w-full bg-white/5 text-white font-medium py-3 px-4 rounded-xl hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};
