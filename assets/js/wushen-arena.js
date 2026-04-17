/**
 * 洞天劫 · 武神坛（联网）：快照、挑战、排行榜
 * 打开入口：与修仙市场一致使用 btn.onclick + HTML onclick 兜底（window.__wushenArenaBarClick）。
 */
(function () {
    var wushenSelfUserId = "";

    function api(method, path, body) {
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return req(method, path, body, true);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function refreshParentNetworkCoin() {
        try {
            var fn = window.parent && window.parent.goldGameGetNetworkCoin;
            if (typeof fn === "function") fn().catch(function () {});
        } catch (e) {}
    }

    function playerNameBody() {
        var n = typeof player !== "undefined" && player && player.name ? String(player.name) : "";
        return { playerName: n };
    }

    function ensureStats() {
        if (typeof calculateStats === "function") calculateStats();
    }

    function arenaSnapshotPayload() {
        ensureStats();
        var s = player && player.stats ? player.stats : {};
        var pen = typeof s.pen === "number" && isFinite(s.pen) ? s.pen : typeof player.baseStats.pen === "number" ? player.baseStats.pen : 0;
        var cp =
            typeof aggregateCombatPassives === "function"
                ? aggregateCombatPassives((player && player.equippedPassives) || [])
                : {};
        return Object.assign(
            {
                atk: s.atk,
                def: s.def,
                hpMax: s.hpMax,
                atkSpd: s.atkSpd,
                critRate: s.critRate,
                critDmg: s.critDmg,
                pen: pen,
                combatPassives: cp,
            },
            playerNameBody()
        );
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
        clearTimeout(el._wushenT);
        el._wushenT = setTimeout(function () {
            el.style.display = "none";
        }, 2600);
    }

    function renderRank(list) {
        var ul = document.getElementById("wushenRankList");
        if (!ul) return;
        if (!list || !list.length) {
            ul.innerHTML = '<li class="wushen-arena-rank-empty">暂无战绩（保存快照并切磋后将出现在榜上）</li>';
            return;
        }
        var sid = (wushenSelfUserId || "").toLowerCase();
        ul.innerHTML = list
            .map(function (r) {
                var isEmpty = !!r.empty;
                var uid = r.userId != null ? String(r.userId).toLowerCase() : "";
                var isSelf = !isEmpty && sid && uid === sid;
                var nameEsc = String(r.name || "")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                var wl = isEmpty ? "—" : r.wins + " 胜 " + r.losses + " 负";
                var action = "";
                if (isEmpty) {
                    action =
                        '<button type="button" class="btn btn--sm btn--ghost wushen-rank-vacant-btn" data-rank="' +
                        r.rank +
                        '">占领</button>';
                } else if (isSelf) {
                    action = '<span class="wushen-rank-self">本人</span>';
                } else {
                    action =
                        '<button type="button" class="btn btn--sm btn--ghost wushen-rank-challenge-btn" data-rank="' +
                        r.rank +
                        '">切磋</button>';
                }
                return (
                    '<li class="wushen-arena-rank-row">' +
                    '<span class="wushen-rank-num">' +
                    r.rank +
                    '</span><span class="wushen-rank-name">' +
                    nameEsc +
                    '</span><span class="wushen-rank-wl">' +
                    wl +
                    '</span><span class="wushen-rank-action">' +
                    action +
                    "</span></li>"
                );
            })
            .join("");

        function bindRankAction(btn) {
            btn.onclick = function () {
                var rk = parseInt(btn.getAttribute("data-rank"), 10);
                if (!rk || rk < 1 || rk > 10) return;
                api("POST", "/api/dongtian-arena/challenge/start", { rank: rk })
                    .then(function (res) {
                        if (!res || !res.ok) throw new Error((res && res.message) || "无法开始切磋");
                        if (res.instant) {
                            toast(res.message || "已占领名次", false);
                            refreshParentNetworkCoin();
                            var lr = document.getElementById("wushenLastResult");
                            if (lr) lr.textContent = "上次：虚位占领第 " + (res.newRank != null ? res.newRank : rk) + " 名";
                            return loadAll();
                        }
                        if (typeof window.beginWushenArenaDuel === "function") {
                            window.beginWushenArenaDuel(res);
                        } else {
                            throw new Error("斗法模块未就绪");
                        }
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        ul.querySelectorAll(".wushen-rank-challenge-btn").forEach(bindRankAction);
        ul.querySelectorAll(".wushen-rank-vacant-btn").forEach(bindRankAction);
    }

    function applyState(res) {
        if (res && res.selfUserId != null) wushenSelfUserId = String(res.selfUserId);
        var coinEl = document.getElementById("wushenArenaCoin");
        if (coinEl && res.networkCoin != null) coinEl.textContent = String(res.networkCoin);
        var meta = document.getElementById("wushenArenaMeta");
        if (meta) {
            meta.textContent =
                "胜 " + (res.wins != null ? res.wins : 0) + " / 负 " + (res.losses != null ? res.losses : 0);
        }
        var hint = document.getElementById("wushenChallengeHint");
        if (hint) {
            hint.textContent =
                "剩余可挑战次数：" +
                (res.challengesLeft != null ? res.challengesLeft : 0) +
                "（每日北京时间 12:01 重置；属性快照同时清空，需重新保存）";
        }
        var prev = document.getElementById("wushenSnapshotPreview");
        if (prev) {
            if (res.snapshotPreview) {
                var p = res.snapshotPreview;
                var passLine = "";
                if (p.combatPassivesActive) {
                    passLine = " · 功法战斗效果已存档";
                }
                prev.textContent =
                    "攻 " +
                    (p.atk != null ? p.atk : "—") +
                    " · 血 " +
                    (p.hpMax != null ? p.hpMax : "—") +
                    " · 防 " +
                    (p.def != null ? p.def : "—") +
                    " · 速 " +
                    (p.atkSpd != null ? (typeof p.atkSpd === "number" && p.atkSpd.toFixed ? p.atkSpd.toFixed(2) : p.atkSpd) : "—") +
                    " · 暴 " +
                    (p.critRate != null ? p.critRate : "—") +
                    "%" +
                    passLine;
            } else {
                prev.textContent = "未保存";
            }
        }
        var cyc = document.getElementById("wushenCycleLabel");
        if (cyc) cyc.textContent = res.cycleKey ? "周期 " + res.cycleKey : "";
    }

    function loadAll() {
        return api("GET", "/api/dongtian-arena/state", undefined)
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "状态拉取失败");
                applyState(res);
                return api("GET", "/api/dongtian-arena/leaderboard", undefined);
            })
            .then(function (res2) {
                if (res2 && res2.ok && res2.list) renderRank(res2.list);
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    var WUSHEN_ARENA_MODAL_HTML =
        '<div class="wushen-arena-sheet">' +
        '<header class="wushen-arena-head">' +
        "<div>" +
        '<p class="wushen-arena-eyebrow">洞天联网</p>' +
        '<h3 class="wushen-arena-title">武神坛</h3>' +
        '<p class="wushen-arena-sub">保存快照后切磋：1–10 名为固定槽 · 虚位可无斗法直接占领（无榜或名次低于该槽）· 有对手则斗法：胜则占坑或换位 · 已上榜不可挑战更低名次 · 每日 12:01（北京时间）新周期：5 次免费挑战重置、属性快照清空须重存 · 12:00 按名次结算联网币</p>' +
        "</div>" +
        '<div class="wushen-arena-head-actions">' +
        '<span class="wushen-arena-coin">联网币 <strong id="wushenArenaCoin">0</strong></span>' +
        '<span class="wushen-arena-meta" id="wushenArenaMeta"></span>' +
        '<button type="button" class="btn btn--sm btn--ghost" id="wushenArenaRefreshBtn">刷新</button>' +
        '<button type="button" class="icon-btn" id="wushenArenaCloseBtn" title="关闭" aria-label="关闭"><i class="fa fa-xmark"></i></button>' +
        "</div>" +
        "</header>" +
        '<div class="wushen-arena-body">' +
        '<div class="wushen-arena-panels">' +
        '<section class="wushen-arena-card" aria-label="快照">' +
        '<h4 class="wushen-arena-card-title">属性快照</h4>' +
        '<p class="wushen-arena-muted">将当前角色面板存为一条服务器快照：切磋时你打人、别人打你都按这一套属性结算。每个周期（每日北京时间 12:01 起）快照会清空，需重新保存。</p>' +
        '<p class="wushen-arena-snap-preview" id="wushenSnapshotPreview">未保存</p>' +
        '<button type="button" class="btn btn--sm btn--primary" id="wushenSaveSnapshotBtn">保存属性快照</button>' +
        "</section>" +
        '<section class="wushen-arena-card" aria-label="切磋次数">' +
        '<h4 class="wushen-arena-card-title">切磋次数</h4>' +
        '<p class="wushen-arena-muted" id="wushenChallengeHint">剩余免费次数：—</p>' +
        '<div class="wushen-arena-actions-row">' +
        '<button type="button" class="btn btn--sm btn--ghost" id="wushenBuyAttemptBtn">1 联网币加 1 次</button>' +
        "</div>" +
        '<p class="wushen-arena-result" id="wushenLastResult" role="status"></p>' +
        "</section>" +
        "</div>" +
        '<section class="wushen-arena-card wushen-arena-card--rank" aria-label="本周期排行榜">' +
        '<div class="wushen-arena-rank-head">' +
        '<h4 class="wushen-arena-card-title">本周期胜场榜（1–10 名）</h4>' +
        '<span class="wushen-arena-cycle" id="wushenCycleLabel"></span>' +
        "</div>" +
        '<p class="wushen-arena-muted wushen-arena-reward-hint">奖励（北京时间每日 12:00 发放至账号联网币）：第 1 名 50，第 2 名 30，第 3 名 20，第 4–10 名各 10，其余有战绩者各 5。</p>' +
        '<ul class="wushen-arena-rank-list" id="wushenRankList"></ul>' +
        "</section>" +
        "</div>" +
        "</div>";

    /** 手机触摸后合成的 click 会落在刚出现的全屏遮罩上，若立即当「点空白关闭」会瞬间关掉弹窗 */
    var wushenBackdropCloseSuppressUntil = 0;

    function bindWushenModalShell(m) {
        if (!m || m._wushenShellBound) return;
        m.addEventListener("click", function (ev) {
            if (ev.target !== m) return;
            if (Date.now() < wushenBackdropCloseSuppressUntil) return;
            closeModal();
        });
        var c = m.querySelector("#wushenArenaCloseBtn");
        if (c) c.onclick = closeModal;
        var ref = m.querySelector("#wushenArenaRefreshBtn");
        if (ref) ref.onclick = loadAll;
        var ss = m.querySelector("#wushenSaveSnapshotBtn");
        if (ss)
            ss.onclick = function () {
                if (typeof player === "undefined" || !player) return;
                api("POST", "/api/dongtian-arena/snapshot", arenaSnapshotPayload())
                    .then(function (res) {
                        if (!res || !res.ok) throw new Error((res && res.message) || "保存失败");
                        toast("属性快照已保存");
                        loadAll();
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        var buy = m.querySelector("#wushenBuyAttemptBtn");
        if (buy)
            buy.onclick = function () {
                if (!confirm("花费 1 联网币增加 1 次挑战次数？")) return;
                api("POST", "/api/dongtian-arena/buy-attempt", {})
                    .then(function (res) {
                        if (!res || !res.ok) throw new Error((res && res.message) || "购买失败");
                        toast("已增加 1 次挑战");
                        applyState(res);
                        refreshParentNetworkCoin();
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        m._wushenShellBound = true;
    }

    function ensureWushenArenaModal() {
        var m = document.getElementById("wushenArenaModal");
        if (!m) {
            m = document.createElement("div");
            m.id = "wushenArenaModal";
            m.className = "modal-container modal-container--wushen-arena";
            m.setAttribute("aria-modal", "true");
            m.setAttribute("role", "dialog");
            m.setAttribute("aria-label", "武神坛");
            m.style.display = "none";
            m.innerHTML = WUSHEN_ARENA_MODAL_HTML;
            document.body.appendChild(m);
        } else if (m.parentNode !== document.body) {
            document.body.appendChild(m);
        }
        if (!m.querySelector(".wushen-arena-sheet")) {
            m.innerHTML = WUSHEN_ARENA_MODAL_HTML;
            m._wushenShellBound = false;
        }
        bindWushenModalShell(m);
        return m;
    }

    window.ensureWushenArenaModal = ensureWushenArenaModal;

    function syncParentViewportIfAny() {
        try {
            if (typeof window.syncParentViewportForDongtianEmbeds === "function") {
                window.syncParentViewportForDongtianEmbeds();
            }
        } catch (e) {}
    }

    function openModal() {
        var m = ensureWushenArenaModal();
        if (!m) return;
        wushenBackdropCloseSuppressUntil = Date.now() + 1000;
        document.body.classList.add("wushen-arena-open");
        m.style.display = "flex";
        syncParentViewportIfAny();
        loadAll();
    }

    function closeModal() {
        var m = document.getElementById("wushenArenaModal");
        if (!m) return;
        document.body.classList.remove("wushen-arena-open");
        m.style.display = "none";
        syncParentViewportIfAny();
    }

    /**
     * 与修仙市场相同：用 btn.onclick 主路径；手机 WebView 对复杂 pointer/touch 监听兼容性差。
     * 另在 index / dongtian-cloud 内联 onclick 兜底，保证未执行到 bind 时也能点。
     */
    function isWushenModalShown(m) {
        if (!m) return false;
        var sd = m.style.display;
        if (sd === "flex" || sd === "block") return true;
        if (sd === "none") return false;
        try {
            return window.getComputedStyle(m).display !== "none";
        } catch (e) {
            return false;
        }
    }

    function wushenArenaBarClick() {
        if (typeof window.dongtianNetHubClickBlocked === "function" && window.dongtianNetHubClickBlocked()) return;
        var btn = document.getElementById("wushenArenaOpenBtn");
        if (!btn) return;
        var m = document.getElementById("wushenArenaModal");
        if (isWushenModalShown(m)) {
            closeModal();
        } else {
            openModal();
        }
    }
    window.__wushenArenaBarClick = wushenArenaBarClick;

    function bindWushenOpenButtonDirect() {
        var btn = document.getElementById("wushenArenaOpenBtn");
        if (!btn) return;
        try {
            btn.setAttribute("type", "button");
        } catch (e0) {}
        btn.onclick = wushenArenaBarClick;
    }

    function scheduleBindWushenOpenButton() {
        bindWushenOpenButtonDirect();
        setTimeout(bindWushenOpenButtonDirect, 0);
        setTimeout(bindWushenOpenButtonDirect, 300);
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleBindWushenOpenButton);
    } else {
        scheduleBindWushenOpenButton();
    }

    window.openWuShenArenaModal = function () {
        openModal();
    };
    window.closeWuShenArenaModal = function () {
        closeModal();
    };
    window.bindWushenArenaOpenButton = bindWushenOpenButtonDirect;

    window.initWuShenArenaUI = function () {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (typeof window.ensureCloudMarketBarStructure === "function") {
            window.ensureCloudMarketBarStructure();
        }
        var bar = document.getElementById("xiuMarketBar");
        if (bar) bar.style.display = "flex";
        ensureWushenArenaModal();
        bindWushenOpenButtonDirect();
    };

    /**
     * 由排行榜「切磋」调用：关闭武神坛弹层，按对手快照进入与秘境相同的斗法界面。
     */
    window.beginWushenArenaDuel = function (res) {
        if (!res || !res.token || !res.defenderSnapshot) {
            toast("切磋数据不完整", true);
            return;
        }
        closeModal();
        var snap = res.defenderSnapshot;
        var name = res.opponentName || "修士";
        enemy.name = name;
        enemy.type = "Balanced";
        enemy.lvl = typeof player !== "undefined" && player && player.lvl ? player.lvl : 1;
        enemy.qualityTier = 4;
        enemy.bossRole = null;
        enemy.affixIndex = -1;
        enemy.mechanic = null;
        enemy.wushenArena = {
            token: res.token,
            combatPassives: snap.combatPassives && typeof snap.combatPassives === "object" ? snap.combatPassives : {},
        };
        enemy.rewards = { exp: 0, gold: 0, drop: false };
        var hpM = Math.max(1, Math.round(Number(snap.hpMax) || 1));
        enemy.stats = {
            hp: hpM,
            hpMax: hpM,
            atk: Math.max(1, Math.round(Number(snap.atk) || 1)),
            def: Math.max(0, Math.round(Number(snap.def) || 0)),
            atkSpd: Math.min(2.85, Math.max(0.06, Number(snap.atkSpd) || 1)),
            vamp: 0,
            critRate: Math.max(0, Math.min(100, Number(snap.critRate) || 0)),
            critDmg: Math.max(0, Math.min(2000, Number(snap.critDmg) || 0)),
        };
        if (typeof dungeon !== "undefined" && dungeon) {
            if (!dungeon.status || typeof dungeon.status !== "object") dungeon.status = { exploring: false, paused: true, event: false };
            dungeon.status.event = true;
        }
        player.inCombat = true;
        if (typeof showCombatInfo === "function") showCombatInfo();
        if (typeof startCombat === "function") startCombat();
        if (typeof saveData === "function") saveData();
    };

    window.finishWushenArenaCombat = function (won, token) {
        if (!token) return;
        api("POST", "/api/dongtian-arena/challenge/complete", { token: token, won: !!won })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "切磋结算失败");
                var msg = "此战败北";
                if (won) {
                    var nk = res.newRank != null ? res.newRank : "";
                    if (res.resultKind === "swap") {
                        msg = "胜！你已换位至第 " + nk + " 名（原对手降至你原先名次）";
                    } else if (res.resultKind === "take") {
                        msg = "胜！你已登上第 " + nk + " 名（原名次修士已落榜）";
                    } else {
                        msg = "切磋取胜";
                    }
                }
                toast(msg, !won);
                refreshParentNetworkCoin();
                var lr = document.getElementById("wushenLastResult");
                if (lr) {
                    lr.textContent = won
                        ? res.resultKind === "swap"
                            ? "上次切磋：胜，已换位"
                            : res.resultKind === "take"
                              ? "上次切磋：胜，占坑"
                              : "上次切磋：胜"
                        : "上次切磋：负";
                }
                openModal();
                return loadAll();
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
                openModal();
                loadAll();
            });
    };
})();
