/**
 * 洞天劫 · 联网材料：服务端 delta API、获得材料队列冲档、消耗 server-first。
 */
(function () {
    /** 与 gold-game-api DONGTIAN_MAT_DELTA_MAX_ABS 一致：单次 delta 单材料绝对值上限 */
    var DONGTIAN_MAT_DELTA_MAX_PER_OP = 2000;
    window.DONGTIAN_MAT_DELTA_MAX_PER_OP = DONGTIAN_MAT_DELTA_MAX_PER_OP;

    var pendingMaterialDeltas = Object.create(null);
    var materialFlushTimer = null;
    var materialFlushInFlight = null;

    function apiRequest() {
        try {
            return window.parent && window.parent.goldGameApiRequest;
        } catch (e) {
            return null;
        }
    }

    function normalizeDeltaMap(deltas) {
        var out = {};
        if (!deltas || typeof deltas !== "object") return out;
        Object.keys(deltas).forEach(function (k) {
            if (!k || k === "undefined" || k.indexOf("__") === 0) return;
            var n = Math.floor(Number(deltas[k]));
            if (!n) return;
            out[k] = n;
        });
        return out;
    }

    function applyServerMaterialsToPlayer(materials) {
        if (!materials || typeof materials !== "object" || typeof player !== "object" || !player) return;
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (!player.inventory || typeof player.inventory !== "object") player.inventory = {};
        player.inventory.materials = JSON.parse(JSON.stringify(materials));
        if (typeof window.dongtianClearInventoryShadow === "function") {
            window.dongtianClearInventoryShadow();
        }
    }

    function applyOptimisticMaterial(id, amount) {
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (!player || !player.inventory || !player.inventory.materials) return;
        amount = Math.floor(amount);
        if (!amount) return;
        var cur =
            typeof readInventoryMaterialCount === "function"
                ? readInventoryMaterialCount(player.inventory.materials[id])
                : Math.max(0, Math.floor(parseInt(player.inventory.materials[id], 10) || 0));
        player.inventory.materials[id] = Math.max(0, cur + amount);
    }

    /** 离线或 API 不可用时：本地校验并扣/加材料 */
    function applyLocalMaterialDeltasOrFail(deltas) {
        deltas = normalizeDeltaMap(deltas);
        var keys = Object.keys(deltas);
        if (!keys.length) return { ok: false, message: "无效的材料变更。" };
        for (var ki = 0; ki < keys.length; ki++) {
            var mk = keys[ki];
            var delta = deltas[mk];
            if (delta < 0) {
                var need = Math.abs(delta);
                if (typeof getMaterialCount === "function" && getMaterialCount(mk) < need) {
                    return { ok: false, insufficient: true, message: "材料不足。" };
                }
            }
        }
        if (typeof addMaterial !== "function") return { ok: false, message: "行囊未就绪。" };
        for (var di = 0; di < keys.length; di++) {
            addMaterial(keys[di], deltas[keys[di]], { skipServerDelta: true, localOnly: true });
        }
        return { ok: true, localFallback: true };
    }

    /** 效果未执行时退还已扣材料（仅本地 delta，不含联网 pending 队列） */
    function refundLocalMaterialDeltas(deltas) {
        deltas = normalizeDeltaMap(deltas);
        Object.keys(deltas).forEach(function (k) {
            var d = Math.floor(Number(deltas[k]) || 0);
            if (d < 0 && typeof addMaterial === "function") {
                addMaterial(k, -d, { skipServerDelta: true, localOnly: true });
            }
        });
    }

    function shouldFallbackLocalMaterialDelta(dr) {
        if (!dr || dr.ok) return false;
        if (dr.insufficient) return false;
        if (dr.fallbackLocal) return true;
        var st = dr.__httpStatus;
        if (st === 404 || st === 502 || st === 503 || st === 504) return true;
        var msg = dr.message ? String(dr.message) : "";
        if (msg === "网络错误") return true;
        if (/材料接口未就绪|无法解析|HTML/i.test(msg)) return true;
        return false;
    }

    function enrichMaterialDeltaError(res) {
        if (!res || typeof res !== "object") {
            return { ok: false, message: "材料同步失败", fallbackLocal: true };
        }
        if (res.ok) return res;
        var st = res.__httpStatus;
        if (st === 404) {
            return {
                ok: false,
                __httpStatus: st,
                fallbackLocal: true,
                message: "材料接口未就绪：请重启 gold-game-api 并确认补丁 mat-save-v53。",
            };
        }
        if (res.message === "网络错误" || (st >= 500 && st < 600)) {
            return Object.assign({}, res, {
                fallbackLocal: true,
                message: st
                    ? "服务端异常（HTTP " + st + "），已尝试本地扣料。"
                    : "材料同步失败（服务端未返回 JSON），已尝试本地扣料。",
            });
        }
        return res;
    }

    function scheduleMaterialDeltaFlush(opts) {
        opts = opts || {};
        if (materialFlushTimer) {
            clearTimeout(materialFlushTimer);
            materialFlushTimer = null;
        }
        var inCombat = typeof player === "object" && player && player.inCombat;
        var delay = opts.immediate ? 0 : inCombat ? 1200 : 350;
        materialFlushTimer = setTimeout(function () {
            materialFlushTimer = null;
            window.dongtianFlushMaterialDeltas({ reason: opts.reason || "batch" });
        }, delay);
    }

    /** 将单材料大额变更拆成多笔 ≤上限 的 delta，顺序提交 */
    function splitMaterialDeltasIntoChunks(deltas, maxAbs) {
        maxAbs = Math.max(1, Math.floor(Number(maxAbs) || DONGTIAN_MAT_DELTA_MAX_PER_OP));
        var chunks = [];
        Object.keys(deltas).forEach(function (k) {
            var total = Math.floor(Number(deltas[k]) || 0);
            if (!total) return;
            var sign = total > 0 ? 1 : -1;
            var left = Math.abs(total);
            while (left > 0) {
                var step = Math.min(left, maxAbs);
                var piece = Object.create(null);
                piece[k] = sign * step;
                chunks.push(piece);
                left -= step;
            }
        });
        return chunks;
    }

    window.dongtianRequestMaterialDeltaChunked = function (deltas, opts) {
        opts = opts || {};
        var normalized = normalizeDeltaMap(deltas);
        var keys = Object.keys(normalized);
        if (!keys.length) {
            return Promise.resolve({ ok: false, message: "无效的材料变更。" });
        }
        var needSplit = false;
        for (var i = 0; i < keys.length; i++) {
            if (Math.abs(normalized[keys[i]]) > DONGTIAN_MAT_DELTA_MAX_PER_OP) {
                needSplit = true;
                break;
            }
        }
        if (!needSplit) {
            return window.dongtianRequestMaterialDelta(normalized, opts);
        }
        var chunks = splitMaterialDeltasIntoChunks(normalized, DONGTIAN_MAT_DELTA_MAX_PER_OP);
        var chain = Promise.resolve({ ok: true });
        chunks.forEach(function (chunk, idx) {
            chain = chain.then(function (prev) {
                if (!prev || !prev.ok) return prev;
                var chunkOpts = Object.assign({}, opts, {
                    idempotencyKey: opts.idempotencyKey
                        ? opts.idempotencyKey + ":" + idx
                        : undefined,
                });
                return window.dongtianRequestMaterialDelta(chunk, chunkOpts);
            });
        });
        return chain;
    };

    /**
     * @param {Record<string, number>} deltas
     * @param {{ reason?: string, idempotencyKey?: string }} opts
     */
    window.dongtianRequestMaterialDelta = function (deltas, opts) {
        opts = opts || {};
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) {
            return Promise.resolve({ ok: false, message: "洞天未联网，无法同步材料。" });
        }
        var req = apiRequest();
        if (!req) return Promise.resolve({ ok: false, message: "无法连接灵网。" });
        var normalized = normalizeDeltaMap(deltas);
        if (!Object.keys(normalized).length) {
            return Promise.resolve({ ok: false, message: "无效的材料变更。" });
        }
        var body = { deltas: normalized, reason: opts.reason || "client" };
        if (opts.idempotencyKey) body.idempotencyKey = String(opts.idempotencyKey).slice(0, 80);
        return req("POST", "/api/dongtian-jie/materials/delta", body, true)
            .then(function (res) {
                var parsed = enrichMaterialDeltaError(res && typeof res === "object" ? res : { ok: false, message: "材料同步失败" });
                if (parsed && parsed.ok && parsed.materials && typeof parsed.materials === "object") {
                    applyServerMaterialsToPlayer(parsed.materials);
                    if (typeof parsed.updatedAt === "number" && parsed.updatedAt > 0) {
                        window.__dongtianServerUpdatedAt = parsed.updatedAt;
                    }
                    if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                        window.dongtianSyncRevisionFromApiResponse(parsed);
                    } else if (typeof window.dongtianSyncEpochFromSavePayload === "function") {
                        window.dongtianSyncEpochFromSavePayload(parsed);
                    }
                    try {
                        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
                    } catch (eUi) {}
                }
                return parsed;
            })
            .catch(function (err) {
                var msg = err && err.message ? String(err.message) : "";
                return {
                    ok: false,
                    fallbackLocal: true,
                    message: msg || "材料同步失败，请检查网络后重试。",
                };
            });
    };

    window.dongtianApplyLocalMaterialDeltasOrFail = applyLocalMaterialDeltasOrFail;

    /** 获得材料：乐观更新 + 合并队列，防抖 POST */
    window.dongtianQueueMaterialDelta = function (id, amount, opts) {
        opts = opts || {};
        if (!id || !amount) return;
        amount = Math.floor(amount);
        if (!amount) return;
        applyOptimisticMaterial(id, amount);
        pendingMaterialDeltas[id] = (pendingMaterialDeltas[id] || 0) + amount;
        if (typeof window.dongtianMarkPlayerMutation === "function") {
            window.dongtianMarkPlayerMutation();
        }
        scheduleMaterialDeltaFlush(opts);
    };

    window.dongtianFlushMaterialDeltas = function (opts) {
        opts = opts || {};
        if (materialFlushInFlight) return materialFlushInFlight;
        var toSend = pendingMaterialDeltas;
        var keys = Object.keys(toSend);
        if (!keys.length) return Promise.resolve({ ok: true });
        var batch = normalizeDeltaMap(toSend);
        keys = Object.keys(batch);
        if (!keys.length) {
            pendingMaterialDeltas = Object.create(null);
            return Promise.resolve({ ok: true });
        }
        pendingMaterialDeltas = Object.create(null);
        if (materialFlushTimer) {
            clearTimeout(materialFlushTimer);
            materialFlushTimer = null;
        }
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) {
            return Promise.resolve({ ok: true });
        }
        materialFlushInFlight = window
            .dongtianRequestMaterialDelta(batch, { reason: opts.reason || "batch" })
            .then(function (res) {
                if (!res || !res.ok) {
                    keys.forEach(function (k) {
                        pendingMaterialDeltas[k] = (pendingMaterialDeltas[k] || 0) + batch[k];
                    });
                    if (shouldFallbackLocalMaterialDelta(res)) {
                        var localOnly = applyLocalMaterialDeltasOrFail(batch);
                        if (localOnly.ok) {
                            keys.forEach(function (k2) {
                                delete pendingMaterialDeltas[k2];
                            });
                            return { ok: true, localFallback: true };
                        }
                    }
                    if (typeof window.dongtianReloadMaterialsFromServer === "function") {
                        return window.dongtianReloadMaterialsFromServer().then(function () {
                            return res || { ok: false };
                        });
                    }
                }
                return res;
            })
            .finally(function () {
                materialFlushInFlight = null;
            });
        return materialFlushInFlight;
    };

    window.dongtianReloadMaterialsFromServer = function () {
        var req = apiRequest();
        if (!req) return Promise.resolve(false);
        return req("GET", "/api/dongtian-jie/save", undefined, true)
            .then(function (res) {
                if (
                    res &&
                    res.ok &&
                    res.data &&
                    res.data.player &&
                    res.data.player.inventory &&
                    res.data.player.inventory.materials
                ) {
                    applyServerMaterialsToPlayer(res.data.player.inventory.materials);
                    if (typeof res.data.updatedAt === "number" && res.data.updatedAt > 0) {
                        window.__dongtianServerUpdatedAt = res.data.updatedAt;
                    }
                    if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
                        window.dongtianSyncRevisionFromApiResponse(res.data);
                    } else if (typeof window.dongtianSyncEpochFromSavePayload === "function") {
                        window.dongtianSyncEpochFromSavePayload(res.data);
                    }
                    try {
                        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
                    } catch (eRm) {}
                    return true;
                }
                return false;
            })
            .catch(function () {
                return false;
            });
    };

    /** 消耗/获得：先服务端 delta，再执行 fn（材料已同步，fn 内勿再扣） */
    window.dongtianRunAfterMaterialDelta = function (btn, deltas, reason, fn) {
        var unlock = function () {
            if (btn) btn.disabled = false;
        };
        if (btn) btn.disabled = true;
        if (
            window.DONGTIAN_CLOUD_MODE &&
            window.__dongtianCloudHydrated &&
            typeof window.dongtianRequestMaterialDelta === "function"
        ) {
            var deltaFn =
                typeof window.dongtianRequestMaterialDeltaChunked === "function"
                    ? window.dongtianRequestMaterialDeltaChunked
                    : window.dongtianRequestMaterialDelta;
            return deltaFn(deltas, { reason: reason }).then(function (dr) {
                if (!dr || !dr.ok) {
                    if (shouldFallbackLocalMaterialDelta(dr)) {
                        var localApplied = applyLocalMaterialDeltasOrFail(deltas);
                        if (!localApplied.ok) {
                            unlock();
                            return localApplied;
                        }
                        var localRes = typeof fn === "function" ? fn() : { ok: false, message: "效果未执行。" };
                        if (localRes && localRes.ok === false) refundLocalMaterialDeltas(deltas);
                        unlock();
                        var out = localRes && typeof localRes === "object" ? localRes : { ok: false, message: "效果未执行。" };
                        out.localFallback = true;
                        return out;
                    }
                    unlock();
                    return { ok: false, message: (dr && dr.message) || "材料不足或灵网同步失败。" };
                }
                var res = typeof fn === "function" ? fn() : { ok: false, message: "效果未执行。" };
                unlock();
                return res && typeof res === "object" ? res : { ok: false, message: "效果未执行。" };
            });
        }
        var offlineApplied = applyLocalMaterialDeltasOrFail(deltas);
        if (!offlineApplied.ok) {
            unlock();
            return Promise.resolve(offlineApplied);
        }
        var offlineRes = typeof fn === "function" ? fn() : { ok: false, message: "效果未执行。" };
        if (offlineRes && offlineRes.ok === false) refundLocalMaterialDeltas(deltas);
        unlock();
        return Promise.resolve(offlineRes && typeof offlineRes === "object" ? offlineRes : { ok: false, message: "效果未执行。" });
    };

    window.dongtianRunEquipOpAfterMaterialDelta = function (btn, live, deltas, reason, tryFn) {
        return window.dongtianRunAfterMaterialDelta(btn, deltas, reason, function () {
            return typeof tryFn === "function" ? tryFn(live, { skipMaterialDeduct: true }) : { ok: false };
        });
    };

    window.dongtianMaterialDeltasPending = function () {
        return Object.keys(pendingMaterialDeltas).length > 0 || !!materialFlushInFlight;
    };

    /** 可消耗数量：扣除尚未冲档的乐观获得，避免界面显示有货但服务端不足 */
    window.dongtianGetSpendableMaterialCount = function (id) {
        if (!id) return 0;
        var c =
            typeof getMaterialCount === "function"
                ? Math.max(0, Math.floor(Number(getMaterialCount(id)) || 0))
                : 0;
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return c;
        var pend = pendingMaterialDeltas[id];
        if (pend > 0) c = Math.max(0, c - Math.floor(pend));
        return c;
    };

    /** 服务端档已被管理员/API 更新后：作废待发送的材料增量，避免盖回后台改的数量 */
    window.dongtianCancelPendingMaterialDeltas = function () {
        pendingMaterialDeltas = Object.create(null);
        if (materialFlushTimer) {
            clearTimeout(materialFlushTimer);
            materialFlushTimer = null;
        }
    };

    /** 灵田专用 API 已落盘某材料后：清除该 key 的待冲档增量，避免后续 flush 把开包消耗盖回 */
    window.dongtianClearPendingMaterialDeltaKeys = function (keys) {
        if (!keys || !keys.length) return;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!k || k.indexOf("__") === 0) continue;
            delete pendingMaterialDeltas[k];
        }
    };
})();
