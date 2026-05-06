const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
        Table, TableRow, TableCell, BorderStyle, WidthType, ShadingType } = docx;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { sections, projectName } = req.body;
    if (!sections) return res.status(400).json({ error: 'Nessuna sezione' });

    const gold = 'C9A84C';
    const dark = '111111';
    const gray = '666666';
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cm = { top: 100, bottom: 100, left: 140, right: 140 };

    function h1(text) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text, bold: true, size: 28, color: dark, font: 'Arial' })],
        spacing: { before: 400, after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: gold, space: 2 } }
      });
    }

    function h2(text) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text, bold: true, size: 22, color: '7B6728', font: 'Arial' })],
        spacing: { before: 280, after: 100 }
      });
    }

    function p(text, opts = {}) {
      return new Paragraph({
        children: [new TextRun({ text: String(text || ''), size: 21, color: opts.color || dark, font: 'Arial', italics: opts.italic || false })],
        spacing: { before: opts.before || 80, after: opts.after || 80 }
      });
    }

    function sp() { return p('', { before: 4, after: 4 }); }

    function pb() { return new Paragraph({ children: [new TextRun({ break: 1 })], pageBreakBefore: true }); }

    function lv(label, value) {
      return new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [new TableRow({ children: [
          new TableCell({ borders, width: { size: 2800, type: WidthType.DXA }, margins: cm,
            shading: { fill: 'F8F4EC', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, color: '7B6728', font: 'Arial' })] })]
          }),
          new TableCell({ borders, width: { size: 6560, type: WidthType.DXA }, margins: cm,
            children: [new Paragraph({ children: [new TextRun({ text: String(value || '—'), size: 19, font: 'Arial' })] })]
          })
        ]})]
      });
    }

    const children = [
      // COPERTINA
      new Paragraph({ children: [new TextRun({ text: 'PIANO DI IMPRESA', size: 48, bold: true, color: dark, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: projectName || 'Progetto', size: 56, bold: true, color: gold, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: 'Candidatura Smart&Start Italia — Invitalia S.p.A.', size: 22, color: gray, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long' }), size: 20, color: gray, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 } }),
      new Paragraph({ children: [new TextRun({ text: 'Documento predisposto dal proponente con il supporto di strumenti digitali di analisi e redazione, successivamente verificato e validato dal team proponente.', size: 17, color: 'BBBBBB', font: 'Arial', italics: true })], alignment: AlignmentType.CENTER }),
      pb(),
    ];

    // Sezioni generate dall'AI
    const sectionOrder = ['executive', 'vpc', 'bmc', 'mercato', 'operativo', 'occupazionale', 'innovazione', 'impatto', 'conto_economico', 'fonti_impieghi'];
    const sectionTitles = {
      executive: '1. Executive Summary',
      vpc: '2. Value Proposition Canvas',
      bmc: '3. Business Model Canvas',
      mercato: '4. Analisi di mercato e posizionamento',
      operativo: '5. Piano operativo e milestones',
      occupazionale: '6. Piano occupazionale',
      innovazione: '7. Innovazione tecnologica e proprieta intellettuale',
      impatto: '8. Impatto sociale, ambientale e territoriale',
      conto_economico: '9. Piano finanziario — Conto Economico previsionale',
      fonti_impieghi: '10. Fonti e Impieghi'
    };

    for (const key of sectionOrder) {
      const sec = sections[key];
      if (!sec) continue;
      children.push(h1(sectionTitles[key]));

      if (typeof sec === 'string') {
        children.push(p(sec, { before: 80, after: 80 }));
      } else if (typeof sec === 'object') {
        // JSON sections (VPC, BMC, CE, FI)
        Object.entries(sec).forEach(([k, v]) => {
          if (typeof v === 'string' && v.length > 0) {
            children.push(h2(k.replace(/_/g, ' ').toUpperCase()));
            children.push(p(v, { before: 60, after: 100 }));
          } else if (typeof v === 'number') {
            children.push(lv(k.replace(/_/g, ' '), '€ ' + parseInt(v).toLocaleString('it-IT')));
            children.push(sp());
          }
        });
      }
    }

    // Disclaimer
    children.push(
      p('Documento predisposto dal proponente con il supporto di strumenti digitali di analisi e redazione, successivamente verificato e validato dal team proponente. START ON produce una pre-valutazione tecnica e documentale. La candidatura formale richiede validazione umana e verifica dei requisiti. Le decisioni finali restano in capo all\'ente gestore (Invitalia S.p.A.).', { before: 120, after: 60, color: '999999', italic: true })
    );

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 21 } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: 'Arial', color: dark }, paragraph: { spacing: { before: 480, after: 200 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: 'Arial', color: '7B6728' }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
        ]
      },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Dossier_SmartStart_${(projectName||'progetto').replace(/\s+/g,'_')}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
