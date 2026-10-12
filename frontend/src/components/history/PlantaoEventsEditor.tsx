import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface PlantaoEvent {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string | null;
  description: string | null;
}

interface Props {
  timeRecordId: string;
  date: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
  onRefresh: () => void;
}

export const PlantaoEventsEditor = ({ timeRecordId, date, onToast, onRefresh }: Props) => {
  const [events, setEvents] = useState<PlantaoEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New event state
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Edição de uma saída existente
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  useEffect(() => {
    fetchEvents();
  }, [timeRecordId]);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/records-events?timeRecordId=${timeRecordId}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const buildDateTime = (timeStr: string) => {
    const baseDate = date.substring(0, 10);
    const [year, month, day] = baseDate.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return d.toISOString();
  };

  const handleAdd = async () => {
    if (!newStart) {
      onToast('Hora de início é obrigatória', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/records-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeRecordId,
          name: newName || 'Saída',
          startTime: buildDateTime(newStart),
          endTime: newEnd ? buildDateTime(newEnd) : null,
          description: newDesc || null
        })
      });
      if (res.ok) {
        onToast('Saída adicionada', 'success');
        setNewName('');
        setNewStart('');
        setNewEnd('');
        setNewDesc('');
        fetchEvents();
        onRefresh();
      } else {
        onToast('Erro ao adicionar', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (ev: PlantaoEvent) => {
    setEditId(ev.id);
    setEditName(ev.name || '');
    setEditStart(formatTime(ev.startTime));
    setEditEnd(formatTime(ev.endTime));
  };

  const handleSaveEdit = async () => {
    if (!editId || !editStart) {
      onToast('Hora de início é obrigatória', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const start = new Date(buildDateTime(editStart));
      let end: Date | null = editEnd ? new Date(buildDateTime(editEnd)) : null;
      // Fim antes do início = passou da meia-noite
      if (end && end < start) end.setDate(end.getDate() + 1);
      const res = await fetch(`/api/records-events/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName || 'Saída',
          startTime: start.toISOString(),
          endTime: end ? end.toISOString() : null
        })
      });
      if (res.ok) {
        onToast('Saída atualizada', 'success');
        setEditId(null);
        fetchEvents();
        onRefresh();
      } else {
        onToast('Erro ao atualizar saída', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta saída?')) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/records-events/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onToast('Saída excluída', 'success');
        fetchEvents();
        onRefresh();
      } else {
        onToast('Erro ao excluir saída', 'error');
      }
    } catch (err) {
      console.error(err);
      onToast('Erro de conexão', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getDurationMin = (start: string, end: string | null) => {
    if (!end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }
    return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  // Calculate totals
  const totalMinutes = events.reduce((acc, ev) => {
    const dur = getDurationMin(ev.startTime, ev.endTime);
    return acc + (dur || 0);
  }, 0);

  if (isLoading) return <div className="text-xs text-textSecondary">Carregando saídas...</div>;

  return (
    <div className="mt-4 border-t border-white/10 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-textSecondary uppercase tracking-wider">Saídas do Plantão</h4>
        {events.length > 0 && (
          <span className="text-[10px] text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            {events.length} {events.length === 1 ? 'saída' : 'saídas'} • {formatDuration(totalMinutes)}
          </span>
        )}
      </div>
      
      {/* List of existing events */}
      <div className="space-y-2">
        {events.map(ev => {
          const dur = getDurationMin(ev.startTime, ev.endTime);
          if (editId === ev.id) {
            return (
              <div key={ev.id} className="bg-white/5 p-3 rounded-lg border border-primary/30 space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Nome"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
                />
                <div className="grid grid-cols-2 gap-2 [&>div]:min-w-0">
                  <div>
                    <label className="text-[10px] text-textSecondary block mb-1">Início</label>
                    <input
                      type="time"
                      value={editStart}
                      onChange={e => setEditStart(e.target.value)}
                      className="w-full min-w-0 box-border bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-textSecondary block mb-1">Fim</label>
                    <input
                      type="time"
                      value={editEnd}
                      onChange={e => setEditEnd(e.target.value)}
                      className="w-full min-w-0 box-border bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving || !editStart}
                    className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 rounded-md py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    disabled={isSaving}
                    className="flex-1 bg-white/5 text-white hover:bg-white/10 rounded-md py-1.5 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={ev.id} className="flex items-start gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white font-medium truncate">
                    {ev.name || 'Sem nome'}
                  </span>
                  {dur !== null && (
                    <span className="text-[10px] text-primary/70 flex-shrink-0">
                      {formatDuration(dur)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-textSecondary">
                    {formatTime(ev.startTime)} - {formatTime(ev.endTime) || '--:--'}
                  </span>
                  {ev.description && (
                    <>
                      <span className="text-white/20">•</span>
                      <span className="text-[10px] text-white/50 truncate">{ev.description}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => startEdit(ev)}
                disabled={isSaving}
                className="p-1.5 text-primary hover:bg-primary/20 rounded-lg transition-colors flex-shrink-0"
                aria-label="Editar saída"
              >
                <Pencil size={13} />
              </button>
              <button 
                onClick={() => handleDelete(ev.id)}
                disabled={isSaving}
                className="p-1.5 text-danger hover:bg-danger/20 rounded-lg transition-colors flex-shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        {events.length === 0 && (
          <p className="text-xs text-textSecondary/50 italic">Nenhuma saída registrada.</p>
        )}
      </div>

      {/* Add new event form */}
      <div className="bg-white/5 p-3 rounded-lg border border-white/5 space-y-3">
        <h5 className="text-[11px] font-medium text-white">Nova Saída</h5>
        
        {/* Name field */}
        <div>
          <label className="text-[10px] text-textSecondary block mb-1">Nome</label>
          <input 
            type="text" 
            placeholder="Ex: Deploy urgente, Chamado servidor..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 [&>div]:min-w-0">
          <div>
            <label className="text-[10px] text-textSecondary block mb-1">Início</label>
            <input
              type="time"
              value={newStart}
              onChange={e => setNewStart(e.target.value)}
              className="w-full min-w-0 box-border bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] text-textSecondary block mb-1">Fim</label>
            <input
              type="time"
              value={newEnd}
              onChange={e => setNewEnd(e.target.value)}
              className="w-full min-w-0 box-border bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-textSecondary block mb-1">Descrição (opcional)</label>
          <input 
            type="text" 
            placeholder="Detalhes adicionais..."
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-primary/50"
          />
        </div>
        <button 
          onClick={handleAdd}
          disabled={isSaving || !newStart}
          className="w-full flex justify-center items-center gap-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 rounded-md py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={14} /> Adicionar Saída
        </button>
      </div>
    </div>
  );
};
