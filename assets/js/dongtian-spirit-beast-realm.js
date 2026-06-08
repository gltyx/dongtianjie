/**
 * 洞天劫 · 灵兽界：秘境层/劫数/敌势固定模板、兽域斗法规制与菜单入口。
 */
(function () {
    var DT_SBR_ESC = 5.08;
    var DT_SBR_DODGE = 0.2;
    var DT_SBR_STUN_CHANCE = 0.1;
    var DT_SBR_STUN_MS = 1000;
    var __dtSpiritBeastBattleStarting = false;

    var SPIRIT_BEAST_BOSS_NAMES = [
        "青鳞劫兽",
        "玄貔镇界",
        "赤焰灵狰",
        "幽冥貘尊",
        "白泽守劫",
        "夔牛裂界",
        "穷奇噬天",
        "梼杌伏魔",
        "墨蛟吞云",
        "雷猿撼岳",
        "冰凰霜羽",
        "金翅大鹏",
        "九尾妖狐",
        "麒麟护道",
        "蛊雕掠空",
        "吞天犼",
        "碧眼狻猊",
        "玄龟驮岳",
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
        clearTimeout(el._dtSbrT);
        el._dtSbrT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function getBestFloor() {
        return typeof player !== "undefined" && player && typeof player.dongtianSpiritBeastRealmBestFloor === "number"
            ? Math.max(0, Math.floor(player.dongtianSpiritBeastRealmBestFloor))
            : 0;
    }

    /** 永久机缘：每层 +40% 气血、+20% 护体、+20% 力道 */
    function getDongtianSpiritBeastRealmOpportunityBonuses() {
        var n = getBestFloor();
        return { hp: n * 40, atk: n * 20, def: n * 20, layers: n };
    }
    window.getDongtianSpiritBeastRealmOpportunityBonuses = getDongtianSpiritBeastRealmOpportunityBonuses;

    function isSpiritBeastRealmCombatEnemy(ent) {
        if (!ent) return false;
        if (ent.bossRole === "spiritbeast") return true;
        if (!ent.spiritBeastRealm) return false;
        if (ent.spiritBeastRealm.layer != null) return true;
        return !!(ent.name && String(ent.name).indexOf("【灵兽界") >= 0);
    }
    window.isSpiritBeastRealmCombatEnemy = isSpiritBeastRealmCombatEnemy;

    function getDongtianSpiritBeastRealmPetExpMultiplier() {
        var n = getBestFloor();
        return 1 + n * 0.1;
    }
    window.getDongtianSpiritBeastRealmPetExpMultiplier = getDongtianSpiritBeastRealmPetExpMultiplier;

    /** 灵宠法器总加成叠乘：每层 +10% */
    function getDongtianSpiritBeastRealmPetEquipBonusMultiplier() {
        var n = getBestFloor();
        return 1 + n * 0.1;
    }
    window.getDongtianSpiritBeastRealmPetEquipBonusMultiplier = getDongtianSpiritBeastRealmPetEquipBonusMultiplier;

    /** 第 L 层：秘境第 L×2 层 · 劫 20 · 敌势 5.08 */
    function realmFromSpiritBeastLayer(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return L * 2;
    }
    window.spiritBeastRealmFromLayer = realmFromSpiritBeastLayer;

    /** 第 L 层血量再乘 (L+1)：第 1 层 ×2，第 2 层 ×3… */
    function spiritBeastHpMult(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return L + 1;
    }

    function pickSpiritBeastBossName(layer) {
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        return SPIRIT_BEAST_BOSS_NAMES[(L - 1) % SPIRIT_BEAST_BOSS_NAMES.length];
    }

    function rollSpiritBeastEnemyDodge() {
        if (typeof enemy === "undefined" || !enemy || !enemy.spiritBeastRealm) return false;
        return Math.random() < DT_SBR_DODGE;
    }
    window.rollSpiritBeastEnemyDodge = rollSpiritBeastEnemyDodge;

    function pickSpiritBeastDodgeLine() {
        var n = enemy && enemy.name ? String(enemy.name) : "灵兽守劫";
        var lines = [
            `兽纹流转，${n}身形若烟，你罡劲贯处只擦过一缕灵雾——真伤大半化于无形。`,
            `灵息一折，${n}借兽域挪移，你剑诀落点偏了半寸，劲力散入空冥。`,
            `${n}尾影一闪，遁入灵雾深处，你这一式竟只落空处。`,
            `青白灵焰一荡，${n}化形如烟，你劲力贯处只剩袅袅兽息。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
    }
    window.pickSpiritBeastDodgeLine = pickSpiritBeastDodgeLine;

    function rollSpiritBeastEnemyStun() {
        if (typeof enemy === "undefined" || !enemy || !enemy.spiritBeastRealm) return false;
        return Math.random() < DT_SBR_STUN_CHANCE;
    }
    window.rollSpiritBeastEnemyStun = rollSpiritBeastEnemyStun;

    window.isSpiritBeastRealmPlayerStunned = function () {
        var until = window.__dtSpiritBeastPlayerStunnedUntil;
        return typeof until === "number" && isFinite(until) && Date.now() < until;
    };

    window.getSpiritBeastStunRemainMs = function () {
        var until = window.__dtSpiritBeastPlayerStunnedUntil;
        if (typeof until !== "number" || !isFinite(until)) return 0;
        return Math.max(0, until - Date.now());
    };

    window.applySpiritBeastStunToPlayer = function () {
        window.__dtSpiritBeastPlayerStunnedUntil = Date.now() + DT_SBR_STUN_MS;
    };

    window.buildSpiritBeastRealmEnemy = function (layer) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var L = Math.max(1, Math.floor(Number(layer) || 1));
        var realm = realmFromSpiritBeastLayer(L);
        var hpMult = spiritBeastHpMult(L);
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        window.__dongtianSpiritBeastRealmBuilding = L;
        try {
            dungeon.progress.floor = realm;
            dungeon.progress.room = 20;
            dungeon.settings.enemyScaling = DT_SBR_ESC;
            dungeon.enemyMultipliers = dungeon.enemyMultipliers || {
                hp: 1,
                atk: 1,
                def: 1,
                atkSpd: 1,
                vamp: 1,
                critRate: 1,
                critDmg: 1,
            };
            dungeon.enemyMultipliers.hp = hpMult;
            dungeon.enemyMultipliers.atk = 1;
            dungeon.enemyMultipliers.def = 1;
            dungeon.enemyMultipliers.atkSpd = 1;
            generateRandomEnemy("sboss");
            enemy.bossRole = "spiritbeast";
            enemy.mechanic = null;
            try {
                delete enemy.dragonTower;
                delete enemy.demonTower;
                delete enemy.divineRealm;
            } catch (eClr) {
                enemy.dragonTower = null;
                enemy.demonTower = null;
                enemy.divineRealm = null;
            }
            enemy.spiritBeastRealm = {
                layer: L,
                realm: realm,
                jie: 20,
                esc: DT_SBR_ESC,
                hpMult: hpMult,
            };
            enemy.name = "【灵兽界·" + L + "层】" + pickSpiritBeastBossName(L);
            if (!enemy.rewards || typeof enemy.rewards !== "object") {
                enemy.rewards = { exp: 0, gold: 0, drop: false };
            }
            enemy.rewards.exp = 0;
            enemy.rewards.gold = 0;
            enemy.rewards.drop = false;
        } finally {
            window.__dongtianSpiritBeastRealmBuilding = null;
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
        return api("GET", "/api/dongtian-spirit-beast-realm/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "灵兽界状态失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianSpiritBeastRealmBestFloor = Math.max(0, Math.floor(Number(res.bestFloor) || 0));
            }
            return res;
        });
    }

    function recordClear(floor) {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof player !== "undefined" && player) {
                var cur = getBestFloor();
                if (floor === cur + 1) {
                    player.dongtianSpiritBeastRealmBestFloor = floor;
                }
            }
            if (typeof saveData === "function") saveData();
            return Promise.resolve({ ok: true, bestFloor: floor });
        }
        return api("POST", "/api/dongtian-spirit-beast-realm/clear-floor", { floor: floor }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "灵兽界记录失败");
            if (typeof player !== "undefined" && player && res.bestFloor != null) {
                player.dongtianSpiritBeastRealmBestFloor = Math.floor(Number(res.bestFloor) || 0);
            }
            if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                window.dongtianSyncRevisionFromApiResponse(res);
            }
            if (typeof calculateStats === "function") calculateStats();
            return res;
        });
    }

    function beginSpiritBeastRealmBattle(layer) {
        if (__dtSpiritBeastBattleStarting) return;
        if (typeof player === "undefined" || !player || player.inCombat) {
            toast("当前无法开战", true);
            return;
        }
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("灵兽界");
            }
            return;
        }
        __dtSpiritBeastBattleStarting = true;
        window.__dtSpiritBeastVictoryCommitted = false;
        window.__dtSpiritBeastPlayerStunnedUntil = 0;
        window.__dtTowerCombatActive = "spiritbeast";
        try {
            ensureDongtianHubMenuClosed();
            closeSpiritBeastRealmModal();
            try {
                buildSpiritBeastRealmEnemy(layer);
            } catch (e) {
                window.__dtTowerCombatActive = null;
                toast(e.message || String(e), true);
                return;
            }
            window.__dtSpiritBeastPendingFloor = layer;
            if (typeof calculateStats === "function") calculateStats();
            if (typeof showCombatInfo === "function") showCombatInfo();
            if (typeof startCombat === "function") startCombat();
            try {
                addCombatLog(
                    '<span class="Legendary">灵兽界 · 第 ' +
                        layer +
                        " 层</span>：兽域凝形，等同秘境第 " +
                        realmFromSpiritBeastLayer(layer) +
                        " 层劫主、敌势 " +
                        DT_SBR_ESC +
                        "。兽域天规——吸血机缘至多 <b>0.001%</b>、身法至多 <b>0.01%</b>；守兽闪避 20% 且闪避回血 10%，攻有 10% 击晕你一息。"
                );
            } catch (eL) {}
        } finally {
            __dtSpiritBeastBattleStarting = false;
        }
    }
    window.beginSpiritBeastRealmBattle = beginSpiritBeastRealmBattle;

    window.__dtSpiritBeastPendingFloor = null;
    window.__dtSpiritBeastVictoryCommitted = false;
    window.__dtSpiritBeastCommitPromise = null;

    function refreshSpiritBeastModalIfOpen() {
        var modal = document.getElementById("dongtianSpiritBeastRealmModal");
        if (!modal || modal.style.display === "none") return Promise.resolve();
        return pullState()
            .then(renderTowerModal)
            .catch(function () {
                return Promise.resolve();
            });
    }

    window.commitSpiritBeastVictoryIfPending = function () {
        if (window.__dtSpiritBeastVictoryCommitted) {
            return refreshSpiritBeastModalIfOpen().then(function () {
                return { ok: true, alreadyCommitted: true };
            });
        }
        var fl = window.__dtSpiritBeastPendingFloor;
        if (fl == null) return Promise.resolve();
        if (window.__dtSpiritBeastCommitPromise) return window.__dtSpiritBeastCommitPromise;
        var layer = Math.max(1, Math.floor(Number(fl) || 1));
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        window.__dtSpiritBeastCommitPromise = recordClear(layer)
            .then(function (res) {
                window.__dtSpiritBeastVictoryCommitted = true;
                window.__dtSpiritBeastPendingFloor = null;
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
                var srvMsg = (res && res.message) || "第 " + layer + " 层已记入灵兽界机缘";
                if (!res || !res.alreadyCommitted) {
                    if (typeof addDungeonLog === "function") {
                        addDungeonLog(
                            '<span class="Legendary">【灵兽界·服务端】</span>' +
                                srvMsg +
                                ' · <span class="Epic">神锻真力 +5</span>（永久机缘：气血+40%、护体+20%、力道+20%；灵宠修为分流+10%；灵宠法器总加成+10%）'
                        );
                        if (typeof updateDungeonLog === "function") updateDungeonLog();
                    }
                    toast(
                        "第 " +
                            layer +
                            " 层通关：永久机缘气血+40%、护体+20%、力道+20%；灵宠修为分流+10%；灵宠法器总加成+10%。",
                        false
                    );
                }
                return syncP.then(function () {
                    return pullState().then(function (st) {
                        return refreshSpiritBeastModalIfOpen().then(function () {
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
                window.__dtSpiritBeastCommitPromise = null;
            });
        return window.__dtSpiritBeastCommitPromise;
    };

    window.onSpiritBeastBattleWinClose = function () {
        return window.commitSpiritBeastVictoryIfPending().then(function (res) {
            return pullState().then(renderTowerModal).then(function () {
                return res;
            });
        });
    };

    function renderTowerModal(state) {
        var best = state && state.bestFloor != null ? Math.floor(Number(state.bestFloor) || 0) : 0;
        var next = state && state.nextFloor != null ? Math.floor(Number(state.nextFloor) || 1) : best + 1;
        var bk = getDongtianSpiritBeastRealmOpportunityBonuses();
        var petM = getDongtianSpiritBeastRealmPetExpMultiplier();
        var peqM = getDongtianSpiritBeastRealmPetEquipBonusMultiplier();
        var previewRealm = realmFromSpiritBeastLayer(next);
        var previewHp = spiritBeastHpMult(next);
        var line = document.getElementById("dtSpiritBeastStatusLine");
        if (line) {
            line.textContent =
                "已通关最高 " +
                best +
                " 层 · 可挑战第 " +
                next +
                " 层（无上限）。下关等同秘境 " +
                previewRealm +
                " 层劫主、敌势 " +
                DT_SBR_ESC +
                "、血量 ×" +
                previewHp +
                "。永久机缘：气血 +" +
                bk.hp +
                "%，护体 +" +
                bk.def +
                "%，力道 +" +
                bk.atk +
                "%；灵宠修为分流×" +
                petM.toFixed(2) +
                "；灵宠法器总加成×" +
                peqM.toFixed(2) +
                "。";
        }
        var btn = document.getElementById("dtSpiritBeastChallengeBtn");
        if (btn) {
            btn.textContent = "叩兽域 · 第 " + next + " 层";
            btn.setAttribute("data-floor", String(next));
            var jieLocked =
                typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
            btn.disabled = !!jieLocked;
            if (jieLocked) {
                var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
                btn.setAttribute("title", "劫数≥" + lim + " 时不可挑战灵兽界");
            } else {
                btn.removeAttribute("title");
            }
        }
    }

    function openSpiritBeastRealmModal() {
        var modal = document.getElementById("dongtianSpiritBeastRealmModal");
        if (!modal) return;
        modal.style.display = "flex";
        pullState()
            .then(renderTowerModal)
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeSpiritBeastRealmModal() {
        var modal = document.getElementById("dongtianSpiritBeastRealmModal");
        if (modal) modal.style.display = "none";
    }

    window.openSpiritBeastRealmModal = openSpiritBeastRealmModal;
    window.closeSpiritBeastRealmModal = closeSpiritBeastRealmModal;

    function ensureDongtianHubMenuClosed() {
        if (typeof window.closeDongtianHubMenuModal === "function") {
            window.closeDongtianHubMenuModal();
            return;
        }
        var hub = document.getElementById("dongtianHubMenuModal");
        if (hub) hub.style.display = "none";
    }

    window.closeDongtianHubMenuForSpiritBeastCombat = function () {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return;
        try {
            hub.style.setProperty("display", "none", "important");
        } catch (eImp) {
            hub.style.display = "none";
        }
    };

    window.initDongtianSpiritBeastRealmUI = function () {
        var toRealm = document.getElementById("dongtianHubMenuSpiritBeastBtn");
        if (toRealm && !toRealm._dtSbrBound) {
            toRealm._dtSbrBound = true;
            toRealm.onclick = function () {
                if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
                    if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                        window.dongtianHubHighJieBlockAlert("灵兽界");
                    }
                    return;
                }
                ensureDongtianHubMenuClosed();
                openSpiritBeastRealmModal();
            };
        }
        var closeBtn = document.getElementById("dongtianSpiritBeastCloseBtn");
        if (closeBtn && !closeBtn._dtSbrBound) {
            closeBtn._dtSbrBound = true;
            closeBtn.onclick = closeSpiritBeastRealmModal;
        }
        var refBtn = document.getElementById("dtSpiritBeastRefreshBtn");
        if (refBtn && !refBtn._dtSbrBound) {
            refBtn._dtSbrBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(renderTowerModal)
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        var chBtn = document.getElementById("dtSpiritBeastChallengeBtn");
        if (chBtn && !chBtn._dtSbrBound) {
            chBtn._dtSbrBound = true;
            chBtn.onclick = function () {
                var f = Math.max(1, Math.floor(Number(chBtn.getAttribute("data-floor")) || 1));
                beginSpiritBeastRealmBattle(f);
            };
        }
    };
})();

