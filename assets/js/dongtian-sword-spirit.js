/**
 * 洞天劫 · 剑灵云游：休闲异步游历界面
 */
(function () {
    function api(method, path, body) {
        if (typeof window.dongtianSwordSpiritIsLocalMode === "function" && window.dongtianSwordSpiritIsLocalMode()) {
            if (typeof window.dongtianSwordSpiritLocalApi === "function") {
                return window.dongtianSwordSpiritLocalApi(method, path, body);
            }
            return Promise.reject(new Error("单机剑灵模块未加载"));
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
        clearTimeout(el._ssT);
        el._ssT = setTimeout(function () {
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

    /** 图鉴卡片机缘：两列网格，标签与数值同行，避免换行拆开 */
    function curioCardStatsHtml(bonus) {
        var b = bonus || {};
        var parts = [];
        function push(label, val) {
            var n = Number(val);
            if (isNaN(n) || !val) return;
            parts.push(
                '<span class="dt-ss-curio-stat">' +
                    '<span class="dt-ss-curio-stat__k">' +
                    escHtml(label) +
                    '</span><span class="dt-ss-curio-stat__v">+' +
                    n.toFixed(2) +
                    "%</span></span>"
            );
        }
        push("气血", b.hp);
        push("力道", b.atk);
        push("护体", b.def);
        push("身法", b.atkSpd);
        push("吸血", b.vamp);
        push("会心", b.critRate);
        push("暴伤", b.critDmg);
        if (!parts.length) {
            return '<div class="dt-ss-curio-stats dt-ss-curio-stats--empty"><span class="dt-ss-curio-stat dt-ss-curio-stat--empty">机缘</span></div>';
        }
        return '<div class="dt-ss-curio-stats">' + parts.join("") + "</div>";
    }

    function fmtDur(ms) {
        var n = Math.max(0, Math.floor(Number(ms) || 0));
        if (n < 60000) return "不足 1 分钟";
        var m = Math.floor(n / 60000);
        if (m < 60) return m + " 分钟";
        var h = Math.floor(m / 60);
        m = m % 60;
        if (h < 48) return h + " 小时" + (m ? m + " 分" : "");
        var d = Math.floor(h / 24);
        h = h % 24;
        return d + " 天" + (h ? h + " 小时" : "");
    }

    /** 服务端 /api/dongtian-sword-spirit/curio-catalog 写入；供机缘聚合与秘藏品质展示 */
    function setSwordSpiritCurioCatalog(defs) {
        if (!Array.isArray(defs)) return;
        var m = {};
        for (var i = 0; i < defs.length; i++) {
            var d = defs[i];
            if (!d || !d.id) continue;
            m[String(d.id).trim()] = d;
        }
        window.__dtSsCurioById = m;
    }
    window.setSwordSpiritCurioCatalog = setSwordSpiritCurioCatalog;

    function ssCurioCatalogSize() {
        if (window.__dtSsCurioById) return Object.keys(window.__dtSsCurioById).length;
        return 200;
    }

    function ssCurioDefById(id) {
        var s = String(id || "").trim();
        if (window.__dtSsCurioById && window.__dtSsCurioById[s]) return window.__dtSsCurioById[s];
        return null;
    }

    /** @returns {Promise<boolean>} 是否已具备足够图鉴条目供机缘汇总 */
    function ensureSwordSpiritCurioCatalog() {
        if (window.__dtSsCurioById && Object.keys(window.__dtSsCurioById).length >= 200) {
            return Promise.resolve(true);
        }
        return api("GET", "/api/dongtian-sword-spirit/curio-catalog", undefined)
            .then(function (cat) {
                if (cat && cat.ok && Array.isArray(cat.defs) && cat.defs.length) {
                    setSwordSpiritCurioCatalog(cat.defs);
                    var n = window.__dtSsCurioById ? Object.keys(window.__dtSsCurioById).length : 0;
                    return n >= 100;
                }
                return false;
            })
            .catch(function () {
                return false;
            });
    }

    function aggregateSwordSpiritCurioBonuses() {
        var out = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        if (typeof player === "undefined" || !player) return out;
        var st = player.swordSpiritTravel;
        if (!st || !Array.isArray(st.curios)) return out;
        st.curios.forEach(function (row) {
            if (!row || !row.id) return;
            var d = ssCurioDefById(row.id);
            if (!d || !d.bonus) return;
            var b = d.bonus;
            Object.keys(out).forEach(function (k) {
                var v = Number(b[k]);
                if (isFinite(v)) out[k] += v;
            });
        });
        return out;
    }
    window.aggregateSwordSpiritCurioBonuses = aggregateSwordSpiritCurioBonuses;

    var LABELS = {
        life_potion: "生命药剂",
        gem_material_pack: "宝石材料包",
        yuqi_material_pack: "御器材料包",
        enhance_stone: "强化石",
        enchant_stone: "附魔石",
        god_essence_stone: "神萃石",
        pet_exp_fruit: "灵宠经验果实",
    };

    function ssDreamUsesEnhanceStone(st) {
        if (st && st.dreamCostMaterial === "enhance_stone") return true;
        if (st && st.localMode) return true;
        if (typeof window.dongtianSwordSpiritIsLocalMode === "function" && window.dongtianSwordSpiritIsLocalMode()) {
            return true;
        }
        return false;
    }

    function ssEnhanceStoneCount(st) {
        if (st && typeof st.enhanceStone === "number" && !isNaN(st.enhanceStone)) {
            return Math.max(0, Math.floor(st.enhanceStone));
        }
        if (typeof getMaterialCount === "function") {
            var key =
                typeof MATERIAL_ENHANCE_STONE !== "undefined" ? MATERIAL_ENHANCE_STONE : "enhance_stone";
            return Math.max(0, Math.floor(Number(getMaterialCount(key)) || 0));
        }
        if (typeof player !== "undefined" && player && player.inventory && player.inventory.materials) {
            return Math.max(0, Math.floor(Number(player.inventory.materials.enhance_stone) || 0));
        }
        return 0;
    }

    function ssDreamCostText(st) {
        var cost = Math.max(0, Math.floor(Number(st && st.dreamCostCoin) || 0));
        if (ssDreamUsesEnhanceStone(st)) {
            if (!cost) cost = 20;
            return cost + " 强化石";
        }
        return String(cost);
    }

    var inFlight = false;
    var etaTimer = null;

    function stopEtaTicker() {
        if (etaTimer) {
            clearInterval(etaTimer);
            etaTimer = null;
        }
    }

    /** 避免局部变量遗漏/合并冲突导致 ReferenceError；与 #dtSsDreamRow 单点同步 */
    function setDtSsDreamRowDisplay(phase) {
        var el = document.getElementById("dtSsDreamRow");
        if (!el) return;
        el.style.display = phase === "traveling" ? "flex" : "none";
    }

    /** 弹窗打开且云游中时，按 returnAt 每秒刷新归期文案；到期自动拂尘拉 state */
    function syncEtaTicker() {
        stopEtaTicker();
        var modal = document.getElementById("dongtianSwordSpiritModal");
        if (!modal || modal.style.display !== "flex") return;
        var st = lastState;
        if (!st || !st.ok || st.phase !== "traveling") return;
        var ret = typeof st.returnAt === "number" && !isNaN(st.returnAt) ? st.returnAt : 0;
        if (!ret) return;
        function tick() {
            var st2 = lastState;
            var etaEl = document.getElementById("dtSsEtaLine");
            if (!etaEl || !st2 || !st2.ok || st2.phase !== "traveling") {
                stopEtaTicker();
                return;
            }
            var r = typeof st2.returnAt === "number" && !isNaN(st2.returnAt) ? st2.returnAt : ret;
            var left = Math.max(0, r - Date.now());
            if (left <= 0) {
                etaEl.textContent = "归期已至，请「拂尘刷新」同步劫尘与收纳。";
                stopEtaTicker();
                loadState().catch(function () {});
                return;
            }
            etaEl.textContent = "天机示约：" + fmtDur(left) + "（劫数流转，或有先后）";
        }
        tick();
        etaTimer = setInterval(tick, 1000);
    }

    function reloadDongtianSaveFromServer(apiRes) {
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

    function loadState() {
        return ensureSwordSpiritCurioCatalog().then(function (catalogOk) {
            return api("GET", "/api/dongtian-sword-spirit/state", undefined).then(function (res) {
                lastState = res;
                render();
                if (catalogOk === false) {
                    var modal = document.getElementById("dongtianSwordSpiritModal");
                    if (modal && modal.style.display === "flex" && !modal._dtSsCatalogToastShown) {
                        modal._dtSsCatalogToastShown = true;
                        toast("秘藏图鉴未载全，「秘藏·加成」机缘汇总可能暂不准；请拂尘刷新重试。", true);
                    }
                }
                return res;
            });
        });
    }

    function render() {
        try {
            renderSwordSpiritPanel();
        } catch (err) {
            try {
                console.error("[剑灵云游] render", err);
            } catch (eLog) {}
            toast((err && err.message) || "剑灵云游界面渲染异常，请刷新重试。", true);
        } finally {
            syncEtaTicker();
        }
    }

    function renderSwordSpiritPanel() {
        var st = lastState;
        var phaseEl = document.getElementById("dtSsPhaseLine");
        var etaEl = document.getElementById("dtSsEtaLine");
        var floorEl = document.getElementById("dtSsFloorLine");
        var coinEl = document.getElementById("dtSsCoinLine");
        var logEl = document.getElementById("dtSsLogList");
        var rewardEl = document.getElementById("dtSsRewardBox");
        var departBtn = document.getElementById("dtSsDepartBtn");
        var collectBtn = document.getElementById("dtSsCollectBtn");
        var dreamWrap = document.getElementById("dtSsDreamLogWrap");
        var dreamList = document.getElementById("dtSsDreamMsgList");

        if (!st || !st.ok) {
            stopEtaTicker();
            setDtSsDreamRowDisplay("");
            if (phaseEl) phaseEl.textContent = (st && st.message) || "状态加载失败";
            return;
        }

        if (floorEl)
            floorEl.textContent =
                "历史最高秘境层数：" +
                st.maxDungeonFloor +
                "（机缘与秘藏掉落与此略相关；秘藏凡品至劫墟，品阶愈高愈难遇）";
        if (coinEl) {
            if (ssDreamUsesEnhanceStone(st)) {
                coinEl.textContent =
                    "行囊强化石：" +
                    ssEnhanceStoneCount(st) +
                    "（神识托梦每次 " +
                    ssDreamCostText(st) +
                    "）";
            } else {
                coinEl.textContent =
                    "灵网联网币：" + st.coinAmount + "（神识托梦每次 " + st.dreamCostCoin + "）";
            }
        }

        var countLine = document.getElementById("dtSsCurioCountLine");
        var bonusBits = document.getElementById("dtSsCurioBonusBits");
        var curioGrid = document.getElementById("dtSsCurioGrid");
        if (countLine) {
            var totalKinds = st.curioTotalKinds || ssCurioCatalogSize();
            countLine.textContent = "已纳秘藏 " + (st.curioCount || 0) + " / " + totalKinds + " 种。";
        }
        if (bonusBits) {
            var cb = st.curioBonus || {};
            var bits = [];
            if (cb.hp) bits.push("气血+" + Number(cb.hp).toFixed(2) + "%");
            if (cb.atk) bits.push("力道+" + Number(cb.atk).toFixed(2) + "%");
            if (cb.def) bits.push("护体+" + Number(cb.def).toFixed(2) + "%");
            if (cb.atkSpd) bits.push("身法+" + Number(cb.atkSpd).toFixed(2) + "%");
            if (cb.vamp) bits.push("吸血+" + Number(cb.vamp).toFixed(2) + "%");
            if (cb.critRate) bits.push("会心+" + Number(cb.critRate).toFixed(2) + "%");
            if (cb.critDmg) bits.push("暴伤+" + Number(cb.critDmg).toFixed(2) + "%");
            if (!bits.length) {
                bonusBits.innerHTML =
                    '<li class="dt-ss-curio-bonus-bits__empty">暂无累计机缘。剑魄自红尘携物归来，纳藏后方入册。</li>';
            } else {
                bonusBits.innerHTML = bits
                    .map(function (line) {
                        return '<li class="dt-ss-curio-bonus-bits__item">' + escHtml(line) + "</li>";
                    })
                    .join("");
            }
        }
        if (curioGrid) {
            var list = st.curios || [];
            if (!list.length) {
                curioGrid.innerHTML = '<p class="dt-ss-muted dt-ss-curio-empty">暂无秘藏。剑魄归来收纳劫尘时，或携回一件。</p>';
            } else {
                curioGrid.innerHTML = list
                    .map(function (c) {
                        var nm = escHtml(c.name || c.id || "");
                        var lr = c.lore ? '<span class="dt-ss-curio-lore">' + escHtml(c.lore) + "</span>" : "";
                        var b = c.bonus || {};
                        var titleStat = [];
                        if (b.hp) titleStat.push("气血+" + Number(b.hp).toFixed(2) + "%");
                        if (b.atk) titleStat.push("力道+" + Number(b.atk).toFixed(2) + "%");
                        if (b.def) titleStat.push("护体+" + Number(b.def).toFixed(2) + "%");
                        if (b.atkSpd) titleStat.push("身法+" + Number(b.atkSpd).toFixed(2) + "%");
                        if (b.vamp) titleStat.push("吸血+" + Number(b.vamp).toFixed(2) + "%");
                        if (b.critRate) titleStat.push("会心+" + Number(b.critRate).toFixed(2) + "%");
                        if (b.critDmg) titleStat.push("暴伤+" + Number(b.critDmg).toFixed(2) + "%");
                        var q = c.quality || "common";
                        var ql = c.qualityLabel || "";
                        var qtag =
                            ql ?
                                '<span class="dt-ss-curio-quality dt-ss-curio-quality--' +
                                escHtml(q) +
                                '">' +
                                escHtml(ql) +
                                "</span>"
                            :   "";
                        return (
                            '<div class="dt-ss-curio-card dt-ss-curio-card--quality-' +
                            escHtml(q) +
                            '" title="' +
                            escHtml((c.lore || "") + (titleStat.length ? " " + titleStat.join(" ") : "")) +
                            '">' +
                            '<div class="dt-ss-curio-head">' +
                            qtag +
                            '<span class="dt-ss-curio-name">' +
                            nm +
                            "</span></div>" +
                            curioCardStatsHtml(b) +
                            lr +
                            "</div>"
                        );
                    })
                    .join("");
            }
        }

        if (phaseEl) {
            if (st.phase === "idle") phaseEl.textContent = "剑魄在侧，可至「行囊」页纳芥送别。";
            else if (st.phase === "traveling") phaseEl.textContent = "剑魄已遁入红尘劫尘，山河为笺，归期难卜。";
            else phaseEl.textContent = "剑魄已归，劫尘满腹——请至「归缘托梦」收纳。";
        }
        if (etaEl) {
            if (st.phase === "traveling") {
                var retAt = typeof st.returnAt === "number" && !isNaN(st.returnAt) ? st.returnAt : 0;
                var leftMs = retAt > 0 ? Math.max(0, retAt - Date.now()) : Math.max(0, st.etaMs || 0);
                if (leftMs > 0) {
                    etaEl.textContent = "天机示约：" + fmtDur(leftMs) + "（劫数流转，或有先后）";
                } else {
                    etaEl.textContent = "归期已至或将近，请「拂尘刷新」同步劫尘与收纳。";
                }
            } else if (st.phase === "returned") {
                etaEl.textContent = "归期已至，请至「归缘托梦」页收纳劫尘。";
            } else {
                etaEl.textContent = "未在途中。";
            }
        }

        if (departBtn) departBtn.disabled = st.phase !== "idle" || inFlight;
        if (collectBtn) collectBtn.disabled = st.phase !== "returned" || inFlight;
        setDtSsDreamRowDisplay(st.phase);

        var keys = Object.keys(st.packingCap || {});
        var i;
        for (i = 0; i < keys.length; i++) {
            var k = keys[i];
            var cap = st.packingCap[k];
            var num = document.getElementById("dtSsPack_" + k);
            var mx = document.getElementById("dtSsPackMax_" + k);
            if (mx) mx.textContent = "上限 " + cap;
            if (num && st.phase === "idle") {
                num.max = String(cap);
                if (parseInt(num.value, 10) > cap) num.value = String(cap);
            }
            if (num) num.disabled = st.phase !== "idle" || inFlight;
        }

        if (logEl) {
            var logs = st.logs || [];
            if (!logs.length) {
                logEl.innerHTML = '<li class="dt-ss-log__empty">尚无纪闻。送剑魄远行后，劫尘流转，此处自会浮现笺上文字。</li>';
            } else {
                logEl.innerHTML = logs
                    .map(function (row) {
                        var tx = row.text || "";
                        var cls = "dt-ss-log__item";
                        if (tx.indexOf("【轶闻】") !== -1) cls += " dt-ss-log__item--qiwen";
                        return (
                            '<li class="' +
                            cls +
                            '"><span class="dt-ss-log__time">' +
                            escHtml(new Date(row.at || 0).toLocaleString("zh-CN", { hour12: false })) +
                            '</span><p class="dt-ss-log__text">' +
                            escHtml(tx) +
                            "</p></li>"
                        );
                    })
                    .join("");
            }
        }

        if (rewardEl) {
            if (st.phase !== "returned" || !st.pendingRewards) {
                rewardEl.innerHTML = "<p class=\"dt-ss-muted\">劫尘未至。剑魄归来后，于此清点机缘。</p>";
            } else {
                var pr = st.pendingRewards;
                var parts = [];
                var mk = pr.materials || {};
                Object.keys(mk).forEach(function (k) {
                    var q = parseInt(mk[k], 10) || 0;
                    if (q > 0) parts.push((LABELS[k] || k) + " ×" + q);
                });
                if (pr.networkCoin > 0 && !ssDreamUsesEnhanceStone(st)) parts.push("联网币 ×" + pr.networkCoin);
                var rollN = parseInt(String(pr.curioRollCount || "0"), 10) || 0;
                if (rollN > 0) parts.push("秘藏机缘判定 ×" + rollN);
                var curioHtml = "";
                var ncList = pr.newCurios && pr.newCurios.length ? pr.newCurios : pr.newCurio && pr.newCurio.id ? [pr.newCurio] : [];
                function oneCurioHtml(nc) {
                    if (!nc || !nc.id) return "";
                    var nb = nc.bonus || {};
                    var p2 = [];
                    if (nb.hp) p2.push("气血+" + Number(nb.hp).toFixed(2) + "%");
                    if (nb.atk) p2.push("力道+" + Number(nb.atk).toFixed(2) + "%");
                    if (nb.def) p2.push("护体+" + Number(nb.def).toFixed(2) + "%");
                    if (nb.atkSpd) p2.push("身法+" + Number(nb.atkSpd).toFixed(2) + "%");
                    if (nb.vamp) p2.push("吸血+" + Number(nb.vamp).toFixed(2) + "%");
                    if (nb.critRate) p2.push("会心+" + Number(nb.critRate).toFixed(2) + "%");
                    if (nb.critDmg) p2.push("暴伤+" + Number(nb.critDmg).toFixed(2) + "%");
                    return (
                        '<p class="dt-ss-reward-curio"><strong>秘藏' +
                        (nc.qualityLabel ? "（" + escHtml(nc.qualityLabel) + "）" : "") +
                        '：</strong>「' +
                        escHtml(nc.name || nc.id) +
                        '」' +
                        (nc.lore ? " — " + escHtml(nc.lore) : "") +
                        (p2.length ? " <em>机缘 " + escHtml(p2.join(" ")) + "</em>" : "") +
                        "（纳藏后机缘方入体）</p>"
                    );
                }
                if (ncList.length) {
                    curioHtml = ncList.map(oneCurioHtml).join("");
                }
                rewardEl.innerHTML =
                    "<p class=\"dt-ss-reward-title\">本次劫尘</p><p class=\"dt-ss-reward-body\">" +
                    (parts.length ? escHtml(parts.join("，")) : "唯见风尘一缕，无额外劫尘。") +
                    "</p>" +
                    curioHtml;
            }
        }

        if (dreamWrap && dreamList) {
            if (st.phase === "traveling") {
                dreamWrap.removeAttribute("hidden");
                var msgs = st.dreamMessages || [];
                if (msgs.length) {
                    dreamList.innerHTML = msgs
                        .map(function (row) {
                            var tx = row.text || "";
                            return (
                                '<li class="dt-ss-dream-msg__item"><span class="dt-ss-dream-msg__time">' +
                                escHtml(new Date(row.at || 0).toLocaleString("zh-CN", { hour12: false })) +
                                '</span><span class="dt-ss-dream-msg__text">' +
                                escHtml(tx) +
                                "</span></li>"
                            );
                        })
                        .join("");
                } else {
                    dreamList.innerHTML =
                        '<li class="dt-ss-dream-msg__empty dt-ss-muted">尚未托梦。每次耗费 ' +
                        escHtml(ssDreamCostText(st)) +
                        "，笺上留痕。</li>";
                }
            } else {
                dreamWrap.setAttribute("hidden", "");
                dreamList.innerHTML = "";
            }
        }
    }

    function readPackingFromForm() {
        var st = lastState;
        var packing = {};
        var keys = st && st.packingCap ? Object.keys(st.packingCap) : [];
        var i;
        for (i = 0; i < keys.length; i++) {
            var k = keys[i];
            var num = document.getElementById("dtSsPack_" + k);
            if (!num) continue;
            var v = Math.max(0, Math.floor(parseInt(String(num.value || "0"), 10) || 0));
            var cap = st.packingCap[k] || 0;
            if (v > cap) v = cap;
            if (v > 0) packing[k] = v;
        }
        return packing;
    }

    function switchSsCangSub(subKey) {
        var root = document.getElementById("dtSsPanelCang");
        if (!root || !subKey) return;
        var subs = root.querySelectorAll("[data-dt-ss-cang-sub]");
        var panels = root.querySelectorAll("[data-dt-ss-cang-panel]");
        var i;
        for (i = 0; i < subs.length; i++) {
            var t = subs[i];
            var on = t.getAttribute("data-dt-ss-cang-sub") === subKey;
            t.classList.toggle("dt-ss-subtab--active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        }
        for (i = 0; i < panels.length; i++) {
            var p = panels[i];
            var show = p.getAttribute("data-dt-ss-cang-panel") === subKey;
            p.classList.toggle("dt-ss-subpanel--active", show);
            if (show) p.removeAttribute("hidden");
            else p.setAttribute("hidden", "");
        }
    }

    var DT_SS_TAB_STORAGE_KEY = "dtSsActiveTab";

    function switchSsTab(key) {
        var modal = document.getElementById("dongtianSwordSpiritModal");
        if (!modal || !key) return;
        try {
            sessionStorage.setItem(DT_SS_TAB_STORAGE_KEY, key);
        } catch (eTab) {}
        var tabs = modal.querySelectorAll("[data-dt-ss-tab]");
        var panels = modal.querySelectorAll("[data-dt-ss-panel]");
        var i;
        for (i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            var on = t.getAttribute("data-dt-ss-tab") === key;
            t.classList.toggle("dt-ss-tab--active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        }
        for (i = 0; i < panels.length; i++) {
            var p = panels[i];
            var show = p.getAttribute("data-dt-ss-panel") === key;
            p.classList.toggle("dt-ss-tab-panel--active", show);
            if (show) p.removeAttribute("hidden");
            else p.setAttribute("hidden", "");
        }
        if (key === "cang") switchSsCangSub("tujian");
    }

    function openModal() {
        var modal = document.getElementById("dongtianSwordSpiritModal");
        if (!modal) return;
        modal._dtSsCatalogToastShown = false;
        wireOnce();
        var savedTab = "ling";
        try {
            var t = sessionStorage.getItem(DT_SS_TAB_STORAGE_KEY);
            if (t && String(t).length) savedTab = String(t);
        } catch (eOpenTab) {}
        switchSsTab(savedTab);
        modal.style.display = "flex";
        loadState().catch(function (e) {
            toast(e.message || String(e), true);
        });
    }

    function closeModal() {
        stopEtaTicker();
        var modal = document.getElementById("dongtianSwordSpiritModal");
        if (modal) modal.style.display = "none";
    }

    function wireOnce() {
        var modal = document.getElementById("dongtianSwordSpiritModal");
        if (!modal || modal._dtSsWired) return;
        modal._dtSsWired = true;
        var tabBtns = modal.querySelectorAll("[data-dt-ss-tab]");
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].addEventListener("click", function (ev) {
                var k = ev.currentTarget.getAttribute("data-dt-ss-tab");
                switchSsTab(k);
            });
        }
        var cangSubBtns = modal.querySelectorAll("[data-dt-ss-cang-sub]");
        for (var cs = 0; cs < cangSubBtns.length; cs++) {
            cangSubBtns[cs].addEventListener("click", function (ev) {
                var sk = ev.currentTarget.getAttribute("data-dt-ss-cang-sub");
                switchSsCangSub(sk);
            });
        }
        var c = document.getElementById("dongtianSwordSpiritCloseBtn");
        if (c) c.onclick = closeModal;
        var r = document.getElementById("dongtianSwordSpiritRefreshBtn");
        if (r)
            r.onclick = function () {
                var m = document.getElementById("dongtianSwordSpiritModal");
                if (m) m._dtSsCatalogToastShown = false;
                loadState().catch(function (e) {
                    toast(e.message || String(e), true);
                });
            };
        var d = document.getElementById("dtSsDepartBtn");
        if (d)
            d.onclick = function () {
                if (inFlight) return;
                inFlight = true;
                render();
                api("POST", "/api/dongtian-sword-spirit/depart", { packing: readPackingFromForm() })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "出发失败", true);
                            return;
                        }
                        lastState = res;
                        render();
                        toast(res.message || "剑魄已远行");
                        return reloadDongtianSaveFromServer(res).then(function () {
                            return loadState();
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    })
                    .finally(function () {
                        inFlight = false;
                        render();
                    });
            };
        var col = document.getElementById("dtSsCollectBtn");
        if (col)
            col.onclick = function () {
                if (inFlight) return;
                inFlight = true;
                render();
                api("POST", "/api/dongtian-sword-spirit/collect", {})
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "领取失败", true);
                            return;
                        }
                        lastState = res;
                        render();
                        var msg = res.message || "劫尘已纳藏";
                        var cg = res.curiosGiven && res.curiosGiven.length ? res.curiosGiven : res.curioGiven && res.curioGiven.name ? [res.curioGiven] : [];
                        if (cg.length === 1) {
                            msg +=
                                " 得云游秘藏「" +
                                cg[0].name +
                                "」" +
                                (cg[0].qualityLabel ? "（" + cg[0].qualityLabel + "）" : "") +
                                "。";
                        } else if (cg.length > 1) {
                            msg +=
                                " 得云游秘藏 " +
                                cg.length +
                                " 件：" +
                                cg
                                    .map(function (x) {
                                        return "「" + x.name + "」" + (x.qualityLabel ? "（" + x.qualityLabel + "）" : "");
                                    })
                                    .join("、") +
                                "。";
                        }
                        toast(msg);
                        return reloadDongtianSaveFromServer(res)
                            .then(function () {
                                return loadState();
                            })
                            .then(function () {
                                if (typeof calculateStats === "function") calculateStats();
                                if (typeof playerLoadStats === "function") playerLoadStats();
                            });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    })
                    .finally(function () {
                        inFlight = false;
                        render();
                    });
            };
        var dreamBtns = modal.querySelectorAll("[data-dt-ss-dream]");
        for (var j = 0; j < dreamBtns.length; j++) {
            dreamBtns[j].onclick = function (ev) {
                var hint = ev.currentTarget.getAttribute("data-dt-ss-dream");
                if (!hint || inFlight) return;
                inFlight = true;
                render();
                api("POST", "/api/dongtian-sword-spirit/dream", { hint: hint })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "托梦失败", true);
                            return;
                        }
                        lastState = res;
                        render();
                        toast(res.message || "托梦已至");
                        switchSsTab("gui");
                        return reloadDongtianSaveFromServer(res).then(function () {
                            return loadState();
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    })
                    .finally(function () {
                        inFlight = false;
                        render();
                    });
            };
        }
    }

    function buildPackRow(key) {
        var zh = LABELS[key] || key;
        return (
            '<div class="dt-ss-pack-row">' +
            '<label class="dt-ss-pack-lbl" for="dtSsPack_' +
            key +
            '">' +
            escHtml(zh) +
            '</label><input id="dtSsPack_' +
            key +
            '" class="dt-ss-pack-input" type="number" min="0" value="0" step="1" />' +
            '<span class="dt-ss-pack-cap" id="dtSsPackMax_' +
            key +
            '"></span></div>'
        );
    }

    function ensurePackForm() {
        var box = document.getElementById("dtSsPackForm");
        if (!box || box._dtSsPackBuilt) return;
        box._dtSsPackBuilt = true;
        var order = [
            "life_potion",
            "gem_material_pack",
            "yuqi_material_pack",
            "pet_exp_fruit",
            "enhance_stone",
            "enchant_stone",
            "god_essence_stone",
        ];
        box.innerHTML = order.map(buildPackRow).join("");
    }

    window.initDongtianSwordSpiritUI = function () {
        ensurePackForm();
        var hubBtn = document.getElementById("dongtianHubMenuSwordSpiritBtn");
        if (hubBtn && !hubBtn._dtSsHub) {
            hubBtn._dtSsHub = true;
            hubBtn.onclick = function () {
                if (typeof window.closeDongtianHubMenuModal === "function") window.closeDongtianHubMenuModal();
                openModal();
            };
        }
        wireOnce();
    };

    window.openDongtianSwordSpiritModal = openModal;
    window.closeDongtianSwordSpiritModal = closeModal;
})();
