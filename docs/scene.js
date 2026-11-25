// scene.js — Magitech Tower Defense.
// Phaser 3.60 is loaded as a classic script by index.html (window.Phaser).
// One fixed path, 3 towers, 3 enemies, 10 waves. No physics engine:
// enemies walk waypoints and projectiles home in on targets in update().

import {
  TILE, COLS, ROWS, WIDTH, HEIGHT, START_GOLD, START_LIVES, TOTAL_WAVES,
  PATH_CELLS, SPAWN_CELL, CASTLE_CELL, TOWERS, ENEMIES, WAVES,
  SPAWN_INTERVAL_MS, WAVE_CLEAR_BONUS,
} from './config.js';

const HUD_H = 40;   // top bar height
const SHOP_H = 140; // bottom shop bar height
const GAME_H = HUD_H + HEIGHT + SHOP_H; // 820

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
  'goblin-side-1', 'goblin-side-2', 'goblin-side-3',
  'goblin-side-4', 'goblin-side-5', 'goblin-side-6',
  'skeleton-side-1', 'skeleton-side-2', 'skeleton-side-3',
  'skeleton-side-4', 'skeleton-side-5', 'skeleton-side-6',
  'orc-side-1', 'orc-side-2', 'orc-side-3',
  'orc-side-4', 'orc-side-5', 'orc-side-6',
  'goblin-back-1', 'goblin-back-2', 'goblin-back-3',
  'goblin-back-4', 'goblin-back-5', 'goblin-back-6',
  'skeleton-back-1', 'skeleton-back-2', 'skeleton-back-3',
  'skeleton-back-4', 'skeleton-back-5', 'skeleton-back-6',
  'orc-back-1', 'orc-back-2', 'orc-back-3',
  'orc-back-4', 'orc-back-5', 'orc-back-6',
  'tile-ground-rune', 'tile-ground-plain',
  'ground-flowers', 'ground-rocks', 'ground-mushrooms',
  'ground-rune-big', 'ground-dirt',
  'tile-spawn-portal',
  'base-castle-idle', 'base-castle-damaged',
  'proj-arrow2', 'proj-crystal-bolt', 'fx-blast2', 'coin2', 'heart',
  'ui-hud-bar', 'ui-shop-card', 'ui-btn-green', 'ui-btn-gold',
  'ui-btn-small-cyan', 'ui-btn-small-gold',
  'ui-icon-coin', 'ui-icon-heart', 'ui-icon-skull', 'ui-icon-star',
  'ui-icon-swords', 'ui-icon-shield', 'ui-icon-upgrade', 'ui-icon-coins',
  'ui-card-blue', 'ui-card-cyan', 'ui-card-gold', 'ui-card-selected',
  'ui-banner-victory', 'ui-banner-defeat', 'ui-banner-wave',
  'ui-btn-play', 'ui-btn-pause', 'ui-btn-close',
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
let hudGold, hudLives, hudWave, infoText, startBtn, upgradeBtn, speedBtn, speedBtnBg;
let pauseSymbol, playSymbol, cardHighlights, waveBannerImg, waveBannerText;
let tipBg, tipName, tipDesc;
let castleSprite, paused, speedMult, gameOver;

function create() {
  gold = START_GOLD; lives = START_LIVES; wave = 0;
  waveActive = false; spawnQueue = []; spawnTimer = 0;
  enemies = []; towers = []; projectiles = [];
  selectedShop = null; selectedTower = null;
  paused = false; speedMult = 1; gameOver = false;

  // Walk animations: each frame is its own texture, so list them by key.
  // Every enemy has three walk sets — front (down), side (left/right,
  // flipped for left), back (up) — and the update loop swaps between
  // them as the enemy turns onto a new path segment.
  for (const [type, def] of Object.entries(ENEMIES)) {
    const rate = type === 'orc' ? 6 : 10;
    const mkFrames = (prefix, count) =>
      Array.from({ length: count }, (_, i) => ({ key: `${prefix}${i + 1}` }));
    this.anims.create({ key: `${type}-walk-front`, frames: mkFrames(def.framePrefix, def.frames), frameRate: rate, repeat: -1 });
    this.anims.create({ key: `${type}-walk-side`, frames: mkFrames(def.sidePrefix, def.sideFrames), frameRate: rate, repeat: -1 });
    this.anims.create({ key: `${type}-walk-back`, frames: mkFrames(def.backPrefix, def.backFrames), frameRate: rate, repeat: -1 });
  }
  this.anims.create({
    key: 'orc-attack',
    frames: [1, 2, 3, 4].map((n) => ({ key: `orc-attack-${n}` })),
    frameRate: 8, repeat: 0,
  });

  drawMap(this);
  drawHud(this);
  drawShop(this);

  // Wave-start banner, hidden until a wave starts.
  waveBannerImg = this.add.image(WIDTH / 2, HUD_H + 110, 'ui-banner-wave').setDisplaySize(360, 164).setVisible(false).setDepth(20);
  waveBannerText = this.add.text(WIDTH / 2, HUD_H + 110, '', {
    fontSize: '22px', color: '#ffffff', stroke: '#0a2a3a', strokeThickness: 4,
  }).setOrigin(0.5).setVisible(false).setDepth(21);

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
  this.input.keyboard.on('keydown-ESC', () => { selectedShop = null; selectTower(null); updateCardHighlights(); hideShopTip(); ghost.setVisible(false); rangeCircle.setVisible(false); });
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
  // Ground: a fixed deterministic mix of GRASS tiles only, so the map
  // stops repeating the same two. Same layout on every load. Stone
  // tiles are never used off-path: stone reads as path, so a buildable
  // tile that looks like stone makes it unclear where you can build.
  // tile-ground-rune is the plain grass stand-in (grass with scattered
  // rocks and a small rune circle); it is weighted heaviest.
  const variety = [
    'tile-ground-rune', 'tile-ground-rune', 'tile-ground-rune',
    'ground-flowers', 'ground-rocks', 'ground-mushrooms',
    'ground-rune-big', 'ground-dirt',
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = cellCenter(c, r);
      if (isPath(c, r)) continue;
      if (isCastle(c, r)) continue;
      const key = variety[(c * 7 + r * 11 + ((c * r) % 5)) % variety.length];
      scene.add.image(x, y, key).setDisplaySize(TILE, TILE);
    }
  }
  // Path base: plain stone under the whole path. No blue-line tile art —
  // the generator's corner tiles never lined up, so the glowing line is
  // drawn in code over the exact waypoint centres instead.
  for (const [c, r] of PATH_CELLS) {
    const { x, y } = cellCenter(c, r);
    scene.add.image(x, y, 'tile-ground-plain').setDisplaySize(TILE, TILE);
  }
  const line = scene.add.graphics();
  const trace = (g) => {
    g.beginPath();
    waypoints.forEach((w, i) => (i === 0 ? g.moveTo(w.x, w.y) : g.lineTo(w.x, w.y)));
    g.strokePath();
  };
  line.lineStyle(14, 0x35e0ff, 0.25);
  trace(line);
  line.lineStyle(4, 0x9ff3ff, 0.95);
  trace(line);
  // Spawn portal at the entry, castle at the end.
  const s = cellCenter(SPAWN_CELL[0], SPAWN_CELL[1]);
  scene.add.image(s.x, s.y, 'tile-spawn-portal').setDisplaySize(TILE, TILE);
  const castle = cellCenter(CASTLE_CELL[0], CASTLE_CELL[1]);
  castleSprite = scene.add.image(castle.x, castle.y, 'base-castle-idle').setDisplaySize(72, 72);
}

function drawHud(scene) {
  scene.add.rectangle(0, 0, WIDTH, HUD_H, 0x141828).setOrigin(0);
  scene.add.image(WIDTH / 2, HUD_H / 2, 'ui-hud-bar').setDisplaySize(WIDTH, HUD_H);
  scene.add.image(22, HUD_H / 2, 'ui-icon-shield').setDisplaySize(26, 26);
  scene.add.text(40, HUD_H / 2, 'Magitech Tower Defense', { fontSize: '17px', color: '#aee6ff' }).setOrigin(0, 0.5);
  // Each stat is an icon plus its number in its own slot, with room
  // between slots so the texts can never bleed into each other.
  scene.add.image(330, HUD_H / 2, 'ui-icon-coin').setDisplaySize(24, 24);
  hudGold = scene.add.text(358, HUD_H / 2, '', { fontSize: '18px', color: '#ffd75e' }).setOrigin(0, 0.5);
  scene.add.image(460, HUD_H / 2, 'ui-icon-heart').setDisplaySize(24, 24);
  hudLives = scene.add.text(488, HUD_H / 2, '', { fontSize: '18px', color: '#ff9a9a' }).setOrigin(0, 0.5);
  scene.add.image(590, HUD_H / 2, 'ui-icon-skull').setDisplaySize(24, 24);
  hudWave = scene.add.text(618, HUD_H / 2, '', { fontSize: '18px', color: '#c9f7c5' }).setOrigin(0, 0.5);
  // Round pause button. The white pause bars were knocked out by the
  // white-to-transparent step, so the symbol is drawn in code on top
  // of the button sprite: two bars when running, a triangle when paused.
  const pauseBg = scene.add.image(830, HUD_H / 2, 'ui-btn-pause').setDisplaySize(34, 34)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => togglePause(scene));
  pauseSymbol = scene.add.graphics();
  pauseSymbol.fillStyle(0xffffff, 1);
  pauseSymbol.fillRect(830 - 7, HUD_H / 2 - 8, 5, 16);
  pauseSymbol.fillRect(830 + 2, HUD_H / 2 - 8, 5, 16);
  playSymbol = scene.add.graphics();
  playSymbol.fillStyle(0xffffff, 1);
  playSymbol.fillTriangle(830 - 6, HUD_H / 2 - 9, 830 - 6, HUD_H / 2 + 9, 830 + 9, HUD_H / 2);
  playSymbol.setVisible(false);
  void pauseBg;
  // Round speed button: the speed text is drawn on top of the sprite.
  speedBtnBg = scene.add.image(895, HUD_H / 2, 'ui-btn-play').setDisplaySize(34, 34)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      speedMult = speedMult === 1 ? 2 : 1;
      speedBtn.setText(`${speedMult}x`);
    });
  speedBtn = scene.add.text(895, HUD_H / 2, '1x', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5);
  updateHud();
}

// A sprite-backed button: background image, label text drawn on top,
// optional sub-line and optional icon at the left. Returns a group with
// a setVisible that hides/shows the whole button, so callers can keep
// using startBtn.setVisible(...) / upgradeBtn.setVisible(...).
function makeButton(scene, x, y, w, h, bgKey, labelText, subText, onTap, iconKey) {
  const bg = scene.add.image(x + w / 2, y + h / 2, bgKey).setDisplaySize(w, h)
    .setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
  const cx = x + w / 2 + (iconKey ? 12 : 0);
  const label = scene.add.text(cx, y + h / 2 - (subText ? 10 : 0), labelText, { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
  const sub = subText
    ? scene.add.text(cx, y + h / 2 + 14, subText, { fontSize: '11px', color: '#e8f6ff' }).setOrigin(0.5)
    : null;
  const icon = iconKey ? scene.add.image(x + 24, y + h / 2, iconKey).setDisplaySize(22, 22) : null;
  return {
    bg, label, sub, icon,
    setVisible(v) { [bg, label, sub, icon].forEach((o) => o && o.setVisible(v)); },
  };
}

function drawShop(scene) {
  const shopY = HUD_H + HEIGHT;
  scene.add.rectangle(0, shopY, WIDTH, SHOP_H, 0x141828).setOrigin(0);
  scene.add.image(WIDTH / 2, shopY + SHOP_H / 2, 'ui-shop-card').setDisplaySize(WIDTH, SHOP_H);
  const types = Object.keys(TOWERS);
  const cardFrames = { archer: 'ui-card-blue', crystal: 'ui-card-cyan', cannon: 'ui-card-gold' };
  cardHighlights = {};
  // Hover tooltip: one shared panel, filled in per card. It sits above
  // the shop so it never covers the card itself, and its x is clamped
  // so it never runs past the canvas edge.
  tipBg = scene.add.image(0, 0, 'ui-shop-card').setDisplaySize(230, 72).setVisible(false).setDepth(30);
  tipName = scene.add.text(0, 0, '', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setVisible(false).setDepth(31);
  tipDesc = scene.add.text(0, 0, '', { fontSize: '11px', color: '#aee6ff', wordWrap: { width: 200 }, align: 'center' }).setOrigin(0.5, 0).setVisible(false).setDepth(31);
  types.forEach((type, i) => {
    const def = TOWERS[type];
    const x = 16 + i * 120;
    const y = shopY + 5;
    const cx = x + 52;
    // White selection frame sits behind the card, peeking out as a ring.
    cardHighlights[type] = scene.add.image(cx, y + 65, 'ui-card-selected').setDisplaySize(116, 142).setVisible(false);
    const frame = scene.add.image(cx, y + 65, cardFrames[type]).setDisplaySize(104, 130)
      .setInteractive({ useHandCursor: true });
    // Card shows only the tower sprite and its cost. The name and
    // description live in the hover tooltip, so no text can overflow
    // the narrow card.
    scene.add.image(cx, y + 42, `${type}-l1-idle`).setDisplaySize(56, 56);
    scene.add.image(x + 30, y + 104, 'ui-icon-coin').setDisplaySize(15, 15);
    scene.add.text(x + 42, y + 104, `$${def.cost}`, { fontSize: '13px', color: '#ffd75e' }).setOrigin(0, 0.5);
    frame.on('pointerover', () => showShopTip(type, cx, shopY));
    frame.on('pointerout', () => hideShopTip());
    frame.on('pointerdown', () => {
      hideShopTip();
      selectedShop = selectedShop === type ? null : type;
      selectTower(null);
      updateCardHighlights();
      ghost.setTexture(`${type}-l1-idle`);
      setInfo(selectedShop ? `Placing ${def.name} — click a free tile. Esc to cancel.` : '');
    });
  });
  startBtn = makeButton(scene, 692, shopY + 28, 240, 84, 'ui-btn-green', 'Start Wave', '', () => startWave(scene), 'ui-icon-swords');
  upgradeBtn = makeButton(scene, 692, shopY + 28, 240, 84, 'ui-btn-gold', 'Upgrade', '$0', () => upgradeSelected(scene), 'ui-icon-upgrade');
  upgradeBtn.setVisible(false);
  infoText = scene.add.text(392, shopY + 16, '', { fontSize: '12px', color: '#c9c9c9', wordWrap: { width: 290 } });
}

function updateCardHighlights() {
  if (!cardHighlights) return;
  for (const [type, img] of Object.entries(cardHighlights)) {
    img.setVisible(type === selectedShop);
  }
}

// Shop-card hover tooltip. The panel is 230 wide; clamping its centre
// to [118, WIDTH - 118] keeps it fully inside the canvas. Name is one
// line, description wraps inside 200px and is at most two lines, so
// both stay inside the 72px-tall panel.
function showShopTip(type, cx, shopY) {
  if (!tipBg) return;
  const def = TOWERS[type];
  const x = Math.max(118, Math.min(WIDTH - 118, cx));
  const y = shopY - 44;
  tipBg.setPosition(x, y).setVisible(true);
  tipName.setText(def.name).setPosition(x, y - 18).setVisible(true);
  tipDesc.setText(def.desc).setPosition(x, y + 2).setVisible(true);
}

function hideShopTip() {
  [tipBg, tipName, tipDesc].forEach((o) => o && o.setVisible(false));
}

function updateHud() {
  hudGold.setText(`${gold}`);
  hudLives.setText(`${lives}`);
  hudWave.setText(`Wave ${wave}/${TOTAL_WAVES}`);
}

function setInfo(msg) {
  if (infoText) infoText.setText(msg);
}

function togglePause(scene) {
  if (gameOver) return;
  paused = !paused;
  pauseSymbol.setVisible(!paused);
  playSymbol.setVisible(paused);
  setInfo(paused ? 'Paused.' : '');
}

function placeTower(scene, c, r) {
  const def = TOWERS[selectedShop];
  hideShopTip();
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
      upgradeBtn.label.setText(`Upgrade to Lv${tower.level + 1}`);
      upgradeBtn.sub.setText(`$${cost}`);
      upgradeBtn.setVisible(true);
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
  hideShopTip();
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
  // Flash the wave banner, then fade it out.
  waveBannerText.setText(`Wave ${wave}`);
  waveBannerImg.setVisible(true).setAlpha(1);
  waveBannerText.setVisible(true).setAlpha(1);
  scene.tweens.add({
    targets: [waveBannerImg, waveBannerText], alpha: 0, duration: 900, delay: 700,
    onComplete: () => { waveBannerImg.setVisible(false); waveBannerText.setVisible(false); },
  });
}

function spawnEnemy(scene, type) {
  const def = ENEMIES[type];
  const hpScale = 1 + 0.25 * (wave - 1);
  const hp = Math.round(def.hp * hpScale);
  const start = waypoints[0];
  const sprite = scene.add.sprite(start.x, start.y, `${def.sidePrefix}1`).setDisplaySize(46, 46);
  // Enemies enter moving right along row 1, so they start on the side set.
  sprite.play(`${type}-walk-side`);
  const bg = scene.add.rectangle(start.x, start.y - 26, 34, 5, 0x000000).setOrigin(0.5);
  const fg = scene.add.rectangle(start.x, start.y - 26, 34, 5, 0x4ade80).setOrigin(0.5);
  enemies.push({
    type, def, sprite, hp, maxHp: hp,
    speed: def.speed, gold: def.gold, lives: def.lives,
    wp: 1, hpBg: bg, hpFg: fg, dead: false, dir: 'right',
  });
}

// Pick the walk set for the direction an enemy is travelling and swap
// the animation when it changes. Side frames face right as drawn and
// are flipped for leftward movement; front is down, back is up.
function setWalkDir(e, dx, dy) {
  let dir;
  if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
  else dir = dy > 0 ? 'down' : 'up';
  if (dir === e.dir) return;
  e.dir = dir;
  const anim = dir === 'right' || dir === 'left' ? `${e.type}-walk-side`
    : dir === 'down' ? `${e.type}-walk-front` : `${e.type}-walk-back`;
  e.sprite.play(anim);
  e.sprite.setFlipX(dir === 'left');
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
      setWalkDir(e, dx, dy);
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
  scene.add.rectangle(0, HUD_H, WIDTH, HEIGHT, 0x000000, 0.65).setOrigin(0);
  const bannerY = HUD_H + 150;
  scene.add.image(WIDTH / 2, bannerY, won ? 'ui-banner-victory' : 'ui-banner-defeat')
    .setDisplaySize(480, won ? 184 : 200);
  if (won) {
    scene.add.image(WIDTH / 2 - 275, bannerY, 'ui-icon-star').setDisplaySize(40, 40);
    scene.add.image(WIDTH / 2 + 275, bannerY, 'ui-icon-star').setDisplaySize(40, 40);
  }
  scene.add.text(WIDTH / 2, bannerY + 130, won ? 'Victory!' : 'The castle has fallen', {
    fontSize: '36px', color: won ? '#ffd75e' : '#ff9a9a',
  }).setOrigin(0.5);
  scene.add.text(WIDTH / 2, bannerY + 180,
    won ? `You held the castle through all ${TOTAL_WAVES} waves.` : `You fell on wave ${wave}.`,
    { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
  makeButton(scene, WIDTH / 2 - 120, bannerY + 220, 240, 84, 'ui-btn-green', 'Play again', '',
    () => scene.scene.restart());
}
