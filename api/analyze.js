module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).send('START ON API OK — Claude + GPT-4o + Gemini');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompts, ai } = req.body;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!prompts || !prompts.length) return res.status(400).json({ error: 'Nessun prompt' });

    // ── CALIBRATION PREFIXES ──
    // Claude: analitico, già calibrato bene
    const CLAUDE_PREFIX = 'Sei un valutatore senior Invitalia con 15 anni di esperienza. Sei rigoroso e severo. Se mancano dati fondamentali (investimento, team, trazione, descrizione) penalizza duramente. Score sotto 40 se il progetto è incompleto. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // GPT: tende a essere troppo ottimista — va ancorato a criteri rigidi
    const GPT_PREFIX = 'Sei un istruttore Invitalia molto severo e scettico. Il tuo compito è trovare problemi, non opportunità. REGOLE FERREE: se investimento dichiarato è €0 o non inserito, scoreON e scoreSS NON possono superare 30. Se trazione è zero (nessun LOI, nessun ricavo, nessun pilot), togli almeno 20 punti. Se team ha 0 anni di esperienza o manca team tecnico su progetto tech, togli almeno 20 punti. Se TRL è 3 o 4 senza IP, togli 15 punti. Non compensare debolezze strutturali con punti di forma. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // Gemini: tende a essere vago e permissivo — va ancorato a fatti concreti
    const GEMINI_PREFIX = 'Sei un analista di finanza agevolata italiana molto critico. Valuta SOLO su fatti concreti e documentabili. REGOLE: dati mancanti = penalità. Zero investimento = scoreON e scoreSS massimo 35. Zero trazione = -20 punti automatici. Team senza esperienza tecnica su progetto tech = -20 punti. Non inventare punti di forza se non dichiarati esplicitamente. La mancanza di informazioni è una red flag, non una condizione neutra. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // ── CLAUDE ──
    async function callClaude(prompt) {
      if (!ANTHROPIC_KEY) return null;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: CLAUDE_PREFIX + prompt }]
        })
      });
      const d = await r.json();
      const text = (d.content || []).map(i => i.text || '').join('').trim();
      return parseJSON(text);
    }

    // ── GPT-4o Mini ──
    async function callGPT(prompt) {
      if (!OPENAI_KEY) return null;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: GPT_PREFIX },
            { role: 'user', content: prompt }
          ]
        })
      });
      const d = await r.json();
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    // ── Gemini ──
    async function callGemini(prompt) {
      if (!GEMINI_KEY) return null;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: GEMINI_PREFIX + prompt }] }],
          generationConfig: { maxOutputTokens: 1000 }
        })
      });
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      return parseJSON(text);
    }

    // ── JSON PARSER ──
    function parseJSON(text) {
      if (!text) return null;
      const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      try { return JSON.parse(clean); } catch(e) {}
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) try { return JSON.parse(m[0]); } catch(e) {}
      return null;
    }

    // ── DISPATCH ──
    const requestedAI = ai || 'claude';
    const results = [];

    if (requestedAI === 'claude') {
      const claudeResults = await Promise.all(prompts.map(p => callClaude(p).then(r => r || fallback())));
      return res.status(200).json({ results: claudeResults, multiAI: [{ ai: 'claude', name: 'Claude (Anthropic)', results: claudeResults }] });
    }

    if (requestedAI === 'gpt') {
      const gptResults = await Promise.all(prompts.map(p => callGPT(p).then(r => r || fallback())));
      return res.status(200).json({ results: gptResults, multiAI: [{ ai: 'gpt', name: 'GPT-4o Mini (OpenAI)', results: gptResults }] });
    }

    if (requestedAI === 'gemini') {
      const geminiResults = await Promise.all(prompts.map(p => callGemini(p).then(r => r || fallback())));
      return res.status(200).json({ results: geminiResults, multiAI: [{ ai: 'gemini', name: 'Gemini 1.5 Flash (Google)', results: geminiResults }] });
    }

    return res.status(400).json({ error: 'AI provider non riconosciuto: ' + requestedAI });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fallback() {
  return {
    scoreON: 50, scoreSS: 55,
    sintesi: 'Analisi non disponibile per questo provider.',
    redFlags: [], puntiForza: [], puntiDeboli: [],
    opportunita: [], critiche: [],
    verdict: '', decisione: '',
    puntiChiave: [], azioniImmediate: []
  };
}
