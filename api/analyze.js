export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).send('AdAstra API OK');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompts } = req.body;
    const API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'API key mancante' });

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
          model: 'claude-sonnet-4-20250514',
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

      if (parsed) {
        results.push({
          scoreON: parsed.scoreON || parsed.score_on || 0,
          scoreSS: parsed.scoreSS || parsed.score_ss || 0,
          scoreONLabel: parsed.scoreONLabel || '',
          scoreSSLabel: parsed.scoreSSLabel || '',
          sintesi: parsed.sintesi || parsed.summary || parsed.analisi || '',
          redFlags: parsed.redFlags || parsed.red_flags || [],
          puntiForza: parsed.puntiForza || parsed.punti_forza || [],
          puntiDeboli: parsed.puntiDeboli || parsed.punti_deboli || [],
          opportunita: parsed.opportunita || [],
          critiche: parsed.critiche || [],
          verdict: parsed.verdict || parsed.verdetto || '',
          decisione: parsed.decisione || '',
          puntiChiave: parsed.puntiChiave || parsed.punti_chiave || [],
          azioniImmediate: parsed.azioniImmediate || parsed.azioni_immediate || []
        });
      } else {
        results.push({
          scoreON: 55, scoreSS: 60,
          sintesi: text.substring(0, 400),
          redFlags: [], puntiForza: [], puntiDeboli: [],
          opportunita: [], critiche: [],
          verdict: '', decisione: '',
          puntiChiave: [], azioniImmediate: []
        });
      }
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
