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
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await res.json();
      const text = (data.content || []).map(i => i.text || '').join('').trim();

      let parsed = null;
      try { parsed = JSON.parse(text); } catch(e) {}
      if (!parsed) { const m = text.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch(e) {} }

      // Se ancora non parsato, costruiamo manualmente dal testo
      if (!parsed) {
        // Estrai numeri scoreON e scoreSS con regex
        const onMatch = text.match(/scoreON["\s:]+(\d+)/);
        const ssMatch = text.match(/scoreSS["\s:]+(\d+)/);
        const sintesiMatch = text.match(/sintesi["\s:"]+"([^"]+)"/);
        parsed = {
          scoreON: onMatch ? parseInt(onMatch[1]) : 60,
          scoreSS: ssMatch ? parseInt(ssMatch[1]) : 65,
          sintesi: sintesiMatch ? sintesiMatch[1] : text.substring(0, 200),
          _raw: text.substring(0, 500)
        };
      }

      results.push(parsed);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
