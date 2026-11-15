import {
  collection,getDocs,getDoc,doc,query,orderBy,limit
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { getFunctions,httpsCallable } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-functions.js";

(() => {
  "use strict";
  const session=window.WordAtlasSession;
  if(!session?.db || !session?.getUser)return;
  const db=session.db;
  const functions=getFunctions(session.auth.app,"us-central1");
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const call=async(name,data={})=>(await httpsCallable(functions,name)(data)).data;
  const dateText=value=>{
    if(!value)return "—";
    const date=value?.toDate?value.toDate():new Date(value);
    return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium"}).format(date);
  };
  const state={role:"user",users:[],nextPageToken:null};
  function status(selector,message,error=false){
    const node=$(selector);
    if(node){node.textContent=message;node.classList.toggle("error",error);}
  }
  function panel(name){
    document.querySelectorAll("[data-admin-panel]").forEach(node=>node.hidden=node.dataset.adminPanel!==name);
    document.querySelectorAll("[data-admin-view]").forEach(node=>node.classList.toggle("active",node.dataset.adminView===name));
    if(name==="users")loadUsers(true);
    if(name==="content")loadDictionary();
    if(name==="tickets")loadTickets();
    if(name==="feedback")loadFeedback();
    if(name==="announcements")loadAnnouncements();
    if(name==="audit")loadAudit();
    if(name==="settings")loadSettings();
  }
  async function loadOverview(){
    $("#adminMetrics").innerHTML='<p class="workspace-empty">جارٍ تحميل المؤشرات من Firebase…</p>';
    try{
      const data=await call("adminGetOverview");
      const rows=[
        ["إجمالي الحسابات",data.totalUsers,"FIREBASE AUTH USERS"],
        ["نشطون خلال 30 يومًا",data.activeUsers30Days,"RECENT SIGN-INS"],
        ["حسابات جديدة خلال 7 أيام",data.newUsers7Days,"NEW ACCOUNTS"],
        ["طلبات الدعم المفتوحة",data.openSupportTickets,"SUPPORT QUEUE"],
        ["بريد موثق",data.verifiedEmails,"EMAIL VERIFIED"],
        ["حسابات جديدة خلال 30 يومًا",data.newUsers30Days,"MONTHLY SIGN-UPS"],
        ["ملاحظات قيد المراجعة",data.pendingFeedback,"USER FEEDBACK"]
      ];
      $("#adminMetrics").innerHTML=rows.map(row=>
        '<article class="admin-metric-card"><span>'+esc(row[0])+'</span><strong>'+
        Number(row[1] || 0).toLocaleString("en-US")+'</strong><small>'+esc(row[2])+'</small></article>'
      ).join("");
      $("#adminRecentAudit").innerHTML=(data.latestAudit || []).length?data.latestAudit.map(item=>
        '<div class="admin-audit-row"><b>'+esc(item.action || "event")+'</b><span>'+esc(item.summary || "")+'</span></div>'
      ).join(""):'<p class="workspace-empty">لا توجد أحداث إدارية بعد.</p>';
      $("#adminSystemHealth").innerHTML='<span class="health-ok">استجابت خدمة الإدارة وFirestore للطلب الحالي.</span>';
      if(data.partial)$("#adminMetrics").insertAdjacentHTML("beforeend",'<p class="admin-data-note">بعض المؤشرات محدودة بأول 1,000 حساب أو أحدث 500 طلب.</p>');
    }catch(error){
      console.error("Admin overview failed:",error);
      $("#adminMetrics").innerHTML='<p class="workspace-empty">تعذّر تحميل الإحصائيات. تأكد من نشر Cloud Functions ومنح دور Admin.</p>';
      $("#adminSystemHealth").textContent="وظائف الإدارة غير منشورة أو لا توجد صلاحية.";
    }
  }
  async function loadUsers(reset=false){
    if(reset){
      state.users=[];state.nextPageToken=null;
      $("#adminUsersTable").innerHTML='<tr><td colspan="7">جارٍ تحميل المستخدمين…</td></tr>';
    }
    try{
      const result=await call("adminListUsers",{pageToken:state.nextPageToken});
      state.users=reset?result.users:[...state.users,...result.users];
      state.nextPageToken=result.nextPageToken;
      $("#loadMoreAdminUsers").hidden=!state.nextPageToken;
      renderUsers();
    }catch(error){
      $("#adminUsersTable").innerHTML='<tr><td colspan="7">تعذّر تحميل الحسابات. يلزم نشر Cloud Functions.</td></tr>';
      status("#adminUsersStatus",error.message || "Could not load users.",true);
    }
  }
  function renderUsers(){
    const term=String($("#adminUserSearch").value || "").trim().toLowerCase();
    const users=state.users.filter(user=>
      [user.displayName,user.email,user.uid,user.role].some(value=>String(value || "").toLowerCase().includes(term))
    );
    $("#adminUsersTable").innerHTML=users.length?users.map(user=>{
      const avatar=user.photoURL
        ?'<img src="'+esc(user.photoURL)+'" alt="" referrerpolicy="no-referrer">'
        :'<span class="admin-user-initial">'+esc((user.displayName || user.email || "U").charAt(0).toUpperCase())+'</span>';
      const roleControl=state.role==="super_admin" && user.role!=="super_admin"
        ?'<select data-user-role="'+esc(user.uid)+'">'+["user","support","moderator","admin"].map(role=>
            '<option value="'+role+'" '+(role===user.role?"selected":"")+'>'+role+'</option>'
          ).join("")+'</select><button type="button" data-user-action="role" data-uid="'+esc(user.uid)+'">تحديث الدور</button>'
        :'<span>'+esc(user.role || "user")+'</span>';
      const actions=state.role==="super_admin" && user.role!=="super_admin"
        ?'<button type="button" data-user-action="status" data-uid="'+esc(user.uid)+'" data-disabled="'+(!user.disabled)+'">'+(user.disabled?"إعادة تفعيل":"إيقاف")+'</button><button type="button" class="danger" data-user-action="delete" data-uid="'+esc(user.uid)+'">حذف</button>'
        :"";
      return '<tr><td><div class="admin-user-cell">'+avatar+'<span>'+esc(user.displayName || "بدون اسم")+'</span></div></td>'+
        '<td>'+esc(user.email || "—")+(user.emailVerified?" ✓":"")+'</td><td>'+roleControl+'</td>'+
        '<td>'+(user.disabled?"موقوف":"نشط")+'</td><td>'+esc(dateText(user.createdAt))+'</td>'+
        '<td>'+esc(dateText(user.lastSignInAt))+'</td><td><div class="admin-table-actions">'+actions+'</div></td></tr>';
    }).join(""):'<tr><td colspan="7">لا توجد نتائج.</td></tr>';
  }
  async function handleUserAction(event){
    const button=event.target.closest("[data-user-action]");
    if(!button)return;
    const uid=button.dataset.uid;
    try{
      if(button.dataset.userAction==="role"){
        const select=document.querySelector('[data-user-role="'+CSS.escape(uid)+'"]');
        await call("adminSetUserRole",{uid,role:select.value});
        const user=state.users.find(item=>item.uid===uid);if(user)user.role=select.value;
        status("#adminUsersStatus","تم تحديث الدور. يحتاج المستخدم إلى تحديث ID token لتطبيقه.");
      }
      if(button.dataset.userAction==="status"){
        const disabled=button.dataset.disabled==="true";
        if(!confirm(disabled?"إيقاف هذا الحساب وإبطال جلساته؟":"إعادة تفعيل هذا الحساب؟"))return;
        await call("adminSetUserStatus",{uid,disabled});
        const user=state.users.find(item=>item.uid===uid);if(user)user.disabled=disabled;
        status("#adminUsersStatus",disabled?"تم إيقاف الحساب.":"تم تفعيل الحساب.");
      }
      if(button.dataset.userAction==="delete"){
        if(!confirm("حذف الحساب وبياناته المرتبطة نهائيًا؟"))return;
        await call("adminDeleteUser",{uid});
        state.users=state.users.filter(item=>item.uid!==uid);
        status("#adminUsersStatus","تم حذف الحساب والبيانات المرتبطة.");
      }
      renderUsers();
    }catch(error){status("#adminUsersStatus",error.message || "تعذّر تنفيذ الإجراء.",true);}
  }
  async function loadDictionary(){
    try{
      const snapshot=await getDocs(query(collection(db,"dictionary_overrides"),limit(100)));
      const items=snapshot.docs.map(item=>({id:item.id,...item.data()}));
      $("#adminDictionaryItems").innerHTML=items.length?items.map(item=>
        '<article class="admin-content-item"><b>'+esc(item.word || item.id)+'</b><p>'+esc(item.meaning || "")+'</p><small>'+
        (item.published?"منشور":"مسودة")+'</small><button type="button" data-content-delete="'+esc(item.id)+'">حذف</button></article>'
      ).join(""):'<p class="workspace-empty">لا توجد تعديلات مخصصة على القاموس.</p>';
    }catch(error){$("#adminDictionaryItems").innerHTML='<p class="workspace-empty">تعذّر تحميل محتوى القاموس.</p>';}
  }
  async function saveDictionary(event){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const word=String(data.get("word") || "").trim();
    const wordId=word.toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100);
    if(!wordId){status("#adminContentStatus","اكتب كلمة إنجليزية صالحة.",true);return;}
    try{
      await call("adminSaveDictionaryOverride",{
        wordId,word,meaning:String(data.get("meaning") || "").trim(),
        definition:String(data.get("definition") || "").trim(),
        category:String(data.get("category") || "").trim(),published:data.get("published")==="on"
      });
      event.currentTarget.reset();status("#adminContentStatus","تم حفظ المدخل.");await loadDictionary();
    }catch(error){status("#adminContentStatus",error.message || "تعذّر حفظ المدخل.",true);}
  }
  async function loadTickets(){
    try{
      const snapshot=await getDocs(query(collection(db,"support_tickets"),orderBy("createdAt","desc"),limit(100)));
      $("#adminTicketsList").innerHTML=snapshot.docs.length?snapshot.docs.map(document=>{
        const item=document.data();
        return '<article class="admin-record-card"><h4>'+esc(item.subject)+'</h4><p>'+esc(item.message)+'</p><small>'+esc(item.uid)+' · '+esc(dateText(item.createdAt))+'</small><div><select data-ticket-status="'+esc(document.id)+'">'+
          ["pending","in_progress","resolved","rejected"].map(value=>'<option value="'+value+'" '+(item.status===value?"selected":"")+'>'+value+'</option>').join("")+
          '</select><button type="button" data-ticket-save="'+esc(document.id)+'">حفظ الحالة</button></div></article>';
      }).join(""):'<p class="workspace-empty">لا توجد طلبات دعم.</p>';
    }catch(error){$("#adminTicketsList").innerHTML='<p class="workspace-empty">تعذّرت قراءة طلبات الدعم.</p>';}
  }
  async function updateTicket(id){
    const statusValue=document.querySelector('[data-ticket-status="'+CSS.escape(id)+'"]').value;
    try{await call("adminUpdateSupportTicket",{ticketId:id,status:statusValue});await loadTickets();}
    catch(error){alert(error.message || "تعذّر تحديث الطلب.");}
  }
  async function loadFeedback(){
    try{
      const snapshot=await getDocs(query(collection(db,"user_feedback"),orderBy("createdAt","desc"),limit(100)));
      $("#adminFeedbackList").innerHTML=snapshot.docs.length?snapshot.docs.map(document=>{
        const item=document.data();
        return '<article class="admin-record-card"><h4>التقييم: '+Number(item.rating || 0)+'/5</h4><p>'+esc(item.message)+'</p><small>'+esc(item.uid)+' · '+esc(dateText(item.createdAt))+'</small><div><select data-feedback-status="'+esc(document.id)+'">'+
          ["new","reviewed","closed"].map(value=>'<option value="'+value+'" '+(item.status===value?"selected":"")+'>'+value+'</option>').join("")+
          '</select><button type="button" data-feedback-save="'+esc(document.id)+'">حفظ الحالة</button></div></article>';
      }).join(""):'<p class="workspace-empty">لا توجد ملاحظات.</p>';
    }catch(error){$("#adminFeedbackList").innerHTML='<p class="workspace-empty">تعذّرت قراءة الملاحظات.</p>';}
  }
  async function updateFeedback(id){
    const statusValue=document.querySelector('[data-feedback-status="'+CSS.escape(id)+'"]').value;
    try{await call("adminUpdateFeedback",{feedbackId:id,status:statusValue});await loadFeedback();}
    catch(error){alert(error.message || "تعذّر تحديث الملاحظة.");}
  }
  async function loadAnnouncements(){
    try{
      const snapshot=await getDocs(query(collection(db,"public_announcements"),orderBy("createdAt","desc"),limit(50)));
      $("#adminAnnouncementsList").innerHTML=snapshot.docs.length?snapshot.docs.map(document=>{
        const item=document.data();
        return '<article class="admin-record-card"><h4>'+esc(item.title)+'</h4><p>'+esc(item.message)+'</p><small>'+
          (item.published?"منشور":"مسودة")+'</small><button type="button" data-announcement-delete="'+esc(document.id)+'">حذف</button></article>';
      }).join(""):'<p class="workspace-empty">لا توجد إعلانات.</p>';
    }catch(error){$("#adminAnnouncementsList").innerHTML='<p class="workspace-empty">تعذّرت قراءة الإعلانات.</p>';}
  }
  async function createAnnouncement(event){
    event.preventDefault();const data=new FormData(event.currentTarget);
    try{
      await call("adminPublishAnnouncement",{
        title:String(data.get("title") || "").trim(),message:String(data.get("message") || "").trim(),
        published:data.get("published")==="on"
      });
      event.currentTarget.reset();status("#adminAnnouncementStatus","تم إنشاء الإعلان.");await loadAnnouncements();
    }catch(error){status("#adminAnnouncementStatus",error.message || "تعذّر النشر.",true);}
  }
  async function loadAudit(){
    try{
      const snapshot=await getDocs(query(collection(db,"audit_logs"),orderBy("createdAt","desc"),limit(100)));
      $("#adminAuditList").innerHTML=snapshot.docs.length?snapshot.docs.map(document=>{
        const item=document.data();
        return '<article class="admin-record-card"><h4>'+esc(item.action)+'</h4><p>'+esc(item.summary)+'</p><small>'+
          esc(item.actorEmail || item.actorUid)+' · '+esc(dateText(item.createdAt))+'</small></article>';
      }).join(""):'<p class="workspace-empty">لا توجد سجلات بعد.</p>';
    }catch(error){$("#adminAuditList").innerHTML='<p class="workspace-empty">تعذّرت قراءة سجل التدقيق.</p>';}
  }
  async function loadSettings(){
    try{
      const snapshot=await getDoc(doc(db,"platform_settings","main"));if(!snapshot.exists())return;
      const data=snapshot.data(),form=$("#adminPlatformSettingsForm");
      form.elements.siteName.value=data.siteName || "WordAtlas";
      form.elements.welcomeMessage.value=data.welcomeMessage || "";
    }catch(error){console.warn(error);}
  }
  async function saveSettings(event){
    event.preventDefault();const data=new FormData(event.currentTarget);
    try{
      await call("adminUpdatePlatformSetting",{
        settings:{siteName:String(data.get("siteName") || "WordAtlas"),welcomeMessage:String(data.get("welcomeMessage") || "")}
      });
      status("#adminSettingsStatus","تم حفظ الإعدادات.");
    }catch(error){status("#adminSettingsStatus",error.message || "تعذّر الحفظ.",true);}
  }
  async function init(){
    const token=await session.getIdTokenResult();
    state.role=token?.claims?.role || "user";
    if(!["admin","super_admin","moderator","support"].includes(state.role))return;
    $("#adminRoleLabel").textContent=state.role.toUpperCase();
    document.querySelectorAll("[data-admin-view]").forEach(button=>button.addEventListener("click",()=>panel(button.dataset.adminView)));
    $("#refreshAdminOverview")?.addEventListener("click",loadOverview);
    $("#adminUserSearch")?.addEventListener("input",renderUsers);
    $("#loadMoreAdminUsers")?.addEventListener("click",()=>loadUsers(false));
    $("#adminUsersTable")?.addEventListener("click",handleUserAction);
    $("#adminDictionaryForm")?.addEventListener("submit",saveDictionary);
    $("#adminDictionaryItems")?.addEventListener("click",async event=>{
      const button=event.target.closest("[data-content-delete]");
      if(!button || !confirm("حذف هذا المدخل؟"))return;
      try{await call("adminDeleteDictionaryOverride",{wordId:button.dataset.contentDelete});await loadDictionary();}
      catch(error){status("#adminContentStatus",error.message || "تعذّر الحذف.",true);}
    });
    $("#adminTicketsList")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-ticket-save]");if(button)updateTicket(button.dataset.ticketSave);
    });
    $("#adminFeedbackList")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-feedback-save]");if(button)updateFeedback(button.dataset.feedbackSave);
    });
    $("#adminAnnouncementForm")?.addEventListener("submit",createAnnouncement);
    $("#adminAnnouncementsList")?.addEventListener("click",async event=>{
      const button=event.target.closest("[data-announcement-delete]");
      if(!button || !confirm("حذف الإعلان؟"))return;
      try{await call("adminDeleteAnnouncement",{announcementId:button.dataset.announcementDelete});await loadAnnouncements();}
      catch(error){alert(error.message || "تعذّر حذف الإعلان.");}
    });
    $("#adminPlatformSettingsForm")?.addEventListener("submit",saveSettings);
    await loadOverview();
  }
  window.WordAtlasAdmin={init};
})();
