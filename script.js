// ======= Drawing + Tutorial (single file JS) =======

// ----- Utility: pointer events support -----
function supportsPointerEvents() {
    return !!(window.PointerEvent && ('onpointerdown' in window));
  }
  
  // ----- Tutorial text registry (designers can edit freely; HTML allowed) -----
  const TUTORIAL_COPY = {
    viewport: {
      title: 'drawing viewport',
      body: 'drawing viewport introduction placeholder'
    },
    colors: {
      title: 'colour sliders',
      body: 'colour sliders introduction placeholder'
    },
    swap: {
      title: 'swap colours',
      body: 'swap colours introduction placeholder'
    },
    softnessSize: {
      title: 'brush softness & size',
      body: 'blur and brush size introduction placeholder'
    },
    drawErase: {
      title: 'draw & erase',
      body: 'draw and erase introduction placeholder'
    },
    move: {
      title: 'move',
      body: 'move tool introduction placeholder'
    },
    flip: {
      title: 'flip',
      body: 'flip introduction placeholder'
    },
    history: {
      title: 'undo & redo',
      body: 'undo and redo introduction placeholder'
    },
    clear: {
      title: 'clear',
      body: 'clear introduction placeholder'
    },
    finish: {
      title: 'finish',
      body: 'finish introduction placeholder'
    }
  };
  
  // ----- Tutorial manager -----
  class TutorialManager {
    /**
     * @param {Array} steps  Ordered steps: {id, showIds:[], hideIds:[], copyKey}
     * @param {object} opts  DOM hooks
     */
    constructor(steps, opts) {
      this.steps = steps;
      this.i = 0;
      this.overlay = opts.overlay;
      this.title = opts.title;
      this.body = opts.body;
      this.tryBtn = opts.tryBtn;
      this.nextBtn = opts.nextBtn;
  
      // Wire buttons
      this.tryBtn.addEventListener('click', () => this.hideOverlay());
      this.nextBtn.addEventListener('click', () => this.next());
  
      // Keyboard accessibility for Next
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') this.next();
      });
  
      // Initialize all targeted elements hidden except viewport
      steps.forEach((s, idx) => {
        if (!s.showIds) return;
        if (idx === 0) return; // viewport only, handled by page defaults
        s.showIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.setAttribute('data-tutorial-hide', '');
        });
      });
  
      this.renderStep();
    }
  
    renderStep() {
      const step = this.steps[this.i];
      // Show/hide UI chunks
      if (step.showIds) {
        step.showIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.removeAttribute('data-tutorial-hide');
        });
      }
      if (step.hideIds) {
        step.hideIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.setAttribute('data-tutorial-hide', '');
        });
      }
  
      // Copy
      const copy = TUTORIAL_COPY[step.copyKey] || { title: step.copyKey, body: '' };
      this.title.textContent = copy.title || '';
      this.body.innerHTML = copy.body || '';
  
      // Overlay is shown at each step start
      this.showOverlay();
  
      // Next button visibility: hidden on finish step
      const isLast = (this.i === this.steps.length - 1);
      this.nextBtn.style.display = isLast ? 'none' : 'inline-flex';
    }
  
    showOverlay() { this.overlay.style.display = 'flex'; }
    hideOverlay() { this.overlay.style.display = 'none'; }
  
    next() {
      // advance step
      if (this.i < this.steps.length - 1) {
        this.i += 1;
        this.renderStep();
      }
    }
  }
  
  // ======= Drawing engine (trimmed but full-featured) =======
  class DrawingApp {
    static get MIN_COLOR_DISTANCE() { return 10; }
  
    static seededRandom(seedStr) {
      let h = 1779033703 ^ seedStr.length;
      for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
      }
      let t = h;
      return function () {
        t = Math.imul(t ^ t >>> 15, 2246822507);
        t = Math.imul(t ^ t >>> 13, 3266489909);
        return ((t ^= t >>> 16) >>> 0) / 4294967296;
      };
    }
  
    constructor(seed) {
      this.seed = seed || 'default_seed';
      const rand = DrawingApp.seededRandom(this.seed);
      const min = 0, max = 255;
      let bg = Math.floor(rand() * (max - min + 1) + min);
      let fg = Math.floor(rand() * (max - min + 1) + min);
      if (Math.abs(bg - fg) < DrawingApp.MIN_COLOR_DISTANCE) {
        fg = (bg + DrawingApp.MIN_COLOR_DISTANCE) % (max + 1);
      }
  
      // DOM
      this.canvas = document.getElementById('drawingCanvas');
      try {
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      } catch (_) {
        this.ctx = this.canvas.getContext('2d');
      }
      if (!this.ctx) throw new Error('2D canvas not supported');
  
      this.toolButtons = Array.from(document.querySelectorAll('.tool-row button[data-tool]'));
      this.swapColorsBtn = document.getElementById('swapColors');
      this.flipBtn = document.getElementById('flipH');
      this.brushColorSlider = document.getElementById('brushColor');
      this.thicknessSlider = document.getElementById('thickness');
      this.blurSlider = document.getElementById('blur');
      this.backgroundSlider = document.getElementById('background');
      this.undoBtn = document.getElementById('undo');
      this.redoBtn = document.getElementById('redo');
      this.clearBtn = document.getElementById('clear');
      this.saveBtn = document.getElementById('saveButton');
  
      // State
      this.drawing = false;
      this.currentPath = [];
      this.pointers = {};
      this.mouseMoveActive = false;
      this.drawingPointerId = null;
  
      this.state = {
        paths: [],
        brushColor: fg,
        thickness: +this.thicknessSlider.value,
        blur: +this.blurSlider.value,
        background: bg,
        tool: 'draw',
        flipX: false,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotation: 0
      };
      this.brushColorSlider.value = fg;
      this.backgroundSlider.value = bg;
  
      this.history = [];
      this.historyIndex = -1;
  
      this._offscreen = document.createElement('canvas');
      this._offscreenCtx = this._offscreen.getContext('2d');
      this._rafPending = false;
      this._lastOffFilter = 'none';
  
      // Binding
      this.onToolClick = this.onToolClick.bind(this);
      this.onSwapColors = this.onSwapColors.bind(this);
      this.onFlipToggle = this.onFlipToggle.bind(this);
      this.onCanvasPointerDown = this.onCanvasPointerDown.bind(this);
      this.onCanvasPointerMove = this.onCanvasPointerMove.bind(this);
      this.onCanvasPointerUp = this.onCanvasPointerUp.bind(this);
      this.onCanvasPointerCancel = this.onCanvasPointerCancel.bind(this);
      this.onBrushColorInput = this.onBrushColorInput.bind(this);
      this.onGenericSliderInput = this.onGenericSliderInput.bind(this);
      this.onGenericSliderChange = this.onGenericSliderChange.bind(this);
      this.onBackgroundColorInput = this.onBackgroundColorInput.bind(this);
      this.onUndo = this.onUndo.bind(this);
      this.onRedo = this.onRedo.bind(this);
      this.onClear = this.onClear.bind(this);
      this.onSave = this.onSave.bind(this);
  
      // Slider moved tracking (for "finish" advice)
      this._sliderAdjusted = { background:false, brushColor:false, blur:false, thickness:false };
  
      // Matrix helpers for transforms
      // (minimal 2D matrices)
    }
    // ---- Minimal matrix helpers ----
    static _mIdentity(){ return {a:1,b:0,c:0,d:1,e:0,f:0}; }
    static _mMul(m1,m2){
      return {
        a:m1.a*m2.a+m1.c*m2.b,
        b:m1.b*m2.a+m1.d*m2.b,
        c:m1.a*m2.c+m1.c*m2.d,
        d:m1.b*m2.c+m1.d*m2.d,
        e:m1.a*m2.e+m1.c*m2.f+m1.e,
        f:m1.b*m2.e+m1.d*m2.f+m1.f
      };
    }
    static _mTranslate(tx,ty){ return {a:1,b:0,c:0,d:1,e:tx,f:ty}; }
    static _mScale(sx,sy){ return {a:sx,b:0,c:0,d:sy,e:0,f:0}; }
    static _mRotate(rad){ const c=Math.cos(rad), s=Math.sin(rad); return {a:c,b:s,c:-s,d:c,e:0,f:0}; }
    static _mInvert(m){
      const det=m.a*m.d-m.b*m.c;
      if(!det) return DrawingApp._mIdentity();
      const inv=1/det;
      return {
        a:m.d*inv, b:-m.b*inv, c:-m.c*inv, d:m.a*inv,
        e:(m.c*m.f-m.d*m.e)*inv, f:(m.b*m.e-m.a*m.f)*inv
      };
    }
    static _mApply(m,x,y){ return {x:m.a*x+m.c*y+m.e, y:m.b*x+m.d*y+m.f}; }
  
    // ---- Init wiring ----
    init(){
      // Tools
      this.toolButtons.forEach(btn => btn.addEventListener('click', this.onToolClick));
      if (this.swapColorsBtn) this.swapColorsBtn.addEventListener('click', this.onSwapColors);
      if (this.flipBtn) this.flipBtn.addEventListener('click', this.onFlipToggle);
  
      // Pointers
      if (supportsPointerEvents()) {
        this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
        this.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
        this.canvas.addEventListener('pointerup', this.onCanvasPointerUp);
        this.canvas.addEventListener('pointercancel', this.onCanvasPointerCancel);
      } else {
        // Mouse fallback
        this.canvas.addEventListener('mousedown', (e)=>{ e.pointerType='mouse'; e.pointerId=1; this.onCanvasPointerDown(e); });
        window.addEventListener('mousemove', (e)=>{ e.pointerType='mouse'; e.pointerId=1; this.onCanvasPointerMove(e); });
        window.addEventListener('mouseup', (e)=>{ e.pointerType='mouse'; e.pointerId=1; this.onCanvasPointerUp(e); });
        // Touch fallback (basic)
        this.canvas.addEventListener('touchstart', (e)=>{
          const t=e.changedTouches[0]; if(!t) return;
          const ev={clientX:t.clientX, clientY:t.clientY, pointerType:'touch', pointerId:t.identifier, preventDefault:()=>e.preventDefault()};
          this.onCanvasPointerDown(ev);
        }, {passive:false});
        this.canvas.addEventListener('touchmove', (e)=>{
          const t=e.changedTouches[0]; if(!t) return;
          const ev={clientX:t.clientX, clientY:t.clientY, pointerType:'touch', pointerId:t.identifier, preventDefault:()=>e.preventDefault()};
          this.onCanvasPointerMove(ev);
        }, {passive:false});
        this.canvas.addEventListener('touchend', (e)=>{
          const t=e.changedTouches[0]; if(!t) return;
          const ev={clientX:t.clientX, clientY:t.clientY, pointerType:'touch', pointerId:t.identifier, preventDefault:()=>e.preventDefault()};
          this.onCanvasPointerUp(ev);
        });
      }
  
      // Sliders
      if (this.brushColorSlider){
        this.brushColorSlider.addEventListener('input', this.onBrushColorInput);
        this.brushColorSlider.addEventListener('input', ()=> this._sliderAdjusted.brushColor = true);
        this.brushColorSlider.addEventListener('change', this.onGenericSliderChange);
      }
      if (this.backgroundSlider){
        this.backgroundSlider.addEventListener('input', this.onBackgroundColorInput);
        this.backgroundSlider.addEventListener('input', ()=> this._sliderAdjusted.background = true);
        this.backgroundSlider.addEventListener('change', this.onGenericSliderChange);
      }
      [this.thicknessSlider, this.blurSlider].forEach(sl=>{
        if(!sl) return;
        sl.addEventListener('input', this.onGenericSliderInput);
        sl.addEventListener('change', this.onGenericSliderChange);
      });
      if (this.blurSlider) this.blurSlider.addEventListener('input', ()=> this._sliderAdjusted.blur = true);
      if (this.thicknessSlider) this.thicknessSlider.addEventListener('input', ()=> this._sliderAdjusted.thickness = true);
  
      // Actions
      if (this.undoBtn) this.undoBtn.addEventListener('click', this.onUndo);
      if (this.redoBtn) this.redoBtn.addEventListener('click', this.onRedo);
      if (this.clearBtn) this.clearBtn.addEventListener('click', this.onClear);
      if (this.saveBtn) this.saveBtn.addEventListener('click', this.onSave);
  
      this.saveState();
      this.redraw();
      this.updateButtons();
    }
  
    // ---- History ----
    saveState(){
      this.history = this.history.slice(0, this.historyIndex+1);
      this.history.push(JSON.parse(JSON.stringify(this.state)));
      this.historyIndex++;
      this.updateButtons();
    }
    loadState(i){
      this.state = JSON.parse(JSON.stringify(this.history[i]));
      // sync UI
      this.brushColorSlider.value = this.state.brushColor;
      this.thicknessSlider.value = this.state.thickness;
      this.blurSlider.value = this.state.blur;
      this.backgroundSlider.value = this.state.background;
      this.toolButtons.forEach(btn => btn.classList.toggle('selected', btn.dataset.tool === this.state.tool));
      this.redraw();
      this.updateButtons();
    }
    updateButtons(){
      if (this.undoBtn) this.undoBtn.disabled = this.historyIndex <= 0;
      if (this.redoBtn) this.redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    }
  
    // ---- Tools ----
    onToolClick(e){
      const btn = e.currentTarget;
      this.state.tool = btn.dataset.tool;
      this.toolButtons.forEach(b => b.classList.toggle('selected', b === btn));
    }
    onSwapColors(){
      const t = this.state.brushColor;
      this.state.brushColor = this.state.background;
      this.state.background = t;
      this.brushColorSlider.value = this.state.brushColor;
      this.backgroundSlider.value = this.state.background;
      this.state.paths.forEach(p => { if(!p.erase) p.color = this.state.brushColor; });
      this.redraw();
      this.saveState();
    }
    onFlipToggle(){
      this.state.flipX = !this.state.flipX;
      this.redraw();
      this.saveState();
    }
  
    // ---- Pointer/canvas ----
    onCanvasPointerDown(e){
      e.preventDefault?.();
      this._cacheRect();
      const pos = this._posFromEvent(e);
  
      if (this.state.tool === 'move') {
        if (e.pointerType === 'mouse') this.mouseMoveActive = true;
        this.pointers[e.pointerId || 'p'] = { x: pos.x, y: pos.y, pointerType: e.pointerType };
        return;
      }
  
      // draw/erase
      if (this.state.tool === 'draw' && e.pointerType === 'touch') {
        if (this.drawingPointerId !== null) return;
        this.drawingPointerId = e.pointerId || 'p';
      }
      this.drawing = true;
      this.currentPath = [pos];
    }
    onCanvasPointerMove(e){
      if (this.state.tool === 'move') {
        const prev = this.pointers[e.pointerId || 'p'];
        const pos = this._posFromEvent(e);
        this.pointers[e.pointerId || 'p'] = pos;
        if (!prev) return;
  
        if (e.pointerType === 'mouse' && !this.mouseMoveActive) return;
  
        // Pan using delta in canvas logical units
        const prevL = this._screenToCanvas(prev.x, prev.y);
        const currL = this._screenToCanvas(pos.x, pos.y);
        this.state.offsetX += (currL.x - prevL.x);
        this.state.offsetY += (currL.y - prevL.y);
        this.scheduleRedraw();
        return;
      }
  
      if (!this.drawing) return;
      const pos = this._posFromEvent(e);
      this.currentPath.push(pos);
      this.scheduleRedraw();
    }
    onCanvasPointerUp(e){
      if (this.state.tool === 'move') {
        delete this.pointers[e.pointerId || 'p'];
        if (e.pointerType === 'mouse') this.mouseMoveActive = false;
        this.saveState();
        return;
      }
  
      if (!this.drawing) return;
      if (this.state.tool === 'draw' && e.pointerType === 'touch' && (e.pointerId || 'p') !== this.drawingPointerId) return;
  
      this.state.paths.push({
        points: this.currentPath,
        erase: this.state.tool === 'erase',
        color: this.state.brushColor
      });
      this.saveState();
      this.drawing = false;
      this.currentPath = [];
      if (this.state.tool === 'draw') this.drawingPointerId = null;
    }
    onCanvasPointerCancel(e){
      if (this.state.tool === 'move') {
        delete this.pointers[e.pointerId || 'p'];
        if (e.pointerType === 'mouse') this.mouseMoveActive = false;
      }
      this.drawing = false;
      this.currentPath = [];
      if (this.state.tool === 'draw') this.drawingPointerId = null;
    }
  
    // ---- Sliders ----
    onBrushColorInput(){
      let brushVal = +this.brushColorSlider.value;
      let bgVal = +this.backgroundSlider.value;
      const minDist = DrawingApp.MIN_COLOR_DISTANCE;
      if (Math.abs(brushVal - bgVal) < minDist) {
        brushVal = brushVal > bgVal ? bgVal + minDist : bgVal - minDist;
        brushVal = Math.max(+this.brushColorSlider.min, Math.min(+this.brushColorSlider.max, brushVal));
        this.brushColorSlider.value = brushVal;
      }
      this.state.brushColor = brushVal;
      this.state.paths.forEach(p => { if(!p.erase) p.color = this.state.brushColor; });
      this.redraw();
    }
    onBackgroundColorInput(){
      let bgVal = +this.backgroundSlider.value;
      let brushVal = +this.brushColorSlider.value;
      const minDist = DrawingApp.MIN_COLOR_DISTANCE;
      if (Math.abs(bgVal - brushVal) < minDist) {
        bgVal = bgVal > brushVal ? brushVal + minDist : brushVal - minDist;
        bgVal = Math.max(+this.backgroundSlider.min, Math.min(+this.backgroundSlider.max, bgVal));
        this.backgroundSlider.value = bgVal;
      }
      this.state.background = bgVal;
      this.redraw();
    }
    onGenericSliderInput(e){
      const sl = e.currentTarget;
      this.state[sl.id] = +sl.value;
      this.scheduleRedraw();
    }
    onGenericSliderChange(){ this.saveState(); }
  
    // ---- Actions ----
    onUndo(){ if (this.historyIndex > 0) this.loadState(--this.historyIndex); }
    onRedo(){ if (this.historyIndex < this.history.length - 1) this.loadState(++this.historyIndex); }
    onClear(){
      this.state.paths = [];
      if (this.thicknessSlider){ this.state.thickness = +this.thicknessSlider.defaultValue; this.thicknessSlider.value = this.thicknessSlider.defaultValue; }
      if (this.blurSlider){ this.state.blur = +this.blurSlider.defaultValue; this.blurSlider.value = this.blurSlider.defaultValue; }
      this.saveState();
      this.redraw();
    }
    onSave(){
        try{
            // Nudge if key sliders untouched (kept from your version)
            const need = Object.entries(this._sliderAdjusted).filter(([k,v])=>!v).map(([k])=>k);
            if (need.length){
            alert('Before finishing, consider adjusting: ' + need.join(', '));
            }

            // Portal params + trial info
            const params = (window.VE && VE.parseParams) ? VE.parseParams() : {p:"", s:"", t:"", i:"0", m:"0"};
            const wrap = (window.VE && VE.getCurrentTrialInfo) ? VE.getCurrentTrialInfo(params) : { idx: (parseInt(params.i||"0",10)||0), info:null };
            const idxZero = (wrap && typeof wrap.idx==="number") ? wrap.idx : (parseInt(params.i||"0",10)||0);
            const trialNumber = idxZero + 1;
            const trialCode = (wrap && wrap.info && wrap.info.code) ? wrap.info.code : ""; // e.g., "A" or "5"

            // Timestamp helpers (YYMMDDHHMM)
            const pad2 = n => String(n).padStart(2,"0");
            const saveTs = (() => {
            const d = new Date();
            const yy = pad2(d.getFullYear()%100);
            const MM = pad2(d.getMonth()+1);
            const DD = pad2(d.getDate());
            const hh = pad2(d.getHours());
            const mm = pad2(d.getMinutes());
            return `${yy}${MM}${DD}${hh}${mm}`;
            })();

            // Filename base per spec
            const base = `saveTime_${saveTs}__sessionTime_${params.s||""}__participant_${params.p||""}__trialN_${trialNumber}__trialT${trialCode||""}`;

            // Saving overlay on
            const overlay = document.getElementById("savingOverlay");
            if (overlay){ overlay.style.display = "flex"; overlay.setAttribute("aria-hidden","false"); }
            const setBusy = v => {
            const app = document.querySelector(".drawing-app");
            if (app){ app.setAttribute("aria-busy", v ? "true" : "false"); }
            };
            setBusy(true);

            // === 1) Export uncropped PNG ===
            const off = this._renderToTemp(); // your helper renders full canvas to an offscreen canvas
            const uncroppedUrl = off.toDataURL("image/png");
            this._downloadDataUrl(uncroppedUrl, `${base}__fileType_uncropped.png`);

            // === 2) Export cropped to viewport ===
            const { sx, sy, sw, sh, viewportRect } = this._getViewportCrop();
            const full = this._renderToTemp(viewportRect);
            const crop = document.createElement('canvas');
            crop.width = sw; crop.height = sh;
            const c2 = crop.getContext('2d');
            c2.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
            const croppedUrl = crop.toDataURL("image/png");
            this._downloadDataUrl(croppedUrl, `${base}__fileType_cropped.png`);

            // === 3) Export JSON state ===
            const exportState = JSON.parse(JSON.stringify(this.state));
            exportState.canvasWidth = this.canvas.width;
            exportState.canvasHeight = this.canvas.height;
            const vp = this._getViewportRect();
            exportState.viewport = { centerX:vp.centerX, centerY:vp.centerY, width:vp.normDivX*2, height:vp.normDivY*2 };
            // Attach lightweight provenance for easy traceability
            exportState._vizex = {
            sessionTime: params.s || "",
            participant: params.p || "",
            trialNumber,
            trialCode: trialCode || "",
            saveTimeYYMMDDHHMM: saveTs
            };
            const jsonBlob = new Blob([JSON.stringify(exportState, null, 2)], { type:'application/json' });
            this._downloadBlob(jsonBlob, `${base}__fileType_state.json`);

            // Small delay to let the browser enqueue downloads, then route
            const proceed = () => {
            try{
                // Compute next page via portal router
                if (window.VE && VE.nextRoute && VE.goto){
                const r = VE.nextRoute("drawing", params);
                VE.goto(r.page, r.params);
                }
            }finally{
                if (overlay){ overlay.style.display = "none"; overlay.setAttribute("aria-hidden","true"); }
                setBusy(false);
            }
            };
            setTimeout(proceed, 900); // empirically smooth on iPad/Chrome

        }catch(err){
            console.error("onSave failed:", err);
            alert("An error occurred while saving. Please notify the researcher.");
            const overlay = document.getElementById("savingOverlay");
            if (overlay){ overlay.style.display = "none"; overlay.setAttribute("aria-hidden","true"); }
            const app = document.querySelector(".drawing-app");
            if (app){ app.setAttribute("aria-busy", "false"); }
        }
        }

    onSave_old(){
      // gentle nudge if they never moved key sliders
      const need = Object.entries(this._sliderAdjusted).filter(([k,v])=>!v).map(([k])=>k);
      if (need.length){
        alert('Before finishing, consider adjusting: ' + need.join(', '));
      }
  
      const ts = this._timestamp();
      // Export uncropped PNG
      const off = this._renderToTemp();
      this._downloadDataUrl(off.toDataURL(), `drawing_${ts}_uncropped.png`);
  
      // Export cropped to viewport
      const { sx, sy, sw, sh, viewportRect } = this._getViewportCrop();
      const full = this._renderToTemp(viewportRect);
      const crop = document.createElement('canvas');
      crop.width = sw; crop.height = sh;
      const c2 = crop.getContext('2d');
      c2.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
      this._downloadDataUrl(crop.toDataURL(), `drawing_${ts}_cropped.png`);
  
      // Export JSON state
      const exportState = JSON.parse(JSON.stringify(this.state));
      exportState.canvasWidth = this.canvas.width;
      exportState.canvasHeight = this.canvas.height;
      const vp = this._getViewportRect();
      exportState.viewport = { centerX:vp.centerX, centerY:vp.centerY, width:vp.normDivX*2, height:vp.normDivY*2 };
      const blob = new Blob([JSON.stringify(exportState, null, 2)], {type:'application/json'});
      this._downloadBlob(blob, `drawing_${ts}.json`);
    }
  
    // ---- Drawing pipeline ----
    drawPath(ctx, obj){
      if (obj.points.length < 2) return;
      ctx.lineWidth = this.state.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const v = obj.erase ? 0 : obj.color;
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.moveTo(obj.points[0].x, obj.points[0].y);
      for (let i=1;i<obj.points.length;i++){
        const p = obj.points[i];
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  
    _applyTransforms(ctx, w, h, s){
      let m = DrawingApp._mIdentity();
      m = DrawingApp._mMul(m, DrawingApp._mTranslate(w/2, h/2));
      if (s.flipX) m = DrawingApp._mMul(m, DrawingApp._mScale(-1, 1));
      if (s.rotation) m = DrawingApp._mMul(m, DrawingApp._mRotate(s.rotation));
      if (s.scale !== 1) m = DrawingApp._mMul(m, DrawingApp._mScale(s.scale, s.scale));
      m = DrawingApp._mMul(m, DrawingApp._mTranslate(s.offsetX||0, s.offsetY||0));
      m = DrawingApp._mMul(m, DrawingApp._mTranslate(-w/2, -h/2));
      this._setCtxTransform(ctx, m);
    }
    _setCtxTransform(ctx, m){ ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); }
  
    _effectiveBlur(){
      // Simple immediate blur (tutorial version keeps it straightforward)
      return this.state.blur;
    }
  
    redraw(){
      this._doPipeline(this.ctx, this.canvas.width, this.canvas.height, this.state, this.state.paths, this.drawing, this.currentPath);
    }
    _doPipeline(ctx, w, h, state, paths, drawing, currentPath){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,w,h);
  
      if (this._offscreen.width !== w || this._offscreen.height !== h){
        this._offscreen.width = w; this._offscreen.height = h;
        this._offscreenCtx = this._offscreen.getContext('2d');
      }
      const off = this._offscreenCtx;
      off.setTransform(1,0,0,1,0,0);
      off.clearRect(0,0,w,h);
  
      // transforms + blur
      this._applyTransforms(off, w, h, state);
      const effBlur = this._effectiveBlur();
      const wantFilter = (effBlur > 0) ? `blur(${effBlur}px)` : 'none';
      if (wantFilter !== this._lastOffFilter){
        off.filter = wantFilter;
        this._lastOffFilter = wantFilter;
      }
  
      // Replay
      for (const p of paths){
        off.globalCompositeOperation = p.erase ? 'destination-out' : 'source-over';
        this.drawPath(off, p);
      }
      if (drawing && currentPath && currentPath.length>1){
        off.globalCompositeOperation = (state.tool==='erase') ? 'destination-out' : 'source-over';
        this.drawPath(off, {points: currentPath, erase: (state.tool==='erase'), color: state.brushColor});
      }
      off.globalCompositeOperation = 'source-over';
  
      // background then composite
      ctx.fillStyle = `rgb(${state.background},${state.background},${state.background})`;
      ctx.fillRect(0,0,w,h);
      ctx.drawImage(this._offscreen, 0,0);
    }
  
    scheduleRedraw(){
      if (this._rafPending) return;
      this._rafPending = true;
      requestAnimationFrame(()=>{ this._rafPending=false; this.redraw(); });
    }
  
    // ---- Coordinate helpers ----
    _screenToCanvas(x, y){
      const m = this._buildMatrix(this.canvas.width, this.canvas.height, this.state);
      const inv = DrawingApp._mInvert(m);
      return DrawingApp._mApply(inv, x, y);
    }
    _buildMatrix(w,h,s){
      let m = DrawingApp._mIdentity();
      m = DrawingApp._mMul(m, DrawingApp._mTranslate(w/2, h/2));
      if (s.flipX) m = DrawingApp._mMul(m, DrawingApp._mScale(-1,1));
      if (s.rotation) m = DrawingApp._mMul(m, DrawingApp._mRotate(s.rotation));
      if (s.scale !== 1) m = DrawingApp._mMul(m, DrawingApp._mScale(s.scale, s.scale));
      m = DrawingApp._mMul(m, DrawingApp._mTranslate(s.offsetX||0, s.offsetY||0));
      m = DrawingApp._mMul(m, DrawingApp._mTranslate(-w/2, -h/2));
      return m;
    }
    _cacheRect(){
      const r = this.canvas.getBoundingClientRect();
      this._rect = r;
      this._scaleX = this.canvas.width / r.width;
      this._scaleY = this.canvas.height / r.height;
    }
    _posFromEvent(e){
      if (!this._rect) this._cacheRect();
      const r = this._rect;
      const scaleX = this._scaleX, scaleY = this._scaleY;
      const x = (e.clientX - r.left) * scaleX;
      const y = (e.clientY - r.top) * scaleY;
      if (this.state.tool === 'draw' || this.state.tool === 'erase'){
        return this._screenToCanvas(x, y);
      }
      return {x,y};
    }
  
    // ---- Export helpers ----
    _timestamp(){
      const d = new Date();
      const pad = s => s.toString().padStart(2,'0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    }
    _downloadBlob(blob, filename){
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    }
    _downloadDataUrl(dataUrl, filename){
      const a = document.createElement('a');
      a.href = dataUrl; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
    }
    _getViewportRect(){
      const viewportElem = document.getElementById('viewport');
      const canvasRect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / canvasRect.width;
      const scaleY = this.canvas.height / canvasRect.height;
      const vp = viewportElem.getBoundingClientRect();
      const centerX = ((vp.left - canvasRect.left) + vp.width/2) * scaleX;
      const centerY = ((vp.top - canvasRect.top) + vp.height/2) * scaleY;
      const normDivX = (vp.width/2)*scaleX;
      const normDivY = (vp.height/2)*scaleY;
      return { centerX, centerY, normDivX, normDivY };
    }
    _getViewportCrop(){
      const vp = this._getViewportRect();
      const sx = Math.round(vp.centerX - vp.normDivX);
      const sy = Math.round(vp.centerY - vp.normDivY);
      const sw = Math.round(vp.normDivX*2);
      const sh = Math.round(vp.normDivY*2);
      return { sx, sy, sw, sh, viewportRect: vp };
    }
    _renderToTemp(viewportRect=null){
      const tmp = document.createElement('canvas');
      tmp.width = this.canvas.width;
      tmp.height = this.canvas.height;
      const tctx = tmp.getContext('2d');
      this._doPipeline(tctx, tmp.width, tmp.height, this.state, this.state.paths, false, null);
      return tmp;
    }
  }
  
  // ----- Bootstrapping: app + tutorial -----
  function getSeedFromUrl(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      return params.get('seed') || 'default_seed';
    }catch(_){ return 'default_seed'; }
  }
  
  window.addEventListener('DOMContentLoaded', () => {
    // Instantiate drawing app
    const app = new DrawingApp(getSeedFromUrl());
    app.init();
  
    // Tutorial steps: reveal UI progressively
    const steps = [
      { id:'viewport', showIds:[], hideIds:[], copyKey:'viewport' },
      { id:'colors', showIds:['rowColors'], hideIds:[], copyKey:'colors' },
      { id:'swap', showIds:['swapColors'], hideIds:[], copyKey:'swap' },
      { id:'softnessSize', showIds:['rowSoftSize'], hideIds:[], copyKey:'softnessSize' },
      { id:'drawErase', showIds:['rowDrawErase'], hideIds:[], copyKey:'drawErase' },
      { id:'move', showIds:['rowMove'], hideIds:[], copyKey:'move' },
      { id:'flip', showIds:['rowFlip'], hideIds:[], copyKey:'flip' },
      { id:'history', showIds:['rowHistory'], hideIds:[], copyKey:'history' },
      { id:'clear', showIds:['rowClear'], hideIds:[], copyKey:'clear' },
      { id:'finish', showIds:['rowFinish'], hideIds:[], copyKey:'finish' }
    ];
  
    const tm = new TutorialManager(steps, {
      overlay: document.getElementById('tutorialOverlay'),
      title: document.getElementById('tutorialTitle'),
      body: document.getElementById('tutorialBody'),
      tryBtn: document.getElementById('tutorialCloseTry'),
      nextBtn: document.getElementById('tutorialNext')
    });
  
    // Expose for future devs (optional)
    window.__drawingApp = app;
    window.__tutorial = tm;
  });
  