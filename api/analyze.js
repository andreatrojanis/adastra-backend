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

    // ── CLAUDE ──
    async function callClaude(prompt) {
      if (!ANTHROPIC_KEY) return null;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: 'Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n' + prompt }] })
      });
      const d = await r.json();
      const text = (d.content || []).map(i => i.text || '').join('').trim();
      return parseJSON(text);
    }

    // ── GPT-4o ──
    async function callGPT(prompt) {
      if (!OPENAI_KEY) return null;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1000, messages: [
          { role: 'system', content: 'Sei un esperto di finanza agevolata italiana. Rispondi SOLO con JSON valido. Nessun testo prima o dopo. Nessun markdown.' },
          { role: 'user', content: prompt }
        ]})
      });
      const d = await r.json();
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    // ── GEMINI ──
    async function callGemini(prompt) {
      if (!GEMINI_KEY) return null;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Sei un esperto di finanza agevolata italiana. Rispondi SOLO con JSON valido. Nessun testo prima o dopo. Nessun markdown.\n\n' + prompt }] }], generationConfig: { maxOutputTokens: 1000 } })
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

    if (requestedAI === 'claude' || requestedAI === 'all') {
      const claudeResults = await Promise.all(prompts.map(p => callClaude(p).then(r => r || fallback())));
      results.push({ ai: 'claude', name: 'Claude (Anthropic)', results: claudeResults });
    }

    if ((requestedAI === 'gpt' || requestedAI === 'all') && OPENAI_KEY) {
      const gptResults = await Promise.all(prompts.map(p => callGPT(p).then(r => r || fallback())));
      results.push({ ai: 'gpt', name: 'GPT-4o Mini (OpenAI)', results: gptResults });
    }

    if ((requestedAI === 'gemini' || requestedAI === 'all') && GEMINI_KEY) {
      const geminiResults = await Promise.all(prompts.map(p => callGemini(p).then(r => r || fallback())));
      results.push({ ai: 'gemini', name: 'Gemini 1.5 Flash (Google)', results: geminiResults });
    }

    // Fallback compatibilità vecchio frontend — se richiede solo claude restituisce results flat
    if (requestedAI === 'claude' && results.length === 1) {
      return res.status(200).json({ results: results[0].results, multiAI: results });
    }

    return res.status(200).json({ results: results[0]?.results || [], multiAI: results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fallback() {
  return { scoreON: 50, scoreSS: 55, sintesi: 'Analisi non disponibile', redFlags: [], puntiForza: [], puntiDeboli: [], opportunita: [], critiche: [], verdict: '', decisione: '', puntiChiave: [], azioniImmediate: [] };
}
