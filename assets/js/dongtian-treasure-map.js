/**
 * 洞天劫 · 藏宝图系统（联网）：启图挑战、遗器掉落、界面
 */
(function () {
    var QUALITIES = [
        { id: "canjian", name: "残简藏宝图", short: "残简", glyph: "简", tier: "凡卷", color: "#8b7355", fxTier: 1 },
        { id: "jinhui", name: "锦绘藏宝图", short: "锦绘", glyph: "绘", tier: "灵卷", color: "#6b8e4e", fxTier: 2 },
        { id: "yuzhuan", name: "玉篆藏宝图", short: "玉篆", glyph: "篆", tier: "玄卷", color: "#4a8fad", fxTier: 3 },
        { id: "xuanling", name: "玄灵藏宝图", short: "玄灵", glyph: "灵", tier: "仙卷", color: "#7b5ea7", fxTier: 4 },
        { id: "shengu", name: "神古藏宝图", short: "神古", glyph: "古", tier: "神卷", color: "#b8860b", fxTier: 5 },
    ];

    function treasureCardFxTier(q) {
        if (!q) return 1;
        if (q.fxTier != null && isFinite(q.fxTier)) return Math.max(1, Math.min(5, Math.floor(q.fxTier)));
        var idx = QUALITIES.findIndex(function (x) {
            return x.id === q.id;
        });
        return idx >= 0 ? idx + 1 : 1;
    }

    var TM_LEGACY_WEAPON_NAME = "秘卷遗兵";
    var TM_LEGACY_DEFENSE_NAME = "宝图玄甲";
    var TM_LEGACY_ACCESSORY_NAME = "劫图灵饰";

    function treasureMapEquipNeedsNameFix(item) {
        if (!item || !item.treasureMapDrop) return false;
        if (item.type === "Weapon") {
            return !item.weaponName || item.weaponName === TM_LEGACY_WEAPON_NAME;
        }
        if (item.type === "Necklace" || item.type === "Ring") {
            return !item.accessoryName || item.accessoryName === TM_LEGACY_ACCESSORY_NAME;
        }
        return !item.defenseName || item.defenseName === TM_LEGACY_DEFENSE_NAME;
    }

    function applyTreasureMapEquipDisplayName(item) {
        if (!item || !item.category) return false;
        if (item.type === "Weapon" && typeof pickWeaponXiuxianName === "function") {
            var wn = pickWeaponXiuxianName(item.category);
            if (!wn) return false;
            item.weaponName = "秘卷·" + wn;
            return true;
        }
        if (
            (item.type === "Necklace" || item.type === "Ring") &&
            typeof pickAccessoryXiuxianName === "function"
        ) {
            var an = pickAccessoryXiuxianName(item.category);
            if (!an) return false;
            item.accessoryName = "秘卷·" + an;
            return true;
        }
        if (typeof pickDefenseXiuxianName === "function") {
            var dn = pickDefenseXiuxianName(item.category);
            if (!dn) return false;
            item.defenseName = "秘卷·" + dn;
            return true;
        }
        return false;
    }

    /** 宝图遗器：按图层数封顶并修正词条（与 normalizeOneEquipmentItemFloorCap 一致） */
    function normalizeTreasureMapDropEquipmentStats(item, mapLayer) {
        if (!item || !item.treasureMapDrop || !Array.isArray(item.stats) || !item.stats.length) return false;
        if (typeof normalizeOneEquipmentItemFloorCap !== "function") return false;
        var L = Math.max(1, Math.min(100, Math.floor(Number(mapLayer) || 0)));
        if (!(item.dungeonDropFloor >= 1)) {
            if (L > 0) {
                item.dungeonDropFloor = L;
            } else if (typeof item.lvl === "number" && item.lvl > 0) {
                var per =
                    typeof DUNGEON_EQUIP_MAX_LVL_PER_FLOOR === "number" && DUNGEON_EQUIP_MAX_LVL_PER_FLOOR > 0
                        ? DUNGEON_EQUIP_MAX_LVL_PER_FLOOR
                        : 5;
                item.dungeonDropFloor = Math.max(1, Math.ceil(item.lvl / per));
            }
        }
        if (!(item.statRollLoops >= 1) && typeof inferEquipmentStatRollLoopsFromRarity === "function") {
            item.statRollLoops = inferEquipmentStatRollLoopsFromRarity(item.rarity);
        }
        var before = JSON.stringify(item.stats) + "|" + (typeof item.value === "number" ? item.value : 0);
        normalizeOneEquipmentItemFloorCap(item);
        var after = JSON.stringify(item.stats) + "|" + (typeof item.value === "number" ? item.value : 0);
        return before !== after;
    }

    /** 修复宝图旧掉落：专名 + 属性封顶（与秘境掉落一致） */
    window.repairTreasureMapDropEquipmentNames = function (pl, mapLayerHint) {
        var target = pl || (typeof player !== "undefined" ? player : null);
        if (!target || !target.inventory || !Array.isArray(target.inventory.equipment)) return 0;
        var n = 0;
        for (var i = 0; i < target.inventory.equipment.length; i++) {
            var raw = target.inventory.equipment[i];
            var item;
            try {
                item = typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch (eParse) {
                continue;
            }
            if (!item || !item.treasureMapDrop) continue;
            var changed = false;
            if (treasureMapEquipNeedsNameFix(item) && applyTreasureMapEquipDisplayName(item)) {
                changed = true;
            }
            if (normalizeTreasureMapDropEquipmentStats(item, mapLayerHint)) {
                changed = true;
            }
            if (changed) {
                target.inventory.equipment[i] = JSON.stringify(item);
                n += 1;
            }
        }
        return n;
    };

    function buildTreasureCardFxHtml(fxTier) {
        var t = Math.max(1, Math.min(5, Math.floor(Number(fxTier) || 1)));
        var h =
            '<div class="dt-treasure-card__glow" aria-hidden="true"></div>' +
            '<div class="dt-treasure-card__shine" aria-hidden="true"></div>';
        if (t >= 2) h += '<div class="dt-treasure-card__rim" aria-hidden="true"></div>';
        if (t >= 3) h += '<div class="dt-treasure-card__aura" aria-hidden="true"></div>';
        if (t >= 4) h += '<div class="dt-treasure-card__sparks" aria-hidden="true"></div>';
        if (t >= 5) {
            h +=
                '<div class="dt-treasure-card__halo" aria-hidden="true"></div>' +
                '<div class="dt-treasure-card__prism" aria-hidden="true"></div>';
        }
        return h;
    }

    var state = {
        maps: [],
        qualities: QUALITIES,
        maxMaps: 200,
        filterId: "all",
        batchMode: false,
        selectedIds: {},
    };
    var discardConfirmMode = "single";
    var discardConfirmMapIds = [];

    function api(method, path, body) {
        if (typeof window.dongtianTreasureMapIsLocalMode === "function" && window.dongtianTreasureMapIsLocalMode()) {
            if (typeof window.dongtianTreasureMapLocalApi === "function") {
                return window.dongtianTreasureMapLocalApi(method, path, body);
            }
            return Promise.reject(new Error("单机藏宝图模块未加载"));
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
        clearTimeout(el._dtTreasureT);
        el._dtTreasureT = setTimeout(function () {
            el.style.display = "none";
        }, isErr ? 3600 : 4200);
    }

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function qualityById(id) {
        var qs = state.qualities && state.qualities.length ? state.qualities : QUALITIES;
        for (var i = 0; i < qs.length; i++) {
            if (qs[i].id === id) return qs[i];
        }
        for (var j = 0; j < QUALITIES.length; j++) {
            if (QUALITIES[j].id === id) return QUALITIES[j];
        }
        return qs[0] || QUALITIES[0];
    }

    function syncMapsFromPlayer() {
        if (typeof player !== "undefined" && player && Array.isArray(player.dongtianTreasureMaps)) {
            state.maps = player.dongtianTreasureMaps.slice();
        }
    }

    function isTreasureMapLocalMode() {
        return (
            typeof window.dongtianTreasureMapIsLocalMode === "function" && window.dongtianTreasureMapIsLocalMode()
        );
    }

    function getTreasureMapDropChancePctText() {
        var ch =
            typeof window.TREASURE_MAP_DROP_CHANCE === "number" && isFinite(window.TREASURE_MAP_DROP_CHANCE)
                ? window.TREASURE_MAP_DROP_CHANCE
                : 0.03;
        var pct = ch * 100;
        return pct % 1 === 0 ? String(Math.round(pct)) : String(Math.round(pct * 10) / 10);
    }

    function getTreasureMapEmptyHintText() {
        if (isTreasureMapLocalMode()) {
            return "匣中空无一图。秘境击杀邪修有 <strong>" + getTreasureMapDropChancePctText() + "%</strong> 概率显化秘卷。";
        }
        return "匣中空无一图。黄枫谷通关或他人馈赠可得秘卷。";
    }

    function renderTreasureDropRules() {
        var el = document.getElementById("dtTreasureRulesContent");
        if (!el) return;
        if (isTreasureMapLocalMode()) {
            var pct = getTreasureMapDropChancePctText();
            el.innerHTML =
                "<p>一层图对应秘境一层属性；图卷层数 = 获得时所在秘境层。</p>" +
                "<p><strong>获取</strong>：秘境斗法击杀邪修时，有 <strong>" +
                pct +
                "%</strong> 概率显化藏宝图。品质：残简 50%、锦绘 33%、玉篆 10%、玄灵 5%、神古 2%。</p>" +
                "<p><strong>同类 3% 掉落</strong>：神萃石、御器材料包各独立 <strong>3%</strong> 判定（与藏宝图同批额外 roll，互不占用）。</p>" +
                "<p><strong>不触发</strong>：置之不理连战 5 场、登龙塔/魔神塔等特殊战斗；匣中已满（200 张）则不入匣。</p>" +
                "<p><strong>启图奖励</strong>：斩煞成功 <strong>100%</strong> 随机遗器，品阶依图卷品质；秘卷遗器气血/力道/护体 <strong>+20%</strong>，等级 Lv.(层×4)–(层×5)。</p>";
            return;
        }
        el.innerHTML =
            "<p>一层图对应秘境一层属性。</p>" +
            "<p>挑战成功 <strong>100%</strong> 随机遗器，品阶依图卷品质而定。</p>" +
            "<p>黄枫谷通关可得残卷，房主每关 <strong>×3</strong>、助战 <strong>×1</strong>（助战每周期 <strong>20</strong> 次）。</p>";
    }

    function pullState() {
        return api("GET", "/api/dongtian-treasure-map/state", undefined).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.message) || "读取失败");
            state.maps = res.maps || [];
            state.maxMaps = res.maxMaps || 200;
            if (res.qualities && res.qualities.length) state.qualities = res.qualities;
            if (typeof player !== "undefined" && player) {
                player.dongtianTreasureMaps = state.maps.slice();
            }
            return res;
        });
    }

    function getQualityList() {
        if (!state.qualities || !state.qualities.length) return QUALITIES;
        return state.qualities.map(function (sq) {
            var local = null;
            for (var i = 0; i < QUALITIES.length; i++) {
                if (QUALITIES[i].id === sq.id) {
                    local = QUALITIES[i];
                    break;
                }
            }
            if (!local) return sq;
            var merged = {};
            for (var k in local) {
                if (Object.prototype.hasOwnProperty.call(local, k)) merged[k] = local[k];
            }
            for (var j in sq) {
                if (Object.prototype.hasOwnProperty.call(sq, j)) merged[j] = sq[j];
            }
            return merged;
        });
    }

    function mapsFiltered() {
        var fid = state.filterId || "all";
        if (fid === "all") return state.maps.slice();
        return state.maps.filter(function (m) {
            return m && String(m.qualityId) === fid;
        });
    }

    function renderFilterBar() {
        var bar = document.getElementById("dtTreasureFilterBar");
        if (!bar) return;
        var qs = getQualityList();
        var chips =
            '<button type="button" class="dt-treasure-filter__chip' +
            (state.filterId === "all" ? " is-active" : "") +
            '" data-filter="all" role="tab" aria-selected="' +
            (state.filterId === "all" ? "true" : "false") +
            '">全部 <span class="dt-treasure-filter__n">' +
            state.maps.length +
            "</span></button>";
        chips += qs
            .map(function (q) {
                var n = state.maps.filter(function (m) {
                    return m && m.qualityId === q.id;
                }).length;
                var active = state.filterId === q.id;
                return (
                    '<button type="button" class="dt-treasure-filter__chip dt-treasure-filter__chip--' +
                    escHtml(q.id) +
                    (active ? " is-active" : "") +
                    '" data-filter="' +
                    escHtml(q.id) +
                    '" role="tab" aria-selected="' +
                    (active ? "true" : "false") +
                    '">' +
                    escHtml(q.short) +
                    ' <span class="dt-treasure-filter__n">' +
                    n +
                    "</span></button>"
                );
            })
            .join("");
        bar.innerHTML = chips;
        var hint = document.getElementById("dtTreasureFilterHint");
        if (hint) {
            var shown = mapsFiltered().length;
            if (state.filterId === "all") {
                hint.textContent = "显示全部";
            } else {
                var qn = qualityById(state.filterId);
                hint.textContent = "筛选「" + qn.short + "」· " + shown + " 张";
            }
        }
    }

    function renderLegend() {
        var ul = document.getElementById("dtTreasureQualityLegend");
        if (!ul) return;
        var qs = getQualityList();
        ul.innerHTML = qs
            .map(function (q) {
                var active = state.filterId === q.id;
                return (
                    '<li class="dt-treasure-quality-li dt-treasure-quality-li--' +
                    escHtml(q.id) +
                    (active ? " is-active" : "") +
                    '" data-filter-pick="' +
                    escHtml(q.id) +
                    '" role="button" tabindex="0" title="点击筛选">' +
                    '<span class="dt-treasure-quality-li__glyph">' +
                    escHtml(q.glyph) +
                    '</span><span class="dt-treasure-quality-li__name">' +
                    escHtml(q.name) +
                    '</span><span class="dt-treasure-quality-li__tier">' +
                    escHtml(q.tier) +
                    "</span></li>"
                );
            })
            .join("");
    }

    function selectedIdList() {
        return Object.keys(state.selectedIds).filter(function (id) {
            return state.selectedIds[id];
        });
    }

    function pruneSelectionToExisting() {
        var next = {};
        var idSet = {};
        for (var i = 0; i < state.maps.length; i++) {
            if (state.maps[i] && state.maps[i].id) idSet[String(state.maps[i].id)] = true;
        }
        var keys = Object.keys(state.selectedIds);
        for (var j = 0; j < keys.length; j++) {
            if (idSet[keys[j]]) next[keys[j]] = true;
        }
        state.selectedIds = next;
    }

    function clearSelection() {
        state.selectedIds = {};
        updateBatchBar();
    }

    function toggleSelectMap(mapId, on) {
        if (!mapId) return;
        var id = String(mapId);
        if (on === false || (on !== true && state.selectedIds[id])) {
            delete state.selectedIds[id];
        } else {
            state.selectedIds[id] = true;
        }
        updateBatchBar();
        renderList();
    }

    function selectAllFiltered() {
        mapsFiltered().forEach(function (m) {
            if (m && m.id) state.selectedIds[String(m.id)] = true;
        });
        updateBatchBar();
        renderList();
    }

    function setBatchMode(on) {
        state.batchMode = !!on;
        if (!state.batchMode) clearSelection();
        var bar = document.getElementById("dtTreasureBatchBar");
        var btn = document.getElementById("dtTreasureBatchModeBtn");
        if (bar) bar.style.display = state.batchMode ? "flex" : "none";
        if (btn) btn.textContent = state.batchMode ? "退出批量" : "批量选择";
        renderToolbarExtras();
        renderList();
    }

    function updateBatchBar() {
        var cntEl = document.getElementById("dtTreasureBatchCount");
        var discardBtn = document.getElementById("dtTreasureBatchDiscardBtn");
        var n = selectedIdList().length;
        if (cntEl) cntEl.textContent = "已选 " + n + " 张";
        if (discardBtn) discardBtn.disabled = n < 1;
    }

    function renderToolbarExtras() {
        var tierBtn = document.getElementById("dtTreasureDiscardTierBtn");
        if (!tierBtn) return;
        var fid = state.filterId || "all";
        var n = fid === "all" ? 0 : mapsFiltered().length;
        var showTier = fid !== "all" && n > 0 && !state.batchMode;
        tierBtn.style.display = showTier ? "inline-flex" : "none";
        if (showTier) {
            var qn = qualityById(fid);
            tierBtn.textContent = "丢弃本阶(" + n + ")";
            tierBtn.title = "丢弃当前「" + qn.short + "」品阶下的全部 " + n + " 张藏宝图";
        }
    }

    function setFilter(filterId) {
        state.filterId = filterId || "all";
        clearSelection();
        renderFilterBar();
        renderLegend();
        renderToolbarExtras();
        renderList();
    }

    function renderList() {
        var list = document.getElementById("dtTreasureMapList");
        var cnt = document.getElementById("dtTreasureMapCount");
        if (cnt) cnt.textContent = String(state.maps.length);
        renderFilterBar();
        renderToolbarExtras();
        updateBatchBar();
        if (!list) return;
        if (!state.maps.length) {
            list.innerHTML = '<p class="dt-treasure-empty">' + getTreasureMapEmptyHintText() + "</p>";
            return;
        }
        var filtered = mapsFiltered();
        if (!filtered.length) {
            list.innerHTML =
                '<p class="dt-treasure-empty">当前筛选下无藏宝图，可切换「全部」或其它品质。</p>';
            return;
        }
        var sorted = filtered.slice().sort(function (a, b) {
            if (a.layer !== b.layer) return b.layer - a.layer;
            var oa = getQualityList().findIndex(function (x) {
                return x.id === a.qualityId;
            });
            var ob = getQualityList().findIndex(function (x) {
                return x.id === b.qualityId;
            });
            return ob - oa;
        });
        list.innerHTML = sorted
            .map(function (m) {
                var q = qualityById(m.qualityId);
                var lvlMin = m.layer * 4;
                var lvlMax = m.layer * 5;
                var color = q.color || "#8b6914";
                var fxTier = treasureCardFxTier(q);
                var mapIdStr = String(m.id);
                var checked = !!state.selectedIds[mapIdStr];
                var batchCls = state.batchMode ? " dt-treasure-card--batch" : "";
                var selCls = checked ? " is-selected" : "";
                var checkHtml = state.batchMode
                    ? '<label class="dt-treasure-card__check" title="勾选以批量丢弃">' +
                      '<input type="checkbox" class="dt-treasure-card__check-input" data-select-map="' +
                      escHtml(m.id) +
                      '"' +
                      (checked ? " checked" : "") +
                      ' aria-label="选中此图" />' +
                      "<span>勾选</span></label>"
                    : "";
                var actionsHtml = state.batchMode
                    ? ""
                    : '<div class="dt-treasure-card__actions">' +
                      '<button type="button" class="btn btn--sm dt-treasure-card__use" data-use-map="' +
                      escHtml(m.id) +
                      '">启图斩煞</button>' +
                      '<button type="button" class="btn btn--sm btn--ghost dt-treasure-card__discard" data-discard-map="' +
                      escHtml(m.id) +
                      '">丢弃</button>' +
                      "</div>";
                return (
                    '<article class="dt-treasure-card dt-treasure-card--' +
                    escHtml(q.id) +
                    batchCls +
                    selCls +
                    '" role="listitem" data-map-id="' +
                    escHtml(m.id) +
                    '" data-fx-tier="' +
                    fxTier +
                    '" style="--dt-tm-glow:' +
                    escHtml(color) +
                    ';--dt-tm-tier:' +
                    fxTier +
                    '">' +
                    buildTreasureCardFxHtml(fxTier) +
                    checkHtml +
                    '<div class="dt-treasure-card__seal" aria-hidden="true"><span>' +
                    escHtml(q.glyph) +
                    "</span></div>" +
                    '<div class="dt-treasure-card__body">' +
                    '<h5 class="dt-treasure-card__title">' +
                    escHtml(q.name) +
                    "</h5>" +
                    '<p class="dt-treasure-card__layer">秘境 <strong>' +
                    escHtml(m.layer) +
                    "</strong> 层 · 遗器 Lv." +
                    lvlMin +
                    "–" +
                    lvlMax +
                    "</p>" +
                    '<p class="dt-treasure-card__hint">守煞为宝图劫主，斩之必得秘卷遗器（血攻防 +20%）</p>' +
                    actionsHtml +
                    "</div></article>"
                );
            })
            .join("");
    }

    function openModal() {
        var m = document.getElementById("dongtianTreasureMapModal");
        if (!m) return;
        if (typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie()) {
            if (typeof window.dongtianHubHighJieBlockAlert === "function") {
                window.dongtianHubHighJieBlockAlert("藏宝图");
            }
            return;
        }
        renderLegend();
        renderFilterBar();
        renderToolbarExtras();
        renderTreasureDropRules();
        var emptyHintEl = document.getElementById("dtTreasureMapEmptyHint");
        if (emptyHintEl) emptyHintEl.innerHTML = getTreasureMapEmptyHintText();
        pullState()
            .then(function () {
                pruneSelectionToExisting();
                renderList();
                m.style.display = "flex";
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            });
    }

    function closeModal() {
        var m = document.getElementById("dongtianTreasureMapModal");
        if (m) m.style.display = "none";
    }

    window.openDongtianTreasureMapModal = openModal;

    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function molongTokenToSeed(tok) {
        var s = 0;
        var str = String(tok || "");
        for (var i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
        return s || 1;
    }

    window.buildTreasureMapEnemy = function (layer, bossName, enemyRule) {
        if (typeof dungeon === "undefined" || !dungeon || typeof generateRandomEnemy !== "function") {
            throw new Error("秘境模块未就绪");
        }
        var floorBak = dungeon.progress.floor;
        var roomBak = dungeon.progress.room;
        var scaleBak = dungeon.settings.enemyScaling;
        var emBak = dungeon.enemyMultipliers ? JSON.parse(JSON.stringify(dungeon.enemyMultipliers)) : null;
        try {
            var rule = enemyRule && typeof enemyRule === "object" ? enemyRule : null;
            var L = Math.max(1, Math.min(100, Math.floor(Number(layer) || 1)));
            var floorFor = rule && isFinite(rule.floor) ? Math.max(1, Math.min(100, Math.floor(Number(rule.floor)))) : L;
            dungeon.progress.floor = floorFor;
            dungeon.progress.room = rule && isFinite(rule.jie) ? Math.max(1, Math.floor(Number(rule.jie))) : 20;
            dungeon.settings.enemyScaling = rule && isFinite(rule.enemyScaling) ? Number(rule.enemyScaling) : 1.2;
            generateRandomEnemy("treasuremap");
            if (rule && isFinite(rule.enemyLevel)) {
                enemy.lvl = Math.max(1, Math.floor(Number(rule.enemyLevel)));
            } else {
                enemy.lvl = 5 * L;
            }
            if (typeof setEnemyStats === "function") setEnemyStats(enemy.type, "treasuremap");
            enemy.name = bossName && String(bossName).trim() ? String(bossName).trim() : "秘卷守煞";
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

    function hideOverlaysForTreasureCombat() {
        if (typeof window.hideMolongHallModal === "function") {
            try {
                window.hideMolongHallModal();
            } catch (eMh) {}
        }
        if (typeof window.closeDongtianHubMenuModal === "function") {
            try {
                window.closeDongtianHubMenuModal();
            } catch (eHub) {}
        }
        closeModal();
    }

    window.beginTreasureMapBattle = function (res) {
        if (!res || !res.token) return;
        try {
            if (typeof window !== "undefined") {
                window.__treasureMapCombatSettling = false;
                window.__treasureMapAwaitingClaim = false;
                window.__treasureMapCombatEndLock = "";
                window.__treasureMapFinishedTok = "";
            }
        } catch (eNew) {}
        if (typeof player !== "undefined" && player && player.inCombat) {
            try {
                if (typeof endCombat === "function") endCombat();
            } catch (eEndPrev) {}
        }
        hideOverlaysForTreasureCombat();
        if (typeof window.stashDungeonMainlineBeforeTreasureMapSide === "function") {
            window.stashDungeonMainlineBeforeTreasureMapSide();
        }
        if (typeof window.forceDungeonHubIdleForTreasureMapSide === "function") {
            window.forceDungeonHubIdleForTreasureMapSide();
        }
        window.__dongtianActiveTreasureMapToken = String(res.token);
        window.__treasureMapCombatMeta = {
            token: res.token,
            layer: res.layer,
            qualityId: res.qualityId,
            qualityName: res.qualityName || qualityById(res.qualityId).name,
        };
        if (typeof player !== "undefined" && player && res.pending && typeof res.pending === "object" && res.pending.token) {
            player.dongtianTreasureMapPending = res.pending;
        }
        try {
            if (typeof enemyDead !== "undefined") enemyDead = false;
            if (typeof playerDead !== "undefined") playerDead = false;
        } catch (eDeadClr) {}
        try {
            if (typeof clearCombatAttackChains === "function") clearCombatAttackChains();
        } catch (eChainClr) {}
        try {
            if (typeof clearCombatTimerSyncOnly === "function") clearCombatTimerSyncOnly();
            else if (typeof player !== "undefined" && player && player.combatTimerSync) delete player.combatTimerSync;
        } catch (eSyncClr) {}
        if (typeof enemy !== "undefined" && enemy) {
            enemy.molongRaid = null;
            enemy.wushenArena = null;
            enemy.dragonTower = null;
            enemy.demonTower = null;
            enemy.divineRealm = null;
            enemy.spiritBeastRealm = null;
            enemy.ghostRealm = null;
            enemy.treasureMapBattle = null;
        }
        var rngSeed =
            res.battleRngSeed !== undefined && res.battleRngSeed !== null
                ? Number(res.battleRngSeed)
                : molongTokenToSeed(res.token);
        if (typeof molongBeginSeededRngCombat === "function") {
            molongBeginSeededRngCombat(rngSeed);
        }
        if (typeof window.buildTreasureMapEnemy === "function") {
            window.buildTreasureMapEnemy(res.layer, res.bossName, res.enemyRule);
        }
        enemy.treasureMapBattle = {
            token: res.token,
            layer: res.layer,
            qualityId: res.qualityId,
            qualityName: res.qualityName || qualityById(res.qualityId).name,
        };
        if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
            dungeon.status.event = false;
        }
        if (typeof window.forceDungeonHubIdleForTreasureMapSide === "function") {
            window.forceDungeonHubIdleForTreasureMapSide();
        }
        if (typeof showCombatInfo === "function") showCombatInfo();
        if (typeof startCombat === "function") startCombat();
        if (typeof window.startTreasureMapCombatWatchdog === "function") {
            window.startTreasureMapCombatWatchdog();
        }
    };

    var treasureMapCompleteInFlight = null;

    window.finishTreasureMapCombat = function (won, token) {
        var tok = bodyStr(token);
        if (!tok) {
            toast("缺少战斗凭证", true);
            return Promise.resolve();
        }
        try {
            if (typeof window !== "undefined" && window.__treasureMapFinishedTok === tok) {
                return Promise.resolve();
            }
        } catch (eDone) {}
        if (treasureMapCompleteInFlight === tok) {
            return treasureMapCompleteInFlight;
        }
        if (typeof window.cleanupTreasureMapCombatSession === "function") {
            window.cleanupTreasureMapCombatSession({ endCombat: false, restoreDungeonEnemy: true });
        }
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        try {
            if (typeof window !== "undefined") window.__treasureMapCompleteInFlight = tok;
        } catch (eFl) {}
        treasureMapCompleteInFlight = tok;
        function treasureMapGrantApplyOpts(tmLayerForApply) {
            return {
                fromTreasureMapComplete: true,
                treasureMapLayer: tmLayerForApply || 0,
                forceServerPlayer: true,
                fromServerMutation: true,
                respectServerInventoryAuthority: true,
                preferLocalDungeonIfAhead: true,
                skipPreFlush: true,
            };
        }

        function treasureMapCompleteHasGrantPayload(completeRes, completeTok, didWin) {
            if (!didWin || !completeRes || !completeRes.data || !completeRes.data.player) return false;
            return bodyStr(completeRes.data.player.dongtianTreasureMapLastCompleteToken) === bodyStr(completeTok);
        }

        function adoptTreasureMapGrantFromPayload(grantData) {
            if (
                grantData &&
                grantData.player &&
                typeof window.dongtianAdoptServerInventoryIfLonger === "function"
            ) {
                try {
                    window.dongtianAdoptServerInventoryIfLonger(grantData.player);
                } catch (eAdoptTm) {}
            }
        }

        function pullTreasureMapGrantFromServer(tmLayerForPull) {
            var applyOpts = treasureMapGrantApplyOpts(tmLayerForPull);
            if (typeof window.dongtianReloadSaveAfterServerGrant === "function") {
                return window.dongtianReloadSaveAfterServerGrant(applyOpts);
            }
            if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
                return window.dongtianPullServerSaveAfterMutation(applyOpts);
            }
            return Promise.resolve(false);
        }
        return api("POST", "/api/dongtian-treasure-map/battle/complete", {
            token: tok,
            won: !!won,
        })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "结算失败");
                if (window.DONGTIAN_CLOUD_MODE) {
                    if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
                        window.dongtianCancelCloudSaveInFlight();
                    } else if (typeof window.dongtianCancelBeforeServerPull === "function") {
                        window.dongtianCancelBeforeServerPull();
                    } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
                        window.cancelPendingDongtianCloudSave();
                    }
                    if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                        window.dongtianSyncRevisionFromApiResponse(res);
                    } else if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
                        window.dongtianSyncRevisionFromTradeApi(res);
                    }
                }
                var tmLayer =
                    res.reward && res.reward.dungeonDropFloor
                        ? Number(res.reward.dungeonDropFloor)
                        : window.__treasureMapCombatMeta && window.__treasureMapCombatMeta.layer
                          ? Number(window.__treasureMapCombatMeta.layer)
                          : 0;
                var grantApplyOpts = treasureMapGrantApplyOpts(tmLayer);

                function refreshTreasureMapWinInventoryUi() {
                    if (!won) return;
                    if (player && player.inventory) player.inventory.bagTab = "equip";
                    if (typeof window.repairTreasureMapDropEquipmentNames === "function") {
                        try {
                            window.repairTreasureMapDropEquipmentNames(player, tmLayer);
                        } catch (eTmFixUi) {}
                    }
                    if (typeof showEquipment === "function") showEquipment();
                    if (typeof showInventory === "function") showInventory();
                    if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
                }

                function showTreasureMapSettleFeedback() {
                    syncMapsFromPlayer();
                    renderList();
                    if (res.alreadyClaimed) {
                        toast(res.message || "奖励已发放", false);
                    } else if (won) {
                        toast(res.message || "遗器已纳入行囊", false);
                        if (typeof addDungeonLog === "function") {
                            addDungeonLog(
                                '<span class="Legendary">【藏宝图】' +
                                    (window.DONGTIAN_CLOUD_MODE ? "服务端已发奖：" : "已发奖：") +
                                    "</span>" +
                                    (res.message || "遗器已纳入行囊，请检视行囊遗器分页。")
                            );
                            if (typeof updateDungeonLog === "function") updateDungeonLog();
                        }
                    } else {
                        toast(res.message || "挑战未果", false);
                        if (typeof window.openDongtianTreasureMapModal === "function") {
                            setTimeout(function () {
                                try {
                                    window.openDongtianTreasureMapModal();
                                } catch (eOpenL) {}
                            }, 0);
                        }
                    }
                }

                function applyTreasureMapPayloadAndUi() {
                    if (res.data && typeof window.dongtianApplyServerPayload === "function") {
                        window.dongtianApplyServerPayload(res.data, grantApplyOpts);
                        adoptTreasureMapGrantFromPayload(res.data);
                    } else if (typeof window.restoreDungeonHubAfterTreasureMap === "function") {
                        window.restoreDungeonHubAfterTreasureMap();
                    }
                    refreshTreasureMapWinInventoryUi();
                    showTreasureMapSettleFeedback();
                }

                var syncP;
                if (
                    window.DONGTIAN_CLOUD_MODE &&
                    won &&
                    treasureMapCompleteHasGrantPayload(res, tok, won)
                ) {
                    /** complete 回包已含发奖后存档：勿再 GET 拉档，避免陈旧云档覆盖刚写入的遗器 */
                    applyTreasureMapPayloadAndUi();
                    syncP = Promise.resolve(true);
                } else if (window.DONGTIAN_CLOUD_MODE) {
                    syncP = pullTreasureMapGrantFromServer(tmLayer).then(function (pulled) {
                        if (!pulled && res.data) {
                            applyTreasureMapPayloadAndUi();
                            return;
                        }
                        if (pulled) {
                            adoptTreasureMapGrantFromPayload(res.data);
                            if (typeof window.restoreDungeonHubAfterTreasureMap === "function") {
                                window.restoreDungeonHubAfterTreasureMap();
                            }
                            refreshTreasureMapWinInventoryUi();
                            showTreasureMapSettleFeedback();
                        }
                    });
                } else {
                    applyTreasureMapPayloadAndUi();
                    syncP = Promise.resolve(true);
                }
                return syncP.then(function () {
                hideOverlaysForTreasureCombat();
                var dimDungeon = document.querySelector("#dungeon-main");
                if (dimDungeon) {
                    dimDungeon.style.filter = "brightness(100%)";
                    if (typeof runLoad === "function") runLoad("dungeon-main", "flex");
                }
                if (typeof window.openDongtianTreasureMapModal === "function") {
                    setTimeout(function () {
                        try {
                            window.openDongtianTreasureMapModal();
                        } catch (eOpen) {}
                    }, 0);
                }
                return pullState().then(renderList);
                });
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            })
            .finally(function () {
                if (treasureMapCompleteInFlight === tok) treasureMapCompleteInFlight = null;
                try {
                    if (typeof window !== "undefined") {
                        window.__treasureMapFinishedTok = tok;
                        window.__treasureMapAwaitingClaim = false;
                        window.__treasureMapCompleteInFlight = "";
                    }
                } catch (eFt) {}
                if (typeof window.releaseTreasureMapCombatSettling === "function") {
                    window.releaseTreasureMapCombatSettling();
                }
            });
    };

    function bodyStr(v) {
        return v != null ? String(v).trim() : "";
    }

    var treasureMapUseInFlight = false;
    var treasureMapDiscardInFlight = false;
    function closeDiscardConfirm() {
        var modal = document.getElementById("dtTreasureDiscardConfirmModal");
        if (modal) modal.style.display = "none";
        discardConfirmMode = "single";
        discardConfirmMapIds = [];
    }

    function buildDiscardPreviewCard(m, q) {
        var color = q.color || "#8b6914";
        var lvlMin = m.layer * 4;
        var lvlMax = m.layer * 5;
        return (
            '<div class="dt-discard-confirm-card dt-discard-confirm-card--' +
            escHtml(q.id) +
            '" style="--dt-tm-glow:' +
            escHtml(color) +
            '">' +
            '<span class="dt-discard-confirm-card__seal">' +
            escHtml(q.glyph || (q.short ? q.short.charAt(0) : "图")) +
            "</span>" +
            '<div class="dt-discard-confirm-card__body">' +
            "<strong>" +
            escHtml(q.name) +
            "</strong>" +
            '<span class="dt-discard-confirm-card__meta">秘境 ' +
            escHtml(m.layer) +
            " 层 · 遗器 Lv." +
            lvlMin +
            "–" +
            lvlMax +
            "</span></div></div>"
        );
    }

    function showDiscardConfirmForMaps(mapIds, titleText, descText) {
        var ids = (mapIds || []).map(function (id) {
            return String(id);
        });
        if (!ids.length) {
            toast("请先勾选要丢弃的藏宝图", true);
            return;
        }
        var maps = [];
        for (var i = 0; i < ids.length; i++) {
            for (var j = 0; j < state.maps.length; j++) {
                if (state.maps[j] && String(state.maps[j].id) === ids[i]) {
                    maps.push(state.maps[j]);
                    break;
                }
            }
        }
        if (!maps.length) {
            toast("藏宝图不存在或已使用", true);
            renderList();
            return;
        }
        var modal = document.getElementById("dtTreasureDiscardConfirmModal");
        var preview = document.getElementById("dtDiscardConfirmPreview");
        var titleEl = document.getElementById("dtDiscardConfirmTitle");
        var descEl = document.getElementById("dtDiscardConfirmDesc");
        var okBtn = document.getElementById("dtTreasureDiscardOkBtn");
        if (!modal || !preview) {
            if (typeof confirm !== "undefined" && confirm("确定丢弃 " + maps.length + " 张藏宝图？\n丢弃后不可恢复。")) {
                executeDiscardMaps(ids);
            }
            return;
        }
        discardConfirmMode = ids.length > 1 ? "batch" : "single";
        discardConfirmMapIds = ids.slice();
        if (titleEl) titleEl.textContent = titleText || (ids.length > 1 ? "确认批量丢弃" : "确认丢弃藏宝图");
        if (descEl) {
            descEl.textContent =
                descText ||
                (ids.length > 1
                    ? "将丢弃 " + ids.length + " 张藏宝图，丢弃后不可恢复，秘卷永散于劫尘。"
                    : "丢弃后不可恢复，秘卷将永散于劫尘。");
        }
        if (okBtn) okBtn.textContent = ids.length > 1 ? "确认丢弃 " + ids.length + " 张" : "确认丢弃";
        var previewHtml = "";
        var showN = Math.min(3, maps.length);
        for (var p = 0; p < showN; p++) {
            previewHtml += buildDiscardPreviewCard(maps[p], qualityById(maps[p].qualityId));
        }
        if (maps.length > showN) {
            previewHtml +=
                '<p class="dt-discard-confirm-more">另有 ' + (maps.length - showN) + " 张未列出…</p>";
        }
        preview.innerHTML = previewHtml;
        modal.style.display = "flex";
    }

    function showDiscardConfirm(mapId) {
        showDiscardConfirmForMaps([mapId], "确认丢弃藏宝图", "丢弃后不可恢复，秘卷将永散于劫尘。");
    }

    function applyDiscardResponse(res) {
        if (res.data && typeof window.dongtianApplyServerPayload === "function") {
            window.dongtianApplyServerPayload(res.data, { forceServerPlayer: true, fromServerMutation: true });
        }
        if (res.maps) state.maps = res.maps.slice();
        syncMapsFromPlayer();
        pruneSelectionToExisting();
        renderList();
        toast(res.message || "已丢弃藏宝图", false);
    }

    function executeDiscardMaps(mapIds) {
        if (!mapIds || !mapIds.length || treasureMapDiscardInFlight || treasureMapUseInFlight) return;
        closeDiscardConfirm();
        treasureMapDiscardInFlight = true;
        var path = mapIds.length === 1 ? "/api/dongtian-treasure-map/discard" : "/api/dongtian-treasure-map/discard-batch";
        var body = mapIds.length === 1 ? { mapId: mapIds[0] } : { mapIds: mapIds };
        api("POST", path, body)
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "丢弃失败");
                applyDiscardResponse(res);
                if (state.batchMode && !selectedIdList().length) setBatchMode(false);
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            })
            .finally(function () {
                treasureMapDiscardInFlight = false;
            });
    }

    function executeDiscardMap(mapId) {
        executeDiscardMaps([mapId]);
    }

    function discardFilteredTier() {
        if (state.filterId === "all") {
            toast("请先点击上方品阶筛选（残简/锦绘等）", true);
            return;
        }
        var filtered = mapsFiltered();
        if (!filtered.length) {
            toast("当前品阶下无藏宝图", true);
            return;
        }
        var qn = qualityById(state.filterId);
        var ids = filtered.map(function (m) {
            return String(m.id);
        });
        showDiscardConfirmForMaps(
            ids,
            "丢弃「" + qn.short + "」品阶全部",
            "将丢弃当前筛选下的 " + ids.length + " 张「" + qn.name + "」，不可恢复。"
        );
    }

    function discardSelectedBatch() {
        var ids = selectedIdList();
        if (!ids.length) {
            toast("请先勾选要丢弃的藏宝图", true);
            return;
        }
        showDiscardConfirmForMaps(ids, "确认批量丢弃", "将丢弃已勾选的 " + ids.length + " 张藏宝图，不可恢复。");
    }

    function discardMap(mapId) {
        if (!mapId || treasureMapDiscardInFlight || treasureMapUseInFlight) return;
        var m = null;
        for (var i = 0; i < state.maps.length; i++) {
            if (state.maps[i] && String(state.maps[i].id) === String(mapId)) {
                m = state.maps[i];
                break;
            }
        }
        if (!m) {
            toast("藏宝图不存在或已使用", true);
            renderList();
            return;
        }
        showDiscardConfirm(mapId);
    }

    function useMap(mapId) {
        if (!mapId || treasureMapUseInFlight) return;
        treasureMapUseInFlight = true;
        api("POST", "/api/dongtian-treasure-map/use", { mapId: mapId })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || "启图失败");
                if (res.maps && Array.isArray(res.maps)) {
                    state.maps = res.maps.slice();
                } else {
                    state.maps = state.maps.filter(function (m) {
                        return String(m.id) !== String(mapId);
                    });
                }
                if (typeof player !== "undefined" && player) {
                    player.dongtianTreasureMaps = state.maps.slice();
                    if (res.pending && typeof res.pending === "object" && res.pending.token) {
                        player.dongtianTreasureMapPending = res.pending;
                    }
                }
                renderList();
                closeModal();
                if (res.data && typeof window.dongtianApplyServerPayload === "function") {
                    window.dongtianApplyServerPayload(res.data, {
                        forceServerPlayer: true,
                        fromServerMutation: true,
                    });
                }
                if (window.DONGTIAN_CLOUD_MODE && typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                    window.dongtianSyncRevisionFromApiResponse(res);
                }
                try {
                    if (typeof window.beginTreasureMapBattle === "function") {
                        window.beginTreasureMapBattle(res);
                    }
                } catch (eBattle) {
                    toast(eBattle.message || String(eBattle), true);
                }
            })
            .catch(function (e) {
                toast(e.message || String(e), true);
            })
            .finally(function () {
                treasureMapUseInFlight = false;
            });
    }

    function treasureMapBattleToken() {
        var tmb = enemy && enemy.treasureMapBattle;
        if (tmb && tmb.token) return String(tmb.token);
        try {
            return window.__dongtianActiveTreasureMapToken
                ? String(window.__dongtianActiveTreasureMapToken)
                : "";
        } catch (eT) {
            return "";
        }
    }

    function treasureMapHpValidation() {
        try {
            if (typeof window !== "undefined" && window.__treasureMapCombatSettling) return;
            if (typeof window !== "undefined" && window.__treasureMapAwaitingClaim) return;
        } catch (eSt) {}
        if (typeof enemyDead !== "undefined" && enemyDead) return;
        if (typeof window.repairTreasureMapCombatSession === "function") {
            window.repairTreasureMapCombatSession();
        }
        if (player.stats.hp < 1) player.stats.hp = 0;
        if (enemy.stats.hp < 1 && !enemyDead) {
            enemy.stats.hp = 0;
            enemyDead = true;
            try {
                if (typeof window !== "undefined") window.__treasureMapAwaitingClaim = true;
            } catch (eAw) {}
            if (typeof window.stopTreasureMapCombatWatchdog === "function") {
                window.stopTreasureMapCombatWatchdog();
            }
            if (typeof clearCombatAttackChains === "function") clearCombatAttackChains();
            addCombatLog('<span class="Legendary">宝图守煞崩解，匣中秘光冲霄——此卷已破！</span>');
            player.stats.hp += Math.round((player.stats.hpMax * 20) / 100);
            if (player.stats.hp > player.stats.hpMax) player.stats.hp = player.stats.hpMax;
            playerLoadStats();
            var winTok = treasureMapBattleToken();
            safeAttachBattleButtonClick(function () {
                if (!winTok) return;
                try {
                    if (window.__treasureMapCombatEndLock === winTok) return;
                    window.__treasureMapCombatEndLock = winTok;
                } catch (eLk) {}
                combatBacklog.length = 0;
                if (typeof molongPostRaidRestorePlayerForHub === "function") {
                    molongPostRaidRestorePlayerForHub();
                }
                if (typeof window.finishTreasureMapCombat === "function") {
                    window.finishTreasureMapCombat(true, winTok);
                }
            });
            endCombat();
            return;
        }
        if (player.stats.hp < 1 && !playerDead) {
            playerDead = true;
            addCombatLog('<span class="Common">气血不济，宝图凶煞未除。</span>');
            var loseTok = treasureMapBattleToken();
            safeAttachBattleButtonClick(function () {
                if (!loseTok) return;
                try {
                    if (window.__treasureMapCombatEndLock === loseTok) return;
                    window.__treasureMapCombatEndLock = loseTok;
                } catch (eLk2) {}
                combatBacklog.length = 0;
                if (typeof molongPostRaidRestorePlayerForHub === "function") {
                    molongPostRaidRestorePlayerForHub();
                }
                if (typeof window.finishTreasureMapCombat === "function") {
                    window.finishTreasureMapCombat(false, loseTok);
                }
            });
            endCombat();
        }
    }

    window.treasureMapHpValidation = treasureMapHpValidation;

    function initUi() {
        renderTreasureDropRules();
        var hubBtn = document.getElementById("dongtianHubMenuTreasureMapBtn");
        if (hubBtn && !hubBtn._dtTreasureBound) {
            hubBtn._dtTreasureBound = true;
            hubBtn.addEventListener("click", function () {
                var hub = document.getElementById("dongtianHubMenuModal");
                if (hub) hub.style.display = "none";
                openModal();
            });
        }
        var closeBtn = document.getElementById("dongtianTreasureMapCloseBtn");
        if (closeBtn) closeBtn.addEventListener("click", closeModal);
        var refreshBtn = document.getElementById("dtTreasureMapRefreshBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", function () {
                pullState()
                    .then(renderList)
                    .catch(function (e) {
                        toast(e.message || String(e), true);
                    });
            });
        }
        var filterBar = document.getElementById("dtTreasureFilterBar");
        if (filterBar && !filterBar._dtTreasureBound) {
            filterBar._dtTreasureBound = true;
            filterBar.addEventListener("click", function (ev) {
                var chip = ev.target && ev.target.closest ? ev.target.closest("[data-filter]") : null;
                if (!chip) return;
                var fid = chip.getAttribute("data-filter");
                if (!fid) return;
                setFilter(fid);
            });
        }
        var legend = document.getElementById("dtTreasureQualityLegend");
        if (legend && !legend._dtTreasureBound) {
            legend._dtTreasureBound = true;
            legend.addEventListener("click", function (ev) {
                var li = ev.target && ev.target.closest ? ev.target.closest("[data-filter-pick]") : null;
                if (!li) return;
                var fid = li.getAttribute("data-filter-pick");
                if (!fid) return;
                setFilter(state.filterId === fid ? "all" : fid);
            });
            legend.addEventListener("keydown", function (ev) {
                if (ev.key !== "Enter" && ev.key !== " ") return;
                var li = ev.target && ev.target.closest ? ev.target.closest("[data-filter-pick]") : null;
                if (!li) return;
                ev.preventDefault();
                var fid = li.getAttribute("data-filter-pick");
                if (!fid) return;
                setFilter(state.filterId === fid ? "all" : fid);
            });
        }
        var batchModeBtn = document.getElementById("dtTreasureBatchModeBtn");
        if (batchModeBtn && !batchModeBtn._dtTreasureBound) {
            batchModeBtn._dtTreasureBound = true;
            batchModeBtn.addEventListener("click", function () {
                setBatchMode(!state.batchMode);
            });
        }
        var selectAllBtn = document.getElementById("dtTreasureSelectAllBtn");
        if (selectAllBtn && !selectAllBtn._dtTreasureBound) {
            selectAllBtn._dtTreasureBound = true;
            selectAllBtn.addEventListener("click", selectAllFiltered);
        }
        var selectNoneBtn = document.getElementById("dtTreasureSelectNoneBtn");
        if (selectNoneBtn && !selectNoneBtn._dtTreasureBound) {
            selectNoneBtn._dtTreasureBound = true;
            selectNoneBtn.addEventListener("click", function () {
                clearSelection();
                renderList();
            });
        }
        var batchDiscardBtn = document.getElementById("dtTreasureBatchDiscardBtn");
        if (batchDiscardBtn && !batchDiscardBtn._dtTreasureBound) {
            batchDiscardBtn._dtTreasureBound = true;
            batchDiscardBtn.addEventListener("click", discardSelectedBatch);
        }
        var discardTierBtn = document.getElementById("dtTreasureDiscardTierBtn");
        if (discardTierBtn && !discardTierBtn._dtTreasureBound) {
            discardTierBtn._dtTreasureBound = true;
            discardTierBtn.addEventListener("click", discardFilteredTier);
        }
        var list = document.getElementById("dtTreasureMapList");
        if (list && !list._dtTreasureBound) {
            list._dtTreasureBound = true;
            list.addEventListener("click", function (ev) {
                var checkInp =
                    ev.target && ev.target.closest
                        ? ev.target.closest(".dt-treasure-card__check-input")
                        : null;
                if (checkInp) {
                    var sid = checkInp.getAttribute("data-select-map");
                    if (sid) toggleSelectMap(sid, checkInp.checked);
                    return;
                }
                if (state.batchMode) {
                    var card = ev.target && ev.target.closest ? ev.target.closest("[data-map-id]") : null;
                    if (card) {
                        var mid = card.getAttribute("data-map-id");
                        if (mid) toggleSelectMap(mid);
                    }
                    return;
                }
                var discardBtn =
                    ev.target && ev.target.closest ? ev.target.closest("[data-discard-map]") : null;
                if (discardBtn) {
                    var did = discardBtn.getAttribute("data-discard-map");
                    if (did) discardMap(did);
                    return;
                }
                var btn = ev.target && ev.target.closest ? ev.target.closest("[data-use-map]") : null;
                if (!btn) return;
                var id = btn.getAttribute("data-use-map");
                if (!id) return;
                useMap(id);
            });
            list.addEventListener("change", function (ev) {
                var inp = ev.target;
                if (!inp || !inp.classList || !inp.classList.contains("dt-treasure-card__check-input")) return;
                var sid = inp.getAttribute("data-select-map");
                if (sid) toggleSelectMap(sid, inp.checked);
            });
        }
        var modal = document.getElementById("dongtianTreasureMapModal");
        if (modal) {
            modal.addEventListener("click", function (ev) {
                if (ev.target === modal) closeModal();
            });
        }
        var discardConfirmModal = document.getElementById("dtTreasureDiscardConfirmModal");
        var discardCancelBtn = document.getElementById("dtTreasureDiscardCancelBtn");
        var discardOkBtn = document.getElementById("dtTreasureDiscardOkBtn");
        if (discardCancelBtn && !discardCancelBtn._dtTreasureBound) {
            discardCancelBtn._dtTreasureBound = true;
            discardCancelBtn.addEventListener("click", closeDiscardConfirm);
        }
        if (discardOkBtn && !discardOkBtn._dtTreasureBound) {
            discardOkBtn._dtTreasureBound = true;
            discardOkBtn.addEventListener("click", function () {
                if (discardConfirmMapIds && discardConfirmMapIds.length) {
                    executeDiscardMaps(discardConfirmMapIds);
                }
            });
        }
        if (discardConfirmModal && !discardConfirmModal._dtTreasureBound) {
            discardConfirmModal._dtTreasureBound = true;
            discardConfirmModal.addEventListener("click", function (ev) {
                if (ev.target === discardConfirmModal) closeDiscardConfirm();
            });
            document.addEventListener("keydown", function (ev) {
                if (ev.key !== "Escape") return;
                var dm = document.getElementById("dtTreasureDiscardConfirmModal");
                if (dm && dm.style.display === "flex") closeDiscardConfirm();
            });
        }
    }

    window.initDongtianTreasureMapUI = initUi;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initUi);
    } else {
        initUi();
    }
})();
