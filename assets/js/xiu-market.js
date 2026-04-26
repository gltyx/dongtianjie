/**
 * 洞天劫 · 修仙市场（仅嵌入主游戏联网模式）：联网币，装备/材料/灵宠，一口价与竞拍
 */
(function () {
    function api(method, path, body) {
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return req(method, path, body, true);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function getNetworkCoinAmount() {
        try {
            var fn = window.parent && window.parent.goldGameGetNetworkCoin;
            if (typeof fn !== "function") return Promise.resolve(0);
            return fn().then(function (res) {
                return res && typeof res.amount === "number" ? res.amount : 0;
            });
        } catch (e) {
            return Promise.resolve(0);
        }
    }

    function playerNameBody() {
        var n = typeof player !== "undefined" && player && player.name ? String(player.name) : "";
        return { playerName: n };
    }

    function reloadDongtianStateFromServer() {
        if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        window.__dongtianCloudReloading = true;
        return api("GET", "/api/dongtian-jie/save", undefined)
            .then(function (res) {
                if (!res || !res.ok || !res.data || !res.data.player) return;
                if (typeof window.dongtianApplyServerPayload === "function") {
                    window.dongtianApplyServerPayload(res.data);
                }
            })
            .finally(function () {
                window.__dongtianCloudReloading = false;
            });
    }

    var state = {
        page: 1,
        pageSize: 12,
        mine: false,
        filter: "",
        itemType: "",
        equipRarity: "",
        equipSlotType: "",
        equipLvlMin: "",
        equipLvlMax: "",
        petKind: "",
        petAgeTier: "",
    };
    var equipFilterDebounceTimer;

    function syncEquipFiltersFromDom() {
        var r = document.getElementById("xiuMarketEquipRarity");
        var st = document.getElementById("xiuMarketEquipSlotType");
        var mn = document.getElementById("xiuMarketEquipLvlMin");
        var mx = document.getElementById("xiuMarketEquipLvlMax");
        if (r) state.equipRarity = r.value || "";
        if (st) state.equipSlotType = st.value || "";
        if (mn) state.equipLvlMin = mn.value === "" ? "" : mn.value;
        if (mx) state.equipLvlMax = mx.value === "" ? "" : mx.value;
    }

    function syncPetFiltersFromDom() {
        var pk = document.getElementById("xiuMarketPetKind");
        var pa = document.getElementById("xiuMarketPetAgeTier");
        if (pk) state.petKind = pk.value || "";
        if (pa) state.petAgeTier = pa.value || "";
    }

    function updateEquipFilterVisibility() {
        var wrap = document.getElementById("xiuMarketEquipFilters");
        if (!wrap) return;
        var t = state.itemType;
        wrap.hidden = t === "material" || t === "pet";
    }

    function updatePetFilterVisibility() {
        var wrap = document.getElementById("xiuMarketPetFilters");
        if (!wrap) return;
        wrap.hidden = state.itemType !== "pet";
    }

    function scheduleEquipFilterReload() {
        clearTimeout(equipFilterDebounceTimer);
        equipFilterDebounceTimer = setTimeout(function () {
            syncEquipFiltersFromDom();
            state.page = 1;
            loadList();
        }, 320);
    }

    function fmtTime(ts) {
        if (!ts) return "—";
        var d = new Date(ts);
        return d.toLocaleString("zh-CN", { hour12: false });
    }

    function xiuEsc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function xiuMaterialLabelZh(key) {
        var k = String(key || "");
        var map = {};
        if (typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            map[MATERIAL_ENHANCE_STONE] = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
        }
        if (typeof MATERIAL_ENCHANT_STONE !== "undefined") {
            map[MATERIAL_ENCHANT_STONE] = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
        }
        if (typeof MATERIAL_GEM_PACK !== "undefined") {
            map[MATERIAL_GEM_PACK] = typeof MATERIAL_GEM_PACK_ZH !== "undefined" ? MATERIAL_GEM_PACK_ZH : "宝石材料包";
        }
        if (typeof MATERIAL_SOCKET_OPENER !== "undefined") {
            map[MATERIAL_SOCKET_OPENER] = typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined" ? MATERIAL_SOCKET_OPENER_ZH : "开孔器";
        }
        if (typeof MATERIAL_TALENT_FRUIT !== "undefined") {
            map[MATERIAL_TALENT_FRUIT] = typeof MATERIAL_TALENT_FRUIT_ZH !== "undefined" ? MATERIAL_TALENT_FRUIT_ZH : "天赋果";
        }
        if (typeof MATERIAL_LIFE_POTION !== "undefined") {
            map[MATERIAL_LIFE_POTION] = typeof MATERIAL_LIFE_POTION_ZH !== "undefined" ? MATERIAL_LIFE_POTION_ZH : "生命药剂";
        }
        if (typeof MATERIAL_PET_EXP_FRUIT !== "undefined") {
            map[MATERIAL_PET_EXP_FRUIT] = typeof MATERIAL_PET_EXP_FRUIT_ZH !== "undefined" ? MATERIAL_PET_EXP_FRUIT_ZH : "灵宠经验果实";
        }
        if (typeof MATERIAL_SECRET_REALM_WARP !== "undefined") {
            map[MATERIAL_SECRET_REALM_WARP] = typeof MATERIAL_SECRET_REALM_WARP_ZH !== "undefined" ? MATERIAL_SECRET_REALM_WARP_ZH : "秘境穿梭器";
        }
        return map[k] || k;
    }

    /** 主标题：专名 / 材料中文名 / 灵宠名 */
    function xiuMarketRowTitle(r) {
        if (r.itemType === "equip" && r.equipPreview) {
            if (typeof weaponOrArmorDisplayName === "function") return weaponOrArmorDisplayName(r.equipPreview);
            return r.displayName || "遗器";
        }
        if (r.itemType === "material") {
            return xiuMaterialLabelZh(r.materialKey) + " ×" + (r.materialAmount || 0);
        }
        if (r.itemType === "pet" && r.petPreview) return String(r.petPreview.name || r.displayName || "灵宠");
        return r.displayName || "";
    }

    function showMarketMaterialPreview(materialKey, materialAmount) {
        if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
        var label = xiuMaterialLabelZh(materialKey);
        var hk = String(materialKey || "");
        var hints = {
            enhance_stone: "用于遗器淬火升星，成败依星阶，高星失败会掉星。",
            enchant_stone: "用于遗器附魔，可获得属性百分比增幅。",
            gem_material_pack: "启封后可得三枚随机一级宝石（可重复）。",
            socket_opener: "用于遗器开孔，每器至多三窍。",
            talent_fruit: "喂养出战灵宠，增加妖力以推动年份进阶。",
            life_potion: "服用后恢复气血上限的 50%。头领及以上妖躯有概率掉落。",
            pet_exp_fruit: "服用后多场斗法中灵宠击杀修为翻倍，可叠加。仅最后一劫镇守概率掉落。",
            secret_realm_warp: "劫数20的BOSS有50%概率掉落。用于秘境层间穿梭。",
        };
        var hint = hints[hk] || "洞天劫材料，购入后将进入你的行囊材料栏。";
        dungeon.status.exploring = false;
        defaultModalElement.style.display = "flex";
        defaultModalElement.style.zIndex = "5080";
        defaultModalElement.classList.add("modal-container--market-preview");
        defaultModalElement.innerHTML =
            '<div class="content xiu-mat-preview">' +
            '<p class="xiu-market-preview-hint">挂单预览 · 材料信息</p>' +
            "<h4>" +
            xiuEsc(label) +
            " × " +
            xiuEsc(String(materialAmount || 0)) +
            "</h4>" +
            '<p class="xiu-mat-preview-desc">' +
            xiuEsc(hint) +
            "</p>" +
            '<div class="button-container"><button type="button" id="close-market-mat-preview">关闭</button></div></div>';
        var xiuM = document.getElementById("xiuMarketModal");
        var sellM = document.getElementById("xiuMarketSellModal");
        if (xiuM && xiuM.style.display === "flex") xiuM.style.filter = "brightness(55%)";
        if (sellM && sellM.style.display === "flex") sellM.style.filter = "brightness(55%)";
        var dm = document.querySelector("#dungeon-main");
        if (dm) dm.style.filter = "brightness(92%)";
        var inv = document.querySelector("#inventory");
        if (inv && inv.style.display === "flex") inv.style.filter = "brightness(55%)";
        var btn = document.getElementById("close-market-mat-preview");
        if (btn) {
            btn.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.style.zIndex = "";
                defaultModalElement.classList.remove("modal-container--market-preview");
                defaultModalElement.innerHTML = "";
                if (xiuM) xiuM.style.filter = "";
                if (sellM) sellM.style.filter = "";
                if (dm) dm.style.filter = "";
                if (inv) inv.style.filter = "";
                if (typeof continueExploring === "function") continueExploring();
            };
        }
    }

    /** 副行：品阶 · 星阶 · 修为 / 材料用途 / 灵宠年份与系别 */
    function xiuMarketRowDesc(r) {
        if (r.itemType === "equip" && r.equipPreview) {
            var eq = r.equipPreview;
            var parts = [];
            if (typeof equipmentRarityLabel === "function" && eq.rarity) parts.push(equipmentRarityLabel(eq.rarity));
            if (typeof eq.enhanceStars === "number" && eq.enhanceStars > 0) parts.push("淬火 " + eq.enhanceStars + "★");
            if (typeof cultivationRealmLabel === "function" && eq.lvl != null) parts.push("修为 " + cultivationRealmLabel(eq.lvl));
            var enT = typeof eq.enchantTier === "number" ? eq.enchantTier : Number(eq.enchantTier);
            var enP = typeof eq.enchantPct === "number" ? eq.enchantPct : Number(eq.enchantPct);
            if (Number.isFinite(enT) && Number.isFinite(enP) && enT > 0 && enP > 0) {
                parts.push("附魔 T" + Math.floor(enT) + " · " + Math.floor(enP) + "%");
            }
            return parts.join(" · ");
        }
        if (r.itemType === "material") {
            var hints = {
                enhance_stone: "用于遗器淬火升星",
                enchant_stone: "用于遗器附魔增幅",
                gem_material_pack: "启封后可得随机一级宝石",
                socket_opener: "用于遗器开孔（每器至多三窍）",
                talent_fruit: "喂养灵宠，增加妖力以进阶年份",
                life_potion: "服用恢复气血 50%",
                pet_exp_fruit: "灵宠击杀修为翻倍（多场，可叠加）",
                secret_realm_warp: "劫数20的BOSS有50%概率掉落",
            };
            var hk = String(r.materialKey || "");
            return hints[hk] || "洞天劫材料";
        }
        if (r.itemType === "pet" && r.petPreview) {
            var p = r.petPreview;
            var parts = [];
            if (typeof getPetAgeTierDef === "function" && p.ageTier) {
                var d = getPetAgeTierDef(p.ageTier);
                if (d && d.name) parts.push(d.name);
            }
            if (typeof PET_TYPE_LABEL_ZH !== "undefined" && p.type && PET_TYPE_LABEL_ZH[p.type]) parts.push(PET_TYPE_LABEL_ZH[p.type]);
            if (typeof cultivationRealmLabel === "function" && p.lvl != null) parts.push("修为 " + cultivationRealmLabel(p.lvl));
            return parts.join(" · ");
        }
        return "";
    }

    function openModal() {
        if (typeof window.dongtianNetHubClickBlocked === "function" && window.dongtianNetHubClickBlocked()) return;
        var m = document.getElementById("xiuMarketModal");
        if (!m) return;
        m.style.display = "flex";
        try {
            document.body.classList.add("xiu-market-open");
        } catch (e) {}
        state.page = 1;
        var ft = document.getElementById("xiuMarketFilterType");
        if (ft) state.itemType = ft.value || "";
        syncEquipFiltersFromDom();
        syncPetFiltersFromDom();
        updateEquipFilterVisibility();
        updatePetFilterVisibility();
        refreshAll();
        syncParentViewportForXiuUi();
    }

    function closeModal() {
        var m = document.getElementById("xiuMarketModal");
        if (m) m.style.display = "none";
        try {
            document.body.classList.remove("xiu-market-open");
        } catch (e) {}
        syncParentViewportForXiuUi();
    }

    /** 与主界面无限深渊联网聊天一致：锁定父页 viewport，避免聚焦出价/上架输入时整页缩放（嵌套 iframe 时父页 meta 仍会参与） */
    var _xiuParentViewportHooked = false;
    function syncParentViewportForXiuUi() {
        var m = document.getElementById("xiuMarketModal");
        var s = document.getElementById("xiuMarketSellModal");
        var c = document.getElementById("xiuMarketConfirmModal");
        var wu = document.getElementById("wushenArenaModal");
        var any =
            (m && m.style.display === "flex") ||
            (s && s.style.display === "flex") ||
            (c && c.style.display === "flex") ||
            (wu && wu.style.display === "flex");
        try {
            var p = window.parent;
            if (any) {
                if (!_xiuParentViewportHooked && typeof p.lockMobileViewportNoZoom === "function") {
                    p.lockMobileViewportNoZoom();
                    _xiuParentViewportHooked = true;
                }
            } else if (_xiuParentViewportHooked && typeof p.unlockMobileViewportNoZoom === "function") {
                p.unlockMobileViewportNoZoom();
                _xiuParentViewportHooked = false;
            }
        } catch (e) {}
    }
    window.syncParentViewportForDongtianEmbeds = syncParentViewportForXiuUi;

    /** 关闭洞天 iframe 前由主游戏调用，避免父页 viewport 仍被锁定 */
    window.__releaseXiuMarketParentViewport = function () {
        if (!_xiuParentViewportHooked) return;
        try {
            if (window.parent && typeof window.parent.unlockMobileViewportNoZoom === "function") {
                window.parent.unlockMobileViewportNoZoom();
            }
        } catch (e) {}
        _xiuParentViewportHooked = false;
    };

    /** 移动端双指缩放易触发父页/浏览器缩放或误触刷新，导致 iframe 内界面像「整页刷新」、内容叠层；在模态根上拦截多指移动与 iOS 捏合手势 */
    function ensureXiuModalPinchGuards(el) {
        if (!el || el._xiuPinchGuards) return;
        el._xiuPinchGuards = true;
        function blockMultiTouchMove(ev) {
            if (ev.touches && ev.touches.length > 1) ev.preventDefault();
        }
        function blockGesture(ev) {
            ev.preventDefault();
        }
        el.addEventListener("touchmove", blockMultiTouchMove, { passive: false });
        el.addEventListener("gesturestart", blockGesture, { passive: false });
        el.addEventListener("gesturechange", blockGesture, { passive: false });
        el.addEventListener("gestureend", blockGesture, { passive: false });
    }

    function bindXiuModalPinchGuards() {
        ["xiuMarketModal", "xiuMarketSellModal", "xiuMarketConfirmModal"].forEach(function (id) {
            ensureXiuModalPinchGuards(document.getElementById(id));
        });
    }

    function refreshAll() {
        var coinEl = document.getElementById("xiuMarketCoin");
        getNetworkCoinAmount().then(function (amt) {
            if (coinEl) coinEl.textContent = String(amt);
        });
        loadList();
    }

    /** 上架成功后同步云端存档并刷新行囊/灵宠 UI */
    function refreshAfterDongtianTrade() {
        return reloadDongtianStateFromServer().then(function () {
            if (typeof showEquipment === "function") showEquipment();
            if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
            if (typeof renderPetPanel === "function") renderPetPanel();
            var m = document.getElementById("xiuMarketModal");
            if (m && m.style.display === "flex") {
                refreshAll();
            }
        });
    }

    var sellState = { kind: null, extra: null, saleMode: "fixed" };
    var toastTimer;
    var confirmCallback = null;

    function showXiuToast(msg, isErr) {
        var el = document.getElementById("xiuMarketToast");
        if (!el) {
            if (typeof alert !== "undefined") alert(msg);
            return;
        }
        el.textContent = msg;
        el.classList.toggle("xiu-market-toast--err", !!isErr);
        el.style.display = "block";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.style.display = "none";
        }, 2600);
    }

    /** 挂单「信息」：统一入口，避免列表重绘时逐按钮绑定失效；并对缺数据/异常给出提示 */
    function openXiuListingInfo(listingIdAttr) {
        var holder = document.getElementById("xiuMarketList");
        var rows = holder && holder._xiuListRows;
        var lid = listingIdAttr == null ? "" : String(listingIdAttr);
        if (!rows || !lid) {
            showXiuToast("无法读取挂单数据", true);
            return;
        }
        var row = rows.find(function (x) {
            return String(x.listingId) === lid;
        });
        if (!row) {
            showXiuToast("未找到该挂单（列表可能已刷新）", true);
            return;
        }
        try {
            if (row.itemType === "equip") {
                if (!row.equipPreview) {
                    showXiuToast("暂无遗器预览数据", true);
                    return;
                }
                if (typeof window.showMarketEquipPreview !== "function") {
                    showXiuToast("预览模块未就绪", true);
                    return;
                }
                window.showMarketEquipPreview(row.equipPreview);
            } else if (row.itemType === "pet") {
                if (!row.petPreview) {
                    showXiuToast("暂无灵宠预览数据", true);
                    return;
                }
                if (typeof window.showMarketPetPreview !== "function") {
                    showXiuToast("预览模块未就绪", true);
                    return;
                }
                window.showMarketPetPreview(row.petPreview);
            } else if (row.itemType === "material") {
                showMarketMaterialPreview(row.materialKey, row.materialAmount);
            } else {
                showXiuToast("未知商品类型", true);
            }
        } catch (err) {
            showXiuToast((err && err.message) || "预览打开失败", true);
        }
    }

    function closeXiuConfirm() {
        var modal = document.getElementById("xiuMarketConfirmModal");
        if (modal) modal.style.display = "none";
        confirmCallback = null;
        syncParentViewportForXiuUi();
    }

    function showXiuConfirm(text, onOk) {
        var modal = document.getElementById("xiuMarketConfirmModal");
        var tx = document.getElementById("xiuConfirmText");
        if (!modal || !tx) {
            if (typeof confirm !== "undefined" && confirm(text)) onOk();
            return;
        }
        confirmCallback = onOk;
        tx.textContent = text;
        modal.style.display = "flex";
        syncParentViewportForXiuUi();
    }

    function setSellSaleMode(mode) {
        sellState.saleMode = mode;
        var fixedBtn = document.getElementById("xiuSellModeFixed");
        var aucBtn = document.getElementById("xiuSellModeAuction");
        var ff = document.getElementById("xiuSellFieldsFixed");
        var af = document.getElementById("xiuSellFieldsAuction");
        if (fixedBtn) fixedBtn.classList.toggle("xiu-sell-mode-btn--active", mode === "fixed");
        if (aucBtn) aucBtn.classList.toggle("xiu-sell-mode-btn--active", mode === "auction");
        if (ff) ff.hidden = mode !== "fixed";
        if (af) af.hidden = mode !== "auction";
        requestAnimationFrame(function () {
            focusSellModalPrimaryInput();
        });
    }

    function focusSellModalPrimaryInput() {
        var kind = sellState.kind;
        var mode = sellState.saleMode || "fixed";
        var matRow = document.getElementById("xiuSellMatRow");
        if (kind === "material" && matRow && !matRow.hidden) {
            var q = document.getElementById("xiuSellMatQty");
            if (q) {
                q.focus();
                try {
                    q.select();
                } catch (e) {}
                return;
            }
        }
        var el =
            mode === "auction" ? document.getElementById("xiuSellMinBid") : document.getElementById("xiuSellPriceFixed");
        if (el) {
            el.focus();
            try {
                if (typeof el.select === "function") el.select();
            } catch (e2) {}
        }
    }

    function closeSellModal() {
        var m = document.getElementById("xiuMarketSellModal");
        if (m) m.style.display = "none";
        try {
            document.body.classList.remove("xiu-sell-open");
        } catch (e) {}
        sellState.kind = null;
        sellState.extra = null;
        syncParentViewportForXiuUi();
    }

    function openSellModal(kind, extra) {
        sellState.kind = kind;
        sellState.extra = extra || {};
        var errEl = document.getElementById("xiuSellErr");
        if (errEl) errEl.textContent = "";
        var title = document.getElementById("xiuSellTitle");
        var hint = document.getElementById("xiuSellHint");
        var matRow = document.getElementById("xiuSellMatRow");
        var petRow = document.getElementById("xiuSellPetRow");
        var cap = document.getElementById("xiuSellMatCap");
        var qtyInp = document.getElementById("xiuSellMatQty");

        if (title) {
            title.textContent =
                kind === "equip" ? "上架遗器" : kind === "material" ? "上架材料" : kind === "pet" ? "上架灵宠" : "上架至修仙市场";
        }
        if (hint) {
            hint.textContent =
                kind === "equip"
                    ? "选择固定一口价或竞拍，并填写联网币价格。"
                    : kind === "material"
                    ? "填写上架数量后，再选择出售方式与价格。"
                    : "选择出售方式与价格；灵宠将从栏中取出挂单。";
        }
        if (matRow) matRow.hidden = kind !== "material";
        if (petRow) petRow.hidden = kind !== "pet";
        if (kind === "material" && sellState.extra.maxAmount != null) {
            var mx = parseInt(sellState.extra.maxAmount, 10) || 1;
            if (qtyInp) {
                qtyInp.max = mx;
                qtyInp.min = 1;
                qtyInp.value = String(Math.min(mx, 1));
            }
            if (cap) cap.textContent = "最多可上架 " + mx + " 个";
        }
        var pf = document.getElementById("xiuSellPriceFixed");
        var mb = document.getElementById("xiuSellMinBid");
        var bn = document.getElementById("xiuSellBuyNow");
        if (pf) pf.value = "1";
        if (mb) mb.value = "1";
        if (bn) bn.value = "";

        setSellSaleMode("fixed");

        var m = document.getElementById("xiuMarketSellModal");
        if (m) m.style.display = "flex";
        try {
            document.body.classList.add("xiu-sell-open");
        } catch (e) {}
        syncParentViewportForXiuUi();
    }

    function submitSellModal() {
        var errEl = document.getElementById("xiuSellErr");
        if (errEl) errEl.textContent = "";
        var kind = sellState.kind;
        var ex = sellState.extra || {};
        if (!kind) return;

        var body = Object.assign(
            {
                itemType: kind === "equip" ? "equip" : kind === "material" ? "material" : "pet",
                saleMode: sellState.saleMode || "fixed",
            },
            playerNameBody()
        );

        if (kind === "equip") body.equipIndex = ex.equipIndex;
        if (kind === "pet") body.petId = ex.petId;
        if (kind === "material") {
            var mx = parseInt(ex.maxAmount, 10) || 0;
            var qtyInp = document.getElementById("xiuSellMatQty");
            var qty = qtyInp ? parseInt(qtyInp.value, 10) : NaN;
            if (!Number.isFinite(qty) || qty < 1 || qty > mx) {
                if (errEl) errEl.textContent = "数量无效（1～" + mx + "）";
                return;
            }
            body.materialKey = ex.materialKey;
            body.materialAmount = qty;
        }

        var mode = sellState.saleMode || "fixed";
        if (mode === "fixed") {
            var pr = parseInt(document.getElementById("xiuSellPriceFixed").value, 10);
            if (!Number.isFinite(pr) || pr < 0) {
                if (errEl) errEl.textContent = "一口价无效";
                return;
            }
            body.price = pr;
        } else {
            var minB = parseInt(document.getElementById("xiuSellMinBid").value, 10);
            if (!Number.isFinite(minB) || minB < 1) {
                if (errEl) errEl.textContent = "起拍价须为至少 1 的整数";
                return;
            }
            body.minBid = minB;
            var bnInp = document.getElementById("xiuSellBuyNow");
            var bnStr = bnInp ? bnInp.value : "";
            if (bnStr && String(bnStr).trim() !== "") {
                var bnVal = parseInt(bnStr, 10);
                if (!Number.isFinite(bnVal) || bnVal < minB) {
                    if (errEl) errEl.textContent = "可选一口价须 ≥ 起拍价";
                    return;
                }
                body.buyNowPrice = bnVal;
            }
        }

        var submitBtn = document.getElementById("xiuSellSubmit");
        if (submitBtn) submitBtn.disabled = true;

        api("POST", "/api/dongtian-market/sell", body)
            .then(function (res) {
                if (submitBtn) submitBtn.disabled = false;
                if (res && res.ok) {
                    closeSellModal();
                    showXiuToast("上架成功", false);
                    refreshAfterDongtianTrade();
                } else {
                    var msg = (res && res.message) || "上架失败";
                    if (errEl) errEl.textContent = msg;
                    else showXiuToast(msg, true);
                }
            })
            .catch(function (e) {
                if (submitBtn) submitBtn.disabled = false;
                var msg = (e && e.message) || "上架请求失败（请检查联网与登录）";
                if (errEl) errEl.textContent = msg;
                else showXiuToast(msg, true);
            });
    }

    function bindXiuSellAndConfirm() {
        var modeFixed = document.getElementById("xiuSellModeFixed");
        var modeAuc = document.getElementById("xiuSellModeAuction");
        if (modeFixed)
            modeFixed.onclick = function () {
                setSellSaleMode("fixed");
            };
        if (modeAuc)
            modeAuc.onclick = function () {
                setSellSaleMode("auction");
            };
        var cancel = document.getElementById("xiuSellCancel");
        if (cancel) cancel.onclick = closeSellModal;
        var sub = document.getElementById("xiuSellSubmit");
        if (sub) sub.onclick = submitSellModal;
        var ok = document.getElementById("xiuConfirmOk");
        var cx = document.getElementById("xiuConfirmCancel");
        if (ok)
            ok.onclick = function () {
                var cb = confirmCallback;
                var modal = document.getElementById("xiuMarketConfirmModal");
                if (modal) modal.style.display = "none";
                confirmCallback = null;
                if (typeof cb === "function") cb();
            };
        if (cx) cx.onclick = closeXiuConfirm;
        var sellModal = document.getElementById("xiuMarketSellModal");
        if (sellModal)
            sellModal.addEventListener("click", function (ev) {
                if (ev.target === sellModal) closeSellModal();
            });
        var confModal = document.getElementById("xiuMarketConfirmModal");
        if (confModal)
            confModal.addEventListener("click", function (ev) {
                if (ev.target === confModal) closeXiuConfirm();
            });
        document.addEventListener(
            "keydown",
            function (ev) {
                var t = ev.target;
                if (!t || !t.closest) return;
                if (
                    t.closest("#xiuMarketSellModal") ||
                    t.closest("#xiuMarketConfirmModal") ||
                    t.closest("#xiuMarketModal")
                ) {
                    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
                        ev.stopPropagation();
                    }
                }
            },
            true
        );
        document.addEventListener(
            "keydown",
            function (ev) {
                if (ev.key !== "Escape" && ev.keyCode !== 27) return;
                var conf = document.getElementById("xiuMarketConfirmModal");
                if (conf && conf.style.display === "flex") {
                    closeXiuConfirm();
                    ev.preventDefault();
                    return;
                }
                var sell = document.getElementById("xiuMarketSellModal");
                if (sell && sell.style.display === "flex") {
                    closeSellModal();
                    ev.preventDefault();
                    return;
                }
                var xm = document.getElementById("xiuMarketModal");
                if (xm && xm.style.display === "flex") {
                    closeModal();
                    ev.preventDefault();
                }
            },
            true
        );
    }
    bindXiuSellAndConfirm();

    function loadList() {
        var q = "?page=" + state.page + "&pageSize=" + state.pageSize;
        if (state.mine) q += "&mine=1";
        if (state.itemType === "equip" || state.itemType === "material" || state.itemType === "pet") {
            q += "&itemType=" + encodeURIComponent(state.itemType);
        }
        if (state.equipRarity) q += "&equipRarity=" + encodeURIComponent(state.equipRarity);
        if (state.equipSlotType) q += "&equipSlotType=" + encodeURIComponent(state.equipSlotType);
        if (state.equipLvlMin !== "" && state.equipLvlMin != null) q += "&equipLvlMin=" + encodeURIComponent(String(state.equipLvlMin));
        if (state.equipLvlMax !== "" && state.equipLvlMax != null) q += "&equipLvlMax=" + encodeURIComponent(String(state.equipLvlMax));
        if (state.itemType === "pet") {
            if (state.petKind) q += "&petType=" + encodeURIComponent(state.petKind);
            if (state.petAgeTier) q += "&petAgeTier=" + encodeURIComponent(state.petAgeTier);
        }
        var holder = document.getElementById("xiuMarketList");
        if (holder) holder.innerHTML = '<p class="xiu-market-muted">加载中…</p>';
        api("GET", "/api/dongtian-market/list" + q, undefined)
            .then(function (res) {
                if (!res || !res.ok) {
                    if (holder) holder.innerHTML = '<p class="xiu-market-err">' + (res && res.message ? res.message : "加载失败") + "</p>";
                    return;
                }
                renderList(res.list || [], res.total || 0, res.page || 1);
                var hist = document.getElementById("xiuMarketSoldHistory");
                if (hist) {
                    var soldHistory = (res.soldHistory && res.soldHistory.length) ? res.soldHistory.slice(-12).reverse() : [];
                    if (soldHistory.length) {
                        hist.innerHTML = soldHistory
                            .map(function (s) {
                                var buyerDisplay =
                                    s.buyerPlayerName != null && String(s.buyerPlayerName).trim() !== ""
                                        ? String(s.buyerPlayerName).trim()
                                        : s.buyerName || "某玩家";
                                var sellerDisplay =
                                    s.sellerPlayerName != null && String(s.sellerPlayerName).trim() !== ""
                                        ? String(s.sellerPlayerName).trim()
                                        : s.sellerName || "某玩家";
                                var soldName = String(s.displayName || "");
                                var price = s.price != null ? s.price : 0;
                                var line =
                                    xiuEsc(buyerDisplay) +
                                    " 购买了 " +
                                    xiuEsc(sellerDisplay) +
                                    " 的 【" +
                                    xiuEsc(soldName) +
                                    "】，" +
                                    xiuEsc(String(price)) +
                                    " 联网币 · " +
                                    fmtTime(s.time);
                                return '<div class="xiu-market-sold-row">' + line + "</div>";
                            })
                            .join("");
                    } else {
                        hist.innerHTML = '<p class="xiu-market-muted">暂无成交记录</p>';
                    }
                }
            })
            .catch(function (e) {
                if (holder) holder.innerHTML = '<p class="xiu-market-err">' + (e && e.message ? e.message : "网络错误") + "</p>";
            });
    }

    function renderList(rows, total, page) {
        var holder = document.getElementById("xiuMarketList");
        if (!holder) return;
        if (!rows.length) {
            holder.innerHTML = '<p class="xiu-market-muted">暂无挂单</p>';
            renderPager(total, page);
            return;
        }
        var html = rows
            .map(function (r) {
                var isAuc = r.saleMode === "auction";
                var priceLine = isAuc
                    ? "竞拍 当前 " +
                      (r.currentBid || 0) +
                      " / 起拍 " +
                      (r.minBid || r.price || 0) +
                      (r.buyNowPrice != null ? " · 一口价 " + r.buyNowPrice : "")
                    : "一口价 " + (r.price || 0);
                var timeLine = isAuc
                    ? "截止 " + fmtTime(r.auctionEndsAt)
                    : "到期 " + fmtTime(r.autoDelistAt);
                var typeLabel = r.itemType === "equip" ? "遗器" : r.itemType === "pet" ? "灵宠" : "材料";
                var rowTitle = xiuEsc(xiuMarketRowTitle(r));
                var rowDesc = xiuMarketRowDesc(r);
                var descLine = rowDesc ? '<div class="xiu-market-row-desc">' + xiuEsc(rowDesc) + "</div>" : "";
                var nameCls = "";
                if (r.itemType === "equip" && r.equipPreview && r.equipPreview.rarity) {
                    nameCls = ' class="' + xiuEsc(r.equipPreview.rarity) + '"';
                }
                var infoBtn =
                    '<button type="button" class="btn btn--sm btn--ghost xiu-market-info-btn" title="查看属性" data-listing-id="' +
                    xiuEsc(r.listingId) +
                    '"><i class="fas fa-circle-info" aria-hidden="true"></i>信息</button>';
                var actions = "";
                if (!state.mine) {
                    if (isAuc) {
                        actions +=
                            '<div class="xiu-market-row-actions">' +
                            '<input type="number" class="xiu-market-inp xiu-bid-inp" data-id="' +
                            r.listingId +
                            '" placeholder="出价" min="1" />' +
                            '<button type="button" class="btn btn--sm btn--ghost" data-bid="' +
                            r.listingId +
                            '">出价</button>';
                        if (r.buyNowPrice != null) {
                            actions +=
                                '<button type="button" class="btn btn--sm btn--primary" data-buynow="' +
                                r.listingId +
                                '">一口价</button>';
                        }
                        actions += "</div>";
                    } else {
                        actions =
                            '<button type="button" class="btn btn--sm btn--primary" data-buy="' + r.listingId + '">购买</button>';
                    }
                }
                if (state.mine && r.saleMode === "fixed") {
                    actions +=
                        '<button type="button" class="btn btn--sm btn--ghost" data-delist="' + r.listingId + '">下架</button>';
                }
                return (
                    '<div class="xiu-market-row">' +
                    '<div class="xiu-market-row-main">' +
                    '<span class="xiu-market-tag">' +
                    typeLabel +
                    "</span>" +
                    '<span class="xiu-market-row-nameblock">' +
                    "<strong" +
                    nameCls +
                    ">" +
                    rowTitle +
                    "</strong>" +
                    infoBtn +
                    "</span>" +
                    '<span class="xiu-market-seller">卖方：' +
                    xiuEsc(r.sellerPlayerName || r.sellerName || "") +
                    "</span>" +
                    "</div>" +
                    descLine +
                    '<div class="xiu-market-row-meta">' +
                    priceLine +
                    " · " +
                    timeLine +
                    "</div>" +
                    actions +
                    "</div>"
                );
            })
            .join("");
        holder.innerHTML = html;
        holder._xiuListRows = rows;
        holder.querySelectorAll("[data-buy]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-buy");
                showXiuConfirm("确认花费联网币购买？", function () {
                    api("POST", "/api/dongtian-market/buy", Object.assign({ listingId: id }, playerNameBody()))
                        .then(function (res) {
                            if (res && res.ok) {
                                showXiuToast("购买成功", false);
                                refreshAfterDongtianTrade();
                            } else {
                                showXiuToast((res && res.message) || "失败", true);
                            }
                        })
                        .catch(function (e) {
                            showXiuToast((e && e.message) || "请求失败", true);
                        });
                });
            };
        });
        holder.querySelectorAll("[data-buynow]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-buynow");
                showXiuConfirm("确认一口价购买？", function () {
                    api("POST", "/api/dongtian-market/buy", Object.assign({ listingId: id }, playerNameBody()))
                        .then(function (res) {
                            if (res && res.ok) {
                                showXiuToast("成交", false);
                                refreshAfterDongtianTrade();
                            } else {
                                showXiuToast((res && res.message) || "失败", true);
                            }
                        })
                        .catch(function (e) {
                            showXiuToast((e && e.message) || "请求失败", true);
                        });
                });
            };
        });
        holder.querySelectorAll("[data-bid]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-bid");
                var inp = holder.querySelector('.xiu-bid-inp[data-id="' + id + '"]');
                var amt = inp ? parseInt(inp.value, 10) : NaN;
                if (!Number.isFinite(amt) || amt < 1) {
                    showXiuToast("请输入有效出价", true);
                    return;
                }
                api("POST", "/api/dongtian-market/bid", Object.assign({ listingId: id, bidAmount: amt }, playerNameBody()))
                    .then(function (res) {
                        if (res && res.ok) {
                            showXiuToast("出价成功", false);
                            refreshAll();
                        } else {
                            showXiuToast((res && res.message) || "失败", true);
                        }
                    })
                    .catch(function (e) {
                        showXiuToast((e && e.message) || "请求失败", true);
                    });
            };
        });
        holder.querySelectorAll("[data-delist]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-delist");
                api("POST", "/api/dongtian-market/delist", { listingId: id })
                    .then(function (res) {
                        if (res && res.ok) {
                            showXiuToast("已下架", false);
                            refreshAfterDongtianTrade();
                        } else {
                            showXiuToast((res && res.message) || "失败", true);
                        }
                    })
                    .catch(function (e) {
                        showXiuToast((e && e.message) || "请求失败", true);
                    });
            };
        });
        renderPager(total, page);
    }

    function renderPager(total, page) {
        var el = document.getElementById("xiuMarketPager");
        if (!el) return;
        var pages = Math.max(1, Math.ceil(total / state.pageSize));
        el.innerHTML =
            '<button type="button" class="btn btn--sm btn--ghost" id="xiuMarketPrev">上一页</button>' +
            "<span>第 " +
            page +
            " / " +
            pages +
            " 页（共 " +
            total +
            " 条）</span>" +
            '<button type="button" class="btn btn--sm btn--ghost" id="xiuMarketNext">下一页</button>';
        var prev = document.getElementById("xiuMarketPrev");
        var next = document.getElementById("xiuMarketNext");
        if (prev)
            prev.onclick = function () {
                if (state.page > 1) {
                    state.page--;
                    loadList();
                }
            };
        if (next)
            next.onclick = function () {
                if (page < pages) {
                    state.page++;
                    loadList();
                }
            };
    }

    window.dongtianMarketOpenSellEquip = function (equipIndex) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        openSellModal("equip", { equipIndex: equipIndex });
    };
    window.dongtianMarketOpenSellMaterial = function (materialKey, maxAmount) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        var max = parseInt(maxAmount, 10) || 0;
        if (max < 1) {
            showXiuToast("数量不足", true);
            return;
        }
        openSellModal("material", { materialKey: materialKey, maxAmount: max });
    };
    window.dongtianMarketOpenSellPet = function (petId) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (!petId) return;
        openSellModal("pet", { petId: petId });
    };

    window.initXiuMarketUI = function () {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (typeof window.ensureCloudMarketBarStructure === "function") {
            window.ensureCloudMarketBarStructure();
        }
        var bar = document.getElementById("xiuMarketBar");
        var btn = document.getElementById("xiuMarketOpenBtn");
        if (bar) bar.style.display = "flex";
        if (btn)
            btn.onclick = function () {
                var m = document.getElementById("xiuMarketModal");
                if (m && m.style.display === "flex") {
                    closeModal();
                } else {
                    openModal();
                }
            };
        var closeBtn = document.getElementById("xiuMarketCloseBtn");
        if (closeBtn) closeBtn.onclick = closeModal;
        var xiuM = document.getElementById("xiuMarketModal");
        if (xiuM && !xiuM._xiuMarketBackdropBound) {
            xiuM._xiuMarketBackdropBound = true;
            xiuM.addEventListener("click", function (ev) {
                if (ev.target === xiuM) closeModal();
            });
        }
        var refBtn = document.getElementById("xiuMarketRefreshBtn");
        if (refBtn) refBtn.onclick = refreshAll;
        var mineChk = document.getElementById("xiuMarketMineOnly");
        if (mineChk)
            mineChk.onchange = function () {
                state.mine = !!mineChk.checked;
                state.page = 1;
                loadList();
            };
        var ft = document.getElementById("xiuMarketFilterType");
        if (ft)
            ft.onchange = function () {
                state.itemType = ft.value || "";
                if (state.itemType === "material" || state.itemType === "pet") {
                    state.equipRarity = "";
                    state.equipSlotType = "";
                    state.equipLvlMin = "";
                    state.equipLvlMax = "";
                    var er = document.getElementById("xiuMarketEquipRarity");
                    var est = document.getElementById("xiuMarketEquipSlotType");
                    var emin = document.getElementById("xiuMarketEquipLvlMin");
                    var emax = document.getElementById("xiuMarketEquipLvlMax");
                    if (er) er.value = "";
                    if (est) est.value = "";
                    if (emin) emin.value = "";
                    if (emax) emax.value = "";
                }
                if (state.itemType !== "pet") {
                    state.petKind = "";
                    state.petAgeTier = "";
                    var pk = document.getElementById("xiuMarketPetKind");
                    var pa = document.getElementById("xiuMarketPetAgeTier");
                    if (pk) pk.value = "";
                    if (pa) pa.value = "";
                }
                state.page = 1;
                updateEquipFilterVisibility();
                updatePetFilterVisibility();
                loadList();
            };
        var er = document.getElementById("xiuMarketEquipRarity");
        if (er)
            er.onchange = function () {
                syncEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        var est = document.getElementById("xiuMarketEquipSlotType");
        if (est)
            est.onchange = function () {
                syncEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        var emin = document.getElementById("xiuMarketEquipLvlMin");
        var emax = document.getElementById("xiuMarketEquipLvlMax");
        if (emin) emin.addEventListener("input", scheduleEquipFilterReload);
        if (emax) emax.addEventListener("input", scheduleEquipFilterReload);
        var pk = document.getElementById("xiuMarketPetKind");
        var pa = document.getElementById("xiuMarketPetAgeTier");
        if (pk)
            pk.onchange = function () {
                syncPetFiltersFromDom();
                state.page = 1;
                loadList();
            };
        if (pa)
            pa.onchange = function () {
                syncPetFiltersFromDom();
                state.page = 1;
                loadList();
            };
        updateEquipFilterVisibility();
        updatePetFilterVisibility();
        var listEl = document.getElementById("xiuMarketList");
        if (listEl && !listEl._xiuMarketInfoDelegated) {
            listEl._xiuMarketInfoDelegated = true;
            listEl.addEventListener(
                "click",
                function (ev) {
                    var ib = ev.target && ev.target.closest ? ev.target.closest(".xiu-market-info-btn") : null;
                    if (!ib || !listEl.contains(ib)) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    openXiuListingInfo(ib.getAttribute("data-listing-id"));
                },
                false
            );
        }
        bindXiuModalPinchGuards();
    };

})();
