/* src/overlays/target_runner.js
   VerseCraft Target Runner (ROOT-ABSOLUTE ASSET PATHS + DEBUG)
*/

(() => {
  "use strict";

  const CONFIG = {
    mount_selector: "body",
    reticule_selector: "#reticule",
    z_index: 40,

    spawn_delay_ms: [250, 900],
    bear_attack_window_ms: 1200,

    target_band_top_vh: 22,
    target_band_bottom_vh: 78,

    debug: true, // set false when done
  };

  // IMPORTANT: ROOT-ABSOLUTE PATHS (leading slash)
  const ASSETS = {
    squirrel: {
      left:  "/assets/targets/squirrel-left-facing.webp",
      right: "/assets/targets/squirrel-right-facing.webp",
    },
    rabbit: {
      left:  "/assets/targets/rabbit-left-facing.webp",
      right: "/assets/targets/rabbit-right-facing.webp",
    },
    deer: {
      left:  "/assets/targets/deer-left-facing.webp",
      right: "/assets/targets/deer-right-facing.webp",
    },
    bear: {
      left:   "/assets/targets/bear-left-facing.webp",
      right:  "/assets/targets/bear-right-facing.webp",
      attack: "/assets/targets/bear-attack-target.webp",
    },
  };

  const WEIGHTS = [
    { type: "squirrel", w: 0.45 },
    { type: "rabbit",   w: 0.35 },
    { type: "deer",     w: 0.17 },
    { type: "bear",     w: 0.03 },
  ];

  const PROFILE = {
    squirrel: { speed: [280, 520], scale: [0.42, 0.55] },
    rabbit:   { speed: [240, 460], scale: [0.50, 0.65] },
    deer:     { speed: [200, 380], scale: [0.70, 0.90] },
    bear:     { speed: [140, 260], scale: [0.90, 1.10] },
  };

  const CSS = `
    .vc-target-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: ${CONFIG.z_index};
    }
    .vc-target-sprite {
      position: absolute;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      will-change: transform;
      filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
    }
    .vc-target-debug {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 6px 8px;
      background: rgba(0,0,0,0.65);
      color: #fff;
      font: 12px/1.3 -apple-system, system-ui, sans-serif;
      border-radius: 8px;
      max-width: 70vw;
      z-index: ${CONFIG.z_index + 1};
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;

  function inject_css() {
    if (document.getElementById("vc-target-css")) return;
    const s = document.createElement("style");
    s.id = "vc-target-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const vh = v => (v / 100) * window.innerHeight;

  function pick_weighted(list) {
    const total = list.reduce((s, i) => s + i.w, 0);
    let r = Math.random() * total;
    for (const i of list) {
      r -= i.w;
      if (r <= 0) return i.type;
    }
    return list[list.length - 1].type;
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function get_reticule_point() {
    const el = document.querySelector(CONFIG.reticule_selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function rect_contains(rect, x, y) {
    return x >= rect.left && x <= rect.right &&
           y >= rect.top  && y <= rect.bottom;
  }

  let layer, sprite, debugEl;
  let running = false;
  let raf = 0;
  let last_t = 0;

  let current = null;
  let pos = { x: 0, y: 0 };
  let vx = 0;
  let next_spawn = 0;

  function ensure_layer() {
    if (layer) return;

    const mount = document.querySelector(CONFIG.mount_selector);
    if (!mount) throw new Error("Target mount not found");

    layer = document.createElement("div");
    layer.className = "vc-target-layer";
    mount.appendChild(layer);

    sprite = document.createElement("img");
    sprite.className = "vc-target-sprite";
    sprite.alt = "target";
    sprite.decoding = "async";
    sprite.loading = "eager";

    // HARD DEBUG: tell you exactly which URL failed
    sprite.addEventListener("error", () => {
      const msg = `IMG ERROR\nsrc: ${sprite.src}\nbaseURI: ${document.baseURI}`;
      if (CONFIG.debug) console.error(msg);
      if (debugEl) debugEl.textContent = msg;
      emit("vc:target_img_error", { src: sprite.src, baseURI: document.baseURI });
    });

    sprite.addEventListener("load", () => {
      if (!CONFIG.debug) return;
      const msg = `IMG OK\nsrc: ${sprite.src}`;
      if (debugEl) debugEl.textContent = msg;
    });

    layer.appendChild(sprite);

    if (CONFIG.debug) {
      debugEl = document.createElement("div");
      debugEl.className = "vc-target-debug";
      debugEl.textContent = "Target debug ready.";
      layer.appendChild(debugEl);
    }
  }

  function sprite_src(type, dir, attack) {
    if (type === "bear" && attack) return ASSETS.bear.attack;
    return ASSETS[type][dir];
  }

  function schedule_spawn() {
    next_spawn = Date.now() + rand(CONFIG.spawn_delay_ms[0], CONFIG.spawn_delay_ms[1]);
  }

  function spawn() {
    const type = pick_weighted(WEIGHTS);
    const dir = Math.random() < 0.5 ? "right" : "left";

    const band_top = vh(CONFIG.target_band_top_vh);
    const band_bot = vh(CONFIG.target_band_bottom_vh);

    const prof = PROFILE[type];
    const speed = rand(prof.speed[0], prof.speed[1]);
    const scale = rand(prof.scale[0], prof.scale[1]);

    pos.y = rand(band_top, band_bot);
    pos.x = dir === "right" ? -240 : window.innerWidth + 240;
    vx = dir === "right" ? speed : -speed;

    current = {
      type,
      dir,
      hp: type === "bear" ? 2 : 1,
      attack: false,
      deadline: 0,
      scale,
    };

    sprite.src = sprite_src(type, dir, false);
    sprite.style.opacity = "1";
    sprite.style.transform = `translate3d(${pos.x}px,${pos.y}px,0) scale(${scale})`;

    emit("vc:target_spawn", { type, dir });
  }

  function despawn(reason) {
    if (!current) return;
    emit("vc:target_despawn", { type: current.type, reason });
    current = null;
    sprite.style.opacity = "0";
    schedule_spawn();
  }

  function update(dt) {
    if (!current) {
      if (Date.now() >= next_spawn) spawn();
      return;
    }

    if (current.type === "bear" && current.attack) {
      if (Date.now() >= current.deadline) {
        emit("vc:player_injured", { source: "bear" });
        despawn("bear_attack_timeout");
        return;
      }
    }

    pos.x += vx * dt;
    sprite.style.transform = `translate3d(${pos.x}px,${pos.y}px,0) scale(${current.scale})`;

    if (pos.x < -300 || pos.x > window.innerWidth + 300) {
      despawn("offscreen");
    }
  }

  function loop(t) {
    if (!running) return;
    if (!last_t) last_t = t;
    const dt = Math.min((t - last_t) / 1000, 0.05);
    last_t = t;
    update(dt);
    raf = requestAnimationFrame(loop);
  }

  function shoot() {
    if (!current) {
      emit("vc:shot_miss", {});
      return;
    }

    const p = get_reticule_point();
    if (!p) return;

    const r = sprite.getBoundingClientRect();
    if (!rect_contains(r, p.x, p.y)) {
      emit("vc:shot_miss", { type: current.type });
      return;
    }

    current.hp--;
    emit("vc:shot_hit", { type: current.type, hp: current.hp });

    if (current.type === "bear") {
      if (current.hp === 1 && !current.attack) {
        current.attack = true;
        current.deadline = Date.now() + CONFIG.bear_attack_window_ms;
        sprite.src = sprite_src("bear", current.dir, true);
        emit("vc:bear_attack_state", {});
        return;
      }
      if (current.hp <= 0) {
        emit("vc:target_killed", { type: "bear" });
        despawn("killed");
      }
      return;
    }

    emit("vc:target_killed", { type: current.type });
    despawn("killed");
  }

  window.vc_targets = {
    start() {
      if (running) return;
      inject_css();
      ensure_layer();
      running = true;
      last_t = 0;
      schedule_spawn();
      window.addEventListener("vc:shoot", shoot);
      raf = requestAnimationFrame(loop);
      emit("vc:targets_started", {});
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("vc:shoot", shoot);
      if (sprite) sprite.style.opacity = "0";
      current = null;
      emit("vc:targets_stopped", {});
    },
  };
})();
