# DiscoverPortugal — Weekly News Bot

Automatically publishes fresh Portugal travel news to the website every week.

**How it works**
1. A GitHub Action runs every Monday (06:00 UTC).
2. `fetch-news.mjs` pulls real headlines from Google News RSS.
3. The Claude API picks the 4 most relevant travel items and writes a clean
   title + one-sentence summary for each.
4. The result is committed to `news.json`.
5. The website reads `news.json` directly from GitHub — no redeploy needed.

## One-time setup

1. **Create the API key** at <https://console.anthropic.com> → *API Keys*.
2. In this repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: the key from step 1
3. On the website, `NEWS_FEED_URL` in `index.html` is already set to:
   `https://raw.githubusercontent.com/vsc1415-oss/discoverportugal-news/main/news.json`
4. Run it once now: **Actions → Weekly Portugal news → Run workflow**.

## Test locally

```bash
ANTHROPIC_API_KEY=sk-ant-... node fetch-news.mjs
```

## Notes
- The bot only ever **summarises real headlines** — it does not invent news.
- If no headlines are found, `news.json` is left unchanged (the site keeps the
  previous week's items).
- Cost is a few cents per run (Claude Haiku, once a week).
