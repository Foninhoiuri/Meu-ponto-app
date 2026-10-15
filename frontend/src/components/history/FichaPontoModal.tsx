import { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { gerarFicha, periodo, textoFicha, VARIACAO_MIN, type DiaJornada, type LinhaFicha } from '@/lib/fichaPonto';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const guardado = (chave: string): LinhaFicha[] | null => {
  try {
    const raw = localStorage.getItem(`ficha_ponto_${chave}`);
    return raw ? (JSON.parse(raw) as LinhaFicha[]) : null;
  } catch { return null; }
};

const jornada = (): DiaJornada[] | undefined => {
  try {
    const raw = localStorage.getItem('work_schedule');
    return raw ? (JSON.parse(raw) as DiaJornada[]) : undefined;
  } catch { return undefined; }
};

async function feriadosDe(anos: number[]): Promise<string[]> {
  const listas = await Promise.all(anos.map(async (ano) => {
    try {
      const r = await fetch(`/api/holidays/${ano}/details`);
      if (!r.ok) return [] as string[];
      return ((await r.json()) as { date: string }[]).map((h) => h.date.substring(0, 10));
    } catch { return [] as string[]; }
  }));
  return listas.flat();
}

export const FichaPontoModal = ({ isOpen, onClose, onToast }: Props) => {
  const [linhas, setLinhas] = useState<LinhaFicha[] | null>(null); // null = carregando
  const [versao, setVersao] = useState(0);
  const { inicio, fim, chave } = periodo(new Date());
  const rotulo = `${inicio.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')}`;

  useEffect(() => {
    if (!isOpen) return;
    let vivo = true;
    (async () => {
      const salvo = guardado(chave);
      let lista = salvo;
      if (!lista) {
        const anos = Array.from(new Set([inicio.getFullYear(), fim.getFullYear()]));
        lista = gerarFicha(inicio, fim, await feriadosDe(anos), jornada());
        try { localStorage.setItem(`ficha_ponto_${chave}`, JSON.stringify(lista)); } catch { /* sem armazenamento: só mostra */ }
      }
      if (vivo) setLinhas(lista);
    })();
    return () => { vivo = false; };
    // inicio/fim derivam de `chave`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, chave, versao]);

  const gerarDeNovo = () => {
    try { localStorage.removeItem(`ficha_ponto_${chave}`); } catch { /* ignore */ }
    setLinhas(null);
    setVersao((v) => v + 1);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoFicha(linhas ?? []));
      onToast('Ficha copiada', 'success');
    } catch {
      onToast('Não consegui copiar; selecione o texto na tela', 'error');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[78dvh]">
        <DialogHeader className="border-b border-white/10">
          <DialogTitle>Ficha de ponto</DialogTitle>
          <DialogDescription className="text-xs text-textSecondary">
            {rotulo} · horário normal da jornada, ±{VARIACAO_MIN} min · sem feriado e fim de semana
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {linhas === null ? (
            <p className="text-sm text-textSecondary">Gerando…</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm tabular-nums">
              {linhas.map((l) => (
                <li key={l.date} className="flex items-center justify-between py-2">
                  <span className="text-white/90">{l.label}</span>
                  <span className="text-white">{l.entrada} <span className="text-textSecondary">às</span> {l.saida}</span>
                </li>
              ))}
              {!linhas.length && <li className="py-2 text-textSecondary">Nenhum dia útil no período.</li>}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
          <button
            onClick={gerarDeNovo}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            <RefreshCw size={15} /> Gerar de novo
          </button>
          <button
            onClick={() => void copiar()}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Copy size={15} /> Copiar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
