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
        if (typeof window.bindWushenArenaOpenButton === "function") {
            try {
                window.bindWushenArenaOpenButton();
            } catch (eBind) {}
        }
    }
    window.ensureCloudMarketBarStructure = ensureCloudMarketBarStructure;

    /** 修仙市场 / 武神坛 / 副本大厅：单机、本机回退或无网络时统一提示 */
    var DONGTIAN_STANDALONE_NET_MSG = "目前为单机版无法运用这功能请加群902481027";

    function dongtianNetOfflineToast() {
        var text = DONGTIAN_STANDALONE_NET_MSG;
        var el = document.getElementById("xiuMarketToast");
        if (el) {
            el.textContent = text;
            el.style.display = "block";
            el.classList.add("xiu-market-toast--err");
            clearTimeout(el._dongtianOfflineT);
            el._dongtianOfflineT = setTimeout(function () {
                el.style.display = "none";
            }, 4200);
        } else {
            try {
                alert(text);
            } catch (e) {}
        }
    }
    /** 三项联网玩法是否应拦截并提示：无网络、单机、或嵌入但云档不可用 */
    function dongtianNetHubClickBlocked() {
        var noNet = typeof navigator !== "undefined" && navigator.onLine === false;
        var soloOrFallback = !window.DONGTIAN_CLOUD_MODE || window.__dongtianCloudLocalFallback;
        if (!noNet && !soloOrFallback) return false;
        dongtianNetOfflineToast();
        return true;
    }

    try {
        window.dongtianNetOfflineToast = dongtianNetOfflineToast;
        window.DONGTIAN_STANDALONE_NET_MSG = DONGTIAN_STANDALONE_NET_MSG;
        window.dongtianNetHubClickBlocked = dongtianNetHubClickBlocked;
    } catch (e0) {}

    function bindStandaloneNetHubStubs() {
        if (window.DONGTIAN_CLOUD_MODE) return;
        var btn = document.getElementById("xiuMarketOpenBtn");
        if (btn && !btn._dongtianStandaloneStub) {
            btn._dongtianStandaloneStub = true;
            btn.onclick = function (ev) {
                if (ev) {
                    ev.preventDefault();
                }
                dongtianNetOfflineToast();
            };
        }
    }

    /** 坊市 / 武神坛 / 副本大厅一栏：所有模式均显示；嵌入时再打 dongtian-cloud-embedded 类名 */
    function revealNetHubBar() {
        ensureCloudMarketBarStructure();
        var bar = document.getElementById("xiuMarketBar");
        if (bar) {
            try {
                bar.style.setProperty("display", "flex", "important");
            } catch (e) {
                bar.style.display = "flex";
            }
        }
        if (window.DONGTIAN_CLOUD_MODE) {
            var root = document.documentElement;
            if (root) root.classList.add("dongtian-cloud-embedded");
            if (document.body) document.body.classList.add("dongtian-cloud-embedded");
        }
        bindStandaloneNetHubStubs();
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", revealNetHubBar);
    } else {
        revealNetHubBar();
    }
})();
