/**
 * 洞天劫 · 单机反作弊：检测系统时间回拨（改时间刷异步收益等），触发强制重置存档。
 */
(function () {
    "use strict";

    var GUARD_KEY = "dongtianClockGuard";
    var NOTICE_KEY = "dongtianAnticheatNotice";
    /** 允许 NTP / 手动微调；超过此幅度的回拨视为作弊 */
    var ROLLBACK_TOLERANCE_MS = 120000;
    var TICK_INTERVAL_MS = 15000;
    var tickTimer = null;
    var handling = false;

    function isStandalone() {
        return typeof window !== "undefined" && !window.DONGTIAN_CLOUD_MODE;
    }

    function readGuard() {
        try {
            var raw = localStorage.getItem(GUARD_KEY);
            if (!raw) return { maxWallMs: 0 };
            var g = JSON.parse(raw);
            if (!g || typeof g !== "object") return { maxWallMs: 0 };
            if (typeof g.maxWallMs !== "number" || isNaN(g.maxWallMs)) g.maxWallMs = 0;
            return g;
        } catch (eRead) {
            return { maxWallMs: 0 };
        }
    }

    function writeGuard(g) {
        try {
            localStorage.setItem(GUARD_KEY, JSON.stringify(g));
        } catch (eWrite) {}
    }

    function wipeStandaloneSaves() {
        var keys = ["playerData", "dungeonData", "enemyData"];
        for (var i = 0; i < keys.length; i++) {
            try {
                localStorage.removeItem(keys[i]);
            } catch (eRm) {}
        }
    }

    function markNotice() {
        try {
            sessionStorage.setItem(
                NOTICE_KEY,
                "检测到系统时间被回拨，游戏进度已强制重置。请勿修改设备时间以谋取收益。"
            );
        } catch (eNotice) {}
    }

    function detectRollback(now, g) {
        if (typeof g.maxWallMs === "number" && g.maxWallMs > 0 && now + ROLLBACK_TOLERANCE_MS < g.maxWallMs) {
            return { violation: true, deltaMs: g.maxWallMs - now };
        }
        if (window.__dongtianClockSession) {
            var sess = window.__dongtianClockSession;
            if (
                typeof sess.highWallMs === "number" &&
                sess.highWallMs > 0 &&
                now + ROLLBACK_TOLERANCE_MS < sess.highWallMs
            ) {
                return { violation: true, deltaMs: sess.highWallMs - now };
            }
            var monoElapsed = performance.now() - sess.bootMono;
            var wallElapsed = now - sess.bootWall;
            if (monoElapsed > 60000 && wallElapsed + ROLLBACK_TOLERANCE_MS < monoElapsed - 60000) {
                return { violation: true, deltaMs: monoElapsed - wallElapsed, reason: "mono" };
            }
        }
        return { violation: false };
    }

    function advanceGuard(now, g) {
        if (now > g.maxWallMs) g.maxWallMs = now;
        g.lastWallMs = now;
        g.lastCheckAt = now;
        writeGuard(g);
        if (!window.__dongtianClockSession) {
            window.__dongtianClockSession = {
                bootWall: now,
                bootMono: performance.now(),
                highWallMs: now,
            };
        } else {
            window.__dongtianClockSession.highWallMs = Math.max(window.__dongtianClockSession.highWallMs || 0, now);
        }
    }

    function handleViolation() {
        if (handling) return;
        handling = true;
        wipeStandaloneSaves();
        try {
            localStorage.removeItem(GUARD_KEY);
        } catch (eGuard) {}
        markNotice();
        try {
            location.reload();
        } catch (eReload) {
            handling = false;
        }
    }

    function tick() {
        if (!isStandalone() || handling) return { ok: true };
        var now = Date.now();
        var g = readGuard();
        var hit = detectRollback(now, g);
        if (hit.violation) {
            handleViolation();
            return { ok: false, violation: true, deltaMs: hit.deltaMs };
        }
        advanceGuard(now, g);
        return { ok: true };
    }

    /** 须在 player.js 读档前执行 */
    function bootCheck() {
        if (!isStandalone()) return { ok: true };
        var now = Date.now();
        var g = readGuard();
        var hit = detectRollback(now, g);
        if (hit.violation) {
            wipeStandaloneSaves();
            markNotice();
            writeGuard({ maxWallMs: now, lastWallMs: now, lastCheckAt: now, resetAt: now });
            window.__dongtianClockSession = {
                bootWall: now,
                bootMono: performance.now(),
                highWallMs: now,
            };
            return { ok: false, violation: true, wiped: true };
        }
        advanceGuard(now, g);
        return { ok: true };
    }

    function startMonitor() {
        if (!isStandalone() || tickTimer != null) return;
        tickTimer = setInterval(function () {
            tick();
        }, TICK_INTERVAL_MS);
        try {
            document.addEventListener("visibilitychange", function () {
                if (document.visibilityState === "visible") tick();
            });
        } catch (eVis) {}
        try {
            window.addEventListener("focus", function () {
                tick();
            });
        } catch (eFocus) {}
    }

    window.dongtianAnticheatClockBootCheck = bootCheck;
    window.dongtianAnticheatClockTick = tick;
    window.dongtianAnticheatClockInit = function () {
        if (!isStandalone()) return;
        startMonitor();
        tick();
        try {
            var msg = sessionStorage.getItem(NOTICE_KEY);
            if (msg) {
                sessionStorage.removeItem(NOTICE_KEY);
                setTimeout(function () {
                    if (typeof alert === "function") alert(msg);
                }, 400);
            }
        } catch (eInitNotice) {}
    };

    bootCheck();
})();
