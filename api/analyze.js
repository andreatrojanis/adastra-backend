module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
 
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).send('AdAstra API OK');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
 
  // DEBUG — mostra cosa arriva nel body
  return res.status(200).json({ 
    results: [{ 
      scoreON: 0, scoreSS: 0, 
      sintesi: 'BODY TYPE: ' + typeof req.body + ' | BODY: ' + JSON.stringify(req.body).substring(0,300),
      redFlags: [], puntiForza: [], puntiDeboli: [],
      opportunita: [], critiche: [],
      verdict: 'DEBUG', decisione: 'DEBUG',
      puntiChiave: [], azioniImmediate: [] 
    }] 
  });
};
 
