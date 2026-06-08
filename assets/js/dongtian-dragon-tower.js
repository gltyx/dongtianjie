/**
 * 洞天劫 · 登龙塔：秘境层/劫数/敌势固定模板、斗法规则与菜单入口。
 */
(function () {
    var DT_DRAGON_TOWER_ESC = 2.08;
    var DT_DRAGON_TOWER_DODGE = 0.6;
    /** 防止挑战连点：重复 build/startCombat 会叠两套出手计时与 resume 链，斗法界面卡住 */
    var __dtDragonTowerBattleStarting = false;

    function api(method, path, body) {
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return req(method, path, body, true);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function toast(msg, isErr) {
        var el = document.getElementById("xiuMarketToast");
        if (!el) {
            if (isErr) alert(msg);
            return;
        }
        el.textContent = msg;
        el.style.display = "block";
        el.classList.toggle("xiu-market-toast--err", !!isErr);
        clearTimeout(el._dtTowerT);
        el._dtTowerT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    /** 永久机缘：每层 +3% 气血、+2% 护体、+2% 力道（与套装等同类加算） */
    function getDongtianDragonTowerOpportunityBonuses() {
        var n =
            typeof player !== "undefined" && player && typeof player.dongtianDragonTowerBestFloor === "number"
                ? Math.max(0, Math.floor(player.dongtianDragonTowerBestFloor))
                : 0;
        return { hp: n * 3, atk: n * 2, def: n * 2, layers: n };
    }
    window.getDongtianDragonTowerOpportunityBonuses = getDongtianDragonTowerOpportunityBonuses;

    /** 斗法结算：优先认 dragonTower.layer，避免名前缀被剥后误判为秘境战 */
    function isDragonTowerCombatEnemy(ent) {
        if (!ent) return false;
        if (ent.bossRole === "dragonspire") return true;
        if (!ent.dragonTower) return false;
        if (ent.dragonTower.layer != null) return true;
        return !!(ent.name && String(ent.name).indexOf("【龙塔") >= 0);
    }
    window.isDragonTowerCombatEnemy = isDragonTowerCombatEnemy;

    /** 龙塔/魔神塔进行中（含胜后待离开）：勿走秘境随机敌、斩杀掉落与 tick 遇敌 */
    function isDongtianTowerCombatSession(ent) {
        if (
            window.__dtDragonTowerPendingFloor != null ||
            window.__dtDemonTowerPendingFloor != null ||
            window.__dtDivineRealmPendingFloor != null ||
            window.__dtSpiritBeastPendingFloor != null ||
            window.__dtGhostRealmPendingFloor != null
        ) {
            return true;
        }
        if (
            window.__dtTowerCombatActive === "dragon" ||
            window.__dtTowerCombatActive === "demon" ||
            window.__dtTowerCombatActive === "divine" ||
            window.__dtTowerCombatActive === "spiritbeast" ||
            window.__dtTowerCombatActive === "ghost"
        ) {
            return true;
        }
        var e = ent || (typeof enemy !== "undefined" ? enemy : null);
        if (isDragonTowerCombatEnemy(e)) return true;
        if (typeof window.isDemonTowerCombatEnemy === "function" && window.isDemonTowerCombatEnemy(e)) return true;
        if (typeof window.isDivineRealmCombatEnemy === "function" && window.isDivineRealmCombatEnemy(e)) return true;
        if (typeof window.isSpiritBeastRealmCombatEnemy === "function" && window.isSpiritBeastRealmCombatEnemy(e))
            return true;
        if (typeof window.isGhostRealmCombatEnemy === "function" && window.isGhostRealmCombatEnemy(e)) return true;
        return false;
    }
    window.isDongtianTowerCombatSession = isDongtianTowerCombatSession;

    window.clearDongtianTowerCombatSessionFlags = function () {
        window.__dtTowerCombatActive = null;
    };

    /** 斗法结算按钮文案/点击：勿仅读 enemy 塔标（endCombat 后已剥除） */
    function dongtianTowerVictoryButtonKind() {
        if (window.__dtTowerCombatActive === "demon") return "demon";
        if (window.__dtTowerCombatActive === "dragon") return "dragon";
        if (window.__dtTowerCombatActive === "divine") return "divine";
        if (window.__dtTowerCombatActive === "spiritbeast") return "spiritbeast";
        if (window.__dtTowerCombatActive === "ghost") return "ghost";
        if (window.__dtDemonTowerPendingFloor != null) return "demon";
        if (window.__dtDragonTowerPendingFloor != null) return "dragon";
        if (window.__dtDivineRealmPendingFloor != null) return "divine";
        if (window.__dtSpiritBeastPendingFloor != null) return "spiritbeast";
        if (window.__dtGhostRealmPendingFloor != null) return "ghost";
        var e = typeof enemy !== "undefined" ? enemy : null;
        if (isDragonTowerCombatEnemy(e)) return "dragon";
        if (typeof window.isDemonTowerCombatEnemy === "function" && window.isDemonTowerCombatEnemy(e)) {
            return "demon";
        }
        if (typeof window.isDivineRealmCombatEnemy === "function" && window.isDivineRealmCombatEnemy(e)) {
            return "divine";
        }
        if (typeof window.isSpiritBeastRealmCombatEnemy === "function" && window.isSpiritBeastRealmCombatEnemy(e)) {
            return "spiritbeast";
        }
        if (typeof window.isGhostRealmCombatEnemy === "function" && window.isGhostRealmCombatEnemy(e)) {
            return "ghost";
        }
        return null;
    }
    window.dongtianTowerVictoryButtonKind = dongtianTowerVictoryButtonKind;

    function realmAndRoomFromLayer(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = Math.ceil(L / 10);
        var jie = L % 10 === 0 ? 20 : 19;
        var isBoss = jie === 20;
        var hpMult = isBoss ? realm + 4 : realm + 3;
        return { realm: realm, jie: jie, isBoss: isBoss, hpMult: hpMult };
    }
    window.dragonTowerRealmAndRoomFromLayer = realmAndRoomFromLayer;

    function rollDragonTowerEnemyDodge() {
        if (typeof enemy === "undefined" || !enemy || !enemy.dragonTower) return false;
        return Math.random() < DT_DRAGON_TOWER_DODGE;
    }
    window.rollDragonTowerEnemyDodge = rollDragonTowerEnemyDodge;

    function pickDragonTowerDodgeLine() {
        var n = enemy && enemy.name ? String(enemy.name) : "守塔劫灵";
        var lines = [
            `塔内龙禁流转，${n}身化九道虚影，你罡劲贯处竟如击水月——劲力大半落空。`,
            `劫纹自塔壁亮起，${n}借龙气挪移，你这一式只擦过残影，真伤十不存一。`,
            `${n}龙息一卷，空间微褶，你剑诀落点偏了半寸，对方已遁出杀伤之外。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
    }
    window.pickDragonTowerDodgeLine = pickDragonTowerDodgeLine;

    /**
     * 构造龙塔敌人：等同「秘境 realm 层 · 劫 jie · 敌势 2.08」，再乘血量倍率；无词条/凡物品阶。
     */
    window.buildDragonTowerEnemy = function (layer) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var spec = realmAndRoomFromLayer(layer);
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        window.__dongtianDragonTowerBuilding = layer;
        try {
            dungeon.progress.floor = spec.realm;
            dungeon.progress.room = spec.jie;
            dungeon.settings.enemyScaling = DT_DRAGON_TOWER_ESC;
            dungeon.enemyMultipliers = dungeon.enemyMultipliers || {
                hp: 1,
                atk: 1,
                def: 1,
                atkSpd: 1,
                vamp: 1,
                critRate: 1,
                critDmg: 1,
            };
            dungeon.enemyMultipliers.hp = spec.hpMult;
            dungeon.enemyMultipliers.atk = 1;
            dungeon.enemyMultipliers.def = 1;
            dungeon.enemyMultipliers.atkSpd = 1;
            generateRandomEnemy(spec.isBoss ? "sboss" : undefined);
            if (spec.isBoss) {
                enemy.bossRole = "dragonspire";
            } else {
                enemy.bossRole = null;
            }
            try {
                delete enemy.demonTower;
            } catch (eClr) {
                enemy.demonTower = null;
            }
            enemy.dragonTower = { layer: layer, realm: spec.realm, jie: spec.jie, hpMult: spec.hpMult };
            var tag = "【龙塔·" + layer + "层】";
            if (enemy.name && String(enemy.name).indexOf("【龙塔") < 0) {
                enemy.name = tag + enemy.name;
            }
            if (!enemy.rewards || typeof enemy.rewards !== "object") {
                enemy.rewards = { exp: 0, gold: 0, drop: false };
            }
            enemy.rewards.exp = 0;
            enemy.rewards.gold = 0;
            enemy.rewards.drop = false;
        } finally {
            window.__dongtianDragonTowerBuilding = null;
            dungeon.progress.floor = floorBak;
            dungeon.progress.room = roomBak;
            dungeon.settings.enemyScaling = scaleBak;
            if (emBak) dungeon.enemyMultipliers = emBak;
            else delete dungeon.enemyMultipliers;
        }
    };

    function pullState() {
        if (!window.DONGTIAN_CLOUD_MODE) {
            var bf =
                typeof player !== "undefined" && player && typeof player.dongtianDragonTowerBestFloor === "number"
                    ? Math.max(0, Math.floor(player.dongtianDragonTowerBestFloor))
                    : 0;
            return Promise.resolve({ ok: true, bestFloor: bf, nextFloor: bf + 1 });
        }
        return api("GET", "/api/dongtian-dragon-tower/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "龙塔状态失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianDragonTowerBestFloor = Math.max(0, Math.floor(Number(res.bestFloor) || 0));
            }
            return res;
        });
    }

    function recordClear(floor) {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof player !== "undefined" && player) {
                var cur = Math.max(0, Math.floor(Number(player.dongtianDragonTowerBestFloor) || 0));
                if (floor === cur + 1) {
                    player.dongtianDragonTowerBestFloor = floor;
                }
            }
            if (typeof saveData === "function") saveData();
            return Promise.resolve({ ok: true, bestFloor: floor });
        }
        return api("POST", "/api/dongtian-dragon-tower/clear-floor", { floor: floor }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "龙塔记录失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianDragonTowerBestFloor = Math.floor(Number(res.bestFloor) || 0);
            }
            if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                window.dongtianSyncRevisionFromApiResponse(res);
            }
            if (typeof calculateStats === "function") calculateStats();
            return res;
        });
    }

    function beginDragonTowerBattle(layer) {
        if (__dtDragonTowerBattleStarting) {
            return;
        }
        if (typeof player === "undefined" || !player || player.inCombat) {
            toast("当前无法开战", true);
            return;
        }
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("登龙塔");
            }
            return;
        }
        __dtDragonTowerBattleStarting = true;
        window.__dtDragonTowerVictoryCommitted = false;
        window.__dtTowerCombatActive = "dragon";
        try {
            ensureDongtianHubMenuClosed();
            closeDragonTowerModal();
            try {
                buildDragonTowerEnemy(layer);
            } catch (e) {
                window.__dtTowerCombatActive = null;
                toast(e.message || String(e), true);
                return;
            }
            window.__dtDragonTowerPendingFloor = layer;
            if (typeof calculateStats === "function") calculateStats();
            if (typeof showCombatInfo === "function") showCombatInfo();
            if (typeof startCombat === "function") startCombat();
            try {
                addCombatLog(
                    '<span class="Legendary">登龙塔 · 第 ' +
                        layer +
                        " 层</span>：劫气凝为敌形，敌势 " +
                        DT_DRAGON_TOWER_ESC +
                        "，塔规所限——吸血至多十成生效、身法机缘至多三成；守劫者闪避奇高，切莫大意。"
                );
            } catch (eL) {}
        } finally {
            __dtDragonTowerBattleStarting = false;
        }
    }
    window.beginDragonTowerBattle = beginDragonTowerBattle;

    window.__dtDragonTowerPendingFloor = null;
    window.__dtDragonTowerVictoryCommitted = false;
    window.__dtDragonTowerCommitPromise = null;

    function refreshDragonTowerModalIfOpen() {
        var modal = document.getElementById("dongtianDragonTowerModal");
        if (!modal || modal.style.display === "none") return Promise.resolve();
        return pullState()
            .then(renderTowerModal)
            .catch(function () {
                return Promise.resolve();
            });
    }

    window.commitDragonTowerVictoryIfPending = function () {
        if (window.__dtDragonTowerVictoryCommitted) {
            return refreshDragonTowerModalIfOpen().then(function () {
                return { ok: true, alreadyCommitted: true };
            });
        }
        var fl = window.__dtDragonTowerPendingFloor;
        if (fl == null) return Promise.resolve();
        if (window.__dtDragonTowerCommitPromise) return window.__dtDragonTowerCommitPromise;
        var layer = Math.max(1, Math.floor(Number(fl) || 1));
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        window.__dtDragonTowerCommitPromise = recordClear(layer)
            .then(function (res) {
                window.__dtDragonTowerVictoryCommitted = true;
                window.__dtDragonTowerPendingFloor = null;
                if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                    window.dongtianSyncRevisionFromApiResponse(res);
                }
                if (typeof calculateStats === "function") calculateStats();
                var syncP = Promise.resolve();
                if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianReloadSaveAfterServerGrant === "function") {
                    syncP = window.dongtianReloadSaveAfterServerGrant();
                } else if (typeof saveData === "function") {
                    saveData({ forceCloud: true, playerMutation: true });
                }
                var srvMsg = (res && res.message) || "第 " + layer + " 层已记入龙塔机缘";
                if (!res || !res.alreadyCommitted) {
                    if (typeof addDungeonLog === "function") {
                        addDungeonLog(
                            '<span class="Legendary">【登龙塔·服务端】</span>' +
                                srvMsg +
                                " · <span class=\"Epic\">神锻真力 +1</span>（永久机缘：气血+3%、护体+2%、力道+2%）"
                        );
                        if (typeof updateDungeonLog === "function") updateDungeonLog();
                    }
                    toast("第 " + layer + " 层通关：永久机缘已叠（气血+3%、护体+2%、力道+2%）。", false);
                }
                return syncP.then(function () {
                    return pullState().then(function (st) {
                        return refreshDragonTowerModalIfOpen().then(function () {
                            return res || st;
                        });
                    });
                });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
                throw e;
            })
            .finally(function () {
                window.__dtDragonTowerCommitPromise = null;
            });
        return window.__dtDragonTowerCommitPromise;
    };

    window.onDragonTowerBattleWinClose = function () {
        return window.commitDragonTowerVictoryIfPending().then(function (res) {
            if (typeof pullState === "function") {
                return pullState().then(renderTowerModal).then(function () {
                    return res;
                });
            }
            return res;
        });
    };

    function renderTowerModal(state) {
        var best = state && state.bestFloor != null ? Math.floor(Number(state.bestFloor) || 0) : 0;
        var next = state && state.nextFloor != null ? Math.floor(Number(state.nextFloor) || 1) : best + 1;
        var bk = getDongtianDragonTowerOpportunityBonuses();
        var line = document.getElementById("dtDragonTowerStatusLine");
        if (line) {
            line.textContent =
                "已通关最高 " +
                best +
                " 层 · 当前可挑战第 " +
                next +
                " 层（层数无上限）。永久机缘累计：气血 +" +
                bk.hp +
                "%，护体 +" +
                bk.def +
                "%，力道 +" +
                bk.atk +
                "%。";
        }
        var btn = document.getElementById("dtDragonTowerChallengeBtn");
        if (btn) {
            btn.textContent = "挑战第 " + next + " 层";
            btn.setAttribute("data-floor", String(next));
            var jieLocked =
                typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
            btn.disabled = !!jieLocked;
            if (jieLocked) {
                var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
                btn.setAttribute("title", "劫数≥" + lim + " 时不可挑战登龙塔");
            } else {
                btn.removeAttribute("title");
            }
        }
    }

    function openDragonTowerModal() {
        var modal = document.getElementById("dongtianDragonTowerModal");
        if (!modal) return;
        modal.style.display = "flex";
        pullState()
            .then(renderTowerModal)
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeDragonTowerModal() {
        var modal = document.getElementById("dongtianDragonTowerModal");
        if (modal) modal.style.display = "none";
    }

    window.openDragonTowerModal = openDragonTowerModal;
    window.closeDragonTowerModal = closeDragonTowerModal;

    function ensureDongtianHubMenuClosed() {
        if (typeof window.closeDongtianHubMenuModal === "function") {
            window.closeDongtianHubMenuModal();
            return;
        }
        var hub = document.getElementById("dongtianHubMenuModal");
        if (hub) hub.style.display = "none";
    }

    /** 龙塔斗法：强制压掉洞天菜单（避免与其它层叠上下文叠加后仍露在斗法之上） */
    window.closeDongtianHubMenuForDragonCombat = function () {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return;
        try {
            hub.style.setProperty("display", "none", "important");
        } catch (eImp) {
            hub.style.display = "none";
        }
    };

    window.initDongtianDragonTowerUI = function () {
        var toTower = document.getElementById("dongtianHubMenuDragonTowerBtn");
        if (toTower && !toTower._dtTowerBound) {
            toTower._dtTowerBound = true;
            toTower.onclick = function () {
                if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
                    if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                        window.dongtianHubHighJieBlockAlert("登龙塔");
                    }
                    return;
                }
                ensureDongtianHubMenuClosed();
                openDragonTowerModal();
            };
        }
        var closeBtn = document.getElementById("dongtianDragonTowerCloseBtn");
        if (closeBtn && !closeBtn._dtTowerBound) {
            closeBtn._dtTowerBound = true;
            closeBtn.onclick = closeDragonTowerModal;
        }
        var refBtn = document.getElementById("dtDragonTowerRefreshBtn");
        if (refBtn && !refBtn._dtTowerBound) {
            refBtn._dtTowerBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(renderTowerModal)
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        var chBtn = document.getElementById("dtDragonTowerChallengeBtn");
        if (chBtn && !chBtn._dtTowerBound) {
            chBtn._dtTowerBound = true;
            chBtn.onclick = function () {
                var f = Math.max(1, Math.floor(Number(chBtn.getAttribute("data-floor")) || 1));
                beginDragonTowerBattle(f);
            };
        }
    };
})();
