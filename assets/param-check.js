(function(){
  const params = parseParams();

  // Render the parameter summary
  const sum = document.getElementById("summary");
  const sessionName = sessionCodeToDisplay(params.s) || "(unknown session)";
  sum.innerHTML = `
    <b>Session</b><span>${sessionName} — ${params.s || "(empty)"}</span>
    <b>Display name</b><span>${params.n || "(empty)"}</span>
    <b>Participant code</b><span>${params.p || "(empty)"}</span>
    <b>Trial order</b><span>${typeof params.t === "string" ? (params.t || "(empty)") : "(empty)"} </span>
    <b>Current trial index</b><span>${params.i || "0"}</span>
    <b>Mode</b><span>${params.m === "1" ? "DEV (m=1)" : "EXPERIMENT (m=0)"}</span>
  `;

  // Navigation
  document.getElementById("backBtn").addEventListener("click", () => {
    // Back to input page with current params preserved
    goto("index.html", params);
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    goto("welcome.html", params);
  });

  // In experiment mode we still allow back here; welcome page will hide it.
  setupNavVisibility(params, { allowBack: true });

  // Dev footer (no message sent on this page)
  renderDevFooter(params, "");
})();
