
const WEAPON_CATEGORY_ZH = {
    Sword: "剑",
    Axe: "巨斧",
    Hammer: "重锤",
    Dagger: "短刺",
    Flail: "链锤",
    Scythe: "镰刀",
    Staff: "法杖",
    Fan: "折扇",
    Spear: "枪",
    Blade: "双锋",
    Glaive: "戟",
    Whip: "长鞭"
};


function getSectWeaponTypeZh(sectId) {
    if (!sectId || typeof getSectWeaponCategory !== "function") return "";
    var cat = getSectWeaponCategory(sectId);
    if (!cat) return "";
    return WEAPON_CATEGORY_ZH[cat] || cat;
}


const DEFENSE_CATEGORY_ZH = {
    Plate: "板甲",
    Chain: "链甲",
    Leather: "皮甲",
    Tower: "塔盾",
    Kite: "轻盾",
    Buckler: "圆盾",
    "Great Helm": "重盔",
    "Horned Helm": "角盔"
};

const ARMOR_CLASS_TYPES = ["Heavy", "Light", "Cloth", "Plate", "Leather"];
const ARMOR_CLASS_LABEL_ZH = {
    Heavy: "重甲",
    Light: "轻甲",
    Cloth: "布甲",
    Plate: "板甲",
    Leather: "皮甲"
};

const SECT_ARMOR_CLASS_AFFINITY = {
    jianzhong: { favored: "Light", penalized: "Cloth" },
    juling: { favored: "Heavy", penalized: "Light" },
    kuanglan: { favored: "Plate", penalized: "Cloth" },
    wuxing: { favored: "Light", penalized: "Heavy" },
    shengshi: { favored: "Plate", penalized: "Leather" },
    jihuan: { favored: "Heavy", penalized: "Light" },
    hehuan: { favored: "Cloth", penalized: "Plate" },
    xiaoyao: { favored: "Leather", penalized: "Heavy" },
    mingjiao: { favored: "Plate", penalized: "Light" },
    xuesha: { favored: "Leather", penalized: "Cloth" },
    fenmai: { favored: "Cloth", penalized: "Heavy" },
    jueming: { favored: "Light", penalized: "Plate" }
};

function getArmorClassAffinityMultiplier(armorClass, sectId) {
    if (!armorClass || !sectId) return 1;
    var aff = SECT_ARMOR_CLASS_AFFINITY[sectId];
    if (!aff) return 1;
    if (aff.favored === armorClass) return 1.2;
    if (aff.penalized === armorClass) return 0.8;
    return 1;
}

function getArmorClassAffinityText(armorClass, sectId) {
    var m = getArmorClassAffinityMultiplier(armorClass, sectId);
    if (m > 1) return "门派契合 +20%";
    if (m < 1) return "门派克制 -20%";
    return "门派契合 0%";
}

function getSectArmorAffinitySummaryZh(sectId) {
    if (!sectId) return "";
    var aff = SECT_ARMOR_CLASS_AFFINITY[sectId];
    if (!aff) return "";
    var favoredZh = ARMOR_CLASS_LABEL_ZH[aff.favored] || aff.favored || "";
    if (!favoredZh) return "";
    return favoredZh;
}

function inferArmorClass(item) {
    if (!item) return "";
    if (item.armorClass && ARMOR_CLASS_LABEL_ZH[item.armorClass]) return item.armorClass;
    if (item.category === "Plate") return "Plate";
    if (item.category === "Chain") return "Heavy";
    if (item.category === "Leather") return "Leather";
    return "";
}

function getArmorClassBonusMap(item) {
    if (!item || item.type !== "Armor") return null;
    var armorClass = inferArmorClass(item);
    if (!armorClass) return null;
    var lvl = Math.max(1, Math.floor(Number(item.lvl) || 1));
    var baseBonus = null;
    switch (armorClass) {
        case "Heavy":
            baseBonus = { hp: Math.round(lvl * 40), def: Math.round(lvl * 18) };
            break;
        case "Light":
            baseBonus = {
                atkSpd: Number((4 + lvl * 0.08).toFixed(2)),
                critRate: Number((3 + lvl * 0.06).toFixed(2))
            };
            break;
        case "Cloth":
            baseBonus = {
                critDmg: Number((5 + lvl * 0.09).toFixed(2)),
                vamp: Number((2 + lvl * 0.05).toFixed(2))
            };
            break;
        case "Plate":
            baseBonus = { hp: Math.round(lvl * 55), def: Math.round(lvl * 12) };
            break;
        case "Leather":
            baseBonus = {
                atk: Math.round(lvl * 10),
                critRate: Number((2 + lvl * 0.05).toFixed(2))
            };
            break;
        default:
            return null;
    }
    var sectId = player && player.sect ? String(player.sect) : "";
    var mul = getArmorClassAffinityMultiplier(armorClass, sectId);
    if (mul === 1) return baseBonus;
    var out = {};
    for (var k in baseBonus) {
        if (!Object.prototype.hasOwnProperty.call(baseBonus, k)) continue;
        var v = Number(baseBonus[k]);
        if (!isFinite(v)) continue;
        if (k === "critRate" || k === "critDmg" || k === "atkSpd" || k === "vamp") {
            out[k] = Number((v * mul).toFixed(2));
        } else {
            out[k] = Math.round(v * mul);
        }
    }
    return out;
}

function formatArmorClassBonusMetaHtml(item) {
    if (!item || item.type !== "Armor") return "";
    var armorClass = inferArmorClass(item);
    if (!armorClass) return "";
    var bonus = getArmorClassBonusMap(item);
    if (!bonus) return "";
    var sectId = player && player.sect ? String(player.sect) : "";
    var affinity = getArmorClassAffinityText(armorClass, sectId);
    var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var lines = [];
    var keys = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = bonus[k];
        if (typeof v !== "number" || !isFinite(v) || v === 0) continue;
        if (k === "critRate" || k === "critDmg" || k === "atkSpd" || k === "vamp") {
            lines.push(formatEquipmentStatKeyLabel(k) + "+" + v.toFixed(2).replace(rx, "$1") + "%");
        } else {
            lines.push(formatEquipmentStatKeyLabel(k) + "+" + Math.round(v));
        }
    }
    return (
        '<p class="eq-meta-armor-class">甲种：<strong>' +
        (ARMOR_CLASS_LABEL_ZH[armorClass] || armorClass) +
        "</strong> · " +
        affinity +
        " · 加成 " +
        lines.join("，") +
        "</p>"
    );
}

const ACCESSORY_CATEGORY_ZH = {
    SoulLocket: "魂锁",
    JadePendant: "玉坠",
    PrayerBeads: "念珠",
    DaoSealRing: "道印戒",
    SpiritBand: "灵环",
    XuanRing: "玄戒"
};

const EQUIP_SLOT_TYPE_ORDER = ["Weapon", "Armor", "Shield", "Helmet", "Ring", "Necklace"];
const EQUIP_SLOT_TYPE_LABEL_ZH = {
    Weapon: "武器",
    Armor: "护甲",
    Shield: "盾",
    Helmet: "头盔",
    Ring: "戒指",
    Necklace: "项链"
};
const EQUIP_SLOT_TYPE_SET = { Weapon: 1, Armor: 1, Shield: 1, Helmet: 1, Ring: 1, Necklace: 1 };

const EQUIPMENT_RARITY_TIER_ORDER = [
    "Common",
    "Uncommon",
    "Rare",
    "Epic",
    "Legendary",
    "Heirloom",
    "Etherbound",
    "StellarSign",
    "Nullforge",
    "Chronarch",
    "Apexother"
];

const EQUIP_SET_MIN_RARITY_TIER_INDEX = 2;

/** 带套装概率 */
const EQUIP_SET_ROLL_CHANCE = 0.1;
const EQUIP_PASSIVE_BONUS_MIN_RARITY_TIER_INDEX = 1; // 2 品及以上可出功法加成

const EQUIPMENT_SET_DEFINITIONS = [
    { name: "周天星图", b2: { hp: 14, atk: 10 }, b4: { hp: 32, atk: 26, critRate: 12 }, b6: { hp: 58, atk: 48, critRate: 22, critDmg: 28 } },
    { name: "玄冥寒域", b2: { def: 16, atkSpd: 8 }, b4: { def: 36, atkSpd: 18, hp: 20 }, b6: { def: 62, atkSpd: 32, hp: 38, vamp: 14 } },
    { name: "赤阳真炎", b2: { atk: 18, critDmg: 10 }, b4: { atk: 40, critDmg: 24, critRate: 10 }, b6: { atk: 68, critDmg: 42, critRate: 18 } },
    { name: "青帝长生", b2: { hp: 22, def: 8 }, b4: { hp: 48, def: 22, vamp: 10 }, b6: { hp: 82, def: 40, vamp: 20, atkSpd: 12 } },
    { name: "太白庚金", b2: { atk: 16, critRate: 12 }, b4: { atk: 38, critRate: 26, def: 14 }, b6: { atk: 64, critRate: 44, def: 26 } },
    { name: "后土厚德", b2: { hp: 18, def: 14 }, b4: { hp: 42, def: 32, atk: 16 }, b6: { hp: 76, def: 58, atk: 30 } },
    { name: "雷劫天印", b2: { critRate: 14, atkSpd: 10 }, b4: { critRate: 30, atkSpd: 22, critDmg: 16 }, b6: { critRate: 50, atkSpd: 38, critDmg: 32 } },
    { name: "幽冥阎罗", b2: { vamp: 14, atk: 10 }, b4: { vamp: 30, atk: 26, critDmg: 14 }, b6: { vamp: 52, atk: 46, critDmg: 28 } },
    { name: "太虚逍遥", b2: { atkSpd: 16, critDmg: 8 }, b4: { atkSpd: 34, critDmg: 20, atk: 18 }, b6: { atkSpd: 56, critDmg: 36, atk: 34 } },
    { name: "纯阳剑络", b2: { atk: 20, critRate: 8 }, b4: { atk: 44, critRate: 20, hp: 18 }, b6: { atk: 72, critRate: 34, hp: 34 } },
    { name: "九渊镇狱", b2: { def: 20, hp: 12 }, b4: { def: 44, hp: 30, atkSpd: 12 }, b6: { def: 74, hp: 54, atkSpd: 24 } },
    { name: "灵台明镜", b2: { critDmg: 18, hp: 10 }, b4: { critDmg: 38, hp: 26, def: 14 }, b6: { critDmg: 62, hp: 46, def: 28 } },
    { name: "梵音禅心", b2: { def: 14, vamp: 12 }, b4: { def: 32, vamp: 26, atkSpd: 14 }, b6: { def: 56, vamp: 46, atkSpd: 26 } },
    { name: "血河轮回", b2: { vamp: 16, critRate: 10 }, b4: { vamp: 36, critRate: 22, atk: 20 }, b6: { vamp: 60, critRate: 38, atk: 38 } },
    { name: "风行无极", b2: { atkSpd: 20, def: 8 }, b4: { atkSpd: 42, def: 20, critRate: 14 }, b6: { atkSpd: 68, def: 36, critRate: 26 } },
    { name: "冰心守魄", b2: { hp: 16, critRate: 14 }, b4: { hp: 38, critRate: 28, def: 16 }, b6: { hp: 66, critRate: 48, def: 30 } },
    { name: "丹鼎造化", b2: { hp: 20, atk: 12 }, b4: { hp: 44, atk: 28, critDmg: 14 }, b6: { hp: 78, atk: 50, critDmg: 30 } },
    { name: "符箓万法", b2: { atk: 14, def: 12, atkSpd: 8 }, b4: { atk: 32, def: 28, atkSpd: 18 }, b6: { atk: 54, def: 48, atkSpd: 32 } },
    { name: "枪出如龙", b2: { atk: 22, hp: 8 }, b4: { atk: 48, hp: 22, vamp: 12 }, b6: { atk: 80, hp: 40, vamp: 24 } },
    { name: "扇里乾坤", b2: { atkSpd: 14, critDmg: 14 }, b4: { atkSpd: 32, critDmg: 30, critRate: 12 }, b6: { atkSpd: 54, critDmg: 50, critRate: 24 } },
    { name: "锤震山河", b2: { atk: 16, def: 16 }, b4: { atk: 36, def: 36, hp: 16 }, b6: { atk: 62, def: 62, hp: 30 } },
    { name: "镰割阴阳", b2: { critDmg: 16, vamp: 10 }, b4: { critDmg: 36, vamp: 24, atk: 16 }, b6: { critDmg: 60, vamp: 42, atk: 32 } },
    { name: "鞭影千幻", b2: { critRate: 16, atkSpd: 12 }, b4: { critRate: 34, atkSpd: 26, def: 12 }, b6: { critRate: 56, atkSpd: 44, def: 26 } },
    { name: "烛龙夜目", b2: { critRate: 12, critDmg: 12 }, b4: { critRate: 28, critDmg: 28, hp: 18 }, b6: { critRate: 48, critDmg: 48, hp: 34 } },
    { name: "盾御乾坤", b2: { def: 22, hp: 10 }, b4: { def: 48, hp: 28, vamp: 10 }, b6: { def: 80, hp: 50, vamp: 22 } },
    { name: "链锁诸天", b2: { def: 12, atk: 14, atkSpd: 8 }, b4: { def: 28, atk: 32, atkSpd: 18 }, b6: { def: 48, atk: 56, atkSpd: 32 } },
    { name: "玉坠同心", b2: { hp: 18, atkSpd: 12 }, b4: { hp: 40, atkSpd: 26, critRate: 12 }, b6: { hp: 70, atkSpd: 44, critRate: 24 } },
    { name: "玄戒锁运", b2: { critDmg: 14, def: 12 }, b4: { critDmg: 32, def: 28, atk: 16 }, b6: { critDmg: 54, def: 48, atk: 32 } },
    { name: "魂锁牵机", b2: { vamp: 12, hp: 14, critRate: 8 }, b4: { vamp: 28, hp: 32, critRate: 18 }, b6: { vamp: 48, hp: 58, critRate: 32 } },
    { name: "劫运归一", b2: { atk: 12, hp: 12, def: 10 }, b4: { atk: 28, hp: 30, def: 24, atkSpd: 10 }, b6: { atk: 48, hp: 54, def: 44, atkSpd: 22, critRate: 14 } }
];

const EQUIPMENT_SET_STAT_KEYS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

function getEquipmentRarityTierIndex(rarity) {
    var i = EQUIPMENT_RARITY_TIER_ORDER.indexOf(rarity);
    return i >= 0 ? i : 0;
}

function addEquipmentSetBonusMap(target, src) {
    if (!target || !src) return;
    for (var k = 0; k < EQUIPMENT_SET_STAT_KEYS.length; k++) {
        var key = EQUIPMENT_SET_STAT_KEYS[k];
        var v = src[key];
        if (typeof v === "number" && !isNaN(v)) {
            target[key] = (target[key] || 0) + v;
        }
    }
}

function emptyEquipmentSetBonusTotals() {
    return { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
}

function getEquippedSetPieceCount(setId) {
    if (!player || !Array.isArray(player.equipped) || typeof setId !== "number") return 0;
    var n = 0;
    for (var i = 0; i < player.equipped.length; i++) {
        var it = player.equipped[i];
        if (it && typeof it.setId === "number" && it.setId === setId) n++;
    }
    return n;
}

function aggregateEquipmentSetBonuses(equipped) {
    var totals = emptyEquipmentSetBonusTotals();
    if (!equipped || !equipped.length) return totals;
    var counts = {};
    for (var i = 0; i < equipped.length; i++) {
        var it = equipped[i];
        if (!it || typeof it.setId !== "number") continue;
        var sid = it.setId | 0;
        if (sid < 0 || sid >= EQUIPMENT_SET_DEFINITIONS.length) continue;
        counts[sid] = (counts[sid] || 0) + 1;
    }
    for (var sidStr in counts) {
        var sid = sidStr | 0;
        var def = EQUIPMENT_SET_DEFINITIONS[sid];
        if (!def) continue;
        var c = counts[sid];
        if (c >= 2) addEquipmentSetBonusMap(totals, def.b2);
        if (c >= 4) addEquipmentSetBonusMap(totals, def.b4);
        if (c >= 6) addEquipmentSetBonusMap(totals, def.b6);
    }
    return totals;
}

function maybeRollEquipmentSetTag(equipment) {
    if (!equipment) return;
    if (getEquipmentRarityTierIndex(equipment.rarity) < EQUIP_SET_MIN_RARITY_TIER_INDEX) return;
    if (Math.random() >= EQUIP_SET_ROLL_CHANCE) return;
    equipment.setId = Math.floor(Math.random() * EQUIPMENT_SET_DEFINITIONS.length);
}

function passiveBonusLevelMaxByTier(tierIdx) {
    var q = Math.min(10, Math.max(1, (tierIdx | 0) + 1)); // 品质序号 1..10
    if (q >= 10) return 5; // 10 品最高 +5
    if (q >= 8) return 4;
    if (q >= 5) return 3;
    return 2; // 2~4 品 +1~2
}

function maybeRollEquipmentPassiveSkillBonus(equipment) {
    if (!equipment) return;
    var tierIdx = getEquipmentRarityTierIndex(equipment.rarity);
    if (tierIdx < EQUIP_PASSIVE_BONUS_MIN_RARITY_TIER_INDEX) return;
    if (typeof PASSIVE_SKILLS === "undefined" || !Array.isArray(PASSIVE_SKILLS) || !PASSIVE_SKILLS.length) return;
    var chance = Math.min(0.1 + (tierIdx - EQUIP_PASSIVE_BONUS_MIN_RARITY_TIER_INDEX) * 0.04, 0.46);
    if (Math.random() >= chance) return;
    var itemLvl = Math.max(1, Math.floor(Number(equipment.lvl) || 1));
    var pool = PASSIVE_SKILLS.filter(function (p) {
        return p && typeof p.reqLvl === "number" && p.reqLvl < itemLvl; // 仅掉落低于装备境界的功法
    });
    if (!pool.length) return;
    var picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked || !picked.id) return;
    equipment.passiveBonus = {
        id: picked.id,
        lvl: randomizeNum(1, passiveBonusLevelMaxByTier(tierIdx))
    };
}

function getEquipmentPassiveBonusName(item) {
    if (!item || !item.passiveBonus || !item.passiveBonus.id) return "";
    if (typeof PASSIVE_BY_ID !== "undefined" && PASSIVE_BY_ID[item.passiveBonus.id]) {
        return PASSIVE_BY_ID[item.passiveBonus.id].name || item.passiveBonus.id;
    }
    return item.passiveBonus.id;
}

function getEquipmentPassiveBonusSectName(item) {
    if (!item || !item.passiveBonus || !item.passiveBonus.id) return "";
    if (typeof PASSIVE_BY_ID === "undefined") return "";
    var p = PASSIVE_BY_ID[item.passiveBonus.id];
    if (!p || !p.sectId) return "";
    if (typeof getSectById === "function") {
        var s = getSectById(p.sectId);
        if (s && s.name) return s.name;
    }
    return String(p.sectId);
}

function getEquipmentSetDef(setId) {
    if (typeof setId !== "number" || setId < 0 || setId >= EQUIPMENT_SET_DEFINITIONS.length) return null;
    return EQUIPMENT_SET_DEFINITIONS[setId];
}

/**
 * 遗器详情区：套装说明（含当前同套件数）
 * 注意：依赖 formatEquipmentStatKeyLabel / equipment 已定义
 */
function formatEquipmentSetBlockHtml(item, rx) {
    if (!item || typeof item.setId !== "number") return "";
    var def = getEquipmentSetDef(item.setId);
    if (!def) return "";
    var wearing = getEquippedSetPieceCount(item.setId);
    var head =
        '<details class="eq-set-collapse">' +
        '<summary class="eq-set-collapse__summary">套装信息</summary>' +
        '<div class="eq-set-block"><p class="eq-set-block__title">套装 · <span class="eq-set-name">' +
        def.name +
        "</span></p>" +
        '<p class="eq-set-block__meta">当前身着同套 ' +
        wearing +
        "/6 件时按档叠加机缘（2/4/6 件）</p><ul class=\"eq-set-block__ul\">";
    var li2 = formatSetBonusLineForTier("2 件", def.b2, rx);
    var li4 = formatSetBonusLineForTier("4 件", def.b4, rx);
    var li6 = formatSetBonusLineForTier("6 件", def.b6, rx);
    return head + li2 + li4 + li6 + "</ul></div></details>";
}

function formatSetBonusLineForTier(label, bonusObj, rx) {
    if (!bonusObj) return "";
    var parts = [];
    for (var k = 0; k < EQUIPMENT_SET_STAT_KEYS.length; k++) {
        var key = EQUIPMENT_SET_STAT_KEYS[k];
        var v = bonusObj[key];
        if (typeof v !== "number" || !v) continue;
        if (key === "critRate" || key === "critDmg" || key === "atkSpd" || key === "vamp") {
            parts.push(formatEquipmentStatKeyLabel(key) + "+" + v.toFixed(2).replace(rx, "$1") + "%");
        } else {
            parts.push(formatEquipmentStatKeyLabel(key) + "+" + Math.round(v) + "%");
        }
    }
    if (!parts.length) return "";
    return "<li><strong>" + label + "</strong>：" + parts.join("，") + "</li>";
}

/** 行囊（遗器）存放上限 */
const INVENTORY_EQUIPMENT_MAX = 200;

function inventoryEquipmentCount() {
    if (!player || !player.inventory || !Array.isArray(player.inventory.equipment)) return 0;
    return player.inventory.equipment.length;
}

function canAddInventoryEquipment(add) {
    add = add || 1;
    return inventoryEquipmentCount() + add <= INVENTORY_EQUIPMENT_MAX;
}

function tryPushInventoryEquipment(jsonStr) {
    if (!player) return false;
    if (!player.inventory) player.inventory = { equipment: [] };
    if (!Array.isArray(player.inventory.equipment)) player.inventory.equipment = [];
    if (!canAddInventoryEquipment(1)) return false;
    player.inventory.equipment.push(jsonStr);
    return true;
}

function clampInventoryEquipmentToMax() {
    if (!player || !player.inventory || !Array.isArray(player.inventory.equipment)) return;
    if (player.inventory.equipment.length > INVENTORY_EQUIPMENT_MAX) {
        player.inventory.equipment = player.inventory.equipment.slice(0, INVENTORY_EQUIPMENT_MAX);
        if (typeof saveData === "function") saveData();
    }
}

function canUnequipAllToInventory() {
    if (!player || !Array.isArray(player.equipped)) return false;
    return inventoryEquipmentCount() + player.equipped.length <= INVENTORY_EQUIPMENT_MAX;
}

function showInventoryFullModal() {
    if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML = `
        <div class="content">
            <p>行囊已满（${INVENTORY_EQUIPMENT_MAX} 件），无法纳下更多遗器。请先典让或披甲后再行收纳。</p>
            <div class="button-container">
                <button type="button" id="inv-full-ok">知晓</button>
            </div>
        </div>`;
    var ok = document.querySelector("#inv-full-ok");
    if (ok) {
        ok.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
        };
    }
}

function ensureInventoryUiFilters() {
    if (!player.inventory) player.inventory = { equipment: [] };
    if (!player.inventory.uiFilter) {
        player.inventory.uiFilter = { rarity: "All", slotType: "All" };
    }
    if (typeof player.inventory.uiFilter.rarity !== "string") player.inventory.uiFilter.rarity = "All";
    if (typeof player.inventory.uiFilter.slotType !== "string") player.inventory.uiFilter.slotType = "All";
    if (player.inventory.autoBatchSell === undefined) player.inventory.autoBatchSell = false;
    if (player.inventory.bagTab !== "equip" && player.inventory.bagTab !== "mat" && player.inventory.bagTab !== "gem") {
        player.inventory.bagTab = "equip";
    }
    if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
}

function maybeAutoBatchSellAfterLoot() {
    if (!player || !player.inventory || !player.inventory.autoBatchSell) return;
    var sel = document.getElementById("sell-rarity");
    var rarity = sel ? sel.value : "All";
    sellAll(rarity);
}

function passesBagFilter(item) {
    ensureInventoryUiFilters();
    var f = player.inventory.uiFilter;
    if (f.rarity !== "All" && item.rarity !== f.rarity) return false;
    if (f.slotType !== "All" && item.type !== f.slotType) return false;
    return true;
}

function replaceInventoryEquipmentAtIndex(i, obj) {
    if (!player.inventory || !Array.isArray(player.inventory.equipment)) return;
    if (i < 0 || i >= player.inventory.equipment.length) return;
    player.inventory.equipment[i] = JSON.stringify(obj);
    if (typeof saveData === "function") saveData();
}

function toggleInventoryLockAtIndex(i) {
    var raw = player.inventory.equipment[i];
    if (!raw) return;
    var obj = JSON.parse(raw);
    obj.locked = !obj.locked;
    replaceInventoryEquipmentAtIndex(i, obj);
    showInventory();
}

function sortEquippedBySlotOrder() {
    if (!player || !Array.isArray(player.equipped)) return;
    var order = { Weapon: 0, Armor: 1, Shield: 2, Helmet: 3, Ring: 4, Necklace: 5 };
    player.equipped.sort(function (a, b) {
        return (order[a.type] !== undefined ? order[a.type] : 99) - (order[b.type] !== undefined ? order[b.type] : 99);
    });
}

function findEquippedIndexByType(type) {
    if (!player || !Array.isArray(player.equipped)) return -1;
    for (var i = 0; i < player.equipped.length; i++) {
        if (player.equipped[i] && player.equipped[i].type === type) return i;
    }
    return -1;
}

function normalizePlayerEquippedSlots() {
    if (!player || !Array.isArray(player.equipped)) return;
    if (!player.inventory) player.inventory = { equipment: [] };
    if (!Array.isArray(player.inventory.equipment)) player.inventory.equipment = [];
    clampInventoryEquipmentToMax();
    var seen = {};
    var keep = [];
    for (var i = 0; i < player.equipped.length; i++) {
        var it = player.equipped[i];
        if (!it || !it.type || !EQUIP_SLOT_TYPE_SET[it.type]) {
            if (it) {
                if (tryPushInventoryEquipment(JSON.stringify(it))) continue;
                keep.push(it);
            }
            continue;
        }
        if (seen[it.type]) {
            if (tryPushInventoryEquipment(JSON.stringify(it))) continue;
            continue;
        }
        seen[it.type] = true;
        keep.push(it);
    }
    player.equipped = keep;
    sortEquippedBySlotOrder();
}

function weaponCategoryLabel(item) {
    if (!item) return "";
    if (WEAPON_CATEGORY_ZH[item.category]) {
        return WEAPON_CATEGORY_ZH[item.category];
    }
    if (DEFENSE_CATEGORY_ZH[item.category]) {
        return DEFENSE_CATEGORY_ZH[item.category];
    }
    if (ACCESSORY_CATEGORY_ZH[item.category]) {
        return ACCESSORY_CATEGORY_ZH[item.category];
    }
    return item.category || "";
}

function weaponOrArmorDisplayName(item) {
    if (!item) return "";
    if (item.type === "Weapon" && item.weaponName) {
        return item.weaponName;
    }
    if ((item.type === "Necklace" || item.type === "Ring") && item.accessoryName) {
        return item.accessoryName;
    }
    if (item.type !== "Weapon" && item.type !== "Necklace" && item.type !== "Ring" && item.defenseName) {
        return item.defenseName;
    }
    return weaponCategoryLabel(item);
}

const createEquipment = () => {
    const equipment = {
        category: null,
        attribute: null,
        type: null,
        rarity: null,
        lvl: null,
        value: null,
        stats: [],
    };

    // Generate random equipment attribute（约 1/3 项链/戒指）
    const equipmentAttributes = ["Damage", "Defense", "Accessory"];
    equipment.attribute = equipmentAttributes[Math.floor(Math.random() * equipmentAttributes.length)];

    // Generate random equipment name and type based on attribute
    if (equipment.attribute == "Damage") {
        const equipmentCategories = ["Sword", "Axe", "Hammer", "Dagger", "Flail", "Scythe", "Staff", "Fan", "Spear", "Blade", "Glaive", "Whip"];
        equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        equipment.type = "Weapon";
    } else if (equipment.attribute == "Defense") {
        const equipmentTypes = ["Armor", "Shield", "Helmet"];
        equipment.type = equipmentTypes[Math.floor(Math.random() * equipmentTypes.length)];
        if (equipment.type == "Armor") {
            const equipmentCategories = ["Plate", "Chain", "Leather"];
            equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
            equipment.armorClass = ARMOR_CLASS_TYPES[Math.floor(Math.random() * ARMOR_CLASS_TYPES.length)];
        } else if (equipment.type == "Shield") {
            const equipmentCategories = ["Tower", "Kite", "Buckler"];
            equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        } else if (equipment.type == "Helmet") {
            const equipmentCategories = ["Great Helm", "Horned Helm"];
            equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        }
    } else if (equipment.attribute == "Accessory") {
        if (Math.random() < 0.5) {
            equipment.type = "Necklace";
            const necklaceCats = ["SoulLocket", "JadePendant", "PrayerBeads"];
            equipment.category = necklaceCats[Math.floor(Math.random() * necklaceCats.length)];
        } else {
            equipment.type = "Ring";
            const ringCats = ["DaoSealRing", "SpiritBand", "XuanRing"];
            equipment.category = ringCats[Math.floor(Math.random() * ringCats.length)];
        }
    }

    if (equipment.type === "Weapon") {
        equipment.weaponName = typeof pickWeaponXiuxianName === "function"
            ? pickWeaponXiuxianName(equipment.category)
            : "";
    } else if (equipment.type === "Armor" || equipment.type === "Shield" || equipment.type === "Helmet") {
        equipment.defenseName = typeof pickDefenseXiuxianName === "function"
            ? pickDefenseXiuxianName(equipment.category)
            : "";
    } else if (equipment.type === "Necklace" || equipment.type === "Ring") {
        equipment.accessoryName = typeof pickAccessoryXiuxianName === "function"
            ? pickAccessoryXiuxianName(equipment.category)
            : "";
    }

    const rarityChances = [
        ["Common", 0.882],
        ["Uncommon", 0.094],
        ["Rare", 0.014],
        ["Epic", 0.006],
        ["Legendary", 0.0025],
        ["Heirloom", 0.001],
        ["Etherbound", 0.0003],
        ["StellarSign", 0.00012],
        ["Nullforge", 0.00005],
        ["Chronarch", 0.00002],
        ["Apexother", 0.00001],
    ];
    const tierMinFloor = {
        Etherbound: 12,
        StellarSign: 28,
        Nullforge: 48,
        Chronarch: 72,
        Apexother: 92,
    };

    const currentFloor = (dungeon && dungeon.progress && dungeon.progress.floor) ? dungeon.progress.floor : 1;
    let adjustedWeights = rarityChances.map(([name, w]) => [name, w]);
    const heirloomIdx = adjustedWeights.findIndex(([n]) => n === "Heirloom");
    for (const tierName in tierMinFloor) {
        if (currentFloor < tierMinFloor[tierName]) {
            const idx = adjustedWeights.findIndex(([n]) => n === tierName);
            if (idx >= 0 && heirloomIdx >= 0) {
                adjustedWeights[heirloomIdx][1] += adjustedWeights[idx][1];
                adjustedWeights[idx][1] = 0;
            }
        }
    }

    const randomNumber = Math.random();
    let cumulativeChance = 0;
    equipment.rarity = "Common";
    for (let i = 0; i < adjustedWeights.length; i++) {
        cumulativeChance += adjustedWeights[i][1];
        if (randomNumber <= cumulativeChance) {
            equipment.rarity = adjustedWeights[i][0];
            break;
        }
    }

    // Determine number of times to loop based on equipment rarity
    let loopCount;
    switch (equipment.rarity) {
        case "Common":
            loopCount = 2;
            break;
        case "Uncommon":
            loopCount = 3;
            break;
        case "Rare":
            loopCount = 4;
            break;
        case "Epic":
            loopCount = 5;
            break;
        case "Legendary":
            loopCount = 6;
            break;
        case "Heirloom":
            loopCount = 8;
            break;
        case "Etherbound":
            loopCount = 10;
            break;
        case "StellarSign":
            loopCount = 11;
            break;
        case "Nullforge":
            loopCount = 13;
            break;
        case "Chronarch":
            loopCount = 15;
            break;
        case "Apexother":
            loopCount = 17;
            break;
    }

    // Generate and append random stats to the stats array
    const physicalStats = ["atk", "atkSpd", "vamp", "critRate", "critDmg"];
    const damageyStats = ["atk", "atk", "vamp", "critRate", "critDmg", "critDmg"];
    const speedyStats = ["atkSpd", "atkSpd", "vamp", "critRate", "critRate", "critDmg"];
    const defenseStats = ["hp", "hp", "def", "def", "atk"];
    const dmgDefStats = ["hp", "def", "atk", "atk", "critRate", "critDmg"];
    const accessoryStats = ["hp", "critRate", "critDmg", "vamp", "atkSpd", "atk", "def", "hp"];
    let statTypes;
    if (equipment.attribute == "Damage") {
        var c = equipment.category;
        if (c === "Axe" || c === "Scythe" || c === "Blade" || c === "Glaive") {
            statTypes = damageyStats;
        } else if (c === "Dagger" || c === "Flail" || c === "Fan" || c === "Whip") {
            statTypes = speedyStats;
        } else if (c === "Hammer" || c === "Staff") {
            statTypes = dmgDefStats;
        } else {
            statTypes = physicalStats;
        }
    } else if (equipment.attribute == "Defense") {
        statTypes = defenseStats;
    } else if (equipment.attribute == "Accessory") {
        statTypes = accessoryStats;
    }
    let equipmentValue = 0;
    for (let i = 0; i < loopCount; i++) {
        let statType = statTypes[Math.floor(Math.random() * statTypes.length)];
        let capped = false;

        // Stat scaling for equipment
        const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
        const minLvl = maxLvl - (dungeon.settings.enemyLvlGap - 1);
        equipment.lvl = randomizeNum(minLvl, maxLvl);
        let statMultiplier = (dungeon.settings.enemyScaling - 1) * equipment.lvl;
        let hpScaling = (30 * randomizeDecimal(0.5, 1.5)) + ((30 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        let atkDefScaling = (15 * randomizeDecimal(0.5, 1.5)) + ((15 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        let cdAtkSpdScaling = (3.5 * randomizeDecimal(0.5, 1.5)) + ((3.5 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        let crVampScaling = (2 * randomizeDecimal(0.5, 1.5)) + ((2 * randomizeDecimal(0.5, 1.5)) * statMultiplier);

        // Set randomized numbers to respective stats and increment sell value
        if (statType === "hp") {
            statValue = randomizeNum(hpScaling * 0.5, hpScaling);
            equipmentValue += statValue;
        } else if (statType === "atk") {
            statValue = randomizeNum(atkDefScaling * 0.5, atkDefScaling);
            equipmentValue += statValue * 2.5;
        } else if (statType === "def") {
            statValue = randomizeNum(atkDefScaling * 0.5, atkDefScaling);
            equipmentValue += statValue * 2.5;
        } else if (statType === "atkSpd") {
            statValue = randomizeDecimal(cdAtkSpdScaling * 0.5, cdAtkSpdScaling);
            if (statValue > 41) {
                statValue = 41 * randomizeDecimal(0.5, 1);
                loopCount++;
                capped = true;
            }
            equipmentValue += statValue * 8.33;
        } else if (statType === "vamp") {
            statValue = randomizeDecimal(crVampScaling * 0.5, crVampScaling);
            if (statValue > 25) {
                statValue = 25 * randomizeDecimal(0.5, 1);
                loopCount++;
                capped = true;
            }
            equipmentValue += statValue * 20.83;
        } else if (statType === "critRate") {
            statValue = randomizeDecimal(crVampScaling * 0.5, crVampScaling);
            if (statValue > 30) {
                statValue = 30 * randomizeDecimal(0.5, 1);
                loopCount++;
                capped = true;
            }
            equipmentValue += statValue * 20.83;
        } else if (statType === "critDmg") {
            statValue = randomizeDecimal(cdAtkSpdScaling * 0.5, cdAtkSpdScaling);
            equipmentValue += statValue * 8.33;
        }

        // Check if stat type already exists in stats array
        let statExists = false;
        for (let j = 0; j < equipment.stats.length; j++) {
            if (Object.keys(equipment.stats[j])[0] == statType) {
                statExists = true;
                break;
            }
        }

        // If stat type already exists, add values together
        if (statExists) {
            for (let j = 0; j < equipment.stats.length; j++) {
                if (Object.keys(equipment.stats[j])[0] == statType) {
                    equipment.stats[j][statType] += statValue;
                    if (capped) {
                        equipment.stats[j][statType] -= statValue;
                    }
                    break;
                }
            }
        }

        // If stat type does not exist, add new stat to stats array
        else {
            equipment.stats.push({ [statType]: statValue });
        }
    }
    maybeRollEquipmentSetTag(equipment);
    maybeRollEquipmentPassiveSkillBonus(equipment);
    equipment.value = Math.round(equipmentValue * 3);
    if (!tryPushInventoryEquipment(JSON.stringify(equipment))) {
        return null;
    }

    saveData();
    showInventory();
    showEquipment();

    const itemShow = {
        category: equipment.category,
        type: equipment.type,
        armorClass: equipment.armorClass || "",
        rarity: equipment.rarity,
        lvl: equipment.lvl,
        weaponName: equipment.weaponName || "",
        defenseName: equipment.defenseName || "",
        accessoryName: equipment.accessoryName || "",
        icon: equipmentIcon(equipment.category),
        stats: equipment.stats
    };
    if (typeof equipment.setId === "number") {
        itemShow.setId = equipment.setId;
    }
    if (equipment.passiveBonus && equipment.passiveBonus.id) {
        itemShow.passiveBonus = { id: equipment.passiveBonus.id, lvl: equipment.passiveBonus.lvl };
    }
    return itemShow;
}

function eqWeaponIcon(inner) {
    return '<span class="eq-weapon-icon" aria-hidden="true">' + inner + "</span>";
}

const equipmentIcon = (equipment) => {
    if (equipment == "Sword") {
        return eqWeaponIcon('<i class="ra ra-relic-blade"></i>');
    } else if (equipment == "Axe") {
        return eqWeaponIcon('<i class="ra ra-axe"></i>');
    } else if (equipment == "Hammer") {
        return eqWeaponIcon('<i class="ra ra-flat-hammer"></i>');
    } else if (equipment == "Dagger") {
        return eqWeaponIcon('<i class="ra ra-bowie-knife"></i>');
    } else if (equipment == "Flail") {
        return eqWeaponIcon('<i class="ra ra-chain"></i>');
    } else if (equipment == "Scythe") {
        return eqWeaponIcon('<i class="ra ra-scythe"></i>');
    } else if (equipment == "Staff") {
        return eqWeaponIcon('<i class="fas fa-wand-magic-sparkles"></i>');
    } else if (equipment == "Fan") {
        return eqWeaponIcon('<i class="fas fa-fan"></i>');
    } else if (equipment == "Spear") {
        return eqWeaponIcon('<i class="fas fa-chevron-up eq-weapon-icon__speartip"></i>');
    } else if (equipment == "Blade") {
        return eqWeaponIcon('<i class="fas fa-cut"></i>');
    } else if (equipment == "Glaive") {
        return eqWeaponIcon('<i class="ra ra-scythe eq-weapon-icon__glaive"></i>');
    } else if (equipment == "Whip") {
        return eqWeaponIcon('<i class="fas fa-slash"></i>');
    } else if (equipment == "Plate") {
        return '<i class="ra ra-vest"></i>';
    } else if (equipment == "Chain") {
        return '<i class="ra ra-vest"></i>';
    } else if (equipment == "Leather") {
        return '<i class="ra ra-vest"></i>';
    } else if (equipment == "Tower") {
        return '<i class="ra ra-shield"></i>';
    } else if (equipment == "Kite") {
        return '<i class="ra ra-heavy-shield"></i>';
    } else if (equipment == "Buckler") {
        return '<i class="ra ra-round-shield"></i>';
    } else if (equipment == "Great Helm") {
        return '<i class="ra ra-knight-helmet"></i>';
    } else if (equipment == "Horned Helm") {
        return '<i class="ra ra-helmet"></i>';
    } else if (equipment == "SoulLocket") {
        return eqWeaponIcon('<i class="fas fa-heart"></i>');
    } else if (equipment == "JadePendant") {
        return eqWeaponIcon('<i class="fas fa-gem"></i>');
    } else if (equipment == "PrayerBeads") {
        return eqWeaponIcon('<i class="fas fa-circle"></i>');
    } else if (equipment == "DaoSealRing") {
        return eqWeaponIcon('<i class="fas fa-stamp"></i>');
    } else if (equipment == "SpiritBand") {
        return eqWeaponIcon('<i class="fas fa-dot-circle"></i>');
    } else if (equipment == "XuanRing") {
        return eqWeaponIcon('<i class="fas fa-moon"></i>');
    }
}

function equipmentStatsToMap(stats) {
    var m = {};
    if (!stats || !stats.length) return m;
    stats.forEach(function (stat) {
        var k = Object.keys(stat)[0];
        if (k !== undefined) m[k] = (m[k] || 0) + stat[k];
    });
    return m;
}

function mergeEquipmentBonusMap(target, src) {
    if (!target || !src) return;
    for (var k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        var v = Number(src[k]);
        if (!isFinite(v)) continue;
        target[k] = (target[k] || 0) + v;
    }
}

var EQUIP_STAT_ORDER = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

var EQUIP_STAT_LABEL_ZH = {
    hp: "气血",
    atk: "力道",
    def: "护体",
    atkSpd: "身法",
    vamp: "吸血",
    critRate: "会心",
    critDmg: "暴伤"
};

function equipmentOrderedStatKeys(mapA, mapB) {
    mapA = mapA || {};
    mapB = mapB || {};
    var out = [];
    var seen = Object.create(null);
    EQUIP_STAT_ORDER.forEach(function (k) {
        if (mapA[k] !== undefined || mapB[k] !== undefined) {
            out.push(k);
            seen[k] = true;
        }
    });
    function rest(obj) {
        if (!obj) return;
        Object.keys(obj).forEach(function (k) {
            if (!seen[k]) {
                out.push(k);
                seen[k] = true;
            }
        });
    }
    rest(mapA);
    rest(mapB);
    return out;
}

function formatEquipmentStatKeyLabel(statKey) {
    var k = statKey != null ? String(statKey) : "";
    if (EQUIP_STAT_LABEL_ZH[k]) return EQUIP_STAT_LABEL_ZH[k];
    return k ? "【" + k + "】" : "";
}

function formatEquipmentStatValue(statKey, val, rx) {
    if (statKey === "critRate" || statKey === "critDmg" || statKey === "atkSpd" || statKey === "vamp") {
        return Number(val).toFixed(2).replace(rx, "$1") + "%";
    }
    return String(val);
}

/** 检视面板：星阶与累计全属性加成（10★ 时 +305%） */
function formatEquipmentEnhanceMetaHtml(item) {
    if (!item || typeof getEnhancementBonusPctDisplay !== "function") return "";
    var es = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, Math.floor(item.enhanceStars))) : 0;
    var pct = getEnhancementBonusPctDisplay(es);
    return (
        '<p class="eq-meta-stars">星阶：<strong>' +
        es +
        '</strong>★ · 累计全属性 <strong>+' +
        pct +
        "%</strong>（满星 +305%）</p>"
    );
}

function formatEquipmentEnchantMetaHtml(item) {
    if (!item || !item.enchantTier || !item.enchantPct) return "";
    var t = Math.max(1, Math.min(4, Math.floor(item.enchantTier)));
    var p = Math.max(1, Math.min(20, Math.floor(item.enchantPct)));
    return (
        '<p class="eq-meta-enchant">附魔：<strong class="eq-enchant-tier-' +
        t +
        '">第' +
        t +
        "阶 +" + 
        p +
        "%</strong>（在当前强化属性上再提升）</p>"
    );
}

function formatEquipmentPassiveBonusMetaHtml(item) {
    if (!item || !item.passiveBonus || !item.passiveBonus.id) return "";
    var lv = Math.max(1, Math.floor(Number(item.passiveBonus.lvl) || 1));
    var passiveName = getEquipmentPassiveBonusName(item);
    var sectName = getEquipmentPassiveBonusSectName(item);
    var sectColorMap = {
        "神剑宗": "#f6c85f",
        "玄武宗": "#66d0c7",
        "焚天宗": "#ff8a5b",
        "青云门": "#74c0ff",
        "玉清门": "#c7d2fe",
        "鬼王宗": "#b794f4",
        "合欢宗": "#f687b3",
        "逍遥宗": "#63e6be",
        "明教": "#ffd43b",
        "血煞宗": "#ff6b6b",
        "焚脉宗": "#ff922b",
        "绝命堂": "#ffa8a8"
    };
    var sectColor = sectColorMap[sectName] || "#a5b4fc";
    var sectTag = sectName
        ? '<span style="display:inline-block;padding:0 5px;margin-right:3px;border:1px solid ' +
          sectColor +
          ';border-radius:999px;color:' +
          sectColor +
          ';font-size:10px;line-height:14px;vertical-align:1px;">' +
          sectHtmlEscape(sectName) +
          "</span>"
        : "";
    var titleTxt = sectName ? sectName + " · " + passiveName : passiveName;
    return (
        '<p class="eq-meta-enchant">悟性：<strong class="Rare" title="' +
        sectHtmlEscape(titleTxt) +
        '">' +
        sectTag +
        sectHtmlEscape(passiveName) +
        " 功法等级 +" +
        lv +
        "</strong></p>"
    );
}

function renderInventoryMaterialsPanel() {
    var matCap = document.getElementById("invMatCap");
    var stones = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_ENHANCE_STONE) : 0;
    var enchStones = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_ENCHANT_STONE) : 0;
    var packs = typeof getMaterialCount === "function" && typeof MATERIAL_GEM_PACK !== "undefined" ? getMaterialCount(MATERIAL_GEM_PACK) : 0;
    var openers = typeof getMaterialCount === "function" && typeof MATERIAL_SOCKET_OPENER !== "undefined" ? getMaterialCount(MATERIAL_SOCKET_OPENER) : 0;
    var fruits = typeof getMaterialCount === "function" && typeof MATERIAL_TALENT_FRUIT !== "undefined" ? getMaterialCount(MATERIAL_TALENT_FRUIT) : 0;
    if (matCap) {
        var s1 = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH + " " + stones : "强化石 " + stones;
        var s2 = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH + " " + enchStones : "附魔石 " + enchStones;
        var s3 = typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined" ? MATERIAL_SOCKET_OPENER_ZH + " " + openers : "开孔器 " + openers;
        var s4 = typeof MATERIAL_TALENT_FRUIT_ZH !== "undefined" ? MATERIAL_TALENT_FRUIT_ZH + " " + fruits : "天赋果 " + fruits;
        matCap.textContent = s1 + " / " + s2 + " / " + s3 + " / " + s4;
    }
    var el = document.getElementById("playerInventoryMaterials");
    if (!el) return;
    var zh = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
    var enchZh = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
    var packZh = typeof MATERIAL_GEM_PACK_ZH !== "undefined" ? MATERIAL_GEM_PACK_ZH : "宝石材料包";
    var openerZh = typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined" ? MATERIAL_SOCKET_OPENER_ZH : "开孔器";
    var fruitZh = typeof MATERIAL_TALENT_FRUIT_ZH !== "undefined" ? MATERIAL_TALENT_FRUIT_ZH : "天赋果";
    el.innerHTML =
        '<div class="inv-mat-card inv-mat-card--stone" role="group" aria-label="' +
        zh +
        '">' +
        '<div class="inv-mat-card__icon" aria-hidden="true"><i class="fas fa-gem"></i></div>' +
        '<div class="inv-mat-card__meta">' +
        '<span class="inv-mat-card__name">' +
        zh +
        "</span>" +
        '<span class="inv-mat-card__count">持有 ' +
        stones +
        "</span>" +
        '<p class="inv-mat-card__desc">在「装备」分页检视遗器时可淬火强化；成败依星阶，高星失败会掉星。可通过战斗与事件获取。</p>' +
        "</div></div>" +
        '<div class="inv-mat-card inv-mat-card--enchant" role="group" aria-label="' +
        enchZh +
        '">' +
        '<div class="inv-mat-card__icon" aria-hidden="true"><i class="fas fa-hat-wizard"></i></div>' +
        '<div class="inv-mat-card__meta">' +
        '<span class="inv-mat-card__name">' +
        enchZh +
        "</span>" +
        '<span class="inv-mat-card__count">持有 ' +
        enchStones +
        "</span>" +
        '<p class="inv-mat-card__desc">用于遗器附魔。附魔后可获得 1–50% 属性增幅，并在当前强化属性基础上再提升。可通过战斗与事件获取。</p>' +
        "</div></div>" +
        '<div class="inv-mat-card inv-mat-card--gem-pack" role="group" aria-label="' +
        packZh +
        '">' +
        '<div class="inv-mat-card__icon" aria-hidden="true"><i class="fas fa-box-open"></i></div>' +
        '<div class="inv-mat-card__meta">' +
        '<span class="inv-mat-card__name">' +
        packZh +
        "</span>" +
        '<span class="inv-mat-card__count">持有 ' +
        packs +
        "</span>" +
        '<p class="inv-mat-card__desc">启封后可得三枚随机一级宝石（可重复）。叩地脉、历练等机缘可得。</p>' +
        '<button type="button" class="btn btn--sm btn--accent" id="inv-use-gem-pack"' +
        (packs < 1 ? ' disabled="disabled"' : "") +
        ">启封材料包</button>" +
        "</div></div>" +
        '<div class="inv-mat-card" role="group" aria-label="' +
        openerZh +
        '">' +
        '<div class="inv-mat-card__icon" aria-hidden="true"><i class="fas fa-circle-notch"></i></div>' +
        '<div class="inv-mat-card__meta">' +
        '<span class="inv-mat-card__name">' +
        openerZh +
        "</span>" +
        '<span class="inv-mat-card__count">持有 ' +
        openers +
        "</span>" +
        '<p class="inv-mat-card__desc">用于遗器开孔（每器至多三窍）。宝藏伏击、秘境镇守必落；统领及以上妖躯有小概率遗落。</p>' +
        "</div></div>" +
        '<div class="inv-mat-card inv-mat-card--talent" role="group" aria-label="' +
        fruitZh +
        '">' +
        '<div class="inv-mat-card__icon" aria-hidden="true"><i class="fas fa-apple-whole"></i></div>' +
        '<div class="inv-mat-card__meta">' +
        '<span class="inv-mat-card__name">' +
        fruitZh +
        "</span>" +
        '<span class="inv-mat-card__count">持有 ' +
        fruits +
        "</span>" +
        '<p class="inv-mat-card__desc">灵果蕴妖灵之气。喂养<strong>出战灵宠</strong>一次：妖力 +1，用于推动年份进阶（幼年→十年→百年…）。</p>' +
        '<button type="button" class="btn btn--sm btn--accent" id="inv-use-talent-fruit"' +
        (fruits < 1 ? ' disabled="disabled"' : "") +
        ">喂养出战灵宠</button>" +
        "</div></div>";
    var usePack = document.getElementById("inv-use-gem-pack");
    if (usePack) {
        usePack.onclick = function () {
            if (usePack.disabled) return;
            var res = typeof tryOpenGemMaterialPack === "function" ? tryOpenGemMaterialPack() : { ok: false, message: "不可用。" };
            if (!res.ok) {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>' +
                        (res.message || "") +
                        '</p><div class="button-container"><button type="button" id="gem-pack-fail-ok">知晓</button></div></div>';
                    var okp = document.querySelector("#gem-pack-fail-ok");
                    if (okp) {
                        okp.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
                return;
            }
            if (typeof saveData === "function") saveData();
            if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content"><p>' +
                    (res.message || "已启封。") +
                    '</p><div class="button-container"><button type="button" id="gem-pack-ok">知晓</button></div></div>';
                var okp2 = document.querySelector("#gem-pack-ok");
                if (okp2) {
                    okp2.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                    };
                }
            }
            renderInventoryMaterialsPanel();
        };
    }

    var useFruit = document.getElementById("inv-use-talent-fruit");
    if (useFruit) {
        useFruit.onclick = function () {
            if (useFruit.disabled) return;
            if (typeof getActivePet !== "function") return;
            var pet = getActivePet();
            if (!pet) {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>尚无出战灵宠，无法喂养。</p><div class="button-container"><button type="button" id="talent-fruit-no-pet-ok">知晓</button></div></div>';
                    var ok = document.querySelector("#talent-fruit-no-pet-ok");
                    if (ok) {
                        ok.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
                return;
            }
            if (typeof getMaterialCount === "function" && typeof addMaterial === "function" && getMaterialCount(MATERIAL_TALENT_FRUIT) < 1) return;
            addMaterial(MATERIAL_TALENT_FRUIT, -1);
            var res = typeof addPetYaoli === "function" ? addPetYaoli(pet, 1, "petPanel") : { ok: true };
            if (typeof saveData === "function") saveData();
            if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content"><p>你以<span class="Legendary">' +
                    fruitZh +
                    "</span>喂养灵宠，妖力 +1。" +
                    (res && res.upgraded ? "<br/>灵息翻涌，年份竟有精进！" : "") +
                    '</p><div class="button-container"><button type="button" id="talent-fruit-ok">知晓</button></div></div>';
                var ok2 = document.querySelector("#talent-fruit-ok");
                if (ok2) {
                    ok2.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                    };
                }
            }
            renderInventoryMaterialsPanel();
        };
    }
}

function gemCardIconHtml(kind) {
    var k = String(kind);
    if (k === "hp") return '<i class="fas fa-heart" aria-hidden="true"></i>';
    if (k === "atk") return '<i class="ra ra-sword" aria-hidden="true"></i>';
    if (k === "def") return '<i class="ra ra-round-shield" aria-hidden="true"></i>';
    if (k === "atkSpd") return '<i class="ra ra-plain-dagger" aria-hidden="true"></i>';
    if (k === "critDmg") return '<i class="ra ra-focused-lightning" aria-hidden="true"></i>';
    return '<i class="fas fa-gem" aria-hidden="true"></i>';
}

function renderInventoryGemsPanel() {
    var gel = document.getElementById("playerInventoryGems");
    if (!gel) return;
    if (typeof ensurePlayerGemStacks !== "function") {
        gel.innerHTML = "";
        return;
    }
    ensurePlayerGemStacks();
    var rows = [];
    for (var ki = 0; ki < GEM_KINDS.length; ki++) {
        var k = GEM_KINDS[ki];
        var kzh = typeof GEM_KIND_ZH !== "undefined" ? GEM_KIND_ZH[k] : k;
        for (var lv = 1; lv <= 12; lv++) {
            var c = typeof getGemStackCount === "function" ? getGemStackCount(k, lv) : 0;
            if (c < 1) continue;
            var canMerge = c >= 3 && lv < 12;
            var effPct =
                typeof getGemEffectiveBonusPct === "function" ? getGemEffectiveBonusPct(k, lv) : 0;
            var effStr = "—";
            if (typeof effPct === "number" && isFinite(effPct)) {
                effStr = String(Number(effPct.toFixed(2)));
            }
            rows.push(
                '<div class="inv-gem-card inv-gem-card--' +
                    k +
                    '" role="group" aria-label="' +
                    kzh +
                    "宝石 " +
                    lv +
                    "阶 ×" +
                    c +
                    '">' +
                    '<div class="inv-gem-card__icon" aria-hidden="true">' +
                    gemCardIconHtml(k) +
                    "</div>" +
                    '<div class="inv-gem-card__body">' +
                    '<span class="inv-gem-card__name">' +
                    kzh +
                    "宝石</span>" +
                    '<span class="inv-gem-card__lvl">' +
                    lv +
                    " 阶</span>" +
                    '<span class="inv-gem-card__qty">×' +
                    c +
                    "</span>" +
                    '<p class="inv-gem-card__eff">镶嵌效用 <strong>+' +
                    effStr +
                    "%</strong>（按先天道体折算）</p>" +
                    (canMerge
                        ? '<button type="button" class="btn btn--sm btn--accent inv-gem-merge-btn" data-gkind="' +
                          k +
                          '" data-glv="' +
                          lv +
                          '">三合一升阶</button>'
                        : '<p class="inv-gem-card__hint">' +
                          (lv >= 12 ? "已达极品阶。" : "再集 <b>" + (3 - c) + "</b> 枚可淬合升阶。") +
                          "</p>") +
                    "</div></div>"
            );
        }
    }
    gel.innerHTML =
        rows.length > 0
            ? '<div class="inv-gem-grid">' + rows.join("") + "</div>"
            : '<div class="inv-empty inv-empty--filter" role="status"><span>尚无宝石，启封材料包或采矿可得。</span></div>';
    var merges = gel.querySelectorAll(".inv-gem-merge-btn");
    for (var mi = 0; mi < merges.length; mi++) {
        merges[mi].onclick = (function (b) {
            return function () {
                var kk = b.getAttribute("data-gkind");
                var ll = Math.floor(Number(b.getAttribute("data-glv")) || 1);
                var res = typeof tryMergeGemsInInventory === "function" ? tryMergeGemsInInventory(kk, ll) : { ok: false };
                if (!res.ok) return;
                if (typeof saveData === "function") saveData();
                if (typeof defaultModalElement !== "undefined" && defaultModalElement && res.message) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>' +
                        res.message +
                        '</p><div class="button-container"><button type="button" id="gem-merge-ok">知晓</button></div></div>';
                    var okm = document.querySelector("#gem-merge-ok");
                    if (okm) {
                        okm.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
                if (typeof showInventory === "function") showInventory();
                else if (typeof renderInventoryGemsPanel === "function") renderInventoryGemsPanel();
            };
        })(merges[mi]);
    }
}

function equipmentStatDiffClass(nv, ov) {
    var n = Number(nv);
    var o = Number(ov);
    if (n > o) return "eq-diff--up";
    if (n < o) return "eq-diff--down";
    return "eq-diff--same";
}

/** 换穿后相对当前已装备：Δ = 行囊值 − 已装备值（仅在有已装备时展示） */
function formatEquipmentSwapDeltaHtml(statKey, delta, rx) {
    var d = Number(delta);
    if (statKey === "critRate" || statKey === "critDmg" || statKey === "atkSpd" || statKey === "vamp") {
        var txt = (d > 0 ? "+" : "") + d.toFixed(2).replace(rx, "$1") + "%";
        var cls = d > 0 ? "eq-diff--up" : d < 0 ? "eq-diff--down" : "eq-diff--same";
        return '<span class="eq-swap-delta ' + cls + '" title="相对当前已装备">（' + txt + "）</span>";
    }
    var di = Math.round(d);
    var cls2 = di > 0 ? "eq-diff--up" : di < 0 ? "eq-diff--down" : "eq-diff--same";
    var txt2 = (di > 0 ? "+" : "") + String(di);
    return '<span class="eq-swap-delta ' + cls2 + '" title="相对当前已装备">（' + txt2 + "）</span>";
}

/** 行囊检视：与同槽位已装备双栏对比 HTML；槽位异常时返回 null 以回退单栏 */
function buildEquipmentCompareHtml(item, icon, rx) {
    if (!item.type || !EQUIP_SLOT_TYPE_SET[item.type]) {
        return null;
    }
    var eqIdx = findEquippedIndexByType(item.type);
    var equippedItem = eqIdx >= 0 ? player.equipped[eqIdx] : null;
    var mapNew = equipmentStatsToMap(item.stats);
    var mapOld = equippedItem ? equipmentStatsToMap(equippedItem.stats) : {};
    mergeEquipmentBonusMap(mapNew, getArmorClassBonusMap(item));
    mergeEquipmentBonusMap(mapOld, getArmorClassBonusMap(equippedItem));
    var keys = equipmentOrderedStatKeys(mapNew, mapOld);
    var slotLbl = EQUIP_SLOT_TYPE_LABEL_ZH[item.type] || item.type;

    var newRows = keys
        .map(function (k) {
            var nv = mapNew[k] !== undefined ? mapNew[k] : 0;
            var ov = mapOld[k] !== undefined ? mapOld[k] : 0;
            var diffCls = equipmentStatDiffClass(nv, ov);
            var arrow = diffCls === "eq-diff--up" ? "▲" : diffCls === "eq-diff--down" ? "▼" : "·";
            var tip = diffCls === "eq-diff--up" ? "高于已装备" : diffCls === "eq-diff--down" ? "低于已装备" : "与已装备相同";
            var valPart =
                mapNew[k] !== undefined ? "+" + formatEquipmentStatValue(k, mapNew[k], rx) : "";
            var deltaHtml = equippedItem ? formatEquipmentSwapDeltaHtml(k, nv - ov, rx) : "";
            return (
                "<li><span class=\"eq-compare-stat-txt\">" +
                formatEquipmentStatKeyLabel(k) +
                valPart +
                '</span> <span class="eq-diff ' +
                diffCls +
                '" title="' +
                tip +
                '">' +
                arrow +
                "</span>" +
                deltaHtml +
                "</li>"
            );
        })
        .join("");

    var oldRows = keys
        .filter(function (k) {
            return mapOld[k] !== undefined;
        })
        .map(function (k) {
            return (
                "<li><span class=\"eq-compare-stat-txt\">" +
                formatEquipmentStatKeyLabel(k) +
                "+" +
                formatEquipmentStatValue(k, mapOld[k], rx) +
                "</span></li>"
            );
        })
        .join("");

    var oldTitle = equippedItem
        ? '<h3 class="' +
          equippedItem.rarity +
          '">' +
          equipmentIcon(equippedItem.category) +
          equipmentRarityLabel(equippedItem.rarity) +
          " " +
          weaponOrArmorDisplayName(equippedItem) +
          " " +
          cultivationRealmLabel(equippedItem.lvl) +
          "</h3>"
        : '<p class="eq-compare__slot-empty">该「' + slotLbl + '」槽位未穿戴</p>';

    return (
        '<div class="eq-compare">' +
        '<p class="eq-compare__slot-hint">对比 · 同槽「' +
        slotLbl +
        '」</p>' +
        '<div class="eq-compare__cols">' +
        '<section class="eq-compare__panel eq-compare__panel--new" aria-label="行囊中的装备">' +
        '<h4 class="eq-compare__kicker">行囊</h4>' +
        '<h3 class="' +
        item.rarity +
        '">' +
        icon +
        equipmentRarityLabel(item.rarity) +
        " " +
        weaponOrArmorDisplayName(item) +
        " " +
        cultivationRealmLabel(item.lvl) +
        "</h3>" +
        formatEquipmentEnhanceMetaHtml(item) +
        formatEquipmentEnchantMetaHtml(item) +
        formatEquipmentPassiveBonusMetaHtml(item) +
        formatArmorClassBonusMetaHtml(item) +
        '<ul class="eq-compare__ul">' +
        newRows +
        "</ul>" +
        (typeof formatEquipmentGemSlotsHtml === "function" ? formatEquipmentGemSlotsHtml(item) : "") +
        (typeof formatEquipmentSetBlockHtml === "function" ? formatEquipmentSetBlockHtml(item, rx) : "") +
        "</section>" +
        '<section class="eq-compare__panel eq-compare__panel--old" aria-label="当前已装备">' +
        '<h4 class="eq-compare__kicker">已装备</h4>' +
        oldTitle +
        (equippedItem ? formatEquipmentEnhanceMetaHtml(equippedItem) : "") +
        (equippedItem ? formatEquipmentEnchantMetaHtml(equippedItem) : "") +
        (equippedItem ? formatArmorClassBonusMetaHtml(equippedItem) : "") +
        (equippedItem && oldRows ? '<ul class="eq-compare__ul">' + oldRows + "</ul>" : "") +
        (equippedItem && typeof formatEquipmentGemSlotsHtml === "function" ? formatEquipmentGemSlotsHtml(equippedItem) : "") +
        (equippedItem && typeof formatEquipmentSetBlockHtml === "function" ? formatEquipmentSetBlockHtml(equippedItem, rx) : "") +
        "</section>" +
        "</div></div>"
    );
}

function buildEquipmentSingleHtml(item, icon, rx) {
    var lines = item.stats
        .map(function (stat) {
            var k = Object.keys(stat)[0];
            if (k === "critRate" || k === "critDmg" || k === "atkSpd" || k === "vamp") {
                return (
                    "<li>" +
                    formatEquipmentStatKeyLabel(k) +
                    "+" +
                    stat[k].toFixed(2).replace(rx, "$1") +
                    "%</li>"
                );
            }
            return "<li>" + formatEquipmentStatKeyLabel(k) + "+" + stat[k] + "</li>";
        })
        .join("");
    return (
        "<h3 class=\"" +
        item.rarity +
        '">' +
        icon +
        equipmentRarityLabel(item.rarity) +
        " " +
        weaponOrArmorDisplayName(item) +
        " " +
        cultivationRealmLabel(item.lvl) +
        "</h3>" +
        formatEquipmentEnhanceMetaHtml(item) +
        formatEquipmentEnchantMetaHtml(item) +
        formatEquipmentPassiveBonusMetaHtml(item) +
        formatArmorClassBonusMetaHtml(item) +
        "<ul>" +
        lines +
        "</ul>" +
        (typeof formatEquipmentGemSlotsHtml === "function" ? formatEquipmentGemSlotsHtml(item) : "") +
        (typeof formatEquipmentSetBlockHtml === "function" ? formatEquipmentSetBlockHtml(item, rx) : "")
    );
}

function buildEquipmentGemSocketControlsHtml(item) {
    if (!item || typeof normalizeEquipmentGemFields !== "function") return "";
    normalizeEquipmentGemFields(item);
    var opener =
        typeof getMaterialCount === "function" && typeof MATERIAL_SOCKET_OPENER !== "undefined"
            ? getMaterialCount(MATERIAL_SOCKET_OPENER)
            : 0;
    var parts = ['<div class="eq-gem-actions"><p class="eq-gem-actions__title">灵窍（镶嵌）</p>'];
    if (item.socketCount < 3) {
        parts.push(
            '<button type="button" id="eq-open-socket" class="btn btn--sm btn--ghost">开孔（持开孔器 ' +
                opener +
                "）</button>"
        );
    }
    /* 始终列出三窍：已开的可嵌/卸；未开的显示占位，避免 socketCount===0 时大片空白 */
    for (var si = 0; si < 3; si++) {
        if (si >= item.socketCount) {
            parts.push(
                '<div class="eq-gem-slot-row eq-gem-slot-row--locked">窍 ' +
                    (si + 1) +
                    '：<span class="eq-gem-slot-row__locked">未开启</span><span class="eq-gem-slot-row__hint"> — 请先开孔</span></div>'
            );
            continue;
        }
        var g = item.gemSlots[si];
        if (g) {
            var gzh = typeof GEM_KIND_ZH !== "undefined" ? GEM_KIND_ZH[g.kind] : g.kind;
            parts.push(
                '<div class="eq-gem-slot-row">窍 ' +
                    (si + 1) +
                    "：<strong>" +
                    gzh +
                    " " +
                    g.level +
                    ' 级</strong> <button type="button" class="btn btn--sm btn--ghost eq-gem-remove" data-slot="' +
                    si +
                    '">卸下</button></div>'
            );
        } else {
            parts.push(
                '<div class="eq-gem-slot-row">窍 ' +
                    (si + 1) +
                    '：空 <button type="button" class="btn btn--sm btn--accent eq-gem-inlay" data-slot="' +
                    si +
                    '">镶嵌</button></div>'
            );
        }
    }
    parts.push("</div>");
    return parts.join("");
}

// Show full detail of the item
const showItemInfo = (item, icon, type, i) => {
    if (type === "Equip" && player.inventory && player.inventory.equipment[i] !== undefined) {
        try {
            item = JSON.parse(player.inventory.equipment[i]);
        } catch (e) {}
    }
    if (type === "Unequip" && player.equipped && player.equipped[i]) {
        item = player.equipped[i];
    }

    dungeon.status.exploring = false;
    let itemInfo = document.querySelector("#equipmentInfo");
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    let dimContainer = document.querySelector(`#inventory`);
    itemInfo.style.display = "flex";
    dimContainer.style.filter = "brightness(50%)";
    var contentClass = "content";
    var mainBlock = "";
    if (type === "Equip") {
        var cmp = buildEquipmentCompareHtml(item, icon, rx);
        if (cmp) {
            contentClass += " content--eq-compare";
            mainBlock = cmp;
        } else {
            mainBlock = buildEquipmentSingleHtml(item, icon, rx);
        }
    } else {
        mainBlock = buildEquipmentSingleHtml(item, icon, rx);
    }
    var lockRow = "";
    if (type === "Equip") {
        lockRow =
            '<button type="button" id="toggle-item-lock" class="btn-item-lock">' +
            (item.locked ? "解锁" : "锁定") +
            "</button>";
    }
    var sellLocked = type === "Equip" && item.locked;
    var sellDisabled = sellLocked ? ' disabled="disabled" title="已锁定，无法典让"' : "";
    var enhanceBlock = "";
    var enchantBlock = "";
    if (
        (type === "Equip" || type === "Unequip") &&
        typeof tryEnhanceInventoryItem === "function" &&
        typeof getEnhanceSuccessPctForTargetStar === "function" &&
        typeof getEnhanceFailPenaltyStars === "function" &&
        typeof getMaterialCount === "function" &&
        typeof getEnhanceStoneCostForTargetStar === "function"
    ) {
        var es = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, Math.floor(item.enhanceStars))) : 0;
        var stones = getMaterialCount(MATERIAL_ENHANCE_STONE);
        if (es >= 10) {
            enhanceBlock =
                '<div class="eq-enhance-block"><p class="eq-enhance-block__title">淬火强化</p><p class="eq-enhance-block__muted">已至十星，无法再淬火。</p></div>';
        } else {
            var nextTarget = es + 1;
            var enhanceCost = getEnhanceStoneCostForTargetStar(nextTarget);
            var rate = getEnhanceSuccessPctForTargetStar(nextTarget);
            var pen = getEnhanceFailPenaltyStars(nextTarget);
            var penLine = nextTarget <= 3 ? "失败不掉星。" : "失败将按星阶反噬，可能跌落 " + pen + " 星。";
            var canEnh = stones >= enhanceCost;
            enhanceBlock =
                '<div class="eq-enhance-block">' +
                '<p class="eq-enhance-block__title">淬火强化</p>' +
                '<p class="eq-enhance-block__line">消耗 <strong>' +
                enhanceCost +
                '</strong> 枚<strong>强化石</strong>（目标星阶每星 1 枚），尝试升至 <strong>' +
                nextTarget +
                "★</strong>。成功率 <strong>" +
                rate +
                "%</strong>。</p>" +
                '<p class="eq-enhance-block__line eq-enhance-block__muted">' +
                penLine +
                "</p>" +
                '<button type="button" id="eq-enhance-btn" class="btn btn--sm btn--accent eq-enhance-block__btn"' +
                (canEnh ? "" : ' disabled="disabled" title="强化石不足"') +
                ">淬火强化（强化石 " +
                stones +
                "）</button></div>";
        }
    }
    if (
        (type === "Equip" || type === "Unequip") &&
        typeof tryEnchantInventoryItem === "function" &&
        typeof getMaterialCount === "function"
    ) {
        // 兼容旧存档：enchantTier/enchantPct 可能是字符串
        var enchSRaw = typeof item.enchantTier === "number" ? item.enchantTier : Number(item.enchantTier);
        var enchPRaw = typeof item.enchantPct === "number" ? item.enchantPct : Number(item.enchantPct);
        var enchS = isFinite(enchSRaw) ? Math.max(1, Math.min(4, Math.floor(enchSRaw))) : 0;
        var enchP = isFinite(enchPRaw) ? Math.max(1, Math.min(20, Math.floor(enchPRaw))) : 0;
        var enchStones2 = getMaterialCount(MATERIAL_ENCHANT_STONE);
        var hasEnchant = enchS > 0 && enchP > 0;
        var canEnchant = enchStones2 >= 1;
        enchantBlock =
            '<div class="eq-enhance-block eq-enchant-block">' +
            '<p class="eq-enhance-block__title">遗器附魔</p>' +
            (hasEnchant
                ? '<p class="eq-enhance-block__line">当前附魔：<strong class="eq-enchant-tier-' +
                  enchS +
                  '">第' +
                  enchS +
                  "阶 +" +
                  enchP +
                  "%</strong>（基于当前强化属性）</p>"
                : "") +
            '<p class="eq-enhance-block__line">消耗 1 枚<strong>附魔石</strong>，提升当前装备属性。</p>' +
            '<p class="eq-enhance-block__line eq-enhance-block__muted">可多次重铸附魔，新结果会覆盖旧附魔。</p>' +
            '<button type="button" id="eq-enchant-btn" class="btn btn--sm btn--accent eq-enhance-block__btn"' +
            (canEnchant ? "" : ' disabled="disabled" title="附魔石不足"') +
            ">进行附魔（附魔石 " +
            enchStones2 +
            "）</button></div>";
    }
    var enhanceEnchantRow = enhanceBlock || enchantBlock ? '<div class="eq-enhance-row">' + enhanceBlock + enchantBlock + "</div>" : "";
    var gemSocketRow = "";
    if ((type === "Equip" || type === "Unequip") && typeof buildEquipmentGemSocketControlsHtml === "function") {
        gemSocketRow = buildEquipmentGemSocketControlsHtml(item);
    }
    itemInfo.innerHTML = `
            <div class="${contentClass}">
                ${mainBlock}
                ${enhanceEnchantRow}
                ${gemSocketRow}
                <div class="button-container button-container--eq">
                    ${lockRow}
                    <button id="un-equip">${type}</button>
                    <button id="sell-equip"${sellDisabled}><i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(typeof applyGoldGainMult === "function" ? applyGoldGainMult(item.value) : item.value)}</button>
                    <button id="close-item-info">关闭</button>
                </div>
            </div>`;

    var enhBtn = document.querySelector("#eq-enhance-btn");
    if (enhBtn) {
        enhBtn.onclick = function () {
            if (enhBtn.disabled) return;
            var live =
                type === "Equip" && player.inventory && player.inventory.equipment[i] !== undefined
                    ? JSON.parse(player.inventory.equipment[i])
                    : type === "Unequip" && player.equipped && player.equipped[i]
                      ? player.equipped[i]
                      : item;
            var res = tryEnhanceInventoryItem(live);
            if (!res.ok) {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>' +
                        (res.message || "无法淬火。") +
                        '</p><div class="button-container"><button type="button" id="eq-enh-fail-ok">知晓</button></div></div>';
                    var okf = document.querySelector("#eq-enh-fail-ok");
                    if (okf) {
                        okf.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
                return;
            }
            if (type === "Equip") {
                replaceInventoryEquipmentAtIndex(i, live);
            } else if (type === "Unequip") {
                player.equipped[i] = live;
            }
            if (typeof applyEquipmentStats === "function") applyEquipmentStats();
            if (typeof saveData === "function") saveData();
            if (typeof showInventory === "function") showInventory();
            if (typeof showEquipment === "function") showEquipment();
            var ic2 = equipmentIcon(live.category);
            if (typeof defaultModalElement !== "undefined" && defaultModalElement && res.message) {
                itemInfo.style.display = "none";
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content eq-enhance-result"><p>' +
                    res.message +
                    '</p><div class="button-container"><button type="button" id="eq-enh-res-ok">知晓</button></div></div>';
                var okr = document.querySelector("#eq-enh-res-ok");
                if (okr) {
                    okr.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                        itemInfo.style.display = "flex";
                        dimContainer.style.filter = "brightness(50%)";
                        showItemInfo(live, ic2, type, i);
                    };
                }
            } else {
                showItemInfo(live, ic2, type, i);
            }
        };
    }

    var enchBtn = document.querySelector("#eq-enchant-btn");
    if (enchBtn) {
        enchBtn.onclick = function () {
            if (enchBtn.disabled) return;
            var live =
                type === "Equip" && player.inventory && player.inventory.equipment[i] !== undefined
                    ? JSON.parse(player.inventory.equipment[i])
                    : type === "Unequip" && player.equipped && player.equipped[i]
                      ? player.equipped[i]
                      : item;
            var res = tryEnchantInventoryItem(live);
            if (!res.ok) {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>' +
                        (res.message || "无法附魔。") +
                        '</p><div class="button-container"><button type="button" id="eq-ench-fail-ok">知晓</button></div></div>';
                    var okf2 = document.querySelector("#eq-ench-fail-ok");
                    if (okf2) {
                        okf2.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
                return;
            }
            if (type === "Equip") {
                replaceInventoryEquipmentAtIndex(i, live);
            } else if (type === "Unequip") {
                player.equipped[i] = live;
            }
            if (typeof applyEquipmentStats === "function") applyEquipmentStats();
            if (typeof saveData === "function") saveData();
            if (typeof showInventory === "function") showInventory();
            if (typeof showEquipment === "function") showEquipment();
            var ic3 = equipmentIcon(live.category);
            if (typeof defaultModalElement !== "undefined" && defaultModalElement && res.message) {
                itemInfo.style.display = "none";
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content eq-enhance-result"><p>' +
                    res.message +
                    '</p><div class="button-container"><button type="button" id="eq-ench-res-ok">知晓</button></div></div>';
                var okr2 = document.querySelector("#eq-ench-res-ok");
                if (okr2) {
                    okr2.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                        itemInfo.style.display = "flex";
                        dimContainer.style.filter = "brightness(50%)";
                        showItemInfo(live, ic3, type, i);
                    };
                }
            } else {
                showItemInfo(live, ic3, type, i);
            }
        };
    }

    function getLiveEquipmentForGems() {
        if (type === "Equip" && player.inventory && player.inventory.equipment[i] !== undefined) {
            try {
                return JSON.parse(player.inventory.equipment[i]);
            } catch (e) {
                return item;
            }
        }
        if (type === "Unequip" && player.equipped && player.equipped[i]) return player.equipped[i];
        return item;
    }
    function saveLiveEquipmentForGems(live) {
        if (typeof normalizeEquipmentGemFields === "function") normalizeEquipmentGemFields(live);
        if (type === "Equip") replaceInventoryEquipmentAtIndex(i, live);
        else if (type === "Unequip") player.equipped[i] = live;
        if (typeof applyEquipmentStats === "function") applyEquipmentStats();
        if (typeof saveData === "function") saveData();
        if (typeof showInventory === "function") showInventory();
        if (typeof showEquipment === "function") showEquipment();
        var icg = equipmentIcon(live.category);
        showItemInfo(live, icg, type, i);
    }
    var openSock = document.querySelector("#eq-open-socket");
    if (openSock && typeof tryUseSocketOpenerOnItem === "function") {
        openSock.onclick = function () {
            var live = getLiveEquipmentForGems();
            var res = tryUseSocketOpenerOnItem(live);
            if (!res.ok) {
                if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                    defaultModalElement.style.display = "flex";
                    defaultModalElement.innerHTML =
                        '<div class="content"><p>' +
                        (res.message || "无法开孔。") +
                        '</p><div class="button-container"><button type="button" id="eq-sock-fail-ok">知晓</button></div></div>';
                    var okf = document.querySelector("#eq-sock-fail-ok");
                    if (okf) {
                        okf.onclick = function () {
                            defaultModalElement.style.display = "none";
                            defaultModalElement.innerHTML = "";
                        };
                    }
                }
                return;
            }
            saveLiveEquipmentForGems(live);
            if (typeof defaultModalElement !== "undefined" && defaultModalElement && res.message) {
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML =
                    '<div class="content"><p>' +
                    res.message +
                    '</p><div class="button-container"><button type="button" id="eq-sock-ok">知晓</button></div></div>';
                var okz = document.querySelector("#eq-sock-ok");
                if (okz) {
                    okz.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                    };
                }
            }
        };
    }
    var inlayBtns = document.querySelectorAll(".eq-gem-inlay");
    for (var gi = 0; gi < inlayBtns.length; gi++) {
        inlayBtns[gi].onclick = (function (btn) {
            return function () {
                var slot = Math.floor(Number(btn.getAttribute("data-slot")) || 0);
                if (typeof openGemInlayChooser !== "function") return;
                openGemInlayChooser(slot, function (kind, level) {
                    var live = getLiveEquipmentForGems();
                    var res = trySocketGemOnItem(live, slot, kind, level);
                    if (!res.ok) {
                        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                            defaultModalElement.style.display = "flex";
                            defaultModalElement.innerHTML =
                                '<div class="content"><p>' +
                                (res.message || "镶嵌失败。") +
                                '</p><div class="button-container"><button type="button" id="eq-inlay-fail-ok">知晓</button></div></div>';
                            var oki = document.querySelector("#eq-inlay-fail-ok");
                            if (oki) {
                                oki.onclick = function () {
                                    defaultModalElement.style.display = "none";
                                    defaultModalElement.innerHTML = "";
                                };
                            }
                        }
                        return;
                    }
                    saveLiveEquipmentForGems(live);
                });
            };
        })(inlayBtns[gi]);
    }
    var remBtns = document.querySelectorAll(".eq-gem-remove");
    for (var gr = 0; gr < remBtns.length; gr++) {
        remBtns[gr].onclick = (function (btn) {
            return function () {
                var slot = Math.floor(Number(btn.getAttribute("data-slot")) || 0);
                var live = getLiveEquipmentForGems();
                var res = tryUnsocketGemFromItem(live, slot);
                if (!res.ok) return;
                saveLiveEquipmentForGems(live);
            };
        })(remBtns[gr]);
    }

    var toggleLock = document.querySelector("#toggle-item-lock");
    if (toggleLock) {
        toggleLock.onclick = function () {
            if (type !== "Equip") return;
            var o = JSON.parse(player.inventory.equipment[i]);
            o.locked = !o.locked;
            replaceInventoryEquipmentAtIndex(i, o);
            showItemInfo(JSON.parse(player.inventory.equipment[i]), icon, type, i);
        };
    }

    // Equip/Unequip button for the item
    let unEquip = document.querySelector("#un-equip");
    // 穿戴上限：超出则禁用按钮（避免用户点了才弹提示）
    if (type === "Equip" && unEquip) {
        try {
            var histLvl =
                typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl)
                    ? Math.floor(player.maxDungeonFloorLvl)
                    : Math.floor(typeof player.lvl === "number" && !isNaN(player.lvl) ? player.lvl : 1);
            var maxEquipLvl = histLvl + 5;
            var itemLvlRaw = item && typeof item.lvl === "number" ? item.lvl : Number(item && item.lvl);
            var itemLvl = Math.max(1, Math.floor(isFinite(itemLvlRaw) ? itemLvlRaw : 1));

            if (itemLvl > maxEquipLvl) {
                unEquip.disabled = true;
                unEquip.title = "无法穿戴：超出上限 " + maxEquipLvl + "（历史最高 + 5）。";
                unEquip.style.opacity = "0.55";
                unEquip.style.cursor = "not-allowed";
            }
        } catch (e) {}
    }
    unEquip.onclick = function () {
        if (type == "Equip") {
            var equipItem = JSON.parse(player.inventory.equipment[i]);
            if (!equipItem.type || !EQUIP_SLOT_TYPE_SET[equipItem.type]) {
                return;
            }

            // 穿戴上限限制：只能穿历史最高等级 + 5 以下装备
            try {
                var histLvl =
                    typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl)
                        ? Math.floor(player.maxDungeonFloorLvl)
                        : Math.floor(typeof player.lvl === "number" && !isNaN(player.lvl) ? player.lvl : 1);
                var maxEquipLvl = histLvl + 5;

                var itemLvlRaw = typeof equipItem.lvl === "number" ? equipItem.lvl : Number(equipItem.lvl);
                var itemLvl = Math.max(1, Math.floor(isFinite(itemLvlRaw) ? itemLvlRaw : 1));

                if (itemLvl > maxEquipLvl) {
                    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
                        defaultModalElement.style.display = "flex";
                        defaultModalElement.innerHTML = `
                            <div class="content">
                                <p>无法穿戴：此件 ${itemLvl} 级，超出上限 ${maxEquipLvl}（历史最高 + 5）。</p>
                                <div class="button-container">
                                    <button type="button" id="equip-limit-ok">知晓</button>
                                </div>
                            </div>`;
                        var ok = document.querySelector("#equip-limit-ok");
                        if (ok) {
                            ok.onclick = function () {
                                defaultModalElement.style.display = "none";
                                defaultModalElement.innerHTML = "";
                            };
                        }
                    }
                    return;
                }
            } catch (e) {}

            var dupIdx = findEquippedIndexByType(equipItem.type);
            player.inventory.equipment.splice(i, 1);
            if (dupIdx >= 0) {
                var oldItem = player.equipped.splice(dupIdx, 1)[0];
                player.inventory.equipment.push(JSON.stringify(oldItem));
            }
            player.equipped.push(equipItem);
            sortEquippedBySlotOrder();

            itemInfo.style.display = "none";
            dimContainer.style.filter = "brightness(100%)";
            playerLoadStats();
            saveData();
            continueExploring();
        } else if (type == "Unequip") {

            // Remove the item from the equipment and add it to the inventory
            player.equipped.splice(i, 1);
            if (!tryPushInventoryEquipment(JSON.stringify(item))) {
                player.equipped.splice(i, 0, item);
                itemInfo.style.display = "none";
                dimContainer.style.filter = "brightness(100%)";
                playerLoadStats();
                showInventoryFullModal();
                return;
            }

            itemInfo.style.display = "none";
            dimContainer.style.filter = "brightness(100%)";
            playerLoadStats();
            saveData();
            continueExploring();
        }
    };

    // Sell equipment
    let sell = document.querySelector("#sell-equip");
    sell.onclick = function () {
        if (type === "Equip" && player.inventory && player.inventory.equipment[i]) {
            try {
                var chk = JSON.parse(player.inventory.equipment[i]);
                if (chk.locked) {
                    return;
                }
            } catch (e) {}
        }
        itemInfo.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
        <div class="content">
            <p>典让此件 <span class="${item.rarity}">${icon}${equipmentRarityLabel(item.rarity)} ${weaponOrArmorDisplayName(item)}</span>？</p>
            <div class="button-container">
                <button id="sell-confirm">典让</button>
                <button id="sell-cancel">作罢</button>
            </div>
        </div>`;

        let confirm = document.querySelector("#sell-confirm");
        let cancel = document.querySelector("#sell-cancel");
        confirm.onclick = function () {

            // Sell the equipment
            var sellPayout = typeof applyGoldGainMult === "function" ? applyGoldGainMult(item.value) : item.value;
            if (type == "Equip") {
                player.gold += sellPayout;
                player.inventory.equipment.splice(i, 1);
            } else if (type == "Unequip") {
                player.gold += sellPayout;
                player.equipped.splice(i, 1);
            }

            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            dimContainer.style.filter = "brightness(100%)";
            playerLoadStats();
            saveData();
            continueExploring();
        }
        cancel.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            itemInfo.style.display = "flex";
            continueExploring();
        }
    };

    // Close item info
    let close = document.querySelector("#close-item-info");
    close.onclick = function () {

        itemInfo.style.display = "none";
        dimContainer.style.filter = "brightness(100%)";
        continueExploring();
    };
}

function learnSectPassive(id) {
    if (typeof PASSIVE_BY_ID === "undefined" || !player) return;
    var p = PASSIVE_BY_ID[id];
    if (!p || p.sectId !== player.sect) return;
    if ((player.learnedPassives || []).indexOf(id) >= 0) return;
    if (player.lvl < p.reqLvl) {
        return;
    }
    if (player.gold < p.cost) {
        return;
    }
    player.gold -= p.cost;
    player.learnedPassives.push(id);
    if (!player.learnedPassiveLevels || typeof player.learnedPassiveLevels !== "object") player.learnedPassiveLevels = {};
    if (typeof player.learnedPassiveLevels[id] !== "number" || player.learnedPassiveLevels[id] < 1) {
        player.learnedPassiveLevels[id] = 1;
    }
    playerLoadStats();
    saveData();
}

function toggleSectPassive(id) {
    if (typeof PASSIVE_BY_ID === "undefined" || !player) return;
    if ((player.learnedPassives || []).indexOf(id) < 0) return;
    var eq = player.equippedPassives || [];
    var ix = eq.indexOf(id);
    if (ix >= 0) {
        eq.splice(ix, 1);
    } else {
        if (eq.length >= MAX_EQUIPPED_PASSIVES) {
            return;
        }
        eq.push(id);
    }
    player.equippedPassives = eq;
    playerLoadStats();
    saveData();
}

function sectHtmlEscape(str) {
    if (str == null || str === "") return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
}

function renderSectPassivePanel(containerId) {
    var el = document.getElementById(containerId || "sectPassivePanelModal");
    if (!el || typeof PASSIVE_BY_ID === "undefined" || typeof getPassivesForSect !== "function") {
        if (el) el.innerHTML = "";
        return;
    }
    if (typeof objectValidation === "function") objectValidation();
    var sid = player.sect;
    var sect = typeof getSectById === "function" ? getSectById(sid) : null;
    if (!sid || !sect) {
        el.innerHTML = "<div class=\"sect-ui sect-ui--empty\"><div class=\"sect-ui__empty-inner\"><i class=\"fas fa-book-open\" aria-hidden=\"true\"></i><p>尚未加入门派</p><span class=\"sect-ui__empty-hint\">完成塑道本源后可选择门派</span></div></div>";
        return;
    }
    var list = getPassivesForSect(sid);
    var learned = player.learnedPassives || [];
    var equipped = player.equippedPassives || [];
    var learnedLv = player.learnedPassiveLevels || {};
    var eqBonusLvMap = typeof getEquippedPassiveBonusLevelMap === "function" ? getEquippedPassiveBonusLevelMap() : {};
    var maxSlots = typeof MAX_EQUIPPED_PASSIVES === "number" ? MAX_EQUIPPED_PASSIVES : 3;
    var slotsDots = "";
    for (var si = 0; si < maxSlots; si++) {
        slotsDots += "<span class=\"sect-ui__slot-dot" + (si < equipped.length ? " is-on" : "") + "\"></span>";
    }
    var html = "<div class=\"sect-ui\">";
    html += "<header class=\"sect-ui__hero\">";
    html += "<div class=\"sect-ui__hero-text\">";
    html += "<span class=\"sect-ui__kicker\">门派信息</span>";
    html += "<h4 class=\"sect-ui__sect-title\">" + sectHtmlEscape(sect.name);
    var weaponZh = typeof getSectWeaponTypeZh === "function" ? getSectWeaponTypeZh(sid) : "";
    if (weaponZh) {
        html += "<span class=\"sect-ui__weapon-type\" aria-label=\"专属器型\"> · 本命" + sectHtmlEscape(weaponZh) + "</span>";
    }
    var armorAffix = getSectArmorAffinitySummaryZh(sid);
    if (armorAffix) {
        html += "<span class=\"sect-ui__weapon-type\" aria-label=\"对应甲种\"> · " + sectHtmlEscape(armorAffix) + "</span>";
    }
    html += "</h4>";
    html += "<p class=\"sect-ui__blurb\">" + sectHtmlEscape(sect.blurb) + "</p>";
    html += "</div>";
    html += "<div class=\"sect-ui__hero-side\">";
    html += "<div class=\"sect-ui__slots-box\">";
    html += "<span class=\"sect-ui__slots-label\">斗法携带</span>";
    html += "<div class=\"sect-ui__slot-dots\">" + slotsDots + "</div>";
    html += "<span class=\"sect-ui__slots-num\">" + equipped.length + "/" + maxSlots + "</span>";
    html += "</div>";
    html += "<p class=\"sect-ui__rule\">每场战斗最多 " + maxSlots + " 个被动上阵</p>";
    html += "</div></header>";
    html += "<div class=\"sect-ui__scroll\"><ul class=\"sect-ui__list\">";
    for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var isLearned = learned.indexOf(p.id) >= 0;
        var isEq = equipped.indexOf(p.id) >= 0;
        var canLearn = player.lvl >= p.reqLvl && !isLearned && player.gold >= p.cost;
        var why = "";
        if (!isLearned && !canLearn) {
            if (player.lvl < p.reqLvl) why = " title=\"境界不足\"";
            else if (player.gold < p.cost) why = " title=\"灵石不足\"";
        }
        var idxStr = (i + 1) < 10 ? "0" + (i + 1) : String(i + 1);
        var pBaseLv = isLearned ? Math.max(1, Math.floor(Number(learnedLv[p.id]) || 1)) : 0;
        var pEqLvRaw = isLearned ? Math.max(0, Math.floor(Number(eqBonusLvMap[p.id]) || 0)) : 0;
        var pLv = isLearned && typeof getPassiveEffectiveLevel === "function"
            ? getPassiveEffectiveLevel(p.id)
            : (pBaseLv + pEqLvRaw);
        var pEqLv = Math.max(0, pLv - pBaseLv);
        var cardCls = "sect-ui__card";
        if (isEq) cardCls += " sect-ui__card--on";
        if (!isLearned && !canLearn) cardCls += " sect-ui__card--locked";
        var costLabel = p.cost ? sectHtmlEscape(String(nFormatter(p.cost))) + " 灵石" : "入门";
        var costCls = p.cost ? "sect-ui__pill sect-ui__pill--cost" : "sect-ui__pill sect-ui__pill--free";
        html += "<li class=\"" + cardCls + "\">";
        html += "<div class=\"sect-ui__card-top\">";
        html += "<span class=\"sect-ui__idx\">" + idxStr + "</span>";
        html += "<div class=\"sect-ui__title-row\">";
        html += "<span class=\"sect-ui__name\">" + sectHtmlEscape(p.name) + "</span>";
        if (isEq) html += "<span class=\"sect-ui__badge-on\">上阵</span>";
        html += "</div></div>";
        html += "<div class=\"sect-ui__pills\">";
        html += "<span class=\"sect-ui__pill\">" + sectHtmlEscape(cultivationRealmLabel(p.reqLvl)) + "</span>";
        html += "<span class=\"" + costCls + "\"><i class=\"fas fa-coins\" aria-hidden=\"true\"></i>" + costLabel + "</span>";
        if (isLearned) {
            var maxLv = (typeof PASSIVE_LEVEL_MAX === "number" && PASSIVE_LEVEL_MAX > 0) ? PASSIVE_LEVEL_MAX : 20;
            var maxTag = pLv >= maxLv ? " MAX" : "";
            html += "<span class=\"sect-ui__pill\">功法 " + pLv + " 级" + maxTag + (pEqLv > 0 ? "（装备+" + pEqLv + (pEqLvRaw > pEqLv ? "，已达上限" : "") + "）" : "") + "</span>";
        }
        html += "</div>";
        html += "<p class=\"sect-ui__desc\">" + sectHtmlEscape(p.desc) + "</p>";
        html += "<div class=\"sect-ui__foot\">";
        if (!isLearned) {
            html += "<button type=\"button\" class=\"btn btn--sm btn--primary sect-ui__btn\" data-learn=\"" + p.id + "\"" + (canLearn ? "" : " disabled") + why + ">领悟</button>";
        } else {
            html += "<button type=\"button\" class=\"btn btn--sm sect-ui__btn " + (isEq ? "btn--ghost" : "btn--accent") + "\" data-toggle=\"" + p.id + "\">" + (isEq ? "卸下" : "上阵") + "</button>";
        }
        html += "</div></li>";
    }
    html += "</ul></div></div>";
    el.innerHTML = html;
    el.querySelectorAll("[data-learn]").forEach(function (btn) {
        btn.onclick = function () {
            learnSectPassive(btn.getAttribute("data-learn"));
        };
    });
    el.querySelectorAll("[data-toggle]").forEach(function (btn) {
        btn.onclick = function () {
            toggleSectPassive(btn.getAttribute("data-toggle"));
        };
    });
}

function refreshSectPassiveModal() {
    if (typeof renderSectPassivePanel === "function") renderSectPassivePanel("sectPassivePanelModal");
}

// Show inventory
const showInventory = () => {
    if (!player.inventory) player.inventory = { equipment: [] };
    if (!Array.isArray(player.inventory.equipment)) player.inventory.equipment = [];
    ensureInventoryUiFilters();
    clampInventoryEquipmentToMax();

    var bagTab = player.inventory.bagTab;
    if (bagTab !== "equip" && bagTab !== "mat" && bagTab !== "gem") bagTab = "equip";
    player.inventory.bagTab = bagTab;

    var splitEq = document.getElementById("invSplitEquip");
    var splitMat = document.getElementById("invSplitMat");
    var splitGem = document.getElementById("invSplitGem");
    var btnEq = document.getElementById("inv-tab-btn-equip");
    var btnMat = document.getElementById("inv-tab-btn-mat");
    var btnGem = document.getElementById("inv-tab-btn-gem");
    if (splitEq && splitMat) {
        splitEq.hidden = bagTab !== "equip";
        splitMat.hidden = bagTab !== "mat";
    }
    if (splitGem) splitGem.hidden = bagTab !== "gem";
    if (btnEq && btnMat) {
        btnEq.classList.toggle("inv-tab--active", bagTab === "equip");
        btnMat.classList.toggle("inv-tab--active", bagTab === "mat");
        btnEq.setAttribute("aria-selected", bagTab === "equip" ? "true" : "false");
        btnMat.setAttribute("aria-selected", bagTab === "mat" ? "true" : "false");
    }
    if (btnGem) {
        btnGem.classList.toggle("inv-tab--active", bagTab === "gem");
        btnGem.setAttribute("aria-selected", bagTab === "gem" ? "true" : "false");
    }

    if (bagTab === "mat") {
        renderInventoryMaterialsPanel();
        return;
    }
    if (bagTab === "gem") {
        renderInventoryGemsPanel();
        return;
    }

    var vr = document.getElementById("inv-view-rarity");
    var vt = document.getElementById("inv-view-type");
    if (vr) {
        vr.value = player.inventory.uiFilter.rarity;
        vr.className = "select-field select-field--inv " + (player.inventory.uiFilter.rarity === "All" ? "Common" : player.inventory.uiFilter.rarity);
    }
    if (vt) vt.value = player.inventory.uiFilter.slotType;

    var capEl = document.getElementById("invBagCap");
    if (capEl) {
        capEl.textContent = `${player.inventory.equipment.length}/${INVENTORY_EQUIPMENT_MAX}`;
    }
    var autoBatchCb = document.getElementById("inv-auto-batch-sell");
    if (autoBatchCb) {
        autoBatchCb.checked = !!player.inventory.autoBatchSell;
    }
    let playerInventoryList = document.getElementById("playerInventory");
    playerInventoryList.innerHTML = "";

    if (player.inventory.equipment.length == 0) {
        playerInventoryList.innerHTML =
            '<div class="inv-empty" role="status"><i class="fas fa-scroll inv-empty__icon" aria-hidden="true"></i><strong>行囊空空</strong><span>尚无遗器。斩妖、开箱或秘境奇缘可得。</span></div>';
        return;
    }

    var visibleCount = 0;
    for (let i = 0; i < player.inventory.equipment.length; i++) {
        const item = JSON.parse(player.inventory.equipment[i]);
        if (!passesBagFilter(item)) continue;
        visibleCount++;

        let itemDiv = document.createElement("div");
        let icon = equipmentIcon(item.category);
        var dispName = weaponOrArmorDisplayName(item);
        var isMythicName = item.rarity === "Chronarch" || item.rarity === "Apexother";
        var mythicNameClass = isMythicName ? " inv-slot__name--mythic" : "";
        var mythicNameData = isMythicName ? ' data-name="' + sectHtmlEscape(dispName) + '"' : "";
        var es = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, item.enhanceStars)) : 0;
        var starBadge =
            es > 0
                ? '<span class="inv-slot__stars" title="星阶">' +
                  es +
                  "★</span>"
                : "";
        itemDiv.className =
            "items inv-slot inv-slot--" +
            item.rarity.toLowerCase() +
            (isMythicName ? " inv-slot--mythic" : "") +
            (item.locked ? " inv-slot--locked" : "");
        itemDiv.setAttribute("role", "button");
        itemDiv.setAttribute("tabindex", "0");
        itemDiv.innerHTML =
            '<button type="button" class="inv-slot__lock" title="' +
            (item.locked ? "点击解锁" : "点击锁定") +
            '" aria-label="' +
            (item.locked ? "解锁" : "锁定") +
            '"><i class="fas ' +
            (item.locked ? "fa-lock" : "fa-unlock") +
            '" aria-hidden="true"></i></button>' +
            starBadge +
            '<div class="inv-slot__icon" aria-hidden="true">' +
            icon +
            '</div><div class="inv-slot__meta"><span class="inv-slot__tier ' +
            item.rarity +
            '">' +
            equipmentRarityLabel(item.rarity) +
            '</span><span class="inv-slot__name ' +
            mythicNameClass +
            " " +
            item.rarity +
            '"' +
            mythicNameData +
            ">" +
            dispName +
            "</span></div>";

        var lockBtn = itemDiv.querySelector(".inv-slot__lock");
        lockBtn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            toggleInventoryLockAtIndex(i);
        });

        const openEquip = function () {
            var cur = JSON.parse(player.inventory.equipment[i]);
            showItemInfo(cur, equipmentIcon(cur.category), "Equip", i);
        };
        itemDiv.addEventListener("click", openEquip);
        itemDiv.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                openEquip();
            }
        });

        playerInventoryList.appendChild(itemDiv);
    }

    if (visibleCount === 0) {
        playerInventoryList.innerHTML =
            '<div class="inv-empty inv-empty--filter" role="status"><i class="fas fa-filter inv-empty__icon" aria-hidden="true"></i><strong>当前筛选无物</strong><span>调整「检视品阶」或「检视种类」即可见遗器。</span></div>';
    }
}

// Show equipment（固定六格：武器、护甲、盾、头盔、戒指、项链）
const showEquipment = () => {
    let playerEquipmentList = document.getElementById("playerEquipment");
    playerEquipmentList.innerHTML = "";
    normalizePlayerEquippedSlots();

    EQUIP_SLOT_TYPE_ORDER.forEach(function (slotType) {
        let wrap = document.createElement("div");
        wrap.className = "items inv-equip-slot inv-equip-slot--fixed";
        var idx = findEquippedIndexByType(slotType);
        var lbl = EQUIP_SLOT_TYPE_LABEL_ZH[slotType] || slotType;
        if (idx < 0) {
            wrap.innerHTML =
                '<div class="inv-equip-slot__empty" role="img" aria-label="' +
                lbl +
                '（空）">' +
                '<span class="inv-equip-slot__lbl">' +
                lbl +
                "</span>" +
                '<span class="inv-equip-slot__ph">—</span></div>';
        } else {
            const item = player.equipped[idx];
            let icon = equipmentIcon(item.category);
            var disp = weaponOrArmorDisplayName(item);
            var esEq = typeof item.enhanceStars === "number" ? Math.max(0, Math.min(10, item.enhanceStars)) : 0;
            var starEq = esEq > 0 ? '<span class="inv-equip-btn__stars">' + esEq + "★</span>" : "";
            wrap.innerHTML =
                '<button type="button" class="inv-equip-btn ' +
                item.rarity +
                '" aria-label="已装备' +
                lbl +
                "：" +
                disp +
                '，点击褪下">' +
                starEq +
                icon +
                "</button>";
            wrap.querySelector("button").addEventListener("click", function () {
                var j = findEquippedIndexByType(slotType);
                if (j >= 0) {
                    var it = player.equipped[j];
                    var ic = equipmentIcon(it.category);
                    showItemInfo(it, ic, "Unequip", j);
                }
            });
        }
        playerEquipmentList.appendChild(wrap);
    });
}

// Apply the equipment stats to the player
const applyEquipmentStats = () => {
    // Reset the equipment stats
    player.equippedStats = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0
    };

    for (let i = 0; i < player.equipped.length; i++) {
        const item = player.equipped[i];
        if (!item || !Array.isArray(item.stats)) continue;

        // Iterate through the stats array and update the player stats
        item.stats.forEach(stat => {
            for (const key in stat) {
                var val = Number(stat[key]);
                if (!isFinite(val)) continue;
                if (typeof player.equippedStats[key] !== "number") player.equippedStats[key] = 0;
                player.equippedStats[key] += val;
            }
        });

        // 护甲甲种额外加成（仅 Armor 类型）
        var armorClassBonus = getArmorClassBonusMap(item);
        if (armorClassBonus) {
            for (const bonusKey in armorClassBonus) {
                var bonusVal = Number(armorClassBonus[bonusKey]);
                if (!isFinite(bonusVal)) continue;
                if (typeof player.equippedStats[bonusKey] !== "number") player.equippedStats[bonusKey] = 0;
                player.equippedStats[bonusKey] += bonusVal;
            }
        }
    }
    if (typeof applyEquippedGemsToStats === "function") applyEquippedGemsToStats();
    calculateStats();
}

const unequipAll = () => {
    if (!canUnequipAllToInventory()) {
        return;
    }
    for (let i = player.equipped.length - 1; i >= 0; i--) {
        const item = player.equipped[i];
        player.equipped.splice(i, 1);
        tryPushInventoryEquipment(JSON.stringify(item));
    }
    playerLoadStats();
    saveData();
}

const sellAll = (rarity) => {
    if (rarity == "All") {
        if (player.inventory.equipment.length === 0) return;
        var canSellAnyAll = false;
        for (var ai = 0; ai < player.inventory.equipment.length; ai++) {
            try {
                if (!JSON.parse(player.inventory.equipment[ai]).locked) {
                    canSellAnyAll = true;
                    break;
                }
            } catch (e) {
                canSellAnyAll = true;
                break;
            }
        }
        if (!canSellAnyAll) return;
        for (let i = 0; i < player.inventory.equipment.length; i++) {
            const equipment = JSON.parse(player.inventory.equipment[i]);
            if (equipment.locked) continue;
            player.gold += typeof applyGoldGainMult === "function" ? applyGoldGainMult(equipment.value) : equipment.value;
            player.inventory.equipment.splice(i, 1);
            i--;
        }
        playerLoadStats();
        saveData();
    } else {
        var selectedTierIdx = getEquipmentRarityTierIndex(rarity);
        let rarityCheck = false;
        for (let i = 0; i < player.inventory.equipment.length; i++) {
            const equipment = JSON.parse(player.inventory.equipment[i]);
            if (!equipment.locked && getEquipmentRarityTierIndex(equipment.rarity) <= selectedTierIdx) {
                rarityCheck = true;
                break;
            }
        }
        if (rarityCheck) {
            for (let i = 0; i < player.inventory.equipment.length; i++) {
                const equipment = JSON.parse(player.inventory.equipment[i]);
                if (equipment.locked || getEquipmentRarityTierIndex(equipment.rarity) > selectedTierIdx) continue;
                player.gold += typeof applyGoldGainMult === "function" ? applyGoldGainMult(equipment.value) : equipment.value;
                player.inventory.equipment.splice(i, 1);
                i--;
            }
            playerLoadStats();
            saveData();
        }
    }
}

const createEquipmentPrint = (condition) => {
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    let item = createEquipment();
    if (!item) {
        if (condition == "combat") {
            addCombatLog("行囊已满，无法纳下更多遗器。");
        } else if (condition == "dungeon") {
            addDungeonLog("行囊已满，无法纳下更多遗器。");
        }
        return;
    }
    let panel = `
        <div class="primary-panel" style="padding: 0.5rem; margin-top: 0.5rem;">
                <h4 class="${item.rarity}">${item.icon}${equipmentRarityLabel(item.rarity)} ${weaponOrArmorDisplayName(item)} ${cultivationRealmLabel(item.lvl)}</h4>
                ${formatEquipmentPassiveBonusMetaHtml(item)}
                ${formatArmorClassBonusMetaHtml(item)}
                <ul>
                ${item.stats.map(stat => {
        var k = Object.keys(stat)[0];
        if (k === "critRate" || k === "critDmg" || k === "atkSpd" || k === "vamp") {
            return `<li>${formatEquipmentStatKeyLabel(k)}+${stat[k].toFixed(2).replace(rx, "$1")}%</li>`;
        }
        return `<li>${formatEquipmentStatKeyLabel(k)}+${stat[k]}</li>`;
    }).join('')}
            </ul>
            ${typeof item.setId === "number" && typeof formatEquipmentSetBlockHtml === "function" ? formatEquipmentSetBlockHtml(item, rx) : ""}
        </div>`;
    const tierSpan = `<span class="${item.rarity}">${equipmentRarityLabel(item.rarity)}</span>`;
    const tierLine = condition == "combat"
        ? `杀伐初歇，气机未冷，虚无里忽浮一道玄纹认主——其阶位归于 ${tierSpan}。`
        : `幽匣轻启，雾岚入心一瞬，恍有天痕漏下字迹：阶位 ${tierSpan}。`;
    if (condition == "combat") {
        addCombatLog(tierLine);
        addCombatLog(`${enemy.name}遗落 <span class="${item.rarity}">${weaponOrArmorDisplayName(item)}</span>。<br>${panel}`);
    } else if (condition == "dungeon") {
        addDungeonLog(tierLine);
        addDungeonLog(`你拾得 <span class="${item.rarity}">${weaponOrArmorDisplayName(item)}</span>。<br>${panel}`);
    }
    maybeAutoBatchSellAfterLoot();
}

(function initInventoryAutoBatchSell() {
    var cb = document.getElementById("inv-auto-batch-sell");
    if (!cb || cb._invAutoBound) return;
    cb._invAutoBound = true;
    cb.addEventListener("change", function () {
        if (typeof player === "undefined" || player === null) return;
        ensureInventoryUiFilters();
        player.inventory.autoBatchSell = cb.checked;
        if (typeof saveData === "function") saveData();
    });
})();

(function initInventoryBagFilters() {
    var vr = document.getElementById("inv-view-rarity");
    var vt = document.getElementById("inv-view-type");
    if (!vr || !vt || vr._invFilterBound) return;
    vr._invFilterBound = true;
    vt._invFilterBound = true;
    function applyBagFilter() {
        if (typeof player === "undefined" || player === null) return;
        ensureInventoryUiFilters();
        player.inventory.uiFilter.rarity = vr.value;
        player.inventory.uiFilter.slotType = vt.value;
        vr.className = "select-field select-field--inv " + (vr.value === "All" ? "Common" : vr.value);
        if (typeof saveData === "function") saveData();
        if (typeof showInventory === "function") showInventory();
    }
    vr.addEventListener("change", applyBagFilter);
    vt.addEventListener("change", applyBagFilter);
})();

(function initInventoryTabs() {
    var btns = document.querySelectorAll("[data-inv-tab]");
    if (!btns.length || (btns[0] && btns[0]._invTabBound)) return;
    if (btns[0]) btns[0]._invTabBound = true;
    btns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            if (typeof player === "undefined" || !player) return;
            var t = btn.getAttribute("data-inv-tab");
            if (t !== "equip" && t !== "mat" && t !== "gem") return;
            ensureInventoryUiFilters();
            player.inventory.bagTab = t;
            if (typeof saveData === "function") saveData();
            if (typeof showInventory === "function") showInventory();
        });
    });
})();
