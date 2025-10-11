/* ===================== SESSIONS ===================== */
const SESSIONS = [
  ["Friday October 17th at 9:20",  "202510170920"],
  ["Friday October 17th at 11:00", "202510171100"],
  ["Friday October 17th at 12:40", "202510171240"],
  ["Friday October 17th at 14:20", "202510171420"],
  ["Friday October 17th at 16:00", "202510171600"],
  ["Saturday October 18th at 9:20","202510180920"],
  ["Saturday October 18th at 11:00","202510181100"],
  ["Saturday October 18th at 12:40","202510181240"],
  ["Saturday October 18th at 14:20","202510181420"],
  ["Saturday October 18th at 16:00","202510181600"],
  ["Friday October 24th at 9:20",  "202510240920"],
  ["Friday October 24th at 11:00", "202510241100"],
  ["Friday October 24th at 12:40", "202510241240"],
  ["Friday October 24th at 14:20", "202510241420"],
  ["Friday October 24th at 16:00", "202510241600"]
];
function sessionCodeToDisplay(code){
  const f = SESSIONS.find(([,c])=>c===code);
  return f ? f[0] : "";
}

/* ===================== PARAMS + NAV ===================== */
/* p = participant code, n = display name, s = session code, t = trial order string,
   i = current trial index (over trials only), m = mode (0/1, ALWAYS LAST) */
function parseParams(){
  const sp = new URLSearchParams(location.search);
  return {
    p: sp.get("p") ?? "",
    n: sp.get("n") ?? "",
    s: sp.get("s") ?? "",
    t: sp.get("t") ?? "",
    i: sp.get("i") ?? "0",
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
  const base = sp.toString();
  const mode = `m=${(params.m==="1"||params.m===1)?"1":"0"}`;
  return base ? `${base}&${mode}` : mode;
}

/* Project root on GitHub Pages (e.g., /vizex-portal/) */
const SITE_BASE = (() => {
  const segs = location.pathname.split("/").filter(Boolean);
  return segs.length ? `/${segs[0]}/` : "/";
})();

function goto(page, params){
  const clean = page.startsWith("/") ? page.slice(1) : page;
  location.href = `${SITE_BASE}${clean}?${buildQuery(params)}`;
}
function hasDev(params){ return String(params.m)==="1"; }
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
        m: ${params.m}
      </span>
    </div>
    <div class="kv"><b>Firebase message</b><span>${lastMessageText||"(none)"}</span></div>
  `;
  (document.querySelector(".inner")||document.body).appendChild(footer);
}
function sendEventSimulated(message){
  console.log("[Simulated Firebase] Sent message:", message);
  return { ok:true, message };
}
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ===================== TRIAL FLOW ===================== */
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
function firstPageForTrial(info){ return info.type.kind==="image" ? "image-stim.html" : "pre-drawing.html"; }
function isStartOfBlock(info){ return info.trialInBlock===0; }

function nextRoute(currentPage, params){
  const { plan, idx, info } = getCurrentTrialInfo(params);
  if (!info || plan.totalTrials===0) return { page:"end.html", params };
  const atLast = idx===plan.totalTrials-1;
  switch(currentPage){
    case "param-check": return { page: isStartOfBlock(info) ? "welcome.html" : firstPageForTrial(info), params };
    case "welcome":     return { page: firstPageForTrial(info), params };
    case "image-stim":  return { page: "pre-drawing.html", params };
    case "pre-drawing": return { page: "drawing.html", params };
    case "drawing":     return atLast ? {page:"end.html", params} : {page:"wait.html", params};
    case "wait": {
      const nextParams = {...params, i:String(idx+1)};
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
    case "welcome":     return { page:"param-check.html", params };
    case "image-stim":  return { page:"welcome.html", params };
    case "pre-drawing": return { page: (info && info.type.kind==="image") ? "image-stim.html" : "welcome.html", params };
    case "drawing":     return { page:"pre-drawing.html", params };
    case "wait":        return { page:"drawing.html", params };
    case "end":         return { page:"param-check.html", params };
    default:            return { page:"param-check.html", params };
  }
}

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

/* ===================== PAGE DISPATCH ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const page = (document.body.dataset.page||"").trim();
  const params = parseParams();
  setupPage(page, params);
});

function setupPage(page, params){
  switch(page){

    case "index": {
      const sel = document.getElementById("sessionSelect");
      SESSIONS.forEach(([name, code])=>{
        const opt=document.createElement("option"); opt.value=code; opt.textContent=name; sel.appendChild(opt);
      });
      if (params.s) sel.value = params.s;
      if (params.n) document.getElementById("nameInput").value = params.n;
      if (params.p) document.getElementById("codeInput").value = params.p;
      if (typeof params.t==="string") document.getElementById("orderInput").value = params.t;
      if (params.i) document.getElementById("indexInput").value = params.i;
      if (params.m) document.getElementById("modeSelect").value = params.m;

      document.getElementById("nextBtn").addEventListener("click", ()=>{
        const nextParams = {
          p: document.getElementById("codeInput").value.trim(),
          n: document.getElementById("nameInput").value.trim(),
          s: document.getElementById("sessionSelect").value,
          t: document.getElementById("orderInput").value.trim(),
          i: String(parseInt(document.getElementById("indexInput").value||"0",10)||0),
          m: document.getElementById("modeSelect").value
        };
        goto("param-check.html", nextParams);
      });
      renderDevFooter(params, "");
      break;
    }

    case "param-check": {
      const sum = document.getElementById("summary");
      const sessionName = sessionCodeToDisplay(params.s) || "(unknown session)";
      sum.innerHTML = `
        <b>Session</b><span>${sessionName} — ${params.s || "(empty)"}</span>
        <b>Display name</b><span>${params.n || "(empty)")}</span>
        <b>Participant code</b><span>${params.p || "(empty)")}</span>
        <b>Trial order</b><span>${typeof params.t==="string" ? (params.t||"(empty)") : "(empty)"} </span>
        <b>Current trial index</b><span>${params.i || "0"}</span>
        <b>Mode</b><span>${params.m==="1" ? "DEV (m=1)" : "EXPERIMENT (m=0)"}</span>
      `;
      document.getElementById("backBtn").addEventListener("click", ()=> goto("index.html", params));
      document.getElementById("nextBtn").addEventListener("click", ()=>{
        const r = nextRoute("param-check", params);
        goto(r.page, r.params);
      });
      setupNavVisibility(params, {allowBack:true});
      renderDevFooter(params, "");
      break;
    }

    case "welcome": {
      const inner = document.getElementById("welcomeInner");
      const payload = placeholderPayload(params);
      const name = params.n ? `, ${esc(params.n)}` : "";
      inner.innerHTML = `
        <h1>Welcome back to The Vision Experiment${name}</h1>
        <div class="kv" style="margin-top:10px;">
          <b>Block</b><span>${payload.blockNum}</span>
          <b>Trial</b><span>${payload.trialText}</span>
          <b>Trial type</b><span>${payload.typeLabel}</span>
        </div>
        <div class="wait-wrap" style="margin-top:16px;">
          <h1>WAIT</h1>
        </div>
        <p>Please wait. In a moment, the researcher will instruct you to proceed.</p>
      `;
      const message = "experiment setup";
      const result = sendEventSimulated(message);
      document.getElementById("backBtn").addEventListener("click", ()=>{
        const r = backRoute("welcome", params);
        goto(r.page, r.params);
      });
      document.getElementById("nextBtn").addEventListener("click", ()=>{
        const r = nextRoute("welcome", params);
        goto(r.page, r.params);
      });
      setupNavVisibility(params, {allowBack:false});
      renderDevFooter(params, result.ok ? message : "(failed)");
      break;
    }

    case "image-stim":
    case "pre-drawing":
    case "drawing":
    case "wait": {
      const root = document.getElementById("root");
      const p = placeholderPayload(params);
      const titleMap = {
        "image-stim": "Placeholder — IMAGE_STIM",
        "pre-drawing": "Placeholder — PRE_DRAWING",
        "drawing": "Placeholder — DRAWING",
        "wait": "Placeholder — WAIT"
      };
      const extraWait = page==="wait" ? `
        <div class="wait-wrap" style="margin-top:16px;"><h1>WAIT</h1></div>
        <p>Please wait. In a moment, the researcher will instruct you to proceed.</p>
      ` : "";
      root.innerHTML = `
        <h1>${titleMap[page]}</h1>
        <div class="kv">
          <b>Trial</b><span>${p.trialText}</span>
          <b>Block</b><span>${p.blockNum}</span>
          <b>Trial type</b><span>${p.typeLabel}</span>
        </div>
        ${extraWait}
      `;
      document.getElementById("backBtn").addEventListener("click", ()=>{
        const r = backRoute(page, params);
        goto(r.page, r.params);
      });
      document.getElementById("nextBtn").addEventListener("click", ()=>{
        const r = nextRoute(page, params);
        goto(r.page, r.params);
      });
      const allowBack = (page==="drawing") ? hasDev(params) : true;
      setupNavVisibility(params, {allowBack});
      renderDevFooter(params, "");
      break;
    }

    case "end": {
      const root = document.getElementById("root");
      const { plan } = getCurrentTrialInfo(params);
      root.innerHTML = `
        <h1>END</h1>
        <p>All trials completed (${plan.totalTrials}).</p>
      `;
      document.getElementById("backBtn").addEventListener("click", ()=>{
        const r = backRoute("end", params);
        goto(r.page, r.params);
      });
      const restart = document.getElementById("restartBtn");
      if (restart){
        restart.addEventListener("click", (e)=>{
          e.preventDefault();
          goto("param-check.html", params);
        });
      }
      setupNavVisibility(params, {allowBack:true});
      renderDevFooter(params, "experiment finished");
      break;
    }

    default: break;
  }
}
