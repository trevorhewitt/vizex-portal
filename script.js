// Drawing application (single-file)
// Encapsulates the interactive drawing surface and controls inside DrawingApp.
// Keeps a compatibility layer for an external `DrawingUtils` if present.
const DrawingUtilsCompat = (typeof DrawingUtils !== 'undefined') ? DrawingUtils : null;

const DEMO_MODE = true;

const SLOW_TABLET_DEFER_BLUR = true; 

// ===================== Cloudinary config + upload helpers =====================
// Your actual Cloudinary info:
const CLOUD_NAME = "dlginribm";           // your Cloudinary cloud name
const UPLOAD_PRESET_IMAGE = "unsigned_preset"; // unsigned preset for images/SVG
const UPLOAD_PRESET_RAW   = "unsigned_preset"; // unsigned preset for raw files (JSON)
// NOTE: If your preset isn't enabled for RAW uploads, create/enable one and put its name in UPLOAD_PRESET_RAW.

// Generic helper for FormData POST
async function postFormData(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Cloudinary network error ${res.status}`);
  return res.json();
}

// Upload for images (PNG/SVG) via image/upload
function uploadImageToCloudinary(blob, fileName) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const fd = new FormData();
  fd.append("file", blob, fileName);
  fd.append("upload_preset", UPLOAD_PRESET_IMAGE);
  // Optional: fd.append("public_id", fileName.replace(/\.[^.]+$/, "")); // keep original base name
  return postFormData(url, fd);
}

// Upload for JSON (or other non-image) via raw/upload
function uploadRawToCloudinary(blob, fileName) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;
  const fd = new FormData();
  fd.append("file", blob, fileName);
  fd.append("upload_preset", UPLOAD_PRESET_RAW);
  return postFormData(url, fd);
}


/**
 * DrawingApp encapsulates the interactive drawing surface and controls.
 * It stores drawing state, handles input events, and produces exports (PNG/SVG/JSON).
 */
class DrawingApp {
    /**
     * Deterministic pseudorandom number generator (mulberry32)
     * @param {string} seedStr - string seed
     */
    static seededRandom(seedStr) {
        // Simple string hash to int
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

    /**
     * @param {string} [seed] - Optional string seed for deterministic color randomization
     */
    constructor(seed) {
        // --- Deterministic color randomization ---
        this.seed = seed || 'default_seed';
        const rand = DrawingApp.seededRandom(this.seed);
        // Avoid extremes (not pure black/white)
        // Use full range (0-255) for both bg and fg
        const min = 0, max = 255;
        let bg = Math.floor(rand() * (max - min + 1) + min);
        let fg = Math.floor(rand() * (max - min + 1) + min);
        // Ensure minimum color distance
        if (Math.abs(bg - fg) < DrawingApp.MIN_COLOR_DISTANCE) {
            fg = (bg + DrawingApp.MIN_COLOR_DISTANCE) % (max + 1);
        }
        // --- DOM references ---
        // Use helper getEl / qAll so missing elements are easier to spot and grouped
        this.canvas = this.getEl('drawingCanvas');
        try {
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        } catch (_) {
        this.ctx = this.canvas.getContext('2d');
        }
        if (!this.ctx) throw new Error('2D canvas not supported');

        // Tool buttons and toggles
        this.toolButtons = this.qAll('.tool-row button[data-tool]');
        this.swapColorsBtn = this.getEl('swapColors');
        this.flipBtn = this.getEl('flipH');

        // Primary controls / sliders
        this.brushColorSlider = this.getEl('brushColor');
        this.thicknessSlider = this.getEl('thickness');
        this.blurSlider = this.getEl('blur');
        this.backgroundSlider = this.getEl('background');

        // Action buttons
        this.undoBtn = this.getEl('undo');
        this.redoBtn = this.getEl('redo');
        this.clearBtn = this.getEl('clear');
        this.saveBtn = this.getEl('saveButton');
        this.exportJsonBtn = this.getEl('exportJson');
        this.importJsonBtn = this.getEl('importJson');
        this.importSvgBtn = this.getEl('importVector');

        // Dev tools visibility (default: false, can be set via ?devtools=true)
        let dev = false;
        try { dev = new URLSearchParams(window.location.search).get('devtools') === 'true'; }
        catch (_) { dev = false; }
        this.showDevTools = dev;

        
        /* Allow URL override: ?deferblur=1 */
        let deferParam = false;
        try { deferParam = new URLSearchParams(location.search).get('deferblur') === '1'; } catch (_) {}
        this.deferBlurDuringInteraction = deferParam || SLOW_TABLET_DEFER_BLUR;

        if (DEMO_MODE) {
        this.showDevTools = false;
        var idsToHide = ['exportJson','importJson','importVector','devToolsRow'];
        for (var i = 0; i < idsToHide.length; i++) {
            var el = document.getElementById(idsToHide[i]);
            if (el) el.style.display = 'none';
        }
    }

        // Hide dev tools if not enabled
        const devToolsRow = document.getElementById('devToolsRow');
        if (devToolsRow && !this.showDevTools) {
            devToolsRow.style.display = 'none';
        }

        // Runtime drawing state
        this.drawing = false;
        this.currentPath = [];
        this.pointers = {}; // active pointer positions (pointerId -> {x,y,pointerType})
        this.pinch = null; // pinch gesture metadata
        this.mouseMoveActive = false; // mouse move flag for 'move' tool
        this.drawingPointerId = null; // track which touch pointer is drawing

        // App state & undo history
        this.state = {
            paths: [],
            brushColor: fg,
            thickness: +this.thicknessSlider.value,
            brightness: 1,
            contrast: 1,
            blur: +this.blurSlider.value,
            background: bg,
            tool: 'draw',
            invert: false,
            flipX: false,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            rotation: 0
        };
        // Sync UI sliders to match randomized state
        this.brushColorSlider.value = fg;
        this.backgroundSlider.value = bg;

        this.history = [];
        this.historyIndex = -1;

        this._offscreen = document.createElement('canvas');
        this._offscreenCtx = this._offscreen.getContext('2d');
        this._rafPending = false;

        /* Cache last filter string to skip redundant assignments */
        this._lastOffFilter = 'none';

        // Bind event handlers so they keep the correct `this`
        this.onToolClick = this.onToolClick.bind(this);
        this.onSwapColors = this.onSwapColors.bind(this);
        this.onFlipToggle = this.onFlipToggle.bind(this);

        this.onCanvasPointerDown = this.onCanvasPointerDown.bind(this);
        this.onCanvasPointerMove = this.onCanvasPointerMove.bind(this);
        this.onCanvasPointerUp = this.onCanvasPointerUp.bind(this);
        this.onCanvasPointerCancel = this.onCanvasPointerCancel.bind(this);
        this.globalPointerDown = this.globalPointerDown.bind(this);

        this.onBrushColorInput = this.onBrushColorInput.bind(this);
        this.onGenericSliderInput = this.onGenericSliderInput.bind(this);
        this.onGenericSliderChange = this.onGenericSliderChange.bind(this);

        this.onUndo = this.onUndo.bind(this);
        this.onRedo = this.onRedo.bind(this);
        this.onClear = this.onClear.bind(this);

        this.onSave = this.onSave.bind(this);
        this.onExportJson = this.onExportJson.bind(this);
        this.onImportJson = this.onImportJson.bind(this);
        this.onImportSvg = this.onImportSvg.bind(this);

        // Event listeners are attached in init()
        // Track if user has adjusted required sliders
        this._sliderAdjusted = {
            background: false,
            brushColor: false,
            blur: false,
            thickness: false
        };
        this._finishPopupShown = false;
        this._modalOpen = false;
    }

    /* ---------- new 2D matrix helper for ipad compatability ---------- */
    // --- Minimal 2D matrix helper (no DOMMatrix required) ---
    static _mIdentity() { return {a:1,b:0,c:0,d:1,e:0,f:0}; }
    static _mMul(m1, m2) {
    return {
        a: m1.a*m2.a + m1.c*m2.b,
        b: m1.b*m2.a + m1.d*m2.b,
        c: m1.a*m2.c + m1.c*m2.d,
        d: m1.b*m2.c + m1.d*m2.d,
        e: m1.a*m2.e + m1.c*m2.f + m1.e,
        f: m1.b*m2.e + m1.d*m2.f + m1.f
    };
    }
    static _mTranslate(tx, ty) { return {a:1,b:0,c:0,d:1,e:tx,f:ty}; }
    static _mScale(sx, sy)    { return {a:sx,b:0,c:0,d:sy,e:0,f:0}; }
    static _mRotate(rad)      { const c=Math.cos(rad), s=Math.sin(rad); return {a:c,b:s,c:-s,d:c,e:0,f:0}; }
    static _mInvert(m) {
    const det = m.a*m.d - m.b*m.c;
    if (!det) return DrawingApp._mIdentity();
    const invDet = 1/det;
    return {
        a:  m.d*invDet,
        b: -m.b*invDet,
        c: -m.c*invDet,
        d:  m.a*invDet,
        e: (m.c*m.f - m.d*m.e)*invDet,
        f: (m.b*m.e - m.a*m.f)*invDet
    };
    }
    static _mApply(m, x, y) { return { x: m.a*x + m.c*y + m.e, y: m.b*x + m.d*y + m.f }; }


    /* ---------- Utilities & helpers ---------- */
    // Simple deep copy for serializable state objects
    deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

    // DOM helpers
    getEl(id, required = true) {
        const el = document.getElementById(id);
        if (!el && required) {
            console.warn(`Missing DOM element: #${id}`);
        }
        return el;
    }

    qAll(sel) {
        return Array.from(document.querySelectorAll(sel));
    }

    // Cache canvas bounding rect and scale to avoid frequent layout reads
    updateCanvasRect() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        this._canvasRect = rect;
        this._canvasScaleX = this.canvas.width / rect.width;
        this._canvasScaleY = this.canvas.height / rect.height;
        this._canvasRectTime = Date.now();
    }

    // Download/file helpers: delegate to external DrawingUtils if available
    downloadBlob(blob, filename) {
        if (DrawingUtilsCompat && DrawingUtilsCompat.downloadBlob) {
            return DrawingUtilsCompat.downloadBlob(blob, filename);
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }

    downloadDataUrl(dataUrl, filename) {
        if (DrawingUtilsCompat && DrawingUtilsCompat.downloadDataUrl) {
            return DrawingUtilsCompat.downloadDataUrl(dataUrl, filename);
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    createFilePicker(accept, onFile) {
        if (DrawingUtilsCompat && DrawingUtilsCompat.createFilePicker) {
            return DrawingUtilsCompat.createFilePicker(accept, onFile);
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            onFile(file);
        });
        input.click();
    }

    // Additional in-file utilities to reduce duplication
    // Build an SVG path 'd' attribute from an array of points
    buildPathD(points) {
        if (!points || points.length === 0) return '';
        let s = `M ${points[0].x} ${points[0].y}`;
        for (let pt of points.slice(1)) {
            s += ` L ${pt.x} ${pt.y}`;
        }
        return s;
    }

    // Returns crop rectangle (sx, sy, sw, sh) in canvas pixels for the viewport, plus the viewport rect object
    // Compute the crop rectangle (sx,sy,sw,sh) in canvas pixels for the viewport element.
    getViewportCropRect() {
        const viewportElem = document.getElementById('viewport');
        const canvasRect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / canvasRect.width;
        const scaleY = this.canvas.height / canvasRect.height;
        if (!viewportElem) {
            return { sx: 0, sy: 0, sw: this.canvas.width, sh: this.canvas.height, viewportRect: null };
        }
        const vpRect = viewportElem.getBoundingClientRect();
        const vpW = Math.round(vpRect.width * (window.devicePixelRatio || 1));
        const vpH = Math.round(vpRect.height * (window.devicePixelRatio || 1));

        const viewportRect = this.getViewportRect(this.canvas);
        const sx = Math.round(viewportRect.centerX - viewportRect.normDivX);
        const sy = Math.round(viewportRect.centerY - viewportRect.normDivY);
        const sw = Math.round(viewportRect.normDivX * 2);
        const sh = Math.round(viewportRect.normDivY * 2);

        return { sx, sy, sw, sh, vpW, vpH, viewportRect };
    }

    // Render the full canvas into a temporary canvas and return it; optional viewportRect to draw masked region
    // If `viewportRect` is provided, the render pass will clip/mask that region appropriately.
    renderToTempCanvas(viewportRect = null) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        // Render the full drawing into a temporary canvas. Pass `viewportRect` when a masked
        // viewport render is desired.
        this.renderDrawing(
            tempCtx,
            tempCanvas.width,
            tempCanvas.height,
            this.state,
            this.state.paths,
            false,
            [],
            viewportRect
        );
        return tempCanvas;
    }

    downloadCanvas(canvasEl, filename) {
        this.downloadDataUrl(canvasEl.toDataURL(), filename);
    }

    // Compact timestamp used for exported filenames
    getTimestamp() {
        const d = new Date();
        const pad = s => s.toString().padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    }

    // Apply invert/brightness/contrast adjustments to a single channel value (0-255)
    applyColorFilters(val) {
        if (this.state.invert) val = 255 - val;
        val = val * this.state.brightness;
        val = ((val - 128) * this.state.contrast) + 128;
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    /* True when a stroke is in progress or a move/pinch is active */
    _isInteracting() {
        if (this.drawing) return true;
        if (this.state.tool === 'move' && Object.keys(this.pointers).length > 0) return true;
        return false;
    }

    /* Blur used for the current frame (0 when deferring on slow tablets) */
    _getEffectiveBlur() {
        if (!this.deferBlurDuringInteraction) return this.state.blur;
        return this._isInteracting() ? 0 : this.state.blur;
    }

    /* ---------- State / history ---------- */
    saveState() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(this.deepCopy(this.state));
        this.historyIndex++;
        this.updateButtons();
    }
    loadState(idx) {
        this.state = this.deepCopy(this.history[idx]);
        this.brushColorSlider.value = this.state.brushColor; this.thicknessSlider.value = this.state.thickness;
        this.blurSlider.value = this.state.blur; this.backgroundSlider.value = this.state.background;
        this.toolButtons.forEach(btn => btn.classList.toggle('selected', btn.dataset.tool === this.state.tool));
        this.applyFilters(); this.redraw(); this.updateButtons();
    }
    updateButtons() { this.undoBtn.disabled = this.historyIndex <= 0; this.redoBtn.disabled = this.historyIndex >= this.history.length - 1; }

    /* ---------- Event handlers (methods) ---------- */
    onToolClick(e) {
        const btn = e.currentTarget;
        this.state.tool = btn.dataset.tool;
        this.toolButtons.forEach(b => b.classList.toggle('selected', b === btn));
    }

    onSwapColors() {
        const temp = this.state.brushColor;
        this.state.brushColor = this.state.background;
        this.state.background = temp;
        // Sync UI sliders
        this.brushColorSlider.value = this.state.brushColor;
        this.backgroundSlider.value = this.state.background;

        // Update existing (non-eraser) paths to the new brush color
        this.state.paths.forEach(p => {
            if (!p.erase) p.color = this.state.brushColor;
        });

        this.redraw();
        this.saveState();
    }


    onFlipToggle() {
        this.state.flipX = !this.state.flipX;
        this.redraw();
        this.saveState();
    }

    onCanvasPointerDown(e) {
        e.preventDefault();

        // refresh cached canvas rect at gesture start
        this.updateCanvasRect();

        // Touch support: only allow one drawing touch pointer at a time
        if (this.state.tool === 'draw' && e.pointerType === 'touch') {
            if (this.drawingPointerId !== null) return;
            this.drawingPointerId = e.pointerId;
        }

        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
            // ignore if pointer capture not supported
        }

        // Store pointer position and type
        var p0 = this.getPos(e);
        this.pointers[e.pointerId] = { x: p0.x, y: p0.y, pointerType: e.pointerType };

        const ids = Object.keys(this.pointers);

        // Move/pinch handling
        if (this.state.tool === 'move') {
            if (e.pointerType === 'mouse') this.mouseMoveActive = true;
            if (ids.length === 2) {
                const [i1, i2] = ids;
                const p1 = this.pointers[i1];
                const p2 = this.pointers[i2];
                // Compute pinch metrics in logical (canvas) coordinates using the
                // transform state at the start of the gesture. Store the inverse
                // of the forward matrix (custom 2D matrix impl).
                const baseM = this.buildTransformMatrix(this.canvas.width, this.canvas.height, this.state);
                const invBase = DrawingApp._mInvert(baseM);
                const lp1 = DrawingApp._mApply(invBase, p1.x, p1.y);
                const lp2 = DrawingApp._mApply(invBase, p2.x, p2.y);
                const logicalAngle = Math.atan2(lp2.y - lp1.y, lp2.x - lp1.x);
                this.pinch = {
                    dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
                    angle: logicalAngle,
                    mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
                    offsetX: this.state.offsetX,
                    offsetY: this.state.offsetY,
                    scale: this.state.scale,
                    rotation: this.state.rotation,
                    invBase // our custom inverse matrix object {a,b,c,d,e,f}
                };
            }
        }

        else if (this.state.tool !== 'move') {
            // Begin a new freehand path
            this.drawing = true;
            this.currentPath = [this.getPos(e)];
        }
    }

    onCanvasPointerMove(e) {
        e.preventDefault();
        const pos = this.getPos(e);

        if (this.state.tool === 'move') {
            // Only move when mouse drag is active or any non-mouse pointer moves
            const shouldMove = (e.pointerType === 'mouse' && this.mouseMoveActive) || e.pointerType !== 'mouse';
            if (!shouldMove) return;

            const prev = this.pointers[e.pointerId];
            this.pointers[e.pointerId] = pos;
            const ids = Object.keys(this.pointers);

            if (ids.length === 1) {
                // Single-pointer move -> pan the canvas
                const prevScreen = prev;
                const currScreen = pos;
                const prevLogical = this.screenToCanvas(prevScreen.x, prevScreen.y);
                const currLogical = this.screenToCanvas(currScreen.x, currScreen.y);
                const dx = currLogical.x - prevLogical.x;
                const dy = currLogical.y - prevLogical.y;
                this.state.offsetX += dx;
                this.state.offsetY += dy;
                this.scheduleRedraw();
            } else if (ids.length === 2 && this.pinch) {
                const [i1, i2] = ids;
                const p1 = this.pointers[i1];
                const p2 = this.pointers[i2];
                const newD = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                // Compute rotation delta using the fixed inverse matrix saved at
                // the start of the pinch (if available).
                let newA;
                if (this.pinch && this.pinch.invBase) {
                    const l1 = DrawingApp._mApply(this.pinch.invBase, p1.x, p1.y);
                    const l2 = DrawingApp._mApply(this.pinch.invBase, p2.x, p2.y);
                    newA = Math.atan2(l2.y - l1.y, l2.x - l1.x);
                } else {
                    const lp1 = this.screenToCanvas(p1.x, p1.y);
                    const lp2 = this.screenToCanvas(p2.x, p2.y);
                    newA = Math.atan2(lp2.y - lp1.y, lp2.x - lp1.x);
                }
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                // Two-pointer pinch -> scale/rotate around midpoint
                this.state.scale = this.pinch.scale * (newD / this.pinch.dist);
                this.state.rotation = this.pinch.rotation + (newA - this.pinch.angle);

                const prevMid = this.pinch.mid;
                const currMid = mid;
                const prevLogical = this.screenToCanvas(prevMid.x, prevMid.y);
                const currLogical = this.screenToCanvas(currMid.x, currMid.y);
                const dx = currLogical.x - prevLogical.x;
                const dy = currLogical.y - prevLogical.y;
                this.state.offsetX = this.pinch.offsetX + dx;
                this.state.offsetY = this.pinch.offsetY + dy;
                this.scheduleRedraw();
            }
        } else if (this.drawing) {
            if (this.state.tool === 'draw' && e.pointerType === 'touch' && e.pointerId !== this.drawingPointerId) return;
            this.currentPath.push(pos);
            this.scheduleRedraw();
        }
    }

    onCanvasPointerUp(e) {
        e.preventDefault();
        try { if (e.pointerId) this.canvas.releasePointerCapture(e.pointerId); } catch (__) {}
        if (e.pointerId != null) { delete this.pointers[e.pointerId]; } else { delete this.pointers['global']; }
        if (this.state.tool === 'move' && e.pointerType === 'mouse') this.mouseMoveActive = false;



        if (this.state.tool === 'move') {
            // Save translation/scale/rotation change as a single undo step
            this.saveState();
            if (this.deferBlurDuringInteraction) this.scheduleRedraw();
        }
        if (!this.drawing) return;
        if (this.state.tool === 'draw' && e.pointerType === 'touch' && e.pointerId !== this.drawingPointerId) return;

        this.state.paths.push({
            points: this.currentPath,
            erase: this.state.tool === 'erase',
            color: this.state.brushColor
        });

        this.saveState();
        this.drawing = false;
        this.currentPath = [];

        if (this.state.tool === 'draw' && e.pointerType === 'touch' && e.pointerId === this.drawingPointerId) {
            this.drawingPointerId = null;
        }

        /* If we were deferring blur, force a redraw now that interaction ended */
        if (this.deferBlurDuringInteraction) this.scheduleRedraw();
    }

    onCanvasPointerCancel(e) {
        e.preventDefault();
        try { if (e.pointerId) this.canvas.releasePointerCapture(e.pointerId); } catch (__) {}
        if (e.pointerId != null) { delete this.pointers[e.pointerId]; } else { delete this.pointers['global']; }
        if (this.state.tool === 'move' && e.pointerType === 'mouse') this.mouseMoveActive = false;


        if (this.state.tool === 'draw' && e.pointerType === 'touch' && e.pointerId === this.drawingPointerId) {
            this.drawing = false;
            this.currentPath = [];
            this.drawingPointerId = null;
        } else {
            this.drawing = false;
            this.currentPath = [];
        }

        /* Restore blur after cancelled interactions as well */
        if (this.deferBlurDuringInteraction) this.scheduleRedraw();
    }

    // Minimum allowed distance between brush and background values
    static get MIN_COLOR_DISTANCE() { return 10; }

    onBrushColorInput() {
        let brushVal = +this.brushColorSlider.value;
        let bgVal = +this.backgroundSlider.value;
        const minDist = DrawingApp.MIN_COLOR_DISTANCE;
        // If too close, skip over forbidden range
        if (Math.abs(brushVal - bgVal) < minDist) {
            if (brushVal > bgVal) {
                brushVal = bgVal + minDist;
            } else {
                brushVal = bgVal - minDist;
            }
            brushVal = Math.max(+this.brushColorSlider.min, Math.min(+this.brushColorSlider.max, brushVal));
            this.brushColorSlider.value = brushVal;
        }
        this.state.brushColor = brushVal;
        this.state.paths.forEach(p => { if (!p.erase) p.color = this.state.brushColor; });
        this.redraw();
    }

    onBackgroundColorInput() {
        let bgVal = +this.backgroundSlider.value;
        let brushVal = +this.brushColorSlider.value;
        const minDist = DrawingApp.MIN_COLOR_DISTANCE;
        // If too close, skip over forbidden range
        if (Math.abs(bgVal - brushVal) < minDist) {
            if (bgVal > brushVal) {
                bgVal = brushVal + minDist;
            } else {
                bgVal = brushVal - minDist;
            }
            bgVal = Math.max(+this.backgroundSlider.min, Math.min(+this.backgroundSlider.max, bgVal));
            this.backgroundSlider.value = bgVal;
        }
        this.state.background = bgVal;
        this.redraw();
    }

    onGenericSliderInput(e) {
        const slider = e.currentTarget;
        this.state[slider.id] = +slider.value;
        this.applyFilters();
        // coalesce rapid input events
        this.scheduleRedraw();
    }

    onGenericSliderChange() { this.saveState(); }

    // Double-tap / double-click handling for sliders
    // If user double-taps near the centre of the slider it jumps to the centre value.
    // If they double-tap near either edge it jumps to the nearest edge (min/max).
    _attachSliderDoubleTap(slider) {
        if (!slider) return;
        if (!this._lastSliderTap) this._lastSliderTap = new WeakMap();

        const maxDelay = 350; // ms
        const maxDistance = 30; // px

        // Shared double-tap detection logic
        const tryDoubleTap = (x, y, now, prev) => {
            if (prev && (now - prev.time) <= maxDelay) {
                const dx = x - prev.x;
                const dy = y - prev.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= maxDistance) {
                    // treat as double-tap
                    onDoubleAction(x);
                    this._lastSliderTap.delete(slider);
                    return true;
                }
            }
            return false;
        };

        const onDoubleAction = (clientX) => {
            const rect = slider.getBoundingClientRect();
            const x = clientX - rect.left;
            const frac = Math.max(0, Math.min(1, x / rect.width));

            const min = (slider.min != null && slider.min !== '') ? parseFloat(slider.min) : 0;
            const max = (slider.max != null && slider.max !== '') ? parseFloat(slider.max) : 100;
            const stepRaw = (slider.step != null && slider.step !== '') ? parseFloat(slider.step) : 1;
            const step = (isFinite(stepRaw) && stepRaw > 0) ? stepRaw : 1;


            const centreVal = (min + max) / 2;
            const centreThreshold = 0.15; // fraction of track width considered "near centre"

            let newVal = null;
            if (Math.abs(frac - 0.5) <= centreThreshold) {
                const n = Math.round(centreVal / step) * step;
                newVal = Math.max(min, Math.min(max, n));
            } else {
                // jump to nearest edge
                if (frac < 0.25) {
                    newVal = min;
                } else if (frac > 0.75) {
                    newVal = max;
                }
            }

            slider.value = newVal;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
        };

        slider.addEventListener('pointerup', (ev) => {
            const now = Date.now();
            const prev = this._lastSliderTap.get(slider);
            if (!tryDoubleTap(ev.clientX, ev.clientY, now, prev)) {
                this._lastSliderTap.set(slider, { time: now, x: ev.clientX, y: ev.clientY });
            }
        }, { passive: true });

        if (!('onpointerup' in window)) {
            slider.addEventListener('touchend', (tev) => {
                if (!tev.changedTouches || tev.changedTouches.length === 0) return;
                const t = tev.changedTouches[0];
                const now = Date.now();
                const prev = this._lastSliderTap.get(slider);
                if (!tryDoubleTap(t.clientX, t.clientY, now, prev)) {
                    this._lastSliderTap.set(slider, { time: now, x: t.clientX, y: t.clientY });
                }
            }, { passive: false });
        }

        slider.addEventListener('dblclick', (ev) => {
            onDoubleAction(ev.clientX);
        });
    }

    onUndo() { if (this.historyIndex > 0) this.loadState(--this.historyIndex); }
    onRedo() { if (this.historyIndex < this.history.length - 1) this.loadState(++this.historyIndex); }
    onClear() {
        this.state.paths = [];
        // Reset all sliders except background and brush color to their default values
        const sliders = [this.thicknessSlider, this.blurSlider];
        sliders.forEach(slider => {
            if (slider) {
                slider.value = slider.defaultValue;
                this.state[slider.id] = +slider.defaultValue;
            }
        });
        this.saveState();
        this.redraw();
    }

    /* ---------- Save / Export / Import ---------- */
    
    // Guarantees:
    // - Must-have uploads (JSON + CROPPED PNG) complete to Cloudinary BEFORE navigating.
    // - Nice-to-have (UNCROPPED PNG + SVG) attempted but won't block navigation.
    // - Retries with exponential backoff; if a must-have fails, we DO NOT advance.

    async onSave() {
    // -------- Config --------
    const MUST_HAVE = ["json", "png_cropped"];      // blocking artifacts
    const NICE_TO_HAVE = ["png_uncropped", "svg"];  // non-blocking artifacts
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 200;
    const JITTER_MS = 250;
    const MIN_SPINNER_MS = 1500; // keep overlay for at least this long

    // -------- Params / naming --------
    const params = (window.VE && VE.parseParams) ? VE.parseParams() : { p:"", s:"", t:"", i:"0" };
    const pad2 = (n)=> String(n).padStart(2,"0");
    const now = new Date();
    const saveTime = `${String(now.getFullYear()).slice(-2)}${pad2(now.getMonth()+1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}`;
    const sessionTime = params.s || "";
    const participant = params.p || "";
    const idx = Math.max(0, parseInt(params.i || "0", 10) || 0);
    const trialN = String(idx + 1);

    let trialT = "";
    try {
        const wrap = (window.VE && VE.getCurrentTrialInfo) ? VE.getCurrentTrialInfo(params) : null;
        trialT = wrap && wrap.info ? String(wrap.info.code || "") : "";
    } catch(e){ /* noop */ }
    if (!trialT && typeof params.t === "string" && params.t.length > idx) trialT = params.t.charAt(idx);
    if (!trialT) trialT = "UNK";

    const baseName = `saveTime_${saveTime}__sessionTime_${sessionTime}__participant_${participant}__trialN_${trialN}__trialT_${trialT}`;

    const toBlobAsync = (canvas, type="image/png", quality=0.92) => new Promise((res, rej)=>{
        try { canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob returned null")), type, quality); }
        catch (e) { rej(e); }
    });

    const backoff = (attempt) => BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * JITTER_MS);

    const uploadWithRetry = async (blob, fileName, kind, mode/*"image"|"raw"*/) => {
        let lastErr = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = (mode === "raw")
            ? await uploadRawToCloudinary(blob, fileName)
            : await uploadImageToCloudinary(blob, fileName);
            if (res && (res.secure_url || res.url || res.public_id)) return { ok:true, response:res };
            throw new Error(`Cloudinary response missing URL/public_id for ${kind}`);
        } catch (err) {
            lastErr = err;
            console.warn(`[upload retry ${attempt}/${MAX_RETRIES}] ${kind}`, err);
            if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, backoff(attempt)));
        }
        }
        return { ok:false, error:lastErr };
    };

    // Require sliders adjusted at least once; show popup if not
    const required = ['background', 'brushColor', 'blur', 'thickness'];
    const unmoved = required.filter(k => !this._sliderAdjusted[k]);
    if (!this._finishPopupShown && unmoved.length > 0) {
        this._finishPopupShown = true;
        this.showFinishPopup(unmoved);
        return;
    }

    // Block accidental close/back while saving
    const beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnloadHandler);

    // Show overlay
    const overlayStart = performance.now();
    if (typeof window.__VE_showSaving === "function") window.__VE_showSaving();

    try {
        // ---------- Build artifacts ----------
        // JSON (state + viewport) — must-have (RAW upload)
        let jsonBlob;
        try {
        const exportState = this.deepCopy(this.state);
        exportState.canvasWidth  = this.canvas.width;
        exportState.canvasHeight = this.canvas.height;
        const viewportRect = this.getViewportRect(this.canvas);
        exportState.viewport = {
            centerX: viewportRect.centerX,
            centerY: viewportRect.centerY,
            width: viewportRect.normDivX * 2,
            height: viewportRect.normDivY * 2
        };
        jsonBlob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        } catch (e) {
        throw new Error("Failed to serialize JSON state: " + (e?.message || e));
        }

        // CROPPED PNG — must-have (IMAGE upload)
        let croppedBlob;
        try {
        const { sx, sy, sw, sh, viewportRect: vpRect } = this.getViewportCropRect();
        const tmp = this.renderToTempCanvas(vpRect);
        const out = document.createElement('canvas');
        out.width = sw; out.height = sh;
        const c2 = out.getContext('2d');
        c2.drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);
        croppedBlob = await toBlobAsync(out, "image/png", 0.92);
        } catch (e) {
        throw new Error("Failed to build cropped PNG: " + (e?.message || e));
        }

        // UNCROPPED PNG — nice-to-have (IMAGE upload)
        let fullPngBlob = null;
        try {
        const offFull = this.renderToTempCanvas(null);
        fullPngBlob = await toBlobAsync(offFull, "image/png", 0.92);
        } catch (e) {
        console.warn("Uncropped PNG generation failed (will continue):", e);
        }

        // SVG — nice-to-have (IMAGE upload; Cloudinary treats SVG as image)
        let svgBlob = null;
        try {
        const svgData = this.exportSVG(this.state.paths, this.canvas.width, this.canvas.height, this.state.background);
        svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
        } catch (e) {
        console.warn("SVG generation failed (will continue):", e);
        }

        // ---------- Upload must-have (sequential) ----------
        const mustHaveMap = {
        json:       { blob: jsonBlob,   name: `${baseName}__fileType_json.json`,     mode:"raw"   },
        png_cropped:{ blob: croppedBlob, name: `${baseName}__fileType_cropped.png`,  mode:"image" }
        };

        for (const kind of MUST_HAVE) {
        const spec = mustHaveMap[kind];
        const result = await uploadWithRetry(spec.blob, spec.name, kind, spec.mode);
        if (!result.ok) {
            console.error(`Must-have upload failed: ${kind}`, result.error);
            throw new Error(`Critical upload failed (${kind}).`);
        }
        }

        // ---------- Upload nice-to-have (parallel, non-blocking) ----------
        const niceJobs = [];
        if (fullPngBlob) niceJobs.push(uploadWithRetry(fullPngBlob, `${baseName}__fileType_uncropped.png`, "png_uncropped", "image"));
        if (svgBlob)     niceJobs.push(uploadWithRetry(svgBlob,     `${baseName}__fileType_svg.svg`,        "svg",           "image"));
        if (niceJobs.length) {
        const niceResults = await Promise.all(niceJobs);
        niceResults.forEach(r => { if (!r.ok) console.warn("Nice-to-have upload failed:", r.error || r); });
        }

        // ---------- Keep overlay visible a minimum time ----------
        const elapsed = performance.now() - overlayStart;
        if (elapsed < MIN_SPINNER_MS) await new Promise(r => setTimeout(r, MIN_SPINNER_MS - elapsed));

        // ---------- Navigate forward ----------
        try {
        const r = (window.VE && VE.nextRoute) ? VE.nextRoute("drawing", params) : { page: "wait.html", params };
        if (typeof window.__VE_hideSaving === "function") window.__VE_hideSaving();
        window.removeEventListener("beforeunload", beforeUnloadHandler);
        if (window.VE && VE.goto) VE.goto(r.page, r.params);
        else {
            const q = (window.VE && VE.buildQuery) ? VE.buildQuery(r.params) : "";
            location.href = q ? `${r.page}?${q}` : r.page;
        }
        } catch (navErr) {
        console.error("Navigation failed after save:", navErr);
        window.removeEventListener("beforeunload", beforeUnloadHandler);
        // Overlay stays hidden; remain on page for researcher to intervene
        }

    } catch (fatal) {
        // Any fatal error = DO NOT navigate. Keep overlay up so a researcher sees the issue.
        console.error("Fatal saving error (not navigating):", fatal);
        // (Optionally re-enable specific UI controls for a retry button you add later.)
    }
    }


    onSave_old() {
        // If any required slider has not been adjusted, show popup
        const required = ['background', 'brushColor', 'blur', 'thickness'];
        const unmoved = required.filter(k => !this._sliderAdjusted[k]);
        if (!this._finishPopupShown && unmoved.length > 0) {
            this._finishPopupShown = true;
            this.showFinishPopup(unmoved);
            return;
        }

        this.onExportJson(); // Automatically export JSON when Finish is pressed

        const ts = this.getTimestamp();

        // Uncropped export (whole canvas)
        const off1 = this.renderToTempCanvas(null);
        this.downloadCanvas(off1, `drawing_${ts}_uncropped.png`);

        // Cropped export (viewport only)
        const { sx, sy, sw, sh, vpW: vpWidth, vpH: vpHeight, viewportRect: vpRect } = this.getViewportCropRect();
        const tempCanvas = this.renderToTempCanvas(vpRect);
        const off2 = document.createElement('canvas');
        off2.width = sw;
        off2.height = sh;
        const c2 = off2.getContext('2d');
        c2.drawImage(tempCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        this.downloadCanvas(off2, `drawing_${ts}_cropped.png`);

        // SVG export
        const svgData = this.exportSVG(this.state.paths, this.canvas.width, this.canvas.height, this.state.background);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
        this.downloadBlob(svgBlob, `drawing_${ts}_uncropped.svg`);
    }

    onExportJson() {
        // Deep copy state to avoid mutation
        const exportState = this.deepCopy(this.state);

        // Add canvas size
        exportState.canvasWidth = this.canvas.width;
        exportState.canvasHeight = this.canvas.height;

        // Add viewport size
        const viewportRect = this.getViewportRect(this.canvas);
        exportState.viewport = {
            centerX: viewportRect.centerX,
            centerY: viewportRect.centerY,
            width: viewportRect.normDivX * 2,   // Add viewport width
            height: viewportRect.normDivY * 2   // Add viewport height
        };


        const data = JSON.stringify(exportState, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        this.downloadBlob(blob, `drawing_${this.getTimestamp()}.json`);
    }

    /**
     * Sanitize imported JSON for drawing state
     * @param {object} loaded - The parsed JSON object
     * @returns {object} sanitized state object
     */
    sanitizeImportedJson(loaded) {
        // Reject if top-level is not an object
        if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('Invalid format');
        // Prototype-pollution guard: reject if any dangerous keys exist anywhere
        const hasProtoKeys = (o) => {
            if (!o || typeof o !== 'object') return false;
            for (const k of Object.keys(o)) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
                if (typeof o[k] === 'object' && hasProtoKeys(o[k])) return true;
            }
            return false;
        };
        if (hasProtoKeys(loaded)) throw new Error('Disallowed keys in JSON');
        // Minimal shape validation: require 'paths' array
        if (!Array.isArray(loaded.paths)) throw new Error('Missing or invalid "paths" array');
        // Whitelist of allowed top-level state keys and basic type checks
        const allowedKeys = new Set([
        'paths', 'brushColor', 'thickness', 'brightness', 'contrast', 'blur', 'background',
        'tool', 'invert', 'flipX', 'offsetX', 'offsetY', 'scale', 'rotation'
        ]);
        const sanitized = { paths: [] };
        // Sanitize paths: ensure each path is an object with points array
        for (const p of loaded.paths) {
            if (!p || typeof p !== 'object') continue;
            if (!Array.isArray(p.points)) continue;
            // Sanitize each point (x,y numeric)
            const pts = [];
            for (const pt of p.points) {
                if (!pt || typeof pt !== 'object') continue;
                const x = Number(pt.x);
                const y = Number(pt.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                pts.push({ x, y });
            }
            if (pts.length < 2) continue; // ignore degenerate paths
            sanitized.paths.push({ points: pts, erase: !!p.erase, color: Number.isFinite(Number(p.color)) ? Number(p.color) : this.state.brushColor });
        }
        // Copy whitelisted scalar keys if present and valid
        for (const k of Object.keys(loaded)) {
            if (!allowedKeys.has(k)) continue;
            const v = loaded[k];
            switch (k) {
                case 'brushColor':
                case 'background':
                    if (Number.isFinite(Number(v))) sanitized[k] = Math.max(0, Math.min(255, Number(v)));
                    break;
                case 'thickness':
                    if (Number.isFinite(Number(v))) sanitized[k] = Math.max(1, Number(v));
                    break;
                case 'brightness':
                case 'contrast':
                    if (Number.isFinite(Number(v))) sanitized[k] = Number(v);
                    break;
                case 'blur':
                    if (Number.isFinite(Number(v))) sanitized[k] = Math.max(0, Number(v));
                    break;
                case 'tool':
                    if (typeof v === 'string') sanitized[k] = v;
                    break;
                case 'invert':
                case 'flipX':
                    sanitized[k] = !!v;
                    break;
                case 'offsetX':
                case 'offsetY':
                case 'scale':
                case 'rotation':
                    if (Number.isFinite(Number(v))) sanitized[k] = Number(v);
                    break;
                case 'paths':
                    // already handled
                    break;
            }
        }
        return sanitized;
    }

    /**
     * Import drawing state from JSON file
     */
    onImportJson() {
        this.createFilePicker('.json,application/json', (file) => {
            if (!file) return;
            // Safety: enforce a reasonable maximum file size to avoid DoS
            const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
            if (file.size > MAX_BYTES) {
                alert('File is too large to import. Please use a smaller JSON file.');
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const raw = String(event.target.result || '');
                    if (raw.trim().length === 0) throw new Error('Empty file');
                    const loaded = JSON.parse(raw);
                    const sanitized = this.sanitizeImportedJson(loaded);
                    // Merge sanitized object into current state safely
                    const newState = this.deepCopy(this.state);
                    newState.paths = sanitized.paths;
                    for (const k of Object.keys(sanitized)) {
                        if (k === 'paths') continue;
                        newState[k] = sanitized[k];
                    }
                    this.state = newState;
                    // Update UI controls from new state
                    this.brushColorSlider.value = this.state.brushColor;
                    this.thicknessSlider.value = this.state.thickness;
                    this.blurSlider.value = this.state.blur;
                    this.backgroundSlider.value = this.state.background;
                    this.toolButtons.forEach(btn => btn.classList.toggle('selected', btn.dataset.tool === this.state.tool));
                    this.flipBtn.classList.toggle('active', this.state.flipX);
                    this.applyFilters();
                    this.redraw();
                    this.saveState();
                } catch (err) {
                    console.warn('Import JSON failed:', err);
                    alert('Failed to load drawing: ' + (err && err.message ? err.message : String(err)));
                }
            };
            reader.readAsText(file);
        });
    }

    onImportSvg() {
        this.createFilePicker('.svg,image/svg+xml', (file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const svgText = event.target.result;
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                const svgElem = svgDoc.querySelector('svg');
                if (!svgElem) {
                    alert('No SVG found in file.');
                    return;
                }

                // Sanitize the parsed SVG to avoid executing scripts or loading external resources.
                // Remove potentially harmful elements and attributes.
                try {
                    // Remove elements that can contain scripts or foreign content
                    svgDoc.querySelectorAll('script,iframe,object,embed,foreignObject').forEach(n => n.remove());

                    // Remove <style> elements that may contain @import or url() references
                    svgDoc.querySelectorAll('style').forEach(styleEl => {
                        const txt = styleEl.textContent || '';
                        if (/@import|url\(/i.test(txt)) {
                            styleEl.remove();
                        }
                    });

                    // Remove attributes that start with 'on' (inline event handlers)
                    svgDoc.querySelectorAll('*').forEach(elem => {
                        for (const attr of Array.from(elem.attributes)) {
                            if (/^on/i.test(attr.name)) elem.removeAttribute(attr.name);
                            // Remove any external references (xlink:href or href)
                            if (attr.name === 'xlink:href' || attr.name === 'href') {
                                const v = attr.value || '';
                                // If href is a data: or internal fragment (#...), allow only internal fragments
                                if (!v.startsWith('#') && !v.startsWith('data:')) {
                                    elem.removeAttribute(attr.name);
                                }
                            }
                        }
                    });

                    // Remove <use> elements that reference external resources
                    svgDoc.querySelectorAll('use').forEach(u => {
                        const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
                        if (href && !href.startsWith('#') && !href.startsWith('data:')) u.remove();
                    });
                } catch (sanErr) {
                    // If sanitization fails for any reason, fall back to a conservative approach:
                    // remove the svg element entirely to avoid executing unknown content.
                    console.warn('SVG sanitization failed, aborting import', sanErr);
                    alert('Failed to sanitize SVG; import aborted for safety.');
                    return;
                }

                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                const rect = svgElem.querySelector('rect');
                if (rect) {
                    const fill = rect.getAttribute('fill') || '#fff';
                    this.ctx.fillStyle = fill;
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }

                const paths = svgElem.querySelectorAll('path');
                paths.forEach(pathElem => {
                    const d = pathElem.getAttribute('d');
                    if (!d) return;
                    const stroke = pathElem.getAttribute('stroke') || '#000';
                    const strokeWidth = parseFloat(pathElem.getAttribute('stroke-width')) || 2;
                    this.ctx.save();
                    this.ctx.lineWidth = strokeWidth;
                    this.ctx.strokeStyle = stroke;
                    this.ctx.lineCap = pathElem.getAttribute('stroke-linecap') || 'round';
                    this.ctx.lineJoin = pathElem.getAttribute('stroke-linejoin') || 'round';
                    const p = new Path2D(d);
                    this.ctx.stroke(p);
                    this.ctx.restore();
                });
            };
            reader.readAsText(file);
        });
    }

    /* ---------- Drawing primitives ---------- */
    // Draw a single path using the provided 2D context
    drawPath(ctx, obj) {
        if (obj.points.length < 2) return;
        ctx.lineWidth = this.state.thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const colorVal = obj.color;
        ctx.strokeStyle = `rgb(${colorVal},${colorVal},${colorVal})`;
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);
        for (let pt of obj.points.slice(1)) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
    }

    // Apply eraser strokes into the given offscreen context using destination-out
    applyErasersToOffscreen(offCtx, paths, tool, drawing, currentPath) {
        // We assume offCtx already has the transforms and filters applied for drawing
        // Save current state
        offCtx.save();
        // Use destination-out so strokes clear existing pixels
        offCtx.globalCompositeOperation = 'destination-out';
        // Draw all eraser paths (they will punch holes)
        for (let p of paths) {
            if (p.erase) {
                this.drawPath(offCtx, { points: p.points, erase: true, color: 0 });
            }
        }
        // If currently drawing an eraser stroke, render that too
        if (drawing && currentPath && currentPath.length > 1 && tool === 'erase') {
            this.drawPath(offCtx, { points: currentPath, erase: true, color: 0 });
        }
        // Restore composite op
        offCtx.restore();
        // Reset filter in case caller relies on it
        offCtx.filter = 'none';
    }

    drawAllPaths(ctx, paths, tool, drawing, currentPath, brushColor) {
        for (let p of paths) {
            if (!p.erase) this.drawPath(ctx, p);
        }
        if (drawing && currentPath && currentPath.length > 1 && tool !== 'erase') {
            this.drawPath(ctx, { points: currentPath, erase: false, color: brushColor });
        }
    }

    doDrawingPipeline(ctx, width, height, state, paths, drawing, currentPath) {
        // Reset main canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // Ensure the offscreen buffer matches the current size
        if (this._offscreen.width !== width || this._offscreen.height !== height) {
            this._offscreen.width = width;
            this._offscreen.height = height;
            this._offscreenCtx = this._offscreen.getContext('2d');
        }

        // Draw all paths into the offscreen buffer in chronological order.
        // For each path we set composite to 'source-over' for normal strokes
        // and 'destination-out' for erasers so an eraser only clears pixels
        // that existed before it (it will not remove strokes drawn afterwards).
        this._offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._offscreenCtx.clearRect(0, 0, width, height);
        this.applyTransforms(this._offscreenCtx, width, height, state);

        /* Use deferred/“effective” blur and avoid redundant filter sets */
        /* We render strokes to the offscreen with NO filter (best iOS reliability) */
        this._offscreenCtx.filter = 'none';
        this._lastOffFilter = 'none'; // keep cache coherent
        const effBlur = this._getEffectiveBlur();

        // Replay each saved path in order. Use per-path composite operation.
        for (let p of paths) {
            if (p.erase) {
                this._offscreenCtx.globalCompositeOperation = 'destination-out';
                // color is irrelevant for destination-out; pass 0 to drawPath
                this.drawPath(this._offscreenCtx, { points: p.points, erase: true, color: 0 });
            } else {
                this._offscreenCtx.globalCompositeOperation = 'source-over';
                this.drawPath(this._offscreenCtx, p);
            }
        }

        // Draw the currently-active path (in-progress stroke)
        if (drawing && currentPath && currentPath.length > 1) {
            if (state.tool === 'erase') {
                this._offscreenCtx.globalCompositeOperation = 'destination-out';
                this.drawPath(this._offscreenCtx, { points: currentPath, erase: true, color: 0 });
            } else {
                this._offscreenCtx.globalCompositeOperation = 'source-over';
                this.drawPath(this._offscreenCtx, { points: currentPath, erase: false, color: state.brushColor });
            }
        }

        // Reset composite to default
        this._offscreenCtx.globalCompositeOperation = 'source-over';

        // Paint background first (not blurred)
        ctx.setTransform(1,0,0,1,0,0);            // just in case
        ctx.filter = 'none';
        ctx.fillStyle = `rgb(${state.background},${state.background},${state.background})`;
        ctx.fillRect(0, 0, width, height);

        // Now blur ONLY the stroke layer when compositing it onto the main canvas.
        // This is the key change that fixes iPad/WebKit.
        if ('filter' in ctx && effBlur > 0) {
        ctx.filter = `blur(${effBlur}px)`;
        } else {
        ctx.filter = 'none';
        }

        ctx.drawImage(this._offscreen, 0, 0);

        // Reset filter for any later UI draws
        ctx.filter = 'none';
    }

    redraw() {
        this.doDrawingPipeline(
            this.ctx,
            this.canvas.width,
            this.canvas.height,
            this.state,
            this.state.paths,
            this.drawing,
            this.currentPath
        );
    }

    applyFilters() {
        const inv = this.state.invert ? 1 : 0;
        this.canvas.style.filter = `invert(${inv}) ` +
            `brightness(${this.state.brightness}) ` +
            `contrast(${this.state.contrast})`;
    }

    applyTransforms(ctx, width, height, state) {
        // Build a consistent transform matrix (logical -> screen) using DOMMatrix.
        // This composes transforms so that a horizontal flip (flipX) is applied in
        // screen coordinates (i.e. around the vertical centre line of the canvas)
        // instead of in the rotated local space.
        const m = this.buildTransformMatrix(width, height, state);
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    }

    buildTransformMatrix_old(width, height, state) {
        // Compose matrices: translate to center -> rotate -> scale -> apply logical offset -> translate back
        // Then, if flipX is requested, apply a screen-space horizontal flip about the vertical centre line
        // by left-multiplying a flip matrix that translates to centre, scales -1 on X, then translates back.
        const m = new DOMMatrix();

        // Translate logical origin to canvas centre
        m.translateSelf(width / 2, height / 2);
        // Rotation: rotateSelf accepts degrees
        if (state.rotation) m.rotateSelf(state.rotation * 180 / Math.PI);
        // Scale (zoom)
        if (state.scale !== 1) m.scaleSelf(state.scale, state.scale);
        // Logical offsets (in canvas logical units)
        if (state.offsetX || state.offsetY) m.translateSelf(state.offsetX, state.offsetY);
        // Translate back so objects are positioned relative to top-left
        m.translateSelf(-width / 2, -height / 2);

        if (state.flipX) {
            // Flip around vertical centre line in screen coordinates
            const f = new DOMMatrix();
            f.translateSelf(width / 2, 0);
            f.scaleSelf(-1, 1);
            f.translateSelf(-width / 2, 0);
            // left-multiply flip so it's applied in screen space
            return f.multiply(m);
        }

        return m;
    }

    buildTransformMatrix(width, height, state) {
        let m = DrawingApp._mIdentity();
        m = DrawingApp._mMul(m, DrawingApp._mTranslate(width/2, height/2));
        if (state.flipX) m = DrawingApp._mMul(m, DrawingApp._mScale(-1, 1));
        if (state.rotation) m = DrawingApp._mMul(m, DrawingApp._mRotate(state.rotation));
        if (state.scale !== 1) m = DrawingApp._mMul(m, DrawingApp._mScale(state.scale, state.scale));
        m = DrawingApp._mMul(m, DrawingApp._mTranslate(state.offsetX || 0, state.offsetY || 0));
        m = DrawingApp._mMul(m, DrawingApp._mTranslate(-width/2, -height/2));
        return m; // returns {a,b,c,d,e,f}
    }


    getSVGTransform(width, height, state) {
        const transforms = [];
        transforms.push(`translate(${width / 2},${height / 2})`);
        if (state.flipX) transforms.push('scale(-1,1)');
        if (state.rotation) transforms.push(
            `rotate(${state.rotation * 180 / Math.PI})`
        );
        if (state.scale !== 1) transforms.push(`scale(${state.scale})`);
        transforms.push(
            `translate(${-width / 2 + state.offsetX},${-height / 2 + state.offsetY})`
        );
        return transforms.join(' ');
    }

    screenToCanvas(x, y) {
        // Convert screen-space coordinates to canvas logical coordinates by
        // inverting the same transform used for drawing. We build the forward
        // matrix (logical -> screen) and apply its inverse to the screen point.
        const m = this.buildTransformMatrix(this.canvas.width, this.canvas.height, this.state);
        const inv = DrawingApp._mInvert(m);
        return DrawingApp._mApply(inv, x, y);
    }

    getPos(e) {
        const now = Date.now();
        if (!this._canvasRect || (now - (this._canvasRectTime || 0)) > 250) {
            this.updateCanvasRect();
        }
        const r = this._canvasRect || this.canvas.getBoundingClientRect();

        var clientX = (typeof e.clientX === 'number') ? e.clientX : undefined;
        var clientY = (typeof e.clientY === 'number') ? e.clientY : undefined;
        if (clientX === undefined || clientY === undefined) {
            var ts = e.touches || e.changedTouches || [];
            if (ts && ts.length > 0) {
                clientX = ts[0].clientX;
                clientY = ts[0].clientY;
            } else {
                clientX = 0; clientY = 0;
            }
        }

        const scaleX = this._canvasScaleX || (this.canvas.width / r.width);
        const scaleY = this._canvasScaleY || (this.canvas.height / r.height);
        const xCss = clientX - r.left;
        const yCss = clientY - r.top;
        const x = xCss * scaleX;
        const y = yCss * scaleY;

        if (this.state.tool === 'draw' || this.state.tool === 'erase') {
            return this.screenToCanvas(x, y);
        }
        return { x, y };
    }

    isUIElement(target) { if (!target) return false; if (target.closest('.controls') || target.closest('.tool-row') || target.closest('.actions') || target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'LABEL') return true; return false; }
    
    isInCanvasMarginArea(e, marginPx = 100) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const controls = document.querySelector('.controls');
        const controlsRect = controls ? controls.getBoundingClientRect() : null;

        var x = (typeof e.clientX === 'number') ? e.clientX : undefined;
        var y = (typeof e.clientY === 'number') ? e.clientY : undefined;
        if (x === undefined || y === undefined) {
            var ts = e.touches || e.changedTouches || [];
            if (ts && ts.length > 0) { x = ts[0].clientX; y = ts[0].clientY; }
        }

        const inMargin = x >= (canvasRect.left - marginPx) &&
            x <= (canvasRect.right + marginPx) &&
            y >= (canvasRect.top - marginPx) &&
            y <= (canvasRect.bottom + marginPx);

        const inControls = controlsRect &&
            x >= controlsRect.left &&
            x <= controlsRect.right &&
            y >= controlsRect.top &&
            y <= controlsRect.bottom;

        return inMargin && !inControls;
    }

    globalPointerDown(e) {
        // >>> NEW: ignore drawing starts when a modal is open <<<
        if (this._modalOpen) return;

        // Start global drawing only when in draw/erase mode and not clicking UI
        if (!(this.state.tool === 'draw' || this.state.tool === 'erase')) return;
        if (this.isUIElement(e.target)) return;

        if (e.target === this.canvas || this.isInCanvasMarginArea(e, 120)) {
            e.preventDefault();

            if (this.state.tool === 'draw' && e.pointerType === 'touch') {
                if (this.drawingPointerId !== null) return;
                this.drawingPointerId = e.pointerId || 'global';
            }

            const pos = this.getPos(e);
            this.drawing = true;
            this.currentPath = [pos];

            if (e.pointerId && this.canvas.setPointerCapture) {
                try {
                    this.canvas.setPointerCapture(e.pointerId);
                } catch (err) { /* noop */ }
            }

            this.pointers[e.pointerId || 'global'] = { x: pos.x, y: pos.y, pointerType: e.pointerType };
        }
    }


    renderDrawing(ctx, width, height, state, paths, drawing, currentPath) {
        this.doDrawingPipeline(ctx, width, height, state, paths, drawing, currentPath);
    }

    getViewportRect(canvas) {
        const viewportElem = document.getElementById('viewport');
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;

        if (viewportElem) {
            const vpRect = viewportElem.getBoundingClientRect();
            const centerX = ((vpRect.left - canvasRect.left) + vpRect.width / 2) * scaleX;
            const centerY = ((vpRect.top - canvasRect.top) + vpRect.height / 2) * scaleY;
            const normDivX = (vpRect.width / 2) * scaleX;
            const normDivY = (vpRect.height / 2) * scaleY;
            return { centerX, centerY, normDivX, normDivY };
        } else {
            return {
                centerX: canvas.width / 2,
                centerY: canvas.height / 2,
                normDivX: canvas.width / 2,
                normDivY: canvas.height / 2
            };
        }
    }

    exportSVG(paths, width, height, background) {
        const brushColor = this.applyColorFilters(this.state.brushColor);
        const bgColor = this.applyColorFilters(background);

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

        if (this.state.blur > 0) {
            svg += `<filter id="blurFilter"><feGaussianBlur stdDeviation="${this.state.blur}" /></filter>`;
        }

        svg += `<rect width="100%" height="100%" fill="rgb(${bgColor},${bgColor},${bgColor})"`;
        if (this.state.blur > 0) svg += ' filter="url(#blurFilter)"';
        svg += '/>';

        const transformStr = this.getSVGTransform(width, height, this.state);
        svg += `<g transform="${transformStr}">`;

        for (const p of paths) {
            if (p.points.length < 2) continue;
            const color = p.erase ? background : p.color;
            const filtered = this.applyColorFilters(color);
            const stroke = `rgb(${filtered},${filtered},${filtered})`;
            const d = (DrawingUtilsCompat && DrawingUtilsCompat.buildPathD)
                ? DrawingUtilsCompat.buildPathD(p.points)
                : this.buildPathD(p.points);

            svg += `<path d="${d}" stroke="${stroke}" stroke-width="${this.state.thickness}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
            if (this.state.blur > 0) svg += ' filter="url(#blurFilter)"';
            svg += '/>';
        }

        svg += `</g></svg>`;
        return svg;
    }

    scheduleRedraw() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this.redraw();
        });
    }

    /* ---------- Event wiring helpers (refactor) ---------- */
    attachToolListeners() {
        this.toolButtons.forEach(btn => btn.addEventListener('click', this.onToolClick));
        if (this.swapColorsBtn) this.swapColorsBtn.addEventListener('click', this.onSwapColors);
        if (this.flipBtn) this.flipBtn.addEventListener('click', this.onFlipToggle);
    }

    attachPointerListeners() {
    if (this.canvas && supportsPointerEvents()) {
        this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
        this.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
        this.canvas.addEventListener('pointerup', this.onCanvasPointerUp);
        this.canvas.addEventListener('pointercancel', this.onCanvasPointerCancel);
        document.addEventListener('pointerdown', this.globalPointerDown, { passive: false });
    } else if (this.canvas) {
        // Fallback: mouse + touch mapping
        this.canvas.addEventListener('mousedown', (e) => {
        e.pointerType = 'mouse'; e.pointerId = 1; this.onCanvasPointerDown(e);
        });
        window.addEventListener('mousemove', (e) => {
        e.pointerType = 'mouse'; e.pointerId = 1; this.onCanvasPointerMove(e);
        });
        window.addEventListener('mouseup', (e) => {
        e.pointerType = 'mouse'; e.pointerId = 1; this.onCanvasPointerUp(e);
        });
       this.canvas.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0]; if (!t) return;
            const ev = {
                clientX: t.clientX,
                clientY: t.clientY,
                pointerType: 'touch',
                pointerId: t.identifier,
                preventDefault: function () { e.preventDefault(); }
            };
            this.onCanvasPointerDown(ev);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            const t = e.changedTouches[0]; if (!t) return;
            const ev = {
                clientX: t.clientX,
                clientY: t.clientY,
                pointerType: 'touch',
                pointerId: t.identifier,
                preventDefault: function () { e.preventDefault(); }
            };
            this.onCanvasPointerMove(ev);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            const t = e.changedTouches[0]; if (!t) return;
            const ev = {
                clientX: t.clientX,
                clientY: t.clientY,
                pointerType: 'touch',
                pointerId: t.identifier,
                preventDefault: function () { e.preventDefault(); }
            };
            this.onCanvasPointerUp(ev);
        });
        document.addEventListener('mousedown', (e) => {
        e.pointerType = 'mouse'; e.pointerId = 1; this.globalPointerDown(e);
        }, { passive: false });
        document.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0]; if (!t) return;
            const ev = {
                clientX: t.clientX,
                clientY: t.clientY,
                pointerType: 'touch',
                pointerId: t.identifier,
                preventDefault: function () { e.preventDefault(); }
            };
            this.globalPointerDown(ev);
        }, { passive: false });
    }
    }

    attachSliderListeners() {
        if (this.brushColorSlider) {
            this.brushColorSlider.addEventListener('input', this.onBrushColorInput);
            this.brushColorSlider.addEventListener('change', () => this.saveState());
        }
        if (this.backgroundSlider) {
            this.backgroundSlider.addEventListener('input', this.onBackgroundColorInput.bind(this));
            this.backgroundSlider.addEventListener('change', () => this.saveState());
        }
        [this.thicknessSlider, this.blurSlider].forEach(slider => {
            if (!slider) return;
            slider.addEventListener('input', this.onGenericSliderInput);
            slider.addEventListener('change', this.onGenericSliderChange);
        });

        const allSliders = Array.from(document.querySelectorAll('input[type=range]'));
        allSliders.forEach(s => this._attachSliderDoubleTap(s));

        // Track if user adjusted sliders
        if (this.backgroundSlider) this.backgroundSlider.addEventListener('input', () => { this._sliderAdjusted.background = true; });
        if (this.brushColorSlider) this.brushColorSlider.addEventListener('input', () => { this._sliderAdjusted.brushColor = true; });
        if (this.blurSlider) this.blurSlider.addEventListener('input', () => { this._sliderAdjusted.blur = true; });
        if (this.thicknessSlider) this.thicknessSlider.addEventListener('input', () => { this._sliderAdjusted.thickness = true; });
    }

    attachActionListeners() {
        if (this.undoBtn) this.undoBtn.addEventListener('click', this.onUndo);
        if (this.redoBtn) this.redoBtn.addEventListener('click', this.onRedo);
        if (this.clearBtn) this.clearBtn.addEventListener('click', this.onClear);

        if (this.saveBtn) this.saveBtn.addEventListener('click', this.onSave);
        if (this.exportJsonBtn) this.exportJsonBtn.addEventListener('click', this.onExportJson);
        if (this.importJsonBtn) this.importJsonBtn.addEventListener('click', this.onImportJson);
        if (this.importSvgBtn) this.importSvgBtn.addEventListener('click', this.onImportSvg);
    }

    init() {
        this.attachToolListeners();
        this.attachPointerListeners();
        this.attachSliderListeners();
        this.attachActionListeners();

        this.saveState();
        this.applyFilters();
        this.redraw();
        this.updateButtons();

        // Prevent page scroll when drawing with touch outside the viewport/canvas
        document.addEventListener('touchstart', (e) => {
            // >>> NEW: don't block taps while a modal is open <<<
            if (this._modalOpen) return;

            if (this.state.tool === 'draw' || this.state.tool === 'erase') {
                // Use a slightly larger margin to catch near-canvas touches
                if (this.isInCanvasMarginArea(e, 120)) {
                    e.preventDefault();
                }
            }
        }, { passive: false });

        // Optionally, also prevent scroll on touchmove if desired
        document.addEventListener('touchmove', (e) => {
            // >>> NEW: don't block gestures while a modal is open <<<
            if (this._modalOpen) return;

            if (this.state.tool === 'draw' || this.state.tool === 'erase') {
                if (this.isInCanvasMarginArea(e, 120)) {
                    e.preventDefault();
                }
            }
        }, { passive: false });

        // --- Robust double-tap gesture for canvas (touch only, robust two-finger logic) ---
        this._doubleTapState = {
            lastTapTime: 0,
            lastTapX: 0,
            lastTapY: 0,
            lastTapType: 0, // 1 or 2 fingers
            // For two-finger tap tracking
            fingers: {} // pointerId -> {startX, startY, startTime, endTime, moved}
        };

        // --- Touch event listeners for robust double-tap detection ---
        this.canvas.addEventListener('touchstart', (e) => {
            const now = Date.now();
            // Track each finger by identifier
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                this._doubleTapState.fingers[t.identifier] = {
                    startX: t.clientX,
                    startY: t.clientY,
                    startTime: now,
                    moved: false,
                    endTime: 0
                };
            }
            // If two fingers, check if both started within 100ms
            const ids = Object.keys(this._doubleTapState.fingers);
            if (ids.length === 2) {
                const f1 = this._doubleTapState.fingers[ids[0]];
                const f2 = this._doubleTapState.fingers[ids[1]];
                if (Math.abs(f1.startTime - f2.startTime) > 100) {
                    // Not a valid two-finger tap
                    this._doubleTapState.fingers = {};
                }
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (e) => {
            // If any finger moves too much, mark as moved
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const f = this._doubleTapState.fingers[t.identifier];
                if (f) {
                    const dx = t.clientX - f.startX;
                    const dy = t.clientY - f.startY;
                    if (Math.hypot(dx, dy) > 30) {
                        f.moved = true;
                    }
                }
            }
        }, { passive: true });

        this.canvas.addEventListener('touchend', (e) => {

            // Early-return: when not in 'move' tool we don't need to run the
            // heavier double-tap detection logic. Clean up finished finger
            // entries so we don't leak state, then exit quickly.
            if (this.state.tool !== 'move') {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    delete this._doubleTapState.fingers[t.identifier];
                }
                return;
            }

            const now = Date.now();
            // Mark endTime for each finger
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const f = this._doubleTapState.fingers[t.identifier];
                if (f) {
                    f.endTime = now;
                }
            }

            // Only proceed if all fingers are lifted
            if (e.touches.length === 0) {
                const ids = Object.keys(this._doubleTapState.fingers);
                if (ids.length === 1) {
                    // One-finger tap
                    const f = this._doubleTapState.fingers[ids[0]];
                    if (!f.moved && (f.endTime - f.startTime) < 350) {
                        // Check for double-tap
                        const DOUBLE_TAP_DELAY = 350;
                        const DOUBLE_TAP_DIST = 60;
                        const tapX = f.startX;
                        const tapY = f.startY;
                        if (
                            (now - this._doubleTapState.lastTapTime) < DOUBLE_TAP_DELAY &&
                            Math.abs(tapX - this._doubleTapState.lastTapX) < DOUBLE_TAP_DIST &&
                            Math.abs(tapY - this._doubleTapState.lastTapY) < DOUBLE_TAP_DIST &&
                            this._doubleTapState.lastTapType === 1
                        ) {
                            // One-finger double-tap detected: reset translation (only in move tool)
                            this.state.offsetX = 0;
                            this.state.offsetY = 0;
                            this.scheduleRedraw();
                        }
                        // Record this tap
                        this._doubleTapState.lastTapTime = now;
                        this._doubleTapState.lastTapX = tapX;
                        this._doubleTapState.lastTapY = tapY;
                        this._doubleTapState.lastTapType = 1;
                    }
                } else if (ids.length === 2) {
                    // Two-finger tap: check both fingers
                    const f1 = this._doubleTapState.fingers[ids[0]];
                    const f2 = this._doubleTapState.fingers[ids[1]];
                    // Both must have ended within 350ms, both must not have moved, both must lift within 100ms of each other
                    if (
                        !f1.moved && !f2.moved &&
                        (f1.endTime - f1.startTime) < 350 &&
                        (f2.endTime - f2.startTime) < 350 &&
                        Math.abs(f1.endTime - f2.endTime) < 100
                    ) {
                        // Check for double-tap
                        const DOUBLE_TAP_DELAY = 350;
                        const DOUBLE_TAP_DIST = 80;
                        // Use midpoint of both fingers for tap location
                        const tapX = (f1.startX + f2.startX) / 2;
                        const tapY = (f1.startY + f2.startY) / 2;
                        if (
                            (now - this._doubleTapState.lastTapTime) < DOUBLE_TAP_DELAY &&
                            Math.abs(tapX - this._doubleTapState.lastTapX) < DOUBLE_TAP_DIST &&
                            Math.abs(tapY - this._doubleTapState.lastTapY) < DOUBLE_TAP_DIST &&
                            this._doubleTapState.lastTapType === 2
                        ) {
                            // Two-finger double-tap detected: reset rotation and scale (only in move tool; not flip)
                            if (this.state.tool === 'move') {
                                this.state.rotation = 0;
                                this.state.scale = 1;
                                this.scheduleRedraw();
                            }
                        }
                        // Record this tap
                        this._doubleTapState.lastTapTime = now;
                        this._doubleTapState.lastTapX = tapX;
                        this._doubleTapState.lastTapY = tapY;
                        this._doubleTapState.lastTapType = 2;
                    }
                }
                // Reset finger state
                this._doubleTapState.fingers = {};
            }
        }, { passive: true });
        ['gesturestart','gesturechange','gestureend'].forEach(type=>{
            window.addEventListener(type, e => e.preventDefault(), { passive:false });
        });
    }


    showFinishPopup(unmoved) {
        // unmoved: array of slider keys not yet moved
        const sliderNames = {
            background: 'background colour',
            brushColor: 'brush colour',
            blur: 'brush softness',
            thickness: 'brush size'
        };
        const missing = (unmoved && unmoved.length > 0)
            ? unmoved.map(k => sliderNames[k] || k)
            : [];
        const formatList = (arr) => {
            if (arr.length === 1) return arr[0];
            if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
            return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
        };

        const msg = `Before you finish, make sure you've adjusted the ${formatList(missing)} slider${missing.length > 1 ? 's' : ''} to be exactly how you want them.`;

        // Modal overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0,0,0,0.3)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '9999';
        // >>> NEW: prevent default gestures under overlay <<<
        overlay.style.touchAction = 'none';

        // >>> NEW: mark modal open and stop events from bubbling to document handlers <<<
        this._modalOpen = true;
        overlay.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });
        overlay.addEventListener('touchstart',  (e) => e.stopPropagation(), { passive: true });

        // Popup box
        const box = document.createElement('div');
        box.style.background = '#fff';
        box.style.padding = '32px 24px';
        box.style.borderRadius = '10px';
        box.style.boxShadow = '0 2px 16px rgba(0,0,0,0.15)';
        box.style.fontSize = '1.2em';
        box.style.textAlign = 'center';
        box.innerText = msg;

        // OK button
        const btn = document.createElement('button');
        btn.type = 'button'; // Prevent default submit behavior
        btn.innerText = 'OK';
        btn.style.marginTop = '18px';
        btn.style.padding = '8px 24px';
        btn.style.fontSize = '1em';
        btn.style.borderRadius = '6px';
        btn.style.border = '1px solid #0074D9';
        btn.style.background = '#f0f8ff';
        btn.style.cursor = 'pointer';

        const close = () => {
            this._modalOpen = false;              // >>> NEW
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        };

        // >>> NEW: touch- and pen-friendly handlers, plus click as fallback <<<
        btn.addEventListener('pointerup', close, { once: true });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); close(); }, { once: true });
        btn.addEventListener('click', close, { once: true });

        box.appendChild(document.createElement('br'));
        box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }



}

function getSeedFromUrl() {
    try {
        if (typeof URLSearchParams !== 'undefined') {
            const params = new URLSearchParams(window.location.search || '');
            return params.get('seed') || 'default_seed';
        }
    } catch (_) {}
    return 'default_seed';
}

// Instantiate DrawingApp with deterministic seed from URL
window.addEventListener('DOMContentLoaded', () => {
    const app = new DrawingApp(getSeedFromUrl());
    app.init();
});


function supportsPointerEvents() {
    return !!(window.PointerEvent && ('onpointerdown' in window));
}