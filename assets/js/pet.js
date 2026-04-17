/**
 * 灵宠栏：最多 20 只；出战 1 只提供机缘并入斗法协同攻击；掉落 / 修为 / 成长。
 */

var petModalOpen = false;

/** 当前在面板中编辑的灵宠 id（仅 UI） */
var petPanelFocusId = null;

var PET_COLLECTION_MAX = 20;

var PET_DROP_CHANCE = 0.01;

/** 灵根 raw：每项基础值随层上升，且整体品质随层指数放大（不设上限） */
var PET_ROOT_RAW_LO = 4;
var PET_ROOT_BASE_SPAN = 42;
var PET_ROOT_FLOOR_SPAN_PER = 0.65;
var PET_ROOT_MIN_SPAN = 22;
var PET_ROOT_FLOOR_BASE_GAIN = 0.72;
var PET_ROOT_FLOOR_QUALITY_EXP = 1.032;
var PET_ROOT_VARIANCE_PCT = 0.2;
/** 灵宠年份品质：
 * - rootMult：在幼年基础上的五行灵根倍率
 * - bonusMinPct / bonusMaxPct：斗法推演额外加成区间（百分比），按档随机
 *   幼年：0-10%，十年：5-20%，百年：10-30%，千年：20-40%，万年：30-50%，十万年：40-60%
 */
var PET_AGE_TIERS = [
    { id: "young", name: "幼年", chance: 0.9189, rootMult: 1.0, bonusMinPct: 0, bonusMaxPct: 10 },
    { id: "10y", name: "十年", chance: 0.05, rootMult: 1.1, bonusMinPct: 5, bonusMaxPct: 20 },
    { id: "100y", name: "百年", chance: 0.02, rootMult: 1.2, bonusMinPct: 10, bonusMaxPct: 30 },
    { id: "1000y", name: "千年", chance: 0.01, rootMult: 1.3, bonusMinPct: 20, bonusMaxPct: 40 },
    { id: "10000y", name: "万年", chance: 0.001, rootMult: 1.4, bonusMinPct: 30, bonusMaxPct: 50 },
    { id: "100000y", name: "十万年", chance: 0.0001, rootMult: 1.5, bonusMinPct: 40, bonusMaxPct: 60 }
];

/** 主人修为按此比例给【出战】灵宠（仅击杀战斗怪物、经 playerExpGain 分流时生效；奇遇等不加灵宠经验） */
var PET_EXP_SHARE_FROM_PLAYER = 0.27;
/** 灵宠整体强度倍率（并入人物机缘 + 斗法推演基础） */
var PET_GLOBAL_POWER_MULT = 1.5;
/** 「机缘加成」并入人物与面板展示再乘（3 = 相对原机缘数值三倍） */
var PET_OPPORTUNITY_BONUS_MULT = 3;
/** 「斗法推演」最终出手参数再乘（1.5 = 在现算式结果上再提升 0.5 倍） */
var PET_COMBAT_DEDUCTION_MULT = 1.5;

/** 洞天劫：出战灵宠境界上限 — 历史最高等级 + 10（maxDungeonFloorLvl，缺省同当前修为） */
function getPlayerDongtianHistLevelForPetDeploy() {
    if (typeof player === "undefined" || !player) return 1;
    var h =
        typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl)
            ? Math.floor(player.maxDungeonFloorLvl)
            : Math.floor(typeof player.lvl === "number" && !isNaN(player.lvl) ? player.lvl : 1);
    return Math.max(1, h);
}

function getMaxDeployPetLevel() {
    return getPlayerDongtianHistLevelForPetDeploy() + 10;
}

function isPetDeployLevelAllowed(pet) {
    if (!pet) return false;
    var petLvlRaw = typeof pet.lvl === "number" ? pet.lvl : Number(pet.lvl);
    var petLvl = Math.max(1, Math.floor(isFinite(petLvlRaw) ? petLvlRaw : 1));
    return petLvl <= getMaxDeployPetLevel();
}

/**
 * 若当前出战灵宠境界超过「历史最高 + 10」，自动卸下（不出战）。
 * @returns {boolean} 是否发生了卸下
 */
function enforceActivePetDeployLevelLimit() {
    if (typeof player === "undefined" || !player || !Array.isArray(player.petCollection)) return false;
    var aid = player.activePetId;
    if (!aid) return false;
    var pet = null;
    for (var i = 0; i < player.petCollection.length; i++) {
        if (player.petCollection[i] && player.petCollection[i].id === aid) {
            pet = player.petCollection[i];
            break;
        }
    }
    if (!pet) return false;
    if (isPetDeployLevelAllowed(pet)) return false;
    player.activePetId = null;
    if (typeof saveData === "function") saveData();
    if (typeof calculateStats === "function") calculateStats();
    if (typeof playerLoadStats === "function") playerLoadStats();
    return true;
}

var PET_EXP_BASE_MAX = 172;

/** 妖力：用于推动灵宠年份进阶（幼年→十年→百年→千年→万年→十万年） */
var PET_YAOLI_REQ_TO_NEXT_BY_TIER_ID = {
    young: 100,
    "10y": 500,
    "100y": 1000,
    "1000y": 5000,
    "10000y": 10000,
    "100000y": 0
};

function getPetAgeTierIndex(ageTierId) {
    for (var i = 0; i < PET_AGE_TIERS.length; i++) {
        if (PET_AGE_TIERS[i].id === ageTierId) return i;
    }
    return 0;
}

function getPetNextAgeTierId(ageTierId) {
    var idx = getPetAgeTierIndex(ageTierId);
    if (idx < 0) idx = 0;
    if (idx >= PET_AGE_TIERS.length - 1) return null;
    return PET_AGE_TIERS[idx + 1].id;
}

function getPetYaoliReqToNext(ageTierId) {
    var req = PET_YAOLI_REQ_TO_NEXT_BY_TIER_ID[ageTierId];
    return typeof req === "number" && isFinite(req) ? Math.max(0, Math.floor(req)) : 0;
}

function rollAgeBonusPctForTierId(ageTierId) {
    var def = getPetAgeTierDef(ageTierId);
    if (!def) return 0;
    if (typeof def.bonusMinPct === "number" && typeof def.bonusMaxPct === "number") {
        var lo = def.bonusMinPct;
        var hi = def.bonusMaxPct;
        if (hi < lo) {
            var tmp = lo;
            lo = hi;
            hi = tmp;
        }
        return lo + Math.random() * (hi - lo);
    }
    return 0;
}

function applyPetAgeTierUpgrade(pet, nextTierId) {
    if (!pet) return false;
    normalizePetObject(pet);
    var curDef = getPetAgeTierDef(pet.ageTier);
    var nextDef = getPetAgeTierDef(nextTierId);
    if (!nextDef || !nextDef.id || nextDef.id === pet.ageTier) return false;
    // 年份提升五行：按 rootMult 的“相对倍率”补偿（避免重复按幼年倍率）
    var curM = curDef && typeof curDef.rootMult === "number" && isFinite(curDef.rootMult) && curDef.rootMult > 0 ? curDef.rootMult : 1;
    var nextM = typeof nextDef.rootMult === "number" && isFinite(nextDef.rootMult) && nextDef.rootMult > 0 ? nextDef.rootMult : curM;
    var ratio = nextM / curM;
    if (!pet.roots || typeof pet.roots !== "object") pet.roots = {};
    for (var i = 0; i < PET_ROOT_KEYS.length; i++) {
        var k = PET_ROOT_KEYS[i];
        var v = typeof pet.roots[k] === "number" && isFinite(pet.roots[k]) ? pet.roots[k] : 18;
        pet.roots[k] = Math.max(1, Math.round(v * ratio));
    }
    pet.ageTier = nextDef.id;
    pet.ageBonusPct = rollAgeBonusPctForTierId(nextDef.id);
    rebuildPetBonusStats(pet);
    return true;
}

function addPetYaoli(pet, amount, context) {
    if (!pet) return { ok: false, message: "无灵宠。" };
    normalizePetObject(pet);
    amount = Math.floor(Number(amount) || 0);
    if (!amount) return { ok: false, message: "无增益。" };
    if (typeof pet.yaoli !== "number" || !isFinite(pet.yaoli)) pet.yaoli = 0;
    pet.yaoli = Math.max(0, Math.floor(pet.yaoli + amount));

    var upgraded = false;
    var safety = 0;
    while (safety++ < 12) {
        var req = getPetYaoliReqToNext(pet.ageTier);
        var nextId = getPetNextAgeTierId(pet.ageTier);
        if (!req || !nextId) break;
        if (pet.yaoli < req) break;
        pet.yaoli -= req;
        if (applyPetAgeTierUpgrade(pet, nextId)) {
            upgraded = true;
            continue;
        }
        break;
    }
    if (upgraded) {
        if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
    }
    if (typeof saveData === "function") saveData();
    if (context === "petPanel" && typeof renderPetPanel === "function") renderPetPanel();
    return { ok: true, upgraded: upgraded };
}

function getPetExpMaxIncrease(curMax) {
    curMax = Math.max(PET_EXP_BASE_MAX, curMax || PET_EXP_BASE_MAX);
    return Math.floor(curMax * 0.152 + 188);
}

/** 灵宠悟性：整体难度 = 原设计 × 此倍率（约 2 倍更难） */
var PET_EXP_DIFFICULTY_BASE_MULT = 2;
/** 每高 1 级，悟性门槛再乘 (1 + 此系数 × (等级−1))；系数越大高等级越陡 */
var PET_EXP_DIFFICULTY_PER_LEVEL = 0.065;

function getPetExpDifficultyMult(lvl) {
    lvl = Math.max(1, Math.floor(lvl || 1));
    return PET_EXP_DIFFICULTY_BASE_MULT * (1 + (lvl - 1) * PET_EXP_DIFFICULTY_PER_LEVEL);
}

/** 当前境界下单级悟性需求（升级后按当前等级重新计） */
function getPetExpRequired(pet) {
    if (!pet || !pet.exp) return PET_EXP_BASE_MAX;
    normalizePetObject(pet);
    var lvl = Math.max(1, pet.lvl);
    var baseReq = Math.max(1, Math.floor(pet.exp.expMaxLvl || getPetExpMaxIncrease(pet.exp.expMax)));
    return Math.max(1, Math.floor(baseReq * getPetExpDifficultyMult(lvl)));
}

/** 面板「+」展示：下一档设计增量 × 当前等级难度 */
function getPetExpNextGrowDisplay(pet) {
    normalizePetObject(pet);
    var inc = getPetExpMaxIncrease(pet.exp.expMax);
    if (pet.lvl > 100) inc = 680000;
    return Math.max(1, Math.floor(inc * getPetExpDifficultyMult(pet.lvl)));
}

var PET_TYPE_IDS = ["attack", "defense", "stamina", "balanced"];

var PET_TYPE_LABEL_ZH = {
    attack: "攻击型",
    defense: "防御型",
    stamina: "体力型",
    balanced: "平衡型"
};

var PET_ROOT_KEYS = ["metal", "wood", "water", "fire", "earth"];

var PET_ROOT_LABEL_ZH = {
    metal: "金",
    wood: "木",
    water: "水",
    fire: "火",
    earth: "土"
};

var PET_ROOT_WEIGHT_BY_STAT = {
    hp: { metal: 0.06, wood: 0.38, water: 0.14, fire: 0.07, earth: 0.35 },
    atk: { metal: 0.42, wood: 0.06, water: 0.06, fire: 0.38, earth: 0.08 },
    def: { metal: 0.1, wood: 0.12, water: 0.36, fire: 0.08, earth: 0.34 },
    atkSpd: { metal: 0.18, wood: 0.16, water: 0.12, fire: 0.44, earth: 0.1 },
    vamp: { metal: 0.06, wood: 0.12, water: 0.52, fire: 0.2, earth: 0.1 },
    critRate: { metal: 0.46, wood: 0.1, water: 0.08, fire: 0.3, earth: 0.06 },
    critDmg: { metal: 0.22, wood: 0.06, water: 0.08, fire: 0.52, earth: 0.12 }
};

/** 相对平衡型 1.0 的机缘成长倍率；强弱项相对初版表拉开约 88%（1±|Δ|×1.88） */
var PET_TYPE_GROWTH_MULT = {
    attack: { hp: 0.51, atk: 1.68, def: 0.62, atkSpd: 1.15, vamp: 1.04, critRate: 1.38, critDmg: 1.41 },
    defense: { hp: 1.45, atk: 0.59, def: 1.68, atkSpd: 0.89, vamp: 1.04, critRate: 0.77, critDmg: 0.77 },
    stamina: { hp: 1.94, atk: 0.7, def: 1.23, atkSpd: 0.89, vamp: 1.11, critRate: 0.81, critDmg: 0.74 },
    balanced: { hp: 1, atk: 1, def: 1, atkSpd: 1, vamp: 1, critRate: 1, critDmg: 1 }
};

/** 随机灵兽名（两字/三字组合，量足） */
var PET_NAME_PARTS_A = [
    "墨", "玄", "青", "赤", "苍", "银", "金", "幽", "炎", "霜", "雷", "风", "云", "月", "星", "玉", "雪", "焰", "璃", "魄",
    "噬", "裂", "渊", "穹", "澜", "霄", "冥", "曜", "绫", "珀", "蛟", "鸾", "鲤", "鹏", "麒", "饕", "狰", "魈", "魍", "貅",
    "夔", "犼", "兕", "貔", "貅", "玃", "獬", "驺", "应", "鲲", "鹏", "枭", "隼", "鹓", "鶸", "鸪", "麝", "犴", "豸", "螭"
];
var PET_NAME_PARTS_B = [
    "渊", "璃", "霄", "翎", "珮", "瞳", "牙", "尾", "犼", "貅", "鹏", "煞", "魇", "魁", "玑", "垣", "琅", "珂", "琥", "珀",
    "龙", "凤", "虎", "豹", "猿", "狐", "蛇", "龟", "鹿", "鹤", "鸦", "蝉", "蝶", "蛛", "蛟", "鲤", "鲸", "貅", "犼", "鸾",
    "貊", "貍", "貅", "犴", "貔貅", "狻", "猊", "獾", "貘", "麝", "彪", "骓", "骊", "骢", "骜", "隼", "鹗", "鴞", "蜃", "鳌"
];
var PET_NAME_PREFIX = [
    "小", "幼", "野", "灵", "碧", "赤", "玄", "青", "苍", "幽", "血", "铁", "雷", "雾", "冰", "火", "山", "海", "云", "星",
    "铁", "铜", "木", "水", "沙", "石", "金", "银", "玉", "砂", "潮", "朔", "朔", "冥", "曦", "昙", "晦", "翳", "曜", "霏"
];
var PET_NAME_SUFFIX = [
    "儿", "奴", "童", "奴儿", "仔", "崽", "奴", "侯", "卫", "使", "奴", "精", "怪", "妖", "灵", "影", "魄", "魂", "魅", "魑",
    "奴", "宝", "童", "郎", "姑", "婢", "奴", "奴", "君", "姬", "叟", "娃", "囡", "囝", "徒", "侍", "卫", "奴", "僮", "僮"
];

function pickRandomPetName() {
    var roll = Math.random();
    if (roll < 0.34) {
        return (
            PET_NAME_PREFIX[Math.floor(Math.random() * PET_NAME_PREFIX.length)] +
            PET_NAME_PARTS_B[Math.floor(Math.random() * PET_NAME_PARTS_B.length)]
        );
    }
    if (roll < 0.68) {
        return (
            PET_NAME_PARTS_A[Math.floor(Math.random() * PET_NAME_PARTS_A.length)] +
            PET_NAME_PARTS_B[Math.floor(Math.random() * PET_NAME_PARTS_B.length)]
        );
    }
    return (
        PET_NAME_PARTS_A[Math.floor(Math.random() * PET_NAME_PARTS_A.length)] +
        PET_NAME_PARTS_B[Math.floor(Math.random() * PET_NAME_PARTS_B.length)] +
        PET_NAME_SUFFIX[Math.floor(Math.random() * PET_NAME_SUFFIX.length)]
    );
}

function petRootAptitudeMult(statKey, roots) {
    if (!roots) return 1;
    var w = PET_ROOT_WEIGHT_BY_STAT[statKey];
    if (!w) return 1;
    var dot = 0;
    for (var i = 0; i < PET_ROOT_KEYS.length; i++) {
        var k = PET_ROOT_KEYS[i];
        var rk = roots[k];
        if (typeof rk !== "number" || isNaN(rk)) continue;
        dot += (rk / 100) * (w[k] || 0);
    }
    return 1 + dot * 0.42;
}

function getPetDropFloorForRoll() {
    if (typeof dungeon !== "undefined" && dungeon && dungeon.progress && typeof dungeon.progress.floor === "number") {
        return Math.max(1, Math.floor(dungeon.progress.floor));
    }
    if (typeof enemy !== "undefined" && enemy && typeof enemy.lvl === "number") {
        return Math.max(1, Math.floor(enemy.lvl));
    }
    return 1;
}

/**
 * 秘境层数对应的「修为不宜过高」阈限：第 1 层 16，第 2 层 21，之后每层 +5。
 * 超过则出战灵宠并入人物的机缘按 -99999% 计（见 getActivePetBonusStats）。
 */
function getDungeonFloorPetOpportunityLevelCap(floor) {
    floor = Math.max(1, Math.floor(Number(floor) || 1));
    return 15 + (floor - 1) * 5;
}

function getCurrentDungeonFloorForPetOpportunityRule() {
    if (typeof dungeon !== "undefined" && dungeon && dungeon.progress && typeof dungeon.progress.floor === "number") {
        return Math.max(1, Math.floor(dungeon.progress.floor));
    }
    return 1;
}

/** 当前修为是否超出本秘境层机缘阈限（超过则压制出战灵宠机缘） */
function isPlayerLevelOverPetOpportunityCapForCurrentFloor() {
    if (typeof player === "undefined" || !player) return false;
    var cap = getDungeonFloorPetOpportunityLevelCap(getCurrentDungeonFloorForPetOpportunityRule());
    var pl = typeof player.lvl === "number" && !isNaN(player.lvl) ? Math.floor(player.lvl) : 1;
    return pl > cap;
}

/** 灵宠面板展示用机缘数值（出战且压制时与并入人物一致，显示为 -99999%） */
function getPetBonusStatsDisplayForPanel(pet) {
    if (!pet || !pet.bonusStats) {
        return { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    }
    var b = pet.bonusStats;
    if (
        typeof player !== "undefined" &&
        player &&
        player.activePetId === pet.id &&
        isPlayerLevelOverPetOpportunityCapForCurrentFloor()
    ) {
        var P = -99999;
        return { hp: P, atk: P, def: P, atkSpd: P, vamp: P, critRate: P, critDmg: P };
    }
    var om =
        typeof PET_OPPORTUNITY_BONUS_MULT === "number" && isFinite(PET_OPPORTUNITY_BONUS_MULT) && PET_OPPORTUNITY_BONUS_MULT > 0
            ? PET_OPPORTUNITY_BONUS_MULT
            : 3;
    return {
        hp: (b.hp || 0) * om,
        atk: (b.atk || 0) * om,
        def: (b.def || 0) * om,
        atkSpd: (b.atkSpd || 0) * om,
        vamp: (b.vamp || 0) * om,
        critRate: (b.critRate || 0) * om,
        critDmg: (b.critDmg || 0) * om
    };
}

function rollPetRoots(floorOpt) {
    var floor = typeof floorOpt === "number" && floorOpt >= 1 ? Math.floor(floorOpt) : 1;
    var span = PET_ROOT_BASE_SPAN + (floor - 1) * PET_ROOT_FLOOR_SPAN_PER;
    span = Math.max(PET_ROOT_MIN_SPAN, span);
    var qualityMul = Math.pow(PET_ROOT_FLOOR_QUALITY_EXP, floor - 1);
    var out = {};
    for (var i = 0; i < 5; i++) {
        var k = PET_ROOT_KEYS[i];
        var rawVal = PET_ROOT_RAW_LO + floor * PET_ROOT_FLOOR_BASE_GAIN + Math.random() * span;
        var varianceMul = 1 + ((Math.random() * 2 - 1) * PET_ROOT_VARIANCE_PCT); // 0.8 ~ 1.2
        // 高层灵根整体更高，且无硬上限
        out[k] = Math.max(8, Math.round(rawVal * qualityMul * varianceMul));
    }
    return out;
}

function getPetAgeTierDef(ageTierId) {
    for (var i = 0; i < PET_AGE_TIERS.length; i++) {
        if (PET_AGE_TIERS[i].id === ageTierId) return PET_AGE_TIERS[i];
    }
    return PET_AGE_TIERS[0];
}

function rollPetAgeTier() {
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < PET_AGE_TIERS.length; i++) {
        acc += PET_AGE_TIERS[i].chance;
        if (r < acc) return PET_AGE_TIERS[i];
    }
    return PET_AGE_TIERS[0];
}

function applyPetRootQualityMult(roots, mult) {
    var out = {};
    var m = typeof mult === "number" && mult > 0 ? mult : 1;
    for (var i = 0; i < PET_ROOT_KEYS.length; i++) {
        var k = PET_ROOT_KEYS[i];
        var rv = roots && typeof roots[k] === "number" ? roots[k] : 0;
        out[k] = Math.max(1, Math.round(rv * m));
    }
    return out;
}

function newPetId() {
    return "pet_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e9);
}

function createNewPetState(typeId, roots, nameOpt, ageTierId) {
    typeId = PET_TYPE_IDS.indexOf(typeId) >= 0 ? typeId : "balanced";
    var ageDef = getPetAgeTierDef(ageTierId);
    var finalRoots = roots || rollPetRoots();
    finalRoots = applyPetRootQualityMult(finalRoots, ageDef.rootMult);
    var ageBonusPct = 0;
    if (typeof ageDef.bonusMinPct === "number" && typeof ageDef.bonusMaxPct === "number") {
        var lo = ageDef.bonusMinPct;
        var hi = ageDef.bonusMaxPct;
        if (hi < lo) {
            var tmp = lo;
            lo = hi;
            hi = tmp;
        }
        ageBonusPct = lo + Math.random() * (hi - lo);
    }
    return {
        id: newPetId(),
        name: nameOpt || pickRandomPetName(),
        type: typeId,
        ageTier: ageDef.id,
        /** 斗法推演额外加成（百分比），按年份档随机一次固化在此 */
        ageBonusPct: ageBonusPct,
        /** 妖力：以天赋果喂养等方式累积，用于年份进阶 */
        yaoli: 0,
        roots: finalRoots,
        lvl: 1,
        exp: {
            expCurr: 0,
            expMax: PET_EXP_BASE_MAX,
            expCurrLvl: 0,
            expMaxLvl: getPetExpMaxIncrease(PET_EXP_BASE_MAX)
        },
        bonusStats: {
            hp: 0,
            atk: 0,
            def: 0,
            atkSpd: 0,
            vamp: 0,
            critRate: 0,
            critDmg: 0
        }
    };
}

function migratePlayerPets() {
    if (typeof player === "undefined" || !player) return;
    if (!Array.isArray(player.petCollection)) player.petCollection = [];
    if (player.pet && typeof player.pet === "object") {
        var leg = player.pet;
        if (!leg.id) leg.id = newPetId();
        if (player.petCollection.every(function (x) { return x.id !== leg.id; })) {
            player.petCollection.push(leg);
        }
        if (!player.activePetId) player.activePetId = leg.id;
        delete player.pet;
    }
    if (typeof player.activePetId !== "string") player.activePetId = player.activePetId || null;
    if (player.petCollection.length > PET_COLLECTION_MAX) {
        player.petCollection = player.petCollection.slice(0, PET_COLLECTION_MAX);
    }
}

function ensurePlayerPetCollection() {
    migratePlayerPets();
    if (player.activePetId && typeof getPetById === "function" && !getPetById(player.activePetId)) {
        player.activePetId = player.petCollection.length ? player.petCollection[0].id : null;
    }
    enforceActivePetDeployLevelLimit();
}

function getPetById(id) {
    if (!id || !player || !Array.isArray(player.petCollection)) return null;
    for (var i = 0; i < player.petCollection.length; i++) {
        if (player.petCollection[i].id === id) return player.petCollection[i];
    }
    return null;
}

function getActivePet() {
    ensurePlayerPetCollection();
    return getPetById(player.activePetId);
}

function getActivePetBonusStats() {
    if (isPlayerLevelOverPetOpportunityCapForCurrentFloor()) {
        var P = -99999;
        return { hp: P, atk: P, def: P, atkSpd: P, vamp: P, critRate: P, critDmg: P };
    }
    var pet = getActivePet();
    if (!pet) {
        return { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    }
    normalizePetObject(pet);
    var b = pet.bonusStats || { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var om =
        typeof PET_OPPORTUNITY_BONUS_MULT === "number" && isFinite(PET_OPPORTUNITY_BONUS_MULT) && PET_OPPORTUNITY_BONUS_MULT > 0
            ? PET_OPPORTUNITY_BONUS_MULT
            : 3;
    var g = typeof PET_GLOBAL_POWER_MULT === "number" && isFinite(PET_GLOBAL_POWER_MULT) ? PET_GLOBAL_POWER_MULT : 1.5;
    var merge = g * om;
    return {
        hp: (b.hp || 0) * merge,
        atk: (b.atk || 0) * merge,
        def: (b.def || 0) * merge,
        atkSpd: (b.atkSpd || 0) * merge,
        vamp: (b.vamp || 0) * merge,
        critRate: (b.critRate || 0) * merge,
        critDmg: (b.critDmg || 0) * merge
    };
}

function setActivePetId(id) {
    ensurePlayerPetCollection();
    if (!id) {
        player.activePetId = null;
    } else {
        var target = getPetById(id);
        if (!target) return;
        if (!isPetDeployLevelAllowed(target)) {
            var cap = getMaxDeployPetLevel();
            var lr =
                typeof target.lvl === "number" ? target.lvl : Number(target.lvl);
            var lv = Math.max(1, Math.floor(isFinite(lr) ? lr : 1));
            if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content"><p>无法出战：该灵兽为 ' +
                    lv +
                    " 级，超出上限 " +
                    cap +
                    "（历史最高等级 + 10）。</p>" +
                    '<div class="button-container"><button type="button" id="pet-deploy-limit-ok">知晓</button></div></div>';
                var pok = document.querySelector("#pet-deploy-limit-ok");
                if (pok) {
                    pok.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                    };
                }
            }
            return;
        }
        player.activePetId = id;
    }
    if (typeof saveData === "function") saveData();
    if (typeof calculateStats === "function") calculateStats();
    if (typeof playerLoadStats === "function") playerLoadStats();
}

function normalizePetObject(p) {
    if (!p) return;
    if (!p.id) p.id = newPetId();
    if (PET_TYPE_IDS.indexOf(p.type) < 0) p.type = "balanced";
    if (!p.roots || typeof p.roots !== "object") {
        p.roots = {};
        for (var ri = 0; ri < PET_ROOT_KEYS.length; ri++) {
            p.roots[PET_ROOT_KEYS[ri]] = 18;
        }
    } else {
        for (var i = 0; i < PET_ROOT_KEYS.length; i++) {
            var rk = PET_ROOT_KEYS[i];
            if (typeof p.roots[rk] !== "number" || isNaN(p.roots[rk])) p.roots[rk] = 18;
        }
    }
    if (typeof p.lvl !== "number" || p.lvl < 1) p.lvl = 1;
    if (!p.name) p.name = pickRandomPetName();
    var ageDef = getPetAgeTierDef(p.ageTier);
    p.ageTier = ageDef.id;
    if (typeof p.ageBonusPct !== "number") {
        if (typeof ageDef.bonusMinPct === "number" && typeof ageDef.bonusMaxPct === "number") {
            p.ageBonusPct = (ageDef.bonusMinPct + ageDef.bonusMaxPct) / 2;
        } else {
            p.ageBonusPct = 0;
        }
    }
    if (typeof p.yaoli !== "number" || !isFinite(p.yaoli) || p.yaoli < 0) {
        p.yaoli = 0;
    }
    if (!p.bonusStats || typeof p.bonusStats !== "object") {
        p.bonusStats = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    }
    if (!p.exp || typeof p.exp !== "object") {
        p.exp = { expCurr: 0, expMax: PET_EXP_BASE_MAX, expCurrLvl: 0, expMaxLvl: getPetExpMaxIncrease(PET_EXP_BASE_MAX) };
    } else {
        if (typeof p.exp.expMax !== "number" || p.exp.expMax < PET_EXP_BASE_MAX) p.exp.expMax = PET_EXP_BASE_MAX;
        if (typeof p.exp.expCurr !== "number") p.exp.expCurr = 0;
        if (typeof p.exp.expCurrLvl !== "number" || p.exp.expCurrLvl < 0) p.exp.expCurrLvl = 0;
        if (typeof p.exp.expMaxLvl !== "number" || p.exp.expMaxLvl < 1) p.exp.expMaxLvl = getPetExpMaxIncrease(p.exp.expMax);
    }
    rebuildPetBonusStats(p);
}

/** 单层机缘成长（随类型与灵根） */
function addOnePetGrowthTick(pet) {
    if (!pet || !pet.bonusStats) return;
    var roots = pet.roots;
    var tm = PET_TYPE_GROWTH_MULT[pet.type] || PET_TYPE_GROWTH_MULT.balanced;
    var b = pet.bonusStats;
    b.hp += (8 / 3) * (tm.hp || 1) * petRootAptitudeMult("hp", roots);
    b.atk += (4 / 3) * (tm.atk || 1) * petRootAptitudeMult("atk", roots);
    b.def += (4 / 3) * (tm.def || 1) * petRootAptitudeMult("def", roots);
    b.atkSpd += (0.5 / 3) * (tm.atkSpd || 1) * petRootAptitudeMult("atkSpd", roots);
    b.vamp += (0.15 / 3) * (tm.vamp || 1) * petRootAptitudeMult("vamp", roots);
    b.critRate += (0.2 / 3) * (tm.critRate || 1) * petRootAptitudeMult("critRate", roots);
    b.critDmg += (0.5 / 3) * (tm.critDmg || 1) * petRootAptitudeMult("critDmg", roots);
}

/** 按当前境界层数重算机缘（每层叠一层；炼气 1 层也有基础机缘） */
function rebuildPetBonusStats(pet) {
    if (!pet) return;
    pet.bonusStats = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var lv = Math.max(1, Math.floor(pet.lvl) || 1);
    for (var i = 0; i < lv; i++) {
        addOnePetGrowthTick(pet);
    }
}

function ensurePlayerPet() {
    ensurePlayerPetCollection();
}

function petLvlUpFor(pet) {
    if (!pet) return;
    normalizePetObject(pet);
    var inc = getPetExpMaxIncrease(pet.exp.expMax);
    if (pet.lvl > 100) inc = 680000;
    pet.lvl++;
    pet.exp.expMax += inc;
    pet.exp.expMaxLvl = getPetExpMaxIncrease(pet.exp.expMax);
    if (pet.lvl > 100) pet.exp.expMaxLvl = 680000;
    normalizePetObject(pet);
}

function addPetExp(amount, fromMonsterKill) {
    if (fromMonsterKill !== true) return;
    if (!amount || amount < 0) return;
    ensurePlayerPetCollection();
    var pet = getActivePet();
    if (!pet) return;
    var histLvl = getPlayerDongtianHistLevelForPetDeploy();
    var capLvl = histLvl + 10;
    // 已达出战境界上限则不再吸收修为（原先仅用「>」且 while 内不校验，单笔大额经验可连升多级突破上限）
    if (pet.lvl >= capLvl) return;
    normalizePetObject(pet);
    var grant = Math.max(0, Math.floor(amount));
    if (grant < 1) return;
    if (typeof player !== "undefined" && player) {
        var rem =
            typeof player.petExpDoubleCombatsRemaining === "number" && !isNaN(player.petExpDoubleCombatsRemaining)
                ? Math.max(0, Math.floor(player.petExpDoubleCombatsRemaining))
                : 0;
        if (rem > 0) {
            grant = Math.max(0, Math.floor(amount * 2));
            player.petExpDoubleCombatsRemaining = rem - 1;
        }
    }
    pet.exp.expCurr += grant;
    pet.exp.expCurrLvl += grant;
    while (pet.exp.expCurrLvl >= getPetExpRequired(pet) && pet.lvl < capLvl) {
        pet.exp.expCurrLvl -= getPetExpRequired(pet);
        petLvlUpFor(pet);
    }
}

function createDroppedPet(floorOpt) {
    var floor = typeof floorOpt === "number" && floorOpt >= 1 ? Math.floor(floorOpt) : getPetDropFloorForRoll();
    var t = PET_TYPE_IDS[Math.floor(Math.random() * PET_TYPE_IDS.length)];
    var ageDef = rollPetAgeTier();
    return createNewPetState(t, rollPetRoots(floor), pickRandomPetName(), ageDef.id);
}

function tryRollPetDrop(context) {
    ensurePlayerPetCollection();
    if (Math.random() >= PET_DROP_CHANCE) return false;
    var floor = getPetDropFloorForRoll();
    if (player.petCollection.length >= PET_COLLECTION_MAX) {
        var fullMsg =
            "残魄凝成一道兽影欲认主，你却己身灵兽栏已满——只得任其散入天地。";
        if (context === "combat" && typeof addCombatLog === "function") addCombatLog(fullMsg);
        else if (context === "dungeon" && typeof addDungeonLog === "function") addDungeonLog(fullMsg);
        return false;
    }
    var pet = createDroppedPet(floor);
    player.petCollection.push(pet);
    normalizePetObject(pet);
    if (typeof saveData === "function") saveData();
    if (typeof calculateStats === "function") calculateStats();
    var dropMsg =
        '<span class="Epic">机缘所至！</span>虚空中凝出幼兽一缕真灵——<span class="Legendary">' +
        pet.name +
        "</span>（" +
        getPetAgeTierDef(pet.ageTier).name +
        " · " +
        PET_TYPE_LABEL_ZH[pet.type] +
        "）投入你的灵兽栏。";
    if (context === "combat" && typeof addCombatLog === "function") addCombatLog(dropMsg);
    else if (context === "dungeon" && typeof addDungeonLog === "function") addDungeonLog(dropMsg);
    if (typeof playerLoadStats === "function") playerLoadStats();
    return true;
}

/** 斗法用：依人物面板与灵宠境界/机缘推导出招参数（可指定任意栏内灵宠用于面板预览） */
function getPetCombatStatsForPet(pet) {
    if (!pet || typeof player === "undefined" || !player || !player.stats) return null;
    normalizePetObject(pet);
    var lv = Math.max(1, pet.lvl);
    if (player.activePetId === pet.id && isPlayerLevelOverPetOpportunityCapForCurrentFloor()) {
        return {
            atk: 1,
            atkSpd: 0.07,
            critRate: 0,
            critDmg: 1,
            vamp: 0,
            name: pet.name
        };
    }
    var bs = pet.bonusStats || {};
    var ageDef = getPetAgeTierDef(pet.ageTier);
    var ageBonusPct = typeof pet.ageBonusPct === "number"
        ? pet.ageBonusPct
        : (ageDef && typeof ageDef.bonusMinPct === "number" && typeof ageDef.bonusMaxPct === "number"
            ? (ageDef.bonusMinPct + ageDef.bonusMaxPct) / 2
            : 0);
    var ageMult = 1 + (ageBonusPct / 100);
    var atkMul = 0.13 + Math.min(0.29, lv * 0.0021);
    var atk = player.stats.atk * atkMul * (1 + (bs.atk || 0) / 115) * PET_GLOBAL_POWER_MULT * ageMult;
    var aspMul = 0.4 + Math.min(0.42, lv * 0.0038);
    var atkSpd = player.stats.atkSpd * aspMul * (1 + (bs.atkSpd || 0) / 185) * PET_GLOBAL_POWER_MULT * ageMult;
    var critRate = Math.min(90, (player.stats.critRate * 0.5 + (bs.critRate || 0) * 0.75) * PET_GLOBAL_POWER_MULT * ageMult);
    var critDmg = (player.stats.critDmg * 0.46 + (bs.critDmg || 0) * 0.82) * PET_GLOBAL_POWER_MULT * ageMult;
    var vamp = (player.stats.vamp * 0.33 + (bs.vamp || 0) * 0.52) * PET_GLOBAL_POWER_MULT * ageMult;
    var cd =
        typeof PET_COMBAT_DEDUCTION_MULT === "number" && isFinite(PET_COMBAT_DEDUCTION_MULT) && PET_COMBAT_DEDUCTION_MULT > 0
            ? PET_COMBAT_DEDUCTION_MULT
            : 1.5;
    return {
        atk: Math.max(1, Math.round(atk * cd)),
        atkSpd: Math.max(0.07, atkSpd * cd),
        critRate: Math.min(90, critRate * cd),
        critDmg: critDmg * cd,
        vamp: vamp * cd,
        name: pet.name
    };
}

function getPetCombatStats() {
    return getPetCombatStatsForPet(getActivePet());
}

var COMBAT_PET_CRIT_LINES = [
    `{p}瞳中灵光暴涨，爪下罡风如雷，撕裂{n}妖躯——暴伤 {d}！`,
    `你与{p}气机相扣，兽魂借你一缕真元，竟撕开{n}护体缺口：{d}。`,
    `{p}缩地成寸，残影未散，杀招已落在{n}要害，刻下 {d}。`,
    `灵契共鸣！{p}长啸一声，妖火烧穿雾障，{n}硬生生吃下 {d}。`,
    `{p}踏罡一跃，尾扫如鞭、爪落如锤，{n}避无可避，暴伤 {d}。`
];
var COMBAT_PET_HIT_LINES = [
    `{p}低吼扑击，爪风擦过{n}侧肋，削去 {d}。`,
    `你弹指催诀，{p}化作一道流光撞上{n}，真元伤 {d}。`,
    `{p}绕敌游走，趁{n}旧力未生，撕咬一口，损 {d}。`,
    `兽魂与你同息，{p}佯退实进，{n}胸前一闷，失 {d}。`,
    `{p}吐出一缕灵息成刃，破开{n}薄雾，刻 {d}。`,
    `人兽合击，{p}锁踝、你补势，{n}踉跄间再挨 {d}。`,
    `{p}尾扫下盘，{n}起跳迟了半寸，足踝震伤 {d}。`,
    `灵兽{p}张口一吐，雷丸虽小，炸在{n}胸前仍痛：{d}。`
];

function pickPetCombatHitLine(crit, enemyName, dmgStr, petName) {
    var pool = crit ? COMBAT_PET_CRIT_LINES : COMBAT_PET_HIT_LINES;
    var tpl = pool[Math.floor(Math.random() * pool.length)];
    var d = "<b>" + dmgStr + "</b>";
    return tpl.replace(/\{p\}/g, petName).replace(/\{n\}/g, enemyName).replace(/\{d\}/g, d);
}

function escapeHtmlForPetModal(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 放生确认弹窗用：灵宠名、境界、年份（境界/年份与详情面板一致） */
function getPetReleaseConfirmLines(pet) {
    if (!pet) {
        return { name: "—", realm: "—", year: "—" };
    }
    normalizePetObject(pet);
    var name = escapeHtmlForPetModal(pet.name || "无名");
    var lr = typeof pet.lvl === "number" ? pet.lvl : Number(pet.lvl);
    var lv = Math.max(1, Math.floor(isFinite(lr) ? lr : 1));
    var realmRaw =
        typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(lv) : "境界 Lv." + lv;
    var realm = escapeHtmlForPetModal(realmRaw);
    var ageName = escapeHtmlForPetModal(getPetAgeTierDef(pet.ageTier).name);
    var req = getPetYaoliReqToNext(pet.ageTier);
    var cur = typeof pet.yaoli === "number" && isFinite(pet.yaoli) ? Math.max(0, Math.floor(pet.yaoli)) : 0;
    var year =
        req > 0 ? ageName + "（妖力 " + cur + "/" + req + "）" : ageName + "（已至极年）";
    return { name: name, realm: realm, year: year };
}

function releasePet(petId) {
    ensurePlayerPetCollection();
    var idx = -1;
    for (var i = 0; i < player.petCollection.length; i++) {
        if (player.petCollection[i].id === petId) {
            idx = i;
            break;
        }
    }
    if (idx < 0) return;
    player.petCollection.splice(idx, 1);
    if (player.activePetId === petId) player.activePetId = null;
    if (petPanelFocusId === petId) petPanelFocusId = null;
    if (typeof saveData === "function") saveData();
    if (typeof calculateStats === "function") calculateStats();
    if (typeof playerLoadStats === "function") playerLoadStats();
    renderPetPanel();
}

function openPetModal() {
    if (typeof closeInventory === "function" && inventoryOpen) closeInventory();
    if (typeof closeSectPassivesModal === "function" && typeof sectPassivesModalOpen !== "undefined" && sectPassivesModalOpen) {
        closeSectPassivesModal();
    }
    ensurePlayerPetCollection();
    if (!petPanelFocusId && player.activePetId) petPanelFocusId = player.activePetId;
    if (!petPanelFocusId && player.petCollection.length) petPanelFocusId = player.petCollection[0].id;
    if (typeof calculateStats === "function") calculateStats();
    petModalOpen = true;
    dungeon.status.exploring = false;
    var modal = document.getElementById("petModal");
    var dim = document.querySelector("#dungeon-main");
    if (modal) modal.style.display = "flex";
    if (typeof document !== "undefined") {
        if (document.documentElement) document.documentElement.classList.add("pet-modal-open");
        if (document.body) document.body.classList.add("pet-modal-open");
    }
    if (dim) dim.style.filter = "brightness(50%)";
    renderPetPanel();
}

function closePetModal() {
    petModalOpen = false;
    var modal = document.getElementById("petModal");
    var dim = document.querySelector("#dungeon-main");
    if (modal) modal.style.display = "none";
    if (typeof document !== "undefined") {
        if (document.documentElement) document.documentElement.classList.remove("pet-modal-open");
        if (document.body) document.body.classList.remove("pet-modal-open");
    }
    if (dim && !inventoryOpen && !sectPassivesModalOpen) dim.style.filter = "brightness(100%)";
    if (!dungeon.status.paused && !inventoryOpen && !sectPassivesModalOpen) dungeon.status.exploring = true;
}

function renderPetPanel() {
    var el = document.getElementById("petPanelBody");
    if (!el || typeof player === "undefined" || !player) return;
    ensurePlayerPetCollection();
    var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var coll = player.petCollection;
    var capLeft = PET_COLLECTION_MAX - coll.length;
    var maxDeployLv = getMaxDeployPetLevel();

    var roster = coll
        .map(function (pet, idx) {
            normalizePetObject(pet);
            var active = player.activePetId === pet.id;
            var petLvlRaw = typeof pet.lvl === "number" ? pet.lvl : Number(pet.lvl);
            var petLvlNum = Math.max(1, Math.floor(isFinite(petLvlRaw) ? petLvlRaw : 1));
            var overDeployCap = petLvlNum > maxDeployLv;
            var marketBtn =
                typeof window.DONGTIAN_CLOUD_MODE !== "undefined" && window.DONGTIAN_CLOUD_MODE
                    ? '<button type="button" class="btn btn--sm btn--ghost pet-btn-market" data-pet-id="' +
                      pet.id +
                      '">修仙上架</button>'
                    : "";
            return (
                '<div class="pet-roster__row' +
                (petPanelFocusId === pet.id ? " pet-roster__row--focus" : "") +
                '" data-pet-id="' +
                pet.id +
                '">' +
                '<span class="pet-roster__name">' +
                (active ? '<i class="fas fa-dragon pet-roster__totem" title="出战"></i>' : "") +
                pet.name +
                "</span>" +
                '<span class="pet-roster__meta">' +
                getPetAgeTierDef(pet.ageTier).name +
                " · " +
                PET_TYPE_LABEL_ZH[pet.type] +
                " · " +
                (typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(pet.lvl) : "Lv." + pet.lvl) +
                "</span>" +
                '<div class="pet-roster__acts">' +
                (active
                    ? '<span class="pet-roster__badge">已出战</span>'
                    : overDeployCap
                    ? '<span class="pet-roster__badge" style="opacity:0.8;cursor:help" title="无法出战：超出上限 ' +
                      maxDeployLv +
                      '（历史最高 + 10）">不可出战</span>'
                    : '<button type="button" class="btn btn--sm btn--accent pet-btn-deploy" data-pet-id="' +
                      pet.id +
                      '">出战</button>') +
                '<button type="button" class="btn btn--sm btn--ghost pet-btn-focus" data-pet-id="' +
                pet.id +
                '">详情</button>' +
                marketBtn +
                '<button type="button" class="btn btn--sm btn--ghost pet-btn-release" data-pet-id="' +
                pet.id +
                '">放生</button>' +
                "</div></div>"
            );
        })
        .join("");

    var p = petPanelFocusId ? getPetById(petPanelFocusId) : null;
    var detail = "";
    if (p) {
        normalizePetObject(p);
        var expCap = getPetExpRequired(p);
        var expCurrLvl = Math.max(0, Math.floor(p.exp.expCurrLvl || 0));
        var expPct = Math.min(100, (expCurrLvl / expCap) * 100).toFixed(2).replace(rx, "$1");
        var nextGrow = getPetExpNextGrowDisplay(p);
        var rootsHtml = PET_ROOT_KEYS.map(function (k) {
            return (
                '<span class="pet-root-tag pet-root-tag--' +
                k +
                '">' +
                PET_ROOT_LABEL_ZH[k] +
                " " +
                Math.round(p.roots[k] || 0) +
                "</span>"
            );
        }).join("");
        var realmLine =
            typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(p.lvl) : "境界 Lv." + p.lvl;
        var combat = typeof getPetCombatStatsForPet === "function" ? getPetCombatStatsForPet(p) : null;
        var combatHtml = "";
        if (combat) {
            combatHtml =
                '<div class="pet-ui__section pet-ui__section--combat">' +
                '<h5 class="pet-ui__section-title">斗法推演</h5>' +
                '<p class="pet-ui__section-note">依当前人物面板估算；仅<strong>出战</strong>时在斗法中以此出手。</p>' +
                '<div class="pet-ui__stat-grid">' +
                '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">预估力道</span><span class="pet-ui__stat-val">' +
                combat.atk +
                "</span></div>" +
                '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">身法</span><span class="pet-ui__stat-val">' +
                combat.atkSpd.toFixed(2).replace(rx, "$1") +
                "</span></div>" +
                '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">会心</span><span class="pet-ui__stat-val">' +
                combat.critRate.toFixed(1).replace(rx, "$1") +
                "%</span></div>" +
                '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">暴伤</span><span class="pet-ui__stat-val">' +
                combat.critDmg.toFixed(1).replace(rx, "$1") +
                "</span></div>" +
                '<div class="pet-ui__stat-cell pet-ui__stat-cell--wide"><span class="pet-ui__stat-label">吸血</span><span class="pet-ui__stat-val">' +
                combat.vamp.toFixed(2).replace(rx, "$1") +
                "%</span></div>" +
                "</div></div>";
        }
        var dispBs = getPetBonusStatsDisplayForPanel(p);
        var bonusNeg = isPlayerLevelOverPetOpportunityCapForCurrentFloor() && player.activePetId === p.id;
        var pctSign = bonusNeg ? "" : "+";
        var bonusSection =
            '<div class="pet-ui__section pet-ui__section--bonus">' +
            '<h5 class="pet-ui__section-title">机缘加成 <span class="pet-ui__section-tag">并入人物</span></h5>' +
            '<p class="pet-ui__section-note">' +
            (bonusNeg
                ? '<span class="Common">本层修为已超过「秘境第 ' +
                  getCurrentDungeonFloorForPetOpportunityRule() +
                  " 层」机缘阈限（Lv." +
                  getDungeonFloorPetOpportunityLevelCap(getCurrentDungeonFloorForPetOpportunityRule()) +
                  "），出战机缘并入人物时按压制计。</span> "
                : "") +
            "每层境界叠一层成长；下列为百分比机缘。</p>" +
            '<ul class="pet-ui__stats pet-ui__stats--cols">' +
            "<li><span class=\"pet-ui__stat-name\">气血</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.hp || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "<li><span class=\"pet-ui__stat-name\">力道</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.atk || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "<li><span class=\"pet-ui__stat-name\">护体</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.def || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "<li><span class=\"pet-ui__stat-name\">身法</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.atkSpd || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "<li><span class=\"pet-ui__stat-name\">吸血</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.vamp || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "<li><span class=\"pet-ui__stat-name\">会心</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.critRate || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "<li><span class=\"pet-ui__stat-name\">暴伤</span><span class=\"pet-ui__stat-pct\">" +
            pctSign +
            (dispBs.critDmg || 0).toFixed(2).replace(rx, "$1") +
            "%</span></li>" +
            "</ul></div>";
        var bonusCombatBlock = combatHtml
            ? '<div class="pet-ui__bonus-combat-row">' + bonusSection + combatHtml + "</div>"
            : bonusSection;
        detail =
            '<div class="pet-ui__detail">' +
            '<div class="pet-ui__detail-head">' +
            '<h4 class="pet-ui__detail-title">' +
            p.name +
            "</h4>" +
            '<p class="pet-ui__realm-line">' +
            realmLine +
            "</p>" +
            "</div>" +
            '<div class="pet-ui__expbar pet-ui__expbar--jade" role="img">' +
            '<div class="pet-ui__expbar-fill" style="width:' +
            expPct +
            '%"></div>' +
            '<span class="pet-ui__expbar-lbl">悟性 ' +
            (typeof nFormatter === "function" ? nFormatter(expCurrLvl) : expCurrLvl) +
            "/" +
            (typeof nFormatter === "function" ? nFormatter(expCap) : expCap) +
            " · +" +
            (typeof nFormatter === "function" ? nFormatter(nextGrow) : nextGrow) +
            "</span></div>" +
            '<div class="pet-ui__section pet-ui__section--identity">' +
            '<p class="pet-ui__type-readonly"><strong>类型</strong>：' +
            (PET_TYPE_LABEL_ZH[p.type] || "平衡型") +
            " <span class=\"pet-ui__type-lock\">（认主时已定）</span></p>" +
            (function () {
                var ageName = getPetAgeTierDef(p.ageTier).name;
                var req = getPetYaoliReqToNext(p.ageTier);
                var cur = typeof p.yaoli === "number" && isFinite(p.yaoli) ? Math.max(0, Math.floor(p.yaoli)) : 0;
                var prog = req > 0 ? "（妖力 " + cur + "/" + req + "，满则进阶）" : "（已至极年）";
                return '<p class="pet-ui__type-readonly"><strong>年份</strong>：' + ageName + " " + prog + ' <span class="pet-ui__type-lock">（提升五行）</span></p>';
            })() +
            '<div class="pet-ui__roots" title="五行灵根认主时凝定">' +
            rootsHtml +
            "</div>" +
            '<p class="pet-ui__muted pet-ui__roots-hint">五行灵根于拾得此兽时已定，不可重衍。</p>' +
            "</div>" +
            bonusCombatBlock +
            "</div>";
    } else {
        detail =
            '<p class="pet-ui__empty">择一灵宠查看详情；栏位上限 ' +
            PET_COLLECTION_MAX +
            "，尚余空位 <strong>" +
            capLeft +
            "</strong>。击杀妖魔约 <strong>" +
            Math.round(PET_DROP_CHANCE * 100) +
            "%</strong> 几率得幼兽认主；秘境层越高，<strong>灵根跨度</strong>越佳。</p>";
    }

    el.innerHTML =
        '<div class="pet-ui pet-ui--collection pet-ui--xian">' +
        '<div class="pet-ui__intro-block">' +
        '<p class="pet-ui__hint">出战灵宠的机缘并入人物面板；修为入账时按 <strong>' +
        Math.round(PET_EXP_SHARE_FROM_PLAYER * 1000) / 10 +
        "%</strong> 化为该兽悟性（仅出战）。斗法中与主人同节拍出手。</p>" +
        "<p class=\"pet-ui__hint\" style=\"margin-top:10px;opacity:0.92;font-size:0.92em;line-height:1.45\">出战境界上限为「历史最高等级 + 10」；灵兽境界超出时将<strong>自动卸下</strong>出战。</p>" +
        "</div>" +
        '<div class="pet-ui__layout">' +
        '<div class="pet-ui__col pet-ui__col--left">' +
        '<div class="pet-ui__roster">' +
        '<header class="pet-ui__roster-head">' +
        '<h5 class="pet-ui__roster-title"><span class="pet-ui__roster-cap">灵兽栏</span><span class="pet-ui__roster-count">（' +
        coll.length +
        "/" +
        PET_COLLECTION_MAX +
        "）</span></h5>" +
        "</header>" +
        '<div class="pet-ui__roster-list">' +
        (roster || '<p class="pet-ui__empty">栏内空空——去斩妖吧。</p>') +
        "</div>" +
        "</div></div>" +
        '<div class="pet-ui__col pet-ui__col--right">' +
        '<div class="pet-ui__detail-panel">' +
        detail +
        "</div></div></div></div>";
}

/**
 * 灵宠面板点击统一委托（避免 innerHTML 刷新后按钮丢监听导致「详情」无效）
 */
function initPetModalClickDelegation() {
    var modal = document.getElementById("petModal");
    if (!modal || modal._petClickBound) return;
    modal._petClickBound = true;
    modal.addEventListener("click", function (ev) {
        var body = document.getElementById("petPanelBody");
        if (!body || !body.contains(ev.target)) return;

        var deploy = ev.target.closest(".pet-btn-deploy");
        if (deploy) {
            ev.preventDefault();
            ev.stopPropagation();
            var did = deploy.getAttribute("data-pet-id");
            if (did) {
                setActivePetId(did);
                petPanelFocusId = did;
                renderPetPanel();
            }
            return;
        }

        var focusBtn = ev.target.closest(".pet-btn-focus");
        if (focusBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var fid = focusBtn.getAttribute("data-pet-id");
            if (fid) {
                petPanelFocusId = fid;
                renderPetPanel();
            }
            return;
        }

        var mkt = ev.target.closest(".pet-btn-market");
        if (mkt) {
            ev.preventDefault();
            ev.stopPropagation();
            var mid = mkt.getAttribute("data-pet-id");
            if (mid && typeof window.dongtianMarketOpenSellPet === "function") {
                window.dongtianMarketOpenSellPet(mid);
            }
            return;
        }

        var rel = ev.target.closest(".pet-btn-release");
        if (rel) {
            ev.preventDefault();
            ev.stopPropagation();
            var pid = rel.getAttribute("data-pet-id");
            if (!pid) return;
            if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                ensurePlayerPetCollection();
                var relLines = getPetReleaseConfirmLines(getPetById(pid));
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content pet-rel-confirm">' +
                    '<p class="pet-rel-confirm__lead">确定放生此兽？它将离你而去。</p>' +
                    '<ul class="pet-rel-confirm__info" role="list">' +
                    '<li><strong>灵宠名</strong>：' +
                    relLines.name +
                    "</li>" +
                    '<li><strong>境界</strong>：' +
                    relLines.realm +
                    "</li>" +
                    '<li><strong>年份</strong>：' +
                    relLines.year +
                    "</li>" +
                    "</ul>" +
                    '<div class="button-container">' +
                    '<button type="button" id="pet-rel-yes">放生</button>' +
                    '<button type="button" id="pet-rel-no">作罢</button>' +
                    "</div></div>";
                document.getElementById("pet-rel-yes").onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                    releasePet(pid);
                };
                document.getElementById("pet-rel-no").onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            } else {
                releasePet(pid);
            }
            return;
        }

        var row = ev.target.closest(".pet-roster__row");
        if (row && !ev.target.closest("button")) {
            var rid = row.getAttribute("data-pet-id");
            if (rid) {
                petPanelFocusId = rid;
                renderPetPanel();
            }
        }
    });
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        window.addEventListener("load", initPetModalClickDelegation);
    } else {
        initPetModalClickDelegation();
    }
}

function getPetCombatSidebarHtml() {
    if (typeof getActivePet !== "function" || !getActivePet()) return "";
    return (
        '<section class="combat-card combat-card--pet" id="petCombatPanel">' +
        '<div class="combat-card__row">' +
        '<div class="combat-avatar combat-avatar--pet" aria-hidden="true"><i class="fas fa-dragon"></i></div>' +
        '<div class="combat-card__main">' +
        '<span class="combat-card__badge combat-card__badge--pet">灵兽</span>' +
        '<p id="pet-combat-title" class="combat-card__playerline"></p>' +
        "</div></div>" +
        '<div class="combat-pet-wuxing-block">' +
        '<div class="combat-pet-wuxing-block__head">' +
        '<span class="combat-pet-wuxing-block__lbl">悟性</span>' +
        '<span class="combat-pet-wuxing-block__nums" id="pet-wuxing-combat-text"></span>' +
        "</div>" +
        '<div class="combat-pet-wuxing-block__track">' +
        '<div class="combat-pet-wuxing-block__fill" id="pet-wuxing-bar"></div>' +
        "</div></div>" +
        '<div id="pet-dmg-container" class="dmg-container combat-card__dmg"></div>' +
        "</section>"
    );
}

function refreshPetCombatHud() {
    if (!player || !player.inCombat) return;
    var titleEl = document.getElementById("pet-combat-title");
    var wuxingBar = document.getElementById("pet-wuxing-bar");
    var wuxingText = document.getElementById("pet-wuxing-combat-text");
    if (!titleEl) return;
    var pet = typeof getActivePet === "function" ? getActivePet() : null;
    if (!pet) {
        titleEl.innerHTML = "";
        if (wuxingBar) wuxingBar.style.width = "0%";
        if (wuxingText) wuxingText.textContent = "";
        return;
    }
    normalizePetObject(pet);
    var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var expCap = getPetExpRequired(pet);
    var expCurrLvl = Math.max(0, Math.floor(pet.exp.expCurrLvl || 0));
    var expPct = Math.min(100, (expCurrLvl / expCap) * 100);
    var pctStr = expPct.toFixed(2).replace(rx, "$1");
    titleEl.innerHTML =
        '<span class="combat-pet-name">' +
        pet.name +
        "</span> · " +
        (typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(pet.lvl) : "Lv." + pet.lvl);
    if (wuxingBar) {
        wuxingBar.style.width = Math.min(100, expPct) + "%";
    }
    if (wuxingText) {
        var cur = typeof nFormatter === "function" ? nFormatter(expCurrLvl) : String(expCurrLvl);
        var max = typeof nFormatter === "function" ? nFormatter(expCap) : String(expCap);
        wuxingText.textContent = cur + "/" + max + " · " + pctStr + "%";
    }
}

/**
 * 修仙市场：只读查看挂单灵宠属性（弹窗）
 */
function buildPetMarketPreviewHtml(p) {
    var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    normalizePetObject(p);
    var expCap = getPetExpRequired(p);
    var expCurrLvl = Math.max(0, Math.floor(p.exp.expCurrLvl || 0));
    var expPct = Math.min(100, (expCurrLvl / expCap) * 100).toFixed(2).replace(rx, "$1");
    var nextGrow = getPetExpNextGrowDisplay(p);
    var rootsHtml = PET_ROOT_KEYS.map(function (k) {
        return (
            '<span class="pet-root-tag pet-root-tag--' +
            k +
            '">' +
            PET_ROOT_LABEL_ZH[k] +
            " " +
            Math.round(p.roots[k] || 0) +
            "</span>"
        );
    }).join("");
    var realmLine = typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(p.lvl) : "境界 Lv." + p.lvl;
    var combat = typeof getPetCombatStatsForPet === "function" ? getPetCombatStatsForPet(p) : null;
    var combatHtml = "";
    if (combat) {
        combatHtml =
            '<div class="pet-ui__section pet-ui__section--combat">' +
            '<h5 class="pet-ui__section-title">斗法推演</h5>' +
            '<div class="pet-ui__stat-grid">' +
            '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">预估力道</span><span class="pet-ui__stat-val">' +
            combat.atk +
            "</span></div>" +
            '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">身法</span><span class="pet-ui__stat-val">' +
            combat.atkSpd.toFixed(2).replace(rx, "$1") +
            "</span></div>" +
            '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">会心</span><span class="pet-ui__stat-val">' +
            combat.critRate.toFixed(1).replace(rx, "$1") +
            "%</span></div>" +
            '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">暴伤</span><span class="pet-ui__stat-val">' +
            combat.critDmg.toFixed(1).replace(rx, "$1") +
            "%</span></div>" +
            '<div class="pet-ui__stat-cell pet-ui__stat-cell--wide"><span class="pet-ui__stat-label">吸血</span><span class="pet-ui__stat-val">' +
            combat.vamp.toFixed(2).replace(rx, "$1") +
            "%</span></div>" +
            "</div></div>";
    }
    var bs = p.bonusStats || {};
    var omPv =
        typeof PET_OPPORTUNITY_BONUS_MULT === "number" && isFinite(PET_OPPORTUNITY_BONUS_MULT) && PET_OPPORTUNITY_BONUS_MULT > 0
            ? PET_OPPORTUNITY_BONUS_MULT
            : 3;
    var bonusSection =
        '<div class="pet-ui__section pet-ui__section--bonus">' +
        '<h5 class="pet-ui__section-title">机缘加成</h5>' +
        '<ul class="pet-ui__stats pet-ui__stats--cols">' +
        "<li><span class=\"pet-ui__stat-name\">气血</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.hp || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "<li><span class=\"pet-ui__stat-name\">力道</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.atk || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "<li><span class=\"pet-ui__stat-name\">护体</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.def || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "<li><span class=\"pet-ui__stat-name\">身法</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.atkSpd || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "<li><span class=\"pet-ui__stat-name\">吸血</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.vamp || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "<li><span class=\"pet-ui__stat-name\">会心</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.critRate || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "<li><span class=\"pet-ui__stat-name\">暴伤</span><span class=\"pet-ui__stat-pct\">+" +
        ((bs.critDmg || 0) * omPv).toFixed(2).replace(rx, "$1") +
        "%</span></li>" +
        "</ul></div>";
    var bonusCombatBlock = combatHtml ? '<div class="pet-ui__bonus-combat-row">' + bonusSection + combatHtml + "</div>" : bonusSection;
    return (
        '<div class="pet-ui pet-ui--xian pet-market-preview-wrap">' +
        '<p class="xiu-market-preview-hint">挂单预览 · 仅展示属性</p>' +
        '<div class="pet-ui__detail">' +
        '<div class="pet-ui__detail-head">' +
        '<h4 class="pet-ui__detail-title">' +
        p.name +
        "</h4>" +
        '<p class="pet-ui__realm-line">' +
        realmLine +
        "</p>" +
        "</div>" +
        '<div class="pet-ui__expbar pet-ui__expbar--jade" role="img">' +
        '<div class="pet-ui__expbar-fill" style="width:' +
        expPct +
        '%"></div>' +
        '<span class="pet-ui__expbar-lbl">悟性 ' +
        (typeof nFormatter === "function" ? nFormatter(expCurrLvl) : expCurrLvl) +
        "/" +
        (typeof nFormatter === "function" ? nFormatter(expCap) : expCap) +
        " · +" +
        (typeof nFormatter === "function" ? nFormatter(nextGrow) : nextGrow) +
        "</span></div>" +
        '<div class="pet-ui__section pet-ui__section--identity">' +
        '<p class="pet-ui__type-readonly"><strong>类型</strong>：' +
        (PET_TYPE_LABEL_ZH[p.type] || "平衡型") +
        "</p>" +
        (function () {
            var ageName = getPetAgeTierDef(p.ageTier).name;
            var req = getPetYaoliReqToNext(p.ageTier);
            var cur = typeof p.yaoli === "number" && isFinite(p.yaoli) ? Math.max(0, Math.floor(p.yaoli)) : 0;
            var prog = req > 0 ? "（妖力 " + cur + "/" + req + "）" : "（已至极年）";
            return '<p class="pet-ui__type-readonly"><strong>年份</strong>：' + ageName + " " + prog + "</p>";
        })() +
        '<div class="pet-ui__roots">' +
        rootsHtml +
        "</div>" +
        "</div>" +
        bonusCombatBlock +
        "</div></div>"
    );
}

function showMarketPetPreview(pet) {
    if (!pet || typeof pet !== "object") return;
    try {
        pet = JSON.parse(JSON.stringify(pet));
    } catch (e) {}
    if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
    var inner;
    try {
        inner = buildPetMarketPreviewHtml(pet);
    } catch (e) {
        if (typeof console !== "undefined" && console.warn) console.warn("buildPetMarketPreviewHtml", e);
        inner =
            '<div class="content"><p class="xiu-market-muted">灵宠预览生成失败，数据可能不完整。</p><p class="xiu-market-muted">' +
            (e && e.message ? String(e.message) : "") +
            "</p></div>";
    }
    dungeon.status.exploring = false;
    defaultModalElement.style.display = "flex";
    defaultModalElement.style.zIndex = "5080";
    defaultModalElement.classList.add("modal-container--market-preview");
    defaultModalElement.innerHTML =
        '<div class="content scrollable" style="max-height:min(85dvh,32rem);">' +
        inner +
        '<div class="button-container"><button type="button" id="close-market-pet-preview">关闭</button></div></div>';
    var xiuM = document.getElementById("xiuMarketModal");
    var sellM = document.getElementById("xiuMarketSellModal");
    if (xiuM && xiuM.style.display === "flex") xiuM.style.filter = "brightness(55%)";
    if (sellM && sellM.style.display === "flex") sellM.style.filter = "brightness(55%)";
    var dm = document.querySelector("#dungeon-main");
    if (dm) dm.style.filter = "brightness(92%)";
    var inv = document.querySelector("#inventory");
    if (inv && inv.style.display === "flex") inv.style.filter = "brightness(55%)";
    var btn = document.getElementById("close-market-pet-preview");
    if (btn) {
        btn.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.style.zIndex = "";
            defaultModalElement.classList.remove("modal-container--market-preview");
            defaultModalElement.innerHTML = "";
            if (xiuM) xiuM.style.filter = "";
            if (sellM) sellM.style.filter = "";
            if (dm) dm.style.filter = "";
            if (inv) inv.style.filter = "";
            if (typeof continueExploring === "function") continueExploring();
        };
    }
}
window.showMarketPetPreview = showMarketPetPreview;
