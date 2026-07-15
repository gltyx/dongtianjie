/**
 * 洞天劫 · 遗器神性词条：掉落、机缘放大（类灵根血脉）、战斗修正、此装备专属叠乘
 */
(function () {
    "use strict";

    var STAT_KEYS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

    var DIVINITY_ROLL_CHANCE = 0.1;
    var DIVINITY_MIN_PIN = 4;

    var DIVINITY_TIER_RANK = { blue: 1, purple: 2, pink: 3, orange: 4, red: 5 };
    var DIVINITY_TIER_ZH = { blue: "蓝色", purple: "紫色", pink: "粉色", orange: "橙色", red: "红色" };
    var DIVINITY_TIER_CLASS = {
        blue: "dt-div-blue",
        purple: "dt-div-purple",
        pink: "dt-div-pink",
        orange: "dt-div-orange",
        red: "dt-div-red",
    };

    var DIVINITY_COLOR_ODDS_BY_PIN = {
        4: [{ tier: "blue", p: 1 }],
        5: [{ tier: "blue", p: 0.9 }, { tier: "purple", p: 0.1 }],
        6: [{ tier: "blue", p: 0.8 }, { tier: "purple", p: 0.15 }, { tier: "pink", p: 0.05 }],
        7: [{ tier: "blue", p: 0.7 }, { tier: "purple", p: 0.2 }, { tier: "pink", p: 0.1 }],
        8: [
            { tier: "blue", p: 0.6 },
            { tier: "purple", p: 0.23 },
            { tier: "pink", p: 0.15 },
            { tier: "orange", p: 0.02 },
        ],
        9: [
            { tier: "blue", p: 0.5 },
            { tier: "purple", p: 0.3 },
            { tier: "pink", p: 0.15 },
            { tier: "orange", p: 0.04 },
            { tier: "red", p: 0.01 },
        ],
        10: [{ tier: "purple", p: 0.8 }, { tier: "pink", p: 0.15 }, { tier: "orange", p: 0.05 }],
        11: [{ tier: "orange", p: 0.9 }, { tier: "red", p: 0.1 }],
    };

    function aff(id, name, tier, text, fx, perItem) {
        return { id: id, name: name, tier: tier, text: text, perItem: !!perItem, fx: fx || {} };
    }

    var DIVINITY_AFFIX_BY_ID = {};
    var DIVINITY_AFFIXES_BY_TIER = { blue: [], purple: [], pink: [], orange: [], red: [] };

    function reg(entry) {
        DIVINITY_AFFIX_BY_ID[entry.id] = entry;
        if (DIVINITY_AFFIXES_BY_TIER[entry.tier]) DIVINITY_AFFIXES_BY_TIER[entry.tier].push(entry);
    }

    [
        aff("lie_dao_ke", "烈刀客", "blue", "总力道加成20%。", { atkPct: 20 }),
        aff("zhan_feng_wei", "斩锋卫", "blue", "总爆伤加成10%。", { critDmgPct: 10 }),
        aff("lie_xiong_tu", "猎凶徒", "blue", "总气血减10%力道加30%。", { hpPct: -10, atkPct: 30 }),
        aff("gu_dun_zu", "固盾卒", "blue", "总护体加50%，攻击格外附带100%护体值伤害（此伤害无法暴击）。", { defPct: 50, extraDefDmgPct: 100 }),
        aff("pan_shi_wei", "磐石卫", "blue", "总护体加100%。", { defPct: 100 }),
        aff("zhong_kai_bing", "重铠兵", "blue", "总爆伤加成5%总护体10%。", { critDmgPct: 5, defPct: 10 }),
        aff("zhen_guan_tu", "镇关徒", "blue", "总吸血加15%。", { vampPct: 15 }),
        aff("bao_shi_shang_ren", "宝石商人", "blue", "此装备的宝石效果提升20%。", { gemBoostPct: 20 }, true),
        aff("fan_ti", "凡体", "blue", "斗法受到的伤害降低5%。", { dmgTakenReducePct: 5 }),
        aff("fan_bing", "凡兵", "blue", "此装备的属性效果提升10%。", { itemStatBoostPct: 10 }, true),
        aff("zhong_jia_jing_tong", "重甲精通", "blue", "身上如果有穿戴重甲总护体加200%。", { needArmorClass: "Heavy", defPct: 200 }),
        aff("qing_jia_jing_tong", "轻甲精通", "blue", "身上如果有穿戴轻甲总身法加20%。", { needArmorClass: "Light", atkSpdPct: 20 }),
        aff("bu_jia_jing_tong", "布甲精通", "blue", "身上如果有穿戴布甲总气血加30%。", { needArmorClass: "Cloth", hpPct: 30 }),
        aff("ban_jia_jing_tong", "板甲精通", "blue", "身上如果有穿戴板甲总爆伤加20%。", { needArmorClass: "Plate", critDmgPct: 20 }),
        aff("pi_jia_jing_tong", "皮甲精通", "blue", "身上如果有穿戴皮甲总力道加30%。", { needArmorClass: "Leather", atkPct: 30 }),
        aff("xi_gua_dao", "西瓜刀", "blue", "根据玩家当前等级增加总力道每级0.1%。", { atkPerPlayerLvl: 0.1 }),
        aff("tie_guo", "铁锅", "blue", "根据玩家当前等级增加总力道每级0.5%。", { atkPerPlayerLvl: 0.5 }),
        aff("po_jia", "破甲", "blue", "攻击怪物无视敌人10%护体。", { armorPenPct: 10 }),
        aff("jian_yi", "简易", "blue", "当前此装备穿戴等级需求直接降低5级。", { wearLvlReduce: 5 }, true),
        aff("wo_shi_ni_ge", "我是你哥", "blue", "总力道护体气血加成10%。", { atkPct: 10, defPct: 10, hpPct: 10 }),
        aff("ai_yo_ni_gan_ma", "哎呦你干嘛", "blue", "总爆伤身法加成5%。", { critDmgPct: 5, atkSpdPct: 5 }),
        aff("xia_ke", "侠客", "blue", "如果武器佩戴剑短刺镰刀之一总力道护体加成50%。", { needWeaponCats: ["Sword", "Dagger", "Scythe"], atkPct: 50, defPct: 50 }),
        aff("tu_fu", "屠夫", "blue", "如果武器佩戴巨斧链锤重锤之一总力道护体气血加成20%。", { needWeaponCats: ["Axe", "Flail", "Hammer"], atkPct: 20, defPct: 20, hpPct: 20 }),
        aff("ni_ye_xiu_xian", "你也修仙", "blue", "总爆伤加成5%总气血加成10%总护体加成20%总力道加成10%。", { critDmgPct: 5, hpPct: 10, defPct: 20, atkPct: 10 }),
        aff("xin_shou_cun_yi_ge", "新手村一哥", "blue", "总气血加成50%总力道加成30%护体加成50%。", { hpPct: 50, atkPct: 30, defPct: 50 }),
        aff("xiu_xian_jue", "修仙决", "blue", "所有门派功法加1级。", { sectPassiveLvl: 1 }),
        aff("duan_shan_kuang_ren", "断山狂刃", "purple", "总力道加成50%", { atkPct: 50 }),
        aff("fen_ye_zhan_hao", "焚野战豪", "purple", "总爆伤加成20%", { critDmgPct: 20 }),
        aff("sui_feng_lie_ying", "碎风猎影", "purple", "总气血减20%力道加100%。", { hpPct: -20, atkPct: 100 }),
        aff("cui_cheng_han_jiang", "摧城悍将", "purple", "攻击怪物无视敌人10%护体", { armorPenPct: 10 }),
        aff("zhen_yue_jian_jia", "镇岳坚甲", "purple", "斗法怪物攻击减少10%", { enemyAtkReducePct: 10 }),
        aff("suo_cheng_tie_bi", "锁城铁壁", "purple", "总气血增加50%", { hpPct: 50 }),
        aff("chen_yan_shou_jiang", "沉岩守将", "purple", "总护体加150%，攻击格外附带300%护体值伤害（此伤害无法暴击）。", { defPct: 150, extraDefDmgPct: 300 }),
        aff("jie_jiang_dun_hao", "截江盾豪", "purple", "总护体加300%。", { defPct: 300 }),
        aff("bao_shi_da_ren", "宝石达人", "purple", "此装备的宝石效果提升30%。", { gemBoostPct: 30 }, true),
        aff("dao_bing", "道兵", "purple", "此装备的属性效果提升20%。", { itemStatBoostPct: 20 }, true),
        aff("dao_ti", "道体", "purple", "斗法受到的伤害降低8%。", { dmgTakenReducePct: 8 }),
        aff("jian_jing_tong", "剑精通", "purple", "身上如果有穿戴武器剑总力道加150%。", { needWeaponCat: "Sword", atkPct: 150 }),
        aff("ju_fu_jing_tong", "巨斧精通", "purple", "身上如果有穿戴武器巨斧总力道加50%总护体加50%总气血10%。", { needWeaponCat: "Axe", atkPct: 50, defPct: 50, hpPct: 10 }),
        aff("zhong_chui_jing_tong", "重锤精通", "purple", "身上如果有穿戴武器重锤总力道加50%总气血加20%总护甲加50%。", { needWeaponCat: "Hammer", atkPct: 50, defPct: 50, hpPct: 20 }),
        aff("duan_ci_jing_tong", "短刺精通", "purple", "身上如果有穿戴武器短刺总力道加80%总爆伤加10%总身法10%。", { needWeaponCat: "Dagger", atkPct: 80, critDmgPct: 10, atkSpdPct: 10 }),
        aff("lian_chui_jing_tong", "链锤精通", "purple", "身上如果有穿戴武器链锤总力道加30%总护甲加50%总气血加30%。", { needWeaponCat: "Flail", atkPct: 30, defPct: 50, hpPct: 30 }),
        aff("lian_dao_jing_tong", "镰刀精通", "purple", "身上如果有穿戴武器镰刀总力道加60%总气血加20%总身法加10%。", { needWeaponCat: "Scythe", atkPct: 60, hpPct: 20, atkSpdPct: 10 }),
        aff("fa_zhang_jing_tong", "法杖精通", "purple", "身上如果有穿戴武器法杖总力道加130%总气血加10%。", { needWeaponCat: "Staff", atkPct: 130, hpPct: 10 }),
        aff("zhe_shan_jing_tong", "折扇精通", "purple", "身上如果有穿戴武器折扇总力道加50%总气血加20%总身法加10%总爆伤加10%。", { needWeaponCat: "Fan", atkPct: 50, hpPct: 20, atkSpdPct: 10, critDmgPct: 10 }),
        aff("qiang_jing_tong", "枪精通", "purple", "身上如果有穿戴武器枪总力道加125%总护甲加50%总气血10%。", { needWeaponCat: "Spear", atkPct: 125, defPct: 50, hpPct: 10 }),
        aff("shuang_feng_jing_tong", "双锋精通", "purple", "身上如果有穿戴武器双锋总力道加100%总爆伤加20%。", { needWeaponCat: "Blade", atkPct: 100, critDmgPct: 20 }),
        aff("ji_jing_tong", "戟精通", "purple", "身上如果有穿戴武器戟总力道加100%总身法加20%。", { needWeaponCat: "Glaive", atkPct: 100, atkSpdPct: 20 }),
        aff("chang_bian_jing_tong", "长鞭精通", "purple", "身上如果有穿戴武器长鞭总力道加80%总爆伤加10%身法10%。", { needWeaponCat: "Whip", atkPct: 80, critDmgPct: 10, atkSpdPct: 10 }),
        aff("fa_xiang_zhi_li", "法相之力", "purple", "根据玩家秘境历史最高层增加总力道护体气血每层1%。", { atkPerMaxFloor: 1, defPerMaxFloor: 1, hpPerMaxFloor: 1 }),
        aff("li_wang", "力王", "purple", "根据玩家秘境历史最高层增加总力道每层3%。", { atkPerMaxFloor: 3 }),
        aff("shi_jing_sui_zhuang", "十境随装", "purple", "当前此装备穿戴等级需求直接降低10级。", { wearLvlReduce: 10 }, true),
        aff("yi_dao_kan_da_dong_mai", "一刀砍到大动脉", "purple", "总力道加成40%总爆伤加成20%。", { atkPct: 40, critDmgPct: 20 }),
        aff("wei_jin_gu_bang", "伪金箍棒", "purple", "总爆伤加成20%总气血加成50%。", { critDmgPct: 20, hpPct: 50 }),
        aff("meng_mian_you_xia", "蒙面游侠", "purple", "如果武器佩戴法杖长鞭折扇之一总力道护体气血加成80%。", { needWeaponCats: ["Staff", "Whip", "Fan"], atkPct: 80, defPct: 80, hpPct: 80 }),
        aff("qing_long", "青龙", "purple", "总力道加成100%总护体加成200%。", { atkPct: 100, defPct: 200 }),
        aff("bai_hu", "白虎", "purple", "总力道加成150%。", { atkPct: 150 }),
        aff("zhu_que", "朱雀", "purple", "总气血加成100%。", { hpPct: 100 }),
        aff("xuan_wu", "玄武", "purple", "总护甲加成400%。", { defPct: 400 }),
        aff("qi_lin", "麒麟", "purple", "总力道加成50%总护体加成100%总气血加成50%总爆伤加成10%总身法加成10%。", { atkPct: 50, defPct: 100, hpPct: 50, critDmgPct: 10, atkSpdPct: 10 }),
        aff("zhen_zhong_jia_jing_tong", "真重甲精通", "purple", "身上如果有穿戴重甲总护体加500%。", { needArmorClass: "Heavy", defPct: 500 }),
        aff("zhen_qing_jia_jing_tong", "真轻甲精通", "purple", "身上如果有穿戴轻甲总身法加50%。", { needArmorClass: "Light", atkSpdPct: 50 }),
        aff("zhen_bu_jia_jing_tong", "真布甲精通", "purple", "身上如果有穿戴布甲总气血加120%。", { needArmorClass: "Cloth", hpPct: 120 }),
        aff("zhen_ban_jia_jing_tong", "真板甲精通", "purple", "身上如果有穿戴板甲总爆伤加50%。", { needArmorClass: "Plate", critDmgPct: 50 }),
        aff("zhen_pi_jia_jing_tong", "真皮甲精通", "purple", "身上如果有穿戴皮甲总力道加170%。", { needArmorClass: "Leather", atkPct: 170 }),
        aff("er_shi_jing_sui_zhuang", "二十境随装", "purple", "当前此装备穿戴等级需求直接降低20级。", { wearLvlReduce: 20 }, true),
        aff("san_shi_jing_sui_zhuang", "三十境随装", "purple", "当前此装备穿戴等级需求直接降低30级。", { wearLvlReduce: 30 }, true),
        aff("kui_hua_bao_dian", "葵花宝典", "purple", "所有门派功法加1级，总力道加成50%。", { sectPassiveLvl: 1, atkPct: 50 }),
        aff("jiang_long_shi_ba_zhang", "降龙十八掌", "purple", "所有门派功法加1级，总爆伤加成20%。", { sectPassiveLvl: 1, critDmgPct: 20 }),
        aff("wo_yao_tao_pao", "我要逃跑了", "purple", "所有门派功法加1级，总身法加成20%。", { sectPassiveLvl: 1, atkSpdPct: 20 }),
        aff("zhu_shen_lu", "诸神录", "purple", "所有门派功法加1级，总气血加成50%。", { sectPassiveLvl: 1, hpPct: 50 }),
        aff("ling_guang_zha_xian", "灵光乍现", "purple", "根据玩家当前等级增加总气血每级0.2%。", { hpPerPlayerLvl: 0.2 }),
        aff("jing_ling_shi_jian_wu", "精灵使的剑舞", "purple", "根据玩家当前等级增加总力道护体每级0.5%。", { atkPerPlayerLvl: 0.5, defPerPlayerLvl: 0.5 }),
        aff("zhu_qian_xiao", "诛千枭", "pink", "总力道加成150%。", { atkPct: 150 }),
        aff("lie_chuan_sha_zhu", "裂川煞主", "pink", "总爆伤加成30%。", { critDmgPct: 30 }),
        aff("xue_fu_ba_huang", "血覆八荒", "pink", "总气血减30%力道加200%。", { hpPct: -30, atkPct: 200 }),
        aff("wan_di_duan_hun", "万敌断魂", "pink", "总身法加30%。", { atkSpdPct: 30 }),
        aff("qian_feng_bu_qin", "千锋不侵", "pink", "攻击怪物无视敌人15%护体。", { armorPenPct: 15 }),
        aff("cang_lan_bi_lei", "沧澜壁垒", "pink", "斗法怪物攻击减少10%。", { enemyAtkReducePct: 10 }),
        aff("wan_ren_nan_shang", "万刃难伤", "pink", "总护体加成800%。", { defPct: 800 }),
        aff("jue_yu_shou_zhu", "绝域守主", "pink", "总护体加250%，攻击格外附带500%护体值伤害（此伤害无法暴击）。", { defPct: 250, extraDefDmgPct: 500 }),
        aff("bao_shi_da_heng", "宝石大亨", "pink", "此装备的宝石效果提升50%。", { gemBoostPct: 50 }, true),
        aff("ling_ti", "灵体", "pink", "斗法受到的伤害降低10%。", { dmgTakenReducePct: 10 }),
        aff("shou_wu_fu_ji", "手无缚鸡之力", "pink", "身上如果没有穿戴武器总力道加500%。", { missingSlot: "Weapon", atkPct: 500 }),
        aff("wo_mei_chuan_yi_fu", "我没穿衣服", "pink", "身上如果没有穿戴护甲总护体加700%。", { missingSlot: "Armor", defPct: 700 }),
        aff("wo_de_dun_pai_ne", "我的盾牌呢", "pink", "身上如果没有穿戴盾牌总气血加100%。", { missingSlot: "Shield", hpPct: 100 }),
        aff("wo_de_tou_kui_bu_jian", "我的头盔不见了", "pink", "身上如果没有穿戴头盔总力道加50%总气血加50%。", { missingSlot: "Helmet", atkPct: 50, hpPct: 50 }),
        aff("jie_hun_jie_zhi_diushi", "结婚戒指丢失", "pink", "身上如果没有穿戴戒指总爆伤加50%。", { missingSlot: "Ring", critDmgPct: 50 }),
        aff("xiang_lian_lao_yeye", "项链里的老爷爷", "pink", "身上如果没有穿戴项链总身法加40%。", { missingSlot: "Necklace", atkSpdPct: 40 }),
        aff("ling_bing", "灵兵", "pink", "此装备的属性效果提升40%（强化附魔一样效果）。", { itemStatBoostPct: 40 }, true),
        aff("cang_yuan_tu_ling_jue", "沧渊屠灵决", "pink", "所有门派功法加2级。", { sectPassiveLvl: 2 }),
        aff("jiang_wu_shi_jing", "降五十境", "pink", "当前此装备穿戴等级需求直接降低50级。", { wearLvlReduce: 50 }, true),
        aff("wo_xiang_chi_dou_fu", "我想吃你豆腐", "pink", "总吸血加成30%总气血加成100%总护体加成400%。", { vampPct: 30, hpPct: 100, defPct: 400 }),
        aff("liu_shi_jing_sui_zhuang", "六十境随装", "pink", "当前此装备穿戴等级需求直接降低60级。", { wearLvlReduce: 60 }, true),
        aff("ba_shi_jing_sui_zhuang", "八十境随装", "pink", "当前此装备穿戴等级需求直接降低80级。", { wearLvlReduce: 80 }, true),
        aff("qiang_mo", "枪魔", "pink", "身上如果有穿戴武器枪总力道加130%总护甲加350%总气血40%。", { needWeaponCat: "Spear", atkPct: 130, defPct: 350, hpPct: 40 }),
        aff("fa_shen", "法神", "pink", "身上如果有穿戴武器法杖总力道加200%总气血加50%。", { needWeaponCat: "Staff", atkPct: 200, hpPct: 50 }),
        aff("jian_shen", "剑神", "pink", "身上如果有穿戴武器剑总力道加300%。", { needWeaponCat: "Sword", atkPct: 300 }),
        aff("fu_shen", "斧神", "pink", "身上如果有穿戴武器巨斧总力道加100%总护体加450%总气血60%。", { needWeaponCat: "Axe", atkPct: 100, defPct: 450, hpPct: 60 }),
        aff("chui_shen", "锤神", "pink", "身上如果有穿戴武器重锤总力道加80%总气血加100%总护甲加350%。", { needWeaponCat: "Hammer", atkPct: 80, hpPct: 100, defPct: 350 }),
        aff("an_ying_ci_ke", "暗影刺客", "pink", "身上如果有穿戴武器短刺总力道加180%总爆伤加30%总身法30%。", { needWeaponCat: "Dagger", atkPct: 180, critDmgPct: 30, atkSpdPct: 30 }),
        aff("tie_jiang_shen", "铁匠神", "pink", "身上如果有穿戴武器链锤总力道加60%总护甲加550%总气血加80%。", { needWeaponCat: "Flail", atkPct: 60, defPct: 550, hpPct: 80 }),
        aff("si_shen", "死神", "pink", "身上如果有穿戴武器镰刀总力道加200%总气血加60%总身法加30%。", { needWeaponCat: "Scythe", atkPct: 200, hpPct: 60, atkSpdPct: 30 }),
        aff("xiao_yao_xian", "逍遥仙", "pink", "身上如果有穿戴武器折扇总力道加150%总气血加80%总身法加20%总爆伤加20%。", { needWeaponCat: "Fan", atkPct: 150, hpPct: 80, atkSpdPct: 20, critDmgPct: 20 }),
        aff("shuang_feng_ge", "双锋哥", "pink", "身上如果有穿戴武器双锋总力道加200%总爆伤加40%。", { needWeaponCat: "Blade", atkPct: 200, critDmgPct: 40 }),
        aff("lv_bu", "吕布", "pink", "身上如果有穿戴武器戟总力道加210%总身法加40%。", { needWeaponCat: "Glaive", atkPct: 210, atkSpdPct: 40 }),
        aff("bai_gu_jing", "白骨精", "pink", "身上如果有穿戴武器长鞭总力道加150%总爆伤加30%总身法30%。", { needWeaponCat: "Whip", atkPct: 150, critDmgPct: 30, atkSpdPct: 30 }),
        aff("er_ge_san_bai_shou", "儿歌三百首", "pink", "所有门派功法加2级，总气血加成100%。", { sectPassiveLvl: 2, hpPct: 100 }),
        aff("liu_yun_jue", "流云诀", "pink", "所有门派功法加2级，总爆伤加成30%。", { sectPassiveLvl: 2, critDmgPct: 30 }),
        aff("ba_ti_zhu_shen_jue", "霸体诛神诀", "pink", "所有门派功法加2级，总力道加成150%。", { sectPassiveLvl: 2, atkPct: 150 }),
        aff("wo_chao_meng_de", "我超猛的", "pink", "总气血加成80%总力道加成80%总护体加成480%。", { hpPct: 80, atkPct: 80, defPct: 480 }),
        aff("pi_ni_gua", "劈你瓜", "pink", "根据玩家当前等级增加总力道每级0.8%。", { atkPerPlayerLvl: 0.8 }),
        aff("wo_de_zi_dian_mei_gong_ji", "我的字典没有攻击", "pink", "根据玩家当前等级增加总护体每级2%。", { defPerPlayerLvl: 2 }),
        aff("ni_shi_xiu_luo", "逆世修罗", "orange", "总力道加250%。", { atkPct: 250 }),
        aff("feng_tian_zhan_xiao", "封天战枭", "orange", "总爆伤加50%。", { critDmgPct: 50 }),
        aff("jin_mie_cang_sheng", "烬灭苍生", "orange", "总气血减30%力道加1000%。", { hpPct: -30, atkPct: 1000 }),
        aff("gu_feng_zhen_yu", "孤锋镇域", "orange", "总吸血加50%。", { vampPct: 50 }),
        aff("heng_gu_xuan_jia", "亘古玄甲", "orange", "总护体加500%，攻击格外附带1000%护体值伤害（此伤害无法暴击）。", { defPct: 500, extraDefDmgPct: 1000 }),
        aff("jie_yu_bi_lei", "界域壁垒", "orange", "攻击怪物无视敌人18%护体。", { armorPenPct: 18 }),
        aff("cang_yuan_shou_xiao", "苍原守枭", "orange", "总护甲加1000%。", { defPct: 1000 }),
        aff("ba_huang_fen_yuan_jue", "八荒焚元决", "orange", "所有门派功法加3级。", { sectPassiveLvl: 3 }),
        aff("bao_shi_zun_zhe", "宝石尊者", "orange", "此装备的宝石效果提升100%。", { gemBoostPct: 100 }, true),
        aff("mei_huo_ti", "魅惑体", "orange", "斗法怪物攻击减少15%。", { enemyAtkReducePct: 15 }),
        aff("sheng_ti", "圣体", "orange", "斗法受到的伤害降低12%。", { dmgTakenReducePct: 12 }),
        aff("sheng_bing", "圣兵", "orange", "此装备的属性效果提升100%（强化附魔一样效果）。", { itemStatBoostPct: 100 }, true),
        aff("bai_jing_wu_shu", "百境无束", "orange", "当前此装备穿戴等级需求直接降低100级。", { wearLvlReduce: 100 }, true),
        aff("ba_huang_zhi_jing_wo_wei_wang", "八荒之境我为王", "orange", "所有门派功法加3级，总力道300%。", { sectPassiveLvl: 3, atkPct: 300 }),
        aff("feng_tian_cheng_yun", "奉天承运", "orange", "所有门派功法加3级，总爆伤加成50%。", { sectPassiveLvl: 3, critDmgPct: 50 }),
        aff("zhen_jin_gu_bang", "真金箍棒", "orange", "总爆伤加成60%总气血加成150%。", { critDmgPct: 60, hpPct: 150 }),
        aff("shen_wang_jin", "神王烬", "orange", "所有门派功法加3级，总护体加成700%。", { sectPassiveLvl: 3, defPct: 700 }),
        aff("tai_jing_pi_xiu", "钛晶貔貅", "orange", "身上如果有穿戴重甲总护体加1500%。", { needArmorClass: "Heavy", defPct: 1500 }),
        aff("yin_xing_de_chi_bang", "隐形的翅膀", "orange", "总身法加成100%总爆伤加成100%。", { atkSpdPct: 100, critDmgPct: 100 }),
        aff("yi_bai_er_jing_sui_zhuang", "一百二境随装", "orange", "当前此装备穿戴等级需求直接降低120级。", { wearLvlReduce: 120 }, true),
        aff("yi_bai_wu_jing_sui_zhuang", "一百五境随装", "orange", "当前此装备穿戴等级需求直接降低150级。", { wearLvlReduce: 150 }, true),
        aff("zhi_zun_shen_jun", "至尊神君", "orange", "总力道加成400%。", { atkPct: 400 }),
        aff("du_jin_xiang_lian", "镀金项链", "orange", "总吸血50%总爆伤100%总身法50%。", { vampPct: 50, critDmgPct: 100, atkSpdPct: 50 }),
        aff("wei_lai_bao_ding", "未来宝鼎", "orange", "总护体1000%总气血150%。", { defPct: 1000, hpPct: 150 }),
        aff("yan_chu_fa_sui", "言出法随", "orange", "根据玩家秘境历史最高层增加总力道护体气血每层2%。", { atkPerMaxFloor: 2, defPerMaxFloor: 2, hpPerMaxFloor: 2 }),
        aff("wan_shen_jie_yun", "万神皆陨", "red", "总力道加500%。", { atkPct: 500 }),
        aff("cai_jue_huang_gu", "裁决荒古", "red", "总爆伤加100%。", { critDmgPct: 100 }),
        aff("wu_shen_qu", "武神躯", "red", "根据玩家秘境历史最高层增加总力道护体气血每层3%。", { atkPerMaxFloor: 3, defPerMaxFloor: 3, hpPerMaxFloor: 3 }),
        aff("shen_wang", "神王", "red", "根据玩家秘境历史最高层增加总力道每层10%。", { atkPerMaxFloor: 10 }),
        aff("xian_wang", "仙王", "red", "根据玩家秘境历史最高层增加总气血每层5%。", { hpPerMaxFloor: 5 }),
        aff("zhu_tian_yu_zun", "诸天御尊", "red", "总气血减50%力道加1000%。", { hpPct: -50, atkPct: 1000 }),
        aff("dao_jie_shen_kai", "道界神铠", "red", "总护体加1000%，攻击格外附带5000%护体值伤害（此伤害无法暴击）。", { defPct: 1000, extraDefDmgPct: 5000 }),
        aff("yuan_shi_duan_sheng_jue", "元始断圣决", "red", "所有门派功法加4级。", { sectPassiveLvl: 4 }),
        aff("xiu_luo_wu_shen", "修罗武神", "red", "攻击怪物无视敌人20%护体。", { armorPenPct: 20 }),
        aff("shen_bing", "神兵", "red", "此装备的属性效果提升150%（强化附魔一样效果）。", { itemStatBoostPct: 150 }, true),
        aff("shen_ti", "神体", "red", "斗法受到的伤害降低15%。", { dmgTakenReducePct: 15 }),
        aff("bao_shi_shen_qi", "宝石神器", "red", "此装备的宝石效果提升200%。", { gemBoostPct: 200 }, true),
        aff("wan_jie_ke_xie", "万阶可携", "red", "当前此装备穿戴等级需求降低10000级。", { wearLvlReduce: 10000 }, true),
    ].forEach(reg);

    function emptyAttrs() {
        var o = {};
        for (var i = 0; i < STAT_KEYS.length; i++) o[STAT_KEYS[i]] = 0;
        return o;
    }

    function emptyCombatMods() {
        return {
            armorPenPct: 0,
            enemyAtkReducePct: 0,
            dmgTakenReducePct: 0,
            extraDefDmgPct: 0,
            sectPassiveLvl: 0,
        };
    }

    function getDivinityAffixDef(id) {
        if (!id) return null;
        return DIVINITY_AFFIX_BY_ID[String(id)] || null;
    }

    function getPinFromEquipment(equipment) {
        if (!equipment || !equipment.rarity) return 0;
        if (typeof getEquipmentRarityTierIndex === "function") {
            return getEquipmentRarityTierIndex(equipment.rarity) + 1;
        }
        return 0;
    }

    function rollDivinityColorTier(pin) {
        var p = Math.max(4, Math.min(11, Math.floor(Number(pin) || 4)));
        var table = DIVINITY_COLOR_ODDS_BY_PIN[p] || DIVINITY_COLOR_ODDS_BY_PIN[4];
        var r = Math.random();
        var acc = 0;
        for (var i = 0; i < table.length; i++) {
            acc += table[i].p;
            if (r <= acc) return table[i].tier;
        }
        return table[table.length - 1].tier;
    }

    function pickDivinityAffixForTier(tier) {
        var pool = DIVINITY_AFFIXES_BY_TIER[tier];
        if (!pool || !pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    window.maybeRollEquipmentDivinityAffix = function (equipment) {
        if (!equipment) return;
        var pin = getPinFromEquipment(equipment);
        if (pin < DIVINITY_MIN_PIN) return;
        if (Math.random() >= DIVINITY_ROLL_CHANCE) return;
        var colorTier = rollDivinityColorTier(pin);
        var picked = pickDivinityAffixForTier(colorTier);
        if (!picked) return;
        equipment.divinity = {
            id: picked.id,
            name: picked.name,
            tier: picked.tier,
            text: picked.text,
        };
    };

    function inferItemArmorClass(item) {
        if (!item) return null;
        if (item.armorClass) return item.armorClass;
        if (typeof inferArmorClass === "function") return inferArmorClass(item);
        return null;
    }

    function hasEquippedType(equipped, type) {
        if (!equipped || !type) return false;
        for (var i = 0; i < equipped.length; i++) {
            var it = equipped[i];
            if (it && it.type === type) return true;
        }
        return false;
    }

    function hasEquippedWeaponCategory(equipped, cat) {
        if (!equipped || !cat) return false;
        for (var i = 0; i < equipped.length; i++) {
            var it = equipped[i];
            if (it && it.type === "Weapon" && it.category === cat) return true;
        }
        return false;
    }

    function hasEquippedAnyWeaponCategory(equipped, cats) {
        if (!equipped || !cats || !cats.length) return false;
        for (var c = 0; c < cats.length; c++) {
            if (hasEquippedWeaponCategory(equipped, cats[c])) return true;
        }
        return false;
    }

    function hasEquippedArmorClass(equipped, armorClass) {
        if (!equipped || !armorClass) return false;
        for (var i = 0; i < equipped.length; i++) {
            var it = equipped[i];
            if (it && it.type === "Armor" && inferItemArmorClass(it) === armorClass) return true;
        }
        return false;
    }

    function getPlayerMaxDungeonFloor() {
        if (typeof player !== "undefined" && player && typeof player.maxDungeonFloor === "number" && isFinite(player.maxDungeonFloor)) {
            return Math.max(1, Math.floor(player.maxDungeonFloor));
        }
        if (typeof dungeon !== "undefined" && dungeon && dungeon.progress && typeof dungeon.progress.floor === "number") {
            return Math.max(1, Math.floor(dungeon.progress.floor));
        }
        return 1;
    }

    function getPlayerLevelForDivinity() {
        if (typeof player !== "undefined" && player && typeof player.lvl === "number" && isFinite(player.lvl)) {
            return Math.max(1, Math.floor(player.lvl));
        }
        return 1;
    }

    function conditionPasses(fx, equipped) {
        if (!fx) return true;
        if (fx.needArmorClass && !hasEquippedArmorClass(equipped, fx.needArmorClass)) return false;
        if (fx.needWeaponCat && !hasEquippedWeaponCategory(equipped, fx.needWeaponCat)) return false;
        if (fx.needWeaponCats && !hasEquippedAnyWeaponCategory(equipped, fx.needWeaponCats)) return false;
        if (fx.missingSlot && hasEquippedType(equipped, fx.missingSlot)) return false;
        return true;
    }

    function addFxToPct(out, fx, equipped) {
        if (!fx || !conditionPasses(fx, equipped)) return;
        var maxFloor = getPlayerMaxDungeonFloor();
        var plv = getPlayerLevelForDivinity();
        if (fx.hpPct) out.hp += Number(fx.hpPct) || 0;
        if (fx.atkPct) out.atk += Number(fx.atkPct) || 0;
        if (fx.defPct) out.def += Number(fx.defPct) || 0;
        if (fx.atkSpdPct) out.atkSpd += Number(fx.atkSpdPct) || 0;
        if (fx.vampPct) out.vamp += Number(fx.vampPct) || 0;
        if (fx.critDmgPct) out.critDmg += Number(fx.critDmgPct) || 0;
        if (fx.atkPerPlayerLvl) out.atk += plv * (Number(fx.atkPerPlayerLvl) || 0);
        if (fx.defPerPlayerLvl) out.def += plv * (Number(fx.defPerPlayerLvl) || 0);
        if (fx.hpPerPlayerLvl) out.hp += plv * (Number(fx.hpPerPlayerLvl) || 0);
        if (fx.atkPerMaxFloor) out.atk += maxFloor * (Number(fx.atkPerMaxFloor) || 0);
        if (fx.defPerMaxFloor) out.def += maxFloor * (Number(fx.defPerMaxFloor) || 0);
        if (fx.hpPerMaxFloor) out.hp += maxFloor * (Number(fx.hpPerMaxFloor) || 0);
    }

    function addFxToCombat(out, fx, equipped) {
        if (!fx || !conditionPasses(fx, equipped)) return;
        if (fx.armorPenPct) out.armorPenPct += Number(fx.armorPenPct) || 0;
        if (fx.enemyAtkReducePct) out.enemyAtkReducePct += Number(fx.enemyAtkReducePct) || 0;
        if (fx.dmgTakenReducePct) out.dmgTakenReducePct += Number(fx.dmgTakenReducePct) || 0;
        if (fx.extraDefDmgPct) out.extraDefDmgPct += Number(fx.extraDefDmgPct) || 0;
        if (fx.sectPassiveLvl) out.sectPassiveLvl += Number(fx.sectPassiveLvl) || 0;
    }

    function collectGlobalDivinityDefs(equipped) {
        var seen = Object.create(null);
        var list = [];
        if (!equipped || !equipped.length) return list;
        for (var i = 0; i < equipped.length; i++) {
            var it = equipped[i];
            if (!it || !it.divinity || !it.divinity.id) continue;
            var def = getDivinityAffixDef(it.divinity.id);
            if (!def || def.perItem) continue;
            if (seen[def.id]) continue;
            seen[def.id] = true;
            list.push(def);
        }
        return list;
    }

    function aggregateEquippedDivinity(equipped) {
        equipped = equipped || (typeof player !== "undefined" && player && player.equipped ? player.equipped : []);
        var pct = emptyAttrs();
        var combat = emptyCombatMods();
        var globals = collectGlobalDivinityDefs(equipped);
        for (var g = 0; g < globals.length; g++) {
            addFxToPct(pct, globals[g].fx, equipped);
            addFxToCombat(combat, globals[g].fx, equipped);
        }
        return { pct: pct, combat: combat };
    }

    window.getDongtianEquipDivinityMergedPct = function () {
        return aggregateEquippedDivinity().pct;
    };

    window.getDongtianEquipDivinityCombatMods = function () {
        return aggregateEquippedDivinity().combat;
    };

    window.getDongtianEquipDivinitySectPassiveLvlBonus = function () {
        return aggregateEquippedDivinity().combat.sectPassiveLvl || 0;
    };

    window.getDivinityPerItemStatBoostPct = function (item) {
        if (!item || !item.divinity || !item.divinity.id) return 0;
        var def = getDivinityAffixDef(item.divinity.id);
        if (!def || !def.fx || !def.fx.itemStatBoostPct) return 0;
        return Math.max(0, Number(def.fx.itemStatBoostPct) || 0);
    };

    window.getDivinityPerItemGemBoostPct = function (item) {
        if (!item || !item.divinity || !item.divinity.id) return 0;
        var def = getDivinityAffixDef(item.divinity.id);
        if (!def || !def.fx || !def.fx.gemBoostPct) return 0;
        return Math.max(0, Number(def.fx.gemBoostPct) || 0);
    };

    window.getDivinityWearLvlReduce = function (item) {
        if (!item || !item.divinity || !item.divinity.id) return 0;
        var def = getDivinityAffixDef(item.divinity.id);
        if (!def || !def.fx || !def.fx.wearLvlReduce) return 0;
        return Math.max(0, Math.floor(Number(def.fx.wearLvlReduce) || 0));
    };

    /** 仅带「此装备」降境词条的该件遗器生效；其他部位仍按原等级需求 */
    window.getEffectiveEquipmentWearLvl = function (item) {
        var raw = item && typeof item.lvl === "number" ? Math.floor(item.lvl) : Math.max(1, Math.floor(Number(item && item.lvl) || 1));
        var reduce = typeof window.getDivinityWearLvlReduce === "function" ? window.getDivinityWearLvlReduce(item) : 0;
        return Math.max(1, raw - reduce);
    };

    window.getEquipmentWearLvlDisplayText = function (item) {
        if (!item) return "—";
        var raw = item && typeof item.lvl === "number" ? Math.floor(item.lvl) : Math.max(1, Math.floor(Number(item && item.lvl) || 1));
        var eff =
            typeof window.getEffectiveEquipmentWearLvl === "function"
                ? window.getEffectiveEquipmentWearLvl(item)
                : raw;
        if (eff < raw) return eff + " 级（原 " + raw + " 级，神性降境）";
        return String(raw) + " 级";
    };

    window.formatEquipmentDivinityMetaHtml = function (item) {
        if (!item || !item.divinity || !item.divinity.name) return "";
        var d = item.divinity;
        var tier = d.tier || "blue";
        var cls = DIVINITY_TIER_CLASS[tier] || "dt-div-blue";
        var text = d.text || "";
        var wearNote = "";
        if (typeof window.getDivinityWearLvlReduce === "function") {
            var wlRed = window.getDivinityWearLvlReduce(item);
            if (wlRed > 0 && item && item.lvl) {
                var rawWl = Math.max(1, Math.floor(Number(item.lvl) || 1));
                wearNote = " · 仅本件穿戴需求 " + Math.max(1, rawWl - wlRed) + " 级（原 " + rawWl + " 级）";
            }
        }
        var safeText = String(text).replace(/"/g, "&quot;");
        return (
            '<p class="eq-meta-divinity eq-meta-divinity--' +
            tier +
            '">' +
            '<span class="eq-meta-divinity__label">神性</span> ' +
            '<span class="eq-meta-divinity__name ' +
            cls +
            '" title="' +
            safeText +
            '">' +
            String(d.name) +
            "</span>" +
            '<span class="eq-meta-divinity__desc ' +
            cls +
            '"> · ' +
            String(text) +
            wearNote +
            "</span></p>"
        );
    };
})();
