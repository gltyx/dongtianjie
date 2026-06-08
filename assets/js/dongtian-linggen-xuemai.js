/**
 * 洞天劫 · 灵根血脉：联网币开箱、图鉴表；机缘总和 ×（1 +（灵根%+血脉%）÷100）并入面板
 */
(function () {
    "use strict";

    var STAT_KEYS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];

    function emptyAttrs() {
        var o = {};
        for (var i = 0; i < STAT_KEYS.length; i++) o[STAT_KEYS[i]] = 0;
        return o;
    }

    function mergeLgxAttrs() {
        var out = emptyAttrs();
        if (typeof player === "undefined" || !player) return out;
        function addFrom(slot) {
            if (!slot || typeof slot !== "object" || !slot.attrs) return;
            var a = slot.attrs;
            for (var k = 0; k < STAT_KEYS.length; k++) {
                var key = STAT_KEYS[k];
                var v = Number(a[key]);
                if (isFinite(v)) out[key] += v;
            }
        }
        addFrom(player.dongtianLinggen);
        addFrom(player.dongtianXuemai);
        return out;
    }

    window.getDongtianLinggenXuemaiMergedPct = function () {
        return mergeLgxAttrs();
    };

    function api(method, path, body) {
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req) return Promise.reject(new Error("未连接主游戏"));
        return req(method, path, body, true).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "灵根血脉请求失败");
            return res;
        });
    }

    function tierLabel(t) {
        var map = { U: "凡蕴 U", R: "凝华 R", SR: "玄品 SR", SSR: "天骄 SSR", SSSR: "劫主 SSSR", UR: "道源 UR" };
        return map[t] || String(t || "—");
    }

    function kindLabel(k) {
        return k === "xuemai" ? "血脉" : "灵根";
    }

    function renderSlotBlock(title, slot, extraClass) {
        extraClass = extraClass || "";
        if (!slot || !slot.name) {
            return (
                '<div class="dt-lgxm-reveal-col ' +
                extraClass +
                '">' +
                '<p class="dt-lgxm-reveal-col__title">' +
                escapeHtml(title) +
                '</p><p class="dt-lgxm-reveal-col__empty">（空）</p></div>'
            );
        }
        return (
            '<div class="dt-lgxm-reveal-col ' +
            extraClass +
            '">' +
            '<p class="dt-lgxm-reveal-col__title">' +
            escapeHtml(title) +
            "</p>" +
            '<p class="dt-lgxm-reveal-col__tier">' +
            escapeHtml(tierLabel(slot.tier)) +
            "</p>" +
            '<h4 class="dt-lgxm-reveal-col__name">' +
            escapeHtml(slot.name) +
            "</h4>" +
            '<p class="dt-lgxm-reveal-col__label">机缘属性</p>' +
            '<p class="dt-lgxm-reveal-col__attr">' +
            escapeHtml(slot.attrText || "") +
            "</p>" +
            '<p class="dt-lgxm-reveal-col__label">渊源介绍</p>' +
            '<p class="dt-lgxm-reveal-col__desc">' +
            escapeHtml(slot.desc || "") +
            "</p></div>"
        );
    }

    function renderSlotCard(title, slot) {
        if (!slot || !slot.name) {
            return (
                '<div class="dt-lgxm-card dt-lgxm-card--empty">' +
                '<p class="dt-lgxm-card__eyebrow">' +
                title +
                "</p>" +
                '<p class="dt-lgxm-card__empty">尚未感应 · 开启对应宝箱可获一条</p></div>'
            );
        }
        return (
            '<div class="dt-lgxm-card">' +
            '<p class="dt-lgxm-card__eyebrow">' +
            title +
            "</p>" +
            '<p class="dt-lgxm-card__tier">' +
            tierLabel(slot.tier) +
            "</p>" +
            '<h4 class="dt-lgxm-card__name">' +
            slot.name +
            "</h4>" +
            '<p class="dt-lgxm-card__attr">' +
            (slot.attrText || "") +
            "</p>" +
            '<p class="dt-lgxm-card__desc">' +
            (slot.desc || "") +
            "</p></div>"
        );
    }

    function renderCatalogTable(rows) {
        var sb =
            '<div class="dt-lgxm-table-wrap"><table class="dt-lgxm-table"><thead><tr>' +
            "<th>类型</th><th>品阶</th><th>名称</th><th>属性</th><th>介绍</th></tr></thead><tbody>";
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            sb +=
                "<tr><td>" +
                kindLabel(r.kind) +
                "</td><td>" +
                tierLabel(r.tier) +
                "</td><td>" +
                escapeHtml(r.name) +
                '</td><td class="dt-lgxm-td-attr">' +
                escapeHtml(r.attrText || "") +
                '</td><td class="dt-lgxm-td-desc">' +
                escapeHtml(r.desc || "") +
                "</td></tr>";
        }
        sb += "</tbody></table></div>";
        return sb;
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderBody(lx) {
        var body = document.getElementById("dongtianLgxmBody");
        if (!body || !lx) return;
        var coin = lx.networkCoin != null ? Math.floor(Number(lx.networkCoin) || 0) : "—";
        var cost = lx.openCost != null ? lx.openCost : 10;
        var odds = lx.tierOdds || [];
        var oddsHtml = odds
            .map(function (o) {
                return (
                    '<span class="dt-lgxm-odds-chip">' +
                    o.tier +
                    " <em>" +
                    o.p +
                    "%</em></span>"
                );
            })
            .join("");

        body.innerHTML =
            '<div class="dt-lgxm-hero" aria-hidden="true">' +
            '<div class="dt-lgxm-hero__mist"></div>' +
            '<div class="dt-lgxm-hero__sigil">根</div>' +
            '<div class="dt-lgxm-hero__sigil dt-lgxm-hero__sigil--2">血</div>' +
            "</div>" +
            '<p class="dt-lgxm-coin-line">当前联网币：<strong id="dtLgxmCoinVal">' +
            coin +
            "</strong> · 每次开启消耗 <strong>" +
            cost +
            "</strong></p>" +
            '<section class="dt-lgxm-section dt-lgxm-section--cards">' +
            '<div class="dt-lgxm-cards">' +
            renderSlotCard("当前灵根", lx.linggen) +
            renderSlotCard("当前血脉", lx.xuemai) +
            "</div></section>" +
            '<section class="dt-lgxm-section">' +
            '<h4 class="dt-lgxm-h4">机缘折算</h4>' +
            '<p class="dt-lgxm-formula">各属性：<strong>有效机缘</strong> = 机缘同类总和 + 机缘同类总和 ×（灵根该项% + 血脉该项%）÷ 100 = 机缘总和 ×（1 + 灵根血脉% ÷ 100）。例：气血机缘总和 100%，灵根气血 100%、血脉气血 100%（合计 200%）时，有效气血机缘 = 100 ×（1 + 200÷100）= 100×3。斗法面板与左侧「机缘加成」展示均按此折算。</p>' +
            "</section>" +
            '<section class="dt-lgxm-section">' +
            '<h4 class="dt-lgxm-h4">宝箱品质概率</h4>' +
            '<div class="dt-lgxm-odds">' +
            oddsHtml +
            "</div>" +
            (lx.pending
                ? '<p class="dt-lgxm-pending-hint">有待确认的开箱结果：请在弹出层中选择「保留当前」或「替换」，再开新箱。</p>'
                : "") +
            '<p class="dt-lgxm-actions">' +
            '<button type="button" class="btn btn--primary dt-lgxm-open-btn" data-chest="linggen"' +
            (lx.pending ? " disabled" : "") +
            ">灵根宝箱（" +
            cost +
            " 联网币）</button>" +
            '<button type="button" class="btn btn--accent dt-lgxm-open-btn" data-chest="xuemai"' +
            (lx.pending ? " disabled" : "") +
            ">血脉宝箱（" +
            cost +
            " 联网币）</button></p>" +
            "</section>" +
            '<section class="dt-lgxm-section dt-lgxm-section--catalog">' +
            '<h4 class="dt-lgxm-h4">图鉴 · 灵根与血脉全表</h4>' +
            renderCatalogTable(lx.catalog || []) +
            "</section>";

        if (lx.pending) {
            setTimeout(function () {
                openRevealChoiceModal(lx);
            }, 0);
        }

        body.querySelectorAll(".dt-lgxm-open-btn").forEach(function (btn) {
            btn.onclick = function () {
                var chest = btn.getAttribute("data-chest");
                btn.disabled = true;
                api("POST", "/api/dongtian-linggen-xuemai/open", { chest: chest })
                    .then(function (res) {
                        if (typeof toast === "function") toast(res.message || "开启成功", false);
                        function applyLxUi() {
                            if (res.lx) {
                                applyLxToPlayer(res.lx);
                                renderBody(res.lx);
                            }
                        }
                        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
                            return window.dongtianReloadSaveAfterDedicatedApi(res).then(applyLxUi);
                        }
                        applyLxUi();
                        if (typeof window.dongtianPersistPlayerUiChange === "function") {
                            window.dongtianPersistPlayerUiChange();
                        } else if (typeof scheduleDongtianCloudSave === "function") {
                            scheduleDongtianCloudSave();
                        }
                    })
                    .catch(function (e) {
                        if (typeof toast === "function") toast(e.message || String(e), true);
                    })
                    .finally(function () {
                        btn.disabled = false;
                    });
            };
        });
    }

    function applyLxToPlayer(lx) {
        if (typeof player === "undefined" || !player || !lx) return;
        player.dongtianLinggen = lx.linggen || null;
        player.dongtianXuemai = lx.xuemai || null;
        if (lx.pending) player.dongtianLgxmPending = lx.pending;
        else delete player.dongtianLgxmPending;
    }

    function closeRevealChoiceModal() {
        var m = document.getElementById("dongtianLgxmRevealModal");
        if (m) m.style.display = "none";
    }

    function openRevealChoiceModal(lx) {
        var pending = lx && lx.pending;
        if (!pending || !pending.rolled) return;
        var chest = pending.chest;
        var rolled = pending.rolled;
        var current = chest === "xuemai" ? lx.xuemai : lx.linggen;
        var chestTitle = kindLabel(chest) + "宝箱";

        var inner = document.getElementById("dongtianLgxmRevealInner");
        var modal = document.getElementById("dongtianLgxmRevealModal");
        if (!inner || !modal) return;

        inner.innerHTML =
            '<header class="dt-lgxm-reveal-head">' +
            "<div>" +
            '<p class="dt-lgxm-reveal-eyebrow">天机已现 · ' +
            escapeHtml(chestTitle) +
            "</p>" +
            '<h3 class="dt-lgxm-reveal-title">开箱结果</h3>' +
            '<p class="dt-lgxm-reveal-sub">请查看<strong>品质</strong>、<strong>机缘属性</strong>与<strong>渊源介绍</strong>后，选择是否替换当前身上条目。</p>' +
            "</div></header>" +
            '<div class="dt-lgxm-reveal-compare">' +
            renderSlotBlock("新获得 · " + tierLabel(rolled.tier), rolled, "dt-lgxm-reveal-col--new") +
            renderSlotBlock("当前身上", current, "dt-lgxm-reveal-col--cur") +
            "</div>" +
            '<p class="dt-lgxm-reveal-actions">' +
            '<button type="button" class="btn btn--ghost dt-lgxm-confirm-btn" data-action="keep">保留当前</button>' +
            '<button type="button" class="btn btn--primary dt-lgxm-confirm-btn" data-action="replace">替换为新</button>' +
            "</p>";

        modal.style.display = "flex";

        inner.querySelectorAll(".dt-lgxm-confirm-btn").forEach(function (b) {
            b.onclick = function () {
                var act = b.getAttribute("data-action");
                b.disabled = true;
                inner.querySelectorAll(".dt-lgxm-confirm-btn").forEach(function (x) {
                    x.disabled = true;
                });
                api("POST", "/api/dongtian-linggen-xuemai/confirm", { action: act })
                    .then(function (res) {
                        if (typeof toast === "function") toast(res.message || "已确认", false);
                        closeRevealChoiceModal();
                        function applyLxUi() {
                            if (res.lx) {
                                applyLxToPlayer(res.lx);
                                renderBody(res.lx);
                            }
                            if (act === "replace") {
                                if (typeof calculateStats === "function") calculateStats();
                                if (typeof playerLoadStats === "function") playerLoadStats();
                            }
                        }
                        if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
                            return window.dongtianReloadSaveAfterDedicatedApi(res).then(applyLxUi);
                        }
                        applyLxUi();
                        if (typeof window.dongtianPersistPlayerUiChange === "function") {
                            window.dongtianPersistPlayerUiChange();
                        } else if (typeof scheduleDongtianCloudSave === "function") {
                            scheduleDongtianCloudSave();
                        }
                    })
                    .catch(function (e) {
                        if (typeof toast === "function") toast(e.message || String(e), true);
                        inner.querySelectorAll(".dt-lgxm-confirm-btn").forEach(function (x) {
                            x.disabled = false;
                        });
                    });
            };
        });
    }

    function pullState() {
        return api("GET", "/api/dongtian-linggen-xuemai/state", undefined).then(function (res) {
            if (res.lx) applyLxToPlayer(res.lx);
            return res;
        });
    }

    function openModal() {
        var modal = document.getElementById("dongtianLgxmModal");
        if (!modal) return;
        modal.style.display = "flex";
        var body = document.getElementById("dongtianLgxmBody");
        if (body) body.innerHTML = '<p class="wushen-arena-muted">感应周天灵脉…</p>';
        pullState()
            .then(function (res) {
                if (res.lx) renderBody(res.lx);
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

    function closeModal() {
        closeRevealChoiceModal();
        var modal = document.getElementById("dongtianLgxmModal");
        if (modal) modal.style.display = "none";
    }

    window.initDongtianLinggenXuemaiUI = function () {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        var hubBtn = document.getElementById("dongtianHubMenuLgxmBtn");
        if (hubBtn && !hubBtn._dtLgxmBound) {
            hubBtn._dtLgxmBound = true;
            hubBtn.onclick = function () {
                if (typeof window.closeDongtianHubMenuModal === "function") {
                    window.closeDongtianHubMenuModal();
                } else {
                    var hub = document.getElementById("dongtianHubMenuModal");
                    if (hub) hub.style.display = "none";
                }
                openModal();
            };
        }
        var closeBtn = document.getElementById("dongtianLgxmCloseBtn");
        if (closeBtn && !closeBtn._dtLgxmBound) {
            closeBtn._dtLgxmBound = true;
            closeBtn.onclick = closeModal;
        }
        var refBtn = document.getElementById("dongtianLgxmRefreshBtn");
        if (refBtn && !refBtn._dtLgxmBound) {
            refBtn._dtLgxmBound = true;
            refBtn.onclick = function () {
                pullState()
                    .then(function (res) {
                        if (res.lx) renderBody(res.lx);
                    })
                    .catch(function (e) {
                        if (typeof toast === "function") toast(e.message || String(e), true);
                    });
            };
        }
    };

    window.openDongtianLinggenXuemaiModal = openModal;
    window.closeDongtianLinggenXuemaiModal = closeModal;
})();
