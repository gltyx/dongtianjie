/**
 * 洞天劫 · 幽魂界：秘境层/劫数/敌势固定模板、魂气斗法规制与菜单入口。
 */
(function () {
    var DT_GHOST_REALM_ESC = 2.08;
    var DT_GHOST_REALM_DODGE = 0.2;
    var DT_GHOST_REALM_STUN_CHANCE = 0.2;
    var DT_GHOST_REALM_STUN_MS = 1000;
    var DT_GHOST_REALM_DMG_TAKEN_MULT = 0.2;
    var __dtGhostRealmBattleStarting = false;

    var GHOST_REALM_BOSS_NAMES = [
        "幽魂巡界使",
        "残魄荡魂客",
        "冥川渡灵翁",
        "魄光散修",
        "魂渊守关将",
        "阴风劫魇",
        "蚀魂幽影",
        "忘川引路人",
        "魄煞鬼将",
        "魂雾执律灵",
        "九幽噬魄尊",
        "阴冥护道鬼",
        "幽步夺魂娘",
        "魄劫镇界灵",
        "魂寂无面客",
        "冥灯照魄僧",
        "幽澜噬魂魁",
        "残念渡劫灵",
        "魂煞断界尊",
        "阴墟守魄将",
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
        clearTimeout(el._dtGhostT);
        el._dtGhostT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function getBestFloor() {
        return typeof player !== "undefined" && player && typeof player.dongtianGhostRealmBestFloor === "number"
            ? Math.max(0, Math.floor(player.dongtianGhostRealmBestFloor))
            : 0;
    }

    /** 永久机缘：每层 +10% 气血、+10% 护体、+10% 力道 */
    function getDongtianGhostRealmOpportunityBonuses() {
        var n = getBestFloor();
        return { hp: n * 10, atk: n * 10, def: n * 10, layers: n };
    }
    window.getDongtianGhostRealmOpportunityBonuses = getDongtianGhostRealmOpportunityBonuses;

    /** 御器阁总加成叠乘：每层 +10% */
    function getDongtianGhostRealmYuqiBonusMultiplier() {
        var n = getBestFloor();
        return 1 + n * 0.1;
    }
    window.getDongtianGhostRealmYuqiBonusMultiplier = getDongtianGhostRealmYuqiBonusMultiplier;

    function isGhostRealmCombatEnemy(ent) {
        if (!ent) return false;
        if (ent.bossRole === "ghostrealm") return true;
        if (!ent.ghostRealm) return false;
        if (ent.ghostRealm.layer != null) return true;
        return !!(ent.name && String(ent.name).indexOf("【幽魂界") >= 0);
    }
    window.isGhostRealmCombatEnemy = isGhostRealmCombatEnemy;

    /** 第 L 层：秘境第 L 层 · 劫 20 · 敌势 2.08 */
    function realmFromGhostLayer(layer) {
        return Math.max(1, Math.floor(Number(layer) || 1));
    }
    window.ghostRealmFromLayer = realmFromGhostLayer;

    function ghostRealmHpMult(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return L * 3;
    }

    function pickGhostRealmBossName(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return GHOST_REALM_BOSS_NAMES[(L - 1) % GHOST_REALM_BOSS_NAMES.length];
    }

    function rollGhostRealmEnemyDodge() {
        if (typeof enemy === "undefined" || !enemy || !enemy.ghostRealm) return false;
        return Math.random() < DT_GHOST_REALM_DODGE;
    }
    window.rollGhostRealmEnemyDodge = rollGhostRealmEnemyDodge;

    function pickGhostRealmDodgeLine() {
        var n = enemy && enemy.name ? String(enemy.name) : "幽魂守将";
        var lines = [
            `魂雾一荡，${n}身形若烟飘散，你劲力贯处只剩缕缕幽光。`,
            `阴风卷过，${n}借魄遁形，你剑诀落点竟只擦过一缕残影。`,
            `${n}周身魂气流转，虚实难辨，你这一式大半化于无形。`,
            `冥光一闪，${n}遁入幽境，你罡劲贯处如击空冥。`,
            `魄纹亮起，${n}身化虚影，你劲力贯处只剩袅袅魂雾。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
    }
    window.pickGhostRealmDodgeLine = pickGhostRealmDodgeLine;

    function rollGhostRealmEnemyStun() {
        if (typeof enemy === "undefined" || !enemy || !enemy.ghostRealm) return false;
        return Math.random() < DT_GHOST_REALM_STUN_CHANCE;
    }
    window.rollGhostRealmEnemyStun = rollGhostRealmEnemyStun;

    window.isGhostRealmPlayerStunned = function () {
        var until = window.__dtGhostRealmPlayerStunnedUntil;
        return typeof until === "number" && isFinite(until) && Date.now() < until;
    };

    window.getGhostRealmStunRemainMs = function () {
        var until = window.__dtGhostRealmPlayerStunnedUntil;
        if (typeof until !== "number" || !isFinite(until)) return 0;
        return Math.max(0, until - Date.now());
    };

    window.applyGhostRealmStunToPlayer = function () {
        window.__dtGhostRealmPlayerStunnedUntil = Date.now() + DT_GHOST_REALM_STUN_MS;
    };

    window.getGhostRealmPlayerDamageTakenMult = function () {
        return DT_GHOST_REALM_DMG_TAKEN_MULT;
    };

    window.buildGhostRealmEnemy = function (layer) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = realmFromGhostLayer(L);
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        window.__dongtianGhostRealmBuilding = L;
        try {
            dungeon.progress.floor = realm;
            dungeon.progress.room = 20;
            dungeon.settings.enemyScaling = DT_GHOST_REALM_ESC;
            dungeon.enemyMultipliers = dungeon.enemyMultipliers || {
                hp: 1,
                atk: 1,
                def: 1,
                atkSpd: 1,
                vamp: 1,
                critRate: 1,
                critDmg: 1,
            };
            dungeon.enemyMultipliers.hp = ghostRealmHpMult(L);
            dungeon.enemyMultipliers.atk = 1;
            dungeon.enemyMultipliers.def = 1;
            dungeon.enemyMultipliers.atkSpd = 1;
            generateRandomEnemy("sboss");
            enemy.bossRole = "ghostrealm";
            enemy.mechanic = null;
            try {
                delete enemy.dragonTower;
                delete enemy.demonTower;
                delete enemy.divineRealm;
                delete enemy.spiritBeastRealm;
            } catch (eClr) {
                enemy.dragonTower = null;
                enemy.demonTower = null;
                enemy.divineRealm = null;
                enemy.spiritBeastRealm = null;
            }
            enemy.ghostRealm = {
                layer: L,
                realm: realm,
                jie: 20,
                esc: DT_GHOST_REALM_ESC,
                hpMult: ghostRealmHpMult(L),
            };
            enemy.name = "【幽魂界·" + L + "层】" + pickGhostRealmBossName(L);
            if (!enemy.rewards || typeof enemy.rewards !== "object") {
                enemy.rewards = { exp: 0, gold: 0, drop: false };
            }
            enemy.rewards.exp = 0;
            enemy.rewards.gold = 0;
            enemy.rewards.drop = false;
        } finally {
            window.__dongtianGhostRealmBuilding = null;
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
        return api("GET", "/api/dongtian-ghost-realm/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "幽魂界状态失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianGhostRealmBestFloor = Math.max(0, Math.floor(Number(res.bestFloor) || 0));
            }
            return res;
        });
    }

    function recordClear(floor) {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof player !== "undefined" && player) {
                var cur = getBestFloor();
                if (floor === cur + 1) {
                    player.dongtianGhostRealmBestFloor = floor;
                }
            }
            if (typeof saveData === "function") saveData();
            return Promise.resolve({ ok: true, bestFloor: floor });
        }
        return api("POST", "/api/dongtian-ghost-realm/clear-floor", { floor: floor }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "幽魂界记录失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianGhostRealmBestFloor = Math.floor(Number(res.bestFloor) || 0);
            }
            if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                window.dongtianSyncRevisionFromApiResponse(res);
            }
            if (typeof calculateStats === "function") calculateStats();
            return res;
        });
    }

    function beginGhostRealmBattle(layer) {
        if (__dtGhostRealmBattleStarting) return;
        if (typeof player === "undefined" || !player || player.inCombat) {
            toast("当前无法开战", true);
            return;
        }
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("幽魂界");
            }
            return;
        }
        __dtGhostRealmBattleStarting = true;
        window.__dtGhostRealmVictoryCommitted = false;
        window.__dtGhostRealmPlayerStunnedUntil = 0;
        window.__dtTowerCombatActive = "ghost";
        try {
            ensureDongtianHubMenuClosed();
            closeGhostRealmModal();
            try {
                buildGhostRealmEnemy(layer);
            } catch (e) {
                window.__dtTowerCombatActive = null;
                toast(e.message || String(e), true);
                return;
            }
            window.__dtGhostRealmPendingFloor = layer;
            if (typeof calculateStats === "function") calculateStats();
            if (typeof showCombatInfo === "function") showCombatInfo();
            if (typeof startCombat === "function") startCombat();
            try {
                addCombatLog(
                    '<span class="Legendary">幽魂界 · 第 ' +
                        layer +
                        " 层</span>：魂气凝形，等同秘境第 " +
                        realmFromGhostLayer(layer) +
                        " 层劫主、敌势 " +
                        DT_GHOST_REALM_ESC +
                        "。魂规——吸血机缘至多 <b>0.001%</b>、身法至多 <b>0.01%</b>；幽魂闪避 20% 且闪避回血 10%，免疫你 80% 伤害，攻有 20% 击晕你一息。"
                );
            } catch (eL) {}
        } finally {
            __dtGhostRealmBattleStarting = false;
        }
    }
    window.beginGhostRealmBattle = beginGhostRealmBattle;

    window.__dtGhostRealmPendingFloor = null;
    window.__dtGhostRealmVictoryCommitted = false;
    window.__dtGhostRealmCommitPromise = null;

    function refreshGhostRealmModalIfOpen() {
        var modal = document.getElementById("dongtianGhostRealmModal");
        if (!modal || modal.style.display === "none") return Promise.resolve();
        return pullState()
            .then(renderTowerModal)
            .catch(function () {
                return Promise.resolve();
            });
    }

    window.commitGhostRealmVictoryIfPending = function () {
        if (window.__dtGhostRealmVictoryCommitted) {
            return refreshGhostRealmModalIfOpen().then(function () {
                return { ok: true, alreadyCommitted: true };
            });
        }
        var fl = window.__dtGhostRealmPendingFloor;
        if (fl == null) return Promise.resolve();
        if (window.__dtGhostRealmCommitPromise) return window.__dtGhostRealmCommitPromise;
        var layer = Math.max(1, Math.floor(Number(fl) || 1));
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        window.__dtGhostRealmCommitPromise = recordClear(layer)
            .then(function (res) {
                window.__dtGhostRealmVictoryCommitted = true;
                window.__dtGhostRealmPendingFloor = null;
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
                var srvMsg = (res && res.message) || "第 " + layer + " 层已记入幽魂界机缘";
                if (!res || !res.alreadyCommitted) {
                    if (typeof addDungeonLog === "function") {
                        addDungeonLog(
                            '<span class="Legendary">【幽魂界·服务端】</span>' +
                                srvMsg +
                                ' · <span class="Epic">神锻真力 +2</span>（永久机缘：气血+10%、护体+10%、力道+10%；御器阁总加成+10%）'
                        );
                        if (typeof updateDungeonLog === "function") updateDungeonLog();
                    }
                    toast(
                        "第 " +
                            layer +
                            " 层通关：永久机缘气血+10%、护体+10%、力道+10%；御器阁总加成永久+10%。",
                        false
                    );
                }
                return syncP.then(function () {
                    return pullState().then(function (st) {
                        return refreshGhostRealmModalIfOpen().then(function () {
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
                window.__dtGhostRealmCommitPromise = null;
            });
        return window.__dtGhostRealmCommitPromise;
    };

    window.onGhostRealmBattleWinClose = function () {
        return window.commitGhostRealmVictoryIfPending().then(function (res) {
            return pullState().then(renderTowerModal).then(function () {
                return res;
            });
        });
    };

    function renderTowerModal(state) {
        var best = state && state.bestFloor != null ? Math.floor(Number(state.bestFloor) || 0) : 0;
        var next = state && state.nextFloor != null ? Math.floor(Number(state.nextFloor) || 1) : best + 1;
        var bk = getDongtianGhostRealmOpportunityBonuses();
        var yuqiM = getDongtianGhostRealmYuqiBonusMultiplier();
        var previewRealm = realmFromGhostLayer(next);
        var previewHp = ghostRealmHpMult(next);
        var line = document.getElementById("dtGhostRealmStatusLine");
        if (line) {
            line.textContent =
                "已通关最高 " +
                best +
                " 层 · 可挑战第 " +
                next +
                " 层（无上限）。下关等同秘境 " +
                previewRealm +
                " 层劫主、敌势 " +
                DT_GHOST_REALM_ESC +
                "、血量系数 ×" +
                previewHp +
                "。永久机缘：气血 +" +
                bk.hp +
                "%，护体 +" +
                bk.def +
                "%，力道 +" +
                bk.atk +
                "%；御器阁总加成×" +
                yuqiM.toFixed(2) +
                "。";
        }
        var btn = document.getElementById("dtGhostRealmChallengeBtn");
        if (btn) {
            btn.textContent = "叩幽魂 · 第 " + next + " 层";
            btn.setAttribute("data-floor", String(next));
            var jieLocked =
                typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
            btn.disabled = !!jieLocked;
            if (jieLocked) {
                var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
                btn.setAttribute("title", "劫数≥" + lim + " 时不可挑战幽魂界");
            } else {
                btn.removeAttribute("title");
            }
        }
    }

    function openGhostRealmModal() {
        var modal = document.getElementById("dongtianGhostRealmModal");
        if (!modal) return;
        modal.style.display = "flex";
        pullState()
            .then(renderTowerModal)
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeGhostRealmModal() {
        var modal = document.getElementById("dongtianGhostRealmModal");
        if (modal) modal.style.display = "none";
    }

    window.openGhostRealmModal = openGhostRealmModal;
    window.closeGhostRealmModal = closeGhostRealmModal;

    function ensureDongtianHubMenuClosed() {
        if (typeof window.closeDongtianHubMenuModal === "function") {
            window.closeDongtianHubMenuModal();
            return;
        }
        var hub = document.getElementById("dongtianHubMenuModal");
        if (hub) hub.style.display = "none";
    }

    window.closeDongtianHubMenuForGhostRealmCombat = function () {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return;
        try {
            hub.style.setProperty("display", "none", "important");
        } catch (eImp) {
            hub.style.display = "none";
        }
    };

    window.initDongtianGhostRealmUI = function () {
        var toRealm = document.getElementById("dongtianHubMenuGhostRealmBtn");
        if (toRealm && !toRealm._dtGhostBound) {
            toRealm._dtGhostBound = true;
            toRealm.onclick = function () {
                if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
                    if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                        window.dongtianHubHighJieBlockAlert("幽魂界");
                    }
                    return;
                }
                ensureDongtianHubMenuClosed();
                openGhostRealmModal();
            };
        }
        var closeBtn = document.getElementById("dongtianGhostRealmCloseBtn");
        if (closeBtn && !closeBtn._dtGhostBound) {
            closeBtn._dtGhostBound = true;
            closeBtn.onclick = closeGhostRealmModal;
        }
        var refBtn = document.getElementById("dtGhostRealmRefreshBtn");
        if (refBtn && !refBtn._dtGhostBound) {
            refBtn._dtGhostBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(renderTowerModal)
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        var chBtn = document.getElementById("dtGhostRealmChallengeBtn");
        if (chBtn && !chBtn._dtGhostBound) {
            chBtn._dtGhostBound = true;
            chBtn.onclick = function () {
                var f = Math.max(1, Math.floor(Number(chBtn.getAttribute("data-floor")) || 1));
                beginGhostRealmBattle(f);
            };
        }
    };
})();
