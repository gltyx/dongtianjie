/**
 * 洞天劫 · 神界：秘境层/劫数/敌势固定模板、仙气斗法规制与菜单入口。
 */
(function () {
    var DT_DIVINE_REALM_ESC = 4.08;
    var DT_DIVINE_REALM_DODGE = 0.1;
    var DT_DIVINE_REALM_STUN_CHANCE = 0.1;
    var DT_DIVINE_REALM_STUN_MS = 1000;
    var __dtDivineRealmBattleStarting = false;

    var DIVINE_REALM_BOSS_NAMES = [
        "天罡执法使",
        "九霄镇守仙",
        "紫宸巡界将",
        "太虚护法神",
        "星河劫卫",
        "凌霄御灵",
        "玄天上尊化身",
        "混沌天门守",
        "琉璃天阙将",
        "鸿蒙道劫灵",
        "云阙执律仙",
        "金乌巡天将",
        "碧落护道尊",
        "青鸾镇界灵",
        "赤霄斩劫使",
    ];

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
        clearTimeout(el._dtDivineT);
        el._dtDivineT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function getBestFloor() {
        return typeof player !== "undefined" && player && typeof player.dongtianDivineRealmBestFloor === "number"
            ? Math.max(0, Math.floor(player.dongtianDivineRealmBestFloor))
            : 0;
    }

    /** 永久机缘：每层 +40% 气血、+20% 护体、+20% 力道 */
    function getDongtianDivineRealmOpportunityBonuses() {
        var n = getBestFloor();
        return { hp: n * 40, atk: n * 20, def: n * 20, layers: n };
    }
    window.getDongtianDivineRealmOpportunityBonuses = getDongtianDivineRealmOpportunityBonuses;

    function isDivineRealmCombatEnemy(ent) {
        if (!ent) return false;
        if (ent.bossRole === "divinerealm") return true;
        if (!ent.divineRealm) return false;
        if (ent.divineRealm.layer != null) return true;
        return !!(ent.name && String(ent.name).indexOf("【神界") >= 0);
    }
    window.isDivineRealmCombatEnemy = isDivineRealmCombatEnemy;

    function getDongtianDivineRealmPetExpMultiplier() {
        var n = getBestFloor();
        return 1 + n * 0.1;
    }
    window.getDongtianDivineRealmPetExpMultiplier = getDongtianDivineRealmPetExpMultiplier;

    /** 第 L 层：秘境第 L×3 层 · 劫 20 · 敌势 4.08 */
    function realmFromDivineLayer(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return L * 3;
    }
    window.divineRealmFromLayer = realmFromDivineLayer;

    function divineRealmHpMult(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = realmFromDivineLayer(L);
        var baseBoss = realm + 4;
        var extra = 0.5 * (L + 1);
        return baseBoss * (1 + extra);
    }

    function pickDivineRealmBossName(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return DIVINE_REALM_BOSS_NAMES[(L - 1) % DIVINE_REALM_BOSS_NAMES.length];
    }

    function rollDivineRealmEnemyDodge() {
        if (typeof enemy === "undefined" || !enemy || !enemy.divineRealm) return false;
        return Math.random() < DT_DIVINE_REALM_DODGE;
    }
    window.rollDivineRealmEnemyDodge = rollDivineRealmEnemyDodge;

    function pickDivineRealmDodgeLine() {
        var n = enemy && enemy.name ? String(enemy.name) : "神界守将";
        var lines = [
            `天律流转，${n}身化云霞，你罡劲贯处如击空冥——真伤大半化于无形。`,
            `九霄仙纹亮起，${n}借天规挪移，你剑诀落点偏了半寸，只擦过一缕瑞光。`,
            `${n}袖中云篆一闪，身形若羽飘散，你这一式竟只落空处。`,
            `琉璃天光一折，${n}遁入虚境，你劲力贯处只剩袅袅仙雾。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
    }
    window.pickDivineRealmDodgeLine = pickDivineRealmDodgeLine;

    function rollDivineRealmEnemyStun() {
        if (typeof enemy === "undefined" || !enemy || !enemy.divineRealm) return false;
        return Math.random() < DT_DIVINE_REALM_STUN_CHANCE;
    }
    window.rollDivineRealmEnemyStun = rollDivineRealmEnemyStun;

    window.isDivineRealmPlayerStunned = function () {
        var until = window.__dtDivineRealmPlayerStunnedUntil;
        return typeof until === "number" && isFinite(until) && Date.now() < until;
    };

    window.getDivineRealmStunRemainMs = function () {
        var until = window.__dtDivineRealmPlayerStunnedUntil;
        if (typeof until !== "number" || !isFinite(until)) return 0;
        return Math.max(0, until - Date.now());
    };

    window.applyDivineRealmStunToPlayer = function () {
        window.__dtDivineRealmPlayerStunnedUntil = Date.now() + DT_DIVINE_REALM_STUN_MS;
    };

    window.buildDivineRealmEnemy = function (layer) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = realmFromDivineLayer(L);
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        window.__dongtianDivineRealmBuilding = L;
        try {
            dungeon.progress.floor = realm;
            dungeon.progress.room = 20;
            dungeon.settings.enemyScaling = DT_DIVINE_REALM_ESC;
            dungeon.enemyMultipliers = dungeon.enemyMultipliers || {
                hp: 1,
                atk: 1,
                def: 1,
                atkSpd: 1,
                vamp: 1,
                critRate: 1,
                critDmg: 1,
            };
            dungeon.enemyMultipliers.hp = divineRealmHpMult(L);
            dungeon.enemyMultipliers.atk = 1;
            dungeon.enemyMultipliers.def = 1;
            dungeon.enemyMultipliers.atkSpd = 1;
            generateRandomEnemy("sboss");
            enemy.bossRole = "divinerealm";
            enemy.mechanic = null;
            try {
                delete enemy.dragonTower;
                delete enemy.demonTower;
            } catch (eClr) {
                enemy.dragonTower = null;
                enemy.demonTower = null;
            }
            enemy.divineRealm = {
                layer: L,
                realm: realm,
                jie: 20,
                esc: DT_DIVINE_REALM_ESC,
                hpMult: divineRealmHpMult(L),
            };
            enemy.name = "【神界·" + L + "层】" + pickDivineRealmBossName(L);
            if (!enemy.rewards || typeof enemy.rewards !== "object") {
                enemy.rewards = { exp: 0, gold: 0, drop: false };
            }
            enemy.rewards.exp = 0;
            enemy.rewards.gold = 0;
            enemy.rewards.drop = false;
        } finally {
            window.__dongtianDivineRealmBuilding = null;
            dungeon.progress.floor = floorBak;
            dungeon.progress.room = roomBak;
            dungeon.settings.enemyScaling = scaleBak;
            if (emBak) dungeon.enemyMultipliers = emBak;
            else delete dungeon.enemyMultipliers;
        }
    };

    function pullState() {
        if (!window.DONGTIAN_CLOUD_MODE) {
            var bf = getBestFloor();
            return Promise.resolve({ ok: true, bestFloor: bf, nextFloor: bf + 1 });
        }
        return api("GET", "/api/dongtian-divine-realm/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "神界状态失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianDivineRealmBestFloor = Math.max(0, Math.floor(Number(res.bestFloor) || 0));
            }
            return res;
        });
    }

    function recordClear(floor) {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof player !== "undefined" && player) {
                var cur = getBestFloor();
                if (floor === cur + 1) {
                    player.dongtianDivineRealmBestFloor = floor;
                }
            }
            if (typeof saveData === "function") saveData();
            return Promise.resolve({ ok: true, bestFloor: floor });
        }
        return api("POST", "/api/dongtian-divine-realm/clear-floor", { floor: floor }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "神界记录失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianDivineRealmBestFloor = Math.floor(Number(res.bestFloor) || 0);
            }
            if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                window.dongtianSyncRevisionFromApiResponse(res);
            }
            if (typeof calculateStats === "function") calculateStats();
            return res;
        });
    }

    function beginDivineRealmBattle(layer) {
        if (__dtDivineRealmBattleStarting) return;
        if (typeof player === "undefined" || !player || player.inCombat) {
            toast("当前无法开战", true);
            return;
        }
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("神界");
            }
            return;
        }
        __dtDivineRealmBattleStarting = true;
        window.__dtDivineRealmVictoryCommitted = false;
        window.__dtDivineRealmPlayerStunnedUntil = 0;
        window.__dtTowerCombatActive = "divine";
        try {
            ensureDongtianHubMenuClosed();
            closeDivineRealmModal();
            try {
                buildDivineRealmEnemy(layer);
            } catch (e) {
                window.__dtTowerCombatActive = null;
                toast(e.message || String(e), true);
                return;
            }
            window.__dtDivineRealmPendingFloor = layer;
            if (typeof calculateStats === "function") calculateStats();
            if (typeof showCombatInfo === "function") showCombatInfo();
            if (typeof startCombat === "function") startCombat();
            try {
                addCombatLog(
                    '<span class="Legendary">神界 · 第 ' +
                        layer +
                        " 层</span>：仙律凝形，等同秘境第 " +
                        realmFromDivineLayer(layer) +
                        " 层劫主、敌势 " +
                        DT_DIVINE_REALM_ESC +
                        "。天规——吸血机缘至多 <b>0.001%</b>、身法至多 <b>0.1%</b>；守将闪避 10% 且闪避回血 10%，攻有 10% 击晕你一息。"
                );
            } catch (eL) {}
        } finally {
            __dtDivineRealmBattleStarting = false;
        }
    }
    window.beginDivineRealmBattle = beginDivineRealmBattle;

    window.__dtDivineRealmPendingFloor = null;
    window.__dtDivineRealmVictoryCommitted = false;
    window.__dtDivineRealmCommitPromise = null;

    function refreshDivineRealmModalIfOpen() {
        var modal = document.getElementById("dongtianDivineRealmModal");
        if (!modal || modal.style.display === "none") return Promise.resolve();
        return pullState()
            .then(renderTowerModal)
            .catch(function () {
                return Promise.resolve();
            });
    }

    window.commitDivineRealmVictoryIfPending = function () {
        if (window.__dtDivineRealmVictoryCommitted) {
            return refreshDivineRealmModalIfOpen().then(function () {
                return { ok: true, alreadyCommitted: true };
            });
        }
        var fl = window.__dtDivineRealmPendingFloor;
        if (fl == null) return Promise.resolve();
        if (window.__dtDivineRealmCommitPromise) return window.__dtDivineRealmCommitPromise;
        var layer = Math.max(1, Math.floor(Number(fl) || 1));
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        window.__dtDivineRealmCommitPromise = recordClear(layer)
            .then(function (res) {
                window.__dtDivineRealmVictoryCommitted = true;
                window.__dtDivineRealmPendingFloor = null;
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
                var srvMsg = (res && res.message) || "第 " + layer + " 层已记入神界机缘";
                if (!res || !res.alreadyCommitted) {
                    if (typeof addDungeonLog === "function") {
                        addDungeonLog(
                            '<span class="Legendary">【神界·服务端】</span>' +
                                srvMsg +
                                ' · <span class="Epic">神锻真力 +5</span>（永久机缘：气血+40%、护体+20%、力道+20%；灵宠击杀修为分流+10%）'
                        );
                        if (typeof updateDungeonLog === "function") updateDungeonLog();
                    }
                    toast(
                        "第 " +
                            layer +
                            " 层通关：永久机缘气血+40%、护体+20%、力道+20%；灵宠修为分流永久+10%。",
                        false
                    );
                }
                return syncP.then(function () {
                    return pullState().then(function (st) {
                        return refreshDivineRealmModalIfOpen().then(function () {
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
                window.__dtDivineRealmCommitPromise = null;
            });
        return window.__dtDivineRealmCommitPromise;
    };

    window.onDivineRealmBattleWinClose = function () {
        return window.commitDivineRealmVictoryIfPending().then(function (res) {
            return pullState().then(renderTowerModal).then(function () {
                return res;
            });
        });
    };

    function renderTowerModal(state) {
        var best = state && state.bestFloor != null ? Math.floor(Number(state.bestFloor) || 0) : 0;
        var next = state && state.nextFloor != null ? Math.floor(Number(state.nextFloor) || 1) : best + 1;
        var bk = getDongtianDivineRealmOpportunityBonuses();
        var petM = getDongtianDivineRealmPetExpMultiplier();
        var previewRealm = realmFromDivineLayer(next);
        var previewHp = divineRealmHpMult(next);
        var line = document.getElementById("dtDivineRealmStatusLine");
        if (line) {
            line.textContent =
                "已通关最高 " +
                best +
                " 层 · 可挑战第 " +
                next +
                " 层（无上限）。下关等同秘境 " +
                previewRealm +
                " 层劫主、敌势 " +
                DT_DIVINE_REALM_ESC +
                "、血量系数约 ×" +
                (previewHp / (previewRealm + 4)).toFixed(2) +
                "。永久机缘：气血 +" +
                bk.hp +
                "%，护体 +" +
                bk.def +
                "%，力道 +" +
                bk.atk +
                "%；灵宠经验分流×" +
                petM.toFixed(2) +
                "。";
        }
        var btn = document.getElementById("dtDivineRealmChallengeBtn");
        if (btn) {
            btn.textContent = "叩天门 · 第 " + next + " 层";
            btn.setAttribute("data-floor", String(next));
            var jieLocked =
                typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
            btn.disabled = !!jieLocked;
            if (jieLocked) {
                var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
                btn.setAttribute("title", "劫数≥" + lim + " 时不可挑战神界");
            } else {
                btn.removeAttribute("title");
            }
        }
    }

    function openDivineRealmModal() {
        var modal = document.getElementById("dongtianDivineRealmModal");
        if (!modal) return;
        modal.style.display = "flex";
        pullState()
            .then(renderTowerModal)
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeDivineRealmModal() {
        var modal = document.getElementById("dongtianDivineRealmModal");
        if (modal) modal.style.display = "none";
    }

    window.openDivineRealmModal = openDivineRealmModal;
    window.closeDivineRealmModal = closeDivineRealmModal;

    function ensureDongtianHubMenuClosed() {
        if (typeof window.closeDongtianHubMenuModal === "function") {
            window.closeDongtianHubMenuModal();
            return;
        }
        var hub = document.getElementById("dongtianHubMenuModal");
        if (hub) hub.style.display = "none";
    }

    window.closeDongtianHubMenuForDivineRealmCombat = function () {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return;
        try {
            hub.style.setProperty("display", "none", "important");
        } catch (eImp) {
            hub.style.display = "none";
        }
    };

    window.initDongtianDivineRealmUI = function () {
        var toRealm = document.getElementById("dongtianHubMenuDivineRealmBtn");
        if (toRealm && !toRealm._dtDivineBound) {
            toRealm._dtDivineBound = true;
            toRealm.onclick = function () {
                if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
                    if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                        window.dongtianHubHighJieBlockAlert("神界");
                    }
                    return;
                }
                ensureDongtianHubMenuClosed();
                openDivineRealmModal();
            };
        }
        var closeBtn = document.getElementById("dongtianDivineRealmCloseBtn");
        if (closeBtn && !closeBtn._dtDivineBound) {
            closeBtn._dtDivineBound = true;
            closeBtn.onclick = closeDivineRealmModal;
        }
        var refBtn = document.getElementById("dtDivineRealmRefreshBtn");
        if (refBtn && !refBtn._dtDivineBound) {
            refBtn._dtDivineBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(renderTowerModal)
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        var chBtn = document.getElementById("dtDivineRealmChallengeBtn");
        if (chBtn && !chBtn._dtDivineBound) {
            chBtn._dtDivineBound = true;
            chBtn.onclick = function () {
                var f = Math.max(1, Math.floor(Number(chBtn.getAttribute("data-floor")) || 1));
                beginDivineRealmBattle(f);
            };
        }
    };
})();
