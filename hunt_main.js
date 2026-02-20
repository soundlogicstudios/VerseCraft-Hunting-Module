// hunt_main.js
(() => {
  "use strict";

  const modalBackdrop = document.getElementById("modalBackdrop");
  const continueBtn = document.getElementById("continueBtn");
  const fireBtn = document.getElementById("fireBtn");

  const foodHud = document.getElementById("foodHud");
  const ammoHudTop = document.getElementById("ammoHudTop");
  const dayHud = document.getElementById("dayHud");

  const backBtn = document.getElementById("backBtn");

  const debugRow = document.getElementById("debugRow");
  const resetBtn = document.getElementById("resetBtn");
  const toggleGuidesBtn = document.getElementById("toggleGuidesBtn");
  const hudText = document.getElementById("hudText");

  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.get("debug") === "1";

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

  function updateHud(){
    if (foodHud) foodHud.textContent = `${food} lbs`;
    if (ammoHudTop) ammoHudTop.textContent = String(ammo);
    if (dayHud) dayHud.textContent = String(days);
  }

  function openModal(){
    modalBackdrop.classList.add("modal-open");
    modalBackdrop.classList.remove("modal-closed");
    gameActive = false;
    stopTargets();
    stopBGM();
  }

  function closeModal(){
    modalBackdrop.classList.remove("modal-open");
    modalBackdrop.classList.add("modal-closed");
    gameActive = true;

    // iOS: Start Hunt click is the gesture that unlocks audio.
    playBGM();
    startTargets();
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

  document.addEventListener("DOMContentLoaded", () => {
    if (debugRow) debugRow.hidden = !DEBUG;

    openModal();
    updateHud();

    if (continueBtn) continueBtn.addEventListener("click", closeModal);
    if (backBtn) backBtn.addEventListener("click", goBack);

    if (resetBtn) resetBtn.addEventListener("click", () => {
      if (window.vc_targets && typeof window.vc_targets.reset === "function") window.vc_targets.reset();
      setDebug("Reset Pass");
    });

    if (toggleGuidesBtn) toggleGuidesBtn.addEventListener("click", toggleGuides);

    // FIRE
    if (fireBtn) fireBtn.addEventListener("click", () => {
      if (!gameActive) return;
      if (ammo <= 0) return;

      // Locked rule: ammo only spent on FIRE
      ammo--;
      updateHud();

      playGunshot();
      window.dispatchEvent(new CustomEvent("vc:shoot"));

      if (ammo <= 0){
        setTimeout(() => {
          openModal();
          const rules = document.getElementById("huntRules");
          if (rules) rules.innerHTML = "You are out of ammo.<br/>Hunt ended.";
          if (continueBtn) continueBtn.style.display = "none";
        }, 450);
      }
    });

    // Optional feedback events from runner (debug only)
    window.addEventListener("vc:hit", (e) => DEBUG && setDebug(`HIT: ${e.detail.animal}`));
    window.addEventListener("vc:miss", (e) => DEBUG && setDebug(`MISS: ${e.detail.animal}`));

    setDebug("BOOT OK");
  });
})();
