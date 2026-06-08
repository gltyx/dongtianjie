/**
 * 洞天劫 · 联网宗门：菜单入口、创建、加入、任命、逐出
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
        clearTimeout(el._zongmenT);
        el._zongmenT = setTimeout(function () {
            el.style.display = "none";
        }, 3200);
    }

    var zmConfirmCallback = null;
    var zmPromptState = null;

    function closeZmConfirm() {
        var modal = document.getElementById("dtZmConfirmModal");
        if (modal) modal.style.display = "none";
        zmConfirmCallback = null;
    }

    function showZmConfirm(opts) {
        opts = opts || {};
        var modal = document.getElementById("dtZmConfirmModal");
        var titleEl = document.getElementById("dtZmConfirmTitle");
        var descEl = document.getElementById("dtZmConfirmDesc");
        var okBtn = document.getElementById("dtZmConfirmOkBtn");
        if (!modal || !titleEl || !descEl || !okBtn) {
            if (typeof confirm !== "undefined" && confirm(opts.message || opts.title || "确认？")) {
                if (typeof opts.onOk === "function") opts.onOk();
            }
            return;
        }
        titleEl.textContent = opts.title || "确认操作";
        descEl.textContent = opts.message || "";
        okBtn.textContent = opts.okText || "确定";
        okBtn.className = "btn btn--sm " + (opts.danger ? "dt-zm-confirm-ok--danger" : "btn--primary");
        zmConfirmCallback = typeof opts.onOk === "function" ? opts.onOk : null;
        modal.style.display = "flex";
    }

    function closeZmPrompt() {
        var modal = document.getElementById("dtZmPromptModal");
        if (modal) modal.style.display = "none";
        zmPromptState = null;
    }

    function showZmPrompt(opts) {
        opts = opts || {};
        var modal = document.getElementById("dtZmPromptModal");
        var titleEl = document.getElementById("dtZmPromptTitle");
        var descEl = document.getElementById("dtZmPromptDesc");
        var labelEl = document.getElementById("dtZmPromptLabel");
        var inp = document.getElementById("dtZmPromptInput");
        var errEl = document.getElementById("dtZmPromptErr");
        var okBtn = document.getElementById("dtZmPromptOkBtn");
        if (!modal || !titleEl || !descEl || !inp || !okBtn) {
            var typed = typeof prompt !== "undefined" ? prompt(opts.message || opts.title || "请输入", "") : null;
            if (typed == null) return;
            if (opts.expected != null && String(typed).trim() !== String(opts.expected).trim()) {
                toast(opts.mismatchMessage || "输入不匹配，已取消", true);
                return;
            }
            if (typeof opts.onOk === "function") opts.onOk(String(typed).trim());
            return;
        }
        titleEl.textContent = opts.title || "输入确认";
        descEl.textContent = opts.message || "";
        if (labelEl) labelEl.textContent = opts.label || "请输入确认内容";
        inp.value = "";
        if (errEl) {
            errEl.textContent = "";
            errEl.hidden = true;
        }
        okBtn.textContent = opts.okText || "确定";
        okBtn.className = "btn btn--sm " + (opts.danger ? "dt-zm-confirm-ok--danger" : "btn--primary");
        zmPromptState = opts;
        modal.style.display = "flex";
        setTimeout(function () {
            try {
                inp.focus();
            } catch (eFocus) {}
        }, 30);
    }

    function wireZmDialogOnce() {
        if (document.body && document.body._zmDialogWired) return;
        if (document.body) document.body._zmDialogWired = true;

        var cModal = document.getElementById("dtZmConfirmModal");
        var cOk = document.getElementById("dtZmConfirmOkBtn");
        var cCancel = document.getElementById("dtZmConfirmCancelBtn");
        if (cOk) {
            cOk.onclick = function () {
                var cb = zmConfirmCallback;
                closeZmConfirm();
                if (typeof cb === "function") cb();
            };
        }
        if (cCancel) cCancel.onclick = closeZmConfirm;
        if (cModal) {
            cModal.addEventListener("click", function (ev) {
                if (ev.target === cModal) closeZmConfirm();
            });
        }

        var pModal = document.getElementById("dtZmPromptModal");
        var pOk = document.getElementById("dtZmPromptOkBtn");
        var pCancel = document.getElementById("dtZmPromptCancelBtn");
        var pInp = document.getElementById("dtZmPromptInput");
        var pErr = document.getElementById("dtZmPromptErr");
        function submitPrompt() {
            var st = zmPromptState;
            if (!st || !pInp) return;
            var typed = String(pInp.value || "").trim();
            if (st.expected != null && typed !== String(st.expected).trim()) {
                if (pErr) {
                    pErr.textContent = st.mismatchMessage || "输入不匹配，请重新输入";
                    pErr.hidden = false;
                }
                return;
            }
            var cb = st.onOk;
            closeZmPrompt();
            if (typeof cb === "function") cb(typed);
        }
        if (pOk) pOk.onclick = submitPrompt;
        if (pCancel) pCancel.onclick = closeZmPrompt;
        if (pInp) {
            pInp.addEventListener("keydown", function (ev) {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    submitPrompt();
                }
            });
        }
        if (pModal) {
            pModal.addEventListener("click", function (ev) {
                if (ev.target === pModal) closeZmPrompt();
            });
        }
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

    var lastState = null;
    var lastList = null;
    var selectedBadge = "huoqiu";
    var activeTab = "browse";
    var memberPage = 0;
    var MEMBERS_PAGE_SIZE = 10;

    var ZM_TABS_OUT = ["browse", "create"];
    var ZM_TABS_IN = ["announce", "members", "gongfa", "pending", "daily"];
    var ZONGMEN_LEVEL_BONUS_PCT_PER = 50;

    function syncZongmenCombatBonusFromState(res) {
        var lv = 0;
        if (res && res.ok && res.sect && res.sect.level) {
            lv = Math.max(1, Math.floor(Number(res.sect.level)) || 1);
        }
        var scales = { hp: 1, atk: 1, def: 1, atkSpd: 1, vamp: 1, critRate: 1, critDmg: 1 };
        if (res && res.ok && res.sect && typeof res.sect.levelBonusPctPerLevel === "number") {
            ZONGMEN_LEVEL_BONUS_PCT_PER = Math.max(0, Math.floor(Number(res.sect.levelBonusPctPerLevel)) || 50);
        }
        if (res && res.ok && res.sect && res.sect.techniqueScales) {
            scales = res.sect.techniqueScales;
        }
        if (typeof player !== "undefined" && player) {
            player.dongtianZongmenSectLevel = lv;
            player.dongtianZongmenTechniqueScales = scales;
        }
        window.__dongtianZongmenSectLevel = lv;
        window.__dongtianZongmenTechniqueScales = scales;
    }

    window.getDongtianZongmenTechniqueScales = function () {
        var base = { hp: 1, atk: 1, def: 1, atkSpd: 1, vamp: 1, critRate: 1, critDmg: 1 };
        var src =
            typeof player !== "undefined" && player && player.dongtianZongmenTechniqueScales
                ? player.dongtianZongmenTechniqueScales
                : window.__dongtianZongmenTechniqueScales;
        if (!src || typeof src !== "object") return base;
        var out = {};
        ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"].forEach(function (k) {
            var v = Number(src[k]);
            out[k] = v > 1 && isFinite(v) ? v : 1;
        });
        return out;
    };

    window.getDongtianZongmenOpportunityScale = function () {
        var lv = 0;
        if (typeof player !== "undefined" && player && player.dongtianZongmenSectLevel > 0) {
            lv = Math.floor(Number(player.dongtianZongmenSectLevel)) || 0;
        } else if (window.__dongtianZongmenSectLevel > 0) {
            lv = Math.floor(Number(window.__dongtianZongmenSectLevel)) || 0;
        }
        if (lv <= 0) return 1;
        return 1 + (lv * ZONGMEN_LEVEL_BONUS_PCT_PER) / 100;
    };

    window.getDongtianZongmenLevelBonusPct = function () {
        var scale = window.getDongtianZongmenOpportunityScale();
        if (scale <= 1) return 0;
        return Math.round((scale - 1) * 100);
    };

    function tabDomId(tab, kind) {
        var cap = tab.charAt(0).toUpperCase() + tab.slice(1);
        return kind === "btn" ? "dtZmTab" + cap : "dtZmPanel" + cap;
    }

    function inSectAllowedTabs() {
        if (!lastState || !lastState.ok || !lastState.sect) return [];
        var tabs = ["announce", "members", "gongfa", "daily"];
        if (lastState.canManage) tabs.splice(3, 0, "pending");
        return tabs;
    }

    function normalizeActiveTab(tab, inSect) {
        var allowed = inSect ? inSectAllowedTabs() : ZM_TABS_OUT;
        if (allowed.indexOf(tab) < 0) return allowed[0];
        return tab;
    }

    function dongtianZongmenPullState() {
        return api("GET", "/api/dongtian-zongmen/state", undefined).then(function (res) {
            if (res && res.ok) {
                lastState = res;
                syncZongmenCombatBonusFromState(res);
                if (typeof calculateStats === "function") calculateStats();
                if (typeof playerLoadStats === "function") playerLoadStats();
            }
            return res;
        });
    }
    window.dongtianZongmenPullState = dongtianZongmenPullState;

    function dongtianZongmenPullList() {
        return api("GET", "/api/dongtian-zongmen/list", undefined).then(function (res) {
            if (res && res.ok) lastList = res;
            return res;
        });
    }

    var ZM_BADGE_FALLBACK = [
        { id: "tuzi", name: "兔子", file: "兔子.jpg" },
        { id: "siwang", name: "奢望", file: "奢望.jpg" },
        { id: "emo", name: "恶魔", file: "恶魔.jpg" },
        { id: "wukong", name: "悟空", file: "悟空.jpg" },
        { id: "meihua", name: "梅花", file: "梅花.jpg" },
        { id: "qiqiu", name: "气球", file: "气球.jpg" },
        { id: "huoqiu", name: "火球", file: "火球.jpg" },
        { id: "xiongmao", name: "熊猫", file: "熊猫.jpg" },
        { id: "niumo", name: "牛魔", file: "牛魔.jpg" },
        { id: "yanjing", name: "眼睛", file: "眼睛.jpg" },
        { id: "suixie", name: "碎屑", file: "碎屑.jpg" },
        { id: "suipian", name: "碎片", file: "碎片.jpg" },
        { id: "huah", name: "花啊", file: "花啊.jpg" },
        { id: "shandian", name: "闪电", file: "闪电.jpg" },
        { id: "leidian", name: "雷电", file: "雷电.jpg" },
        { id: "kulou", name: "骷髅", file: "骷髅.jpg" },
        { id: "yugu", name: "鱼骨", file: "鱼骨.jpg" },
        { id: "qilin", name: "麒麟", file: "麒麟.jpg" },
    ];

    function badgeCatalog() {
        if (lastState && lastState.badges && lastState.badges.length) return lastState.badges;
        return ZM_BADGE_FALLBACK;
    }

    function badgeLookup(id) {
        var list = badgeCatalog();
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
        }
        return list[0] || null;
    }

    function badgeImgSrc(file) {
        return "assets/huizhang/" + encodeURIComponent(file || "");
    }

    function badgeItemFromSect(s) {
        if (!s) return null;
        if (s.badgeFile) return { id: s.badge, name: s.badgeName, file: s.badgeFile };
        return badgeLookup(s.badge);
    }

    function badgeImgMarkup(item, extraClass, alt) {
        if (!item || !item.file) {
            return '<span class="dt-zm-badge__fallback">' + escHtml((item && item.name) || "宗") + "</span>";
        }
        var cls = "dt-zm-badge__img" + (extraClass ? " " + extraClass : "");
        return (
            '<span class="dt-zm-badge__img-wrap">' +
            '<img class="' +
            cls +
            '" src="' +
            escHtml(badgeImgSrc(item.file)) +
            '" alt="' +
            escHtml(alt || item.name || "") +
            '" loading="lazy" decoding="async">' +
            "</span>"
        );
    }

    function setHeroBadgeEl(el, sectOrNull) {
        if (!el) return;
        if (!sectOrNull) {
            el.innerHTML = '<span class="dt-zm-badge__fallback dt-zm-badge__fallback--hero">宗</span>';
            return;
        }
        el.innerHTML = badgeImgMarkup(badgeItemFromSect(sectOrNull), "dt-zm-badge__img--hero", sectOrNull.badgeName);
    }

    function roleClass(role) {
        if (role === "leader") return "dt-zm-role--leader";
        if (role === "vice") return "dt-zm-role--vice";
        if (role === "elder") return "dt-zm-role--elder";
        return "dt-zm-role--disciple";
    }

    function ensureBadgesLoaded() {
        var cached = lastState && lastState.badges;
        if (cached && cached.length) return Promise.resolve(cached);
        return api("GET", "/api/dongtian-zongmen/badges", undefined).then(function (res) {
            var list = res && res.ok && res.badges && res.badges.length ? res.badges : ZM_BADGE_FALLBACK;
            if (lastState) lastState.badges = list;
            return list;
        });
    }

    function renderBadgePicker(badges) {
        var box = document.getElementById("dtZmBadgePicker");
        if (!box) return;
        var list = badges || badgeCatalog();
        if (!list.length) {
            box.innerHTML = '<p class="wushen-arena-muted">徽章加载中…</p>';
            ensureBadgesLoaded()
                .then(function (loaded) {
                    if (loaded.length) renderBadgePicker(loaded);
                })
                .catch(function () {
                    box.innerHTML = '<p class="wushen-arena-muted">徽章加载失败，请刷新重试</p>';
                });
            return;
        }
        box.innerHTML = list
            .map(function (b) {
                var sel = b.id === selectedBadge ? " dt-zm-badge--selected" : "";
                return (
                    '<button type="button" class="dt-zm-badge' +
                    sel +
                    '" data-badge="' +
                    escHtml(b.id) +
                    '" title="' +
                    escHtml(b.name || b.id) +
                    '">' +
                    badgeImgMarkup(b, "dt-zm-badge__img--pick") +
                    "</button>"
                );
            })
            .join("");
    }

    function renderSectList() {
        var ul = document.getElementById("dtZmSectList");
        if (!ul) return;
        var res = lastList;
        if (!res || !res.ok || !res.list || !res.list.length) {
            ul.innerHTML = '<li class="dt-zm-li dt-zm-li--empty">暂无宗门，你可开宗立派</li>';
            return;
        }
        var inSect = lastState && lastState.sect;
        ul.innerHTML = res.list
            .map(function (s) {
                var full = s.memberCount >= s.maxMembers;
                var btn =
                    inSect || full
                        ? ""
                        : '<button type="button" class="btn btn--sm btn--primary dt-zm-apply" data-sid="' +
                          escHtml(s.id) +
                          '">申请入门</button>';
                return (
                    '<li class="dt-zm-li dt-zm-li--sect">' +
                    '<div class="dt-zm-sect-row">' +
                    '<span class="dt-zm-sect-badge">' +
                    badgeImgMarkup(badgeItemFromSect(s), "dt-zm-badge__img--list", s.badgeName) +
                    "</span>" +
                    '<div class="dt-zm-sect-info">' +
                    '<strong class="dt-zm-sect-name">' +
                    escHtml(s.name) +
                    "</strong>" +
                    '<span class="dt-zm-sect-meta">Lv.' +
                    (s.level || 1) +
                    " " +
                    escHtml(s.realmShort || "末流宗门") +
                    " · 宗主 " +
                    escHtml(s.leaderName || "—") +
                    " · " +
                    s.memberCount +
                    "/" +
                    s.maxMembers +
                    " 人" +
                    (s.announcementPreview ? " · " + escHtml(s.announcementPreview) : "") +
                    "</span>" +
                    "</div>" +
                    btn +
                    "</div></li>"
                );
            })
            .join("");
    }

    function fmtLastOnline(m) {
        if (m && m.isOnline) {
            return '<span class="dt-zm-online">在线</span>';
        }
        if (!m || !m.lastOnlineAt) return "—";
        return escHtml(fmtDateTime(m.lastOnlineAt));
    }

    function renderMembers() {
        var box = document.getElementById("dtZmMemberList");
        if (!box) return;
        var res = lastState;
        if (!res || !res.ok || !res.sect) {
            box.innerHTML = '<p class="dt-zm-roster-empty">尚未加入宗门</p>';
            return;
        }
        var myRole = res.myRole;
        var canAppoint = !!res.canAppoint;
        var canTransfer = !!res.canTransferLeader;
        var members = res.members || [];
        if (!members.length) {
            box.innerHTML = '<p class="dt-zm-roster-empty">暂无成员</p>';
            return;
        }
        var rankOrder = { leader: 4, vice: 3, elder: 2, disciple: 1 };
        members.sort(function (a, b) {
            return (rankOrder[b.role] || 0) - (rankOrder[a.role] || 0);
        });
        var totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PAGE_SIZE));
        if (memberPage >= totalPages) memberPage = totalPages - 1;
        if (memberPage < 0) memberPage = 0;
        var pageStart = memberPage * MEMBERS_PAGE_SIZE;
        var pageMembers = members.slice(pageStart, pageStart + MEMBERS_PAGE_SIZE);
        var rows = pageMembers
            .map(function (m) {
                var isSelf = res.self && m.userId === res.self.userId;
                var actions = "";
                if (!isSelf && m.role !== "leader") {
                    var kickAllowed =
                        (myRole === "leader" && (m.role === "vice" || m.role === "elder" || m.role === "disciple")) ||
                        (myRole === "vice" && (m.role === "elder" || m.role === "disciple")) ||
                        (myRole === "elder" && m.role === "disciple");
                    if (canAppoint && m.role === "disciple") {
                        actions +=
                            '<button type="button" class="btn btn--sm btn--ghost dt-zm-appoint-vice" data-uid="' +
                            escHtml(m.userId) +
                            '">任副宗</button>';
                        actions +=
                            '<button type="button" class="btn btn--sm btn--ghost dt-zm-appoint-elder" data-uid="' +
                            escHtml(m.userId) +
                            '">任长老</button>';
                    }
                    if (canAppoint && (m.role === "vice" || m.role === "elder")) {
                        actions +=
                            '<button type="button" class="btn btn--sm btn--ghost dt-zm-demote" data-uid="' +
                            escHtml(m.userId) +
                            '">撤职</button>';
                    }
                    if (canTransfer && m.role !== "leader") {
                        actions +=
                            '<button type="button" class="btn btn--sm btn--accent dt-zm-transfer" data-uid="' +
                            escHtml(m.userId) +
                            '" data-name="' +
                            escHtml(m.name || "该修士") +
                            '">转让宗主</button>';
                    }
                    if (kickAllowed) {
                        actions +=
                            '<button type="button" class="btn btn--sm btn--ghost dt-zm-kick" data-uid="' +
                            escHtml(m.userId) +
                            '">逐出</button>';
                    }
                }
                return (
                    "<tr class=\"dt-zm-roster-row" +
                    (isSelf ? " dt-zm-roster-row--self" : "") +
                    '">' +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--role">' +
                    '<span class="dt-zm-role ' +
                    roleClass(m.role) +
                    '">' +
                    escHtml(m.roleLabel) +
                    "</span></td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--name">' +
                    escHtml(m.name || "无名") +
                    "</td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--pid">#' +
                    (m.dongtianPublicId != null ? escHtml(String(m.dongtianPublicId)) : "—") +
                    "</td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--floor">' +
                    escHtml(String(m.maxDungeonFloor || 1)) +
                    " 层</td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--realm">' +
                    escHtml(m.maxRealmLabel || "—") +
                    "</td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--progress">' +
                    escHtml(m.progressLabel || (m.currentFloor != null ? String(m.currentFloor) + "层·" + String(m.currentRoom || 1) + "劫" : "1层·1劫")) +
                    "</td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--contrib">' +
                    escHtml(String(Math.floor(Number(m.contribution) || 0))) +
                    "</td>" +
                    '<td class="dt-zm-roster-cell dt-zm-roster-cell--online">' +
                    fmtLastOnline(m) +
                    "</td>" +
                    (actions
                        ? '<td class="dt-zm-roster-cell dt-zm-roster-cell--actions"><div class="dt-zm-member-actions">' +
                          actions +
                          "</div></td>"
                        : '<td class="dt-zm-roster-cell dt-zm-roster-cell--actions"></td>') +
                    "</tr>"
                );
            })
            .join("");
        var pagerHtml = "";
        if (totalPages > 1) {
            pagerHtml =
                '<div class="dt-zm-roster-pager">' +
                '<button type="button" class="btn btn--sm btn--ghost dt-zm-roster-prev"' +
                (memberPage <= 0 ? " disabled" : "") +
                ">上一页</button>" +
                '<span class="dt-zm-roster-pager__info">第 ' +
                escHtml(String(memberPage + 1)) +
                " / " +
                escHtml(String(totalPages)) +
                " 页 · 共 " +
                escHtml(String(members.length)) +
                " 人</span>" +
                '<button type="button" class="btn btn--sm btn--ghost dt-zm-roster-next"' +
                (memberPage >= totalPages - 1 ? " disabled" : "") +
                ">下一页</button>" +
                "</div>";
        } else {
            pagerHtml =
                '<div class="dt-zm-roster-pager dt-zm-roster-pager--single">' +
                '<span class="dt-zm-roster-pager__info">共 ' +
                escHtml(String(members.length)) +
                " 人</span></div>";
        }
        box.innerHTML =
            '<div class="dt-zm-roster-wrap">' +
            '<table class="dt-zm-roster">' +
            "<thead><tr>" +
            "<th>职位</th>" +
            "<th>道号</th>" +
            "<th>ID</th>" +
            "<th>秘境最高</th>" +
            "<th>最高境界</th>" +
            "<th>当前层·劫</th>" +
            "<th>贡献</th>" +
            "<th>最后在线</th>" +
            "<th></th>" +
            "</tr></thead>" +
            "<tbody>" +
            rows +
            "</tbody></table></div>" +
            pagerHtml;
    }

    function gongfaStatClass(stat) {
        if (stat === "hp") return "dt-zm-gongfa-card--hp";
        if (stat === "atk") return "dt-zm-gongfa-card--atk";
        if (stat === "def") return "dt-zm-gongfa-card--def";
        if (stat === "critDmg") return "dt-zm-gongfa-card--critdmg";
        if (stat === "vamp") return "dt-zm-gongfa-card--vamp";
        if (stat === "atkSpd") return "dt-zm-gongfa-card--aspd";
        if (stat === "critRate") return "dt-zm-gongfa-card--crit";
        return "";
    }

    function renderGongfa() {
        var grid = document.getElementById("dtZmGongfaGrid");
        var poolEl = document.getElementById("dtZmGongfaPool");
        var hintEl = document.getElementById("dtZmGongfaHint");
        var res = lastState;
        if (!grid) return;
        if (!res || !res.ok || !res.sect) {
            grid.innerHTML = "";
            if (poolEl) poolEl.textContent = "0";
            return;
        }
        var total = Math.floor(Number(res.sect.totalContribution) || 0);
        if (poolEl) poolEl.textContent = String(total);
        var list = res.techniques || [];
        if (hintEl) {
            var costFormula =
                list.length && list[0].nextCostFormula ? list[0].nextCostFormula : "50 + 下级×50";
            hintEl.textContent = res.canUpgradeTechniques
                ? "全宗共享加成 · 参悟消耗宗门总贡献（" + costFormula + "）"
                : "全宗共享加成 · 仅宗主与副宗主可参悟升级 · 升级后全宗生效";
        }
        if (!list.length) {
            grid.innerHTML = '<p class="dt-zm-roster-empty">暂无功法数据</p>';
            return;
        }
        grid.innerHTML = list
            .map(function (t) {
                var lv = Math.floor(Number(t.level) || 0);
                var bonus = Math.floor(Number(t.bonusPct) || 0);
                var scale = Number(t.scale) || 1;
                var nextCost = Math.floor(Number(t.nextCost) || 0);
                var canUp = !!t.canUpgrade;
                var afford = !!t.canAfford;
                var btn =
                    canUp
                        ? '<button type="button" class="btn btn--sm ' +
                          (afford ? "btn--accent" : "btn--ghost") +
                          ' dt-zm-gongfa-upgrade" data-tid="' +
                          escHtml(t.id) +
                          '"' +
                          (afford ? "" : " disabled") +
                          ">参悟升级 · " +
                          escHtml(String(nextCost)) +
                          " 贡献</button>"
                        : '<span class="dt-zm-gongfa-readonly">全宗已生效 · Lv.' +
                          escHtml(String(lv)) +
                          "</span>";
                return (
                    '<article class="dt-zm-gongfa-card ' +
                    gongfaStatClass(t.stat) +
                    '">' +
                    '<div class="dt-zm-gongfa-card__top">' +
                    '<span class="dt-zm-gongfa-card__glyph" aria-hidden="true">' +
                    escHtml(t.glyph || "法") +
                    "</span>" +
                    '<div class="dt-zm-gongfa-card__titles">' +
                    '<h5 class="dt-zm-gongfa-card__name">' +
                    escHtml(t.name || "") +
                    "</h5>" +
                    '<p class="dt-zm-gongfa-card__tag">' +
                    escHtml(t.tagline || "") +
                    " · " +
                    escHtml(t.statLabel || "") +
                    "机缘</p>" +
                    "</div>" +
                    '<span class="dt-zm-gongfa-card__lv">Lv.' +
                    escHtml(String(lv)) +
                    "</span>" +
                    "</div>" +
                    '<div class="dt-zm-gongfa-card__stats">' +
                    '<div class="dt-zm-gongfa-stat"><span class="dt-zm-gongfa-stat__k">每级</span><span class="dt-zm-gongfa-stat__v">+' +
                    escHtml(String(t.pctPerLevel || 0)) +
                    "%</span></div>" +
                    '<div class="dt-zm-gongfa-stat"><span class="dt-zm-gongfa-stat__k">当前</span><span class="dt-zm-gongfa-stat__v">+' +
                    escHtml(String(bonus)) +
                    "% · ×" +
                    escHtml(scale.toFixed(2)) +
                    "</span></div>" +
                    '<div class="dt-zm-gongfa-stat"><span class="dt-zm-gongfa-stat__k">下级</span><span class="dt-zm-gongfa-stat__v">' +
                    escHtml(String(nextCost)) +
                    " 贡献</span></div>" +
                    "</div>" +
                    '<div class="dt-zm-gongfa-card__foot">' +
                    btn +
                    "</div></article>"
                );
            })
            .join("");
    }

    function renderAnnouncement() {
        var viewEl = document.getElementById("dtZmAnnounceView");
        var editBox = document.getElementById("dtZmAnnounceEdit");
        var timeEl = document.getElementById("dtZmAnnounceTime");
        var inp = document.getElementById("dtZmAnnounceInput");
        var res = lastState;
        if (!res || !res.ok || !res.sect) return;
        var text = res.sect.announcement || "";
        var canEdit = !!res.canEditAnnouncement;
        if (viewEl) {
            viewEl.textContent = text || "暂无公告，宗主或副宗主可发布宗门告示。";
            viewEl.classList.toggle("dt-zm-announce-view--empty", !text);
        }
        if (timeEl) {
            timeEl.textContent = res.sect.announcementUpdatedAt
                ? "更新于 " + fmtDateTime(res.sect.announcementUpdatedAt)
                : "";
        }
        if (editBox) editBox.style.display = canEdit ? "" : "none";
        if (inp && canEdit && document.activeElement !== inp) {
            inp.value = text;
        }
    }

    function renderDaily() {
        var box = document.getElementById("dtZmDailyContent");
        var refreshEl = document.getElementById("dtZmDailyRefreshLine");
        var earnedEl = document.getElementById("dtZmDailyEarnedLine");
        var dailyTab = document.getElementById("dtZmTabDaily");
        var res = lastState;
        if (!box) return;
        if (!res || !res.ok || !res.sect) {
            box.innerHTML = "";
            return;
        }
        var daily = res.daily || {};
        if (refreshEl) {
            refreshEl.textContent =
                "每日 12:01（北京时间）刷新 · 周期 " + escHtml(String(daily.cycleKey || "—"));
        }
        if (earnedEl) {
            earnedEl.textContent =
                "今日已获得贡献 " +
                Math.floor(Number(daily.earnedToday) || 0) +
                " · 今日诛敌 " +
                Math.floor(Number(daily.killsToday) || 0) +
                " · 我的宗门贡献 " +
                Math.floor(Number(res.sect.myContribution) || 0);
        }
        if (dailyTab && daily.earnedToday > 0) {
            dailyTab.textContent = "宗门每日任务 (" + Math.floor(daily.earnedToday) + ")";
        } else if (dailyTab) {
            dailyTab.textContent = "宗门每日任务";
        }

        function taskRows(list, title) {
            if (!list || !list.length) return "";
            return (
                '<div class="dt-zm-daily-group"><h5 class="dt-zm-daily-group__title">' +
                escHtml(title) +
                "</h5><ul class=\"dt-zm-daily-list\">" +
                list
                    .map(function (t) {
                        return (
                            '<li class="dt-zm-daily-li' +
                            (t.done ? " dt-zm-daily-li--done" : "") +
                            '"><span class="dt-zm-daily-li__label">' +
                            escHtml(t.label || "") +
                            '</span><span class="dt-zm-daily-li__exp">+' +
                            escHtml(String(t.exp || 1)) +
                            " 贡献</span><span class=\"dt-zm-daily-li__state\">" +
                            (t.done ? "已完成" : "未完成") +
                            "</span></li>"
                        );
                    })
                    .join("") +
                "</ul></div>"
            );
        }

        var killRows = (daily.killMilestones || [])
            .map(function (m) {
                return {
                    label: "今日诛敌 ≥ " + m.threshold,
                    exp: m.exp,
                    done: !!m.done,
                };
            });

        box.innerHTML =
            taskRows(daily.molong, "魔龙洞通关") +
            taskRows(daily.huangfeng, "黄枫谷通关") +
            taskRows(daily.yaowang, "药王谷通关") +
            taskRows(daily.arena, "武神坛") +
            taskRows(daily.wordGuess, "每日猜词") +
            taskRows(killRows, "湮灭诸敌");
    }

    function renderPending() {
        var ul = document.getElementById("dtZmPendingList");
        var hint = document.getElementById("dtZmPendingHint");
        var pendingTab = document.getElementById("dtZmTabPending");
        if (!ul) return;
        var res = lastState;
        if (!res || !res.ok || !res.sect) {
            ul.innerHTML = "";
            if (pendingTab) pendingTab.textContent = "入门申请";
            return;
        }
        if (hint) hint.textContent = "宗主、副宗主与长老可审核";
        var pending = res.pendingIncoming || [];
        if (pendingTab) {
            var badge = pending.length > 0 ? " (" + pending.length + ")" : "";
            pendingTab.textContent = "入门申请" + badge;
        }
        if (!pending.length) {
            ul.innerHTML = '<li class="dt-zm-li dt-zm-li--empty">暂无入门申请</li>';
            return;
        }
        ul.innerHTML = pending
            .map(function (p) {
                return (
                    '<li class="dt-zm-li">' +
                    '<div class="dt-zm-member-main">' +
                    '<span class="dt-zm-member-name">' +
                    escHtml(p.name || "无名") +
                    "</span>" +
                    '<span class="dt-zm-member-pid">#' +
                    (p.dongtianPublicId != null ? escHtml(String(p.dongtianPublicId)) : "—") +
                    "</span>" +
                    '<span class="dt-zm-member-floor">秘境 ' +
                    escHtml(String(p.maxDungeonFloor || 1)) +
                    " 层</span>" +
                    "</div>" +
                    '<div class="dt-zm-member-actions">' +
                    '<button type="button" class="btn btn--sm btn--primary dt-zm-approve" data-uid="' +
                    escHtml(p.userId) +
                    '">同意</button>' +
                    '<button type="button" class="btn btn--sm btn--ghost dt-zm-reject" data-uid="' +
                    escHtml(p.userId) +
                    '">拒绝</button>' +
                    "</div></li>"
                );
            })
            .join("");
    }

    function syncTabVisibility(inSect) {
        var canManage = !!(lastState && lastState.ok && lastState.canManage);
        var tabsBar = document.querySelector(".dongtian-zongmen-tabs");
        ZM_TABS_IN.forEach(function (t) {
            var btn = document.getElementById(tabDomId(t, "btn"));
            if (!btn) return;
            if (!inSect) btn.style.display = "none";
            else if (t === "pending") btn.style.display = canManage ? "" : "none";
            else btn.style.display = "";
        });
        ZM_TABS_OUT.forEach(function (t) {
            var btn = document.getElementById(tabDomId(t, "btn"));
            if (btn) btn.style.display = inSect ? "none" : "";
        });
        if (tabsBar) tabsBar.style.display = "";
    }

    function setTab(tab) {
        var inSect = !!(lastState && lastState.ok && lastState.sect);
        tab = normalizeActiveTab(tab, inSect);
        activeTab = tab;
        var inSectAllowed = inSectAllowedTabs();
        var allTabs = ZM_TABS_IN.concat(ZM_TABS_OUT);
        allTabs.forEach(function (t) {
            var inGroup = inSect ? inSectAllowed.indexOf(t) >= 0 : ZM_TABS_OUT.indexOf(t) >= 0;
            var btn = document.getElementById(tabDomId(t, "btn"));
            var panel = document.getElementById(tabDomId(t, "panel"));
            var on = inGroup && t === tab;
            if (btn) {
                btn.classList.toggle("dt-zm-tab--active", on);
                btn.setAttribute("aria-selected", on ? "true" : "false");
                btn.tabIndex = on ? 0 : -1;
            }
            if (panel) {
                panel.classList.toggle("dt-zm-panel--active", on);
                panel.setAttribute("aria-hidden", on ? "false" : "true");
            }
        });
    }

    function renderZongmenModal() {
        var res = lastState;
        var coinEl = document.getElementById("dtZmCoinLine");
        var selfEl = document.getElementById("dtZmSelfPid");
        var heroBadge = document.getElementById("dtZmHeroBadge");
        var heroName = document.getElementById("dtZmHeroName");
        var heroMeta = document.getElementById("dtZmHeroMeta");
        var heroRole = document.getElementById("dtZmHeroRole");
        var leaveBtn = document.getElementById("dtZmLeaveBtn");
        var leaderActions = document.getElementById("dtZmLeaderActions");

        if (!res || !res.ok) {
            if (selfEl) selfEl.textContent = "—";
            return;
        }

        if (coinEl) coinEl.textContent = "联网币：" + Math.floor(Number(res.networkCoin) || 0);
        if (selfEl) {
            selfEl.textContent =
                res.self && res.self.dongtianPublicId != null ? String(res.self.dongtianPublicId) : "—";
        }

        var inSect = !!res.sect;
        syncTabVisibility(inSect);

        if (inSect && res.sect) {
            setHeroBadgeEl(heroBadge, res.sect);
            if (heroName) heroName.textContent = res.sect.name || "未命名宗门";
            if (heroMeta) {
                heroMeta.textContent =
                    "Lv." +
                    (res.sect.level || 1) +
                    " " +
                    (res.sect.realmShort || "末流宗门") +
                    " · 贡献 " +
                    (res.sect.exp || 0) +
                    "/" +
                    (res.sect.expToNext || 250) +
                    " · " +
                    res.sect.memberCount +
                    "/" +
                    res.sect.maxMembers +
                    " 人 · 副宗 " +
                    (res.sect.viceId ? "1" : "0") +
                    "/" +
                    res.sect.maxVice +
                    " · 长老 " +
                    (res.sect.elderCount || 0) +
                    "/" +
                    res.sect.maxElders +
                    " · 全宗气运 ×" +
                    (res.sect.levelBonusScale != null
                        ? Number(res.sect.levelBonusScale).toFixed(2)
                        : window.getDongtianZongmenOpportunityScale().toFixed(2));
            }
            if (heroRole) heroRole.textContent = res.myRoleLabel || "—";
            if (leaveBtn) {
                leaveBtn.style.display = res.myRole === "leader" ? "none" : "";
            }
            if (leaderActions) {
                leaderActions.style.display = res.myRole === "leader" ? "" : "none";
            }
            setTab(activeTab === "browse" || activeTab === "create" ? "announce" : activeTab);
        } else {
            syncZongmenCombatBonusFromState(res);
            setHeroBadgeEl(heroBadge, null);
            if (heroName) heroName.textContent = "尚未入宗";
            if (heroMeta) heroMeta.textContent = "开宗立派需 " + (res.rules && res.rules.createCost || 500) + " 联网币";
            if (heroRole) heroRole.textContent = "散修";
            if (leaveBtn) leaveBtn.style.display = "none";
            if (leaderActions) leaderActions.style.display = "none";
            setTab(normalizeActiveTab(activeTab, false));
        }

        renderAnnouncement();
        renderDaily();
        renderBadgePicker(res.badges);
        renderMembers();
        renderGongfa();
        renderPending();
        renderSectList();
        if (res.dailyGranted > 0) {
            toast("宗门每日任务 +" + res.dailyGranted + " 贡献经验");
        }
    }

    function refreshAll() {
        return Promise.all([dongtianZongmenPullState(), dongtianZongmenPullList(), ensureBadgesLoaded()]).then(
            function () {
                renderZongmenModal();
            }
        );
    }

    function openZongmenModal() {
        var modal = document.getElementById("dongtianZongmenModal");
        if (!modal) return;
        refreshAll()
            .then(function () {
                modal.style.display = "flex";
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }
    window.openDongtianZongmenModal = openZongmenModal;

    function closeZongmenModal() {
        var modal = document.getElementById("dongtianZongmenModal");
        if (modal) modal.style.display = "none";
    }

    function wireZongmenModalOnce() {
        var modal = document.getElementById("dongtianZongmenModal");
        if (!modal || modal._zongmenWired) return;
        modal._zongmenWired = true;
        wireZmDialogOnce();

        var closeBtn = document.getElementById("dongtianZongmenCloseBtn");
        if (closeBtn) closeBtn.onclick = closeZongmenModal;

        ZM_TABS_IN.concat(ZM_TABS_OUT).forEach(function (tab) {
            var cap = tab.charAt(0).toUpperCase() + tab.slice(1);
            var btn = document.getElementById("dtZmTab" + cap);
            if (btn) {
                btn.onclick = function () {
                    setTab(tab);
                };
            }
        });

        var badgePicker = document.getElementById("dtZmBadgePicker");
        if (badgePicker) {
            badgePicker.addEventListener("click", function (ev) {
                var t = ev.target && ev.target.closest ? ev.target.closest("[data-badge]") : null;
                if (!t) return;
                selectedBadge = t.getAttribute("data-badge") || "huoqiu";
                renderBadgePicker();
            });
        }

        var createBtn = document.getElementById("dtZmCreateBtn");
        if (createBtn) {
            createBtn.onclick = function () {
                var nameInp = document.getElementById("dtZmCreateName");
                var name = nameInp ? String(nameInp.value || "").trim() : "";
                if (!name) {
                    toast("请输入宗门名称", true);
                    return;
                }
                showZmConfirm({
                    title: "开宗立派",
                    message: "确认花费 500 联网币创建宗门「" + name + "」？\n创建后你将成为宗主。",
                    okText: "确认创立",
                    onOk: function () {
                        api("POST", "/api/dongtian-zongmen/create", { name: name, badge: selectedBadge })
                            .then(function (res) {
                                if (!res || !res.ok) {
                                    toast((res && res.message) || "创建失败", true);
                                    return;
                                }
                                toast(res.message || "宗门已创立");
                                if (nameInp) nameInp.value = "";
                                return refreshAll();
                            })
                            .catch(function (e) {
                                toast(e.message || String(e), true);
                            });
                    },
                });
            };
        }

        var leaveBtn = document.getElementById("dtZmLeaveBtn");
        if (leaveBtn) {
            leaveBtn.onclick = function () {
                showZmConfirm({
                    title: "退出宗门",
                    message: "确认退出当前宗门？\n退出后需重新申请方可入门。",
                    okText: "确认退出",
                    danger: true,
                    onOk: function () {
                        api("POST", "/api/dongtian-zongmen/leave", {})
                            .then(function (res) {
                                if (!res || !res.ok) {
                                    toast((res && res.message) || "退出失败", true);
                                    return;
                                }
                                toast(res.message || "已退出");
                                return refreshAll();
                            })
                            .catch(function (e) {
                                toast(e.message || String(e), true);
                            });
                    },
                });
            };
        }

        var refreshBtn = document.getElementById("dtZmRefreshBtn");
        if (refreshBtn) {
            refreshBtn.onclick = function () {
                refreshAll().catch(function (e) {
                    toast(e.message || String(e), true);
                });
            };
        }

        var announceSaveBtn = document.getElementById("dtZmAnnounceSaveBtn");
        if (announceSaveBtn) {
            announceSaveBtn.onclick = function () {
                var inp = document.getElementById("dtZmAnnounceInput");
                var text = inp ? String(inp.value || "").trim() : "";
                api("POST", "/api/dongtian-zongmen/set-announcement", { announcement: text }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "发布失败", true);
                    else {
                        toast(res.message || "公告已更新");
                        refreshAll();
                    }
                });
            };
        }

        var announceClearBtn = document.getElementById("dtZmAnnounceClearBtn");
        if (announceClearBtn) {
            announceClearBtn.onclick = function () {
                showZmConfirm({
                    title: "清空公告",
                    message: "确认清空宗门公告？清空后全宗成员将看不到公告内容。",
                    okText: "确认清空",
                    danger: true,
                    onOk: function () {
                        api("POST", "/api/dongtian-zongmen/set-announcement", { announcement: "" }).then(function (res) {
                            if (!res || !res.ok) toast((res && res.message) || "操作失败", true);
                            else {
                                toast(res.message || "公告已清空");
                                refreshAll();
                            }
                        });
                    },
                });
            };
        }

        var disbandBtn = document.getElementById("dtZmDisbandBtn");
        if (disbandBtn) {
            disbandBtn.onclick = function () {
                var sectName = lastState && lastState.sect ? lastState.sect.name : "";
                showZmPrompt({
                    title: "解散宗门",
                    message: "解散后宗门将永久删除，所有成员脱离宗门，此操作不可撤销。",
                    label: "请输入完整宗门名称「" + sectName + "」以确认解散：",
                    expected: sectName,
                    mismatchMessage: "宗门名称不匹配，已取消解散",
                    okText: "确认解散",
                    danger: true,
                    onOk: function (typed) {
                        api("POST", "/api/dongtian-zongmen/disband", { confirmName: typed }).then(function (res) {
                            if (!res || !res.ok) toast((res && res.message) || "解散失败", true);
                            else {
                                toast(res.message || "宗门已解散");
                                refreshAll();
                            }
                        });
                    },
                });
            };
        }

        modal.addEventListener("click", function (ev) {
            var t = ev.target;
            if (!t || !t.classList) return;
            if (t.classList.contains("dt-zm-apply")) {
                var sid = t.getAttribute("data-sid");
                if (!sid) return;
                api("POST", "/api/dongtian-zongmen/apply", { sectId: sid }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "申请失败", true);
                    else toast(res.message || "已申请");
                });
            } else if (t.classList.contains("dt-zm-approve")) {
                var aid = t.getAttribute("data-uid");
                api("POST", "/api/dongtian-zongmen/approve", { applicantUserId: aid }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "操作失败", true);
                    else {
                        toast(res.message || "已同意");
                        refreshAll();
                    }
                });
            } else if (t.classList.contains("dt-zm-reject")) {
                var rid = t.getAttribute("data-uid");
                api("POST", "/api/dongtian-zongmen/reject", { applicantUserId: rid }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "操作失败", true);
                    else refreshAll();
                });
            } else if (t.classList.contains("dt-zm-kick")) {
                var kid = t.getAttribute("data-uid");
                showZmConfirm({
                    title: "逐出成员",
                    message: "确认将该成员逐出宗门？",
                    okText: "确认逐出",
                    danger: true,
                    onOk: function () {
                        api("POST", "/api/dongtian-zongmen/kick", { targetUserId: kid }).then(function (res) {
                            if (!res || !res.ok) toast((res && res.message) || "操作失败", true);
                            else {
                                toast(res.message || "已逐出");
                                refreshAll();
                            }
                        });
                    },
                });
            } else if (t.classList.contains("dt-zm-appoint-vice")) {
                var vid = t.getAttribute("data-uid");
                api("POST", "/api/dongtian-zongmen/appoint", { targetUserId: vid, role: "vice" }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "任命失败", true);
                    else {
                        toast(res.message || "已任副宗主");
                        refreshAll();
                    }
                });
            } else if (t.classList.contains("dt-zm-appoint-elder")) {
                var eid = t.getAttribute("data-uid");
                api("POST", "/api/dongtian-zongmen/appoint", { targetUserId: eid, role: "elder" }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "任命失败", true);
                    else {
                        toast(res.message || "已任长老");
                        refreshAll();
                    }
                });
            } else if (t.classList.contains("dt-zm-demote")) {
                var did = t.getAttribute("data-uid");
                api("POST", "/api/dongtian-zongmen/demote", { targetUserId: did }).then(function (res) {
                    if (!res || !res.ok) toast((res && res.message) || "操作失败", true);
                    else {
                        toast(res.message || "已撤职");
                        refreshAll();
                    }
                });
            } else if (t.classList.contains("dt-zm-transfer")) {
                var tid = t.getAttribute("data-uid");
                var tname = t.getAttribute("data-name") || "该修士";
                showZmConfirm({
                    title: "转让宗主",
                    message: "确认将宗主之位转让给「" + tname + "」？\n你将降为入门弟子。",
                    okText: "确认转让",
                    danger: true,
                    onOk: function () {
                        api("POST", "/api/dongtian-zongmen/transfer-leader", { targetUserId: tid }).then(function (res) {
                            if (!res || !res.ok) toast((res && res.message) || "转让失败", true);
                            else {
                                toast(res.message || "转让成功");
                                refreshAll();
                            }
                        });
                    },
                });
            } else if (t.classList.contains("dt-zm-gongfa-upgrade")) {
                var tid = t.getAttribute("data-tid");
                if (!tid || t.disabled) return;
                t.disabled = true;
                api("POST", "/api/dongtian-zongmen/technique/upgrade", { techniqueId: tid })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            toast((res && res.message) || "参悟失败", true);
                            renderGongfa();
                            return;
                        }
                        toast(res.message || "功法升级成功");
                        return refreshAll();
                    })
                    .catch(function () {
                        toast("参悟请求失败", true);
                        renderGongfa();
                    });
            } else if (t.classList.contains("dt-zm-roster-prev")) {
                if (memberPage > 0) {
                    memberPage -= 1;
                    renderMembers();
                }
            } else if (t.classList.contains("dt-zm-roster-next")) {
                memberPage += 1;
                renderMembers();
            }
        });
    }

    window.initDongtianZongmenUI = function () {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        wireZmDialogOnce();
        wireZongmenModalOnce();
        var hubBtn = document.getElementById("dongtianHubMenuZongmenBtn");
        if (hubBtn && !hubBtn._zongmenBound) {
            hubBtn._zongmenBound = true;
            hubBtn.onclick = function () {
                if (typeof window.closeDongtianHubMenuModal === "function") window.closeDongtianHubMenuModal();
                openZongmenModal();
            };
        }
        dongtianZongmenPullState().catch(function () {});
    };
})();
