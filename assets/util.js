/* ===================== SESSIONS ===================== */
const SESSIONS = [
    ["XXX SET SESSSION XXX", "000000000000"],
    ["Friday October 24th at 9:20",  "202510240920"],
    ["Friday October 24th at 11:10", "202510241110"],
    ["Friday October 24th at 13:00", "202510241300"],
    ["Friday October 24th at 15:00", "202510241500"],
    ["Friday October 24th at 17:00", "202510241700"],
    ["Saturday October 25th at 12:00", "202510251200"],
    ["Saturday October 25th at 15:00", "202510251500"],
    ["Sunday October 26th at 13:00", "202510261300"],
    ["Sunday October 26th at 16:00", "202510261600"],
];

// Firebase config and initialization

(async function loadFirebase() {
  // Helper to load a script and wait until it’s ready
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Load Firebase libraries sequentially
  await loadScript("https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js");
  await loadScript("https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js");

  // Wait until the global variable exists
  if (!window.firebase) {
    console.error("Firebase failed to load");
    return;
  }

  // --- Initialize Firebase ---
  const firebaseConfig = {
      apiKey: "AIzaSyBoKMhXWiu-Ryc2d9_WesXx8SkTL5ee7ag",
  authDomain: "iri-experiment-notifications.firebaseapp.com",
  databaseURL: "https://iri-experiment-notifications-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "iri-experiment-notifications",
  storageBucket: "iri-experiment-notifications.firebasestorage.app",
  messagingSenderId: "380971249257",
  appId: "1:380971249257:web:bbf0250ce9e3a93c1bfcf8",
  measurementId: "G-HMN3BGBMBY"
  };

  // Initialize the Firebase app
  const app = firebase.initializeApp(firebaseConfig);
  const db = firebase.database();

  // Expose to other parts of your code if needed
  window.firebaseApp = app;
  window.firebaseDB = db;

  console.log("Firebase initialized inside util.js");
})();

// Helper to wait for Firebase to be ready before sending events
function onFirebaseReady(callback) {
  if (window.firebaseApp && window.firebaseDB) {
    callback();
  } else {
    const interval = setInterval(() => {
      if (window.firebaseApp && window.firebaseDB) {
        clearInterval(interval);
        callback();
      }
    }, 50);
  }
}

function sessionCodeToDisplay(code){
  const f = SESSIONS.find(([,c])=>c===code);
  return f ? f[0] : "";
}

/* ===================== PARAMS + NAV ===================== */
/*
 p = participant code (string)
 n = participant display name (string)
 s = session code (YYYYMMDDHHMM as string)
 t = trial order (string; X splits blocks)
 i = current trial index (string int; default "0")
 m = mode (0=experiment, 1=dev)
*/
function parseParams(){
  const sp = new URLSearchParams(location.search);
  return {
    p: sp.get("p") ?? "",
    n: sp.get("n") ?? "",
    s: sp.get("s") ?? "",
    t: sp.get("t") ?? "",
    i: sp.get("i") ?? "0",
    ix: sp.get("ix") ?? "",  // image index for image trials (optional)
    m: sp.get("m") ?? "0"
  };
}
function buildQuery(params){
  const sp = new URLSearchParams();
  if (params.p) sp.set("p", params.p);
  if (params.n) sp.set("n", params.n);
  if (params.s) sp.set("s", params.s);
  if (typeof params.t === "string") sp.set("t", params.t);
  sp.set("i", String(params.i ?? "0"));
  if (params.ix !== undefined && params.ix !== null && String(params.ix) !== "") {
    sp.set("ix", String(params.ix));
  }
  const base = sp.toString();
  const mode = `m=${(params.m==="1"||params.m===1)?"1":"0"}`;
  return base ? `${base}&${mode}` : mode;
}
function goto(page, params){
  location.href = `${page}?${buildQuery(params)}`;
}
function hasDev(params){ return String(params.m)==="1"; }

/* Optional UI helpers — only run if you call them */
function setupNavVisibility(params, {allowBack}){
  const back = document.getElementById("backBtn");
  if (!back) return;
  if (hasDev(params)) { back.style.display = ""; return; }
  back.style.display = allowBack ? "" : "none";
}
function renderDevFooter(params, lastMessageText=""){
  if (!hasDev(params)) return;
  const footer = document.createElement("div");
  footer.className = "dev";
  const qs = location.search.replace(/^\?/, "");
  const display = sessionCodeToDisplay(params.s) || "(unknown session)";
  footer.innerHTML = `
    <div class="kv"><b>Mode</b><span>${hasDev(params)?"DEV (m=1)":"EXPERIMENT (m=0)"}</span></div>
    <div class="kv"><b>Query String</b><span>${qs||"(none)"}</span></div>
    <div class="kv"><b>Parsed</b>
      <span>
        p: ${params.p||"(empty)"}<br/>
        n: ${params.n||"(empty)"}<br/>
        s: ${params.s||"(empty)"} ${display?`— ${display}`:""}<br/>
        t: ${params.t||"(empty)"}<br/>
        i: ${params.i||"0"}<br/>
        ix: ${params.ix!==undefined && params.ix!=="" ? params.ix : "(none)"}<br/>
        m: ${params.m}
      </span>
    </div>
    <div class="kv"><b>Firebase message</b><span>${lastMessageText||"(none)"}</span></div>
  `;
  (document.querySelector(".inner")||document.body).appendChild(footer);
}

function sendEvent(message) {
  if (
    typeof firebase === "undefined" ||
    !firebase.apps ||
    firebase.apps.length === 0 ||
    !firebase.database
  ) {
    // Firebase not available; do nothing
    return;
  }

  // Ensure all params are present in the message
  const params = parseParams();
  const fullMessage = {
    p: params.p,
    n: params.n,
    s: params.s,
    t: params.t,
    i: params.i,
    m: params.m,
    ...message // allow message to override if needed
  };

  const participantId = fullMessage.p || "unknown";
  const timestamp = new Date().toISOString();
  const messageWithTimestamp = { ...fullMessage, timestamp };

  try {
    // Write to participant-specific path
    firebase.database().ref("participants/" + participantId).set(messageWithTimestamp);
    // Add to notifications list
    firebase.database().ref("notifications").push({
      participant: participantId,
      ...fullMessage,
      timestamp
    });
    console.log("[Firebase] Sent message:", messageWithTimestamp);
    return { ok: true, message: messageWithTimestamp };
  } catch (e) {
    console.error("[Firebase] Error sending message:", e);
    return { ok: false, error: e, message: messageWithTimestamp };
  }
}

function esc(s){
  return String(s).replace(/[&<>"']/g, c => (
    {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]
  ));
}

/* ===================== TRIAL PLAN ===================== */
function splitIntoBlocks(t){
  const blocks=[]; let cur=[];
  for (const ch of (t||"")){
    if (ch==="X"){ if (cur.length) blocks.push(cur), (cur=[]); }
    else cur.push(ch);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}
function flattenTrials(blocks){
  const trials=[];
  blocks.forEach((b,bi)=>b.forEach((code,ti)=>trials.push({code,blockIndex:bi,trialInBlock:ti,trialsInBlock:b.length})));
  return trials;
}
function getPlan(t){
  const blocks=splitIntoBlocks(t);
  const trials=flattenTrials(blocks);
  return { blocks, trials, totalTrials: trials.length };
}
function isDigit(ch){ return ch>="0" && ch<="9"; }
function isImageChar(ch){ return ch==="A"||ch==="B"||ch==="C"||ch==="D"; }
function trialTypeFromCode(ch){
  if (isDigit(ch)) return {kind:"light", label:`Light (${ch})`};
  if (isImageChar(ch)) return {kind:"image", label:`Image (${ch})`};
  return {kind:"unknown", label: ch || "(none)"};
}
function getCurrentTrialInfo(params){
  const plan = getPlan(params.t||"");
  const idx = Math.min(Math.max(parseInt(params.i||"0",10)||0,0), Math.max(plan.totalTrials-1,0));
  const node = plan.trials[idx]||null;
  if (!node) return { plan, idx, info:null };
  const type = trialTypeFromCode(node.code);
  return { plan, idx, info:{
    code: node.code, type,
    blockIndex: node.blockIndex,
    trialInBlock: node.trialInBlock,
    trialsInBlock: node.trialsInBlock
  }};
}
function firstPageForTrial(info){
  return info.type.kind==="image" ? "image-stim.html" : "pre-drawing.html";
}
function isStartOfBlock(info){ return info.trialInBlock===0; }

/* ===================== ROUTING ===================== */
/* Page tokens expected by routes: "param-check","welcome","image-stim","pre-drawing","drawing","wait","end" */
function nextRoute(currentPage, params){
  const { plan, idx, info } = getCurrentTrialInfo(params);
  if (!info || plan.totalTrials===0) return { page:"end.html", params };
  const atLast = idx===plan.totalTrials-1;
  switch(currentPage){
    case "param-check": return { page: isStartOfBlock(info) ? "welcome.html" : firstPageForTrial(info), params };
    case "welcome": return { page: firstPageForTrial(info), params };
    case "image-stim": return { page: "pre-drawing.html", params };
    case "pre-drawing": return { page: "drawing.html", params };
    case "drawing": return atLast ? {page:"end.html", params} : {page:"wait.html", params};
    case "wait": {
      const nextParams = {...params, i:String(idx+1)};
      // Clear any prior image index; next trial will set its own if needed.
      delete nextParams.ix;
      const nxtInfo = getCurrentTrialInfo(nextParams).info;
      if (!nxtInfo) return { page:"end.html", params: nextParams };
      return isStartOfBlock(nxtInfo)
        ? { page:"welcome.html", params: nextParams }
        : { page:firstPageForTrial(nxtInfo), params: nextParams };
    }
    default: return { page:"end.html", params };
  }
}
function backRoute(currentPage, params){
  const { info } = getCurrentTrialInfo(params);
  switch(currentPage){
    case "welcome": return { page:"param-check.html", params };
    case "image-stim": return { page:"welcome.html", params };
    case "pre-drawing": return { page: (info && info.type.kind==="image") ? "image-stim.html" : "welcome.html", params };
    case "drawing": return { page:"pre-drawing.html", params };
    case "wait": return { page:"drawing.html", params };
    case "end": return { page:"param-check.html", params };
    default: return { page:"param-check.html", params };
  }
}

/* ===================== DISPLAY HELPERS (pure data) ===================== */
function placeholderPayload(params){
  const { plan, idx, info } = getCurrentTrialInfo(params);
  if (!info) return { trialText:"Trial 0 of 0", blockNum:0, typeLabel:"(none)", idx, totalInBlock:0 };
  return {
    trialText: `Trial ${info.trialInBlock+1} of ${info.trialsInBlock}`,
    blockNum: info.blockIndex+1,
    typeLabel: info.type.label,
    idx,
    totalInBlock: info.trialsInBlock
  };
}
function computeNextTrialMessage(params){
  const iNow = (parseInt(params.i || "0", 10) || 0);
  const nextParams = { ...params, i: String(iNow + 1) };
  const wrap = getCurrentTrialInfo(nextParams);
  const nxt = wrap && wrap.info;
  if (!nxt) return `You are about to finish.`;
  if (isStartOfBlock(nxt)) return `Please enjoy a short break.`;
  const X = nxt.trialInBlock + 1;
  const Y = nxt.trialsInBlock;
  return `You will soon begin trial ${X} of ${Y}.`;
}

/* ===================== OPTIONAL: nav binding helper (no rendering) ===================== */
function bindNavForPage(currentPage, params, ids={ back:"backBtn", next:"nextBtn", restart:"restartBtn" }){
  const backBtn = document.getElementById(ids.back);
  const nextBtn = document.getElementById(ids.next);
  const restartBtn = document.getElementById(ids.restart);
  if (backBtn) backBtn.addEventListener("click", ()=>{
    const r = backRoute(currentPage, params);
    goto(r.page, r.params);
  });
  if (nextBtn) nextBtn.addEventListener("click", ()=>{
    const r = nextRoute(currentPage, params);
    goto(r.page, r.params);
  });
  if (restartBtn) restartBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    goto("param-check.html", params);
  });
}

/* ===================== PUBLIC API ===================== */
window.VE = {
  // data
  SESSIONS, sessionCodeToDisplay,
  // params + nav
  parseParams, buildQuery, goto, hasDev, setupNavVisibility, renderDevFooter, sendEvent, esc,
  // plan
  splitIntoBlocks, flattenTrials, getPlan, isDigit, isImageChar, trialTypeFromCode, getCurrentTrialInfo,
  // routing
  firstPageForTrial, isStartOfBlock, nextRoute, backRoute,
  // display helpers
  placeholderPayload, computeNextTrialMessage,
  // optional DOM helper (no auto call)
  bindNavForPage
};
