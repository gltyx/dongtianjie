/**
 * 洞天劫 · 灵田药园：种子包、种植收获、世界偷取、声望商店（基础可玩版）
 */
(function () {
    function api(method, path, body) {
        if (typeof window.dongtianLingtianIsLocalMode === "function" && window.dongtianLingtianIsLocalMode()) {
            if (typeof window.dongtianLingtianLocalApi === "function") {
                return window.dongtianLingtianLocalApi(method, path, body);
            }
            return Promise.reject(new Error("单机灵田模块未加载"));
        }
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return Promise.resolve(req(method, path, body, true));
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
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
        clearTimeout(el._lingtianToastT);
        el._lingtianToastT = setTimeout(function () {
            el.style.display = "none";
        }, 3200);
    }

    function fmtRemainMs(ms) {
        var n = Math.max(0, Math.floor(Number(ms) || 0));
        var h = Math.floor(n / 3600000);
        var m = Math.floor((n % 3600000) / 60000);
        if (h > 0) return h + "小时" + m + "分";
        return m + "分";
    }
    function fmtHours(h) {
        var n = Number(h || 0);
        if (!isFinite(n) || n <= 0) return "—";
        if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
        return String(Number(n.toFixed(2)));
    }

    function fmtTs(ts) {
        if (!ts) return "—";
        try {
            return new Date(ts).toLocaleString("zh-CN", { hour12: false });
        } catch (e) {
            return "—";
        }
    }
    function bonusLine(b) {
        if (!b || typeof b !== "object") return "无";
        var parts = [];
        function push(k, zh) {
            var v = Number(b[k] || 0);
            if (!v) return;
            parts.push(zh + "+" + v + "%");
        }
        push("hp", "气血");
        push("atk", "力道");
        push("def", "护体");
        push("atkSpd", "身法");
        push("critRate", "会心");
        push("critDmg", "暴伤");
        push("vamp", "吸血");
        return parts.length ? parts.join(" ") : "无";
    }

    var SEED_NAMES = {
        lt_seed_huiqicao: "回气草种",
        lt_seed_ningluhua: "凝露花种",
        lt_seed_tufuling: "土茯苓种",
        lt_seed_qinglingmu: "青灵木种",
        lt_seed_fenglingcao: "风铃草种",
        lt_seed_huazaoshu: "火枣树种",
        lt_seed_jinxianteng: "金线藤种",
        lt_seed_xuanbinggu: "玄冰菇种",
        lt_seed_bingxinlian: "冰心莲种",
        lt_seed_longxueshu: "龙血树种",
        lt_seed_leijizhu: "雷击竹种",
        lt_seed_huanxinlan: "幻心兰种",
        lt_seed_luhuacao: "露华草种",
        lt_seed_diyuancao: "地元草种",
        lt_seed_jifengye: "疾风叶种",
        lt_seed_qingluteng: "青露藤种",
        lt_seed_hanxicao: "寒息草种",
        lt_seed_huolinghua: "火灵花种",
        lt_seed_tulingmu: "土灵木种",
        lt_seed_jinluhua: "金露花种",
        lt_seed_fengyinmu: "风吟木种",
        lt_seed_fenghuocao: "风火草种",
        lt_seed_bingfenggu: "冰风菇种",
        lt_seed_jinyanteng: "金焰藤种",
        lt_seed_binghuolingguo: "冰火灵果种",
        lt_seed_xuanbinglian: "玄冰莲种",
        lt_seed_xuebingguo: "血冰果种",
        lt_seed_huolongmu: "火龙木种",
        lt_seed_jinleiteng: "金雷藤种",
        lt_seed_leiyinmu: "雷音木种",
        lt_seed_huanfengye: "幻风叶种",
        lt_seed_bingleiteng: "冰雷藤种",
        lt_seed_huanbinglan: "幻冰兰种",
        lt_seed_xuejinteng: "血金藤种",
        lt_seed_huanleihua: "幻雷花种",
        lt_seed_hundunya: "混沌芽种",
    };

    var HERB_NAMES = {
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
        lt_herb_luhuacao: "露华草",
        lt_herb_diyuancao: "地元草",
        lt_herb_jifengye: "疾风叶",
        lt_herb_qingluteng: "青露藤",
        lt_herb_hanxicao: "寒息草",
        lt_herb_huolinghua: "火灵花",
        lt_herb_tulingmu: "土灵木",
        lt_herb_jinluhua: "金露花",
        lt_herb_fengyinmu: "风吟木",
        lt_herb_fenghuocao: "风火草",
        lt_herb_bingfenggu: "冰风菇",
        lt_herb_jinyanteng: "金焰藤",
        lt_herb_binghuolingguo: "冰火灵果",
        lt_herb_xuanbinglian: "玄冰莲",
        lt_herb_xuebingguo: "血冰果",
        lt_herb_huolongmu: "火龙木",
        lt_herb_jinleiteng: "金雷藤",
        lt_herb_leiyinmu: "雷音木",
        lt_herb_huanfengye: "幻风叶",
        lt_herb_bingleiteng: "冰雷藤",
        lt_herb_huanbinglan: "幻冰兰",
        lt_herb_xuejinteng: "血金藤",
        lt_herb_huanleihua: "幻雷花",
        lt_herb_hundunya: "混沌芽",
    };

    var SHOP_LABELS = {
        speed_talisman_small: "加速符（小）",
        common_pack: "普通种子包",
        remove_pest_talisman: "除虫符",
        water_talisman: "浇水符",
        weed_talisman: "除草符",
        secret_realm_warp: "秘境穿梭器",
        pet_exp_fruit: "灵宠经验果实",
        mutate_charm: "变异概率符",
        rare_pack: "珍稀种子包",
    };

    var state = {
        data: null,
        tab: "farm",
        selectedSeed: "",
        visiting: null,
        worldMode: "random",
        worldFilter: "mature",
        worldPage: 1,
        worldPageSize: 10,
        worldPageData: null,
    };

    function ensureNumberDialog() {
        var host = document.getElementById("dongtianLingtianModal");
        if (!host) return null;
        var box = document.getElementById("lingtianNumberDialog");
        if (box) return box;
        box = document.createElement("div");
        box.id = "lingtianNumberDialog";
        box.className = "lingtian-input-modal";
        box.style.display = "none";
        box.innerHTML =
            '<div class="lingtian-input-modal__card" role="dialog" aria-modal="true" aria-label="数量输入">' +
            '<p class="lingtian-input-modal__title" id="lingtianNumberDialogTitle">请输入数量</p>' +
            '<p class="wushen-arena-muted" id="lingtianNumberDialogHint"></p>' +
            '<input id="lingtianNumberDialogInput" class="shitu-pid-input lingtian-input-modal__input" type="number" min="1" step="1" autocomplete="off" />' +
            '<div class="lingtian-input-modal__actions">' +
            '<button type="button" class="btn btn--sm btn--accent" id="lingtianNumberDialogOk">确定</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" id="lingtianNumberDialogCancel">取消</button>' +
            "</div></div>";
        host.appendChild(box);
        return box;
    }

    function askNumberDialog(opts) {
        var options = opts || {};
        var min = Math.max(1, Math.floor(Number(options.min) || 1));
        var max = Math.max(min, Math.floor(Number(options.max) || min));
        var def = Math.floor(Number(options.value) || min);
        if (def < min) def = min;
        if (def > max) def = max;
        var box = ensureNumberDialog();
        if (!box) return Promise.resolve(null);
        var card = box.querySelector(".lingtian-input-modal__card");
        var titleEl = document.getElementById("lingtianNumberDialogTitle");
        var hintEl = document.getElementById("lingtianNumberDialogHint");
        var inputEl = document.getElementById("lingtianNumberDialogInput");
        var okBtn = document.getElementById("lingtianNumberDialogOk");
        var cancelBtn = document.getElementById("lingtianNumberDialogCancel");
        if (!card || !titleEl || !hintEl || !inputEl || !okBtn || !cancelBtn) return Promise.resolve(null);
        titleEl.textContent = String(options.title || "请输入数量");
        hintEl.textContent = String(options.hint || "请输入数量（" + min + "-" + max + "）");
        inputEl.min = String(min);
        inputEl.max = String(max);
        inputEl.value = String(def);
        box.style.display = "flex";
        return new Promise(function (resolve) {
            function cleanup(val) {
                box.style.display = "none";
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                box.onclick = null;
                inputEl.onkeydown = null;
                resolve(val);
            }
            okBtn.onclick = function (ev) {
                if (ev) ev.preventDefault();
                var n = Math.floor(Number(String(inputEl.value || "").trim()));
                if (!Number.isFinite(n) || n < min || n > max) {
                    toast("请输入 " + min + "-" + max + " 的整数。", true);
                    inputEl.focus();
                    inputEl.select();
                    return;
                }
                cleanup(n);
            };
            cancelBtn.onclick = function (ev) {
                if (ev) ev.preventDefault();
                cleanup(null);
            };
            box.onclick = function (ev) {
                if (ev && ev.target === box) cleanup(null);
            };
            inputEl.onkeydown = function (ev) {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    okBtn.click();
                } else if (ev.key === "Escape") {
                    ev.preventDefault();
                    cleanup(null);
                }
            };
            setTimeout(function () {
                inputEl.focus();
                inputEl.select();
            }, 0);
        });
    }

    function setTab(tab) {
        state.tab = tab || "farm";
        document.querySelectorAll(".lingtian-tab-btn").forEach(function (btn) {
            var active = btn.getAttribute("data-tab") === state.tab;
            btn.classList.toggle("btn--primary", active);
            btn.classList.toggle("btn--ghost", !active);
        });
        renderPanel();
    }

    function renderTopLines() {
        var d = state.data || {};
        var st = document.getElementById("lingtianStatusLine");
        var aura = document.getElementById("lingtianAuraLine");
        var daily = document.getElementById("lingtianDailyLine");
        if (st) {
            if (!d.unlocked) {
                st.textContent = "未解锁：历史境界需达到 21 级。当前历史境界 " + (d.maxHistoryLvl || 0) + " 级。";
            } else {
                st.textContent =
                    "已解锁 · 地块 " +
                    (d.landCount || 0) +
                    "/" +
                    (d.maxPlotCount || 12) +
                    " · 声望 " +
                    (d.reputation || 0);
            }
        }
        if (aura) {
            var expireLine = d.auraExpireAt ? "（至 " + fmtTs(d.auraExpireAt) + "）" : "";
            aura.textContent = "灵气加成：" + (d.auraPct || 0) + "% " + expireLine;
        }
        if (daily) {
            daily.textContent =
                "今日偷取：" +
                (d.stealDaily || 0) +
                "/" +
                (d.stealDailyLimit || 50) +
                " · 精力 " +
                (d.energy || 0) +
                " · 变异符加持 " +
                (d.hybridBoostCharges || 0) +
                " 层 · 战中加持 " +
                ((d.activeCombatBuffs && d.activeCombatBuffs.length) || 0) +
                " 条";
        }
    }

    function renderFarmTab(d) {
        if (!d.unlocked) {
            return (
                '<p class="wushen-arena-muted">灵田尚未开辟。请提升历史境界至 21 级后再来此悟种。</p>' +
                '<p class="wushen-arena-muted">当前历史境界：' +
                escHtml(String(d.maxHistoryLvl || 0)) +
                " 级</p>"
            );
        }
        var seedOptions = Object.keys(d.seeds || {})
            .filter(function (k) {
                return (d.seeds[k] || 0) > 0;
            })
            .sort(function (a, b) {
                return (d.seeds[b] || 0) - (d.seeds[a] || 0);
            });
        var catalog = d.seedCatalog || {};
        if (!state.selectedSeed || !d.seeds[state.selectedSeed]) state.selectedSeed = seedOptions[0] || "";
        var energyCost = typeof d.energyBuyCost === "number" ? d.energyBuyCost : 10;
        var expandHint =
            d.expandCost != null && d.expandCost !== undefined
                ? "扩展灵田" + d.expandCost + "强化石"
                : "扩展灵田已达上限";
        var header =
            '<p class="wushen-arena-muted">成熟 48 小时未收将枯萎。购买精力' +
            escHtml(String(energyCost)) +
            "强化石，" +
            expandHint +
            "。</p>" +
            '<p class="wushen-arena-muted">符箓：除虫 ' +
            escHtml(String((d.talisman && d.talisman.pest) || 0)) +
            " / 浇水 " +
            escHtml(String((d.talisman && d.talisman.drought) || 0)) +
            " / 除草 " +
            escHtml(String((d.talisman && d.talisman.weed) || 0)) +
            "</p>" +
            '<p class="shitu-row">' +
            '<select id="lingtianSeedSelect" class="shitu-pid-input">' +
            (seedOptions.length
                ? seedOptions
                      .map(function (k) {
                          return (
                              '<option value="' +
                              escHtml(k) +
                              '"' +
                              (k === state.selectedSeed ? " selected" : "") +
                              ">" +
                              escHtml(
                                  (SEED_NAMES[k] || k) +
                                      "（" +
                                      d.seeds[k] +
                                      "）·" +
                                      fmtHours(catalog[k] && catalog[k].growHours) +
                                      "小时"
                              ) +
                              "</option>"
                          );
                      })
                      .join("")
                : '<option value="">暂无种子</option>') +
            "</select>" +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="buy-energy">购精力</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="expand-plot">扩展灵田</button>' +
            "</p>";
        var grid = '<div class="lingtian-plot-grid">' + (d.plots || []).map(function (p) { return renderMyPlotCard(p); }).join("") + "</div>";
        return header + grid;
    }

    function renderMyPlotCard(p) {
        if (!p || !p.unlocked) {
            return '<div class="lingtian-plot"><p class="lingtian-plot__name">未开辟</p><p class="lingtian-plot__meta">需扩展灵田解锁</p></div>';
        }
        if (!p.plant) {
            return (
                '<div class="lingtian-plot">' +
                '<p class="lingtian-plot__head">第' +
                (p.index + 1) +
                "块</p>" +
                '<p class="lingtian-plot__name">空闲灵土</p>' +
                '<button type="button" class="btn btn--sm btn--accent" data-act="plant" data-plot="' +
                p.index +
                '">种植</button>' +
                "</div>"
            );
        }
        var plant = p.plant;
        var body = "";
        if (plant.status === "growing") {
            var rem = Math.max(0, (plant.matureAt || 0) - Date.now());
            body =
                '<p class="lingtian-plot__meta">生长中 · 余 ' +
                escHtml(fmtRemainMs(rem)) +
                "</p>" +
                (plant.eventName
                    ? '<p class="lingtian-plot__meta">异象：' +
                      escHtml(plant.eventName) +
                      " · " +
                      escHtml(plant.eventDesc || "") +
                      "</p>" +
                      (plant.eventType && plant.eventType !== "light" && !plant.eventHandled
                          ? '<p class="shitu-row">' +
                            '<button type="button" class="btn btn--sm btn--ghost" data-act="handle-event-energy" data-plot="' +
                            p.index +
                            '">耗精力处理</button>' +
                            '<button type="button" class="btn btn--sm btn--ghost" data-act="handle-event-talisman" data-plot="' +
                            p.index +
                            '">耗符箓处理</button>' +
                            "</p>"
                          : "")
                    : "");
        } else if (plant.status === "mature") {
            body =
                '<p class="lingtian-plot__meta">成熟 · 总产 ' +
                plant.totalYield +
                " · 已偷 " +
                plant.stolen +
                " · 可偷 " +
                plant.remainSteal +
                "</p>" +
                '<button type="button" class="btn btn--sm btn--accent" data-act="harvest" data-plot="' +
                p.index +
                '">收获</button>';
        } else {
            body =
                '<p class="lingtian-plot__meta">已枯萎 · 超过 48 小时未收</p>' +
                '<button type="button" class="btn btn--sm btn--ghost" data-act="clear-withered" data-plot="' +
                p.index +
                '">清理</button>';
        }
        return (
            '<div class="lingtian-plot">' +
            '<p class="lingtian-plot__head">第' +
            (p.index + 1) +
            "块</p>" +
            '<p class="lingtian-plot__name">' +
            escHtml(plant.name || "灵植") +
            "</p>" +
            body +
            "</div>"
        );
    }

    function renderSeedTab(d) {
        if (!d.unlocked) return '<p class="wushen-arena-muted">灵田未解锁。</p>';
        var seeds = Object.keys(d.seeds || {})
            .filter(function (k) {
                return (d.seeds[k] || 0) > 0;
            })
            .sort(function (a, b) {
                return (d.seeds[b] || 0) - (d.seeds[a] || 0);
            });
        var catalog = d.seedCatalog || {};
        return (
            '<p class="wushen-arena-muted">种子包：普通 ' +
            (d.seedPacks ? d.seedPacks.common : 0) +
            " / 珍稀 " +
            (d.seedPacks ? d.seedPacks.rare : 0) +
            " / 变异 " +
            (d.seedPacks ? d.seedPacks.mutant : 0) +
            "</p>" +
            '<p class="shitu-row">' +
            '<button type="button" class="btn btn--sm btn--accent" data-act="open-pack" data-pack="lt_seed_pack_common">开启普通种子包</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="open-pack" data-pack="lt_seed_pack_rare">开启珍稀种子包</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="open-pack" data-pack="lt_seed_pack_mutant">开启变异种子包</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="use-mutate-charm">使用变异符（' +
            escHtml(String(d.mutateCharmCount || 0)) +
            "）</button>" +
            "</p>" +
            (seeds.length
                ? '<div class="lingtian-scroll-pane lingtian-scroll-pane--seed"><ul class="lingtian-list">' +
                  seeds
                      .map(function (k) {
                          return (
                              '<li class="lingtian-row"><span>' +
                              escHtml(SEED_NAMES[k] || k) +
                              '</span><span class="lingtian-row__meta">x' +
                              escHtml(String(d.seeds[k])) +
                              " · 成熟" +
                              escHtml(fmtHours(catalog[k] && catalog[k].growHours)) +
                              "小时" +
                              "</span></li>"
                          );
                      })
                      .join("") +
                  "</ul></div>"
                : '<p class="wushen-arena-muted">暂无种子，可通过种子包或声望商店获取。</p>') +
            renderCodex(d)
        );
    }

    function renderCodex(d) {
        var codex = d.codex || {};
        var recipes = codex.recipes || [];
        if (!recipes.length) return "";
        var sorted = recipes
            .slice()
            .sort(function (a, b) {
                var ah = Math.floor(Number(a.hours) || 0);
                var bh = Math.floor(Number(b.hours) || 0);
                if (ah !== bh) return ah - bh;
                return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
            });
        var byHour = {};
        sorted.forEach(function (r) {
            var h = Math.floor(Number(r.hours) || 0);
            var key = h > 0 ? String(h) : "0";
            if (!byHour[key]) byHour[key] = [];
            byHour[key].push(r);
        });
        var hourKeys = Object.keys(byHour).sort(function (a, b) {
            return Number(a) - Number(b);
        });
        return (
            '<div style="margin-top:0.6rem;">' +
            '<p class="wushen-arena-muted">杂交图鉴：已发现 ' +
            escHtml(String(codex.discovered || 0)) +
            "/" +
            escHtml(String(codex.total || recipes.length)) +
            "</p>" +
            '<div class="lingtian-scroll-pane lingtian-scroll-pane--codex"><ul class="lingtian-list">' +
            hourKeys
                .map(function (hk) {
                    var rows = byHour[hk] || [];
                    var title = Number(hk) > 0 ? hk + "小时" : "未知周期";
                    return (
                        '<li class="lingtian-codex-group-title">' +
                        escHtml(title) +
                        "</li>" +
                        rows
                            .map(function (r) {
                                var parentLine = r.discovered
                                    ? escHtml(((r.parentNames && r.parentNames.length ? r.parentNames : r.parents) || []).join(" + "))
                                    : "???";
                                return (
                                    '<li class="lingtian-row"><span>' +
                                    escHtml((r.discovered ? r.name : "???") + "（" + (r.discovered ? "已悟" : "未悟") + "）") +
                                    '</span><span class="lingtian-row__meta">' +
                                    parentLine +
                                    "</span></li>"
                                );
                            })
                            .join("")
                    );
                })
                .join("") +
            "</ul></div></div>"
        );
    }

    function renderHerbTab(d) {
        if (!d.unlocked) return '<p class="wushen-arena-muted">灵田未解锁。</p>';
        var herbs = d.herbs || [];
        var buffs = d.activeCombatBuffs || [];
        var buffHtml =
            '<p class="wushen-arena-muted">当前加持：' +
            (buffs.length
                ? buffs
                      .map(function (x) {
                          return escHtml((x.name || x.herbKey) + "（剩余" + x.remaining + "场）");
                      })
                      .join("、")
                : "无") +
            "</p>";
        if (!herbs.length) return buffHtml + '<p class="wushen-arena-muted">成熟灵药背包为空。</p>';
        return (
            '<p class="wushen-arena-muted">成熟灵药可服用获临时加持，也可在此上架修仙市场或赠送道友（消耗 5 联网币）。</p>' +
            buffHtml +
            '<div class="lingtian-scroll-pane lingtian-scroll-pane--herb"><ul class="lingtian-list">' +
            herbs
                .map(function (h) {
                    var eff = h.effect && h.effect.bonus ? h.effect.bonus : {};
                    return (
                        '<li class="lingtian-row"><span>' +
                        escHtml(HERB_NAMES[h.herbKey] || h.name || h.herbKey) +
                        '<br><span class="lingtian-row__meta">' +
                        escHtml(bonusLine(eff)) +
                        '</span></span><span><span class="lingtian-row__meta">x' +
                        escHtml(String(h.amount)) +
                        '</span> <button type="button" class="btn btn--sm btn--accent" data-act="use-herb" data-herb-key="' +
                        escHtml(h.herbKey) +
                        '">服用</button> <button type="button" class="btn btn--sm btn--ghost" data-act="use-herb-batch" data-herb-key="' +
                        escHtml(h.herbKey) +
                        '" data-herb-amount="' +
                        escHtml(String(h.amount)) +
                        '">批量</button> <button type="button" class="btn btn--sm btn--ghost" data-act="sell-herb" data-herb-key="' +
                        escHtml(h.herbKey) +
                        '" data-herb-amount="' +
                        escHtml(String(h.amount)) +
                        '">上架</button> <button type="button" class="btn btn--sm btn--ghost" data-act="gift-herb" data-herb-key="' +
                        escHtml(h.herbKey) +
                        '" data-herb-amount="' +
                        escHtml(String(h.amount)) +
                        '">赠送</button></span></li>'
                    );
                })
                .join("") +
            "</ul></div>"
        );
    }

    function renderWorldTab(d) {
        if (!d.unlocked) return '<p class="wushen-arena-muted">灵田未解锁。</p>';
        var randomWorld = state.worldFilter === "planted" ? d.worldPlanted || [] : d.world || [];
        var paged = state.worldPageData;
        var world = state.worldMode === "full" && paged && paged.items ? paged.items : randomWorld;
        var modeBar =
            '<p class="shitu-row">' +
            '<button type="button" class="btn btn--sm ' +
            (state.worldMode === "random" ? "btn--primary" : "btn--ghost") +
            '" data-act="world-mode-random">随机榜</button>' +
            '<button type="button" class="btn btn--sm ' +
            (state.worldMode === "full" ? "btn--primary" : "btn--ghost") +
            '" data-act="world-mode-full">全量榜</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="world-toggle-filter">' +
            (state.worldFilter === "planted" ? "灵田有种植" : "仅成熟中") +
            "</button>" +
            "</p>";
        var searchBar =
            '<p class="shitu-row">' +
            '<input type="number" id="lingtianVisitPidInput" class="shitu-pid-input" min="1" max="10000" placeholder="输入灵网ID（1-10000）" autocomplete="off" />' +
            '<button type="button" class="btn btn--sm btn--accent" data-act="search-visit">搜索ID</button>' +
            "</p>";
        var listHtml =
            '<p class="wushen-arena-muted">' +
            (state.worldMode === "full"
                ? "全量榜支持分页浏览；也可搜索灵网ID直达。"
                : "随机榜展示随机 10 个灵田；也可搜索灵网ID直达。") +
            "</p>" +
            '<ul class="lingtian-list">' +
            (world.length
                ? world
                      .map(function (w) {
                          var statText =
                              state.worldFilter === "planted"
                                  ? "种植 " + escHtml(String(w.plantedCount || 0))
                                  : "成熟 " + escHtml(String(w.matureCount || 0));
                          var stealHint = w.canSteal
                              ? ' <span class="lingtian-row__steal-hint" title="有可偷的成熟灵植">✋️</span>'
                              : "";
                          return (
                              '<li class="lingtian-row"><span>' +
                              escHtml((w.name || "无名道友") + " #" + w.publicId) +
                              '</span><span><span class="lingtian-row__meta">' +
                              statText +
                              stealHint +
                              '</span> <button type="button" class="btn btn--sm btn--ghost" data-act="visit" data-pid="' +
                              escHtml(String(w.publicId)) +
                              '">探访</button></span></li>'
                          );
                      })
                      .join("")
                : '<li class="lingtian-row"><span>当前暂无可探访灵田</span></li>') +
            "</ul>";
        var pagerHtml = "";
        if (state.worldMode === "full") {
            var total = paged && typeof paged.total === "number" ? paged.total : 0;
            var page = paged && typeof paged.page === "number" ? paged.page : state.worldPage;
            var pageCount = paged && typeof paged.pageCount === "number" ? paged.pageCount : 1;
            pagerHtml =
                '<p class="shitu-row">' +
                '<span class="wushen-arena-muted">第 ' +
                escHtml(String(page)) +
                "/" +
                escHtml(String(pageCount)) +
                " 页 · 共 " +
                escHtml(String(total)) +
                " 条</span>" +
                '<button type="button" class="btn btn--sm btn--ghost" data-act="world-prev">上一页</button>' +
                '<button type="button" class="btn btn--sm btn--ghost" data-act="world-next">下一页</button>' +
                "</p>";
        }
        var visitHtml = "";
        if (state.visiting && state.visiting.target) {
            var t = state.visiting.target;
            visitHtml =
                '<div class="wushen-arena-card" style="margin-top:0.55rem;">' +
                '<h4 class="wushen-arena-card-title">' +
                escHtml((t.name || "无名道友") + " #" + t.publicId) +
                "</h4>" +
                '<p class="wushen-arena-muted">灵气 +' +
                escHtml(String(t.auraPct || 0)) +
                "% · 声望 " +
                escHtml(String(t.reputation || 0)) +
                "</p>" +
                '<div class="lingtian-plot-grid">' +
                (t.plots || [])
                    .map(function (p) {
                        if (!p.unlocked) return '<div class="lingtian-plot"><p class="lingtian-plot__name">封印地块</p></div>';
                        if (!p.plant) return '<div class="lingtian-plot"><p class="lingtian-plot__name">空地</p></div>';
                        var able =
                            typeof p.plant.viewerCanSteal === "boolean"
                                ? p.plant.viewerCanSteal
                                : p.plant.status === "mature" && p.plant.remainSteal > 0;
                        var statusLine = "";
                        if (able) {
                            statusLine =
                                '<button type="button" class="btn btn--sm btn--accent" data-act="steal" data-pid="' +
                                escHtml(String(t.publicId)) +
                                '" data-plot="' +
                                escHtml(String(p.index)) +
                                '">偷取</button>';
                        } else if (p.plant.viewerAlreadyStole && p.plant.remainSteal > 0) {
                            statusLine =
                                '<p class="lingtian-plot__meta">本会已偷过（全服已偷 ' +
                                p.plant.stolen +
                                " · 尚可偷 " +
                                p.plant.remainSteal +
                                "）</p>";
                        } else {
                            statusLine = '<p class="lingtian-plot__meta">当前不可偷取</p>';
                        }
                        return (
                            '<div class="lingtian-plot"><p class="lingtian-plot__name">' +
                            escHtml(p.plant.name || "灵植") +
                            '</p><p class="lingtian-plot__meta">总产 ' +
                            p.plant.totalYield +
                            " · 已偷 " +
                            p.plant.stolen +
                            " · 可偷 " +
                            p.plant.remainSteal +
                            "</p>" +
                            '<p class="lingtian-plot__meta">' +
                            (p.plant.status === "growing"
                                ? "成熟剩余 " + escHtml(fmtRemainMs(Math.max(0, (p.plant.matureAt || 0) - Date.now())))
                                : "成熟时间 " + escHtml(fmtTs(p.plant.matureAt || 0))) +
                            "</p>" +
                            statusLine +
                            "</div>"
                        );
                    })
                    .join("") +
                "</div></div>";
        }
        return modeBar + searchBar + listHtml + pagerHtml + visitHtml;
    }

    function renderShopTab(d) {
        if (!d.unlocked) return '<p class="wushen-arena-muted">灵田未解锁。</p>';
        var items = d.shopItems || [];
        return (
            '<p class="wushen-arena-muted">当前声望：' +
            escHtml(String(d.reputation || 0)) +
            "</p>" +
            '<ul class="lingtian-list">' +
            items
                .map(function (it) {
                    var lim = "";
                    if (it.dailyLimit) lim = "（日限 " + it.boughtDaily + "/" + it.dailyLimit + "）";
                    else if (it.weeklyLimit) lim = "（周限 " + it.boughtWeekly + "/" + it.weeklyLimit + "）";
                    return (
                        '<li class="lingtian-row"><span>' +
                        escHtml((SHOP_LABELS[it.id] || it.name || it.id) + " · " + it.cost + " 声望 " + lim) +
                        '</span><button type="button" class="btn btn--sm btn--ghost" data-act="shop-buy" data-item-id="' +
                        escHtml(it.id) +
                        '">兑换</button></li>'
                    );
                })
                .join("") +
            "</ul>"
        );
    }

    function renderPanel() {
        renderTopLines();
        var panel = document.getElementById("lingtianPanelBody");
        if (!panel) return;
        var d = state.data || {};
        if (state.tab === "seed") panel.innerHTML = renderSeedTab(d);
        else if (state.tab === "herb") panel.innerHTML = renderHerbTab(d);
        else if (state.tab === "world") panel.innerHTML = renderWorldTab(d);
        else if (state.tab === "shop") panel.innerHTML = renderShopTab(d);
        else panel.innerHTML = renderFarmTab(d);
        if (state.tab === "world") {
            var inp = document.getElementById("lingtianVisitPidInput");
            if (inp && !inp._lingtianEnterBound) {
                inp._lingtianEnterBound = true;
                inp.addEventListener("keydown", function (ev) {
                    if (ev.key !== "Enter") return;
                    ev.preventDefault();
                    var pid = Math.floor(Number(String(inp.value || "").trim()));
                    if (!Number.isFinite(pid) || pid < 1 || pid > 10000) {
                        toast("请输入有效灵网ID（1-10000）", true);
                        return;
                    }
                    visitFarm(pid);
                });
            }
        }
    }

    function loadState() {
        return api("GET", "/api/dongtian-lingtian/state", undefined)
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "灵田状态获取失败");
                state.data = res;
                renderPanel();
                return res;
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function reloadDongtianSaveFromServer(apiRes) {
        if (typeof window.dongtianReloadSaveAfterDedicatedApi === "function") {
            return window.dongtianReloadSaveAfterDedicatedApi(apiRes || null);
        }
        if (typeof window.dongtianReloadSaveAfterServerGrant === "function") {
            return window.dongtianReloadSaveAfterServerGrant({ skipPreFlush: true });
        }
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
            return window.dongtianPullServerSaveAfterMutation({ skipPreFlush: true });
        }
        return api("GET", "/api/dongtian-jie/save", undefined)
            .then(function (res) {
                if (res && res.ok && res.data && typeof window.dongtianApplyServerPayload === "function") {
                    window.dongtianApplyServerPayload(res.data, { forceServerPlayer: true, fromServerMutation: true });
                }
            })
            .catch(function () {});
    }

    function refreshInventoryAfterServerGrant() {
        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
        if (typeof showEquipment === "function") showEquipment();
    }

    /** 灵田专用 API（开包等）落盘结果：立即对齐本地材料/种子，避免拉档合并把种子包数量盖回 */
    function applyLingtianServerSync(res) {
        if (!res || typeof player === "undefined" || !player) return false;
        if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
            window.dongtianSyncRevisionFromApiResponse(res);
        } else if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
            window.dongtianSyncRevisionFromTradeApi(res);
        }
        var changed = false;
        if (!player.lingtian || typeof player.lingtian !== "object") {
            player.lingtian = {};
        }
        if (res.seeds && typeof res.seeds === "object") {
            try {
                player.lingtian.seeds = JSON.parse(JSON.stringify(res.seeds));
                changed = true;
            } catch (eSeeds) {}
        }
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (!player.inventory || typeof player.inventory !== "object") player.inventory = {};
        if (!player.inventory.materials || typeof player.inventory.materials !== "object") {
            player.inventory.materials = {};
        }
        var packKeys = ["lt_seed_pack_common", "lt_seed_pack_rare", "lt_seed_pack_mutant"];
        if (res.materials && typeof res.materials === "object") {
            packKeys.forEach(function (pk) {
                if (!Object.prototype.hasOwnProperty.call(res.materials, pk)) return;
                var nv = Math.max(0, Math.floor(Number(res.materials[pk]) || 0));
                var cv = Math.max(0, Math.floor(parseInt(player.inventory.materials[pk], 10) || 0));
                if (nv !== cv) {
                    player.inventory.materials[pk] = nv;
                    changed = true;
                }
            });
        }
        if (typeof window.dongtianClearPendingMaterialDeltaKeys === "function") {
            window.dongtianClearPendingMaterialDeltaKeys(packKeys);
        }
        if (changed || res.seedPacks) {
            if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
            if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianPersistPlayerUiChange === "function") {
                window.dongtianPersistPlayerUiChange();
            }
        }
        return changed;
    }

    function ensureCombatBuffShape() {
        if (typeof player === "undefined" || !player) return {};
        if (!player.lingtianCombatBuffs || typeof player.lingtianCombatBuffs !== "object") {
            player.lingtianCombatBuffs = {};
        }
        return player.lingtianCombatBuffs;
    }

    window.aggregateLingtianHerbCombatBonuses = function () {
        var out = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        var buffs = ensureCombatBuffShape();
        Object.keys(buffs).forEach(function (k) {
            var row = buffs[k];
            if (!row || typeof row !== "object") return;
            var rem = Math.max(0, Math.floor(Number(row.remaining) || 0));
            if (rem < 1) return;
            var b = row.bonus && typeof row.bonus === "object" ? row.bonus : {};
            out.hp += Number(b.hp || 0);
            out.atk += Number(b.atk || 0);
            out.def += Number(b.def || 0);
            out.atkSpd += Number(b.atkSpd || 0);
            out.vamp += Number(b.vamp || 0);
            out.critRate += Number(b.critRate || 0);
            out.critDmg += Number(b.critDmg || 0);
        });
        return out;
    };

    window.consumeLingtianCombatBuffOnce = function () {
        var buffs = ensureCombatBuffShape();
        var changed = false;
        Object.keys(buffs).forEach(function (k) {
            var row = buffs[k];
            if (!row || typeof row !== "object") {
                delete buffs[k];
                changed = true;
                return;
            }
            var rem = Math.max(0, Math.floor(Number(row.remaining) || 0));
            if (rem < 1) {
                delete buffs[k];
                changed = true;
                return;
            }
            row.remaining = rem - 1;
            if (row.remaining <= 0) delete buffs[k];
            changed = true;
        });
        if (changed && typeof calculateStats === "function") calculateStats();
        if (changed && typeof playerLoadStats === "function") playerLoadStats();
        if (changed) {
            if (typeof window.dongtianPersistPlayerUiChange === "function") window.dongtianPersistPlayerUiChange();
            else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
        }
        return changed;
    };

    function patchVisitAfterSteal(res) {
        if (!state.visiting || !state.visiting.target || !Array.isArray(state.visiting.target.plots)) return;
        var idx = Math.floor(Number(res && res.plotIndex));
        if (!Number.isFinite(idx)) return;
        var row = null;
        for (var i = 0; i < state.visiting.target.plots.length; i++) {
            if (Math.floor(Number(state.visiting.target.plots[i].index)) === idx) {
                row = state.visiting.target.plots[i];
                break;
            }
        }
        if (!row || !row.plant) {
            if (res && res.plantCleared) renderPanel();
            return;
        }
        if (typeof res.plotStolen === "number") {
            row.plant.stolen = Math.max(Math.floor(Number(row.plant.stolen) || 0), Math.floor(res.plotStolen));
        } else if (typeof res.gain === "number") {
            row.plant.stolen = (Math.floor(Number(row.plant.stolen) || 0) + Math.floor(res.gain)) || 0;
        }
        if (typeof res.remainSteal === "number") row.plant.remainSteal = Math.floor(res.remainSteal);
        row.plant.viewerCanSteal = false;
        row.plant.viewerAlreadyStole = true;
        renderPanel();
    }

    function visitFarm(pid, bustCache) {
        var url = "/api/dongtian-lingtian/visit/" + encodeURIComponent(String(pid));
        if (bustCache) url += "?_=" + Date.now();
        return api("GET", url, undefined)
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "探访失败");
                state.visiting = res;
                renderPanel();
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function loadWorldListPage(page) {
        var p = Math.max(1, Math.floor(Number(page) || 1));
        state.worldPage = p;
        var q =
            "/api/dongtian-lingtian/world-list?page=" +
            encodeURIComponent(String(p)) +
            "&pageSize=" +
            encodeURIComponent(String(state.worldPageSize || 10)) +
            "&filter=" +
            encodeURIComponent(state.worldFilter === "planted" ? "planted" : "mature");
        return api("GET", q, undefined)
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "世界灵田列表加载失败");
                state.worldPageData = res;
                state.worldPage = res.page || p;
                renderPanel();
                return res;
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function postAndReload(path, body) {
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        return api("POST", path, body)
            .then(function (res) {
                if (!res || !res.ok) {
                    toast((res && res.message) || "操作失败", true);
                    return;
                }
                toast(res.message || "操作成功");
                if (res.seeds || res.seedPacks || res.materials) {
                    applyLingtianServerSync(res);
                } else if (res.grant && typeof window.dongtianApplyMolongMaterialGrant === "function") {
                    window.dongtianApplyMolongMaterialGrant(res.grant);
                }
                var isSteal = String(path || "").indexOf("/steal") >= 0;
                if (isSteal) patchVisitAfterSteal(res);
                var refreshVisit = Promise.resolve();
                if (state.tab === "world" && state.visiting && state.visiting.target) {
                    refreshVisit = visitFarm(state.visiting.target.publicId, true);
                }
                return refreshVisit.then(function () {
                    return reloadDongtianSaveFromServer(res).then(function () {
                        refreshInventoryAfterServerGrant();
                        return loadState().then(function () {
                            if (state.tab === "world" && state.worldMode === "full" && state.worldPageData) {
                                var pg = state.worldPageData.page || state.worldPage || 1;
                                return loadWorldListPage(pg);
                            }
                        });
                    });
                });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function onPanelClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-act]") : null;
        if (!t || !t.getAttribute) return;
        var act = t.getAttribute("data-act");
        if (!act) return;
        if (act === "plant") {
            var seedSel = document.getElementById("lingtianSeedSelect");
            var seedKey = seedSel ? String(seedSel.value || "").trim() : "";
            if (!seedKey) {
                toast("请先选择一个种子。", true);
                return;
            }
            var idx = Math.floor(Number(t.getAttribute("data-plot")));
            postAndReload("/api/dongtian-lingtian/plant", { plotIndex: idx, seedKey: seedKey });
        } else if (act === "harvest") {
            postAndReload("/api/dongtian-lingtian/harvest", { plotIndex: Math.floor(Number(t.getAttribute("data-plot"))) });
        } else if (act === "clear-withered") {
            postAndReload("/api/dongtian-lingtian/clear-withered", { plotIndex: Math.floor(Number(t.getAttribute("data-plot"))) });
        } else if (act === "expand-plot") {
            postAndReload("/api/dongtian-lingtian/expand", {});
        } else if (act === "buy-energy") {
            postAndReload("/api/dongtian-lingtian/buy-energy", {});
        } else if (act === "open-pack") {
            postAndReload("/api/dongtian-lingtian/open-pack", { packKey: t.getAttribute("data-pack"), count: 1 });
        } else if (act === "use-mutate-charm") {
            postAndReload("/api/dongtian-lingtian/use-mutate-charm", {});
        } else if (act === "handle-event-energy") {
            postAndReload("/api/dongtian-lingtian/handle-event", {
                plotIndex: Math.floor(Number(t.getAttribute("data-plot"))),
                mode: "energy",
            });
        } else if (act === "handle-event-talisman") {
            postAndReload("/api/dongtian-lingtian/handle-event", {
                plotIndex: Math.floor(Number(t.getAttribute("data-plot"))),
                mode: "talisman",
            });
        } else if (act === "use-herb") {
            postAndReload("/api/dongtian-lingtian/use-herb", {
                herbKey: String(t.getAttribute("data-herb-key") || ""),
                count: 1,
            });
        } else if (act === "use-herb-batch") {
            var herbKey = String(t.getAttribute("data-herb-key") || "");
            var maxCnt = Math.max(1, Math.floor(Number(t.getAttribute("data-herb-amount")) || 0));
            if (!herbKey || maxCnt < 1) {
                toast("该灵药数量不足。", true);
                return;
            }
            askNumberDialog({
                title: "批量服用",
                hint: "请输入批量服用数量（1-" + maxCnt + "）",
                min: 1,
                max: maxCnt,
                value: Math.min(10, maxCnt),
            }).then(function (useCnt) {
                if (useCnt == null) return;
                postAndReload("/api/dongtian-lingtian/use-herb", {
                    herbKey: herbKey,
                    count: useCnt,
                });
            });
        } else if (act === "visit") {
            visitFarm(Math.floor(Number(t.getAttribute("data-pid"))));
        } else if (act === "search-visit") {
            var inp = document.getElementById("lingtianVisitPidInput");
            var pid = inp ? Math.floor(Number(String(inp.value || "").trim())) : NaN;
            if (!Number.isFinite(pid) || pid < 1 || pid > 10000) {
                toast("请输入有效灵网ID（1-10000）", true);
                return;
            }
            visitFarm(pid);
        } else if (act === "world-mode-random") {
            state.worldMode = "random";
            renderPanel();
        } else if (act === "world-mode-full") {
            state.worldMode = "full";
            if (!state.worldPageData) loadWorldListPage(1);
            else renderPanel();
        } else if (act === "world-toggle-filter") {
            state.worldFilter = state.worldFilter === "planted" ? "mature" : "planted";
            state.worldPageData = null;
            if (state.worldMode === "full") loadWorldListPage(1);
            else renderPanel();
        } else if (act === "world-prev") {
            var cur = state.worldPageData && state.worldPageData.page ? state.worldPageData.page : state.worldPage;
            if (cur > 1) loadWorldListPage(cur - 1);
        } else if (act === "world-next") {
            var cur2 = state.worldPageData && state.worldPageData.page ? state.worldPageData.page : state.worldPage;
            var pc = state.worldPageData && state.worldPageData.pageCount ? state.worldPageData.pageCount : 1;
            if (cur2 < pc) loadWorldListPage(cur2 + 1);
        } else if (act === "steal") {
            var targetPid = Math.floor(Number(t.getAttribute("data-pid")));
            var plot = Math.floor(Number(t.getAttribute("data-plot")));
            askNumberDialog({
                title: "灵田偷取",
                hint: "当前规则：每次偷取固定为 1。",
                min: 1,
                max: 1,
                value: 1,
            }).then(function (n) {
                if (n == null) return;
                postAndReload("/api/dongtian-lingtian/steal", { targetPublicId: targetPid, plotIndex: plot, amount: n });
            });
        } else if (act === "shop-buy") {
            postAndReload("/api/dongtian-lingtian/shop-exchange", { itemId: t.getAttribute("data-item-id") });
        } else if (act === "sell-herb") {
            var hk = String(t.getAttribute("data-herb-key") || "");
            var mx = Math.floor(Number(t.getAttribute("data-herb-amount")) || 0);
            if (typeof window.dongtianMarketOpenSellMaterial === "function" && hk && mx > 0) {
                window.dongtianMarketOpenSellMaterial(hk, mx);
            }
        } else if (act === "gift-herb") {
            var hkG = String(t.getAttribute("data-herb-key") || "");
            var mxG = Math.floor(Number(t.getAttribute("data-herb-amount")) || 0);
            if (typeof window.dongtianMarketOpenGiftMaterial === "function" && hkG && mxG > 0) {
                window.dongtianMarketOpenGiftMaterial(hkG, mxG);
            }
        }
    }

    function bindOnce() {
        var modal = document.getElementById("dongtianLingtianModal");
        if (!modal || modal._lingtianBound) return;
        modal._lingtianBound = true;
        modal.addEventListener("click", onPanelClick);
        var refreshBtn = document.getElementById("dongtianLingtianRefreshBtn");
        if (refreshBtn) {
            refreshBtn.onclick = function () {
                loadState();
            };
        }
        document.querySelectorAll(".lingtian-tab-btn").forEach(function (btn) {
            btn.onclick = function () {
                setTab(btn.getAttribute("data-tab"));
            };
        });
    }

    function openModal() {
        var modal = document.getElementById("dongtianLingtianModal");
        if (!modal) return;
        bindOnce();
        modal.style.display = "flex";
        loadState().then(function () {
            renderPanel();
        });
    }
    window.openDongtianLingtianModal = openModal;

    window.initDongtianLingtianUI = function () {
        bindOnce();
        var hubBtn = document.getElementById("dongtianHubMenuLingtianBtn");
        if (hubBtn && !hubBtn._lingtianHubBound) {
            hubBtn._lingtianHubBound = true;
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
        if (typeof calculateStats === "function") calculateStats();
        if (typeof playerLoadStats === "function") playerLoadStats();
    };
})();
