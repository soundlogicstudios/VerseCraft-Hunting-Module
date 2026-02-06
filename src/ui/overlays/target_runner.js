/* src/overlays/target_runner.js
   VerseCraft Target Runner (single complete file)
   - Fixed reticule (DO NOT MOVE)
   - Targets move behind reticule
   - Random target spawns: squirrel/rabbit/deer common; bear rare
   - Bear requires 2 hits: hit #1 -> swaps to attack image + timer; hit #2 -> kill; timer expiry -> injure
   - Emits events for later wiring (sound, meat, scoring, injury)
*/

(() => {
  "use strict";

  // -----------------------------
  // CONFIG (ONLY EDIT THESE)
  // -----------------------------
  const CONFIG = {
    mount_selector: "body",          // where the target layer is appended
    reticule_selector: "#reticule",  // fixed reticule element selector (must exist)
    z_index_target_layer: 40,        // ensure below reticule layer
    spawn_delay_ms: [250, 900],      // delay between targets
    bear_attack_window_ms: 1200,     // time allowed to land 2nd shot after first hit
    // Play band in viewport units (targets spawn within this vertical band)
    target_band_top_vh: 22,
    target_band_bottom_vh: 78,
  };

  // Asset paths (your list, corrected)
  const ASSETS = {
    squirrel: {
      left: "assets/targets/squirrel-left-facing.webp",
      right: "assets/targets/squirrel-right-facing.webp",
    },
    rabbit: {
      left: "assets/targets/rabbit-left-facing.webp",
      right: "assets/targets/rabbit-right-facing.webp",
    },
    deer: {
      left: "assets/targets/deer-left-facing.webp",
      right: "assets/targets/deer-right-facing.webp",
    },
    bear: {
      left: "assets/targets/bear-left-facing.webp",
      right: "assets/targets/bear-right-facing.webp",
      attack: "assets/targets/bear-attack-target.webp", // ✅ provided by you
    },
  };

  // Weighted spawn mix (bear is rare)
  const WEIGHTS = [
    { type: "squirrel", w: 0.45 },
    { type: "rabbit", w: 0.35 },
    { type: "deer", w: 0.17 },
    { type: "bear", w: 0.03 },
  ];

  // Speeds (px/sec) and scales per animal
  const PROFILE = {
    squirrel: { speed: [280, 520], scale: [0.42, 0.55] },
    rabbit:   { speed: [240, 460], scale: [0.50, 0.65] },
    deer:     { speed: [200, 380], scale: [0.70, 0.90] },
    bear:     { speed: [140, 260], scale: [0.90, 1.10] },
  };

  // -----------------------------
  // CSS INJECTION
  // -----------------------------
  const CSS = `
  .vc-target-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .vc-target-sprite {
    position: absolute;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
    will-change: transform;
    transform: translate3d(0,0,0);
    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
  }
  `;

  function inject_css_once() {
    if (document.getElementById("vc_target_runner_css")) return;
    const style = document.createElement("style");
    style.id = "vc_target_runner_css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // -----------------------------
  // HELPERS
  // -----------------------------
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function pick_weighted(items) {
    const total = items.reduce((s, it) => s + it.w, 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.type;
    }
    return items[items.length - 1].type;
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

  function rect_contains_point(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function vh_to_px(vh) {
    return (vh / 100) * window.innerHeight;
  }

  // -----------------------------
  // STATE
  // -----------------------------
  let layer = null;
  let sprite = null;

  let running = false;
  let rafId = 0;

  let current = null; // {type, dir, hp, is_attack, attack_deadline, scale}
  let pos = { x: 0, y: 0 };
  let vx = 0;
  let next_spawn_at = 0;
  let last_ts = 0;

  // -----------------------------
  // DOM LAYER
  // -----------------------------
  function ensure_layer() {
    if (layer && layer.isConnected && sprite && sprite.isConnected) return;

    const mount = document.querySelector(CONFIG.mount_selector);
    if (!mount) throw new Error(`vc_target_runner: mount not found: ${CONFIG.mount_selector}`);

    layer = document.createElement("div");
    layer.className = "vc-target-layer";
    layer.style.zIndex = String(CONFIG.z_index_target_layer);
    mount.appendChild(layer);

    sprite = document.createElement("img");
    sprite.className = "vc-target-sprite";
    sprite.alt = "target";
    sprite.decoding = "async";
    sprite.loading = "eager";
    layer.appendChild(sprite);
  }

  // -----------------------------
  // TARGET LOGIC
  // -----------------------------
  function sprite_for(type, dir, is_attack) {
    const a = ASSETS[type];
    if (!a) return "";
    if (type === "bear" && is_attack) return a.attack;
    return dir === "left" ? a.left : a.right;
  }

  function spawn_target() {
    const type = pick_weighted(WEIGHTS);

    // Movement direction across screen:
    // dir="right" means left->right movement, uses right-facing sprite
    // dir="left"  means right->left movement, uses left-facing sprite
    const dir = Math.random() < 0.5 ? "right" : "left";

    const band_top = vh_to_px(CONFIG.target_band_top_vh);
    const band_bottom = vh_to_px(CONFIG.target_band_bottom_vh);
    const y = rand(band_top, band_bottom);

    const prof = PROFILE[type] || { speed: [200, 300], scale: [0.7, 0.9] };
    const speed = rand(prof.speed[0], prof.speed[1]);
    const scale = rand(prof.scale[0], prof.scale[1]);

    const buffer = 240;
    pos.x = dir === "right" ? -buffer : window.innerWidth + buffer;
    pos.y = y;

    vx = dir === "right" ? speed : -speed;

    current = {
      type,
      dir, // "right" or "left"
      hp: type === "bear" ? 2 : 1,
      is_attack: false,
      attack_deadline: 0,
      scale,
    };

    sprite.src = sprite_for(type, dir === "right" ? "right" : "left", false);
    sprite.style.opacity = "1";
    sprite.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`;

    emit("vc:target_spawn", { type, dir });
  }

  function schedule_next_spawn() {
    const d = rand(CONFIG.spawn_delay_ms[0], CONFIG.spawn_delay_ms[1]);
    next_spawn_at = Date.now() + d;
  }

  function despawn(reason) {
    if (!current) return;
    emit("vc:target_despawn", { type: current.type, reason });
    current = null;
    sprite.style.opacity = "0";
    schedule_next_spawn();
  }

  function update(dt) {
    if (!current) {
      if (Date.now() >= next_spawn_at) spawn_target();
      return;
    }

    // Bear attack timeout => injure
    if (current.type === "bear" && current.is_attack && current.attack_deadline > 0) {
      if (Date.now() >= current.attack_deadline) {
        emit("vc:player_injured", { source: "bear_attack_timeout" });
        despawn("bear_attack_timeout");
        return;
      }
    }

    // Move
    pos.x += vx * dt;

    sprite.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${current.scale})`;

    // Offscreen
    const buffer = 260;
    if (vx > 0 && pos.x > window.innerWidth + buffer) despawn("offscreen");
    if (vx < 0 && pos.x < -buffer) despawn("offscreen");
  }

  // -----------------------------
  // SHOOT (HIT TEST @ RETICULE)
  // You fire by dispatching: window.dispatchEvent(new Event("vc:shoot"))
  // -----------------------------
  function handle_shoot() {
    if (!running) return;
    if (!current) {
      emit("vc:shot_miss", { reason: "no_target" });
      return;
    }

    const p = get_reticule_point();
    if (!p) {
      emit("vc:shot_miss", { reason: "reticule_not_found" });
      return;
    }

    const rect = sprite.getBoundingClientRect();
    const hit = rect_contains_point(rect, p.x, p.y);

    if (!hit) {
      emit("vc:shot_miss", { type: current.type });
      return;
    }

    // HIT
    current.hp -= 1;
    emit("vc:shot_hit", { type: current.type, remaining_hp: current.hp });

    // Bear special: first hit flips to attack image and starts timer
    if (current.type === "bear") {
      if (current.hp === 1 && !current.is_attack) {
        current.is_attack = true;
        current.attack_deadline = Date.now() + CONFIG.bear_attack_window_ms;

        // Keep direction, just swap explainable “attack” state sprite
        sprite.src = sprite_for("bear", current.dir === "right" ? "right" : "left", true);

        emit("vc:bear_attack_state", { window_ms: CONFIG.bear_attack_window_ms });
        return;
      }

      if (current.hp <= 0) {
        emit("vc:target_killed", { type: "bear" });
        // meat/scoring later
        despawn("killed");
        return;
      }

      return;
    }

    // Non-bear: single-hit kill
    if (current.hp <= 0) {
      emit("vc:target_killed", { type: current.type });
      // meat/scoring later
      despawn("killed");
    }
  }

  // -----------------------------
  // LOOP
  // -----------------------------
  function loop(ts) {
    if (!running) return;

    if (!last_ts) last_ts = ts;
    const dt = clamp((ts - last_ts) / 1000, 0, 0.05);
    last_ts = ts;

    update(dt);
    rafId = requestAnimationFrame(loop);
  }

  // -----------------------------
  // PUBLIC API (minimal)
  // ---------------- 기억해야 typical exposures
  const API = {
    start() {
      inject_css_once();
      ensure_layer();
      if (running) return;
      running = true;
      last_ts = 0;
      schedule_next_spawn();
      window.addEventListener("vc:shoot", handle_shoot);
      rafId = requestAnimationFrame(loop);
      emit("vc:targets_started", {});
    },

    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("vc:shoot", handle_shoot);
      current = null;
      if (sprite) sprite.style.opacity = "0";
      emit("vc:targets_stopped", {});
    },

    // optional: force next target spawn immediately (debug)
    force_spawn() {
      next_spawn_at = 0;
    },

    // optional: set band dynamically (vh units)
    set_band(top_vh, bottom_vh) {
      CONFIG.target_band_top_vh = Number(top_vh);
      CONFIG.target_band_bottom_vh = Number(bottom_vh);
    },
  };

  // Expose globally for easy wiring
  window.vc_targets = API;
})();
