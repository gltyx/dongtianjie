/**
 * 洞天劫 · 称号：按历史最高秘境层数、湮灭诸敌累计击杀、登龙塔/魔神塔/神界/灵兽界/幽魂界通关、历史出师人数解锁，永久叠加机缘加成；
 * 动效图置于 assets/chenhao/，优先匹配与称号同名的文件（如 锋芒毕露.gif），其次英文 id（如 mfbl.gif）。
 * 未展示称号或勾选「不显动效」时斗法显示占位图：无图.gif / 无图.webp / 无图.png
 */
var DONGTIAN_TITLE_DEFS = [
    { id: "mfbl", name: "锋芒毕露", needFloor: 3, needKills: 0, effectText: "气血 +20%", bonus: { hp: 20 } },
    { id: "ymww", name: "扬名立万", needFloor: 6, needKills: 0, effectText: "力道 +30%", bonus: { atk: 30 } },
    { id: "wzsh", name: "威震四海", needFloor: 10, needKills: 0, effectText: "护体 +40%", bonus: { def: 40 } },
    { id: "fyrw", name: "风云人物", needFloor: 16, needKills: 0, effectText: "身法 +50%", bonus: { atkSpd: 50 } },
    { id: "jdgs", name: "绝顶高手", needFloor: 23, needKills: 0, effectText: "吸血 +30%", bonus: { vamp: 30 } },
    { id: "ytds", name: "倚天大师", needFloor: 30, needKills: 0, effectText: "暴伤 +100%", bonus: { critDmg: 100 } },
    { id: "tlzs", name: "屠龙战神", needFloor: 0, needKills: 10000, effectText: "力道 +30%", bonus: { atk: 30 } },
    { id: "ydzs", name: "一代宗师", needFloor: 0, needKills: 100000, effectText: "力道 +50%", bonus: { atk: 50 } },
    { id: "dgqb", name: "独孤求败", needFloor: 0, needKills: 500000, effectText: "力道 +80%", bonus: { atk: 80 } },
    { id: "bmyx", name: "北冥游仙", needFloor: 0, needKills: 1000000, effectText: "力道 +100%", bonus: { atk: 100 } },
    { id: "ahts", name: "暗黑探索者", needDragonFloor: 31, effectText: "力道 +20%", bonus: { atk: 20 } },
    { id: "sxtl", name: "嗜血屠戮者", needDragonFloor: 71, effectText: "力道 +30%", bonus: { atk: 30 } },
    { id: "swzj", name: "死亡终结者", needDragonFloor: 131, effectText: "力道 +40%", bonus: { atk: 40 } },
    { id: "fnpx", name: "愤怒咆哮者", needDragonFloor: 181, effectText: "力道 +60%", bonus: { atk: 60 } },
    { id: "kgps", name: "恐惧破碎者", needDragonFloor: 251, effectText: "力道 +100%", bonus: { atk: 100 } },
    { id: "dlhm", name: "堕落毁灭者", needDragonFloor: 301, effectText: "力道 +150%", bonus: { atk: 150 } },
    { id: "ybsw", name: "银白守卫者", needDemonFloor: 2, effectText: "气血 +30%", bonus: { hp: 30 } },
    { id: "zzty", name: "战争统御者", needDemonFloor: 6, effectText: "气血 +30%", bonus: { hp: 30 } },
    { id: "zysp", name: "正义审判者", needDemonFloor: 10, effectText: "气血 +40%", bonus: { hp: 40 } },
    { id: "wqzf", name: "无情征服者", needDemonFloor: 15, effectText: "气血 +50%", bonus: { hp: 50 } },
    { id: "ttnz", name: "泰坦追逐者", needDemonFloor: 20, effectText: "气血 +80%", bonus: { hp: 80 } },
    { id: "yhbx", name: "永恒不朽者", needDemonFloor: 25, effectText: "气血 +100%", bonus: { hp: 100 } },
    { id: "zssj", name: "震慑世界者", needDemonFloor: 30, effectText: "气血 +150%", bonus: { hp: 150 } },
    { id: "srwtfd", name: "世人笑我太疯癫", needDivineRealmFloor: 3, effectText: "气血 +50%", bonus: { hp: 50 } },
    { id: "jxxbltt", name: "剑下血泊浪滔天", needDivineRealmFloor: 10, effectText: "气血 +100%", bonus: { hp: 100 } },
    { id: "ydhtwsq", name: "一刀横天万世秋", needDivineRealmFloor: 20, effectText: "气血 +150%", bonus: { hp: 150 } },
    { id: "wwwswy", name: "我为亡时无忧", needDivineRealmFloor: 30, effectText: "气血 +200%", bonus: { hp: 200 } },
    { id: "fbdwwzcm", name: "佛不渡我我自成魔", needDivineRealmFloor: 50, effectText: "气血 +250%", bonus: { hp: 250 } },
    { id: "xjdj", name: "星界缔造者", needShituGrads: 10, effectText: "气血、力道、护体各 +150%", bonus: { hp: 150, atk: 150, def: 150 } },
    { id: "sjbw", name: "神界保卫者", needShituGrads: 30, effectText: "气血、力道、护体各 +300%", bonus: { hp: 300, atk: 300, def: 300 } },
    { id: "dfzj", name: "登峰造极", needSpiritBeastRealmFloor: 5, effectText: "力道 +50%", bonus: { atk: 50 } },
    { id: "dbyf", name: "独霸一方", needSpiritBeastRealmFloor: 15, effectText: "力道 +100%", bonus: { atk: 100 } },
    { id: "txws", name: "天下无双", needSpiritBeastRealmFloor: 25, effectText: "力道 +200%", bonus: { atk: 200 } },
    { id: "wwdz", name: "唯我独尊", needSpiritBeastRealmFloor: 35, effectText: "力道 +300%", bonus: { atk: 300 } },
    { id: "yycj", name: "一念初见", needGhostRealmFloor: 10, effectText: "护体 +50%", bonus: { def: 50 } },
    { id: "jckx", name: "旧城空巷", needGhostRealmFloor: 20, effectText: "护体 +100%", bonus: { def: 100 } },
    { id: "jsrh", name: "江山如画", needGhostRealmFloor: 40, effectText: "护体 +200%", bonus: { def: 200 } },
    { id: "kbzl", name: "狂暴之力", needGhostRealmFloor: 80, effectText: "护体 +300%", bonus: { def: 300 } }
];

function dongtianTitleNeedDragonFloor(def) {
    return Math.max(0, Math.floor(Number(def && def.needDragonFloor) || 0));
}
function dongtianTitleNeedDemonFloor(def) {
    return Math.max(0, Math.floor(Number(def && def.needDemonFloor) || 0));
}
function dongtianTitleNeedDivineRealmFloor(def) {
    return Math.max(0, Math.floor(Number(def && def.needDivineRealmFloor) || 0));
}
function dongtianTitleNeedShituGrads(def) {
    return Math.max(0, Math.floor(Number(def && def.needShituGrads) || 0));
}
function dongtianTitleNeedSpiritBeastRealmFloor(def) {
    return Math.max(0, Math.floor(Number(def && def.needSpiritBeastRealmFloor) || 0));
}
function dongtianTitleNeedGhostRealmFloor(def) {
    return Math.max(0, Math.floor(Number(def && def.needGhostRealmFloor) || 0));
}

function dongtianTitleRequirementText(def) {
    if (def.needFloor > 0) {
        return "历史最高秘境第 " + def.needFloor + " 层";
    }
    if (def.needKills > 0) {
        return "湮灭诸敌累计 " + (typeof nFormatter === "function" ? nFormatter(def.needKills) : def.needKills) + " 杀";
    }
    var nd = dongtianTitleNeedDragonFloor(def);
    if (nd > 0) {
        return "登龙塔已通关第 " + nd + " 层";
    }
    var nm = dongtianTitleNeedDemonFloor(def);
    if (nm > 0) {
        return "魔神塔已通关第 " + nm + " 层";
    }
    var nv = dongtianTitleNeedDivineRealmFloor(def);
    if (nv > 0) {
        return "神界已通关第 " + nv + " 层";
    }
    var ng = dongtianTitleNeedShituGrads(def);
    if (ng > 0) {
        return "历史出师人数（身为师父）≥ " + ng;
    }
    var nsb = dongtianTitleNeedSpiritBeastRealmFloor(def);
    if (nsb > 0) {
        return "灵兽界已通关第 " + nsb + " 层";
    }
    var ngh = dongtianTitleNeedGhostRealmFloor(def);
    if (ngh > 0) {
        return "幽魂界已通关第 " + ngh + " 层";
    }
    return "—";
}

function dongtianTitleIsUnlocked(def) {
    if (typeof player === "undefined" || !player) return false;
    var maxF = Math.floor(Number(player.maxDungeonFloor) || 1);
    var kills = Math.floor(Number(player.kills) || 0);
    if (def.needFloor > 0) {
        return maxF >= def.needFloor;
    }
    if (def.needKills > 0) {
        return kills >= def.needKills;
    }
    var nd = dongtianTitleNeedDragonFloor(def);
    if (nd > 0) {
        var dragonBest = Math.max(0, Math.floor(Number(player.dongtianDragonTowerBestFloor) || 0));
        return dragonBest >= nd;
    }
    var nm = dongtianTitleNeedDemonFloor(def);
    if (nm > 0) {
        var demonBest = Math.max(0, Math.floor(Number(player.dongtianDemonTowerBestFloor) || 0));
        return demonBest >= nm;
    }
    var nv = dongtianTitleNeedDivineRealmFloor(def);
    if (nv > 0) {
        var divineBest = Math.max(0, Math.floor(Number(player.dongtianDivineRealmBestFloor) || 0));
        return divineBest >= nv;
    }
    var ng = dongtianTitleNeedShituGrads(def);
    if (ng > 0) {
        var grads = Math.max(0, Math.floor(Number(player.shituMasterGradCount) || 0));
        return grads >= ng;
    }
    var nsb = dongtianTitleNeedSpiritBeastRealmFloor(def);
    if (nsb > 0) {
        var spiritBeastBest = Math.max(0, Math.floor(Number(player.dongtianSpiritBeastRealmBestFloor) || 0));
        return spiritBeastBest >= nsb;
    }
    var ngh = dongtianTitleNeedGhostRealmFloor(def);
    if (ngh > 0) {
        var ghostBest = Math.max(0, Math.floor(Number(player.dongtianGhostRealmBestFloor) || 0));
        return ghostBest >= ngh;
    }
    return false;
}

function aggregateTitleBonuses() {
    var out = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    if (typeof player === "undefined" || !player) return out;
    for (var i = 0; i < DONGTIAN_TITLE_DEFS.length; i++) {
        var d = DONGTIAN_TITLE_DEFS[i];
        if (!dongtianTitleIsUnlocked(d)) continue;
        var b = d.bonus;
        for (var k in b) {
            if (typeof out[k] === "number") {
                out[k] += Number(b[k]) || 0;
            }
        }
    }
    return out;
}

function getDongtianTitleDefById(id) {
    if (!id) return null;
    var s = String(id);
    for (var i = 0; i < DONGTIAN_TITLE_DEFS.length; i++) {
        if (DONGTIAN_TITLE_DEFS[i].id === s) return DONGTIAN_TITLE_DEFS[i];
    }
    return null;
}

/** 按展示用中文名匹配（用于快照里的 displayTitleName） */
function getDongtianTitleDefByDisplayName(name) {
    if (!name || !String(name).trim()) return null;
    var s = String(name).trim();
    for (var i = 0; i < DONGTIAN_TITLE_DEFS.length; i++) {
        if (DONGTIAN_TITLE_DEFS[i].name === s) return DONGTIAN_TITLE_DEFS[i];
    }
    return null;
}

function escTitleHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 已解锁中「最高档」一条（列表后者为更高成就），用于斗法默认展示 */
function getHighestUnlockedTitleDef() {
    for (var i = DONGTIAN_TITLE_DEFS.length - 1; i >= 0; i--) {
        if (dongtianTitleIsUnlocked(DONGTIAN_TITLE_DEFS[i])) {
            return DONGTIAN_TITLE_DEFS[i];
        }
    }
    return null;
}

/**
 * 未勾选「不显动效」时：优先玩家指定的 equippedTitleId，否则自动用最高已解锁。
 * 用于斗法条与是否显示「隐藏动效」工具栏。
 */
function getCombatEffectiveDisplayTitleDefIgnoringHidden() {
    if (typeof player === "undefined" || !player) return null;
    var eq = player.equippedTitleId;
    if (eq) {
        var picked = getDongtianTitleDefById(eq);
        if (picked && dongtianTitleIsUnlocked(picked)) {
            return picked;
        }
    }
    return getHighestUnlockedTitleDef();
}

function getCombatEffectiveDisplayTitleDef() {
    if (typeof player === "undefined" || !player) return null;
    if (player.combatTitleFxHidden) return null;
    return getCombatEffectiveDisplayTitleDefIgnoringHidden();
}

var DONGTIAN_CHENHAO_EXTS = ["gif", "webp", "png"];

/**
 * 第 N 次尝试的 URL：先「中文称号名」× 各扩展名，再「英文 id」× 各扩展名（共 6 种）。
 * 文件名含中文时用 encodeURIComponent，避免路径无法匹配。
 */
function dongtianTitleEffectSrc(id, attemptIndex) {
    var def = getDongtianTitleDefById(id);
    if (!def) return null;
    var stems = [def.name, def.id];
    var perStem = DONGTIAN_CHENHAO_EXTS.length;
    var total = stems.length * perStem;
    var ai = typeof attemptIndex === "number" ? attemptIndex : 0;
    if (ai < 0 || ai >= total) return null;
    var stemIdx = Math.floor(ai / perStem);
    var extIdx = ai % perStem;
    var stem = stems[stemIdx];
    var ext = DONGTIAN_CHENHAO_EXTS[extIdx];
    return "./assets/chenhao/" + encodeURIComponent(stem) + "." + ext;
}

/** 占位图：文件名「无图」，扩展名顺序与称号动效一致 */
function dongtianPlaceholderEffectSrc(attemptIndex) {
    var stem = "无图";
    var ai = typeof attemptIndex === "number" ? attemptIndex : 0;
    if (ai < 0 || ai >= DONGTIAN_CHENHAO_EXTS.length) return null;
    var ext = DONGTIAN_CHENHAO_EXTS[ai];
    return "./assets/chenhao/" + encodeURIComponent(stem) + "." + ext;
}

function ensurePlayerTitleFields() {
    if (typeof player === "undefined" || !player) return;
    if (player.equippedTitleId !== undefined && player.equippedTitleId !== null && typeof player.equippedTitleId !== "string") {
        player.equippedTitleId = null;
    }
    var eq = player.equippedTitleId;
    if (eq && !dongtianTitleIsUnlocked(getDongtianTitleDefById(eq))) {
        player.equippedTitleId = null;
    }
    if (player.combatTitleFxHidden !== true) {
        player.combatTitleFxHidden = false;
    }
}

function normalizePlayerEquippedTitle() {
    ensurePlayerTitleFields();
}

var titleModalOpen = false;

function renderTitleModalList() {
    var host = document.getElementById("titleModalList");
    if (!host) return;
    var maxF = typeof player !== "undefined" && player ? Math.floor(Number(player.maxDungeonFloor) || 1) : 1;
    var kills = typeof player !== "undefined" && player ? Math.floor(Number(player.kills) || 0) : 0;
    var dragonBest = typeof player !== "undefined" && player ? Math.max(0, Math.floor(Number(player.dongtianDragonTowerBestFloor) || 0)) : 0;
    var demonBest = typeof player !== "undefined" && player ? Math.max(0, Math.floor(Number(player.dongtianDemonTowerBestFloor) || 0)) : 0;
    var divineBest = typeof player !== "undefined" && player ? Math.max(0, Math.floor(Number(player.dongtianDivineRealmBestFloor) || 0)) : 0;
    var gradCount = typeof player !== "undefined" && player ? Math.max(0, Math.floor(Number(player.shituMasterGradCount) || 0)) : 0;
    var spiritBeastBest = typeof player !== "undefined" && player ? Math.max(0, Math.floor(Number(player.dongtianSpiritBeastRealmBestFloor) || 0)) : 0;
    var ghostBest = typeof player !== "undefined" && player ? Math.max(0, Math.floor(Number(player.dongtianGhostRealmBestFloor) || 0)) : 0;
    var equipped = player && player.equippedTitleId ? String(player.equippedTitleId) : "";
    var effIgnore = player ? getCombatEffectiveDisplayTitleDefIgnoringHidden() : null;
    var toolbar = "";
    if (player && player.combatTitleFxHidden && effIgnore) {
        toolbar =
            '<div class="title-modal__toolbar"><button type="button" class="btn btn--sm btn--primary" id="titleModalRestoreFx">恢复斗法称号展示</button></div>';
    } else if (player && !player.combatTitleFxHidden && effIgnore) {
        toolbar =
            '<div class="title-modal__toolbar"><button type="button" class="btn btn--sm btn--ghost" id="titleModalClearDisplay">不显称号动效（加成仍生效）</button></div>';
    }
    var html = toolbar;
    for (var i = 0; i < DONGTIAN_TITLE_DEFS.length; i++) {
        var d = DONGTIAN_TITLE_DEFS[i];
        var ok = dongtianTitleIsUnlocked(d);
        var rowClass = "title-modal__row" + (ok ? "" : " title-modal__row--locked");
        var status = ok
            ? '<span class="title-modal__status title-modal__status--ok">已获得</span>'
            : '<span class="title-modal__status title-modal__status--no">未解锁</span>';
        var req = dongtianTitleRequirementText(d);
        var prog = "";
        if (!ok && d.needFloor > 0) {
            prog = '<p class="title-modal__prog">当前历史最高层：<b>' + maxF + "</b></p>";
        } else if (!ok && d.needKills > 0) {
            prog = '<p class="title-modal__prog">湮灭诸敌：<b>' + (typeof nFormatter === "function" ? nFormatter(kills) : kills) + "</b> / " + (typeof nFormatter === "function" ? nFormatter(d.needKills) : d.needKills) + "</p>";
        } else if (!ok && dongtianTitleNeedDragonFloor(d) > 0) {
            prog = '<p class="title-modal__prog">登龙塔已通关：<b>' + dragonBest + "</b> / " + dongtianTitleNeedDragonFloor(d) + " 层</p>";
        } else if (!ok && dongtianTitleNeedDemonFloor(d) > 0) {
            prog = '<p class="title-modal__prog">魔神塔已通关：<b>' + demonBest + "</b> / " + dongtianTitleNeedDemonFloor(d) + " 层</p>";
        } else if (!ok && dongtianTitleNeedDivineRealmFloor(d) > 0) {
            prog = '<p class="title-modal__prog">神界已通关：<b>' + divineBest + "</b> / " + dongtianTitleNeedDivineRealmFloor(d) + " 层</p>";
        } else if (!ok && dongtianTitleNeedShituGrads(d) > 0) {
            prog = '<p class="title-modal__prog">历史出师（师父）：<b>' + gradCount + "</b> / " + dongtianTitleNeedShituGrads(d) + "</p>";
        } else if (!ok && dongtianTitleNeedSpiritBeastRealmFloor(d) > 0) {
            prog = '<p class="title-modal__prog">灵兽界已通关：<b>' + spiritBeastBest + "</b> / " + dongtianTitleNeedSpiritBeastRealmFloor(d) + " 层</p>";
        } else if (!ok && dongtianTitleNeedGhostRealmFloor(d) > 0) {
            prog = '<p class="title-modal__prog">幽魂界已通关：<b>' + ghostBest + "</b> / " + dongtianTitleNeedGhostRealmFloor(d) + " 层</p>";
        }
        var btn = "";
        if (ok) {
            var isEq = equipped === d.id || (!equipped && effIgnore && effIgnore.id === d.id);
            btn =
                '<button type="button" class="btn btn--sm ' +
                (isEq ? "btn--ghost" : "btn--primary") +
                ' title-modal__wear" data-title-id="' +
                d.id +
                '">' +
                (isEq ? "展示中" : "指定展示") +
                "</button>";
        }
        var preview =
            '<div class="title-modal__fx" data-title-fx="' +
            d.id +
            '"><img class="title-modal__fx-img" alt="" decoding="async" data-title-img="' +
            d.id +
            '" src="' +
            dongtianTitleEffectSrc(d.id, 0) +
            '" /></div>';
        html +=
            '<div class="' +
            rowClass +
            '" data-title-row="' +
            d.id +
            '">' +
            '<div class="title-modal__main">' +
            "<h4>" +
            d.name +
            "</h4>" +
            "<p class=\"title-modal__req\">解锁：" +
            req +
            "</p>" +
            prog +
            "<p class=\"title-modal__fx-label\">永久效果 · " +
            d.effectText +
            "</p>" +
            "</div>" +
            preview +
            '<div class="title-modal__actions">' +
            status +
            btn +
            "</div>" +
            "</div>";
    }
    host.innerHTML = html;
    host.querySelectorAll(".title-modal__fx-img").forEach(function (img) {
        img.addEventListener("error", function onTitleImgErr() {
            if (img.getAttribute("data-chenhao-placeholder-chain") === "1") {
                var pa = parseInt(img.getAttribute("data-ph-attempt") || "0", 10) + 1;
                var pSrc = dongtianPlaceholderEffectSrc(pa);
                if (pSrc) {
                    img.setAttribute("data-ph-attempt", String(pa));
                    img.src = pSrc;
                } else {
                    img.style.display = "none";
                    var wrapPh = img.parentElement;
                    if (wrapPh && !wrapPh.querySelector(".title-modal__fx-fallback")) {
                        var spPh = document.createElement("span");
                        spPh.className = "title-modal__fx-fallback";
                        spPh.textContent = "动效图";
                        wrapPh.appendChild(spPh);
                    }
                }
                return;
            }
            var tid = img.getAttribute("data-title-img");
            var cur = parseInt(img.getAttribute("data-chenhao-attempt") || "0", 10);
            var next = cur + 1;
            var nextSrc = dongtianTitleEffectSrc(tid, next);
            if (nextSrc) {
                img.setAttribute("data-chenhao-attempt", String(next));
                img.src = nextSrc;
            } else {
                img.setAttribute("data-chenhao-placeholder-chain", "1");
                img.setAttribute("data-ph-attempt", "0");
                img.src = dongtianPlaceholderEffectSrc(0);
            }
        });
    });
    host.querySelectorAll(".title-modal__wear").forEach(function (btnEl) {
        btnEl.addEventListener("click", function () {
            var tid = btnEl.getAttribute("data-title-id");
            if (!tid || typeof player === "undefined" || !player) return;
            player.equippedTitleId = tid;
            player.combatTitleFxHidden = false;
            if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
            else if (typeof saveData === "function") saveData();
            if (typeof applyEquipmentStats === "function") applyEquipmentStats();
            else if (typeof calculateStats === "function") calculateStats();
            if (typeof playerLoadStats === "function") playerLoadStats();
            renderTitleModalList();
        });
    });
    var clr = document.getElementById("titleModalClearDisplay");
    if (clr) {
        clr.onclick = function () {
            if (typeof player === "undefined" || !player) return;
            player.combatTitleFxHidden = true;
            if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
            else if (typeof saveData === "function") saveData();
            if (typeof playerLoadStats === "function") playerLoadStats();
            renderTitleModalList();
        };
    }
    var rst = document.getElementById("titleModalRestoreFx");
    if (rst) {
        rst.onclick = function () {
            if (typeof player === "undefined" || !player) return;
            player.combatTitleFxHidden = false;
            if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
            else if (typeof saveData === "function") saveData();
            if (typeof playerLoadStats === "function") playerLoadStats();
            renderTitleModalList();
        };
    }
}

function openTitleModal() {
    if (typeof player === "undefined" || !player) return;
    ensurePlayerTitleFields();
    try {
        if (typeof closePetModal === "function" && typeof petModalOpen !== "undefined" && petModalOpen) {
            closePetModal();
        }
    } catch (e1) {}
    if (typeof sectPassivesModalOpen !== "undefined" && sectPassivesModalOpen && typeof closeSectPassivesModal === "function") {
        closeSectPassivesModal();
    }

    window.__titleModalReturnExplore = false;
    if (
        typeof dungeon !== "undefined" &&
        dungeon &&
        dungeon.status &&
        !player.inCombat &&
        !inventoryOpen &&
        !dungeon.status.paused
    ) {
        window.__titleModalReturnExplore = true;
        dungeon.status.exploring = false;
    }

    var dim = document.querySelector("#dungeon-main");
    var inv = document.querySelector("#inventory");
    if (player.inCombat && typeof combatPanel !== "undefined" && combatPanel) {
        combatPanel.style.filter = "brightness(50%)";
    } else if (typeof inventoryOpen !== "undefined" && inventoryOpen && inv) {
        inv.style.filter = "brightness(50%)";
    } else if (dim) {
        dim.style.filter = "brightness(50%)";
    }

    var modal = document.getElementById("titleSelectModal");
    if (!modal) return;
    titleModalOpen = true;
    renderTitleModalList();
    modal.style.display = "flex";
}

function closeTitleModal() {
    var modal = document.getElementById("titleSelectModal");
    if (modal) modal.style.display = "none";
    titleModalOpen = false;

    if (window.__titleModalReturnExplore && typeof dungeon !== "undefined" && dungeon && dungeon.status) {
        dungeon.status.exploring = true;
    }
    window.__titleModalReturnExplore = false;

    if (typeof combatPanel !== "undefined" && combatPanel) {
        combatPanel.style.filter = "brightness(100%)";
    }
    var inv = document.querySelector("#inventory");
    if (inv && typeof inventoryOpen !== "undefined" && inventoryOpen) {
        inv.style.filter = "brightness(100%)";
    }
    var dim = document.querySelector("#dungeon-main");
    if (dim && !inventoryOpen && !player.inCombat) {
        dim.style.filter = "brightness(100%)";
    }
}

function combatTitleFxSlotKey(def) {
    if (!def || def.id == null) return "__none__";
    return String(def.id);
}

function combatTitleFxMarkImgReady(row) {
    if (!row) return;
    row.classList.add("combat-title-fx--img-ready");
}

function combatTitleFxBindEffectImg(row, img, nm) {
    if (!img) return;
    var onReady = function () {
        combatTitleFxMarkImgReady(row);
    };
    if (img.complete && img.naturalWidth > 0) {
        onReady();
    } else {
        img.addEventListener("load", onReady, { once: true });
    }
    img.addEventListener("error", function tryNext() {
        row.classList.remove("combat-title-fx--img-ready");
        var tid = img.getAttribute("data-tid");
        var cur = parseInt(img.getAttribute("data-chenhao-attempt") || "0", 10);
        var next = cur + 1;
        var nextSrc = dongtianTitleEffectSrc(tid, next);
        if (nextSrc) {
            img.setAttribute("data-chenhao-attempt", String(next));
            img.src = nextSrc;
        } else {
            img.remove();
            row.classList.remove("combat-title-fx--img-ready");
            if (nm) {
                nm.classList.add("combat-title-fx__name--solo");
            }
        }
    });
}

function refreshCombatTitleFxInto(row, def) {
    if (!row) return;
    if (!def) {
        row._titleFxSlotKey = "__placeholder__";
        row.classList.remove("combat-title-fx--img-ready");
        row.classList.add("combat-title-fx--active");
        row.classList.add("combat-title-fx--placeholder");
        row.innerHTML =
            '<div class="combat-title-fx__stage">' +
            '<img class="combat-title-fx__img combat-title-fx__img--placeholder" alt="" decoding="async" src="' +
            dongtianPlaceholderEffectSrc(0) +
            '" /></div>';
        var imgPh = row.querySelector(".combat-title-fx__img");
        if (imgPh) {
            imgPh.addEventListener("load", function () {
                combatTitleFxMarkImgReady(row);
            }, { once: true });
            imgPh.addEventListener("error", function tryPlaceholderExt() {
                var pa = parseInt(imgPh.getAttribute("data-ph-attempt") || "0", 10) + 1;
                var pSrc = dongtianPlaceholderEffectSrc(pa);
                if (pSrc) {
                    imgPh.setAttribute("data-ph-attempt", String(pa));
                    imgPh.src = pSrc;
                } else {
                    row.innerHTML = "";
                    row.classList.remove("combat-title-fx--active");
                    row.classList.remove("combat-title-fx--placeholder");
                    row.classList.remove("combat-title-fx--img-ready");
                    row._titleFxSlotKey = "";
                }
            });
        }
        return;
    }
    var id = def.id;
    var slotKey = combatTitleFxSlotKey(def);
    row._titleFxSlotKey = slotKey;
    row.classList.remove("combat-title-fx--placeholder");
    row.classList.add("combat-title-fx--active");
    row.classList.remove("combat-title-fx--img-ready");
    row.innerHTML =
        '<div class="combat-title-fx__stage">' +
        '<span class="combat-title-fx__name">' +
        def.name +
        '</span><img class="combat-title-fx__img" alt="" decoding="async" src="' +
        dongtianTitleEffectSrc(id, 0) +
        '" data-tid="' +
        id +
        '" /></div>';
    var img = row.querySelector(".combat-title-fx__img");
    var nm = row.querySelector(".combat-title-fx__name");
    combatTitleFxBindEffectImg(row, img, nm);
}

function refreshCombatTitleFxIntoPlainName(row, displayName) {
    if (!row) return;
    var n = displayName && String(displayName).trim() ? String(displayName).trim() : "";
    row.classList.remove("combat-title-fx--placeholder");
    row.classList.remove("combat-title-fx--img-ready");
    row.classList.add("combat-title-fx--active");
    row._titleFxSlotKey = n ? "__plain__:" + n : "__none__";
    if (!n) {
        refreshCombatTitleFxInto(row, null);
        return;
    }
    row.innerHTML =
        '<div class="combat-title-fx__stage combat-title-fx__stage--solo">' +
        '<span class="combat-title-fx__name combat-title-fx__name--solo">' +
        escTitleHtml(n) +
        "</span></div>";
}

/**
 * 魔龙洞玩家卡：称号行。opts: { mode: 'live' } 或 { mode: 'snapshot', title: '中文名' }
 */
function refreshMolongTitleFxSlot(row, opts) {
    if (!row) return;
    var o = opts && typeof opts === "object" ? opts : {};
    var slotKey = "";
    if (o.mode === "live") {
        if (typeof player === "undefined" || !player) {
            slotKey = "__none__";
        } else {
            var liveDef = getCombatEffectiveDisplayTitleDef();
            slotKey = "live:" + combatTitleFxSlotKey(liveDef);
        }
    } else if (o.mode === "snapshot") {
        var t = o.title != null ? String(o.title).trim() : "";
        slotKey = t ? "snap:" + t : "__none__";
    } else {
        slotKey = "__none__";
    }
    if (row._titleFxSlotKey === slotKey) return;
    if (o.mode === "live") {
        if (typeof player === "undefined" || !player) {
            refreshCombatTitleFxInto(row, null);
            return;
        }
        refreshCombatTitleFxInto(row, getCombatEffectiveDisplayTitleDef());
        return;
    }
    if (o.mode === "snapshot") {
        var t2 = o.title != null ? String(o.title).trim() : "";
        if (!t2) {
            refreshCombatTitleFxInto(row, null);
            return;
        }
        var d = getDongtianTitleDefByDisplayName(t2);
        if (d) {
            refreshCombatTitleFxInto(row, d);
        } else {
            refreshCombatTitleFxIntoPlainName(row, t2);
        }
        return;
    }
    refreshCombatTitleFxInto(row, null);
}

function refreshCombatTitleFxRow() {
    if (typeof player === "undefined" || !player) return;
    var row = document.getElementById("player-combat-title-fx");
    if (!row) return;
    var def = getCombatEffectiveDisplayTitleDef();
    var cacheKey = combatTitleFxSlotKey(def);
    if (player.inCombat) {
        if (window.__combatTitleFxCacheKey === cacheKey && row._titleFxSlotKey === cacheKey) return;
        window.__combatTitleFxCacheKey = cacheKey;
    } else {
        try {
            window.__combatTitleFxCacheKey = "";
        } catch (eCk) {}
    }
    refreshCombatTitleFxInto(row, def);
}

try {
    window.aggregateTitleBonuses = aggregateTitleBonuses;
    window.openTitleModal = openTitleModal;
    window.closeTitleModal = closeTitleModal;
    window.ensurePlayerTitleFields = ensurePlayerTitleFields;
    window.refreshCombatTitleFxInto = refreshCombatTitleFxInto;
    window.refreshMolongTitleFxSlot = refreshMolongTitleFxSlot;
    window.refreshCombatTitleFxRow = refreshCombatTitleFxRow;
} catch (eExp) {}
