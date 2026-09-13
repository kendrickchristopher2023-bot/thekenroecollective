// Client-side export of the Owner Report to PDF and DOCX.
// Numbers only, no advice of any kind.

export type ExportKpi = { label: string; value: string; change: string };
export type ExportTable = { title: string; head: string[]; rows: string[][] };

export type ExportPayload = {
  periodLabel: string;
  ventureLabel: string;
  scopeNotes: string[];
  rangeLabel: string;
  comparisonLabel: string;
  generatedLabel: string;
  environment: string;
  kpis: ExportKpi[];
  tables: ExportTable[];
};


const BRAND = "The Kenroe Collective";
const WALNUT: [number, number, number] = [92, 60, 40];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fileStem(payload: ExportPayload): string {
  const safe = payload.rangeLabel.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
  const v = payload.ventureLabel.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `kenroe-owner-report-${v || "all"}-${safe || "period"}`;
}


export async function buildReportPdf(payload: ExportPayload) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  let y = margin;

  doc.setTextColor(...WALNUT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(BRAND, margin, y);
  y += 22;
  doc.setFontSize(14);
  doc.text("Owner Report", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text(`Venture: ${payload.ventureLabel}`, margin, y);
  y += 14;
  doc.text(`Period: ${payload.periodLabel} (${payload.rangeLabel})`, margin, y);
  y += 14;
  doc.text(`Compared with: ${payload.comparisonLabel}`, margin, y);
  y += 14;
  doc.text(`Payments source: ${payload.environment}`, margin, y);
  y += 14;
  doc.text(`Generated: ${payload.generatedLabel}`, margin, y);
  y += 4;
  for (const note of payload.scopeNotes) {
    y += 14;
    for (const line of doc.splitTextToSize(note, 500) as string[]) {
      doc.text(line, margin, y);
      y += 12;
    }
  }
  y += 6;


  autoTable(doc, {
    startY: y + 10,
    head: [["Metric", "This period", "Change vs prior"]],
    body: payload.kpis.map((k) => [k.label, k.value, k.change]),
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: WALNUT, textColor: 255 },
    margin: { left: margin, right: margin },
  });

  for (const table of payload.tables) {
    const prev = (doc as any).lastAutoTable?.finalY ?? y;
    let titleY = prev + 30;
    if (titleY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      titleY = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...WALNUT);
    doc.text(table.title, margin, titleY);
    autoTable(doc, {
      startY: titleY + 10,
      head: [table.head],
      body: table.rows,
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: WALNUT, textColor: 255 },
      margin: { left: margin, right: margin },
    });
  }

  return doc;
}

export async function exportReportPdf(payload: ExportPayload) {
  const doc = await buildReportPdf(payload);
  doc.save(`${fileStem(payload)}.pdf`);
}

export async function buildReportDocx(payload: ExportPayload) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    BorderStyle,
    HeadingLevel,
  } = await import("docx");

  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };
  const CONTENT = 9360;

  function makeTable(head: string[], rows: string[][]) {
    const colWidth = Math.floor(CONTENT / head.length);
    const widths = head.map((_, i) =>
      i === head.length - 1 ? CONTENT - colWidth * (head.length - 1) : colWidth,
    );
    return new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({
          children: head.map((h, i) =>
            new TableCell({
              borders,
              margins,
              width: { size: widths[i], type: WidthType.DXA },
              shading: { fill: "EFE6DE", type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
            }),
          ),
        }),
        ...rows.map(
          (r) =>
            new TableRow({
              children: r.map((cell, i) =>
                new TableCell({
                  borders,
                  margins,
                  width: { size: widths[i], type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun(cell)] })],
                }),
              ),
            }),
        ),
      ],
    });
  }

  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `${BRAND} Owner Report`, bold: true })],
    }),
    new Paragraph({ children: [new TextRun(`Venture: ${payload.ventureLabel}`)] }),
    new Paragraph({
      children: [new TextRun(`Period: ${payload.periodLabel} (${payload.rangeLabel})`)],
    }),
    new Paragraph({ children: [new TextRun(`Compared with: ${payload.comparisonLabel}`)] }),
    new Paragraph({ children: [new TextRun(`Payments source: ${payload.environment}`)] }),
    new Paragraph({ children: [new TextRun(`Generated: ${payload.generatedLabel}`)] }),
    ...payload.scopeNotes.map(
      (note) => new Paragraph({ children: [new TextRun({ text: note, italics: true })] }),
    ),
    new Paragraph({ children: [new TextRun("")] }),

    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Key numbers", bold: true })],
    }),
    makeTable(
      ["Metric", "This period", "Change vs prior"],
      payload.kpis.map((k) => [k.label, k.value, k.change]),
    ),
  ];

  for (const t of payload.tables) {
    children.push(new Paragraph({ children: [new TextRun("")] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: t.title, bold: true })],
      }),
    );
    children.push(makeTable(t.head, t.rows));
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, font: "Arial", color: "5C3C28" },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 26, bold: true, font: "Arial", color: "5C3C28" },
          paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

export async function exportReportDocx(payload: ExportPayload) {
  const { Packer } = await import("docx");
  const doc = await buildReportDocx(payload);
  const blob = await Packer.toBlob(doc);
  download(blob, `${fileStem(payload)}.docx`);
}
