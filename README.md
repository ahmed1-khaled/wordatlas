# WordAtlas — English × Arabic Vocabulary Atlas

WordAtlas is a bilingual English–Arabic vocabulary explorer built around live Wiktionary topic indexes and word-level dictionary lookup.

## What the site contains

- **23 topic collections**: Computing, Medicine, Business, Finance, Science, Education, Home, Travel, Nature, Food, Communication, Psychology, Law, Engineering, Mathematics, Art, Music, Sports, Linguistics, Politics, History, Agriculture and Architecture.
- Each topic loads its English entries from the corresponding English Wiktionary category.
- **100 entries per page**, with continuation tokens so large indexes are browsed in manageable batches.
- Subcategory navigation exposes more specific subjects such as related areas within Computing, Medicine, Business, Sciences, Architecture and more.
- The number of pages in each selected category is requested from Wiktionary at runtime.
- Arabic translations are looked up per selected word. FreeDictionaryAPI is checked first; MyMemory is used only as a fallback.
- The first 25 untranslated entries in the current batch can be translated on demand. Successful translations are cached in the browser to reduce repeat API requests.
- A 168-word curated starter list remains available under **Starter words**.
- A–Z filtering, favorites, recent words, pronunciation, copy, definitions, examples and synonyms.

## Important scope and data accuracy

FreeDictionaryAPI advertises **8.5 million+ entries across Wiktionary languages**. This is a multilingual corpus size, **not 8.5 million English-to-Arabic translations**. WordAtlas therefore uses that figure only as a multilingual source statistic. Actual English-to-Arabic availability varies by word and sense; a word may have a direct Wiktionary translation, an optional machine-translation fallback, or no Arabic translation available.

Topic-category counts are live Wiktionary counts and may change as contributors add or remove entries. They are not a count of unique words across the whole site: one entry may belong to several topics, and some pages may be names, abbreviations, or multi-word expressions.

## Data sources and licenses

- **Wiktionary** topic categories and lexical data: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). Each dictionary detail links back to the matching Wiktionary entry.
- **FreeDictionaryAPI** provides structured English dictionary responses sourced from Wiktionary. It requests no API key and documents a rate limit of 1,000 requests per hour per IP. Attribution is shown in the site.
- **MyMemory** is an optional machine-translation fallback. Machine output is not represented as human-reviewed dictionary content.

Because Wiktionary data is licensed under CC BY-SA 4.0, adaptations must preserve attribution and share-alike requirements. See the linked source pages and licenses for full conditions.

## How browsing works

1. Select one of the 23 topics.
2. WordAtlas requests the topic's category count, direct entries and subcategories from the Wiktionary MediaWiki API.
3. The first 100 entries appear with a numbered index. Use **Load 100 more** to continue.
4. Select a subcategory chip to explore a more specific topic.
5. Select a word to load its definition and Arabic translation. Use the optional batch translation action for the first 25 entries in the current batch.

The category API is read-only and uses public CORS access. Continuation tokens are passed back to MediaWiki as documented; the app does not attempt to download the entire Wiktionary dump into the browser.

## Deploy

The project is a static site and deploys through the GitHub Pages workflow in the repository. In repository Settings → Pages, set the source to **GitHub Actions**. The repository also includes a small validation workflow that checks JavaScript syntax and required HTML hooks.

## Links

- [Wiktionary](https://en.wiktionary.org/)
- [MediaWiki Categorymembers API](https://www.mediawiki.org/wiki/API:Categorymembers)
- [MediaWiki API:Continue](https://www.mediawiki.org/wiki/API:Continue)
- [FreeDictionaryAPI](https://freedictionaryapi.com/)
- [MyMemory](https://mymemory.translated.net/)
- [Creative Commons BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)


## Google Sign-In (Firebase Authentication)

The repository includes a ready-to-configure Google sign-in interface. Authentication is intentionally not active until the owner connects a Firebase project.

1. Create a Firebase project at https://console.firebase.google.com/.
2. Open **Authentication → Sign-in method** and enable **Google**. Choose a project support email and save.
3. In **Project settings → General → Your apps**, add a Web app and copy its Firebase configuration object.
4. In **Authentication → Settings → Authorized domains**, add `ahmed1-khaled.github.io`.
5. Put the web config values in `firebase-config.js` (apiKey, authDomain, projectId, appId). These Firebase web config values are public project identifiers; do not put service-account keys or OAuth client secrets in the website.
6. Commit and push the updated `firebase-config.js`, then open the deployed site and test the Google button.

The site uses Firebase's official browser SDK and Google provider. Successful sign-in identifies the visitor and keeps the browser session persistent. **Favorites and recent-word history remain in the current browser's local storage**; Google login does not synchronize them across devices yet. Cloud sync would require a Firestore database and user-scoped Security Rules.

Official guides:
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/start
- https://firebase.google.com/docs/auth/faq-and-troubleshooting

