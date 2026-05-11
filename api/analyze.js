module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(200).send('NO ANTHROPIC KEY');
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: 'Rispondi SOLO con questo JSON esatto: {"scoreON":70,"sintesi":"funziona"}' }] })
      });
      const d = await r.json();
      const raw = (d.content || []).map(i => i.text || '').join('') || JSON.stringify(d);
      return res.status(200).send('RAW CLAUDE: ' + raw);
    } catch(e) {
      return res.status(200).send('ERRORE: ' + e.message);
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompts, ai } = req.body;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const GROK_KEY = process.env.GROK_API_KEY;

    if (!prompts || !prompts.length) return res.status(400).json({ error: 'Nessun prompt' });

    // ── CALIBRATION PREFIXES ──
    const CLAUDE_PREFIX = 'REGOLE ASSOLUTE DI VALUTAZIONE: investimento €0 = scoreON e scoreSS massimo 25. Descrizione vuota o generica = -20 punti. Zero trazione (0 LOI, 0 ricavi, 0 pilot) = -25 punti. Team con 0 anni esperienza = -20 punti. TRL 3 senza IP = -15 punti. Dati mancanti sono red flag gravi. Un progetto incompleto non supera mai 35.\n\n';

    const GPT_PREFIX = 'Sei un istruttore Invitalia molto severo e scettico. REGOLE FERREE: se investimento dichiarato è €0, scoreON e scoreSS NON possono superare 30. Se trazione è zero (nessun LOI, nessun ricavo, nessun pilot), togli almeno 20 punti. Se team ha 0 anni di esperienza o manca team tecnico su progetto tech, togli almeno 20 punti. Se TRL è 3 o 4 senza IP, togli 15 punti. Non compensare debolezze strutturali con punti di forma. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    const GROK_PREFIX = 'Sei un analista di rischio specializzato in finanza agevolata italiana. Il tuo compito è proteggere i fondi pubblici da progetti non meritevoli. Sei scettico, preciso e ancorato ai fatti. Dati mancanti = penalità severe. Zero investimento = progetto non finanziabile, score massimo 25. Zero trazione = -25 punti. Team senza esperienza tecnica su progetto tech = -20 punti. Non esistono punti di forza se non esplicitamente documentati. La vaghezza è una red flag. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ── CLAUDE HAIKU ──
    async function callClaude(prompt, idx, debug) {
      if (!ANTHROPIC_KEY) return null;
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
          messages: [{ role: 'user', content: CLAUDE_PREFIX + prompt }]
        })
      });
      // Log HTTP errors (rate limit, overload, etc.)
      if (!r.ok) {
        const errBody = await r.text();
        console.error(`[A${idx}] HTTP ${r.status}: ${errBody.substring(0, 200)}`);
        return null;
      }
      const d = await r.json();
      // Log API-level errors
      if (d.error) {
        console.error(`[A${idx}] API error: ${JSON.stringify(d.error)}`);
        return null;
      }
      const text = (d.content || []).map(i => i.text || '').join('').trim();
      const parsed = parseJSON(text);
      if (debug && idx !== undefined) debug[idx] = { raw: text.substring(0, 300), parsed: !!parsed };
      return parsed;
    }

    // ── GPT-4o ──
    async function callGPT(prompt) {
      if (!OPENAI_KEY) return null;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_KEY
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: GPT_PREFIX },
            { role: 'user', content: prompt }
          ]
        })
      });
      const d = await r.json();
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    // ── GROK 3 ──
    async function callGrok(prompt) {
      if (!GROK_KEY) return null;
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROK_KEY
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-non-reasoning',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: GROK_PREFIX },
            { role: 'user', content: prompt }
          ]
        })
      });
      const d = await r.json();
      if (d.error) return { scoreON: 0, scoreSS: 0, sintesi: 'Grok error: ' + d.error.message, redFlags: [], puntiForza: [], puntiDeboli: [], opportunita: [], critiche: [], verdict: 'ERRORE', decisione: 'ERRORE', puntiChiave: [], azioniImmediate: [] };
      const text = (d.choices?.[0]?.message?.content || '').trim();
      return parseJSON(text);
    }

    // ── JSON PARSER ──
    function parseJSON(text) {
      if (!text) return null;
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) {
        try { return JSON.parse(fence[1].trim()); } catch(e) {}
      }
      const clean = text.trim();
      try { return JSON.parse(clean); } catch(e) {}
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) try { return JSON.parse(m[0]); } catch(e) {}
      return null;
    }

    // ── DISPATCH ──
    const requestedAI = ai || 'claude';

    if (requestedAI === 'claude') {
      // ── MIGLIORAMENTO 2: A04 Devil's Advocate è SEQUENZIALE ──
      // A01, A02, A03 in parallelo con stagger → poi A04 riceve i loro output

      const firstThree = prompts.slice(0, 3);
      const devilPrompt = prompts[3]; // A04

      // Step 1: chiama A01, A02, A03 in parallelo con stagger
      const firstResults = await Promise.all(firstThree.map(async (p, i) => {
        await delay(i * 1500);
        let r = await callClaude(p, i);
        if (!r) { await delay(2000); r = await callClaude(p, i); }
        return r || fallback();
      }));

      // Step 2: contesto agenti COMPLETO per A04 — tronca solo il prompt progetto
      const agentSummary = firstResults.map((r, i) => {
        const names = ['Valutatore Formale', 'Analista Strategico', 'Esperto Territoriale'];
        return `AGENTE ${i+1} (${names[i]}): scoreON=${r.scoreON} scoreSS=${r.scoreSS}.\nSintesi: ${r.sintesi||''}\nRedFlags: ${(r.redFlags||[]).join(' | ')}\nDebolezze: ${(r.puntiDeboli||[]).join(' | ')}\nCritiche: ${(r.critiche||[]).join(' | ')}`;
      }).join('\n\n');

      // Tronca il prompt originale di A04 a 600 chars (il progetto è già noto dagli agenti)
      const devilBase = devilPrompt.length > 600 ? devilPrompt.substring(0, 600) + '\n[...troncato — vedi analisi panel]' : devilPrompt;

      const devilPromptEnhanced = devilBase +
        '\n\nOUTPUT PANEL PRECEDENTE (usa per identificare disaccordi e criticità trascurate):\n' + agentSummary;

      // Step 3: A04 usa Sonnet (più veloce su prompt lunghi, output migliore)
      async function callClaudeSonnet(prompt, idx) {
        if (!ANTHROPIC_KEY) return null;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 1000,
            messages: [{ role: 'user', content: CLAUDE_PREFIX + prompt }]
          })
        });
        if (!r.ok) { const e = await r.text(); console.error(`[A${idx}] Sonnet HTTP ${r.status}: ${e.substring(0,200)}`); return null; }
        const d = await r.json();
        if (d.error) { console.error(`[A${idx}] Sonnet error: ${JSON.stringify(d.error)}`); return null; }
        const text = (d.content || []).map(i => i.text || '').join('').trim();
        return parseJSON(text);
      }

      let devil = await callClaudeSonnet(devilPromptEnhanced, 3);
      if (!devil) { await delay(1000); devil = await callClaudeSonnet(devilPromptEnhanced, 3); }
      devil = devil || fallback();

      const results = [...firstResults, devil];
      return res.status(200).json({ results, multiAI: [{ ai: 'claude', name: 'Claude Haiku (Anthropic)', results }] });
    }

    if (requestedAI === 'gpt') {
      // ── MIGLIORAMENTO 1: GPT riceve anche il raw output degli agenti Claude se disponibile ──
      const claudeContext = req.body.claudeResults
        ? '\n\nPANEL CLAUDE (per confronto e validazione incrociata):\n' +
          req.body.claudeResults.map((r, i) => `A${i+1}: scoreON=${r.scoreON} scoreSS=${r.scoreSS}. ${r.sintesi||''}`).join('\n')
        : '';

      const results = await Promise.all(prompts.map(p => callGPT(p + claudeContext).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'gpt', name: 'GPT-4o (OpenAI)', results }] });
    }

    if (requestedAI === 'grok') {
      // ── MIGLIORAMENTO 1: Grok riceve anche il raw output degli agenti Claude se disponibile ──
      const claudeContext = req.body.claudeResults
        ? '\n\nPANEL CLAUDE (per confronto e validazione incrociata):\n' +
          req.body.claudeResults.map((r, i) => `A${i+1}: scoreON=${r.scoreON} scoreSS=${r.scoreSS}. ${r.sintesi||''}`).join('\n')
        : '';

      const results = await Promise.all(prompts.map(p => callGrok(p + claudeContext).then(r => r || fallback())));
      return res.status(200).json({ results, multiAI: [{ ai: 'grok', name: 'Grok 3 (xAI)', results }] });
    }

    return res.status(400).json({ error: 'AI provider non riconosciuto: ' + requestedAI });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fallback() {
  return {
    scoreON: 50, scoreSS: 55,
    sintesi: 'Analisi non disponibile per questo provider.',
    redFlags: [], puntiForza: [], puntiDeboli: [],
    opportunita: [], critiche: [],
    verdict: '', decisione: '',
    puntiChiave: [], azioniImmediate: []
  };
}
