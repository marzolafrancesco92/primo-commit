// src/lib/translate.ts
// Helper condiviso per tradurre testi dall'italiano a inglese e bulgaro
// tramite l'API di Claude. Usato sia dallo script di build (testi fissi
// del sito) sia dal webhook di Sanity (contenuti dinamici).

const MODEL = 'claude-haiku-4-5-20251001'; // economico, qualità ottima per testi brevi

async function callClaude(apiKey: string, systemPrompt: string, userText: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const text = data.content?.find((b: any) => b.type === 'text')?.text ?? '';
  return text.trim();
}

const LANG_NAMES: Record<string, string> = { en: 'inglese', bg: 'bulgaro' };

/**
 * Traduce una singola stringa breve (es. un'etichetta UI, un titolo).
 */
export async function translateText(apiKey: string, italianText: string, targetLang: 'en' | 'bg'): Promise<string> {
  if (!italianText?.trim()) return '';
  const system = `Sei un traduttore professionista. Traduci il testo dell'utente dall'italiano al ${LANG_NAMES[targetLang]}. Rispondi SOLO con la traduzione, senza spiegazioni, senza virgolette, senza markdown. Mantieni tono ed eventuale formattazione (maiuscole, punteggiatura) il più possibile fedeli all'originale. Il testo riguarda un sito di un compositore di musica per film e videogiochi: usa un registro professionale e naturale per quell'ambito, non una traduzione letterale parola per parola.`;
  return callClaude(apiKey, system, italianText);
}

/**
 * Traduce un oggetto di campi testuali (es. { title, synopsis }) in un colpo
 * solo, restituendo un oggetto con le stesse chiavi tradotte. Più efficiente
 * di tradurre campo per campo quando un documento ha più testi.
 */
export async function translateFields(
  apiKey: string,
  fields: Record<string, string | undefined>,
  targetLang: 'en' | 'bg'
): Promise<Record<string, string>> {
  const entries = Object.entries(fields).filter(([, v]) => v && v.trim());
  if (!entries.length) return {};

  const system = `Sei un traduttore professionista. Riceverai un oggetto JSON con campi di testo in italiano, presi dal sito di un compositore di musica per film e videogiochi (titoli, sinossi, descrizioni di brani musicali, nomi di premi). Traduci ogni valore dall'italiano al ${LANG_NAMES[targetLang]}, con un registro professionale e naturale per quell'ambito, non letterale parola per parola. Rispondi SOLO con un oggetto JSON valido, con le stesse chiavi, senza markdown, senza spiegazioni.`;

  const input = Object.fromEntries(entries);
  const raw = await callClaude(apiKey, system, JSON.stringify(input));

  try {
    const cleaned = raw.replace(/^```json\s*|```$/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Se il modello non ha risposto con JSON pulito, traduciamo campo per
    // campo come ripiego più lento ma affidabile.
    const result: Record<string, string> = {};
    for (const [key, value] of entries) {
      result[key] = await translateText(apiKey, value as string, targetLang);
    }
    return result;
  }
}
