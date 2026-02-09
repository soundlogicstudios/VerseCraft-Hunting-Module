
// Minimal targets runner (adds a moving target across the screen, respawns each pass)
(() => {
  "use strict";
  const layer = document.querySelector(".layer-targets");
  let img = null;
  let raf = 0;
  let direction = 1;
  let x = -200;
  let passActive = false;
  let animal = "squirrel";
  let SPEED = 520;

  function removeTarget() {
    if (img && img.parentNode) img.parentNode.removeChild(img);
    img = null;
  }
  function spawnTarget() {
    removeTarget();
    img = document.createElement("img");
    img.className = "target-sprite";
    img.src = "assets/targets/squirrel-right-facing.webp";
    img.style.top = '52vh';
    layer.appendChild(img);
    direction = (Math.random()<0.5)?1:-1;
    x = (direction === 1) ? -200 : window.innerWidth + 200;
    img.style.transform = `translate3d(${x}px,0,0)`;
    passActive = true;
  }
  function tick() {
    if (!img) return;
    SPEED = 520;
    x += direction * SPEED * 0.016;
    img.style.transform = `translate3d(${x}px,0,0)`;
    if ((direction === 1 && x > window.innerWidth + 200) ||
        (direction === -1 && x < -200)) {
      spawnTarget();
    }
    raf = requestAnimationFrame(tick);
  }
  window.vc_targets = {
    start() {
      if (img) return;
      spawnTarget();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      removeTarget();
    }
  };
})();
