/* Shared helpers for query params + navigation + dev footer */

const SESSIONS = [
  // Display name → code YYYYMMDDHHMM
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

function sessionDisplayToCode(display) {
  const found = SESSIONS.find(([name]) => name === display);
  return found ? found[1] : "";
}

function sessionCodeToDisplay(code) {
  const found = SESSIONS.find(([, c]) => c === code);
  return found ? found[0] : "";
}

/* Compact query parameter schema
   p = participant code (string)
   n = participant display name (string) – for display only
   s = session code (YYYYMMDDHHMM as string)
   t = trial order (string of condition chars) (optional, may be "")
   i = current trial index (integer as string; default "0")
   m = mode (0=experiment, 1=dev)  <-- ALWAYS LAST
*/
function parseParams() {
  const sp = new URLSearchParams(location.search);
  const obj = {
    p: sp.get("p") ?? "",
    n: sp.get("n") ?? "",
    s: sp.get("s") ?? "",
    t: sp.get("t") ?? "",
    i: sp.get("i") ?? "0",
    m: sp.get("m") ?? "0"
  };
  return obj;
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  if (params.p) sp.set("p", params.p);
  if (params.n) sp.set("n", params.n);
  if (params.s) sp.set("s", params.s);
  // Allow empty trial order and index but include if present
  if (typeof params.t === "string") sp.set("t", params.t);
  if (typeof params.i === "string" || typeof params.i === "number") sp.set("i", String(params.i ?? "0"));
  // Mode must be last: manually append to ensure order
  const base = sp.toString();
  const mode = `m=${params.m === "1" || params.m === 1 ? "1" : "0"}`;
  return base ? `${base}&${mode}` : mode;
}

function goto(page, params) {
  const q = buildQuery(params);
  location.href = `${page}?${q}`;
}

function hasDev(params){ return String(params.m) === "1"; }

/* Developer footer: shows mode, query string, parsed values, and last “message” */
function renderDevFooter(params, lastMessageText = "") {
  if (!hasDev(params)) return;

  const footer = document.createElement("div");
  footer.className = "dev";
  const qs = location.search.replace(/^\?/, "");
  const display = sessionCodeToDisplay(params.s) || "(unknown session)";

  footer.innerHTML = `
    <div class="kv"><b>Mode</b><span>${hasDev(params) ? "DEV (m=1)" : "EXPERIMENT (m=0)"}</span></div>
    <div class="kv"><b>Query String</b><span>${qs || "(none)"}</span></div>
    <div class="kv"><b>Parsed</b>
      <span>
        p (participant code): ${params.p || "(empty)"}<br/>
        n (display name): ${params.n || "(empty)"}<br/>
        s (session code): ${params.s || "(empty)"} ${display ? `— ${display}` : ""}<br/>
        t (trial order): ${params.t || "(empty)"}<br/>
        i (current trial index): ${params.i || "0"}<br/>
        m (mode): ${params.m}
      </span>
    </div>
    <div class="kv"><b>Firebase message</b><span>${lastMessageText || "(none)"}</span></div>
  `;

  const cont = document.querySelector(".inner") || document.body;
  cont.appendChild(footer);
}

/* Simulated “send to Firebase” (no network). Records what would be sent. */
function sendEventSimulated(message){
  console.log("[Simulated Firebase] Sent message:", message);
  return { ok: true, message };
}

/* Utility: conditionally show/hide back button in experiment mode */
function setupNavVisibility(params, opts){
  const back = document.getElementById("backBtn");
  if (!back) return;

  const allowBack = opts?.allowBack ?? true;
  if (!hasDev(params)) {
    // Experiment mode—hide back if page specifies no back
    back.style.display = allowBack ? "" : "none";
  } else {
    // Dev mode—always show back
    back.style.display = "";
  }
}
