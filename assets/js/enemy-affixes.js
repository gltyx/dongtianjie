/**
 * 妖兽词条：前 100 为基础词条；100–149 为高阶词条（层数越高越容易roll到）
 * 品质共 10 档：凡物→劫主，层数越高、镇守/主宰越容易出高品质
 */
(function () {
    // 怪物强度调参：轻微上调前缀词条与品质词条（不改抽取概率，只改最终数值倍率）
    // 前缀词条 hp/atk/def/spd/cr/cd/vamp/loot 的整体强度
    var AFFIX_STAT_MULT_UP = 1.15;
    var AFFIX_LOOT_MULT_UP = 1.12;

    // 品质词条（ENEMY_QUALITY_TIERS） hp/atk/def/spd/cr/cd/loot 的整体强度
    var QUALITY_STAT_MULT_UP = 1.12;
    var QUALITY_LOOT_MULT_UP = 1.15;

    function splitPrefixCsv(csv) {
        return csv.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    }

    var PREFIX_LIST = splitPrefixCsv(
        "狂暴,铁躯,幽影,血煞,雷殛,瘟瘴,幻惑,磐石,风行,噬灵," +
            "凝煞,燃魂,霜噬,蚀骨,邪印,狂乱,冥瞳,赤练,玄罡,罡煞," +
            "劫火,碎星,掠魂,枯荣,无妄,太虚,混元,归寂,窥天,诛邪," +
            "镇狱,缚龙,吞月,衔日,破军,贪狼,七杀,飞廉,计都,罗睺," +
            "九幽,三阴,五瘟,七情,六欲,五蕴,八苦,无明,戮业,修罗," +
            "剑意,刀罡,枪魂,戟煞,鞭雷,锤岳,扇灵,弓鸣,弩绝,镖影," +
            "金行,木煞,水髓,火精,土罡,风疾,雷振,冰魄,毒涎,光蚀," +
            "古种,荒血,蛮纹,灵裔,妖丹,魔胎,孽缘,道殛,儒劫,墨染," +
            "守墓,葬花,听潮,观星,问禅,弈天,棋劫,琴妖,笛煞,钟魁," +
            "幡灵,镜魇,傀心,尸煞,骨铃,魂灯,魄链,血祭,魂饲,灵契," +
            "劫灰,无名,断缘,藏锋,归藏"
    );

    var HIGH_PREFIX_LIST = splitPrefixCsv(
        "天倾,道陨,界渊,墟皇,劫母,梵灭,鸿蒙,太初,归墟,无赦," +
            "帝煞,圣骸,魔渊,灵殒,星骸,宙裂,时蚀,空劫,命轮,因果," +
            "诛仙,镇界,封天,御劫,炼狱,九霄,三清,五行,轮回,涅槃," +
            "真武,玄冥,赤阳,青帝,白泽,穷奇,饕餮,混沌,梼杌,麒麟," +
            "祖龙,天凤,鲲鹏,金乌,玉兔,刑天,夸父,蚩尤,共工,祝融,应龙"
    );

    var affixes = [];
    var i;
    for (i = 0; i < 100; i++) {
        affixes.push({
            prefix: PREFIX_LIST[i],
            hp: +(0.71 + (i % 10) * 0.032).toFixed(3),
            atk: +(0.73 + (Math.floor(i / 10) % 10) * 0.032).toFixed(3),
            def: +(0.67 + ((i * 3 + 7) % 10) * 0.034).toFixed(3),
            spd: +(0.78 + ((i * 11) % 12) * 0.024).toFixed(3),
            cr: +(0.71 + ((i * 13) % 12) * 0.027).toFixed(3),
            cd: +(0.75 + ((i * 17) % 12) * 0.028).toFixed(3),
            vamp: +((((i * 19) % 7) * 0.28)).toFixed(2),
            loot: +(0.862 + i * 0.00277).toFixed(4),
            tier: 0
        });
    }
    for (i = 0; i < 50; i++) {
        var hi = i;
        affixes.push({
            prefix: HIGH_PREFIX_LIST[i],
            hp: +(0.94 + (hi % 8) * 0.028 + Math.floor(hi / 8) * 0.012).toFixed(3),
            atk: +(0.96 + ((hi * 3) % 9) * 0.027).toFixed(3),
            def: +(0.90 + ((hi * 5) % 9) * 0.029).toFixed(3),
            spd: +(0.88 + ((hi * 7) % 10) * 0.026).toFixed(3),
            cr: +(0.92 + ((hi * 11) % 9) * 0.025).toFixed(3),
            cd: +(0.94 + ((hi * 13) % 9) * 0.024).toFixed(3),
            vamp: +(1.0 + (hi % 8) * 0.35).toFixed(2),
            loot: +(1.02 + hi * 0.0044).toFixed(4),
            tier: 1
        });
    }

    // Apply stat/loot tuning to all affixes（仅数值上调，不改层数抽取概率）
    for (i = 0; i < affixes.length; i++) {
        affixes[i].hp = affixes[i].hp * AFFIX_STAT_MULT_UP;
        affixes[i].atk = affixes[i].atk * AFFIX_STAT_MULT_UP;
        affixes[i].def = affixes[i].def * AFFIX_STAT_MULT_UP;
        affixes[i].spd = affixes[i].spd * AFFIX_STAT_MULT_UP;
        affixes[i].cr = affixes[i].cr * AFFIX_STAT_MULT_UP;
        affixes[i].cd = affixes[i].cd * AFFIX_STAT_MULT_UP;
        affixes[i].vamp = affixes[i].vamp * AFFIX_STAT_MULT_UP;
        affixes[i].loot = affixes[i].loot * AFFIX_LOOT_MULT_UP;
    }

    window.ENEMY_AFFIXES = affixes;

    /** 层数越高：越容易抽到 100–149 高阶词条；基础池内也更偏向后半索引 */
    window.pickEnemyAffixIndex = function (floor) {
        var f = Math.max(1, Math.min(floor || 1, 100));
        var highChance = 0.12 + ((f - 1) / 99) * 0.48;
        if (Math.random() < highChance) {
            return 100 + Math.floor(Math.random() * 50);
        }
        var bias = Math.floor(((f - 1) / 100) * 28);
        var idx = Math.floor(Math.random() * 100) + bias;
        return Math.min(99, idx);
    };

    /** 10 档品质：凡物、异兆、凶顽、精锐、精英、头领、统领、霸主、天灾、劫主 */
    window.ENEMY_QUALITY_TIERS = [
        { label: "凡物", hp: 0.93, atk: 0.93, def: 0.93, spd: 0.95, cr: 0.95, cd: 0.95, loot: 0.90 },
        { label: "异兆", hp: 0.97, atk: 0.97, def: 0.97, spd: 0.98, cr: 0.98, cd: 0.98, loot: 0.94 },
        { label: "凶顽", hp: 1.02, atk: 1.03, def: 1.01, spd: 1.02, cr: 1.02, cd: 1.02, loot: 0.98 },
        { label: "精锐", hp: 1.08, atk: 1.10, def: 1.06, spd: 1.05, cr: 1.05, cd: 1.05, loot: 1.04 },
        { label: "精英", hp: 1.14, atk: 1.16, def: 1.11, spd: 1.08, cr: 1.08, cd: 1.08, loot: 1.10 },
        { label: "头领", hp: 1.22, atk: 1.24, def: 1.17, spd: 1.11, cr: 1.11, cd: 1.11, loot: 1.18 },
        { label: "统领", hp: 1.32, atk: 1.34, def: 1.25, spd: 1.15, cr: 1.14, cd: 1.14, loot: 1.28 },
        { label: "霸主", hp: 1.44, atk: 1.46, def: 1.34, spd: 1.20, cr: 1.18, cd: 1.18, loot: 1.40 },
        { label: "天灾", hp: 1.58, atk: 1.60, def: 1.44, spd: 1.26, cr: 1.24, cd: 1.24, loot: 1.55 },
        { label: "劫主", hp: 1.75, atk: 1.78, def: 1.55, spd: 1.32, cr: 1.30, cd: 1.30, loot: 1.72 }
    ];

    // Apply stat/loot tuning to all quality tiers（仅数值上调，不改抽取概率）
    for (i = 0; i < window.ENEMY_QUALITY_TIERS.length; i++) {
        var q = window.ENEMY_QUALITY_TIERS[i];
        q.hp = q.hp * QUALITY_STAT_MULT_UP;
        q.atk = q.atk * QUALITY_STAT_MULT_UP;
        q.def = q.def * QUALITY_STAT_MULT_UP;
        q.spd = q.spd * QUALITY_STAT_MULT_UP;
        q.cr = q.cr * QUALITY_STAT_MULT_UP;
        q.cd = q.cd * QUALITY_STAT_MULT_UP;
        q.loot = q.loot * QUALITY_LOOT_MULT_UP;
    }

    function pickWeighted(weights) {
        var sum = 0;
        var k;
        for (k = 0; k < weights.length; k++) {
            sum += weights[k];
        }
        var r = Math.random() * sum;
        var acc = 0;
        for (k = 0; k < weights.length; k++) {
            acc += weights[k];
            if (r <= acc) {
                return k;
            }
        }
        return weights.length - 1;
    }

    window.pickEnemyQualityTier = function (floor, condition) {
        var f = Math.max(1, floor || 1);
        var w = [18, 16, 14, 12, 10, 8, 6, 4, 2, 1];
        var i;
        var shift = (f - 1) * 0.085;
        for (i = 0; i < 10; i++) {
            w[i] = Math.max(0.15, w[i] + shift * (i + 1) * 0.35);
        }
        if (condition === "guardian") {
            for (i = 0; i < 10; i++) {
                w[i] *= i >= 3 ? 1.65 + (i - 3) * 0.22 : 0.35;
            }
        } else if (condition === "sboss") {
            for (i = 0; i < 10; i++) {
                w[i] *= i >= 5 ? 2.2 + (i - 5) * 0.45 : i >= 2 ? 0.5 : 0.12;
            }
        }
        return pickWeighted(w);
    };
})();
