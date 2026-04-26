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

      if (!data.content || !Array.isArray(data.content)) {
        results.push({ error: 'no_content', raw: JSON.stringify(data).substring(0, 500) });
        continue;
      }

      const text = data.content.map(i => i.text || '').join('').trim();
      
      // Try multiple parsing strategies
      let parsed = null;
      
      // Strategy 1: direct parse
      try { parsed = JSON.parse(text); } catch(e) {}
      
      // Strategy 2: extract JSON object
      if (!parsed) {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) try { parsed = JSON.parse(m[0]); } catch(e) {}
      }
      
      // Strategy 3: extract JSON after ```json
      if (!parsed) {
        const m = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (m) try { parsed = JSON.parse(m[1]); } catch(e) {}
      }

      if (parsed) {
        results.push(parsed);
      } else {
        results.push({ 
          scoreON: 0, scoreSS: 0, 
          sintesi: 'Errore parsing risposta AI', 
          raw: text.substring(0, 300) 
        });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
