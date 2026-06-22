// Weekly evergreen-article generator for DiscoverPortugal.
// Builds an SEO-focused content library around high-traffic Portugal travel topics.
// Each run writes a few full articles (title + summary + HTML body) and accumulates
// them in news.json, which the website renders in the "Weekly Articles" blog.
// Once all topics exist, it refreshes the oldest ones to keep them current.
//
// Required env: ANTHROPIC_API_KEY  (GitHub Actions secret)
// Run: node fetch-news.mjs

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const MODEL = 'claude-haiku-4-5-20251001';
const OUT = 'news.json';
const PER_RUN = 3; // how many articles to (re)generate each week

// High-value, search-friendly topics. category must be one of:
// restaurants | events | todo | guides | news   (matches the website's blog filters)
const TOPICS = [
  { key: 'best-restaurants-lisbon', title: 'Best Restaurants in Lisbon 2026', category: 'restaurants', city: 'Lisboa' },
  { key: '7-days-portugal',         title: '7 Days in Portugal: The Perfect Itinerary', category: 'guides', city: 'Portugal' },
  { key: 'where-to-stay-lisbon',    title: 'Where to Stay in Lisbon: Complete Neighbourhood Guide', category: 'guides', city: 'Lisboa' },
  { key: 'porto-vs-lisbon',         title: 'Porto vs Lisbon: Which City Is Better?', category: 'guides', city: 'Portugal' },
  { key: 'hidden-gems',             title: '25 Hidden Gems in Portugal', category: 'todo', city: 'Portugal' },
  { key: 'sintra-day-trip',         title: 'The Ultimate Sintra Day Trip Guide', category: 'guides', city: 'Sintra' },
  { key: 'best-beaches-algarve',    title: 'Best Beaches in the Algarve', category: 'todo', city: 'Algarve' },
  { key: 'budget',                  title: 'Portugal Travel Budget: How Much Does a Trip Cost?', category: 'guides', city: 'Portugal' },
  { key: 'portugal-winter',         title: 'Visiting Portugal in Winter: Weather, Tips & Things to Do', category: 'guides', city: 'Portugal' },
  { key: 'portugal-summer',         title: 'Visiting Portugal in Summer: Beaches, Festivals & Tips', category: 'guides', city: 'Portugal' },
];

async function writeArticle(topic) {
  const prompt =
    'You are the editor of DiscoverPortugal, a travel guide to Lisbon, Porto, Sintra, Cascais and the Algarve.\n' +
    'Write an engaging, accurate, SEO-friendly article for international travellers planning a trip to Portugal.\n\n' +
    'Topic: "' + topic.title + '"\n\n' +
    'Requirements:\n' +
    '- A one-sentence meta summary (max 30 words), enticing and keyword-rich.\n' +
    '- A body of 500-700 words as clean HTML using ONLY these tags: <p>, <h3>, <ul>, <li>, <strong>. ' +
    'No markdown, no images, no <html>/<head>/<h1>.\n' +
    '- Open with a short hook paragraph, then use <h3> sub-sections.\n' +
    '- Be practical and specific: real neighbourhoods, places, dishes, beaches, transport tips. ' +
    'Give realistic price RANGES (e.g. "€8-15"), never invent exact unstable prices.\n' +
    '- Friendly local-expert tone. Accurate as of 2026.\n\n' +
    'Respond with ONLY valid JSON, no markdown fences:\n' +
    '{"summary":"...","content":"<p>...</p><h3>...</h3>..."}';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return { summary: j.summary || '', content: j.content || '' };
}

function today() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

  let existing = [];
  if (existsSync(OUT)) { try { existing = (JSON.parse(readFileSync(OUT, 'utf8')).items) || []; } catch (e) {} }
  // Drop any legacy items that aren't part of the topic library (the old RSS news)
  const byKey = {};
  existing.forEach((it) => { if (it.key && TOPICS.some((t) => t.key === it.key)) byKey[it.key] = it; });

  // Generate missing topics first; once all exist, refresh the oldest ones.
  let queue = TOPICS.filter((t) => !byKey[t.key]);
  if (queue.length === 0) {
    queue = [...TOPICS].sort((a, b) => new Date(byKey[a.key].date || 0) - new Date(byKey[b.key].date || 0));
  }
  const batch = queue.slice(0, PER_RUN);

  for (const t of batch) {
    try {
      const a = await writeArticle(t);
      byKey[t.key] = { key: t.key, date: today(), title: t.title, summary: a.summary, city: t.city, category: t.category, content: a.content };
      console.log('Wrote: ' + t.key);
    } catch (e) { console.log('ERR ' + t.key + ': ' + e.message.slice(0, 100)); }
  }

  const items = Object.values(byKey).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!items.length) { console.error('No articles produced — leaving news.json unchanged.'); process.exit(0); }

  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), items }, null, 2) + '\n');
  console.log('Total articles in library: ' + items.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
