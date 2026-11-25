// config.js — balance, map and waves for Magitech Tower Defense.
// Edit numbers here to tune the game; scene.js only reads them.

export const TILE = 64;
export const COLS = 15;
export const ROWS = 10;
export const WIDTH = COLS * TILE;   // 960
export const HEIGHT = ROWS * TILE;  // 640

export const START_GOLD = 150;
export const START_LIVES = 20;
export const TOTAL_WAVES = 10;

// Fixed path, in grid cells. Enemies enter at (-1, 1) and reach the
// castle at (14, 9).
export const PATH_CELLS = [
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1],
  [8, 1], [9, 1], [10, 1], [11, 1],
  [11, 2], [11, 3], [11, 4],
  [10, 4], [9, 4], [8, 4], [7, 4], [6, 4], [5, 4], [4, 4], [3, 4],
  [3, 5], [3, 6], [3, 7],
  [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
  [12, 7],
  [12, 8], [12, 9],
  [13, 9], [14, 9],
];
export const SPAWN_CELL = [-1, 1];
export const CASTLE_CELL = [14, 9];

export const TOWERS = {
  archer: {
    name: 'Rune Archer', cost: 50, range: 150, damage: 12, rate: 700,
    proj: 'proj-arrow2', projSpeed: 420, aoe: 0,
    upgradeCost: [75, 125], damageMult: [1, 1.7, 2.6],
    desc: 'Fast, cheap, long range',
  },
  crystal: {
    name: 'Crystal Mage', cost: 75, range: 130, damage: 20, rate: 1100,
    proj: 'proj-crystal-bolt', projSpeed: 340, aoe: 0,
    upgradeCost: [100, 160], damageMult: [1, 1.7, 2.6],
    desc: 'Heavy magic bolts',
  },
  cannon: {
    name: 'Energy Cannon', cost: 100, range: 110, damage: 35, rate: 1800,
    proj: 'fx-blast2', projSpeed: 300, aoe: 60,
    upgradeCost: [130, 200], damageMult: [1, 1.7, 2.6],
    desc: 'Slow, splash damage',
  },
};

export const ENEMIES = {
  goblin: {
    name: 'Armored Goblin', hp: 40, speed: 55, gold: 8, lives: 1,
    frames: 8, framePrefix: 'goblin-walk-',
    sideFrames: 6, sidePrefix: 'goblin-side-',
    backFrames: 6, backPrefix: 'goblin-back-',
  },
  skeleton: {
    name: 'Rune Skeleton', hp: 25, speed: 95, gold: 10, lives: 1,
    frames: 8, framePrefix: 'skeleton-walk-',
    sideFrames: 6, sidePrefix: 'skeleton-side-',
    backFrames: 6, backPrefix: 'skeleton-back-',
  },
  orc: {
    name: 'Clockwork Orc Golem', hp: 180, speed: 32, gold: 25, lives: 2,
    frames: 4, framePrefix: 'orc-walk-',
    sideFrames: 6, sidePrefix: 'orc-side-',
    backFrames: 6, backPrefix: 'orc-back-',
  },
};

// Waves: list of [enemyType, count] groups, spawned in order.
// HP scales +25% per wave after wave 1.
export const WAVES = [
  [['goblin', 6]],
  [['goblin', 8], ['skeleton', 2]],
  [['goblin', 6], ['skeleton', 6]],
  [['skeleton', 10], ['orc', 2]],
  [['goblin', 8], ['skeleton', 8], ['orc', 3]],
  [['skeleton', 12], ['orc', 4]],
  [['goblin', 10], ['skeleton', 10], ['orc', 5]],
  [['skeleton', 15], ['orc', 6]],
  [['goblin', 12], ['skeleton', 12], ['orc', 8]],
  [['goblin', 10], ['skeleton', 15], ['orc', 10]],
];
export const SPAWN_INTERVAL_MS = 900;
export const WAVE_CLEAR_BONUS = 25;
