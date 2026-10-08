```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const portalId = env.HUBSPOT_PORTAL_ID;
    const formGuid = env.HUBSPOT_FORM_GUID;

    if (!portalId || !formGuid) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Configurazione HubSpot mancante',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const formData = await request.formData();

    const name = formData.get('name')?.toString() ?? '';
    const email = formData.get('email')?.toString() ?? '';
    const projectType = formData.get('project_type')?.toString() ?? '';
    const message = formData.get('message')?.toString() ?? '';

    if (!email) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Email mancante',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const hubspotUrl =
      `https://api.hsforms.com/submissions/v3/integration/submit/` +
      `${portalId}/${formGuid}`;

    const hubspotResponse = await fetch(hubspotUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: [
          {
            name: 'firstname',
            value: name,
          },
          {
            name: 'email',
            value: email,
          },
          {
            name: 'project_type',
            value: projectType,
          },
          {
            name: 'message',
            value: message,
          },
        ],
        context: {
          pageUri:
            request.headers.get('referer') ??
            'https://www.marzolamusic.com',
          pageName: 'Marzola Music — Contatti',
        },
      }),
    });

    if (!hubspotResponse.ok) {
      const errText = await hubspotResponse.text();

      console.error('Errore invio a HubSpot:', errText);

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Invio a HubSpot fallito',
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/?inviato=1#contatti',
      },
    });
  } catch (error: unknown) {
    console.error('Errore contact form:', error);

    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Errore interno',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
```