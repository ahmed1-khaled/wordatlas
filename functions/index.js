const admin = require("firebase-admin");
const { onCall, HttpsError, setGlobalOptions } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const FV = admin.firestore.FieldValue;

setGlobalOptions({ region:"us-central1", maxInstances:5 });

const OWNER_EMAIL = "engahmedassiut@gmail.com";
const ASSIGNABLE_ROLES = ["user","support","moderator","admin"];

function requireUser(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated","Sign in to continue.");
  }
  return request.auth;
}
async function requireFreshUser(request){
  const caller=requireUser(request);
  const user=await auth.getUser(caller.uid);
  if(user.disabled)throw new HttpsError("unauthenticated","This account has been suspended.");
  const authTime=Number(caller.token.auth_time || 0);
  const validAfter=Math.floor(Date.parse(user.tokensValidAfterTime || "")/1000) || 0;
  if(validAfter && authTime<validAfter){
    throw new HttpsError("unauthenticated","This session has been revoked. Sign in again.");
  }
  return caller;
}
async function requireAdmin(request, superAdminOnly=false) {
  const caller=await requireFreshUser(request);
  const role=caller.token.role || "user";
  const allowed=superAdminOnly
    ? role==="super_admin"
    : ["admin","super_admin","support","moderator"].includes(role);
  if(!allowed)throw new HttpsError("permission-denied","Insufficient permission.");
  const account=await auth.getUser(caller.uid);
  const currentRole=account.customClaims?.role || "user";
  if(currentRole!==role){
    throw new HttpsError("permission-denied","Your role has changed. Sign in again to refresh permissions.");
  }
  const profileRef=db.collection("users").doc(caller.uid);
  const profile=await profileRef.get();
  if(profile.exists && profile.get("status")==="suspended"){
    throw new HttpsError("permission-denied","The account profile is suspended.");
  }
  const profileRole=profile.exists?profile.get("role"):undefined;
  if(profileRole===undefined){
    // Backfill role for an existing trusted Admin account created before role sync was introduced.
    await profileRef.set({
      role,
      ...(profile.exists?{}:{status:"active"}),
      updatedAt:FV.serverTimestamp()
    },{merge:true});
  }else if(profileRole!==role){
    throw new HttpsError("permission-denied","The account profile does not match the current Admin role.");
  }
  return caller;
}
function clean(value,max=200) {
  return typeof value==="string"?value.trim().slice(0,max):"";
}
async function markTrackedSessionsInactive(uid,reason="revoked"){
  while(true){
    const page=await db.collection("active_sessions").where("uid","==",uid).limit(400).get();
    if(page.empty)break;
    const batch=db.batch();
    page.docs.forEach(document=>batch.set(document.ref,{
      active:false,revokedAt:FV.serverTimestamp(),revocationReason:clean(reason,40)
    },{merge:true}));
    await batch.commit();
    if(page.size<400)break;
  }
}
async function rateLimit(uid,key,max=30,windowMs=60000) {
  const ref=db.collection("rate_limits").doc(uid+"_"+key);
  const now=Date.now();
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const data=snap.exists?snap.data():{};
    const started=Number(data.started || 0);
    const sameWindow=started>0 && now-started<windowMs;
    const count=sameWindow?Number(data.count || 0):0;
    if(count>=max)throw new HttpsError("resource-exhausted","Too many requests. Please try again later.");
    tx.set(ref,{
      uid,key,started:sameWindow?started:now,count:count+1,
      updatedAt:FV.serverTimestamp()
    },{merge:true});
  });
}
async function audit(actor,action,targetUid="",summary="") {
  await db.collection("audit_logs").add({
    actorUid:actor.uid,
    actorEmail:clean(actor.token.email || "",254),
    action:clean(action,80),
    targetUid:clean(targetUid,128),
    summary:clean(summary,500),
    createdAt:FV.serverTimestamp()
  });
}
async function track(uid,type,metadata={}) {
  await db.collection("analytics_events").add({
    uid,type,metadata,createdAt:FV.serverTimestamp()
  });
}
async function deleteRelatedUserData(uid) {
  const profileRef=db.collection("users").doc(uid);
  const profileSnapshot=await profileRef.get();
  const username=profileSnapshot.exists?clean(profileSnapshot.get("username"),20):"";
  if(username){
    const usernameRef=db.collection("usernames").doc(username);
    const usernameSnapshot=await usernameRef.get();
    if(usernameSnapshot.exists && usernameSnapshot.get("uid")===uid)await usernameRef.delete();
  }
  await db.recursiveDelete(profileRef);
  for(const name of ["support_tickets","user_feedback","login_events","active_sessions","analytics_events"]){
    while(true){
      const related=await db.collection(name).where("uid","==",uid).limit(400).get();
      if(related.empty)break;
      const batch=db.batch();
      related.docs.forEach(document=>batch.delete(document.ref));
      await batch.commit();
      if(related.size<400)break;
    }
  }
}

exports.bootstrapOwnerAdmin=onCall(async request=>{
  const caller=await requireFreshUser(request);
  const email=String(caller.token.email || "").toLowerCase();
  if(email!==OWNER_EMAIL.toLowerCase() || caller.token.email_verified!==true){
    throw new HttpsError("permission-denied","Only the verified WordAtlas owner can initialise the first Super Admin.");
  }
  const lockRef=db.collection("platform_private").doc("admin_bootstrap");
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(lockRef);
    if(snapshot.exists && snapshot.get("uid")!==caller.uid){
      throw new HttpsError("failed-precondition","The Super Admin bootstrap has already been claimed.");
    }
    tx.set(lockRef,{
      uid:caller.uid,email,
      initialisedAt:snapshot.exists?snapshot.get("initialisedAt"):FV.serverTimestamp()
    },{merge:true});
  });
  const record=await auth.getUser(caller.uid);
  await auth.setCustomUserClaims(caller.uid,{
    ...(record.customClaims || {}),role:"super_admin",admin:true
  });
  await db.collection("users").doc(caller.uid).set({
    role:"super_admin",status:"active",updatedAt:FV.serverTimestamp()
  },{merge:true});
  await audit(caller,"super_admin_bootstrap",caller.uid,"Initial owner Super Admin role assigned.");
  return {success:true,role:"super_admin"};
});

function validSessionId(value){
  return typeof value==="string" && /^[A-Za-z0-9_-]{16,80}$/.test(value);
}
function toIso(value){
  return value?.toDate?value.toDate().toISOString():(value instanceof Date?value.toISOString():null);
}
exports.recordAppSession=onCall(async request=>{
  const caller=await requireFreshUser(request);
  await rateLimit(caller.uid,"app_session",40,60*60*1000);
  const sessionId=clean(request.data?.sessionId,80);
  if(!validSessionId(sessionId))throw new HttpsError("invalid-argument","A valid browser session ID is required.");
  const ref=db.collection("active_sessions").doc(caller.uid+"_"+sessionId);
  const existing=await ref.get();
  const provider=clean(caller.token.firebase?.sign_in_provider || "unknown",40);
  await ref.set({
    uid:caller.uid,sessionId,provider,
    userAgent:clean(request.data?.userAgent,220),
    active:true,revokedAt:null,lastSeenAt:FV.serverTimestamp(),
    ...(existing.exists?{}:{createdAt:FV.serverTimestamp()})
  },{merge:true});
  if(!existing.exists){
    const preferences=await db.collection("users").doc(caller.uid)
      .collection("private_data").doc("preferences").get();
    const settings=preferences.exists?(preferences.get("settings") || {}):{};
    if(settings.inAppNotifications!==false && settings.securityNotifications!==false){
      await db.collection("users").doc(caller.uid).collection("notifications").add({
        type:"security",title:"تم تسجيل دخول جديد",
        message:"تم فتح WordAtlas من متصفح أو جلسة جديدة.",
        read:false,createdAt:FV.serverTimestamp()
      });
    }
    await db.collection("login_events").add({
      uid:caller.uid,eventType:"authenticated_app_session",provider,
      sessionId,createdAt:FV.serverTimestamp()
    });
    await track(caller.uid,"authenticated_app_session");
  }
  return {success:true,sessionId};
});
exports.listOwnSessions=onCall(async request=>{
  const caller=await requireFreshUser(request);
  await rateLimit(caller.uid,"list_own_sessions",60,60*60*1000);
  const currentSessionId=clean(request.data?.sessionId,80);
  const snapshot=await db.collection("active_sessions").where("uid","==",caller.uid).limit(100).get();
  const sessions=snapshot.docs.map(document=>{
    const data=document.data();
    return {
      sessionId:clean(data.sessionId,80),
      provider:clean(data.provider || "unknown",40),
      userAgent:clean(data.userAgent || "",220),
      active:data.active===true && (data.lastSeenAt?.toDate?.().getTime() || 0)>Date.now()-35*60*1000,
      current:data.sessionId===currentSessionId,
      createdAt:toIso(data.createdAt),
      lastSeenAt:toIso(data.lastSeenAt),
      revokedAt:toIso(data.revokedAt)
    };
  }).sort((a,b)=>String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  return {sessions};
});
exports.endOwnSession=onCall(async request=>{
  const caller=await requireFreshUser(request);
  await rateLimit(caller.uid,"end_own_session",60,60*60*1000);
  const sessionId=clean(request.data?.sessionId,80);
  if(!validSessionId(sessionId))throw new HttpsError("invalid-argument","A valid browser session ID is required.");
  const ref=db.collection("active_sessions").doc(caller.uid+"_"+sessionId);
  const snapshot=await ref.get();
  if(snapshot.exists && snapshot.get("uid")===caller.uid){
    await ref.set({active:false,endedAt:FV.serverTimestamp(),lastSeenAt:FV.serverTimestamp()},{merge:true});
  }
  return {success:true};
});

exports.recordUserActivity=onCall(async request=>{
  const caller=await requireFreshUser(request);
  await rateLimit(caller.uid,"user_activity",90,60*1000);
  const type=clean(request.data?.type,40);
  if(!["word_opened","word_saved","word_unsaved","flashcard_reviewed"].includes(type)){
    throw new HttpsError("invalid-argument","Unsupported activity type.");
  }
  const record={
    type,wordId:clean(request.data?.wordId,150),
    word:clean(request.data?.word,100),
    createdAt:FV.serverTimestamp()
  };
  await db.collection("users").doc(caller.uid).collection("activity").add(record);
  await track(caller.uid,type,{wordId:record.wordId});
  return {success:true};
});

exports.recordUserSearch=onCall(async request=>{
  const caller=await requireFreshUser(request);
  await rateLimit(caller.uid,"user_search",120,60*1000);
  // Deliberately do not accept or store the search query in global analytics.
  await track(caller.uid,"search_performed");
  return {success:true};
});

exports.adminGetOverview=onCall(async request=>{
  const caller=await requireAdmin(request);
  await rateLimit(caller.uid,"admin_overview",30,60*60*1000);
  const now=Date.now();
  const cutoff=new Date(now-30*86400000);
  const [usersPage,tickets,feedback,latestAudit,eventsPage,sessionsPage]=await Promise.all([
    auth.listUsers(1000),
    db.collection("support_tickets").limit(500).get(),
    db.collection("user_feedback").limit(500).get(),
    db.collection("audit_logs").orderBy("createdAt","desc").limit(8).get(),
    db.collection("analytics_events").where("createdAt",">=",cutoff)
      .orderBy("createdAt","desc").limit(3000).get(),
    db.collection("active_sessions").where("active","==",true).limit(1000).get()
  ]);
  const weekAgo=now-7*86400000,monthAgo=now-30*86400000;
  let active30=0,new7=0,new30=0,verified=0;
  usersPage.users.forEach(user=>{
    const created=Date.parse(user.metadata.creationTime || "") || 0;
    const last=Date.parse(user.metadata.lastSignInTime || "") || 0;
    if(last>=monthAgo)active30++;
    if(created>=weekAgo)new7++;
    if(created>=monthAgo)new30++;
    if(user.emailVerified)verified++;
  });
  const events=eventsPage.docs.map(document=>document.data());
  const interactionTypes=["search_performed","word_opened","word_saved","word_unsaved","flashcard_reviewed"];
  const labels={
    search_performed:"عمليات البحث",
    word_opened:"فتح الكلمات",
    word_saved:"حفظ الكلمات",
    word_unsaved:"إزالة من المحفوظات",
    flashcard_reviewed:"مراجعة البطاقات"
  };
  const counters=new Map(interactionTypes.map(type=>[type,0]));
  const daily=new Map();
  const dailyUsers=new Map();
  const startOfToday=new Date();
  startOfToday.setUTCHours(0,0,0,0);
  for(let offset=29;offset>=0;offset--){
    const day=new Date(startOfToday.getTime()-offset*86400000).toISOString().slice(0,10);
    daily.set(day,0);
    dailyUsers.set(day,new Set());
  }
  let sessions30=0;
  for(const event of events){
    const type=clean(event.type,60);
    const createdAt=event.createdAt?.toDate?.();
    if(!createdAt)continue;
    if(counters.has(type))counters.set(type,counters.get(type)+1);
    if(type==="authenticated_app_session")sessions30++;
    const day=createdAt.toISOString().slice(0,10);
    if(daily.has(day)){
      daily.set(day,daily.get(day)+1);
      if(event.uid)dailyUsers.get(day).add(event.uid);
    }
  }
  const dailyActivity=[...daily.entries()].map(([date,eventCount])=>({
    date,events:eventCount,activeUsers:dailyUsers.get(date).size
  }));
  const topFeatures=interactionTypes
    .map(type=>({type,label:labels[type],count:counters.get(type)||0}))
    .filter(item=>item.count>0)
    .sort((a,b)=>b.count-a.count)
    .slice(0,5);
  const trackedActiveSessions=sessionsPage.docs.filter(document=>{
    const data=document.data();
    const lastSeen=data.lastSeenAt?.toDate?.().getTime() || 0;
    return data.active===true && lastSeen>now-35*60*1000;
  }).length;
  const searches30Days=counters.get("search_performed")||0;
  const wordOpens30Days=counters.get("word_opened")||0;
  const flashcardReviews30Days=counters.get("flashcard_reviewed")||0;
  const partial=Boolean(
    usersPage.pageToken || tickets.size>=500 || feedback.size>=500 ||
    eventsPage.size>=3000 || sessionsPage.size>=1000
  );
  return {
    totalUsers:usersPage.users.length,
    activeUsers30Days:active30,
    newUsers7Days:new7,
    newUsers30Days:new30,
    verifiedEmails:verified,
    openSupportTickets:tickets.docs.filter(item=>!["resolved","rejected"].includes(item.get("status"))).length,
    pendingFeedback:feedback.docs.filter(item=>["new","reviewed"].includes(item.get("status"))).length,
    activeTrackedSessions:trackedActiveSessions,
    searches30Days,
    wordOpens30Days,
    flashcardReviews30Days,
    sessions30Days:sessions30,
    totalEvents30Days:eventsPage.size,
    dailyActivity,
    topFeatures,
    latestAudit:latestAudit.docs.map(item=>({id:item.id,...item.data()})),
    partial,
    note:"التحليلات مبنية على الأحداث المسجلة خلال آخر 30 يومًا. النتائج محدودة بأول 1,000 حساب، و3,000 حدث، و1,000 جلسة نشطة. أيام الرسم محسوبة بتوقيت UTC."
  };
});

exports.adminListUsers=onCall(async request=>{
  const caller=await requireAdmin(request);
  await rateLimit(caller.uid,"admin_list_users",60,60*60*1000);
  const token=clean(request.data?.pageToken,2048) || undefined;
  const result=await auth.listUsers(100,token);
  return {
    users:result.users.map(user=>({
      uid:user.uid,
      displayName:user.displayName || "",
      email:user.email || "",
      photoURL:user.photoURL || "",
      emailVerified:Boolean(user.emailVerified),
      disabled:Boolean(user.disabled),
      role:user.customClaims?.role || "user",
      createdAt:user.metadata.creationTime || "",
      lastSignInAt:user.metadata.lastSignInTime || ""
    })),
    nextPageToken:result.pageToken || null
  };
});

exports.adminSetUserRole=onCall(async request=>{
  const caller=await requireAdmin(request,true);
  await rateLimit(caller.uid,"admin_set_role",20,60*60*1000);
  const uid=clean(request.data?.uid,128);
  const role=clean(request.data?.role,24);
  if(!uid || !ASSIGNABLE_ROLES.includes(role)){
    throw new HttpsError("invalid-argument","Choose a valid user and role.");
  }
  const target=await auth.getUser(uid);
  if((target.email || "").toLowerCase()===OWNER_EMAIL.toLowerCase()){
    throw new HttpsError("failed-precondition","The project owner's role cannot be changed.");
  }
  const targetProfile=await db.collection("users").doc(uid).get();
  if(target.disabled || (targetProfile.exists && targetProfile.get("status")==="suspended")){
    throw new HttpsError("failed-precondition","Reactivate the suspended account before changing its role.");
  }
  await auth.setCustomUserClaims(uid,{
    ...(target.customClaims || {}),role,admin:role==="admin"
  });
  await db.collection("users").doc(uid).set({
    role,updatedAt:FV.serverTimestamp()
  },{merge:true});
  await auth.revokeRefreshTokens(uid);
  await markTrackedSessionsInactive(uid,"role_changed");
  await audit(caller,"user_role_changed",uid,"Role assigned and existing sessions revoked: "+role);
  return {success:true,uid,role,reauthenticationRequired:true};
});

exports.adminSetUserStatus=onCall(async request=>{
  const caller=await requireAdmin(request,true);
  await rateLimit(caller.uid,"admin_set_status",20,60*60*1000);
  const uid=clean(request.data?.uid,128);
  const disabled=request.data?.disabled;
  if(!uid || typeof disabled!=="boolean"){
    throw new HttpsError("invalid-argument","A user UID and boolean status are required.");
  }
  const target=await auth.getUser(uid);
  if(uid===caller.uid || (target.email || "").toLowerCase()===OWNER_EMAIL.toLowerCase()){
    throw new HttpsError("failed-precondition","The owner account cannot be suspended here.");
  }
  await auth.updateUser(uid,{disabled});
  if(disabled){
    await auth.revokeRefreshTokens(uid);
    await markTrackedSessionsInactive(uid,"account_suspended");
  }
  await db.collection("users").doc(uid).set({
    status:disabled?"suspended":"active",updatedAt:FV.serverTimestamp()
  },{merge:true});
  await audit(caller,disabled?"user_suspended":"user_reactivated",uid,
    disabled?"Account disabled, refresh tokens revoked and app sessions marked inactive.":"Account reactivated; a new sign-in is required.");
  return {success:true,disabled};
});

exports.adminDeleteUser=onCall(async request=>{
  const caller=await requireAdmin(request,true);
  await rateLimit(caller.uid,"admin_delete_user",5,60*60*1000);
  const uid=clean(request.data?.uid,128);
  if(!uid || uid===caller.uid)throw new HttpsError("invalid-argument","Choose another user account.");
  const target=await auth.getUser(uid);
  if((target.email || "").toLowerCase()===OWNER_EMAIL.toLowerCase()){
    throw new HttpsError("failed-precondition","The project owner cannot be deleted.");
  }
  await audit(caller,"user_deleted",uid,"User account and related records deleted by Super Admin.");
  await deleteRelatedUserData(uid);
  await auth.deleteUser(uid);
  return {success:true};
});

exports.deleteOwnAccount=onCall(async request=>{
  const caller=await requireFreshUser(request);
  const authTime=Number(caller.token.auth_time || 0);
  if(!authTime || Math.floor(Date.now()/1000)-authTime>300){
    throw new HttpsError("failed-precondition","Re-authenticate with Google before deleting your account.");
  }
  if(String(caller.token.email || "").toLowerCase()===OWNER_EMAIL.toLowerCase()){
    throw new HttpsError("failed-precondition","The project owner account cannot be deleted from this flow.");
  }
  await rateLimit(caller.uid,"delete_own_account",2,60*60*1000);
  await audit(caller,"account_deleted",caller.uid,"User requested own account deletion.");
  await deleteRelatedUserData(caller.uid);
  await auth.deleteUser(caller.uid);
  return {success:true};
});

exports.revokeOwnSessions=onCall(async request=>{
  const caller=await requireFreshUser(request);
  await rateLimit(caller.uid,"revoke_own_sessions",3,60*60*1000);
  await auth.revokeRefreshTokens(caller.uid);
  await markTrackedSessionsInactive(caller.uid,"user_revoked");
  await audit(caller,"sessions_revoked",caller.uid,"User revoked refresh tokens and marked all tracked app sessions inactive.");
  return {success:true};
});

exports.adminUpdateSupportTicket=onCall(async request=>{
  const caller=await requireAdmin(request);
  const id=clean(request.data?.ticketId,128);
  const status=clean(request.data?.status,24);
  if(!id || !["pending","in_progress","resolved","rejected"].includes(status)){
    throw new HttpsError("invalid-argument","Invalid ticket update.");
  }
  const ref=db.collection("support_tickets").doc(id);
  const snapshot=await ref.get();
  if(!snapshot.exists)throw new HttpsError("not-found","Support ticket not found.");
  await ref.update({status,updatedAt:FV.serverTimestamp()});
  await audit(caller,"support_ticket_updated",snapshot.get("uid") || "","Ticket status: "+status);
  return {success:true};
});

exports.adminUpdateFeedback=onCall(async request=>{
  const caller=await requireAdmin(request);
  const id=clean(request.data?.feedbackId,128);
  const status=clean(request.data?.status,24);
  if(!id || !["new","reviewed","closed"].includes(status)){
    throw new HttpsError("invalid-argument","Invalid feedback update.");
  }
  const ref=db.collection("user_feedback").doc(id);
  const snapshot=await ref.get();
  if(!snapshot.exists)throw new HttpsError("not-found","Feedback record not found.");
  await ref.update({status,updatedAt:FV.serverTimestamp()});
  await audit(caller,"feedback_updated",snapshot.get("uid") || "","Feedback status: "+status);
  return {success:true};
});

exports.adminPublishAnnouncement=onCall(async request=>{
  const caller=await requireAdmin(request);
  const title=clean(request.data?.title,100);
  const message=clean(request.data?.message,1000);
  if(!title || !message)throw new HttpsError("invalid-argument","Announcement title and message are required.");
  const ref=await db.collection("public_announcements").add({
    title,message,published:request.data?.published===true,
    createdBy:caller.uid,createdAt:FV.serverTimestamp(),updatedAt:FV.serverTimestamp()
  });
  await audit(caller,"announcement_created",ref.id,"Platform announcement created.");
  return {success:true,id:ref.id};
});

exports.adminDeleteAnnouncement=onCall(async request=>{
  const caller=await requireAdmin(request);
  const id=clean(request.data?.announcementId,128);
  if(!id)throw new HttpsError("invalid-argument","Announcement ID is required.");
  await db.collection("public_announcements").doc(id).delete();
  await audit(caller,"announcement_deleted",id,"Platform announcement deleted.");
  return {success:true};
});

exports.adminSaveDictionaryOverride=onCall(async request=>{
  const caller=await requireAdmin(request);
  const wordId=clean(request.data?.wordId,100);
  const word=clean(request.data?.word,100);
  const meaning=clean(request.data?.meaning,300);
  if(!wordId || !word || !meaning)throw new HttpsError("invalid-argument","Word and meaning are required.");
  const ref=db.collection("dictionary_overrides").doc(wordId);
  const old=await ref.get();
  await ref.set({
    word,meaning,
    definition:clean(request.data?.definition,1000),
    category:clean(request.data?.category,80),
    published:request.data?.published===true,
    updatedBy:caller.uid,
    ...(old.exists?{}:{createdAt:FV.serverTimestamp()}),
    updatedAt:FV.serverTimestamp()
  },{merge:true});
  await audit(caller,"dictionary_override_saved",wordId,"Dictionary override saved.");
  return {success:true};
});

exports.adminDeleteDictionaryOverride=onCall(async request=>{
  const caller=await requireAdmin(request);
  const id=clean(request.data?.wordId,100);
  if(!id)throw new HttpsError("invalid-argument","Dictionary word ID is required.");
  await db.collection("dictionary_overrides").doc(id).delete();
  await audit(caller,"dictionary_override_deleted",id,"Dictionary override deleted.");
  return {success:true};
});

exports.adminUpdatePlatformSetting=onCall(async request=>{
  const caller=await requireAdmin(request,true);
  const input=request.data?.settings || {};
  await db.collection("platform_settings").doc("main").set({
    siteName:clean(input.siteName,80) || "WordAtlas",
    welcomeMessage:clean(input.welcomeMessage,160),
    updatedBy:caller.uid,updatedAt:FV.serverTimestamp()
  },{merge:true});
  await audit(caller,"platform_settings_updated","","Platform settings updated.");
  return {success:true};
});

exports.adminGetSystemHealth=onCall(async request=>{
  const caller=await requireAdmin(request);
  await rateLimit(caller.uid,"system_health",30,60*60*1000);
  const firestoreCheck=await db.collection("platform_private").doc("health_check").set({
    checkedAt:FV.serverTimestamp(),checkedBy:caller.uid
  },{merge:true});
  return {
    authentication:"reachable",firestore:"reachable",functions:"reachable",
    checkedAt:new Date().toISOString(),
    note:"Availability check only; this is not an error-rate or performance monitor."
  };
});

exports.onUserProfileCreated=onDocumentCreated("users/{uid}",async event=>{
  const profile=event.data?.data();
  const uid=event.params.uid;
  if(!profile || !uid)return;
  await db.collection("users").doc(uid).collection("notifications").add({
    type:"welcome",title:"مرحبًا بك في WordAtlas",
    message:"ابدأ بحفظ الكلمات وإنشاء قوائمك الشخصية.",
    read:false,createdAt:FV.serverTimestamp()
  });
  await db.collection("audit_logs").add({
    actorUid:uid,actorEmail:clean(profile.email || "",254),
    action:"user_registered",targetUid:uid,
    summary:"A new WordAtlas profile was created.",
    createdAt:FV.serverTimestamp()
  });
});

exports.onSupportTicketCreated=onDocumentCreated("support_tickets/{ticketId}",async event=>{
  const data=event.data?.data();if(!data)return;
  await db.collection("audit_logs").add({
    actorUid:data.uid || "",action:"support_ticket_created",targetUid:data.uid || "",
    summary:"A support ticket was submitted.",createdAt:FV.serverTimestamp()
  });
  logger.info("WordAtlas support ticket created",{ticketId:event.params.ticketId});
});

exports.onFeedbackCreated=onDocumentCreated("user_feedback/{feedbackId}",async event=>{
  const data=event.data?.data();if(!data)return;
  await db.collection("audit_logs").add({
    actorUid:data.uid || "",action:"user_feedback_created",targetUid:data.uid || "",
    summary:"User feedback was submitted.",createdAt:FV.serverTimestamp()
  });
});
