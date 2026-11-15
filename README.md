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


## Google Sign-In and private member profiles

The public landing page is available to visitors. The dictionary interface and its data scripts are loaded only after successful Google Authentication.

### Firebase Authentication

1. In Firebase Console, open Authentication → Sign-in method and enable Google.
2. In Authentication → Settings → Authorised domains, add `ahmed1-khaled.github.io`.
3. The Web App configuration for project `wordatlas-ced42` is already installed in `firebase-config.js`.
4. Keep the `authDomain` value as `wordatlas-ced42.firebaseapp.com`; the site uses popup sign-in as the primary flow.

### Firestore profile storage

1. In Firebase Console, open Build → Firestore Database and create the default database in a region appropriate for your users.
2. Open the Rules tab and publish the exact contents of `firestore.rules` from this repository.
3. The app stores one document at `users/{Firebase Auth UID}` with the user's UID, Google display name, email, photo URL, provider ID, creation time, last sign-in time and update time.
4. Rules allow a signed-in user to read, create, update or delete only their own profile document. Listing all user profiles is not allowed.
5. A Firestore permission or setup error does not cancel a successful Google sign-in; the profile screen shows the database error instead.

### Privacy and hosting boundary

The landing page does not render the dictionary or load the dictionary scripts for signed-out visitors. After login, the app loads `words.js`, `app.js` and `enhancements.js`.

This is a front-end access gate, not a way to make a public GitHub Pages repository or its static source files secret. Anyone who can access a public repository can still inspect its published HTML, CSS and JavaScript. Do not put confidential vocabulary, passwords, service-account JSON, private keys or other secrets in these files. Firebase profile documents are protected by Firestore Security Rules.

Google profile fields are received from Firebase Authentication; no Google password is collected by WordAtlas. Favorites and recent-word history are still stored in the current browser's local storage and are not yet synced between devices.

### Official documentation

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/firestore/quickstart
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/security/get-started
- https://www.pexels.com/license/
