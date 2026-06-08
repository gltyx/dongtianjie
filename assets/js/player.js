let player = (function () {
    try {
        if (window.DONGTIAN_CLOUD_MODE) return null;
        return JSON.parse(localStorage.getItem("playerData"));
    } catch (e) {
        return null;
    }
})();
let inventoryOpen = false;
let sectPassivesModalOpen = false;
let leveled = false;

/** 联网洞天：界面展示为「名字（身份id）」；尚无 id 或非联网则仅名字 */
function formatDongtianDisplayName(name) {
    var n = name != null ? String(name) : "";
    if (typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE && typeof player !== "undefined" && player) {
        var id = player.dongtianPublicId;
        if (typeof id === "number" && id >= 1 && id <= 10000 && Math.floor(id) === id) {
            return n + "（" + id + "）";
        }
    }
    return n;
}
if (typeof window !== "undefined") window.formatDongtianDisplayName = formatDongtianDisplayName;

/** 武神坛/市场等：根据接口回传的灵网 id 拼展示名；避免重复「（数字）」后缀 */
function formatDongtianPeerDisplayName(name, publicId) {
    var n = name != null ? String(name) : "";
    var id = publicId != null ? Number(publicId) : NaN;
    if (!Number.isFinite(id) || id < 1 || id > 10000 || Math.floor(id) !== id) {
        return n;
    }
    var base = n.replace(/（[0-9]{1,5}）$/, "");
    return base + "（" + id + "）";
}
if (typeof window !== "undefined") window.formatDongtianPeerDisplayName = formatDongtianPeerDisplayName;

/** 修为条：每升一级 expMax 增量 ≈ 当前 expMax × pct + 100；100 级前 10%，100 级起降为 5% 避免后期膨胀过快 */
var DONGTIAN_EXP_MAX_INCREASE_PCT = 0.1;
var DONGTIAN_EXP_MAX_INCREASE_SOFT_START_LVL = 100;
var DONGTIAN_EXP_MAX_INCREASE_PCT_AFTER_SOFT = 0.05;

function dongtianExpMaxIncreaseForLevelUp(curLvl, expMax) {
    var max = Math.max(100, Math.floor(Number(expMax) || 100));
    var lvl = Math.max(1, Math.floor(Number(curLvl) || 1));
    var softStart =
        typeof DONGTIAN_EXP_MAX_INCREASE_SOFT_START_LVL === "number" && isFinite(DONGTIAN_EXP_MAX_INCREASE_SOFT_START_LVL)
            ? Math.max(1, Math.floor(DONGTIAN_EXP_MAX_INCREASE_SOFT_START_LVL))
            : 100;
    var pct =
        lvl >= softStart
            ? typeof DONGTIAN_EXP_MAX_INCREASE_PCT_AFTER_SOFT === "number" && isFinite(DONGTIAN_EXP_MAX_INCREASE_PCT_AFTER_SOFT)
                ? DONGTIAN_EXP_MAX_INCREASE_PCT_AFTER_SOFT
                : 0.05
            : typeof DONGTIAN_EXP_MAX_INCREASE_PCT === "number" && isFinite(DONGTIAN_EXP_MAX_INCREASE_PCT)
              ? DONGTIAN_EXP_MAX_INCREASE_PCT
              : 0.1;
    return Math.max(1, Math.floor(max * pct + 100));
}

/** 按 playerLvlUp 规则推演至 targetLvl 的 expMax / expMaxLvl（刚停在该级、修为待涨） */
function dongtianComputePlayerExpForLevel(targetLvl) {
    var L = Math.max(1, Math.floor(Number(targetLvl) || 1));
    var curLvl = 1;
    var expMax = 100;
    var lastExpMaxIncrease = 100;
    while (curLvl < L) {
        var inc = dongtianExpMaxIncreaseForLevelUp(curLvl, expMax);
        lastExpMaxIncrease = inc;
        expMax += inc;
        curLvl += 1;
    }
    return { expMax: expMax, expMaxLvl: lastExpMaxIncrease };
}

/**
 * 读档迁移：按当前 expMax 规则重算 expMax / expMaxLvl（取消境界 1.1 叠乘等历史曲线差异）。
 * @param {object} [optPlayer] 默认使用全局 player
 * @returns {boolean} 是否改动了 exp 字段
 */
function repairDongtianPlayerExpPostLvl100Curve(optPlayer) {
    var p = optPlayer != null ? optPlayer : typeof player !== "undefined" ? player : null;
    if (!p || typeof p !== "object") return false;
    var lvl = Math.floor(Number(p.lvl) || 1);
    if (lvl < 2) return false;
    if (!p.exp || typeof p.exp !== "object") {
        p.exp = { expCurr: 0, expMax: 100, expCurrLvl: 0, expMaxLvl: 100, lvlGained: 0 };
    }
    var expected = dongtianComputePlayerExpForLevel(lvl);
    var curMax = Math.floor(Number(p.exp.expMax) || 0);
    var curMaxLvl = Math.floor(Number(p.exp.expMaxLvl) || 0);
    if (curMax === expected.expMax && curMaxLvl === expected.expMaxLvl) {
        p.dongtianExpPost100CurveMigrate2026 = true;
        return false;
    }
    p.exp.expMax = expected.expMax;
    p.exp.expMaxLvl = expected.expMaxLvl;
    var ec = Math.max(0, Math.floor(Number(p.exp.expCurr) || 0));
    if (ec >= p.exp.expMax) {
        ec = Math.max(0, p.exp.expMax - 1);
    }
    p.exp.expCurr = ec;
    var ecl = Math.max(0, Math.floor(Number(p.exp.expCurrLvl) || 0));
    if (ecl >= p.exp.expMaxLvl) {
        ecl = Math.max(0, p.exp.expMaxLvl - 1);
    }
    p.exp.expCurrLvl = ecl;
    p.dongtianExpPost100CurveMigrate2026 = true;
    return true;
}
if (typeof window !== "undefined") {
    window.dongtianComputePlayerExpForLevel = dongtianComputePlayerExpForLevel;
    window.repairDongtianPlayerExpPostLvl100Curve = repairDongtianPlayerExpPostLvl100Curve;
}

/**
 * 洞天相关玩法：本段进度下「达到该等级后不再获得修为」（修为条与击杀结算均受此限制）。
 * 封顶等级 = 10 + (段数 − 1) × 5，即秘境第 1 层 10、第 2 层 15、第 3 层 20…（押镖/地脉按各自 segment 代入同一公式）。
 * 判定：player.lvl >= 封顶 时 isDongtianDungeonPlayerExpBlockedByLevelCap 为 true（例如第一层 10 级起不再涨修为，无法靠经验升到 11）。
 * 押镖/地脉：escort.active / mining.active 时用 segment；否则凡存在 dungeon.progress.floor 即用其作层数（与事件/战斗/读档界面一致，不依赖 player.allocated 或 exploring）。
 * 不得依赖 dungeon.status.exploring（读档/背包/卷宗等常为 false，否则 cap 会变成 null 导致漏拦）。
 */
function dongtianDungeonPlayerLevelCap() {
    var stage = null;
    if (typeof escort !== "undefined" && escort && escort.active && escort.progress) {
        stage = Math.max(1, Math.floor(Number(escort.progress.segment) || 1));
    } else if (typeof mining !== "undefined" && mining && mining.active && mining.progress) {
        stage = Math.max(1, Math.floor(Number(mining.progress.segment) || 1));
    } else if (
        typeof dungeon !== "undefined" &&
        dungeon &&
        dungeon.progress &&
        typeof dungeon.progress.floor === "number" &&
        dungeon.progress.floor >= 1
    ) {
        stage = Math.max(1, Math.floor(Number(dungeon.progress.floor) || 1));
    }
    if (stage == null) return null;
    return 10 + (stage - 1) * 5;
}

function isDongtianDungeonPlayerExpBlockedByLevelCap() {
    var cap = dongtianDungeonPlayerLevelCap();
    if (cap == null) return false;
    return Math.floor(Number(player.lvl) || 1) >= cap;
}

/**
 * 事件日志：roll 出修为但 dongtianDungeonPlayerExpAddBase 未入账（多为层数封顶）时追加说明，避免仍写「+感悟」误导。
 * @param {number} amount
 * @param {boolean} added dongtianDungeonPlayerExpAddBase 返回值
 */
function dongtianDungeonPlayerExpMissedGainHintZh(amount, added) {
    if (!amount || amount <= 0 || added) return "";
    if (typeof isDongtianDungeonPlayerExpBlockedByLevelCap === "function" && isDongtianDungeonPlayerExpBlockedByLevelCap()) {
        return "（本层修为已达上限，无法再入丹田）";
    }
    return "";
}

function dongtianDungeonPlayerExpApplyLevelUpsAndClamp() {
    var cap = dongtianDungeonPlayerLevelCap();
    /** 防止 expCurr 未正确扣减等异常导致死循环卡死主线程 */
    var guard = 0;
    var guardMax = 100000;
    while (player.exp.expCurr >= player.exp.expMax) {
        if (++guard > guardMax) {
            try {
                console.error(
                    "[dongtianDungeonPlayerExpApplyLevelUpsAndClamp] 超过 " +
                        guardMax +
                        " 次升级循环，强制将修为压至当前上限以下，请检查 playerLvlUp / exp 字段是否一致。"
                );
            } catch (eG) {}
            player.exp.expCurr = Math.max(0, Math.floor(Number(player.exp.expMax) || 1) - 1);
            break;
        }
        if (cap != null && Math.floor(Number(player.lvl) || 1) >= cap) break;
        playerLvlUp();
    }
    if (cap != null && Math.floor(Number(player.lvl) || 1) >= cap) {
        if (player.exp.expCurr >= player.exp.expMax) {
            player.exp.expCurr = Math.max(0, player.exp.expMax - 1);
        }
        if (typeof player.exp.expMaxLvl === "number" && player.exp.expCurrLvl >= player.exp.expMaxLvl) {
            player.exp.expCurrLvl = Math.max(0, player.exp.expMaxLvl - 1);
        }
    }
}

/** 未达本层等级上限则增加修为条并返回 true；已达上限则返回 false（不增加）。 */
function dongtianDungeonPlayerExpAddBase(amount) {
    if (!amount || amount <= 0) return false;
    if (isDongtianDungeonPlayerExpBlockedByLevelCap()) return false;
    player.exp.expCurr += amount;
    player.exp.expCurrLvl += amount;
    return true;
}

const lvlupSelect = document.querySelector("#lvlupSelect");
const lvlupPanel = document.querySelector("#lvlupPanel");

const playerExpGain = () => {
    var baseExp =
        enemy && enemy.rewards && typeof enemy.rewards.exp === "number" ? Math.max(0, enemy.rewards.exp) : 0;
    if (baseExp <= 0) {
        playerLoadStats();
        return;
    }
    if (isDongtianDungeonPlayerExpBlockedByLevelCap()) {
        // 人物修为被本层封顶时，仍允许灵宠按击杀分流吃经验。
        if (typeof addPetExp === "function") {
            var petShareBlocked = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
            addPetExp(Math.max(0, Math.floor(baseExp * petShareBlocked)), true);
        }
        if (enemy && enemy.rewards) enemy.rewards.exp = 0;
        playerLoadStats();
        return;
    }
    var mult =
        typeof getDongtianSameRoomPlayerExpMultiplier === "function"
            ? getDongtianSameRoomPlayerExpMultiplier()
            : 1;
    var playerAdd = Math.max(0, Math.floor(baseExp * mult));
    player.exp.expCurr += playerAdd;
    player.exp.expCurrLvl += playerAdd;

    if (typeof addPetExp === "function") {
        var petShare = typeof PET_EXP_SHARE_FROM_PLAYER === "number" ? PET_EXP_SHARE_FROM_PLAYER : 0.27;
        addPetExp(Math.max(0, Math.floor(baseExp * petShare)), true);
    }

    if (typeof dongtianRecordSameRoomPlayerExpBattle === "function") dongtianRecordSameRoomPlayerExpBattle();

    dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
    if (leveled) {
        lvlupPopup();
    }

    playerLoadStats();
}

/** 每升一级自动写入 bonusStats 的机缘%（与 playerLvlUp 内原增量一致）；累计上限 = 当前等级 × 该项每级增量 */
const LVLUP_AUTO_BONUS_PER_LEVEL = {
    hp: 8 / 3,
    atk: 4 / 3,
    def: 4 / 3,
    atkSpd: 0.5 / 3,
    vamp: 0,
    critRate: 0.2 / 3,
    critDmg: 0.5 / 3,
};

const LVLUP_AUTO_BONUS_KEYS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

function ensurePlayerLvlupAutoBonusApplied() {
    if (typeof player === "undefined" || !player) return;
    var L = Math.max(1, Math.floor(Number(player.lvl) || 1));
    if (!player.lvlupAutoBonusApplied || typeof player.lvlupAutoBonusApplied !== "object") {
        player.lvlupAutoBonusApplied = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        /** 此时 player.lvl 已是新突破后等级；本笔自动机缘尚未入账。等价历史次数 = L-2（例如刚升到 2 级时尚无过往自动条） */
        if (L > 1) {
            var histMul = Math.max(0, L - 2);
            for (var mi = 0; mi < LVLUP_AUTO_BONUS_KEYS.length; mi++) {
                var mk = LVLUP_AUTO_BONUS_KEYS[mi];
                var mper = LVLUP_AUTO_BONUS_PER_LEVEL[mk];
                if (typeof mper === "number" && isFinite(mper) && mper > 0) {
                    player.lvlupAutoBonusApplied[mk] = histMul * mper;
                }
            }
        }
    } else {
        for (var ni = 0; ni < LVLUP_AUTO_BONUS_KEYS.length; ni++) {
            var nk = LVLUP_AUTO_BONUS_KEYS[ni];
            var nv = player.lvlupAutoBonusApplied[nk];
            player.lvlupAutoBonusApplied[nk] = typeof nv === "number" && isFinite(nv) ? Math.max(0, nv) : 0;
        }
    }
    for (var ci = 0; ci < LVLUP_AUTO_BONUS_KEYS.length; ci++) {
        var ck = LVLUP_AUTO_BONUS_KEYS[ci];
        var cper = LVLUP_AUTO_BONUS_PER_LEVEL[ck];
        if (typeof cper !== "number" || !isFinite(cper) || cper <= 0) continue;
        var capC = L * cper;
        var usedC = player.lvlupAutoBonusApplied[ck] || 0;
        if (usedC > capC) player.lvlupAutoBonusApplied[ck] = capC;
    }
}

function getLvlupAutoBonusCapForStat(statKey) {
    if (typeof player === "undefined" || !player) return 0;
    var L = Math.max(1, Math.floor(Number(player.lvl) || 1));
    var per = LVLUP_AUTO_BONUS_PER_LEVEL[statKey];
    if (typeof per !== "number" || !isFinite(per) || per <= 0) return 0;
    return L * per;
}

/** 每级自动机缘入账（playerLvlUp 内调用；已升级后的 player.lvl 参与上限） */
function applyLvlupAutoBonusStat(statKey, desiredDelta) {
    if (typeof player === "undefined" || !player || !player.bonusStats) return 0;
    var k = String(statKey);
    if (LVLUP_AUTO_BONUS_KEYS.indexOf(k) < 0) return 0;
    var desired = Math.max(0, Number(desiredDelta) || 0);
    if (desired <= 0) return 0;
    var per = LVLUP_AUTO_BONUS_PER_LEVEL[k];
    if (typeof per !== "number" || !isFinite(per) || per <= 0) return 0;
    ensurePlayerLvlupAutoBonusApplied();
    var cap = getLvlupAutoBonusCapForStat(k);
    var used = player.lvlupAutoBonusApplied[k] || 0;
    var room = Math.max(0, cap - used);
    var actual = Math.min(desired, room);
    if (actual > 0) {
        player.bonusStats[k] += actual;
        player.lvlupAutoBonusApplied[k] = used + actual;
    }
    return actual;
}

// Levels up the player
const playerLvlUp = () => {
    leveled = true;

    // Calculates the new exp required to level up（不读取「溢出」：升级后不再扣减当前修为，由 while(expCurr>=expMax) 连升）
    var expMaxIncrease = dongtianExpMaxIncreaseForLevelUp(player.lvl, player.exp.expMax);
    player.exp.expMaxLvl = expMaxIncrease;

    // Increase player level and maximum exp
    player.lvl++;
    player.exp.lvlGained++;
    player.exp.expMax += expMaxIncrease;

    // 更新“历史最高等级”：只要玩家等级跃升超过记录，就立刻刷新记录与名录弹窗显示
    try {
        var curLvl = typeof player.lvl === "number" ? Math.floor(player.lvl) : 1;
        var hasMaxLvl = typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl) ? player.maxDungeonFloorLvl : 0;
        if (curLvl > hasMaxLvl) {
            player.maxDungeonFloorLvl = curLvl;
            player.maxDungeonFloorSect = player.sect || null;

            // 如果名录弹窗正在显示，直接更新避免等待 1s 刷新间隔
            var elMaxLevel = document.querySelector("#profile-maxlevel");
            if (elMaxLevel) elMaxLevel.textContent = `历史最高等级：${curLvl} 级`;

            var elMaxLvlRow = document.querySelector("#profile-maxlvl");
            if (elMaxLvlRow) {
                var sectName = "未立门派";
                if (typeof getSectById === "function" && player.maxDungeonFloorSect) {
                    var s2 = getSectById(player.maxDungeonFloorSect);
                    if (s2 && s2.name) sectName = s2.name;
                }
                var reachShow =
                    typeof player.maxDungeonFloorReachLvl === "number" && !isNaN(player.maxDungeonFloorReachLvl)
                        ? Math.floor(player.maxDungeonFloorReachLvl)
                        : curLvl;
                elMaxLvlRow.textContent = `当时修为：${reachShow} 级 · ${sectName}`;
            }
        }
    } catch (e) {}

    // Increase player bonus stats per level（原 3 倍速成长，现为 1 倍；累计不超过 当前等级×每级该项）
    var _aHp = applyLvlupAutoBonusStat("hp", 8 / 3);
    var _aAtk = applyLvlupAutoBonusStat("atk", 4 / 3);
    var _aDef = applyLvlupAutoBonusStat("def", 4 / 3);
    var _aAspd = applyLvlupAutoBonusStat("atkSpd", 0.5 / 3);
    var _aCr = applyLvlupAutoBonusStat("critRate", 0.2 / 3);
    var _aCd = applyLvlupAutoBonusStat("critDmg", 0.5 / 3);
    if (typeof addCombatLog === "function") {
        var _autoShort = [];
        if (_aHp + 1e-9 < 8 / 3) _autoShort.push("气血");
        if (_aAtk + 1e-9 < 4 / 3) _autoShort.push("力道");
        if (_aDef + 1e-9 < 4 / 3) _autoShort.push("护体");
        if (_aAspd + 1e-9 < 0.5 / 3) _autoShort.push("身法");
        if (_aCr + 1e-9 < 0.2 / 3) _autoShort.push("会心");
        if (_aCd + 1e-9 < 0.5 / 3) _autoShort.push("暴伤");
        if (_autoShort.length) {
            addCombatLog(
                `<span class="Rare">「${ _autoShort.join("、") }」每级自动机缘已达当前等级累计上限，本次突破未全额入账。</span>`
            );
        }
    }

    // 不修改 expCurr / expCurrLvl：当前修为累计值保留；仅提高 expMax，避免升级后条从满额被写成 0 或只剩溢出小段。
}

/** 嵌入主游戏 iframe 时，HUD 头像与主界面 player.avatar 一致（无头像则仍显示「炁」） */
function syncHudBarAvatar() {
    var wrap = document.querySelector(".hud-bar__avatar");
    if (!wrap) return;
    var img = wrap.querySelector(".hud-bar__avatar-img");
    if (!img) {
        img = document.createElement("img");
        img.className = "hud-bar__avatar-img";
        img.alt = "";
        img.decoding = "async";
        wrap.appendChild(img);
    }
    var url = "";
    if (typeof window.DONGTIAN_CLOUD_MODE !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
        try {
            var par = window.parent;
            if (par && par !== window) {
                if (typeof par.getGoldGamePlayerAvatarForDongtian === "function") {
                    var u = par.getGoldGamePlayerAvatarForDongtian();
                    if (typeof u === "string" && u.length > 0) url = u;
                }
                if (!url && par.document) {
                    var pAv = par.document.getElementById("playerAvatar");
                    if (pAv) {
                        var src = pAv.currentSrc || pAv.src || pAv.getAttribute("src") || "";
                        if (typeof src === "string" && src.length > 8 && src.indexOf("data:") === 0) url = src;
                        else if (typeof src === "string" && src.length > 4 && (src.indexOf("http") === 0 || src.indexOf("blob:") === 0)) url = src;
                    }
                }
            }
        } catch (e) {}
    }
    if (url) {
        wrap.classList.add("hud-bar__avatar--has-image");
        img.onerror = function () {
            wrap.classList.remove("hud-bar__avatar--has-image");
            img.removeAttribute("src");
            img.onerror = null;
        };
        img.src = url;
    } else {
        wrap.classList.remove("hud-bar__avatar--has-image");
        img.removeAttribute("src");
        img.onerror = null;
    }
}
try {
    window.syncHudBarAvatar = syncHudBarAvatar;
} catch (e) {}

// Refresh the player stats
const playerLoadStats = () => {
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    if (player.stats.hp > player.stats.hpMax) {
        player.stats.hp = player.stats.hpMax;
    }
    player.stats.hpPercent = Number((player.stats.hp / player.stats.hpMax) * 100).toFixed(2).replace(rx, "$1");
    var expCap = Math.max(1, player.exp.expMax);
    player.exp.expPercent = Number(Math.min(100, (player.exp.expCurr / expCap) * 100)).toFixed(2).replace(rx, "$1");

    // Generate battle info for player if in combat
    if (player.inCombat || playerDead) {
        const playerCombatHpElement = document.querySelector('#player-hp-battle');
        const playerHpDamageElement = document.querySelector('#player-hp-dmg');
        const playerExpElement = document.querySelector('#player-exp-bar');
        const playerInfoElement = document.querySelector('#player-combat-info');
        const playerExpCombatText = document.getElementById('player-exp-combat-text');
        if (playerCombatHpElement) {
            playerCombatHpElement.innerHTML = `${nFormatter(player.stats.hp)}/${nFormatter(player.stats.hpMax)} <span class="combat-bar__pct">${player.stats.hpPercent}%</span>`;
            playerCombatHpElement.style.width = `${player.stats.hpPercent}%`;
        }
        if (playerHpDamageElement) {
            playerHpDamageElement.style.width = `${player.stats.hpPercent}%`;
        }
        if (playerExpElement) {
            playerExpElement.style.width = `${player.exp.expPercent}%`;
        }
        if (playerExpCombatText) {
            playerExpCombatText.textContent = `${nFormatter(player.exp.expCurr)}/${nFormatter(player.exp.expMax)} · ${player.exp.expPercent}%`;
        }
        /** 斗法进行中仅首帧写入名字/称号/灵宠栏，之后只刷新气血/修为条 */
        var primeCombatLines = !player.inCombat;
        if (playerInfoElement && playerInfoElement.childElementCount < 1) primeCombatLines = true;
        if (playerInfoElement && primeCombatLines) {
            if (typeof enemy !== "undefined" && enemy && enemy.molongRaid) {
                if (typeof window.refreshMolongPlayerCombatLines === "function") {
                    window.refreshMolongPlayerCombatLines(true);
                }
            } else {
                playerInfoElement.innerHTML = `<span class="combat-card__pname">${formatDongtianDisplayName(player.name)}</span><span class="combat-card__prealm">${cultivationRealmLabel(player.lvl)}</span>`;
            }
        }
        if (typeof refreshCombatTitleFxRow === "function") refreshCombatTitleFxRow();
        var petTitleEl = document.getElementById("pet-combat-title");
        if (
            typeof refreshPetCombatHud === "function" &&
            (!player.inCombat || (petTitleEl && !String(petTitleEl.textContent || "").trim()))
        ) {
            refreshPetCombatHud();
        }
        if (typeof window.refreshMolongCombatHud === "function") window.refreshMolongCombatHud();
        /** 斗法进行中：仅刷新战况条，勿重绘行囊/装备/属性面板（每击全量刷新会导致卡顿甚至出手链停滞） */
        if (player.inCombat) return;
    }

    showEquipment();
    showInventory();
    applyEquipmentStats();
    if (typeof refreshSectPassiveModal === "function") refreshSectPassiveModal();

    // Header
    syncHudBarAvatar();
    document.querySelector("#player-name").innerHTML = `<i class="fas fa-user"></i><span>${formatDongtianDisplayName(player.name)}</span>`;
    document.querySelector("#player-realm").textContent = cultivationRealmLabel(player.lvl);
    var sectHudLabel = "未立门派";
    if (typeof getSectById === "function" && player.sect) {
        var sectRow = getSectById(player.sect);
        if (sectRow && sectRow.name) sectHudLabel = sectRow.name;
    }
    document.querySelector("#player-sect").textContent = "门派 · " + sectHudLabel;
    document.querySelector("#player-exp").innerHTML = `<span class="hud-pill__lbl">修为</span><span class="hud-pill__val">${nFormatter(player.exp.expCurr)}/${nFormatter(player.exp.expMax)} (${player.exp.expPercent}%)</span>`;
    document.querySelector("#player-gold").innerHTML = `<span class="hud-pill__lbl">灵石</span><span class="hud-pill__val"><i class="fas fa-coins" style="color: var(--gold);"></i>${nFormatter(player.gold)}</span>`;

    // Player Stats
    playerHpElement.innerHTML = `${nFormatter(player.stats.hp)}/${nFormatter(player.stats.hpMax)} (${player.stats.hpPercent}%)`;
    playerAtkElement.innerHTML = nFormatter(player.stats.atk);
    playerDefElement.innerHTML = nFormatter(player.stats.def);
    playerAtkSpdElement.innerHTML = player.stats.atkSpd.toFixed(2).replace(rx, "$1");
    playerVampElement.innerHTML = (player.stats.vamp).toFixed(2).replace(rx, "$1") + "%";
    playerCrateElement.innerHTML = (player.stats.critRate).toFixed(2).replace(rx, "$1") + "%";
    playerCdmgElement.innerHTML = (player.stats.critDmg).toFixed(2).replace(rx, "$1") + "%";

    // Player Bonus Stats（含遗器套装、灵宠机缘，与斗法面板一致）
    var sb = player.equipmentSetBonusStats || {};
    var petBk =
        typeof getActivePetBonusStats === "function" ? getActivePetBonusStats() : {};
    var gGem =
        typeof getGemBonusLikePet === "function"
            ? getGemBonusLikePet()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var titleBk =
        typeof aggregateTitleBonuses === "function"
            ? aggregateTitleBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var shituBk =
        typeof aggregateShituMentorBonuses === "function"
            ? aggregateShituMentorBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var dtBk =
        typeof window.getDongtianDragonTowerOpportunityBonuses === "function"
            ? window.getDongtianDragonTowerOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0, layers: 0 };
    var dtDemonBk =
        typeof window.getDongtianDemonTowerOpportunityBonuses === "function"
            ? window.getDongtianDemonTowerOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0, layers: 0 };
    var dtDivineBk =
        typeof window.getDongtianDivineRealmOpportunityBonuses === "function"
            ? window.getDongtianDivineRealmOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0, layers: 0 };
    var dtSbrBk =
        typeof window.getDongtianSpiritBeastRealmOpportunityBonuses === "function"
            ? window.getDongtianSpiritBeastRealmOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0, layers: 0 };
    var dtGhostBk =
        typeof window.getDongtianGhostRealmOpportunityBonuses === "function"
            ? window.getDongtianGhostRealmOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0, layers: 0 };
    var curioBk =
        typeof window.aggregateSwordSpiritCurioBonuses === "function"
            ? window.aggregateSwordSpiritCurioBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var lgxPct =
        typeof window.getDongtianLinggenXuemaiMergedPct === "function"
            ? window.getDongtianLinggenXuemaiMergedPct()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var zmHpOppScale =
        typeof window.getDongtianZongmenOpportunityScale === "function"
            ? window.getDongtianZongmenOpportunityScale()
            : 1;
    if (!isFinite(zmHpOppScale) || zmHpOppScale < 1) zmHpOppScale = 1;
    var zmTech =
        typeof window.getDongtianZongmenTechniqueScales === "function"
            ? window.getDongtianZongmenTechniqueScales()
            : { hp: 1, atk: 1, def: 1, atkSpd: 1, vamp: 1, critRate: 1, critDmg: 1 };
    function techScaleUi(key) {
        var v = zmTech && zmTech[key];
        return v > 1 && isFinite(v) ? v : 1;
    }
    var gemSum =
        gGem.hp + gGem.atk + gGem.def + gGem.atkSpd + gGem.critDmg;
    var s = function (a, b, c, d, t) {
        var x = Number(d);
        if (!isFinite(x)) x = 0;
        var xt = Number(t);
        if (!isFinite(xt)) xt = 0;
        return (Number(a) + Number(b) + Number(c) + x + xt).toFixed(2).replace(rx, "$1");
    };
    /** 灵根血脉 + 宗门等级（仅气血机缘）：展示值 = 机缘同类总和 × (1 + (灵根+血脉)该项% ÷ 100) × 宗门气血倍率 */
    var sLgx = function (a, b, c, d, t, lgxKey) {
        var x = Number(d);
        if (!isFinite(x)) x = 0;
        var xt = Number(t);
        if (!isFinite(xt)) xt = 0;
        var base = Number(a) + Number(b) + Number(c) + x + xt;
        var mul = Number(lgxPct[lgxKey]) || 0;
        if (mul) base *= 1 + mul / 100;
        if (lgxKey === "hp" && zmHpOppScale > 1) base *= zmHpOppScale;
        var ts = techScaleUi(lgxKey);
        if (ts > 1) base *= ts;
        return base.toFixed(2).replace(rx, "$1");
    };
    var setNote = "";
    var sbSum =
        (sb.hp || 0) +
        (sb.atk || 0) +
        (sb.def || 0) +
        (sb.atkSpd || 0) +
        (sb.vamp || 0) +
        (sb.critRate || 0) +
        (sb.critDmg || 0);
    var petSum =
        (petBk.hp || 0) +
        (petBk.atk || 0) +
        (petBk.def || 0) +
        (petBk.atkSpd || 0) +
        (petBk.vamp || 0) +
        (petBk.critRate || 0) +
        (petBk.critDmg || 0);
    if (sbSum > 0) {
        setNote =
            '<p class="stat-card__note stat-card__note--set">身着遗器套装已叠加机缘（2/4/6 件同套）；下列含出战灵宠、<strong>灵窍宝石</strong>（若有）；与道体加算。</p>';
    } else if (petSum > 0) {
        setNote =
            '<p class="stat-card__note stat-card__note--set">已含<strong>出战</strong>灵宠反哺机缘；下列含<strong>灵窍宝石</strong>（若有）；与道体加算。</p>';
    } else if (gemSum > 0) {
        setNote =
            '<p class="stat-card__note stat-card__note--set">下列含<strong>灵窍宝石</strong>；与道体机缘、套装、灵宠同类合并。</p>';
    }
    var titleSum =
        titleBk.hp +
        titleBk.atk +
        titleBk.def +
        titleBk.atkSpd +
        titleBk.vamp +
        titleBk.critRate +
        titleBk.critDmg;
    var shituSum =
        shituBk.hp +
        shituBk.atk +
        shituBk.def +
        shituBk.atkSpd +
        shituBk.vamp +
        shituBk.critRate +
        shituBk.critDmg;
    if (titleSum > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>洞天称号</strong>永久机缘</p>';
    }
    if (shituSum > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>师徒·师父出师</strong>永久机缘</p>';
    }
    var curioSum =
        (curioBk.hp || 0) +
        (curioBk.atk || 0) +
        (curioBk.def || 0) +
        (curioBk.atkSpd || 0) +
        (curioBk.vamp || 0) +
        (curioBk.critRate || 0) +
        (curioBk.critDmg || 0);
    if (curioSum > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>剑灵云游·秘藏</strong>永久机缘</p>';
    }
    if ((dtBk.layers || 0) > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>登龙塔</strong>永久机缘</p>';
    }
    if ((dtDemonBk.layers || 0) > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>魔神塔</strong>永久机缘</p>';
    }
    if ((dtDivineBk.layers || 0) > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>神界</strong>永久机缘</p>';
    }
    if ((dtSbrBk.layers || 0) > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>灵兽界</strong>永久机缘</p>';
    }
    if ((dtGhostBk.layers || 0) > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>幽魂界</strong>永久机缘</p>';
    }
    var lgxSum =
        (lgxPct.hp || 0) +
        (lgxPct.atk || 0) +
        (lgxPct.def || 0) +
        (lgxPct.atkSpd || 0) +
        (lgxPct.vamp || 0) +
        (lgxPct.critRate || 0) +
        (lgxPct.critDmg || 0);
    if (lgxSum !== 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>灵根血脉</strong>：下列数值为「机缘同类总和 + 机缘总和×（灵根%+血脉%）÷100」。</p>';
    }
    if (zmHpOppScale > 1) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>宗门等级</strong>：仅<strong>气血机缘</strong>在灵根血脉之后独立 ×' +
            zmHpOppScale.toFixed(2) +
            "（每级 +50%，与血脉相乘）。</p>";
    }
    var techNoteParts = [];
    if (zmTech.hp > 1) techNoteParts.push("气血×" + zmTech.hp.toFixed(2));
    if (zmTech.atk > 1) techNoteParts.push("力道×" + zmTech.atk.toFixed(2));
    if (zmTech.def > 1) techNoteParts.push("护体×" + zmTech.def.toFixed(2));
    if (zmTech.atkSpd > 1) techNoteParts.push("身法×" + zmTech.atkSpd.toFixed(2));
    if (zmTech.vamp > 1) techNoteParts.push("吸血×" + zmTech.vamp.toFixed(2));
    if (zmTech.critRate > 1) techNoteParts.push("会心×" + zmTech.critRate.toFixed(2));
    if (zmTech.critDmg > 1) techNoteParts.push("暴伤×" + zmTech.critDmg.toFixed(2));
    if (techNoteParts.length) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>宗门功法</strong>：' +
            techNoteParts.join(" · ") +
            "（全宗共享，独立相乘）。</p>";
    }
    document.querySelector("#bonus-stats").innerHTML = `
    <h4 class="card__title">机缘加成</h4>
    <div class="stat-card__body">
    <p><i class="fas fa-heart"></i><span class="stat-card__lbl">气血</span><span class="stat-card__val">+${sLgx(player.bonusStats.hp, sb.hp, petBk.hp, gGem.hp, titleBk.hp + shituBk.hp + (dtBk.hp || 0) + (dtDemonBk.hp || 0) + (dtDivineBk.hp || 0) + (dtSbrBk.hp || 0) + (curioBk.hp || 0), "hp")}%</span></p>
    <p><i class="ra ra-sword"></i><span class="stat-card__lbl">力道</span><span class="stat-card__val">+${sLgx(player.bonusStats.atk, sb.atk, petBk.atk, gGem.atk, titleBk.atk + shituBk.atk + (dtBk.atk || 0) + (dtDemonBk.atk || 0) + (dtDivineBk.atk || 0) + (dtSbrBk.atk || 0) + (curioBk.atk || 0), "atk")}%</span></p>
    <p><i class="ra ra-round-shield"></i><span class="stat-card__lbl">护体</span><span class="stat-card__val">+${sLgx(player.bonusStats.def, sb.def, petBk.def, gGem.def, titleBk.def + shituBk.def + (dtBk.def || 0) + (dtDemonBk.def || 0) + (dtDivineBk.def || 0) + (dtSbrBk.def || 0) + (curioBk.def || 0), "def")}%</span></p>
    <p><i class="ra ra-plain-dagger"></i><span class="stat-card__lbl">身法</span><span class="stat-card__val">+${sLgx(player.bonusStats.atkSpd, sb.atkSpd, petBk.atkSpd, gGem.atkSpd, titleBk.atkSpd + shituBk.atkSpd + (curioBk.atkSpd || 0), "atkSpd")}%</span></p>
    <p><i class="ra ra-dripping-blade"></i><span class="stat-card__lbl">吸血</span><span class="stat-card__val">+${sLgx(player.bonusStats.vamp, sb.vamp, petBk.vamp, 0, titleBk.vamp + shituBk.vamp + (curioBk.vamp || 0), "vamp")}%</span></p>
    <p><i class="ra ra-lightning-bolt"></i><span class="stat-card__lbl">会心</span><span class="stat-card__val">+${sLgx(player.bonusStats.critRate, sb.critRate, petBk.critRate, 0, titleBk.critRate + shituBk.critRate + (curioBk.critRate || 0), "critRate")}%</span></p>
    <p><i class="ra ra-focused-lightning"></i><span class="stat-card__lbl">暴伤</span><span class="stat-card__val">+${sLgx(player.bonusStats.critDmg, sb.critDmg, petBk.critDmg, gGem.critDmg, titleBk.critDmg + shituBk.critDmg + (curioBk.critDmg || 0), "critDmg")}%</span></p>
    ${typeof player.sectWeaponAtkBonusPct === "number" && player.sectWeaponAtkBonusPct > 0 ? `<p><i class="ra ra-sword"></i><span class="stat-card__lbl">本命武器</span><span class="stat-card__val">总力道 ×${(100 + player.sectWeaponAtkBonusPct).toFixed(0)}%</span></p>` : ""}
    ${setNote}
    </div>`;
}

const openSectPassivesModal = () => {
    if (typeof titleModalOpen !== "undefined" && titleModalOpen && typeof closeTitleModal === "function") {
        closeTitleModal();
    }
    if (inventoryOpen) {
        closeInventory();
    }
    if (typeof closePetModal === "function" && typeof petModalOpen !== "undefined" && petModalOpen) {
        closePetModal();
    }
    dungeon.status.exploring = false;
    sectPassivesModalOpen = true;
    var modal = document.querySelector("#sectPassivesModal");
    var dim = document.querySelector("#dungeon-main");
    if (modal) modal.style.display = "flex";
    if (dim) dim.style.filter = "brightness(50%)";
    if (typeof renderSectPassivePanel === "function") renderSectPassivePanel("sectPassivePanelModal");
};

const closeSectPassivesModal = () => {
    sectPassivesModalOpen = false;
    var modal = document.querySelector("#sectPassivesModal");
    var dim = document.querySelector("#dungeon-main");
    if (modal) modal.style.display = "none";
    if (dim && !inventoryOpen && !(typeof petModalOpen !== "undefined" && petModalOpen)) dim.style.filter = "brightness(100%)";
    if (!dungeon.status.paused) {
        dungeon.status.exploring = true;
    }
};

// Opens inventory
const openInventory = () => {
    if (typeof titleModalOpen !== "undefined" && titleModalOpen && typeof closeTitleModal === "function") {
        closeTitleModal();
    }
    if (sectPassivesModalOpen) {
        closeSectPassivesModal();
    }
    if (typeof closePetModal === "function" && typeof petModalOpen !== "undefined" && petModalOpen) {
        closePetModal();
    }

    dungeon.status.exploring = false;
    inventoryOpen = true;
    let openInv = document.querySelector('#inventory');
    let dimDungeon = document.querySelector('#dungeon-main');
    if (!openInv || !dimDungeon) return;
    // 兜底：避免上一次弹窗路径残留导致背包持续发暗
    openInv.style.filter = "brightness(100%)";
    openInv.style.display = "flex";
    dimDungeon.style.filter = "brightness(50%)";

    sellAllElement.onclick = function () {
        openInv.style.filter = "brightness(50%)";
        let rarity = sellRarityElement.value;
        var sellLvlExtra =
            typeof window.getInventorySellLvlModalHintHtml === "function" ? window.getInventorySellLvlModalHintHtml() : "";

        defaultModalElement.style.display = "flex";
        if (rarity == "All") {
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>典让所有<strong>未锁定</strong>遗器？（已锁定者保留）</p>
                ${sellLvlExtra}
                <div class="button-container">
                    <button id="sell-confirm">尽数典让</button>
                    <button id="sell-cancel">作罢</button>
                </div>
            </div>`;
        } else {
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>典让此位阶<span class="${rarity}">${typeof equipmentRarityLabel === "function" ? equipmentRarityLabel(rarity) : rarity}</span>中<strong>未锁定</strong>遗器？（已锁定者保留）</p>
                ${sellLvlExtra}
                <div class="button-container">
                    <button id="sell-confirm">尽数典让</button>
                    <button id="sell-cancel">作罢</button>
                </div>
            </div>`;
        }

        let confirm = document.querySelector('#sell-confirm');
        let cancel = document.querySelector('#sell-cancel');
        confirm.onclick = function () {
            sellAll(rarity);
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            openInv.style.filter = "brightness(100%)";
            if (typeof showInventory === "function") showInventory();
        };
        cancel.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            openInv.style.filter = "brightness(100%)";
        };
    };
    /* 典让品阶：持久化与样式由 equipment.js initInventorySellRarityPersist / syncInventorySellRarityDom 处理 */

    playerLoadStats();
    /** 打开行囊须重绘列表：playerLoadStats 在斗法态会跳过 showInventory，且上次可能停在材料/宝石分页 */
    if (typeof showInventory === "function") {
        if (!player.inventory) player.inventory = {};
        if (player.inventory.bagTab !== "equip" && player.inventory.bagTab !== "mat" && player.inventory.bagTab !== "gem") {
            player.inventory.bagTab = "equip";
        }
        showInventory();
    }
}

// Closes inventory
const closeInventory = () => {

    let openInv = document.querySelector('#inventory');
    let dimDungeon = document.querySelector('#dungeon-main');
    if (openInv) {
        openInv.style.display = "none";
        // 关闭时重置，防止下次打开出现暗屏残留
        openInv.style.filter = "brightness(100%)";
    }
    if (dimDungeon) dimDungeon.style.filter = "brightness(100%)";
    inventoryOpen = false;
    if (!dungeon.status.paused) {
        dungeon.status.exploring = true;
    }
    /** 联网：强化/附魔/换装后关行囊时立即冲档，避免随后开战周期存档竞态把未落盘装备打回 */
    if (window.DONGTIAN_CLOUD_MODE && window.__dongtianLocalPlayerDirty) {
        if (typeof window.dongtianFlushCloudSaveImmediate === "function") {
            window.dongtianFlushCloudSaveImmediate();
        } else if (typeof window.__dongtianCloudFlushSave === "function") {
            window.__dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
        }
    }
}

// Continue exploring if inventory is not open and the game is not paused
const continueExploring = () => {
    var petOpen = typeof petModalOpen !== "undefined" && petModalOpen;
    if (!inventoryOpen && !sectPassivesModalOpen && !petOpen && !dungeon.status.paused) {
        dungeon.status.exploring = true;
    }
}

/** 境界突破三选一：属性中文名（与机缘加成面板一致） */
const BONUS_STAT_LABEL_CN = {
    hp: "气血",
    atk: "力道",
    def: "护体",
    atkSpd: "身法",
    vamp: "吸血",
    critRate: "会心",
    critDmg: "暴伤"
};

/** 三选一单次各属性机缘%（与下方 lvlupPopup / generateLvlStats 一致） */
const LVLUP_CHOICE_BONUS_PER_PICK = {
    hp: 24 / 3,
    atk: 16 / 3,
    def: 16 / 3,
    atkSpd: 16 / 3,
    vamp: 5 / 3,
    critRate: 3 / 3,
    critDmg: 20 / 3,
};

const LVLUP_CHOICE_BONUS_KEYS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

function ensurePlayerLvlupChoiceBonusApplied() {
    if (typeof player === "undefined" || !player) return;
    if (!player.lvlupChoiceBonusApplied || typeof player.lvlupChoiceBonusApplied !== "object") {
        player.lvlupChoiceBonusApplied = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        return;
    }
    for (var i = 0; i < LVLUP_CHOICE_BONUS_KEYS.length; i++) {
        var k = LVLUP_CHOICE_BONUS_KEYS[i];
        var v = player.lvlupChoiceBonusApplied[k];
        player.lvlupChoiceBonusApplied[k] = typeof v === "number" && isFinite(v) ? Math.max(0, v) : 0;
    }
}

/** 当前等级下，三选一累计可写入机缘%的上限：等级 × 该属性单次最高 */
function getLvlupChoiceBonusCapForStat(statKey) {
    if (typeof player === "undefined" || !player) return 0;
    var L = Math.max(1, Math.floor(Number(player.lvl) || 1));
    var per = LVLUP_CHOICE_BONUS_PER_PICK[statKey];
    if (typeof per !== "number" || !isFinite(per) || per <= 0) return 0;
    return L * per;
}

/**
 * 境界突破三选一入账（只加实际未超限部分，并累计 lvlupChoiceBonusApplied）。
 * @returns {number} 实际加上的百分点
 */
function applyLvlupChoiceBonusOnPick(statKey, desiredDelta) {
    if (typeof player === "undefined" || !player || !player.bonusStats) return 0;
    var k = String(statKey);
    if (LVLUP_CHOICE_BONUS_KEYS.indexOf(k) < 0) return 0;
    var desired = Math.max(0, Number(desiredDelta) || 0);
    if (desired <= 0) return 0;
    ensurePlayerLvlupChoiceBonusApplied();
    var cap = getLvlupChoiceBonusCapForStat(k);
    var used = player.lvlupChoiceBonusApplied[k] || 0;
    var room = Math.max(0, cap - used);
    var actual = Math.min(desired, room);
    if (actual > 0) {
        player.bonusStats[k] += actual;
        player.lvlupChoiceBonusApplied[k] = used + actual;
    }
    return actual;
}

function formatBonusPercent(val) {
    return typeof formatCompactNum === "function" ? formatCompactNum(val, 2) : Number(val).toFixed(2);
}

// Shows the level up popup
const lvlupPopup = () => {
    addCombatLog(`境界突破！（${cultivationRealmLabel(player.lvl - player.exp.lvlGained)} → ${cultivationRealmLabel(player.lvl)}）`);

    // Recover 20% extra hp on level up
    player.stats.hp += Math.round((player.stats.hpMax * 20) / 100);
    playerLoadStats();

    // Show popup choices
    lvlupPanel.style.display = "flex";
    combatPanel.style.filter = "brightness(50%)";
    generateLvlStats(2, LVLUP_CHOICE_BONUS_PER_PICK);
}

// Generates random stats for level up popup
const generateLvlStats = (rerolls, percentages) => {
    let selectedStats = [];
    let stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
    while (selectedStats.length < 3) {
        let randomIndex = Math.floor(Math.random() * stats.length);
        if (!selectedStats.includes(stats[randomIndex])) {
            selectedStats.push(stats[randomIndex]);
        }
    }

    const loadLvlHeader = () => {
        lvlupSelect.innerHTML = `
            <h1>境界突破！</h1>
            <p class="realm-line">${cultivationRealmLabel(player.lvl)}</p>
            <p class="realm-line" style="font-size:12px;opacity:0.88;margin-top:6px;">若当前仍在斗法界面：请先点选一项加护；再点下方战况里的「收纳战利 / 收起斗法」结束战斗。</p>
            <div class="content-head">
                <h4>余烬抉择: ${player.exp.lvlGained}</h4>
                <button id="lvlReroll">溯演 ${rerolls}/2</button>
            </div>
        `;
    }
    loadLvlHeader();

    const lvlReroll = document.querySelector("#lvlReroll");
    lvlReroll.addEventListener("click", function () {
        if (rerolls > 0) {
            rerolls--;
            loadLvlHeader();
            generateLvlStats(rerolls, percentages);
        }
    });

    try {
        for (let i = 0; i < selectedStats.length; i++) {
            const statKey = selectedStats[i];
            const perPick = percentages[statKey];
            ensurePlayerLvlupChoiceBonusApplied();
            var capLc = getLvlupChoiceBonusCapForStat(statKey);
            var usedLc = player.lvlupChoiceBonusApplied[statKey] || 0;
            var nextAddLc = Math.min(perPick, Math.max(0, capLc - usedLc));

            let button = document.createElement("button");
            button.id = "lvlSlot" + i;

            let h3 = document.createElement("h3");
            var statLbl = BONUS_STAT_LABEL_CN[statKey] || statKey;
            h3.innerHTML = statLbl + "加护";
            button.appendChild(h3);

            let p = document.createElement("p");
            var capHint =
                nextAddLc + 1e-9 < perPick
                    ? `（余烬抉择本项已达 <b>${formatBonusPercent(usedLc)}/${formatBonusPercent(capLc)}</b>，满额 <b>${formatBonusPercent(perPick)}%</b> 不可全入）`
                    : `（余烬抉择本项 <b>${formatBonusPercent(usedLc)}/${formatBonusPercent(capLc)}</b>）`;
            p.innerHTML = `机缘加成：${statLbl} +${formatBonusPercent(nextAddLc)}%。${capHint}`;
            button.appendChild(p);

            // Increase the selected stat for player（受「等级×单次最高」累计上限）
            button.addEventListener("click", function () {
                var actual = applyLvlupChoiceBonusOnPick(statKey, perPick);
                if (typeof addCombatLog === "function" && actual + 1e-9 < perPick) {
                    addCombatLog(
                        `<span class="Rare">「${statLbl}」余烬抉择已达当前等级累计上限（${formatBonusPercent(
                            getLvlupChoiceBonusCapForStat(statKey)
                        )}%），本次仅入账 +${formatBonusPercent(actual)}%。</span>`
                    );
                }

                if (player.exp.lvlGained > 1) {
                    player.exp.lvlGained--;
                    generateLvlStats(2, percentages);
                } else {
                    player.exp.lvlGained = 0;
                    lvlupPanel.style.display = "none";
                    combatPanel.style.filter = "brightness(100%)";
                    leveled = false;
                }

                playerLoadStats();
                saveData();
            });

            lvlupSelect.appendChild(button);
        }
    } catch (err) { }
}
