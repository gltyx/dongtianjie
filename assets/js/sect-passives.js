/**
 * 门派被动：12×25 式。第 i 式对应「机制模板 i」，各派数值矩阵不同；
 * 模板彼此不同，高阶不等于全面碾压，可按流派混搭 5 个上阵。
 */
var SECT_LIST = [
    { id: "jianzhong", name: "神剑宗", blurb: "承「神剑」之名，剑意如霜；专斩残势，敌血愈薄，剑锋愈寒。" },
    { id: "juling", name: "玄武宗", blurb: "效北方玄武，镇岳为铠；气血绵长，护体深沉，愈战愈如磐。" },
    { id: "kuanglan", name: "焚天宗", blurb: "心火与剑火同焚，叠刃成岚；愈战愈炽，一击可倾半壁天光。" },
    { id: "wuxing", name: "青云门", blurb: "身若青云无定踪，剑走偏锋；掠影连环，风起时敌已中数创。" },
    { id: "shengshi", name: "玉清门", blurb: "守玉清之境，心壁无尘；化劲卸锋，立如峰，万法难撼其神。" },
    { id: "jihuan", name: "鬼王宗", blurb: "承幽冥鬼王之气，棘刺为冕；敌伤我一分，因果必还三分。" },
    { id: "hehuan", name: "合欢宗", blurb: "合阴阳之变，化魅影为剑；会心暴烈，身法缠绵，饮敌生机以自快。" },
    { id: "xiaoyao", name: "逍遥宗", blurb: "逍遥于天地之间，不执一端；攻守如流水，无锋而无不入。" },
    { id: "mingjiao", name: "明教", blurb: "圣火昭昭，明尊在前；燎原之势，追击与爆发并烈，焚尽强敌余威。" },
    { id: "xuesha", name: "血煞宗", blurb: "血煞入体，以己伤为祭；血线愈危，杀意愈盛，如修罗踏血而行。" },
    { id: "fenmai", name: "焚脉宗", blurb: "焚经脉以换刹那之力；焰起则伤敌亦伤己，爆发无匹，身法易滞。" },
    { id: "jueming", name: "绝命堂", blurb: "绝命一线，生死同悬；敌我皆残时锋芒最盛，胜则生，败则陨。" }
];

/** 十二门派本命武器类型（与 equipment 的 Weapon category 一致）；持之则总力道独立乘算 (1+pct/100) */
var SECT_WEAPON_ATK_BONUS_PCT = 50;
var SECT_WEAPON_CATEGORY = {
    jianzhong: "Sword",
    juling: "Hammer",
    kuanglan: "Axe",
    wuxing: "Dagger",
    shengshi: "Staff",
    jihuan: "Scythe",
    hehuan: "Blade",
    xiaoyao: "Fan",
    mingjiao: "Spear",
    xuesha: "Glaive",
    fenmai: "Flail",
    jueming: "Whip"
};

function getSectWeaponCategory(sectId) {
    return sectId ? SECT_WEAPON_CATEGORY[sectId] : null;
}

var PASSIVE_SKILLS = [];
var PASSIVE_BY_ID = {};

(function buildSectPassives() {
    var names = {
        jianzhong: [
            "碑冷无名", "拾剑为契", "断碑余诀", "血浸残铁", "剑问归处", "墟风来客", "葬剑之地", "千劫一痕", "绝踪之誓", "鸣渊回响",
            "焚心旧约", "饮血非吾愿", "镇魂碑前", "断脉之谏", "噬灵者戒", "朝宗无人", "天倾一夕", "无回路引", "轮回劫契", "斩妄录残篇",
            "残照归一", "寂灭碑铭", "心碑自照", "封喉传说", "终焉不归"
        ],
        juling: [
            "山门初叩", "血涌如誓", "固本灵符", "撼地童谣", "附体之说", "护体祖训", "回澜家书", "不移之柱", "铁壁遗训", "承伤之诺",
            "深蓄经年", "镇海古誓", "崩云见证", "岳魄相传", "共鸣钟鸣", "吞海旧事", "无疆界碑", "灵躯世代", "通天血契", "合一之约",
            "归真路引", "朝元古礼", "轮回血印", "镇魔铭文", "终章血书"
        ],
        kuanglan: [
            "初啸风声", "叠刃旧梦", "觉醒之痛", "贯体之狂", "斩念之刃", "摧城谣", "裂空一诺", "焚炉心誓", "断魂契", "灭法残卷",
            "噬心谶", "狂歌非醉", "绝脉血书", "千劫谣", "无赦之令", "崩天见证", "归一疯话", "崩界寓言", "永劫心咒", "终裁碑",
            "证道血誓", "轮回疯语", "灭度一念", "无妄天罚", "终焉疯笺"
        ],
        wuxing: [
            "起步尘缘", "迷离剑诀", "青烟身契", "掠影飞鸿", "剑舞无踪", "遁影千声", "无迹之诺", "连环旧事", "袭影无痕", "相生无凭",
            "分光传说", "惊鸿一瞥", "心脉锁影", "破妄身帖", "追魂铃", "通玄残页", "纵横游记", "归真无书", "天罗谜语", "万象身契",
            "无方偈语", "证剑无名", "轮回影帖", "超脱偈", "终章无影"
        ],
        shengshi: [
            "启心钟", "初成誓约", "护体心印", "涤秽圣言", "如山旧誓", "无隙心壁", "镇邪圣印", "不灭魂誓", "净空心域", "御劫铭文",
            "通明誓心", "永恒心壁", "庇护圣喻", "归一誓法", "诸天新印", "同天旧约", "无漏心壁", "普照誓文", "无染极誓", "合一圣心",
            "终净真言", "证道心书", "轮回心誓", "无尘圣极", "终章誓愿"
        ],
        jihuan: [
            "初结棘环", "反噬古咒", "甲裂誓约", "缠敌棘影", "护体环刃", "倒刺遗训", "共鸣棘魄", "荆棘界碑", "贯心刺铭", "无赦棘誓",
            "轮回环刃", "噬灵棘咒", "封魂棘域", "天罗刺网", "镇厄玄甲", "反戈极刺", "归墟环魄", "终劫刺铭", "证劫棘甲", "无间环域",
            "归真玄棘", "轮回棘环", "灭度刺帖", "终焉玄甲", "终章棘愿"
        ],
        hehuan: [
            "媚影初栖", "销魂一指", "合铃诀", "缠丝剑引", "倾国余温", "销魂雾隐", "双影共舞", "媚骨天工", "销魂引", "红袖藏锋",
            "销魂无寐", "倾城一笑", "合欢心经", "雾锁心魂", "媚眼藏剑", "销魂夜吟", "缠心锁命", "引魄销魂", "倾国无双", "销魂劫",
            "天罗魅影", "销魂归藏", "千魅一瞬", "终章销魂", "合欢无极"
        ],
        xiaoyao: [
            "云山初履", "御风徐行", "天地一鸥", "逍遥无忌", "云心水性", "自在飞花", "无相步", "逍遥剑意", "云深难觅", "天地逍遥",
            "御剑乘风", "云无心出", "游心太玄", "天地一粟", "云卷云舒", "逍遥无极", "御风万里", "逍遥证道", "云游太虚", "天地同春",
            "逍遥归一", "云水禅心", "逍遥终章", "天地一人", "逍遥无尘"
        ],
        mingjiao: [
            "圣火初燃", "焚影幢幢", "圣火令引", "焚天式", "明尊无量", "圣火燎原", "焚影噬心", "光明圣火", "乾坤一掷", "圣火焚心",
            "明尊降世", "焚天诀", "圣火昭昭", "焚影灭法", "光明无量", "圣火归一", "焚天灭法", "明尊出世", "圣火终章", "圣火无量",
            "焚影归墟", "明尊终焉", "圣火永燃", "焚天无极", "明尊证道"
        ],
        xuesha: [
            "血誓初饮", "剐脉剑", "以血饲锋", "嗜魄诀", "血池临渊", "血祭式", "剜心剑", "修罗道引", "血雨腥风", "血河倒灌",
            "血魄焚", "噬血印", "血咒锁命", "万剐千锋", "血海无涯", "偿命剑", "血债血偿", "修罗怒", "血影重重", "血洗山河",
            "血誓终章", "归墟血路", "万血归一", "血煞滔天", "终焉血契"
        ],
        fenmai: [
            "焚心初照", "焚经诀", "断脉换力", "焚魄掌", "灵脉自焚", "炼脉焚心", "焚魂一剑", "火毒攻心", "经脉俱焚", "焚天煮海",
            "焚骨诀", "自焚式", "焚魄归墟", "业火焚心", "焚经灭法", "焚我成道", "焚灵终章", "焚脉无极", "焚心证道", "焚身成仁",
            "燎原焚心", "魄烬归墟", "烬脉无极", "终焚证道", "焚脉终章"
        ],
        jueming: [
            "绝命一赌", "向死而生", "命悬一线", "舍命一击", "绝地反击", "绝路逢生", "绝命剑", "生死状", "以命搏命", "绝命无常",
            "绝命书", "绝命契", "绝命幡", "绝命灯", "绝命歌", "绝命游", "绝命劫", "绝命归", "绝命终", "绝命无极",
            "绝命天刑", "绝地天通", "绝命证道", "绝命终章", "绝命无归"
        ]
    };

    /** 十二派顺序：神剑…明教，后三为极端自残增伤：血煞、焚脉、绝命 */
    function si(sectId) {
        return ["jianzhong", "juling", "kuanglan", "wuxing", "shengshi", "jihuan", "hehuan", "xiaoyao", "mingjiao", "xuesha", "fenmai", "jueming"].indexOf(sectId);
    }
    /**
     * 12 门派彻底分流：每派按自身 profile 生成 25 式，
     * 不再回落到「全派共用模板」。
     */
    function effectsForTemplate(sectId, t, usedComboKeys) {
        var PASSIVE_EFFECT_MULT = 2;
        var idx = Math.max(0, Math.min(24, t | 0));
        var tier = Math.floor(idx / 5) + 1; // 1..5
        var phase = idx % 5;

        var r1 = function (v) { return Math.round(v * 10) / 10; };
        var r2 = function (v) { return Math.round(v * 100) / 100; };
        var r3 = function (v) { return Math.round(v * 1000) / 1000; };
        var r4 = function (v) { return Math.round(v * 10000) / 10000; };
        var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

        var PROFILES = {
            jianzhong: { atk: 1.55, tank: 0.65, speed: 1.00, vamp: 0.75, burst: 1.65, style: [["onHit_enemyCurrHpPct", "passive_critRate"], ["onHit_enemyMissingHpPct", "passive_critDmg"], ["onCrit_damageMultPct", "passive_atkPct"], ["onHit_damageMultPct", "onHit_stackAtk"], ["onHit_selfHpMaxPct", "onHit_damageMultPct"]] },
            juling:    { atk: 0.75, tank: 1.70, speed: 0.70, vamp: 0.90, burst: 0.80, style: [["passive_hpPct", "passive_defPct"], ["dmgTakenReducePct", "thornsPctOfTaken"], ["onHit_selfHpMaxPct", "dmgTakenReducePct"], ["onHit_selfHpMaxPct", "passive_defPct"], ["thornsPctOfTaken", "passive_hpPct"]] },
            kuanglan:  { atk: 1.45, tank: 0.80, speed: 0.95, vamp: 0.85, burst: 1.55, style: [["onHit_damageMultPct", "passive_atkPct"], ["onHit_stackAtk", "onCrit_damageMultPct"], ["passive_critDmg", "onHit_enemyCurrHpPct"], ["onHit_enemyMissingHpPct", "onHit_damageMultPct"], ["onHit_selfHpMaxPct", "passive_critDmg"]] },
            wuxing:    { atk: 1.15, tank: 0.85, speed: 1.70, vamp: 0.85, burst: 1.20, style: [["onHit_stackAtkSpd", "passive_atkSpdPct"], ["onHit_stackAtk", "passive_critRate"], ["onHit_enemyCurrHpPct", "onHit_damageMultPct"], ["passive_atkPct", "onCrit_damageMultPct"], ["dmgTakenReducePct", "passive_atkSpdPct"]] },
            shengshi:  { atk: 0.65, tank: 1.85, speed: 0.70, vamp: 0.70, burst: 0.70, style: [["passive_hpPct", "dmgTakenReducePct"], ["passive_defPct", "thornsPctOfTaken"], ["onHit_selfHpMaxPct", "passive_hpPct"], ["dmgTakenReducePct", "passive_defPct"], ["onHit_selfHpMaxPct", "dmgTakenReducePct"]] },
            jihuan:    { atk: 1.00, tank: 1.40, speed: 0.85, vamp: 1.00, burst: 1.05, style: [["thornsPctOfTaken", "passive_defPct"], ["dmgTakenReducePct", "onHit_selfMissingHpPct"], ["onHit_vampBonusPct", "thornsPctOfTaken"], ["onHit_stackAtk", "dmgTakenReducePct"], ["onHit_enemyCurrHpPct", "thornsPctOfTaken"]] },
            hehuan:    { atk: 1.25, tank: 0.80, speed: 1.25, vamp: 1.55, burst: 1.45, style: [["passive_critRate", "passive_vamp"], ["passive_critDmg", "onHit_vampBonusPct"], ["onCrit_damageMultPct", "passive_atkSpdPct"], ["onHit_enemyMissingHpPct", "passive_critRate"], ["onHit_damageMultPct", "passive_vamp"]] },
            xiaoyao:   { atk: 1.00, tank: 1.00, speed: 1.65, vamp: 0.90, burst: 1.05, style: [["passive_atkSpdPct", "onHit_stackAtkSpd"], ["dmgTakenReducePct", "passive_atkSpdPct"], ["onHit_stackAtk", "passive_atkPct"], ["passive_critRate", "onHit_damageMultPct"], ["onHit_enemyCurrHpPct", "dmgTakenReducePct"]] },
            mingjiao:  { atk: 1.60, tank: 0.90, speed: 1.05, vamp: 0.75, burst: 1.35, style: [["onHit_enemyCurrHpPct", "onHit_damageMultPct"], ["passive_atkPct", "onHit_enemyMissingHpPct"], ["onCrit_damageMultPct", "onHit_enemyCurrHpPct"], ["passive_critDmg", "onHit_damageMultPct"], ["onHit_selfHpMaxPct", "passive_atkPct"]] },
            xuesha:    { atk: 1.45, tank: 0.70, speed: 1.00, vamp: 1.85, burst: 1.45, style: [["onHit_selfMissingHpPct", "passive_vamp"], ["onHit_vampBonusPct", "onHit_enemyMissingHpPct"], ["passive_critRate", "onHit_damageMultPct"], ["onHit_selfHpMaxPct", "onHit_vampBonusPct"], ["passive_critDmg", "passive_vamp"]] },
            fenmai:    { atk: 1.65, tank: 0.60, speed: 0.75, vamp: 1.10, burst: 1.75, style: [["onHit_selfHpMaxPct", "onHit_damageMultPct"], ["onHit_selfMissingHpPct", "passive_critDmg"], ["onCrit_damageMultPct", "passive_atkPct"], ["onHit_enemyCurrHpPct", "onHit_selfMissingHpPct"], ["passive_vamp", "onHit_damageMultPct"]] },
            jueming:   { atk: 1.70, tank: 0.55, speed: 0.90, vamp: 1.00, burst: 1.90, style: [["onHit_enemyCurrHpPct", "onHit_enemyMissingHpPct"], ["onHit_selfMissingHpPct", "passive_critRate"], ["onCrit_damageMultPct", "passive_critDmg"], ["onHit_damageMultPct", "onHit_selfHpMaxPct"], ["onCrit_damageMultPct", "onHit_enemyMissingHpPct"]] }
        };

        /**
         * 全局平衡层：
         * - sectPower：按门派总强度微调（>1 增强，<1 削弱）
         * - typeScale：按词条类型统一调节（控制爆伤/减伤等高波动词条）
         */
        var sectPower = {
            jianzhong: 0.95,
            /** 玄武宗：原 1.05，整体削弱 50% */
            juling: 0.525,
            kuanglan: 0.96,
            wuxing: 1.00,
            /** 玉清门（常被写作玉青门）：原 1.08，整体削弱 50% */
            shengshi: 0.54,
            jihuan: 1.02,
            hehuan: 0.94,
            xiaoyao: 1.01,
            mingjiao: 0.95,
            xuesha: 0.92,
            fenmai: 0.90,
            jueming: 0.88
        };
        var typeScale = {
            /** 击中按目标当前气血：全局削弱 99.9%（保留 0.1%） */
            onHit_enemyCurrHpPct: 0.001,
            /** 击中按目标已损失气血：全局削弱 99%（保留 1%） */
            onHit_enemyMissingHpPct: 0.0098,
            /** 击中按自身已损失气血：全局削弱 99%（保留 1%，原 0.95 再 ×0.01） */
            onHit_selfMissingHpPct: 0.0095,
            /** 击中按自身气血上限：全局削弱 99.9%（原 0.93 再 ×0.001） */
            onHit_selfHpMaxPct: 0.00093,
            onHit_flat: 0.92,
            /** 最终伤害：相对原系数 ×2 */
            onHit_damageMultPct: 1.84,
            onCrit_damageMultPct: 0.88,
            /** 每次命中力道 / 身法（脱战重置）：相对原系数 ×2 */
            onHit_stackAtk: 1.88,
            onHit_stackAtkSpd: 1.9,
            onHit_vampBonusPct: 0.92,
            /** 力道 / 会心 / 暴伤 / 吸血：相对原系数 ×3 */
            passive_atkPct: 2.85,
            passive_hpPct: 1.00,
            passive_defPct: 1.00,
            passive_critRate: 2.79,
            passive_critDmg: 2.64,
            passive_atkSpdPct: 0.95,
            passive_vamp: 2.76,
            dmgTakenReducePct: 0.86,
            /** 反噬：全局削弱 99%（保留 1%，原 0.90 再 ×0.01） */
            thornsPctOfTaken: 0.009
        };

        var p = PROFILES[sectId] || PROFILES.jianzhong;
        // 避免每 5 式机械重复：首词条按 phase 走，次词条按 tier+idx 交叉取位
        var primaryPair = p.style[phase];
        var altPhase = (phase * 2 + tier + (idx % 3)) % 5;
        var secondaryPair = p.style[altPhase];
        var pair = [primaryPair[0], secondaryPair[1]];
        if (pair[0] === pair[1]) {
            pair[1] = p.style[(altPhase + 1) % 5][1];
        }

        function valueFor(typeName) {
            var prog = 1 + idx * 0.08;
            var raw = 1;
            switch (typeName) {
                case "onHit_enemyCurrHpPct":
                    raw = (0.55 + tier * 0.22) * p.atk * PASSIVE_EFFECT_MULT + prog * 0.08;
                    break;
                case "onHit_enemyMissingHpPct":
                    raw = (0.5 + tier * 0.25) * p.burst * PASSIVE_EFFECT_MULT + prog * 0.09;
                    break;
                case "onHit_selfMissingHpPct":
                    raw = (0.22 + tier * 0.12) * p.burst * PASSIVE_EFFECT_MULT + prog * 0.05;
                    break;
                case "onHit_selfHpMaxPct":
                    raw = (0.55 + tier * 0.18) * (0.9 * p.atk + 0.5 * p.tank) * PASSIVE_EFFECT_MULT + prog * 0.06;
                    break;
                case "onHit_flat":
                    raw = (8 + tier * 5 + idx * 0.8) * p.atk * PASSIVE_EFFECT_MULT;
                    break;
                case "onHit_damageMultPct":
                    raw = (1.4 + tier * 0.55) * p.burst * PASSIVE_EFFECT_MULT + prog * 0.2;
                    break;
                case "onCrit_damageMultPct":
                    raw = (3.2 + tier * 1.2) * p.burst * PASSIVE_EFFECT_MULT + prog * 0.28;
                    break;
                case "onHit_stackAtk":
                    raw = (0.65 + tier * 0.3) * p.atk * PASSIVE_EFFECT_MULT + prog * 0.1;
                    break;
                case "onHit_stackAtkSpd":
                    raw = (0.0009 + tier * 0.00045) * p.speed * PASSIVE_EFFECT_MULT + idx * 0.00008;
                    break;
                case "onHit_vampBonusPct":
                    raw = (0.9 + tier * 0.4) * p.vamp * PASSIVE_EFFECT_MULT + prog * 0.12;
                    break;
                case "passive_atkPct":
                    raw = (0.75 + tier * 0.35) * p.atk * PASSIVE_EFFECT_MULT + prog * 0.14;
                    break;
                case "passive_hpPct":
                    raw = (0.95 + tier * 0.45) * p.tank * PASSIVE_EFFECT_MULT + prog * 0.12;
                    break;
                case "passive_defPct":
                    raw = (0.85 + tier * 0.38) * p.tank * PASSIVE_EFFECT_MULT + prog * 0.1;
                    break;
                case "passive_critRate":
                    raw = (0.35 + tier * 0.2) * p.burst * PASSIVE_EFFECT_MULT + prog * 0.06;
                    break;
                case "passive_critDmg":
                    raw = (2.8 + tier * 1.4) * p.burst * PASSIVE_EFFECT_MULT + prog * 0.36;
                    break;
                case "passive_atkSpdPct":
                    raw = (0.8 + tier * 0.36) * p.speed * PASSIVE_EFFECT_MULT + prog * 0.11;
                    break;
                case "passive_vamp":
                    raw = (0.24 + tier * 0.12) * p.vamp * PASSIVE_EFFECT_MULT + prog * 0.03;
                    break;
                case "dmgTakenReducePct":
                    raw = (1.1 + tier * 0.5) * p.tank * PASSIVE_EFFECT_MULT + prog * 0.18;
                    break;
                case "thornsPctOfTaken":
                    raw = (1.3 + tier * 0.65) * (0.9 * p.tank + 0.4 * p.atk) * PASSIVE_EFFECT_MULT + prog * 0.2;
                    break;
                default:
                    raw = 1;
                    break;
            }

            var sectMul = sectPower[sectId] || 1;
            var typeMul = typeScale[typeName] || 1;
            var val = raw * sectMul * typeMul;

            // 再加一层硬上限，避免后期叠加离谱
            switch (typeName) {
                case "dmgTakenReducePct":
                    val = clamp(val, 0, 23);
                    return r1(val);
                case "passive_vamp":
                    val = clamp(val, 0, 33);
                    return r2(val);
                case "onHit_vampBonusPct":
                    val = clamp(val, 0, 21);
                    return r1(val);
                case "passive_critRate":
                    val = clamp(val, 0, 33);
                    return r2(val);
                case "passive_critDmg":
                    val = clamp(val, 0, 87);
                    return r1(val);
                case "onCrit_damageMultPct":
                    val = clamp(val, 0, 31);
                    return r1(val);
                case "onHit_damageMultPct":
                    val = clamp(val, 0, 40);
                    return r1(val);
                case "onHit_stackAtkSpd":
                    val = clamp(val, 0, 0.038);
                    return r4(val);
                case "onHit_flat":
                    return Math.round(clamp(val, 1, 200));
                case "onHit_enemyCurrHpPct":
                    return r3(Math.max(0, val));
                case "onHit_enemyMissingHpPct":
                    return r3(Math.max(0, val));
                case "onHit_selfMissingHpPct":
                    return r3(Math.max(0, val));
                case "onHit_selfHpMaxPct":
                    return r3(Math.max(0, val));
                case "thornsPctOfTaken":
                    return r3(Math.max(0, val));
                default:
                    return typeName === "passive_vamp" || typeName === "passive_critRate"
                        ? r2(Math.max(0, val))
                        : r1(Math.max(0, val));
            }
        }

        function hasType(arr, typeName) {
            for (var k = 0; k < arr.length; k++) {
                if (arr[k].type === typeName) return true;
            }
            return false;
        }
        function scaledValue(typeName, factor) {
            var v = valueFor(typeName) * factor;
            switch (typeName) {
                case "onHit_stackAtkSpd":
                    return r4(v);
                case "passive_vamp":
                case "passive_critRate":
                    return r2(v);
                case "onHit_enemyCurrHpPct":
                case "onHit_enemyMissingHpPct":
                case "onHit_selfMissingHpPct":
                case "onHit_selfHpMaxPct":
                case "thornsPctOfTaken":
                    return r3(v);
                default:
                    return r1(v);
            }
        }
        function comboKey(arr) {
            var tps = [];
            for (var q = 0; q < arr.length; q++) tps.push(arr[q].type);
            tps.sort();
            return tps.join("|");
        }
        function pushUnique(arr, typeName, factor) {
            if (hasType(arr, typeName)) return false;
            arr.push({ type: typeName, value: scaledValue(typeName, factor) });
            return true;
        }

        // 全新门派专属池：不再共用同一套循环模板
        var sectPools = {
            jianzhong: ["onHit_enemyMissingHpPct", "onCrit_damageMultPct", "passive_critDmg", "passive_critRate", "onHit_damageMultPct", "passive_atkPct", "onHit_enemyCurrHpPct", "onHit_stackAtk"],
            juling: ["passive_hpPct", "passive_defPct", "dmgTakenReducePct", "thornsPctOfTaken", "onHit_selfHpMaxPct", "onHit_enemyCurrHpPct", "passive_atkPct", "onHit_damageMultPct"],
            kuanglan: ["onHit_stackAtk", "onHit_damageMultPct", "passive_atkPct", "passive_critDmg", "onCrit_damageMultPct", "onHit_enemyCurrHpPct", "onHit_enemyMissingHpPct", "passive_critRate"],
            wuxing: ["passive_atkSpdPct", "onHit_stackAtkSpd", "passive_critRate", "onHit_damageMultPct", "onHit_stackAtk", "onHit_enemyCurrHpPct", "passive_atkPct", "dmgTakenReducePct"],
            shengshi: ["passive_defPct", "passive_hpPct", "dmgTakenReducePct", "thornsPctOfTaken", "onHit_selfHpMaxPct", "passive_atkPct", "onHit_enemyCurrHpPct", "onHit_damageMultPct"],
            jihuan: ["thornsPctOfTaken", "dmgTakenReducePct", "onHit_selfMissingHpPct", "passive_defPct", "onHit_vampBonusPct", "passive_hpPct", "onHit_stackAtk", "onHit_enemyMissingHpPct"],
            hehuan: ["passive_vamp", "onHit_vampBonusPct", "passive_critRate", "passive_atkSpdPct", "onCrit_damageMultPct", "passive_critDmg", "onHit_enemyMissingHpPct", "onHit_damageMultPct"],
            xiaoyao: ["onHit_stackAtkSpd", "passive_atkSpdPct", "dmgTakenReducePct", "onHit_stackAtk", "passive_critRate", "passive_atkPct", "onHit_enemyCurrHpPct", "onHit_damageMultPct"],
            mingjiao: ["onHit_enemyCurrHpPct", "onHit_enemyMissingHpPct", "onCrit_damageMultPct", "passive_atkPct", "onHit_damageMultPct", "passive_critDmg", "onHit_stackAtk", "passive_critRate"],
            xuesha: ["passive_vamp", "onHit_enemyMissingHpPct", "onHit_vampBonusPct", "passive_atkPct", "passive_critRate", "onHit_selfMissingHpPct", "onHit_damageMultPct", "passive_critDmg"],
            fenmai: ["passive_critDmg", "passive_atkPct", "onHit_damageMultPct", "onCrit_damageMultPct", "onHit_selfMissingHpPct", "onHit_selfHpMaxPct", "passive_critRate", "onHit_enemyCurrHpPct"],
            jueming: ["onHit_enemyMissingHpPct", "passive_critRate", "onCrit_damageMultPct", "passive_atkPct", "onHit_selfMissingHpPct", "passive_critDmg", "onHit_damageMultPct", "onHit_enemyCurrHpPct"]
        };
        var allEffectTypes = [
            "onHit_enemyCurrHpPct", "onHit_enemyMissingHpPct", "onHit_selfMissingHpPct", "onHit_selfHpMaxPct",
            "onHit_damageMultPct", "onCrit_damageMultPct", "onHit_stackAtk", "onHit_stackAtkSpd",
            "onHit_vampBonusPct", "passive_atkPct", "passive_hpPct", "passive_defPct",
            "passive_critRate", "passive_critDmg", "passive_atkSpdPct", "passive_vamp",
            "dmgTakenReducePct", "thornsPctOfTaken"
        ];

        var pool = sectPools[sectId] || allEffectTypes;
        var out = [];
        // 起手两词条：沿用门派主风格，但换算成每式不同组合
        pushUnique(out, pair[0], 1);
        pushUnique(out, pair[1], 1);
        // 核心三词条：用不同步长取位，生成 25 式离散组合
        pushUnique(out, pool[(idx * 1 + tier + 1) % pool.length], 0.78);
        pushUnique(out, pool[(idx * 3 + phase + 2) % pool.length], 0.72);
        pushUnique(out, pool[(idx * 5 + tier + phase + 3) % pool.length], 0.66);
        // 里程碑再加一条，进一步拉开 5/10/15/20/25 体感
        if (phase === 4) {
            pushUnique(out, pool[(idx * 7 + tier + 1) % pool.length], 0.9);
        }
        // 三个极端门派保留自损换攻特色
        if (sectId === "xuesha" && (phase === 0 || phase === 2)) {
            out.push({ type: "passive_hpPct", value: -r1((2.0 + tier * 0.9) * 0.9) });
            pushUnique(out, "passive_vamp", 0.95);
        } else if (sectId === "fenmai" && (phase === 1 || phase === 3)) {
            out.push({ type: "passive_hpPct", value: -r1((2.7 + tier * 1.1) * 0.95) });
            pushUnique(out, "passive_critDmg", 0.92);
        } else if (sectId === "jueming" && (phase === 0 || phase === 4)) {
            out.push({ type: "passive_hpPct", value: -r1((3.0 + tier * 1.2) * 0.98) });
            pushUnique(out, "onHit_enemyMissingHpPct", 0.9);
        }

        // 硬性唯一：同门派若组合重复，持续补不同词条直到唯一
        var used = usedComboKeys || {};
        var key = comboKey(out);
        var guard = 0;
        while (used[key] && guard < allEffectTypes.length) {
            var tp = allEffectTypes[(idx * 11 + tier * 3 + guard) % allEffectTypes.length];
            if (pushUnique(out, tp, 0.58 + guard * 0.03)) {
                key = comboKey(out);
            }
            guard++;
        }
        used[key] = 1;
        return out;
    }

    var PATTERN_FLAVOR = [
        "【残势】借敌未溃之气血施压。",
        "【斩绝】敌伤越重，剑势越狠。",
        "【饮痛】己损愈多，反击愈烈。",
        "【岳势】以气血根基碾人。",
        "【点破】真元凝于一击之锐。",
        "【贯劲】劲道透体，层层叠加。",
        "【暴绽】会心之后再贯真劲。",
        "【叠劲】愈战愈勇，劲道自生。",
        "【连影】连绵不绝，身法愈疾。",
        "【根力】先天偏刚猛。",
        "【根血】先天偏绵长。",
        "【根守】先天偏不动。",
        "【根隙】先天偏寻破绽。",
        "【根烈】先天偏暴烈。",
        "【根疾】先天偏迅捷。",
        "【根噬】先天偏饮敌生机。",
        "【卸劲】先天偏化敌攻势。",
        "【反棘】受创反噬其身。",
        "【养战】出手间多吸一口生气。",
        "【双诀】残势与破绽并取。",
        "【追命】追击与点杀并存。",
        "【狂易】暴烈换身法迟滞。",
        "【攻守】叠劲与卸劲兼资。",
        "【棘壁】反噬与铁壁同存。",
        "【崩岳】血岳之势与贯劲并存。"
    ];

    function describeEffects(eff) {
        var out = [];
        function signed(v) {
            return (v >= 0 ? "+" : "") + v;
        }
        for (var i = 0; i < eff.length; i++) {
            var e = eff[i];
            switch (e.type) {
                case "onHit_enemyCurrHpPct":
                    out.push(
                        "击中时额外造成目标当前气血 " +
                            (typeof e.value === "number" && isFinite(e.value) ? e.value.toFixed(3) : e.value) +
                            "% 伤害"
                    );
                    break;
                case "onHit_enemyMissingHpPct":
                    out.push(
                        "击中时额外造成目标已损失气血 " +
                            (typeof e.value === "number" && isFinite(e.value) ? e.value.toFixed(3) : e.value) +
                            "% 的伤害"
                    );
                    break;
                case "onHit_selfMissingHpPct":
                    out.push(
                        "击中时额外造成等同于自身已损失气血 " +
                            (typeof e.value === "number" && isFinite(e.value) ? e.value.toFixed(3) : e.value) +
                            "% 的伤害"
                    );
                    break;
                case "onHit_selfHpMaxPct":
                    out.push(
                        "击中时额外造成自身气血上限 " +
                            (typeof e.value === "number" && isFinite(e.value) ? e.value.toFixed(3) : e.value) +
                            "% 的伤害"
                    );
                    break;
                case "onHit_flat": out.push("击中时额外造成 " + e.value + " 点固定伤害"); break;
                case "onHit_damageMultPct": out.push("最终伤害 +" + e.value + "%"); break;
                case "onCrit_damageMultPct": out.push("暴击时再提高 " + e.value + "% 伤害"); break;
                case "onHit_stackAtk": out.push("每次命中力道 +" + e.value + "（脱战重置）"); break;
                case "onHit_stackAtkSpd": out.push("每次命中身法 +" + e.value + "（脱战重置）"); break;
                case "passive_atkPct": out.push("力道 " + signed(e.value) + "%"); break;
                case "passive_hpPct": out.push("气血上限 " + signed(e.value) + "%"); break;
                case "passive_defPct": out.push("护体 " + signed(e.value) + "%"); break;
                case "passive_critRate": out.push("会心 " + signed(e.value) + "%"); break;
                case "passive_critDmg": out.push("暴伤 +" + e.value); break;
                case "passive_atkSpdPct": out.push("身法 " + signed(e.value) + "%"); break;
                case "passive_vamp": out.push("吸血 " + signed(e.value) + "%"); break;
                case "dmgTakenReducePct": out.push("受到的伤害 -" + e.value + "%"); break;
                case "thornsPctOfTaken":
                    out.push(
                        "将所受伤害的 " +
                            (typeof e.value === "number" && isFinite(e.value) ? e.value.toFixed(3) : e.value) +
                            "% 反噬给敌方"
                    );
                    break;
                case "onHit_vampBonusPct": out.push("本击吸血额外 +" + e.value + "%（按当次伤害结算）"); break;
                default: break;
            }
        }
        return out.join("；");
    }

    function tier(i) {
        return {
            reqLvl: Math.min(100, 1 + i * 4),
            cost: i === 0 ? 0 : Math.round(720 * Math.pow(1.27, i))
        };
    }

    var idPrefix = { jianzhong: "jx", juling: "jl", kuanglan: "kl", wuxing: "wx", shengshi: "ss", jihuan: "jh", hehuan: "hh", xiaoyao: "xy", mingjiao: "mj", xuesha: "xs", fenmai: "fm", jueming: "jm" };

    SECT_LIST.forEach(function (sect) {
        var usedComboKeys = {};
        for (var i = 0; i < 25; i++) {
            var t = tier(i);
            var pid = idPrefix[sect.id] + "_" + (i < 9 ? "0" : "") + (i + 1);
            var eff = effectsForTemplate(sect.id, i, usedComboKeys);
            PASSIVE_SKILLS.push({
                id: pid,
                sectId: sect.id,
                name: names[sect.id][i],
                flavor: PATTERN_FLAVOR[i],
                desc: PATTERN_FLAVOR[i] + describeEffects(eff),
                reqLvl: t.reqLvl,
                cost: t.cost,
                effects: eff
            });
        }
    });

    PASSIVE_SKILLS.forEach(function (s) {
        PASSIVE_BY_ID[s.id] = s;
    });
})();

var MAX_EQUIPPED_PASSIVES = 5;

function getSectById(sid) {
    for (var i = 0; i < SECT_LIST.length; i++) {
        if (SECT_LIST[i].id === sid) return SECT_LIST[i];
    }
    return null;
}

function getPassivesForSect(sid) {
    return PASSIVE_SKILLS.filter(function (p) { return p.sectId === sid; });
}

var PASSIVE_LEVEL_BONUS_PER_LEVEL = 0.2; // 每级 +20% 效果（相对 1 级基准）
var PASSIVE_LEVEL_MAX = 10; // 功法等级上限

function getEquippedPassiveBonusLevelMap() {
    var out = {};
    if (!player || !Array.isArray(player.equipped)) return out;
    for (var i = 0; i < player.equipped.length; i++) {
        var it = player.equipped[i];
        if (!it || !it.passiveBonus || !it.passiveBonus.id) continue;
        var pid = String(it.passiveBonus.id);
        var lv = Math.max(0, Math.floor(Number(it.passiveBonus.lvl) || 0));
        if (!lv) continue;
        out[pid] = (out[pid] || 0) + lv;
    }
    return out;
}

function getPassiveEffectiveLevel(pid) {
    if (!player || pid == null) return 0;
    var pidStr = String(pid);
    var learned = player.learnedPassives || [];
    var known = false;
    for (var li = 0; li < learned.length; li++) {
        if (String(learned[li]) === pidStr) {
            known = true;
            break;
        }
    }
    if (!known) return 0;
    var base = 1;
    if (player.learnedPassiveLevels && typeof player.learnedPassiveLevels === "object") {
        var rawBase = player.learnedPassiveLevels[pidStr];
        if (typeof rawBase !== "number") rawBase = player.learnedPassiveLevels[pid];
        if (typeof rawBase === "number") base = Math.max(1, Math.floor(rawBase));
    }
    var eqMap = getEquippedPassiveBonusLevelMap();
    var eqExtra = eqMap && typeof eqMap === "object" ? Math.max(0, Math.floor(Number(eqMap[pidStr] || eqMap[pid]) || 0)) : 0;
    return Math.min(PASSIVE_LEVEL_MAX, base + eqExtra);
}

function scalePassiveEffectValueByLevel(v, effLv) {
    if (effLv <= 1) return v;
    return v * (1 + (effLv - 1) * PASSIVE_LEVEL_BONUS_PER_LEVEL);
}

/** 与 describeEffects 相同取整规则，用于 UI 展示加成后的数值 */
function formatPassiveEffectDisplayValue(typeName, v) {
    if (typeName === "onHit_stackAtkSpd") return Math.round(v * 10000) / 10000;
    if (
        typeName === "onHit_enemyCurrHpPct" ||
        typeName === "onHit_enemyMissingHpPct" ||
        typeName === "onHit_selfMissingHpPct" ||
        typeName === "onHit_selfHpMaxPct" ||
        typeName === "thornsPctOfTaken"
    ) {
        return Math.round(v * 1000) / 1000;
    }
    if (typeName === "passive_vamp" || typeName === "passive_critRate") {
        return Math.round(v * 100) / 100;
    }
    if (typeName === "onHit_flat") return Math.round(v);
    return Math.round(v * 10) / 10;
}

/**
 * 按当前功法等级生成效果说明（与战斗聚合 scalePassiveEffectValueByLevel 一致）
 */
function describePassiveEffectsScaled(eff, effLv) {
    var lv = Math.max(1, Math.floor(Number(effLv) || 1));
    var out = [];
    function signed(v) {
        return (v >= 0 ? "+" : "") + v;
    }
    for (var i = 0; i < eff.length; i++) {
        var e = eff[i];
        var raw = scalePassiveEffectValueByLevel(e.value, lv);
        var v = formatPassiveEffectDisplayValue(e.type, raw);
        switch (e.type) {
            case "onHit_enemyCurrHpPct":
                out.push(
                    "击中时额外造成目标当前气血 " +
                        (typeof v === "number" && isFinite(v) ? v.toFixed(3) : v) +
                        "% 伤害"
                );
                break;
            case "onHit_enemyMissingHpPct":
                out.push(
                    "击中时额外造成目标已损失气血 " +
                        (typeof v === "number" && isFinite(v) ? v.toFixed(3) : v) +
                        "% 的伤害"
                );
                break;
            case "onHit_selfMissingHpPct":
                out.push(
                    "击中时额外造成等同于自身已损失气血 " +
                        (typeof v === "number" && isFinite(v) ? v.toFixed(3) : v) +
                        "% 的伤害"
                );
                break;
            case "onHit_selfHpMaxPct":
                out.push(
                    "击中时额外造成自身气血上限 " + (typeof v === "number" && isFinite(v) ? v.toFixed(3) : v) + "% 的伤害"
                );
                break;
            case "onHit_flat": out.push("击中时额外造成 " + v + " 点固定伤害"); break;
            case "onHit_damageMultPct": out.push("最终伤害 +" + v + "%"); break;
            case "onCrit_damageMultPct": out.push("暴击时再提高 " + v + "% 伤害"); break;
            case "onHit_stackAtk": out.push("每次命中力道 +" + v + "（脱战重置）"); break;
            case "onHit_stackAtkSpd": out.push("每次命中身法 +" + v + "（脱战重置）"); break;
            case "passive_atkPct": out.push("力道 " + signed(v) + "%"); break;
            case "passive_hpPct": out.push("气血上限 " + signed(v) + "%"); break;
            case "passive_defPct": out.push("护体 " + signed(v) + "%"); break;
            case "passive_critRate": out.push("会心 " + signed(v) + "%"); break;
            case "passive_critDmg": out.push("暴伤 +" + v); break;
            case "passive_atkSpdPct": out.push("身法 " + signed(v) + "%"); break;
            case "passive_vamp": out.push("吸血 " + signed(v) + "%"); break;
            case "dmgTakenReducePct": out.push("受到的伤害 -" + v + "%"); break;
            case "thornsPctOfTaken":
                out.push(
                    "将所受伤害的 " +
                        (typeof v === "number" && isFinite(v) ? v.toFixed(3) : v) +
                        "% 反噬给敌方"
                );
                break;
            case "onHit_vampBonusPct": out.push("本击吸血额外 +" + v + "%（按当次伤害结算）"); break;
            default: break;
        }
    }
    return out.join("；");
}

function aggregatePassiveStatBonuses(equippedIds) {
    var agg = { hpPct: 0, atkPct: 0, defPct: 0, atkSpdPct: 0, vamp: 0, critRate: 0, critDmg: 0, flatHp: 0, flatAtk: 0, flatDef: 0 };
    if (!equippedIds || !equippedIds.length) return agg;
    for (var i = 0; i < equippedIds.length; i++) {
        var def = PASSIVE_BY_ID[equippedIds[i]];
        if (!def) continue;
        var effLv = getPassiveEffectiveLevel(def.id);
        if (effLv <= 0) continue;
        for (var j = 0; j < def.effects.length; j++) {
            var e = def.effects[j];
            var ev = scalePassiveEffectValueByLevel(e.value, effLv);
            switch (e.type) {
                case "passive_hpPct": agg.hpPct += ev; break;
                case "passive_atkPct": agg.atkPct += ev; break;
                case "passive_defPct": agg.defPct += ev; break;
                case "passive_atkSpdPct": agg.atkSpdPct += ev; break;
                case "passive_vamp": agg.vamp += ev; break;
                case "passive_critRate": agg.critRate += ev; break;
                case "passive_critDmg": agg.critDmg += ev; break;
                case "passive_flatHp": agg.flatHp += ev; break;
                case "passive_flatAtk": agg.flatAtk += ev; break;
                case "passive_flatDef": agg.flatDef += ev; break;
                default: break;
            }
        }
    }
    return agg;
}

function aggregateCombatPassives(equippedIds) {
    var a = {
        onHit_enemyCurrHpPct: 0,
        onHit_enemyMissingHpPct: 0,
        onHit_selfMissingHpPct: 0,
        onHit_selfHpMaxPct: 0,
        onHit_flat: 0,
        onHit_damageMultPct: 0,
        onCrit_damageMultPct: 0,
        onHit_stackAtk: 0,
        onHit_stackAtkSpd: 0,
        onHit_vampBonusPct: 0,
        dmgTakenReducePct: 0,
        thornsPctOfTaken: 0
    };
    if (!equippedIds || !equippedIds.length) return a;
    for (var i = 0; i < equippedIds.length; i++) {
        var def = PASSIVE_BY_ID[equippedIds[i]];
        if (!def) continue;
        var effLv = getPassiveEffectiveLevel(def.id);
        if (effLv <= 0) continue;
        for (var j = 0; j < def.effects.length; j++) {
            var e = def.effects[j];
            var ev = scalePassiveEffectValueByLevel(e.value, effLv);
            switch (e.type) {
                case "onHit_enemyCurrHpPct": a.onHit_enemyCurrHpPct += ev; break;
                case "onHit_enemyMissingHpPct": a.onHit_enemyMissingHpPct += ev; break;
                case "onHit_selfMissingHpPct": a.onHit_selfMissingHpPct += ev; break;
                case "onHit_selfHpMaxPct": a.onHit_selfHpMaxPct += ev; break;
                case "onHit_flat": a.onHit_flat += ev; break;
                case "onHit_damageMultPct": a.onHit_damageMultPct += ev; break;
                case "onCrit_damageMultPct": a.onCrit_damageMultPct += ev; break;
                case "onHit_stackAtk": a.onHit_stackAtk += ev; break;
                case "onHit_stackAtkSpd": a.onHit_stackAtkSpd += ev; break;
                case "onHit_vampBonusPct": a.onHit_vampBonusPct += ev; break;
                case "dmgTakenReducePct": a.dmgTakenReducePct += ev; break;
                case "thornsPctOfTaken": a.thornsPctOfTaken += ev; break;
                default: break;
            }
        }
    }
    return a;
}

function getFirstPassiveIdForSect(sectId) {
    var list = getPassivesForSect(sectId);
    return list.length ? list[0].id : null;
}
