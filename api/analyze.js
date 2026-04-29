module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).send('START ON API OK — Claude Sonnet + GPT-4o + Grok 3');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompts, ai } = req.body;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const GROK_KEY = process.env.GROK_API_KEY;

    if (!prompts || !prompts.length) return res.status(400).json({ error: 'Nessun prompt' });

    const CLAUDE_PREFIX = 'REGOLE ASSOLUTE PER QUESTA VALUTAZIONE: investimento €0 = scoreON e scoreSS massimo 25. Descrizione vuota o generica = -20 punti. Zero trazione (0 LOI, 0 ricavi, 0 pilot) = -25 punti. Team con 0 anni esperienza = -20 punti. TRL 3 senza IP = -15 punti. Dati mancanti non sono neutri: sono red flag gravi. Non compensare mai con elementi formali. Un progetto incompleto non supera mai 35. Rispondi SEMPRE e SOLO con un oggetto JSON valido. Nessun testo prima o dopo il JSON. Nessun markdown.\n\n';

    const GPT_PREFIX = 'Sei un istruttore Invitalia molto severo e scettico. REGOLE FERREE: se investimento dichiarato è €0, scoreON e scoreSS NON possono superare 30. Se trazione è zero (nessun LOI, nessun ricavo, nessun pilot), togli almeno 20 punti. Se team ha 0 anni di esperienza o manca team tecnico su progetto tech, togli almeno 20 punti. Se TRL è 3 o 4 senza IP, togli 15 punti. Non compensare debolezze strutturali con punti di forma. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    const GROK_PREFIX = 'Sei un analista di rischio specializzato in finanza agevolata italiana. Il tuo compito è proteggere i fondi pubblici da progetti non meritevoli. Sei scettico, preciso e ancorato ai fatti. Dati mancanti = penalità severe. Zero investimento = progetto non finanziabile, score massimo 25. Zero trazione = -25 punti. Team senza esperienza tecnica su progetto tech = -20 punti. Non esistono punti di forza se non esplicitamente documentati. La vaghezza è una red flag. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    async function callClaude(prompt) {
      if (!ANTHROPIC_KEY) return null;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          temperature: 0,
          system: CLAUDE_PREFIX,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const d = await r.json();
      const text = (d.content || []).map(i => i.text || '').join('').trim();
      return parseJSON(text);
    }

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

    async function callGrok(prompt) {
      if (!GROK_KEY) return null;
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROK_KEY },
        body: JSON.stringify({ model: 'grok-4-1-fast-non-reasoning', max_tokens: 1000, messages: [{ role: 'system', content: GROK_PREFIX }, { role: 'user', content: prompt }] })
      });
      const d = await r.json();
      if (d.error) return { scoreON: 0, scoreSS: 0, sintesi: 'Grok error: ' + d.error.message, redFlags: [], puntiForza: [], puntiDeboli: [], opportunita: [], critiche: [], verdict: 'ERRORE', decisione: 'ERRORE', puntiChiave: [], azioniImmediate: [] };
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    function parseJSON(text) {
      if (!text) return null;
      const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      // Try direct parse
      try { return JSON.parse(clean); } catch(e) {}
      // Try extracting first {...} block
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) try { return JSON.parse(m[0]); } catch(e) {
        // Try to fix common issues: trailing commas, unescaped chars
        const fixed = m[0].replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ');
        try { return JSON.parse(fixed); } catch(e2) {}
      }
      // Log for debugging
      console.error('parseJSON FAILED. Raw (500):', clean.substring(0, 500));
      return null;
    }

    const requestedAI = ai || 'claude';

    if (requestedAI === 'claude') {
      const results = [];
      for (const p of prompts) {
        const r = await callClaude(p);
        results.push(r || fallback());
      }
      return res.status(200).json({ results, multiAI: [{ ai: 'claude', name: 'Claude Sonnet (Anthropic)', results }] });
    }
    if (requestedAI === 'gpt') {
      const results = await Promise.all(prompts.map(p => callGPT(p).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'gpt', name: 'GPT-4o (OpenAI)', results }] });
    }
    if (requestedAI === 'grok') {
      const results = await Promise.all(prompts.map(p => callGrok(p).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'grok', name: 'Grok 3 (xAI)', results }] });
    }

    return res.status(400).json({ error: 'AI provider non riconosciuto: ' + requestedAI });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fallback() {
  return { scoreON: 50, scoreSS: 55, sintesi: 'Analisi non disponibile per questo provider.', redFlags: [], puntiForza: [], puntiDeboli: [], opportunita: [], critiche: [], verdict: '', decisione: '', puntiChiave: [], azioniImmediate: [] };
}
