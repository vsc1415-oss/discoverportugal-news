// Daily evergreen-article generator for DiscoverPortugal.
// Builds an SEO-focused content library around high-traffic Portugal travel topics.
// Each run writes one full article (title + summary + HTML body) and accumulates
// them in news.json, which the website renders in the "Weekly Articles" blog.
// Once all topics exist, it refreshes the oldest one each day to keep the library current.
//
// Required env: ANTHROPIC_API_KEY  (GitHub Actions secret)
// Run: node fetch-news.mjs

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const MODEL = 'claude-haiku-4-5-20251001';
const OUT = 'news.json';
const PER_RUN = 1; // how many articles to (re)generate each run (one per day)

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

  // Lisboa
  { key: 'lisbon-things-to-do',     title: 'Best Things to Do in Lisbon: The Complete Guide', category: 'todo', city: 'Lisboa' },
  { key: 'lisbon-nightlife',        title: "Lisbon Nightlife: Bairro Alto, Cais do Sodre & Beyond", category: 'guides', city: 'Lisboa' },
  { key: 'lisbon-miradouros',       title: "Lisbon's Best Miradouros: A Viewpoint-by-Viewpoint Guide", category: 'todo', city: 'Lisboa' },
  { key: 'lisbon-neighborhoods',    title: 'Exploring Lisbon Neighbourhood by Neighbourhood', category: 'guides', city: 'Lisboa' },
  { key: 'lisbon-day-trips',        title: 'Best Day Trips from Lisbon', category: 'guides', city: 'Lisboa' },
  { key: 'lisbon-with-kids',        title: 'Lisbon with Kids: A Family Travel Guide', category: 'guides', city: 'Lisboa' },
  { key: 'lisbon-museums',          title: "Lisbon's Best Museums and Galleries", category: 'todo', city: 'Lisboa' },
  { key: 'lisbon-tram-28',          title: 'Riding Tram 28: The Complete Lisbon Tram Guide', category: 'todo', city: 'Lisboa' },
  { key: 'lisbon-fado',             title: 'Where to Hear Authentic Fado in Lisbon', category: 'guides', city: 'Lisboa' },
  { key: 'lisbon-street-food',      title: "Lisbon Street Food & Markets: A Local's Guide", category: 'restaurants', city: 'Lisboa' },
  { key: 'lisbon-shopping',         title: 'Where to Shop in Lisbon: From Chiado to LX Factory', category: 'guides', city: 'Lisboa' },
  { key: 'lx-factory-guide',        title: 'LX Factory: The Complete Visitor Guide', category: 'todo', city: 'Lisboa' },
  { key: 'belem-guide',             title: 'Belem: A Full Day Guide to Lisbon’s Historic Riverside', category: 'todo', city: 'Lisboa' },
  { key: 'alfama-guide',            title: 'Alfama: Getting Lost in Lisbon’s Oldest District', category: 'todo', city: 'Lisboa' },
  { key: 'lisbon-brunch',           title: 'Best Brunch and Coffee Spots in Lisbon', category: 'restaurants', city: 'Lisboa' },

  // Porto
  { key: 'best-restaurants-porto',  title: 'Best Restaurants in Porto 2026', category: 'restaurants', city: 'Porto' },
  { key: 'porto-things-to-do',      title: 'Best Things to Do in Porto: The Complete Guide', category: 'todo', city: 'Porto' },
  { key: 'porto-wine-cellars',      title: 'Porto Wine Cellars: Which Ones to Visit & What to Taste', category: 'guides', city: 'Porto' },
  { key: 'porto-day-trips',         title: 'Best Day Trips from Porto', category: 'guides', city: 'Porto' },
  { key: 'where-to-stay-porto',     title: 'Where to Stay in Porto: Complete Neighbourhood Guide', category: 'guides', city: 'Porto' },
  { key: 'porto-nightlife',         title: 'Porto Nightlife: Bars, Miradouros and Late-Night Eats', category: 'guides', city: 'Porto' },
  { key: 'douro-valley',            title: 'Douro Valley Day Trip: Wine, Views and River Cruises', category: 'guides', city: 'Porto' },
  { key: 'livraria-lello',          title: 'Livraria Lello: Visiting Porto’s Famous Bookshop', category: 'todo', city: 'Porto' },
  { key: 'porto-with-kids',         title: 'Porto with Kids: A Family Travel Guide', category: 'guides', city: 'Porto' },
  { key: 'porto-azulejos',          title: 'Porto’s Best Azulejo Tile Facades and Where to Find Them', category: 'todo', city: 'Porto' },
  { key: 'francesinha-guide',       title: 'The Francesinha: Where to Eat Porto’s Legendary Sandwich', category: 'restaurants', city: 'Porto' },

  // Sintra
  { key: 'pena-palace-guide',       title: 'Pena Palace: Complete Visitor Guide', category: 'todo', city: 'Sintra' },
  { key: 'quinta-regaleira-guide',  title: 'Quinta da Regaleira: Exploring the Initiation Well', category: 'todo', city: 'Sintra' },
  { key: 'best-restaurants-sintra', title: 'Best Restaurants in Sintra', category: 'restaurants', city: 'Sintra' },
  { key: 'sintra-hidden-trails',    title: "Sintra's Hidden Trails Beyond the Tourist Crowds", category: 'todo', city: 'Sintra' },
  { key: 'sintra-where-to-stay',    title: 'Where to Stay in Sintra: Village or Historic Centre?', category: 'guides', city: 'Sintra' },

  // Cascais
  { key: 'cascais-guide',           title: 'Cascais: The Complete Visitor Guide', category: 'guides', city: 'Cascais' },
  { key: 'best-beaches-cascais',    title: 'Best Beaches in Cascais and Estoril', category: 'todo', city: 'Cascais' },
  { key: 'cascais-day-trip',        title: 'Cascais Day Trip from Lisbon: Everything You Need to Know', category: 'guides', city: 'Cascais' },
  { key: 'guincho-beach',           title: 'Guincho Beach: Surfing, Wind and Wild Atlantic Views', category: 'todo', city: 'Cascais' },
  { key: 'boca-do-inferno',         title: "Boca do Inferno: Cascais's Dramatic Sea Cliffs", category: 'todo', city: 'Cascais' },

  // Algarve
  { key: 'best-restaurants-algarve', title: 'Best Restaurants in the Algarve', category: 'restaurants', city: 'Algarve' },
  { key: 'algarve-road-trip',       title: 'Algarve Road Trip: The Ultimate 5-Day Route', category: 'guides', city: 'Algarve' },
  { key: 'benagil-cave',            title: 'Benagil Cave: How to Visit & What to Expect', category: 'todo', city: 'Algarve' },
  { key: 'algarve-towns',           title: 'Best Algarve Towns: Lagos, Tavira, Albufeira & Sagres Compared', category: 'guides', city: 'Algarve' },
  { key: 'algarve-golf',            title: 'Golfing in the Algarve: Best Courses and Tips', category: 'guides', city: 'Algarve' },
  { key: 'algarve-with-kids',       title: 'Algarve with Kids: A Family Travel Guide', category: 'guides', city: 'Algarve' },
  { key: 'ponta-da-piedade',        title: 'Ponta da Piedade: Lagos’ Golden Cliffs and Sea Grottoes', category: 'todo', city: 'Algarve' },

  // Portugal-wide
  { key: 'portugal-public-holidays', title: 'Portugal Public Holidays: What to Know Before You Plan', category: 'guides', city: 'Portugal' },
  { key: 'portugal-safety',         title: 'Is Portugal Safe? A Practical Traveller’s Guide', category: 'guides', city: 'Portugal' },
  { key: 'portugal-tipping',        title: 'Tipping in Portugal: What’s Expected and What’s Not', category: 'guides', city: 'Portugal' },
  { key: 'portugal-sim-wifi',       title: 'Staying Connected in Portugal: SIM Cards, eSIMs & Wi-Fi', category: 'guides', city: 'Portugal' },
  { key: 'portugal-driving',        title: 'Driving in Portugal: Rules, Tolls and Tips', category: 'guides', city: 'Portugal' },
  { key: 'portugal-trains',         title: 'Travelling Portugal by Train: Routes, Passes and Tips', category: 'guides', city: 'Portugal' },
  { key: 'best-time-to-visit',      title: 'Best Time to Visit Portugal: A Season-by-Season Breakdown', category: 'guides', city: 'Portugal' },
  { key: 'portugal-wine-regions',   title: 'Portugal’s Best Wine Regions Beyond Porto', category: 'guides', city: 'Portugal' },
  { key: 'portugal-surfing',        title: 'Surfing in Portugal: Best Spots for Every Level', category: 'todo', city: 'Portugal' },
  { key: 'portugal-family-trip',    title: 'Planning a Family Trip to Portugal', category: 'guides', city: 'Portugal' },
  { key: 'portugal-solo-travel',    title: 'Solo Travel in Portugal: A Complete Guide', category: 'guides', city: 'Portugal' },
  { key: 'portugal-honeymoon',      title: 'Portugal Honeymoon: Best Romantic Spots', category: 'guides', city: 'Portugal' },
  { key: 'portugal-food-guide',     title: 'Portuguese Food 101: Dishes You Have to Try', category: 'restaurants', city: 'Portugal' },
  { key: 'pastel-de-nata-guide',    title: 'The Best Pastel de Nata in Portugal: A Tasting Guide', category: 'restaurants', city: 'Portugal' },
  { key: 'portugal-festivals',      title: 'Portugal’s Best Festivals Throughout the Year', category: 'guides', city: 'Portugal' },
  { key: 'portugal-packing-list',   title: 'What to Pack for Portugal: A Season-by-Season Checklist', category: 'guides', city: 'Portugal' },
  { key: 'portugal-costs',          title: 'How Much Does Portugal Really Cost? A Price Breakdown', category: 'guides', city: 'Portugal' },
  { key: 'portugal-vs-spain',       title: 'Portugal vs Spain: Which Should You Visit First?', category: 'guides', city: 'Portugal' },
  { key: 'azores-madeira',          title: 'Azores and Madeira: Are They Worth Adding to Your Trip?', category: 'guides', city: 'Portugal' },
  { key: 'coastal-towns',           title: 'Portugal’s Best Coastal Towns Outside the Algarve', category: 'todo', city: 'Portugal' },
  { key: 'evora-alentejo',          title: 'Evora and the Alentejo: Portugal’s Underrated Wine Country', category: 'guides', city: 'Portugal' },
  { key: 'coimbra-guide',           title: 'Coimbra: Portugal’s Historic University City', category: 'guides', city: 'Portugal' },
  { key: 'braga-guide',             title: 'Braga and Bom Jesus: A Perfect Day Trip from Porto', category: 'guides', city: 'Portugal' },
  { key: 'camino-portugues',        title: 'The Portuguese Camino: Walking to Santiago from Lisbon or Porto', category: 'guides', city: 'Portugal' },
  { key: 'portugal-history',        title: 'A Traveller’s Guide to Portuguese History', category: 'guides', city: 'Portugal' },
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
