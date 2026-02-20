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

  let ammo = 7;
  let food = 0;
  let days = 1;

  let gameActive = false;
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

  function openModal(){
    modalBackdrop.classList.add("modal-open");
    modalBackdrop.classList.remove("modal-closed");
    gameActive = false;
    // keep targets running behind if you want, but modal blocks input either way
  }

  function closeModal(){
    modalBackdrop.classList.remove("modal-open");
    modalBackdrop.classList.add("modal-closed");
    gameActive = true;

    // resume / spawn next
    nextTarget();
    updateHud();
  }

  function goBack(){
    const ret = qs.get("return");
    if (ret) { location.href = ret; return; }
    if (history.length > 1) { history.back(); return; }
    location.href = "/";
  }

  let guidesOn = false;
  function toggleGuides(){
    guidesOn = !guidesOn;
    document.documentElement.classList.toggle("guides-on", guidesOn);
    setDebug(guidesOn ? "Guides ON" : "Guides OFF");
  }

  function showShotModal(result){
    const { animal, outcome, deltaPct, meat } = result;

    huntOutcome.textContent = `Outcome: ${outcome}`;
    targetValue.textContent = animal;
    meatValue.textContent = `${meat}`;
    ammoValue.textContent = "1";
    noteValue.textContent = `delta ${Number(deltaPct).toFixed(1)}%`;

    continueBtn.textContent = (ammo <= 0) ? "Done" : "Continue";

    openModal();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (debugRow) debugRow.hidden = !DEBUG;

    // First modal = instructions
    huntOutcome.textContent = "Outcome: —";
    targetValue.textContent = "—";
    meatValue.textContent = "—";
    ammoValue.textContent = "—";
    noteValue.textContent = "Tap Start Hunt";
    continueBtn.textContent = "Start Hunt";

    openModal();
    updateHud();

    // iOS audio unlock happens here
    continueBtn.addEventListener("click", () => {
      if (!gameActive) {
        playBGM();
        startTargets();
      }
      closeModal();
    });

    backBtn.addEventListener("click", goBack);
    if (toggleGuidesBtn) toggleGuidesBtn.addEventListener("click", toggleGuides);

    // Shot result from runner
    window.addEventListener("vc:shot_result", (e) => {
      const res = e.detail || {};
      // Add meat to meter here
      food += Number(res.meat || 0);
      updateHud();

      if (DEBUG) setDebug(`${res.outcome} (${res.animal}) +${res.meat}`);

      showShotModal(res);
    });

    // FIRE: spends ammo no matter what, then asks runner to evaluate
    fireBtn.addEventListener("click", () => {
      if (!gameActive) return;
      if (ammo <= 0) return;

      ammo -= 1;
      updateHud();

      playGunshot();
      window.dispatchEvent(new CustomEvent("vc:shoot"));

      if (ammo <= 0) {
        // runner still reports the shot result; modal will show, but no more shots after
        setDebug("AMMO 0");
      }
    });

    setDebug("BOOT OK");
  });
})();
