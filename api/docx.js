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

    // Estrae il contenuto reale dalla sezione (gestisce sia {type,data} che valori diretti)
    function extractContent(sec) {
      if (!sec) return null;
      if (typeof sec === 'string') return { type: 'text', data: sec };
      if (typeof sec === 'object' && sec.type && sec.data !== undefined) return sec;
      // oggetto JSON diretto (vecchio formato)
      return { type: 'json', data: sec };
    }

    function formatEuro(n) {
      if (typeof n !== 'number') return String(n || '—');
      return '€ ' + parseInt(n).toLocaleString('it-IT');
    }

    function ceTable(ce) {
      // Conto Economico: tabella anni in colonne
      const anni = ['anno1', 'anno2', 'anno3'];
      const righe = [
        { k: 'ricavi_totali', label: 'RICAVI TOTALI', bold: true },
        { k: 'costo_venduto', label: 'Costo del venduto' },
        { k: 'margine_lordo', label: 'MARGINE LORDO', bold: true },
        { k: 'costi_personale', label: 'Costi personale' },
        { k: 'costi_marketing', label: 'Costi marketing' },
        { k: 'costi_tech', label: 'Costi tecnologia' },
        { k: 'costi_consulenze', label: 'Consulenze' },
        { k: 'costi_amm', label: 'Costi amministrativi' },
        { k: 'altri_costi', label: 'Altri costi' },
        { k: 'costi_operativi_totali', label: 'TOTALE COSTI OPERATIVI', bold: true },
        { k: 'ebitda', label: 'EBITDA', bold: true },
        { k: 'ammortamenti', label: 'Ammortamenti' },
        { k: 'ebit', label: 'EBIT', bold: true },
        { k: 'oneri_finanziari', label: 'Oneri finanziari' },
        { k: 'risultato_ante_imposte', label: 'Risultato ante imposte', bold: true },
        { k: 'imposte', label: 'Imposte' },
        { k: 'utile_netto', label: 'UTILE / PERDITA NETTO', bold: true },
      ];

      const headerRow = new TableRow({ children: [
        new TableCell({ borders, width: { size: 3800, type: WidthType.DXA }, margins: cm, shading: { fill: 'C9A84C', type: ShadingType.CLEAR },
          children: [new Paragraph({ children: [new TextRun({ text: 'Voce', bold: true, size: 18, color: 'FFFFFF', font: 'Arial' })] })] }),
        ...anni.map(a => new TableCell({ borders, width: { size: 1850, type: WidthType.DXA }, margins: cm, shading: { fill: 'C9A84C', type: ShadingType.CLEAR },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: a.replace('anno', 'Anno '), bold: true, size: 18, color: 'FFFFFF', font: 'Arial' })] })] }))
      ]});

      const dataRows = righe.map((riga, idx) => {
        const fill = riga.bold ? 'F8F4EC' : (idx % 2 === 0 ? 'FFFFFF' : 'FAFAFA');
        return new TableRow({ children: [
          new TableCell({ borders, width: { size: 3800, type: WidthType.DXA }, margins: cm, shading: { fill, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: riga.label, bold: riga.bold || false, size: 18, color: dark, font: 'Arial' })] })] }),
          ...anni.map(a => {
            const val = ce[a] ? ce[a][riga.k] : null;
            const txt = val !== undefined && val !== null ? formatEuro(val) : '—';
            const color = typeof val === 'number' && val < 0 ? 'B00020' : dark;
            return new TableCell({ borders, width: { size: 1850, type: WidthType.DXA }, margins: cm, shading: { fill, type: ShadingType.CLEAR },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: txt, bold: riga.bold || false, size: 18, color, font: 'Arial' })] })] });
          })
        ]});
      });

      return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3800, 1850, 1850, 1860], rows: [headerRow, ...dataRows] });
    }

    function fiTable(fi) {
      const rows = [];
      function addRow(label, value, bold, fill) {
        rows.push(new TableRow({ children: [
          new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, margins: cm, shading: { fill: fill || 'FFFFFF', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: bold || false, size: 18, color: dark, font: 'Arial' })] })] }),
          new TableCell({ borders, width: { size: 4360, type: WidthType.DXA }, margins: cm, shading: { fill: fill || 'FFFFFF', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatEuro(value), bold: bold || false, size: 18, font: 'Arial' })] })] }),
        ]}));
      }
      function headerRow(label) {
        rows.push(new TableRow({ children: [
          new TableCell({ borders, columnSpan: 2, width: { size: 9360, type: WidthType.DXA }, margins: cm, shading: { fill: 'C9A84C', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, color: 'FFFFFF', font: 'Arial' })] })] }),
        ]}));
      }

      const imp = fi.impieghi || {};
      const fon = fi.fonti || {};

      headerRow('IMPIEGHI');
      if (imp.immateriali) addRow('Immobilizzazioni immateriali — ' + (imp.immateriali.descrizione || ''), imp.immateriali.importo);
      if (imp.materiali) addRow('Immobilizzazioni materiali — ' + (imp.materiali.descrizione || ''), imp.materiali.importo);
      if (imp.circolante) addRow('Capitale circolante — ' + (imp.circolante.descrizione || ''), imp.circolante.importo);
      addRow('TOTALE IMPIEGHI', imp.totale, true, 'F8F4EC');

      headerRow('FONTI');
      if (fon.smartstart_prestito) addRow('Finanziamento Smart&Start (prestito) — ' + (fon.smartstart_prestito.descrizione || ''), fon.smartstart_prestito.importo);
      if (fon.smartstart_fondo_perduto) addRow('Contributo a fondo perduto Smart&Start — ' + (fon.smartstart_fondo_perduto.descrizione || ''), fon.smartstart_fondo_perduto.importo);
      if (fon.capitale_proprio) addRow('Capitale proprio soci — ' + (fon.capitale_proprio.descrizione || ''), fon.capitale_proprio.importo);
      if (fon.co_investitori && fon.co_investitori.importo > 0) addRow('Co-investitori — ' + (fon.co_investitori.descrizione || ''), fon.co_investitori.importo);
      addRow('TOTALE FONTI', fon.totale, true, 'F8F4EC');

      return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [5000, 4360], rows });
    }

    function vpcSection(vpc) {
      const campi = [
        { k: 'attivita', label: 'Attività del cliente' },
        { k: 'difficolta', label: 'Difficoltà del cliente' },
        { k: 'vantaggi', label: 'Vantaggi attesi' },
        { k: 'prodotti', label: 'Prodotti e servizi' },
        { k: 'attenuatori', label: 'Attenuatori di difficoltà' },
        { k: 'generatori', label: 'Generatori di vantaggi' },
      ];
      const result = [];
      campi.forEach(({ k, label }) => {
        if (vpc[k]) {
          result.push(h2(label));
          result.push(p(vpc[k], { before: 60, after: 120 }));
        }
      });
      return result;
    }

    function bmcSection(bmc) {
      const campi = [
        { k: 'segmenti', label: 'Segmenti di clientela' },
        { k: 'proposta', label: 'Proposta di valore' },
        { k: 'canali', label: 'Canali' },
        { k: 'relazioni', label: 'Relazioni con i clienti' },
        { k: 'ricavi', label: 'Flussi di ricavi' },
        { k: 'risorse', label: 'Risorse chiave' },
        { k: 'attivita', label: 'Attività chiave' },
        { k: 'partner', label: 'Partner chiave' },
        { k: 'costi', label: 'Struttura dei costi' },
      ];
      const result = [];
      campi.forEach(({ k, label }) => {
        if (bmc[k]) {
          result.push(h2(label));
          result.push(p(bmc[k], { before: 60, after: 120 }));
        }
      });
      return result;
    }

    for (const key of sectionOrder) {
      const raw = sections[key];
      if (!raw) continue;
      const sec = extractContent(raw);
      if (!sec) continue;

      children.push(h1(sectionTitles[key]));

      if (sec.type === 'text') {
        // Testo narrativo: spezza per paragrafi
        const testo = String(sec.data || '');
        const paragrafi = testo.split(/\n{2,}/).filter(Boolean);
        if (paragrafi.length > 1) {
          paragrafi.forEach(par => children.push(p(par.trim(), { before: 80, after: 100 })));
        } else {
          // spezza per singole newline
          testo.split('\n').filter(Boolean).forEach(riga => children.push(p(riga.trim(), { before: 60, after: 80 })));
        }
      } else if (sec.type === 'json') {
        const data = sec.data || {};
        if (key === 'vpc') {
          vpcSection(data).forEach(el => children.push(el));
        } else if (key === 'bmc') {
          bmcSection(data).forEach(el => children.push(el));
        } else if (key === 'conto_economico') {
          children.push(ceTable(data));
          children.push(sp());
          if (data.note) children.push(p('Note: ' + data.note, { before: 120, after: 80, color: gray, italic: true }));
        } else if (key === 'fonti_impieghi') {
          children.push(fiTable(data));
          children.push(sp());
          if (data.note) children.push(p('Note: ' + data.note, { before: 120, after: 80, color: gray, italic: true }));
        } else {
          // fallback: dump chiave/valore
          Object.entries(data).forEach(([k, v]) => {
            if (typeof v === 'string' && v.length > 0) {
              children.push(h2(k.replace(/_/g, ' ')));
              children.push(p(v, { before: 60, after: 100 }));
            }
          });
        }
      } else {
        // stringa diretta (compatibilità)
        children.push(p(String(sec), { before: 80, after: 80 }));
      }

      children.push(pb());
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
