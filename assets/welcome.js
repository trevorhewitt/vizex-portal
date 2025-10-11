(function(){
  const params = parseParams();
  const name = params.n ? params.n : "";
  const inner = document.getElementById("welcomeInner");

  const payload = VXFlow.placeholderPayload(params);

  inner.innerHTML = `
    <h1>Welcome back to The Vision Experiment${name ? ", " + escapeHtml(name) : ""}</h1>

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

  document.getElementById("backBtn").addEventListener("click", () => {
    const r = VXFlow.backRoute("welcome", params);
    location.href = typeof r.page === "string" && r.page.endsWith(".html")
      ? `${r.page}?${buildQuery(r.params)}`
      : `${r.page}?${buildQuery(r.params)}`;
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    const r = VXFlow.nextRoute("welcome", params);
    location.href = `${r.page}?${buildQuery(r.params)}`;
  });

  setupNavVisibility(params, { allowBack: false });
  renderDevFooter(params, result.ok ? message : "(failed)");

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }
})();
