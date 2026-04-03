const combatPanel = document.querySelector("#combatPanel")
let enemyDead = false;
let playerDead = false;

/** 战斗节奏放慢倍数（>1 越慢；1.5 即出手间隔为原来的 1.5 倍） */
const COMBAT_PACE_SLOW_MULT = 1.5;

function getEnemyMechanicLabel() {
    if (!enemy || !enemy.mechanic || !enemy.mechanic.type) return "";
    if (enemy.mechanic.type === "shield") return "护盾怪";
    if (enemy.mechanic.type === "summoner") return "召唤怪";
    if (enemy.mechanic.type === "charger") return "冲锋怪";
    if (enemy.mechanic.type === "thorned") return "荆棘怪";
    if (enemy.mechanic.type === "phase") return "幻相怪";
    if (enemy.mechanic.type === "berserker") return "狂怒怪";
    if (enemy.mechanic.type === "duelist") return "斗法怪";
    if (enemy.mechanic.type === "bulwark") return "拒法怪";
    return "";
}

function absorbDamageByEnemyShield(rawDamage) {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "shield") {
        return { hpDamage: rawDamage, absorbed: 0, shieldBroken: false };
    }
    if (!enemy.mechanic.shieldHp || enemy.mechanic.shieldHp <= 0) {
        return { hpDamage: rawDamage, absorbed: 0, shieldBroken: false };
    }
    var absorbed = Math.min(rawDamage, enemy.mechanic.shieldHp);
    enemy.mechanic.shieldHp -= absorbed;
    var hpDamage = Math.max(0, rawDamage - absorbed);
    var broken = enemy.mechanic.shieldHp <= 0;
    if (broken) {
        enemy.mechanic.shieldHp = 0;
        // 破盾后进入短暂易伤窗口（3秒）
        enemy.mechanic.shieldBreakVulnerableUntil = Date.now() + 3000;
    }
    return { hpDamage: hpDamage, absorbed: absorbed, shieldBroken: broken };
}

function applyEnemyVulnerabilityWindow(damage) {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "shield") return damage;
    var until = enemy.mechanic.shieldBreakVulnerableUntil || 0;
    if (Date.now() <= until) {
        return Math.round(damage * 1.2);
    }
    return damage;
}

function tryEnemyPhaseDodge() {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "phase") return false;
    var rate = enemy.mechanic.phaseDodgeRate || 0.15;
    return Math.random() < rate;
}

function isRangedStyle(styleTag) {
    return styleTag === "staff" || styleTag === "fan" || styleTag === "spear" || styleTag === "whip";
}

function isAgileStyle(styleTag) {
    return styleTag === "dagger" || styleTag === "blade" || styleTag === "sword" || styleTag === "fan";
}

function isHeavyStyle(styleTag) {
    return styleTag === "axe" || styleTag === "hammer" || styleTag === "glaive" || styleTag === "flail";
}

const WEAPON_STYLE_COUNTERS = {
    sword: { vs: "duelist", mult: 1.25, note: "剑意破招，专克斗法架势。" },
    axe: { vs: "shield", mult: 1.25, note: "斧势开山，对护盾有额外压制。" },
    hammer: { vs: "bulwark", mult: 1.25, note: "重锤震障，法障更易被击穿。" },
    dagger: { vs: "summoner", mult: 1.25, note: "匕法追命，专克召唤本体。" },
    flail: { vs: "phase", mult: 1.25, note: "链势扰影，可破幻相节奏。" },
    scythe: { vs: "berserker", mult: 1.25, note: "镰意断势，压制狂怒妖躯。" },
    staff: { vs: "charger", mult: 1.25, note: "杖法控场，专制冲锋蓄力。" },
    fan: { vs: "thorned", mult: 1.25, note: "扇罡卸劲，最擅化解荆棘反震。" },
    spear: { vs: "charger", mult: 1.25, note: "枪势先手，可截断冲锋节拍。" },
    blade: { vs: "summoner", mult: 1.25, note: "双刃连斩，克制召唤体系。" },
    glaive: { vs: "shield", mult: 1.25, note: "戟锋破甲破障，对护盾更狠。" },
    whip: { vs: "phase", mult: 1.25, note: "鞭影锁位，专门克制幻相闪避。" }
};

function getPreCombatCounterHintText() {
    var style = getPlayerWeaponCombatStyle();
    var conf = WEAPON_STYLE_COUNTERS[style];
    var label = getEnemyMechanicLabel();
    if (!conf || !enemy || !enemy.mechanic || !enemy.mechanic.type) {
        return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#566070;color:#eef3ff;font-weight:700;">未识别克制</span> 战前推演：此战暂无明确器型克制，稳守为上。';
    }
    if (conf.vs === enemy.mechanic.type) {
        return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#1d7f45;color:#e9ffe9;font-weight:700;">克制</span> 战前推演：你当前器型克制${label}，可触发专属加成（伤害+25%）。`;
    }
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#8a6a1c;color:#fff4d6;font-weight:700;">不克制</span> 战前推演：你当前器型不克制${label}，若条件允许可考虑换器再战。`;
}

function getPreCombatCounterBadgeText() {
    var style = getPlayerWeaponCombatStyle();
    var conf = WEAPON_STYLE_COUNTERS[style];
    if (!conf || !enemy || !enemy.mechanic || !enemy.mechanic.type) {
        return "";
    }
    return conf.vs === enemy.mechanic.type ? "克制" : "不克制";
}

function applyWeaponStyleCounterBonus(damage, styleTag) {
    var out = { damage: damage, note: "" };
    if (!enemy || !enemy.mechanic || !enemy.mechanic.type) return out;
    var conf = WEAPON_STYLE_COUNTERS[styleTag];
    if (!conf) return out;
    if (conf.vs === enemy.mechanic.type) {
        out.damage = Math.round(damage * conf.mult);
        out.note = conf.note;
    }
    return out;
}

function applyEnemyUniqueOnIncomingHit(damage, crit, styleTag) {
    var out = {
        damage: damage,
        dodged: false,
        chargedInterrupted: false,
        styleNote: ""
    };
    if (!enemy || !enemy.mechanic) return out;
    var tag = styleTag || "unarmed";
    var ranged = isRangedStyle(tag);
    if (enemy.mechanic.type === "duelist") {
        if (!ranged) {
            out.damage = Math.round(out.damage * 0.82);
            out.styleNote = "敌人擅长贴身斗法，近战威力被压制。";
        } else {
            out.damage = Math.round(out.damage * 1.1);
            out.styleNote = "你拉开身位后更易破其架势，伤害略有提升。";
        }
    } else if (enemy.mechanic.type === "bulwark") {
        if (ranged) {
            out.damage = Math.round(out.damage * 0.78);
            out.styleNote = "敌人法障偏克远程，术法/长兵威力被削减。";
        } else {
            out.damage = Math.round(out.damage * 1.06);
            out.styleNote = "你贴身强攻穿透法障，伤害小幅提升。";
        }
    } else if (enemy.mechanic.type === "phase") {
        if (isAgileStyle(tag)) {
            out.damage = Math.round(out.damage * 1.07);
        } else if (isHeavyStyle(tag)) {
            out.damage = Math.round(out.damage * 0.95);
        }
    }
    if (enemy.mechanic.type === "phase" && tryEnemyPhaseDodge()) {
        out.damage = 0;
        out.dodged = true;
        return out;
    }
    var styleCounter = applyWeaponStyleCounterBonus(out.damage, tag);
    out.damage = styleCounter.damage;
    if (styleCounter.note) {
        out.styleNote = out.styleNote ? (out.styleNote + " " + styleCounter.note) : styleCounter.note;
    }
    out.damage = applyEnemyVulnerabilityWindow(out.damage);
    if (enemy.mechanic.type === "charger" && enemy.mechanic.isCharging && crit) {
        enemy.mechanic.isCharging = false;
        enemy.mechanic.chargeCounter = 0;
        out.chargedInterrupted = true;
    }
    return out;
}

function applyEnemyThornsReflect(incomingDamage, styleTag) {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "thorned") return 0;
    var tag = styleTag || "unarmed";
    var pct = 0.1;
    if (isRangedStyle(tag)) {
        pct = 0.06;
    } else if (tag === "dagger" || tag === "blade") {
        pct = 0.12;
    } else if (tag === "sword" || tag === "scythe") {
        pct = 0.14;
    } else if (tag === "axe" || tag === "hammer" || tag === "glaive") {
        pct = 0.16;
    } else if (tag === "flail") {
        pct = 0.15;
    }
    return Math.max(1, Math.round(incomingDamage * pct));
}

function triggerEnemyBerserkIfNeeded() {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "berserker") return false;
    if (enemy.mechanic.berserkTriggered) return false;
    if (!enemy.stats || !enemy.stats.hpMax || enemy.stats.hp <= enemy.stats.hpMax * 0.5) {
        enemy.mechanic.berserkTriggered = true;
        enemy.stats.atk = Math.round(enemy.stats.atk * 1.28);
        enemy.stats.atkSpd = Math.min(2.85, enemy.stats.atkSpd * 1.18);
        return true;
    }
    return false;
}

function tryTriggerSummonerBurst() {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "summoner") return 0;
    enemy.mechanic.summonCounter = (enemy.mechanic.summonCounter || 0) + 1;
    if (enemy.mechanic.summonCounter < 3) return 0;
    enemy.mechanic.summonCounter = 0;
    return Math.max(1, Math.round(enemy.stats.atk * 0.7));
}

function applyChargerIntentToEnemyDamage(baseDamage) {
    if (!enemy || !enemy.mechanic || enemy.mechanic.type !== "charger") {
        return { damage: baseDamage, skipAttack: false };
    }
    enemy.mechanic.chargeCounter = (enemy.mechanic.chargeCounter || 0) + 1;
    if (enemy.mechanic.isCharging) {
        enemy.mechanic.isCharging = false;
        enemy.mechanic.chargeCounter = 0;
        return { damage: Math.round(baseDamage * 2.2), skipAttack: false };
    }
    if (enemy.mechanic.chargeCounter >= 3) {
        enemy.mechanic.isCharging = true;
        return { damage: 0, skipAttack: true };
    }
    return { damage: baseDamage, skipAttack: false };
}

function pickCombatKillLine() {
    var t = new Date(combatSeconds * 1000).toISOString().substring(14, 19);
    var n = enemy && enemy.name ? enemy.name : "敌";
    var lines = [
        `${n}喉间溢出一声不甘的低吼，身形寸寸崩解，终化作飞灰散去。（斗法历时 ${t}）`,
        `${n}瞳中凶光骤黯，躯壳如沙溃散，只余一缕妖氛被风卷走。（斗法历时 ${t}）`,
        `最后一击落下，${n}再难维系妖躯，寸裂成灰，唯余劫灰簌簌。（斗法历时 ${t}）`,
        `${n}踉跄欲遁，却被你气机锁死去路，终在悲鸣中崩解殆尽。（斗法历时 ${t}）`,
        `罡劲透体而过，${n}形神俱散，唯余钟磬余音似的哀鸣回荡。（斗法历时 ${t}）`,
        `${n}仰天嘶啸半声，声断处，身形已散作漫天飞烬。（斗法历时 ${t}）`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

/** 当前装备的武器（身负之器） */
function getPlayerEquippedWeapon() {
    if (!player || !Array.isArray(player.equipped)) return null;
    for (var i = 0; i < player.equipped.length; i++) {
        if (player.equipped[i] && player.equipped[i].type === "Weapon") return player.equipped[i];
    }
    return null;
}

/** 是否持门派本命器型（与 calculateStats 中 sectWeaponAtkBonusPct 判定一致） */
function isBondedWeaponEquipped() {
    var w = getPlayerEquippedWeapon();
    if (!w || !player.sect || typeof getSectWeaponCategory !== "function") return false;
    var want = getSectWeaponCategory(player.sect);
    return !!(want && w.category === want);
}

function weaponDisplayNameForCombatLog() {
    var w = getPlayerEquippedWeapon();
    if (!w) return "掌中兵";
    if (typeof weaponOrArmorDisplayName === "function") return weaponOrArmorDisplayName(w);
    return w.weaponName || (typeof weaponCategoryLabel === "function" ? weaponCategoryLabel(w) : w.category) || "掌中兵";
}

/** 不改装备数据结构：按现有 12 武器 category 软映射为独立战斗风格 */
function getPlayerWeaponCombatStyle() {
    var w = getPlayerEquippedWeapon();
    if (!w || !w.category) return "unarmed";
    var styleMap = {
        Sword: "sword",
        Axe: "axe",
        Hammer: "hammer",
        Dagger: "dagger",
        Flail: "flail",
        Scythe: "scythe",
        Staff: "staff",
        Fan: "fan",
        Spear: "spear",
        Blade: "blade",
        Glaive: "glaive",
        Whip: "whip"
    };
    return styleMap[w.category] || "unarmed";
}

/** {n} 敌名 {d} 伤害（已含 <b>） {w} 武器专名 */
function formatCombatHitLine(tpl, enemyName, dmgStr, weaponName) {
    var d = "<b>" + dmgStr + "</b>";
    var w = weaponName || "掌中兵";
    return tpl.replace(/\{n\}/g, enemyName).replace(/\{d\}/g, d).replace(/\{w\}/g, w);
}

/** 无武器或未匹配品类时的通用句（占位 {n}{d}） */
var COMBAT_DEFAULT_CRIT_LINES = [
    `你眸中寒芒乍现，心念电转间已窥得一线破绽——一击正中要害！罡劲透体，向{n}凿出 {d}。`,
    `气机骤然暴涨，你借势反压，杀意如瀑倾泻，{n}避无可避，硬吃 {d} 的暴烈真伤。`,
    `丹田真元轰然奔涌，你吐气成罡，这一击挟雷裹电，生生在{n}身上炸开 {d} 的裂痕。`,
    `一念起，杀意如虹——{n}护体应声龟裂，要害处爆出 {d} 的刺目华光。`,
    `你踏罡错步，假身诱敌，真劲自侧翼贯入，{n}身形一僵，已承 {d} 重创。`,
    `天地似静半瞬，唯你指缝间雷纹亮起；下一刹，{n}胸前炸开血泉，暴伤 {d}。`,
    `会心之机稍纵即逝，你未敢迟疑，真元尽数押在这一击——{d}，敌躯剧震。`,
    `灵台如镜，你映出{n}气机滞涩一瞬——真元尽出，轰然洞穿，暴伤 {d}。`,
    `你借势腾空，罡气自足底翻涌至顶门，落下时如陨星坠地，{n}再承 {d}。`,
    `杀意凝为一线，你并掌成刀，劈开{n}护体雾霭，要害绽 {d}。`,
    `丹田雷音轻鸣，你拳意外放，未触敌躯，罡风已先裂皮，刻 {d}。`,
    `你足踏七星错位，{n}瞳花缭乱间，真劲已从死角灌入，暴伤 {d}。`,
    `气机倒卷，你反借{n}一击之力，双倍奉还，{n}脏腑如遭锤击，伤 {d}。`,
    `一念不起，你出手却更快三分——{n}尚未反应，胸前已烙 {d}。`,
    `你咬破舌尖，精血催动真元暴涨，此击不计后果，{n}硬吃 {d}。`,
    `天地似向你倾斜半寸，你踏在那倾斜之上，一击落下，{n}形神俱颤 {d}。`,
    `罡劲绕体三周，你收束为一刺，无坚不摧——{n}护体洞开，再刻 {d}。`
];
var COMBAT_DEFAULT_HIT_LINES = [
    `你足踏罡斗，身随念动，与{n}硬撼一记，震波荡开——赫然刻下 {d}。`,
    `护体灵光微漾间，你已欺身而进，掌缘挟风雷扫过敌躯，削去 {d}。`,
    `你不与它缠斗废话，只以实打实的力道说话：真元一吐，{n}踉跄倒退，气血狂掉 {d}。`,
    `残影未散，你的第二式已至。{n}仓促格挡，仍被震得骨节发麻，生生吃下 {d}。`,
    `你以守为攻，借敌旧力未泄之际斜切而入，撕开一线血口：{d}。`,
    `罡风擦面而过，你矮身突进，肩肘连环，震得{n}脏腑翻腾，损去 {d}。`,
    `你忽左忽右，步法如迷，{n}瞳中一乱，已被你印中胸膛，真元伤 {d}。`,
    `两股灵压对撞，你半步不退，硬将对方势子顶回——余波刻下 {d}。`,
    `你并指如剑，虚点实按，{n}妖气一滞，已挨一记实打实的 {d}。`,
    `你气机一沉，攻守易位，{n}旧招未尽，已被你撕开一线破绽，伤 {d}。`,
    `罡步轻错，你贴影而行，{n}回首已迟，胁下再添 {d}。`,
    `你以快打慢，连削带压，{n}守势渐乱，气血跌落 {d}。`,
    `灵机一动，你变招如风，{n}格挡落空，肩背吃 {d}。`,
    `你未逞口舌，只以势压人，{n}呼吸一窒，再损 {d}。`,
    `敌进我退、敌退我进，你踏准半拍，{n}腹前空门刻 {d}。`,
    `你借地脉微震藏劲，出手时沉三分，{n}硬接之下臂骨发麻，失 {d}。`,
    `护体灵光明灭一瞬，你已递至中宫，真元伤 {d}。`,
    `你佯攻上盘、实取下盘，{n}挪步虽快，胫侧仍被擦去 {d}。`,
    `气机如丝缠腕，你一带一送，{n}失衡半步，再挨 {d}。`,
    `你收势如弓满，出势如箭脱，{n}只觉劲风扑面，已刻 {d}。`
];

/** 未装备武器：拳掌肉搏（仅 {n}{d}） */
var COMBAT_UNARMED_CRIT_LINES = [
    `你弃器不用，双拳如雷——罡劲自丹田直贯臂膀，{n}胸前要害炸开 {d}。`,
    `掌缘如刀，你踏步欺身，一式「劈山」落下，{n}肩锁骨裂声里暴伤 {d}。`,
    `拳意透体，你短打寸劲，{n}护体灵光应声碎裂，再承 {d} 的透骨劲。`,
    `你肘底藏锤，贴身一顶，{n}脏腑移位，喉间腥甜，当场刻 {d}。`,
    `指节爆鸣，你并指点向{n}膻中要穴，劲力如锥，暴伤 {d}。`,
    `你旋身鞭拳，肩背合一，{n}侧脸先麻、胸腹再震，叠伤 {d}。`,
    `双掌阴阳一错，你借力打力，{n}自家劲道反噬，再挨你补一记 {d}。`,
    `你足尖一点，身形如箭，膝撞丹田、掌按天灵，一气呵成 {d}。`,
    `拳风未至，拳意先寒——{n}瞳中一缩，已被你轰中面门，暴伤 {d}。`,
    `你吐气开声，声未落拳已至，{n}横臂格挡崩断，再中 {d}。`,
    `掌底含雷，你拍向{n}后心要穴，劲透前胸，伤 {d}。`,
    `你矮身扫堂，{n}跃起虽快，下颌仍被你上勾拳擦中，刻 {d}。`,
    `双拳连环如鼓点，你连轰七记同落一点，{n}护体溃散，暴伤 {d}。`,
    `你以身为器，肩撞肘顶膝顶三式合一，{n}身形踉跄，再失 {d}。`
];
var COMBAT_UNARMED_HIT_LINES = [
    `你掌缘斜切，削向{n}颈侧，{n}偏头虽快，肩窝仍被带走 {d}。`,
    `拳风扑面，你虚实三拳，{n}只防住两记，第三记印中胸腹，真元伤 {d}。`,
    `你并掌前推，如推山岳，{n}硬接之下气血翻腾，损 {d}。`,
    `指戳、掌按、肘顶，你贴身短打，{n}退无可退，再挨 {d}。`,
    `你足踏中宫，双掌连封带打，{n}守势渐乱，肋下空门刻 {d}。`,
    `拳走弧线，你绕开{n}锋芒，一记勾拳撩向腹侧，伤 {d}。`,
    `你以掌代刀，横斩{n}膝弯，{n}屈膝虽快，胫骨仍震去 {d}。`,
    `双掌如磨，你黏住{n}腕脉一拖一送，{n}失衡半步，再失 {d}。`,
    `你矮身近搏，头槌虚晃、掌掴实落，{n}耳侧嗡鸣，气血跌 {d}。`,
    `拳掌交替如雨，你专打{n}旧力将尽处，连中三记，叠伤 {d}。`,
    `你撤步引敌，突然进步冲拳，{n}腹前衣袍凹陷，刻 {d}。`,
    `掌风扫过{n}双目，{n}闭目一瞬，你膝顶已至，再损 {d}。`,
    `你双掌下按，压住{n}来势，顺势上挑，{n}下颌一震，伤 {d}。`,
    `拳意绵里藏针，你看似轻推，{n}胸前一闷，方知劲已入体 {d}。`
];

/** 按武器 category（与 equipment 一致） */
var COMBAT_WEAPON_CRIT_LINES = {
    Sword: [
        `剑尖一吐，霜线先{n}喉间三分——白虹经天，要害处绽开 {d}。`,
        `你腕底青霜乍现，剑诀未落，剑光已先声夺人，洞穿{n}身侧，暴伤 {d}。`,
        `剑意如钟，嗡鸣未绝，刃锋已递至{n}心脉前——罡劲透体 {d}。`,
        `一剑无回，你以身合剑，{n}护体如纸，被生生撕开 {d} 的裂口。`,
        `剑气如虹贯日，你踏步追命，{n}退迟半寸，喉前已见 {d}。`,
        `你剑走龙蛇，三式连环封死{n}退路，最后一刺穿心，暴伤 {d}。`,
        `青锋未出鞘先鸣，你拔剑成弧，{n}格挡偏了半寸，腕脉溅血 {d}。`,
        `你跃起劈山，剑势如瀑，{n}举爪硬接被震裂，胸前再绽 {d}。`,
        `剑脊拍额诱敌，剑尖悄刺丹田——{n}腹前一凉，再中 {d}。`,
        `你旋腕绞剑，刃口锁住{n}兵刃半瞬，顺势一拖，胁下豁口刻 {d}。`,
        `剑意凝于一点，你突刺如电，{n}瞳中只余一线寒芒，暴伤 {d}。`,
        `你借雾掩身，剑从不可思议角度递出，{n}后心一麻，伤 {d}。`,
        `双剑交击成鸣，你借声掩杀，{n}耳侧嗡鸣间喉间已凉，{d}。`,
        `剑花乱眼，你藏真招于千影之中，{n}格挡落空，再承 {d}。`
    ],
    Axe: [
        `斧势如山倾，你抡圆劈落，{n}脚下大地先裂，胸前一空，硬吃 {d}。`,
        `罡风卷刃，巨斧破雾而下，{n}躲闪不及，肩背处炸开 {d} 的暴伤。`,
        `你借坠势加斧威，一斧断流，{n}妖躯剧震，气血狂泻 {d}。`,
        `斧钺生寒，你踏步近身，横斩变劈，{n}格挡崩碎，再中 {d}。`,
        `你双手握柄旋身，斧走满月，{n}矮身不及，头皮擦出血线，暴伤 {d}。`,
        `斧刃咬地再起，土浪扑面，{n}视线一花，胸腹已豁 {d}。`,
        `你假意劈顶、实剁膝，{n}纵跃虽起，足踝仍被斧风扫中 {d}。`,
        `巨斧锁链般连斩三记，{n}护体一层层剥落，最后一斧刻 {d}。`,
        `你踏罡跃起，斧自九天落，{n}举臂格挡骨裂声起，再承 {d}。`,
        `斧风如墙推进，{n}退无可退，脊背撞岩再挨斧脊，伤 {d}。`,
        `你抡斧反撩，自下而上剖开{n}下颚至胸，血泉喷涌 {d}。`,
        `斧钺映日生寒，你踏步追斩，{n}侧滚仍慢，肩背绽 {d}。`,
        `你以斧背震{n}颅门，{n}眩晕半瞬，斧刃已至颈侧，暴伤 {d}。`,
        `开山式！你蓄满真元一斧断岳，{n}立足处陷三尺，再中 {d}。`
    ],
    Hammer: [
        `重锤破空，闷响如雷，{n}被震得脏腑移位，当场刻下 {d}。`,
        `你抡锤成圆，劲走螺旋，{n}脚下踉跄，天灵处挨一记实锤，暴伤 {d}。`,
        `锤风未至，地面先陷三寸——{n}被压得膝弯一软，肩骨处绽 {d}。`,
        `锤影如山叠浪，你连砸三记，{n}护体灵光碎裂，余劲刻 {d}。`,
        `你双手举锤过顶，如岳镇海，{n}举爪托举被震裂，胸前塌陷 {d}。`,
        `锤走闷雷，你连震五记同落丹田，{n}真气涣散，暴伤 {d}。`,
        `你甩锤绕腕，锤头自背后甩出诡弧，{n}后脑一麻，再中 {d}。`,
        `锤柄突刺如枪，你顶向{n}咽门，{n}偏头虽快，锁骨仍断 {d}。`,
        `你锤扫千军再顿地，波纹荡得{n}失衡，补锤落背，伤 {d}。`,
        `重锤借地反震跃起，你人在半空再砸，{n}双膝跪地，刻 {d}。`,
        `锤风压境，{n}口鼻溢血，仍被你锤脊砸中，脊骨嗡鸣 {d}。`,
        `你以锤当盾硬顶妖芒，火星四溅间锤头已印在{n}额心，暴伤 {d}。`,
        `连环追锤如鼓点，{n}护体如鼓皮被敲穿，最后一锤 {d}。`,
        `你吐气沉锤，锤未落势已至，{n}胸骨闷响，再失 {d}。`
    ],
    Dagger: [
        `短刺如电，你贴身一绞，{n}胁下血线飙起，暴伤 {d}。`,
        `你指间寒星连闪，虚实三刺，{n}瞳中一花，要害已中 {d}。`,
        `身法如魅，你绕背突刺，{n}回肘已迟，脊侧裂开 {d}。`,
        `刃走偏锋，你以巧破力，{n}大开大合处露一线，被你剜出 {d}。`,
        `你反握短刃拖割，{n}腹皮外翻，肠鸣可闻，暴伤 {d}。`,
        `双刃互掷，你声东击西，{n}格挡左刃、右刃已入胁，{d}。`,
        `你贴地滑铲，刃削{n}踝筋，{n}跪倒刹那喉间一凉，{d}。`,
        `刃尖点腕、点肘、点肩，你连封三脉，最后一刺心口 {d}。`,
        `你以刃为钩，挂住{n}甲片一拖，甲裂肉翻，再刻 {d}。`,
        `短刺旋腕如花，{n}眼花缭乱，腹前已中七记叠伤 {d}。`,
        `你借石障目，刃自影中递出，{n}后心一寒，伤 {d}。`,
        `刃口喂毒（罡），你浅浅一划，{n}血流未止气先乱，暴伤 {d}。`,
        `你翻身倒刺，刃自下而上挑向{n}下颌，血箭冲天 {d}。`,
        `贴身缠斗，你膝顶其腹、刃封其喉，一气呵成 {d}。`
    ],
    Flail: [
        `链锤甩出诡弧，破空声尖啸，{n}头颈一偏仍慢半寸，颈侧爆 {d}。`,
        `你抡链成圆，锤头借离心力砸落，{n}胸甲凹陷，震伤 {d}。`,
        `铁链缠腕一抖，锤影忽左忽右，{n}格挡落空，腰腹间刻 {d}。`,
        `链鸣如泣，你突进甩锤，{n}膝弯被扫，身形一矮，再挨 {d}。`,
        `链锁缠住{n}腕踝一拖，{n}失衡前倾，锤头已至面门，暴伤 {d}。`,
        `你甩链绕树（柱）借劲，锤速骤增，{n}背脊炸开 {d}。`,
        `链锤贴地蛇行，你突然抖腕跳锤，{n}下颌被撩，再中 {d}。`,
        `双链齐出如双龙，{n}左右支绌，胸腹连中两锤 {d}。`,
        `你抡链成风墙，{n}硬闯而入，皮开肉绽，伤 {d}。`,
        `锤头藏链后，你突放长链，{n}咽喉被套半圈，勒出血线 {d}。`,
        `链鸣盖过{n}嘶吼，你近身顶肘再甩锤，叠伤 {d}。`,
        `你借锤势旋身，链扫下盘、锤落天灵，一气呵成 {d}。`,
        `链锤砸地，碎石如矢射向{n}面门，{n}闭目一瞬，锤已至，{d}。`,
        `你收链突刺，锤作枪使，{n}腹前洞穿，暴伤 {d}。`
    ],
    Scythe: [
        `镰弧如月，你拖割而过，{n}腹前衣甲与妖皮一并翻开，暴伤 {d}。`,
        `刃口带啸，你旋身镰斩，{n}退路被封，胸前绽开 {d} 的死线。`,
        `镰柄一别，你借腰力上挑，{n}下颌至胸一线血泉，伤 {d}。`,
        `死气缠镰，你低掠而过，{n}足踝先折，上身迟半瞬，再中 {d}。`,
        `你镰刃锁颈一拖，{n}俯身虽低，背脊仍被豁开长口 {d}。`,
        `镰光如月坠，你连割三式，{n}膝、腹、喉一线见血，暴伤 {d}。`,
        `你倒拖镰刀跃起，刃自背后勾向{n}后颈，{n}缩头仍慢，{d}。`,
        `死镰旋舞成轮，{n}卷入刃中，皮开肉绽，再失 {d}。`,
        `你镰尖点地，借反弹腾空，{n}天灵盖前刃已至，{d}。`,
        `镰柄猛撞{n}丹田，{n}弯腰刹那，刃口已架上颈侧，{d}。`,
        `镰风带腐叶，{n}视线一花，小腿已断，再中 {d}。`,
        `你旋镰扫千军，{n}纵跃虽高，足踝仍被勾落，暴伤 {d}。`,
        `镰刃卡入{n}臂骨，{n}撕扯时带出血泉，{d}。`,
        `你以镰为钩，挂住{n}甲片一拖，甲裂骨露，刻 {d}。`
    ],
    Staff: [
        `杖端灵纹亮起，你点、挑、封三连，{n}气机一滞，印堂处承 {d}。`,
        `法杖顿地，波纹荡开，{n}足下失衡，你顺势杖扫千军，暴伤 {d}。`,
        `你以杖为笔，虚空画符，符成处雷落敌顶——{n}浑身一麻，损 {d}。`,
        `杖风如幕，你旋身连戳，{n}护体被点穿三孔，要害叠伤 {d}。`,
        `你杖挑{n}下颌，{n}昂首虽快，喉结仍被点中，暴伤 {d}。`,
        `杖影如林，你连戳七穴，{n}真气逆流，当场喷血 {d}。`,
        `你倒拖法杖，杖尾突然上挑，{n}阴裆一凉，再中 {d}。`,
        `法杖画圆成盾，盾中藏枪，{n}格挡时胸前一空，{d}。`,
        `你杖扫落叶，叶聚成刃，{n}面皮先裂，再被罡风割 {d}。`,
        `杖端雷纹游走，你点向{n}心口，电光爆开，伤 {d}。`,
        `你跃起劈杖，杖风未落，{n}双膝跪地，再承 {d}。`,
        `杖风如钟鸣，{n}耳侧嗡鸣，灵台一眩，再挨 {d}。`,
        `你杖锁{n}腕脉一拖，{n}失衡前倾，杖端已顶心口 {d}。`,
        `法杖顿地，地脉灵气上涌，你借地力一击，{n}脚下土裂，暴伤 {d}。`
    ],
    Fan: [
        `扇面一展，罡风如刃铺面，{n}面皮先裂，再被风刀割出 {d}。`,
        `你摇扇成阵，乱流四起，{n}立足不稳，胸前空门大开，吃 {d}。`,
        `折扇合而复开，寒芒自扇骨迸出，{n}喉间一凉，暴伤 {d}。`,
        `扇影千叠，你踏罡步进，{n}眼花缭乱间肩井已中，刻 {d}。`,
        `你扇走八卦，风随步转，{n}被困风眼，周身如割 {d}。`,
        `扇面绘山河，你一扇纳千风，{n}倒飞而出，胸骨裂响 {d}。`,
        `你合扇如锏，点向{n}睛明，{n}闭目一瞬，额已见血 {d}。`,
        `扇风倒卷，{n}自家妖气反噬，你趁乱补扇，暴伤 {d}。`,
        `你扇指苍穹，引雷入扇，扇落雷随，{n}浑身焦黑 {d}。`,
        `扇影如蝶，你穿花绕树，{n}目不暇接，喉间已凉 {d}。`,
        `你扇底藏针，罡针透体，{n}穴道被封，再中 {d}。`,
        `扇风凝为一线，你裁纸般裁开{n}护体，{d} 灌入。`,
        `你旋身开扇，扇缘如刀环颈，{n}颈侧血线，伤 {d}。`,
        `乱流中你扇指一点，正中{n}膻中，气机崩散，{d}。`
    ],
    Spear: [
        `枪花一抖，枪尖已到{n}咽前，你突刺如龙，暴伤 {d}。`,
        `长枪如虹，你中宫直进，{n}横臂格挡被震开，胸腹洞穿 {d}。`,
        `你抡枪扫踝，{n}跃起迟了半寸，小腿骨裂声里再挨 {d}。`,
        `回马枪！你假退真进，枪尾点肋、枪尖穿心，一气呵成 {d}。`,
        `你抖枪成梨花，{n}满眼枪花，腹前已中三枪叠伤 {d}。`,
        `长枪如龙摆尾，你扫颈再刺心，{n}俯仰失据，暴伤 {d}。`,
        `你枪尖点地借反弹，人枪合一，{n}胸前洞穿 {d}。`,
        `枪杆震断{n}爪锋，枪刃已递至喉，{n}再退已迟，{d}。`,
        `你掷枪如矢，{n}侧身虽快，肋下仍被枪刃拖出一道 {d}。`,
        `枪风如幕，你连刺九枪同落一点，{n}护体崩解，{d}。`,
        `你抡枪砸地，碎石如矢，{n}面门见血，再挨枪挑 {d}。`,
        `枪尾点膝、枪尖挑颌，{n}上下不能兼顾，再失 {d}。`,
        `你借马步沉枪，枪如磐石，{n}撞来即被弹回，反震 {d}。`,
        `百鸟朝凤枪！你枪影漫天，{n}不知虚实，心口已凉 {d}。`
    ],
    Blade: [
        `双刃交错，你剪颈锁腕，{n}两臂一麻，胸前被拉开 {d} 的血槽。`,
        `你左右开弓，刀光成剪，{n}护体被绞碎，腰腹间绽 {d}。`,
        `锋刃贴骨而过，你旋身双斩，{n}背脊与胁下同时见血，暴伤 {d}。`,
        `刀意缠绵如丝，你缠腕卸劲再反割，{n}腕脉一凉，再失 {d} 气血。`,
        `你双刃一上一下、一虚一实，{n}防上漏下，腹前豁口 {d}。`,
        `刀光如匹练，你旋身斩腰，{n}拦腰而断之势，暴伤 {d}。`,
        `你抛刃诱敌，{n}格挡空刃，真刃已至后颈，{d}。`,
        `双刀剪月，{n}举爪格挡被绞碎，胸前血泉 {d}。`,
        `你刀走连环，{n}只防住七刀，第八刀入心，{d}。`,
        `刃口互击成鸣，你借声掩杀，{n}耳侧嗡鸣间已中 {d}。`,
        `你矮身双刀拖地，{n}跃起虽快，足筋已断，{d}。`,
        `刀意如霜，你连斩不歇，{n}护体如冰碎，暴伤 {d}。`,
        `你交叉双刀锁颈，{n}挣扎间喉管已裂，{d}。`,
        `双刃回旋如轮，{n}卷入刃中，皮开肉绽，再失 {d}。`
    ],
    Glaive: [
        `戟尖挑、戟援勾，你两式连环，{n}甲片纷飞，胸前豁口刻 {d}。`,
        `长戟如龙探首，你劈落如瀑，{n}举爪格挡被震裂，暴伤 {d}。`,
        `你戟走偏锋，援刃锁颈，{n}挣扎间喉侧已见红，损 {d}。`,
        `戟风扫千军，你踏罡横扫，{n}膝弯先折，上身迟滞，再中 {d}。`,
        `你倒拖长戟，戟刃自背后勾向{n}后心，{n}缩肩仍慢，{d}。`,
        `戟尖挑飞{n}兵刃，{n}空手一瞬，戟已至喉，暴伤 {d}。`,
        `你抡戟成风，{n}卷入戟中，甲裂骨露，{d}。`,
        `戟援卡入{n}关节，{n}挣动时骨裂声起，再承 {d}。`,
        `你跃起劈戟，戟风如瀑，{n}举爪托举被震裂，{d}。`,
        `长戟如龙盘柱，你绕树借劲，戟速骤增，{d}。`,
        `戟尖点地，你借反弹腾空，{n}天灵盖前戟已至，{d}。`,
        `你戟扫下盘、戟挑上盘，{n}俯仰失据，暴伤 {d}。`,
        `戟风如幕，你连刺带挑，{n}胸前甲片纷飞，{d}。`,
        `你以戟为盾硬顶，盾中藏戟，{n}腹前一凉，{d}。`
    ],
    Whip: [
        `鞭梢破空如蛇信，{n}面皮先麻，脊背再裂，暴伤 {d}。`,
        `长鞭缠腕一抖，你甩鞭成环，{n}被箍颈提起半寸，颈侧勒出 {d}。`,
        `鞭影如雨，你连抽七记同落一点，{n}护体崩解，伤 {d}。`,
        `你鞭走地蛇，先扫踝再撩阴，{n}身形一乱，胸腹空门挨 {d}。`,
        `长鞭如龙，你抖腕成结，{n}被缠住一瞬，鞭梢已至双目，{d}。`,
        `你甩鞭抽石，碎石如矢，{n}面门见血，再挨鞭勒，{d}。`,
        `鞭风如网，{n}左支右绌，脊背皮开肉绽，暴伤 {d}。`,
        `你鞭走S形，{n}格挡落空，腰腹连中三鞭 {d}。`,
        `鞭梢点腕打脉，{n}手一麻，空门大开，再挨 {d}。`,
        `你长鞭卷树，借树反弹，鞭速骤增，{n}颈侧血线 {d}。`,
        `鞭影倒卷，{n}自家妖气反噬，你趁乱补鞭，{d}。`,
        `鞭身如铁索横江，你拦腰一绞，{n}腰腹深陷血痕，暴伤 {d}。`,
        `你抖腕成花，鞭梢连点{n}七穴，{n}真气逆流，再失 {d}。`,
        `鞭风灌耳，{n}灵台一眩，护体洞开，再挨一记 {d}。`,
        `你鞭梢绕踝一拖，{n}跪倒刹那，鞭脊已抽中脊背，{d}。`
    ]
};
var COMBAT_WEAPON_HIT_LINES = {
    Sword: [
        `你剑走偏锋，剑脊拍开{n}来势，剑尖顺势一送，真元伤 {d}。`,
        `青锋连点，你以快打慢，{n}格挡不及，臂上再添 {d}。`,
        `剑气未至，剑意先寒——{n}瞳中一缩，已被你削去 {d}。`,
        `你撤步引敌，回剑反撩，{n}腹前衣袍裂开，损 {d}。`,
        `你剑尖点腕，{n}手一麻，剑脊顺势拍额，再损 {d}。`,
        `回风落雁，你剑走弧线，{n}低头虽快，发髻仍被削散，伤 {d}。`,
        `你以剑作杖顿地，借反弹跃起，{n}天灵盖前剑已至，{d}。`,
        `剑花乱眼，你藏真招于虚招，{n}格挡偏半寸，肋下见血 {d}。`,
        `你剑挑{n}下盘，{n}跃起，剑尖上挑膝弯，再失 {d}。`,
        `青锋映日，你踏步连刺，{n}只防住前三，第四刺入肉 {d}。`,
        `你剑脊磕开{n}爪，剑刃反手一送，{n}腹前再添 {d}。`,
        `剑意如丝，你缠腕卸劲再送，{n}腕脉一凉，气血跌 {d}。`,
        `你倒拖青锋，刃自下而上撩向{n}下颌，血线细而深 {d}。`,
        `剑风扫过{n}双目，{n}闭目一瞬，你剑尖已刺中肩窝，{d}。`
    ],
    Axe: [
        `斧风压顶，你半斧虚劈诱敌，真斧落时{n}已失位，刻 {d}。`,
        `你抡斧横扫，{n}矮身虽快，背脊仍被斧风擦中，失 {d}。`,
        `巨斧沉猛，你不求快而求狠，{n}硬接一记，虎口发麻，气血跌 {d}。`,
        `斧钺拖地再起，土石飞溅间你已贴身，{n}侧肋中斧，伤 {d}。`,
        `你斧刃咬地，借土浪迷{n}眼，{n}闭目一瞬，斧已至，{d}。`,
        `斧走半月，{n}横架虽格住斧杆，斧刃仍震入肩，{d}。`,
        `你抡斧追斩，{n}连滚三匝，仍被斧风擦中胫骨，{d}。`,
        `巨斧沉猛，你踏罡进逼，{n}退迟半步，胸甲凹陷 {d}。`,
        `你斧背震{n}颅门，{n}眩晕半瞬，斧刃已至腹前，{d}。`,
        `斧风如墙，{n}硬闯而入，皮开肉绽，再失 {d}。`,
        `你假意劈顶、实剁膝，{n}纵跃虽起，足踝仍被斧风扫中 {d}。`,
        `斧钺生寒，你连劈三记同落一点，{n}护体剥落，{d}。`,
        `你抡斧反撩，自下而上剖开{n}下颚至胸，血泉喷涌 {d}。`,
        `斧风压境，{n}口鼻溢血，仍被你斧脊拍中脊背，{d}。`
    ],
    Hammer: [
        `锤势敦厚，你震开{n}爪锋，顺势锤落其肩，真元伤 {d}。`,
        `重锤点地，借反震跃起再砸，{n}头顶罡风一沉，损 {d}。`,
        `你连锤三下同落一点，{n}护体凹陷，气血狂掉 {d}。`,
        `锤柄格挡，锤头偷桃，{n}小腹一闷，再失 {d}。`,
        `你甩锤绕腕，锤头自背后甩出，{n}后脑一麻，再中 {d}。`,
        `锤柄突刺如枪，你顶向{n}咽门，{n}偏头虽快，锁骨仍震 {d}。`,
        `锤扫千军再顿地，{n}失衡前倾，锤头已至面门，{d}。`,
        `重锤借地反震跃起，你人在半空再砸，{n}双膝跪地，{d}。`,
        `锤风压境，{n}口鼻溢血，仍被你锤脊砸中，脊骨嗡鸣 {d}。`,
        `你以锤当盾硬顶，盾中藏锤，{n}胸前一闷，伤 {d}。`,
        `连环追锤如鼓点，{n}护体如鼓皮被敲穿，最后一锤 {d}。`,
        `你吐气沉锤，锤未落势已至，{n}胸骨闷响，再失 {d}。`,
        `锤风未至，地面先陷三寸——{n}被压得膝弯一软，肩骨处绽 {d}。`,
        `你抡锤成风墙，{n}硬闯而入，皮开肉绽，伤 {d}。`
    ],
    Dagger: [
        `短刃贴身，你割脉断劲，{n}手腕一软，空门处挨 {d}。`,
        `你矮身滑步，刃走下阴，{n}纵跃虽快，胫骨仍被划去 {d}。`,
        `双刃互击成鸣，你借声掩刺，{n}耳侧一凉，再中 {d}。`,
        `你以刺为钩，剜向{n}旧创，创口迸裂，再损 {d}。`,
        `你反握短刃拖割，{n}腹皮微裂，真气外泄，伤 {d}。`,
        `双刃互掷，{n}格挡左刃、右刃已入胁，{d}。`,
        `你贴地滑铲，刃削{n}踝筋，{n}跪倒刹那再补一刀，{d}。`,
        `刃尖点腕、点肘、点肩，你连封三脉，最后一刺心口 {d}。`,
        `你以刃为钩，挂住{n}甲片一拖，甲裂肉翻，再刻 {d}。`,
        `短刺旋腕如花，{n}眼花缭乱，腹前已中数创，{d}。`,
        `你翻身倒刺，刃自下而上挑向{n}下颌，血箭冲天 {d}。`,
        `贴身缠斗，你膝顶其腹、刃封其喉，一气呵成 {d}。`,
        `刃口喂罡，你浅浅一划，{n}血流未止气先乱，再损 {d}。`,
        `你指间寒星连闪，虚实三刺，{n}瞳中一花，要害已中 {d}。`
    ],
    Flail: [
        `链锤走弧，你砸偏{n}枪杆（爪锋），锤风余劲仍扫中 {d}。`,
        `你甩链缠敌一瞬，锤头已至，{n}挣脱迟了半分，肩背吃 {d}。`,
        `链鸣刺耳，你抡圆猛砸，{n}脚下土裂，气血跌 {d}。`,
        `你假意松链，突然收链近身，{n}胸前一闷，伤 {d}。`,
        `链锁缠住{n}腕踝一拖，{n}失衡前倾，锤头已至面门，{d}。`,
        `你甩链绕树借劲，锤速骤增，{n}背脊炸开 {d}。`,
        `链锤贴地蛇行，你突然抖腕跳锤，{n}下颌被撩，再中 {d}。`,
        `双链齐出如双龙，{n}左右支绌，胸腹连中两锤 {d}。`,
        `你抡链成风墙，{n}硬闯而入，皮开肉绽，伤 {d}。`,
        `锤头藏链后，你突放长链，{n}咽喉被套半圈，勒出血线 {d}。`,
        `链鸣盖过{n}嘶吼，你近身顶肘再甩锤，叠伤 {d}。`,
        `你借锤势旋身，链扫下盘、锤落天灵，一气呵成 {d}。`,
        `链锤砸地，碎石如矢射向{n}面门，{n}闭目一瞬，锤已至，{d}。`,
        `你收链突刺，锤作枪使，{n}腹前洞穿，真元伤 {d}。`
    ],
    Scythe: [
        `镰刃拖地而起，你割向{n}下盘，{n}跃起虽快，足踝仍被剜去 {d}。`,
        `你旋身镰扫，{n}俯身虽低，背脊仍被镰风擦中，失 {d}。`,
        `死镰封喉，你未求必杀，只求逼位——{n}退迟半寸，喉前已见 {d}。`,
        `镰柄猛撞，你近身肘击再接镰拖，{n}胸腹皮开，损 {d}。`,
        `你镰刃锁颈一拖，{n}俯身虽低，背脊仍被豁开长口 {d}。`,
        `镰光如月坠，你连割三式，{n}膝、腹、喉一线见血，{d}。`,
        `你倒拖镰刀跃起，刃自背后勾向{n}后颈，{n}缩头仍慢，{d}。`,
        `死镰旋舞成轮，{n}卷入刃中，皮开肉绽，再失 {d}。`,
        `你镰尖点地，借反弹腾空，{n}天灵盖前刃已至，{d}。`,
        `镰柄猛撞{n}丹田，{n}弯腰刹那，刃口已架上颈侧，{d}。`,
        `镰风带腐叶，{n}视线一花，小腿已伤，再中 {d}。`,
        `你旋镰扫千军，{n}纵跃虽高，足踝仍被勾落，{d}。`,
        `镰刃卡入{n}臂骨，{n}撕扯时带出血泉，{d}。`,
        `你以镰为钩，挂住{n}甲片一拖，甲裂骨露，刻 {d}。`
    ],
    Staff: [
        `杖挑、杖压、杖点，你三式连环，{n}气机紊乱，印堂承 {d}。`,
        `法杖画圆，卸开{n}猛扑，杖尾顺势点其丹田，真元伤 {d}。`,
        `你杖扫下盘，{n}起跳，杖端上挑正中膝弯，再失 {d}。`,
        `杖风如幕，你逼{n}退至墙角，最后一杖封喉未取命，只刻 {d}。`,
        `你杖挑{n}下颌，{n}昂首虽快，喉结仍被点中，{d}。`,
        `杖影如林，你连戳数穴，{n}真气逆流，气血跌 {d}。`,
        `你倒拖法杖，杖尾突然上挑，{n}阴裆一凉，再中 {d}。`,
        `法杖画圆成盾，盾中藏枪，{n}格挡时胸前一空，{d}。`,
        `你杖扫落叶，叶聚成刃，{n}面皮先裂，再被罡风割 {d}。`,
        `杖端雷纹游走，你点向{n}心口，电光微爆，伤 {d}。`,
        `你跃起劈杖，杖风未落，{n}双膝跪地，再承 {d}。`,
        `杖风如钟鸣，{n}耳侧嗡鸣，灵台一眩，再挨 {d}。`,
        `你杖锁{n}腕脉一拖，{n}失衡前倾，杖端已顶心口 {d}。`,
        `法杖顿地，地脉微震，你借地力一击，{n}脚下土裂，{d}。`
    ],
    Fan: [
        `扇风扑面，你借风掩身，指劲暗吐，{n}胁下微麻，损 {d}。`,
        `折扇合拢如锏，你当头一击，{n}举臂硬接，臂骨嗡鸣，气血跌 {d}。`,
        `扇面旋开，罡风四散，{n}立足不稳，被你补上一记，伤 {d}。`,
        `你扇走轻灵，专打{n}旧力将尽处，连削三记，刻 {d}。`,
        `你扇走八卦，风随步转，{n}被困风眼，周身如割 {d}。`,
        `扇面绘山河，你一扇纳千风，{n}倒飞而出，胸骨裂响 {d}。`,
        `你合扇如锏，点向{n}睛明，{n}闭目一瞬，额已见血 {d}。`,
        `扇风倒卷，{n}自家妖气反噬，你趁乱补扇，{d}。`,
        `扇影如蝶，你穿花绕树，{n}目不暇接，喉间已凉 {d}。`,
        `你扇底藏针，罡针透体，{n}穴道被封，再中 {d}。`,
        `扇风凝为一线，你裁纸般裁开{n}护体，{d} 灌入。`,
        `你旋身开扇，扇缘如刀环颈，{n}颈侧血线，伤 {d}。`,
        `乱流中你扇指一点，正中{n}膻中，气机一滞，{d}。`,
        `扇面一展，罡风如刃铺面，{n}面皮先裂，再被风刀割出 {d}。`
    ],
    Spear: [
        `枪杆一抖，枪尖连点，{n}胸前火花四溅，仍被剜去 {d}。`,
        `你扎枪如钉，{n}侧身虽快，肋下仍被枪刃拖出一道 {d}。`,
        `长枪横扫千军，{n}低头虽急，发髻仍被扫散，头皮见血 {d}。`,
        `你突刺变挑，{n}格挡偏了半寸，肩窝一凉，再失 {d}。`,
        `你抖枪成梨花，{n}满眼枪花，腹前已中数枪，{d}。`,
        `长枪如龙摆尾，你扫颈再刺心，{n}俯仰失据，{d}。`,
        `你枪尖点地借反弹，人枪合一，{n}胸前洞穿 {d}。`,
        `枪杆震断{n}爪锋，枪刃已递至喉，{n}再退已迟，{d}。`,
        `你回马枪半式，枪尾先扫{n}膝弯，枪尖再点心口，{d}。`,
        `枪风如幕，你连刺九枪同落一点，{n}护体崩解，{d}。`,
        `你抡枪砸地，碎石如矢，{n}面门见血，再挨枪挑 {d}。`,
        `枪尾点膝、枪尖挑颌，{n}上下不能兼顾，再失 {d}。`,
        `你借马步沉枪，枪如磐石，{n}撞来即被弹回，反震 {d}。`,
        `枪影漫天，{n}不知虚实，心口已凉 {d}。`
    ],
    Blade: [
        `双刃一剪，你绞住{n}兵刃半瞬，另一刃已抹向颈侧，真元伤 {d}。`,
        `你刀走连环，{n}只防住上三路，下盘被撩，气血跌 {d}。`,
        `刀背磕开{n}爪，刀刃反手一送，{n}腹前再添 {d}。`,
        `你以刀柄撞额，刀锋割膝，{n}上下不能兼顾，再损 {d}。`,
        `你双刃一上一下、一虚一实，{n}防上漏下，腹前豁口 {d}。`,
        `刀光如匹练，你旋身斩腰，{n}拦腰而断之势，{d}。`,
        `你抛刃诱敌，{n}格挡空刃，真刃已至后颈，{d}。`,
        `双刀剪月，{n}举爪格挡被绞碎，胸前血泉 {d}。`,
        `你刀走连环，{n}只防住数刀，下一刀入心，{d}。`,
        `刃口互击成鸣，你借声掩杀，{n}耳侧嗡鸣间已中 {d}。`,
        `你矮身双刀拖地，{n}跃起虽快，足筋已伤，{d}。`,
        `刀意如霜，你连斩不歇，{n}护体如冰碎，{d}。`,
        `你交叉双刀锁颈，{n}挣扎间喉管已裂，{d}。`,
        `双刃回旋如轮，{n}卷入刃中，皮开肉绽，再失 {d}。`
    ],
    Glaive: [
        `戟尖虚点，戟援实勾，{n}失衡一瞬，被你拖出 {d}。`,
        `长戟劈落，{n}横架虽格住戟杆，戟刃仍震入肩，伤 {d}。`,
        `你戟扫下盘，{n}跃起，戟援勾踝拽落，补一记 {d}。`,
        `戟风如幕，你连刺带挑，{n}胸前甲片纷飞，刻 {d}。`,
        `你倒拖长戟，戟刃自背后勾向{n}后心，{n}缩肩仍慢，{d}。`,
        `戟尖挑飞{n}兵刃，{n}空手一瞬，戟已至喉，{d}。`,
        `你抡戟成风，{n}卷入戟中，甲裂骨露，{d}。`,
        `戟援卡入{n}关节，{n}挣动时骨裂声起，再承 {d}。`,
        `你跃起劈戟，戟风如瀑，{n}举爪托举被震裂，{d}。`,
        `长戟如龙盘柱，你绕树借劲，戟速骤增，{d}。`,
        `戟尖点地，你借反弹腾空，{n}天灵盖前戟已至，{d}。`,
        `你戟扫下盘、戟挑上盘，{n}俯仰失据，{d}。`,
        `戟援锁住{n}腕肘一绞，{n}挣脱迟了半分，胸腹空门挨 {d}。`,
        `你以戟为盾硬顶，盾中藏戟，{n}腹前一凉，{d}。`
    ],
    Whip: [
        `鞭梢点腕，你打{n}脉门，{n}手一麻，空门大开，挨 {d}。`,
        `长鞭卷足一拖，{n}身形踉跄，你跟进补鞭，伤 {d}。`,
        `鞭影绕颈半圈，你未勒实，只借劲一带，{n}失衡侧摔，再刻 {d}。`,
        `连鞭同落脊背，{n}护体溃散，气血狂掉 {d}。`,
        `长鞭如龙，你抖腕成结，{n}被缠住一瞬，鞭梢已至双目，{d}。`,
        `你甩鞭抽石，碎石如矢，{n}面门见血，再挨鞭勒，{d}。`,
        `鞭风如网，{n}左支右绌，脊背皮开肉绽，{d}。`,
        `你鞭走S形，{n}格挡落空，腰腹连中三鞭 {d}。`,
        `鞭梢点腕打脉，{n}手一麻，空门大开，再挨 {d}。`,
        `你长鞭卷树，借树反弹，鞭速骤增，{n}颈侧血线 {d}。`,
        `鞭影倒卷，{n}自家妖气反噬，你趁乱补鞭，{d}。`,
        `鞭身如铁索横江，你拦腰一绞，{n}腰腹深陷血痕，{d}。`,
        `你抖腕成花，鞭梢连点{n}数穴，{n}真气逆流，气血跌 {d}。`,
        `鞭风灌耳，{n}灵台一眩，护体洞开，再挨一记 {d}。`
    ]
};

/** 本命武器：与气海、宗门器型共鸣（占位 {n}{d}{w}） */
var COMBAT_BONDED_CRIT_LINES = [
    `命火与器同燃——「{w}」与你气海共鸣，一击落下，{n}妖躯剧震，暴伤 {d}。`,
    `宗门所传器型在此显化，{w}鸣如龙吟，洞穿{n}要害，刻 {d}。`,
    `本命纹路在刃上亮起，你人器合一，{n}护体应声龟裂，再承 {d}。`,
    `气海翻涌，{w}似比你更熟此劫——锋锐先至，{n}已吃 {d}。`,
    `你未念诀，器先自鸣；{w}牵引真元倾泻，{n}胸前炸开 {d}。`,
    `本命契动，天地气机偏你半寸——{w}落处，正是{n}死门，暴伤 {d}。`,
    `师门旧诀与掌中{w}合鸣，一击无回，{n}形神俱颤，伤 {d}。`,
    `灵台清明处，唯见{w}一线——你随线而行，{n}已中 {d}。`,
    `器脉与你血脉同跳，{w}所指，罡劲无泄，{n}要害绽 {d}。`,
    `此器认主，今日方醒——{w}光华暴涨，{n}避无可避，硬吃 {d}。`,
    `本命加持下，你力道沉三分、准三分，{n}格挡成空，再承 {d}。`,
    `{w}上旧痕微热，似前辈借你一臂之力——{n}胸前血泉，暴伤 {d}。`,
    `宗门烙印在{w}上一闪，天地气机向你倾斜半寸——{n}要害绽 {d}。`,
    `本命纹路游走，{w}与你同呼同吸，一击落下，{n}形神俱颤 {d}。`,
    `器魂轻颤，似在笑你今日终于不藏——{w}所指，{n}已吃 {d}。`,
    `你未念师门名，{w}已替你念了——罡劲无泄，{n}再承 {d}。`,
    `气海翻涌，{w}先你一步递出——{n}退迟半寸，喉前已见 {d}。`,
    `本命契动，你连呼吸都与{w}同频，{n}格挡成空，暴伤 {d}。`,
    `山门祖训在{w}上回响一瞬——你出手如承前约，{n}要害绽 {d}。`,
    `血脉与器纹同亮，你不问胜负，只问此击是否对得起{w}——{n}硬吃 {d}。`,
    `一念不起，{w}已替你出过一念——罡劲叠浪，{n}护体碎裂，暴伤 {d}。`,
    `劫云偏你半寸，{w}所指处正是天机落点——{n}胸前血泉，{d}。`
];
var COMBAT_BONDED_HIT_LINES = [
    `你御{w}如御己肢，招式虽平，劲力却沉——{n}硬接之下，仍损 {d}。`,
    `本命器在手，你气机更顺，{n}破绽稍露，便被{w}咬住，刻 {d}。`,
    `{w}轻颤示警，你顺势变招，{n}欲退已迟，再失 {d}。`,
    `气海与器呼应，你收放自如，{n}只觉压力如山，气血跌 {d}。`,
    `宗门器型最擅此道：{w}一带一送，{n}守势已破，真元伤 {d}。`,
    `你未逞巧，只信本命——{w}沉猛一击，{n}踉跄倒退，伤 {d}。`,
    `器鸣清越，{n}心神一乱，被你{w}拍、刺、拖连环，叠伤 {d}。`,
    `{w}与你同修多年，今日默契尤甚，{n}换招之际，已挨 {d}。`,
    `本命温养之力渗入经脉，你出手更稳，{n}格挡偏半寸，刻 {d}。`,
    `人器相合，步随身走——{n}只见{w}影不见人，再中 {d}。`,
    `你不求花巧，只以{w}压境，{n}呼吸一窒，气血再跌 {d}。`,
    `器上灵光微漾，替你卸去反震——你趁势再进，{n}又损 {d}。`,
    `宗门气意沿{w}淌入经脉，你出手更直更狠——{n}格挡偏半寸，{d}。`,
    `本命温养经年，今日始见锋芒——{w}一带，{n}守势崩塌，真元伤 {d}。`,
    `你未唤器名，{w}已应你心意，先一步咬住{n}气机，再刻 {d}。`,
    `人器同息，你连半步都省——{n}只见{w}影，已失 {d} 气血。`,
    `师门旧痕在{w}上发烫，似催你再进——{n}胸前一闷，伤 {d}。`,
    `器纹如脉络搏动，你与{w}同频共振，{n}护体如鼓皮，再挨 {d}。`,
    `你不与{n}辩理，只信掌中{w}——沉劲一吐，{n}踉跄再退，{d}。`,
    `本命契文微亮，天地似向你借半寸先机——{w}落处，{n}又损 {d}。`,
    `温养既久，{w}今日格外听话——一带一送，{n}破绽毕露，{d}。`,
    `气海深处器鸣清越，你借势变招，{n}旧力未收，已挨 {d}。`
];

function pickPlayerWeaponHitLine(crit, enemyName, dmgStr) {
    var wItem = getPlayerEquippedWeapon();
    var wName = weaponDisplayNameForCombatLog();

    if (!wItem) {
        var unarmed = crit ? COMBAT_UNARMED_CRIT_LINES : COMBAT_UNARMED_HIT_LINES;
        var uTpl = unarmed[Math.floor(Math.random() * unarmed.length)];
        return formatCombatHitLine(uTpl, enemyName, dmgStr, "");
    }

    var cat = wItem.category ? wItem.category : null;
    var bonded = isBondedWeaponEquipped();

    var def = crit ? COMBAT_DEFAULT_CRIT_LINES : COMBAT_DEFAULT_HIT_LINES;
    var catPool = crit ? (cat && COMBAT_WEAPON_CRIT_LINES[cat]) : (cat && COMBAT_WEAPON_HIT_LINES[cat]);
    var bondedPool = crit ? COMBAT_BONDED_CRIT_LINES : COMBAT_BONDED_HIT_LINES;

    var tpl;
    if (bonded && bondedPool.length && Math.random() < 0.38) {
        tpl = bondedPool[Math.floor(Math.random() * bondedPool.length)];
    } else if (cat && catPool && catPool.length) {
        tpl = catPool[Math.floor(Math.random() * catPool.length)];
    } else {
        tpl = def[Math.floor(Math.random() * def.length)];
    }
    return formatCombatHitLine(tpl, enemyName, dmgStr, wName);
}

// ========== Validation ==========
const hpValidation = () => {
    // Prioritizes player death before the enemy
    if (player.stats.hp < 1) {
        player.stats.hp = 0;
        playerDead = true;
        player.deaths++;
        var defeatMsg =
            typeof pickXiuxianQuote === "function" ? pickXiuxianQuote("combat_defeat") : "";
        if (!defeatMsg) {
            defeatMsg =
                "气血干涸如涸辙之鱼，灵台昏沉，四肢百骸再提不起半分真元——秘境法则一震，将你生生送出此界。这一败，记在心上便是。";
        } else {
            defeatMsg +=
                " 秘境法则一震，将你生生送出此界——这一败，记在心上便是。";
        }
        addCombatLog(defeatMsg);
        document.querySelector("#battleButton").addEventListener("click", function () {
            playerDead = false;

            // 押镖战败：仅结束押镖并回主界面，不重开整局
            if (typeof escort !== "undefined" && escort && escort.active) {
                let dimDungeon = document.querySelector('#dungeon-main');
                dimDungeon.style.filter = "brightness(100%)";
                dimDungeon.style.display = "none";
                combatPanel.style.display = "none";
                runLoad("dungeon-main", "flex");

                clearInterval(dungeonTimer);
                clearInterval(playTimer);
                player.inCombat = false;
                // 押镖失败后回到秘境界面，避免 hp=0 卡死流程
                player.stats.hp = player.stats.hpMax;
                if (typeof endEscortRun === "function") endEscortRun(false);
                if (typeof restartDungeonHubTimers === "function") restartDungeonHubTimers();
                if (typeof playerLoadStats === "function") playerLoadStats();
                if (typeof saveData === "function") saveData();
            if (typeof clearDangerBattleVictoryPending === "function") clearDangerBattleVictoryPending();
                return;
            }
            if (typeof mining !== "undefined" && mining && mining.active) {
                let dimDungeon = document.querySelector('#dungeon-main');
                dimDungeon.style.filter = "brightness(100%)";
                dimDungeon.style.display = "none";
                combatPanel.style.display = "none";
                runLoad("dungeon-main", "flex");

                clearInterval(dungeonTimer);
                clearInterval(playTimer);
                player.inCombat = false;
                player.stats.hp = player.stats.hpMax;
                if (typeof endMiningRun === "function") endMiningRun(false);
                if (typeof restartDungeonHubTimers === "function") restartDungeonHubTimers();
                if (typeof playerLoadStats === "function") playerLoadStats();
                if (typeof saveData === "function") saveData();
                if (typeof clearDangerBattleVictoryPending === "function") clearDangerBattleVictoryPending();
                return;
            }

            // 普通秘境战败：重开整局
            let dimDungeon = document.querySelector('#dungeon-main');
            dimDungeon.style.filter = "brightness(100%)";
            dimDungeon.style.display = "none";
            combatPanel.style.display = "none";
            runLoad("dungeon-main", "flex");

            clearInterval(dungeonTimer);
            clearInterval(playTimer);
            if (typeof clearDangerBattleVictoryPending === "function") clearDangerBattleVictoryPending();
            progressReset();
            setTimeout(function () {
                allocationPopup();
            }, 350);
        });
        endCombat();
    } else if (enemy.stats.hp < 1) {
        // Gives out all the reward and show the claim button
        enemy.stats.hp = 0;
        enemyDead = true;
        player.kills++;
        dungeon.statistics.kills++;
        addCombatLog(pickCombatKillLine());
        var expLines = [
            `杀伐止息，天地气机为之一清。你吐纳三息，将殒落残韵炼化入体，丹田微热——此番竟汲取了 <b>${nFormatter(enemy.rewards.exp)}</b> 点修为。`,
            `敌焰既灭，灵机回流。你闭目导引，将散逸修为尽数纳入丹田：<b>${nFormatter(enemy.rewards.exp)}</b> 点感悟入账。`,
            `残响未绝，你已运转周天，把战场余温炼作进境之阶——此番修为 <b>${nFormatter(enemy.rewards.exp)}</b> 点。`,
            `一缕清灵自顶门灌入，如醍醐灌顶；你心知此战未白打，竟得 <b>${nFormatter(enemy.rewards.exp)}</b> 点修为。`
        ];
        addCombatLog(expLines[Math.floor(Math.random() * expLines.length)]);
        playerExpGain();
        var goldLines = [
            `灵石自虚空簌簌而落，叮当作响。你袖袍一卷，尽数拢入囊中：入手 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(enemy.rewards.gold)}</b> 枚。`,
            `金屑如雨，落地成音。你俯拾之间，已纳 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(enemy.rewards.gold)}</b> 枚灵石。`,
            `虚空裂隙里漏下几串灵石，撞地清越。你尽数收起，共 <i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(enemy.rewards.gold)}</b> 枚。`,
            `灵潮退后，地上唯余灵石微光。你点数入囊：<i class="fas fa-coins" style="color: #FFD700;"></i><b>${nFormatter(enemy.rewards.gold)}</b> 枚。`
        ];
        addCombatLog(goldLines[Math.floor(Math.random() * goldLines.length)]);
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.44) {
            addCombatLog(pickXiuxianQuote("victory"));
        }
        if (typeof pickXiuxianQuote === "function" && Math.random() < 0.4) {
            addCombatLog(pickXiuxianQuote("combat_aftermath"));
        }
        player.gold += enemy.rewards.gold;
        playerLoadStats();
        if (enemy.rewards.drop) {
            createEquipmentPrint("combat");
        }
        if (typeof tryRollPetDrop === "function") {
            tryRollPetDrop("combat");
        }
        if (typeof tryRollEnhanceStoneDrop === "function") {
            tryRollEnhanceStoneDrop(true, false);
        }
        if (typeof tryRollEnchantStoneDrop === "function") {
            tryRollEnchantStoneDrop(true, false);
        }
        if (typeof tryRollSocketOpenerFromEliteKill === "function") {
            tryRollSocketOpenerFromEliteKill();
        }
        if (typeof tryRollTalentFruitFromEliteKill === "function") {
            tryRollTalentFruitFromEliteKill();
        }
        if (
            enemy &&
            enemy.bossRole === "guardian" &&
            typeof escort !== "undefined" &&
            escort &&
            !escort.active &&
            typeof grantSocketOpenerDungeonGuardian === "function"
        ) {
            grantSocketOpenerDungeonGuardian();
        }
        if (
            enemy &&
            enemy.bossRole === "guardian" &&
            typeof escort !== "undefined" &&
            escort &&
            !escort.active &&
            typeof grantTalentFruitDungeonGuardian === "function"
        ) {
            grantTalentFruitDungeonGuardian();
        }
        if (typeof claimTreasureAmbushReward === "function") {
            claimTreasureAmbushReward();
        }
        if (typeof claimEscortBattleVictory === "function") {
            claimEscortBattleVictory();
        }
        if (typeof claimMiningBattleVictory === "function") {
            claimMiningBattleVictory();
        }
        if (typeof claimDangerBattleVictory === "function") {
            claimDangerBattleVictory();
        }

        // Recover 20% of players health
        player.stats.hp += Math.round((player.stats.hpMax * 20) / 100);
        playerLoadStats();

        // Close the battle panel
        document.querySelector("#battleButton").addEventListener("click", function () {

            // Clear combat backlog and transition to dungeon exploration
            let dimDungeon = document.querySelector('#dungeon-main');
            dimDungeon.style.filter = "brightness(100%)";
            if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
                dungeon.status.event = false;
            }
            combatPanel.style.display = "none";
            enemyDead = false;
            combatBacklog.length = 0;
        });
        endCombat();
    }
}

// ========== Attack Functions ==========
const playerAttack = () => {
    if (!player.inCombat) {
        return;
    }
    if (player.inCombat) {
    }

    // Calculates the damage and attacks the enemy
    let crit;
    let damage = player.stats.atk * (player.stats.atk / (player.stats.atk + enemy.stats.def));
    // Randomizes the damage by 90% - 110%
    let dmgRange = 0.9 + Math.random() * 0.2;
    damage = damage * dmgRange;
    // Check if the attack is a critical hit
    if (Math.floor(Math.random() * 100) < player.stats.critRate) {
        crit = true;
        dmgtype = "点暴伤";
        damage = Math.round(damage * (1 + (player.stats.critDmg / 100)));
    } else {
        crit = false;
        dmgtype = "点真元伤";
        damage = Math.round(damage);
    }

    objectValidation();
    var equippedP = player.equippedPassives || [];
    var cp = typeof aggregateCombatPassives === "function" ? aggregateCombatPassives(equippedP) : {};
    if (crit && cp.onCrit_damageMultPct) {
        damage = Math.round(damage * (1 + cp.onCrit_damageMultPct / 100));
    }
    if (cp.onHit_enemyCurrHpPct) {
        damage += Math.round((enemy.stats.hp * cp.onHit_enemyCurrHpPct) / 100);
    }
    if (cp.onHit_enemyMissingHpPct) {
        var enMiss = Math.max(0, (enemy.stats.hpMax || 0) - enemy.stats.hp);
        damage += Math.round((enMiss * cp.onHit_enemyMissingHpPct) / 100);
    }
    if (cp.onHit_selfMissingHpPct) {
        var plMiss = Math.max(0, player.stats.hpMax - player.stats.hp);
        damage += Math.round((plMiss * cp.onHit_selfMissingHpPct) / 100);
    }
    if (cp.onHit_selfHpMaxPct) {
        damage += Math.round((player.stats.hpMax * cp.onHit_selfHpMaxPct) / 100);
    }
    if (cp.onHit_flat) {
        damage += Math.round(cp.onHit_flat);
    }
    if (cp.onHit_damageMultPct) {
        damage = Math.round(damage + (damage * cp.onHit_damageMultPct) / 100);
    }
    if (
        typeof dungeon !== "undefined" &&
        dungeon &&
        dungeon.settings &&
        dungeon.settings.chainTitleBuff &&
        typeof dungeon.settings.chainTitleBuff.atkMul === "number" &&
        dungeon.settings.chainTitleBuff.atkMul > 0
    ) {
        damage = Math.round(damage * dungeon.settings.chainTitleBuff.atkMul);
    }
    if (cp.onHit_stackAtk) {
        player.tempStats.atk = (player.tempStats.atk || 0) + cp.onHit_stackAtk;
        objectValidation();
        if (typeof calculateStats === "function") calculateStats();
        saveData();
    }
    if (cp.onHit_stackAtkSpd) {
        player.tempStats.atkSpd = (player.tempStats.atkSpd || 0) + cp.onHit_stackAtkSpd;
        objectValidation();
        if (typeof calculateStats === "function") calculateStats();
        saveData();
    }

    // Lifesteal formula（含被动「以战养战」类额外吸血%）
    var vampPct = player.stats.vamp + (cp.onHit_vampBonusPct || 0);
    let lifesteal = Math.round(damage * (vampPct / 100));

    var styleTag = getPlayerWeaponCombatStyle();
    var incomingMeta = applyEnemyUniqueOnIncomingHit(damage, crit, styleTag);
    damage = incomingMeta.damage;

    // Apply the calculations to combat
    var shieldResult = absorbDamageByEnemyShield(damage);
    enemy.stats.hp -= shieldResult.hpDamage;
    lifesteal = Math.round(shieldResult.hpDamage * (vampPct / 100));
    player.stats.hp += lifesteal;
    const shownDamage = incomingMeta.dodged ? 0 : (shieldResult.hpDamage > 0 ? shieldResult.hpDamage : damage);
    const dmgStr = nFormatter(shownDamage) + dmgtype;
    let hitLine = pickPlayerWeaponHitLine(crit, enemy.name, dmgStr);
    if (shieldResult.absorbed > 0) {
        hitLine += ` 护盾震鸣，抵消了 <b>${nFormatter(shieldResult.absorbed)}</b> 点伤害。`;
        if (shieldResult.shieldBroken) {
            hitLine += " 你一击碎盾，敌势骤乱，三息之间其护体尽失（易伤 +20%）。";
        }
    }
    if (incomingMeta.dodged) {
        hitLine += " 对方身形化作残影，这一击几乎被完全卸去。";
    }
    if (incomingMeta.chargedInterrupted) {
        hitLine += " 暴击正中要害，硬生生打断了对方蓄力！";
    }
    if (incomingMeta.styleNote) {
        hitLine += " " + incomingMeta.styleNote;
    }
    var thornReflect = applyEnemyThornsReflect(shieldResult.hpDamage, styleTag);
    if (thornReflect > 0) {
        player.stats.hp -= thornReflect;
        hitLine += ` 对方荆棘反震，你反受 <b>${nFormatter(thornReflect)}</b> 点真元伤。`;
    }
    if (lifesteal > 0) {
        hitLine += ` 丝丝生机自伤口反哺入体，气血回流 <b>${nFormatter(lifesteal)}</b>。`;
    }
    addCombatLog(hitLine);
    if (triggerEnemyBerserkIfNeeded()) {
        addCombatLog(`${enemy.name}妖气失控，进入狂怒状态：攻势更猛、出手更快！`);
    }
    hpValidation();
    playerLoadStats();
    enemyLoadStats();

    // Damage effect（无立绘时对整块敌人信息区抖动）
    let enemyPanel = document.querySelector("#enemyPanel");
    if (enemyPanel) {
        enemyPanel.classList.add("animation-shake");
        setTimeout(() => {
            enemyPanel.classList.remove("animation-shake");
        }, 200);
    }

    // Damage numbers
    const dmgContainer = document.querySelector("#dmg-container");
    const dmgNumber = document.createElement("p");
    dmgNumber.classList.add("dmg-numbers");
    if (crit) {
        dmgNumber.style.color = "gold";
        dmgNumber.innerHTML = nFormatter(shownDamage) + "!";
    } else {
        dmgNumber.innerHTML = nFormatter(shownDamage);
    }
    dmgContainer.appendChild(dmgNumber);
    setTimeout(() => {
        dmgContainer.removeChild(dmgContainer.lastElementChild);
    }, 370);

    // Attack Timer
    if (player.inCombat) {
        setTimeout(() => {
            if (player.inCombat) {
                playerAttack();
            }
        }, (100 / player.stats.atkSpd) * COMBAT_PACE_SLOW_MULT);
    }
}

const petAttack = () => {
    if (!player.inCombat) {
        return;
    }
    var pcs = typeof getPetCombatStats === "function" ? getPetCombatStats() : null;
    if (!pcs || !enemy || enemy.stats.hp < 1) {
        return;
    }

    let crit;
    let damage = pcs.atk * (pcs.atk / (pcs.atk + enemy.stats.def));
    let dmgRange = 0.9 + Math.random() * 0.2;
    damage = damage * dmgRange;
    if (Math.floor(Math.random() * 100) < pcs.critRate) {
        crit = true;
        dmgtype = "点暴伤";
        damage = Math.round(damage * (1 + (pcs.critDmg / 100)));
    } else {
        crit = false;
        dmgtype = "点真元伤";
        damage = Math.round(damage);
    }

    var vampPct = pcs.vamp;
    let lifesteal = Math.round(damage * (vampPct / 100));

    var petIncomingMeta = applyEnemyUniqueOnIncomingHit(damage, crit, "staff");
    damage = petIncomingMeta.damage;
    var petShieldResult = absorbDamageByEnemyShield(damage);
    enemy.stats.hp -= petShieldResult.hpDamage;
    lifesteal = Math.round(petShieldResult.hpDamage * (vampPct / 100));
    player.stats.hp += lifesteal;
    const petShownDamage = petIncomingMeta.dodged ? 0 : (petShieldResult.hpDamage > 0 ? petShieldResult.hpDamage : damage);
    const dmgStr = nFormatter(petShownDamage) + dmgtype;
    let hitLine =
        typeof pickPetCombatHitLine === "function"
            ? pickPetCombatHitLine(crit, enemy.name, dmgStr, pcs.name)
            : "";
    if (lifesteal > 0) {
        hitLine += ` 灵兽反哺，你气血回流 <b>${nFormatter(lifesteal)}</b>。`;
    }
    if (petShieldResult.absorbed > 0) {
        hitLine += ` 妖盾抵消了 <b>${nFormatter(petShieldResult.absorbed)}</b> 点伤害。`;
        if (petShieldResult.shieldBroken) {
            hitLine += " 灵兽顺势击溃了敌方护盾，敌方三息易伤。";
        }
    }
    if (petIncomingMeta.dodged) {
        hitLine += " 但敌躯化影闪避，命中被大幅化解。";
    }
    if (petIncomingMeta.chargedInterrupted) {
        hitLine += " 灵兽暴击打断了敌方冲锋蓄力！";
    }
    if (petIncomingMeta.styleNote) {
        hitLine += " " + petIncomingMeta.styleNote;
    }
    var petThornReflect = applyEnemyThornsReflect(petShieldResult.hpDamage, "staff");
    if (petThornReflect > 0) {
        player.stats.hp -= petThornReflect;
        hitLine += ` 荆棘反震波及你本体，反受 <b>${nFormatter(petThornReflect)}</b> 点伤害。`;
    }
    addCombatLog(hitLine);
    if (triggerEnemyBerserkIfNeeded()) {
        addCombatLog(`${enemy.name}狂怒爆发，妖威陡升！`);
    }
    hpValidation();
    playerLoadStats();
    enemyLoadStats();

    let enemyPanel = document.querySelector("#enemyPanel");
    if (enemyPanel) {
        enemyPanel.classList.add("animation-shake");
        setTimeout(() => {
            enemyPanel.classList.remove("animation-shake");
        }, 200);
    }

    const petDmgBox = document.querySelector("#pet-dmg-container");
    if (petDmgBox) {
        const petDmgNum = document.createElement("p");
        petDmgNum.classList.add("dmg-numbers");
        if (crit) {
            petDmgNum.style.color = "#c9a227";
            petDmgNum.innerHTML = nFormatter(petShownDamage) + "!";
        } else {
            petDmgNum.style.color = "#9dd69c";
            petDmgNum.innerHTML = nFormatter(petShownDamage);
        }
        petDmgBox.appendChild(petDmgNum);
        setTimeout(() => {
            if (petDmgBox.lastElementChild) petDmgBox.removeChild(petDmgBox.lastElementChild);
        }, 370);
    }

    if (player.inCombat) {
        setTimeout(() => {
            if (player.inCombat) {
                petAttack();
            }
        }, (100 / pcs.atkSpd) * COMBAT_PACE_SLOW_MULT);
    }
};

const enemyAttack = () => {
    if (!player.inCombat) {
        return;
    }
    if (player.inCombat) {
    }

    // Calculates the damage and attacks the player
    let damage = enemy.stats.atk * (enemy.stats.atk / (enemy.stats.atk + player.stats.def));
    let lifesteal = Math.round(enemy.stats.atk * (enemy.stats.vamp / 100));
    // Randomizes the damage by 90% - 110%
    let dmgRange = 0.9 + Math.random() * 0.2;
    damage = damage * dmgRange;
    // Check if the attack is a critical hit
    if (Math.floor(Math.random() * 100) < enemy.stats.critRate) {
        dmgtype = "点暴伤";
        damage = Math.round(damage * (1 + (enemy.stats.critDmg / 100)));
    } else {
        dmgtype = "点真元伤";
        damage = Math.round(damage);
    }

    objectValidation();
    var cpEn = typeof aggregateCombatPassives === "function" ? aggregateCombatPassives(player.equippedPassives || []) : {};
    if (cpEn.dmgTakenReducePct) {
        damage = Math.round(damage - (damage * cpEn.dmgTakenReducePct) / 100);
    }
    if (
        typeof dungeon !== "undefined" &&
        dungeon &&
        dungeon.settings &&
        dungeon.settings.chainTitleBuff &&
        typeof dungeon.settings.chainTitleBuff.dmgTakenMul === "number" &&
        dungeon.settings.chainTitleBuff.dmgTakenMul > 0
    ) {
        damage = Math.round(damage * dungeon.settings.chainTitleBuff.dmgTakenMul);
    }

    var baseEnemyDamage = damage;
    var chargeState = applyChargerIntentToEnemyDamage(damage);
    if (chargeState.skipAttack) {
        addCombatLog(`${enemy.name}俯身蓄势，妖气疯狂汇聚——下一击势必石破天惊！`);
        if (player.inCombat) {
            setTimeout(() => {
                if (player.inCombat) {
                    enemyAttack();
                }
            }, (1000 / enemy.stats.atkSpd) * COMBAT_PACE_SLOW_MULT);
        }
        return;
    }
    damage = chargeState.damage;

    // Apply the calculations
    player.stats.hp -= damage;
    if (cpEn.thornsPctOfTaken) {
        enemy.stats.hp -= Math.round((damage * cpEn.thornsPctOfTaken) / 100);
    }
    enemy.stats.hp += lifesteal;
    var summonBurst = tryTriggerSummonerBurst();
    if (summonBurst > 0) {
        player.stats.hp -= summonBurst;
    }
    const totalEnemyDamage = damage + summonBurst;
    const enDmgStr = nFormatter(totalEnemyDamage) + dmgtype;
    const enemyHitLines = [
        `${enemy.name}凶焰暴涨，妖气如墨泼面，直扑你心脉所在——你护体一滞，竟被撕开血口，刻下 <b>${enDmgStr}</b>。`,
        `${enemy.name}嘶吼着碾碎脚下尘土，罡风利爪横扫而至，你横臂硬接，臂骨嗡鸣，气血翻腾间折去 <b>${enDmgStr}</b>。`,
        `腥风扑面！${enemy.name}趁你旧力未生、新力未至的刹那暴起，一记狠手落在你肩头，震出 <b>${enDmgStr}</b>。`,
        `${enemy.name}眸中凶光一闪，竟以伤换势，硬生生与你换了一招——你喉头一甜，身上再添 <b>${enDmgStr}</b> 的创伤。`,
        `${enemy.name}尾扫（翼拍/角顶）骤至，你侧身已迟半寸，肋下火辣，气血骤减 <b>${enDmgStr}</b>。`,
        `黑雾中探出利爪，直掏你丹田方位——你急封气门，仍被震得五脏六腑移位，伤 <b>${enDmgStr}</b>。`,
        `${enemy.name}口吐妖芒，如矢如电；你举臂格挡，火星四溅，臂上再添 <b>${enDmgStr}</b> 创口。`,
        `地面忽裂，${enemy.name}自下方窜出，獠牙擦过你胫骨——剧痛袭来，失 <b>${enDmgStr}</b> 气血。`,
        `${enemy.name}以声为刃，尖啸贯耳，你灵台一眩，护体洞开，被撕去 <b>${enDmgStr}</b>。`,
        `妖气凝成实质，如鞭抽脊，你踉跄半步，脊背发冷，气血跌落 <b>${enDmgStr}</b>。`
    ];
    let enemyLine = enemyHitLines[Math.floor(Math.random() * enemyHitLines.length)];
    if (enemy.mechanic && enemy.mechanic.type === "charger" && chargeState.damage > baseEnemyDamage) {
        enemyLine += " 蓄满的一记重击轰然落下，几乎震散你周身护体。";
    }
    if (summonBurst > 0) {
        enemyLine += ` 其召出的妖仆趁隙扑杀，再补 <b>${nFormatter(summonBurst)}点真元伤</b>。`;
    }
    if (lifesteal > 0) {
        enemyLine += ` 敌躯竟借你之血反哺，气息诡异地稳了一线（吸血 <b>${nFormatter(lifesteal)}</b>）。`;
    }
    addCombatLog(enemyLine);
    hpValidation();
    playerLoadStats();
    enemyLoadStats();

    // Damage effect
    let playerPanel = document.querySelector('#playerPanel');
    playerPanel.classList.add("animation-shake");
    setTimeout(() => {
        playerPanel.classList.remove("animation-shake");
    }, 200);

    // Attack Timer
    if (player.inCombat) {
        setTimeout(() => {
            if (player.inCombat) {
                enemyAttack();
            }
        }, (1000 / enemy.stats.atkSpd) * COMBAT_PACE_SLOW_MULT);
    }
}

// ========== Combat Backlog ==========
const combatBacklog = [];

/** 单场斗法日志上限，避免高频出手时数组无限变长 */
const COMBAT_LOG_MAX = 160;

// Add a log to the combat backlog
const addCombatLog = (message) => {
    combatBacklog.push(message);
    if (combatBacklog.length > COMBAT_LOG_MAX) {
        combatBacklog.splice(0, combatBacklog.length - COMBAT_LOG_MAX);
    }
    updateCombatLog();
}

// Displays every combat activity
const updateCombatLog = () => {
    let combatLogBox = document.getElementById("combatLogBox");
    if (!combatLogBox) return;
    combatLogBox.innerHTML = "";

    for (let message of combatBacklog) {
        let logElement = document.createElement("p");
        logElement.innerHTML = message;
        combatLogBox.appendChild(logElement);
    }

    if (enemyDead) {
        let button = document.createElement("div");
        button.className = "decision-panel";
        button.innerHTML = `<button id="battleButton">收纳战利</button>`;
        combatLogBox.appendChild(button);
    }

    if (playerDead) {
        let button = document.createElement("div");
        button.className = "decision-panel";
        button.innerHTML = `<button id="battleButton">重整再战</button>`;
        combatLogBox.appendChild(button);
    }

    combatLogBox.scrollTop = combatLogBox.scrollHeight;
}

// Combat Timer
let combatSeconds = 0;
let combatTimer = null;

const startCombat = () => {
    player.inCombat = true;

    // Starts the timer for player and enemy attacks along with combat timer
    setTimeout(playerAttack, (100 / player.stats.atkSpd) * COMBAT_PACE_SLOW_MULT);
    setTimeout(enemyAttack, (100 / enemy.stats.atkSpd) * COMBAT_PACE_SLOW_MULT);
    var pcs0 = typeof getPetCombatStats === "function" ? getPetCombatStats() : null;
    if (pcs0) {
        setTimeout(function () {
            if (player.inCombat) {
                petAttack();
            }
        }, (100 / pcs0.atkSpd) * COMBAT_PACE_SLOW_MULT);
    }
    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(50%)";

    playerLoadStats();
    enemyLoadStats();

    if (typeof dungeon !== "undefined" && dungeon) {
        if (!dungeon.status || typeof dungeon.status !== "object") {
            dungeon.status = { exploring: false, paused: true, event: false };
        }
        dungeon.status.event = true;
    }
    combatPanel.style.display = "flex";

    combatTimer = setInterval(combatCounter, 100);
}

const endCombat = () => {
    player.inCombat = false;
    objectValidation();
    if (player.tempStats) {
        player.tempStats.atk = 0;
        player.tempStats.atkSpd = 0;
    }
    if (typeof calculateStats === "function") calculateStats();
    saveData();

    // Stops every timer in combat
    if (combatTimer) {
        clearInterval(combatTimer);
        combatTimer = null;
    }
    combatSeconds = 0;
}

const combatCounter = () => {
    combatSeconds++;
}

/** 斗法敌阵头像：品质档 + BOSS（层主 / 秘境主宰）霸气样式 */
function getEnemyCombatQualityUi() {
    var qt = enemy && typeof enemy.qualityTier === "number" ? Math.max(0, Math.min(9, enemy.qualityTier)) : 0;
    var ql = "";
    if (typeof ENEMY_QUALITY_TIERS !== "undefined" && ENEMY_QUALITY_TIERS[qt] && ENEMY_QUALITY_TIERS[qt].label) {
        ql = ENEMY_QUALITY_TIERS[qt].label;
    }
    var icons = [
        "fa-skull",
        "fa-skull",
        "fa-bug",
        "fa-spider",
        "fa-dragon",
        "fa-dragon",
        "fa-dragon",
        "fa-dragon",
        "fa-meteor",
        "fa-skull-crossbones"
    ];
    var iconClass = icons[qt] || "fa-skull";
    var bossRole = enemy && enemy.bossRole ? enemy.bossRole : null;
    if (bossRole === "guardian") {
        iconClass = "fa-crown";
    } else if (bossRole === "sboss") {
        iconClass = "fa-dragon";
    }
    var bossCardClass = bossRole ? " combat-card--boss combat-card--boss-" + bossRole : "";
    var bossAvatarClass = bossRole ? " combat-avatar--boss combat-avatar--boss-" + bossRole : "";
    var bossTitlePrefix =
        bossRole === "guardian"
            ? '<span class="combat-boss-tag combat-boss-tag--guardian">层主</span>'
            : bossRole === "sboss"
              ? '<span class="combat-boss-tag combat-boss-tag--sboss">秘境主宰</span>'
              : "";
    var titleAttr =
        (bossRole === "guardian" ? "层主镇守 · " : bossRole === "sboss" ? "秘境主宰 · " : "") +
        (ql ? "妖躯 " + ql : "妖躯");
    return {
        qt: qt,
        ql: ql,
        iconClass: iconClass,
        bossRole: bossRole,
        bossCardClass: bossCardClass,
        bossAvatarClass: bossAvatarClass,
        bossTitlePrefix: bossTitlePrefix,
        titleAttr: titleAttr
    };
}

const showCombatInfo = () => {
    var eqUi = getEnemyCombatQualityUi();
    var mLabel = getEnemyMechanicLabel();
    document.querySelector('#combatPanel').innerHTML = `
    <div class="content modal-sheet modal-sheet--combat combat-sheet">
        <header class="combat-sheet__head">
            <div class="combat-sheet__head-inner">
                <span class="combat-sheet__badge">斗法</span>
                <span class="combat-sheet__sub">灵台映照 · 气机流转</span>
            </div>
        </header>
        <div class="combat-sheet__body">
            <section class="combat-card combat-card--enemy${eqUi.bossCardClass}" id="enemyPanel">
                <div class="combat-card__row">
                    <div class="combat-avatar combat-avatar--enemy combat-avatar--qt combat-avatar--qt-${eqUi.qt}${eqUi.bossAvatarClass}" title="${eqUi.titleAttr}" aria-label="${eqUi.titleAttr}">
                        ${eqUi.bossRole === "guardian" ? '<span class="combat-boss-aura combat-boss-aura--guardian" aria-hidden="true"></span>' : ""}
                        ${eqUi.bossRole === "sboss" ? '<span class="combat-boss-aura combat-boss-aura--sboss" aria-hidden="true"></span>' : ""}
                        <i class="fas ${eqUi.iconClass} combat-boss-icon${eqUi.bossRole ? " combat-boss-icon--" + eqUi.bossRole : ""}" aria-hidden="true"></i>
                    </div>
                    <div class="combat-card__main">
                        <h4 class="combat-card__title">${eqUi.bossTitlePrefix}${enemy.name}</h4>
                        <p class="combat-card__subtitle">${cultivationRealmLabel(enemy.lvl)}${mLabel ? " · " + mLabel : ""}</p>
                        ${eqUi.ql ? `<p class="combat-card__quality combat-card__quality--t${eqUi.qt}">品质 · ${eqUi.ql}</p>` : ""}
                    </div>
                </div>
                <div class="combat-bar combat-bar--hp">
                    <div class="combat-bar__track combat-bar__track--enemy">
                        <div class="combat-bar__dmg" id="enemy-hp-dmg"></div>
                        <div class="combat-bar__fill combat-bar__fill--enemy" id="enemy-hp-battle"></div>
                    </div>
                </div>
                <div id="dmg-container" class="dmg-container combat-card__dmg"></div>
            </section>
            <div class="combat-sheet__player-row">
            <section class="combat-card combat-card--player" id="playerPanel">
                <div class="combat-card__row">
                    <div class="combat-avatar combat-avatar--player" aria-hidden="true"><i class="fas fa-user"></i></div>
                    <div class="combat-card__main">
                        <p id="player-combat-info" class="combat-card__playerline"></p>
                    </div>
                </div>
                <div class="combat-bar combat-bar--hp">
                    <div class="combat-bar__track combat-bar__track--player">
                        <div class="combat-bar__dmg" id="player-hp-dmg"></div>
                        <div class="combat-bar__fill combat-bar__fill--player" id="player-hp-battle"></div>
                    </div>
                </div>
                <div class="combat-exp-block">
                    <div class="combat-exp-block__head">
                        <span class="combat-exp-block__lbl"><i class="fas fa-yin-yang" aria-hidden="true"></i> 修为</span>
                        <span class="combat-exp-block__nums" id="player-exp-combat-text"></span>
                    </div>
                    <div class="combat-exp-block__track">
                        <div class="combat-exp-block__fill" id="player-exp-bar"></div>
                    </div>
                </div>
            </section>
            ${typeof getPetCombatSidebarHtml === "function" ? getPetCombatSidebarHtml() : ""}
            </div>
            <section class="combat-card combat-card--log">
                <div class="combat-log__head">战况</div>
                <div id="combatLogBox" class="combat-log__inner"></div>
            </section>
        </div>
    </div>
    `;
}
