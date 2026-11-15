import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";

const projectId = "demo-wordatlas-rules";
let testEnv;

const profile = (uid, email) => ({
  uid,
  displayName: uid === "alice" ? "Alice Example" : "Bob Example",
  email,
  photoURL: null,
  providerId: "google.com",
  emailVerified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lastLoginAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
});

function signedIn(uid = "alice", email = "alice@example.com", role) {
  const claims = { email, email_verified: true };
  if (role) claims.role = role;
  return testEnv.authenticatedContext(uid, claims).firestore();
}

before(async () => {
  const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "alice"), profile("alice", "alice@example.com"));
    await setDoc(doc(db, "users", "bob"), profile("bob", "bob@example.com"));
    await setDoc(doc(db, "users", "root-admin"), {
      ...profile("root-admin", "admin@example.com"), role: "admin", status: "active"
    });
    await setDoc(doc(db, "users", "alice", "private_data", "favorites"), {
      items: ["001"], updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "users", "bob", "private_data", "favorites"), {
      items: ["002"], updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "public_announcements", "published"), {
      title: "Published", message: "Visible to members", published: true
    });
    await setDoc(doc(db, "public_announcements", "draft"), {
      title: "Draft", message: "Not public to members", published: false
    });
    await setDoc(doc(db, "users", "bob", "notifications", "private-note"), {
      title: "Bob's private notification", read: false
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("unauthenticated visitors cannot read member profiles or private data", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users", "alice")));
  await assertFails(getDoc(doc(db, "users", "alice", "private_data", "favorites")));
});

test("members can read their own profile but not another member's profile", async () => {
  const db = signedIn();
  await assertSucceeds(getDoc(doc(db, "users", "alice")));
  await assertFails(getDoc(doc(db, "users", "bob")));
  await assertFails(getDocs(collection(db, "users")));
});

test("private collections are scoped to their owner", async () => {
  const db = signedIn();
  await assertSucceeds(getDoc(doc(db, "users", "alice", "private_data", "favorites")));
  await assertFails(getDoc(doc(db, "users", "bob", "private_data", "favorites")));
  await assertFails(getDoc(doc(db, "users", "bob", "notifications", "private-note")));
  await assertSucceeds(setDoc(doc(db, "users", "alice", "private_data", "favorites"), {
    items: ["003"], updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, "users", "bob", "private_data", "favorites"), {
    items: ["004"], updatedAt: serverTimestamp()
  }));
});

test("profiles without a status field remain active, while suspended accounts are denied", async () => {
  const aliceDb = signedIn();
  await assertSucceeds(getDoc(doc(aliceDb, "users", "alice")));
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", "bob"), { status: "suspended" });
  });
  const bobDb = signedIn("bob", "bob@example.com");
  await assertFails(getDoc(doc(bobDb, "users", "bob")));
  await assertFails(getDoc(doc(bobDb, "users", "bob", "private_data", "favorites")));
});

test("members can update allowed profile fields but cannot promote themselves", async () => {
  const db = signedIn();
  await assertSucceeds(updateDoc(doc(db, "users", "alice"), {
    displayName: "Alice Updated",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, "users", "alice"), {
    role: "super_admin",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, "users", "alice"), {
    status: "active",
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(doc(db, "users", "alice")));
});

test("browser clients cannot write trusted session, analytics, audit or login records", async () => {
  const db = signedIn();
  await assertFails(setDoc(doc(db, "active_sessions", "alice-session"), { uid: "alice", active: true }));
  await assertFails(setDoc(doc(db, "analytics_events", "search"), { uid: "alice", type: "search_performed" }));
  await assertFails(setDoc(doc(db, "audit_logs", "event"), { actorUid: "alice", action: "user_role_changed" }));
  await assertFails(setDoc(doc(db, "login_events", "event"), { uid: "alice", eventType: "login" }));
});

test("members can read published announcements but not drafts", async () => {
  const db = signedIn();
  await assertSucceeds(getDoc(doc(db, "public_announcements", "published")));
  await assertFails(getDoc(doc(db, "public_announcements", "draft")));
  await assertFails(setDoc(doc(db, "public_announcements", "fake"), {
    title: "Injected", message: "No", published: true
  }));
});

test("members can create their own support tickets and feedback only", async () => {
  const db = signedIn();
  await assertSucceeds(setDoc(doc(db, "support_tickets", "alice-ticket"), {
    uid: "alice", type: "bug", subject: "Search issue", message: "Search result did not load.",
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, "support_tickets", "for-bob"), {
    uid: "bob", type: "bug", subject: "Search issue", message: "Search result did not load.",
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(db, "user_feedback", "alice-feedback"), {
    uid: "alice", rating: 5, message: "Helpful dictionary.", status: "new",
    createdAt: serverTimestamp()
  }));
});

test("only trusted and current Admin claims can list member profiles", async () => {
  const adminDb = signedIn("root-admin", "admin@example.com", "admin");
  const memberDb = signedIn("alice");
  await assertSucceeds(getDocs(collection(adminDb, "users")));
  await assertFails(getDocs(collection(memberDb, "users")));
  const staleRoleDb = signedIn("root-admin", "admin@example.com", "super_admin");
  await assertFails(getDocs(collection(staleRoleDb, "users")));
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", "root-admin"), { status: "suspended" });
  });
  const suspendedAdminDb = signedIn("root-admin", "admin@example.com", "admin");
  await assertFails(getDocs(collection(suspendedAdminDb, "users")));
  await assertFails(getDoc(doc(suspendedAdminDb, "users", "root-admin")));
});
test("profile creation remains possible for a signed-in user without a profile", async () => {
  const db = signedIn("new-user", "new@example.com");
  await assertSucceeds(setDoc(doc(db, "users", "new-user"), {
    uid: "new-user", displayName: "New User", email: "new@example.com",
    photoURL: null, providerId: "google.com", emailVerified: true,
    createdAt: serverTimestamp(), lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(db, "users", "new-user")));
});
test("suspended users cannot use member-only collections", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", "bob"), { status: "suspended" });
  });
  const db = signedIn("bob", "bob@example.com");
  await assertFails(getDoc(doc(db, "public_announcements", "published")));
  await assertFails(setDoc(doc(db, "support_tickets", "blocked"), {
    uid: "bob", type: "bug", subject: "Blocked", message: "Suspended account should not submit this.",
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, "user_feedback", "blocked"), {
    uid: "bob", rating: 5, message: "Suspended account should not submit this.",
    status: "new", createdAt: serverTimestamp()
  }));
});
