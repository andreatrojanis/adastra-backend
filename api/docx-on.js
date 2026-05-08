const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak, ImageRun
} = docx;
const { Resvg } = require('@resvg/resvg-js');
const charts = require('./charts.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { sections, projectName } = req.body;
    if (!sections) return res.status(400).json({ error: 'Nessuna sezione' });

    // ── PALETTE E COSTANTI ──
    const gold = 'C9A84C', goldLight = 'F0ECE6', dark = '111111';
    const gray = '555555', grayLight = '888888', green = '0A7F2E';
    const red = 'B00020', white = 'FFFFFF';
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cm = { top: 100, bottom: 100, left: 140, right: 140 };
    const cmLg = { top: 140, bottom: 140, left: 200, right: 200 };

    // ── HELPERS ──
    const h1 = (text) => new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text, bold: true, size: 30, color: dark, font: 'Arial' })],
      spacing: { before: 480, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: gold, space: 4 } }
    });

    const h2 = (text) => new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, bold: true, size: 22, color: '7B6728', font: 'Arial' })],
      spacing: { before: 280, after: 100 }
    });

    const p = (text, opts = {}) => new Paragraph({
      children: [new TextRun({ text: String(text || ''), size: opts.size || 20, color: opts.color || dark, font: 'Arial', italics: opts.italic || false, bold: opts.bold || false })],
      spacing: { before: opts.before || 80, after: opts.after || 80 },
      alignment: opts.align || AlignmentType.LEFT
    });

    const sp = () => p('', { before: 60, after: 60 });
    const pb = () => new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } });

    const eyebrow = (text) => new Paragraph({
      children: [new TextRun({ text: text.toUpperCase(), size: 16, color: gold, font: 'Arial', bold: true })],
      spacing: { before: 0, after: 80 }
    });

    const kpiRow = (items) => {
      const w = Math.floor(9360 / items.length);
      return new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: items.map(() => w),
        rows: [new TableRow({ children: items.map(item => new TableCell({
          borders, width: { size: w, type: WidthType.DXA }, margins: cmLg,
          shading: { fill: goldLight, type: ShadingType.CLEAR },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(item.value || ''), bold: true, size: 32, color: gold, font: 'Arial' })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(item.label || ''), size: 16, color: gray, font: 'Arial' })] }),
            ...(item.sub ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(item.sub), size: 14, color: grayLight, font: 'Arial', italics: true })] })] : [])
          ]
        }))})]
      });
    };

    const tableFromArray = (allRows, widths) => {
      if (!allRows || allRows.length < 2) return sp();
      const headers = allRows[0];
      const rows = allRows.slice(1);
      const total = 9360;
      const colW = widths || headers.map(() => Math.floor(total / headers.length));
      const headerRow = new TableRow({ children: headers.map((h, i) => new TableCell({
        borders, width: { size: colW[i], type: WidthType.DXA }, margins: cm,
        shading: { fill: gold, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: String(h || ''), bold: true, size: 18, color: white, font: 'Arial' })] })]
      }))});
      const dataRows = rows.map((row, ri) => new TableRow({ children: row.map((cell, ci) => new TableCell({
        borders, width: { size: colW[ci] || Math.floor(total / headers.length), type: WidthType.DXA }, margins: cm,
        shading: { fill: ri % 2 === 0 ? 'FFFFFF' : 'FAFAFA', type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: String(cell || '—'), size: 18, color: dark, font: 'Arial' })] })]
      }))}));
      return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: colW, rows: [headerRow, ...dataRows] });
    };

    const colorBox = (title, text, color) => {
      const fill = color === 'gold' ? goldLight : color === 'green' ? 'F0FFF4' : 'FFF5F5';
      const bc = color === 'gold' ? gold : color === 'green' ? '0A7F2E' : 'B00020';
      return new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 2, color: bc }, bottom: { style: BorderStyle.SINGLE, size: 2, color: bc }, left: { style: BorderStyle.THICK, size: 12, color: bc }, right: { style: BorderStyle.SINGLE, size: 2, color: bc } },
          width: { size: 9360, type: WidthType.DXA }, margins: cmLg,
          shading: { fill, type: ShadingType.CLEAR },
          children: [
            ...(title ? [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: bc, font: 'Arial' })] })] : []),
            new Paragraph({ children: [new TextRun({ text: String(text || ''), size: 19, color: dark, font: 'Arial' })] })
          ]
        })]})],
      });
    };

    const colorBox2 = (title, body, color) => {
      const fill = color === 'gold' ? goldLight : color === 'green' ? 'F0FFF4' : 'FFF5F5';
      const bc = color === 'gold' ? gold : color === 'green' ? '0A7F2E' : 'B00020';
      return new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 2, color: bc }, bottom: { style: BorderStyle.SINGLE, size: 2, color: bc }, left: { style: BorderStyle.THICK, size: 12, color: bc }, right: { style: BorderStyle.SINGLE, size: 2, color: bc } },
          width: { size: 9360, type: WidthType.DXA }, margins: cmLg,
          shading: { fill, type: ShadingType.CLEAR },
          children: [
            new Paragraph({ children: [new TextRun({ text: String(title || ''), bold: true, size: 20, color: bc, font: 'Arial' })] }),
            new Paragraph({ children: [new TextRun({ text: String(body || ''), size: 19, color: dark, font: 'Arial' })] })
          ]
        })]})],
      });
    };

    // ── SVG → PNG → ImageRun ──
    const svgToPng = (svg, width) => {
      try {
        const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
        return resvg.render().asPng();
      } catch (e) { return null; }
    };

    const imgParagraph = (pngBuffer, widthEmu, heightEmu) => {
      if (!pngBuffer) return sp();
      return new Paragraph({
        children: [new ImageRun({ data: pngBuffer, transformation: { width: Math.round(widthEmu / 9144), height: Math.round(heightEmu / 9144) } })],
        spacing: { before: 80, after: 80 }
      });
    };

    // EMU constants (1 cm = 360000 EMU, 1 inch = 914400 EMU)
    // Page content width = ~16cm = 5760000 EMU → in points ~453pt
    const PAGE_W_PX = 680; // px at 96dpi for full page width
    const PAGE_W_EMU = 5486400;

    const chartImg = (svg, svgW, svgH, targetWidthEmu) => {
      const pngW = Math.round(svgW * (targetWidthEmu / (svgW * 9144)));
      const png = svgToPng(svg, Math.max(svgW, 400));
      if (!png) return sp();
      const ratio = svgH / svgW;
      return new Paragraph({
        children: [new ImageRun({
          data: png,
          transformation: { width: Math.round(targetWidthEmu / 9144), height: Math.round(targetWidthEmu / 9144 * ratio) }
        })],
        spacing: { before: 100, after: 100 }
      });
    };

    const bullet = (text) => new Paragraph({
      numbering: { reference: 'bullets', level: 0 },
      children: [new TextRun({ text: String(text || ''), size: 19, color: dark, font: 'Arial' })],
      spacing: { before: 40, after: 40 }
    });

    const timelineItem = (fase) => new Table({
      width: { size: 9360, type: WidthType.DXA }, columnWidths: [1800, 7560],
      rows: [new TableRow({ children: [
        new TableCell({
          borders: { top: border, bottom: border, left: { style: BorderStyle.THICK, size: 12, color: gold }, right: border },
          width: { size: 1800, type: WidthType.DXA }, margins: cm,
          shading: { fill: goldLight, type: ShadingType.CLEAR },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(fase.nome || ''), bold: true, size: 20, color: '7B6728', font: 'Arial' })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(fase.periodo || ''), size: 16, color: grayLight, font: 'Arial' })] })
          ]
        }),
        new TableCell({
          borders, width: { size: 7560, type: WidthType.DXA }, margins: cm,
          children: [
            ...(fase.attivita || []).map(a => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: String(a), size: 18, color: dark, font: 'Arial' })], spacing: { before: 30, after: 30 } })),
            new Paragraph({ children: [new TextRun({ text: String(fase.kpi || ''), size: 17, color: green, font: 'Arial', bold: true })], spacing: { before: 60, after: 0 } })
          ]
        })
      ]})]
    });

    const ceTable = (data) => {
      const anni = ['anno1', 'anno2', 'anno3'];
      const fmt = (n) => {
        if (n === undefined || n === null) return '—';
        const v = parseInt(n);
        return (v < 0 ? '- ' : '') + '€ ' + Math.abs(v).toLocaleString('it-IT');
      };
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
        new TableCell({ borders, width: { size: 3800, type: WidthType.DXA }, margins: cm, shading: { fill: gold, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Voce', bold: true, size: 18, color: white, font: 'Arial' })] })] }),
        ...anni.map(a => new TableCell({ borders, width: { size: 1853, type: WidthType.DXA }, margins: cm, shading: { fill: gold, type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: a.replace('anno', 'Anno '), bold: true, size: 18, color: white, font: 'Arial' })] })] }))
      ]});
      const dataRows = righe.map((riga, idx) => {
        const isNeg = anni.some(a => data[a] && data[a][riga.k] < 0);
        const fill = riga.bold ? goldLight : (idx % 2 === 0 ? 'FFFFFF' : 'FAFAFA');
        return new TableRow({ children: [
          new TableCell({ borders, width: { size: 3800, type: WidthType.DXA }, margins: cm, shading: { fill, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: riga.label, bold: riga.bold || false, size: 18, color: dark, font: 'Arial' })] })] }),
          ...anni.map(a => {
            const val = data[a] ? data[a][riga.k] : null;
            const txt = val !== undefined && val !== null ? fmt(val) : '—';
            const col = typeof val === 'number' && val < 0 ? red : dark;
            return new TableCell({ borders, width: { size: 1853, type: WidthType.DXA }, margins: cm, shading: { fill, type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: txt, bold: riga.bold || false, size: 18, color: col, font: 'Arial' })] })] });
          })
        ]});
      });
      return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3800, 1853, 1853, 1854], rows: [headerRow, ...dataRows] });
    };

    const fiTable = (data) => {
      const fmt = (n) => n ? '€ ' + parseInt(n).toLocaleString('it-IT') : '—';
      const rows = [];
      const hdr = (label) => rows.push(new TableRow({ children: [new TableCell({ borders, columnSpan: 2, width: { size: 9360, type: WidthType.DXA }, margins: cm, shading: { fill: gold, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: white, font: 'Arial' })] })] })] }));
      const row = (label, desc, val, bold, idx) => rows.push(new TableRow({ children: [
        new TableCell({ borders, width: { size: 6200, type: WidthType.DXA }, margins: cm, shading: { fill: idx%2===0?'FFFFFF':'FAFAFA', type: ShadingType.CLEAR }, children: [
          new Paragraph({ children: [new TextRun({ text: String(label||''), bold: bold||false, size: 18, color: dark, font: 'Arial' })] }),
          ...(desc ? [new Paragraph({ children: [new TextRun({ text: String(desc), size: 17, color: gray, font: 'Arial' })] })] : [])
        ]}),
        new TableCell({ borders, width: { size: 3160, type: WidthType.DXA }, margins: cm, shading: { fill: idx%2===0?'FFFFFF':'FAFAFA', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(val), bold: bold||false, size: 20, color: dark, font: 'Arial' })] })] })
      ]}));
      const totRow = (label, val) => rows.push(new TableRow({ children: [
        new TableCell({ borders, width: { size: 6200, type: WidthType.DXA }, margins: cm, shading: { fill: goldLight, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: '7B6728', font: 'Arial' })] })] }),
        new TableCell({ borders, width: { size: 3160, type: WidthType.DXA }, margins: cm, shading: { fill: goldLight, type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(val), bold: true, size: 22, color: '7B6728', font: 'Arial' })] })] })
      ]}));

      hdr('IMPIEGHI');
      (data.impieghi || []).forEach((i, idx) => row(i.label, i.desc, i.importo, false, idx));
      totRow('TOTALE IMPIEGHI', data.totale);
      hdr('FONTI');
      (data.fonti || []).forEach((f, idx) => row(f.label, f.desc, f.importo, false, idx));
      totRow('TOTALE FONTI', data.totale);
      return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [6200, 3160], rows });
    };

    // ── ESTRAI DATI DA SEZIONE ──
    const getData = (key) => {
      const sec = sections[key];
      if (!sec) return null;
      if (sec && sec.type === 'json') return sec.data;
      if (sec && sec.type === 'text') return sec.data;
      if (typeof sec === 'object' && !sec.type) return sec;
      return null;
    };

    const children = [];

    // ── COPERTINA ──
    children.push(
      sp(), sp(),
      new Paragraph({ children: [new TextRun({ text: 'PIANO DI IMPRESA', size: 48, bold: true, color: dark, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 800, after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: projectName || 'Progetto', size: 64, bold: true, color: gold, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 } }),
      new Paragraph({ children: [new TextRun({ text: 'Candidatura Smart&Start Italia — Invitalia S.p.A.', size: 22, color: gray, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 } }),
      new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long' }), size: 20, color: grayLight, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 } }),
    );

    // KPI copertina da executive se disponibile
    const exec = getData('executive');
    if (exec && exec.kpi) children.push(kpiRow(exec.kpi));
    else children.push(kpiRow([
      { value: '—', label: 'Investimento' }, { value: '—', label: 'Compagine' },
      { value: '—', label: 'Occupazione' }, { value: '—', label: 'Break-even' }
    ]));

    children.push(
      sp(),
      new Paragraph({ children: [new TextRun({ text: 'Documento predisposto dal team proponente con supporto di strumenti digitali. La candidatura formale richiede validazione professionale e verifica dei requisiti.', size: 16, color: grayLight, font: 'Arial', italics: true })], alignment: AlignmentType.CENTER }),
      pb()
    );

    // ── S1: EXECUTIVE SUMMARY ──
    const e = exec || {};
    children.push(eyebrow('Sezione 01'), h1('Executive Summary'), sp());
    if (e.problema) { children.push(h2('Il problema'), p(e.problema), sp()); }
    if (e.soluzione_bullets && e.soluzione_bullets.length) {
      children.push(h2('La soluzione'));
      e.soluzione_bullets.forEach(b => children.push(bullet(b)));
      children.push(sp());
    }
    if (e.vantaggio_competitivo) children.push(colorBox2('Vantaggio competitivo', e.vantaggio_competitivo, 'gold'), sp());
    if (e.profilo_compagine) children.push(colorBox2('Profilo compagine — Requisito ON', e.profilo_compagine, 'green'), sp());
    if (e.mercato_kpi && e.mercato_kpi.length) { children.push(h2('Il mercato'), kpiRow(e.mercato_kpi), sp()); }
    if (e.business_model_rows && e.business_model_rows.length > 1) {
      children.push(h2('Modello di business'));
      children.push(tableFromArray(e.business_model_rows, [2200, 1800, 2800, 2560]));
      children.push(sp());
    }
    if (e.kpi_triennio && e.kpi_triennio.length > 1) {
      children.push(h2('KPI attesi — Triennio'));
      children.push(tableFromArray(e.kpi_triennio, [3200, 2053, 2053, 2054]));
      children.push(sp());
    }
    if (e.fabbisogno_kpi && e.fabbisogno_kpi.length) { children.push(h2('Fabbisogno finanziario'), kpiRow(e.fabbisogno_kpi), sp()); }
    if (e.perche_on) children.push(colorBox2('Perché ON — Oltre Nuove Imprese', e.perche_on, 'green'), sp());

    // Scoring card ON
    const scoreON = e.score_on || 38;
    const radarVals = e.radar_values || { compagine: 75, progetto: 70, mercato: 65, piano_economico: 60, occupazione: 72, impatto: 68 };
    const scoringPng = svgToPng(charts.scoringCard(scoreON, Math.round(scoreON * 1.05), e.verdict || 'AMMISSIBILE', e.decisione || 'GO CON OTTIMIZZAZIONI'), 800);
    if (scoringPng) children.push(h2('Scoring panel AI'), imgParagraph(scoringPng, Math.round(800 * 9144 * 0.85), Math.round(320 * 9144 * 0.85)), sp());
    const radarPng = svgToPng(charts.radarChart(radarVals), 600);
    if (radarPng) children.push(imgParagraph(radarPng, Math.round(600 * 9144 * 0.7), Math.round(560 * 9144 * 0.7)), sp());
    children.push(pb());

    // ── S2: COMPAGINE SOCIETARIA ──
    const comp = getData('compagine') || {};
    children.push(eyebrow('Sezione 02'), h1('Compagine Societaria'), sp());
    if (comp.requisito_soddisfatto !== undefined) {
      const reqOk = comp.requisito_soddisfatto;
      children.push(colorBox2(
        reqOk ? '✓ Requisito compagine SODDISFATTO' : '⚠ Requisito compagine DA VERIFICARE',
        `Quota agevolabile: ${comp.percentuale_agevolabile || '—'}% — ${comp.nota_ammissibilita || ''}`,
        reqOk ? 'green' : 'gold'
      ), sp());
    }
    if (comp.tabella_soci && comp.tabella_soci.length > 1) {
      children.push(h2('Struttura societaria'));
      children.push(tableFromArray(comp.tabella_soci, [2000, 800, 800, 800, 800, 4160]));
      children.push(sp());
    }
    if (comp.sintesi_compagine) { children.push(h2('Sintesi del gruppo proponente'), p(comp.sintesi_compagine), sp()); }
    if (comp.punti_forza_compagine && comp.punti_forza_compagine.length) {
      children.push(h2('Punti di forza del team'));
      comp.punti_forza_compagine.forEach(b => children.push(bullet(b)));
      children.push(sp());
    }
    if (comp.gap_da_colmare && comp.gap_da_colmare.length) {
      children.push(h2('Gap da colmare'));
      comp.gap_da_colmare.forEach(b => children.push(bullet(b)));
      children.push(sp());
    }
    if (comp.advisor_mentor) children.push(colorBox2('Advisor / Mentore', comp.advisor_mentor, 'gold'), sp());
    children.push(pb());

    // ── S3: DESCRIZIONE PROGETTO ──
    const prog = getData('progetto') || {};
    children.push(eyebrow('Sezione 03'), h1('Descrizione del Progetto'), sp());
    if (prog.descrizione_sintetica) { children.push(h2('Il progetto in sintesi'), p(prog.descrizione_sintetica), sp()); }
    if (prog.innovazione_tabella && prog.innovazione_tabella.length > 1) {
      children.push(h2('Innovazione apportata'));
      children.push(tableFromArray(prog.innovazione_tabella, [1800, 3780, 3780]));
      children.push(sp());
    }
    if (prog.trl_label) children.push(colorBox2('Stadio di sviluppo', prog.trl_label, 'gold'), sp());
    if (prog.investimento_breakdown && prog.investimento_breakdown.length > 1) {
      children.push(h2('Piano di investimento — Spese ammissibili ON'));
      children.push(tableFromArray(prog.investimento_breakdown, [2800, 1600, 1200, 3760]));
      children.push(sp());
    }
    if (prog.localizzazione) { children.push(h2('Localizzazione'), p(prog.localizzazione), sp()); }
    if (prog.tempistiche) children.push(colorBox2('Tempistiche realizzazione', prog.tempistiche, 'gold'), sp());
    // Diagramma processo
    const processPng = svgToPng(charts.processDiagram(), 800);
    if (processPng) children.push(h2('Flusso operativo'), imgParagraph(processPng, Math.round(800 * 9144 * 0.85), Math.round(180 * 9144 * 0.85)), sp());
    children.push(pb());

    // ── S4: MERCATO ──
    const mkt = getData('mercato') || {};
    children.push(eyebrow('Sezione 04'), h1('Analisi di mercato e posizionamento'), sp());
    if (mkt.mercato_riferimento) { children.push(h2('Mercato di riferimento'), p(mkt.mercato_riferimento), sp()); }
    if (mkt.tam_sam_som && mkt.tam_sam_som.length > 1) {
      children.push(h2('Dimensionamento del mercato'));
      children.push(tableFromArray(mkt.tam_sam_som, [1400, 3200, 1800, 2960]));
      children.push(sp());
    }
    if (mkt.trend_bullets && mkt.trend_bullets.length) {
      children.push(h2('Trend di mercato'));
      mkt.trend_bullets.forEach(b => children.push(bullet(b)));
      children.push(sp());
    }
    if (mkt.competitor_tabella && mkt.competitor_tabella.length > 1) {
      children.push(h2('Analisi competitiva'));
      children.push(tableFromArray(mkt.competitor_tabella, [2200, 1400, 2200, 3560]));
      children.push(sp());
    }
    if (mkt.differenziazione) children.push(colorBox2('Differenziazione e posizionamento', mkt.differenziazione, 'gold'), sp());
    if (mkt.validazione_mercato) children.push(colorBox2('Validazione di mercato', mkt.validazione_mercato, 'green'), sp());
    children.push(pb());

    // ── S5: PIANO OPERATIVO ──
    const op = getData('operativo') || {};
    children.push(eyebrow('Sezione 05'), h1('Piano operativo e milestones'), sp());
    if (op.fasi && op.fasi.length) {
      const tlFasi = op.fasi.map(f => ({
        nome: f.nome, periodo: f.periodo,
        kpi_sintetico: (f.kpi || '').split('·')[0].replace('KPI:', '').trim().substring(0, 35)
      }));
      const tlPng = svgToPng(charts.timelineVisual(tlFasi), 900);
      if (tlPng) children.push(imgParagraph(tlPng, Math.round(900 * 9144 * 0.85), Math.round(200 * 9144 * 0.85)), sp());
    }
    (op.fasi || []).forEach((fase, i) => {
      children.push(timelineItem(fase));
      if (i < (op.fasi.length - 1)) children.push(sp());
    });
    if (op.milestone_invitalia && op.milestone_invitalia.length) {
      children.push(sp(), h2('Milestone verificabili da Invitalia — Tutoraggio'));
      op.milestone_invitalia.forEach(m => children.push(bullet(m)));
    }
    children.push(pb());

    // ── S6: OCCUPAZIONE ──
    const occ = getData('occupazione') || {};
    children.push(eyebrow('Sezione 06'), h1('Piano Occupazionale'), sp());
    if (occ.kpi_occupazione && occ.kpi_occupazione.length) { children.push(kpiRow(occ.kpi_occupazione), sp()); }
    if (occ.team_fondatore) {
      const f = occ.team_fondatore;
      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [2200, 7160],
        rows: [new TableRow({ children: [
          new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, margins: cmLg, shading: { fill: gold, type: ShadingType.CLEAR }, children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'RESPONSABILE', bold: true, size: 18, color: white, font: 'Arial' })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(f.nome || ''), bold: true, size: 19, color: white, font: 'Arial' })] })
          ]}),
          new TableCell({ borders, width: { size: 7160, type: WidthType.DXA }, margins: cm, children: [
            new Paragraph({ children: [new TextRun({ text: 'Esperienza: ', bold: true, size: 19, font: 'Arial', color: dark }), new TextRun({ text: String(f.esperienza || ''), size: 19, font: 'Arial', color: dark })] }),
            new Paragraph({ children: [new TextRun({ text: 'Ruolo operativo: ', bold: true, size: 19, font: 'Arial', color: dark }), new TextRun({ text: String(f.ruolo_operativo || ''), size: 19, font: 'Arial', color: dark })] })
          ]})
        ]})]
      }), sp());
    }
    if (occ.piano_assunzioni && occ.piano_assunzioni.length > 1) {
      children.push(h2('Piano assunzioni — Dettaglio'));
      children.push(tableFromArray(occ.piano_assunzioni, [2600, 1800, 1200, 1800, 1960]));
      children.push(sp());
    }
    if (occ.politica_inclusione) children.push(colorBox2('Politica inclusione — Under 35 e donne', occ.politica_inclusione, 'gold'), sp());
    if (occ.impatto_occupazionale_indiretto) children.push(colorBox2('Occupazione indiretta', occ.impatto_occupazionale_indiretto, 'green'), sp());
    children.push(pb());

    // ── S7: IMPATTO ──
    const imp = getData('impatto') || {};
    children.push(eyebrow('Sezione 07'), h1('Impatto sociale, ambientale e territoriale'), sp());
    if (imp.kpi_impatto && imp.kpi_impatto.length) { children.push(kpiRow(imp.kpi_impatto), sp()); }
    if (imp.impatto_territoriale) { children.push(h2('Impatto territoriale'), p(imp.impatto_territoriale), sp()); }
    if (imp.impatto_sociale) { children.push(h2('Impatto sociale'), p(imp.impatto_sociale), sp()); }
    if (imp.beneficiari_tabella && imp.beneficiari_tabella.length > 1) {
      children.push(h2('Beneficiari diretti'));
      children.push(tableFromArray(imp.beneficiari_tabella, [3000, 1800, 4560]));
      children.push(sp());
    }
    if (imp.allineamento_pnrr && imp.allineamento_pnrr.length) {
      children.push(h2('Allineamento PNRR e politiche Invitalia'));
      imp.allineamento_pnrr.forEach(b => children.push(bullet(b)));
      children.push(sp());
    }
    if (imp.sostenibilita) children.push(colorBox2('Sostenibilità dell\'impatto', imp.sostenibilita, 'green'), sp());
    children.push(pb());

    // ── S8: PIANO ECONOMICO ──
    const ce = getData('piano_economico') || {};
    children.push(eyebrow('Sezione 08'), h1('Piano Economico-Finanziario'), sp());
    // CE con colonne rinominate per ON
    if (ce.anno1) {
      const ceON = {
        anno1: { ...ce.anno1, costi_tech: ce.anno1.costi_operativi || 0 },
        anno2: { ...ce.anno2, costi_tech: ce.anno2?.costi_operativi || 0 },
        anno3: { ...ce.anno3, costi_tech: ce.anno3?.costi_operativi || 0 }
      };
      children.push(ceTable(ceON), sp());
    }
    if (ce.assunzioni && ce.assunzioni.length) {
      children.push(h2('Assunzioni principali'));
      ce.assunzioni.forEach(a => children.push(bullet(a)));
      children.push(sp());
    }
    if (ce.rimborso_on) children.push(colorBox2('Piano rimborso finanziamento ON', ce.rimborso_on, 'gold'), sp());
    children.push(pb());

    // ── S9: FONTI E IMPIEGHI ──
    const fi = getData('fonti_impieghi') || {};
    children.push(eyebrow('Sezione 09'), h1('Fonti e Impieghi'), sp());
    if (fi.impieghi || fi.fonti) { children.push(fiTable(fi), sp()); }
    if (fi.nota) children.push(colorBox2('Struttura finanziaria ON', fi.nota, 'green'), sp());
    children.push(p('Documento predisposto dal team proponente con supporto di strumenti digitali di analisi e redazione, verificato e validato dal team. START ON produce una pre-valutazione tecnica. La candidatura formale richiede validazione professionale. Le decisioni finali sono in capo a Invitalia S.p.A.', { size: 16, color: grayLight, italic: true, before: 200, after: 60 }));

    // ── BUILD DOCUMENTO ──
    const doc = new Document({
      numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] }] },
      styles: {
        default: { document: { run: { font: 'Arial', size: 20 } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: 'Arial', color: dark }, paragraph: { spacing: { before: 480, after: 200 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: 'Arial', color: '7B6728' }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
        ]
      },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Dossier_ON_${(projectName || 'progetto').replace(/\s+/g, '_')}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
