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

export interface SanityTrack {
  id: string;
  title: string;
  mood: string;
  instrumentation: string;
  src: string;
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
  // Nota: chiediamo direttamente "asset->{url}" a Sanity invece di
  // ricostruire l'URL a mano dal riferimento — Sanity restituisce già
  // l'URL corretto e pronto all'uso.
  const rows = await client.fetch(`
    *[_type == "track" && published != false] | order(order asc) {
      _id, title, mood, instrumentation, "audioUrl": audioFile.asset->url
    }
  `);
  return rows
    .map((r: any) => ({
      id: r._id,
      title: r.title,
      mood: r.mood ?? '',
      instrumentation: r.instrumentation ?? '',
      src: r.audioUrl ?? '',
    }))
    .filter((t: SanityTrack) => t.src);
}

export interface SanityAward {
  slug: string;
  name: string;
  subtitle?: string;
  logo: string;
}

export async function getAwards(): Promise<SanityAward[]> {
  const rows = await client.fetch(`
    *[_type == "award" && published != false] | order(order asc) {
      "slug": slug.current, name, subtitle, "logo": logo.asset->url
    }
  `);
  return rows
    .map((r: any) => ({ slug: r.slug, name: r.name, subtitle: r.subtitle, logo: r.logo ?? '' }))
    .filter((a: SanityAward) => a.logo);
}

export async function getProjects(): Promise<SanityProject[]> {
  const rows = await client.fetch(`
    *[_type == "project" && published != false] | order(order asc) {
      "slug": slug.current, title, year, director, type, synopsis,
      "poster": poster.asset->url, trailerUrl
    }
  `);
  return rows.map((r: any) => ({
    slug: r.slug,
    title: r.title,
    year: r.year,
    director: r.director,
    type: r.type,
    synopsis: r.synopsis,
    poster: r.poster ?? '',
    trailerUrl: r.trailerUrl,
  }));
}
