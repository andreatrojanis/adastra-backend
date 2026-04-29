module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: 'Rispondi SOLO con JSON: {"scoreON":70,"scoreSS":75,"sintesi":"test ok","puntiForza":["forza 1"],"puntiDeboli":["debolezza 1"]}' }]
    })
  });
  
  const d = await r.json();
  const raw = (d.content || []).map(i => i.text || '').join('');
  
  return res.status(200).json({ raw, d });
};
