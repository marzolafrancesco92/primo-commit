// src/pages/api/sanity-webhook.ts
//
// Sanity chiama questo endpoint ogni volta che pubblichi o modifichi un
// documento (project, track, award). Qui: verifichiamo che la richiesta
// venga davvero da Sanity, leggiamo il documento, traduciamo i campi in
// inglese e bulgaro con Claude, e salviamo il risultato nel campo
// "translations" dello stesso documento.
//
// Configurazione necessaria (variabili d'ambiente, sia su Cloudflare Pages
// che in locale per i test):
//   SANITY_WEBHOOK_SECRET  -> generato da Sanity quando crei il webhook
//   SANITY_WRITE_TOKEN     -> lo stesso token usato dallo script di import
//   ANTHROPIC_API_KEY      -> la chiave API di Claude

import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import { translateFields, hashFields } from '../../lib/translate';
// Import richiesto da Astro v6 / Cloudflare Workers per le variabili d'ambiente
import { env } from 'cloudflare:workers';
// Importiamo il validatore ufficiale di Sanity per la firma digitale
import { isValidSignature } from '@sanity/webhook';

export const prerender = false;

const FIELDS_BY_TYPE: Record<string, string[]> = {
  project: ['title', 'synopsis'],
  track: ['title', 'mood', 'instrumentation'],
  award: ['name', 'subtitle'],
};

function errorResponse(step: string, error: any, status = 500) {
  console.error(`Errore webhook (${step}):`, error);
  return new Response(
    JSON.stringify({ ok: false, step, error: error?.message ?? String(error) }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const webhookSecret = env.SANITY_WEBHOOK_SECRET;
    const writeToken = env.SANITY_WRITE_TOKEN;
    const anthropicKey = env.ANTHROPIC_API_KEY;

    if (!webhookSecret || !writeToken || !anthropicKey) {
      return errorResponse(
        'env',
        `Variabile mancante: ${[
          !webhookSecret && 'SANITY_WEBHOOK_SECRET',
          !writeToken && 'SANITY_WRITE_TOKEN',
          !anthropicKey && 'ANTHROPIC_API_KEY',
        ].filter(Boolean).join(', ')}`
      );
    }

    // 1. Cloniamo la richiesta per assicurarci che il flusso binario rimanga intatto su Cloudflare Workers
    const clonedRequest = request.clone();
    
    // 2. Estraiamo il testo grezzo e la firma (UNA SOLA VOLTA)
    const rawBody = await clonedRequest.text();
    const signature = request.headers.get('sanity-webhook-signature') || '';

    // 3. Eseguiamo la validazione ufficiale con la libreria @sanity/webhook
    let valid = false;
    try {
      valid = await isValidSignature(rawBody, signature, webhookSecret);
    } catch (error) {
      return errorResponse('verify-signature', error);
    }
    
    if (!valid) {
      return new Response(
        JSON.stringify({ ok: false, step: 'verify-signature', error: 'Firma non valida' }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Analizziamo il JSON dal rawBody
    const payload = JSON.parse(rawBody);
    const docId: string | undefined = payload._id;
    const docType: string | undefined = payload._type;

    // 5. Controlliamo se il tipo di documento deve essere tradotto
    if (!docId || !docType || !FIELDS_BY_TYPE[docType]) {
      return new Response(JSON.stringify({ ok: true, skipped: true, docType }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 6. Inizializziamo il client Sanity per la scrittura
    const client = createClient({
      projectId: 'lhbgjyme',
      dataset: 'production',
      apiVersion: '2024-01-01',
      token: writeToken,
      useCdn: false,
    });

    // 7. Recuperiamo il documento originale
    const doc = await client.getDocument(docId);
    if (!doc) return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'documento non trovato' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    // 8. Mappiamo i campi da tradurre
    const fieldsToTranslate = FIELDS_BY_TYPE[docType];
    const sourceFields: Record<string, string> = {};
    for (const field of fieldsToTranslate) {
      if (typeof (doc as any)[field] === 'string') sourceFields[field] = (doc as any)[field];
    }

    // 9. Controlliamo se il testo italiano è davvero cambiato dall'ultima
    // traduzione. Se l'impronta combacia, questo webhook è scattato per il
    // NOSTRO stesso salvataggio della traduzione precedente (set() sul
    // documento = anche quello è un "Update") — ci fermiamo qui per evitare
    // un loop infinito di chiamate a Claude.
    const currentHash = await hashFields(sourceFields);
    const previousHash = (doc as any)?.translations?.sourceHash;
    if (previousHash && previousHash === currentHash) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'testo italiano invariato' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 10. Richiediamo le traduzioni a Claude (Anthropic)
    let en: Record<string, string>, bg: Record<string, string>;
    try {
      [en, bg] = await Promise.all([
        translateFields(anthropicKey, sourceFields, 'en'),
        translateFields(anthropicKey, sourceFields, 'bg'),
      ]);
    } catch (error) {
      return errorResponse('translate', error);
    }

    // 11. Salviamo le traduzioni (e l'impronta) nel documento di Sanity
    try {
      await client.patch(docId).set({ translations: { en, bg, sourceHash: currentHash } }).commit({ autoGenerateArrayKeys: true });
    } catch (error) {
      return errorResponse('sanity-patch', error);
    }

    return new Response(JSON.stringify({ ok: true, translated: Object.keys(sourceFields) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return errorResponse('top-level', error);
  }
};
