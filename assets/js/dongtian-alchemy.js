/**
 * 洞天劫 · 炼丹阁：成熟灵药入炉炼化、强化石扩炉、灵宠服丹
 */
(function () {
    function api(method, path, body) {
        if (typeof window.dongtianAlchemyIsLocalMode === "function" && window.dongtianAlchemyIsLocalMode()) {
            if (typeof window.dongtianAlchemyLocalApi === "function") {
                return window.dongtianAlchemyLocalApi(method, path, body);
            }
            return Promise.reject(new Error("单机炼丹模块未加载"));
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
        clearTimeout(el._dtAlchToastT);
        el._dtAlchToastT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function fmtRemainMs(ms) {
        var n = Math.max(0, Math.floor(Number(ms) || 0));
        var h = Math.floor(n / 3600000);
        var m = Math.floor((n % 3600000) / 60000);
        var sec = Math.floor((n % 60000) / 1000);
        if (h > 0) return h + "小时" + m + "分";
        if (m > 0) return m + "分" + sec + "秒";
        return sec + "秒";
    }

    function reloadDongtianFromServer(apiRes) {
        state.serverMutationSinceOpen = true;
        if (typeof window.dongtianAlchemyIsLocalMode === "function" && window.dongtianAlchemyIsLocalMode()) {
            return Promise.resolve();
        }
        if (typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
            return window.dongtianReloadSaveAfterDedicatedApi(apiRes || null);
        }
        if (typeof window.dongtianReloadSaveAfterServerGrant === "function") {
            return window.dongtianReloadSaveAfterServerGrant({ skipPreFlush: true });
        }
        if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
            return window.dongtianPullServerSaveAfterMutation({ skipPreFlush: true });
        }
        return api("GET", "/api/dongtian-jie/save", undefined).then(function (res) {
            if (res && res.ok && res.data && typeof window.dongtianApplyServerPayload === "function") {
                window.dongtianApplyServerPayload(res.data, { forceServerPlayer: true, fromServerMutation: true });
            }
        });
    }

    function refreshInventoryAfterAlchemyMutation() {
        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
        if (typeof showEquipment === "function") showEquipment();
    }

    /** 与 gold-game-api/dongtian-alchemy-api.js 丹方一致（展示用） */
    var RECIPES = [
        { id: "jinling", herbKey: "lt_herb_huiqicao", herbAmount: 30, hours: 6, pillKey: "dt_pill_jinling", pillName: "金灵丹" },
        { id: "shuiling", herbKey: "lt_herb_ningluhua", herbAmount: 30, hours: 6, pillKey: "dt_pill_shuiling", pillName: "水灵丹" },
        { id: "tuling", herbKey: "lt_herb_tufuling", herbAmount: 30, hours: 6, pillKey: "dt_pill_tuling", pillName: "土灵丹" },
        { id: "muling", herbKey: "lt_herb_qinglingmu", herbAmount: 30, hours: 6, pillKey: "dt_pill_muling", pillName: "木灵丹" },
        { id: "huoling", herbKey: "lt_herb_huazaoshu", herbAmount: 30, hours: 6, pillKey: "dt_pill_huoling", pillName: "火灵丹" },
        { id: "fengling", herbKey: "lt_herb_fenglingcao", herbAmount: 30, hours: 12, pillKey: "dt_pill_fengling", pillName: "风铃丹" },
        { id: "jinteng", herbKey: "lt_herb_jinxianteng", herbAmount: 30, hours: 12, pillKey: "dt_pill_jinteng", pillName: "金藤丹" },
        { id: "xuanbing", herbKey: "lt_herb_xuanbinggu", herbAmount: 30, hours: 12, pillKey: "dt_pill_xuanbing", pillName: "玄冰丹" },
        { id: "xinlian", herbKey: "lt_herb_bingxinlian", herbAmount: 30, hours: 12, pillKey: "dt_pill_xinlian", pillName: "心莲丹" },
        { id: "longxue", herbKey: "lt_herb_longxueshu", herbAmount: 30, hours: 12, pillKey: "dt_pill_longxue", pillName: "龙血丹" },
        { id: "leishen", herbKey: "lt_herb_leijizhu", herbAmount: 30, hours: 16, pillKey: "dt_pill_leishen", pillName: "雷神丹" },
        { id: "huanshen", herbKey: "lt_herb_huanxinlan", herbAmount: 30, hours: 24, pillKey: "dt_pill_huanshen", pillName: "幻神丹" },
    ];

    var PILL_USE_CAP_GLOBAL = 1000;
    var PILL_MILESTONE_BONUSES = [
        [1000, 5.0],
        [900, 4.5],
        [800, 4.0],
        [700, 3.5],
        [600, 3.0],
        [400, 2.5],
        [300, 2.0],
        [200, 1.5],
        [100, 1.0],
        [90, 0.9],
        [80, 0.8],
        [70, 0.7],
        [60, 0.6],
        [50, 0.5],
        [40, 0.4],
        [30, 0.3],
        [20, 0.2],
        [10, 0.1],
        [1, 0.05],
    ];

    function getPillMinUsedCount(uses) {
        var min = Infinity;
        for (var i = 0; i < RECIPES.length; i++) {
            var pk = RECIPES[i].pillKey;
            var n = Math.floor(Number(uses && uses[pk]) || 0);
            if (n < min) min = n;
        }
        return min === Infinity ? 0 : min;
    }

    function getPillMilestoneBonusPct(uses) {
        var minUsed = getPillMinUsedCount(uses);
        for (var i = 0; i < PILL_MILESTONE_BONUSES.length; i++) {
            if (minUsed >= PILL_MILESTONE_BONUSES[i][0]) return PILL_MILESTONE_BONUSES[i][1];
        }
        return 0;
    }

    function getGlobalPillUsesForUi() {
        if (typeof player === "undefined" || !player) return {};
        if (typeof ensureGlobalPillUses === "function") return ensureGlobalPillUses(player);
        if (!player.dongtianAlchemy || typeof player.dongtianAlchemy !== "object") return {};
        var uses = player.dongtianAlchemy.pillUses;
        return uses && typeof uses === "object" ? uses : {};
    }

    function formatPillMilestonePct(pct) {
        if (!pct) return "—";
        return "+" + Math.round(pct * 100) + "%";
    }

    function getCurrentMilestoneThreshold(minUsed) {
        var n = Math.floor(Number(minUsed) || 0);
        for (var i = 0; i < PILL_MILESTONE_BONUSES.length; i++) {
            if (n >= PILL_MILESTONE_BONUSES[i][0]) return PILL_MILESTONE_BONUSES[i][0];
        }
        return 0;
    }

    function buildPillMilestonePreviewHtml(uses) {
        var minUsed = getPillMinUsedCount(uses);
        var currentPct = getPillMilestoneBonusPct(uses);
        var currentThreshold = getCurrentMilestoneThreshold(minUsed);
        var rows = [];
        for (var i = PILL_MILESTONE_BONUSES.length - 1; i >= 0; i--) {
            var threshold = PILL_MILESTONE_BONUSES[i][0];
            var bonus = PILL_MILESTONE_BONUSES[i][1];
            var reached = minUsed >= threshold;
            var isCurrent = reached && threshold === currentThreshold;
            var rowClass = "dt-pet-pill-milestone-row";
            if (reached) rowClass += " dt-pet-pill-milestone-row--done";
            if (isCurrent) rowClass += " dt-pet-pill-milestone-row--current";
            rows.push(
                '<tr class="' +
                rowClass +
                '"><td>全部 ' +
                RECIPES.length +
                " 种 ≥ <strong>" +
                threshold +
                "</strong></td><td>" +
                formatPillMilestonePct(bonus) +
                "</td><td>" +
                (isCurrent ? "当前" : reached ? "已达成" : "未达成") +
                "</td></tr>"
            );
        }
        return (
            '<p class="dt-pet-pill-milestone-pop__intro">以 <strong>全部 ' +
            RECIPES.length +
            " 种丹药</strong>各自已服数量的<strong>最低值</strong>判定里程碑；达成后全灵宠<strong>全灵根</strong>获得百分比加成（与升星同类，独立叠加）。</p>" +
            '<p class="dt-pet-pill-milestone-pop__status">当前最低已服 <strong>' +
            minUsed +
            "</strong> 枚 · 当前里程碑加成 <strong>" +
            formatPillMilestonePct(currentPct) +
            "</strong></p>" +
            '<table class="dt-pet-pill-milestone-pop__table">' +
            "<thead><tr><th>达成条件</th><th>全灵根加成</th><th>状态</th></tr></thead>" +
            "<tbody>" +
            rows.join("") +
            "</tbody></table>"
        );
    }

    function renderPetPillMilestonePreview(uses) {
        var body = document.getElementById("dongtianPetPillMilestonePopBody");
        if (!body) return;
        body.innerHTML = buildPillMilestonePreviewHtml(uses || getGlobalPillUsesForUi());
    }

    function openPetPillMilestonePreview() {
        var pop = document.getElementById("dongtianPetPillMilestonePop");
        if (!pop) return;
        renderPetPillMilestonePreview(getGlobalPillUsesForUi());
        pop.style.display = "flex";
    }

    function closePetPillMilestonePreview() {
        var pop = document.getElementById("dongtianPetPillMilestonePop");
        if (pop) pop.style.display = "none";
    }

    var PILL_DESC = {
        dt_pill_jinling: "金系灵根 +1",
        dt_pill_muling: "木系灵根 +1",
        dt_pill_shuiling: "水系灵根 +1",
        dt_pill_huoling: "火系灵根 +1",
        dt_pill_tuling: "土系灵根 +1",
        dt_pill_fengling: "水系灵根 +2",
        dt_pill_jinteng: "金系灵根 +2",
        dt_pill_xuanbing: "水系灵根 +2",
        dt_pill_xinlian: "土系灵根 +2",
        dt_pill_longxue: "火系灵根 +2",
        dt_pill_leishen: "金木水火土 各 +1",
        dt_pill_huanshen: "金木水火土 各 +2",
    };

    var HERB_ZH = {
        lt_herb_huiqicao: "回气草",
        lt_herb_ningluhua: "凝露花",
        lt_herb_tufuling: "土茯苓",
        lt_herb_qinglingmu: "青灵木",
        lt_herb_fenglingcao: "风铃草",
        lt_herb_huazaoshu: "火枣树",
        lt_herb_jinxianteng: "金线藤",
        lt_herb_xuanbinggu: "玄冰菇",
        lt_herb_bingxinlian: "冰心莲",
        lt_herb_longxueshu: "龙血树",
        lt_herb_leijizhu: "雷击竹",
        lt_herb_huanxinlan: "幻心兰",
    };

    function buildRecipeFallbackById() {
        var m = {};
        for (var i = 0; i < RECIPES.length; i++) {
            m[RECIPES[i].id] = RECIPES[i];
        }
        return m;
    }

    /** 丹方数量以服务端 GET state 的 recipes 为准，避免浏览器缓存旧 JS 仍显示 200/300/400。 */
    function getRecipesForUi(payload) {
        var fallbackById = buildRecipeFallbackById();
        var pr = payload && payload.recipes;
        if (Array.isArray(pr) && pr.length > 0) {
            var out = [];
            for (var j = 0; j < pr.length; j++) {
                var row = pr[j];
                if (!row || typeof row !== "object") continue;
                var id = String(row.id == null ? "" : row.id).trim();
                if (!id) continue;
                var fb = fallbackById[id];
                var herbKey = String(row.herbKey || (fb && fb.herbKey) || "").trim();
                if (!herbKey) continue;
                var herbAmt = Math.floor(Number(row.herbAmount));
                if (!Number.isFinite(herbAmt) || herbAmt < 1) {
                    herbAmt = fb && Number.isFinite(Math.floor(Number(fb.herbAmount)))
                        ? Math.floor(Number(fb.herbAmount))
                        : 100;
                }
                var hrs = Number(row.hours);
                if (!Number.isFinite(hrs) || hrs <= 0) {
                    hrs = fb && Number.isFinite(Number(fb.hours)) ? Number(fb.hours) : 6;
                }
                var pillKey = String(row.pillKey || (fb && fb.pillKey) || "").trim();
                var pillName = String(row.pillName || (fb && fb.pillName) || pillKey || id).trim();
                out.push({
                    id: id,
                    herbKey: herbKey,
                    herbAmount: herbAmt,
                    hours: hrs,
                    pillKey: pillKey,
                    pillName: pillName,
                });
            }
            if (out.length > 0) return out;
        }
        return RECIPES.slice();
    }

    var state = {
        lastPayload: null,
        selectedRecipeId: RECIPES[0] ? RECIPES[0].id : "",
        tickTimer: null,
        /** 本次打开炼丹阁后是否走过专用 API 拉档；关模态时无则勿 GET save，避免盖未落盘行囊 */
        serverMutationSinceOpen: false,
    };

    function getMatCount(key) {
        if (typeof getMaterialCount !== "function") return 0;
        return getMaterialCount(key);
    }

    function histLine(hist) {
        var h = Math.max(0, Math.floor(Number(hist) || 0));
        if (typeof cultivationRealmLabel === "function") {
            return "历史境界 " + h + " 级（" + cultivationRealmLabel(h) + "）";
        }
        return "历史境界 " + h + " 级";
    }

    function renderAlchemyModal(payload) {
        var body = document.getElementById("dongtianAlchemyBody");
        if (!body) return;
        state.lastPayload = payload;
        if (!payload || !payload.ok) {
            var isLocalAlchemy =
                typeof window.dongtianAlchemyIsLocalMode === "function" && window.dongtianAlchemyIsLocalMode();
            var detail =
                payload && typeof payload.message === "string" && payload.message.trim()
                    ? payload.message.trim()
                    : isLocalAlchemy
                    ? "炼丹阁状态读取失败，请刷新页面后重试。"
                    : "无法拉取炼丹阁状态。若刚部署过前端，请确认已重启并更新「gold-game-api」联网服务（需注册 /api/dongtian-alchemy 路由）；仍异常时请查看浏览器控制台网络请求。";
            body.innerHTML =
                '<div class="dt-alchemy-lock dt-alchemy-lock--gate">' +
                '<p class="dt-alchemy-lock__title" style="margin:0 0 0.5rem">炼丹阁感应失败</p>' +
                '<p class="dt-alchemy-lock__text" style="margin:0;font-size:0.88rem;line-height:1.55">' +
                escHtml(detail) +
                "</p></div>";
            return;
        }
        if (!payload.unlocked) {
            body.innerHTML =
                '<div class="dt-alchemy-lock dt-alchemy-lock--gate">' +
                '<div class="dt-alchemy-lock__seal" aria-hidden="true">封</div>' +
                "<h4 class=\"dt-alchemy-lock__title\">玉虚丹阁 · 未启封</h4>" +
                "<p class=\"dt-alchemy-lock__text\">需历史境界达到 <strong>" +
                payload.unlockNeedHist +
                "</strong> 级方可入内炼丹。当前：" +
                histLine(payload.histLevel) +
                "。</p></div>";
            return;
        }

        var fc = Math.floor(Number(payload.furnaceCount) || 3);
        var slots = Array.isArray(payload.slots) ? payload.slots : [];
        var nextHist = payload.nextUnlockHist;
        var unlockCost = typeof payload.unlockFurnaceCost === "number" ? payload.unlockFurnaceCost : 100;
        var stoneHave =
            typeof payload.enhanceStone === "number"
                ? payload.enhanceStone
                : getMatCount("enhance_stone");
        var canUnlock =
            fc < 12 &&
            nextHist != null &&
            Math.floor(Number(payload.histLevel) || 0) >= nextHist &&
            stoneHave >= unlockCost;

        var furnHtml = "";
        for (var i = 0; i < slots.length; i++) {
            var job = slots[i];
            var idle = !job || typeof job !== "object";
            var cardClass = "dt-alchemy-furnace" + (idle ? " dt-alchemy-furnace--idle" : " dt-alchemy-furnace--busy");
            if (idle) {
                furnHtml +=
                    '<div class="' +
                    cardClass +
                    '" data-slot="' +
                    i +
                    '">' +
                    '<div class="dt-alchemy-furnace__glow" aria-hidden="true"></div>' +
                    '<div class="dt-alchemy-furnace__lid" aria-hidden="true"></div>' +
                    '<p class="dt-alchemy-furnace__label">丙字 · 第 ' +
                    (i + 1) +
                    " 炉</p>" +
                    '<p class="dt-alchemy-furnace__status">虚位以待</p>' +
                    '<button type="button" class="btn btn--sm btn--accent dt-alchemy-start-btn" data-slot="' +
                    i +
                    '">择方开炉</button>' +
                    "</div>";
            } else {
                var started = Math.floor(Number(job.startedAt) || 0);
                var dur = Math.floor(Number(job.durationMs) || 0);
                var readyAt = started + dur;
                var rem = Math.max(0, readyAt - Date.now());
                var done = rem <= 0;
                furnHtml +=
                    '<div class="' +
                    cardClass +
                    '" data-slot="' +
                    i +
                    '">' +
                    '<div class="dt-alchemy-furnace__glow dt-alchemy-furnace__glow--active" aria-hidden="true"></div>' +
                    '<div class="dt-alchemy-furnace__lid dt-alchemy-furnace__lid--closed" aria-hidden="true"></div>' +
                    '<p class="dt-alchemy-furnace__label">丙字 · 第 ' +
                    (i + 1) +
                    " 炉</p>" +
                    '<p class="dt-alchemy-furnace__recipe">' +
                    escHtml(job.pillName || "丹药") +
                    "</p>" +
                    '<p class="dt-alchemy-furnace__timer">' +
                    (done ? '<span class="dt-alchemy-ready">丹成化实，可收取</span>' : "剩余 " + fmtRemainMs(rem)) +
                    "</p>" +
                    (done
                        ? '<button type="button" class="btn btn--sm btn--primary dt-alchemy-claim-btn" data-slot="' +
                          i +
                          '">收取丹药</button>'
                        : '<button type="button" class="btn btn--sm btn--ghost" disabled>炼制中…</button>') +
                    "</div>";
            }
        }

        var recipeRows = getRecipesForUi(payload);
        var recOpts = recipeRows.map(function (r) {
            var have = getMatCount(r.herbKey);
            var ok = have >= r.herbAmount;
            return (
                '<option value="' +
                escHtml(r.id) +
                '"' +
                (state.selectedRecipeId === r.id ? " selected" : "") +
                (ok ? "" : ' class="dt-alchemy-recipe--low"') +
                ">" +
                escHtml(r.pillName) +
                " · " +
                (HERB_ZH[r.herbKey] || r.herbKey) +
                " ×" +
                r.herbAmount +
                " · " +
                r.hours +
                "小时 · 持有" +
                have +
                "</option>"
            );
        }).join("");

        var unlockBlock = "";
        if (fc < 12) {
            unlockBlock =
                '<div class="dt-alchemy-expand">' +
                "<p><strong>扩炉</strong>：每达更高一段历史境界，可花 <strong>" +
                escHtml(String(unlockCost)) +
                "</strong> 强化石多启一座丹炉（至多 12 座）。" +
                (nextHist != null
                    ? " 下一座需历史境界 <strong>" + nextHist + "</strong> 级（当前 " + Math.floor(Number(payload.histLevel) || 0) + "）。"
                    : "") +
                "</p>" +
                '<button type="button" class="btn btn--sm btn--ghost" id="dtAlchemyUnlockBtn"' +
                (canUnlock ? "" : ' disabled title="境界或强化石不足"') +
                ">花费 " +
                escHtml(String(unlockCost)) +
                " 强化石解锁下一座炼丹炉</button></div>";
        }

        body.innerHTML =
            '<div class="dt-alchemy-hero" aria-hidden="true">' +
            '<div class="dt-alchemy-hero__clouds"></div>' +
            '<div class="dt-alchemy-hero__gate"></div>' +
            '<span class="dt-alchemy-hero__motto">正气炼丹 · 草木归真</span></div>' +
            '<div class="dt-alchemy-meta">' +
            "<p>" +
            histLine(payload.histLevel) +
            " · 炼丹炉 <strong>" +
            fc +
            "</strong> / 12 · 强化石 <strong>" +
            stoneHave +
            "</strong></p></div>" +
            '<div class="dt-alchemy-furnace-grid">' +
            furnHtml +
            "</div>" +
            '<div class="dt-alchemy-recipe-panel">' +
            "<h4 class=\"dt-alchemy-subtitle\">丹方择取（开炉时消耗成熟灵药）</h4>" +
            '<label class="dt-alchemy-select-wrap">丹方 ' +
            '<select id="dtAlchemyRecipeSelect" class="dt-alchemy-select">' +
            recOpts +
            "</select></label>" +
            "<p class=\"dt-alchemy-muted\">收取的丹药在行囊材料中；可于灵宠栏为每只灵宠淬炼灵根（同丹每宠至多 20 次），亦可上架修仙市场。</p>" +
            unlockBlock +
            "</div>";

        var sel = document.getElementById("dtAlchemyRecipeSelect");
        if (sel) {
            sel.onchange = function () {
                state.selectedRecipeId = sel.value || "";
            };
            state.selectedRecipeId = sel.value || state.selectedRecipeId;
        }

        body.querySelectorAll(".dt-alchemy-start-btn").forEach(function (btn) {
            btn.onclick = function () {
                var si = parseInt(btn.getAttribute("data-slot"), 10);
                if (!isFinite(si)) return;
                var rid = state.selectedRecipeId || (sel && sel.value) || "";
                if (!rid) {
                    toast("请选择丹方", true);
                    return;
                }
                api("POST", "/api/dongtian-alchemy/start", { slotIndex: si, recipeId: rid })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "开炉失败", true);
                            return;
                        }
                        toast(res.message || "已入炉", false);
                        return reloadDongtianFromServer(res).then(function () {
                            return pullState();
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        });
        body.querySelectorAll(".dt-alchemy-claim-btn").forEach(function (btn) {
            btn.onclick = function () {
                var si = parseInt(btn.getAttribute("data-slot"), 10);
                api("POST", "/api/dongtian-alchemy/claim", { slotIndex: si })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "收取失败", true);
                            return;
                        }
                        toast(res.message || "已收取", false);
                        return reloadDongtianFromServer(res).then(function () {
                            refreshInventoryAfterAlchemyMutation();
                            return pullState();
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        });
        var ub = document.getElementById("dtAlchemyUnlockBtn");
        if (ub) {
            ub.onclick = function () {
                if (ub.disabled) return;
                api("POST", "/api/dongtian-alchemy/unlock-furnace", {})
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "解锁失败", true);
                            return;
                        }
                        toast(res.message || "已扩炉", false);
                        return reloadDongtianFromServer(res).then(function () {
                            return pullState();
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
    }

    /** 仅刷新各炉「剩余时间 / 可收取」文案，避免每秒 innerHTML 整页重建导致原生丹方 &lt;select&gt; 下拉立刻被关掉。 */
    function updateAlchemyFurnaceTimersOnly() {
        var p = state.lastPayload;
        if (!p || !p.ok || !p.unlocked) return;
        var slots = Array.isArray(p.slots) ? p.slots : [];
        var body = document.getElementById("dongtianAlchemyBody");
        if (!body) return;
        for (var i = 0; i < slots.length; i++) {
            var job = slots[i];
            if (!job || typeof job !== "object") continue;
            var card = body.querySelector('.dt-alchemy-furnace[data-slot="' + i + '"]');
            if (!card) return;
            var started = Math.floor(Number(job.startedAt) || 0);
            var dur = Math.floor(Number(job.durationMs) || 0);
            var readyAt = started + dur;
            var rem = Math.max(0, readyAt - Date.now());
            var done = rem <= 0;
            var timerEl = card.querySelector(".dt-alchemy-furnace__timer");
            if (timerEl) {
                timerEl.innerHTML = done
                    ? '<span class="dt-alchemy-ready">丹成化实，可收取</span>'
                    : "剩余 " + fmtRemainMs(rem);
            }
            if (done) {
                if (card.querySelector(".dt-alchemy-claim-btn")) continue;
                var busyBtn = card.querySelector("button[disabled]");
                if (
                    busyBtn &&
                    busyBtn.textContent &&
                    String(busyBtn.textContent).indexOf("炼制") >= 0
                ) {
                    var claim = document.createElement("button");
                    claim.type = "button";
                    claim.className = "btn btn--sm btn--primary dt-alchemy-claim-btn";
                    claim.setAttribute("data-slot", String(i));
                    claim.textContent = "收取丹药";
                    claim.onclick = (function (slotIdx) {
                        return function () {
                            api("POST", "/api/dongtian-alchemy/claim", { slotIndex: slotIdx })
                                .then(function (res) {
                                    if (!res || !res.ok) {
                                        toast((res && res.message) || "收取失败", true);
                                        return;
                                    }
                                    toast(res.message || "已收取", false);
                                    return reloadDongtianFromServer(res).then(function () {
                                        refreshInventoryAfterAlchemyMutation();
                                        return pullState();
                                    });
                                })
                                .catch(function (e) {
                                    toast(e.message || String(e), true);
                                });
                        };
                    })(i);
                    busyBtn.parentNode.replaceChild(claim, busyBtn);
                }
            }
        }
    }

    function pullState() {
        return api("GET", "/api/dongtian-alchemy/state", undefined).then(function (res) {
            var payload = res && typeof res === "object" ? res : { ok: false, message: "返回数据无效" };
            renderAlchemyModal(payload);
            return payload;
        });
    }

    function startTick() {
        if (state.tickTimer) clearInterval(state.tickTimer);
        state.tickTimer = setInterval(function () {
            var modal = document.getElementById("dongtianAlchemyModal");
            if (!modal || modal.style.display === "none") {
                stopTick();
                return;
            }
            if (state.lastPayload && state.lastPayload.unlocked) {
                updateAlchemyFurnaceTimersOnly();
            }
        }, 1000);
    }

    function stopTick() {
        if (state.tickTimer) {
            clearInterval(state.tickTimer);
            state.tickTimer = null;
        }
    }

    function openAlchemyModal() {
        var modal = document.getElementById("dongtianAlchemyModal");
        if (!modal) return;
        state.serverMutationSinceOpen = false;
        modal.style.display = "flex";
        pullState().catch(function (e) {
            var msg = e && e.message ? String(e.message) : String(e);
            toast(msg, true);
            renderAlchemyModal({ ok: false, message: msg });
        });
        startTick();
    }

    function closeAlchemyModal() {
        var modal = document.getElementById("dongtianAlchemyModal");
        if (modal) modal.style.display = "none";
        stopTick();
        if (!state.serverMutationSinceOpen) return;
        state.serverMutationSinceOpen = false;
        if (typeof window.dongtianAlchemyIsLocalMode === "function" && window.dongtianAlchemyIsLocalMode()) {
            return;
        }
        if (typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
            window.dongtianReloadSaveAfterDedicatedApi(null).catch(function () {});
        } else if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
            window.dongtianPullServerSaveAfterMutation({ skipPreFlush: true }).catch(function () {});
        }
    }

    function renderPetPillModal(petId) {
        var modal = document.getElementById("dongtianPetPillModal");
        var inner = document.getElementById("dongtianPetPillBody");
        if (!modal || !inner) return;
        var pet = typeof getPetById === "function" ? getPetById(petId) : null;
        if (!pet) {
            inner.innerHTML = "<p>未找到灵宠。</p>";
            modal.style.display = "flex";
            return;
        }
        if (typeof normalizePetObject === "function") normalizePetObject(pet);
        var uses = getGlobalPillUsesForUi();
        var minUsed = getPillMinUsedCount(uses);
        var milestonePct = getPillMilestoneBonusPct(uses);
        var rows = RECIPES.map(function (r) {
            var pk = r.pillKey;
            var inv = getMatCount(pk);
            var u = Math.floor(Number(uses[pk]) || 0);
            var cap = PILL_USE_CAP_GLOBAL;
            var full = u >= cap;
            var desc = PILL_DESC[pk] || "";
            return (
                '<tr class="' +
                (full ? "dt-pet-pill-row--full" : "") +
                '">' +
                "<td>" +
                escHtml(r.pillName) +
                "</td>" +
                "<td>" +
                escHtml(desc) +
                "</td>" +
                "<td>" +
                inv +
                "</td>" +
                "<td>" +
                u +
                "/" +
                cap +
                "</td>" +
                "<td>" +
                '<button type="button" class="btn btn--sm btn--accent dt-pet-pill-use"' +
                (inv < 1 || full ? " disabled" : "") +
                ' data-pill-key="' +
                escHtml(pk) +
                '">' +
                (full ? "已达上限" : "服用 1 枚") +
                "</button> " +
                (typeof window.DONGTIAN_CLOUD_MODE !== "undefined" && window.DONGTIAN_CLOUD_MODE
                    ? '<span class="dt-pet-pill-market-wrap"><button type="button" class="btn btn--sm btn--ghost dt-pet-pill-sell"' +
                      (inv < 1 ? " disabled" : "") +
                      ' data-pill-key="' +
                      escHtml(pk) +
                      '">上架</button>' +
                      '<button type="button" class="btn btn--sm btn--ghost dt-pet-pill-gift"' +
                      (inv < 1 ? " disabled" : "") +
                      ' data-pill-key="' +
                      escHtml(pk) +
                      '">赠送</button></span>'
                    : "") +
                "</td></tr>"
            );
        }).join("");
        inner.innerHTML =
            '<p class="dt-pet-pill-head">服丹淬根 · 每种丹药账号共用上限 <strong>' +
            PILL_USE_CAP_GLOBAL +
            "</strong> 枚，每次服用全部灵宠灵根同步提升。</p>" +
            '<p class="dt-pet-pill-milestone">里程碑判定：<strong>全部 ' +
            RECIPES.length +
            " 种丹药均已服数量取最低值</strong>（当前最低 <strong>" +
            minUsed +
            "</strong> 枚）· 当前全灵根加成 <strong>" +
            formatPillMilestonePct(milestonePct) +
            "</strong>（与升星同类，独立加成）</p>" +
            '<table class="dt-pet-pill-table">' +
            "<thead><tr><th>丹药</th><th>功效</th><th>持有</th><th>已服</th><th>操作</th></tr></thead>" +
            "<tbody>" +
            rows +
            "</tbody></table>";
        modal.style.display = "flex";
        modal.setAttribute("data-pet-id", petId);
        renderPetPillMilestonePreview(uses);
        inner.querySelectorAll(".dt-pet-pill-use").forEach(function (btn) {
            btn.onclick = function () {
                if (btn.disabled) return;
                var pk = btn.getAttribute("data-pill-key");
                api("POST", "/api/dongtian-alchemy/use-pill", { pillKey: pk })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "服用失败", true);
                            return;
                        }
                        toast(res.message || "已服用", false);
                        return reloadDongtianFromServer(res).then(function () {
                            renderPetPillModal(petId);
                            refreshInventoryAfterAlchemyMutation();
                            if (typeof renderPetPanel === "function") renderPetPanel();
                            if (typeof calculateStats === "function") calculateStats();
                            if (typeof playerLoadStats === "function") playerLoadStats();
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        });
        inner.querySelectorAll(".dt-pet-pill-sell").forEach(function (btn) {
            btn.onclick = function () {
                if (btn.disabled) return;
                var pk = btn.getAttribute("data-pill-key");
                var mx = getMatCount(pk);
                if (typeof window.dongtianMarketOpenSellMaterial === "function") {
                    window.dongtianMarketOpenSellMaterial(pk, mx);
                }
            };
        });
        inner.querySelectorAll(".dt-pet-pill-gift").forEach(function (btn) {
            btn.onclick = function () {
                if (btn.disabled) return;
                var pk = btn.getAttribute("data-pill-key");
                var mx = getMatCount(pk);
                if (typeof window.dongtianMarketOpenGiftMaterial === "function") {
                    window.dongtianMarketOpenGiftMaterial(pk, mx);
                }
            };
        });
    }

    window.openDongtianPetPillModal = function (petId) {
        renderPetPillModal(petId);
    };

    window.closeDongtianPetPillModal = function () {
        closePetPillMilestonePreview();
        var modal = document.getElementById("dongtianPetPillModal");
        if (modal) modal.style.display = "none";
    };

    window.openDongtianAlchemyModal = openAlchemyModal;
    window.closeDongtianAlchemyModal = closeAlchemyModal;

    window.initDongtianAlchemyUI = function () {
        var closeBtn = document.getElementById("dongtianAlchemyCloseBtn");
        if (closeBtn && !closeBtn._dtAlchBound) {
            closeBtn._dtAlchBound = true;
            closeBtn.onclick = closeAlchemyModal;
        }
        var refBtn = document.getElementById("dongtianAlchemyRefreshBtn");
        if (refBtn && !refBtn._dtAlchBound) {
            refBtn._dtAlchBound = true;
            refBtn.onclick = function () {
                pullState().catch(function (e) {
                    toast(e.message || String(e), true);
                });
            };
        }
        var petPillClose = document.getElementById("dongtianPetPillCloseBtn");
        if (petPillClose && !petPillClose._dtAlchBound) {
            petPillClose._dtAlchBound = true;
            petPillClose.onclick = window.closeDongtianPetPillModal;
        }
        var petPillMilestoneBtn = document.getElementById("dongtianPetPillMilestoneBtn");
        if (petPillMilestoneBtn && !petPillMilestoneBtn._dtAlchBound) {
            petPillMilestoneBtn._dtAlchBound = true;
            petPillMilestoneBtn.onclick = function () {
                openPetPillMilestonePreview();
            };
        }
        var petPillMilestonePopClose = document.getElementById("dongtianPetPillMilestonePopClose");
        if (petPillMilestonePopClose && !petPillMilestonePopClose._dtAlchBound) {
            petPillMilestonePopClose._dtAlchBound = true;
            petPillMilestonePopClose.onclick = closePetPillMilestonePreview;
        }
        var petPillMilestonePopBackdrop = document.getElementById("dongtianPetPillMilestonePopBackdrop");
        if (petPillMilestonePopBackdrop && !petPillMilestonePopBackdrop._dtAlchBound) {
            petPillMilestonePopBackdrop._dtAlchBound = true;
            petPillMilestonePopBackdrop.onclick = closePetPillMilestonePreview;
        }
    };
})();
