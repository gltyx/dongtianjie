/**
 * 洞天劫 · 藏宝图 · 单机本地逻辑（由 dongtian-treasure-map-api.js + shared 移植）
 */
(function () {
'use strict';

var MAX_MAPS = 200;
var BATTLE_TTL_MS = 25 * 60 * 1000;
var DUNGEON_EQUIP_MAX_LVL_PER_FLOOR = 5;
var TREASURE_MAP_MAX_LAYER = 100;
var TREASURE_MAP_DROP_CHANCE = 0.03;

var RARITY_ORDER = [
    'Common',
    'Uncommon',
    'Rare',
    'Epic',
    'Legendary',
    'Heirloom',
    'Etherbound',
    'StellarSign',
    'Nullforge',
    'Chronarch',
    'Apexother',
];

var TREASURE_MAP_QUALITIES = [
    { id: 'canjian', name: '残简藏宝图', short: '残简', color: '#8b7355' },
    { id: 'jinhui', name: '锦绘藏宝图', short: '锦绘', color: '#6b8e4e' },
    { id: 'yuzhuan', name: '玉篆藏宝图', short: '玉篆', color: '#4a8fad' },
    { id: 'xuanling', name: '玄灵藏宝图', short: '玄灵', color: '#7b5ea7' },
    { id: 'shengu', name: '神古藏宝图', short: '神古', color: '#b8860b' },
];

/** 黄枫谷通关随机藏宝图品质（秘境掉落同池） */
var HUANGFENG_DROP_QUALITY_POOL = [
    { id: 'canjian', weight: 50 },
    { id: 'jinhui', weight: 33 },
    { id: 'yuzhuan', weight: 10 },
    { id: 'xuanling', weight: 5 },
    { id: 'shengu', weight: 2 },
];

var EQUIP_PIN_TABLE_BY_MAP_QUALITY = {
    canjian: [
        { pin: 3, p: 0.6 },
        { pin: 4, p: 0.27 },
        { pin: 5, p: 0.1 },
        { pin: 6, p: 0.02 },
        { pin: 7, p: 0.01 },
    ],
    jinhui: [
        { pin: 3, p: 0.35 },
        { pin: 4, p: 0.43 },
        { pin: 5, p: 0.15 },
        { pin: 6, p: 0.05 },
        { pin: 7, p: 0.02 },
    ],
    yuzhuan: [
        { pin: 4, p: 0.6 },
        { pin: 5, p: 0.27 },
        { pin: 6, p: 0.08 },
        { pin: 7, p: 0.04 },
        { pin: 8, p: 0.01 },
    ],
    xuanling: [
        { pin: 4, p: 0.27 },
        { pin: 5, p: 0.5 },
        { pin: 6, p: 0.15 },
        { pin: 7, p: 0.06 },
        { pin: 8, p: 0.02 },
    ],
    shengu: [
        { pin: 5, p: 0.4 },
        { pin: 6, p: 0.46 },
        { pin: 7, p: 0.1 },
        { pin: 8, p: 0.05 },
        { pin: 9, p: 0.01 },
    ],
};

var BOSS_NAME_PREFIXES = [
    '吞天', '蚀月', '镇狱', '裂穹', '劫煞', '幽冥', '九渊', '焚苍', '灭世', '魇魔',
    '断岳', '冥渊', '天罡', '噬魂', '霸绝', '凶冥', '玄煞', '狂魇',
];
var BOSS_NAME_CORES = [
    '宝墟', '秘匣', '残卷', '地脉', '灵脉', '古卷', '封印', '探幽', '劫图', '龙纹',
];
var BOSS_NAME_SUFFIXES = ['魔君', '凶尊', '守煞', '盗尊', '邪修', '镇守', '劫主'];

function bodyStr(v) {
    return v != null ? String(v).trim() : '';
}

function qualityMeta(id) {
    for (var i = 0; i < TREASURE_MAP_QUALITIES.length; i++) {
        if (TREASURE_MAP_QUALITIES[i].id === id) return TREASURE_MAP_QUALITIES[i];
    }
    return TREASURE_MAP_QUALITIES[0];
}

function pinToRarity(pin) {
    var p = Math.max(1, Math.min(11, Math.floor(Number(pin) || 1)));
    return RARITY_ORDER[p - 1] || 'Common';
}

function normalizeTreasureMapLayer(layer) {
    return Math.max(1, Math.min(TREASURE_MAP_MAX_LAYER, Math.floor(Number(layer) || 1)));
}

function rollHuangfengMapQuality(rng) {
    var r = typeof rng === 'function' ? rng() : Math.random();
    var acc = 0;
    var total = 0;
    var i;
    for (i = 0; i < HUANGFENG_DROP_QUALITY_POOL.length; i++) {
        total += HUANGFENG_DROP_QUALITY_POOL[i].weight;
    }
    if (total <= 0) return 'canjian';
    for (i = 0; i < HUANGFENG_DROP_QUALITY_POOL.length; i++) {
        acc += HUANGFENG_DROP_QUALITY_POOL[i].weight / total;
        if (r <= acc) return HUANGFENG_DROP_QUALITY_POOL[i].id;
    }
    return 'canjian';
}

function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function newMapId() {
    var s = '';
    for (var i = 0; i < 16; i++) {
        s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
}

function newToken() {
    var s = '';
    for (var i = 0; i < 48; i++) {
        s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
}

function ensureMaps(player) {
    if (!Array.isArray(player.dongtianTreasureMaps)) player.dongtianTreasureMaps = [];
    return player.dongtianTreasureMaps;
}

function rollFromTable(table, rng) {
    var r = typeof rng === 'function' ? rng() : Math.random();
    var acc = 0;
    for (var i = 0; i < table.length; i++) {
        acc += table[i].p;
        if (r <= acc) return table[i].pin;
    }
    return table[table.length - 1].pin;
}

function rollBossName(rng) {
    var pick = function (arr) {
        return arr[Math.floor((typeof rng === 'function' ? rng() : Math.random()) * arr.length)];
    };
    return pick(BOSS_NAME_PREFIXES) + pick(BOSS_NAME_CORES) + pick(BOSS_NAME_SUFFIXES);
}

function getEnemyRuleForTreasureMapLayer(layer) {
    var L = normalizeTreasureMapLayer(layer);
    return {
        floor: L,
        jie: 20,
        xieyinLevel: 2,
        enemyLevel: 5 * L,
        enemyScaling: 1.2,
        bossSuffix: '',
    };
}

function rollEquipPinForMapQuality(qualityId, rng) {
    var table = EQUIP_PIN_TABLE_BY_MAP_QUALITY[qualityId] || EQUIP_PIN_TABLE_BY_MAP_QUALITY.canjian;
    return rollFromTable(table, rng);
}

function rollEquipLvlForLayer(layer, rng) {
    var L = normalizeTreasureMapLayer(layer);
    var min = L * 4;
    var max = L * DUNGEON_EQUIP_MAX_LVL_PER_FLOOR;
    var r = typeof rng === 'function' ? rng() : Math.random();
    return min + Math.floor(r * (max - min + 1));
}

function pendingFromPlayer(player) {
    var p = player.dongtianTreasureMapPending;
    if (!p || typeof p !== 'object' || !p.token) return null;
    if (Date.now() - (Number(p.createdAt) || 0) > BATTLE_TTL_MS) return null;
    return p;
}

function persistLocalSave() {
    if (typeof saveData === 'function') saveData();
    if (typeof calculateStats === 'function') calculateStats();
    if (typeof playerLoadStats === 'function') playerLoadStats();
}

function equipDisplayName(item) {
    if (!item) return '遗器';
    if (item.weaponName) return item.weaponName;
    if (item.defenseName) return item.defenseName;
    if (item.accessoryName) return item.accessoryName;
    return item.type || '遗器';
}

function prefixTreasureMapName(nm) {
    if (!nm) return nm;
    var s = String(nm);
    return s.indexOf('秘卷·') === 0 ? s : '秘卷·' + s;
}

function parseLastInventoryEquipment(player, beforeLen) {
    if (!player.inventory || !Array.isArray(player.inventory.equipment)) return null;
    if (player.inventory.equipment.length <= beforeLen) return null;
    var raw = player.inventory.equipment[player.inventory.equipment.length - 1];
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (eParse) {
        return null;
    }
}

function grantTreasureMapEquipment(player, pin, lvl, layer) {
    if (!player.inventory || typeof player.inventory !== 'object') player.inventory = {};
    if (!Array.isArray(player.inventory.equipment)) player.inventory.equipment = [];
    if (player.inventory.equipment.length >= 200) {
        return { ok: false, message: '遗器行囊已满（200）' };
    }
    if (typeof createEquipment !== 'function') {
        return { ok: false, message: '遗器模块未就绪' };
    }

    var mapLayer = normalizeTreasureMapLayer(layer);
    var beforeLen = player.inventory.equipment.length;
    var item = createEquipment({
        forceLvl: lvl,
        forceRarity: pinToRarity(pin),
        noAutoPush: true,
        treasureMapLayer: mapLayer,
        treasureMapDrop: true,
    });

    if (!item || !Array.isArray(item.stats)) {
        item = parseLastInventoryEquipment(player, beforeLen);
    }

    if (!item || !Array.isArray(item.stats)) {
        return { ok: false, message: '生成遗器失败' };
    }

    item.treasureMapDrop = true;
    item.dungeonDropFloor = mapLayer;
    item.rarity = pinToRarity(pin);

    if (item.weaponName) item.weaponName = prefixTreasureMapName(item.weaponName);
    if (item.defenseName) item.defenseName = prefixTreasureMapName(item.defenseName);
    if (item.accessoryName) item.accessoryName = prefixTreasureMapName(item.accessoryName);

    if (typeof window.repairTreasureMapDropEquipmentNames === 'function') {
        try {
            window.repairTreasureMapDropEquipmentNames({ inventory: { equipment: [JSON.stringify(item)] } }, mapLayer);
            try {
                item = JSON.parse(JSON.stringify(item));
            } catch (eClone) {}
        } catch (eFix) {}
    }

    if (typeof applyTreasureMapHpAtkDefBonusMulToStats === 'function') {
        try {
            applyTreasureMapHpAtkDefBonusMulToStats(item);
        } catch (eMul) {}
    }

    if (player.inventory.equipment.length > beforeLen) {
        player.inventory.equipment[player.inventory.equipment.length - 1] = JSON.stringify(item);
    } else {
        player.inventory.equipment.push(JSON.stringify(item));
    }

    return {
        ok: true,
        item: {
            rarity: item.rarity,
            lvl: item.lvl,
            type: item.type,
            category: item.category,
            pin: Math.max(1, Math.min(11, Math.floor(Number(pin) || 1))),
            weaponName: item.weaponName || '',
            defenseName: item.defenseName || '',
            accessoryName: item.accessoryName || '',
            displayName: equipDisplayName(item),
            dungeonDropFloor: item.dungeonDropFloor,
            statRollLoops: item.statRollLoops,
            value: item.value,
            setId: typeof item.setId === 'number' ? item.setId : undefined,
            passiveBonus:
                item.passiveBonus && item.passiveBonus.id
                    ? { id: item.passiveBonus.id, lvl: item.passiveBonus.lvl }
                    : undefined,
        },
    };
}

function buildStateResponse() {
    if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
    var maps = ensureMaps(player).slice(-MAX_MAPS);
    return {
        ok: true,
        maps: JSON.parse(JSON.stringify(maps)),
        count: maps.length,
        maxMaps: MAX_MAPS,
        qualities: TREASURE_MAP_QUALITIES,
        localMode: true,
    };
}

function discardMaps(mapIdSet) {
    var list = ensureMaps(player);
    var removed = [];
    for (var i = list.length - 1; i >= 0; i--) {
        var m = list[i];
        if (!m || !mapIdSet[String(m.id)]) continue;
        removed.push(m);
        list.splice(i, 1);
    }
    var pending = pendingFromPlayer(player);
    if (pending && mapIdSet[String(pending.mapId)]) {
        player.dongtianTreasureMapPending = null;
    }
    return { removed: removed, list: list };
}

function handlePost(path, body) {
    if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
    body = body && typeof body === 'object' ? body : {};

    if (path.indexOf('/discard-all') >= 0) {
        var listAll = ensureMaps(player);
        if (!listAll.length) return { ok: false, message: '匣中暂无藏宝图' };
        var setAll = {};
        for (var ai = 0; ai < listAll.length; ai++) {
            if (listAll[ai] && listAll[ai].id) setAll[String(listAll[ai].id)] = true;
        }
        var rAll = discardMaps(setAll);
        persistLocalSave();
        return {
            ok: true,
            message: '已清空全部 ' + rAll.removed.length + ' 张藏宝图',
            discarded: rAll.removed.length,
            maps: [],
            count: 0,
        };
    }

    if (path.indexOf('/discard-batch') >= 0) {
        var raw = body.mapIds;
        var ids = Array.isArray(raw) ? raw.map(bodyStr).filter(Boolean) : [];
        var set = {};
        for (var i = 0; i < ids.length; i++) set[ids[i]] = true;
        var r1 = discardMaps(set);
        if (!r1.removed.length) return { ok: false, message: '所选藏宝图不存在或已使用' };
        persistLocalSave();
        var byQ = {};
        for (var ri = 0; ri < r1.removed.length; ri++) {
            var qid = r1.removed[ri].qualityId || 'canjian';
            byQ[qid] = (byQ[qid] || 0) + 1;
        }
        var parts = [];
        var qk;
        for (qk in byQ) {
            if (!Object.prototype.hasOwnProperty.call(byQ, qk)) continue;
            parts.push(qualityMeta(qk).short + '×' + byQ[qk]);
        }
        var msg = '已批量丢弃 ' + r1.removed.length + ' 张藏宝图';
        if (parts.length) msg += '（' + parts.join('、') + '）';
        return {
            ok: true,
            message: msg,
            discarded: r1.removed.length,
            maps: r1.list.slice(-MAX_MAPS),
            count: r1.list.length,
        };
    }

    if (path.indexOf('/discard') >= 0) {
        var mapId = bodyStr(body.mapId);
        if (!mapId) return { ok: false, message: '缺少藏宝图编号' };
        var setOne = {};
        setOne[mapId] = true;
        var r2 = discardMaps(setOne);
        if (!r2.removed.length) return { ok: false, message: '藏宝图不存在或已使用' };
        persistLocalSave();
        var one = r2.removed[0];
        var qm = qualityMeta(one.qualityId);
        return {
            ok: true,
            message: '已丢弃「' + qm.short + '·' + one.layer + '层」藏宝图',
            maps: r2.list.slice(-MAX_MAPS),
            count: r2.list.length,
        };
    }

    if (path.indexOf('/use') >= 0) {
        var useId = bodyStr(body.mapId);
        var list = ensureMaps(player);
        var idx = -1;
        for (var ui = 0; ui < list.length; ui++) {
            if (list[ui] && String(list[ui].id) === useId) {
                idx = ui;
                break;
            }
        }
        if (!useId || idx < 0) return { ok: false, message: '藏宝图不存在或已使用' };
        var map = list[idx];
        list.splice(idx, 1);

        var token = newToken();
        var battleRngSeed = Math.floor(Math.random() * 4294967295);
        var rng = mulberry32(battleRngSeed);
        var bossName = rollBossName(rng);
        var enemyRule = getEnemyRuleForTreasureMapLayer(map.layer);
        var equipPin = rollEquipPinForMapQuality(map.qualityId, rng);
        var equipLvl = rollEquipLvlForLayer(map.layer, rng);
        var pending = {
            token: token,
            mapId: useId,
            qualityId: map.qualityId,
            layer: map.layer,
            equipPin: equipPin,
            equipLvl: equipLvl,
            bossName: bossName,
            battleRngSeed: battleRngSeed,
            createdAt: Date.now(),
        };
        player.dongtianTreasureMapPending = pending;
        player.dongtianTreasureMapLastCompleteToken = '';
        persistLocalSave();
        return {
            ok: true,
            token: token,
            battleRngSeed: battleRngSeed,
            qualityId: map.qualityId,
            qualityName: qualityMeta(map.qualityId).name,
            layer: map.layer,
            bossName: bossName,
            enemyRule: enemyRule,
            equipPinPreview: equipPin,
            pending: pending,
            maps: list.slice(-MAX_MAPS),
        };
    }

    if (path.indexOf('/battle/complete') >= 0) {
        var tok = bodyStr(body.token);
        var won = !!body.won;
        if (!tok) return { ok: false, message: '缺少战斗凭证' };
        if (bodyStr(player.dongtianTreasureMapLastCompleteToken) === tok) {
            return {
                ok: true,
                won: true,
                alreadyClaimed: true,
                message: '奖励已发放，请查看行囊遗器。',
            };
        }
        var pending2 = pendingFromPlayer(player);
        if (!pending2 || bodyStr(pending2.token) !== tok) {
            return { ok: false, message: '无效或已过期的战斗凭证（服务端重启或凭证已结算，请重新启图）' };
        }
        if (!won) {
            player.dongtianTreasureMapPending = null;
            if (player) player.inCombat = false;
            persistLocalSave();
            return { ok: true, won: false, message: '宝图凶煞未除，残卷仍封于匣中。' };
        }
        var gr = grantTreasureMapEquipment(player, pending2.equipPin, pending2.equipLvl, pending2.layer);
        if (!gr.ok) {
            return { ok: false, message: gr.message || '遗器发放失败' };
        }
        player.dongtianTreasureMapPending = null;
        player.dongtianTreasureMapLastCompleteToken = tok;
        if (player) player.inCombat = false;
        persistLocalSave();
        var qm2 = qualityMeta(pending2.qualityId);
        var pinShow = gr.item && gr.item.pin ? gr.item.pin : pending2.equipPin;
        var lvlShow = gr.item && gr.item.lvl ? gr.item.lvl : pending2.equipLvl;
        var label = gr.item && gr.item.displayName ? gr.item.displayName : '遗器';
        return {
            ok: true,
            won: true,
            alreadyClaimed: false,
            message:
                '斩灭「' +
                (pending2.bossName || '宝图劫主') +
                '」，' +
                qm2.short +
                '·' +
                pending2.layer +
                '层秘藏现世：「' +
                label +
                '」（' +
                pinShow +
                '品 · Lv.' +
                lvlShow +
                '）',
            reward: gr.item,
        };
    }

    return { ok: false, message: '未知操作' };
}

function handleLocalApi(method, path, body) {
    try {
        var p = String(path || '');
        if (method === 'GET' && p.indexOf('/state') >= 0) return buildStateResponse();
        if (method === 'POST') return handlePost(p, body);
        return { ok: false, message: '不支持的方法' };
    } catch (e) {
        return { ok: false, message: (e && e.message) || '藏宝图操作失败' };
    }
}

function getTreasureMapDropFloor() {
    if (typeof getPetDropFloorForRoll === 'function') return getPetDropFloorForRoll();
    if (typeof dungeon !== 'undefined' && dungeon && dungeon.progress && typeof dungeon.progress.floor === 'number') {
        return Math.max(1, Math.floor(dungeon.progress.floor));
    }
    return 1;
}

function tryRollTreasureMapDrop(context) {
    try {
        if (typeof window.isDongtianTowerCombatSession === 'function' && window.isDongtianTowerCombatSession()) {
            return false;
        }
    } catch (eTower) {}
    if (typeof player === 'undefined' || !player) return false;
    if (Math.random() >= TREASURE_MAP_DROP_CHANCE) return false;
    var list = ensureMaps(player);
    if (list.length >= MAX_MAPS) {
        var fullMsg = '一卷藏宝图自劫尘中浮起，你却秘卷已满——字迹散入劫雾。';
        if (context === 'combat' && typeof addCombatLog === 'function') addCombatLog(fullMsg);
        else if (context === 'dungeon' && typeof addDungeonLog === 'function') addDungeonLog(fullMsg);
        return false;
    }
    var layer = Math.max(1, Math.min(100, getTreasureMapDropFloor()));
    var qualityId = rollHuangfengMapQuality();
    var qm = qualityMeta(qualityId);
    list.push({
        id: newMapId(),
        qualityId: qualityId,
        layer: layer,
        obtainedAt: Date.now(),
    });
    persistLocalSave();
    var dropMsg =
        '<span class="Rare">秘卷显化！</span>得「<span class="Rare">' +
        qm.short +
        '·' +
        layer +
        '层</span>」藏宝图 ×1。';
    if (context === 'combat' && typeof addCombatLog === 'function') addCombatLog(dropMsg);
    else if (context === 'dungeon' && typeof addDungeonLog === 'function') addDungeonLog(dropMsg);
    return true;
}

window.dongtianTreasureMapIsLocalMode = function () {
    return !window.DONGTIAN_CLOUD_MODE;
};

window.dongtianTreasureMapLocalApi = function (method, path, body) {
    return Promise.resolve(handleLocalApi(method, path, body));
};

/** 单机黄枫谷等场景发放藏宝图 */
window.grantDongtianTreasureMapsLocal = function (entries) {
    if (typeof player === 'undefined' || !player || !Array.isArray(entries)) return 0;
    var list = ensureMaps(player);
    var n = 0;
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e || !e.qualityId) continue;
        if (list.length >= MAX_MAPS) break;
        list.push({
            id: newMapId(),
            qualityId: e.qualityId,
            layer: normalizeTreasureMapLayer(e.layer),
            obtainedAt: Date.now(),
        });
        n++;
    }
    if (n > 0) persistLocalSave();
    return n;
};

window.tryRollTreasureMapDrop = tryRollTreasureMapDrop;
window.TREASURE_MAP_DROP_CHANCE = TREASURE_MAP_DROP_CHANCE;

})();
