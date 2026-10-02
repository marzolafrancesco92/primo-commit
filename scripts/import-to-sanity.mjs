// scripts/import-to-sanity.mjs
//
// Importa in Sanity tutti i progetti e i brani che oggi sono nei dati fissi
// (fallbackProjects / fallbackTracks), caricando anche le locandine e gli
// MP3 già presenti in locale.
//
// USO:
//   1) Crea un token di scrittura su https://www.sanity.io/manage
//      (progetto lhbgjyme > API > Tokens > Add API token > permessi "Editor")
//   2) Nel terminale, dentro la cartella del progetto del sito:
//        export SANITY_WRITE_TOKEN="skXwaNdj7SECp679qynaFS08fUgRCMI1tlHBIGntB2BcRdvP7C0Ksa7EmALUZwK8SobLuSm9fAKstcrB4KqzKoMxhOLk4ochzkSUZyZIPhGzMBqKAMs7SQQlqeHMH9OuAfUD9a8Wiqnzyu4k4ULwnlZ8S3p2ak4NovVgWFunIsOXGMuPIcBT"
//        node scripts/import-to-sanity.mjs
//
// Lo script usa lo stesso slug/id dei dati fissi come _id del documento in
// Sanity, così la logica di "merge" nel sito li riconosce come la stessa
// voce e non li duplica.

import { createClient } from '@sanity/client';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const client = createClient({
  projectId: 'lhbgjyme',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_WRITE_TOKEN,
  useCdn: false,
});

if (!process.env.SANITY_WRITE_TOKEN) {
  console.error('Manca SANITY_WRITE_TOKEN. Vedi le istruzioni in cima a questo file.');
  process.exit(1);
}

// Cartella del progetto del sito (modifica se la sposti altrove)
const SITE_DIR = '/Users/francescomarzola/Downloads/WEBSITE/marzolamusic-nuovo';
const POSTERS_DIR = path.join(SITE_DIR, 'public/images/projects');
const AUDIO_DIR = path.join(SITE_DIR, 'public/audio');

// Stessi dati di fallbackProjects, ma con il solo nome del file locandina
const projects = [
  { slug: 'spoke', title: 'Spoke', year: 2026, director: 'Regia Bogdan Darev', type: 'Cortometraggio', posterFile: 'Spoke-Poster-203x300.avif' },
  { slug: 'kid-with-a-movie-camera', title: 'Kid With a Movie Camera', year: 2026, director: 'Regia Micah Knapp', type: 'Documentario', posterFile: 'jsKWAMC_PosterMARZOLA-225x300.avif' },
  { slug: 'home-court', title: 'Home Court', year: 2026, director: 'Regia Rodrigo Ernandéz, Elpida Nikou', type: 'Cortometraggio', posterFile: 'HOMECOURT-poster-WIP-214x300.avif' },
  { slug: 'morphe', title: 'Morphé', year: 2026, director: 'Regia Luca Ferrara', type: 'Cortometraggio', posterFile: 'MORPHE-Poster-214x300.avif' },
  { slug: 'the-old-and-the-new', title: 'The Old and the New', year: 2026, director: 'Regia Luca Ferrara', type: 'Cortometraggio', posterFile: 'TOATN-Poster-201x300.avif' },
  { slug: 'as-the-sea', title: 'As the Sea', year: 2026, director: 'Regia Andrea Corazza', type: 'Cortometraggio', posterFile: 'AsTheSea-Poster-212x300.avif' },
  { slug: 'beyond-the-border', title: 'Beyond the Border', year: 2026, director: 'Regia Irena Daskalova', type: 'Cortometraggio', posterFile: 'BeyondTheBorderPOSTER-168x300.avif' },
  { slug: 'hidden-in-the-dark', title: 'Hidden in the Dark', year: 2025, director: 'Regia Christian Gato', type: 'Cortometraggio', posterFile: 'Poster-HITD-v01-214x300.avif' },
  { slug: 'el-mazarol', title: 'El Mazarol', year: 2025, director: 'Regia Juri Ferri', type: 'Cortometraggio', posterFile: 'el-mazarol-POSTER-0-1440x1800-1-240x300.avif' },
  { slug: 'the-ministry', title: 'The Ministry', year: 2025, director: 'Regia Aaron Ryan', type: 'Cortometraggio', posterFile: 'Poster-The-Ministry-203x300.avif' },
  { slug: 'il-sogno-disegnato', title: 'Il sogno disegnato', year: 2025, director: 'Regia Andrea Corazza', type: 'Cortometraggio', posterFile: 'Il-Sogno-Disegnato-poster-212x300.avif' },
  { slug: 'the-fox-and-the-crow', title: 'The Fox and the Crow', year: 2025, director: 'Regia Shakila Bizimana', type: 'Cortometraggio', posterFile: 'POSTER-THE-FOX-THE-CROW-1-212x300.avif' },
  { slug: 'sans-dieu', title: 'Sans Dieu', year: 2024, director: 'Regia Alessandro Rocca', type: 'Cortometraggio', posterFile: 'poster_SansDieu-200x300.avif' },
  { slug: 'centipede', title: 'Centipede', year: 2022, director: 'Regia Vera Ivanova', type: 'Cortometraggio', posterFile: 'Centipede-poster-212x300.jpeg' },
];

// Stessi dati di fallbackTracks. "file" è null per i brani senza ancora un
// MP3 reale: lo script li salta e te lo segnala, così li aggiungi quando
// hai l'audio pronto (rilanciando lo script, che aggiorna senza duplicare).
const tracks = [
  { id: 'wished-for-a-hug', title: 'Wished for a hug', mood: 'Emozionale, minimale', instrumentation: 'Piano e pluck', file: null },
  { id: 'abysmal-distance', title: 'Abysmal Distance', mood: 'Drammatico', instrumentation: 'Archi, registrazione reale', file: null },
  { id: 'give-me-back-it', title: 'Give me back it', mood: 'Azione, battaglia', instrumentation: 'Archi (MIDI)', file: null },
  { id: 'a-journey-of-love', title: 'A Journey of Love', mood: 'Romantico', instrumentation: 'Piano, viola e cello (MIDI)', file: null },
  { id: 'intense-connection', title: 'Intense Connection', mood: 'Sci-fi drama', instrumentation: 'Orchestra reale', file: 'IntenseConnection-14.mp3' },
  { id: 'foresight', title: 'Foresight – Main Theme', mood: 'Epico, avventura', instrumentation: 'Grande orchestra reale', file: null },
  { id: 'innocent-ugly-truth', title: 'Innocent Ugly Truth', mood: 'Horror intimo', instrumentation: 'Piano e archi (MIDI)', file: null },
  { id: 'primitive-chase', title: 'Primitive Chase', mood: 'Horror, inseguimento', instrumentation: 'Registrazione reale', file: null },
  { id: 'sans-dieu-ending-titles', title: 'Sans Dieu – Ending Titles', mood: 'Ipnotico, drammatico', instrumentation: 'Voce e soundscape', file: null },
];

// Carica un'immagine su Sanity, convertendo prima gli .avif in .jpg
// (Sanity non ne legge sempre bene le dimensioni, causando riferimenti
// incompleti e immagini "rotte" sul sito).
// Stessi dati di fallbackAwards in index.astro
const awards = [
  { slug: 'venice-iff', name: 'Venice IFF', subtitle: 'Official selection / festival presence', file: '1722509711-66ab698fddfbb-venice-iff-2024-logo-png-300x168.avif' },
  { slug: 'tampere', name: 'Tampere', subtitle: 'Film Festival', file: 'TampereLogo-300x160.avif' },
  { slug: 'isfmf-2025', name: 'ISFMF', subtitle: 'Nomination · 2025', file: 'ISFMF_2025_Top.avif' },
  { slug: 'apulia-top10', name: 'Apulia', subtitle: 'Top 10 · 2022', file: 'TOP-10-Apulia-150x150.png' },
];

async function uploadImage(filePath, originalFilename) {
  let uploadStream = fs.createReadStream(filePath);
  let uploadFilename = originalFilename;
  if (originalFilename.toLowerCase().endsWith('.avif')) {
    const jpegBuffer = await sharp(filePath).jpeg({ quality: 85 }).toBuffer();
    uploadStream = jpegBuffer;
    uploadFilename = originalFilename.replace(/\.avif$/i, '.jpg');
  }
  return client.assets.upload('image', uploadStream, { filename: uploadFilename });
}

async function run() {
  console.log(`\n== Progetti (${projects.length}) ==`);
  for (const [index, p] of projects.entries()) {
    const posterPath = path.join(POSTERS_DIR, p.posterFile);
    if (!fs.existsSync(posterPath)) {
      console.log(`✗ ${p.title} — MANCA il file locandina: ${posterPath}`);
      continue;
    }
    const asset = await uploadImage(posterPath, p.posterFile);
    await client.createOrReplace({
      _id: p.slug,
      _type: 'project',
      title: p.title,
      slug: { current: p.slug },
      year: p.year,
      director: p.director,
      type: p.type,
      poster: { _type: 'image', asset: { _type: 'reference', _ref: asset._id } },
      order: index + 1,
      published: true,
    });
    console.log(`✓ ${p.title}`);
  }

  console.log(`\n== Brani (${tracks.length}) ==`);
  for (const t of tracks) {
    if (!t.file) {
      console.log(`– ${t.title} — saltato (nessun MP3 ancora in public/audio/)`);
      continue;
    }
    const audioPath = path.join(AUDIO_DIR, t.file);
    if (!fs.existsSync(audioPath)) {
      console.log(`✗ ${t.title} — MANCA il file audio: ${audioPath}`);
      continue;
    }
    const asset = await client.assets.upload('file', fs.createReadStream(audioPath), { filename: t.file });
    await client.createOrReplace({
      _id: t.id,
      _type: 'track',
      title: t.title,
      mood: t.mood,
      instrumentation: t.instrumentation,
      audioFile: { _type: 'file', asset: { _type: 'reference', _ref: asset._id } },
      published: true,
    });
    console.log(`✓ ${t.title}`);
  }

  console.log(`\n== Premi/selezioni (${awards.length}) ==`);
  for (const [index, a] of awards.entries()) {
    const logoPath = path.join(POSTERS_DIR, a.file);
    if (!fs.existsSync(logoPath)) {
      console.log(`✗ ${a.name} — MANCA il file logo: ${logoPath}`);
      continue;
    }
    const asset = await uploadImage(logoPath, a.file);
    await client.createOrReplace({
      _id: a.slug,
      _type: 'award',
      name: a.name,
      slug: { current: a.slug },
      subtitle: a.subtitle,
      logo: { _type: 'image', asset: { _type: 'reference', _ref: asset._id } },
      order: index + 1,
      published: true,
    });
    console.log(`✓ ${a.name}`);
  }

  console.log('\nFatto. Puoi rilanciare questo script in qualsiasi momento: aggiorna i documenti esistenti senza duplicarli.');
}

run().catch((e) => {
  console.error('\nErrore:', e.message);
  process.exit(1);
});
