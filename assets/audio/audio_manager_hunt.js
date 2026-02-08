
// src/audio_manager_hunt.js
// Handles all hunt audio: BGM and SFX

const HUNT_AUDIO = {
  bgm: null,
  sfx: null,
  unlock: false,
  init() {
    if (this.bgm && this.sfx) return;
    this.bgm = new Audio('assets/audio/versecraft-hunting-mini-game-theme.mp3');
    this.bgm.loop = true;
    this.bgm.volume = 0.7;
    this.sfx = new Audio();
    this.sfx.volume = 1.0;
    document.body.addEventListener('pointerup', ()=>this.unlock_audio(), {once:true});
    document.body.addEventListener('touchend', ()=>this.unlock_audio(), {once:true});
  },
  unlock_audio() {
    if (this.unlock) return;
    this.unlock = true;
    try { this.bgm.play(); } catch {}
  },
  play_bgm() {
    this.init();
    if (this.unlock) {
      this.bgm.currentTime = 0;
      this.bgm.play();
    }
  },
  stop_bgm() {
    if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0; }
  },
  play_gunshot() {
    this.init();
    if (!this.unlock) return;
    this.sfx.src = 'assets/audio/gun_shot_single_action_rifle.wav';
    this.sfx.currentTime = 0;
    this.sfx.play();
  }
};
window.HUNT_AUDIO = HUNT_AUDIO;
