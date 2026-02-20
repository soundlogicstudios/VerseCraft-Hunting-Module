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

  const WEIGHTS = [
    { type: "squirrel", w: 0.45 },
    { type: "rabbit",   w: 0.30 },
    { type: "deer",     w: 0.20 },
    { type: "bear",     w: 0.05 }
  ];

  const SPEED = {
    squirrel: 520,
    rabbit:   460,
    deer:     360,
    bear:     260
  };

  const TRACK_Y_VH = 52; // tune if needed

  let img = null;
  let raf = 0;
  let running = false;

  let direction = 1; // 1 L->R, -1 R->L
  let x = -260;
  let tPrev = 0;

  let currentAnimal = "squirrel";
  let passActive = false;
  let shotTaken = false;

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
    img.style.top = `${TRACK_Y_VH}vh`;
    layer.appendChild(img);
  }

  function startPass(){
    ensureImg();

    currentAnimal = pickWeighted();
    direction = (Math.random() < 0.5) ? 1 : -1;

    shotTaken = false;
    passActive = true;

    img.src = (direction === 1) ? SPRITES[currentAnimal].right : SPRITES[currentAnimal].left;

    const w = viewportW();
    x = (direction === 1) ? -280 : (w + 280);
    img.style.transform = `translate3d(${x}px,0,0)`;
  }

  function endPass(){
    passActive = false;
    setTimeout(startPass, 380);
  }

  function reticleCenter(){
    const r = reticle.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function step(now){
    if (!running) return;
    if (!tPrev) tPrev = now;
    const dt = Math.min((now - tPrev) / 1000, 0.05);
    tPrev = now;

    if (passActive && img){
      x += direction * SPEED[currentAnimal] * dt;
      img.style.transform = `translate3d(${x}px,0,0)`;

      const w = viewportW();
      const rect = img.getBoundingClientRect();
      if ((direction === 1 && rect.left > w + 160) || (direction === -1 && rect.right < -160)){
        // No-shot: no ammo spent (handled by hunt_main), just end pass
        endPass();
      }
    }

    raf = requestAnimationFrame(step);
  }

  function handleShoot(){
    if (!running || !passActive || !img) return;
    if (shotTaken) return;
    shotTaken = true;

    const p = reticleCenter();
    const r = img.getBoundingClientRect();
    const hit = (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);

    window.dispatchEvent(new CustomEvent(hit ? "vc:hit" : "vc:miss", {
      detail: { animal: currentAnimal, direction }
    }));

    // end pass immediately after one shot
    endPass();
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
      shotTaken = false;
      if (img && img.parentNode) img.parentNode.removeChild(img);
      img = null;
    },
    reset(){
      if (!running) return;
      startPass();
    }
  };
})();
