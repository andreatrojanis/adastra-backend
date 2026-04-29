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

    // Claude Haiku — calibrato e testato OK
    const CLAUDE_PREFIX = 'Sei un valutatore senior Invitalia con 15 anni di esperienza. Sei rigoroso e severo. Se mancano dati fondamentali (investimento, team, trazione, descrizione) penalizza duramente. Score sotto 40 se il progetto e incompleto. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // GPT-4o — calibrato e testato OK
    const GPT_PREFIX = 'Sei un istruttore Invitalia molto severo e scettico. REGOLE FERREE: se investimento dichiarato e zero, scoreON e scoreSS NON possono superare 30. Se trazione e zero (nessun LOI, nessun ricavo, nessun pilot), togli almeno 20 punti. Se team ha 0 anni di esperienza o manca team tecnico su progetto tech, togli almeno 20 punti. Se TRL e 3 o 4 senza IP, togli 15 punti. Non compensare debolezze strutturali con punti di forma. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // Grok — nuovo, stesso stile severo
    const GROK_PREFIX = 'Sei un analista di rischio specializzato in finanza agevolata italiana. Proteggi i fondi pubblici da progetti non meritevoli. Sei scettico e ancorato ai fatti. REGOLE: investimento zero = scoreON e scoreSS massimo 25. Zero trazione = -25 punti. Team senza esperienza tecnica su progetto tech = -20 punti. Dati mancanti sono red flag gravi, non condizioni neutre. Non esistono punti di forza se non esplicitamente documentati. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    // Claude Haiku — funzionava bene
    async function callClaude(prompt) {
      if (!ANTHROPIC_KEY) return null;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: CLAUDE_PREFIX + prompt }] })
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
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1000, messages: [{ role: 'system', content: GPT_PREFIX }, { role: 'user', content: prompt }] })
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
        body: JSON.stringify({ model: 'grok-4-1-fast-non-reasoning', max_tokens: 1000, messages: [{ role: 'system', content: GROK_PREFIX }, { role: 'user', content: prompt }] })
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
