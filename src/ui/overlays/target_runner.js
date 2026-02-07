/* src/overlays/target_runner.js
   VerseCraft Target Runner - Enhanced for Day, Bag, Bullet, and Trip Logic
   Modular: works standalone or as a component in CYOA engines.
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

  // ROOT-ABSOLUTE PATHS
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

  // Used for weighted random target selection
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

  // === HUNT STATE TRACKER ===
  const HUNT_STATE = {
    day: 1,                        // Internal calendar day
    bag: [],                       // Animals hit this hunt: {type, weight}
    bag_weight: 0,                 // Total lbs in bag
    bag_limit: 100,                // Max carry weight per hunt
    bullets: 7,                    // Bullets left this hunt
    bullet_limit: 7,               // Bullets per hunt
    hunt_log: [],                  // Past hunts: {day, bag, bag_weight, bullets_used, away_from_camp}
    hunt_trip_days: 0,             // Consecutive days away from camp (max 3)
    in_return_to_camp: false,      // True if returning (can't hunt)
    return_days_left: 0,           // Days left returning to camp
  };

  // Utility: Get animal weight (Oregon Trail-ish)
  function get_animal_weight(type) {
    switch(type) {
      case "bear":    return 200;
      case "deer":    return 60;
      case "rabbit":  return 2;
      case "squirrel":return 1;
      default:        return 0;
    }
  }

  // === CSS Injection ===
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

  // === Helpers ===
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

  // === Target Layer Logic ===
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
    layer.appendChild(sprite);

    debugEl = document.createElement("div");
    debugEl.className = "vc-target-debug";
    debugEl.style.display = CONFIG.debug ? "" : "none";
    layer.appendChild(debugEl);
  }

  function spawn_target() {
    // Guard: no spawning if returning to camp or not running
    if (HUNT_STATE.in_return_to_camp || !running) return;

    const type = pick_weighted(WEIGHTS);
    const dir = Math.random() < 0.5 ? "left" : "right";
    const prof = PROFILE[type];
    const speed = rand(prof.speed[0], prof.speed[1]);
    const scale = rand(prof.scale[0], prof.scale[1]);
    const asset = ASSETS[type][dir];

    const top = rand(CONFIG.target_band_top_vh, CONFIG.target_band_bottom_vh);
    pos.x = dir === "left" ? -180 : window.innerWidth + 180;
    pos.y = vh(top);

    vx = dir === "left" ? speed : -speed;

    sprite.src = asset;
    sprite.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
    sprite.style.display = "";

    current = { type, dir, scale, speed, top, asset };

    if (CONFIG.debug) {
      debugEl.textContent =
        `Target: ${type} (${dir}) | Speed: ${speed.toFixed(2)}px/s | Scale: ${scale.toFixed(2)}\n`
        + `Day: ${HUNT_STATE.day}, Bullets: ${HUNT_STATE.bullets}, Bag: ${HUNT_STATE.bag_weight} lbs`;
    }
  }

  function hide_target() {
    sprite.style.display = "none";
    current = null;
  }

  function game_loop(ts) {
    if (!running) return;
    if (!last_t) last_t = ts;
    const dt = (ts - last_t) / 1000;
    last_t = ts;

    if (HUNT_STATE.in_return_to_camp) {
      hide_target();
      if (CONFIG.debug) {
        debugEl.textContent =
          `Returning to camp...\nDays left: ${HUNT_STATE.return_days_left}\n`
          + `You have to make it back to camp before the meat spoils!`;
      }
      return; // skip all animation until back at camp
    }

    if (current) {
      pos.x += vx * dt;
      sprite.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${current.scale})`;

      // Remove if offscreen
      if ((vx < 0 && pos.x < -200) || (vx > 0 && pos.x > window.innerWidth + 200)) {
        hide_target();
        next_spawn = performance.now() + rand(CONFIG.spawn_delay_ms[0], CONFIG.spawn_delay_ms[1]);
      }
    } else if (performance.now() >= next_spawn) {
      spawn_target();
    }

    raf = requestAnimationFrame(game_loop);
  }

  // === Firing & Hit Detection ===
  function fire_gun() {
    if (HUNT_STATE.in_return_to_camp) {
      if (CONFIG.debug) alert("You have to make it back to camp before the meat spoils!");
      return false;
    }
    if (HUNT_STATE.bullets <= 0) {
      if (CONFIG.debug) alert("You're out of bullets for today!");
      return false;
    }
    if (!current) return false;

    HUNT_STATE.bullets--; // Spend one bullet

    const pt = get_reticule_point();
    if (!pt) return false;

    // Get target sprite rect
    const rect = sprite.getBoundingClientRect();
    if (rect_contains(rect, pt.x, pt.y)) {
      emit("vc-hunt-hit", { ...current, x: pos.x, y: pos.y });
      hide_target();
      next_spawn = performance.now() + rand(CONFIG.spawn_delay_ms[0], CONFIG.spawn_delay_ms[1]);
      return true;
    }
    return false;
  }

  // === Handle Bag & Hunt Logging on Hits ===
  window.addEventListener("vc-hunt-hit", e => {
    const { type } = e.detail;
    const w = get_animal_weight(type);

    if (HUNT_STATE.bag_weight + w > HUNT_STATE.bag_limit) {
      if (CONFIG.debug) alert("Bag limit reached! End hunt to continue.");
      return;
    }

    HUNT_STATE.bag.push({ type, weight: w });
    HUNT_STATE.bag_weight += w;
    if (CONFIG.debug) {
      console.log(`Added ${type}: ${w} lbs, bag now ${HUNT_STATE.bag_weight} lbs`);
    }
  });

  // === Public API (For CYOA/External UI Integration) ===
  window.VC_Hunt = {
    start: () => {
      inject_css();
      ensure_layer();
      running = true;
      last_t = 0;
      raf = requestAnimationFrame(game_loop);

      if (CONFIG.debug) debugEl.style.display = "";
      // Reset bullets if starting a new hunt and not returning
      if (!HUNT_STATE.in_return_to_camp && HUNT_STATE.bullets !== HUNT_STATE.bullet_limit)
        HUNT_STATE.bullets = HUNT_STATE.bullet_limit;
    },
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      hide_target();
      if (CONFIG.debug) debugEl.style.display = "none";
    },
    fire_gun,
    is_running: () => running,

    // End a hunting day, advance calendar, handle camp logic
    end_hunt: () => {
      if (HUNT_STATE.in_return_to_camp) {
        if (CONFIG.debug) alert("You're already returning to camp!");
        return;
      }

      // Log this day's hunt
      HUNT_STATE.hunt_log.push({
        day: HUNT_STATE.day,
        bag: [...HUNT_STATE.bag],
        bag_weight: HUNT_STATE.bag_weight,
        bullets_used: HUNT_STATE.bullet_limit - HUNT_STATE.bullets,
        away_from_camp: HUNT_STATE.hunt_trip_days + 1
      });

      HUNT_STATE.day++;
      HUNT_STATE.hunt_trip_days++;

      // Reset bag/bullets for next hunt day (if not returning yet)
      HUNT_STATE.bag = [];
      HUNT_STATE.bag_weight = 0;
      HUNT_STATE.bullets = HUNT_STATE.bullet_limit;

      if (HUNT_STATE.hunt_trip_days >= 3) {
        HUNT_STATE.in_return_to_camp = true;
        HUNT_STATE.return_days_left = 2;
        if (CONFIG.debug) alert("You've hunted 3 days and must now return to camp. 2 days will pass.");
      }

      if (CONFIG.debug) {
        console.log(`Hunt ended. Day: ${HUNT_STATE.day - 1}, Trip day: ${HUNT_STATE.hunt_trip_days}, Total: ${HUNT_STATE.hunt_log.at(-1).bag_weight} lbs`);
      }
    },

    // Advance a day during return to camp (call 2x when in return state)
    advance_day: () => {
      if (HUNT_STATE.in_return_to_camp) {
        HUNT_STATE.day++;
        HUNT_STATE.return_days_left--;
        if (HUNT_STATE.return_days_left <= 0) {
          HUNT_STATE.in_return_to_camp = false;
          HUNT_STATE.hunt_trip_days = 0;
          HUNT_STATE.bullets = HUNT_STATE.bullet_limit;
          if (CONFIG.debug) alert("You are back at camp and can hunt again.");
        } else if (CONFIG.debug) {
          alert(`Returning to camp... ${HUNT_STATE.return_days_left} day(s) left.`);
        }
        // No bag/bullets on return days
      }
    },

    // Current game/hunt state (for UI, save, or CYOA integration)
    get_state: () => JSON.parse(JSON.stringify(HUNT_STATE)),
    is_away_from_camp: () => HUNT_STATE.in_return_to_camp,
  };

  // Wire up firing to a custom event ("vc-hunt-fire"), or click/tap
  window.addEventListener("vc-hunt-fire", fire_gun);
  window.addEventListener("mousedown", e => {
    if (e.button !== 0) return; // only left-click
    fire_gun();
  });
  window.addEventListener("touchstart", fire_gun);

})();
