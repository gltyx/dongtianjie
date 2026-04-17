/**
 * 洞天劫 · 副本大厅：多副本组队、开战（属性与武神坛快照一致）
 */
(function () {
    var api = function (method, path, body) {
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            /** 统一为 Promise，避免宿主未 return 时链式 .then 报 undefined */
            return Promise.resolve(req(method, path, body, true));
        } catch (e) {
            return Promise.reject(e);
        }
    };

    function toast(msg, isErr) {
        var el = document.getElementById("xiuMarketToast");
        if (!el) {
            if (isErr) alert(msg);
            return;
        }
        el.textContent = msg;
        el.style.display = "block";
        el.classList.toggle("xiu-market-toast--err", !!isErr);
        clearTimeout(el._molongT);
        el._molongT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function ensureStats() {
        if (typeof calculateStats === "function") calculateStats();
    }

    function arenaSnapshotPayload() {
        ensureStats();
        var s = player && player.stats ? player.stats : {};
        var pen =
            typeof s.pen === "number" && isFinite(s.pen)
                ? s.pen
                : typeof player.baseStats.pen === "number"
                  ? player.baseStats.pen
                  : 0;
        var n = typeof player !== "undefined" && player && player.name ? String(player.name) : "";
        var titleStr = "";
        if (typeof getCombatEffectiveDisplayTitleDefIgnoringHidden === "function") {
            var td = getCombatEffectiveDisplayTitleDefIgnoringHidden();
            if (td && td.name) titleStr = String(td.name);
        }
        var realmStr =
            typeof cultivationRealmLabel === "function" && typeof player !== "undefined" && player
                ? cultivationRealmLabel(player.lvl)
                : "";
        var cp =
            typeof aggregateCombatPassives === "function"
                ? aggregateCombatPassives((player && player.equippedPassives) || [])
                : {};
        return {
            atk: s.atk,
            def: s.def,
            hpMax: s.hpMax,
            atkSpd: s.atkSpd,
            critRate: s.critRate,
            critDmg: s.critDmg,
            pen: pen,
            combatPassives: cp,
            playerName: n,
            displayTitleName: titleStr,
            realmLabel: realmStr,
        };
    }

    var state = {
        nextHostStage: 1,
        guestAssistLeft: 20,
        cycleKey: "",
        currentRoomId: "",
        myRole: "",
        publish: true,
        orderFront: "host",
        dungeons: [],
        dungeonProgress: {},
        defaultDungeonId: "molong_dragon",
        selectedDungeonId: "molong_dragon",
        listFilterDungeonId: "",
        roomDungeonId: "",
        inRoomStage: null,
        guestReady: false,
        hasGuestInRoom: false,
        guestAssistByDungeon: {},
        molongBattleToken: "",
        /** 队员已对当前 activeBattle.token 触发过自动进斗法；房主结算前服务端仍带同一 token，勿重复进入 */
        molongGuestAutoJoinedToken: "",
        /** 劫数≥阈值时不可进副本大厅（与押镖一致，见服务端 molongHallLocked） */
        molongHallLocked: false,
        molongHallLockJie: 17,
        currentJieFromApi: 0,
    };

    /** 最近一次「刷新」拉取的公开房间（供搜索框本地筛选） */
    var lastMolongRoomList = [];

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escAttr(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;");
    }

    function dungeonListFallback() {
        if (state.dungeons && state.dungeons.length) return state.dungeons;
        return [
            {
                id: "molong_dragon",
                name: "魔龙洞",
                stagesMax: 30,
                roomTitleSuffix: "的魔龙房",
            },
            {
                id: "molong_kylin",
                name: "麒麟岛",
                stagesMax: 30,
                roomTitleSuffix: "的麒麟岛房",
            },
        ];
    }

    function getDungeonMeta(did) {
        var list = dungeonListFallback();
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === did) return list[i];
        }
        return list[0];
    }

    function getNextStageForDungeon(did) {
        var dp = state.dungeonProgress && state.dungeonProgress[did];
        var n = dp && typeof dp.nextHostStage === "number" ? dp.nextHostStage : 1;
        return n;
    }

    function getSelectedDungeonId() {
        var ds = document.getElementById("molongDungeonSelect");
        if (ds && ds.value) return ds.value;
        return state.selectedDungeonId || state.defaultDungeonId || "molong_dragon";
    }

    function getListFilterDungeonId() {
        var df = document.getElementById("molongDungeonFilter");
        if (df && typeof df.value === "string") return df.value;
        if (typeof state.listFilterDungeonId === "string") return state.listFilterDungeonId;
        return "";
    }

    function fillDungeonDropdowns() {
        var list = dungeonListFallback();
        var html = list
            .map(function (d) {
                return '<option value="' + escAttr(d.id) + '">' + escHtml(d.name) + "</option>";
            })
            .join("");
        var sel = document.getElementById("molongDungeonSelect");
        var fil = document.getElementById("molongDungeonFilter");
        if (sel) {
            sel.innerHTML = html;
            if (state.roomDungeonId) sel.value = state.roomDungeonId;
            else if (state.selectedDungeonId && list.some(function (d) { return d.id === state.selectedDungeonId; }))
                sel.value = state.selectedDungeonId;
            else sel.value = list[0].id;
            state.selectedDungeonId = sel.value;
            sel.disabled = !!state.currentRoomId;
        }
        if (fil) {
            fil.innerHTML = '<option value="">全部</option>' + html;
            if (state.listFilterDungeonId === "") {
                fil.value = "";
            } else if (state.listFilterDungeonId && list.some(function (d) { return d.id === state.listFilterDungeonId; }))
                fil.value = state.listFilterDungeonId;
            else fil.value = "";
            state.listFilterDungeonId = fil.value;
        }
    }

    function fillStageSelectOptions(stSel, did, lockedStage) {
        if (!stSel) return;
        var meta = getDungeonMeta(did);
        var smax = meta.stagesMax || 30;
        var nh = getNextStageForDungeon(did);
        stSel.innerHTML = "";
        if (lockedStage != null) {
            var o = document.createElement("option");
            o.value = String(lockedStage);
            o.textContent = "第 " + lockedStage + " 关";
            stSel.appendChild(o);
            stSel.value = String(lockedStage);
            stSel.disabled = true;
            return;
        }
        stSel.disabled = false;
        var selSt = nh > smax ? smax : Math.max(1, nh);
        for (var s = 1; s <= smax; s++) {
            var op = document.createElement("option");
            op.value = String(s);
            op.textContent = "第 " + s + " 关";
            if (s === selSt) op.selected = true;
            stSel.appendChild(op);
        }
        stSel.disabled = nh > smax;
    }

    function fillListStageFilter(did) {
        var stFil = document.getElementById("molongStageFilter");
        if (!stFil) return;
        var meta = getDungeonMeta(did);
        var smax = meta.stagesMax || 30;
        var prevStr = String(stFil.value != null ? stFil.value : "");
        stFil.innerHTML = "";
        var oAll = document.createElement("option");
        oAll.value = "";
        oAll.textContent = "全部";
        stFil.appendChild(oAll);
        for (var sf = 1; sf <= smax; sf++) {
            var of = document.createElement("option");
            of.value = String(sf);
            of.textContent = "第 " + sf + " 关";
            stFil.appendChild(of);
        }
        var nh = getNextStageForDungeon(did);
        var prefer = nh > smax ? smax : Math.max(1, nh);
        var prevNum = parseInt(prevStr, 10);
        var useVal;
        if (prevStr === "" || prevStr === "0" || prevStr === "all") useVal = "";
        else if (Number.isFinite(prevNum) && prevNum >= 1 && prevNum <= smax) useVal = String(prevNum);
        else useVal = String(prefer);
        stFil.value = useVal;
    }

    function defaultRoomTitle() {
        var n =
            typeof player !== "undefined" && player && player.name && String(player.name).trim()
                ? String(player.name).trim()
                : "修士";
        var did = getSelectedDungeonId();
        var meta = getDungeonMeta(did);
        var suf = (meta && meta.roomTitleSuffix) || "的房间";
        return n + suf;
    }

    function syncRoomControls() {
        var sync = document.getElementById("molongRoomSyncLine");
        var stBt = document.getElementById("molongStartBattleBtn");
        var rdyBt = document.getElementById("molongGuestReadyBtn");
        if (!state.currentRoomId) {
            if (sync) sync.textContent = "";
            if (stBt) {
                stBt.disabled = false;
                stBt.removeAttribute("title");
            }
            if (rdyBt) rdyBt.style.display = "none";
        } else {
            var hasGuest = !!state.hasGuestInRoom;
            var gr = !!state.guestReady;
            if (sync) {
                if (state.myRole === "host") {
                    if (!hasGuest) sync.textContent = "当前无队员：可单人开战。";
                    else if (gr) sync.textContent = "队员已就绪，可开始战斗。";
                    else sync.textContent = "等待队员点击「准备」…";
                } else if (state.myRole === "guest") {
                    if (gr) sync.textContent = "你已准备，等待房主开战。";
                    else sync.textContent = "请先点击「准备」，再由房主开战。";
                } else sync.textContent = "";
            }
            if (stBt) {
                var block = state.myRole === "host" && hasGuest && !gr;
                stBt.disabled = !!block;
                if (block) stBt.setAttribute("title", "需队员准备后才能开战");
                else stBt.removeAttribute("title");
            }
            if (rdyBt) {
                if (state.myRole === "guest") {
                    rdyBt.style.display = "";
                    rdyBt.textContent = gr ? "取消准备" : "准备";
                } else {
                    rdyBt.style.display = "none";
                }
            }
        }
        var crBt = document.getElementById("molongCreateRoomBtn");
        if (crBt) {
            crBt.style.display = state.currentRoomId ? "none" : "";
            crBt.disabled = !!state.currentRoomId;
            if (state.currentRoomId) crBt.setAttribute("title", "已在房间内，请先解散或离开后再创建");
            else crBt.removeAttribute("title");
        }
    }

    function startRoomPoll() {
        stopRoomPoll();
        if (!state.currentRoomId) return;
        /** 队员需更快跟上房主开战；在房内略缩短轮询间隔 */
        var intervalMs = state.myRole === "guest" ? 1000 : 1500;
        state._molongRoomPoll = setInterval(function () {
            pullRoomInfo().catch(function () {});
        }, intervalMs);
    }

    function stopRoomPoll() {
        if (state._molongRoomPoll) {
            clearInterval(state._molongRoomPoll);
            state._molongRoomPoll = null;
        }
    }

    /** 房主开战写入 activeBattle 后，队员轮询到此自动进入同一局斗法 */
    function maybeJoinBattleFromRoom(res) {
        if (!res || !res.ok || !res.activeBattle || !res.activeBattle.token) return;
        if (state.myRole !== "guest") return;
        var bt = res.activeBattle;
        var tok = bt.token;
        /** 已对本 token 自动进过斗法；队员本地先结束时 molongBattleToken 会清空，但服务端 activeBattle 仍在等房主结算，不能再次 begin */
        if (state.molongGuestAutoJoinedToken && state.molongGuestAutoJoinedToken === tok) {
            return;
        }
        if (state.molongBattleToken === tok) return;
        if (typeof player !== "undefined" && player && player.inCombat) {
            /** 已在同一局魔龙斗法中则勿重复拉起 */
            if (typeof enemy !== "undefined" && enemy && enemy.molongRaid && enemy.molongRaid.token === tok) {
                return;
            }
            return;
        }
        if (!bt.solo && !bt.guestSnapshot) return;
        state.molongBattleToken = tok;
        var payload = {
            solo: !!bt.solo,
            token: bt.token,
            battleRngSeed: bt.battleRngSeed,
            dungeonId: bt.dungeonId,
            dungeonName: bt.dungeonName,
            stage: bt.stage,
            orderFront: bt.orderFront,
            hostSnapshot: bt.hostSnapshot,
            guestSnapshot: bt.guestSnapshot,
            iAmGuest: true,
        };
        if (typeof window.beginMolongRaidBattle === "function") {
            window.beginMolongRaidBattle(payload);
        }
        if (
            typeof player !== "undefined" &&
            player &&
            player.inCombat &&
            typeof enemy !== "undefined" &&
            enemy &&
            enemy.molongRaid &&
            enemy.molongRaid.token === tok
        ) {
            state.molongGuestAutoJoinedToken = tok;
        } else {
            state.molongBattleToken = "";
        }
    }

    function applyRoomPanel(res) {
        if (res) {
            /** 仅房间详情接口带 activeBattle；无此字段时不要清空（否则 syncMyRoomFromServer 会误清） */
            if (Object.prototype.hasOwnProperty.call(res, "activeBattle") && !res.activeBattle) {
                state.molongGuestAutoJoinedToken = "";
            }
            state.hasGuestInRoom = !!res.guestName;
            state.guestReady = !!res.guestReady;
        }
        if (res && res.dungeonId) {
            state.roomDungeonId = res.dungeonId;
        }
        if (res && res.stage != null) {
            state.inRoomStage = res.stage;
        }
        var ds = document.getElementById("molongDungeonSelect");
        if (ds && res && res.dungeonId) {
            ds.value = res.dungeonId;
            state.selectedDungeonId = res.dungeonId;
            ds.disabled = !!state.currentRoomId;
        }
        var stSel = document.getElementById("molongStageSelect");
        if (stSel && res && res.stage != null) {
            fillStageSelectOptions(stSel, res.dungeonId || state.roomDungeonId || getSelectedDungeonId(), res.stage);
        }
        var titleIn = document.getElementById("molongRoomTitleInput");
        if (titleIn && res && res.roomTitle) titleIn.value = res.roomTitle;
        var mem = document.getElementById("molongRoomMembers");
        if (mem && res) {
            var hn = res.hostName || "—";
            var gn = res.guestName ? "<strong>" + escHtml(res.guestName) + "</strong>" : "（等待加入）";
            mem.innerHTML =
                "房主：<strong>" + escHtml(hn) + "</strong>　队友：" + gn;
        }
        var btnClose = document.getElementById("molongCloseRoomBtn");
        if (btnClose) btnClose.textContent = state.myRole === "guest" ? "离开房间" : "解散房间";
        var saveTitle = document.getElementById("molongSaveRoomTitleBtn");
        if (saveTitle) {
            saveTitle.style.display = state.myRole === "host" ? "" : "none";
        }
        if (titleIn) titleIn.readOnly = state.myRole !== "host";
        var stBt = document.getElementById("molongStartBattleBtn");
        if (stBt) stBt.style.display = state.myRole === "guest" ? "none" : "";
        syncRoomControls();
        maybeJoinBattleFromRoom(res);
    }

    function pullRoomInfo() {
        if (!state.currentRoomId) return Promise.resolve();
        return api("GET", "/api/dongtian-molong/room/" + state.currentRoomId, undefined).then(function (res) {
            if (res && res.ok) applyRoomPanel(res);
        });
    }

    function exitCurrentRoom() {
        var rid = state.currentRoomId;
        if (!rid) return Promise.resolve();
        var wasHost = state.myRole === "host";
        return api("POST", "/api/dongtian-molong/room/" + rid + "/leave", {})
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "操作失败");
                state.currentRoomId = "";
                state.myRole = "";
                state.roomDungeonId = "";
                state.inRoomStage = null;
                state.guestReady = false;
                state.hasGuestInRoom = false;
                state.molongBattleToken = "";
                state.molongGuestAutoJoinedToken = "";
                stopRoomPoll();
                var sync = document.getElementById("molongRoomSyncLine");
                if (sync) sync.textContent = "";
                var ridEl = document.getElementById("molongRoomId");
                if (ridEl) ridEl.textContent = "—";
                var mem = document.getElementById("molongRoomMembers");
                if (mem) mem.textContent = "房主：—　队友：—";
                var titleIn = document.getElementById("molongRoomTitleInput");
                if (titleIn) {
                    titleIn.value = "";
                    titleIn.readOnly = false;
                }
                var stBt = document.getElementById("molongStartBattleBtn");
                if (stBt) stBt.style.display = "";
                var crBt = document.getElementById("molongCreateRoomBtn");
                if (crBt) crBt.style.display = "";
                var ds = document.getElementById("molongDungeonSelect");
                if (ds) ds.disabled = false;
                syncRoomControls();
                toast(wasHost ? "房间已解散" : "已离开房间", false);
                return loadState().then(renderState).then(refreshRoomList);
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
                return Promise.reject(e);
            });
    }

    function saveRoomTitle() {
        if (state.myRole !== "host" || !state.currentRoomId) {
            toast("仅房主可修改房间名", true);
            return Promise.resolve();
        }
        var titleIn = document.getElementById("molongRoomTitleInput");
        var t = titleIn ? String(titleIn.value || "").trim() : "";
        return api("POST", "/api/dongtian-molong/room/" + state.currentRoomId + "/title", { title: t })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "保存失败");
                if (titleIn && res.roomTitle) titleIn.value = res.roomTitle;
                toast("房间名已保存", false);
                return refreshRoomList();
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function refreshMolongHallLockUi() {
        var btn = document.getElementById("molongHallOpenBtn");
        if (!btn) return;
        if (state.molongHallLocked) {
            btn.disabled = true;
            btn.setAttribute("title", "劫数≥" + (state.molongHallLockJie || 17) + " 时不可使用副本大厅（与押镖一致）");
            btn.classList.add("molong-hall-locked");
        } else {
            btn.disabled = false;
            btn.removeAttribute("title");
            btn.classList.remove("molong-hall-locked");
        }
    }

    function loadState() {
        return api("GET", "/api/dongtian-molong/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "状态失败");
            state.nextHostStage = res.nextHostStage || 1;
            state.guestAssistLeft = res.guestAssistRewardsLeft != null ? res.guestAssistRewardsLeft : 20;
            state.guestAssistByDungeon = res.guestAssistByDungeon && typeof res.guestAssistByDungeon === "object" ? res.guestAssistByDungeon : {};
            state.cycleKey = res.cycleKey || "";
            if (res.dungeons && res.dungeons.length) state.dungeons = res.dungeons;
            if (res.dungeonProgress && typeof res.dungeonProgress === "object") state.dungeonProgress = res.dungeonProgress;
            if (res.defaultDungeonId) state.defaultDungeonId = res.defaultDungeonId;
            state.molongHallLocked = !!res.molongHallLocked;
            state.molongHallLockJie =
                res.molongHallLockAtJie != null && isFinite(res.molongHallLockAtJie) ? Math.floor(res.molongHallLockAtJie) : 17;
            state.currentJieFromApi = res.currentJie != null && isFinite(res.currentJie) ? Math.floor(res.currentJie) : 0;
            refreshMolongHallLockUi();
            return res;
        });
    }

    function guestAssistLeftForDungeon(did) {
        var row = state.guestAssistByDungeon && state.guestAssistByDungeon[did];
        if (row && row.left != null && isFinite(row.left)) return Math.max(0, Math.floor(row.left));
        return state.guestAssistLeft != null ? state.guestAssistLeft : 20;
    }

    function renderMetaLine() {
        var el = document.getElementById("molongMeta");
        if (!el) return;
        var didMeta = state.currentRoomId ? state.roomDungeonId || getSelectedDungeonId() : getSelectedDungeonId();
        var dm = getDungeonMeta(didMeta);
        var nh = getNextStageForDungeon(didMeta);
        var smax = dm.stagesMax || 30;
        var prog =
            nh > smax
                ? "【" + dm.name + "】房主今日已通关全部 " + smax + " 关（明日 12:01 重置）"
                : "【" + dm.name + "】房主可挑战第 " + nh + " 关";
        var assistLeft = guestAssistLeftForDungeon(didMeta);
        el.textContent =
            "本周期 " + (state.cycleKey || "—") + " · " + prog + " · 【" + dm.name + "】助战剩余 " + assistLeft + " 次";
    }

    function renderState() {
        fillDungeonDropdowns();
        renderMetaLine();
        var stSel = document.getElementById("molongStageSelect");
        if (stSel) {
            if (state.currentRoomId && state.inRoomStage != null) {
                fillStageSelectOptions(stSel, state.roomDungeonId || getSelectedDungeonId(), state.inRoomStage);
            } else {
                fillStageSelectOptions(stSel, getSelectedDungeonId(), null);
            }
        }
        var df = document.getElementById("molongDungeonFilter");
        if (df) {
            if (!df._molongBound) {
                df._molongBound = true;
                df.onchange = function () {
                    state.listFilterDungeonId = df.value;
                    fillListStageFilter(df.value);
                    refreshRoomList();
                };
            }
            fillListStageFilter(df.value || getListFilterDungeonId());
        }
        var stFilOnly = document.getElementById("molongStageFilter");
        if (stFilOnly && !stFilOnly._molongBound) {
            stFilOnly._molongBound = true;
            stFilOnly.onchange = function () {
                refreshRoomList();
            };
        }
        var dsel = document.getElementById("molongDungeonSelect");
        if (dsel && !dsel._molongBound) {
            dsel._molongBound = true;
            dsel.onchange = function () {
                if (state.currentRoomId) return;
                state.selectedDungeonId = dsel.value;
                renderMetaLine();
                fillStageSelectOptions(document.getElementById("molongStageSelect"), dsel.value, null);
            };
        }
        return Promise.resolve();
    }

    function getMolongRoomSearchQuery() {
        var inp = document.getElementById("molongRoomSearchInput");
        return inp ? String(inp.value || "").trim().toLowerCase() : "";
    }

    function molongRoomMatchesSearch(r, q, fdid) {
        if (!q) return true;
        var dmeta = getDungeonMeta(r.dungeonId || fdid);
        var dn = dmeta && dmeta.name ? String(dmeta.name) : "";
        var parts = [r.roomTitle, r.roomId, r.hostName, r.guestName, r.dungeonName, dn];
        var hay = parts
            .filter(function (x) {
                return x != null && x !== "";
            })
            .map(function (x) {
                return String(x);
            })
            .join(" ")
            .toLowerCase();
        return hay.indexOf(q) >= 0;
    }

    function buildMolongRoomRowHtml(r, fdid) {
        var suffix = getDungeonMeta(r.dungeonId || fdid).roomTitleSuffix || "的房间";
        var title = escHtml(r.roomTitle || (r.hostName || "") + suffix);
        var dtag = escHtml(r.dungeonName || "");
        var host = escHtml(r.hostName || "");
        var guest = r.guestName ? escHtml(r.guestName) : "空缺";
        var full = !!(r.hasGuest || r.guestName);
        var badge = full
            ? '<span class="molong-room-badge molong-room-badge--full" title="已有队员，无法再加入">已满</span>'
            : '<span class="molong-room-badge molong-room-badge--open" title="尚空缺位，可加入">可加入</span>';
        var joinBtn = full
            ? '<button type="button" class="btn btn--sm btn--ghost" disabled title="房间已满">已满</button>'
            : '<button type="button" class="btn btn--sm btn--primary molong-join-btn" data-rid="' +
              escHtml(r.roomId) +
              '">加入</button>';
        return (
            '<li class="molong-room-row' +
            (full ? " molong-room-row--full" : " molong-room-row--open") +
            '">' +
            badge +
            '<span class="molong-room-title">' +
            (dtag ? "[" + dtag + "] " : "") +
            title +
            "</span>" +
            joinBtn +
            '<span class="molong-room-meta">第 ' +
            r.stage +
            " 关 · 房主 " +
            host +
            " · 队友 " +
            guest +
            "</span></li>"
        );
    }

    function bindMolongJoinButtons(ul) {
        if (!ul) return;
        ul.querySelectorAll(".molong-join-btn").forEach(function (btn) {
            btn.onclick = function () {
                var rid = btn.getAttribute("data-rid");
                if (rid) joinRoom(rid);
            };
        });
    }

    function renderMolongRoomListFiltered() {
        var ul = document.getElementById("molongRoomList");
        if (!ul) return;
        var fdid = getListFilterDungeonId();
        var q = getMolongRoomSearchQuery();
        if (!lastMolongRoomList.length) {
            ul.innerHTML = '<li class="molong-room-empty">暂无公开房间，请刷新或自建</li>';
            return;
        }
        var filtered = lastMolongRoomList.filter(function (r) {
            return molongRoomMatchesSearch(r, q, fdid);
        });
        if (!filtered.length) {
            ul.innerHTML = '<li class="molong-room-empty">无匹配房间，请调整搜索关键词</li>';
            return;
        }
        ul.innerHTML = filtered.map(function (r) {
            return buildMolongRoomRowHtml(r, fdid);
        }).join("");
        bindMolongJoinButtons(ul);
    }

    function refreshRoomList() {
        var fdid = getListFilterDungeonId();
        var stFil = document.getElementById("molongStageFilter");
        var raw = stFil && stFil.value != null ? String(stFil.value).trim() : "";
        /** 副本筛选为「全部」时不传 dungeonId，仅按公开/关卡筛选 */
        var qs = "";
        if (fdid && fdid !== "all") {
            qs += (qs ? "&" : "?") + "dungeonId=" + encodeURIComponent(fdid);
        }
        if (raw !== "" && raw !== "0" && raw !== "all") {
            var stage = parseInt(raw, 10);
            var smax = getDungeonMeta(fdid || state.defaultDungeonId || "molong_dragon").stagesMax || 30;
            if (!stage || stage < 1) stage = Math.min(Math.max(1, getNextStageForDungeon(fdid)), smax);
            qs += (qs ? "&" : "?") + "stage=" + stage;
        }
        return api("GET", "/api/dongtian-molong/rooms" + qs, undefined).then(function (res) {
            lastMolongRoomList = res && res.ok && Array.isArray(res.list) ? res.list : [];
            renderMolongRoomListFiltered();
        });
    }

    function copyRoomId() {
        var id = state.currentRoomId || "";
        if (!id) return toast("暂无房间号", true);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(id).then(
                    function () {
                        toast("已复制房间号", false);
                    },
                    function () {
                        toast(id, false);
                    }
                );
            } else {
                toast(id, false);
            }
        } catch (e) {
            toast(id, false);
        }
    }

    function syncMyRoomFromServer() {
        return api("GET", "/api/dongtian-molong/my-room", undefined).then(function (res) {
            if (!res || !res.ok) {
                syncRoomControls();
                return;
            }
            if (!res.inRoom) {
                if (state.currentRoomId) {
                    stopRoomPoll();
                    state.currentRoomId = "";
                    state.myRole = "";
                    state.roomDungeonId = "";
                    state.inRoomStage = null;
                    state.hasGuestInRoom = false;
                    state.guestReady = false;
                    state.molongGuestAutoJoinedToken = "";
                    var ridGone = document.getElementById("molongRoomId");
                    if (ridGone) ridGone.textContent = "—";
                    var mem = document.getElementById("molongRoomMembers");
                    if (mem) mem.textContent = "房主：—　队友：—";
                }
                syncRoomControls();
                return;
            }
            state.currentRoomId = res.roomId;
            state.myRole = res.role === "guest" ? "guest" : "host";
            state.roomDungeonId = res.dungeonId || "";
            state.inRoomStage = res.stage != null ? res.stage : null;
            state.hasGuestInRoom = !!res.guestName;
            state.guestReady = !!res.guestReady;
            var ridEl = document.getElementById("molongRoomId");
            if (ridEl) ridEl.textContent = res.roomId;
            var titleIn = document.getElementById("molongRoomTitleInput");
            if (titleIn && res.roomTitle) titleIn.value = res.roomTitle;
            applyRoomPanel(res);
        });
    }

    function createRoom() {
        if (state.currentRoomId) {
            toast("你已在房间内，请先解散或离开后再创建新房间", true);
            return Promise.resolve();
        }
        var did = getSelectedDungeonId();
        var st = parseInt(String(document.getElementById("molongStageSelect") && document.getElementById("molongStageSelect").value), 10);
        var smax = getDungeonMeta(did).stagesMax || 30;
        if (!st || st < 1) st = getNextStageForDungeon(did);
        if (st > smax) st = smax;
        state.publish = !!(document.getElementById("molongPublishToggle") && document.getElementById("molongPublishToggle").checked);
        state.orderFront =
            document.getElementById("molongOrderGuestFront") && document.getElementById("molongOrderGuestFront").checked
                ? "guest"
                : "host";
        var titleIn = document.getElementById("molongRoomTitleInput");
        var roomTitle = titleIn ? String(titleIn.value || "").trim() : "";
        return api("POST", "/api/dongtian-molong/room/create", {
            dungeonId: did,
            stage: st,
            publish: state.publish,
            orderFront: state.orderFront,
            roomTitle: roomTitle,
            hostSnapshot: arenaSnapshotPayload(),
        })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "创建失败");
                state.currentRoomId = res.roomId;
                state.myRole = "host";
                state.roomDungeonId = res.dungeonId || did;
                state.inRoomStage = st;
                var rid = document.getElementById("molongRoomId");
                if (rid) rid.textContent = res.roomId;
                if (titleIn && res.roomTitle) titleIn.value = res.roomTitle;
                applyRoomPanel({
                    roomTitle: res.roomTitle,
                    hostName: res.hostName,
                    dungeonId: res.dungeonId || did,
                    stage: st,
                });
                toast("房间已创建", false);
                return loadState()
                    .then(renderState)
                    .then(pullRoomInfo)
                    .then(function () {
                        startRoomPoll();
                    });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function toggleGuestReady() {
        if (state.myRole !== "guest" || !state.currentRoomId) return Promise.resolve();
        var next = !state.guestReady;
        return api("POST", "/api/dongtian-molong/room/" + state.currentRoomId + "/ready", { ready: next })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "操作失败");
                state.guestReady = !!res.guestReady;
                syncRoomControls();
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function joinRoom(roomId) {
        return api("POST", "/api/dongtian-molong/room/join", {
            roomId: roomId,
            guestSnapshot: arenaSnapshotPayload(),
        })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "加入失败");
                state.currentRoomId = res.roomId;
                state.myRole = "guest";
                var rid = document.getElementById("molongRoomId");
                if (rid) rid.textContent = res.roomId;
                var titleIn = document.getElementById("molongRoomTitleInput");
                if (titleIn && res.roomTitle) titleIn.value = res.roomTitle;
                applyRoomPanel(res);
                toast("已加入房间", false);
                return pullRoomInfo()
                    .then(function () {
                        startRoomPoll();
                        return refreshRoomList();
                    });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeRoom() {
        if (!state.currentRoomId) {
            toast("当前不在房间内", true);
            return Promise.resolve();
        }
        return exitCurrentRoom();
    }

    function startBattle() {
        if (!state.currentRoomId) {
            toast("请先创建或加入房间", true);
            return Promise.resolve();
        }
        return api("POST", "/api/dongtian-molong/battle/start", { roomId: state.currentRoomId })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "无法开战");
                if (res.token) state.molongBattleToken = res.token;
                if (typeof window.beginMolongRaidBattle === "function") {
                    window.beginMolongRaidBattle(res);
                } else {
                    throw new Error("战斗模块未就绪");
                }
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    window.buildMolongEnemyForStage = function (stage, dungeonId) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var did = dungeonId != null ? String(dungeonId) : "molong_dragon";
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        try {
            dungeon.progress.floor = Math.max(1, Math.min(100, stage));
            dungeon.progress.room = 20;
            if (did === "molong_kylin") {
                dungeon.settings.enemyScaling = 1.3;
            } else {
                dungeon.settings.enemyScaling = 1.2;
            }
            generateRandomEnemy("sboss");
            enemy.lvl = 5 * stage;
            if (typeof setEnemyStats === "function") setEnemyStats(enemy.type, "sboss");
            if (did === "molong_dragon") {
                var prefixes = ["苍", "血", "狱", "幽", "劫", "冥", "玄"];
                enemy.name = prefixes[Math.floor(Math.random() * prefixes.length)] + "龙";
            } else if (did === "molong_kylin") {
                var kpre = ["苍", "青", "赤", "玄", "幽", "劫", "灵", "云", "霄"];
                var knames = ["玉麒", "踏炎麒", "衔珠麟", "九色麟", "镇海麒", "天禄", "墨麒麟", "火麒麟"];
                enemy.name = kpre[Math.floor(Math.random() * kpre.length)] + knames[Math.floor(Math.random() * knames.length)];
            } else {
                enemy.name = "劫兽";
            }
            enemy.rewards = { exp: 0, gold: 0, drop: false };
            enemy.mechanic = null;
        } finally {
            dungeon.progress.floor = floorBak;
            dungeon.progress.room = roomBak;
            dungeon.settings.enemyScaling = scaleBak;
            if (emBak) dungeon.enemyMultipliers = emBak;
        }
        return enemy;
    };

    function openModal() {
        if (typeof window.dongtianNetHubClickBlocked === "function" && window.dongtianNetHubClickBlocked()) return;
        var m = document.getElementById("molongHallModal");
        if (!m) return;
        loadState()
            .then(function (res) {
                if (res && res.molongHallLocked) {
                    toast(
                        "当前劫数≥" + (res.molongHallLockAtJie != null ? res.molongHallLockAtJie : 17) + "，不可进入副本大厅（与押镖一致）",
                        true
                    );
                    return;
                }
                m.style.display = "flex";
                var titleIn = document.getElementById("molongRoomTitleInput");
                if (titleIn && !String(titleIn.value || "").trim() && !state.currentRoomId) {
                    titleIn.value = defaultRoomTitle();
                }
                return renderState()
                    .then(syncMyRoomFromServer)
                    .then(refreshRoomList)
                    .then(function () {
                        if (!state.currentRoomId) return;
                        return pullRoomInfo().then(function () {
                            startRoomPoll();
                        });
                    });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeModal() {
        var m = document.getElementById("molongHallModal");
        if (!m) return;
        if (!state.currentRoomId) {
            m.style.display = "none";
            return;
        }
        exitCurrentRoom()
            .then(function () {
                m.style.display = "none";
            })
            .catch(function () {});
    }

    window.initDongtianMolongUI = function () {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (typeof window.ensureCloudMarketBarStructure === "function") window.ensureCloudMarketBarStructure();
        var bar = document.getElementById("xiuMarketBar");
        if (bar) bar.style.display = "flex";
        var hallBtn = document.getElementById("molongHallOpenBtn");
        if (hallBtn && !hallBtn._molongBound) {
            hallBtn._molongBound = true;
            hallBtn.onclick = function () {
                openModal();
            };
        }
        var m = document.getElementById("molongHallModal");
        if (m && !m._molongInit) {
            m._molongInit = true;
            var c = m.querySelector("#molongHallCloseBtn");
            if (c) c.onclick = closeModal;
            var cr = m.querySelector("#molongCreateRoomBtn");
            if (cr) cr.onclick = createRoom;
            var cp = m.querySelector("#molongCopyRoomBtn");
            if (cp) cp.onclick = copyRoomId;
            var cls = m.querySelector("#molongCloseRoomBtn");
            if (cls) cls.onclick = closeRoom;
            var st = m.querySelector("#molongStartBattleBtn");
            if (st) st.onclick = startBattle;
            var rf = m.querySelector("#molongRefreshListBtn");
            if (rf) rf.onclick = refreshRoomList;
            var sInp = m.querySelector("#molongRoomSearchInput");
            if (sInp && !sInp._molongBound) {
                sInp._molongBound = true;
                sInp.addEventListener("input", function () {
                    renderMolongRoomListFiltered();
                });
                sInp.addEventListener("search", function () {
                    renderMolongRoomListFiltered();
                });
            }
            var sv = m.querySelector("#molongSaveRoomTitleBtn");
            if (sv) sv.onclick = saveRoomTitle;
            var gr = m.querySelector("#molongGuestReadyBtn");
            if (gr && !gr._molongBound) {
                gr._molongBound = true;
                gr.onclick = function () {
                    toggleGuestReady();
                };
            }
        }
        loadState().catch(function () {});
    };

    function hideMolongHallModal() {
        stopRoomPoll();
        var m = document.getElementById("molongHallModal");
        if (m) m.style.display = "none";
    }

    window.openMolongHallModal = openModal;
    /** 仅收起弹层，不退出房间（开战时用） */
    window.hideMolongHallModal = hideMolongHallModal;
    /** 若在房间内：先退出/解散再关闭 */
    window.closeMolongHallModal = closeModal;

    window.beginMolongRaidBattle = function (res) {
        if (typeof window._beginMolongRaidBattleImpl === "function") {
            window._beginMolongRaidBattleImpl(res);
        }
    };

    window.finishMolongRaidCombat = function (won, token, damageHost, damageGuest) {
        function apiPost(body) {
            return api("POST", "/api/dongtian-molong/battle/complete", body);
        }
        var dh = typeof damageHost === "number" ? damageHost : 0;
        var dg = typeof damageGuest === "number" ? damageGuest : 0;
        apiPost({ token: token || "", won: !!won, damageHost: dh, damageGuest: dg })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "结算失败");
                state.molongBattleToken = "";
                try {
                    if (typeof window.__dongtianCloudFlushSave === "function") window.__dongtianCloudFlushSave();
                } catch (eF) {}
                var msg = won ? "通关成功，奖励已发放至行囊（以服务端为准）" : "战斗结束";
                if (won && res.rewards && res.rewards.host) {
                    msg += " · 房主材料已入账";
                }
                toast(msg, false);
                return loadState().then(renderState).then(function () {
                    if (state.currentRoomId) startRoomPoll();
                });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    };

    /** 队员端本地结束斗法：不调用结算接口（仅房主提交），仅刷新状态并恢复房间轮询 */
    window.molongRaidGuestLocalEnd = function (won, tok) {
        state.molongBattleToken = "";
        var msg = won ? "本局已结束，奖励与进度以房主提交为准" : "战斗结束";
        toast(msg, false);
        try {
            if (typeof window.__dongtianCloudFlushSave === "function") window.__dongtianCloudFlushSave();
        } catch (e) {}
        return loadState()
            .then(renderState)
            .then(function () {
                if (state.currentRoomId) startRoomPoll();
            });
    };
})();
