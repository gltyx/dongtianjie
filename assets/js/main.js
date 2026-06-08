// 从父页面注入的全局变量中读取散修名字（可选）；嵌入主游戏时可由 URL parentName 传入
function getParentPlayerName() {
    try {
        var m = /[?&]parentName=([^&]*)/.exec(location.search || "");
        if (m && m[1] !== undefined && m[1] !== "") {
            var dec = decodeURIComponent(String(m[1]).replace(/\+/g, " "));
            var name = dec.trim().replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/g, "");
            if (name) {
                if (name.length > 15) name = name.slice(0, 15);
                return name;
            }
        }
        var raw = window.__parentPlayerName;
        if (!raw || typeof raw !== "string") return null;
        var name = raw.trim().replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/g, "");
        if (!name) return null;
        if (name.length > 15) name = name.slice(0, 15);
        return name;
    } catch (e) {
        return null;
    }
}

function createNewPlayer(displayName) {
    player = {
        name: displayName,
        lvl: 1,
        stats: {
            hp: null,
            hpMax: null,
            atk: null,
            def: null,
            pen: null,
            atkSpd: null,
            vamp: null,
            critRate: null,
            critDmg: null
        },
        baseStats: {
            hp: 500,
            atk: 100,
            def: 50,
            pen: 0,
            atkSpd: 0.6,
            vamp: 0,
            critRate: 0,
            critDmg: 50
        },
        equippedStats: {
            hp: 0,
            atk: 0,
            def: 0,
            pen: 0,
            atkSpd: 0,
            gemPctHp: 0,
            gemPctAtk: 0,
            gemPctDef: 0,
            gemAtkSpdPct: 0,
            gemCritDmgPts: 0,
            vamp: 0,
            critRate: 0,
            critDmg: 0,
            hpPct: 0,
            atkPct: 0,
            defPct: 0,
            penPct: 0,
        },
        bonusStats: {
            hp: 0,
            atk: 0,
            def: 0,
            atkSpd: 0,
            vamp: 0,
            critRate: 0,
            critDmg: 0
        },
        /** 仅统计「境界突破三选一」写入的机缘%，上限 = 当前等级 × LVLUP_CHOICE_BONUS_PER_PICK 各属性 */
        lvlupChoiceBonusApplied: {
            hp: 0,
            atk: 0,
            def: 0,
            atkSpd: 0,
            vamp: 0,
            critRate: 0,
            critDmg: 0
        },
        /** 每级自动机缘已累计入账量（上限 = 当前等级 × player.js 中 LVLUP_AUTO_BONUS_PER_LEVEL） */
        lvlupAutoBonusApplied: {
            hp: 0,
            atk: 0,
            def: 0,
            atkSpd: 0,
            vamp: 0,
            critRate: 0,
            critDmg: 0
        },
        exp: {
            expCurr: 0,
            expMax: 100,
            expCurrLvl: 0,
            expMaxLvl: 100,
            lvlGained: 0
        },
        inventory: {
            consumables: [],
            equipment: [],
            materials: {
                enhance_stone: 0,
                enchant_stone: 0,
                god_essence_stone: 0,
                gem_material_pack: 0,
                socket_opener: 0,
                talent_fruit: 0,
                life_potion: 0,
                secret_realm_warp: 0,
                yuqi_material_pack: 0,
            },
            gems: { hp: {}, atk: {}, def: {}, atkSpd: {}, critDmg: {} },
            bagTab: "equip",
            uiFilter: { rarity: "All", slotType: "All" },
            autoBatchSell: false,
            autoBatchSellRarity: "Common"
        },
        equipped: [],
        gold: 0,
        playtime: 0,
        kills: 0,
        deaths: 0,
        // 历史最高秘境层数记录（用于“修士名录”展示）
        maxDungeonFloor: 1,
        maxDungeonFloorLvl: 1,
        maxDungeonFloorReachLvl: 1,
        maxDungeonFloorSect: null,
        inCombat: false,
        sect: null,
        learnedPassives: [],
        equippedPassives: [],
        learnedPassiveLevels: {},
        petCollection: [],
        activePetId: null,
        miningDaily: { tickets: 5, lastTs: Date.now() },
        equippedTitleId: null,
        combatTitleFxHidden: false,
        dongtianTreasureMaps: []
    };
    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();
    calculateStats();
    player.stats.hp = player.stats.hpMax;
    if (window.DONGTIAN_CLOUD_MODE && window.__dongtianCloudHydrated) {
        if (typeof dongtianMarkPlayerMutation === "function") dongtianMarkPlayerMutation();
        saveData({ forceCloud: true, playerMutation: true, skipMarkMutation: true });
    } else {
        saveData();
    }
}

var __dongtianSaveTimer = null;
/** 秘境事件/层劫等 saveData() 防抖后的保底 forceCloud（防关洞天早于 650ms 未写入） */
var __dongtianDungeonProgressSaveTimer = null;
var DONGTIAN_DUNGEON_PROGRESS_FORCE_MS = 900;
/** 任意 debounce saveData 后的全局保底 forceCloud（装备/事件/设置等） */
var __dongtianCloudSaveSafetyTimer = null;
var DONGTIAN_CLOUD_SAVE_SAFETY_MS = 1000;
/** 正在从服务端拉取洞天存档（如修仙市场购后同步）时禁止上传，避免旧内存覆盖服务端刚写入的背包 */
window.__dongtianCloudReloading = false;
function cancelPendingDongtianCloudSave() {
    if (__dongtianSaveTimer) {
        clearTimeout(__dongtianSaveTimer);
        __dongtianSaveTimer = null;
    }
    if (__dongtianDungeonProgressSaveTimer) {
        clearTimeout(__dongtianDungeonProgressSaveTimer);
        __dongtianDungeonProgressSaveTimer = null;
    }
    if (__dongtianCloudSaveSafetyTimer) {
        clearTimeout(__dongtianCloudSaveSafetyTimer);
        __dongtianCloudSaveSafetyTimer = null;
    }
    if (typeof clearDongtianCombatPeriodicCloudSave === "function") {
        clearDongtianCombatPeriodicCloudSave();
    }
}
window.cancelPendingDongtianCloudSave = cancelPendingDongtianCloudSave;

/** 关洞天/切后台：停轮询与防抖计时器，避免 iframe 隐藏后仍空转占内存 */
function dongtianTeardownTransientTimers() {
    clearProfileTabRefreshTimer();
    if (typeof stopDongtianInboxPoll === "function") stopDongtianInboxPoll();
    if (typeof stopDongtianRevisionPoll === "function") stopDongtianRevisionPoll();
    cancelPendingDongtianCloudSave();
    if (typeof window.dongtianCancelPendingMaterialDeltas === "function") {
        window.dongtianCancelPendingMaterialDeltas();
    }
    dongtianCancelEmbeddedNetReloadDebounce();
}
window.dongtianTeardownTransientTimers = dongtianTeardownTransientTimers;
window.dongtianCancelCloudSaveInFlight = function () {
    cancelPendingDongtianCloudSave();
    if (typeof window.cancelPendingDongtianInventoryCloudSave === "function") {
        window.cancelPendingDongtianInventoryCloudSave();
    }
    dongtianInvalidateCloudSaveResponses();
};
/** 拉服务端档/专用 API 结算前：取消防抖并作废在途 POST，避免旧包盖新奖 */
window.dongtianCancelBeforeServerPull = function () {
    if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
        window.dongtianCancelCloudSaveInFlight();
        return;
    }
    cancelPendingDongtianCloudSave();
    dongtianInvalidateCloudSaveResponses();
    __dongtianCloudSaveInFlight = false;
};

/**
 * 炼丹/神锻/灵根/剑灵/师徒等专用 API 已写入洞天主档后：对齐 revision 并拉档合并。
 * @param {object|null} apiRes POST 响应（含 clientEpoch / updatedAt 时优先对齐）
 */
window.dongtianReloadSaveAfterDedicatedApi = function (apiRes, applyOpts) {
    applyOpts = applyOpts || {};
    if (applyOpts.skipPreFlush !== false) applyOpts.skipPreFlush = true;
    if (applyOpts.preferLocalDungeonIfAhead !== false) applyOpts.preferLocalDungeonIfAhead = true;
    /** 专用 API 已改材料/遗器/灵宠：默认以服务端为准，避免本地脏快照盖回 */
    if (applyOpts.respectServerInventoryAuthority !== false) {
        applyOpts.respectServerInventoryAuthority = true;
    }
    if (apiRes && typeof apiRes === "object") {
        if (typeof window.dongtianSyncRevisionFromApiResponse === "function") {
            window.dongtianSyncRevisionFromApiResponse(apiRes);
        } else if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
            window.dongtianSyncRevisionFromTradeApi(apiRes);
        }
    }
    if (typeof window.dongtianReloadSaveAfterServerGrant === "function") {
        return window.dongtianReloadSaveAfterServerGrant(applyOpts);
    }
    if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
        return window.dongtianPullServerSaveAfterMutation(applyOpts);
    }
    return Promise.resolve(false);
};

/** 龙塔/魔神塔胜后待点「离开塔」：勿让 hpValidation 误剥塔标或 generateRandomEnemy */
window.dongtianTowerVictoryAwaitingClaim = function () {
    try {
        if (typeof enemyDead === "undefined" || !enemyDead) return false;
        if (
            window.__dtDragonTowerPendingFloor != null ||
            window.__dtDemonTowerPendingFloor != null ||
            window.__dtDivineRealmPendingFloor != null ||
            window.__dtSpiritBeastPendingFloor != null ||
            window.__dtGhostRealmPendingFloor != null
        ) {
            return true;
        }
        if (
            window.__dtTowerCombatActive === "dragon" ||
            window.__dtTowerCombatActive === "demon" ||
            window.__dtTowerCombatActive === "divine" ||
            window.__dtTowerCombatActive === "spiritbeast" ||
            window.__dtTowerCombatActive === "ghost"
        ) {
            return true;
        }
        if (
            typeof window.isDongtianTowerCombatSession === "function" &&
            window.isDongtianTowerCombatSession(typeof enemy !== "undefined" ? enemy : null)
        ) {
            return true;
        }
        var cp = document.getElementById("combatPanel");
        if (cp) {
            var cps = window.getComputedStyle ? window.getComputedStyle(cp) : null;
            if (cps && cps.display && cps.display !== "none") {
                var bb = document.getElementById("battleButton");
                if (bb) {
                    var bbs = window.getComputedStyle ? window.getComputedStyle(bb) : null;
                    if (
                        bbs &&
                        bbs.display &&
                        bbs.display !== "none" &&
                        bbs.visibility !== "hidden" &&
                        Number(bbs.opacity || 1) > 0.05
                    ) {
                        return true;
                    }
                }
            }
        }
    } catch (eTw) {}
    return false;
};

/** 宝图/副本大厅/武神坛/双塔/秘境主战斗：斗法态勿周期性写入主洞天档（与 endCombat 即时冲档竞态会回档装备并重开斗法） */
function dongtianIsSideCombatCloudPersistBlocked() {
    try {
        if (typeof window !== "undefined") {
            if (window.__treasureMapCombatSettling) return true;
            if (window.__treasureMapAwaitingClaim) return true;
            if (window.__wushenArenaCombatSettling) return true;
            if (
                typeof window.isTreasureMapCombatSessionActive === "function" &&
                window.isTreasureMapCombatSessionActive()
            ) {
                return true;
            }
        }
    } catch (eTm) {}
    /** 秘境小怪战同样禁止周期冲档：否则装备/强化刚改完未落盘，周期 POST 冲突后会拉旧云档覆盖身负与行囊 */
    if (typeof player === "object" && player && player.inCombat) return true;
    return false;
}

/** 副本大厅/武神坛/宝图/双塔斗法进行中：冲突重载时整包跳过，避免气血/敌态被旧云档打回 */
function dongtianSideCombatSessionActive(localWasInCombat, localEnemy) {
    if (!localWasInCombat || !localEnemy || typeof localEnemy !== "object") return false;
    return !!(
        localEnemy.molongRaid ||
        localEnemy.wushenArena ||
        localEnemy.treasureMapBattle ||
        localEnemy.dragonTower ||
        localEnemy.demonTower ||
        localEnemy.divineRealm ||
        localEnemy.spiritBeastRealm ||
        localEnemy.ghostRealm ||
        localEnemy.bossRole === "treasuremap" ||
        localEnemy.bossRole === "demontower" ||
        localEnemy.bossRole === "dragonspire" ||
        localEnemy.bossRole === "divinerealm" ||
        localEnemy.bossRole === "spiritbeast" ||
        localEnemy.bossRole === "ghostrealm"
    );
}

/** 云档合并后：本地已结束斗法而服务端仍 inCombat（陈旧周期冲档赢过结算）→ 剥掉残留，避免 resync 重开一局 */
function dongtianSanitizeStaleServerCombatAfterPayload(localWasInCombat, serverEnemySnap) {
    if (localWasInCombat || !player || !player.inCombat) return;
    player.inCombat = false;
    try {
        delete player.combatTimerSync;
    } catch (ePs) {}
    if (typeof enemyDead !== "undefined") enemyDead = false;
    if (typeof playerDead !== "undefined") playerDead = false;
    var se = serverEnemySnap && typeof serverEnemySnap === "object" ? serverEnemySnap : null;
    if (typeof enemy !== "undefined") {
        if (se) enemy = se;
        if (typeof window.stripSpecialCombatEnemyMarks === "function") {
            window.stripSpecialCombatEnemyMarks(enemy);
        }
    }
    try {
        if (typeof window !== "undefined") {
            window.__dongtianActiveTreasureMapToken = "";
            window.__treasureMapCombatMeta = null;
        }
    } catch (eTok) {}
    if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
        dungeon.status.event = false;
    }
    if (typeof generateRandomEnemy === "function") {
        try {
            if (!enemy || !enemy.stats || enemy.stats.hp < 1) generateRandomEnemy();
        } catch (eGen) {}
    }
}

/** 修士名录弹层内 1s 刷新计时器：重开卷宗菜单或切换弹层前须 clear，避免遗留 setInterval */
var __profileTabRefreshTimer = null;
function clearProfileTabRefreshTimer() {
    if (__profileTabRefreshTimer != null) {
        clearInterval(__profileTabRefreshTimer);
        __profileTabRefreshTimer = null;
    }
}

var DONGTIAN_JIE_CHANGELOG_HTML =
    '<div class="changelog-ver">' +
    '<h4 class="changelog-h4">洞天劫 2.2</h4>' +
    "<ul class=\"changelog-list\">" +
    "<li><strong>2.2 大版本：</strong>本版更新了大量新副本、新玩法与新内容，洞天枢纽与秘境之外的修行维度显著扩展，可探索、可养成、可挑战的内容比 2.0 丰富许多。</li>" +
    "<li><strong>新副本：</strong>登龙塔、魔神塔、神界、灵兽界、幽魂界等多层挑战陆续开放；各塔/界通关可获永久机缘加成，并为神锻阁累积真力。</li>" +
    "<li><strong>新玩法：</strong>剑灵云游异步游历、神锻阁六格铸纹、藏宝图守煞、御器蕴灵、炼丹阁、灵田经营等；可从洞天枢纽一站式进入。</li>" +
    "<li><strong>掉落与道具：</strong>秘境击杀独立判定藏宝图、神萃石、御器材料包（各 3%）；第 20 劫层主有 50% 几率掉落秘境穿梭器。</li>" +
    "<li><strong>单机优化：</strong>修复行囊强化/附魔/神萃扣料异常；剑灵托梦、神锻洗点改为消耗强化石。</li>" +
    "<li>承自 2.1：修复异常属性、增加跳关道具秘境穿梭器。</li>" +
    "<li>单机或断网可玩核心内容；修仙市场、武神坛、副本大厅等联网功能需联网。</li>" +
    "</ul></div>" +
    '<div class="changelog-ver changelog-ver--older">' +
    '<h4 class="changelog-h4">2.0</h4>' +
    "<ul class=\"changelog-list\">" +
    "<li>更新大量事件和机制，整体难度相较 1.0 更平滑。</li>" +
    "</ul></div>" +
    '<div class="changelog-ver changelog-ver--older">' +
    '<h4 class="changelog-h4">1.0</h4>' +
    "<ul class=\"changelog-list\">" +
    "<li>单机进度存浏览器。</li>" +
    "</ul></div>";

function dongtianSaveEncryptionAvailable() {
    try {
        return (
            typeof window.crypto !== "undefined" &&
            crypto.subtle &&
            typeof crypto.getRandomValues === "function" &&
            typeof TextEncoder !== "undefined"
        );
    } catch (eAvail) {
        return false;
    }
}

function dongtianB64FromBytes(u8) {
    var bin = "";
    for (var i = 0; i < u8.length; i++) {
        bin += String.fromCharCode(u8[i]);
    }
    return btoa(bin);
}

function dongtianBytesFromB64(s) {
    var bin = atob(String(s || ""));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

function dongtianIsEncryptedSaveEnvelope(data) {
    return (
        data &&
        data.encrypted === true &&
        data.scheme === "pbkdf2-sha256-aes256-gcm-v1" &&
        typeof data.saltB64 === "string" &&
        typeof data.ivB64 === "string" &&
        typeof data.ciphertextB64 === "string"
    );
}

var DONGTIAN_SAVE_PBKDF2_ITERATIONS = 100000;

function dongtianSaveEncryptPayload(plainUtf8, password) {
    return new Promise(function (resolve, reject) {
        if (!dongtianSaveEncryptionAvailable()) {
            reject(new Error("NO_CRYPTO"));
            return;
        }
        var salt = crypto.getRandomValues(new Uint8Array(16));
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var enc = new TextEncoder();
        var pwdBuf = enc.encode(String(password));
        crypto.subtle
            .importKey("raw", pwdBuf, "PBKDF2", false, ["deriveKey"])
            .then(function (baseKey) {
                return crypto.subtle.deriveKey(
                    {
                        name: "PBKDF2",
                        salt: salt,
                        iterations: DONGTIAN_SAVE_PBKDF2_ITERATIONS,
                        hash: "SHA-256",
                    },
                    baseKey,
                    { name: "AES-GCM", length: 256 },
                    false,
                    ["encrypt"]
                );
            })
            .then(function (aesKey) {
                var plainBytes = enc.encode(plainUtf8);
                return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, aesKey, plainBytes);
            })
            .then(function (ctBuf) {
                var ct = new Uint8Array(ctBuf);
                resolve({
                    game: "dongtian-jie",
                    format: 3,
                    encrypted: true,
                    scheme: "pbkdf2-sha256-aes256-gcm-v1",
                    exportedAt: new Date().toISOString(),
                    saltB64: dongtianB64FromBytes(salt),
                    ivB64: dongtianB64FromBytes(iv),
                    ciphertextB64: dongtianB64FromBytes(ct),
                });
            })
            .catch(reject);
    });
}

function dongtianSaveDecryptEnvelope(envelope, password) {
    return new Promise(function (resolve, reject) {
        if (!dongtianIsEncryptedSaveEnvelope(envelope)) {
            reject(new Error("无效加密存档"));
            return;
        }
        if (!dongtianSaveEncryptionAvailable()) {
            reject(new Error("NO_CRYPTO"));
            return;
        }
        var salt = dongtianBytesFromB64(envelope.saltB64);
        var iv = dongtianBytesFromB64(envelope.ivB64);
        var ct = dongtianBytesFromB64(envelope.ciphertextB64);
        var enc = new TextEncoder();
        var pwdBuf = enc.encode(String(password));
        crypto.subtle
            .importKey("raw", pwdBuf, "PBKDF2", false, ["deriveKey"])
            .then(function (baseKey) {
                return crypto.subtle.deriveKey(
                    {
                        name: "PBKDF2",
                        salt: salt,
                        iterations: DONGTIAN_SAVE_PBKDF2_ITERATIONS,
                        hash: "SHA-256",
                    },
                    baseKey,
                    { name: "AES-GCM", length: 256 },
                    false,
                    ["decrypt"]
                );
            })
            .then(function (aesKey) {
                return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, aesKey, ct);
            })
            .then(function (ptBuf) {
                resolve(new TextDecoder().decode(new Uint8Array(ptBuf)));
            })
            .catch(function () {
                reject(new Error("密码错误或文件已损坏"));
            });
    });
}

function dongtianRemoveSavePasswordOverlay() {
    var h = document.getElementById("dongtian-save-pw-host");
    if (h && h.parentNode) {
        h.parentNode.removeChild(h);
    }
}

function dongtianOpenExportPasswordModal(onConfirm) {
    dongtianRemoveSavePasswordOverlay();
    var host = document.createElement("div");
    host.id = "dongtian-save-pw-host";
    host.className = "dongtian-save-pw-host";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.innerHTML =
        '<div class="dongtian-save-pw-backdrop" id="dongtian-save-pw-backdrop" tabindex="-1"></div>' +
        '<div class="dongtian-save-pw-sheet">' +
        '<div class="content-head">' +
        "<h3>设置导出密码</h3>" +
        '<p id="dongtian-save-pw-close" tabindex="0"><i class="fa fa-xmark"></i></p>' +
        "</div>" +
        '<p class="dongtian-save-hint">导入加密存档时需填写相同密码，请牢记。</p>' +
        '<label class="dongtian-field-label" for="dongtian-export-pw1">密码</label>' +
        '<input type="password" id="dongtian-export-pw1" class="dongtian-save-pw-input" maxlength="128" autocomplete="new-password" spellcheck="false" autocapitalize="off" autocorrect="off" />' +
        '<label class="dongtian-field-label" for="dongtian-export-pw2">确认密码</label>' +
        '<input type="password" id="dongtian-export-pw2" class="dongtian-save-pw-input" maxlength="128" autocomplete="new-password" spellcheck="false" autocapitalize="off" autocorrect="off" />' +
        '<div class="dongtian-save-actions dongtian-save-pw-actions">' +
        '<button type="button" class="btn btn--sm btn--primary" id="dongtian-export-pw-ok">确认导出</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" id="dongtian-export-pw-cancel">取消</button>' +
        "</div>" +
        "</div>";
    document.body.appendChild(host);

    var inp1 = document.getElementById("dongtian-export-pw1");
    var inp2 = document.getElementById("dongtian-export-pw2");
    var close = function () {
        dongtianRemoveSavePasswordOverlay();
    };
    var tryOk = function () {
        var p1 = inp1 ? String(inp1.value || "") : "";
        var p2 = inp2 ? String(inp2.value || "") : "";
        if (!p1.trim()) {
            alert("密码不能为空。");
            return;
        }
        if (p1 !== p2) {
            alert("两次输入的密码不一致。");
            return;
        }
        dongtianRemoveSavePasswordOverlay();
        onConfirm(p1);
    };
    document.getElementById("dongtian-export-pw-ok").onclick = tryOk;
    document.getElementById("dongtian-export-pw-cancel").onclick = close;
    document.getElementById("dongtian-save-pw-close").onclick = close;
    document.getElementById("dongtian-save-pw-backdrop").onclick = close;
    if (inp2) {
        inp2.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                tryOk();
            }
        });
    }
    if (inp1) {
        inp1.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                if (inp2) inp2.focus();
            }
        });
    }
    setTimeout(function () {
        try {
            if (inp1) inp1.focus();
        } catch (eF) {}
    }, 80);
}

function dongtianOpenImportPasswordModal(onConfirm, onCancel) {
    dongtianRemoveSavePasswordOverlay();
    var host = document.createElement("div");
    host.id = "dongtian-save-pw-host";
    host.className = "dongtian-save-pw-host";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.innerHTML =
        '<div class="dongtian-save-pw-backdrop" id="dongtian-save-pw-backdrop" tabindex="-1"></div>' +
        '<div class="dongtian-save-pw-sheet">' +
        '<div class="content-head">' +
        "<h3>输入存档密码</h3>" +
        '<p id="dongtian-save-pw-close" tabindex="0"><i class="fa fa-xmark"></i></p>' +
        "</div>" +
        '<p class="dongtian-save-hint">请输入导出该文件时设置的密码。</p>' +
        '<label class="dongtian-field-label" for="dongtian-import-pw">密码</label>' +
        '<input type="password" id="dongtian-import-pw" class="dongtian-save-pw-input" maxlength="128" autocomplete="current-password" spellcheck="false" autocapitalize="off" autocorrect="off" />' +
        '<div class="dongtian-save-actions dongtian-save-pw-actions">' +
        '<button type="button" class="btn btn--sm btn--primary" id="dongtian-import-pw-ok">确认导入</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" id="dongtian-import-pw-cancel">取消</button>' +
        "</div>" +
        "</div>";
    document.body.appendChild(host);

    var inp = document.getElementById("dongtian-import-pw");
    var close = function () {
        dongtianRemoveSavePasswordOverlay();
        if (typeof onCancel === "function") {
            try {
                onCancel();
            } catch (eCan) {}
        }
    };
    var tryOk = function () {
        var pw = inp ? String(inp.value || "").trim() : "";
        if (!pw) {
            alert("密码不能为空。");
            return;
        }
        dongtianRemoveSavePasswordOverlay();
        onConfirm(pw);
    };
    document.getElementById("dongtian-import-pw-ok").onclick = tryOk;
    document.getElementById("dongtian-import-pw-cancel").onclick = close;
    document.getElementById("dongtian-save-pw-close").onclick = close;
    document.getElementById("dongtian-save-pw-backdrop").onclick = close;
    if (inp) {
        inp.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                tryOk();
            }
        });
    }
    setTimeout(function () {
        try {
            if (inp) inp.focus();
        } catch (eFi) {}
    }, 80);
}

function dongtianExportSaveTxtBlob() {
    if (!dongtianSaveEncryptionAvailable()) {
        alert("当前环境无法加密导出（请用 localhost 或 https 打开游戏）。");
        return;
    }
    dongtianOpenExportPasswordModal(function (pw) {
        var payload = {
            game: "dongtian-jie",
            format: 1,
            exportedAt: new Date().toISOString(),
            playerData: JSON.stringify(player),
            dungeonData: JSON.stringify(dungeon),
            enemyData: JSON.stringify(typeof enemy !== "undefined" && enemy ? enemy : {}),
        };
        var innerJson = JSON.stringify(payload);
        dongtianSaveEncryptPayload(innerJson, pw)
            .then(function (envelope) {
                var out = JSON.stringify(envelope, null, 2);
                var blob = new Blob([out], { type: "text/plain;charset=utf-8" });
                var a = document.createElement("a");
                var stamp = new Date();
                var fn =
                    "dongtianjie-save-" +
                    stamp.getFullYear() +
                    String(stamp.getMonth() + 1).padStart(2, "0") +
                    String(stamp.getDate()).padStart(2, "0") +
                    "-" +
                    String(stamp.getHours()).padStart(2, "0") +
                    String(stamp.getMinutes()).padStart(2, "0") +
                    ".txt";
                a.href = URL.createObjectURL(blob);
                a.download = fn;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () {
                    URL.revokeObjectURL(a.href);
                }, 4000);
            })
            .catch(function (err) {
                if (err && err.message === "NO_CRYPTO") {
                    alert("当前环境无法使用加密导出。");
                } else {
                    alert((err && err.message) || String(err));
                }
            });
    });
}

function sanitizeDongtianMenuPlayerName(raw) {
    var s = String(raw || "")
        .trim()
        .replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/g, "");
    if (s.length < 1) {
        return "无名散修";
    }
    if (s.length > 15) {
        return s.slice(0, 15);
    }
    return s;
}

var DONGTIAN_AVATAR_DATAURL_MAX = 480000;

function refreshDongtianMenuPlayerButton() {
    var pm = document.querySelector("#player-menu");
    if (pm && player) {
        var label =
            typeof formatDongtianDisplayName === "function"
                ? formatDongtianDisplayName(player.name)
                : player.name != null
                  ? String(player.name)
                  : "";
        pm.innerHTML = '<i class="fas fa-user"></i>' + label;
    }
}

function dongtianApplyImportedSavePayload(data) {
    if (!data || typeof data !== "object") throw new Error("无效数据");
    var p;
    var d;
    var e;
    if (data.playerData != null && data.dungeonData != null) {
        p = typeof data.playerData === "string" ? data.playerData : JSON.stringify(data.playerData);
        d = typeof data.dungeonData === "string" ? data.dungeonData : JSON.stringify(data.dungeonData);
        e = data.enemyData != null ? (typeof data.enemyData === "string" ? data.enemyData : JSON.stringify(data.enemyData)) : "{}";
    } else if (data.player && data.dungeon) {
        p = JSON.stringify(data.player);
        d = JSON.stringify(data.dungeon);
        e = data.enemy != null ? JSON.stringify(data.enemy) : "{}";
    } else {
        throw new Error("缺少 player/dungeon 存档字段（需导出格式或含 player、dungeon 对象）");
    }
    JSON.parse(p);
    JSON.parse(d);
    JSON.parse(e);
    if (window.DONGTIAN_CLOUD_MODE) {
        throw new Error("当前为联网嵌入模式：请用单机打开 index.html 后再使用「从文件导入」");
    }
    localStorage.setItem("playerData", p);
    localStorage.setItem("dungeonData", d);
    localStorage.setItem("enemyData", e);
    location.reload();
}

/** 与 dongtian_*.json 的 updatedAt 对齐；用于防止旧内存 POST 盖掉市场发货后的服务端存档 */
window.__dongtianServerUpdatedAt = 0;
/** 服务端 dongtian_*.json 的 clientEpoch（市场/赠送/商店 API 写入后递增）；启动时必须对齐，否则 POST 不带 epoch 会盖掉服务端行囊 */
window.__dongtianServerClientEpoch = 0;
/** 管理员最近一次改档时间戳（revision 轮询用于提示玩家） */
window.__dongtianServerAdminLastTouchAt = 0;
/** 行囊/装备等本地已改但尚未成功落盘（防抖存档排队中）；拉档/冲突重载时勿用服务端旧 player 覆盖 */
window.__dongtianLocalPlayerDirty = false;
/** 前端补丁号：与 API /api/client-build 的 dongtianPatch 一致 */
window.__DONGTIAN_CLIENT_PATCH = "pet-star-v61";

function cloneMaterialsForCloudPost(materials) {
    var out = {};
    if (!materials || typeof materials !== "object") return out;
    Object.keys(materials).forEach(function (k) {
        if (k.indexOf("__") === 0) return;
        var n = parseInt(materials[k], 10);
        if (!isFinite(n) || n < 0) return;
        out[k] = Math.floor(n);
    });
    return out;
}

function cloneGemsForCloudPost(gems) {
    var out = {};
    if (!gems || typeof gems !== "object") return out;
    try {
        Object.keys(gems).forEach(function (kind) {
            if (kind.indexOf("__") === 0) return;
            var m = gems[kind];
            if (!m || typeof m !== "object") return;
            var row = {};
            Object.keys(m).forEach(function (lvl) {
                var n = parseInt(m[lvl], 10);
                if (!isFinite(n) || n < 0) return;
                row[lvl] = Math.floor(n);
            });
            if (Object.keys(row).length) out[kind] = row;
        });
    } catch (eGmClone) {}
    return out;
}

var DONGTIAN_INV_SHADOW_KEY_PREFIX = "dongtian_inv_shadow_v2";
var DONGTIAN_INV_SHADOW_LEGACY_KEY = "dongtian_inv_shadow_v1";

/** 当前登录账号键（须与 parent getGoldGameAccountId 一致，否则禁止读写影子快照） */
function dongtianGetCloudAccountKey() {
    try {
        if (window.parent && window.parent !== window && typeof window.parent.getGoldGameAccountId === "function") {
            var aid = String(window.parent.getGoldGameAccountId() || "").trim();
            if (aid) return aid;
        }
    } catch (eAid) {}
    try {
        if (window.parent && window.parent !== window && typeof window.parent.getGoldGameAuthUsername === "function") {
            var un = String(window.parent.getGoldGameAuthUsername() || "").trim().toLowerCase();
            if (un) return "user:" + un;
        }
    } catch (eUser) {}
    if (window.__dongtianCloudAccountKey) return String(window.__dongtianCloudAccountKey);
    return "";
}
window.dongtianGetCloudAccountKey = dongtianGetCloudAccountKey;

function dongtianInventoryShadowStorageKey(accountKey) {
    var k = accountKey != null ? String(accountKey || "").trim() : dongtianGetCloudAccountKey();
    if (!k) return null;
    return DONGTIAN_INV_SHADOW_KEY_PREFIX + ":" + k;
}

function dongtianClearLegacyInventoryShadowKeys() {
    try {
        localStorage.removeItem(DONGTIAN_INV_SHADOW_LEGACY_KEY);
    } catch (eLsLeg) {}
    try {
        sessionStorage.removeItem(DONGTIAN_INV_SHADOW_LEGACY_KEY);
    } catch (eSsLeg) {}
}

/** 云存档同步异常时轻提示（避免玩家以为已落盘，重进却被旧档覆盖） */
function dongtianNotifyCloudSaveToast(msg) {
    if (!msg) return;
    try {
        var el = document.getElementById("xiuMarketToast");
        if (el) {
            el.textContent = msg;
            el.style.display = "block";
            el.classList.add("xiu-market-toast--err");
            clearTimeout(el._dtSaveToastT);
            el._dtSaveToastT = setTimeout(function () {
                el.style.display = "none";
            }, 4500);
            return;
        }
    } catch (eT) {}
    try {
        console.warn("[洞天劫存档]", msg);
    } catch (eC) {}
}
window.dongtianNotifyCloudSaveToast = dongtianNotifyCloudSaveToast;
/** 本地 player 变更代数：POST 在途期间若继续典让/换装则递增，避免旧请求成功误清 dirty 并触发回档 */
window.__dongtianLocalChangeEpoch = 0;

/** 服务端 revision 对齐后：本地须严格大于服务端 epoch，否则下一帧 POST 会被 stale 拒写 */
function dongtianAlignLocalEpochAfterServerRevision(serverEpoch) {
    var ep = Math.floor(Number(serverEpoch) || 0);
    if (ep <= 0) return;
    window.__dongtianServerClientEpoch = ep;
    var loc =
        typeof window.__dongtianLocalChangeEpoch === "number" && window.__dongtianLocalChangeEpoch > 0
            ? Math.floor(window.__dongtianLocalChangeEpoch)
            : 0;
    if (loc <= ep) window.__dongtianLocalChangeEpoch = ep + 1;
}
window.dongtianAlignLocalEpochAfterServerRevision = dongtianAlignLocalEpochAfterServerRevision;

function dongtianSyncEpochFromSavePayload(data) {
    if (!data || typeof data !== "object") return;
    var ep =
        typeof data.clientEpoch === "number" && isFinite(data.clientEpoch) && data.clientEpoch > 0
            ? Math.floor(data.clientEpoch)
            : 0;
    if (ep > 0) dongtianAlignLocalEpochAfterServerRevision(ep);
}
window.dongtianSyncEpochFromSavePayload = dongtianSyncEpochFromSavePayload;

/** 本次 POST 应携带的 clientEpoch（须严格大于服务端 revision，否则会被拒） */
function dongtianClientEpochForPost() {
    var srv =
        typeof window.__dongtianServerClientEpoch === "number" && window.__dongtianServerClientEpoch > 0
            ? Math.floor(window.__dongtianServerClientEpoch)
            : 0;
    var loc =
        typeof window.__dongtianLocalChangeEpoch === "number" && window.__dongtianLocalChangeEpoch > 0
            ? Math.floor(window.__dongtianLocalChangeEpoch)
            : 0;
    var merged = Math.max(srv, loc);
    if (srv > 0 && merged <= srv) return srv + 1;
    return merged;
}
/** 嵌入主游戏时断网/无网：刷新外层页面，避免 iframe 长期停在半初始化 */
var __dongtianEmbeddedNetReloadScheduled = false;
/** 短暂「假离线」常见（尤其移动网络）；确认持续离线后再刷新，避免玩家体感「莫名其妙退出秘境」 */
var __dongtianNetReloadPendingTimer = null;
var DONGTIAN_NET_RELOAD_CONFIRM_MS = 2800;
/** immediate：启动阶段已判定离线/读档 catch 且仍离线，立即整页恢复；否则用延迟确认，避免游玩中「假离线」误刷新 */
function dongtianEmbeddedReloadParentForNetworkRecovery(immediate) {
    if (immediate) {
        try {
            dongtianCancelEmbeddedNetReloadDebounce();
        } catch (eIm) {}
        if (__dongtianEmbeddedNetReloadScheduled) return;
        __dongtianEmbeddedNetReloadScheduled = true;
        try {
            if (window.parent && window.parent !== window) window.parent.location.reload();
            else window.location.reload();
        } catch (e) {
            window.location.reload();
        }
        return;
    }
    if (__dongtianNetReloadPendingTimer) return;
    __dongtianNetReloadPendingTimer = setTimeout(function () {
        __dongtianNetReloadPendingTimer = null;
        try {
            if (typeof navigator !== "undefined" && navigator.onLine) return;
        } catch (e0) {}
        if (__dongtianEmbeddedNetReloadScheduled) return;
        __dongtianEmbeddedNetReloadScheduled = true;
        try {
            if (window.parent && window.parent !== window) window.parent.location.reload();
            else window.location.reload();
        } catch (e) {
            window.location.reload();
        }
    }, DONGTIAN_NET_RELOAD_CONFIRM_MS);
}
function dongtianCancelEmbeddedNetReloadDebounce() {
    if (__dongtianNetReloadPendingTimer) {
        clearTimeout(__dongtianNetReloadPendingTimer);
        __dongtianNetReloadPendingTimer = null;
    }
    __dongtianEmbeddedNetReloadScheduled = false;
}
var __dongtianCombatPeriodicSaveTimer = null;
var DONGTIAN_COMBAT_CLOUD_SAVE_INTERVAL_MS = 7000;
/** 洞天云存档 POST 串行：避免多个请求并发导致旧装备/旧行囊覆盖新换装（约 1s 后回退） */
var __dongtianCloudSaveInFlight = false;
var __dongtianCloudSaveNeedsRetry = false;
/** 交易/拉档后递增：在途 POST 响应若代数已变则不得再清 dirty 或当作成功 */
var __dongtianCloudSaveToken = 0;

function dongtianInvalidateCloudSaveResponses() {
    __dongtianCloudSaveToken = (__dongtianCloudSaveToken || 0) + 1;
    __dongtianCloudSaveInFlight = false;
    /** 仍有未落盘变更时保留 needsRetry，避免作废在途 POST 后 releaseInFlight 不再冲档 */
    if (!dongtianCloudSaveStillPending()) {
        __dongtianCloudSaveNeedsRetry = false;
    }
    if (window.dongtianCloudSaveRetryGuard && typeof window.dongtianCloudSaveRetryGuard.reset === "function") {
        window.dongtianCloudSaveRetryGuard.reset();
    }
}
window.dongtianInvalidateCloudSaveResponses = dongtianInvalidateCloudSaveResponses;

function dongtianEnsureEpochAheadOfServer() {
    var srv =
        typeof window.__dongtianServerClientEpoch === "number" && window.__dongtianServerClientEpoch > 0
            ? Math.floor(window.__dongtianServerClientEpoch)
            : 0;
    var loc =
        typeof window.__dongtianLocalChangeEpoch === "number" && window.__dongtianLocalChangeEpoch > 0
            ? Math.floor(window.__dongtianLocalChangeEpoch)
            : 0;
    if (loc <= srv) {
        window.__dongtianLocalChangeEpoch = srv + 1;
        window.__dongtianLocalPlayerDirty = true;
    }
}

function dongtianCloudSaveReleaseInFlight() {
    __dongtianCloudSaveInFlight = false;
    if (dongtianCloudSaveStillPending()) {
        __dongtianCloudSaveNeedsRetry = false;
        dongtianEnsureEpochAheadOfServer();
        dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
    }
}

/** 关页/冲档失败时：localStorage+sessionStorage 保留行囊快照，下次进入若本地 epoch 更新则补回（含典让） */
function dongtianWriteInventoryShadow() {
    if (!window.DONGTIAN_CLOUD_MODE || typeof player !== "object" || !player || !player.inventory) return;
    var accountKey = dongtianGetCloudAccountKey();
    if (!accountKey) return;
    var storageKey = dongtianInventoryShadowStorageKey(accountKey);
    if (!storageKey) return;
    try {
        var ep =
            typeof window.__dongtianLocalChangeEpoch === "number" && window.__dongtianLocalChangeEpoch > 0
                ? Math.floor(window.__dongtianLocalChangeEpoch)
                : 0;
        if (ep < 1) return;
        var snap = {
            accountKey: accountKey,
            epoch: ep,
            ts: Date.now(),
            materials: player.inventory.materials ? JSON.parse(JSON.stringify(player.inventory.materials)) : {},
            gems: player.inventory.gems ? JSON.parse(JSON.stringify(player.inventory.gems)) : {},
        };
        if (Array.isArray(player.inventory.equipment)) {
            snap.equipment = player.inventory.equipment.slice();
        }
        if (Array.isArray(player.petCollection)) {
            snap.petCollection = JSON.parse(JSON.stringify(player.petCollection));
        }
        if (typeof player.gold === "number" && isFinite(player.gold)) {
            snap.gold = Math.max(0, Math.floor(player.gold));
        }
        if (typeof player.petExpDoubleCombatsRemaining === "number" && !isNaN(player.petExpDoubleCombatsRemaining)) {
            snap.petExpDoubleCombatsRemaining = Math.max(0, Math.floor(player.petExpDoubleCombatsRemaining));
        }
        if (typeof dungeon !== "undefined" && dungeon && typeof dungeon === "object") {
            try {
                snap.dungeon = JSON.parse(JSON.stringify(dungeon));
            } catch (eDnSh) {}
        }
        var snapJson = JSON.stringify(snap);
        dongtianClearLegacyInventoryShadowKeys();
        try {
            localStorage.setItem(storageKey, snapJson);
        } catch (eLs) {}
        try {
            sessionStorage.setItem(storageKey, snapJson);
        } catch (eSs) {}
    } catch (eSh) {}
}
function dongtianClearInventoryShadow() {
    dongtianClearLegacyInventoryShadowKeys();
    var storageKey = dongtianInventoryShadowStorageKey();
    if (storageKey) {
        try {
            localStorage.removeItem(storageKey);
        } catch (eLsClr) {}
        try {
            sessionStorage.removeItem(storageKey);
        } catch (eSsClr) {}
    }
}
window.dongtianClearInventoryShadow = dongtianClearInventoryShadow;

/** 换号/登出：清除指定账号（及无账号隔离的旧版）影子快照，避免跨号复制灵宠/材料 */
window.dongtianClearInventoryShadowForAccount = function (accountKey) {
    dongtianClearLegacyInventoryShadowKeys();
    var k = accountKey != null ? String(accountKey || "").trim() : dongtianGetCloudAccountKey();
    if (!k) return;
    var storageKey = dongtianInventoryShadowStorageKey(k);
    if (!storageKey) return;
    try {
        localStorage.removeItem(storageKey);
    } catch (eLs) {}
    try {
        sessionStorage.removeItem(storageKey);
    } catch (eSs) {}
};

function dongtianClientEquipListIsSubset(clientEquip, serverEquip) {
    var ce = Array.isArray(clientEquip) ? clientEquip : [];
    var se = Array.isArray(serverEquip) ? serverEquip : [];
    if (!ce.length) return true;
    if (ce.length > se.length) return false;
    var set = Object.create(null);
    for (var si = 0; si < se.length; si++) {
        set[String(se[si])] = 1;
    }
    for (var ci = 0; ci < ce.length; ci++) {
        if (!set[String(ce[ci])]) return false;
    }
    return true;
}

/** 云档拉取后：若上次关页前变更未落盘，用影子快照补回并立即冲档 */
function dongtianRestoreInventoryShadowAfterCloudLoad() {
    if (!window.DONGTIAN_CLOUD_MODE || typeof player !== "object" || !player || !player.inventory) return false;
    var accountKey = dongtianGetCloudAccountKey();
    if (!accountKey) {
        dongtianClearLegacyInventoryShadowKeys();
        return false;
    }
    window.__dongtianCloudAccountKey = accountKey;
    dongtianClearLegacyInventoryShadowKeys();
    var storageKey = dongtianInventoryShadowStorageKey(accountKey);
    if (!storageKey) return false;
    var raw = null;
    try {
        raw = localStorage.getItem(storageKey);
    } catch (eGetLs) {}
    if (!raw) {
        try {
            raw = sessionStorage.getItem(storageKey);
        } catch (eGet) {
            return false;
        }
    }
    if (!raw) return false;
    var shadow = null;
    try {
        shadow = JSON.parse(raw);
    } catch (eParse) {
        dongtianClearInventoryShadow();
        return false;
    }
    if (!shadow || typeof shadow !== "object") {
        dongtianClearInventoryShadow();
        return false;
    }
    if (String(shadow.accountKey || "").trim() !== accountKey) {
        dongtianClearInventoryShadow();
        return false;
    }
    var shEp = typeof shadow.epoch === "number" && isFinite(shadow.epoch) ? Math.floor(shadow.epoch) : 0;
    var srvEp =
        typeof window.__dongtianServerClientEpoch === "number" && window.__dongtianServerClientEpoch > 0
            ? Math.floor(window.__dongtianServerClientEpoch)
            : 0;
    var curEq = Array.isArray(player.inventory.equipment) ? player.inventory.equipment : [];
    var shEq = Array.isArray(shadow.equipment) ? shadow.equipment : null;
    var needRestore = shEp > srvEp;
    if (
        !needRestore &&
        shEp === srvEp &&
        shEq &&
        shEq.length < curEq.length &&
        dongtianClientEquipListIsSubset(shEq, curEq)
    ) {
        needRestore = true;
    }
    if (!needRestore && shEp === srvEp && Array.isArray(shadow.petCollection)) {
        var curPets = Array.isArray(player.petCollection) ? player.petCollection : [];
        if (shadow.petCollection.length > curPets.length) {
            needRestore = true;
        } else if (shadow.petCollection.length > 0) {
            var curPetIds = Object.create(null);
            for (var pi = 0; pi < curPets.length; pi++) {
                if (curPets[pi] && curPets[pi].id != null) curPetIds[String(curPets[pi].id)] = 1;
            }
            for (var pj = 0; pj < shadow.petCollection.length; pj++) {
                var sp = shadow.petCollection[pj];
                if (sp && sp.id != null && !curPetIds[String(sp.id)]) {
                    needRestore = true;
                    break;
                }
            }
        }
    }
    if (!needRestore) {
        dongtianClearInventoryShadow();
        return false;
    }
    var changed = false;
    if (shadow.materials && typeof shadow.materials === "object") {
        if (!player.inventory.materials || typeof player.inventory.materials !== "object") {
            player.inventory.materials = {};
        }
        var lm = player.inventory.materials;
        var matKeys = Object.create(null);
        Object.keys(lm).forEach(function (k) {
            if (k.indexOf("__") !== 0) matKeys[k] = 1;
        });
        Object.keys(shadow.materials).forEach(function (k) {
            if (k.indexOf("__") === 0) return;
            matKeys[k] = 1;
        });
        Object.keys(matKeys).forEach(function (k) {
            var shv = Math.max(0, Math.floor(parseInt(shadow.materials[k], 10) || 0));
            var curv = Math.max(0, Math.floor(parseInt(lm[k], 10) || 0));
            var merged = Math.max(shv, curv);
            if ((parseInt(lm[k], 10) || 0) !== merged) {
                lm[k] = merged;
                changed = true;
            }
        });
    }
    if (shadow.gems && typeof shadow.gems === "object") {
        try {
            var gemsJson = JSON.stringify(shadow.gems);
            if (JSON.stringify(player.inventory.gems || {}) !== gemsJson) {
                player.inventory.gems = JSON.parse(gemsJson);
                changed = true;
            }
        } catch (eGm) {}
    }
    if (shadow.petExpDoubleCombatsRemaining != null) {
        var pe = Math.max(0, Math.floor(Number(shadow.petExpDoubleCombatsRemaining) || 0));
        var curPe =
            typeof player.petExpDoubleCombatsRemaining === "number" && !isNaN(player.petExpDoubleCombatsRemaining)
                ? Math.max(0, Math.floor(player.petExpDoubleCombatsRemaining))
                : 0;
        if (pe !== curPe) {
            player.petExpDoubleCombatsRemaining = pe;
            changed = true;
        }
    }
    if (Array.isArray(shadow.equipment)) {
        var curEqRestore = Array.isArray(player.inventory.equipment) ? player.inventory.equipment : [];
        var shEqRestore = shadow.equipment;
        /** 典让/转出未落盘：影子 epoch 更新且行囊为云端子集 → 以影子为准，勿只合并追加 */
        var shadowEqAuthoritative =
            needRestore &&
            ((shEp > srvEp &&
                shEqRestore.length <= curEqRestore.length &&
                dongtianClientEquipListIsSubset(shEqRestore, curEqRestore)) ||
                (shEqRestore.length < curEqRestore.length &&
                    dongtianClientEquipListIsSubset(shEqRestore, curEqRestore)));
        if (shadowEqAuthoritative) {
            var normEq = shEqRestore.map(function (e) {
                return typeof e === "string" ? e : JSON.stringify(e);
            });
            if (JSON.stringify(curEqRestore) !== JSON.stringify(normEq)) {
                player.inventory.equipment = normEq;
                changed = true;
            }
        } else {
            var mergedEq = curEqRestore.slice();
            var eqKeys = Object.create(null);
            for (var ei = 0; ei < mergedEq.length; ei++) {
                eqKeys[dongtianInventoryEquipmentEntryKey(mergedEq[ei])] = 1;
            }
            var eqAdded = false;
            for (var sj = 0; sj < shEqRestore.length; sj++) {
                var sk = dongtianInventoryEquipmentEntryKey(shEqRestore[sj]);
                if (!sk || eqKeys[sk]) continue;
                mergedEq.push(
                    typeof shEqRestore[sj] === "string" ? shEqRestore[sj] : JSON.stringify(shEqRestore[sj])
                );
                eqKeys[sk] = 1;
                eqAdded = true;
            }
            if (eqAdded) {
                player.inventory.equipment = mergedEq;
                changed = true;
            }
        }
    }
    if (Array.isArray(shadow.petCollection)) {
        var curPetsRestore = Array.isArray(player.petCollection) ? player.petCollection : [];
        var mergedPets = curPetsRestore.slice();
        var petIds = Object.create(null);
        for (var pk = 0; pk < mergedPets.length; pk++) {
            if (mergedPets[pk] && mergedPets[pk].id != null) petIds[String(mergedPets[pk].id)] = 1;
        }
        var petAdded = false;
        for (var pp = 0; pp < shadow.petCollection.length; pp++) {
            var sp = shadow.petCollection[pp];
            if (!sp || sp.id == null) continue;
            var sid = String(sp.id);
            if (petIds[sid]) continue;
            mergedPets.push(sp);
            petIds[sid] = 1;
            petAdded = true;
        }
        if (petAdded) {
            player.petCollection = mergedPets;
            changed = true;
        }
    }
    if (typeof shadow.gold === "number" && isFinite(shadow.gold)) {
        var shGold = Math.max(0, Math.floor(shadow.gold));
        var curGold =
            typeof player.gold === "number" && isFinite(player.gold) ? Math.max(0, Math.floor(player.gold)) : 0;
        var mergedGold = Math.max(shGold, curGold);
        if (mergedGold !== curGold) {
            player.gold = mergedGold;
            changed = true;
        }
    }
    if (shadow.dungeon && typeof shadow.dungeon === "object" && typeof mergeDungeonDefaults === "function") {
        try {
            var srvDn =
                typeof dungeon !== "undefined" && dungeon ? mergeDungeonDefaults(dungeon) : mergeDungeonDefaults(null);
            var shDn = mergeDungeonDefaults(shadow.dungeon);
            var dnCmp = dongtianDungeonProgressCompare(shDn, srvDn);
            var shadowFreshReset =
                typeof dongtianPayloadLooksLikeFreshRunReset === "function" &&
                dongtianPayloadLooksLikeFreshRunReset(player, shDn);
            if (dnCmp > 0 || (dnCmp < 0 && shadowFreshReset)) {
                dungeon = shDn;
                if (typeof window.dongtianSyncEscortMiningGlobalsFromDungeon === "function") {
                    window.dongtianSyncEscortMiningGlobalsFromDungeon();
                }
                changed = true;
            }
        } catch (eDnRestore) {}
    }
    if (!changed) {
        dongtianClearInventoryShadow();
        return false;
    }
    dongtianAlignLocalEpochAfterServerRevision(Math.max(shEp, window.__dongtianServerClientEpoch || 0));
    window.__dongtianLocalPlayerDirty = true;
    return true;
}

/** 行囊/装备/材料/强化附魔等 player 变更：递增代数；若有旧 POST 在途则排队重试 */
function dongtianMarkPlayerMutation() {
    window.__dongtianLocalPlayerDirty = true;
    window.__dongtianLocalChangeEpoch =
        (typeof window.__dongtianLocalChangeEpoch === "number" ? window.__dongtianLocalChangeEpoch : 0) + 1;
    dongtianWriteInventoryShadow();
    if (
        window.dongtianCloudSaveRetryGuard &&
        typeof window.dongtianCloudSaveRetryGuard.onPlayerMutation === "function"
    ) {
        window.dongtianCloudSaveRetryGuard.onPlayerMutation();
    }
    if (__dongtianCloudSaveInFlight) {
        __dongtianCloudSaveNeedsRetry = true;
    }
}
window.dongtianMarkPlayerMutation = dongtianMarkPlayerMutation;

/** 材料/宝石变更：与装备相同，整包 POST（含 materialsSnapshot / gemsSnapshot） */
window.dongtianScheduleMaterialsCloudSave = function () {
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return;
    scheduleDongtianCloudSave();
};

/** 立即整包冲档（拉档/交易前等场景） */
window.dongtianPersistMaterialsNow = function () {
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) {
        return Promise.resolve(false);
    }
    if (typeof window.dongtianCancelBeforeServerPull === "function") {
        window.dongtianCancelBeforeServerPull();
    } else {
        cancelPendingDongtianCloudSave();
        dongtianInvalidateCloudSaveResponses();
    }
    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
    if (typeof window.dongtianCloudFlushSaveWhenDirty === "function") {
        return window.dongtianCloudFlushSaveWhenDirty(8000);
    }
    return Promise.resolve(true);
};

/** 强化/附魔/换装等：触发整包冲档；默认不阻塞 UI，交易/拉档前请传 waitMs 或调 dongtianFlushInventoryBeforeTrade */
window.dongtianPersistInventoryNow = function (optWaitMs, skipMark) {
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) {
        return Promise.resolve(false);
    }
    var flushMat =
        typeof window.dongtianFlushMaterialDeltas === "function"
            ? window.dongtianFlushMaterialDeltas({ reason: "before_inventory_save" })
            : Promise.resolve({ ok: true });
    return flushMat.then(function () {
        if (!skipMark) dongtianMarkPlayerMutation();
        if (typeof saveData === "function" && !skipMark) {
            saveData({ forceCloud: true, playerMutation: true, skipMarkMutation: true });
        }
        var waitMs = typeof optWaitMs === "number" && optWaitMs > 0 ? optWaitMs : 0;
        if (waitMs > 0 && typeof window.dongtianCloudFlushSaveWhenDirty === "function") {
            return window.dongtianCloudFlushSaveWhenDirty(waitMs);
        }
        return Promise.resolve(true);
    });
};

/** 行囊/云存档是否仍有在途或未落盘变更（赠送/上架/副本开战前须为 false） */
window.dongtianCloudSavePending = function () {
    return !!(
        window.__dongtianLocalPlayerDirty ||
        __dongtianCloudSaveNeedsRetry ||
        __dongtianCloudSaveInFlight ||
        (typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending())
    );
};

/** 典让/换装/赠送/副本开战前：等待行囊落盘 */
window.dongtianFlushInventoryBeforeTrade = function () {
    var flushMat =
        typeof window.dongtianFlushMaterialDeltas === "function"
            ? window.dongtianFlushMaterialDeltas({ reason: "before_trade" })
            : Promise.resolve({ ok: true });
    return Promise.resolve(flushMat).then(function () {
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        if (
            window.dongtianCloudSaveRetryGuard &&
            typeof window.dongtianCloudSaveRetryGuard.reset === "function"
        ) {
            window.dongtianCloudSaveRetryGuard.reset();
        }
        if (typeof window.dongtianCloudSavePending === "function" && window.dongtianCloudSavePending()) {
            if (typeof window.__dongtianCloudFlushSave === "function") {
                window.__dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
            }
        }
        if (typeof window.dongtianCloudFlushSaveWhenDirty !== "function") {
            return Promise.resolve(true);
        }
        return window.dongtianCloudFlushSaveWhenDirty(8000);
    });
};

function dongtianMaterialCountFromPlayer(p, key) {
    if (!p || !key || !p.inventory || !p.inventory.materials) return 0;
    return Math.max(0, Math.floor(parseInt(p.inventory.materials[key], 10) || 0));
}

/** 只读拉取服务端洞天档（不做本地 merge，供坊市交易校验） */
window.dongtianFetchServerSaveSnapshot = function () {
    var req = window.parent && window.parent.goldGameApiRequest;
    if (!req) return Promise.resolve(null);
    return req("GET", "/api/dongtian-jie/save", undefined, true)
        .then(function (res) {
            if (res && res.ok && res.data && res.data.player) return res.data;
            return null;
        })
        .catch(function () {
            return null;
        });
};

/**
 * 坊市赠送/上架前：先冲材料 delta，再校验服务端是否真有货。
 * 材料类：云端数量足够即可交易，勿阻塞在「整包云存档 dirty 未清」上（界面 1322、云端已同步 100 仍可赠 10）。
 */
window.dongtianPrepareMarketTrade = function (opts) {
    opts = opts || {};
    var kind = String(opts.kind || "");
    var flushMat =
        typeof window.dongtianFlushMaterialDeltas === "function"
            ? window.dongtianFlushMaterialDeltas({ reason: "before_market_trade" })
            : Promise.resolve({ ok: true });
    return Promise.resolve(flushMat).then(function () {
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        if (
            window.dongtianCloudSaveRetryGuard &&
            typeof window.dongtianCloudSaveRetryGuard.reset === "function"
        ) {
            window.dongtianCloudSaveRetryGuard.reset();
        }
        if (typeof window.dongtianCloudSavePending === "function" && window.dongtianCloudSavePending()) {
            if (typeof window.__dongtianCloudFlushSave === "function") {
                window.__dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
            }
        }
        var waitFlush =
            typeof window.dongtianCloudFlushSaveWhenDirty === "function"
                ? window.dongtianCloudFlushSaveWhenDirty(5000)
                : Promise.resolve(true);
        return waitFlush.then(function (flushOk) {
            return window.dongtianFetchServerSaveSnapshot().then(function (snap) {
                if (!snap || !snap.player) {
                    return { ok: false, message: "无法读取云端行囊，请检查联网" };
                }
                var p = snap.player;
                if (kind === "material") {
                    var mk = String(opts.materialKey || "");
                    var need = Math.floor(parseInt(opts.materialAmount, 10) || 0);
                    var have = dongtianMaterialCountFromPlayer(p, mk);
                    if (need > 0 && have >= need) {
                        return { ok: true, serverMaterialCount: have, flushOk: flushOk };
                    }
                    var localHave =
                        typeof getMaterialCount === "function" ? getMaterialCount(mk) : have;
                    if (need > 0 && have < need) {
                        return {
                            ok: false,
                            message:
                                "云端材料不足：需要 " +
                                need +
                                "，云端 " +
                                have +
                                " 个" +
                                (localHave > have ? "（界面显示 " + localHave + "，请刷新页面同步）" : ""),
                            serverMaterialCount: have,
                        };
                    }
                    return { ok: false, message: "材料数量无效" };
                }
                if (kind === "equip") {
                    var eqIdx = parseInt(opts.equipIndex, 10);
                    var eq = p.inventory && Array.isArray(p.inventory.equipment) ? p.inventory.equipment : [];
                    if (Number.isFinite(eqIdx) && eqIdx >= 0 && eqIdx < eq.length && eq[eqIdx]) {
                        return { ok: true, flushOk: flushOk };
                    }
                    return {
                        ok: false,
                        message: flushOk
                            ? "云端行囊中没有该遗器（请刷新页面后再试）"
                            : "行囊变更尚未同步至云端，请稍候再试",
                    };
                }
                if (kind === "pet") {
                    var pid = String(opts.petId || "");
                    var pets = Array.isArray(p.petCollection) ? p.petCollection : [];
                    var found = pets.some(function (pet) {
                        return pet && String(pet.id) === pid;
                    });
                    if (found) return { ok: true, flushOk: flushOk };
                    return {
                        ok: false,
                        message: flushOk
                            ? "云端灵宠栏中未找到该灵宠（请刷新页面后再试）"
                            : "行囊变更尚未同步至云端，请稍候再试",
                    };
                }
                if (kind === "pet_equip") {
                    var peid = String(opts.petEquipId || "");
                    var peBag = Array.isArray(p.petEquipmentBag) ? p.petEquipmentBag : [];
                    var peFound = peBag.some(function (it) {
                        return it && String(it.id) === peid && !it.equippedOn;
                    });
                    if (peFound) return { ok: true, flushOk: flushOk };
                    return {
                        ok: false,
                        message: flushOk
                            ? "云端法器行囊中未找到该法器（请刷新页面后再试）"
                            : "行囊变更尚未同步至云端，请稍候再试",
                    };
                }
                if (flushOk) return { ok: true, flushOk: true };
                return { ok: false, message: "行囊变更尚未同步至云端，请稍候再试" };
            });
        });
    });
};

function dongtianCloudSaveStillPending() {
    return !!(
        window.__dongtianLocalPlayerDirty ||
        __dongtianCloudSaveNeedsRetry ||
        __dongtianCloudSaveInFlight ||
        (typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending())
    );
}
window.dongtianCloudSavePending = dongtianCloudSaveStillPending;

/** 行囊/装备/材料尚有未落盘变更时：等待冲档完成（副本结算拉档前须先调用，避免旧云档盖回强化附魔/材料） */
window.dongtianCloudFlushSaveWhenDirty = function (optMaxWaitMs) {
    var maxWait = typeof optMaxWaitMs === "number" && optMaxWaitMs > 0 ? optMaxWaitMs : 4500;
    var flushMat =
        typeof window.dongtianFlushMaterialDeltas === "function"
            ? window.dongtianFlushMaterialDeltas({ reason: "flush_when_dirty" })
            : Promise.resolve({ ok: true });
    return Promise.resolve(flushMat).then(function () {
        if (!dongtianCloudSaveStillPending()) {
            return true;
        }
        var started = Date.now();
        return new Promise(function (resolve) {
            function tick() {
                if (!dongtianCloudSaveStillPending()) {
                    resolve(true);
                    return;
                }
                if (Date.now() - started >= maxWait) {
                    resolve(false);
                    return;
                }
                if (!__dongtianCloudSaveInFlight) {
                    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                }
                setTimeout(tick, 180);
            }
            tick();
        });
    });
};

/** 装备/材料等关键变更：立即冲档（联网模式） */
window.savePlayerMutation = function () {
    if (typeof saveData === "function") {
        saveData({ forceCloud: true, playerMutation: true });
    }
};

function dongtianBuildCloudSavePostBody() {
    if (typeof player !== "object" || !player) return null;
    if (typeof window.syncCombatWallTimersToPlayer === "function") window.syncCombatWallTimersToPlayer();
    if (
        window.__dongtianLocalPlayerDirty ||
        __dongtianCloudSaveNeedsRetry ||
        __dongtianCloudSaveInFlight
    ) {
        dongtianEnsureEpochAheadOfServer();
    }
    var base =
        typeof window.__dongtianServerUpdatedAt === "number" && window.__dongtianServerUpdatedAt > 0
            ? window.__dongtianServerUpdatedAt
            : undefined;
    /** 深拷贝 player，避免 POST 串行/拉档竞态下 materials 与 equipped 不同步 */
    var playerSnap = JSON.parse(JSON.stringify(player));
    var postBody = {
        player: playerSnap,
        dungeon: typeof dungeon !== "undefined" ? dungeon : null,
        enemy: typeof enemy !== "undefined" ? enemy : null,
    };
    postBody.materialsSnapshot = cloneMaterialsForCloudPost(
        playerSnap.inventory && playerSnap.inventory.materials ? playerSnap.inventory.materials : {}
    );
    postBody.gemsSnapshot = cloneGemsForCloudPost(
        playerSnap.inventory && playerSnap.inventory.gems ? playerSnap.inventory.gems : {}
    );
    if (base !== undefined) postBody.baseUpdatedAt = base;
    var sentEpoch = dongtianClientEpochForPost();
    if (sentEpoch > 0) postBody.clientEpoch = sentEpoch;
    var resetGen = Math.floor(Number(player.__dongtianRunResetGeneration) || 0);
    if (resetGen > 0) postBody.runResetGeneration = resetGen;
    return { postBody: postBody, sentEpoch: sentEpoch };
}

/** 启动迁移/轻量 player 字段修补：联网须 forceCloud，避免 debounce 旧包盖服务端 */
window.dongtianPersistBootSave = function () {
    if (window.DONGTIAN_CLOUD_MODE && typeof saveData === "function") {
        saveData({ forceCloud: true, playerMutation: true });
    } else if (typeof saveData === "function") {
        saveData();
    }
};
/** 出战/界面类 player 小改动（非行囊遗器） */
window.dongtianPersistPlayerUiChange = function () {
    if (window.DONGTIAN_CLOUD_MODE && typeof saveData === "function") {
        saveData({ forceCloud: true, playerMutation: true });
    } else if (typeof saveData === "function") {
        saveData();
    }
};

/** 战败/关洞天/专用结算后：统一 forceCloud 冲档，避免 inCombat 或 revision 落后导致重进回档 */
window.dongtianFlushCloudSaveImmediate = function () {
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return;
    if (__dongtianCloudSaveInFlight && typeof window.dongtianInvalidateCloudSaveResponses === "function") {
        window.dongtianInvalidateCloudSaveResponses();
    }
    dongtianEnsureEpochAheadOfServer();
    dongtianWriteInventoryShadow();
    if (
        window.dongtianCloudSaveRetryGuard &&
        typeof window.dongtianCloudSaveRetryGuard.reset === "function"
    ) {
        window.dongtianCloudSaveRetryGuard.reset();
    }
    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
};

/** 关页时用 keepalive 再 POST 一次，避免 fetch 在卸载中被浏览器取消 */
function dongtianCloudFlushSaveKeepalive() {
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return false;
    if (!window.__dongtianLocalPlayerDirty && !__dongtianCloudSaveNeedsRetry) return false;
    try {
        var built = dongtianBuildCloudSavePostBody();
        if (!built || !built.postBody) return false;
        var parentWin = window.parent;
        if (!parentWin || parentWin === window) return false;
        var base = parentWin.GOLD_GAME_API_BASE;
        var token =
            typeof parentWin.getGoldGameAuthToken === "function" ? parentWin.getGoldGameAuthToken() : null;
        if (!base || !token) return false;
        var url = String(base).replace(/\/$/, "") + "/api/dongtian-jie/save";
        var bodyStr = JSON.stringify(built.postBody);
        if (bodyStr.length > 60000) return false;
        fetch(url, {
            method: "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
            body: bodyStr,
            keepalive: true,
        }).catch(function () {});
        return true;
    } catch (eKa) {
        return false;
    }
}

/** @param {{ teardown?: boolean }} [opts] teardown 默认 true；父页关洞天冲档时传 false，避免用户取消关闭后收件箱轮询已停 */
function dongtianCloudFlushOnPageExit(opts) {
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return;
    if (!opts || opts.teardown !== false) dongtianTeardownTransientTimers();
    if (
        !window.__dongtianLocalPlayerDirty &&
        !__dongtianCloudSaveNeedsRetry &&
        !__dongtianCloudSaveInFlight &&
        !(typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending())
    ) {
        return;
    }
    var exitFlush = function () {
        try {
            if (typeof window.cancelPendingDongtianCloudSave === "function") window.cancelPendingDongtianCloudSave();
            dongtianWriteInventoryShadow();
            dongtianCloudFlushSaveKeepalive();
            dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
        } catch (eExit) {}
    };
    /** 卸载中 promise 可能来不及 resolve：先同步 keepalive 冲档，再异步补材料 delta */
    exitFlush();
    if (typeof window.dongtianFlushMaterialDeltas === "function") {
        window.dongtianFlushMaterialDeltas({ reason: "page_exit" }).finally(exitFlush);
    }
}

function dongtianSyncRejectMetaFromSaveResponse(res) {
    if (!res || typeof res !== "object") return;
    if (typeof res.serverUpdatedAt === "number" && res.serverUpdatedAt > 0) {
        window.__dongtianServerUpdatedAt = res.serverUpdatedAt;
    }
    if (typeof res.serverClientEpoch === "number" && res.serverClientEpoch > 0) {
        dongtianAlignLocalEpochAfterServerRevision(Math.floor(res.serverClientEpoch));
    }
}

function dongtianCloudFlushSave(opts) {
    opts = opts || {};
    try {
        if (window.__dongtianCloudReloading) return;
        if (!window.__dongtianCloudHydrated) return;
        if (__dongtianCloudSaveInFlight) {
            __dongtianCloudSaveNeedsRetry = true;
            return;
        }
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req || typeof player !== "object" || !player) return;
        var doPost = function () {
            var runSavePost = function () {
            if (__dongtianCloudSaveInFlight) {
                __dongtianCloudSaveNeedsRetry = true;
                return;
            }
            if (!opts.forceCloud && dongtianIsSideCombatCloudPersistBlocked()) return;
            if (
                !opts.forceCloud &&
                !opts.playerMutation &&
                !dongtianCloudSaveStillPending()
            ) {
                return;
            }
            if (
                opts.forceCloud ||
                opts.playerMutation ||
                window.__dongtianLocalPlayerDirty ||
                __dongtianCloudSaveNeedsRetry
            ) {
                dongtianEnsureEpochAheadOfServer();
            }
            var built = dongtianBuildCloudSavePostBody();
            if (!built) return;
            var postBody = built.postBody;
            var sentEpoch = built.sentEpoch;
            var localEpochAtSend =
                typeof window.__dongtianLocalChangeEpoch === "number" && window.__dongtianLocalChangeEpoch > 0
                    ? Math.floor(window.__dongtianLocalChangeEpoch)
                    : 0;
            var saveToken = __dongtianCloudSaveToken;
            __dongtianCloudSaveInFlight = true;
            req("POST", "/api/dongtian-jie/save", postBody, true)
                .then(function (res) {
                    if (saveToken !== __dongtianCloudSaveToken || window.__dongtianCloudReloading) {
                        return;
                    }
                    if (res && res.ok && typeof res.updatedAt === "number") {
                        if (res.materialsOnly) {
                            window.__dongtianServerUpdatedAt = res.updatedAt;
                            if (typeof res.clientEpoch === "number" && res.clientEpoch > 0) {
                                dongtianAlignLocalEpochAfterServerRevision(Math.floor(res.clientEpoch));
                            }
                            window.__dongtianLocalPlayerDirty = true;
                            __dongtianCloudSaveNeedsRetry = true;
                            __dongtianCloudSaveInFlight = false;
                            setTimeout(function () {
                                dongtianEnsureEpochAheadOfServer();
                                dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                            }, 120);
                            return;
                        }
                        window.__dongtianServerUpdatedAt = res.updatedAt;
                        if (typeof res.clientEpoch === "number" && res.clientEpoch > 0) {
                            dongtianAlignLocalEpochAfterServerRevision(Math.floor(res.clientEpoch));
                        } else if (sentEpoch > 0) {
                            dongtianAlignLocalEpochAfterServerRevision(
                                Math.max(
                                    typeof window.__dongtianServerClientEpoch === "number"
                                        ? Math.floor(window.__dongtianServerClientEpoch)
                                        : 0,
                                    sentEpoch + 1
                                )
                            );
                        }
                        /** 落盘成功且 POST 期间无新的行囊变更 → 可清 dirty；勿用 sentEpoch===local（服务端落盘后会 +1 revision） */
                        if (
                            !dongtianCloudSaveStillPending() &&
                            (localEpochAtSend <= 0 || window.__dongtianLocalChangeEpoch === localEpochAtSend)
                        ) {
                            window.__dongtianLocalPlayerDirty = false;
                            __dongtianCloudSaveNeedsRetry = false;
                            dongtianClearInventoryShadow();
                        } else if (localEpochAtSend > 0 && window.__dongtianLocalChangeEpoch !== localEpochAtSend) {
                            __dongtianCloudSaveNeedsRetry = true;
                        }
                        if (
                            typeof res.dongtianPublicId === "number" &&
                            res.dongtianPublicId >= 1 &&
                            res.dongtianPublicId <= 10000 &&
                            player
                        ) {
                            player.dongtianPublicId = Math.floor(res.dongtianPublicId);
                        }
                        if (
                            window.dongtianCloudSaveRetryGuard &&
                            typeof window.dongtianCloudSaveRetryGuard.onSaveSuccess === "function"
                        ) {
                            window.dongtianCloudSaveRetryGuard.onSaveSuccess();
                        }
                        return;
                    }
                    if (res && res.rateLimited) {
                        var retryMs =
                            typeof res.retryAfterMs === "number" && res.retryAfterMs > 0 ? res.retryAfterMs + 80 : 700;
                        __dongtianCloudSaveInFlight = false;
                        setTimeout(function () {
                            dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                        }, retryMs);
                        return;
                    }
                    if (res && (res.staleEpoch || res.conflict || res.materialsPartial)) {
                        dongtianSyncRejectMetaFromSaveResponse(res);
                        if (res.staleEpoch && !(typeof res.serverClientEpoch === "number" && res.serverClientEpoch > 0)) {
                            dongtianEnsureEpochAheadOfServer();
                        }
                        if (res.conflict) {
                            dongtianEnsureEpochAheadOfServer();
                        }
                        /** 仅材料已落盘、遗器仍待冲档：须立即重试整包，否则重进像回档 */
                        if (res.materialsPartial) {
                            window.__dongtianLocalPlayerDirty = true;
                            __dongtianCloudSaveNeedsRetry = true;
                            __dongtianCloudSaveInFlight = false;
                            dongtianNotifyCloudSaveToast(
                                "材料已同步，遗器进度上传中，请稍候…"
                            );
                            setTimeout(function () {
                                dongtianEnsureEpochAheadOfServer();
                                dongtianCloudFlushSave({
                                    immediate: true,
                                    forceCloud: true,
                                    playerMutation: true,
                                });
                            }, 180);
                            return;
                        }
                        /** 服务端 revision 已前进（管理员改档/市场/API）：须先拉云端再重试，勿用本地 materialsSnapshot 盖回 */
                        if (
                            (res.staleEpoch || res.conflict) &&
                            (res.serverClientEpoch > 0 || res.serverUpdatedAt > 0) &&
                            typeof window.dongtianPullServerSaveAfterMutation === "function"
                        ) {
                            var srvEp =
                                typeof res.serverClientEpoch === "number" && res.serverClientEpoch > 0
                                    ? Math.floor(res.serverClientEpoch)
                                    : 0;
                            var srvUa =
                                typeof res.serverUpdatedAt === "number" && res.serverUpdatedAt > 0
                                    ? res.serverUpdatedAt
                                    : 0;
                            var locUa =
                                typeof window.__dongtianServerUpdatedAt === "number"
                                    ? window.__dongtianServerUpdatedAt
                                    : 0;
                            var needAuthorityPull =
                                res.staleEpoch && srvEp > 0
                                    ? true
                                    : res.conflict && srvUa > 0 && srvUa > locUa;
                            if (needAuthorityPull) {
                                __dongtianCloudSaveInFlight = false;
                                if (typeof window.dongtianCancelPendingMaterialDeltas === "function") {
                                    window.dongtianCancelPendingMaterialDeltas();
                                }
                                if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
                                    window.dongtianInvalidateCloudSaveResponses();
                                }
                                window
                                    .dongtianPullServerSaveAfterMutation({
                                        skipPreFlush: true,
                                        preferLocalDungeonIfAhead: true,
                                        fromSaveConflictReload: true,
                                        fromServerMutation: true,
                                        /** 管理员删装备/灵宠/材料后：勿用更长本地行囊盖回 */
                                        respectServerInventoryAuthority: true,
                                    })
                                    .then(function () {
                                        dongtianEnsureEpochAheadOfServer();
                                        if (typeof renderInventoryMaterialsPanel === "function") {
                                            renderInventoryMaterialsPanel();
                                        }
                                        if (typeof showEquipment === "function") showEquipment();
                                        if (
                                            window.__dongtianLocalPlayerDirty ||
                                            __dongtianCloudSaveNeedsRetry
                                        ) {
                                            dongtianCloudFlushSave({
                                                immediate: true,
                                                forceCloud: true,
                                                playerMutation: true,
                                            });
                                        }
                                    });
                                return;
                            }
                        }
                        var guardAct =
                            window.dongtianCloudSaveRetryGuard &&
                            typeof window.dongtianCloudSaveRetryGuard.handlePostReject === "function"
                                ? window.dongtianCloudSaveRetryGuard.handlePostReject(res)
                                : null;
                        if (guardAct && guardAct.notifyUser) {
                            dongtianNotifyCloudSaveToast(
                                "云端进度正在同步，请稍候再操作行囊/坊市（避免重进后像回档）"
                            );
                        }
                        if (guardAct && guardAct.pullServer) {
                            __dongtianCloudSaveInFlight = false;
                            if (typeof window.dongtianReloadFromServerAfterConflict === "function") {
                                window.dongtianReloadFromServerAfterConflict().then(function () {
                                    if (guardAct && guardAct.scheduleRetry) {
                                        var retryDelay =
                                            typeof guardAct.retryDelayMs === "number" && guardAct.retryDelayMs > 0
                                                ? guardAct.retryDelayMs
                                                : 500;
                                        setTimeout(function () {
                                            dongtianCloudFlushSave({
                                                immediate: true,
                                                forceCloud: true,
                                                playerMutation: true,
                                            });
                                        }, retryDelay);
                                    }
                                });
                            }
                            return;
                        }
                        window.__dongtianLocalPlayerDirty = true;
                        __dongtianCloudSaveNeedsRetry = !!(guardAct && guardAct.setNeedsRetry);
                        if (guardAct && guardAct.scheduleRetry) {
                            __dongtianCloudSaveInFlight = false;
                            var retryDelay =
                                typeof guardAct.retryDelayMs === "number" && guardAct.retryDelayMs > 0
                                    ? guardAct.retryDelayMs
                                    : 150;
                            setTimeout(function () {
                                dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                            }, retryDelay);
                            return;
                        }
                        if (guardAct && guardAct.setNeedsRetry) {
                            return;
                        }
                        __dongtianCloudSaveInFlight = false;
                        return;
                    }
                    if (res && !res.ok) {
                        window.__dongtianLocalPlayerDirty = true;
                        __dongtianCloudSaveNeedsRetry = true;
                    }
                })
                .catch(function () {
                    window.__dongtianLocalPlayerDirty = true;
                    __dongtianCloudSaveNeedsRetry = true;
                })
                .finally(function () {
                    if (__dongtianCloudSaveInFlight) dongtianCloudSaveReleaseInFlight();
                });
            };
            if (
                typeof window.dongtianFlushMaterialDeltas === "function" &&
                window.DONGTIAN_CLOUD_MODE &&
                window.__dongtianCloudHydrated
            ) {
                window.dongtianFlushMaterialDeltas({ reason: "before_cloud_save" }).finally(runSavePost);
            } else {
                runSavePost();
            }
        };
        if (opts.immediate) {
            doPost();
            return;
        }
        if (opts.defer && typeof requestIdleCallback === "function") {
            requestIdleCallback(doPost, { timeout: 1500 });
        } else {
            setTimeout(doPost, 0);
        }
    } catch (e) {}
}
/** 非战斗：较快落盘；战斗中：拉长防抖，减少 JSON.stringify 整包上传阻塞主线程（关页/战败仍会立即 flush） */
var DONGTIAN_CLOUD_SAVE_DEBOUNCE_MS = 420;
var DONGTIAN_CLOUD_SAVE_DEBOUNCE_IN_COMBAT_MS = 4500;

function clearDongtianCombatPeriodicCloudSave() {
    if (__dongtianCombatPeriodicSaveTimer) {
        clearTimeout(__dongtianCombatPeriodicSaveTimer);
        __dongtianCombatPeriodicSaveTimer = null;
    }
}

function scheduleDongtianCombatPeriodicCloudSave() {
    if (dongtianIsSideCombatCloudPersistBlocked()) return;
    if (__dongtianCombatPeriodicSaveTimer) return;
    __dongtianCombatPeriodicSaveTimer = setTimeout(function () {
        __dongtianCombatPeriodicSaveTimer = null;
        try {
            if (dongtianIsSideCombatCloudPersistBlocked()) return;
            if (typeof player === "object" && player && player.inCombat) {
                if (dongtianCloudSaveStillPending()) {
                    dongtianCloudFlushSave({ defer: true, forceCloud: true, playerMutation: true });
                }
                scheduleDongtianCombatPeriodicCloudSave();
            }
        } catch (ePer) {}
    }, DONGTIAN_COMBAT_CLOUD_SAVE_INTERVAL_MS);
}

function scheduleDongtianCloudSave() {
    if (__dongtianSaveTimer) clearTimeout(__dongtianSaveTimer);
    var delay = DONGTIAN_CLOUD_SAVE_DEBOUNCE_MS;
    try {
        if (typeof player === "object" && player && player.inCombat) {
            delay = DONGTIAN_CLOUD_SAVE_DEBOUNCE_IN_COMBAT_MS;
        }
    } catch (eDel) {}
    __dongtianSaveTimer = setTimeout(function () {
        __dongtianSaveTimer = null;
        if (dongtianCloudSaveStillPending()) {
            dongtianCloudFlushSave({ defer: true, forceCloud: true, playerMutation: true });
        }
    }, delay);
}
window.__dongtianCloudFlushSave = dongtianCloudFlushSave;
window.clearDongtianCombatPeriodicCloudSave = clearDongtianCombatPeriodicCloudSave;

/** 关闭/重进前：收起全屏模态，避免 #combatPanel 空壳遮罩挡住主界面（半透明「保护膜」） */
function dongtianResetBlockingOverlays(opts) {
    opts = opts || {};
    try {
        if (typeof closeCombatSurrenderConfirm === "function") closeCombatSurrenderConfirm();
    } catch (eSur) {}
    try {
        var nodes = document.querySelectorAll(".modal-container");
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (opts.keepLoading && el && el.id === "loading") continue;
            if (el) el.style.display = "none";
        }
        if (!opts.keepLoading) {
            var ld = document.getElementById("loading");
            if (ld) ld.style.display = "none";
        }
        var cp = document.getElementById("combatPanel");
        if (cp) {
            cp.style.display = "none";
            cp.innerHTML = "";
        }
        var def = document.getElementById("defaultModal");
        if (def) {
            def.style.display = "none";
            def.classList.remove(
                "modal-container--allocate",
                "modal-container--combat-surrender",
                "modal-container--run-reset",
                "modal-container--inv-batch-qty"
            );
            def.innerHTML = "";
        }
        var menu = document.getElementById("menuModal");
        if (menu) {
            menu.style.display = "none";
            menu.innerHTML = "";
        }
        var dm = document.querySelector("#dungeon-main");
        if (dm) dm.style.filter = "brightness(100%)";
        try {
            document.body.classList.remove("xiu-market-open", "xiu-sell-open", "inv-gift-inbox-open");
        } catch (eCls) {}
        if (typeof window.syncParentViewportForDongtianEmbeds === "function") {
            window.syncParentViewportForDongtianEmbeds();
        }
    } catch (eReset) {}
}
window.dongtianResetBlockingOverlays = dongtianResetBlockingOverlays;

/** 读档/进秘境后：斗法层已 flex 却无内容时补 UI 或收起，防关洞天后重进卡死 */
function dongtianHealOrphanCombatOverlay() {
    try {
        var cp = document.getElementById("combatPanel");
        if (!cp || cp.style.display !== "flex") return;
        if (player && player.inCombat) {
            if (!cp.querySelector(".combat-sheet") && typeof showCombatInfo === "function") {
                showCombatInfo();
            }
            return;
        }
        cp.style.display = "none";
        cp.innerHTML = "";
        var dm = document.querySelector("#dungeon-main");
        if (dm) dm.style.filter = "brightness(100%)";
        if (typeof enemyDead !== "undefined") enemyDead = false;
        if (typeof playerDead !== "undefined") playerDead = false;
    } catch (eHeal) {}
}
window.dongtianHealOrphanCombatOverlay = dongtianHealOrphanCombatOverlay;

/**
 * 非秘境战败、非斗法态下气血为 0（常见于武神坛/侧翼切磋落盘 hp=0 或云档冲突）时回满，避免界面莫名 0 血。
 * @returns {boolean} 是否已修复
 */
function dongtianHealOrphanHubHpIfNeeded(opts) {
    opts = opts || {};
    try {
        if (!player || !player.stats || player.inCombat) return false;
        if (player.dungeonDefeatPending) return false;
        if (Number(player.stats.hp) >= 1) return false;
        if (typeof calculateStats === "function") calculateStats();
        if (!(Number(player.stats.hpMax) > 0)) return false;
        player.stats.hp = player.stats.hpMax;
        if (typeof playerDead !== "undefined") playerDead = false;
        if (opts.markDirty !== false && window.DONGTIAN_CLOUD_MODE) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
        }
        return true;
    } catch (eHpHeal) {
        return false;
    }
}
window.dongtianHealOrphanHubHpIfNeeded = dongtianHealOrphanHubHpIfNeeded;

/** 父页关闭洞天 iframe 前：先收 UI 遮罩再冲档 */
window.dongtianPrepareCloseUiCleanup = function () {
    dongtianResetBlockingOverlays();
};

/** 父页关闭洞天 iframe 前调用：keepalive 冲档并等待在途 POST；返回 { ok, pending } */
window.dongtianPrepareCloseFlush = function () {
    try {
        dongtianResetBlockingOverlays();
    } catch (eUi) {}
    if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) {
        return Promise.resolve({ ok: true, pending: false });
    }
    var flushMat =
        typeof window.dongtianFlushMaterialDeltas === "function"
            ? window.dongtianFlushMaterialDeltas({ reason: "close_panel" })
            : Promise.resolve({ ok: true });
    return Promise.resolve(flushMat)
        .then(function () {
            try {
                dongtianCloudFlushOnPageExit({ teardown: false });
            } catch (eClose) {}
            if (typeof window.dongtianCloudFlushSaveWhenDirty === "function") {
                return window.dongtianCloudFlushSaveWhenDirty(8000);
            }
            return true;
        })
        .then(function (ok) {
            if (ok && !dongtianCloudSaveStillPending()) {
                return { ok: true, pending: false };
            }
            dongtianFlushCloudSaveImmediate();
            if (typeof window.dongtianCloudFlushSaveWhenDirty === "function") {
                return window.dongtianCloudFlushSaveWhenDirty(4500).then(function (ok2) {
                    var pending = dongtianCloudSaveStillPending();
                    if (!pending) {
                        return { ok: !!ok2, pending: false };
                    }
                    dongtianCloudFlushSaveKeepalive();
                    dongtianFlushCloudSaveImmediate();
                    return window.dongtianCloudFlushSaveWhenDirty(3500).then(function (ok3) {
                        pending = dongtianCloudSaveStillPending();
                        if (pending && typeof dongtianNotifyCloudSaveToast === "function") {
                            dongtianNotifyCloudSaveToast(
                                "云端仍在同步，若刚改装备/层数请稍候再关洞天（避免重进像回档）"
                            );
                        }
                        return { ok: !!ok3 && !pending, pending: pending };
                    });
                });
            }
            return { ok: false, pending: dongtianCloudSaveStillPending() };
        });
};

/** 父页 keepalive 冲档：导出当前 POST 体（须在 iframe 销毁前调用） */
window.dongtianExportCloudSavePostBody = function () {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return null;
        if (typeof dongtianEnsureEpochAheadOfServer === "function") dongtianEnsureEpochAheadOfServer();
        var built = dongtianBuildCloudSavePostBody();
        return built && built.postBody ? built.postBody : null;
    } catch (eExp) {
        return null;
    }
};

/** 灵网身份由服务端注册表分配（GET/POST 洞天存档时下发），客户端不自行生成 */
function ensureDongtianPublicId() {}
window.ensureDongtianPublicId = ensureDongtianPublicId;

/** 洞天劫联网：向服务端广播当前层数/劫数，供「路遇道友」奇遇匹配（约 22 秒最多一次） */
var DONGTIAN_PRESENCE_PING_MIN_MS = 22000;
window.__dongtianLastPresencePing = 0;
function dongtianPresencePayload() {
    var fl = dungeon.progress && typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1;
    var rm = dungeon.progress && typeof dungeon.progress.room === "number" ? dungeon.progress.room : 1;
    var name = player.name != null ? String(player.name) : "";
    var grade = dungeon.grade != null ? String(dungeon.grade) : "";
    var kills =
        dungeon.statistics && typeof dungeon.statistics.kills === "number" && !isNaN(dungeon.statistics.kills)
            ? dungeon.statistics.kills
            : 0;
    var pub =
        typeof player.dongtianPublicId === "number" && player.dongtianPublicId >= 1 && player.dongtianPublicId <= 10000
            ? Math.floor(player.dongtianPublicId)
            : undefined;
    return { floor: fl, room: rm, displayName: name, grade: grade, kills: kills, publicId: pub };
}
function dongtianPresencePingIfNeeded() {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return;
        if (typeof player === "object" && player && player.inCombat) return;
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req || typeof dungeon === "undefined" || !dungeon || typeof player === "undefined" || !player) return;
        if (!dungeon.status || !dungeon.status.exploring || dungeon.status.paused || dungeon.status.event) return;
        var now = Date.now();
        if (window.__dongtianLastPresencePing && now - window.__dongtianLastPresencePing < DONGTIAN_PRESENCE_PING_MIN_MS)
            return;
        window.__dongtianLastPresencePing = now;
        req("POST", "/api/dongtian-jie/presence", dongtianPresencePayload(), true).catch(function () {});
    } catch (ePing) {}
}
/** 进入「遇道友」奇遇前立即上报，便于他人列表里尽快出现你 */
function dongtianPresencePingForce() {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return Promise.resolve();
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req || typeof dungeon === "undefined" || !dungeon || typeof player === "undefined" || !player) {
            return Promise.resolve();
        }
        window.__dongtianLastPresencePing = Date.now();
        return req("POST", "/api/dongtian-jie/presence", dongtianPresencePayload(), true).catch(function () {
            return { ok: false };
        });
    } catch (eF) {
        return Promise.resolve();
    }
}
window.dongtianPresencePingIfNeeded = dongtianPresencePingIfNeeded;
window.dongtianPresencePingForce = dongtianPresencePingForce;

/** 洞天劫系统消息收件箱（遇人通知等），轮询写入历练纪闻；游标写入 player 避免重进洞天重复刷同一条 */
window.__dongtianInboxLastTs = 0;
window.__dongtianInboxTimer = null;
window.__dongtianInboxSeenIds = null;

function escapeDongtianInboxHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function dongtianInboxEnsureSeenMap() {
    if (!window.__dongtianInboxSeenIds || typeof window.__dongtianInboxSeenIds !== "object") {
        window.__dongtianInboxSeenIds = {};
    }
    if (typeof player === "object" && player) {
        if (!player.dongtianInboxSeenIds || typeof player.dongtianInboxSeenIds !== "object") {
            player.dongtianInboxSeenIds = {};
        }
        var pm = player.dongtianInboxSeenIds;
        var wm = window.__dongtianInboxSeenIds;
        Object.keys(pm).forEach(function (k) {
            wm[k] = 1;
        });
        Object.keys(wm).forEach(function (k) {
            pm[k] = 1;
        });
        window.__dongtianInboxSeenIds = wm;
    }
    return window.__dongtianInboxSeenIds;
}

function dongtianInboxWasSeen(m) {
    if (!m || typeof m !== "object") return true;
    var seen = dongtianInboxEnsureSeenMap();
    if (m.id != null && seen[String(m.id)]) return true;
    return false;
}

function dongtianInboxMarkSeen(m) {
    if (!m || typeof m !== "object") return;
    var seen = dongtianInboxEnsureSeenMap();
    if (m.id != null) seen[String(m.id)] = 1;
    if (typeof player === "object" && player && player.dongtianInboxSeenIds) {
        if (m.id != null) player.dongtianInboxSeenIds[String(m.id)] = 1;
        var keys = Object.keys(player.dongtianInboxSeenIds);
        if (keys.length > 120) {
            keys.slice(0, keys.length - 120).forEach(function (k) {
                delete player.dongtianInboxSeenIds[k];
                delete seen[k];
            });
        }
    }
}

/** 从云端 player 恢复收件箱游标（须在 startDongtianInboxPoll 之前调用） */
function dongtianRestoreInboxCursorFromPlayer() {
    try {
        var ts = 0;
        if (typeof player === "object" && player && typeof player.dongtianInboxLastTs === "number" && player.dongtianInboxLastTs > 0) {
            ts = Math.floor(player.dongtianInboxLastTs);
        }
        if (typeof window.__dongtianInboxLastTs === "number" && window.__dongtianInboxLastTs > ts) {
            ts = Math.floor(window.__dongtianInboxLastTs);
        }
        window.__dongtianInboxLastTs = ts;
        dongtianInboxEnsureSeenMap();
    } catch (eCur) {}
}
window.dongtianRestoreInboxCursorFromPlayer = dongtianRestoreInboxCursorFromPlayer;

function dongtianPersistInboxCursor(maxTs) {
    if (!(maxTs > 0)) return;
    window.__dongtianInboxLastTs = maxTs;
    if (typeof player === "object" && player) {
        player.dongtianInboxLastTs = maxTs;
    }
}

function dongtianInboxPollOnce() {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return;
        if (typeof player === "object" && player && player.inCombat) return;
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req || typeof addDungeonLog !== "function") return;
        dongtianRestoreInboxCursorFromPlayer();
        var since = typeof window.__dongtianInboxLastTs === "number" && window.__dongtianInboxLastTs > 0 ? window.__dongtianInboxLastTs : 0;
        req("GET", "/api/dongtian-jie/inbox?since=" + encodeURIComponent(since), undefined, true)
            .then(function (res) {
                if (!res || !res.ok || !Array.isArray(res.messages) || res.messages.length === 0) return;
                var maxTs = since;
                var added = 0;
                for (var i = 0; i < res.messages.length; i++) {
                    var m = res.messages[i];
                    if (!m || typeof m.text !== "string" || !m.text) continue;
                    if (dongtianInboxWasSeen(m)) {
                        if (typeof m.ts === "number" && m.ts > maxTs) maxTs = m.ts;
                        continue;
                    }
                    if (since > 0 && typeof m.ts === "number" && m.ts <= since) continue;
                    if (typeof m.ts === "number" && m.ts > maxTs) maxTs = m.ts;
                    dongtianInboxMarkSeen(m);
                    addDungeonLog('<span class="Heirloom">' + escapeDongtianInboxHtml(m.text) + "</span>");
                    added++;
                }
                if (maxTs > since) {
                    dongtianPersistInboxCursor(maxTs);
                    if (window.DONGTIAN_CLOUD_MODE && typeof player === "object" && player) {
                        window.__dongtianLocalPlayerDirty = true;
                        if (typeof scheduleDongtianCloudSave === "function") {
                            scheduleDongtianCloudSave();
                        }
                    }
                }
                if (added > 0 && typeof updateDungeonLog === "function") updateDungeonLog();
            })
            .catch(function () {});
    } catch (eInbox) {}
}
/** 系统消息 + 馈赠收件箱角标：合并为同一轮询，避免双定时器 */
var DONGTIAN_INBOX_POLL_MS = 120 * 1000;
var DONGTIAN_REVISION_POLL_MS = 15 * 1000;
var __dongtianRevisionPollInFlight = false;

function dongtianRevisionPollOnce() {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated) return;
        if (__dongtianRevisionPollInFlight || window.__dongtianCloudReloading) return;
        if (typeof dongtianIsSideCombatCloudPersistBlocked === "function" && dongtianIsSideCombatCloudPersistBlocked()) {
            return;
        }
        try {
            if (window.__wushenArenaCombatSettling) return;
        } catch (eWsBlock) {}
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req) return;
        __dongtianRevisionPollInFlight = true;
        req("GET", "/api/dongtian-jie/revision", undefined, true)
            .then(function (res) {
                if (!res || !res.ok) return;
                var srvAdminTouch =
                    typeof res.adminLastTouchAt === "number" && res.adminLastTouchAt > 0
                        ? Math.floor(res.adminLastTouchAt)
                        : 0;
                var locAdminTouch =
                    typeof window.__dongtianServerAdminLastTouchAt === "number" &&
                    window.__dongtianServerAdminLastTouchAt > 0
                        ? Math.floor(window.__dongtianServerAdminLastTouchAt)
                        : 0;
                /** 仅管理员改档时拉全档；市场/武神结算等 revision 变更由各自 API 或 save 冲突流程处理，勿误拉旧秘境层数 */
                var adminJustTouched = srvAdminTouch > locAdminTouch;
                if (!adminJustTouched) return;
                if (typeof window.dongtianPullServerSaveAfterMutation !== "function") return;
                return window
                    .dongtianPullServerSaveAfterMutation({
                        skipPreFlush: true,
                        preferLocalDungeonIfAhead: true,
                        forceServerPlayer: true,
                        fromServerMutation: true,
                        respectServerInventoryAuthority: true,
                        fromAdminRemoteSync: true,
                    })
                    .then(function (pulled) {
                        if (srvAdminTouch > 0) {
                            window.__dongtianServerAdminLastTouchAt = srvAdminTouch;
                        }
                        if (pulled) {
                            dongtianNotifyCloudSaveToast("管理员已更新您的洞天数据，已同步至最新");
                        }
                    });
            })
            .catch(function () {})
            .finally(function () {
                __dongtianRevisionPollInFlight = false;
            });
    } catch (eRevPoll) {
        __dongtianRevisionPollInFlight = false;
    }
}

function startDongtianRevisionPoll() {
    if (!window.DONGTIAN_CLOUD_MODE) return;
    if (window.__dongtianRevisionTimer != null) return;
    dongtianRevisionPollOnce();
    window.__dongtianRevisionTimer = setInterval(dongtianRevisionPollOnce, DONGTIAN_REVISION_POLL_MS);
}
window.startDongtianRevisionPoll = startDongtianRevisionPoll;

function stopDongtianRevisionPoll() {
    if (window.__dongtianRevisionTimer != null) {
        clearInterval(window.__dongtianRevisionTimer);
        window.__dongtianRevisionTimer = null;
    }
    __dongtianRevisionPollInFlight = false;
}
window.stopDongtianRevisionPoll = stopDongtianRevisionPoll;

function dongtianUnifiedInboxPollOnce() {
    dongtianInboxPollOnce();
    if (typeof window.dongtianGiftInboxPollOnce === "function") {
        window.dongtianGiftInboxPollOnce();
    }
}
function startDongtianInboxPoll() {
    if (!window.DONGTIAN_CLOUD_MODE) return;
    if (typeof dongtianRestoreInboxCursorFromPlayer === "function") dongtianRestoreInboxCursorFromPlayer();
    if (window.__dongtianInboxTimer) clearInterval(window.__dongtianInboxTimer);
    dongtianUnifiedInboxPollOnce();
    window.__dongtianInboxTimer = setInterval(dongtianUnifiedInboxPollOnce, DONGTIAN_INBOX_POLL_MS);
}
window.startDongtianInboxPoll = startDongtianInboxPoll;
/** 关闭洞天 iframe 前可由父页调用，提前停收件箱轮询（about:blank 也会销毁上下文，此为显式清理） */
function stopDongtianInboxPoll() {
    if (window.__dongtianInboxTimer) {
        clearInterval(window.__dongtianInboxTimer);
        window.__dongtianInboxTimer = null;
    }
}
window.stopDongtianInboxPoll = stopDongtianInboxPoll;

/**
 * 秘境推进度比较：先比层数再比劫数。
 * 用于保存冲突合稿：服务端 updatedAt 常被市场发货等抬高，但磁盘上的 dungeon 仍是「发货前快照」，
 * 若客户端已在探索中走得更远，整包套用会把满血玩家打回旧层（体感像被踢出秘境）。
 */
/** 战败 progressReset 后：本地已是新局（1层1劫0杀），冲突重载时勿采用服务端更高境界/层数 */
function dongtianLocalIndicatesFreshRunAfterReset() {
    try {
        if (typeof player !== "object" || !player) return false;
        if (typeof dungeon === "undefined" || !dungeon || !dungeon.progress) return false;
        var fl = Math.floor(Number(dungeon.progress.floor) || 1);
        var rm = Math.floor(Number(dungeon.progress.room) || 1);
        if (fl !== 1 || rm !== 1) return false;
        var kills =
            dungeon.statistics && typeof dungeon.statistics.kills === "number" && !isNaN(dungeon.statistics.kills)
                ? Math.floor(dungeon.statistics.kills)
                : -1;
        if (kills !== 0) return false;
        var lvl = Math.floor(Number(player.lvl) || 1);
        return lvl >= 1 && lvl <= 25;
    } catch (eFr) {
        return false;
    }
}
window.dongtianLocalIndicatesFreshRunAfterReset = dongtianLocalIndicatesFreshRunAfterReset;

/** 存档快照是否像刚「重整再战」后的新局（无门派、1层1劫0杀、低等级） */
function dongtianPayloadLooksLikeFreshRunReset(pl, dn) {
    try {
        if (!pl || typeof pl !== "object") return false;
        if (pl.sect) return false;
        var fl = dn && dn.progress ? Math.floor(Number(dn.progress.floor) || 1) : 1;
        var rm = dn && dn.progress ? Math.floor(Number(dn.progress.room) || 1) : 1;
        if (fl !== 1 || rm !== 1) return false;
        var kills =
            dn && dn.statistics && typeof dn.statistics.kills === "number" && !isNaN(dn.statistics.kills)
                ? Math.floor(dn.statistics.kills)
                : -1;
        if (kills !== 0) return false;
        var lvl = Math.floor(Number(pl.lvl) || 1);
        return lvl >= 1 && lvl <= 25;
    } catch (eFrSrv) {
        return false;
    }
}
window.dongtianPayloadLooksLikeFreshRunReset = dongtianPayloadLooksLikeFreshRunReset;

/** 历史秘境纪录（战败 progressReset 不会清零）：用于识别「云档新局快照」误盖等级 */
function dongtianPlayerHasCrossRunMeta(pl) {
    if (!pl || typeof pl !== "object") return false;
    if (Math.floor(Number(pl.maxDungeonFloorLvl) || 0) >= 2) return true;
    if (Math.floor(Number(pl.maxDungeonFloor) || 0) >= 2) return true;
    return Math.floor(Number(pl.lvl) || 1) > 25;
}

function dongtianWithinIntentionalRunResetWindow() {
    try {
        return !!(
            window.__dongtianIntentionalRunResetAt &&
            Date.now() - window.__dongtianIntentionalRunResetAt < 180000
        );
    } catch (eWin) {
        return false;
    }
}

/** 服务端/冲突拉档为「新局」形态且等级低于本地历史：勿采纳（表现为莫名其妙变 1 级） */
function dongtianShouldPreserveLevelOverStaleServerFreshRun(localPl, serverPl, serverDn, opts) {
    opts = opts || {};
    if (opts.allowServerLevelDowngrade) return false;
    if (
        dongtianWithinIntentionalRunResetWindow() &&
        typeof dongtianLocalIndicatesFreshRunAfterReset === "function" &&
        dongtianLocalIndicatesFreshRunAfterReset()
    ) {
        return false;
    }
    if (!localPl || !serverPl) return false;
    var localLvl = Math.floor(Number(localPl.lvl) || 1);
    var serverLvl = Math.floor(Number(serverPl.lvl) || 1);
    if (serverLvl >= localLvl) return false;
    if (!dongtianPlayerHasCrossRunMeta(localPl)) return false;
    if (
        typeof dongtianPayloadLooksLikeFreshRunReset === "function" &&
        dongtianPayloadLooksLikeFreshRunReset(serverPl, serverDn)
    ) {
        return true;
    }
    return serverLvl <= 1 && localLvl >= 3;
}
window.dongtianShouldPreserveLevelOverStaleServerFreshRun = dongtianShouldPreserveLevelOverStaleServerFreshRun;

/** 本地仍在本轮秘境推进中（误套用「新局」云档时会整页回到选门派） */
function dongtianLocalHasActiveDungeonRun() {
    try {
        if (typeof player !== "object" || !player || !player.sect) return false;
        if (player.inCombat) return true;
        if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
            if (dungeon.status.exploring || dungeon.status.event) return true;
        }
        if (typeof dungeon !== "undefined" && dungeon && dungeon.progress) {
            var fl = Math.floor(Number(dungeon.progress.floor) || 1);
            var rm = Math.floor(Number(dungeon.progress.room) || 1);
            if (fl > 1 || rm > 1) return true;
            var kills =
                dungeon.statistics && typeof dungeon.statistics.kills === "number" && !isNaN(dungeon.statistics.kills)
                    ? Math.floor(dungeon.statistics.kills)
                    : 0;
            if (kills > 0) return true;
        }
        var lvl = Math.floor(Number(player.lvl) || 1);
        if (lvl > 25) return true;
    } catch (eAct) {}
    return false;
}
window.dongtianLocalHasActiveDungeonRun = dongtianLocalHasActiveDungeonRun;

/** 读档后是否应弹出「塑道本源/选门派」；有门派且秘境仍在推进时跳过（allocated 缺失的老档/冲突档） */
function dongtianPlayerNeedsAllocationScreen() {
    if (!player || typeof player !== "object") return true;
    if (player.allocated) return false;
    if (!player.sect) return true;
    return !dongtianLocalHasActiveDungeonRun();
}
window.dongtianPlayerNeedsAllocationScreen = dongtianPlayerNeedsAllocationScreen;

/** 本局 player 字段快照：云档合并时若本地秘境走得更远，保留等级/机缘/身负等 */
function dongtianSnapshotRunPlayerFields(pl) {
    if (!pl || typeof pl !== "object") return null;
    try {
        return {
            lvl: pl.lvl,
            exp: pl.exp ? JSON.parse(JSON.stringify(pl.exp)) : null,
            blessing: pl.blessing,
            bonusStats: pl.bonusStats ? JSON.parse(JSON.stringify(pl.bonusStats)) : null,
            lvlupChoiceBonusApplied: pl.lvlupChoiceBonusApplied
                ? JSON.parse(JSON.stringify(pl.lvlupChoiceBonusApplied))
                : null,
            lvlupAutoBonusApplied: pl.lvlupAutoBonusApplied
                ? JSON.parse(JSON.stringify(pl.lvlupAutoBonusApplied))
                : null,
            sect: pl.sect,
            learnedPassives: Array.isArray(pl.learnedPassives) ? pl.learnedPassives.slice() : [],
            equippedPassives: Array.isArray(pl.equippedPassives) ? pl.equippedPassives.slice() : [],
            learnedPassiveLevels: pl.learnedPassiveLevels ? JSON.parse(JSON.stringify(pl.learnedPassiveLevels)) : null,
            equipped: Array.isArray(pl.equipped) ? pl.equipped.slice() : [],
            baseStats: pl.baseStats ? JSON.parse(JSON.stringify(pl.baseStats)) : null,
            tempStats: pl.tempStats ? JSON.parse(JSON.stringify(pl.tempStats)) : null,
            allocated: pl.allocated,
            stats: pl.stats ? JSON.parse(JSON.stringify(pl.stats)) : null,
        };
    } catch (eSnap) {
        return null;
    }
}

function dongtianApplyRunPlayerFieldsFromSnapshot(pl, snap) {
    if (!pl || !snap || typeof snap !== "object") return false;
    var keys = [
        "lvl",
        "exp",
        "blessing",
        "bonusStats",
        "lvlupChoiceBonusApplied",
        "lvlupAutoBonusApplied",
        "sect",
        "learnedPassives",
        "equippedPassives",
        "learnedPassiveLevels",
        "equipped",
        "baseStats",
        "tempStats",
        "allocated",
        "stats",
    ];
    var changed = false;
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (snap[k] !== undefined && snap[k] !== null) {
            pl[k] = snap[k];
            changed = true;
        }
    }
    return changed;
}

/** 秘境层/劫推进后立即落盘，避免防抖未写入时冲突拉档把本局打回旧层 */
window.dongtianCloudPersistRunProgress = function () {
    if (!window.DONGTIAN_CLOUD_MODE) return;
    if (typeof saveData === "function") {
        saveData({ forceCloud: true, playerMutation: true });
    }
};

/** 战败/退出秘境「重整再战」二次确认，避免误触或连点整局清空 */
window.dongtianConfirmRestartRunAfterDefeat = function (onConfirm, onCancel) {
    if (typeof onConfirm !== "function") return;
    var runConfirm = function () {
        try {
            onConfirm();
        } catch (eCb) {}
    };
    try {
        var modal = document.querySelector("#defaultModal");
        if (!modal) {
            if (
                window.confirm(
                    "本轮秘境将完全重来：层数、劫数、等级与机缘加成清零（行囊遗器/材料/灵宠保留）。\n\n确定重整再战？"
                )
            ) {
                runConfirm();
            }
            return;
        }
        modal.classList.add("modal-container--run-reset");
        modal.style.display = "flex";
        modal.innerHTML =
            '<div class="content combat-surrender-confirm" role="dialog" aria-modal="true">' +
            '<header class="combat-surrender-confirm__head">' +
            '<p class="combat-surrender-confirm__eyebrow">秘境</p>' +
            '<h3 class="combat-surrender-confirm__title">确认重整再战</h3>' +
            "</header>" +
            '<p class="combat-surrender-confirm__lead">本轮秘境将<strong>完全重来</strong>：层数、劫数、等级与机缘加成清零。</p>' +
            '<ul class="combat-surrender-confirm__rules" role="list">' +
            "<li>行囊遗器、材料、灵宠、历史最高层等<strong>保留</strong></li>" +
            "<li>若未战败却出现此提示，请点「继续本局」并反馈</li>" +
            "</ul>" +
            '<div class="button-container combat-surrender-confirm__actions">' +
            '<button type="button" class="btn btn--sm btn--ghost" id="dongtianRunResetNo">继续本局</button>' +
            '<button type="button" class="btn btn--sm btn--primary" id="dongtianRunResetYes">确定重来</button>' +
            "</div></div>";
        var closeModal = function () {
            modal.style.display = "none";
            modal.classList.remove("modal-container--run-reset");
            modal.innerHTML = "";
        };
        var noBtn = document.getElementById("dongtianRunResetNo");
        var yesBtn = document.getElementById("dongtianRunResetYes");
        if (noBtn) {
            noBtn.onclick = function () {
                closeModal();
                if (typeof onCancel === "function") {
                    try {
                        onCancel();
                    } catch (eCancel) {}
                }
            };
        }
        if (yesBtn) {
            yesBtn.onclick = function () {
                closeModal();
                runConfirm();
            };
        }
    } catch (eDlg) {
        if (
            window.confirm(
                "本轮秘境将完全重来：层数、劫数、等级与机缘加成清零（行囊遗器/材料/灵宠保留）。\n\n确定重整再战？"
            )
        ) {
            runConfirm();
        }
    }
};

/** 秘境/押镖/地脉仍有待点选面板或子模式进行中：冲突重载时保留本地 dungeon，避免对话「弹出又缩回」 */
function dongtianLocalRunInteractionActive() {
    try {
        if (typeof dungeon !== "undefined" && dungeon && dungeon.status && dungeon.status.event) return true;
        if (typeof escort !== "undefined" && escort) {
            if (escort.active) return true;
            if (escort.status && escort.status.choosing) return true;
            if (escort.status && escort.status.event) return true;
        }
        if (typeof mining !== "undefined" && mining) {
            if (mining.active) return true;
            if (mining.status && mining.status.choosing) return true;
            if (mining.status && mining.status.event) return true;
        }
        var logRoot = document.querySelector("#dungeonLog");
        if (logRoot && logRoot.querySelector(".decision-panel button")) return true;
    } catch (eRun) {}
    return false;
}
window.dongtianLocalRunInteractionActive = dongtianLocalRunInteractionActive;

function dongtianDungeonProgressCompare(a, b) {
    try {
        var af =
            a && a.progress && typeof a.progress.floor === "number" && !isNaN(a.progress.floor)
                ? Math.floor(a.progress.floor)
                : 0;
        var ar =
            a && a.progress && typeof a.progress.room === "number" && !isNaN(a.progress.room)
                ? Math.floor(a.progress.room)
                : 0;
        var bf =
            b && b.progress && typeof b.progress.floor === "number" && !isNaN(b.progress.floor)
                ? Math.floor(b.progress.floor)
                : 0;
        var br =
            b && b.progress && typeof b.progress.room === "number" && !isNaN(b.progress.room)
                ? Math.floor(b.progress.room)
                : 0;
        if (af !== bf) return af > bf ? 1 : af < bf ? -1 : 0;
        if (ar !== br) return ar > br ? 1 : ar < br ? -1 : 0;
        return 0;
    } catch (eCmp) {
        return 0;
    }
}

var __dongtianLastConflictReloadAt = 0;
var __dongtianConflictReloadPromise = null;
/** 服务端洞天存档比本地新时（如保存被拒），拉最新档并刷新材料/灵宠栏 */
window.dongtianReloadFromServerAfterConflict = function () {
    var req = window.parent && window.parent.goldGameApiRequest;
    if (!req) return Promise.resolve();
    var now = Date.now();
    if (__dongtianConflictReloadPromise && now - __dongtianLastConflictReloadAt < 2800) {
        return __dongtianConflictReloadPromise;
    }
    if (typeof window.cancelPendingDongtianCloudSave === "function") window.cancelPendingDongtianCloudSave();
    __dongtianCloudSaveInFlight = false;
    __dongtianCloudSaveNeedsRetry = false;
    window.__dongtianCloudReloading = true;
    __dongtianLastConflictReloadAt = now;
    __dongtianConflictReloadPromise = req("GET", "/api/dongtian-jie/save", undefined, true)
        .then(function (res) {
            if (res && res.ok && res.data && typeof window.dongtianApplyServerPayload === "function") {
                window.dongtianApplyServerPayload(res.data, {
                    forceServerPlayer: true,
                    fromServerMutation: true,
                    preferLocalDungeonIfAhead: true,
                    fromSaveConflictReload: true,
                    respectServerInventoryAuthority: true,
                });
                if (
                    !window.__dongtianLocalPlayerDirty &&
                    window.dongtianCloudSaveRetryGuard &&
                    typeof window.dongtianCloudSaveRetryGuard.onSaveSuccess === "function"
                ) {
                    window.dongtianCloudSaveRetryGuard.onSaveSuccess();
                }
            }
        })
        .finally(function () {
            window.__dongtianCloudReloading = false;
            __dongtianConflictReloadPromise = null;
            try {
                if (dongtianIsSideCombatCloudPersistBlocked()) return;
                if (typeof player === "object" && player && player.inCombat) return;
                if (typeof window.__dongtianCloudFlushSave === "function") {
                    setTimeout(function () {
                        if (window.__dongtianCloudReloading) return;
                        if (dongtianIsSideCombatCloudPersistBlocked()) return;
                        if (typeof player === "object" && player && player.inCombat) return;
                        window.__dongtianCloudFlushSave({
                            immediate: true,
                            forceCloud: !!window.__dongtianLocalPlayerDirty,
                            playerMutation: !!window.__dongtianLocalPlayerDirty,
                        });
                    }, 400);
                }
            } catch (eReconc) {}
        });
    return __dongtianConflictReloadPromise;
};
/**
 * 专用 API 拉档后合并材料：保留本地未落盘拾取/消耗；服务端专用 API 发奖时采服务端更大值。
 */
function dongtianMergeMaterialsAfterServerPull(targetPlayer, localMaterials, hadMaterialDirty, mergeOpts) {
    mergeOpts = mergeOpts || {};
    if (!targetPlayer || !localMaterials || typeof localMaterials !== "object") return false;
    if (!targetPlayer.inventory || typeof targetPlayer.inventory !== "object") targetPlayer.inventory = {};
    var fromMutation = !!(mergeOpts.fromServerMutation || mergeOpts.fromMolongServerSync);
    var local = cloneMaterialsForCloudPost(localMaterials);
    var server = cloneMaterialsForCloudPost(targetPlayer.inventory.materials || {});
    var keySet = {};
    Object.keys(local).forEach(function (k) {
        keySet[k] = 1;
    });
    Object.keys(server).forEach(function (k) {
        keySet[k] = 1;
    });
    var changed = false;
    if (!targetPlayer.inventory.materials || typeof targetPlayer.inventory.materials !== "object") {
        targetPlayer.inventory.materials = {};
    }
    var m = targetPlayer.inventory.materials;
    Object.keys(keySet).forEach(function (k) {
        if (k.indexOf("__") === 0) return;
        var lv = Object.prototype.hasOwnProperty.call(local, k) ? local[k] : null;
        var sv = server[k] != null ? server[k] : 0;
        var v;
        if (mergeOpts.respectServerInventoryAuthority) {
            v = sv;
        } else if (fromMutation) {
            if (lv !== null && lv > sv && /^lt_/.test(k)) {
                /** 灵田开包/兑店/用药等专用 API 已落盘：以服务端为准，避免未冲档的显示数盖回消耗 */
                v = sv;
            } else if (lv !== null && lv > sv) {
                /** 秘境拾取等待 delta/冲档：保留本地较多数量 */
                v = lv;
            } else {
                /** 助战商店/灵田兑换/炼丹收取等：以服务端发奖为准 */
                v = sv;
            }
        } else if (hadMaterialDirty) {
            if (lv !== null && lv > sv) {
                v = lv;
            } else if (lv !== null && lv < sv) {
                v = lv;
            } else if (lv === null || lv === 0) {
                v = sv;
            } else {
                v = lv;
            }
        } else if (lv !== null && lv < sv) {
            v = lv;
        } else if (sv > (lv != null ? lv : 0)) {
            v = sv;
        } else {
            v = lv != null ? lv : sv;
        }
        if ((parseInt(m[k], 10) || 0) !== v) {
            m[k] = v;
            changed = true;
        }
    });
    return changed;
}

/** 冲突/拉档时：本地灵宠多于服务端或含独有 id 则保留本地（秘境刚掉落尚未落盘时防被旧云档冲没） */
function dongtianPreferLongerPetCollectionFromLocal(targetPlayer, localPets) {
    if (!targetPlayer || !Array.isArray(localPets) || localPets.length === 0) return false;
    if (!Array.isArray(targetPlayer.petCollection)) targetPlayer.petCollection = [];
    var tp = targetPlayer.petCollection;
    if (localPets.length > tp.length) {
        targetPlayer.petCollection = localPets.slice();
        return true;
    }
    var serverIds = Object.create(null);
    for (var j = 0; j < tp.length; j++) {
        if (tp[j] && tp[j].id != null) serverIds[String(tp[j].id)] = 1;
    }
    for (var i = 0; i < localPets.length; i++) {
        var lp = localPets[i];
        if (lp && lp.id != null && !serverIds[String(lp.id)]) {
            targetPlayer.petCollection = localPets.slice();
            return true;
        }
    }
    return false;
}

/**
 * 专用 API 刚发奖后：若服务端行囊遗器比本地更长（子集关系），采用服务端列表。
 * 防止 complete 回包已含遗器，却被陈旧 GET/冲档冲没。
 */
window.dongtianAdoptServerInventoryIfLonger = function (serverPlayer) {
    if (!serverPlayer || typeof player !== "object" || !player) return false;
    var changed = false;
    try {
        var se =
            serverPlayer.inventory && Array.isArray(serverPlayer.inventory.equipment)
                ? serverPlayer.inventory.equipment
                : [];
        if (!player.inventory || typeof player.inventory !== "object") {
            player.inventory = { equipment: [] };
        }
        var ce = Array.isArray(player.inventory.equipment) ? player.inventory.equipment : [];
        if (
            se.length > ce.length &&
            (se.length === 0 || dongtianClientEquipIsSubsetOfServer(ce, se))
        ) {
            player.inventory.equipment = se.slice();
            changed = true;
        }
        if (Array.isArray(serverPlayer.dongtianTreasureMaps)) {
            player.dongtianTreasureMaps = serverPlayer.dongtianTreasureMaps.slice();
            changed = true;
        }
        if (serverPlayer.dongtianTreasureMapLastCompleteToken != null) {
            player.dongtianTreasureMapLastCompleteToken = serverPlayer.dongtianTreasureMapLastCompleteToken;
        }
        if (serverPlayer.dongtianTreasureMapPending === null) {
            player.dongtianTreasureMapPending = null;
        }
    } catch (eAdoptInv) {}
    return changed;
};

/** 冲突/拉档时：本地行囊遗器多于服务端则保留本地（秘境刚掉落尚未落盘时防被旧云档冲没） */
function dongtianPreferLongerInventoryEquipmentFromLocal(targetPlayer, localEquipArr) {
    if (!targetPlayer || !Array.isArray(localEquipArr) || localEquipArr.length === 0) return false;
    if (!targetPlayer.inventory || typeof targetPlayer.inventory !== "object") {
        targetPlayer.inventory = { equipment: [] };
    }
    var te = Array.isArray(targetPlayer.inventory.equipment) ? targetPlayer.inventory.equipment : [];
    if (localEquipArr.length > te.length) {
        targetPlayer.inventory.equipment = localEquipArr.slice();
        return true;
    }
    return false;
}

function dongtianInventoryEquipmentEntryKey(entry) {
    if (entry == null) return "";
    if (typeof entry === "string") return entry;
    try {
        return JSON.stringify(entry);
    } catch (eKey) {
        return String(entry);
    }
}

function dongtianClientEquipIsSubsetOfServer(clientEquip, serverEquip) {
    var ce = Array.isArray(clientEquip) ? clientEquip : [];
    var se = Array.isArray(serverEquip) ? serverEquip : [];
    if (!ce.length) return true;
    if (ce.length > se.length) return false;
    var seSet = Object.create(null);
    for (var si = 0; si < se.length; si++) {
        seSet[dongtianInventoryEquipmentEntryKey(se[si])] = 1;
    }
    for (var ci = 0; ci < ce.length; ci++) {
        if (!seSet[dongtianInventoryEquipmentEntryKey(ce[ci])]) return false;
    }
    return true;
}

/** 已穿戴遗器的 JSON 键集合（合并云档时勿把同一件再从陈旧行囊补回） */
function dongtianEquippedInventoryEntryKeys(equippedArr) {
    var keys = Object.create(null);
    if (!Array.isArray(equippedArr)) return keys;
    for (var i = 0; i < equippedArr.length; i++) {
        var k = dongtianInventoryEquipmentEntryKey(equippedArr[i]);
        if (k) keys[k] = 1;
    }
    return keys;
}

/**
 * 本地有未落盘遗器变更（强化/附魔/换装）且服务端 revision 已前进时：
 * 在已套用服务端 player 后合并行囊，避免 authority 拉档把星阶/附魔打回旧值。
 * localEquippedArr：本地已穿戴快照；换装后勿用服务端更长行囊把刚穿的件复制回背包。
 */
function dongtianMergeInventoryEquipmentWhenLocalDirty(targetPlayer, localEquipArr, localEquippedArr) {
    if (!targetPlayer || !Array.isArray(localEquipArr)) return false;
    if (!targetPlayer.inventory || typeof targetPlayer.inventory !== "object") {
        targetPlayer.inventory = { equipment: [] };
    }
    var se = Array.isArray(targetPlayer.inventory.equipment) ? targetPlayer.inventory.equipment : [];
    var ce = localEquipArr;
    var equippedKeys = dongtianEquippedInventoryEntryKeys(localEquippedArr);
    if (JSON.stringify(ce) === JSON.stringify(se)) return false;
    if (dongtianClientEquipIsSubsetOfServer(ce, se)) {
        if (se.length > ce.length) {
            /** 本地 dirty 且为服务端子集：以本地为准（换装/出售已从行囊移除，勿用陈旧云档补回） */
            targetPlayer.inventory.equipment = ce.slice();
            return true;
        }
        return false;
    }
    if (dongtianClientEquipIsSubsetOfServer(se, ce) && ce.length > se.length) {
        targetPlayer.inventory.equipment = ce.slice();
        return true;
    }
    var merged = ce.slice();
    var keys = Object.create(null);
    for (var i = 0; i < ce.length; i++) {
        keys[dongtianInventoryEquipmentEntryKey(ce[i])] = 1;
    }
    for (var j = 0; j < se.length; j++) {
        var sk = dongtianInventoryEquipmentEntryKey(se[j]);
        if (!keys[sk] && !equippedKeys[sk]) {
            merged.push(typeof se[j] === "string" ? se[j] : JSON.stringify(se[j]));
            keys[sk] = 1;
        }
    }
    if (JSON.stringify(merged) !== JSON.stringify(se)) {
        targetPlayer.inventory.equipment = merged;
        return true;
    }
    return false;
}

/** 专用结算 API 落盘后：取消在途冲档并拉服务端洞天档（勿先 flush 本地 player，避免盖掉刚发奖） */
window.dongtianReloadSaveAfterServerGrant = function (applyOpts) {
    applyOpts = applyOpts || {};
    if (applyOpts.skipPreFlush !== false) {
        applyOpts.skipPreFlush = true;
    }
    if (applyOpts.respectServerInventoryAuthority !== false) {
        applyOpts.respectServerInventoryAuthority = true;
    }
    if (typeof window.dongtianCancelBeforeServerPull === "function") {
        window.dongtianCancelBeforeServerPull();
    } else {
        if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        }
        __dongtianCloudSaveInFlight = false;
        __dongtianCloudSaveNeedsRetry = false;
    }
    if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
        return window.dongtianPullServerSaveAfterMutation(applyOpts);
    }
    return Promise.resolve(false);
};

/** 服务端专用 API 已写入洞天档（市场购/售、副本/藏宝图发奖等）后拉取并强制采用服务端 player */
window.dongtianPullServerSaveAfterMutation = function (applyOpts) {
    applyOpts = applyOpts || {};
    /** 默认跳过 flush：本地 dirty 时先 POST 会把刚由专用 API 写入的奖励盖掉 */
    if (applyOpts.skipPreFlush !== false) {
        applyOpts.skipPreFlush = true;
    }
    /** 专用 API 只改行囊/材料，拉档时本地秘境若更靠前须保留（坊市/灵田/炼丹/剑灵等） */
    if (applyOpts.preferLocalDungeonIfAhead !== false) {
        applyOpts.preferLocalDungeonIfAhead = true;
    }
    var req = window.parent && window.parent.goldGameApiRequest;
    if (!req) return Promise.resolve(false);
    var preFlush =
        !applyOpts.skipPreFlush &&
        window.__dongtianLocalPlayerDirty &&
        typeof window.dongtianPersistMaterialsNow === "function"
            ? window.dongtianPersistMaterialsNow()
            : Promise.resolve(true);
    var flushMat =
        typeof window.dongtianFlushMaterialDeltas === "function"
            ? window.dongtianFlushMaterialDeltas({ reason: "before_server_pull" })
            : Promise.resolve({ ok: true });
    return Promise.resolve(flushMat).then(function () {
        return Promise.resolve(preFlush);
    }).then(function () {
        if (applyOpts.skipPreFlush) {
            if (typeof window.dongtianCancelBeforeServerPull === "function") {
                window.dongtianCancelBeforeServerPull();
            } else {
                dongtianInvalidateCloudSaveResponses();
                if (typeof window.cancelPendingDongtianCloudSave === "function") {
                    window.cancelPendingDongtianCloudSave();
                }
                __dongtianCloudSaveInFlight = false;
                __dongtianCloudSaveNeedsRetry = false;
            }
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        window.__dongtianCloudReloading = true;
        return req("GET", "/api/dongtian-jie/save", undefined, true)
        .then(function (res) {
            if (res && res.ok && res.data && res.data.player && typeof window.dongtianApplyServerPayload === "function") {
                var pullApply = { forceServerPlayer: true, fromServerMutation: true };
                if (applyOpts && typeof applyOpts === "object") {
                    Object.keys(applyOpts).forEach(function (k) {
                        pullApply[k] = applyOpts[k];
                    });
                }
                window.dongtianApplyServerPayload(res.data, pullApply);
                /** 合并后仍有未落盘拾取/消耗时须保留 dirty 并冲档，勿误清为「仅本地」 */
                if (
                    !window.__dongtianLocalPlayerDirty &&
                    !(typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending())
                ) {
                    try {
                        window.__dongtianLocalPlayerDirty = false;
                    } catch (eClrPull) {}
                } else if (
                    window.__dongtianLocalPlayerDirty &&
                    typeof dongtianCloudFlushSave === "function"
                ) {
                    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                }
                return true;
            }
            return false;
        })
        .catch(function () {
            return false;
        })
        .finally(function () {
            window.__dongtianCloudReloading = false;
        });
    });
};

/** 专用 API / 市场 / 塔结算等返回的 revision+时间戳 对齐（避免 local===server 下一包 POST 被拒） */
window.dongtianSyncRevisionFromApiResponse = function (payload) {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.updatedAt === "number" && isFinite(payload.updatedAt) && payload.updatedAt > 0) {
        window.__dongtianServerUpdatedAt = payload.updatedAt;
    }
    if (typeof payload.clientEpoch === "number" && isFinite(payload.clientEpoch) && payload.clientEpoch > 0) {
        dongtianAlignLocalEpochAfterServerRevision(Math.floor(payload.clientEpoch));
    }
};
/** 市场/赠送 API 返回的 revision 对齐本地，避免下一帧 POST 用旧 epoch 盖回上架结果 */
window.dongtianSyncRevisionFromTradeApi = function (payload) {
    window.dongtianSyncRevisionFromApiResponse(payload);
};
/** 副本大厅通关：立即把服务端返回的材料增量写入本地（拉档前先展示，避免 flush 竞态导致 UI 无变化） */
window.dongtianApplyMolongMaterialGrant = function (grant) {
    if (!grant || typeof grant !== "object" || typeof player !== "object" || !player) return false;
    var changed = false;
    try {
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (!player.inventory || typeof player.inventory !== "object") player.inventory = {};
        if (!player.inventory.materials || typeof player.inventory.materials !== "object") {
            player.inventory.materials = {};
        }
        var m = player.inventory.materials;
        Object.keys(grant).forEach(function (k) {
            if (k.indexOf("__") === 0 || k === "treasure_maps" || k === "networkCoin") return;
            var n = parseInt(grant[k], 10) || 0;
            if (n <= 0) return;
            m[k] = (parseInt(m[k], 10) || 0) + n;
            changed = true;
        });
    } catch (eMg0) {}
    if (changed) {
        if (typeof playerLoadStats === "function") playerLoadStats();
        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
    }
    return changed;
};

/** 副本大厅/助战商店发奖：合并服务端材料与藏宝图到本地 player（flush 未完成时的兜底） */
window.dongtianMergeServerPlayerTradeRewards = function (serverPlayer, mergeOpts) {
    mergeOpts = mergeOpts || {};
    if (!serverPlayer || typeof player !== "object" || !player) return false;
    var changed = false;
    try {
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (
            serverPlayer.inventory &&
            serverPlayer.inventory.materials &&
            player.inventory &&
            player.inventory.materials
        ) {
            var sm = serverPlayer.inventory.materials;
            var lm = player.inventory.materials;
            var absKeys =
                mergeOpts.absoluteMaterialKeys && typeof mergeOpts.absoluteMaterialKeys === "object"
                    ? mergeOpts.absoluteMaterialKeys
                    : null;
            Object.keys(sm).forEach(function (k) {
                if (k.indexOf("__") === 0) return;
                var sv = parseInt(sm[k], 10) || 0;
                var lv = parseInt(lm[k], 10) || 0;
                if (mergeOpts.absoluteMaterials || (absKeys && absKeys[k])) {
                    if (sv !== lv) {
                        lm[k] = sv;
                        changed = true;
                    }
                } else if (sv > lv) {
                    lm[k] = sv;
                    changed = true;
                }
            });
        }
        if (Array.isArray(serverPlayer.dongtianTreasureMaps)) {
            if (!Array.isArray(player.dongtianTreasureMaps)) player.dongtianTreasureMaps = [];
            var localIds = {};
            for (var ti = 0; ti < player.dongtianTreasureMaps.length; ti++) {
                var tm0 = player.dongtianTreasureMaps[ti];
                if (tm0 && tm0.id != null) localIds[String(tm0.id)] = true;
            }
            for (var tj = 0; tj < serverPlayer.dongtianTreasureMaps.length; tj++) {
                var tm1 = serverPlayer.dongtianTreasureMaps[tj];
                if (!tm1 || tm1.id == null) continue;
                var tid = String(tm1.id);
                if (!localIds[tid]) {
                    player.dongtianTreasureMaps.push(tm1);
                    localIds[tid] = true;
                    changed = true;
                }
            }
        }
    } catch (eMg) {}
    if (changed) {
        window.__dongtianLocalPlayerDirty = true;
        if (typeof dongtianMarkPlayerMutation === "function") dongtianMarkPlayerMutation();
        if (typeof playerLoadStats === "function") playerLoadStats();
        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
        if (typeof showInventory === "function") showInventory();
    }
    return changed;
};

/** 服务端已改洞天存档后，用此函数覆盖内存中的 player/dungeon/enemy 并刷新 UI */
window.dongtianApplyServerPayload = function (data, opts) {
    opts = opts || {};
    if (!data || !data.player) return;
    /** 专用 API 变更后合并：本地秘境进度若更靠前则保留，避免被云端旧档覆盖 */
    if (opts.fromServerMutation && opts.preferLocalDungeonIfAhead !== false) {
        opts.preferLocalDungeonIfAhead = true;
    }
    var hadMaterialDirtyBeforePull = !!window.__dongtianLocalPlayerDirty;
    var localMaterialsBeforePull = null;
    var localGemsBeforePull = null;
    try {
        if (typeof player === "object" && player && player.inventory && player.inventory.materials) {
            localMaterialsBeforePull = cloneMaterialsForCloudPost(player.inventory.materials);
        }
        if (typeof player === "object" && player && player.inventory && player.inventory.gems) {
            localGemsBeforePull = cloneGemsForCloudPost(player.inventory.gems);
        }
    } catch (eMatCap) {}
    var localDungeon = typeof dungeon !== "undefined" && dungeon ? dungeon : null;
    var localEnemy = typeof enemy !== "undefined" ? enemy : null;
    var inCombat = !!(typeof player === "object" && player && player.inCombat);
    var localTreasureTok = "";
    try {
        localTreasureTok =
            typeof window !== "undefined" && window.__dongtianActiveTreasureMapToken
                ? String(window.__dongtianActiveTreasureMapToken).trim()
                : "";
    } catch (eTmTok) {}
    var wasTreasureMapCombat =
        localTreasureTok.length > 0 || !!(localEnemy && localEnemy.treasureMapBattle);
    var fromTreasureMapComplete = !!(opts && opts.fromTreasureMapComplete);
    var serverEnemySnap = data.enemy && typeof data.enemy === "object" ? data.enemy : null;
    var localRunActive = dongtianLocalRunInteractionActive();
    var sideCombatActive = dongtianSideCombatSessionActive(inCombat, localEnemy);
    var forceServerPlayer = !!(
        opts &&
        (opts.forceServerPlayer ||
            opts.fromMolongServerSync ||
            opts.fromServerMutation ||
            opts.fromAdminRemoteSync)
    );
    var keepLocalPlayer = !!(window.__dongtianLocalPlayerDirty && !forceServerPlayer);
    if (
        !forceServerPlayer &&
        (opts.fromSaveConflictReload || inCombat) &&
        (window.__dongtianLocalPlayerDirty || __dongtianCloudSaveNeedsRetry || inCombat)
    ) {
        keepLocalPlayer = true;
    }
    if (
        !forceServerPlayer &&
        opts.fromSaveConflictReload &&
        dongtianLocalIndicatesFreshRunAfterReset() &&
        data.player &&
        typeof data.player.lvl === "number" &&
        Math.floor(data.player.lvl) > Math.floor(Number(player.lvl) || 1)
    ) {
        keepLocalPlayer = true;
    }
    /** 云档是「新局」快照但本地仍在推进：勿整包套用（体感：打着打着回选门派、进度消失） */
    if (
        !forceServerPlayer &&
        (opts.fromSaveConflictReload || opts.preferLocalDungeonIfAhead) &&
        dongtianPayloadLooksLikeFreshRunReset(data.player, data.dungeon) &&
        dongtianLocalHasActiveDungeonRun()
    ) {
        keepLocalPlayer = true;
        window.__dongtianLocalPlayerDirty = true;
        __dongtianCloudSaveNeedsRetry = true;
    }
    var treasureSettling = false;
    var treasureAwaitingClaim = false;
    var wushenSettling = false;
    try {
        treasureSettling = !!(typeof window !== "undefined" && window.__treasureMapCombatSettling);
        treasureAwaitingClaim = !!(typeof window !== "undefined" && window.__treasureMapAwaitingClaim);
        wushenSettling = !!(typeof window !== "undefined" && window.__wushenArenaCombatSettling);
    } catch (eTs) {}

    /** 专用 API 已写入服务端（如副本通关发奖）：采用服务端 player；本地材料未落盘时保留 dirty 供合并 */
    if (forceServerPlayer || (opts && opts.fromMolongServerSync)) {
        keepLocalPlayer = false;
        /** 专用 API 落盘后：仅当拉档前无未落盘行囊变更时才清 dirty，避免冲档排队覆盖发奖 */
        if (
            !hadMaterialDirtyBeforePull &&
            !(opts && opts.fromSaveConflictReload) &&
            !__dongtianCloudSaveNeedsRetry &&
            !__dongtianCloudSaveInFlight &&
            !(typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending())
        ) {
            window.__dongtianLocalPlayerDirty = false;
        } else if (hadMaterialDirtyBeforePull || __dongtianCloudSaveNeedsRetry) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
        }
        dongtianSyncEpochFromSavePayload(data);
    }

    /** 副本大厅/武神坛/宝图/双塔斗法中：冲突拉档只同步 revision，勿覆盖 player/dungeon（管理员改档除外） */
    if (opts.fromSaveConflictReload && sideCombatActive && !opts.fromAdminRemoteSync) {
        if (typeof data.updatedAt === "number" && isFinite(data.updatedAt)) {
            window.__dongtianServerUpdatedAt = data.updatedAt;
        }
        dongtianSyncEpochFromSavePayload(data);
        return;
    }

    if (sideCombatActive && !forceServerPlayer && !(opts && opts.fromMolongServerSync)) {
        keepLocalPlayer = true;
    }

        if (!keepLocalPlayer) {
        var preserveCombatHp = null;
        var preserveCombatHpMax = null;
        var preserveHubHpIfOrphan = null;
        if (inCombat && player && player.stats) {
            preserveCombatHp = player.stats.hp;
            preserveCombatHpMax = player.stats.hpMax;
        } else if (
            player &&
            player.stats &&
            Number(player.stats.hp) >= 1 &&
            !player.dungeonDefeatPending
        ) {
            preserveHubHpIfOrphan = player.stats.hp;
        }
        var localEquipBeforeServer = null;
        var localEquippedBeforeServer = null;
        var localPetsBeforeServer = null;
        var localRunPlayerSnap = null;
        var localLevelPreserveSnap = null;
        var serverDungeonForRunCmp =
            data.dungeon != null && typeof data.dungeon === "object" ? data.dungeon : null;
        if (
            typeof player === "object" &&
            player &&
            data.player &&
            dongtianShouldPreserveLevelOverStaleServerFreshRun(player, data.player, serverDungeonForRunCmp, opts)
        ) {
            localLevelPreserveSnap = dongtianSnapshotRunPlayerFields(player);
        }
        if (
            localDungeon &&
            serverDungeonForRunCmp &&
            dongtianDungeonProgressCompare(localDungeon, serverDungeonForRunCmp) > 0 &&
            (dongtianLocalHasActiveDungeonRun() || dongtianLocalRunInteractionActive())
        ) {
            localRunPlayerSnap = dongtianSnapshotRunPlayerFields(player);
        }
        try {
            if (player && player.inventory && Array.isArray(player.inventory.equipment)) {
                localEquipBeforeServer = player.inventory.equipment;
            }
            if (player && Array.isArray(player.equipped)) {
                localEquippedBeforeServer = player.equipped.slice();
            }
            if (player && Array.isArray(player.petCollection)) {
                localPetsBeforeServer = player.petCollection;
            }
        } catch (eEqSnap) {}
        player = data.player;
        if (
            preserveHubHpIfOrphan != null &&
            !player.inCombat &&
            !player.dungeonDefeatPending &&
            player.stats &&
            Number(player.stats.hp) < 1 &&
            Number(player.stats.hpMax) > 0
        ) {
            player.stats.hp = preserveHubHpIfOrphan;
        }
        if (
            localMaterialsBeforePull &&
            dongtianMergeMaterialsAfterServerPull(
                player,
                localMaterialsBeforePull,
                hadMaterialDirtyBeforePull,
                opts
            )
        ) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
            if (typeof scheduleDongtianCloudSave === "function") {
                scheduleDongtianCloudSave();
            }
        } else if (hadMaterialDirtyBeforePull && !opts.respectServerInventoryAuthority) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
        }
        if (
            !opts.respectServerInventoryAuthority &&
            hadMaterialDirtyBeforePull &&
            localGemsBeforePull &&
            player &&
            player.inventory
        ) {
            try {
                var gemsPullJson = JSON.stringify(localGemsBeforePull);
                if (JSON.stringify(player.inventory.gems || {}) !== gemsPullJson) {
                    player.inventory.gems = JSON.parse(gemsPullJson);
                    window.__dongtianLocalPlayerDirty = true;
                    __dongtianCloudSaveNeedsRetry = true;
                }
            } catch (eGmPull) {}
        }
        if (
            localRunPlayerSnap &&
            dongtianApplyRunPlayerFieldsFromSnapshot(player, localRunPlayerSnap)
        ) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
        }
        if (
            localLevelPreserveSnap &&
            dongtianApplyRunPlayerFieldsFromSnapshot(player, localLevelPreserveSnap)
        ) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
            if (typeof dongtianNotifyCloudSaveToast === "function") {
                dongtianNotifyCloudSaveToast(
                    "检测到云端陈旧「新局」快照，已保留当前修为等级，正在同步…"
                );
            }
        }
        if (localEquipBeforeServer && !fromTreasureMapComplete && !opts.respectServerInventoryAuthority) {
            var allowEquipLocalMerge =
                !(opts && opts.fromMolongServerSync) || hadMaterialDirtyBeforePull;
            var equipMerged = false;
            if (allowEquipLocalMerge) {
                if (
                    hadMaterialDirtyBeforePull &&
                    dongtianMergeInventoryEquipmentWhenLocalDirty(
                        player,
                        localEquipBeforeServer,
                        localEquippedBeforeServer
                    )
                ) {
                    equipMerged = true;
                } else if (dongtianPreferLongerInventoryEquipmentFromLocal(player, localEquipBeforeServer)) {
                    equipMerged = true;
                }
            }
            if (equipMerged) {
                window.__dongtianLocalPlayerDirty = true;
                __dongtianCloudSaveNeedsRetry = true;
            }
        }
        if (
            !opts.respectServerInventoryAuthority &&
            hadMaterialDirtyBeforePull &&
            localEquippedBeforeServer &&
            Array.isArray(player.equipped) &&
            JSON.stringify(player.equipped) !== JSON.stringify(localEquippedBeforeServer)
        ) {
            player.equipped = localEquippedBeforeServer.slice();
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
        }
        if (localPetsBeforeServer && !fromTreasureMapComplete && !opts.respectServerInventoryAuthority) {
            var allowPetLocalMerge =
                !(opts && opts.fromMolongServerSync) || hadMaterialDirtyBeforePull;
            if (
                allowPetLocalMerge &&
                dongtianPreferLongerPetCollectionFromLocal(player, localPetsBeforeServer)
            ) {
                window.__dongtianLocalPlayerDirty = true;
                __dongtianCloudSaveNeedsRetry = true;
            }
        }
        if (opts.respectServerInventoryAuthority) {
            try {
                window.__dongtianLocalPlayerDirty = false;
                __dongtianCloudSaveNeedsRetry = false;
            } catch (eAuthInv) {}
        }
        if (
            inCombat &&
            preserveCombatHp != null &&
            player &&
            player.stats &&
            Number.isFinite(preserveCombatHp)
        ) {
            player.stats.hp = preserveCombatHp;
            if (preserveCombatHpMax != null && Number.isFinite(preserveCombatHpMax)) {
                player.stats.hpMax = preserveCombatHpMax;
            }
        }
        if (typeof window.repairAllPetsExpIfMismatch === "function") {
            try {
                window.repairAllPetsExpIfMismatch();
            } catch (ePetExpFix) {}
        }
        if (typeof window.normalizeInventoryEquipmentSlots === "function") {
            try {
                if (window.normalizeInventoryEquipmentSlots()) {
                    window.__dongtianLocalPlayerDirty = true;
                }
            } catch (eNormInv) {}
        }
        if (typeof window.reconcileEquippedInventoryDuplicates === "function") {
            try {
                if (window.reconcileEquippedInventoryDuplicates()) {
                    window.__dongtianLocalPlayerDirty = true;
                    __dongtianCloudSaveNeedsRetry = true;
                    if (typeof saveData === "function") {
                        saveData({ forceCloud: true, playerMutation: true, skipMarkMutation: true });
                    }
                    if (typeof showInventory === "function") showInventory();
                    if (typeof showEquipment === "function") showEquipment();
                }
            } catch (eReconcileEq) {}
        }
    } else if (data.player && typeof data.player.dongtianPublicId === "number") {
        player.dongtianPublicId = Math.floor(data.player.dongtianPublicId);
    }
    /** 本地 player 未采纳服务端：勿刷新行囊/身负 UI，避免旧云档在落盘前闪回强化/附魔/典让结果 */
    var skipPlayerUiRefresh = keepLocalPlayer && !!window.__dongtianLocalPlayerDirty;
    if (typeof window.repairTreasureMapDropEquipmentNames === "function") {
        try {
            var tmLayerHint = 0;
            if (opts && opts.fromTreasureMapComplete && opts.treasureMapLayer > 0) {
                tmLayerHint = opts.treasureMapLayer;
            }
            window.repairTreasureMapDropEquipmentNames(player, tmLayerHint);
        } catch (eTmNameFix) {}
    }
    var preservedLocalDungeonOnly = false;
    var keptLocalDungeonOverServer = false;
    if (typeof mergeDungeonDefaults === "function") {
        var serverDungeon = data.dungeon != null && typeof data.dungeon === "object" ? data.dungeon : null;
        var useLocalDungeon =
            localRunActive &&
            localDungeon &&
            opts.fromSaveConflictReload &&
            !fromTreasureMapComplete &&
            !treasureSettling &&
            !treasureAwaitingClaim;
        if (
            !useLocalDungeon &&
            opts.preferLocalDungeonIfAhead &&
            localDungeon &&
            serverDungeon &&
            dongtianDungeonProgressCompare(localDungeon, serverDungeon) > 0
        ) {
            useLocalDungeon = true;
        }
        if (
            !useLocalDungeon &&
            opts.fromSaveConflictReload &&
            dongtianLocalIndicatesFreshRunAfterReset() &&
            localDungeon &&
            serverDungeon &&
            dongtianDungeonProgressCompare(serverDungeon, localDungeon) > 0
        ) {
            useLocalDungeon = true;
        }
        if (
            !useLocalDungeon &&
            (opts.fromSaveConflictReload || opts.preferLocalDungeonIfAhead) &&
            localDungeon &&
            serverDungeon &&
            dongtianPayloadLooksLikeFreshRunReset(data.player, serverDungeon) &&
            dongtianLocalHasActiveDungeonRun()
        ) {
            useLocalDungeon = true;
        }
        if (useLocalDungeon) {
            dungeon = mergeDungeonDefaults(localDungeon);
            preservedLocalDungeonOnly = !serverDungeon;
            keptLocalDungeonOverServer = true;
        } else if (serverDungeon) {
            dungeon = mergeDungeonDefaults(serverDungeon);
        } else if (localDungeon) {
            /** 赠礼领取/部分专用 API 仅回传 player，勿 mergeDungeonDefaults(null) 重置为 1层1劫 */
            dungeon = mergeDungeonDefaults(localDungeon);
            preservedLocalDungeonOnly = true;
            keptLocalDungeonOverServer = true;
        } else {
            dungeon = mergeDungeonDefaults(null);
        }
    }
    /** 藏宝图刚发奖：勿因「本地秘境更靠前」立刻冲档，避免陈旧行囊 POST 把服务端新遗器盖掉 */
    if (keptLocalDungeonOverServer && opts.fromServerMutation && !fromTreasureMapComplete) {
        window.__dongtianLocalPlayerDirty = true;
        __dongtianCloudSaveNeedsRetry = true;
        if (typeof scheduleDongtianCloudSave === "function") {
            scheduleDongtianCloudSave();
        }
    }
    if (typeof window.dongtianSyncEscortMiningGlobalsFromDungeon === "function") {
        window.dongtianSyncEscortMiningGlobalsFromDungeon();
    }
    var skipCombatResync = fromTreasureMapComplete || treasureSettling || treasureAwaitingClaim || wushenSettling;

    if (fromTreasureMapComplete || treasureSettling) {
        if (data.enemy && typeof data.enemy === "object") {
            enemy = data.enemy;
        }
        if (typeof window.restoreDungeonHubAfterTreasureMap === "function") {
            window.restoreDungeonHubAfterTreasureMap();
        } else {
            if (player) player.inCombat = false;
            if (dungeon && dungeon.status) dungeon.status.event = false;
            if (data.enemy && typeof data.enemy === "object") enemy = data.enemy;
            if (typeof window.stripSpecialCombatEnemyMarks === "function") {
                window.stripSpecialCombatEnemyMarks(enemy);
            }
            if (typeof generateRandomEnemy === "function") generateRandomEnemy();
        }
    } else if (inCombat && localEnemy && typeof localEnemy === "object") {
        enemy = localEnemy;
    } else if (data.enemy && typeof data.enemy === "object") {
        enemy = data.enemy;
        if (!player.inCombat && enemy) {
            if (
                (enemy.molongRaid || enemy.wushenArena || enemy.treasureMapBattle) &&
                typeof window.stripSpecialCombatEnemyMarks === "function"
            ) {
                window.stripSpecialCombatEnemyMarks(enemy);
            }
            if (
                enemy.demonTower ||
                enemy.dragonTower ||
                enemy.divineRealm ||
                enemy.spiritBeastRealm ||
                enemy.ghostRealm ||
                enemy.bossRole === "demontower" ||
                enemy.bossRole === "dragonspire" ||
                enemy.bossRole === "divinerealm" ||
                enemy.bossRole === "spiritbeast" ||
                enemy.bossRole === "ghostrealm"
            ) {
                if (
                    typeof window.isDongtianTowerCombatSession === "function" &&
                    window.isDongtianTowerCombatSession(enemy)
                ) {
                    return;
                }
                if (typeof window.stripSpecialCombatEnemyMarks === "function") {
                    window.stripSpecialCombatEnemyMarks(enemy);
                }
                if (typeof generateRandomEnemy === "function") generateRandomEnemy();
            }
        }
    }
    if (typeof dongtianSanitizeCloudSaveCombatOnLoad === "function") {
        dongtianSanitizeCloudSaveCombatOnLoad();
    }
    dongtianSanitizeStaleServerCombatAfterPayload(inCombat, serverEnemySnap);
    if (
        wasTreasureMapCombat &&
        !fromTreasureMapComplete &&
        !treasureSettling &&
        !treasureAwaitingClaim &&
        typeof window.isTreasureMapCombatSessionActive === "function" &&
        window.isTreasureMapCombatSessionActive()
    ) {
        try {
            if (typeof window.repairTreasureMapCombatSession === "function") {
                window.repairTreasureMapCombatSession();
            } else if (typeof window.ensureTreasureMapBattleOnEnemy === "function") {
                window.ensureTreasureMapBattleOnEnemy();
            }
        } catch (eTmRepair) {}
    }
    if (typeof data.updatedAt === "number" && isFinite(data.updatedAt)) {
        window.__dongtianServerUpdatedAt = data.updatedAt;
    }
    if (
        typeof data.adminLastTouchAt === "number" &&
        isFinite(data.adminLastTouchAt) &&
        data.adminLastTouchAt > 0
    ) {
        window.__dongtianServerAdminLastTouchAt = Math.floor(data.adminLastTouchAt);
    }
    dongtianSyncEpochFromSavePayload(data);
    if (data.player && typeof data.player.dongtianInboxLastTs === "number" && data.player.dongtianInboxLastTs > 0) {
        var srvInboxTs = Math.floor(data.player.dongtianInboxLastTs);
        if (srvInboxTs > (window.__dongtianInboxLastTs || 0)) {
            dongtianPersistInboxCursor(srvInboxTs);
        }
        if (data.player.dongtianInboxSeenIds && typeof data.player.dongtianInboxSeenIds === "object") {
            dongtianInboxEnsureSeenMap();
            Object.keys(data.player.dongtianInboxSeenIds).forEach(function (k) {
                window.__dongtianInboxSeenIds[k] = 1;
            });
        }
    }
    if (typeof repairDongtianPlayerExpPostLvl100Curve === "function" && player) {
        if (repairDongtianPlayerExpPostLvl100Curve(player)) {
            window.__dongtianLocalPlayerDirty = true;
            __dongtianCloudSaveNeedsRetry = true;
        }
    }
    if (typeof window.reconcileEquippedInventoryDuplicates === "function") {
        try {
            if (window.reconcileEquippedInventoryDuplicates()) {
                window.__dongtianLocalPlayerDirty = true;
                __dongtianCloudSaveNeedsRetry = true;
                if (typeof saveData === "function") {
                    saveData({ forceCloud: true, playerMutation: true, skipMarkMutation: true });
                }
            }
        } catch (eBootDedupe) {}
    }
    if (typeof playerLoadStats === "function") playerLoadStats();
    if (typeof dongtianHealOrphanHubHpIfNeeded === "function") {
        dongtianHealOrphanHubHpIfNeeded({ markDirty: true });
    }
    if (typeof dongtianDungeonPlayerExpApplyLevelUpsAndClamp === "function") {
        dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
    }
    if (!skipPlayerUiRefresh) {
        if (typeof showEquipment === "function") showEquipment();
        if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
        if (typeof renderPetPanel === "function") renderPetPanel();
        if (opts && opts.fromTreasureMapComplete && typeof showInventory === "function") {
            showInventory();
        }
    }
    if (window.DONGTIAN_CLOUD_MODE && typeof window.initDongtianCloudMarketAndArenaUi === "function") {
        setTimeout(function () {
            window.initDongtianCloudMarketAndArenaUi();
        }, 0);
    }
    if (
        opts.preferLocalDungeonIfAhead ||
        opts.fromGiftInboxClaim ||
        preservedLocalDungeonOnly ||
        (localRunActive && opts.fromSaveConflictReload)
    ) {
        try {
            if (typeof loadDungeonProgress === "function") loadDungeonProgress();
        } catch (eLdp) {}
        try {
            if (typeof updateDungeonLog === "function") updateDungeonLog();
        } catch (eUd) {}
        try {
            if (typeof syncRunBarModeText === "function") syncRunBarModeText();
        } catch (eSr) {}
    }
    if (player && player.inCombat && !skipCombatResync && typeof window.resyncCombatAfterCloudPayload === "function") {
        setTimeout(function () {
            try {
                window.resyncCombatAfterCloudPayload();
            } catch (eRc) {}
        }, 0);
    }
};
if (typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            dongtianCloudFlushOnPageExit();
            return;
        }
        try {
            if (window.__dongtianCloudHydrated && typeof startDongtianInboxPoll === "function") {
                startDongtianInboxPoll();
            }
            if (window.__dongtianCloudHydrated && typeof startDongtianRevisionPoll === "function") {
                startDongtianRevisionPoll();
            }
            if (
                window.__dongtianCloudHydrated &&
                (window.__dongtianLocalPlayerDirty || __dongtianCloudSaveNeedsRetry)
            ) {
                dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
            }
        } catch (eVis) {}
    });
    /** iframe/标签被直接卸掉时未必触发 visibilitychange；关页前须冲档，避免材料消耗未落盘 */
    window.addEventListener("pagehide", function () {
        try {
            dongtianCloudFlushOnPageExit();
        } catch (ePh) {}
    });
    /** 模玩中断网：经数秒确认后再刷新主游戏页，避免信号抖动误整页重载 */
    window.addEventListener("offline", function () {
        dongtianEmbeddedReloadParentForNetworkRecovery();
    });
    window.addEventListener("online", function () {
        try {
            dongtianCancelEmbeddedNetReloadDebounce();
        } catch (eOn) {}
    });
}

function dongtianCloudLoadAndBoot() {
    var req = null;
    try {
        req = window.parent && window.parent.goldGameApiRequest;
    } catch (e) {
        req = null;
    }
    if (!req) {
        if (document.body) document.body.innerHTML = '<div style="padding:24px;color:#e8a;text-align:center;font-family:sans-serif;">洞天劫需要登录主游戏并联网后才能加载。</div>';
        return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        dongtianEmbeddedReloadParentForNetworkRecovery(true);
        return;
    }
    try {
        var bootAccountKey = dongtianGetCloudAccountKey();
        if (bootAccountKey) window.__dongtianCloudAccountKey = bootAccountKey;
        dongtianClearLegacyInventoryShadowKeys();
    } catch (eBootAcct) {}
    req("GET", "/api/dongtian-jie/save", undefined, true)
        .then(function (res) {
            if (!res || !res.ok) {
                var msg = res && res.message ? res.message : "请先登录账号";
                if (document.body) document.body.innerHTML = '<div style="padding:24px;color:#e8a;text-align:center;font-family:sans-serif;">洞天劫：' + msg + "</div>";
                return;
            }
            // 新注册账号尚无 dongtian_*.json 时，服务端返回 data: null —— 应允许进入并由 dilaoGameBoot → createNewPlayer 建号。
            // 仅当 data 已是对象却缺少 player（损坏/半写入）时拦截，避免空内存覆盖云端。
            if (res.data != null && typeof res.data === "object") {
                if (!res.data.player || typeof res.data.player !== "object") {
                    if (document.body) {
                        document.body.innerHTML =
                            '<div style="padding:24px;color:#e8a;text-align:center;font-family:sans-serif;">洞天劫：云存档读取异常（存档结构不完整），已阻止覆盖写入。请刷新重试，若仍异常请联系管理员修复服务端存档。</div>';
                    }
                    return;
                }
            }
            if (res.data && res.data.player && typeof res.data.player === "object") {
                player = res.data.player;
                if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
                if (typeof window.repairAllPetsExpIfMismatch === "function") {
                    try {
                        window.repairAllPetsExpIfMismatch();
                    } catch (ePetExpBoot) {}
                }
                if (typeof mergeDungeonDefaults === "function") {
                    dungeon = mergeDungeonDefaults(
                        res.data.dungeon != null && typeof res.data.dungeon === "object" ? res.data.dungeon : null
                    );
                }
                if (typeof window.dongtianSyncEscortMiningGlobalsFromDungeon === "function") {
                    window.dongtianSyncEscortMiningGlobalsFromDungeon();
                }
                if (res.data.enemy && typeof res.data.enemy === "object") {
                    enemy = res.data.enemy;
                }
            }
            if (res.data && typeof res.data.updatedAt === "number" && isFinite(res.data.updatedAt)) {
                window.__dongtianServerUpdatedAt = res.data.updatedAt;
            }
            if (
                res.data &&
                typeof res.data.adminLastTouchAt === "number" &&
                isFinite(res.data.adminLastTouchAt) &&
                res.data.adminLastTouchAt > 0
            ) {
                window.__dongtianServerAdminLastTouchAt = Math.floor(res.data.adminLastTouchAt);
            }
            dongtianSyncEpochFromSavePayload(res.data);
            if (typeof dongtianEnsureEpochAheadOfServer === "function") {
                dongtianEnsureEpochAheadOfServer();
            }
            if (typeof dongtianSanitizeCloudSaveCombatOnLoad === "function") {
                if (dongtianSanitizeCloudSaveCombatOnLoad()) {
                    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                }
            }
            if (typeof dongtianRestoreInventoryShadowAfterCloudLoad === "function") {
                if (dongtianRestoreInventoryShadowAfterCloudLoad()) {
                    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                }
            }
            if (typeof dongtianRestoreInboxCursorFromPlayer === "function") dongtianRestoreInboxCursorFromPlayer();
            return req("GET", "/api/dongtian-sword-spirit/curio-catalog", undefined, true)
                .catch(function () {
                    return null;
                })
                .then(function (cat) {
                    if (cat && cat.ok && Array.isArray(cat.defs) && typeof window.setSwordSpiritCurioCatalog === "function") {
                        window.setSwordSpiritCurioCatalog(cat.defs);
                    }
                    window.__dongtianCloudHydrated = true;
                    dilaoGameBoot();
                });
        })
        .catch(function (err) {
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
                dongtianEmbeddedReloadParentForNetworkRecovery(true);
                return;
            }
            var m = err && err.message ? err.message : "网络错误";
            if (document.body) document.body.innerHTML = '<div style="padding:24px;color:#e8a;text-align:center;font-family:sans-serif;">洞天劫：' + m + "</div>";
        });
}

/** 劫数 ≥ 该值时，副本大厅 / 武神坛 / 登龙塔 / 魔神塔 / 神界 不可进入（与秘境 progress.room 一致） */
window.DONGTIAN_HUB_CLOSE_AT_JIE = 17;
window.dongtianGetCurrentJie = function () {
    if (typeof dungeon === "undefined" || !dungeon || !dungeon.progress) return 1;
    var j = Math.floor(Number(dungeon.progress.room) || 1);
    if (!isFinite(j) || j < 1) j = 1;
    return j;
};
window.dongtianHubClosedByHighJie = function () {
    var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
    return window.dongtianGetCurrentJie() >= lim;
};
window.dongtianHubHighJieBlockAlert = function (placeName) {
    var j = typeof window.dongtianGetCurrentJie === "function" ? window.dongtianGetCurrentJie() : 1;
    var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
    var p = placeName || "此处";
    try {
        window.alert(
            "天机封锁\n\n当前劫数为 " +
                j +
                "（已达或超过 " +
                lim +
                "），「" +
                p +
                "」不可进入。\n\n副本大厅、武神坛、登龙塔、魔神塔、神界、灵兽界、幽魂界于高劫数期间暂不开放，请先推进秘境。"
        );
    } catch (eA) {}
};
/** 根据劫数禁用/解禁坊市条与菜单内塔入口；魔龙大厅按钮状态由 molong 内 refresh 与服务端合并 */
window.dongtianSyncHubFeaturesJieLock = function () {
    if (typeof window.DONGTIAN_CLOUD_MODE === "undefined" || !window.DONGTIAN_CLOUD_MODE) return;
    var locked = typeof window.dongtianHubClosedByHighJie === "function" && window.dongtianHubClosedByHighJie();
    var lim = typeof window.DONGTIAN_HUB_CLOSE_AT_JIE === "number" ? window.DONGTIAN_HUB_CLOSE_AT_JIE : 17;
    var title = "劫数≥" + lim + " 时不可进入（副本大厅、武神坛、登龙塔、魔神塔、神界、灵兽界、幽魂界）";
    function setBtn(id) {
        var b = document.getElementById(id);
        if (!b) return;
        if (locked) {
            b.disabled = true;
            b.setAttribute("title", title);
        } else {
            b.disabled = false;
            var t = b.getAttribute("title");
            if (t === title) b.removeAttribute("title");
        }
    }
    setBtn("wushenArenaOpenBtn");
    setBtn("dongtianHubMenuDragonTowerBtn");
    setBtn("dongtianHubMenuDemonTowerBtn");
    setBtn("dongtianHubMenuDivineRealmBtn");
    setBtn("dongtianHubMenuSpiritBeastBtn");
    setBtn("dongtianHubMenuGhostRealmBtn");
    if (typeof window.__dongtianRefreshMolongHallLockUi === "function") {
        try {
            window.__dongtianRefreshMolongHallLockUi();
        } catch (eM) {}
    } else {
        setBtn("molongHallOpenBtn");
    }
};

/** 联网模式下初始化修仙市场 + 武神坛（需在 xiu-market.js / wushen-arena.js 加载之后调用；可多次调用以补绑） */
window.initDongtianCloudMarketAndArenaUi = function () {
    if (!window.DONGTIAN_CLOUD_MODE) return;
    try {
        if (typeof window.initXiuMarketUI === "function") window.initXiuMarketUI();
        if (typeof window.initWuShenArenaUI === "function") window.initWuShenArenaUI();
        if (typeof window.initDongtianTreasureMapUI === "function") window.initDongtianTreasureMapUI();
        if (typeof window.initDongtianMolongUI === "function") window.initDongtianMolongUI();
        if (typeof window.initDongtianLingtianUI === "function") window.initDongtianLingtianUI();
        if (typeof window.initDongtianShituUI === "function") window.initDongtianShituUI();
        if (typeof window.initDongtianZongmenUI === "function") window.initDongtianZongmenUI();
        if (typeof window.initDongtianSwordSpiritUI === "function") window.initDongtianSwordSpiritUI();
        if (typeof window.initDongtianDragonTowerUI === "function") window.initDongtianDragonTowerUI();
        if (typeof window.initDongtianDemonTowerUI === "function") window.initDongtianDemonTowerUI();
        if (typeof window.initDongtianDivineRealmUI === "function") window.initDongtianDivineRealmUI();
        if (typeof window.initDongtianSpiritBeastRealmUI === "function") window.initDongtianSpiritBeastRealmUI();
        if (typeof window.initDongtianGhostRealmUI === "function") window.initDongtianGhostRealmUI();
        if (typeof window.initDongtianAlchemyUI === "function") window.initDongtianAlchemyUI();
        if (typeof window.initDongtianPetEquipUI === "function") window.initDongtianPetEquipUI();
        if (typeof window.initDongtianForgeUI === "function") window.initDongtianForgeUI();
        if (typeof window.initDongtianLinggenXuemaiUI === "function") window.initDongtianLinggenXuemaiUI();
        if (typeof window.initDongtianYuqiUI === "function") window.initDongtianYuqiUI();
        if (typeof window.dongtianSyncHubFeaturesJieLock === "function") window.dongtianSyncHubFeaturesJieLock();
        if (typeof window.hookDongtianEmbedModalViewportObservers === "function") {
            window.hookDongtianEmbedModalViewportObservers();
        }
        if (typeof window.syncParentViewportForDongtianEmbeds === "function") {
            window.syncParentViewportForDongtianEmbeds();
        }
    } catch (e) {}
};

/** 单机模式下初始化仙府菜单与各本地玩法 UI */
window.initDongtianStandaloneHubUi = function () {
    if (window.DONGTIAN_CLOUD_MODE) return;
    try {
        if (typeof window.revealStandaloneHubBar === "function") window.revealStandaloneHubBar();
        if (typeof window.initDongtianHubMenuUI === "function") window.initDongtianHubMenuUI();
        if (typeof window.initDongtianHubMenuShell === "function") window.initDongtianHubMenuShell();
        if (typeof window.initDongtianTreasureMapUI === "function") window.initDongtianTreasureMapUI();
        if (typeof window.initDongtianLingtianUI === "function") window.initDongtianLingtianUI();
        if (typeof window.initDongtianSwordSpiritUI === "function") window.initDongtianSwordSpiritUI();
        if (typeof window.initDongtianDragonTowerUI === "function") window.initDongtianDragonTowerUI();
        if (typeof window.initDongtianDemonTowerUI === "function") window.initDongtianDemonTowerUI();
        if (typeof window.initDongtianDivineRealmUI === "function") window.initDongtianDivineRealmUI();
        if (typeof window.initDongtianSpiritBeastRealmUI === "function") window.initDongtianSpiritBeastRealmUI();
        if (typeof window.initDongtianGhostRealmUI === "function") window.initDongtianGhostRealmUI();
        if (typeof window.initDongtianAlchemyUI === "function") window.initDongtianAlchemyUI();
        if (typeof window.initDongtianPetEquipUI === "function") window.initDongtianPetEquipUI();
        if (typeof window.initDongtianForgeUI === "function") window.initDongtianForgeUI();
        if (typeof window.initDongtianYuqiUI === "function") window.initDongtianYuqiUI();
    } catch (eStandaloneHub) {}
};

function dilaoGameBoot() {
    if (typeof window.dongtianAnticheatClockInit === "function") {
        window.dongtianAnticheatClockInit();
    }
    /** 联网档 dungeon 随云读档写入，勿用本机 localStorage 旧秘境覆盖 */
    if (!window.DONGTIAN_CLOUD_MODE && typeof loadDungeonStateFromStorage === "function") {
        loadDungeonStateFromStorage();
    }
    if (window.DONGTIAN_CLOUD_MODE && typeof dongtianSanitizeCloudSaveCombatOnLoad === "function") {
        dongtianSanitizeCloudSaveCombatOnLoad();
    }

    var parentName = getParentPlayerName();

    if (player === null) {
        var initialName = parentName || "无名散修";
        if (initialName.length < 3) {
            initialName = "无名散修";
        }
        createNewPlayer(initialName);
    } else if (parentName && typeof player === "object") {
        player.name = parentName;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }

    if (player && player.inventory && !player.inventory.uiFilter) {
        player.inventory.uiFilter = { rarity: "All", slotType: "All" };
    }
    if (player && player.inventory && player.inventory.autoBatchSell === undefined) {
        player.inventory.autoBatchSell = false;
    }
    if (player && player.inventory && !player.inventory.materials) {
        player.inventory.materials = { enhance_stone: 0 };
    }
    if (player && player.inventory && player.inventory.materials && typeof player.inventory.materials.enhance_stone !== "number") {
        player.inventory.materials.enhance_stone = 0;
    }
    if (player && player.inventory && player.inventory.materials && typeof player.inventory.materials.enchant_stone !== "number") {
        player.inventory.materials.enchant_stone = 0;
    }
    if (player && player.inventory && player.inventory.materials && typeof player.inventory.materials.god_essence_stone !== "number") {
        player.inventory.materials.god_essence_stone = 0;
    }
    if (player && player.inventory && player.inventory.bagTab !== "equip" && player.inventory.bagTab !== "mat" && player.inventory.bagTab !== "gem") {
        player.inventory.bagTab = "equip";
    }
    if (player && typeof ensureInventoryUiFilters === "function") ensureInventoryUiFilters();
    if (typeof syncInventorySellRarityDom === "function") syncInventorySellRarityDom();
    if (typeof ensurePlayerGemStacks === "function") ensurePlayerGemStacks();
    if (typeof ensureGemMaterialsInInventory === "function") ensureGemMaterialsInInventory();
    if (player && (!player.miningDaily || typeof player.miningDaily !== "object")) {
        player.miningDaily = { tickets: 5, lastTs: Date.now() };
    }
    if (typeof migrateAllPlayerEquipmentEnhance305 === "function") {
        migrateAllPlayerEquipmentEnhance305();
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    if (typeof repairAllPlayerLegacyEquipmentScaling === "function") {
        if (repairAllPlayerLegacyEquipmentScaling()) {
            if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
            else if (typeof saveData === "function") saveData();
        }
    }
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentFloorClampApplied2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentFloorClampApplied2026 = true;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    /** 机缘四维缩放 0.3 + 当前封顶公式：对背包/身负再跑一遍 normalize（与上条独立标记，老档已做过层封顶也会执行一次） */
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentSecondaryCapScale03Migrate2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentSecondaryCapScale03Migrate2026 = true;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    /** 敌势层上限公式调整（如 1.3+(n−1)×0.1）：背包 + 身负遗器再按新上限封顶一次 */
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentEnemyScalingCeilingMigrate2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentEnemyScalingCeilingMigrate2026 = true;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    /** 遗器联合预算（各属性占各自上限比例之和 ≤1）：避免独立封顶后四维同时顶满；老档再跑一次 normalize */
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentJointStatBudgetMigrate2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentJointStatBudgetMigrate2026 = true;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    /** 遗器境界档：每 10 级 hp/atk/def 复合 ×1.45（自旧版 1.2 迁移） */
    if (typeof repairPlayerEquipmentHpAtkDefLevelTier145Migrate === "function" && player && !player.equipmentHpAtkDefLevelTier145Migrate2026) {
        if (repairPlayerEquipmentHpAtkDefLevelTier145Migrate()) {
            if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
            else if (typeof saveData === "function") saveData();
        }
        player.equipmentHpAtkDefLevelTier145Migrate2026 = true;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();
    if (typeof ensurePlayerTitleFields === "function") ensurePlayerTitleFields();
    // 补全老存档的“历史最高秘境层数”字段
    if (player && typeof player === "object") {
        var _changedMaxFloor = false;
        var _curFloor = typeof dungeon !== "undefined" && dungeon && dungeon.progress && typeof dungeon.progress.floor === "number" ? dungeon.progress.floor : 1;
        if (typeof player.maxDungeonFloor !== "number" || isNaN(player.maxDungeonFloor) || player.maxDungeonFloor < 1) {
            player.maxDungeonFloor = _curFloor;
            _changedMaxFloor = true;
        }
        if (typeof player.maxDungeonFloorLvl !== "number" || isNaN(player.maxDungeonFloorLvl) || player.maxDungeonFloorLvl < 1) {
            player.maxDungeonFloorLvl = typeof player.lvl === "number" && player.lvl >= 1 ? player.lvl : 1;
            _changedMaxFloor = true;
        }
        if (typeof player.maxDungeonFloorReachLvl !== "number" || isNaN(player.maxDungeonFloorReachLvl) || player.maxDungeonFloorReachLvl < 1) {
            player.maxDungeonFloorReachLvl =
                typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl)
                    ? Math.floor(player.maxDungeonFloorLvl)
                    : typeof player.lvl === "number" && player.lvl >= 1
                      ? player.lvl
                      : 1;
            _changedMaxFloor = true;
        }
        if (!("maxDungeonFloorSect" in player)) {
            player.maxDungeonFloorSect = player.sect || null;
            _changedMaxFloor = true;
        }
        var _repairHistLvl = Math.max(
            typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl) ? Math.floor(player.maxDungeonFloorLvl) : 1,
            typeof player.maxDungeonFloorReachLvl === "number" && !isNaN(player.maxDungeonFloorReachLvl)
                ? Math.floor(player.maxDungeonFloorReachLvl)
                : 1,
            typeof player.lvl === "number" && player.lvl >= 1 ? Math.floor(player.lvl) : 1
        );
        if (_repairHistLvl > (typeof player.maxDungeonFloorLvl === "number" ? player.maxDungeonFloorLvl : 0)) {
            player.maxDungeonFloorLvl = _repairHistLvl;
            _changedMaxFloor = true;
        }
        if (_changedMaxFloor) {
            if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
            else if (typeof saveData === "function") saveData();
        }
    }
    /** 秘境奇遇机缘：老档 bonusStats 超出「历史层数×每层上限」时压回（须在 maxDungeonFloor 补全之后） */
    if (typeof repairPlayerDungeonEventOpportunityBonusToCaps === "function" && player && !player.dungeonEventOppBonusCapMigrate2026) {
        repairPlayerDungeonEventOpportunityBonusToCaps();
        player.dungeonEventOppBonusCapMigrate2026 = true;
        if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
        else if (typeof saveData === "function") saveData();
    }
    if (typeof window.reconcileEquippedInventoryDuplicates === "function") {
        try {
            if (window.reconcileEquippedInventoryDuplicates()) {
                if (typeof window.dongtianPersistBootSave === "function") window.dongtianPersistBootSave();
                else if (typeof saveData === "function") {
                    saveData({ forceCloud: true, playerMutation: true });
                }
            }
        } catch (eBootEqDedupe) {}
    }
    if (typeof playerLoadStats === "function") {
        playerLoadStats();
    }
    if (window.DONGTIAN_CLOUD_MODE && player && typeof ensureInventoryMaterials === "function") {
        ensureInventoryMaterials();
    }
    /** 读档时按当前 expMax 规则校正修为条（含取消境界 1.1 叠乘后的旧档） */
    if (typeof repairDongtianPlayerExpPostLvl100Curve === "function" && player) {
        if (
            repairDongtianPlayerExpPostLvl100Curve(player) &&
            typeof saveData === "function"
        ) {
            saveData({ forceCloud: !!window.DONGTIAN_CLOUD_MODE, playerMutation: true });
        }
    }
    /** 读档/联网拉档后压一次修为条：与当前层封顶对齐（不会把 15「加」到 16；若存档已是 16 则仍为 16，除非另做降级迁移） */
    if (typeof dongtianDungeonPlayerExpApplyLevelUpsAndClamp === "function") {
        dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
    }

    if (!dongtianPlayerNeedsAllocationScreen()) {
        if (!player.allocated) {
            player.allocated = true;
            if (typeof saveData === "function") {
                saveData({ forceCloud: true, playerMutation: true });
            }
        }
        enterDungeon();
    } else {
        document.querySelector("#dungeon-main").style.display = "flex";
        allocationPopup();
    }

    if (window.DONGTIAN_CLOUD_MODE && typeof startDongtianInboxPoll === "function") {
        startDongtianInboxPoll();
    }
    if (window.DONGTIAN_CLOUD_MODE && typeof startDongtianRevisionPoll === "function") {
        startDongtianRevisionPoll();
    }

    if (window.DONGTIAN_CLOUD_MODE) {
        window.initDongtianCloudMarketAndArenaUi();
        setTimeout(function () {
            window.initDongtianCloudMarketAndArenaUi();
        }, 0);
    } else if (typeof window.initDongtianStandaloneHubUi === "function") {
        window.initDongtianStandaloneHubUi();
        setTimeout(function () {
            window.initDongtianStandaloneHubUi();
        }, 0);
    }

    // Unequip all items
    var unequipAllBtn = document.querySelector("#unequip-all");
    if (!unequipAllBtn) {
        // 行囊结构异常时仍应完成卷宗等绑定，避免修仙市场/武神坛永远不初始化
    } else if (!unequipAllBtn._dongtianUnequipBound) {
        unequipAllBtn._dongtianUnequipBound = true;
        unequipAllBtn.addEventListener("click", function () {

        dungeon.status.exploring = false;
        let dimTarget = document.querySelector('#inventory');
        dimTarget.style.filter = "brightness(50%)";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
        <div class="content">
            <p>尽数卸下身负之器？</p>
            <div class="button-container">
                <button id="unequip-confirm">卸下</button>
                <button id="unequip-cancel">作罢</button>
            </div>
        </div>`;
        let confirm = document.querySelector('#unequip-confirm');
        let cancel = document.querySelector('#unequip-cancel');
        confirm.onclick = function () {
            if (typeof canUnequipAllToInventory === "function" && !canUnequipAllToInventory()) {
                defaultModalElement.innerHTML = `
                <div class="content">
                    <p>行囊已满，无法容纳褪下之器。请先典让或整理行囊。</p>
                    <div class="button-container">
                        <button type="button" id="unequip-block-ok">知晓</button>
                    </div>
                </div>`;
                document.querySelector("#unequip-block-ok").onclick = function () {
                    defaultModalElement.style.display = "none";
                    defaultModalElement.innerHTML = "";
                    dimTarget.style.filter = "brightness(100%)";
                    continueExploring();
                };
                return;
            }
            unequipAll();
            continueExploring();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            dimTarget.style.filter = "brightness(100%)";
        };
        cancel.onclick = function () {
            continueExploring();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            dimTarget.style.filter = "brightness(100%)";
        };
    });
    }

    var menuBtnEl = document.querySelector("#menu-btn");
    if (menuBtnEl && !menuBtnEl._dongtianMenuBound) {
        menuBtnEl._dongtianMenuBound = true;
        menuBtnEl.addEventListener("click", function () {
        clearProfileTabRefreshTimer();
        closeInventory();
        if (typeof closeSectPassivesModal === "function") closeSectPassivesModal();
        if (typeof closePetModal === "function") closePetModal();

        dungeon.status.exploring = false;
        let dimDungeon = document.querySelector('#dungeon-main');
        dimDungeon.style.filter = "brightness(50%)";
        menuModalElement.style.display = "flex";

        // Menu tab
        menuModalElement.innerHTML = `
        <div class="content">
            <div class="content-head">
                <h3>卷宗   联网版本加群902481027</h3>
                <p id="close-menu"><i class="fa fa-xmark"></i></p>
            </div>
            <button type="button" id="player-menu"><i class="fas fa-user"></i>${formatDongtianDisplayName(player.name)}</button>
            <button type="button" id="stats">本轮秘境</button>
            <button type="button" id="menu-changelog">更新日记</button>
            <button type="button" id="menu-save">存档</button>
            <button type="button" id="quit-run">退出秘境</button>
        </div>`;

        let close = document.querySelector('#close-menu');
        let playerMenu = document.querySelector('#player-menu');
        let runMenu = document.querySelector('#stats');
        let menuChangelog = document.querySelector('#menu-changelog');
        let menuSave = document.querySelector('#menu-save');
        let quitRun = document.querySelector('#quit-run');

        // Player profile click function
        playerMenu.onclick = function () {
            clearProfileTabRefreshTimer();
            let playTime = new Date(player.playtime * 1000).toISOString().slice(11, 19);
            let maxFloor = typeof player.maxDungeonFloor === "number" && !isNaN(player.maxDungeonFloor) ? Math.floor(player.maxDungeonFloor) : 1;
            let maxLvl =
                typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl)
                    ? Math.floor(player.maxDungeonFloorLvl)
                    : player.lvl || 1;
            let reachLvl =
                typeof player.maxDungeonFloorReachLvl === "number" && !isNaN(player.maxDungeonFloorReachLvl)
                    ? Math.floor(player.maxDungeonFloorReachLvl)
                    : maxLvl;
            let maxSectName = "未立门派";
            if (typeof getSectById === "function" && player.maxDungeonFloorSect) {
                var sectRow = getSectById(player.maxDungeonFloorSect);
                if (sectRow && sectRow.name) maxSectName = sectRow.name;
            }
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content" id="profile-tab">
                <div class="content-head">
                    <h3>修士名录</h3>
                    <p id="profile-close"><i class="fa fa-xmark"></i></p>
                </div>
                <p>${formatDongtianDisplayName(player.name)}</p>
                <p id="profile-maxfloor">历史最高秘境层数：${maxFloor} 层</p>
                <p id="profile-maxlvl">当时修为：${reachLvl} 级 · ${maxSectName}</p>
                <p id="profile-maxlevel">历史最高等级：${maxLvl} 级</p>
                <p id="profile-kills">湮灭诸敌：${nFormatter(player.kills)}</p>
                <p id="profile-deaths">陨落劫数：${nFormatter(player.deaths)}</p>
                <p id="profile-playtime">修炼时长: ${playTime}</p>
            </div>`;
            let profileTab = document.querySelector('#profile-tab');
            profileTab.style.width = "15rem";
            let profileClose = document.querySelector('#profile-close');
            __profileTabRefreshTimer = setInterval(function () {
                try {
                    if (!defaultModalElement || defaultModalElement.style.display === "none") {
                        clearProfileTabRefreshTimer();
                        return;
                    }
                    var elMaxFloor = document.querySelector("#profile-maxfloor");
                    var elMaxLvl = document.querySelector("#profile-maxlvl");
                    var elMaxLevel = document.querySelector("#profile-maxlevel");
                    var elKills = document.querySelector("#profile-kills");
                    var elDeaths = document.querySelector("#profile-deaths");
                    var elPlayTime = document.querySelector("#profile-playtime");
                    if (!elMaxFloor || !elMaxLvl || !elMaxLevel || !elKills || !elDeaths || !elPlayTime) return;

                    let playTime2 = new Date(player.playtime * 1000).toISOString().slice(11, 19);
                    let maxFloor2 = typeof player.maxDungeonFloor === "number" && !isNaN(player.maxDungeonFloor) ? Math.floor(player.maxDungeonFloor) : 1;
                    let maxLvl2 =
                        typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl)
                            ? Math.floor(player.maxDungeonFloorLvl)
                            : player.lvl || 1;
                    let reachLvl2 =
                        typeof player.maxDungeonFloorReachLvl === "number" && !isNaN(player.maxDungeonFloorReachLvl)
                            ? Math.floor(player.maxDungeonFloorReachLvl)
                            : maxLvl2;
                    let maxSectName2 = "未立门派";
                    if (typeof getSectById === "function" && player.maxDungeonFloorSect) {
                        var sectRow2 = getSectById(player.maxDungeonFloorSect);
                        if (sectRow2 && sectRow2.name) maxSectName2 = sectRow2.name;
                    }

                    elPlayTime.textContent = `修炼时长: ${playTime2}`;
                    elMaxFloor.textContent = `历史最高秘境层数：${maxFloor2} 层`;
                    elMaxLvl.textContent = `当时修为：${reachLvl2} 级 · ${maxSectName2}`;
                    elMaxLevel.textContent = `历史最高等级：${maxLvl2} 级`;
                    elKills.textContent = `湮灭诸敌：${nFormatter(player.kills)}`;
                    elDeaths.textContent = `陨落劫数：${nFormatter(player.deaths)}`;
                } catch (e) {}
            }, 1000);

            profileClose.onclick = function () {
                clearProfileTabRefreshTimer();
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        // Dungeon run click function
        runMenu.onclick = function () {
            clearProfileTabRefreshTimer();
            let runTime = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content" id="run-tab">
                <div class="content-head">
                    <h3>本轮秘境</h3>
                    <p id="run-close"><i class="fa fa-xmark"></i></p>
                </div>
                <p>${formatDongtianDisplayName(player.name)} ${cultivationRealmLabel(player.lvl)}（${typeof getSectById === "function" && player.sect ? ((getSectById(player.sect) || {}).name || "—") : "—"}）</p>
                <p>天眷 ${player.blessing} 层</p>
                <p>邪印 Lvl.${Math.round((dungeon.settings.enemyScaling - 1) * 10)}</p>
                <p>湮灭诸敌：${nFormatter(dungeon.statistics.kills)}</p>
                <p>本轮探索: ${runTime}</p>
            </div>`;
            let runTab = document.querySelector('#run-tab');
            runTab.style.width = "15rem";
            let runClose = document.querySelector('#run-close');
            runClose.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        menuChangelog.onclick = function () {
            clearProfileTabRefreshTimer();
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content changelog-modal-sheet">
                <div class="content-head">
                    <h3>更新日记</h3>
                    <p id="changelog-close"><i class="fa fa-xmark"></i></p>
                </div>
                <div class="changelog-scroll scrollable">${DONGTIAN_JIE_CHANGELOG_HTML}</div>
            </div>`;
            var ch = document.querySelector(".changelog-modal-sheet");
            if (ch) ch.style.maxWidth = "min(22rem, 94vw)";
            document.querySelector("#changelog-close").onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        menuSave.onclick = function () {
            clearProfileTabRefreshTimer();
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            var isCloud = !!window.DONGTIAN_CLOUD_MODE;
            var escName = player && player.name != null ? String(player.name).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") : "";
            defaultModalElement.innerHTML = `
            <div class="content dongtian-save-sheet">
                <div class="content-head">
                    <h3>存档</h3>
                    <p id="save-panel-close"><i class="fa fa-xmark"></i></p>
                </div>
                <h4 class="dongtian-save-section-title">角色档案</h4>
                <p class="dongtian-save-section-desc">改名与头像</p>
                <label class="dongtian-field-label" for="dongtian-rename-input">道号</label>
                <div class="dongtian-rename-row">
                    <input type="text" id="dongtian-rename-input" class="dongtian-rename-input" maxlength="15" autocomplete="off" value="${escName}" />
                    <button type="button" class="btn btn--sm btn--accent" id="dongtian-rename-save">保存道号</button>
                </div>
                <label class="dongtian-field-label">头像</label>
                ${
                    isCloud
                        ? '<p class="dongtian-save-hint dongtian-save-hint--tight">修改头像。</p>'
                        : '<div class="dongtian-avatar-row">' +
                          '<button type="button" class="btn btn--sm btn--ghost" id="dongtian-avatar-pick">选择图片…</button>' +
                          '<button type="button" class="btn btn--sm btn--ghost" id="dongtian-avatar-clear">恢复默认</button>' +
                          '<input type="file" id="dongtian-avatar-file" accept="image/*" style="display:none" />' +
                          "</div>" +
                          '<p class="dongtian-save-hint dongtian-save-hint--tight">支持常见图片格式；过大时请换较小文件（约数百 KB 内）。</p>'
                }
                <h4 class="dongtian-save-section-title">备份与恢复</h4>
                <p class="dongtian-save-hint">${
                    isCloud
                        ? ""
                        : "进度保存在本机浏览器。建议定期导出加密备份；清除站点数据或换电脑前请先备份。"
                }</p>
                <div class="dongtian-save-actions">
                    <button type="button" class="btn btn--sm btn--primary" id="dongtian-btn-export">导出加密存档（TXT）</button>
                    ${
                        isCloud
                            ? ""
                            : '<button type="button" class="btn btn--sm btn--ghost" id="dongtian-btn-import">从文件导入…</button><input type="file" id="dongtian-file-import" accept="text/plain,.txt,application/json,.json" style="display:none" />'
                    }
                </div>
            </div>`;
            var renameInp = document.getElementById("dongtian-rename-input");
            document.getElementById("dongtian-rename-save").onclick = function () {
                try {
                    player.name = sanitizeDongtianMenuPlayerName(renameInp ? renameInp.value : "");
                    if (typeof saveData === "function") saveData();
                    if (typeof playerLoadStats === "function") playerLoadStats();
                    refreshDongtianMenuPlayerButton();
                } catch (exR) {
                    alert(exR.message || String(exR));
                }
            };
            if (!isCloud) {
                var avPick = document.getElementById("dongtian-avatar-pick");
                var avFile = document.getElementById("dongtian-avatar-file");
                var avClear = document.getElementById("dongtian-avatar-clear");
                if (avPick && avFile) {
                    avPick.onclick = function () {
                        avFile.click();
                    };
                    avFile.onchange = function (evA) {
                        var fa = evA.target.files && evA.target.files[0];
                        if (!fa) return;
                        if (fa.size > 900000) {
                            alert("图片文件过大，请选择约 800KB 以内的图片。");
                            avFile.value = "";
                            return;
                        }
                        var rdr = new FileReader();
                        rdr.onload = function () {
                            var du = String(rdr.result || "");
                            if (du.length > DONGTIAN_AVATAR_DATAURL_MAX) {
                                alert("图片编码后过大，请换一张更小的图。");
                                avFile.value = "";
                                return;
                            }
                            if (du.indexOf("data:image/") !== 0) {
                                alert("请选择有效的图片文件。");
                                avFile.value = "";
                                return;
                            }
                            player.avatarDataUrl = du;
                            if (typeof saveData === "function") saveData();
                            if (typeof syncHudBarAvatar === "function") syncHudBarAvatar();
                            avFile.value = "";
                        };
                        rdr.readAsDataURL(fa);
                    };
                }
                if (avClear) {
                    avClear.onclick = function () {
                        try {
                            delete player.avatarDataUrl;
                            if (typeof saveData === "function") saveData();
                            if (typeof syncHudBarAvatar === "function") syncHudBarAvatar();
                        } catch (exC) {}
                    };
                }
            }
            document.getElementById("dongtian-btn-export").onclick = function () {
                try {
                    dongtianExportSaveTxtBlob();
                } catch (ex) {
                    alert(ex.message || String(ex));
                }
            };
            var btnImp = document.getElementById("dongtian-btn-import");
            var fileInp = document.getElementById("dongtian-file-import");
            if (btnImp && fileInp) {
                btnImp.onclick = function () {
                    fileInp.click();
                };
                fileInp.onchange = function (ev) {
                    var f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    var reader = new FileReader();
                    reader.onload = function () {
                        var txt = String(reader.result || "");
                        var data;
                        try {
                            data = JSON.parse(txt);
                        } catch (eParse) {
                            alert("导入失败：无法解析文件（请确认是 UTF-8 文本存档）。");
                            fileInp.value = "";
                            return;
                        }
                        if (dongtianIsEncryptedSaveEnvelope(data)) {
                            if (!dongtianSaveEncryptionAvailable()) {
                                alert(
                                    "加密存档需在支持加密的环境导入（https、localhost 或 127.0.0.1）。若以直接打开本地文件方式游玩，请改用本地网页服务打开后再导入。"
                                );
                                fileInp.value = "";
                                return;
                            }
                            dongtianOpenImportPasswordModal(
                                function (pwImp) {
                                    dongtianSaveDecryptEnvelope(data, pwImp)
                                        .then(function (inner) {
                                            var innerData = JSON.parse(inner);
                                            dongtianApplyImportedSavePayload(innerData);
                                        })
                                        .catch(function (eDec) {
                                            alert("导入失败：" + (eDec.message || eDec));
                                            fileInp.value = "";
                                        });
                                },
                                function () {
                                    fileInp.value = "";
                                }
                            );
                            return;
                        }
                        try {
                            dongtianApplyImportedSavePayload(data);
                        } catch (eImp) {
                            alert("导入失败：" + (eImp.message || eImp));
                            fileInp.value = "";
                        }
                    };
                    reader.readAsText(f, "utf-8");
                };
            }
            document.getElementById("save-panel-close").onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        // Quit the current run
        quitRun.onclick = function () {
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>确定放弃本轮秘境历练？</p>
                <div class="button-container">
                    <button id="quit-run">退出秘境</button>
                    <button id="cancel-quit">作罢</button>
                </div>
            </div>`;
            let quit = document.querySelector('#quit-run');
            let cancel = document.querySelector('#cancel-quit');
            quit.onclick = function () {
                if (typeof window.dongtianConfirmRestartRunAfterDefeat === "function") {
                    window.dongtianConfirmRestartRunAfterDefeat(function () {
                        let dimDungeon = document.querySelector("#dungeon-main");
                        dimDungeon.style.filter = "brightness(100%)";
                        dimDungeon.style.display = "none";
                        menuModalElement.style.display = "none";
                        menuModalElement.innerHTML = "";
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                        runLoad("dungeon-main", "flex");
                        clearInterval(dungeonTimer);
                        clearInterval(playTimer);
                        progressReset();
                        setTimeout(function () {
                            allocationPopup();
                        }, 350);
                    });
                }
            };
            cancel.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        // Close menu
        close.onclick = function () {
            clearProfileTabRefreshTimer();
            continueExploring();
            menuModalElement.style.display = "none";
            menuModalElement.innerHTML = "";
            dimDungeon.style.filter = "brightness(100%)";
        };
    });
    }
}

window.addEventListener("load", function () {
    if (window.DONGTIAN_CLOUD_MODE) {
        dongtianCloudLoadAndBoot();
        return;
    }
    dilaoGameBoot();
});

// Loading Screen
const runLoad = (id, display) => {
    let loader = document.querySelector("#loading");
    loader.style.display = "flex";
    setTimeout(async () => {
        loader.style.display = "none";
        document.querySelector(`#${id}`).style.display = `${display}`;
    }, 300);
}

// Start the game
const isValidEnemySnapshot = (e) => {
    if (!e || typeof e !== "object") return false;
    if (!e.stats || typeof e.stats !== "object") return false;
    if (typeof e.name !== "string" || !e.name.trim()) return false;
    if (typeof e.lvl !== "number" || !isFinite(e.lvl) || e.lvl < 1) return false;
    if (typeof e.stats.hp !== "number" || !isFinite(e.stats.hp)) return false;
    if (typeof e.stats.hpMax !== "number" || !isFinite(e.stats.hpMax) || e.stats.hpMax <= 0) return false;
    return e.stats.hp > 0;
};

/** 云读档后：服务端残留的 inCombat + 无效 enemy 勿带入秘境（否则进洞就弹斗法或存档异常） */
function dongtianSanitizeCloudSaveCombatOnLoad() {
    if (!window.DONGTIAN_CLOUD_MODE || typeof player !== "object" || !player || !player.inCombat) return false;
    var e = typeof enemy !== "undefined" ? enemy : null;
    if (isValidEnemySnapshot(e)) return false;
    player.inCombat = false;
    try {
        delete player.combatTimerSync;
    } catch (ePs) {}
    if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
        dungeon.status.event = false;
    }
    try {
        if (typeof generateRandomEnemy === "function") generateRandomEnemy();
    } catch (eGen) {}
    window.__dongtianLocalPlayerDirty = true;
    return true;
}

const enterDungeon = () => {
    dongtianResetBlockingOverlays();
    runLoad("dungeon-main", "flex");
    try {
        if (
            typeof window !== "undefined" &&
            window.__treasureMapCombatSettling
        ) {
            if (typeof window.restoreDungeonHubAfterTreasureMap === "function") {
                window.restoreDungeonHubAfterTreasureMap();
            }
        }
    } catch (eTmEnter) {}
    if (player.inCombat) {
        let loadedEnemy = null;
        try {
            if (window.DONGTIAN_CLOUD_MODE) {
                loadedEnemy = enemy;
            } else {
                loadedEnemy = JSON.parse(localStorage.getItem("enemyData"));
            }
        } catch (e) {
            loadedEnemy = null;
        }
        if (
            loadedEnemy &&
            (loadedEnemy.demonTower || loadedEnemy.dragonTower || loadedEnemy.divineRealm || loadedEnemy.spiritBeastRealm || loadedEnemy.ghostRealm) &&
            !(loadedEnemy.treasureMapBattle)
        ) {
            try {
                if (typeof window.stripSpecialCombatEnemyMarks === "function") {
                    window.stripSpecialCombatEnemyMarks(loadedEnemy);
                }
            } catch (eStrip) {}
            if (!isValidEnemySnapshot(loadedEnemy)) {
                player.inCombat = false;
                if (typeof window.clearCombatTimerSyncOnly === "function") window.clearCombatTimerSyncOnly();
                if (typeof dungeon !== "undefined" && dungeon && dungeon.status) dungeon.status.event = false;
                if (typeof window.dongtianFlushCloudSaveImmediate === "function") window.dongtianFlushCloudSaveImmediate();
                else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
            }
        }
        if (player.inCombat && isValidEnemySnapshot(loadedEnemy)) {
            enemy = loadedEnemy;
            if (loadedEnemy.molongRaid && typeof window.molongRestoreGuestStatsFromRaid === "function") {
                window.molongRestoreGuestStatsFromRaid();
            }
            showCombatInfo();
            /** 续战已有 combatTimerSync 轴时勿强制妖兽先手，避免读档多挨一刀（体感「莫名暴毙」） */
            if (typeof window !== "undefined" && !loadedEnemy.molongRaid) {
                var canResumeCombat =
                    typeof window.readCombatResumeDelays === "function" && window.readCombatResumeDelays();
                if (!canResumeCombat) {
                    window.__combatForceEnemyFirstAfterReload = true;
                }
            }
            startCombat();
        } else {
            // 旧档或异常状态：避免刷新后误进“null 敌人”斗法面板
            player.inCombat = false;
            if (typeof window.clearCombatTimerSyncOnly === "function") window.clearCombatTimerSyncOnly();
            if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
                dungeon.status.event = false;
            }
            if (typeof window.dongtianFlushCloudSaveImmediate === "function") window.dongtianFlushCloudSaveImmediate();
            else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
        }
    }
    /** 先加载秘境存档。勿在此处因 hp==0 调用 progressReset，否则会先清空洞天历时/劫数再读档，导致重启后两项被初始化。 */
    initialDungeonLoad();
    if (player.stats.hp < 1 && !player.inCombat) {
        if (player.dungeonDefeatPending) {
            /** 秘境战败已落盘但未点「重整再战」：勿回满血 */
            if (typeof window.dongtianRestoreDungeonDefeatAfterReload === "function") {
                window.dongtianRestoreDungeonDefeatAfterReload();
            }
        } else if (typeof dongtianHealOrphanHubHpIfNeeded === "function" && dongtianHealOrphanHubHpIfNeeded()) {
            if (typeof window.dongtianFlushCloudSaveImmediate === "function") window.dongtianFlushCloudSaveImmediate();
            else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
        } else {
            player.stats.hp = player.stats.hpMax;
            if (typeof window.dongtianFlushCloudSaveImmediate === "function") window.dongtianFlushCloudSaveImmediate();
            else if (typeof saveData === "function") saveData({ forceCloud: true, playerMutation: true });
        }
    }
    playerLoadStats();
    dongtianHealOrphanCombatOverlay();
}

// Save all the data into local storage（嵌入主游戏时改为联网账号存档）
const saveData = (saveOpts) => {
    saveOpts = saveOpts || {};
    if (
        !window.DONGTIAN_CLOUD_MODE &&
        typeof window.dongtianAnticheatClockTick === "function"
    ) {
        var acHit = window.dongtianAnticheatClockTick();
        if (acHit && acHit.violation) return;
    }
    if (typeof window.syncCombatWallTimersToPlayer === "function") window.syncCombatWallTimersToPlayer();
    if (window.DONGTIAN_CLOUD_MODE) {
        // 云档尚未完成有效拉取时，禁止上传，防止空内存/新建角色覆盖线上旧档。
        if (!window.__dongtianCloudHydrated) return;
        var inCombat = typeof player === "object" && player && player.inCombat;
        if (inCombat && !saveOpts.forceCloud) {
            /** 斗法中勿 debounce POST（与换装/结算竞态）；标记 dirty+影子，endCombat/关页 forceCloud 落盘 */
            window.__dongtianLocalPlayerDirty = true;
            var combatDeferEp = dongtianClientEpochForPost() + 1;
            if (
                typeof window.__dongtianLocalChangeEpoch !== "number" ||
                window.__dongtianLocalChangeEpoch < combatDeferEp
            ) {
                window.__dongtianLocalChangeEpoch = combatDeferEp;
            }
            dongtianWriteInventoryShadow();
            return;
        }
        if (inCombat) clearDongtianCombatPeriodicCloudSave();
        var isPlayerMutation = !!(saveOpts.forceCloud || saveOpts.playerMutation);
        if (isPlayerMutation) {
            if (!saveOpts.skipMarkMutation) {
                dongtianMarkPlayerMutation();
            }
            if (__dongtianSaveTimer) {
                clearTimeout(__dongtianSaveTimer);
                __dongtianSaveTimer = null;
            }
            dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
            return;
        }
        window.__dongtianLocalPlayerDirty = true;
        window.__dongtianLocalChangeEpoch = dongtianClientEpochForPost() + 1;
        dongtianWriteInventoryShadow();
        if (__dongtianCloudSaveInFlight) {
            __dongtianCloudSaveNeedsRetry = true;
        }
        scheduleDongtianCloudSave();
        if (__dongtianCloudSaveSafetyTimer) {
            clearTimeout(__dongtianCloudSaveSafetyTimer);
        }
        __dongtianCloudSaveSafetyTimer = setTimeout(function () {
            __dongtianCloudSaveSafetyTimer = null;
            if (window.__dongtianCloudReloading) return;
            if (dongtianCloudSaveStillPending()) {
                dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
            }
        }, DONGTIAN_CLOUD_SAVE_SAFETY_MS);
        if (typeof dungeon !== "undefined" && dungeon) {
            if (__dongtianDungeonProgressSaveTimer) {
                clearTimeout(__dongtianDungeonProgressSaveTimer);
            }
            __dongtianDungeonProgressSaveTimer = setTimeout(function () {
                __dongtianDungeonProgressSaveTimer = null;
                if (window.__dongtianCloudReloading) return;
                if (dongtianCloudSaveStillPending()) {
                    dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                }
            }, DONGTIAN_DUNGEON_PROGRESS_FORCE_MS);
        }
        return;
    }
    if (inCombat && !saveOpts.forceCloud) {
        return;
    }
    const playerData = JSON.stringify(player);
    const dungeonData = JSON.stringify(dungeon);
    const enemyData = JSON.stringify(enemy);
    localStorage.setItem("playerData", playerData);
    localStorage.setItem("dungeonData", dungeonData);
    localStorage.setItem("enemyData", enemyData);
}

/** 身法软上限：合计身法 ≤ 该值时全额生效；超出部分仅按 ATK_SPD_OVER_SOFT_CAP_MULT 计入（抑制机缘/套装等叠满后过快） */
var ATK_SPD_SOFT_CAP = 0.83;
var ATK_SPD_OVER_SOFT_CAP_MULT = 0.1;
/**
 * 遗器平铺气血/力道/护体吃「同类机缘总百分比」的几成：平铺 × (1 + 机缘% × 本系数 / 100)。
 * 机缘% 与乘先天者相同（道体、功法%、套装、灵宠、灵窍%、称号）。
 * 气血 10.0 = 机缘 1000% 作用在平铺；力道/护体 1.0 = 各 100%。
 */
var EQUIP_HP_FLAT_OPPORTUNITY_FRAC = 10;
var EQUIP_ATK_FLAT_OPPORTUNITY_FRAC = 1;
var EQUIP_DEF_FLAT_OPPORTUNITY_FRAC = 1;

// Calculate every player stat
const calculateStats = () => {
    var eqSetBonus = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    if (typeof aggregateEquipmentSetBonuses === "function" && player && Array.isArray(player.equipped)) {
        eqSetBonus = aggregateEquipmentSetBonuses(player.equipped);
    }
    player.equipmentSetBonusStats = eqSetBonus;

    let equipmentAtkSpd = player.baseStats.atkSpd * (player.equippedStats.atkSpd / 100);
    var gemB =
        typeof getGemBonusLikePet === "function"
            ? getGemBonusLikePet()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    let playerHpBase = player.baseStats.hp;
    let playerAtkBase = player.baseStats.atk;
    let playerDefBase = player.baseStats.def;
    let playerAtkSpdBase = player.baseStats.atkSpd;
    let playerVampBase = player.baseStats.vamp;
    let playerCRateBase = player.baseStats.critRate;
    let playerCDmgBase = player.baseStats.critDmg;

    var pb = { hpPct: 0, atkPct: 0, defPct: 0, atkSpdPct: 0, vamp: 0, critRate: 0, critDmg: 0, flatHp: 0, flatAtk: 0, flatDef: 0 };
    if (typeof aggregatePassiveStatBonuses === "function") {
        pb = aggregatePassiveStatBonuses(player.equippedPassives || []);
    }
    var tAtk = (player.tempStats && player.tempStats.atk) ? player.tempStats.atk : 0;
    var tAspd = (player.tempStats && player.tempStats.atkSpd) ? player.tempStats.atkSpd : 0;
    var atkCore = playerAtkBase + tAtk;
    var atkSpdCore = playerAtkSpdBase + tAspd;

    var sectWeaponAtkPct = 0;
    if (player.sect && typeof getSectWeaponCategory === "function") {
        var wantWeapon = getSectWeaponCategory(player.sect);
        if (wantWeapon && player.equipped && player.equipped.length) {
            for (var ewi = 0; ewi < player.equipped.length; ewi++) {
                var ew = player.equipped[ewi];
                if (ew && ew.type === "Weapon" && ew.category === wantWeapon) {
                    sectWeaponAtkPct = typeof SECT_WEAPON_ATK_BONUS_PCT === "number" ? SECT_WEAPON_ATK_BONUS_PCT : 50;
                    break;
                }
            }
        }
    }
    player.sectWeaponAtkBonusPct = sectWeaponAtkPct;

    var petB = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    if (typeof getActivePetBonusStats === "function") {
        petB = getActivePetBonusStats();
    }

    var titleB =
        typeof aggregateTitleBonuses === "function"
            ? aggregateTitleBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var shituB =
        typeof aggregateShituMentorBonuses === "function"
            ? aggregateShituMentorBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var lingtianB =
        typeof aggregateLingtianHerbCombatBonuses === "function"
            ? aggregateLingtianHerbCombatBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var dtTowerB =
        typeof window.getDongtianDragonTowerOpportunityBonuses === "function"
            ? window.getDongtianDragonTowerOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0 };
    var dtDemonB =
        typeof window.getDongtianDemonTowerOpportunityBonuses === "function"
            ? window.getDongtianDemonTowerOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0 };
    var dtDivineB =
        typeof window.getDongtianDivineRealmOpportunityBonuses === "function"
            ? window.getDongtianDivineRealmOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0 };
    var dtSbrB =
        typeof window.getDongtianSpiritBeastRealmOpportunityBonuses === "function"
            ? window.getDongtianSpiritBeastRealmOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0 };
    var dtGhostB =
        typeof window.getDongtianGhostRealmOpportunityBonuses === "function"
            ? window.getDongtianGhostRealmOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0 };
    var yuqiB =
        typeof window.getDongtianYuqiOpportunityBonuses === "function"
            ? window.getDongtianYuqiOpportunityBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    var curioB =
        typeof window.aggregateSwordSpiritCurioBonuses === "function"
            ? window.aggregateSwordSpiritCurioBonuses()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };

    var hpFlatOppFrac =
        typeof EQUIP_HP_FLAT_OPPORTUNITY_FRAC === "number" && isFinite(EQUIP_HP_FLAT_OPPORTUNITY_FRAC)
            ? EQUIP_HP_FLAT_OPPORTUNITY_FRAC
            : 10;
    var atkFlatOppFrac =
        typeof EQUIP_ATK_FLAT_OPPORTUNITY_FRAC === "number" && isFinite(EQUIP_ATK_FLAT_OPPORTUNITY_FRAC)
            ? EQUIP_ATK_FLAT_OPPORTUNITY_FRAC
            : 1;
    var defFlatOppFrac =
        typeof EQUIP_DEF_FLAT_OPPORTUNITY_FRAC === "number" && isFinite(EQUIP_DEF_FLAT_OPPORTUNITY_FRAC)
            ? EQUIP_DEF_FLAT_OPPORTUNITY_FRAC
            : 1;
    var hpPctTotal =
        player.bonusStats.hp +
        pb.hpPct +
        eqSetBonus.hp +
        petB.hp +
        gemB.hp +
        titleB.hp +
        shituB.hp +
        lingtianB.hp +
        (dtTowerB.hp || 0) +
        (dtDemonB.hp || 0) +
        (dtDivineB.hp || 0) +
        (dtSbrB.hp || 0) +
        (dtGhostB.hp || 0) +
        (yuqiB.hp || 0) +
        (curioB.hp || 0);
    var atkPctTotal =
        player.bonusStats.atk +
        pb.atkPct +
        eqSetBonus.atk +
        petB.atk +
        gemB.atk +
        titleB.atk +
        shituB.atk +
        lingtianB.atk +
        (dtTowerB.atk || 0) +
        (dtDemonB.atk || 0) +
        (dtDivineB.atk || 0) +
        (dtSbrB.atk || 0) +
        (dtGhostB.atk || 0) +
        (yuqiB.atk || 0) +
        (curioB.atk || 0);
    var defPctTotal =
        player.bonusStats.def +
        pb.defPct +
        eqSetBonus.def +
        petB.def +
        gemB.def +
        titleB.def +
        shituB.def +
        lingtianB.def +
        (dtTowerB.def || 0) +
        (dtDemonB.def || 0) +
        (dtDivineB.def || 0) +
        (dtSbrB.def || 0) +
        (dtGhostB.def || 0) +
        (yuqiB.def || 0) +
        (curioB.def || 0);

    /** 灵根血脉：有效机缘% = 原机缘同类总和 × (1 + (灵根该项% + 血脉该项%) / 100) */
    var lgxM =
        typeof window.getDongtianLinggenXuemaiMergedPct === "function"
            ? window.getDongtianLinggenXuemaiMergedPct()
            : { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    function lgxOppScale(key) {
        var v = Number(lgxM[key]) || 0;
        return 1 + v / 100;
    }
    /** 宗门等级：仅气血机缘在灵根血脉之后独立 ×(1+等级×50%)，与血脉相乘不相加 */
    var zmHpOppScale =
        typeof window.getDongtianZongmenOpportunityScale === "function"
            ? window.getDongtianZongmenOpportunityScale()
            : 1;
    if (!isFinite(zmHpOppScale) || zmHpOppScale < 1) zmHpOppScale = 1;
    var zmTech =
        typeof window.getDongtianZongmenTechniqueScales === "function"
            ? window.getDongtianZongmenTechniqueScales()
            : { hp: 1, atk: 1, def: 1, atkSpd: 1, vamp: 1, critRate: 1, critDmg: 1 };
    function techScale(key) {
        var v = zmTech && zmTech[key];
        return v > 1 && isFinite(v) ? v : 1;
    }
    var hpPctEff = hpPctTotal * lgxOppScale("hp") * zmHpOppScale * techScale("hp");
    var atkPctEff = atkPctTotal * lgxOppScale("atk") * techScale("atk");
    var defPctEff = defPctTotal * lgxOppScale("def") * techScale("def");

    var hpEquipMult = 1 + (hpPctEff * hpFlatOppFrac) / 100;
    var atkEquipMult = 1 + (atkPctEff * atkFlatOppFrac) / 100;
    var defEquipMult = 1 + (defPctEff * defFlatOppFrac) / 100;

    var vampOppPreLgx =
        player.bonusStats.vamp +
        player.equippedStats.vamp +
        pb.vamp +
        eqSetBonus.vamp +
        petB.vamp +
        titleB.vamp +
        shituB.vamp +
        lingtianB.vamp +
        (yuqiB.vamp || 0) +
        (curioB.vamp || 0);
    var critRateOppPreLgx =
        player.bonusStats.critRate +
        player.equippedStats.critRate +
        pb.critRate +
        eqSetBonus.critRate +
        petB.critRate +
        titleB.critRate +
        shituB.critRate +
        lingtianB.critRate +
        (yuqiB.critRate || 0) +
        (curioB.critRate || 0);
    var critDmgOppPreLgx =
        player.bonusStats.critDmg +
        player.equippedStats.critDmg +
        pb.critDmg +
        eqSetBonus.critDmg +
        petB.critDmg +
        gemB.critDmg +
        titleB.critDmg +
        shituB.critDmg +
        lingtianB.critDmg +
        (yuqiB.critDmg || 0) +
        (curioB.critDmg || 0);

    var aspBonusPctRow =
        player.bonusStats.atkSpd +
        pb.atkSpdPct +
        eqSetBonus.atkSpd +
        petB.atkSpd +
        gemB.atkSpd +
        titleB.atkSpd +
        shituB.atkSpd +
        lingtianB.atkSpd +
        (yuqiB.atkSpd || 0) +
        (curioB.atkSpd || 0);
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.dragonTower
    ) {
        aspBonusPctRow = Math.min(aspBonusPctRow, 30);
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.demonTower
    ) {
        aspBonusPctRow = Math.min(aspBonusPctRow, 1);
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.divineRealm
    ) {
        aspBonusPctRow = Math.min(aspBonusPctRow, 0.1);
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.spiritBeastRealm
    ) {
        aspBonusPctRow = Math.min(aspBonusPctRow, 0.01);
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.ghostRealm
    ) {
        aspBonusPctRow = Math.min(aspBonusPctRow, 0.01);
    }

    var aspBonusPctEff = aspBonusPctRow * lgxOppScale("atkSpd") * techScale("atkSpd");

    player.stats.hpMax = Math.round(
        (playerHpBase + playerHpBase * (hpPctEff / 100)) +
            player.equippedStats.hp * hpEquipMult +
            (pb.flatHp || 0)
    );
    var atkBeforeSectWeapon =
        (atkCore + atkCore * (atkPctEff / 100)) +
            player.equippedStats.atk * atkEquipMult +
            (pb.flatAtk || 0);
    player.stats.atk = Math.round(atkBeforeSectWeapon * (1 + sectWeaponAtkPct / 100));
    player.stats.def = Math.round(
        (playerDefBase + playerDefBase * (defPctEff / 100)) +
            player.equippedStats.def * defEquipMult +
            (pb.flatDef || 0)
    );

    var atkSpdRaw =
        (atkSpdCore + atkSpdCore * (aspBonusPctEff / 100)) +
        equipmentAtkSpd +
        (equipmentAtkSpd * (player.equippedStats.atkSpd / 100));
    var capAsp = typeof ATK_SPD_SOFT_CAP === "number" && isFinite(ATK_SPD_SOFT_CAP) ? ATK_SPD_SOFT_CAP : 0.83;
    var overMult =
        typeof ATK_SPD_OVER_SOFT_CAP_MULT === "number" && isFinite(ATK_SPD_OVER_SOFT_CAP_MULT)
            ? Math.max(0, ATK_SPD_OVER_SOFT_CAP_MULT)
            : 0.1;
    player.stats.atkSpd =
        atkSpdRaw <= capAsp ? atkSpdRaw : capAsp + (atkSpdRaw - capAsp) * overMult;
    var vampOppEff = vampOppPreLgx * lgxOppScale("vamp") * techScale("vamp");
    player.stats.vamp = playerVampBase + vampOppEff;
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.dragonTower &&
        player.stats.vamp > 10
    ) {
        player.stats.vamp = 10;
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.demonTower &&
        player.stats.vamp > 1
    ) {
        player.stats.vamp = 1;
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.divineRealm &&
        player.stats.vamp > 0.001
    ) {
        player.stats.vamp = 0.001;
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.spiritBeastRealm &&
        player.stats.vamp > 0.001
    ) {
        player.stats.vamp = 0.001;
    }
    if (
        typeof player !== "undefined" &&
        player &&
        player.inCombat &&
        typeof enemy !== "undefined" &&
        enemy &&
        enemy.ghostRealm &&
        player.stats.vamp > 0.001
    ) {
        player.stats.vamp = 0.001;
    }
    var critRateOppEff = critRateOppPreLgx * lgxOppScale("critRate") * techScale("critRate");
    player.stats.critRate = playerCRateBase + critRateOppEff;
    var critDmgOppEff = critDmgOppPreLgx * lgxOppScale("critDmg") * techScale("critDmg");
    player.stats.critDmg = playerCDmgBase + critDmgOppEff;

    // Caps attack speed to 2.5
    if (player.stats.atkSpd > 2.5) {
        player.stats.atkSpd = 2.5;
    }
    if (player.stats.hpMax > 0 && Number.isFinite(player.stats.hp) && player.stats.hp > player.stats.hpMax) {
        player.stats.hp = player.stats.hpMax;
    }
    var aspMult = typeof getPlayerAtkSpdEffectMult === "function" ? getPlayerAtkSpdEffectMult() : 1;
    if (aspMult > 0 && aspMult !== 1) {
        player.stats.atkSpd *= aspMult;
        if (player.stats.atkSpd < 0.06) {
            player.stats.atkSpd = 0.06;
        }
    }
}

// Resets the progress back to start
const progressReset = () => {
    if (player) player.dungeonDefeatPending = false;
    player.stats.hp = player.stats.hpMax;
    player.lvl = 1;
    player.blessing = 1;
    player.exp = {
        expCurr: 0,
        expMax: 100,
        expCurrLvl: 0,
        expMaxLvl: 100,
        lvlGained: 0
    };
    player.bonusStats = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0
    };
    /** 与 createNewPlayer 一致：新局须清零，否则高层累计的「余烬抉择/每级自动机缘」占用量仍在，低等级 cap 下无法再入账 */
    player.lvlupChoiceBonusApplied = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0
    };
    player.lvlupAutoBonusApplied = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0
    };
    player.sect = null;
    player.learnedPassives = [];
    player.equippedPassives = [];
    if (player.tempStats) {
        player.tempStats.atk = 0;
        player.tempStats.atkSpd = 0;
    }
    player.inCombat = false;
    if (typeof window.clearCombatTimerSyncOnly === "function") window.clearCombatTimerSyncOnly();
    dungeon.progress.floor = 1;
    dungeon.progress.room = 1;
    dungeon.statistics.kills = 0;
    dungeon.status = {
        exploring: false,
        paused: true,
        event: false,
    };
    dungeon.settings = {
        enemyBaseLvl: 1,
        enemyLvlGap: 5,
        enemyBaseStats: 1,
        enemyScaling: 1.12,
        deferredEvent: null,
        eventMemory: { faction: 0, ledger: 0, bondSoul: 0 },
        bondSoulSaga: null,
        chainTitleBuff: null,
    };
    delete dungeon.enemyMultipliers;
    delete player.allocated;
    dungeon.backlog.length = 0;
    dungeon.action = 0;
    dungeon.statistics.runtime = 0;
    combatBacklog.length = 0;
    /** 灵宠经验果实剩余场次（petExpDoubleCombatsRemaining）与行囊材料同属「跨局持久」：战败/重整再战/退出秘境只重置本局进度，不清此项 */
    if (typeof dongtianResetSameRoomPlayerExpDecay === "function") dongtianResetSameRoomPlayerExpDecay();
    /** 行囊材料（强化石等）与灵宠、遗器一致：战败/退出秘境不清，仅随 playerData 持久化 */
    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();
    /** 押镖/宝藏伏击挂起状态与计时器：战败会 clearInterval，此处一并清状态并重启 tick */
    if (typeof resetDungeonCombatSideFlags === "function") resetDungeonCombatSideFlags();
    if (typeof restartDungeonHubTimers === "function") restartDungeonHubTimers();
    try {
        window.__dongtianFreshRunAfterResetAt = Date.now();
        window.__dongtianIntentionalRunResetAt = Date.now();
        player.__dongtianRunResetGeneration =
            Math.floor(Number(player.__dongtianRunResetGeneration) || 0) + 1;
    } catch (eFrAt) {}
    if (window.DONGTIAN_CLOUD_MODE) {
        if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        }
        saveData({ forceCloud: true, playerMutation: true });
    } else {
        saveData();
    }
}

// Player Stat Allocation
const allocationPopup = () => {
    let allocation = {
        hp: 5,
        atk: 5,
        def: 5,
        atkSpd: 5
    }
    const updateStats = () => {
        stats = {
            hp: 50 * allocation.hp,
            atk: 10 * allocation.atk,
            def: 10 * allocation.def,
            atkSpd: 0.11 + (0.005 * (allocation.atkSpd - 5))
        }
    }
    updateStats();
    let points = 10;
    const statLabelZh = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法" };
    const rxFmt = /\.0+$|(\.[0-9]*[1-9])0+$/;
    /** 与 calculateStats 一致：身法实效 = 先天基数 × PLAYER_ATKSPD_EFFECT_MULT，下限 0.06 */
    const allocAtkSpdDisplayValue = function (baseAtkSpd) {
        var mult = typeof getPlayerAtkSpdEffectMult === "function" ? getPlayerAtkSpdEffectMult() : 1;
        var v = baseAtkSpd * mult;
        if (mult > 0 && mult !== 1 && v < 0.06) v = 0.06;
        return v;
    };
    const formatAllocStatLine = function (statKey) {
        if (statKey === "atkSpd") {
            var disp = allocAtkSpdDisplayValue(stats[statKey]);
            return statLabelZh[statKey] + " · " + disp.toFixed(2).replace(rxFmt, "$1");
        }
        return statLabelZh[statKey] + " · " + stats[statKey];
    };
    const sectCardsHtml = (typeof SECT_LIST !== "undefined" ? SECT_LIST : []).map(function (s, idx) {
        var sel = idx === 0 ? " is-selected" : "";
        return "<button type=\"button\" class=\"allocate-sect-card" + sel + "\" data-sect=\"" + s.id + "\" aria-pressed=\"" + (idx === 0 ? "true" : "false") + "\"><span class=\"allocate-sect-card__name\">" + s.name + "</span></button>";
    }).join("");
    const formatAllocateSectDescHtml = function (sect) {
        if (!sect) return "";
        var w = typeof getSectWeaponTypeZh === "function" ? getSectWeaponTypeZh(sect.id) : "";
        var armorZh = typeof getSectArmorAffinitySummaryZh === "function" ? getSectArmorAffinitySummaryZh(sect.id) : "";
        var html = "<p class=\"allocate-sect-blurb__text\">" + sect.blurb + "</p>";
        if (w || armorZh) {
            var parts = [];
            if (w) parts.push("「" + w + "」");
            if (armorZh) parts.push("「" + armorZh + "」");
            html += "<p class=\"allocate-sect-weapon\">专属器型：" + parts.join(" ") + "</p>";
        }
        return html;
    };
    const firstSectDescHtml = (typeof SECT_LIST !== "undefined" && SECT_LIST[0]) ? formatAllocateSectDescHtml(SECT_LIST[0]) : "";
    const loadContent = function () {
        defaultModalElement.innerHTML = `
        <div class="content allocate-sheet" id="allocate-stats">
            <div class="allocate-sheet__head">
                <div>
                    <h3>塑道本源</h3>
                    <p class="allocate-sheet__sub">分配先天点数，择一派入世</p>
                </div>
            </div>
            <div class="allocate-stats-grid">
                <div class="allocate-stat-row">
                    <div class="allocate-stat-row__label"><i class="fas fa-heart" aria-hidden="true"></i><span id="hpDisplay">${formatAllocStatLine("hp")}</span></div>
                    <div class="allocate-stat-row__stepper">
                        <button type="button" id="hpMin" aria-label="气血减">−</button>
                        <span id="hpAllo" class="allocate-stat-row__num">${allocation.hp}</span>
                        <button type="button" id="hpAdd" aria-label="气血加">+</button>
                    </div>
                </div>
                <div class="allocate-stat-row">
                    <div class="allocate-stat-row__label"><i class="ra ra-sword" aria-hidden="true"></i><span id="atkDisplay">${formatAllocStatLine("atk")}</span></div>
                    <div class="allocate-stat-row__stepper">
                        <button type="button" id="atkMin" aria-label="力道减">−</button>
                        <span id="atkAllo" class="allocate-stat-row__num">${allocation.atk}</span>
                        <button type="button" id="atkAdd" aria-label="力道加">+</button>
                    </div>
                </div>
                <div class="allocate-stat-row">
                    <div class="allocate-stat-row__label"><i class="ra ra-round-shield" aria-hidden="true"></i><span id="defDisplay">${formatAllocStatLine("def")}</span></div>
                    <div class="allocate-stat-row__stepper">
                        <button type="button" id="defMin" aria-label="护体减">−</button>
                        <span id="defAllo" class="allocate-stat-row__num">${allocation.def}</span>
                        <button type="button" id="defAdd" aria-label="护体加">+</button>
                    </div>
                </div>
                <div class="allocate-stat-row">
                    <div class="allocate-stat-row__label"><i class="ra ra-plain-dagger" aria-hidden="true"></i><span id="atkSpdDisplay">${formatAllocStatLine("atkSpd")}</span></div>
                    <div class="allocate-stat-row__stepper">
                        <button type="button" id="atkSpdMin" aria-label="身法减">−</button>
                        <span id="atkSpdAllo" class="allocate-stat-row__num">${allocation.atkSpd}</span>
                        <button type="button" id="atkSpdAdd" aria-label="身法加">+</button>
                    </div>
                </div>
            </div>
            <div class="allocate-points-row">
                <span id="alloPts" class="allocate-points-row__pts">先天点数 · ${points}</span>
                <button type="button" id="allocate-reset" class="btn btn--ghost btn--sm">溯回</button>
            </div>
            <h4 class="allocate-sect-heading">选择门派</h4>
            <div class="allocate-sect-grid" role="radiogroup" aria-label="选择门派">
                ${sectCardsHtml}
            </div>
            <h4 class="allocate-sect-heading allocate-sect-heading--info">门派信息</h4>
            <div class="allocate-sect-blurb" id="sect-desc">${firstSectDescHtml}</div>
            <button type="button" id="allocate-confirm" class="btn btn--primary allocate-confirm-btn">确认入秘境</button>
        </div>`;
    }
    defaultModalElement.style.display = "flex";
    defaultModalElement.classList.add("modal-container--allocate");
    document.querySelector("#dungeon-main").style.filter = "brightness(50%)";
    loadContent();

    // Stat Allocation
    const handleStatButtons = (e) => {
        if (e.includes("Add")) {
            let stat = e.split("Add")[0];
            if (points > 0) {
                allocation[stat]++;
                points--;
                updateStats();
                document.querySelector(`#${stat}Display`).innerHTML = formatAllocStatLine(stat);
                document.querySelector(`#${stat}Allo`).innerHTML = allocation[stat];
                document.querySelector(`#alloPts`).innerHTML = `先天点数 · ${points}`;
            }
        } else if (e.includes("Min")) {
            let stat = e.split("Min")[0];
            if (allocation[stat] > 5) {
                allocation[stat]--;
                points++;
                updateStats();
                document.querySelector(`#${stat}Display`).innerHTML = formatAllocStatLine(stat);
                document.querySelector(`#${stat}Allo`).innerHTML = allocation[stat];
                document.querySelector(`#alloPts`).innerHTML = `先天点数 · ${points}`;
            }
        }
    }
    document.querySelector("#hpAdd").onclick = function () {
        handleStatButtons("hpAdd")
    };
    document.querySelector("#hpMin").onclick = function () {
        handleStatButtons("hpMin")
    };
    document.querySelector("#atkAdd").onclick = function () {
        handleStatButtons("atkAdd")
    };
    document.querySelector("#atkMin").onclick = function () {
        handleStatButtons("atkMin")
    };
    document.querySelector("#defAdd").onclick = function () {
        handleStatButtons("defAdd")
    };
    document.querySelector("#defMin").onclick = function () {
        handleStatButtons("defMin")
    };
    document.querySelector("#atkSpdAdd").onclick = function () {
        handleStatButtons("atkSpdAdd")
    };
    document.querySelector("#atkSpdMin").onclick = function () {
        handleStatButtons("atkSpdMin")
    };

    let sectDescEl = document.querySelector("#sect-desc");
    document.querySelectorAll(".allocate-sect-card").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".allocate-sect-card").forEach(function (b) {
                b.classList.remove("is-selected");
                b.setAttribute("aria-pressed", "false");
            });
            btn.classList.add("is-selected");
            btn.setAttribute("aria-pressed", "true");
            if (typeof getSectById === "function" && sectDescEl) {
                var s = getSectById(btn.getAttribute("data-sect"));
                sectDescEl.innerHTML = s ? formatAllocateSectDescHtml(s) : "";
            }
        });
    });

    // Operation Buttons
    let confirm = document.querySelector("#allocate-confirm");
    let reset = document.querySelector("#allocate-reset");
    confirm.onclick = function () {
        // Set allocated stats to player base stats
        player.baseStats = {
            hp: stats.hp,
            atk: stats.atk,
            def: stats.def,
            pen: 0,
            atkSpd: stats.atkSpd,
            vamp: 0,
            critRate: 0,
            critDmg: 50
        }

        objectValidation();
        var sectEl = document.querySelector(".allocate-sect-card.is-selected");
        var sectId = sectEl ? sectEl.getAttribute("data-sect") : ((typeof SECT_LIST !== "undefined" && SECT_LIST[0]) ? SECT_LIST[0].id : null);
        player.sect = sectId;
        var firstId = typeof getFirstPassiveIdForSect === "function" ? getFirstPassiveIdForSect(sectId) : null;
        player.learnedPassives = firstId ? [firstId] : [];
        player.equippedPassives = firstId ? [firstId] : [];

        // Proceed to dungeon
        player.allocated = true;
        enterDungeon();
        player.stats.hp = player.stats.hpMax;
        playerLoadStats();
        if (typeof window.dongtianFlushCloudSaveImmediate === "function") {
            window.dongtianFlushCloudSaveImmediate();
        } else if (typeof saveData === "function") {
            saveData({ forceCloud: true, playerMutation: true });
        }
        defaultModalElement.style.display = "none";
        defaultModalElement.classList.remove("modal-container--allocate");
        defaultModalElement.innerHTML = "";
        document.querySelector("#dungeon-main").style.filter = "brightness(100%)";
    }
    reset.onclick = function () {
        allocation = {
            hp: 5,
            atk: 5,
            def: 5,
            atkSpd: 5
        };
        points = 10;
        updateStats();

        // Display Reset
        document.querySelector(`#hpDisplay`).innerHTML = formatAllocStatLine("hp");
        document.querySelector(`#atkDisplay`).innerHTML = formatAllocStatLine("atk");
        document.querySelector(`#defDisplay`).innerHTML = formatAllocStatLine("def");
        document.querySelector(`#atkSpdDisplay`).innerHTML = formatAllocStatLine("atkSpd");
        document.querySelector(`#hpAllo`).innerHTML = allocation.hp;
        document.querySelector(`#atkAllo`).innerHTML = allocation.atk;
        document.querySelector(`#defAllo`).innerHTML = allocation.def;
        document.querySelector(`#atkSpdAllo`).innerHTML = allocation.atkSpd;
        document.querySelector(`#alloPts`).innerHTML = `先天点数 · ${points}`;
        document.querySelectorAll(".allocate-sect-card").forEach(function (b, i) {
            b.classList.toggle("is-selected", i === 0);
            b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
        });
        if (sectDescEl && typeof SECT_LIST !== "undefined" && SECT_LIST[0]) {
            sectDescEl.innerHTML = formatAllocateSectDescHtml(SECT_LIST[0]);
        }
    }
}

const objectValidation = () => {
    if (typeof player === "object" && player && player.inCombat) {
        return;
    }
    if (player.skills == undefined) {
        player.skills = [];
    }
    if (player.skills && player.skills.length && !player.sect && typeof PASSIVE_BY_ID !== "undefined") {
        var legacy = {
            "Remnant Razor": { sect: "jianzhong", id: "jx_01" },
            "Titan's Will": { sect: "juling", id: "jl_01" },
            "Devastator": { sect: "kuanglan", id: "kl_01" },
            "Rampager": { sect: "kuanglan", id: "kl_04" },
            "Blade Dance": { sect: "wuxing", id: "wx_01" },
            "Paladin's Heart": { sect: "shengshi", id: "ss_01" },
            "Aegis Thorns": { sect: "jihuan", id: "jh_01" }
        };
        var m = legacy[player.skills[0]];
        if (m) {
            player.sect = m.sect;
            player.learnedPassives = [m.id];
            player.equippedPassives = [m.id];
        } else {
            player.sect = "jianzhong";
            player.learnedPassives = ["jx_01"];
            player.equippedPassives = ["jx_01"];
        }
        delete player.skills;
    }
    if (player.allocated && !player.sect && typeof getFirstPassiveIdForSect === "function") {
        player.sect = "jianzhong";
        player.learnedPassives = ["jx_01"];
        player.equippedPassives = ["jx_01"];
    }
    if (!player.learnedPassives) player.learnedPassives = [];
    if (!player.equippedPassives) player.equippedPassives = [];
    if (!player.learnedPassiveLevels || typeof player.learnedPassiveLevels !== "object") player.learnedPassiveLevels = {};
    for (var lpi = 0; lpi < player.learnedPassives.length; lpi++) {
        var lpid = player.learnedPassives[lpi];
        if (typeof player.learnedPassiveLevels[lpid] !== "number" || player.learnedPassiveLevels[lpid] < 1) {
            player.learnedPassiveLevels[lpid] = 1;
        }
    }
    if (player.sect && typeof getFirstPassiveIdForSect === "function") {
        var fid = getFirstPassiveIdForSect(player.sect);
        if (fid && player.learnedPassives.length === 0) player.learnedPassives = [fid];
        if (fid && player.equippedPassives.length === 0) player.equippedPassives = [fid];
    }
    if (typeof MAX_EQUIPPED_PASSIVES === "number" && player.equippedPassives.length > MAX_EQUIPPED_PASSIVES) {
        player.equippedPassives = player.equippedPassives.slice(0, MAX_EQUIPPED_PASSIVES);
    }
    if (player.tempStats == undefined) {
        player.tempStats = {};
        player.tempStats.atk = 0;
        player.tempStats.atkSpd = 0;
    }
    if (typeof player.petExpDoubleCombatsRemaining !== "number" || isNaN(player.petExpDoubleCombatsRemaining)) {
        player.petExpDoubleCombatsRemaining = 0;
    } else {
        player.petExpDoubleCombatsRemaining = Math.max(0, Math.floor(player.petExpDoubleCombatsRemaining));
    }
    /** 斗法每击都会 objectValidation；战斗中禁止落盘（含 localStorage  stringify），否则界面会周期性卡死 */
    if (!(typeof player === "object" && player && player.inCombat)) {
        saveData();
    }
}

