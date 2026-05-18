// api/log-acceptance.js
// Logga l'accettazione clickwrap del contratto success fee
// Il log viene scritto su Vercel con timestamp, IP e dati accettazione

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};

    // Raccoglie IP reale (Vercel può usare x-forwarded-for)
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown';

    const logEntry = {
      // Dati accettazione
      timestamp_server: new Date().toISOString(),
      timestamp_client: body.timestamp || null,
      project_name: body.projectName || '—',
      project_hash: body.projectSummaryHash || '—',
      accepted_terms: body.acceptedTerms || '—',
      terms_version: body.termsVersion || '—',
      // Dati tecnici per prova legale
      ip_address: ip,
      user_agent: body.userAgent || req.headers['user-agent'] || '—',
      referer: req.headers['referer'] || '—',
      // Prova di accettazione clickwrap
      acceptance_method: 'clickwrap',
      acceptance_statement: 'Utente ha cliccato "Genera il dossier" dopo visualizzazione testo termini success fee 8% FP Invitalia',
      legally_binding: true
    };

    // Log su console Vercel (persistente nei log Vercel per 30 giorni)
    console.log('[ACCEPTANCE_LOG]', JSON.stringify(logEntry));

    // Se configurato, invia anche per email tramite API esterna
    // (es. SendGrid, Resend) — da implementare quando disponibile
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'acceptance@startonitalia.it',
            to: ['info@startonitalia.it'],
            subject: `[Starton] Accettazione success fee — ${logEntry.project_name} — ${logEntry.timestamp_server}`,
            html: `<pre>${JSON.stringify(logEntry, null, 2)}</pre>`
          })
        });
      } catch(emailErr) {
        console.error('[ACCEPTANCE_LOG] Email error:', emailErr.message);
      }
    }

    return res.status(200).json({
      logged: true,
      timestamp: logEntry.timestamp_server,
      reference: `ACC-${Date.now()}`
    });

  } catch (err) {
    console.error('[ACCEPTANCE_LOG] Error:', err.message);
    // Non bloccare il flusso — il dossier si genera comunque
    return res.status(200).json({ logged: false, error: err.message });
  }
};
