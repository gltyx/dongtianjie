/**
 * 洞天劫 · 神锻阁：六格点数叠乘遗器面板；与神萃/强化/附魔同链路叠乘。
 */
(function () {
    var FORGE_TYPES = ["Weapon", "Armor", "Shield", "Helmet", "Ring", "Necklace"];
    var TYPE_LABEL = {
        Weapon: "武器",
        Armor: "护甲",
        Shield: "盾",
        Helmet: "头盔",
        Ring: "戒指",
        Necklace: "项链",
    };
    var PCT_PER_POINT = 0.005;

    function api(method, path, body) {
        if (typeof window.dongtianForgeIsLocalMode === "function" && window.dongtianForgeIsLocalMode()) {
            if (typeof window.dongtianForgeLocalApi === "function") {
                return window.dongtianForgeLocalApi(method, path, body);
            }
            return Promise.reject(new Error("单机神锻模块未加载"));
        }
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return Promise.resolve(req(method, path, body, true));
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
        clearTimeout(el._dtForgeToastT);
        el._dtForgeToastT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function ensureAllocOnPlayer(alloc) {
        if (typeof player === "undefined" || !player) return;
        if (!player.dongtianForgeAlloc || typeof player.dongtianForgeAlloc !== "object") {
            player.dongtianForgeAlloc = {};
        }
        if (alloc && typeof alloc === "object") {
            for (var i = 0; i < FORGE_TYPES.length; i++) {
                var t = FORGE_TYPES[i];
                player.dongtianForgeAlloc[t] = Math.max(0, Math.floor(Number(alloc[t]) || 0));
            }
        }
    }

    function applyForgeFromServer(forge) {
        if (!forge || !forge.alloc) return;
        ensureAllocOnPlayer(forge.alloc);
        if (typeof applyEquipmentStats === "function") applyEquipmentStats();
        else if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
        var coinEl = document.getElementById("xiuMarketCoin");
        if (coinEl && forge.networkCoin != null) coinEl.textContent = String(forge.networkCoin);
    }

    window.getDongtianForgePointsForType = function (type) {
        if (!type || typeof player === "undefined" || !player || !player.dongtianForgeAlloc) return 0;
        var n = Math.floor(Number(player.dongtianForgeAlloc[type]) || 0);
        return Math.max(0, n);
    };

    window.getDongtianForgeStatMulForItem = function (item) {
        if (!item || !item.type) return 1;
        var pts = window.getDongtianForgePointsForType(item.type);
        return 1 + pts * PCT_PER_POINT;
    };

    function reloadDongtianFromServer(apiRes) {
        if (typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
            return window.dongtianReloadSaveAfterDedicatedApi(apiRes || null);
        }
        if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
            return window.dongtianPullServerSaveAfterMutation();
        }
        return api("GET", "/api/dongtian-jie/save", undefined).then(function (res) {
            if (res && res.ok && res.data && typeof window.dongtianApplyServerPayload === "function") {
                window.dongtianApplyServerPayload(res.data, { forceServerPlayer: true, fromServerMutation: true });
            }
        });
    }

    function afterForgeMutation(res) {
        if (res.forge) applyForgeFromServer(res.forge);
        toast(res.message || "已处理", false);
        var pullUi = function () {
            return pullState().then(function (r2) {
                if (r2 && r2.forge) renderForgeBody(r2.forge);
            });
        };
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
            return window.dongtianReloadSaveAfterDedicatedApi(res).then(pullUi);
        }
        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianPersistPlayerUiChange === "function") {
            window.dongtianPersistPlayerUiChange();
        } else if (typeof saveData === "function") {
            saveData();
        }
        return pullUi();
    }

    function pullState() {
        return api("GET", "/api/dongtian-forge/state", undefined).then(function (res) {
            if (!res || !res.ok) {
                throw new Error((res && res.message) || "神锻阁感应失败");
            }
            return res;
        });
    }

    function renderForgeBody(forge) {
        var body = document.getElementById("dongtianForgeBody");
        if (!body || !forge) return;

        var pool = Math.max(0, Math.floor(Number(forge.pool) || 0));
        var free = Math.max(0, Math.floor(Number(forge.free) || 0));
        var used = Math.max(0, Math.floor(Number(forge.used) || 0));
        var isLocalForge =
            typeof window.dongtianForgeIsLocalMode === "function" && window.dongtianForgeIsLocalMode();
        var rc = forge.resetCost != null ? forge.resetCost : 100;
        var costLabel = isLocalForge ? "强化石" : "联网币";
        var balance = isLocalForge
            ? forge.enhanceStone != null
                ? Math.floor(Number(forge.enhanceStone) || 0)
                : "—"
            : forge.networkCoin != null
              ? Math.floor(Number(forge.networkCoin) || 0)
              : "—";
        var resetDisabled =
            used <= 0 || (isLocalForge && typeof balance === "number" && balance < rc);

        var gradId = "dtForgeHexGrad_" + String(Math.floor(Math.random() * 1e9));
        var nodesHtml = "";
        for (var i = 0; i < FORGE_TYPES.length; i++) {
            var ty = FORGE_TYPES[i];
            var pts = Math.max(0, Math.floor(Number(forge.alloc && forge.alloc[ty]) || 0));
            var pct = (pts * 0.5).toFixed(1);
            nodesHtml +=
                '<button type="button" class="btn dt-forge-slot-btn" data-forge-type="' +
                ty +
                '"' +
                (free <= 0 ? " disabled" : "") +
                ">" +
                '<span class="dt-forge-slot__star" aria-hidden="true">✦</span>' +
                '<span class="dt-forge-slot__lbl">' +
                (TYPE_LABEL[ty] || ty) +
                "</span>" +
                '<span class="dt-forge-slot__pts">' +
                pts +
                " 点 · 面板 +" +
                pct +
                "%</span>" +
                "</button>";
        }

        body.innerHTML =
            '<div class="dt-forge-intro">' +
            "<p>龙塔每通关 <strong>1</strong> 层得 <strong>1</strong> 点神锻真力；魔神塔、神界与灵兽界每通关 <strong>1</strong> 层各得 <strong>5</strong> 点；幽魂界每通关 <strong>1</strong> 层得 <strong>2</strong> 点。每点使对应部位遗器<strong>全词条数值</strong>叠乘 <strong>+0.5%</strong>（与淬火、附魔、神萃等叠乘）。</p>" +
            "<p>" +
            costLabel +
            "：<strong>" +
            balance +
            "</strong> · 洗点消耗 <strong>" +
            rc +
            "</strong> " +
            costLabel +
            "（清空六格分配，真力退回池中）。</p>" +
            "</div>" +
            '<div class="dt-forge-panel">' +
            '<svg class="dt-forge-hex-bg" viewBox="0 0 200 200" aria-hidden="true">' +
            "<defs><linearGradient id=\"" +
            gradId +
            '" x1="0%" y1="0%" x2="100%" y2="100%">' +
            '<stop offset="0%" stop-color="rgba(255,214,140,0.45)"/>' +
            '<stop offset="100%" stop-color="rgba(180,90,40,0.2)"/></linearGradient></defs>' +
            '<polygon fill="none" stroke="url(#' +
            gradId +
            ')" stroke-width="1.2" points="100,12 168,47 168,113 100,148 32,113 32,47"/>' +
            '<polygon fill="none" stroke="rgba(255,200,120,0.1)" stroke-width="0.6" points="100,38 148,64 148,116 100,142 52,116 52,64"/>' +
            "</svg>" +
            '<div class="dt-forge-stats-row">' +
            '<div class="dt-forge-stat dt-forge-stat--pool"><span class="dt-forge-stat__k">神锻真力</span><span class="dt-forge-stat__v">' +
            pool +
            '</span><span class="dt-forge-stat__d">总量</span></div>' +
            '<div class="dt-forge-stat"><span class="dt-forge-stat__k">已分配</span><span class="dt-forge-stat__v">' +
            used +
            "</span></div>" +
            '<div class="dt-forge-stat dt-forge-stat--free"><span class="dt-forge-stat__k">可加点</span><span class="dt-forge-stat__v">' +
            free +
            "</span></div>" +
            "</div>" +
            '<p class="dt-forge-tower-line">龙塔 <strong>' +
            (forge.dragonBest != null ? forge.dragonBest : 0) +
            "</strong> 层 · 魔神塔 <strong>" +
            (forge.demonBest != null ? forge.demonBest : 0) +
            "</strong> 层</p>" +
            '<div class="dt-forge-star-grid">' +
            nodesHtml +
            "</div>" +
            "</div>" +
            '<p class="dt-forge-actions">' +
            '<button type="button" class="btn btn--ghost dt-forge-reset-btn" id="dtForgeResetBtn"' +
            (resetDisabled ? " disabled" : "") +
            ">洗点（" +
            rc +
            " " +
            costLabel +
            "）</button>" +
            "</p>";

        body.querySelectorAll(".dt-forge-slot-btn").forEach(function (btn) {
            btn.onclick = function () {
                if (btn.disabled) return;
                var ty = btn.getAttribute("data-forge-type");
                api("POST", "/api/dongtian-forge/add-point", { slotType: ty })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "神锻失败", true);
                            return;
                        }
                        return afterForgeMutation(res);
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        });

        var resetBtn = document.getElementById("dtForgeResetBtn");
        if (resetBtn) {
            resetBtn.onclick = function () {
                if (resetBtn.disabled) return;
                if (!confirm("花费 " + rc + " " + costLabel + "清空六格神锻分配？（真力退回池中）")) return;
                api("POST", "/api/dongtian-forge/reset", {})
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "洗点失败", true);
                            return;
                        }
                        return afterForgeMutation(res);
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
    }

    function openForgeModal() {
        var modal = document.getElementById("dongtianForgeModal");
        if (!modal) return;
        modal.style.display = "flex";
        var body = document.getElementById("dongtianForgeBody");
        if (body) body.innerHTML = '<p class="wushen-arena-muted">感应神锻星轨…</p>';
        pullState()
            .then(function (res) {
                if (res.forge) {
                    ensureAllocOnPlayer(res.forge.alloc);
                    renderForgeBody(res.forge);
                }
            })
            .catch(function (e) {
                if (body) {
                    body.innerHTML =
                        '<p class="wushen-arena-muted" style="color:#e8a">' +
                        (e.message || String(e)) +
                        "</p>";
                }
            });
    }

    function closeForgeModal() {
        var modal = document.getElementById("dongtianForgeModal");
        if (modal) modal.style.display = "none";
    }

    window.initDongtianForgeUI = function () {
        var hubBtn = document.getElementById("dongtianHubMenuForgeBtn");
        if (hubBtn && !hubBtn._dtForgeBound) {
            hubBtn._dtForgeBound = true;
            hubBtn.onclick = function () {
                if (typeof window.closeDongtianHubMenuModal === "function") {
                    window.closeDongtianHubMenuModal();
                } else {
                    var hub = document.getElementById("dongtianHubMenuModal");
                    if (hub) hub.style.display = "none";
                }
                openForgeModal();
            };
        }
        var closeBtn = document.getElementById("dongtianForgeCloseBtn");
        if (closeBtn && !closeBtn._dtForgeBound) {
            closeBtn._dtForgeBound = true;
            closeBtn.onclick = closeForgeModal;
        }
        var refBtn = document.getElementById("dongtianForgeRefreshBtn");
        if (refBtn && !refBtn._dtForgeBound) {
            refBtn._dtForgeBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(function (res) {
                        if (res.forge) renderForgeBody(res.forge);
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
    };

    window.openDongtianForgeModal = openForgeModal;
    window.closeDongtianForgeModal = closeForgeModal;
})();
