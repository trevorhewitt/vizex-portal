(function(){
  // Populate session dropdown
  const sel = document.getElementById("sessionSelect");
  SESSIONS.forEach(([name, code]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    sel.appendChild(opt);
  });

  // If arriving with params, pre-fill (useful in dev)
  const params = parseParams();
  if (params.s) sel.value = params.s;
  if (params.n) document.getElementById("nameInput").value = params.n;
  if (params.p) document.getElementById("codeInput").value = params.p;
  if (typeof params.t === "string") document.getElementById("orderInput").value = params.t;
  if (params.i) document.getElementById("indexInput").value = params.i;
  if (params.m) document.getElementById("modeSelect").value = params.m;

  document.getElementById("nextBtn").addEventListener("click", () => {
    const nextParams = {
      p: document.getElementById("codeInput").value.trim(),
      n: document.getElementById("nameInput").value.trim(),
      s: document.getElementById("sessionSelect").value,
      t: document.getElementById("orderInput").value.trim(),
      i: String(parseInt(document.getElementById("indexInput").value || "0", 10) || 0),
      m: document.getElementById("modeSelect").value
    };
    goto("param-check.html", nextParams);
  });

  // Dev footer (no message sent on this page)
  renderDevFooter(params, "");
})();
