
const MATERIAL_ENHANCE_STONE = "enhance_stone";
const MATERIAL_ENHANCE_STONE_ZH = "强化石";
const ENHANCE_STONE_DROP_CHANCE = 0.02;
const MATERIAL_ENCHANT_STONE = "enchant_stone";
const MATERIAL_ENCHANT_STONE_ZH = "附魔石";
const ENCHANT_STONE_DROP_CHANCE = ENHANCE_STONE_DROP_CHANCE;

const ENHANCE_STAR_WEIGHTS = [5, 5, 5, 10, 10, 20, 50, 50, 50, 100];

const ENHANCE_SUCCESS_PCT_BY_TARGET_STAR = {
    1: 100,
    2: 80,
    3: 60,
    4: 40,
    5: 30,
    6: 20,
    7: 10,
    8: 5,
    9: 2,
    10: 1
};

const ENCHANT_TIER_ROLL_TABLE = [
    { tier: 1, chance: 0.9, minPct: 1, maxPct: 10 },
    { tier: 2, chance: 0.07, minPct: 11, maxPct: 20 },
    { tier: 3, chance: 0.02, minPct: 21, maxPct: 35 },
    { tier: 4, chance: 0.01, minPct: 36, maxPct: 50 }
];

function ensureInventoryMaterials() {
    if (!player || !player.inventory) return;
    if (!player.inventory.materials || typeof player.inventory.materials !== "object") {
        player.inventory.materials = {};
    }
    if (typeof player.inventory.materials[MATERIAL_ENHANCE_STONE] !== "number" || isNaN(player.inventory.materials[MATERIAL_ENHANCE_STONE])) {
        player.inventory.materials[MATERIAL_ENHANCE_STONE] = 0;
    }
    if (typeof player.inventory.materials[MATERIAL_ENCHANT_STONE] !== "number" || isNaN(player.inventory.materials[MATERIAL_ENCHANT_STONE])) {
        player.inventory.materials[MATERIAL_ENCHANT_STONE] = 0;
    }
    if (typeof MATERIAL_GEM_PACK !== "undefined" && (typeof player.inventory.materials[MATERIAL_GEM_PACK] !== "number" || isNaN(player.inventory.materials[MATERIAL_GEM_PACK]))) {
        player.inventory.materials[MATERIAL_GEM_PACK] = 0;
    }
    if (typeof MATERIAL_SOCKET_OPENER !== "undefined" && (typeof player.inventory.materials[MATERIAL_SOCKET_OPENER] !== "number" || isNaN(player.inventory.materials[MATERIAL_SOCKET_OPENER]))) {
        player.inventory.materials[MATERIAL_SOCKET_OPENER] = 0;
    }
    if (typeof MATERIAL_TALENT_FRUIT !== "undefined" && (typeof player.inventory.materials[MATERIAL_TALENT_FRUIT] !== "number" || isNaN(player.inventory.materials[MATERIAL_TALENT_FRUIT]))) {
        player.inventory.materials[MATERIAL_TALENT_FRUIT] = 0;
    }
}

function getMaterialCount(id) {
    ensureInventoryMaterials();
    var n = player.inventory.materials[id];
    return typeof n === "number" && !isNaN(n) ? Math.max(0, Math.floor(n)) : 0;
}

function addMaterial(id, amount) {
    ensureInventoryMaterials();
    amount = Math.floor(amount);
    if (!amount) return 0;
    var cur = getMaterialCount(id);
    var next = Math.max(0, cur + amount);
    player.inventory.materials[id] = next;
    return amount;
}

function getEnhancementBonusPctSum(stars) {
    stars = typeof stars === "number" ? Math.max(0, Math.min(10, Math.floor(stars))) : 0;
    var sum = 0;
    for (var i = 0; i < stars; i++) {
        sum += ENHANCE_STAR_WEIGHTS[i] || 0;
    }
    return sum;
}

function getEnhancementStatMul(stars) {
    return 1 + getEnhancementBonusPctSum(stars) / 100;
}

function getEnhancementBonusPctDisplay(stars) {
    return Math.round(getEnhancementBonusPctSum(stars) * 10) / 10;
}

function getEnhanceFailPenaltyStars(targetStar) {
    if (targetStar <= 3) return 0;
    if (targetStar <= 5) return 1;
    if (targetStar <= 7) return 2;
    if (targetStar <= 9) return 3;
    return 4;
}

function getEnhanceSuccessPctForTargetStar(targetStar) {
    var p = ENHANCE_SUCCESS_PCT_BY_TARGET_STAR[targetStar];
    return typeof p === "number" ? p : 0;
}

function getEnhanceStoneCostForTargetStar(targetStar) {
    var n = typeof targetStar === "number" ? Math.floor(targetStar) : 1;
    return Math.max(1, Math.min(10, n));
}

function getEnchantStoneCost() {
    return 1;
}

function rollEnchantTierAndPct() {
    var roll = Math.random();
    var acc = 0;
    var picked = ENCHANT_TIER_ROLL_TABLE[0];
    for (var i = 0; i < ENCHANT_TIER_ROLL_TABLE.length; i++) {
        var row = ENCHANT_TIER_ROLL_TABLE[i];
        acc += row.chance;
        if (roll < acc) {
            picked = row;
            break;
        }
    }
    var pct = randomizeNum(picked.minPct, picked.maxPct);
    return {
        tier: picked.tier,
        pct: pct
    };
}

function migrateEnhancementRuleTo305Pct(item) {
    if (!item || item.enhanceRuleVersion === 2) return;
    var s = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, Math.floor(item.enhanceStars))) : 0;
    if (s <= 0) {
        item.enhanceRuleVersion = 2;
        return;
    }
    var sum = 0;
    for (var i = 0; i < s; i++) {
        sum += ENHANCE_STAR_WEIGHTS[i] || 0;
    }
    var mulLegacy = 1 + sum / 305;
    var mulNew = 1 + sum / 100;
    scaleEquipmentStatsInPlace(item, mulNew / mulLegacy);
    item.enhanceRuleVersion = 2;
}

function migrateAllPlayerEquipmentEnhance305() {
    if (typeof player === "undefined" || !player) return;
    if (player.inventory && Array.isArray(player.inventory.equipment)) {
        for (var i = 0; i < player.inventory.equipment.length; i++) {
            try {
                var o = JSON.parse(player.inventory.equipment[i]);
                migrateEnhancementRuleTo305Pct(o);
                player.inventory.equipment[i] = JSON.stringify(o);
            } catch (e) {}
        }
    }
    if (Array.isArray(player.equipped)) {
        for (var j = 0; j < player.equipped.length; j++) {
            if (player.equipped[j]) {
                migrateEnhancementRuleTo305Pct(player.equipped[j]);
            }
        }
    }
}

function scaleEquipmentStatsInPlace(item, factor) {
    if (!item || !Array.isArray(item.stats) || factor === 1 || !isFinite(factor)) return;
    for (var i = 0; i < item.stats.length; i++) {
        var o = item.stats[i];
        var k = Object.keys(o)[0];
        if (!k) continue;
        var v = Number(o[k]);
        if (!isFinite(v)) continue;
        o[k] = k === "hp" || k === "atk" || k === "def" ? Math.round(v * factor) : Math.round(v * factor * 100) / 100;
    }
    if (typeof item.value === "number" && item.value > 0) {
        item.value = Math.max(1, Math.round(item.value * factor));
    }
}

/**
 * 按目标星级消耗强化石（每星一枚），尝试强化行囊中的遗器（引用对象会被修改）
 * @returns {{ ok: boolean, message: string, item?: object }}
 */
function tryEnhanceInventoryItem(item) {
    ensureInventoryMaterials();
    if (!item) return { ok: false, message: "无效遗器。" };
    var s = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, Math.floor(item.enhanceStars))) : 0;
    if (s >= 10) return { ok: false, message: "此器已至十星，无法再强化。" };
    var targetStar = s + 1;
    var cost = getEnhanceStoneCostForTargetStar(targetStar);
    if (getMaterialCount(MATERIAL_ENHANCE_STONE) < cost) {
        return { ok: false, message: "强化石不足。" };
    }

    addMaterial(MATERIAL_ENHANCE_STONE, -cost);
    var rate = getEnhanceSuccessPctForTargetStar(targetStar) / 100;
    var roll = Math.random();

    if (roll < rate) {
        var mulOld = getEnhancementStatMul(s);
        var mulNew = getEnhancementStatMul(s + 1);
        scaleEquipmentStatsInPlace(item, mulNew / mulOld);
        item.enhanceStars = s + 1;
        item.enhanceRuleVersion = 2;
        return {
            ok: true,
            message: `淬火成功！${MATERIAL_ENHANCE_STONE_ZH}化入器纹，升至 <b>${item.enhanceStars}★</b>。`,
            item: item
        };
    }

    var pen = getEnhanceFailPenaltyStars(targetStar);
    if (pen <= 0) {
        item.enhanceRuleVersion = 2;
        return {
            ok: true,
            message: `淬火未成，所幸器纹未损（${targetStar}★ 以下失败不掉星）。`,
            item: item
        };
    }

    var newS = Math.max(0, s - pen);
    var mulCur = getEnhancementStatMul(s);
    var mulDrop = getEnhancementStatMul(newS);
    scaleEquipmentStatsInPlace(item, mulDrop / mulCur);
    item.enhanceStars = newS;
    item.enhanceRuleVersion = 2;
    return {
        ok: true,
        message: `淬火反噬！器纹崩裂，自 <b>${s}★</b> 跌至 <b>${newS}★</b>。`,
        item: item
    };
}

/**
 * 消耗 1 枚附魔石对遗器进行附魔（可重复附魔；新附魔会覆盖旧附魔）
 * @returns {{ ok: boolean, message: string, item?: object }}
 */
function tryEnchantInventoryItem(item) {
    ensureInventoryMaterials();
    if (!item) return { ok: false, message: "无效遗器。" };
    var cost = getEnchantStoneCost();
    if (getMaterialCount(MATERIAL_ENCHANT_STONE) < cost) {
        return { ok: false, message: "附魔石不足。" };
    }
    addMaterial(MATERIAL_ENCHANT_STONE, -cost);
    var rolled = rollEnchantTierAndPct();
    var oldPct = typeof item.enchantPct === "number" ? item.enchantPct : 0;
    var oldMul = 1 + oldPct / 100;
    var newMul = 1 + rolled.pct / 100;
    var factor = oldMul > 0 ? newMul / oldMul : newMul;
    scaleEquipmentStatsInPlace(item, factor);
    item.enchantTier = rolled.tier;
    item.enchantPct = rolled.pct;
    return {
        ok: true,
        message:
            `附魔成功！<span class="eq-enchant-tier-${rolled.tier}">` +
            `第${rolled.tier}阶 · +${rolled.pct}%` +
            `</span>，已在当前强化属性基础上再度增幅。`,
        item: item
    };
}


function repairLegacyScalingForItem(item) {
    if (!item || !Array.isArray(item.stats)) return false;
    var normalizedFromString = false;
    for (var i = 0; i < item.stats.length; i++) {
        var row = item.stats[i];
        if (!row || typeof row !== "object") continue;
        var k = Object.keys(row)[0];
        if (!k) continue;
        var raw = row[k];
        var num = Number(raw);
        if (!isFinite(num)) continue;
        if (typeof raw === "string") normalizedFromString = true;
        row[k] = k === "hp" || k === "atk" || k === "def" ? Math.round(num) : Math.round(num * 100) / 100;
    }

    if (!normalizedFromString) return false;

    var stars = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, Math.floor(item.enhanceStars))) : 0;
    var enchPct = typeof item.enchantPct === "number" ? Math.max(0, Math.floor(item.enchantPct)) : 0;
    var mul = getEnhancementStatMul(stars) * (1 + enchPct / 100);
    if (mul > 1) {
        scaleEquipmentStatsInPlace(item, mul);
    }
    item.enhanceRuleVersion = 2;
    item.legacyScaleRepairVersion = 1;
    return true;
}

function repairAllPlayerLegacyEquipmentScaling() {
    if (typeof player === "undefined" || !player) return false;
    var changed = false;

    if (player.inventory && Array.isArray(player.inventory.equipment)) {
        for (var i = 0; i < player.inventory.equipment.length; i++) {
            try {
                var invItem = JSON.parse(player.inventory.equipment[i]);
                if (repairLegacyScalingForItem(invItem)) {
                    player.inventory.equipment[i] = JSON.stringify(invItem);
                    changed = true;
                }
            } catch (e) {}
        }
    }

    if (Array.isArray(player.equipped)) {
        for (var j = 0; j < player.equipped.length; j++) {
            if (!player.equipped[j]) continue;
            if (repairLegacyScalingForItem(player.equipped[j])) {
                changed = true;
            }
        }
    }

    return changed;
}

function tryRollEnhanceStoneDrop(logCombat, logDungeon) {
    if (typeof player === "undefined" || player === null) return false;
    if (Math.random() >= ENHANCE_STONE_DROP_CHANCE) return false;
    ensureInventoryMaterials();
    addMaterial(MATERIAL_ENHANCE_STONE, 1);
    var line = `残烬中凝出一枚<span class="Epic">${MATERIAL_ENHANCE_STONE_ZH}</span>，可淬炼遗器。`;
    if (logCombat && typeof addCombatLog === "function") addCombatLog(line);
    if (logDungeon && typeof addDungeonLog === "function") addDungeonLog(line);
    if (typeof saveData === "function") saveData();
    return true;
}

function tryRollEnchantStoneDrop(logCombat, logDungeon) {
    if (typeof player === "undefined" || player === null) return false;
    if (Math.random() >= ENCHANT_STONE_DROP_CHANCE) return false;
    ensureInventoryMaterials();
    addMaterial(MATERIAL_ENCHANT_STONE, 1);
    var line = `器纹余烬凝作一枚<span class="Legendary">${MATERIAL_ENCHANT_STONE_ZH}</span>，可再炼遗器。`;
    if (logCombat && typeof addCombatLog === "function") addCombatLog(line);
    if (logDungeon && typeof addDungeonLog === "function") addDungeonLog(line);
    if (typeof saveData === "function") saveData();
    return true;
}
