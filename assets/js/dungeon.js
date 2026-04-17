const dungeonActivity = document.querySelector("#dungeonActivity");
const dungeonAction = document.querySelector("#dungeonAction");
const dungeonTime = document.querySelector("#dungeonTime");
const floorCount = document.querySelector("#floorCount");
const roomCount = document.querySelector("#roomCount");
let escortActivity = null;
/** 秘境计时器（战败/退出时会被 clear，需 restartDungeonHubTimers 恢复） */
var dungeonTimer = null;
var playTimer = null;
/** 事件进行中点击“深入秘境/凝结时隙”时，延迟到事件结束后执行一次切换 */
var pendingDungeonStartPauseToggle = false;

let dungeon = {
    rating: 500,
    grade: "E",
    progress: {
        floor: 1,
        room: 1,
        floorLimit: 100,
        roomLimit: 20,
    },
    settings: {
        enemyBaseLvl: 1,
        enemyLvlGap: 5,
        enemyBaseStats: 1,
        enemyScaling: 1.12,
        deferredEvent: null,
        eventMemory: null,
        chainTitleBuff: null,
        qingmingChainIntroDoneFloor: 0,
        /** 缚咒桩（邪印）：最近一次已出现过的秘境层；与本层 progress.floor 相等时本层不再入池 curse */
        curseTotemDoneFloor: 0,
        /** 温馨降敌势奇遇：已触发记录所对应的秘境层；换层清空 */
        warmEaseFloor: 0,
        /** 本层已触发过的温馨奇遇 id（每条每层的仅一次） */
        warmEaseUsed: {},
    },
    status: {
        exploring: false,
        paused: true,
        event: false,
    },
    statistics: {
        kills: 0,
        runtime: 0,
    },
    backlog: [],
    action: 0,
};
/** 敌势（enemyScaling）对怪物面板与遗器随机强度的生效倍率；1 为设计值，略小于 1 则同系数下整体更易 */
var DUNGEON_ENEMY_SCALING_IMPACT = 0.9;
/** 遗器随机 statMultiplier：敌势 ≤ 分支系数时 (enemyScaling−1) 全额；超过分支的部分再乘 EXCESS_RATIO（不影响邪印、怪物强度） */
var DUNGEON_ENEMY_SCALING_EQ_BRANCH = 1.12;
var DUNGEON_ENEMY_SCALING_EQ_EXCESS_RATIO = 0.1;
/** 秘境敌势系数下限：所有减法与读档合并均不得低于此值 */
var DUNGEON_ENEMY_SCALING_MIN = 1.02;
/** 第 1 层怪物敌势保底基数；第 n 层怪物保底见 getDungeonEnemyScalingMonsterFloorMinimum（单机与联网均为同一分段步长）（存档可低于保底用于遗器/UI/邪印） */
var DUNGEON_ENEMY_SCALING_MONSTER_MIN = 1.12;
/** 分段保底中 2–5 层每层增量；6–10 / 11–15 / 16+ 见 getDungeonEnemyScalingMonsterFloorMinimum */
var DUNGEON_ENEMY_SCALING_MONSTER_MIN_PER_FLOOR = 0.05;
/** 秘境第 1 层敌势上限；第 n 层上限 = 此值 + (n−1)×下值（例：1 层 1.3，2 层 1.4，3 层 1.5） */
var DUNGEON_ENEMY_SCALING_CAP_FLOOR1 = 1.3;
var DUNGEON_ENEMY_SCALING_CAP_PER_FLOOR = 0.1;

/** 事件等「增加敌势」的增量全局倍率（0.3 = 设计增量仅生效 30%；减敌势/钳位勿用 applyDungeonEnemyScalingGain） */
var DUNGEON_ENEMY_SCALING_GAIN_MULT = 0.3;

function applyDungeonEnemyScalingGain(delta) {
    var d = typeof delta === "number" && isFinite(delta) ? delta : 0;
    if (d <= 0) return 0;
    var m =
        typeof DUNGEON_ENEMY_SCALING_GAIN_MULT === "number" && isFinite(DUNGEON_ENEMY_SCALING_GAIN_MULT)
            ? DUNGEON_ENEMY_SCALING_GAIN_MULT
            : 0.3;
    return d * m;
}

/** 「降低敌势」类事件：对基础减量乘此倍率（4 = 基础减量的 4 倍） */
var DUNGEON_ENEMY_SCALING_LOSS_MULT = 4;

function applyDungeonEnemyScalingLoss(delta) {
    var d = typeof delta === "number" && isFinite(delta) ? delta : 0;
    if (d <= 0) return 0;
    var m =
        typeof DUNGEON_ENEMY_SCALING_LOSS_MULT === "number" && isFinite(DUNGEON_ENEMY_SCALING_LOSS_MULT)
            ? DUNGEON_ENEMY_SCALING_LOSS_MULT
            : 4;
    return d * m;
}

function getDungeonEnemyScalingCeilingForFloor(floor) {
    var f = Math.max(1, Math.floor(Number(floor) || 1));
    return DUNGEON_ENEMY_SCALING_CAP_FLOOR1 + (f - 1) * DUNGEON_ENEMY_SCALING_CAP_PER_FLOOR;
}

/** 怪物强度用敌势保底下限：第 1 层 1.12；2–5 层每层 +MONSTER_MIN_PER_FLOOR；6–10 层每层 +0.1；11–15 层每层 +0.12；16 层起每层 +0.16（单机与联网同一套；与存档 enemyScaling 取 max，仅影响怪物面板计算） */
function getDungeonEnemyScalingMonsterFloorMinimum(floor) {
    var f = Math.max(1, Math.floor(Number(floor) || 1));
    var step =
        typeof DUNGEON_ENEMY_SCALING_MONSTER_MIN_PER_FLOOR === "number" &&
        isFinite(DUNGEON_ENEMY_SCALING_MONSTER_MIN_PER_FLOOR) &&
        DUNGEON_ENEMY_SCALING_MONSTER_MIN_PER_FLOOR >= 0
            ? DUNGEON_ENEMY_SCALING_MONSTER_MIN_PER_FLOOR
            : 0.05;
    var inc = 0;
    for (var i = 2; i <= f; i++) {
        if (i <= 5) inc += step;
        else if (i <= 10) inc += 0.1;
        else if (i <= 15) inc += 0.12;
        else inc += 0.16;
    }
    return DUNGEON_ENEMY_SCALING_MONSTER_MIN + inc;
}

/** 将存档中的 enemyScaling 压到当前层允许的上限（不低于 DUNGEON_ENEMY_SCALING_MIN） */
function clampDungeonEnemyScalingToFloorCeiling(dungeonRef) {
    if (!dungeonRef || !dungeonRef.settings || !dungeonRef.progress) return;
    var esc = Number(dungeonRef.settings.enemyScaling);
    if (!isFinite(esc)) return;
    var cap = getDungeonEnemyScalingCeilingForFloor(dungeonRef.progress.floor);
    dungeonRef.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, Math.min(esc, cap));
}

/** 伏击宝藏等延后结算：true 时不直落整件遗器而折为材料。启封灵匣已在 chestEvent 内固定为灵石，不依赖本开关。 */
function dongtianCloudWildEquipmentDropDisabled() {
    return false;
}

/** 事件日志：修为成功入账为「，修为 +n」；层数封顶为「，（封顶提示）」 */
function dongtianDungeonExpCommaWeiOrHint(amount, added) {
    if (!amount || amount <= 0) return "";
    if (added) return `，修为 <b>+${nFormatter(amount)}</b>`;
    var h = dongtianDungeonPlayerExpMissedGainHintZh(amount, false);
    return h ? "，" + h : "";
}

/** 句首/段首「修为 +n」或封顶提示（无前置逗号） */
function dongtianDungeonExpWeiOrHint(amount, added) {
    if (!amount || amount <= 0) return "";
    if (added) return `修为 <b>+${nFormatter(amount)}</b>`;
    return dongtianDungeonPlayerExpMissedGainHintZh(amount, false);
}

function dongtianHashSeed(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function dongtianMulberry32(a) {
    return function () {
        var t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * 联网洞天：秘境主事件掷骰用确定性种子（层数+劫数+本周期 action，已在 dungeon.action++ 之后）。
 * 关页重开同一进度不会重洗机缘；单机仍用 Math.random()。
 */
function dongtianEventSeeded01(salt) {
    if (!window.DONGTIAN_CLOUD_MODE) return Math.random();
    var da = dungeon && typeof dungeon.action === "number" && !isNaN(dungeon.action) ? dungeon.action : 0;
    var f = dungeon && dungeon.progress && typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1;
    var r = dungeon && dungeon.progress && typeof dungeon.progress.room === "number" ? dungeon.progress.room : 1;
    var key = f + "|" + r + "|" + da + "|" + String(salt || "x");
    return dongtianMulberry32(dongtianHashSeed(key))();
}

/** 温馨降敌势：13 条独立奇遇 id；每层各最多触发一次 */
var WARM_EASE_EVENT_IDS = [
    "warmEaseLantern",
    "warmEaseDewPool",
    "warmEaseFallingLeaf",
    "warmEaseHearthEcho",
    "warmEaseFinchRest",
    "warmEaseWallFlower",
    "warmEaseScentTrace",
    "warmEaseOldTune",
    "warmEaseRainLetter",
    "warmEaseTurnBack",
    "warmEaseSilentPromise",
    "warmEaseChildEcho",
    "warmEaseFrostHand",
];
/** 温馨奇遇：action≤5 时额外追加的「整组 13 条」遍数（只加温馨槽；0 表示不额外加倍，略降降敌势触发率） */
var WARM_EASE_POOL_EXTRA_FULL_SETS = 0;

function isWarmEaseEventId(id) {
    return typeof id === "string" && WARM_EASE_EVENT_IDS.indexOf(id) !== -1;
}

function syncWarmEaseFloorTracking() {
    if (!dungeon || !dungeon.settings || !dungeon.progress) return;
    var f = Math.max(1, typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1);
    if (typeof dungeon.settings.warmEaseFloor !== "number" || isNaN(dungeon.settings.warmEaseFloor)) {
        dungeon.settings.warmEaseFloor = f;
        dungeon.settings.warmEaseUsed = {};
        return;
    }
    if (dungeon.settings.warmEaseFloor !== f) {
        dungeon.settings.warmEaseFloor = f;
        dungeon.settings.warmEaseUsed = {};
    }
}

function isWarmEaseUsedThisFloor(id) {
    if (!isWarmEaseEventId(id)) return false;
    syncWarmEaseFloorTracking();
    var u = dungeon.settings.warmEaseUsed;
    if (!u || typeof u !== "object") return false;
    return u[id] === true;
}

function markWarmEaseUsedThisFloor(id) {
    if (!isWarmEaseEventId(id)) return;
    syncWarmEaseFloorTracking();
    if (!dungeon.settings.warmEaseUsed || typeof dungeon.settings.warmEaseUsed !== "object") {
        dungeon.settings.warmEaseUsed = {};
    }
    dungeon.settings.warmEaseUsed[id] = true;
}

/** 掷骰前从池内去掉本层已触发的温馨奇遇，不占权重；13 条齐后该层池内无温馨槽 */
function filterWarmEaseUsedFromEventPool(eventTypesArr) {
    if (!eventTypesArr || !eventTypesArr.length) return eventTypesArr;
    syncWarmEaseFloorTracking();
    var u = dungeon.settings.warmEaseUsed;
    if (!u || typeof u !== "object") return eventTypesArr;
    var out = [];
    for (var i = 0; i < eventTypesArr.length; i++) {
        var ev = eventTypesArr[i];
        if (isWarmEaseEventId(ev) && u[ev] === true) continue;
        out.push(ev);
    }
    return out.length ? out : ["nothing"];
}

/** 缚咒桩（邪印）：本层已出现过则池内 curse 槽改为 nothing，避免再掷到邪印 */
function filterCurseTotemDoneFromEventPool(eventTypesArr) {
    if (!eventTypesArr || !eventTypesArr.length) return eventTypesArr;
    if (!dungeon || !dungeon.settings || !dungeon.progress) return eventTypesArr;
    var f = Math.max(1, Math.floor(Number(dungeon.progress.floor) || 1));
    if (
        typeof dungeon.settings.curseTotemDoneFloor !== "number" ||
        !isFinite(dungeon.settings.curseTotemDoneFloor) ||
        dungeon.settings.curseTotemDoneFloor !== f
    ) {
        return eventTypesArr;
    }
    var out = [];
    for (var ci = 0; ci < eventTypesArr.length; ci++) {
        out.push(eventTypesArr[ci] === "curse" ? "nothing" : eventTypesArr[ci]);
    }
    return out;
}

/** 按 expMax 比例奖励修为：每层最多一次；换层时重置 */
function syncDungeonExpFloorRewardCap() {
    if (!dungeon || !dungeon.settings || !dungeon.progress) return;
    var f = Math.max(1, typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1);
    if (typeof dungeon.settings.expFloorRewardTrackFloor !== "number" || dungeon.settings.expFloorRewardTrackFloor !== f) {
        dungeon.settings.expFloorRewardTrackFloor = f;
        dungeon.settings.expFloorRewardConsumed = false;
    }
}

/** 本层尚未发过则随机 1%～5% 的 expMax 并标记已发；已发过则返回 0 */
function rollDungeonExpFloorRewardAmount() {
    syncDungeonExpFloorRewardCap();
    if (dungeon.settings.expFloorRewardConsumed) return 0;
    var amt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.01, 0.05)));
    dungeon.settings.expFloorRewardConsumed = true;
    return amt;
}

/** 宝藏伏击战：记录待发放奖励（战斗胜利后发） */
let dungeonTreasureAmbushPending = null;
/** 宝藏伏击：强化石 / 开孔器 / 附魔石 各自掷骰，不再必掉（与秘境镇守等无关） */
const TREASURE_AMBUSH_MATERIAL_DROP_RATE = 0.2;
/** 联网「路遇道友」在事件池中的条数（与总池均匀随机，条数越少概率越低）。原为 7/6/6，二层再各 +2。 */
var DUNGEON_CLOUD_MEET_POOL_KIND = 2;
var DUNGEON_CLOUD_MEET_POOL_RIVAL = 2;
var DUNGEON_CLOUD_MEET_POOL_TAO = 2;
/** 秘境第 2 层起在上面的基础上再追加的条数（原为各 +2；0 表示二层不再加权） */
var DUNGEON_CLOUD_MEET_FLOOR2_EXTRA_KIND = 0;
var DUNGEON_CLOUD_MEET_FLOOR2_EXTRA_RIVAL = 0;
var DUNGEON_CLOUD_MEET_FLOOR2_EXTRA_TAO = 0;
/** 高危事件战斗胜利追加奖励（仅指定事件生效） */
let dungeonDangerVictoryPending = null;
/** 劫同心：情劫战斗胜利后接续延后剧情 */
let dungeonBondSoulCombatPending = null;
/** 感情向奇遇：斗法胜利后接续（与 bondSoul 并行，互斥使用） */
let dungeonQingmingCombatPending = null;
let dungeonBeastBondCombatPending = null;
let dungeonEchoMirrorCombatPending = null;
let dungeonWhisperPactCombatPending = null;
let dungeonHeartDemonCombatPending = null;
/** 押镖模式（MVP）：与秘境探索互斥 */
function buildEscortDefaultState() {
    return {
        active: false,
        status: { exploring: false, paused: true, event: false, choosing: false },
        progress: { segment: 0, segmentLimit: 3 },
        cartHp: 100,
        action: 0,
        riskKey: "normal",
        rewardMul: 1,
        pendingBattle: null,
        bossTriggered: false,
        minQualityBonus: 0,
        orderBonus: null,
        refreshCost: 250,
        /** 点击“开启押镖”后，需到达该劫数才可进入押镖选择 */
        unlockAtRoom: 0,
        /** 是否已点入押镖斗法（与驿站/陷阱等非战斗抉择区分，避免关斗法面板时误清 escort.status.event 导致下一秒又掷奇遇覆盖选项） */
        awaitingCombatOutcome: false
    };
}
let escort = buildEscortDefaultState();

/** 押镖怪物最低品质档（与 ENEMY_QUALITY_TIERS 下标一致）：3=精锐 */
const ESCORT_MIN_QUALITY_TIER = 3;

/** 段数已相对初版翻倍；三档在耐久、品质、战斗倍率、奖励上拉开明显差距 */
const ESCORT_RISK_PRESET = {
    safe: {
        name: "凡镖",
        segmentLimit: 6,
        cartHp: 128,
        /** 整趟酬金/感悟基础倍率 */
        rewardMul: 0.72,
        /** 终点结算在 rewardMul 之上再乘（灵石） */
        completionGoldMul: 0.92,
        /** 终点结算感悟额外倍率 */
        completionExpMul: 0.88,
        /** 押镖圆满时额外给强化石概率 */
        completionStoneChance: 0.06,
        minQuality: 3,
        banditHpAtkDef: 1.07,
        banditSpd: 1.04,
        bossHpAtkDef: 1.05,
        bossSpd: 1.03,
        rewardDropBonus: 1.04,
        /** 每场战斗「酬谢」灵石相对基准的倍率 */
        battleTipMul: 0.78,
        /** 首领战额外强化石概率 */
        bossStoneChance: 0.08,
    },
    normal: {
        name: "险镖",
        segmentLimit: 8,
        cartHp: 100,
        rewardMul: 1.38,
        completionGoldMul: 1.1,
        completionExpMul: 1.1,
        completionStoneChance: 0.26,
        minQuality: 5,
        banditHpAtkDef: 1.2,
        banditSpd: 1.09,
        bossHpAtkDef: 1.14,
        bossSpd: 1.07,
        rewardDropBonus: 1.1,
        battleTipMul: 1.05,
        bossStoneChance: 0.34,
    },
    deadly: {
        name: "绝镖",
        segmentLimit: 10,
        cartHp: 68,
        rewardMul: 2.18,
        completionGoldMul: 1.48,
        completionExpMul: 1.45,
        completionStoneChance: 0.55,
        minQuality: 8,
        banditHpAtkDef: 1.38,
        banditSpd: 1.14,
        bossHpAtkDef: 1.3,
        bossSpd: 1.12,
        rewardDropBonus: 1.18,
        battleTipMul: 1.48,
        bossStoneChance: 0.58,
    },
};
const ESCORT_TICKET_MAX = 5;
const ESCORT_TICKET_RECHARGE_MS = 30 * 60 * 1000;
const ESCORT_ORDER_REFRESH_BASE_COST = 250;
const ESCORT_ORDER_REFRESH_STEP_COST = 250;
const ESCORT_OPEN_DELAY_ROOMS = 1;
const ESCORT_ROOM_OPEN_BLOCK_AT = 17;

/** 灵脉采矿：五档矿兽、次数与押镖分立 */
let miningActivity = null;
const MINING_TICKET_MAX = 5;
const MINING_TICKET_RECHARGE_MS = 60 * 60 * 1000;
const MINING_OPEN_DELAY_ROOMS = 1;
const MINING_ROOM_OPEN_BLOCK_AT = 17;
/** 矿髓额外遗器：区间内稀有度每高 1 档，权重约为上一档的 1/该值（越大则高稀有越难出） */
const MINING_BONUS_EQUIP_RARITY_STEEP = 2.65;

function buildMiningDefaultState() {
    return {
        active: false,
        status: { exploring: false, paused: true, event: false, choosing: false },
        progress: { segment: 0, segmentLimit: 5 },
        cartHp: 100,
        action: 0,
        tier: 0,
        pendingBattle: null,
        unlockAtRoom: 0,
        /** 同押镖：仅在地脉矿兽战关闭斗法面板时允许自愈清 mining.status.event */
        awaitingCombatOutcome: false
    };
}

let mining = buildMiningDefaultState();

/** 五档：档位越高 → 波数↑、enemyMul↑、相对地脉余量↓（单调变难）；另含通关包与矿髓遗器；descend/blurb 为叙事 */
const MINING_TIER_DEF = [
    {
        name: "青砂浅脉",
        blurb: "地表灵砂混杂，偶有矿兽出没，如入初学者的试炼洞府，机缘浅而险亦浅。",
        descend:
            "你踏罡步、入浅表，但见青砂在足下发微光，似古修士曾试剑留痕；一缕地肺清气拂面，竟比人间洞天更静。",
        segmentLimit: 5,
        cartHp: 100,
        enemyMul: 0.88,
        packMin: 1,
        packMax: 2,
        bonusEquipChance: 0,
        equipRarityMinIdx: 1,
        equipRarityMaxIdx: 2,
    },
    {
        name: "灵髓矿道",
        blurb: "灵髓渐浓如乳，矿兽成群；传闻此道通残碑半块，刻「髓出则兽醒」。",
        descend:
            "矿道曲折如龙肠，壁上灵髓渗出点点莹光；偶有钟乳滴落，落地成砂，竟自生一缕灵机，引你往更深处探去。",
        segmentLimit: 6,
        cartHp: 92,
        enemyMul: 1.04,
        packMin: 2,
        packMax: 4,
        bonusEquipChance: 0.14,
        equipRarityMinIdx: 1,
        equipRarityMaxIdx: 3,
    },
    {
        name: "玄铁深井",
        blurb: "井渊寒气刺骨，矿脉躁动；再下数丈，便似踏入某位炼器宗师未竟的遗禁。",
        descend:
            "井口黑风倒卷，玄铁锈气与灵火余温纠缠不散；你以真元护住心脉，方觉脚下矿层深处，有古阵残纹一闪而没。",
        segmentLimit: 7,
        cartHp: 86,
        enemyMul: 1.2,
        packMin: 3,
        packMax: 6,
        bonusEquipChance: 0.22,
        equipRarityMinIdx: 1,
        equipRarityMaxIdx: 4,
    },
    {
        name: "劫煞矿渊",
        blurb: "劫气渗入矿脉，兽性近乎通灵；此渊常有「矿劫」异兆，非大福即大险。",
        descend:
            "渊底劫煞如雾，矿脉如活物般搏动；你神识所及，竟见无数细碎金芒在岩层里游走，似有天材地宝将出世而未出。",
        segmentLimit: 8,
        cartHp: 93,
        enemyMul: 1.36,
        packMin: 5,
        packMax: 8,
        bonusEquipChance: 0.34,
        equipRarityMinIdx: 2,
        equipRarityMaxIdx: 5,
    },
    {
        name: "混沌龙脉",
        blurb: "龙脉残响与矿髓混一，一步一劫；传说乃上古龙陨之地，灵物与凶煞同窟。",
        descend:
            "混沌气旋在渊心缓缓转动，龙吟若远若近；你心知此非人间路数，乃是大地残存的一线真灵，敢入者皆为求造化之辈。",
        segmentLimit: 10,
        cartHp: 110,
        enemyMul: 1.52,
        packMin: 8,
        packMax: 10,
        bonusEquipChance: 0.48,
        equipRarityMinIdx: 2,
        equipRarityMaxIdx: 6,
    },
];

function pickMiningRand(arr) {
    if (!arr || !arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

/** 遇矿兽：按档位愈凶，文案愈险 */
const MINING_BEAST_ENCOUNTER_BY_TIER = [
    [
        '<span class="Heirloom">地脉微颤，一头矿兽自青砂中凝形，獠牙尚沾未冷矿尘。</span>',
        '<span class="Heirloom">浅脉亦有灵！兽影从矿屑里翻身而起，似被你的气机惊醒。</span>',
        '<span class="Heirloom">忽闻砂落如雨，矿兽借地肺余温成形，眸中一点赤芒。</span>',
    ],
    [
        '<span class="Heirloom">灵髓滴落处，兽影蠕动聚合，竟似吞了半缕残碑上的古篆灵机。</span>',
        '<span class="Heirloom">矿道深处传来闷响，矿兽踏髓而来，足印所过，石壁自生细纹。</span>',
        '<span class="Heirloom">灵机一乱，兽从髓脉中析出，口吐砂雾，欲夺你前路。</span>',
    ],
    [
        '<span class="Heirloom">玄铁寒气与地火余温相冲，矿兽于冰火交界处现身，鳞甲铿锵。</span>',
        '<span class="Heirloom">井渊回音叠荡，兽借残阵余威扑来，似守洞府之兽。</span>',
        '<span class="Heirloom">黑铁崩裂，矿兽自裂缝中挤出，爪下竟有炼器火星未熄。</span>',
    ],
    [
        '<span class="Heirloom">劫煞翻涌如沸，矿兽瞳中映出你的劫影——此战似为天心所记。</span>',
        '<span class="Heirloom">渊底金芒骤聚，兽与劫气同生，一步一煞，逼你止步。</span>',
        '<span class="Heirloom">矿脉搏动如鼓，兽随鼓点现身，竟似劫数化形。</span>',
    ],
    [
        '<span class="Heirloom">混沌龙吟贯耳，矿兽自气旋中踏出，周身鳞纹如古篆流转。</span>',
        '<span class="Heirloom">龙脉残响与矿髓合一，兽影庞大如山，却轻若无物。</span>',
        '<span class="Heirloom">一线真灵自渊心溢出，凝为矿兽，阻你于造化门前。</span>',
    ],
];

/** 每斩一头后：地脉余波提示（随机） */
const MINING_PULSE_BEATS = [
    '<span class="Uncommon">地脉震颤未休，下一缕凶机已在矿层深处苏醒。</span>',
    '<span class="Uncommon">你镇住灵机一瞬，矿壁深处却传来更沉的回响。</span>',
    '<span class="Uncommon">兽气散尽，矿髓微光如星点浮动，引你再往前行。</span>',
    '<span class="Uncommon">残响沿脉而走，似古修遗禁被惊动，须再凝神。</span>',
    '<span class="Uncommon">砂落如雨，气机未稳，下一头已在暗处嗅到你的血气。</span>',
    '<span class="Uncommon">地肺轻鸣，如远处钟磬，提醒你此脉尚未封灵。</span>',
];

const MINING_CART_DMG_LINES = [
    "矿脉随你一击而颤，稳固被削去 <b>%DMG%</b>，罡风逆走。",
    "兽陨处地脉失衡，矿层裂响，稳固 <b>%DMG%</b> 化为劫灰。",
    "灵髓溅落如星，余波削脉 <b>%DMG%</b>，须速镇之。",
    "你以术印镇脉一息，仍被反震削去稳固 <b>%DMG%</b>。",
];

const MINING_GOLD_LINES = [
    '灵砂伴生矿屑入手：<i class="fas fa-coins" style="color: #FFD700;"></i><b>%GOLD%</b>（地肺薄偿，亦算奇遇）。',
    '矿隙间溢出灵砂，凝为灵石：<i class="fas fa-coins" style="color: #FFD700;"></i><b>%GOLD%</b>。',
    '残脉吐金，砂里藏缘：<i class="fas fa-coins" style="color: #FFD700;"></i><b>%GOLD%</b>。',
    '一缕地宝精气化作黄白物：<i class="fas fa-coins" style="color: #FFD700;"></i><b>%GOLD%</b>。',
];

function ensureMiningDailyState() {
    if (!player) return { tickets: MINING_TICKET_MAX, lastTs: Date.now() };
    if (!player.miningDaily || typeof player.miningDaily !== "object") {
        player.miningDaily = { tickets: MINING_TICKET_MAX, lastTs: Date.now() };
    }
    if (typeof player.miningDaily.tickets !== "number" || isNaN(player.miningDaily.tickets)) {
        player.miningDaily.tickets = MINING_TICKET_MAX;
    }
    if (typeof player.miningDaily.lastTs !== "number" || isNaN(player.miningDaily.lastTs) || player.miningDaily.lastTs <= 0) {
        player.miningDaily.lastTs = Date.now();
    }
    player.miningDaily.tickets = Math.max(0, Math.min(MINING_TICKET_MAX, Math.floor(player.miningDaily.tickets)));
    var now = Date.now();
    if (player.miningDaily.tickets >= MINING_TICKET_MAX) {
        player.miningDaily.lastTs = now;
        return player.miningDaily;
    }
    var elapsed = Math.max(0, now - player.miningDaily.lastTs);
    if (elapsed >= MINING_TICKET_RECHARGE_MS) {
        var gain = Math.floor(elapsed / MINING_TICKET_RECHARGE_MS);
        player.miningDaily.tickets = Math.min(MINING_TICKET_MAX, player.miningDaily.tickets + gain);
        if (player.miningDaily.tickets >= MINING_TICKET_MAX) {
            player.miningDaily.lastTs = now;
        } else {
            player.miningDaily.lastTs += gain * MINING_TICKET_RECHARGE_MS;
        }
    }
    return player.miningDaily;
}

function getMiningDailyRemain() {
    var s = ensureMiningDailyState();
    return Math.max(0, Math.min(MINING_TICKET_MAX, s.tickets));
}

function consumeMiningDailyTicket() {
    var s = ensureMiningDailyState();
    if (s.tickets < 1) return false;
    var wasFull = s.tickets >= MINING_TICKET_MAX;
    s.tickets -= 1;
    if (wasFull) {
        s.lastTs = Date.now();
    }
    return true;
}

function miningNextRecoverText() {
    var s = ensureMiningDailyState();
    if (s.tickets >= MINING_TICKET_MAX) return "已满";
    var remainMs = MINING_TICKET_RECHARGE_MS - Math.max(0, Date.now() - s.lastTs);
    var sec = Math.max(0, Math.ceil(remainMs / 1000));
    var mm = Math.floor(sec / 60);
    var ss = sec % 60;
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

function applyMiningOfflineRecharge() {
    if (!player) return 0;
    var before = 0;
    if (player.miningDaily && typeof player.miningDaily.tickets === "number" && !isNaN(player.miningDaily.tickets)) {
        before = Math.max(0, Math.min(MINING_TICKET_MAX, Math.floor(player.miningDaily.tickets)));
    } else {
        before = MINING_TICKET_MAX;
    }
    var s = ensureMiningDailyState();
    var after = Math.max(0, Math.min(MINING_TICKET_MAX, Math.floor(s.tickets)));
    return Math.max(0, after - before);
}

function resetMiningStateHard() {
    var def = buildMiningDefaultState();
    mining.active = def.active;
    mining.status = Object.assign({}, def.status);
    mining.progress = def.progress;
    mining.cartHp = def.cartHp;
    mining.action = def.action;
    mining.tier = def.tier;
    mining.pendingBattle = def.pendingBattle;
    mining.unlockAtRoom = def.unlockAtRoom;
    mining.awaitingCombatOutcome = def.awaitingCombatOutcome;
    if (dungeon) dungeon.miningState = mining;
    if (typeof syncRunBarModeText === "function") syncRunBarModeText();
}

function tryMiningBonusEquipmentDrop(tierIdx) {
    var def = MINING_TIER_DEF[tierIdx];
    if (!def || tierIdx < 1) return;
    if (Math.random() >= def.bonusEquipChance) return;
    if (typeof EQUIPMENT_RARITY_TIER_ORDER === "undefined" || typeof createEquipment !== "function" || typeof getEquipmentRarityTierIndex !== "function") return;
    var minI = Math.max(0, Math.floor(def.equipRarityMinIdx));
    var maxI = Math.min(EQUIPMENT_RARITY_TIER_ORDER.length - 1, Math.floor(def.equipRarityMaxIdx));
    if (maxI < minI) maxI = minI;
    // 区间内稀有度下标越高权重按指数骤降（高稀有明显更难）
    var steep = typeof MINING_BONUS_EQUIP_RARITY_STEEP === "number" && MINING_BONUS_EQUIP_RARITY_STEEP > 1 ? MINING_BONUS_EQUIP_RARITY_STEEP : 2.5;
    var totalW = 0;
    for (var wi = minI; wi <= maxI; wi++) {
        totalW += Math.pow(steep, maxI - wi);
    }
    var roll = Math.random() * totalW;
    var targetIdx = maxI;
    for (var wi = minI; wi <= maxI; wi++) {
        roll -= Math.pow(steep, maxI - wi);
        if (roll < 0) {
            targetIdx = wi;
            break;
        }
    }
    var targetRarity = EQUIPMENT_RARITY_TIER_ORDER[targetIdx];
    if (!targetRarity) return;
    var inv = player && player.inventory && Array.isArray(player.inventory.equipment) ? player.inventory.equipment : null;
    if (!inv) return;
    for (var t = 0; t < 28; t++) {
        var before = inv.length;
        var item = createEquipment();
        var added = inv.length > before;
        if (item && item.rarity === targetRarity) {
            var rZh = typeof equipmentRarityLabel === "function" ? equipmentRarityLabel(item.rarity) : item.rarity;
            var n = typeof weaponOrArmorDisplayName === "function" ? weaponOrArmorDisplayName(item) : "";
            addCombatLog(`矿髓凝形，似古禁吐宝，你拾得<span class="${item.rarity}">${rZh} ${n}</span>。`);
            addDungeonLog(
                `地脉余波未平，忽有遗器残响自岩层析出——入手 <span class="${item.rarity}">${rZh} ${n}</span>。`
            );
            return;
        }
        if (added) inv.pop();
    }
}

function applyMiningCombatDifficultyBoost() {
    if (typeof enemy === "undefined" || !enemy || !enemy.stats) return;
    var def = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
    var m = typeof def.enemyMul === "number" ? def.enemyMul : 1;
    // 挖矿首档（青砂浅脉）整体降强 25%
    if (mining && typeof mining.tier === "number" && mining.tier <= 0) {
        m *= 0.75;
    }
    // 同一趟采矿内：每一战随段数推进微增难度，最后一战额外抬一丝。
    var segIdx = mining && mining.progress && typeof mining.progress.segment === "number" ? mining.progress.segment : 0;
    var segLimit =
        mining && mining.progress && typeof mining.progress.segmentLimit === "number" ? mining.progress.segmentLimit : 1;
    var isLast = segLimit > 0 && segIdx >= segLimit - 1;
    var segFactor = 1 + segIdx * 0.05;
    if (isLast) segFactor *= 1.1;
    // 保护上限，避免段数拉长后数值暴涨。
    segFactor = Math.min(segFactor, 1.75);
    m *= segFactor;
    enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * m));
    enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * m));
    enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * m));
    enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * Math.min(1.12, 0.92 + m * 0.12));
    enemy.stats.hp = enemy.stats.hpMax;
    if (typeof enemyLoadStats === "function" && document.querySelector("#enemy-hp-battle")) enemyLoadStats();
}

/** 战败/重置进度时：清空押镖与宝藏伏击等挂起状态，避免读档或回主界面后卡死 */
function resetEscortStateHard() {
    var def = buildEscortDefaultState();
    escort.active = def.active;
    escort.status = Object.assign({}, def.status);
    escort.progress = def.progress;
    escort.cartHp = def.cartHp;
    escort.action = def.action;
    escort.riskKey = def.riskKey;
    escort.rewardMul = def.rewardMul;
    escort.pendingBattle = def.pendingBattle;
    escort.bossTriggered = def.bossTriggered;
    escort.minQualityBonus = def.minQualityBonus;
    escort.orderBonus = def.orderBonus;
    escort.refreshCost = ESCORT_ORDER_REFRESH_BASE_COST;
    escort.unlockAtRoom = def.unlockAtRoom;
    escort.awaitingCombatOutcome = def.awaitingCombatOutcome;
    if (dungeon) dungeon.escortState = escort;
    if (typeof syncRunBarModeText === "function") syncRunBarModeText();
}

function getCurrentCalamityRoom() {
    if (!dungeon || !dungeon.progress) return 1;
    if (typeof dungeon.progress.room !== "number" || isNaN(dungeon.progress.room)) return 1;
    return Math.max(1, Math.floor(dungeon.progress.room));
}

function tryAutoOpenEscortChooserOnRoomProgress() {
    if (escort.active) return false;
    if (typeof mining !== "undefined" && mining && mining.status && mining.status.choosing) return false;
    if (!escort.unlockAtRoom || escort.unlockAtRoom <= 0) return false;
    var curRoom = getCurrentCalamityRoom();
    if (curRoom < escort.unlockAtRoom) return false;
    if (curRoom >= ESCORT_ROOM_OPEN_BLOCK_AT) {
        escort.unlockAtRoom = 0;
        addDungeonLog(`<span class="Common">此劫之后天机封锁。</span> 劫数 ${ESCORT_ROOM_OPEN_BLOCK_AT} 起不可开启押镖。`);
        syncRunBarModeText();
        if (typeof saveData === "function") saveData();
        return true;
    }
    // 到达目标劫数时，自动弹出押镖选择；若异常则不中断秘境推进。
    escort.unlockAtRoom = 0;
    if (!escort.status) escort.status = { exploring: false, paused: true, event: true, choosing: true };
    try {
        openEscortRiskChooser();
        dungeon.status.exploring = false;
        dungeon.status.paused = true;
        dungeon.status.event = false;
        dungeonActivity.innerHTML = "深入秘境";
        syncRunBarModeText();
        if (typeof saveData === "function") saveData();
        return true;
    } catch (e) {
        dungeon.status.event = false;
        addDungeonLog("押镖令感应一瞬紊乱，你稳住心神继续深入秘境。");
        if (typeof saveData === "function") saveData();
        return false;
    }
}

function resetDungeonCombatSideFlags() {
    dungeonTreasureAmbushPending = null;
    clearBondSoulCombatPending();
    clearOptionalEmotionCombatPending();
    resetEscortStateHard();
    resetMiningStateHard();
}

function clearOptionalEmotionCombatPending() {
    dungeonQingmingCombatPending = null;
    dungeonBeastBondCombatPending = null;
    dungeonEchoMirrorCombatPending = null;
    dungeonWhisperPactCombatPending = null;
    dungeonHeartDemonCombatPending = null;
}

/** 主界面秘境/押镖 1 秒 tick（战败后须重启，否则事件永不触发） */
function restartDungeonHubTimers() {
    if (dungeonTimer) {
        clearInterval(dungeonTimer);
        dungeonTimer = null;
    }
    if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
    }
    dungeonTimer = setInterval(dungeonEvent, 1000);
    playTimer = setInterval(dungeonCounter, 1000);
}

function clampEscortQualityTier(q) {
    if (typeof q !== "number" || isNaN(q)) q = ESCORT_MIN_QUALITY_TIER;
    return Math.max(ESCORT_MIN_QUALITY_TIER, Math.min(9, Math.floor(q)));
}

/** 押镖战：在 setEnemyStats 之后叠加强度（品质已拉高，此处再按镖路抬面板） */
function applyEscortCombatDifficultyBoost(isBoss) {
    if (typeof enemy === "undefined" || !enemy || !enemy.stats) return;
    var p = ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal;
    var mulHpAtkDef = isBoss
        ? (typeof p.bossHpAtkDef === "number" ? p.bossHpAtkDef : 1.12)
        : (typeof p.banditHpAtkDef === "number" ? p.banditHpAtkDef : 1.2);
    var mulSpd = isBoss
        ? (typeof p.bossSpd === "number" ? p.bossSpd : 1.05)
        : (typeof p.banditSpd === "number" ? p.banditSpd : 1.08);
    var rb = typeof p.rewardDropBonus === "number" ? p.rewardDropBonus : 1.12;
    enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * mulHpAtkDef));
    enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * mulHpAtkDef));
    enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * mulHpAtkDef));
    enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * mulSpd);
    enemy.stats.hp = enemy.stats.hpMax;
    if (enemy.rewards) {
        if (typeof enemy.rewards.exp === "number") {
            enemy.rewards.exp =
                enemy.rewards.exp <= 0 ? 0 : Math.max(1, Math.round(enemy.rewards.exp * rb));
        }
        if (typeof enemy.rewards.gold === "number") enemy.rewards.gold = Math.max(1, Math.round(enemy.rewards.gold * rb));
    }
    // 押镖事件里此函数可能先于战斗面板渲染执行；仅在血条节点已存在时刷新 UI
    if (typeof enemyLoadStats === "function" && document.querySelector("#enemy-hp-battle")) enemyLoadStats();
}

function escortTodayKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
}

/** 公历清明前后（约 4 月 2 日—8 日），用于洞天劫限时连环奇遇 */
function isQingmingSeason() {
    var d = new Date();
    return d.getMonth() === 3 && d.getDate() >= 2 && d.getDate() <= 8;
}

function ensureEscortDailyState() {
    if (!player) return { tickets: ESCORT_TICKET_MAX, lastTs: Date.now() };
    if (!player.escortDaily || typeof player.escortDaily !== "object") {
        player.escortDaily = { tickets: ESCORT_TICKET_MAX, lastTs: Date.now() };
    }
    if (typeof player.escortDaily.tickets !== "number" || isNaN(player.escortDaily.tickets)) {
        player.escortDaily.tickets = ESCORT_TICKET_MAX;
    }
    if (typeof player.escortDaily.lastTs !== "number" || isNaN(player.escortDaily.lastTs) || player.escortDaily.lastTs <= 0) {
        player.escortDaily.lastTs = Date.now();
    }
    player.escortDaily.tickets = Math.max(0, Math.min(ESCORT_TICKET_MAX, Math.floor(player.escortDaily.tickets)));

    // 30 分钟回复 1 次，满次数时对齐当前时间
    var now = Date.now();
    if (player.escortDaily.tickets >= ESCORT_TICKET_MAX) {
        player.escortDaily.lastTs = now;
        return player.escortDaily;
    }
    var elapsed = Math.max(0, now - player.escortDaily.lastTs);
    if (elapsed >= ESCORT_TICKET_RECHARGE_MS) {
        var gain = Math.floor(elapsed / ESCORT_TICKET_RECHARGE_MS);
        player.escortDaily.tickets = Math.min(ESCORT_TICKET_MAX, player.escortDaily.tickets + gain);
        if (player.escortDaily.tickets >= ESCORT_TICKET_MAX) {
            player.escortDaily.lastTs = now;
        } else {
            player.escortDaily.lastTs += gain * ESCORT_TICKET_RECHARGE_MS;
        }
    }
    return player.escortDaily;
}

function getEscortDailyRemain() {
    var s = ensureEscortDailyState();
    return Math.max(0, Math.min(ESCORT_TICKET_MAX, s.tickets));
}

function consumeEscortDailyTicket() {
    var s = ensureEscortDailyState();
    if (s.tickets < 1) return false;
    // 仅在“满次数 -> 开始消耗”时启动计时，避免每次接单都重置冷却进度
    var wasFull = s.tickets >= ESCORT_TICKET_MAX;
    s.tickets -= 1;
    if (wasFull) {
        s.lastTs = Date.now();
    }
    return true;
}

function escortNextRecoverText() {
    var s = ensureEscortDailyState();
    if (s.tickets >= ESCORT_TICKET_MAX) return "已满";
    var remainMs = ESCORT_TICKET_RECHARGE_MS - Math.max(0, Date.now() - s.lastTs);
    var sec = Math.max(0, Math.ceil(remainMs / 1000));
    var mm = Math.floor(sec / 60);
    var ss = sec % 60;
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

/** 进游戏时结算离线冷却；返回本次离线恢复的次数 */
function applyEscortOfflineRecharge() {
    if (!player) return 0;
    var before = 0;
    if (player.escortDaily && typeof player.escortDaily.tickets === "number" && !isNaN(player.escortDaily.tickets)) {
        before = Math.max(0, Math.min(ESCORT_TICKET_MAX, Math.floor(player.escortDaily.tickets)));
    } else {
        before = ESCORT_TICKET_MAX;
    }
    var s = ensureEscortDailyState();
    var after = Math.max(0, Math.min(ESCORT_TICKET_MAX, Math.floor(s.tickets)));
    return Math.max(0, after - before);
}

function formatDurationZh(ms) {
    var sec = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(sec / 86400);
    sec -= d * 86400;
    var h = Math.floor(sec / 3600);
    sec -= h * 3600;
    var m = Math.floor(sec / 60);
    sec -= m * 60;
    var parts = [];
    if (d > 0) parts.push(d + "天");
    if (h > 0) parts.push(h + "小时");
    if (m > 0) parts.push(m + "分");
    if (parts.length === 0) parts.push(sec + "秒");
    return parts.join("");
}

function rollEscortOrderBonus() {
    var r = Math.random();
    if (r < 0.6) {
        return { star: 1, rewardMul: 1.08, minQualityBonus: 1, label: "一星镖令" };
    }
    if (r < 0.88) {
        return { star: 2, rewardMul: 1.16, minQualityBonus: 2, label: "二星镖令" };
    }
    return { star: 3, rewardMul: 1.28, minQualityBonus: 3, label: "三星镖令" };
}

function tryRefreshEscortOrder() {
    var cost = Math.max(1, Math.floor(escort.refreshCost || ESCORT_ORDER_REFRESH_BASE_COST));
    if (player.gold < cost) {
        addDungeonLog(`灵石不足，无法刷新高星镖令（需 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(cost)}）。`);
        openEscortRiskChooser();
        return;
    }
    player.gold -= cost;
    escort.orderBonus = rollEscortOrderBonus();
    escort.refreshCost = cost + ESCORT_ORDER_REFRESH_STEP_COST;
    playerLoadStats();
    addDungeonLog(`你消耗 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(cost)} 刷新镖令，得 <span class="Legendary">${escort.orderBonus.label}</span>：奖励倍率 x${escort.orderBonus.rewardMul.toFixed(2)}，怪物最低品质 +${escort.orderBonus.minQualityBonus}。下次刷新价：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(escort.refreshCost)}。`);
    if (typeof saveData === "function") saveData();
    openEscortRiskChooser();
}

/** 历练纪闻：内存与存档中仅保留最近 N 条（界面仍只展示其中最近 50 条） */
const DUNGEON_BACKLOG_MAX = 100;
const DUNGEON_BACKLOG_VISIBLE = 50;

function trimDungeonBacklog() {
    if (!dungeon.backlog || dungeon.backlog.length <= DUNGEON_BACKLOG_MAX) return;
    dungeon.backlog = dungeon.backlog.slice(-DUNGEON_BACKLOG_MAX);
}

/** 秘境遇敌 / 开战时斗法日志首句 */
function pickEngageCombatLogLine() {
    var n = typeof enemy !== "undefined" && enemy && enemy.name ? enemy.name : "敌";
    var lines = [
        `灵雾翻涌，你与${n}正面相对。`,
        `雾涌如涛，${n}已拦在当路，你与它只隔一拳生死。`,
        `气机相冲，${n}未动，你先觉喉间发紧——此战难免。`,
        `钟鼓无形，杀意先鸣；你与${n}目光交错的刹那，斗法已开始。`,
        `灵光乱闪处，${n}低吼踏步，你按诀而立，正面相对。`,
        `你足尖一点，尘未起，${n}已至——狭路相逢，唯有先下手为强。`,
        `雾纹如涟漪荡开，${n}自其中踏出，与你四目相对，再无转圜。`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

/** 历练纪闻：开战时秘境侧描一句 */
function pickDungeonCombatEchoLine() {
    var n = typeof enemy !== "undefined" && enemy && enemy.name ? enemy.name : "敌妖";
    var lines = [
        `秘境回响：${n}已与你接刃。`,
        `雾中生纹，如天地记下一笔：${n}与你，已在此界交锋。`,
        `远处雾墙微颤，像在传讯——${n}的气机已与你锁死。`,
        `你足跟未离原地，心知肚明：${n}不会容你擦肩而过。`,
        `灵机骤乱，鸟兽噤声——${n}的凶意已浸透此劫。`,
        `石隙渗出薄霜，${n}踏霜而来；你知道这一劫要见血才止。`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

function pickDeeperFloorLine() {
    var lines = [
        "你坠入更深的秘境层。",
        "足下一空，再落足时，灵机更沉三分——你已入更深处。",
        "雾色转浓，天光更黯，你知此层比上一层更嗜血。",
        "界膜如水波荡过周身，你穿过一层无形之膜，劫数加身。",
        "石阶尽处，豁然开朗又复幽闭——更深一重的秘境向你敞开。"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

/** 历练纪闻：路遇敌妖、尚未开战时的拦路一句 */
function pickEnemyEncounterDungeonLine() {
    var n = typeof enemy !== "undefined" && enemy && enemy.name ? enemy.name : "敌妖";
    var lines = [
        `灵雾翻涌，${n}拦于前路。`,
        `雾帘一卷，${n}踞地低吼，前路似被钉死。`,
        `灵机骤乱，${n}自雾后踏出，与你气机相冲。`,
        `石隙渗出腥风，${n}已踞当道，不容擦肩。`,
        `远处钟鼓无声，${n}先至——你知道这一劫躲不过正面。`,
        `雾纹如涟漪荡开，${n}立于涟漪中心，目光锁死你周身。`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

// ===== Dungeon Setup =====
// Enables start and pause on button click
dungeonActivity.addEventListener('click', function () {
    dungeonStartPause();
});

function getRunBarExtraActionsContainer() {
    var el = document.getElementById("runBarExtraActions");
    if (el) return el;
    return document.querySelector(".run-bar__actions");
}

function ensureEscortButton() {
    if (escortActivity) return;
    var wrap = getRunBarExtraActionsContainer();
    if (!wrap) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "escortActivity";
    btn.className = "btn btn--sm btn--ghost run-bar__action";
    btn.textContent = "开启押镖";
    btn.addEventListener("click", function () {
        escortStartPause();
    });
    wrap.appendChild(btn);
    escortActivity = btn;
}

function ensureMiningButton() {
    if (miningActivity) return;
    var wrap = getRunBarExtraActionsContainer();
    if (!wrap) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "miningActivity";
    btn.className = "btn btn--sm btn--ghost run-bar__action";
    btn.textContent = "开启地脉";
    btn.title = "与红尘押镖不同：入地肺洞府寻髓，重奇遇、残碑与灵物（采矿令）";
    btn.addEventListener("click", function () {
        miningStartPause();
    });
    wrap.appendChild(btn);
    miningActivity = btn;
}

function syncRunBarModeText() {
    // 自愈：若存档/异常导致 choosing 标记残留，但 DOM 中已没有对应选择面板按钮，
    // 会让按钮长期 disabled= true，用户表现为“无法点击”。
    if (mining && mining.status && mining.status.choosing) {
        var hasMiningChooser = !!document.querySelector("#mtCancel");
        if (!hasMiningChooser && !mining.status.event) {
            mining.status.choosing = false;
            mining.status.exploring = false;
            mining.status.paused = true;
            if (dungeon && dungeon.status) dungeon.status.event = false;
        }
    }
    if (escort && escort.status && escort.status.choosing) {
        var hasEscortChooser = !!document.querySelector("#es5");
        /** 勿在「择路」态仅因 #es5 暂缺就清 choosing：刷新镖令会先无 choices 重绘日志，面板由 preserve 或紧随的 openEscortRiskChooser 恢复，误判会导致按钮永久消失。 */
        if (!hasEscortChooser && !escort.status.event) {
            escort.status.choosing = false;
            escort.status.exploring = false;
            escort.status.paused = true;
            if (dungeon && dungeon.status) dungeon.status.event = false;
        }
    }

    var isEscortChoosing = !!(escort.status && escort.status.choosing);
    var isMiningChoosing = !!(mining.status && mining.status.choosing);
    if (escort.active) {
        floorCount.innerHTML = `镖程 ${escort.progress.segment}/${escort.progress.segmentLimit}`;
        roomCount.innerHTML = `镖车耐久 ${Math.max(0, Math.floor(escort.cartHp))}%`;
    } else if (mining.active) {
        floorCount.innerHTML = `脉战 ${mining.progress.segment}/${mining.progress.segmentLimit}`;
        roomCount.innerHTML = `地脉稳固 ${Math.max(0, Math.floor(mining.cartHp))}%`;
    } else {
        floorCount.innerHTML = `秘境层 ${dungeon.progress.floor}`;
        roomCount.innerHTML = `劫数 ${dungeon.progress.room}`;
    }
    if (escortActivity) {
        if (!escort.active) {
            escortActivity.innerHTML = "开启押镖";
        } else if (escort.status.paused) {
            escortActivity.innerHTML = "继续押镖";
        } else {
            escortActivity.innerHTML = "暂歇镖队";
        }
        if (isEscortChoosing || isMiningChoosing) {
            escortActivity.disabled = true;
            escortActivity.title = isMiningChoosing ? "地脉择脉界面已打开" : "押镖界面已打开，请先完成选择";
        } else if (mining.active) {
            escortActivity.disabled = true;
            escortActivity.title = "地脉洞府进行中";
        } else if (!escort.active && getCurrentCalamityRoom() >= ESCORT_ROOM_OPEN_BLOCK_AT) {
            escortActivity.disabled = true;
            escortActivity.title = `当前已至劫数 ${ESCORT_ROOM_OPEN_BLOCK_AT}，不可再开启押镖`;
        } else {
            escortActivity.disabled = false;
            escortActivity.title = "";
        }
    }
    if (miningActivity) {
        if (!mining.active) {
            miningActivity.innerHTML = "开启地脉";
        } else if (mining.status.paused) {
            miningActivity.innerHTML = "再入地脉";
        } else {
            miningActivity.innerHTML = "敛镐养神";
        }
        if (isEscortChoosing || isMiningChoosing) {
            miningActivity.disabled = true;
            miningActivity.title = isEscortChoosing ? "押镖界面已打开" : "地脉择脉界面已打开";
        } else if (escort.active) {
            miningActivity.disabled = true;
            miningActivity.title = "押镖进行中";
        } else if (!mining.active && getCurrentCalamityRoom() >= MINING_ROOM_OPEN_BLOCK_AT) {
            miningActivity.disabled = true;
            miningActivity.title = `劫数 ${MINING_ROOM_OPEN_BLOCK_AT} 起地脉自封，洞府矿机缘暂绝`;
        } else {
            miningActivity.disabled = false;
            miningActivity.title = "与押镖不同：入地肺寻髓，重洞府奇遇";
        }
    }
    if (dungeonActivity) {
        if (isEscortChoosing || isMiningChoosing) {
            dungeonActivity.disabled = true;
            dungeonActivity.title = isEscortChoosing ? "押镖界面已打开" : "地脉择脉界面已打开";
        } else if (escort.active || mining.active) {
            dungeonActivity.disabled = true;
            dungeonActivity.title = escort.active ? "押镖进行中" : "地脉洞府进行中";
        } else {
            dungeonActivity.disabled = false;
            dungeonActivity.title = "";
        }
    }
    renderDungeonChainTitleHint();
}

function renderDungeonChainTitleHint() {
    if (!dungeonAction || !dungeon || !dungeon.settings) return;
    var t = dungeon.settings.chainTitleBuff;
    var raw = dungeonAction.innerHTML || "";
    var clean = raw.replace(/<div class="dungeon-title-buff">[\s\S]*?<\/div>/g, "");
    if (!t || !t.name) {
        if (clean !== raw) dungeonAction.innerHTML = clean;
        return;
    }
    dungeonAction.innerHTML =
        clean +
        '<div class="dungeon-title-buff"><span class="Apexother">当前称号：</span>' +
        t.name +
        "（本次秘境）</div>";
}

/** 合并 localStorage 读出的秘境数据，补全旧存档缺失字段，避免 statistics.runtime / progress 丢失变 NaN */
function mergeDungeonDefaults(loaded) {
    var base = {
        rating: 500,
        grade: "E",
        progress: { floor: 1, room: 1, floorLimit: 100, roomLimit: 20 },
        settings: {
            enemyBaseLvl: 1,
            enemyLvlGap: 5,
            enemyBaseStats: 1,
            enemyScaling: 1.12,
            deferredEvent: null,
            eventMemory: null,
            chainTitleBuff: null,
            qingmingChainIntroDoneFloor: 0,
            curseTotemDoneFloor: 0,
            warmEaseFloor: 0,
            warmEaseUsed: {},
            expFloorRewardTrackFloor: 0,
            expFloorRewardConsumed: false,
        },
        status: { exploring: false, paused: true, event: false },
        statistics: { kills: 0, runtime: 0 },
        backlog: [],
        action: 0,
        escortState: buildEscortDefaultState(),
        miningState: buildMiningDefaultState(),
    };
    if (!loaded || typeof loaded !== "object") {
        return JSON.parse(JSON.stringify(base));
    }
    var out = {};
    out.rating = typeof loaded.rating === "number" ? loaded.rating : base.rating;
    out.grade = typeof loaded.grade === "string" ? loaded.grade : base.grade;
    out.progress = Object.assign({}, base.progress, loaded.progress || {});
    if (typeof out.progress.floor !== "number" || out.progress.floor < 1) out.progress.floor = 1;
    if (typeof out.progress.room !== "number" || out.progress.room < 1) out.progress.room = 1;
    /** 同劫修为衰减：与 floor/room 锚定，随 dungeonData 持久化，防读档/刷新重置计数 */
    if (typeof out.progress.sameRoomPlayerExpBattles !== "number" || isNaN(out.progress.sameRoomPlayerExpBattles)) {
        out.progress.sameRoomPlayerExpBattles = 0;
    } else {
        out.progress.sameRoomPlayerExpBattles = Math.max(0, Math.floor(out.progress.sameRoomPlayerExpBattles));
    }
    if (typeof out.progress.sameRoomPlayerExpAnchorFloor !== "number" || isNaN(out.progress.sameRoomPlayerExpAnchorFloor)) {
        out.progress.sameRoomPlayerExpAnchorFloor = null;
    } else {
        out.progress.sameRoomPlayerExpAnchorFloor = Math.max(1, Math.floor(out.progress.sameRoomPlayerExpAnchorFloor));
    }
    if (typeof out.progress.sameRoomPlayerExpAnchorRoom !== "number" || isNaN(out.progress.sameRoomPlayerExpAnchorRoom)) {
        out.progress.sameRoomPlayerExpAnchorRoom = null;
    } else {
        out.progress.sameRoomPlayerExpAnchorRoom = Math.max(1, Math.floor(out.progress.sameRoomPlayerExpAnchorRoom));
    }
    if (typeof out.progress.floorLimit !== "number") out.progress.floorLimit = base.progress.floorLimit;
    if (typeof out.progress.roomLimit !== "number") out.progress.roomLimit = 20;
    out.settings = Object.assign({}, base.settings, loaded.settings || {});
    if (!out.settings.deferredEvent || typeof out.settings.deferredEvent !== "object") out.settings.deferredEvent = null;
    if (out.settings.deferredEvent && typeof out.settings.deferredEvent.dueRoom !== "number") out.settings.deferredEvent = null;
    if (!out.settings.eventMemory || typeof out.settings.eventMemory !== "object") out.settings.eventMemory = {};
    if (typeof out.settings.eventMemory.faction !== "number" || isNaN(out.settings.eventMemory.faction)) out.settings.eventMemory.faction = 0;
    if (typeof out.settings.eventMemory.ledger !== "number" || isNaN(out.settings.eventMemory.ledger)) out.settings.eventMemory.ledger = 0;
    if (typeof out.settings.eventMemory.bondSoul !== "number" || isNaN(out.settings.eventMemory.bondSoul)) out.settings.eventMemory.bondSoul = 0;
    out.settings.eventMemory.faction = Math.max(-6, Math.min(6, out.settings.eventMemory.faction));
    out.settings.eventMemory.ledger = Math.max(-6, Math.min(6, out.settings.eventMemory.ledger));
    out.settings.eventMemory.bondSoul = Math.max(-6, Math.min(10, out.settings.eventMemory.bondSoul));
    if (!out.settings.bondSoulSaga || typeof out.settings.bondSoulSaga !== "object") out.settings.bondSoulSaga = null;
    else {
        var bs = out.settings.bondSoulSaga;
        if (typeof bs.active !== "boolean") bs.active = false;
        if (typeof bs.bond !== "number" || isNaN(bs.bond)) bs.bond = 0;
        bs.bond = Math.max(-4, Math.min(14, bs.bond));
        if (typeof bs.branch !== "string") bs.branch = "";
        if (typeof bs.resumeStage !== "number" || isNaN(bs.resumeStage)) bs.resumeStage = 0;
        if (typeof bs.cyclesCompleted !== "number" || isNaN(bs.cyclesCompleted)) bs.cyclesCompleted = 0;
        if (!bs.emotionCombatByStage || typeof bs.emotionCombatByStage !== "object") bs.emotionCombatByStage = {};
    }
    if (!out.settings.chainTitleBuff || typeof out.settings.chainTitleBuff !== "object") out.settings.chainTitleBuff = null;
    if (typeof out.settings.qingmingChainIntroDoneFloor !== "number" || isNaN(out.settings.qingmingChainIntroDoneFloor)) {
        out.settings.qingmingChainIntroDoneFloor = 0;
    }
    out.settings.qingmingChainIntroDoneFloor = Math.max(0, Math.floor(out.settings.qingmingChainIntroDoneFloor));
    if (typeof out.settings.curseTotemDoneFloor !== "number" || isNaN(out.settings.curseTotemDoneFloor)) {
        out.settings.curseTotemDoneFloor = 0;
    }
    out.settings.curseTotemDoneFloor = Math.max(0, Math.floor(out.settings.curseTotemDoneFloor));
    if (out.settings.deferredEvent && out.settings.deferredEvent.kind === "qingmingChain") {
        out.settings.qingmingChainIntroDoneFloor = Math.max(
            out.settings.qingmingChainIntroDoneFloor,
            typeof out.progress.floor === "number" ? out.progress.floor : 1
        );
    }
    if (typeof out.settings.warmEaseFloor !== "number" || isNaN(out.settings.warmEaseFloor)) {
        out.settings.warmEaseFloor = 0;
    }
    out.settings.warmEaseFloor = Math.max(0, Math.floor(out.settings.warmEaseFloor));
    if (!out.settings.warmEaseUsed || typeof out.settings.warmEaseUsed !== "object") {
        out.settings.warmEaseUsed = {};
    }
    var _wuClean = {};
    for (var _wui = 0; _wui < WARM_EASE_EVENT_IDS.length; _wui++) {
        var _wuk = WARM_EASE_EVENT_IDS[_wui];
        if (out.settings.warmEaseUsed[_wuk] === true) _wuClean[_wuk] = true;
    }
    out.settings.warmEaseUsed = _wuClean;
    if (typeof out.settings.expFloorRewardTrackFloor !== "number" || isNaN(out.settings.expFloorRewardTrackFloor)) {
        out.settings.expFloorRewardTrackFloor = 0;
    }
    out.settings.expFloorRewardTrackFloor = Math.max(0, Math.floor(out.settings.expFloorRewardTrackFloor));
    if (typeof out.settings.expFloorRewardConsumed !== "boolean") {
        out.settings.expFloorRewardConsumed = false;
    }
    if (typeof out.settings.enemyScaling !== "number" || isNaN(out.settings.enemyScaling)) {
        out.settings.enemyScaling = base.settings.enemyScaling;
    }
    out.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, Number(out.settings.enemyScaling));
    clampDungeonEnemyScalingToFloorCeiling(out);
    out.statistics = Object.assign({}, base.statistics, loaded.statistics || {});
    if (typeof out.statistics.kills !== "number" || isNaN(out.statistics.kills)) out.statistics.kills = 0;
    if (typeof out.statistics.runtime !== "number" || isNaN(out.statistics.runtime)) out.statistics.runtime = 0;
    out.statistics.runtime = Math.max(0, out.statistics.runtime);
    out.backlog = Array.isArray(loaded.backlog) ? loaded.backlog : [];
    if (typeof loaded.action !== "number" || isNaN(loaded.action)) {
        out.action = 0;
    } else {
        /** action>5 时主池强制只剩 nextroom；异常存档若长期不重置会永久锁死机缘池 */
        out.action = Math.max(0, Math.min(5, Math.floor(loaded.action)));
    }
    /** 旧版合并逻辑漏写 status，会导致 dungeon.status 为 undefined，修仙市场「信息」等处访问 exploring 报错 */
    out.status = Object.assign({}, base.status, loaded.status || {});
    if (typeof out.status.exploring !== "boolean") out.status.exploring = false;
    if (typeof out.status.paused !== "boolean") out.status.paused = true;
    if (typeof out.status.event !== "boolean") out.status.event = false;
    var esBase = buildEscortDefaultState();
    var esIn = loaded.escortState && typeof loaded.escortState === "object" ? loaded.escortState : {};
    out.escortState = Object.assign({}, esBase, esIn);
    out.escortState.status = Object.assign({}, esBase.status, esIn.status || {});
    out.escortState.progress = Object.assign({}, esBase.progress, esIn.progress || {});
    var _escLim =
        typeof out.escortState.progress.segmentLimit === "number" && isFinite(out.escortState.progress.segmentLimit)
            ? Math.max(1, Math.floor(out.escortState.progress.segmentLimit))
            : esBase.progress.segmentLimit;
    out.escortState.progress.segmentLimit = _escLim;
    var _escSeg =
        typeof out.escortState.progress.segment === "number" && isFinite(out.escortState.progress.segment)
            ? Math.floor(out.escortState.progress.segment)
            : 0;
    var _escSegMax = Math.max(0, _escLim - 1);
    out.escortState.progress.segment = Math.max(0, Math.min(_escSegMax, _escSeg));
    out.escortState.active = !!out.escortState.active;
    out.escortState.action = typeof out.escortState.action === "number" ? Math.max(0, Math.floor(out.escortState.action)) : 0;
    out.escortState.riskKey = typeof out.escortState.riskKey === "string" ? out.escortState.riskKey : "normal";
    var _escCartPreset = ESCORT_RISK_PRESET[out.escortState.riskKey] || ESCORT_RISK_PRESET.normal;
    var _escCartCapMerge =
        typeof _escCartPreset.cartHp === "number" && isFinite(_escCartPreset.cartHp) && _escCartPreset.cartHp > 0
            ? _escCartPreset.cartHp
            : 128;
    out.escortState.cartHp =
        typeof out.escortState.cartHp === "number" && isFinite(out.escortState.cartHp)
            ? Math.max(0, Math.min(_escCartCapMerge, out.escortState.cartHp))
            : typeof _escCartPreset.cartHp === "number" && isFinite(_escCartPreset.cartHp)
              ? _escCartPreset.cartHp
              : esBase.cartHp;
    out.escortState.rewardMul = typeof out.escortState.rewardMul === "number" && isFinite(out.escortState.rewardMul) ? out.escortState.rewardMul : 1;
    /** 押镖进行中时按当前镖路表重算倍率，避免旧存档沿用已调低的数值 */
    if (out.escortState.active) {
        var rpSync = ESCORT_RISK_PRESET[out.escortState.riskKey];
        if (rpSync && typeof rpSync.rewardMul === "number") {
            var obM = out.escortState.orderBonus && typeof out.escortState.orderBonus.rewardMul === "number" ? out.escortState.orderBonus.rewardMul : 1;
            out.escortState.rewardMul = rpSync.rewardMul * obM;
        }
    }
    out.escortState.bossTriggered = !!out.escortState.bossTriggered;
    out.escortState.minQualityBonus = typeof out.escortState.minQualityBonus === "number" ? Math.max(0, Math.floor(out.escortState.minQualityBonus)) : 0;
    out.escortState.refreshCost = typeof out.escortState.refreshCost === "number"
        ? Math.max(ESCORT_ORDER_REFRESH_BASE_COST, Math.floor(out.escortState.refreshCost))
        : ESCORT_ORDER_REFRESH_BASE_COST;
    out.escortState.unlockAtRoom = typeof out.escortState.unlockAtRoom === "number"
        ? Math.max(0, Math.floor(out.escortState.unlockAtRoom))
        : 0;
    if (!out.escortState.pendingBattle || typeof out.escortState.pendingBattle !== "object") out.escortState.pendingBattle = null;
    if (!out.escortState.orderBonus || typeof out.escortState.orderBonus !== "object") out.escortState.orderBonus = null;
    out.escortState.awaitingCombatOutcome = !!out.escortState.awaitingCombatOutcome;
    var msBase = buildMiningDefaultState();
    var msIn = loaded.miningState && typeof loaded.miningState === "object" ? loaded.miningState : {};
    out.miningState = Object.assign({}, msBase, msIn);
    out.miningState.status = Object.assign({}, msBase.status, msIn.status || {});
    out.miningState.progress = Object.assign({}, msBase.progress, msIn.progress || {});
    out.miningState.active = !!out.miningState.active;
    out.miningState.cartHp = typeof out.miningState.cartHp === "number" ? Math.max(0, Math.min(120, out.miningState.cartHp)) : msBase.cartHp;
    out.miningState.action = typeof out.miningState.action === "number" ? Math.max(0, Math.floor(out.miningState.action)) : 0;
    out.miningState.tier = typeof out.miningState.tier === "number" ? Math.max(0, Math.min(4, Math.floor(out.miningState.tier))) : 0;
    out.miningState.unlockAtRoom = typeof out.miningState.unlockAtRoom === "number" ? Math.max(0, Math.floor(out.miningState.unlockAtRoom)) : 0;
    if (!out.miningState.pendingBattle || typeof out.miningState.pendingBattle !== "object") out.miningState.pendingBattle = null;
    out.miningState.awaitingCombatOutcome = !!out.miningState.awaitingCombatOutcome;
    if (typeof loaded.enemyMultipliers === "object" && loaded.enemyMultipliers !== null) {
        out.enemyMultipliers = loaded.enemyMultipliers;
    }
    return out;
}

/**
 * 页面任意一次 saveData() 之前必须先执行：把 dungeon 从 localStorage 拉回内存。
 * 否则内存里仍是脚本顶部的默认对象（劫数 1、历时 0），迁移/改名等处的 saveData 会覆盖真实 dungeonData。
 */
function loadDungeonStateFromStorage() {
    if (window.DONGTIAN_CLOUD_MODE && window.__dongtianCloudHydrated && !window.__dongtianCloudLocalFallback) return;
    var raw = localStorage.getItem("dungeonData");
    if (raw === null) return;
    try {
        dungeon = mergeDungeonDefaults(JSON.parse(raw));
    } catch (e) {
        dungeon = mergeDungeonDefaults(null);
    }
}

// Sets up the initial dungeon
const initialDungeonLoad = () => {
    if (window.DONGTIAN_CLOUD_MODE && window.__dongtianCloudHydrated && !window.__dongtianCloudLocalFallback) {
        if (!dungeon || typeof dungeon !== "object") {
            dungeon = mergeDungeonDefaults(null);
        } else {
            dungeon = mergeDungeonDefaults(dungeon);
        }
    } else {
    var raw = localStorage.getItem("dungeonData");
    if (raw !== null) {
        try {
            dungeon = mergeDungeonDefaults(JSON.parse(raw));
        } catch (e) {
            dungeon = mergeDungeonDefaults(null);
        }
    } else {
        dungeon = mergeDungeonDefaults(null);
        if (typeof saveData === "function") saveData();
    }
    }
    if (dungeon.progress && (dungeon.progress.roomLimit === 5 || dungeon.progress.roomLimit === 10)) {
        dungeon.progress.roomLimit = 20;
    }
    if (!Array.isArray(dungeon.backlog)) dungeon.backlog = [];
    trimDungeonBacklog();
    var beforeOfflineTs = Date.now();
    if (player && player.escortDaily && typeof player.escortDaily.lastTs === "number" && !isNaN(player.escortDaily.lastTs) && player.escortDaily.lastTs > 0) {
        beforeOfflineTs = player.escortDaily.lastTs;
    }
    var offlineRecover = applyEscortOfflineRecharge();
    var miningRecover = applyMiningOfflineRecharge();
    var offlineElapsedMs = Math.max(0, Date.now() - beforeOfflineTs);
    var es = dungeon.escortState && typeof dungeon.escortState === "object" ? dungeon.escortState : buildEscortDefaultState();
    var escortWasActiveOnLoad = !!(es && es.active);
    // 刷新页面后若上次停在“等待按钮交互事件”，按钮上下文已丢失，回退为可继续行进态，避免卡死
    if (es.active && !player.inCombat && es.status && es.status.event) {
        es.status.event = false;
        es.status.exploring = true;
        es.status.paused = false;
        es.pendingBattle = null;
        es.awaitingCombatOutcome = false;
    }
    // 未在斗法却残留 pending（异常存档/旧版）：清掉以免与下一段奇遇叠状态
    if (es.active && !player.inCombat && es.pendingBattle && es.status && !es.status.event) {
        es.pendingBattle = null;
    }
    escort = es;
    dungeon.escortState = escort; // 让后续对 escort 的修改自动随 dungeonData 持久化
    var ms = dungeon.miningState && typeof dungeon.miningState === "object" ? dungeon.miningState : buildMiningDefaultState();
    if (ms.active && es.active) {
        resetMiningStateHard();
        ms = dungeon.miningState;
    }
    mining = ms;
    dungeon.miningState = mining;
    if (mining.active && !player.inCombat && mining.status && mining.status.event) {
        mining.status.event = false;
        mining.status.exploring = true;
        mining.status.paused = false;
        mining.pendingBattle = null;
        mining.awaitingCombatOutcome = false;
    }
    var miningWasActiveOnLoad = !!(mining && mining.active);
    /** 联网洞天：上次停在「待抉择机缘」时 action 已在掷骰处 +1，若直接重置 event 会导致下次重掷或跳格；先回拨一格再落锚。
     * 若已在斗法中（例如点了屠龙后关页），切勿回拨——否则战后再次深入会与同一 action 种子重复掷出同一极危/高危事件并叠日志。 */
    if (
        !escort.active &&
        !(mining && mining.active) &&
        dungeon.status &&
        dungeon.status.event &&
        !(player && player.inCombat)
    ) {
        var acRev = typeof dungeon.action === "number" && !isNaN(dungeon.action) ? dungeon.action : 0;
        dungeon.action = Math.max(0, acRev - 1);
    }
    dungeon.status = {
        exploring: false,
        paused: true,
        event: false,
    };
    updateDungeonLog();
    loadDungeonProgress();
    ensureEscortButton();
    ensureMiningButton();
    syncRunBarModeText();
    if (escort.active) {
        var rp = ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal;
        dungeonAction.innerHTML = `押镖进行中（${rp.name}）`;
        if (escortWasActiveOnLoad) {
            addDungeonLog(`<span class="Uncommon">镖队重整完毕：已恢复押镖进度（${rp.name}），当前镖程 ${escort.progress.segment}/${escort.progress.segmentLimit}，耐久 ${Math.max(0, Math.floor(escort.cartHp))}% 。</span>`);
        }
    } else if (mining.active) {
        var md = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
        dungeonAction.innerHTML = `地脉采掘（${md.name}）`;
        if (miningWasActiveOnLoad) {
            addDungeonLog(
                `<span class="Uncommon">灵镐重整：已回地脉奇遇（${md.name}），脉战 ${mining.progress.segment}/${mining.progress.segmentLimit}，地脉稳固 ${Math.max(0, Math.floor(mining.cartHp))}% 。</span>`
            );
        }
    } else {
        dungeonAction.innerHTML = typeof pickXiuxianQuote === "function" && Math.random() < 0.35
            ? "于灵脉锚点调息……"
            : "于安全锚点暂歇……";
        if (offlineRecover > 0) {
            addDungeonLog(`<span class="Uncommon">离线 ${formatDurationZh(offlineElapsedMs)}，押镖令恢复 <b>${offlineRecover}</b> 次。当前可押 ${getEscortDailyRemain()}/${ESCORT_TICKET_MAX}，下次恢复：${escortNextRecoverText()}。</span>`);
        }
        if (miningRecover > 0) {
            addDungeonLog(
                `<span class="Uncommon">离线期间，采矿令纹重凝 <b>${miningRecover}</b> 次。当前可叩地脉 ${getMiningDailyRemain()}/${MINING_TICKET_MAX}，下次：${miningNextRecoverText()}。</span>`
            );
        }
    }
    dungeonActivity.innerHTML = "深入秘境";
    var rt = dungeon.statistics && typeof dungeon.statistics.runtime === "number" ? dungeon.statistics.runtime : 0;
    dungeonTime.innerHTML = new Date(Math.max(0, rt) * 1000).toISOString().slice(11, 19);
   
    restartDungeonHubTimers();
    if ((offlineRecover > 0 || miningRecover > 0) && typeof saveData === "function") saveData();
}

/**
 * 联网拉档或内存中替换 dungeon 后：让全局 escort、mining 与 dungeon.escortState / dungeon.miningState 指向同一对象。
 * 否则「查看」后仍改的是旧引用，saveData 会把未同步的 dungeon 写回服务端，造成押镖/地脉与秘境进度分裂。
 */
function dongtianSyncEscortMiningGlobalsFromDungeon() {
    if (typeof dungeon === "undefined" || !dungeon || typeof dungeon !== "object") return;
    var es = dungeon.escortState && typeof dungeon.escortState === "object" ? dungeon.escortState : buildEscortDefaultState();
    escort = es;
    dungeon.escortState = escort;
    var ms = dungeon.miningState && typeof dungeon.miningState === "object" ? dungeon.miningState : buildMiningDefaultState();
    if (ms.active && escort.active) {
        resetMiningStateHard();
        ms = dungeon.miningState;
    }
    mining = ms;
    dungeon.miningState = mining;
}
if (typeof window !== "undefined") window.dongtianSyncEscortMiningGlobalsFromDungeon = dongtianSyncEscortMiningGlobalsFromDungeon;

// Start and Pause Functionality
function applyDungeonStartPauseToggle() {
    if (!dungeon.status.paused) {
        dungeonAction.innerHTML = Math.random() < 0.45 ? "于灵脉锚点调息……" : "于安全锚点暂歇……";
        dungeonActivity.innerHTML = "深入秘境";
        dungeon.status.exploring = false;
        dungeon.status.paused = true;
    } else {
        dungeonAction.innerHTML = Math.random() < 0.45 ? "以身涉秘境，步步见真……" : "秘境穿行中……";
        dungeonActivity.innerHTML = "凝结时隙";
        dungeon.status.exploring = true;
        dungeon.status.paused = false;
    }
    syncRunBarModeText();
}

const dungeonStartPause = () => {
    if (escort.active || (typeof mining !== "undefined" && mining && mining.active)) {
        return;
    }
    if (dungeon.status.event) {
        var hasChoices = false;
        var logRoot = document.querySelector("#dungeonLog");
        if (logRoot && logRoot.querySelector(".decision-panel button")) {
            hasChoices = true;
        }
        if (!hasChoices && !(player && player.inCombat)) {
            // 自愈：偶发残留 event=true 且无可点击选项时，自动解锁避免卡住。
            dungeon.status.event = false;
        } else {
            pendingDungeonStartPauseToggle = true;
            dungeonAction.innerHTML = "机缘未决，已为你排队：当前异象结束后自动切换。";
            if (dungeonActivity) dungeonActivity.title = "当前有事件待处理，已排队自动切换";
            return;
        }
    }
    pendingDungeonStartPauseToggle = false;
    applyDungeonStartPauseToggle();
}

// Counts the total time for the current run and total playtime
const dungeonCounter = () => {
    player.playtime++;
    dungeon.statistics.runtime++;
    dungeonTime.innerHTML = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
    saveData();
}

// Loads the floor and room count
const loadDungeonProgress = () => {
    if (escort.active || (typeof mining !== "undefined" && mining && mining.active)) {
        syncRunBarModeText();
        return;
    }
    if (dungeon.progress.room > dungeon.progress.roomLimit) {
        dungeon.progress.room = 1;
        dungeon.progress.floor++;
    }
    // 记录玩家历史最高秘境层数，并在当时快照保存等级/门派
    var curFloor = dungeon.progress.floor;
    if (typeof player !== "undefined" && player && typeof curFloor === "number") {
        var changed = false;
        if (typeof player.maxDungeonFloor !== "number" || isNaN(player.maxDungeonFloor) || player.maxDungeonFloor < 1) {
            player.maxDungeonFloor = curFloor;
            player.maxDungeonFloorLvl = typeof player.lvl === "number" && player.lvl >= 1 ? Math.floor(player.lvl) : 1;
            player.maxDungeonFloorSect = player.sect || null;
            changed = true;
        } else if (curFloor > player.maxDungeonFloor) {
            player.maxDungeonFloor = curFloor;
            player.maxDungeonFloorLvl = typeof player.lvl === "number" && player.lvl >= 1 ? Math.floor(player.lvl) : 1;
            player.maxDungeonFloorSect = player.sect || null;
            changed = true;
        }
        if (changed && typeof saveData === "function") saveData();
    }
    floorCount.innerHTML = `秘境层 ${dungeon.progress.floor}`;
    roomCount.innerHTML = `劫数 ${dungeon.progress.room}`;
}

function openEscortRiskChooser() {
    if (!escort.status) escort.status = { exploring: false, paused: true, event: false, choosing: false };
    escort.status.event = true;
    escort.status.choosing = true;
    var remain = getEscortDailyRemain();
    var orderText = escort.orderBonus
        ? `当前加成：<span class="Legendary">${escort.orderBonus.label}</span>（收益 x${escort.orderBonus.rewardMul.toFixed(2)}，最低品质 +${escort.orderBonus.minQualityBonus}）`
        : "当前加成：无高星镖令";
    var refreshCost = Math.max(1, Math.floor(escort.refreshCost || ESCORT_ORDER_REFRESH_BASE_COST));
    var recoverTxt = escortNextRecoverText();
    const choices = `
        <div class="decision-panel">
            <button type="button" id="es1">凡镖（稳）</button>
            <button type="button" id="es2">险镖（均衡）</button>
            <button type="button" id="es3">绝镖（高危）</button>
            <button type="button" id="es4">刷新高星镖令（${nFormatter(refreshCost)}）</button>
            <button type="button" id="es5">退出押镖返回秘境</button>
        </div>`;
    addDungeonLog(`<span class="Rare">押镖令至：请选择镖路。凡镖稳妥，险镖多事，绝镖九死一生。</span><br>可押次数：<b>${remain}/${ESCORT_TICKET_MAX}</b>（每 30 分钟回复 1 次，下次：${recoverTxt}）<br>${orderText}`, choices);
    document.querySelector("#es1").onclick = function () { startEscortRun("safe"); };
    document.querySelector("#es2").onclick = function () { startEscortRun("normal"); };
    document.querySelector("#es3").onclick = function () { startEscortRun("deadly"); };
    document.querySelector("#es4").onclick = function () { tryRefreshEscortOrder(); };
    document.querySelector("#es5").onclick = function () { exitEscortChooserToDungeon(); };
}

function exitEscortChooserToDungeon() {
    escort.status.event = false;
    escort.status.choosing = false;
    escort.status.exploring = false;
    escort.status.paused = true;
    dungeon.status.exploring = false;
    dungeon.status.paused = true;
    dungeon.status.event = false;
    dungeonActivity.innerHTML = "深入秘境";
    dungeonAction.innerHTML = "于安全锚点暂歇……";
    addDungeonLog("你收起押镖令，暂返秘境锚点。");
    syncRunBarModeText();
    if (typeof saveData === "function") saveData();
}

function startEscortRun(riskKey) {
    if (typeof mining !== "undefined" && mining && mining.active) {
        addDungeonLog("地脉机缘未竟，红尘镖令不便同启——且先封灵出脉。");
        return;
    }
    var curRoom = getCurrentCalamityRoom();
    if (curRoom >= ESCORT_ROOM_OPEN_BLOCK_AT) {
        addDungeonLog(`<span class="Common">此劫之后天机封锁。</span> 劫数 ${ESCORT_ROOM_OPEN_BLOCK_AT} 起不可开启押镖。`);
        escort.status.event = false;
        if (escort.status) escort.status.choosing = false;
        if (typeof saveData === "function") saveData();
        syncRunBarModeText();
        return;
    }
    if (!consumeEscortDailyTicket()) {
        addDungeonLog(`<span class="Common">押镖令已耗尽。</span> 请等待冷却恢复后再接令。`);
        escort.status.event = false;
        if (escort.status) escort.status.choosing = false;
        return;
    }
    const p = ESCORT_RISK_PRESET[riskKey] || ESCORT_RISK_PRESET.normal;
    const ob = escort.orderBonus;
    abortDongtianCloudMeetInFlight();
    if (typeof dungeon !== "undefined" && dungeon && dungeon.status) dungeon.status.event = false;
    escort.active = true;
    escort.riskKey = riskKey;
    escort.rewardMul = p.rewardMul * (ob ? ob.rewardMul : 1);
    escort.progress.segment = 0;
    escort.progress.segmentLimit = p.segmentLimit;
    escort.cartHp = p.cartHp;
    escort.action = 0;
    escort.pendingBattle = null;
    escort.awaitingCombatOutcome = false;
    escort.bossTriggered = false;
    escort.minQualityBonus = ob ? ob.minQualityBonus : 0;
    escort.unlockAtRoom = 0;
    escort.status.exploring = true;
    escort.status.paused = false;
    escort.status.event = false;
    escort.status.choosing = false;
    dungeon.status.exploring = false;
    dungeon.status.paused = true;
    dungeonActivity.innerHTML = "深入秘境";
    dungeonAction.innerHTML = `押镖进行中（${p.name}）`;
    addDungeonLog(`你接下<span class="Legendary">${p.name}</span>：共 ${p.segmentLimit} 段路程，镖车耐久 ${p.cartHp}% 。${ob ? `并启用${ob.label}。` : ""}`);
    // 选定押镖后，刷新镖令价格重置到基准价
    escort.refreshCost = ESCORT_ORDER_REFRESH_BASE_COST;
    escort.orderBonus = null;
    syncRunBarModeText();
    if (typeof saveData === "function") saveData();
}

function endEscortRun(success) {
    // 斗法胜利后、点「收纳战利」前 dungeon.status.event 仍为 true；此时 addDungeonLog 无 choices 会走 updateDungeonLog 的「保留决策面板」，把已完结的首领抉择又贴到「押镖圆满」下面。
    if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
        dungeon.status.event = false;
    }
    const risk = ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal;
    /** 与 endMiningRun 同理：先结束押镖运行态再写圆满/失败文案，避免保留决策面板把驿站/劫修等按钮贴回 */
    escort.active = false;
    escort.status = { exploring: false, paused: true, event: false, choosing: false };
    escort.pendingBattle = null;
    escort.bossTriggered = false;
    escort.minQualityBonus = 0;
    escort.awaitingCombatOutcome = false;
    if (success) {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const gMul = typeof risk.completionGoldMul === "number" ? risk.completionGoldMul : 1;
        const stoneChance = typeof risk.completionStoneChance === "number" ? risk.completionStoneChance : 0.2;
        const base = Math.max(1, Math.floor((38 + randomizeNum(0, 35)) * floor * escort.rewardMul * gMul));
        const gold = applyGoldGainMult(base * 3);
        player.gold += gold;
        if (Math.random() < stoneChance) {
            if (typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
                addMaterial(MATERIAL_ENHANCE_STONE, 1);
                if (typeof MATERIAL_ENCHANT_STONE !== "undefined") {
                    addMaterial(MATERIAL_ENCHANT_STONE, 1);
                }
                addDungeonLog(`押镖圆满，酬金 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}，并得<span class="Epic">强化石</span> ×1、<span class="Legendary">附魔石</span> ×1。`);
            } else {
                addDungeonLog(`押镖圆满，酬金 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
            }
        } else {
            addDungeonLog(`押镖圆满，酬金 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        }
        playerLoadStats();
    } else {
        addDungeonLog(`<span class="Common">押镖失败。</span> 你护住性命退回锚点，${risk.name}就此作罢。`);
    }
    dungeonAction.innerHTML = "于安全锚点暂歇……";
    syncRunBarModeText();
    if (typeof saveData === "function") saveData();
}

function escortAdvanceSegment() {
    escort.progress.segment++;
    if (escort.progress.segment >= escort.progress.segmentLimit) {
        endEscortRun(true);
        return;
    }
    if (!escort.bossTriggered && escort.progress.segment === Math.max(0, escort.progress.segmentLimit - 1)) {
        addDungeonLog('<span class="Legendary">终程将至，劫镖首领压阵在前。</span> 此段只决首领，不再生旁枝。');
    }
    syncRunBarModeText();
}

function escortStartPause() {
    if (typeof mining !== "undefined" && mining && mining.active) {
        addDungeonLog("地脉洞府正开，不宜兼走红尘镖路——机缘二选一，莫贪。");
        return;
    }
    if (dungeon.status && dungeon.status.event) {
        dungeonAction.innerHTML = "机缘当前未决，暂不可开启押镖。";
        if (escortActivity) escortActivity.title = "当前有事件待处理，暂不可开启押镖";
        return;
    }
    if (dungeon.status.exploring) {
        addDungeonLog("你正在秘境穿行，先凝结时隙，再启押镖。");
        return;
    }
    if (!escort.active) {
        var curRoom = getCurrentCalamityRoom();
        if (curRoom >= ESCORT_ROOM_OPEN_BLOCK_AT) {
            addDungeonLog(`<span class="Common">此劫之后天机封锁。</span> 劫数 ${ESCORT_ROOM_OPEN_BLOCK_AT} 起不可开启押镖。`);
            syncRunBarModeText();
            return;
        }
        if (!escort.unlockAtRoom || escort.unlockAtRoom <= 0) {
            escort.unlockAtRoom = curRoom + ESCORT_OPEN_DELAY_ROOMS;
            addDungeonLog(`<span class="Uncommon">你递出押镖令，天机尚在凝定。</span><br>当前劫数 <b>${curRoom}</b>，待劫数至 <b>${escort.unlockAtRoom}</b> 时，将自动弹出凡镖 / 险镖 / 绝镖选择。`);
            if (typeof saveData === "function") saveData();
            syncRunBarModeText();
            return;
        }
        if (curRoom < escort.unlockAtRoom) {
            addDungeonLog(`押镖令尚在核验：当前劫数 <b>${curRoom}</b>，需至 <b>${escort.unlockAtRoom}</b> 才可开启押镖。`);
            syncRunBarModeText();
            return;
        }
        escort.unlockAtRoom = 0;
        openEscortRiskChooser();
        syncRunBarModeText();
        if (typeof saveData === "function") saveData();
        return;
    }
    if (escort.status.event) return;
    if (!escort.status.paused) {
        escort.status.exploring = false;
        escort.status.paused = true;
        dungeonAction.innerHTML = "镖队暂歇，校缰换辙……";
    } else {
        escort.status.exploring = true;
        escort.status.paused = false;
        dungeonAction.innerHTML = "押镖行进中……";
    }
    syncRunBarModeText();
}

function escortBattleEncounter() {
    escort.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="eb1">迎战劫匪</button>
            <button type="button" id="eb2">抛货减灾</button>
        </div>`;
    addDungeonLog(`<span class="Heirloom">前路旌旗骤断，劫修现身围车。镖铃作响，杀机并起。</span>`, choices);
    document.querySelector("#eb1").onclick = function () {
        generateRandomEnemy();
        const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
        enemy.lvl = Math.max(1, maxLvl);
        var minQ = (ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal).minQuality + (escort.minQualityBonus || 0);
        minQ = clampEscortQualityTier(minQ);
        enemy.qualityTier = clampEscortQualityTier(typeof enemy.qualityTier === "number" ? Math.max(minQ, enemy.qualityTier) : minQ);
        if (typeof setEnemyStats === "function") setEnemyStats(enemy.type);
        applyEscortCombatDifficultyBoost(false);
        escort.pendingBattle = { kind: "escortBandit" };
        escort.awaitingCombatOutcome = true;
        enterCombatWithPreHint(function () {
            addCombatLog(`你护车出刃，${enemy.name}携众来劫！`);
            updateDungeonLog();
        });
    };
    document.querySelector("#eb2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor);
        const pay = applyGoldGainMult(randomizeNum(18, 65) * floor);
        if (player.gold >= pay) {
            player.gold -= pay;
            const cartDmg = randomizeNum(6, 14);
            escort.cartHp = Math.max(0, escort.cartHp - cartDmg);
            addDungeonLog(`你抛下货箱引开劫修，损失灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(pay)}，镖车耐久 -${cartDmg}%。`);
            playerLoadStats();
            escort.status.event = false;
            if (escort.cartHp <= 0) {
                endEscortRun(false);
                return;
            }
            escortAdvanceSegment();
            updateDungeonLog();
        } else {
            addDungeonLog("灵石不足，劫修冷笑逼近，只能拔刃相迎。");
            document.querySelector("#eb1").click();
        }
    };
}

function escortTrapEncounter() {
    escort.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="et1">强行冲阵</button>
            <button type="button" id="et2">绕路慢行</button>
        </div>`;
    addDungeonLog(`<span class="Common">山道塌陷，机关弩雨自雾中攒射。镖车前轮已陷入碎石。</span>`, choices);
    document.querySelector("#et1").onclick = function () {
        const cartDmg = randomizeNum(10, 22);
        const hpDmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.1)));
        escort.cartHp = Math.max(0, escort.cartHp - cartDmg);
        player.stats.hp = Math.max(1, player.stats.hp - hpDmg);
        addDungeonLog(`你强行破阵，镖车耐久 -${cartDmg}% ，自身气血 <b>-${nFormatter(hpDmg)}</b>。`);
        playerLoadStats();
        escort.status.event = false;
        if (escort.cartHp <= 0) {
            endEscortRun(false);
            return;
        }
        escortAdvanceSegment();
        updateDungeonLog();
    };
    document.querySelector("#et2").onclick = function () {
        const cartDmg = randomizeNum(4, 10);
        escort.cartHp = Math.max(0, escort.cartHp - cartDmg);
        addDungeonLog(`你牵车绕石缓行，虽避主阵，镖车仍磨损 -${cartDmg}% 。`);
        escort.status.event = false;
        if (escort.cartHp <= 0) {
            endEscortRun(false);
            return;
        }
        escortAdvanceSegment();
        updateDungeonLog();
    };
}

function escortSupplyEncounter() {
    escort.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="esup1">就地整备</button>
            <button type="button" id="esup2">不停，继续赶路</button>
        </div>`;
    addDungeonLog(`<span class="Uncommon">前方旧驿站尚存火种与木料。可停可走，皆有代价。</span>`, choices);
    document.querySelector("#esup1").onclick = function () {
        const fix = randomizeNum(10, 22);
        const heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.12)));
        var cartCap = (ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal).cartHp;
        if (typeof cartCap !== "number" || !isFinite(cartCap) || cartCap < 1) cartCap = 100;
        escort.cartHp = Math.min(cartCap, escort.cartHp + fix);
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        addDungeonLog(`你整备镖车并调息：镖车耐久 +${fix}% ，气血 +${nFormatter(heal)}。`);
        playerLoadStats();
        escort.status.event = false;
        escortAdvanceSegment();
        updateDungeonLog();
    };
    document.querySelector("#esup2").onclick = function () {
        addDungeonLog("你拒绝停留，催镖前行。路虽险，时不我待。");
        escort.status.event = false;
        escortAdvanceSegment();
        updateDungeonLog();
    };
}

function escortBossEncounter() {
    escort.status.event = true;
    escort.bossTriggered = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="ebs1">迎战首领</button>
            <button type="button" id="ebs2">弃镖保命</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">劫镖首领亲临，旌旗黑沉如夜。若不斩首，镖路难通。</span>`, choices);
    document.querySelector("#ebs1").onclick = function () {
        generateRandomEnemy("guardian");
        const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
        enemy.lvl = Math.max(1, maxLvl);
        var minQ = Math.max(ESCORT_MIN_QUALITY_TIER + 2, (ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal).minQuality + 2 + (escort.minQualityBonus || 0));
        minQ = clampEscortQualityTier(minQ);
        enemy.qualityTier = clampEscortQualityTier(typeof enemy.qualityTier === "number" ? Math.max(minQ, enemy.qualityTier) : minQ);
        if (typeof setEnemyStats === "function") setEnemyStats(enemy.type, "guardian");
        applyEscortCombatDifficultyBoost(true);
        escort.pendingBattle = { kind: "escortBoss" };
        escort.awaitingCombatOutcome = true;
        enterCombatWithPreHint(function () {
            addCombatLog(`劫镖首领${enemy.name}截道而立，你唯有一战护镖！`);
            updateDungeonLog();
        });
    };
    document.querySelector("#ebs2").onclick = function () {
        addDungeonLog(`<span class="Common">你弃镖撤离。</span> 首领放你一命，押镖就此失败。`);
        escort.status.event = false;
        endEscortRun(false);
        updateDungeonLog();
    };
}

function escortTickEvent() {
    if (!escort.active || !escort.status.exploring || escort.status.event) return;
    escort.action++;
    // 首领固定压轴：仅在最后一段触发，避免提前出现打乱节奏
    if (!escort.bossTriggered && escort.progress.segment === Math.max(0, escort.progress.segmentLimit - 1)) {
        escortBossEncounter();
        maybeBondSoulSideWhisper("escort");
        return;
    }
    const roll = Math.random();
    if (roll < 0.5) {
        escortBattleEncounter();
    } else if (roll < 0.78) {
        escortTrapEncounter();
    } else {
        escortSupplyEncounter();
    }
    maybeBondSoulSideWhisper("escort");
}

function claimEscortBattleVictory() {
    if (!escort.active || !escort.pendingBattle) {
        if (escort && escort.active) escort.awaitingCombatOutcome = false;
        return false;
    }
    escort.awaitingCombatOutcome = false;
    const riskCfg = ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal;
    const tipMul = typeof riskCfg.battleTipMul === "number" ? riskCfg.battleTipMul : 1;
    const bossStoneP = typeof riskCfg.bossStoneChance === "number" ? riskCfg.bossStoneChance : 0.35;
    const floor = Math.max(1, dungeon.progress.floor || 1);
    const isBoss = escort.pendingBattle.kind === "escortBoss";
    const cartDmg = isBoss ? randomizeNum(8, 18) : randomizeNum(5, 12);
    escort.cartHp = Math.max(0, escort.cartHp - cartDmg);
    escort.pendingBattle = null;
    escort.status.event = false;
    addCombatLog(isBoss ? `你斩落首领，但镖车损毁更重：耐久 -${cartDmg}%。` : `你击退劫修，然镖车仍受创：耐久 -${cartDmg}%。`);
    if (escort.cartHp <= 0) {
        endEscortRun(false);
        return true;
    }
    const tip = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(isBoss ? 28 : 10, isBoss ? 68 : 32) * floor * escort.rewardMul * tipMul)));
    player.gold += tip;
    if (isBoss && Math.random() < bossStoneP && typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
        addMaterial(MATERIAL_ENHANCE_STONE, 1);
        if (typeof MATERIAL_ENCHANT_STONE !== "undefined") {
            addMaterial(MATERIAL_ENCHANT_STONE, 1);
        }
        addCombatLog(`首领伏诛，镖主重赏：<i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(tip)}</b>，并赐<span class="Epic">强化石</span> ×1、<span class="Legendary">附魔石</span> ×1。`);
    } else {
        addCombatLog(`镖主额外酬谢：<i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(tip)}</b>。`);
    }
    playerLoadStats();
    escortAdvanceSegment();
    syncRunBarModeText();
    return true;
}

function miningAdvanceSegment() {
    mining.progress.segment++;
    var def = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
    if (mining.progress.segment >= mining.progress.segmentLimit) {
        endMiningRun(true);
        return;
    }
    addDungeonLog(pickMiningRand(MINING_PULSE_BEATS));
    syncRunBarModeText();
}

function endMiningRun(success) {
    if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
        dungeon.status.event = false;
    }
    var def = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
    /** 必须先结束地脉运行态再 addDungeonLog，否则 mining.active/event 仍为真时 updateDungeonLog 会「保留决策面板」把矿兽抉择 DOM 贴回，战败回秘境后仍显示御兽/敛镐 */
    mining.active = false;
    mining.status = { exploring: false, paused: true, event: false, choosing: false };
    mining.pendingBattle = null;
    mining.awaitingCombatOutcome = false;
    mining.action = 0;
    if (success) {
        var pkMin = Math.max(1, Math.floor(def.packMin));
        var pkMax = Math.max(pkMin, Math.floor(def.packMax));
        var packs = Math.max(1, Math.floor(randomizeNum(pkMin, pkMax)));
        var gemKey = typeof MATERIAL_GEM_PACK !== "undefined" ? MATERIAL_GEM_PACK : "gem_material_pack";
        var packLabel = typeof MATERIAL_GEM_PACK_ZH !== "undefined" ? MATERIAL_GEM_PACK_ZH : "宝石材料包";
        if (typeof addMaterial === "function") {
            if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
            if (typeof ensureGemMaterialsInInventory === "function" && typeof MATERIAL_GEM_PACK !== "undefined") {
                ensureGemMaterialsInInventory();
            }
            addMaterial(gemKey, packs);
            addDungeonLog(
                `<span class="Legendary">地脉封灵，奇遇圆满！</span> 你将矿髓所凝机缘封入行囊：<span class="Epic">${packLabel} ×${packs}</span>（${def.name}）。`
            );
            if (typeof addCombatLog === "function") {
                addCombatLog(
                    `<span class="Legendary">地脉封灵圆满！</span> 入手 <span class="Epic">${packLabel} ×${packs}</span>（${def.name}）。`
                );
            }
            if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
        } else {
            addDungeonLog(
                `<span class="Legendary">地脉封灵，奇遇圆满！</span> <span class="Common">然行囊材料未初始化，${packLabel} ×${packs} 未能入账——请刷新页面后再叩地脉。</span>（${def.name}）`
            );
            if (typeof addCombatLog === "function") {
                addCombatLog(
                    `<span class="Common">通关地脉，但材料栏未就绪：${packLabel} ×${packs} 未能入账，请刷新后再试。</span>`
                );
            }
        }
    } else {
        addDungeonLog(
            `<span class="Common">地脉机缘暂止。</span> 或矿脉反噬难支，或你敛镐先退——${def.name}一梦，留待来日再探。`
        );
    }
    dungeonAction.innerHTML = "于安全锚点暂歇……";
    dungeonActivity.innerHTML = "深入秘境";
    syncRunBarModeText();
    if (typeof saveData === "function") saveData();
    if (window.DONGTIAN_CLOUD_MODE && typeof window.__dongtianCloudFlushSave === "function") {
        if (typeof window.cancelPendingDongtianCloudSave === "function") window.cancelPendingDongtianCloudSave();
        window.__dongtianCloudFlushSave();
    }
}

function claimMiningBattleVictory() {
    if (!mining.active || !mining.pendingBattle) {
        if (mining && mining.active) mining.awaitingCombatOutcome = false;
        return false;
    }
    mining.awaitingCombatOutcome = false;
    var def = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var lim = mining.progress && typeof mining.progress.segmentLimit === "number" ? mining.progress.segmentLimit : 1;
    var seg = mining.progress && typeof mining.progress.segment === "number" ? mining.progress.segment : 0;
    // 当前已是最后一波矿兽：战胜后本应 advance 并通关；若此时地脉稳固扣至 0，仍按通关发奖（否则玩家「打赢了却没包」）
    var isFinalWaveVictory = lim > 0 && seg >= lim - 1;
    var cartDmg = randomizeNum(6, 14);
    mining.cartHp = Math.max(0, mining.cartHp - cartDmg);
    mining.pendingBattle = null;
    mining.status.event = false;
    addCombatLog(
        pickMiningRand(MINING_CART_DMG_LINES).replace("%DMG%", String(cartDmg))
    );
    if (mining.cartHp <= 0) {
        if (!isFinalWaveVictory) {
            endMiningRun(false);
            return true;
        }
        if (typeof addCombatLog === "function") {
            addCombatLog(
                `<span class="Uncommon">地脉近乎溃散，所幸末战已胜——矿髓机缘仍将封入你行囊。</span>`
            );
        }
    }
    var tip = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(12, 38) * floor * (0.85 + mining.tier * 0.06))));
    player.gold += tip;
    addCombatLog(
        pickMiningRand(MINING_GOLD_LINES).replace("%GOLD%", nFormatter(tip))
    );
    tryMiningBonusEquipmentDrop(mining.tier);
    playerLoadStats();
    miningAdvanceSegment();
    syncRunBarModeText();
    return true;
}

function miningBattleEncounter() {
    mining.status.event = true;
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="mb1">御兽镇脉</button>' +
        '<button type="button" id="mb2">敛镐撤出</button>' +
        "</div>";
    var tier = Math.max(0, Math.min(4, Math.floor(mining.tier)));
    var beastLine = pickMiningRand(MINING_BEAST_ENCOUNTER_BY_TIER[tier] || MINING_BEAST_ENCOUNTER_BY_TIER[0]);
    addDungeonLog(beastLine, choices);
    document.querySelector("#mb1").onclick = function () {
        var segIdx = mining && mining.progress && typeof mining.progress.segment === "number" ? mining.progress.segment : 0;
        var segLimit = mining && mining.progress && typeof mining.progress.segmentLimit === "number" ? mining.progress.segmentLimit : 1;
        var isLast = segLimit > 0 && segIdx >= segLimit - 1;

        // 最后一战：为了让 UI 显示“押镖那种头目字样”，使用 guardian 名录生成（不显示“秘境主宰”）。
        // 但后续仍传 setEnemyStats(enemy.type, undefined)，不触发首领倍率。
        // 本项目品质档为 0-9，对应“10品”取 9。
        generateRandomEnemy(isLast ? "guardian" : undefined);

        var maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
        var minLvl = maxLvl - (dungeon.settings.enemyLvlGap - 1);
        // 段数越后，怪物等级越靠近 maxLvl（单调递增，最后一段取 maxLvl）。
        var prog = segLimit > 1 ? (segIdx + 1) / segLimit : 1;
        var lvl = minLvl + Math.floor((maxLvl - minLvl) * prog);
        enemy.lvl = Math.max(1, lvl);

        // 怪物品质：非最后战在自然品质基础上 +segIdx（即相邻战 +1）。
        // 最后一战：固定 10品（qualityTier=9）。
        if (isLast) {
            enemy.qualityTier = 9;
        } else {
            var baseQ = typeof enemy.qualityTier === "number" ? enemy.qualityTier : 0;
            enemy.qualityTier = Math.max(0, Math.min(9, baseQ + segIdx));
        }
        if (typeof setEnemyStats === "function") setEnemyStats(enemy.type, undefined);
        applyMiningCombatDifficultyBoost();
        mining.pendingBattle = { kind: "miningBeast" };
        mining.awaitingCombatOutcome = true;
        enterCombatWithPreHint(function () {
            addCombatLog(
                `矿兽「${enemy.name}」借地脉灵机阻路；唯有斩之，方不负这一场洞府奇遇。`
            );
            updateDungeonLog();
        });
    };
    document.querySelector("#mb2").onclick = function () {
        addDungeonLog("你敛镐后撤，地脉灵机如潮退去；洞府残响渐远，留与后人。");
        mining.status.event = false;
        endMiningRun(false);
        updateDungeonLog();
    };
}

function miningTickEvent() {
    if (!mining.active || !mining.status.exploring || mining.status.event) return;
    mining.action++;
    miningBattleEncounter();
    maybeBondSoulSideWhisper("mining");
}

function openMiningTierChooser() {
    mining.status.event = true;
    mining.status.choosing = true;
    var remain = getMiningDailyRemain();
    var recoverTxt = miningNextRecoverText();
    var msg =
        `<span class="Legendary">识海深处，灵脉图自行展开</span>——非红尘镖路，乃大地残存的一线洞府机缘：浅则青砂试锋，深则龙脉夺造化；矿兽愈凶，髓出愈奇，犒赏亦厚。<br>` +
        `<span class="Common">与押镖不同：此为「入地」之遇，重在地肺灵机与残碑遗禁。</span><br>` +
        `剩余采矿令 <b>${remain}/${MINING_TICKET_MAX}</b>（每时辰回复 1 次，离线亦计；下次：${recoverTxt}）。`;
    var btns = MINING_TIER_DEF.map(function (d, idx) {
        return `<button type="button" id="mt${idx}" class="btn btn--sm btn--ghost" title="${d.blurb}">${d.name}（${d.segmentLimit}战 · 包${d.packMin}–${d.packMax}）</button>`;
    }).join("");
    var choices = '<div class="decision-panel">' + btns + '<button type="button" id="mtCancel">且罢观脉</button></div>';
    addDungeonLog(msg, choices);
    for (var i = 0; i < MINING_TIER_DEF.length; i++) {
        (function (ti) {
            var el = document.querySelector("#mt" + ti);
            if (el) {
                el.onclick = function () {
                    startMiningRun(ti);
                };
            }
        })(i);
    }
    var cx = document.querySelector("#mtCancel");
    if (cx) {
        cx.onclick = function () {
            mining.status.event = false;
            mining.status.choosing = false;
            updateDungeonLog();
            syncRunBarModeText();
            if (typeof saveData === "function") saveData();
        };
    }
}

function startMiningRun(tierIdx) {
    tierIdx = Math.max(0, Math.min(MINING_TIER_DEF.length - 1, Math.floor(Number(tierIdx) || 0)));
    if (typeof escort !== "undefined" && escort && escort.active) {
        addDungeonLog("红尘镖事未了，地脉不便同启——且先走完这一程人间因果。");
        mining.status.event = false;
        mining.status.choosing = false;
        return;
    }
    var curRoom = getCurrentCalamityRoom();
    if (curRoom >= MINING_ROOM_OPEN_BLOCK_AT) {
        addDungeonLog(
            `<span class="Common">此劫之后，地脉自封。</span> 劫数 ${MINING_ROOM_OPEN_BLOCK_AT} 起，洞府矿机缘暂绝，莫强入。`
        );
        mining.status.event = false;
        mining.status.choosing = false;
        syncRunBarModeText();
        return;
    }
    if (!consumeMiningDailyTicket()) {
        addDungeonLog(
            `<span class="Common">采矿令已尽。</span> 待时辰流转、令纹重凝，方可再叩地脉（下次：${miningNextRecoverText()}）。`
        );
        mining.status.event = false;
        mining.status.choosing = false;
        syncRunBarModeText();
        return;
    }
    var def = MINING_TIER_DEF[tierIdx];
    abortDongtianCloudMeetInFlight();
    if (typeof dungeon !== "undefined" && dungeon && dungeon.status) dungeon.status.event = false;
    mining.active = true;
    mining.tier = tierIdx;
    mining.progress.segment = 0;
    mining.progress.segmentLimit = def.segmentLimit;
    mining.cartHp = def.cartHp;
    mining.action = 0;
    mining.pendingBattle = null;
    mining.awaitingCombatOutcome = false;
    mining.unlockAtRoom = 0;
    mining.status.exploring = true;
    mining.status.paused = false;
    mining.status.event = false;
    mining.status.choosing = false;
    dungeon.status.exploring = false;
    dungeon.status.paused = true;
    dungeonActivity.innerHTML = "深入秘境";
    dungeonAction.innerHTML = `地脉采掘（${def.name}）`;
    var desc = typeof def.descend === "string" && def.descend ? def.descend : "";
    addDungeonLog(
        desc +
            `<br><span class="Common">此脉需镇杀 <b>${def.segmentLimit}</b> 波矿兽，地脉稳固余 <b>${Math.max(0, Math.floor(mining.cartHp))}%</b>；稳固归零则机缘溃散。</span>`
    );
    syncRunBarModeText();
    if (typeof saveData === "function") saveData();
}

function miningStartPause() {
    if (dungeon.status && dungeon.status.event && !mining.status.choosing) {
        dungeonAction.innerHTML = "机缘当前未决，暂不可叩地脉。";
        return;
    }
    if (dungeon.status.exploring) {
        addDungeonLog("你正在秘境穿行，先凝结时隙，再叩地脉机缘。");
        return;
    }
    if (escort.active) {
        addDungeonLog("镖车尚在尘途，不宜分神入地——且先护完这一镖。");
        return;
    }
    if (!mining.active) {
        var curRoom = getCurrentCalamityRoom();
        if (curRoom >= MINING_ROOM_OPEN_BLOCK_AT) {
            addDungeonLog(
                `<span class="Common">此劫之后，地脉自封。</span> 劫数 ${MINING_ROOM_OPEN_BLOCK_AT} 起，洞府矿机缘暂绝。`
            );
            syncRunBarModeText();
            return;
        }
        if (!mining.unlockAtRoom || mining.unlockAtRoom <= 0) {
            mining.unlockAtRoom = curRoom + MINING_OPEN_DELAY_ROOMS;
            addDungeonLog(
                `<span class="Uncommon">你祭出采矿令，地脉气机未稳，尚需一劫凝定。</span><br>当前劫数 <b>${curRoom}</b>，至 <b>${mining.unlockAtRoom}</b> 时，灵脉图方可在识海中择深浅。`
            );
            if (typeof saveData === "function") saveData();
            syncRunBarModeText();
            return;
        }
        if (curRoom < mining.unlockAtRoom) {
            addDungeonLog(
                `令纹与劫数未契：当前 <b>${curRoom}</b>，须至劫数 <b>${mining.unlockAtRoom}</b>，地脉方许一窥。`
            );
            syncRunBarModeText();
            return;
        }
        mining.unlockAtRoom = 0;
        openMiningTierChooser();
        syncRunBarModeText();
        if (typeof saveData === "function") saveData();
        return;
    }
    if (mining.status.event) return;
    if (!mining.status.paused) {
        mining.status.exploring = false;
        mining.status.paused = true;
        dungeonAction.innerHTML = "敛镐养神，地脉灵机暂歇……";
    } else {
        mining.status.exploring = true;
        mining.status.paused = false;
        dungeonAction.innerHTML = "灵镐再起，再向矿髓深处……";
    }
    syncRunBarModeText();
}

function tryAutoOpenMiningChooserOnRoomProgress() {
    if (mining.active || escort.active || (mining.status && mining.status.choosing)) return false;
    if (!mining.unlockAtRoom || mining.unlockAtRoom <= 0) return false;
    var curRoom = getCurrentCalamityRoom();
    if (curRoom < mining.unlockAtRoom) return false;
    if (curRoom >= MINING_ROOM_OPEN_BLOCK_AT) {
        mining.unlockAtRoom = 0;
        syncRunBarModeText();
        if (typeof saveData === "function") saveData();
        return true;
    }
    mining.unlockAtRoom = 0;
    try {
        openMiningTierChooser();
        dungeon.status.exploring = false;
        dungeon.status.paused = true;
        dungeonActivity.innerHTML = "深入秘境";
        syncRunBarModeText();
        if (typeof saveData === "function") saveData();
        return true;
    } catch (e2) {
        mining.status.event = false;
        mining.status.choosing = false;
        return false;
    }
}

/** 联网「路遇道友」异步请求代际（须先于 abortDongtianCloudMeetInFlight 声明） */
var dongtianCloudMeetRequestGen = 0;

/** 联网「路遇道友」异步请求代际：启动押镖/地脉时递增，使未决的 fetch 回调不再改 dungeon 状态 */
function abortDongtianCloudMeetInFlight() {
    try {
        dongtianCloudMeetRequestGen++;
    } catch (eAbort) {}
}

/** 押镖或地脉采矿进行中（及押镖/地脉相关面板）：不触发联网「路遇道友」，避免与镖车/采矿共用 dungeon 事件态导致进度卡住 */
function isDongtianCloudMeetBlockedByRunMode() {
    try {
        var es = typeof escort !== "undefined" && escort ? escort : null;
        var ms = typeof mining !== "undefined" && mining ? mining : null;
        if (typeof dungeon !== "undefined" && dungeon && dungeon.escortState && typeof dungeon.escortState === "object") {
            es = dungeon.escortState;
        }
        if (typeof dungeon !== "undefined" && dungeon && dungeon.miningState && typeof dungeon.miningState === "object") {
            ms = dungeon.miningState;
        }
        if (es && es.active) return true;
        if (ms && ms.active) return true;
        if (es && es.status && (es.status.choosing || es.status.event)) return true;
        if (ms && ms.status && (ms.status.choosing || ms.status.event)) return true;
        return false;
    } catch (eRun) {
        return false;
    }
}

/** event 挂起但日志里无双可点且未在斗法：多为状态与 UI 脱节后卡住；累计数次 tick 后自愈（避免只能凝滞/再进秘境） */
var __dungeonEventStuckTicks = 0;
function tryHealDungeonEventDeadlock() {
    if (!dungeon || !dungeon.status || !dungeon.status.event) {
        __dungeonEventStuckTicks = 0;
        return false;
    }
    if (typeof escort !== "undefined" && escort && escort.active) {
        __dungeonEventStuckTicks = 0;
        return false;
    }
    if (typeof mining !== "undefined" && mining && mining.active) {
        __dungeonEventStuckTicks = 0;
        return false;
    }
    if (player && player.inCombat) {
        __dungeonEventStuckTicks = 0;
        return false;
    }
    var logRoot = document.querySelector("#dungeonLog");
    if (!logRoot) return false;
    if (logRoot.querySelector(".decision-panel button")) {
        __dungeonEventStuckTicks = 0;
        return false;
    }
    __dungeonEventStuckTicks++;
    if (__dungeonEventStuckTicks < 8) return false;
    __dungeonEventStuckTicks = 0;
    dungeon.status.event = false;
    addDungeonLog(
        '<span class="Common">劫机滞涩已自行散尽，可继续掷步。（若频繁出现请记录上一层事件类型反馈）</span>'
    );
    if (typeof updateDungeonLog === "function") updateDungeonLog();
    if (typeof syncRunBarModeText === "function") syncRunBarModeText();
    return true;
}

// ========== Events in the Dungeon ==========
const dungeonEvent = () => {
    tryHealDungeonEventDeadlock();
    /** 敌势上限勿放在本函数开头：定时器约每秒触发，会在「加敌势」奇遇结算后立刻把数值钳回上限，表现为事件不生效。改在掷骰并跑完 switch 后再钳一次（mergeDungeonDefaults / 换层读档仍会钳）。 */
    if (escort.active && escort.status.exploring && !escort.status.event) {
        escortTickEvent();
        return;
    }
    if (mining.active && mining.status.exploring && !mining.status.event) {
        miningTickEvent();
        return;
    }
    if (pendingDungeonStartPauseToggle && !dungeon.status.event && !escort.active && !mining.active) {
        pendingDungeonStartPauseToggle = false;
        applyDungeonStartPauseToggle();
        return;
    }
    if (dungeon.status.exploring && !dungeon.status.event) {
        if (tryAutoOpenEscortChooserOnRoomProgress()) return;
    }
    if (dungeon.status.exploring && !dungeon.status.event) {
        if (tryAutoOpenMiningChooserOnRoomProgress()) return;
    }
    if (dungeon.status.exploring && !dungeon.status.event) {
        if (typeof window.dongtianPresencePingIfNeeded === "function") window.dongtianPresencePingIfNeeded();
        dungeon.action++;
        if (tryResolveDeferredEvent()) return;
        if (tryBondSoulChainAmbientResume()) return;
        let choices;
        let eventRoll;
        /* 基准池：遇敌约半池；缚咒/苦劫/天罚系/高危机缘额外加权，避免加敌势类事件体感过少 */
        let eventTypes = new Array(25).fill("enemy").concat([
            "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing",
            "treasure", "treasure",
            "blessing", "curse", "curse", "curse", "curse", "monarch",
            "echoMirror", "wellspring", "whisperPact", "riftPedlar", "fateLedger", "factionOath", "doomChain", "abyssChain", "skyChain",
            "lingquan", "daoTablet", "insight", "remnantPill",
            "oddBeastDen", "oddBrokenAnvil",
            "rageChain",
            "heartDemon", "sectSpirit", "tianJiQian", "beastBond", "wanderStall",
            "starCompass",
            "sillyDrunkDice", "sillyBeastRace", "sillyFrog", "sillyFakeSage", "sillyGourd", "sillyVending",
            "funShadowShell", "funPuppetFork", "funTideBet", "funCometWish", "funTeaPhantom", "funRiddleStone",
            "funReverseLake", "funDebtCrow", "funLuckCat", "funMeridianDice", "funGhostMerchant", "funTwilightBridge",
            "heavenWrath", "heavenWrath",
            "bloodOathStele", "bloodOathStele",
            "calamityRift", "calamityRift",
            "perilVoidMaw", "perilVoidMaw",
            "perilKarmicLedger", "perilKarmicLedger",
            "perilSoulPyre", "perilSoulPyre",
            "perilIronLotus", "perilIronLotus",
            "perilAbyssWhisper", "perilAbyssWhisper",
            "treasureAmbush",
            "bondSoulChain", "bondSoulChain", "bondSoulChain",
            "warmEaseLantern",
            "warmEaseDewPool",
            "warmEaseFallingLeaf",
            "warmEaseHearthEcho",
            "warmEaseFinchRest",
            "warmEaseWallFlower",
            "warmEaseScentTrace",
            "warmEaseOldTune",
            "warmEaseRainLetter",
            "warmEaseTurnBack",
            "warmEaseSilentPromise",
            "warmEaseChildEcho",
            "warmEaseFrostHand",
        ]);
        const deepF = dungeon.progress.floor;
        const highTier = [];
        if (deepF >= 32) highTier.push("deepSpire");
        if (deepF >= 65) highTier.push("boneCourt");
        if (deepF >= 98) highTier.push("voidAuction");
        if (deepF >= 100) highTier.push("apexBloom");
        if (dungeon.action > 2 && dungeon.action < 6) {
            eventTypes = eventTypes.concat(highTier);
            eventTypes.push("nextroom");
        } else if (dungeon.action > 5) {
            eventTypes = ["nextroom"];
        } else {
            eventTypes = eventTypes.concat(highTier);
        }
        /* 清明·归尘：同秘境层内仅可开篇一次（defer 2/3 段不受影响）；入池约 40% 且仅 1 槽 */
        var _qmFloor = Math.max(1, deepF);
        var _qmDoneOnFloor =
            dungeon.settings &&
            typeof dungeon.settings.qingmingChainIntroDoneFloor === "number" &&
            dungeon.settings.qingmingChainIntroDoneFloor === _qmFloor;
        if (dungeon.action <= 5 && isQingmingSeason() && !_qmDoneOnFloor && Math.random() < 0.4) {
            eventTypes.push("qingmingChain");
        }
        if (dungeon.action <= 5) {
            var bondFloorBoost = Math.min(6, 1 + Math.floor(Math.max(1, deepF) / 10));
            for (var bix = 0; bix < bondFloorBoost; bix++) {
                eventTypes.push("bondSoulChain");
            }
            var bondCycleBoost =
                typeof getBondSoulCycles === "function" ? Math.min(5, Math.floor(getBondSoulCycles() / 2)) : 0;
            for (var bcx = 0; bcx < bondCycleBoost; bcx++) {
                eventTypes.push("bondSoulChain");
            }
            try {
                if (
                    window.DONGTIAN_CLOUD_MODE &&
                    window.parent &&
                    typeof window.parent.goldGameApiRequest === "function" &&
                    !isDongtianCloudMeetBlockedByRunMode()
                ) {
                    var _cmi;
                    var _nK = Math.max(0, Math.min(20, Math.floor(Number(DUNGEON_CLOUD_MEET_POOL_KIND) || 0)));
                    var _nR = Math.max(0, Math.min(20, Math.floor(Number(DUNGEON_CLOUD_MEET_POOL_RIVAL) || 0)));
                    var _nT = Math.max(0, Math.min(20, Math.floor(Number(DUNGEON_CLOUD_MEET_POOL_TAO) || 0)));
                    for (_cmi = 0; _cmi < _nK; _cmi++) eventTypes.push("cloudMeetTraveler");
                    for (_cmi = 0; _cmi < _nR; _cmi++) eventTypes.push("cloudMeetTravelerRival");
                    for (_cmi = 0; _cmi < _nT; _cmi++) eventTypes.push("cloudMeetTravelerTao");
                }
            } catch (eMeet) {}
        }
        // 秘境第 1 层起：恶搞「假遗器」——界面像拾取，实为妖兽（action>5 时池内无此项）
        if (deepF >= 1 && dungeon.action <= 5) {
            eventTypes.push("prankLootAmbush", "prankLootAmbush", "prankLootAmbush", "prankLootAmbush", "prankLootAmbush");
            eventTypes.push(
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling",
                "bitterKarmaScaling"
            );
        }
        // 秘境第 2 层起：雾栈机缘（略提高权重，每层数内约多几次遭遇）
        if (deepF >= 2 && dungeon.action <= 5) {
            eventTypes.push(
                "floor2MistPeddler",
                "floor2MistPeddler",
                "floor2KoiPond",
                "floor2KoiPond",
                "floor2EchoDice",
                "floor2EchoDice",
                "floor2CloudArchive",
                "floor2CloudArchive",
                "funShadowShell",
                "funPuppetFork",
                "funTideBet",
                "funCometWish",
                "funTeaPhantom",
                "funRiddleStone",
                "funReverseLake",
                "funDebtCrow",
                "funLuckCat",
                "funMeridianDice",
                "funGhostMerchant",
                "funTwilightBridge",
                "warmEaseLantern",
                "warmEaseDewPool",
                "warmEaseFinchRest",
                "warmEaseOldTune"
            );
            try {
                if (
                    window.DONGTIAN_CLOUD_MODE &&
                    window.parent &&
                    typeof window.parent.goldGameApiRequest === "function" &&
                    !isDongtianCloudMeetBlockedByRunMode()
                ) {
                    var _f2k = Math.max(0, Math.min(10, Math.floor(Number(DUNGEON_CLOUD_MEET_FLOOR2_EXTRA_KIND) || 0)));
                    var _f2r = Math.max(0, Math.min(10, Math.floor(Number(DUNGEON_CLOUD_MEET_FLOOR2_EXTRA_RIVAL) || 0)));
                    var _f2t = Math.max(0, Math.min(10, Math.floor(Number(DUNGEON_CLOUD_MEET_FLOOR2_EXTRA_TAO) || 0)));
                    for (var _fi = 0; _fi < _f2k; _fi++) eventTypes.push("cloudMeetTraveler");
                    for (_fi = 0; _fi < _f2r; _fi++) eventTypes.push("cloudMeetTravelerRival");
                    for (_fi = 0; _fi < _f2t; _fi++) eventTypes.push("cloudMeetTravelerTao");
                }
            } catch (eMeetF2) {}
        }
        // 秘境第 5 层起：新增常规奇遇（收益中等，非高危）
        if (deepF >= 5 && dungeon.action <= 5) {
            eventTypes.push(
                "floor5LanternCaravan",
                "floor5LanternCaravan",
                "floor5SpiritHerbTerrace",
                "floor5SpiritHerbTerrace",
                "floor5StoneScriptRelay",
                "floor5StoneScriptRelay"
            );
        }
        // 秘境第 7 层起：邪恶风格常规奇遇（收益中等，代价可控）
        if (deepF >= 7 && dungeon.action <= 5) {
            eventTypes.push(
                "floor7BlackBazaar",
                "floor7BlackBazaar",
                "floor7BloodInkContract",
                "floor7BloodInkContract",
                "floor7BoneDiceStall",
                "floor7BoneDiceStall"
            );
        }
        if (dungeon.action <= 5) {
            var _wEaseExtraSets = Math.max(0, Math.min(6, Math.floor(Number(WARM_EASE_POOL_EXTRA_FULL_SETS) || 0)));
            for (var _wes = 0; _wes < _wEaseExtraSets; _wes++) {
                for (var _wei = 0; _wei < WARM_EASE_EVENT_IDS.length; _wei++) {
                    eventTypes.push(WARM_EASE_EVENT_IDS[_wei]);
                }
            }
        }
        /** 第 roomLimit 劫（默认 20）：仅通往秘境镇守的石门，不再出现其它奇遇（含头目遭遇、高危/陷阱替换） */
        var isFinalRoomOfFloor =
            dungeon.progress &&
            typeof dungeon.progress.room === "number" &&
            typeof dungeon.progress.roomLimit === "number" &&
            dungeon.progress.room >= dungeon.progress.roomLimit;
        if (isFinalRoomOfFloor) {
            eventTypes = ["nextroom"];
        }
        eventTypes = filterWarmEaseUsedFromEventPool(eventTypes);
        eventTypes = filterCurseTotemDoneFromEventPool(eventTypes);
        let event = eventTypes[Math.floor(dongtianEventSeeded01("evtMain") * eventTypes.length)];
        // 秘境第 1 层起：危险/高危/陷阱替换主掷结果（加权后体感更明显，仍受 action≤5 与终劫门限制）
        // action>5 时事件池仅为 nextroom，不覆盖以免打乱进房节奏
        if (deepF >= 1 && dungeon.action <= 5 && !isFinalRoomOfFloor) {
            var dangerChance = Math.min(0.24, 0.055 + (deepF - 1) * 0.007);
            if (deepF >= 3) {
                dangerChance = Math.min(0.28, dangerChance + 0.045);
            }
            if (deepF >= 5) {
                dangerChance = Math.min(0.33, dangerChance + 0.025);
            }
            if (dongtianEventSeeded01("evtDanger") < dangerChance) {
                var dangerPool = [
                    "dangerBloodGrove",
                    "dangerArmorTide",
                    "dangerNightPatrol",
                    "dangerCataclysmHunt",
                    "dangerRedMoonExecution",
                    "dangerVoidReaver",
                    "dangerThunderPrison",
                    "dangerIronCavalry",
                    "dangerVoidDragon",
                ];
                if (deepF >= 5) {
                    dangerPool.push(
                        "dangerHeavenLockJudgement",
                        "dangerAbyssImperator",
                        "dangerNineNetherBell"
                    );
                }
                // 6 层以上：加入一组超难事件
                if (deepF >= 6) {
                    dangerPool.push(
                        "dangerSkyfallTribunal",
                        "dangerNetherAbyssTide",
                        "dangerTenThousandSoulBanner"
                    );
                }
                // 7 层以上：加入一组红字超级难事件
                if (deepF >= 7) {
                    dangerPool.push(
                        "dangerCrimsonJudgementSea",
                        "dangerAbyssThroneEdict",
                        "dangerNetherSoulFurnace"
                    );
                }
                // 8 层以上：加入一组极难事件
                if (deepF >= 8) {
                    dangerPool.push(
                        "dangerVoidCrownTrial",
                        "dangerStarfallPrison",
                        "dangerDoomsdayBellAltar"
                    );
                }
                // 9 层以上：加入一组暗金字超级难事件
                if (deepF >= 9) {
                    dangerPool.push(
                        "dangerDarkgoldHeavenAxe",
                        "dangerDarkgoldNetherSanctum",
                        "dangerDarkgoldAbyssCoffin"
                    );
                }
                // 10 层以上：加入一组噩梦级事件
                if (deepF >= 10) {
                    dangerPool.push(
                        "dangerNightmareEternalScaffold",
                        "dangerNightmareSoulAbyssCourt",
                        "dangerNightmareFinalEmber"
                    );
                }
                // 11 层以上：加入一组史诗级事件
                if (deepF >= 11) {
                    dangerPool.push(
                        "dangerEpicSkyRuinThrone",
                        "dangerEpicVoidOperaCourt",
                        "dangerEpicMyriadFateWheel"
                    );
                }
                // 12 层以上：加入一组传说级事件
                if (deepF >= 12) {
                    dangerPool.push(
                        "dangerLegendSunforgeCrown",
                        "dangerLegendAncientDragonAltar",
                        "dangerLegendHeavenFateAbyss"
                    );
                }
                // 10 层以上：对 3 个超级难事件再额外加权一次（再次入池）
                if (deepF >= 10) {
                    dangerPool.push(
                        "dangerHeavenLockJudgement",
                        "dangerAbyssImperator",
                        "dangerNineNetherBell"
                    );
                }
                var trapPoolFloor3 = [
                    "dangerTrapWireBridge",
                    "dangerTrapGlyphFloor",
                    "dangerTrapSporeMist",
                    "dangerTrapSinkStone",
                    "dangerTrapMirrorHall",
                ];
                if (deepF >= 3 && dongtianEventSeeded01("evtTrapGate") < 0.38) {
                    event = trapPoolFloor3[Math.floor(dongtianEventSeeded01("evtTrapPick") * trapPoolFloor3.length)];
                } else {
                    event = dangerPool[Math.floor(dongtianEventSeeded01("evtDangerPick") * dangerPool.length)];
                }
            }
        }

        if (
            isDongtianCloudMeetBlockedByRunMode() &&
            (event === "cloudMeetTraveler" || event === "cloudMeetTravelerRival" || event === "cloudMeetTravelerTao")
        ) {
            event = "nothing";
        }
        if (isWarmEaseEventId(event) && isWarmEaseUsedThisFloor(event)) {
            event = "nothing";
        }

        switch (event) {
            case "nextroom":
                dungeon.status.event = true;
                var atLastRoom = dungeon.progress.room == dungeon.progress.roomLimit;
                if (atLastRoom) {
                    choices =
                        '<div class="decision-panel decision-panel--boss-door">' +
                        '<button type="button" id="choice1">踏入裂隙</button>' +
                        "</div>";
                } else {
                    choices =
                        '<div class="decision-panel">' +
                        '<button type="button" id="choice1">踏入裂隙</button>' +
                        '<button type="button" id="choice2">置之不理</button>' +
                        "</div>";
                }
                if (atLastRoom) {
                    addDungeonLog(`<span class="Heirloom">你窥见通往秘境之主的殿门</span>，唯有踏入一途。`, choices);
                } else {
                    addDungeonLog("一道洞天石门在雾中浮现", choices);
                }
                document.querySelector("#choice1").onclick = function () {
                    if (dungeon.progress.room == dungeon.progress.roomLimit) {
                        guardianBattle();
                    } else {
                        eventRoll = randomizeNum(1, 3);
                        if (eventRoll == 1) {
                            incrementRoom();
                            mimicBattle("door");
                            addDungeonLog(pickDeeperFloorLine());
                        } else if (eventRoll == 2) {
                            incrementRoom();
                            choices = `
                                <div class="decision-panel">
                                    <button id="choice1">启封遗匣</button>
                                    <button id="choice2">置之不理</button>
                                </div>`;
                            addDungeonLog(`你步入新劫数，幽光藏宝间中央悬着一口<i class="fa fa-toolbox"></i>灵宝匣。`, choices);
                            document.querySelector("#choice1").onclick = function () {
                                chestEvent();
                            }
                            document.querySelector("#choice2").onclick = function () {
                                dungeon.action = 0;
                                ignoreEvent();
                            };
                        } else {
                            dungeon.status.event = false;
                            incrementRoom();
                            addDungeonLog("你抵达另一劫数，空无一物。");
                        }
                    }
                };
                if (!atLastRoom) {
                    document.querySelector("#choice2").onclick = function () {
                        dungeon.action = 0;
                        ignoreEvent();
                    };
                }
                break;
            case "treasure":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">启封遗匣</button>
                        <button id="choice2">置之不理</button>
                    </div>`;
                addDungeonLog(`你发现幽光藏宝间，中央悬着一口<i class="fa fa-toolbox"></i>灵宝匣`, choices);
                document.querySelector("#choice1").onclick = function () {
                    chestEvent();
                }
                document.querySelector("#choice2").onclick = function () {
                    ignoreEvent();
                };
                break;
            case "nothing":
                nothingEvent();
                break;
            case "warmEaseLantern":
                warmEaseNarrativeHtml(
                    `<span class="Apexother">劫雾深处忽有一盏豆灯</span><span class="Epic">，不照路，</span><span class="eq-enchant-tier-4">只照心。</span><span class="Chronarch">你驻足片刻，肩上的沉意像被谁温柔接过。</span>`,
                    "warmEaseLantern"
                );
                break;
            case "warmEaseDewPool":
                warmEaseNarrativeHtml(
                    `<span class="Etherbound">石凹里汪着一小泊清水</span><span class="Epic">，清得像山外初春的雨。</span><span class="Heirloom">你掬起抿了一口，苦涩从喉间退开，</span><span class="Legendary">连呼吸都顺了些。</span>`,
                    "warmEaseDewPool"
                );
                break;
            case "warmEaseFallingLeaf":
                warmEaseNarrativeHtml(
                    `<span class="Chronarch">一片落叶不偏不倚落在你掌心</span><span class="Epic">，纹脉细软，</span><span class="Heirloom">像某人曾写下的平安符。</span><span class="Apexother">你不忍捏碎它</span><span class="Legendary">，周遭的凛冽竟也退下半寸。</span>`,
                    "warmEaseFallingLeaf"
                );
                break;
            case "warmEaseHearthEcho":
                warmEaseNarrativeHtml(
                    `<span class="Chronarch">雾里传来极远的捣衣声</span><span class="Heirloom">，寻常人家的烟火气</span><span class="Legendary">——此界本不该有</span><span class="Apexother">，却让你眼角微热。</span><span class="Etherbound">秘境仿佛也收起了几分狰狞。</span>`,
                    "warmEaseHearthEcho"
                );
                break;
            case "warmEaseFinchRest":
                warmEaseNarrativeHtml(
                    `<span class="Apexother">一只灵雀落在你剑柄上理了理羽毛</span><span class="Legendary">，毫无戒心。</span><span class="Epic">你屏息不动，</span><span class="Heirloom">心头的戾气随之散了些</span><span class="Chronarch">，像被小爪子轻轻拨过。</span>`,
                    "warmEaseFinchRest"
                );
                break;
            case "warmEaseWallFlower":
                warmEaseNarrativeHtml(
                    `<span class="Etherbound">墙角蜷出一丛不知名的小白花</span><span class="Heirloom">，柔弱却倔强。</span><span class="Epic">你忽然想起师门山下也有这样的春天，</span><span class="eq-enchant-tier-4">脚步不由得轻了。</span>`,
                    "warmEaseWallFlower"
                );
                break;
            case "warmEaseScentTrace":
                warmEaseNarrativeHtml(
                    `<span class="Chronarch">有人在你身后极轻地「嗯」了一声</span><span class="Epic">，回头却空无一人，</span><span class="Apexother">只剩袖口香风一缕。</span><span class="Legendary">你不恼</span><span class="Heirloom">，反倒觉得这一路有人默默陪着。</span>`,
                    "warmEaseScentTrace"
                );
                break;
            case "warmEaseOldTune":
                warmEaseNarrativeHtml(
                    `<span class="Legendary">雾色里浮来半截旧童谣的调子</span><span class="Epic">，记不清词，</span><span class="eq-enchant-tier-4">却暖得像炭火。</span><span class="Heirloom">你跟着哼了半句，</span><span class="Apexother">胸臆里的紧箍悄然松了一格。</span>`,
                    "warmEaseOldTune"
                );
                break;
            case "warmEaseRainLetter":
                warmEaseNarrativeHtml(
                    `<span class="Legendary">雾里落下细密的凉意，像故乡檐角的雨，一颗颗敲在青石板上。</span><span class="Heirloom">你想起许多年没回去的灶台火，想起有人在门口站了很久。</span><span class="Epic">若能寄出一封家书，你大概只会写四个字：</span><span class="eq-enchant-tier-4">「勿念，尚在。」</span>`,
                    "warmEaseRainLetter"
                );
                break;
            case "warmEaseTurnBack":
                warmEaseNarrativeHtml(
                    `<span class="Epic">雾墙恍惚裂开一瞬，映出山外那条黄土路。</span><span class="Apexother">年少的你背着包袱越走越远，总以为回头会显得不够决绝。</span><span class="Heirloom">如今站在劫里，你才明白——那一眼的迟疑，其实是舍不得。</span>`,
                    "warmEaseTurnBack"
                );
                break;
            case "warmEaseSilentPromise":
                warmEaseNarrativeHtml(
                    `<span class="Etherbound">空无一人的石阶上，并排摆着两枚尚带体温的野果，像有谁刚离开。</span><span class="Chronarch">你没有独吞，只在对面的空位也轻轻放下一枚。</span><span class="eq-enchant-tier-4">「我替你走。」</span><span class="Apexother">你对风低声说。</span><span class="Legendary">风穿过指缝，像在点头。</span>`,
                    "warmEaseSilentPromise"
                );
                break;
            case "warmEaseChildEcho":
                warmEaseNarrativeHtml(
                    `<span class="Chronarch">很远的地方传来含糊的童音，在喊一声听不清的称呼。</span><span class="Heirloom">那声音与劫气格格不入，却让你眼眶发热——仿佛许多年前，也有人这样等你回家吃饭。</span><span class="Apexother">你朝雾里「嗯」了一声应回去，像把当年的自己轻轻接住。</span>`,
                    "warmEaseChildEcho"
                );
                break;
            case "warmEaseFrostHand":
                warmEaseNarrativeHtml(
                    `<span class="Apexother">掌心忽觉一阵极轻的覆压，温暖得不似此界应有。</span><span class="Legendary">抬头无人，只余雾。可那温度久久不散，像某个人把你推出风雪时，最后留给你的目光。</span><span class="Etherbound">你握紧空拳，把那点余温藏进袖里，继续向前。</span>`,
                    "warmEaseFrostHand"
                );
                break;
            case "enemy":
                dungeon.status.event = true;
                generateRandomEnemy();
                var counterBadge = typeof getPreCombatCounterBadgeText === "function" ? getPreCombatCounterBadgeText() : "未知";
                var fightBtnText = counterBadge ? ("拔刃相峙（" + counterBadge + "）") : "拔刃相峙";
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">${fightBtnText}</button>
                        <button id="choice2">遁入虚空</button>
                    </div>`;
                addDungeonLog(pickEnemyEncounterDungeonLine(), choices);
                player.inCombat = true;
                document.querySelector("#choice1").onclick = function () {
                    engageBattle();
                }
                document.querySelector("#choice2").onclick = function () {
                    fleeBattle();
                }
                break;
            case "blessing":
                eventRoll = randomizeNum(1, 4);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    blessingValidation();
                    let cost = (player.blessing * (500 * (player.blessing * 0.5)) + 750) * 5;
                    choices = `
                        <div class="decision-panel">
                            <button id="choice1">献奉灵石</button>
                            <button id="choice2">置之不理</button>
                        </div>`;
                    addDungeonLog(`<span class="Legendary">祈天台灵音低徊。是否献奉<i class="fas fa-coins" style="color: #FFD700;"></i><span class="Common">${nFormatter(cost)}</span>灵石以换取天眷？（天眷 ${player.blessing} 层）</span>`, choices);
                    var blessingChoiceLocked = false;
                    function lockBlessingChoicesOnce() {
                        if (blessingChoiceLocked) return false;
                        blessingChoiceLocked = true;
                        var b1 = document.querySelector("#choice1");
                        var b2 = document.querySelector("#choice2");
                        if (b1) b1.disabled = true;
                        if (b2) b2.disabled = true;
                        return true;
                    }
                    document.querySelector("#choice1").onclick = function () {
                        if (!lockBlessingChoicesOnce()) return;
                        if (player.gold < cost) {
                            addDungeonLog("灵石不足，祈天台寂然，无音可回。");
                        } else {
                            player.gold -= cost;
                            statBlessing();
                        }
                        dungeon.status.event = false;
                    }
                    document.querySelector("#choice2").onclick = function () {
                        if (!lockBlessingChoicesOnce()) return;
                        ignoreEvent();
                    };
                } else {
                    nothingEvent();
                }
                break;
            case "curse":
                /** 主池已掷中 curse；本层是否还能进池由 filterCurseTotemDoneFromEventPool 处理。此处勿再五选一，否则体感为「加敌势的普通事件从不触发」。 */
                dungeon.settings.curseTotemDoneFloor = Math.max(1, Math.floor(Number(dungeon.progress.floor) || 1));
                try {
                    if (typeof saveData === "function") saveData();
                } catch (eCurseFloor) {}
                dungeon.status.event = true;
                let curseLvl = Math.round((dungeon.settings.enemyScaling - 1) * 10);
                let cost = curseLvl * (10000 * (curseLvl * 0.5)) + 5000;
                choices = `
                            <div class="decision-panel">
                                <button id="choice1">献奉灵石</button>
                                <button id="choice2">置之不理</button>
                            </div>`;
                addDungeonLog(`<span class="Heirloom">缚咒桩于暗影中搏动。献奉<i class="fas fa-coins" style="color: #FFD700;"></i><span class="Common">${nFormatter(cost)}</span>灵石？妖物将更为凶戾，遗落亦将更为珍贵。（邪印 ${curseLvl} 层）</span>`, choices);
                var curseChoiceLocked = false;
                function lockCurseChoicesOnce() {
                    if (curseChoiceLocked) return false;
                    curseChoiceLocked = true;
                    var c1 = document.querySelector("#choice1");
                    var c2 = document.querySelector("#choice2");
                    if (c1) c1.disabled = true;
                    if (c2) c2.disabled = true;
                    return true;
                }
                document.querySelector("#choice1").onclick = function () {
                    if (!lockCurseChoicesOnce()) return;
                    if (player.gold < cost) {
                        addDungeonLog("灵石不足，缚咒桩上幽光一黯，隐有讥意。");
                    } else {
                        player.gold -= cost;
                        cursedTotem(curseLvl);
                    }
                    dungeon.status.event = false;
                }
                document.querySelector("#choice2").onclick = function () {
                    if (!lockCurseChoicesOnce()) return;
                    ignoreEvent();
                }
                break;
            case "monarch":
                eventRoll = randomizeNum(1, 10);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    choices = `
                            <div class="decision-panel">
                                <button id="choice1">踏入虚室</button>
                                <button id="choice2">置之不理</button>
                            </div>`;
                    addDungeonLog(`<span class="Heirloom">你发现一间被灵雾封缄的虚室，深处似有巨物沉眠</span>`, choices);
                    document.querySelector("#choice1").onclick = function () {
                        specialBossBattle();
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                } else {
                    nothingEvent();
                }
                break;
            case "echoMirror":
                echoMirrorEvent();
                break;
            case "fateLedger":
                fateLedgerEvent();
                break;
            case "factionOath":
                factionOathEvent();
                break;
            case "doomChain":
                doomChainEvent();
                break;
            case "abyssChain":
                abyssChainEvent();
                break;
            case "skyChain":
                skyChainEvent();
                break;
            case "wellspring":
                wellspringEvent();
                break;
            case "oddBeastDen":
                oddBeastDenEvent();
                break;
            case "oddBrokenAnvil":
                oddBrokenAnvilEvent();
                break;
            case "rageChain":
                rageChainEvent();
                break;
            case "whisperPact":
                whisperPactEvent();
                break;
            case "riftPedlar":
                riftPedlarEvent();
                break;
            case "deepSpire":
                deepSpireEvent();
                break;
            case "boneCourt":
                boneCourtEvent();
                break;
            case "voidAuction":
                voidAuctionEvent();
                break;
            case "apexBloom":
                apexBloomEvent();
                break;
            case "lingquan":
                lingquanEvent();
                break;
            case "daoTablet":
                daoTabletEvent();
                break;
            case "insight":
                insightEvent();
                break;
            case "remnantPill":
                remnantPillEvent();
                break;
            case "heartDemon":
                heartDemonEvent();
                break;
            case "sectSpirit":
                sectSpiritEvent();
                break;
            case "tianJiQian":
                tianJiQianEvent();
                break;
            case "beastBond":
                beastBondEvent();
                break;
            case "wanderStall":
                wanderStallEvent();
                break;
            case "starCompass":
                starCompassEvent();
                break;
            case "sillyDrunkDice":
                sillyDrunkDiceEvent();
                break;
            case "sillyBeastRace":
                sillyBeastRaceEvent();
                break;
            case "sillyFrog":
                sillyFrogEvent();
                break;
            case "sillyFakeSage":
                sillyFakeSageEvent();
                break;
            case "sillyGourd":
                sillyGourdEvent();
                break;
            case "sillyVending":
                sillyVendingEvent();
                break;
            case "funShadowShell":
                funShadowShellEvent();
                break;
            case "funPuppetFork":
                funPuppetForkEvent();
                break;
            case "funTideBet":
                funTideBetEvent();
                break;
            case "funCometWish":
                funCometWishEvent();
                break;
            case "funTeaPhantom":
                funTeaPhantomEvent();
                break;
            case "funRiddleStone":
                funRiddleStoneEvent();
                break;
            case "funReverseLake":
                funReverseLakeEvent();
                break;
            case "funDebtCrow":
                funDebtCrowEvent();
                break;
            case "funLuckCat":
                funLuckCatEvent();
                break;
            case "funMeridianDice":
                funMeridianDiceEvent();
                break;
            case "funGhostMerchant":
                funGhostMerchantEvent();
                break;
            case "funTwilightBridge":
                funTwilightBridgeEvent();
                break;
            case "cloudMeetTraveler":
                cloudMeetTravelerEvent();
                break;
            case "cloudMeetTravelerRival":
                cloudMeetTravelerEventWithVariant("rival");
                break;
            case "cloudMeetTravelerTao":
                cloudMeetTravelerEventWithVariant("tao");
                break;
            case "prankLootAmbush":
                prankLootAmbushEvent();
                break;
            case "bitterKarmaScaling":
                bitterKarmaScalingEvent();
                break;
            case "heavenWrath":
                heavenWrathEvent();
                break;
            case "bloodOathStele":
                bloodOathSteleEvent();
                break;
            case "calamityRift":
                calamityRiftEvent();
                break;
            case "perilVoidMaw":
                perilVoidMawEvent();
                break;
            case "perilKarmicLedger":
                perilKarmicLedgerEvent();
                break;
            case "perilSoulPyre":
                perilSoulPyreEvent();
                break;
            case "perilIronLotus":
                perilIronLotusEvent();
                break;
            case "perilAbyssWhisper":
                perilAbyssWhisperEvent();
                break;
            case "dangerBloodGrove":
                dangerBloodGroveEvent();
                break;
            case "dangerArmorTide":
                dangerArmorTideEvent();
                break;
            case "dangerNightPatrol":
                dangerNightPatrolEvent();
                break;
            case "dangerCataclysmHunt":
                dangerCataclysmHuntEvent();
                break;
            case "dangerRedMoonExecution":
                dangerRedMoonExecutionEvent();
                break;
            case "dangerVoidReaver":
                dangerVoidReaverEvent();
                break;
            case "dangerThunderPrison":
                dangerThunderPrisonEvent();
                break;
            case "dangerIronCavalry":
                dangerIronCavalryEvent();
                break;
            case "dangerVoidDragon":
                dangerVoidDragonEvent();
                break;
            case "dangerHeavenLockJudgement":
                dangerHeavenLockJudgementEvent();
                break;
            case "dangerAbyssImperator":
                dangerAbyssImperatorEvent();
                break;
            case "dangerNineNetherBell":
                dangerNineNetherBellEvent();
                break;
            case "dangerSkyfallTribunal":
                dangerSkyfallTribunalEvent();
                break;
            case "dangerNetherAbyssTide":
                dangerNetherAbyssTideEvent();
                break;
            case "dangerTenThousandSoulBanner":
                dangerTenThousandSoulBannerEvent();
                break;
            case "dangerCrimsonJudgementSea":
                dangerCrimsonJudgementSeaEvent();
                break;
            case "dangerAbyssThroneEdict":
                dangerAbyssThroneEdictEvent();
                break;
            case "dangerNetherSoulFurnace":
                dangerNetherSoulFurnaceEvent();
                break;
            case "dangerVoidCrownTrial":
                dangerVoidCrownTrialEvent();
                break;
            case "dangerStarfallPrison":
                dangerStarfallPrisonEvent();
                break;
            case "dangerDoomsdayBellAltar":
                dangerDoomsdayBellAltarEvent();
                break;
            case "dangerDarkgoldHeavenAxe":
                dangerDarkgoldHeavenAxeEvent();
                break;
            case "dangerDarkgoldNetherSanctum":
                dangerDarkgoldNetherSanctumEvent();
                break;
            case "dangerDarkgoldAbyssCoffin":
                dangerDarkgoldAbyssCoffinEvent();
                break;
            case "dangerNightmareEternalScaffold":
                dangerNightmareEternalScaffoldEvent();
                break;
            case "dangerNightmareSoulAbyssCourt":
                dangerNightmareSoulAbyssCourtEvent();
                break;
            case "dangerNightmareFinalEmber":
                dangerNightmareFinalEmberEvent();
                break;
            case "dangerEpicSkyRuinThrone":
                dangerEpicSkyRuinThroneEvent();
                break;
            case "dangerEpicVoidOperaCourt":
                dangerEpicVoidOperaCourtEvent();
                break;
            case "dangerEpicMyriadFateWheel":
                dangerEpicMyriadFateWheelEvent();
                break;
            case "dangerLegendSunforgeCrown":
                dangerLegendSunforgeCrownEvent();
                break;
            case "dangerLegendAncientDragonAltar":
                dangerLegendAncientDragonAltarEvent();
                break;
            case "dangerLegendHeavenFateAbyss":
                dangerLegendHeavenFateAbyssEvent();
                break;
            case "dangerTrapWireBridge":
                dangerTrapWireBridgeEvent();
                break;
            case "dangerTrapGlyphFloor":
                dangerTrapGlyphFloorEvent();
                break;
            case "dangerTrapSporeMist":
                dangerTrapSporeMistEvent();
                break;
            case "dangerTrapSinkStone":
                dangerTrapSinkStoneEvent();
                break;
            case "dangerTrapMirrorHall":
                dangerTrapMirrorHallEvent();
                break;
            case "treasureAmbush":
                treasureAmbushEvent();
                break;
            case "qingmingChain":
                qingmingChainEvent();
                break;
            case "bondSoulChain":
                bondSoulChainRouter();
                break;
            case "floor2MistPeddler":
                floor2MistPeddlerEvent();
                break;
            case "floor2KoiPond":
                floor2KoiPondEvent();
                break;
            case "floor2EchoDice":
                floor2EchoDiceEvent();
                break;
            case "floor2CloudArchive":
                floor2CloudArchiveEvent();
                break;
            case "floor5LanternCaravan":
                floor5LanternCaravanEvent();
                break;
            case "floor5SpiritHerbTerrace":
                floor5SpiritHerbTerraceEvent();
                break;
            case "floor5StoneScriptRelay":
                floor5StoneScriptRelayEvent();
                break;
            case "floor7BlackBazaar":
                floor7BlackBazaarEvent();
                break;
            case "floor7BloodInkContract":
                floor7BloodInkContractEvent();
                break;
            case "floor7BoneDiceStall":
                floor7BoneDiceStallEvent();
                break;
        }
        if (typeof dungeon !== "undefined" && dungeon && dungeon.settings && dungeon.progress) {
            clampDungeonEnemyScalingToFloorCeiling(dungeon);
        }
    }
}

// ========= Dungeon Choice Events ==========
function enterCombatWithPreHint(onEnterCombat) {
    updateDungeonLog();
    setTimeout(function () {
        showCombatInfo();
        startCombat();
        if (typeof onEnterCombat === "function") onEnterCombat();
    }, 300);
}

// Starts the battle
const engageBattle = () => {
    enterCombatWithPreHint(function () {
        addCombatLog(pickEngageCombatLogLine());
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.5) {
            addCombatLog(pickXiuxianQuote("combat_open"));
        }
        updateDungeonLog();
    });
}

// 宝箱怪 encounter
const mimicBattle = (type) => {
    generateRandomEnemy(type);
    // 宝箱怪按当前秘境层数取高等级（本层上限）
    if (type === "chest") {
        const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
        enemy.lvl = Math.max(1, maxLvl);
        if (typeof setEnemyStats === "function") setEnemyStats(enemy.type);
    }
    enterCombatWithPreHint(function () {
        addCombatLog(pickEngageCombatLogLine());
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.45) {
            addCombatLog(pickXiuxianQuote("combat_open"));
        }
        addDungeonLog(pickDungeonCombatEchoLine());
    });
}

// Guardian boss fight
const guardianBattle = () => {
    incrementRoom();
    generateRandomEnemy("guardian");
    enterCombatWithPreHint(function () {
        addCombatLog(`秘境镇守${enemy.name}横亘殿门之前。`);
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.72) {
            addCombatLog(pickXiuxianQuote("boss"));
        }
        addDungeonLog(pickDeeperFloorLine());
    });
}

// Guardian boss fight
const specialBossBattle = () => {
    generateRandomEnemy("sboss");
    enterCombatWithPreHint(function () {
        addCombatLog(`秘境主宰${enemy.name}睁开亘古之眼。`);
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.68) {
            addCombatLog(pickXiuxianQuote("monarch"));
        }
        addDungeonLog(`秘境主宰${enemy.name}睁开亘古之眼。`);
    });
}

// Flee from the monster
const fleeBattle = () => {
    let eventRoll = randomizeNum(1, 2);
    if (eventRoll == 1) {
        addDungeonLog(`你撕开一道隙缝，成功遁离。`);
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.5) {
            addDungeonLog(pickXiuxianQuote("flee_ok"));
        }
        player.inCombat = false;
        if (typeof window.clearCombatTimerSyncOnly === "function") window.clearCombatTimerSyncOnly();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
    } else {
        addDungeonLog(`遁逃失败，灵雾将你推回战场！`);
        enterCombatWithPreHint(function () {
            addCombatLog(pickEngageCombatLogLine());
            addCombatLog(`遁逃未成，唯有死战。`);
        });
    }
}

function rollTreasureAmbushTierRarity() {
    const r = Math.random();
    if (r < 0.6) return "Uncommon"; // 2品质
    if (r < 0.85) return "Rare"; // 3品质
    return "Epic"; // 4品质
}

function rollTreasureAmbushEquipmentByRarity(targetRarity) {
    const inv = player && player.inventory && Array.isArray(player.inventory.equipment) ? player.inventory.equipment : null;
    if (!inv) return null;
    const maxTry = 24;
    for (let i = 0; i < maxTry; i++) {
        const before = inv.length;
        const item = createEquipment();
        const added = inv.length > before;
        if (item && item.rarity === targetRarity) {
            return item;
        }
        // 仅移除本次试作的非目标遗器，避免污染行囊
        if (added) {
            inv.pop();
        }
    }
    return null;
}

function claimTreasureAmbushReward() {
    if (!dungeonTreasureAmbushPending) return false;
    const pending = dungeonTreasureAmbushPending;
    dungeonTreasureAmbushPending = null;
    if (typeof addMaterial === "function" && typeof MATERIAL_SOCKET_OPENER !== "undefined") {
        if (Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
            if (typeof ensureGemMaterialsInInventory === "function") ensureGemMaterialsInInventory();
            addMaterial(MATERIAL_SOCKET_OPENER, 1);
            var ozh = typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined" ? MATERIAL_SOCKET_OPENER_ZH : "开孔器";
            addCombatLog(`守宝凶物伏诛，残匣旁落<span class="Legendary">${ozh}</span> ×1。`);
        }
    }
    if (pending.kind === "stone") {
        const amt = Math.max(1, pending.amount || 1);
        if (typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            let gotEnh = false;
            let gotEnc = false;
            if (Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
                addMaterial(MATERIAL_ENHANCE_STONE, amt);
                gotEnh = true;
            }
            if (typeof MATERIAL_ENCHANT_STONE !== "undefined" && Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
                addMaterial(MATERIAL_ENCHANT_STONE, amt);
                gotEnc = true;
            }
            const zh = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
            const ezh = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
            if (gotEnh && gotEnc) {
                addCombatLog(`伏击宝藏到手：你自残匣中夺得 <span class="Epic">${zh}</span> ×${amt}、<span class="Legendary">${ezh}</span> ×${amt}。`);
                addDungeonLog(`你斩敌夺宝，获得 <span class="Epic">${zh}</span> ×${amt}、<span class="Legendary">${ezh}</span> ×${amt}。`);
            } else if (gotEnh) {
                addCombatLog(`伏击宝藏到手：你自残匣中夺得 <span class="Epic">${zh}</span> ×${amt}，${ezh}未凝结。`);
                addDungeonLog(`你斩敌夺宝，获得 <span class="Epic">${zh}</span> ×${amt}。`);
            } else if (gotEnc) {
                addCombatLog(`伏击宝藏到手：你自残匣中夺得 <span class="Legendary">${ezh}</span> ×${amt}，${zh}未凝结。`);
                addDungeonLog(`你斩敌夺宝，获得 <span class="Legendary">${ezh}</span> ×${amt}。`);
            } else {
                addCombatLog("伏击宝藏到手，匣内灵砂未凝成炼器之石。");
                addDungeonLog("你斩敌夺宝，匣内灵砂未凝成石。");
            }
        } else {
            addCombatLog("伏击宝藏到手，但你暂时无法接收材料（缺少材料系统）。");
        }
        return true;
    }
    if (pending.kind === "equipment" && dongtianCloudWildEquipmentDropDisabled()) {
        const fallback = Math.max(1, randomizeNum(2, 5));
        if (typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            let gotEnh = false;
            let gotEnc = false;
            if (Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
                addMaterial(MATERIAL_ENHANCE_STONE, fallback);
                gotEnh = true;
            }
            if (typeof MATERIAL_ENCHANT_STONE !== "undefined" && Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
                addMaterial(MATERIAL_ENCHANT_STONE, fallback);
                gotEnc = true;
            }
            const zh = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
            const ezh = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
            if (gotEnh && gotEnc) {
                addCombatLog(`联网洞天：伏击残匣不致遗器外流，灵机折为 <span class="Epic">${zh}</span> ×${fallback}、<span class="Legendary">${ezh}</span> ×${fallback}。`);
                addDungeonLog(`残匣灵机折作 <span class="Epic">${zh}</span> ×${fallback}、<span class="Legendary">${ezh}</span> ×${fallback}。`);
            } else if (gotEnh) {
                addCombatLog(`联网洞天：伏击残匣不致遗器外流，灵机折为 <span class="Epic">${zh}</span> ×${fallback}。`);
                addDungeonLog(`残匣灵机折作 <span class="Epic">${zh}</span> ×${fallback}。`);
            } else if (gotEnc) {
                addCombatLog(`联网洞天：伏击残匣不致遗器外流，灵机折为 <span class="Legendary">${ezh}</span> ×${fallback}。`);
                addDungeonLog(`残匣灵机折作 <span class="Legendary">${ezh}</span> ×${fallback}。`);
            } else {
                addCombatLog("联网洞天：残匣灵机过散，未能凝成炼器石。");
                addDungeonLog("残匣灵机过散，未能凝成炼器石。");
            }
        } else {
            addCombatLog("联网洞天：伏击宝藏改为石材，但材料系统不可用。");
        }
        return true;
    }
    const rarity = pending.rarity || "Uncommon";
    const item = rollTreasureAmbushEquipmentByRarity(rarity);
    if (item) {
        const rZh = typeof equipmentRarityLabel === "function" ? equipmentRarityLabel(item.rarity) : item.rarity;
        const n = typeof weaponOrArmorDisplayName === "function" ? weaponOrArmorDisplayName(item) : (item.category || "遗器");
        addCombatLog(`伏击宝藏到手：你夺得 <span class="${item.rarity}">${rZh} ${n}</span>。`);
        addDungeonLog(`你斩敌夺宝，入手 <span class="${item.rarity}">${rZh} ${n}</span>。`);
    } else {
        // 行囊满/重铸失败时回退为强化石，避免空奖励
        const fallback = Math.max(1, randomizeNum(1, 2));
        if (typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            let gotEnh = false;
            let gotEnc = false;
            if (Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
                addMaterial(MATERIAL_ENHANCE_STONE, fallback);
                gotEnh = true;
            }
            if (typeof MATERIAL_ENCHANT_STONE !== "undefined" && Math.random() < TREASURE_AMBUSH_MATERIAL_DROP_RATE) {
                addMaterial(MATERIAL_ENCHANT_STONE, fallback);
                gotEnc = true;
            }
            const zh = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
            const ezh = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
            if (gotEnh && gotEnc) {
                addCombatLog(`遗器未能收纳，宝藏回退为 <span class="Epic">${zh}</span> ×${fallback}、<span class="Legendary">${ezh}</span> ×${fallback}。`);
                addDungeonLog(`因行囊受限，宝藏折算为 <span class="Epic">${zh}</span> ×${fallback}、<span class="Legendary">${ezh}</span> ×${fallback}。`);
            } else if (gotEnh) {
                addCombatLog(`遗器未能收纳，宝藏回退为 <span class="Epic">${zh}</span> ×${fallback}。`);
                addDungeonLog(`因行囊受限，宝藏折算为 <span class="Epic">${zh}</span> ×${fallback}。`);
            } else if (gotEnc) {
                addCombatLog(`遗器未能收纳，宝藏回退为 <span class="Legendary">${ezh}</span> ×${fallback}。`);
                addDungeonLog(`因行囊受限，宝藏折算为 <span class="Legendary">${ezh}</span> ×${fallback}。`);
            } else {
                addCombatLog("遗器未能收纳，匣中灵砂亦未折成炼器石。");
                addDungeonLog("因行囊受限，未能折算灵砂为石。");
            }
        }
    }
    return true;
}

// 宝藏伏击：打赢伏击怪才可领宝（跑则放弃）
const treasureAmbushEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="ta1">拔刃夺宝</button>
            <button type="button" id="ta2">遁走略过</button>
        </div>`;
    addDungeonLog(`<span class="Legendary">你发现一口被妖雾缠绕的残匣。匣盖刚启，守宝凶物已自暗处扑出！</span>`, choices);

    document.querySelector("#ta1").onclick = function () {
        // 按需求：本层最高等级怪物（maxLvl）
        generateRandomEnemy();
        const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
        enemy.lvl = Math.max(1, maxLvl);
        // 宝藏伏击怪：至少 5 品
        enemy.qualityTier = typeof enemy.qualityTier === "number" ? Math.max(5, enemy.qualityTier) : 5;
        if (typeof setEnemyStats === "function") {
            setEnemyStats(enemy.type);
        }
        enterCombatWithPreHint(function () {
            addCombatLog(`你强开残匣，${enemy.name}暴起护宝！其修为已至本层极限。`);

        // 先决定“宝藏种类”，战胜后发放
        if (Math.random() < 0.5) {
            const r = rollTreasureAmbushTierRarity();
            dungeonTreasureAmbushPending = { kind: "equipment", rarity: r };
            const zh = r === "Uncommon" ? "2品质" : (r === "Rare" ? "3品质" : "4品质");
            addCombatLog(`宝光一闪：若你得胜，可夺取一件<span class="${r}">${zh}遗器</span>。`);
        } else {
            const amt = randomizeNum(1, 3);
            dungeonTreasureAmbushPending = { kind: "stone", amount: amt };
            addCombatLog(
                `宝匣内灵砂翻涌：若你得胜，残匣之物各有概率凝为<span class="Epic">强化石</span>、<span class="Legendary">附魔石</span>（各至多 ${amt} 份）。`
            );
        }
            updateDungeonLog();
        });
    };
    document.querySelector("#ta2").onclick = function () {
        dungeonTreasureAmbushPending = null;
        addDungeonLog("你不与守宝凶物纠缠，收敛气息，转身离去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

function startDangerEventCombat(openLine, failLine, opts) {
    const cfg = opts || {};
    const minQuality = typeof cfg.minQuality === "number" ? Math.max(5, Math.floor(cfg.minQuality)) : 5;
    const statMul = typeof cfg.statMul === "number" ? Math.max(1, cfg.statMul) : 1;
    const rewardMul = typeof cfg.rewardMul === "number" ? Math.max(1, cfg.rewardMul) : 1;
    const lvlBonus = typeof cfg.lvlBonus === "number" ? Math.max(0, Math.floor(cfg.lvlBonus)) : 1;
    generateRandomEnemy();
    const floor = Math.max(1, dungeon.progress.floor || 1);
    const lvlGap = Math.max(1, dungeon.settings.enemyLvlGap || 1);
    const baseMaxLvl = floor * lvlGap + ((dungeon.settings.enemyBaseLvl || 1) - 1);
    // 危险战斗怪等级抬到“高于当前层常规上限”的档位，高危池可再额外抬升
    enemy.lvl = Math.max(typeof enemy.lvl === "number" ? enemy.lvl : 1, baseMaxLvl + lvlBonus * lvlGap);
    // 危险战斗事件统一要求：怪物至少 5 品；高危池可进一步抬升
    enemy.qualityTier = typeof enemy.qualityTier === "number" ? Math.max(minQuality, enemy.qualityTier) : minQuality;
    if (typeof setEnemyStats === "function") setEnemyStats(enemy.type);
    if (statMul > 1 && enemy && enemy.stats) {
        enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * statMul));
        enemy.stats.hp = enemy.stats.hpMax;
        enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * statMul));
        enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * statMul));
        enemy.stats.atkSpd = Math.min(3, enemy.stats.atkSpd * Math.max(1.03, statMul * 0.93));
    }
    if (rewardMul > 1 && enemy && enemy.rewards) {
        if (typeof enemy.rewards.exp === "number") enemy.rewards.exp = Math.max(1, Math.round(enemy.rewards.exp * rewardMul));
        if (typeof enemy.rewards.gold === "number") enemy.rewards.gold = Math.max(1, Math.round(enemy.rewards.gold * rewardMul));
    }
    if (cfg.victoryBonus && typeof cfg.victoryBonus === "object") {
        dungeonDangerVictoryPending = Object.assign({}, cfg.victoryBonus);
    } else {
        dungeonDangerVictoryPending = null;
    }
    enterCombatWithPreHint(function () {
        addCombatLog(openLine);
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.38) {
            addCombatLog(pickXiuxianQuote("combat_open"));
        }
        if (failLine) addCombatLog(failLine);
        updateDungeonLog();
    });
}

function clearDangerBattleVictoryPending() {
    dungeonDangerVictoryPending = null;
}

function claimDangerBattleVictory() {
    if (!dungeonDangerVictoryPending) return;
    var b = dungeonDangerVictoryPending;
    dungeonDangerVictoryPending = null;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var extraGold = typeof b.extraGoldMul === "number"
        ? applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(80, 180) * floor * b.extraGoldMul)))
        : 0;
    var extraExp = typeof b.extraExpPct === "number"
        ? rollDungeonExpFloorRewardAmount()
        : 0;
    if (extraGold > 0) {
        player.gold += extraGold;
        if (typeof addCombatLog === "function") {
            addCombatLog(`<span class="Legendary">高危战功</span>：额外灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(extraGold)}</b>。`);
        }
    }
    if (extraExp > 0) {
        if (dongtianDungeonPlayerExpAddBase(extraExp)) {
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(extraExp * ps)));
            }
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            if (typeof addCombatLog === "function") {
                addCombatLog(`<span class="Epic">高危悟道</span>：额外感悟 <b>+${nFormatter(extraExp)}</b>。`);
            }
        }
    }
    if (typeof addMaterial === "function") {
        if (typeof MATERIAL_ENHANCE_STONE !== "undefined" && Math.random() < (typeof b.enhanceStoneP === "number" ? b.enhanceStoneP : 0)) {
            addMaterial(MATERIAL_ENHANCE_STONE, 1);
            if (typeof addCombatLog === "function") addCombatLog(`你自劫灰中拾得 <span class="Epic">强化石</span> ×1。`);
        }
        if (typeof MATERIAL_ENCHANT_STONE !== "undefined" && Math.random() < (typeof b.enchantStoneP === "number" ? b.enchantStoneP : 0)) {
            addMaterial(MATERIAL_ENCHANT_STONE, 1);
            if (typeof addCombatLog === "function") addCombatLog(`你自劫核中剥离 <span class="Legendary">附魔石</span> ×1。`);
        }
        if (typeof MATERIAL_TALENT_FRUIT !== "undefined" && typeof b.talentFruit === "number" && b.talentFruit > 0) {
            addMaterial(MATERIAL_TALENT_FRUIT, Math.floor(b.talentFruit));
            var fzh = typeof MATERIAL_TALENT_FRUIT_ZH !== "undefined" ? MATERIAL_TALENT_FRUIT_ZH : "天赋果";
            if (typeof addCombatLog === "function") addCombatLog(`你自妖核里剥出<span class="Legendary">${fzh}</span> ×${Math.floor(b.talentFruit)}。`);
        }
    }
    if (b.titleBuff && typeof b.titleBuff === "object" && dungeon && dungeon.settings) {
        dungeon.settings.chainTitleBuff = {
            id: b.titleBuff.id || "chain_title",
            name: b.titleBuff.name || "劫战之名",
            atkMul: typeof b.titleBuff.atkMul === "number" ? b.titleBuff.atkMul : 1.08,
            dmgTakenMul: typeof b.titleBuff.dmgTakenMul === "number" ? b.titleBuff.dmgTakenMul : 0.94
        };
        if (typeof addCombatLog === "function") {
            addCombatLog(`<span class="Apexother">称号加身</span>：${dungeon.settings.chainTitleBuff.name}（本次秘境生效）。`);
        }
    }
    playerLoadStats();
}

// ========= 历练趣味奇遇（含精英遭遇战） =========
function oddBeastDenEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="obd1">探巢夺魄（精英）</button>
            <button id="obd2">取走妖蜕</button>
            <button id="obd3">绕行避锋</button>
        </div>`;
    addDungeonLog(`<span class="Uncommon">雾壁后传来低沉喘息，你窥见一处妖巢，腥风裹着灵气涌出。</span>`, choices);
    document.querySelector("#obd1").onclick = function () {
        startDangerEventCombat(
            `你踏入妖巢深处，${enemy.name}自暗处暴起，凶威赫然——此獠非寻常妖卒。`,
            `你欲抽身，却被妖气锁住半步——`,
            {
                minQuality: 6,
                statMul: 1.06,
                rewardMul: 1.18,
                lvlBonus: 1,
                victoryBonus: { talentFruit: 1, enhanceStoneP: 0.25 }
            }
        );
    };
    document.querySelector("#obd2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.01, 0.03)));
        const gain = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(12, 26) * floor)));
        player.stats.hp = Math.max(1, player.stats.hp - loss);
        player.gold += gain;
        addDungeonLog(`你趁雾势掠走妖蜕，却仍被余煞擦中：气血 <b>-${nFormatter(loss)}</b>；顺手得灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(gain)}</b>。`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
    document.querySelector("#obd3").onclick = function () {
        addDungeonLog("你收敛气息，借雾遁形，悄然绕开妖巢。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

function oddBrokenAnvilEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="oba1">唤火再锻</button>
            <button id="oba2">守炉一炷香（精英）</button>
            <button id="oba3">置之不理</button>
        </div>`;
    addDungeonLog(`<span class="Uncommon">你见一座残破锻台埋在雾砂中，铁砧尚热，似有人方才离去。</span>`, choices);
    document.querySelector("#oba1").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const cost = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(18, 42) * floor)));
        if (player.gold < cost) {
            addDungeonLog(`灵石不足（需 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(cost)}），锻台火息一灭。`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= cost;
        if (typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            addMaterial(MATERIAL_ENHANCE_STONE, 1);
            addDungeonLog(`你以灵石引火，再锻一息，得 <span class="Epic">${typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石"}</span> ×1。`);
        } else {
            addDungeonLog("你引火再锻，却未能凝出可收纳之物。");
        }
        playerLoadStats();
        dungeon.status.event = false;
        updateDungeonLog();
    };
    document.querySelector("#oba2").onclick = function () {
        startDangerEventCombat(
            `你守炉一炷香，雾中忽有脚步声近，${enemy.name}循火息而来——竟是觊觎锻台之精英妖修。`,
            `妖修冷笑，火息反噬——`,
            {
                minQuality: 6,
                statMul: 1.05,
                rewardMul: 1.22,
                lvlBonus: 1,
                victoryBonus: { enhanceStoneP: 0.55, enchantStoneP: 0.25 }
            }
        );
    };
    document.querySelector("#oba3").onclick = function () {
        addDungeonLog("你不与旧物纠缠，踏雾而去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

// 危险战斗：血色碑林
function dangerBloodGroveEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dbg1">破阵迎敌</button>
            <button id="dbg2">收息退避</button>
        </div>`;
    addDungeonLog(`<span class="Common">【危险】血色碑林突现，碑文渗血成河，杀意正沿地脉攀上你的脚踝。</span>`, choices);
    document.querySelector("#dbg1").onclick = function () {
        startDangerEventCombat(`你踏碎血碑，${enemy.name}自碑影中破土而出，凶芒直逼命门。`);
    };
    document.querySelector("#dbg2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.02, 0.05)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span class="Common">你强行后撤仍被碑煞擦中：气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 危险战斗：裂甲兽潮
function dangerArmorTideEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dat1">截击兽潮</button>
            <button id="dat2">绕道潜行</button>
        </div>`;
    addDungeonLog(`<span class="Common">【危险】前方传来甲壳摩擦巨响，裂甲兽潮正顺着甬道碾来。</span>`, choices);
    document.querySelector("#dat1").onclick = function () {
        startDangerEventCombat(`你逆潮而上，${enemy.name}撕开兽群扑杀而来，鳞甲上尽是旧战血痕。`);
    };
    document.querySelector("#dat2").onclick = function () {
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(14, 40) * Math.max(1, dungeon.progress.floor || 1))));
        player.gold = Math.max(0, player.gold - loss);
        addDungeonLog(`<span class="Common">你以灵石诱偏兽潮才得脱身：损失 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 危险战斗：夜巡斩首令
function dangerNightPatrolEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dnp1">迎战夜巡</button>
            <button id="dnp2">裂隙遁行</button>
        </div>`;
    addDungeonLog(`<span class="Common">【危险】黑旗夜巡封锁去路，斩首令上赫然写着你的名号。</span>`, choices);
    document.querySelector("#dnp1").onclick = function () {
        startDangerEventCombat(`你拔刃破围，夜巡统领${enemy.name}踏雾现身，刀锋已先你半寸。`);
    };
    document.querySelector("#dnp2").onclick = function () {
        const roll = randomizeNum(1, 100);
        if (roll <= 45) {
            addDungeonLog("你借裂隙阴影遁走，夜巡错失你的气息。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.08)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span class="Common">遁行败露，夜巡飞刃贯体：气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 高危战斗池：灾猎队，强度与奖励显著提高
function dangerCataclysmHuntEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dch1">迎击灾猎队</button>
            <button id="dch2">断尾求生</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【高危】灾猎队循血追踪而来，锁魂钉已钉住你退路。</span>`, choices);
    document.querySelector("#dch1").onclick = function () {
        startDangerEventCombat(
            `你反身冲阵，${enemy.name}执钩掠空，第一击便瞄准你的丹田。`,
            null,
            { minQuality: 7, statMul: 1.52, rewardMul: 1.42, lvlBonus: 2 }
        );
    };
    document.querySelector("#dch2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.15)));
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(60, 130) * Math.max(1, dungeon.progress.floor || 1))));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        player.gold = Math.max(0, player.gold - loss);
        addDungeonLog(`<span style="color:#ff4d4f;">你弃下诱饵断尾而逃：气血 <b>-${nFormatter(dmg)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 高危战斗池：血月行刑
function dangerRedMoonExecutionEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dre1">破月斩令</button>
            <button id="dre2">硬抗刑芒</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【高危】血月压顶，行刑令当空展开，月光如刀正在校准你的脖颈。</span>`, choices);
    document.querySelector("#dre1").onclick = function () {
        startDangerEventCombat(
            `你以身撞入月光，${enemy.name}踏着行刑鼓点现身，每一步都像在宣判。`,
            null,
            { minQuality: 8, statMul: 1.68, rewardMul: 1.58, lvlBonus: 3 }
        );
    };
    document.querySelector("#dre2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.2)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#ff4d4f;">你以护体硬扛月刑，护罩尽裂：气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.013);
        addDungeonLog(`<span style="color:#ff4d4f;">血月余辉未散，秘境敌势永久 <b>+0.013</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 高危战斗池：虚渊裂噬者
function dangerVoidReaverEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dvr1">强杀裂噬者</button>
            <button id="dvr2">献祭灵石脱身</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【高危】虚渊裂噬者抬首嗅到你的命火，四周空间正向它齿间塌陷。</span>`, choices);
    document.querySelector("#dvr1").onclick = function () {
        startDangerEventCombat(
            `你先手爆发，${enemy.name}却反以虚渊吞刃，战场边界开始崩塌。`,
            null,
            { minQuality: 9, statMul: 1.82, rewardMul: 1.78, lvlBonus: 4 }
        );
    };
    document.querySelector("#dvr2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(120, 260) * floor)));
        player.gold = Math.max(0, player.gold - loss);
        addDungeonLog(`<span style="color:#ff4d4f;">你抛洒灵石稳住空间褶皱，勉强脱身：损失 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 高危战斗池：天罚雷狱
function dangerThunderPrisonEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dtp1">踏雷破狱</button>
            <button id="dtp2">割脉泄雷（以血避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【高危】九重雷狱自天而降，雷锁一环扣一环，已将你钉在劫心。</span>`, choices);
    document.querySelector("#dtp1").onclick = function () {
        startDangerEventCombat(
            `你踏雷而上，${enemy.name}披雷鞭降临，电痕在你脚下连成刑阵。`,
            null,
            {
                minQuality: 9,
                statMul: 1.92,
                rewardMul: 1.9,
                lvlBonus: 5,
                victoryBonus: { enhanceStoneP: 0.42, enchantStoneP: 0.22, extraGoldMul: 1.08, extraExpPct: 0.028 }
            }
        );
    };
    document.querySelector("#dtp2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.16, 0.24)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.016);
        addDungeonLog(`<span style="color:#ff4d4f;">你以精血导雷勉强脱身：气血 <b>-${nFormatter(dmg)}</b>；雷厄残留，秘境敌势永久 <b>+0.016</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 高危战斗池：镇狱铁骑
function dangerIronCavalryEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dic1">正面截骑</button>
            <button id="dic2">弃财断后（以财避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【高危】黑甲铁骑踏碎雾墙而来，蹄声如钟，整片地脉都在震。</span>`, choices);
    document.querySelector("#dic1").onclick = function () {
        startDangerEventCombat(
            `你横刀截骑，${enemy.name}冲阵而出，枪锋卷着铁屑与火星。`,
            null,
            {
                minQuality: 10,
                statMul: 2.05,
                rewardMul: 2.02,
                lvlBonus: 6,
                victoryBonus: { enhanceStoneP: 0.5, enchantStoneP: 0.3, extraGoldMul: 1.2, extraExpPct: 0.036 }
            }
        );
    };
    document.querySelector("#dic2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(180, 360) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.16)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#ff4d4f;">你抛下重财诱偏铁骑才脱身：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 极危战斗池：噬界古龙
function dangerVoidDragonEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dvd1">屠龙断劫（极难）</button>
            <button id="dvd2">献祭遁空（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【极危】虚空裂渊深处探出古龙之首，龙息所及，连时隙都在燃烧。</span>`, choices);
    document.querySelector("#dvd1").onclick = function () {
        startDangerEventCombat(
            `你提气斩向龙颈，${enemy.name}吐出噬界龙炎，战场一瞬如末劫重临。`,
            null,
            {
                minQuality: 10,
                statMul: 2.22,
                rewardMul: 2.28,
                lvlBonus: 7,
                victoryBonus: { enhanceStoneP: 0.62, enchantStoneP: 0.42, extraGoldMul: 1.45, extraExpPct: 0.052 }
            }
        );
    };
    document.querySelector("#dvd2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(260, 520) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.18, 0.28)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.019);
        addDungeonLog(`<span style="color:#ff4d4f;">你献祭灵石撕开遁空裂口：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；龙炎余烬令秘境敌势永久 <b>+0.019</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 五层起超级难事件：天锁审判台
function dangerHeavenLockJudgementEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dhl1">破锁问斩（超级难）</button>
            <button id="dhl2">焚元脱枷（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超级难】天锁审判台自雾中升起，九重锁链齐鸣，你的命火被钉在刑柱中央。</span>`, choices);
    document.querySelector("#dhl1").onclick = function () {
        startDangerEventCombat(
            `你逆锁而上，${enemy.name}执天刑锁落下，每一环都在抽离你的护体真元。`,
            null,
            {
                minQuality: 10,
                statMul: 2.36,
                rewardMul: 2.4,
                lvlBonus: 8,
                victoryBonus: { enhanceStoneP: 0.68, enchantStoneP: 0.45, extraGoldMul: 1.5, extraExpPct: 0.055 }
            }
        );
    };
    document.querySelector("#dhl2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.2, 0.3)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.022);
        addDungeonLog(`<span style="color:#ff4d4f;">你焚元断链狼狈脱身：气血 <b>-${nFormatter(dmg)}</b>；锁罚余威令秘境敌势永久 <b>+0.022</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 五层起超级难事件：渊皇行辇
function dangerAbyssImperatorEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dai1">掀辇斩皇（超级难）</button>
            <button id="dai2">献财请退（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超级难】渊皇行辇碾过甬道，辇帘后杀机如潮，你被判为当场献祭。</span>`, choices);
    document.querySelector("#dai1").onclick = function () {
        startDangerEventCombat(
            `你踏辇而战，${enemy.name}自辇帘后拔戟而出，威压几乎压碎整条地脉。`,
            null,
            {
                minQuality: 10,
                statMul: 2.48,
                rewardMul: 2.55,
                lvlBonus: 9,
                victoryBonus: { enhanceStoneP: 0.75, enchantStoneP: 0.5, extraGoldMul: 1.62, extraExpPct: 0.062 }
            }
        );
    };
    document.querySelector("#dai2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(340, 680) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.16, 0.24)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#ff4d4f;">你以重财买命退避渊皇：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 五层起超级难事件：九幽钟鸣
function dangerNineNetherBellEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dnb1">逆钟镇煞（超级难）</button>
            <button id="dnb2">封识避劫（减益避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超级难】九幽古钟自渊底轰鸣，钟波层层叠来，你的识海几乎被瞬间震裂。</span>`, choices);
    document.querySelector("#dnb1").onclick = function () {
        startDangerEventCombat(
            `你以神识硬撼钟波，${enemy.name}踏着余震现身，周身煞纹与钟鸣同频。`,
            null,
            {
                minQuality: 10,
                statMul: 2.62,
                rewardMul: 2.72,
                lvlBonus: 10,
                victoryBonus: { enhanceStoneP: 0.82, enchantStoneP: 0.58, extraGoldMul: 1.75, extraExpPct: 0.072 }
            }
        );
    };
    document.querySelector("#dnb2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.22, 0.32)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.028);
        addDungeonLog(`<span style="color:#ff4d4f;">你封闭神识躲过钟杀：气血 <b>-${nFormatter(dmg)}</b>；九幽回响令秘境敌势永久 <b>+0.028</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 六层起超难事件：天坠审判庭
function dangerSkyfallTribunalEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dst1">逆审破庭（超难）</button>
            <button id="dst2">折寿遁形（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超难】天坠审判庭在劫雾中显形，刑光如瀑自穹顶倾落，直指你命门。</span>`, choices);
    document.querySelector("#dst1").onclick = function () {
        startDangerEventCombat(
            `你顶着刑光冲阵，${enemy.name}自审判台中央落地，第一击便要撕开你的护体。`,
            null,
            {
                minQuality: 10,
                statMul: 2.78,
                rewardMul: 2.88,
                lvlBonus: 11,
                victoryBonus: { enhanceStoneP: 0.88, enchantStoneP: 0.62, extraGoldMul: 1.82, extraExpPct: 0.078 }
            }
        );
    };
    document.querySelector("#dst2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.24, 0.34)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.03);
        addDungeonLog(`<span style="color:#ff4d4f;">你折损本源强遁：气血 <b>-${nFormatter(dmg)}</b>；审判余压令秘境敌势永久 <b>+0.03</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 六层起超难事件：幽渊逆潮
function dangerNetherAbyssTideEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dna1">截潮斩主（超难）</button>
            <button id="dna2">弃财保命（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超难】幽渊逆潮倒灌而来，潮中万鬼同嚎，连甬道石壁都在被吞蚀。</span>`, choices);
    document.querySelector("#dna1").onclick = function () {
        startDangerEventCombat(
            `你逆潮而上，${enemy.name}踩着浪头现身，煞气几乎压灭你的命火。`,
            null,
            {
                minQuality: 10,
                statMul: 2.92,
                rewardMul: 3.02,
                lvlBonus: 12,
                victoryBonus: { enhanceStoneP: 0.92, enchantStoneP: 0.68, extraGoldMul: 1.95, extraExpPct: 0.086 }
            }
        );
    };
    document.querySelector("#dna2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(420, 860) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.2, 0.28)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#ff4d4f;">你以重财截潮换命：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 六层起超难事件：万魂幡狱
function dangerTenThousandSoulBannerEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dts1">焚幡镇狱（超难）</button>
            <button id="dts2">闭识伏地（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超难】万魂幡狱拔地而起，幡影遮天，耳畔尽是残魂哭嚎与夺命咒音。</span>`, choices);
    document.querySelector("#dts1").onclick = function () {
        startDangerEventCombat(
            `你焚气冲入幡阵，${enemy.name}踏幡而下，杀机与咒力同时压来。`,
            null,
            {
                minQuality: 10,
                statMul: 3.05,
                rewardMul: 3.18,
                lvlBonus: 13,
                victoryBonus: { enhanceStoneP: 0.96, enchantStoneP: 0.72, extraGoldMul: 2.08, extraExpPct: 0.095 }
            }
        );
    };
    document.querySelector("#dts2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.26, 0.36)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.034);
        addDungeonLog(`<span style="color:#ff4d4f;">你闭识硬抗幡咒：气血 <b>-${nFormatter(dmg)}</b>；幡狱残咒令秘境敌势永久 <b>+0.034</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 七层起超级难事件：赤劫审海
function dangerCrimsonJudgementSeaEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dcs1">裂海逆审（超级难）</button>
            <button id="dcs2">焚血遁浪（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超级难】赤劫审海自脚下翻涌而起，浪头尽是刑纹，稍慢半息便会被判入死局。</span>`, choices);
    document.querySelector("#dcs1").onclick = function () {
        startDangerEventCombat(
            `你逆浪斩入审海，${enemy.name}踏潮现身，刑芒与煞潮同时压来。`,
            null,
            {
                minQuality: 10,
                statMul: 3.18,
                rewardMul: 3.3,
                lvlBonus: 14,
                victoryBonus: { enhanceStoneP: 0.98, enchantStoneP: 0.75, extraGoldMul: 2.18, extraExpPct: 0.102 }
            }
        );
    };
    document.querySelector("#dcs2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.28, 0.38)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.038);
        addDungeonLog(`<span style="color:#ff4d4f;">你焚血冲浪脱身：气血 <b>-${nFormatter(dmg)}</b>；赤劫潮痕令秘境敌势永久 <b>+0.038</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 七层起超级难事件：渊座诛令
function dangerAbyssThroneEdictEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="datE1">抗令弑座（超级难）</button>
            <button id="datE2">散尽灵藏（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超级难】渊座诛令降临，黑金诏书点名索命，甬道尽头只剩一条血线可走。</span>`, choices);
    document.querySelector("#datE1").onclick = function () {
        startDangerEventCombat(
            `你撕碎诏令，${enemy.name}携渊座威压落下，四周空间都被压成窄缝。`,
            null,
            {
                minQuality: 10,
                statMul: 3.32,
                rewardMul: 3.46,
                lvlBonus: 15,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 0.78, extraGoldMul: 2.3, extraExpPct: 0.11 }
            }
        );
    };
    document.querySelector("#datE2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(520, 980) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.22, 0.32)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#ff4d4f;">你散尽灵藏买下一线生机：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 七层起超级难事件：九幽炼魂炉
function dangerNetherSoulFurnaceEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dns1">碎炉灭魂（超级难）</button>
            <button id="dns2">闭脉熬炉（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【超级难】九幽炼魂炉轰然启火，炉焰穿透护体直灼识海，退路尽被魂锁封死。</span>`, choices);
    document.querySelector("#dns1").onclick = function () {
        startDangerEventCombat(
            `你强闯炉心，${enemy.name}踏着魂火杀出，连空气都在灼痛神识。`,
            null,
            {
                minQuality: 10,
                statMul: 3.48,
                rewardMul: 3.62,
                lvlBonus: 16,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 0.82, extraGoldMul: 2.45, extraExpPct: 0.12 }
            }
        );
    };
    document.querySelector("#dns2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.3, 0.4)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.042);
        addDungeonLog(`<span style="color:#ff4d4f;">你闭脉硬熬炉火：气血 <b>-${nFormatter(dmg)}</b>；炼魂余烬令秘境敌势永久 <b>+0.042</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 八层起极难事件：虚冠试炼场
function dangerVoidCrownTrialEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dvc1">夺冠破局（极难）</button>
            <button id="dvc2">燃魂脱冠（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【极难】虚冠试炼场开启，王冠虚影悬于头顶，稍有迟疑便会被判为败者湮灭。</span>`, choices);
    document.querySelector("#dvc1").onclick = function () {
        startDangerEventCombat(
            `你迎冠而战，${enemy.name}执试炼王印压下，战场威压几乎令骨骼开裂。`,
            null,
            {
                minQuality: 10,
                statMul: 3.62,
                rewardMul: 3.78,
                lvlBonus: 17,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 0.86, extraGoldMul: 2.58, extraExpPct: 0.13 }
            }
        );
    };
    document.querySelector("#dvc2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.32, 0.42)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.046);
        addDungeonLog(`<span style="color:#ff4d4f;">你燃魂弃冠遁离：气血 <b>-${nFormatter(dmg)}</b>；虚冠余压令秘境敌势永久 <b>+0.046</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 八层起极难事件：陨星天狱
function dangerStarfallPrisonEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dsp1">碎狱斩星（极难）</button>
            <button id="dsp2">散财引星（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【极难】陨星天狱轰然合拢，星火如雨坠落，整片甬道化作焚炼囚笼。</span>`, choices);
    document.querySelector("#dsp1").onclick = function () {
        startDangerEventCombat(
            `你顶着陨火冲锋，${enemy.name}携星狱之力现身，每一击都裹挟坠星碎片。`,
            null,
            {
                minQuality: 10,
                statMul: 3.78,
                rewardMul: 3.96,
                lvlBonus: 18,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 0.9, extraGoldMul: 2.74, extraExpPct: 0.14 }
            }
        );
    };
    document.querySelector("#dsp2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(620, 1180) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.24, 0.34)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#ff4d4f;">你散尽灵石引走陨星：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 八层起极难事件：终劫钟坛
function dangerDoomsdayBellAltarEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="ddb1">震坛断劫（极难）</button>
            <button id="ddb2">闭脉护魂（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【极难】终劫钟坛鸣响九次，钟波撕开神识防线，劫音正一点点抹去你的道基。</span>`, choices);
    document.querySelector("#ddb1").onclick = function () {
        startDangerEventCombat(
            `你踏入钟坛核心，${enemy.name}借终劫钟波现身，杀意与劫音同频共振。`,
            null,
            {
                minQuality: 10,
                statMul: 3.95,
                rewardMul: 4.15,
                lvlBonus: 19,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 0.95, extraGoldMul: 2.92, extraExpPct: 0.155 }
            }
        );
    };
    document.querySelector("#ddb2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.34, 0.44)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.051);
        addDungeonLog(`<span style="color:#ff4d4f;">你闭脉硬抗终劫钟鸣：气血 <b>-${nFormatter(dmg)}</b>；钟坛余震令秘境敌势永久 <b>+0.051</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 九层起暗金字超级难事件：玄钺天断
function dangerDarkgoldHeavenAxeEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dgh1">擎钺断天（超级难）</button>
            <button id="dgh2">裂脉遁形（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#b8860b;">【超级难】玄钺天断横贯穹顶，暗金斧芒先斩影后斩身，退路已被一分为二。</span>`, choices);
    document.querySelector("#dgh1").onclick = function () {
        startDangerEventCombat(
            `你迎斧而上，${enemy.name}抡起玄钺斩落，斧压震得地脉寸寸龟裂。`,
            null,
            {
                minQuality: 10,
                statMul: 4.12,
                rewardMul: 4.35,
                lvlBonus: 20,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 3.05, extraExpPct: 0.17 }
            }
        );
    };
    document.querySelector("#dgh2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.36, 0.46)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.056);
        addDungeonLog(`<span style="color:#b8860b;">你裂脉强遁：气血 <b>-${nFormatter(dmg)}</b>；钺痕不散，秘境敌势永久 <b>+0.056</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 九层起暗金字超级难事件：幽阙金狱
function dangerDarkgoldNetherSanctumEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dgn1">破阙灭狱（超级难）</button>
            <button id="dgn2">散宝买命（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#b8860b;">【超级难】幽阙金狱降临，暗金囚环层层闭锁，连呼吸都被判作重罪。</span>`, choices);
    document.querySelector("#dgn1").onclick = function () {
        startDangerEventCombat(
            `你强闯金狱核心，${enemy.name}携囚环镇压而来，威压几乎要碾碎识海。`,
            null,
            {
                minQuality: 10,
                statMul: 4.28,
                rewardMul: 4.52,
                lvlBonus: 21,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 3.22, extraExpPct: 0.182 }
            }
        );
    };
    document.querySelector("#dgn2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(760, 1360) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.26, 0.36)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#b8860b;">你散尽灵藏赎命：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 九层起暗金字超级难事件：渊皇葬棺
function dangerDarkgoldAbyssCoffinEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dga1">开棺诛皇（超级难）</button>
            <button id="dga2">闭识镇魂（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#b8860b;">【超级难】渊皇葬棺在暗金棺焰中开启，棺内帝息如潮，正一点点吞没你的道心。</span>`, choices);
    document.querySelector("#dga1").onclick = function () {
        startDangerEventCombat(
            `你开棺拔刃，${enemy.name}踏棺焰而出，第一击便要连同神魂一并斩碎。`,
            null,
            {
                minQuality: 10,
                statMul: 4.46,
                rewardMul: 4.72,
                lvlBonus: 22,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 3.4, extraExpPct: 0.195 }
            }
        );
    };
    document.querySelector("#dga2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.38, 0.48)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.061);
        addDungeonLog(`<span style="color:#b8860b;">你闭识镇魂强撑一线：气血 <b>-${nFormatter(dmg)}</b>；棺火余烬令秘境敌势永久 <b>+0.061</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十层起噩梦级事件：永劫刑架
function dangerNightmareEternalScaffoldEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dne1">碎架逆劫（噩梦）</button>
            <button id="dne2">焚魂脱桩（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#8b0000;">【噩梦级】永劫刑架从地脉深处升起，锁钉穿空而鸣，你的影子已被钉在刑柱上。</span>`, choices);
    document.querySelector("#dne1").onclick = function () {
        startDangerEventCombat(
            `你踏钉逆行，${enemy.name}执刑链砸落，战场每一寸都在收缩成死线。`,
            null,
            {
                minQuality: 10,
                statMul: 4.68,
                rewardMul: 4.98,
                lvlBonus: 23,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 3.58, extraExpPct: 0.205 }
            }
        );
    };
    document.querySelector("#dne2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.4, 0.5)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.066);
        addDungeonLog(`<span style="color:#8b0000;">你焚魂震断刑钉：气血 <b>-${nFormatter(dmg)}</b>；永劫余压令秘境敌势永久 <b>+0.066</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十层起噩梦级事件：魂渊审庭
function dangerNightmareSoulAbyssCourtEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dnsc1">弑庭破裁（噩梦）</button>
            <button id="dnsc2">献藏求赦（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#8b0000;">【噩梦级】魂渊审庭开审，万魂共诵罪名，判词落下时连识海都在战栗。</span>`, choices);
    document.querySelector("#dnsc1").onclick = function () {
        startDangerEventCombat(
            `你拔刃逆审，${enemy.name}携审庭威压镇下，刀光与判词几乎同一瞬到来。`,
            null,
            {
                minQuality: 10,
                statMul: 4.88,
                rewardMul: 5.2,
                lvlBonus: 24,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 3.78, extraExpPct: 0.22 }
            }
        );
    };
    document.querySelector("#dnsc2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(880, 1560) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.28, 0.38)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#8b0000;">你献尽灵藏换来暂赦：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十层起噩梦级事件：终焰余烬
function dangerNightmareFinalEmberEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dnf1">踏焰封劫（噩梦）</button>
            <button id="dnf2">闭命熬焰（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#8b0000;">【噩梦级】终焰余烬点燃整层秘境，黑红焰潮吞没道路，你的道基正在被逐寸灼蚀。</span>`, choices);
    document.querySelector("#dnf1").onclick = function () {
        startDangerEventCombat(
            `你踏焰突进，${enemy.name}借终焰之核降临，焰压几乎要把时隙烧穿。`,
            null,
            {
                minQuality: 10,
                statMul: 5.12,
                rewardMul: 5.46,
                lvlBonus: 25,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 4.02, extraExpPct: 0.24 }
            }
        );
    };
    document.querySelector("#dnf2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.42, 0.52)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.072);
        addDungeonLog(`<span style="color:#8b0000;">你闭命硬熬终焰：气血 <b>-${nFormatter(dmg)}</b>；终焰残烬令秘境敌势永久 <b>+0.072</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十一层起史诗级事件：天穹废座
function dangerEpicSkyRuinThroneEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="des1">裂座登穹（史诗）</button>
            <button id="des2">断脉坠退（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#a855f7;">【史诗级】天穹废座自虚空坠临，碎座残辉如刃，连劫雾都被切成万道紫痕。</span>`, choices);
    document.querySelector("#des1").onclick = function () {
        startDangerEventCombat(
            `你踏碎废座冲锋，${enemy.name}执穹座残印镇落，整片战场像被折叠成牢笼。`,
            null,
            {
                minQuality: 10,
                statMul: 5.38,
                rewardMul: 5.78,
                lvlBonus: 26,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 4.35, extraExpPct: 0.26 }
            }
        );
    };
    document.querySelector("#des2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.44, 0.54)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.078);
        addDungeonLog(`<span style="color:#a855f7;">你断脉强坠脱离穹座：气血 <b>-${nFormatter(dmg)}</b>；穹痕残压令秘境敌势永久 <b>+0.078</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十一层起史诗级事件：虚渊戏廷
function dangerEpicVoidOperaCourtEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dev1">斩廷止戏（史诗）</button>
            <button id="dev2">散宝退幕（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#a855f7;">【史诗级】虚渊戏廷开幕，万面傀伶齐唱判词，你的姓名被写进了终幕名单。</span>`, choices);
    document.querySelector("#dev1").onclick = function () {
        startDangerEventCombat(
            `你逆幕斩入戏廷，${enemy.name}戴着终幕鬼面现身，每一式都裹挟葬曲回响。`,
            null,
            {
                minQuality: 10,
                statMul: 5.66,
                rewardMul: 6.08,
                lvlBonus: 27,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 4.62, extraExpPct: 0.278 }
            }
        );
    };
    document.querySelector("#dev2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(980, 1720) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.3, 0.4)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#a855f7;">你散尽灵藏提前落幕：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十一层起史诗级事件：万命轮狱
function dangerEpicMyriadFateWheelEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dem1">逆轮断命（史诗）</button>
            <button id="dem2">闭识护命（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#a855f7;">【史诗级】万命轮狱轰然转动，命纹如锁缠上四肢，下一圈便要把你的道途碾成碎尘。</span>`, choices);
    document.querySelector("#dem1").onclick = function () {
        startDangerEventCombat(
            `你逆轮而战，${enemy.name}踏着命轮中心落下，轮压与杀机在同一瞬间爆发。`,
            null,
            {
                minQuality: 10,
                statMul: 5.98,
                rewardMul: 6.45,
                lvlBonus: 28,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 4.95, extraExpPct: 0.3 }
            }
        );
    };
    document.querySelector("#dem2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.46, 0.56)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.085);
        addDungeonLog(`<span style="color:#a855f7;">你闭识硬扛命轮：气血 <b>-${nFormatter(dmg)}</b>；轮狱残势令秘境敌势永久 <b>+0.085</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十二层起传说级事件：曜日铸冕
function dangerLegendSunforgeCrownEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dls1">擎冕焚劫（传说）</button>
            <button id="dls2">燃寿遁火（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【传说级】曜日铸冕在劫空中缓缓落下，冕焰照处万雾皆焚，你的命火被强行拖入炉心。</span>`, choices);
    document.querySelector("#dls1").onclick = function () {
        startDangerEventCombat(
            `你迎冕而上，${enemy.name}执日冕炎轮坠下，整片秘境像被锻成赤金熔场。`,
            null,
            {
                minQuality: 10,
                statMul: 6.32,
                rewardMul: 6.86,
                lvlBonus: 29,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 5.3, extraExpPct: 0.325 }
            }
        );
    };
    document.querySelector("#dls2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.48, 0.58)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.091);
        addDungeonLog(`<span style="color:#f59e0b;">你燃寿穿炉而退：气血 <b>-${nFormatter(dmg)}</b>；日冕灼痕令秘境敌势永久 <b>+0.091</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十二层起传说级事件：古龙祭坛
function dangerLegendAncientDragonAltarEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dla1">碎坛屠龙（传说）</button>
            <button id="dla2">散宝止祭（重罚避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【传说级】古龙祭坛轰鸣复苏，龙纹锁链缠天而起，祭火已将你的名字刻入龙骨碑。</span>`, choices);
    document.querySelector("#dla1").onclick = function () {
        startDangerEventCombat(
            `你跃入祭坛中心，${enemy.name}挟龙骨威压扑来，嘶吼震得时隙都在崩裂。`,
            null,
            {
                minQuality: 10,
                statMul: 6.66,
                rewardMul: 7.24,
                lvlBonus: 30,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 5.66, extraExpPct: 0.345 }
            }
        );
    };
    document.querySelector("#dla2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(1120, 1940) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.32, 0.42)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#f59e0b;">你散尽灵藏截断祭火：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 十二层起传说级事件：天命渊裁
function dangerLegendHeavenFateAbyssEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dlh1">逆裁破命（传说）</button>
            <button id="dlh2">闭识藏命（重伤避战）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【传说级】天命渊裁自深渊尽头降下，裁纹如链缠身而上，下一息便要定你终局。</span>`, choices);
    document.querySelector("#dlh1").onclick = function () {
        startDangerEventCombat(
            `你逆命而斩，${enemy.name}携渊裁之印现身，压迫感像整座秘境同时坠落。`,
            null,
            {
                minQuality: 10,
                statMul: 7.05,
                rewardMul: 7.7,
                lvlBonus: 31,
                victoryBonus: { enhanceStoneP: 1.0, enchantStoneP: 1.0, extraGoldMul: 6.08, extraExpPct: 0.37 }
            }
        );
    };
    document.querySelector("#dlh2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.5, 0.6)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.098);
        addDungeonLog(`<span style="color:#f59e0b;">你闭识硬抗渊裁：气血 <b>-${nFormatter(dmg)}</b>；命裁残势令秘境敌势永久 <b>+0.098</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 第三层起陷阱类危险：断索悬桥
function dangerTrapWireBridgeEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dtw1">踏索迎击守桥傀</button>
            <button id="dtw2">抓索硬闯（可能坠伤）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【陷阱】雾中悬桥只剩几根腐索，桥下是吞灵暗渊，索上隐有傀儡巡弋。</span>`, choices);
    document.querySelector("#dtw1").onclick = function () {
        startDangerEventCombat(
            `你踏索而上，${enemy.name}自索影中拧身扑来，铁爪专抠人踝。`,
            null,
            { minQuality: 6, statMul: 1.26, rewardMul: 1.14, lvlBonus: 1 }
        );
    };
    document.querySelector("#dtw2").onclick = function () {
        if (randomizeNum(1, 100) <= 48) {
            addDungeonLog(`<span style="color:#f59e0b;">你借风势荡过断口，索上机关竟未完全触发。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.1)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#f59e0b;">索断人坠，你在渊边擦石止住：气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 第三层起陷阱类危险：连环踏符
function dangerTrapGlyphFloorEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dtg1">踏罡拆符</button>
            <button id="dtg2">撒灵石诱爆（破财）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【陷阱】地面符纹层层嵌套，下一步若踏错，整段甬道都会连环起爆。</span>`, choices);
    document.querySelector("#dtg1").onclick = function () {
        startDangerEventCombat(
            `你罡步拆符，${enemy.name}从符火里凝形，专噬踏符者的气机。`,
            null,
            { minQuality: 6, statMul: 1.28, rewardMul: 1.16, lvlBonus: 1 }
        );
    };
    document.querySelector("#dtg2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(22, 55) * floor)));
        player.gold = Math.max(0, player.gold - loss);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.004);
        addDungeonLog(`<span style="color:#f59e0b;">你以灵石诱偏符火：损失 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}；余焰渗入地脉，秘境敌势 <b>+0.004</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 第三层起陷阱类危险：孢子毒瘴
function dangerTrapSporeMistEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dts1">斩瘴源兽</button>
            <button id="dts2">闭气穿行</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【陷阱】壁孔喷出荧绿孢子雾，吸一口便如万蚁噬肺，深处似有活物鼓动瘴心。</span>`, choices);
    document.querySelector("#dts1").onclick = function () {
        startDangerEventCombat(
            `你劈开瘴幕，${enemy.name}拖着菌丝扑来，孢子随它呼吸爆开。`,
            null,
            { minQuality: 6, statMul: 1.24, rewardMul: 1.15, lvlBonus: 1 }
        );
    };
    document.querySelector("#dts2").onclick = function () {
        if (randomizeNum(1, 100) <= 44) {
            addDungeonLog(`<span style="color:#f59e0b;">你闭气穿行，孢子未及入肺便从衣缝滑落。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.11)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#f59e0b;">闭气差半息，孢子入骨：气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 第三层起陷阱类危险：沉石落阱
function dangerTrapSinkStoneEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dtk1">顶石破阱</button>
            <button id="dtk2">弃物垫脚（损财）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【陷阱】脚下石板无声下陷，千斤沉石正从顶缝坠压，四周墙内机括咔咔作响。</span>`, choices);
    document.querySelector("#dtk1").onclick = function () {
        startDangerEventCombat(
            `你顶石腾挪，${enemy.name}借机括之力砸落，石屑如刃。`,
            null,
            { minQuality: 7, statMul: 1.3, rewardMul: 1.17, lvlBonus: 1 }
        );
    };
    document.querySelector("#dtk2").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(30, 72) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.025, 0.055)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span style="color:#f59e0b;">你弃袋中灵物垫住机括才脱身：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 第三层起陷阱类危险：镜廊借影
function dangerTrapMirrorHallEvent() {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dtm1">碎镜斩影</button>
            <button id="dtm2">借镜匿踪（留后患）</button>
        </div>`;
    addDungeonLog(`<span style="color:#f59e0b;">【陷阱】廊壁尽是古镜，镜中你的影子先你一步回头，嘴角弧度与你并不相同。</span>`, choices);
    document.querySelector("#dtm1").onclick = function () {
        startDangerEventCombat(
            `你碎镜斩影，${enemy.name}从万千碎片里同时踏出，每一步都踩在镜光上。`,
            null,
            { minQuality: 7, statMul: 1.32, rewardMul: 1.19, lvlBonus: 2 }
        );
    };
    document.querySelector("#dtm2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.035, 0.075)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.007);
        addDungeonLog(`<span style="color:#f59e0b;">你借镜匿踪，真身被镜光擦伤：气血 <b>-${nFormatter(dmg)}</b>；镜劫未绝，秘境敌势 <b>+0.007</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// Chest event randomizer
const chestEvent = () => {
    let eventRoll = randomizeNum(1, 4);
    if (eventRoll == 1) {
        mimicBattle("chest");
    } else if (eventRoll == 2) {
        goldDrop();
        if (dungeon.progress.floor > 1) {
            addDungeonLog(`<span class="Common">灵匣不直落整件遗器，灵机已折入灵石洪流。</span>`);
        }
        dungeon.status.event = false;
    } else if (eventRoll == 3) {
        goldDrop();
        dungeon.status.event = false;
    } else {
        addDungeonLog("遗匣空空，唯余尘埃。");
        dungeon.status.event = false;
    }
}

// Calculates Gold Drop
const goldDrop = () => {
    let goldValue = applyGoldGainMult(randomizeNum(50, 500) * dungeon.progress.floor);
    var g = nFormatter(goldValue);
    var coin = `<i class="fas fa-coins" style="color: #FFD700;"></i>${g}`;
    var openers = [
        `你俯身拾起灵石，入手 ${coin} 枚，微温尚存。`,
        `石缝间滚出灵石，你拢入袖中——共 ${coin} 枚。`,
        `枯尘下露出灵石微光，你拂去浮土，尽数收起 ${coin} 枚。`,
        `灵机一引，散落的灵石自行聚到你掌心：${coin} 枚。`,
        `你以靴尖轻磕地面，灵石跃起，恰 ${coin} 枚落袋。`,
        `前人遗匣已空，匣底却嵌着灵石碎屑，你抠净亦有 ${coin} 枚。`,
        `你拾得 ${coin} 枚灵石。`
    ];
    addDungeonLog(openers[Math.floor(Math.random() * openers.length)]);
    var extras = [
        "灵石入手，亦是一份因果——花得明白，才不算浪费修为。",
        "你掂了掂分量，暗道此层劫数虽凶，资粮倒也未绝。",
        "灵石相撞，轻响如佩玉——你心头略宽一线。",
        "拾取时指尖微麻，似此间法则在提醒你：莫贪无度。",
        "你将灵石与旧伤一并记入心底：来日丹符，皆由此出。"
    ];
    if (Math.random() < 0.32) {
        addDungeonLog(extras[Math.floor(Math.random() * extras.length)]);
    }
    player.gold += goldValue;
    playerLoadStats();
}

/** 无选项叙事：若不短暂占用 event 态，秘境定时器会每秒再掷骰，dungeon.action 狂涨；>5 后主池只剩 nextroom，缚咒/苦劫/高危等带敌势机缘几乎绝迹。 */
function pulseDungeonPassiveEventGate() {
    try {
        if (!dungeon || !dungeon.status) return;
        dungeon.status.event = true;
        setTimeout(function () {
            try {
                if (dungeon && dungeon.status) dungeon.status.event = false;
            } catch (e1) {}
            try {
                if (typeof updateDungeonLog === "function") updateDungeonLog();
            } catch (e2) {}
        }, 1050);
    } catch (e) {}
}

// Non choices dungeon event messages
const nothingEvent = () => {
    let eventRoll = randomizeNum(1, 14);
    if (eventRoll <= 5 && typeof pickRandomIdleQuote === "function") {
        addDungeonLog(pickRandomIdleQuote());
    } else if (typeof pickXiuxianQuote === "function" && eventRoll >= 6 && eventRoll <= 11 && Math.random() < 0.48) {
        addDungeonLog(pickXiuxianQuote("dungeon_ambient"));
    } else {
        var staticLines = [
            "秘境寂静，唯风声穿隙",
            "一口空遗匣，曾被洗劫一空",
            "一具妖物的残骸横陈路旁",
            "无名旅者的枯骨半掩于尘土",
            "此域空茫，连回声都稀薄",
            "远处似有钟鸣，入耳却无声——你知是心境所化。",
            "落叶无根，随风打旋；你驻足片刻，想起师门旧话。",
            "石灯笼无火，你却觉额前微热，像有人远远看了你一眼。",
            "雾墙退去三寸又合拢，仿佛此界在试探你是否心急。"
        ];
        addDungeonLog(staticLines[Math.floor(Math.random() * staticLines.length)]);
    }
    pulseDungeonPassiveEventGate();
}

/** 温馨奇遇共用：劫间柔光片刻，秘境敌势略退（单次基础 0.002–0.004，再乘 DUNGEON_ENEMY_SCALING_LOSS_MULT；下限 1.02）。introHtml 可含多段品质色 / 附魔光晕 span。warmEaseEventId 传入则本层记为已触发。 */
function warmEaseNarrativeHtml(introHtml, warmEaseEventId) {
    var before = dungeon.settings.enemyScaling;
    var delta = applyDungeonEnemyScalingLoss(randomizeDecimal(0.002, 0.004));
    dungeon.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, dungeon.settings.enemyScaling - delta);
    var after = dungeon.settings.enemyScaling;
    var actual = Math.round((before - after) * 1000) / 1000;
    var tail =
        actual >= 0.001
            ? `<span class="Etherbound">秘境敌势 -${actual.toFixed(3)}</span>（系数现为 <b>${after.toFixed(2)}</b>）。`
            : `<span class="Rare">敌势已在容许的低位徘徊</span>，这份暖意仍轻轻托了你一把。`;
    addDungeonLog(introHtml + tail);
    if (typeof warmEaseEventId === "string" && isWarmEaseEventId(warmEaseEventId)) {
        markWarmEaseUsedThisFloor(warmEaseEventId);
    }
    playerLoadStats();
    if (typeof saveData === "function") saveData();
    pulseDungeonPassiveEventGate();
}

function scheduleDeferredEvent(payload) {
    if (!dungeon || !dungeon.settings) return;
    dungeon.settings.deferredEvent = payload && typeof payload === "object" ? payload : null;
}

function tryResolveDeferredEvent() {
    if (!dungeon || !dungeon.settings || !dungeon.settings.deferredEvent) return false;
    var p = dungeon.settings.deferredEvent;
    if (typeof p.dueRoom !== "number") {
        dungeon.settings.deferredEvent = null;
        return false;
    }
    if (dungeon.progress.room < p.dueRoom) return false;
    dungeon.settings.deferredEvent = null;
    if (p.kind === "debt") {
        fateLedgerDebtSettleEvent(p);
    } else if (p.kind === "boon") {
        fateLedgerBoonClaimEvent(p);
    } else if (p.kind === "factionChain") {
        factionChainEvent(p);
    } else if (p.kind === "doomChain") {
        doomChainStageEvent(p);
    } else if (p.kind === "abyssChain") {
        abyssChainStageEvent(p);
    } else if (p.kind === "skyChain") {
        skyChainStageEvent(p);
    } else if (p.kind === "rageChain") {
        rageChainStageEvent(p);
    } else if (p.kind === "qingmingChain") {
        qingmingChainStageEvent(p);
    } else if (p.kind === "bondSoulChain") {
        bondSoulChainStageEvent(p);
    } else {
        return false;
    }
    return true;
}

function pickLedgerOmenLine(weight, phase) {
    if (weight >= 2) {
        return phase === "due"
            ? "账页边缘的红痕已淡，像是愿意与你讲理。"
            : "铜页温热不烫，墨线流转得很顺。";
    }
    if (weight >= 0) {
        return phase === "due"
            ? "账页翻动不快不慢，像在等你自己开口。"
            : "墨迹时浓时淡，吉凶尚未定形。";
    }
    return phase === "due"
        ? "红字沿页脊渗开，像刚磨过刀。"
        : "铜页发冷，指尖有轻微刺痛。";
}

function getEventMemoryBias(key) {
    if (!dungeon || !dungeon.settings || !dungeon.settings.eventMemory) return 0;
    var v = dungeon.settings.eventMemory[key];
    if (typeof v !== "number" || isNaN(v)) return 0;
    return Math.max(-6, Math.min(6, v));
}

function rememberEventChoice(key, delta) {
    if (!dungeon || !dungeon.settings) return;
    if (!dungeon.settings.eventMemory || typeof dungeon.settings.eventMemory !== "object") {
        dungeon.settings.eventMemory = { faction: 0, ledger: 0 };
    }
    var curr = getEventMemoryBias(key);
    var next = curr + (typeof delta === "number" ? delta : 0);
    dungeon.settings.eventMemory[key] = Math.max(-6, Math.min(6, next));
}

function maybeEmitMemoryEcho(key, force) {
    var bias = getEventMemoryBias(key);
    var chance = force ? 1 : 0.22;
    if (Math.abs(bias) >= 4) chance += 0.18;
    else if (Math.abs(bias) >= 2) chance += 0.1;
    if (Math.random() > Math.min(0.72, chance)) return;
    var lines;
    if (key === "faction") {
        if (bias >= 3) {
            lines = [
                "雾中旗影向你微微低首，像在认人。",
                "某处骨铃轻响三声，像是旧盟在替你开路。"
            ];
        } else if (bias <= -3) {
            lines = [
                "雾里传来短促冷笑，像有人在翻你旧账。",
                "旗影掠过时忽然收卷，像不愿沾你的气。"
            ];
        } else {
            lines = [
                "雾幕无言，只把你的脚步记在石上。",
                "风从两旗间穿过，未褒未贬。"
            ];
        }
    } else {
        if (bias >= 3) {
            lines = [
                "账页边角微暖，墨线像在替你留白。",
                "铜页轻颤一瞬，像默许你这次的取舍。"
            ];
        } else if (bias <= -3) {
            lines = [
                "账页红痕更深了一寸，像是悄悄加了批注。",
                "你还未抬手，铜页已先发出一声冷响。"
            ];
        } else {
            lines = [
                "账页翻过半寸又停，像在观望你下一步。",
                "铜页无光，只有指腹上的凉意还在。"
            ];
        }
    }
    addDungeonLog(`<span class="Common">${lines[Math.floor(Math.random() * lines.length)]}</span>`);
}

// 连锁奇遇：先结契，后追偿/回响，避免“无脑点一下就走”
const fateLedgerEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    maybeEmitMemoryEcho("ledger", false);
    var floor = Math.max(1, dungeon.progress.floor);
    var invest = applyGoldGainMult(randomizeNum(36, 96) * floor);
    var gain = applyGoldGainMult(randomizeNum(84, 200) * floor);
    var dueIn = randomizeNum(2, 4);
    var dueRoom = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + dueIn);
    var hiddenLuck = randomizeNum(-1, 1);
    var ledgerBias = getEventMemoryBias("ledger");
    if (Math.random() < Math.min(0.55, Math.abs(ledgerBias) * 0.08)) {
        hiddenLuck += ledgerBias > 0 ? 1 : -1;
    }
    hiddenLuck = Math.max(-2, Math.min(2, hiddenLuck));
    const choices = `
        <div class="decision-panel">
            <button id="choice1">借势先赚（后续追偿）</button>
            <button id="choice2">押注蓄福（延后兑奖）</button>
            <button id="choice3">按兵不动</button>
        </div>`;
    addDungeonLog(`<span class="Legendary">雾中浮出一卷青铜账页：『可先取，必后算。』你可立刻得势，也可押后取福。</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        rememberEventChoice("ledger", 1);
        var expGain = rollDungeonExpFloorRewardAmount();
        player.gold += gain;
        var expAddedLedger1 = false;
        if (expGain > 0) {
            expAddedLedger1 = dongtianDungeonPlayerExpAddBase(expGain);
            if (expAddedLedger1) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expGain * ps)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
        }
        scheduleDeferredEvent({
            source: "fateLedger",
            kind: "debt",
            dueRoom: dueRoom,
            debtGold: Math.max(1, Math.floor(gain * randomizeDecimal(0.68, 0.88))),
            debtHpPct: randomizeDecimal(0.12, 0.19),
            debtScale: randomizeDecimal(0.016, 0.028),
            hiddenCredit: 1,
            hiddenBurden: 1,
            hiddenLuck: hiddenLuck,
        });
        addDungeonLog(
            `你先取了天平上的重砝码：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gain)}` +
                (expGain > 0
                    ? expAddedLedger1
                        ? `，感悟 <b>+${nFormatter(expGain)}</b>`
                        : dongtianDungeonPlayerExpMissedGainHintZh(expGain, false)
                    : "") +
                `。账页注明：约在 <b>${dueIn}</b> 劫后结算。`
        );
        addDungeonLog(pickLedgerOmenLine(1 - 1 + hiddenLuck, "gain"));
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#choice2").onclick = function () {
        rememberEventChoice("ledger", 0.6);
        if (player.gold < invest) {
            addDungeonLog(`灵石不足，无法押注（需 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(invest)}）。`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= invest;
        scheduleDeferredEvent({
            source: "fateLedger",
            kind: "boon",
            dueRoom: dueRoom,
            invested: invest,
            boonExpPct: randomizeDecimal(0.01, 0.05),
            boonGoldMul: randomizeDecimal(1.35, 1.95),
            hiddenCredit: 2,
            hiddenBurden: 0,
            hiddenLuck: hiddenLuck,
        });
        addDungeonLog(`你把 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(invest)} 压在账页角，账页回卷成印：约在 <b>${dueIn}</b> 劫后可兑奖。`);
        addDungeonLog(pickLedgerOmenLine(2 + hiddenLuck, "gain"));
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("ledger", -0.4);
        addDungeonLog("你没有在因果账页上落笔。稳，也是一种赢法。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

const fateLedgerDebtSettleEvent = (p) => {
    dungeon.status.event = true;
    maybeEmitMemoryEcho("ledger", false);
    var dueGold = Math.max(1, Math.floor(p.debtGold || 0));
    var hpPct = typeof p.debtHpPct === "number" ? p.debtHpPct : 0.15;
    var hpCost = Math.max(1, Math.round(player.stats.hpMax * hpPct));
    var scaleUp = typeof p.debtScale === "number" ? p.debtScale : 0.02;
    var credit = typeof p.hiddenCredit === "number" ? p.hiddenCredit : 0;
    var burden = typeof p.hiddenBurden === "number" ? p.hiddenBurden : 1;
    var luck = typeof p.hiddenLuck === "number" ? p.hiddenLuck : 0;
    var score = credit - burden + luck;
    const choices = `
        <div class="decision-panel">
            <button id="choice1">以灵石清账</button>
            <button id="choice2">以气血抵账</button>
            <button id="choice3">强行赖账</button>
        </div>`;
    // 保持同一次渲染中的决策面板不被后续日志刷新掉。
    addDungeonLog(`<span class="Heirloom">青铜账页自行翻开，红字浮现：『到期结算。』 ${pickLedgerOmenLine(score, "due")}</span>`, choices);
    document.querySelector("#choice1").onclick = function () {
        if (player.gold < dueGold) {
            addDungeonLog("灵石不足，账页不认空口。");
            return;
        }
        rememberEventChoice("ledger", 0.4);
        player.gold -= dueGold;
        addDungeonLog(`你以灵石清账，红字尽褪：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(dueGold)}。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        rememberEventChoice("ledger", 0.1);
        player.stats.hp = Math.max(1, player.stats.hp - hpCost);
        addDungeonLog(`你以血代偿，账页卷起。气血 <b>-${nFormatter(hpCost)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("ledger", -0.9);
        const scaledUp = scaleUp * 0.648;
        const scaledUpGain = applyDungeonEnemyScalingGain(scaledUp);
        dungeon.settings.enemyScaling += scaledUpGain;
        addDungeonLog(`<span class="Common">你撕页赖账，因果反噬入骨。</span> 秘境敌势永久 <b>+${scaledUpGain.toFixed(3)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
};

const fateLedgerBoonClaimEvent = (p) => {
    dungeon.status.event = true;
    maybeEmitMemoryEcho("ledger", false);
    var invested = Math.max(1, Math.floor(p.invested || 1));
    var goldBack = Math.max(1, Math.floor(invested * (typeof p.boonGoldMul === "number" ? p.boonGoldMul : 1.5)));
    var credit = typeof p.hiddenCredit === "number" ? p.hiddenCredit : 1;
    var burden = typeof p.hiddenBurden === "number" ? p.hiddenBurden : 0;
    var luck = typeof p.hiddenLuck === "number" ? p.hiddenLuck : 0;
    var score = credit - burden + luck;
    if (score < 0) {
        goldBack = Math.max(1, Math.floor(goldBack * 0.82));
    } else if (score >= 2) {
        goldBack = Math.max(1, Math.floor(goldBack * 1.08));
    }
    const choices = `
        <div class="decision-panel">
            <button id="choice1">兑付灵石</button>
            <button id="choice2">兑付感悟</button>
            <button id="choice3">折半双收</button>
        </div>`;
    // 保持同一次渲染中的决策面板不被后续日志刷新掉。
    addDungeonLog(`<span class="StellarSign">账页回响如钟：『押注到期。取其一，或两边都浅尝。』 ${pickLedgerOmenLine(score, "due")}</span>`, choices);
    document.querySelector("#choice1").onclick = function () {
        rememberEventChoice("ledger", 0.5);
        player.gold += goldBack;
        addDungeonLog(`你取回兑付灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(goldBack)}。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        rememberEventChoice("ledger", 0.5);
        var expGain = rollDungeonExpFloorRewardAmount();
        if (expGain > 0 && score < 0) expGain = Math.max(1, Math.floor(expGain * 0.84));
        else if (expGain > 0 && score >= 2) expGain = Math.max(1, Math.floor(expGain * 1.06));
        var expAddedLedger2 = false;
        if (expGain > 0) {
            expAddedLedger2 = dongtianDungeonPlayerExpAddBase(expGain);
            if (expAddedLedger2) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expGain * ps)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
        }
        if (expGain > 0) {
            if (expAddedLedger2) {
                addDungeonLog(`你把兑付换成心境突破：感悟 <b>+${nFormatter(expGain)}</b>。`);
            } else {
                var hintL2 = dongtianDungeonPlayerExpMissedGainHintZh(expGain, false);
                if (hintL2) addDungeonLog(`你把兑付换成心境突破：${hintL2}`);
            }
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("ledger", 0.2);
        var g = Math.max(1, Math.floor(goldBack * 0.54));
        var expGain = rollDungeonExpFloorRewardAmount();
        if (expGain > 0 && score < 0) expGain = Math.max(1, Math.floor(expGain * 0.84));
        else if (expGain > 0 && score >= 2) expGain = Math.max(1, Math.floor(expGain * 1.06));
        var e = expGain > 0 ? Math.max(1, Math.floor(expGain * 0.56)) : 0;
        player.gold += g;
        var expAddedLedger3 = false;
        if (e > 0) {
            expAddedLedger3 = dongtianDungeonPlayerExpAddBase(e);
            if (expAddedLedger3) {
                if (typeof addPetExp === "function") {
                    var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(e * ps2)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
        }
        addDungeonLog(
            `你选择折半：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}` +
                (e > 0
                    ? expAddedLedger3
                        ? `，感悟 <b>+${nFormatter(e)}</b>`
                        : dongtianDungeonPlayerExpMissedGainHintZh(e, false)
                    : "") +
                `。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
};

// 三连锁阵营事件：立誓 -> 中段试炼 -> 终局结算
const factionOathEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    maybeEmitMemoryEcho("faction", false);
    var floor = Math.max(1, dungeon.progress.floor);
    var dueRoom = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(2, 3));
    var factionBias = getEventMemoryBias("faction");
    const choices = `
        <div class="decision-panel">
            <button id="choice1">立誓苍刃盟（偏进攻）</button>
            <button id="choice2">立誓玄医坊（偏续航）</button>
            <button id="choice3">不立誓，独行</button>
        </div>`;
    addDungeonLog(`<span class="Heirloom">雾中两面旧旗同时垂落：苍刃盟与玄医坊都在招手。签下名字，因果会跟你走完三程。</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        rememberEventChoice("faction", 0.6);
        player.bonusStats.atk += 1.2;
        scheduleDeferredEvent({
            kind: "factionChain",
            stage: 2,
            faction: "blade",
            hiddenTrust: 1,
            hiddenDebt: 0,
            hiddenTemper: Math.max(-2, Math.min(2, randomizeNum(-1, 1) + (factionBias >= 2 ? 1 : 0))),
            dueRoom: dueRoom,
            floorSeed: floor,
        });
        addDungeonLog(`你在苍刃旗上按下掌印：<span class="Legendary">力道 +1.2%</span>（立即）。盟约将在后续劫数追上你。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        rememberEventChoice("faction", 0.6);
        const heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.18)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        player.bonusStats.vamp += 0.8;
        scheduleDeferredEvent({
            kind: "factionChain",
            stage: 2,
            faction: "medic",
            hiddenTrust: 1,
            hiddenDebt: 0,
            hiddenTemper: Math.max(-2, Math.min(2, randomizeNum(-1, 1) + (factionBias >= 2 ? 1 : 0))),
            dueRoom: dueRoom,
            floorSeed: floor,
        });
        addDungeonLog(`你收下玄医坊药签：气血 <b>+${nFormatter(heal)}</b>，<span class="Legendary">吸血 +0.8%</span>（立即）。代价会在后程显形。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("faction", -0.6);
        addDungeonLog("你向两旗拱手而过。雾里有人笑：『独行也要交路税。』");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

function factionChainEvent(p) {
    if (!p || typeof p.stage !== "number") {
        nothingEvent();
        return;
    }
    if (p.stage === 2) {
        factionChainStageTwoEvent(p);
    } else if (p.stage === 3) {
        factionChainStageThreeEvent(p);
    } else {
        nothingEvent();
    }
}

function pickFactionOmenLine(score, faction, phase) {
    var blade = faction === "blade";
    if (score >= 2) {
        if (phase === 2) return blade ? "苍刃旗角泛起温热金芒，像在默许你的手段。" : "药旗边缘浮起一圈柔光，像有人在暗处点头。";
        return blade ? "苍刃旧旗猎猎而响，旗面血纹竟向你让开半步。" : "玄医坊旗穗垂顺不乱，药香里带着一种罕见的安静。";
    }
    if (score >= 0) {
        if (phase === 2) return blade ? "苍刃旗影未明未暗，只留下一声短促金鸣。" : "药旗轻晃，既不亲近也不疏远。";
        return blade ? "旗面无风自颤，像在衡量你是否配得上这份回报。" : "药签在雾里缓慢旋转，像在等最后一句判词。";
    }
    if (phase === 2) return blade ? "苍刃旗角沉黑如铁，鞘鸣里藏着不耐。" : "药旗上的纹路微微倒卷，像是在收回信任。";
    return blade ? "苍刃旗忽然无声，像刀背贴上你的后颈。" : "药香骤淡，只剩苦味在喉间打转。";
}

function factionChainStageTwoEvent(p) {
    dungeon.status.event = true;
    maybeEmitMemoryEcho("faction", false);
    var floor = Math.max(1, dungeon.progress.floor);
    var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(2, 3));
    var isBlade = p.faction === "blade";
    var trust = typeof p.hiddenTrust === "number" ? p.hiddenTrust : 0;
    var debt = typeof p.hiddenDebt === "number" ? p.hiddenDebt : 0;
    var temper = typeof p.hiddenTemper === "number" ? p.hiddenTemper : 0;
    var cost = applyGoldGainMult(randomizeNum(28, 86) * floor);
    var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.14)));
    var goldAid = applyGoldGainMult(randomizeNum(60, 160) * floor);
    const choices = `
        <div class="decision-panel">
            <button id="choice1">${isBlade ? "接下斩首令（高风险）" : "接下救援令（稳中求胜）"}</button>
            <button id="choice2">缴纳路税（稳妥）</button>
            <button id="choice3">拒绝号令</button>
        </div>`;
    addDungeonLog(
        isBlade
            ? `<span class="Chronarch">苍刃盟信使拦路：『盟约到第二程，接令见血，或交税保过。』</span>`
            : `<span class="StellarSign">玄医坊药童追上你：『第二程需试心——救人、缴税、或拒令。』</span>`,
        choices
    );
    document.querySelector("#choice1").onclick = function () {
        if (isBlade) {
            if (Math.random() < 0.52) {
                rememberEventChoice("faction", 0.5);
                player.gold += goldAid;
                trust += 1;
                addDungeonLog(`你带血归来，苍刃盟赏银 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(goldAid)}。`);
            } else {
                rememberEventChoice("faction", -0.5);
                player.stats.hp = Math.max(1, player.stats.hp - dmg);
                trust -= 1;
                debt += 1;
                addDungeonLog(`斩首失手反被追刀：气血 <b>-${nFormatter(dmg)}</b>。`);
            }
        } else {
            rememberEventChoice("faction", 0.4);
            const heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.16)));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            player.gold += Math.floor(goldAid * 0.52);
            trust += 1;
            addDungeonLog(`你护送药使突围：气血 <b>+${nFormatter(heal)}</b>，并获路酬 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(Math.floor(goldAid * 0.52))}。`);
        }
        var scoreNow = trust - debt + temper;
        addDungeonLog(pickFactionOmenLine(scoreNow, p.faction, 2));
        scheduleDeferredEvent({
            kind: "factionChain",
            stage: 3,
            faction: p.faction,
            hiddenTrust: trust,
            hiddenDebt: debt,
            hiddenTemper: temper,
            dueRoom: nextDue,
            floorSeed: p.floorSeed || floor
        });
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        if (player.gold < cost) {
            rememberEventChoice("faction", -0.4);
            addDungeonLog(`灵石不足（需 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(cost)}），只能硬吃一记催命符。`);
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            trust -= 1;
            debt += 1;
        } else {
            rememberEventChoice("faction", 0.1);
            player.gold -= cost;
            addDungeonLog(`你缴了路税 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(cost)}，这程得过且过。`);
        }
        var scoreNow2 = trust - debt + temper;
        addDungeonLog(pickFactionOmenLine(scoreNow2, p.faction, 2));
        scheduleDeferredEvent({
            kind: "factionChain",
            stage: 3,
            faction: p.faction,
            hiddenTrust: trust,
            hiddenDebt: debt,
            hiddenTemper: temper,
            dueRoom: nextDue,
            floorSeed: p.floorSeed || floor
        });
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("faction", -0.9);
        trust -= 2;
        debt += 1;
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.008);
        addDungeonLog(`你当场拒令。两方都记你一笔：秘境敌势永久 <b>+0.008</b>。`);
        var scoreNow3 = trust - debt + temper;
        addDungeonLog(pickFactionOmenLine(scoreNow3, p.faction, 2));
        scheduleDeferredEvent({
            kind: "factionChain",
            stage: 3,
            faction: p.faction,
            hiddenTrust: trust,
            hiddenDebt: debt,
            hiddenTemper: temper,
            dueRoom: nextDue,
            floorSeed: p.floorSeed || floor
        });
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
}

function factionChainStageThreeEvent(p) {
    dungeon.status.event = true;
    maybeEmitMemoryEcho("faction", true);
    var trust = typeof p.hiddenTrust === "number" ? p.hiddenTrust : 0;
    var debt = typeof p.hiddenDebt === "number" ? p.hiddenDebt : 0;
    var temper = typeof p.hiddenTemper === "number" ? p.hiddenTemper : 0;
    var hiddenScore = trust - debt + temper;
    var floor = Math.max(1, dungeon.progress.floor);
    const choices = `
        <div class="decision-panel">
            <button id="choice1">领受结算</button>
            <button id="choice2">折算保底</button>
            <button id="choice3">当场翻脸</button>
        </div>`;
    // 保持同一次渲染中的决策面板不被后续日志刷新掉。
    addDungeonLog(`<span class="Apexother">第三程已至。两面旧旗在雾里并立，催你给这笔盟约一个结尾。 ${pickFactionOmenLine(hiddenScore, p.faction, 3)}</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        rememberEventChoice("faction", hiddenScore >= 2 ? 0.8 : hiddenScore >= 0 ? 0.2 : -0.3);
        if (hiddenScore >= 2) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const gold = applyGoldGainMult(randomizeNum(110, 260) * floor);
            player.gold += gold;
            const expAddedFaction = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedFaction) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * ps)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
            addDungeonLog(
                `你三程无亏，盟约兑现：` +
                    (expAmt > 0
                        ? expAddedFaction
                            ? `感悟 <b>+${nFormatter(expAmt)}</b>，`
                            : dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "，"
                        : "") +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`
            );
        } else if (hiddenScore >= 0) {
            const gold2 = applyGoldGainMult(randomizeNum(48, 140) * floor);
            player.gold += gold2;
            addDungeonLog(`盟约勉强过线，只结算半赏：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold2)}。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.16, 0.26)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.013);
            addDungeonLog(`你前程失信，终局追责：气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.013</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        rememberEventChoice("faction", 0.15);
        const gold = applyGoldGainMult(randomizeNum(28, 92) * floor);
        player.gold += gold;
        addDungeonLog(`你选择保底离场，落袋 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("faction", -1);
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.18)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.017);
        addDungeonLog(`你翻脸毁约，雾中杀意立起：气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.017</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
}

// 连锁高危战斗：三段劫战（越打越强）
const doomChainEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="dc1">接下追命劫令（三段）</button>
            <button id="dc2">拒接，立刻退避</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">雾天尽头传来三声钟裂，劫令坠地：『一劫追身，二劫追命，三劫夺道。』</span>`, choices);
    document.querySelector("#dc1").onclick = function () {
        var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
        scheduleDeferredEvent({ kind: "doomChain", stage: 2, dueRoom: nextDue, chainWins: 0 });
        addDungeonLog("你接令起誓。第一道杀机尚未消散，第二道已在雾后候你。");
        startDangerEventCombat(
            `你先发制人，${enemy.name}携劫纹杀到，兵锋撞出满地火星。`,
            null,
            {
                minQuality: 9,
                statMul: 2.06,
                rewardMul: 2.02,
                lvlBonus: 5,
                victoryBonus: { enhanceStoneP: 0.52, enchantStoneP: 0.34, extraGoldMul: 1.28, extraExpPct: 0.04 }
            }
        );
    };
    document.querySelector("#dc2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.16)));
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.013);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span class="Common">你拒接劫令，余威仍及：气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.013</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
};

function doomChainStageEvent(p) {
    if (!p || typeof p.stage !== "number") return;
    if (p.stage === 2) doomChainStageTwoEvent(p);
    else if (p.stage === 3) doomChainStageThreeEvent(p);
}

function doomChainStageTwoEvent(p) {
    dungeon.status.event = true;
    var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="dc21">再战第二劫</button>
            <button id="dc22">断尾脱战（重罚）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【连锁劫战·第二劫】雾里军鼓再起，追命者已封住退路。</span>`, choices);
    document.querySelector("#dc21").onclick = function () {
        scheduleDeferredEvent({ kind: "doomChain", stage: 3, dueRoom: nextDue, chainWins: wins + 1 });
        addDungeonLog("你没有停步，第三劫已在前方点亮。");
        startDangerEventCombat(
            `你硬撕第二道杀阵，${enemy.name}踏尸而来，气势已过先前。`,
            null,
            {
                minQuality: 10,
                statMul: 2.32,
                rewardMul: 2.24,
                lvlBonus: 6,
                victoryBonus: { enhanceStoneP: 0.6, enchantStoneP: 0.44, extraGoldMul: 1.52, extraExpPct: 0.055 }
            }
        );
    };
    document.querySelector("#dc22").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(220, 480) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.16, 0.24)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.018);
        addDungeonLog(`<span style="color:#ff4d4f;">你割舍战利才挣出一线生机：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.018</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

function doomChainStageThreeEvent(p) {
    dungeon.status.event = true;
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="dc31">死战终劫（极难）</button>
            <button id="dc32">缴命买路（终止）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【连锁劫战·终劫】第三声钟裂落下，夺道者亲临。你若不斩，后路尽熄。</span>`, choices);
    document.querySelector("#dc31").onclick = function () {
        startDangerEventCombat(
            `你提气迎上终劫，${enemy.name}挟万钧威压坠场，空间像被捏成薄纸。`,
            null,
            {
                minQuality: 10,
                statMul: 2.62,
                rewardMul: 2.56 + Math.min(0.22, wins * 0.06),
                lvlBonus: 7,
                victoryBonus: {
                    enhanceStoneP: 0.72,
                    enchantStoneP: 0.56,
                    extraGoldMul: 1.85,
                    extraExpPct: 0.082,
                    titleBuff: { id: "doom_chain", name: "追命断劫者", atkMul: 1.11, dmgTakenMul: 0.93 }
                }
            }
        );
    };
    document.querySelector("#dc32").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(320, 720) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.22, 0.34)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.023);
        addDungeonLog(`<span style="color:#ff4d4f;">你以命与财买路，才从终劫下活退：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.023</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 连锁高危战斗线（二）：深渊祭步（3 段）
const abyssChainEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="ac1">踏入深渊祭步（三段）</button>
            <button id="ac2">封印裂口离开</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">渊底祭钟鸣三响，石阶自黑雾中升起。每踏一阶，便要以命换路。</span>`, choices);
    document.querySelector("#ac1").onclick = function () {
        var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
        scheduleDeferredEvent({ kind: "abyssChain", stage: 2, dueRoom: nextDue, chainWins: 0 });
        startDangerEventCombat(
            `你第一步踏稳，${enemy.name}自祭火里显形，杀意像潮水压来。`,
            null,
            {
                minQuality: 10,
                statMul: 2.18,
                rewardMul: 2.18,
                lvlBonus: 6,
                victoryBonus: { enhanceStoneP: 0.58, enchantStoneP: 0.4, extraGoldMul: 1.42, extraExpPct: 0.05 }
            }
        );
    };
    document.querySelector("#ac2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.2)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.016);
        addDungeonLog(`<span class="Common">你强封裂口仍遭反震：气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.016</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
};

function abyssChainStageEvent(p) {
    if (!p || typeof p.stage !== "number") return;
    if (p.stage === 2) abyssChainStageTwoEvent(p);
    else if (p.stage === 3) abyssChainStageThreeEvent(p);
}

function abyssChainStageTwoEvent(p) {
    dungeon.status.event = true;
    var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="ac21">踏第二阶（再战）</button>
            <button id="ac22">献血退阶（重罚）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【深渊祭步·第二阶】地缝吐出黑焰，祭骨围成杀圈。</span>`, choices);
    document.querySelector("#ac21").onclick = function () {
        scheduleDeferredEvent({ kind: "abyssChain", stage: 3, dueRoom: nextDue, chainWins: wins + 1 });
        startDangerEventCombat(
            `你踏上第二阶，${enemy.name}挥动祭骨重刃，震得空气发出裂鸣。`,
            null,
            {
                minQuality: 10,
                statMul: 2.44,
                rewardMul: 2.36,
                lvlBonus: 7,
                victoryBonus: { enhanceStoneP: 0.68, enchantStoneP: 0.5, extraGoldMul: 1.68, extraExpPct: 0.066 }
            }
        );
    };
    document.querySelector("#ac22").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.2, 0.3)));
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(260, 560) * floor)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        player.gold = Math.max(0, player.gold - loss);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.019);
        addDungeonLog(`<span style="color:#ff4d4f;">你献血退阶，仍被祭火灼魂：气血 <b>-${nFormatter(dmg)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}；敌势永久 <b>+0.019</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

function abyssChainStageThreeEvent(p) {
    dungeon.status.event = true;
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="ac31">踏终阶（极难）</button>
            <button id="ac32">碎阶遁离（巨罚）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【深渊祭步·终阶】祭钟碎裂，渊主影压临身。此战不胜，便是葬阶。</span>`, choices);
    document.querySelector("#ac31").onclick = function () {
        startDangerEventCombat(
            `你踏上终阶，${enemy.name}披渊主之影降下，威压几乎扯碎神识。`,
            null,
            {
                minQuality: 10,
                statMul: 2.78,
                rewardMul: 2.72 + Math.min(0.25, wins * 0.07),
                lvlBonus: 8,
                victoryBonus: {
                    enhanceStoneP: 0.8,
                    enchantStoneP: 0.62,
                    extraGoldMul: 2.05,
                    extraExpPct: 0.1,
                    titleBuff: { id: "abyss_chain", name: "渊阶镇魂者", atkMul: 1.1, dmgTakenMul: 0.93 }
                }
            }
        );
    };
    document.querySelector("#ac32").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.26, 0.38)));
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(420, 860) * floor)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        player.gold = Math.max(0, player.gold - loss);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.026);
        addDungeonLog(`<span style="color:#ff4d4f;">你碎阶遁离，代价惨重：气血 <b>-${nFormatter(dmg)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}；敌势永久 <b>+0.026</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 连锁高危战斗线（三）：天狱巡裁（3 段）
const skyChainEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="scx1">应天狱巡裁（三段）</button>
            <button id="scx2">避裁回身</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">天穹裂开审判纹，巡裁令落入掌中：三裁过后，方可免责。</span>`, choices);
    document.querySelector("#scx1").onclick = function () {
        var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
        scheduleDeferredEvent({ kind: "skyChain", stage: 2, dueRoom: nextDue, chainWins: 0 });
        startDangerEventCombat(
            `你应裁而战，${enemy.name}携天狱符锁降临，第一裁已锁你退路。`,
            null,
            {
                minQuality: 10,
                statMul: 2.24,
                rewardMul: 2.2,
                lvlBonus: 6,
                victoryBonus: { enhanceStoneP: 0.6, enchantStoneP: 0.42, extraGoldMul: 1.48, extraExpPct: 0.054 }
            }
        );
    };
    document.querySelector("#scx2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.14, 0.22)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.017);
        addDungeonLog(`<span class="Common">你避裁而退，天狱余压贯体：气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.017</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
};

function skyChainStageEvent(p) {
    if (!p || typeof p.stage !== "number") return;
    if (p.stage === 2) skyChainStageTwoEvent(p);
    else if (p.stage === 3) skyChainStageThreeEvent(p);
}

function skyChainStageTwoEvent(p) {
    dungeon.status.event = true;
    var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="scx21">受第二裁（再战）</button>
            <button id="scx22">献财免裁（重罚）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【天狱巡裁·第二裁】空中法印重叠，刑芒已对准你的命门。</span>`, choices);
    document.querySelector("#scx21").onclick = function () {
        scheduleDeferredEvent({ kind: "skyChain", stage: 3, dueRoom: nextDue, chainWins: wins + 1 });
        startDangerEventCombat(
            `你硬接第二裁，${enemy.name}引下天火雷链，战场温度骤升。`,
            null,
            {
                minQuality: 10,
                statMul: 2.5,
                rewardMul: 2.42,
                lvlBonus: 7,
                victoryBonus: { enhanceStoneP: 0.7, enchantStoneP: 0.54, extraGoldMul: 1.76, extraExpPct: 0.074 }
            }
        );
    };
    document.querySelector("#scx22").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(300, 620) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.18, 0.28)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.021);
        addDungeonLog(`<span style="color:#ff4d4f;">你献财求免，天狱仍留一记：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.021</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

function skyChainStageThreeEvent(p) {
    dungeon.status.event = true;
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="scx31">承终裁（极难）</button>
            <button id="scx32">自毁法印撤离（巨罚）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【天狱巡裁·终裁】穹顶法轮合拢，终裁将落。此战不破，往后皆是阴影。</span>`, choices);
    document.querySelector("#scx31").onclick = function () {
        startDangerEventCombat(
            `你迎向终裁，${enemy.name}执裁天印轰下，连地脉都被压出裂纹。`,
            null,
            {
                minQuality: 10,
                statMul: 2.86,
                rewardMul: 2.8 + Math.min(0.24, wins * 0.07),
                lvlBonus: 8,
                victoryBonus: { enhanceStoneP: 0.82, enchantStoneP: 0.66, extraGoldMul: 2.12, extraExpPct: 0.108 }
                , titleBuff: { id: "sky_chain", name: "天裁不屈者", atkMul: 1.12, dmgTakenMul: 0.92 }
            }
        );
    };
    document.querySelector("#scx32").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(460, 920) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.28, 0.4)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.027);
        addDungeonLog(`<span style="color:#ff4d4f;">你自毁法印换命而退：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.027</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 连锁高危战斗线（四）：血契狂狩（3 段，奖励含天赋果）
const rageChainEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="rc1">以血为誓（狂狩三段）</button>
            <button id="rc2">压下杀机离开</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">你掌心忽然一热，一枚血色契印浮现：『连斩三魄，可换妖灵之果。』</span>`, choices);
    document.querySelector("#rc1").onclick = function () {
        var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
        scheduleDeferredEvent({ kind: "rageChain", stage: 2, dueRoom: nextDue, chainWins: 0 });
        addDungeonLog("契印已成。第一魄尚未散，第二魄已在雾后候你。");
        startDangerEventCombat(
            `你一指点破血契，${enemy.name}携狂狩之魄杀至，杀意像潮水淹没甬道。`,
            null,
            {
                minQuality: 9,
                statMul: 2.12,
                rewardMul: 2.12,
                lvlBonus: 5,
                victoryBonus: { talentFruit: 1, enhanceStoneP: 0.48, enchantStoneP: 0.28, extraGoldMul: 1.25, extraExpPct: 0.042 }
            }
        );
    };
    document.querySelector("#rc2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.12)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`<span class="Common">你强压杀机，仍被契印余烬灼伤：气血 <b>-${nFormatter(dmg)}</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
};

function rageChainStageEvent(p) {
    if (!p || typeof p.stage !== "number") return;
    if (p.stage === 2) rageChainStageTwoEvent(p);
    else if (p.stage === 3) rageChainStageThreeEvent(p);
}

function rageChainStageTwoEvent(p) {
    dungeon.status.event = true;
    var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="rc21">再斩第二魄</button>
            <button id="rc22">断契退避（重罚）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【血契狂狩·第二魄】血契跳动如鼓，雾里第二魄已封住退路。</span>`, choices);
    document.querySelector("#rc21").onclick = function () {
        scheduleDeferredEvent({ kind: "rageChain", stage: 3, dueRoom: nextDue, chainWins: wins + 1 });
        addDungeonLog("你不退反进，第三魄已在前方点灯。");
        startDangerEventCombat(
            `你斩断第二魄的咽喉，${enemy.name}自血雾里踏出，凶威更盛。`,
            null,
            {
                minQuality: 10,
                statMul: 2.44,
                rewardMul: 2.38,
                lvlBonus: 6,
                victoryBonus: { talentFruit: 1, enhanceStoneP: 0.58, enchantStoneP: 0.4, extraGoldMul: 1.55, extraExpPct: 0.058 }
            }
        );
    };
    document.querySelector("#rc22").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(180, 420) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.14, 0.22)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.016);
        addDungeonLog(`<span style="color:#ff4d4f;">你断契脱身，血印反噬：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.016</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

function rageChainStageThreeEvent(p) {
    dungeon.status.event = true;
    var wins = typeof p.chainWins === "number" ? p.chainWins : 0;
    const choices = `
        <div class="decision-panel">
            <button id="rc31">屠尽终魄（极难）</button>
            <button id="rc32">献血买路（终止）</button>
        </div>`;
    addDungeonLog(`<span style="color:#ff4d4f;">【血契狂狩·终魄】血契化作锁链缠住你腕骨。终魄亲临，此战不破，契印不散。</span>`, choices);
    document.querySelector("#rc31").onclick = function () {
        startDangerEventCombat(
            `你以血燃诀迎上终魄，${enemy.name}携狂狩天威坠场，空气都在嘶鸣。`,
            null,
            {
                minQuality: 10,
                statMul: 2.92,
                rewardMul: 2.72 + Math.min(0.2, wins * 0.06),
                lvlBonus: 8,
                victoryBonus: {
                    talentFruit: 2,
                    enhanceStoneP: 0.74,
                    enchantStoneP: 0.56,
                    extraGoldMul: 1.96,
                    extraExpPct: 0.09,
                    titleBuff: { id: "rage_chain", name: "血契狂狩者", atkMul: 1.12, dmgTakenMul: 0.92 }
                }
            }
        );
    };
    document.querySelector("#rc32").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const loss = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(260, 620) * floor)));
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.2, 0.32)));
        player.gold = Math.max(0, player.gold - loss);
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.022);
        addDungeonLog(`<span style="color:#ff4d4f;">你献血断链，才从终魄下活退：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；敌势永久 <b>+0.022</b>。</span>`);
        dungeon.status.event = false;
        playerLoadStats();
        updateDungeonLog();
    };
}

// 灵泉：调息回血
const lingquanEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("lingquan_intro") : "灵泉自地脉渗出……";
    const choices = `
        <div class="decision-panel">
            <button id="choice1">入泉调息</button>
            <button id="choice2">过而不饮</button>
        </div>`;
    addDungeonLog(`<span class="Rare">${intro}</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        const pct = randomizeDecimal(0.14, 0.28);
        const heal = Math.round(player.stats.hpMax * pct);
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        playerLoadStats();
        const after = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("lingquan_after") : "调息已毕。";
        addDungeonLog(`${after} 气血回复 <span class="Common">${nFormatter(heal)}</span>。`);
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        addDungeonLog("你未饮泉，只记其名，便已知足。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 古碑：悟碑得灵石
const daoTabletEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("tablet_intro") : "残碑半埋于苔痕之下……";
    const choices = `
        <div class="decision-panel">
            <button id="choice1">静心悟碑</button>
            <button id="choice2">碑前离去</button>
        </div>`;
    addDungeonLog(`<span class="Epic">${intro}</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        const gold = applyGoldGainMult(randomizeNum(28, 110) * Math.max(1, dungeon.progress.floor));
        player.gold += gold;
        const read = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("tablet_read") : "你心有所感。";
        addDungeonLog(`${read} 你拾得灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}（前人遗赠）。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        addDungeonLog("你合碑一礼，不取分毫，径自离去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

/** 二层及以上秘境：雾栈盲匣货郎（付费随机祸福，偏趣味） */
function floor2MistPeddlerEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var cost = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(18, 48) * floor)));
    var costStr = nFormatter(cost);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f2mp1">换一只盲匣</button>' +
        '<button type="button" id="f2mp2">摆手离去</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Epic">雾栈深处</span>有人挑担而立，匣上封条写的是「缘」字。「灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${costStr}</b> 换一匣因果——开匣无悔。」`,
        choices
    );
    document.querySelector("#f2mp1").onclick = function () {
        if (player.gold < cost) {
            addDungeonLog(`<span class="Common">你囊中羞涩，货郎摇头没入雾中，只余一声轻笑。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= cost;
        var r = Math.random();
        if (r < 0.38) {
            var heal = Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.26));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            addDungeonLog(
                `<span class="Rare">匣启药香。</span>残膏尚温，气血回复 <span class="Common">${nFormatter(heal)}</span>。`
            );
        } else if (r < 0.72) {
            var g = applyGoldGainMult(randomizeNum(55, 220) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Legendary">匣底竟是灵石。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>——货郎早不见了。`
            );
        } else if (r < 0.88) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedMist = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedMist) {
                if (typeof addPetExp === "function") {
                    var pShare = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * pShare)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Heirloom">匣中一缕残识灌入眉心。</span>` +
                    (amt > 0
                        ? amtAddedMist
                            ? `修为 <b>+${nFormatter(amt)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。`
            );
        } else {
            var bite = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.14)));
            player.stats.hp = Math.max(1, player.stats.hp - bite);
            var refund = applyGoldGainMult(randomizeNum(30, 95) * floor);
            player.gold += refund;
            addDungeonLog(
                `<span class="Uncommon">匣里跳出一只雾咬虱，照腿就是一口！</span>气血 <b>-${nFormatter(bite)}</b>；虱落处滚出灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(refund)}</b>作赔。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f2mp2").onclick = function () {
        addDungeonLog(`<span class="Common">你不接这因果，担声渐远，雾合如初。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 二层及以上秘境：双鲤雾池（抚鲤得疗或得财） */
function floor2KoiPondEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f2kp1">抚赤鲤（温养）</button>' +
        '<button type="button" id="f2kp2">抚墨鲤（吐珠）</button>' +
        '<button type="button" id="f2kp3">不扰池静</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Rare">薄雾下有一方小池</span>，赤墨二鲤绕影而游，鳞光映在你靴尖上，像在等待什么。`,
        choices
    );
    document.querySelector("#f2kp1").onclick = function () {
        var pct = randomizeDecimal(0.14, 0.27);
        var heal = Math.round(player.stats.hpMax * pct);
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        playerLoadStats();
        addDungeonLog(
            `<span class="Common">赤鲤顶指而过，暖流沿臂上行。</span>气血回复 <span class="Rare">${nFormatter(heal)}</span>。`
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f2kp2").onclick = function () {
        var g = applyGoldGainMult(randomizeNum(42, 160) * floor);
        player.gold += g;
        playerLoadStats();
        addDungeonLog(
            `<span class="Epic">墨鲤张口吐出一粒雾珠，触地成灵石。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f2kp3").onclick = function () {
        addDungeonLog(`<span class="Common">你收手退步，二鲤并尾一摆，池面如镜，连你的呼吸都静下来。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 二层及以上秘境：回音骰（掷点整活+小额奖惩） */
function floor2EchoDiceEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f2ed1">掷回音骰</button>' +
        '<button type="button" id="f2ed2">怕吵，走开</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Uncommon">石缝里卡着一枚骰子</span>，六点皆刻「问」字。你弹指，空谷竟回声叠响，像在催你掷。`,
        choices
    );
    document.querySelector("#f2ed1").onclick = function () {
        var d = randomizeNum(1, 6);
        if (d === 1) {
            var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.09)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(
                `<span class="Common">骰落「一」——回音撞在石壁上弹回来，正中你额角。</span>气血 <b>-${nFormatter(dmg)}</b>（你揉了揉，竟有点清醒）。`
            );
        } else if (d === 2) {
            addDungeonLog(
                `<span class="Common">骰落「二」——两声回音互相抵消，什么都没发生，连雾都愣了一下。</span>`
            );
        } else if (d === 3) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedDice3 = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedDice3) {
                if (typeof addPetExp === "function") {
                    var pShare2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * pShare2)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Rare">骰落「三」——三通回音合成一句短诀，你顺口记下。</span>` +
                    (amt > 0
                        ? amtAddedDice3
                            ? `修为 <b>+${nFormatter(amt)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。`
            );
        } else if (d === 4) {
            var g4 = applyGoldGainMult(randomizeNum(35, 130) * floor);
            player.gold += g4;
            addDungeonLog(
                `<span class="Epic">骰落「四」——四壁齐鸣，震落缝里陈年灵石。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g4)}</b>。`
            );
        } else if (d === 5) {
            var h5 = Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.16));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h5);
            addDungeonLog(
                `<span class="Rare">骰落「五」——五音归一，像有人替你拍了一次背。</span>气血回复 <span class="Common">${nFormatter(h5)}</span>。`
            );
        } else {
            var g6 = applyGoldGainMult(randomizeNum(48, 175) * floor);
            player.gold += g6;
            var amt6 = rollDungeonExpFloorRewardAmount();
            var amtAddedDice6 = dongtianDungeonPlayerExpAddBase(amt6);
            if (amtAddedDice6) {
                if (typeof addPetExp === "function") {
                    var pShare6 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt6 * pShare6)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">骰落「六」——六合回音齐贺，灵石与感悟同至。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g6)}</b>` +
                    (amt6 > 0
                        ? amtAddedDice6
                            ? `，修为 <b>+${nFormatter(amt6)}</b>`
                            : "，" + dongtianDungeonPlayerExpMissedGainHintZh(amt6, false)
                        : "") +
                    `。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f2ed2").onclick = function () {
        addDungeonLog(`<span class="Common">你把骰子按回石缝，回音渐息，像一场没开的玩笑。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 二层及以上秘境：云笈残简（抄经小赌：悟/空/诈） */
function floor2CloudArchiveEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f2ca1">抄一行残字</button>' +
        '<button type="button" id="f2ca2">只看不抄</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Heirloom">半页云笈浮在雾上</span>，字迹游动，像会随你心意改形。抄下或许有悟，也可能是空欢喜。`,
        choices
    );
    document.querySelector("#f2ca1").onclick = function () {
        var r = Math.random();
        if (r < 0.45) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedCa = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedCa) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">字落心头，脉络自明。</span>` +
                    (amt > 0
                        ? amtAddedCa
                            ? `修为 <b>+${nFormatter(amt)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。`
            );
        } else if (r < 0.78) {
            var g = applyGoldGainMult(randomizeNum(38, 145) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Epic">残字化砂，砂凝成灵石。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>——原来此页是「财诀」玩笑。`
            );
        } else {
            var loss = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.11)));
            player.stats.hp = Math.max(1, player.stats.hp - loss);
            var patch = Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.14));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + patch);
            addDungeonLog(
                `<span class="Uncommon">抄到一半，字反噬如针。</span>气血跌宕 <b>-${nFormatter(loss)}</b> 又 <b>+${nFormatter(
                    patch
                )}</b>——你撕了半页当符贴在腕上，竟勉强镇住了。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f2ca2").onclick = function () {
        addDungeonLog(`<span class="Common">你只记其形不记其文，云笈淡去，像从未出现过。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 五层及以上常规奇遇：引灯车队（中等收益，带轻微风险） */
function floor5LanternCaravanEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f5lc1">替车队引灯</button>' +
        '<button type="button" id="f5lc2">侧身让行</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Rare">雾道上传来铃响</span>，一队灵灯车缓缓经过，领队向你拱手求援：「前方雾刃乱流，可愿引一程？」`,
        choices
    );
    document.querySelector("#f5lc1").onclick = function () {
        if (Math.random() < 0.7) {
            var g = applyGoldGainMult(randomizeNum(90, 240) * floor);
            player.gold += g;
            addDungeonLog(`<span class="Epic">你提灯开道，车队平安穿雾。</span>谢礼入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`);
        } else {
            var hurt = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.11)));
            var tip = applyGoldGainMult(randomizeNum(40, 120) * floor);
            player.stats.hp = Math.max(1, player.stats.hp - hurt);
            player.gold += tip;
            addDungeonLog(`<span class="Uncommon">雾刃掠身，灯火险灭。</span>气血 <b>-${nFormatter(hurt)}</b>，车队仍留谢礼 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(tip)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f5lc2").onclick = function () {
        addDungeonLog(`<span class="Common">你侧身让出雾道，灯车渐远，只余一线暖光。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 五层及以上常规奇遇：灵草台（回复/稳态） */
function floor5SpiritHerbTerraceEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f5sh1">采朱叶草（偏回复）</button>' +
        '<button type="button" id="f5sh2">采青纹草（偏灵石）</button>' +
        '<button type="button" id="f5sh3">不动草台</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Uncommon">石台裂缝里长出两簇灵草</span>，一朱一青，药香与寒气交织，似各藏一条路。`,
        choices
    );
    document.querySelector("#f5sh1").onclick = function () {
        var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.22)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        addDungeonLog(`<span class="Rare">朱叶入喉，血脉微烫。</span>气血回复 <b>${nFormatter(heal)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f5sh2").onclick = function () {
        var g = applyGoldGainMult(randomizeNum(80, 210) * floor);
        player.gold += g;
        if (dungeon && dungeon.settings) {
            dungeon.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, Number(dungeon.settings.enemyScaling || DUNGEON_ENEMY_SCALING_MIN) - 0.003);
        }
        addDungeonLog(`<span class="Epic">青纹化露，露凝成珠。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>，心神一稳，敌势 <b>-0.003</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f5sh3").onclick = function () {
        addDungeonLog(`<span class="Common">你收手不采，任灵草在雾中轻摇。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 五层及以上常规奇遇：石刻传递（小额祸福） */
function floor5StoneScriptRelayEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f5ss1">对译石刻</button>' +
        '<button type="button" id="f5ss2">略过石刻</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Rare">三块残碑首尾相接</span>，像在传一段断句。你若补全，也许能换来一点此层的“善意”。`,
        choices
    );
    document.querySelector("#f5ss1").onclick = function () {
        var r = Math.random();
        if (r < 0.46) {
            var g = applyGoldGainMult(randomizeNum(95, 260) * floor);
            player.gold += g;
            addDungeonLog(`<span class="Epic">断句相合，碑缝掉出灵石。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`);
        } else if (r < 0.82) {
            var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.13)));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            if (dungeon && dungeon.settings) {
                dungeon.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, Number(dungeon.settings.enemyScaling || DUNGEON_ENEMY_SCALING_MIN) - 0.005);
            }
            addDungeonLog(`<span class="Uncommon">你读懂一半，心息转缓。</span>气血 <b>+${nFormatter(heal)}</b>，敌势 <b>-0.005</b>。`);
        } else {
            var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.1)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`<span class="Common">误译触发逆纹反噬。</span>气血 <b>-${nFormatter(dmg)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f5ss2").onclick = function () {
        addDungeonLog(`<span class="Common">你记下碑纹大概，未作深究，继续前行。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 七层及以上常规奇遇：黑市摊（邪恶文案，中等收益） */
function floor7BlackBazaarEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var cost = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(60, 150) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f7bb1">买一截“来路不明”的符骨</button>' +
        '<button type="button" id="f7bb2">冷眼离摊</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Uncommon">巷角黑布下摆着一排符骨</span>，摊主牙缝里含笑：「不问来路，只看价钱。<i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(cost)}</b>，买命还是买运？」`,
        choices
    );
    document.querySelector("#f7bb1").onclick = function () {
        if (player.gold < cost) {
            addDungeonLog(`<span class="Common">你摸了摸空袋，摊主嗤笑一声，把黑布重新盖好。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= cost;
        if (Math.random() < 0.68) {
            var gain = applyGoldGainMult(randomizeNum(150, 360) * floor);
            player.gold += gain;
            addDungeonLog(`<span class="Epic">符骨裂开，滚出一把旧灵石。</span>你净赚 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(gain - cost)}</b>。`);
        } else {
            var hurt = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.1)));
            player.stats.hp = Math.max(1, player.stats.hp - hurt);
            addDungeonLog(`<span class="Uncommon">符骨里窜出阴煞黑雾，反咬你一口。</span>气血 <b>-${nFormatter(hurt)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f7bb2").onclick = function () {
        addDungeonLog(`<span class="Common">你压住好奇转身离去，背后只剩几声低笑。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 七层及以上常规奇遇：血墨契（邪恶文案，偏修为/小代价） */
function floor7BloodInkContractEvent() {
    dungeon.status.event = true;
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f7bi1">按指印签契</button>' +
        '<button type="button" id="f7bi2">撕掉契纸</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Rare">一页血墨契纸贴在墙上</span>，墨迹像活物般蠕动：「借你一缕悟性，收你一点代价。」`,
        choices
    );
    document.querySelector("#f7bi1").onclick = function () {
        var amt = rollDungeonExpFloorRewardAmount();
        var added = dongtianDungeonPlayerExpAddBase(amt);
        if (added) {
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(amt * ps)));
            }
            leveled = false;
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
        }
        var loss = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.03, 0.08)));
        player.stats.hp = Math.max(1, player.stats.hp - loss);
        addDungeonLog(
            `<span class="Heirloom">契纹入体，心窍一寒一明。</span>` +
                (amt > 0
                    ? added
                        ? `修为 <b>+${nFormatter(amt)}</b>`
                        : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                    : "") +
                `；代价是气血 <b>-${nFormatter(loss)}</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f7bi2").onclick = function () {
        addDungeonLog(`<span class="Common">你将契纸撕成碎屑，血墨在掌心留下一道淡痕后退去。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 七层及以上常规奇遇：骨骰摊（邪恶文案，轻度博弈） */
function floor7BoneDiceStallEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="f7bd1">掷一把骨骰</button>' +
        '<button type="button" id="f7bd2">不与其赌</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Epic">瘸腿老头摆了三枚骨骰</span>，眼白发灰却笑得灿烂：「小赌怡魂，大赌伤命。」`,
        choices
    );
    document.querySelector("#f7bd1").onclick = function () {
        var d = randomizeNum(1, 6);
        if (d <= 2) {
            var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.11)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`<span class="Uncommon">骨骰滚出凶象，煞气贴脸而过。</span>气血 <b>-${nFormatter(dmg)}</b>。`);
        } else if (d <= 4) {
            var g = applyGoldGainMult(randomizeNum(110, 280) * floor);
            player.gold += g;
            addDungeonLog(`<span class="Rare">骨骰停在“偏吉”。</span>你捞到灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`);
        } else {
            var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.18)));
            var g2 = applyGoldGainMult(randomizeNum(80, 220) * floor);
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            player.gold += g2;
            addDungeonLog(`<span class="Legendary">骨骰连跳两圈，竟是大吉。</span>气血 <b>+${nFormatter(heal)}</b>，灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g2)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#f7bd2").onclick = function () {
        addDungeonLog(`<span class="Common">你看了眼骨骰上的裂纹，决定不赌，默默走开。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 雾中三影猜匣：选对暴富，选错祸福参半 */
function funShadowShellEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var secret = randomizeNum(1, 3);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="fss1">揭甲影之匣</button>' +
        '<button type="button" id="fss2">揭乙影之匣</button>' +
        '<button type="button" id="fss3">揭丙影之匣</button>' +
        '<button type="button" id="fss0">不赌，绕雾而行</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Epic">雾凝三影</span>，各捧一只无锁玉匣，齐声笑问：「只有一次机会——谁的匣子里，装的是真缘？」`,
        choices
    );
    function resolvePick(pick) {
        if (pick === secret) {
            var g = applyGoldGainMult(randomizeNum(90, 260) * floor);
            var amt = rollDungeonExpFloorRewardAmount();
            player.gold += g;
            var amtAddedFss = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedFss) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">匣启金芒与残识同涌！</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>` +
                    (amt > 0
                        ? amtAddedFss
                            ? `，修为 <b>+${nFormatter(amt)}</b>`
                            : "，" + dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。另两影合掌退入雾中，像从未争过。`
            );
        } else {
            var r = Math.random();
            if (r < 0.55) {
                var heal = Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.2));
                player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
                addDungeonLog(
                    `<span class="Rare">匣里只有一缕温香。</span>你虽未中头彩，气血仍回复 <span class="Common">${nFormatter(heal)}</span>。`
                );
            } else {
                var bite = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.13)));
                player.stats.hp = Math.max(1, player.stats.hp - bite);
                var refund = applyGoldGainMult(randomizeNum(40, 120) * floor);
                player.gold += refund;
                addDungeonLog(
                    `<span class="Uncommon">匣中窜出雾咬虫，照腕就是一口！</span>气血 <b>-${nFormatter(bite)}</b>；虫蜕化作灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                        refund
                    )}</b>赔不是。`
                );
            }
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    }
    document.querySelector("#fss1").onclick = function () {
        resolvePick(1);
    };
    document.querySelector("#fss2").onclick = function () {
        resolvePick(2);
    };
    document.querySelector("#fss3").onclick = function () {
        resolvePick(3);
    };
    document.querySelector("#fss0").onclick = function () {
        addDungeonLog(`<span class="Common">你不接这局，三影同时欠身，雾像被谁收走了一层。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 指路木偶：三路倾向不同（悟/财/险），有真实策略差 */
function funPuppetForkEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="fpf1">随木偶指——<b>劫前直</b></button>' +
        '<button type="button" id="fpf2">随木偶指——<b>劫左转</b></button>' +
        '<button type="button" id="fpf3">随木偶指——<b>劫右折</b></button>' +
        '<button type="button" id="fpf0">不信傀儡，自择他路</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Uncommon">朽木木偶关节咔咔作响</span>，抬手指了三条雾径，胸口贴着纸条：「走错了别怪我，我只负责指。」`,
        choices
    );
    function grantExpLine(amt) {
        if (!dongtianDungeonPlayerExpAddBase(amt)) return false;
        if (typeof addPetExp === "function") {
            var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(amt * ps)));
        }
        leveled = false;
        dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
        if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
        return true;
    }
    document.querySelector("#fpf1").onclick = function () {
        var r = Math.random();
        if (r < 0.52) {
            var amt = rollDungeonExpFloorRewardAmount();
            var gotPpf1 = grantExpLine(amt);
            if (amt > 0) {
                if (gotPpf1) {
                    addDungeonLog(
                        `<span class="Legendary">直路尽头有一隙天光灌顶。</span>修为 <b>+${nFormatter(amt)}</b>。`
                    );
                } else {
                    var hintPpf1 = dongtianDungeonPlayerExpMissedGainHintZh(amt, false);
                    if (hintPpf1) addDungeonLog(`<span class="Legendary">直路尽头有一隙天光灌顶。</span>${hintPpf1}`);
                }
            }
        } else if (r < 0.82) {
            var g = applyGoldGainMult(randomizeNum(38, 140) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Epic">直路上捡到前人遗袋。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`
            );
        } else {
            startDangerEventCombat("雾深处踏出拦路者，气机炽烈，似被木偶引来的试刀石。", null, {
                minQuality: 5,
                statMul: 1.1,
                rewardMul: 1.12,
                lvlBonus: 0,
                victoryBonus: { extraGoldMul: 0.95, extraExpPct: 0.045 },
            });
            return;
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fpf2").onclick = function () {
        var r = Math.random();
        if (r < 0.52) {
            var g2 = applyGoldGainMult(randomizeNum(48, 175) * floor);
            player.gold += g2;
            addDungeonLog(
                `<span class="Legendary">左转见弃置灵栈，砂里埋金。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g2)}</b>。`
            );
        } else if (r < 0.8) {
            var amt2 = rollDungeonExpFloorRewardAmount();
            var gotPpf2 = grantExpLine(amt2);
            if (amt2 > 0) {
                if (gotPpf2) {
                    addDungeonLog(`<span class="Rare">左转石壁浮现残诀。</span>修为 <b>+${nFormatter(amt2)}</b>。`);
                } else {
                    var hintPpf2 = dongtianDungeonPlayerExpMissedGainHintZh(amt2, false);
                    if (hintPpf2) addDungeonLog(`<span class="Rare">左转石壁浮现残诀。</span>${hintPpf2}`);
                }
            }
        } else {
            startDangerEventCombat("左转雾薄处忽然合拢，一道凶影堵在狭口。", null, {
                minQuality: 5,
                statMul: 1.12,
                rewardMul: 1.14,
                lvlBonus: 0,
                victoryBonus: { extraGoldMul: 1.05, extraExpPct: 0.04 },
            });
            return;
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fpf3").onclick = function () {
        var r = Math.random();
        if (r < 0.48) {
            startDangerEventCombat("右折风声如哨，凶影借势扑来——此路果然好斗。", null, {
                minQuality: 5,
                statMul: 1.08,
                rewardMul: 1.18,
                lvlBonus: 0,
                victoryBonus: { extraGoldMul: 1.15, extraExpPct: 0.055 },
            });
            return;
        } else if (r < 0.78) {
            var h = Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.22));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(
                `<span class="Rare">右折竟通一口温池。</span>气血回复 <span class="Common">${nFormatter(h)}</span>。`
            );
        } else {
            var g3 = applyGoldGainMult(randomizeNum(55, 165) * floor);
            player.gold += g3;
            addDungeonLog(
                `<span class="Epic">右折石龛里供着散修私房钱。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g3)}</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fpf0").onclick = function () {
        var coin = applyGoldGainMult(randomizeNum(8, 28) * floor);
        player.gold += coin;
        addDungeonLog(
            `<span class="Common">你绕开木偶，靴尖踢到半块灵石渣。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                coin
            )}</b>——也算机缘。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
}

/** 潮声赌摊：三档押注，胜负有声有色 */
function funTideBetEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var low = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(10, 26) * floor)));
    var mid = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(28, 58) * floor)));
    var high = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(62, 118) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="ftb1">小押（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(low) +
        "）</button>" +
        '<button type="button" id="ftb2">中押（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(mid) +
        "）</button>" +
        '<button type="button" id="ftb3">豪押（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(high) +
        "）</button>" +
        '<button type="button" id="ftb0">听潮不赌</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Heirloom">潮摊无掌柜</span>，只有一只贝壳当桌。贝壳里浮字：「押灵石，听潮一次——潮涨为赢，潮落为输，潮平算你走运。」`,
        choices
    );
    function tryBet(stake) {
        if (player.gold < stake) {
            addDungeonLog(`<span class="Common">灵石不够，贝壳咔地合上，像打了个哈欠。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= stake;
        var r = Math.random();
        if (r < 0.48) {
            var win = Math.floor(stake * randomizeDecimal(1.85, 2.35));
            player.gold += win;
            addDungeonLog(
                `<span class="Legendary">潮涨！</span>贝壳吐还 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    win
                )}</b>（含本）。`
            );
        } else if (r < 0.78) {
            player.gold += stake;
            var tip = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(6, 22) * floor)));
            player.gold += tip;
            addDungeonLog(
                `<span class="Rare">潮平如镜。</span>本金退回，另赏 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(tip)}</b>。`
            );
        } else {
            var claw = Math.max(1, Math.round(stake * randomizeDecimal(0.35, 0.65)));
            player.gold += claw;
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.003);
            addDungeonLog(
                `<span class="Uncommon">潮落吞金，只吐回一点渣。</span>收回 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    claw
                )}</b>；秘境敌势 <b>+0.003</b>（潮煞入脉）。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    }
    document.querySelector("#ftb1").onclick = function () {
        tryBet(low);
    };
    document.querySelector("#ftb2").onclick = function () {
        tryBet(mid);
    };
    document.querySelector("#ftb3").onclick = function () {
        tryBet(high);
    };
    document.querySelector("#ftb0").onclick = function () {
        addDungeonLog(`<span class="Common">你只听了潮，一文未押。贝壳里的字慢慢淡去。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 彗尾许愿：财/生/劫 三条叙事与不同代价结构 */
function funCometWishEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="fcw1">许愿·横财</button>' +
        '<button type="button" id="fcw2">许愿·长生息</button>' +
        '<button type="button" id="fcw3">许愿·劫中取悟</button>' +
        '<button type="button" id="fcw0">流星过客，不欠天意</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Legendary">一线彗尾掠过秘境穹顶</span>，光屑落在你掌心发烫。旧修传言：此时许愿，天道会记账。`,
        choices
    );
    document.querySelector("#fcw1").onclick = function () {
        var g = applyGoldGainMult(randomizeNum(120, 320) * floor);
        player.gold += g;
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.006);
        addDungeonLog(
            `<span class="Epic">财从星屑里凝实入手。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                g
            )}</b>；同时 <span class="Heirloom">秘境敌势 +0.006</span>（横财引妒）。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fcw2").onclick = function () {
        var pay = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(15, 42) * floor)));
        if (player.gold < pay) {
            addDungeonLog(`<span class="Common">星息要有香火承接。你灵石不够，彗星只在你袖里留了一点凉。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= pay;
        var h = Math.round(player.stats.hpMax * randomizeDecimal(0.22, 0.38));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
        addDungeonLog(
            `<span class="Rare">星息入肺，气血如潮回涌。</span>回复 <span class="Common">${nFormatter(h)}</span>；天意抽走香火钱 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                pay
            )}</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fcw3").onclick = function () {
        var amt = rollDungeonExpFloorRewardAmount();
        var amtAddedFcw = dongtianDungeonPlayerExpAddBase(amt);
        if (amtAddedFcw) {
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(amt * ps)));
            }
            leveled = false;
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
        }
        if (Math.random() < 0.42) {
            var escLossFcw = applyDungeonEnemyScalingLoss(0.004);
            dungeon.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, dungeon.settings.enemyScaling - escLossFcw);
            addDungeonLog(
                `<span class="Legendary">劫火绕体而不伤。</span>` +
                    (amt > 0
                        ? amtAddedFcw
                            ? `修为 <b>+${nFormatter(amt)}</b>；`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false) + "；"
                        : "") +
                    `<span class="Rare">秘境敌势 -${escLossFcw.toFixed(3)}</span>（险中求全）。`
            );
        } else {
            var scratch = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.11)));
            player.stats.hp = Math.max(1, player.stats.hp - scratch);
            addDungeonLog(
                `<span class="Epic">识海暴涨，肉身却被星屑刮出血痕。</span>` +
                    (amt > 0
                        ? amtAddedFcw
                            ? `修为 <b>+${nFormatter(amt)}</b>；`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false) + "；"
                        : "") +
                    `气血 <b>-${nFormatter(
                    scratch
                )}</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fcw0").onclick = function () {
        addDungeonLog(`<span class="Common">你合掌不语，彗尾远去，掌心只余一点凉。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 茶烟幻摊：付茶钱换稳定小确幸 */
function funTeaPhantomEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var tea = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(12, 34) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="ftp1">付茶钱饮一盏（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(tea) +
        "）</button>" +
        '<button type="button" id="ftp0">不饮幻茶</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Rare">茶烟凝成一位无面茶博士</span>，盏中无水却有香。「此茶只卖给肯付钱的人；付完钱，茶才算真。」`,
        choices
    );
    document.querySelector("#ftp1").onclick = function () {
        if (player.gold < tea) {
            addDungeonLog(`<span class="Common">茶博士叹气消散：「没钱就别闻这么认真。」</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= tea;
        var r = Math.random();
        if (r < 0.62) {
            var heal = Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.2));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            addDungeonLog(
                `<span class="Legendary">茶未入口，胸臆已暖。</span>气血回复 <span class="Common">${nFormatter(heal)}</span>。`
            );
        } else if (r < 0.9) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedTea = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedTea) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Epic">茶香化字，落在灵台。</span>` +
                    (amt > 0
                        ? amtAddedTea
                            ? `修为 <b>+${nFormatter(amt)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。`
            );
        } else {
            var back = applyGoldGainMult(randomizeNum(20, 75) * floor);
            player.gold += back;
            addDungeonLog(
                `<span class="Uncommon">茶博士手滑，把找零撒了一地。</span>捡回 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    back
                )}</b>——他假装没看见。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#ftp0").onclick = function () {
        addDungeonLog(`<span class="Common">茶烟散去，只剩一缕苦香绕鼻三息。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 问心石整活：答或踹，三种无厘头后果 */
function funRiddleStoneEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="frs1">坦然应声「怕」</button>' +
        '<button type="button" id="frs2">嘴硬喝道「不怕」</button>' +
        '<button type="button" id="frs3">踹它一脚</button>' +
        '<button type="button" id="frs0">绕石而行</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Uncommon">怪石裂开一道嘴</span>，瓮声问：「修士，你怕穷吗？」石缝里还夹着半张当票，像某种证据。`,
        choices
    );
    document.querySelector("#frs1").onclick = function () {
        var heal = Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.16));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        var g = applyGoldGainMult(randomizeNum(18, 55) * floor);
        player.gold += g;
        addDungeonLog(
            `<span class="Rare">石嘴一愣，竟软了三分。</span>「诚实可免一半劫。」气血 <span class="Common">+${nFormatter(
                heal
            )}</span>，灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#frs2").onclick = function () {
        var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.07, 0.14)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        var g = applyGoldGainMult(randomizeNum(55, 160) * floor);
        player.gold += g;
        addDungeonLog(
            `<span class="Epic">石嘴冷笑：「嘴硬者，口袋先软。」</span>气血 <b>-${nFormatter(dmg)}</b>；石缝吐赔 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                g
            )}</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#frs3").onclick = function () {
        if (Math.random() < 0.55) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedFrs = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedFrs) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">石痛得喊出一串古语。</span>你竟听懂半句——` +
                    (amt > 0
                        ? amtAddedFrs
                            ? `修为 <b>+${nFormatter(amt)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。`
            );
        } else {
            startDangerEventCombat("怪石翻身，石纹裂作四肢百骸——它显然很记仇。", null, {
                minQuality: 5,
                statMul: 1.06,
                rewardMul: 1.1,
                lvlBonus: 0,
                victoryBonus: { extraGoldMul: 0.88, extraExpPct: 0.05 },
            });
            return;
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#frs0").onclick = function () {
        addDungeonLog(`<span class="Common">石嘴在你背后嘀咕了一句脏话，但你装作没听见。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 倒悬湖：天映水下，抉择踏波/潜水/观蜃 */
function funReverseLakeEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="frl1">踏波而行（赌悟性）</button>' +
        '<button type="button" id="frl2">潜水摸月（赌财帛）</button>' +
        '<button type="button" id="frl0">岸边观蜃，不近水</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Heirloom">湖面倒悬</span>，云在脚下流，月在波心碎。旧碑残字：「踏错一步，洗脚；踏对一步，洗心。」`,
        choices
    );
    document.querySelector("#frl1").onclick = function () {
        var r = Math.random();
        if (r < 0.48) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedFrl1 = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedFrl1) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">足下生莲纹，水只湿靴底。</span>` +
                    (amt > 0
                        ? amtAddedFrl1
                            ? `修为 <b>+${nFormatter(amt)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false)
                        : "") +
                    `。`
            );
        } else if (r < 0.78) {
            var h = Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.22));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(
                `<span class="Rare">波涌如掌托背。</span>气血回复 <span class="Common">${nFormatter(h)}</span>。`
            );
        } else {
            var bite = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.12)));
            player.stats.hp = Math.max(1, player.stats.hp - bite);
            var g = applyGoldGainMult(randomizeNum(40, 115) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Uncommon">一脚踩空，灌了满口「天水」。</span>气血 <b>-${nFormatter(bite)}</b>；咳出灵砂 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#frl2").onclick = function () {
        var r2 = Math.random();
        if (r2 < 0.4) {
            var g2 = applyGoldGainMult(randomizeNum(70, 210) * floor);
            player.gold += g2;
            addDungeonLog(
                `<span class="Legendary">月影在指间凝成实。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g2)}</b>。`
            );
        } else if (r2 < 0.72) {
            var d2 = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.16)));
            player.stats.hp = Math.max(1, player.stats.hp - d2);
            addDungeonLog(
                `<span class="Common">水压如锤，耳窍嗡鸣。</span>气血 <b>-${nFormatter(d2)}</b>。`
            );
        } else {
            var amt2 = rollDungeonExpFloorRewardAmount();
            var amtAddedFrl2 = dongtianDungeonPlayerExpAddBase(amt2);
            if (amtAddedFrl2) {
                if (typeof addPetExp === "function") {
                    var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt2 * ps2)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Epic">水底有人对你眨了眨眼——你竟看懂了。</span>` +
                    (amt2 > 0
                        ? amtAddedFrl2
                            ? `修为 <b>+${nFormatter(amt2)}</b>`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt2, false)
                        : "") +
                    `。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#frl0").onclick = function () {
        if (Math.random() < 0.35) {
            var tip = applyGoldGainMult(randomizeNum(12, 38) * floor);
            player.gold += tip;
            addDungeonLog(
                `<span class="Common">蜃楼散时，靴边多了一撮灵砂。</span><i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    tip
                )}</b>。`
            );
            playerLoadStats();
        } else {
            addDungeonLog(`<span class="Common">你看够了，心湖反而静了。</span>`);
        }
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
}

/** 债鸦：上古碰瓷，付账或硬刚 */
function funDebtCrowEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var debt = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(22, 55) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="fdc1">认账付 <i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(debt) +
        "</button>" +
        '<button type="button" id="fdc2">挥袖驱鸦</button>' +
        '<button type="button" id="fdc0">装没看见</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Chronarch">黑鸦衔来当票半张</span>，朱批：「上届过客欠我三声笑、两缕运、一笔灵石——今日连本带利。」`,
        choices
    );
    document.querySelector("#fdc1").onclick = function () {
        if (player.gold < debt) {
            addDungeonLog(`<span class="Common">鸦眼一翻：「穷鬼不算数。」扑棱棱散了。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= debt;
        var r = Math.random();
        if (r < 0.55) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedFdc = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedFdc) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            var h = Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.12));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(
                `<span class="Legendary">鸦吐出一粒黑玉「利息」。</span>` +
                    (amt > 0
                        ? amtAddedFdc
                            ? `修为 <b>+${nFormatter(amt)}</b>，`
                            : dongtianDungeonPlayerExpMissedGainHintZh(amt, false) + "，"
                        : "") +
                    `气血 <span class="Common">+${nFormatter(
                    h
                )}</span>。`
            );
        } else {
            var g = applyGoldGainMult(randomizeNum(55, 155) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Epic">当票化灰，灰里滚灵石。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fdc2").onclick = function () {
        if (Math.random() < 0.52) {
            addDungeonLog(`<span class="Common">鸦群骂骂咧咧飞远，像下次还会来。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
        } else {
            startDangerEventCombat("鸦影聚形，竟似有人借羽为刃。", null, {
                minQuality: 5,
                statMul: 1.05,
                rewardMul: 1.1,
                lvlBonus: 0,
                victoryBonus: { extraGoldMul: 0.85, extraExpPct: 0.042 },
            });
        }
    };
    document.querySelector("#fdc0").onclick = function () {
        if (Math.random() < 0.38) {
            addDungeonLog(`<span class="Common">鸦等不及，自己散了，像嫌你无聊。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
        } else {
            var peck = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.1)));
            player.stats.hp = Math.max(1, player.stats.hp - peck);
            var spit = applyGoldGainMult(randomizeNum(25, 78) * floor);
            player.gold += spit;
            addDungeonLog(
                `<span class="Uncommon">后脑勺挨了一啄。</span>气血 <b>-${nFormatter(peck)}</b>；鸦嫌烫嘴吐出灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    spit
                )}</b>。`
            );
            playerLoadStats();
            dungeon.status.event = false;
            if (typeof saveData === "function") saveData();
            updateDungeonLog();
        }
    };
}

/** 拦路灵猫：顺毛、投喂或绕行 */
function funLuckCatEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var snack = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(10, 28) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="flc1">顺毛撸一把</button>' +
        '<button type="button" id="flc2">投喂灵石（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(snack) +
        "）</button>" +
        '<button type="button" id="flc0">绕远，不惹猫爷</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Rare">石阶正中蜷一团玄雾似的猫</span>，尾巴尖写了个「缘」字，睁一只眼打量你。`,
        choices
    );
    document.querySelector("#flc1").onclick = function () {
        if (Math.random() < 0.72) {
            var h = Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.19));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(
                `<span class="Legendary">呼噜声像小雷劫在胸腔里化开。</span>气血回复 <span class="Common">${nFormatter(h)}</span>。`
            );
        } else {
            startDangerEventCombat("猫炸毛成虎纹虚影——你手太重了。", null, {
                minQuality: 5,
                statMul: 1.04,
                rewardMul: 1.08,
                lvlBonus: 0,
                victoryBonus: { extraGoldMul: 0.75, extraExpPct: 0.038 },
            });
            return;
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#flc2").onclick = function () {
        if (player.gold < snack) {
            addDungeonLog(`<span class="Common">猫瞥你空囊，嫌弃地扭头。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= snack;
        var r = Math.random();
        if (r < 0.6) {
            var g = applyGoldGainMult(randomizeNum(45, 130) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Epic">猫爪拍你手背，竟拍出灵石响。</span><i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>。`
            );
        } else {
            var h2 = Math.round(player.stats.hpMax * randomizeDecimal(0.14, 0.24));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h2);
            addDungeonLog(
                `<span class="Rare">猫在你膝上踩奶，踩出真元回流。</span>气血 <span class="Common">+${nFormatter(h2)}</span>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#flc0").onclick = function () {
        addDungeonLog(`<span class="Common">你绕路时，听见背后一声轻哼，像猫在笑你怂。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 三脉骰门：寸关尺，撞一门机缘 */
function funMeridianDiceEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="fmd1">撞「寸」门</button>' +
        '<button type="button" id="fmd2">撞「关」门</button>' +
        '<button type="button" id="fmd3">撞「尺」门</button>' +
        '<button type="button" id="fmd0">三门皆不撞</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Epic">雾中立三座石门</span>，额书「寸」「关」「尺」。门缝漏出的不是风，是别人的心跳声。`,
        choices
    );
    function resolveDoor(label) {
        var r = Math.random();
        if (r < 0.42) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedMrd = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedMrd) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">「${label}」门后是残经半卷。</span>` +
                    (amt > 0 ? dongtianDungeonExpWeiOrHint(amt, amtAddedMrd) : "") +
                    `。`
            );
        } else if (r < 0.74) {
            var g = applyGoldGainMult(randomizeNum(42, 150) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Rare">「${label}」门里掉出前人私房。</span><i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>。`
            );
        } else if (r < 0.9) {
            var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.07, 0.14)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(
                `<span class="Uncommon">「${label}」门后脉象反噬。</span>气血 <b>-${nFormatter(dmg)}</b>。`
            );
        } else {
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.004);
            addDungeonLog(
                `<span class="Heirloom">「${label}」门一推，劫气倒灌。</span>秘境敌势 <b>+0.004</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    }
    document.querySelector("#fmd1").onclick = function () {
        resolveDoor("寸");
    };
    document.querySelector("#fmd2").onclick = function () {
        resolveDoor("关");
    };
    document.querySelector("#fmd3").onclick = function () {
        resolveDoor("尺");
    };
    document.querySelector("#fmd0").onclick = function () {
        addDungeonLog(`<span class="Common">你不撞门，三门齐叹，像松了口气。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 幽摊盲盒：无脚货郎卖「气运匣」 */
function funGhostMerchantEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var price = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(24, 62) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="fgm1">买一匣气运（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(price) +
        "）</button>" +
        '<button type="button" id="fgm0">摊无人，不敢买</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Uncommon">雾中货担自响</span>，不见摊主，只闻声：「灵石换匣，匣里是天意还是玩笑——不退不换。」`,
        choices
    );
    document.querySelector("#fgm1").onclick = function () {
        if (player.gold < price) {
            addDungeonLog(`<span class="Common">担声骤止，像鄙视空囊。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= price;
        var r = Math.random();
        if (r < 0.34) {
            var g = applyGoldGainMult(randomizeNum(80, 240) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Legendary">匣开金光扑面。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>。`
            );
        } else if (r < 0.62) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedFgm = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedFgm) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Epic">匣里一缕残识笑了一声。</span>` +
                    (amt > 0 ? dongtianDungeonExpWeiOrHint(amt, amtAddedFgm) : "") +
                    `。`
            );
        } else if (r < 0.82) {
            var h = Math.round(player.stats.hpMax * randomizeDecimal(0.15, 0.28));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(
                `<span class="Rare">匣中是一丸温香。</span>气血回复 <span class="Common">${nFormatter(h)}</span>。`
            );
        } else {
            var joke = applyGoldGainMult(randomizeNum(8, 28) * floor);
            player.gold += joke;
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.003);
            addDungeonLog(
                `<span class="Common">匣里跳出一只纸青蛙，呱。</span>退你 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    joke
                )}</b>；秘境敌势 <b>+0.003</b>（被耍也要记账）。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#fgm0").onclick = function () {
        addDungeonLog(`<span class="Common">担声渐远，你总觉得亏了点什么。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

/** 暮桥将塌：疾行、稳走或舍财加固 */
function funTwilightBridgeEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var fix = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(30, 72) * floor)));
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="ftbB1">疾掠而过</button>' +
        '<button type="button" id="ftbB2">稳步过桥</button>' +
        '<button type="button" id="ftbB3">舍灵石加固（<i class="fas fa-coins" style="color:#FFD700;"></i>' +
        nFormatter(fix) +
        "）</button>" +
        '<button type="button" id="ftbB0">原路退回</button>' +
        "</div>";
    addDungeonLog(
        `<span class="Heirloom">暮色的桥板咯吱作响</span>，栏外是空。有声音说：「快走，或者走稳，或者——让桥记住你的好。」`,
        choices
    );
    document.querySelector("#ftbB1").onclick = function () {
        if (Math.random() < 0.68) {
            var amt = rollDungeonExpFloorRewardAmount();
            var amtAddedFtb1 = dongtianDungeonPlayerExpAddBase(amt);
            if (amtAddedFtb1) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt * ps)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                `<span class="Legendary">足尖点板如蜻蜓，桥在身后塌成雾。</span>` +
                    (amt > 0 ? dongtianDungeonExpWeiOrHint(amt, amtAddedFtb1) : "") +
                    `。`
            );
        } else {
            var fall = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.18)));
            player.stats.hp = Math.max(1, player.stats.hp - fall);
            var g = applyGoldGainMult(randomizeNum(48, 125) * floor);
            player.gold += g;
            addDungeonLog(
                `<span class="Uncommon">板断一截，你挂栏翻回，擦伤不轻。</span>气血 <b>-${nFormatter(fall)}</b>；栏缝里抠出 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                    g
                )}</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#ftbB2").onclick = function () {
        if (Math.random() < 0.55) {
            var h = Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.18));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(
                `<span class="Rare">一步一呼，桥竟随你呼吸稳下来。</span>气血 <span class="Common">+${nFormatter(h)}</span>。`
            );
        } else {
            var g2 = applyGoldGainMult(randomizeNum(32, 95) * floor);
            player.gold += g2;
            addDungeonLog(
                `<span class="Epic">桥尾有人遗落钱袋。</span><i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g2)}</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#ftbB3").onclick = function () {
        if (player.gold < fix) {
            addDungeonLog(`<span class="Common">灵石不够，桥板又响了一声，像在催命。</span>`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= fix;
        var g3 = applyGoldGainMult(randomizeNum(95, 260) * floor);
        var amt2 = rollDungeonExpFloorRewardAmount();
        player.gold += g3;
        var amtAddedFtb3 = dongtianDungeonPlayerExpAddBase(amt2);
        if (amtAddedFtb3) {
            if (typeof addPetExp === "function") {
                var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(amt2 * ps2)));
            }
            leveled = false;
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
        }
        addDungeonLog(
            `<span class="Legendary">桥纹亮起，像记你一功。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                g3
            )}</b>` +
                dongtianDungeonExpCommaWeiOrHint(amt2, amtAddedFtb3) +
                `。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
    };
    document.querySelector("#ftbB0").onclick = function () {
        addDungeonLog(`<span class="Common">你不赌这座桥，绕远多费半劫工夫——但腿还在。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
    };
}

function escapeDungeonLogText(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function pickCloudTravelerLine(arr) {
    if (!arr || !arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

/** 根据对方层/劫/击杀生成一两句「像真人」的氛围旁白 */
function buildCloudTravelerVibeHtml(t, myFloor, myRoom) {
    var tf = Math.floor(Number(t.floor) || 1);
    var tr = Math.floor(Number(t.room) || 1);
    var kills = typeof t.kills === "number" && !isNaN(t.kills) ? t.kills : 0;
    var parts = [];
    if (tf === myFloor && tr === myRoom) {
        parts.push(
            `<span class="Legendary">其灵机竟与你在<b>同一劫位</b>重叠一瞬——像两盏灯在同一格窗棂上晃。</span> `
        );
    } else if (tf === myFloor) {
        parts.push(
            tr > myRoom
                ? `<span class="Uncommon">同层不同劫：对方似比你多踏了半步深雾。</span> `
                : `<span class="Uncommon">同层不同劫：对方气机像刚从你身后那条岔路绕过来。</span> `
        );
    } else if (tf > myFloor) {
        parts.push(`<span class="Rare">对方残影自更高层漏下一丝，带着「见过风浪」的淡。</span> `);
    } else {
        parts.push(`<span class="Common">对方尚在浅层折腾，却有一股不服输的烫。</span> `);
    }
    if (kills >= 800) {
        parts.push(`<span class="Chronarch">斩魔数惊人，残影边缘有细煞游丝，像没擦干净的血墨。</span>`);
    } else if (kills >= 200) {
        parts.push(`<span class="Epic">观其斩魔之积，应是常在劫里打滚的老手。</span>`);
    } else if (kills > 0 && kills < 25) {
        parts.push(`<span class="Common">斩魔尚少，步履却新，像刚学会把害怕走成路。</span>`);
    }
    return parts.join("");
}

/** 成功互动后小概率：灵网手滑掉赏钱 */
function cloudTravelerMaybeNetBurp(floor) {
    if (Math.random() >= 0.072) return;
    var gx = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(6, 28) * floor)));
    player.gold += gx;
    addDungeonLog(
        pickCloudTravelerLine([
            `<span class="Uncommon">灵网打了个嗝，多掉一口零花钱 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                gx
            )}</b>——天道也会手滑。</span>`,
            `<span class="Rare">传讯符串线了半息，竟夹带一颗灵石滚落袋中 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                gx
            )}</b>。</span>`,
            `<span class="Epic">对方残影走远时踩空了半寸，掉下「赔礼」<i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                gx
            )}</b>。</span>`,
        ])
    );
}


function cloudMeetTravelerExecBtn0(variant, floor) {
        if (variant === "rival") {
            var h0 = Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.14));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h0);
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Rare">你退一步，雾胎归虚，心口反而松快。</span>气血 <span class="Common">+${nFormatter(
                        h0
                    )}</span>。`,
                    `<span class="Epic">「让了。」你话音刚落，对方残影竟也退一步——两个怂包在劫里达成了默契。</span>气血 <span class="Common">+${nFormatter(
                        h0
                    )}</span>。`,
                    `<span class="Rare">不争也是争：你把拳头松开，劫气跟着松一寸。</span>气血 <span class="Common">+${nFormatter(
                        h0
                    )}</span>。`,
                ])
            );
            playerLoadStats();
        } else if (variant === "tao") {
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Common">你稽首为礼，对方残影含笑散去，像说「后会有期」。</span>`,
                    `<span class="Rare">你起身告辞，亭中雾茶自凉——今日论道到此为止，下次再抬杠。</span>`,
                    `<span class="Common">对方影子拱手：「下次别迟到。」你一愣：明明谁也没约时间。</span>`,
                ])
            );
        } else {
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Common">你收摄气机，对方残影亦散入雾中，彼此不欠因果。</span>`,
                    `<span class="Uncommon">你装不认识快步走过，背后传来一声轻笑：「装，继续装。」</span>`,
                    `<span class="Rare">深藏功与名失败：对方还是遥遥拱了拱手，像在给你发「好人卡」。</span>`,
                ])
            );
        }
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
}

function cloudMeetTravelerExecBtn1(variant, floor) {
        if (variant === "rival") {
            var rr = Math.random();
            if (rr < 0.5) {
                var gR = applyGoldGainMult(randomizeNum(72, 195) * floor);
                var amtR = rollDungeonExpFloorRewardAmount();
                player.gold += gR;
                var amtAddedR = dongtianDungeonPlayerExpAddBase(amtR);
                if (amtAddedR) {
                    if (typeof addPetExp === "function") {
                        var psR = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                        addPetExp(Math.max(0, Math.floor(amtR * psR)));
                    }
                    leveled = false;
                    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                    if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
                }
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Legendary">你掌先触胎，雾凝灵砂入手。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            gR
                        )}</b>${dongtianDungeonExpCommaWeiOrHint(amtR, amtAddedR)}。`,
                        `<span class="Epic">快人一步！对方残影跺脚：「下次我开加速器！」</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            gR
                        )}</b>${dongtianDungeonExpCommaWeiOrHint(amtR, amtAddedR)}。`,
                    ])
                );
            } else if (rr < 0.78) {
                var dR = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.15)));
                player.stats.hp = Math.max(1, player.stats.hp - dR);
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Uncommon">胎反噬，指骨生寒。</span>气血 <b>-${nFormatter(dR)}</b>。`,
                        `<span class="Common">你抢得太帅，雾胎不高兴，咬了你一口。</span>气血 <b>-${nFormatter(dR)}</b>。`,
                    ])
                );
            } else {
                dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.004);
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Heirloom">争夺惊动劫脉。</span>秘境敌势 <b>+0.004</b>。`,
                        `<span class="Chronarch">劫界管理员（若有）大概记了你一笔：「吵闹。」敌势 <b>+0.004</b>。</span>`,
                    ])
                );
            }
        } else if (variant === "tao") {
            var amtT = rollDungeonExpFloorRewardAmount();
            var amtAddedT = dongtianDungeonPlayerExpAddBase(amtT);
            if (amtAddedT) {
                if (typeof addPetExp === "function") {
                    var psT = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amtT * psT)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Legendary">三问三答，劫纹自明。</span>` +
                        (amtT > 0 ? dongtianDungeonExpWeiOrHint(amtT, amtAddedT) + "。" : ""),
                    `<span class="Epic">论到兴处，你们竟同时拍案——案是雾做的，拍了个寂寞，但悟是真的。</span>` +
                        (amtT > 0 ? dongtianDungeonExpWeiOrHint(amtT, amtAddedT) + "。" : ""),
                    `<span class="Rare">对方一句「你懂了？」你点头：「懂了点，剩下的装懂。」</span>` +
                        (amtT > 0 ? dongtianDungeonExpWeiOrHint(amtT, amtAddedT) + "。" : ""),
                ])
            );
        } else {
            var cost = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(18, 48) * floor)));
            if (player.gold < cost) {
                addDungeonLog(`<span class="Common">你想赠衬，囊中却不够体面，只好讪讪作罢。</span>`);
                dungeon.status.event = false;
                updateDungeonLog();
                return;
            }
            player.gold -= cost;
            var r = Math.random();
            if (r < 0.5) {
                var amt = rollDungeonExpFloorRewardAmount();
                var amtAddedCvGift = dongtianDungeonPlayerExpAddBase(amt);
                if (amtAddedCvGift) {
                    if (typeof addPetExp === "function") {
                        var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                        addPetExp(Math.max(0, Math.floor(amt * ps)));
                    }
                    leveled = false;
                    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                    if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
                }
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Legendary">对方遥遥一礼，似回一缕悟息。</span>` +
                            (amt > 0 ? dongtianDungeonExpWeiOrHint(amt, amtAddedCvGift) + "。" : ""),
                        `<span class="Epic">「客气。」对方声音像从灵网延迟半拍传来，悟息却不延迟。</span>` +
                            (amt > 0 ? dongtianDungeonExpWeiOrHint(amt, amtAddedCvGift) + "。" : ""),
                    ])
                );
            } else if (r < 0.82) {
                var back = applyGoldGainMult(randomizeNum(35, 95) * floor);
                player.gold += back;
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Epic">雾中抛还一只乾坤袋「多余的」。</span>入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            back
                        )}</b>。`,
                        `<span class="Rare">对方：「太多了拿着沉。」你：「我可以。」灵石入手 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            back
                        )}</b>。</span>`,
                    ])
                );
            } else {
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Uncommon">赠罢只见对方背影摆摆手，像说「心领」——因果轻得很。</span>`,
                        `<span class="Common">对方没收，但留下一句：「下次请喝真的茶。」</span>`,
                    ])
                );
            }
        }
        cloudTravelerMaybeNetBurp(floor);
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
}

function cloudMeetTravelerExecBtn2(variant, floor) {
        if (variant === "rival") {
            var bid = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(28, 68) * floor)));
            if (player.gold < bid) {
                addDungeonLog(`<span class="Common">灵石不够抬价，对方残影嗤笑一声散去。</span>`);
                dungeon.status.event = false;
                updateDungeonLog();
                return;
            }
            player.gold -= bid;
            var r2 = Math.random();
            if (r2 < 0.42) {
                var amtB = rollDungeonExpFloorRewardAmount();
                var retB = applyGoldGainMult(randomizeNum(55, 150) * floor);
                player.gold += retB;
                var amtAddedB = dongtianDungeonPlayerExpAddBase(amtB);
                if (amtAddedB) {
                    if (typeof addPetExp === "function") {
                        var psB = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                        addPetExp(Math.max(0, Math.floor(amtB * psB)));
                    }
                    leveled = false;
                    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                    if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
                }
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Legendary">价高者得，胎随你意。</span>` +
                            (amtB > 0 ? dongtianDungeonExpWeiOrHint(amtB, amtAddedB) + "，并" : "") +
                            `得灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(retB)}</b>。`,
                        `<span class="Epic">灵石砸下去有声，对方残影沉默三息：「……行，你富你说了算。」</span>` +
                            (amtB > 0 ? dongtianDungeonExpWeiOrHint(amtB, amtAddedB) + "，" : "") +
                            `灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(retB)}</b>。`,
                    ])
                );
            } else if (r2 < 0.72) {
                var partial = Math.max(1, Math.floor(bid * randomizeDecimal(0.35, 0.55)));
                player.gold += partial;
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Epic">竞价胶着，各退一步。</span>退回部分灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            partial
                        )}</b>。`,
                        `<span class="Rare">你们同时喊「算了算了」，像两个怕麻烦的土豪。</span>退回 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            partial
                        )}</b>。`,
                    ])
                );
            } else {
                dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.003);
                var crumbs = applyGoldGainMult(randomizeNum(12, 38) * floor);
                player.gold += crumbs;
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Uncommon">争价惹劫气侧目。</span>秘境敌势 <b>+0.003</b>；仅拾得 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            crumbs
                        )}</b>。`,
                        `<span class="Common">劫气捂耳：「别吵。」扔给你一点封口费 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            crumbs
                        )}</b>。</span>敌势 <b>+0.003</b>。`,
                    ])
                );
            }
        } else if (variant === "tao") {
            var amt2 = rollDungeonExpFloorRewardAmount();
            var amtAddedTao2 = dongtianDungeonPlayerExpAddBase(amt2);
            if (amtAddedTao2) {
                if (typeof addPetExp === "function") {
                    var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(amt2 * ps2)));
                }
                leveled = false;
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
            }
            var gT = applyGoldGainMult(randomizeNum(28, 88) * floor);
            player.gold += gT;
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Rare">互报斩魔之数，竟各自气机一振。</span>` +
                        (amt2 > 0 ? dongtianDungeonExpWeiOrHint(amt2, amtAddedTao2) + "，" : "") +
                        `灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(gT)}</b>。`,
                    `<span class="Epic">比着比着变成商业互吹，吹完各自口袋鼓了一点。</span>` +
                        (amt2 > 0 ? dongtianDungeonExpWeiOrHint(amt2, amtAddedTao2) + "，" : "") +
                        `灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(gT)}</b>。`,
                ])
            );
        } else {
            if (Math.random() < 0.55) {
                var g2 = applyGoldGainMult(randomizeNum(48, 140) * floor);
                player.gold += g2;
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Rare">三言两语互换路线，竟推出一条藏砂小径。</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            g2
                        )}</b>。`,
                        `<span class="Legendary">黑话对上了！你们同时压低声音：「懂。」灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                            g2
                        )}</b>。</span>`,
                    ])
                );
            } else {
                var amtK = rollDungeonExpFloorRewardAmount();
                var amtAddedK = dongtianDungeonPlayerExpAddBase(amtK);
                if (amtAddedK) {
                    if (typeof addPetExp === "function") {
                        var psK = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                        addPetExp(Math.max(0, Math.floor(amtK * psK)));
                    }
                    leveled = false;
                    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                    if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
                }
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Epic">对方以指画雾，露一句劫纹口诀。</span>` +
                            (amtK > 0 ? dongtianDungeonExpWeiOrHint(amtK, amtAddedK) + "。" : ""),
                        `<span class="Rare">口诀只有半句，剩下靠猜——你猜对了。</span>` +
                            (amtK > 0 ? dongtianDungeonExpWeiOrHint(amtK, amtAddedK) + "。" : ""),
                    ])
                );
            }
        }
        cloudTravelerMaybeNetBurp(floor);
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        updateDungeonLog();
}

function cloudMeetTravelerExecBtn3(variant, floor) {
        if (variant === "tao") {
            var g3 = applyGoldGainMult(randomizeNum(52, 155) * floor);
            player.gold += g3;
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Epic">对方遥指雾隙：「此处砂薄。」</span>灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                        g3
                    )}</b>。`,
                    `<span class="Legendary">「往东三步别踩那块砖。」你踩了，砖下真有砂；灵石 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(
                        g3
                    )}</b>。</span>`,
                ])
            );
            cloudTravelerMaybeNetBurp(floor);
            playerLoadStats();
            dungeon.status.event = false;
            if (typeof saveData === "function") saveData();
            updateDungeonLog();
            return;
        }
        var combatLine = pickCloudTravelerLine(
            variant === "rival"
                ? [
                      "对方残影冷笑，先出手为强——劫雾凝为试剑石。",
                      "「来真的？」对方残影撸袖子——雾做的袖子，气势到了就行。",
                      "嘴炮落地成钉：劫雾应声凝出一尊斗战残影。",
                  ]
                : [
                      "劫雾所思所忆凝成一抹斗战残影——不论真人何在，先问手中锋刃。",
                      "你起哄成功：对方残影叹气：「行吧，活动筋骨。」",
                      "「比划比划？」四字出口，雾像听懂了，直接捏了个靶子给你打。",
                  ]
        );
        startDangerEventCombat(combatLine, null, {
            minQuality: 5,
            statMul: variant === "rival" ? 1.1 : 1.09,
            rewardMul: 1.14,
            lvlBonus: 0,
            victoryBonus: { extraGoldMul: 0.92, extraExpPct: 0.048 },
        });
}

/** 顶层绑定：onclick 闭包只经过本函数形参，不挂 travelers 接口返回的大对象 */
function bindCloudMeetTravelerButtons(sid, variant, floor) {
    var e0 = document.getElementById(sid + "_0");
    if (e0) e0.onclick = function () { cloudMeetTravelerExecBtn0(variant, floor); };
    var e1 = document.getElementById(sid + "_1");
    if (e1) e1.onclick = function () { cloudMeetTravelerExecBtn1(variant, floor); };
    var e2 = document.getElementById(sid + "_2");
    if (e2) e2.onclick = function () { cloudMeetTravelerExecBtn2(variant, floor); };
    var e3 = document.getElementById(sid + "_3");
    if (e3) e3.onclick = function () { cloudMeetTravelerExecBtn3(variant, floor); };
}

/** 联网奇遇：善缘路遇（见 cloudMeetTravelerEventWithVariant） */
function cloudMeetTravelerEvent() {
    cloudMeetTravelerEventWithVariant("kind");
}

/**
 * 联网奇遇：拉取服务端「近期在线」其他玩家快照，按层数+劫数优先排序；非实时同图，属灵机交错叙事。
 * variant: kind 善缘 | rival 争缘 | tao 论道
 */
function cloudMeetTravelerEventWithVariant(variant) {
    if (isDongtianCloudMeetBlockedByRunMode()) {
        return;
    }
    dungeon.status.event = true;
    var cmtReqGen = ++dongtianCloudMeetRequestGen;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var roomNum = Math.max(1, dungeon.progress && typeof dungeon.progress.room === "number" ? dungeon.progress.room : 1);
    var req = null;
    try {
        req = window.parent && window.parent.goldGameApiRequest;
    } catch (eReq) {
        req = null;
    }
    if (!window.DONGTIAN_CLOUD_MODE || !req) {
        addDungeonLog(`<span class="Common">此劫未接灵网，只闻足音不见人。</span>`);
        dungeon.status.event = false;
        updateDungeonLog();
        return;
    }
    var teaserPoolKind = [
        `<span class="Rare">劫雾一颤，像有人在外界敲了敲你的界壁。</span>`,
        `<span class="Rare">你袖中灵机自鸣——竟是别的道友路过，蹭到了你的劫纹。</span>`,
        `<span class="Epic">远处传来一声极轻的「咦」，像有人与你同时看见了同一片雾。</span>`,
        `<span class="Uncommon">灵网泛起涟漪：有陌生神识与你擦肩而过，又迅速礼貌收束。</span>`,
    ];
    var teaserPoolRival = [
        `<span class="Heirloom">劫气忽聚成涡——像两份贪心跳了同一支舞。</span>`,
        `<span class="Chronarch">雾胎将凝未凝，偏偏有两只手同时按上去。</span>`,
        `<span class="Heirloom">你心头一紧：这机缘「太香」，香到像会招来同类。</span>`,
        `<span class="Epic">劫风倒卷，有人与你同声低喝：「我的！」——回声竟不是你一个人。</span>`,
    ];
    var teaserPoolTao = [
        `<span class="Rare">劫雾深处有人轻笑：「你也卡在这一问？」</span>`,
        `<span class="Epic">石亭残影错落，像有人专门留了半张席给你。</span>`,
        `<span class="Rare">你尚未开口，对方残影已递来一杯「雾茶」——当然是喝不着的，但心意到了。</span>`,
        `<span class="Uncommon">灵网把两句自言自语缝在一起，竟拼成一段像对话的东西。</span>`,
    ];
    var teaser =
        variant === "rival"
            ? pickCloudTravelerLine(teaserPoolRival)
            : variant === "tao"
              ? pickCloudTravelerLine(teaserPoolTao)
              : pickCloudTravelerLine(teaserPoolKind);
    addDungeonLog(teaser);
    updateDungeonLog();
    var travelersUrl =
        "/api/dongtian-jie/travelers?floor=" +
        encodeURIComponent(floor) +
        "&room=" +
        encodeURIComponent(roomNum);
    var pingP =
        typeof window.dongtianPresencePingForce === "function" ? window.dongtianPresencePingForce() : Promise.resolve();
    pingP
        .then(function () {
            if (cmtReqGen !== dongtianCloudMeetRequestGen) {
                return null;
            }
            if (isDongtianCloudMeetBlockedByRunMode()) {
                dungeon.status.event = false;
                if (typeof updateDungeonLog === "function") updateDungeonLog();
                return null;
            }
            return req("GET", travelersUrl, undefined, true);
        })
        .then(function (res) {
            if (res === null) return;
            if (cmtReqGen !== dongtianCloudMeetRequestGen) return;
            if (isDongtianCloudMeetBlockedByRunMode()) {
                dungeon.status.event = false;
                if (typeof updateDungeonLog === "function") updateDungeonLog();
                return;
            }
            if (!res || !res.ok || !Array.isArray(res.travelers) || res.travelers.length === 0) {
                if (cmtReqGen !== dongtianCloudMeetRequestGen) return;
                var tip = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(22, 58) * floor)));
                player.gold += tip;
                var emptyPools = {
                    rival: [
                        `<span class="Common">雾胎散去，只剩你一人握拳——此刻全服都在摸鱼，只剩你认真。</span>`,
                        `<span class="Common">争了个寂寞：对方灵机像断线的风筝，只剩你对着空涡发呆。</span>`,
                        `<span class="Uncommon">你吼「我的！」回声四起，才发现回声全是自己——略尬。</span>`,
                    ],
                    tao: [
                        `<span class="Common">石亭空空，论声原是劫风穿缝——你只好自问自答，也算论道。</span>`,
                        `<span class="Common">茶杯是雾做的，道友也是雾做的：今日茶局，独饮。</span>`,
                        `<span class="Rare">你对着空亭讲了一刻钟，劫纹竟微微一亮——原来寂寞也能当听众。</span>`,
                    ],
                    kind: [
                        `<span class="Common">劫波另一端暂无敌踪，或许他们已在别层摸鱼。</span>`,
                        `<span class="Common">灵网安静得像深夜食堂打烊——只剩你这一盏灯。</span>`,
                        `<span class="Uncommon">你等了等，只等到自己的心跳声，也算「遇见自己」。</span>`,
                    ],
                };
                var vk = variant === "rival" ? "rival" : variant === "tao" ? "tao" : "kind";
                var emptyLine = pickCloudTravelerLine(emptyPools[vk]);
                addDungeonLog(
                    emptyLine +
                        ` 你在空处拾得灵砂 <i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(tip)}</b>。`
                );
                if (Math.random() < 0.2) {
                    var lone = rollDungeonExpFloorRewardAmount();
                    var loneAdded = dongtianDungeonPlayerExpAddBase(lone);
                    if (loneAdded) {
                        if (typeof addPetExp === "function") {
                            var psl = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                            addPetExp(Math.max(0, Math.floor(lone * psl)));
                        }
                        leveled = false;
                        dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                        if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
                    }
                    addDungeonLog(
                        `<span class="Epic">无人可对谈，反倒心湖澄了一寸。</span>` +
                            (lone > 0
                                ? loneAdded
                                    ? `修为 <b>+${nFormatter(lone)}</b>（独悟小补）`
                                    : dongtianDungeonPlayerExpMissedGainHintZh(lone, false)
                                : "") +
                            `。`
                    );
                }
                playerLoadStats();
                dungeon.status.event = false;
                if (typeof saveData === "function") saveData();
                updateDungeonLog();
                return;
            }
            if (cmtReqGen !== dongtianCloudMeetRequestGen) return;
            var pickN = Math.min(3, res.travelers.length);
            var t = res.travelers[Math.floor(Math.random() * pickN)];
            if (req && t && t.echoId) {
                try {
                    req(
                        "POST",
                        "/api/dongtian-jie/traveler-notify",
                        {
                            targetEchoId: t.echoId,
                            variant: variant,
                            fromName: player && player.name != null ? String(player.name) : "",
                            myFloor: floor,
                            myRoom: roomNum,
                        },
                        true
                    ).catch(function () {});
                } catch (eNf) {}
            }
            var nm = escapeDungeonLogText(t.name || "道友");
            var gr = escapeDungeonLogText(t.grade || "");
            var gline = gr ? `劫境 <b>${gr}</b> · ` : "";
            var killLine =
                typeof t.kills === "number" && t.kills > 0
                    ? `累计斩魔 <b>${nFormatter(Math.floor(t.kills))}</b> · `
                    : "";
            var tf = Math.floor(Number(t.floor) || 1);
            var tr = Math.floor(Number(t.room) || 1);
            var sid = "cmt_" + Date.now() + "_" + (variant === "rival" ? "r" : variant === "tao" ? "t" : "k");
            var vibe = buildCloudTravelerVibeHtml(t, floor, roomNum);
            var intro;
            var choices;
            if (variant === "rival") {
                intro =
                    `<span class="Chronarch">机缘撞车</span>——<span class="Epic">「${nm}」</span>与你同时扣住一缕将凝的雾胎。` +
                    gline +
                    killLine +
                    `其残影似在<b>第${tf}层 · 劫数${tr}</b>，与你角力不散。<br>` +
                    vibe;
                choices =
                    '<div class="decision-panel">' +
                    '<button type="button" id="' +
                    sid +
                    '_1">先手为强·夺胎</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_2">砸灵石抬价</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_3">嘴炮激上去·切磋</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_0">认怂保平安</button>' +
                    "</div>";
            } else if (variant === "tao") {
                intro =
                    `<span class="Epic">道友「${nm}」</span>的残影临亭，似在等你接一句劫问。` +
                    gline +
                    killLine +
                    `其在<b>第${tf}层 · 劫数${tr}</b>留下的思路，竟与你气机相接。<br>` +
                    vibe;
                choices =
                    '<div class="decision-panel">' +
                    '<button type="button" id="' +
                    sid +
                    '_1">坐而论「劫」（正经版）</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_2">比谁砍怪多（幼稚但有效）</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_3">求个路条·指条财路</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_0">拱手下一把再见</button>' +
                    "</div>";
            } else {
                intro =
                    `<span class="Epic">路遇修士「${nm}」</span>的灵机残影——` +
                    gline +
                    killLine +
                    `似在<b>第${tf}层 · 劫数${tr}</b>与你交错一瞬。<br>` +
                    vibe;
                choices =
                    '<div class="decision-panel">' +
                    '<button type="button" id="' +
                    sid +
                    '_1">塞一袋盘缠（赠灵石）</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_2">偷师一句「劫中黑话」</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_3">起哄：「比划比划？」</button>' +
                    '<button type="button" id="' +
                    sid +
                    '_0">装作路过·深藏功与名</button>' +
                    "</div>";
            }
            addDungeonLog(intro, choices);
            if (Math.random() < 0.045) {
                addDungeonLog(
                    pickCloudTravelerLine([
                        `<span class="Uncommon">灵网杂音一闪：像有人在极远处喊「……信号不好！」又断了。</span>`,
                        `<span class="Rare">你们二人的灵机对撞，竟在日志里擦出半句乱码——<b>※□道友□※</b>。</span>`,
                        `<span class="Common">你怀疑对方也在同一瞬间打了个喷嚏：劫数奇妙地同步了半拍。</span>`,
                    ])
                );
            }

            if (cmtReqGen !== dongtianCloudMeetRequestGen) return;
            bindCloudMeetTravelerButtons(sid, variant, floor);
            // 如需在此刷新日志：updateDungeonLog() 会 detach/回填 .decision-panel 真实节点，已绑定的按钮监听会保留。
        })
        .catch(function () {
            if (cmtReqGen !== dongtianCloudMeetRequestGen) return;
            if (isDongtianCloudMeetBlockedByRunMode()) {
                dungeon.status.event = false;
                if (typeof updateDungeonLog === "function") updateDungeonLog();
                return;
            }
            addDungeonLog(
                pickCloudTravelerLine([
                    `<span class="Common">灵机与灵网一时脱节，未能辨明敌友。</span>`,
                    `<span class="Uncommon">传讯符糊脸：「网络繁忙，请渡劫后再试。」</span>`,
                    `<span class="Rare">灵网卡成ppt，道友残影卡在翻页动画里——今日无缘。</span>`,
                ])
            );
            dungeon.status.event = false;
            updateDungeonLog();
        });
}

// 顿悟：直接涨修为条
const insightEvent = () => {
    const amt = rollDungeonExpFloorRewardAmount();
    if (!amt) {
        addDungeonLog(`<span class="Common">本层机缘已尽，灵台暂难再悟。</span>`);
        dungeon.status.event = false;
        saveData();
        return;
    }
    if (!dongtianDungeonPlayerExpAddBase(amt)) {
        addDungeonLog(`<span class="Common">本层境下修为已达上限，灵台再难容纳更多感悟。</span>`);
        dungeon.status.event = false;
        saveData();
        return;
    }
    if (typeof addPetExp === "function") {
        var pShare = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
        addPetExp(Math.max(0, Math.floor(amt * pShare)));
    }
    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
    if (leveled) {
        lvlupPopup();
    }
    playerLoadStats();
    const line = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("insight") : "你忽有所悟。";
    addDungeonLog(`<span class="Legendary">${line}</span>`);
    addDungeonLog(`心绪澄明，修为涌入丹田：<b>+${nFormatter(amt)}</b> 点感悟。`);
    saveData();
    dungeon.status.event = false;
};

// 残丹：随机祸福
const remnantPillEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("pill_intro") : "石缝间躺着一枚残丹……";
    const choices = `
        <div class="decision-panel">
            <button id="choice1">吞服残丹</button>
            <button id="choice2">弃之不顾</button>
        </div>`;
    addDungeonLog(`<span class="Uncommon">${intro}</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        const roll = Math.random();
        if (roll < 0.4) {
            const heal = Math.round(player.stats.hpMax * randomizeDecimal(0.11, 0.24));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            const g = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("pill_good") : "药力温和。";
            addDungeonLog(`${g} 气血回复 <span class="Common">${nFormatter(heal)}</span>。`);
        } else if (roll < 0.76) {
            const gold = applyGoldGainMult(randomizeNum(35, 180) * Math.max(1, dungeon.progress.floor));
            player.gold += gold;
            const g = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("pill_gold") : "丹壳化开，内蕴细碎灵石。";
            addDungeonLog(`${g} 入手灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else if (roll < 0.9) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedRp = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedRp) {
                if (typeof addPetExp === "function") {
                    var pShare2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare2)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) {
                    lvlupPopup();
                }
            }
            addDungeonLog(
                expAmt > 0
                    ? expAddedRp
                        ? `药力化开，竟引动修为：<b>+${nFormatter(expAmt)}</b> 点感悟。`
                        : `药力化开，灵机涌动，却难再入丹田：` + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false)
                    : `药力化开，灵台却再难多悟一分。`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * 0.065));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            const b = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("pill_bad") : "药性相冲。";
            addDungeonLog(`<span class="Common">${b}</span> 气血流失 <span class="Common">${nFormatter(dmg)}</span>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        addDungeonLog("你掩鼻而过——修仙路上，慎独二字常救命。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 星晷盘：三选一的轻量博弈玩法（稳/搏/退）
const starCompassEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("star_compass_intro") : "一座残缺星晷在雾中缓缓转动。";
    const choices = `
        <div class="decision-panel">
            <button type="button" id="sc1">稳推盘纹（小赚）</button>
            <button type="button" id="sc2">逆拧星针（豪赌）</button>
            <button type="button" id="sc3">收手离开</button>
        </div>`;
    addDungeonLog(`<span class="Rare">${intro}</span>`, choices);

    document.querySelector("#sc1").onclick = function () {
        const gold = applyGoldGainMult(randomizeNum(16, 52) * Math.max(1, dungeon.progress.floor));
        player.gold += gold;
        if (typeof pickXiuxianQuote === "function") {
            addDungeonLog(pickXiuxianQuote("star_compass_win"));
        }
        addDungeonLog(`你稳稳落子，得灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#sc2").onclick = function () {
        if (Math.random() < 0.46) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedSc = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedSc) {
                if (typeof addPetExp === "function") {
                    var pShare3 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare3)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) {
                    lvlupPopup();
                }
            }
            if (typeof pickXiuxianQuote === "function") {
                addDungeonLog(pickXiuxianQuote("star_compass_win"));
            }
            addDungeonLog(
                `你逆拧星针成功，识海明澈` +
                    (expAmt > 0
                        ? expAddedSc
                            ? `：<b>+${nFormatter(expAmt)}</b> 点感悟。`
                            : `：` + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "。"
                        : "。")
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.12)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            if (typeof pickXiuxianQuote === "function") {
                addDungeonLog(`<span class="Common">${pickXiuxianQuote("star_compass_fail")}</span>`);
            }
            addDungeonLog(`星晷回震，气血 <b>-${nFormatter(dmg)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#sc3").onclick = function () {
        addDungeonLog("你掐灭心头贪念，只记下盘纹走向，转身离去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 雾中酒肆骰局：只看不赌 / 押注 / 溜
const sillyDrunkDiceEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("silly_drunk_dice_intro") : "雾中酒肆，骰声叮当。";
    const floor = Math.max(1, dungeon.progress.floor);
    const stake = Math.max(1, Math.floor(10 * floor + randomizeNum(4, 28)));
    const choices = `
        <div class="decision-panel">
            <button type="button" id="dd1">只看不赌（蹭口酒气）</button>
            <button type="button" id="dd2">袖里藏骰（押 ${stake} 灵石）</button>
            <button type="button" id="dd3">告辞，我怕劫数传染</button>
        </div>`;
    addDungeonLog(`<span class="Uncommon">${intro}</span>`, choices);

    document.querySelector("#dd1").onclick = function () {
        const gold = applyGoldGainMult(randomizeNum(3, 14) * floor);
        player.gold += gold;
        addDungeonLog(`你抿了一口别人杯边的酒气，竟捡到前人落在桌缝的灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。摊主嘟囔：『白喝还拿，讲究。』`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#dd2").onclick = function () {
        if (player.gold < stake) {
            addDungeonLog(`灵石不够押注，摊主把骰盅一盖：『道友，空口袋别学人潇洒。』`);
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= stake;
        const you = randomizeNum(1, 6);
        const ta = randomizeNum(1, 6);
        if (you > ta) {
            const win = applyGoldGainMult(Math.round(stake * randomizeDecimal(2.0, 2.8)));
            player.gold += win;
            addDungeonLog(`你掷出 <b>${you}</b>，摊主 <b>${ta}</b>。你大笑收子，净得灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(win)}（已扣本金）。`);
        } else if (you < ta) {
            addDungeonLog(`你掷出 <b>${you}</b>，摊主 <b>${ta}</b>。骰子冷笑，你的灵石已归酒缸。`);
        } else {
            const back = Math.max(1, Math.floor(stake * 0.55));
            player.gold += back;
            addDungeonLog(`双方皆 <b>${you}</b>，摊主叹『和局最无聊』，退你半注：${nFormatter(back)} 灵石。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#dd3").onclick = function () {
        addDungeonLog("你拱手告辞，身后骰声渐远，像劫数在拍别人的肩。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 灵兽赛跑：押三甲之一
const sillyBeastRaceEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("silly_beast_race_intro") : "三只灵兽跃跃欲试。";
    const choices = `
        <div class="decision-panel">
            <button type="button" id="br1">押甲兽（腿短志不短）</button>
            <button type="button" id="br2">押乙兽（嘴大吃四方）</button>
            <button type="button" id="br3">押丙兽（眼神清澈）</button>
            <button type="button" id="br4">不押，看热闹</button>
        </div>`;
    addDungeonLog(`<span class="Rare">${intro}</span>`, choices);
    const winner = randomizeNum(0, 2);
    const names = ["甲兽", "乙兽", "丙兽"];

    const finish = (pick) => {
        addDungeonLog(`发令一响，三道影子窜出——<b>${names[winner]}</b>率先撞线！`);
        if (pick === null) {
            addDungeonLog("你在旁边鼓掌，心情变好，但荷包没动。");
        } else if (pick === winner) {
            const floor = Math.max(1, dungeon.progress.floor);
            const gold = applyGoldGainMult(randomizeNum(22, 55) * floor);
            player.gold += gold;
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedBr = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedBr) {
                if (typeof addPetExp === "function") {
                    var pShare = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) {
                    lvlupPopup();
                }
            }
            addDungeonLog(
                `你押中了！庄家不情愿地拍出灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}` +
                    (expAmt > 0
                        ? expAddedBr
                            ? `，另有一丝感悟 <b>+${nFormatter(expAmt)}</b>`
                            : "，" + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false)
                        : "") +
                    `。`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.03, 0.07)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`押错！率先撞线的是 <b>${names[winner]}</b>。你被人群肘了一下，气血 <b>-${nFormatter(dmg)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#br1").onclick = function () { finish(0); };
    document.querySelector("#br2").onclick = function () { finish(1); };
    document.querySelector("#br3").onclick = function () { finish(2); };
    document.querySelector("#br4").onclick = function () { finish(null); };
};

// 讹蛙：赏钱听真话 / 弹脑门 / 走
const sillyFrogEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("silly_frog_intro") : "一只蛤蟆开口索灵石。";
    const tip = Math.max(1, Math.floor(6 + randomizeNum(0, dungeon.progress.floor * 2)));
    const choices = `
        <div class="decision-panel">
            <button type="button" id="fr1">赏 ${tip} 灵石听一句『真言』</button>
            <button type="button" id="fr2">弹指它脑门（免费）</button>
            <button type="button" id="fr3">绕道走</button>
        </div>`;
    addDungeonLog(`<span class="Common">${intro}</span>`, choices);

    const truths = [
        "『修仙最费的不是灵石，是睡眠。』",
        "『你背包里一定有一件舍不得扔的破烂。』",
        "『下一层可能更难，也可能更难——我数学不好。』",
        "『天道酬勤，但偶尔酬脸。』",
        "『我不是灵兽，我是气氛组。』",
    ];

    document.querySelector("#fr1").onclick = function () {
        if (player.gold < tip) {
            addDungeonLog("灵石不够，蛤蟆翻了个白眼，鼓腮不语。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= tip;
        const line = truths[Math.floor(Math.random() * truths.length)];
        if (Math.random() < 0.35) {
            const gold = applyGoldGainMult(randomizeNum(8, 28) * Math.max(1, dungeon.progress.floor));
            player.gold += gold;
            addDungeonLog(`蛤蟆收了灵石，郑重道：${line} 说完从舌下吐出一粒灵石屑：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else {
            addDungeonLog(`蛤蟆收了灵石，郑重道：${line} 你细品，竟觉有几分道理。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#fr2").onclick = function () {
        if (Math.random() < 0.55) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedFrog = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedFrog) {
                if (typeof addPetExp === "function") {
                    var pShare2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare2)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) {
                    lvlupPopup();
                }
            }
            addDungeonLog(
                `你弹指一击，蛤蟆凌空转体三周半，落地竟递来一丝明悟` +
                    (expAmt > 0
                        ? expAddedFrog
                            ? `——感悟 <b>+${nFormatter(expAmt)}</b>`
                            : "——" + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false)
                        : "") +
                    `。（别问原理）`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.09)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`蛤蟆舌弹如鞭，你指尖一麻——气血 <b>-${nFormatter(dmg)}</b>。它歪头：『外包也是有尊严的。』`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#fr3").onclick = function () {
        addDungeonLog("你选择不与气氛组纠缠，道心一片祥和。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 假仙卖符：买符 / 揭穿 / 走
const sillyFakeSageEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("silly_fake_sage_intro") : "路边有人卖飞升符。";
    const floor = Math.max(1, dungeon.progress.floor);
    const price = Math.max(1, Math.floor(18 * floor + randomizeNum(5, 40)));
    const choices = `
        <div class="decision-panel">
            <button type="button" id="fs1">请符一张（${price} 灵石）</button>
            <button type="button" id="fs2">当场揭穿</button>
            <button type="button" id="fs3">微笑离开</button>
        </div>`;
    addDungeonLog(`<span class="Epic">${intro}</span>`, choices);

    document.querySelector("#fs1").onclick = function () {
        if (player.gold < price) {
            addDungeonLog("灵石不足，假仙把符纸当扇子扇风，假装没看见你。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= price;
        const roll = Math.random();
        if (roll < 0.52) {
            const refund = applyGoldGainMult(Math.max(1, Math.floor(price * randomizeDecimal(0.15, 0.45))));
            player.gold += refund;
            addDungeonLog(`符纸入手轻飘飘，你一晃，竟抖出几粒灵石渣——约莫是前人塞的：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(refund)}。假仙：『看，灵不灵？』`);
        } else if (roll < 0.82) {
            const gold = applyGoldGainMult(randomizeNum(25, 70) * floor);
            player.gold += gold;
            addDungeonLog(`符上朱砂忽然一亮又熄——你竟从残韵里抠出灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。假仙立刻改口：『此乃缘分价。』`);
        } else {
            addDungeonLog(`符纸遇风自燃，只剩一句焦味。假仙正色：『飞升要循序渐进，你这一步叫交学费。』`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#fs2").onclick = function () {
        if (Math.random() < 0.5) {
            const gold = applyGoldGainMult(randomizeNum(12, 35) * floor);
            player.gold += gold;
            addDungeonLog(`你指出符脚错字三处，围观散修哄笑，摊主塞给你封口灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)} 溜了。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.1)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`摊主袖中喷出一口『除尘雾』，你呛得眼泪直流——气血 <b>-${nFormatter(dmg)}</b>。他喊：『诽谤！这是艺术加工！』`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#fs3").onclick = function () {
        addDungeonLog("你笑而不语，把『飞升』留给下次，把灵石留给荷包。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 盲盒葫芦：三选一
const sillyGourdEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("silly_gourd_intro") : "三只葫芦挂在藤上。";
    const choices = `
        <div class="decision-panel">
            <button type="button" id="sg1">开左葫</button>
            <button type="button" id="sg2">开中葫</button>
            <button type="button" id="sg3">开右葫</button>
            <button type="button" id="sg4">一个都不开</button>
        </div>`;
    addDungeonLog(`<span class="Uncommon">${intro}</span>`, choices);

    const open = () => {
        const r = Math.random();
        const floor = Math.max(1, dungeon.progress.floor);
        if (r < 0.38) {
            const heal = Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.18));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            addDungeonLog(`塞子一开，药香扑面——陈年回气散！气血回复 <span class="Common">${nFormatter(heal)}</span>。`);
        } else if (r < 0.72) {
            const gold = applyGoldGainMult(randomizeNum(20, 58) * floor);
            player.gold += gold;
            addDungeonLog(`葫芦里滚出灵石若干，你怀疑是上一任倒霉鬼存的私房：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else if (r < 0.9) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedGourd = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedGourd) {
                if (typeof addPetExp === "function") {
                    var pShare3 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare3)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) {
                    lvlupPopup();
                }
            }
            addDungeonLog(
                `葫里飞出一缕青烟钻入眉心，你脑中多了句没用但顺口的口诀` +
                    (expAmt > 0
                        ? expAddedGourd
                            ? `——感悟 <b>+${nFormatter(expAmt)}</b>`
                            : "——" + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false)
                        : "") +
                    `。`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.11)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`开葫瞬间，陈年丹粉呛入肺腑……你咳出眼泪，气血 <b>-${nFormatter(dmg)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#sg1").onclick = open;
    document.querySelector("#sg2").onclick = open;
    document.querySelector("#sg3").onclick = open;
    document.querySelector("#sg4").onclick = function () {
        addDungeonLog("你克制了好奇心——葫芦在藤上轻轻叹气。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

/** 恶搞奇遇：地上像遗器/至宝，按钮写「收获」类，实为普通遭遇战，敌名用整活文案 */
const DUNGEON_PRANK_LOOT_DEFS = [
    {
        logHtml:
            `雾薄处地上插着一口<span class="Legendary">「至尊·会自动碰瓷的玄铁剑坯」</span>，旁贴纸条：「摸我者，大道可期。」`,
        harvestBtn: "伸手握住剑柄（收获）",
        twistHtml:
            `<span class="Epic">剑坯滋啦立起——哪是玄铁，是一条<span class="Legendary">铁线剑虫·专蹭传说热度</span>，牙口还挺礼貌地冲你哈气，像在说：热搜位借我蹭蹭。</span>`,
        battleName: "铁线剑虫·专蹭传说热度",
    },
    {
        logHtml:
            `石缝里卡着一枚<span class="Heirloom">「太古·自动认主玉佩（演示版）」</span>，玉光闪得你眼睛发酸，像廉价琉璃对着太阳。`,
        harvestBtn: "点击收获",
        twistHtml:
            `你一碰，玉佩「啪」地吸在指腹上甩不掉——竟是<span class="Legendary">碰瓷玉妖·粘指不走</span>，还发出满足的咕噜声，仿佛签下了不平等认主条约。`,
        battleName: "碰瓷玉妖·粘指不走",
    },
    {
        logHtml:
            `地上摆着半副<span class="Epic">「混沌至宝·丹炉盖（单卖）」</span>，盖钮上刻着「凑齐炉身另售」。`,
        harvestBtn: "捡起入囊",
        twistHtml:
            `盖沿一翻，底下钻出<span class="Rare">哐当盖妖·专吓捡漏王</span>，抡圆了朝你脑门作势要扣：「买一送一惊不惊喜？」`,
        battleName: "哐当盖妖·专吓捡漏王",
    },
    {
        logHtml:
            `一件<span class="Legendary">「神装·闪瞎狗眼铠甲（塑料镀膜版）」</span>摊在苔上，反光刺眼得像客栈招牌。`,
        harvestBtn: "揣入囊中",
        twistHtml:
            `铠甲一缩，原是<span class="Epic">塑胶铠寄居蟹·冒充神兵</span>，钳子还比了个「耶」——你怀疑它在嘲讽你的审美。`,
        battleName: "塑胶铠寄居蟹·冒充神兵",
    },
    {
        logHtml:
            `浮空悬着<span class="Rare">「传说项链·戴了必脱单（免责声明：不包成）」</span>，链环上还挂着小纸符。`,
        harvestBtn: "认了这因果，收下",
        twistHtml:
            `项链一绕腕，符纸化作<span class="Uncommon">桃花劫精·专搞心态</span>，笑得比你还想谈恋爱，并贴心提示：本劫不提供售后。`,
        battleName: "桃花劫精·专搞心态",
    },
    {
        logHtml:
            `泥里半埋<span class="Epic">「上古靴印·踩一脚涨十年功力（印刷体）」</span>，脚印边缘工整得像模具压的。`,
        harvestBtn: "踩上去试试（收获机缘）",
        twistHtml:
            `脚底一沉，泥下拱出<span class="Legendary">脚印泥傀·盗版上古</span>，瓮声瓮气：「十年功力没有，十记老拳现货，要不要？」`,
        battleName: "脚印泥傀·盗版上古",
    },
    {
        logHtml:
            `树杈挂着<span class="Heirloom">「绝版灵宠蛋·已孵化（请勿摇晃）」</span>，蛋壳上真写着「已孵化」三个大字。`,
        harvestBtn: "轻轻摘下",
        twistHtml:
            `蛋壳裂开，跳出<span class="Rare">空壳蹦迪妖·绝版个寂寞</span>，空心里还回响「Surprise」——你感觉自己被套路了，但找不到证据。`,
        battleName: "空壳蹦迪妖·绝版个寂寞",
    },
    {
        logHtml:
            `地上躺着<span class="Legendary">「鸿蒙第一·鼠标垫款飞剑」</span>，薄得像纸，剑脊还印着「办公修仙」。`,
        harvestBtn: "拾取飞剑",
        twistHtml:
            `飞剑卷起，原来是<span class="Epic">裁纸风妖·通勤版</span>，专割道袍下摆不割人，还附赠一句：「道友，KPI 完成了吗？」`,
        battleName: "裁纸风妖·通勤版",
    },
    {
        logHtml:
            `路边立着一口<span class="Epic">「先天功德箱·扫码随喜（灵石投口）」</span>，箱面写着：心诚则零，投多不灵。`,
        harvestBtn: "投点灵石沾沾功德",
        twistHtml:
            `箱盖弹开，伸出一只木手把灵石全搂进去——<span class="Legendary">噬财木魈·随喜个鬼</span>咧嘴：「谢谢老板，下次还来。」`,
        battleName: "噬财木魈·随喜个鬼",
    },
    {
        logHtml:
            `青苔上摆着一只<span class="Rare">「无名大能遗留·左脚拖鞋（单只）」</span>，鞋印旁刻着：右脚在下一层（小字几乎看不见）。`,
        harvestBtn: "拾取前辈遗物",
        twistHtml:
            `拖鞋一抖，腾起青烟凝成<span class="Uncommon">脚气成精·左脚限定</span>，气势汹汹：「谁让你闻了？这是付费剧情！」`,
        battleName: "脚气成精·左脚限定",
    },
    {
        logHtml:
            `虚空裂隙边卡着一枚<span class="Legendary">「破碎虚空·门把手（样品非卖）」</span>，把手上贴着「飞升请轻拧」。`,
        harvestBtn: "轻拧试试飞升",
        twistHtml:
            `把手脱落，钻出<span class="Epic">门把虚空螨·卡飞升税</span>：「过路费交一下，不然让你卡在筑基一辈子。」`,
        battleName: "门把虚空螨·卡飞升税",
    },
    {
        logHtml:
            `地上摊着半块<span class="Heirloom">「AI 算卦龟甲·已联网（信号一格）」</span>，龟甲屏闪：正在为您生成劫数……`,
        harvestBtn: "戳一下刷新运势",
        twistHtml:
            `龟甲嗡鸣，爬出<span class="Rare">赛博龟灵·只会复读</span>，嘴里循环：「大吉……大凶……大吉……」你听得道心都要分裂。`,
        battleName: "赛博龟灵·只会复读",
    },
    {
        logHtml:
            `石壁贴着一张<span class="Epic">「师尊同款·高冷背影贴纸（含氛围感）」</span>，细看只有背影，正面写着：想象区。`,
        harvestBtn: "揭下来供起来",
        twistHtml:
            `贴纸离墙，化作<span class="Uncommon">背影贴纸妖·无脸师尊</span>：「看什么看，师尊今天也没空理你。」`,
        battleName: "背影贴纸妖·无脸师尊",
    },
    {
        logHtml:
            `锦盒半开，露出一盒<span class="Rare">「九天玄女联名胭脂（保质期：上周）」</span>，香得发苦，像过期执念。`,
        harvestBtn: "蘸一点试试色",
        twistHtml:
            `盒底爬出<span class="Epic">胭脂盒虱·专啃过期美</span>，振翅嗡嗡：「美不美另说，你先交审美税。」`,
        battleName: "胭脂盒虱·专啃过期美",
    },
    {
        logHtml:
            `斜插地里一根<span class="Legendary">「渡劫避雷针·次日达（包邮）」</span>，针尖对你友好地眨了眨——不，是电火花。`,
        harvestBtn: "拔出来当兵器",
        twistHtml:
            `针身扭动，竟是<span class="Heirloom">避雷针成精·嫌雷细</span>，怒道：「你这劫云跟加湿器似的，给我换粗的！」`,
        battleName: "避雷针成精·嫌雷细",
    },
    {
        logHtml:
            `浮着一枚<span class="Epic">「本命飞剑·限定皮肤（仅外观无属性）」</span>，皮肤写着：战令等级 999 解锁真伤。`,
        harvestBtn: "一键装备皮肤",
        twistHtml:
            `皮肤剥落，露出<span class="Rare">皮肤寄生菌·PVP洁癖</span>：「敢不氪？我让你丑着进战斗统计！」`,
        battleName: "皮肤寄生菌·PVP洁癖",
    },
    {
        logHtml:
            `地上散落点点<span class="Legendary">「修为光屑·捡漏专区」</span>，像谁渡劫失败撒了一地简历。`,
        harvestBtn: "蹲下狂捡",
        twistHtml:
            `光屑聚成一团<span class="Uncommon">修为诈骗菇·吃了打嗝</span>：「恭喜获得『好像涨了』体验卡，实体伤害另算。」`,
        battleName: "修为诈骗菇·吃了打嗝",
    },
    {
        logHtml:
            `石台上躺着<span class="Heirloom">「洪荒残片·此面朝上（翻面无效）」</span>，你刚想翻，它自己抖了一下表示抗议。`,
        harvestBtn: "翻面验货",
        twistHtml:
            `残片翻身骑脸，现出<span class="Epic">翻面杠精兽·永朝下</span>：「说了此面朝上，你手欠是吧？」`,
        battleName: "翻面杠精兽·永朝下",
    },
    {
        logHtml:
            `树皮上糊着<span class="Rare">「洞府旺铺招租·押一付三（可撕）」</span>，小字：撕下即视为同意成为保洁。`,
        harvestBtn: "撕下来研究行情",
        twistHtml:
            `纸边割手，化作<span class="Legendary">广告纸妖·维权到姥姥家</span>：「合同生效，先扫三年落叶！」`,
        battleName: "广告纸妖·维权到姥姥家",
    },
    {
        logHtml:
            `木牌高悬：<span class="Epic">「闭关勿扰（自动复读）」</span>，牌面每隔一息就震一下：勿扰、勿扰、勿扰……`,
        harvestBtn: "摘牌清净一下",
        twistHtml:
            `木牌开口，竟是<span class="Rare">复读牌匾精·闭不闭关都响</span>：「你也别想安静，大家一起吵。」`,
        battleName: "复读牌匾精·闭不闭关都响",
    },
    {
        logHtml:
            `石缝里飘出半句<span class="StellarSign">「前辈心法……（下一句要充会员）」</span>，字迹自带「未完待续」水印。`,
        harvestBtn: "把半句抄下来",
        twistHtml:
            `墨迹缠腕，凝成<span class="Heirloom">半句心魔·续费解锁</span>，阴笑：「首句免费，走火入魔包月八折。」`,
        battleName: "半句心魔·续费解锁",
    },
    {
        logHtml:
            `泥地上半块<span class="Legendary">「师门准入令（高仿·扫码验真伪）」</span>，二维码是一团苔藓。`,
        harvestBtn: "揣好混进山门",
        twistHtml:
            `令牌贴肉发烫，钻出<span class="Epic">仿制令牌蜱·吸丹田气</span>：「高仿也是仿，仿费交一下。」`,
        battleName: "仿制令牌蜱·吸丹田气",
    },
    {
        logHtml:
            `虚空掉下一个<span class="Heirloom">「天道压缩包·解压需修为 16 级」</span>，你明明才十几级，它却已经开始自我感动式解压。`,
        harvestBtn: "强行解压看看",
        twistHtml:
            `包体鼓胀，爬出<span class="Rare">压缩包蠕虫·越解越胖</span>：「别解压了，再解我渡劫了！」`,
        battleName: "压缩包蠕虫·越解越胖",
    },
    {
        logHtml:
            `保温杯敞着口，泡满<span class="Epic">「枸杞·仙家养生特供（上火版）」</span>，热气里隐约有一张愤怒的脸。`,
        harvestBtn: "喝一口补补",
        twistHtml:
            `枸杞炸成<span class="Legendary">枸杞火妖·养生式喷火</span>：「年轻人少熬夜——先吃我一记温补！」`,
        battleName: "枸杞火妖·养生式喷火",
    },
    {
        logHtml:
            `草丛里躺着<span class="Rare">「失传剑诀 U 盘（Type-δ）」</span>，接口还在冒微弱的灵力火花。`,
        harvestBtn: "插入神识读取",
        twistHtml:
            `U 盘弹窗刷屏，跳出<span class="Uncommon">剑诀病毒灵·强制弹广告</span>：「恭喜道友，心魔已为您自动下载。」`,
        battleName: "剑诀病毒灵·强制弹广告",
    },
    {
        logHtml:
            `地上摆着<span class="Legendary">「全自动炼丹炉（电池另购）」</span>，炉底贴着：本品不含丹，只含态度。`,
        harvestBtn: "开机验炉",
        twistHtml:
            `炉盖飞起，滚出<span class="Epic">空炉戏精·卖情绪价值</span>：「丹没有，氛围给满，五星好评谢谢。」`,
        battleName: "空炉戏精·卖情绪价值",
    },
    {
        logHtml:
            `树洞伸出一只手，递来<span class="Heirloom">「机缘盲盒·拆开不退」</span>，盒子轻得像只有空气和自信。`,
        harvestBtn: "当场拆开",
        twistHtml:
            `盒里窜出<span class="Rare">盲盒空气妖·自信包邮</span>：「惊不惊喜？里面是『你的沉默』典藏款。」`,
        battleName: "盲盒空气妖·自信包邮",
    },
    {
        logHtml:
            `水面漂着<span class="Epic">「真仙同款·踩水不湿鞋垫（男款）」</span>，鞋垫还在给自己打五星好评。`,
        harvestBtn: "捞起来试穿",
        twistHtml:
            `鞋垫吸水膨胀，化作<span class="Legendary">鞋垫水蛭·好评返现</span>：「亲，差评会湿鞋哦。」`,
        battleName: "鞋垫水蛭·好评返现",
    },
    {
        logHtml:
            `石碑刻着：<span class="StellarSign">「此地无银三百两（反话秘境版）」</span>，碑脚真堆着三百两灵石粉。`,
        harvestBtn: "信碑还是信钱",
        twistHtml:
            `石粉聚形，站起<span class="Heirloom">反话碑灵·你信就输</span>：「我说没有你就信？道友真好骗。」`,
        battleName: "反话碑灵·你信就输",
    },
    {
        logHtml:
            `地上躺着<span class="Rare">「道侣契约（草稿·甲方空白）」</span>，钢笔自己跳动，像等你签名。`,
        harvestBtn: "先按个手印",
        twistHtml:
            `纸面翻卷，缠出<span class="Epic">契约草稿精·甲方是你</span>：「空白也是条款，解释权归我。」`,
        battleName: "契约草稿精·甲方是你",
    },
    {
        logHtml:
            `雾里有人吆喝：<span class="Legendary">「清仓大甩卖·先天一炁买一送一」</span>，摊上就一个空瓶，瓶底写着「送的那口已喝」。`,
        harvestBtn: "问问怎么买",
        twistHtml:
            `摊主掀布，露出<span class="Uncommon">一炁推销员·空瓶也是货</span>：「道友，虚无也是一种库存。」`,
        battleName: "一炁推销员·空瓶也是货",
    },
];

const DUNGEON_PRANK_LOOT_TAGS = [
    "【似像非像】",
    "【捡漏雷达滴滴响】",
    "【道心小声说：别捡】",
    "【此物与我有孽缘？】",
    "【一眼假·手却很诚实】",
    "【机缘还是整活】",
    "【师尊看了会沉默】",
    "【天道疑似在摸鱼】",
    "【直觉比剑快】",
    "【上次上当还是上次】",
];

const DUNGEON_PRANK_LOOT_NOPE_LINES = [
    `<span class="Common">你多看一眼都觉得道心不稳，转身就走。</span>`,
    `<span class="Common">你掐诀默念「不贪不嗔」，硬是把伸出去的手缩回袖里。</span>`,
    `<span class="Common">你想起师门戒律第八条：捡来的机缘，十之八九是碰瓷。</span>`,
    `<span class="Common">你装作没看见，雾都替你尴尬地浓了半分。</span>`,
    `<span class="Common">你肃然起敬：整活也是劫，但今日这劫让给有缘人。</span>`,
];

/** 恶搞假遗器：碰瓷怪比普通野怪更硬，打赢多给一点补偿 */
function applyPrankLootAmbushEnemyBoost() {
    if (typeof enemy === "undefined" || !enemy || typeof dungeon === "undefined" || !dungeon || !dungeon.progress) return;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var gap = Math.max(1, dungeon.settings && typeof dungeon.settings.enemyLvlGap === "number" ? dungeon.settings.enemyLvlGap : 5);
    var baseMax = floor * gap + ((dungeon.settings && dungeon.settings.enemyBaseLvl ? dungeon.settings.enemyBaseLvl : 1) - 1);
    var minLvl = baseMax - (gap - 1);
    var overshoot = Math.max(1, Math.floor(gap * 0.56));
    var targetLvl = Math.min(baseMax + overshoot, baseMax + gap);
    enemy.lvl = Math.max(typeof enemy.lvl === "number" && !isNaN(enemy.lvl) ? enemy.lvl : minLvl, targetLvl);
    enemy.lvl = Math.max(minLvl, enemy.lvl);

    var qt = typeof enemy.qualityTier === "number" && !isNaN(enemy.qualityTier) ? enemy.qualityTier : 0;
    enemy.qualityTier = Math.max(6, Math.min(9, qt + 2));

    if (typeof setEnemyStats === "function") {
        setEnemyStats(enemy.type, undefined);
    }

    var mul = 1.21 + Math.min(0.09, floor * 0.0016);
    if (enemy.stats) {
        enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * mul));
        enemy.stats.hp = enemy.stats.hpMax;
        enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * mul));
        enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * mul));
        enemy.stats.atkSpd = Math.min(2.95, enemy.stats.atkSpd * 1.09);
    }
    if (enemy.rewards && typeof enemy.rewards === "object") {
        if (typeof enemy.rewards.exp === "number") enemy.rewards.exp = Math.max(1, Math.round(enemy.rewards.exp * 1.14));
        if (typeof enemy.rewards.gold === "number") enemy.rewards.gold = Math.max(1, Math.round(enemy.rewards.gold * 1.14));
    }
}

function prankLootAmbushEvent() {
    dungeon.status.event = true;
    var pick = DUNGEON_PRANK_LOOT_DEFS[Math.floor(Math.random() * DUNGEON_PRANK_LOOT_DEFS.length)];
    var tag =
        DUNGEON_PRANK_LOOT_TAGS[Math.floor(Math.random() * DUNGEON_PRANK_LOOT_TAGS.length)] || "【似像非像】";
    var choices =
        '<div class="decision-panel">' +
        '<button type="button" id="prankLootHarvest">' +
        (pick.harvestBtn || "点击收获") +
        "</button>" +
        '<button type="button" id="prankLootNope">不对劲儿，溜了</button>' +
        "</div>";
    addDungeonLog(`<span class="Uncommon">${tag}</span>` + pick.logHtml, choices);
    document.querySelector("#prankLootHarvest").onclick = function () {
        addDungeonLog(pick.twistHtml);
        generateRandomEnemy();
        enemy.name = pick.battleName;
        applyPrankLootAmbushEnemyBoost();
        player.inCombat = true;
        engageBattle();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    };
    document.querySelector("#prankLootNope").onclick = function () {
        var nopeLine =
            DUNGEON_PRANK_LOOT_NOPE_LINES[Math.floor(Math.random() * DUNGEON_PRANK_LOOT_NOPE_LINES.length)] ||
            `<span class="Common">你转身就走。</span>`;
        addDungeonLog(nopeLine);
        dungeon.status.event = false;
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    };
}

/**
 * 「刀人」向叙事：选愈深，心愈痛，秘境敌势愈重（enemyScaling）。
 * 每条含长文案；scale 为本次增加的敌势增量。
 */
const BITTER_KARMA_SCALING_SCENARIOS = [
    {
        intro:
            `<span class="StellarSign">【残信·未寄】</span>石缝里夹着一叠黄纸，墨痕被潮气晕开，像谁哭过又强行晾干。` +
            `第一页写着「见字如晤」，落款却是空白；第二页只有半句「你若平安……」，后面被撕去了，撕口整齐得像用牙咬断的。` +
            `第三页更小，字迹发抖：「不必寻我。寻到了，也只是多一个人记得我疼。」你指尖掠过纸角，忽然想起自己也曾写过同样的句子，又焚了，又重写，又不敢寄。` +
            `风从缝里灌出来，带着极淡的墨腥与血腥——不知是纸上的，还是你心里早有的。`,
        options: [
            {
                label: "把信读完，替落款填上自己的名字",
                scale: 0.019,
                after:
                    `你把空白落款一笔一画写成自己的名，像替两个人把没走完的路并到一处。纸页忽然轻颤，墨迹深处浮出一行更淡的小字：「……原来你也等过。」` +
                    `那字随即化灰散去，像终于肯松手的魂。你胸口发空，却奇异地稳——可秘境深处似有无数脚步同时一顿，像天地把你的痛登记在册。`,
            },
            {
                label: "只折一页带走，余者原样塞回",
                scale: 0.013,
                after:
                    `你撕下那句「不必寻我」，折成极小一块贴在心口，像给自己留一道疤当护身符。塞回石缝时，指节被粗糙石棱划出血线，你竟不觉得疼。` +
                    `远处雾色厚了一线，像有人替你掩门，也像劫气在悄悄合拢：你带走的是一句话，秘境却记下你欠下的回响。`,
            },
            {
                label: "合上不看，转身当作从未路过",
                scale: 0.006,
                after:
                    `你退后半步，掌心仍烫，像信上的字隔着石缝烙你。你告诉自己「与我无关」，可脚步发沉，像靴底缠了看不见的线。` +
                    `你没读，却已在心里读完；秘境最懂这种沉默——它把未读之字，算作加倍的执念。`,
            },
        ],
    },
    {
        intro:
            `<span class="Heirloom">【纸灯·等人】</span>枯树下悬着一盏纸灯，灯面画着歪歪扭扭的小人牵大手。灯芯早灭，纸却干得像新糊的，像有人夜夜来换。` +
            `灯下垂着红绳，绳端系一枚磨损的铜板，铜板两面都被摸得发亮——一面「平安」，一面「归来」。你听见极轻的童声在风里断续：「……爹说，灯亮了他就认得路。」` +
            `可灯不会亮。你忽然明白，有些等待不是等一个人回来，是等自己终于承认「不会回来了」。`,
        options: [
            {
                label: "以真元点灯，替她亮一瞬",
                scale: 0.018,
                after:
                    `你并指点灯，火光跳起那一刹，纸上的小人与大手仿佛动了一下，像影子终于重叠。童声笑了一声，又迅速哽住：「……好亮。可他若看见，会不会更难过？」` +
                    `灯灭时，余温贴在你指腹，像有人把额头抵上来谢你，又像把债轻轻挂到你腕上。秘境暗处传来细碎的裂响，像无数封印同时记了一笔利息。`,
            },
            {
                label: "把铜板取下，埋进树根",
                scale: 0.012,
                after:
                    `你挖浅坑，把铜板「平安」面朝上埋下，像替人间留一个不肯翻面的愿。土覆上时，树根微微一紧，像叹息。` +
                    `你起身发现袖角湿了一点——不知是露是泪。劫气从地底漫上来，温柔得像潮，却把前路浸得更难走。`,
            },
            {
                label: "只系回红绳，不碰灯",
                scale: 0.007,
                after:
                    `你把红绳重新系紧，打了个笨拙却认真的结，像替陌生人把「还在等」三个字拴牢。你没点灯，却觉得自己心里某处被点了一下。` +
                    `秘境的风绕你半圈离去，像记下你的软。软，也是要付价的。`,
            },
        ],
    },
    {
        intro:
            `<span class="Epic">【糖人·苦甜】</span>桥头有个摊子，摊主是个瞎眼老人，手里捏着琥珀色的糖，却总说「不甜，别买」。` +
            `摊上只做一个模样：一个小人举着剑，剑尖指着天。老人喃喃：「这是我儿小时候要的……后来他真的去练剑了，就再没回来要糖。」` +
            `糖在风里硬成琥珀，像把某段童年封死在里面。你看着那剑尖，忽然想起自己也曾经为了「像样」而离开过什么。`,
        options: [
            {
                label: "买下糖人，一口咬碎剑尖",
                scale: 0.017,
                after:
                    `糖在齿间碎裂的声响，竟像极轻的剑鸣。老人抬头，眼白映雾：「……他若还在，会笑你浪费。」你咽下甜味，喉间却返苦。` +
                    `苦意落进丹田，竟与秘境气机相缠——你越承认「甜里有苦」，此界越肯把苦算成你的劫。`,
            },
            {
                label: "多给灵石，请别再做这个模样",
                scale: 0.014,
                goldFloorMul: [18, 52],
                after:
                    `老人手一抖，糖人落地碎成星屑。他哑声：「不做……就不做。可不做，我夜里念谁？」你塞过去的灵石被他攥得发烫，像把两个人的舍不得一起握住。` +
                    `你转身时听见背后极轻的「谢谢」，轻得像怕惊动亡魂。秘境深处，敌意像被这句话叫醒，缓缓抬头。`,
            },
            {
                label: "摇头离去，不敢接这糖",
                scale: 0.008,
                after:
                    `你走得很快，像逃。可糖香黏在衣襟上，跟了你一路。你忽然懂：有些故事不必入口，也会在体内化开。` +
                    `秘境记下你的逃，逃也是相欠——欠一声应答，欠一次回头。`,
            },
        ],
    },
    {
        intro:
            `<span class="Legendary">【无字碑·余酒】</span>荒草里立着一块无字碑，碑前摆着一只粗陶壶，壶口封泥已裂，酒香却新得像刚温过。` +
            `泥上指印小小，像孩子曾试图把它抱紧。你俯身，听见极淡的一句混在风里：「……留给会路过的人。喝了，就替我看一眼春天。」` +
            `可此地没有春天，只有常年不散的雾。你忽然怕这酒是某人用余生酿的，只为一瞬与你碰盏。`,
        options: [
            {
                label: "启封饮尽，以袖擦碑",
                scale: 0.02,
                healPct: [0.07, 0.14],
                after:
                    `酒入喉像刀，也像有人轻轻拍你背。你袖擦碑面，擦出一道浅浅水痕，竟像碑上短暂有了姓。水痕干时，你心口跟着空了一块。` +
                    `你跪得不明显，却像跪了很久。秘境的法则在远处低语：你把别人的春天喝进肚里，就要替她把冬天也扛一程——敌势随之暗涨，如冬潮。`,
            },
            {
                label: "只洒半壶于碑前，自留半壶随身",
                scale: 0.015,
                after:
                    `酒渗进土里，土色深了一寸，像终于有人应声。你把另一半壶系在腰间，走一步，壶轻响一声，像有人跟着。` +
                    `你知道这不吉利，可你更怕吉利得太干净——干净得像从未相遇。劫气贴骨而上，像酒劲后返的寒。`,
            },
            {
                label: "原样盖好，鞠一躬便走",
                scale: 0.009,
                after:
                    `你盖泥时手很稳，稳得像在盖自己的棺。鞠躬那一刻，额前风停了半息，像有人回礼。你没喝，却把醉意带进心里。` +
                    `未饮之酒，在秘境账上也算债；你欠的不是酒，是那句「我懂」。`,
            },
        ],
    },
    {
        intro:
            `<span class="Etherbound">【镜渊·少年你】</span>水洼不起波，却照出你少年时的脸：眉眼更锐，笑更不知死活。少年开口，声音却与你一模一样：「后来……你变成厉害的人了吗？」` +
            `你一怔。厉害吗？你走过血与雾，可少年眼里的「厉害」只是「别再让人等你到菜凉」。你张了张口，发现答「是」是谎，答「不是」是刀。` +
            `少年歪头：「那你，有没有变成自己讨厌的那种大人？」水面细纹荡开，像要把你拆成两半。`,
        options: [
            {
                label: "答：「变成了。所以更不敢看你。」",
                scale: 0.021,
                after:
                    `少年沉默很久，笑了一下，像终于释然，又像终于死心：「那就好。你别回头看我，我也不看你跪下的样子。」镜面碎成万点，刺进你眼里却不痛。` +
                    `痛在更深处——你亲手掐灭了最后一个敢直视你的人。秘境敌意如潮，像替你记下这桩弑己之罪。`,
            },
            {
                label: "答：「没有。只是学会了把讨厌藏起来。」",
                scale: 0.016,
                after:
                    `少年伸手想碰你，却隔着水纹：「藏起来……会很累吧。」你点头，喉头发紧。他退后一步，像把路让给你：「那就继续藏吧，别让人看见你碎。」` +
                    `水洼合拢，像把少年吞回岁月。你站得更直，可肩上加了一层看不见的重量——此界把「藏」也计价。`,
            },
            {
                label: "不答，只把水面踏碎",
                scale: 0.01,
                after:
                    `你一脚踏下，少年影碎成乱光。你怕自己一答，就会哭。可碎镜割脚，血珠滚进泥里，像迟来的答案。` +
                    `秘境冷笑似的起风：逃避也算回答，而且通常更贵。`,
            },
        ],
    },
    {
        intro:
            `<span class="Chronarch">【断铃·余诺】</span>地上躺着半枚铜铃，铃舌断了，断面却新，像刚咬断不久。你拾起时，指腹一烫，眼前闪过零碎画面：有人把铃系在另一人腕上，说「响了我就回来」。` +
            `后来铃再没响。不是没回来，是回来时人已说不出话，只剩铃还在傻等一声碰撞。你把断舌对准掌心一按，铃无声，却像在你骨里震了一下。`,
        options: [
            {
                label: "把铃系在自己腕上，替他继续等",
                scale: 0.018,
                after:
                    `铜铃贴脉，冷得像一句誓言。你明知不会响，仍走得慢了些，怕震碎什么。雾里有极轻的叹息，像终于有人接棒。` +
                    `可接棒意味着承接未响之债——秘境敌势随之攀升，像无数未竟之诺叠成山。`,
            },
            {
                label: "熔了铃舌接回，再挂回原处",
                scale: 0.014,
                after:
                    `你以灵火接舌，铃终于能响，却哑得像哭哑的嗓子。第一声落下时，雾散了一线，又迅速合拢，像天地不许太容易圆满。` +
                    `你听见远处有脚步顿住，像有人回头，又强迫自己别回头。敌意从脚边爬上来，缠住你的「多事」。`,
            },
            {
                label: "埋铃于石下，刻「止」字",
                scale: 0.011,
                after:
                    `你刻字时刻得很深，深得像给自己立界碑：到此为止。可土覆上那刻，心口仍响了一声不存在的铃。` +
                    `秘境最擅长把这种「止」读成「未尽」——未尽，就要加价。`,
            },
        ],
    },
    {
        intro:
            `<span class="Apexother">【归舟·无岸】</span>雾中泊着一艘空舟，舟上放着一件叠得方正的旧衣，衣角绣着小小的「归」字，针脚却反向——像绣的人手抖，绣到一半想起「归处已没」。` +
            `舟边水痕有两道，一道深一道浅，像两人曾并肩坐过；浅的那道更靠外，像有人先起身离开，留下另一道慢慢被水泡淡。你指尖触衣，衣上余温竟像活人。`,
        options: [
            {
                label: "穿衣一瞬，再脱下还舟",
                scale: 0.019,
                after:
                    `衣披上肩，像被谁从背后轻轻拢住。你闭眼，听见极轻的一句「路上冷」。你脱下时还，袖口红线勾住指甲，扯出一滴血，像不肯放。` +
                    `你把血抹在「归」字上，字竟艳了一刹，又黯下去。秘境记录这种艳——艳愈短，债愈利，敌势愈沉。`,
            },
            {
                label: "推舟入雾深处，任它自漂",
                scale: 0.015,
                after:
                    `舟入雾，像把一段往事推回它该去的地方。可你掌心的水渍很久不干，像你还在握着谁的腕。` +
                    `你忽然想：若舟靠不了岸，那推舟的人算不算共犯？劫气应声抬头，像答「算」。`,
            },
            {
                label: "只取走一根线头，余物不碰",
                scale: 0.008,
                after:
                    `线头缠在指上，细得像一句没说完的嘱咐。你没拿衣，却把更沉的东西拿走了——「记得」。` +
                    `记得在秘境里比灵石更贵；贵的东西，总要换一种形式让你付。`,
            },
        ],
    },
];

function bitterKarmaScalingEvent() {
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var scenarios = BITTER_KARMA_SCALING_SCENARIOS;
    var s = scenarios[Math.floor(Math.random() * scenarios.length)];
    var btnHtml = "";
    for (var i = 0; i < s.options.length; i++) {
        btnHtml += '<button type="button" id="bks_' + i + '">' + s.options[i].label + "</button>";
    }
    addDungeonLog(s.intro, '<div class="decision-panel">' + btnHtml + "</div>");
    for (var j = 0; j < s.options.length; j++) {
        (function (idx) {
            var opt = s.options[idx];
            document.querySelector("#bks_" + idx).onclick = function () {
                var d = typeof opt.scale === "number" && opt.scale > 0 ? opt.scale : 0;
                var dGain = d > 0 ? applyDungeonEnemyScalingGain(d) : 0;
                if (dGain > 0) {
                    dungeon.settings.enemyScaling += dGain;
                }
                var bonusLine = "";
                if (opt.goldFloorMul && opt.goldFloorMul.length === 2) {
                    var g = applyGoldGainMult(randomizeNum(opt.goldFloorMul[0], opt.goldFloorMul[1]) * floor);
                    player.gold += g;
                    bonusLine +=
                        ` 留下灵石若干：<i class="fas fa-coins" style="color:#FFD700;"></i><b>${nFormatter(g)}</b>。`;
                }
                if (opt.healPct && opt.healPct.length === 2) {
                    var pctH = randomizeDecimal(opt.healPct[0], opt.healPct[1]);
                    var healN = Math.round(player.stats.hpMax * pctH);
                    player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + healN);
                    bonusLine += ` 气血回复 <span class="Common">${nFormatter(healN)}</span>。`;
                }
                var tail =
                    dGain > 0
                        ? ` <span class="Heirloom">秘境敌势系数现为 <b>${dungeon.settings.enemyScaling.toFixed(
                              2
                          )}</b>（本缘 <b>+${dGain.toFixed(3)}</b>）。</span>`
                        : ` <span class="Uncommon">敌势未改，心口却像被谁记了一笔。</span>`;
                addDungeonLog(opt.after + bonusLine + tail);
                playerLoadStats();
                dungeon.status.event = false;
                if (typeof saveData === "function") saveData();
                if (typeof updateDungeonLog === "function") updateDungeonLog();
            };
        })(j);
    }
}

// 机关贩卖机：投币随机零食
const sillyVendingEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("silly_vending_intro") : "一架机关贩卖机堵在路中。";
    const coin = Math.max(1, Math.floor(8 * Math.max(1, dungeon.progress.floor) + randomizeNum(2, 22)));
    const choices = `
        <div class="decision-panel">
            <button type="button" id="sv1">投 ${coin} 灵石</button>
            <button type="button" id="sv2">不投，怕它找零找成劫数</button>
        </div>`;
    addDungeonLog(`<span class="Common">${intro}</span>`, choices);

    document.querySelector("#sv1").onclick = function () {
        if (player.gold < coin) {
            addDungeonLog("灵石不够，傀儡咔咔转头，像在鄙视空钱包。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= coin;
        const r = Math.random();
        const floor = Math.max(1, dungeon.progress.floor);
        if (r < 0.34) {
            const heal = Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.12));
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            addDungeonLog(`哐当一声，滚出一块『辟谷丹味』米糕——你吃了，竟真回血 <span class="Common">${nFormatter(heal)}</span>。`);
        } else if (r < 0.68) {
            const gold = applyGoldGainMult(randomizeNum(15, 42) * floor);
            player.gold += gold;
            addDungeonLog(`出货口吐出灵石渣一包，标签写着『赠品』：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else if (r < 0.88) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedVen = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedVen) {
                if (typeof addPetExp === "function") {
                    var pShare4 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare4)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) {
                    lvlupPopup();
                }
            }
            addDungeonLog(
                `滚出一卷『过期说明书』，你扫一眼竟有所得` +
                    (expAmt > 0
                        ? expAddedVen
                            ? `——感悟 <b>+${nFormatter(expAmt)}</b>。`
                            : `——` + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "。"
                        : "。")
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.09)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`出货口喷出一股『神秘气体』，你眼前一黑——气血 <b>-${nFormatter(dmg)}</b>。侧面小灯闪：『谢谢惠顾』。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#sv2").onclick = function () {
        addDungeonLog("你坚信免费才是最贵，转身离去，傀儡似乎有点失落。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 天谴雷罚：高风险试炼，失败代价偏重
const heavenWrathEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="hw1">引雷淬体（高危）</button>
            <button type="button" id="hw2">伏地避雷（小损）</button>
            <button type="button" id="hw3">遁离雷域</button>
        </div>`;
    addDungeonLog(`<span class="Heirloom">乌云压顶，雷纹在石上游走。天道似在问：你敢不敢受这一劫？</span>`, choices);

    document.querySelector("#hw1").onclick = function () {
        if (Math.random() < 0.42) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const expAddedHw = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedHw) {
                if (typeof addPetExp === "function") {
                    var pShare5 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare5)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
            addDungeonLog(
                `雷火贯体，你竟撑住了。识海震明` +
                    (expAmt > 0
                        ? expAddedHw
                            ? `：<b>+${nFormatter(expAmt)}</b> 点感悟。`
                            : `：` + dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "。"
                        : "。")
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.22, 0.34)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.013);
            addDungeonLog(`<span class="Common">雷罚失控，护体尽裂！</span> 气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.013</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#hw2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.14)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`你伏地护窍，虽避开雷心，仍被余波灼伤：气血 <b>-${nFormatter(dmg)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#hw3").onclick = function () {
        addDungeonLog("你不与天谴争一时长短，撤步离开雷域。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 血契残碑：以血换力，几乎都要付出代价
const bloodOathSteleEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="bo1">立血契（大幅波动）</button>
            <button type="button" id="bo2">浅签一笔（小幅波动）</button>
            <button type="button" id="bo3">拒签离开</button>
        </div>`;
    addDungeonLog(`<span class="Chronarch">残碑渗血，碑文写着：『得失同书，悔者必罚。』</span>`, choices);

    document.querySelector("#bo1").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.15, 0.24)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        if (Math.random() < 0.38) {
            player.bonusStats.atk += 2.6;
            player.bonusStats.critRate += 1.7;
            addDungeonLog(`你以血为印，契成。代价：气血 <b>-${nFormatter(dmg)}</b>；回报：<span class="Legendary">力道 +2.6%、会心 +1.7%</span>（永久）。`);
        } else {
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.017);
            addDungeonLog(`契文反噬，你仍失血 <b>-${nFormatter(dmg)}</b>，且秘境敌势永久 <b>+0.017</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#bo2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.11)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        const gold = applyGoldGainMult(randomizeNum(14, 44) * Math.max(1, dungeon.progress.floor));
        player.gold += gold;
        addDungeonLog(`你只在碑角留下一滴血。气血 <b>-${nFormatter(dmg)}</b>，换得灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#bo3").onclick = function () {
        addDungeonLog("你不在血契上押命，转身离去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 灾厄裂隙：强波动事件，收益与惩罚都更极端
const calamityRiftEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="cr1">踏入裂隙（极险）</button>
            <button type="button" id="cr2">伸手捞取（中险）</button>
            <button type="button" id="cr3">封诀绕行</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">前方裂隙吞吐黑光，像一张缓慢开合的口。你若入内，天谴与机缘同行。</span>`, choices);

    document.querySelector("#cr1").onclick = function () {
        const r = Math.random();
        if (r < 0.26) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const gold = applyGoldGainMult(randomizeNum(60, 180) * Math.max(1, dungeon.progress.floor));
            player.gold += gold;
            const expAddedCr = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedCr) {
                if (typeof addPetExp === "function") {
                    var pShare6 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * pShare6)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
            addDungeonLog(
                `你从裂隙中心活着走出：` +
                    (expAmt > 0
                        ? expAddedCr
                            ? `感悟 <b>+${nFormatter(expAmt)}</b>，`
                            : dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "，"
                        : "") +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.2, 0.33)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.019);
            addDungeonLog(`<span class="Common">裂隙吐出灾潮，将你掀飞！</span> 气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.019</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#cr2").onclick = function () {
        const r = Math.random();
        if (r < 0.45) {
            const gold = applyGoldGainMult(randomizeNum(24, 86) * Math.max(1, dungeon.progress.floor));
            player.gold += gold;
            addDungeonLog(`你只探手一捞，扯回一把残碎灵石：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.16)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            addDungeonLog(`你被裂隙边缘灼了一下，气血 <b>-${nFormatter(dmg)}</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#cr3").onclick = function () {
        addDungeonLog("你以封诀压住躁念，不赌这一口灾运。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 吞界虚口：极险，失败重创 + 大涨敌势
const perilVoidMawEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="pvm1">探身入虚口（九死一生）</button>
            <button type="button" id="pvm2">以印封喉（硬扛余波）</button>
            <button type="button" id="pvm3">抽身远遁</button>
        </div>`;
    addDungeonLog(`<span class="Nullforge">雾墙裂开一道无底的口，吸力扯得你丹田发紧——像要把道基一并吞没。</span>`, choices);

    document.querySelector("#pvm1").onclick = function () {
        if (Math.random() < 0.17) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const gold = applyGoldGainMult(randomizeNum(80, 220) * Math.max(1, dungeon.progress.floor));
            player.gold += gold;
            const expAddedPvm = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedPvm) {
                if (typeof addPetExp === "function") {
                    var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * ps)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
            addDungeonLog(
                `你从虚口深处扯回一线灵机：` +
                    (expAmt > 0
                        ? expAddedPvm
                            ? `感悟 <b>+${nFormatter(expAmt)}</b>，`
                            : dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "，"
                        : "") +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.32, 0.48)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.031);
            addDungeonLog(`<span class="Common">虚口合拢，如嚼碎脊骨！</span> 气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.031</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#pvm2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.16, 0.26)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.011);
        addDungeonLog(`印光碎裂，余波仍贯胸而过：气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.011</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#pvm3").onclick = function () {
        addDungeonLog("你咬破舌尖提神，强行挣脱吸力，头也不回。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 孽债簿：动念即欠债，偿还不力则万劫加身
const perilKarmicLedgerEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="pkl1">画押认债（以财换运）</button>
            <button type="button" id="pkl2">撕簿拒认（硬顶因果）</button>
            <button type="button" id="pkl3">阖眼不视</button>
        </div>`;
    addDungeonLog(`<span class="Chronarch">一本无字簿凭空翻开，纸页如刀。旁有朱批：『借者生，赖者殁。』</span>`, choices);

    document.querySelector("#pkl1").onclick = function () {
        const floor = Math.max(1, dungeon.progress.floor);
        const need = Math.max(1, Math.floor(player.gold * 0.22 + randomizeNum(8, 55) * floor));
        if (player.gold < need) {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.28, 0.42)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.027);
            addDungeonLog(`灵石不足以平账，簿上朱笔一落，如烙铁贯心！气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.027</b>。`);
        } else {
            player.gold -= need;
            if (Math.random() < 0.55) {
                const expAmt = rollDungeonExpFloorRewardAmount();
                const expAddedPkl = dongtianDungeonPlayerExpAddBase(expAmt);
                if (expAddedPkl) {
                    if (typeof addPetExp === "function") {
                        var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                        addPetExp(Math.max(0, Math.floor(expAmt * ps2)));
                    }
                    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                    if (leveled) lvlupPopup();
                }
                const g2 = applyGoldGainMult(randomizeNum(20, 65) * floor);
                player.gold += g2;
                addDungeonLog(
                    `你以灵石填债眼，簿上墨迹淡去：` +
                        (expAmt > 0
                            ? expAddedPkl
                                ? `感悟 <b>+${nFormatter(expAmt)}</b>，并`
                                : dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "，并"
                            : "") +
                    `回流灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g2)}。`
                );
            } else {
                const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.22)));
                player.stats.hp = Math.max(1, player.stats.hp - dmg);
                dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.018);
                addDungeonLog(`财去债未清，反被记一笔『利息』：气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.018</b>。`);
            }
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#pkl2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.34, 0.5)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.034);
        addDungeonLog(`簿页纷飞如刃，因果反噬！气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.034</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#pkl3").onclick = function () {
        addDungeonLog("你当没看见，快步走过——簿子合上的声音像有人冷笑。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 焚魂火：炼魂可成，败则神魂俱伤
const perilSoulPyreEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="psp1">投魂入焰（炼）</button>
            <button type="button" id="psp2">只借火光（蹭）</button>
            <button type="button" id="psp3">熄念离去</button>
        </div>`;
    addDungeonLog(`<span class="StellarSign">无根之火悬空而燃，焰心无人，却照出你识海最深处的影子。</span>`, choices);

    document.querySelector("#psp1").onclick = function () {
        if (Math.random() < 0.24) {
            const stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
            const pick = stats[Math.floor(Math.random() * stats.length)];
            player.bonusStats[pick] += 3.2;
            const zh = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法", vamp: "吸血", critRate: "会心", critDmg: "暴伤" };
            addDungeonLog(`魂火淬炼未灭，福至心灵：<span class="Legendary">${zh[pick]}</span> 机缘永久 <b>+3.2%</b>。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.36, 0.52)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.036);
            addDungeonLog(`<span class="Common">焰舌反卷，几乎焚穿灵台！</span> 气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.036</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#psp2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.14, 0.24)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.01);
        addDungeonLog(`你只借一瞬暖意，仍被燎去一层皮：气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.010</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#psp3").onclick = function () {
        addDungeonLog("你掐灭心头妄念，火自眼前散去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 铁莲刑桩：坐则抽筋剥髓，成则筋骨换胎
const perilIronLotusEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="pil1">坐上莲心（受刑）</button>
            <button type="button" id="pil2">指尖轻触（试锋）</button>
            <button type="button" id="pil3">绕桩而行</button>
        </div>`;
    addDungeonLog(`<span class="Etherbound">铁莲倒生，瓣瓣如刃。中央空座，像专为你留的劫位。</span>`, choices);

    document.querySelector("#pil1").onclick = function () {
        if (Math.random() < 0.14) {
            player.bonusStats.atk += 2.8;
            player.bonusStats.critDmg += 2.2;
            addDungeonLog(`莲瓣合拢如铸，你竟撑过一轮：力道机缘永久 <b>+2.8%</b>，暴伤机缘永久 <b>+2.2%</b>。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.38, 0.54)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.03);
            addDungeonLog(`铁莲绞骨，血雾溅起！气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.030</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#pil2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.1, 0.18)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`刃风掠指，皮开肉绽：气血 <b>-${nFormatter(dmg)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#pil3").onclick = function () {
        addDungeonLog("你不坐劫位，只绕桩记形，心中已寒。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 深渊低语：闻则知天命，亦可能失魂落魄
const perilAbyssWhisperEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="paw1">侧耳听真名（赌命）</button>
            <button type="button" id="paw2">塞耳屏息（自损）</button>
            <button type="button" id="paw3">转身不回头</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">脚下传来极轻的絮语，像有人在深渊里念你的名。</span>`, choices);

    document.querySelector("#paw1").onclick = function () {
        if (Math.random() < 0.3) {
            const expAmt = rollDungeonExpFloorRewardAmount();
            const gold = applyGoldGainMult(randomizeNum(55, 150) * Math.max(1, dungeon.progress.floor));
            player.gold += gold;
            const expAddedPaw = dongtianDungeonPlayerExpAddBase(expAmt);
            if (expAddedPaw) {
                if (typeof addPetExp === "function") {
                    var ps3 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * ps3)));
                }
                dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
                if (leveled) lvlupPopup();
            }
            addDungeonLog(
                `真名入耳，灵台一震而明：` +
                    (expAmt > 0
                        ? expAddedPaw
                            ? `感悟 <b>+${nFormatter(expAmt)}</b>，`
                            : dongtianDungeonPlayerExpMissedGainHintZh(expAmt, false) + "，"
                        : "") +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`
            );
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.3, 0.46)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            const loss = Math.max(1, Math.floor(player.gold * 0.18));
            if (player.gold >= loss) player.gold -= loss;
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.026);
            addDungeonLog(`<span class="Common">絮语化作钢针，直刺识海！</span> 气血 <b>-${nFormatter(dmg)}</b>；灵石流失 <b>${nFormatter(loss)}</b>；秘境敌势永久 <b>+0.026</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#paw2").onclick = function () {
        const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.15)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        addDungeonLog(`你塞耳屏息，仍被余音震得气血翻涌：气血 <b>-${nFormatter(dmg)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#paw3").onclick = function () {
        addDungeonLog("你不听、不问、不回头，絮语渐弱如远潮。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

const XIUXIAN_STAT_ZH = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法", vamp: "吸血", critRate: "会心", critDmg: "暴伤" };

// 心魔试炼：高风险永久机缘 / 敌势上涨
const heartDemonEvent = () => {
    dungeon.status.event = true;
    const intro = typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("heart_demon_intro") : "雾中凝出与你面目相仿的影子……";
    const choices = `
        <div class="decision-panel">
            <button type="button" id="hd1">斩之</button>
            <button type="button" id="hd2">化之入道</button>
            <button type="button" id="hd3">不试此劫</button>
            <button type="button" id="hd4">入战斩魔</button>
        </div>`;
    addDungeonLog(`<span class="Heirloom">${intro}</span>`, choices);

    document.querySelector("#hd1").onclick = function () {
        if (Math.random() < 0.62) {
            const stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
            const pick = stats[Math.floor(Math.random() * stats.length)];
            player.bonusStats[pick] += 2.2;
            addDungeonLog(`心魔崩碎！福至心灵，<span class="Legendary">${XIUXIAN_STAT_ZH[pick]}</span> 机缘永久 <b>+2.2%</b>。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * 0.18));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.018);
            addDungeonLog(`<span class="Common">斩之未净，反噬心脉！</span> 气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.018</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#hd2").onclick = function () {
        player.bonusStats.hp += 5.2;
        player.bonusStats.atk += 5.2;
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.03);
        addDungeonLog(`你将魔念纳入丹田炼化：<span class="Legendary">气血、力道</span> 机缘各永久 <b>+5.2%</b>；代价为秘境敌势永久 <b>+0.030</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#hd3").onclick = function () {
        const g = applyGoldGainMult(randomizeNum(15, 45) * Math.max(1, dungeon.progress.floor));
        player.gold += g;
        addDungeonLog(`你敛息退后，不与心魔争一时短长。拾得灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}（道旁残陨灵屑）。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#hd4").onclick = function () {
        dungeonHeartDemonCombatPending = true;
        dungeon.status.event = false;
        startDangerEventCombat(
            `<span class="Heirloom">心魔凝实半步，对你咧嘴——这一劫不在侥幸，在剑锋。</span>`,
            null,
            { minQuality: 4, statMul: 1.03, rewardMul: 1.05, lvlBonus: 0, victoryBonus: { extraGoldMul: 1.04, extraExpPct: 0.026 } }
        );
    };
};

// 宗门残魂问答：答对机缘+灵石；答错损财/伤血并涨敌势
const sectSpiritEvent = () => {
    dungeon.status.event = true;
    if (typeof SECT_QA_POOL === "undefined" || !SECT_QA_POOL.length) {
        insightEvent();
        return;
    }
    const qa = SECT_QA_POOL[Math.floor(Math.random() * SECT_QA_POOL.length)];
    const correctText = qa.opts[qa.correct];
    let rows = qa.opts.map((text, i) => ({ text, i }));
    for (let k = rows.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        const t = rows[k];
        rows[k] = rows[j];
        rows[j] = t;
    }
    const choices = `
        <div class="decision-panel">
            <button type="button" id="sq0">${rows[0].text}</button>
            <button type="button" id="sq1">${rows[1].text}</button>
            <button type="button" id="sq2">${rows[2].text}</button>
        </div>`;
    addDungeonLog(`<span class="Legendary">一缕宗门残魂自残碑升起，声如锈铁摩擦：「${qa.q}」</span>`, choices);

    const finish = (picked) => {
        if (picked === correctText) {
            const stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
            const pick = stats[Math.floor(Math.random() * stats.length)];
            player.bonusStats[pick] += 2.5;
            const g = applyGoldGainMult(randomizeNum(22, 62) * Math.max(1, dungeon.progress.floor));
            player.gold += g;
            addDungeonLog(`残魂颔首：「可教。」<span class="Legendary">${XIUXIAN_STAT_ZH[pick]}</span> 机缘永久 <b>+2.5%</b>，并赠灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}。`);
        } else {
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.014);
            const lossGold = Math.round(player.gold * 0.12);
            if (player.gold > 0 && lossGold >= 1) {
                player.gold -= lossGold;
                addDungeonLog(`残魂叹息：「差之毫厘。」你奉出灵石 <span class="Common">${nFormatter(lossGold)}</span> 以平因果；秘境敌势永久 <b>+0.014</b>。`);
            } else {
                const dmg = Math.max(1, Math.round(player.stats.hpMax * 0.095));
                player.stats.hp = Math.max(1, player.stats.hp - dmg);
                addDungeonLog(`残魂低喝：「谬也！」道韵反震，气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.014</b>。`);
            }
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#sq0").onclick = function () { finish(rows[0].text); };
    document.querySelector("#sq1").onclick = function () { finish(rows[1].text); };
    document.querySelector("#sq2").onclick = function () { finish(rows[2].text); };
};

// 天机签：吉凶签文，机缘与风险并存
const tianJiQianEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="tj1">求一签</button>
            <button type="button" id="tj2">不涉天机</button>
        </div>`;
    addDungeonLog(`<span class="Chronarch">道旁竹筒轻响，木签半露——旁刻小字：「心诚则灵，心贪则折。」</span>`, choices);
    document.querySelector("#tj1").onclick = function () {
        const roll = Math.random();
        const stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
        if (roll < 0.14) {
            const h = Math.round(player.stats.hpMax * 0.24);
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            const g = applyGoldGainMult(randomizeNum(32, 88) * Math.max(1, dungeon.progress.floor));
            player.gold += g;
            addDungeonLog(`<span class="Legendary">签文：上上大吉。</span> 气血回涌 <span class="Common">${nFormatter(h)}</span>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}。`);
        } else if (roll < 0.4) {
            const p = stats[Math.floor(Math.random() * stats.length)];
            player.bonusStats[p] += 0.85;
            addDungeonLog(`<span class="Epic">签文：吉。</span> <span class="Legendary">${XIUXIAN_STAT_ZH[p]}</span> 机缘永久 <b>+0.85%</b>。`);
        } else if (roll < 0.68) {
            const g = applyGoldGainMult(randomizeNum(44, 130) * Math.max(1, dungeon.progress.floor));
            player.gold += g;
            addDungeonLog(`<span class="Rare">签文：平。</span> 无大得失，仅灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}。`);
        } else if (roll < 0.88) {
            const d = Math.max(1, Math.round(player.stats.hpMax * 0.09));
            player.stats.hp = Math.max(1, player.stats.hp - d);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.008);
            addDungeonLog(`<span class="Common">签文：咎。</span> 心头一悸，气血 <b>-${nFormatter(d)}</b>，敌势 <b>+0.008</b>。`);
        } else {
            const loss = Math.min(player.gold, Math.max(0, Math.round(player.gold * 0.08 + dungeon.progress.floor * 32)));
            player.gold -= loss;
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.014);
            addDungeonLog(`<span class="Heirloom">签文：下下。</span> 因果折损灵石 <span class="Common">${nFormatter(loss)}</span>，敌势 <b>+0.014</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#tj2").onclick = function () {
        addDungeonLog("你合拢竹筒，不问前程。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// 灵兽结缘：喂灵石永久加成，或抚摸、驱离
const beastBondEvent = () => {
    dungeon.status.event = true;
    const cost = Math.max(50, dungeon.progress.floor * 42);
    const choices = `
        <div class="decision-panel">
            <button type="button" id="bb1">喂食灵石 (${nFormatter(cost)})</button>
            <button type="button" id="bb2">伸手抚摸</button>
            <button type="button" id="bb3">驱离</button>
            <button type="button" id="bb4">护兽退敌</button>
        </div>`;
    addDungeonLog(`<span class="Rare">一只绒毛小兽叼着你的袍角，目中灵慧未泯……</span>`, choices);
    document.querySelector("#bb1").onclick = function () {
        if (player.gold < cost) {
            addDungeonLog("灵石不足，小兽扫尾离去。");
        } else {
            player.gold -= cost;
            player.bonusStats.hp += 1.1;
            player.bonusStats.def += 0.65;
            addDungeonLog(`小兽蹭掌离去——<span class="Legendary">气血</span> 机缘 <b>+1.1%</b>，<span class="Legendary">护体</span> <b>+0.65%</b>。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#bb2").onclick = function () {
        if (Math.random() < 0.55) {
            const h = Math.round(player.stats.hpMax * 0.13);
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + h);
            addDungeonLog(`它呼噜应声，你亦觉心头一暖，气血 <b>+${nFormatter(h)}</b>。`);
        } else {
            addDungeonLog("它警戒退开，缘分未至。");
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#bb3").onclick = function () {
        if (Math.random() < 0.22) {
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.01);
            addDungeonLog("小兽龇牙低吼，似结下一缕恶缘——敌势 <b>+0.010</b>。");
        } else {
            addDungeonLog("它窜入雾中，不留踪迹。");
        }
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#bb4").onclick = function () {
        dungeonBeastBondCombatPending = true;
        dungeon.status.event = false;
        startDangerEventCombat(
            `<span class="Rare">雾后凶光锁定小兽，它缩进你袍角发抖——你只得拔刃。</span>`,
            null,
            { minQuality: 4, statMul: 1.02, rewardMul: 1.06, lvlBonus: 0, victoryBonus: { extraGoldMul: 1.05, extraExpPct: 0.025 } }
        );
    };
};

// 雾中换运摊：灵石换机缘或灵气倒卷
const wanderStallEvent = () => {
    dungeon.status.event = true;
    const price = Math.max(80, dungeon.progress.floor * 55);
    const choices = `
        <div class="decision-panel">
            <button type="button" id="ws1">请下「运」符 (${nFormatter(price)} 灵石)</button>
            <button type="button" id="ws2">观之不买</button>
        </div>`;
    addDungeonLog(`<span class="Etherbound">雾里摊位无人，只悬一枚玉符：『舍灵石得势，亦舍因果。』</span>`, choices);
    document.querySelector("#ws1").onclick = function () {
        if (player.gold < price) {
            addDungeonLog("灵石不足，玉符黯淡成灰。");
        } else {
            player.gold -= price;
            if (Math.random() < 0.55) {
                const stats = ["atk", "def", "atkSpd", "critRate", "critDmg"];
                const p = stats[Math.floor(Math.random() * stats.length)];
                player.bonusStats[p] += 1.35;
                addDungeonLog(`玉符化光入袖。<span class="Legendary">${XIUXIAN_STAT_ZH[p]}</span> 机缘永久 <b>+1.35%</b>。`);
            } else {
                dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.017);
                const g = applyGoldGainMult(randomizeNum(65, 155) * Math.max(1, dungeon.progress.floor));
                player.gold += g;
                addDungeonLog(`符内封存灵气倒卷！入手 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}，敌势暗涨 <b>+0.017</b>。`);
            }
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#ws2").onclick = function () {
        addDungeonLog("你不买不卖，摊影随风散去。");
        dungeon.status.event = false;
        updateDungeonLog();
    };
};

// —— 秘境蹊径：棱镜双择（噬命换灵 / 灵石幻赌）
const echoMirrorEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="choice1">折镜血誓</button>
            <button id="choice2">掷灵幻赌</button>
            <button id="choice3">拭镜离去</button>
            <button id="choice4">碎镜斩祟</button>
        </div>`;
    addDungeonLog(`<span class="StellarSign">一面悬浮棱镜裁开雾幕，里侧映着两重蜃影：一重啜命，一重啜灵。古谚云——「镜不照完人，只照贪念的形状。」</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        const cut = Math.max(1, Math.round(player.stats.hpMax * 0.08));
        player.stats.hp = Math.max(1, player.stats.hp - cut);
        playerLoadStats();
        if (Math.random() < 0.52) {
            const windfall = applyGoldGainMult(randomizeNum(45, 130) * dungeon.progress.floor);
            player.gold += windfall;
            addDungeonLog(`镜渊回波。倒瀑般的灵华扼住你的腕脉，纳灵石共 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(windfall)}。`);
        } else {
            addDungeonLog(`镜中只有虚无讥笑。你已剜去 ${nFormatter(cut)} 点气血，却仍两手空空——或许空，才是镜的本相。`);
        }
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        const stake = Math.min(player.gold, Math.max(60, dungeon.progress.floor * 52));
        if (stake < 1) {
            addDungeonLog("囊中灵石太轻，撬不动镜中那缕戏谑的天平虚影。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= stake;
        if (Math.random() < 0.47) {
            const winPayout = applyGoldGainMult(stake * 2);
            player.gold += winPayout;
            addDungeonLog(`幻赌应验：灵纹叠浪吞食倒影，你净得落袋 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(winPayout)}。`);
        } else {
            addDungeonLog(`镜华坍作暗尘，${nFormatter(stake)} 枚灵石连同虚妄赌注一并湮灭——像从未来过。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("你以袖沿抹去雾珠，任棱镜沉回裂隙。有些胜负，输在起念那一瞬。");
        updateDungeonLog();
    };
    document.querySelector("#choice4").onclick = function () {
        dungeonEchoMirrorCombatPending = true;
        dungeon.status.event = false;
        startDangerEventCombat(
            `<span class="Heirloom">棱镜炸裂，镜祟衔着两张脸扑来——一张像你贪，一张像你怕。</span>`,
            null,
            { minQuality: 4, statMul: 1.02, rewardMul: 1.07, lvlBonus: 0, victoryBonus: { extraGoldMul: 1.07, extraExpPct: 0.03 } }
        );
    };
};

// 隙泉啜饮：免费随机疗愈 / 灵石 / 落空
const wellspringEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="choice1">俯身啜饮</button>
            <button id="choice2">掩面而退</button>
        </div>`;
    addDungeonLog(`<span class="Etherbound">地缝渗出荧蓝灵泉，泉眼半阖如古兽沉睡中的瞳仁。水气带甜锈与旧星辉的余味。</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        const r = Math.random();
        if (r < 0.36) {
            const heal = Math.round(player.stats.hpMax * 0.11);
            player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
            addDungeonLog(`泉脉与你骨血共振，气血回流 <span class="Common">${nFormatter(heal)}</span>。喉间有细碎星屑在颤鸣。`);
        } else if (r < 0.67) {
            const g = applyGoldGainMult(randomizeNum(35, 110) * dungeon.progress.floor);
            player.gold += g;
            addDungeonLog(`泉底沉降出温热的灵髓结晶，你掬起 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}。`);
        } else {
            addDungeonLog(`泉眼无声咬合，只留下齿痕状冰痕贴着石脉。今日它不渴，亦不许你渴。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("你不俯身。甘泉与毒誓往往一线之隔，你宁愿干着走过。");
        updateDungeonLog();
    };
};

// 低语薪约：永久略抬高 scaling，换一行随机机缘加成
const whisperPactEvent = () => {
    dungeon.status.event = true;
    const statZh = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法", vamp: "吸血", critRate: "会心", critDmg: "暴伤" };
    const grants = { hp: 18, atk: 12, def: 12, atkSpd: 12, vamp: 8, critRate: 8, critDmg: 22 };
    const choices = `
        <div class="decision-panel">
            <button id="choice1">应和低语</button>
            <button id="choice2">封缄心识</button>
            <button id="choice3">先斩低语化身，再承薪约</button>
        </div>`;
    addDungeonLog(`<span class="Nullforge">虚空里有人贴着鼓膜呢喃：「愿承敌势之苦，便赐你躯壳深处一星不熄的余烬。」</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.026);
        const stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
        const pick = stats[Math.floor(Math.random() * stats.length)];
        player.bonusStats[pick] += grants[pick];
        addDungeonLog(`薪约烙成。全境敌意暗涨（敌势系数现为 <span class="Heirloom">${dungeon.settings.enemyScaling.toFixed(2)}</span>），你的<span class="Legendary">${statZh[pick]}</span>机缘永久 +${grants[pick]}%。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("你在心识外筑起无形罡气。低语如潮退阴岚，悻悻擦过耳廓而去。");
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        dungeonWhisperPactCombatPending = true;
        dungeon.status.event = false;
        startDangerEventCombat(
            `<span class="Heirloom">低语凝出半步实体，指尖如灰线缠骨——先过此形，才配谈「薪约」。</span>`,
            null,
            { minQuality: 4, statMul: 1.03, rewardMul: 1.06, lvlBonus: 0, victoryBonus: { extraGoldMul: 1.05, extraExpPct: 0.028 } }
        );
    };
};

// 碎隙行商：付雾引灵石换遗器或灵潮回馈
const riftPedlarEvent = () => {
    dungeon.status.event = true;
    const toll = Math.max(80, dungeon.progress.floor * 68);
    const choices = `
        <div class="decision-panel">
            <button id="choice1">付雾引灵石</button>
            <button id="choice2">擦肩而过</button>
        </div>`;
    addDungeonLog(`<span class="Chronarch">雾幕深处有散修挑担而来，担上是跳鸣的骨铃与微缩的古镜残片。「雾引 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(toll)} 灵石——遗器择主，或灵石择囊，不可兼得，却可以赌其一。」</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        if (player.gold < toll) {
            addDungeonLog("散修指节凌空叩了叩你空瘪的囊形，笑着退入雾脊，像从未开口。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= toll;
        if (Math.random() < 0.56) {
            createEquipmentPrint("dungeon");
        } else {
            const burst = applyGoldGainMult(randomizeNum(55, 200) * dungeon.progress.floor);
            player.gold += burst;
            addDungeonLog(`散修抖开皮囊，灵石如瀑倒灌。你拢住 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(burst)}。再抬眼，担影已消融在灵雾中。`);
        }
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("你不着一字擦肩而过。肩后骨铃声渐黯，仿佛有人在你影子深处轻轻叹息。");
        updateDungeonLog();
    };
};

// —— 深轴休战（≥32 层）：以敌势略退，换灵石灌顶
const deepSpireEvent = () => {
    dungeon.status.event = true;
    const f = dungeon.progress.floor;
    const choices = `
        <div class="decision-panel">
            <button id="choice1">倚轴歇刃</button>
            <button id="choice2">不与轴谋</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">秘境阵眼在此漏出一道喘息隙缝，像巨兽翻身时胛骨间漏进的天光。你察觉天道威压稍懈——可借势换一口灵石，也可什么也不欠。</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        var escLossAxis = applyDungeonEnemyScalingLoss(0.028);
        dungeon.settings.enemyScaling = Math.max(DUNGEON_ENEMY_SCALING_MIN, dungeon.settings.enemyScaling - escLossAxis);
        const payout = applyGoldGainMult(randomizeNum(160, 320) * f);
        player.gold += payout;
        addDungeonLog(`你与阵眼默契对视一瞬。敌势系数回落至 <span class="Etherbound">${dungeon.settings.enemyScaling.toFixed(2)}</span>，而灵石自隙中倒灌 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(payout)}——天律有秤，欠下的总要还。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("你不肯向轴心赊账。秘境尊敬这种固执，也往往因为这种固执而更加饥饿。");
        updateDungeonLog();
    };
};

// —— 骨庭裁许（≥65 层）：剜命换两道加护
const boneCourtEvent = () => {
    dungeon.status.event = true;
    const statZh = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法", vamp: "吸血", critRate: "会心", critDmg: "暴伤" };
    const grants = { hp: 11, atk: 7, def: 7, atkSpd: 7, vamp: 5, critRate: 5, critDmg: 13 };
    const choices = `
        <div class="decision-panel">
            <button id="choice1">赴庭画押</button>
            <button id="choice2">不赴其约</button>
        </div>`;
    addDungeonLog(`<span class="Heirloom">雾中立有白骨王座无人，座前浮着朱红血丝织成的判牒。「一押气血，二押余烬——庭上只收血证，不收辩词。」</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        const tithe = Math.max(1, Math.round(player.stats.hpMax * 0.19));
        player.stats.hp = Math.max(1, player.stats.hp - tithe);
        let pool = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
        const i1 = Math.floor(Math.random() * pool.length);
        const pick1 = pool[i1];
        pool = pool.filter((s) => s !== pick1);
        const pick2 = pool[Math.floor(Math.random() * pool.length)];
        player.bonusStats[pick1] += grants[pick1];
        player.bonusStats[pick2] += grants[pick2];
        addDungeonLog(`朱纹烙进腕骨。你失去 <span class="Common">${nFormatter(tithe)}</span> 气血残焰，却换来<span class="Legendary">${statZh[pick1]}</span> +${grants[pick1]}% 与 <span class="Legendary">${statZh[pick2]}</span> +${grants[pick2]}%——骨庭从不记账，只记血温。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("白骨王座颔首送你离去，像送走一枚尚未成熟的祭品。");
        updateDungeonLog();
    };
};


const voidAuctionEvent = () => {
    dungeon.status.event = true;
    const f = dungeon.progress.floor;
    const priceA = Math.round(f * 105);
    const priceB = Math.round(f * 88);
    const priceC = Math.round(f * 168);
    const choices = `
        <div class="decision-panel">
            <button id="choice1">甲座承宝 (${nFormatter(priceA)} 灵石)</button>
            <button id="choice2">潮座纳川 (${nFormatter(priceB)} 灵石)</button>
            <button id="choice3">棘座搏运 (${nFormatter(priceC)} 灵石)</button>
        </div>`;
    addDungeonLog(`<span class="Chronarch">玄玉阶叠成虚空法台，无人唱筹，却有三道悬空法印同坠血锈。「甲为遗器，潮为灵汐，棘为双刃——承价者承因果，亦自成劫。」</span>`, choices);

    const finishBuy = (cost, fn) => {
        if (player.gold < cost) {
            addDungeonLog("虚空法印嗡鸣示警，天道不认赊欠。");
            dungeon.status.event = false;
            updateDungeonLog();
            return;
        }
        player.gold -= cost;
        fn();
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    document.querySelector("#choice1").onclick = function () {
        finishBuy(priceA, () => {
            createEquipmentPrint("dungeon");
            addDungeonLog(`甲印沉闷坠下，遗器撞入你怀中——仿佛它早在此等一个掌纹。`);
        });
    };
    document.querySelector("#choice2").onclick = function () {
        finishBuy(priceB, () => {
            const tide = applyGoldGainMult(randomizeNum(200, 420) * f);
            player.gold += tide;
            addDungeonLog(`潮印掀起灵汐，你浑身被灵雨洗过一遍，净入 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(tide)}。`);
        });
    };
    document.querySelector("#choice3").onclick = function () {
        finishBuy(priceC, () => {
            createEquipmentPrint("dungeon");
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.03);
            addDungeonLog(`棘印同时咬中两边：遗器入手刹那，敌势系数攀至 <span class="Heirloom">${dungeon.settings.enemyScaling.toFixed(2)}</span>——双刃本就互噬。`);
        });
    };
};

// —— 天顶绽华（仅 100 层）：劫尽余晖
const apexBloomEvent = () => {
    dungeon.status.event = true;
    const choices = `
        <div class="decision-panel">
            <button id="choice1">承纳天顶余晖</button>
            <button id="choice2">把辉光塞回裂隙</button>
        </div>`;
    addDungeonLog(`<span class="Apexother">你已站在秘境之巅。这里没有路，只有一粒将熄未熄的奇点，像天道隔着虚空对你眨了最后一次眼。</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        player.stats.hp = player.stats.hpMax;
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.014);
        const bloom = applyGoldGainMult(randomizeNum(520, 920) * dungeon.progress.floor);
        player.gold += bloom;
        addDungeonLog(`余晖灌顶，气血满溢如初诞。灵石如雨自穹顶倾泻 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(bloom)}；敌势系数现为 <span class="Heirloom">${dungeon.settings.enemyScaling.toFixed(2)}</span>——天劫从不白给，它只在你能接住时落下。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice2").onclick = function () {
        dungeon.status.event = false;
        addDungeonLog("你把掌心从奇点上挪开。有些馈赠像借来的时间——你还想多走几步，用自己的步子。");
        updateDungeonLog();
    };
};

// Random stat buff
const statBlessing = () => {
    let stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
    let buff = stats[Math.floor(Math.random() * stats.length)];
    let value;
    switch (buff) {
        case "hp":
            value = 12;
            player.bonusStats.hp += value;
            break;
        case "atk":
            value = 8;
            player.bonusStats.atk += value;
            break;
        case "def":
            value = 8;
            player.bonusStats.def += value;
            break;
        case "atkSpd":
            value = 8;
            player.bonusStats.atkSpd += value;
            break;
        case "vamp":
            value = 5;
            player.bonusStats.vamp += value;
            break;
        case "critRate":
            value = 5;
            player.bonusStats.critRate += value;
            break;
        case "critDmg":
            value = 15;
            player.bonusStats.critDmg += value;
            break;
    }
    const blessingStatZh = {
        hp: "气血",
        atk: "力道",
        def: "护体",
        atkSpd: "身法",
        vamp: "吸血",
        critRate: "会心",
        critDmg: "暴伤"
    };
    addDungeonLog(`天眷灌注：${blessingStatZh[buff] || buff}增幅${value}%。（天眷 ${player.blessing} 层 → ${player.blessing + 1} 层）`);
    blessingUp();
    playerLoadStats();
    saveData();
}

// 缚咒桩献奉：邪印不按全局 DUNGEON_ENEMY_SCALING_GAIN_MULT（如 ×0.3）压缩，每次献奉实打实 +0.1 敌势（再钳到本层上限）。
const cursedTotem = (curseLvl) => {
    var cap = getDungeonEnemyScalingCeilingForFloor(dungeon.progress.floor);
    var beforeE = Math.max(
        DUNGEON_ENEMY_SCALING_MIN,
        Math.min(cap, Number(dungeon.settings.enemyScaling) || DUNGEON_ENEMY_SCALING_MIN)
    );
    var prevLvl = Math.round((beforeE - 1) * 10);
    dungeon.settings.enemyScaling = Math.min(
        cap,
        Math.max(DUNGEON_ENEMY_SCALING_MIN, beforeE + 0.1)
    );
    var newLvl = Math.round((dungeon.settings.enemyScaling - 1) * 10);
    if (newLvl <= prevLvl) {
        addDungeonLog(
            `邪印之力已抵本层敌势上限，缚咒桩的幽光无法再加深。（邪印维持 <span class="Heirloom">${prevLvl}</span> 层；敌势系数现为 <span class="Heirloom">${dungeon.settings.enemyScaling.toFixed(2)}</span>）`
        );
    } else {
        addDungeonLog(`邪印加深：妖物愈发暴戾，遗落亦愈显珍贵。（邪印 ${curseLvl} 层 → ${newLvl} 层）`);
    }
    saveData();
}

// ========= 清明时节 · 归尘连环（多段叙事 + 延后回响，非单次点选即结束） ==========
function qingmingChainStageEvent(p) {
    if (!p || typeof p.stage !== "number") {
        nothingEvent();
        return;
    }
    if (p.stage === 2) {
        qingmingChainStageTwoEvent(p);
    } else if (p.stage === 3) {
        qingmingChainStageThreeEpilogue(p);
    } else {
        nothingEvent();
    }
}

const qingmingChainEvent = () => {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    var _qf = dungeon && dungeon.progress && typeof dungeon.progress.floor === "number" ? Math.max(1, dungeon.progress.floor) : 1;
    if (
        dungeon &&
        dungeon.settings &&
        typeof dungeon.settings.qingmingChainIntroDoneFloor === "number" &&
        dungeon.settings.qingmingChainIntroDoneFloor === _qf
    ) {
        nothingEvent();
        return;
    }
    if (dungeon && dungeon.settings) {
        dungeon.settings.qingmingChainIntroDoneFloor = _qf;
        if (typeof saveData === "function") saveData();
    }
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor);
    var incenseCost = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(10, 26) * floor)));
    var dueNext = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
    const intro =
        `<span class="StellarSign">【清明·归尘】</span>雨丝像细线，把天和地缝在一起。纸灰贴着雾飘，松香里混着潮土气——人间扫墓的味道，落在这劫境里，像一记不合时宜的耳光。` +
        `石径尽头，一盏残灯抖得几乎要灭。提灯的是个半透明的稚童，鞋上泥从未干过：她说，她走了很久，也等了很多个清明，可每年雨一来，路就改，碑就偏，像天地不许她们相认。` +
        `她仰头看你，眼眶里没有泪，只有空：「仙长……阿婆的碑被草吃掉了。她站在那儿，却怎么也想不起自己叫什么。」她嗓子发哑，像哭过又强行咽回去：「她忘了名字……可我还记得。我怕我一旦也忘了，她就真的……从这世上被抹干净了。」` +
        `她顿了顿，指甲掐进掌心：「她说，若连名字都没了，活人会不会……就当她们从没活过？」风过林梢，像有人把话生生掐断；雨点敲在伞骨上，一声声，像在数还剩几口气息。`;
    const choices = `
        <div class="decision-panel">
            <button type="button" id="qmA1">蹲下，握她的手——怕一松，她也散了</button>
            <button type="button" id="qmA2">敬一支心香，让阿婆循味而来（灵石 ${nFormatter(incenseCost)}）</button>
            <button type="button" id="qmA3">不开口，只替她劈开眼前三尺浓雾</button>
            <button type="button" id="qmA4">别过脸——怕自己再也站不起来</button>
        </div>`;
    addDungeonLog(intro, choices);

    function scheduleStage2(branch, virtue) {
        scheduleDeferredEvent({
            kind: "qingmingChain",
            stage: 2,
            dueRoom: dueNext,
            branch: branch,
            virtue: virtue,
        });
        addDungeonLog(
            `你把残灯往怀里拢了拢，那点光终于稳了。稚童把额头抵在你袖边，抖得像寒夜里的猫。她小声说：「别松手……我怕一松，我就跟阿婆一样，再也摸不到谁了。」` +
                `你说不清喉头为什么发紧——也许是想起有人也曾等在门口，等到菜凉，等到灯灭，等到最后只余一碗没喂完的粥。约在下一劫数，那座被草埋住的碑，会浮出雾面；可你也明白，有些重逢，不过是让离别再发生一次。`
        );
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    }

    document.querySelector("#qmA1").onclick = function () {
        addDungeonLog(
            `你蹲下身，让她冰凉的指尖死死扣住你袖缘，像扣住最后一根绳。她说：「阿婆把糖藏在碑座缝里，说要等我来了才吃……可她没等到，我也没吃到。糖化了，烂在缝里，像一句没说出口的『乖』。」` +
                `她笑了一下，比哭还难看：「我后来才明白，她不是舍不得糖，是舍不得我长大——长大了，就不用人疼了。」你「嗯」了一声，不敢安慰。安慰在这时候像刀背，越轻越疼。她把灯举高，像怕你也像她一样，走着走着，就没人喊你回家。`
        );
        scheduleStage2("guide", 3);
    };
    document.querySelector("#qmA2").onclick = function () {
        if (player.gold < incenseCost) {
            addDungeonLog(
                `你掏不出那么多灵石，便把掌心贴在灯罩上，借体温替她挡风。火光映着她的脸，她盯着你的手，忽然别过脸：「……我以前也这样给阿婆暖过手。她最后几天，手怎么都暖不热。」` +
                    `「阿婆说穷不要紧，」她学舌，声音发飘，「要紧的是别让人走得太冷清。」她顿了顿，像把刀往自己心里又捅一寸：「可她走的时候……屋里还是冷清的。我喊她，她不应了。」`
            );
            scheduleStage2("incense", 2);
            return;
        }
        player.gold -= incenseCost;
        addDungeonLog(
            `你焚的不是凡香，是一缕愿心。烟升起时，纸灰旋成极薄的蝶，落在她发间像一场迟来的雪。她忽然捂住嘴，肩膀抖得停不下来：「阿婆闻到了……她说，谢谢大人，没嫌她走得慢。」` +
                `她喘了口气，像把胸腔里积压多年的酸硬吐出一半：「她还让我告诉你——她年轻时也爱漂亮，最怕疼，最怕丑。可病死的时候……没人问她怕不怕。」孩子吸了吸鼻子，笑比哭碎：「若你记得她，她就还在。可若你也忘了……她就真的，只剩这一撮灰了。」`
        );
        scheduleStage2("incense", 4);
        playerLoadStats();
    };
    document.querySelector("#qmA3").onclick = function () {
        addDungeonLog(
            `你伸手在雾中划了一道弧，不开口，不许诺——怕一开口，先碎的是你自己。稚童怔了怔，却把灯举得更高：「……你别说话。说话就会软。」` +
                `你们一前一后走，脚步声轻得像怕惊动坟里那些没喊完的名字。她忽然低声：「我其实不是怕鬼。我怕的是……活着的人，也会像鬼一样，走着走着就不见了。」`
        );
        var dueLater = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 2);
        scheduleDeferredEvent({
            kind: "qingmingChain",
            stage: 2,
            dueRoom: dueLater,
            branch: "silent",
            virtue: 3,
        });
        addDungeonLog(
            `雾薄了一线，像有人从很远的地方替你掀开帘子。可你也清楚：有些「我在」注定说不满一辈子；有些人你送得到碑前，却送不回灶边那碗热粥。`
        );
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#qmA4").onclick = function () {
        var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.08)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        addDungeonLog(
            `<span class="Common">你转身时，雨声忽然大了一拍，像天地替你掩住那一声哽咽。</span>你没有回头——怕看见她眼里的空，会想起自己也曾是谁的孩子，也曾把谁的衣角攥出水痕。` +
                `身后静了一瞬，随即传来极轻极轻的一声，像风，也像孩子把牙咬碎才挤出半句：「……那我也，等不到了吗？」灯焰黯下去，再没有亮起来。` +
                `气血微涌 <b>+${nFormatter(heal)}</b>——像命运施舍的一点烫，烫得你心口发苦：原来有些温柔，是拿别人的绝望换的。`
        );
        dungeon.status.event = false;
        playerLoadStats();
        saveData();
        updateDungeonLog();
    };
};

function qingmingChainStageTwoEvent(p) {
    dungeon.status.event = true;
    var branch = p.branch || "guide";
    var virtueAcc = typeof p.virtue === "number" ? p.virtue : 2;
    var openByBranch = {
        guide:
            "第二程，雨势收了些，像哭久了的人终于喘上一口气。稚童拽着你的袖角往乱冢深处指，指节发白：「就在那里……草比人高。阿婆说，世上的人忙，忙到连坟头都懒得看。」她声音发飘：「她不是怪他们……她只是怕。怕被忘。」",
        incense:
            "香痕在泥里蜿蜒，浮起极淡的金纹，像血沁久了才显的字。你忽然想起人间老话：临终的人最怕两件事——疼，和没人送。",
        silent:
            "一路无话。到碑前时，碑角泥印未干，深得像指节按进肉里那种狠——不知是谁在夜里抠着石面，抠到指甲裂了也不肯停。",
    };
    var open = openByBranch[branch] || openByBranch.guide;
    qingmingRitualStep(p, 0, virtueAcc, open);
}

function qingmingRitualStep(p, step, virtueAcc, openLine) {
    var nextDue = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(1, 2));
    var finishRitual = function (extraV) {
        var va = virtueAcc + (typeof extraV === "number" ? extraV : 0);
        scheduleDeferredEvent({
            kind: "qingmingChain",
            stage: 3,
            dueRoom: nextDue,
            branch: p.branch || "guide",
            virtue: va,
        });
        addDungeonLog(
            `你把最后一缕心念按进土里，像替谁把没磕完的头磕完。残灯骤亮又柔，恍惚有人隔着生死来握你的手——可你指间一紧，只抓到空。那温度像错觉，像回光返照，亮一下就灭。` +
                `远处鸦啼撕开雾，雨丝里掺进一线晴，像天也在擦眼睛，却越擦越红。`
        );
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };

    if (step === 0) {
        const choices = `
        <div class="decision-panel">
            <button type="button" id="qmS0">跪下来，一根根拔掉缠碑的荒草</button>
            <button type="button" id="qmS0b">并指涤瘴（灵息翻涌，恐遭反噬）</button>
            <button type="button" id="qmS0c">拔剑斩碑侧祟影</button>
        </div>`;
        addDungeonLog(
            `<span class="StellarSign">【清明·归尘】第二程。</span>${openLine}无字碑半陷泥中，藤草疯长，像要把最后一行履历、最后一个记得她的人，一并吞进土里。`,
            choices
        );
        document.querySelector("#qmS0").onclick = function () {
            addDungeonLog(
                `你跪进泥里，一根根理清草梗，指甲缝里渗出血丝也不停。草下硌着碎瓷，是旧年供碗的碴，锋利得像谁把『团圆』摔碎在地上。泥水顺着碑缘淌下，像迟到多年的泪线——你忽然明白，所谓扫墓，有时是活人替死人把没流完的泪，一次性哭干。`
            );
            qingmingRitualStep(p, 1, virtueAcc + 1, openLine);
        };
        document.querySelector("#qmS0b").onclick = function () {
            if (Math.random() < 0.68) {
                addDungeonLog(
                    `<span class="Legendary">剑意如帚，阴雾散开寸许；碑石微温，像有人贴着石面长长舒了口气。那口气太轻，轻得像回光——你心头一沉：她也许不是不疼，只是疼惯了，不敢说。</span>`
                );
                qingmingRitualStep(p, 1, virtueAcc + 2, openLine);
            } else {
                var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.11)));
                player.stats.hp = Math.max(1, player.stats.hp - dmg);
                addDungeonLog(
                    `<span class="Common">瘴气倒卷入脉，胸口像被旧伤撕开：气血 <b>-${nFormatter(dmg)}</b>。</span>你仍咬牙清出一角净空——你忽然恨这疼来得太迟：她咳血那年，你未必在；她咽气那夜，风也未必停。`
                );
                playerLoadStats();
                qingmingRitualStep(p, 1, virtueAcc, openLine);
            }
        };
        document.querySelector("#qmS0c").onclick = function () {
            dungeonQingmingCombatPending = {
                p: p,
                virtueAcc: virtueAcc + 1,
                openLine: openLine,
            };
            dungeon.status.event = false;
            startDangerEventCombat(
                `<span class="Rare">碑侧荒草深处，祟影扒地而起，涎水滴在「无字」上——像要把最后一点人间也嚼碎。</span>`,
                null,
                {
                    minQuality: 4,
                    statMul: 1.02,
                    rewardMul: 1.08,
                    lvlBonus: 0,
                    victoryBonus: { extraGoldMul: 1.08, extraExpPct: 0.028 },
                }
            );
        };
    } else if (step === 1) {
        const choices = `<div class="decision-panel"><button type="button" id="qmS1">化露拭碑，一寸一寸擦净泥污</button></div>`;
        addDungeonLog(
            `泥污之下，石纹隐约像姓氏，又像被人用铲子生生铲平过——只剩残笔，像一声没喊完的「娘」。你忽然怕：怕这世上真有人，连名字都留不下；更怕留得下，也没人肯念。`,
            choices
        );
        document.querySelector("#qmS1").onclick = function () {
            addDungeonLog(
                `露水是冷的，石碑却一瞬微温，像老人终于握住你冰凉的手。可那暖太短，短得像回光——你还没来得及回握，温度就散了。你眼眶发酸，却不敢眨眼，怕一眨眼，连这点假象都没了。`
            );
            qingmingRitualStep(p, 2, virtueAcc + 1, openLine);
        };
    } else if (step === 2) {
        const choices = `<div class="decision-panel"><button type="button" id="qmS2">对无字处，替她把名字轻轻唤回来</button></div>`;
        addDungeonLog(
            `风从林隙钻来，带着纸马与檀香，混着极淡的粥香——可那粥香里夹着药苦，像最后那碗怎么喂都喂不进的薄粥，凉在床头，凉成一生遗憾。`,
            choices
        );
        document.querySelector("#qmS2").onclick = function () {
            addDungeonLog(
                `你没有捏造姓名，只低声说：「若世人不记，我记得；若碑上无字，我把你写进心里。」话音轻得像叹息，碑前草叶齐整伏下一瞬，像许多人同时弯腰行礼。` +
                    `稚童在身后死死攥着你的衣角，抽噎得喘不过气，却硬挤出笑：「阿婆听见了……」她停了一下，像把刀往自己喉间又送半寸：「……可她喊的不是我的名字。她喊的是她女儿的。我替她高兴……又替她疼。」` +
                    `风过碑顶，像有人轻轻「嗯」了一声，不知是应你，还是应这世上所有叫错又来不及改口的想念。`
            );
            finishRitual(1);
        };
    }
}

function qingmingChainStageThreeEpilogue(p) {
    dungeon.status.event = true;
    var v = typeof p.virtue === "number" ? p.virtue : 2;
    var br = p.branch || "guide";
    var floor = Math.max(1, dungeon.progress.floor);
    addDungeonLog(
        `<span class="StellarSign">【清明·归尘】第三程·回响</span>雨脚忽然住了，像有人终于哭到失声。老妪的残影与稚童叠在一处，衣袂薄得像要碎的光。阿婆想抬手摸你的脸，指尖却只掠过一缝温风——她嘴型颤着，反复在说谢谢，却怎么也对不准焦距，像连「你是谁」都快记不清。` +
            `稚童把脸埋进阿婆影子里，声音发哑，仍硬撑着笑：「仙长……糖会化的，可甜不会。」她抬眼，眼里一片红：「阿婆让我告诉你——她不怨命，她怨的是……没把你小时候那声『乖』听够。」`
    );
    addDungeonLog(
        br === "incense"
            ? `香灰落在你靴尖，轻得像一声「记得我」。可香总会灭，灰总会散。你忽然懂了：清明是把那些不敢碰的想念抱出来晒晒——晒完，还得亲手埋回去；因为活着的人，还得继续活。`
            : br === "silent"
              ? `你们自始至终没说几句像样的话。雾散时，碑上的水痕一道道淌下来，像把一辈子说不出口的后悔，终于冲开一道口子——可口子开了，人也空了。`
              : `她把残灯递向你，又猛地缩回，像怕灯也跟人走：「灯还我……下次雨来，我还要接阿婆。她怕黑。」她低头看灯油将尽，笑了一下，碎得不成形：「……其实我也怕。可我怕了，她就没人接了。」你喉咙里像塞了团浸雨的棉，吞不下，吐不出。`
    );
    var goldGain = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(68, 138) * floor * (1 + v * 0.04))));
    if (br === "incense") {
        goldGain = Math.max(1, Math.floor(goldGain * 1.14));
    }
    var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.14, 0.24 + Math.min(0.06, v * 0.012))));
    const choices = `<div class="decision-panel"><button type="button" id="qmEnd">作揖送行——明知此去，多半是无归路</button></div>`;
    addDungeonLog(
        `天光漏下一指宽，落在碑上，也落在你眉间。恍惚有人隔着生死拍你肩，掌纹粗粝，力道却很轻：「孩子，别走太急……记得吃饭。」那声音越说越淡，像被风一点点抽走。` +
            `你想说「我会记得」，想说「别走」，可话到嘴边只剩涩。你深深一揖，嗓子哑得发疼：「两位……慢走。」你不敢说「再见」——你知道，有些再见，是世上最残忍的词。` +
            `她们的身影开始透明，最后一缕像叹息的话落进你耳里：「别学我们……把话，活着说完。」`,
        choices
    );
    document.querySelector("#qmEnd").onclick = function () {
        var expGain = rollDungeonExpFloorRewardAmount();
        var expAddedQm = dongtianDungeonPlayerExpAddBase(expGain);
        if (expAddedQm) {
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expGain * ps)));
            }
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") {
                lvlupPopup();
            }
        }
        player.gold += goldGain;
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        if (v >= 5 && player.bonusStats) {
            player.bonusStats.hp += 4.5;
        }
        if (dungeon && dungeon.settings && v >= 4) {
            dungeon.settings.chainTitleBuff = {
                id: "qingming_light",
                name: "春晖过客",
                atkMul: 1.05,
                dmgTakenMul: 0.96,
            };
        }
        addDungeonLog(
            (expGain > 0
                ? expAddedQm
                    ? `感悟 <b>+${nFormatter(expGain)}</b>，`
                    : dongtianDungeonPlayerExpMissedGainHintZh(expGain, false) + "，"
                : "") +
            `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(goldGain)}，气血 <b>+${nFormatter(heal)}</b>` +
                (v >= 5 ? `，<span class="Legendary">气血机缘永久 +4.5%</span>` : "") +
                (v >= 4 ? `。<span class="Apexother">称号「春晖过客」</span>加身（本次秘境生效）。` : `。`) +
                ` 你伫立良久，雨意已远，心口那一点余温也慢慢冷了——像有人替你掖过被角，手却抽得太快，只留下空。`
        );
        dungeon.status.event = false;
        playerLoadStats();
        saveData();
        updateDungeonLog();
    };
}

// ========= 劫同心 · 雾笺（第一人称长线：跨劫数延后、存档延续、含战斗与高额奖励） =========
function clearBondSoulCombatPending() {
    dungeonBondSoulCombatPending = null;
}

function getBondSoulSaga() {
    if (!dungeon || !dungeon.settings) return { active: false, bond: 0, branch: "", resumeStage: 0, cyclesCompleted: 0 };
    if (!dungeon.settings.bondSoulSaga || typeof dungeon.settings.bondSoulSaga !== "object") {
        dungeon.settings.bondSoulSaga = {
            active: false,
            bond: 0,
            branch: "",
            resumeStage: 0,
            cyclesCompleted: 0,
            emotionCombatByStage: {},
        };
    }
    return dungeon.settings.bondSoulSaga;
}

function rememberBondSoulWorld(delta) {
    if (!dungeon.settings.eventMemory || typeof dungeon.settings.eventMemory !== "object") {
        dungeon.settings.eventMemory = { faction: 0, ledger: 0, bondSoul: 0 };
    }
    if (typeof dungeon.settings.eventMemory.bondSoul !== "number" || isNaN(dungeon.settings.eventMemory.bondSoul)) {
        dungeon.settings.eventMemory.bondSoul = 0;
    }
    dungeon.settings.eventMemory.bondSoul = Math.max(
        -6,
        Math.min(10, dungeon.settings.eventMemory.bondSoul + (typeof delta === "number" ? delta : 0))
    );
}

/** 押镖 / 地脉行进中的劫同心旁白（不阻断流程，第一人称） */
function maybeBondSoulSideWhisper(mode) {
    if (!dungeon || !dungeon.settings) return;
    var g = dungeon.settings.bondSoulSaga;
    var sagaOn = !!(g && typeof g === "object" && g.active);
    var beenThere =
        sagaOn ||
        (g && typeof g.cyclesCompleted === "number" && g.cyclesCompleted > 0) ||
        (dungeon.settings.eventMemory && typeof dungeon.settings.eventMemory.bondSoul === "number" && Math.abs(dungeon.settings.eventMemory.bondSoul) >= 0.25);
    var fl = typeof dungeon.progress === "object" && typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1;
    var p;
    var pool;
    if (beenThere) {
        p = 0.062;
        if (sagaOn) p += 0.055;
        if (fl >= 20) p += 0.028;
        if (fl >= 45) p += 0.022;
        var escortLines = [
            `<span class="Rare">【劫同心】</span>镖铃一晃，<b>我</b>心口也跟着一晃——像她在很远的地方，替<b>我</b>数了一步路。<b>我</b>握缰更紧：走完这程，回秘境，要再强一点去见她。`,
            `<span class="Rare">【劫同心】</span>风里像有极轻的铃，贴着耳根掠过。<b>我</b>忽然想笑又想骂：<b>我</b>在人间护货，她在劫里等<b>我</b>——<b>我</b>谁都不想辜负。`,
            `<span class="Rare">【劫同心】</span>车轮碾过碎石，震得腕上空空如也。<b>我</b>却觉得那里该系着什么。<b>我</b>低声说：等着，<b>我</b>赚够底气就回去找你。`,
            `<span class="Rare">【劫同心】</span>夜路最长的一程，<b>我</b>却不觉冷——像有人隔着千山，给<b>我</b>披了一层念。`,
            `<span class="Rare">【劫同心】</span>镖旗猎猎，<b>我</b>心里却软了一下：她若看见<b>我</b>这般狼狈，会不会又骂又心疼？`,
            `<span class="Rare">【劫同心】</span>劫修再凶，凶不过<b>我</b>想起她时那一瞬的软肋——可<b>我</b>愿意更硬，硬到能护她。`,
            `<span class="Rare">【劫同心】</span>驿站灯火稀，<b>我</b>却想起她说过「别怕黑」——那时她声音也抖，仍把<b>我</b>往亮处推。<b>我</b>把缰绳绕紧一圈：这一趟，不能让她白信。`,
            `<span class="Rare">【劫同心】</span>雨打在篷上，像有人轻轻敲<b>我</b>背。<b>我</b>忽然鼻酸：若她在，大概会骂<b>我</b>淋湿，又默默把干衣塞过来。`,
            `<span class="Rare">【劫同心】</span>货箱再重，重不过<b>我</b>想起她等<b>我</b>时垂下的眼睫。<b>我</b>咬牙上坡——多扛一斤，就多一寸资格，把「回来」说成真的。`,
            `<span class="Rare">【劫同心】</span>同行镖师笑<b>我</b>走神，<b>我</b>只摇头。他们不懂：心口那声铃，比任何暗号都准——它在，<b>我</b>就不敢松。`,
            `<span class="Heirloom">【劫同心·路语】</span>尘里每一里，都像在量<b>我</b>离她还有多远。<b>我</b>不求捷径，只求到那一日，能堂堂正正说：<b>我</b>来了，让你久等。`,
        ];
        var miningLines = [
            `<span class="Rare">【劫同心】</span>地肺深处闷响如雷，可<b>我</b>灵台里却静了一瞬——像有人替<b>我</b>挡了一声心魔。<b>我</b>镐落得更稳：多挖一寸髓，就多一寸去见她的资格。`,
            `<span class="Rare">【劫同心】</span>矿脉潮气扑脸，冷得像那夜她指尖。<b>我</b>把念头压进丹田：别软，软了就走不到更深，她也等不到更强的<b>我</b>。`,
            `<span class="Rare">【劫同心】</span>石壁渗水，滴声如铃。<b>我</b>驻足半息，忽然很想知道——她此刻是不是也站在雾里，听同一声回音。`,
            `<span class="Rare">【劫同心】</span>矿兽嘶吼里，<b>我</b>竟听出一丝柔，像她在喊<b>我</b>别逞能——<b>我</b>却更要赢。`,
            `<span class="Rare">【劫同心】</span>一镐下去，石屑飞溅如星。<b>我</b>想：若把这些星串起来，能不能照亮她去<b>我</b>的路？`,
            `<span class="Rare">【劫同心】</span>地脉闷痛，<b>我</b>胸口却暖——像她与<b>我</b>同息，同扛这人间地下的黑。`,
            `<span class="Rare">【劫同心】</span>幽蓝矿光映在脸上，<b>我</b>忽然错觉她就在光后眨眼。<b>我</b>把镐柄攥出水痕：再掘一层，也许就能掘到她的呼吸。`,
            `<span class="Rare">【劫同心】</span>塌方前那一息，<b>我</b>听见极轻的「小心」——不知是心魔还是她。<b>我</b>侧身滚开，后背冷汗：若为见她，这条命得省着用。`,
            `<span class="Rare">【劫同心】</span>矿尘呛喉，<b>我</b>却笑了一下：她若在此，一定又骂<b>我</b>不爱惜肺，又递来湿帕——<b>我</b>把笑咽下去，换一口更稳的气。`,
            `<span class="Rare">【劫同心】</span>深处愈黑，腕上铃愈像一点星。<b>我</b>贴着石壁歇半息，默念她的名字，像念一道护身诀。`,
            `<span class="Heirloom">【劫同心·渊语】</span>地底没有日月，<b>我</b>却用她的等当作时辰——每多一块髓，就多一声「还来得及」说给自己听。`,
        ];
        pool = mode === "mining" ? miningLines : escortLines;
    } else {
        p = 0.03;
        if (fl >= 15) p += 0.01;
        if (fl >= 35) p += 0.01;
        var escortOmen = [
            `<span class="Common">【劫同心·预兆】</span>镖铃本寻常，这一声却像敲在<b>我</b>骨头里。<b>我</b>不知为何心慌，只下意识抬头望了一眼雾——仿佛劫境那头，有人正要唤<b>我</b>名字。`,
            `<span class="Common">【劫同心·预兆】</span>风过辕侧，空无一物，<b>我</b>却听见极轻的环佩响，像错觉。<b>我</b>苦笑：大概是<b>我</b>走镖走疯了——可心里又隐隐盼着，秘境里真有谁在等<b>我</b>变强。`,
            `<span class="Common">【劫同心·预兆】</span>红尘路远，<b>我</b>护的是货，可胸口那一下空，护不住。<b>我</b>把念头摁下：先活下去、先强起来——也许有一天，铃会替<b>我</b>指一条路。`,
            `<span class="Common">【劫同心·预兆】</span>马打了个响鼻，<b>我</b>却像听见有人笑了一声，近得像贴在背后——回头什么也没有。`,
            `<span class="Common">【劫同心·预兆】</span>星子很亮，亮得像一双眼睛在看<b>我</b>。<b>我</b>握缰的手紧了紧：谁？`,
            `<span class="Common">【劫同心·预兆】</span>歇脚时<b>我</b>摸向怀中，空无一物，却像少了半颗心。<b>我</b>望着天际线发呆：是不是有个人，也正望着同一方向。`,
            `<span class="Common">【劫同心·预兆】</span>路过茶摊，说书人讲「劫里遇故人」，<b>我</b>茶盏一抖，水溅在袖上——像谁替<b>我</b>擦过泪似的。`,
            `<span class="Rare">【劫同心·预兆】</span>风里掠过一句极轻的「慢些」，<b>我</b>勒马回望，长路无人。<b>我</b>喉间发涩：……是你吗？`,
        ];
        var miningOmen = [
            `<span class="Common">【劫同心·预兆】</span>地脉里忽然静了一拍，像有人隔着厚土，替<b>我</b>屏住了呼吸。<b>我</b>不知那是谁，却莫名想往更深处去——好像再掘一层，就能掘到一句未说完的话。`,
            `<span class="Common">【劫同心·预兆】</span>水滴落镐尖，清越如铃。<b>我</b>怔了怔：这洞府里不该有铃。<b>我</b>摇头甩开杂念，可那余音缠着心口不散，像预告。`,
            `<span class="Common">【劫同心·预兆】</span>矿尘迷眼，<b>我</b>却看见雾的幻影一闪而逝。<b>我</b>心里冒出一个荒唐念头：若劫境里真有人等，<b>我</b>这副身子，还得再硬一点才配走近。`,
            `<span class="Common">【劫同心·预兆】</span>石缝里漏出一缕不该存在的香，像人间晒过的衣。<b>我</b>愣住：这底下……也做梦吗？`,
            `<span class="Common">【劫同心·预兆】</span>镐柄震得掌心生麻，心口却软了一下，像被人隔空握了握。`,
            `<span class="Common">【劫同心·预兆】</span>矿脉深处忽有暖意逆流，像有人把掌贴在<b>我</b>背心。<b>我</b>僵住不敢回头——怕一回头，只剩冷石。`,
            `<span class="Common">【劫同心·预兆】</span>石壁上苔痕蜿蜒，像谁用指甲划过「等」字又抹掉。<b>我</b>指尖抚过，胸口莫名发紧。`,
            `<span class="Rare">【劫同心·预兆】</span>幽光里浮出半张纸角，触之即散。<b>我</b>只看清一个「别」字，后半截被黑暗叼走——像命运故意留<b>我</b>一个悬念。`,
        ];
        pool = mode === "mining" ? miningOmen : escortOmen;
    }
    if (Math.random() > p) return;
    var whisperStill =
        pickBondSoulLine([
            `<br><span class="Heirloom">【慢下来】</span>红尘与劫路都在催<b>我</b>赶路，<b>我</b>偏停半息——若明天铃不响，<b>我</b>会不会恨今天没把「在乎」说满。`,
            `<br><span class="Heirloom">【慢下来】</span>刀光剑影外还有一口气要留给「人」。<b>我</b>把呼吸放轻，像怕惊醒某个还没写完的折。`,
            `<br><span class="Rare">【慢下来】</span>强者常学会快，却忘了慢才是把谁放进命里的姿势。<b>我</b>问自己：这一路，<b>我</b>到底在赢什么。`,
            `<br><span class="Heirloom">【慢下来】</span>有时<b>我</b>怕的不是死，是忙到忘了为何而活——那一声铃，像替<b>我</b>把理由捡回来。`,
            `<br><span class="Rare">【慢下来】</span>修行教人斩念，可此刻<b>我</b>只想把念握紧：有人等，<b>我</b>就不是孤魂。`,
            `<br><span class="Heirloom">【慢下来】</span>若情深是劫，那<b>我</b>愿在这劫里多停一瞬——把她的眉眼在心里描清楚，免得将来回忆发糊。`,
        ]) + "<br>";
    addDungeonLog(whisperStill + pool[Math.floor(Math.random() * pool.length)]);
}

function bondSoulPersistResume(stage, bond, branch) {
    var g = getBondSoulSaga();
    g.active = true;
    g.resumeStage = stage;
    g.bond = bond;
    g.branch = branch || g.branch || "warm";
}

function pickBondSoulLine(arr) {
    if (!arr || !arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

/** 已完成完整「劫同心」周目数（本轮进行中尚未 +1） */
function getBondSoulCycles() {
    var g = getBondSoulSaga();
    return typeof g.cyclesCompleted === "number" && !isNaN(g.cyclesCompleted) ? Math.max(0, Math.floor(g.cyclesCompleted)) : 0;
}

function tryBondSoulChainAmbientResume() {
    if (!dungeon || !dungeon.settings || dungeon.settings.deferredEvent) return false;
    if (!dungeon.status.exploring || dungeon.status.event) return false;
    if (typeof player !== "undefined" && player && player.inCombat) return false;
    var g = getBondSoulSaga();
    if (!g.active || g.resumeStage < 2) return false;
    if (Math.random() > 0.082) return false;
    var due = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(1, 2));
    scheduleDeferredEvent({
        kind: "bondSoulChain",
        stage: g.resumeStage,
        dueRoom: due,
        bond: typeof g.bond === "number" ? g.bond : 0,
        branch: g.branch || "warm",
    });
    addDungeonLog(
        pickBondSoulLine([
            `<span class="StellarSign">【劫同心】</span>铃声像贴着肋骨敲。<b>我站住，吸气——我知道这劫还没完，她也还在。</b>`,
            `<span class="StellarSign">【劫同心】</span>雾色深处有人唤了一声，像唤名又像唤命。<b>我脚下一顿，掌心发烫：她在等我接下一程。</b>`,
            `<span class="StellarSign">【劫同心】</span>心口那一下铃，比剑鸣还清楚。<b>我苦笑——逃得过妖，逃不过她。</b>`,
            `<span class="StellarSign">【劫同心】</span>四下无声，却像有视线落在后颈。<b>我回头，只见雾；可我知道，她在下一劫数等我。</b>`,
            `<span class="StellarSign">【劫同心】</span>一缕温意掠过灵台，像有人替<b>我</b>理了理乱掉的心绪。<b>我低声道：来了。</b>`,
            `<span class="StellarSign">【劫同心】</span>秘境的风忽然软了半寸，像有人替<b>我</b>把杀意按下去。<b>我喉头发紧：这一程，不能再让她白等。</b>`,
            `<span class="Rare">【劫同心·余绪】</span>刚斩完的妖血未冷，铃却先暖。<b>我</b>把剑穗理顺，像理顺一句没说出口的「想你」。`,
            `<span class="Rare">【劫同心·余绪】</span>脚步本要往深处去，心却先拐了个弯——<b>我</b>笑自己没出息：可没出息里，有活人味。`,
        ])
    );
    if (typeof saveData === "function") saveData();
    if (typeof updateDungeonLog === "function") updateDungeonLog();
    return true;
}

function bondSoulChainRouter() {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    var g = getBondSoulSaga();
    if (g.active && g.resumeStage >= 2) {
        var due = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
        scheduleDeferredEvent({
            kind: "bondSoulChain",
            stage: g.resumeStage,
            dueRoom: due,
            bond: typeof g.bond === "number" ? g.bond : 0,
            branch: g.branch || "warm",
        });
        addDungeonLog(
            pickBondSoulLine([
                `<span class="StellarSign">【劫同心】</span>雾丝拂面，铃音一声近、一声远。<b>我喉头发紧——又是她。</b>`,
                `<span class="StellarSign">【劫同心】</span>劫气翻涌里，偏有一线清音穿出来。<b>我指尖发麻：这秘境再凶，也凶不过她看我那一眼。</b>`,
                `<span class="StellarSign">【劫同心】</span>像有人把红线往<b>我</b>腕上又系紧半寸。<b>我叹气，又忍不住弯了弯嘴角——行，我去。</b>`,
                `<span class="StellarSign">【劫同心】</span>不必回头，<b>我</b>也知道她在。<b>我整了整剑穗：这一劫，我替她多扛一点。</b>`,
                `<span class="StellarSign">【劫同心】</span>刚踏出半步，心口像被轻轻拽了一下。<b>我哑声笑：好，好——连劫都学会替你说「留下」了。</b>`,
                `<span class="Rare">【劫同心·接续】</span>上一层的血味还在袖上，铃却先替<b>我</b>洗心。<b>我</b>把杀意收鞘：去见她时，手要干净一点。`,
            ])
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
        return;
    }
    if (!g.active) {
        bondSoulChainIntroEvent();
        return;
    }
    nothingEvent();
}

function bondSoulChainIntroEvent() {
    if (dungeon && dungeon.settings && dungeon.settings.deferredEvent) {
        nothingEvent();
        return;
    }
    dungeon.status.event = true;
    var floor = Math.max(1, dungeon.progress.floor);
    var g = getBondSoulSaga();
    var cyIntro = getBondSoulCycles();
    var minFloorHint = cyIntro > 0 ? Math.max(2, Math.min(35, cyIntro * 2 + 1)) : 1;
    if (cyIntro > 0 && floor < minFloorHint && Math.random() < 0.52) {
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Common">【劫同心】</span>雾里有铃，像唤我，又像唤别人。<b>我按住剑柄——还不够强，还不够深；我告诉自己，再往下一层，也许就能把她听清楚。</b>`,
                `<span class="Common">【劫同心】</span>铃音贴着秘境层数往上爬，越爬越急。<b>我像被她拽着心：再深一点，再强一点——别让她等成一声空响。</b>`,
                `<span class="Common">【劫同心】</span>这一层雾太薄，装不下她整句话。<b>我咬牙往下想：等我，我把路劈到你面前。</b>`,
                `<span class="Common">【劫同心】</span>胸口空了一下，像有人隔着千山万水敲<b>我</b>。<b>我收剑入鞘：下一层，换我敲回去。</b>`,
                `<span class="Common">【劫同心】</span>铃像贴在耳廓上叹气。<b>我</b>驻足，忽然很想回一句「我在」——可层数不够，话也传不过去，只能把脚步踩得更重些。`,
                `<span class="Rare">【劫同心】</span>这一层安静得残忍，像故意让<b>我</b>听见自己的心跳。<b>我</b>把心跳压稳：再下几层，就去接那句没说完的话。`,
            ])
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
        return;
    }
    var dueNext = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + 1);
    var introPrefix = "";
    if (cyIntro > 0) {
        var prePool = [
            `<span class="Heirloom">雾再起时，<b>我</b>竟不觉得陌生——像有人把「重逢」两个字提前刻在骨里。</span>她回眸，眼尾微红却笑：「第 ${cyIntro + 1} 次了……你还来，我就还等。」`,
            `<span class="Heirloom">铃先认出了<b>我</b>。</span>她按住心口，像按住狂跳：「我以为你会腻……可你又踏进雾里了。」`,
            `<span class="Heirloom">这一层的风像旧梦翻身。</span>她轻声：「欢迎回来，<b>我</b>的……劫，也是<b>我</b>的归处。」`,
            `<span class="Rare">又一次。</span>她像把叹息咽回去，只留一句：「别说话，先让我看你一眼。」`,
            `<span class="Heirloom">雾像记得<b>我</b>的脚印。</span>她指尖发颤，仍把笑撑稳：「你每次回来……都瘦一点。下次不许了。」`,
            `<span class="Rare">她站在老地方，像从未离开过。</span>声音却哑了：「<b>我</b>数过铃响 ${cyIntro + 1} 折……你一响，<b>我</b>就知道人间没把你吃掉。」`,
        ];
        if (cyIntro >= 3) {
            prePool.push(
                `<span class="StellarSign">周回愈多，愈像誓言。</span>她把纸笺按在<b>我</b>掌心，指节发白：「你若还来，我便当你把一生都分我一半。」`
            );
        }
        if (cyIntro >= 5) {
            prePool.push(
                `<span class="Apexother">劫同心·久别</span>她不再问真假，只把额头抵在<b>我</b>肩侧很久，久到<b>我</b>觉出她肩线在抖。她哑声：「……够了。你在，<b>我</b>就敢继续信这荒诞的缘——信到下一折、再下一折，信到铃哑了也还想信。」`
            );
            prePool.push(
                `<span class="Apexother">劫同心·久别</span>她抬手想碰<b>我</b>脸，又停在半空，最后只轻轻落在<b>我</b>腕脉上，像确认<b>我</b>还活着。她闭眼笑：「……回来就好。别的，等你喘匀了再说。」`
            );
        }
        introPrefix = pickBondSoulLine(prePool) + "<br><br>";
    }
    var intro =
        introPrefix +
        pickBondSoulLine([
            `<span class="StellarSign">【劫同心·雾笺】</span>` +
                `<b>我</b>本以为这劫境只剩杀与走，直到雾忽然软了一寸——像有人用手指替我拨开帘。` +
                `铃没有响在耳边，是响在<b>我</b>心口：一下，两下，像在数<b>我</b>还剩多少勇气。` +
                `她背对<b>我</b>站着，肩线薄得像会被风吹断。她没回头，只问：「你也听见了？」` +
                `<b>我</b>想撒谎，可喉咙先软了：听见。` +
                `她掌心躺着一张潮软的纸笺，字晕开了，只剩半句能读：<span class="Heirloom">「若你还认得我，就别……」</span>` +
                `后半句被雾吃掉了。她笑得很轻：「选吧。<b>我</b>不会怪你——<b>我</b>只怕最后怪你的人，只剩你自己。」`,
            `<span class="StellarSign">【劫同心·雾笺】</span>` +
                `这一路<b>我</b>斩妖斩惯了，斩到几乎忘了心跳也会疼。可雾起时，疼忽然回来了——像有人把<b>我</b>从「修士」两个字里拽出来，拽成一个会慌的凡人。` +
                `她站在影子里，发梢凝着潮气：「别装听不见。」铃在<b>我</b>胸腔里应了一声。` +
                `纸笺湿得发皱，半句朱批：<span class="Heirloom">「若你还认得我，就别……」</span>余下半截被风撕走。` +
                `她抬眼，眸子里没有刀，只有火：「你若走，我不哭；你若留一半，我才恨。」`,
            `<span class="StellarSign">【劫同心·雾笺】</span>` +
                `有人说劫境无春。<b>我</b>却在这刻闻见极淡的香——像旧年窗下晒过的书，像她曾把<b>我</b>名字写错过一笔又涂改的那页。` +
                `她背对<b>我</b>，声音低：「你又来了。」不是问，是认。` +
                `她摊开掌心，纸笺上的字被泪水晕成云：<span class="Heirloom">「若你还认得我，就别……」</span>` +
                `雾把后半句吞了，只剩<b>我</b>喉咙里发涩的「我在」。她笑：「在就好。剩下的，你慢慢选。」`,
            `<span class="StellarSign">【劫同心·雾笺】</span>` +
                `<b>我</b>剑上血未干，指尖却先颤——前方不是敌，是她。` +
                `她像从<b>我</b>最不敢碰的梦里走出来，衣袂薄，步子稳：「这次别逃。」` +
                `铃不响在天地，响在<b>我</b>骨节里，一声声催<b>我</b>诚实。` +
                `她把纸笺按在<b>我</b>胸口：<span class="Heirloom">「若你还认得我，就别……」</span>字迹化开，像心在化。` +
                `她轻声补刀：「别装作……从没心动过。」`,
            `<span class="StellarSign">【劫同心·雾笺】</span>` +
                `时间在这里像被谁按住了。<b>我</b>忽然想起人间一句话：遇见一个人，有时不是幸运，是审判——审你敢不敢承认自己也软弱。` +
                `她不动，像在等<b>我</b>把「修士」那层壳自己剥下来。剥下来会疼，可不剥，会更疼。`,
            `<span class="StellarSign">【劫同心·雾笺】</span>` +
                `雾像一场迟来的雨，落在<b>我</b>剑上，把血洗淡，却把心事洗亮。` +
                `她站在三步外，像站在<b>我</b>所有「以后」的门口，手扶着门框，指节白得发亮：「……你还认得这扇门吗？」` +
                `铃不响在风里，响在<b>我</b>肋骨间，一下一下，像在替<b>我</b>答「认得」。` +
                `她把纸笺举到两人中间，字迹被潮气晕成泪：<span class="Heirloom">「若你还认得我，就别……」</span>` +
                `后半句被雾衔走，只剩她眼底那点不肯熄的光：「别让我一个人，把这句话补完。」`,
        ]);
    var introStill =
        "<br><br><span class=\"Uncommon\">【驻足】</span>" +
        pickBondSoulLine([
            `风停了半息，像天地也在等。<b>我</b>问自己：若此刻选错，十年后会不会在某个夜里，突然想起她肩线的弧度？`,
            `铃不催，心却急。<b>我</b>忽然看清一件事——有些选择不是点一下按钮，是把后半生的疼或甜，提前押上桌。`,
            `她不言，却比千言重。<b>我</b>第一次在这劫里不想快：想慢，想把每个字都听进骨头里，再决定要不要负责。`,
            `「怕吗？」<b>我</b>在心里问己。怕。可爱若不怕，多半是假；怕还敢伸手，才算真的。`,
            `纸笺上的半句像一道没封口的伤。<b>我</b>若装作看不见，伤不会好，只会化脓——将来连<b>我</b>自己都嫌自己脏。`,
            `她肩那么薄，却替<b>我</b>挡过风似的。<b>我</b>忽然鼻酸：若这世上真有人愿为<b>我</b>疼，<b>我</b>怎么还能装看不见。`,
            `这一刻没有妖吼，没有剑鸣，只有两颗心跳得笨拙。<b>我</b>才懂——最狠的劫，有时是让人重新会软。`,
        ]);
    var choices = `
        <div class="decision-panel">
            <button type="button" id="bsIn1">我上前握住她的手——先确认她是不是冷的</button>
            <button type="button" id="bsIn2">我把纸笺贴在心口，闭眼听那一声铃</button>
            <button type="button" id="bsIn3">我退半步：你是谁？我怕又是心魔幻形</button>
            <button type="button" id="bsIn4">我转身：劫里不该有儿女情长</button>
        </div>`;
    addDungeonLog(intro + introStill, choices);

    function armIntro(branch, bond, schedule) {
        g.active = true;
        g.branch = branch;
        g.bond = bond;
        g.emotionCombatByStage = {};
        rememberBondSoulWorld(bond >= 3 ? 0.35 : bond >= 1 ? 0.2 : -0.15);
        if (schedule) {
            bondSoulPersistResume(2, bond, branch);
            scheduleDeferredEvent({
                kind: "bondSoulChain",
                stage: 2,
                dueRoom: dueNext,
                bond: bond,
                branch: branch,
            });
            addDungeonLog(
                pickBondSoulLine([
                    `她把指尖在<b>我</b>袖缘停了一瞬，像怕一松就散：「下一劫……你还会在吗？」` +
                        `<b>我</b>没答全，只在心里默念：<b>我要在。我要强到下一次雾起时，不必再逃。</b>`,
                    `她忽然把额头轻轻抵在<b>我</b>肩侧，又立刻退开，像怕自己贪心：「……别消失得太快。」` +
                        `<b>我</b>喉结滚动，只挤出一句笨话：<b>我</b>去下一劫等你。她「嗯」了一声，像把命押在这声上。`,
                    `风把她的发吹乱，她也不理，只盯着<b>我</b>眼睛：「你若骗我，铃会疼。」` +
                        `<b>我</b>伸手替她理了理鬓角——手比剑还抖：<b>我</b>不骗你，<b>我</b>去变强。`,
                    `她低声笑，笑得发苦：「你知道吗？我最怕你对我好一半。」` +
                        `<b>我</b>摇头：<b>我</b>要么不给，要给就给到底。雾听着，天听着，<b>我</b>也听着。`,
                    `她望着雾深处，忽然轻声像自语：「有时候<b>我</b>宁愿你是坏人……至少不必这么辛苦地好。」` +
                        `<b>我</b>心口一绞。她又立刻笑开，像怕<b>我</b>当真：「骗你的——你还是当好你的笨蛋吧。」`,
                    `她把<b>我</b>袖口攥出褶，又慌忙抚平，像怕留下证据：「……下一劫若更凶，你别逞英雄，留一口气给<b>我</b>。」` +
                        `<b>我</b>点头，才发现自己也会被人这样叮嘱——原来被念着，是这么烫的事。`,
                ])
            );
            addDungeonLog(
                pickBondSoulLine([
                    `<span class="Common">雾在身后合拢，像把一句话生生掐断。</span><b>我</b>走了几步，才发觉掌心全是汗——原来怕的从不是妖，是怕她真的消失。`,
                    `铃在腕上轻响，像在替她说：「我在。」<b>我</b>把那句回音按进胸口，烫得发疼。`,
                    `她没跟来，可<b>我</b>每一步都像踩在她的目光里。<b>我</b>忽然懂了什么叫「舍不得」——舍不得让她的等落空。`,
                    `回头看不见她了，心口却更满。<b>我</b>哑声对雾说：等着——像对她发誓，也像对<b>我</b>自己。`,
                ])
            );
            addDungeonLog(
                pickBondSoulLine([
                    `<span class="Rare">【扪心】</span>若情深是劫，那薄情算不算另一种劫？<b>我</b>不敢自诩清醒——只怕清醒到最后，只剩一个人对着空铃发呆。`,
                    `<span class="Rare">【扪心】</span>修行教人斩念，可爱从来不是念，是命里长出的肉。<b>我</b>若斩她，斩的其实是自己还能软的那块。`,
                    `走出十步，<b>我</b>仍忍不住停了一瞬：这一瞬不是犹豫，是敬重——敬重她的等，也敬重<b>我</b>终于敢承认想要。`,
                    `<span class="Heirloom">【扪心】</span>有人等，路就不算野。<b>我</b>把这句话嚼碎咽下去，化成下一步的力气。`,
                ])
            );
        }
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    }

    document.querySelector("#bsIn1").onclick = function () {
        addDungeonLog(
            pickBondSoulLine([
                `她手指真冷。<b>我</b>握住的那刻，她肩一塌，像终于敢累：「我以为你会先问真假。」` +
                    `<b>我</b>说：<b>我</b>先问你还疼不疼。她别过脸，声音发哑：「疼啊……可有人握，就不那么疼了。」`,
                `<b>我</b>掌心的温度渡过去，她像被烫到，又舍不得抽开：「……你这样会惯坏我。」` +
                    `<b>我</b>哑声：那就惯坏。她鼻尖一红：「你以后不许反悔。」`,
                `她五指一点点扣紧<b>我</b>，像扣命：「我等了太久，等到会笑也会恨。」` +
                    `<b>我</b>只回握：「以后你恨之前，先掐<b>我</b>一下。」她破涕为笑：「好，记下了。」`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Rare">她忽然把<b>我</b>的手拉到颊边，像确认自己是热的。</span>「……我不是幻影。」她笑，笑里带刀，「可你若松手，<b>我</b>会比幻影还轻。」`,
                `风过袖间，她低声补了一句，轻得像怕惊动命运：「你知道吗？<b>我</b>最怕的不是死，是你某天想起来……觉得不值。」`,
            ])
        );
        addDungeonLog(
            `<span class="Uncommon">【静思】</span>握住她的那刻，<b>我</b>才懂「责任」不是誓言喊得响，是以后每一次想逃时，都记得这只手曾这么冷。`
        );
        armIntro("warm", 3, true);
    };
    document.querySelector("#bsIn2").onclick = function () {
        addDungeonLog(
            pickBondSoulLine([
                `纸潮得像泪。<b>我</b>闭眼时，铃音贴着骨缝走了一圈，旧日碎片翻上来——像有人曾在雨里等<b>我</b>，把伞倾向<b>我</b>，自己半边湿透。` +
                    `她低声：「你记得也好，不记得也好……<b>我</b>都在。」`,
                `心口那声铃越来越稳，像在替<b>我</b>承认。<b>我</b>睁眼时，雾都轻了三分。` +
                    `她侧过脸，声线发颤：「你终于……肯听我了。」`,
                `旧影纷至：巷口灯火、未寄的信、没说完的晚安。<b>我</b>呼吸发紧，像溺水的人触到绳。` +
                    `她把绳递到<b>我</b>手里：「抓紧。别再松。」`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Heirloom">铃音里夹着一声极轻的哽咽，被她强行咽回去。</span>「别睁眼……让我先把丑样子藏好。」` +
                    `<b>我</b>仍闭着，却把她袖角攥出水痕：<b>我</b>不嫌。`,
                `她像把许多年说不出口的话，都借铃传进<b>我</b>胸口。<b>我</b>忽然想：若这劫是罚，罚<b>我</b>迟到，那<b>我</b>认。`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Heirloom">【静思】</span>听，比说难。因为听要把自己的声音让出去，把她的疼接进来——<b>我</b>愿接。`,
                `<span class="Uncommon">【静思】</span>铃像镜子，照出<b>我</b>曾逃避的懦弱。<b>我</b>若再逃，铃会哑，她也会哑——那比杀<b>我</b>还狠。`,
            ])
        );
        armIntro("listen", 2, true);
    };
    document.querySelector("#bsIn3").onclick = function () {
        addDungeonLog(
            pickBondSoulLine([
                `她眼神黯了一下，又很快笑：「问得好。」` +
                    `「你若不信，<b>我</b>就站远些。」可她说着站远，袖口却在抖，像怕<b>我</b>真不追。`,
                `「心魔也会疼吗？」她反问，疼字咬得很轻。` +
                    `<b>我</b>一怔。她自嘲：「你看，你也会犹豫——那就对了，说明你还活着。」`,
                `她退半步，却用脚尖勾住<b>我</b>袍边，像最后的耍赖：「问清楚再决定……别像上次一样，一声不吭就走。」`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Common">她背对<b>我</b>，肩线细得像一折就断。</span>「你问我是谁……<b>我</b>也想问。」` +
                    `「若我真是魔，你剑下会不会软？」她停了很久，「……<b>我</b>怕的不是你斩<b>我</b>，是你斩完……会恨自己。」`,
                `雾在她足下聚了又散，像一次次欲言又止。<b>我</b>忽然明白：她的「远」不是冷，是怕把<b>我</b>拖进更深的劫。`,
            ])
        );
        addDungeonLog(
            `<span class="Common">【静思】</span>怀疑是刀，可不怀疑也可能是盲。<b>我</b>此刻要的，不是立刻信，是肯陪她一起把真假走成路——哪怕路有血。`
        );
        armIntro("doubt", 1, true);
    };
    document.querySelector("#bsIn4").onclick = function () {
        var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.1)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        g.active = false;
        g.resumeStage = 0;
        g.bond = 0;
        g.branch = "flee";
        rememberBondSoulWorld(-0.5);
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Common">我走得很快，像怕慢一步就会回头。</span>风把铃掐断在喉间。` +
                    `身后静了很久，才飘来半句，碎得不成调：「……那<b>我</b>等。」` +
                    `气血 <b>+${nFormatter(heal)}</b>——像天地施舍的烫，烫得<b>我</b>心口发苦：<b>我</b>明明活着，却像亲手埋了谁。`,
                `<span class="Common">剑意越冷，心越烫。</span><b>我</b>不敢停步，怕一停就软。` +
                    `风里像有人替<b>我</b>擦了下眼角：「你走啊……我不拖你。」` +
                    `气血 <b>+${nFormatter(heal)}</b>——<b>我</b>却觉得自己像被凌迟。`,
                `<span class="Common">我告诉自己：修行要紧。</span>可修行是为了什么，<b>我</b>忽然答不上来。` +
                    `铃最后响了一下，像关门。气血 <b>+${nFormatter(heal)}</b>——像施舍，也像讽刺。`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Heirloom">【长恨】</span><b>我</b>走得越远，越像把某个自己留在原地。将来某天若功成名就，会不会在无人处忽然想起——有人曾为<b>我</b>说过「等」？`,
                `<span class="Rare">【长恨】</span>转身是最轻的刀，因不用见血；也是最重的刀，因血在心里流一辈子。`,
                `天地给<b>我</b>气血，像在嘲笑：<b>你</b>活着，却把一个肯为你疼的人，独自留在雾里。`,
            ])
        );
        dungeon.status.event = false;
        playerLoadStats();
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    };
}

/** 劫同心每段开场：情劫守门（qualityTier 4 精英），胜后进入该段抉择 */
function bondSoulTryStartEmotionCombatGate(p) {
    var st = p.stage;
    if (st < 2 || st > 6) return false;
    var g = getBondSoulSaga();
    if (!g.emotionCombatByStage || typeof g.emotionCombatByStage !== "object") g.emotionCombatByStage = {};
    if (g.emotionCombatByStage[String(st)]) return false;
    var bond = typeof p.bond === "number" ? p.bond : g.bond;
    var branch = (typeof p.branch === "string" ? p.branch : g.branch) || "warm";
    dungeon.status.event = false;
    dungeonBondSoulCombatPending = {
        kind: "bondSoulEmotionGate",
        stage: st,
        bond: bond,
        branch: branch,
    };
    var linesByStage = {
        2: [
            `<span class="Rare">雾暴一寸，劫气凝形拦在石亭外，瞳中映着<b>我</b>与她。</span>她指尖发凉：「……又是这种时候。」<b>我</b>剑先出半寸：「站我后面。」`,
            `铃音骤急，兽影扒地而起，涎水落地成黑纹——专噬人间软处。<b>我</b>挡在她前：「要咬，先过<b>我</b>。」`,
            `石亭残柱后涌出黑影，像要把方才那口甜连根拔走。她呼吸一窒，<b>我</b>却已踏前半步：「刚暖起来的心，轮不到你来凉。」`,
        ],
        3: [
            `雾廊深处，祟影衔着半截未写完的信扑来，纸边割脸生疼。<b>我</b>把她往身后一揽：「别让它碰你回忆。」`,
            `长廊两侧浮影扭曲，凝成一头多面妖躯，每张脸都在学<b>我</b>说话。<b>我</b>哑声：「闭嘴——<b>我</b>自己跟她讲。」`,
            `祟影低笑如碎纸翻页，专挑她最软的句子撕。<b>我</b>剑光一横，像把帘落下：「她的故事，不许你读。」`,
        ],
        4: [
            `碑风卷沙，朱纹未亮，先有一尊碑奴破土，掌印如枷。<b>我</b>与她并肩：「天要问，先问<b>我</b>剑答不答。」`,
            `名碑之下，旧血祟聚形，低吼如万人同时哽咽。<b>我</b>把她的手扣紧一瞬又松：「这一战，<b>我</b>来。」`,
            `朱纹一闪，碑奴抬掌如盖棺。<b>我</b>听见她极轻一声「别怕」，反倒笑了：「该怕的是它——你在这儿，<b>我</b>不敢退。」`,
        ],
        5: [
            `崖风如刃，劫气化形为「坠念」，专拖人失足。<b>我</b>足跟钉死岩缝：「想带她下去？先过<b>我</b>这条命。」`,
            `同心崖前，兽影无面，只朝她伸爪。<b>我</b>胸中铃与血同响：「敢碰她，<b>我</b>让你连劫都回不去。」`,
            `坠念化作无数手影，专拽人心里那句「放手吧」。<b>我</b>反手扣住她腕：「拽不动——<b>我</b>选她，比选命还早。」`,
        ],
        6: [
            `终响未起，雾先化形为「空铃之兽」，一声声啃食回音。<b>我</b>抬剑：「要吃，吃<b>我</b>——别碰她的声。」`,
            `最后一程，劫意凝成守门凶物，品质如精英压阵。<b>我</b>吸气：「打完这一战，<b>我</b>再听她把话说完。」`,
            `她指尖掐进<b>我</b>袖里，抖得克制：「……别让它把铃咬哑。」<b>我</b>反手把她挡在身后，剑意却比她更软了一寸：「哑不了。你在听。」`,
        ],
    };
    startDangerEventCombat(
        pickBondSoulLine(linesByStage[st] || linesByStage[2]),
        null,
        {
            minQuality: 4,
            statMul: 1.02,
            rewardMul: 1.08,
            lvlBonus: 0,
            victoryBonus: { extraGoldMul: 1.06, extraExpPct: 0.03 },
        }
    );
    return true;
}

function bondSoulChainStageEvent(p) {
    if (!p || typeof p.stage !== "number") {
        nothingEvent();
        return;
    }
    var bond = typeof p.bond === "number" ? p.bond : getBondSoulSaga().bond;
    var branch = typeof p.branch === "string" ? p.branch : getBondSoulSaga().branch || "warm";
    bondSoulPersistResume(p.stage, bond, branch);
    if (bondSoulTryStartEmotionCombatGate(p)) return;
    if (p.stage === 2) {
        bondSoulChainStageTwo(p);
    } else if (p.stage === 3) {
        bondSoulChainStageWhisper(p);
    } else if (p.stage === 4) {
        bondSoulChainStageThree(p);
    } else if (p.stage === 5) {
        bondSoulChainStagePenultimate(p);
    } else if (p.stage === 6) {
        bondSoulChainFinale(p);
    } else {
        nothingEvent();
    }
}

function bondSoulChainStageTwo(p) {
    dungeon.status.event = true;
    var bond = typeof p.bond === "number" ? p.bond : 0;
    var branch = p.branch || "warm";
    var openWarm = [
        `第二程，雾薄处竟有一座塌了半边的石亭。她把一颗干硬的灵枣递到<b>我</b>掌心：「藏很久了，再不吃，甜也要过期。」` +
            `<br><span class="Common">枣皮磨得发白，像她藏了很久的体面。</span>她别过脸：「别盯着我看……一看，<b>我</b>就想哭。」`,
        `第二程，断桥下流水无声，她把外袍下摆撕了一条给<b>我</b>裹伤：「别逞强……你疼，我会跟着疼。」` +
            `<br><span class="Rare">血渗过布，她的指节也白。<b>我</b>忽然恨这劫——它让温柔的人，学会熟练地包扎别人的命。</span>`,
        `第二程，石灯笼里火将灭，她用手挡风，像护一个易碎的梦：「坐会儿吧，妖不会因为你歇一刻就饶你——可我会。」` +
            `<br><span class="Heirloom">火光一跳，照见她袖口暗色——像旧伤，也像旧泪。</span>她察觉<b>我</b>目光，立刻把袖拢紧，笑得若无其事。`,
        `第二程，她把温过的水囊推给<b>我</b>，自己舔了舔干裂的唇：「喝吧……你嗓子哑了，我听得出。」` +
            `<br><span class="Rare">那一点让，比灵石还重。</span><b>我</b>忽然想把劫劈开，换她一辈子不必省。`,
    ];
    var openListen = [
        `第二程，她走在<b>我</b>侧后半步，像怕挡<b>我</b>路，又怕离太远。<b>我</b>听见她呼吸很轻，轻得像在忍疼。` +
            `<br><span class="Common">忍疼的人最安静。</span><b>我</b>放慢步，她立刻察觉，也慢下来——像怕<b>我</b>发现她在迁就。`,
        `第二程，她话少，却把脚步调成与<b>我</b>同频，像怕<b>我</b>一个人响太孤单。` +
            `<br><span class="Rare">同频很甜，也很刀——甜是有人懂，刀是<b>她</b>连痛都要调成你的节拍。</span>`,
        `第二程，她偶尔伸手想碰<b>我</b>袖，又收回，反复几次，像在与自己角力。` +
            `<br><span class="Heirloom">「想碰又不敢碰，是不是很可笑？」她自嘲。</span><b>我</b>主动把袖递过去：不可笑，疼。`,
    ];
    var openDoubt = [
        `第二程，她话变少，却把<b>我</b>衣角攥出一道痕：「你若仍不信……就当我借你一段路。」` +
            `<br><span class="Common">借路的人最怕到期。</span>她低声像补刀：「到岔口你直走就行……别回头看我，我会忍不住求你。」`,
        `第二程，她把距离拉得很礼貌，眼睛却老往<b>我</b>这边飘：「我不逼你认我……可你也别逼自己太狠。」` +
            `<br><span class="Rare">礼貌是刀鞘，把喜欢藏得越深，拔出来时越见血。</span>`,
        `第二程，她笑得很淡：「你要证据，我没有；我只有时间——你若肯给。」` +
            `<br><span class="Heirloom">时间对她未必慷慨。</span>她说得很轻，像怕风听见：「……<b>我</b>可能等不了那么久，可我还是想等。」`,
    ];
    var open =
        branch === "listen" ? pickBondSoulLine(openListen) : branch === "doubt" ? pickBondSoulLine(openDoubt) : pickBondSoulLine(openWarm);
    var stageTwoStill =
        "<br><br><span class=\"Uncommon\">【驻足】</span>" +
        pickBondSoulLine([
            `<b>我</b>忽然不想立刻选——想先记住她此刻的眼神。因为有些眼神，选错了就再也看不见。`,
            `甜与刀往往同席。<b>我</b>若只贪甜，迟早被刀捅醒；若只防刀，又尝不到甜——这题，没有轻松答案。`,
            `她不言，却把「在乎」写得满亭都是。<b>我</b>若装不懂，便是世上最残忍的装傻。`,
            `石亭像一座小小的庙，供的不是神，是两个凡人在劫里偷的一寸人间。`,
            `风穿过残柱，像叹息。<b>我</b>忽然想：若此生只剩最后一盏茶，<b>我</b>愿分她半盏，不留遗憾。`,
            `她把狼狈藏得很好，可<b>我</b>看得见——看得见的人，就没资格说「与我无关」。`,
        ]);
    var floor = Math.max(1, dungeon.progress.floor);
    var feastGold = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(40, 95) * floor)));
    var warmCost = applyGoldGainMult(Math.max(1, Math.floor(randomizeNum(22, 55) * floor)));
    var due3 = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(1, 2));
    var choices = `
        <div class="decision-panel">
            <button type="button" id="bsS1">我坐下来，分她一半灵食，把枣核藏进袖里</button>
            <button type="button" id="bsS2">我挡在她前面：劫气化形，要战便战</button>
            <button type="button" id="bsS3">我掏灵石为她温一盏雾火（${nFormatter(warmCost)}）</button>
            <button type="button" id="bsS4">我别过脸：别靠太近，会连累你</button>
        </div>`;
    addDungeonLog(`<span class="StellarSign">【劫同心】第二程·石亭风露</span>${open}${stageTwoStill}`, choices);

    function goStage3(nb, extraLog) {
        if (extraLog) addDungeonLog(extraLog);
        bondSoulPersistResume(3, nb, branch);
        scheduleDeferredEvent({
            kind: "bondSoulChain",
            stage: 3,
            dueRoom: due3,
            bond: nb,
            branch: branch,
        });
        addDungeonLog(
            pickBondSoulLine([
                `风起时她把铃系在<b>我</b>腕上，线细得像命：「去下一劫吧。<b>我</b>会在更凶的地方等你——<b>你别死，别让我白等。」`,
                `她把一缕发绕在指间，又松开，像松开执念：「走吧。<b>我</b>会在你前面等你……也在你后面接住你。」`,
                `雾像潮水退，她声音却更近：「记住啊，你不是一个人在扛劫。」` +
                    `<b>我</b>点头，才发现自己也会想被人念着。`,
                `她替<b>我</b>整了整襟口，像送别又像送嫁：「活着回来。别的……回来再说。」`,
                `她忽然从怀里摸出一枚裂了缝的玉扣，塞进<b>我</b>掌心：「若有一天……铃不响了，你就捏碎它。」` +
                    `<b>我</b>喉间发堵：「什么意思？」她笑：「意思是——<b>我</b>宁愿你恨这劫，也别恨自己没尽力。」`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Common">她转身进雾，步子稳得像练过千百遍离别。</span><b>我</b>却看见她肩背僵了一瞬——原来会哭的人，也能把背挺成刀。`,
                `铃线勒进腕肉，疼得清楚——<b>我</b>要这疼，像要一条还活着的证物。`,
                `雾把她的身影吃掉一半，她抬手挥了挥，像赶<b>我</b>走，又像舍不得：<span class="Rare">「走啊……别让我反悔。」</span>`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Heirloom">【自问】</span>离别若成习惯，爱会不会变成债？<b>我</b>不知道答案，只知道此刻若不回一次头，债会利滚利，滚到<b>我</b>还不起。`,
                `<span class="Rare">【自问】</span>她给<b>我</b>铃，是信物，也是枷锁——<b>我</b>甘之如饴，因比孤独轻。`,
                `<span class="Common">【路语】</span>雾吞掉她的背影，却吞不掉<b>我</b>腕上那一圈细线。<b>我</b>低头看它，像看一句还没回完的「嗯」。`,
            ])
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    }

    document.querySelector("#bsS1").onclick = function () {
        player.gold += feastGold;
        var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.06, 0.11)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        playerLoadStats();
        goStage3(
            bond + 2,
            pickBondSoulLine([
                `枣肉苦尾很重，可<b>我</b>俩都没说。<b>我</b>把枣核藏进袖里，像藏一句不敢说满的「留下」。` +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(feastGold)}</b>，气血 <b>+${nFormatter(heal)}</b>——甜里夹着涩，像真的活过一场。`,
                `分食时<b>我</b>故意慢吞吞，她也慢吞吞，像比谁更舍不得吃完。` +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(feastGold)}</b>，气血 <b>+${nFormatter(heal)}</b>——穷劫里偷一口甜，像偷一生。`,
                `她把最好那半推给<b>我</b>，<b>我</b>又推回去，最后谁也没赢，只好一起笑。` +
                    `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(feastGold)}</b>，气血 <b>+${nFormatter(heal)}</b>。`,
            ])
        );
    };
    document.querySelector("#bsS2").onclick = function () {
        dungeon.status.event = false;
        bondSoulPersistResume(2, bond, branch);
        dungeonBondSoulCombatPending = {
            kind: "bondSoulStage2Fight",
            bond: bond,
            branch: branch,
            dueStage3Room: due3,
        };
        startDangerEventCombat(
            pickBondSoulLine([
                `<span class="Heirloom">雾暴起，劫气凝成兽形，瞳中映着<b>我</b>最软的那块。</span>她一步横在<b>我</b>前：「要咬，先咬我。」<b>我</b>剑意却比她更快——<b>我</b>不能让她替。`,
                `<span class="Heirloom">劫气化作巨口，专噬软肋。</span>她张臂挡在<b>我</b>前，像要用身子替<b>我</b>填劫：<b>我</b>喉间发紧，剑先出——「让开，这次换我护你。」`,
                `<span class="Heirloom">兽吼里夹着铃碎的声音。</span><b>我</b>忽然懂了：这战若退，退的不只是道，还有她。`,
            ]),
            null,
            {
                minQuality: 4,
                statMul: 1.05,
                rewardMul: 1.22,
                lvlBonus: 1,
                victoryBonus: {
                    extraGoldMul: 1.35,
                    extraExpPct: randomizeDecimal(0.01, 0.05),
                    enhanceStoneP: 0.22,
                },
            }
        );
    };
    document.querySelector("#bsS3").onclick = function () {
        if (player.gold < warmCost) {
            addDungeonLog(
                pickBondSoulLine([
                    `灵石不够，<b>我</b>便把外袍解下一角为她挡风。她鼻尖红了，仍嘴硬：「……谁要你可怜。」`,
                    `<b>我</b>掏空了袋也凑不齐，只能把剑穗解给她暖手。她一怔，骂<b>我</b>：「笨蛋……这比你灵石贵重。」`,
                ])
            );
            goStage3(bond + 1, null);
            return;
        }
        player.gold -= warmCost;
        var heal2 = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.08, 0.14)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal2);
        playerLoadStats();
        goStage3(
            bond + 3,
            pickBondSoulLine([
                `雾火温温地亮，她睫毛上挂着细光：<b>我</b>忽然想，若这劫永远不停，算不算也是一种长相守。气血 <b>+${nFormatter(heal2)}</b>。`,
                `火光跳在她瞳里，像星子落进深潭。<b>我</b>一时看呆了，她耳根先红：「……看路，别看人。」气血 <b>+${nFormatter(heal2)}</b>。`,
                `温意攀上经脉，<b>我</b>才发觉自己一直在抖。她伸手覆住<b>我</b>腕脉：「别怕，我在。」气血 <b>+${nFormatter(heal2)}</b>。`,
            ])
        );
    };
    document.querySelector("#bsS4").onclick = function () {
        var dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.08)));
        player.stats.hp = Math.max(1, player.stats.hp - dmg);
        playerLoadStats();
        goStage3(
            bond - 1,
            pickBondSoulLine([
                `<span class="Common">话出口<b>我</b>就后悔。</span>她笑了一下，比哭还碎：「好，<b>我</b>远点。」` +
                    `可<b>我</b>心口铃乱响，像替<b>我</b>喊疼。气血 <b>-${nFormatter(dmg)}</b>。`,
                `<span class="Common"><b>我</b>说「为你好」。</span>她眼里的光黯下去：「你问过我要不要吗？」` +
                    `气血 <b>-${nFormatter(dmg)}</b>——疼的不止身，还有那句迟来的悔。`,
                `<span class="Common"><b>我</b>把她推开半步，像推开自己。</span>她轻声：「你真狠。」` +
                    `气血 <b>-${nFormatter(dmg)}</b>。`,
            ])
        );
    };
}

/** 第三程：雾廊絮语（加长叙事，承上启下） */
function bondSoulChainStageWhisper(p) {
    dungeon.status.event = true;
    var bond = typeof p.bond === "number" ? p.bond : 0;
    var branch = p.branch || "warm";
    var cy = getBondSoulCycles();
    var floor = Math.max(1, dungeon.progress.floor);
    var due4 = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(1, 2));
    var whisperCore = pickBondSoulLine([
        `雾在这里变得像绸，软得能把人裹住。她牵<b>我</b>走过一段没有名字的长廊，两侧浮影幢幢，像谁在翻<b>我</b>俩未写的年谱。` +
            `她忽然停步，低声：「这里不计岁月，只计心动几下。」`,
        `长廊尽头没有门，只有一盏将熄的灯。她把灯芯拨亮一点，光跳到<b>我</b>俩脸上：「你看，连劫境都肯给恋人留一盏灯。」` +
            `<b>我</b>喉头发紧——「恋人」二字，她敢说，<b>我</b>却要先学会担当。`,
        `她让<b>我</b>坐下，像哄一个刚从血里爬出来的人：「慢点呼吸……<b>我</b>在呢。」` +
            `雾在脚边绕成小溪，溪声像铃。她笑：「你听，连秘境都在替我们保密。」`,
        `长廊像把人间与劫境缝在一起。她指着一道淡影：「你看，那像不像我们没走完的街？」` +
            `<b>我</b>点头，心却沉——越像，越说明有些东西，再也回不去。`,
        `她忽然哼起一段不成调的曲子，哼着哼着就哑了：「……忘了词。」` +
            `<b>我</b>接不上，只能握紧她的手：「没关系，<b>我</b>记得你在。」`,
        `她指着雾中一道极淡的影，像指一条没走完的巷：「你看……像不像我们差点说出口的那句？」` +
            `<b>我</b>喉间发紧。她立刻收手，像怕把<b>我</b>烫到：「不说也行。你在，就够半句了。」`,
    ]);
    var whisperMid = pickBondSoulLine([
        `<span class="Rare">浮影里掠过一场喜宴的红，转瞬成灰。</span>她指尖发凉：「劫境最残忍的不是杀你，是让你看见『本可以』。」`,
        `<span class="Heirloom">她轻声讲了一个很短的故事：有人等门，等成石像。</span>「后来呢？」<b>我</b>问。她笑：「后来门开了，石像碎了。」`,
        `<span class="Common">雾廊深处传来遥远的哭声，像她压了一辈子的。</span><b>我</b>想抱她，她先一步把脸埋进<b>我</b>肩窝：「就一下……别看我。」`,
        `<span class="Heirloom">她忽然问：<b>我</b>若有一天不记得路，你还会牵<b>我</b>吗？</span>不等<b>我</b>答，她又笑：「……别答，留着到那一日用。」`,
        `<span class="Rare">浮影掠过一盏熄了又点的灯。</span>她低声：「有些人走了，灯还在；有些人还在，灯却不敢点——<b>我</b>们别做后一种，好不好？」`,
    ]);
    var whisperCycle =
        cy <= 0
            ? ""
            : "<br>" +
              pickBondSoulLine([
                  `<span class="Rare">她指尖描过<b>我</b>眉骨，像在认旧伤：「你每一周目都比上周目更硬……可别让硬把软挤没了。」</span>`,
                  `<span class="Rare">「再来一次，我还选你。」她像说笑，又像立誓，「你也一样，好不好？」</span>`,
                  cy >= 3
                      ? `<span class="Heirloom">周目叠成年轮。</span>她把铃系紧：「别人修仙求长生，<b>我</b>只求你每次回头，都还在。」`
                      : `<span class="Rare">「第 ${cy + 1} 轮了。」她眼里有光也有怕，「别让我习惯……又失去。」</span>`,
              ]);
    var choices = `
        <div class="decision-panel">
            <button type="button" id="bsW1">我与她并坐，听雾像听彼此的心跳</button>
            <button type="button" id="bsW2">我分她一缕感悟，像分一半命火</button>
            <button type="button" id="bsW3">我问她：若劫无尽，你还愿陪我走吗</button>
            <button type="button" id="bsW4">我问她：若你终将消散……我要怎么记住你</button>
        </div>`;
    addDungeonLog(
        `<span class="StellarSign">【劫同心】第三程·雾廊絮语</span>${whisperCore}${whisperCycle}<br>${whisperMid}<br>` +
            `<span class="Uncommon">秘境第 ${floor} 层。</span>她侧首，眸子里雾与星搅在一起：「前面会更冷……你若还走，就握牢我。」`,
        choices
    );

    function toOath(nb, extra) {
        if (extra) addDungeonLog(extra);
        bondSoulPersistResume(4, nb, branch);
        scheduleDeferredEvent({
            kind: "bondSoulChain",
            stage: 4,
            dueRoom: due4,
            bond: nb,
            branch: branch,
        });
        addDungeonLog(
            pickBondSoulLine([
                `她把<b>我</b>从雾里拉起来，像把散掉的魂拢回去：「走吧……名碑在等。天若要你立誓，我陪你听它怎么问。」`,
                `长廊退去，碑意已压在胸口。<b>我</b>与她十指交叠一瞬又松开——像约好了：下一程，不许各自硬扛。`,
                `铃在腕上轻颤，像在催，也像在哄。<b>我</b>点头：「去。」她笑：「这才像<b>我</b>认的那个人。」`,
                `她替<b>我</b>拂去肩上的雾，动作轻得像怕碰碎什么：「……刚才那些话，别忘太快。」<b>我</b>反手按住她指尖：「一个字都不会忘。」`,
            ])
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    }

    document.querySelector("#bsW1").onclick = function () {
        var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.05, 0.09)));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        playerLoadStats();
        toOath(
            bond + 1,
            pickBondSoulLine([
                `很久没人这样安静地挨着<b>我</b>坐。她肩线挨着<b>我</b>肩线，像两块拼图终于对上。` +
                    `「你知道吗？」她轻声，「<b>我</b>最怕你变强之后……不再需要人陪。」<b>我</b>摇头：「需要。」气血 <b>+${nFormatter(heal)}</b>。`,
                `<b>我</b>听见她心跳，竟比铃还清楚。她耳根红透，仍倔：「……不许笑。」<b>我</b>没笑，只把袖角递她攥着。气血 <b>+${nFormatter(heal)}</b>。`,
            ])
        );
    };
    document.querySelector("#bsW2").onclick = function () {
        var expGift = rollDungeonExpFloorRewardAmount();
        var expAddedBsW2 = dongtianDungeonPlayerExpAddBase(expGift);
        if (expAddedBsW2) {
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expGift * ps)));
            }
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") {
                lvlupPopup();
            }
        }
        playerLoadStats();
        var expTailBs =
            expGift > 0
                ? expAddedBsW2
                    ? `感悟 <b>+${nFormatter(expGift)}</b>`
                    : dongtianDungeonPlayerExpMissedGainHintZh(expGift, false)
                : "";
        toOath(
            bond + 2,
            pickBondSoulLine([
                `<b>我</b>把灵台里刚凝出的一点清光渡给她，像把命分出去半寸。她猛地抬头，眼眶红了：「你傻不傻……」` +
                    `「傻。」<b>我</b>认，「可你值得。」` +
                    (expTailBs ? ` ` + expTailBs + `。` : ""),
                `感悟如溪流入她掌心，她握住，像握住<b>我</b>的将来：「我会还你……用一辈子慢慢还。」` +
                    (expTailBs ? ` ` + expTailBs + `。` : ""),
            ])
        );
    };
    document.querySelector("#bsW3").onclick = function () {
        toOath(
            bond + 1,
            pickBondSoulLine([
                `她沉默很久，久到雾都替她紧张。最后她笑，笑得眼泪掉下来：「愿啊……笨蛋。劫若无尽，你就牵紧我，别让我一个人数铃。」`,
                `「你问这种话，很犯规。」她吸鼻子，「<b>我</b>当然愿。可你也得答应——累了就说累，别装。」`,
                `她把额头抵在<b>我</b>肩上，声音发闷：「愿。千遍万遍都愿。只要你别再把<b>我</b>推远。」`,
            ])
        );
    };
    document.querySelector("#bsW4").onclick = function () {
        toOath(
            bond - 1,
            pickBondSoulLine([
                `她怔了很久，像被这句话剖开。最后她把<b>我</b>的手按在她心口：「别记住形……记住这里跳过你名字的次数。」` +
                    `<br><span class="Common">她笑得温柔，也残忍：</span>「若有一天<b>我</b>散了，你别找尸骨，去找铃——铃在，就当<b>我</b>还在任性等你。」`,
                `「你怎么敢问这个……」她声音发颤，仍抬眼把泪逼回去，「那就记住疼。」` +
                    `「<b>我</b>给你的甜，你记住；<b>我</b>不敢说的怕，你也记住——别让我白怕。」` +
                    `<br><span class="Rare"><b>我</b>心口像被生生剜了一刀，却想抱她更紧。</span>`,
                `她轻声：「记住你曾为一个名字，愿意赴劫。」又补一刀，笑：「也记住……那名字可能骗你，可能负你，可能先走。」` +
                    `<b>我</b>哑声：「那我也认。」她终是哭了出来。`,
            ])
        );
    };
}

function bondSoulChainStageThree(p) {
    dungeon.status.event = true;
    var bond = typeof p.bond === "number" ? p.bond : 0;
    var branch = p.branch || "warm";
    var due5 = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(1, 2));
    var choices = `
        <div class="decision-panel">
            <button type="button" id="bsT1">我在碑前起誓：再深一层，我也来接你</button>
            <button type="button" id="bsT2">我把铃还她：若此劫必死，至少别连累你</button>
            <button type="button" id="bsT3">我什么也不说，只把她的手扣紧一次再松开</button>
        </div>`;
    var oathPre = pickBondSoulLine([
        `<span class="Common">到碑前这段路，<b>我</b>走得比斩妖还慢。</span>不是怕天罚，是怕一开口，就把她的余生也绑进劫里。`,
        `她忽然停步，把<b>我</b>拽到碑影里：「若你后悔，现在还来得及。」` +
            `<b>我</b>看她眼睛——那里没有退路，只有「我陪你」。`,
        `<span class="Rare">碑风如刀，割在脸上不疼，割在心上疼。</span>她低声：「他们都说情是修行的大忌……可<b>我</b>觉得，无情才是。」`,
        `<span class="Uncommon">【静思】</span>名碑像一面镜子，照出<b>我</b>所有「想爱又怕」的丑。<b>我</b>忽然明白：怕连累她，有时是自私——因为不敢承担被需要的重量。`,
        `她指尖掠过碑上旧名，像掠过别人的结局：「……他们也会怕吗？」<b>我</b>喉头发紧：怕的，可怕也要选——不然一辈子只做逃兵。`,
        `雾在脚边绕，像问<b>我</b>：你要她，还是要清净？<b>我</b>苦笑：清净是假，失去她才是真劫。`,
        `<span class="Rare">她忽然把<b>我</b>拽停，额头抵在<b>我</b>肩上只一瞬，像偷一口气。</span>再抬头已是笑：「……到了碑前，你别怂。你怂，我会更怂。」`,
        `<span class="Common">【碑前】</span>离碑越近，<b>我</b>越听见自己的心跳吵。<b>我</b>忽然想：若天道真要<b>我</b>选，<b>我</b>选她——不是任性，是终于敢诚实。`,
    ]);
    addDungeonLog(
        oathPre +
            "<br><br>" +
            pickBondSoulLine([
                `<span class="StellarSign">【劫同心】第四程·名碑</span>残碑上浮起朱纹，像天在问<b>我</b>敢不敢认真。` +
                    `她看着<b>我</b>，眼里没有退路：「你若要走，<b>我</b>不拦。可你若留下……就别留一半。」`,
                `<span class="StellarSign">【劫同心】第四程·名碑</span>碑如镜面，照见<b>我</b>所有怯与贪。` +
                    `她把掌心按在碑上，与<b>我</b>并肩：「天道爱问选择题——<b>我</b>只问你一句：你敢不敢把我算进命里？」`,
                `<span class="StellarSign">【劫同心】第四程·名碑</span>朱纹游走如血脉，烫得碑石轻颤。` +
                    `她声音低却稳：「你若只把<b>我</b>当劫，<b>我</b>认；你若把<b>我</b>当家……就别半路丢下。」`,
                `<span class="StellarSign">【劫同心】第四程·名碑</span>碑底有旧血沁色，像前人也曾在此哭过誓。` +
                    `她指尖轻颤，仍笑：「别怕……就算天不认，<b>我</b>认你。」`,
                `<span class="StellarSign">【劫同心】第四程·名碑</span>碑纹亮起时，<b>我</b>竟先去看她的眼睛——怕她躲，怕她逞强。` +
                    `她回视，一字一顿：「你看清楚，<b>我</b>不是劫给你的试炼……<b>我</b>是活生生站在这儿，选你。」`,
            ]),
        choices
    );

    function finSchedule(nb, log) {
        addDungeonLog(log);
        bondSoulPersistResume(5, nb, branch);
        scheduleDeferredEvent({
            kind: "bondSoulChain",
            stage: 5,
            dueRoom: due5,
            bond: nb,
            branch: branch,
        });
        addDungeonLog(
            pickBondSoulLine([
                `雾涌如潮，像在推<b>我</b>去更深、更狠的劫。<b>我</b>忽然明白：这不是惩罚，是路——<b>我</b>越强，越配得上把她从雾里接出来。`,
                `前路像一张口，等着吞人。<b>我</b>却第一次不想退——因为身后也有人等着<b>我</b>回头。`,
                `她把铃在<b>我</b>腕上系死结，像系愿：「去吧。<b>我</b>赌你赢。」<b>我</b>哑声：「那你别输给我担心。」`,
                `劫风扑面，<b>我</b>却觉得胸口有锚。<b>我</b>懂了：修行不是变得无情，是变得……敢有情。`,
                `她替<b>我</b>把乱发别到耳后，动作轻得像盖章：「……碑听见了。<b>我</b>也听见了。」<b>我</b>反手覆住她手背，烫得两人同时一颤。`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Common">她没跟上来，却把自己的影子留在<b>我</b>脚边。</span>像说：「你去闯，我替你守着软的那块。」`,
                `碑光渐淡，像一场盛大的见证落幕。<b>我</b>忽然想哭——原来被人认真选择，会疼。`,
                `风把她的声音扯得很远，却字字敲在<b>我</b>心上：「记住啊……你答应过的，不许装作没听见。」`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Uncommon">【扪心】</span>碑记住了<b>我</b>的誓，可<b>我</b>日后会不会把自己磨到不认？<b>我</b>若失信，最先碎的不是天规，是她的眼睛。`,
                `<span class="Rare">【扪心】</span>选了她，就等于选了一条会疼的路——<b>我</b>仍往前走，因另一条路更疼：余生里永远猜「若当时」。`,
                `<span class="Heirloom">【扪心】</span>天问敢不敢，<b>我</b>问配不配。她把手给<b>我</b>，<b>我</b>得把自己练到配得上那份不躲。`,
            ])
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    }

    document.querySelector("#bsT1").onclick = function () {
        finSchedule(
            bond + 2,
            pickBondSoulLine([
                `<b>我</b>声音不大，却字字敲在心上：「下一层，下下层，我都来。」她眼尾一红，仍倔：「你若骗<b>我</b>……铃会响。」<b>我</b>说：<b>我</b>让它响一辈子。`,
                `<b>我</b>跪碑不起，誓出唇时竟比剑诀还重：「你在哪儿，<b>我</b>就往哪儿开道。」` +
                    `她别过脸抹眼角：「……谁要你跪。站起来，像我喜欢的那样狂一点。」`,
                `「我接你。」<b>我</b>只三个字，却像把后半生也押上。她笑出声，又立刻咬住唇：「记住了啊。」`,
            ])
        );
    };
    document.querySelector("#bsT2").onclick = function () {
        finSchedule(
            bond - 1,
            pickBondSoulLine([
                `她把铃硬塞回<b>我</b>掌心，指节发白：「笨蛋……连累这两个字，从来是两个人一起扛的。」`,
                `<b>我</b>想把她推远，她反而更近一步：「你要死，也先把话说完。」` +
                    `<b>我</b>一窒——原来最怕死的，是她眼里的<b>我</b>。`,
                `她把<b>我</b>手指一根根掰开，又扣紧：「别当英雄当傻了，我在。」`,
            ])
        );
    };
    document.querySelector("#bsT3").onclick = function () {
        finSchedule(
            bond + 1,
            pickBondSoulLine([
                `那一扣很短，短得像一生。<b>我</b>松开时，她吸了吸鼻子，骂<b>我</b>：「最讨厌你这种……什么都不讲清楚的。」`,
                `<b>我</b>把她的手扣住，又松开，像把勇气递过去再收回。她愣了愣，忽然懂了，轻声：「……够了。」`,
                `无声胜有声。<b>我</b>只把额头轻轻抵过去，她僵了一瞬，慢慢软下来：「你就会来这套。」`,
            ])
        );
    };
}

/** 第五程：同心崖（高潮前的最后一握，引向终章） */
function bondSoulChainStagePenultimate(p) {
    dungeon.status.event = true;
    var bond = typeof p.bond === "number" ? p.bond : 0;
    var branch = p.branch || "warm";
    var cy = getBondSoulCycles();
    var floor = Math.max(1, dungeon.progress.floor);
    var due6 = Math.min(dungeon.progress.roomLimit, dungeon.progress.room + randomizeNum(1, 2));
    var cliffOpen =
        pickBondSoulLine([
            `前方雾断处，崖边无路，只有风声像万人哭。她站在崖线旁，裙裾翻飞，像下一瞬就会被劫风吹散。` +
                `<b>我</b>一把扣住她腕：「退后。」她却笑：「你终于急了。」`,
            `崖下是黑的，黑得像把所有「以后」都吞了。她把铃按在<b>我</b>心口：「听——它还响，我们就还没完。」`,
            `她说，这里是劫境专门挖给人心软的地方：「一失足，不是死，是忘。」<b>我</b>把她往怀里带半步：「那<b>我</b>不让你失足。」`,
        ]) +
        (cy >= 2
            ? "<br>" +
              pickBondSoulLine([
                  `<span class="Heirloom">「我们走过这么多周目了。」她声音发颤仍笑，「你若现在松手，我会恨你很久……很久。」</span>`,
                  `<span class="Rare">她把<b>我</b>的手按得更紧：「再来一百次，<b>我</b>也站这儿——只要你还会来拉我。」</span>`,
              ])
            : "");
    var cliffDeep =
        "<br>" +
        pickBondSoulLine([
            `<span class="Heirloom">崖下传来极轻的呼唤，像无数个「如果当初」叠在一起。</span>她捂住<b>我</b>耳朵：「别听……听了会软，会恨，会后悔。」`,
            `<span class="Rare">她说，有人曾在此立誓相守，后来一人成仙，一人成灰。</span>「……你怕吗？」<b>我</b>摇头：怕，但更怕没有你。`,
            `风把她发带吹断，丝缕掠过<b>我</b>唇边，像最后一个吻的预演。<b>我</b>心口发紧——甜和刀原来同刃。`,
            `<span class="Heirloom">她望着崖下黑渊，声音却稳：</span>「他们说跳下就能忘……<b>我</b>不信。<b>我</b>只记得你，记得疼，也记得甜——这才是<b>我</b>。」`,
            `她忽然把<b>我</b>的手按在自己心口，掌心下跳得急：「感觉到了吗？……它在替你怕，也在替你勇敢。」`,
        ]);
    var choices = `
        <div class="decision-panel">
            <button type="button" id="bsP1">我揽她退离崖边：以后的路，我背你也行</button>
            <button type="button" id="bsP2">我与她并立崖前：要坠一起坠，要赢一起赢</button>
            <button type="button" id="bsP3">我把外袍披在她肩：冷先冻我，你别抖</button>
            <button type="button" id="bsP4">我哑声问：若相守会折你寿……你还要不要我靠近</button>
        </div>`;
    addDungeonLog(
        `<span class="StellarSign">【劫同心】第五程·同心崖</span>${cliffOpen}${cliffDeep}<br>` +
            `<span class="Uncommon">第 ${floor} 层风如刀。</span>她抬眼，眸子里映着<b>我</b>，也映着整片劫：「……终响前，把真心说干净，别留遗憾。」`,
        choices
    );

    function toFinale(nb, log) {
        addDungeonLog(log);
        bondSoulPersistResume(6, nb, branch);
        scheduleDeferredEvent({
            kind: "bondSoulChain",
            stage: 6,
            dueRoom: due6,
            bond: nb,
            branch: branch,
        });
        addDungeonLog(
            pickBondSoulLine([
                `雾合拢，像幕布将落。她最后看了<b>我</b>一眼，那一眼里有托付、有不舍，还有一点坏坏的赖：<span class="Heirloom">「终程别怂。」</span>`,
                `铃音忽然齐鸣，像万铃为<b>我</b>俩送行。她低声：「去吧……把结局写得漂亮点，我在回响里听。」`,
                `天光漏下一缝，落在她睫上像泪。<b>我</b>忽然明白——所谓劫同心，不是不分离，是分离也信会重逢。`,
            ])
        );
        addDungeonLog(
            pickBondSoulLine([
                `<span class="Common">她唇瓣动了动，像还有半句「别走」。</span>最终只化作一声笑，轻得像自我凌迟：「……走啊。」`,
                `雾把她的轮廓磨成柔边。<b>我</b>忽然怕——怕这一眼是最后一眼，怕铃有一天真哑。`,
            ])
        );
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    }

    document.querySelector("#bsP1").onclick = function () {
        toFinale(
            bond + 2,
            pickBondSoulLine([
                `<b>我</b>把她整个人拢进怀里往后带，脚下碎石滚落崖底，像把恐惧一并踹下去。` +
                    `她闷笑：「你这人……真不讲理。」<b>我</b>：「对你，可以不讲理。」`,
                `她后背贴着<b>我</b>胸口，忽然安静下来：「……好暖。」像把一辈子的冷都说了。`,
            ])
        );
    };
    document.querySelector("#bsP2").onclick = function () {
        toFinale(
            bond + 1,
            pickBondSoulLine([
                `十指相扣，站在崖沿，像站在天下对面。<b>我</b>说：「要死一起，要活也一起。」她骂：「呸，当然要活。」却握得更紧。`,
                `风掀衣袍，<b>我</b>与她像两柄剑并立。她轻声：「这才像<b>我</b>看上的人。」`,
            ])
        );
    };
    document.querySelector("#bsP3").onclick = function () {
        var healp = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.04, 0.07)));
        player.stats.hp = Math.max(1, player.stats.hp - healp);
        playerLoadStats();
        toFinale(
            bond + 2,
            pickBondSoulLine([
                `袍上余温裹着<b>她</b>，她鼻尖通红，却硬撑：「谁抖了……」<b>我</b>：「我抖。」她愣住，笑骂：「骗子。」` +
                    `<span class="Common">气血 <b>-${nFormatter(healp)}</b>——冻意过脉，可心口烫。</span>`,
                `<b>我</b>宁可自己冷，也不想她颤一下。她抓住袍缘，像抓住<b>我</b>：「……笨蛋，互暖会不会？」` +
                    `<span class="Common">气血 <b>-${nFormatter(healp)}</b>。</span>`,
            ])
        );
    };
    document.querySelector("#bsP4").onclick = function () {
        toFinale(
            bond + 1,
            pickBondSoulLine([
                `她像被这句话烫到，退半步又冲回来，一把揪住<b>我</b>襟口：「折寿？你以为<b>我</b>算什么……算累赘吗？」` +
                    `眼泪终于掉下来，砸在<b>我</b>手背上：「<b>我</b>要。靠近。哪怕短一点……<b>我</b>也要。」`,
                `她笑，笑得破碎又艳：「若相守要付命，那就付。<b>我</b>最怕的不是短，是你把我推远，还说是为我好。」` +
                    `<br><span class="Heirloom">她踮脚，把额头抵上<b>我</b>的，像把一生都押在这寸距离里。</span>`,
                `「要。」她只一个字，咬出血味，「你别替<b>我</b>选……<b>我</b>自己选。选你，选疼，选可能没有的以后。」`,
            ])
        );
    };
}

function bondSoulChainFinale(p) {
    dungeon.status.event = true;
    var bond = typeof p.bond === "number" ? p.bond : 0;
    var branch = p.branch || "warm";
    var floor = Math.max(1, dungeon.progress.floor);
    var cy0 = getBondSoulCycles();
    var score =
        bond +
        (branch === "warm" ? 2 : branch === "listen" ? 1 : 0) -
        (branch === "doubt" ? 1 : 0) +
        Math.min(2, Math.floor(cy0 / 3));

    var epilogueKey = "bittersweet";
    if (score >= 8) epilogueKey = "union";
    else if (score >= 5) epilogueKey = "guard";
    else if (score >= 3) epilogueKey = "letter";
    else epilogueKey = "cold";

    var epilogueBody = "";
    if (epilogueKey === "union") {
        epilogueBody = pickBondSoulLine([
            `铃与心跳并为一拍。<b>我</b>伸手，她这次没有躲，把额头抵在<b>我</b>肩上：「<b>我</b>等了那么久……不是等你多强，是等你肯回头。」` +
                `<b>我</b>哑声：「以后不用等了。<b>我</b>在每层秘境里，都往你的方向走。」` +
                `<br><span class="Rare">她忽然咬<b>我</b>肩一口，不重，却疼进魂里：</span>「这是利息……以后你迟到一次，<b>我</b>就咬一次。」` +
                `<b>我</b>笑出声，眼眶却热：「好。」`,
            `她伸手探<b>我</b>脉门，像怕<b>我</b>又把自己熬空：「活着，比赢更重要。」` +
                `<b>我</b>反握住：「那你也答应我，别再用消失吓我。」她「嗯」得又轻又狠。` +
                `<br><span class="Common">可<b>我</b>看见她另一只手死死攥着铃，攥到指节发白——原来她也怕，怕这幸福是借来的。</span>` +
                `<b>我</b>把那只手也包进掌心：「不是借的。<b>我</b>挣给你。」`,
            `她忽然把脸埋进<b>我</b>颈侧，声音闷得发颤：「……<b>我</b>不是不怕，是怕惯了。」` +
                `<b>我</b>拍她背，一下一下，像把这些年她独自吞下去的怕，轻轻拍出来。` +
                `<br><span class="Heirloom">她抬头时眼尾还红，却笑：</span>「从今往后，你欠<b>我</b>很多个『我在』……慢慢还。」`,
            `雾散处天光漏下，落在她睫上。<b>我</b>忽然想把这一刻刻进骨里：「往后每一劫，我都想与你并肩。」` +
                `她笑骂：「油嘴……可我喜欢。」` +
                `<br><span class="Heirloom">她补一句，轻得像叹息：</span>「若哪天你累了……也要说。别一个人扛到散。」`,
        ]);
    } else if (epilogueKey === "guard") {
        epilogueBody = pickBondSoulLine([
            `她身影淡下去，像要把路让给<b>我</b>：「你去吧，仙途很长。」<b>我</b>想抓，只抓住一线温：「你在哪儿等？」她笑：「你变强的那一头。」` +
                `<br><span class="Common">那笑太懂事，懂事得像刀。</span><b>我</b>忽然恨这劫——它教人温柔，也教人忍痛不说疼。`,
            `「别回头。」她说得温柔，却像刀。<b>我</b>走一步，心口铃响一声，像在替<b>我</b>回头。` +
                `<br>她声音从雾里飘来，碎得不成句：「……你回头一次，<b>我</b>就再也放不走了。」`,
            `她把<b>我</b>往前推了一把，掌心烫：「去啊……你越强，<b>我</b>越敢信我们能熬过去。」` +
                `<br><span class="Rare"><b>我</b>走出三步，听见她极轻一声哽咽，像被风掐断。</span><b>我</b>指甲陷进掌心：不能停，停了两人都死在这软里。`,
        ]);
    } else if (epilogueKey === "letter") {
        epilogueBody = pickBondSoulLine([
            `纸笺终于补全了后半句，朱色却化开：<span class="Heirloom">「……别忘。」</span><b>我</b>握紧，指节发白——<b>我</b>曾怕假，如今怕真。` +
                `<br><span class="Common">旁边又浮出一行更淡的小字，像她用尽力气才写稳：</span>「若你忘了，我不怪你……我只怪自己没让你记得太牢。」`,
            `字迹像泪痕，一行行都是「等等我」。<b>我</b>把纸按在心口，像按住一个未完成的誓。` +
                `<br>纸边割破指腹，血珠滚落，像替<b>我</b>哭。`,
            `她没现身，只留墨香与铃余音。<b>我</b>忽然懂了：有些爱不必同框，却必须同频。` +
                `<br><span class="Rare">可懂得越迟，刀越深——<b>我</b>连她最后一面，都可能是想象。</span>`,
        ]);
    } else {
        epilogueBody = pickBondSoulLine([
            `雾把她藏得很干净，只剩铃音一下，像告别。<b>我</b>站在原地，忽然明白有些人不是不爱，是<b>我</b>当时不敢爱。` +
                `<br><span class="Common">那声铃落下后，世界安静得可怕。</span><b>我</b>才发现自己也会怕安静。`,
            `铃断了。<b>我</b>胸口却更空——原来最狠的劫，是「本可以」。` +
                `<br>风里像有人低声问：「……后悔吗？」<b>我</b>答不出。答不出，就是最响的答。`,
            `她最后一声笑，轻得像叹息：「走吧，别回头恨我。」<b>我</b>却恨自己，走得那么干脆。` +
                `<br><span class="Heirloom">多年后<b>我</b>才明白，她不要恨，她要<b>我</b>留——可<b>我</b>当时只懂逃。</span>`,
        ]);
    }

    var epilogueThink = "";
    if (epilogueKey === "union") {
        epilogueThink =
            "<br><br><span class=\"StellarSign\">【夜深自问】</span>" +
            pickBondSoulLine([
                `圆满像糖，可<b>我</b>仍要问：这甜里有没有她的委屈被<b>我</b>略过？往后每一劫，<b>我</b>能不能不只「赢」，还学会「听」。`,
                `若爱让人变勇敢，也会让人变贪心。<b>我</b>握紧了铃，也提醒自己：别把她当成<b>我</b>战利品的注脚——她是命，不是赏。`,
                `幸福来得越真，越怕它是借的。<b>我</b>把这句话咽下去，换成行动：少说一句空头诺，多扛一件实在事。`,
            ]);
    } else if (epilogueKey === "guard") {
        epilogueThink =
            "<br><br><span class=\"Rare\">【驻足】</span>" +
            pickBondSoulLine([
                `她推<b>我</b>去远方，是温柔，也可能是怕拖累的硬撑。<b>我</b>若只懂感激不懂追问，会不会把她的疼也一并「懂事」掉？`,
                `「为你好」四个字，有时是刀背。<b>我</b>记下这一刀的形状——下次雾起，<b>我</b>要问她：你要我强，还是要我在。`,
                `离别若成常态，人会把痛练成习惯。<b>我</b>不想习惯——<b>我</b>想把每一次分开都当成最后一次那样认真道别。`,
            ]);
    } else if (epilogueKey === "letter") {
        epilogueThink =
            "<br><br><span class=\"Heirloom\">【长恨】</span>" +
            pickBondSoulLine([
                `纸短情长，长的是悔。<b>我</b>问自己：若重来，敢不敢早一步伸手——不是更强之后，而是更怂之时。`,
                `她写「别忘」，是托。<b>我</b>托得住吗？记忆会淡，修行会忙，<b>我</b>能不能在忙里仍给铃留一声空。`,
                `有些结局不是不爱，是爱得太迟、太怯、太会算账。<b>我</b>算清了损失，却算丢了人——这账，谁来平。`,
            ]);
    } else {
        epilogueThink =
            "<br><br><span class=\"Common\">【空铃】</span>" +
            pickBondSoulLine([
                `冷结局不是世界的错，常常是<b>我</b>一次次选「省事」堆出来的。<b>我</b>停在这里，承认懦弱——承认，才可能改。`,
                `若铃真的断了，<b>我</b>还剩什么？剩<b>我</b>自己。<b>我</b>得先把自己从「本可以」里捞出来，才有资格谈下一次雾。`,
                `她走了，问题留下：<b>我</b>要的到底是她，还是只要一个「有人等」的幻觉？答不清，就还会再痛一折。`,
            ]);
    }

    var cycleAddon = "";
    if (cy0 >= 1) {
        cycleAddon +=
            "<br>" +
            pickBondSoulLine([
                `<span class="Heirloom">（再逢）</span>她在回响尽头看<b>我</b>，像看一个终于学会不逃的人：「……这一折写得比上次好。<b>我</b>喜欢。」`,
                `<span class="Heirloom">（再逢）</span>「第 ${cy0 + 1} 折了。」她伸手虚虚描<b>我</b>眉眼，「你还来，我就还信——信这劫里也能住人。」`,
                `<span class="Rare">（再逢）</span>铃音叠成潮，像把每一次重逢都存进声里。她低声：「别停，继续写我们的。」`,
            ]);
    }
    if (cy0 >= 3) {
        cycleAddon +=
            "<br>" +
            pickBondSoulLine([
                `<span class="StellarSign">（深契）</span>她说，周目不是重复，是把「喜欢」一遍遍夯实：「你再走近一点……我就再软一点。」`,
                `<span class="StellarSign">（深契）</span><b>我</b>忽然想哭又想笑——原来被一个人盼久了，硬壳也会自己裂开。`,
            ]);
    }
    if (cy0 >= 6) {
        cycleAddon +=
            '<br><span class="Apexother">（劫同心·长卷）</span>雾散处像翻开很长很长的卷轴，她站在卷末，也在卷首：「故事还长……<b>我</b>等你下一笔。」';
    }

    var goldGain = applyGoldGainMult(
        Math.max(1, Math.floor(randomizeNum(160, 320) * floor * (1 + score * 0.06) * (1 + Math.min(0.2, cy0 * 0.035))))
    );
    var heal = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.22 + Math.min(0.08, score * 0.01))));

    if (epilogueKey === "union") {
        goldGain = Math.max(1, Math.floor(goldGain * 1.18));
    } else if (epilogueKey === "cold") {
        goldGain = Math.max(1, Math.floor(goldGain * 0.82));
    }

    var titleHtml = "";
    if (score >= 7 && dungeon.settings) {
        dungeon.settings.chainTitleBuff = {
            id: "bond_soul_crown",
            name: score >= 8 ? "同心劫主" : "执铃渡劫人",
            atkMul: score >= 8 ? 1.08 : 1.06,
            dmgTakenMul: score >= 8 ? 0.93 : 0.95,
        };
        titleHtml = `。<span class="Apexother">称号「${dungeon.settings.chainTitleBuff.name}」</span>加身（本次秘境生效）`;
    }

    var permHtml = "";
    if (epilogueKey === "union" && player.bonusStats && Math.random() < 0.92) {
        player.bonusStats.hp += 3.2;
        player.bonusStats.atk += 3.2;
        permHtml = ` <span class="Legendary">气血、力道机缘永久各 +3.2%</span>`;
    } else if (epilogueKey === "guard" && player.bonusStats && Math.random() < 0.55) {
        player.bonusStats.def += 2.4;
        permHtml = ` <span class="Epic">护体机缘永久 +2.4%</span>`;
    }

    var endBtn = pickBondSoulLine([
        `我把这一程收进心里，继续走向更深`,
        `我收剑入鞘，把她也收进命里——再下几层试试`,
        `铃还在腕上，我不敢卸，往下一劫去`,
        `我踏出这一步，为她，也为不再软弱的自己`,
    ]);
    var choices = `<div class="decision-panel"><button type="button" id="bsEnd">${endBtn}</button></div>`;
    addDungeonLog(
        `<span class="StellarSign">【劫同心】第六程·终响回响</span>${epilogueBody}${epilogueThink}${cycleAddon}` +
            `<br>` +
            pickBondSoulLine([
                `<span class="Rare">秘境第 ${floor} 层见证：<b>我</b>还会更强——不为别的，只为下一次雾起，能把她接得更稳。</span>`,
                `<span class="Rare">第 ${floor} 层的雾记得<b>我</b>说过什么。<b>我</b>不能食言——再强一线，就离她更近一寸。</span>`,
                `<span class="Rare">层数往上，劫数往上，<b>我</b>心里的锚也更深：<b>我</b>要赢，还要赢回她。</span>`,
                `<span class="Rare">此层已过，情意未过。<b>我</b>看向更深处，像看向下一声铃。</span>`,
                `<span class="Heirloom">【层语】</span>第 ${floor} 层的冷风吹过，<b>我</b>却把衣襟拢紧——像拢住一句她的叮嘱，怕散。`,
                `<span class="Common">【余温】</span>劫境再深，也深不过<b>我</b>心里那声「还在」。<b>我</b>收剑时手很轻，怕震碎这余温。`,
            ]),
        choices
    );

    document.querySelector("#bsEnd").onclick = function () {
        var expGain = rollDungeonExpFloorRewardAmount();
        if (expGain > 0 && epilogueKey === "union") {
            expGain = Math.max(1, Math.round(expGain * 1.12));
        }
        var expAddedBsEnd = expGain > 0 && dongtianDungeonPlayerExpAddBase(expGain);
        if (expAddedBsEnd) {
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expGain * ps)));
            }
            dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
            if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") {
                lvlupPopup();
            }
        }
        player.gold += goldGain;
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + heal);
        rememberBondSoulWorld(score >= 6 ? 0.5 : score >= 4 ? 0.25 : -0.2);
        var g = getBondSoulSaga();
        g.cyclesCompleted = (typeof g.cyclesCompleted === "number" ? g.cyclesCompleted : 0) + 1;
        g.active = false;
        g.resumeStage = 0;
        g.bond = 0;
        g.branch = "";
        g.emotionCombatByStage = {};
        var outroPool = [
            `<span class="Heirloom">【劫同心】一折落幕，铃未绝。</span><b>我</b>知道——更深、更险处，她还会等<b>我</b>变强再来。`,
            `<span class="Heirloom">【劫同心】幕落，缘未落。</span><b>我</b>把铃音揣好，像揣一张下次相见的契。`,
            `<span class="Heirloom">【劫同心】到此一折。</span>可<b>我</b>心里那扇门，已经关不上了。`,
            `<span class="Heirloom">【劫同心】风停了一瞬。</span><b>我</b>抬脚再入雾——不为别的，只为下一声「你来了」。`,
            `<span class="Rare">【劫同心·散场旁白】</span>雾像替<b>我</b>擦了擦眼角，又若无其事退开。<b>我</b>笑自己：原来硬汉也会舍不得一声铃。`,
            `<span class="Heirloom">【劫同心·散场旁白】</span>这一折写完，纸边还潮——像谁刚哭过又笑过。<b>我</b>把故事折好收进胸口：下一折，换<b>我</b>写得更像样。`,
        ];
        if (cy0 >= 2) {
            outroPool.push(
                `<span class="Heirloom">【劫同心】周目又书一章。</span><b>我</b>竟开始贪恋这劫——因劫里有她，有下一折的盼头。`
            );
        } else {
            outroPool.push(`<span class="Rare">【劫同心】余音绕梁。</span>若你也舍不得，就再下几层——她会懂。`);
        }
        if (cy0 >= 4) {
            outroPool.push(
                `<span class="StellarSign">【劫同心】长情是修行。</span>每一折都让我更软、也更硬：软给她，硬给挡她的劫。`
            );
        } else {
            outroPool.push(`<span class="Rare">【劫同心】未完待续。</span>故事在铃上，不在句号上。`);
        }
        addDungeonLog(
            (expGain > 0
                ? expAddedBsEnd
                    ? `感悟 <b>+${nFormatter(expGain)}</b>，`
                    : dongtianDungeonPlayerExpMissedGainHintZh(expGain, false) + "，"
                : "") +
            `灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(goldGain)}，气血 <b>+${nFormatter(heal)}</b>${permHtml}${titleHtml}。` +
                pickBondSoulLine(outroPool)
        );
        dungeon.status.event = false;
        playerLoadStats();
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    };
}

function claimBondSoulBattleVictory() {
    var x = dungeonBondSoulCombatPending;
    if (!x) return;
    if (x.kind === "bondSoulEmotionGate") {
        dungeonBondSoulCombatPending = null;
        var st = x.stage;
        var g = getBondSoulSaga();
        if (!g.emotionCombatByStage || typeof g.emotionCombatByStage !== "object") g.emotionCombatByStage = {};
        g.emotionCombatByStage[String(st)] = true;
        var branch = x.branch || g.branch || "warm";
        var bond = typeof x.bond === "number" ? x.bond : g.bond;
        if (typeof addCombatLog === "function") {
            addCombatLog(
                pickBondSoulLine([
                    `<span class="Legendary">情劫守门碎散</span>。她喘着贴过来，额角还沾雾：「……手还抖吗？」<b>我</b>把剑握紧又松：「不抖了。」`,
                    `<span class="Epic">凶威散尽</span>，只剩她眼里的余悸：「下次不许一个人扛完。」<b>我</b>点头：「嗯，给你留一半。」`,
                    `<span class="Rare">劫气退潮</span>。她低声：「我以为……铃要哑了。」<b>我</b>把腕递过去：「你听，还响。」`,
                    `<span class="Legendary">守门崩解如烟</span>。她一把攥住<b>我</b>袖口，像攥救命绳，又立刻松开，怕弄皱<b>我</b>：「……你还在，真好。」`,
                    `<span class="Heirloom">杀意散尽</span>，只剩她鼻尖通红：「刚才那一瞬间，<b>我</b>想的是——你若倒下，<b>我</b>也不想独活。」<b>我</b>喉间发堵，只把她的手包进掌心。`,
                ])
            );
        }
        if (typeof saveData === "function") saveData();
        bondSoulChainStageEvent({
            stage: st,
            bond: bond,
            branch: branch,
        });
        return;
    }
    if (x.kind !== "bondSoulStage2Fight") return;
    dungeonBondSoulCombatPending = null;
    var nb = (typeof x.bond === "number" ? x.bond : 0) + 2;
    var branch = x.branch || "warm";
    var due3 = Math.min(dungeon.progress.roomLimit, typeof x.dueStage3Room === "number" ? x.dueStage3Room : dungeon.progress.room + 1);
    bondSoulPersistResume(3, nb, branch);
    if (typeof addCombatLog === "function") {
        addCombatLog(
            pickBondSoulLine([
                `<span class="Legendary">劫气碎散</span>。她扑过来摸<b>我</b>脸，手还在抖：「下次不许你一个人冲。」<b>我</b>笑：「好，下次一起。」`,
                `<span class="Legendary">兽影崩解</span>。她拽着<b>我</b>袖口喘：「你再吓我……我就真生气了。」<b>我</b>：「那你气吧，我哄。」`,
                `<span class="Legendary">杀意散尽</span>，只剩她眼里的后怕：「你若倒下，我怎么办？」<b>我</b>把剑插回鞘：「不会。」`,
                `<span class="Epic">黑雾溃散</span>。她把额头抵在<b>我</b>肩上，闷声：「……我以为这次等不到你回头。」<b>我</b>拍她背：「回了，以后也回。」`,
            ])
        );
    }
    scheduleDeferredEvent({
        kind: "bondSoulChain",
        stage: 3,
        dueRoom: due3,
        bond: nb,
        branch: branch,
    });
    if (typeof saveData === "function") saveData();
}

/** 感情奇遇附加斗法：胜利结算（在 claimBondSoulBattleVictory 之后调用） */
function claimOptionalEmotionCombatVictories() {
    if (dungeonQingmingCombatPending) {
        var qm = dungeonQingmingCombatPending;
        dungeonQingmingCombatPending = null;
        if (typeof addCombatLog === "function") {
            addCombatLog(`<span class="Rare">碑旁祟影溃散</span>，泥里草茎齐伏一瞬，像许多声迟到的谢。`);
        }
        if (dungeon && dungeon.status) dungeon.status.event = true;
        qingmingRitualStep(qm.p, 1, qm.virtueAcc, qm.openLine);
        return;
    }
    if (dungeonBeastBondCombatPending) {
        dungeonBeastBondCombatPending = null;
        player.bonusStats.hp += 1.05;
        player.bonusStats.def += 0.62;
        addDungeonLog(
            `<span class="Rare">护兽一战终了。</span>小兽蹭你掌心，灵韵入体——<span class="Legendary">气血</span> 机缘 <b>+1.05%</b>，<span class="Legendary">护体</span> <b>+0.62%</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
        return;
    }
    if (dungeonEchoMirrorCombatPending) {
        dungeonEchoMirrorCombatPending = null;
        var windfall = applyGoldGainMult(randomizeNum(42, 125) * Math.max(1, dungeon.progress.floor));
        player.gold += windfall;
        addDungeonLog(
            `镜祟崩为齑粉，灵屑聚落如雨。你拢入囊中：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(windfall)}</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
        return;
    }
    if (dungeonWhisperPactCombatPending) {
        dungeonWhisperPactCombatPending = null;
        var statZh = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法", vamp: "吸血", critRate: "会心", critDmg: "暴伤" };
        var grants = { hp: 18, atk: 12, def: 12, atkSpd: 12, vamp: 8, critRate: 8, critDmg: 22 };
        dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.026);
        var stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
        var pick = stats[Math.floor(Math.random() * stats.length)];
        player.bonusStats[pick] += grants[pick];
        addDungeonLog(
            `低语化身碎于剑下，余烬仍烙进心识。<span class="Heirloom">敌势系数现为 ${dungeon.settings.enemyScaling.toFixed(2)}</span>；` +
                `你的<span class="Legendary">${statZh[pick]}</span>机缘永久 <b>+${grants[pick]}%</b>。`
        );
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
        return;
    }
    if (dungeonHeartDemonCombatPending) {
        dungeonHeartDemonCombatPending = null;
        if (Math.random() < 0.72) {
            var stats2 = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
            var pick2 = stats2[Math.floor(Math.random() * stats2.length)];
            player.bonusStats[pick2] += 2.2;
            addDungeonLog(
                `心魔实体崩碎！福至心灵，<span class="Legendary">${XIUXIAN_STAT_ZH[pick2]}</span> 机缘永久 <b>+2.2%</b>。`
            );
        } else {
            var dmg = Math.max(1, Math.round(player.stats.hpMax * 0.16));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += applyDungeonEnemyScalingGain(0.016);
            addDungeonLog(
                `<span class="Common">魔念反噬心脉！</span> 气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.016</b>。`
            );
        }
        playerLoadStats();
        dungeon.status.event = false;
        if (typeof saveData === "function") saveData();
        if (typeof updateDungeonLog === "function") updateDungeonLog();
    }
}

/** 同一劫数内反复战斗：玩家修为叠乘衰减（每场战后计数 +1）；灵宠仍按击杀「全额修为」比例分流，不受此影响。计数存 dungeon.progress，随存档走，避免读档刷满额修为。 */
var DUNGEON_SAME_ROOM_PLAYER_EXP_DECAY_BASE = 0.88;
var DUNGEON_SAME_ROOM_PLAYER_EXP_DECAY_FLOOR = 0.22;

function isDongtianMainDungeonSameRoomDecayActive() {
    try {
        if (typeof escort !== "undefined" && escort && escort.active) return false;
        if (typeof mining !== "undefined" && mining && mining.active) return false;
        if (typeof dungeon === "undefined" || !dungeon || !dungeon.status) return false;
        return dungeon.status.exploring === true;
    } catch (e) {
        return false;
    }
}

function dongtianEnsureSameRoomDecayAnchor() {
    if (!dungeon || !dungeon.progress) return;
    var f = Math.max(1, Math.floor(Number(dungeon.progress.floor) || 1));
    var r = Math.max(1, Math.floor(Number(dungeon.progress.room) || 1));
    var af = dungeon.progress.sameRoomPlayerExpAnchorFloor;
    var ar = dungeon.progress.sameRoomPlayerExpAnchorRoom;
    var afN = typeof af === "number" && !isNaN(af) ? Math.max(1, Math.floor(af)) : null;
    var arN = typeof ar === "number" && !isNaN(ar) ? Math.max(1, Math.floor(ar)) : null;
    if (afN !== f || arN !== r) {
        dungeon.progress.sameRoomPlayerExpBattles = 0;
        dungeon.progress.sameRoomPlayerExpAnchorFloor = f;
        dungeon.progress.sameRoomPlayerExpAnchorRoom = r;
    }
}

function getDongtianSameRoomPlayerExpMultiplier() {
    if (!isDongtianMainDungeonSameRoomDecayActive()) return 1;
    dongtianEnsureSameRoomDecayAnchor();
    var n = Math.max(0, Math.floor(Number(dungeon.progress.sameRoomPlayerExpBattles) || 0));
    return Math.max(DUNGEON_SAME_ROOM_PLAYER_EXP_DECAY_FLOOR, Math.pow(DUNGEON_SAME_ROOM_PLAYER_EXP_DECAY_BASE, n));
}

function dongtianRecordSameRoomPlayerExpBattle() {
    if (!isDongtianMainDungeonSameRoomDecayActive()) return;
    dongtianEnsureSameRoomDecayAnchor();
    var c = Math.max(0, Math.floor(Number(dungeon.progress.sameRoomPlayerExpBattles) || 0));
    dungeon.progress.sameRoomPlayerExpBattles = c + 1;
}

function peekDongtianSameRoomPlayerExpGain(baseExp) {
    var b = typeof baseExp === "number" && isFinite(baseExp) ? Math.max(0, baseExp) : 0;
    if (b <= 0) return 0;
    return Math.max(0, Math.floor(b * getDongtianSameRoomPlayerExpMultiplier()));
}

function dongtianResetSameRoomPlayerExpDecay() {
    if (!dungeon || !dungeon.progress) return;
    dungeon.progress.sameRoomPlayerExpBattles = 0;
    dungeon.progress.sameRoomPlayerExpAnchorFloor = null;
    dungeon.progress.sameRoomPlayerExpAnchorRoom = null;
}

// Ignore event and proceed exploring
const ignoreEvent = () => {
    dungeon.status.event = false;
    if (typeof pickXiuxianQuote === "function" && Math.random() < 0.48) {
        addDungeonLog(pickXiuxianQuote("walk_away"));
    } else {
        addDungeonLog("你转身离去，继续穿行秘境。");
    }
}

// Increase room or floor accordingly
const incrementRoom = () => {
    var _prevFloor = dungeon.progress && typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1;
    dungeon.progress.room++;
    dungeon.action = 0;
    loadDungeonProgress();
    var _newFloor = dungeon.progress && typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1;
    if (_newFloor !== _prevFloor && dungeon.settings && typeof dungeon.settings.qingmingChainIntroDoneFloor === "number") {
        if (dungeon.settings.qingmingChainIntroDoneFloor === _prevFloor) {
            dungeon.settings.qingmingChainIntroDoneFloor = 0;
        }
    }
}

// Increases player total blessing
const blessingUp = () => {
    blessingValidation();
    player.blessing++;
}

// Validates whether blessing exists or not
const blessingValidation = () => {
    if (player.blessing == undefined) {
        player.blessing = 1;
    }
}

// ========= Dungeon Backlog ==========
/** 秘境主事件态，或押镖/地脉子系统中仍有待点选面板（二者不一定同步写 dungeon.status.event） */
function dungeonLogShouldPreserveDecisionPanel() {
    try {
        if (dungeon && dungeon.status && dungeon.status.event) return true;
        /** 押镖/地脉「择路」界面：尚未 escort.active / mining.active，但已有决策面板；仅追加文案（如刷新镖令）时必须保留真实 DOM，否则会丢按钮。 */
        if (typeof escort !== "undefined" && escort && escort.status && escort.status.choosing) return true;
        if (typeof mining !== "undefined" && mining && mining.status && mining.status.choosing) return true;
        if (typeof mining !== "undefined" && mining && mining.active && mining.status && mining.status.event) return true;
        if (typeof escort !== "undefined" && escort && escort.active && escort.status && escort.status.event) return true;
    } catch (ePres) {}
    return false;
}

// Displays every dungeon activity
const updateDungeonLog = (choices) => {
    let dungeonLog = document.querySelector("#dungeonLog");
    if (!dungeonLog) return;

    // 事件进行中追加日志时须保留真实 DOM 节点：outerHTML + innerHTML 会丢失已绑定的 onclick，导致奇遇按钮“点了没反应”。
    let preservedPanelEl = null;
    if (typeof choices === "undefined" && dungeonLogShouldPreserveDecisionPanel()) {
        var activePanel = dungeonLog.querySelector(".decision-panel");
        if (activePanel) {
            preservedPanelEl = activePanel;
            preservedPanelEl.remove();
        }
    }
    dungeonLog.innerHTML = "";

    // Display the recent dungeon logs（条数 ≤ backlog 上限）
    for (let message of dungeon.backlog.slice(-DUNGEON_BACKLOG_VISIBLE)) {
        let logElement = document.createElement("p");
        logElement.innerHTML = message;
        dungeonLog.appendChild(logElement);
    }

    // If the event has choices, display it
    if (typeof choices !== "undefined") {
        let eventChoices = document.createElement("div");
        eventChoices.innerHTML = choices;
        dungeonLog.appendChild(eventChoices);
    } else if (preservedPanelEl) {
        dungeonLog.appendChild(preservedPanelEl);
    }

    dungeonLog.scrollTop = dungeonLog.scrollHeight;
    if (typeof renderDungeonChainTitleHint === "function") renderDungeonChainTitleHint();
}

// Add a log to the dungeon backlog
const addDungeonLog = (message, choices) => {
    dungeon.backlog.push(message);
    trimDungeonBacklog();
    updateDungeonLog(choices);
}

// Evaluate a dungeon difficulty
const evaluateDungeon = () => {
    let base = 500;
    // Work in Progress
}
