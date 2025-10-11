/* Trial flow + routing utilities
   t: string of condition chars; digits = light trial, A-D = image trial, X = break (block split)
   i: current trial index (0-based) over TRIALS ONLY (excluding X)
   Blocks = segments between X. “Trial X of Y” is within the current block.
*/

function splitIntoBlocks(t){
  const blocks = [];
  let current = [];
  for (const ch of (t || "")){
    if (ch === "X") {
      if (current.length) blocks.push(current), (current = []);
    } else {
      current.push(ch);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function flattenTrials(blocks){
  const trials = [];
  blocks.forEach((b, bi) => {
    b.forEach((code, ti) => trials.push({ code, blockIndex: bi, trialInBlock: ti, trialsInBlock: b.length }));
  });
  return trials;
}

function getPlan(t){
  const blocks = splitIntoBlocks(t);
  const trials = flattenTrials(blocks);
  return { blocks, trials, totalTrials: trials.length };
}

function isDigit(ch){ return ch >= "0" && ch <= "9"; }
function isImageChar(ch){ return ch === "A" || ch === "B" || ch === "C" || ch === "D"; }

function trialTypeFromCode(ch){
  if (isDigit(ch)) return { kind: "light", label: `Light (${ch})` };
  if (isImageChar(ch)) return { kind: "image", label: `Image (${ch})` };
  return { kind: "unknown", label: ch || "(none)" };
}

function getCurrentTrialInfo(params){
  const plan = getPlan(params.t || "");
  const idx = Math.min(Math.max(parseInt(params.i || "0", 10) || 0, 0), Math.max(plan.totalTrials - 1, 0));
  const info = plan.trials[idx] || null;
  if (!info) return { plan, idx, info: null };
  const type = trialTypeFromCode(info.code);
  return {
    plan,
    idx,
    info: {
      code: info.code,
      type,
      blockIndex: info.blockIndex,       // 0-based
      trialInBlock: info.trialInBlock,   // 0-based
      trialsInBlock: info.trialsInBlock  // count
    }
  };
}

/* FIRST PAGE of a trial:
   - image trials → IMAGE_STIM
   - light trials → PRE_DRAWING
*/
function firstPageForTrial(info){
  return (info.type.kind === "image") ? "trials/image-stim.html" : "trials/pre-drawing.html";
}

/* Should we show a block WELCOME before the current trial? */
function isStartOfBlock(info){
  return info.trialInBlock === 0;
}

/* Next routing from any page in the flow */
function nextRoute(currentPage, params){
  const { plan, idx, info } = getCurrentTrialInfo(params);
  if (!info || plan.totalTrials === 0) return { page: "trials/end.html", params };

  const atLastTrial = idx === plan.totalTrials - 1;

  switch (currentPage) {
    case "param-check":
      if (isStartOfBlock(info)) return { page: "welcome.html", params };
      return { page: firstPageForTrial(info), params };
    case "welcome":
      return { page: firstPageForTrial(info), params };
    case "image-stim":
      return { page: "trials/pre-drawing.html", params };
    case "pre-drawing":
      return { page: "trials/drawing.html", params };
    case "drawing":
      if (atLastTrial) return { page: "trials/end.html", params };
      return { page: "trials/wait.html", params };
    case "wait": {
      // Move to next trial
      const nextParams = { ...params, i: String(idx + 1) };
      const nextInfo = getCurrentTrialInfo(nextParams).info;
      if (!nextInfo) return { page: "trials/end.html", params: nextParams };
      return isStartOfBlock(nextInfo)
        ? { page: "welcome.html", params: nextParams }
        : { page: firstPageForTrial(nextInfo), params: nextParams };
    }
    case "end":
    default:
      return { page: "trials/end.html", params };
  }
}

/* Back routing (kept simple & dev-friendly)
   - welcome → param-check
   - image-stim → welcome (same i)
   - pre-drawing → (image? image-stim : welcome)
   - drawing → pre-drawing
   - wait → drawing
   (Cross-trial back in DEV can be expanded later.)
*/
function backRoute(currentPage, params){
  const { info } = getCurrentTrialInfo(params);
  switch (currentPage) {
    case "welcome":
      return { page: "param-check.html", params };
    case "image-stim":
      return { page: "welcome.html", params };
    case "pre-drawing":
      if (info && info.type.kind === "image") return { page: "trials/image-stim.html", params };
      return { page: "welcome.html", params };
    case "drawing":
      return { page: "trials/pre-drawing.html", params };
    case "wait":
      return { page: "trials/drawing.html", params };
    default:
      return { page: "param-check.html", params };
  }
}

/* Convenience render for placeholders */
function placeholderPayload(params){
  const { plan, idx, info } = getCurrentTrialInfo(params);
  if (!info) {
    return {
      trialText: "Trial 0 of 0",
      blockNum: 0,
      typeLabel: "(none)",
      idx, totalInBlock: 0
    };
  }
  const trialXofY = `${info.trialInBlock + 1} of ${info.trialsInBlock}`;
  return {
    trialText: `Trial ${trialXofY}`,
    blockNum: info.blockIndex + 1,
    typeLabel: info.type.label,
    idx, totalInBlock: info.trialsInBlock
  };
}

/* Export to global */
window.VXFlow = {
  getPlan,
  getCurrentTrialInfo,
  isStartOfBlock,
  firstPageForTrial,
  nextRoute,
  backRoute,
  placeholderPayload
};
