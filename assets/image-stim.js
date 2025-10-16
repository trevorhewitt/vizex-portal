// assets/image-stim.js
// Requires assets/util.js (window.VE)

(function(){
  const FIXATION_SRC = "https://universityofsussex.eu.qualtrics.com/CP/Graphic.php?IM=IM_MrKpitxMPAZcAAw";
  const FIXATION_ALT = "Fixation cross placeholder";

  // Placeholder lists — replace with your real URLs
  const IMAGE_LISTS = {
    A: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_p6hJEzjLdEWzqaH", // 01 A00
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_9cJlL4ZaxpTQAO0", // 02 A01
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_kqpAErDSmcKog5y", // 03 A02
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_iyb8CY1GkaNwiSz", // 04 A03
      //"https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_mJD6thqAueM5OaD", // 05 
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_5wu8Yjz8l6C6sP5", // 06 A04
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_4v1RpyLNLNucTnW", // 07 A05
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_7xlcSTIoDjwx1jP", // 08 A06
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_gbwXKbeAAoNUuaH", // 09 A07
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_PSovrKHfDi833oj", // 10 A08
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_Wcz9QcndxIrnVv8", // 11 A09
      //"https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_3kAAsDxFJqzp0TL", // 12
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_Pd6HIWmlQTqgEts", // 13 A10
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_GzNJWn9P3kUi96R", // 14 A11
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_JYt0eHLhJ6xKY9M", // 15 A12
    ],

    B: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_6HOpds0zQXBockQ", //16 B00
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_EChiDQpRMJOWlXl", //17 B01
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_m7iia72UkwSLKgr", //18 B02
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_h9RBSXgtDHipro3", //19 B03
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_yuy99IKxFrKkWTu", //20 B04
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_xc4iTLUZ0mNXS4M", //21 B05
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_avgRO45IbXaxNM3", //22 B06
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_qUzaCgj3NRr5y3G", //23 B07
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_5iajFqdhso2t7Vg", //24 B08
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_zLKQtqlBglYYFDj", //25 B09
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_VOITcLpFXaLryvW", //26 B10
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_nkiGFCR2tkMWJJb", //27 B11
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_oAP8xSdDZVU7n6N", //28 B12
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_g5bkuEdpMIPV02M", //29 B13
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_mOTIEe8SsvyIu8I" //30 B14
    ],
    C: [
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_U4x25wdhnuZLF7E", //31 C00
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_OvnYyM0jxWP26As", //32 C01
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_qpn2ios3SxlD6rx", //33 C02
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_Pc7KWtuUx30Bwm0", //34 C03
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_biYVUrs67tOR921", //35 C04 
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_wAKoi7UXnSpgTKW", //36 C05
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_j6iHXhtjNZ4m04v", //37 C06
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_C4b5xR49yF1MiaK", //39 C07
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_kABtIqrGrUImYPU", //40 C08
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_aftUFDk3R4Ph9Ho", //41 C09 
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_yEHZit3ezXFbWJ5", //42 C10
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_TviCPwL5xxe39SC", //43 C11
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_hVosjozGI3MjxEt", //44 C12
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_rQUTQgXkd0rPnW4", //45 C13
      "https://universityofsussex.eu.qualtrics.com/ControlPanel/Graphic.php?IM=IM_H3gN8MNNmBEt7u6", //45 C14
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