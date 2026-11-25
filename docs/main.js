// main.js — tiny entry point: wires the boot function up and starts the game.
import { startTowerDefense } from './scene.js';

window.__startTowerDefense = startTowerDefense;

(function boot() {
  function start() {
    if (window.__tdBoot && window.__tdBoot.booted) return;
    if (typeof window.__startTowerDefense === 'function' && window.__startTowerDefense()) {
      window.__tdBoot.booted = true;
    } else if (typeof window.__tdShowFail === 'function') {
      window.__tdShowFail('Phaser loaded but the game did not start.');
    }
  }
  if (typeof Phaser !== 'undefined') {
    start();
  } else {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js';
    s.onload = start;
    s.onerror = function () {
      if (typeof window.__tdShowFail === 'function') {
        window.__tdShowFail('Could not load Phaser (local copy or CDN).');
      }
    };
    document.head.appendChild(s);
  }
})();
