// hunt_main.js
(() => {
  "use strict";

  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.get("debug") === "1";

  const modalBackdrop = document.getElementById("modalBackdrop");
  const continueBtn = document.getElementById("continueBtn");
  const fireBtn = document.getElementById("fireBtn");

  const foodHud = document.getElementById("foodHud");
  const ammoHudTop = document.getElementById("ammoHudTop");
  const dayHud = document.getElementById("dayHud");
  const backBtn = document.getElementById("backBtn");

  const debugRow = document.getElementById("debugRow");
  const toggleGuidesBtn = document.getElementById("toggleGuidesBtn");
  const hudText = document.getElementById("hudText");

  const huntOutcome = document.getElementById("huntOutcome"); // headline line
  const targetValue = document.getElementById("targetValue");
  const meatValue = document.getElementById("meatValue");
  const ammoValue = document.getElementById("ammoValue");
  const noteValue = document.getElementById("noteValue");

  const DISPLAY = {
    squirrel: "Squirrel",
    rabbit: "Rabbit",
    deer: "Deer",
    bear: "Bear",
  };

  const STARTING_AMMO = 7;

  let ammo = STARTING_AMMO;
  let food = 0;
  let days = 1;

  let huntStarted = false;
  let gameActive = false;
  let pendingEnd = false;

  let shotsFired = 0;
  let resultCounts = { perfect: 0, good: 0, graze: 0, miss: 0 };
  let meatTotal = 0;

  let bgm = null;

  function setDebug(msg){
    if (!DEBUG) return;
    if (hudText) hudText.textContent = msg;
  }

  function safePlay(a){
    try { a.play().catch(()=>{}); } catch(_) {}
  }

  function playBGM(){
    if (!bgm){
      bgm = new Audio("assets/audio/versecraft-hunting-mini-game-theme.mp3");
      bgm.loop = true;
      bgm.volume = 0.75;
    }
    safePlay(bgm);
  }

  function stopBGM(){ if (bgm) bgm.pause(); }

  function playGunshot(){
    const sfx = new Audio("assets/audio/gun_shot_single_action_rifle.wav");
    sfx.volume = 1.0;
    safePlay(sfx);
  }

  function startTargets(){
    if (window.vc_targets && typeof window.vc_targets.start === "function") window.vc_targets.start();
  }
  function stopTargets(){
    if (window.vc_targets && typeof window.vc_targets.stop === "function") window.vc_targets.stop();
  }
  function nextTarget(){
    if (window.vc_targets && typeof window.vc_targets.reset === "function") window.vc_targets.reset();
  }

  function updateHud(){
    if (foodHud) foodHud.textContent = `${food} lbs`;
    if (ammoHudTop) ammoHudTop.textContent = String(ammo);
    if (dayHud) dayHud.textContent = String(days);
  }

  function modalOpen(){
    modalBackdrop.classList.add("modal-open");
    modalBackdrop.classList.remove("modal-closed");
    gameActive = false;
  }

  function modalClose(){
    modalBackdrop.classList.remove("modal-open");
    modalBackdrop.classList.add("modal-closed");
    gameActive = true;
  }

  function ammoRowEl(){
    // safest: ammoValue is inside .row in your modal grid
    return ammoValue ? ammoValue.closest(".row") : null;
  }

  function setHeadlineCentered(on){
    if (!huntOutcome) return;
    huntOutcome.classList.toggle("center-headline", !!on);
    // allow 2-line headline when we use \n
    huntOutcome.style.whiteSpace = "pre-line";
  }

  // --- ADDITIVE FIXES (kept inside this file, no stripping) ---

  function removeNoteLabelIfPresent(){
    if (!modalBackdrop) return;

    // If there is an explicit label element like #noteLabel, kill it.
    const byId =
      modalBackdrop.querySelector("#noteLabel") ||
      modalBackdrop.querySelector("[data-label='note']") ||
      modalBackdrop.querySelector("[data-row='note'] .label");

    if (byId && byId.textContent && byId.textContent.trim().toLowerCase() === "note") {
      byId.textContent = "";
      byId.style.display = "none";
      return;
    }

    // Otherwise, defensively scan typical label classes in the modal.
    const labelCandidates = modalBackdrop.querySelectorAll(".label, .row-label, .key, .k");
    for (const el of labelCandidates) {
      if (!el || !el.textContent) continue;
      if (el.textContent.trim().toLowerCase() === "note") {
        el.textContent = "";
        el.style.display = "none";
      }
    }
  }

  function leftJustifyModalBody(){
    // Ensure multiline + left-aligned body/value text so nothing looks skewed.
    if (targetValue){
      targetValue.style.textAlign = "left";
      targetValue.style.whiteSpace = "pre-line";
    }
    if (meatValue){
      meatValue.style.textAlign = "left";
      meatValue.style.whiteSpace = "pre-line";
    }
    if (ammoValue){
      ammoValue.style.textAlign = "left";
      ammoValue.style.whiteSpace = "pre-line";
    }
    if (noteValue){
      noteValue.style.textAlign = "left";
      noteValue.style.whiteSpace = "pre-line";
    }
  }

  function beefUpContinueButton(){
    if (!continueBtn) return;
    // Make it larger + not shoved into the left corner.
    continueBtn.style.fontSize = "18px";
    continueBtn.style.padding = "14px 22px";
    continueBtn.style.minWidth = "190px";
    continueBtn.style.display = "inline-block";
    continueBtn.style.marginLeft = "auto";
    continueBtn.style.marginRight = "auto";

    // If the parent is flex, this centers it.
    const p = continueBtn.parentElement;
    if (p && getComputedStyle(p).display.includes("flex")) {
      continueBtn.style.alignSelf = "center";
    }
  }

  function applyModalFixes(){
    // Call this whenever the modal is shown to keep it consistent.
    removeNoteLabelIfPresent();
    leftJustifyModalBody();
    beefUpContinueButton();
  }

  // --- end additive fixes ---

  function showRulesModal(){
    pendingEnd = false;

    // Center only THE HUNT + HOW TO PLAY lines
    setHeadlineCentered(true);
    huntOutcome.textContent = "THE HUNT\nHOW TO PLAY";

    targetValue.textContent = "Aim at the reticle";
    meatValue.textContent = "Earn meat on hits";
    noteValue.textContent =
      "Press FIRE as the target crosses the reticle.\n\n" +
      "Closer to the center = better hit.\n\n" +
      "Ammo is only spent when you press FIRE.";

    // Hide ammo row for rules only
    const ar = ammoRowEl();
    if (ar) ar.style.display = "none";

    continueBtn.textContent = huntStarted ? "Resume Hunt" : "Start Hunt";
    continueBtn.style.display = "";

    modalOpen();
    applyModalFixes();
  }

  function showShotModal(res){
    // Shot modal headline not centered (you only wanted How To Play centered)
    setHeadlineCentered(false);

    const animalKey = String(res.animal || "").toLowerCase();
    const animalName = DISPLAY[animalKey] || "Target";

    huntOutcome.textContent = res.outcome ? `Outcome: ${res.outcome}` : "Outcome: —";
    targetValue.textContent = animalName;
    meatValue.textContent = `${Number(res.meat || 0)} lbs`;

    // Ammo row visible + used = 1
    const ar = ammoRowEl();
    if (ar) ar.style.display = "flex";
    ammoValue.textContent = "1";

    noteValue.textContent = DEBUG ? `delta ${Number(res.deltaPct || 0).toFixed(1)}%` : " ";

    continueBtn.textContent = (ammo <= 0) ? "View Results" : "Continue";
    continueBtn.style.display = "";

    modalOpen();
    applyModalFixes();
  }

  function pct(n, d){
    if (!d) return "0%";
    const v = Math.round((n / d) * 100);
    return `${v}%`;
  }

  function showEndResultsModal(reasonText){
    pendingEnd = true;

    setHeadlineCentered(false);
    huntOutcome.textContent = "Hunt Results";

    targetValue.textContent = `Shots fired: ${shotsFired}/${STARTING_AMMO}`;
    meatValue.textContent = `${meatTotal} lbs`;

    // Ammo row visible + X/7
    const ar = ammoRowEl();
    if (ar) ar.style.display = "flex";
    ammoValue.textContent = `${shotsFired} / ${STARTING_AMMO}`;

    const pPerfect = pct(resultCounts.perfect, shotsFired);
    const pGood    = pct(resultCounts.good, shotsFired);
    const pGraze   = pct(resultCounts.graze, shotsFired);
    const pMiss    = pct(resultCounts.miss, shotsFired);

    noteValue.textContent =
      `${reasonText}\n` +
      `Perfect: ${pPerfect} (${resultCounts.perfect})\n` +
      `Good: ${pGood} (${resultCounts.good})\n` +
      `Graze: ${pGraze} (${resultCounts.graze})\n` +
      `Miss: ${pMiss} (${resultCounts.miss})`;

    continueBtn.textContent = "Exit";
    continueBtn.style.display = "";

    modalOpen();
    applyModalFixes();
  }

  function hardEndAndExit(){
    stopTargets();
    stopBGM();
    const ret = qs.get("return");
    if (ret) { location.href = ret; return; }
    if (history.length > 1) { history.back(); return; }
    location.href = "/";
  }

  function onContinue(){
    if (pendingEnd){
      hardEndAndExit();
      return;
    }

    if (!huntStarted){
      huntStarted = true;
      playBGM();      // iOS unlock
      startTargets();
    }

    modalClose();
    nextTarget();
    updateHud();
  }

  let guidesOn = false;
  function toggleGuides(){
    guidesOn = !guidesOn;
    document.documentElement.classList.toggle("guides-on", guidesOn);
    setDebug(guidesOn ? "Guides ON" : "Guides OFF");
  }

  function onBack(){
    if (!huntStarted){
      hardEndAndExit();
      return;
    }
    showEndResultsModal("You ended the hunt early.");
  }

  function onFire(){
    if (!huntStarted){
      showRulesModal();
      return;
    }
    if (!gameActive) return;

    if (ammo <= 0){
      showEndResultsModal("You are out of ammo.");
      return;
    }

    ammo -= 1;
    shotsFired += 1;
    updateHud();

    playGunshot();
    window.dispatchEvent(new CustomEvent("vc:shoot"));
  }

  function onShotResult(e){
    const res = e.detail || {};
    const meat = Number(res.meat || 0);

    meatTotal += meat;
    food += meat;

    const outcome = String(res.outcome || "Miss");
    if (outcome === "Perfect hit") resultCounts.perfect += 1;
    else if (outcome === "Good hit") resultCounts.good += 1;
    else if (outcome === "Graze") resultCounts.graze += 1;
    else resultCounts.miss += 1;

    updateHud();

    if (DEBUG) setDebug(`${outcome} +${meat} (${res.animal})`);

    showShotModal(res);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (debugRow) debugRow.hidden = !DEBUG;

    // One-time UI fixes (additive)
    beefUpContinueButton();

    showRulesModal();
    updateHud();

    continueBtn.addEventListener("click", onContinue);
    fireBtn.addEventListener("click", onFire);
    backBtn.addEventListener("click", onBack);

    if (toggleGuidesBtn) toggleGuidesBtn.addEventListener("click", toggleGuides);

    window.addEventListener("vc:shot_result", onShotResult);

    setDebug("BOOT OK");
  });
})();
