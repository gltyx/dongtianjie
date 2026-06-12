/**
 * 洞天劫 · 修仙股票：灵石买卖、资产、行情列表与走势图
 */
(function () {
    var state = null;
    var activeTab = 0;
    var selectedStockId = "daluo";
    var listSectorFilter = "全部";
    var refreshTimer = null;
    var tickCountdownTimer = null;
    var tradeQtyDraft = "1";
    var goldRankCache = null;
    var goldRankCacheAt = 0;
    var GOLD_RANK_TTL_MS = 60000;
    var shopState = null;
    var shopBuying = false;

    var SECTOR_GLYPH = {
        丹道: "丹",
        矿脉: "矿",
        器修: "器",
        灵植: "植",
        符箓: "符",
        洞府: "府",
        功法: "功",
        奇珍: "珍",
        阵法: "阵",
        综合: "行",
    };

    function api(method, path, body) {
        try {
            if (!window.DONGTIAN_CLOUD_MODE && typeof window.dongtianStockLocalApi === "function") {
                return window.dongtianStockLocalApi(method, path, body);
            }
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return Promise.resolve(req(method, path, body, true));
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function stockRewardLabel(amount) {
        var n = Math.max(0, Math.floor(Number(amount) || 0));
        return fmtNum(n) + " 御器材料包";
    }

    function readLocalPlayerGold() {
        try {
            if (typeof player !== "undefined" && player && typeof player.gold === "number" && Number.isFinite(player.gold)) {
                return Math.max(0, Math.floor(player.gold));
            }
        } catch (eGold) {}
        return null;
    }

    function stockClientGoldQuery() {
        var g = readLocalPlayerGold();
        return g != null ? "?clientGold=" + encodeURIComponent(String(g)) : "";
    }

    function stockClientGoldBody(extra) {
        var body = extra && typeof extra === "object" ? extra : {};
        var g = readLocalPlayerGold();
        if (g != null) body.clientGold = g;
        return body;
    }

    function flushBeforeStockApi() {
        if (!window.DONGTIAN_CLOUD_MODE) return Promise.resolve(true);
        if (typeof window.dongtianFlushCloudSaveImmediate === "function") {
            try {
                window.dongtianFlushCloudSaveImmediate();
            } catch (eFlush) {}
        } else if (typeof window.dongtianCloudFlushSaveWhenDirty === "function") {
            return window.dongtianCloudFlushSaveWhenDirty(8000);
        }
        return Promise.resolve(true);
    }

    function mergeLocalGoldIntoState() {
        if (!state || !state.portfolio) return;
        var localGold = readLocalPlayerGold();
        if (localGold == null) return;
        var pf = state.portfolio;
        var serverGold = Math.max(0, Math.floor(Number(pf.gold) || 0));
        if (localGold <= serverGold) return;
        var mv = Math.max(0, Math.floor(Number(pf.marketValue) || 0));
        pf.gold = localGold;
        pf.totalAssets = localGold + mv;
        if (pf.totalAssets > 0) {
            pf.cashRatio = Math.round((localGold / pf.totalAssets) * 10000) / 100;
            pf.stockRatio = Math.round((mv / pf.totalAssets) * 10000) / 100;
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
        clearTimeout(el._dtStockT);
        el._dtStockT = setTimeout(function () {
            el.style.display = "none";
        }, 3200);
    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function fmtNum(n, digits) {
        var x = Number(n);
        if (!Number.isFinite(x)) return "—";
        if (typeof formatCompactNum === "function") {
            return formatCompactNum(x, digits != null ? digits : Math.abs(x) >= 1000 ? 2 : 0);
        }
        if (Math.abs(x) >= 1000 && typeof nFormatter === "function") return nFormatter(x);
        if (digits != null) return x.toFixed(digits);
        return String(Math.round(x));
    }

    function fmtGold(n) {
        return fmtNum(n) + " 灵石";
    }

    function fmtPrice(n) {
        var x = Number(n);
        if (!Number.isFinite(x)) return "—";
        if (Math.abs(x) >= 10000 && typeof nFormatter === "function") return nFormatter(x);
        if (Math.abs(x) >= 1000) return x.toFixed(1);
        return x.toFixed(2);
    }

    function priceTierLabel(basePrice) {
        var b = Number(basePrice) || 0;
        if (b >= 100000000) return "亿级";
        if (b >= 10000000) return "千万级";
        if (b >= 1000000) return "百万级";
        if (b >= 100000) return "十万级";
        if (b >= 10000) return "万级";
        if (b >= 1000) return "千级";
        return "凡品";
    }

    function priceTierClass(basePrice) {
        var b = Number(basePrice) || 0;
        if (b >= 100000000) return "dt-stock-tier--legend";
        if (b >= 1000000) return "dt-stock-tier--epic";
        if (b >= 10000) return "dt-stock-tier--rare";
        if (b >= 1000) return "dt-stock-tier--fine";
        return "dt-stock-tier--common";
    }

    function historyRange(history) {
        var pts = Array.isArray(history) ? history : [];
        if (!pts.length) return { high: 0, low: 0 };
        var high = pts[0];
        var low = pts[0];
        for (var i = 1; i < pts.length; i++) {
            high = Math.max(high, pts[i]);
            low = Math.min(low, pts[i]);
        }
        return { high: high, low: low };
    }

    function baseDevPct(price, base) {
        var p = Number(price);
        var b = Number(base);
        if (!Number.isFinite(p) || !Number.isFinite(b) || b <= 0) return 0;
        return round2(((p - b) / b) * 100);
    }

    function fmtLedgerTime(ts) {
        if (!ts) return "";
        try {
            return new Date(ts).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        } catch (e) {
            return "";
        }
    }

    function positionFromPortfolio(pf, stockId) {
        var list = pf && pf.positions ? pf.positions : [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === stockId) return list[i];
        }
        return null;
    }

    function fmtPct(n) {
        var x = Number(n);
        if (!Number.isFinite(x)) return "0%";
        var sign = x > 0 ? "+" : "";
        return sign + x.toFixed(2) + "%";
    }

    function fmtProfitPct(n) {
        if (n == null || !Number.isFinite(Number(n))) return "—";
        return fmtPct(n);
    }

    function fmtSignedNum(n) {
        var x = Number(n);
        if (!Number.isFinite(x)) return "—";
        var rounded = Math.round(x);
        if (rounded === 0) return "0";
        var sign = rounded > 0 ? "+" : "-";
        var absRounded = Math.abs(rounded);
        var body;
        if (typeof formatCompactNum === "function") {
            body = formatCompactNum(absRounded, absRounded >= 1000 ? 2 : 0);
        } else if (absRounded >= 10000 && typeof nFormatter === "function") {
            body = nFormatter(absRounded);
        } else {
            body = String(absRounded);
        }
        return sign + body;
    }

    function pctClass(n) {
        var x = Number(n);
        if (!Number.isFinite(x) || x === 0) return "dt-stock-pct--flat";
        return x > 0 ? "dt-stock-pct--up" : "dt-stock-pct--down";
    }

    function fmtDateTime(ts) {
        if (!ts) return "—";
        try {
            return new Date(ts).toLocaleString("zh-CN", {
                hour12: false,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        } catch (e) {
            return "—";
        }
    }

    function fmtRemainMs(ms) {
        var n = Math.max(0, Math.floor(Number(ms) || 0));
        var h = Math.floor(n / 3600000);
        var m = Math.floor((n % 3600000) / 60000);
        var s = Math.floor((n % 60000) / 1000);
        if (h > 0) return h + " 小时 " + m + " 分 " + s + " 秒";
        if (m > 0) return m + " 分 " + s + " 秒";
        return s + " 秒";
    }

    function effectiveServerNow() {
        if (!state || typeof state._localBase !== "number") return Date.now();
        var drift = Date.now() - state._localBase;
        return (state._serverBase || Date.now()) + drift;
    }

    function calcMaxBuyQty(gold, price) {
        gold = Math.floor(Number(gold) || 0);
        price = Number(price);
        if (!(price > 0) || gold <= 0) return 0;
        var lo = 0;
        var hi = Math.floor(gold / price) + 2;
        while (lo < hi) {
            var mid = Math.ceil((lo + hi) / 2);
            if (Math.ceil(mid * price) <= gold) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    function sectorGlyph(sector) {
        return SECTOR_GLYPH[sector] || "股";
    }

    function stockById(id) {
        if (!state || !Array.isArray(state.stocks)) return null;
        for (var i = 0; i < state.stocks.length; i++) {
            if (state.stocks[i].id === id) return state.stocks[i];
        }
        return null;
    }

    function selectedStockIndex() {
        if (!state || !Array.isArray(state.stocks)) return 0;
        for (var i = 0; i < state.stocks.length; i++) {
            if (state.stocks[i].id === selectedStockId) return i;
        }
        return 0;
    }

    function navigateStock(delta) {
        if (!state || !state.stocks || !state.stocks.length) return;
        var idx = selectedStockIndex() + delta;
        if (idx < 0) idx = state.stocks.length - 1;
        if (idx >= state.stocks.length) idx = 0;
        selectedStockId = state.stocks[idx].id;
        renderTradePanel();
    }

    function reloadDongtianSaveFromServer(apiRes) {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof saveData === "function") saveData();
            if (typeof updateStats === "function") updateStats();
            return Promise.resolve(apiRes || { ok: true });
        }
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
            return res;
        });
    }

    function setTab(which) {
        activeTab = which;
        var tabs = [
            document.getElementById("dtStockTabTrade"),
            document.getElementById("dtStockTabAssets"),
            document.getElementById("dtStockTabList"),
            document.getElementById("dtStockTabRank"),
            document.getElementById("dtStockTabShop"),
        ];
        var panels = [
            document.getElementById("dtStockPanelTrade"),
            document.getElementById("dtStockPanelAssets"),
            document.getElementById("dtStockPanelList"),
            document.getElementById("dtStockPanelRank"),
            document.getElementById("dtStockPanelShop"),
        ];
        for (var i = 0; i < 5; i++) {
            var on = i === which;
            if (tabs[i]) {
                tabs[i].classList.toggle("dt-stock-tab--active", on);
                tabs[i].setAttribute("aria-selected", on ? "true" : "false");
                tabs[i].tabIndex = on ? 0 : -1;
            }
            if (panels[i]) {
                panels[i].classList.toggle("dt-stock-panel--active", on);
                panels[i].setAttribute("aria-hidden", on ? "false" : "true");
            }
        }
        renderAll();
    }

    function historyAnalytics(history, price, basePrice) {
        var pts = Array.isArray(history) && history.length ? history : [Number(price) || 0];
        var open = pts[0];
        var close = pts[pts.length - 1];
        var hr = historyRange(pts);
        var ampPct = hr.low > 0 ? round2(((hr.high - hr.low) / hr.low) * 100) : 0;
        var rangePos =
            hr.high - hr.low > 0.01 ? round2(((close - hr.low) / (hr.high - hr.low)) * 100) : 50;
        var bandLo = Number(basePrice) * 0.55;
        var bandHi = Number(basePrice) * 1.85;
        var bandPos =
            bandHi - bandLo > 0.01 ? round2(((close - bandLo) / (bandHi - bandLo)) * 100) : 50;
        var sessionChg = open > 0 ? round2(((close - open) / open) * 100) : 0;
        return {
            open: open,
            close: close,
            high: hr.high,
            low: hr.low,
            ampPct: ampPct,
            rangePos: rangePos,
            bandLo: bandLo,
            bandHi: bandHi,
            bandPos: bandPos,
            sessionChg: sessionChg,
            points: pts.length,
        };
    }

    function rangePosLabel(pct) {
        var x = Number(pct) || 0;
        if (x >= 72) return "偏高";
        if (x <= 28) return "偏低";
        return "居中";
    }

    function recentTradesForStock(stockId, limit) {
        var list = state && state.globalLedger ? state.globalLedger : [];
        var out = [];
        var max = limit || 5;
        for (var i = 0; i < list.length && out.length < max; i++) {
            if (list[i].stockId === stockId) out.push(list[i]);
        }
        return out;
    }

    function formatLedgerPlayerLabel(row) {
        var name = row && row.playerName ? String(row.playerName) : "神秘修士";
        var pid = row && row.playerPublicId != null ? Math.floor(Number(row.playerPublicId)) : NaN;
        if (typeof formatDongtianStyledPeerLabel === "function") {
            return formatDongtianStyledPeerLabel(name, pid);
        }
        if (Number.isFinite(pid) && pid >= 1 && pid <= 10000) {
            return escHtml(name) + ' <span class="dt-stock-player-id">#' + escHtml(pid) + "</span>";
        }
        return escHtml(name);
    }

    function chartMetric(label, value, extraClass) {
        return (
            '<div class="dt-stock-chart-metric ' +
            (extraClass || "") +
            '"><span class="dt-stock-chart-metric__k">' +
            escHtml(label) +
            '</span><span class="dt-stock-chart-metric__v">' +
            value +
            "</span></div>"
        );
    }

    function prepChartCanvas(canvas, logicalH) {
        if (!canvas) return null;
        var wrap = canvas.closest(".dt-stock-chart-canvas-wrap") || canvas.parentElement;
        var cssW = Math.max(320, wrap && wrap.clientWidth ? wrap.clientWidth - 4 : 680);
        var cssH = logicalH || 260;
        var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.style.width = "100%";
        canvas.style.height = cssH + "px";
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        var ctx = canvas.getContext("2d");
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { logicalW: cssW, logicalH: cssH };
    }

    function drawChart(canvas, history, changePct, opts) {
        if (!canvas) return;
        var ctx = canvas.getContext("2d");
        if (!ctx) return;
        opts = opts || {};
        var w = Number(opts.logicalW) > 0 ? Number(opts.logicalW) : canvas.width;
        var h = Number(opts.logicalH) > 0 ? Number(opts.logicalH) : canvas.height;
        ctx.clearRect(0, 0, w, h);
        var pts = Array.isArray(history) && history.length ? history.slice() : [];
        if (pts.length < 2) {
            if (pts.length === 1) pts = [pts[0], pts[0]];
            else pts = [0, 0];
        }
        var min = pts[0];
        var max = pts[0];
        for (var i = 1; i < pts.length; i++) {
            min = Math.min(min, pts[i]);
            max = Math.max(max, pts[i]);
        }
        var refLines = [];
        if (Number.isFinite(Number(opts.basePrice))) {
            refLines.push({ v: Number(opts.basePrice), color: "rgba(220,180,80,0.55)", dash: [5, 4], label: "基准" });
        }
        if (Number.isFinite(Number(opts.prevPrice))) {
            refLines.push({ v: Number(opts.prevPrice), color: "rgba(180,190,210,0.45)", dash: [3, 4], label: "昨收" });
        }
        if (Number.isFinite(Number(opts.avgCost)) && Number(opts.avgCost) > 0) {
            refLines.push({ v: Number(opts.avgCost), color: "rgba(120,180,255,0.55)", dash: [4, 3], label: "成本" });
        }
        if (Number.isFinite(Number(opts.bandLo)) && Number.isFinite(Number(opts.bandHi))) {
            min = Math.min(min, Number(opts.bandLo));
            max = Math.max(max, Number(opts.bandHi));
        }
        for (var r = 0; r < refLines.length; r++) {
            min = Math.min(min, refLines[r].v);
            max = Math.max(max, refLines[r].v);
        }
        if (max - min < 0.01) {
            min -= 0.5;
            max += 0.5;
        }
        var padL = opts.compact ? 4 : 52;
        var padR = opts.compact ? 4 : 10;
        var padY = opts.compact ? 4 : 14;
        var padBottom = opts.compact ? 4 : 22;
        var innerW = w - padL - padR;
        var innerH = h - padY - padBottom;
        var up = Number(changePct) >= 0;
        var stroke = up ? "rgba(90, 220, 160, 0.95)" : "rgba(240, 110, 110, 0.95)";
        var fill = up ? "rgba(60, 180, 130, 0.22)" : "rgba(200, 80, 80, 0.18)";

        function yFor(v) {
            return padY + innerH - ((v - min) / (max - min)) * innerH;
        }

        if (!opts.compact) {
            var bgGrad = ctx.createLinearGradient(0, padY, 0, padY + innerH);
            bgGrad.addColorStop(0, "rgba(255,255,255,0.03)");
            bgGrad.addColorStop(1, "rgba(0,0,0,0.08)");
            ctx.fillStyle = bgGrad;
            ctx.fillRect(padL, padY, innerW, innerH);
        }

        if (!opts.compact && Number.isFinite(Number(opts.bandLo)) && Number.isFinite(Number(opts.bandHi))) {
            var by1 = yFor(Number(opts.bandHi));
            var by2 = yFor(Number(opts.bandLo));
            ctx.fillStyle = "rgba(220,180,80,0.06)";
            ctx.fillRect(padL, by1, innerW, by2 - by1);
        }

        if (opts.showGrid && !opts.compact) {
            ctx.strokeStyle = "rgba(255,255,255,0.06)";
            ctx.lineWidth = 1;
            for (var g = 0; g <= 4; g++) {
                var gy = padY + (innerH * g) / 4;
                ctx.beginPath();
                ctx.moveTo(padL, gy);
                ctx.lineTo(padL + innerW, gy);
                ctx.stroke();
                var gv = max - ((max - min) * g) / 4;
                ctx.fillStyle = "rgba(200,210,220,0.55)";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "right";
                ctx.fillText(fmtPrice(gv), padL - 6, gy + 3);
            }
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(180,190,210,0.5)";
            ctx.font = "12px sans-serif";
            ctx.fillText("-12h", padL + innerW * 0.08, h - 6);
            ctx.fillText("-6h", padL + innerW * 0.5, h - 6);
            ctx.fillText("现在", padL + innerW - 8, h - 6);
        } else if (opts.showGrid && opts.compact) {
            ctx.strokeStyle = "rgba(255,255,255,0.06)";
            ctx.lineWidth = 1;
            for (var g2 = 0; g2 <= 4; g2++) {
                var gy2 = padY + (innerH * g2) / 4;
                ctx.beginPath();
                ctx.moveTo(padL, gy2);
                ctx.lineTo(padL + innerW, gy2);
                ctx.stroke();
            }
        }

        for (var rl = 0; rl < refLines.length; rl++) {
            if (opts.compact) continue;
            var line = refLines[rl];
            var ly = yFor(line.v);
            ctx.save();
            ctx.strokeStyle = line.color;
            ctx.lineWidth = 1;
            ctx.setLineDash(line.dash || []);
            ctx.beginPath();
            ctx.moveTo(padL, ly);
            ctx.lineTo(padL + innerW, ly);
            ctx.stroke();
            ctx.restore();
        }

        ctx.beginPath();
        for (var j = 0; j < pts.length; j++) {
            var x = padL + (innerW * j) / (pts.length - 1);
            var y = yFor(pts[j]);
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineTo(padL + innerW, padY + innerH);
        ctx.lineTo(padL, padY + innerH);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        for (var k = 0; k < pts.length; k++) {
            var x2 = padL + (innerW * k) / (pts.length - 1);
            var y2 = yFor(pts[k]);
            if (k === 0) ctx.moveTo(x2, y2);
            else ctx.lineTo(x2, y2);
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = opts.compact ? 1.5 : 2.4;
        ctx.stroke();

        if (!opts.compact && pts.length) {
            var lx = padL + innerW;
            var ly2 = yFor(pts[pts.length - 1]);
            ctx.beginPath();
            ctx.fillStyle = stroke;
            ctx.arc(lx, ly2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        if (!opts.compact && refLines.length) {
            ctx.font = "12px sans-serif";
            ctx.textAlign = "left";
            var legendY = padY + 10;
            for (var lg = 0; lg < refLines.length; lg++) {
                ctx.fillStyle = refLines[lg].color;
                ctx.fillRect(padL + 8, legendY - 7, 12, 2);
                ctx.fillStyle = "rgba(200,210,220,0.72)";
                ctx.fillText(refLines[lg].label, padL + 24, legendY - 2);
                legendY += 14;
            }
        }
    }

    function updateTickLine() {
        var tickEl = document.getElementById("dtStockTickLine");
        if (!tickEl || !state || !state.nextTickAt) return;
        var nextAt = state.nextTickAt;
        var remain = nextAt - effectiveServerNow();
        var parts = [];
        if (state.lastTickAt) {
            parts.push("上次行情刷新：" + fmtDateTime(state.lastTickAt));
        }
        parts.push("下次行情刷新：" + fmtDateTime(nextAt) + "（剩余 " + fmtRemainMs(remain) + "）");
        tickEl.textContent = parts.join(" · ");
    }

    function renderHeaderMeta() {
        var goldEl = document.getElementById("dtStockGoldLine");
        var headBal = document.getElementById("dtStockHeadBalance");
        if (!state) return;
        var pf = state.portfolio || {};
        if (goldEl) {
            goldEl.textContent =
                "总资产 " +
                fmtGold(pf.totalAssets || 0) +
                " · 现金 " +
                fmtGold(pf.gold || 0) +
                " · 持仓 " +
                fmtGold(pf.marketValue || 0);
        }
        if (headBal) {
            headBal.innerHTML =
                '<span class="dt-stock-head-balance__cash">现金 <strong>' +
                fmtNum(pf.gold || 0) +
                "</strong></span>" +
                '<span class="dt-stock-head-balance__mv">持仓 <strong>' +
                fmtNum(pf.marketValue || 0) +
                "</strong></span>";
        }
        updateTickLine();
    }

    function statChip(label, value, extraClass) {
        return (
            '<div class="dt-stock-stat ' +
            (extraClass || "") +
            '"><span class="dt-stock-stat__k">' +
            escHtml(label) +
            '</span><span class="dt-stock-stat__v">' +
            value +
            "</span></div>"
        );
    }

    function renderTradePanel() {
        var host = document.getElementById("dtStockTradeHost");
        if (!host || !state) return;
        var prevQty = document.getElementById("dtStockQtyInput");
        if (prevQty && prevQty.value) tradeQtyDraft = prevQty.value;

        var st = stockById(selectedStockId) || state.stocks[0];
        if (!st) {
            host.innerHTML = '<p class="wushen-arena-muted">暂无行情</p>';
            return;
        }
        selectedStockId = st.id;
        var idx = selectedStockIndex();
        var total = state.stocks.length;
        var pf = state.portfolio || {};
        var hold = pf.holdings && pf.holdings[st.id] ? pf.holdings[st.id] : 0;
        var gold = pf.gold || 0;
        var maxBuy = calcMaxBuyQty(gold, st.price);
        var maxSell = Math.max(0, Math.floor(Number(hold) || 0));
        var prevClose = st.prevPrice != null ? st.prevPrice : st.price;
        var diff = round2(Number(st.price) - Number(prevClose));
        var glyph = sectorGlyph(st.sector);
        var holdValue = Math.floor(Number(hold) * Number(st.price));
        var pos = positionFromPortfolio(pf, st.id);
        var devBase = baseDevPct(st.price, st.basePrice);
        var tierLabel = priceTierLabel(st.basePrice);
        var tierClass = priceTierClass(st.basePrice);
        var avgCost = pos ? pos.avgCost : 0;
        var posPl = pos ? pos.profit : 0;
        var posPlPct = pos ? pos.profitPct : 0;
        var ha = historyAnalytics(st.history, st.price, st.basePrice);
        var stockTrades = recentTradesForStock(st.id, 5);
        var tradeFeed =
            stockTrades
                .map(function (row) {
                    var sideZh = row.side === "buy" ? "买" : "卖";
                    var sideCls = row.side === "buy" ? "dt-stock-side--buy" : "dt-stock-side--sell";
                    return (
                        '<li class="dt-stock-feed-row">' +
                        '<span class="dt-stock-ledger-side ' +
                        sideCls +
                        '">' +
                        escHtml(sideZh) +
                        "</span>" +
                        '<span class="dt-stock-feed-main">' +
                        formatLedgerPlayerLabel(row) +
                        " · ×" +
                        fmtNum(row.qty) +
                        " @ " +
                        fmtPrice(row.price) +
                        "</span>" +
                        '<span class="dt-stock-ledger-time">' +
                        escHtml(fmtLedgerTime(row.at)) +
                        "</span></li>"
                    );
                })
                .join("") || '<li class="wushen-arena-muted dt-stock-feed-empty">本股暂无全服成交</li>';

        host.innerHTML =
            '<div class="dt-stock-focus">' +
            '<nav class="dt-stock-nav" aria-label="切换仙股">' +
            '<button type="button" class="dt-stock-nav__btn" id="dtStockPrevBtn" title="上一只">‹</button>' +
            '<div class="dt-stock-nav__center">' +
            '<span class="dt-stock-nav__idx">' +
            (idx + 1) +
            " / " +
            total +
            "</span>" +
            "<strong>" +
            escHtml(st.name) +
            '</strong><span class="dt-stock-code">' +
            escHtml(st.code) +
            '</span><span class="dt-stock-sector-badge">' +
            escHtml(st.sector) +
            '</span><span class="dt-stock-tier ' +
            tierClass +
            '">' +
            escHtml(tierLabel) +
            "</span></div>" +
            '<button type="button" class="dt-stock-nav__btn" id="dtStockNextBtn" title="下一只">›</button>' +
            '<button type="button" class="btn btn--sm btn--ghost dt-stock-nav__list" id="dtStockGoListBtn">仙股榜</button>' +
            "</nav>" +
            '<section class="dt-stock-hero dt-stock-hero--focus ' +
            pctClass(st.changePct) +
            '">' +
            '<div class="dt-stock-hero__glyph" aria-hidden="true">' +
            escHtml(glyph) +
            "</div>" +
            '<div class="dt-stock-hero__body">' +
            '<div class="dt-stock-hero__title-row">' +
            "<h4>" +
            escHtml(st.name) +
            "</h4>" +
            '<span class="dt-stock-code">' +
            escHtml(st.code) +
            "</span>" +
            '<span class="dt-stock-sector-badge dt-stock-sector-badge--sm">' +
            escHtml(st.sector) +
            "</span>" +
            '<span class="dt-stock-tier ' +
            tierClass +
            '">' +
            escHtml(tierLabel) +
            "</span></div>" +
            '<div class="dt-stock-hero__price-row">' +
            '<span class="dt-stock-price dt-stock-price--hero">' +
            fmtPrice(st.price) +
            "</span>" +
            '<span class="dt-stock-pct ' +
            pctClass(st.changePct) +
            '">' +
            fmtPct(st.changePct) +
            "</span>" +
            '<span class="dt-stock-diff ' +
            pctClass(diff) +
            '">' +
            (diff > 0 ? "+" : "") +
            fmtPrice(diff) +
            "</span></div>" +
            '<div class="dt-stock-quote-pills">' +
            '<span class="dt-stock-quote-pill">昨收 ' +
            fmtPrice(prevClose) +
            "</span>" +
            '<span class="dt-stock-quote-pill">基准 ' +
            fmtPrice(st.basePrice) +
            "</span>" +
            '<span class="dt-stock-quote-pill ' +
            pctClass(devBase) +
            '">偏离 ' +
            fmtPct(devBase) +
            "</span></div>" +
            '<p class="dt-stock-hero__sub">全服统一报价 · 每 10 分钟天机波动 · 波段 ' +
            fmtPrice(ha.bandLo) +
            " ~ " +
            fmtPrice(ha.bandHi) +
            "</p>" +
            '<p class="dt-stock-hero__desc">' +
            escHtml(st.desc || "仙市流通标的，随天机涨跌。") +
            "</p></div></section>" +
            '<div class="dt-stock-trade-split">' +
            '<div class="dt-stock-trade-main">' +
            '<section class="dt-stock-chart-panel">' +
            '<div class="dt-stock-chart-head dt-stock-chart-head--rich">' +
            "<div><strong>天机走势</strong><span>近 " +
            ha.points +
            " 个采样点 · 约 12 小时</span></div>" +
            '<div class="dt-stock-chart-head__right">' +
            '<span class="' +
            pctClass(ha.sessionChg) +
            '">段内 ' +
            fmtPct(ha.sessionChg) +
            "</span>" +
            '<span class="' +
            pctClass(st.changePct) +
            '">本周期 ' +
            fmtPct(st.changePct) +
            "</span></div></div>" +
            '<div class="dt-stock-chart-canvas-wrap">' +
            '<canvas id="dtStockMainChart" class="dt-stock-chart dt-stock-chart--main"></canvas></div>' +
            '<div class="dt-stock-chart-ohlc">' +
            chartMetric("开盘", fmtPrice(ha.open)) +
            chartMetric("最高", fmtPrice(ha.high), "dt-stock-chart-metric--up") +
            chartMetric("最低", fmtPrice(ha.low), "dt-stock-chart-metric--down") +
            chartMetric("现价", fmtPrice(st.price), pctClass(st.changePct)) +
            "</div>" +
            '<div class="dt-stock-chart-insight">' +
            '<div class="dt-stock-range-bar">' +
            '<div class="dt-stock-range-bar__head"><span>区间位置</span><span>' +
            rangePosLabel(ha.rangePos) +
            " · " +
            ha.rangePos +
            "%</span></div>" +
            '<div class="dt-stock-range-bar__track"><i style="width:' +
            Math.min(100, ha.rangePos) +
            '%"></i><b style="left:' +
            Math.min(100, ha.rangePos) +
            '%"></b></div>' +
            '<div class="dt-stock-range-bar__foot"><span>低 ' +
            fmtPrice(ha.low) +
            "</span><span>高 " +
            fmtPrice(ha.high) +
            "</span></div></div>" +
            '<div class="dt-stock-range-bar dt-stock-range-bar--band">' +
            '<div class="dt-stock-range-bar__head"><span>天机波段</span><span>' +
            rangePosLabel(ha.bandPos) +
            " · " +
            ha.bandPos +
            "%</span></div>" +
            '<div class="dt-stock-range-bar__track"><i style="width:' +
            Math.min(100, ha.bandPos) +
            '%"></i><b style="left:' +
            Math.min(100, ha.bandPos) +
            '%"></b></div>' +
            '<div class="dt-stock-range-bar__foot"><span>下限 ' +
            fmtPrice(ha.bandLo) +
            '</span><span>上限 ' +
            fmtPrice(ha.bandHi) +
            "</span></div></div></div>" +
            '<div class="dt-stock-chart-foot">' +
            statChip("区间振幅", fmtPct(ha.ampPct)) +
            statChip("偏离基准", '<span class="' + pctClass(devBase) + '">' + fmtPct(devBase) + "</span>") +
            statChip("我的持仓", fmtNum(hold) + " 股") +
            statChip("持仓市值", fmtNum(holdValue) + " 灵石") +
            "</div></section>" +
            (pos
                ? '<div class="dt-stock-pos-banner ' +
                  pctClass(posPl) +
                  '"><span>本股浮动盈亏 <strong>' +
                  fmtSignedNum(posPl) +
                  "</strong> 灵石（" +
                  fmtProfitPct(posPlPct) +
                  "）</span><span>持仓均价 " +
                  fmtPrice(avgCost) +
                  " · 现价 " +
                  fmtPrice(st.price) +
                  "</span></div>"
                : "") +
            '<section class="dt-stock-feed">' +
            '<div class="dt-stock-feed-head"><h5>本股全服动态</h5><span>最近 ' +
            stockTrades.length +
            " 笔</span></div>" +
            '<ul class="dt-stock-feed-list">' +
            tradeFeed +
            "</ul></section></div>" +
            '<aside class="dt-stock-trade-side">' +
            '<section class="dt-stock-trade-box">' +
            '<div class="dt-stock-trade-box__head"><h5 class="dt-stock-trade-box__title">灵石交易</h5>' +
            '<span class="dt-stock-trade-box__tag">以灵石结算</span></div>' +
            '<div class="dt-stock-trade-box__caps">' +
            '<div><span class="dt-stock-cap-k">可用灵石</span><strong>' +
            fmtNum(gold) +
            "</strong></div>" +
            '<div><span class="dt-stock-cap-k">最多可买</span><strong>' +
            fmtNum(maxBuy) +
            " 股</strong></div>" +
            '<div><span class="dt-stock-cap-k">最多可卖</span><strong>' +
            fmtNum(maxSell) +
            " 股</strong></div></div>" +
            '<label class="dt-stock-label">交易数量<input type="text" inputmode="numeric" id="dtStockQtyInput" class="dt-stock-qty" value="' +
            escHtml(tradeQtyDraft) +
            '" autocomplete="off" placeholder="输入股数" /></label>' +
            '<div class="dt-stock-qty-presets">' +
            '<button type="button" class="dt-stock-qty-preset" data-qty="100">100</button>' +
            '<button type="button" class="dt-stock-qty-preset" data-qty="1000">1000</button>' +
            '<button type="button" class="dt-stock-qty-preset" data-qty="10000">1万</button>' +
            '<button type="button" class="dt-stock-qty-preset" data-qty="100000">10万</button>' +
            '<button type="button" class="dt-stock-qty-preset dt-stock-qty-preset--max" data-qty-max="buy">可买满</button>' +
            '<button type="button" class="dt-stock-qty-preset dt-stock-qty-preset--max" data-qty-max="sell">可卖满</button>' +
            "</div>" +
            '<div class="dt-stock-est-grid">' +
            '<p class="dt-stock-est-line dt-stock-est-line--buy" id="dtStockEstBuy">买入预估：—</p>' +
            '<p class="dt-stock-est-line dt-stock-est-line--sell" id="dtStockEstSell">卖出预估：—</p>' +
            "</div>" +
            '<div class="dt-stock-trade-btns">' +
            '<button type="button" class="btn btn--sm btn--primary" id="dtStockBuyBtn">买入</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" id="dtStockSellBtn">卖出</button>' +
            "</div></section></aside></div></div>";

        var canvas = document.getElementById("dtStockMainChart");
        var chartDim = prepChartCanvas(canvas, 260);
        drawChart(canvas, st.history, st.changePct, {
            showGrid: true,
            basePrice: st.basePrice,
            prevPrice: prevClose,
            avgCost: avgCost,
            bandLo: ha.bandLo,
            bandHi: ha.bandHi,
            logicalW: chartDim && chartDim.logicalW,
            logicalH: chartDim && chartDim.logicalH,
        });

        var prevBtn = document.getElementById("dtStockPrevBtn");
        if (prevBtn) prevBtn.onclick = function () {
            navigateStock(-1);
        };
        var nextBtn = document.getElementById("dtStockNextBtn");
        if (nextBtn) nextBtn.onclick = function () {
            navigateStock(1);
        };
        var listBtn = document.getElementById("dtStockGoListBtn");
        if (listBtn) listBtn.onclick = function () {
            setTab(2);
        };

        var qtyInp = document.getElementById("dtStockQtyInput");
        function readQty() {
            var raw = String((qtyInp && qtyInp.value) || "").replace(/[^\d]/g, "");
            if (!raw) return 0;
            try {
                return Math.floor(Number(raw));
            } catch (e) {
                return 0;
            }
        }
        function updateEst() {
            var q = readQty();
            tradeQtyDraft = qtyInp ? qtyInp.value : String(q);
            var buyEl = document.getElementById("dtStockEstBuy");
            var sellEl = document.getElementById("dtStockEstSell");
            if (buyEl) {
                buyEl.innerHTML =
                    q > 0
                        ? "买入 <strong>" +
                          fmtNum(q) +
                          "</strong> 股 ≈ <strong>" +
                          fmtNum(Math.ceil(q * st.price)) +
                          "</strong> 灵石"
                        : "请输入买入数量";
            }
            if (sellEl) {
                sellEl.innerHTML =
                    q > 0
                        ? "卖出 <strong>" +
                          fmtNum(q) +
                          "</strong> 股 ≈ <strong>" +
                          fmtNum(Math.floor(q * st.price)) +
                          "</strong> 灵石"
                        : "请输入卖出数量";
            }
        }
        if (qtyInp) {
            qtyInp.oninput = updateEst;
            updateEst();
        }
        var presetBtns = host.querySelectorAll(".dt-stock-qty-preset");
        for (var pb = 0; pb < presetBtns.length; pb++) {
            (function (btn) {
                btn.onclick = function () {
                    var maxMode = btn.getAttribute("data-qty-max");
                    var v;
                    if (maxMode === "buy") v = maxBuy;
                    else if (maxMode === "sell") v = maxSell;
                    else v = Math.floor(Number(btn.getAttribute("data-qty")) || 0);
                    if (v < 0) v = 0;
                    tradeQtyDraft = String(v);
                    if (qtyInp) qtyInp.value = tradeQtyDraft;
                    updateEst();
                };
            })(presetBtns[pb]);
        }

        var buyBtn = document.getElementById("dtStockBuyBtn");
        if (buyBtn) buyBtn.onclick = function () {
            submitTrade("buy");
        };
        var sellBtn = document.getElementById("dtStockSellBtn");
        if (sellBtn) sellBtn.onclick = function () {
            submitTrade("sell");
        };
    }

    function round2(n) {
        return Math.round(Number(n) * 100) / 100;
    }

    function assetMetric(label, value, extraClass) {
        return (
            '<div class="dt-stock-metric ' +
            (extraClass || "") +
            '"><span class="dt-stock-metric__k">' +
            escHtml(label) +
            '</span><span class="dt-stock-metric__v">' +
            value +
            "</span></div>"
        );
    }

    function assetSectionTitle(title, hint) {
        return (
            '<div class="dt-stock-section-head">' +
            "<h4>" +
            escHtml(title) +
            "</h4>" +
            (hint ? '<span class="dt-stock-section-hint">' + escHtml(hint) + "</span>" : "") +
            "</div>"
        );
    }

    function goTradeStock(stockId) {
        if (!stockId) return;
        selectedStockId = stockId;
        setTab(0);
    }

    function renderAssetsPanel() {
        var host = document.getElementById("dtStockAssetsHost");
        if (!host || !state) return;
        var pf = state.portfolio || {};
        var positions = pf.positions || [];
        var mvTotal = Number(pf.marketValue) || 0;
        var unrealizedPl = Number(pf.unrealizedProfit) || 0;
        var unrealizedPlClass = pctClass(unrealizedPl);
        var unrealizedPct = pf.unrealizedProfitPct;
        var realizedPl = Number(pf.realizedProfit) || 0;
        var totalPl = Number(pf.totalStockProfit);
        if (!Number.isFinite(totalPl)) totalPl = unrealizedPl + realizedPl;
        var totalPlClass = pctClass(totalPl);
        var cashRatio = Number(pf.cashRatio) || 0;
        var stockRatio = Number(pf.stockRatio) || 0;
        var sectorMap = {};
        var i;
        for (i = 0; i < positions.length; i++) {
            var p0 = positions[i];
            var sec = p0.sector || "其他";
            if (!sectorMap[sec]) sectorMap[sec] = { mv: 0, pl: 0, count: 0 };
            sectorMap[sec].mv += Number(p0.marketValue) || 0;
            sectorMap[sec].pl += Number(p0.profit) || 0;
            sectorMap[sec].count += 1;
        }
        var sectorRows = Object.keys(sectorMap)
            .sort(function (a, b) {
                return sectorMap[b].mv - sectorMap[a].mv;
            })
            .map(function (sec) {
                var row = sectorMap[sec];
                var share = mvTotal > 0 ? round2((row.mv / mvTotal) * 100) : 0;
                return (
                    "<tr>" +
                    "<td><span class=\"dt-stock-sector-badge dt-stock-sector-badge--sm\">" +
                    escHtml(sec) +
                    "</span></td>" +
                    '<td class="dt-stock-td-num">' +
                    row.count +
                    "</td>" +
                    '<td class="dt-stock-td-num">' +
                    fmtNum(row.mv) +
                    "</td>" +
                    '<td class="dt-stock-td-num">' +
                    share +
                    "%</td>" +
                    '<td class="dt-stock-td-num ' +
                    pctClass(row.pl) +
                    '">' +
                    fmtSignedNum(row.pl) +
                    "</td></tr>"
                );
            })
            .join("");
        var rows = positions
            .map(function (p) {
                var share = mvTotal > 0 ? round2((p.marketValue / mvTotal) * 100) : 0;
                return (
                    '<tr class="dt-stock-asset-row" data-stock-id="' +
                    escHtml(p.id) +
                    '" title="点击进入该仙股交易">' +
                    "<td>" +
                    '<div class="dt-stock-asset-name">' +
                    escHtml(p.name) +
                    '<span class="dt-stock-code">' +
                    escHtml(p.code) +
                    "</span></div>" +
                    '<span class="dt-stock-sector-badge dt-stock-sector-badge--sm">' +
                    escHtml(p.sector) +
                    "</span></td>" +
                    '<td class="dt-stock-td-num">' +
                    fmtNum(p.qty) +
                    "</td>" +
                    "<td>" +
                    fmtPrice(p.avgCost) +
                    '<span class="dt-stock-asset-sub">总成本 ' +
                    fmtNum(p.costBasis) +
                    "</span></td>" +
                    "<td>" +
                    fmtPrice(p.price) +
                    ' <span class="dt-stock-pct ' +
                    pctClass(p.changePct) +
                    '">' +
                    fmtPct(p.changePct) +
                    "</span></td>" +
                    '<td class="dt-stock-td-num">' +
                    fmtNum(p.marketValue) +
                    "</td>" +
                    '<td class="dt-stock-td-num ' +
                    pctClass(p.profit) +
                    '">' +
                    fmtSignedNum(p.profit) +
                    '<span class="dt-stock-pct ' +
                    pctClass(p.profitPct) +
                    '">' +
                    fmtProfitPct(p.profitPct) +
                    "</span></td>" +
                    '<td class="dt-stock-td-num ' +
                    pctClass(p.todayProfit) +
                    '">' +
                    fmtSignedNum(p.todayProfit) +
                    '<span class="dt-stock-pct ' +
                    pctClass(p.todayProfitPct) +
                    '">' +
                    fmtProfitPct(p.todayProfitPct) +
                    "</span></td>" +
                    '<td class="dt-stock-td-share">' +
                    share +
                    '%<div class="dt-stock-share-bar"><i style="width:' +
                    Math.min(100, share) +
                    '%"></i></div></td>' +
                    "</tr>"
                );
            })
            .join("");
        var allocCards = positions
            .slice(0, 6)
            .map(function (p) {
                var share = mvTotal > 0 ? round2((p.marketValue / mvTotal) * 100) : 0;
                return (
                    '<button type="button" class="dt-stock-alloc-card" data-stock-id="' +
                    escHtml(p.id) +
                    '">' +
                    '<span class="dt-stock-alloc-card__name">' +
                    escHtml(p.name) +
                    "</span>" +
                    '<span class="dt-stock-alloc-card__pct">' +
                    share +
                    "%</span>" +
                    '<span class="dt-stock-alloc-card__val ' +
                    pctClass(p.profit) +
                    '">浮盈 ' +
                    fmtSignedNum(p.profit) +
                    "</span></button>"
                );
            })
            .join("");
        var todayTotalPl = 0;
        var totalShares = 0;
        var maxSharePct = "—";
        var maxMv = 0;
        for (i = 0; i < positions.length; i++) {
            todayTotalPl += Number(positions[i].todayProfit) || 0;
            totalShares += Number(positions[i].qty) || 0;
            var mv_i = Number(positions[i].marketValue) || 0;
            if (mv_i > maxMv) maxMv = mv_i;
        }
        if (positions.length && mvTotal > 0) {
            maxSharePct = round2((maxMv / mvTotal) * 100) + "%";
        }
        host.innerHTML =
            '<div class="dt-stock-assets-page">' +
            '<div class="dt-stock-assets-split">' +
            '<section class="wushen-arena-card dt-stock-panel-card dt-stock-panel-card--account">' +
            assetSectionTitle("账户总览", "现金与持仓构成") +
            '<div class="dt-stock-metric-grid dt-stock-metric-grid--3">' +
            assetMetric("总资产", fmtGold(pf.totalAssets || 0), "dt-stock-metric--hero") +
            assetMetric("灵石现金", fmtGold(pf.gold || 0) + '<span class="dt-stock-metric__sub">' + cashRatio + "%</span>") +
            assetMetric("持仓市值", fmtGold(mvTotal) + '<span class="dt-stock-metric__sub">' + stockRatio + "%</span>") +
            "</div>" +
            '<div class="dt-stock-composition dt-stock-composition--inline">' +
            '<div class="dt-stock-composition__head"><span>资产构成</span><span>蓝=现金 · 金=持仓</span></div>' +
            '<div class="dt-stock-composition__bar">' +
            '<i class="dt-stock-composition__cash" style="width:' +
            Math.min(100, cashRatio) +
            '%"></i>' +
            '<i class="dt-stock-composition__stock" style="width:' +
            Math.min(100, stockRatio) +
            '%"></i></div>' +
            '<div class="dt-stock-composition__labels">' +
            "<span>现金 " +
            fmtGold(pf.gold || 0) +
            "</span><span>持仓 " +
            fmtGold(mvTotal) +
            "</span></div></div>" +
            '<div class="dt-stock-metric-grid dt-stock-metric-grid--4 dt-stock-metric-grid--compact">' +
            assetMetric("持仓品种", positions.length + " / " + (state.stockCount || state.stocks.length)) +
            assetMetric("板块数", String(Object.keys(sectorMap).length)) +
            assetMetric("最大单股占比", maxSharePct) +
            assetMetric("持股总数", fmtNum(totalShares) + " 股") +
            "</div></section>" +
            '<section class="wushen-arena-card dt-stock-panel-card dt-stock-panel-card--pl ' +
            totalPlClass +
            '">' +
            assetSectionTitle("盈亏概览", "浮动 + 已实现") +
            '<div class="dt-stock-pl-hero ' +
            totalPlClass +
            '"><span class="dt-stock-pl-hero__k">仙市总盈亏</span><strong class="dt-stock-pl-hero__v">' +
            fmtSignedNum(totalPl) +
            " 灵石</strong></div>" +
            '<div class="dt-stock-metric-grid dt-stock-metric-grid--2">' +
            assetMetric(
                "浮动盈亏",
                fmtSignedNum(unrealizedPl) +
                    (unrealizedPct != null
                        ? ' <span class="dt-stock-pct ' + unrealizedPlClass + '">(' + fmtProfitPct(unrealizedPct) + ")</span>"
                        : ""),
                unrealizedPlClass
            ) +
            assetMetric("已实现盈亏", fmtSignedNum(realizedPl), pctClass(realizedPl)) +
            assetMetric("本周期浮动", fmtSignedNum(todayTotalPl), pctClass(todayTotalPl)) +
            assetMetric("持仓成本", fmtGold(pf.costTotal || 0)) +
            "</div></section></div>" +
            (positions.length
                ? '<section class="wushen-arena-card dt-stock-panel-card">' +
                  assetSectionTitle("重仓快览", "点击卡片进入交易") +
                  '<div class="dt-stock-alloc-grid dt-stock-alloc-grid--6">' +
                  allocCards +
                  "</div></section>"
                : "") +
            (positions.length
                ? '<section class="wushen-arena-card dt-stock-panel-card">' +
                  assetSectionTitle("板块分布") +
                  '<div class="dt-stock-table-wrap"><table class="dt-stock-table dt-stock-sector-table">' +
                  "<thead><tr><th>板块</th><th class=\"dt-stock-th-num\">只数</th><th class=\"dt-stock-th-num\">市值</th><th class=\"dt-stock-th-num\">占比</th><th class=\"dt-stock-th-num\">浮盈</th></tr></thead><tbody>" +
                  sectorRows +
                  "</tbody></table></div></section>"
                : "") +
            '<section class="wushen-arena-card dt-stock-panel-card">' +
            assetSectionTitle("持仓明细", positions.length ? "点击行进入对应仙股" : "") +
            '<p class="wushen-arena-muted dt-stock-asset-tip">盈亏 = 市值 − 持仓成本 · 本周期 = 相对上次行情刷新</p>' +
            '<div class="dt-stock-table-wrap dt-stock-table-wrap--assets"><table class="dt-stock-table dt-stock-asset-table">' +
            "<thead><tr>" +
            "<th>仙股</th><th class=\"dt-stock-th-num\">数量</th><th>成本</th><th>现价</th>" +
            '<th class="dt-stock-th-num">市值</th><th class="dt-stock-th-num">浮动盈亏</th><th class="dt-stock-th-num">本周期</th><th class="dt-stock-th-share">占比</th>' +
            "</tr></thead><tbody>" +
            (rows || '<tr><td colspan="8" class="wushen-arena-muted dt-stock-table-empty">暂无持仓，可前往股票交易或仙股榜选购</td></tr>') +
            "</tbody></table></div></section>" +
            '<section class="wushen-arena-card dt-stock-panel-card">' +
            assetSectionTitle("全服成交", "最近 " + Math.min(50, (state.globalLedger || []).length) + " 条") +
            '<p class="wushen-arena-muted dt-stock-asset-tip">全服修士买卖广播 · 点击记录进入对应仙股</p>' +
            '<div class="dt-stock-ledger-scroll">' +
            '<ul class="dt-stock-ledger dt-stock-ledger--rich dt-stock-ledger--global">' +
            ((state.globalLedger || [])
                .map(function (row) {
                    var sideZh = row.side === "buy" ? "买入" : "卖出";
                    var sideCls = row.side === "buy" ? "dt-stock-side--buy" : "dt-stock-side--sell";
                    var t = fmtLedgerTime(row.at);
                    return (
                        '<li class="dt-stock-ledger-row" data-stock-id="' +
                        escHtml(row.stockId || "") +
                        '" title="点击进入该仙股交易">' +
                        '<span class="dt-stock-ledger-side ' +
                        sideCls +
                        '">' +
                        escHtml(sideZh) +
                        "</span>" +
                        '<span class="dt-stock-ledger-player">' +
                        formatLedgerPlayerLabel(row) +
                        "</span>" +
                        '<span class="dt-stock-ledger-main">' +
                        escHtml(row.name) +
                        " ×" +
                        fmtNum(row.qty) +
                        " @ " +
                        fmtPrice(row.price) +
                        " · " +
                        fmtNum(row.amount) +
                        " 灵石</span>" +
                        (t ? '<span class="dt-stock-ledger-time">' + escHtml(t) + "</span>" : "") +
                        "</li>"
                    );
                })
                .join("") || '<li class="wushen-arena-muted dt-stock-ledger-empty">尚无全服成交</li>') +
            "</ul></div></section></div>";

        host.querySelectorAll(".dt-stock-asset-row, .dt-stock-alloc-card").forEach(function (el) {
            el.onclick = function () {
                goTradeStock(el.getAttribute("data-stock-id"));
            };
        });
        host.querySelectorAll(".dt-stock-ledger-row").forEach(function (li) {
            li.onclick = function () {
                var sid = li.getAttribute("data-stock-id");
                if (sid) goTradeStock(sid);
            };
        });
    }

    function renderGoldRankBody(body, res) {
        if (!body) return;
        var list = res && Array.isArray(res.list) ? res.list : [];
        var selfPid = null;
        try {
            if (typeof player !== "undefined" && player && player.dongtianPublicId != null) {
                var pid = Math.floor(Number(player.dongtianPublicId));
                if (Number.isFinite(pid) && pid >= 1 && pid <= 10000) selfPid = pid;
            }
        } catch (eSelf) {}
        if (!list.length) {
            body.innerHTML = '<p class="wushen-arena-muted dt-stock-rank-empty">暂无上榜修士</p>';
            return;
        }
        var rows = list
            .map(function (item, i) {
                var rank = item.rank != null ? item.rank : i + 1;
                var row = {
                    playerName: item.playerName || item.displayName || item.name || "神秘修士",
                    playerPublicId: item.playerPublicId,
                };
                var itemPid =
                    item.playerPublicId != null && Number.isFinite(Number(item.playerPublicId))
                        ? Math.floor(Number(item.playerPublicId))
                        : NaN;
                var isSelf = selfPid && itemPid === selfPid;
                var topCls = rank === 1 ? " dt-stock-rank-row--r1" : rank === 2 ? " dt-stock-rank-row--r2" : rank === 3 ? " dt-stock-rank-row--r3" : "";
                var assets = item.totalAssets != null ? item.totalAssets : item.score;
                return (
                    '<li class="dt-stock-rank-row' +
                    topCls +
                    (isSelf ? " dt-stock-rank-row--self" : "") +
                    '">' +
                    '<span class="dt-stock-rank-no">' +
                    rank +
                    "</span>" +
                    '<span class="dt-stock-rank-name" title="' +
                    escHtml(row.playerName) +
                    '">' +
                    formatLedgerPlayerLabel(row) +
                    "</span>" +
                    '<span class="dt-stock-rank-gold">' +
                    fmtNum(assets) +
                    "</span></li>"
                );
            })
            .join("");
        var foot =
            res && res.queryRank && res.queryRank.rank
                ? '<p class="wushen-arena-muted dt-stock-rank-self">你的排名：第 ' +
                  res.queryRank.rank +
                  " 名 · 总资产 " +
                  fmtNum(res.queryRank.totalAssets != null ? res.queryRank.totalAssets : res.queryRank.score) +
                  " 灵石</p>"
                : selfPid
                  ? '<p class="wushen-arena-muted dt-stock-rank-self">未入前 ' + list.length + " 名时可继续积累仙市资产</p>"
                  : "";
        body.innerHTML = '<ol class="dt-stock-rank-list">' + rows + "</ol>" + foot;
    }

    function loadGoldRankPanel(force) {
        var body = document.getElementById("dtStockGoldRankBody");
        if (!body) return;
        var now = Date.now();
        if (!force && goldRankCache && now - goldRankCacheAt < GOLD_RANK_TTL_MS) {
            renderGoldRankBody(body, goldRankCache);
            return;
        }
        body.innerHTML = '<p class="wushen-arena-muted dt-stock-rank-empty">加载中…</p>';
        api("GET", "/api/dongtian-stock/leaderboard?limit=30", undefined)
            .then(function (res) {
                if (!body.parentElement) return;
                if (!res || !res.ok) {
                    body.innerHTML =
                        '<p class="wushen-arena-muted dt-stock-rank-empty">' +
                        escHtml((res && res.message) || "排行榜加载失败") +
                        "</p>";
                    return;
                }
                goldRankCache = res;
                goldRankCacheAt = Date.now();
                renderGoldRankBody(body, res);
            })
            .catch(function (e) {
                if (!body.parentElement) return;
                body.innerHTML =
                    '<p class="wushen-arena-muted dt-stock-rank-empty">' + escHtml(e.message || String(e)) + "</p>";
            });
    }

    function renderListPanel() {
        var host = document.getElementById("dtStockListHost");
        if (!host || !state) return;
        var up = 0;
        var down = 0;
        var flat = 0;
        var sectorMap = {};
        var i;
        for (i = 0; i < state.stocks.length; i++) {
            var st0 = state.stocks[i];
            var c = Number(st0.changePct) || 0;
            if (c > 0) up++;
            else if (c < 0) down++;
            else flat++;
            if (st0.sector) sectorMap[st0.sector] = true;
        }
        var sectors = Object.keys(sectorMap).sort();
        var filterChips =
            '<button type="button" class="dt-stock-filter-chip' +
            (listSectorFilter === "全部" ? " dt-stock-filter-chip--active" : "") +
            '" data-sector="全部">全部</button>' +
            sectors
                .map(function (sec) {
                    return (
                        '<button type="button" class="dt-stock-filter-chip' +
                        (listSectorFilter === sec ? " dt-stock-filter-chip--active" : "") +
                        '" data-sector="' +
                        escHtml(sec) +
                        '">' +
                        escHtml(sec) +
                        "</button>"
                    );
                })
                .join("");
        var filtered = state.stocks.filter(function (st) {
            return listSectorFilter === "全部" || st.sector === listSectorFilter;
        });
        var rows = filtered
            .map(function (st, idx) {
                var tierClass = priceTierClass(st.basePrice);
                var tierLabel = priceTierLabel(st.basePrice);
                var dev = baseDevPct(st.price, st.basePrice);
                var hold = state.portfolio && state.portfolio.holdings ? state.portfolio.holdings[st.id] || 0 : 0;
                var sparkIdx = state.stocks.indexOf(st);
                if (sparkIdx < 0) sparkIdx = idx;
                return (
                    '<tr class="dt-stock-market-row ' +
                    pctClass(st.changePct) +
                    '" data-stock-id="' +
                    escHtml(st.id) +
                    '" title="点击进入 ' +
                    escHtml(st.name) +
                    ' 交易">' +
                    '<td class="dt-stock-market-name">' +
                    '<span class="dt-stock-market-glyph" aria-hidden="true">' +
                    escHtml(sectorGlyph(st.sector)) +
                    "</span>" +
                    '<div class="dt-stock-market-name__body">' +
                    "<strong>" +
                    escHtml(st.name) +
                    "</strong>" +
                    '<span class="dt-stock-code">' +
                    escHtml(st.code) +
                    "</span>" +
                    (hold > 0
                        ? '<span class="dt-stock-market-hold">持 ' + fmtNum(hold) + "</span>"
                        : "") +
                    "</div></td>" +
                    '<td><span class="dt-stock-sector-badge dt-stock-sector-badge--sm">' +
                    escHtml(st.sector) +
                    "</span></td>" +
                    '<td><span class="dt-stock-tier ' +
                    tierClass +
                    '">' +
                    escHtml(tierLabel) +
                    "</span></td>" +
                    '<td class="dt-stock-market-price">' +
                    fmtPrice(st.price) +
                    "</td>" +
                    '<td class="' +
                    pctClass(st.changePct) +
                    '">' +
                    fmtPct(st.changePct) +
                    "</td>" +
                    '<td class="' +
                    pctClass(dev) +
                    '">' +
                    fmtPct(dev) +
                    "</td>" +
                    '<td class="dt-stock-market-spark-cell">' +
                    '<canvas class="dt-stock-spark dt-stock-spark--row" data-spark-idx="' +
                    sparkIdx +
                    '" width="120" height="36"></canvas></td>' +
                    '<td class="dt-stock-market-action"><span class="dt-stock-market-go">交易</span></td>' +
                    "</tr>"
                );
            })
            .join("");
        host.innerHTML =
            '<section class="wushen-arena-card dt-stock-market-card">' +
            '<div class="dt-stock-market-head">' +
            "<div><h4 class=\"wushen-arena-card-title\">仙股榜</h4>" +
            '<p class="wushen-arena-muted dt-stock-market-tip">共 ' +
            state.stocks.length +
            " 只 · 上涨 " +
            up +
            " · 下跌 " +
            down +
            (flat ? " · 平盘 " + flat : "") +
            " · 点击行进入交易</p></div>" +
            '<div class="dt-stock-market-legend">' +
            '<span class="dt-stock-tier dt-stock-tier--common">凡品</span>' +
            '<span class="dt-stock-tier dt-stock-tier--fine">千级</span>' +
            '<span class="dt-stock-tier dt-stock-tier--rare">万级+</span>' +
            '<span class="dt-stock-tier dt-stock-tier--epic">百万级+</span>' +
            '<span class="dt-stock-tier dt-stock-tier--legend">亿级</span>' +
            "</div></div>" +
            '<div class="dt-stock-filter-bar">' +
            filterChips +
            "</div>" +
            '<div class="dt-stock-list-scroll">' +
            '<div class="dt-stock-table-wrap dt-stock-table-wrap--market">' +
            '<table class="dt-stock-table dt-stock-market-table">' +
            "<thead><tr>" +
            "<th>仙股</th><th>板块</th><th>档位</th><th>现价</th><th>涨跌</th><th>偏离</th><th>走势</th><th></th>" +
            "</tr></thead><tbody>" +
            (rows ||
                '<tr><td colspan="8" class="wushen-arena-muted">该板块暂无仙股</td></tr>') +
            "</tbody></table></div></div></section>";

        host.querySelectorAll(".dt-stock-filter-chip").forEach(function (chip) {
            chip.onclick = function () {
                listSectorFilter = chip.getAttribute("data-sector") || "全部";
                renderListPanel();
            };
        });
        host.querySelectorAll(".dt-stock-market-row").forEach(function (row) {
            row.onclick = function () {
                goTradeStock(row.getAttribute("data-stock-id"));
            };
        });
        host.querySelectorAll(".dt-stock-spark--row").forEach(function (cv) {
            var idx = Number(cv.getAttribute("data-spark-idx"));
            var st = state.stocks[idx];
            if (st) drawChart(cv, st.history, st.changePct, { compact: true });
        });
    }

    function fmtCountdownMs(ms) {
        var sec = Math.max(0, Math.floor(Number(ms) / 1000));
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        return h + "时" + m + "分" + s + "秒";
    }

    function renderShopPanelBody(host, shop) {
        if (!host) return;
        if (!shop || !shop.ok) {
            host.innerHTML = '<p class="wushen-arena-muted">商场数据加载失败</p>';
            return;
        }
        var resetLine =
            shop.nextResetAt != null
                ? "距限购刷新 " + fmtCountdownMs(shop.nextResetAt - Date.now())
                : "每日 12:01 刷新";
        var products = Array.isArray(shop.products) ? shop.products : [];
        var cards = products
            .map(function (item) {
                var bought = !!item.bought;
                var canBuy = !!item.canBuy && !shopBuying;
                var btnCls = bought
                    ? "dt-stock-shop-btn dt-stock-shop-btn--done"
                    : canBuy
                      ? "dt-stock-shop-btn"
                      : "dt-stock-shop-btn dt-stock-shop-btn--disabled";
                var btnLabel = bought ? "今日已兑" : canBuy ? "兑换" : item.bought ? "今日已兑" : "灵石不足";
                var statusCls = bought
                    ? " dt-stock-shop-item--bought"
                    : canBuy
                      ? " dt-stock-shop-item--ready"
                      : " dt-stock-shop-item--locked";
                return (
                    '<article class="dt-stock-shop-item' +
                    statusCls +
                    '">' +
                    '<div class="dt-stock-shop-item__cost">' +
                    fmtNum(item.goldCost) +
                    " 灵石</div>" +
                    '<div class="dt-stock-shop-item__arrow" aria-hidden="true">→</div>' +
                    '<div class="dt-stock-shop-item__reward">' +
                    stockRewardLabel(item.yuqiMaterialPack != null ? item.yuqiMaterialPack : item.networkCoin) +
                    "</div>" +
                    '<button type="button" class="' +
                    btnCls +
                    '" data-shop-id="' +
                    escHtml(item.id) +
                    '"' +
                    (canBuy ? "" : " disabled") +
                    ">" +
                    escHtml(btnLabel) +
                    "</button></article>"
                );
            })
            .join("");
        host.innerHTML =
            '<section class="wushen-arena-card dt-stock-shop-page">' +
            '<div class="dt-stock-shop-head">' +
            '<h4 class="wushen-arena-card-title">灵石商场</h4>' +
            '<span class="dt-stock-shop-hint">灵石换御器材料包</span></div>' +
            '<p class="wushen-arena-muted dt-stock-shop-tip">每档商品每日限购 1 次 · 北京时间每日 12:01 刷新限购次数</p>' +
            '<div class="dt-stock-shop-summary">' +
            '<span>灵石现金 <strong>' +
            fmtNum(shop.playerGold || 0) +
            "</strong></span>" +
            '<span>御器材料包 <strong>' +
            fmtNum(shop.yuqiMaterialPack != null ? shop.yuqiMaterialPack : shop.networkCoin || 0) +
            "</strong></span>" +
            '<span class="dt-stock-shop-reset" id="dtStockShopResetLine">' +
            escHtml(resetLine) +
            "</span></div>" +
            '<div class="dt-stock-shop-grid">' +
            (cards || '<p class="wushen-arena-muted dt-stock-shop-empty">暂无商品</p>') +
            "</div></section>";

        host.querySelectorAll(".dt-stock-shop-btn:not(.dt-stock-shop-btn--done):not(.dt-stock-shop-btn--disabled)").forEach(function (btn) {
            btn.onclick = function () {
                var pid = btn.getAttribute("data-shop-id");
                if (pid) buyShopProduct(pid);
            };
        });
    }

    function renderShopPanel() {
        var host = document.getElementById("dtStockShopHost");
        if (!host) return;
        if (!shopState) {
            host.innerHTML = '<p class="wushen-arena-muted dt-stock-shop-empty">加载中…</p>';
            loadShopPanel(false);
            return;
        }
        renderShopPanelBody(host, shopState);
    }

    function loadShopPanel(force) {
        var host = document.getElementById("dtStockShopHost");
        if (!host) return;
        if (!force && shopState && shopState._loadedAt && Date.now() - shopState._loadedAt < 30000) {
            renderShopPanelBody(host, shopState);
            return;
        }
        if (!shopState) {
            host.innerHTML = '<p class="wushen-arena-muted dt-stock-shop-empty">加载中…</p>';
        }
        api("GET", "/api/dongtian-stock/shop" + stockClientGoldQuery(), undefined)
            .then(function (res) {
                if (!host.parentElement) return;
                if (!res || !res.ok) {
                    host.innerHTML =
                        '<p class="wushen-arena-muted dt-stock-shop-empty">' +
                        escHtml((res && res.message) || "商场加载失败") +
                        "</p>";
                    return;
                }
                res._loadedAt = Date.now();
                shopState = res;
                mergeLocalGoldIntoState();
                renderShopPanelBody(host, shopState);
            })
            .catch(function (e) {
                if (!host.parentElement) return;
                host.innerHTML =
                    '<p class="wushen-arena-muted dt-stock-shop-empty">' + escHtml(e.message || String(e)) + "</p>";
            });
    }

    function buyShopProduct(productId) {
        if (shopBuying || !productId) return;
        shopBuying = true;
        renderShopPanel();
        flushBeforeStockApi().then(function () {
            return api("POST", "/api/dongtian-stock/shop/buy", stockClientGoldBody({ productId: productId }));
        })
            .then(function (res) {
                shopBuying = false;
                if (!res || !res.ok) {
                    toast((res && res.message) || "兑换失败", true);
                    renderShopPanel();
                    return;
                }
                if (res.stocks) {
                    state = res;
                    state._localBase = Date.now();
                    state._serverBase = state.serverNow || Date.now();
                    mergeLocalGoldIntoState();
                    goldRankCache = null;
                    renderHeaderMeta();
                }
                if (res.shop) {
                    res.shop._loadedAt = Date.now();
                    shopState = res.shop;
                } else {
                    shopState = null;
                }
                toast(res.message || "兑换成功");
                return reloadDongtianSaveFromServer(res).then(function () {
                    renderHeaderMeta();
                    renderShopPanel();
                    if (typeof updateStats === "function") updateStats();
                });
            })
            .catch(function (e) {
                shopBuying = false;
                toast(e.message || String(e), true);
                renderShopPanel();
            });
    }

    function renderRankPanel() {
        var host = document.getElementById("dtStockRankHost");
        if (!host) return;
        host.innerHTML =
            '<section class="wushen-arena-card dt-stock-rank-page">' +
            '<div class="dt-stock-rank-head">' +
            '<h4 class="wushen-arena-card-title">灵石排行榜</h4>' +
            '<span class="dt-stock-rank-hint">仙市总资产</span></div>' +
            '<p class="wushen-arena-muted dt-stock-rank-tip">按修仙股票总资产排序（灵石现金 + 持仓市值）· 同 IP 仅保留最高 · 前 30 名</p>' +
            '<div id="dtStockGoldRankBody" class="dt-stock-rank-body dt-stock-rank-body--page">' +
            '<p class="wushen-arena-muted dt-stock-rank-empty">加载中…</p></div></section>';
        loadGoldRankPanel(false);
    }

    function renderAll() {
        renderHeaderMeta();
        if (activeTab === 0) renderTradePanel();
        else if (activeTab === 1) renderAssetsPanel();
        else if (activeTab === 2) renderListPanel();
        else if (activeTab === 3) renderRankPanel();
        else renderShopPanel();
    }

    function loadState(showToast) {
        return flushBeforeStockApi().then(function () {
            return api("GET", "/api/dongtian-stock/state" + stockClientGoldQuery(), undefined);
        })
            .then(function (res) {
                if (!res || !res.ok) {
                    toast((res && res.message) || "加载失败", true);
                    return;
                }
                state = res;
                state._localBase = Date.now();
                state._serverBase = state.serverNow || Date.now();
                mergeLocalGoldIntoState();
                goldRankCache = null;
                shopState = null;
                renderAll();
                if (showToast) toast("行情已刷新");
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function submitTrade(side) {
        var qtyInp = document.getElementById("dtStockQtyInput");
        var stockId = selectedStockId;
        var raw = String((qtyInp && qtyInp.value) || "").replace(/[^\d]/g, "");
        var qty = Math.floor(Number(raw));
        if (!Number.isFinite(qty) || qty <= 0) {
            toast("请输入有效数量", true);
            return;
        }
        flushBeforeStockApi().then(function () {
            return api("POST", "/api/dongtian-stock/trade", stockClientGoldBody({ stockId: stockId, side: side, qty: qty }));
        })
            .then(function (res) {
                if (!res || !res.ok) {
                    toast((res && res.message) || "交易失败", true);
                    return;
                }
                state = res;
                state._localBase = Date.now();
                state._serverBase = state.serverNow || Date.now();
                mergeLocalGoldIntoState();
                toast(res.message || "交易成功");
                return reloadDongtianSaveFromServer(res).then(function () {
                    renderAll();
                    if (typeof updateStats === "function") updateStats();
                });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(function () {
            var modal = document.getElementById("dongtianStockModal");
            if (!modal || modal.style.display === "none") {
                stopAutoRefresh();
                return;
            }
            loadState(false);
        }, 30000);
        tickCountdownTimer = setInterval(function () {
            var modal = document.getElementById("dongtianStockModal");
            if (!modal || modal.style.display === "none") {
                stopTickCountdown();
                return;
            }
            updateTickLine();
        }, 1000);
    }

    function stopTickCountdown() {
        if (tickCountdownTimer) {
            clearInterval(tickCountdownTimer);
            tickCountdownTimer = null;
        }
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
        stopTickCountdown();
    }

    function wireOnce() {
        var modal = document.getElementById("dongtianStockModal");
        if (!modal || modal._dtStockWired) return;
        modal._dtStockWired = true;
        var closeBtn = document.getElementById("dongtianStockCloseBtn");
        if (closeBtn) closeBtn.onclick = closeModal;
        var refreshBtn = document.getElementById("dongtianStockRefreshBtn");
        if (refreshBtn) refreshBtn.onclick = function () {
            loadState(true);
        };
        var tabIds = ["dtStockTabTrade", "dtStockTabAssets", "dtStockTabList", "dtStockTabRank", "dtStockTabShop"];
        for (var i = 0; i < tabIds.length; i++) {
            (function (idx) {
                var btn = document.getElementById(tabIds[idx]);
                if (!btn || btn._dtStockTabBound) return;
                btn._dtStockTabBound = true;
                btn.onclick = function () {
                    setTab(idx);
                };
            })(i);
        }
    }

    function openModal() {
        wireOnce();
        var modal = document.getElementById("dongtianStockModal");
        if (!modal) return;
        setTab(0);
        modal.style.display = "flex";
        loadState(false)
            .then(function () {
                startAutoRefresh();
            })
            .catch(function () {
                startAutoRefresh();
            });
    }

    function closeModal() {
        stopAutoRefresh();
        var modal = document.getElementById("dongtianStockModal");
        if (modal) modal.style.display = "none";
    }

    window.initDongtianStockUI = function () {
        wireOnce();
        var hubBtn = document.getElementById("dongtianHubMenuStockBtn");
        if (hubBtn && !hubBtn._dtStockHub) {
            hubBtn._dtStockHub = true;
            hubBtn.onclick = function () {
                if (typeof window.closeDongtianHubMenuModal === "function") window.closeDongtianHubMenuModal();
                openModal();
            };
        }
    };

    window.openDongtianStockModal = openModal;
    window.closeDongtianStockModal = closeModal;
})();
