# Phigros RKS Calculator

A static Phigros RKS calculator for GitHub Pages.

## Data source: Phigros Wiki

The chart database is **scraped directly from the Phigros Wiki's `Phigros Wiki:Song Data` page**, not from the `sakimidare/Phigros` repository.

The scraper uses the Wiki's MediaWiki API and extracts the JSON stored in that page.

- Wiki page: https://phigros.fandom.com/wiki/Phigros_Wiki:Song_Data
- Scraper: `scripts/scrape-wiki.mjs`
- Generated dataset: `songs.json`

A GitHub Action runs every day and can also be triggered manually from **Actions → Update Phigros Wiki data → Run workflow**.

This means the site can pick up new Phigros versions as soon as the Wiki's Song Data is updated, without requiring a code change.

## GitHub Pages setup

Upload the repository contents, then:

1. Open **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Select your main branch and `/ (root)`.
4. Save.

The calculator itself is entirely client-side.

## Local scraper

You need Node.js 22+.

```bash
node scripts/scrape-wiki.mjs
```

This creates/updates `songs.json`.

## RKS

The calculator follows the Wiki's current B27 + P3 definition:

- ACC < 70% → chart RKS = 0
- Otherwise:

`chart RKS = constant × ((ACC - 55) / 45)^2`

- B27 = the 27 highest chart RKS values
- P3 = the 3 highest-constant eligible charts with 100% ACC
- B27 and P3 are independent, so a chart can occur in both
- Final RKS = `(B27 sum + P3 sum) / 30`

Only regular **EZ / HD / IN / AT** charts are RKS-eligible. Legacy and SP charts are still displayed when present, but are marked as not used for RKS.

## Score storage

ACCs are saved in the browser's `localStorage`. They are never uploaded to GitHub.

Use **Export scores** to create a JSON backup and **Import scores** to restore it.

## Why not scrape at page-load?

GitHub Pages is static hosting. Scraping the Wiki during a GitHub Action gives us a stable local `songs.json`, avoids making every visitor depend on Fandom's availability/CORS at that moment, and lets GitHub Pages serve the calculator normally.

The daily Action keeps that local dataset synchronized with the Wiki.
