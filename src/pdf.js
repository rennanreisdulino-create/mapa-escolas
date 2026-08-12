import { jsPDF } from "jspdf";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function line(value) {
  const text = value == null || value === "" ? "—" : String(value);
  return text;
}

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

function writeSection(doc, title, rows, y) {
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(title, margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  for (const [label, value] of rows) {
    const text = `${label}: ${line(value)}`;
    const wrapped = doc.splitTextToSize(text, maxWidth);
    if (y + wrapped.length * 5 > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      y = 20;
    }
    doc.text(wrapped, margin, y);
    y += wrapped.length * 5 + 2;
  }

  return y + 4;
}

export function downloadEscolaPdf(escola) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text("Escolas alvo 2026", margin, y);
  y += 8;

  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(escola.nome, doc.internal.pageSize.getWidth() - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 4;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
  y += 8;

  y = writeSection(doc, "Prioridade", [
    ["Nota de visita", `${escola.score ?? "—"} / 100`],
    ["Ticket", escola.ticket != null ? money.format(escola.ticket) : null],
    ["Alunos", escola.alunos != null ? escola.alunos.toLocaleString("pt-BR") : null],
    ["Ticket ≥ R$ 300", escola.ticketAlto ? "Sim" : "Não"],
    ["Grupo", escola.grupo],
    ["Status", escola.status],
  ], y);

  y = writeSection(doc, "Localização", [
    ["Endereço", escola.endereco],
    ["Bairro", escola.bairro],
    ["Cidade", escola.cidade],
    ["CEP", escola.cep],
  ], y);

  y = writeSection(doc, "Contato", [
    ["Telefone", escola.telefone],
    ["E-mail", escola.email],
  ], y);

  if (escola.obs) {
    y = writeSection(doc, "Observações", [["", escola.obs]], y);
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} · Carteira de escolas prospectadas`,
    margin,
    doc.internal.pageSize.getHeight() - 10
  );

  const filename = `escola-${slugify(escola.nome) || escola.id}.pdf`;
  doc.save(filename);
}

export const downloadIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
