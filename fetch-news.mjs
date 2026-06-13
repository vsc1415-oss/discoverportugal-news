// Weekly Portugal travel-news generator.
// 1. Pulls real headlines from Google News RSS (free, no key).
// 2. Asks Claude to pick the 4 most relevant items for a Lisbon/Porto/Sintra/
//    Cascais/Algarve travel audience and write a clean title + 1-sentence summary.
// 3. Writes news.json (read by the website via the GitHub raw CDN).
//
// Required env: ANTHROPIC_API_KEY  (set as a GitHub Actions secret)
// Run: node fetch-news.mjs

import { writeFileSync } from 'node:fs';

const MODEL = 'claude-haiku-4-5-20251001';
const OUT = 'news.json';

// Google News RSS — real, recent Portugal travel/tourism headlines (last 14 days).
const FEEDS = [
  'https://news.google.com/rss/search?q=Portugal%20tourism%20OR%20travel%20when:14d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=Lisbon%20OR%20Porto%20OR%20Algarve%20travel%20when:14d&hl=en-US&gl=US&ceid=US:en',
];

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .trim();
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.split('<item>').slice(1);
  for (const b of blocks) {
    const get = (tag) => {
      const m = b.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
      return m ? decode(m[1]) : '';
    };
    let title = get('title');
    const link = get('link');
    const pubDate = get('pubDate');
    const source = get('source');
    // Google News titles end with " - Source"; strip it
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

async function fetchHeadlines() {
  const all = [];
  for (const url of FEEDS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DiscoverPortugalNewsBot' } });
      if (!res.ok) continue;
      all.push(...parseRss(await res.text()));
    } catch (e) { /* skip this feed */ }
  }
  // De-dupe by title, keep first 25
  const seen = new Set();
  return all.filter((it) => {
    const k = it.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 25);
}

function fmtDate(pubDate) {
  const d = pubDate ? new Date(pubDate) : new Date();
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function summarise(headlines) {
  const list = headlines.map((h, i) => `${i + 1}. ${h.title} (source: ${h.source || 'news'})`).join('\n');
  const prompt =
    'You are the editor of DiscoverPortugal, a travel guide for Lisbon, Porto, Sintra, Cascais and the Algarve.\n' +
    'From the real headlines below, pick the 4 MOST relevant and interesting for international travellers planning a trip to Portugal. ' +
    'Prefer tourism, flights, culture, food, events, openings and travel. Avoid politics, crime, sports and anything not useful to a tourist.\n\n' +
    'For each chosen item return: the original headline number, a clean rewritten title (max ~12 words, no clickbait), ' +
    'a single-sentence factual summary (max 30 words) based ONLY on the headline (do not invent specifics), ' +
    'the most relevant city tag from exactly: Lisboa, Porto, Sintra, Cascais, Algarve, Portugal, ' +
    'and the best-fitting category from exactly: restaurants (food/dining), events (festivals/concerts/dates), ' +
    'todo (beaches/activities/sights to do), guides (itineraries/travel features/where-to), news (everything else: flights, tourism figures, openings, general). ' +
    'Try to spread items across different categories when it fits.\n\n' +
    'Respond with ONLY valid JSON, no markdown, in this shape:\n' +
    '{"items":[{"n":3,"title":"...","summary":"...","city":"Lisboa","category":"news"}]}\n\n' +
    'Headlines:\n' + list;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(jsonStr).items || [];
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY');
    process.exit(1);
  }
  const headlines = await fetchHeadlines();
  if (!headlines.length) {
    console.error('No headlines fetched — leaving news.json unchanged.');
    process.exit(0);
  }
  const picks = await summarise(headlines);

  const items = picks
    .map((p) => {
      const src = headlines[(p.n || 0) - 1];
      if (!src) return null;
      const allowedCats = ['restaurants', 'events', 'todo', 'guides', 'news'];
      const category = allowedCats.includes(p.category) ? p.category : 'news';
      return {
        date: fmtDate(src.pubDate),
        title: p.title || src.title,
        summary: p.summary || '',
        city: p.city || 'Portugal',
        category,
        url: src.link,
        source: src.source || '',
      };
    })
    .filter(Boolean)
    .slice(0, 4);

  if (!items.length) {
    console.error('No items after processing — leaving news.json unchanged.');
    process.exit(0);
  }

  const out = { updated: new Date().toISOString().slice(0, 10), items };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote ' + OUT + ' with ' + items.length + ' items.');
}

main().catch((e) => { console.error(e); process.exit(1); });
