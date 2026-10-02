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
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return expected === parts.v1;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env ?? process.env;
  const webhookSecret = env.SANITY_WEBHOOK_SECRET;
  const writeToken = env.SANITY_WRITE_TOKEN;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  const rawBody = await request.text();

  if (webhookSecret) {
    const valid = await verifySignature(request, webhookSecret, rawBody);
    if (!valid) return new Response('Firma non valida', { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const docId: string | undefined = payload._id;
  const docType: string | undefined = payload._type;

  if (!docId || !docType || !FIELDS_BY_TYPE[docType]) {
    return new Response('Tipo di documento non gestito, ignorato', { status: 200 });
  }

  const client = createClient({
    projectId: 'lhbgjyme',
    dataset: 'production',
    apiVersion: '2024-01-01',
    token: writeToken,
    useCdn: false,
  });

  // Rileggiamo il documento completo (il payload del webhook può essere parziale)
  const doc = await client.getDocument(docId);
  if (!doc) return new Response('Documento non trovato', { status: 200 });

  const fieldsToTranslate = FIELDS_BY_TYPE[docType];
  const sourceFields: Record<string, string> = {};
  for (const field of fieldsToTranslate) {
    if (typeof (doc as any)[field] === 'string') sourceFields[field] = (doc as any)[field];
  }

  try {
    const [en, bg] = await Promise.all([
      translateFields(anthropicKey, sourceFields, 'en'),
      translateFields(anthropicKey, sourceFields, 'bg'),
    ]);

    await client.patch(docId).set({ translations: { en, bg } }).commit({ autoGenerateArrayKeys: true });

    return new Response(JSON.stringify({ ok: true, translated: Object.keys(sourceFields) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Errore traduzione webhook:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
