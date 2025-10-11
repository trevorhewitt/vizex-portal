(function(){
  const params = parseParams();

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

  document.getElementById("backBtn").addEventListener("click", () => {
    goto("index.html", params);
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    const r = VXFlow.nextRoute("param-check", params);
    location.href = `${r.page}?${buildQuery(r.params)}`;
  });

  setupNavVisibility(params, { allowBack: true });
  renderDevFooter(params, "");
})();
