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

    const SYSTEM = `Sei un consulente senior specializzato in finanza agevolata italiana, con 15 anni di esperienza nella redazione di dossier per il bando ON - Oltre Nuove Imprese a Tasso Zero di Invitalia.
Conosci in dettaglio i criteri di valutazione ON (punteggio max 50, minimo 26 per ammissione), i requisiti di compagine (>50% under 35 o donne), le agevolazioni specifiche (finanziamento 70% + fondo perduto 30%).
Rispondi SEMPRE e SOLO con JSON valido. Nessun testo prima o dopo. Nessun markdown. Nessun backtick.
I contenuti devono essere specifici, concreti, verificabili. Usa linguaggio professionale, operativo, leggibile da istruttori non tecnici Invitalia.`;

    const PROMPTS = {

executive: (ctx) => `Genera il JSON per l'Executive Summary del dossier ON - Oltre Nuove Imprese a Tasso Zero del progetto descritto.
${ctx}

Il bando ON è dedicato a imprese a prevalenza giovanile (under 35) e/o femminile. Punteggio max 50, minimo 26. Focus su: capacità imprenditoriale del team, sostenibilità economica, impatto occupazionale locale, settore e mercato.

Struttura JSON richiesta:
{
  "score_on": 38,
  "verdict": "AMMISSIBILE CON CORREZIONI",
  "decisione": "GO CON OTTIMIZZAZIONI",
  "radar_values": {"compagine": 80, "progetto": 70, "mercato": 65, "piano_economico": 60, "occupazione": 75, "impatto": 68},
  "kpi": [
    {"value": "€ XXK", "label": "Investimento totale", "sub": "Bando ON"},
    {"value": "XX%", "label": "Under 35 / Donne", "sub": "Compagine societaria"},
    {"value": "XX", "label": "Posti di lavoro", "sub": "Previsti a 36 mesi"},
    {"value": "XX-XXm", "label": "Break-even atteso", "sub": "Mesi"}
  ],
  "problema": "3-4 righe: problema di mercato specifico con dati concreti",
  "soluzione_bullets": ["bullet 1 specifico", "bullet 2", "bullet 3", "bullet 4"],
  "vantaggio_competitivo": "1-2 righe: differenziazione vs competitor esistenti",
  "profilo_compagine": "2-3 righe: composizione societaria, profili under 35/donne, competenze chiave rilevanti per ON",
  "mercato_kpi": [
    {"value": "€ XXM", "label": "Mercato target", "sub": "Italia"},
    {"value": "XX%", "label": "Crescita settore", "sub": "CAGR 3 anni"},
    {"value": "XX", "label": "Clienti target anno 1", "sub": "Stima realistica"},
    {"value": "XX%", "label": "Quota mercato anno 3", "sub": "Obiettivo"}
  ],
  "business_model_rows": [
    ["Prodotto/Servizio", "Prezzo", "Target cliente", "Canale"],
    ["nome offerta", "prezzo", "target", "canale"]
  ],
  "kpi_triennio": [
    ["KPI", "Anno 1", "Anno 2", "Anno 3"],
    ["Clienti/Vendite", "xx", "xx", "xx"],
    ["Ricavi", "€ xxK", "€ xxK", "€ xxK"],
    ["Dipendenti", "x", "x", "x"],
    ["EBITDA", "- € xxK", "€ xxK", "€ xxK"]
  ],
  "fabbisogno_kpi": [
    {"value": "€ XXK", "label": "Finanziamento ON 70%", "sub": "Tasso 0%, 8 anni"},
    {"value": "€ XXK", "label": "Fondo perduto 30%", "sub": "Non rimborsabile"},
    {"value": "€ XXK", "label": "Capitale proprio", "sub": "Soci fondatori"},
    {"value": "XXX%", "label": "Copertura pubblica", "sub": "Del totale"}
  ],
  "perche_on": "2-3 righe: requisiti ON specifici soddisfatti — compagine, anzianità, investimento, settore ammesso"
}`,

compagine: (ctx) => `Genera il JSON per la sezione Compagine Societaria del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Questa sezione è CRITICA per ON: la compagine deve avere >50% under 35 e/o donne. È il primo requisito di ammissibilità verificato da Invitalia.

Struttura JSON richiesta:
{
  "requisito_soddisfatto": true,
  "percentuale_agevolabile": 85,
  "tabella_soci": [
    ["Nome/Ruolo", "Età", "Genere", "Quote %", "Agevolabile", "Competenze chiave"],
    ["Socio 1 — ruolo", "xx anni", "M/F", "xx%", "SI/NO", "competenza rilevante"],
    ["Socio 2 — ruolo", "xx anni", "M/F", "xx%", "SI/NO", "competenza rilevante"]
  ],
  "sintesi_compagine": "2-3 righe: descrizione del gruppo proponente, motivazione imprenditoriale, coesione del team",
  "punti_forza_compagine": [
    "punto forza 1 — esperienza specifica rilevante per il progetto",
    "punto forza 2",
    "punto forza 3"
  ],
  "gap_da_colmare": [
    "gap 1 — competenza da acquisire con assunzione o advisor",
    "gap 2 se presente"
  ],
  "advisor_mentor": "descrizione advisor/mentore se presente, oppure 'Da definire — raccomandato per rafforzare credibilità istruttoria'",
  "nota_ammissibilita": "1-2 righe: conferma esplicita requisito compagine >50% under35/donne con calcolo quote"
}`,

progetto: (ctx) => `Genera il JSON per la sezione Descrizione del Progetto del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Per ON la descrizione progetto deve enfatizzare: concretezza operativa, fattibilità tecnica, coerenza tra idea e profilo del team, innovazione relativa al contesto territoriale (non necessariamente tecnologica).

Struttura JSON richiesta:
{
  "descrizione_sintetica": "3-4 righe: cos'è il progetto, cosa produce/eroga, per chi, dove opera",
  "innovazione_tabella": [
    ["Dimensione", "Stato attuale del mercato", "Cosa cambia con il progetto"],
    ["Prodotto/Servizio", "come funziona oggi", "cosa introduce il progetto"],
    ["Processo", "come funziona oggi", "cosa introduce il progetto"],
    ["Modello di business", "come funziona oggi", "cosa introduce il progetto"]
  ],
  "trl_label": "TRL x — descrizione specifica dello stato di sviluppo attuale",
  "investimento_breakdown": [
    ["Voce di spesa", "Importo", "% sul totale", "Ammissibile ON"],
    ["Macchinari / attrezzature", "€ xx.000", "xx%", "SI"],
    ["Software / tecnologia", "€ xx.000", "xx%", "SI"],
    ["Opere murarie (max 30%)", "€ xx.000", "xx%", "SI — entro limite"],
    ["Consulenze specialistiche (max 25%)", "€ xx.000", "xx%", "SI — entro limite"],
    ["Altre spese ammissibili", "€ xx.000", "xx%", "SI"],
    ["TOTALE", "€ xxx.000", "100%", ""]
  ],
  "localizzazione": "Comune, Provincia, Regione — motivazione della scelta localizzativa e impatto territoriale atteso",
  "tempistiche": "Durata prevista realizzazione investimento in mesi — coerente con requisiti ON (max 48 mesi)"
}`,

mercato: (ctx) => `Genera il JSON per l'Analisi di Mercato del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Per ON l'analisi di mercato deve essere concreta e territorialmente radicata. Non serve TAM globale — serve dimostrare domanda locale/nazionale reale e sostenibilità commerciale. Evita proiezioni iper-ottimistiche.

Struttura JSON richiesta:
{
  "mercato_riferimento": "2-3 righe: definizione precisa del mercato, dimensioni nazionali/regionali con dati, trend recenti",
  "tam_sam_som": [
    ["Segmento", "Definizione", "Dimensione", "Valore stimato"],
    ["Mercato totale", "definizione", "xxx imprese/clienti/anno", "€ xxxM"],
    ["Mercato servibile", "target raggiungibile", "xx imprese/clienti/anno", "€ xxM"],
    ["Quota anno 3", "obiettivo realistico", "xxx clienti", "€ xxK"]
  ],
  "trend_bullets": [
    "trend 1 specifico del settore con dato numerico",
    "trend 2",
    "trend 3",
    "trend 4"
  ],
  "competitor_tabella": [
    ["Competitor", "Tipo", "Punto di forza", "Debolezza vs progetto"],
    ["competitor 1", "diretto/indiretto", "punto di forza", "perché il progetto è meglio"],
    ["competitor 2", "diretto/indiretto", "punto di forza", "perché il progetto è meglio"],
    ["competitor 3", "diretto/indiretto", "punto di forza", "perché il progetto è meglio"]
  ],
  "differenziazione": "2-3 righe: vantaggio competitivo sostenibile e barriere all'imitazione",
  "validazione_mercato": "Evidenze concrete di domanda: LOI, pre-contratti, sondaggi, pilot, feedback clienti — numeri reali"
}`,

piano_economico: (ctx) => `Genera il JSON per il Piano Economico-Finanziario del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Il piano economico per ON deve dimostrare: sostenibilità a break-even entro 36-48 mesi, coerenza ricavi/costi con il settore, capacità di rimborso del finanziamento agevolato. I numeri devono essere conservativi e credibili.

Struttura JSON richiesta (importi interi senza simbolo euro):
{
  "anno1": {
    "ricavi_totali": 0,
    "costo_venduto": 0,
    "margine_lordo": 0,
    "costi_personale": 0,
    "costi_marketing": 0,
    "costi_operativi": 0,
    "costi_amm": 0,
    "altri_costi": 0,
    "costi_totali": 0,
    "ebitda": 0,
    "ammortamenti": 0,
    "ebit": 0,
    "oneri_finanziari": 0,
    "risultato_ante_imposte": 0,
    "imposte": 0,
    "utile_netto": 0
  },
  "anno2": {"ricavi_totali":0,"costo_venduto":0,"margine_lordo":0,"costi_personale":0,"costi_marketing":0,"costi_operativi":0,"costi_amm":0,"altri_costi":0,"costi_totali":0,"ebitda":0,"ammortamenti":0,"ebit":0,"oneri_finanziari":0,"risultato_ante_imposte":0,"imposte":0,"utile_netto":0},
  "anno3": {"ricavi_totali":0,"costo_venduto":0,"margine_lordo":0,"costi_personale":0,"costi_marketing":0,"costi_operativi":0,"costi_amm":0,"altri_costi":0,"costi_totali":0,"ebitda":0,"ammortamenti":0,"ebit":0,"oneri_finanziari":0,"risultato_ante_imposte":0,"imposte":0,"utile_netto":0},
  "assunzioni": [
    "assunzione 1 con numeri specifici",
    "assunzione 2",
    "assunzione 3",
    "assunzione 4",
    "assunzione 5"
  ],
  "rimborso_on": "Descrizione piano rimborso: importo rata mensile/annuale, durata 8 anni, tasso 0%, sostenibilità rispetto a cash flow atteso"
}`,

occupazione: (ctx) => `Genera il JSON per il Piano Occupazionale del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

L'occupazione è uno dei criteri di valutazione più pesanti per ON. Invitalia premia: nuovi posti di lavoro creati, contratti a tempo indeterminato, inclusione under 35 e donne, occupazione in aree svantaggiate. Essere specifici e realistici.

Struttura JSON richiesta:
{
  "kpi_occupazione": [
    {"value": "X", "label": "FTE anno 1", "sub": "Nuove assunzioni"},
    {"value": "X", "label": "FTE anno 2", "sub": "Crescita organico"},
    {"value": "X", "label": "FTE anno 3", "sub": "Organico target"},
    {"value": "XX%", "label": "Under 35 / Donne", "sub": "Sul totale assunzioni"}
  ],
  "team_fondatore": {
    "nome": "Nome Cognome — CEO/Responsabile",
    "esperienza": "x anni in settore rilevante",
    "ruolo_operativo": "responsabilità operative specifiche nel progetto"
  },
  "piano_assunzioni": [
    ["Profilo", "Contratto", "Periodo", "RAL", "Under35/Donna"],
    ["profilo 1", "Indeterminato/Determinato", "Mese x", "€ xxK", "SI/NO"],
    ["profilo 2", "tipo contratto", "Mese x", "€ xxK", "SI/NO"],
    ["profilo 3", "tipo contratto", "Mese x", "€ xxK", "SI/NO"],
    ["profilo 4", "tipo contratto", "Mese x", "€ xxK", "SI/NO"]
  ],
  "politica_inclusione": "2-3 righe: impegni specifici su under 35, donne, eventuale occupazione in aree svantaggiate o disoccupati di lungo periodo",
  "impatto_occupazionale_indiretto": "1-2 righe: occupazione indotta su fornitori, indotto locale, stima realistica"
}`,

operativo: (ctx) => `Genera il JSON per il Piano Operativo del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Per ON il piano operativo deve essere concreto e fattibile. Durata massima realizzazione investimento 48 mesi. Le fasi devono essere ancorate a milestone verificabili da Invitalia durante il tutoraggio post-ammissione.

Struttura JSON richiesta:
{
  "fasi": [
    {
      "nome": "FASE 1",
      "periodo": "Mesi 1-6",
      "attivita": ["attività 1 concreta", "attività 2", "attività 3", "attività 4", "attività 5"],
      "kpi": "KPI verificabili: metrica1 · metrica2 · metrica3"
    },
    {
      "nome": "FASE 2",
      "periodo": "Mesi 7-12",
      "attivita": ["attività 1", "attività 2", "attività 3", "attività 4", "attività 5"],
      "kpi": "KPI verificabili: metrica1 · metrica2 · metrica3"
    },
    {
      "nome": "FASE 3",
      "periodo": "Mesi 13-24",
      "attivita": ["attività 1", "attività 2", "attività 3", "attività 4", "attività 5"],
      "kpi": "KPI verificabili: metrica1 · metrica2 · metrica3"
    },
    {
      "nome": "FASE 4",
      "periodo": "Mesi 25-36",
      "attivita": ["attività 1", "attività 2", "attività 3", "attività 4", "attività 5"],
      "kpi": "KPI verificabili: metrica1 · metrica2 · metrica3"
    }
  ],
  "milestone_invitalia": [
    "Milestone 1 verificabile da Invitalia durante tutoraggio — mese x",
    "Milestone 2 — mese x",
    "Milestone 3 — mese x"
  ]
}`,

impatto: (ctx) => `Genera il JSON per la sezione Impatto Sociale e Territoriale del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Per ON l'impatto territoriale e sociale pesa significativamente in istruttoria. Enfatizzare: radicamento territoriale, benefici per la comunità locale, impatto su fasce deboli o aree svantaggiate, contributo allo sviluppo del territorio.

Struttura JSON richiesta:
{
  "kpi_impatto": [
    {"value": "XX", "label": "Posti lavoro diretti", "sub": "Triennio"},
    {"value": "XX", "label": "Posti lavoro indiretti", "sub": "Indotto locale"},
    {"value": "XX%", "label": "Under 35/Donne", "sub": "Sul totale occupazione"},
    {"value": "XXX", "label": "Beneficiari diretti", "sub": "Clienti/utenti anno 3"}
  ],
  "impatto_territoriale": "3-4 righe: contributo specifico allo sviluppo del territorio di localizzazione, relazioni con ecosistema locale, impatto su PIL locale",
  "impatto_sociale": "2-3 righe: benefici sociali misurabili, inclusione, riduzione gap specifici del contesto",
  "beneficiari_tabella": [
    ["Categoria beneficiario", "Numero stimato", "Beneficio principale"],
    ["categoria 1", "xxx", "beneficio concreto"],
    ["categoria 2", "xxx", "beneficio concreto"],
    ["categoria 3", "xxx", "beneficio concreto"]
  ],
  "sostenibilita": "2-3 righe: come l'impatto persiste dopo la fine del finanziamento, autonomia economica del progetto",
  "allineamento_pnrr": [
    "Missione/obiettivo PNRR 1 — allineamento specifico",
    "Missione/obiettivo PNRR 2 — allineamento specifico",
    "Politica Invitalia — allineamento specifico"
  ]
}`,

fonti_impieghi: (ctx) => `Genera il JSON per il prospetto Fonti e Impieghi del dossier ON - Oltre Nuove Imprese a Tasso Zero.
${ctx}

Per ON: finanziamento agevolato fino al 70% delle spese ammissibili a tasso 0% con rimborso in 8 anni + fondo perduto 30% della quota finanziata. Nessuna garanzia fideiussoria richiesta. Investimento minimo €50.000, massimo €3.000.000.

Struttura JSON richiesta (importi interi senza simbolo euro, totale fonti = totale impieghi):
{
  "impieghi": [
    {"label": "Macchinari e attrezzature (xx%)", "desc": "descrizione dettagliata componenti", "importo": 0},
    {"label": "Software e tecnologia (xx%)", "desc": "descrizione dettagliata componenti", "importo": 0},
    {"label": "Opere murarie — max 30% (xx%)", "desc": "descrizione — rispetta limite normativo", "importo": 0},
    {"label": "Consulenze specialistiche — max 25% (xx%)", "desc": "descrizione — rispetta limite normativo", "importo": 0},
    {"label": "Altre spese ammissibili (xx%)", "desc": "descrizione componenti residuali", "importo": 0}
  ],
  "fonti": [
    {"label": "Finanziamento ON tasso 0% (70%)", "desc": "Rimborso 8 anni, tasso zero, erogazione in SAL su avanzamento lavori", "importo": 0},
    {"label": "Fondo perduto ON (21%)", "desc": "30% della quota finanziata — non rimborsabile, erogato a saldo finale", "importo": 0},
    {"label": "Capitale proprio soci (9%)", "desc": "Apporto diretto soci fondatori — versamento contestuale a erogazione ON", "importo": 0}
  ],
  "totale": 0,
  "nota": "2-3 righe: struttura finanziaria ottimizzata per ON — copertura pubblica, assenza fideiussione, note su de minimis e compatibilità aiuti"
}`

    };

    const promptFn = PROMPTS[sectionId];
    if (!promptFn) return res.status(400).json({ error: 'sectionId non riconosciuto: ' + sectionId });

    const fullPrompt = promptFn(prompt);

    let text = '';

    if (provider === 'claude') {
      // ── CLAUDE (Anthropic) — Opus 4.8 per dossier premium ───
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
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

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let raw = fence ? fence[1].trim() : text.trim();
    const firstBrace = raw.search(/[{\[]/);
    if (firstBrace > 0) raw = raw.substring(firstBrace);

    try {
      const parsed = JSON.parse(raw);
      return res.status(200).json({ type: 'json', data: parsed });
    } catch (e) {
      try {
        let depth = 0, lastValid = -1;
        const oc = raw[0], cc = oc === '{' ? '}' : ']';
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] === oc) depth++;
          else if (raw[i] === cc) { depth--; if (depth === 0) { lastValid = i; break; } }
        }
        if (lastValid > 0) return res.status(200).json({ type: 'json', data: JSON.parse(raw.substring(0, lastValid + 1)) });
      } catch (e2) {}
      return res.status(200).json({ type: 'text', data: raw });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
