// =====================================================================
// FuelDesk / Price Maker · GET /api/clienti
//
// Endpoint di sola lettura: restituisce l'elenco dei clienti del tenant
// per popolare la tab Clienti del Price Maker.
//
// Nessun motore, nessun LLM: una semplice query al database.
//
// OUTPUT (JSON):
//   { clienti: [ { id, ragione_sociale, tipo, litri_anno, ... } ], count }
// =====================================================================
import { supabaseAdmin } from './_lib/supabase.js';

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'trojanis';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ---- 1. Risolvi il tenant ----
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', DEFAULT_TENANT_SLUG)
      .maybeSingle();

    if (tenantError || !tenant) {
      return res.status(500).json({
        error: 'Tenant non trovato',
        detail: tenantError?.message || DEFAULT_TENANT_SLUG,
      });
    }

    // ---- 2. Leggi i clienti del tenant ----
    // Solo i campi utili alla vista commerciale della tab Clienti.
    const { data: clienti, error: clientiError } = await supabaseAdmin
      .from('clienti')
      .select(`
        id,
        ragione_sociale,
        tipo,
        status,
        deposito_principale,
        litri_anno,
        ordini_anno,
        litri_ordine_medio,
        cadenza_gg,
        sconto_negoziato,
        sovra_med_mil,
        categoria_battente,
        fido_eni
      `)
      .eq('tenant_id', tenant.id)
      .order('litri_anno', { ascending: false, nullsFirst: false });

    if (clientiError) {
      return res.status(500).json({
        error: 'Errore lettura clienti',
        detail: clientiError.message,
      });
    }

    // ---- 3. Risposta ----
    return res.status(200).json({
      clienti: clienti || [],
      count: (clienti || []).length,
    });

  } catch (e) {
    console.error('[CLIENTI] Errore:', e);
    return res.status(500).json({ error: 'Errore interno', detail: e.message });
  }
}
