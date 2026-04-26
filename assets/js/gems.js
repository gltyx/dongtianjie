/**
 * 宝石：等级系数表、行囊堆叠、材料包、开孔器、镶嵌属性汇总
 */
const MATERIAL_GEM_PACK = "gem_material_pack";
const MATERIAL_GEM_PACK_ZH = "宝石材料包";
const MATERIAL_SOCKET_OPENER = "socket_opener";
const MATERIAL_SOCKET_OPENER_ZH = "开孔器";
const MATERIAL_TALENT_FRUIT = "talent_fruit";
const MATERIAL_TALENT_FRUIT_ZH = "天赋果";
const MATERIAL_LIFE_POTION = "life_potion";
const MATERIAL_LIFE_POTION_ZH = "生命药剂";
/** 灵宠经验果实：使用后若干场斗法中，击杀分流给灵宠的修为翻倍（可叠加场次） */
const MATERIAL_PET_EXP_FRUIT = "pet_exp_fruit";
const MATERIAL_PET_EXP_FRUIT_ZH = "灵宠经验果实";
const PET_EXP_DOUBLE_COMBATS_PER_FRUIT = 100;
const MATERIAL_SECRET_REALM_WARP = "secret_realm_warp";
const MATERIAL_SECRET_REALM_WARP_ZH = "秘境穿梭器";
/** 秘境最后一劫镇守（guardian）击杀时的掉落概率 */
const PET_EXP_FRUIT_GUARDIAN_DROP_CHANCE = 0.1;
/** 劫数 20 的 BOSS（镇守/主宰）击杀时，秘境穿梭器掉落概率 */
const SECRET_REALM_WARP_BOSS_DROP_CHANCE = 0.5;
/** 妖躯品质档 ≥ 此索引（0=凡物 … 5=头领）时可有概率掉落 */
const LIFE_POTION_MIN_QUALITY_TIER = 5;
const LIFE_POTION_DROP_CHANCE = 0.02;

/** 等级 1–12 基础加成系数（%），身法宝石按表÷3，暴伤宝石按表×2 */
const GEM_BASE_BONUS_PCT_BY_LEVEL = {
    1: 1,
    2: 4,
    3: 9,
    4: 16,
    5: 25,
    6: 36,
    7: 59,
    8: 78,
    9: 100,
    10: 125,
    11: 195,
    12: 236
};

const GEM_KINDS = ["hp", "atk", "def", "atkSpd", "critDmg"];
const GEM_KIND_ZH = {
    hp: "气血",
    atk: "力道",
    def: "护体",
    atkSpd: "身法",
    critDmg: "暴伤"
};

const GEM_KIND_ROLL_POOL = ["hp", "atk", "def", "atkSpd", "critDmg"];

function ensureGemMaterialsInInventory() {
    if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
    if (!player || !player.inventory) return;
    if (typeof player.inventory.materials[MATERIAL_GEM_PACK] !== "number" || isNaN(player.inventory.materials[MATERIAL_GEM_PACK])) {
        player.inventory.materials[MATERIAL_GEM_PACK] = 0;
    }
    if (typeof player.inventory.materials[MATERIAL_SOCKET_OPENER] !== "number" || isNaN(player.inventory.materials[MATERIAL_SOCKET_OPENER])) {
        player.inventory.materials[MATERIAL_SOCKET_OPENER] = 0;
    }
    if (typeof player.inventory.materials[MATERIAL_TALENT_FRUIT] !== "number" || isNaN(player.inventory.materials[MATERIAL_TALENT_FRUIT])) {
        player.inventory.materials[MATERIAL_TALENT_FRUIT] = 0;
    }
    if (typeof player.inventory.materials[MATERIAL_LIFE_POTION] !== "number" || isNaN(player.inventory.materials[MATERIAL_LIFE_POTION])) {
        player.inventory.materials[MATERIAL_LIFE_POTION] = 0;
    }
    if (typeof MATERIAL_PET_EXP_FRUIT !== "undefined") {
        if (typeof player.inventory.materials[MATERIAL_PET_EXP_FRUIT] !== "number" || isNaN(player.inventory.materials[MATERIAL_PET_EXP_FRUIT])) {
            player.inventory.materials[MATERIAL_PET_EXP_FRUIT] = 0;
        }
    }
    if (typeof MATERIAL_SECRET_REALM_WARP !== "undefined") {
        if (typeof player.inventory.materials[MATERIAL_SECRET_REALM_WARP] !== "number" || isNaN(player.inventory.materials[MATERIAL_SECRET_REALM_WARP])) {
            player.inventory.materials[MATERIAL_SECRET_REALM_WARP] = 0;
        }
    }
}

function ensurePlayerGemStacks() {
    if (!player || !player.inventory) return;
    if (!player.inventory.gems || typeof player.inventory.gems !== "object") {
        player.inventory.gems = {};
    }
    for (var i = 0; i < GEM_KINDS.length; i++) {
        var k = GEM_KINDS[i];
        if (!player.inventory.gems[k] || typeof player.inventory.gems[k] !== "object") {
            player.inventory.gems[k] = {};
        }
    }
}

function getGemStackCount(kind, level) {
    ensurePlayerGemStacks();
    kind = String(kind);
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    var m = player.inventory.gems[kind];
    if (!m) return 0;
    var n = m[level];
    return typeof n === "number" && !isNaN(n) ? Math.max(0, Math.floor(n)) : 0;
}

function addGemStack(kind, level, qty) {
    ensurePlayerGemStacks();
    qty = Math.floor(Number(qty) || 0);
    if (!qty) return 0;
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return 0;
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    var m = player.inventory.gems[kind];
    var cur = getGemStackCount(kind, level);
    m[level] = Math.max(0, cur + qty);
    return qty;
}

function consumeGemStack(kind, level, qty) {
    var cur = getGemStackCount(kind, level);
    qty = Math.min(cur, Math.max(0, Math.floor(Number(qty) || 0)));
    if (!qty) return false;
    player.inventory.gems[kind][level] = cur - qty;
    return true;
}

/** 表列数值经身法/暴伤修正后的有效加成（身法÷3、暴伤×2；其余为表列 %）。计入机缘同类百分比，在 calculateStats 中与 bonusStats/套装/灵宠合并。 */
function getGemEffectiveBonusPct(kind, level) {
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    var base = GEM_BASE_BONUS_PCT_BY_LEVEL[level];
    if (typeof base !== "number" || !isFinite(base)) return 0;
    var out;
    if (kind === "atkSpd") out = base / 3;
    else if (kind === "critDmg") out = base * 2;
    else out = base;
    return Math.max(0, out);
}

/** 行囊宝石卡底部说明 */
function gemKindEffectFootnoteZH(kind) {
    switch (String(kind)) {
        case "hp":
        case "atk":
        case "def":
        case "atkSpd":
            return "与机缘加成同类：先天×该百分比（与道体机缘/套装/灵宠合并）";
        case "critDmg":
            return "与机缘同类：暴伤面板百分点（与道体机缘/套装/灵宠合并）";
        default:
            return "";
    }
}

function normalizeEquipmentGemFields(item) {
    if (!item || typeof item !== "object") return;
    var sc = typeof item.socketCount === "number" ? Math.max(0, Math.min(3, Math.floor(item.socketCount))) : 0;
    item.socketCount = sc;
    if (!Array.isArray(item.gemSlots)) item.gemSlots = [];
    while (item.gemSlots.length < sc) item.gemSlots.push(null);
    if (item.gemSlots.length > sc) item.gemSlots = item.gemSlots.slice(0, sc);
    for (var i = 0; i < item.gemSlots.length; i++) {
        var g = item.gemSlots[i];
        if (!g || typeof g !== "object") {
            item.gemSlots[i] = null;
            continue;
        }
        var kk = String(g.kind || "");
        var lv = Math.max(1, Math.min(12, Math.floor(Number(g.level) || 1)));
        if (GEM_KINDS.indexOf(kk) < 0) item.gemSlots[i] = null;
        else item.gemSlots[i] = { kind: kk, level: lv };
    }
}

/** 将已镶嵌宝石汇总为机缘同类百分比/暴伤点，写入 equippedStats，由 calculateStats 与 bonusStats、套装、灵宠合并。 */
function applyEquippedGemsToStats() {
    if (!player || !Array.isArray(player.equipped) || !player.equippedStats) return;
    var es = player.equippedStats;
    es.gemPctHp = 0;
    es.gemPctAtk = 0;
    es.gemPctDef = 0;
    es.gemAtkSpdPct = 0;
    es.gemCritDmgPts = 0;
    for (var i = 0; i < player.equipped.length; i++) {
        var item = player.equipped[i];
        if (!item || !Array.isArray(item.gemSlots)) continue;
        normalizeEquipmentGemFields(item);
        for (var s = 0; s < item.gemSlots.length; s++) {
            var g = item.gemSlots[s];
            if (!g || !g.kind) continue;
            var pct = getGemEffectiveBonusPct(g.kind, g.level);
            if (!pct) continue;
            if (g.kind === "hp") es.gemPctHp += pct;
            else if (g.kind === "atk") es.gemPctAtk += pct;
            else if (g.kind === "def") es.gemPctDef += pct;
            else if (g.kind === "atkSpd") es.gemAtkSpdPct += pct;
            else if (g.kind === "critDmg") es.gemCritDmgPts += pct;
        }
    }
    es.gemPctHp = Math.max(0, es.gemPctHp);
    es.gemPctAtk = Math.max(0, es.gemPctAtk);
    es.gemPctDef = Math.max(0, es.gemPctDef);
    es.gemAtkSpdPct = Math.max(0, es.gemAtkSpdPct);
    es.gemCritDmgPts = Math.max(0, es.gemCritDmgPts);
}

/**
 * 与 getActivePetBonusStats() 返回结构一致，供 calculateStats 与灵宠机缘同类合并（气血/力道/护体/身法为 %，暴伤为点）。
 */
function getGemBonusLikePet() {
    var z = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    if (!player || !player.equippedStats) return z;
    var es = player.equippedStats;
    z.hp = Math.max(0, Number(es.gemPctHp) || 0);
    z.atk = Math.max(0, Number(es.gemPctAtk) || 0);
    z.def = Math.max(0, Number(es.gemPctDef) || 0);
    z.atkSpd = Math.max(0, Number(es.gemAtkSpdPct) || 0);
    z.critDmg = Math.max(0, Number(es.gemCritDmgPts) || 0);
    return z;
}

function tryUseSocketOpenerOnItem(item) {
    ensureGemMaterialsInInventory();
    normalizeEquipmentGemFields(item);
    if (item.socketCount >= 3) return { ok: false, message: "此器已开至三孔，天机难再扩。" };
    var n = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_SOCKET_OPENER) : 0;
    if (n < 1) return { ok: false, message: "开孔器不足。" };
    if (typeof addMaterial === "function") addMaterial(MATERIAL_SOCKET_OPENER, -1);
    item.socketCount = item.socketCount + 1;
    item.gemSlots.push(null);
    return { ok: true, message: "灵纹一绽，器表隐孔已成，可嵌灵石。" };
}

function trySocketGemOnItem(item, slotIndex, kind, level) {
    normalizeEquipmentGemFields(item);
    slotIndex = Math.floor(Number(slotIndex) || 0);
    if (slotIndex < 0 || slotIndex >= item.socketCount) return { ok: false, message: "孔位有误。" };
    if (item.gemSlots[slotIndex]) return { ok: false, message: "此孔已嵌宝石。" };
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return { ok: false, message: "宝石种类无效。" };
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    if (getGemStackCount(kind, level) < 1) return { ok: false, message: "行囊无此宝石。" };
    if (!consumeGemStack(kind, level, 1)) return { ok: false, message: "扣除宝石失败。" };
    item.gemSlots[slotIndex] = { kind: kind, level: level };
    return { ok: true, message: "灵光入窍，宝石已与器脉相合。" };
}

function tryUnsocketGemFromItem(item, slotIndex) {
    normalizeEquipmentGemFields(item);
    slotIndex = Math.floor(Number(slotIndex) || 0);
    if (slotIndex < 0 || slotIndex >= item.gemSlots.length) return { ok: false, message: "孔位有误。" };
    var g = item.gemSlots[slotIndex];
    if (!g) return { ok: false, message: "此孔为空。" };
    addGemStack(g.kind, g.level, 1);
    item.gemSlots[slotIndex] = null;
    return { ok: true, message: "你已取下宝石，收回行囊。" };
}

function tryMergeGemsInInventory(kind, level) {
    ensurePlayerGemStacks();
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return { ok: false, message: "种类无效。" };
    level = Math.max(1, Math.min(11, Math.floor(Number(level) || 1)));
    if (getGemStackCount(kind, level) < 3) return { ok: false, message: "需三枚同级同种宝石方可淬合升阶。" };
    consumeGemStack(kind, level, 3);
    addGemStack(kind, level + 1, 1);
    return { ok: true, message: `三枚${GEM_KIND_ZH[kind] || kind}${level}级宝石淬为一颗${level + 1}级。` };
}

/**
 * 对行囊内所有种类、各阶重复执行三合一，直到无法再淬合（在 12 阶封顶前尽量升阶）。
 * @returns {{ ok: boolean, merges?: number, message: string }}
 */
function tryMergeAllGemsInInventoryToMax() {
    ensurePlayerGemStacks();
    var total = 0;
    var guard = 0;
    var maxPasses = 5000;
    var changed = true;
    while (changed && guard < maxPasses) {
        guard++;
        changed = false;
        for (var ki = 0; ki < GEM_KINDS.length; ki++) {
            var kind = GEM_KINDS[ki];
            for (var lv = 1; lv <= 11; lv++) {
                while (getGemStackCount(kind, lv) >= 3) {
                    var res = tryMergeGemsInInventory(kind, lv);
                    if (!res.ok) return { ok: false, message: res.message || "淬合中断。", merges: total };
                    total++;
                    changed = true;
                }
            }
        }
    }
    if (guard >= maxPasses) {
        return { ok: false, message: "淬合步数异常，已中止。请反馈。", merges: total };
    }
    if (total < 1) {
        return { ok: false, message: "当前没有可淬合的宝石（需三枚同级同种）。" };
    }
    return {
        ok: true,
        merges: total,
        message: "已自动淬合 <strong>" + total + "</strong> 次，同类宝石已升至当前存量下的最高阶。",
    };
}

/** 与淬合升阶互逆：一枚 N 阶拆为三枚 N-1 阶（N≥2）。 */
function trySplitGemsInInventory(kind, level) {
    ensurePlayerGemStacks();
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return { ok: false, message: "种类无效。" };
    level = Math.max(2, Math.min(12, Math.floor(Number(level) || 2)));
    if (getGemStackCount(kind, level) < 1) return { ok: false, message: "行囊无此阶宝石可拆解。" };
    if (!consumeGemStack(kind, level, 1)) return { ok: false, message: "扣除宝石失败。" };
    addGemStack(kind, level - 1, 3);
    return { ok: true, message: `一枚${GEM_KIND_ZH[kind] || kind}${level}阶宝石拆解为三枚${level - 1}阶。` };
}

function rollGemPackLoot() {
    var out = [];
    for (var i = 0; i < 3; i++) {
        var k = GEM_KIND_ROLL_POOL[Math.floor(Math.random() * GEM_KIND_ROLL_POOL.length)];
        out.push({ kind: k, level: 1 });
    }
    return out;
}

/**
 * 使用灵宠经验果实：增加「接下来若干场斗法」灵宠击杀修为翻倍次数（叠加）。
 * @returns {{ ok: boolean, message?: string }}
 */
function tryUsePetExpFruit() {
    ensureGemMaterialsInInventory();
    if (typeof MATERIAL_PET_EXP_FRUIT === "undefined") return { ok: false, message: "材料未定义。" };
    var c = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_PET_EXP_FRUIT) : 0;
    if (c < 1) return { ok: false, message: "没有灵宠经验果实。" };
    if (typeof addMaterial === "function") addMaterial(MATERIAL_PET_EXP_FRUIT, -1);
    if (typeof player !== "undefined" && player) {
        var cur =
            typeof player.petExpDoubleCombatsRemaining === "number" && !isNaN(player.petExpDoubleCombatsRemaining)
                ? Math.max(0, Math.floor(player.petExpDoubleCombatsRemaining))
                : 0;
        player.petExpDoubleCombatsRemaining = cur + PET_EXP_DOUBLE_COMBATS_PER_FRUIT;
    }
    return {
        ok: true,
        message:
            "服下<span class=\"Legendary\">" +
            MATERIAL_PET_EXP_FRUIT_ZH +
            "</span>，接下来 <strong>" +
            PET_EXP_DOUBLE_COMBATS_PER_FRUIT +
            "</strong> 场斗法中，出战灵宠从击杀获得的修为<strong>翻倍</strong>（可与已有场次叠加）。",
    };
}

function tryOpenGemMaterialPack() {
    ensureGemMaterialsInInventory();
    var c = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_GEM_PACK) : 0;
    if (c < 1) return { ok: false, message: "没有宝石材料包。" };
    if (typeof addMaterial === "function") addMaterial(MATERIAL_GEM_PACK, -1);
    var loot = rollGemPackLoot();
    var zhParts = [];
    for (var i = 0; i < loot.length; i++) {
        addGemStack(loot[i].kind, loot[i].level, 1);
        zhParts.push(GEM_KIND_ZH[loot[i].kind] + "宝石 1级");
    }
    return { ok: true, message: "封禁一开，灵砂凝形：获得 " + zhParts.join("、") + "。" };
}

/** 连续启封多份材料包，汇总产出（用于行囊批量使用） */
function tryOpenGemMaterialPacksBatch(want) {
    ensureGemMaterialsInInventory();
    var c = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_GEM_PACK) : 0;
    if (c < 1) return { ok: false, message: "没有宝石材料包。" };
    var n = Math.floor(Number(want) || 0);
    if (n < 1) return { ok: false, message: "份数至少为 1。" };
    n = Math.min(n, c);
    var agg = {};
    for (var i = 0; i < n; i++) {
        if (typeof addMaterial === "function") addMaterial(MATERIAL_GEM_PACK, -1);
        var loot = rollGemPackLoot();
        for (var j = 0; j < loot.length; j++) {
            addGemStack(loot[j].kind, loot[j].level, 1);
            var key = loot[j].kind + "\t" + loot[j].level;
            agg[key] = (agg[key] || 0) + 1;
        }
    }
    var parts = [];
    for (var key in agg) {
        if (!Object.prototype.hasOwnProperty.call(agg, key)) continue;
        var bits = key.split("\t");
        var kind = bits[0];
        var lv = bits[1];
        parts.push((GEM_KIND_ZH[kind] || kind) + "宝石 " + lv + "级 ×" + agg[key]);
    }
    parts.sort();
    var msg = "连续启封 <strong>" + n + "</strong> 份材料包，共获得：" + parts.join("，") + "。";
    return { ok: true, message: msg, opened: n };
}

function formatGemSocketEffectSuffixZh(kind, p) {
    var s = (Math.round(p * 100) / 100).toString().replace(/\.?0+$/, "");
    if (kind === "critDmg") {
        return "暴伤 +" + s + "（与机缘同类·点）";
    }
    return "机缘类 +" + s + "%（先天×%）";
}

function formatEquipmentGemSlotsHtml(item) {
    normalizeEquipmentGemFields(item);
    var lines = [];
    lines.push("<p class=\"eq-meta-gems\">灵窍：<strong>" + item.socketCount + "/3</strong> 已开</p>");
    if (item.socketCount === 0) {
        lines.push("<p class=\"eq-meta-gems eq-meta-gems--muted\">未开孔位，需开孔器启窍后方可镶嵌。</p>");
    }
    for (var i = 0; i < item.socketCount; i++) {
        var g = item.gemSlots[i];
        if (g) {
            var p = getGemEffectiveBonusPct(g.kind, g.level);
            lines.push(
                "<p class=\"eq-meta-gems\">窍 " +
                    (i + 1) +
                    "：<span class=\"Rare\">" +
                    (GEM_KIND_ZH[g.kind] || g.kind) +
                    "宝石 " +
                    g.level +
                    "级</span>（" +
                    formatGemSocketEffectSuffixZh(g.kind, p) +
                    "）</p>"
            );
        } else {
            lines.push("<p class=\"eq-meta-gems eq-meta-gems--muted\">窍 " + (i + 1) + "：空</p>");
        }
    }
    return lines.join("");
}

function tryRollSocketOpenerFromEliteKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof enemy === "undefined" || !enemy) return;
    var qt = typeof enemy.qualityTier === "number" ? enemy.qualityTier : 0;
    if (qt < 6) return;
    if (Math.random() >= 0.1) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_SOCKET_OPENER, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`妖躯残烬中，你拾得<span class="Legendary">${MATERIAL_SOCKET_OPENER_ZH}</span> ×1。`);
    }
}

function tryRollTalentFruitFromEliteKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof enemy === "undefined" || !enemy) return;
    var qt = typeof enemy.qualityTier === "number" ? enemy.qualityTier : 0;
    if (qt < 6) return;
    if (Math.random() >= 0.1) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_TALENT_FRUIT, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`妖躯余韵未散，你拾得<span class="Legendary">${MATERIAL_TALENT_FRUIT_ZH}</span> ×1。`);
    }
}

function grantSocketOpenerDungeonGuardian() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_SOCKET_OPENER, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`镇守伏诛，殿前遗落<span class="Legendary">${MATERIAL_SOCKET_OPENER_ZH}</span> ×1。`);
    }
}

function grantTalentFruitDungeonGuardian() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_TALENT_FRUIT, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`镇守伏诛，殿前遗落<span class="Legendary">${MATERIAL_TALENT_FRUIT_ZH}</span> ×1。`);
    }
}

/** 战斗胜利：妖躯品质「头领」档及以上（tier≥5）有概率掉落生命药剂 */
/** 秘境：仅「最后一劫」镇守（头目）击杀时按 PET_EXP_FRUIT_GUARDIAN_DROP_CHANCE 概率掉落（不含秘境主宰等） */
function tryRollPetExpFruitFromDungeonBossKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof mining !== "undefined" && mining && mining.active) return;
    if (typeof dungeon === "undefined" || !dungeon || !dungeon.status || !dungeon.status.exploring) return;
    if (typeof enemy === "undefined" || !enemy) return;
    if (enemy.bossRole !== "guardian") return;
    if (!dungeon.progress) return;
    var room = Math.max(1, Math.floor(Number(dungeon.progress.room) || 1));
    var rl = Math.max(1, Math.floor(Number(dungeon.progress.roomLimit) || 20));
    if (room !== rl) return;
    if (Math.random() >= PET_EXP_FRUIT_GUARDIAN_DROP_CHANCE) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function" && typeof MATERIAL_PET_EXP_FRUIT !== "undefined") {
        addMaterial(MATERIAL_PET_EXP_FRUIT, 1);
    }
    if (typeof addCombatLog === "function" && typeof MATERIAL_PET_EXP_FRUIT_ZH !== "undefined") {
        addCombatLog(`劫尘凝露，你收得<span class="Legendary">${MATERIAL_PET_EXP_FRUIT_ZH}</span> ×1。`);
    }
}

function tryRollLifePotionFromQualityKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof mining !== "undefined" && mining && mining.active) return;
    if (typeof enemy === "undefined" || !enemy) return;
    var qt = typeof enemy.qualityTier === "number" ? enemy.qualityTier : 0;
    if (qt < LIFE_POTION_MIN_QUALITY_TIER) return;
    if (Math.random() >= LIFE_POTION_DROP_CHANCE) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_LIFE_POTION, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`残躯余蕴未散，你收得<span class="Rare">${MATERIAL_LIFE_POTION_ZH}</span> ×1。`);
    }
}

/** 秘境：劫数 20 的 BOSS（guardian/sboss）击杀时，50% 概率掉落秘境穿梭器 */
function tryRollSecretRealmWarpFromJie20BossKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof mining !== "undefined" && mining && mining.active) return;
    if (typeof dungeon === "undefined" || !dungeon || !dungeon.status || !dungeon.status.exploring) return;
    if (typeof enemy === "undefined" || !enemy) return;
    if (enemy.bossRole !== "guardian" && enemy.bossRole !== "sboss") return;
    if (!dungeon.progress) return;
    var room = Math.max(1, Math.floor(Number(dungeon.progress.room) || 1));
    if (room !== 20) return;
    if (Math.random() >= SECRET_REALM_WARP_BOSS_DROP_CHANCE) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function" && typeof MATERIAL_SECRET_REALM_WARP !== "undefined") {
        addMaterial(MATERIAL_SECRET_REALM_WARP, 1);
    }
    if (typeof addCombatLog === "function" && typeof MATERIAL_SECRET_REALM_WARP_ZH !== "undefined") {
        addCombatLog(`界纹震鸣，你收得<span class="Legendary">${MATERIAL_SECRET_REALM_WARP_ZH}</span> ×1。`);
    }
}

/** 镶嵌选择：弹出层列出当前行囊中的宝石堆叠 */
function openGemInlayChooser(slotIndex, onChosen) {
    slotIndex = Math.floor(Number(slotIndex) || 0);
    ensurePlayerGemStacks();
    var choices = [];
    for (var ki = 0; ki < GEM_KINDS.length; ki++) {
        var k = GEM_KINDS[ki];
        for (var lv = 1; lv <= 12; lv++) {
            var c = getGemStackCount(k, lv);
            if (c > 0) {
                choices.push({ kind: k, level: lv, count: c });
            }
        }
    }
    if (!choices.length) {
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>行囊暂无可用宝石。</p><div class="button-container"><button type="button" id="gem-inlay-empty-ok">知晓</button></div></div>';
            var ok = document.querySelector("#gem-inlay-empty-ok");
            if (ok) {
                ok.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
        }
        return;
    }
    var btns = choices
        .map(function (ch, idx) {
            var zh = GEM_KIND_ZH[ch.kind] || ch.kind;
            return (
                '<button type="button" class="btn btn--sm btn--ghost gem-inlay-pick" data-idx="' +
                idx +
                '">' +
                zh +
                " " +
                ch.level +
                "级 ×" +
                ch.count +
                "</button>"
            );
        })
        .join("");
    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML =
            '<div class="content"><p>选择嵌入窍 ' +
            (slotIndex + 1) +
            ' 的宝石</p><div class="button-container" style="flex-wrap:wrap;justify-content:flex-start;gap:0.4rem">' +
            btns +
            '</div><div class="button-container"><button type="button" id="gem-inlay-cancel">作罢</button></div></div>';
        var cancel = document.querySelector("#gem-inlay-cancel");
        if (cancel) {
            cancel.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
            };
        }
        var picks = document.querySelectorAll(".gem-inlay-pick");
        for (var i = 0; i < picks.length; i++) {
            picks[i].onclick = function () {
                var ix = Math.floor(Number(this.getAttribute("data-idx")) || 0);
                var ch = choices[ix];
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                if (ch && typeof onChosen === "function") onChosen(ch.kind, ch.level);
            };
        }
    }
}
