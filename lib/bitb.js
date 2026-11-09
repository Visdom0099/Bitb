// Shared code for the BITB List API (runs on Vercel).
// It reads and writes the same Firestore data as index.html, in the same shape,
// so anything added through the API shows up live in the app.

const crypto = require("crypto");

const MAX_TEXT = 200; // same limit as the "Add a task" box

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Firebase starts on the first request (after the API key check), so a setup
// problem shows up as a clear message instead of a crash.
let admin, db;
function setup() {
  if (db) return;
  try { admin = require("firebase-admin"); }
  catch (e) { console.error(e); throw new HttpError(500, "Server setup: the firebase-admin library didn't install. Check package.json"); }

  // FIREBASE_SERVICE_ACCOUNT = the whole JSON key file from
  // Firebase console > Project settings > Service accounts > Generate new private key
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) throw new HttpError(500, "Server setup: FIREBASE_SERVICE_ACCOUNT isn't set in Vercel");
  let creds;
  try { creds = JSON.parse(raw); }
  catch (e) { throw new HttpError(500, "Server setup: FIREBASE_SERVICE_ACCOUNT isn't the full key file. Paste the whole file again"); }
  if (typeof creds.private_key === "string") creds.private_key = creds.private_key.replace(/\\n/g, "\n");

  try {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) });
    db = admin.firestore();
  } catch (e) {
    console.error(e);
    throw new HttpError(500, "Server setup: Firebase rejected the key in FIREBASE_SERVICE_ACCOUNT");
  }
}

const cleanEmail = v => (typeof v === "string" ? v.trim().toLowerCase() : "");
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function checkKey(req) {
  const header = req.headers.authorization || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (req.headers["x-api-key"] || "");
  const want = process.env.BITB_API_KEY || "";
  const a = Buffer.from(String(given));
  const b = Buffer.from(want);
  if (!want || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, "Missing or wrong API key");
  }
}

async function uidForEmail(email) {
  if (!isEmail(email)) throw new HttpError(400, "Give a valid email");
  try { return (await admin.auth().getUserByEmail(email)).uid; }
  catch (e) { throw new HttpError(404, "No BITB List user signed in with " + email); }
}

async function getList(id) {
  if (!id) throw new HttpError(400, "Give a list id");
  const snap = await db.collection("lists").doc(String(id)).get();
  if (!snap.exists) throw new HttpError(404, "No list with id " + id);
  return { id: snap.id, ...snap.data() };
}

// Personal tasks live in users/{uid}/tasks, shared ones in lists/{id}/tasks.
async function taskCollection(src) {
  if (src.list) {
    const list = await getList(src.list);
    return db.collection("lists").doc(list.id).collection("tasks");
  }
  const uid = await uidForEmail(cleanEmail(src.email));
  return db.collection("users").doc(uid).collection("tasks");
}

const toJson = d => ({ id: d.id, ...d.data() });

// ---------- actions ----------

async function listLists(query) {
  const email = cleanEmail(query.email);
  if (!isEmail(email)) throw new HttpError(400, "Give ?email=");
  const snap = await db.collection("lists").where("memberEmails", "array-contains", email).get();
  return { lists: snap.docs.map(d => {
    const l = d.data();
    return { id: d.id, name: l.name, ownerEmail: l.ownerEmail, memberEmails: l.memberEmails || [], createdAt: l.createdAt };
  }) };
}

async function listTasks(query) {
  const col = await taskCollection(query);
  const assignee = cleanEmail(query.assignee);
  const snap = await (query.list && assignee ? col.where("assignee", "==", assignee) : col).get();
  return { tasks: snap.docs.map(toJson) };
}

async function addTask(b) {
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) throw new HttpError(400, "Give the task text");
  if (text.length > MAX_TEXT) throw new HttpError(400, "Task text is longer than " + MAX_TEXT + " characters");

  const data = { text, done: false, createdAt: Date.now() };
  if (b.list) {
    const list = await getList(b.list);
    const members = list.memberEmails || [];
    const createdBy = cleanEmail(b.createdBy) || list.ownerEmail;
    const assignee = cleanEmail(b.assignee) || createdBy;
    if (!members.includes(createdBy)) throw new HttpError(400, createdBy + " is not on this list");
    if (!members.includes(assignee)) throw new HttpError(400, assignee + " is not on this list");
    data.createdBy = createdBy;
    data.assignee = assignee;
  } else {
    data.createdBy = cleanEmail(b.email);
  }
  const ref = await (await taskCollection(b)).add(data);
  return { task: { id: ref.id, ...data } };
}

async function updateTask(id, b) {
  const ref = (await taskCollection(b)).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "No task with id " + id);

  const patch = {};
  if (typeof b.text === "string") {
    const text = b.text.trim();
    if (!text || text.length > MAX_TEXT) throw new HttpError(400, "Task text must be 1 to " + MAX_TEXT + " characters");
    patch.text = text;
  }
  if (typeof b.done === "boolean") {
    const t = snap.data();
    Object.assign(patch, b.done
      ? { done: true, doneBy: cleanEmail(b.doneBy) || t.assignee || t.createdBy || null, doneAt: Date.now() }
      : { done: false, doneBy: null, doneAt: null });
  }
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to change. Send done and/or text");
  await ref.update(patch);
  return { task: { id, ...snap.data(), ...patch } };
}

async function deleteTask(id, src) {
  const ref = (await taskCollection(src)).doc(id);
  if (!(await ref.get()).exists) throw new HttpError(404, "No task with id " + id);
  await ref.delete();
  return { deleted: id };
}

// Wraps a Vercel handler: checks the key, picks the action for the method, sends JSON.
function handler(routes) {
  return async (req, res) => {
    try {
      checkKey(req);
      setup();
      const run = routes[req.method];
      if (!run) throw new HttpError(405, req.method + " isn't supported here");
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const out = await run(req.query || {}, body);
      res.status(req.method === "POST" ? 201 : 200).json(out);
    } catch (e) {
      if (e instanceof SyntaxError) e = new HttpError(400, "Body isn't valid JSON");
      if (!(e instanceof HttpError)) console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : "Something went wrong" });
    }
  };
}

module.exports = { handler, listLists, listTasks, addTask, updateTask, deleteTask };
