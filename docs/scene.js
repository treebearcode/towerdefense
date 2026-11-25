// scene.js — Magitech Tower Defense, V1.
// Phaser 3.60 is loaded as a classic script by index.html (window.Phaser).
// One fixed path, 3 towers, 3 enemies, 10 waves. No physics engine:
// enemies walk waypoints and projectiles home in on targets in update().

import {
  TILE, COLS, ROWS, WIDTH, HEIGHT, START_GOLD, START_LIVES, TOTAL_WAVES,
  PATH_CELLS, SPAWN_CELL, CASTLE_CELL, CORNERS, TOWERS, ENEMIES, WAVES,
  SPAWN_INTERVAL_MS, WAVE_CLEAR_BONUS,
} from './config.js';

const HUD_H = 40;   // top bar height
const SHOP_H = 80;  // bottom shop bar height
const GAME_H = HUD_H + HEIGHT + SHOP_H; // 760

const pathSet = new Set(PATH_CELLS.map(([c, r]) => `${c},${r}`));
const isPath = (c, r) => pathSet.has(`${c},${r}`);
const isCastle = (c, r) => c === CASTLE_CELL[0] && r === CASTLE_CELL[1];
const cellCenter = (c, r) => ({ x: c * TILE + TILE / 2, y: HUD_H + r * TILE + TILE / 2 });
const waypoints = [SPAWN_CELL, ...PATH_CELLS].map(([c, r]) => cellCenter(c, r));

const ALL_IMAGES = [
  'archer-l1-idle', 'archer-l2-idle', 'archer-l3-idle',
  'archer-l1-fire', 'archer-l2-fire', 'archer-l3-fire',
  'crystal-l1-idle', 'crystal-l2-idle', 'crystal-l3-idle',
  'crystal-l1-fire', 'crystal-l2-fire', 'crystal-l3-fire',
  'cannon-l1-idle', 'cannon-l2-idle', 'cannon-l3-idle',
  'cannon-l1-fire', 'cannon-l2-fire', 'cannon-l3-fire',
  'goblin-walk-1', 'goblin-walk-2', 'goblin-walk-3', 'goblin-walk-4',
  'goblin-walk-5', 'goblin-walk-6', 'goblin-walk-7', 'goblin-walk-8',
  'skeleton-walk-1', 'skeleton-walk-2', 'skeleton-walk-3', 'skeleton-walk-4',
  'skeleton-walk-5', 'skeleton-walk-6', 'skeleton-walk-7', 'skeleton-walk-8',
  'orc-walk-1', 'orc-walk-2', 'orc-walk-3', 'orc-walk-4',
  'orc-attack-1', 'orc-attack-2', 'orc-attack-3', 'orc-attack-4',
  'tile-ground-rune', 'tile-ground-plain',
  'tile-path-straight-v', 'tile-path-straight-h', 'tile-path-corner',
  'tile-spawn-portal',
  'base-castle-idle', 'base-castle-damaged',
  'proj-arrow2', 'proj-crystal-bolt', 'fx-blast2', 'coin2', 'heart',
];

export function startTowerDefense() {
  if (typeof Phaser === 'undefined') return false;
  if (window.__tdBooted) return true;
  window.__tdBooted = true;

  const config = {
    type: Phaser.AUTO,
    parent: 'game',
    width: WIDTH,
    height: GAME_H,
    backgroundColor: '#1c2030',
    scene: { preload, create, update },
  };
  new Phaser.Game(config);
  return true;
}

function preload() {
  for (const key of ALL_IMAGES) {
    this.load.image(key, `assets/${key}.png`);
  }
}

let gold, lives, wave, waveActive, spawnQueue, spawnTimer;
let enemies, towers, projectiles, selectedShop, selectedTower, ghost, rangeCircle;
let hudGold, hudLives, hudWave, infoText, startBtn, upgradeBtn, pauseBtn, speedBtn;
let castleSprite, paused, speedMult, gameOver;

function create() {
  gold = START_GOLD; lives = START_LIVES; wave = 0;
  waveActive = false; spawnQueue = []; spawnTimer = 0;
  enemies = []; towers = []; projectiles = [];
  selectedShop = null; selectedTower = null;
  paused = false; speedMult = 1; gameOver = false;

  // Walk animations: each frame is its own texture, so list them by key.
  this.anims.create({
    key: 'goblin-walk',
    frames: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ key: `goblin-walk-${n}` })),
    frameRate: 10, repeat: -1,
  });
  this.anims.create({
    key: 'skeleton-walk',
    frames: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ key: `skeleton-walk-${n}` })),
    frameRate: 10, repeat: -1,
  });
  this.anims.create({
    key: 'orc-walk',
    frames: [1, 2, 3, 4].map((n) => ({ key: `orc-walk-${n}` })),
    frameRate: 6, repeat: -1,
  });
  this.anims.create({
    key: 'orc-attack',
    frames: [1, 2, 3, 4].map((n) => ({ key: `orc-attack-${n}` })),
    frameRate: 8, repeat: 0,
  });

  drawMap(this);
  drawHud(this);
  drawShop(this);

  // Ghost preview + range circle for the tower about to be placed.
  ghost = this.add.sprite(0, 0, 'archer-l1-idle').setVisible(false).setAlpha(0.6);
  ghost.setDisplaySize(64, 64);
  rangeCircle = this.add.circle(0, 0, 150).setStrokeStyle(2, 0x66e0ff, 0.8).setVisible(false);

  this.input.on('pointermove', (p) => {
    if (!selectedShop) return;
    const cell = pointerCell(p);
    if (!cell) { ghost.setVisible(false); rangeCircle.setVisible(false); return; }
    const { x, y } = cellCenter(cell.c, cell.r);
    ghost.setPosition(x, y).setVisible(true);
    ghost.setTint(buildable(cell.c, cell.r) ? 0xffffff : 0xff6666);
    rangeCircle.setPosition(x, y).setRadius(TOWERS[selectedShop].range).setVisible(true);
  });

  this.input.on('pointerdown', (p) => {
    if (gameOver || paused) return;
    const cell = pointerCell(p);
    if (!cell) return;
    const existing = towers.find((t) => t.c === cell.c && t.r === cell.r);
    if (selectedShop) {
      if (existing) { setInfo('Tile already has a tower.'); return; }
      if (!buildable(cell.c, cell.r)) { setInfo('Cannot build on the path or castle.'); return; }
      placeTower(this, cell.c, cell.r);
      return;
    }
    if (existing) {
      selectTower(existing);
    } else {
      selectTower(null);
    }
  });

  this.input.keyboard.on('keydown-SPACE', () => startWave(this));
  this.input.keyboard.on('keydown-P', () => togglePause(this));
  this.input.keyboard.on('keydown-ESC', () => { selectedShop = null; selectTower(null); ghost.setVisible(false); rangeCircle.setVisible(false); });
}

function pointerCell(p) {
  const c = Math.floor(p.x / TILE);
  const r = Math.floor((p.y - HUD_H) / TILE);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}

function buildable(c, r) {
  return !isPath(c, r) && !isCastle(c, r);
}

function drawMap(scene) {
  // Ground: plain stone, with a rune tile sprinkled in a fixed pattern.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = cellCenter(c, r);
      if (isPath(c, r)) continue;
      if (isCastle(c, r)) continue;
      const key = (c * 7 + r * 11) % 9 === 0 ? 'tile-ground-rune' : 'tile-ground-plain';
      scene.add.image(x, y, key).setDisplaySize(TILE, TILE);
    }
  }
  // Path tiles.
  for (const [c, r] of PATH_CELLS) {
    const { x, y } = cellCenter(c, r);
    const key = `${c},${r}`;
    if (CORNERS[key] !== undefined) {
      scene.add.image(x, y, 'tile-path-corner').setDisplaySize(TILE, TILE).setAngle(CORNERS[key]);
    } else if (c === 0 || c === COLS - 1 || (r > 0 && isPath(c, r - 1) && isPath(c, r + 1))) {
      scene.add.image(x, y, 'tile-path-straight-v').setDisplaySize(TILE, TILE);
    } else {
      scene.add.image(x, y, 'tile-path-straight-h').setDisplaySize(TILE, TILE);
    }
  }
  // Spawn portal at the entry, castle at the end.
  const s = cellCenter(SPAWN_CELL[0], SPAWN_CELL[1]);
  scene.add.image(s.x, s.y, 'tile-spawn-portal').setDisplaySize(TILE, TILE);
  const castle = cellCenter(CASTLE_CELL[0], CASTLE_CELL[1]);
  castleSprite = scene.add.image(castle.x, castle.y, 'base-castle-idle').setDisplaySize(72, 72);
}

function drawHud(scene) {
  scene.add.rectangle(0, 0, WIDTH, HUD_H, 0x141828).setOrigin(0);
  scene.add.text(12, 10, 'Magitech Tower Defense', { fontSize: '20px', color: '#aee6ff' });
  hudGold = scene.add.text(340, 11, '', { fontSize: '18px', color: '#ffd75e' });
  hudLives = scene.add.text(480, 11, '', { fontSize: '18px', color: '#ff9a9a' });
  hudWave = scene.add.text(620, 11, '', { fontSize: '18px', color: '#c9f7c5' });
  pauseBtn = scene.add.text(800, 11, '⏸ Pause (P)', { fontSize: '16px', color: '#ffffff' })
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => togglePause(scene));
  speedBtn = scene.add.text(900, 11, '1x', { fontSize: '16px', color: '#ffffff' })
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      speedMult = speedMult === 1 ? 2 : 1;
      speedBtn.setText(`${speedMult}x`);
    });
  updateHud();
}

function drawShop(scene) {
  const y = HUD_H + HEIGHT + 6;
  scene.add.rectangle(0, HUD_H + HEIGHT, WIDTH, SHOP_H, 0x141828).setOrigin(0);
  const types = Object.keys(TOWERS);
  types.forEach((type, i) => {
    const def = TOWERS[type];
    const x = 20 + i * 220;
    const card = scene.add.rectangle(x, y, 200, 60, 0x2a3050).setOrigin(0).setInteractive({ useHandCursor: true });
    scene.add.image(x + 32, y + 30, `${type}-l1-idle`).setDisplaySize(48, 48);
    scene.add.text(x + 62, y + 6, def.name, { fontSize: '15px', color: '#ffffff' });
    scene.add.text(x + 62, y + 26, `$${def.cost} — ${def.desc}`, { fontSize: '12px', color: '#aee6ff' });
    card.on('pointerdown', () => {
      selectedShop = selectedShop === type ? null : type;
      selectTower(null);
      ghost.setTexture(`${type}-l1-idle`);
      card.setFillStyle(selectedShop === type ? 0x3a5a80 : 0x2a3050);
      setInfo(selectedShop ? `Placing ${def.name} — click a free tile. Right-click / Esc to cancel.` : '');
    });
  });
  startBtn = scene.add.text(700, y + 16, '▶ Start Wave (Space)', { fontSize: '17px', color: '#ffffff', backgroundColor: '#2e7d32', padding: { x: 10, y: 8 } })
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => startWave(scene));
  upgradeBtn = scene.add.text(700, y + 16, '', { fontSize: '15px', color: '#ffffff', backgroundColor: '#7b5e00', padding: { x: 10, y: 8 } })
    .setInteractive({ useHandCursor: true }).setVisible(false)
    .on('pointerdown', () => upgradeSelected(scene));
  infoText = scene.add.text(20, y + 66, '', { fontSize: '12px', color: '#c9c9c9' });
}

function updateHud() {
  hudGold.setText(`🪙 ${gold}`);
  hudLives.setText(`❤ ${lives}`);
  hudWave.setText(`Wave ${wave}/${TOTAL_WAVES}`);
}

function setInfo(msg) {
  if (infoText) infoText.setText(msg);
}

function togglePause(scene) {
  if (gameOver) return;
  paused = !paused;
  pauseBtn.setText(paused ? '▶ Resume (P)' : '⏸ Pause (P)');
  setInfo(paused ? 'Paused.' : '');
}

function placeTower(scene, c, r) {
  const def = TOWERS[selectedShop];
  if (gold < def.cost) { setInfo(`Not enough gold for ${def.name} ($${def.cost}).`); return; }
  gold -= def.cost;
  const { x, y } = cellCenter(c, r);
  const sprite = scene.add.sprite(x, y, `${selectedShop}-l1-idle`).setDisplaySize(64, 64);
  towers.push({ type: selectedShop, level: 1, c, r, x, y, sprite, lastShot: 0 });
  updateHud();
  setInfo(`${def.name} placed. Click it to upgrade.`);
}

function selectTower(tower) {
  selectedTower = tower;
  if (tower) {
    const def = TOWERS[tower.type];
    rangeCircle.setPosition(tower.x, tower.y).setRadius(def.range).setVisible(true);
    startBtn.setVisible(false);
    if (tower.level < 3) {
      const cost = def.upgradeCost[tower.level - 1];
      upgradeBtn.setText(`⬆ Upgrade ${def.name} to Lv${tower.level + 1} ($${cost})`).setVisible(true);
    } else {
      upgradeBtn.setVisible(false);
    }
    setInfo(`${def.name} Lv${tower.level} — damage ${Math.round(def.damage * def.damageMult[tower.level - 1])}, range ${def.range}.`);
  } else {
    rangeCircle.setVisible(false);
    upgradeBtn.setVisible(false);
    if (!waveActive) startBtn.setVisible(true);
  }
}

function upgradeSelected(scene) {
  if (!selectedTower) return;
  const tower = selectedTower;
  const def = TOWERS[tower.type];
  if (tower.level >= 3) return;
  const cost = def.upgradeCost[tower.level - 1];
  if (gold < cost) { setInfo(`Not enough gold to upgrade ($${cost}).`); return; }
  gold -= cost;
  tower.level += 1;
  tower.sprite.setTexture(`${tower.type}-l${tower.level}-idle`);
  updateHud();
  selectTower(tower);
  setInfo(`${def.name} upgraded to Lv${tower.level}.`);
}

function startWave(scene) {
  if (gameOver || waveActive || paused) return;
  if (wave >= TOTAL_WAVES) return;
  wave += 1;
  waveActive = true;
  startBtn.setVisible(false);
  // Flatten the wave groups into a spawn queue, in order.
  spawnQueue = [];
  for (const [type, count] of WAVES[wave - 1]) {
    for (let i = 0; i < count; i++) spawnQueue.push(type);
  }
  spawnTimer = 0;
  updateHud();
  setInfo(`Wave ${wave} — ${spawnQueue.length} enemies incoming.`);
}

function spawnEnemy(scene, type) {
  const def = ENEMIES[type];
  const hpScale = 1 + 0.25 * (wave - 1);
  const hp = Math.round(def.hp * hpScale);
  const start = waypoints[0];
  const sprite = scene.add.sprite(start.x, start.y, `${def.framePrefix}1`).setDisplaySize(46, 46);
  sprite.play(`${type === 'orc' ? 'orc-walk' : type + '-walk'}`);
  const bg = scene.add.rectangle(start.x, start.y - 26, 34, 5, 0x000000).setOrigin(0.5);
  const fg = scene.add.rectangle(start.x, start.y - 26, 34, 5, 0x4ade80).setOrigin(0.5);
  enemies.push({
    type, def, sprite, hp, maxHp: hp,
    speed: def.speed, gold: def.gold, lives: def.lives,
    wp: 1, hpBg: bg, hpFg: fg, dead: false,
  });
}

function damageEnemy(scene, enemy, dmg) {
  if (enemy.dead) return;
  enemy.hp -= dmg;
  enemy.sprite.setTintFill(0xffffff);
  scene.time.delayedCall(60, () => { if (!enemy.dead) enemy.sprite.clearTint(); });
  if (enemy.hp <= 0) {
    enemy.dead = true;
    gold += enemy.gold;
    updateHud();
    const coin = scene.add.image(enemy.sprite.x, enemy.sprite.y, 'coin2').setDisplaySize(20, 20);
    scene.tweens.add({ targets: coin, y: coin.y - 24, alpha: 0, duration: 500, onComplete: () => coin.destroy() });
    enemy.sprite.destroy();
    enemy.hpBg.destroy();
    enemy.hpFg.destroy();
  }
}

function fireTower(scene, tower, target) {
  const def = TOWERS[tower.type];
  const dmg = Math.round(def.damage * def.damageMult[tower.level - 1]);
  tower.sprite.setTexture(`${tower.type}-l${tower.level}-fire`);
  scene.time.delayedCall(200, () => {
    if (tower.sprite.active) tower.sprite.setTexture(`${tower.type}-l${tower.level}-idle`);
  });
  const proj = scene.add.image(tower.x, tower.y, def.proj).setDisplaySize(22, 22);
  projectiles.push({ img: proj, target, dmg, speed: def.projSpeed, aoe: def.aoe, type: tower.type });
}

function update(time, delta) {
  if (paused || gameOver) return;
  const dt = (delta / 1000) * speedMult;

  // Spawn.
  if (waveActive && spawnQueue.length > 0) {
    spawnTimer -= delta * speedMult;
    if (spawnTimer <= 0) {
      spawnEnemy(this, spawnQueue.shift());
      spawnTimer = SPAWN_INTERVAL_MS;
    }
  }

  // Move enemies along waypoints.
  for (const e of enemies) {
    if (e.dead) continue;
    const target = waypoints[e.wp];
    if (!target) continue;
    const dx = target.x - e.sprite.x;
    const dy = target.y - e.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = e.speed * dt;
    if (dist <= step) {
      e.sprite.setPosition(target.x, target.y);
      e.wp += 1;
      if (e.wp >= waypoints.length) {
        // Reached the castle.
        e.dead = true;
        lives -= e.lives;
        e.sprite.destroy();
        e.hpBg.destroy();
        e.hpFg.destroy();
        if (lives <= 10) castleSprite.setTexture('base-castle-damaged');
        if (lives <= 0) { lives = 0; endGame(this, false); }
        updateHud();
        continue;
      }
    } else {
      e.sprite.x += (dx / dist) * step;
      e.sprite.y += (dy / dist) * step;
    }
    e.hpBg.setPosition(e.sprite.x, e.sprite.y - 26);
    const w = 34 * Math.max(0, e.hp / e.maxHp);
    e.hpFg.setPosition(e.sprite.x - (34 - w) / 2, e.sprite.y - 26).setDisplaySize(w, 5);
  }
  enemies = enemies.filter((e) => !e.dead);

  // Towers fire at the nearest enemy in range.
  for (const t of towers) {
    t.lastShot += delta * speedMult;
    const def = TOWERS[t.type];
    if (t.lastShot < def.rate) continue;
    let best = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.sprite.x - t.x, e.sprite.y - t.y);
      if (d <= def.range && d < bestDist) { best = e; bestDist = d; }
    }
    if (!best) continue;
    t.lastShot = 0;
    t.sprite.setAngle(Math.atan2(best.sprite.y - t.y, best.sprite.x - t.x) * 180 / Math.PI + 90);
    fireTower(this, t, best);
  }

  // Projectiles home in on their target.
  for (const p of projectiles) {
    if (!p.target || p.target.dead) { p.img.destroy(); p.done = true; continue; }
    const dx = p.target.sprite.x - p.img.x;
    const dy = p.target.sprite.y - p.img.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step + 8) {
      if (p.aoe > 0) {
        for (const e of [...enemies]) {
          if (Math.hypot(e.sprite.x - p.img.x, e.sprite.y - p.img.y) <= p.aoe) {
            damageEnemy(this, e, p.dmg);
          }
        }
      } else {
        damageEnemy(this, p.target, p.dmg);
      }
      p.img.destroy();
      p.done = true;
    } else {
      p.img.x += (dx / dist) * step;
      p.img.y += (dy / dist) * step;
      p.img.setAngle(Math.atan2(dy, dx) * 180 / Math.PI + 90);
    }
  }
  projectiles = projectiles.filter((p) => !p.done);

  // Wave cleared?
  if (waveActive && spawnQueue.length === 0 && enemies.length === 0) {
    waveActive = false;
    gold += WAVE_CLEAR_BONUS;
    updateHud();
    if (wave >= TOTAL_WAVES) {
      endGame(this, true);
    } else {
      setInfo(`Wave ${wave} cleared! +$${WAVE_CLEAR_BONUS} bonus. Start wave ${wave + 1} when ready.`);
      startBtn.setVisible(true);
    }
  }
}

function endGame(scene, won) {
  gameOver = true;
  waveActive = false;
  startBtn.setVisible(false);
  upgradeBtn.setVisible(false);
  const overlay = scene.add.rectangle(0, HUD_H, WIDTH, HEIGHT, 0x000000, 0.65).setOrigin(0);
  const title = scene.add.text(WIDTH / 2, HUD_H + 240, won ? '🏰 Victory!' : '💔 The castle has fallen', {
    fontSize: '36px', color: won ? '#ffd75e' : '#ff9a9a',
  }).setOrigin(0.5);
  const sub = scene.add.text(WIDTH / 2, HUD_H + 290,
    won ? `You held the castle through all ${TOTAL_WAVES} waves.` : `You fell on wave ${wave}.`,
    { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
  const again = scene.add.text(WIDTH / 2, HUD_H + 340, '↻ Play again', {
    fontSize: '20px', color: '#ffffff', backgroundColor: '#2e7d32', padding: { x: 14, y: 10 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    .on('pointerdown', () => scene.scene.restart());
  void overlay; void title; void sub; void again;
}
