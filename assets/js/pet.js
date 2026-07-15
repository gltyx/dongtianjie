/**
 * 灵宠栏：最多 20 只；出战 1 只提供机缘并入斗法协同攻击；掉落 / 修为 / 成长。
 */

var petModalOpen = false;

/** 当前在面板中编辑的灵宠 id（仅 UI） */
var petPanelFocusId = null;

var PET_COLLECTION_MAX = 20;
/** 灵宠升星：满星 10 颗，每星全灵根 +10% */
var PET_STAR_MAX = 10;
var PET_STAR_ROOT_BONUS_PER = 0.1;
/** 第 N 颗星（0 起）消耗的灵宠碎片 */
var PET_STAR_UPGRADE_COSTS = [10, 50, 100, 200, 300, 400, 500, 600, 800, 1000];
/** 升星转移：将全部星数转给另一只灵宠，固定消耗碎片 */
var PET_STAR_TRANSFER_COST = 100;
/** 服丹里程碑：全部 12 种丹药已服数量取最低值判定 */
var PILL_USE_CAP_GLOBAL = 1000;
var PILL_MILESTONE_BONUSES = [
    [1000, 5.0],
    [900, 4.5],
    [800, 4.0],
    [700, 3.5],
    [600, 3.0],
    [400, 2.5],
    [300, 2.0],
    [200, 1.5],
    [100, 1.0],
    [90, 0.9],
    [80, 0.8],
    [70, 0.7],
    [60, 0.6],
    [50, 0.5],
    [40, 0.4],
    [30, 0.3],
    [20, 0.2],
    [10, 0.1],
    [1, 0.05],
];
var PILL_TYPE_KEYS = [
    "dt_pill_jinling",
    "dt_pill_shuiling",
    "dt_pill_tuling",
    "dt_pill_muling",
    "dt_pill_huoling",
    "dt_pill_fengling",
    "dt_pill_jinteng",
    "dt_pill_xuanbing",
    "dt_pill_xinlian",
    "dt_pill_longxue",
    "dt_pill_leishen",
    "dt_pill_huanshen",
];
/** 灵宠自定义名最长字数 */
var PET_NAME_MAX_LEN = 12;

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
    if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
    else if (typeof saveData === "function") saveData();
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

function addPetYaoli(pet, amount, context, opts) {
    opts = opts || {};
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
    if (!opts.skipSave && typeof saveData === "function") {
        saveData(opts.saveOpts || undefined);
    }
    if (!opts.skipPanelRender && context === "petPanel" && typeof renderPetPanel === "function") {
        renderPetPanel();
    }
    return { ok: true, upgraded: upgraded };
}

/** 行囊批量天赋果：扣料已由 materials/delta 完成，只加妖力并落盘 */
function applyTalentFruitBatchToPet(pet, amount) {
    if (!pet || !pet.id) {
        return { ok: false, message: "尚无出战灵宠，喂养未生效。", effectFailed: true };
    }
    var live = typeof getPetById === "function" ? getPetById(pet.id) : pet;
    if (!live) {
        return { ok: false, message: "出战灵宠已不在栏中，喂养未生效。", effectFailed: true };
    }
    try {
        var fed = addPetYaoli(live, amount, "petPanel", {
            skipSave: true,
            skipPanelRender: true,
        });
        if (!fed || fed.ok === false) {
            if (fed && fed.ok === false) fed.effectFailed = true;
            return fed || { ok: false, message: "喂养未生效。", effectFailed: true };
        }
        return fed;
    } catch (eFeed) {
        return {
            ok: false,
            effectFailed: true,
            message: (eFeed && eFeed.message) || "喂养过程异常，请重试。",
        };
    }
}

function getPetExpMaxIncrease(curMax) {
    curMax = Math.max(PET_EXP_BASE_MAX, curMax || PET_EXP_BASE_MAX);
    return Math.floor(curMax * 0.152 + 188);
}

/** 101 级起锁定的单级 expMaxLvl 基准（100 级单级需求锚点 = 此值 × 100 级难度系数） */
var PET_EXP_CAP_MAX_LVL = 680000;
/** 1–100 级平滑递增曲线锚点等级 */
var PET_EXP_SMOOTH_ANCHOR_LOW_LVL = 1;
var PET_EXP_SMOOTH_ANCHOR_HIGH_LVL = 100;

/** 灵宠悟性：整体难度 = 原设计 × 此倍率（约 2 倍更难） */
var PET_EXP_DIFFICULTY_BASE_MULT = 2;
/** 每高 1 级，悟性门槛再乘 (1 + 此系数 × (等级−1))；系数越大高等级越陡 */
var PET_EXP_DIFFICULTY_PER_LEVEL = 0.065;

function getPetExpDifficultyMult(lvl) {
    lvl = Math.max(1, Math.floor(lvl || 1));
    return PET_EXP_DIFFICULTY_BASE_MULT * (1 + (lvl - 1) * PET_EXP_DIFFICULTY_PER_LEVEL);
}

/** 1 级单级需求锚点（保持原 1→2 悟性门槛不变） */
function getPetExpReqAnchorAtLvl1() {
    var base = getPetExpMaxIncrease(PET_EXP_BASE_MAX);
    return Math.max(1, Math.floor(base * getPetExpDifficultyMult(PET_EXP_SMOOTH_ANCHOR_LOW_LVL)));
}

/** 100 级单级需求锚点（保持原 100→101 悟性门槛不变） */
function getPetExpReqAnchorAtLvl100() {
    return Math.max(1, Math.floor(PET_EXP_CAP_MAX_LVL * getPetExpDifficultyMult(PET_EXP_SMOOTH_ANCHOR_HIGH_LVL)));
}

/**
 * 按等级返回单级悟性需求：1 级与 100 级锚定不变，2–99 级等比平滑递增，101+ 沿用封顶基准 × 难度。
 */
function getPetExpRequiredForLevel(lvl) {
    lvl = Math.max(1, Math.floor(Number(lvl)) || 1);
    if (lvl >= PET_EXP_SMOOTH_ANCHOR_HIGH_LVL + 1) {
        return Math.max(1, Math.floor(PET_EXP_CAP_MAX_LVL * getPetExpDifficultyMult(lvl)));
    }
    var lo = getPetExpReqAnchorAtLvl1();
    var hi = getPetExpReqAnchorAtLvl100();
    if (lvl <= PET_EXP_SMOOTH_ANCHOR_LOW_LVL) return lo;
    if (lvl >= PET_EXP_SMOOTH_ANCHOR_HIGH_LVL) return hi;
    var span = PET_EXP_SMOOTH_ANCHOR_HIGH_LVL - PET_EXP_SMOOTH_ANCHOR_LOW_LVL;
    if (span < 1) return hi;
    var t = (lvl - PET_EXP_SMOOTH_ANCHOR_LOW_LVL) / span;
    return Math.max(1, Math.floor(lo * Math.pow(hi / lo, t)));
}

/** 存储用 expMaxLvl：与单级需求 / 难度系数互逆 */
function getPetExpBaseReqForLevel(lvl) {
    lvl = Math.max(1, Math.floor(Number(lvl)) || 1);
    var req = getPetExpRequiredForLevel(lvl);
    var diff = getPetExpDifficultyMult(lvl);
    return Math.max(1, Math.floor(req / diff));
}

/** 按 petLvlUpFor 规则推演目标等级应有的 exp 曲线（当前级修为条为 0，与管理员改级修复一致） */
function computePetExpFieldsForLevel(targetLvl) {
    var lvl = Math.max(1, Math.floor(Number(targetLvl)) || 1);
    var expMax = PET_EXP_BASE_MAX;
    for (var curLvl = 1; curLvl < lvl; curLvl++) {
        expMax += getPetExpBaseReqForLevel(curLvl);
    }
    return {
        expCurr: 0,
        expMax: expMax,
        expCurrLvl: 0,
        expMaxLvl: getPetExpBaseReqForLevel(lvl)
    };
}

/** 境界已拔高但 exp 仍停在 1 级曲线（常见于后台只改 lvl） */
function petExpNeedsRepairForLevel(pet) {
    if (!pet || typeof pet !== "object") return false;
    var lvl = Math.max(1, Math.floor(Number(pet.lvl)) || 1);
    if (lvl < 2) return false;
    if (!pet.exp || typeof pet.exp !== "object") return true;
    var expected = computePetExpFieldsForLevel(lvl);
    var curMax = Math.floor(Number(pet.exp.expMax)) || PET_EXP_BASE_MAX;
    if (curMax <= PET_EXP_BASE_MAX + 25) return true;
    if (curMax < Math.floor(expected.expMax * 0.88)) return true;
    var curMaxLvl = Math.floor(Number(pet.exp.expMaxLvl)) || 0;
    if (curMaxLvl > 0 && curMaxLvl < Math.floor(expected.expMaxLvl * 0.88)) return true;
    return false;
}

function repairPetExpForCurrentLevel(pet) {
    if (!pet || !petExpNeedsRepairForLevel(pet)) return false;
    var fixed = computePetExpFieldsForLevel(pet.lvl);
    pet.exp = fixed;
    return true;
}

function getPetExpRequired(pet) {
    if (!pet || !pet.exp) return getPetExpRequiredForLevel(1);
    normalizePetObject(pet);
    return getPetExpRequiredForLevel(pet.lvl);
}

/** 面板「+」展示：当前等级单级悟性需求 */
function getPetExpNextGrowDisplay(pet) {
    normalizePetObject(pet);
    return getPetExpRequiredForLevel(pet.lvl);
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

/** 相对平衡型 2.0 的机缘成长倍率：专长侧重力道/气血/护体，会心/身法/吸血偏低 */
var PET_TYPE_GROWTH_MULT = {
    attack: { hp: 1.27, atk: 4.0, def: 1.27, atkSpd: 1.43, vamp: 1.43, critRate: 1.47, critDmg: 1.83 },
    defense: { hp: 2.75, atk: 0.72, def: 2.85, atkSpd: 0.88, vamp: 0.92, critRate: 0.88, critDmg: 0.88 },
    stamina: { hp: 3.75, atk: 0.78, def: 1.75, atkSpd: 0.88, vamp: 0.95, critRate: 0.88, critDmg: 0.85 },
    balanced: { hp: 2, atk: 2, def: 2, atkSpd: 2, vamp: 2, critRate: 2, critDmg: 2 }
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

function getPetStarLevel(pet) {
    if (!pet) return 0;
    var s = typeof pet.stars === "number" && isFinite(pet.stars) ? Math.floor(pet.stars) : 0;
    return Math.max(0, Math.min(PET_STAR_MAX, s));
}

function getPetStarRootMult(pet) {
    return 1 + getPetStarLevel(pet) * PET_STAR_ROOT_BONUS_PER;
}

function getPillMinUsedCount(uses) {
    var min = Infinity;
    for (var i = 0; i < PILL_TYPE_KEYS.length; i++) {
        var n = Math.floor(Number(uses && uses[PILL_TYPE_KEYS[i]]) || 0);
        if (n < min) min = n;
    }
    return min === Infinity ? 0 : min;
}

function getPillMilestoneBonusPct(uses) {
    var minUsed = getPillMinUsedCount(uses);
    for (var i = 0; i < PILL_MILESTONE_BONUSES.length; i++) {
        if (minUsed >= PILL_MILESTONE_BONUSES[i][0]) return PILL_MILESTONE_BONUSES[i][1];
    }
    return 0;
}

function ensureGlobalPillUses(playerObj) {
    if (!playerObj || typeof playerObj !== "object") return {};
    if (!playerObj.dongtianAlchemy || typeof playerObj.dongtianAlchemy !== "object") playerObj.dongtianAlchemy = {};
    var al = playerObj.dongtianAlchemy;
    if (!al.pillUses || typeof al.pillUses !== "object") al.pillUses = {};
    if (al._pillUsesMigrated) return al.pillUses;
    var pets = Array.isArray(playerObj.petCollection) ? playerObj.petCollection : [];
    for (var i = 0; i < pets.length; i++) {
        var pet = pets[i];
        if (!pet || !pet.pillUses || typeof pet.pillUses !== "object") continue;
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

function getGlobalPillUses() {
    if (typeof player === "undefined" || !player) return {};
    return ensureGlobalPillUses(player);
}

function getPetPillMilestoneRootMult() {
    return 1 + getPillMilestoneBonusPct(getGlobalPillUses());
}

/** 升星与服丹里程碑后的有效灵根（用于机缘成长与面板展示） */
function getPetRootsForCalc(pet) {
    if (!pet || !pet.roots) return null;
    var mult = getPetStarRootMult(pet) * getPetPillMilestoneRootMult();
    if (mult === 1) return pet.roots;
    var out = {};
    for (var i = 0; i < PET_ROOT_KEYS.length; i++) {
        var k = PET_ROOT_KEYS[i];
        var v = typeof pet.roots[k] === "number" && isFinite(pet.roots[k]) ? pet.roots[k] : 18;
        out[k] = Math.max(1, Math.round(v * mult));
    }
    return out;
}

function formatPetStarsDisplay(stars) {
    var s = Math.max(0, Math.min(PET_STAR_MAX, Math.floor(Number(stars) || 0)));
    var filled = "";
    var empty = "";
    for (var i = 0; i < s; i++) filled += "★";
    for (var j = s; j < PET_STAR_MAX; j++) empty += "☆";
    return filled + empty;
}

function ensurePlayerPetFragments() {
    if (typeof player === "undefined" || !player) return 0;
    if (typeof player.petFragments !== "number" || !isFinite(player.petFragments) || player.petFragments < 0) {
        player.petFragments = 0;
    } else {
        player.petFragments = Math.floor(player.petFragments);
    }
    return player.petFragments;
}

function getPetStarUpgradeCost(currentStars) {
    var s = Math.max(0, Math.min(PET_STAR_MAX, Math.floor(Number(currentStars) || 0)));
    if (s >= PET_STAR_MAX) return null;
    return PET_STAR_UPGRADE_COSTS[s];
}

function canUpgradePetStar(pet) {
    if (!pet) return { ok: false, message: "无灵宠。" };
    var stars = getPetStarLevel(pet);
    if (stars >= PET_STAR_MAX) return { ok: false, message: "已满星。" };
    var cost = getPetStarUpgradeCost(stars);
    if (!cost) return { ok: false, message: "已满星。" };
    var frags = ensurePlayerPetFragments();
    if (frags < cost) {
        return { ok: false, message: "灵宠碎片不足（需 " + cost + "，当前 " + frags + "）。" };
    }
    return { ok: true, cost: cost, nextStars: stars + 1 };
}

function canTransferPetStars(fromPetId, toPetId) {
    ensurePlayerPetCollection();
    if (!fromPetId || !toPetId || fromPetId === toPetId) {
        return { ok: false, message: "须选择不同的转出与接收灵宠。" };
    }
    var fromPet = getPetById(fromPetId);
    var toPet = getPetById(toPetId);
    if (!fromPet) return { ok: false, message: "未找到转出灵宠。" };
    if (!toPet) return { ok: false, message: "未找到接收灵宠。" };
    normalizePetObject(fromPet);
    normalizePetObject(toPet);
    if (fromPet.locked) return { ok: false, message: "转出灵宠已锁定，无法转移升星。" };
    var fromStars = getPetStarLevel(fromPet);
    if (fromStars < 1) return { ok: false, message: "转出灵宠尚无星数可转移。" };
    var frags = ensurePlayerPetFragments();
    if (frags < PET_STAR_TRANSFER_COST) {
        return {
            ok: false,
            message: "灵宠碎片不足（需 " + PET_STAR_TRANSFER_COST + "，当前 " + frags + "）。",
        };
    }
    return { ok: true, fromStars: fromStars, cost: PET_STAR_TRANSFER_COST };
}

function applyPetStarTransferLocal(fromPetId, toPetId) {
    var check = canTransferPetStars(fromPetId, toPetId);
    if (!check.ok) return check;
    var fromPet = getPetById(fromPetId);
    var toPet = getPetById(toPetId);
    normalizePetObject(fromPet);
    normalizePetObject(toPet);
    var transferStars = getPetStarLevel(fromPet);
    fromPet.stars = 0;
    toPet.stars = Math.min(PET_STAR_MAX, transferStars);
    player.petFragments = ensurePlayerPetFragments() - check.cost;
    rebuildPetBonusStats(fromPet);
    rebuildPetBonusStats(toPet);
    return {
        ok: true,
        fromStars: 0,
        toStars: toPet.stars,
        petFragments: player.petFragments,
        fromPetId: fromPetId,
        toPetId: toPetId,
    };
}

function showPetStarTransferFirstConfirm(fromPetId, toPetId, fromStars) {
    if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
    var fp = getPetById(fromPetId);
    var toPet = getPetById(toPetId);
    if (!fp || !toPet) return;
    normalizePetObject(fp);
    normalizePetObject(toPet);
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML =
        '<div class="content pet-star-transfer">' +
        '<p class="pet-star-transfer__lead">确认转移升星？</p>' +
        '<ul class="pet-rel-confirm__info" role="list">' +
        "<li><strong>转出</strong>：" +
        escapeHtmlForPetModal(fp.name || "无名") +
        "（" +
        fromStars +
        " 星 → 0 星）</li>" +
        "<li><strong>接收</strong>：" +
        escapeHtmlForPetModal(toPet.name || "无名") +
        "（" +
        getPetStarLevel(toPet) +
        " 星 → " +
        fromStars +
        " 星）</li>" +
        "<li><strong>消耗</strong>：灵宠碎片 ×" +
        PET_STAR_TRANSFER_COST +
        "</li></ul>" +
        '<div class="button-container">' +
        '<button type="button" id="pet-star-transfer-yes">确认转移</button>' +
        '<button type="button" id="pet-star-transfer-no">取消</button></div></div>';
    var yesBtn = document.getElementById("pet-star-transfer-yes");
    var noBtn = document.getElementById("pet-star-transfer-no");
    if (yesBtn) {
        yesBtn.onclick = function () {
            showPetStarTransferSecondConfirm(fromPetId, toPetId, fromStars);
        };
    }
    if (noBtn) {
        noBtn.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
        };
    }
}

function showPetStarTransferSecondConfirm(fromPetId, toPetId, fromStars) {
    if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
    var fp = getPetById(fromPetId);
    var toPet = getPetById(toPetId);
    if (!fp || !toPet) return;
    normalizePetObject(fp);
    normalizePetObject(toPet);
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML =
        '<div class="content pet-star-transfer pet-star-transfer--final">' +
        '<p class="pet-star-transfer__lead pet-star-transfer__lead--warn">再次确认：升星转移不可撤销</p>' +
        '<p class="pet-star-transfer__note">转出方星数将清零，接收方将被覆盖为转出方当前星数，并消耗 <strong>' +
        PET_STAR_TRANSFER_COST +
        "</strong> 片灵宠碎片。</p>" +
        '<ul class="pet-rel-confirm__info" role="list">' +
        "<li><strong>转出</strong>：" +
        escapeHtmlForPetModal(fp.name || "无名") +
        " → 0 星</li>" +
        "<li><strong>接收</strong>：" +
        escapeHtmlForPetModal(toPet.name || "无名") +
        " → " +
        fromStars +
        " 星</li></ul>" +
        '<div class="button-container">' +
        '<button type="button" class="btn btn--accent" id="pet-star-transfer-final-yes">确定转移</button>' +
        '<button type="button" id="pet-star-transfer-final-back">返回上一步</button>' +
        '<button type="button" id="pet-star-transfer-final-no">取消</button></div></div>';
    var finalYes = document.getElementById("pet-star-transfer-final-yes");
    var finalBack = document.getElementById("pet-star-transfer-final-back");
    var finalNo = document.getElementById("pet-star-transfer-final-no");
    if (finalYes) {
        finalYes.onclick = function () {
            executePetStarTransfer(fromPetId, toPetId);
        };
    }
    if (finalBack) {
        finalBack.onclick = function () {
            showPetStarTransferFirstConfirm(fromPetId, toPetId, fromStars);
        };
    }
    if (finalNo) {
        finalNo.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
        };
    }
}

function openPetStarTransferModal(fromPetId) {
    ensurePlayerPetCollection();
    var fromPet = getPetById(fromPetId);
    if (!fromPet) return;
    normalizePetObject(fromPet);
    var check;
    if (fromPet.locked) {
        check = { ok: false, message: "转出灵宠已锁定，无法转移升星。" };
    } else if (getPetStarLevel(fromPet) < 1) {
        check = { ok: false, message: "当前灵宠尚无星数可转移。" };
    } else if (ensurePlayerPetFragments() < PET_STAR_TRANSFER_COST) {
        check = {
            ok: false,
            message: "灵宠碎片不足（需 " + PET_STAR_TRANSFER_COST + "，当前 " + ensurePlayerPetFragments() + "）。",
        };
    } else {
        check = { ok: true };
    }
    if (!check.ok) {
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>' +
                escapeHtmlForPetModal(check.message || "无法转移升星。") +
                '</p><div class="button-container"><button type="button" id="pet-star-transfer-fail-ok">知晓</button></div></div>';
            var failOk = document.querySelector("#pet-star-transfer-fail-ok");
            if (failOk) {
                failOk.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
        }
        return;
    }
    var targets = [];
    for (var i = 0; i < player.petCollection.length; i++) {
        var pet = player.petCollection[i];
        if (!pet || pet.id === fromPetId) continue;
        normalizePetObject(pet);
        targets.push(pet);
    }
    if (!targets.length) {
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>栏中尚无其他灵宠可接收升星。</p><div class="button-container"><button type="button" id="pet-star-transfer-empty-ok">知晓</button></div></div>';
            var emptyOk = document.querySelector("#pet-star-transfer-empty-ok");
            if (emptyOk) {
                emptyOk.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
        }
        return;
    }
    var fromStars = getPetStarLevel(fromPet);
    var listHtml = targets
        .map(function (tp) {
            var tpStars = getPetStarLevel(tp);
            var realm =
                typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(tp.lvl) : "Lv." + tp.lvl;
            var ageName =
                typeof getPetAgeTierDef === "function" ? getPetAgeTierDef(tp.ageTier).name : "";
            var typeZh =
                typeof PET_TYPE_LABEL_ZH !== "undefined" && PET_TYPE_LABEL_ZH[tp.type]
                    ? PET_TYPE_LABEL_ZH[tp.type]
                    : tp.type;
            return (
                '<li class="pet-star-transfer__item">' +
                '<div class="pet-star-transfer__meta">' +
                "<strong>" +
                escapeHtmlForPetModal(tp.name || "无名") +
                "</strong> · " +
                escapeHtmlForPetModal(ageName) +
                " · " +
                escapeHtmlForPetModal(typeZh) +
                " · " +
                escapeHtmlForPetModal(realm) +
                '<br><span class="pet-ui__muted">当前 ' +
                tpStars +
                " 星 → 接收后 " +
                fromStars +
                " 星</span></div>" +
                '<button type="button" class="btn btn--sm btn--accent pet-star-transfer-pick" data-from-pet-id="' +
                fromPetId +
                '" data-to-pet-id="' +
                tp.id +
                '">选择</button></li>'
            );
        })
        .join("");
    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML =
            '<div class="content pet-star-transfer">' +
            '<p class="pet-star-transfer__lead">将 <strong>' +
            escapeHtmlForPetModal(fromPet.name || "无名") +
            "</strong> 的 <strong>" +
            fromStars +
            " 星</strong> 全部转移给另一只灵宠（转出方变为 0 星，消耗灵宠碎片 ×" +
            PET_STAR_TRANSFER_COST +
            "）。</p>" +
            '<ul class="pet-star-transfer__list" role="list">' +
            listHtml +
            "</ul>" +
            '<div class="button-container"><button type="button" id="pet-star-transfer-cancel">取消</button></div></div>';
        defaultModalElement.querySelectorAll(".pet-star-transfer-pick").forEach(function (btn) {
            btn.onclick = function () {
                var fromId = btn.getAttribute("data-from-pet-id");
                var toId = btn.getAttribute("data-to-pet-id");
                showPetStarTransferFirstConfirm(fromId, toId, fromStars);
            };
        });
        var cancelBtn = document.getElementById("pet-star-transfer-cancel");
        if (cancelBtn) {
            cancelBtn.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
            };
        }
    }
}

function executePetStarTransfer(fromPetId, toPetId) {
    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
    }
    var check = canTransferPetStars(fromPetId, toPetId);
    if (!check.ok) {
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>' +
                escapeHtmlForPetModal(check.message || "无法转移升星。") +
                '</p><div class="button-container"><button type="button" id="pet-star-transfer-block-ok">知晓</button></div></div>';
            var blockOk = document.querySelector("#pet-star-transfer-block-ok");
            if (blockOk) {
                blockOk.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
        }
        return;
    }
    var localTransfer = applyPetStarTransferLocal(fromPetId, toPetId);
    if (!(localTransfer && localTransfer.ok)) return;
    if (toPetId) petPanelFocusId = toPetId;
    if (typeof saveData === "function") {
        saveData({ forceCloud: true, playerMutation: true });
    }
    if (typeof calculateStats === "function") calculateStats();
    if (typeof playerLoadStats === "function") playerLoadStats();
    renderPetPanel();
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
 * 秘境层数对应的「修为不宜过高」阈限：第 1 层 11，第 2 层 16，之后每层 +5（与人物层封顶 10/15/20… 对齐，压制在 cap+1 起生效）。
 * 超过则出战灵宠并入人物的机缘按 -99999% 计（见 getActivePetBonusStats）。
 */
function getDungeonFloorPetOpportunityLevelCap(floor) {
    floor = Math.max(1, Math.floor(Number(floor) || 1));
    return 10 + (floor - 1) * 5;
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
    var eq =
        typeof getPetEquipmentBonusStats === "function"
            ? getPetEquipmentBonusStats(pet)
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    if (
        player &&
        player.activePetId === pet.id &&
        typeof isPlayerLevelOverPetOpportunityCapForCurrentFloor === "function" &&
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
        hp: ((b.hp || 0) + (eq.hp || 0)) * om,
        atk: ((b.atk || 0) + (eq.atk || 0)) * om,
        def: ((b.def || 0) + (eq.def || 0)) * om,
        atkSpd: ((b.atkSpd || 0) + (eq.atkSpd || 0)) * om,
        vamp: ((b.vamp || 0) + (eq.vamp || 0)) * om,
        critRate: ((b.critRate || 0) + (eq.critRate || 0)) * om,
        critDmg: ((b.critDmg || 0) + (eq.critDmg || 0)) * om
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
        },
        stars: 0
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
    /** 灵宠类型成长倍率 v7：全类型按新表重算机缘，仅执行一次 */
    if (!player.__dongtianPetGrowthMultV7) {
        player.__dongtianPetGrowthMultV7 = 1;
        var rebuiltPetGrowth = false;
        for (var migPi = 0; migPi < player.petCollection.length; migPi++) {
            var migPet = player.petCollection[migPi];
            if (!migPet) continue;
            normalizePetObject(migPet);
            rebuildPetBonusStats(migPet);
            rebuiltPetGrowth = true;
        }
        if (rebuiltPetGrowth && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }
}

function ensurePlayerPetCollection() {
    migratePlayerPets();
    ensurePlayerPetFragments();
    if (player.activePetId && typeof getPetById === "function" && !getPetById(player.activePetId)) {
        player.activePetId = player.petCollection.length ? player.petCollection[0].id : null;
    }
    enforceActivePetDeployLevelLimit();
    if (typeof ensurePlayerPetEquipmentBag === "function") ensurePlayerPetEquipmentBag();
    if (typeof syncPetEquipmentEquippedFlags === "function") syncPetEquipmentEquippedFlags();
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
    var eq =
        typeof getPetEquipmentBonusStats === "function"
            ? getPetEquipmentBonusStats(pet)
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var om =
        typeof PET_OPPORTUNITY_BONUS_MULT === "number" && isFinite(PET_OPPORTUNITY_BONUS_MULT) && PET_OPPORTUNITY_BONUS_MULT > 0
            ? PET_OPPORTUNITY_BONUS_MULT
            : 3;
    var g = typeof PET_GLOBAL_POWER_MULT === "number" && isFinite(PET_GLOBAL_POWER_MULT) ? PET_GLOBAL_POWER_MULT : 1.5;
    var merge = g * om;
    return {
        hp: ((b.hp || 0) + (eq.hp || 0)) * merge,
        atk: ((b.atk || 0) + (eq.atk || 0)) * merge,
        def: ((b.def || 0) + (eq.def || 0)) * merge,
        atkSpd: ((b.atkSpd || 0) + (eq.atkSpd || 0)) * merge,
        vamp: ((b.vamp || 0) + (eq.vamp || 0)) * merge,
        critRate: ((b.critRate || 0) + (eq.critRate || 0)) * merge,
        critDmg: ((b.critDmg || 0) + (eq.critDmg || 0)) * merge
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
    if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
    else if (typeof saveData === "function") saveData();
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
    p.locked = p.locked === true || p.locked === 1 || p.locked === "1";
    if (typeof p.stars !== "number" || !isFinite(p.stars) || p.stars < 0) {
        p.stars = 0;
    } else {
        p.stars = Math.min(PET_STAR_MAX, Math.floor(p.stars));
    }
    if (!p.pillUses || typeof p.pillUses !== "object") p.pillUses = {};
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
    repairPetExpForCurrentLevel(p);
    if (typeof ensurePetEquipmentSlots === "function") ensurePetEquipmentSlots(p);
    rebuildPetBonusStats(p);
}

/** 载入洞天档后批量校正灵宠经验曲线（最多 20 只） */
function repairAllPetsExpIfMismatch() {
    if (typeof player === "undefined" || !player || !Array.isArray(player.petCollection)) return 0;
    var n = 0;
    for (var i = 0; i < player.petCollection.length; i++) {
        var pet = player.petCollection[i];
        if (!pet) continue;
        if (repairPetExpForCurrentLevel(pet)) {
            rebuildPetBonusStats(pet);
            n++;
        }
    }
    if (n > 0) {
        if (typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            if (typeof window.dongtianFlushCloudSaveImmediate === "function") {
                window.dongtianFlushCloudSaveImmediate();
            } else {
                window.__dongtianLocalPlayerDirty = true;
                if (typeof saveData === "function") {
                    saveData({ forceCloud: true, playerMutation: true });
                }
            }
        } else if (typeof saveData === "function") {
            saveData();
        }
    }
    return n;
}
window.repairAllPetsExpIfMismatch = repairAllPetsExpIfMismatch;

/** 单层机缘成长（随类型与灵根） */
function addOnePetGrowthTick(pet) {
    if (!pet || !pet.bonusStats) return;
    var roots = getPetRootsForCalc(pet) || pet.roots;
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
    var inc = getPetExpBaseReqForLevel(pet.lvl);
    pet.lvl++;
    pet.exp.expMax += inc;
    pet.exp.expMaxLvl = getPetExpBaseReqForLevel(pet.lvl);
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
    var dmPetM =
        typeof window.getDongtianDemonTowerPetExpMultiplier === "function"
            ? window.getDongtianDemonTowerPetExpMultiplier()
            : 1;
    if (dmPetM > 0 && isFinite(dmPetM)) {
        grant = Math.max(0, Math.floor(grant * dmPetM));
    }
    var dvPetM =
        typeof window.getDongtianDivineRealmPetExpMultiplier === "function"
            ? window.getDongtianDivineRealmPetExpMultiplier()
            : 1;
    if (dvPetM > 0 && isFinite(dvPetM)) {
        grant = Math.max(0, Math.floor(grant * dvPetM));
    }
    var sbrPetM =
        typeof window.getDongtianSpiritBeastRealmPetExpMultiplier === "function"
            ? window.getDongtianSpiritBeastRealmPetExpMultiplier()
            : 1;
    if (sbrPetM > 0 && isFinite(sbrPetM)) {
        grant = Math.max(0, Math.floor(grant * sbrPetM));
    }
    var yuqiPetM =
        typeof window.getDongtianYuqiPetExpKillMult === "function" ? window.getDongtianYuqiPetExpKillMult() : 1;
    if (yuqiPetM > 0 && isFinite(yuqiPetM)) {
        grant = Math.max(0, Math.floor(grant * yuqiPetM));
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
    try {
        if (
            typeof window.isDongtianTowerCombatSession === "function" &&
            window.isDongtianTowerCombatSession()
        ) {
            return false;
        }
    } catch (eTowerPet) {}
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
    if (typeof savePlayerInventoryMutation === "function") {
        savePlayerInventoryMutation();
    } else if (typeof saveData === "function") {
        saveData({ forceCloud: true, playerMutation: true });
    }
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

/** 灵宠面板「斗法推演」：≥1000 用 k/M/B/T/P 缩写（仅此区块） */
function formatPetCombatDeductionDisplay(val, decimalsSmall) {
    if (typeof formatCompactNum === "function") return formatCompactNum(val, decimalsSmall);
    var n = Number(val);
    if (!isFinite(n)) return "0";
    var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var d = decimalsSmall == null ? 2 : decimalsSmall;
    return n.toFixed(d).replace(rx, "$1");
}

function buildPetPanelCombatDeductionHtml(combat) {
    if (!combat) return "";
    return (
        '<div class="pet-ui__section pet-ui__section--combat">' +
        '<h5 class="pet-ui__section-title">斗法推演</h5>' +
        '<p class="pet-ui__section-note">依当前人物面板估算；仅<strong>出战</strong>时在斗法中以此出手。</p>' +
        '<div class="pet-ui__stat-grid">' +
        '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">预估力道</span><span class="pet-ui__stat-val">' +
        formatPetCombatDeductionDisplay(combat.atk, 2) +
        "</span></div>" +
        '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">身法</span><span class="pet-ui__stat-val">' +
        formatPetCombatDeductionDisplay(combat.atkSpd, 2) +
        "</span></div>" +
        '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">会心</span><span class="pet-ui__stat-val">' +
        formatPetCombatDeductionDisplay(combat.critRate, 1) +
        "%</span></div>" +
        '<div class="pet-ui__stat-cell"><span class="pet-ui__stat-label">暴伤</span><span class="pet-ui__stat-val">' +
        formatPetCombatDeductionDisplay(combat.critDmg, 2) +
        "</span></div>" +
        '<div class="pet-ui__stat-cell pet-ui__stat-cell--wide"><span class="pet-ui__stat-label">吸血</span><span class="pet-ui__stat-val">' +
        formatPetCombatDeductionDisplay(combat.vamp, 2) +
        "%</span></div>" +
        "</div></div>"
    );
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
    var eqBs =
        typeof getPetEquipmentBonusStats === "function"
            ? getPetEquipmentBonusStats(pet)
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var effBs = {
        hp: (bs.hp || 0) + (eqBs.hp || 0),
        atk: (bs.atk || 0) + (eqBs.atk || 0),
        def: (bs.def || 0) + (eqBs.def || 0),
        atkSpd: (bs.atkSpd || 0) + (eqBs.atkSpd || 0),
        vamp: (bs.vamp || 0) + (eqBs.vamp || 0),
        critRate: (bs.critRate || 0) + (eqBs.critRate || 0),
        critDmg: (bs.critDmg || 0) + (eqBs.critDmg || 0)
    };
    var ageDef = getPetAgeTierDef(pet.ageTier);
    var ageBonusPct = typeof pet.ageBonusPct === "number"
        ? pet.ageBonusPct
        : (ageDef && typeof ageDef.bonusMinPct === "number" && typeof ageDef.bonusMaxPct === "number"
            ? (ageDef.bonusMinPct + ageDef.bonusMaxPct) / 2
            : 0);
    var ageMult = 1 + (ageBonusPct / 100);
    var atkMul = 0.13 + Math.min(0.29, lv * 0.0021);
    var atk = player.stats.atk * atkMul * (1 + (effBs.atk || 0) / 115) * PET_GLOBAL_POWER_MULT * ageMult;
    var aspMul = 0.4 + Math.min(0.42, lv * 0.0038);
    var atkSpd = player.stats.atkSpd * aspMul * (1 + (effBs.atkSpd || 0) / 185) * PET_GLOBAL_POWER_MULT * ageMult;
    var critRate = Math.min(90, (player.stats.critRate * 0.5 + (effBs.critRate || 0) * 0.75) * PET_GLOBAL_POWER_MULT * ageMult);
    var critDmg = (player.stats.critDmg * 0.46 + (effBs.critDmg || 0) * 0.82) * PET_GLOBAL_POWER_MULT * ageMult;
    var vamp = (player.stats.vamp * 0.33 + (effBs.vamp || 0) * 0.52) * PET_GLOBAL_POWER_MULT * ageMult;
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

function sanitizePetDisplayName(raw) {
    var s = String(raw == null ? "" : raw).trim();
    s = s.replace(/[\u0000-\u001f\u007f<>\"'&\\]/g, "");
    s = s.replace(/\s+/g, "");
    if (s.length > PET_NAME_MAX_LEN) s = s.slice(0, PET_NAME_MAX_LEN);
    return s;
}

function renamePet(petId, rawName) {
    ensurePlayerPetCollection();
    var pet = typeof getPetById === "function" ? getPetById(petId) : null;
    if (!pet) return false;
    normalizePetObject(pet);
    var next = sanitizePetDisplayName(rawName);
    if (!next) return false;
    if (next === pet.name) return true;
    pet.name = next;
    if (typeof savePlayerInventoryMutation === "function") savePlayerInventoryMutation();
    else if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
    else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
    if (typeof playerLoadStats === "function") playerLoadStats();
    if (typeof renderPetPanel === "function") renderPetPanel();
    return true;
}

function openPetRenameDialog(petId) {
    ensurePlayerPetCollection();
    var pet = typeof getPetById === "function" ? getPetById(petId) : null;
    if (!pet) return;
    normalizePetObject(pet);
    var curName = pet.name || "";
    var finish = function (raw) {
        if (raw == null) return;
        var ok = renamePet(petId, raw);
        if (!ok && typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>名称不能为空，且不可含 &lt; &gt; &amp; 等特殊符号；最多 ' +
                PET_NAME_MAX_LEN +
                ' 字。</p><div class="button-container"><button type="button" id="pet-rename-err-ok">知晓</button></div></div>';
            var errOk = document.getElementById("pet-rename-err-ok");
            if (errOk) {
                errOk.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                    openPetRenameDialog(petId);
                };
            }
        }
    };
    if (typeof defaultModalElement === "undefined" || !defaultModalElement) {
        finish(window.prompt("请输入灵宠新名（最多 " + PET_NAME_MAX_LEN + " 字）", curName));
        return;
    }
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML =
        '<div class="content pet-rename-modal">' +
        '<p class="pet-rename-modal__lead">为灵宠取一个新名。</p>' +
        '<label class="pet-rename-modal__label" for="pet-rename-input">灵宠名</label>' +
        '<input type="text" id="pet-rename-input" class="pet-rename-modal__input" maxlength="' +
        PET_NAME_MAX_LEN +
        '" value="' +
        escapeHtmlForPetModal(curName) +
        '" autocomplete="off" />' +
        '<p class="pet-rename-modal__hint">最多 ' +
        PET_NAME_MAX_LEN +
        " 字；不可含尖括号等特殊符号。</p>" +
        '<div class="button-container">' +
        '<button type="button" id="pet-rename-save">确定</button>' +
        '<button type="button" id="pet-rename-cancel">取消</button>' +
        "</div></div>";
    var input = document.getElementById("pet-rename-input");
    var saveBtn = document.getElementById("pet-rename-save");
    var cancelBtn = document.getElementById("pet-rename-cancel");
    var closeDialog = function () {
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
    };
    if (cancelBtn) {
        cancelBtn.onclick = closeDialog;
    }
    if (saveBtn) {
        saveBtn.onclick = function () {
            var val = input ? input.value : "";
            closeDialog();
            finish(val);
        };
    }
    if (input) {
        input.focus();
        input.select();
        input.addEventListener("keydown", function onKey(ev) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                if (saveBtn) saveBtn.click();
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                closeDialog();
            }
        });
    }
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
    return { name: name, realm: realm, year: year, fragmentGain: 1 };
}

function applyPetReleaseLocal(petId) {
    ensurePlayerPetCollection();
    var idx = -1;
    for (var i = 0; i < player.petCollection.length; i++) {
        if (player.petCollection[i].id === petId) {
            idx = i;
            break;
        }
    }
    if (idx < 0) return false;
    var relPet = player.petCollection[idx];
    normalizePetObject(relPet);
    if (relPet.locked) return false;
    if (typeof returnAllPetEquipmentToBag === "function") returnAllPetEquipmentToBag(relPet);
    player.petCollection.splice(idx, 1);
    if (player.activePetId === petId) {
        player.activePetId = player.petCollection.length ? player.petCollection[0].id : null;
    }
    if (petPanelFocusId === petId) petPanelFocusId = null;
    ensurePlayerPetFragments();
    player.petFragments += 1;
    return true;
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
    var relPet = player.petCollection[idx];
    normalizePetObject(relPet);
    if (relPet.locked) return;

    var finishUi = function () {
        if (typeof saveData === "function") {
            saveData({ forceCloud: true, playerMutation: true });
        }
        if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
        renderPetPanel();
    };

    if (
        typeof window !== "undefined" &&
        window.DONGTIAN_CLOUD_MODE &&
        window.__dongtianCloudHydrated
    ) {
        var req = null;
        try {
            req = window.parent && window.parent.goldGameApiRequest;
        } catch (eApi) {
            req = null;
        }
        if (!req) {
            if (applyPetReleaseLocal(petId)) finishUi();
            return;
        }
        req("POST", "/api/dongtian-jie/pet/release", { petId: petId }, true)
            .then(function (res) {
                if (!res || !res.ok) {
                    var msg = (res && res.message) || "灵宠放生同步失败，请检查网络后重试。";
                    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                        defaultModalElement.style.display = "flex";
                        defaultModalElement.innerHTML =
                            '<div class="content"><p>' +
                            msg +
                            '</p><div class="button-container"><button type="button" id="pet-release-fail-ok">知晓</button></div></div>';
                        var okBtn = document.querySelector("#pet-release-fail-ok");
                        if (okBtn) {
                            okBtn.onclick = function () {
                                defaultModalElement.style.display = "none";
                                defaultModalElement.innerHTML = "";
                            };
                        }
                    }
                    return;
                }
                if (Array.isArray(res.petCollection)) {
                    player.petCollection = JSON.parse(JSON.stringify(res.petCollection));
                } else if (!applyPetReleaseLocal(petId)) {
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(res, "activePetId")) {
                    player.activePetId = res.activePetId;
                }
                if (typeof res.petFragments === "number" && isFinite(res.petFragments)) {
                    player.petFragments = Math.max(0, Math.floor(res.petFragments));
                }
                if (window.DONGTIAN_CLOUD_MODE) {
                    if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                        window.dongtianSyncRevisionFromApiResponse(res);
                    }
                    if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
                        window.dongtianInvalidateCloudSaveResponses();
                    }
                }
                finishUi();
            })
            .catch(function () {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>灵宠放生同步失败，请检查网络后重试。</p><div class="button-container"><button type="button" id="pet-release-net-ok">知晓</button></div></div>';
                    var okNet = document.querySelector("#pet-release-net-ok");
                    if (okNet) {
                        okNet.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
            });
        return;
    }

    if (applyPetReleaseLocal(petId)) finishUi();
}

function applyPetStarUpgradeLocal(petId) {
    ensurePlayerPetCollection();
    var pet = getPetById(petId);
    if (!pet) return { ok: false, message: "未找到该灵宠。" };
    var check = canUpgradePetStar(pet);
    if (!check.ok) return check;
    normalizePetObject(pet);
    player.petFragments = ensurePlayerPetFragments() - check.cost;
    pet.stars = getPetStarLevel(pet) + 1;
    rebuildPetBonusStats(pet);
    return { ok: true, stars: pet.stars, petFragments: player.petFragments };
}

function upgradePetStar(petId) {
    ensurePlayerPetCollection();
    var pet = getPetById(petId);
    if (!pet) return;
    var check = canUpgradePetStar(pet);
    if (!check.ok) {
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>' +
                escapeHtmlForPetModal(check.message || "无法升星。") +
                '</p><div class="button-container"><button type="button" id="pet-star-fail-ok">知晓</button></div></div>';
            var failOk = document.querySelector("#pet-star-fail-ok");
            if (failOk) {
                failOk.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
        }
        return;
    }

    var finishUi = function () {
        if (typeof saveData === "function") {
            saveData({ forceCloud: true, playerMutation: true });
        }
        if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
        renderPetPanel();
    };

    if (
        typeof window !== "undefined" &&
        window.DONGTIAN_CLOUD_MODE &&
        window.__dongtianCloudHydrated
    ) {
        var req = null;
        try {
            req = window.parent && window.parent.goldGameApiRequest;
        } catch (eApi) {
            req = null;
        }
        if (!req) {
            var localRes = applyPetStarUpgradeLocal(petId);
            if (localRes && localRes.ok) finishUi();
            return;
        }
        req("POST", "/api/dongtian-jie/pet/star-upgrade", { petId: petId }, true)
            .then(function (res) {
                if (!res || !res.ok) {
                    var msg = (res && res.message) || "灵宠升星同步失败，请检查网络后重试。";
                    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                        defaultModalElement.style.display = "flex";
                        defaultModalElement.innerHTML =
                            '<div class="content"><p>' +
                            msg +
                            '</p><div class="button-container"><button type="button" id="pet-star-sync-fail-ok">知晓</button></div></div>';
                        var syncFailOk = document.querySelector("#pet-star-sync-fail-ok");
                        if (syncFailOk) {
                            syncFailOk.onclick = function () {
                                defaultModalElement.style.display = "none";
                                defaultModalElement.innerHTML = "";
                            };
                        }
                    }
                    return;
                }
                if (res.pet && res.pet.id) {
                    var target = getPetById(res.pet.id);
                    if (target) {
                        normalizePetObject(target);
                        target.stars = typeof res.pet.stars === "number" ? res.pet.stars : target.stars;
                        rebuildPetBonusStats(target);
                    }
                } else {
                    applyPetStarUpgradeLocal(petId);
                }
                if (typeof res.petFragments === "number" && isFinite(res.petFragments)) {
                    player.petFragments = Math.max(0, Math.floor(res.petFragments));
                }
                if (window.DONGTIAN_CLOUD_MODE) {
                    if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                        window.dongtianSyncRevisionFromApiResponse(res);
                    }
                    if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
                        window.dongtianInvalidateCloudSaveResponses();
                    }
                }
                finishUi();
            })
            .catch(function () {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>灵宠升星同步失败，请检查网络后重试。</p><div class="button-container"><button type="button" id="pet-star-net-ok">知晓</button></div></div>';
                    var netOk = document.querySelector("#pet-star-net-ok");
                    if (netOk) {
                        netOk.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
            });
        return;
    }

    var localUp = applyPetStarUpgradeLocal(petId);
    if (localUp && localUp.ok) finishUi();
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
    var prevRoster = el.querySelector(".pet-ui__roster-list");
    var savedRosterScroll = prevRoster ? prevRoster.scrollTop : 0;
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
            var isLocked = !!pet.locked;
            var petStars = getPetStarLevel(pet);
            var pillBtn =
                typeof window.openDongtianPetPillModal === "function"
                    ? '<button type="button" class="btn btn--sm btn--ghost pet-btn-pills" data-pet-id="' +
                      pet.id +
                      '">丹药</button>'
                    : "";
            var equipBtn =
                typeof ensurePetEquipmentSlots === "function"
                    ? '<button type="button" class="btn btn--sm btn--ghost pet-btn-equip" data-pet-id="' +
                      pet.id +
                      '">法器</button>'
                    : "";
            var marketBtn =
                typeof window.DONGTIAN_CLOUD_MODE !== "undefined" && window.DONGTIAN_CLOUD_MODE
                    ? isLocked
                      ? '<span class="pet-roster__market-wrap"><button type="button" class="btn btn--sm btn--ghost pet-btn-market" disabled title="已锁定，无法上架与赠送">修仙上架</button>' +
                        '<button type="button" class="btn btn--sm btn--ghost pet-btn-gift" disabled title="已锁定，无法上架与赠送">赠送</button></span>'
                      : '<span class="pet-roster__market-wrap"><button type="button" class="btn btn--sm btn--ghost pet-btn-market" data-pet-id="' +
                        pet.id +
                        '">修仙上架</button>' +
                        '<button type="button" class="btn btn--sm btn--ghost pet-btn-gift" data-pet-id="' +
                        pet.id +
                        '">赠送</button></span>'
                    : "";
            var lockBtn =
                '<button type="button" class="btn btn--sm pet-btn-lock ' +
                (isLocked ? "btn--accent" : "btn--ghost") +
                '" data-pet-id="' +
                pet.id +
                '" title="' +
                (isLocked ? "解除锁定后可放生、上架与赠送" : "锁定后无法放生、修仙上架与赠送") +
                '">' +
                (isLocked ? "已锁定" : "锁定") +
                "</button>";
            var releaseBtn =
                '<button type="button" class="btn btn--sm btn--ghost pet-btn-release" data-pet-id="' +
                pet.id +
                '"' +
                (isLocked ? ' disabled title="已锁定，无法放生"' : "") +
                ">放生</button>";
            return (
                '<div class="pet-roster__row' +
                (petPanelFocusId === pet.id ? " pet-roster__row--focus" : "") +
                '" data-pet-id="' +
                pet.id +
                '">' +
                '<span class="pet-roster__name">' +
                (active ? '<i class="fas fa-dragon pet-roster__totem" title="出战"></i>' : "") +
                escapeHtmlForPetModal(pet.name) +
                "</span>" +
                '<span class="pet-roster__meta">' +
                (petStars > 0 ? '<span class="pet-roster__stars" title="升星 ' + petStars + '/' + PET_STAR_MAX + '">' + formatPetStarsDisplay(petStars) + "</span> · " : "") +
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
                pillBtn +
                equipBtn +
                lockBtn +
                marketBtn +
                releaseBtn +
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
        var effRoots = getPetRootsForCalc(p) || p.roots;
        var starsLv = getPetStarLevel(p);
        var rootsHtml = PET_ROOT_KEYS.map(function (k) {
            return (
                '<span class="pet-root-tag pet-root-tag--' +
                k +
                '">' +
                PET_ROOT_LABEL_ZH[k] +
                " " +
                Math.round(effRoots[k] || 0) +
                "</span>"
            );
        }).join("");
        var frags = ensurePlayerPetFragments();
        var starCost = getPetStarUpgradeCost(starsLv);
        var starSection =
            '<div class="pet-ui__section pet-ui__section--star">' +
            '<h5 class="pet-ui__section-title">升星 <span class="pet-ui__section-tag">' +
            starsLv +
            "/" +
            PET_STAR_MAX +
            "</span></h5>" +
            '<p class="pet-ui__star-row"><span class="pet-ui__stars" title="每星全灵根 +10%">' +
            formatPetStarsDisplay(starsLv) +
            "</span></p>" +
            '<p class="pet-ui__muted">灵宠碎片：<strong>' +
            frags +
            "</strong>（放生灵宠获得 1 片）</p>" +
            (starCost
                ? '<p style="margin-top:10px"><button type="button" class="btn btn--sm btn--accent pet-btn-star-upgrade" data-pet-id="' +
                  p.id +
                  '"' +
                  (frags < starCost ? ' disabled title="碎片不足，需 ' + starCost + ' 片"' : ' title="消耗 ' + starCost + ' 片升至 ' + (starsLv + 1) + ' 星"') +
                  ">升星（需 " +
                  starCost +
                  " 片）</button></p>"
                : '<p class="pet-ui__muted" style="margin-top:8px">已满星。</p>') +
            (starsLv > 0
                ? '<p style="margin-top:8px"><button type="button" class="btn btn--sm btn--ghost pet-btn-star-transfer" data-pet-id="' +
                  p.id +
                  '"' +
                  (frags < PET_STAR_TRANSFER_COST
                      ? ' disabled title="碎片不足，转移升星需 ' + PET_STAR_TRANSFER_COST + ' 片"'
                      : ' title="将全部 ' + starsLv + ' 星转移给其他灵宠（转出方变 0 星，消耗 ' + PET_STAR_TRANSFER_COST + ' 片）"') +
                  ">转移升星（需 " +
                  PET_STAR_TRANSFER_COST +
                  " 片）</button></p>"
                : "") +
            "</div>";
        var realmLine =
            typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(p.lvl) : "境界 Lv." + p.lvl;
        var combat = typeof getPetCombatStatsForPet === "function" ? getPetCombatStatsForPet(p) : null;
        var combatHtml = buildPetPanelCombatDeductionHtml(combat);
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
        var peqSection = "";
        if (typeof ensurePetEquipmentSlots === "function") {
            ensurePetEquipmentSlots(p);
            var peqSlots = ["horn", "collar", "scale"];
            var peqList = "";
            for (var peqI = 0; peqI < peqSlots.length; peqI++) {
                var peqSlot = peqSlots[peqI];
                var peqId = p.equipment && p.equipment[peqSlot];
                var peqItem = peqId && typeof getPetEquipmentById === "function" ? getPetEquipmentById(peqId) : null;
                var slotLabel =
                    typeof PET_EQUIP_SLOT_ZH !== "undefined" && PET_EQUIP_SLOT_ZH[peqSlot] ? PET_EQUIP_SLOT_ZH[peqSlot] : peqSlot;
                peqList +=
                    '<li class="pet-ui__peq-item">' +
                    slotLabel +
                    "：" +
                    (peqItem
                        ? '<span class="' +
                          (peqItem.rarity === "legend"
                              ? "Legendary"
                              : peqItem.rarity === "epic"
                              ? "Epic"
                              : peqItem.rarity === "rare"
                              ? "Rare"
                              : peqItem.rarity === "uncommon"
                              ? "Uncommon"
                              : "Common") +
                          '">' +
                          peqItem.name +
                          "</span>"
                        : '<span class="pet-ui__muted">空</span>') +
                    "</li>";
            }
            var eqBonusOnly =
                typeof getPetEquipmentBonusStats === "function"
                    ? getPetEquipmentBonusStats(p)
                    : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
            var hasEqBonus = false;
            for (var peqK in eqBonusOnly) {
                if (Math.abs(eqBonusOnly[peqK] || 0) > 0.005) hasEqBonus = true;
            }
            peqSection =
                '<div class="pet-ui__section pet-ui__section--peq">' +
                '<h5 class="pet-ui__section-title">灵宠法器 <span class="pet-ui__section-tag">三才位</span></h5>' +
                '<p class="pet-ui__section-note">攻击/防御/体力型仅同类可佩，通用型皆可；境界须达法器等级。</p>' +
                '<ul class="pet-ui__peq-list">' +
                peqList +
                "</ul>" +
                (hasEqBonus
                    ? '<p class="pet-ui__muted" style="margin-top:8px;font-size:0.78rem">法器机缘已并入上方「机缘加成」。</p>'
                    : "") +
                '<p style="margin-top:10px"><button type="button" class="btn btn--sm btn--ghost pet-btn-equip" data-pet-id="' +
                p.id +
                '">管理法器</button></p></div>';
        }
        var peqStarRow = starSection;
        if (peqSection) {
            peqStarRow =
                '<div class="pet-ui__peq-star-row">' + peqSection + starSection + "</div>";
        }
        detail =
            '<div class="pet-ui__detail">' +
            '<div class="pet-ui__detail-head">' +
            '<div class="pet-ui__name-row">' +
            '<h4 class="pet-ui__detail-title">' +
            escapeHtmlForPetModal(p.name) +
            "</h4>" +
            '<button type="button" class="btn btn--sm btn--ghost pet-btn-rename" data-pet-id="' +
            p.id +
            '" title="修改灵宠名">改名</button>' +
            "</div>" +
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
            '<div class="pet-ui__roots" title="五行灵根认主时凝定；升星按有效值展示">' +
            rootsHtml +
            "</div>" +
            (starsLv > 0
                ? '<p class="pet-ui__muted pet-ui__roots-hint">升星与服丹里程碑加成已计入上方灵根；每星全灵根 +10%，里程碑与升星独立相乘。</p>'
                : '<p class="pet-ui__muted pet-ui__roots-hint">五行灵根于认主时凝定；可在「丹药」中以炼丹阁所得灵丹淬炼（账号共用，每次全灵宠同步提升）。</p>') +
            "</div>" +
            peqStarRow +
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
            "%</strong> 几率得幼兽认主；同运亦可得<strong>灵宠法器</strong>（三才位 · 法器行囊上限 30）。秘境层越高，<strong>灵根跨度</strong>与法器等级上限越佳。</p>";
    }

    el.innerHTML =
        '<div class="pet-ui pet-ui--collection pet-ui--xian">' +
        '<div class="pet-ui__intro-block">' +
        '<p class="pet-ui__hint">出战灵宠的机缘并入人物面板；修为入账时按 <strong>' +
        Math.round(PET_EXP_SHARE_FROM_PLAYER * 1000) / 10 +
        "%</strong> 化为该兽悟性（仅出战）。斗法中与主人同节拍出手。</p>" +
        "<p class=\"pet-ui__hint\" style=\"margin-top:10px;opacity:0.92;font-size:0.92em;line-height:1.45\">出战境界上限为「历史最高等级 + 10」；灵兽境界超出时将<strong>自动卸下</strong>出战。</p>" +
        (typeof ensurePetEquipmentSlots === "function"
            ? '<p class="pet-ui__hint" style="margin-top:8px;opacity:0.92;font-size:0.92em;line-height:1.45">斩妖约 <strong>1%</strong> 几率得灵宠法器（灵角/灵环/灵鳞）；仅<strong>出战</strong>灵宠的法器机缘并入人物面板。</p>'
            : "") +
        "</div>" +
        '<div class="pet-ui__layout">' +
        '<div class="pet-ui__col pet-ui__col--left">' +
        '<div class="pet-ui__roster">' +
        '<header class="pet-ui__roster-head">' +
        '<h5 class="pet-ui__roster-title"><span class="pet-ui__roster-cap">灵兽栏</span><span class="pet-ui__roster-count">（' +
        coll.length +
        "/" +
        PET_COLLECTION_MAX +
        '）</span><span class="pet-ui__fragments" title="放生灵宠获得">碎片 ' +
        ensurePlayerPetFragments() +
        "</span></h5>" +
        "</header>" +
        '<div class="pet-ui__roster-list">' +
        (roster || '<p class="pet-ui__empty">栏内空空——去斩妖吧。</p>') +
        "</div>" +
        "</div></div>" +
        '<div class="pet-ui__col pet-ui__col--right">' +
        '<div class="pet-ui__detail-panel">' +
        detail +
        "</div></div></div></div>";
    var rosterAfter = el.querySelector(".pet-ui__roster-list");
    if (rosterAfter) {
        rosterAfter.scrollTop = savedRosterScroll;
        requestAnimationFrame(function () {
            rosterAfter.scrollTop = savedRosterScroll;
            requestAnimationFrame(function () {
                rosterAfter.scrollTop = savedRosterScroll;
            });
        });
    }
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

        var renameBtn = ev.target.closest(".pet-btn-rename");
        if (renameBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var rid = renameBtn.getAttribute("data-pet-id");
            if (rid) openPetRenameDialog(rid);
            return;
        }

        var lockBtnEl = ev.target.closest(".pet-btn-lock");
        if (lockBtnEl) {
            ev.preventDefault();
            ev.stopPropagation();
            var lid = lockBtnEl.getAttribute("data-pet-id");
            if (lid) {
                var lp = typeof getPetById === "function" ? getPetById(lid) : null;
                if (lp) {
                    normalizePetObject(lp);
                    lp.locked = !lp.locked;
                    if (typeof savePlayerInventoryMutation === "function") savePlayerInventoryMutation();
                    else if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
                    else if (typeof saveData === "function") saveData();
                    renderPetPanel();
                }
            }
            return;
        }

        var pillB = ev.target.closest(".pet-btn-pills");
        if (pillB) {
            ev.preventDefault();
            ev.stopPropagation();
            var pidP = pillB.getAttribute("data-pet-id");
            if (pidP && typeof window.openDongtianPetPillModal === "function") {
                window.openDongtianPetPillModal(pidP);
            }
            return;
        }

        var equipB = ev.target.closest(".pet-btn-equip");
        if (equipB) {
            ev.preventDefault();
            ev.stopPropagation();
            var pidE = equipB.getAttribute("data-pet-id");
            if (pidE && typeof window.openDongtianPetEquipModal === "function") {
                window.openDongtianPetEquipModal(pidE);
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

        var gft = ev.target.closest(".pet-btn-gift");
        if (gft) {
            ev.preventDefault();
            ev.stopPropagation();
            var gid = gft.getAttribute("data-pet-id");
            if (gid && typeof window.dongtianMarketOpenGiftPet === "function") {
                window.dongtianMarketOpenGiftPet(gid);
            }
            return;
        }

        var starUp = ev.target.closest(".pet-btn-star-upgrade");
        if (starUp) {
            ev.preventDefault();
            ev.stopPropagation();
            if (starUp.disabled) return;
            var sid = starUp.getAttribute("data-pet-id");
            if (sid) upgradePetStar(sid);
            return;
        }

        var starTransfer = ev.target.closest(".pet-btn-star-transfer");
        if (starTransfer) {
            ev.preventDefault();
            ev.stopPropagation();
            if (starTransfer.disabled) return;
            var transferFromId = starTransfer.getAttribute("data-pet-id");
            if (transferFromId) openPetStarTransferModal(transferFromId);
            return;
        }

        var rel = ev.target.closest(".pet-btn-release");
        if (rel) {
            ev.preventDefault();
            ev.stopPropagation();
            if (rel.disabled) return;
            var pid = rel.getAttribute("data-pet-id");
            if (!pid) return;
            var rp = typeof getPetById === "function" ? getPetById(pid) : null;
            if (rp) {
                normalizePetObject(rp);
                if (rp.locked) return;
            }
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
                    '<li><strong>获得</strong>：灵宠碎片 ×1</li>' +
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
    var effRoots = getPetRootsForCalc(p) || p.roots;
    var starsLv = getPetStarLevel(p);
    var rootsHtml = PET_ROOT_KEYS.map(function (k) {
        return (
            '<span class="pet-root-tag pet-root-tag--' +
            k +
            '">' +
            PET_ROOT_LABEL_ZH[k] +
            " " +
            Math.round(effRoots[k] || 0) +
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
        '<p class="pet-ui__type-readonly"><strong>升星</strong>：<span class="pet-ui__stars">' +
        formatPetStarsDisplay(starsLv) +
        "</span>（" +
        starsLv +
        "/" +
        PET_STAR_MAX +
        "）</p>" +
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
