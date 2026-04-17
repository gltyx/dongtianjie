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

const PLAYER_EXP_TIER_MULT = 1.2;
const PLAYER_EXP_TIER_STEP = 10;

function playerExpTierExponentForLevel(lvl) {
    var L = Math.floor(Number(lvl) || 1);
    if (L < PLAYER_EXP_TIER_STEP) return 0;
    return Math.floor((L - PLAYER_EXP_TIER_STEP) / PLAYER_EXP_TIER_STEP) + 1;
}


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
    return 15 + (stage - 1) * 5;
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
    while (player.exp.expCurr >= player.exp.expMax) {
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

// Levels up the player
const playerLvlUp = () => {
    leveled = true;

    // Calculates the excess exp and the new exp required to level up
    var newLvl = Math.max(1, Math.floor(Number(player.lvl) || 1) + 1);
    let expMaxIncrease = Math.floor(((player.exp.expMax * 1.1) + 100) - player.exp.expMax);
    if (player.lvl > 100) {
        expMaxIncrease = 1000000;
    } else if (newLvl <= 100) {
        var tierExp = playerExpTierExponentForLevel(newLvl);
        if (tierExp > 0) {
            expMaxIncrease = Math.max(1, Math.floor(expMaxIncrease * Math.pow(PLAYER_EXP_TIER_MULT, tierExp)));
        }
    }
    let excessExp = player.exp.expCurr - player.exp.expMax;
    player.exp.expCurrLvl = excessExp;
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
                elMaxLvlRow.textContent = `当时修为：${curLvl} 级 · ${sectName}`;
            }
        }
    } catch (e) {}


    player.bonusStats.hp += 8 / 3;
    player.bonusStats.atk += 4 / 3;
    player.bonusStats.def += 4 / 3;
    player.bonusStats.atkSpd += 0.5 / 3;
    player.bonusStats.critRate += 0.2 / 3;
    player.bonusStats.critDmg += 0.5 / 3;
}


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

    if (!url && player && typeof player.avatarDataUrl === "string" && player.avatarDataUrl.length > 20) {
        var ad = player.avatarDataUrl;
        if (ad.indexOf("data:image/") === 0) {
            url = ad;
        }
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
    showEquipment();
    showInventory();
    applyEquipmentStats();
    if (typeof refreshSectPassiveModal === "function") refreshSectPassiveModal();

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
        if (playerInfoElement) {
            if (typeof enemy !== "undefined" && enemy && enemy.molongRaid) {
                if (typeof window.refreshMolongPlayerCombatLines === "function") window.refreshMolongPlayerCombatLines();
            } else {
                playerInfoElement.innerHTML = `<span class="combat-card__pname">${player.name}</span><span class="combat-card__prealm">${cultivationRealmLabel(player.lvl)}</span>`;
            }
        }
        if (typeof refreshCombatTitleFxRow === "function") refreshCombatTitleFxRow();
        if (typeof refreshPetCombatHud === "function") refreshPetCombatHud();
        if (typeof window.refreshMolongCombatHud === "function") window.refreshMolongCombatHud();
    }

    // Header
    syncHudBarAvatar();
    document.querySelector("#player-name").innerHTML = `<i class="fas fa-user"></i><span>${player.name}</span>`;
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
    var gemSum =
        gGem.hp + gGem.atk + gGem.def + gGem.atkSpd + gGem.critDmg;
    var s = function (a, b, c, d, t) {
        var x = Number(d);
        if (!isFinite(x)) x = 0;
        var xt = Number(t);
        if (!isFinite(xt)) xt = 0;
        return (Number(a) + Number(b) + Number(c) + x + xt).toFixed(2).replace(rx, "$1");
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
    if (titleSum > 0) {
        setNote +=
            '<p class="stat-card__note stat-card__note--set">已含<strong>洞天称号</strong>永久机缘（多称号叠加）；展示用称号可在行囊或斗法中切换。</p>';
    }
    document.querySelector("#bonus-stats").innerHTML = `
    <h4 class="card__title">机缘加成</h4>
    <div class="stat-card__body">
    <p><i class="fas fa-heart"></i><span class="stat-card__lbl">气血</span><span class="stat-card__val">+${s(player.bonusStats.hp, sb.hp, petBk.hp, gGem.hp, titleBk.hp)}%</span></p>
    <p><i class="ra ra-sword"></i><span class="stat-card__lbl">力道</span><span class="stat-card__val">+${s(player.bonusStats.atk, sb.atk, petBk.atk, gGem.atk, titleBk.atk)}%</span></p>
    <p><i class="ra ra-round-shield"></i><span class="stat-card__lbl">护体</span><span class="stat-card__val">+${s(player.bonusStats.def, sb.def, petBk.def, gGem.def, titleBk.def)}%</span></p>
    <p><i class="ra ra-plain-dagger"></i><span class="stat-card__lbl">身法</span><span class="stat-card__val">+${s(player.bonusStats.atkSpd, sb.atkSpd, petBk.atkSpd, gGem.atkSpd, titleBk.atkSpd)}%</span></p>
    <p><i class="ra ra-dripping-blade"></i><span class="stat-card__lbl">吸血</span><span class="stat-card__val">+${s(player.bonusStats.vamp, sb.vamp, petBk.vamp, 0, titleBk.vamp)}%</span></p>
    <p><i class="ra ra-lightning-bolt"></i><span class="stat-card__lbl">会心</span><span class="stat-card__val">+${s(player.bonusStats.critRate, sb.critRate, petBk.critRate, 0, titleBk.critRate)}%</span></p>
    <p><i class="ra ra-focused-lightning"></i><span class="stat-card__lbl">暴伤</span><span class="stat-card__val">+${s(player.bonusStats.critDmg, sb.critDmg, petBk.critDmg, gGem.critDmg, titleBk.critDmg)}%</span></p>
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
    openInv.style.filter = "brightness(100%)";
    openInv.style.display = "flex";
    dimDungeon.style.filter = "brightness(50%)";

    sellAllElement.onclick = function () {
        openInv.style.filter = "brightness(50%)";
        let rarity = sellRarityElement.value;

        defaultModalElement.style.display = "flex";
        if (rarity == "All") {
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>典让所有<strong>未锁定</strong>遗器？（已锁定者保留）</p>
                <div class="button-container">
                    <button id="sell-confirm">尽数典让</button>
                    <button id="sell-cancel">作罢</button>
                </div>
            </div>`;
        } else {
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>典让此位阶<span class="${rarity}">${typeof equipmentRarityLabel === "function" ? equipmentRarityLabel(rarity) : rarity}</span>中<strong>未锁定</strong>遗器？（已锁定者保留）</p>
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
        };
        cancel.onclick = function () {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            openInv.style.filter = "brightness(100%)";
        };
    };
    /* 典让品阶：持久化与样式由 equipment.js initInventorySellRarityPersist / syncInventorySellRarityDom 处理 */

    playerLoadStats();
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

function formatBonusPercent(val) {
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    return Number(val).toFixed(2).replace(rx, "$1");
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
    const percentages = {
        "hp": 24 / 3,
        "atk": 16 / 3,
        "def": 16 / 3,
        "atkSpd": 16 / 3,
        "vamp": 5 / 3,
        "critRate": 3 / 3,
        "critDmg": 20 / 3
    };
    generateLvlStats(2, percentages);
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
            let button = document.createElement("button");
            button.id = "lvlSlot" + i;

            let h3 = document.createElement("h3");
            var statLbl = BONUS_STAT_LABEL_CN[selectedStats[i]] || selectedStats[i];
            h3.innerHTML = statLbl + "加护";
            button.appendChild(h3);

            let p = document.createElement("p");
            p.innerHTML = `机缘加成：${statLbl} +${formatBonusPercent(percentages[selectedStats[i]])}%。`;
            button.appendChild(p);

            // Increase the selected stat for player
            button.addEventListener("click", function () {
                player.bonusStats[selectedStats[i]] += percentages[selectedStats[i]];

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
