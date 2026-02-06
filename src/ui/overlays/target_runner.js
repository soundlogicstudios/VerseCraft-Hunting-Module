/* src/overlays/target_runner.js
   VerseCraft Targets Runner (single-file, injects CSS)
   - Fixed reticule (you do NOT move it)
   - Targets move behind reticule
   - Random spawns: squirrel/rabbit/deer, rare bear
   - Bear requires 2 hits: first hit swaps to attack image; second hit kills
   - Emits events you can hook into later (meat, injure, etc.)
*/

(() => {
  "use strict";

  // -----------------------------
  // CONFIG (edit these paths only)
  // -----------------------------
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
      right: "assets/targets/deer-right-facing.webp", // (you had a typo earlier)
    },
    bear: {
      left: "assets/targets/bear-left-facing.webp",
      right: "assets/targets/bear-right-facing.webp",
      attack: "assets/targets/bear-attack.webp", // your special “attack bear” image
    },
  };

  // Weighted selection (must sum roughly to 1.0; exact doesn’t matter)
  const WEIGHTS = [
    { type: "squirrel", w: 0.45 },
    { type: "rabbit", w: 0.35 },
    { type: "deer", w: 0.17 },
    { type: "bear", w: 0.03 }, // rare
  ];

  // Reticule: fixed + known. We only need its DOM element to know the hit-point.
  // Set this selector to match your project.
  const RETICULE_SELECTOR = "#reticule";

  // Where to render the moving targets (overlay layer)
  // Set this selector to the screen root or a dedicated gameplay container.
  const MOUNT_SELECTOR = "body";

  // -----------------------------
  // CSS INJECTION
  // -----------------------------
  const CSS = `
  /* Target runner layer */
  .vc-target-layer {
    position: absolute;
    inset: 0;
    pointer-events: none; /* clicks go through; shooting should be handled elsewhere */
    z-index: 40; /* keep below reticule if reticule is higher */
    overflow: hidden;
  }

  .vc-target {
    position: absolute;
    will-change: transform, top, left;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
    transform: translate3d(0,0,0);
    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
  }

  /* Tuneable “play area” (targets stay inside this vertical band)
     You can tweak these without touching JS later. */
  :root {
    --vc-target-top: 22vh;
    --vc-target-bottom: 78vh;
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
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
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

  function css_vh_value(varName, fallbackVh) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!v) return (fallbackVh / 100) * window.innerHeight;
    if (v.endsWith("vh")) return (parseFloat(v) / 100) * window.innerHeight;
    if (v.endsWith("px")) return parseFloat(v);
    // fallback: treat as vh number if numeric
    const num = parseFloat(v);
    if (!Number.isFinite(num)) return (fallbackVh / 100) * window.innerHeight;
    return (num / 100) * window.innerHeight;
  }

  function get_reticule_point() {
    const el = document.querySelector(RETICULE_SELECTOR);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function rect_contains_point(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // -----------------------------
  // RUNNER STATE
  // -----------------------------
  let layer = null;
  let img = null;

  let rafId = 0;
  let running = false;

  let current = null; // { type, dir, hp, isAttack, spawnedAt, deadlineMs }
  let pos = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };

  let nextSpawnAt = 0;

  // -----------------------------
  // TARGET SPAWNING / MOVEMENT
  // -----------------------------
  function ensure_layer() {
    if (layer && layer.isConnected) return;

    const mount = document.querySelector(MOUNT_SELECTOR);
    if (!mount) throw new Error(`vc_targets: mount not found: ${MOUNT_SELECTOR}`);

    // If mount isn't positioned, absolute children may reference page; that's OK for now
    layer = document.createElement("div");
    layer.className = "vc-target-layer";
    mount.appendChild(layer);

    img = document.createElement("img");
    img.className = "vc-target";
    img.alt = "target";
    layer.appendChild(img);
  }

  function choose_sprite(type, dir) {
    const pack = ASSETS[type];
    if (!pack) return null;
    if (type === "bear") {
      // bear uses left/right until it flips to attack state
      return dir === "left" ? pack.left : pack.right;
    }
    return dir === "left" ? pack.left : pack.right;
  }

  function spawn_target() {
    const type = pick_weighted(WEIGHTS);

    // dir indicates movement direction ON SCREEN:
    // - "right" means moving left -> right
    // - "left" means moving right -> left
    const dir = Math.random() < 0.5 ? "right" : "left";

    // Determine vertical band from CSS vars (no assumptions, configurable)
    const topPx = css_vh_value("--vc-target-top", 22);
    const bottomPx = css_vh_value("--vc-target-bottom", 78);
    const y = rand(topPx, bottomPx);

    // Starting x just off-screen
    const startX = dir === "right" ? -220 : window.innerWidth + 220;

    // Speed: smaller animals generally faster; bear slower
    const baseSpeed =
      type === "squirrel" ? rand(280, 520) :
      type === "rabbit" ? rand(240, 460) :
      type === "deer" ? rand(200, 380) :
      /* bear */         rand(140, 260);

    const vx = dir === "right" ? baseSpeed : -baseSpeed;

    // Scale by type (visual size)
    const scale =
      type === "squirrel" ? rand(0.42, 0.55) :
      type === "rabbit" ? rand(0.50, 0.65) :
      type === "deer" ? rand(0.70, 0.90) :
      /* bear */         rand(0.90, 1.10);

    current = {
      type,
      dir,
      hp: type === "bear" ? 2 : 1,
      isAttack: false,
      spawnedAt: Date.now(),
      // Bear “attack window” starts after first hit; if it expires -> injure
      deadlineMs: 0,
      scale,
    };

    pos.x = startX;
    pos.y = y;

    vel.x = vx;
    vel.y = 0;

    const src = choose_sprite(type, dir === "right"
