
(() => {
  "use strict";
  let layer, sprite, running = false, x = -200, raf = 0, dir = 1, speed = 420, animal = "squirrel";
  function ensure_layer() {
    if (layer) return;
    layer = document.querySelector(".layer-targets");
    if (!layer) throw new Error("Missing .layer-targets");
    sprite = document.createElement("img");
    sprite.className = "target-sprite";
    sprite.src = "assets/targets/squirrel-right-facing.webp";
    sprite.style.top = "45%";
    sprite.style.left = "0";
    layer.appendChild(sprite);
  }
  function tick() {
    if (!running) return;
    x += dir * speed * 0.017;
    sprite.style.transform = "translate3d(" + x + "px,0,0)";
    if (x > window.innerWidth + 100) { x = -200; }
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener("vc:shoot", () => {
    window.dispatchEvent(new CustomEvent("vc:target_killed", { detail: { type: animal } }));
    x = -200;
  });
  window.vc_targets = {
    start() {
      if (running) return;
      ensure_layer();
      running = true;
      x = -200;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      if (sprite) sprite.style.opacity = "0";
    }
  };
})();
