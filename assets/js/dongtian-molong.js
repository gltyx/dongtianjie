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

    function toast(msg, isErr, opts) {
        opts = opts || {};
        var el = document.getElementById("xiuMarketToast");
        if (!el) {
            if (isErr) alert(msg);
            return;
        }
        el.textContent = msg;
        el.style.display = "block";
        el.classList.toggle("xiu-market-toast--err", !!isErr);
        el.classList.toggle("xiu-market-toast--molong-reward", !!opts.molongReward);
        clearTimeout(el._molongT);
        var dur = typeof opts.duration === "number" && opts.duration > 0 ? opts.duration : 2800;
        el._molongT = setTimeout(function () {
            el.style.display = "none";
            el.classList.remove("xiu-market-toast--molong-reward");
        }, dur);
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
        var n = "";
        if (typeof player !== "undefined" && player && player.name) {
            n = typeof formatDongtianDisplayName === "function" ? formatDongtianDisplayName(player.name) : String(player.name);
        }
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
        _molongBattleStarting: false,
        /** 劫数≥阈值时不可进副本大厅（与押镖一致，见服务端 molongHallLocked） */
        molongHallLocked: false,
        molongHallLockJie: 17,
        currentJieFromApi: 0,
        assistShopPoints: 0,
        assistShopEarnedToday: 0,
        assistShopDailyEarnCap: 100,
        assistShopEarnLeftToday: 100,
        assistShopOffers: [],
    };

    /** 与服务端 ASSIST_SHOP_OFFERS 一致（旧服未下发列表时兜底） */
    var ASSIST_SHOP_OFFERS_FALLBACK = [
        { id: "assist_gem2", labelZh: "宝石材料包", rateZh: "每 2 个 1 助战值", costPoints: 1, count: 2 },
        { id: "assist_yuqi1", labelZh: "御器材料包", rateZh: "每 1 个 1 助战值", costPoints: 1, count: 1 },
        { id: "assist_warp1", labelZh: "秘境穿梭器", rateZh: "每 1 个 20 助战值", costPoints: 20, count: 1 },
        { id: "assist_petexp1", labelZh: "灵宠经验果实", rateZh: "每 1 个 15 助战值", costPoints: 15, count: 1 },
        { id: "assist_enhance2", labelZh: "强化石", rateZh: "每 2 个 1 助战值", costPoints: 1, count: 2 },
        { id: "assist_enchant2", labelZh: "附魔石", rateZh: "每 2 个 1 助战值", costPoints: 1, count: 2 },
        { id: "assist_god1", labelZh: "神萃石", rateZh: "每 1 个 1 助战值", costPoints: 1, count: 1 },
        { id: "assist_talent3", labelZh: "天赋果", rateZh: "每 3 个 1 助战值", costPoints: 1, count: 3 },
        { id: "assist_seed1", labelZh: "普通种子包", rateZh: "每 1 个 2 助战值", costPoints: 2, count: 1 },
        { id: "assist_netcoin1", labelZh: "联网币", rateZh: "每 1 个 3 助战值", costPoints: 3, count: 1 },
    ];

    /** 最近一次「刷新」拉取的公开房间（供搜索框本地筛选） */
    var lastMolongRoomList = [];

    /** 助战商店：是否处于批量填写份数模式 */
    var assistShopBatchMode = false;

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
                stagesMax: 60,
                roomTitleSuffix: "的魔龙房",
            },
            {
                id: "molong_kylin",
                name: "麒麟岛",
                stagesMax: 60,
                roomTitleSuffix: "的麒麟岛房",
            },
            {
                id: "molong_yaowanggu",
                name: "药王谷",
                stagesMax: 60,
                roomTitleSuffix: "的药王谷房",
            },
            {
                id: "molong_yuqicheng",
                name: "御器城",
                stagesMax: 60,
                roomTitleSuffix: "的御器城房",
            },
            {
                id: "molong_huangfenggu",
                name: "黄枫谷",
                stagesMax: 60,
                roomTitleSuffix: "的黄枫谷房",
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
        var smax = meta.stagesMax || 60;
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
        var smax = meta.stagesMax || 60;
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
        var n = "修士";
        if (typeof player !== "undefined" && player && player.name && String(player.name).trim()) {
            n =
                typeof formatDongtianDisplayName === "function"
                    ? formatDongtianDisplayName(player.name).trim()
                    : String(player.name).trim();
        }
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
            /** 已在同一局副本斗法中 */
            if (typeof enemy !== "undefined" && enemy && enemy.molongRaid && enemy.molongRaid.token === tok) {
                state.molongGuestAutoJoinedToken = tok;
                return;
            }
            /** 秘境/其它斗法残留：须先退出才能进组队副本，否则轮询永远进不来 */
            try {
                if (typeof endCombat === "function") endCombat();
                if (typeof window.molongClearRaidEnemyMarks === "function") window.molongClearRaidEnemyMarks();
                if (typeof enemyDead !== "undefined") enemyDead = false;
                if (typeof playerDead !== "undefined") playerDead = false;
            } catch (eClrOc) {}
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
        if (res && res.orderFront) {
            state.orderFront = res.orderFront === "guest" ? "guest" : "host";
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
        var oh = document.getElementById("molongOrderHostFront");
        var og = document.getElementById("molongOrderGuestFront");
        if (oh) {
            oh.checked = state.orderFront !== "guest";
            oh.disabled = state.myRole !== "host";
        }
        if (og) {
            og.checked = state.orderFront === "guest";
            og.disabled = state.myRole !== "host";
        }
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

    function clearStaleMolongRoomState(showToast) {
        var had = !!state.currentRoomId;
        stopRoomPoll();
        state.currentRoomId = "";
        state.myRole = "";
        state.roomDungeonId = "";
        state.inRoomStage = null;
        state.hasGuestInRoom = false;
        state.guestReady = false;
        state.molongGuestAutoJoinedToken = "";
        state.molongBattleToken = "";
        var ridGone = document.getElementById("molongRoomId");
        if (ridGone) ridGone.textContent = "—";
        var mem = document.getElementById("molongRoomMembers");
        if (mem) mem.textContent = "房主：—　队友：—";
        var sync = document.getElementById("molongRoomSyncLine");
        if (sync) sync.textContent = "";
        syncRoomControls();
        if (showToast && had) {
            toast("服务端已刷新，原房间已失效，请重新创建或加入", true);
        }
    }

    function pullRoomInfo() {
        if (!state.currentRoomId) return Promise.resolve();
        return api("GET", "/api/dongtian-molong/room/" + state.currentRoomId, undefined).then(function (res) {
            if (res && res.ok) {
                applyRoomPanel(res);
                return;
            }
            var msg = res && res.message ? String(res.message) : "";
            if (msg.indexOf("房间不存在") !== -1 || msg.indexOf("已关闭") !== -1) {
                clearStaleMolongRoomState(true);
            }
        });
    }

    function exitCurrentRoom() {
        var rid = state.currentRoomId;
        if (!rid) return Promise.resolve();
        var wasHost = state.myRole === "host";
        return waitMolongCompleteSettled().then(function () {
            return api("POST", "/api/dongtian-molong/room/" + rid + "/leave", {});
        })
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

    function saveOrderFront(nextOrder) {
        if (state.myRole !== "host" || !state.currentRoomId) return Promise.resolve();
        var v = nextOrder === "guest" ? "guest" : "host";
        return api("POST", "/api/dongtian-molong/room/" + state.currentRoomId + "/order-front", { orderFront: v })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "保存站位失败");
                state.orderFront = res.orderFront === "guest" ? "guest" : "host";
                var oh = document.getElementById("molongOrderHostFront");
                var og = document.getElementById("molongOrderGuestFront");
                if (oh) oh.checked = state.orderFront !== "guest";
                if (og) og.checked = state.orderFront === "guest";
                toast("前后排已更新", false);
            })
            .catch(function (e) {
                var oh2 = document.getElementById("molongOrderHostFront");
                var og2 = document.getElementById("molongOrderGuestFront");
                if (oh2) oh2.checked = state.orderFront !== "guest";
                if (og2) og2.checked = state.orderFront === "guest";
                toast(e.message || String(e), true);
            });
    }

    function refreshMolongHallLockUi() {
        var btn = document.getElementById("molongHallOpenBtn");
        if (!btn) return;
        var clientLock =
            typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
        var locked = !!state.molongHallLocked || !!clientLock;
        if (locked) {
            btn.disabled = true;
            var limSrv = state.molongHallLockJie != null ? state.molongHallLockJie : 17;
            var limClient =
                typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
            var jNow = typeof window.dongtianGetCurrentJie === "function" ? window.dongtianGetCurrentJie() : 0;
            btn.setAttribute(
                "title",
                clientLock
                    ? "劫数≥" +
                      limClient +
                      " 时不可使用副本大厅、武神坛、登龙塔、魔神塔、神界（当前劫数 " +
                      jNow +
                      "）"
                    : "劫数≥" + limSrv + " 时不可使用副本大厅（与押镖一致）"
            );
            btn.classList.add("molong-hall-locked");
        } else {
            btn.disabled = false;
            btn.removeAttribute("title");
            btn.classList.remove("molong-hall-locked");
        }
    }
    window.__dongtianRefreshMolongHallLockUi = refreshMolongHallLockUi;

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
            state.assistShopPoints = res.assistShopPoints != null && isFinite(res.assistShopPoints) ? Math.max(0, Math.floor(res.assistShopPoints)) : 0;
            state.assistShopEarnedToday =
                res.assistShopEarnedToday != null && isFinite(res.assistShopEarnedToday)
                    ? Math.max(0, Math.floor(res.assistShopEarnedToday))
                    : 0;
            state.assistShopDailyEarnCap =
                res.assistShopDailyEarnCap != null && isFinite(res.assistShopDailyEarnCap)
                    ? Math.max(1, Math.floor(res.assistShopDailyEarnCap))
                    : 100;
            state.assistShopEarnLeftToday =
                res.assistShopEarnLeftToday != null && isFinite(res.assistShopEarnLeftToday)
                    ? Math.max(0, Math.floor(res.assistShopEarnLeftToday))
                    : Math.max(0, state.assistShopDailyEarnCap - state.assistShopEarnedToday);
            state.assistShopOffers =
                res.assistShopOffers && res.assistShopOffers.length ? res.assistShopOffers : ASSIST_SHOP_OFFERS_FALLBACK.slice();
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
        var smax = dm.stagesMax || 60;
        var prog =
            nh > smax
                ? "【" + dm.name + "】房主今日已通关全部 " + smax + " 关（明日 12:01 重置）"
                : "【" + dm.name + "】房主可挑战第 " + nh + " 关";
        var assistLeft = guestAssistLeftForDungeon(didMeta);
        var cap = state.assistShopDailyEarnCap != null ? state.assistShopDailyEarnCap : 100;
        var earnLeft =
            state.assistShopEarnLeftToday != null
                ? state.assistShopEarnLeftToday
                : Math.max(0, cap - (state.assistShopEarnedToday || 0));
        var pts = state.assistShopPoints != null ? state.assistShopPoints : 0;
        el.textContent =
            "本周期 " +
            (state.cycleKey || "—") +
            " · " +
            prog +
            " · 【" +
            dm.name +
            "】助战剩余 " +
            assistLeft +
            " 次 · 助战值 " +
            pts +
            " · 本周期助战成功还可 +" +
            earnLeft +
            "/" +
            cap;
    }

    function assistShopOffersList() {
        return state.assistShopOffers && state.assistShopOffers.length ? state.assistShopOffers : ASSIST_SHOP_OFFERS_FALLBACK;
    }

    function syncAssistShopHud() {
        var bal = document.getElementById("molongAssistShopBalance");
        if (bal) bal.textContent = String(state.assistShopPoints != null ? state.assistShopPoints : 0);
        var hint = document.getElementById("molongAssistShopEarnHint");
        if (hint) {
            var cap = state.assistShopDailyEarnCap != null ? state.assistShopDailyEarnCap : 100;
            var left =
                state.assistShopEarnLeftToday != null
                    ? state.assistShopEarnLeftToday
                    : Math.max(0, cap - (state.assistShopEarnedToday || 0));
            hint.textContent =
                "助战值通过「副本大厅」以队员身份助战通关获得，每次 +1。每周期（北京时间每日 12:01 起）至多通过助战获得 " +
                cap +
                " 点；当前本周期还可通过助战 +" +
                left +
                " 点。已获得的助战值可累积，用于下方兑换。";
        }
    }

    function renderAssistShopGrid() {
        var grid = document.getElementById("molongAssistShopGrid");
        if (!grid) return;
        var pts = state.assistShopPoints != null ? state.assistShopPoints : 0;
        var list = assistShopOffersList();
        var html;
        if (assistShopBatchMode) {
            html = list
                .map(function (o) {
                    var id = escAttr(o.id);
                    var name = escHtml(o.labelZh || o.id);
                    var rate = escHtml(o.rateZh || "");
                    var cost = Math.floor(Number(o.costPoints)) || 0;
                    var maxQ = cost > 0 ? Math.floor(pts / cost) : 0;
                    return (
                        '<article class="molong-assist-shop-card molong-assist-shop-card--batch">' +
                        '<h4 class="molong-assist-shop-card-name">' +
                        name +
                        "</h4>" +
                        '<p class="molong-assist-shop-card-rate">' +
                        rate +
                        "</p>" +
                        '<div class="molong-assist-shop-card-foot molong-assist-shop-card-foot--batch">' +
                        '<label class="molong-assist-shop-qty-label">份数' +
                        '<input type="number" min="0" max="' +
                        maxQ +
                        '" step="1" value="0" class="molong-assist-shop-qty-input" data-batch-offer="' +
                        id +
                        '" data-batch-cost="' +
                        cost +
                        '" /></label>' +
                        '<span class="molong-assist-shop-line-sum" data-batch-offer-sum="' +
                        id +
                        '">小计 0 助战值</span>' +
                        "</div></article>"
                    );
                })
                .join("");
        } else {
            html = list
                .map(function (o) {
                    var id = escAttr(o.id);
                    var name = escHtml(o.labelZh || o.id);
                    var rate = escHtml(o.rateZh || "");
                    var cost = Math.floor(Number(o.costPoints)) || 0;
                    var can = pts >= cost;
                    return (
                        '<article class="molong-assist-shop-card">' +
                        '<h4 class="molong-assist-shop-card-name">' +
                        name +
                        "</h4>" +
                        '<p class="molong-assist-shop-card-rate">' +
                        rate +
                        "</p>" +
                        '<div class="molong-assist-shop-card-foot">' +
                        '<span class="molong-assist-shop-cost">' +
                        escHtml(String(cost)) +
                        " 助战值</span>" +
                        '<button type="button" class="btn btn--sm ' +
                        (can ? "btn--accent" : "btn--ghost") +
                        '" data-assist-offer="' +
                        id +
                        '"' +
                        (can ? "" : ' disabled title="助战值不足"') +
                        ">兑换</button>" +
                        "</div></article>"
                    );
                })
                .join("");
        }
        grid.innerHTML = html;
        if (assistShopBatchMode) {
            grid.oninput = function () {
                updateAssistShopBatchSum();
            };
            grid.onchange = function () {
                updateAssistShopBatchSum();
            };
            updateAssistShopBatchSum();
        } else {
            grid.oninput = null;
            grid.onchange = null;
            grid.querySelectorAll("[data-assist-offer]").forEach(function (btn) {
                btn.onclick = function () {
                    var oid = btn.getAttribute("data-assist-offer");
                    if (oid) buyAssistOffer(oid);
                };
            });
        }
    }

    function updateAssistShopBatchSum() {
        var sumEl = document.getElementById("molongAssistShopBatchSum");
        var grid = document.getElementById("molongAssistShopGrid");
        if (!sumEl || !grid) return;
        var total = 0;
        grid.querySelectorAll(".molong-assist-shop-qty-input").forEach(function (inp) {
            var cost = Math.floor(Number(inp.getAttribute("data-batch-cost")) || 0);
            var q = Math.floor(Number(inp.value));
            if (!isFinite(q) || q < 0) q = 0;
            var maxQ = Math.floor(Number(inp.getAttribute("max")) || 0);
            if (maxQ >= 0 && q > maxQ) {
                q = maxQ;
                inp.value = String(maxQ);
            }
            var line = q * cost;
            total += line;
            var oid = inp.getAttribute("data-batch-offer");
            if (oid) {
                var span = grid.querySelector('[data-batch-offer-sum="' + oid.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]');
                if (span) span.textContent = "小计 " + line + " 助战值";
            }
        });
        var pts = state.assistShopPoints != null ? state.assistShopPoints : 0;
        var over = total > pts;
        sumEl.textContent = "合计消耗 " + total + " 助战值（当前 " + pts + "）";
        sumEl.classList.toggle("molong-assist-shop-batch-sum--over", over);
    }

    function resetAssistShopBatchUi() {
        assistShopBatchMode = false;
        var tb = document.getElementById("molongAssistShopBatchToolbar");
        if (tb) {
            tb.style.display = "none";
            tb.setAttribute("aria-hidden", "true");
        }
        var bbtn = document.getElementById("molongAssistShopBatchToggleBtn");
        if (bbtn) bbtn.textContent = "批量兑换";
        var sheet = document.querySelector("#molongAssistShopModal .molong-assist-shop-sheet");
        if (sheet) sheet.classList.remove("molong-assist-shop-sheet--batch");
        var sumEl = document.getElementById("molongAssistShopBatchSum");
        if (sumEl) sumEl.classList.remove("molong-assist-shop-batch-sum--over");
    }

    function toggleAssistShopBatchMode() {
        assistShopBatchMode = !assistShopBatchMode;
        var tb = document.getElementById("molongAssistShopBatchToolbar");
        var btn = document.getElementById("molongAssistShopBatchToggleBtn");
        if (tb) {
            tb.style.display = assistShopBatchMode ? "block" : "none";
            tb.setAttribute("aria-hidden", assistShopBatchMode ? "false" : "true");
        }
        if (btn) btn.textContent = assistShopBatchMode ? "退出批量" : "批量兑换";
        var sheet = document.querySelector("#molongAssistShopModal .molong-assist-shop-sheet");
        if (sheet) sheet.classList.toggle("molong-assist-shop-sheet--batch", assistShopBatchMode);
        renderAssistShopGrid();
        if (assistShopBatchMode) updateAssistShopBatchSum();
    }

    function submitAssistShopBatch() {
        var grid = document.getElementById("molongAssistShopGrid");
        if (!grid) return;
        var items = [];
        grid.querySelectorAll(".molong-assist-shop-qty-input").forEach(function (inp) {
            var oid = inp.getAttribute("data-batch-offer");
            var q = Math.floor(Number(inp.value) || 0);
            if (oid && q > 0) items.push({ offerId: oid, qty: q });
        });
        if (!items.length) {
            toast("请至少填写一项大于 0 的份数", true);
            return Promise.resolve();
        }
        return api("POST", "/api/dongtian-molong/assist-shop/buy-batch", { items: items })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "批量兑换失败");
                state.assistShopPoints =
                    res.assistShopPoints != null && isFinite(res.assistShopPoints) ? Math.max(0, Math.floor(res.assistShopPoints)) : 0;
                var line = res.grantToast || (res.grant ? formatMolongGrantLine(res.grant) : "");
                toast(line ? "批量兑换成功：" + line : "批量兑换成功", false, { duration: 4200 });
                if (res.grant && typeof window.dongtianApplyMolongMaterialGrant === "function") {
                    window.dongtianApplyMolongMaterialGrant(res.grant);
                }
                resetAssistShopBatchUi();
                return reloadDongtianSaveFromServerAfterTrade({ forceServerPlayer: true }).then(function () {
                    return loadState();
                });
            })
            .then(function () {
                syncAssistShopHud();
                renderMetaLine();
                renderAssistShopGrid();
                if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
                if (typeof showEquipment === "function") showEquipment();
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function reloadDongtianSaveFromServerAfterTrade(opts) {
        opts = opts || {};
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        /** 服务端已发奖/购货后：禁止先 flush 本地 player，否则会盖掉刚写入的奖励 */
        opts.skipPreFlush = true;
        if (typeof window.dongtianReloadSaveAfterServerGrant === "function") {
            return window.dongtianReloadSaveAfterServerGrant(opts);
        }
        if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
            return window.dongtianPullServerSaveAfterMutation(opts);
        }
        window.__dongtianCloudReloading = true;
        return api("GET", "/api/dongtian-jie/save", undefined)
            .then(function (res) {
                if (!res || !res.ok || !res.data || !res.data.player) return false;
                if (typeof window.dongtianApplyServerPayload === "function") {
                    window.dongtianApplyServerPayload(res.data, {
                        forceServerPlayer: true,
                        fromServerMutation: true,
                        fromMolongServerSync: true,
                    });
                }
                return true;
            })
            .catch(function () {
                return false;
            })
            .finally(function () {
                window.__dongtianCloudReloading = false;
            });
    }

    function buyAssistOffer(offerId) {
        return api("POST", "/api/dongtian-molong/assist-shop/buy", { offerId: offerId })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "兑换失败");
                state.assistShopPoints =
                    res.assistShopPoints != null && isFinite(res.assistShopPoints) ? Math.max(0, Math.floor(res.assistShopPoints)) : 0;
                var line = res.grantToast || (res.grant ? formatMolongGrantLine(res.grant) : "");
                toast(line ? "兑换成功：" + line : "兑换成功", false, { duration: 3600 });
                if (res.grant && typeof window.dongtianApplyMolongMaterialGrant === "function") {
                    window.dongtianApplyMolongMaterialGrant(res.grant);
                }
                return reloadDongtianSaveFromServerAfterTrade({ forceServerPlayer: true }).then(function () {
                    return loadState();
                });
            })
            .then(function () {
                syncAssistShopHud();
                renderMetaLine();
                renderAssistShopGrid();
                if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
                if (typeof showEquipment === "function") showEquipment();
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function openAssistShopModal() {
        var sm = document.getElementById("molongAssistShopModal");
        if (!sm) return;
        loadState()
            .then(function () {
                resetAssistShopBatchUi();
                syncAssistShopHud();
                renderAssistShopGrid();
                sm.style.display = "flex";
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeAssistShopModal() {
        var sm = document.getElementById("molongAssistShopModal");
        if (!sm) return;
        resetAssistShopBatchUi();
        var wasOpen = sm.style.display === "flex";
        sm.style.display = "none";
        if (!wasOpen) return;
        loadState()
            .then(function () {
                renderMetaLine();
            })
            .catch(function () {});
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
        var asm = document.getElementById("molongAssistShopModal");
        if (asm && asm.style.display === "flex") {
            syncAssistShopHud();
            renderAssistShopGrid();
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
            var smax = getDungeonMeta(fdid || state.defaultDungeonId || "molong_dragon").stagesMax || 60;
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
                    clearStaleMolongRoomState(true);
                } else {
                    syncRoomControls();
                }
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
        var smax = getDungeonMeta(did).stagesMax || 60;
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
        if (state._molongBattleStarting) {
            return Promise.resolve();
        }
        if (typeof player !== "undefined" && player && player.inCombat) {
            if (typeof enemy !== "undefined" && enemy && enemy.molongRaid) {
                toast("已在副本斗法中，请勿重复开战", true);
                return Promise.resolve();
            }
            try {
                if (typeof endCombat === "function") endCombat();
                if (typeof window.molongClearRaidEnemyMarks === "function") window.molongClearRaidEnemyMarks();
            } catch (eHostClr) {}
        }
        state._molongBattleStarting = true;
        var flushP;
        if (typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending()) {
            flushP =
                typeof window.dongtianFlushMaterialDeltas === "function"
                    ? window.dongtianFlushMaterialDeltas({ reason: "molong_battle_start" })
                    : Promise.resolve(true);
        } else if (typeof window.dongtianCloudSavePending === "function" && window.dongtianCloudSavePending()) {
            flushP =
                typeof window.dongtianCloudFlushSaveWhenDirty === "function"
                    ? window.dongtianCloudFlushSaveWhenDirty(2500)
                    : Promise.resolve(true);
        } else {
            flushP = Promise.resolve(true);
        }
        return flushP
            .catch(function () {
                return false;
            })
            .then(function () {
                /** 副本开战依赖服务端房间快照，行囊整包未落盘不阻塞开战 */
                return api("POST", "/api/dongtian-molong/battle/start", {
                    roomId: state.currentRoomId,
                    dungeonId: state.roomDungeonId || getSelectedDungeonId(),
                });
            })
            .then(function (res) {
                if (!res) return;
                if (!res.ok) {
                    var errMsg = (res && res.message) || "无法开战";
                    if (String(errMsg).indexOf("房间不存在") !== -1) {
                        clearStaleMolongRoomState(true);
                    }
                    throw new Error(errMsg);
                }
                if (res.token) state.molongBattleToken = res.token;
                if (typeof window.beginMolongRaidBattle === "function") {
                    window.beginMolongRaidBattle(res);
                } else {
                    throw new Error("战斗模块未就绪");
                }
            })
            .catch(function (e) {
                if (e) toast(e.message || String(e), true);
            })
            .finally(function () {
                state._molongBattleStarting = false;
            });
    }

    window.buildMolongEnemyForStage = function (stage, dungeonId, enemyRule) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var did = dungeonId != null ? String(dungeonId) : "molong_dragon";
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        try {
            var stageMax = getDungeonMeta(did).stagesMax || 60;
            var safeStage = Math.max(1, Math.min(stageMax, Math.floor(Number(stage) || 1)));
            var rule = enemyRule && typeof enemyRule === "object" ? enemyRule : null;
            var floorForStage =
                rule && isFinite(rule.floor) ? Math.max(1, Math.min(100, Math.floor(Number(rule.floor)))) : safeStage;
            if (!rule && did === "molong_yaowanggu") {
                floorForStage = Math.max(1, Math.min(100, safeStage * 3));
            } else if (!rule && did === "molong_yuqicheng") {
                floorForStage = Math.max(1, Math.min(100, safeStage * 2));
            }
            dungeon.progress.floor = floorForStage;
            dungeon.progress.room =
                rule && isFinite(rule.jie) ? Math.max(1, Math.floor(Number(rule.jie))) : 20;
            if (did === "molong_kylin") {
                dungeon.settings.enemyScaling = 1.3;
            } else if (did === "molong_yaowanggu") {
                dungeon.settings.enemyScaling =
                    rule && isFinite(rule.enemyScaling) ? Number(rule.enemyScaling) : 1.4;
            } else if (did === "molong_yuqicheng") {
                dungeon.settings.enemyScaling =
                    rule && isFinite(rule.enemyScaling) ? Number(rule.enemyScaling) : 1.5;
            } else if (did === "molong_huangfenggu") {
                dungeon.settings.enemyScaling =
                    rule && isFinite(rule.enemyScaling) ? Number(rule.enemyScaling) : 1.2;
            } else {
                dungeon.settings.enemyScaling = 1.2;
            }
            generateRandomEnemy("sboss");
            if (rule && isFinite(rule.enemyLevel)) {
                enemy.lvl = Math.max(1, Math.floor(Number(rule.enemyLevel)));
            } else {
                enemy.lvl = did === "molong_yaowanggu" ? 15 * safeStage : 5 * safeStage;
            }
            if (typeof setEnemyStats === "function") setEnemyStats(enemy.type, "sboss");
            if (did === "molong_dragon") {
                var prefixes = ["苍", "血", "狱", "幽", "劫", "冥", "玄"];
                enemy.name = prefixes[Math.floor(Math.random() * prefixes.length)] + "龙";
            } else if (did === "molong_kylin") {
                var kpre = ["苍", "青", "赤", "玄", "幽", "劫", "灵", "云", "霄"];
                var knames = ["玉麒", "踏炎麒", "衔珠麟", "九色麟", "镇海麒", "天禄", "墨麒麟", "火麒麟"];
                enemy.name = kpre[Math.floor(Math.random() * kpre.length)] + knames[Math.floor(Math.random() * knames.length)];
            } else if (did === "molong_yaowanggu") {
                var ypre = ["霸绝", "噬魂", "焚天", "裂穹", "镇狱", "玄煞", "断岳", "灭神", "狂魇", "凶冥"];
                var yname = ["青木", "赤炎", "玄毒", "鬼藤", "血枭", "雷骨", "幽岚", "戮魄", "天蚀", "夜罗"];
                var ysuf = rule && rule.bossSuffix ? String(rule.bossSuffix) : "妖王";
                enemy.name = ypre[Math.floor(Math.random() * ypre.length)] + yname[Math.floor(Math.random() * yname.length)] + ysuf;
            } else if (did === "molong_yuqicheng") {
                var qpre = ["霸绝", "噬魂", "焚天", "裂穹", "镇狱", "玄煞", "断岳", "灭神", "狂魇", "凶冥", "劫煞", "冥渊", "天罡", "九幽"];
                var qsuf = rule && rule.bossSuffix ? String(rule.bossSuffix) : "剑王";
                enemy.name = qpre[Math.floor(Math.random() * qpre.length)] + qsuf;
            } else if (did === "molong_huangfenggu") {
                var hpre = ["吞天", "蚀月", "镇狱", "裂穹", "劫煞", "幽冥", "九渊", "焚苍", "灭世", "魇魔", "断岳", "冥渊", "天罡", "噬魂"];
                var hcore = ["枫煞", "谷魅", "灵窟", "残卷", "宝墟", "秘匣", "地脉", "古卷"];
                var hsuf = rule && rule.bossSuffix ? String(rule.bossSuffix) : "邪修";
                enemy.name = hpre[Math.floor(Math.random() * hpre.length)] + hcore[Math.floor(Math.random() * hcore.length)] + hsuf;
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
        var m = document.getElementById("molongHallModal");
        if (!m) return;
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("副本大厅");
            }
            return;
        }
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
        closeAssistShopModal();
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
            var oh = m.querySelector("#molongOrderHostFront");
            var og = m.querySelector("#molongOrderGuestFront");
            if (oh && !oh._molongBound) {
                oh._molongBound = true;
                oh.onchange = function () {
                    if (oh.checked) saveOrderFront("host");
                };
            }
            if (og && !og._molongBound) {
                og._molongBound = true;
                og.onchange = function () {
                    if (og.checked) saveOrderFront("guest");
                };
            }
            var gr = m.querySelector("#molongGuestReadyBtn");
            if (gr && !gr._molongBound) {
                gr._molongBound = true;
                gr.onclick = function () {
                    toggleGuestReady();
                };
            }
            var asOpen = document.getElementById("molongAssistShopOpenBtn");
            if (asOpen && !asOpen._molongAssistShopBound) {
                asOpen._molongAssistShopBound = true;
                asOpen.onclick = function (e) {
                    if (e) e.stopPropagation();
                    openAssistShopModal();
                };
            }
        }
        var assistShopModal = document.getElementById("molongAssistShopModal");
        if (assistShopModal && !assistShopModal._molongAssistShopModalInit) {
            assistShopModal._molongAssistShopModalInit = true;
            var asc = assistShopModal.querySelector("#molongAssistShopCloseBtn");
            if (asc) asc.onclick = closeAssistShopModal;
            var batchToggle = assistShopModal.querySelector("#molongAssistShopBatchToggleBtn");
            if (batchToggle && !batchToggle._molongBatchToggleBound) {
                batchToggle._molongBatchToggleBound = true;
                batchToggle.onclick = function (e) {
                    if (e) e.stopPropagation();
                    toggleAssistShopBatchMode();
                };
            }
            var batchSub = assistShopModal.querySelector("#molongAssistShopBatchSubmitBtn");
            if (batchSub && !batchSub._molongBatchSubmitBound) {
                batchSub._molongBatchSubmitBound = true;
                batchSub.onclick = function (e) {
                    if (e) e.stopPropagation();
                    submitAssistShopBatch();
                };
            }
            var batchCan = assistShopModal.querySelector("#molongAssistShopBatchCancelBtn");
            if (batchCan && !batchCan._molongBatchCancelBound) {
                batchCan._molongBatchCancelBound = true;
                batchCan.onclick = function (e) {
                    if (e) e.stopPropagation();
                    if (assistShopBatchMode) toggleAssistShopBatchMode();
                };
            }
            assistShopModal.addEventListener("click", function (ev) {
                if (ev.target === assistShopModal) closeAssistShopModal();
            });
        }
        loadState().catch(function () {});
    };

    function hideMolongHallModal() {
        stopRoomPoll();
        var m = document.getElementById("molongHallModal");
        if (m) m.style.display = "none";
        closeAssistShopModal();
    }

    function molongRaidDungeonLabel(did) {
        var id = did != null ? String(did) : "";
        if (id === "molong_huangfenggu") return "黄枫谷";
        if (id === "molong_kylin") return "麒麟岛";
        if (id === "molong_yaowanggu") return "药王谷";
        if (id === "molong_yuqicheng") return "御器城";
        return "魔龙洞";
    }

    /** 副本斗法结束：关副本大厅、回洞天主界面（避免斗法结束后仍叠在魔龙洞弹层上） */
    window.molongPostRaidRestoreHubUi = function () {
        hideMolongHallModal();
        try {
            if (typeof window.molongClearRaidEnemyMarks === "function") {
                window.molongClearRaidEnemyMarks();
            } else if (typeof window.stripSpecialCombatEnemyMarks === "function") {
                window.stripSpecialCombatEnemyMarks(typeof enemy !== "undefined" ? enemy : null);
            }
        } catch (eClrUi) {}
        try {
            var dim = document.querySelector("#dungeon-main");
            if (dim) {
                dim.style.filter = "brightness(100%)";
                if (typeof runLoad === "function") runLoad("dungeon-main", "flex");
            }
        } catch (eUi) {}
    };

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

    /** 副本大厅结算材料中文名（与行囊/坊市常用 key 对齐） */
    function molongMaterialLabelZh(matKey) {
        var k = String(matKey || "").trim();
        if (!k) return "";
        try {
            if (typeof MATERIAL_ENHANCE_STONE !== "undefined" && k === MATERIAL_ENHANCE_STONE && typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined") {
                return MATERIAL_ENHANCE_STONE_ZH;
            }
            if (typeof MATERIAL_ENCHANT_STONE !== "undefined" && k === MATERIAL_ENCHANT_STONE && typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined") {
                return MATERIAL_ENCHANT_STONE_ZH;
            }
            if (typeof MATERIAL_GEM_PACK !== "undefined" && k === MATERIAL_GEM_PACK && typeof MATERIAL_GEM_PACK_ZH !== "undefined") {
                return MATERIAL_GEM_PACK_ZH;
            }
            if (typeof MATERIAL_SOCKET_OPENER !== "undefined" && k === MATERIAL_SOCKET_OPENER && typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined") {
                return MATERIAL_SOCKET_OPENER_ZH;
            }
            if (typeof MATERIAL_TALENT_FRUIT !== "undefined" && k === MATERIAL_TALENT_FRUIT && typeof MATERIAL_TALENT_FRUIT_ZH !== "undefined") {
                return MATERIAL_TALENT_FRUIT_ZH;
            }
            if (typeof MATERIAL_GOD_ESSENCE_STONE !== "undefined" && k === MATERIAL_GOD_ESSENCE_STONE && typeof MATERIAL_GOD_ESSENCE_STONE_ZH !== "undefined") {
                return MATERIAL_GOD_ESSENCE_STONE_ZH;
            }
            if (typeof MATERIAL_PET_EXP_FRUIT !== "undefined" && k === MATERIAL_PET_EXP_FRUIT && typeof MATERIAL_PET_EXP_FRUIT_ZH !== "undefined") {
                return MATERIAL_PET_EXP_FRUIT_ZH;
            }
            if (typeof MATERIAL_SECRET_REALM_WARP !== "undefined" && k === MATERIAL_SECRET_REALM_WARP && typeof MATERIAL_SECRET_REALM_WARP_ZH !== "undefined") {
                return MATERIAL_SECRET_REALM_WARP_ZH;
            }
            if (typeof window !== "undefined" && typeof window.MATERIAL_YUQI_PACK === "string" && k === window.MATERIAL_YUQI_PACK) {
                return typeof window.MATERIAL_YUQI_PACK_ZH === "string" ? window.MATERIAL_YUQI_PACK_ZH : "御器材料包";
            }
        } catch (eLab) {}
        var fb = {
            enhance_stone: "强化石",
            enchant_stone: "附魔石",
            gem_material_pack: "宝石材料包",
            socket_opener: "开孔器",
            talent_fruit: "天赋果",
            god_essence_stone: "神萃石",
            yuqi_material_pack: "御器材料包",
            pet_exp_fruit: "灵宠经验果实",
            secret_realm_warp: "秘境穿梭器",
            lt_seed_pack_common: "普通种子包",
            lt_seed_pack_rare: "珍稀种子包",
            lt_seed_pack_mutant: "变异种子包",
        };
        return fb[k] || k;
    }

    function formatMolongGrantLine(grant) {
        if (!grant || typeof grant !== "object") return "";
        var keys = Object.keys(grant).sort();
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k === "networkCoin") {
                var nc = Math.floor(Number(grant[k]) || 0);
                if (nc > 0) parts.push("联网币 ×" + nc);
                continue;
            }
            if (k === "treasure_maps") {
                var tm = Math.floor(Number(grant[k]) || 0);
                if (tm > 0) parts.push("藏宝图 ×" + tm);
                continue;
            }
            var n = Math.floor(Number(grant[k]) || 0);
            if (n > 0) parts.push(molongMaterialLabelZh(k) + " ×" + n);
        }
        return parts.join("、");
    }

    function buildMolongVictoryToastMessage(rew) {
        var lines = ["通关成功"];
        var hostLine = rew && formatMolongGrantLine(rew.host);
        var guestLine = rew && formatMolongGrantLine(rew.guest);
        if (hostLine) lines.push("房主：" + hostLine);
        if (guestLine) lines.push("队员：" + guestLine);
        if (!hostLine && !guestLine) {
            if (rew && (rew.hostGrantError || rew.guestGrantError)) {
                if (rew.hostGrantError) lines.push("房主：" + rew.hostGrantError);
                if (rew.guestGrantError) lines.push("队员：" + rew.guestGrantError);
            } else {
                lines.push("奖励已入账（详见行囊，以服务端为准）");
            }
        } else {
            lines.push("以服务端行囊为准");
        }
        if (rew && rew.hostGrantError && hostLine) lines.push("房主提示：" + rew.hostGrantError);
        if (rew && rew.guestGrantError && guestLine) lines.push("队员提示：" + rew.guestGrantError);
        return lines.join("\n");
    }

    var molongCompleteInFlight = "";

    function applyMolongProgressFromServer(res) {
        if (!res || typeof res !== "object") return;
        if (res.dungeonProgress && typeof res.dungeonProgress === "object") {
            state.dungeonProgress = res.dungeonProgress;
        }
        if (res.nextHostStage != null && isFinite(res.nextHostStage)) {
            state.nextHostStage = Math.max(1, Math.floor(res.nextHostStage));
        }
        if (res.roomStageAfterWin != null && isFinite(res.roomStageAfterWin) && state.currentRoomId) {
            state.inRoomStage = Math.max(1, Math.floor(res.roomStageAfterWin));
        }
    }

    function waitMolongCompleteSettled() {
        if (!molongCompleteInFlight) return Promise.resolve();
        var tok = molongCompleteInFlight;
        return new Promise(function (resolve) {
            var n = 0;
            var t = setInterval(function () {
                n += 1;
                if (molongCompleteInFlight !== tok || n > 120) {
                    clearInterval(t);
                    resolve();
                }
            }, 50);
        });
    }

    window.finishMolongRaidCombat = function (won, token, damageHost, damageGuest) {
        var tok = token != null ? String(token).trim() : "";
        if (!tok) {
            toast("缺少战斗凭证", true);
            return Promise.resolve();
        }
        if (molongCompleteInFlight === tok) {
            return Promise.resolve();
        }
        molongCompleteInFlight = tok;
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        var dh = typeof damageHost === "number" ? damageHost : 0;
        var dg = typeof damageGuest === "number" ? damageGuest : 0;
        return api("POST", "/api/dongtian-molong/battle/complete", {
            token: tok,
            won: !!won,
            damageHost: dh,
            damageGuest: dg,
        })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "结算失败");
                state.molongBattleToken = "";
                applyMolongProgressFromServer(res);
                var rew = res.rewards;
                if (rew == null && res.data && typeof res.data === "object" && res.data.rewards != null) {
                    rew = res.data.rewards;
                }
                if (won && rew && rew.hostGrantError) {
                    throw new Error("奖励发放失败：" + String(rew.hostGrantError));
                }
                if (
                    won &&
                    rew &&
                    rew.host &&
                    typeof window.dongtianApplyMolongMaterialGrant === "function"
                ) {
                    window.dongtianApplyMolongMaterialGrant(rew.host);
                }
                function mergeMolongHostSnapshotFromRewards(r) {
                    if (!r || typeof window.dongtianMergeServerPlayerTradeRewards !== "function") return;
                    var partial = {};
                    if (Array.isArray(r.hostTreasureMapsAfter)) {
                        partial.dongtianTreasureMaps = r.hostTreasureMapsAfter;
                    }
                    if (partial.dongtianTreasureMaps) {
                        window.dongtianMergeServerPlayerTradeRewards(partial, {});
                    }
                }
                return reloadDongtianSaveFromServerAfterTrade({ forceServerPlayer: true })
                    .then(function (syncOk) {
                        if (!syncOk) {
                            mergeMolongHostSnapshotFromRewards(rew);
                            toast("奖励已发放，但拉取行囊失败——已尝试合并服务端快照", true);
                        } else if (rew) {
                            mergeMolongHostSnapshotFromRewards(rew);
                        }
                    })
                    .then(function () {
                        var rt = res.rewardToast;
                        if (rt == null && res.data && typeof res.data === "object" && res.data.rewardToast != null) {
                            rt = res.data.rewardToast;
                        }
                        var msg;
                        var longDetail = false;
                        if (won && rt && (rt.host || rt.guest)) {
                            var linesRt = ["通关成功"];
                            if (rt.host) linesRt.push("房主：" + rt.host);
                            if (rt.guest) linesRt.push("队员：" + rt.guest);
                            linesRt.push("以服务端行囊为准");
                            msg = linesRt.join("\n");
                            longDetail = true;
                        } else {
                            msg = won ? buildMolongVictoryToastMessage(rew) : "战斗结束";
                            longDetail = !!(won && rew && (formatMolongGrantLine(rew.host) || formatMolongGrantLine(rew.guest)));
                        }
                        toast(msg, false, {
                            molongReward: longDetail,
                            duration: won && longDetail ? 5600 : 3200,
                        });
                        if (typeof window.molongPostRaidRestoreHubUi === "function") {
                            window.molongPostRaidRestoreHubUi();
                        }
                        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
                        if (typeof showInventory === "function") showInventory();
                        return loadState().then(renderState).then(function () {
                            if (state.currentRoomId) startRoomPoll();
                        });
                    });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            })
            .finally(function () {
                if (molongCompleteInFlight === tok) molongCompleteInFlight = "";
            });
    };

    /** 队员端本地结束斗法：不调用结算接口（仅房主提交），仅刷新状态并恢复房间轮询 */
    window.molongRaidGuestLocalEnd = function (won, tok) {
        state.molongBattleToken = "";
        try {
            if (typeof window.molongClearRaidEnemyMarks === "function") {
                window.molongClearRaidEnemyMarks();
            }
        } catch (eGClr) {}
        var msg = won ? "本局已结束，奖励与进度以房主提交为准" : "战斗结束";
        toast(msg, false);
        if (typeof window.molongPostRaidRestoreHubUi === "function") {
            window.molongPostRaidRestoreHubUi();
        }
        return reloadDongtianSaveFromServerAfterTrade()
            .catch(function () {
                return false;
            })
            .then(function () {
                return loadState();
            })
            .then(renderState)
            .then(function () {
                if (state.currentRoomId) startRoomPoll();
            });
    };
})();
