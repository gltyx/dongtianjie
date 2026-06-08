/**
 * 嵌入主游戏 index 时（iframe + ?embedded=1）：启用联网账号存档，不使用 localStorage。
 */
(function () {
    function isEmbeddedCloud() {
        try {
            return /[?&]embedded=1(?:&|$)/.test(location.search || "") && window.parent !== window;
        } catch (e) {
            return false;
        }
    }
    window.DONGTIAN_CLOUD_MODE = isEmbeddedCloud();

    /**
     * 兼容旧缓存 HTML：早期只有「修仙市场」单按钮、无 .xiu-market-actions 包裹或缺少武神坛按钮时，补齐结构。
     */
    function ensureCloudMarketBarStructure() {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        var bar = document.getElementById("xiuMarketBar");
        if (!bar) return;
        var wrap = bar.querySelector(".xiu-market-actions");
        var marketBtn = document.getElementById("xiuMarketOpenBtn");
        if (!wrap) {
            wrap = document.createElement("div");
            wrap.className = "xiu-market-actions";
            if (marketBtn && marketBtn.parentNode === bar) {
                bar.insertBefore(wrap, marketBtn);
                wrap.appendChild(marketBtn);
            } else {
                bar.insertBefore(wrap, bar.firstChild);
            }
        }
        if (!document.getElementById("wushenArenaOpenBtn")) {
            var w = document.createElement("button");
            w.type = "button";
            w.id = "wushenArenaOpenBtn";
            w.className = "btn btn--sm btn--ghost wushen-arena-open-btn";
            w.setAttribute("aria-label", "武神坛");
            w.appendChild(document.createTextNode("武神坛"));
            w.setAttribute(
                "onclick",
                "if(window.__wushenArenaBarClick){window.__wushenArenaBarClick();}return false;"
            );
            wrap.appendChild(w);
        }
        if (!document.getElementById("molongHallOpenBtn")) {
            var mh = document.createElement("button");
            mh.type = "button";
            mh.id = "molongHallOpenBtn";
            mh.className = "btn btn--sm btn--ghost molong-hall-open-btn";
            mh.setAttribute("aria-label", "副本大厅");
            mh.appendChild(document.createTextNode("副本大厅"));
            mh.setAttribute("onclick", "if(window.openMolongHallModal){window.openMolongHallModal();}return false;");
            wrap.appendChild(mh);
        }
        if (!document.getElementById("dongtianHubMenuOpenBtn")) {
            var hm = document.createElement("button");
            hm.type = "button";
            hm.id = "dongtianHubMenuOpenBtn";
            hm.className = "btn btn--sm btn--ghost dongtian-hub-menu-open-btn";
            hm.setAttribute("aria-label", "菜单");
            hm.appendChild(document.createTextNode("菜单"));
            hm.setAttribute(
                "onclick",
                "if(window.openDongtianHubMenuModal){window.openDongtianHubMenuModal();}return false;"
            );
            wrap.appendChild(hm);
        }
        if (typeof window.bindWushenArenaOpenButton === "function") {
            try {
                window.bindWushenArenaOpenButton();
            } catch (eBind) {}
        }
    }
    window.ensureCloudMarketBarStructure = ensureCloudMarketBarStructure;

    /** 坊市条默认内联 display:none；须在 DOM 就绪后尽早显示，避免 init 未跑到时修仙市场/武神坛整栏消失 */
    function revealCloudMarketBar() {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        var root = document.documentElement;
        if (root) root.classList.add("dongtian-cloud-embedded");
        if (document.body) document.body.classList.add("dongtian-cloud-embedded");
        ensureCloudMarketBarStructure();
        var bar = document.getElementById("xiuMarketBar");
        if (bar) {
            try {
                bar.style.setProperty("display", "flex", "important");
            } catch (e) {
                bar.style.display = "flex";
            }
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", revealCloudMarketBar);
    } else {
        revealCloudMarketBar();
    }

    /** 主游戏手机「洞天全屏」时 postMessage，用于 dilao 内整体放大与全宽适配 */
    function syncParentMobileFullscreenClass(active) {
        var on = !!active;
        try {
            if (document.documentElement) {
                document.documentElement.classList.toggle("dongtian-parent-mobile-fs", on);
            }
            if (document.body) {
                document.body.classList.toggle("dongtian-parent-mobile-fs", on);
            }
        } catch (e) {}
    }

    function wireParentMobileFullscreenMessage() {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        window.addEventListener("message", function (ev) {
            try {
                var d = ev && ev.data;
                if (!d || !d.type) return;
                if (d.type === "dongtianParentMobileFullscreen") {
                    syncParentMobileFullscreenClass(d.active);
                    return;
                }
                /** 父页检测到 API 重启后 build 变更：子页自行带新 ?v= 重载（会先冲档） */
                if (d.type === "dongtianParentReloadAssets" && d.build != null && d.build !== "") {
                    var nextBuild = String(d.build);
                    var cur =
                        window.__DONGTIAN_SERVER_BUILD != null && window.__DONGTIAN_SERVER_BUILD !== ""
                            ? String(window.__DONGTIAN_SERVER_BUILD)
                            : window.__DONGTIAN_ASSET_BUILD != null && window.__DONGTIAN_ASSET_BUILD !== ""
                              ? String(window.__DONGTIAN_ASSET_BUILD)
                              : "";
                    if (cur && cur === nextBuild) return;
                    var flushP = Promise.resolve();
                    try {
                        if (typeof window.__dongtianCloudFlushSave === "function") {
                            window.__dongtianCloudFlushSave({
                                immediate: true,
                                forceCloud: true,
                                playerMutation: true,
                            });
                            flushP = new Promise(function (resolve) {
                                setTimeout(resolve, 1200);
                            });
                        }
                    } catch (eFlush) {}
                    flushP.finally(function () {
                        try {
                            var u = new URL(location.href);
                            u.searchParams.set("v", nextBuild);
                            u.searchParams.set("_entry", String(Date.now()));
                            location.replace(u.toString());
                        } catch (eLoc) {
                            location.reload();
                        }
                    });
                }
            } catch (e2) {}
        });
    }
    wireParentMobileFullscreenMessage();

    /** 单机直接打开 index.html：显示坊市条（菜单 + 联网入口占位），与此前 2.1 一致 */
    function revealStandaloneHubBar() {
        if (window.DONGTIAN_CLOUD_MODE) return;
        if (document.documentElement) document.documentElement.classList.add("dongtian-standalone-local");
        if (document.body) document.body.classList.add("dongtian-standalone-local");
        var bar = document.getElementById("xiuMarketBar");
        if (bar) {
            try {
                bar.style.setProperty("display", "flex", "important");
            } catch (eBar) {
                bar.style.display = "flex";
            }
        }
        var eyebrow = document.querySelector(".dongtian-hub-menu-eyebrow");
        if (eyebrow) eyebrow.textContent = "洞天单机";
    }

    function wireStandaloneNetBarButtons() {
        if (window.DONGTIAN_CLOUD_MODE) return;
        ["xiuMarketOpenBtn", "wushenArenaOpenBtn", "molongHallOpenBtn"].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn || btn._dongtianStandaloneNetBound) return;
            btn._dongtianStandaloneNetBound = true;
            btn.onclick = function () {
                if (typeof window.dongtianNetOfflineToast === "function") window.dongtianNetOfflineToast();
                return false;
            };
        });
    }

    function bootStandaloneHubBar() {
        revealStandaloneHubBar();
        wireStandaloneNetBarButtons();
    }

    window.revealStandaloneHubBar = revealStandaloneHubBar;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootStandaloneHubBar);
    } else {
        bootStandaloneHubBar();
    }
})();
