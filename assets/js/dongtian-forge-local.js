/**
 * 洞天劫 · 神锻阁 · 单机本地逻辑（由 dongtian-forge-api.js 移植；洗点消耗强化石）
 */
(function () {
'use strict';

var FORGE_SLOT_TYPES = ['Weapon', 'Armor', 'Shield', 'Helmet', 'Ring', 'Necklace'];
var RESET_STONE_COST = 100;
var MATERIAL_ENHANCE_STONE = 'enhance_stone';
var PCT_PER_POINT = 0.5;

function ensureMaterials(player) {
    if (!player.inventory || typeof player.inventory !== 'object') player.inventory = {};
    if (!player.inventory.materials || typeof player.inventory.materials !== 'object') {
        player.inventory.materials = {};
    }
    return player.inventory.materials;
}

function getEnhanceStoneCount(player) {
    var mats = ensureMaterials(player);
    return Math.max(0, Math.floor(Number(mats[MATERIAL_ENHANCE_STONE]) || 0));
}

function spendEnhanceStone(player, amount) {
    var need = Math.max(0, Math.floor(Number(amount) || 0));
    var mats = ensureMaterials(player);
    var have = Math.max(0, Math.floor(Number(mats[MATERIAL_ENHANCE_STONE]) || 0));
    if (have < need) return false;
    mats[MATERIAL_ENHANCE_STONE] = have - need;
    return true;
}

function computeForgePool(player) {
    var dragon = Math.max(0, Math.floor(Number(player.dongtianDragonTowerBestFloor) || 0));
    var demon = Math.max(0, Math.floor(Number(player.dongtianDemonTowerBestFloor) || 0));
    var divine = Math.max(0, Math.floor(Number(player.dongtianDivineRealmBestFloor) || 0));
    var spiritBeast = Math.max(0, Math.floor(Number(player.dongtianSpiritBeastRealmBestFloor) || 0));
    var ghost = Math.max(0, Math.floor(Number(player.dongtianGhostRealmBestFloor) || 0));
    return dragon * 1 + demon * 5 + divine * 5 + spiritBeast * 5 + ghost * 2;
}

function ensureForgeAlloc(player) {
    if (!player.dongtianForgeAlloc || typeof player.dongtianForgeAlloc !== 'object') {
        player.dongtianForgeAlloc = {};
    }
    var a = player.dongtianForgeAlloc;
    for (var i = 0; i < FORGE_SLOT_TYPES.length; i++) {
        var t = FORGE_SLOT_TYPES[i];
        a[t] = Math.max(0, Math.floor(Number(a[t]) || 0));
    }
    return a;
}

function sumAlloc(a) {
    var s = 0;
    for (var i = 0; i < FORGE_SLOT_TYPES.length; i++) {
        s += Math.max(0, Math.floor(Number(a[FORGE_SLOT_TYPES[i]]) || 0));
    }
    return s;
}

/** 若塔层被下调等导致已分配超过池上限，从后往前回收点数 */
function reconcileForgeAllocToPool(player) {
    var pool = computeForgePool(player);
    var a = ensureForgeAlloc(player);
    var used = sumAlloc(a);
    var guard = 0;
    while (used > pool && guard < 100000) {
        guard++;
        var dec = false;
        for (var j = FORGE_SLOT_TYPES.length - 1; j >= 0; j--) {
            var ty = FORGE_SLOT_TYPES[j];
            if (a[ty] > 0) {
                a[ty] -= 1;
                used -= 1;
                dec = true;
                break;
            }
        }
        if (!dec) break;
    }
}

function forgeStatePayload(player) {
    reconcileForgeAllocToPool(player);
    var a = ensureForgeAlloc(player);
    var pool = computeForgePool(player);
    var used = sumAlloc(a);
    var free = Math.max(0, pool - used);
    var alloc = {};
    for (var i = 0; i < FORGE_SLOT_TYPES.length; i++) {
        var t = FORGE_SLOT_TYPES[i];
        alloc[t] = a[t];
    }
    return {
        pool: pool,
        used: used,
        free: free,
        alloc: alloc,
        dragonBest: Math.max(0, Math.floor(Number(player.dongtianDragonTowerBestFloor) || 0)),
        demonBest: Math.max(0, Math.floor(Number(player.dongtianDemonTowerBestFloor) || 0)),
        divineBest: Math.max(0, Math.floor(Number(player.dongtianDivineRealmBestFloor) || 0)),
        spiritBeastBest: Math.max(0, Math.floor(Number(player.dongtianSpiritBeastRealmBestFloor) || 0)),
        ghostBest: Math.max(0, Math.floor(Number(player.dongtianGhostRealmBestFloor) || 0)),
        enhanceStone: getEnhanceStoneCount(player),
        resetCost: RESET_STONE_COST,
        resetCostMaterial: MATERIAL_ENHANCE_STONE,
        pctPerPoint: PCT_PER_POINT,
        localMode: true,
    };
}

function persistLocalSave() {
    if (typeof saveData === 'function') saveData();
    if (typeof calculateStats === 'function') calculateStats();
    if (typeof playerLoadStats === 'function') playerLoadStats();
}

function handleAllocate(body) {
    reconcileForgeAllocToPool(player);
    var slotType = String(body.slotType || '').trim();
    if (FORGE_SLOT_TYPES.indexOf(slotType) < 0) {
        return { ok: false, message: '部位无效' };
    }
    var pool = computeForgePool(player);
    var a = ensureForgeAlloc(player);
    if (sumAlloc(a) >= pool) {
        return {
            ok: false,
            message: '神锻真力已用尽，请先通关龙塔、魔神塔、神界、灵兽界或幽魂界获取更多点数',
        };
    }
    a[slotType] = Math.max(0, Math.floor(Number(a[slotType]) || 0)) + 1;
    persistLocalSave();
    return {
        ok: true,
        message: '神锻成功：「' + slotType + '」+1 点',
        forge: forgeStatePayload(player),
    };
}

function handlePost(path, body) {
    if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
    body = body && typeof body === 'object' ? body : {};

    if (path.indexOf('/allocate') >= 0 || path.indexOf('/add-point') >= 0) {
        return handleAllocate(body);
    }

    if (path.indexOf('/reset') >= 0) {
        var a2 = ensureForgeAlloc(player);
        if (sumAlloc(a2) === 0) {
            return { ok: false, message: '当前未分配点数，无需洗点' };
        }
        if (!spendEnhanceStone(player, RESET_STONE_COST)) {
            return { ok: false, message: '强化石不足（洗点需 ' + RESET_STONE_COST + '）' };
        }
        for (var i = 0; i < FORGE_SLOT_TYPES.length; i++) {
            a2[FORGE_SLOT_TYPES[i]] = 0;
        }
        persistLocalSave();
        return {
            ok: true,
            message: '已洗点：神锻分配已清空，消耗强化石 ×' + RESET_STONE_COST,
            forge: forgeStatePayload(player),
        };
    }

    return { ok: false, message: '未知操作' };
}

function handleLocalApi(method, path, body) {
    try {
        var p = String(path || '');
        if (method === 'GET' && p.indexOf('/state') >= 0) {
            if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
            return { ok: true, forge: forgeStatePayload(player) };
        }
        if (method === 'POST') return handlePost(p, body);
        return { ok: false, message: '不支持的方法' };
    } catch (e) {
        return { ok: false, message: (e && e.message) || '神锻阁操作失败' };
    }
}

window.dongtianForgeIsLocalMode = function () {
    return !window.DONGTIAN_CLOUD_MODE;
};

window.dongtianForgeLocalApi = function (method, path, body) {
    return Promise.resolve(handleLocalApi(method, path, body));
};

})();
