// Enemy
let enemy = {
    name: null,
    type: null,
    lvl: null,
    stats: {
        hp: null,
        hpMax: null,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0
    },
    rewards: {
        exp: null,
        gold: null,
        drop: null
    },
    mechanic: null
};


var CURSE_ENEMY_STAT_MULTIPLIER = 2.8;
/** 经验结算等级封顶：本层正常最高怪物等级（maxLvl）基础上再放宽 +5。 */
var DUNGEON_EXP_REWARD_LVL_CAP_BONUS = 5;

function getDungeonExpRewardLevelCapForCurrentFloor() {
    if (typeof dungeon === "undefined" || !dungeon || !dungeon.progress || !dungeon.settings) return null;
    var floor = Math.max(1, Math.floor(Number(dungeon.progress.floor) || 1));
    var gap =
        typeof dungeon.settings.enemyLvlGap === "number" && isFinite(dungeon.settings.enemyLvlGap)
            ? Math.max(1, Math.floor(dungeon.settings.enemyLvlGap))
            : 5;
    var baseLvl =
        typeof dungeon.settings.enemyBaseLvl === "number" && isFinite(dungeon.settings.enemyBaseLvl)
            ? Math.floor(dungeon.settings.enemyBaseLvl)
            : 1;
    var maxLvl = floor * gap + (baseLvl - 1);
    var bonus =
        typeof DUNGEON_EXP_REWARD_LVL_CAP_BONUS === "number" && isFinite(DUNGEON_EXP_REWARD_LVL_CAP_BONUS)
            ? Math.max(0, Math.floor(DUNGEON_EXP_REWARD_LVL_CAP_BONUS))
            : 5;
    return Math.max(1, maxLvl + bonus);
}

const generateRandomEnemy = (condition) => {
    const floorN = (dungeon && dungeon.progress && dungeon.progress.floor) ? dungeon.progress.floor : 1;
    if (typeof pickEnemyAffixIndex === "function") {
        enemy.affixIndex = pickEnemyAffixIndex(floorN);
    } else {
        enemy.affixIndex = (typeof ENEMY_AFFIXES !== "undefined" && ENEMY_AFFIXES.length)
            ? Math.floor(Math.random() * ENEMY_AFFIXES.length)
            : -1;
    }
    if (typeof pickEnemyQualityTier === "function") {
        enemy.qualityTier = pickEnemyQualityTier(floorN, condition);
    } else {
        enemy.qualityTier = 0;
    }

    enemy.bossRole = condition === "guardian" || condition === "sboss" ? condition : null;

    // 先分配机制类型，再在 setEnemyStats 中完成机制参数初始化（护盾值/幻相闪避等）。
    assignEnemyMechanic(condition);

    // 妖兽名录：杂兵为兽形/精怪名；镇守为层主；主宰为秘境霸主
    const enemyNames = [
        // 普通妖兽
        '青纹狼妖', '赤瞳蝠妖', '噬灵蝎', '裂石狰', '焚羽鸦', '铁爪狰', '腐骨鸦', '瘴眼蟾', '幽影狈',
        '铜鬃山猪', '玄甲龟兽', '石皮犀', '铁背熊罴', '千年岩龟', '岩铠蜈蚣',
        '雾隐狐', '幽鳞蟒', '蛇尾貂', '寒骨蛇', '赤练火蜈', '魇面狐',
        '疾风貂', '影刃螳螂', '银线蛇', '鬼面蝠', '闪灵猫', '游风狼',
        '血瞳狈', '断魂蛛', '黑砂蝎', '魇瞳狐', '噬心蜈', '裂心狰',
        // 层主·镇守（霸气）
        '焚天魔君·赤霄', '裂界妖帅·贪狼', '噬魂魔将·夜叉',
        '玄甲兽王·山岳', '不朽冥龟·万载', '金刚魔猿·镇岳',
        '万蛊妖主·母巢', '阴阳尸傀·双生', '血莲教主·妄念',
        '魅影妖皇·千幻', '惊雷鹏妖·裂空',
        '九幽冥龙·断魂', '血瞳修罗·嗜血', '万骨君王·葬天',
        // 秘境主宰·霸主（更霸气）
        '吞天妖祖·饕餮', '太古魔神·陨星',
        '九幽冥帝·永劫',
        '造化尸尊·无极', '血海阎罗·轮回', '天罚魔尊·诛仙',
        '苍穹妖帝·逐日', '混沌魔鹏·遮天',
        '万劫魔主·灭世'
    ];
    const enemyTypes = ['Offensive', 'Defensive', 'Balanced', 'Quick', 'Lethal'];
    let selectedEnemies = null;

    // Generate enemy type
    enemy.type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];

    // Calculate enemy level
    const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
    const minLvl = maxLvl - (dungeon.settings.enemyLvlGap - 1);
    if (condition == "guardian") {
        enemy.lvl = minLvl;
    } else if (condition == "sboss") {
        enemy.lvl = maxLvl;
    } else {
        enemy.lvl = randomizeNum(minLvl, maxLvl);
    }

    // Generate proper enemy info
    switch (enemy.type) {
        case "Offensive":
            // Select name and apply stats for Offensive enemies
            if (condition == "guardian") {
                selectedEnemies = enemyNames.filter(name => [
                    '焚天魔君·赤霄', '裂界妖帅·贪狼', '噬魂魔将·夜叉'
                ].includes(name));
            } else if (condition == "sboss") {
                selectedEnemies = enemyNames.filter(name => [
                    '吞天妖祖·饕餮', '太古魔神·陨星'
                ].includes(name));
            } else {
                selectedEnemies = enemyNames.filter(name => [
                    '青纹狼妖', '赤瞳蝠妖', '噬灵蝎', '裂石狰', '焚羽鸦',
                    '铁爪狰', '腐骨鸦', '瘴眼蟾', '幽影狈'
                ].includes(name));
            }
            enemy.name = selectedEnemies[Math.floor(Math.random() * selectedEnemies.length)];
            setEnemyStats(enemy.type, condition);
            break;
        case "Defensive":
            // Select name and apply stats for Defensive enemies
            if (condition == "guardian") {
                selectedEnemies = enemyNames.filter(name => [
                    '玄甲兽王·山岳', '不朽冥龟·万载', '金刚魔猿·镇岳'
                ].includes(name));
            } else if (condition == "sboss") {
                selectedEnemies = enemyNames.filter(name => [
                    '九幽冥帝·永劫'
                ].includes(name));
            } else {
                selectedEnemies = enemyNames.filter(name => [
                    '铜鬃山猪', '玄甲龟兽', '石皮犀', '铁背熊罴', '千年岩龟', '岩铠蜈蚣'
                ].includes(name));
            }
            enemy.name = selectedEnemies[Math.floor(Math.random() * selectedEnemies.length)];
            setEnemyStats(enemy.type, condition);
            break;
        case "Balanced":
            // Select name and apply stats for Balanced enemies
            if (condition == "guardian") {
                selectedEnemies = enemyNames.filter(name => [
                    '万蛊妖主·母巢', '阴阳尸傀·双生', '血莲教主·妄念'
                ].includes(name));
            } else if (condition == "sboss") {
                selectedEnemies = enemyNames.filter(name => [
                    '造化尸尊·无极', '血海阎罗·轮回', '天罚魔尊·诛仙'
                ].includes(name));
            } else {
                selectedEnemies = enemyNames.filter(name => [
                    '雾隐狐', '幽鳞蟒', '蛇尾貂', '寒骨蛇', '赤练火蜈', '魇面狐'
                ].includes(name));
            }
            enemy.name = selectedEnemies[Math.floor(Math.random() * selectedEnemies.length)];
            setEnemyStats(enemy.type, condition);
            break;
        case "Quick":
            // Select name and apply stats for Quick enemies
            if (condition == "guardian") {
                selectedEnemies = enemyNames.filter(name => [
                    '魅影妖皇·千幻', '惊雷鹏妖·裂空'
                ].includes(name));
            } else if (condition == "sboss") {
                selectedEnemies = enemyNames.filter(name => [
                    '苍穹妖帝·逐日', '混沌魔鹏·遮天'
                ].includes(name));
            } else {
                selectedEnemies = enemyNames.filter(name => [
                    '疾风貂', '影刃螳螂', '银线蛇', '鬼面蝠', '闪灵猫', '游风狼'
                ].includes(name));
            }
            enemy.name = selectedEnemies[Math.floor(Math.random() * selectedEnemies.length)];
            setEnemyStats(enemy.type, condition);
            break;
        case "Lethal":
            // Select name and apply stats for Lethal enemies
            if (condition == "guardian") {
                selectedEnemies = enemyNames.filter(name => [
                    '九幽冥龙·断魂', '血瞳修罗·嗜血', '万骨君王·葬天'
                ].includes(name));
            } else if (condition == "sboss") {
                selectedEnemies = enemyNames.filter(name => [
                    '万劫魔主·灭世'
                ].includes(name));
            } else {
                selectedEnemies = enemyNames.filter(name => [
                    '血瞳狈', '断魂蛛', '黑砂蝎', '魇瞳狐', '噬心蜈', '裂心狰'
                ].includes(name));
            }
            enemy.name = selectedEnemies[Math.floor(Math.random() * selectedEnemies.length)];
            setEnemyStats(enemy.type, condition);
            break;
    }
    if (condition == "chest") {
        enemy.name = "守宝灵傀";
    } else if (condition == "door") {
        enemy.name = "镜障幻兽";
    }
    if (enemy.affixIndex >= 0 && typeof ENEMY_AFFIXES !== "undefined" && ENEMY_AFFIXES[enemy.affixIndex]) {
        const ax = ENEMY_AFFIXES[enemy.affixIndex];
        const qt = (typeof ENEMY_QUALITY_TIERS !== "undefined" && ENEMY_QUALITY_TIERS[enemy.qualityTier])
            ? ENEMY_QUALITY_TIERS[enemy.qualityTier]
            : { label: "凡物" };
        enemy.name = qt.label + "·" + ax.prefix + "·" + enemy.name;
    }
    if (typeof enemy.name === "string" && enemy.name.length) {
        enemy.name = enemy.name
            .replace(/\s*,\s*/g, "·")
            .replace(/，/g, "·")
            .replace(/·{2,}/g, "·");
    }

}

const assignEnemyMechanic = (condition) => {
    const roll = Math.random();
    const isBoss = condition === "guardian" || condition === "sboss";
    const pool = ["shield", "summoner", "charger", "thorned", "phase", "berserker", "duelist", "bulwark"];
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (!isBoss && roll > 0.6) {
        enemy.mechanic = null;
        return;
    }
    if (isBoss && roll < 0.22) {
        type = "charger";
    }
    enemy.mechanic = {
        type: type,
        shieldHp: 0,
        maxShieldHp: 0,
        shieldBreakVulnerableUntil: 0,
        summonCounter: 0,
        chargeCounter: 0,
        isCharging: false,
        phaseDodgeRate: 0,
        berserkTriggered: false
    };
};

// Set a randomly generated stat for the enemy
const setEnemyStats = (type, condition) => {
    if (type == "Offensive") {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(300, 370),
            atk: randomizeNum(70, 100),
            def: randomizeNum(20, 50),
            atkSpd: randomizeDecimal(0.2, 0.4),
            vamp: 0,
            critRate: randomizeDecimal(1, 4),
            critDmg: randomizeDecimal(6.5, 7.5)
        };
    } else if (type == "Defensive") {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(400, 500),
            atk: randomizeNum(40, 70),
            def: randomizeNum(40, 70),
            atkSpd: randomizeDecimal(0.1, 0.3),
            vamp: 0,
            critRate: 0,
            critDmg: 0
        };
    } else if (type == "Balanced") {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(320, 420),
            atk: randomizeNum(50, 80),
            def: randomizeNum(30, 60),
            atkSpd: randomizeDecimal(0.15, 0.35),
            vamp: 0,
            critRate: randomizeDecimal(0.5, 1.5),
            critDmg: randomizeDecimal(1, 3)
        };
    } else if (type == "Quick") {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(300, 370),
            atk: randomizeNum(50, 80),
            def: randomizeNum(30, 60),
            atkSpd: randomizeDecimal(0.35, 0.45),
            vamp: 0,
            critRate: randomizeDecimal(1, 4),
            critDmg: randomizeDecimal(3, 6)
        };
    } else if (type == "Lethal") {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(300, 370),
            atk: randomizeNum(70, 100),
            def: randomizeNum(20, 50),
            atkSpd: randomizeDecimal(0.15, 0.35),
            vamp: 0,
            critRate: randomizeDecimal(4, 8),
            critDmg: randomizeDecimal(6, 9)
        };
    }

    if (dungeon.enemyMultipliers == undefined) {
        dungeon.enemyMultipliers = {
            hp: 1,
            atk: 1,
            def: 1,
            atkSpd: 1,
            vamp: 1,
            critRate: 1,
            critDmg: 1
        }
    }

    const f = Math.max(1, dungeon && dungeon.progress && typeof dungeon.progress.floor === "number" && !isNaN(dungeon.progress.floor) ? Math.floor(dungeon.progress.floor) : 1);

    // Apply stat scaling for enemies each level（邪印 via enemyScaling，由 CURSE_ENEMY_STAT_MULTIPLIER 放大）
    // 让“邪印 Lvl=1”也产生极小增量：enemyScaling 初值约为 1.12 时，增量不为 0。
    var escImpact = typeof DUNGEON_ENEMY_SCALING_IMPACT === "number" && DUNGEON_ENEMY_SCALING_IMPACT > 0 ? DUNGEON_ENEMY_SCALING_IMPACT : 1;
    var escRaw =
        typeof dungeon.settings.enemyScaling === "number" && !isNaN(dungeon.settings.enemyScaling)
            ? dungeon.settings.enemyScaling
            : 1.12;
    var escMonsterMin =
        typeof getDungeonEnemyScalingMonsterFloorMinimum === "function"
            ? getDungeonEnemyScalingMonsterFloorMinimum(f)
            : typeof DUNGEON_ENEMY_SCALING_MONSTER_MIN === "number" && isFinite(DUNGEON_ENEMY_SCALING_MONSTER_MIN) && DUNGEON_ENEMY_SCALING_MONSTER_MIN > 0
              ? DUNGEON_ENEMY_SCALING_MONSTER_MIN
              : 1.12;
    var escForMonster = Math.max(escMonsterMin, escRaw);
    var curseDelta = Math.max(0, escForMonster - 1.08) * CURSE_ENEMY_STAT_MULTIPLIER * escImpact;
    for (const stat in enemy.stats) {
        if (["hpMax", "atk", "def"].includes(stat)) {
            enemy.stats[stat] += Math.round(enemy.stats[stat] * (curseDelta * enemy.lvl));
        } else if (["atkSpd"].includes(stat)) {

            const spdCurseDelta = Math.max(0, escForMonster - 1.08) * CURSE_ENEMY_STAT_MULTIPLIER * escImpact;
            enemy.stats[stat] = 0.4;

            enemy.stats[stat] += enemy.stats[stat] * ((spdCurseDelta / 30) * enemy.lvl);
        } else if (["critRate"].includes(stat)) {
            enemy.stats[stat] += enemy.stats[stat] * ((curseDelta / 4) * enemy.lvl);
        } else if (["critDmg"].includes(stat)) {
            enemy.stats[stat] = 50;
            enemy.stats[stat] += enemy.stats[stat] * ((curseDelta / 4) * enemy.lvl);
        }
    }

    const isBoss = condition === "guardian" || condition === "sboss";

    // Stat multiplier for floor guardians（层主，仅下调攻防，保留血量）
    if (condition == "guardian") {
        enemy.stats.hpMax = enemy.stats.hpMax * 1.88;
        enemy.stats.atk = enemy.stats.atk * 1.35;
        enemy.stats.def = enemy.stats.def * 1.28;
        enemy.stats.critRate = enemy.stats.critRate * 1.18;
        enemy.stats.critDmg = enemy.stats.critDmg * 1.32;
    }

    // Stat multiplier for monarchs（秘境主宰）
    if (condition == "sboss") {
        enemy.stats.hpMax = enemy.stats.hpMax * 8.4;
        enemy.stats.atk = enemy.stats.atk * 2.48;
        enemy.stats.def = enemy.stats.def * 2.48;
        enemy.stats.critRate = enemy.stats.critRate * 1.18;
        enemy.stats.critDmg = enemy.stats.critDmg * 1.45;
    }

    const depth = f - 1;
 
    const floorOneNerf = 1;
    const minionMul = floorOneNerf * Math.pow(1.5, depth);
    let floorCombatMul = minionMul;
    if (condition === "guardian") {
        floorCombatMul = minionMul;
    } else if (condition === "sboss") {
        floorCombatMul = minionMul;
    }
    enemy.stats.hpMax = Math.round(enemy.stats.hpMax * floorCombatMul * dungeon.enemyMultipliers.hp);
    enemy.stats.atk = Math.round(enemy.stats.atk * floorCombatMul * dungeon.enemyMultipliers.atk);
    enemy.stats.def = Math.round(enemy.stats.def * floorCombatMul * dungeon.enemyMultipliers.def);
    let atkSpdOut = enemy.stats.atkSpd;
    const spdMul = Math.min(1.55, Math.pow(1.022, depth) * Math.pow(1.008, depth) * (isBoss ? 1.15 : 1.08));
    atkSpdOut = Math.min(2.85, atkSpdOut * spdMul);
    enemy.stats.atkSpd = atkSpdOut * dungeon.enemyMultipliers.atkSpd;
    enemy.stats.vamp = enemy.stats.vamp * dungeon.enemyMultipliers.vamp;
    const critRateMul = Math.min(2.2, Math.pow(1.028, depth) * Math.pow(1.008, depth) * (isBoss ? 1.12 : 1));
    enemy.stats.critRate = enemy.stats.critRate * critRateMul * dungeon.enemyMultipliers.critRate;
    const critDmgMul = Math.pow(1.035, depth) * Math.pow(1.009, depth) * (isBoss ? 1.15 : 1.05);
    enemy.stats.critDmg = enemy.stats.critDmg * critDmgMul * dungeon.enemyMultipliers.critDmg;

    var affixLootMul = 1;
    if (typeof ENEMY_AFFIXES !== "undefined" && enemy.affixIndex != null && enemy.affixIndex >= 0 && ENEMY_AFFIXES[enemy.affixIndex]) {
        var ax = ENEMY_AFFIXES[enemy.affixIndex];
        enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * ax.hp));
        enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * ax.atk));
        enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * ax.def));
        enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * ax.spd);
        enemy.stats.critRate = Math.max(0, enemy.stats.critRate * ax.cr);
        enemy.stats.critDmg = Math.max(0, enemy.stats.critDmg * ax.cd);
        enemy.stats.vamp = enemy.stats.vamp + ax.vamp;
        affixLootMul = ax.loot;
    }

    var qualityLootMul = 1;
    if (typeof ENEMY_QUALITY_TIERS !== "undefined" && enemy.qualityTier != null && ENEMY_QUALITY_TIERS[enemy.qualityTier]) {
        const qm = ENEMY_QUALITY_TIERS[enemy.qualityTier];
        enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * qm.hp));
        enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * qm.atk));
        enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * qm.def));
        enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * qm.spd);
        enemy.stats.critRate = Math.max(0, enemy.stats.critRate * qm.cr);
        enemy.stats.critDmg = Math.max(0, enemy.stats.critDmg * qm.cd);
        qualityLootMul = qm.loot;
    }

    var totalLootMul = affixLootMul * qualityLootMul;

 
    const isEscortActive = typeof escort !== "undefined" && escort && escort.active;
    const isMiningActive = typeof mining !== "undefined" && mining && mining.active;
    const isExploringMode = !isEscortActive && !isMiningActive;
    const floorDifficultyMul = f === 1 && isExploringMode ? 0.7 : 1;
    if (floorDifficultyMul !== 1) {
        enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * floorDifficultyMul));
        enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * floorDifficultyMul));
        enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * floorDifficultyMul));
        enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * floorDifficultyMul);
        enemy.stats.vamp = enemy.stats.vamp * floorDifficultyMul;
        enemy.stats.critRate = enemy.stats.critRate * floorDifficultyMul;
        enemy.stats.critDmg = enemy.stats.critDmg * floorDifficultyMul;
    }


    if (f === 20 && isExploringMode && (condition === "guardian" || condition === "sboss")) {
        const floor20BossNerf = 0.8;
        enemy.stats.hpMax = Math.max(1, Math.round(enemy.stats.hpMax * floor20BossNerf));
        enemy.stats.atk = Math.max(1, Math.round(enemy.stats.atk * floor20BossNerf));
        enemy.stats.def = Math.max(0, Math.round(enemy.stats.def * floor20BossNerf));
        enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * floor20BossNerf);
        enemy.stats.vamp = enemy.stats.vamp * floor20BossNerf;
        enemy.stats.critRate = enemy.stats.critRate * floor20BossNerf;
        enemy.stats.critDmg = enemy.stats.critDmg * floor20BossNerf;
    }

    // Calculate exp and gold that the monster gives
    const expYield = [];

    for (const stat in enemy.stats) {
        let statExp;
        if (["hpMax", "atk", "def"].includes(stat)) {
            statExp = enemy.stats[stat] + enemy.stats[stat] * 0.5;
        } else if (["atkSpd", "critRate", "critDmg"].includes(stat)) {
            statExp = enemy.stats[stat] + enemy.stats[stat] * 2;
        } else if (["vamp", "hp"].includes(stat)) {
            statExp = enemy.stats[stat] + enemy.stats[stat] * 1;
        }
        expYield.push(statExp);
    }

    let expCalculation = (expYield.reduce((acc, cur) => acc + cur, 0)) / 20;
    var expLvlCap = getDungeonExpRewardLevelCapForCurrentFloor();
    var expLvlForReward =
        expLvlCap == null
            ? Math.max(1, Math.floor(Number(enemy.lvl) || 1))
            : Math.min(Math.max(1, Math.floor(Number(enemy.lvl) || 1)), expLvlCap);
    let expBase = Math.round((expCalculation + expCalculation * (expLvlForReward * 0.1)) * totalLootMul);
    if (expBase > 1000000) {
        expBase = Math.round(1000000 * randomizeDecimal(0.9, 1.1));
    }

    const MONSTER_EXP_DROP_MULT = 0.15;
    enemy.rewards.exp = Math.max(1, Math.round(expBase * MONSTER_EXP_DROP_MULT));
    // 押镖 / 地脉采矿：击杀不计修为；灵石与掉落照旧（圆满结算也不再发感悟，见 endEscortRun）
    if (isEscortActive || isMiningActive) {
        enemy.rewards.exp = 0;
    }
    enemy.rewards.gold = applyGoldGainMult(Math.round((expBase * randomizeDecimal(0.9, 1.1)) * 1.5));
    enemy.rewards.drop = randomizeNum(1, 3);
    if (enemy.rewards.drop == 1) {
        enemy.rewards.drop = true;
    } else {
        enemy.rewards.drop = false;
    }
    if (condition === "chest") {
        enemy.rewards.drop = false;
    }

    enemy.stats.hp = enemy.stats.hpMax;
    enemy.stats.hpPercent = 100;

    if (enemy.stats.atkSpd > 2.75) {
        enemy.stats.atkSpd = 2.75;
    }

    if (enemy.mechanic && enemy.mechanic.type === "shield") {
        const isBoss = condition === "guardian" || condition === "sboss";
        const shieldRatio = isBoss ? 0.55 : 0.35;
        const sh = Math.max(1, Math.round(enemy.stats.hpMax * shieldRatio));
        enemy.mechanic.maxShieldHp = sh;
        enemy.mechanic.shieldHp = sh;
        enemy.mechanic.shieldBreakVulnerableUntil = 0;
    }
    if (enemy.mechanic && enemy.mechanic.type === "phase") {
        const isBoss = condition === "guardian" || condition === "sboss";
        enemy.mechanic.phaseDodgeRate = isBoss ? 0.24 : 0.16;
    }
    if (enemy.mechanic && enemy.mechanic.type === "berserker") {
        enemy.mechanic.berserkTriggered = false;
    }
}

const enemyLoadStats = () => {
    // Shows proper percentage for respective stats
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    if (enemy.stats.hp > enemy.stats.hpMax) {
        enemy.stats.hp = enemy.stats.hpMax;
    }
    const hasShieldMechanic = !!(
        enemy &&
        enemy.mechanic &&
        enemy.mechanic.type === "shield" &&
        typeof enemy.mechanic.maxShieldHp === "number" &&
        enemy.mechanic.maxShieldHp > 0
    );
    const shieldNow = hasShieldMechanic ? Math.max(0, Math.round(enemy.mechanic.shieldHp || 0)) : 0;
    const shieldMax = hasShieldMechanic ? Math.max(0, Math.round(enemy.mechanic.maxShieldHp || 0)) : 0;

    const hpNowDisplay = hasShieldMechanic ? enemy.stats.hp + shieldNow : enemy.stats.hp;
    const hpMaxDisplay = hasShieldMechanic ? enemy.stats.hpMax + shieldMax : enemy.stats.hpMax;
    const hpPctRaw = hpMaxDisplay > 0 ? (hpNowDisplay / hpMaxDisplay) * 100 : 0;
    enemy.stats.hpPercent = hpPctRaw.toFixed(2).replace(rx, "$1");

    const enemyHpElement = document.querySelector('#enemy-hp-battle');
    const enemyHpDamageElement = document.querySelector('#enemy-hp-dmg');
    if (hasShieldMechanic) {
        enemyHpElement.innerHTML = `${nFormatter(enemy.stats.hp)}+${nFormatter(shieldNow)}/${nFormatter(enemy.stats.hpMax)}+${nFormatter(shieldMax)} <span class="combat-bar__pct">${enemy.stats.hpPercent}%</span>`;
    } else {
        enemyHpElement.innerHTML = `${nFormatter(hpNowDisplay)}/${nFormatter(hpMaxDisplay)} <span class="combat-bar__pct">${enemy.stats.hpPercent}%</span>`;
    }
    enemyHpElement.style.width = `${enemy.stats.hpPercent}%`;
    enemyHpDamageElement.style.width = `${enemy.stats.hpPercent}%`;
}
