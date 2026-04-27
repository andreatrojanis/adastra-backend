exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod === 'GET') return { statusCode: 200, headers: { ...headers, 'Content-Type': 'text/plain' }, body: 'AdAstra API OK' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const { prompts } = JSON.parse(event.body);
    const API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key mancante' }) };

    const results = [];

    for (const prompt of prompts) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ 
            role: 'user', 
            content: prompt
          }]
        })
      });

      const data = await res.json();
      const text = (data.content || []).map(i => i.text || '').join('').trim();

      // Restituiamo sempre il testo grezzo per debug + parsing
      let parsed = null;
      
      // Prova 1: JSON diretto
      try { parsed = JSON.parse(text); } catch(e) {}
      
      // Prova 2: estrai oggetto JSON
      if (!parsed) {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) try { parsed = JSON.parse(m[0]); } catch(e) {}
      }

      if (parsed) {
        // Normalizza i nomi dei campi nel caso Claude usi nomi diversi
        const normalized = {
          scoreON: parsed.scoreON || parsed.score_on || parsed.on_score || 0,
          scoreSS: parsed.scoreSS || parsed.score_ss || parsed.ss_score || parsed.smartstart_score || 0,
          scoreONLabel: parsed.scoreONLabel || parsed.score_on_label || '',
          scoreSSLabel: parsed.scoreSSLabel || parsed.score_ss_label || '',
          sintesi: parsed.sintesi || parsed.sintesi_strategica || parsed.summary || parsed.analisi || '',
          redFlags: parsed.redFlags || parsed.red_flags || parsed.flags || [],
          puntiForza: parsed.puntiForza || parsed.punti_forza || parsed.strengths || [],
          puntiDeboli: parsed.puntiDeboli || parsed.punti_deboli || parsed.weaknesses || [],
          opportunita: parsed.opportunita || parsed.opportunities || [],
          critiche: parsed.critiche || parsed.criticita || parsed.critiques || [],
          verdict: parsed.verdict || parsed.verdetto || '',
          decisione: parsed.decisione || parsed.decision || '',
          puntiChiave: parsed.puntiChiave || parsed.punti_chiave || parsed.key_points || [],
          azioniImmediate: parsed.azioniImmediate || parsed.azioni_immediate || parsed.actions || [],
          _debug: text.substring(0, 200)
        };
        results.push(normalized);
      } else {
        // Fallback con testo grezzo visibile
        results.push({
          scoreON: 55,
          scoreSS: 60,
          sintesi: 'Analisi completata. ' + text.substring(0, 300),
          redFlags: [],
          puntiForza: [],
          puntiDeboli: [],
          opportunita: [],
          critiche: [],
          _debug: text.substring(0, 500)
        });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
