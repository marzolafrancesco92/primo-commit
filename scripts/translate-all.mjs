// scripts/translate-all.mjs
//
// Traduce in inglese e bulgaro TUTTI i progetti, brani e premi già presenti
// in Sanity (utile per il contenuto creato prima di attivare il webhook).
// Sicuro da rilanciare quante volte vuoi: salta automaticamente ciò che è
// già tradotto e il cui testo italiano non è cambiato.
//
// USO:
//   export SANITY_WRITE_TOKEN="il-tuo-token"
//   export ANTHROPIC_API_KEY="la-tua-chiave"
//   node scripts/translate-all.mjs

import { createClient } from '@sanity/client';

const SANITY_WRITE_TOKEN = process.env.SANITY_WRITE_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SANITY_WRITE_TOKEN || !ANTHROPIC_API_KEY) {
  console.error('Mancano SANITY_WRITE_TOKEN e/o ANTHROPIC_API_KEY come variabili d\'ambiente.');
  process.exit(1);
}

const client = createClient({
  projectId: 'lhbgjyme',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: SANITY_WRITE_TOKEN,
  useCdn: false,
});

const FIELDS_BY_TYPE = {
  project: ['title', 'synopsis'],
  track: ['title', 'mood', 'instrumentation'],
  award: ['name', 'subtitle'],
};

const MODEL = 'claude-haiku-4-5-20251001';
const LANG_NAMES = { en: 'inglese', bg: 'bulgaro' };

async function callClaude(systemPrompt, userText) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: userText }] }),
  });
  if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return (data.content?.find((b) => b.type === 'text')?.text ?? '').trim();
}

async function translateFields(fields, targetLang) {
  const entries = Object.entries(fields).filter(([, v]) => v && v.trim());
  if (!entries.length) return {};
  const system = `Sei un traduttore professionista. Riceverai un oggetto JSON con campi di testo in italiano, presi dal sito di un compositore di musica per film e videogiochi. Traduci ogni valore dall'italiano al ${LANG_NAMES[targetLang]}, con un registro professionale e naturale, non letterale parola per parola. Rispondi SOLO con un oggetto JSON valido, con le stesse chiavi, senza markdown.`;
  const raw = await callClaude(system, JSON.stringify(Object.fromEntries(entries)));
  try {
    return JSON.parse(raw.replace(/^```json\s*|```$/g, '').trim());
  } catch {
    const result = {};
    for (const [key, value] of entries) {
      result[key] = await callClaude(
        `Sei un traduttore professionista. Traduci dall'italiano al ${LANG_NAMES[targetLang]}. Rispondi SOLO con la traduzione, senza spiegazioni.`,
        value
      );
    }
    return result;
  }
}

async function hashFields(fields) {
  const normalized = JSON.stringify(
    Object.entries(fields).filter(([, v]) => v && v.trim()).sort(([a], [b]) => a.localeCompare(b))
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function run() {
  for (const docType of Object.keys(FIELDS_BY_TYPE)) {
    const docs = await client.fetch(`*[_type == $type]`, { type: docType });
    console.log(`\n== ${docType} (${docs.length}) ==`);

    for (const doc of docs) {
      const fieldsToTranslate = FIELDS_BY_TYPE[docType];
      const sourceFields = {};
      for (const field of fieldsToTranslate) {
        if (typeof doc[field] === 'string') sourceFields[field] = doc[field];
      }

      const currentHash = await hashFields(sourceFields);
      const previousHash = doc.translations?.sourceHash;
      if (previousHash === currentHash) {
        console.log(`– ${doc.title ?? doc.name ?? doc._id} — già tradotto, saltato`);
        continue;
      }

      try {
        const [en, bg] = await Promise.all([
          translateFields(sourceFields, 'en'),
          translateFields(sourceFields, 'bg'),
        ]);
        await client.patch(doc._id).set({ translations: { en, bg, sourceHash: currentHash } }).commit({ autoGenerateArrayKeys: true });
        console.log(`✓ ${doc.title ?? doc.name ?? doc._id}`);
      } catch (error) {
        console.log(`✗ ${doc.title ?? doc.name ?? doc._id} — errore: ${error.message}`);
      }
    }
  }
  console.log('\nFatto.');
}

run().catch((e) => { console.error(e); process.exit(1); });
