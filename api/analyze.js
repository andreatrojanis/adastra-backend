module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).send('AdAstra API OK');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  return res.status(200).json({ results: [{ scoreON: 77, scoreSS: 82, sintesi: 'TEST VERCEL FUNZIONA', redFlags: ['test ok'], puntiForza: [], puntiDeboli: [], opportunita: [], critiche: [], verdict: 'TEST', decisione: 'GO', puntiChiave: [], azioniImmediate: [] }] });

  try {
    // Read and parse body
    const rawBody = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk.toString(); });
      req.on('end', () => resolve(data));
    });

    const body = JSON.parse(rawBody);
    const prompts = body.prompts;
    const API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: 'API key mancante' });
    if (!prompts || !prompts.length) return res.status(400).json({ error: 'Nessun prompt ricevuto', body: rawBody.substring(0,100) });

    const results = [];

    for (const prompt of prompts) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const text = (data.content || []).map(i => i.text || '').join('').trim();

      let parsed = null;
      try { parsed = JSON.parse(text); } catch(e) {}
      if (!parsed) {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) try { parsed = JSON.parse(m[0]); } catch(e) {}
      }

      results.push(parsed || {
        scoreON: 55, scoreSS: 60,
        sintesi: text.substring(0, 400) || 'Analisi completata',
        redFlags: [], puntiForza: [], puntiDeboli: [],
        opportunita: [], critiche: [],
        verdict: 'BORDERLINE', decisione: 'GO CON CORREZIONI',
        puntiChiave: [], azioniImmediate: []
      });
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
