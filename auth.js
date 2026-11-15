import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

(async () => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const config = window.WORDATLAS_FIREBASE_CONFIG || {};
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const configured = required.every((key) => {
    const value = String(config[key] || "");
    return value && !value.startsWith("PASTE_") && !value.startsWith("YOUR_");
  });

  const ui = {
    landing: $("#publicLanding"),
    landingButtons: [
      $("#landingLoginButton"),
      $("#landingLoginButtonSecondary"),
      $("#landingLoginButtonBottom")
    ].filter(Boolean),
    memberApp: $("#memberApp"),
    main: $("#top"),
    profilePage: $("#profilePage"),
    profileOpen: $("#profileOpen"),
    profileMenuButton: $("#profileMenuButton"),
    backToDictionary: $("#backToDictionary"),
    backToDictionaryBottom: $("#backToDictionaryBottom"),
    profileSignOut: $("#profileSignOut"),
    profileAvatar: $("#profileAvatar"),
    profileName: $("#profileName"),
    profileEmail: $("#profileEmail"),
    profileDisplayName: $("#profileDisplayName"),
    profileDisplayEmail: $("#profileDisplayEmail"),
    profileProvider: $("#profileProvider"),
    profileSaveStatus: $("#profileSaveStatus"),
    trigger: $("#authTrigger"),
    triggerLabel: $("#authTriggerLabel"),
    accountButton: $("#accountButton"),
    accountAvatar: $("#accountAvatar"),
    accountButtonName: $("#accountButtonName"),
    accountMenu: $("#accountMenu"),
    accountMenuNote: $("#accountMenuNote"),
    menuAvatar: $("#menuAvatar"),
    accountName: $("#accountName"),
    accountEmail: $("#accountEmail"),
    signOut: $("#signOutButton"),
    overlay: $("#authOverlay"),
    close: $("#closeAuthButton"),
    google: $("#googleSignInButton"),
    status: $("#authStatus")
  };

  let auth = null;
  let db = null;
  let provider = null;
  let currentUser = null;
  let protectedAppPromise = null;
  let signingIn = false;

  function setStatus(message, kind = "") {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.className = "auth-status" + (kind ? " " + kind : "");
  }

  function setProfileStatus(message, kind = "") {
    if (ui.profileSaveStatus) {
      ui.profileSaveStatus.textContent = message;
      ui.profileSaveStatus.className = "profile-save-status" + (kind ? " " + kind : "");
    }
    if (ui.accountMenuNote) ui.accountMenuNote.textContent = message;
  }

  function openAuthModal() {
    if (!ui.overlay) return;
    if (ui.accountMenu) ui.accountMenu.hidden = true;
    ui.overlay.hidden = false;
    document.body.classList.add("modal-open");
    if (ui.close) ui.close.focus();
    if (!configured) {
      setStatus("إعداد Firebase غير مكتمل. راجع ملف firebase-config.js.", "error");
      if (ui.google) ui.google.disabled = true;
    }
  }

  function closeAuthModal() {
    if (!ui.overlay) return;
    ui.overlay.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function setAvatar(target, user) {
    if (!target) return;
    target.replaceChildren();
    if (user.photoURL) {
      const image = document.createElement("img");
      image.src = user.photoURL;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.loading = "eager";
      image.addEventListener("error", () => {
        target.replaceChildren(document.createTextNode(
          (user.displayName || user.email || "A").trim().charAt(0).toUpperCase()
        ));
      }, { once: true });
      target.append(image);
    } else {
      target.textContent = (user.displayName || user.email || "A").trim().charAt(0).toUpperCase();
    }
  }

  function renderProfile(user) {
    if (!user) return;
    const name = user.displayName || (user.email ? user.email.split("@")[0] : "WordAtlas member");
    const email = user.email || "No email supplied by Google";
    setAvatar(ui.accountAvatar, user);
    setAvatar(ui.menuAvatar, user);
    setAvatar(ui.profileAvatar, user);
    if (ui.accountButtonName) ui.accountButtonName.textContent = name.split(" ")[0];
    if (ui.accountName) ui.accountName.textContent = name;
    if (ui.accountEmail) ui.accountEmail.textContent = email;
    if (ui.profileName) ui.profileName.textContent = name;
    if (ui.profileEmail) ui.profileEmail.textContent = email;
    if (ui.profileDisplayName) ui.profileDisplayName.textContent = name;
    if (ui.profileDisplayEmail) ui.profileDisplayEmail.textContent = email;
    if (ui.profileProvider) {
      const providerId = user.providerData?.[0]?.providerId || "google.com";
      ui.profileProvider.textContent = providerId === "google.com" ? "Google Account" : providerId;
    }
  }

  function showPublicLanding() {
    if (ui.landing) ui.landing.hidden = false;
    if (ui.memberApp) ui.memberApp.hidden = true;
    if (ui.profilePage) ui.profilePage.hidden = true;
    if (ui.main) ui.main.hidden = false;
    document.body.classList.remove("member-ready");
    closeAuthModal();
  }

  function showMemberApp() {
    if (ui.landing) ui.landing.hidden = true;
    if (ui.memberApp) ui.memberApp.hidden = false;
    document.body.classList.add("member-ready");
  }

  async function loadScript(path) {
    const existing = document.querySelector('script[data-protected-script="' + path + '"]');
    if (existing) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(path, window.location.href).href;
      script.dataset.protectedScript = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error("تعذّر تحميل الملف " + path));
      document.body.append(script);
    });
  }

  async function loadProtectedApp() {
    showMemberApp();
    if (protectedAppPromise) return protectedAppPromise;
    protectedAppPromise = (async () => {
      await loadScript("words.js");
      await loadScript("app.js");
      await loadScript("enhancements.js");
    })();
    try {
      await protectedAppPromise;
    } catch (error) {
      protectedAppPromise = null;
      setStatus("تم تسجيل الدخول، لكن تعذّر تحميل القاموس. حدّث الصفحة وحاول مرة أخرى.", "error");
      console.error("WordAtlas protected app loading error:", error);
      throw error;
    }
  }

  function openProfile() {
    if (!currentUser) {
      openAuthModal();
      return;
    }
    if (ui.main) ui.main.hidden = true;
    if (ui.profilePage) ui.profilePage.hidden = false;
    if (ui.accountMenu) ui.accountMenu.hidden = true;
    renderProfile(currentUser);
    ui.profilePage?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function backToDictionary() {
    if (ui.profilePage) ui.profilePage.hidden = true;
    if (ui.main) ui.main.hidden = false;
    ui.main?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateAccount(user) {
    currentUser = user || null;
    if (!user) {
      if (ui.trigger) ui.trigger.hidden = false;
      if (ui.triggerLabel) ui.triggerLabel.textContent = "الدخول بحساب Google";
      if (ui.accountButton) ui.accountButton.hidden = true;
      if (ui.accountMenu) ui.accountMenu.hidden = true;
      if (ui.profileOpen) ui.profileOpen.hidden = true;
      showPublicLanding();
      return;
    }
    if (ui.trigger) ui.trigger.hidden = true;
    if (ui.accountButton) ui.accountButton.hidden = false;
    if (ui.profileOpen) ui.profileOpen.hidden = false;
    if (ui.profilePage) ui.profilePage.hidden = true;
    if (ui.main) ui.main.hidden = false;
    renderProfile(user);
    showMemberApp();
    closeAuthModal();
  }

  function friendlyError(error) {
    const code = error?.code || "";
    const messages = {
      "auth/unauthorized-domain": "نطاق الموقع غير مضاف في Firebase Authorized domains. تأكد من النطاق الذي يظهر في شريط العنوان.",
      "auth/operation-not-allowed": "Google Sign-In غير مفعّل في Firebase Authentication → Sign-in method.",
      "auth/popup-blocked": "المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة للموقع ثم حاول مرة أخرى.",
      "auth/popup-closed-by-user": "تم إغلاق نافذة Google قبل اكتمال تسجيل الدخول.",
      "auth/cancelled-popup-request": "هناك محاولة تسجيل دخول أخرى مفتوحة بالفعل.",
      "auth/network-request-failed": "تعذّر الاتصال بخدمة Google/Firebase. تحقق من الإنترنت وحاول مجددًا.",
      "auth/invalid-api-key": "Firebase API key غير صحيح. راجع firebase-config.js.",
      "auth/app-not-authorized": "تطبيق الويب أو نطاقه غير مصرح به في إعدادات Firebase.",
      "auth/too-many-requests": "تم إيقاف المحاولات مؤقتًا بسبب تكرارها. انتظر قليلًا ثم حاول.",
      "auth/account-exists-with-different-credential": "هذا البريد مرتبط بطريقة دخول مختلفة في Firebase."
    };
    const message = messages[code] || error?.message || "حدث خطأ غير معروف أثناء تسجيل الدخول.";
    return code ? message + " (" + code + ")" : message;
  }

  function friendlyProfileError(error) {
    const code = error?.code || "";
    if (code.includes("permission-denied")) {
      return "تم تسجيل الدخول، لكن Firestore رفض حفظ الملف. أنشئ قاعدة البيانات وانشر قواعد firestore.rules.";
    }
    if (code.includes("failed-precondition") || code.includes("unavailable") || code.includes("not-found")) {
      return "تم تسجيل الدخول، لكن قاعدة Firestore غير جاهزة أو غير متاحة بعد.";
    }
    return "تم تسجيل الدخول، لكن تعذّر حفظ الملف الشخصي في Firestore (" + (code || "unknown") + ").";
  }

  async function saveUserProfile(user) {
    if (!db || !user) throw new Error("Firestore is not initialised.");
    const profileRef = doc(db, "users", user.uid);
    const existing = await getDoc(profileRef);
    const profile = {
      uid: user.uid,
      displayName: user.displayName || (user.email ? user.email.split("@")[0] : "WordAtlas member"),
      email: user.email || "",
      photoURL: user.photoURL || null,
      providerId: user.providerData?.[0]?.providerId || "google.com",
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (!existing.exists()) profile.createdAt = serverTimestamp();
    await setDoc(profileRef, profile, { merge: true });
    setProfileStatus("تم حفظ ملفك الشخصي في قاعدة البيانات", "success");
  }

  async function handleSignOut() {
    if (!auth) return;
    try {
      await signOut(auth);
      setStatus("تم تسجيل الخروج.", "success");
    } catch (error) {
      console.error("WordAtlas sign-out error:", error);
      setStatus(friendlyError(error), "error");
    }
  }

  if (ui.landingButtons.length) {
    ui.landingButtons.forEach((button) => button.addEventListener("click", openAuthModal));
  }
  ui.trigger?.addEventListener("click", () => {
    if (currentUser) {
      if (ui.accountMenu) ui.accountMenu.hidden = !ui.accountMenu.hidden;
    } else {
      openAuthModal();
    }
  });
  ui.accountButton?.addEventListener("click", () => {
    if (ui.accountMenu) ui.accountMenu.hidden = !ui.accountMenu.hidden;
  });
  ui.profileOpen?.addEventListener("click", (event) => {
    event.preventDefault();
    openProfile();
  });
  ui.profileMenuButton?.addEventListener("click", openProfile);
  ui.backToDictionary?.addEventListener("click", backToDictionary);
  ui.backToDictionaryBottom?.addEventListener("click", backToDictionary);
  ui.profileSignOut?.addEventListener("click", handleSignOut);
  ui.close?.addEventListener("click", closeAuthModal);
  ui.overlay?.addEventListener("click", (event) => {
    if (event.target === ui.overlay) closeAuthModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.overlay && !ui.overlay.hidden) closeAuthModal();
    if (event.key === "Escape" && ui.accountMenu) ui.accountMenu.hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".top-actions") && ui.accountMenu) ui.accountMenu.hidden = true;
  });
  ui.signOut?.addEventListener("click", handleSignOut);

  ui.google?.addEventListener("click", async () => {
    if (!configured || !auth || !provider) {
      setStatus("تعذّر تهيئة Firebase. راجع إعدادات المشروع ثم حدّث الصفحة.", "error");
      return;
    }
    if (signingIn) return;
    signingIn = true;
    ui.google.disabled = true;
    const label = ui.google.querySelector("span");
    if (label) label.textContent = "جارٍ فتح Google…";
    setStatus("جارٍ الاتصال بحساب Google. أكمل الاختيار في النافذة التي ستظهر.");
    try {
      await signInWithPopup(auth, provider);
      setStatus("تم تسجيل الدخول. جارٍ تجهيز مساحتك الشخصية…", "success");
    } catch (error) {
      console.error("WordAtlas Google sign-in error:", error);
      setStatus(friendlyError(error), "error");
    } finally {
      signingIn = false;
      ui.google.disabled = false;
      if (label) label.textContent = "المتابعة باستخدام Google";
    }
  });

  if (!configured) {
    showPublicLanding();
    setStatus("بيانات Firebase غير مكتملة في ملف firebase-config.js.", "error");
    return;
  }

  try {
    const firebaseApp = initializeApp(config);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "ar";

    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (persistenceError) {
      console.warn("Local persistence unavailable; using session persistence:", persistenceError);
      await setPersistence(auth, browserSessionPersistence);
    }

    try {
      const redirectResult = await getRedirectResult(auth);
      if (redirectResult?.user) setStatus("تم تسجيل الدخول. جارٍ فتح حسابك…", "success");
    } catch (error) {
      console.error("WordAtlas redirect result error:", error);
      setStatus(friendlyError(error), "error");
    }

    onAuthStateChanged(auth, async (user) => {
      updateAccount(user);
      if (!user) return;

      setProfileStatus("جارٍ حفظ بيانات الحساب…");
      try {
        await loadProtectedApp();
      } catch {
        return;
      }
      try {
        await saveUserProfile(user);
      } catch (error) {
        console.error("WordAtlas Firestore profile save error:", error);
        setProfileStatus(friendlyProfileError(error), "error");
      }
    }, (error) => {
      console.error("WordAtlas auth state observer error:", error);
      setStatus(friendlyError(error), "error");
    });
  } catch (error) {
    console.error("WordAtlas Firebase initialisation error:", error);
    showPublicLanding();
    setStatus("تعذّر تهيئة Firebase. راجع اتصال الإنترنت وبيانات firebase-config.js.", "error");
  }
})();
