# WordAtlas — English × Arabic Dictionary

WordAtlas is a bilingual English–Arabic vocabulary browser. It includes a curated starter index, 12 topic collections, A–Z filtering, favorites, recent words, speech playback, and live word lookup.

## Features

- English and Arabic presented side by side.
- Numbered starter index with category and alphabetical filters.
- Search the local index in English or Arabic.
- Look up words outside the starter index through a public dictionary API.
- Arabic translations are read from the dictionary data when available, with MyMemory used as a translation fallback.
- Definitions, examples, and synonyms are shown when returned by the dictionary source.
- Favorites and recently viewed words are saved locally in the browser.
- Responsive layout for desktop, tablet, and mobile.

## Data sources

- [FreeDictionaryAPI](https://freedictionaryapi.com/) — open dictionary API sourced from English Wiktionary. It requires no API key and documents a limit of 1,000 requests per hour per IP. Dictionary content is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [MyMemory Translation API](https://mymemory.translated.net/doc/spec.php) — translation fallback for cases where the dictionary entry has no Arabic equivalent. Anonymous usage is limited to 5,000 characters per day; see [official usage limits](https://mymemory.translated.net/doc/usagelimits.php).
- [Wiktionary](https://en.wiktionary.org/) — source dictionary and attribution links are provided in each word card.

## Deploy to GitHub Pages

1. Create a new public repository named `wordatlas` under your GitHub account.
2. Upload the **contents of this folder** to the repository root (so `index.html` and `.github/` are at the top level).
3. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. Push to `main`, or run the **Deploy WordAtlas to GitHub Pages** workflow manually from the Actions tab.
5. GitHub will publish the site at `https://YOUR-USERNAME.github.io/wordatlas/` after the workflow succeeds.

The workflow is included at `.github/workflows/deploy.yml`. GitHub Pages must be enabled for the repository before the first deployment.

## Important note about coverage

No practical static website can include every English word and every possible meaning in a single hand-maintained list. The local index is a curated learning catalogue organized into 12 subjects. The live lookup is intended to extend that catalogue to words beyond the preloaded index. API translations and definitions depend on availability in the upstream sources and may not exist for every word.

## Run locally

Open `index.html` in a modern browser. An internet connection is needed for live dictionary lookups, fonts, and translation fallback. No build step or API key is required.

## Files

- `index.html` — page structure and metadata
- `styles.css` — responsive visual design
- `words.js` — curated bilingual index and categories
- `app.js` — filtering, favorites, local search, dictionary API, translation fallback, and word details

## Attribution

Dictionary content displayed from FreeDictionaryAPI/Wiktionary retains source links and license references. See the provider's [attribution requirements](https://freedictionaryapi.com/).
