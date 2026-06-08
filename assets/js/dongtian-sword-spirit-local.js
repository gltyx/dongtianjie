/**
 * 洞天劫 · 剑灵云游 · 单机本地逻辑（由 dongtian-sword-spirit-api.js 移植）
 * 依赖 dongtian-sword-spirit-data-bundled.js（window.DT_SS_BUNDLE）
 */
(function () {
'use strict';

var DREAM_COST_ENHANCE_STONE = 20;

function getBundle() {
  return window.DT_SS_BUNDLE && typeof window.DT_SS_BUNDLE === 'object' ? window.DT_SS_BUNDLE : {};
}

function bundleVal(key, fallback) {
  var b = getBundle();
  return b[key] != null ? b[key] : fallback;
}

var ALLOWED_PACK_KEYS = bundleVal('ALLOWED_PACK_KEYS', {
  life_potion: { max: 20, weight: 1 },
  gem_material_pack: { max: 10, weight: 3 },
  yuqi_material_pack: { max: 10, weight: 3 },
  enhance_stone: { max: 200, weight: 0.2 },
  enchant_stone: { max: 200, weight: 0.2 },
  god_essence_stone: { max: 80, weight: 0.5 },
  pet_exp_fruit: { max: 15, weight: 2 },
});

var MAX_PACK_TOTAL = bundleVal('MAX_PACK_TOTAL', 40);
var MIN_TRIP_MS = bundleVal('MIN_TRIP_MS', 30 * 60 * 1000);
var MAX_TRIP_MS = bundleVal('MAX_TRIP_MS', 7 * 24 * 60 * 60 * 1000);
var SWORD_SPIRIT_LOG_COUNT_MULT = bundleVal('SWORD_SPIRIT_LOG_COUNT_MULT', 3);
var SWORD_SPIRIT_LOG_MS_PER_LOG = bundleVal('SWORD_SPIRIT_LOG_MS_PER_LOG', 50 * 60 * 1000);
var SWORD_SPIRIT_LOG_COUNT_CAP = bundleVal('SWORD_SPIRIT_LOG_COUNT_CAP', 200);
var SWORD_SPIRIT_RETURN_REWARD_MULT = bundleVal('SWORD_SPIRIT_RETURN_REWARD_MULT', 30);
var SWORD_SPIRIT_DAY1_MATERIAL_DIVISOR = bundleVal('SWORD_SPIRIT_DAY1_MATERIAL_DIVISOR', 3);
var NETWORK_COIN_TRIP_MIN = bundleVal('NETWORK_COIN_TRIP_MIN', 1);
var NETWORK_COIN_TRIP_MAX = bundleVal('NETWORK_COIN_TRIP_MAX', 336);

var CURIO_QUALITY_ZH = bundleVal('CURIO_QUALITY_ZH', {
  common: '凡品',
  fine: '良品',
  rare: '珍品',
  epic: '绝品',
  mythic: '劫品',
});

var CURIO_QUALITY_WEIGHT = {
  common: 1,
  fine: 0.38,
  rare: 0.135,
  epic: 0.041,
  mythic: 0.011,
};

function getCurioDefs() {
  var defs = bundleVal('CURIO_DEFS', []);
  return Array.isArray(defs) ? defs : [];
}

function curioDefById(id) {
  var s = String(id || '').trim();
  var defs = getCurioDefs();
  for (var i = 0; i < defs.length; i++) {
    if (defs[i] && defs[i].id === s) return defs[i];
  }
  return null;
}

function aggregateCurioBonusesFromList(curios) {
  var out = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
  if (!Array.isArray(curios)) return out;
  for (var i = 0; i < curios.length; i++) {
    var row = curios[i];
    var id = row && row.id != null ? String(row.id).trim() : '';
    var d = curioDefById(id);
    if (!d || !d.bonus) continue;
    var b = d.bonus;
    Object.keys(out).forEach(function (k) {
      var v = Number(b[k]);
      if (Number.isFinite(v)) out[k] += v;
    });
  }
  return out;
}

function curioCatalogPayload() {
  var defs = getCurioDefs();
  var out = [];
  for (var i = 0; i < defs.length; i++) {
    var c = defs[i];
    if (!c || !c.id) continue;
    var q = c.quality || 'common';
    out.push({
      id: c.id,
      name: c.name,
      bonus: c.bonus,
      quality: q,
      qualityLabel: CURIO_QUALITY_ZH[q] || CURIO_QUALITY_ZH.common,
    });
  }
  return out;
}

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

function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTripDurationMs(rng) {
  var u = rng();
  if (u < 0.38) return MIN_TRIP_MS + Math.floor(rng() * (6 * 60 * 60 * 1000 - MIN_TRIP_MS));
  if (u < 0.72) return 6 * 60 * 60 * 1000 + Math.floor(rng() * 42 * 60 * 60 * 1000);
  if (u < 0.92) return 48 * 60 * 60 * 1000 + Math.floor(rng() * (5 * 24 * 60 * 60 * 1000 - 48 * 60 * 60 * 1000));
  return 5 * 24 * 60 * 60 * 1000 + Math.floor(rng() * (MAX_TRIP_MS - 5 * 24 * 60 * 60 * 1000));
}

function syncSwordSpiritLegacy(player, s) {
  if (!player || !s) return;
  player.dongtianSwordSpirit = JSON.parse(JSON.stringify(s));
}

function migrateLegacySwordSpirit(player) {
  if (!player || typeof player !== 'object') return;
  if (player.swordSpiritTravel && typeof player.swordSpiritTravel === 'object') return;
  if (player.dongtianSwordSpirit && typeof player.dongtianSwordSpirit === 'object') {
    player.swordSpiritTravel = JSON.parse(JSON.stringify(player.dongtianSwordSpirit));
  }
}

function ensureSwordSpiritShape(p) {
  if (!p || typeof p !== 'object') return null;
  migrateLegacySwordSpirit(p);
  if (!p.swordSpiritTravel || typeof p.swordSpiritTravel !== 'object') {
    p.swordSpiritTravel = {};
  }
  var s = p.swordSpiritTravel;
  if (['idle', 'traveling', 'returned'].indexOf(s.phase) < 0) s.phase = 'idle';
  if (typeof s.startedAt !== 'number' || isNaN(s.startedAt)) s.startedAt = 0;
  if (typeof s.returnAt !== 'number' || isNaN(s.returnAt)) s.returnAt = 0;
  if (typeof s.seed !== 'number' || isNaN(s.seed)) s.seed = 0;
  if (!Array.isArray(s.logs)) s.logs = [];
  if (!s.pendingRewards || typeof s.pendingRewards !== 'object') {
    s.pendingRewards = { materials: {}, networkCoin: 0, newCurio: null, newCurios: [], curioRollCount: 0 };
  }
  if (!s.pendingRewards.materials || typeof s.pendingRewards.materials !== 'object') {
    s.pendingRewards.materials = {};
  }
  if (typeof s.pendingRewards.networkCoin !== 'number' || isNaN(s.pendingRewards.networkCoin)) {
    s.pendingRewards.networkCoin = 0;
  }
  if (s.pendingRewards.newCurio != null && typeof s.pendingRewards.newCurio !== 'object') {
    s.pendingRewards.newCurio = null;
  }
  if (!Array.isArray(s.pendingRewards.newCurios)) s.pendingRewards.newCurios = [];
  if (typeof s.pendingRewards.curioRollCount !== 'number' || isNaN(s.pendingRewards.curioRollCount)) {
    s.pendingRewards.curioRollCount = 0;
  }
  if (s.pendingRewards.newCurio && s.pendingRewards.newCurio.id && (!s.pendingRewards.newCurios || !s.pendingRewards.newCurios.length)) {
    s.pendingRewards.newCurios = [{ id: String(s.pendingRewards.newCurio.id).trim() }];
  }
  if (!Array.isArray(s.curios)) s.curios = [];
  var cleaned = [];
  for (var ci = 0; ci < s.curios.length; ci++) {
    var row = s.curios[ci];
    if (!row || typeof row !== 'object') continue;
    var id = String(row.id || '').trim();
    if (!id || !curioDefById(id)) continue;
    cleaned.push({ id: id, at: typeof row.at === 'number' && !isNaN(row.at) ? row.at : Date.now() });
  }
  s.curios = cleaned;
  if (!Array.isArray(s.dreamMessages)) s.dreamMessages = [];
  if (typeof s.dreamHint !== 'string') s.dreamHint = '';
  if (typeof s.packValue !== 'number' || isNaN(s.packValue)) s.packValue = 0;
  if (typeof s.maxFloorSnap !== 'number' || isNaN(s.maxFloorSnap)) s.maxFloorSnap = 1;
  syncSwordSpiritLegacy(p, s);
  return s;
}

function buildLogsForTrip(seed, startedAt, returnAt) {
  var rng = mulberry32((seed >>> 0) ^ 0x9e3779b9);
  var totalMs = Math.max(1, returnAt - startedAt);
  var dayPart = Math.ceil(totalMs / (24 * 60 * 60 * 1000)) + 2;
  var countByDay = dayPart * SWORD_SPIRIT_LOG_COUNT_MULT;
  var countByDuration = Math.ceil(totalMs / SWORD_SPIRIT_LOG_MS_PER_LOG);
  var approxDays = Math.max(3, Math.min(SWORD_SPIRIT_LOG_COUNT_CAP, Math.max(countByDay, countByDuration)));
  var logs = [];
  var used = {};
  var QIWEN = bundleVal('QIWEN_LOG_TEMPLATES', []);
  var LOG_TEMPLATES = bundleVal('LOG_TEMPLATES', []);
  var RARE_LOGS = bundleVal('RARE_LOGS', []);

  for (var i = 0; i < approxDays; i++) {
    var d = i + 1;
    var line = '';
    var branch = rng();
    if (branch < 0.16 && QIWEN.length) {
      var triesQ = 0;
      do {
        var idxQ = Math.floor(rng() * QIWEN.length);
        line = String(QIWEN[idxQ]).replace('{d}', String(d));
        triesQ++;
      } while (used[line] && triesQ < 18);
      used[line] = true;
    } else if (branch < 0.32 && RARE_LOGS.length) {
      var tw = 0;
      for (var rw = 0; rw < RARE_LOGS.length; rw++) tw += Math.floor(Number(RARE_LOGS[rw].w) || 1);
      var rr = rng() * tw;
      for (var rj = 0; rj < RARE_LOGS.length; rj++) {
        rr -= Math.floor(Number(RARE_LOGS[rj].w) || 1);
        if (rr <= 0) {
          line = String(RARE_LOGS[rj].text).replace('{d}', String(d));
          break;
        }
      }
    }
    if (!line && LOG_TEMPLATES.length) {
      var tries = 0;
      do {
        var idx = Math.floor(rng() * LOG_TEMPLATES.length);
        line = String(LOG_TEMPLATES[idx]).replace('{d}', String(d));
        tries++;
      } while (used[line] && tries < 18);
      used[line] = true;
    }
    if (line) logs.push({ day: d, text: line, at: startedAt + Math.floor((totalMs * (i + 0.5)) / approxDays) });
  }
  logs.sort(function (a, b) {
    return a.at - b.at;
  });
  return logs;
}

function curioQualityRollWeight(quality, tier) {
  var q = typeof quality === 'string' && CURIO_QUALITY_WEIGHT[quality] != null ? quality : 'common';
  var w = CURIO_QUALITY_WEIGHT[q];
  var t = Math.max(0, tier - 0.55);
  if (q === 'mythic') w *= 1 + t * 0.42;
  else if (q === 'epic') w *= 1 + t * 0.26;
  else if (q === 'rare') w *= 1 + t * 0.14;
  return w;
}

function curioRollAttemptsFromTripMs(tripMs) {
  var DAY_MS = 24 * 60 * 60 * 1000;
  var ms = Math.max(1, Number(tripMs) || 0);
  if (ms < DAY_MS) return 1;
  return Math.min(7, 1 + Math.floor(ms / DAY_MS));
}

function materialReturnTripMultFromTripMs(tripMs) {
  var DAY_MS = 24 * 60 * 60 * 1000;
  var ms = Math.max(1, Number(tripMs) || 0);
  if (ms < DAY_MS) return 1 / SWORD_SPIRIT_DAY1_MATERIAL_DIVISOR;
  var d = Math.min(7, Math.max(1, Math.ceil(ms / DAY_MS)));
  return 1 + Math.max(0, d - 1) * 0.2;
}

function rollCurioDrop(rng, tier, ownedIds) {
  var chance = Math.min(1, 6 * Math.min(0.24, 0.068 + tier * 0.034));
  if (rng() > chance) return null;
  var owned = {};
  for (var oi = 0; oi < (ownedIds || []).length; oi++) {
    owned[String(ownedIds[oi] || '').trim()] = true;
  }
  var defs = getCurioDefs();
  var pool = [];
  for (var pi = 0; pi < defs.length; pi++) {
    var c = defs[pi];
    if (c && c.id && !owned[c.id]) pool.push(c);
  }
  if (!pool.length) return null;
  var totalW = 0;
  var weights = [];
  for (var wi = 0; wi < pool.length; wi++) {
    var ww = curioQualityRollWeight(pool[wi] && pool[wi].quality, tier);
    weights.push(ww);
    totalW += ww;
  }
  var r = rng() * totalW;
  for (var ri = 0; ri < pool.length; ri++) {
    r -= weights[ri];
    if (r <= 0) return pool[ri].id;
  }
  return pool[pool.length - 1].id;
}

function rollPendingCuriosForTrip(rng, tier, ownedCurioIds, tripMs) {
  var rollCount = curioRollAttemptsFromTripMs(tripMs);
  var owned = {};
  for (var i = 0; i < (ownedCurioIds || []).length; i++) {
    owned[String(ownedCurioIds[i] || '').trim()] = true;
  }
  var ownedList = Object.keys(owned);
  var newCurios = [];
  for (var j = 0; j < rollCount; j++) {
    var id = rollCurioDrop(rng, tier, ownedList);
    if (id) {
      var sid = String(id).trim();
      newCurios.push({ id: sid });
      ownedList.push(sid);
      owned[sid] = true;
    }
  }
  return { newCurios: newCurios, curioRollCount: rollCount };
}

function yuqiPackFromTripDurationMs(tripMs) {
  var raw = Number(tripMs);
  var dur = !Number.isFinite(raw) || raw <= 0 ? MIN_TRIP_MS : Math.max(MIN_TRIP_MS, Math.min(MAX_TRIP_MS, raw));
  var span = MAX_TRIP_MS - MIN_TRIP_MS;
  var t = span <= 0 ? 0 : (dur - MIN_TRIP_MS) / span;
  var n = Math.floor(NETWORK_COIN_TRIP_MIN + t * (NETWORK_COIN_TRIP_MAX - NETWORK_COIN_TRIP_MIN));
  return Math.min(NETWORK_COIN_TRIP_MAX, Math.max(NETWORK_COIN_TRIP_MIN, n));
}

function rollReturnRewards(rng, maxFloor, packValue, dreamHint, ownedCurioIds, tripDurationMs) {
  var mats = {};
  var floorB = Math.max(1, Math.min(80, Math.floor(maxFloor)));
  var tier = Math.min(1.8, 0.55 + floorB * 0.018 + packValue * 0.012 + (dreamHint ? 0.08 : 0));

  if (rng() < 0.45 * tier) mats.gem_material_pack = 1 + (rng() < 0.25 ? 1 : 0);
  if (rng() < 0.42 * tier) mats.yuqi_material_pack = 1 + (rng() < 0.2 ? 1 : 0);
  if (rng() < 0.5 * tier) {
    var n = 5 + Math.floor(rng() * 25 * tier);
    mats.enhance_stone = (mats.enhance_stone || 0) + n;
  }
  if (rng() < 0.45 * tier) {
    var n2 = 5 + Math.floor(rng() * 22 * tier);
    mats.enchant_stone = (mats.enchant_stone || 0) + n2;
  }
  if (rng() < 0.38 * tier) {
    var n3 = 1 + (rng() < 0.15 ? 2 : 0);
    mats.god_essence_stone = (mats.god_essence_stone || 0) + n3;
  }
  if (rng() < 0.35 * tier) mats.pet_exp_fruit = 1 + (rng() < 0.12 ? 1 : 0);
  if (rng() < 0.08 * tier) mats.life_potion = (mats.life_potion || 0) + 1;

  if (rng() < 0.04 + packValue * 0.003) {
    mats.gem_material_pack = (mats.gem_material_pack || 0) + 2;
    mats.yuqi_material_pack = (mats.yuqi_material_pack || 0) + 1;
    mats.god_essence_stone = (mats.god_essence_stone || 0) + 2;
  }

  var curioRoll = rollPendingCuriosForTrip(rng, tier, ownedCurioIds, tripDurationMs);
  var newCurios = curioRoll.newCurios;
  var newCurio = newCurios.length ? newCurios[0] : null;

  var mult = SWORD_SPIRIT_RETURN_REWARD_MULT;
  var tripDaysMult = materialReturnTripMultFromTripMs(tripDurationMs);
  var scaledMats = {};
  Object.keys(mats).forEach(function (k) {
    var num = Math.floor((Number(mats[k]) || 0) * mult * tripDaysMult);
    if (num > 0) scaledMats[k] = num;
  });

  var yuqiBonus = yuqiPackFromTripDurationMs(tripDurationMs);
  if (yuqiBonus > 0) {
    scaledMats.yuqi_material_pack = (Math.floor(Number(scaledMats.yuqi_material_pack) || 0)) + yuqiBonus;
  }

  return {
    materials: scaledMats,
    networkCoin: 0,
    yuqiPackGiven: yuqiBonus,
    newCurio: newCurio,
    newCurios: newCurios,
    curioRollCount: curioRoll.curioRollCount,
  };
}

function mergeRewardsIntoMaterials(dst, src) {
  Object.keys(src).forEach(function (k) {
    var n = parseInt(src[k], 10) || 0;
    if (n <= 0) return;
    dst[k] = (parseInt(dst[k], 10) || 0) + n;
  });
}

function materialLabelZh(key) {
  var map = {
    life_potion: '生命药剂',
    gem_material_pack: '宝石材料包',
    yuqi_material_pack: '御器材料包',
    enhance_stone: '强化石',
    enchant_stone: '附魔石',
    god_essence_stone: '神萃石',
    pet_exp_fruit: '灵宠经验果实',
  };
  return map[key] || key;
}

function resolveTripIfDue(now) {
  if (typeof player === 'undefined' || !player) return false;
  var s = ensureSwordSpiritShape(player);
  if (!s || s.phase !== 'traveling') return false;
  if (now < s.returnAt) return false;
  var rng = mulberry32((s.seed >>> 0) ^ 0x85ebca6b);
  var ownedCurioIds = [];
  for (var i = 0; i < (s.curios || []).length; i++) {
    if (s.curios[i] && s.curios[i].id) ownedCurioIds.push(s.curios[i].id);
  }
  var tripMs =
    typeof s.startedAt === 'number' && typeof s.returnAt === 'number' && !isNaN(s.startedAt) && !isNaN(s.returnAt) && s.returnAt > s.startedAt
      ? s.returnAt - s.startedAt
      : MIN_TRIP_MS;
  s.pendingRewards = rollReturnRewards(rng, s.maxFloorSnap, s.packValue, s.dreamHint, ownedCurioIds, tripMs);
  s.phase = 'returned';
  syncSwordSpiritLegacy(player, s);
  return true;
}

function sanitizePacking(body) {
  var raw = body && body.packing && typeof body.packing === 'object' ? body.packing : {};
  var out = {};
  var total = 0;
  var packValue = 0;
  Object.keys(raw).forEach(function (k) {
    var key = String(k).trim();
    var def = ALLOWED_PACK_KEYS[key];
    if (!def) return;
    var n = Math.min(def.max, Math.max(0, Math.floor(Number(raw[key]))));
    if (!Number.isFinite(n) || n <= 0) return;
    total += n;
    out[key] = n;
    packValue += n * def.weight;
  });
  if (total > MAX_PACK_TOTAL) return { ok: false, message: '行囊总数不能超过 ' + MAX_PACK_TOTAL };
  return { ok: true, packing: out, packValue: packValue, total: total };
}

function mapPendingCuriosOut(pr) {
  var pendingOut = {
    materials: pr.materials || {},
    networkCoin: 0,
    newCurio: null,
    newCurios: [],
    curioRollCount: typeof pr.curioRollCount === 'number' && !isNaN(pr.curioRollCount) ? pr.curioRollCount : 0,
    yuqiPackGiven: Math.floor(Number(pr.yuqiPackGiven) || 0),
  };
  var rawRows = Array.isArray(pr.newCurios) && pr.newCurios.length
    ? pr.newCurios
    : pr.newCurio && pr.newCurio.id
      ? [pr.newCurio]
      : [];
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row.id) continue;
    var def = curioDefById(row.id);
    var q = def && def.quality ? def.quality : 'common';
    pendingOut.newCurios.push(
      def
        ? {
            id: def.id,
            name: def.name,
            lore: def.lore,
            bonus: def.bonus,
            quality: q,
            qualityLabel: CURIO_QUALITY_ZH[q] || CURIO_QUALITY_ZH.common,
          }
        : { id: String(row.id) }
    );
  }
  pendingOut.newCurio = pendingOut.newCurios[0] || null;
  return pendingOut;
}

function buildStateResponse() {
  if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
  ensureMaterials(player);
  var s = ensureSwordSpiritShape(player);
  var now = Date.now();
  resolveTripIfDue(now);
  var mats = ensureMaterials(player);
  var packingCap = {};
  Object.keys(ALLOWED_PACK_KEYS).forEach(function (k) {
    packingCap[k] = Math.min(ALLOWED_PACK_KEYS[k].max, Math.max(0, parseInt(mats[k], 10) || 0));
  });
  var maxF = typeof player.maxDungeonFloor === 'number' && !isNaN(player.maxDungeonFloor)
    ? Math.floor(player.maxDungeonFloor)
    : 1;
  var visibleLogs = (s.logs || []).filter(function (row) {
    return now >= (row.at || 0);
  });
  var etaMs = 0;
  if (s.phase === 'traveling' && s.returnAt > now) etaMs = s.returnAt - now;

  var pendingOut = null;
  if (s.phase === 'returned' && s.pendingRewards) {
    pendingOut = mapPendingCuriosOut(s.pendingRewards);
    if (!pendingOut.curioRollCount && s.startedAt > 0 && s.returnAt > s.startedAt) {
      pendingOut.curioRollCount = curioRollAttemptsFromTripMs(s.returnAt - s.startedAt);
    }
  }

  var curiosOut = (s.curios || []).map(function (row) {
    var def = curioDefById(row.id);
    if (!def) return { id: row.id, at: row.at };
    var q = def.quality || 'common';
    return {
      id: row.id,
      at: row.at,
      name: def.name,
      lore: def.lore,
      bonus: def.bonus,
      quality: q,
      qualityLabel: CURIO_QUALITY_ZH[q] || CURIO_QUALITY_ZH.common,
    };
  });

  return {
    ok: true,
    phase: s.phase,
    startedAt: s.startedAt,
    returnAt: s.returnAt,
    etaMs: etaMs,
    logs: visibleLogs.slice(-200),
    pendingRewards: pendingOut,
    curios: curiosOut,
    curioCount: curiosOut.length,
    curioBonus: aggregateCurioBonusesFromList(s.curios || []),
    curioTotalKinds: getCurioDefs().length,
    packingCap: packingCap,
    dreamMessages: (s.dreamMessages || []).slice(-8),
    dreamCostCoin: DREAM_COST_ENHANCE_STONE,
    dreamCostEnhanceStone: DREAM_COST_ENHANCE_STONE,
    dreamCostMaterial: 'enhance_stone',
    enhanceStone: getEnhanceStoneCount(),
    maxDungeonFloor: maxF,
    coinAmount: 0,
    localMode: true,
  };
}

function applyCollectRewards() {
  if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
  ensureMaterials(player);
  var s = ensureSwordSpiritShape(player);
  resolveTripIfDue(Date.now());
  if (s.phase !== 'returned') return { ok: false, message: '剑灵尚未归来，或已领取过收获' };

  var pr = s.pendingRewards || { materials: {}, networkCoin: 0, newCurio: null, newCurios: [], curioRollCount: 0 };
  var m = player.inventory.materials;
  mergeRewardsIntoMaterials(m, pr.materials || {});

  var curioGiven = null;
  var curiosGiven = [];
  var rawCurioRows = Array.isArray(pr.newCurios) && pr.newCurios.length
    ? pr.newCurios
    : pr.newCurio && pr.newCurio.id
      ? [pr.newCurio]
      : [];
  for (var ci = 0; ci < rawCurioRows.length; ci++) {
    var row = rawCurioRows[ci];
    var cid = String(row && row.id != null ? row.id : '').trim();
    if (!cid) continue;
    var def = curioDefById(cid);
    if (!def) continue;
    var has = false;
    for (var hi = 0; hi < (s.curios || []).length; hi++) {
      if (s.curios[hi] && String(s.curios[hi].id) === cid) {
        has = true;
        break;
      }
    }
    if (has) continue;
    if (!Array.isArray(s.curios)) s.curios = [];
    s.curios.push({ id: cid, at: Date.now() });
    var q = def.quality || 'common';
    var one = {
      id: cid,
      name: def.name,
      lore: def.lore,
      bonus: def.bonus,
      quality: q,
      qualityLabel: CURIO_QUALITY_ZH[q] || CURIO_QUALITY_ZH.common,
    };
    curiosGiven.push(one);
    if (!curioGiven) curioGiven = one;
  }

  s.phase = 'idle';
  s.startedAt = 0;
  s.returnAt = 0;
  s.seed = 0;
  s.logs = [];
  s.pendingRewards = { materials: {}, networkCoin: 0, newCurio: null, newCurios: [], curioRollCount: 0 };
  s.dreamHint = '';
  s.dreamMessages = [];
  s.packValue = 0;
  syncSwordSpiritLegacy(player, s);
  persistLocalSave();

  return {
    ok: true,
    message: '收获已纳入行囊（御器材料包等劫尘）。',
    coinGiven: 0,
    yuqiPackGiven: Math.floor(Number(pr.yuqiPackGiven) || 0),
    materialsGiven: pr.materials || {},
    curioGiven: curioGiven,
    curiosGiven: curiosGiven,
  };
}

function handlePost(path, body) {
  if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
  body = body && typeof body === 'object' ? body : {};
  var s = ensureSwordSpiritShape(player);
  var now = Date.now();

  if (path.indexOf('/start-trip') >= 0 || path.indexOf('/depart') >= 0) {
    var pack = sanitizePacking(body);
    if (!pack.ok) return { ok: false, message: pack.message };
    if (s.phase === 'traveling') return { ok: false, message: '剑灵已在云游途中' };
    if (s.phase === 'returned') return { ok: false, message: '请先领取归来收获，再送剑灵出行' };
    var keys = Object.keys(pack.packing);
    if (keys.length === 0) return { ok: false, message: '请至少放入一件行囊物资（丹药或材料）' };
    var m = ensureMaterials(player);
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      var need = pack.packing[k];
      var have = parseInt(m[k], 10) || 0;
      if (have < need) return { ok: false, message: '「' + materialLabelZh(k) + '」数量不足' };
    }
    for (var kj = 0; kj < keys.length; kj++) {
      var k2 = keys[kj];
      var need2 = pack.packing[k2];
      m[k2] = (parseInt(m[k2], 10) || 0) - need2;
      if (m[k2] <= 0) delete m[k2];
    }

    var rng = mulberry32((Math.floor(Math.random() * 0xffffffff) >>> 0) ^ 0x1315423911);
    var duration = pickTripDurationMs(rng);
    var seed = Math.floor(rng() * 0x7fffffff);
    var returnAt = now + duration;
    var maxF = typeof player.maxDungeonFloor === 'number' && !isNaN(player.maxDungeonFloor)
      ? Math.floor(player.maxDungeonFloor)
      : 1;

    s.phase = 'traveling';
    s.startedAt = now;
    s.returnAt = returnAt;
    s.seed = seed;
    s.packValue = pack.packValue;
    s.maxFloorSnap = maxF;
    s.dreamHint = '';
    s.dreamMessages = [];
    s.pendingRewards = { materials: {}, networkCoin: 0, newCurio: null, newCurios: [], curioRollCount: 0 };
    s.logs = buildLogsForTrip(seed, now, returnAt);
    syncSwordSpiritLegacy(player, s);
    persistLocalSave();
    var state = buildStateResponse();
    state.message = '剑灵已携行囊远去，归期无定，且待纪闻。';
    return state;
  }

  if (path.indexOf('/collect') >= 0) {
    var r = applyCollectRewards();
    if (!r.ok) return r;
    var stateC = buildStateResponse();
    stateC.message = r.message;
    stateC.coinGiven = r.coinGiven;
    stateC.yuqiPackGiven = r.yuqiPackGiven;
    stateC.materialsGiven = r.materialsGiven;
    stateC.curioGiven = r.curioGiven;
    stateC.curiosGiven = r.curiosGiven;
    return stateC;
  }

  if (path.indexOf('/tuomeng') >= 0 || path.indexOf('/dream') >= 0) {
    var hint = String(body.hint != null ? body.hint : '').trim();
    var allowed = { east: '往东', west: '往西', care: '小心', return: '早归' };
    if (!allowed[hint]) return { ok: false, message: '托梦方向无效' };
    resolveTripIfDue(now);
    if (s.phase !== 'traveling') return { ok: false, message: '仅云游途中可托梦' };
    if (!spendEnhanceStone(DREAM_COST_ENHANCE_STONE)) {
      return { ok: false, message: '强化石不足，托梦需 ' + DREAM_COST_ENHANCE_STONE + ' 强化石' };
    }
    s.dreamHint = hint;
    var dreamMsg =
      '你神识化梦，嘱其「' +
      allowed[hint] +
      '」。剑灵是否听从，且看归来纪闻——它未必全听你的。';
    if (!Array.isArray(s.dreamMessages)) s.dreamMessages = [];
    s.dreamMessages.push({ at: now, text: dreamMsg });
    if (s.dreamMessages.length > 20) s.dreamMessages = s.dreamMessages.slice(s.dreamMessages.length - 20);

    var senderEcho = {
      east: '云游纪闻：你嘱往东，它却在西边听见一缕剑吟，犹豫片刻，还是循声而去。',
      west: '云游纪闻：你嘱往西，它行至半途，见东天云开一线，竟驻足良久。',
      care: '云游纪闻：你嘱小心，它敛了锋芒，连过路樵夫都未察觉其存在。',
      return: '云游纪闻：你唤早归，它把这句话系在剑穗上，脚步却仍向劫尘深处。',
    };
    var echo = senderEcho[hint] || '云游纪闻：梦中一语，剑灵似有所感，又似未闻。';
    if (!Array.isArray(s.logs)) s.logs = [];
    s.logs.push({ day: 0, text: echo, at: now });
    if (s.logs.length > 220) s.logs = s.logs.slice(-220);
    syncSwordSpiritLegacy(player, s);
    persistLocalSave();
    var stateD = buildStateResponse();
    stateD.message = dreamMsg;
    return stateD;
  }

  return { ok: false, message: '未知操作' };
}

function handleLocalApi(method, path, body) {
  try {
    var p = String(path || '');
    if (method === 'GET') {
      if (p.indexOf('/state') >= 0) return buildStateResponse();
      if (p.indexOf('/curio-catalog') >= 0) {
        return { ok: true, defs: curioCatalogPayload() };
      }
      return { ok: false, message: '未知请求' };
    }
    if (method === 'POST') return handlePost(p, body);
    return { ok: false, message: '不支持的方法' };
  } catch (e) {
    return { ok: false, message: (e && e.message) || '剑灵云游操作失败' };
  }
}

window.dongtianSwordSpiritIsLocalMode = function () {
  return !window.DONGTIAN_CLOUD_MODE || !!window.__dongtianCloudLocalFallback;
};

window.dongtianSwordSpiritLocalApi = function (method, path, body) {
  return Promise.resolve(handleLocalApi(method, path, body));
};

})();
