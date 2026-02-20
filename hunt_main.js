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

  const huntOutcome = document.getElementById("huntOutcome");
  const targetValue = document.getElementById("targetValue");
  const meatValue = document.getElementById("meatValue");
  const ammoValue = document.getElementById("ammoValue");
  const noteValue = document.getElementById("noteValue");

  // --------- Display names (no lowercase in UI)
  const DISPLAY = {
    squirrel: "Squirrel",
    rabbit: "Rabbit",
    deer: "Deer",
    bear: "Bear",
  };

  // --------- Session state
  const STARTING_AMMO = 7;

  let ammo = STARTING_AMMO;
  let food = 0;
  let days = 1;

  let huntStarted = false;     // set true after Start Hunt
  let gameActive = false;      // false when modal is open
  let pendingEnd = false;      // if true, Continue closes to end screen or exits

  // Stats
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

  // --------- Modal screens
  function showRulesModal(){
    pendingEnd = false;

    huntOutcome.textContent = "How To Play";
    targetValue.textContent = "Aim";
    meatValue.textContent = "Earn Meat";
    ammoValue.textContent = "Spend Ammo";
    noteValue.textContent = "Shoot as the target crosses the reticle. Closer to center = better hit.";

    continueBtn.textContent = huntStarted ? "Resume Hunt" : "Start Hunt";
    continueBtn.style.display = "";

    modalOpen();
  }

  function showShotModal(res){
    // res: { animal, outcome, deltaPct, meat }
    const animalKey = String(res.animal || "").toLowerCase();
    const animalName = DISPLAY[animalKey] || "Target";

    huntOutcome.textContent = `Outcome: ${res.outcome}`;
    targetValue.textContent = animalName;
    meatValue.textContent = `${Number(res.meat || 0)} lbs`;
    ammoValue.textContent = "1";
    noteValue.textContent = DEBUG ? `delta ${Number(res.deltaPct || 0).toFixed(1)}%` : " ";

    continueBtn.textContent = (ammo <= 0) ? "View Results" : "Continue";
    continueBtn.style.display = "";

    modalOpen();
  }

  function showEndResultsModal(reasonText){
    pendingEnd = true;

    huntOutcome.textContent = "Hunt Results";
    targetValue.textContent = `Shots fired: ${shotsFired}/${STARTING_AMMO}`;
    meatValue.textContent = `${meatTotal} lbs`;
    ammoValue.textContent = `Ammo left: ${ammo}`;
    noteValue.textContent =
      `${reasonText}\nPerfect: ${resultCounts.perfect}  Good: ${resultCounts.good}  Graze: ${resultCounts.graze}  Miss: ${resultCounts.miss}`;

    continueBtn.textContent = "Exit";
    continueBtn.style.display = "";

    modalOpen();
  }

  function hardEndAndExit(){
    // stop everything and leave
    stopTargets();
    stopBGM();
    const ret = qs.get("return");
    if (ret) { location.href = ret; return; }
    if (history.length > 1) { history.back(); return; }
    location.href = "/";
  }

  // --------- Continue button logic
  function onContinue(){
    // If we’re on end-results modal, exit.
    if (pendingEnd){
      hardEndAndExit();
      return;
    }

    // First time start: unlock audio and start targets
    if (!huntStarted){
      huntStarted = true;
      playBGM();      // iOS needs this on user gesture
      startTargets();
    }

    // Close modal and spawn next target
    modalClose();
    nextTarget();
    updateHud();
  }

  // --------- Debug guides
  let guidesOn = false;
  function toggleGuides(){
    guidesOn = !guidesOn;
    document.documentElement.classList.toggle("guides-on", guidesOn);
    setDebug(guidesOn ? "Guides ON" : "Guides OFF");
  }

  // --------- Back behavior
  function onBack(){
    if (!huntStarted){
      // never started — just exit clean
      hardEndAndExit();
      return;
    }
    // started — show results before exiting
    showEndResultsModal("You ended the hunt early.");
  }

  // --------- FIRE behavior
  function onFire(){
    if (!huntStarted) {
      // if they tap FIRE before start, show rules
      showRulesModal();
      return;
    }
    if (!gameActive) return;

    if (ammo <= 0){
      // End results appears when trying to fire at 0 ammo (locked requirement)
      showEndResultsModal("You are out of ammo.");
      return;
    }

    // Spend ammo only on FIRE (locked)
    ammo -= 1;
    shotsFired += 1;
    updateHud();

    playGunshot();
    window.dispatchEvent(new CustomEvent("vc:shoot"));
  }

  // --------- Shot result event from runner
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

    // If that shot used the last ammo, the next Continue becomes View Results,
    // and then they can Exit from the end screen by tapping FIRE at 0 or Continue->Exit.
    if (ammo <= 0) {
      // On next Continue from shot modal, show end results instead of resuming.
      // We do it by swapping the Continue handler temporarily via pendingEnd on next click.
      // But simplest: after they dismiss the last shot modal, if they try to fire again,
      // we show end results (already locked). So leave as-is.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (debugRow) debugRow.hidden = !DEBUG;

    // Start: show rules modal FIRST (locked)
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
