
// Main game wiring for Hunt module: Modal, audio, targets, BGM, HUD

// DOM refs
const modalBackdrop = document.getElementById("modalBackdrop");
const continueBtn = document.getElementById("continueBtn");
const fireBtn = document.getElementById("fireBtn");
const foodHud = document.getElementById("foodHud");
const ammoHudTop = document.getElementById("ammoHudTop");
const dayHud = document.getElementById("dayHud");

let ammo = 7;
let food = 0;
let days = 1;
let gameActive = false;
let bgm = null;

// --- BGM (background music) ---
function playBGM() {
  if (!bgm) {
    bgm = new Audio("assets/audio/versecraft-hunting-mini-game-theme.mp3");
    bgm.loop = true;
    bgm.volume = 0.75;
  }
  bgm.play().catch(()=>{});
}
function stopBGM() { if (bgm) { bgm.pause(); } }

// --- Gunshot SFX ---
function playGunshot() {
  const sfx = new Audio("assets/audio/gun_shot_single_action_rifle.wav");
  sfx.volume = 1.0;
  sfx.play().catch(()=>{});
}

// --- Targets runner ---
function startTargets() {
  if (window.vc_targets && typeof window.vc_targets.start === "function") window.vc_targets.start();
}
function stopTargets() {
  if (window.vc_targets && typeof window.vc_targets.stop === "function") window.vc_targets.stop();
}

// --- HUD update ---
function updateHud() {
  foodHud.textContent = food + " lbs";
  ammoHudTop.textContent = ammo;
  dayHud.textContent = days;
}

// --- Modal opening/closing ---
function openModal() {
  modalBackdrop.classList.add("modal-open");
  modalBackdrop.classList.remove("modal-closed");
  gameActive = false;
  stopBGM();
  stopTargets();
}
function closeModal() {
  modalBackdrop.classList.remove("modal-open");
  modalBackdrop.classList.add("modal-closed");
  gameActive = true;
  playBGM();
  startTargets();
  updateHud();
}

// --- Game logic ---
// Example target logic (will be improved)
document.addEventListener("DOMContentLoaded", function () {
  openModal();

  continueBtn.addEventListener("click", function () {
    closeModal();
  });

  fireBtn.addEventListener("click", function () {
    if (!gameActive) return;
    if (ammo <= 0) return;
    playGunshot();
    ammo--;
    updateHud();
    if (ammo <= 0) {
      setTimeout(() => {
        openModal();
        document.getElementById("huntRules").innerHTML = "You are out of ammo.<br>Hunt ended.<br>Reload the page to try again.";
        document.getElementById("continueBtn").style.display = "none";
      }, 600);
    }
  });

  // Optionally wire up targets here (future versions)
  updateHud();
});
