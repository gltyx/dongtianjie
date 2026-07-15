/**
 * 洞天劫 · 炼丹阁 · 单机本地逻辑（由 dongtian-alchemy-api.js 移植）
 */
(function () {
'use strict';

var UNLOCK_HIST_LEVEL = 30;
var INITIAL_FURNACE_COUNT = 3;
var MAX_FURNACE_COUNT = 12;
var UNLOCK_FURNACE_COST = 100;
var UNLOCK_FURNACE_COST_MATERIAL = 'enhance_stone';
/** 每种丹药账号共用服用上限（写入单机存档 dongtianAlchemy.pillUses） */
var PILL_USE_CAP_GLOBAL = 1000;

var RECIPES = [
  { id: 'jinling', herbKey: 'lt_herb_huiqicao', herbAmount: 30, hours: 6, pillKey: 'dt_pill_jinling', pillName: '金灵丹' },
  { id: 'shuiling', herbKey: 'lt_herb_ningluhua', herbAmount: 30, hours: 6, pillKey: 'dt_pill_shuiling', pillName: '水灵丹' },
  { id: 'tuling', herbKey: 'lt_herb_tufuling', herbAmount: 30, hours: 6, pillKey: 'dt_pill_tuling', pillName: '土灵丹' },
  { id: 'muling', herbKey: 'lt_herb_qinglingmu', herbAmount: 30, hours: 6, pillKey: 'dt_pill_muling', pillName: '木灵丹' },
  { id: 'huoling', herbKey: 'lt_herb_huazaoshu', herbAmount: 30, hours: 6, pillKey: 'dt_pill_huoling', pillName: '火灵丹' },
  { id: 'fengling', herbKey: 'lt_herb_fenglingcao', herbAmount: 30, hours: 12, pillKey: 'dt_pill_fengling', pillName: '风铃丹' },
  { id: 'jinteng', herbKey: 'lt_herb_jinxianteng', herbAmount: 30, hours: 12, pillKey: 'dt_pill_jinteng', pillName: '金藤丹' },
  { id: 'xuanbing', herbKey: 'lt_herb_xuanbinggu', herbAmount: 30, hours: 12, pillKey: 'dt_pill_xuanbing', pillName: '玄冰丹' },
  { id: 'xinlian', herbKey: 'lt_herb_bingxinlian', herbAmount: 30, hours: 12, pillKey: 'dt_pill_xinlian', pillName: '心莲丹' },
  { id: 'longxue', herbKey: 'lt_herb_longxueshu', herbAmount: 30, hours: 12, pillKey: 'dt_pill_longxue', pillName: '龙血丹' },
  { id: 'leishen', herbKey: 'lt_herb_leijizhu', herbAmount: 30, hours: 16, pillKey: 'dt_pill_leishen', pillName: '雷神丹' },
  { id: 'huanshen', herbKey: 'lt_herb_huanxinlan', herbAmount: 30, hours: 24, pillKey: 'dt_pill_huanshen', pillName: '幻神丹' },
];

var RECIPE_BY_ID = {};
for (var ri = 0; ri < RECIPES.length; ri++) {
  RECIPE_BY_ID[RECIPES[ri].id] = RECIPES[ri];
}

var PILL_ROOT_DELTA = {
  dt_pill_jinling: { metal: 1 },
  dt_pill_muling: { wood: 1 },
  dt_pill_shuiling: { water: 1 },
  dt_pill_huoling: { fire: 1 },
  dt_pill_tuling: { earth: 1 },
  dt_pill_fengling: { water: 2 },
  dt_pill_jinteng: { metal: 2 },
  dt_pill_xuanbing: { water: 2 },
  dt_pill_xinlian: { earth: 2 },
  dt_pill_longxue: { fire: 2 },
  dt_pill_leishen: { metal: 1, wood: 1, water: 1, fire: 1, earth: 1 },
  dt_pill_huanshen: { metal: 2, wood: 2, water: 2, fire: 2, earth: 2 },
};

var VALID_PILL_KEYS = {};
Object.keys(PILL_ROOT_DELTA).forEach(function (k) {
  VALID_PILL_KEYS[k] = true;
});

function persistLocalSave() {
  if (typeof saveData === 'function') saveData();
  if (typeof calculateStats === 'function') calculateStats();
  if (typeof playerLoadStats === 'function') playerLoadStats();
}

function ensureMaterials(player) {
  if (!player.inventory || typeof player.inventory !== 'object') player.inventory = {};
  if (!player.inventory.materials || typeof player.inventory.materials !== 'object') {
    player.inventory.materials = {};
  }
  return player.inventory.materials;
}

function getEnhanceStoneCount() {
  if (typeof player === 'undefined' || !player) return 0;
  var mats = ensureMaterials(player);
  return Math.max(0, Math.floor(Number(mats.enhance_stone) || 0));
}

function spendEnhanceStone(amount) {
  if (typeof player === 'undefined' || !player) return false;
  var need = Math.max(0, Math.floor(Number(amount) || 0));
  var mats = ensureMaterials(player);
  var have = Math.max(0, Math.floor(Number(mats.enhance_stone) || 0));
  if (have < need) return false;
  mats.enhance_stone = have - need;
  return true;
}

function getHistLevel(p) {
  return Math.max(
    Math.floor(Number(p && p.maxDungeonFloorLvl) || 0),
    Math.floor(Number(p && p.lvl) || 0)
  );
}

function nextFurnaceUnlockNeedHist(currentFurnaceCount) {
  var n = Math.floor(Number(currentFurnaceCount) || 0);
  if (n < INITIAL_FURNACE_COUNT) return UNLOCK_HIST_LEVEL;
  return UNLOCK_HIST_LEVEL + 10 * (n - 2);
}

function syncAlchemyLegacy(player, al) {
  if (!player || !al) return;
  var prev = player.dongtianAlchemy && typeof player.dongtianAlchemy === 'object' ? player.dongtianAlchemy : {};
  var pillUses = prev.pillUses && typeof prev.pillUses === 'object' ? prev.pillUses : {};
  player.dongtianAlchemy = {
    furnaceCount: al.furnaces.length,
    slots: al.activeJobs.slice(),
    pillUses: pillUses,
    _pillUsesMigrated: !!prev._pillUsesMigrated,
  };
}

function migrateLegacyAlchemy(player) {
  if (!player || typeof player !== 'object') return;
  var legacy = player.dongtianAlchemy;
  if (!legacy || typeof legacy !== 'object') return;
  if (player.alchemy && Array.isArray(player.alchemy.furnaces) && player.alchemy.furnaces.length > 0) return;
  var fc = Math.floor(Number(legacy.furnaceCount) || INITIAL_FURNACE_COUNT);
  if (fc < INITIAL_FURNACE_COUNT) fc = INITIAL_FURNACE_COUNT;
  if (fc > MAX_FURNACE_COUNT) fc = MAX_FURNACE_COUNT;
  var slots = Array.isArray(legacy.slots) ? legacy.slots : [];
  var furnaces = [];
  var activeJobs = [];
  for (var i = 0; i < fc; i++) {
    furnaces.push({ index: i, unlocked: true });
    activeJobs.push(slots[i] != null ? slots[i] : null);
  }
  player.alchemy = { furnaces: furnaces, activeJobs: activeJobs };
}

function normalizeJob(job) {
  if (job == null) return null;
  if (typeof job !== 'object') return null;
  if (!job.recipeId || typeof job.startedAt !== 'number' || typeof job.durationMs !== 'number') return null;
  return job;
}

function ensureAlchemyShape(player) {
  if (!player || typeof player !== 'object') return null;
  migrateLegacyAlchemy(player);
  if (!player.alchemy || typeof player.alchemy !== 'object') {
    player.alchemy = { furnaces: [], activeJobs: [] };
  }
  var al = player.alchemy;
  if (!Array.isArray(al.furnaces)) al.furnaces = [];
  if (!Array.isArray(al.activeJobs)) al.activeJobs = [];

  var fc = Math.max(al.furnaces.length, al.activeJobs.length, INITIAL_FURNACE_COUNT);
  if (fc > MAX_FURNACE_COUNT) fc = MAX_FURNACE_COUNT;
  while (al.furnaces.length < fc) {
    al.furnaces.push({ index: al.furnaces.length, unlocked: true });
  }
  while (al.activeJobs.length < fc) al.activeJobs.push(null);
  if (al.furnaces.length > fc) al.furnaces = al.furnaces.slice(0, fc);
  if (al.activeJobs.length > fc) al.activeJobs = al.activeJobs.slice(0, fc);

  for (var i = 0; i < al.activeJobs.length; i++) {
    al.activeJobs[i] = normalizeJob(al.activeJobs[i]);
    if (!al.furnaces[i] || typeof al.furnaces[i] !== 'object') {
      al.furnaces[i] = { index: i, unlocked: true };
    }
    al.furnaces[i].index = i;
    if (typeof al.furnaces[i].unlocked !== 'boolean') al.furnaces[i].unlocked = true;
  }

  syncAlchemyLegacy(player, al);
  return al;
}

function recipesPayload() {
  var out = [];
  for (var i = 0; i < RECIPES.length; i++) {
    var r = RECIPES[i];
    out.push({
      id: r.id,
      herbKey: r.herbKey,
      herbAmount: r.herbAmount,
      hours: r.hours,
      pillKey: r.pillKey,
      pillName: r.pillName,
    });
  }
  return out;
}

function ensurePetPillUses(pet) {
  if (!pet || typeof pet !== 'object') return;
  if (!pet.pillUses || typeof pet.pillUses !== 'object') pet.pillUses = {};
}

/** 账号共用已服计数；旧档按各宠 pet.pillUses 累加迁入一次 */
function ensureGlobalPillUses(player) {
  if (!player || typeof player !== 'object') return {};
  ensureAlchemyShape(player);
  if (!player.dongtianAlchemy || typeof player.dongtianAlchemy !== 'object') {
    player.dongtianAlchemy = { furnaceCount: INITIAL_FURNACE_COUNT, slots: [], pillUses: {} };
  }
  var al = player.dongtianAlchemy;
  if (!al.pillUses || typeof al.pillUses !== 'object') al.pillUses = {};
  if (al._pillUsesMigrated) return al.pillUses;
  var pets = Array.isArray(player.petCollection) ? player.petCollection : [];
  for (var i = 0; i < pets.length; i++) {
    var pet = pets[i];
    if (!pet || !pet.pillUses || typeof pet.pillUses !== 'object') continue;
    var keys = Object.keys(pet.pillUses);
    for (var j = 0; j < keys.length; j++) {
      var pk = keys[j];
      var n = Math.floor(Number(pet.pillUses[pk]) || 0);
      if (n <= 0) continue;
      al.pillUses[pk] = Math.floor(Number(al.pillUses[pk]) || 0) + n;
    }
  }
  al._pillUsesMigrated = true;
  return al.pillUses;
}

function applyPillRootsToPet(pet, pillKey) {
  var delta = PILL_ROOT_DELTA[pillKey];
  if (!delta || !pet.roots || typeof pet.roots !== 'object') return;
  var keys = ['metal', 'wood', 'water', 'fire', 'earth'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var d = Math.floor(Number(delta[k]) || 0);
    if (!d) continue;
    var cur = Math.floor(Number(pet.roots[k]) || 0);
    pet.roots[k] = Math.max(1, cur + d);
  }
}

function buildStateResponse() {
  if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
  var al = ensureAlchemyShape(player);
  if (!al) return { ok: false, message: '角色数据异常' };
  var hist = getHistLevel(player);
  var mats = ensureMaterials(player);
  return {
    ok: true,
    unlocked: hist >= UNLOCK_HIST_LEVEL,
    unlockNeedHist: UNLOCK_HIST_LEVEL,
    histLevel: hist,
    furnaceCount: al.furnaces.length,
    nextUnlockHist: al.furnaces.length >= MAX_FURNACE_COUNT ? null : nextFurnaceUnlockNeedHist(al.furnaces.length),
    unlockFurnaceCost: UNLOCK_FURNACE_COST,
    unlockFurnaceCostMaterial: UNLOCK_FURNACE_COST_MATERIAL,
    enhanceStone: getEnhanceStoneCount(),
    slots: al.activeJobs.slice(),
    recipes: recipesPayload(),
    materialsSnapshot: mats,
    localMode: true,
  };
}

function handlePost(path, body) {
  var now = Date.now();
  if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
  body = body && typeof body === 'object' ? body : {};
  var al = ensureAlchemyShape(player);
  var mats = ensureMaterials(player);
  var hist = getHistLevel(player);

  if (path.indexOf('/unlock-furnace') >= 0) {
    if (hist < UNLOCK_HIST_LEVEL) {
      return { ok: false, message: '历史境界未满 ' + UNLOCK_HIST_LEVEL + '，炼丹阁未开' };
    }
    if (al.furnaces.length >= MAX_FURNACE_COUNT) {
      return { ok: false, message: '炼丹炉已达上限（12）' };
    }
    var needHist = nextFurnaceUnlockNeedHist(al.furnaces.length);
    if (hist < needHist) {
      return { ok: false, message: '需历史境界达到 ' + needHist + ' 级方可解锁下一座炼丹炉' };
    }
    if (!spendEnhanceStone(UNLOCK_FURNACE_COST)) {
      return { ok: false, message: '强化石不足（需 ' + UNLOCK_FURNACE_COST + '）' };
    }
    al.furnaces.push({ index: al.furnaces.length, unlocked: true });
    al.activeJobs.push(null);
    syncAlchemyLegacy(player, al);
    persistLocalSave();
    return {
      ok: true,
      message: '已解锁一座炼丹炉，消耗强化石 ×' + UNLOCK_FURNACE_COST + '，当前共 ' + al.furnaces.length + ' 座',
    };
  }

  if (path.indexOf('/start') >= 0) {
    if (hist < UNLOCK_HIST_LEVEL) {
      return { ok: false, message: '历史境界未满 ' + UNLOCK_HIST_LEVEL + '，炼丹阁未开' };
    }
    var slotIndex = Math.floor(Number(body.slotIndex));
    var recipeId = String(body.recipeId || '').trim();
    if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= al.activeJobs.length) {
      return { ok: false, message: '炼丹炉序号无效' };
    }
    if (al.activeJobs[slotIndex] != null) {
      return { ok: false, message: '该炉正在炼制中' };
    }
    var recipe = RECIPE_BY_ID[recipeId];
    if (!recipe) return { ok: false, message: '丹方不存在' };
    var have = Math.floor(Number(mats[recipe.herbKey]) || 0);
    if (have < recipe.herbAmount) return { ok: false, message: '成熟灵药数量不足' };
    mats[recipe.herbKey] = have - recipe.herbAmount;
    al.activeJobs[slotIndex] = {
      recipeId: recipe.id,
      startedAt: now,
      durationMs: Math.floor(recipe.hours * 3600000),
      pillKey: recipe.pillKey,
      pillName: recipe.pillName,
    };
    syncAlchemyLegacy(player, al);
    persistLocalSave();
    return { ok: true, message: '已入炉炼化，功成后记得收取丹药' };
  }

  if (path.indexOf('/collect') >= 0 || path.indexOf('/claim') >= 0) {
    if (hist < UNLOCK_HIST_LEVEL) {
      return { ok: false, message: '历史境界未满 ' + UNLOCK_HIST_LEVEL + '，炼丹阁未开' };
    }
    var slotIndexC = Math.floor(Number(body.slotIndex));
    if (!Number.isFinite(slotIndexC) || slotIndexC < 0 || slotIndexC >= al.activeJobs.length) {
      return { ok: false, message: '炼丹炉序号无效' };
    }
    var job = al.activeJobs[slotIndexC];
    if (!job || typeof job !== 'object') return { ok: false, message: '该炉空闲' };
    var readyAt = Math.floor(Number(job.startedAt) || 0) + Math.floor(Number(job.durationMs) || 0);
    if (now < readyAt) return { ok: false, message: '炼化尚未完成' };
    var pillKey = String(job.pillKey || '').trim();
    if (!VALID_PILL_KEYS[pillKey]) {
      al.activeJobs[slotIndexC] = null;
      syncAlchemyLegacy(player, al);
      persistLocalSave();
      return { ok: false, message: '丹药数据异常，已清空该炉' };
    }
    mats[pillKey] = (Math.floor(Number(mats[pillKey]) || 0)) + 1;
    al.activeJobs[slotIndexC] = null;
    syncAlchemyLegacy(player, al);
    persistLocalSave();
    return {
      ok: true,
      message: '收取成功：' + (job.pillName || pillKey) + ' ×1',
      pillKey: pillKey,
    };
  }

  if (path.indexOf('/use-pill-on-pet') >= 0 || path.indexOf('/use-pill') >= 0) {
    if (hist < UNLOCK_HIST_LEVEL) {
      return { ok: false, message: '历史境界未满 ' + UNLOCK_HIST_LEVEL + '，无法使用炼丹阁丹药' };
    }
    var pillKeyU = String(body.pillKey || '').trim();
    if (!VALID_PILL_KEYS[pillKeyU]) return { ok: false, message: '丹药类型无效' };
    var inv = Math.floor(Number(mats[pillKeyU]) || 0);
    if (inv < 1) return { ok: false, message: '行囊中没有该丹药' };
    var pets = player.petCollection;
    if (!Array.isArray(pets) || !pets.length) return { ok: false, message: '尚无灵宠可服用' };
    var pillUses = ensureGlobalPillUses(player);
    var used = Math.floor(Number(pillUses[pillKeyU]) || 0);
    if (used >= PILL_USE_CAP_GLOBAL) {
      return { ok: false, message: '该丹药已达账号共用上限（' + PILL_USE_CAP_GLOBAL + '）' };
    }
    mats[pillKeyU] = inv - 1;
    pillUses[pillKeyU] = used + 1;
    var applied = 0;
    for (var pi = 0; pi < pets.length; pi++) {
      var pet = pets[pi];
      if (!pet) continue;
      ensurePetPillUses(pet);
      if (!pet.roots || typeof pet.roots !== 'object') pet.roots = {};
      applyPillRootsToPet(pet, pillKeyU);
      if (typeof rebuildPetBonusStats === 'function') rebuildPetBonusStats(pet);
      applied++;
    }
    if (applied < 1) return { ok: false, message: '尚无灵宠可服用' };
    syncAlchemyLegacy(player, al);
    persistLocalSave();
    return {
      ok: true,
      message: '丹药已化入全部灵宠灵根（' + applied + ' 只）',
      pillUses: pillUses,
    };
  }

  return { ok: false, message: '未知操作' };
}

function handleLocalApi(method, path, body) {
  try {
    var p = String(path || '');
    if (method === 'GET') {
      if (p.indexOf('/state') >= 0) return buildStateResponse();
      return { ok: false, message: '未知请求' };
    }
    if (method === 'POST') return handlePost(p, body);
    return { ok: false, message: '不支持的方法' };
  } catch (e) {
    return { ok: false, message: (e && e.message) || '炼丹阁操作失败' };
  }
}

window.dongtianAlchemyIsLocalMode = function () {
  return !window.DONGTIAN_CLOUD_MODE || !!window.__dongtianCloudLocalFallback;
};

window.dongtianAlchemyLocalApi = function (method, path, body) {
  return Promise.resolve(handleLocalApi(method, path, body));
};

})();
