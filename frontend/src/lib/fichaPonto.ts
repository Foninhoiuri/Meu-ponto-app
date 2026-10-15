// Ficha de ponto: período, dias válidos e horários de cada dia.
// Período: do dia 16 do mês anterior ao dia 15 do mês atual. Fim de semana e feriado ficam de fora;
// ponte é dia normal. Entrada e saída vêm da jornada de cada dia (Ajustes) com variação de ±5 minutos.

export interface DiaJornada {
  key: string;       // 'seg' | 'ter' | ... (mesmas chaves de work_schedule)
  enabled: boolean;
  entrada: string;   // HH:MM
  saida: string;     // HH:MM
}

export interface LinhaFicha {
  date: string;      // YYYY-MM-DD
  label: string;     // 01/10 Qua
  entrada: string;   // HH:MM
  saida: string;     // HH:MM
}

const DOW_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const VARIACAO_MIN = 5;
/** A ficha aparece e o lembrete vale só nestes dias do mês. */
export const JANELA = { de: 10, ate: 20 };

const DEFAULT: DiaJornada[] = [
  { key: 'seg', enabled: true, entrada: '08:00', saida: '18:00' },
  { key: 'ter', enabled: true, entrada: '08:00', saida: '18:00' },
  { key: 'qua', enabled: true, entrada: '08:00', saida: '18:00' },
  { key: 'qui', enabled: true, entrada: '08:00', saida: '18:00' },
  { key: 'sex', enabled: true, entrada: '08:00', saida: '17:00' },
  { key: 'sab', enabled: false, entrada: '08:00', saida: '12:00' },
  { key: 'dom', enabled: false, entrada: '08:00', saida: '12:00' },
];

const p2 = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export const naJanela = (hoje: Date) => hoje.getDate() >= JANELA.de && hoje.getDate() <= JANELA.ate;

/** Período que se preenche agora: 16 do mês anterior até 15 do mês atual. */
export function periodo(hoje: Date): { inicio: Date; fim: Date; chave: string } {
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 15);
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 16);
  return { inicio, fim, chave: `${iso(inicio)}_${iso(fim)}` };
}

const soma = (hhmm: string, minutos: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + minutos));
  return `${p2(Math.floor(total / 60))}:${p2(total % 60)}`;
};

/** Gera as linhas da ficha. `feriados`: datas YYYY-MM-DD. `rand`: 0 <= x < 1 (injetável para teste). */
export function gerarFicha(
  inicio: Date, fim: Date, feriados: string[], jornada: DiaJornada[] = DEFAULT, rand: () => number = Math.random,
): LinhaFicha[] {
  const sorteio = () => Math.floor(rand() * (2 * VARIACAO_MIN + 1)) - VARIACAO_MIN;
  const linhas: LinhaFicha[] = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const dia = jornada.find((j) => j.key === DOW_KEYS[dow]) ?? DEFAULT.find((j) => j.key === DOW_KEYS[dow])!;
    const data = iso(d);
    if (!dia.enabled || feriados.includes(data)) continue;
    linhas.push({
      date: data,
      label: `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${DOW_LABEL[dow]}`,
      entrada: soma(dia.entrada, sorteio()),
      saida: soma(dia.saida, sorteio()),
    });
  }
  return linhas;
}

export const textoFicha = (linhas: LinhaFicha[]) =>
  linhas.map((l) => `${l.label}  ${l.entrada} às ${l.saida}`).join('\n');

/** Auto-teste, sem rede: roda com `node --experimental-strip-types src/lib/fichaPonto.ts --teste`. */
export function autoTeste() {
  const ok = (c: boolean, m: string) => { if (!c) throw new Error('falhou: ' + m); };
  // Outubro/2026: 16/set a 15/out. 16/set é quarta. Feriado em 07/09 não entra; 12/10 é segunda (feriado).
  const { inicio, fim } = periodo(new Date(2026, 9, 14));
  ok(iso(inicio) === '2026-09-16' && iso(fim) === '2026-10-15', 'período');
  const sem = () => 0.5; // sorteio = 0
  const linhas = gerarFicha(inicio, fim, ['2026-10-12'], DEFAULT, sem);
  ok(!linhas.some((l) => l.date === '2026-10-12'), 'feriado fora');
  ok(!linhas.some((l) => ['sáb', 'dom'].includes(l.label.slice(-3).toLowerCase())), 'fim de semana fora');
  const sexta = linhas.find((l) => l.date === '2026-09-18')!;
  ok(sexta.entrada === '08:00' && sexta.saida === '17:00', 'sexta sai 17h');
  const min = gerarFicha(inicio, fim, [], DEFAULT, () => 0);
  const max = gerarFicha(inicio, fim, [], DEFAULT, () => 0.9999);
  ok(min[0].entrada === '07:55' && max[0].entrada === '08:05', 'variação ±5');
  ok(max[0].saida === '18:05' && min.find((l) => l.label.endsWith('Sex'))!.saida === '16:55', 'saída ±5 e sexta');
  ok(naJanela(new Date(2026, 9, 10)) && naJanela(new Date(2026, 9, 20)) && !naJanela(new Date(2026, 9, 9)) && !naJanela(new Date(2026, 9, 21)), 'janela 10 a 20');
  return 'fichaPonto: 6 casos ok';
}
