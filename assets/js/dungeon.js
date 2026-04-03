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
        enemyScaling: 1.1,
        deferredEvent: null,
        eventMemory: null,
        chainTitleBuff: null,
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
/** 宝藏伏击战：记录待发放奖励（战斗胜利后发） */
let dungeonTreasureAmbushPending = null;
/** 高危事件战斗胜利追加奖励（仅指定事件生效） */
let dungeonDangerVictoryPending = null;
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
        unlockAtRoom: 0
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
    };
}

let mining = buildMiningDefaultState();

/** 五档：段数、矿脉耐久、敌强度、通关材料包数量、额外遗器概率与稀有度下标范围；descend=入脉叙事，blurb=择脉提示（偏奇遇洞府感，与押镖红尘路相别） */
const MINING_TIER_DEF = [
    {
        name: "青砂浅脉",
        blurb: "地表灵砂混杂，偶有矿兽出没，如入初学者的试炼洞府，机缘浅而险亦浅。",
        descend:
            "你踏罡步、入浅表，但见青砂在足下发微光，似古修士曾试剑留痕；一缕地肺清气拂面，竟比人间洞天更静。",
        segmentLimit: 5,
        cartHp: 100,
        enemyMul: 0.92,
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
        cartHp: 94,
        enemyMul: 1.02,
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
        cartHp: 88,
        enemyMul: 1.12,
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
        cartHp: 80,
        enemyMul: 1.24,
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
        cartHp: 72,
        enemyMul: 1.38,
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
    var targetIdx = minI + Math.floor(Math.random() * (maxI - minI + 1));
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
    resetEscortStateHard();
    resetMiningStateHard();
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
        if (typeof enemy.rewards.exp === "number") enemy.rewards.exp = Math.max(1, Math.round(enemy.rewards.exp * rb));
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
        if (!hasMiningChooser) {
            mining.status.event = false;
            mining.status.choosing = false;
            mining.status.exploring = false;
            mining.status.paused = true;
            if (dungeon && dungeon.status) dungeon.status.event = false;
        }
    }
    if (escort && escort.status && escort.status.choosing) {
        var hasEscortChooser = !!document.querySelector("#es5");
        if (!hasEscortChooser) {
            escort.status.event = false;
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
        settings: { enemyBaseLvl: 1, enemyLvlGap: 5, enemyBaseStats: 1, enemyScaling: 1.1, deferredEvent: null, eventMemory: null, chainTitleBuff: null },
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
    if (typeof out.progress.floorLimit !== "number") out.progress.floorLimit = base.progress.floorLimit;
    if (typeof out.progress.roomLimit !== "number") out.progress.roomLimit = 20;
    out.settings = Object.assign({}, base.settings, loaded.settings || {});
    if (!out.settings.deferredEvent || typeof out.settings.deferredEvent !== "object") out.settings.deferredEvent = null;
    if (out.settings.deferredEvent && typeof out.settings.deferredEvent.dueRoom !== "number") out.settings.deferredEvent = null;
    if (!out.settings.eventMemory || typeof out.settings.eventMemory !== "object") out.settings.eventMemory = {};
    if (typeof out.settings.eventMemory.faction !== "number" || isNaN(out.settings.eventMemory.faction)) out.settings.eventMemory.faction = 0;
    if (typeof out.settings.eventMemory.ledger !== "number" || isNaN(out.settings.eventMemory.ledger)) out.settings.eventMemory.ledger = 0;
    out.settings.eventMemory.faction = Math.max(-6, Math.min(6, out.settings.eventMemory.faction));
    out.settings.eventMemory.ledger = Math.max(-6, Math.min(6, out.settings.eventMemory.ledger));
    if (!out.settings.chainTitleBuff || typeof out.settings.chainTitleBuff !== "object") out.settings.chainTitleBuff = null;
    out.statistics = Object.assign({}, base.statistics, loaded.statistics || {});
    if (typeof out.statistics.kills !== "number" || isNaN(out.statistics.kills)) out.statistics.kills = 0;
    if (typeof out.statistics.runtime !== "number" || isNaN(out.statistics.runtime)) out.statistics.runtime = 0;
    out.statistics.runtime = Math.max(0, out.statistics.runtime);
    out.backlog = Array.isArray(loaded.backlog) ? loaded.backlog : [];
    out.action = typeof loaded.action === "number" ? loaded.action : 0;
    var esBase = buildEscortDefaultState();
    var esIn = loaded.escortState && typeof loaded.escortState === "object" ? loaded.escortState : {};
    out.escortState = Object.assign({}, esBase, esIn);
    out.escortState.status = Object.assign({}, esBase.status, esIn.status || {});
    out.escortState.progress = Object.assign({}, esBase.progress, esIn.progress || {});
    out.escortState.active = !!out.escortState.active;
    out.escortState.cartHp = typeof out.escortState.cartHp === "number" ? Math.max(0, Math.min(100, out.escortState.cartHp)) : esBase.cartHp;
    out.escortState.action = typeof out.escortState.action === "number" ? Math.max(0, Math.floor(out.escortState.action)) : 0;
    out.escortState.riskKey = typeof out.escortState.riskKey === "string" ? out.escortState.riskKey : "normal";
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
    }
    var miningWasActiveOnLoad = !!(mining && mining.active);
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
    escort.status.event = true;
    if (!escort.status) escort.status = { exploring: false, paused: true, event: true, choosing: true };
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
    escort.active = true;
    escort.riskKey = riskKey;
    escort.rewardMul = p.rewardMul * (ob ? ob.rewardMul : 1);
    escort.progress.segment = 0;
    escort.progress.segmentLimit = p.segmentLimit;
    escort.cartHp = p.cartHp;
    escort.action = 0;
    escort.pendingBattle = null;
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
    const risk = ESCORT_RISK_PRESET[escort.riskKey] || ESCORT_RISK_PRESET.normal;
    if (success) {
        const floor = Math.max(1, dungeon.progress.floor || 1);
        const gMul = typeof risk.completionGoldMul === "number" ? risk.completionGoldMul : 1;
        const eMul = typeof risk.completionExpMul === "number" ? risk.completionExpMul : 1;
        const stoneChance = typeof risk.completionStoneChance === "number" ? risk.completionStoneChance : 0.2;
        const base = Math.max(1, Math.floor((38 + randomizeNum(0, 35)) * floor * escort.rewardMul * gMul));
        const gold = applyGoldGainMult(base * 3);
        const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.04, 0.095) * escort.rewardMul * eMul));
        player.gold += gold;
        player.exp.expCurr += expAmt;
        player.exp.expCurrLvl += expAmt;
        if (typeof addPetExp === "function") {
            var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(expAmt * ps)));
        }
        while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
        if (leveled) lvlupPopup();
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
            addDungeonLog(`押镖圆满，酬金 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}，感悟 <b>+${nFormatter(expAmt)}</b>。`);
        }
        playerLoadStats();
    } else {
        addDungeonLog(`<span class="Common">押镖失败。</span> 你护住性命退回锚点，${risk.name}就此作罢。`);
    }
    escort.active = false;
    escort.status = { exploring: false, paused: true, event: false };
    escort.pendingBattle = null;
    escort.bossTriggered = false;
    escort.minQualityBonus = 0;
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
        escort.cartHp = Math.min(100, escort.cartHp + fix);
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
}

function claimEscortBattleVictory() {
    if (!escort.active || !escort.pendingBattle) return false;
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
    var def = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
    if (success) {
        var pkMin = Math.max(1, Math.floor(def.packMin));
        var pkMax = Math.max(pkMin, Math.floor(def.packMax));
        var packs = randomizeNum(pkMin, pkMax);
        if (typeof addMaterial === "function" && typeof MATERIAL_GEM_PACK !== "undefined") {
            if (typeof ensureGemMaterialsInInventory === "function") ensureGemMaterialsInInventory();
            addMaterial(MATERIAL_GEM_PACK, packs);
            addDungeonLog(
                `<span class="Legendary">地脉封灵，奇遇圆满！</span> 你将矿髓所凝机缘封入行囊：<span class="Epic">${typeof MATERIAL_GEM_PACK_ZH !== "undefined" ? MATERIAL_GEM_PACK_ZH : "宝石材料包"} ×${packs}</span>（${def.name}）。`
            );
        }
    } else {
        addDungeonLog(
            `<span class="Common">地脉机缘暂止。</span> 或矿脉反噬难支，或你敛镐先退——${def.name}一梦，留待来日再探。`
        );
    }
    mining.active = false;
    mining.status = { exploring: false, paused: true, event: false, choosing: false };
    mining.pendingBattle = null;
    mining.action = 0;
    dungeonAction.innerHTML = "于安全锚点暂歇……";
    dungeonActivity.innerHTML = "深入秘境";
    syncRunBarModeText();
    if (typeof saveData === "function") saveData();
}

function claimMiningBattleVictory() {
    if (!mining.active || !mining.pendingBattle) return false;
    var def = MINING_TIER_DEF[mining.tier] || MINING_TIER_DEF[0];
    var floor = Math.max(1, dungeon.progress.floor || 1);
    var cartDmg = randomizeNum(6, 14);
    mining.cartHp = Math.max(0, mining.cartHp - cartDmg);
    mining.pendingBattle = null;
    mining.status.event = false;
    addCombatLog(
        pickMiningRand(MINING_CART_DMG_LINES).replace("%DMG%", String(cartDmg))
    );
    if (mining.cartHp <= 0) {
        endMiningRun(false);
        return true;
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
    mining.active = true;
    mining.tier = tierIdx;
    mining.progress.segment = 0;
    mining.progress.segmentLimit = def.segmentLimit;
    mining.cartHp = def.cartHp;
    mining.action = 0;
    mining.pendingBattle = null;
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

// ========== Events in the Dungeon ==========
const dungeonEvent = () => {
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
        dungeon.action++;
        if (tryResolveDeferredEvent()) return;
        let choices;
        let eventRoll;
        /* 基准池 50 槽：遇敌 50%，其余为休整/宝箱/天眷台与缚咒奇遇各一条目。追加 nextroom、高层 highTier 后遇敌占比会略降 */
        let eventTypes = new Array(25).fill("enemy").concat([
            "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing", "nothing",
            "treasure", "treasure",
            "blessing", "curse", "monarch",
            "echoMirror", "wellspring", "whisperPact", "riftPedlar", "fateLedger", "factionOath", "doomChain", "abyssChain", "skyChain",
            "lingquan", "daoTablet", "insight", "remnantPill",
            "oddBeastDen", "oddBrokenAnvil",
            "rageChain",
            "heartDemon", "sectSpirit", "tianJiQian", "beastBond", "wanderStall",
            "starCompass",
            "sillyDrunkDice", "sillyBeastRace", "sillyFrog", "sillyFakeSage", "sillyGourd", "sillyVending",
            "heavenWrath", "bloodOathStele", "calamityRift",
            "perilVoidMaw", "perilKarmicLedger", "perilSoulPyre", "perilIronLotus", "perilAbyssWhisper",
            "treasureAmbush",
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
        let event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        // 秘境第 1 层起即可触发危险/高危战斗：1 层 3%，之后每层 +0.5%，上限 15%
        // action>5 时事件池仅为 nextroom，不覆盖以免打乱进房节奏
        if (deepF >= 1 && dungeon.action <= 5) {
            var dangerChance = Math.min(0.15, 0.03 + (deepF - 1) * 0.005);
            if (Math.random() < dangerChance) {
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
                event = dangerPool[Math.floor(Math.random() * dangerPool.length)];
            }
        }

        switch (event) {
            case "nextroom":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">踏入裂隙</button>
                        <button id="choice2">置之不理</button>
                    </div>`;
                if (dungeon.progress.room == dungeon.progress.roomLimit) {
                    addDungeonLog(`<span class="Heirloom">你窥见通往秘境之主的殿门</span>`, choices);
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
                document.querySelector("#choice2").onclick = function () {
                    dungeon.action = 0;
                    ignoreEvent();
                };
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
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < cost) {
                            addDungeonLog("灵石不足，祈天台寂然，无音可回。");
                        } else {
                            player.gold -= cost;
                            statBlessing();
                        }
                        dungeon.status.event = false;
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                } else {
                    nothingEvent();
                }
                break;
            case "curse":
                eventRoll = randomizeNum(1, 5);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    let curseLvl = Math.round((dungeon.settings.enemyScaling - 1) * 10);
                    let cost = curseLvl * (10000 * (curseLvl * 0.5)) + 5000;
                    choices = `
                            <div class="decision-panel">
                                <button id="choice1">献奉灵石</button>
                                <button id="choice2">置之不理</button>
                            </div>`;
                    addDungeonLog(`<span class="Heirloom">缚咒桩于暗影中搏动。献奉<i class="fas fa-coins" style="color: #FFD700;"></i><span class="Common">${nFormatter(cost)}</span>灵石？妖物将更为凶戾，遗落亦将更为珍贵。（邪印 ${curseLvl} 层）</span>`, choices);
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < cost) {
                            addDungeonLog("灵石不足，缚咒桩上幽光一黯，隐有讥意。");
                        } else {
                            player.gold -= cost;
                            cursedTotem(curseLvl);
                        }
                        dungeon.status.event = false;
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                } else {
                    nothingEvent();
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
            case "treasureAmbush":
                treasureAmbushEvent();
                break;
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
        dungeon.status.event = false;
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
        if (typeof ensureGemMaterialsInInventory === "function") ensureGemMaterialsInInventory();
        addMaterial(MATERIAL_SOCKET_OPENER, 1);
        var ozh = typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined" ? MATERIAL_SOCKET_OPENER_ZH : "开孔器";
        addCombatLog(`守宝凶物伏诛，残匣旁落<span class="Legendary">${ozh}</span> ×1。`);
    }
    if (pending.kind === "stone") {
        const amt = Math.max(1, pending.amount || 1);
        if (typeof addMaterial === "function" && typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            addMaterial(MATERIAL_ENHANCE_STONE, amt);
            if (typeof MATERIAL_ENCHANT_STONE !== "undefined") {
                addMaterial(MATERIAL_ENCHANT_STONE, amt);
            }
            const zh = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
            const ezh = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
            addCombatLog(`伏击宝藏到手：你自残匣中夺得 <span class="Epic">${zh}</span> ×${amt}、<span class="Legendary">${ezh}</span> ×${amt}。`);
            addDungeonLog(`你斩敌夺宝，获得 <span class="Epic">${zh}</span> ×${amt}、<span class="Legendary">${ezh}</span> ×${amt}。`);
        } else {
            addCombatLog("伏击宝藏到手，但你暂时无法接收材料（缺少材料系统）。");
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
            addMaterial(MATERIAL_ENHANCE_STONE, fallback);
            if (typeof MATERIAL_ENCHANT_STONE !== "undefined") {
                addMaterial(MATERIAL_ENCHANT_STONE, fallback);
            }
            const zh = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
            const ezh = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
            addCombatLog(`遗器未能收纳，宝藏回退为 <span class="Epic">${zh}</span> ×${fallback}、<span class="Legendary">${ezh}</span> ×${fallback}。`);
            addDungeonLog(`因行囊受限，宝藏折算为 <span class="Epic">${zh}</span> ×${fallback}、<span class="Legendary">${ezh}</span> ×${fallback}。`);
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
            addCombatLog(`宝匣内灵砂翻涌：若你得胜，可夺得<span class="Epic">强化石 ×${amt}</span>。`);
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
        ? Math.max(1, Math.round(player.exp.expMax * b.extraExpPct))
        : 0;
    if (extraGold > 0) {
        player.gold += extraGold;
        if (typeof addCombatLog === "function") {
            addCombatLog(`<span class="Legendary">高危战功</span>：额外灵石 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(extraGold)}</b>。`);
        }
    }
    if (extraExp > 0) {
        player.exp.expCurr += extraExp;
        player.exp.expCurrLvl += extraExp;
        if (typeof addPetExp === "function") {
            var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(extraExp * ps)));
        }
        while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
        if (typeof leveled !== "undefined" && leveled && typeof lvlupPopup === "function") lvlupPopup();
        if (typeof addCombatLog === "function") {
            addCombatLog(`<span class="Epic">高危悟道</span>：额外感悟 <b>+${nFormatter(extraExp)}</b>。`);
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
        dungeon.settings.enemyScaling += 0.013;
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
        dungeon.settings.enemyScaling += 0.016;
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
        dungeon.settings.enemyScaling += 0.019;
        addDungeonLog(`<span style="color:#ff4d4f;">你献祭灵石撕开遁空裂口：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(loss)}，气血 <b>-${nFormatter(dmg)}</b>；龙炎余烬令秘境敌势永久 <b>+0.019</b>。</span>`);
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
        if (dungeon.progress.floor == 1) {
            goldDrop();
        } else {
            createEquipmentPrint("dungeon");
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
    var expGain = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.04, 0.1)));
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
        player.gold += gain;
        player.exp.expCurr += expGain;
        player.exp.expCurrLvl += expGain;
        if (typeof addPetExp === "function") {
            var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(expGain * ps)));
        }
        while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
        if (leveled) lvlupPopup();
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
        addDungeonLog(`你先取了天平上的重砝码：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gain)}，感悟 <b>+${nFormatter(expGain)}</b>。账页注明：约在 <b>${dueIn}</b> 劫后结算。`);
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
            boonExpPct: randomizeDecimal(0.05, 0.11),
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
        dungeon.settings.enemyScaling += scaledUp;
        addDungeonLog(`<span class="Common">你撕页赖账，因果反噬入骨。</span> 秘境敌势永久 <b>+${scaledUp.toFixed(3)}</b>。`);
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
    var expGain = Math.max(1, Math.round(player.exp.expMax * (typeof p.boonExpPct === "number" ? p.boonExpPct : 0.07)));
    var credit = typeof p.hiddenCredit === "number" ? p.hiddenCredit : 1;
    var burden = typeof p.hiddenBurden === "number" ? p.hiddenBurden : 0;
    var luck = typeof p.hiddenLuck === "number" ? p.hiddenLuck : 0;
    var score = credit - burden + luck;
    if (score < 0) {
        goldBack = Math.max(1, Math.floor(goldBack * 0.82));
        expGain = Math.max(1, Math.floor(expGain * 0.84));
    } else if (score >= 2) {
        goldBack = Math.max(1, Math.floor(goldBack * 1.08));
        expGain = Math.max(1, Math.floor(expGain * 1.06));
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
        player.exp.expCurr += expGain;
        player.exp.expCurrLvl += expGain;
        if (typeof addPetExp === "function") {
            var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(expGain * ps)));
        }
        while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
        if (leveled) lvlupPopup();
        addDungeonLog(`你把兑付换成心境突破：感悟 <b>+${nFormatter(expGain)}</b>。`);
        playerLoadStats();
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
    };
    document.querySelector("#choice3").onclick = function () {
        rememberEventChoice("ledger", 0.2);
        var g = Math.max(1, Math.floor(goldBack * 0.54));
        var e = Math.max(1, Math.floor(expGain * 0.56));
        player.gold += g;
        player.exp.expCurr += e;
        player.exp.expCurrLvl += e;
        if (typeof addPetExp === "function") {
            var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(e * ps2)));
        }
        while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
        if (leveled) lvlupPopup();
        addDungeonLog(`你选择折半：灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g)}，感悟 <b>+${nFormatter(e)}</b>。`);
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
        dungeon.settings.enemyScaling += 0.008;
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.08, 0.16)));
            const gold = applyGoldGainMult(randomizeNum(110, 260) * floor);
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            player.gold += gold;
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * ps)));
            }
            while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
            if (leveled) lvlupPopup();
            addDungeonLog(`你三程无亏，盟约兑现：感悟 <b>+${nFormatter(expAmt)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else if (hiddenScore >= 0) {
            const gold2 = applyGoldGainMult(randomizeNum(48, 140) * floor);
            player.gold += gold2;
            addDungeonLog(`盟约勉强过线，只结算半赏：<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold2)}。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.16, 0.26)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += 0.013;
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
        dungeon.settings.enemyScaling += 0.017;
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
        dungeon.settings.enemyScaling += 0.013;
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
        dungeon.settings.enemyScaling += 0.018;
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
        dungeon.settings.enemyScaling += 0.023;
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
        dungeon.settings.enemyScaling += 0.016;
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
        dungeon.settings.enemyScaling += 0.019;
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
        dungeon.settings.enemyScaling += 0.026;
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
        dungeon.settings.enemyScaling += 0.017;
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
        dungeon.settings.enemyScaling += 0.021;
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
        dungeon.settings.enemyScaling += 0.027;
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
        dungeon.settings.enemyScaling += 0.016;
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
        dungeon.settings.enemyScaling += 0.022;
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

// 顿悟：直接涨修为条
const insightEvent = () => {
    const amt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.035, 0.12)));
    player.exp.expCurr += amt;
    player.exp.expCurrLvl += amt;
    if (typeof addPetExp === "function") {
        var pShare = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
        addPetExp(Math.max(0, Math.floor(amt * pShare)));
    }
    while (player.exp.expCurr >= player.exp.expMax) {
        playerLvlUp();
    }
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.028, 0.09)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare2)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) {
                lvlupPopup();
            }
            addDungeonLog(`药力化开，竟引动修为：<b>+${nFormatter(expAmt)}</b> 点感悟。`);
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.04, 0.12)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare3 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare3)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) {
                lvlupPopup();
            }
            if (typeof pickXiuxianQuote === "function") {
                addDungeonLog(pickXiuxianQuote("star_compass_win"));
            }
            addDungeonLog(`你逆拧星针成功，识海明澈：<b>+${nFormatter(expAmt)}</b> 点感悟。`);
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.018, 0.045)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) {
                lvlupPopup();
            }
            addDungeonLog(`你押中了！庄家不情愿地拍出灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}，另有一丝感悟 <b>+${nFormatter(expAmt)}</b>。`);
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.015, 0.04)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare2)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) {
                lvlupPopup();
            }
            addDungeonLog(`你弹指一击，蛤蟆凌空转体三周半，落地竟递来一丝明悟——感悟 <b>+${nFormatter(expAmt)}</b>。（别问原理）`);
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.02, 0.06)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare3 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare3)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) {
                lvlupPopup();
            }
            addDungeonLog(`葫里飞出一缕青烟钻入眉心，你脑中多了句没用但顺口的口诀——感悟 <b>+${nFormatter(expAmt)}</b>。`);
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.018, 0.042)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare4 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare4)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) {
                lvlupPopup();
            }
            addDungeonLog(`滚出一卷『过期说明书』，你扫一眼竟有所得——感悟 <b>+${nFormatter(expAmt)}</b>。`);
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.07, 0.18)));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            if (typeof addPetExp === "function") {
                var pShare5 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare5)));
            }
            while (player.exp.expCurr >= player.exp.expMax) {
                playerLvlUp();
            }
            if (leveled) lvlupPopup();
            addDungeonLog(`雷火贯体，你竟撑住了。识海震明：<b>+${nFormatter(expAmt)}</b> 点感悟。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.22, 0.34)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += 0.013;
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
            dungeon.settings.enemyScaling += 0.017;
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.09, 0.22)));
            const gold = applyGoldGainMult(randomizeNum(60, 180) * Math.max(1, dungeon.progress.floor));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            player.gold += gold;
            if (typeof addPetExp === "function") {
                var pShare6 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * pShare6)));
            }
            while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
            if (leveled) lvlupPopup();
            addDungeonLog(`你从裂隙中心活着走出：感悟 <b>+${nFormatter(expAmt)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.2, 0.33)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += 0.019;
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.12, 0.28)));
            const gold = applyGoldGainMult(randomizeNum(80, 220) * Math.max(1, dungeon.progress.floor));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            player.gold += gold;
            if (typeof addPetExp === "function") {
                var ps = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * ps)));
            }
            while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
            if (leveled) lvlupPopup();
            addDungeonLog(`你从虚口深处扯回一线灵机：感悟 <b>+${nFormatter(expAmt)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.32, 0.48)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            dungeon.settings.enemyScaling += 0.031;
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
        dungeon.settings.enemyScaling += 0.011;
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
            dungeon.settings.enemyScaling += 0.027;
            addDungeonLog(`灵石不足以平账，簿上朱笔一落，如烙铁贯心！气血 <b>-${nFormatter(dmg)}</b>；秘境敌势永久 <b>+0.027</b>。`);
        } else {
            player.gold -= need;
            if (Math.random() < 0.55) {
                const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.08, 0.2)));
                player.exp.expCurr += expAmt;
                player.exp.expCurrLvl += expAmt;
                if (typeof addPetExp === "function") {
                    var ps2 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                    addPetExp(Math.max(0, Math.floor(expAmt * ps2)));
                }
                while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
                if (leveled) lvlupPopup();
                const g2 = applyGoldGainMult(randomizeNum(20, 65) * floor);
                player.gold += g2;
                addDungeonLog(`你以灵石填债眼，簿上墨迹淡去：感悟 <b>+${nFormatter(expAmt)}</b>，并回流灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(g2)}。`);
            } else {
                const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.12, 0.22)));
                player.stats.hp = Math.max(1, player.stats.hp - dmg);
                dungeon.settings.enemyScaling += 0.018;
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
        dungeon.settings.enemyScaling += 0.034;
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
            dungeon.settings.enemyScaling += 0.036;
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
        dungeon.settings.enemyScaling += 0.01;
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
            dungeon.settings.enemyScaling += 0.03;
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
            const expAmt = Math.max(1, Math.round(player.exp.expMax * randomizeDecimal(0.1, 0.24)));
            const gold = applyGoldGainMult(randomizeNum(55, 150) * Math.max(1, dungeon.progress.floor));
            player.exp.expCurr += expAmt;
            player.exp.expCurrLvl += expAmt;
            player.gold += gold;
            if (typeof addPetExp === "function") {
                var ps3 = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
                addPetExp(Math.max(0, Math.floor(expAmt * ps3)));
            }
            while (player.exp.expCurr >= player.exp.expMax) playerLvlUp();
            if (leveled) lvlupPopup();
            addDungeonLog(`真名入耳，灵台一震而明：感悟 <b>+${nFormatter(expAmt)}</b>，灵石 <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(gold)}。`);
        } else {
            const dmg = Math.max(1, Math.round(player.stats.hpMax * randomizeDecimal(0.3, 0.46)));
            player.stats.hp = Math.max(1, player.stats.hp - dmg);
            const loss = Math.max(1, Math.floor(player.gold * 0.18));
            if (player.gold >= loss) player.gold -= loss;
            dungeon.settings.enemyScaling += 0.026;
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
            dungeon.settings.enemyScaling += 0.018;
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
        dungeon.settings.enemyScaling += 0.03;
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
            dungeon.settings.enemyScaling += 0.014;
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
            dungeon.settings.enemyScaling += 0.008;
            addDungeonLog(`<span class="Common">签文：咎。</span> 心头一悸，气血 <b>-${nFormatter(d)}</b>，敌势 <b>+0.008</b>。`);
        } else {
            const loss = Math.min(player.gold, Math.max(0, Math.round(player.gold * 0.08 + dungeon.progress.floor * 32)));
            player.gold -= loss;
            dungeon.settings.enemyScaling += 0.014;
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
            dungeon.settings.enemyScaling += 0.01;
            addDungeonLog("小兽龇牙低吼，似结下一缕恶缘——敌势 <b>+0.010</b>。");
        } else {
            addDungeonLog("它窜入雾中，不留踪迹。");
        }
        dungeon.status.event = false;
        saveData();
        updateDungeonLog();
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
                dungeon.settings.enemyScaling += 0.017;
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
        </div>`;
    addDungeonLog(`<span class="Nullforge">虚空里有人贴着鼓膜呢喃：「愿承敌势之苦，便赐你躯壳深处一星不熄的余烬。」</span>`, choices);

    document.querySelector("#choice1").onclick = function () {
        dungeon.settings.enemyScaling += 0.026;
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
        dungeon.settings.enemyScaling = Math.max(1.02, dungeon.settings.enemyScaling - 0.028);
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
            dungeon.settings.enemyScaling += 0.03;
            createEquipmentPrint("dungeon");
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
        dungeon.settings.enemyScaling += 0.014;
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

// 缚咒桩献奉
const cursedTotem = (curseLvl) => {
    dungeon.settings.enemyScaling += 0.1;
    addDungeonLog(`邪印加深：妖物愈发暴戾，遗落亦愈显珍贵。（邪印 ${curseLvl} 层 → ${curseLvl + 1} 层）`);
    saveData();
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
    dungeon.progress.room++;
    dungeon.action = 0;
    loadDungeonProgress();
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
// Displays every dungeon activity
const updateDungeonLog = (choices) => {
    let dungeonLog = document.querySelector("#dungeonLog");
    let preservedChoices;
    if (typeof choices === "undefined" && dungeon && dungeon.status && dungeon.status.event) {
        var activePanel = dungeonLog.querySelector(".decision-panel");
        if (activePanel) {
            preservedChoices = activePanel.outerHTML;
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
    } else if (typeof preservedChoices !== "undefined") {
        // 事件处理中追加日志时，保留当前可点击选项，避免按钮被刷新掉。
        let eventChoices = document.createElement("div");
        eventChoices.innerHTML = preservedChoices;
        dungeonLog.appendChild(eventChoices);
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
