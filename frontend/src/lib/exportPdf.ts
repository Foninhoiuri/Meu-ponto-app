import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { workedMinutes, formatHm, isWithinTolerance } from './records';

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
  if (r.isAbsence) return r.isJustified ? 'Falta just.' : 'Falta';
  if (r.isPlantao) return 'Plantão';
  if (r.isPonte) return 'Ponte';
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

  const totalBalance = rows.reduce((acc, r) => acc + (r.balanceDiff || 0), 0);
  const totalWorked = rows.reduce((acc, r) => acc + workedMinutes(r), 0);

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

  // Resumo
  doc.setTextColor(30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  const saldoTxt = `Saldo total: ${signed(totalBalance)}`;
  doc.text(saldoTxt, 40, 92);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Total trabalhado: ${formatHm(totalWorked)}  ·  ${rows.length} dias registrados`, 40, 108);

  // Tabela
  autoTable(doc, {
    startY: 124,
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
