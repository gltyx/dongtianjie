/**
 * 洞天劫 · 仙府玉牒菜单（功能 / 副本 / 休闲）— 框架壳，各入口逻辑后续逐步移植。
 */
(function () {
    "use strict";

    function hubMenuToast(msg, isErr) {
        var el = document.getElementById("xiuMarketToast");
        if (el) {
            el.textContent = msg;
            el.style.display = "block";
            el.classList.toggle("xiu-market-toast--err", !!isErr);
            clearTimeout(el._dongtianHubMenuT);
            el._dongtianHubMenuT = setTimeout(function () {
                el.style.display = "none";
            }, 3200);
            return;
        }
        if (typeof defaultModalElement !== "undefined" && defaultModalElement) {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML =
                '<div class="content"><p>' +
                msg +
                '</p><div class="button-container"><button type="button" id="hub-menu-stub-ok">知晓</button></div></div>';
            var ok = document.getElementById("hub-menu-stub-ok");
            if (ok) {
                ok.onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                };
            }
            return;
        }
        try {
            alert(msg);
        } catch (e) {}
    }

    function hubMenuFeatureStub(name) {
        return function () {
            hubMenuToast("「" + name + "」即将开放，敬请期待。", false);
        };
    }

    window.dongtianNetOfflineToast = function () {
        hubMenuToast("目前为单机版无法运用这功能请加群902481027", true);
    };

    window.dongtianNetHubClickBlocked = function () {
        if (window.DONGTIAN_CLOUD_MODE) return false;
        window.dongtianNetOfflineToast();
        return true;
    };

    function setDongtianHubMenuTab(which) {
        var tabs = [
            document.getElementById("dongtianHubMenuTabFeatures"),
            document.getElementById("dongtianHubMenuTabDungeons"),
            document.getElementById("dongtianHubMenuTabCasual")
        ];
        var panels = [
            document.getElementById("dongtianHubMenuPanelFeatures"),
            document.getElementById("dongtianHubMenuPanelDungeons"),
            document.getElementById("dongtianHubMenuPanelCasual")
        ];
        if (which < 0 || which > 2) which = 0;
        for (var i = 0; i < 3; i++) {
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

    function ensureHubMenuTabsWired() {
        var hub = document.getElementById("dongtianHubMenuModal");
        if (!hub || hub._dongtianHubMenuTabsFullyWired) return;
        hub._dongtianHubMenuTabsFullyWired = true;
        var ids = ["dongtianHubMenuTabFeatures", "dongtianHubMenuTabDungeons", "dongtianHubMenuTabCasual"];
        for (var i = 0; i < ids.length; i++) {
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
        ensureHubMenuTabsWired();
        setDongtianHubMenuTab(0);
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

    window.openDongtianHubMenuModal = openHubMenuModal;
    window.closeDongtianHubMenuModal = closeHubMenuModal;
    window.setDongtianHubMenuTab = setDongtianHubMenuTab;

    /** 联网专属入口：单机/断网时与修仙市场相同提示；联网且已移植则打开对应弹窗 */
    var HUB_NET_MARKET_CARDS = {
        dongtianHubMenuShituBtn: "openDongtianShituModal",
        dongtianHubMenuZongmenBtn: "openDongtianZongmenModal",
        dongtianHubMenuLgxmBtn: "openDongtianLinggenXuemaiModal"
    };

    /** 已移植的单机/联网功能入口 */
    var HUB_FEATURE_OPEN = {
        dongtianHubMenuLingtianBtn: "openDongtianLingtianModal",
        dongtianHubMenuAlchemyBtn: "openDongtianAlchemyModal",
        dongtianHubMenuForgeBtn: "openDongtianForgeModal",
        dongtianHubMenuTreasureMapBtn: "openDongtianTreasureMapModal",
        dongtianHubMenuDragonTowerBtn: "openDragonTowerModal",
        dongtianHubMenuDemonTowerBtn: "openDemonTowerModal",
        dongtianHubMenuDivineRealmBtn: "openDivineRealmModal",
        dongtianHubMenuSpiritBeastBtn: "openSpiritBeastRealmModal",
        dongtianHubMenuGhostRealmBtn: "openGhostRealmModal",
        dongtianHubMenuYuqiBtn: "openDongtianYuqiModal",
        dongtianHubMenuSwordSpiritBtn: "openDongtianSwordSpiritModal",
        dongtianHubMenuStockBtn: "openDongtianStockModal"
    };

    /** 各功能卡片占位；后续模块移植时改为 window.openDongtianXxx 并 closeHubMenuModal */
    var HUB_CARD_STUBS = [
        ["dongtianHubMenuShituBtn", "师徒"],
        ["dongtianHubMenuZongmenBtn", "联网宗门"],
        ["dongtianHubMenuLingtianBtn", "灵田药园"],
        ["dongtianHubMenuAlchemyBtn", "炼丹阁"],
        ["dongtianHubMenuForgeBtn", "神锻阁"],
        ["dongtianHubMenuYuqiBtn", "御器"],
        ["dongtianHubMenuLgxmBtn", "灵根血脉"],
        ["dongtianHubMenuTreasureMapBtn", "藏宝图"],
        ["dongtianHubMenuDragonTowerBtn", "登龙塔"],
        ["dongtianHubMenuDemonTowerBtn", "魔神塔"],
        ["dongtianHubMenuDivineRealmBtn", "神界"],
        ["dongtianHubMenuSpiritBeastBtn", "灵兽界"],
        ["dongtianHubMenuGhostRealmBtn", "幽魂界"],
        ["dongtianHubMenuWordGuessBtn", "每日猜词"],
        ["dongtianHubMenuSwordSpiritBtn", "剑灵云游"],
        ["dongtianHubMenuStockBtn", "修仙股票"]
    ];

    function wireHubMenuCardStub(btnId, label) {
        var btn = document.getElementById(btnId);
        if (!btn || btn._dongtianHubCardBound) return;
        btn._dongtianHubCardBound = true;
        var netOpenKey = HUB_NET_MARKET_CARDS[btnId];
        var featureOpenKey = HUB_FEATURE_OPEN[btnId];
        btn.addEventListener("click", function (ev) {
            if (ev) {
                ev.preventDefault();
                ev.stopPropagation();
            }
            if (featureOpenKey && typeof window[featureOpenKey] === "function") {
                closeHubMenuModal();
                window[featureOpenKey]();
                return;
            }
            if (netOpenKey) {
                if (typeof window.dongtianNetHubClickBlocked === "function" && window.dongtianNetHubClickBlocked()) {
                    return;
                }
                if (typeof window[netOpenKey] === "function") {
                    closeHubMenuModal();
                    window[netOpenKey]();
                    return;
                }
                if (typeof window.dongtianNetOfflineToast === "function") {
                    window.dongtianNetOfflineToast();
                    return;
                }
            }
            var openKey = "openDongtian" + btnId.replace(/^dongtianHubMenu|Btn$/g, "");
            if (typeof window[openKey] === "function") {
                closeHubMenuModal();
                window[openKey]();
                return;
            }
            hubMenuFeatureStub(label)();
        });
    }

    window.initDongtianHubMenuUI = function () {
        if (typeof window.ensureCloudMarketBarStructure === "function") {
            window.ensureCloudMarketBarStructure();
        }
        ensureHubMenuTabsWired();
        var hubBtn = document.getElementById("dongtianHubMenuOpenBtn");
        if (hubBtn && !hubBtn._dongtianHubOpenBound) {
            hubBtn._dongtianHubOpenBound = true;
            hubBtn.onclick = function () {
                openHubMenuModal();
            };
        }
        var hubClose = document.getElementById("dongtianHubMenuCloseBtn");
        if (hubClose && !hubClose._dongtianHubCloseBound) {
            hubClose._dongtianHubCloseBound = true;
            hubClose.onclick = closeHubMenuModal;
        }
        for (var i = 0; i < HUB_CARD_STUBS.length; i++) {
            wireHubMenuCardStub(HUB_CARD_STUBS[i][0], HUB_CARD_STUBS[i][1]);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            try {
                window.initDongtianHubMenuUI();
            } catch (eInit) {}
        });
    } else {
        try {
            window.initDongtianHubMenuUI();
        } catch (eInit2) {}
    }
})();
