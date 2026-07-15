/**
 * 洞天劫 · 师徒：菜单入口、拜师申请、收徒、逐出、出师；师父永久机缘叠层（与称号同类百分比加算）
 */
(function () {
    function api(method, path, body) {
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
        clearTimeout(el._shituT);
        el._shituT = setTimeout(function () {
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
    function fmtDateTime(ts) {
        if (!ts) return "—";
        try {
            return new Date(ts).toLocaleString("zh-CN", { hour12: false });
        } catch (e) {
            return "—";
        }
    }
    function fmtPct(v) {
        var n = Number(v);
        if (!Number.isFinite(n)) n = 0;
        return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + "%";
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

    /** 每名出师弟子永久机缘（与 aggregateShituMentorBonuses 一致） */
    var SHITU_GRAD_BONUS_PER = {
        hp: 40,
        atk: 40,
        def: 40,
        atkSpd: 2,
        critRate: 2,
        critDmg: 20,
    };
    var SHITU_GRAD_BONUS_DESC =
        "气血+40% 力道+40% 护体+40% 身法+2% 会心+2% 暴伤+20%";

    /** 每名出师弟子：气血/力道/护体 +40%，身法/会心 +2%，暴伤 +20%（与称号机缘同类叠乘区） */
    function aggregateShituMentorBonuses() {
        var out = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
        if (typeof player === "undefined" || !player) return out;
        var g = Math.floor(Number(player.shituMasterGradCount) || 0);
        if (g <= 0) return out;
        out.hp = SHITU_GRAD_BONUS_PER.hp * g;
        out.atk = SHITU_GRAD_BONUS_PER.atk * g;
        out.def = SHITU_GRAD_BONUS_PER.def * g;
        out.atkSpd = SHITU_GRAD_BONUS_PER.atkSpd * g;
        out.critRate = SHITU_GRAD_BONUS_PER.critRate * g;
        out.critDmg = SHITU_GRAD_BONUS_PER.critDmg * g;
        return out;
    }
    window.aggregateShituMentorBonuses = aggregateShituMentorBonuses;

    var lastState = null;
    var lastWordGuessState = null;
    /** 猜词请求进行中，防止连点重复扣次 / 重复落盘压力 */
    var wordGuessInFlight = false;

    function dongtianShituPullState() {
        return api("GET", "/api/dongtian-shitu/state", undefined).then(function (res) {
            if (res && res.ok) {
                lastState = res;
                if (typeof player !== "undefined" && player) {
                    player.shituMasterGradCount = Math.floor(Number(res.graduationsAsMaster) || 0);
                }
                if (typeof calculateStats === "function") calculateStats();
                if (typeof playerLoadStats === "function") playerLoadStats();
            }
            return res;
        });
    }
    window.dongtianShituPullState = dongtianShituPullState;

    function renderShituModal() {
        var res = lastState;
        var selfPidEl = document.getElementById("shituSelfPid");
        var gradEl = document.getElementById("shituGradCountLine");
        var bonusLine = document.getElementById("shituBonusLine");
        var applyBox = document.getElementById("shituApplyBox");
        var masterView = document.getElementById("shituMasterRelation");
        var masterInner = document.getElementById("shituMasterRelationInner");
        var gradBtn = document.getElementById("shituGraduateBtn");
        var pendUl = document.getElementById("shituPendingList");
        var appUl = document.getElementById("shituApprenticeList");

        if (!res || !res.ok) {
            if (selfPidEl) selfPidEl.textContent = "—";
            return;
        }

        var self = res.self || {};
        if (selfPidEl) {
            selfPidEl.textContent =
                self.dongtianPublicId != null ? String(self.dongtianPublicId) : "—";
        }
        var g = Math.floor(Number(res.graduationsAsMaster) || 0);
        if (gradEl) {
            gradEl.textContent = "出师人数（师父）：" + g + "（每名弟子永久机缘：" + SHITU_GRAD_BONUS_DESC + "）";
        }
        if (bonusLine) {
            if (g > 0) {
                bonusLine.textContent =
                    "当前师父机缘叠层：气血+" +
                    SHITU_GRAD_BONUS_PER.hp * g +
                    "% 力道+" +
                    SHITU_GRAD_BONUS_PER.atk * g +
                    "% 护体+" +
                    SHITU_GRAD_BONUS_PER.def * g +
                    "% 身法+" +
                    SHITU_GRAD_BONUS_PER.atkSpd * g +
                    "% 会心+" +
                    SHITU_GRAD_BONUS_PER.critRate * g +
                    "% 暴伤+" +
                    SHITU_GRAD_BONUS_PER.critDmg * g +
                    "%";
            } else {
                bonusLine.textContent = "尚无出师记录时无师父机缘加成。";
            }
        }

        var hasMaster = !!(res.master && res.master.userId);
        if (applyBox) applyBox.style.display = hasMaster ? "none" : "block";
        if (masterView) masterView.style.display = hasMaster ? "block" : "none";
        if (masterInner) {
            if (hasMaster && res.master) {
                var m = res.master;
                var mn = m.name ? escHtml(m.name) : "—";
                var mp = m.dongtianPublicId != null ? escHtml(String(m.dongtianPublicId)) : "—";
                masterInner.innerHTML =
                    "<p>师父：<strong>" +
                    mn +
                    "</strong>　灵网身份 <strong>#" +
                    mp +
                    "</strong></p>" +
                    "<p class=\"wushen-arena-muted\">出师条件：① 历史最高秘境≥第10层；② 拜师后湮灭诸敌再增10000；③ 拜师满5天。</p>";
            } else {
                masterInner.innerHTML = "";
            }
        }

        var p = typeof player !== "undefined" && player ? player : {};
        var mf =
            typeof p.maxDungeonFloor === "number" && !isNaN(p.maxDungeonFloor)
                ? Math.floor(p.maxDungeonFloor)
                : 1;
        var bp = res.bondProgress;
        var needK = bp && typeof bp.killsNeed === "number" ? bp.killsNeed : 10000;
        var needMs = bp && typeof bp.msNeed === "number" ? bp.msNeed : 5 * 24 * 60 * 60 * 1000;
        var ks = bp && typeof bp.killsSinceJoin === "number" ? bp.killsSinceJoin : 0;
        var meMs = bp && typeof bp.msElapsed === "number" ? bp.msElapsed : 0;
        var canGrad =
            hasMaster && mf >= 10 && bp && ks >= needK && meMs >= needMs;
        var hint = "";
        if (!hasMaster) hint = "未拜师";
        else if (!bp) hint = "正在同步拜师计时…";
        else {
            var dayOk = meMs >= needMs;
            var remH = dayOk ? 0 : Math.ceil((needMs - meMs) / (60 * 60 * 1000));
            hint =
                "秘境层 " +
                mf +
                "/10；拜师后湮灭诸敌 +" +
                ks +
                "/" +
                needK +
                "；" +
                (dayOk ? "拜师已满5天" : "拜师未满5天（约剩 " + remH + " 小时）");
        }
        if (gradBtn) {
            gradBtn.disabled = !canGrad;
            gradBtn.title = canGrad ? "领取出师奖励并解除师徒关系" : hint;
        }

        if (pendUl) {
            var plist = res.pendingIncoming || [];
            if (!plist.length) {
                pendUl.innerHTML = '<li class="shitu-li shitu-li--empty">暂无拜师申请</li>';
            } else {
                pendUl.innerHTML = plist
                    .map(function (row) {
                        var nm = row.applicantName ? escHtml(row.applicantName) : "—";
                        var pid = row.applicantPublicId != null ? escHtml(String(row.applicantPublicId)) : "?";
                        var aid = escHtml(row.applicantId);
                        return (
                            '<li class="shitu-li">' +
                            "<span>" +
                            nm +
                            " (#" +
                            pid +
                            ") 秘境≤" +
                            (res.rules ? res.rules.apprenticeApplyMaxFloor : 9) +
                            "层</span>" +
                            '<button type="button" class="btn btn--sm btn--primary shitu-accept" data-aid="' +
                            aid +
                            '">同意</button> ' +
                            '<button type="button" class="btn btn--sm btn--ghost shitu-reject" data-aid="' +
                            aid +
                            '">拒绝</button>' +
                            "</li>"
                        );
                    })
                    .join("");
            }
        }

        if (appUl) {
            var alist = res.apprentices || [];
            if (!alist.length) {
                appUl.innerHTML = '<li class="shitu-li shitu-li--empty">当前无徒弟（最多3人）</li>';
            } else {
                appUl.innerHTML = alist
                    .map(function (a) {
                        var nm = a.name ? escHtml(a.name) : "—";
                        var pid = a.dongtianPublicId != null ? escHtml(String(a.dongtianPublicId)) : "?";
                        var uid = escHtml(a.userId);
                        return (
                            '<li class="shitu-li">' +
                            "<span>" +
                            nm +
                            " (#" +
                            pid +
                            ")</span>" +
                            '<button type="button" class="btn btn--sm btn--ghost shitu-expel" data-aid="' +
                            uid +
                            '">逐出</button>' +
                            "</li>"
                        );
                    })
                    .join("");
            }
        }
    }

    function renderWordGuessModal() {
        var state = lastWordGuessState || {};
        var statusEl = document.getElementById("dongtianWordGuessStatusLine");
        var ruleEl = document.getElementById("dongtianWordGuessRuleLine");
        var hintEl = document.getElementById("dongtianWordGuessHintLine");
        var resetEl = document.getElementById("dongtianWordGuessResetLine");
        var hisEl = document.getElementById("dongtianWordGuessHistory");
        var submitBtn = document.getElementById("dongtianWordGuessSubmitBtn");
        var buyBtn = document.getElementById("dongtianWordGuessBuyBtn");

        if (statusEl) {
            if (!state.ok) {
                statusEl.textContent = "每日词语加载失败。";
            } else if (!state.hasAnswer) {
                statusEl.textContent = "管理员尚未设置今日答案，请稍后再来。";
            } else if (state.success) {
                statusEl.textContent = "今日已猜中，恭喜获得 " + (state.rewardCoin || 50) + " 联网币！";
            } else {
                statusEl.textContent =
                    "剩余次数 " +
                    (state.attemptsLeft || 0) +
                    " 次，今日已猜 " +
                    (state.guessCount || 0) +
                    " 次。";
            }
        }
        if (ruleEl) {
            var clue = state.clue ? "提示：" + state.clue + "；" : "";
            ruleEl.textContent =
                clue +
                "规则：每日 " +
                (state.dailyLimit || 20) +
                " 次，耗尽后可 " +
                (state.exchangeCost || 1) +
                " 联网币兑换 1 次；猜中奖励 " +
                (state.rewardCoin || 50) +
                " 联网币。";
        }
        if (hintEl) {
            if (state.directionHint) {
                hintEl.textContent = state.directionHint;
            } else {
                hintEl.textContent = "方向提示：—";
            }
        }
        if (resetEl) {
            resetEl.textContent = "下次刷新：" + fmtDateTime(state.nextResetAt);
        }
        if (submitBtn) {
            submitBtn.disabled =
                !(state.ok && state.hasAnswer) || !!state.success || wordGuessInFlight;
            submitBtn.textContent = wordGuessInFlight ? "提交中…" : "猜词";
        }
        if (buyBtn) {
            var coinAmount = Number(state.coinAmount || 0);
            var cost = Number(state.exchangeCost || 1);
            buyBtn.disabled =
                !(state.ok && state.hasAnswer) || coinAmount < cost || wordGuessInFlight;
            buyBtn.textContent = "兑换1次（" + cost + "币）";
        }
        if (hisEl) {
            var hist = Array.isArray(state.history) ? state.history : [];
            if (!hist.length) {
                hisEl.innerHTML = '<li class="shitu-li shitu-li--empty">暂无猜词记录，快来试试吧。</li>';
            } else {
                hisEl.innerHTML = hist
                    .map(function (row) {
                        var word = escHtml(String((row && row.word) || "—"));
                        var score = row && row.exact ? "猜中" : fmtPct(row && row.similarity);
                        var at = fmtDateTime(row && row.at);
                        return (
                            '<li class="shitu-li">' +
                            '<span class="word-guess-history-row">' +
                            '<span class="word-guess-history-word">' +
                            word +
                            '</span>' +
                            '<span class="word-guess-history-score">关联度 ' +
                            escHtml(score) +
                            " · " +
                            escHtml(at) +
                            "</span>" +
                            "</span></li>"
                        );
                    })
                    .join("");
            }
        }
    }

    function loadWordGuessState() {
        return api("GET", "/api/dongtian-word-guess/state", undefined)
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "每日猜词加载失败");
                lastWordGuessState = res;
                renderWordGuessModal();
                return res;
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function openWordGuessModal() {
        var modal = document.getElementById("dongtianWordGuessModal");
        if (!modal) return;
        modal.style.display = "flex";
        loadWordGuessState();
    }
    function closeWordGuessModal() {
        var modal = document.getElementById("dongtianWordGuessModal");
        if (!modal) return;
        modal.style.display = "none";
    }

    function submitWordGuess() {
        if (wordGuessInFlight) return;
        var inp = document.getElementById("dongtianWordGuessInput");
        var word = inp ? String(inp.value || "").trim() : "";
        if (!word) {
            toast("请输入要猜的词语", true);
            return;
        }
        wordGuessInFlight = true;
        renderWordGuessModal();
        api("POST", "/api/dongtian-word-guess/guess", { word: word })
            .then(function (res) {
                if (!res || !res.ok) {
                    toast((res && res.message) || "猜词失败", true);
                    return;
                }
                lastWordGuessState = res;
                renderWordGuessModal();
                toast(res.message || (res.exact ? "恭喜猜中！" : "继续加油"));
                if (inp) {
                    inp.value = "";
                    inp.focus();
                }
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            })
            .finally(function () {
                wordGuessInFlight = false;
                renderWordGuessModal();
            });
    }

    function buyWordGuessAttempt() {
        if (wordGuessInFlight) return;
        wordGuessInFlight = true;
        renderWordGuessModal();
        api("POST", "/api/dongtian-word-guess/buy-attempt", {})
            .then(function (res) {
                if (!res || !res.ok) {
                    toast((res && res.message) || "兑换失败", true);
                    return;
                }
                lastWordGuessState = res;
                renderWordGuessModal();
                toast(res.message || "已兑换 1 次");
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            })
            .finally(function () {
                wordGuessInFlight = false;
                renderWordGuessModal();
            });
    }

    /** 与 index.html 中 #dongtianHubMenuModal 内单层 sheet 一致（缓存旧版 index 时用于整壳替换） */
    var DONGTIAN_HUB_MENU_SHELL_HTML = [
        '<div class="wushen-arena-sheet dongtian-hub-menu-sheet">',
        '<header class="wushen-arena-head dongtian-hub-menu-head">',
        '<div>',
        '<p class="wushen-arena-eyebrow dongtian-hub-menu-eyebrow">洞天单机</p>',
        '<h3 class="wushen-arena-title dongtian-hub-menu-title">仙府玉牒</h3>',
        '<p class="wushen-arena-sub dongtian-hub-menu-sub">一念开阁，万法自来</p>',
        "</div>",
        '<div class="wushen-arena-head-actions">',
        '<button type="button" class="btn btn--sm btn--ghost" id="dongtianHubMenuCloseBtn">关闭</button>',
        "</div>",
        "</header>",
        '<div class="dongtian-hub-menu-tabs" role="tablist" aria-label="洞天菜单分类">',
        '<button type="button" role="tab" id="dongtianHubMenuTabFeatures" class="dongtian-hub-menu-tab dongtian-hub-menu-tab--active" data-hub-tab="0" aria-selected="true" aria-controls="dongtianHubMenuPanelFeatures">功能</button>',
        '<button type="button" role="tab" id="dongtianHubMenuTabDungeons" class="dongtian-hub-menu-tab" data-hub-tab="1" aria-selected="false" aria-controls="dongtianHubMenuPanelDungeons" tabindex="-1">副本</button>',
        '<button type="button" role="tab" id="dongtianHubMenuTabCasual" class="dongtian-hub-menu-tab" data-hub-tab="2" aria-selected="false" aria-controls="dongtianHubMenuPanelCasual" tabindex="-1">休闲</button>',
        '<button type="button" role="tab" id="dongtianHubMenuTabMojin" class="dongtian-hub-menu-tab" data-hub-tab="3" aria-selected="false" aria-controls="dongtianHubMenuPanelMojin" tabindex="-1">摸金</button>',
        "</div>",
        '<div class="dongtian-hub-menu-tabpanels">',
        '<div id="dongtianHubMenuPanelFeatures" class="dongtian-hub-menu-panel dongtian-hub-menu-panel--active" role="tabpanel" aria-labelledby="dongtianHubMenuTabFeatures" aria-hidden="false">',
        '<div class="dongtian-hub-menu-grid" role="navigation" aria-label="洞天功能">',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--shitu" id="dongtianHubMenuShituBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">师</span><span class="dongtian-hub-menu-card__name">师徒</span><span class="dongtian-hub-menu-card__hint">传道 · 授业</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--zongmen" id="dongtianHubMenuZongmenBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">宗</span><span class="dongtian-hub-menu-card__name">联网宗门</span><span class="dongtian-hub-menu-card__hint">开宗 · 聚仙</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--lingtian" id="dongtianHubMenuLingtianBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">田</span><span class="dongtian-hub-menu-card__name">灵田药园</span><span class="dongtian-hub-menu-card__hint">种药 · 采灵</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--alchemy" id="dongtianHubMenuAlchemyBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">丹</span><span class="dongtian-hub-menu-card__name">炼丹阁</span><span class="dongtian-hub-menu-card__hint">丙丁 · 化灵</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--forge" id="dongtianHubMenuForgeBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">锤</span><span class="dongtian-hub-menu-card__name">神锻阁</span><span class="dongtian-hub-menu-card__hint">铸纹 · 入器</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--yuqi" id="dongtianHubMenuYuqiBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">器</span><span class="dongtian-hub-menu-card__name">御器</span><span class="dongtian-hub-menu-card__hint">劫纹 · 蕴灵</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--lgxm" id="dongtianHubMenuLgxmBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">根</span><span class="dongtian-hub-menu-card__name">灵根血脉</span><span class="dongtian-hub-menu-card__hint">先天 · 造化</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--treasure" id="dongtianHubMenuTreasureMapBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">图</span><span class="dongtian-hub-menu-card__name">藏宝图</span><span class="dongtian-hub-menu-card__hint">秘卷 · 夺宝</span></button>',
        "</div></div>",
        '<div id="dongtianHubMenuPanelDungeons" class="dongtian-hub-menu-panel" role="tabpanel" aria-labelledby="dongtianHubMenuTabDungeons" aria-hidden="true">',
        '<div class="dongtian-hub-menu-grid dongtian-hub-menu-grid--dungeons" role="navigation" aria-label="洞天副本">',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--dragon" id="dongtianHubMenuDragonTowerBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">龍</span><span class="dongtian-hub-menu-card__name">登龙塔</span><span class="dongtian-hub-menu-card__hint">劫气 · 登阶</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--demon" id="dongtianHubMenuDemonTowerBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">煞</span><span class="dongtian-hub-menu-card__name">魔神塔</span><span class="dongtian-hub-menu-card__hint">镇魔 · 试心</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--divine" id="dongtianHubMenuDivineRealmBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">界</span><span class="dongtian-hub-menu-card__name">神界</span><span class="dongtian-hub-menu-card__hint">天门 · 叩仙</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--spirit-beast" id="dongtianHubMenuSpiritBeastBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">兽</span><span class="dongtian-hub-menu-card__name">灵兽界</span><span class="dongtian-hub-menu-card__hint">兽域 · 叩灵</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--ghost" id="dongtianHubMenuGhostRealmBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">魂</span><span class="dongtian-hub-menu-card__name">幽魂界</span><span class="dongtian-hub-menu-card__hint">魂气 · 叩冥</span></button>',
        "</div></div>",
        '<div id="dongtianHubMenuPanelCasual" class="dongtian-hub-menu-panel" role="tabpanel" aria-labelledby="dongtianHubMenuTabCasual" aria-hidden="true">',
        '<div class="dongtian-hub-menu-grid dongtian-hub-menu-grid--casual" role="navigation" aria-label="洞天休闲">',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--word" id="dongtianHubMenuWordGuessBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">谜</span><span class="dongtian-hub-menu-card__name">每日猜词</span><span class="dongtian-hub-menu-card__hint">天机 · 一字</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--yunyou" id="dongtianHubMenuSwordSpiritBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">游</span><span class="dongtian-hub-menu-card__name">剑灵云游</span><span class="dongtian-hub-menu-card__hint">剑意 · 浮生</span></button>',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--stock" id="dongtianHubMenuStockBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">股</span><span class="dongtian-hub-menu-card__name">修仙股票</span><span class="dongtian-hub-menu-card__hint">灵石 · 仙市</span></button>',
        "</div></div>",
        '<div id="dongtianHubMenuPanelMojin" class="dongtian-hub-menu-panel" role="tabpanel" aria-labelledby="dongtianHubMenuTabMojin" aria-hidden="true">',
        '<div class="dongtian-hub-menu-grid dongtian-hub-menu-grid--mojin" role="navigation" aria-label="摸金">',
        '<button type="button" class="dongtian-hub-menu-card dongtian-hub-menu-card--mojin" id="dongtianHubMenuMojinBtn"><span class="dongtian-hub-menu-card__glyph" aria-hidden="true">陵</span><span class="dongtian-hub-menu-card__name">摸金陵</span><span class="dongtian-hub-menu-card__hint">探墓 · 夺宝 · 图鉴</span></button>',
        "</div></div></div></div>"
    ].join("");

    function hubMenuShellNeedsRepair() {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return false;
        if (!document.getElementById("dongtianHubMenuTabFeatures")) return true;
        if (!document.getElementById("dongtianHubMenuTabMojin")) return true;
        if (!document.getElementById("dongtianHubMenuMojinBtn")) return true;
        if (!hub.querySelector(".dongtian-hub-menu-tabs")) return true;
        if (!hub.querySelector(".dongtian-hub-menu-tabpanels")) return true;
        return false;
    }

    /** 部分账号/浏览器仍缓存旧 index（无标签、单列「菜单」）；打开前替换为仙府玉牒壳并触发联网 UI 重绑 */
    function repairDongtianHubMenuShellIfStale() {
        if (!hubMenuShellNeedsRepair()) return false;
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub) return false;
        hub._dongtianHubMenuTabsFullyWired = false;
        hub.innerHTML = DONGTIAN_HUB_MENU_SHELL_HTML;
        return true;
    }

    function setDongtianHubMenuTab(which) {
        var i;
        var tabs = [
            document.getElementById("dongtianHubMenuTabFeatures"),
            document.getElementById("dongtianHubMenuTabDungeons"),
            document.getElementById("dongtianHubMenuTabCasual"),
            document.getElementById("dongtianHubMenuTabMojin")
        ];
        var panels = [
            document.getElementById("dongtianHubMenuPanelFeatures"),
            document.getElementById("dongtianHubMenuPanelDungeons"),
            document.getElementById("dongtianHubMenuPanelCasual"),
            document.getElementById("dongtianHubMenuPanelMojin")
        ];
        if (which < 0 || which > 3) which = 0;
        for (i = 0; i < 4; i++) {
            var on = i === which;
            if (tabs[i]) {
                tabs[i].classList.toggle("dongtian-hub-menu-tab--active", on);
                tabs[i].setAttribute("aria-selected", on ? "true" : "false");
                tabs[i].tabIndex = on ? 0 : -1;
            }
            if (panels[i]) {
                panels[i].classList.toggle("dongtian-hub-menu-panel--active", on);
                panels[i].setAttribute("aria-hidden", on ? "false" : "true");
            }
        }
    }

    /**
     * 标签切换：在 tab 按钮上用捕获阶段直接绑定。iframe/移动端下委托到 tablist 可能点不中右侧标签
     *（被标题栏或下层 stacking 挡住）；capture + 提高 z-index 更稳。
     */
    function ensureHubMenuTabsWired() {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub || hub._dongtianHubMenuTabsFullyWired) return;
        hub._dongtianHubMenuTabsFullyWired = true;
        var ids = [
            "dongtianHubMenuTabFeatures",
            "dongtianHubMenuTabDungeons",
            "dongtianHubMenuTabCasual",
            "dongtianHubMenuTabMojin"
        ];
        var i;
        for (i = 0; i < ids.length; i++) {
            (function (idx) {
                var btn = document.getElementById(ids[idx]);
                if (!btn || btn._dongtianHubTabCaptureBound) return;
                btn._dongtianHubTabCaptureBound = true;
                btn.addEventListener(
                    "click",
                    function (ev) {
                        if (ev) {
                            ev.preventDefault();
                            ev.stopPropagation();
                        }
                        setDongtianHubMenuTab(idx);
                    },
                    true
                );
            })(i);
        }
    }

    function openHubMenuModal() {
        var m = document.getElementById("dongtianHubMenuModal");
        if (!m) return;
        var repaired = repairDongtianHubMenuShellIfStale();
        if (repaired && typeof window.initDongtianHubMenuUI === "function") {
            try {
                window.initDongtianHubMenuUI();
            } catch (eHubRepairMenu) {}
        }
        if (repaired && typeof window.initDongtianStandaloneHubUi === "function") {
            try {
                window.initDongtianStandaloneHubUi();
            } catch (eHubRepairInitLocal) {}
        }
        if (repaired && typeof window.initDongtianCloudMarketAndArenaUi === "function") {
            try {
                window.initDongtianCloudMarketAndArenaUi();
            } catch (eHubRepairInit) {}
        }
        ensureHubMenuTabsWired();
        setDongtianHubMenuTab(0);
        /** 斗法开战时可能用 !important 压层关闭菜单，此处须先清再打开 */
        try {
            m.style.removeProperty("display");
        } catch (eRm) {}
        m.style.display = "flex";
    }
    function closeHubMenuModal() {
        var m = document.getElementById("dongtianHubMenuModal");
        if (!m) return;
        try {
            m.style.removeProperty("display");
        } catch (eRm2) {}
        m.style.display = "none";
    }
    function openLingtianModal() {
        if (typeof window.openDongtianLingtianModal === "function") {
            window.openDongtianLingtianModal();
            return;
        }
        var m = document.getElementById("dongtianLingtianModal");
        if (!m) return;
        m.style.display = "flex";
    }
    function closeLingtianModal() {
        var m = document.getElementById("dongtianLingtianModal");
        if (!m) return;
        m.style.display = "none";
    }
    window.openDongtianHubMenuModal = openHubMenuModal;
    window.closeDongtianHubMenuModal = closeHubMenuModal;

    function openShituModal() {
        var modal = document.getElementById("dongtianShituModal");
        if (!modal) return;
        dongtianShituPullState()
            .then(function (res) {
                if (!res || !res.ok) {
                    toast((res && res.message) || "无法加载师徒数据", true);
                    return;
                }
                renderShituModal();
                modal.style.display = "flex";
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }
    window.openDongtianShituModal = openShituModal;

    function closeShituModal() {
        var modal = document.getElementById("dongtianShituModal");
        if (modal) modal.style.display = "none";
    }

    function wireWordGuessModalOnce() {
        var modal = document.getElementById("dongtianWordGuessModal");
        if (!modal || modal._wordGuessWired) return;
        modal._wordGuessWired = true;
        var closeBtn = document.getElementById("dongtianWordGuessCloseBtn");
        if (closeBtn) closeBtn.onclick = closeWordGuessModal;
        var refreshBtn = document.getElementById("dongtianWordGuessRefreshBtn");
        if (refreshBtn) refreshBtn.onclick = loadWordGuessState;
        var submitBtn = document.getElementById("dongtianWordGuessSubmitBtn");
        if (submitBtn) submitBtn.onclick = submitWordGuess;
        var buyBtn = document.getElementById("dongtianWordGuessBuyBtn");
        if (buyBtn) buyBtn.onclick = buyWordGuessAttempt;
        var inp = document.getElementById("dongtianWordGuessInput");
        if (inp && !inp._wordGuessEnterBound) {
            inp._wordGuessEnterBound = true;
            inp.addEventListener("keydown", function (ev) {
                if (ev.key !== "Enter") return;
                ev.preventDefault();
                submitWordGuess();
            });
        }
    }

    function wireShituModalOnce() {
        var modal = document.getElementById("dongtianShituModal");
        if (!modal || modal._shituWired) return;
        modal._shituWired = true;
        var c = document.getElementById("dongtianShituCloseBtn");
        if (c) c.onclick = closeShituModal;
        var applyBtn = document.getElementById("shituApplyBtn");
        if (applyBtn) {
            applyBtn.onclick = function () {
                var inp = document.getElementById("shituTargetPidInput");
                var v = inp ? Math.floor(Number(String(inp.value || "").trim())) : NaN;
                if (!Number.isFinite(v) || v < 1 || v > 10000) {
                    toast("请输入有效的灵网身份（1–10000）", true);
                    return;
                }
                api("POST", "/api/dongtian-shitu/apply", { targetPublicId: v })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "申请失败", true);
                            return;
                        }
                        toast(res.message || "已发送申请");
                        return dongtianShituPullState().then(renderShituModal);
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        var gradBtn = document.getElementById("shituGraduateBtn");
        if (gradBtn) {
            gradBtn.onclick = function () {
                if (!confirm("确定出师？将领取奖励并解除师徒关系。")) return;
                api("POST", "/api/dongtian-shitu/graduate", {})
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "出师失败", true);
                            return;
                        }
                        toast(res.message || "出师成功");
                        return reloadDongtianSaveFromServer(res).then(function () {
                            return dongtianShituPullState().then(function () {
                                renderShituModal();
                            });
                        });
                    })
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            };
        }
        modal.addEventListener("click", function (ev) {
            var t = ev.target;
            if (!t || !t.getAttribute) return;
            if (t.classList.contains("shitu-accept")) {
                var aid = t.getAttribute("data-aid");
                if (!aid) return;
                api("POST", "/api/dongtian-shitu/accept", { applicantUserId: aid }).then(function (res) {
                    if (!res || !res.ok) {
                        toast((res && res.message) || "操作失败", true);
                        return;
                    }
                    toast(res.message || "已收徒");
                    dongtianShituPullState().then(renderShituModal);
                });
            } else if (t.classList.contains("shitu-reject")) {
                var rid = t.getAttribute("data-aid");
                if (!rid) return;
                api("POST", "/api/dongtian-shitu/reject", { applicantUserId: rid }).then(function (res) {
                    if (!res || !res.ok) return;
                    dongtianShituPullState().then(renderShituModal);
                });
            } else if (t.classList.contains("shitu-expel")) {
                var eid = t.getAttribute("data-aid");
                if (!eid) return;
                if (!confirm("确定逐出该徒弟？")) return;
                api("POST", "/api/dongtian-shitu/expel", { apprenticeUserId: eid }).then(function (res) {
                    if (!res || !res.ok) {
                        toast((res && res.message) || "操作失败", true);
                        return;
                    }
                    toast(res.message || "已逐出");
                    dongtianShituPullState().then(renderShituModal);
                });
            }
        });
    }

    window.initDongtianHubMenuShell = function () {
        ensureHubMenuTabsWired();
        var hubBtn = document.getElementById("dongtianHubMenuOpenBtn");
        if (hubBtn && !hubBtn._shituHubBound) {
            hubBtn._shituHubBound = true;
            hubBtn.onclick = function () {
                openHubMenuModal();
            };
        }
        var hubClose = document.getElementById("dongtianHubMenuCloseBtn");
        if (hubClose && !hubClose._shituBound) {
            hubClose._shituBound = true;
            hubClose.onclick = closeHubMenuModal;
        }
        var lingtianClose = document.getElementById("dongtianLingtianCloseBtn");
        if (lingtianClose && !lingtianClose._lingtianBound) {
            lingtianClose._lingtianBound = true;
            lingtianClose.onclick = closeLingtianModal;
        }
    };

    window.initDongtianShituUI = function () {
        window.initDongtianHubMenuShell();
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (typeof window.ensureCloudMarketBarStructure === "function") window.ensureCloudMarketBarStructure();
        var toShitu = document.getElementById("dongtianHubMenuShituBtn");
        if (toShitu && !toShitu._shituBound) {
            toShitu._shituBound = true;
            toShitu.onclick = function () {
                closeHubMenuModal();
                openShituModal();
            };
        }
        var toLingtian = document.getElementById("dongtianHubMenuLingtianBtn");
        if (toLingtian && !toLingtian._lingtianBound) {
            toLingtian._lingtianBound = true;
            toLingtian.onclick = function () {
                closeHubMenuModal();
                openLingtianModal();
            };
        }
        var toWordGuess = document.getElementById("dongtianHubMenuWordGuessBtn");
        if (toWordGuess && !toWordGuess._wordGuessBound) {
            toWordGuess._wordGuessBound = true;
            toWordGuess.onclick = function () {
                closeHubMenuModal();
                openWordGuessModal();
            };
        }
        var lingtianClose = document.getElementById("dongtianLingtianCloseBtn");
        if (lingtianClose && !lingtianClose._lingtianBound) {
            lingtianClose._lingtianBound = true;
            lingtianClose.onclick = closeLingtianModal;
        }
        wireWordGuessModalOnce();
        wireShituModalOnce();
        if (typeof window.initDongtianTreasureMapUI === "function") window.initDongtianTreasureMapUI();
        dongtianShituPullState().catch(function () {});
    };

    /** iframe 嵌入时 initDongtianCloudMarketAndArenaUi 可能早于本文件执行；脚本加载完立即委托绑定标签，不依赖打开菜单的时机 */
    try {
        ensureHubMenuTabsWired();
    } catch (eHubTabs) {}
})();
