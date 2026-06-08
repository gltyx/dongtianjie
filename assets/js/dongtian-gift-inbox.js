/**
 * 洞天劫 · 行囊馈赠收件箱（联网赠送待领取 · 弹窗）
 */
(function () {
    "use strict";

    function api(method, path, body) {
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req) return Promise.reject(new Error("未联网或未登录"));
        return req(method, path, body, true);
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getInboxModal() {
        return document.getElementById("invGiftInboxModal");
    }

    function isInboxOpen() {
        var modal = getInboxModal();
        return !!(modal && modal.style.display === "flex");
    }

    function updateInboxBadge(count) {
        var badge = document.getElementById("invInboxBadge");
        if (!badge) return;
        var n = Math.max(0, parseInt(count, 10) || 0);
        if (n > 0) {
            badge.hidden = false;
            badge.textContent = n > 9 ? "9+" : String(n);
        } else {
            badge.hidden = true;
            badge.textContent = "0";
        }
    }

    function refreshInvGiftInboxBadge() {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return Promise.resolve();
        return api("GET", "/api/dongtian-jie/gift-inbox")
            .then(function (res) {
                if (res && res.ok) {
                    updateInboxBadge(res.count != null ? res.count : (res.items && res.items.length) || 0);
                }
            })
            .catch(function () {});
    }

    function renderInboxList(items, max) {
        var list = document.getElementById("invGiftInboxList");
        var empty = document.getElementById("invGiftInboxEmpty");
        var cap = document.getElementById("invGiftInboxCap");
        if (cap) cap.textContent = String((items && items.length) || 0) + " / " + String(max || 10);
        if (!list) return;
        if (!items || items.length === 0) {
            list.innerHTML = "";
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;
        list.innerHTML = items
            .map(function (g) {
                var pid =
                    g.senderPublicId != null && g.senderPublicId >= 1 ? String(Math.floor(g.senderPublicId)) : "未知";
                var name = escapeHtml(g.senderPlayerName || "修士");
                var item = escapeHtml(g.displayName || "物品");
                var gid = escapeHtml(g.id);
                return (
                    '<li class="inv-gift-inbox-item" data-gift-id="' +
                    gid +
                    '">' +
                    '<span class="inv-gift-inbox-item__meta">来自灵网 ID ' +
                    escapeHtml(pid) +
                    " · " +
                    name +
                    "</span>" +
                    '<span class="inv-gift-inbox-item__item">' +
                    item +
                    "</span>" +
                    '<button type="button" class="btn btn--sm btn--primary inv-gift-inbox-claim">领取</button>' +
                    "</li>"
                );
            })
            .join("");
    }

    function loadInboxList() {
        return api("GET", "/api/dongtian-jie/gift-inbox")
            .then(function (res) {
                if (!res || !res.ok) return;
                renderInboxList(res.items || [], res.max || 10);
                updateInboxBadge(res.count != null ? res.count : (res.items && res.items.length) || 0);
            })
            .catch(function () {});
    }

    function snapshotLocalEquipmentKeys() {
        var keys = [];
        try {
            if (player && player.inventory && Array.isArray(player.inventory.equipment)) {
                player.inventory.equipment.forEach(function (entry) {
                    keys.push(typeof entry === "string" ? entry : JSON.stringify(entry));
                });
            }
        } catch (eSnap) {}
        return keys;
    }

    function prepareGiftInboxClaim() {
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        }
        var flushMat =
            typeof window.dongtianFlushMaterialDeltas === "function"
                ? window.dongtianFlushMaterialDeltas({ reason: "before_gift_claim" })
                : Promise.resolve({ ok: true });
        var flushInv =
            typeof window.dongtianFlushInventoryBeforeTrade === "function"
                ? window.dongtianFlushInventoryBeforeTrade()
                : Promise.resolve(true);
        return Promise.resolve(flushMat).then(function () {
            return Promise.resolve(flushInv);
        }).then(function () {
            return true;
        });
    }

    function syncClaimedMaterialsFromServer(serverPlayer) {
        if (!serverPlayer || !serverPlayer.inventory || !serverPlayer.inventory.materials) return;
        if (typeof player === "undefined" || !player) return;
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (!player.inventory || typeof player.inventory !== "object") player.inventory = {};
        try {
            player.inventory.materials = JSON.parse(JSON.stringify(serverPlayer.inventory.materials));
        } catch (eMat) {}
    }

    function applyClaimPayloadToLocal(res, preClaimEquipKeys) {
        if (!res || !res.player || typeof window.dongtianApplyServerPayload !== "function") return;
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }
        if (typeof window.dongtianCancelPendingMaterialDeltas === "function") {
            window.dongtianCancelPendingMaterialDeltas();
        }
        window.dongtianApplyServerPayload(
            {
                player: res.player,
                dungeon: res.dungeon,
                updatedAt: res.updatedAt,
                clientEpoch: res.clientEpoch,
            },
            {
                forceServerPlayer: true,
                fromServerMutation: true,
                fromGiftInboxClaim: true,
                preferLocalDungeonIfAhead: true,
                /** 领取 API 已写入服务端行囊：勿用本地材料快照盖掉馈赠 */
                respectServerInventoryAuthority: true,
            }
        );
        syncClaimedMaterialsFromServer(res.player);
        /** 领取 API 已写入服务端行囊：强制采用回包中的遗器列表，避免 merge/在途 POST 冲没礼物 */
        if (res.player && res.player.inventory && Array.isArray(res.player.inventory.equipment)) {
            player.inventory.equipment = res.player.inventory.equipment.map(function (entry) {
                return typeof entry === "string" ? entry : JSON.stringify(entry);
            });
        }
        if (typeof window.dongtianClearInventoryShadow === "function") {
            window.dongtianClearInventoryShadow();
        }
        if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
            window.dongtianSyncRevisionFromApiResponse(res);
        } else if (typeof res.clientEpoch === "number" && res.clientEpoch > 0 && typeof window.dongtianSyncEpochFromSavePayload === "function") {
            window.dongtianSyncEpochFromSavePayload({ clientEpoch: res.clientEpoch });
        }
        try {
            /** 领取以服务端为准；仅当仍有材料 delta 等待落盘时保留 dirty */
            if (
                !(typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending()) &&
                !(typeof window.dongtianCloudSavePending === "function" && window.dongtianCloudSavePending())
            ) {
                window.__dongtianLocalPlayerDirty = false;
            }
        } catch (eClr) {}
    }

    function refreshInventoryUiAfterClaim() {
        if (typeof showEquipment === "function") showEquipment();
        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
        if (typeof renderPetPanel === "function") renderPetPanel();
    }

    function claimGift(giftId, btn) {
        if (!giftId) return;
        if (btn) {
            btn.disabled = true;
            btn.textContent = "领取中…";
        }
        var preEquipKeys = snapshotLocalEquipmentKeys();
        prepareGiftInboxClaim()
            .then(function () {
                preEquipKeys = snapshotLocalEquipmentKeys();
                return api("POST", "/api/dongtian-jie/gift-inbox/claim", { giftId: giftId });
            })
            .then(function (res) {
                if (res === null) return;
                if (res && res.ok) {
                    applyClaimPayloadToLocal(res, preEquipKeys);
                    refreshInventoryUiAfterClaim();
                    if (typeof showXiuToast === "function") {
                        showXiuToast(res.message || "领取成功", false);
                    }
                    if (
                        window.DONGTIAN_CLOUD_MODE &&
                        (window.__dongtianLocalPlayerDirty ||
                            (typeof window.dongtianCloudSavePending === "function" &&
                                window.dongtianCloudSavePending()))
                    ) {
                        var afterClaimFlush =
                            typeof window.dongtianCloudFlushSaveWhenDirty === "function"
                                ? window.dongtianCloudFlushSaveWhenDirty(4500)
                                : Promise.resolve(true);
                        return afterClaimFlush.then(function () {
                            return loadInboxList();
                        });
                    }
                    return loadInboxList();
                }
                var msg = (res && res.message) || "领取失败";
                if (typeof showXiuToast === "function") showXiuToast(msg, true);
                else if (typeof alert !== "undefined") alert(msg);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "领取";
                }
            })
            .catch(function (e) {
                var msg = (e && e.message) || "领取请求失败";
                if (typeof showXiuToast === "function") showXiuToast(msg, true);
                else if (typeof alert !== "undefined") alert(msg);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "领取";
                }
            });
    }

    function openInvGiftInbox() {
        if (!window.DONGTIAN_CLOUD_MODE) {
            if (typeof alert !== "undefined") alert("收件箱需联网模式");
            return;
        }
        var modal = getInboxModal();
        if (!modal) return;
        modal.style.display = "flex";
        document.body.classList.add("inv-gift-inbox-open");
        loadInboxList();
    }

    function closeInvGiftInbox() {
        var modal = getInboxModal();
        if (modal) modal.style.display = "none";
        document.body.classList.remove("inv-gift-inbox-open");
    }

    function bindInboxUi() {
        var list = document.getElementById("invGiftInboxList");
        if (list && !list._invGiftInboxBound) {
            list._invGiftInboxBound = true;
            list.addEventListener("click", function (ev) {
                var btn = ev.target && ev.target.closest ? ev.target.closest(".inv-gift-inbox-claim") : null;
                if (!btn) return;
                var item = btn.closest ? btn.closest(".inv-gift-inbox-item") : null;
                var gid = item && item.getAttribute ? item.getAttribute("data-gift-id") : "";
                claimGift(gid, btn);
            });
        }
        var modal = getInboxModal();
        if (modal && !modal._invGiftInboxBackdropBound) {
            modal._invGiftInboxBackdropBound = true;
            modal.addEventListener("click", function (ev) {
                if (ev.target === modal) closeInvGiftInbox();
            });
        }
        if (!document._invGiftInboxEscBound) {
            document._invGiftInboxEscBound = true;
            document.addEventListener("keydown", function (ev) {
                if (ev.key !== "Escape" && ev.keyCode !== 27) return;
                if (!isInboxOpen()) return;
                closeInvGiftInbox();
                ev.preventDefault();
            });
        }
        var btn = document.getElementById("invInboxBtn");
        if (btn && !window.DONGTIAN_CLOUD_MODE) {
            btn.style.display = "none";
        }
    }

    function hookInventoryOpenClose() {
        if (typeof openInventory === "function" && !window.__invGiftInboxOpenHooked) {
            window.__invGiftInboxOpenHooked = true;
            var origOpen = openInventory;
            window.openInventory = function () {
                origOpen.apply(this, arguments);
                if (window.DONGTIAN_CLOUD_MODE) refreshInvGiftInboxBadge();
            };
        }
        if (typeof closeInventory === "function" && !window.__invGiftInboxCloseHooked) {
            window.__invGiftInboxCloseHooked = true;
            var origClose = closeInventory;
            window.closeInventory = function () {
                closeInvGiftInbox();
                origClose.apply(this, arguments);
            };
        }
    }

    /** 与 main.js 统一收件箱轮询（120s）合并；弹窗打开时一次 GET 同时刷新列表与角标 */
    function dongtianGiftInboxPollOnce() {
        if (typeof player === "object" && player && player.inCombat) return;
        if (isInboxOpen()) {
            loadInboxList();
        } else {
            refreshInvGiftInboxBadge();
        }
    }
    window.dongtianGiftInboxPollOnce = dongtianGiftInboxPollOnce;

    window.openInvGiftInbox = openInvGiftInbox;
    window.closeInvGiftInbox = closeInvGiftInbox;
    window.refreshInvGiftInboxBadge = refreshInvGiftInboxBadge;

    function initInvGiftInbox() {
        bindInboxUi();
        hookInventoryOpenClose();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initInvGiftInbox);
    } else {
        initInvGiftInbox();
    }
})();
