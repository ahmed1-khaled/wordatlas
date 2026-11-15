(() => {
  "use strict";
  const WORDS = window.WORDS || [];
  const CATEGORIES = window.WORD_CATEGORIES || [];
  const API_BASE = "https://freedictionaryapi.com/api/v1/entries/en/";
  const TRANSLATE_API = "https://api.mymemory.translated.net/get";
  const $ = (selector) => document.querySelector(selector);
  const els = {
    search: $("#searchInput"), searchButton: $("#searchButton"), categoryList: $("#categoryList"), alphabet: $("#alphabetGrid"),
    wordList: $("#wordList"), listTitle: $("#listTitle"), resultSummary: $("#resultSummary"), localCount: $("#localCount"),
    detail: $("#detailContent"), closeDetail: $("#closeDetail"), favoriteCount: $("#favoriteCount"), toast: $("#toast"),
    topicBrowser: $("#topicBrowser"), topicSummary: $("#topicSummary"), subCategoryList: $("#subCategoryList"),
    loadMoreWrap: $("#loadMoreWrap"), loadMoreButton: $("#loadMoreButton"), translatePageButton: $("#translatePageButton")
  };
  const WIKI_API = "https://en.wiktionary.org/w/api.php";
  const state = {
    category: "technology", letter: "", query: "", mode: "all", selectedId: null,
    favorites: readStore("wordatlas-favorites", []), recent: readStore("wordatlas-recent", []),
    categoryStats: {},
    remote: { categoryId: null, title: "", label: "", path: [], words: [], subcategories: [], nextToken: null, totalPages: null, loading: false, error: "", requestId: 0 }
  };
  let translationCache = readObjectStore("wordatlas-translations", {});
  let toastTimer;
  let translatingPage = false;

  function readStore(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; }
    catch { return fallback; }
  }
  function saveStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing can disable storage */ } }
  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function readObjectStore(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === "object" && !Array.isArray(value) ? value : fallback; }
    catch { return fallback; }
  }
  function categoryById(id) { return CATEGORIES.find((category) => category.id === id); }
  function normalWordKey(word) { return String(word || "").trim().toLocaleLowerCase(); }
  function saveTranslation(word, translation) {
    const key = normalWordKey(word);
    if (!key || !translation || /لم تتوفر|تعذّر|not available|not found/i.test(translation)) return;
    translationCache[key] = translation;
    const keys = Object.keys(translationCache);
    if (keys.length > 700) {
      for (const oldKey of keys.slice(0, keys.length - 700)) delete translationCache[oldKey];
    }
    saveStore("wordatlas-translations", translationCache);
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2300);
  }
  async function wikiRequest(params) {
    const url = new URL(WIKI_API);
    const query = { ...params, format: "json", formatversion: 2, origin: "*" };
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Wiktionary returned HTTP " + response.status);
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "Wiktionary request failed");
    return data;
  }
  function displayCategoryTitle(title) {
    return String(title || "").replace(/^Category:en:/, "").replaceAll("_", " ").trim();
  }
  async function loadCategoryStats() {
    try {
      const titles = CATEGORIES.map((category) => "Category:en:" + category.wikiCategory).join("|");
      const data = await wikiRequest({ action: "query", prop: "categoryinfo", titles });
      const pages = Array.isArray(data.query?.pages) ? data.query.pages : Object.values(data.query?.pages || {});
      const byTitle = new Map(pages.map((page) => [page.title, page.categoryinfo || null]));
      for (const category of CATEGORIES) {
        const info = byTitle.get("Category:en:" + category.wikiCategory);
        if (info) state.categoryStats[category.id] = { pages: Number(info.pages || 0), subcats: Number(info.subcats || 0) };
      }
      renderCategories();
    } catch (error) {
      console.warn("Could not load Wiktionary category counts:", error);
    }
  }
  async function loadRemoteCategory(category, title, reset = true, path = null) {
    if (!category || !title) return;
    const previous = state.remote;
    const requestId = (previous.requestId || 0) + 1;
    if (reset) {
      state.remote = {
        categoryId: category.id, title, label: displayCategoryTitle(title),
        path: path || [title], words: [], subcategories: [], nextToken: null,
        totalPages: null, loading: true, error: "", requestId
      };
      state.selectedId = null;
      state.query = ""; state.letter = ""; state.mode = "all";
      els.search.value = "";
    } else {
      if (!previous.nextToken || previous.loading) return;
      state.remote = { ...previous, loading: true, error: "", requestId };
    }
    renderCategories();
    renderWordList();
    try {
      const snapshot = state.remote;
      const pageParams = {
        action: "query", list: "categorymembers", cmtitle: snapshot.title,
        cmtype: "page", cmlimit: 100
      };
      if (!reset && snapshot.nextToken) pageParams.cmcontinue = snapshot.nextToken;
      const requests = [wikiRequest(pageParams)];
      if (reset) {
        requests.push(wikiRequest({ action: "query", list: "categorymembers", cmtitle: snapshot.title, cmtype: "subcat", cmlimit: 100 }));
        requests.push(wikiRequest({ action: "query", prop: "categoryinfo", titles: snapshot.title }));
      }
      const results = await Promise.all(requests);
      if (state.remote.requestId !== requestId) return;
      const pageData = results[0];
      const startNumber = state.remote.words.length;
      const newWords = (pageData.query?.categorymembers || [])
        .filter((item) => item.ns === 0)
        .map((item, index) => {
          const en = String(item.title || "").replaceAll("_", " ");
          return {
            id: "wiki:" + item.pageid,
            number: startNumber + index + 1,
            en, ar: translationCache[normalWordKey(en)] || "",
            pos: "Wiktionary entry", category: category.id, pageId: item.pageid, source: "Wiktionary"
          };
        });
      let subcategories = state.remote.subcategories;
      let totalPages = state.remote.totalPages;
      if (reset) {
        subcategories = (results[1].query?.categorymembers || []).map((item) => ({
          title: item.title, label: displayCategoryTitle(item.title), pageId: item.pageid
        }));
        const infoPages = Array.isArray(results[2].query?.pages) ? results[2].query.pages : Object.values(results[2].query?.pages || {});
        const info = infoPages.find((page) => page.title === snapshot.title)?.categoryinfo;
        totalPages = info ? Number(info.pages || 0) : null;
        state.categoryStats[category.id] = {
          pages: totalPages ?? state.categoryStats[category.id]?.pages ?? 0,
          subcats: Number(info?.subcats ?? subcategories.length)
        };
      }
      state.remote = {
        ...state.remote,
        words: [...state.remote.words, ...newWords],
        subcategories,
        nextToken: pageData.continue?.cmcontinue || null,
        totalPages, loading: false, error: ""
      };
      renderCategories();
      renderWordList();
    } catch (error) {
      if (state.remote.requestId !== requestId) return;
      state.remote.loading = false;
      state.remote.error = error.message || "تعذّر تحميل هذا الفهرس من Wiktionary.";
      renderWordList();
    }
  }
  function renderCategories() {
    const allActive = state.category === "all";
    const allButton = `<button class="category-button ${allActive ? "active" : ""}" data-category="all" type="button"><span class="category-icon">✳</span><span class="category-names"><b>المفردات الأساسية</b><small>Starter words</small></span><span class="category-count">${WORDS.length}</span></button>`;
    const categoryButtons = CATEGORIES.map((category) => {
      const count = state.categoryStats[category.id]?.pages;
      const fallback = WORDS.filter((word) => word.category === category.id).length;
      const countText = count === undefined ? String(fallback) + "+" : Number(count).toLocaleString("en-US");
      return `<button class="category-button ${state.category === category.id ? "active" : ""}" data-category="${category.id}" type="button"><span class="category-icon">${escapeHTML(category.icon)}</span><span class="category-names"><b>${escapeHTML(category.ar)}</b><small>${escapeHTML(category.en)}</small></span><span class="category-count">${countText}</span></button>`;
    }).join("");
    els.categoryList.innerHTML = allButton + categoryButtons;
  }
  function renderAlphabet() {
    els.alphabet.innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `<button class="letter-button ${state.letter === letter ? "active" : ""}" type="button" data-letter="${letter}" aria-label="الحرف ${letter}">${letter}</button>`).join("");
  }
  function filteredWords() {
    const remoteActive = state.category !== "all" && state.remote.categoryId === state.category && state.mode === "all";
    let list = remoteActive ? [...state.remote.words] : [...WORDS];
    if (!remoteActive && state.category !== "all") list = list.filter((word) => word.category === state.category);
    if (state.letter) list = list.filter((word) => word.en.toUpperCase().startsWith(state.letter));
    if (state.mode === "favorites") list = list.filter((word) => state.favorites.includes(word.id));
    if (state.mode === "recent") list = state.recent.map((id) => WORDS.find((word) => word.id === id)).filter(Boolean);
    if (state.query) {
      const query = state.query.toLocaleLowerCase();
      list = list.filter((word) => word.en.toLocaleLowerCase().includes(query) || String(word.ar || "").toLocaleLowerCase().includes(query));
    }
    return list;
  }
  function updateListTitle() {
    const category = categoryById(state.category);
    if (state.mode === "favorites") els.listTitle.innerHTML = 'المفضلة <small>Saved words</small>';
    else if (state.mode === "recent") els.listTitle.innerHTML = 'الكلمات الأخيرة <small>Recently viewed</small>';
    else if (category) els.listTitle.innerHTML = `${escapeHTML(category.ar)} <small>${escapeHTML(category.en)}</small>`;
    else if (state.letter) els.listTitle.innerHTML = `كلمات تبدأ بحرف ${state.letter} <small>Words starting with ${state.letter}</small>`;
    else els.listTitle.innerHTML = 'كل الكلمات <small>All words</small>';
  }
  function renderWordList() {
    const remoteActive = state.category !== "all" && state.remote.categoryId === state.category && state.mode === "all";
    const list = filteredWords();
    updateListTitle();
    els.favoriteCount.textContent = String(state.favorites.length);
    document.querySelectorAll(".filter-pill").forEach((button) => button.classList.remove("active"));
    const currentTab = state.mode === "favorites" ? "#favoritesTab" : state.mode === "recent" ? "#recentTab" : "#allTab";
    $(currentTab)?.classList.add("active");

    if (els.topicBrowser) els.topicBrowser.hidden = !remoteActive;
    if (els.loadMoreWrap) els.loadMoreWrap.hidden = !remoteActive || !state.remote.nextToken;
    if (els.translatePageButton) {
      els.translatePageButton.hidden = !remoteActive || !state.remote.words.length;
      els.translatePageButton.disabled = translatingPage || !remoteActive || !state.remote.words.length;
      els.translatePageButton.textContent = translatingPage ? "جاري ترجمة الكلمات…" : "ترجمة أول 25 كلمة ظاهرة";
    }
    if (remoteActive) {
      const total = state.remote.totalPages === null ? "عدد المدخلات جارٍ التحقق منه" : Number(state.remote.totalPages).toLocaleString("en-US") + " مدخل في هذا المجال";
      const subCount = state.remote.subcategories.length;
      els.topicSummary.textContent = `${state.remote.label} · ${total} · ${subCount} قسمًا فرعيًا · عُرض ${state.remote.words.length.toLocaleString("en-US")}`;
      els.subCategoryList.innerHTML = state.remote.subcategories.length
        ? state.remote.subcategories.map((item) => `<button class="subcategory-chip" type="button" data-subcategory="${escapeHTML(item.title)}">${escapeHTML(item.label)}</button>`).join("")
        : '<span class="subcategory-empty">لا توجد أقسام فرعية مباشرة لهذا المجال.</span>';
      if (state.remote.loading && !state.remote.words.length) {
        els.wordList.innerHTML = '<div class="empty-list"><b>جارٍ تحميل كلمات المجال…</b>يتم جلب الفهرس المباشر من Wiktionary.</div>';
      } else if (state.remote.error && !state.remote.words.length) {
        els.wordList.innerHTML = `<div class="empty-list"><b>تعذّر تحميل الفهرس.</b>${escapeHTML(state.remote.error)}<br/><button type="button" id="retryCategory">إعادة المحاولة</button></div>`;
      } else if (!list.length) {
        els.wordList.innerHTML = '<div class="empty-list"><b>لا توجد نتائج مطابقة في الكلمات المحمّلة.</b>اكتب الكلمة واضغط Enter للبحث عنها مباشرة في القاموس.</div>';
      } else {
        els.wordList.innerHTML = list.map((word) => {
          const meaning = translationCache[normalWordKey(word.en)] || word.ar || "اضغط للحصول على الترجمة";
          return `<button class="word-row ${state.selectedId === word.id ? "active" : ""}" type="button" data-word-id="${escapeHTML(word.id)}" aria-label="${escapeHTML(word.en)} — ${escapeHTML(meaning)}">
            <span class="word-number">${String(word.number || 0).padStart(3, "0")}</span>
            <span class="word-en"><b>${escapeHTML(word.en)}</b><small>${escapeHTML(word.pos)}</small></span>
            <span class="word-ar ${translationCache[normalWordKey(word.en)] || word.ar ? "" : "translation-pending"}">${escapeHTML(meaning)}</span>
            <span class="word-type">EN</span>
          </button>`;
        }).join("");
      }
      els.resultSummary.textContent = `${state.remote.words.length.toLocaleString("en-US")} LOADED · ${state.remote.totalPages === null ? "LIVE CATEGORY INDEX" : state.remote.totalPages.toLocaleString("en-US") + " TOTAL ENTRIES"}`;
      if (els.loadMoreButton) {
        els.loadMoreButton.disabled = state.remote.loading;
        els.loadMoreButton.textContent = state.remote.loading ? "جارٍ التحميل…" : "تحميل 100 كلمة إضافية";
      }
      return;
    }

    if (!list.length) {
      els.wordList.innerHTML = `<div class="empty-list"><b>لا توجد كلمات في هذا الفهرس حتى الآن.</b>جرّب تغيير القسم أو الحرف، أو ابحث مباشرة من شريط البحث.<br/><button type="button" id="resetEmpty">عرض كل الكلمات</button></div>`;
    } else {
      els.wordList.innerHTML = list.map((word) => `
        <button class="word-row ${state.selectedId === word.id ? "active" : ""}" type="button" data-word-id="${word.id}" aria-label="${escapeHTML(word.en)} — ${escapeHTML(word.ar)}">
          <span class="word-number">${word.id}</span>
          <span class="word-en"><b>${escapeHTML(word.en)}</b><small>${escapeHTML(word.pos)}</small></span>
          <span class="word-ar">${escapeHTML(word.ar)}</span>
          <span class="word-type">${escapeHTML(word.pos)}</span>
        </button>`).join("");
    }
    const noun = list.length === 1 ? "WORD" : "WORDS";
    els.resultSummary.textContent = `${list.length} ${noun} · ${WORDS.length} STARTER WORDS`;
  }
  function updateActiveRow() {
    document.querySelectorAll(".word-row").forEach((row) => row.classList.toggle("active", row.dataset.wordId === state.selectedId));
  }
  function setMode(mode) { state.mode = mode; state.category = "all"; state.letter = ""; state.query = ""; els.search.value = ""; renderCategories(); renderAlphabet(); renderWordList(); }
  function addRecent(id) {
    state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 12);
    saveStore("wordatlas-recent", state.recent);
  }
  function getWordById(id) {
    return WORDS.find((word) => word.id === id) || state.remote.words.find((word) => word.id === id);
  }
  function flattenDefinitions(apiData) {
    const englishEntries = (apiData?.entries || []).filter((entry) => entry.language?.code === "en");
    const definitions = [];
    const translations = [];
    const synonyms = [];
    for (const entry of englishEntries) {
      if (entry.partOfSpeech && !definitions.length) { /* keep first useful group */ }
      for (const sense of (entry.senses || [])) {
        if (sense.definition && definitions.length < 3) definitions.push(sense.definition);
        for (const translation of (sense.translations || [])) {
          if (translation.language?.code === "ar" && translation.word) translations.push(translation.word);
        }
        for (const synonym of (sense.synonyms || [])) if (synonym && synonyms.length < 8) synonyms.push(synonym);
      }
    }
    return { definitions: [...new Set(definitions)], translations: [...new Set(translations)], synonyms: [...new Set(synonyms)] };
  }
  async function requestDictionary(word) {
    const response = await fetch(`${API_BASE}${encodeURIComponent(word)}?translations=true`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(response.status === 404 ? "Word was not found in the dictionary." : `Dictionary request failed (${response.status}).`);
    return response.json();
  }
  async function requestTranslation(word) {
    const params = new URLSearchParams({ q: word, langpair: "en|ar" });
    const response = await fetch(`${TRANSLATE_API}?${params.toString()}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Translation service is not available right now.");
    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    if (data?.responseStatus !== 200 || !translated) throw new Error("No Arabic translation was returned.");
    return decodeEntities(translated);
  }
  function decodeEntities(value) {
    const element = document.createElement("textarea"); element.innerHTML = value; return element.value;
  }
  function renderDetail(word, data = {}, loading = false, error = "") {
    const category = categoryById(word.category);
    const canSave = Boolean(word.id && word.id !== "API" && !String(word.id).startsWith("wiki:") && getWordById(word.id));
    const saved = canSave && state.favorites.includes(word.id);
    const meaning = data.translation || word.ar || "جارٍ البحث عن ترجمة عربية…";
    const definitions = data.definitions || [];
    const synonyms = data.synonyms || [];
    const example = data.example || "";
    els.detail.innerHTML = `
      <div class="word-detail">
        <div class="detail-number">WORD NO. ${escapeHTML(word.id || "API")} <span>·</span> ${escapeHTML(category?.en || "LIVE SEARCH")}</div>
        <div class="detail-word-top"><div><h3 dir="ltr">${escapeHTML(word.en)}</h3><div class="detail-word-ar">${escapeHTML(meaning)}</div></div>
          <div class="detail-actions">${canSave ? `<button class="mini-action ${saved ? "saved" : ""}" id="saveWord" type="button" aria-label="حفظ في المفضلة" title="Save word">${saved ? "♥" : "♡"}</button>` : ""}<button class="mini-action" id="copyWord" type="button" aria-label="نسخ الكلمة" title="Copy">⧉</button><button class="mini-action" id="speakWord" type="button" aria-label="استمع للنطق" title="Listen">◖))</button></div>
        </div>
        <div class="detail-tags"><span class="detail-tag">${escapeHTML(word.pos || "word")}</span><span class="detail-tag detail-category">${escapeHTML(category?.ar || "بحث مباشر")}</span></div>
        <section class="detail-section"><h4>المعنى والتعريف <small>MEANING & DEFINITION</small></h4>
          ${loading ? '<div class="detail-loading"><span class="spinner"></span> جاري تحميل التعريف من القاموس…</div>' : definitions.length ? `<div class="detail-definition">${definitions.map((item, index) => `<p><b>${index + 1}.</b> ${escapeHTML(item)}</p>`).join("")}</div>` : `<div class="detail-definition">${word.ar ? "A concise Arabic meaning is available in the starter index." : "لم يتوفر تعريف من مصدر القاموس لهذه الكلمة."}</div>`}
          ${example ? `<div class="detail-example">“${escapeHTML(example)}”</div>` : ""}
        </section>
        ${synonyms.length ? `<section class="detail-section"><h4>كلمات قريبة <small>SYNONYMS</small></h4><div class="detail-related">${synonyms.map((item) => `<button class="related-chip" data-related="${escapeHTML(item)}" type="button">${escapeHTML(item)}</button>`).join("")}</div></section>` : ""}
        ${error ? `<div class="detail-error">${escapeHTML(error)}</div>` : ""}
        <div class="api-source">Dictionary data by <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener">FreeDictionaryAPI</a> · sourced from <a href="https://en.wiktionary.org/wiki/${encodeURIComponent(word.en.replaceAll(" ", "_"))}" target="_blank" rel="noopener">Wiktionary</a> (CC BY-SA 4.0)</div>
      </div>`;
    $("#saveWord")?.addEventListener("click", () => toggleFavorite(word));
    $("#copyWord")?.addEventListener("click", async () => {
      const text = `${word.en} — ${meaning}`;
      try { await navigator.clipboard.writeText(text); showToast("تم نسخ الكلمة ومعناها"); } catch { showToast("تعذّر النسخ في هذا المتصفح"); }
    });
    $("#speakWord")?.addEventListener("click", () => {
      if (!("speechSynthesis" in window)) return showToast("ميزة النطق غير مدعومة في هذا المتصفح");
      const utterance = new SpeechSynthesisUtterance(word.en); utterance.lang = "en-US"; speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    });
    els.detail.querySelectorAll("[data-related]").forEach((button) => button.addEventListener("click", () => runLookup(button.dataset.related)));
  }
  async function selectWord(word, options = {}) {
    if (!word) return;
    state.selectedId = word.id;
    addRecent(word.id);
    updateActiveRow();
    const cachedTranslation = translationCache[normalWordKey(word.en)] || word.ar || "";
    renderDetail(word, { translation: cachedTranslation, definitions: [], synonyms: [] }, true);
    if (options.scroll !== false && window.innerWidth < 980) els.detail.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const data = await requestDictionary(word.en);
      const flattened = flattenDefinitions(data);
      let translation = flattened.translations[0] || cachedTranslation || "";
      if (!translation) {
        try { translation = await requestTranslation(word.en); } catch { translation = "لم تتوفر ترجمة عربية لهذه الكلمة."; }
      }
      saveTranslation(word.en, translation);
      const firstExample = data?.entries?.find((entry) => entry.language?.code === "en")?.senses?.find((sense) => sense.examples?.length)?.examples?.[0] || "";
      if (state.selectedId === word.id) {
        renderDetail(word, { translation, definitions: flattened.definitions, synonyms: flattened.synonyms, example: firstExample });
        renderWordList();
      }
    } catch (error) {
      let translation = cachedTranslation;
      let errorMessage = "";
      if (!translation) {
        try { translation = await requestTranslation(word.en); saveTranslation(word.en, translation); }
        catch { errorMessage = "تعذّر الاتصال بمصادر القاموس الآن. جرّب مرة أخرى لاحقًا أو راجع اتصال الإنترنت."; }
      } else {
        errorMessage = "تعذّر تحميل التعريف الإضافي الآن؛ المعنى الأساسي متاح من الفهرس.";
      }
      if (state.selectedId === word.id) {
        renderDetail(word, { translation, definitions: [], synonyms: [] }, false, errorMessage);
        renderWordList();
      }
    }
    els.favoriteCount.textContent = String(state.favorites.length);
  }
  function toggleFavorite(word) {
    if (state.favorites.includes(word.id)) state.favorites = state.favorites.filter((id) => id !== word.id);
    else state.favorites = [word.id, ...state.favorites];
    saveStore("wordatlas-favorites", state.favorites);
    renderWordList(); renderCategories();
    if (state.selectedId === word.id) {
      const translation = els.detail.querySelector(".detail-word-ar")?.textContent || word.ar;
      renderDetail(word, { translation, definitions: [], synonyms: [] });
    }
    showToast(state.favorites.includes(word.id) ? "أُضيفت الكلمة إلى المفضلة" : "أُزيلت الكلمة من المفضلة");
  }
  async function runLookup(raw) {
    const query = String(raw || "").trim();
    if (!query) return showToast("اكتب كلمة للبحث أولًا");
    const remoteMatch = state.remote.words.find((word) => word.en.toLocaleLowerCase() === query.toLocaleLowerCase());
    if (remoteMatch) {
      state.category = state.remote.categoryId;
      state.query = query; state.letter = ""; state.mode = "all";
      renderCategories(); renderWordList(); selectWord(remoteMatch);
      return;
    }
    const exact = WORDS.find((word) => word.en.toLowerCase() === query.toLowerCase() || word.ar === query);
    if (exact) {
      state.category = "all"; state.letter = ""; state.query = query; state.mode = "all";
      renderCategories(); renderAlphabet(); renderWordList();
      selectWord(exact);
      return;
    }
    const match = WORDS.find((word) => word.en.toLowerCase().includes(query.toLowerCase()) || word.ar.includes(query));
    if (match && /^[\u0600-\u06FF\s]+$/.test(query)) {
      state.category = "all"; state.letter = ""; state.query = query; state.mode = "all";
      renderCategories(); renderAlphabet(); renderWordList();
      selectWord(match);
      return;
    }
    state.category = "all"; state.letter = ""; state.mode = "all"; state.query = query;
    renderCategories(); renderAlphabet(); renderWordList();
    const temp = { id: "API", en: query, ar: "", pos: "live lookup", category: "" };
    state.selectedId = "API";
    renderDetail(temp, {}, true);
    try {
      const data = await requestDictionary(query);
      const flattened = flattenDefinitions(data);
      let translation = flattened.translations[0] || "";
      if (!translation) translation = await requestTranslation(query);
      saveTranslation(query, translation);
      const firstExample = data?.entries?.find((entry) => entry.language?.code === "en")?.senses?.find((sense) => sense.examples?.length)?.examples?.[0] || "";
      renderDetail(temp, { translation, definitions: flattened.definitions, synonyms: flattened.synonyms, example: firstExample });
      showToast("تم العثور على الكلمة من القاموس المفتوح");
    } catch (error) {
      let translation = "";
      try { translation = await requestTranslation(query); saveTranslation(query, translation); } catch { /* handled below */ }
      renderDetail(temp, { translation, definitions: [] }, false, translation ? "لم يتوفر تعريف إضافي لهذه الكلمة." : "لم نجد الكلمة في مصادر البحث. جرّب كتابة الكلمة الإنجليزية فقط أو التأكد من الإملاء.");
    }
  }

  async function translateCurrentPage() {
    if (translatingPage || !state.remote.words.length) return;
    const targets = state.remote.words
      .filter((word) => !translationCache[normalWordKey(word.en)])
      .slice(0, 25);
    if (!targets.length) return showToast("ترجمات أول 25 كلمة محفوظة بالفعل");
    translatingPage = true;
    renderWordList();
    let completed = 0;
    for (let index = 0; index < targets.length; index += 2) {
      const batch = targets.slice(index, index + 2);
      await Promise.all(batch.map(async (word) => {
        try {
          const data = await requestDictionary(word.en);
          const translated = flattenDefinitions(data).translations[0] || await requestTranslation(word.en);
          saveTranslation(word.en, translated);
        } catch (error) {
          try { saveTranslation(word.en, await requestTranslation(word.en)); } catch { /* leave this word for manual lookup */ }
        }
        completed += 1;
        if (completed % 4 === 0 || completed === targets.length) {
          els.translatePageButton.textContent = `جاري الترجمة ${completed}/${targets.length}`;
          renderWordList();
        }
      }));
    }
    translatingPage = false;
    renderWordList();
    showToast(`اكتملت محاولة ترجمة ${targets.length} كلمة؛ راجع الكلمات التي لم تتوفر لها ترجمة`);
  }

  els.categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]"); if (!button) return;
    const id = button.dataset.category;
    state.category = id; state.letter = ""; state.query = ""; state.mode = "all"; els.search.value = "";
    if (id === "all") {
      state.remote = { ...state.remote, requestId: state.remote.requestId + 1 };
      renderCategories(); renderAlphabet(); renderWordList();
    } else {
      const category = categoryById(id);
      if (category?.wikiCategory) loadRemoteCategory(category, "Category:en:" + category.wikiCategory, true);
      else { renderCategories(); renderAlphabet(); renderWordList(); }
    }
  });
  els.subCategoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-subcategory]"); if (!button) return;
    const category = categoryById(state.category);
    const nextPath = [...state.remote.path, button.dataset.subcategory];
    loadRemoteCategory(category, button.dataset.subcategory, true, nextPath);
  });
  els.loadMoreButton.addEventListener("click", () => loadRemoteCategory(categoryById(state.category), state.remote.title, false, state.remote.path));
  els.translatePageButton.addEventListener("click", translateCurrentPage);
  els.alphabet.addEventListener("click", (event) => {
    const button = event.target.closest("[data-letter]"); if (!button) return;
    state.letter = state.letter === button.dataset.letter ? "" : button.dataset.letter;
    state.query = ""; state.mode = "all"; els.search.value = "";
    renderAlphabet(); renderWordList();
  });
  els.wordList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-word-id]");
    if (button) {
      const word = getWordById(button.dataset.wordId);
      if (word) selectWord(word);
    }
    if (event.target.id === "resetEmpty") { state.category = "all"; state.letter = ""; state.query = ""; state.mode = "all"; renderCategories(); renderAlphabet(); renderWordList(); }
    if (event.target.id === "retryCategory") loadRemoteCategory(categoryById(state.category), state.remote.title, true, state.remote.path);
  });
  els.search.addEventListener("input", () => {
    state.query = els.search.value.trim(); state.letter = ""; state.mode = "all";
    renderAlphabet(); renderWordList();
  });
  els.search.addEventListener("keydown", (event) => { if (event.key === "Enter") runLookup(els.search.value); if (event.key === "Escape") { els.search.value = ""; state.query = ""; renderWordList(); } });
  els.searchButton.addEventListener("click", () => runLookup(els.search.value));
  document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => { els.search.value = button.dataset.query; runLookup(button.dataset.query); }));
  $("#allTab").addEventListener("click", () => setMode("all"));
  $("#favoritesTab").addEventListener("click", () => setMode("favorites"));
  $("#recentTab").addEventListener("click", () => setMode("recent"));
  $("#favoritesShortcut").addEventListener("click", () => { setMode("favorites"); $("#dictionary").scrollIntoView({ behavior: "smooth" }); });
  $("#clearFilters").addEventListener("click", () => { state.category = "all"; state.letter = ""; state.query = ""; state.mode = "all"; els.search.value = ""; renderCategories(); renderAlphabet(); renderWordList(); });
  els.closeDetail.addEventListener("click", () => { els.detail.innerHTML = `<div class="empty-detail-art"><span>ع</span><i>↔</i><span>A</span></div><p class="empty-kicker">A WORD IS A BEGINNING</p><h3>اختر كلمة<br /><em>لتكتشف معناها.</em></h3><p class="empty-desc">Select any word from the index to explore its meaning, usage, and related vocabulary.</p>`; });
  document.addEventListener("keydown", (event) => { if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); els.search.focus(); } });

  els.localCount.textContent = WORDS.length.toLocaleString("en-US");
  renderCategories(); renderAlphabet(); renderWordList();
  loadCategoryStats();
  const initialCategory = categoryById("technology");
  if (initialCategory) loadRemoteCategory(initialCategory, "Category:en:" + initialCategory.wikiCategory, true);
})();
