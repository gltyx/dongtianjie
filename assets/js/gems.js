
const MATERIAL_GEM_PACK = "gem_material_pack";
const MATERIAL_GEM_PACK_ZH = "宝石材料包";
const MATERIAL_SOCKET_OPENER = "socket_opener";
const MATERIAL_SOCKET_OPENER_ZH = "开孔器";
const MATERIAL_TALENT_FRUIT = "talent_fruit";
const MATERIAL_TALENT_FRUIT_ZH = "天赋果";

const GEM_BASE_BONUS_PCT_BY_LEVEL = {
    1: 1,
    2: 4,
    3: 9,
    4: 16,
    5: 25,
    6: 36,
    7: 59,
    8: 78,
    9: 100,
    10: 125,
    11: 195,
    12: 236
};

const GEM_KINDS = ["hp", "atk", "def", "atkSpd", "critDmg"];
const GEM_KIND_ZH = {
    hp: "气血",
    atk: "力道",
    def: "护体",
    atkSpd: "身法",
    critDmg: "暴伤"
};

const GEM_KIND_ROLL_POOL = ["hp", "atk", "def", "atkSpd", "critDmg"];

function ensureGemMaterialsInInventory() {
    if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
    if (!player || !player.inventory) return;
    if (typeof player.inventory.materials[MATERIAL_GEM_PACK] !== "number" || isNaN(player.inventory.materials[MATERIAL_GEM_PACK])) {
        player.inventory.materials[MATERIAL_GEM_PACK] = 0;
    }
    if (typeof player.inventory.materials[MATERIAL_SOCKET_OPENER] !== "number" || isNaN(player.inventory.materials[MATERIAL_SOCKET_OPENER])) {
        player.inventory.materials[MATERIAL_SOCKET_OPENER] = 0;
    }
    if (typeof player.inventory.materials[MATERIAL_TALENT_FRUIT] !== "number" || isNaN(player.inventory.materials[MATERIAL_TALENT_FRUIT])) {
        player.inventory.materials[MATERIAL_TALENT_FRUIT] = 0;
    }
}

function ensurePlayerGemStacks() {
    if (!player || !player.inventory) return;
    if (!player.inventory.gems || typeof player.inventory.gems !== "object") {
        player.inventory.gems = {};
    }
    for (var i = 0; i < GEM_KINDS.length; i++) {
        var k = GEM_KINDS[i];
        if (!player.inventory.gems[k] || typeof player.inventory.gems[k] !== "object") {
            player.inventory.gems[k] = {};
        }
    }
}

function getGemStackCount(kind, level) {
    ensurePlayerGemStacks();
    kind = String(kind);
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    var m = player.inventory.gems[kind];
    if (!m) return 0;
    var n = m[level];
    return typeof n === "number" && !isNaN(n) ? Math.max(0, Math.floor(n)) : 0;
}

function addGemStack(kind, level, qty) {
    ensurePlayerGemStacks();
    qty = Math.floor(Number(qty) || 0);
    if (!qty) return 0;
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return 0;
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    var m = player.inventory.gems[kind];
    var cur = getGemStackCount(kind, level);
    m[level] = Math.max(0, cur + qty);
    return qty;
}

function consumeGemStack(kind, level, qty) {
    var cur = getGemStackCount(kind, level);
    qty = Math.min(cur, Math.max(0, Math.floor(Number(qty) || 0)));
    if (!qty) return false;
    player.inventory.gems[kind][level] = cur - qty;
    return true;
}

function getGemEffectiveBonusPct(kind, level) {
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    var base = GEM_BASE_BONUS_PCT_BY_LEVEL[level];
    if (typeof base !== "number" || !isFinite(base)) return 0;
    if (kind === "atkSpd") return base / 3;
    if (kind === "critDmg") return base * 2;
    return base;
}

function normalizeEquipmentGemFields(item) {
    if (!item || typeof item !== "object") return;
    var sc = typeof item.socketCount === "number" ? Math.max(0, Math.min(3, Math.floor(item.socketCount))) : 0;
    item.socketCount = sc;
    if (!Array.isArray(item.gemSlots)) item.gemSlots = [];
    while (item.gemSlots.length < sc) item.gemSlots.push(null);
    if (item.gemSlots.length > sc) item.gemSlots = item.gemSlots.slice(0, sc);
    for (var i = 0; i < item.gemSlots.length; i++) {
        var g = item.gemSlots[i];
        if (!g || typeof g !== "object") {
            item.gemSlots[i] = null;
            continue;
        }
        var kk = String(g.kind || "");
        var lv = Math.max(1, Math.min(12, Math.floor(Number(g.level) || 1)));
        if (GEM_KINDS.indexOf(kk) < 0) item.gemSlots[i] = null;
        else item.gemSlots[i] = { kind: kk, level: lv };
    }
}

function applyEquippedGemsToStats() {
    if (!player || !Array.isArray(player.equipped)) return;
    var hpB = Number(player.baseStats && player.baseStats.hp) || 500;
    var atkB = Number(player.baseStats && player.baseStats.atk) || 100;
    var defB = Number(player.baseStats && player.baseStats.def) || 50;
    for (var i = 0; i < player.equipped.length; i++) {
        var item = player.equipped[i];
        if (!item || !Array.isArray(item.gemSlots)) continue;
        normalizeEquipmentGemFields(item);
        for (var s = 0; s < item.gemSlots.length; s++) {
            var g = item.gemSlots[s];
            if (!g || !g.kind) continue;
            var pct = getGemEffectiveBonusPct(g.kind, g.level);
            if (!pct) continue;
            if (g.kind === "hp") {
                player.equippedStats.hp += Math.round((hpB * pct) / 100);
            } else if (g.kind === "atk") {
                player.equippedStats.atk += Math.round((atkB * pct) / 100);
            } else if (g.kind === "def") {
                player.equippedStats.def += Math.round((defB * pct) / 100);
            } else if (g.kind === "atkSpd") {
                player.equippedStats.atkSpd += pct;
            } else if (g.kind === "critDmg") {
                player.equippedStats.critDmg += pct;
            }
        }
    }
}

function tryUseSocketOpenerOnItem(item) {
    ensureGemMaterialsInInventory();
    normalizeEquipmentGemFields(item);
    if (item.socketCount >= 3) return { ok: false, message: "此器已开至三孔，天机难再扩。" };
    var n = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_SOCKET_OPENER) : 0;
    if (n < 1) return { ok: false, message: "开孔器不足。" };
    if (typeof addMaterial === "function") addMaterial(MATERIAL_SOCKET_OPENER, -1);
    item.socketCount = item.socketCount + 1;
    item.gemSlots.push(null);
    return { ok: true, message: "灵纹一绽，器表隐孔已成，可嵌灵石。" };
}

function trySocketGemOnItem(item, slotIndex, kind, level) {
    normalizeEquipmentGemFields(item);
    slotIndex = Math.floor(Number(slotIndex) || 0);
    if (slotIndex < 0 || slotIndex >= item.socketCount) return { ok: false, message: "孔位有误。" };
    if (item.gemSlots[slotIndex]) return { ok: false, message: "此孔已嵌宝石。" };
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return { ok: false, message: "宝石种类无效。" };
    level = Math.max(1, Math.min(12, Math.floor(Number(level) || 1)));
    if (getGemStackCount(kind, level) < 1) return { ok: false, message: "行囊无此宝石。" };
    if (!consumeGemStack(kind, level, 1)) return { ok: false, message: "扣除宝石失败。" };
    item.gemSlots[slotIndex] = { kind: kind, level: level };
    return { ok: true, message: "灵光入窍，宝石已与器脉相合。" };
}

function tryUnsocketGemFromItem(item, slotIndex) {
    normalizeEquipmentGemFields(item);
    slotIndex = Math.floor(Number(slotIndex) || 0);
    if (slotIndex < 0 || slotIndex >= item.gemSlots.length) return { ok: false, message: "孔位有误。" };
    var g = item.gemSlots[slotIndex];
    if (!g) return { ok: false, message: "此孔为空。" };
    addGemStack(g.kind, g.level, 1);
    item.gemSlots[slotIndex] = null;
    return { ok: true, message: "你已取下宝石，收回行囊。" };
}

function tryMergeGemsInInventory(kind, level) {
    ensurePlayerGemStacks();
    kind = String(kind);
    if (GEM_KINDS.indexOf(kind) < 0) return { ok: false, message: "种类无效。" };
    level = Math.max(1, Math.min(11, Math.floor(Number(level) || 1)));
    if (getGemStackCount(kind, level) < 3) return { ok: false, message: "需三枚同级同种宝石方可淬合升阶。" };
    consumeGemStack(kind, level, 3);
    addGemStack(kind, level + 1, 1);
    return { ok: true, message: `三枚${GEM_KIND_ZH[kind] || kind}${level}级宝石淬为一颗${level + 1}级。` };
}

function rollGemPackLoot() {
    var out = [];
    for (var i = 0; i < 3; i++) {
        var k = GEM_KIND_ROLL_POOL[Math.floor(Math.random() * GEM_KIND_ROLL_POOL.length)];
        out.push({ kind: k, level: 1 });
    }
    return out;
}

function tryOpenGemMaterialPack() {
    ensureGemMaterialsInInventory();
    var c = typeof getMaterialCount === "function" ? getMaterialCount(MATERIAL_GEM_PACK) : 0;
    if (c < 1) return { ok: false, message: "没有宝石材料包。" };
    if (typeof addMaterial === "function") addMaterial(MATERIAL_GEM_PACK, -1);
    var loot = rollGemPackLoot();
    var zhParts = [];
    for (var i = 0; i < loot.length; i++) {
        addGemStack(loot[i].kind, loot[i].level, 1);
        zhParts.push(GEM_KIND_ZH[loot[i].kind] + "宝石 1级");
    }
    return { ok: true, message: "封禁一开，灵砂凝形：获得 " + zhParts.join("、") + "。" };
}

function formatEquipmentGemSlotsHtml(item) {
    normalizeEquipmentGemFields(item);
    var lines = [];
    lines.push("<p class=\"eq-meta-gems\">灵窍：<strong>" + item.socketCount + "/3</strong> 已开</p>");
    if (item.socketCount === 0) {
        lines.push("<p class=\"eq-meta-gems eq-meta-gems--muted\">未开孔位，需开孔器启窍后方可镶嵌。</p>");
    }
    for (var i = 0; i < item.socketCount; i++) {
        var g = item.gemSlots[i];
        if (g) {
            var p = getGemEffectiveBonusPct(g.kind, g.level);
            lines.push(
                "<p class=\"eq-meta-gems\">窍 " +
                    (i + 1) +
                    "：<span class=\"Rare\">" +
                    (GEM_KIND_ZH[g.kind] || g.kind) +
                    "宝石 " +
                    g.level +
                    "级</span>（效 +" +
                    (Math.round(p * 100) / 100).toString().replace(/\.?0+$/, "") +
                    "%）</p>"
            );
        } else {
            lines.push("<p class=\"eq-meta-gems eq-meta-gems--muted\">窍 " + (i + 1) + "：空</p>");
        }
    }
    return lines.join("");
}

function tryRollSocketOpenerFromEliteKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof enemy === "undefined" || !enemy) return;
    var qt = typeof enemy.qualityTier === "number" ? enemy.qualityTier : 0;
    if (qt < 6) return;
    if (Math.random() >= 0.1) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_SOCKET_OPENER, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`妖躯残烬中，你拾得<span class="Legendary">${MATERIAL_SOCKET_OPENER_ZH}</span> ×1。`);
    }
}

function tryRollTalentFruitFromEliteKill() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    if (typeof enemy === "undefined" || !enemy) return;
    var qt = typeof enemy.qualityTier === "number" ? enemy.qualityTier : 0;
    if (qt < 6) return;
    if (Math.random() >= 0.1) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_TALENT_FRUIT, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`妖躯余韵未散，你拾得<span class="Legendary">${MATERIAL_TALENT_FRUIT_ZH}</span> ×1。`);
    }
}

function grantSocketOpenerDungeonGuardian() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_SOCKET_OPENER, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`镇守伏诛，殿前遗落<span class="Legendary">${MATERIAL_SOCKET_OPENER_ZH}</span> ×1。`);
    }
}

function grantTalentFruitDungeonGuardian() {
    if (typeof escort !== "undefined" && escort && escort.active) return;
    ensureGemMaterialsInInventory();
    if (typeof addMaterial === "function") addMaterial(MATERIAL_TALENT_FRUIT, 1);
    if (typeof addCombatLog === "function") {
        addCombatLog(`镇守伏诛，殿前遗落<span class="Legendary">${MATERIAL_TALENT_FRUIT_ZH}</span> ×1。`);
    }
}

/** 镶嵌选择：弹出层列出当前行囊中的宝石堆叠 */
function openGemInlayChooser(slotIndex, onChosen) {
    slotIndex = Math.floor(Number(slotIndex) || 0);
    ensurePlayerGemStacks();
    var choices = [];
    for (var ki = 0; ki < GEM_KINDS.length; ki++) {
        var k = GEM_KINDS[ki];
        for (var lv = 1; lv <= 12; lv++) {
            var c = getGemStackCount(k, lv);
            if (c > 0) {
                choices.push({ kind: k, level: lv, count: c });
            }
        }
    }
    if (!choices.length) {
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>行囊暂无可用宝石。</p><div class="button-container"><button type="button" id="gem-inlay-empty-ok">知晓</button></div></div>';
            var ok = document.querySelector("#gem-inlay-empty-ok");
            if (ok) {
                ok.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
        }
        return;
    }
    var btns = choices
        .map(function (ch, idx) {
            var zh = GEM_KIND_ZH[ch.kind] || ch.kind;
            return (
                '<button type="button" class="btn btn--sm btn--ghost gem-inlay-pick" data-idx="' +
                idx +
                '">' +
                zh +
                " " +
                ch.level +
                "级 ×" +
                ch.count +
                "</button>"
            );
        })
        .join("");
    if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML =
            '<div class="content"><p>选择嵌入窍 ' +
            (slotIndex + 1) +
            ' 的宝石</p><div class="button-container" style="flex-wrap:wrap;justify-content:flex-start;gap:0.4rem">' +
            btns +
            '</div><div class="button-container"><button type="button" id="gem-inlay-cancel">作罢</button></div></div>';
        var cancel = document.querySelector("#gem-inlay-cancel");
        if (cancel) {
            cancel.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
            };
        }
        var picks = document.querySelectorAll(".gem-inlay-pick");
        for (var i = 0; i < picks.length; i++) {
            picks[i].onclick = function () {
                var ix = Math.floor(Number(this.getAttribute("data-idx")) || 0);
                var ch = choices[ix];
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                if (ch && typeof onChosen === "function") onChosen(ch.kind, ch.level);
            };
        }
    }
}
