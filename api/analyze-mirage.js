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

    // ── MODELLI CLAUDE ──
    // Gli agenti di scoring (AVF, AAS, AVT) girano su Haiku: compito strutturato, veloce, economico.
    // Il Devil's Advocate (AAA, indice 3) gira su Sonnet 4.6: serve giudizio più acuto sui rischi non ovvi.
    const MODEL_HAIKU = 'claude-haiku-4-5-20251001';
    const MODEL_AAA   = 'claude-sonnet-4-5';
    const AAA_INDEX   = 3; // ordine prompts: [AVF, AAS, AVT, AAA]

    // ── CALIBRATION PREFIXES ──
    const CLAUDE_PREFIX = 'REGOLE ASSOLUTE DI VALUTAZIONE: investimento €0 = scoreON e scoreSS massimo 25. Descrizione vuota o generica = -20 punti. Zero trazione (0 LOI, 0 ricavi, 0 pilot) = -25 punti. Team con 0 anni esperienza = -20 punti. TRL 3 senza IP = -15 punti. DISTINZIONE IMPORTANTE: i dati finanziari di dettaglio (capex per voce, opex mensile, cash-burn, runway, costi API per provider, break-even con scenario conservativo, timing della spesa) NON sono raccolti in questa fase e NON devono essere penalizzati come carenze del progetto: vanno indicati tra gli elementi da sviluppare in fase di dossier, non tra le red flag. Restano invece red flag vere solo i dati hard strutturali: impresa non costituita, compagine assente o non verificabile, anzianita oltre i limiti, zero trazione, team tecnico inadeguato, settore non dichiarato. Un progetto incompleto sui dati HARD non supera mai 35.\n\n';

    const GPT_PREFIX = 'Sei un istruttore Invitalia molto severo e scettico. REGOLE FERREE: se investimento dichiarato è €0, scoreON e scoreSS NON possono superare 30. Se trazione è zero (nessun LOI, nessun ricavo, nessun pilot), togli almeno 20 punti. Se team ha 0 anni di esperienza o manca team tecnico su progetto tech, togli almeno 20 punti. Se TRL è 3 o 4 senza IP, togli 15 punti. DISTINZIONE IMPORTANTE: i dati finanziari di dettaglio (capex per voce, opex mensile, cash-burn, runway, costi API per provider, break-even con scenario conservativo, timing della spesa) NON sono raccolti in questa fase e NON devono essere penalizzati come carenze del progetto: vanno indicati tra gli elementi da sviluppare in fase di dossier, non tra le red flag. Restano invece red flag vere solo i dati hard strutturali: impresa non costituita, compagine assente o non verificabile, anzianita oltre i limiti, zero trazione, team tecnico inadeguato, settore non dichiarato. Non compensare debolezze strutturali con punti di forma. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    const GROK_PREFIX = 'Sei un analista di rischio specializzato in finanza agevolata italiana. Il tuo compito è proteggere i fondi pubblici da progetti non meritevoli. Sei scettico, preciso e ancorato ai fatti. Dati mancanti = penalità severe. Zero investimento = progetto non finanziabile, score massimo 25. Zero trazione = -25 punti. Team senza esperienza tecnica su progetto tech = -20 punti. DISTINZIONE IMPORTANTE: i dati finanziari di dettaglio (capex per voce, opex mensile, cash-burn, runway, costi API per provider, break-even con scenario conservativo, timing della spesa) NON sono raccolti in questa fase e NON devono essere penalizzati come carenze del progetto: vanno indicati tra gli elementi da sviluppare in fase di dossier, non tra le red flag. Restano invece red flag vere solo i dati hard strutturali: impresa non costituita, compagine assente o non verificabile, anzianita oltre i limiti, zero trazione, team tecnico inadeguato, settore non dichiarato. Non esistono punti di forza se non esplicitamente documentati. La vaghezza è una red flag. Rispondi SOLO con JSON valido. Nessun testo prima o dopo.\n\n';

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ── CLAUDE (Haiku per scoring, Sonnet per AAA) ──
    // Ogni errore viene registrato con la sua causa esatta e restituito nella risposta (agent_errors)
    const agentErrors = {};
    function noteErr(idx, msg) {
      (agentErrors[idx] = agentErrors[idx] || []).push(msg);
      console.error(`[A${idx}] ${msg}`);
    }
    const CALL_TIMEOUT_MS = 55000;
    async function callClaude(prompt, idx) {
      if (!ANTHROPIC_KEY) { noteErr(idx, 'ANTHROPIC_API_KEY mancante'); return null; }
      const model = (idx === AAA_INDEX) ? MODEL_AAA : MODEL_HAIKU;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
      let r;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 3000,
            messages: [{ role: 'user', content: CLAUDE_PREFIX + prompt }]
          })
        });
      } catch (e) {
        clearTimeout(timer);
        noteErr(idx, e.name === 'AbortError' ? `timeout oltre ${CALL_TIMEOUT_MS / 1000}s` : `errore di rete: ${e.message}`);
        return null;
      }
      clearTimeout(timer);
      if (!r.ok) {
        const errBody = await r.text().catch(() => '');
        noteErr(idx, `HTTP ${r.status}: ${errBody.substring(0, 120)}`);
        return null;
      }
      const d = await r.json().catch(() => null);
      if (!d) { noteErr(idx, 'corpo della risposta non leggibile'); return null; }
      if (d.error) { noteErr(idx, `errore API: ${JSON.stringify(d.error).substring(0, 120)}`); return null; }
      const text = (d.content || []).map(i => i.text || '').join('').trim();
      if (!text) { noteErr(idx, 'risposta vuota'); return null; }
      const parsed = parseJSON(text);
      if (!parsed) {
        noteErr(idx, (d.stop_reason === 'max_tokens' ? 'risposta troncata (max_tokens). ' : 'JSON non leggibile. ') + 'Inizio: ' + text.substring(0, 80));
        return null;
      }
      if (!isFinite(Number(parsed.scoreON)) || !isFinite(Number(parsed.scoreSS))) {
        noteErr(idx, 'JSON senza scoreON/scoreSS numerici');
        return null;
      }
      return parsed;
    }

    // ── GPT-4o e GROK — stessa robustezza degli agenti Claude ──
    const CHAT_PROVIDERS = {
      gpt:  { url: 'https://api.openai.com/v1/chat/completions', key: () => OPENAI_KEY, model: 'gpt-4o', system: GPT_PREFIX, family: 'gpt-4o' },
      grok: { url: 'https://api.x.ai/v1/chat/completions', key: () => GROK_KEY, model: 'grok-4-1-fast-non-reasoning', system: GROK_PREFIX, family: 'grok-4' }
    };
    const providerErrors = { gpt: {}, grok: {} };
    async function callChat(provider, prompt, idx) {
      const cfg = CHAT_PROVIDERS[provider];
      const note = (msg) => { (providerErrors[provider][idx] = providerErrors[provider][idx] || []).push(msg); console.error(`[${provider} A${idx}] ${msg}`); };
      if (!cfg.key()) { note('API key mancante'); return null; }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
      let r;
      try {
        r = await fetch(cfg.url, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key() },
          body: JSON.stringify({ model: cfg.model, max_tokens: 2000, messages: [ { role: 'system', content: cfg.system }, { role: 'user', content: prompt } ] })
        });
      } catch (e) {
        clearTimeout(timer);
        note(e.name === 'AbortError' ? `timeout oltre ${CALL_TIMEOUT_MS / 1000}s` : `errore di rete: ${e.message}`);
        return null;
      }
      clearTimeout(timer);
      if (!r.ok) { const t = await r.text().catch(() => ''); note(`HTTP ${r.status}: ${t.substring(0, 120)}`); return null; }
      const d = await r.json().catch(() => null);
      if (!d) { note('corpo della risposta non leggibile'); return null; }
      if (d.error) { note(`errore API: ${JSON.stringify(d.error).substring(0, 120)}`); return null; }
      const choice = d.choices && d.choices[0];
      const text = ((choice && choice.message && choice.message.content) || '').trim();
      if (!text) { note('risposta vuota'); return null; }
      const parsed = parseJSON(text);
      if (!parsed) { note((choice.finish_reason === 'length' ? 'risposta troncata. ' : 'JSON non leggibile. ') + 'Inizio: ' + text.substring(0, 80)); return null; }
      if (!isFinite(Number(parsed.scoreON)) || !isFinite(Number(parsed.scoreSS))) { note('JSON senza scoreON/scoreSS numerici'); return null; }
      return parsed;
    }
    async function callChatRetry(provider, prompt, idx) {
      const WAITS = [0, 3000 + idx * 500, 8000 + idx * 500];
      for (let a = 0; a < WAITS.length; a++) {
        if (WAITS[a]) await delay(WAITS[a]);
        const r = await callChat(provider, prompt, idx);
        if (r) return r;
      }
      return null;
    }
    // compatibilita con i rami gpt/grok esistenti
    const callGPT  = (prompt, idx = 0) => callChatRetry('gpt', prompt, idx);
    const callGrok = (prompt, idx = 0) => callChatRetry('grok', prompt, idx);

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

    // ══════════════════════════════════════════════════════════
    //  MIRAGE — Modulo divergenza (Fase 1: IDP intra-panel + IDCM cross-modello)
    //  Riferimento: brevetto v7.7-bis, sezioni 6 e 10, rivendicazione 3.
    // ══════════════════════════════════════════════════════════
    const MIRAGE_DIMS = ['requisiti','innovazione','mercato','team','numeri','impatti'];
    const DIM_WEIGHTS = { requisiti:0.20, innovazione:0.15, mercato:0.15, team:0.20, numeri:0.15, impatti:0.15 };

    // Estrae il vettore dimensionale [0,1] da un risultato agente.
    // Se l'agente ha prodotto "dimensioni", usa quelle; altrimenti deriva da scoreON/scoreSS (fallback prudente).
    function scoreVector(r) {
      const d = r && r.dimensioni;
      if (d && typeof d === 'object') {
        return MIRAGE_DIMS.map(k => {
          const v = Number(d[k]);
          return isFinite(v) ? Math.max(0, Math.min(1, v/100)) : 0.5;
        });
      }
      // fallback: proietta i due score come profilo piatto (divergenza solo sui due bandi)
      const base = ((Number(r.scoreON)||0) + (Number(r.scoreSS)||0)) / 200;
      return MIRAGE_DIMS.map(() => Math.max(0, Math.min(1, base)));
    }

    const _mean = a => a.reduce((s,x)=>s+x,0) / (a.length||1);
    function _std(a){ const m=_mean(a); return Math.sqrt(_mean(a.map(x=>(x-m)*(x-m)))); }
    function _col(M,j){ return M.map(row => row[j]); }

    // IDP per dimensione = deviazione standard normalizzata degli agenti (max_range = 1)
    function computeIDP(vectors) {
      if (!vectors.length) return null;
      const idp_per_dim = {};
      MIRAGE_DIMS.forEach((dim,j) => { idp_per_dim[dim] = +(_std(_col(vectors,j))).toFixed(4); });
      let sw=0, s=0;
      MIRAGE_DIMS.forEach(dim => { const w=DIM_WEIGHTS[dim]; s += w*idp_per_dim[dim]; sw += w; });
      const idp_tot = +(s/sw).toFixed(4);
      // dimensioni in conflitto oltre soglia di avviso
      const WARN = 0.10;
      const conflict_dimensions = MIRAGE_DIMS.filter(dim => idp_per_dim[dim] >= WARN);
      return { idp_per_dim, idp_tot, conflict_dimensions };
    }

    // IDCM cross-modello = (1/M) * Σ_j ||v_j - v_mean|| / sqrt(N)   (rivendicazione 3)
    function computeIDCM(modelVectors) {
      const M = modelVectors.length;
      if (M < 2) return null;
      const N = MIRAGE_DIMS.length;
      const vmean = MIRAGE_DIMS.map((_,j) => _mean(_col(modelVectors,j)));
      const dist = modelVectors.map(v => {
        let s=0; for (let j=0;j<N;j++){ const d=v[j]-vmean[j]; s+=d*d; }
        return Math.sqrt(s) / Math.sqrt(N);
      });
      return +(_mean(dist)).toFixed(4);
    }

    // Costruisce il blocco mirage a partire dai risultati di un panel (stesso provider)
    // Fase 1.1 — l'agente avversariale (AAA) e trattato a parte, come da rivendicazione 2:
    // la divergenza intra-panel si misura sugli agenti di merito; lo scarto dell'AAA
    // si misura dimensione per dimensione e pesa tramite il coefficiente adattivo C_AAA.
    const OBJ_DELTA = 0.08; // scarto AAA oltre la sua media che qualifica un'obiezione mirata
    function computeAAA(panelVectors, aaaVector) {
      const gap = {};
      MIRAGE_DIMS.forEach((dim, j) => {
        gap[dim] = +(_mean(_col(panelVectors, j)) - aaaVector[j]).toFixed(4);
      });
      const gapMean = +_mean(Object.values(gap)).toFixed(4);
      const targeted = MIRAGE_DIMS.filter(dim => gap[dim] - gapMean >= OBJ_DELTA);
      // C_AAA = C_base + alpha * (1 - CV_norm), limite 0.40; CV sugli score sintetici degli agenti di merito
      const synth = panelVectors.map(v => _mean(v));
      const mu = _mean(synth);
      const cv = mu > 0 ? _std(synth) / mu : 1;
      const cvNorm = Math.min(1, Math.max(0, cv));
      const cAAA = +Math.min(0.40, 0.20 + 0.15 * (1 - cvNorm)).toFixed(4);
      return { gap_per_dim: gap, gap_mean: gapMean, targeted_objections: targeted, cv_norm: +cvNorm.toFixed(4), c_aaa: cAAA };
    }

    function mirageBlock(results) {
      // Solo i 4 agenti del panel: un eventuale 5° prompt (sintetizzatore) non ha vettore dimensionale
      const agents = results.slice(0, AAA_INDEX + 1);
      // Gli agenti che non hanno risposto (fallback) non entrano nei calcoli: un segnaposto non e un voto
      const missing = agents.map((r, i) => (!r || r._fallback) ? i : -1).filter(i => i >= 0);
      const vectors = agents.map(r => (!r || r._fallback) ? null : scoreVector(r));
      const panel = vectors.slice(0, AAA_INDEX).filter(Boolean);
      const aaaVec = vectors.length > AAA_INDEX ? vectors[AAA_INDEX] : null;
      const idpPanel = panel.length >= 2 ? computeIDP(panel) : null;
      const idpAll = computeIDP(vectors.filter(Boolean));
      return {
        version: 'mirage-phase1.2',
        dims: MIRAGE_DIMS,
        agents_missing: missing,
        panel_complete: missing.length === 0,
        agent_vectors: vectors.map(v => v ? v.map(x => +x.toFixed(3)) : null),
        // divergenza tra agenti di merito (AAA escluso)
        idp_per_dim: idpPanel ? idpPanel.idp_per_dim : null,
        idp_tot: idpPanel ? idpPanel.idp_tot : null,
        conflict_dimensions: idpPanel ? idpPanel.conflict_dimensions : [],
        // riferimento: divergenza calcolata includendo l'AAA
        idp_tot_with_aaa: idpAll ? idpAll.idp_tot : null,
        aaa: (aaaVec && panel.length >= 1) ? computeAAA(panel, aaaVec) : null
      };
    }

    // ══════════════════════════════════════════════════════════
    //  MIRAGE — Fase 2: divergenza cross-modello (IDCM)
    //  IDCM = (1/M) * Σ_j ||v_j - v_mean|| / sqrt(N)   (descrizione v7.7-bis, sez. 10)
    //  v_j = vettore del modello j = media dei vettori dei suoi agenti di merito (AAA escluso)
    // ══════════════════════════════════════════════════════════
    const THRESHOLD_PROFILE = { id: 'TP-default-v1', warn: 0.10, critical: 0.20 }; // configurabile
    const MODEL_META = {
      claude: { provider: 'anthropic', family: 'claude', model: MODEL_HAIKU + ' + ' + MODEL_AAA + ' (AAA)' },
      gpt:    { provider: 'openai',    family: 'gpt-4o', model: 'gpt-4o' },
      grok:   { provider: 'xai',       family: 'grok-4', model: 'grok-4-1-fast-non-reasoning' }
    };
    function computeCrossModel(panels) {
      const N = MIRAGE_DIMS.length;
      const models = [];
      Object.keys(panels).forEach(name => {
        const m = panels[name].mirage;
        const merit = (m.agent_vectors || []).slice(0, AAA_INDEX).filter(Boolean);
        const meta = MODEL_META[name] || { provider: name, family: name, model: name };
        const entry = { name, provider: meta.provider, family: meta.family, model: meta.model, merit_agents: merit.length, available: merit.length >= 2, vector: null };
        if (entry.available) entry.vector = MIRAGE_DIMS.map((_, j) => +_mean(_col(merit, j)).toFixed(4));
        models.push(entry);
      });
      // Model Independence (forma base): stesso provider e stessa famiglia = non indipendenti
      const issues = [];
      for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++) {
        if (models[a].provider === models[b].provider && models[a].family === models[b].family)
          issues.push(`${models[a].name} e ${models[b].name}: stesso provider e famiglia`);
      }
      const usable = models.filter(m => m.available);
      const base = { threshold_profile: THRESHOLD_PROFILE, models, independence: { ok: issues.length === 0, issues } };
      if (usable.length < 2) return Object.assign(base, { version: 'mirage-phase2', idcm: null, state: 'insufficiente', reason: 'meno di 2 modelli con risposte valide' });
      const V = usable.map(m => m.vector);
      const vmean = MIRAGE_DIMS.map((_, j) => _mean(_col(V, j)));
      const dist = {};
      usable.forEach((m, k) => {
        let s2 = 0; for (let j = 0; j < N; j++) { const d = V[k][j] - vmean[j]; s2 += d * d; }
        dist[m.name] = +(Math.sqrt(s2) / Math.sqrt(N)).toFixed(4);
      });
      const idcmVal = +_mean(Object.values(dist)).toFixed(4);
      const dimDiv = {};
      MIRAGE_DIMS.forEach((dim, j) => { dimDiv[dim] = +_std(_col(V, j)).toFixed(4); });
      const conflictDims = MIRAGE_DIMS.filter(d => dimDiv[d] >= THRESHOLD_PROFILE.warn);
      const topDim = MIRAGE_DIMS.reduce((a, b) => dimDiv[b] > dimDiv[a] ? b : a);
      const topModel = Object.keys(dist).reduce((a, b) => dist[b] > dist[a] ? b : a);
      const state = !base.independence.ok ? 'indipendenza non soddisfatta'
        : idcmVal >= THRESHOLD_PROFILE.critical ? 'critica'
        : (idcmVal >= THRESHOLD_PROFILE.warn || conflictDims.length) ? 'moderata' : 'stabile';
      return Object.assign(base, {
        version: 'mirage-phase2',
        models_used: usable.length,
        idcm: idcmVal,
        state,
        model_distances: dist,
        v_mean: vmean.map(x => +x.toFixed(4)),
        dim_divergence: dimDiv,
        conflict_dimensions: conflictDims,
        most_divergent_dimension: topDim,
        most_divergent_model: usable.length >= 3 ? topModel : null // con 2 modelli le distanze dal centro sono uguali
      });
    }

    // ── DISPATCH ──
    const requestedAI = ai || 'claude';

    async function runClaudePanel(promptList) {
      return Promise.all(promptList.map(async (p, i) => {
        await delay(i * 2000 + 500); // stagger 2s tra agenti
        // Fino a 3 tentativi con attese crescenti: l'agente deve rispondere
        const WAITS = [0, 4000 + i * 800, 10000 + i * 800];
        let r = null;
        for (let a = 0; a < WAITS.length && !r; a++) {
          if (WAITS[a]) await delay(WAITS[a]);
          r = await callClaude(p, i);
        }
        return r || fallback();
      }));
    }
    async function runChatPanel(provider, promptList) {
      return Promise.all(promptList.map(async (p, i) => {
        await delay(i * 500);
        return (await callChatRetry(provider, p, i)) || fallback();
      }));
    }

    if (requestedAI === 'claude') {
      const results = await runClaudePanel(prompts);
      const mirage = mirageBlock(results);
      return res.status(200).json({ results, mirage, agent_errors: agentErrors, multiAI: [{ ai: 'claude', name: 'Claude (Anthropic)', results }] });
    }

    // ── MIRAGE FASE 2: tre modelli indipendenti sullo stesso panel + IDCM ──
    // Nessun modello vede le risposte degli altri: l'indipendenza e condizione del calcolo IDCM.
    if (requestedAI === 'mirage') {
      const panelPrompts = prompts.slice(0, AAA_INDEX + 1);
      const [claudeRes, gptRes, grokRes] = await Promise.all([
        runClaudePanel(panelPrompts),
        runChatPanel('gpt', panelPrompts),
        runChatPanel('grok', panelPrompts)
      ]);
      const panels = {
        claude: { results: claudeRes, mirage: mirageBlock(claudeRes) },
        gpt:    { results: gptRes,    mirage: mirageBlock(gptRes) },
        grok:   { results: grokRes,   mirage: mirageBlock(grokRes) }
      };
      const idcm = computeCrossModel(panels);
      return res.status(200).json({
        mode: 'mirage',
        panels,
        idcm,
        errors: { claude: agentErrors, gpt: providerErrors.gpt, grok: providerErrors.grok }
      });
    }

    if (requestedAI === 'gpt') {
      // ── MIGLIORAMENTO 1: GPT riceve anche il raw output degli agenti Claude se disponibile ──
      const claudeContext = req.body.claudeResults
        ? '\n\nPANEL CLAUDE (per confronto e validazione incrociata):\n' +
          req.body.claudeResults.map((r, i) => `A${i+1}: scoreON=${r.scoreON} scoreSS=${r.scoreSS}. ${r.sintesi||''}`).join('\n')
        : '';

      const results = await Promise.all(prompts.map((p, i) => callGPT(p + claudeContext, i).then(r => r || fallback())));
      const mirage = mirageBlock(results);
      return res.status(200).json({ results, mirage, multiAI: [{ ai: 'gpt', name: 'GPT-4o (OpenAI)', results }] });
    }

    if (requestedAI === 'grok') {
      // ── MIGLIORAMENTO 1: Grok riceve anche il raw output degli agenti Claude se disponibile ──
      const claudeContext = req.body.claudeResults
        ? '\n\nPANEL CLAUDE (per confronto e validazione incrociata):\n' +
          req.body.claudeResults.map((r, i) => `A${i+1}: scoreON=${r.scoreON} scoreSS=${r.scoreSS}. ${r.sintesi||''}`).join('\n')
        : '';

      const results = await Promise.all(prompts.map((p, i) => callGrok(p + claudeContext, i).then(r => r || fallback())));
      const mirage = mirageBlock(results);
      return res.status(200).json({ results, mirage, multiAI: [{ ai: 'grok', name: 'Grok 3 (xAI)', results }] });
    }

    return res.status(400).json({ error: 'AI provider non riconosciuto: ' + requestedAI });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fallback() {
  return {
    scoreON: 50, scoreSS: 55,
    dimensioni: { requisiti:50, innovazione:50, mercato:50, team:50, numeri:50, impatti:50 },
    _fallback: true, // segnaposto: escluso dai calcoli MIRAGE
    sintesi: 'Analisi non disponibile per questo provider.',
    redFlags: [], puntiForza: [], puntiDeboli: [],
    opportunita: [], critiche: [],
    verdict: '', decisione: '',
    puntiChiave: [], azioniImmediate: []
  };
}
