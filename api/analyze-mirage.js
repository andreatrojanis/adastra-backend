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

    if ((!prompts || !prompts.length) && ai !== 'mirage-audit') return res.status(400).json({ error: 'Nessun prompt' });

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
    async function callClaude(prompt, idx, opts = {}) {
      if (!ANTHROPIC_KEY) { noteErr(idx, 'ANTHROPIC_API_KEY mancante'); return null; }
      const model = opts.model || ((idx === AAA_INDEX) ? MODEL_AAA : MODEL_HAIKU);
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
            temperature: 0, // valutatore: niente rumore di campionamento tra esecuzioni
            messages: [{ role: 'user', content: opts.raw ? prompt : CLAUDE_PREFIX + prompt }]
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
      if (opts.schema === 'recheck') {
        if (!parsed.dimensioni || typeof parsed.dimensioni !== 'object') { noteErr(idx, 'JSON senza campo dimensioni'); return null; }
      } else if (!isFinite(Number(parsed.scoreON)) || !isFinite(Number(parsed.scoreSS))) {
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
    async function callChat(provider, prompt, idx, opts = {}) {
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
          body: JSON.stringify({ model: cfg.model, max_tokens: 2000, temperature: 0, seed: 7, messages: opts.raw ? [ { role: 'user', content: prompt } ] : [ { role: 'system', content: cfg.system }, { role: 'user', content: prompt } ] })
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
      if (opts.schema === 'recheck') {
        if (!parsed.dimensioni || typeof parsed.dimensioni !== 'object') { note('JSON senza campo dimensioni'); return null; }
      } else if (!isFinite(Number(parsed.scoreON)) || !isFinite(Number(parsed.scoreSS))) { note('JSON senza scoreON/scoreSS numerici'); return null; }
      return parsed;
    }
    async function callChatRetry(provider, prompt, idx, opts = {}) {
      const n = typeof idx === 'number' ? idx : 0;
      const WAITS = [0, 3000 + n * 500, 8000 + n * 500];
      for (let a = 0; a < WAITS.length; a++) {
        if (WAITS[a]) await delay(WAITS[a]);
        const r = await callChat(provider, prompt, idx, opts);
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
      // Anomalia: stesso voto su tutte le dimensioni = l'agente non ha differenziato (o ha ricopiato l'esempio)
      const anomalyFlags = [];
      vectors.forEach((v, i) => {
        if (v && _std(v) < 0.005 && _mean(v) > 0.02)
          anomalyFlags.push({ agent: i, type: 'VETTORE_NON_DIFFERENZIATO', detail: `stesso voto (${Math.round(v[0] * 100)}) su tutte le dimensioni` });
      });
      return {
        anomaly_flags: anomalyFlags,
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
    function computeCrossModel(panels, promptHashes = {}) {
      const N = MIRAGE_DIMS.length;
      const models = [];
      Object.keys(panels).forEach(name => {
        const m = panels[name].mirage;
        const merit = (m.agent_vectors || []).slice(0, AAA_INDEX).filter(Boolean);
        const meta = MODEL_META[name] || { provider: name, family: name, model: name };
        const entry = { name, provider: meta.provider, family: meta.family, model: meta.model, prompt_template_hash: promptHashes[name] || null, merit_agents: merit.length, available: merit.length >= 2, vector: null, anomalies: (m.anomaly_flags || []).length };
        if (entry.available) entry.vector = MIRAGE_DIMS.map((_, j) => +_mean(_col(merit, j)).toFixed(4));
        models.push(entry);
      });
      // Model Independence (forma base): stesso provider e stessa famiglia = non indipendenti
      const issues = [];
      for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++) {
        if (models[a].provider === models[b].provider && models[a].family === models[b].family)
          issues.push(`${models[a].name} e ${models[b].name}: stesso provider e famiglia`);
      }
      // Istruzioni identiche: requisito perche l'IDCM misuri i modelli e non i prompt
      const hashes = [...new Set(models.map(m => m.prompt_template_hash).filter(Boolean))];
      if (hashes.length > 1) issues.push('istruzioni diverse tra i modelli (prompt_template_hash non coincidente)');
      const usable = models.filter(m => m.available);
      const base = { threshold_profile: THRESHOLD_PROFILE, models, prompt_template_hash: hashes.length === 1 ? hashes[0] : null, independence: { ok: issues.length === 0, issues } };
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

    // ══════════════════════════════════════════════════════════
    //  MIRAGE — Fase 3: consenso apparente critico e Release Gate tecnico
    //  (descrizione v7.7-bis, sez. 4, 11, 12, 14)
    // ══════════════════════════════════════════════════════════
    // Set di criteri versionato. hard_constraint_flag = la dimensione non puo essere mediata dall'aggregato:
    // per Invitalia ogni criterio ha un minimo (Smart&Start 6/10 per criterio), quindi una media alta non compensa.
    const CRITERIA_SET = {
      version: 'starton-invitalia-1.1.0',
      dims: {
        requisiti:   { weight: 0.20, min_score: 0.60, hard_constraint_flag: true, release_effect: 'block_candidatura' },
        innovazione: { weight: 0.15, min_score: 0.60, hard_constraint_flag: true, release_effect: 'block_candidatura' },
        mercato:     { weight: 0.15, min_score: 0.60, hard_constraint_flag: true, release_effect: 'block_candidatura' },
        team:        { weight: 0.20, min_score: 0.60, hard_constraint_flag: true, release_effect: 'block_candidatura' },
        numeri:      { weight: 0.15, min_score: 0.60, hard_constraint_flag: true, release_effect: 'block_candidatura' },
        impatti:     { weight: 0.15, min_score: 0.50, hard_constraint_flag: false, release_effect: 'annotate' }
      }
    };
    const GATE_PROFILE = {
      id: 'GP-default-v1',
      acceptance_threshold: 0.60,   // score sintetico che renderebbe "accettabile" l'esito aggregato
      weight_min: 0.15,             // peso minimo di una dimensione per il consenso apparente
      dim_divergence_threshold: 0.15 // divergence_i oltre la quale la dimensione non e consensuale
    };
    const CONNECTORS = ['report_cliente', 'generazione_dossier', 'export_docx', 'passaggio_adastra'];
    // release_effect 'block_candidatura': criterio sotto soglia = domanda non candidabile finche non viene corretto
    const CANDIDATURA_CONNECTORS = ['generazione_dossier', 'export_docx', 'passaggio_adastra'];

    function weightedScore(vec) {
      let s = 0, sw = 0;
      MIRAGE_DIMS.forEach((d, j) => { const w = CRITERIA_SET.dims[d].weight; s += w * vec[j]; sw += w; });
      return s / sw;
    }

    function computeGate(panels, cross, extra = {}) {
      const reasons = [];
      // Score sintetico per modello: agenti di merito pesati (1 - C_AAA), agente avversariale pesato C_AAA
      const perModel = {};
      Object.keys(panels).forEach(name => {
        const m = panels[name].mirage;
        const entry = (cross.models || []).find(x => x.name === name);
        if (!entry || !entry.vector) return;
        const aaaVec = (m.agent_vectors || [])[AAA_INDEX];
        const c = m.aaa ? m.aaa.c_aaa : 0;
        const merit = weightedScore(entry.vector);
        perModel[name] = +(aaaVec ? (1 - c) * merit + c * weightedScore(aaaVec) : merit).toFixed(4);
      });
      const synthVals = Object.values(perModel);
      const synthetic = synthVals.length ? +_mean(synthVals).toFixed(4) : null;

      // divergence_i = massimo tra divergenza cross-modello e divergenza intra-panel dei singoli modelli
      const divergence = {};
      MIRAGE_DIMS.forEach(d => {
        const vals = [cross.dim_divergence ? cross.dim_divergence[d] : 0];
        Object.keys(panels).forEach(n => { const ip = panels[n].mirage.idp_per_dim; if (ip && ip[d] != null) vals.push(ip[d]); });
        divergence[d] = +Math.max(...vals).toFixed(4);
      });
      const maskedDims = MIRAGE_DIMS.filter(d =>
        CRITERIA_SET.dims[d].weight >= GATE_PROFILE.weight_min && divergence[d] >= GATE_PROFILE.dim_divergence_threshold);
      const masked = synthetic != null && synthetic >= GATE_PROFILE.acceptance_threshold && maskedDims.length > 0;

      // Vincoli rigidi: dimensione sotto la soglia minima sul vettore medio dei modelli
      const vmean = cross.v_mean || null;
      const hardViolations = vmean ? MIRAGE_DIMS.filter((d, j) => CRITERIA_SET.dims[d].hard_constraint_flag && vmean[j] < CRITERIA_SET.dims[d].min_score) : [];
      // Vincolo rigido non determinabile: i modelli divergono sulla dimensione e la soglia cade dentro la loro dispersione.
      // L'esito (sopra o sotto soglia) dipenderebbe da quale modello prevale: non si rilascia ne si blocca in silenzio.
      const hardUndecidable = vmean ? MIRAGE_DIMS.filter((d, j) => {
        const c = CRITERIA_SET.dims[d], dv = cross.dim_divergence ? cross.dim_divergence[d] : 0;
        return c.hard_constraint_flag && dv >= THRESHOLD_PROFILE.warn && Math.abs(vmean[j] - c.min_score) < dv;
      }) : [];
      const averageHidesHard = synthetic != null && synthetic >= GATE_PROFILE.acceptance_threshold && hardViolations.length > 0;

      const anomalies = Object.keys(panels).reduce((n, k) => n + ((panels[k].mirage.anomaly_flags || []).length), 0);
      const meritConflicts = Object.keys(panels).reduce((acc, k) => acc.concat(panels[k].mirage.conflict_dimensions || []), []);

      // ── Macchina a stati ──
      let state;
      if (extra.payload_valid === false) {
        state = 'QUARANTINED_OUTPUT';
        reasons.push('Conflict Execution Payload non valido: ' + (extra.payload_errors || []).join('; ') + ' — secondo stadio non eseguito');
      } else if (!cross.stage2_skipped && (!cross.models_used || cross.models_used < 2)) {
        state = 'QUARANTINED_OUTPUT';
        reasons.push('meno di 2 modelli con risposte valide: evidenza insufficiente per il rilascio');
      } else {
        if (cross.independence && !cross.independence.ok) reasons.push('indipendenza dei modelli non soddisfatta: ' + cross.independence.issues.join('; '));
        if (cross.idcm >= cross.threshold_profile.critical) reasons.push(`IDCM ${cross.idcm} oltre la soglia critica ${cross.threshold_profile.critical}`);
        if (masked) reasons.push('consenso apparente critico: score sintetico ' + synthetic + ' accettabile ma divergenza oltre soglia su ' + maskedDims.join(', '));
        if (hardUndecidable.length) reasons.push('vincolo rigido non determinabile: la soglia minima cade dentro la divergenza tra modelli su ' + hardUndecidable.map(d => d + ' (media ' + Math.round(vmean[MIRAGE_DIMS.indexOf(d)] * 100) + ', soglia ' + Math.round(CRITERIA_SET.dims[d].min_score * 100) + ', dispersione ' + Math.round(cross.dim_divergence[d] * 100) + ')').join(', '));
        if ((extra.scope_violations || []).length) reasons.push('il secondo stadio ha valutato dimensioni vietate dal payload (' + extra.scope_violations.join('; ') + ')');
        if (reasons.length) state = 'UNCERTAIN_STATE';
        else {
          if (cross.idcm >= cross.threshold_profile.warn) reasons.push(`IDCM ${cross.idcm} oltre la soglia di avviso`);
          if ((cross.conflict_dimensions || []).length) reasons.push('divergenza localizzata tra modelli su ' + cross.conflict_dimensions.join(', '));
          if (meritConflicts.length) reasons.push('disaccordo tra agenti di merito su ' + [...new Set(meritConflicts)].join(', '));
          if (hardViolations.length) reasons.push('criteri sotto la soglia minima (non compensabili dalla media): ' + hardViolations.join(', '));
          if (anomalies) reasons.push(anomalies + ' anomalie nei vettori degli agenti');
          state = reasons.length ? 'ANNOTATED_OUTPUT' : 'STABLE_OUTPUT';
          if (state === 'STABLE_OUTPUT') reasons.push('modelli concordi, nessun consenso apparente, nessun vincolo rigido violato');
        }
      }
      const enabledBy = {
        STABLE_OUTPUT:      CONNECTORS,
        ANNOTATED_OUTPUT:   CONNECTORS,           // rilasciabile, con avvertenze allegate
        UNCERTAIN_STATE:    ['report_cliente'],   // solo report tecnico con le cause; niente dossier, export, mandato
        QUARANTINED_OUTPUT: []                    // conservato, non rilasciabile
      }[state];
      let authorized = enabledBy.slice();
      const blockingViolations = hardViolations.filter(d => CRITERIA_SET.dims[d].release_effect === 'block_candidatura');
      if (blockingViolations.length && authorized.some(c => CANDIDATURA_CONNECTORS.includes(c))) {
        authorized = authorized.filter(c => !CANDIDATURA_CONNECTORS.includes(c));
        reasons.push('candidatura bloccata finche questi criteri non superano la soglia minima: ' + blockingViolations.join(', '));
      }
      const blocked = CONNECTORS.filter(c => !authorized.includes(c));
      return {
        version: 'mirage-phase3',
        criteria_version: CRITERIA_SET.version,
        gate_profile: GATE_PROFILE,
        state,
        reasons,
        synthetic_score: synthetic,
        synthetic_per_model: perModel,
        masked_consensus: masked,
        masked_dimensions: masked ? maskedDims : [],
        divergence_per_dim: divergence,
        hard_constraint_violations: hardViolations,
        hard_constraints_undecidable: hardUndecidable,
        average_hides_hard_constraint: averageHidesHard,
        authorized_connectors: authorized,
        blocked_connectors: blocked,
        gate_transition_record: {
          previous_gate_state: 'INIT',
          new_gate_state: state,
          trigger_conditions: reasons,
          threshold_profile_id: cross.threshold_profile ? cross.threshold_profile.id : null,
          gate_profile_id: GATE_PROFILE.id,
          idcm: cross.idcm,
          masked_consensus: masked,
          authorized_connectors: authorized,
          blocked_connectors: blocked,
          payload_hash: extra.payload_hash || null,
          timestamp: new Date().toISOString()
        }
      };
    }

    // ══════════════════════════════════════════════════════════
    //  MIRAGE — Fase 4: Conflict Execution Payload e Selective Routing
    //  (descrizione v7.7-bis, sez. 7 e 8)
    // ══════════════════════════════════════════════════════════
    const crypto = require('crypto');
    const sha256 = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
    // serializzazione canonica: chiavi ordinate, per hash deterministici
    const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
      : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
      : JSON.stringify(v);
    const BORDERLINE_BAND = 0.10; // un vincolo rigido e "a rischio" se il punteggio e entro ±0,10 dalla soglia

    const RECHECK_TEMPLATE = CLAUDE_PREFIX +
      'Sei un valutatore indipendente di seconda istanza su bandi Invitalia ON e Smart&Start. ' +
      'Valuta il progetto SOLO sulle dimensioni elencate in AMBITO e su nessun\'altra. ' +
      'Non hai accesso a valutazioni precedenti: esprimi un giudizio autonomo.\n\n' +
      'DEFINIZIONI: requisiti = ammissibilita formale; innovazione = grado di novita e difendibilita; mercato = domanda, concorrenza, modello di ricavo; ' +
      'team = competenze e completezza; numeri = solidita economico-finanziaria; impatti = occupazione, territorio, inclusione.\n\n' +
      'REGOLA SUI NUMERI: i dati finanziari di dettaglio (runway, capex e opex per voce, cash-burn, costi API, scenari di break-even) NON sono raccolti in questa fase: ' +
      'la loro assenza NON riduce il punteggio. Valuta invece, in entrambe le direzioni, i dati dichiarati: rapporto tra capitale proprio e investimento, ' +
      'garanzie e fideiussioni, coinvestitori, trazione (LOI, ricavi), coerenza del modello di ricavo. Un dato dichiarato debole va penalizzato anche se gli altri sono buoni.\n\n' +
      'AMBITO: {{SCOPE}}\n\nPROGETTO:\n{{PROJECT}}\n\n' +
      'Rispondi SOLO con JSON valido, nessun testo prima o dopo. Lo schema indica solo il formato: ogni <intero 0-100> va sostituito con il tuo punteggio.\n{{SCHEMA}}';

    function buildRecheckPrompt(scope, project) {
      const schema = '{"dimensioni":{' + scope.map(d => '"' + d + '":<intero 0-100>').join(',') + '},"motivazione":"<una frase per dimensione>"}';
      return RECHECK_TEMPLATE.replace('{{SCOPE}}', scope.join(', ')).replace('{{PROJECT}}', project).replace('{{SCHEMA}}', schema);
    }

    // Decide ambito e intensita del secondo stadio a partire dal solo primo stadio
    function routeFromStage1(m1) {
      const merit = (m1.agent_vectors || []).slice(0, AAA_INDEX).filter(Boolean);
      const meritMean = merit.length ? MIRAGE_DIMS.map((_, j) => _mean(_col(merit, j))) : null;
      const why = {};
      const add = (d, r) => { (why[d] = why[d] || []).push(r); };
      (m1.conflict_dimensions || []).forEach(d => add(d, 'divergenza tra agenti di merito (IDP ' + m1.idp_per_dim[d] + ')'));
      ((m1.aaa && m1.aaa.targeted_objections) || []).forEach(d => add(d, 'obiezione mirata del Devil\'s Advocate'));
      const borderline = [];
      if (meritMean) MIRAGE_DIMS.forEach((d, j) => {
        const c = CRITERIA_SET.dims[d];
        if (c.hard_constraint_flag && Math.abs(meritMean[j] - c.min_score) <= BORDERLINE_BAND) { borderline.push(d); add(d, 'vincolo rigido a rischio (' + Math.round(meritMean[j] * 100) + ' vs soglia ' + Math.round(c.min_score * 100) + ')'); }
      });
      // Esito gia determinato: un vincolo rigido e nettamente sotto soglia e gli agenti di merito concordano.
      // Le obiezioni del Devil's Advocate spingono solo verso il basso: non possono cambiare un blocco gia certo,
      // quindi le dimensioni segnalate soltanto dall'AAA non giustificano un secondo stadio.
      const conflicts1 = m1.conflict_dimensions || [];
      const hardFail = meritMean ? MIRAGE_DIMS.filter((d, j) => {
        const c = CRITERIA_SET.dims[d];
        return c.hard_constraint_flag && meritMean[j] < c.min_score - BORDERLINE_BAND && !conflicts1.includes(d);
      }) : [];
      const skippedAAA = [];
      if (hardFail.length) Object.keys(why).forEach(d => {
        if (why[d].every(r => r.startsWith('obiezione mirata'))) { skippedAAA.push(d); delete why[d]; }
      });
      const scope = MIRAGE_DIMS.filter(d => why[d]);
      const anomalies = (m1.anomaly_flags || []).length;
      const critical = MIRAGE_DIMS.some(d => m1.idp_per_dim && m1.idp_per_dim[d] >= THRESHOLD_PROFILE.critical);
      const synth1 = meritMean ? weightedScore(meritMean) : 0;
      // consenso apparente potenziale: esito accettabile ma divergenza forte tra agenti di merito su dimensione pesante
      const potentialMasked = synth1 >= GATE_PROFILE.acceptance_threshold && MIRAGE_DIMS.some(d =>
        CRITERIA_SET.dims[d].weight >= GATE_PROFILE.weight_min && m1.idp_per_dim && m1.idp_per_dim[d] >= GATE_PROFILE.dim_divergence_threshold);
      let mode, models;
      if (!merit.length || merit.length < 2) { mode = 'impossibile'; models = []; }
      else if (!scope.length && !anomalies) { mode = 'nessuno'; models = []; }
      else if (borderline.length || critical || potentialMasked || anomalies) { mode = 'rafforzato'; models = ['claude', 'gpt', 'grok']; }
      else { mode = 'limitato'; models = ['gpt', 'grok']; }
      // con anomalie ma senza dimensioni in conflitto, si ricontrollano tutte le dimensioni rigide
      const finalScope = (mode === 'rafforzato' && !scope.length) ? MIRAGE_DIMS.filter(d => CRITERIA_SET.dims[d].hard_constraint_flag) : scope;
      return { mode, models, scope: finalScope, reasons_per_dim: why, merit_mean: meritMean, anomalies, borderline,
        outcome_determined_by: hardFail, aaa_objections_not_rechecked: skippedAAA };
    }

    function buildPayload(executionId, inputHash, route, m1, templateHash = sha256(RECHECK_TEMPLATE)) {
      const forbidden = MIRAGE_DIMS.filter(d => !route.scope.includes(d));
      const body = {
        execution_id: executionId,
        input_hash: inputHash,
        criteria_version: CRITERIA_SET.version,
        criteria_hash: sha256(canon(CRITERIA_SET)),
        conflict_dimension_ids: route.scope,
        conflict_mask: MIRAGE_DIMS.map(d => route.scope.includes(d) ? 1 : 0).join(''),
        forbidden_dimensions: forbidden,
        authorized_execution_scope: { dimensions: route.scope, models: route.models, connectors_on_release: CONNECTORS },
        IDP_vector: m1.idp_per_dim || null,
        agent_contribution_matrix: (m1.aaa && m1.aaa.gap_per_dim) ? { aaa_gap_per_dim: m1.aaa.gap_per_dim } : null,
        required_recheck_mode: route.mode,
        threshold_profile_id: THRESHOLD_PROFILE.id,
        gate_profile_id: GATE_PROFILE.id,
        output_destination_class: 'report_cliente',
        prompt_template_hash: templateHash
      };
      return Object.assign({}, body, { payload_hash: sha256(canon(body)) });
    }

    // Il validatore ricalcola tutto: un payload alterato non autorizza il secondo stadio
    function validatePayload(pl, inputHash, expectedTemplateHash = sha256(RECHECK_TEMPLATE)) {
      const errors = [];
      const { payload_hash, ...body } = pl;
      if (sha256(canon(body)) !== payload_hash) errors.push('payload_hash non coincide (payload alterato)');
      if (pl.input_hash !== inputHash) errors.push('input_hash non coincide con l\'input corrente');
      if (pl.criteria_hash !== sha256(canon(CRITERIA_SET))) errors.push('criteria_hash non coincide con il set criteri corrente');
      if (pl.prompt_template_hash !== expectedTemplateHash) errors.push('prompt_template_hash non coincide');
      const scope = pl.conflict_dimension_ids || [];
      if (scope.some(d => !MIRAGE_DIMS.includes(d))) errors.push('dimensioni non previste dal set criteri');
      if (scope.some(d => (pl.forbidden_dimensions || []).includes(d))) errors.push('dimensioni contemporaneamente autorizzate e vietate');
      return { valid: errors.length === 0, errors };
    }

    // Secondo stadio limitato all'ambito del payload; dimensioni fuori ambito ignorate e segnalate
    async function runStage2(pl, project) {
      const scope = pl.conflict_dimension_ids;
      const prompt = buildRecheckPrompt(scope, project);
      const out = {};
      await Promise.all(pl.authorized_execution_scope.models.map(async (name, k) => {
        await delay(k * 400);
        let r = null;
        if (name === 'claude') {
          const WAITS = [0, 4000, 10000];
          for (let a = 0; a < WAITS.length && !r; a++) { if (WAITS[a]) await delay(WAITS[a]); r = await callClaude(prompt, 'R', { raw: true, model: MODEL_AAA, schema: 'recheck' }); }
        } else {
          r = await callChatRetry(name, prompt, 'R', { raw: true, schema: 'recheck' });
        }
        const flags = [];
        let vector = null;
        if (r && r.dimensioni && typeof r.dimensioni === 'object') {
          const extra = Object.keys(r.dimensioni).filter(d => !scope.includes(d));
          if (extra.length) flags.push({ type: 'SCOPE_VIOLATION', detail: 'dimensioni fuori ambito ignorate: ' + extra.join(', ') });
          const vals = scope.map(d => Number(r.dimensioni[d]));
          if (vals.every(v => isFinite(v))) vector = vals.map(v => Math.max(0, Math.min(1, v / 100)));
          else flags.push({ type: 'SCOPE_INCOMPLETE', detail: 'mancano punteggi su dimensioni dell\'ambito' });
        } else if (r) flags.push({ type: 'SCHEMA_ERROR', detail: 'risposta senza campo dimensioni' });
        out[name] = { vector, flags, motivazione: r && r.motivazione ? (typeof r.motivazione === 'object' ? Object.entries(r.motivazione).map(([k, v]) => k + ': ' + v).join(' | ') : String(r.motivazione)).substring(0, 600) : null, prompt_hash: sha256(prompt) };
      }));
      return { scope, prompt_hash: sha256(prompt), results: out };
    }

    function crossFromStage2(st2, route, panels) {
      const scope = st2.scope, N = scope.length;
      const models = Object.keys(st2.results).map(name => Object.assign({ name }, MODEL_META[name] || {}, { scope_vector: st2.results[name].vector, prompt_template_hash: st2.results[name].prompt_hash, available: !!st2.results[name].vector }));
      const usable = models.filter(m => m.available);
      const issues = [];
      for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++)
        if (models[a].provider === models[b].provider && models[a].family === models[b].family) issues.push(`${models[a].name} e ${models[b].name}: stesso provider e famiglia`);
      if (new Set(models.map(m => m.prompt_template_hash)).size > 1) issues.push('prompt di rivalutazione diversi tra i modelli');
      const dimDiv = {}; MIRAGE_DIMS.forEach(d => dimDiv[d] = 0);
      let idcmVal = null, dist = {}, scopeMean = null;
      if (usable.length >= 2) {
        const V = usable.map(m => m.scope_vector);
        scopeMean = scope.map((_, j) => _mean(_col(V, j)));
        usable.forEach((m, k) => { let s2 = 0; for (let j = 0; j < N; j++) { const d = V[k][j] - scopeMean[j]; s2 += d * d; } dist[m.name] = +(Math.sqrt(s2) / Math.sqrt(N)).toFixed(4); });
        idcmVal = +_mean(Object.values(dist)).toFixed(4);
        scope.forEach((d, j) => { dimDiv[d] = +_std(_col(V, j)).toFixed(4); });
      }
      // vettore completo: primo stadio, con le dimensioni in ambito sostituite dalla media del secondo stadio
      const vFull = route.merit_mean ? route.merit_mean.slice() : null;
      if (vFull && scopeMean) scope.forEach((d, j) => { vFull[MIRAGE_DIMS.indexOf(d)] = scopeMean[j]; });
      return {
        threshold_profile: THRESHOLD_PROFILE,
        stage2_skipped: false,
        models: [{ name: 'claude', vector: vFull }],
        stage2_models: models,
        models_used: usable.length,
        independence: { ok: issues.length === 0, issues },
        idcm: idcmVal,
        model_distances: dist,
        dim_divergence: dimDiv,
        conflict_dimensions: scope.filter(d => dimDiv[d] >= THRESHOLD_PROFILE.warn),
        v_mean: vFull ? vFull.map(x => +x.toFixed(4)) : null
      };
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
    async function runChatPanel(provider, promptList, opts = {}) {
      return Promise.all(promptList.map(async (p, i) => {
        await delay(i * 500);
        return (await callChatRetry(provider, p, i, opts)) || fallback();
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
      // Stesse identiche istruzioni per i tre modelli: l'IDCM deve misurare i modelli, non le differenze di prompt.
      // Claude riceve CLAUDE_PREFIX + prompt (callClaude); GPT e Grok ricevono lo stesso testo, senza istruzioni di sistema proprie.
      const sharedPrompts = panelPrompts.map(p => CLAUDE_PREFIX + p);
      const [claudeRes, gptRes, grokRes] = await Promise.all([
        runClaudePanel(panelPrompts),
        runChatPanel('gpt', sharedPrompts, { raw: true }),
        runChatPanel('grok', sharedPrompts, { raw: true })
      ]);
      const sha = (t) => require('crypto').createHash('sha256').update(t, 'utf8').digest('hex');
      const promptHashes = {
        claude: sha(panelPrompts.map(p => CLAUDE_PREFIX + p).join('\u241E')),
        gpt:    sha(sharedPrompts.join('\u241E')),
        grok:   sha(sharedPrompts.join('\u241E'))
      };
      const panels = {
        claude: { results: claudeRes, mirage: mirageBlock(claudeRes) },
        gpt:    { results: gptRes,    mirage: mirageBlock(gptRes) },
        grok:   { results: grokRes,   mirage: mirageBlock(grokRes) }
      };
      const idcm = computeCrossModel(panels, promptHashes);
      const gate = computeGate(panels, idcm);
      return res.status(200).json({
        mode: 'mirage',
        panels,
        idcm,
        gate,
        errors: { claude: agentErrors, gpt: providerErrors.gpt, grok: providerErrors.grok }
      });
    }

    // ── MIRAGE FASE 4: primo stadio → payload validato → secondo stadio selettivo → gate ──
    // Decisione deterministica a partire dagli output registrati: usata dal flusso live e dal Replay Verifier.
    function decideFromStage2(panels, route, payload, validation, stage2) {
      let cross;
      if (!stage2) {
        const vm = route.merit_mean ? route.merit_mean.map(x => +x.toFixed(4)) : null;
        cross = { threshold_profile: THRESHOLD_PROFILE, stage2_skipped: true, models: [{ name: 'claude', vector: route.merit_mean }], models_used: 1, idcm: null, dim_divergence: {}, conflict_dimensions: [], v_mean: vm, independence: { ok: true, issues: [] } };
      } else {
        cross = crossFromStage2(stage2, route, panels);
      }
      const scopeViolations = stage2 ? Object.entries(stage2.results).flatMap(([k, v]) => (v.flags || []).filter(f => f.type === 'SCOPE_VIOLATION').map(f => k + ': ' + f.detail)) : [];
      const gate = computeGate(panels, cross, {
        scope_violations: scopeViolations,
        payload_hash: payload.payload_hash,
        payload_valid: route.mode === 'impossibile' ? false : validation.valid,
        payload_errors: route.mode === 'impossibile' ? ['primo stadio con meno di 2 agenti di merito validi'] : validation.errors
      });
      return { cross, gate };
    }

    // ══════════════════════════════════════════════════════════
    //  MIRAGE — Fase 5: audit trail append-only con hash a catena e Replay Verifier
    //  (descrizione v7.7-bis: registrazione verificabile della decisione di rilascio)
    //  Archivio: Upstash Redis via REST (variabili KV_REST_API_URL/TOKEN o UPSTASH_REDIS_REST_URL/TOKEN).
    //  Append-only: ogni record e scritto con SET NX su una chiave numerata, mai sovrascritto.
    // ══════════════════════════════════════════════════════════
    const AUDIT_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const AUDIT_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    const AUDIT_PREFIX = 'mirage:audit:';
    // Versione della logica decisionale (routing + gate). Va aumentata a ogni modifica delle regole:
    // il Replay Verifier confronta le decisioni solo tra record e codice con la stessa logica.
    const DECISION_LOGIC_VERSION = 'mirage-decision-5.1';
    const GENESIS_HASH = '0'.repeat(64);
    async function redis(cmd) {
      const r = await fetch(AUDIT_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + AUDIT_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
      const d = await r.json();
      if (d.error) throw new Error('archivio: ' + d.error);
      return d.result;
    }
    const plain = (o) => JSON.parse(JSON.stringify(o)); // forma stabile prima dell'hash (niente undefined)
    const recordHash = (rec) => { const { record_hash, ...body } = rec; return sha256(canon(body)); };
    const minimalAgent = (r) => r ? { scoreON: r.scoreON, scoreSS: r.scoreSS, dimensioni: r.dimensioni || null, _fallback: !!r._fallback } : null;

    function buildAuditBody(ctx) {
      return plain({
        record_type: 'mirage_release_decision',
        execution_id: ctx.executionId,
        created_at: new Date().toISOString(),
        code_version: process.env.VERCEL_GIT_COMMIT_SHA || 'locale',
        decision_logic_version: DECISION_LOGIC_VERSION,
        criteria_version: CRITERIA_SET.version,
        criteria_hash: sha256(canon(CRITERIA_SET)),
        prompt_template_hash: sha256(RECHECK_TEMPLATE),
        threshold_profile: THRESHOLD_PROFILE,
        gate_profile: GATE_PROFILE,
        input_hash: ctx.inputHash,
        stage1: ctx.stage1.slice(0, AAA_INDEX + 1).map(minimalAgent),
        routing: { mode: ctx.route.mode, models: ctx.route.models, scope: ctx.route.scope },
        payload: ctx.payload,
        payload_validation: ctx.validation,
        stage2: ctx.stage2 ? { scope: ctx.stage2.scope, prompt_hash: ctx.stage2.prompt_hash, results: ctx.stage2.results } : null,
        decision: gateSummary(ctx.gate),
        test_flags: ctx.testFlags || {}
      });
    }
    function gateSummary(g) {
      return plain({ state: g.state, synthetic_score: g.synthetic_score, authorized_connectors: g.authorized_connectors, blocked_connectors: g.blocked_connectors,
        hard_constraint_violations: g.hard_constraint_violations, masked_consensus: g.masked_consensus, reasons: g.reasons });
    }

    async function auditAppend(body) {
      if (!AUDIT_URL || !AUDIT_TOKEN) return { persisted: false, reason: 'archivio non configurato (manca Upstash Redis nel progetto Vercel)', record_hash: recordHash(Object.assign({ seq: null, previous_record_hash: null }, body)) };
      for (let attempt = 0; attempt < 5; attempt++) {
        const head = JSON.parse((await redis(['GET', AUDIT_PREFIX + 'head'])) || 'null') || { seq: 0, hash: GENESIS_HASH };
        let seq = head.seq, prev = head.hash;
        // la testa e solo un indice: si avanza finche esistono record successivi
        for (;;) { const nx = await redis(['GET', AUDIT_PREFIX + 'rec:' + (seq + 1)]); if (!nx) break; seq++; prev = JSON.parse(nx).record_hash; }
        const rec = Object.assign({ seq: seq + 1, previous_record_hash: prev }, body);
        rec.record_hash = recordHash(rec);
        const ok = await redis(['SET', AUDIT_PREFIX + 'rec:' + rec.seq, JSON.stringify(rec), 'NX']);
        if (ok === 'OK') {
          await redis(['SET', AUDIT_PREFIX + 'head', JSON.stringify({ seq: rec.seq, hash: rec.record_hash })]);
          await redis(['SET', AUDIT_PREFIX + 'exec:' + rec.execution_id, String(rec.seq), 'NX']);
          return { persisted: true, seq: rec.seq, record_hash: rec.record_hash, previous_record_hash: prev };
        }
        await delay(150 + attempt * 150); // un'altra esecuzione ha preso lo stesso numero: si riprova
      }
      return { persisted: false, reason: 'conflitto di scrittura ripetuto' };
    }

    // Replay Verifier: ricalcola la decisione dagli output registrati, senza richiamare i modelli
    function replayRecord(rec) {
      const checks = [];
      const push = (name, ok, detail, informative) => checks.push({ name, ok, detail: detail || null, informative: !!informative });
      push('integrita record (record_hash)', recordHash(rec) === rec.record_hash);
      const criteriaSame = rec.criteria_hash === sha256(canon(CRITERIA_SET));
      push('set criteri invariato dalla registrazione', criteriaSame, criteriaSame ? null : 'criteri registrati ' + rec.criteria_version + ', correnti ' + CRITERIA_SET.version + ': il ricalcolo usa i correnti', true);
      // Il payload si valida contro il template in vigore alla registrazione, non contro quello attuale.
      // Record precedenti alla 5.1 non lo riportano: si usa quello dichiarato nel payload (integro grazie al payload_hash).
      const tplHash = rec.prompt_template_hash || rec.payload.prompt_template_hash;
      const tplSame = tplHash === sha256(RECHECK_TEMPLATE);
      push('template di rivalutazione invariato dalla registrazione', tplSame, tplSame ? null : 'il prompt di rivalutazione e cambiato dopo la registrazione: la validazione usa il template registrato', true);
      const logicSame = rec.decision_logic_version === DECISION_LOGIC_VERSION;
      push('logica decisionale invariata dalla registrazione', logicSame, logicSame ? null : 'registrata ' + (rec.decision_logic_version || 'precedente alla 5.1') + ', attuale ' + DECISION_LOGIC_VERSION + ': il confronto della decisione e solo indicativo; l\'integrita resta garantita dal record_hash', true);
      const stage1 = rec.stage1.map(a => a || { _fallback: true });
      const m1 = mirageBlock(stage1);
      const panels = { claude: { results: stage1, mirage: m1 } };
      const route = routeFromStage1(m1);
      push('routing riprodotto', route.mode === rec.routing.mode && canon(route.scope) === canon(rec.routing.scope),
        'registrato ' + rec.routing.mode + ' [' + rec.routing.scope.join(', ') + '], ricalcolato ' + route.mode + ' [' + route.scope.join(', ') + ']', !logicSame);
      const expected = buildPayload(rec.execution_id, rec.input_hash, route, m1, tplHash);
      const payloadIsOriginal = expected.payload_hash === rec.payload.payload_hash;
      const validation = validatePayload(rec.payload, rec.input_hash, tplHash);
      push('validazione del payload riprodotta', validation.valid === rec.payload_validation.valid,
        payloadIsOriginal ? 'payload registrato = payload ricostruito dal primo stadio' : 'payload registrato diverso da quello ricostruito: ' + (validation.errors.join('; ') || 'nessun errore'), !logicSame);
      const { gate } = decideFromStage2(panels, route, rec.payload, validation, rec.stage2);
      const now = gateSummary(gate);
      push('stato del gate riprodotto', now.state === rec.decision.state, 'registrato ' + rec.decision.state + ', ricalcolato ' + now.state, !logicSame);
      push('connettori riprodotti', canon(now.authorized_connectors) === canon(rec.decision.authorized_connectors), 'ricalcolati: ' + (now.authorized_connectors.join(', ') || 'nessuno'), !logicSame);
      push('score sintetico riprodotto', now.synthetic_score === rec.decision.synthetic_score, 'registrato ' + rec.decision.synthetic_score + ', ricalcolato ' + now.synthetic_score, !logicSame);
      return { seq: rec.seq, execution_id: rec.execution_id, reproduced: checks.every(c => c.ok || c.informative), drift: checks.filter(c => c.informative && !c.ok).map(c => c.name), checks, recomputed_decision: now };
    }

    if (requestedAI === 'mirage-audit') {
      if (!AUDIT_URL || !AUDIT_TOKEN) return res.status(200).json({ configured: false, reason: 'archivio non configurato (manca Upstash Redis nel progetto Vercel)' });
      const head = JSON.parse((await redis(['GET', AUDIT_PREFIX + 'head'])) || 'null') || { seq: 0, hash: GENESIS_HASH };
      const action = req.body.action || 'chain';
      const corrupt = Number(req.body.simulate_corruption) || 0; // solo test: altera in memoria, l'archivio non viene toccato
      async function load(seq) {
        const raw = await redis(['GET', AUDIT_PREFIX + 'rec:' + seq]);
        if (!raw) return null;
        const rec = JSON.parse(raw);
        if (seq === corrupt) rec.decision.state = rec.decision.state === 'STABLE_OUTPUT' ? 'ANNOTATED_OUTPUT' : 'STABLE_OUTPUT';
        return rec;
      }
      if (action === 'chain') {
        const limit = Math.min(Number(req.body.limit) || 50, 200);
        const from = Math.max(1, head.seq - limit + 1);
        let prev = from === 1 ? GENESIS_HASH : null;
        if (from > 1) { const p = await load(from - 1); prev = p ? p.record_hash : null; }
        const rows = []; let firstBreak = null;
        for (let s = from; s <= head.seq; s++) {
          const rec = await load(s);
          if (!rec) { rows.push({ seq: s, missing: true }); if (!firstBreak) firstBreak = s; continue; }
          const hashOk = recordHash(rec) === rec.record_hash;
          const linkOk = prev === null || rec.previous_record_hash === prev;
          if ((!hashOk || !linkOk) && !firstBreak) firstBreak = s;
          rows.push({ seq: s, execution_id: rec.execution_id, created_at: rec.created_at, state: rec.decision.state, routing: rec.routing.mode, tamper_test: !!(rec.test_flags && rec.test_flags.simulate_tamper), hash_ok: hashOk, link_ok: linkOk, record_hash: rec.record_hash });
          prev = rec.record_hash;
        }
        return res.status(200).json({ configured: true, head, chain_ok: !firstBreak, first_break: firstBreak, records: rows });
      }
      if (action === 'replay') {
        let seq = Number(req.body.seq) || 0;
        if (!seq && req.body.execution_id) seq = Number(await redis(['GET', AUDIT_PREFIX + 'exec:' + req.body.execution_id])) || 0;
        if (!seq) seq = head.seq;
        const rec = await load(seq);
        if (!rec) return res.status(404).json({ error: 'record ' + seq + ' non trovato' });
        return res.status(200).json({ configured: true, replay: replayRecord(rec) });
      }
      return res.status(400).json({ error: 'azione non prevista: ' + action });
    }

    if (requestedAI === 'mirage-routed') {
      const panelPrompts = prompts.slice(0, AAA_INDEX + 1);
      const project = String(req.body.project || panelPrompts[0] || '');
      const inputHash = sha256(project);
      const executionId = crypto.randomUUID();
      const stage1 = await runClaudePanel(panelPrompts);
      const m1 = mirageBlock(stage1);
      const panels = { claude: { results: stage1, mirage: m1 } };
      const route = routeFromStage1(m1);
      let payload = buildPayload(executionId, inputHash, route, m1);
      if (req.body.simulate_tamper) payload = Object.assign({}, payload, { conflict_dimension_ids: MIRAGE_DIMS.slice(), forbidden_dimensions: [] }); // solo test
      const validation = validatePayload(payload, inputHash);
      const calls = { stage1: panelPrompts.length, stage2: 0, full_mode: panelPrompts.length * 3 };
      let stage2 = null;
      if (validation.valid && route.mode !== 'impossibile' && route.mode !== 'nessuno') {
        stage2 = await runStage2(payload, project);
        calls.stage2 = payload.authorized_execution_scope.models.length;
      }
      const { cross, gate } = decideFromStage2(panels, route, payload, validation, stage2);
      calls.total = calls.stage1 + calls.stage2;
      calls.saved_vs_full = calls.full_mode - calls.total;
      let audit;
      try {
        audit = await auditAppend(buildAuditBody({ executionId, inputHash, stage1, route, payload, validation, stage2, gate, testFlags: { simulate_tamper: !!req.body.simulate_tamper } }));
      } catch (e) { audit = { persisted: false, reason: e.message }; }
      return res.status(200).json({
        mode: 'mirage-routed', execution_id: executionId,
        stage1: { results: stage1, mirage: m1 },
        routing: { mode: route.mode, models: route.models, scope: route.scope, reasons_per_dim: route.reasons_per_dim, borderline: route.borderline, outcome_determined_by: route.outcome_determined_by, aaa_objections_not_rechecked: route.aaa_objections_not_rechecked },
        payload, payload_validation: validation,
        stage2, cross, gate, calls, audit,
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
