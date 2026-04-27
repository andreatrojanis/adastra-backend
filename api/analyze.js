const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.status(200).send('AdAstra API OK');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // Parse body manually if needed
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    if (!body) {
      // Read raw body
      body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
        req.on('error', reject);
      });
    }

    const prompts = body.prompts;
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

      if (parsed) {
        results.push({
          scoreON: parsed.scoreON || 0,
          scoreSS: parsed.scoreSS || 0,
          scoreONLabel: parsed.scoreONLabel || '',
          scoreSSLabel: parsed.scoreSSLabel || '',
          sintesi: parsed.sintesi || parsed.summary || '',
          redFlags: parsed.redFlags || parsed.red_flags || [],
          puntiForza: parsed.puntiForza || parsed.punti_forza || [],
          puntiDeboli: parsed.puntiDeboli || parsed.punti_deboli || [],
          opportunita: parsed.opportunita || [],
          critiche: parsed.critiche || [],
          verdict: parsed.verdict || '',
          decisione: parsed.decisione || '',
          puntiChiave: parsed.puntiChiave || [],
          azioniImmediate: parsed.azioniImmediate || []
        });
      } else {
        results.push({
          scoreON: 55, scoreSS: 60,
          sintesi: text.substring(0, 400),
          redFlags: [], puntiForza: [], puntiDeboli: [],
          opportunita: [], critiche: [],
          verdict: 'BORDERLINE', decisione: 'GO CON CORREZIONI',
          puntiChiave: [], azioniImmediate: []
        });
      }
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
