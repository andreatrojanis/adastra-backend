exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'text/plain' }, body: 'AdAstra API OK' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const prompts = body.prompts;
    const API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key mancante' }) };
    }

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

      if (!data.content || !Array.isArray(data.content)) {
        results.push({ error: 'Risposta API non valida', raw: JSON.stringify(data).substring(0, 300) });
        continue;
      }

      const text = data.content.map(i => i.text || '').join('');
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        results.push({ error: 'JSON non trovato', raw: text.substring(0, 300) });
        continue;
      }

      try {
        results.push(JSON.parse(match[0]));
      } catch(parseErr) {
        results.push({ error: 'Parse error', raw: match[0].substring(0, 300) });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, stack: err.stack }) };
  }
};
