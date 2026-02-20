// target_runner.js
// Minimal targets runner. Fixes:
// - Ensures targets appear by being loaded BEFORE hunt_main.js (see index.html)
// - Uses RELATIVE asset paths (works on GitHub Pages + local)
// - Adds reset() for debug button
(() => {
  "use strict";

  const layer = document.querySelector(".layer-targets");
  if (!layer) return;

  let img = null;
  let raf = 0;

  let direction = 1; // 1 = left->right, -1 = right->left
  let x = -240;
  let tPrev = 0;

  // Squirrel only for now (locked). We’ll expand later.
  const SPRITES = {
    left:  "assets/targets/squirrel-left-facing.webp",
    right: "assets/targets/squirrel-right-facing.webp",
  };

  // speed in px/sec
  let speedPxPerSec = 520;

  function removeTarget() {
    if (img && img.parentNode) img.parentNode.removeChild(img);
    img = null;
  }

  function spawnTarget() {
    removeTarget();

    img = document.createElement("img");
    img.className = "target-sprite";
    img.alt = "";
    img.decoding = "async";
    img.loading = "eager";

    // Track aligned to your reticle feel (tune later)
    img.style.top = "52vh";

    direction = (Math.random() < 0.5) ? 1 : -1;
    img.src = (direction === 1) ? SPRITES.right : SPRITES.left;

    layer.appendChild(img);

    const w = window.innerWidth;
    x = (direction === 1) ? -260 : (w + 260);
    img.style.transform = `translate3d(${x}px,0,0)`;
  }

  function step(now) {
    if (!img) { raf = requestAnimationFrame(step); return; }

    if (!tPrev) tPrev = now;
    const dt = Math.min((now - tPrev) / 1000, 0.05);
    tPrev = now;

    x += direction * speedPxPerSec * dt;
    img.style.transform = `translate3d(${x}px,0,0)`;

    const w = window.innerWidth;
    if ((direction === 1 && x > w + 320) || (direction === -1 && x < -320)) {
      spawnTarget();
    }

    raf = requestAnimationFrame(step);
  }

  window.vc_targets = {
    start() {
      if (img) return;
      tPrev = 0;
      spawnTarget();
      raf = requestAnimationFrame(step);
    },
    stop() {
      cancelAnimationFrame(raf);
      removeTarget();
    },
    reset() {
      spawnTarget();
    }
  };
})();
