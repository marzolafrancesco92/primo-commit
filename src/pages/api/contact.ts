// src/pages/api/contact.ts
//
// Riceve il form di contatto del sito e lo invia al Form di HubSpot.
// HubSpot si occupa da solo di creare/aggiornare il contatto e di
// mandare la notifica email — qui ci limitiamo a inoltrare i dati.
//
// Variabili d'ambiente necessarie (Cloudflare Pages):
//   HUBSPOT_PORTAL_ID  -> il Portal ID del tuo account HubSpot
//   HUBSPOT_FORM_GUID  -> l'ID del form creato in HubSpot

import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = (locals as any)?.runtime?.env ?? {};
    const portalId = env.149475896;
    const formGuid = env.fa9a4664-6627-495f-9c5c-8b654ef6faac;

    if (!portalId || !formGuid) {
      return new Response(JSON.stringify({ ok: false, error: 'Configurazione HubSpot mancante' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await request.formData();
    const name = formData.get('name')?.toString() ?? '';
    const email = formData.get('email')?.toString() ?? '';
    const projectType = formData.get('project_type')?.toString() ?? '';
    const message = formData.get('message')?.toString() ?? '';

    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: 'Email mancante' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hubspotResponse = await fetch(
      `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: [
            { name: 'firstname', value: name },
            { name: 'email', value: email },
            { name: 'project_type', value: projectType },
            { name: 'message', value: message },
          ],
          context: {
            pageUri: request.headers.get('referer') ?? 'https://www.marzolamusic.com',
            pageName: 'Marzola Music — Contatti',
          },
        }),
      }
    );

    if (!hubspotResponse.ok) {
      const errText = await hubspotResponse.text();
      console.error('Errore invio a HubSpot:', errText);
      return new Response(JSON.stringify({ ok: false, error: 'Invio a HubSpot fallito' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Redirect semplice a una pagina/sezione di ringraziamento. Se preferisci
    // restare sulla stessa pagina con un messaggio via JS, dimmelo e lo
    // adattiamo a un invio via fetch() invece che un submit HTML classico.
    return new Response(null, {
      status: 302,
      headers: { Location: '/?inviato=1#contatti' },
    });
  } catch (error: any) {
    console.error('Errore contact form:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
