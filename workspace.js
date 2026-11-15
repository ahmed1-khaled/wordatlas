import {
  doc,getDoc,setDoc,updateDoc,deleteDoc,addDoc,collection,getDocs,
  query,where,limit,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { reauthenticateWithPopup,GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

(() => {
  "use strict";
  const session=window.WordAtlasSession;
  if(!session?.db || !session?.getUser)return;
  const db=session.db;
  const $=selector=>document.querySelector(selector);
  const uid=()=>session.getUser()?.uid;
  const privateRef=key=>doc(db,"users",uid(),"private_data",key);
  const localRead=(key,fallback)=>{
    try{const value=JSON.parse(localStorage.getItem(key));return value===null?fallback:value;}catch{return fallback;}
  };
  const esc=value=>String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const formatDate=value=>{
    const date=value?.toDate?value.toDate():(value?new Date(value):null);
    return date && !Number.isNaN(date.getTime())?new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium",timeStyle:"short"}).format(date):"—";
  };
  const toast=message=>{
    const node=$("#toast");if(!node)return;
    node.textContent=message;node.classList.add("show");
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2300);
  };
  const state={
    favorites:[],savedEntries:[],recent:[],preferences:{},searchHistory:[],
    activity:[],lists:[],notifications:[],announcements:[],tickets:[],sessions:[],flashcardIndex:0,
    flashcardFlipped:false,syncTimers:new Map(),pendingSync:new Map()
  };

  async function list(ref,max=100){
    try{
      const snapshot=await getDocs(query(ref,limit(max)));
      return snapshot.docs.map(item=>({id:item.id,...item.data()}));
    }catch(error){console.warn("Workspace collection unavailable:",error?.code || error?.message);return [];}
  }
  async function loadWorkspace(){
    state.favorites=localRead("wordatlas-favorites",[]);
    state.savedEntries=localRead("wordatlas-saved-entries",[]);
    state.recent=localRead("wordatlas-recent",[]);
    state.preferences=window.WA_INITIAL_PREFERENCES || {};
    state.searchHistory=await list(collection(db,"users",uid(),"search_history"),100);
    state.activity=await list(collection(db,"users",uid(),"activity"),100);
    state.lists=await list(collection(db,"users",uid(),"vocabulary_lists"),100);
    state.notifications=await list(collection(db,"users",uid(),"notifications"),50);
    state.announcements=state.preferences.announcements===false?[]:
      await list(query(collection(db,"public_announcements"),where("published","==",true)),20);
    state.tickets=await list(query(collection(db,"support_tickets"),where("uid","==",uid())),30);
    renderDashboard();renderSaved();renderLists();renderHistory();
    renderFlashcards();renderNotifications();renderAnnouncements();renderTickets();renderPreferences();renderSecurity();
  }
  async function writePrivateSnapshot(documentId,userId,value){
    const payload={updatedAt:serverTimestamp()};
    if(documentId==="translations")payload.items=value || {};
    else payload.items=Array.isArray(value)?value:[];
    await setDoc(doc(db,"users",userId,"private_data",documentId),payload);
  }
  function syncPrivate(key,value){
    const mapping={
      "wordatlas-favorites":"favorites","wordatlas-recent":"recent",
      "wordatlas-saved-entries":"saved_entries","wordatlas-translations":"translations"
    };
    const documentId=mapping[key],userId=uid();
    if(!documentId || !userId)return;
    clearTimeout(state.syncTimers.get(documentId));
    const pending={userId,value};
    state.pendingSync.set(documentId,pending);
    const timer=setTimeout(async()=>{
      try{
        await writePrivateSnapshot(documentId,pending.userId,pending.value);
        if(state.pendingSync.get(documentId)===pending)state.pendingSync.delete(documentId);
      }catch(error){
        console.warn("Private sync failed:",documentId,error?.code || error?.message);
        toast("تعذّرت مزامنة البيانات. تأكد من نشر قواعد Firestore.");
      }finally{state.syncTimers.delete(documentId);}
    },450);
    state.syncTimers.set(documentId,timer);
  }
  async function flushPendingSync(){
    const pending=[...state.pendingSync.entries()];
    for(const [documentId,item] of pending){
      clearTimeout(state.syncTimers.get(documentId));
      state.syncTimers.delete(documentId);
      try{
        await writePrivateSnapshot(documentId,item.userId,item.value);
        if(state.pendingSync.get(documentId)===item)state.pendingSync.delete(documentId);
      }catch(error){
        console.warn("Pending private data could not be flushed:",documentId,error?.code || error?.message);
        throw error;
      }
    }
  }
  function savedEntries(){
    const entries=localRead("wordatlas-saved-entries",state.savedEntries);
    const favorites=localRead("wordatlas-favorites",state.favorites);
    const byId=new Map((Array.isArray(entries)?entries:[]).map(item=>[item.id,item]));
    (window.WORDS || []).forEach(word=>{
      if(favorites.includes(word.id) && !byId.has(word.id))byId.set(word.id,word);
    });
    return [...byId.values()].filter(item=>favorites.includes(item.id));
  }
  async function recordSearch(value){
    const term=String(value || "").trim().slice(0,100);
    if(!term)return;
    try{
      await addDoc(collection(db,"users",uid(),"search_history"),{query:term,createdAt:serverTimestamp()});
      state.searchHistory=await list(collection(db,"users",uid(),"search_history"),100);
      renderHistory();renderDashboard();
    }catch(error){console.warn("Search history sync failed:",error?.code || error?.message);}
  }
  async function recordActivity(type,word={}){
    try{
      await session.callFunction("recordUserActivity",{
        type,wordId:String(word.id || "").slice(0,150),word:String(word.en || "").slice(0,100)
      });
      state.activity=await list(collection(db,"users",uid(),"activity"),100);
      renderDashboard();
    }catch(error){
      console.info("Trusted activity logging is not deployed:",error?.code || error?.message);
    }
  }
  function renderDashboard(){
    state.favorites=localRead("wordatlas-favorites",state.favorites);
    state.savedEntries=savedEntries();
    const start=new Date();start.setHours(0,0,0,0);
    const today=state.activity.filter(item=>{
      const date=item.createdAt?.toDate?item.createdAt.toDate():new Date(item.createdAt || 0);
      return date>=start && ["word_opened","flashcard_reviewed"].includes(item.type);
    }).length;
    const goal=Math.min(50,Math.max(1,Number(state.preferences.dailyGoal || 10)));
    const percent=Math.min(100,Math.round(today/goal*100));
    $("#statSavedWords").textContent=String(state.favorites.length);
    $("#statSearches").textContent=String(state.searchHistory.length);
    $("#statTodayWords").textContent=String(today);
    $("#statLists").textContent=String(state.lists.length);
    $("#dailyGoalCount").textContent=today+" / "+goal;
    $("#dailyGoalPercent").textContent=percent+"%";
    $("#dailyGoalRing").style.background="conic-gradient(#198b72 "+percent+"%,#e9f0eb "+percent+"%)";
    $("#workspaceDate").textContent=new Intl.DateTimeFormat("ar-EG",{dateStyle:"full"}).format(new Date());
    const activity=[
      ...state.activity.map(item=>({word:item.word || item.wordId || "نشاط",kind:item.type==="word_saved"?"حفظ كلمة":"استكشاف كلمة",date:item.createdAt})),
      ...state.searchHistory.map(item=>({word:item.query,kind:"بحث",date:item.createdAt}))
    ].sort((a,b)=>{
      const first=a.date?.toDate?a.date.toDate().getTime():new Date(a.date || 0).getTime();
      const second=b.date?.toDate?b.date.toDate().getTime():new Date(b.date || 0).getTime();
      return second-first;
    }).slice(0,5);
    $("#dashboardRecentList").innerHTML=activity.length?activity.map(item=>
      '<div class="workspace-recent-item"><div><b>'+esc(item.word)+'</b><span>'+esc(item.kind)+'</span></div><small>'+esc(formatDate(item.date))+'</small></div>'
    ).join(""):'<p class="workspace-empty">ستظهر الكلمات هنا بعد أن تبدأ الاستكشاف.</p>';
    $("#onboardingHint").hidden=Boolean(state.favorites.length || state.lists.length || state.searchHistory.length);
  }
  function renderSaved(){
    state.savedEntries=savedEntries();
    $("#savedWordCount").textContent=state.favorites.length+" كلمة";
    const node=$("#savedWordsGrid");
    if(!state.savedEntries.length){node.innerHTML='<p class="workspace-empty">لم تحفظ أي كلمات بعد. افتح القاموس واضغط رمز القلب.</p>';return;}
    const options=state.lists.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.title)+'</option>').join("");
    node.innerHTML=state.savedEntries.map(word=>
      '<article class="saved-word-card"><div class="saved-word-card-head"><b>'+esc(word.en || word.id)+'</b><small>'+esc(word.pos || "WORD")+'</small></div>'+
      '<p>'+esc(word.ar || "لا توجد ترجمة محفوظة بعد.")+'</p><div class="saved-word-card-actions">'+
      '<button type="button" data-saved-remove="'+esc(word.id)+'">إزالة</button>'+
      '<select data-list-select="'+esc(word.id)+'"><option value="">إضافة إلى قائمة</option>'+options+'</select>'+
      '<button type="button" data-saved-add-list="'+esc(word.id)+'">إضافة</button></div></article>'
    ).join("");
  }
  function renderLists(){
    const node=$("#vocabularyListsGrid");
    node.innerHTML=state.lists.length?state.lists.map(item=>
      '<article class="vocabulary-list-card"><button type="button" data-list-delete="'+esc(item.id)+'">حذف ×</button><h3>'+esc(item.title)+'</h3><p>'+esc(item.description || "قائمة مفردات شخصية")+'</p><small>'+(item.wordIds || []).length+' كلمة</small></article>'
    ).join(""):'<p class="workspace-empty">أنشئ أول قائمة لتنظيم مفرداتك.</p>';
  }
  function renderHistory(){
    const local=localRead("wordatlas-search-history",[]);
    const items=[...state.searchHistory,...local].reverse().slice(0,100);
    $("#workspaceHistoryList").innerHTML=items.length?items.map(item=>
      '<div class="workspace-history-item"><div><b>'+esc(item.query || "")+'</b><small>'+esc(formatDate(item.createdAt))+'</small></div><button type="button" data-history-search="'+esc(item.query || "")+'">إعادة البحث ↗</button></div>'
    ).join(""):'<p class="workspace-empty">لا يوجد سجل بحث بعد.</p>';
  }
  function renderFlashcards(){
    const words=savedEntries(),node=$("#flashcardStage");
    if(!words.length){
      node.innerHTML='<div class="flashcard"><span>WORDATLAS FLASHCARDS</span><strong>احفظ بعض الكلمات أولًا</strong><p>أضف كلمات إلى المفضلة لتبدأ المراجعة.</p></div>';
      $("#flashcardPosition").textContent="0 / 0";
      $("#flashcardPrevious").disabled=$("#flashcardFlip").disabled=$("#flashcardNext").disabled=true;
      return;
    }
    state.flashcardIndex=(state.flashcardIndex+words.length)%words.length;
    const word=words[state.flashcardIndex];
    $("#flashcardPosition").textContent=(state.flashcardIndex+1)+" / "+words.length;
    node.innerHTML='<button type="button" id="activeFlashcard" class="flashcard"><span>WORDATLAS · ACTIVE RECALL</span><strong>'+esc(state.flashcardFlipped?(word.ar || "لا توجد ترجمة محفوظة"):word.en)+'</strong><p>'+(state.flashcardFlipped?"اضغط لإخفاء المعنى":"فكر في المعنى ثم أظهر الإجابة")+'</p></button>';
    $("#flashcardPrevious").disabled=false;$("#flashcardFlip").disabled=false;$("#flashcardNext").disabled=false;
    $("#flashcardFlip").textContent=state.flashcardFlipped?"إخفاء المعنى":"إظهار المعنى";
  }
  function renderNotifications(){
    const visible=state.preferences.inAppNotifications===false?[]:state.notifications;
    const unread=visible.filter(item=>!item.read).length;
    $("#unreadNotificationsBadge").textContent=String(unread);
    $("#unreadNotificationsBadge").hidden=!unread;
    $("#workspaceNotificationsList").innerHTML=visible.length?visible.map(item=>
      '<article class="workspace-notification-item '+(!item.read?"unread":"")+'"><div><b>'+esc(item.title || "تحديث من WordAtlas")+'</b><small>'+esc(item.message || "")+' · '+esc(formatDate(item.createdAt))+'</small></div>'+
      (!item.read?'<button type="button" data-notification-read="'+esc(item.id)+'">تحديد كمقروء</button>':'<small>مقروء</small>')+'</article>'
    ).join(""):(state.preferences.inAppNotifications===false
      ?'<p class="workspace-empty">الإشعارات داخل الموقع متوقفة من إعداداتك.</p>'
      :'<p class="workspace-empty">لا توجد إشعارات حاليًا.</p>');
  }
  function renderAnnouncements(){
    const node=$("#platformAnnouncementsList");
    if(!node)return;
    node.innerHTML=state.announcements.length?state.announcements.map(item=>
      '<article class="workspace-notification-item announcement-item"><div><b>'+esc(item.title || "تحديث من WordAtlas")+'</b><small>'+esc(item.message || "")+' · '+esc(formatDate(item.createdAt))+'</small></div><span class="announcement-label">إعلان</span></article>'
    ).join(""):(state.preferences.announcements===false
      ?'<p class="workspace-empty">تحديثات المنصة متوقفة من إعداداتك.</p>'
      :'<p class="workspace-empty">لا توجد إعلانات جديدة.</p>');
  }
  function renderTickets(){
    $("#mySupportTickets").innerHTML=state.tickets.length?state.tickets.map(item=>
      '<article class="workspace-notification-item"><div><b>'+esc(item.subject || "طلب دعم")+'</b><small>'+esc(item.type || "")+' · '+esc(item.status || "pending")+' · '+esc(formatDate(item.createdAt))+'</small></div></article>'
    ).join(""):'<p class="workspace-empty">لا توجد طلبات دعم بعد.</p>';
  }
  function renderPreferences(){
    const p=state.preferences;
    $("#preferenceTheme").value=p.theme || localStorage.getItem("wordatlas-theme") || "system";
    $("#preferenceLanguage").value=p.language || "ar";
    $("#preferenceDailyGoal").value=p.dailyGoal || 10;
    $("#preferenceFontScale").value=p.fontScale || "normal";
    $("#prefInApp").checked=p.inAppNotifications!==false;
    $("#prefSecurity").checked=p.securityNotifications!==false;
    $("#prefLearning").checked=p.learningReminders!==false;
    $("#prefAnnouncements").checked=p.announcements!==false;
    $("#prefMarketing").checked=Boolean(p.marketingEmails);
  }
  async function renderSecurity(){
    const user=session.getUser();
    $("#securityProvider").textContent=(user.providerData || []).map(item=>item.providerId).join(", ") || "Google";
    $("#securitySessionInfo").textContent="البريد موثق: "+(user.emailVerified?"نعم":"لا")+" · الجلسة الحالية محفوظة في هذا المتصفح.";
    const node=$("#activeSessionsList");
    if(!node)return;
    node.innerHTML='<p class="workspace-empty">جارٍ تحميل الجلسات…</p>';
    try{
      const result=await session.callFunction("listOwnSessions",{sessionId:session.getSessionId?.() || ""});
      state.sessions=result.sessions || [];
      node.innerHTML=state.sessions.length?state.sessions.map(item=>
        '<article class="workspace-session-item '+(item.current?"current-session":"")+'"><div><b>'+
        (item.current?"هذا الجهاز":"جلسة أخرى")+'</b><small>'+esc(item.provider)+' · '+esc(item.userAgent || "متصفح غير معروف")+
        '</small><small>آخر نشاط: '+esc(formatDate(item.lastSeenAt))+'</small></div><span class="session-state '+(item.active?"active":"inactive")+'">'+
        (item.active?"نشطة":"منتهية / مُبطلة")+'</span></article>'
      ).join(""):'<p class="workspace-empty">لا توجد جلسات مسجلة بعد. سجّل الدخول مرة أخرى لتسجيل الجلسة الحالية.</p>';
    }catch(error){
      console.warn("Session inventory unavailable:",error?.code || error?.message);
      node.innerHTML='<p class="workspace-empty">تعذّر تحميل الجلسات. تأكد من نشر Cloud Functions على المشروع.</p>';
    }
  }
  function view(name){
    document.querySelectorAll("[data-workspace-panel]").forEach(panel=>panel.hidden=panel.dataset.workspacePanel!==name);
    document.querySelectorAll("[data-workspace-view]").forEach(button=>button.classList.toggle("active",button.dataset.workspaceView===name));
    if(name==="saved")renderSaved();if(name==="lists")renderLists();if(name==="history")renderHistory();
    if(name==="flashcards")renderFlashcards();if(name==="notifications"){renderNotifications();renderAnnouncements();}if(name==="security")renderSecurity();if(name==="support")renderTickets();
  }
  async function createList(event){
    event.preventDefault();
    const data=new FormData(event.currentTarget),title=String(data.get("title") || "").trim(),description=String(data.get("description") || "").trim();
    if(!title)return;
    try{
      await addDoc(collection(db,"users",uid(),"vocabulary_lists"),{title,description,wordIds:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      event.currentTarget.reset();state.lists=await list(collection(db,"users",uid(),"vocabulary_lists"),100);
      renderLists();renderDashboard();toast("تم إنشاء القائمة");
    }catch(error){console.error(error);toast("تعذّر إنشاء القائمة. راجع قواعد Firestore.");}
  }
  async function addToList(wordId){
    const select=document.querySelector('[data-list-select="'+CSS.escape(wordId)+'"]'),listId=select?.value;
    if(!listId)return toast("اختر قائمة أولًا");
    const item=state.lists.find(row=>row.id===listId);if(!item)return;
    try{
      await updateDoc(doc(db,"users",uid(),"vocabulary_lists",listId),{
        wordIds:[...new Set([...(item.wordIds || []),wordId])].slice(0,200),updatedAt:serverTimestamp()
      });
      state.lists=await list(collection(db,"users",uid(),"vocabulary_lists"),100);
      renderLists();toast("تمت إضافة الكلمة إلى القائمة");
    }catch(error){toast("تعذّرت إضافة الكلمة.");}
  }
  async function savePreferences(event){
    event.preventDefault();
    const settings={
      theme:$("#preferenceTheme").value,language:$("#preferenceLanguage").value,
      dailyGoal:Math.min(50,Math.max(1,Number($("#preferenceDailyGoal").value || 10))),
      fontScale:$("#preferenceFontScale").value,
      inAppNotifications:$("#prefInApp").checked,securityNotifications:$("#prefSecurity").checked,
      learningReminders:$("#prefLearning").checked,announcements:$("#prefAnnouncements").checked,
      marketingEmails:$("#prefMarketing").checked
    };
    try{
      await setDoc(privateRef("preferences"),{settings,updatedAt:serverTimestamp()});
      state.preferences=settings;
      state.announcements=settings.announcements===false?[]:
        await list(query(collection(db,"public_announcements"),where("published","==",true)),20);
      document.body.dataset.theme=settings.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):settings.theme;
      document.documentElement.style.setProperty("--user-font-scale",settings.fontScale==="large"?"1.08":settings.fontScale==="small"?".94":"1");
      localStorage.setItem("wordatlas-theme",settings.theme);
      renderNotifications();renderAnnouncements();
      $("#preferencesStatus").textContent="تم حفظ تفضيلاتك.";renderDashboard();
    }catch(error){console.error(error);$("#preferencesStatus").textContent="تعذّر الحفظ. راجع قواعد Firestore.";}
  }
  async function exportData(){
    const profile=await getDoc(doc(db,"users",uid())),privateData={};
    for(const id of ["favorites","recent","saved_entries","translations","preferences"]){
      try{const snap=await getDoc(privateRef(id));privateData[id]=snap.exists()?snap.data():null;}catch{privateData[id]=null;}
    }
    const listsData=await list(collection(db,"users",uid(),"vocabulary_lists"),200);
    const history=await list(collection(db,"users",uid(),"search_history"),500);
    const activity=await list(collection(db,"users",uid(),"activity"),500);
    const notifications=await list(collection(db,"users",uid(),"notifications"),500);
    const supportTickets=await list(query(collection(db,"support_tickets"),where("uid","==",uid())),200);
    const feedback=await list(query(collection(db,"user_feedback"),where("uid","==",uid())),200);
    const data={
      exportedAt:new Date().toISOString(),
      account:{uid:uid(),email:session.getUser().email,emailVerified:session.getUser().emailVerified},
      profile:profile.exists()?profile.data():{},privateData,vocabularyLists:listsData,
      searchHistory:history,activity,notifications,supportTickets,feedback
    };
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download="wordatlas-data-"+new Date().toISOString().slice(0,10)+".json";
    anchor.click();URL.revokeObjectURL(url);toast("تم تجهيز نسخة بياناتك");
  }
  async function deleteAccount(){
    if(!confirm("سيتم حذف حسابك وبياناته المرتبطة. لا يمكن التراجع. هل تريد المتابعة؟"))return;
    try{
      await reauthenticateWithPopup(session.getUser(),new GoogleAuthProvider());
      await session.callFunction("deleteOwnAccount");await session.signOut();
    }catch(error){toast(error.code==="functions/not-found"?"حذف الحساب الكامل يحتاج Cloud Functions على خطة Blaze.":(error.message || "تعذّر حذف الحساب."));}
  }
  async function revokeSessions(){
    if(!confirm("سيتم إبطال جلسات Firebase على كل الأجهزة وستحتاج إلى تسجيل الدخول مرة أخرى. متابعة؟"))return;
    try{await session.callFunction("revokeOwnSessions");await session.signOut();}
    catch(error){toast(error.code==="functions/not-found"?"إبطال الجلسات يحتاج Cloud Functions على خطة Blaze.":(error.message || "تعذّر إبطال الجلسات."));}
  }
  async function submitSupport(event){
    event.preventDefault();const data=new FormData(event.currentTarget);
    $("#supportTicketStatus").textContent="جارٍ الإرسال…";
    try{
      await addDoc(collection(db,"support_tickets"),{
        uid:uid(),type:String(data.get("type") || "other"),
        subject:String(data.get("subject") || "").trim(),message:String(data.get("message") || "").trim(),
        status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      event.currentTarget.reset();
      state.tickets=await list(query(collection(db,"support_tickets"),where("uid","==",uid())),30);
      renderTickets();$("#supportTicketStatus").textContent="وصل طلبك.";
    }catch(error){console.error(error);$("#supportTicketStatus").textContent="تعذّر الإرسال. تأكد من Firestore Rules.";}
  }
  async function submitFeedback(event){
    event.preventDefault();const data=new FormData(event.currentTarget);
    $("#feedbackStatus").textContent="جارٍ الإرسال…";
    try{
      await addDoc(collection(db,"user_feedback"),{
        uid:uid(),rating:Number(data.get("rating") || 5),message:String(data.get("message") || "").trim(),
        status:"new",createdAt:serverTimestamp()
      });
      event.currentTarget.reset();$("#feedbackStatus").textContent="شكرًا لمشاركة رأيك.";
    }catch(error){console.error(error);$("#feedbackStatus").textContent="تعذّر الإرسال. راجع Firestore Rules.";}
  }
  async function markNotificationRead(id){
    try{
      await updateDoc(doc(db,"users",uid(),"notifications",id),{read:true,readAt:serverTimestamp()});
      const item=state.notifications.find(row=>row.id===id);if(item)item.read=true;renderNotifications();
    }catch(error){toast("تعذّر تحديث الإشعار.");}
  }

  document.querySelectorAll("[data-workspace-view]").forEach(button=>button.addEventListener("click",()=>view(button.dataset.workspaceView)));
  document.querySelectorAll("[data-workspace-view-link]").forEach(button=>button.addEventListener("click",()=>view(button.dataset.workspaceViewLink)));
  $("#dashboardSearchButton")?.addEventListener("click",()=>{$("#dictionaryNav")?.click();$("#searchInput")?.focus();});
  $("#quickSearch")?.addEventListener("click",()=>{$("#dictionaryNav")?.click();$("#searchInput")?.focus();});
  $("#createVocabularyListForm")?.addEventListener("submit",createList);
  $("#workspacePreferencesForm")?.addEventListener("submit",savePreferences);
  $("#supportTicketForm")?.addEventListener("submit",submitSupport);
  $("#feedbackForm")?.addEventListener("submit",submitFeedback);
  $("#exportUserData")?.addEventListener("click",exportData);
  $("#deleteAccountRequest")?.addEventListener("click",deleteAccount);
  $("#revokeSessionsButton")?.addEventListener("click",revokeSessions);
  $("#savedWordsGrid")?.addEventListener("click",event=>{
    const remove=event.target.closest("[data-saved-remove]"),add=event.target.closest("[data-saved-add-list]");
    if(remove){
      window.WordAtlasApp?.toggleFavoriteById?.(remove.dataset.savedRemove);
      setTimeout(()=>{state.favorites=localRead("wordatlas-favorites",[]);renderSaved();renderDashboard();renderFlashcards();},60);
    }
    if(add)addToList(add.dataset.savedAddList);
  });
  $("#vocabularyListsGrid")?.addEventListener("click",async event=>{
    const button=event.target.closest("[data-list-delete]");if(!button)return;
    if(!confirm("حذف القائمة؟"))return;
    try{
      await deleteDoc(doc(db,"users",uid(),"vocabulary_lists",button.dataset.listDelete));
      state.lists=state.lists.filter(item=>item.id!==button.dataset.listDelete);
      renderLists();renderDashboard();
    }catch(error){toast("تعذّر حذف القائمة.");}
  });
  $("#workspaceHistoryList")?.addEventListener("click",event=>{
    const button=event.target.closest("[data-history-search]");if(!button)return;
    $("#dictionaryNav")?.click();$("#searchInput").value=button.dataset.historySearch;$("#searchButton")?.click();
  });
  $("#clearSearchHistory")?.addEventListener("click",async()=>{
    if(!confirm("مسح سجل البحث؟"))return;
    const rows=await list(collection(db,"users",uid(),"search_history"),100);
    await Promise.all(rows.map(item=>deleteDoc(doc(db,"users",uid(),"search_history",item.id))));
    state.searchHistory=[];renderHistory();renderDashboard();toast("تم مسح سجل البحث");
  });
  $("#markAllNotificationsRead")?.addEventListener("click",async()=>{
    for(const item of state.notifications.filter(row=>!row.read))await markNotificationRead(item.id);
  });
  $("#workspaceNotificationsList")?.addEventListener("click",event=>{
    const button=event.target.closest("[data-notification-read]");if(button)markNotificationRead(button.dataset.notificationRead);
  });
  $("#flashcardPrevious")?.addEventListener("click",()=>{state.flashcardIndex--;state.flashcardFlipped=false;renderFlashcards();});
  $("#flashcardNext")?.addEventListener("click",()=>{state.flashcardIndex++;state.flashcardFlipped=false;renderFlashcards();});
  $("#flashcardFlip")?.addEventListener("click",()=>{
    state.flashcardFlipped=!state.flashcardFlipped;renderFlashcards();
    if(state.flashcardFlipped){
      const word=savedEntries()[state.flashcardIndex];
      if(word)recordActivity("flashcard_reviewed",word);
    }
  });
  $("#flashcardStage")?.addEventListener("click",event=>{
    if(event.target.closest("#activeFlashcard"))$("#flashcardFlip")?.click();
  });
  document.addEventListener("wordatlas:store-updated",event=>{
    const detail=event.detail || {};
    syncPrivate(detail.key,detail.value);
    if(["wordatlas-favorites","wordatlas-saved-entries"].includes(detail.key)){
      state.favorites=localRead("wordatlas-favorites",[]);
      state.savedEntries=savedEntries();renderSaved();renderDashboard();renderFlashcards();
    }
    if(detail.key==="wordatlas-recent"){state.recent=detail.value || [];renderDashboard();}
  });
  document.addEventListener("wordatlas:word-opened",event=>recordActivity("word_opened",event.detail || {}));
  document.addEventListener("wordatlas:favorite-changed",event=>{
    const word=event.detail || {};
    recordActivity(localRead("wordatlas-favorites",[]).includes(word.id)?"word_saved":"word_unsaved",word);
  });
  document.addEventListener("wordatlas:search",event=>recordSearch(event.detail?.query));
  window.WordAtlasWorkspace={
    refresh:loadWorkspace,
    flushPendingSync,
    loadDictionaryOverride:async word=>{
      const id=String(word || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-").slice(0,100);
      if(!id)return null;
      try{
        const snapshot=await getDoc(doc(db,"dictionary_overrides",id));
        return snapshot.exists() && snapshot.data().published?snapshot.data():null;
      }catch{return null;}
    }
  };
  loadWorkspace().catch(error=>{console.error("Workspace load failed:",error);toast("تعذّر تحميل بعض بيانات الحساب.");});
})();
