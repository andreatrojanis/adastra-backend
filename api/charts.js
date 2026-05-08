/**
 * charts.js — Generatore SVG per elementi visuali dossier START ON
 * Tutti i chart restituiscono SVG string, convertibile in PNG con resvg
 */

const GOLD = '#C9A84C';
const GOLD_LIGHT = '#F0ECE6';
const GOLD_DARK = '#7B6728';
const DARK = '#111111';
const GRAY = '#555555';
const GRAY_LIGHT = '#AAAAAA';
const GREEN = '#0A7F2E';
const GREEN_LIGHT = '#E8F5EC';
const RED = '#B00020';
const RED_LIGHT = '#FFF0F2';
const WHITE = '#FFFFFF';
const FONT = 'Arial, Helvetica, sans-serif';

function escXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 1. SCORING CARD — doppio gauge ON + SS ──
function scoringCard(scoreON, scoreSS, verdict, decisione) {
  const W = 800, H = 320;
  const overallColor = (s) => s >= 70 ? GREEN : s >= 50 ? GOLD_DARK : RED;
  const labelColor = (s) => s >= 70 ? GREEN : s >= 50 ? '#A07820' : RED;

  function gauge(cx, cy, r, score, color, label) {
    const startAngle = Math.PI;
    const endAngle = 0;
    const angle = startAngle - Math.PI * (score / 100);
    const cos = Math.cos, sin = Math.sin;
    const sx = cx + r * cos(startAngle), sy = cy + r * sin(startAngle);
    const ex = cx + r * cos(endAngle), ey = cy + r * sin(endAngle);
    const ax = cx + r * cos(angle), ay = cy + r * sin(angle);
    const large = Math.PI * (score / 100) > Math.PI ? 1 : 0;

    return `
      <path d="M${sx},${sy} A${r},${r} 0 0,1 ${ex},${ey}"
        fill="none" stroke="#E8E0D0" stroke-width="18" stroke-linecap="round"/>
      <path d="M${sx},${sy} A${r},${r} 0 ${large},0 ${ax},${ay}"
        fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle"
        font-family="${FONT}" font-size="36" font-weight="700" fill="${color}">${score}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle"
        font-family="${FONT}" font-size="13" fill="${GRAY_LIGHT}">/100</text>
      <text x="${cx}" y="${cy + 40}" text-anchor="middle"
        font-family="${FONT}" font-size="12" font-weight="600" fill="${GRAY}">${label}</text>
    `;
  }

  const overall = Math.round((scoreON + scoreSS) / 2);

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${WHITE}" rx="12"/>
    <rect width="${W}" height="6" fill="${GOLD}" rx="3"/>

    <!-- Titolo -->
    <text x="400" y="38" text-anchor="middle" font-family="${FONT}" font-size="11"
      font-weight="700" fill="${GOLD}" letter-spacing="3">PANEL MULTI-AGENTE AI — SCORING</text>

    <!-- Gauge Overall -->
    ${gauge(160, 190, 90, overall, overallColor(overall), 'Score Complessivo')}

    <!-- Gauge ON -->
    ${gauge(400, 190, 80, scoreON, labelColor(scoreON), 'Score ON')}

    <!-- Gauge SS -->
    ${gauge(620, 190, 80, scoreSS, labelColor(scoreSS), 'Score Smart&amp;Start')}

    <!-- Separatori -->
    <line x1="270" y1="80" x2="270" y2="270" stroke="#E8E0D0" stroke-width="1"/>
    <line x1="510" y1="80" x2="510" y2="270" stroke="#E8E0D0" stroke-width="1"/>

    <!-- Verdict box -->
    <rect x="60" y="268" width="680" height="36" rx="6" fill="${GOLD_LIGHT}"/>
    <text x="400" y="291" text-anchor="middle" font-family="${FONT}" font-size="13"
      font-weight="700" fill="${GOLD_DARK}">${escXml(verdict || '—')}  ·  ${escXml(decisione || '—')}</text>
  </svg>`;
}

// ── 2. RADAR CHART — 6 dimensioni ──
function radarChart(values) {
  // values: {requisiti, innovazione, mercato, team, numeri, impatti} — 0-100
  const W = 600, H = 560;
  const cx = 300, cy = 270, r = 180;
  const axes = [
    { label: 'REQUISITI', key: 'requisiti' },
    { label: 'INNOVAZIONE', key: 'innovazione' },
    { label: 'MERCATO', key: 'mercato' },
    { label: 'TEAM', key: 'team' },
    { label: 'NUMERI', key: 'numeri' },
    { label: 'IMPATTI', key: 'impatti' },
  ];
  const N = axes.length;

  function pt(i, frac) {
    const a = (2 * Math.PI / N) * i - Math.PI / 2;
    return [cx + r * frac * Math.cos(a), cy + r * frac * Math.sin(a)];
  }

  // Griglia
  let grid = '';
  for (let g = 1; g <= 5; g++) {
    let d = '';
    for (let i = 0; i < N; i++) {
      const [x, y] = pt(i, g / 5);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    grid += `<path d="${d}Z" fill="none" stroke="#E8E0D0" stroke-width="${g === 5 ? 1.5 : 0.8}"/>`;
  }

  // Raggi
  let spokes = '';
  for (let i = 0; i < N; i++) {
    const [x, y] = pt(i, 1);
    spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E8E0D0" stroke-width="1"/>`;
  }

  // Poligono dati
  let pts = '';
  axes.forEach(({ key }, i) => {
    const v = Math.min(100, Math.max(0, values[key] || 0)) / 100;
    const [x, y] = pt(i, v);
    pts += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  });

  // Dots e label
  let dots = '', labels = '';
  axes.forEach(({ label, key }, i) => {
    const v = Math.min(100, Math.max(0, values[key] || 0)) / 100;
    const score = Math.round(v * 100);
    const [dx, dy] = pt(i, v);
    const [lx, ly] = pt(i, 1.28);
    const anchor = Math.cos((2 * Math.PI / N) * i - Math.PI / 2) > 0.1 ? 'start' : Math.cos((2 * Math.PI / N) * i - Math.PI / 2) < -0.1 ? 'end' : 'middle';
    dots += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="5" fill="${GOLD}" stroke="${WHITE}" stroke-width="2"/>`;
    labels += `<text x="${lx.toFixed(1)}" y="${(ly - 8).toFixed(1)}" text-anchor="${anchor}"
      font-family="${FONT}" font-size="10" font-weight="700" fill="${GOLD}" letter-spacing="1">${label}</text>
    <text x="${lx.toFixed(1)}" y="${(ly + 8).toFixed(1)}" text-anchor="${anchor}"
      font-family="${FONT}" font-size="16" font-weight="700" fill="${DARK}">${score}</text>`;
  });

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${WHITE}" rx="12"/>
    <text x="${W/2}" y="30" text-anchor="middle" font-family="${FONT}" font-size="11"
      font-weight="700" fill="${GOLD}" letter-spacing="3">RADAR MATURITÀ — 6 DIMENSIONI</text>
    ${grid}${spokes}
    <path d="${pts}Z" fill="rgba(201,168,76,0.18)" stroke="${GOLD}" stroke-width="2.5"/>
    ${dots}${labels}
  </svg>`;
}

// ── 3. TIMELINE VISUALE — 4 fasi orizzontali ──
function timelineVisual(fasi) {
  // fasi: [{nome, periodo, kpi_sintetico}]
  const W = 900, H = 200;
  const cols = fasi.length;
  const colW = W / cols;

  let items = '';
  fasi.forEach((fase, i) => {
    const x = i * colW;
    const isLast = i === cols - 1;
    const fill = isLast ? GREEN_LIGHT : GOLD_LIGHT;
    const stroke = isLast ? GREEN : GOLD;
    const textColor = isLast ? GREEN : GOLD_DARK;

    items += `
      <!-- Fase ${i+1} -->
      <rect x="${x + 4}" y="50" width="${colW - 8}" height="100" rx="8"
        fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      ${i < cols - 1 ? `<polygon points="${x + colW - 4},90 ${x + colW + 10},100 ${x + colW - 4},110"
        fill="${stroke}"/>` : ''}
      <text x="${x + colW/2}" y="80" text-anchor="middle"
        font-family="${FONT}" font-size="13" font-weight="700" fill="${textColor}">${escXml(fase.nome || 'FASE ' + (i+1))}</text>
      <text x="${x + colW/2}" y="98" text-anchor="middle"
        font-family="${FONT}" font-size="10" fill="${GRAY}">${escXml(fase.periodo || '')}</text>
      <text x="${x + colW/2}" y="128" text-anchor="middle"
        font-family="${FONT}" font-size="9" fill="${GRAY}" 
        style="overflow:hidden">${escXml((fase.kpi_sintetico || '').substring(0, 35))}</text>

      <!-- Cerchio numerato -->
      <circle cx="${x + colW/2}" cy="34" r="16" fill="${stroke}"/>
      <text x="${x + colW/2}" y="39" text-anchor="middle"
        font-family="${FONT}" font-size="13" font-weight="700" fill="${WHITE}">${i+1}</text>
    `;
  });

  // Linea connettore
  const lineY = 34;
  const lineStart = colW / 2;
  const lineEnd = W - colW / 2;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${WHITE}" rx="12"/>
    <text x="${W/2}" y="22" text-anchor="middle" font-family="${FONT}" font-size="11"
      font-weight="700" fill="${GOLD}" letter-spacing="3">ROADMAP OPERATIVA — 36 MESI</text>
    <line x1="${lineStart}" y1="${lineY}" x2="${lineEnd}" y2="${lineY}"
      stroke="#E8E0D0" stroke-width="2" stroke-dasharray="4,4"/>
    ${items}
  </svg>`;
}

// ── 4. BMC CANVAS VISUALE ──
function bmcCanvas(bmc) {
  // bmc: {segmenti, proposta, canali, relazioni, ricavi, risorse, attivita, partner, costi}
  const W = 900, H = 500;

  function box(x, y, w, h, title, content, fill, titleColor) {
    const lines = String(content || '').match(/.{1,28}/g) || [];
    const textLines = lines.slice(0, 4).map((l, i) =>
      `<text x="${x + w/2}" y="${y + 52 + i * 16}" text-anchor="middle"
        font-family="${FONT}" font-size="9" fill="${GRAY}">${escXml(l)}</text>`
    ).join('');
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"
        fill="${fill}" stroke="#E0D8C8" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="${w}" height="22" rx="6" fill="${titleColor}" opacity="0.9"/>
      <rect x="${x}" y="${y + 16}" width="${w}" height="6" fill="${titleColor}" opacity="0.9"/>
      <text x="${x + w/2}" y="${y + 15}" text-anchor="middle"
        font-family="${FONT}" font-size="9" font-weight="700" fill="${WHITE}">${escXml(title)}</text>
      ${textLines}
    `;
  }

  const g = GOLD, gl = GOLD_LIGHT, gd = GOLD_DARK;
  const gr = GREEN, grl = GREEN_LIGHT;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${WHITE}" rx="12"/>
    <text x="${W/2}" y="22" text-anchor="middle" font-family="${FONT}" font-size="11"
      font-weight="700" fill="${GOLD}" letter-spacing="3">BUSINESS MODEL CANVAS</text>

    <!-- Partner Chiave -->
    ${box(10, 36, 160, 200, 'PARTNER CHIAVE', bmc.partner, gl, gd)}
    <!-- Attività Chiave -->
    ${box(175, 36, 160, 95, 'ATTIVITÀ CHIAVE', bmc.attivita, gl, gd)}
    <!-- Risorse Chiave -->
    ${box(175, 136, 160, 100, 'RISORSE CHIAVE', bmc.risorse, gl, gd)}
    <!-- Proposta di Valore -->
    ${box(340, 36, 220, 200, 'PROPOSTA DI VALORE', bmc.proposta, '#FFF8EC', g)}
    <!-- Relazioni -->
    ${box(565, 36, 155, 95, 'RELAZIONI', bmc.relazioni, gl, gd)}
    <!-- Canali -->
    ${box(565, 136, 155, 100, 'CANALI', bmc.canali, gl, gd)}
    <!-- Segmenti -->
    ${box(725, 36, 165, 200, 'SEGMENTI', bmc.segmenti, grl, gr)}

    <!-- Struttura Costi -->
    ${box(10, 242, 430, 100, 'STRUTTURA DEI COSTI', bmc.costi, '#FFF0F0', RED)}
    <!-- Flussi Ricavi -->
    ${box(446, 242, 444, 100, 'FLUSSI DI RICAVI', bmc.ricavi, grl, gr)}

    <!-- Etichette sezione -->
    <text x="370" y="${H - 8}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${GRAY_LIGHT}">
      ← EFFICIENZA OPERATIVA · PROPOSTA DI VALORE · TRAZIONE COMMERCIALE →
    </text>
  </svg>`;
}

// ── 5. HEATMAP RISCHI ──
function heatmapRischi(rischi) {
  // rischi: [{label, prob, impatto}] — prob/impatto: 1-3 (Bassa/Media/Alta)
  const W = 600, H = 400;
  const cols = 3, rows = 3;
  const cw = 140, rh = 90;
  const ox = 110, oy = 60;

  const colors = [
    ['#E8F5EC', '#FFF8EC', '#FFF0F0'],
    ['#FFF8EC', '#FFF0F0', '#FFE0E0'],
    ['#FFF0F0', '#FFE0E0', '#FFCCCC']
  ];

  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * cw;
      const y = oy + r * rh;
      cells += `<rect x="${x}" y="${y}" width="${cw}" height="${rh}"
        fill="${colors[r][c]}" stroke="#E0D8C8" stroke-width="1"/>`;
    }
  }

  // Etichette assi
  const probLabels = ['BASSA', 'MEDIA', 'ALTA'];
  const impLabels = ['BASSA', 'MEDIA', 'ALTA'];

  let axisLabels = '';
  for (let i = 0; i < 3; i++) {
    axisLabels += `
      <text x="${ox + i * cw + cw/2}" y="${oy - 10}" text-anchor="middle"
        font-family="${FONT}" font-size="9" font-weight="700" fill="${GRAY}">${impLabels[i]}</text>
      <text x="${ox - 8}" y="${oy + i * rh + rh/2 + 4}" text-anchor="end"
        font-family="${FONT}" font-size="9" font-weight="700" fill="${GRAY}">${probLabels[2-i]}</text>
    `;
  }

  // Piazza i rischi nella griglia
  let dots = '';
  const placed = {};
  (rischi || []).slice(0, 6).forEach(({ label, prob, impatto }) => {
    const c = Math.min(2, Math.max(0, (impatto || 1) - 1));
    const r = Math.max(0, 2 - Math.min(2, Math.max(0, (prob || 1) - 1)));
    const key = `${r},${c}`;
    const offset = (placed[key] || 0) * 18;
    placed[key] = (placed[key] || 0) + 1;
    const x = ox + c * cw + cw / 2;
    const y = oy + r * rh + rh / 2 - 10 + offset;
    dots += `
      <circle cx="${x}" cy="${y}" r="6" fill="${GOLD}" opacity="0.85"/>
      <text x="${x + 10}" y="${y + 4}" font-family="${FONT}" font-size="8" fill="${DARK}">${escXml((label||'').substring(0,22))}</text>
    `;
  });

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${WHITE}" rx="12"/>
    <text x="${W/2}" y="24" text-anchor="middle" font-family="${FONT}" font-size="11"
      font-weight="700" fill="${GOLD}" letter-spacing="3">HEATMAP RISCHI</text>

    <!-- Titoli assi -->
    <text x="${ox + cw * 1.5}" y="${oy - 28}" text-anchor="middle"
      font-family="${FONT}" font-size="10" font-weight="700" fill="${GRAY_LIGHT}">IMPATTO →</text>
    <text x="22" y="${oy + rh * 1.5 + 4}" text-anchor="middle"
      font-family="${FONT}" font-size="10" font-weight="700" fill="${GRAY_LIGHT}"
      transform="rotate(-90, 22, ${oy + rh * 1.5})">PROB. →</text>

    ${cells}${axisLabels}${dots}

    <!-- Legenda -->
    <rect x="${ox}" y="${oy + rows * rh + 16}" width="16" height="10" fill="#E8F5EC" stroke="#E0D8C8"/>
    <text x="${ox + 20}" y="${oy + rows * rh + 25}" font-family="${FONT}" font-size="9" fill="${GRAY}">Basso</text>
    <rect x="${ox + 70}" y="${oy + rows * rh + 16}" width="16" height="10" fill="#FFF0F0" stroke="#E0D8C8"/>
    <text x="${ox + 90}" y="${oy + rows * rh + 25}" font-family="${FONT}" font-size="9" fill="${GRAY}">Medio</text>
    <rect x="${ox + 140}" y="${oy + rows * rh + 16}" width="16" height="10" fill="#FFCCCC" stroke="#E0D8C8"/>
    <text x="${ox + 160}" y="${oy + rows * rh + 25}" font-family="${FONT}" font-size="9" fill="${GRAY}">Alto</text>
  </svg>`;
}

// ── 6. DIAGRAMMA PROCESSO ──
function processDiagram() {
  const W = 800, H = 180;
  const steps = [
    { icon: '📋', label: 'Wizard\n22 step', sub: '30 min' },
    { icon: '🤖', label: 'Panel AI\nMulti-agente', sub: 'Claude+GPT+Grok' },
    { icon: '📊', label: 'Score &amp;\nReport', sub: '0-100' },
    { icon: '📄', label: 'Dossier\nAutomatico', sub: '10 sezioni' },
    { icon: '✅', label: 'Candidatura\nInvitalia', sub: 'Smart&amp;Start' },
  ];
  const n = steps.length;
  const stepW = W / n;

  let items = '';
  steps.forEach((s, i) => {
    const x = i * stepW + stepW / 2;
    const lines = s.label.split('\n');
    items += `
      <circle cx="${x}" cy="80" r="32" fill="${GOLD_LIGHT}" stroke="${GOLD}" stroke-width="2"/>
      <text x="${x}" y="86" text-anchor="middle" font-family="${FONT}" font-size="20">${s.icon}</text>
      <text x="${x}" y="130" text-anchor="middle" font-family="${FONT}" font-size="10"
        font-weight="700" fill="${DARK}">${lines[0]}</text>
      <text x="${x}" y="144" text-anchor="middle" font-family="${FONT}" font-size="10"
        font-weight="700" fill="${DARK}">${lines[1] || ''}</text>
      <text x="${x}" y="160" text-anchor="middle" font-family="${FONT}" font-size="9"
        fill="${GOLD}">${s.sub}</text>
      ${i < n-1 ? `<line x1="${x + 32}" y1="80" x2="${x + stepW - 32}" y2="80"
        stroke="${GOLD}" stroke-width="2" stroke-dasharray="4,3"/>
        <polygon points="${x + stepW - 36},74 ${x + stepW - 28},80 ${x + stepW - 36},86" fill="${GOLD}"/>` : ''}
    `;
  });

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${WHITE}" rx="12"/>
    <text x="${W/2}" y="22" text-anchor="middle" font-family="${FONT}" font-size="11"
      font-weight="700" fill="${GOLD}" letter-spacing="3">FLUSSO — DALLA VALUTAZIONE AL DOSSIER</text>
    ${items}
  </svg>`;
}

module.exports = { scoringCard, radarChart, timelineVisual, bmcCanvas, heatmapRischi, processDiagram };
