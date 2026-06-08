/**
 * 洞天劫 · 魔神塔（恶魔高塔）：秘境层/劫数/敌势固定模板、斗法规则与菜单入口。
 */
(function () {
    var DT_DEMON_TOWER_ESC = 3.08;
    /** 魔神塔守关者：固定 10% 闪避（每次闪避回复 10% 气血上限，在 combat 中处理） */
    var DT_DEMON_TOWER_DODGE = 0.1;
    /** 同登龙塔：挑战连点防重复开战 */
    var __dtDemonTowerBattleStarting = false;

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
        clearTimeout(el._dtDemonT);
        el._dtDemonT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    /** 永久机缘：每层 +10% 气血、+5% 护体、+5% 力道（与套装等同类加算） */
    function getDongtianDemonTowerOpportunityBonuses() {
        var n =
            typeof player !== "undefined" && player && typeof player.dongtianDemonTowerBestFloor === "number"
                ? Math.max(0, Math.floor(player.dongtianDemonTowerBestFloor))
                : 0;
        return { hp: n * 10, atk: n * 5, def: n * 5, layers: n };
    }
    window.getDongtianDemonTowerOpportunityBonuses = getDongtianDemonTowerOpportunityBonuses;

    function isDemonTowerCombatEnemy(ent) {
        if (!ent) return false;
        if (ent.bossRole === "demontower") return true;
        if (!ent.demonTower) return false;
        if (ent.demonTower.layer != null) return true;
        return !!(ent.name && String(ent.name).indexOf("【魔神塔") >= 0);
    }
    window.isDemonTowerCombatEnemy = isDemonTowerCombatEnemy;

    /** 灵宠击杀修为分流：每层已通关永久 +5% 获取（在 addPetExp 中乘算） */
    function getDongtianDemonTowerPetExpMultiplier() {
        var n =
            typeof player !== "undefined" && player && typeof player.dongtianDemonTowerBestFloor === "number"
                ? Math.max(0, Math.floor(player.dongtianDemonTowerBestFloor))
                : 0;
        return 1 + n * 0.05;
    }
    window.getDongtianDemonTowerPetExpMultiplier = getDongtianDemonTowerPetExpMultiplier;

    /** 第 L 层：秘境第 (L+2) 层 · 劫 20 · 敌势 3.08；血量在主宰模板基础上再乘 (1 + 0.5*(L+1)) */
    function realmFromDemonTowerLayer(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return L + 2;
    }
    window.demonTowerRealmFromLayer = realmFromDemonTowerLayer;

    function demonTowerHpMult(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = realmFromDemonTowerLayer(L);
        var baseBoss = realm + 4;
        var extra = 0.5 * (L + 1);
        return baseBoss * (1 + extra);
    }

    function rollDemonTowerEnemyDodge() {
        if (typeof enemy === "undefined" || !enemy || !enemy.demonTower) return false;
        return Math.random() < DT_DEMON_TOWER_DODGE;
    }
    window.rollDemonTowerEnemyDodge = rollDemonTowerEnemyDodge;

    function pickDemonTowerDodgeLine() {
        var n = enemy && enemy.name ? String(enemy.name) : "魔神塔守将";
        var lines = [
            `魔纹自塔身蔓延，${n}残影一折，你罡劲贯处如击虚雾——大半真伤被化去。`,
            `劫煞与魔息交织，${n}借塔规挪移，你剑诀落点偏了三分，只擦过一缕黑焰。`,
            `${n}瞳中血芒一闪，身形如烟溃散，你这一式竟只落空处。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
    }
    window.pickDemonTowerDodgeLine = pickDemonTowerDodgeLine;

    /**
     * 构造魔神塔敌人：等同「秘境 realm 层 · 劫 20 · 敌势 3.08」主宰模板，再乘塔层血量系数；属性掷骰固定为均衡型中值；无词条。
     */
    window.buildDemonTowerEnemy = function (layer) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = realmFromDemonTowerLayer(L);
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        window.__dongtianDemonTowerBuilding = L;
        try {
            dungeon.progress.floor = realm;
            dungeon.progress.room = 20;
            dungeon.settings.enemyScaling = DT_DEMON_TOWER_ESC;
            dungeon.enemyMultipliers = dungeon.enemyMultipliers || {
                hp: 1,
                atk: 1,
                def: 1,
                atkSpd: 1,
                vamp: 1,
                critRate: 1,
                critDmg: 1,
            };
            dungeon.enemyMultipliers.hp = demonTowerHpMult(L);
            dungeon.enemyMultipliers.atk = 1;
            dungeon.enemyMultipliers.def = 1;
            dungeon.enemyMultipliers.atkSpd = 1;
            generateRandomEnemy("sboss");
            enemy.bossRole = "demontower";
            enemy.mechanic = null;
            try {
                delete enemy.dragonTower;
            } catch (eClr) {
                enemy.dragonTower = null;
            }
            enemy.demonTower = { layer: L, realm: realm, jie: 20, esc: DT_DEMON_TOWER_ESC, hpMult: demonTowerHpMult(L) };
            var tag = "【魔神塔·" + L + "层】";
            if (enemy.name && String(enemy.name).indexOf("【魔神塔") < 0) {
                enemy.name = tag + enemy.name;
            }
            if (!enemy.rewards || typeof enemy.rewards !== "object") {
                enemy.rewards = { exp: 0, gold: 0, drop: false };
            }
            enemy.rewards.exp = 0;
            enemy.rewards.gold = 0;
            enemy.rewards.drop = false;
        } finally {
            window.__dongtianDemonTowerBuilding = null;
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
                typeof player !== "undefined" && player && typeof player.dongtianDemonTowerBestFloor === "number"
                    ? Math.max(0, Math.floor(player.dongtianDemonTowerBestFloor))
                    : 0;
            return Promise.resolve({ ok: true, bestFloor: bf, nextFloor: bf + 1 });
        }
        return api("GET", "/api/dongtian-demon-tower/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "魔神塔状态失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianDemonTowerBestFloor = Math.max(0, Math.floor(Number(res.bestFloor) || 0));
            }
            return res;
        });
    }

    function recordClear(floor) {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof player !== "undefined" && player) {
                var cur = Math.max(0, Math.floor(Number(player.dongtianDemonTowerBestFloor) || 0));
                if (floor === cur + 1) {
                    player.dongtianDemonTowerBestFloor = floor;
                }
            }
            if (typeof saveData === "function") saveData();
            return Promise.resolve({ ok: true, bestFloor: floor });
        }
        return api("POST", "/api/dongtian-demon-tower/clear-floor", { floor: floor }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "魔神塔记录失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianDemonTowerBestFloor = Math.floor(Number(res.bestFloor) || 0);
            }
            if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                window.dongtianSyncRevisionFromApiResponse(res);
            }
            if (typeof calculateStats === "function") calculateStats();
            return res;
        });
    }

    function beginDemonTowerBattle(layer) {
        if (__dtDemonTowerBattleStarting) {
            return;
        }
        if (typeof player === "undefined" || !player || player.inCombat) {
            toast("当前无法开战", true);
            return;
        }
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("魔神塔");
            }
            return;
        }
        __dtDemonTowerBattleStarting = true;
        window.__dtDemonTowerVictoryCommitted = false;
        window.__dtTowerCombatActive = "demon";
        try {
            ensureDongtianHubMenuClosed();
            closeDemonTowerModal();
            try {
                buildDemonTowerEnemy(layer);
            } catch (e) {
                window.__dtTowerCombatActive = null;
                toast(e.message || String(e), true);
                return;
            }
            window.__dtDemonTowerPendingFloor = layer;
            if (typeof calculateStats === "function") calculateStats();
            if (typeof showCombatInfo === "function") showCombatInfo();
            if (typeof startCombat === "function") startCombat();
            try {
                addCombatLog(
                    '<span class="Legendary">魔神塔 · 第 ' +
                        layer +
                        " 层</span>：魔煞凝形，等同秘境第 " +
                        realmFromDemonTowerLayer(layer) +
                        " 层劫主、敌势 " +
                        DT_DEMON_TOWER_ESC +
                        "。塔规——吸血与身法机缘各至多 <b>1%</b> 生效；守将闪避 10%，闪避时回复自身气血；切莫大意。"
                );
            } catch (eL) {}
        } finally {
            __dtDemonTowerBattleStarting = false;
        }
    }
    window.beginDemonTowerBattle = beginDemonTowerBattle;

    window.__dtDemonTowerPendingFloor = null;
    window.__dtDemonTowerVictoryCommitted = false;
    window.__dtDemonTowerCommitPromise = null;

    function refreshDemonTowerModalIfOpen() {
        var modal = document.getElementById("dongtianDemonTowerModal");
        if (!modal || modal.style.display === "none") return Promise.resolve();
        return pullState()
            .then(renderTowerModal)
            .catch(function () {
                return Promise.resolve();
            });
    }

    window.commitDemonTowerVictoryIfPending = function () {
        if (window.__dtDemonTowerVictoryCommitted) {
            return refreshDemonTowerModalIfOpen().then(function () {
                return { ok: true, alreadyCommitted: true };
            });
        }
        var fl = window.__dtDemonTowerPendingFloor;
        if (fl == null) return Promise.resolve();
        if (window.__dtDemonTowerCommitPromise) return window.__dtDemonTowerCommitPromise;
        var layer = Math.max(1, Math.floor(Number(fl) || 1));
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        window.__dtDemonTowerCommitPromise = recordClear(layer)
            .then(function (res) {
                window.__dtDemonTowerVictoryCommitted = true;
                window.__dtDemonTowerPendingFloor = null;
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
                var srvMsg = (res && res.message) || "第 " + layer + " 层已记入魔神塔机缘";
                if (!res || !res.alreadyCommitted) {
                    if (typeof addDungeonLog === "function") {
                        addDungeonLog(
                            '<span class="Legendary">【魔神塔·服务端】</span>' +
                                srvMsg +
                                " · <span class=\"Epic\">神锻真力 +5</span>（永久机缘：气血+10%、护体+5%、力道+5%，灵宠击杀修为分流+5%）"
                        );
                        if (typeof updateDungeonLog === "function") updateDungeonLog();
                    }
                    toast(
                        "第 " +
                            layer +
                            " 层通关：永久机缘气血+10%、护体+5%、力道+5%；灵宠击杀修为分流永久+5%。",
                        false
                    );
                }
                return syncP.then(function () {
                    return pullState().then(function (st) {
                        return refreshDemonTowerModalIfOpen().then(function () {
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
                window.__dtDemonTowerCommitPromise = null;
            });
        return window.__dtDemonTowerCommitPromise;
    };

    window.onDemonTowerBattleWinClose = function () {
        return window.commitDemonTowerVictoryIfPending().then(function (res) {
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
        var bk = getDongtianDemonTowerOpportunityBonuses();
        var petM = getDongtianDemonTowerPetExpMultiplier();
        var line = document.getElementById("dtDemonTowerStatusLine");
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
                "%；灵宠经验分流×" +
                petM.toFixed(2) +
                "。";
        }
        var btn = document.getElementById("dtDemonTowerChallengeBtn");
        if (btn) {
            btn.textContent = "挑战第 " + next + " 层";
            btn.setAttribute("data-floor", String(next));
            var jieLocked =
                typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
            btn.disabled = !!jieLocked;
            if (jieLocked) {
                var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
                btn.setAttribute("title", "劫数≥" + lim + " 时不可挑战魔神塔");
            } else {
                btn.removeAttribute("title");
            }
        }
    }

    function openDemonTowerModal() {
        var modal = document.getElementById("dongtianDemonTowerModal");
        if (!modal) return;
        modal.style.display = "flex";
        pullState()
            .then(renderTowerModal)
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeDemonTowerModal() {
        var modal = document.getElementById("dongtianDemonTowerModal");
        if (modal) modal.style.display = "none";
    }

    window.openDemonTowerModal = openDemonTowerModal;
    window.closeDemonTowerModal = closeDemonTowerModal;

    function ensureDongtianHubMenuClosed() {
        if (typeof window.closeDongtianHubMenuModal === "function") {
            window.closeDongtianHubMenuModal();
            return;
        }
        var hub = document.getElementById("dongtianHubMenuModal");
        if (hub) hub.style.display = "none";
    }

    window.closeDongtianHubMenuForDemonTowerCombat = function () {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return;
        try {
            hub.style.setProperty("display", "none", "important");
        } catch (eImp) {
            hub.style.display = "none";
        }
    };

    window.initDongtianDemonTowerUI = function () {
        var toTower = document.getElementById("dongtianHubMenuDemonTowerBtn");
        if (toTower && !toTower._dtDemonBound) {
            toTower._dtDemonBound = true;
            toTower.onclick = function () {
                if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
                    if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                        window.dongtianHubHighJieBlockAlert("魔神塔");
                    }
                    return;
                }
                ensureDongtianHubMenuClosed();
                openDemonTowerModal();
            };
        }
        var closeBtn = document.getElementById("dongtianDemonTowerCloseBtn");
        if (closeBtn && !closeBtn._dtDemonBound) {
            closeBtn._dtDemonBound = true;
            closeBtn.onclick = closeDemonTowerModal;
        }
        var refBtn = document.getElementById("dtDemonTowerRefreshBtn");
        if (refBtn && !refBtn._dtDemonBound) {
            refBtn._dtDemonBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(renderTowerModal)
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        var chBtn = document.getElementById("dtDemonTowerChallengeBtn");
        if (chBtn && !chBtn._dtDemonBound) {
            chBtn._dtDemonBound = true;
            chBtn.onclick = function () {
                var f = Math.max(1, Math.floor(Number(chBtn.getAttribute("data-floor")) || 1));
                beginDemonTowerBattle(f);
            };
        }
    };
})();
