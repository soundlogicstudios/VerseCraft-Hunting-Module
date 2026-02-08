(() => {
  "use strict";
  const CONFIG = {
    mount_selector: "body",
    reticule_selector: "#reticle",
    z_index: 40,
    spawn_delay_ms: [250, 900],
    target_band_top_vh: 30,
    target_band_bottom_vh: 70,
    debug: false
  };

  // All paths relative to public root (for GitHub Pages)
  const ASSETS = {
    squirrel: {
      left:  "assets/targets/squirrel-left-facing.webp",
      right: "assets/targets/squirrel-right-facing.webp",
    },
    rabbit: {
      left:  "assets/targets/rabbit-left-facing.webp",
      right: "assets/targets/rabbit-right-facing.webp",
    },
    deer: {
      left:  "assets/targets/deer-left-facing.webp",
      right: "assets/targets/deer-right-facing.webp",
    },
    bear: {
      left:   "assets/targets/bear-left-facing.webp",
      right:  "assets/targets/bear-right-facing.webp",
    }
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
  const AMMO_COST = {
    squirrel: 1,
    rabbit:   1,
    deer:     1,
    bear:     2
  };

  let layer, sprite;
  let running = false;
  let raf = 0;
  let x = 0;
  let direction = 1;
  let currentAnimal = "squirrel";
  let passActive = false;
  let shotTakenThisPass = false;
  let tStart = 0;
  let ammo = 7, food = 0, days = 1;
  let targetsKilled = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function vh(v) { return (v / 100) * window.innerHeight; }
  function pick_weighted(list) {
    const total = list.reduce((s, i) => s + i.w, 0);
    let r = Math.random() * total;
    for (const i of list) {
      r -= i.w;
      if (r <= 0) return i.type;
    }
    return list[list.length - 1].type;
  }

  function ensure_layer() {
    if (layer) return;
    layer = document.querySelector(".layer-targets");
    sprite = document.getElementById("demoTarget");
    sprite.style.display = "block";
  }

  function setTargetFacingForDirection(dir){
    const facing = (dir === 1) ? "right" : "left";
    sprite.setAttribute("src", ASSETS[currentAnimal][facing]);
    sprite.setAttribute("data-animal", currentAnimal);
    sprite.setAttribute("data-facing", facing);
  }

  function viewport(){ return { w: window.innerWidth, h: window.innerHeight }; }
  function setTargetTrack(){
    const { h } = viewport();
    sprite.style.top = `${Math.round(h * 0.46)}px`;
  }
  function placeTargetStart(){
    const { w } = viewport();
    const tw = sprite.getBoundingClientRect().width || 200;
    x = (direction === 1) ? (-tw - 40) : (w + 40);
    sprite.style.transform = `translate3d(${x}px,0,0)`;
  }

  function startNewPass(){
    if (ammo <= 0) return endHunt();
    currentAnimal = pick_weighted(WEIGHTS);
    direction = (Math.random() < 0.5) ? 1 : -1;
    shotTakenThisPass = false;
    passActive = true;
    setTargetFacingForDirection(direction);
    setTargetTrack();
    placeTargetStart();
  }

  function endPass(){
    passActive = false;
    setTimeout(() => {
      startNewPass();
    }, 400);
  }

  function reticleCenterX(){
    const r = document.querySelector(CONFIG.reticule_selector).getBoundingClientRect();
    return r.left + r.width / 2;
  }
  function targetCenterX(){
    const r = sprite.getBoundingClientRect();
    return r.left + r.width / 2;
  }

  function tick(now){
    const dt = (now - tStart) / 1000;
    tStart = now;

    if (passActive){
      const speed = SPEED[currentAnimal];
      x += direction * speed * dt;
      sprite.style.transform = `translate3d(${x}px,0,0)`;

      const { w } = viewport();
      const r = sprite.getBoundingClientRect();

      if (direction === 1 && r.left > w + 80) endPass();
      if (direction === -1 && r.right < -80) endPass();
    }

    raf = requestAnimationFrame(tick);
  }

  function updateHud() {
    if (window.vc_hunt_update_hud) window.vc_hunt_update_hud(food, ammo, days);
  }

  // Shooting
  document.getElementById("fireBtn").addEventListener("click", () => {
    if (!passActive || shotTakenThisPass || ammo <= 0) return;
    // Play shot sound (wired through index.html, no lag)
    if (window.vc_hunt_play_shot) window.vc_hunt_play_shot();
    // Check ammo before shot
    const cost = AMMO_COST[currentAnimal];
    if (ammo < cost) {
      endHunt();
      return;
    }
    ammo -= cost;
    updateHud();
    shotTakenThisPass = true;
    // Check for hit
    const dx = Math.abs(targetCenterX() - reticleCenterX());
    const tw = sprite.getBoundingClientRect().width || 200;
    const deltaPct = (dx / tw) * 100;
    let outcome = "Miss";
    let foodAwarded = 0;
    if (deltaPct <= 10)      { outcome = "Perfect hit"; foodAwarded = 8; }
    else if (deltaPct <= 25) { outcome = "Solid hit";   foodAwarded = 5; }
    else if (deltaPct <= 40) { outcome = "Graze";       foodAwarded = 2; }
    if (outcome !== "Miss") {
      food += foodAwarded;
      targetsKilled++;
      updateHud();
    }
    // If no ammo after shot, end the hunt
    if (ammo <= 0) {
      setTimeout(endHunt, 500);
      return;
    }
    endPass();
  });

  function endHunt() {
    running = false;
    passActive = false;
    sprite.style.display = "none";
    if (window.vc_hunt_end_modal)
      window.vc_hunt_end_modal(`Out of ammo! You gained ${food} lbs of food and hit ${targetsKilled} targets.`);
  }

  // Main start
  window.vc_targets = {
    start() {
      if (running) return;
      ensure_layer();
      ammo = 7; food = 0; days = 1; targetsKilled = 0;
      running = true;
      updateHud();
      sprite.style.display = "block";
      setTargetTrack();
      startNewPass();
      tStart = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      sprite.style.display = "none";
    },
  };
})();