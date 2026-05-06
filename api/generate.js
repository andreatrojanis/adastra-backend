module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { sectionId, prompt } = req.body;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key mancante' });
    if (!prompt) return res.status(400).json({ error: 'Prompt mancante' });

    const SYSTEM = `Sei un consulente senior specializzato in finanza agevolata italiana, con 15 anni di esperienza nella redazione di dossier per Invitalia, SIMEST, CDP e bandi PNRR.
Conosci in dettaglio i criteri di valutazione Smart&Start, ON - Oltre Nuove Imprese, e i principali bandi Invitalia.
Il tuo compito è redigere sezioni di dossier professionali, abbondanti, specifiche e convincenti per le commissioni istruttorie.

REGOLE ASSOLUTE:
- Scrivi in italiano professionale, formale ma diretto
- Ogni sezione deve essere ABBONDANTE: almeno 500-800 parole per le sezioni narrative, dati dettagliati per le sezioni finanziarie
- Usa dati specifici del progetto, mai genericità
- Struttura il testo con paragrafi chiari e logici
- Non usare bullet point generici — scrivi prosa argomentativa dove possibile
- Per le sezioni JSON: restituisci SOLO JSON valido, senza testo prima o dopo
- Per le sezioni narrative: restituisci SOLO il testo, senza intestazioni o titoli aggiuntivi`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const errBody = await r.text();
      return res.status(500).json({ error: `Claude API error ${r.status}: ${errBody.substring(0, 200)}` });
    }

    const d = await r.json();

    if (d.error) {
      return res.status(500).json({ error: d.error.message || 'Errore Claude API' });
    }

    const text = (d.content || []).map(i => i.text || '').join('').trim();

    if (!text) return res.status(500).json({ error: 'Risposta vuota da Claude' });

    // Per sezioni JSON: prova a parsare
    const JSON_SECTIONS = ['vpc', 'bmc', 'conto_economico', 'fonti_impieghi'];
    if (JSON_SECTIONS.includes(sectionId)) {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const raw = fence ? fence[1].trim() : text;
      try {
        const parsed = JSON.parse(raw);
        return res.status(200).json({ type: 'json', data: parsed, raw: text });
      } catch (e) {
        // Se non parsabile restituisci come testo
        return res.status(200).json({ type: 'text', data: text });
      }
    }

    return res.status(200).json({ type: 'text', data: text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
