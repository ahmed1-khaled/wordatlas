import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, updateProfile, setPersistence,
  browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-functions.js";

(async () => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const config = window.WORDATLAS_FIREBASE_CONFIG || {};
  const required = ["apiKey","authDomain","projectId","appId"];
  const configured = required.every(key => {
    const value=String(config[key] || "");
    return value && !value.startsWith("PASTE_") && !value.startsWith("YOUR_");
  });

  const ui={
    landing:$("#publicLanding"),member:$("#memberApp"),dashboard:$("#memberDashboard"),
    main:$("#top"),profilePage:$("#profilePage"),admin:$("#adminApp"),
    trigger:$("#authTrigger"),triggerLabel:$("#authTriggerLabel"),
    accountButton:$("#accountButton"),accountAvatar:$("#accountAvatar"),accountButtonName:$("#accountButtonName"),
    accountMenu:$("#accountMenu"),menuAvatar:$("#menuAvatar"),accountName:$("#accountName"),accountEmail:$("#accountEmail"),
    accountMenuNote:$("#accountMenuNote"),profileOpen:$("#profileOpen"),profileMenuButton:$("#profileMenuButton"),
    dashboardNav:$("#dashboardNav"),dictionaryNav:$("#dictionaryNav"),categoriesNav:$("#categoriesNav"),aboutNav:$("#aboutNav"),adminNav:$("#adminNav"),
    profileAvatar:$("#profileAvatar"),profileName:$("#profileName"),profileEmail:$("#profileEmail"),
    profileDisplayName:$("#profileDisplayName"),profileDisplayEmail:$("#profileDisplayEmail"),profileProvider:$("#profileProvider"),
    profileSaveStatus:$("#profileSaveStatus"),completionText:$("#profileCompletionText"),completionBar:$("#profileCompletionBar"),
    profileEditForm:$("#profileEditForm"),profileEditStatus:$("#profileEditStatus"),
    back:$("#backToDictionary"),backBottom:$("#backToDictionaryBottom"),profileSignOut:$("#profileSignOut"),
    landingButtons:["#landingLoginButton","#landingLoginButtonSecondary","#landingLoginButtonBottom"].map($).filter(Boolean),
    overlay:$("#authOverlay"),close:$("#closeAuthButton"),google:$("#googleSignInButton"),status:$("#authStatus"),
    signOut:$("#signOutButton")
  };

  let app=null,auth=null,db=null,functions=null,provider=null,currentUser=null;
  let profile=null,protectedPromise=null,signingIn=false,handlingUid=null,role="user";
  const privateDocuments=[
    ["favorites","wordatlas-favorites",[]],
    ["recent","wordatlas-recent",[]],
    ["saved_entries","wordatlas-saved-entries",[]],
    ["translations","wordatlas-translations",{}]
  ];

  function setStatus(message,kind=""){
    if(!ui.status)return;
    ui.status.textContent=message;
    ui.status.className="auth-status"+(kind?" "+kind:"");
  }
  function setProfileStatus(message,kind=""){
    if(ui.profileSaveStatus){
      ui.profileSaveStatus.textContent=message;
      ui.profileSaveStatus.className="profile-save-status"+(kind?" "+kind:"");
    }
    if(ui.accountMenuNote)ui.accountMenuNote.textContent=message;
  }
  function closeModal(){
    if(ui.overlay)ui.overlay.hidden=true;
    document.body.classList.remove("modal-open");
  }
  function openModal(){
    if(!ui.overlay)return;
    if(ui.accountMenu)ui.accountMenu.hidden=true;
    ui.overlay.hidden=false;
    document.body.classList.add("modal-open");
    ui.close?.focus();
    if(!configured){
      setStatus("إعداد Firebase غير مكتمل. راجع firebase-config.js.","error");
      if(ui.google)ui.google.disabled=true;
    }
  }
  function setAvatar(target,user,override=""){
    if(!target || !user)return;
    target.replaceChildren();
    const photo=override || user.photoURL || "";
    if(!photo){
      target.textContent=(user.displayName || user.email || "A").trim().charAt(0).toUpperCase();
      return;
    }
    const image=document.createElement("img");
    image.src=photo;
    image.alt="";
    image.referrerPolicy="no-referrer";
    image.addEventListener("error",()=>{
      target.replaceChildren(document.createTextNode((user.displayName || user.email || "A").trim().charAt(0).toUpperCase()));
    },{once:true});
    target.append(image);
  }
  function renderProfile(user,stored={}){
    if(!user)return;
    const name=stored.displayName || user.displayName || user.email?.split("@")[0] || "WordAtlas member";
    const email=user.email || "";
    const photo=stored.photoURL || user.photoURL || "";
    setAvatar(ui.accountAvatar,user,photo);
    setAvatar(ui.menuAvatar,user,photo);
    setAvatar(ui.profileAvatar,user,photo);
    if(ui.accountButtonName)ui.accountButtonName.textContent=name.split(" ")[0];
    if(ui.accountName)ui.accountName.textContent=name;
    if(ui.accountEmail)ui.accountEmail.textContent=email;
    if(ui.profileName)ui.profileName.textContent=name;
    if(ui.profileEmail)ui.profileEmail.textContent=email;
    if(ui.profileDisplayName)ui.profileDisplayName.textContent=name;
    if(ui.profileDisplayEmail)ui.profileDisplayEmail.textContent=email;
    if(ui.profileProvider)ui.profileProvider.textContent=user.providerData?.[0]?.providerId || "google.com";
    const fields=[Boolean(name),Boolean(photo),Boolean(stored.username),Boolean(stored.bio),Boolean(stored.language),Boolean(stored.timezone)];
    const percent=Math.round(fields.filter(Boolean).length/fields.length*100);
    if(ui.completionText)ui.completionText.textContent=percent+"%";
    if(ui.completionBar)ui.completionBar.style.width=percent+"%";
    const formValues={
      editDisplayName:name,editUsername:stored.username || "",editBio:stored.bio || "",
      editLanguage:stored.language || "ar",
      editTimezone:stored.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo",
      editCountry:stored.country || "",
      editPhotoURL:stored.photoURL && stored.photoURL!==user.photoURL ? stored.photoURL : ""
    };
    Object.entries(formValues).forEach(([id,value])=>{
      const input=$("#"+id);
      if(input && document.activeElement!==input)input.value=value;
    });
    if($("#dashboardGreetingName"))$("#dashboardGreetingName").textContent=name.split(" ")[0];
  }
  function routeTo(route){
    if(!currentUser && route!=="public"){openModal();return;}
    if(route==="admin" && !["admin","super_admin","support","moderator"].includes(role)){
      route="dashboard";
    }
    if(ui.landing)ui.landing.hidden=route!=="public";
    if(ui.member)ui.member.hidden=route==="public";
    if(ui.dashboard)ui.dashboard.hidden=route!=="dashboard";
    if(ui.main)ui.main.hidden=route!=="dictionary";
    if(ui.profilePage)ui.profilePage.hidden=route!=="profile";
    if(ui.admin)ui.admin.hidden=route!=="admin";
    document.body.classList.toggle("member-ready",route!=="public");
    ui.dashboardNav?.classList.toggle("active",route==="dashboard");
    ui.dictionaryNav?.classList.toggle("active",route==="dictionary");
    ui.profileOpen?.classList.toggle("active",route==="profile");
    ui.adminNav?.classList.toggle("active",route==="admin");
    closeModal();
    window.scrollTo({top:0,behavior:"auto"});
  }
  function showPublic(){
    currentUser=null;profile=null;role="user";handlingUid=null;protectedPromise=null;
    if(ui.landing)ui.landing.hidden=false;
    if(ui.member)ui.member.hidden=true;
    if(ui.dashboard)ui.dashboard.hidden=true;
    if(ui.main)ui.main.hidden=true;
    if(ui.profilePage)ui.profilePage.hidden=true;
    if(ui.admin)ui.admin.hidden=true;
    if(ui.trigger)ui.trigger.hidden=false;
    if(ui.triggerLabel)ui.triggerLabel.textContent="الدخول بحساب Google";
    if(ui.accountButton)ui.accountButton.hidden=true;
    if(ui.accountMenu)ui.accountMenu.hidden=true;
    [ui.profileOpen,ui.dashboardNav,ui.dictionaryNav,ui.categoriesNav,ui.aboutNav,ui.adminNav].forEach(node=>{if(node)node.hidden=true;});
    document.body.classList.remove("member-ready");
    closeModal();
  }
  function showMemberNavigation(){
    if(ui.trigger)ui.trigger.hidden=true;
    if(ui.accountButton)ui.accountButton.hidden=false;
    [ui.profileOpen,ui.dashboardNav,ui.dictionaryNav,ui.categoriesNav,ui.aboutNav].forEach(node=>{if(node)node.hidden=false;});
  }
  async function callBackend(name,data={}){
    const callable=httpsCallable(functions,name);
    return (await callable(data)).data;
  }
  let transientSessionUid="",transientSessionId="";
  function browserSessionId(uid=currentUser?.uid){
    if(!uid)return "";
    const key="wordatlas-session:"+uid;
    try{
      let id=sessionStorage.getItem(key);
      if(!id){
        id=window.crypto?.randomUUID?.() || ("wa-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
        sessionStorage.setItem(key,id);
      }
      return id;
    }catch{
      if(transientSessionUid!==uid){
        transientSessionUid=uid;
        transientSessionId=window.crypto?.randomUUID?.() || ("wa-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
      }
      return transientSessionId;
    }
  }
  function clearBrowserSession(uid=currentUser?.uid){
    if(!uid)return;
    try{sessionStorage.removeItem("wordatlas-session:"+uid);}catch{/* session storage may be disabled */}
    if(transientSessionUid===uid){transientSessionUid="";transientSessionId="";}
  }
  async function closeBackendSession(){
    if(!currentUser)return;
    const uid=currentUser.uid,sessionId=browserSessionId(uid);
    try{await callBackend("endOwnSession",{sessionId});}
    catch(error){console.info("Could not close the tracked browser session:",error?.code || error?.message);}
    clearBrowserSession(uid);
  }
  async function loadScript(path,module=false){
    if(document.querySelector('script[data-protected-script="'+path+'"]'))return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=new URL(path,window.location.href).href;
      script.dataset.protectedScript=path;
      if(module)script.type="module";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("تعذّر تحميل "+path));
      document.body.append(script);
    });
  }
  function localWrite(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));}catch(error){console.warn("Local storage unavailable",error);}
  }
  async function loadPrivateData(uid){
    for(const [documentId,localKey,fallback] of privateDocuments){
      try{
        const snapshot=await getDoc(doc(db,"users",uid,"private_data",documentId));
        localWrite(localKey,snapshot.exists()?snapshot.data().items:fallback);
      }catch(error){
        console.info("Private data not synced yet:",documentId,error?.code || error?.message);
        localWrite(localKey,fallback);
      }
    }
    try{
      const snapshot=await getDoc(doc(db,"users",uid,"private_data","preferences"));
      window.WA_INITIAL_PREFERENCES=snapshot.exists()?(snapshot.data().settings || {}):{};
      const theme=window.WA_INITIAL_PREFERENCES.theme;
      if(theme)localStorage.setItem("wordatlas-theme",theme);
    }catch(error){window.WA_INITIAL_PREFERENCES={};}
    try{
      const profileSnapshot=await getDoc(doc(db,"users",uid));
      profile=profileSnapshot.exists()?profileSnapshot.data():{};
    }catch(error){profile={};console.info("Profile not yet stored:",error?.code || error?.message);}
    window.WA_PROFILE_CACHE=profile;
  }
  async function ensureProfile(user){
    const ref=doc(db,"users",user.uid);
    const snapshot=await getDoc(ref);
    const previous=snapshot.exists()?snapshot.data():{};
    const values={
      uid:user.uid,
      displayName:previous.displayName || user.displayName || user.email?.split("@")[0] || "WordAtlas member",
      email:user.email || "",
      photoURL:previous.photoURL===undefined?(user.photoURL || null):previous.photoURL,
      providerId:user.providerData?.find(item=>item.providerId==="google.com")?.providerId || "google.com",
      googleSub:user.providerData?.find(item=>item.providerId==="google.com")?.uid || "",
      emailVerified:Boolean(user.emailVerified),
      lastLoginAt:serverTimestamp(),updatedAt:serverTimestamp()
    };
    if(!snapshot.exists())values.createdAt=serverTimestamp();
    await setDoc(ref,values,{merge:true});
    const updated=await getDoc(ref);
    profile=updated.exists()?updated.data():values;
    window.WA_PROFILE_CACHE=profile;
    renderProfile(user,profile);
    setProfileStatus("تم حفظ بيانات الحساب في Firestore","success");
  }
  async function saveProfile(updates){
    if(!currentUser)throw new Error("Sign in before updating the profile.");
    const values={
      uid:currentUser.uid,email:currentUser.email || "",
      emailVerified:Boolean(currentUser.emailVerified),
      providerId:currentUser.providerData?.find(item=>item.providerId==="google.com")?.providerId || "google.com",
      googleSub:currentUser.providerData?.find(item=>item.providerId==="google.com")?.uid || "",
      ...updates,updatedAt:serverTimestamp()
    };
    await setDoc(doc(db,"users",currentUser.uid),values,{merge:true});
    if(updates.displayName || updates.photoURL){
      await updateProfile(currentUser,{
        displayName:updates.displayName || currentUser.displayName || "",
        photoURL:updates.photoURL || currentUser.photoURL || null
      });
      await currentUser.reload();
      currentUser=auth.currentUser;
    }
    const snapshot=await getDoc(doc(db,"users",currentUser.uid));
    profile=snapshot.exists()?snapshot.data():values;
    window.WA_PROFILE_CACHE=profile;
    renderProfile(currentUser,profile);
    setProfileStatus("تم تحديث الملف الشخصي بنجاح","success");
    return profile;
  }
  async function loadMemberApp(user){
    if(protectedPromise)return protectedPromise;
    protectedPromise=(async()=>{
      await loadPrivateData(user.uid);
      await loadScript("words.js");
      await loadScript("app.js");
      await loadScript("enhancements.js");
      window.WordAtlasSession={
        db,auth,functions,
        getUser:()=>currentUser,
        getProfile:()=>profile || {},
        getIdTokenResult:()=>currentUser?currentUser.getIdTokenResult():Promise.resolve(null),
        callFunction:callBackend,
        saveProfile:saveProfile,
        getSessionId:()=>browserSessionId(currentUser?.uid),
        signOut:async()=>{await closeBackendSession();return signOut(auth);}
      };
      await loadScript("workspace.js",true);
    })();
    try{await protectedPromise;}catch(error){protectedPromise=null;throw error;}
  }
  async function bootstrapOwner(user){
    if((user.email || "").toLowerCase()!=="engahmedassiut@gmail.com" || !user.emailVerified)return null;
    const token=await user.getIdTokenResult();
    if(token.claims.role==="super_admin")return token;
    try{
      await callBackend("bootstrapOwnerAdmin");
      await user.getIdToken(true);
      return await user.getIdTokenResult(true);
    }catch(error){
      console.info("Owner Admin bootstrap requires deployed Cloud Functions:",error?.code || error?.message);
      return null;
    }
  }
  async function setupRole(user){
    let token=await user.getIdTokenResult();
    if(token.claims.role!=="super_admin" && (user.email || "").toLowerCase()==="engahmedassiut@gmail.com"){
      const result=await bootstrapOwner(user);
      if(result)token=result;
    }
    role=token.claims.role || "user";
    const staff=["admin","super_admin","support","moderator"].includes(role);
    if(ui.adminNav)ui.adminNav.hidden=!staff;
    if(staff){
      await loadScript("admin.js",true);
      window.WordAtlasAdmin?.init?.();
    }
    return role;
  }
  function friendlyError(error){
    const code=error?.code || "";
    const messages={
      "auth/unauthorized-domain":"نطاق الموقع غير مسموح في Firebase. تأكد من إضافة ahmed1-khaled.github.io إلى Authorised domains.",
      "auth/operation-not-allowed":"Google Sign-In غير مفعّل في Firebase Authentication → Sign-in method.",
      "auth/popup-blocked":"المتصفح منع نافذة Google. سيتم تجربة تسجيل الدخول عن طريق التحويل.",
      "auth/popup-closed-by-user":"تم إغلاق نافذة Google قبل اكتمال تسجيل الدخول.",
      "auth/network-request-failed":"تعذّر الاتصال بـ Firebase. تحقق من الإنترنت.",
      "auth/invalid-api-key":"Firebase API key غير صحيح. راجع firebase-config.js.",
      "auth/app-not-authorized":"تطبيق الويب أو النطاق غير مصرح به في Firebase.",
      "auth/too-many-requests":"توقفت المحاولات مؤقتًا بسبب تكرارها. حاول لاحقًا.",
      "auth/account-exists-with-different-credential":"هذا البريد مرتبط بطريقة تسجيل دخول مختلفة."
    };
    return (messages[code] || error?.message || "حدث خطأ غير معروف")+(code?" ("+code+")":"");
  }
  async function handleSignOut(){
    try{
      await window.WordAtlasWorkspace?.flushPendingSync?.();
      await closeBackendSession();
      await signOut(auth);
      showPublic();setStatus("تم تسجيل الخروج.","success");
    }catch(error){setStatus(friendlyError(error),"error");}
  }
  async function openProfile(){
    if(!currentUser){openModal();return;}
    renderProfile(currentUser,profile || {});
    routeTo("profile");
  }

  ui.landingButtons.forEach(button=>button.addEventListener("click",openModal));
  ui.trigger?.addEventListener("click",()=>currentUser?(ui.accountMenu.hidden=!ui.accountMenu.hidden):openModal());
  ui.accountButton?.addEventListener("click",()=>ui.accountMenu.hidden=!ui.accountMenu.hidden);
  ui.profileOpen?.addEventListener("click",event=>{event.preventDefault();openProfile();});
  ui.profileMenuButton?.addEventListener("click",openProfile);
  ui.dashboardNav?.addEventListener("click",event=>{event.preventDefault();if(currentUser)routeTo("dashboard");});
  ui.dictionaryNav?.addEventListener("click",event=>{event.preventDefault();if(currentUser)routeTo("dictionary");});
  ui.categoriesNav?.addEventListener("click",event=>{event.preventDefault();if(currentUser){routeTo("dictionary");$("#categories")?.scrollIntoView({behavior:"smooth"});}});
  ui.aboutNav?.addEventListener("click",event=>{event.preventDefault();if(currentUser){routeTo("dictionary");$("#about")?.scrollIntoView({behavior:"smooth"});}});
  ui.adminNav?.addEventListener("click",event=>{event.preventDefault();if(currentUser && !ui.adminNav.hidden)routeTo("admin");});
  ui.back?.addEventListener("click",()=>routeTo("dictionary"));
  ui.backBottom?.addEventListener("click",()=>routeTo("dictionary"));
  ui.profileSignOut?.addEventListener("click",handleSignOut);
  ui.signOut?.addEventListener("click",handleSignOut);
  ui.close?.addEventListener("click",closeModal);
  ui.overlay?.addEventListener("click",event=>{if(event.target===ui.overlay)closeModal();});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape" && ui.overlay && !ui.overlay.hidden)closeModal();
    if(event.key==="Escape" && ui.accountMenu)ui.accountMenu.hidden=true;
  });
  document.addEventListener("click",event=>{
    if(!event.target.closest(".top-actions") && ui.accountMenu)ui.accountMenu.hidden=true;
  });

  ui.profileEditForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const displayName=String(data.get("displayName") || "").trim();
    const username=String(data.get("username") || "").trim().toLowerCase();
    const bio=String(data.get("bio") || "").trim();
    const language=String(data.get("language") || "ar");
    const timezone=String(data.get("timezone") || "Africa/Cairo").trim();
    const country=String(data.get("country") || "").trim();
    const photoURL=String(data.get("photoURL") || "").trim();
    if(displayName.length<2){ui.profileEditStatus.textContent="اكتب اسمًا من حرفين على الأقل.";return;}
    if(username && !/^[a-z0-9_]{3,20}$/.test(username)){ui.profileEditStatus.textContent="اسم المستخدم يجب أن يكون 3–20 حرفًا أو رقمًا أو _.";return;}
    if(photoURL){try{const parsed=new URL(photoURL);if(parsed.protocol!=="https:")throw new Error();}catch{ui.profileEditStatus.textContent="رابط الصورة يجب أن يبدأ بـ https://";return;}}
    ui.profileEditStatus.textContent="جارٍ الحفظ…";
    try{
      const {runTransaction}=await import("https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js");
      const oldUsername=String(profile?.username || "").toLowerCase();
      const profileRef=doc(db,"users",currentUser.uid);
      const newRef=username?doc(db,"usernames",username):null;
      const oldRef=oldUsername && oldUsername!==username?doc(db,"usernames",oldUsername):null;
      await runTransaction(db,async tx=>{
        if(newRef){
          const snap=await tx.get(newRef);
          if(snap.exists() && snap.data().uid!==currentUser.uid)throw new Error("اسم المستخدم مستخدم بالفعل.");
          if(!snap.exists())tx.set(newRef,{uid:currentUser.uid,createdAt:serverTimestamp()});
        }
        if(oldRef){
          const snap=await tx.get(oldRef);
          if(snap.exists() && snap.data().uid===currentUser.uid)tx.delete(oldRef);
        }
        tx.set(profileRef,{
          uid:currentUser.uid,email:currentUser.email || "",emailVerified:Boolean(currentUser.emailVerified),
          providerId:currentUser.providerData?.[0]?.providerId || "google.com",
          displayName,username,bio,country,language,timezone,photoURL:photoURL || currentUser.photoURL || null,
          googleSub:currentUser.providerData?.find(item=>item.providerId==="google.com")?.uid || "",
          updatedAt:serverTimestamp()
        },{merge:true});
      });
      if(displayName!==currentUser.displayName || photoURL){
        await updateProfile(currentUser,{displayName,photoURL:photoURL || currentUser.photoURL || null});
        await currentUser.reload();currentUser=auth.currentUser;
      }
      const snapshot=await getDoc(doc(db,"users",currentUser.uid));
      profile=snapshot.exists()?snapshot.data():{};
      renderProfile(currentUser,profile);
      ui.profileEditStatus.textContent="تم حفظ الملف الشخصي.";
    }catch(error){
      console.error("Profile edit failed:",error);
      ui.profileEditStatus.textContent=error.message || "تعذّر الحفظ. تأكد من إعداد Firestore.";
    }
  });

  ui.google?.addEventListener("click",async()=>{
    if(!configured || !auth || !provider){setStatus("تعذّر تهيئة Firebase. راجع الإعدادات.","error");return;}
    if(signingIn)return;
    signingIn=true;ui.google.disabled=true;
    const label=ui.google.querySelector("span");
    if(label)label.textContent="جارٍ الاتصال بـ Google…";
    setStatus("جارٍ فتح نافذة Google الرسمية.");
    try{
      await signInWithPopup(auth,provider);
      setStatus("تم تسجيل الدخول. جارٍ تجهيز مساحتك…","success");
    }catch(error){
      console.error("Google sign-in error:",error);
      if(error?.code==="auth/popup-blocked"){
        try{setStatus("النافذة المنبثقة محجوبة؛ جارٍ التحويل إلى Google…");await signInWithRedirect(auth,provider);return;}
        catch(redirectError){setStatus(friendlyError(redirectError),"error");}
      }else setStatus(friendlyError(error),"error");
    }finally{
      signingIn=false;ui.google.disabled=false;
      if(label)label.textContent="المتابعة باستخدام Google";
    }
  });

  if(!configured){showPublic();setStatus("بيانات Firebase غير مكتملة.","error");return;}
  try{
    app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);functions=getFunctions(app,"us-central1");
    provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    auth.languageCode="ar";
    try{await setPersistence(auth,browserLocalPersistence);}
    catch(error){console.warn("Local persistence unavailable",error);await setPersistence(auth,browserSessionPersistence);}
    try{
      const result=await getRedirectResult(auth);
      if(result?.user)setStatus("تم تسجيل الدخول. جارٍ فتح حسابك…","success");
    }catch(error){setStatus(friendlyError(error),"error");}
    onAuthStateChanged(auth,async user=>{
      if(!user){showPublic();return;}
      if(handlingUid===user.uid)return;
      handlingUid=user.uid;currentUser=user;
      showMemberNavigation();routeTo("dashboard");
      renderProfile(user,profile || {});
      setProfileStatus("جارٍ تجهيز حسابك…");
      try{
        await loadPrivateData(user.uid);
        await ensureProfile(user);
      }catch(error){
        console.error("Profile setup failed:",error);
        setProfileStatus("الدخول ناجح، لكن حفظ الملف في Firestore تعذّر: "+(error.code || "راجع إعداد Firestore"),"error");
      }
      try{await loadMemberApp(user);}
      catch(error){console.error(error);setStatus("تم تسجيل الدخول لكن تعذّر تحميل مساحة العمل. حدّث الصفحة.","error");return;}
      try{
        const token=await user.getIdTokenResult();
        role=token.claims.role || "user";
        if(role!=="super_admin" && (user.email || "").toLowerCase()==="engahmedassiut@gmail.com" && user.emailVerified){
          try{
            await callBackend("bootstrapOwnerAdmin");
            await user.getIdToken(true);
            role=(await user.getIdTokenResult(true)).claims.role || role;
          }catch(error){console.info("Admin bootstrap needs deployed Cloud Functions:",error.code || error.message);}
        }
        const staff=["admin","super_admin","support","moderator"].includes(role);
        if(ui.adminNav)ui.adminNav.hidden=!staff;
        if(staff){
          await loadScript("admin.js",true);
          window.WordAtlasAdmin?.init?.();
        }
      }catch(error){console.warn("Role setup failed:",error);}
      window.dispatchEvent(new CustomEvent("wordatlas:auth-ready",{detail:{uid:user.uid,role,email:user.email || ""}}));
      try{
        await callBackend("recordAppSession",{
          sessionId:browserSessionId(user.uid),
          userAgent:navigator.userAgent || ""
        });
      }catch(error){console.info("Session tracking needs deployed Cloud Functions:",error.code || error.message);}
      setProfileStatus("حسابك جاهز للاستخدام","success");
      routeTo("dashboard");
    },error=>{
      console.error("Auth state observer failed:",error);
      setStatus(friendlyError(error),"error");showPublic();
    });
  }catch(error){
    console.error("Firebase init failed:",error);
    showPublic();setStatus("تعذّر تهيئة Firebase. راجع الإعدادات والإنترنت.","error");
  }
})();
