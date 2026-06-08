/**
 * 洞天劫 · 灵宠法器：三部位装备、类型匹配、机缘加成、秘境掉落（与灵宠同概率）
 */
(function () {
    var PET_EQUIP_DROP_CHANCE = 0.01;
    var PET_EQUIP_MAX_BAG = 30;
    var PET_EQUIP_MAX_LVL_PER_FLOOR = 5;

    var PET_EQUIP_SLOTS = ["horn", "collar", "scale"];
    var PET_EQUIP_SLOT_ZH = { horn: "灵角", collar: "灵环", scale: "灵鳞" };
    var PET_EQUIP_SLOT_ICON = { horn: "fa-dragon", collar: "fa-circle-notch", scale: "fa-shield-halved" };

    var PET_EQUIP_TYPE_IDS = ["attack", "defense", "stamina", "universal"];
    var PET_EQUIP_TYPE_ZH = {
        attack: "攻击型",
        defense: "防御型",
        stamina: "体力型",
        universal: "通用型",
    };

    var PET_EQUIP_RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legend"];
    var PET_EQUIP_RARITY_ZH = {
        common: "凡品",
        uncommon: "灵品",
        rare: "宝品",
        epic: "仙品",
        legend: "神品",
    };
    var PET_EQUIP_RARITY_CLASS = {
        common: "Common",
        uncommon: "Uncommon",
        rare: "Rare",
        epic: "Epic",
        legend: "Legendary",
    };
    var PET_EQUIP_RARITY_CHANCE = [
        ["common", 0.82],
        ["uncommon", 0.1],
        ["rare", 0.05],
        ["epic", 0.02],
        ["legend", 0.01],
    ];
    var PET_EQUIP_LOOP_COUNT = { common: 2, uncommon: 3, rare: 4, epic: 5, legend: 6 };
    var PET_EQUIP_RARITY_MULT = { common: 1, uncommon: 1.38, rare: 1.85, epic: 2.45, legend: 3.2 };

    var PET_EQUIP_TYPE_DROP_WEIGHT = [
        ["attack", 0.24],
        ["defense", 0.24],
        ["stamina", 0.24],
        ["universal", 0.28],
    ];

    var PET_EQUIP_NAME_PREFIX = [
        "玄", "赤", "青", "紫", "金", "银", "霜", "焰", "雷", "风", "云", "星", "月", "幽", "苍", "墨", "璃", "霄", "渊", "曜",
    ];
    var PET_EQUIP_NAME_CORE = {
        horn: ["锐角", "战角", "灵角", "破角", "煞角"],
        collar: ["灵环", "项环", "缚环", "玄环", "契环"],
        scale: ["灵鳞", "护鳞", "玄鳞", "龙鳞", "罡鳞"],
    };

    var STAT_ZH = {
        hp: "气血",
        atk: "力道",
        def: "护体",
        atkSpd: "身法",
        vamp: "吸血",
        critRate: "会心",
        critDmg: "暴伤",
    };

    var SLOT_STAT_BIAS = {
        horn: ["atk", "critRate", "critDmg", "atk", "critRate"],
        collar: ["atkSpd", "vamp", "atkSpd", "critRate", "vamp"],
        scale: ["hp", "def", "hp", "def", "hp"],
    };

    var ALL_STATS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

    /** 身法/吸血/会心/暴伤相对气血/力道/护体 ×0.01（1/100） */
    var PET_EQUIP_WEAK_STAT_MUL = 0.01;
    var PET_EQUIP_WEAK_STAT_SET = { atkSpd: 1, vamp: 1, critRate: 1, critDmg: 1 };

    function applyPetEquipStatKeyMult(statKey, val) {
        if (PET_EQUIP_WEAK_STAT_SET[statKey]) {
            return Math.round(val * PET_EQUIP_WEAK_STAT_MUL * 100) / 100;
        }
        return val;
    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function showDtPeqOverlayModal(innerHtml, bindFn) {
        if (typeof defaultModalElement === "undefined" || !defaultModalElement) return false;
        defaultModalElement.style.display = "flex";
        defaultModalElement.style.zIndex = "12070";
        defaultModalElement.classList.add("modal-container--market-preview");
        defaultModalElement.innerHTML = innerHtml;
        if (typeof bindFn === "function") bindFn();
        return true;
    }

    function hideDtPeqOverlayModal() {
        if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
        defaultModalElement.style.display = "none";
        defaultModalElement.style.zIndex = "";
        defaultModalElement.classList.remove("modal-container--market-preview");
        defaultModalElement.innerHTML = "";
    }

    /** 类型特征：类型池含全主属性（均权），强项加成/弱项削减体现差异 */
    var PET_EQUIP_TYPE_PROFILE = {
        attack: {
            rollBias: ["atk", "critDmg", "hp", "def"],
            rollFromTypePct: 0.5,
            boost: { atk: 1.85, critDmg: 1.78 },
            damp: { hp: 0.42, def: 0.42 },
        },
        defense: {
            rollBias: ["def", "atk", "hp"],
            rollFromTypePct: 0.5,
            boost: { def: 1.92 },
            damp: { atk: 0.42, critDmg: 0.42, hp: 0.68 },
        },
        stamina: {
            rollBias: ["hp", "atk", "def"],
            rollFromTypePct: 0.5,
            boost: { hp: 1.92 },
            damp: { atk: 0.42, critDmg: 0.42, def: 0.68 },
        },
    };

    /** 境界档：每跨 10 级大境界，气血/力道/护体复合 × 本值 */
    var PET_EQUIP_LEVEL_TIER_MUL = 1.3;

    function getPetEquipLevelTierMul(lvl) {
        var n = Math.max(1, Math.floor(Number(lvl) || 1));
        var tier = Math.floor((n - 1) / 10);
        if (tier < 0) tier = 0;
        var base =
            typeof PET_EQUIP_LEVEL_TIER_MUL === "number" && isFinite(PET_EQUIP_LEVEL_TIER_MUL) && PET_EQUIP_LEVEL_TIER_MUL > 0
                ? PET_EQUIP_LEVEL_TIER_MUL
                : 1.3;
        return Math.pow(base, tier);
    }

    /** 单次词条机缘%上限（等级主导，品质与境界档叠乘） */
    function getPetEquipStatBasePerRoll(lvl, rarity) {
        lvl = Math.max(1, Math.floor(Number(lvl) || 1));
        var rMul = PET_EQUIP_RARITY_MULT[rarity] || 1;
        var tierMul = getPetEquipLevelTierMul(lvl);
        var lvlPart = lvl * 0.22 + Math.pow(lvl / 10, 1.25) * 0.75;
        return Math.max(0.35, lvlPart * rMul * tierMul);
    }

    /** 获得词条时：相对上限 1%–100%，分档概率 */
    var PET_EQUIP_STAT_CAP_BUCKETS = [
        { minPct: 0.01, maxPct: 0.2, weight: 0.8 },
        { minPct: 0.21, maxPct: 0.4, weight: 0.12 },
        { minPct: 0.41, maxPct: 0.6, weight: 0.05 },
        { minPct: 0.61, maxPct: 0.8, weight: 0.02 },
        { minPct: 0.81, maxPct: 1.0, weight: 0.01 },
    ];

    function rollPetEquipStatPctOfCap() {
        var r = Math.random();
        var acc = 0;
        for (var bi = 0; bi < PET_EQUIP_STAT_CAP_BUCKETS.length; bi++) {
            var bucket = PET_EQUIP_STAT_CAP_BUCKETS[bi];
            acc += bucket.weight;
            if (r < acc) {
                return bucket.minPct + Math.random() * (bucket.maxPct - bucket.minPct);
            }
        }
        var last = PET_EQUIP_STAT_CAP_BUCKETS[PET_EQUIP_STAT_CAP_BUCKETS.length - 1];
        return last.minPct + Math.random() * (last.maxPct - last.minPct);
    }

    function rollPetEquipStatValue(capMax) {
        capMax = Math.max(0.01, Number(capMax) || 0.01);
        var pct = rollPetEquipStatPctOfCap();
        var val = capMax * pct;
        var floorVal = capMax * 0.01;
        if (val < floorVal) val = floorVal;
        return Math.round(val * 100) / 100;
    }

    function computePetEquipValue(item) {
        if (!item) return 1;
        var lvl = Math.max(1, Math.floor(Number(item.lvl) || 1));
        var rIdx = PET_EQUIP_RARITY_ORDER.indexOf(item.rarity);
        if (rIdx < 0) rIdx = 0;
        var rMul = [1, 2.2, 5, 12, 32][rIdx] || 1;
        var tierMul = getPetEquipLevelTierMul(lvl);
        var statSum = 0;
        for (var si = 0; si < ALL_STATS.length; si++) {
            statSum += Number(item.stats && item.stats[ALL_STATS[si]]) || 0;
        }
        return Math.max(1, Math.floor(lvl * 8 * rMul * tierMul + statSum * 10));
    }

    function ensurePetEquipAutoSellSettings() {
        if (typeof player === "undefined" || !player) return;
        if (player.petEquipAutoBatchSell === undefined) player.petEquipAutoBatchSell = false;
        if (player.petEquipAutoBatchSellRarity === undefined || player.petEquipAutoBatchSellRarity === null) {
            player.petEquipAutoBatchSellRarity = "common";
        }
        if (player.petEquipAutoBatchSellLvlMin === undefined || player.petEquipAutoBatchSellLvlMin === null) {
            player.petEquipAutoBatchSellLvlMin = "";
        }
        if (player.petEquipAutoBatchSellLvlMax === undefined || player.petEquipAutoBatchSellLvlMax === null) {
            player.petEquipAutoBatchSellLvlMax = "";
        }
        if (typeof player.petEquipAutoBatchSellLvlMin !== "string") player.petEquipAutoBatchSellLvlMin = "";
        if (typeof player.petEquipAutoBatchSellLvlMax !== "string") player.petEquipAutoBatchSellLvlMax = "";
        var allowed = { common: 1, uncommon: 1, rare: 1, epic: 1, legend: 1, all: 1 };
        if (!allowed[player.petEquipAutoBatchSellRarity]) player.petEquipAutoBatchSellRarity = "common";
    }

    function parsePetEquipLvlBound(v) {
        if (v === "" || v === null || v === undefined) return null;
        var n = Number(v);
        if (!isFinite(n) || n < 1) return null;
        return Math.min(9999, Math.floor(n));
    }

    function getPetEquipAutoSellLvlBounds() {
        ensurePetEquipAutoSellSettings();
        var a = parsePetEquipLvlBound(player.petEquipAutoBatchSellLvlMin);
        var b = parsePetEquipLvlBound(player.petEquipAutoBatchSellLvlMax);
        if (a != null && b != null && a > b) {
            var t = a;
            a = b;
            b = t;
        }
        return { min: a, max: b };
    }

    function getPetEquipRarityTierIndex(rarity) {
        var i = PET_EQUIP_RARITY_ORDER.indexOf(rarity);
        return i < 0 ? 0 : i;
    }

    function passesPetEquipLvlRange(lvl, minBound, maxBound) {
        if (minBound != null && lvl < minBound) return false;
        if (maxBound != null && lvl > maxBound) return false;
        return true;
    }

    function sellPetEquipItemsByFilter(rarityCapKey, lvlBounds, opts) {
        opts = opts || {};
        ensurePlayerPetEquipmentBag();
        ensurePetEquipAutoSellSettings();
        var capKey = rarityCapKey || player.petEquipAutoBatchSellRarity || "common";
        var bounds = lvlBounds || getPetEquipAutoSellLvlBounds();
        var capIdx = capKey === "all" ? PET_EQUIP_RARITY_ORDER.length : getPetEquipRarityTierIndex(capKey);
        var sold = 0;
        var goldGain = 0;
        var bag = player.petEquipmentBag;
        for (var i = bag.length - 1; i >= 0; i--) {
            var it = bag[i];
            if (!it || it.equippedOn) continue;
            if (it.locked === true || it.locked === 1 || it.locked === "1") continue;
            normalizePetEquipItem(it);
            var lv = Math.max(1, Math.floor(Number(it.lvl) || 1));
            if (!passesPetEquipLvlRange(lv, bounds.min, bounds.max)) continue;
            if (capKey !== "all" && getPetEquipRarityTierIndex(it.rarity) > capIdx) continue;
            var val = typeof it.value === "number" && isFinite(it.value) ? it.value : computePetEquipValue(it);
            goldGain += typeof applyGoldGainMult === "function" ? applyGoldGainMult(val) : val;
            bag.splice(i, 1);
            sold++;
        }
        if (sold > 0) {
            player.gold = (typeof player.gold === "number" ? player.gold : 0) + goldGain;
            persistPetEquipChange();
            if (typeof playerLoadStats === "function") playerLoadStats();
            if (!opts.skipToast && typeof addDungeonLog === "function") {
                addDungeonLog("法器典让 " + sold + " 件，得灵石 <strong>" + goldGain + "</strong>。");
            }
        }
        return { sold: sold, gold: goldGain };
    }

    function maybeAutoBatchSellPetEquipAfterLoot() {
        ensurePetEquipAutoSellSettings();
        if (!player.petEquipAutoBatchSell) return;
        sellPetEquipItemsByFilter(player.petEquipAutoBatchSellRarity, getPetEquipAutoSellLvlBounds(), { skipToast: true });
    }

    function togglePetEquipLock(itemId) {
        var item = getPetEquipmentById(itemId);
        if (!item) return false;
        if (item.equippedOn) return false;
        item.locked = !(item.locked === true || item.locked === 1 || item.locked === "1");
        persistPetEquipChange();
        return true;
    }

    function sellOnePetEquip(itemId) {
        var item = getPetEquipmentById(itemId);
        if (!item) return { ok: false, message: "法器不存在。" };
        if (item.equippedOn) return { ok: false, message: "请先卸下再典让。" };
        if (item.locked === true || item.locked === 1 || item.locked === "1") {
            return { ok: false, message: "已锁定，无法典让。" };
        }
        normalizePetEquipItem(item);
        var val = typeof item.value === "number" && isFinite(item.value) ? item.value : computePetEquipValue(item);
        var payout = typeof applyGoldGainMult === "function" ? applyGoldGainMult(val) : val;
        var bag = player.petEquipmentBag;
        for (var i = 0; i < bag.length; i++) {
            if (bag[i] && bag[i].id === itemId) {
                bag.splice(i, 1);
                break;
            }
        }
        player.gold = (typeof player.gold === "number" ? player.gold : 0) + payout;
        persistPetEquipChange();
        if (typeof playerLoadStats === "function") playerLoadStats();
        return { ok: true, gold: payout, message: "典让得灵石 " + payout + "。" };
    }

    function newPetEquipId() {
        return "peq_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e9);
    }

    function ensurePlayerPetEquipmentBag() {
        if (typeof player === "undefined" || !player) return;
        if (!Array.isArray(player.petEquipmentBag)) player.petEquipmentBag = [];
        migratePetEquipStatsV3();
        migratePetEquipStatsV4();
        migratePetEquipStatsV5();
        migratePetEquipStatsV6();
        migratePetEquipStatsV7();
        migratePetEquipStatsV8();
        migratePetEquipStatsV9();
        migratePetEquipStatsV10();
        migratePetEquipStatsV11();
        for (var ni = 0; ni < player.petEquipmentBag.length; ni++) {
            if (player.petEquipmentBag[ni]) normalizePetEquipItem(player.petEquipmentBag[ni]);
        }
        if (player.petEquipmentBag.length > PET_EQUIP_MAX_BAG) {
            player.petEquipmentBag = player.petEquipmentBag.slice(0, PET_EQUIP_MAX_BAG);
        }
    }

    function syncPetEquipmentEquippedFlags() {
        if (typeof player === "undefined" || !player) return;
        ensurePlayerPetEquipmentBag();
        var bag = player.petEquipmentBag;
        for (var i = 0; i < bag.length; i++) {
            if (bag[i]) bag[i].equippedOn = null;
        }
        if (!Array.isArray(player.petCollection)) return;
        for (var p = 0; p < player.petCollection.length; p++) {
            var pet = player.petCollection[p];
            if (!pet) continue;
            ensurePetEquipmentSlots(pet);
            for (var s = 0; s < PET_EQUIP_SLOTS.length; s++) {
                var slot = PET_EQUIP_SLOTS[s];
                var itemId = pet.equipment[slot];
                if (!itemId) continue;
                var item = getPetEquipmentById(itemId);
                if (item) item.equippedOn = pet.id;
            }
        }
    }

    function ensurePetEquipmentSlots(pet) {
        if (!pet) return;
        if (!pet.equipment || typeof pet.equipment !== "object") {
            pet.equipment = { horn: null, collar: null, scale: null };
        }
        for (var i = 0; i < PET_EQUIP_SLOTS.length; i++) {
            var sk = PET_EQUIP_SLOTS[i];
            if (pet.equipment[sk] != null && typeof pet.equipment[sk] !== "string") {
                pet.equipment[sk] = null;
            }
        }
    }

    function normalizePetEquipItem(item) {
        if (!item) return item;
        if (item.equippedOn != null && typeof item.equippedOn !== "string") item.equippedOn = null;
        item.locked = item.locked === true || item.locked === 1 || item.locked === "1";
        if (typeof item.value !== "number" || !isFinite(item.value) || item.value < 1) {
            item.value = computePetEquipValue(item);
        }
        return item;
    }

    function getPetEquipmentById(id) {
        if (!id || typeof player === "undefined" || !player || !Array.isArray(player.petEquipmentBag)) return null;
        var bag = player.petEquipmentBag;
        for (var i = 0; i < bag.length; i++) {
            if (bag[i] && bag[i].id === id) return normalizePetEquipItem(bag[i]);
        }
        return null;
    }

    function findPetEquipOwnerPetId(itemId) {
        var item = getPetEquipmentById(itemId);
        return item && item.equippedOn ? item.equippedOn : null;
    }

    function getUnequippedPetEquipmentBag() {
        ensurePlayerPetEquipmentBag();
        return player.petEquipmentBag.filter(function (it) {
            return it && !it.equippedOn;
        });
    }

    function rollWeighted(pairs) {
        var r = Math.random();
        var cum = 0;
        for (var i = 0; i < pairs.length; i++) {
            cum += pairs[i][1];
            if (r <= cum) return pairs[i][0];
        }
        return pairs[pairs.length - 1][0];
    }

    function getPetEquipDropFloor() {
        if (typeof getPetDropFloorForRoll === "function") return getPetDropFloorForRoll();
        if (typeof dungeon !== "undefined" && dungeon && dungeon.progress && typeof dungeon.progress.floor === "number") {
            return Math.max(1, Math.floor(dungeon.progress.floor));
        }
        return 1;
    }

    function rollPetEquipLevel(floor) {
        floor = Math.max(1, Math.floor(Number(floor) || 1));
        var cap = floor * PET_EQUIP_MAX_LVL_PER_FLOOR;
        var gap =
            typeof dungeon !== "undefined" && dungeon && dungeon.settings && typeof dungeon.settings.enemyLvlGap === "number"
                ? dungeon.settings.enemyLvlGap
                : 5;
        var base =
            typeof dungeon !== "undefined" && dungeon && dungeon.settings && typeof dungeon.settings.enemyBaseLvl === "number"
                ? dungeon.settings.enemyBaseLvl
                : 1;
        var maxLvl = floor * gap + (base - 1);
        var minLvl = maxLvl - (gap - 1);
        var effMax = Math.min(maxLvl, cap);
        var effMin = Math.min(minLvl, effMax);
        if (effMin >= effMax) return effMax;
        return Math.floor(effMin + Math.random() * (effMax - effMin + 1));
    }

    function pickPetEquipName(slot, petType) {
        var cores = PET_EQUIP_NAME_CORE[slot] || ["法器"];
        var core = cores[Math.floor(Math.random() * cores.length)];
        var pre = PET_EQUIP_NAME_PREFIX[Math.floor(Math.random() * PET_EQUIP_NAME_PREFIX.length)];
        if (petType === "universal") return pre + core;
        var typeChar = petType === "attack" ? "杀" : petType === "defense" ? "守" : "生";
        return pre + typeChar + core;
    }

    function getPetEquipTypeStatMul(petType, statKey) {
        if (petType === "universal") return 1;
        var profile = PET_EQUIP_TYPE_PROFILE[petType];
        if (!profile) return 1;
        if (profile.boost && profile.boost[statKey]) return profile.boost[statKey];
        if (profile.damp && profile.damp[statKey]) return profile.damp[statKey];
        return 1;
    }

    function pickPetEquipStatKey(slot, petType) {
        var bias = SLOT_STAT_BIAS[slot] || ALL_STATS;
        if (petType !== "universal") {
            var profile = PET_EQUIP_TYPE_PROFILE[petType];
            if (profile && Math.random() < (profile.rollFromTypePct || 0.5)) {
                var tb = profile.rollBias && profile.rollBias.length ? profile.rollBias : bias;
                return tb[Math.floor(Math.random() * tb.length)];
            }
        }
        return bias[Math.floor(Math.random() * bias.length)];
    }

    function rollPetEquipStats(slot, petType, rarity, lvl) {
        var stats = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        var loops = PET_EQUIP_LOOP_COUNT[rarity] || 2;
        var capMax = getPetEquipStatBasePerRoll(lvl, rarity);
        for (var i = 0; i < loops; i++) {
            var statKey = pickPetEquipStatKey(slot, petType);
            if (ALL_STATS.indexOf(statKey) < 0) statKey = "hp";
            var val = rollPetEquipStatValue(capMax) * getPetEquipTypeStatMul(petType, statKey);
            val = applyPetEquipStatKeyMult(statKey, val);
            stats[statKey] = Math.round((stats[statKey] + val) * 100) / 100;
        }
        return stats;
    }

    function migratePetEquipStatsV3() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV3) return;
        player.__dongtianPetEquipStatV3 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 3) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 3;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV4() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV4) return;
        player.__dongtianPetEquipStatV4 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 4) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 4;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV5() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV5) return;
        player.__dongtianPetEquipStatV5 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 5) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 5;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV6() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV6) return;
        player.__dongtianPetEquipStatV6 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 6) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 6;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV7() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV7) return;
        player.__dongtianPetEquipStatV7 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 7) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 7;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV8() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV8) return;
        player.__dongtianPetEquipStatV8 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 8) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 8;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV9() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV9) return;
        player.__dongtianPetEquipStatV9 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 9) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 9;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV10() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV10) return;
        player.__dongtianPetEquipStatV10 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 10) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 10;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function migratePetEquipStatsV11() {
        if (typeof player === "undefined" || !player || player.__dongtianPetEquipStatV11) return;
        player.__dongtianPetEquipStatV11 = 1;
        if (!Array.isArray(player.petEquipmentBag)) return;
        var changed = false;
        for (var i = 0; i < player.petEquipmentBag.length; i++) {
            var it = player.petEquipmentBag[i];
            if (!it || it.statGenVersion >= 11) continue;
            it.stats = rollPetEquipStats(it.slot || "horn", it.petType || "universal", it.rarity || "common", it.lvl || 1);
            it.statGenVersion = 11;
            it.value = computePetEquipValue(it);
            changed = true;
        }
        if (changed && typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
        }
    }

    function createDroppedPetEquipment(floorOpt) {
        var floor = typeof floorOpt === "number" && floorOpt >= 1 ? Math.floor(floorOpt) : getPetEquipDropFloor();
        var slot = PET_EQUIP_SLOTS[Math.floor(Math.random() * PET_EQUIP_SLOTS.length)];
        var petType = rollWeighted(PET_EQUIP_TYPE_DROP_WEIGHT);
        var rarity = rollWeighted(PET_EQUIP_RARITY_CHANCE);
        var lvl = rollPetEquipLevel(floor);
        return {
            id: newPetEquipId(),
            slot: slot,
            petType: petType,
            rarity: rarity,
            lvl: lvl,
            dropFloor: floor,
            name: pickPetEquipName(slot, petType),
            stats: rollPetEquipStats(slot, petType, rarity, lvl),
            locked: false,
            equippedOn: null,
            value: 0,
            statGenVersion: 11,
        };
    }

    function finalizeCreatedPetEquip(item) {
        if (!item) return item;
        item.value = computePetEquipValue(item);
        return item;
    }

    function canPetWearEquipment(pet, item) {
        if (!pet || !item) return { ok: false, reason: "无效对象。" };
        if (typeof normalizePetObject === "function") normalizePetObject(pet);
        if (PET_EQUIP_SLOTS.indexOf(item.slot) < 0) return { ok: false, reason: "部位无效。" };
        if (item.petType !== "universal" && pet.type !== item.petType) {
            return {
                ok: false,
                reason:
                    "类型不符：该法器为「" +
                    (PET_EQUIP_TYPE_ZH[item.petType] || item.petType) +
                    "」，此兽为「" +
                    (typeof PET_TYPE_LABEL_ZH !== "undefined" && PET_TYPE_LABEL_ZH[pet.type]
                        ? PET_TYPE_LABEL_ZH[pet.type]
                        : pet.type) +
                    "」。",
            };
        }
        var petLvl = Math.max(1, Math.floor(Number(pet.lvl) || 1));
        var reqLvl = Math.max(1, Math.floor(Number(item.lvl) || 1));
        if (petLvl < reqLvl) {
            var realm =
                typeof cultivationRealmLabel === "function"
                    ? cultivationRealmLabel(reqLvl)
                    : "Lv." + reqLvl;
            return { ok: false, reason: "境界不足：需灵宠达 " + realm + " 方可佩戴。" };
        }
        return { ok: true };
    }

    function persistPetEquipChange() {
        if (typeof savePlayerInventoryMutation === "function") savePlayerInventoryMutation();
        else if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
        else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
    }

    function getPetByIdLocal(id) {
        if (typeof getPetById === "function") return getPetById(id);
        if (!player || !Array.isArray(player.petCollection)) return null;
        for (var i = 0; i < player.petCollection.length; i++) {
            if (player.petCollection[i] && player.petCollection[i].id === id) return player.petCollection[i];
        }
        return null;
    }

    function equipPetItem(petId, itemId) {
        ensurePlayerPetEquipmentBag();
        var pet = getPetByIdLocal(petId);
        var item = getPetEquipmentById(itemId);
        if (!pet || !item) return { ok: false, message: "灵宠或法器不存在。" };
        ensurePetEquipmentSlots(pet);
        var check = canPetWearEquipment(pet, item);
        if (!check.ok) return { ok: false, message: check.reason };

        var ownerId = findPetEquipOwnerPetId(itemId);
        if (ownerId && ownerId !== petId) {
            return { ok: false, message: "此法器已被其他灵宠佩戴。" };
        }

        var slot = item.slot;
        var prevId = pet.equipment[slot];
        if (prevId === itemId) return { ok: true, message: "已佩戴。" };

        if (prevId) {
            var prevItem = getPetEquipmentById(prevId);
            if (prevItem) prevItem.equippedOn = null;
            pet.equipment[slot] = null;
        }

        item.equippedOn = petId;
        pet.equipment[slot] = itemId;

        persistPetEquipChange();
        if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
        return { ok: true, message: "佩戴成功。" };
    }

    function unequipPetItem(petId, slot) {
        ensurePlayerPetEquipmentBag();
        var pet = getPetByIdLocal(petId);
        if (!pet) return { ok: false, message: "灵宠不存在。" };
        ensurePetEquipmentSlots(pet);
        if (PET_EQUIP_SLOTS.indexOf(slot) < 0) return { ok: false, message: "部位无效。" };
        var itemId = pet.equipment[slot];
        if (!itemId) return { ok: false, message: "该部位未佩戴法器。" };
        var item = getPetEquipmentById(itemId);
        pet.equipment[slot] = null;
        if (item) item.equippedOn = null;
        persistPetEquipChange();
        if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
        return { ok: true, message: "已卸下。" };
    }

    function returnAllPetEquipmentToBag(pet) {
        if (!pet) return;
        ensurePlayerPetEquipmentBag();
        ensurePetEquipmentSlots(pet);
        for (var i = 0; i < PET_EQUIP_SLOTS.length; i++) {
            var slot = PET_EQUIP_SLOTS[i];
            var itemId = pet.equipment[slot];
            if (!itemId) continue;
            var item = getPetEquipmentById(itemId);
            pet.equipment[slot] = null;
            if (item) item.equippedOn = null;
        }
    }

    function getPetEquipmentBonusStats(pet) {
        var out = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        if (!pet) return out;
        ensurePetEquipmentSlots(pet);
        for (var i = 0; i < PET_EQUIP_SLOTS.length; i++) {
            var itemId = pet.equipment[PET_EQUIP_SLOTS[i]];
            if (!itemId) continue;
            var item = getPetEquipmentById(itemId);
            if (!item || !item.stats) continue;
            for (var k = 0; k < ALL_STATS.length; k++) {
                var sk = ALL_STATS[k];
                out[sk] += Number(item.stats[sk]) || 0;
            }
        }
        var sbrMul =
            typeof window.getDongtianSpiritBeastRealmPetEquipBonusMultiplier === "function"
                ? window.getDongtianSpiritBeastRealmPetEquipBonusMultiplier()
                : 1;
        if (sbrMul > 1 && isFinite(sbrMul)) {
            for (var j = 0; j < ALL_STATS.length; j++) {
                var sk2 = ALL_STATS[j];
                if (out[sk2]) out[sk2] *= sbrMul;
            }
        }
        return out;
    }

    function formatPetEquipStatsHtml(stats, signPrefix) {
        signPrefix = signPrefix || "+";
        var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        var parts = [];
        for (var i = 0; i < ALL_STATS.length; i++) {
            var k = ALL_STATS[i];
            var v = stats && typeof stats[k] === "number" ? stats[k] : 0;
            if (Math.abs(v) < 0.005) continue;
            parts.push(
                '<span class="dt-peq-stat-chip">' +
                    STAT_ZH[k] +
                    " " +
                    signPrefix +
                    v.toFixed(2).replace(rx, "$1") +
                    "%</span>"
            );
        }
        return parts.length ? parts.join("") : '<span class="dt-peq-stat-chip dt-peq-stat-chip--muted">无机缘词条</span>';
    }

    function tryRollPetEquipmentDrop(context) {
        try {
            if (typeof window.isDongtianTowerCombatSession === "function" && window.isDongtianTowerCombatSession()) {
                return false;
            }
        } catch (eTower) {}
        ensurePlayerPetEquipmentBag();
        if (Math.random() >= PET_EQUIP_DROP_CHANCE) return false;
        if (player.petEquipmentBag.length >= PET_EQUIP_MAX_BAG) {
            var fullMsg = "一缕兽纹法器自妖骸中浮起，你却行囊已满——灵光散入劫雾。";
            if (context === "combat" && typeof addCombatLog === "function") addCombatLog(fullMsg);
            else if (context === "dungeon" && typeof addDungeonLog === "function") addDungeonLog(fullMsg);
            return false;
        }
        var floor = getPetEquipDropFloor();
        var item = finalizeCreatedPetEquip(createDroppedPetEquipment(floor));
        player.petEquipmentBag.push(item);
        maybeAutoBatchSellPetEquipAfterLoot();
        persistPetEquipChange();
        if (typeof calculateStats === "function") calculateStats();
        var rClass = PET_EQUIP_RARITY_CLASS[item.rarity] || "Common";
        var dropMsg =
            '<span class="' +
            rClass +
            '">兽纹显化！</span>得灵宠法器「<span class="' +
            rClass +
            '">' +
            escHtml(item.name) +
            "</span>」（" +
            PET_EQUIP_SLOT_ZH[item.slot] +
            " · " +
            PET_EQUIP_TYPE_ZH[item.petType] +
            " · " +
            PET_EQUIP_RARITY_ZH[item.rarity] +
            " · " +
            (typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(item.lvl) : "Lv." + item.lvl) +
            "）。";
        if (context === "combat" && typeof addCombatLog === "function") addCombatLog(dropMsg);
        else if (context === "dungeon" && typeof addDungeonLog === "function") addDungeonLog(dropMsg);
        if (typeof playerLoadStats === "function") playerLoadStats();
        return true;
    }

    var modalPetId = null;

    function renderPetEquipSlot(pet, slot) {
        var itemId = pet.equipment[slot];
        var item = itemId ? getPetEquipmentById(itemId) : null;
        var slotZh = PET_EQUIP_SLOT_ZH[slot];
        var icon = PET_EQUIP_SLOT_ICON[slot];
        if (!item) {
            return (
                '<button type="button" class="dt-peq-slot dt-peq-slot--empty" data-slot="' +
                slot +
                '" title="' +
                escHtml(slotZh) +
                '">' +
                '<span class="dt-peq-slot__halo"></span>' +
                '<i class="fas ' +
                icon +
                ' dt-peq-slot__icon"></i>' +
                '<span class="dt-peq-slot__lbl">' +
                escHtml(slotZh) +
                "</span>" +
                '<span class="dt-peq-slot__hint">虚位以待</span></button>'
            );
        }
        var rClass = PET_EQUIP_RARITY_CLASS[item.rarity] || "Common";
        return (
            '<button type="button" class="dt-peq-slot dt-peq-slot--filled dt-peq-slot--' +
            item.rarity +
            '" data-slot="' +
            slot +
            '" data-item-id="' +
            escHtml(item.id) +
            '" title="点击卸下">' +
            '<span class="dt-peq-slot__halo" aria-hidden="true"></span>' +
            '<span class="dt-peq-slot__shine" aria-hidden="true"></span>' +
            '<span class="dt-peq-slot__rim" aria-hidden="true"></span>' +
            '<span class="dt-peq-slot__sparks" aria-hidden="true"></span>' +
            '<i class="fas ' +
            icon +
            " dt-peq-slot__icon " +
            rClass +
            '"></i>' +
            '<span class="dt-peq-slot__lbl ' +
            rClass +
            '">' +
            escHtml(item.name) +
            "</span>" +
            '<span class="dt-peq-slot__meta">' +
            escHtml(PET_EQUIP_RARITY_ZH[item.rarity]) +
            " · " +
            escHtml(PET_EQUIP_TYPE_ZH[item.petType]) +
            "</span>" +
            '<span class="dt-peq-slot__lvl">' +
            (typeof cultivationRealmLabel === "function" ? escHtml(cultivationRealmLabel(item.lvl)) : "Lv." + item.lvl) +
            "</span>" +
            '<span class="dt-peq-slot__stats">' +
            formatPetEquipStatsHtml(item.stats) +
            "</span></button>"
        );
    }

    function renderPetEquipBagItem(pet, item) {
        normalizePetEquipItem(item);
        var check = canPetWearEquipment(pet, item);
        var rClass = PET_EQUIP_RARITY_CLASS[item.rarity] || "Common";
        var disabled = !check.ok;
        var isLocked = item.locked === true || item.locked === 1 || item.locked === "1";
        return (
            '<div class="dt-peq-bag-item dt-peq-bag-item--' +
            item.rarity +
            (disabled ? " dt-peq-bag-item--disabled" : "") +
            (isLocked ? " dt-peq-bag-item--locked" : "") +
            '" data-item-id="' +
            escHtml(item.id) +
            '">' +
            '<button type="button" class="dt-peq-bag-item__main' +
            (disabled ? " dt-peq-bag-item__main--disabled" : "") +
            '" data-item-id="' +
            escHtml(item.id) +
            '"' +
            (disabled ? ' title="' + escHtml(check.reason) + '"' : "") +
            ">" +
            '<span class="dt-peq-bag-item__glow" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__shine" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__rim" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__sparks" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__slot">' +
            escHtml(PET_EQUIP_SLOT_ZH[item.slot]) +
            (isLocked ? ' · <i class="fas fa-lock" title="已锁定"></i>' : "") +
            "</span>" +
            '<span class="dt-peq-bag-item__name ' +
            rClass +
            '">' +
            escHtml(item.name) +
            "</span>" +
            '<span class="dt-peq-bag-item__tags">' +
            '<span class="dt-peq-tag">' +
            escHtml(PET_EQUIP_TYPE_ZH[item.petType]) +
            "</span>" +
            '<span class="dt-peq-tag ' +
            rClass +
            '">' +
            escHtml(PET_EQUIP_RARITY_ZH[item.rarity]) +
            "</span>" +
            "</span>" +
            '<span class="dt-peq-bag-item__lvl">' +
            (typeof cultivationRealmLabel === "function" ? escHtml(cultivationRealmLabel(item.lvl)) : "Lv." + item.lvl) +
            " · 典让 " +
            (typeof item.value === "number" ? item.value : computePetEquipValue(item)) +
            "</span>" +
            '<span class="dt-peq-bag-item__stats">' +
            formatPetEquipStatsHtml(item.stats) +
            "</span>" +
            (disabled ? '<span class="dt-peq-bag-item__warn">' + escHtml(check.reason) + "</span>" : "") +
            "</button>" +
            '<div class="dt-peq-bag-item__acts">' +
            '<button type="button" class="btn btn--xs btn--ghost dt-peq-act-market" data-item-id="' +
            escHtml(item.id) +
            '"' +
            (isLocked ? ' disabled title="已锁定"' : "") +
            ">上架</button>" +
            '<button type="button" class="btn btn--xs btn--ghost dt-peq-act-gift" data-item-id="' +
            escHtml(item.id) +
            '"' +
            (isLocked ? ' disabled title="已锁定"' : "") +
            ">赠送</button>" +
            '<button type="button" class="btn btn--xs btn--ghost dt-peq-act-sell" data-item-id="' +
            escHtml(item.id) +
            '"' +
            (isLocked ? ' disabled title="已锁定"' : "") +
            ">典让</button>" +
            '<button type="button" class="btn btn--xs btn--ghost dt-peq-act-lock" data-item-id="' +
            escHtml(item.id) +
            '">' +
            (isLocked ? "解锁" : "锁定") +
            "</button></div></div>"
        );
    }

    function renderPetEquipModal(petId) {
        modalPetId = petId;
        var body = document.getElementById("dongtianPetEquipBody");
        if (!body) return;
        ensurePlayerPetEquipmentBag();
        ensurePetEquipAutoSellSettings();
        var pet = getPetByIdLocal(petId);
        if (!pet) {
            body.innerHTML = '<p class="dt-peq-empty">未找到灵宠。</p>';
            return;
        }
        if (typeof normalizePetObject === "function") normalizePetObject(pet);
        ensurePetEquipmentSlots(pet);

        var bag = getUnequippedPetEquipmentBag().slice();
        bag.sort(function (a, b) {
            var ri =
                PET_EQUIP_RARITY_ORDER.indexOf(b.rarity) - PET_EQUIP_RARITY_ORDER.indexOf(a.rarity);
            if (ri !== 0) return ri;
            return (b.lvl || 0) - (a.lvl || 0);
        });

        var eqBonus = getPetEquipmentBonusStats(pet);
        var petTypeLabel =
            typeof PET_TYPE_LABEL_ZH !== "undefined" && PET_TYPE_LABEL_ZH[pet.type]
                ? PET_TYPE_LABEL_ZH[pet.type]
                : pet.type;
        var realmLine =
            typeof cultivationRealmLabel === "function" ? cultivationRealmLabel(pet.lvl) : "Lv." + pet.lvl;

        var bagHtml = bag.length
            ? bag.map(function (it) {
                  return renderPetEquipBagItem(pet, it);
              }).join("")
            : '<p class="dt-peq-empty">行囊空空——秘境斩妖时有几率得灵宠法器。</p>';

        body.innerHTML =
            '<div class="dt-peq-ui">' +
            '<div class="dt-peq-hero">' +
            '<div class="dt-peq-hero__mist"></div>' +
            '<div class="dt-peq-hero__seal">器</div>' +
            "</div>" +
            '<header class="dt-peq-head">' +
            '<p class="dt-peq-head__pet">' +
            escHtml(pet.name) +
            " · " +
            escHtml(petTypeLabel) +
            " · " +
            escHtml(realmLine) +
            "</p>" +
            '<p class="dt-peq-head__rule">攻击/防御/体力型法器仅同类灵宠可佩；<strong>通用型</strong>皆可。境界须达法器等级；第 <strong>L</strong> 层掉落等级上限 <strong>L×5</strong>。</p>' +
            "</header>" +
            '<div class="dt-peq-layout">' +
            '<section class="dt-peq-wear-col">' +
            '<h4 class="dt-peq-section-title">三才位</h4>' +
            '<div class="dt-peq-slots">' +
            renderPetEquipSlot(pet, "horn") +
            renderPetEquipSlot(pet, "collar") +
            renderPetEquipSlot(pet, "scale") +
            "</div>" +
            '<div class="dt-peq-total">' +
            '<h5 class="dt-peq-total__title">法器机缘合计</h5>' +
            '<div class="dt-peq-total__stats">' +
            formatPetEquipStatsHtml(eqBonus) +
            "</div>" +
            '<p class="dt-peq-total__note">并入该灵宠机缘；仅<strong>出战</strong>时计入人物面板。</p>' +
            "</div></section>" +
            '<section class="dt-peq-bag-col">' +
            '<h4 class="dt-peq-section-title">法器行囊 <span class="dt-peq-bag-count">(' +
            bag.length +
            " 待佩 · 共 " +
            player.petEquipmentBag.length +
            "/" +
            PET_EQUIP_MAX_BAG +
            ")</span></h4>" +
            '<div class="dt-peq-toolbar">' +
            '<label class="dt-peq-auto"><input type="checkbox" id="dtPeqAutoSell"' +
            (player.petEquipAutoBatchSell ? " checked" : "") +
            ' /> 自动典让</label>' +
            '<select id="dtPeqAutoSellRarity" class="dt-peq-select" aria-label="典让品质">' +
            '<option value="common"' +
            (player.petEquipAutoBatchSellRarity === "common" ? " selected" : "") +
            ">凡品及以下</option>" +
            '<option value="uncommon"' +
            (player.petEquipAutoBatchSellRarity === "uncommon" ? " selected" : "") +
            ">灵品及以下</option>" +
            '<option value="rare"' +
            (player.petEquipAutoBatchSellRarity === "rare" ? " selected" : "") +
            ">宝品及以下</option>" +
            '<option value="epic"' +
            (player.petEquipAutoBatchSellRarity === "epic" ? " selected" : "") +
            ">仙品及以下</option>" +
            '<option value="legend"' +
            (player.petEquipAutoBatchSellRarity === "legend" ? " selected" : "") +
            ">神品及以下</option>" +
            '<option value="all"' +
            (player.petEquipAutoBatchSellRarity === "all" ? " selected" : "") +
            ">全部品质</option>" +
            "</select>" +
            '<span class="dt-peq-lvl-range">' +
            '<input type="number" id="dtPeqAutoSellLvlMin" class="dt-peq-lvl-inp" min="1" max="9999" placeholder="最低" value="' +
            escHtml(player.petEquipAutoBatchSellLvlMin || "") +
            '" />' +
            '<span>–</span>' +
            '<input type="number" id="dtPeqAutoSellLvlMax" class="dt-peq-lvl-inp" min="1" max="9999" placeholder="最高" value="' +
            escHtml(player.petEquipAutoBatchSellLvlMax || "") +
            '" />' +
            "</span>" +
            '<button type="button" class="btn btn--xs btn--ghost" id="dtPeqBatchSellBtn">批量典让</button>' +
            "</div>" +
            '<div class="dt-peq-bag-scroll">' +
            bagHtml +
            "</div></section></div></div>";

        function bindPeqToolbar() {
            var autoChk = body.querySelector("#dtPeqAutoSell");
            var rSel = body.querySelector("#dtPeqAutoSellRarity");
            var mn = body.querySelector("#dtPeqAutoSellLvlMin");
            var mx = body.querySelector("#dtPeqAutoSellLvlMax");
            var batchBtn = body.querySelector("#dtPeqBatchSellBtn");
            function saveAutoSettings() {
                ensurePetEquipAutoSellSettings();
                player.petEquipAutoBatchSell = !!(autoChk && autoChk.checked);
                if (rSel) player.petEquipAutoBatchSellRarity = rSel.value || "common";
                if (mn) player.petEquipAutoBatchSellLvlMin = mn.value === "" ? "" : String(mn.value);
                if (mx) player.petEquipAutoBatchSellLvlMax = mx.value === "" ? "" : String(mx.value);
                persistPetEquipChange();
            }
            if (autoChk) autoChk.onchange = saveAutoSettings;
            if (rSel) rSel.onchange = saveAutoSettings;
            if (mn) mn.onchange = saveAutoSettings;
            if (mx) mx.onchange = saveAutoSettings;
            if (batchBtn) {
                batchBtn.onclick = function () {
                    saveAutoSettings();
                    var res = sellPetEquipItemsByFilter(player.petEquipAutoBatchSellRarity, getPetEquipAutoSellLvlBounds());
                    if (res.sold < 1) {
                        showDtPeqOverlayModal(
                            '<div class="content"><p>没有符合筛选条件的法器可典让（已锁定或未佩者除外）。</p><div class="button-container"><button type="button" id="dt-peq-toast-ok">知晓</button></div></div>',
                            function () {
                                var ok0 = document.getElementById("dt-peq-toast-ok");
                                if (ok0) ok0.onclick = hideDtPeqOverlayModal;
                            }
                        );
                    }
                    renderPetEquipModal(modalPetId);
                };
            }
        }
        bindPeqToolbar();

        body.querySelectorAll(".dt-peq-bag-item__main:not(.dt-peq-bag-item__main--disabled)").forEach(function (btn) {
            btn.onclick = function (ev) {
                ev.stopPropagation();
                var iid = btn.getAttribute("data-item-id");
                if (!iid || !modalPetId) return;
                var res = equipPetItem(modalPetId, iid);
                if (!res.ok && res.message) {
                    showDtPeqOverlayModal(
                        '<div class="content"><p>' +
                            escHtml(res.message) +
                            '</p><div class="button-container"><button type="button" id="dt-peq-toast-ok">知晓</button></div></div>',
                        function () {
                            var ok = document.getElementById("dt-peq-toast-ok");
                            if (ok) ok.onclick = hideDtPeqOverlayModal;
                        }
                    );
                }
                renderPetEquipModal(modalPetId);
                if (typeof renderPetPanel === "function") renderPetPanel();
            };
        });

        body.querySelectorAll(".dt-peq-act-market").forEach(function (btn) {
            btn.onclick = function (ev) {
                ev.stopPropagation();
                var iid = btn.getAttribute("data-item-id");
                if (iid && typeof window.dongtianMarketOpenSellPetEquip === "function") {
                    window.dongtianMarketOpenSellPetEquip(iid);
                }
            };
        });
        body.querySelectorAll(".dt-peq-act-gift").forEach(function (btn) {
            btn.onclick = function (ev) {
                ev.stopPropagation();
                var iid = btn.getAttribute("data-item-id");
                if (iid && typeof window.dongtianMarketOpenGiftPetEquip === "function") {
                    window.dongtianMarketOpenGiftPetEquip(iid);
                }
            };
        });
        body.querySelectorAll(".dt-peq-act-sell").forEach(function (btn) {
            btn.onclick = function (ev) {
                ev.stopPropagation();
                var iid = btn.getAttribute("data-item-id");
                if (!iid) return;
                var item = getPetEquipmentById(iid);
                if (!item) return;
                if (
                    !showDtPeqOverlayModal(
                        '<div class="content"><p>典让「' +
                            escHtml(item.name) +
                            "」？得灵石 <strong>" +
                            (typeof item.value === "number" ? item.value : computePetEquipValue(item)) +
                            '</strong></p><div class="button-container"><button type="button" id="dt-peq-sell-yes">典让</button><button type="button" id="dt-peq-sell-no">作罢</button></div></div>',
                        function () {
                            var yesBtn = document.getElementById("dt-peq-sell-yes");
                            var noBtn = document.getElementById("dt-peq-sell-no");
                            if (yesBtn) {
                                yesBtn.onclick = function () {
                                    hideDtPeqOverlayModal();
                                    sellOnePetEquip(iid);
                                    renderPetEquipModal(modalPetId);
                                };
                            }
                            if (noBtn) noBtn.onclick = hideDtPeqOverlayModal;
                        }
                    )
                ) {
                    sellOnePetEquip(iid);
                    renderPetEquipModal(modalPetId);
                }
            };
        });
        body.querySelectorAll(".dt-peq-act-lock").forEach(function (btn) {
            btn.onclick = function (ev) {
                ev.stopPropagation();
                var iid = btn.getAttribute("data-item-id");
                if (iid) {
                    togglePetEquipLock(iid);
                    renderPetEquipModal(modalPetId);
                }
            };
        });

        body.querySelectorAll(".dt-peq-slot--filled").forEach(function (btn) {
            btn.onclick = function () {
                var slot = btn.getAttribute("data-slot");
                if (!slot || !modalPetId) return;
                unequipPetItem(modalPetId, slot);
                renderPetEquipModal(modalPetId);
                if (typeof renderPetPanel === "function") renderPetPanel();
            };
        });
    }

    window.openDongtianPetEquipModal = function (petId) {
        var modal = document.getElementById("dongtianPetEquipModal");
        if (!modal) return;
        renderPetEquipModal(petId);
        modal.style.display = "flex";
    };

    window.closeDongtianPetEquipModal = function () {
        var modal = document.getElementById("dongtianPetEquipModal");
        if (modal) modal.style.display = "none";
        modalPetId = null;
    };

    window.refreshDongtianPetEquipModalIfOpen = function () {
        var modal = document.getElementById("dongtianPetEquipModal");
        if (modal && modal.style.display === "flex" && modalPetId) {
            renderPetEquipModal(modalPetId);
        }
    };

    window.showMarketPetEquipPreview = function (pe) {
        if (!pe || typeof defaultModalElement === "undefined" || !defaultModalElement) return;
        normalizePetEquipItem(pe);
        var rClass = PET_EQUIP_RARITY_CLASS[pe.rarity] || "Common";
        var statsHtml = formatPetEquipStatsHtml(pe.stats || {});
        dungeon.status.exploring = false;
        defaultModalElement.style.display = "flex";
        defaultModalElement.style.zIndex = "12070";
        defaultModalElement.classList.add("modal-container--market-preview");
        defaultModalElement.innerHTML =
            '<div class="content xiu-mat-preview dt-peq-preview-wrap">' +
            '<p class="xiu-market-preview-hint">挂单预览 · 灵宠法器</p>' +
            '<div class="dt-peq-preview-card dt-peq-preview-card--' +
            (pe.rarity || "common") +
            '">' +
            '<span class="dt-peq-bag-item__glow" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__shine" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__rim" aria-hidden="true"></span>' +
            '<span class="dt-peq-bag-item__sparks" aria-hidden="true"></span>' +
            '<div class="dt-peq-preview-card__body">' +
            '<h4 class="dt-peq-bag-item__name ' +
            rClass +
            '">' +
            escHtml(pe.name || "灵宠法器") +
            "</h4>" +
            '<p class="dt-peq-preview-card__meta">' +
            escHtml(PET_EQUIP_SLOT_ZH[pe.slot] || pe.slot) +
            " · " +
            escHtml(PET_EQUIP_TYPE_ZH[pe.petType] || pe.petType) +
            " · " +
            escHtml(PET_EQUIP_RARITY_ZH[pe.rarity] || pe.rarity) +
            " · " +
            (typeof cultivationRealmLabel === "function" ? escHtml(cultivationRealmLabel(pe.lvl)) : "Lv." + pe.lvl) +
            "</p>" +
            '<div class="dt-peq-bag-item__stats dt-peq-preview-card__stats">' +
            statsHtml +
            "</div></div></div>" +
            '<div class="button-container"><button type="button" id="close-market-peq-preview">关闭</button></div></div>';
        var btn = document.getElementById("close-market-peq-preview");
        if (btn) {
            btn.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.style.zIndex = "";
                defaultModalElement.classList.remove("modal-container--market-preview");
                defaultModalElement.innerHTML = "";
                if (typeof continueExploring === "function") continueExploring();
            };
        }
    };

    window.initDongtianPetEquipUI = function () {
        var closeBtn = document.getElementById("dongtianPetEquipCloseBtn");
        if (closeBtn && !closeBtn._dtPeqBound) {
            closeBtn._dtPeqBound = true;
            closeBtn.onclick = window.closeDongtianPetEquipModal;
        }
    };

    window.ensurePlayerPetEquipmentBag = ensurePlayerPetEquipmentBag;
    window.ensurePetEquipmentSlots = ensurePetEquipmentSlots;
    window.getPetEquipmentById = getPetEquipmentById;
    window.getPetEquipmentBonusStats = getPetEquipmentBonusStats;
    window.canPetWearEquipment = canPetWearEquipment;
    window.equipPetItem = equipPetItem;
    window.unequipPetItem = unequipPetItem;
    window.returnAllPetEquipmentToBag = returnAllPetEquipmentToBag;
    window.tryRollPetEquipmentDrop = tryRollPetEquipmentDrop;
    window.syncPetEquipmentEquippedFlags = syncPetEquipmentEquippedFlags;
    window.PET_EQUIP_DROP_CHANCE = PET_EQUIP_DROP_CHANCE;
    window.PET_EQUIP_SLOT_ZH = PET_EQUIP_SLOT_ZH;
    window.PET_EQUIP_RARITY_ZH = PET_EQUIP_RARITY_ZH;
    window.PET_EQUIP_TYPE_ZH = PET_EQUIP_TYPE_ZH;
    window.PET_EQUIP_MAX_BAG = PET_EQUIP_MAX_BAG;
    window.sellPetEquipItemsByFilter = sellPetEquipItemsByFilter;
    window.maybeAutoBatchSellPetEquipAfterLoot = maybeAutoBatchSellPetEquipAfterLoot;
})();
