(function(){
  const params = parseParams();

  // Title + WAIT block + instruction
  const name = params.n ? params.n : "";
  const inner = document.getElementById("welcomeInner");
  inner.innerHTML = `
    <h1>Welcome back to The Vision Experiment${name ? ", " + escapeHtml(name) : ""}</h1>

    <div class="wait-wrap">
      <h1>WAIT</h1>
    </div>

    <p>Please wait. In a moment, the researcher will instruct you to proceed.</p>
  `;

  // Simulate Firebase message on this page
  const message = "experiment setup";
  const result = sendEventSimulated(message);

  // Buttons: this page must have NO back button in experiment mode
  document.getElementById("backBtn").addEventListener("click", () => {
    // In dev mode only, go back to param-check
    goto("param-check.html", params);
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    // Next step in the real flow would branch on trial order / index.
    // For now we just loop back to param-check as a placeholder for further pages.
    goto("param-check.html", params);
  });

  setupNavVisibility(params, { allowBack: false });

  // Dev footer shows the message that was “sent”
  renderDevFooter(params, result.ok ? message : "(failed)");

  // Helpers
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }
})();
