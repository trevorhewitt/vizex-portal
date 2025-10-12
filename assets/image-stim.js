// assets/image-stim.js
// Requires assets/util.js (window.VE)

(function(){
  const FIXATION_SRC = "https://via.placeholder.com/500?text=+"; // placeholder cross img URL; replace with your real cross
  const FIXATION_ALT = "Fixation cross placeholder";

  // Placeholder lists — replace with your real URLs
  const IMAGE_LISTS = {
    A: [
      "https://via.placeholder.com/500?text=A1",
      "https://via.placeholder.com/500?text=A2",
      "https://via.placeholder.com/500?text=A3"
    ],
    B: [
      "https://via.placeholder.com/500?text=B1",
      "https://via.placeholder.com/500?text=B2"
    ],
    C: [
      "https://via.placeholder.com/500?text=C1"
    ],
    D: [
      "https://via.placeholder.com/500?text=D1",
      "https://via.placeholder.com/500?text=D2",
      "https://via.placeholder.com/500?text=D3",
      "https://via.placeholder.com/500?text=D4"
    ]
  };

  // --- utility ---
  function pickForCode(code){
    const list = IMAGE_LISTS[code] || IMAGE_LISTS.A || [];
    if (!list.length) return null;
    const idx = Math.floor(Math.random() * list.length);
    const src = list[idx];
    const alt = `Stimulus ${code} placeholder`;
    return { src, alt };
  }
  function preload(src){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=> resolve(src);
      img.onerror = ()=> reject(new Error("image failed to load: " + src));
      img.src = src;
    });
  }

  function htmlStage1(onStart){
    return `
      <div class="center-wrap">
        <button id="startStimBtn" class="big-button">click here when you are ready to see the image</button>
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

  // --- main flow ---
  document.addEventListener("DOMContentLoaded", async function(){
    const params = VE.parseParams();
    const root = document.getElementById("root");

    // Wire nav invisibly (kept consistent with rest of app)
    VE.bindNavForPage("image-stim", params);
    VE.setupNavVisibility(params, { allowBack: false });

    // Resolve the image set based on current trial code
    const infoWrap = VE.getCurrentTrialInfo(params);
    const cur = infoWrap && infoWrap.info;
    const code = cur && cur.code || "A";

    // Choose and start preloading the stimulus immediately on page load
    const chosen = pickForCode(code);
    let preloadPromise = null;
    if (chosen) {
      preloadPromise = preload(chosen.src).catch(err => err);
    }

    // ========== Stage 1 ==========
    root.innerHTML = htmlStage1();
    const startBtn = document.getElementById("startStimBtn");

    // If dev, you can append a small footer
    VE.renderDevFooter(params, `image-stim: chosen=${code}`);

    // Wait for click to proceed to Stage 2 (fixation)
    startBtn.addEventListener("click", async ()=>{
      // ========== Stage 2 ==========
      root.innerHTML = htmlStage2();

      const fixationMinMs = 5000;
      const tStartFix = performance.now();
      let imageReady = false;

      // Await preload if we attempted one; on failure, keep waiting (in dev we’ll show a note)
      if (preloadPromise) {
        const res = await preloadPromise;
        if (res instanceof Error) {
          if (VE.hasDev(params)) {
            const note = document.createElement("p");
            note.textContent = "DEV: stimulus failed to preload; will remain on fixation.";
            (document.querySelector(".inner")||document.body).appendChild(note);
          }
        } else {
          imageReady = true;
        }
      } else {
        // No list? We keep waiting (dev note)
        if (VE.hasDev(params)) {
          const note = document.createElement("p");
          note.textContent = "DEV: no image list found for this code; staying on fixation.";
          (document.querySelector(".inner")||document.body).appendChild(note);
        }
      }

      // Ensure at least 5s fixation; if image not ready, extend until it is ready
      async function waitUntilReady(){
        // Wait until min time has elapsed
        const elapsed = performance.now() - tStartFix;
        const remaining = Math.max(0, fixationMinMs - elapsed);
        if (remaining > 0) {
          await new Promise(r => setTimeout(r, remaining));
        }
        // If image still not ready, poll until it is (checks every 100ms)
        while (!imageReady) {
          await new Promise(r => setTimeout(r, 100));
          // if preloadPromise resolved after we checked earlier
          if (preloadPromise && !(await Promise.resolve(preloadPromise)) instanceof Error) {
            imageReady = true;
          }
        }
      }

      await waitUntilReady();

      // ========== Stage 3 ==========
      // Show already-loaded image; ensure 20s total visible with fade 17–20s
      if (!chosen || chosen instanceof Error) {
        // If somehow we have no valid image, just navigate on (fail-safe)
        const r = VE.nextRoute("image-stim", params);
        VE.goto(r.page, r.params);
        return;
      }

      root.innerHTML = htmlStage3(chosen);
      const imgEl = document.getElementById("stimImg");

      // Exact timing: 0–17s visible; 17–20s fade; 20s -> auto-advance
      const t0 = performance.now();
      const fadeAt = 17000;
      const endAt  = 20000;

      const timers = [];
      timers.push(setTimeout(()=> {
        // Start CSS fade to 0 over 3s
        if (imgEl) imgEl.style.opacity = "0";
      }, fadeAt));

      timers.push(setTimeout(()=> {
        // Fully invisible now; go to next page
        const r = VE.nextRoute("image-stim", params);
        VE.goto(r.page, r.params);
      }, endAt));

      // Safety: if the user somehow navigates away early, clear timers
      window.addEventListener("beforeunload", ()=> timers.forEach(clearTimeout), { once:true });
    });
  });
})();
