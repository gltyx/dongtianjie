/**
 * 洞天劫 · 灵田药园 · 单机本地逻辑（由 dongtian-lingtian-api.js 移植）
 */
(function () {
'use strict';
var UNLOCK_LEVEL = 21;
var INITIAL_PLOT_COUNT = 3;
var MAX_PLOT_COUNT = 12;
var EXPAND_COST_NET_COIN = 100;
var STEAL_DAILY_LIMIT = 50;
var MATURE_WITHER_MS = 48 * 60 * 60 * 1000;
var AURA_DURATION_MS = 24 * 60 * 60 * 1000;
var ENERGY_DAILY_BASE = 10;
var ENERGY_BUY_COST_NET_COIN = 10;
var ENERGY_BUY_DAILY_LIMIT = 10;
/** 全部种子生长时间倍率：0.5 = 成熟时间减半（提速 2 倍） */
var GROWTH_TIME_MULT = 0.5;
/** 世界灵田列表缓存：降低频繁读全量存档造成的卡顿 */
var WORLD_LIST_CACHE_MS = 4000;
/** 后台异步索引刷新间隔：请求优先读快照，避免实时扫盘 */
var WORLD_INDEX_REFRESH_MS = 8000;

var PACK_COMMON = 'lt_seed_pack_common';
var PACK_RARE = 'lt_seed_pack_rare';
var PACK_MUTANT = 'lt_seed_pack_mutant';

var SHOP_ITEMS = {
  speed_talisman_small: { id: 'speed_talisman_small', name: '加速符（小）', cost: 5, dailyLimit: 10, grantMaterial: 'lt_speed_talisman_small', grantAmount: 1 },
  common_pack: { id: 'common_pack', name: '普通种子包', cost: 10, dailyLimit: 5, grantMaterial: PACK_COMMON, grantAmount: 1 },
  remove_pest_talisman: { id: 'remove_pest_talisman', name: '除虫符', cost: 2, dailyLimit: 10, grantMaterial: 'lt_talisman_remove_pest', grantAmount: 1 },
  water_talisman: { id: 'water_talisman', name: '浇水符', cost: 2, dailyLimit: 10, grantMaterial: 'lt_talisman_water', grantAmount: 1 },
  weed_talisman: { id: 'weed_talisman', name: '除草符', cost: 2, dailyLimit: 10, grantMaterial: 'lt_talisman_weed', grantAmount: 1 },
  secret_realm_warp: { id: 'secret_realm_warp', name: '秘境穿梭器', cost: 20, dailyLimit: 3, grantMaterial: 'secret_realm_warp', grantAmount: 1 },
  pet_exp_fruit: { id: 'pet_exp_fruit', name: '灵宠经验果实', cost: 20, dailyLimit: 3, grantMaterial: 'pet_exp_fruit', grantAmount: 1 },
  mutate_charm: { id: 'mutate_charm', name: '变异概率符', cost: 20, weeklyLimit: 5, grantMaterial: 'lt_mutate_charm', grantAmount: 1 },
  rare_pack: { id: 'rare_pack', name: '珍稀种子包', cost: 40, weeklyLimit: 10, grantMaterial: PACK_RARE, grantAmount: 1 },
};

var PLANTS = {
  huiqicao: { key: 'huiqicao', seedKey: 'lt_seed_huiqicao', herbKey: 'lt_herb_huiqicao', name: '回气草', hours: 2, weight: 1, rarity: 'common' },
  ningluhua: { key: 'ningluhua', seedKey: 'lt_seed_ningluhua', herbKey: 'lt_herb_ningluhua', name: '凝露花', hours: 4, weight: 2, rarity: 'common' },
  tufuling: { key: 'tufuling', seedKey: 'lt_seed_tufuling', herbKey: 'lt_herb_tufuling', name: '土茯苓', hours: 6, weight: 2, rarity: 'common' },
  qinglingmu: { key: 'qinglingmu', seedKey: 'lt_seed_qinglingmu', herbKey: 'lt_herb_qinglingmu', name: '青灵木', hours: 8, weight: 1, rarity: 'common' },
  fenglingcao: { key: 'fenglingcao', seedKey: 'lt_seed_fenglingcao', herbKey: 'lt_herb_fenglingcao', name: '风铃草', hours: 10, weight: 3, rarity: 'common' },
  huazaoshu: { key: 'huazaoshu', seedKey: 'lt_seed_huazaoshu', herbKey: 'lt_herb_huazaoshu', name: '火枣树', hours: 12, weight: 3, rarity: 'common' },
  jinxianteng: { key: 'jinxianteng', seedKey: 'lt_seed_jinxianteng', herbKey: 'lt_herb_jinxianteng', name: '金线藤', hours: 14, weight: 4, rarity: 'rare' },
  xuanbinggu: { key: 'xuanbinggu', seedKey: 'lt_seed_xuanbinggu', herbKey: 'lt_herb_xuanbinggu', name: '玄冰菇', hours: 16, weight: 5, rarity: 'rare' },
  bingxinlian: { key: 'bingxinlian', seedKey: 'lt_seed_bingxinlian', herbKey: 'lt_herb_bingxinlian', name: '冰心莲', hours: 18, weight: 5, rarity: 'rare' },
  longxueshu: { key: 'longxueshu', seedKey: 'lt_seed_longxueshu', herbKey: 'lt_herb_longxueshu', name: '龙血树', hours: 20, weight: 7, rarity: 'rare' },
  leijizhu: { key: 'leijizhu', seedKey: 'lt_seed_leijizhu', herbKey: 'lt_herb_leijizhu', name: '雷击竹', hours: 22, weight: 8, rarity: 'rare' },
  huanxinlan: { key: 'huanxinlan', seedKey: 'lt_seed_huanxinlan', herbKey: 'lt_herb_huanxinlan', name: '幻心兰', hours: 24, weight: 10, rarity: 'rare' },
};

var HYBRID_RECIPES = [
  { key: 'luhuacao', name: '露华草', herbKey: 'lt_herb_luhuacao', seedKey: 'lt_seed_luhuacao', hours: 3, weight: 2, parents: ['huiqicao', 'ningluhua'] },
  { key: 'diyuancao', name: '地元草', herbKey: 'lt_herb_diyuancao', seedKey: 'lt_seed_diyuancao', hours: 4, weight: 2, parents: ['tufuling', 'huiqicao'] },
  { key: 'jifengye', name: '疾风叶', herbKey: 'lt_herb_jifengye', seedKey: 'lt_seed_jifengye', hours: 5, weight: 2, parents: ['fenglingcao', 'huiqicao'] },
  { key: 'qingluteng', name: '青露藤', herbKey: 'lt_herb_qingluteng', seedKey: 'lt_seed_qingluteng', hours: 6, weight: 3, parents: ['ningluhua', 'qinglingmu'] },
  { key: 'hanxicao', name: '寒息草', herbKey: 'lt_herb_hanxicao', seedKey: 'lt_seed_hanxicao', hours: 8, weight: 2, parents: ['xuanbinggu', 'huiqicao'] },
  { key: 'huolinghua', name: '火灵花', herbKey: 'lt_herb_huolinghua', seedKey: 'lt_seed_huolinghua', hours: 8, weight: 4, parents: ['luhuacao', 'huazaoshu'] },
  { key: 'tulingmu', name: '土灵木', herbKey: 'lt_herb_tulingmu', seedKey: 'lt_seed_tulingmu', hours: 10, weight: 3, parents: ['tufuling', 'qinglingmu'] },
  { key: 'jinluhua', name: '金露花', herbKey: 'lt_herb_jinluhua', seedKey: 'lt_seed_jinluhua', hours: 12, weight: 4, parents: ['jinxianteng', 'ningluhua'] },
  { key: 'fengyinmu', name: '风吟木', herbKey: 'lt_herb_fengyinmu', seedKey: 'lt_seed_fengyinmu', hours: 12, weight: 4, parents: ['fenglingcao', 'qinglingmu'] },
  { key: 'fenghuocao', name: '风火草', herbKey: 'lt_herb_fenghuocao', seedKey: 'lt_seed_fenghuocao', hours: 14, weight: 4, parents: ['fenglingcao', 'huazaoshu'] },
  { key: 'bingfenggu', name: '冰风菇', herbKey: 'lt_herb_bingfenggu', seedKey: 'lt_seed_bingfenggu', hours: 16, weight: 4, parents: ['xuanbinggu', 'fenglingcao'] },
  { key: 'jinyanteng', name: '金焰藤', herbKey: 'lt_herb_jinyanteng', seedKey: 'lt_seed_jinyanteng', hours: 18, weight: 5, parents: ['jinxianteng', 'huazaoshu'] },
  { key: 'binghuolingguo', name: '冰火灵果', herbKey: 'lt_herb_binghuolingguo', seedKey: 'lt_seed_binghuolingguo', hours: 18, weight: 6, parents: ['huazaoshu', 'bingxinlian'] },
  { key: 'xuanbinglian', name: '玄冰莲', herbKey: 'lt_herb_xuanbinglian', seedKey: 'lt_seed_xuanbinglian', hours: 28, weight: 6, parents: ['xuanbinggu', 'bingxinlian'] },
  { key: 'xuebingguo', name: '血冰果', herbKey: 'lt_herb_xuebingguo', seedKey: 'lt_seed_xuebingguo', hours: 32, weight: 8, parents: ['longxueshu', 'bingxinlian'] },
  { key: 'huolongmu', name: '火龙木', herbKey: 'lt_herb_huolongmu', seedKey: 'lt_seed_huolongmu', hours: 30, weight: 8, parents: ['longxueshu', 'huazaoshu'] },
  { key: 'jinleiteng', name: '金雷藤', herbKey: 'lt_herb_jinleiteng', seedKey: 'lt_seed_jinleiteng', hours: 30, weight: 7, parents: ['jinxianteng', 'leijizhu'] },
  { key: 'leiyinmu', name: '雷音木', herbKey: 'lt_herb_leiyinmu', seedKey: 'lt_seed_leiyinmu', hours: 36, weight: 7, parents: ['leijizhu', 'qinglingmu'] },
  { key: 'huanfengye', name: '幻风叶', herbKey: 'lt_herb_huanfengye', seedKey: 'lt_seed_huanfengye', hours: 36, weight: 9, parents: ['huanxinlan', 'fenglingcao'] },
  { key: 'bingleiteng', name: '冰雷藤', herbKey: 'lt_herb_bingleiteng', seedKey: 'lt_seed_bingleiteng', hours: 42, weight: 8, parents: ['bingxinlian', 'leijizhu'] },
  { key: 'huanbinglan', name: '幻冰兰', herbKey: 'lt_herb_huanbinglan', seedKey: 'lt_seed_huanbinglan', hours: 48, weight: 10, parents: ['huanxinlan', 'bingxinlian'] },
  { key: 'xuejinteng', name: '血金藤', herbKey: 'lt_herb_xuejinteng', seedKey: 'lt_seed_xuejinteng', hours: 40, weight: 9, parents: ['longxueshu', 'jinxianteng'] },
  { key: 'huanleihua', name: '幻雷花', herbKey: 'lt_herb_huanleihua', seedKey: 'lt_seed_huanleihua', hours: 42, weight: 12, parents: ['huanxinlan', 'leijizhu'] },
  { key: 'hundunya', name: '混沌芽', herbKey: 'lt_herb_hundunya', seedKey: 'lt_seed_hundunya', hours: 72, weight: 10, parents: ['binghuolingguo', 'leiyinmu'] },
];

var ALL_PLANTS = {};
Object.keys(PLANTS).forEach((k) => {
  ALL_PLANTS[k] = PLANTS[k];
});
HYBRID_RECIPES.forEach((r) => {
  ALL_PLANTS[r.key] = {
    key: r.key,
    seedKey: r.seedKey,
    herbKey: r.herbKey,
    name: r.name,
    hours: r.hours,
    weight: r.weight,
    rarity: 'hybrid',
    parents: r.parents.slice(),
  };
});

var COMMON_SEED_KEYS = Object.values(PLANTS).filter((p) => p.hours <= 12).map((p) => p.seedKey);
var RARE_SEED_KEYS = ['lt_seed_bingxinlian', 'lt_seed_leijizhu', 'lt_seed_longxueshu', 'lt_seed_huanxinlan'];
var HERB_NAME_BY_KEY = Object.values(ALL_PLANTS).reduce((acc, p) => {
  acc[p.herbKey] = p.name;
  return acc;
}, {});
var PLANT_BY_SEED_KEY = Object.values(ALL_PLANTS).reduce((acc, p) => {
  acc[p.seedKey] = p;
  return acc;
}, {});
var RECIPE_BY_PAIR = {};
HYBRID_RECIPES.forEach((r) => {
  var p = [String(r.parents[0]), String(r.parents[1])].sort().join('|');
  RECIPE_BY_PAIR[p] = r;
});
var HERB_EFFECTS = {
  lt_herb_huiqicao: { name: '回气草', combats: 10, bonus: { hp: 10 } },
  lt_herb_ningluhua: { name: '凝露花', combats: 10, bonus: { atk: 10 } },
  lt_herb_tufuling: { name: '土茯苓', combats: 10, bonus: { def: 10 } },
  lt_herb_qinglingmu: { name: '青灵木', combats: 20, bonus: { hp: 30 } },
  lt_herb_fenglingcao: { name: '风铃草', combats: 20, bonus: { atk: 30 } },
  lt_herb_huazaoshu: { name: '火枣树', combats: 20, bonus: { def: 30 } },
  lt_herb_jinxianteng: { name: '金线藤', combats: 20, bonus: { hp: 50 } },
  lt_herb_xuanbinggu: { name: '玄冰菇', combats: 20, bonus: { atk: 50 } },
  lt_herb_bingxinlian: { name: '冰心莲', combats: 30, bonus: { def: 50 } },
  lt_herb_longxueshu: { name: '龙血树', combats: 30, bonus: { atk: 100 } },
  lt_herb_leijizhu: { name: '雷击竹', combats: 30, bonus: { atk: 100 } },
  lt_herb_huanxinlan: { name: '幻心兰', combats: 30, bonus: { atk: 100 } },
  lt_herb_luhuacao: { name: '露华草', combats: 20, bonus: { atkSpd: 5 } },
  lt_herb_diyuancao: { name: '地元草', combats: 20, bonus: { critRate: 5 } },
  lt_herb_jifengye: { name: '疾风叶', combats: 20, bonus: { vamp: 5 } },
  lt_herb_qingluteng: { name: '青露藤', combats: 20, bonus: { critDmg: 10 } },
  lt_herb_hanxicao: { name: '寒息草', combats: 20, bonus: { atk: 50, vamp: 5 } },
  lt_herb_huolinghua: { name: '火灵花', combats: 20, bonus: { atk: 50, critRate: 5 } },
  lt_herb_tulingmu: { name: '土灵木', combats: 20, bonus: { hp: 30, def: 30, critDmg: 30 } },
  lt_herb_jinluhua: { name: '金露花', combats: 20, bonus: { hp: 40, atk: 25 } },
  lt_herb_fengyinmu: { name: '风吟木', combats: 20, bonus: { def: 30, atkSpd: 5, critDmg: 20, vamp: 5 } },
  lt_herb_fenghuocao: { name: '风火草', combats: 20, bonus: { def: 30, atk: 20 } },
  lt_herb_bingfenggu: { name: '冰风菇', combats: 20, bonus: { atk: 50, critDmg: 20, vamp: 5 } },
  lt_herb_jinyanteng: { name: '金焰藤', combats: 20, bonus: { hp: 20, def: 40, critDmg: 20 } },
  lt_herb_binghuolingguo: { name: '冰火灵果', combats: 20, bonus: { atkSpd: 10, critRate: 5, vamp: 5 } },
  lt_herb_xuanbinglian: { name: '玄冰莲', combats: 20, bonus: { atkSpd: 20, critRate: 10, critDmg: 50 } },
  lt_herb_xuebingguo: { name: '血冰果', combats: 20, bonus: { hp: 100, atk: 50, vamp: 5 } },
  lt_herb_huolongmu: { name: '火龙木', combats: 20, bonus: { atk: 50, critRate: 10, critDmg: 20, vamp: 5 } },
  lt_herb_jinleiteng: { name: '金雷藤', combats: 20, bonus: { atk: 100, atkSpd: 10 } },
  lt_herb_leiyinmu: { name: '雷音木', combats: 20, bonus: { hp: 100, def: 30, critDmg: 20, vamp: 5 } },
  lt_herb_huanfengye: { name: '幻风叶', combats: 20, bonus: { hp: 100, atk: 100, vamp: 5 } },
  lt_herb_bingleiteng: { name: '冰雷藤', combats: 50, bonus: { atk: 100, def: 100, critDmg: 20 } },
  lt_herb_huanbinglan: { name: '幻冰兰', combats: 50, bonus: { atk: 100, atkSpd: 20 } },
  lt_herb_xuejinteng: { name: '血金藤', combats: 50, bonus: { def: 100, critRate: 10, critDmg: 50 } },
  lt_herb_huanleihua: { name: '幻雷花', combats: 50, bonus: { def: 300, atk: 300, atkSpd: 20, vamp: 5 } },
  lt_herb_hundunya: { name: '混沌芽', combats: 50, bonus: { hp: 300, atk: 300, atkSpd: 20, vamp: 5 } },
};

function normUid(uid) {
  return String(uid || '').trim().toLowerCase();
}

function cnDayKey(ts) {
  // 刷新点：北京时间每天 12:01。做法：先转北京时间，再减去 12:01 后按自然日取 key。
  var d = new Date(Number(ts) + 8 * 60 * 60 * 1000 - (12 * 60 + 1) * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function cnWeekKey(ts) {
  // 刷新点：北京时间每周一 12:01。先减去 12:01，再以“周一”为周起点生成周 key。
  var shiftedMs = Number(ts) + 8 * 60 * 60 * 1000 - (12 * 60 + 1) * 60 * 1000;
  var d = new Date(shiftedMs);
  var y = d.getUTCFullYear();
  var m = d.getUTCMonth();
  var day = d.getUTCDate();
  var dayOfWeek = d.getUTCDay(); // 0=周日 ... 1=周一
  var mondayOffset = (dayOfWeek + 6) % 7; // 周一=0，周日=6
  var monday = new Date(Date.UTC(y, m, day - mondayOffset));
  return monday.toISOString().slice(0, 10);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scaledGrowHours(hours) {
  var base = Number(hours);
  var safe = Number.isFinite(base) && base > 0 ? base : 1;
  var out = safe * GROWTH_TIME_MULT;
  return out < 0.5 ? 0.5 : out;
}

function pickOne(arr) {
  if (!Array.isArray(arr) || arr.length < 1) return null;
  return arr[randInt(0, arr.length - 1)];
}

function ensureMaterials(player) {
  if (!player.inventory || typeof player.inventory !== 'object') player.inventory = {};
  if (!player.inventory.materials || typeof player.inventory.materials !== 'object') player.inventory.materials = {};
  return player.inventory.materials;
}

function ensureLingtianShape(player, nowTs) {
  var now = Number(nowTs) || Date.now();
  if (!player || typeof player !== 'object') return null;
  var mats = ensureMaterials(player);
  if (!player.lingtian || typeof player.lingtian !== 'object') player.lingtian = {};
  var lt = player.lingtian;
  var maxLvl = Math.floor(
    Math.max(
      Number(player.maxDungeonFloorLvl) || 0,
      Number(player.lvl) || 0
    )
  );
  lt.maxHistoryLvl = maxLvl;
  var unlocked = maxLvl >= UNLOCK_LEVEL;
  if (!lt.unlocked && unlocked) {
    lt.unlocked = true;
    lt.unlockedAt = now;
  }
  if (typeof lt.unlocked !== 'boolean') lt.unlocked = unlocked;
  if (!lt.seeds || typeof lt.seeds !== 'object') lt.seeds = {};
  if (!lt.discoveredHybridSeeds || typeof lt.discoveredHybridSeeds !== 'object') lt.discoveredHybridSeeds = {};
  if (!lt.codex || typeof lt.codex !== 'object') lt.codex = {};
  if (!player.lingtianCombatBuffs || typeof player.lingtianCombatBuffs !== 'object') player.lingtianCombatBuffs = {};
  if (typeof lt.reputation !== 'number' || isNaN(lt.reputation)) lt.reputation = 0;
  if (typeof lt.auraPct !== 'number' || isNaN(lt.auraPct)) lt.auraPct = 0;
  if (typeof lt.auraExpireAt !== 'number' || isNaN(lt.auraExpireAt)) lt.auraExpireAt = 0;
  if (lt.auraExpireAt > 0 && lt.auraExpireAt <= now) {
    lt.auraPct = 0;
    lt.auraExpireAt = 0;
  }
  if (!lt.stealDaily || typeof lt.stealDaily !== 'object') lt.stealDaily = { day: '', count: 0 };
  if (!lt.energyDaily || typeof lt.energyDaily !== 'object') lt.energyDaily = { day: '', amount: ENERGY_DAILY_BASE, buyCount: 0 };
  if (typeof lt.hybridBoostCharges !== 'number' || isNaN(lt.hybridBoostCharges)) lt.hybridBoostCharges = 0;
  if (!lt.shopDaily || typeof lt.shopDaily !== 'object') lt.shopDaily = { day: '', counts: {} };
  if (!lt.shopWeekly || typeof lt.shopWeekly !== 'object') lt.shopWeekly = { week: '', counts: {} };
  var day = cnDayKey(now);
  if (lt.stealDaily.day !== day) lt.stealDaily = { day, count: 0 };
  if (lt.energyDaily.day !== day) lt.energyDaily = { day, amount: ENERGY_DAILY_BASE, buyCount: 0 };
  if (typeof lt.energyDaily.amount !== 'number' || isNaN(lt.energyDaily.amount)) lt.energyDaily.amount = ENERGY_DAILY_BASE;
  if (lt.energyDaily.amount < 0) lt.energyDaily.amount = 0;
  if (typeof lt.energyDaily.buyCount !== 'number' || isNaN(lt.energyDaily.buyCount)) lt.energyDaily.buyCount = 0;
  if (lt.shopDaily.day !== day) lt.shopDaily = { day, counts: {} };
  var wk = cnWeekKey(now);
  if (lt.shopWeekly.week !== wk) lt.shopWeekly = { week: wk, counts: {} };

  var lc = Math.floor(Number(lt.landCount) || INITIAL_PLOT_COUNT);
  if (lc < INITIAL_PLOT_COUNT) lc = INITIAL_PLOT_COUNT;
  if (lc > MAX_PLOT_COUNT) lc = MAX_PLOT_COUNT;
  lt.landCount = lc;

  if (!Array.isArray(lt.plots)) lt.plots = [];
  while (lt.plots.length < MAX_PLOT_COUNT) lt.plots.push({ plant: null });
  if (lt.plots.length > MAX_PLOT_COUNT) lt.plots = lt.plots.slice(0, MAX_PLOT_COUNT);
  for (var i = 0; i < lt.plots.length; i++) {
    var row = lt.plots[i];
    if (!row || typeof row !== 'object') lt.plots[i] = { plant: null };
    if (!Object.prototype.hasOwnProperty.call(lt.plots[i], 'plant')) lt.plots[i].plant = null;
    resolvePlotPlant(lt.plots[i], now);
  }
  if (lt.unlocked && !lt.initialGiftGiven) {
    mats[PACK_COMMON] = (Math.floor(Number(mats[PACK_COMMON])) || 0) + 5;
    lt.initialGiftGiven = true;
  }
  return lt;
}

function ensureLingtianShapeTracked(player, nowTs) {
  var mats = ensureMaterials(player || {});
  var beforeLt = JSON.stringify(player && player.lingtian ? player.lingtian : null);
  var beforePack = Math.floor(Number(mats[PACK_COMMON]) || 0);
  var beforeBuffFlag = player && player.lingtianCombatBuffs && typeof player.lingtianCombatBuffs === 'object' ? 1 : 0;
  var lt = ensureLingtianShape(player, nowTs);
  var afterLt = JSON.stringify(player && player.lingtian ? player.lingtian : null);
  var afterPack = Math.floor(Number(mats[PACK_COMMON]) || 0);
  var afterBuffFlag = player && player.lingtianCombatBuffs && typeof player.lingtianCombatBuffs === 'object' ? 1 : 0;
  return {
    lt,
    changed: beforeLt !== afterLt || beforePack !== afterPack || beforeBuffFlag !== afterBuffFlag,
  };
}

function parseActiveCombatBuffs(player) {
  var raw = player && player.lingtianCombatBuffs && typeof player.lingtianCombatBuffs === 'object' ? player.lingtianCombatBuffs : {};
  var out = [];
  Object.keys(raw).forEach((k) => {
    var row = raw[k];
    if (!row || typeof row !== 'object') return;
    var rem = Math.max(0, Math.floor(Number(row.remaining) || 0));
    if (rem < 1) return;
    var ef = HERB_EFFECTS[k] || {};
    out.push({
      herbKey: k,
      name: String(row.name || ef.name || HERB_NAME_BY_KEY[k] || k),
      remaining: rem,
      bonus: row.bonus && typeof row.bonus === 'object' ? row.bonus : (ef.bonus || {}),
    });
  });
  out.sort((a, b) => b.remaining - a.remaining);
  return out;
}

function resolvePlotPlant(plot, nowTs) {
  if (!plot || !plot.plant || typeof plot.plant !== 'object') return;
  var now = Number(nowTs) || Date.now();
  var p = plot.plant;
  if (typeof p.status !== 'string') p.status = 'growing';
  if (typeof p.totalYield !== 'number' || isNaN(p.totalYield)) p.totalYield = randInt(1, 10);
  p.totalYield = Math.max(1, Math.min(10, Math.floor(p.totalYield)));
  if (typeof p.stolen !== 'number' || isNaN(p.stolen)) p.stolen = 0;
  p.stolen = Math.max(0, Math.floor(p.stolen));
  if (typeof p.stealCap !== 'number' || isNaN(p.stealCap)) p.stealCap = Math.floor(p.totalYield * 0.5);
  p.stealCap = Math.max(0, Math.min(Math.floor(p.totalYield * 0.5), Math.floor(p.stealCap)));
  if (!p.stolenBy || typeof p.stolenBy !== 'object') p.stolenBy = {};
  if (!p.auraBy || typeof p.auraBy !== 'object') p.auraBy = {};
  if (typeof p.eventType !== 'string') p.eventType = '';
  if (typeof p.eventHandled !== 'boolean') p.eventHandled = false;

  var matureAt = Math.floor(Number(p.matureAt) || 0);
  var matured = matureAt > 0 && now >= matureAt;
  if (p.status === 'growing' && matured) p.status = 'mature';
  var witherAt = matureAt + MATURE_WITHER_MS;
  if (p.status === 'mature' && matureAt > 0 && now >= witherAt) p.status = 'withered';
  /** 修复历史脏数据：stolenBy 已记录但 stolen 未同步时，已偷至少按偷过人数计 */
  if (p.stolenBy && typeof p.stolenBy === 'object') {
    var byCount = Object.keys(p.stolenBy).filter((k) => p.stolenBy[k]).length;
    if (byCount > 0) {
      var stolen = Math.floor(Number(p.stolen) || 0);
      if (stolen < byCount) p.stolen = byCount;
    }
  }
}

function collectMatureCount(lt) {
  if (!lt || !Array.isArray(lt.plots)) return 0;
  var n = 0;
  for (var i = 0; i < lt.landCount; i++) {
    var p = lt.plots[i] && lt.plots[i].plant;
    if (!p) continue;
    if (p.status === 'mature' && p.stolen < p.stealCap) n += 1;
  }
  return n;
}

function collectPlantedCount(lt) {
  if (!lt || !Array.isArray(lt.plots)) return 0;
  var n = 0;
  for (var i = 0; i < lt.landCount; i++) {
    var p = lt.plots[i] && lt.plots[i].plant;
    if (p) n += 1;
  }
  return n;
}

/** 当前访客是否还能从目标灵田至少偷到 1 株成熟灵植（已偷过该株、偷满、非成熟不计入） */
function viewerCanStealOnTargetLt(targetLt, thiefId) {
  if (!targetLt || !thiefId || !Array.isArray(targetLt.plots)) return false;
  var cap = Math.floor(Number(targetLt.landCount) || 0);
  for (var i = 0; i < cap; i++) {
    var plot = targetLt.plots[i];
    if (!plot || !plot.plant || typeof plot.plant !== 'object') continue;
    var p = plot.plant;
    if (p.status !== 'mature') continue;
    if (p.stolenBy && p.stolenBy[thiefId]) continue;
    var remainSteal = Math.max(0, Math.floor(p.stealCap) - Math.floor(p.stolen));
    if (remainSteal >= 1) return true;
  }
  return false;
}

function nextExpandNeedLevel(landCount) {
  var n = Math.floor(Number(landCount) || INITIAL_PLOT_COUNT);
  return 31 + Math.max(0, n - INITIAL_PLOT_COUNT) * 10;
}
function getPlotPayload(plot, idx, landCount, stealCtx) {
  var unlocked = idx < landCount;
  var base = { index: idx, unlocked, plant: null };
  if (!unlocked) return base;
  if (!plot || !plot.plant) return base;
  var p = plot.plant;
  var remainSteal = Math.max(0, (Math.floor(p.stealCap) || 0) - (Math.floor(p.stolen) || 0));
  var plant = {
    key: p.plantKey,
    name: p.plantName,
    status: p.status,
    totalYield: Math.floor(p.totalYield) || 0,
    stolen: Math.floor(p.stolen) || 0,
    stealCap: Math.floor(p.stealCap) || 0,
    remainSteal,
    matureAt: Math.floor(Number(p.matureAt) || 0),
    plantedAt: Math.floor(Number(p.plantedAt) || 0),
    eventName: p.eventName || '',
    eventDesc: p.eventDesc || '',
    eventType: p.eventType || '',
    eventHandled: !!p.eventHandled,
    isHybrid: !!p.isHybrid,
  };
  if (stealCtx && typeof stealCtx === 'object') {
    var vid = stealCtx.viewerId ? normUid(stealCtx.viewerId) : '';
    var viewerCanSteal = false;
    var viewerAlreadyStole = false;
    if (vid && !stealCtx.isSelfVisit && stealCtx.thiefHasStealQuota && p.status === 'mature' && remainSteal >= 1) {
      if (p.stolenBy && p.stolenBy[vid]) {
        viewerAlreadyStole = true;
      } else {
        viewerCanSteal = true;
      }
    }
    plant.viewerCanSteal = viewerCanSteal;
    plant.viewerAlreadyStole = viewerAlreadyStole;
  }
  return {
    index: idx,
    unlocked: true,
    plant,
  };
}

function parseOwnedHerbs(materials) {
  var out = [];
  var m = materials && typeof materials === 'object' ? materials : {};
  Object.keys(m).forEach((k) => {
    if (!/^lt_herb_/i.test(k)) return;
    var n = Math.floor(Number(m[k]) || 0);
    if (n < 1) return;
    out.push({
      herbKey: k,
      amount: n,
      name: HERB_NAME_BY_KEY[k] || k,
      effect: HERB_EFFECTS[k] ? { combats: HERB_EFFECTS[k].combats, bonus: { ...HERB_EFFECTS[k].bonus } } : null,
    });
  });
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

function parsePackCounts(materials) {
  return {
    common: Math.max(0, Math.floor(Number(materials[PACK_COMMON]) || 0)),
    rare: Math.max(0, Math.floor(Number(materials[PACK_RARE]) || 0)),
    mutant: Math.max(0, Math.floor(Number(materials[PACK_MUTANT]) || 0)),
  };
}

/** 灵田专用 API 成功后下发给客户端的同步字段（避免拉档时本地旧材料数盖回） */
function buildLingtianClientSyncPayload(player, writtenSave) {
  var mats = ensureMaterials(player);
  var lt = player && player.lingtian && typeof player.lingtian === 'object' ? player.lingtian : {};
  var written =
    writtenSave && typeof writtenSave === 'object' ? writtenSave : null;
  return {
    seedPacks: parsePackCounts(mats),
    seeds: lt.seeds && typeof lt.seeds === 'object' ? JSON.parse(JSON.stringify(lt.seeds)) : {},
    materials: {
      [PACK_COMMON]: Math.max(0, Math.floor(Number(mats[PACK_COMMON]) || 0)),
      [PACK_RARE]: Math.max(0, Math.floor(Number(mats[PACK_RARE]) || 0)),
      [PACK_MUTANT]: Math.max(0, Math.floor(Number(mats[PACK_MUTANT]) || 0)),
    },
    updatedAt:
      written && typeof written.updatedAt === 'number' && Number.isFinite(written.updatedAt)
        ? written.updatedAt
        : undefined,
    clientEpoch:
      written && typeof written.clientEpoch === 'number' && Number.isFinite(written.clientEpoch)
        ? Math.floor(written.clientEpoch)
        : undefined,
  };
}

function rollPlantEvent(baseHours, totalYield) {
  var plus2 = 2 * GROWTH_TIME_MULT;
  var plus4 = 4 * GROWTH_TIME_MULT;
  if (Math.random() >= 0.05) {
    return { matureAtOffsetMs: Math.floor(baseHours * 3600000), totalYield, eventType: '', eventName: '', eventDesc: '' };
  }
  var t = pickOne(['pest', 'drought', 'light', 'weed']);
  if (t === 'light') {
    var ny = Math.max(1, Math.min(10, Math.ceil(totalYield * 1.2)));
    return { matureAtOffsetMs: Math.floor(baseHours * 3600000), totalYield: ny, eventType: 'light', eventName: '灵光乍现', eventDesc: '天机垂照，成熟时产量 +20%。' };
  }
  if (t === 'drought') {
    return { matureAtOffsetMs: Math.floor((baseHours + plus4) * 3600000), totalYield, eventType: 'drought', eventName: '干旱', eventDesc: '地脉枯涩，成熟额外延后约 ' + plus4 + ' 小时。' };
  }
  if (t === 'pest') {
    return { matureAtOffsetMs: Math.floor((baseHours + plus2) * 3600000), totalYield, eventType: 'pest', eventName: '虫害', eventDesc: '灵虫蚀叶，成熟额外延后约 ' + plus2 + ' 小时。' };
  }
  return { matureAtOffsetMs: Math.floor((baseHours + plus2) * 3600000), totalYield, eventType: 'weed', eventName: '野草缠绕', eventDesc: '杂草缠根，成熟额外延后约 ' + plus2 + ' 小时。' };
}

function findAdjacentIndexes(index, landCount) {
  var cols = 3;
  var rows = Math.ceil(landCount / cols);
  var x = index % cols;
  var y = Math.floor(index / cols);
  var out = [];
  var cand = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  for (var i = 0; i < cand.length; i++) {
    var nx = cand[i][0];
    var ny = cand[i][1];
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    var idx = ny * cols + nx;
    if (idx < 0 || idx >= landCount) continue;
    out.push(idx);
  }
  return out;
}

function hybridChancePct(pa, pb, auraPct, boostCharges) {
  var w1 = Math.max(1, Math.floor(Number(pa && pa.weight) || 1));
  var w2 = Math.max(1, Math.floor(Number(pb && pb.weight) || 1));
  var chance = 5 * (w1 + w2) * (1 + Math.max(0, Number(auraPct) || 0) / 100);
  if ((Math.floor(Number(boostCharges) || 0)) > 0) chance *= 2;
  if (chance > 80) chance = 80;
  if (chance < 0) chance = 0;
  return chance;
}

function tryTriggerHybridOnHarvest(lt, sourceIndex, sourcePlant, now) {
  if (!lt || !sourcePlant) return { triggered: false };
  var neighbors = findAdjacentIndexes(sourceIndex, lt.landCount);
  var pairCandidates = [];
  for (var i = 0; i < neighbors.length; i++) {
    var ni = neighbors[i];
    var np = lt.plots[ni] && lt.plots[ni].plant;
    if (!np || np.status === 'withered') continue;
    var k1 = String(sourcePlant.plantKey || '').trim();
    var k2 = String(np.plantKey || '').trim();
    if (!k1 || !k2 || k1 === k2) continue;
    var pairKey = [k1, k2].sort().join('|');
    var recipe = RECIPE_BY_PAIR[pairKey];
    if (!recipe) continue;
    pairCandidates.push({ recipe, neighborPlant: np });
  }
  if (!pairCandidates.length) return { triggered: false };
  var emptyNeighbors = neighbors.filter((idx) => {
    var p = lt.plots[idx] && lt.plots[idx].plant;
    return !p;
  });
  if (!emptyNeighbors.length) return { triggered: false, reason: 'no_empty' };
  var picked = pickOne(pairCandidates);
  var recipe = picked.recipe;
  var pa = ALL_PLANTS[String(sourcePlant.plantKey || '')] || ALL_PLANTS[String(recipe.parents[0] || '')];
  var pb = ALL_PLANTS[String(picked.neighborPlant.plantKey || '')] || ALL_PLANTS[String(recipe.parents[1] || '')];
  var chance = hybridChancePct(pa, pb, lt.auraPct, lt.hybridBoostCharges);
  if (Math.random() * 100 >= chance) {
    if ((Math.floor(Number(lt.hybridBoostCharges) || 0)) > 0) lt.hybridBoostCharges -= 1;
    return { triggered: false, chance };
  }
  var targetIdx = pickOne(emptyNeighbors);
  var totalYield = randInt(1, 10);
  lt.plots[targetIdx].plant = {
    plantKey: recipe.key,
    plantName: recipe.name,
    seedKey: recipe.seedKey,
    herbKey: recipe.herbKey,
    status: 'growing',
    plantedAt: now,
    matureAt: now + Math.floor(scaledGrowHours(recipe.hours) * 3600000),
    totalYield,
    stealCap: Math.floor(totalYield * 0.5),
    stolen: 0,
    stolenBy: {},
    auraBy: {},
    eventType: '',
    eventName: '',
    eventDesc: '',
    eventHandled: false,
    isHybrid: true,
    recipeParents: recipe.parents.slice(),
  };
  lt.codex[recipe.key] = true;
  lt.discoveredHybridSeeds[recipe.seedKey] = true;
  if (Math.random() < 0.05) {
    lt.seeds[recipe.seedKey] = (Math.floor(Number(lt.seeds[recipe.seedKey])) || 0) + 1;
  }
  if ((Math.floor(Number(lt.hybridBoostCharges) || 0)) > 0) lt.hybridBoostCharges -= 1;
  return { triggered: true, recipe, chance };
}

function seedCatalogPayload() {
  var out = {};
  Object.keys(PLANT_BY_SEED_KEY).forEach((seedKey) => {
    var p = PLANT_BY_SEED_KEY[seedKey];
    if (!p) return;
    out[seedKey] = {
      seedKey,
      name: p.name || seedKey,
      growHours: Number(scaledGrowHours(p.hours).toFixed(2)),
      rarity: p.rarity || 'common',
    };
  });
  return out;
}
function persistLocalSave() {
    if (typeof saveData === "function") saveData();
    if (typeof calculateStats === "function") calculateStats();
    if (typeof playerLoadStats === "function") playerLoadStats();
}

function getEnhanceStoneCount() {
    if (typeof player === "undefined" || !player) return 0;
    var mats = ensureMaterials(player);
    return Math.max(0, Math.floor(Number(mats.enhance_stone) || 0));
}

function spendEnhanceStone(amount) {
    if (typeof player === "undefined" || !player) return false;
    var need = Math.max(0, Math.floor(Number(amount) || 0));
    var mats = ensureMaterials(player);
    var have = Math.max(0, Math.floor(Number(mats.enhance_stone) || 0));
    if (have < need) return false;
    mats.enhance_stone = have - need;
    return true;
}

var LT_ENERGY_BUY_ENHANCE_STONE = 10;
var LT_EXPAND_ENHANCE_STONE_BASE = 50;
var LT_EXPAND_ENHANCE_STONE_STEP = 50;

function calcLingtianExpandEnhanceCost(landCount) {
    var lc = Math.floor(Number(landCount) || INITIAL_PLOT_COUNT);
    var done = Math.max(0, lc - INITIAL_PLOT_COUNT);
    return LT_EXPAND_ENHANCE_STONE_BASE + done * LT_EXPAND_ENHANCE_STONE_STEP;
}

function buildStateResponse() {
    var now = Date.now();
    if (typeof player === "undefined" || !player) return { ok: false, message: "无存档" };
    ensureLingtianShapeTracked(player, now);
    var lt = player.lingtian;
    var mats = ensureMaterials(player);
    return {
        ok: true,
        unlocked: !!lt.unlocked,
        maxHistoryLvl: Math.floor(Number(lt.maxHistoryLvl) || 0),
        landCount: lt.landCount,
        maxPlotCount: MAX_PLOT_COUNT,
        nextExpandNeedLevel: lt.landCount >= MAX_PLOT_COUNT ? null : nextExpandNeedLevel(lt.landCount),
        expandCost: lt.landCount >= MAX_PLOT_COUNT ? null : calcLingtianExpandEnhanceCost(lt.landCount),
        expandCostMaterial: "enhance_stone",
        reputation: Math.floor(Number(lt.reputation) || 0),
        auraPct: Math.floor(Number(lt.auraPct) || 0),
        auraExpireAt: Math.floor(Number(lt.auraExpireAt) || 0),
        stealDaily: Math.floor(Number(lt.stealDaily && lt.stealDaily.count) || 0),
        stealDailyLimit: STEAL_DAILY_LIMIT,
        energy: Math.floor(Number(lt.energyDaily && lt.energyDaily.amount) || 0),
        energyBuyCount: Math.floor(Number(lt.energyDaily && lt.energyDaily.buyCount) || 0),
        energyBuyLimit: ENERGY_BUY_DAILY_LIMIT,
        energyBuyCost: LT_ENERGY_BUY_ENHANCE_STONE,
        energyBuyCostMaterial: "enhance_stone",
        enhanceStone: getEnhanceStoneCount(),
        hybridBoostCharges: Math.floor(Number(lt.hybridBoostCharges) || 0),
        seedPacks: parsePackCounts(mats),
        seeds: lt.seeds || {},
        seedCatalog: seedCatalogPayload(),
        herbs: parseOwnedHerbs(mats),
        activeCombatBuffs: parseActiveCombatBuffs(player),
        plots: lt.plots.map(function (row, idx) {
            return getPlotPayload(row, idx, lt.landCount);
        }),
        world: [],
        worldPlanted: [],
        worldTotalMature: 0,
        worldTotalPlanted: 0,
        worldIndexStats: { cachedAt: 0, running: false, buildMs: 0, fileCount: 0, lastError: "standalone" },
        mutateCharmCount: Math.max(0, Math.floor(Number(mats.lt_mutate_charm) || 0)),
        talisman: {
            pest: Math.max(0, Math.floor(Number(mats.lt_talisman_remove_pest) || 0)),
            drought: Math.max(0, Math.floor(Number(mats.lt_talisman_water) || 0)),
            weed: Math.max(0, Math.floor(Number(mats.lt_talisman_weed) || 0)),
        },
        codex: {
            total: HYBRID_RECIPES.length,
            discovered: Object.keys(lt.codex || {}).filter(function (k) {
                return !!lt.codex[k];
            }).length,
            recipes: HYBRID_RECIPES.map(function (r) {
                return {
                    key: r.key,
                    name: r.name,
                    hours: r.hours,
                    discovered: !!(lt.codex && lt.codex[r.key]),
                    parents: r.parents.slice(),
                    parentNames: r.parents.map(function (pk) {
                        var p = ALL_PLANTS[String(pk) || ""];
                        return p && p.name ? p.name : String(pk || "???");
                    }),
                    seedKey: r.seedKey,
                };
            }),
        },
        shopItems: Object.values(SHOP_ITEMS).map(function (it) {
            return {
                id: it.id,
                name: it.name,
                cost: it.cost,
                dailyLimit: it.dailyLimit || null,
                weeklyLimit: it.weeklyLimit || null,
                boughtDaily: Math.floor(Number(lt.shopDaily.counts[it.id]) || 0),
                boughtWeekly: Math.floor(Number(lt.shopWeekly.counts[it.id]) || 0),
            };
        }),
        localMode: true,
    };
}

function handlePost(path, body) {
    var now = Date.now();
    if (typeof player === "undefined" || !player) return { ok: false, message: "无存档" };
    body = body && typeof body === "object" ? body : {};
    var lt = ensureLingtianShape(player, now);
    var mats = ensureMaterials(player);

    if (path.indexOf("/steal") >= 0 || path.indexOf("/visit/") >= 0) {
        return { ok: false, message: "单机版暂无世界灵田与偷取功能" };
    }

    if (path.indexOf("/open-pack") >= 0) {
        var packKey = String(body.packKey || "").trim();
        var useCount = Math.max(1, Math.min(99, Math.floor(Number(body.count) || 1)));
        if (packKey !== PACK_COMMON && packKey !== PACK_RARE && packKey !== PACK_MUTANT) {
            return { ok: false, message: "种子包类型错误" };
        }
        if (!lt.unlocked) return { ok: false, message: "历史境界未达 21，尚未开启灵田药园" };
        var havePack = Math.floor(Number(mats[packKey]) || 0);
        if (havePack < useCount) return { ok: false, message: "种子包不足" };
        mats[packKey] = havePack - useCount;
        var added = {};
        for (var i = 0; i < useCount; i++) {
            if (packKey === PACK_COMMON) {
                var n = randInt(1, 3);
                for (var k = 0; k < n; k++) {
                    var seedKey = pickOne(COMMON_SEED_KEYS);
                    if (!seedKey) continue;
                    lt.seeds[seedKey] = (Math.floor(Number(lt.seeds[seedKey])) || 0) + 1;
                    added[seedKey] = (added[seedKey] || 0) + 1;
                }
            } else if (packKey === PACK_RARE) {
                var seedKey2 = pickOne(RARE_SEED_KEYS);
                lt.seeds[seedKey2] = (Math.floor(Number(lt.seeds[seedKey2])) || 0) + 1;
                added[seedKey2] = (added[seedKey2] || 0) + 1;
            } else {
                var discovered = Object.keys(lt.discoveredHybridSeeds || {}).filter(function (dk) {
                    return lt.discoveredHybridSeeds[dk];
                });
                if (!discovered.length) {
                    mats[packKey] = (Math.floor(Number(mats[packKey])) || 0) + useCount;
                    return { ok: false, message: "尚无已发现杂交种子，无法开启变异种子包" };
                }
                var seedKey3 = pickOne(discovered);
                lt.seeds[seedKey3] = (Math.floor(Number(lt.seeds[seedKey3])) || 0) + 1;
                added[seedKey3] = (added[seedKey3] || 0) + 1;
            }
        }
        persistLocalSave();
        return Object.assign({ ok: true, message: "灵种入囊。", added: added }, buildLingtianClientSyncPayload(player, null));
    }

    if (path.indexOf("/plant") >= 0) {
        var plotIndex = Math.floor(Number(body.plotIndex));
        var seedKeyP = String(body.seedKey || "").trim();
        var def = PLANT_BY_SEED_KEY[seedKeyP];
        if (!def) return { ok: false, message: "种子不存在" };
        if (!lt.unlocked) return { ok: false, message: "历史境界未达 21，尚未开启灵田药园" };
        if (!Number.isFinite(plotIndex) || plotIndex < 0 || plotIndex >= lt.landCount) {
            return { ok: false, message: "地块未解锁" };
        }
        var plot = lt.plots[plotIndex];
        if (!plot || (plot.plant && plot.plant.status !== "withered")) {
            return { ok: false, message: "该地块尚未空闲" };
        }
        var haveSeed = Math.floor(Number(lt.seeds[seedKeyP]) || 0);
        if (haveSeed < 1) return { ok: false, message: "该种子不足" };
        lt.seeds[seedKeyP] = haveSeed - 1;
        var totalYield = randInt(1, 10);
        var ev = rollPlantEvent(scaledGrowHours(def.hours), totalYield);
        plot.plant = {
            plantKey: def.key,
            plantName: def.name,
            seedKey: def.seedKey,
            herbKey: def.herbKey,
            status: "growing",
            plantedAt: now,
            matureAt: now + ev.matureAtOffsetMs,
            totalYield: ev.totalYield,
            stealCap: Math.floor(ev.totalYield * 0.5),
            stolen: 0,
            stolenBy: {},
            auraBy: {},
            eventName: ev.eventName,
            eventDesc: ev.eventDesc,
            eventType: ev.eventType,
            eventHandled: false,
        };
        persistLocalSave();
        return { ok: true, message: ev.eventName ? "种植成功，触发事件：" + ev.eventName : "种植成功" };
    }

    if (path.indexOf("/harvest") >= 0) {
        var plotIndexH = Math.floor(Number(body.plotIndex));
        if (!lt.unlocked) return { ok: false, message: "灵田尚未解锁" };
        if (!Number.isFinite(plotIndexH) || plotIndexH < 0 || plotIndexH >= lt.landCount) {
            return { ok: false, message: "地块不存在" };
        }
        var plotH = lt.plots[plotIndexH];
        if (!plotH || !plotH.plant) return { ok: false, message: "该地块无作物" };
        resolvePlotPlant(plotH, now);
        var pH = plotH.plant;
        if (pH.status !== "mature") {
            if (pH.status === "withered") {
                plotH.plant = null;
                persistLocalSave();
                return { ok: false, message: "灵植已枯萎，地块已清空。" };
            }
            return { ok: false, message: "灵植尚未成熟" };
        }
        var gain = Math.max(0, Math.floor(Number(pH.totalYield) || 0) - Math.floor(Number(pH.stolen) || 0));
        if (gain > 0) mats[pH.herbKey] = (Math.floor(Number(mats[pH.herbKey])) || 0) + gain;
        if (gain > 0) lt.reputation = Math.floor(Number(lt.reputation) || 0) + 1;
        var hybridRes = tryTriggerHybridOnHarvest(lt, plotIndexH, pH, now);
        plotH.plant = null;
        var msg = gain > 0 ? "收获 " + pH.plantName + " ×" + gain : "该株已被偷满，仅收回灵土";
        if (gain > 0) msg += "，声望+1";
        if (hybridRes && hybridRes.triggered && hybridRes.recipe) {
            msg += "；杂交成功，诞生「" + hybridRes.recipe.name + "」。";
        }
        persistLocalSave();
        return { ok: true, message: msg };
    }

    if (path.indexOf("/clear-withered") >= 0) {
        var plotIndexW = Math.floor(Number(body.plotIndex));
        if (!Number.isFinite(plotIndexW) || plotIndexW < 0 || plotIndexW >= lt.landCount) {
            return { ok: false, message: "地块不存在" };
        }
        var plotW = lt.plots[plotIndexW];
        if (!plotW || !plotW.plant || plotW.plant.status !== "withered") {
            return { ok: false, message: "该地块暂无枯萎灵植" };
        }
        plotW.plant = null;
        persistLocalSave();
        return { ok: true, message: "已清理枯萎灵植。" };
    }

    if (path.indexOf("/expand") >= 0) {
        if (!lt.unlocked) return { ok: false, message: "灵田尚未解锁" };
        if (lt.landCount >= MAX_PLOT_COUNT) return { ok: false, message: "灵田已扩展至上限" };
        var needLv = nextExpandNeedLevel(lt.landCount);
        if (Math.floor(Number(lt.maxHistoryLvl) || 0) < needLv) {
            return { ok: false, message: "需历史境界达到 " + needLv + " 级方可继续扩展" };
        }
        var expandCost = calcLingtianExpandEnhanceCost(lt.landCount);
        if (!spendEnhanceStone(expandCost)) {
            return { ok: false, message: "强化石不足（需 " + expandCost + "）" };
        }
        lt.landCount += 1;
        persistLocalSave();
        return { ok: true, message: "灵田扩展成功，消耗强化石 ×" + expandCost + "，当前地块：" + lt.landCount };
    }

    if (path.indexOf("/shop-exchange") >= 0) {
        var itemId = String(body.itemId || "").trim();
        var it = SHOP_ITEMS[itemId];
        if (!it) return { ok: false, message: "商店条目不存在" };
        if (!lt.unlocked) return { ok: false, message: "灵田尚未解锁" };
        if (lt.reputation < it.cost) return { ok: false, message: "灵田声望不足" };
        if (it.dailyLimit) {
            var bought = Math.floor(Number(lt.shopDaily.counts[itemId]) || 0);
            if (bought >= it.dailyLimit) return { ok: false, message: "该条目今日已达上限" };
        }
        if (it.weeklyLimit) {
            var boughtW = Math.floor(Number(lt.shopWeekly.counts[itemId]) || 0);
            if (boughtW >= it.weeklyLimit) return { ok: false, message: "该条目本周已达上限" };
        }
        lt.reputation -= it.cost;
        lt.shopDaily.counts[itemId] = (Math.floor(Number(lt.shopDaily.counts[itemId]) || 0)) + 1;
        lt.shopWeekly.counts[itemId] = (Math.floor(Number(lt.shopWeekly.counts[itemId]) || 0)) + 1;
        mats[it.grantMaterial] = (Math.floor(Number(mats[it.grantMaterial])) || 0) + (it.grantAmount || 1);
        var grantAmt = Math.floor(Number(it.grantAmount)) || 1;
        persistLocalSave();
        var grant = {};
        grant[it.grantMaterial] = grantAmt;
        return { ok: true, message: "兑换成功：" + it.name + " ×" + grantAmt, grant: grant };
    }

    if (path.indexOf("/use-mutate-charm") >= 0) {
        var haveMc = Math.floor(Number(mats.lt_mutate_charm) || 0);
        if (haveMc < 1) return { ok: false, message: "变异概率符不足" };
        mats.lt_mutate_charm = haveMc - 1;
        lt.hybridBoostCharges = (Math.floor(Number(lt.hybridBoostCharges)) || 0) + 1;
        persistLocalSave();
        return { ok: true, message: "已施展变异概率符：下一次杂交概率翻倍（上限 80%）。" };
    }

    if (path.indexOf("/use-herb") >= 0) {
        var herbKey = String(body.herbKey || "").trim();
        var reqCountRaw = Math.floor(Number(body.count) || 1);
        var ef = HERB_EFFECTS[herbKey];
        if (!ef) return { ok: false, message: "该灵药暂不可服用" };
        if (!lt.unlocked) return { ok: false, message: "灵田未解锁" };
        var haveH = Math.floor(Number(mats[herbKey]) || 0);
        if (haveH < 1) return { ok: false, message: "该灵药不足" };
        var count = Math.max(1, Math.min(haveH, reqCountRaw));
        mats[herbKey] = haveH - count;
        if (!player.lingtianCombatBuffs || typeof player.lingtianCombatBuffs !== "object") {
            player.lingtianCombatBuffs = {};
        }
        var cur = player.lingtianCombatBuffs[herbKey];
        var oldRem = cur && typeof cur === "object" ? Math.max(0, Math.floor(Number(cur.remaining) || 0)) : 0;
        var addRem = Math.max(1, Math.floor(Number(ef.combats) || 1)) * count;
        player.lingtianCombatBuffs[herbKey] = {
            name: ef.name,
            bonus: Object.assign({}, ef.bonus),
            remaining: oldRem + addRem,
        };
        persistLocalSave();
        return { ok: true, message: ef.name + "入体：已服用 " + count + " 份，加持场次已叠加。" };
    }

    if (path.indexOf("/buy-energy") >= 0) {
        if (Math.floor(Number(lt.energyDaily.buyCount) || 0) >= ENERGY_BUY_DAILY_LIMIT) {
            return { ok: false, message: "今日购买精力已达上限" };
        }
        if (!spendEnhanceStone(LT_ENERGY_BUY_ENHANCE_STONE)) {
            return { ok: false, message: "强化石不足（需 " + LT_ENERGY_BUY_ENHANCE_STONE + "）" };
        }
        lt.energyDaily.buyCount = Math.floor(Number(lt.energyDaily.buyCount) || 0) + 1;
        lt.energyDaily.amount = Math.floor(Number(lt.energyDaily.amount) || 0) + 1;
        persistLocalSave();
        return { ok: true, message: "已购入 1 点精力。" };
    }

    if (path.indexOf("/handle-event") >= 0) {
        var plotIndexE = Math.floor(Number(body.plotIndex));
        var mode = String(body.mode || "energy").trim();
        if (!Number.isFinite(plotIndexE) || plotIndexE < 0 || plotIndexE >= lt.landCount) {
            return { ok: false, message: "地块不存在" };
        }
        var plotE = lt.plots[plotIndexE];
        if (!plotE || !plotE.plant) return { ok: false, message: "该地块无作物" };
        var pE = plotE.plant;
        if (pE.status !== "growing") return { ok: false, message: "仅生长中的作物可处理异象" };
        if (!pE.eventType || pE.eventType === "light") return { ok: false, message: "该作物当前无可处理异象" };
        if (pE.eventHandled) return { ok: false, message: "该作物异象已处理" };
        if (mode === "energy") {
            if (Math.floor(Number(lt.energyDaily.amount) || 0) < 1) {
                return { ok: false, message: "精力不足，请先购买精力或使用符箓" };
            }
            lt.energyDaily.amount -= 1;
        } else if (mode === "talisman") {
            var tk = "";
            if (pE.eventType === "pest") tk = "lt_talisman_remove_pest";
            else if (pE.eventType === "drought") tk = "lt_talisman_water";
            else if (pE.eventType === "weed") tk = "lt_talisman_weed";
            var haveT = Math.floor(Number(mats[tk]) || 0);
            if (haveT < 1) return { ok: false, message: "对应符箓不足" };
            mats[tk] = haveT - 1;
        } else return { ok: false, message: "处理方式无效" };
        var fix2 = Math.floor(2 * GROWTH_TIME_MULT * 3600000);
        var fix4 = Math.floor(4 * GROWTH_TIME_MULT * 3600000);
        if (pE.eventType === "pest" || pE.eventType === "weed") {
            pE.matureAt = Math.max(Date.now(), Math.floor(Number(pE.matureAt) || Date.now()) - fix2);
        } else if (pE.eventType === "drought") {
            pE.matureAt = Math.max(Date.now(), Math.floor(Number(pE.matureAt) || Date.now()) - fix4);
        }
        pE.eventHandled = true;
        pE.eventDesc = "已处理：地脉恢复平稳。";
        persistLocalSave();
        return { ok: true, message: "异象已处理，成熟时间已回正。" };
    }

    return { ok: false, message: "未知操作" };
}

function handleLocalApi(method, path, body) {
    try {
        var p = String(path || "");
        if (method === "GET") {
            if (p.indexOf("/state") >= 0) return buildStateResponse();
            if (p.indexOf("/world-list") >= 0) {
                return {
                    ok: true,
                    filter: "mature",
                    page: 1,
                    pageSize: 10,
                    total: 0,
                    pageCount: 1,
                    items: [],
                    indexStats: { cachedAt: 0, running: false, buildMs: 0, fileCount: 0, lastError: "standalone" },
                };
            }
            if (p.indexOf("/visit/") >= 0) return { ok: false, message: "单机版暂无世界灵田探访功能" };
            return { ok: false, message: "未知请求" };
        }
        if (method === "POST") return handlePost(p, body);
        return { ok: false, message: "不支持的方法" };
    } catch (e) {
        return { ok: false, message: (e && e.message) || "灵田操作失败" };
    }
}

window.dongtianLingtianIsLocalMode = function () {
    return !window.DONGTIAN_CLOUD_MODE || !!window.__dongtianCloudLocalFallback;
};

window.dongtianLingtianLocalApi = function (method, path, body) {
    return Promise.resolve(handleLocalApi(method, path, body));
};

})();
