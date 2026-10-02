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
import { translateFields } from '../../lib/translate';
// 1. Nuovo import richiesto da Astro v6 / Cloudflare Workers per le variabili d'ambiente
import { env } from 'cloudflare:workers';

export const prerender = false;

const FIELDS_BY_TYPE: Record<string, string[]> = {
  project: ['title', 'synopsis'],
  track: ['title', 'mood', 'instrumentation'],
  award: ['name', 'subtitle'],
};

async function verifySignature(request: Request, secret: string, body: string): Promise<boolean> {
  const signatureHeader = request.headers.get('sanity-webhook-signature');
  if (!signatureHeader) return false;
  // Sanity firma con HMAC-SHA256, formato "t=<timestamp>,v1=<firma>"
  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')));
  const signedContent = `${parts.t}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+\$/, '');
  return expected === parts.v1;
}

function errorResponse(step: string, error: any, status = 500) {
  console.error(`Errore webhook (${step}):`, error);
  return new Response(
    JSON.stringify({ ok: false, step, error: error?.message ?? String(error) }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Controllo a cascata: cerca prima nel nuovo modulo cloudflare:workers,
    // poi nei vari posizionamenti possibili di locals forniti dall'adapter v6
    const cfEnv = (env as any) || {};
    const localsCf = (locals as any)?.cloudflare?.env || (locals as any)?.runtime?.env || {};

    const webhookSecret = cfEnv.SANITY_WEBHOOK_SECRET || localsCf.SANITY_WEBHOOK_SECRET;
    const writeToken = cfEnv.SANITY_WRITE_TOKEN || localsCf.SANITY_WRITE_TOKEN;
    const anthropicKey = cfEnv.ANTHROPIC_API_KEY || localsCf.ANTHROPIC_API_KEY;

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
   

    const rawBody = await request.text();

    let valid = false;
    try {
      valid = await verifySignature(request, webhookSecret, rawBody);
    } catch (error) {
      return errorResponse('verify-signature', error);
    }
    if (!valid) return new Response(JSON.stringify({ ok: false, step: 'verify-signature', error: 'Firma non valida' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const payload = JSON.parse(rawBody);
    const docId: string | undefined = payload._id;
    const docType: string | undefined = payload._type;

    if (!docId || !docType || !FIELDS_BY_TYPE[docType]) {
      return new Response(JSON.stringify({ ok: true, skipped: true, docType }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const client = createClient({
      projectId: 'lhbgjyme',
      dataset: 'production',
      apiVersion: '2024-01-01',
      token: writeToken,
      useCdn: false,
    });

    const doc = await client.getDocument(docId);
    if (!doc) return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'documento non trovato' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const fieldsToTranslate = FIELDS_BY_TYPE[docType];
    const sourceFields: Record<string, string> = {};
    for (const field of fieldsToTranslate) {
      if (typeof (doc as any)[field] === 'string') sourceFields[field] = (doc as any)[field];
    }

    let en: Record<string, string>, bg: Record<string, string>;
    try {
      [en, bg] = await Promise.all([
        translateFields(anthropicKey, sourceFields, 'en'),
        translateFields(anthropicKey, sourceFields, 'bg'),
      ]);
    } catch (error) {
      return errorResponse('translate', error);
    }

    try {
      await client.patch(docId).set({ translations: { en, bg } }).commit({ autoGenerateArrayKeys: true });
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
