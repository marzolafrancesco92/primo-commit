// src/lib/sanity.ts
// Legge Brani e Progetti da Sanity. Pensato per essere chiamato dal
// frontmatter di index.astro, con fallback ai dati fissi in caso di errore.

import { createClient } from '@sanity/client';

const client = createClient({
  projectId: 'lhbgjyme',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true, // letture veloci e gratuite; i dati possono avere qualche secondo di ritardo
});

// Costruisce l'URL diretto di un file (audio o immagine) a partire
// dal riferimento "asset" restituito da Sanity.
function fileUrl(asset: any): string {
  if (!asset?._ref) return '';
  // formato ref: file-<id>-<estensione>
  const [, id, ext] = asset._ref.split('-');
  return `https://cdn.sanity.io/files/lhbgjyme/production/${id}.${ext}`;
}
function imageUrl(asset: any): string {
  if (!asset?._ref) return '';
  // formato ref: image-<id>-<dimensioni>-<estensione>
  const parts = asset._ref.split('-');
  const ext = parts.pop();
  const dims = parts.pop();
  const id = parts.slice(1).join('-');
  return `https://cdn.sanity.io/images/lhbgjyme/production/${id}-${dims}.${ext}`;
}

export interface SanityTrack {
  id: string;
  title: string;
  mood: string;
  instrumentation: string;
  audioUrl: string;
}

export interface SanityProject {
  slug: string;
  title: string;
  year: number;
  director?: string;
  type?: string;
  synopsis?: string;
  poster?: string;
  trailerUrl?: string;
}

export async function getTracks(): Promise<SanityTrack[]> {
  const rows = await client.fetch(`
    *[_type == "track" && published != false] | order(order asc) {
      _id, title, mood, instrumentation, audioFile { asset-> { _ref } }
    }
  `);
  return rows.map((r: any) => ({
    id: r._id,
    title: r.title,
    mood: r.mood ?? '',
    instrumentation: r.instrumentation ?? '',
    audioUrl: fileUrl(r.audioFile?.asset),
  })).filter((t: SanityTrack) => t.audioUrl);
}

export async function getProjects(): Promise<SanityProject[]> {
  const rows = await client.fetch(`
    *[_type == "project" && published != false] | order(year desc) {
      "slug": slug.current, title, year, director, type, synopsis,
      poster { asset-> { _ref } }, trailerUrl
    }
  `);
  return rows.map((r: any) => ({
    slug: r.slug,
    title: r.title,
    year: r.year,
    director: r.director,
    type: r.type,
    synopsis: r.synopsis,
    poster: imageUrl(r.poster?.asset),
    trailerUrl: r.trailerUrl,
  }));
}
