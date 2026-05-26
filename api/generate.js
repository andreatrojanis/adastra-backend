module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { sectionId, prompt, ai } = req.body;
    const provider = ai || 'claude'; // claude | gpt | grok

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_KEY    = process.env.OPENAI_API_KEY;
    const GROK_KEY      = process.env.GROK_API_KEY;

    if (!prompt) return res.status(400).json({ error: 'Prompt mancante' });
    if (!sectionId) return res.status(400).json({ error: 'sectionId mancante' });
    if (provider === 'claude' && !ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mancante' });
    if (provider === 'gpt'    && !OPENAI_KEY)    return res.status(500).json({ error: 'OPENAI_API_KEY mancante' });
    if (provider === 'grok'   && !GROK_KEY)      return res.status(500).json({ error: 'GROK_API_KEY mancante' });

    const SYSTEM = `Sei un consulente senior specializzato in finanza agevolata italiana, con 15 anni di esperienza nella redazione di dossier per Invitalia Smart&Start.
Rispondi SEMPRE e SOLO con JSON valido. Nessun testo prima o dopo. Nessun markdown. Nessun backtick.
I contenuti devono essere specifici, concreti, verificabili. Evita genericità, buzzword e tono da pitch VC.
Usa linguaggio professionale, operativo, leggibile da istruttori non tecnici.`;

    // Prompt specifici per ogni sezione con struttura JSON precisa
    const PROMPTS = {

executive: (ctx) => `Genera il JSON per l'Executive Summary del dossier Smart&Start del progetto descritto di seguito.
${ctx}

Struttura JSON richiesta (rispetta ESATTAMENTE questi campi):
{
  "kpi": [
    {"value": "€ 900K", "label": "Investimento totale", "sub": "Smart&Start Sud"},
    {"value": "TRL 6", "label": "Prototipo validato", "sub": "Casi reali"},
    {"value": "10 LOI", "label": "Lettere di intento", "sub": "Firmate"},
    {"value": "12-24m", "label": "Break-even atteso", "sub": "Mesi"}
  ],
  "problema": "Testo 3-4 righe: problema di mercato specifico con dati numerici",
  "soluzione_bullets": ["bullet 1 concreto", "bullet 2", "bullet 3", "bullet 4"],
  "vantaggio_competitivo": "1-2 righe: differenziazione vs competitor esistenti",
  "mercato_kpi": [
    {"value": "€ XXM", "label": "TAM", "sub": "descrizione"},
    {"value": "€ XXM", "label": "SAM", "sub": "descrizione"},
    {"value": "€ XXM", "label": "SOM anno 3", "sub": "descrizione"},
    {"value": "XX%", "label": "CAGR settore", "sub": "fonte"}
  ],
  "business_model_rows": [
    ["Piano", "Prezzo", "Target", "Include"],
    ["nome piano", "prezzo", "target cliente", "cosa include"]
  ],
  "kpi_triennio": [
    ["KPI", "Anno 1", "Anno 2", "Anno 3"],
    ["Clienti attivi", "xx", "xx", "xx"],
    ["Ricavi (ARR)", "€ xxK", "€ xxK", "€ xxK"],
    ["Margine lordo", "xx%", "xx%", "xx%"],
    ["Team (FTE)", "x", "x", "x"],
    ["EBITDA", "- € xxK", "- € xxK", "- € xxK"]
  ],
  "fabbisogno_kpi": [
    {"value": "€ XXK", "label": "Prestito Smart&Start", "sub": "Tasso 0%, 10 anni"},
    {"value": "€ XXK", "label": "Fondo perduto", "sub": "Premialità Sud"},
    {"value": "€ XXK", "label": "Capitale proprio", "sub": "Soci fondatori"},
    {"value": "XX%", "label": "Copertura pubblica", "sub": "Del totale"}
  ],
  "perche_smartstart": "2-3 righe: requisiti specifici soddisfatti con riferimenti normativi"
}`,

vpc: (ctx) => `Genera il JSON per il Value Proposition Canvas del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "cliente_tabella": [
    ["Dimensione", "Dettaglio"],
    ["Chi è", "descrizione specifica del cliente target"],
    ["Cosa fa (quotidiano)", "attività operative quotidiane concrete"],
    ["Difficoltà", "barriere e frustrazioni specifiche con numeri"],
    ["Vantaggi attesi", "benefici concreti e misurabili"]
  ],
  "proposta_tabella": [
    ["Pilastro", "Meccanismo", "Beneficio misurabile"],
    ["nome pilastro 1", "come funziona tecnicamente", "risultato quantificato"],
    ["nome pilastro 2", "come funziona tecnicamente", "risultato quantificato"],
    ["nome pilastro 3", "come funziona tecnicamente", "risultato quantificato"],
    ["nome pilastro 4", "come funziona tecnicamente", "risultato quantificato"],
    ["nome pilastro 5", "come funziona tecnicamente", "risultato quantificato"]
  ]
}`,

bmc: (ctx) => `Genera il JSON per il Business Model Canvas del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "canvas_tabella": [
    ["Blocco", "Contenuto"],
    ["Segmenti di clientela", "descrizione specifica e dimensioni"],
    ["Proposta di valore", "cosa offre di unico e differenziante"],
    ["Canali", "canali di acquisizione e distribuzione dettagliati"],
    ["Relazioni con i clienti", "tipo relazione per segmento"],
    ["Flussi di ricavi", "tutte le fonti con pricing dettagliato"],
    ["Risorse chiave", "risorse fisiche, intellettuali, umane critiche"],
    ["Attività chiave", "attività core che creano valore"],
    ["Partner chiave", "fornitori e partner strategici specifici"],
    ["Struttura dei costi", "voci principali con percentuali"]
  ],
  "metriche_kpi": [
    {"value": "x.xx", "label": "LTV/CAC target", "sub": "Anno 2"},
    {"value": "< x%", "label": "Churn mensile", "sub": "Anno 1-2"},
    {"value": "€ xxx", "label": "CAC blended", "sub": "Digitale + partnership"},
    {"value": "€ x.xxx", "label": "LTV medio", "sub": "xx mesi utilizzo"}
  ]
}`,

mercato: (ctx) => `Genera il JSON per l'Analisi di Mercato del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "tam_sam_som": [
    ["Segmento", "Definizione", "Dimensione", "Valore"],
    ["TAM", "definizione", "xxx K/anno", "€ xxxM"],
    ["SAM", "definizione", "xx K/anno", "€ xxxM"],
    ["SOM anno 1", "definizione", "xxx clienti", "€ xxK"],
    ["SOM anno 3", "definizione", "x.xxx clienti", "€ x.xM"]
  ],
  "trend_bullets": [
    "trend 1 con dato numerico e fonte",
    "trend 2 con dato numerico e fonte",
    "trend 3 con dato numerico e fonte",
    "trend 4 con dato numerico e fonte",
    "trend 5 con dato numerico e fonte"
  ],
  "competitor_tabella": [
    ["Competitor", "Pricing", "Tempi", "Limite vs soluzione"],
    ["nome competitor 1", "€ xx-xx K", "xx gg", "limite principale"],
    ["nome competitor 2", "€ xx-xx K", "xx gg", "limite principale"],
    ["nome competitor 3", "€ xx-xx K", "variabile", "limite principale"],
    ["nome competitor 4", "€ xx/mese", "immediato", "limite principale"],
    ["nome competitor 5", "gratuito", "immediato", "limite principale"]
  ],
  "posizionamento": "2-3 righe: posizionamento competitivo unico e barriere difensive"
}`,

operativo: (ctx) => `Genera il JSON per il Piano Operativo del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "fasi": [
    {
      "nome": "FASE 1",
      "periodo": "Mesi 1-6",
      "attivita": ["attività 1 specifica", "attività 2", "attività 3", "attività 4", "attività 5", "attività 6"],
      "kpi": "KPI target fine fase: metrica1 · metrica2 · metrica3"
    },
    {
      "nome": "FASE 2",
      "periodo": "Mesi 7-12",
      "attivita": ["attività 1 specifica", "attività 2", "attività 3", "attività 4", "attività 5", "attività 6"],
      "kpi": "KPI target fine fase: metrica1 · metrica2 · metrica3"
    },
    {
      "nome": "FASE 3",
      "periodo": "Mesi 13-24",
      "attivita": ["attività 1 specifica", "attività 2", "attività 3", "attività 4", "attività 5", "attività 6"],
      "kpi": "KPI target fine fase: metrica1 · metrica2 · metrica3"
    },
    {
      "nome": "FASE 4",
      "periodo": "Mesi 25-36",
      "attivita": ["attività 1 specifica", "attività 2", "attività 3", "attività 4", "attività 5", "attività 6"],
      "kpi": "KPI target fine fase: metrica1 · metrica2 · metrica3"
    }
  ]
}`,

occupazionale: (ctx) => `Genera il JSON per il Piano Occupazionale del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "fondatore": {
    "nome": "Nome Cognome",
    "ruolo": "CEO",
    "esperienza": "xx anni in settore rilevante",
    "track_record": "risultati concreti documentabili",
    "responsabilita": "aree di responsabilità principali"
  },
  "assunzioni_tabella": [
    ["Profilo", "Fase", "RAL indicativa", "Area"],
    ["profilo 1", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 2", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 3", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 4", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 5", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 6", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 7", "Mese x-x", "€ xx-xxK", "area"],
    ["profilo 8", "Mese x-x", "€ xx-xxK", "area"]
  ],
  "politica": "2 righe: priorità assunzioni (under 36, donne, territorio)"
}`,

innovazione: (ctx) => `Genera il JSON per la sezione Innovazione Tecnologica e IP del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "architettura_tabella": [
    ["Componente", "Tecnologia", "Funzione"],
    ["componente 1", "tecnologia specifica", "funzione"],
    ["componente 2", "tecnologia specifica", "funzione"],
    ["componente 3", "tecnologia specifica", "funzione"],
    ["componente 4", "tecnologia specifica", "funzione"],
    ["componente 5", "tecnologia specifica", "funzione"],
    ["componente 6", "tecnologia specifica", "funzione"],
    ["componente 7", "tecnologia specifica", "funzione"],
    ["componente 8", "tecnologia specifica", "funzione"]
  ],
  "trl_kpi": [
    {"value": "TRL x", "label": "Oggi", "sub": "stato attuale"},
    {"value": "TRL x", "label": "Mese 6", "sub": "milestone"},
    {"value": "TRL x", "label": "Mese 12", "sub": "milestone"},
    {"value": "TRL x", "label": "Mese 18", "sub": "milestone"}
  ],
  "ip_bullets": [
    "elemento IP 1 con dettagli specifici",
    "elemento IP 2",
    "elemento IP 3",
    "elemento IP 4"
  ],
  "rischi_tabella": [
    ["Rischio", "Prob.", "Mitigazione"],
    ["rischio 1", "Alta/Media/Bassa", "piano mitigazione specifico"],
    ["rischio 2", "Alta/Media/Bassa", "piano mitigazione specifico"],
    ["rischio 3", "Alta/Media/Bassa", "piano mitigazione specifico"],
    ["rischio 4", "Alta/Media/Bassa", "piano mitigazione specifico"]
  ]
}`,

impatto: (ctx) => `Genera il JSON per la sezione Impatto Sociale, Ambientale e Territoriale del dossier Smart&Start.
${ctx}

Struttura JSON richiesta:
{
  "kpi_impatto": [
    {"value": "xxx-x.xK", "label": "Imprese assistite", "sub": "Triennio"},
    {"value": "xx-xxx", "label": "Finanziamenti abilitati", "sub": "Nuovi"},
    {"value": "€ xx-xxM", "label": "Capitale catalizzato", "sub": "Pubblico"},
    {"value": "xxx-xxx", "label": "Occupazione indiretta", "sub": "Posti generati"}
  ],
  "dimensioni_tabella": [
    ["Dimensione", "Impatto principale", "KPI anno 3"],
    ["Sociale", "impatto specifico", "kpi misurabile"],
    ["Occupazionale", "impatto specifico", "kpi misurabile"],
    ["Territoriale", "impatto specifico", "kpi misurabile"],
    ["Ambientale", "impatto specifico", "kpi misurabile"],
    ["Digitale", "impatto specifico", "kpi misurabile"]
  ],
  "pnrr_bullets": [
    "Missione 1: allineamento specifico",
    "Missione 5: allineamento specifico",
    "Obiettivo PNRR 1",
    "Obiettivo PNRR 2"
  ],
  "moltiplicatore": "2 righe: effetto moltiplicatore economico e occupazionale con numeri"
}`,

conto_economico: (ctx) => `Genera il JSON per il Conto Economico Previsionale del dossier Smart&Start.
${ctx}

Struttura JSON richiesta (tutti i valori in euro, interi, senza simbolo €):
{
  "anno1": {
    "ricavi_totali": 0,
    "costo_venduto": 0,
    "margine_lordo": 0,
    "costi_personale": 0,
    "costi_marketing": 0,
    "costi_tech": 0,
    "costi_consulenze": 0,
    "costi_amm": 0,
    "altri_costi": 0,
    "costi_operativi_totali": 0,
    "ebitda": 0,
    "ammortamenti": 0,
    "ebit": 0,
    "oneri_finanziari": 0,
    "risultato_ante_imposte": 0,
    "imposte": 0,
    "utile_netto": 0
  },
  "anno2": { "ricavi_totali": 0, "costo_venduto": 0, "margine_lordo": 0, "costi_personale": 0, "costi_marketing": 0, "costi_tech": 0, "costi_consulenze": 0, "costi_amm": 0, "altri_costi": 0, "costi_operativi_totali": 0, "ebitda": 0, "ammortamenti": 0, "ebit": 0, "oneri_finanziari": 0, "risultato_ante_imposte": 0, "imposte": 0, "utile_netto": 0 },
  "anno3": { "ricavi_totali": 0, "costo_venduto": 0, "margine_lordo": 0, "costi_personale": 0, "costi_marketing": 0, "costi_tech": 0, "costi_consulenze": 0, "costi_amm": 0, "altri_costi": 0, "costi_operativi_totali": 0, "ebitda": 0, "ammortamenti": 0, "ebit": 0, "oneri_finanziari": 0, "risultato_ante_imposte": 0, "imposte": 0, "utile_netto": 0 },
  "assunzioni": [
    "assunzione 1 specifica con numeri",
    "assunzione 2",
    "assunzione 3",
    "assunzione 4",
    "assunzione 5",
    "assunzione 6",
    "assunzione 7"
  ]
}`,

fonti_impieghi: (ctx) => `Genera il JSON per il prospetto Fonti e Impieghi del dossier Smart&Start.
${ctx}

Struttura JSON richiesta (importi interi senza simbolo €, totale fonti = totale impieghi):
{
  "impieghi": [
    {"label": "Immobilizzazioni immateriali (xx%)", "desc": "descrizione dettagliata componenti", "importo": 0},
    {"label": "Immobilizzazioni materiali (xx%)", "desc": "descrizione dettagliata componenti", "importo": 0},
    {"label": "Capitale circolante xx mesi (xx%)", "desc": "descrizione dettagliata componenti", "importo": 0}
  ],
  "fonti": [
    {"label": "Finanziamento Smart&Start — prestito tasso 0% (xx%)", "desc": "condizioni specifiche rimborso e premialità", "importo": 0},
    {"label": "Contributo a fondo perduto Smart&Start (xx%)", "desc": "percentuale e condizioni erogazione", "importo": 0},
    {"label": "Capitale proprio soci fondatori (xx%)", "desc": "modalità versamento e motivazione quota", "importo": 0}
  ],
  "totale": 0,
  "nota": "2-3 righe: struttura finanziaria ottimizzata con commento su copertura pubblica e fideiussione"
}`

    };

    const promptFn = PROMPTS[sectionId];
    if (!promptFn) return res.status(400).json({ error: 'sectionId non riconosciuto: ' + sectionId });

    const fullPrompt = promptFn(prompt);

    let text = '';

    if (provider === 'claude') {
      // ── CLAUDE (Anthropic) ──────────────────────────────────
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
          system: SYSTEM,
          messages: [{ role: 'user', content: fullPrompt }]
        })
      });
      if (!r.ok) {
        const errBody = await r.text();
        return res.status(500).json({ error: `Claude API error ${r.status}: ${errBody.substring(0, 200)}` });
      }
      const d = await r.json();
      if (d.error) return res.status(500).json({ error: d.error.message || 'Errore Claude API' });
      text = (d.content || []).map(i => i.text || '').join('').trim();

    } else if (provider === 'gpt') {
      // ── GPT-4o (OpenAI) ─────────────────────────────────────
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 8000,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user',   content: fullPrompt }
          ]
        })
      });
      if (!r.ok) {
        const errBody = await r.text();
        return res.status(500).json({ error: `OpenAI API error ${r.status}: ${errBody.substring(0, 200)}` });
      }
      const d = await r.json();
      if (d.error) return res.status(500).json({ error: d.error.message || 'Errore OpenAI API' });
      text = d.choices?.[0]?.message?.content?.trim() || '';

    } else if (provider === 'grok') {
      // ── GROK 3 (xAI) ────────────────────────────────────────
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROK_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3',
          max_tokens: 8000,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user',   content: fullPrompt }
          ]
        })
      });
      if (!r.ok) {
        const errBody = await r.text();
        return res.status(500).json({ error: `Grok API error ${r.status}: ${errBody.substring(0, 200)}` });
      }
      const d = await r.json();
      if (d.error) return res.status(500).json({ error: d.error.message || 'Errore Grok API' });
      text = d.choices?.[0]?.message?.content?.trim() || '';

    } else {
      return res.status(400).json({ error: `Provider non supportato: ${provider}` });
    }

    if (!text) return res.status(500).json({ error: `Risposta vuota da ${provider}` });

    // Rimuovi backtick e prefissi JSON
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let raw = fence ? fence[1].trim() : text.trim();
    const firstBrace = raw.search(/[{\[]/);
    if (firstBrace > 0) raw = raw.substring(firstBrace);

    try {
      const parsed = JSON.parse(raw);
      return res.status(200).json({ type: 'json', data: parsed });
    } catch (e) {
      // Tenta repair JSON troncato
      try {
        let depth = 0;
        let lastValid = -1;
        const openChar = raw[0];
        const closeChar = openChar === '{' ? '}' : ']';
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] === openChar) depth++;
          else if (raw[i] === closeChar) { depth--; if (depth === 0) { lastValid = i; break; } }
        }
        if (lastValid > 0) {
          const parsed = JSON.parse(raw.substring(0, lastValid + 1));
          return res.status(200).json({ type: 'json', data: parsed });
        }
      } catch (e2) {}
      return res.status(200).json({ type: 'text', data: raw });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
