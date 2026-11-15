import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

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
    trigger: $("#authTrigger"),
    triggerLabel: $("#authTriggerLabel"),
    accountButton: $("#accountButton"),
    accountAvatar: $("#accountAvatar"),
    accountButtonName: $("#accountButtonName"),
    accountMenu: $("#accountMenu"),
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
  let currentUser = null;
  let provider = null;

  function setStatus(message, kind = "") {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.className = "auth-status" + (kind ? " " + kind : "");
  }
  function showModal() {
    ui.accountMenu.hidden = true;
    ui.overlay.hidden = false;
    document.body.classList.add("modal-open");
    ui.close.focus();
    if (!configured) {
      setStatus("يلزم ربط مشروع Firebase أولًا. اتبع خطوات الإعداد أسفل README.", "error");
      ui.google.disabled = true;
    }
  }
  function hideModal() {
    ui.overlay.hidden = true;
    document.body.classList.remove("modal-open");
    ui.trigger.focus();
  }
  function setAvatar(target, user) {
    target.replaceChildren();
    if (user.photoURL) {
      const image = document.createElement("img");
      image.src = user.photoURL;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      target.append(image);
    } else {
      target.textContent = (user.displayName || user.email || "A").trim().charAt(0).toUpperCase();
    }
  }
  function updateAccount(user) {
    currentUser = user || null;
    if (!user) {
      ui.trigger.hidden = false;
      ui.triggerLabel.textContent = "الدخول بحساب Google";
      ui.accountButton.hidden = true;
      ui.accountMenu.hidden = true;
      return;
    }
    const name = user.displayName || "مستخدم WordAtlas";
    ui.trigger.hidden = true;
    ui.accountButton.hidden = false;
    ui.accountButtonName.textContent = name.split(" ")[0];
    ui.accountName.textContent = name;
    ui.accountEmail.textContent = user.email || "";
    setAvatar(ui.accountAvatar, user);
    setAvatar(ui.menuAvatar, user);
    ui.overlay.hidden = true;
    document.body.classList.remove("modal-open");
  }
  function friendlyError(error) {
    const code = error?.code || "";
    const messages = {
      "auth/unauthorized-domain": "هذا النطاق غير مضاف إلى Authorized domains في Firebase.",
      "auth/operation-not-allowed": "فعّل Google من Authentication → Sign-in method داخل Firebase.",
      "auth/popup-blocked": "المتصفح منع نافذة الدخول. اسمح بالنوافذ المنبثقة للموقع وحاول مجددًا.",
      "auth/popup-closed-by-user": "أغلقت نافذة Google قبل اكتمال تسجيل الدخول.",
      "auth/cancelled-popup-request": "تم إلغاء محاولة تسجيل دخول سابقة.",
      "auth/network-request-failed": "تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا.",
      "auth/invalid-api-key": "مفتاح Firebase غير صحيح. راجع ملف firebase-config.js.",
      "auth/app-not-authorized": "تأكد من إعداد تطبيق الويب والنطاقات المصرح بها في Firebase."
    };
    return messages[code] || "تعذّر تسجيل الدخول: " + (error?.message || "خطأ غير معروف");
  }

  if (!ui.trigger || !ui.overlay) return;

  ui.trigger.addEventListener("click", () => {
    if (currentUser) {
      ui.accountMenu.hidden = !ui.accountMenu.hidden;
    } else {
      showModal();
    }
  });
  ui.accountButton.addEventListener("click", () => {
    ui.accountMenu.hidden = !ui.accountMenu.hidden;
  });
  ui.close.addEventListener("click", hideModal);
  ui.overlay.addEventListener("click", (event) => {
    if (event.target === ui.overlay) hideModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.overlay.hidden) hideModal();
    if (event.key === "Escape") ui.accountMenu.hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".top-actions")) ui.accountMenu.hidden = true;
  });
  ui.signOut.addEventListener("click", async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      ui.accountMenu.hidden = true;
      setStatus("تم تسجيل الخروج بنجاح.", "success");
    } catch (error) {
      console.error("WordAtlas sign-out error:", error);
      setStatus("تعذّر تسجيل الخروج. حاول مرة أخرى.", "error");
    }
  });

  ui.google.addEventListener("click", async () => {
    if (!configured || !auth || !provider) {
      setStatus("أكمل إعداد Firebase أولًا. ملف firebase-config.js ما زال يحتوي على بيانات تجريبية.", "error");
      return;
    }
    ui.google.disabled = true;
    ui.google.querySelector("span").textContent = "جارٍ الاتصال بـ Google…";
    setStatus("سيتم فتح نافذة تسجيل الدخول الرسمية من Google.");
    try {
      await signInWithPopup(auth, provider);
      setStatus("تم تسجيل الدخول بنجاح.", "success");
    } catch (error) {
      if (error?.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          setStatus(friendlyError(redirectError), "error");
        }
      } else if (error?.code === "auth/popup-closed-by-user") {
        setStatus(friendlyError(error));
      } else {
        setStatus(friendlyError(error), "error");
      }
      console.error("WordAtlas Google sign-in error:", error);
    } finally {
      ui.google.disabled = false;
      ui.google.querySelector("span").textContent = "المتابعة باستخدام Google";
    }
  });

  if (!configured) {
    setStatus("زر الدخول جاهز، لكنه ينتظر إعداد مشروع Firebase الخاص بالموقع.");
    return;
  }

  try {
    const firebaseApp = initializeApp(config);
    auth = getAuth(firebaseApp);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.useDeviceLanguage();
    await setPersistence(auth, browserLocalPersistence);
    try {
      const redirectResult = await getRedirectResult(auth);
      if (redirectResult?.user) setStatus("تم تسجيل الدخول بنجاح.", "success");
    } catch (error) {
      console.error("WordAtlas redirect result error:", error);
      setStatus(friendlyError(error), "error");
    }
    onAuthStateChanged(auth, updateAccount, (error) => {
      console.error("WordAtlas auth state error:", error);
      setStatus(friendlyError(error), "error");
    });
  } catch (error) {
    console.error("WordAtlas Firebase initialization error:", error);
    setStatus("تعذّر تهيئة Firebase. راجع بيانات ملف firebase-config.js.", "error");
  }
})();
