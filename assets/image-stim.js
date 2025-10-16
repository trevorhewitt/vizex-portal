// assets/image-stim.js
// Requires assets/util.js (window.VE)

(function(){
  const FIXATION_SRC = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Eo_circle_green_letter-x.svg/768px-Eo_circle_green_letter-x.svg.png?20200417132944";
  const FIXATION_ALT = "Fixation cross placeholder";

  // Placeholder lists — replace with your real URLs
  const IMAGE_LISTS = {
    A: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_mEjWa0RPSj0tmAT",
    ],
    B: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_ec1NcgaIPXJB8Ew",
    ],
    C: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_L1d5zOQh26lEIO1",
    ],
    D: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_kaQ5mmGrgfjMEgF",
    ],
  };
  function pickForCode(code){
    const list = IMAGE_LISTS[code] || IMAGE_LISTS.A || [];
    if (!list.length) return null;
    const idx = Math.floor(Math.random() * list.length);
    return { src: list[idx], alt: `Stimulus ${code} placeholder`, idx };
  }
  function preload(src){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=> resolve(true);
      img.onerror = ()=> reject(new Error("image failed to load: " + src));
      img.src = src;
    });
  }

  function htmlStage1(){
    return `
      <div class="center-wrap stage1-wrap">
        <div class="button-bar">
          <!-- Use site's normal primary button styling -->
          <button id="startStimBtn" class="primary">click here when you are ready to see the image</button>
        </div>
      </div>
    `;
  }
  function htmlStage2(){
    return `
      <div class="center-wrap">
        <div class="stimulus-box">
          <img id="fixImg" src="${FIXATION_SRC}" alt="${VE.esc(FIXATION_ALT)}" />
        </div>
      </div>
    `;
  }
  function htmlStage3(stim){
    return `
      <div class="center-wrap">
        <div class="stimulus-box">
          <img id="stimImg" src="${VE.esc(stim.src)}" alt="${VE.esc(stim.alt)}" />
        </div>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", function(){
    const params = VE.parseParams();
    const root = document.getElementById("root");

    // Bind nav
    VE.bindNavForPage("image-stim", params);

    // Show/hide nav based on dev mode:
    // - Back: in dev, always shown by setupNavVisibility; in experiment, hidden
    // - Next: in dev, visible (so you can skip); in experiment, hidden
    const dev = VE.hasDev(params);
    VE.setupNavVisibility(params, { allowBack: false });
    const nextBtn = document.getElementById("nextBtn");
    if (nextBtn) nextBtn.style.display = dev ? "" : "none";

    // Choose stimulus now and start preloading immediately (while we're in Stage 1)
    const infoWrap = VE.getCurrentTrialInfo(params);
    const cur = infoWrap && infoWrap.info;
    const code = (cur && cur.code) || "A";
    const chosen = pickForCode(code);

    let imageReady = false;
    let preloadErr = null;

    if (chosen) {
      preload(chosen.src)
        .then(()=> { imageReady = true; })
        .catch(err => { preloadErr = err; });
    }

    // ===== Stage 1 =====
    root.innerHTML = htmlStage1();
    VE.renderDevFooter(params, `image-stim: chosen=${code}, ix=${chosen ? chosen.idx : "n/a"}`);


    const startBtn = document.getElementById("startStimBtn");
    startBtn.addEventListener("click", async ()=>{
      // ===== Stage 2 (fixation) =====
      root.innerHTML = htmlStage2();

      const fixationMinMs = 5000;
      const tStartFix = performance.now();

      // Wait at least 5s; if image not ready, wait longer.
      // Add a safety cap (e.g., 30s) so you don't soft-lock if an image 404s.
      const safetyCapMs = 30000;

      function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

      // Ensure minimum 5s
      const elapsedNow = performance.now() - tStartFix;
      const remaining = Math.max(0, fixationMinMs - elapsedNow);
      if (remaining > 0) await sleep(remaining);

      const tFixEndMin = performance.now();
      const tFixMaxEnd = tStartFix + safetyCapMs;

      while (!imageReady && performance.now() < tFixMaxEnd) {
        await sleep(100);
      }
      // If we hit an error or the cap, proceed anyway (dev can use Next)
      // => chosen may fail to render; we’ll fall back below.

      // ===== Stage 3 (stimulus) =====
      if (!chosen || preloadErr) {
        // Fail-safe: just advance (avoids hanging)
        const r = VE.nextRoute("image-stim", params);
        if (chosen && Number.isInteger(chosen.idx)) {
          r.params = { ...r.params, ix: String(chosen.idx) };
        }
        VE.goto(r.page, r.params);
        return;
      }

      root.innerHTML = htmlStage3(chosen);
      const imgEl = document.getElementById("stimImg");

      // Exact 20s on-screen for the stimulus:
      // 0–17s visible; 17–20s fade; at 20s -> auto-advance
      const fadeAt = 17000;
      const endAt  = 20000;

      const timers = [];
      timers.push(setTimeout(()=> { if (imgEl) imgEl.style.opacity = "0"; }, fadeAt));
      timers.push(setTimeout(()=> {
        const r = VE.nextRoute("image-stim", params);
        if (chosen && Number.isInteger(chosen.idx)) {
          r.params = { ...r.params, ix: String(chosen.idx) };
        }
        VE.goto(r.page, r.params);
      }, endAt));

      // If navigating away early, clear timers
      window.addEventListener("beforeunload", ()=> timers.forEach(clearTimeout), { once:true });
    });
  });
})();