// Live "watching now" counter. Each open tab adds one anonymous entry under /presence in Firebase
// Realtime Database and removes it when the tab closes (onDisconnect). No names, no IPs, nothing personal.
// The config below is public by design (Firebase web keys identify the project; the database rules protect it).
const FIREBASE = window.YCFA_FIREBASE || null;

const pill = document.getElementById("liveCount");
const STALE_MS = 6 * 60 * 60 * 1000; // ignore entries older than 6 h (a crashed browser that never said goodbye)

async function start() {
  if (!FIREBASE || !pill) return;
  const V = "10.12.2";
  const [{ initializeApp }, db] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
  ]);
  const app = initializeApp(FIREBASE);
  const d = db.getDatabase(app);
  const list = db.ref(d, "presence");
  const me = db.push(list);
  let offset = 0;
  db.onValue(db.ref(d, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  db.onValue(db.ref(d, ".info/connected"), async (s) => {
    if (s.val() !== true) return;
    await db.onDisconnect(me).remove();
    await db.set(me, { t: db.serverTimestamp() });
  });
  db.onValue(list, (s) => {
    const now = Date.now() + offset;
    let n = 0;
    s.forEach((c) => { const t = c.child("t").val(); if (typeof t === "number" && now - t < STALE_MS) n++; });
    show(Math.max(1, n)); // you are always watching
  });
  window.addEventListener("pagehide", () => { db.remove(me).catch(() => {}); });
}

function show(n) {
  const b = pill.querySelector("b");
  if (b.textContent !== String(n)) {
    b.textContent = n;
    pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
  }
  pill.title = `${n} ${n === 1 ? "person" : "people"} on the site right now`;
  pill.hidden = false;
}

start().catch(() => { if (pill) pill.hidden = true; }); // counter is a nice-to-have: never break the site
