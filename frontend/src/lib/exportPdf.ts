import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { workedMinutes, formatHm, isWithinTolerance, bankTotals } from './records';

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const fmtTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDate = (dateStr: string) => {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${weekdays[date.getDay()]}`;
};

const signed = (min: number) => (min === 0 ? '—' : `${min > 0 ? '+' : '-'} ${formatHm(min)}`);

const dayType = (r: any) => {
  const tipos: string[] = [];
  if (r.isAbsence) tipos.push(r.isJustified ? 'Falta just.' : 'Falta');
  if (r.isHoliday) tipos.push('Feriado');
  if (r.isPlantao) tipos.push('Plantão');
  if (r.isPonte) tipos.push('Ponte');
  if (tipos.length) return tipos.join(' + ');
  if (isWithinTolerance(r)) return 'Tolerância';
  return 'Expediente';
};

const formatHorarios = (r: any) => {
  if (r.isPlantao && r.plantaoEvents && r.plantaoEvents.length > 0) {
    return `${r.plantaoEvents.length} saída(s)`;
  }
  const ent = fmtTime(r.punchIn);
  const sai = fmtTime(r.punchOut);
  const alm = (r.lunchStart || r.lunchEnd) ? ` (Alm: ${fmtTime(r.lunchStart) || '--'} - ${fmtTime(r.lunchEnd) || '--'})` : '';
  if (!ent && !sai) return '';
  return `${ent || '--:--'} - ${sai || '--:--'}${alm}`;
};

const formatNotas = (r: any) => {
  if (r.reason) return r.reason;
  if (r.isPlantao && r.plantaoEvents && r.plantaoEvents.length > 0) {
    return r.plantaoEvents.map((e: any) => `${e.name || 'Saída'}: ${fmtTime(e.startTime)}-${fmtTime(e.endTime) || '...'}`).join(' | ');
  }
  return '';
};

/**
 * Gera um PDF legível de todo o banco de horas e, no celular, abre a folha de
 * compartilhamento (Web Share API com arquivo). No desktop, faz download.
 */
export async function exportBankPdf(records: any[]): Promise<{ shared: boolean }> {
  const rows = records
    .filter(r => r.date && !r.isGhost)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Mesmos totais do Resumo; o dia ainda aberto não entra.
  const tot = bankTotals(rows);
  const totalBalance = tot.saldo, totalWorked = tot.trabalhado, totalExtra = tot.positivo;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Banco de Horas', 40, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120);
  const now = new Date();
  doc.text(`Gerado em ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 40, 66);

  // Resumo: horas totais, horas extras e saldo do período exportado
  const first = rows[0]?.date.substring(0, 10).split('-').reverse().join('/');
  const last = rows[rows.length - 1]?.date.substring(0, 10).split('-').reverse().join('/');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Período: ${first || '—'} a ${last || '—'}  ·  ${rows.length} dias registrados`, 40, 84);
  autoTable(doc, {
    startY: 96,
    head: [['Horas trabalhadas', 'Saldo positivo', `Pontes (${tot.pontesDias} dias)`, 'Saldo total']],
    body: [[formatHm(totalWorked), totalExtra > 0 ? `+ ${formatHm(totalExtra)}` : '—', signed(tot.pontes), signed(totalBalance)]],
    styles: { fontSize: 12, cellPadding: 6, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: 40, right: 40 },
    tableWidth: pageW - 80,
  });

  // Tabela
  autoTable(doc, {
    startY: ((doc as any).lastAutoTable?.finalY ?? 140) + 18,
    head: [['Data', 'Tipo', 'Horários', 'Saldo', 'Notas']],
    body: rows.map(r => {
      return [
        fmtDate(r.date),
        dayType(r),
        formatHorarios(r),
        signed(r.balanceDiff || 0),
        formatNotas(r),
      ];
    }),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [10, 132, 255], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 3: { fontStyle: 'bold' } },
    margin: { left: 40, right: 40 },
    tableWidth: pageW - 80,
  });

  const blob = doc.output('blob');
  const file = new File([blob], 'banco-de-horas.pdf', { type: 'application/pdf' });

  // Celular: abre a folha de compartilhamento
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Banco de Horas', text: 'Meu banco de horas' });
      return { shared: true };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { shared: true }; // usuário cancelou
      // senão, cai no download
    }
  }

  // Desktop / sem suporte: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'banco-de-horas.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { shared: false };
}
