module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).send('START ON API OK — Claude + GPT-4o + Grok');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompts, ai } = req.body;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const GROK_KEY = process.env.GROK_API_KEY;

    if (!prompts || !prompts.length) return res.status(400).json({ error: 'Nessun prompt' });

    // ── LAYER NORMATIVO INVITALIA (comune a tutti i modelli) ──
    const NORMATIVA = `=== NORMATIVA BANDI INVITALIA — REGOLE VINCOLANTI PER LA VALUTAZIONE ===

━━━ BANDO ON — OLTRE NUOVE IMPRESE A TASSO ZERO ━━━

REQUISITI SOGGETTIVI OBBLIGATORI (senza questi scoreON = max 15):
- Micro o piccola impresa costituita da NON PIÙ DI 60 mesi
- Oltre il 50% del capitale sociale detenuto da: giovani under 36 E/O donne
- Sede legale e operativa in Italia
- NON impresa in difficoltà
- Sono ESCLUSE: ditte individuali, società semplici, società di fatto

REQUISITI OGGETTIVI:
- Investimento minimo: non specificato ma deve essere concreto e documentato
- Investimento massimo: €3.000.000 per imprese 36-60 mesi; €1.500.000 per imprese 0-36 mesi
- Settori: tutti tranne finanza, assicurazioni, pesca, acquacoltura, carbone

AGEVOLAZIONI ON:
- Finanziamento a tasso zero fino al 75% dell'investimento
- Contributo a fondo perduto fino al 25% (solo per imprese under 36 mesi e nelle aree svantaggiate)
- NON c'è premialità specifica per localizzazione al Sud rispetto a Nord

DOCUMENTI RICHIESTI:
- Business plan con analisi mercato, piano operativo, strategia marketing
- Schemi economico-finanziari Invitalia: CE previsionale 3 anni, Fonti/Impieghi, Cash Flow
- CV soci con dichiarazione requisiti under36/donne
- Dichiarazione de minimis e non impresa in difficoltà
- Preventivi di spesa

PENALIZZAZIONI AUTOMATICHE scoreON:
- Compagine NON under36/donne >50%: scoreON MASSIMO 15
- Impresa costituita da più di 60 mesi: scoreON = 0 (inammissibile)
- Investimento €0 o non dichiarato: scoreON MASSIMO 20
- Zero trazione (0 LOI, 0 ricavi, 0 pilot): -20 punti
- Team con 0 anni esperienza cumulata: -15 punti
- De minimis superato: scoreON = 0 (inammissibile)

━━━ BANDO SMART&START ITALIA ━━━

REQUISITI SOGGETTIVI (NON ci sono requisiti anagrafici o di genere):
- Startup innovativa ai sensi art. 25 D.L. 179/2012 (iscritta sezione speciale Registro Imprese)
- Costituita da NON PIÙ DI 60 mesi
- Sede legale e/o operativa in Italia
- Piano di impresa tra €100.000 e €1.500.000
- Ammessi anche team non ancora costituiti in società

IMPORTANTE: Smart&Start NON richiede requisiti di età o genere dei soci.
La compagine under36/donne NON è un criterio di ammissibilità né di punteggio per Smart&Start.

AGEVOLAZIONI SMART&START:
- Tasso zero su 80% delle spese (Centro-Nord)
- Tasso zero su 90% delle spese (Sud: Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia, Abruzzo)
- Fondo perduto aggiuntivo 30% (Sud) — questo è il vantaggio reale della localizzazione Sud
- Fondo perduto aggiuntivo 35% (Sud + team femminile >50%)
- Valutazione entro 60 giorni
- Meno del 30% delle domande approvate — bando selettivo

CRITERI DI VALUTAZIONE SMART&START (pesi ufficiali Invitalia):
1. Sostenibilità economico-finanziaria: 35% — il più importante
2. Carattere innovativo: alto peso — tecnologia proprietaria, TRL, brevetti, differenziazione
3. Fattibilità tecnologica e operativa: alto peso
4. Adeguatezza competenze team: alto peso — track record, esperienze precedenti

DOCUMENTI RICHIESTI SMART&START:
- Business plan con: Value Proposition Canvas (6 campi), Business Model Canvas
- Sezione innovazione tecnologica (TRL, IP, brevetti, differenziazione)
- Sezione economia digitale/AI/blockchain se applicabile
- Piano finanziario: CE previsionale, Fonti/Impieghi, Cash Flow — coerenti tra loro
- CV soci con competenze tecniche e gestionali documentate
- Dichiarazione startup innovativa
- Dal 2026: CUP obbligatorio su tutti i bonifici

PENALIZZAZIONI AUTOMATICHE scoreSS:
- NON startup innovativa iscritta: scoreSS = 0 (inammissibile)
- Impresa costituita da più di 60 mesi: scoreSS = 0 (inammissibile)
- Investimento <€100k o >€1.5M: scoreSS = 0 (fuori range)
- Investimento €0 o non dichiarato: scoreSS MASSIMO 20
- Zero trazione (0 LOI, 0 ricavi, 0 pilot): -20 punti
- Team con 0 anni esperienza cumulata: -15 punti
- TRL 3 senza IP né partner universitari: -15 punti
- Sostenibilità finanziaria non dimostrabile: -20 punti (peso 35%)

━━━ INTERAZIONI E REGOLE TRASVERSALI ━━━

CUMULABILITÀ:
- ON e Smart&Start NON sono cumulabili sullo stesso progetto
- De minimis: plafond €300.000 su 3 anni (Reg. UE 2023/2831) — se superato esclude ON
- Smart&Start non è de minimis — non impatta il plafond

LOCALIZZAZIONE SUD:
- Per Smart&Start: vantaggio concreto (fondo perduto 30-35%)
- Per ON: nessun vantaggio specifico per localizzazione Sud

TRAZIONE — definizione per valutazione:
- LOI formali firmati = trazione media
- Contratti/pilot attivi con ricavi = trazione alta
- Solo interesse informale o dichiarazioni verbali = trazione nulla
- Incongruenze tra dati dichiarati (es. 10 pilot ma 0 LOI) = red flag critica

TEAM — valutazione:
- Esperienza cumulata 0 anni = penalità grave
- Esperienza tecnica assente su progetto tech = penalità grave
- Track record imprenditoriale (exit, fondazioni precedenti) = forte bonus
- Solo esperienza professionale settoriale = bonus moderato

TRL — impatto:
- TRL 3: idea validata — penalità grave, sviluppo prodotto necessario
- TRL 4-5: prototipo — penalità moderata
- TRL 6-7: prototipo validato — neutro/bonus lieve
- TRL 8-9: prodotto completo — bonus significativo

IP E TECNOLOGIA:
- Brevetto depositato = forte differenziazione
- Brevetto in corso = differenziazione parziale
- Solo tecnologia terze parti (API esterne) = differenziazione minima
- Dipendenza critica da provider AI terzi non contrattualizzati = red flag

=== FINE NORMATIVA — APPLICA QUESTE REGOLE IN MODO RIGOROSO E COERENTE ===`;

    // Claude Haiku — calibrato e testato OK
    const CLAUDE_PREFIX = 'Sei un valutatore senior Invitalia con 15 anni di esperienza. Sei rigoroso e severo. REGOLE FONDAMENTALI SUI BANDI: (1) ON richiede obbligatoriamente che oltre il 50% dei soci siano under 36 e/o donne - senza questo requisito scoreON deve essere massimo 20. (2) Smart&Start NON ha requisiti anagrafici o di genere - e aperto a tutte le startup innovative indipendentemente da eta e sesso dei soci. (3) La localizzazione al Sud e premiante SOLO per Smart&Start (fondo perduto 30-35%) non per ON. Se mancano dati fondamentali (investimento, team, trazione, descrizione) penalizza duramente. Score sotto 40 se il progetto e incompleto. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // GPT-4o — calibrato e testato OK
    const GPT_PREFIX = 'Sei un istruttore Invitalia molto severo e scettico. REGOLE SUI BANDI: ON richiede OBBLIGATORIAMENTE piu del 50% soci under 36 e/o donne - senza questo scoreON massimo 20. Smart&Start NON ha requisiti anagrafici - aperto a tutti, valuta solo innovazione, team, sostenibilita finanziaria. La Puglia e il Sud premiano solo Smart&Start con fondo perduto aggiuntivo 30-35%, non ON. REGOLE FERREE: se investimento dichiarato e zero, scoreON e scoreSS NON possono superare 30. Se trazione e zero togli almeno 20 punti. Se team ha 0 anni di esperienza togli almeno 20 punti. Se TRL 3 o 4 senza IP togli 15 punti. Non compensare debolezze strutturali con punti di forma. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // Grok — nuovo, stesso stile severo
    const GROK_PREFIX = 'Sei un analista di rischio specializzato in finanza agevolata italiana. Proteggi i fondi pubblici da progetti non meritevoli. REGOLE SUI BANDI: ON richiede OBBLIGATORIAMENTE piu del 50% dei soci under 36 e/o donne - e un requisito soggettivo vincolante, non un bonus. Senza questo requisito scoreON deve essere massimo 20 indipendentemente dalla qualita del progetto. Smart&Start NON ha requisiti anagrafici ne di genere - valuta esclusivamente innovazione tecnologica, sostenibilita economico-finanziaria (peso 35%), fattibilita tecnica e team. La sede al Sud (Puglia, Calabria, Sicilia ecc.) aumenta il fondo perduto in Smart&Start ma non impatta ON. REGOLE: investimento zero = scoreON e scoreSS massimo 25. Zero trazione = -25 punti. Team senza esperienza tecnica su progetto tech = -20 punti. Dati mancanti sono red flag gravi. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // Claude Haiku — funzionava bene
    async function callClaude(prompt) {
      if (!ANTHROPIC_KEY) return null;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: CLAUDE_PREFIX + NORMATIVA + '\n\n' + prompt }] })
      });
      const d = await r.json();
      const text = (d.content || []).map(i => i.text || '').join('').trim();
      return parseJSON(text);
    }

    // GPT-4o
    async function callGPT(prompt) {
      if (!OPENAI_KEY) return null;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1000, messages: [{ role: 'system', content: GPT_PREFIX + NORMATIVA }, { role: 'user', content: prompt }] })
      });
      const d = await r.json();
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    // Grok 2 — modello stabile xAI
    async function callGrok(prompt) {
      if (!GROK_KEY) return null;
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROK_KEY },
        body: JSON.stringify({ model: 'grok-4-1-fast-non-reasoning', max_tokens: 1000, messages: [{ role: 'system', content: GROK_PREFIX + NORMATIVA }, { role: 'user', content: prompt }] })
      });
      const d = await r.json();
      if (d.error) {
        console.error('Grok error:', d.error);
        return null;
      }
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    function parseJSON(text) {
      if (!text) return null;
      const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      try { return JSON.parse(clean); } catch(e) {}
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) try { return JSON.parse(m[0]); } catch(e) {}
      return null;
    }

    const requestedAI = ai || 'claude';

    if (requestedAI === 'claude') {
      const results = await Promise.all(prompts.map(p => callClaude(p).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'claude', name: 'Claude (Anthropic)', results }] });
    }
    if (requestedAI === 'gpt') {
      const results = await Promise.all(prompts.map(p => callGPT(p).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'gpt', name: 'GPT-4o (OpenAI)', results }] });
    }
    if (requestedAI === 'grok') {
      const results = await Promise.all(prompts.map(p => callGrok(p).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'grok', name: 'Grok 2 (xAI)', results }] });
    }

    return res.status(400).json({ error: 'AI provider non riconosciuto: ' + requestedAI });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fallback() {
  return { scoreON: 0, scoreSS: 0, sintesi: 'Analisi non disponibile', redFlags: [], puntiForza: [], puntiDeboli: [], opportunita: [], critiche: [], verdict: '', decisione: '', puntiChiave: [], azioniImmediate: [] };
}
