/**
 * 洞天云存档 POST 重试守卫：单设备 epoch 对齐仍可自动重试；多设备/多标签/市场写档后
 * 本地有未落盘变更时，限制 staleEpoch/conflict 的自动重试次数，避免无限 POST 循环。
 * 不做玩家决策弹窗：无 dirty 时静默拉云端；有 dirty 且重试耗尽则拉云端合并后再冲档（勿静默停存）。
 */
(function () {
    var STALE_EPOCH_AUTO_RETRY_MAX = 3;
    var CONFLICT_AUTO_RETRY_MAX = 2;

    var staleEpochRetryCount = 0;
    var conflictRetryCount = 0;
    function resetCounters() {
        staleEpochRetryCount = 0;
        conflictRetryCount = 0;
    }

    function hadLocalDirty() {
        return !!window.__dongtianLocalPlayerDirty;
    }

    /**
     * POST 成功落盘后调用，恢复完整重试额度。
     */
    function onSaveSuccess() {
        resetCounters();
    }

    /**
     * 新的行囊/装备/材料变更：给予新一轮自动重试机会。
     */
    function onPlayerMutation() {
        resetCounters();
    }

    /**
     * staleEpoch / conflict 响应后的处置建议。
     * @returns {{ pullServer: boolean, scheduleRetry: boolean, setNeedsRetry: boolean, retryDelayMs: number, notifyUser: boolean }}
     */
    function handlePostReject(res) {
        var dirty = hadLocalDirty();
        var isStale = !!(res && res.staleEpoch);
        var isConflict = !!(res && res.conflict);

        if (!dirty) {
            resetCounters();
            return {
                pullServer: true,
                scheduleRetry: false,
                setNeedsRetry: false,
                retryDelayMs: 0,
                notifyUser: false,
            };
        }

        if (isStale) {
            staleEpochRetryCount++;
            var srvEp =
                res && typeof res.serverClientEpoch === "number" && res.serverClientEpoch > 0
                    ? Math.floor(res.serverClientEpoch)
                    : 0;
            /** 服务端已给出较新 revision：勿盲重试 POST（易 materialsPartial / 重进像回档），先拉云端 */
            if (srvEp > 0) {
                return {
                    pullServer: true,
                    scheduleRetry: true,
                    setNeedsRetry: false,
                    retryDelayMs: 280,
                    notifyUser: staleEpochRetryCount > STALE_EPOCH_AUTO_RETRY_MAX,
                };
            }
            if (staleEpochRetryCount <= STALE_EPOCH_AUTO_RETRY_MAX) {
                return {
                    pullServer: false,
                    scheduleRetry: true,
                    setNeedsRetry: false,
                    retryDelayMs: 150,
                    notifyUser: false,
                };
            }
            /** 勿静默 pause：否则玩家继续玩但云端不更新，重进像「莫名其妙回档」 */
            staleEpochRetryCount = 0;
            return {
                pullServer: true,
                scheduleRetry: true,
                setNeedsRetry: false,
                retryDelayMs: 500,
                notifyUser: true,
            };
        }

        if (isConflict) {
            conflictRetryCount++;
            if (conflictRetryCount <= CONFLICT_AUTO_RETRY_MAX) {
                return {
                    pullServer: false,
                    scheduleRetry: false,
                    setNeedsRetry: true,
                    retryDelayMs: 0,
                    notifyUser: false,
                };
            }
            conflictRetryCount = 0;
            return {
                pullServer: true,
                scheduleRetry: true,
                setNeedsRetry: false,
                retryDelayMs: 600,
                notifyUser: true,
            };
        }

        return {
            pullServer: false,
            scheduleRetry: false,
            setNeedsRetry: true,
            retryDelayMs: 0,
        };
    }

    window.dongtianCloudSaveRetryGuard = {
        onSaveSuccess: onSaveSuccess,
        onPlayerMutation: onPlayerMutation,
        handlePostReject: handlePostReject,
        reset: function () {
            resetCounters();
        },
    };
})();
