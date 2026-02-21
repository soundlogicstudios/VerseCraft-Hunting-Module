// target_runner.js
(() => {
  "use strict";

  const layer = document.querySelector(".layer-targets");
  const reticle = document.getElementById("reticle");
  if (!layer || !reticle) return;

  const SPRITES = {
    squirrel: { left: "assets/targets/squirrel-left-facing.webp", right: "assets/targets/squirrel-right-facing.webp" },
    rabbit:   { left: "assets/targets/rabbit-left-facing.webp",   right: "assets/targets/rabbit-right-facing.webp" },
    deer:     { left: "assets/targets/deer-left-facing.webp",     right: "assets/targets/deer-right-facing.webp" },
    bear:     { left: "assets/targets/bear-left-facing.webp",     right: "assets/targets/bear-right-facing.webp" }
  };

  const MEAT_BASE = { squirrel: 8, rabbit: 18, deer: 65, bear: 140 };
  const MEAT_MULT = { "Perfect hit": 1.00, "Good hit": 0.75, "Graze": 0.40, "Miss": 0.00 };

  const WEIGHTS = [
    { type: "squirrel", w: 0.45 },
    { type: "rabbit",   w: 0.30 },
    { type: "deer",     w: 0.20 },
    { type: "bear",     w: 0.05 }
  ];

  const SPEED = { squirrel: 520, rabbit: 460, deer: 360, bear: 260 };
  const TRACK_Y_VH = 52;

  // Ring thresholds (% of target width from center)
  const THRESH = { perfect: 10, good: 25, graze: 40 };

  let img = null;
  let raf = 0;
  let running = false;

  let direction = 1;
  let x = -320;
  let tPrev = 0;

  let currentAnimal = "squirrel";
  let passActive = false;
  let shotLocked = false;

  function viewportW(){ return window.innerWidth || 1024; }

  function pickWeighted(){
    const total = WEIGHTS.reduce((s,i) => s + i.w, 0);
    let r = Math.random() * total;
    for (const i of WEIGHTS){ r -= i.w; if (r <= 0) return i.type; }
    return WEIGHTS[WEIGHTS.length - 1].type;
  }

  function ensureImg(){
    if (img) return;
    img = document.createElement("img");
    img.className = "target-sprite";
    img.alt = "";
    img.decoding = "async";
    img.loading = "eager";
    img.draggable = false;
    /* top is set dynamically each frame to pin the bottom edge to the reticle center Y */
    layer.appendChild(img);
  }

  function startPass(){
    ensureImg();

    currentAnimal = pickWeighted();
    direction = (Math.random() < 0.5) ? 1 : -1;

    shotLocked = false;
    passActive = true;

    img.src = (direction === 1) ? SPRITES[currentAnimal].right : SPRITES[currentAnimal].left;

    const w = viewportW();
    x = (direction === 1) ? -360 : (w + 360);
    img.style.transform = `translate3d(${x}px,0,0)`;
  }

  function reticleCenter(){
    const r = reticle.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function targetCenter(){
    const r = img.getBoundingClientRect();
    return { rect: r, x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function scoreShot(){
    const p = reticleCenter();
    const t = targetCenter();

    const dx = Math.abs(p.x - t.x);
    const tw = t.rect.width || 200;
    const deltaPct = (dx / tw) * 100;

    let outcome = "Miss";
    if (deltaPct <= THRESH.perfect) outcome = "Perfect hit";
    else if (deltaPct <= THRESH.good) outcome = "Good hit";
    else if (deltaPct <= THRESH.graze) outcome = "Graze";

    const base = MEAT_BASE[currentAnimal] || 0;
    const mult = MEAT_MULT[outcome] ?? 0;
    const meat = Math.round(base * mult);

    window.dispatchEvent(new CustomEvent("vc:shot_result", {
      detail: { animal: currentAnimal, outcome, deltaPct, meat }
    }));
  }

  function updatePerfectZoneGlow(){
    if (!passActive || !img || !reticle){
      reticle.classList.remove("perfect-zone");
      return;
    }
    const p = reticleCenter();
    const t = targetCenter();
    const dx = Math.abs(p.x - t.x);
    const tw = t.rect.width || 200;
    const deltaPct = (dx / tw) * 100;
    if (deltaPct <= THRESH.perfect){
      reticle.classList.add("perfect-zone");
    } else {
      reticle.classList.remove("perfect-zone");
    }
  }

  /* Pin the bottom edge of the target sprite to the vertical center of the reticle.
     This runs every frame so it stays correct regardless of screen size or orientation. */
  function alignTargetToReticle(){
    if (!img || !reticle) return;
    const rRect = reticle.getBoundingClientRect();
    const reticleY = rRect.top + rRect.height / 2;   // vertical center of crosshair
    const spriteH = img.getBoundingClientRect().height || img.offsetHeight || 0;
    // layer-targets has inset:0, so top is directly in viewport coordinates
    img.style.top = (reticleY - spriteH + 20) + "px";
  }

  function step(now){
    if (!running) return;
    if (!tPrev) tPrev = now;
    const dt = Math.min((now - tPrev) / 1000, 0.05);
    tPrev = now;

    if (passActive && img){
      x += direction * SPEED[currentAnimal] * dt;
      img.style.transform = `translate3d(${x}px,0,0)`;

      alignTargetToReticle();

      const w = viewportW();
      const rect = img.getBoundingClientRect();
      if ((direction === 1 && rect.left > w + 180) || (direction === -1 && rect.right < -180)) {
        // keep it moving if user doesn't shoot
        startPass();
      }
    }

    updatePerfectZoneGlow();

    raf = requestAnimationFrame(step);
  }

  function handleShoot(){
    if (!running || !passActive || !img) return;
    if (shotLocked) return;
    shotLocked = true;
    scoreShot();
  }

  window.vc_targets = {
    start(){
      if (running) return;
      running = true;
      tPrev = 0;
      startPass();
      window.addEventListener("vc:shoot", handleShoot);
      raf = requestAnimationFrame(step);
    },
    stop(){
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("vc:shoot", handleShoot);
      passActive = false;
      shotLocked = false;
      if (reticle) reticle.classList.remove("perfect-zone");
      if (img && img.parentNode) img.parentNode.removeChild(img);
      img = null;
    },
    reset(){
      startPass();
    }
  };
})();
