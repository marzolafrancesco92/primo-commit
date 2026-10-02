// src/pages/api/audio-proxy.ts
//
// Fa da "ponte" per i file audio ospitati su Sanity: il browser chiede il
// file a QUESTO dominio invece che a cdn.sanity.io, così non serve nessuna
// intestazione CORS da parte di Sanity (il fetch avviene lato server, dove
// il CORS non si applica). Risolve sia il blocco della waveform sia
// qualunque problema di riproduzione dovuto a CORS.
//
// Accetta solo URL di cdn.sanity.io, per evitare che l'endpoint diventi un
// proxy aperto verso siti qualunque.

import type { APIRoute } from 'astro';

export const prerender = false;

const ALLOWED_HOST = 'cdn.sanity.io';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const src = url.searchParams.get('src');

  if (!src) return new Response('Parametro "src" mancante', { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response('URL non valido', { status: 400 });
  }

  if (target.hostname !== ALLOWED_HOST) {
    return new Response('Host non consentito', { status: 403 });
  }

  // Inoltriamo l'header Range (se presente) così il browser può "saltare"
  // nel brano senza dover scaricare tutto il file da capo.
  const upstreamHeaders: Record<string, string> = {};
  const range = request.headers.get('range');
  if (range) upstreamHeaders['range'] = range;

  const upstreamResponse = await fetch(target.toString(), { headers: upstreamHeaders });

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Type', upstreamResponse.headers.get('content-type') ?? 'audio/mpeg');
  const contentLength = upstreamResponse.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const contentRange = upstreamResponse.headers.get('content-range');
  if (contentRange) headers.set('Content-Range', contentRange);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
};
