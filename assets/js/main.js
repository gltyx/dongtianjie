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
        combatTitleFxHidden: false
    };
    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();
    calculateStats();
    player.stats.hp = player.stats.hpMax;
    saveData();
}

var __dongtianSaveTimer = null;
/** 嵌入模式但云存档不可用：与单机相同使用本机 localStorage，不上传服务端 */
window.__dongtianCloudLocalFallback = false;
/** 正在从服务端拉取洞天存档（如修仙市场购后同步）时禁止上传，避免旧内存覆盖服务端刚写入的背包 */
window.__dongtianCloudReloading = false;
function cancelPendingDongtianCloudSave() {
    if (__dongtianSaveTimer) {
        clearTimeout(__dongtianSaveTimer);
        __dongtianSaveTimer = null;
    }
}
window.cancelPendingDongtianCloudSave = cancelPendingDongtianCloudSave;
/** 与 dongtian_*.json 的 updatedAt 对齐；用于防止旧内存 POST 盖掉市场发货后的服务端存档 */
window.__dongtianServerUpdatedAt = 0;
function dongtianCloudFlushSave() {
    try {
        if (window.__dongtianCloudReloading) return;
        if (window.__dongtianCloudLocalFallback) {
            if (typeof saveData === "function") saveData();
            return;
        }
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req || typeof player !== "object" || !player) return;
        var base =
            typeof window.__dongtianServerUpdatedAt === "number" && window.__dongtianServerUpdatedAt > 0
                ? window.__dongtianServerUpdatedAt
                : undefined;
        if (typeof window.syncCombatWallTimersToPlayer === "function") window.syncCombatWallTimersToPlayer();
        var postBody = { player: player, dungeon: dungeon, enemy: enemy };
        if (base !== undefined) postBody.baseUpdatedAt = base;
        req("POST", "/api/dongtian-jie/save", postBody, true)
            .then(function (res) {
                if (res && res.ok && typeof res.updatedAt === "number") {
                    window.__dongtianServerUpdatedAt = res.updatedAt;
                    return;
                }
                if (res && res.conflict && typeof window.dongtianReloadFromServerAfterConflict === "function") {
                    return window.dongtianReloadFromServerAfterConflict();
                }
            })
            .catch(function () {});
    } catch (e) {}
}
function scheduleDongtianCloudSave() {
    if (__dongtianSaveTimer) clearTimeout(__dongtianSaveTimer);
    __dongtianSaveTimer = setTimeout(function () {
        __dongtianSaveTimer = null;
        dongtianCloudFlushSave();
    }, 650);
}
window.__dongtianCloudFlushSave = dongtianCloudFlushSave;

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
    return { floor: fl, room: rm, displayName: name, grade: grade, kills: kills };
}
function dongtianPresencePingIfNeeded() {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated || window.__dongtianCloudLocalFallback) return;
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
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated || window.__dongtianCloudLocalFallback)
            return Promise.resolve();
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

/** 洞天劫系统消息收件箱（遇人通知等），轮询写入秘境日志 */
window.__dongtianInboxLastTs = 0;
window.__dongtianInboxTimer = null;
function escapeDongtianInboxHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function dongtianInboxPollOnce() {
    try {
        if (!window.DONGTIAN_CLOUD_MODE || !window.__dongtianCloudHydrated || window.__dongtianCloudLocalFallback) return;
        var req = window.parent && window.parent.goldGameApiRequest;
        if (!req || typeof addDungeonLog !== "function") return;
        var since =
            typeof window.__dongtianInboxLastTs === "number" && window.__dongtianInboxLastTs > 0
                ? window.__dongtianInboxLastTs
                : 0;
        req("GET", "/api/dongtian-jie/inbox?since=" + encodeURIComponent(since), undefined, true)
            .then(function (res) {
                if (!res || !res.ok || !Array.isArray(res.messages) || res.messages.length === 0) return;
                var maxTs = since;
                for (var i = 0; i < res.messages.length; i++) {
                    var m = res.messages[i];
                    if (!m || typeof m.text !== "string" || !m.text) continue;
                    if (typeof m.ts === "number" && m.ts > maxTs) maxTs = m.ts;
                    addDungeonLog('<span class="Heirloom">' + escapeDongtianInboxHtml(m.text) + "</span>");
                }
                if (maxTs > since) window.__dongtianInboxLastTs = maxTs;
                if (typeof updateDungeonLog === "function") updateDungeonLog();
            })
            .catch(function () {});
    } catch (eInbox) {}
}
function startDongtianInboxPoll() {
    if (!window.DONGTIAN_CLOUD_MODE || window.__dongtianCloudLocalFallback) return;
    if (window.__dongtianInboxTimer) clearInterval(window.__dongtianInboxTimer);
    dongtianInboxPollOnce();
    window.__dongtianInboxTimer = setInterval(dongtianInboxPollOnce, 20000);
}
window.startDongtianInboxPoll = startDongtianInboxPoll;

/** 服务端洞天存档比本地新时（如保存被拒），拉最新档并刷新材料/灵宠栏 */
window.dongtianReloadFromServerAfterConflict = function () {
    var req = window.parent && window.parent.goldGameApiRequest;
    if (!req) return Promise.resolve();
    if (typeof window.cancelPendingDongtianCloudSave === "function") window.cancelPendingDongtianCloudSave();
    window.__dongtianCloudReloading = true;
    return req("GET", "/api/dongtian-jie/save", undefined, true)
        .then(function (res) {
            if (res && res.ok && res.data && typeof window.dongtianApplyServerPayload === "function") {
                window.dongtianApplyServerPayload(res.data);
            }
        })
        .finally(function () {
            window.__dongtianCloudReloading = false;
        });
};
/** 服务端已改洞天存档后，用此函数覆盖内存中的 player/dungeon/enemy 并刷新 UI */
window.dongtianApplyServerPayload = function (data) {
    if (!data || !data.player) return;
    player = data.player;
    if (typeof mergeDungeonDefaults === "function") {
        dungeon = mergeDungeonDefaults(data.dungeon != null && typeof data.dungeon === "object" ? data.dungeon : null);
    }
    if (typeof window.dongtianSyncEscortMiningGlobalsFromDungeon === "function") {
        window.dongtianSyncEscortMiningGlobalsFromDungeon();
    }
    if (data.enemy && typeof data.enemy === "object") {
        enemy = data.enemy;
    }
    if (typeof data.updatedAt === "number" && isFinite(data.updatedAt)) {
        window.__dongtianServerUpdatedAt = data.updatedAt;
    }
    if (typeof playerLoadStats === "function") playerLoadStats();
    if (typeof dongtianDungeonPlayerExpApplyLevelUpsAndClamp === "function") {
        dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
    }
    if (typeof showEquipment === "function") showEquipment();
    if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
    if (typeof renderPetPanel === "function") renderPetPanel();
    if (window.DONGTIAN_CLOUD_MODE && typeof window.initDongtianCloudMarketAndArenaUi === "function") {
        setTimeout(function () {
            window.initDongtianCloudMarketAndArenaUi();
        }, 0);
    }
};
if (typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE) {
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) dongtianCloudFlushSave();
    });
    /** iframe/标签被直接卸掉时未必触发 visibilitychange；战败后关页再冲一次，避免仍停留在战前存档 */
    window.addEventListener("pagehide", function () {
        try {
            if (typeof player !== "object" || !player || !player.stats) return;
            if (player.stats.hp >= 1) return;
            if (typeof window.cancelPendingDongtianCloudSave === "function") window.cancelPendingDongtianCloudSave();
            dongtianCloudFlushSave();
        } catch (ePh) {}
    });
}

/** 嵌入模式但无法使用云存档时：与本机 index.html 相同，从 localStorage 读档并继续运行（仅坊市/武神坛/副本大厅需联网）。 */
function dongtianCloudBootFromLocalFallback(reasonLine) {
    window.__dongtianCloudLocalFallback = true;
    try {
        var pd = localStorage.getItem("playerData");
        if (pd) {
            player = JSON.parse(pd);
        }
    } catch (eP) {}
    try {
        var ed = localStorage.getItem("enemyData");
        if (ed) {
            enemy = JSON.parse(ed);
        }
    } catch (eE) {}
    window.__dongtianCloudHydrated = true;
    dilaoGameBoot();
    if (reasonLine && typeof reasonLine === "string") {
        setTimeout(function () {
            try {
                var el = document.getElementById("xiuMarketToast");
                if (el) {
                    el.textContent = reasonLine;
                    el.style.display = "block";
                    el.classList.add("xiu-market-toast--err");
                    clearTimeout(el._dongtianOfflineT);
                    el._dongtianOfflineT = setTimeout(function () {
                        el.style.display = "none";
                    }, 5200);
                }
            } catch (eT) {}
        }, 600);
    }
}

function dongtianCloudLoadAndBoot() {
    var req = null;
    try {
        req = window.parent && window.parent.goldGameApiRequest;
    } catch (e) {
        req = null;
    }
    if (!req) {
        dongtianCloudBootFromLocalFallback(
            "已使用本机浏览器存档。联网版本请加群902481027。"
        );
        return;
    }
    req("GET", "/api/dongtian-jie/save", undefined, true)
        .then(function (res) {
            if (!res || !res.ok) {
                dongtianCloudBootFromLocalFallback(
                    (res && res.message ? res.message : "云存档不可用") + "，已改用本机存档。联网请加群902481027。"
                );
                return;
            }
            if (!res.data || !res.data.player || typeof res.data.player !== "object") {
                dongtianCloudBootFromLocalFallback(
                    "云存档结构异常，已改用本机存档。联网版本请加群902481027。"
                );
                return;
            }
            if (res.data && res.data.player && typeof res.data.player === "object") {
                player = res.data.player;
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
            window.__dongtianCloudHydrated = true;
            dilaoGameBoot();
        })
        .catch(function (err) {
            var m = err && err.message ? err.message : "网络错误";
            dongtianCloudBootFromLocalFallback("云存档拉取失败（" + m + "），联网版本请加群902481027。");
        });
}

/** 联网模式下初始化修仙市场 + 武神坛（需在 xiu-market.js / wushen-arena.js 加载之后调用；可多次调用以补绑） */
window.initDongtianCloudMarketAndArenaUi = function () {
    if (!window.DONGTIAN_CLOUD_MODE) return;
    try {
        if (typeof window.initXiuMarketUI === "function") window.initXiuMarketUI();
        if (typeof window.initWuShenArenaUI === "function") window.initWuShenArenaUI();
        if (typeof window.initDongtianMolongUI === "function") window.initDongtianMolongUI();
    } catch (e) {}
};


var DONGTIAN_JIE_CHANGELOG_HTML =
    '<div class="changelog-ver">' +
    '<h4 class="changelog-h4">洞天劫 2.1</h4>' +
    "<ul class=\"changelog-list\">" + "<li>2.1修复异常属性，增加跳关道具，劫数20掉落。</li>" +
    "<li>2.0更新大量事件和机制，现在版本难度不会和1.0一样难。</li>" +
    "<li></li>" +
    "<li>单机或断网可玩核心内容；仅修仙市场、武神坛、副本大厅需联网请加群902481027。</li>" +
    "</ul></div>" +
    '<div class="changelog-ver changelog-ver--older">' +
    '<h4 class="changelog-h4">1.0 </h4>' +
    "<ul class=\"changelog-list\">" +
    "<li></li>" +
    "<li>单机进度存浏览器</li>" +
    "</ul></div>";

/** 浏览器是否具备 Web Crypto（加密导出需要安全上下文，直接打开 file:// 通常不可用）。 */
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

/** PBKDF2 迭代次数（与解密须一致） */
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

/** 导出：全屏弹窗设置密码（替代 prompt，便于手机输入） */
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
            if (inp1) {
                inp1.focus();
            }
        } catch (eF) {}
    }, 80);
}

/** 导入加密档：弹窗输入密码；onCancel 在关闭/取消时调用（如清空 file input） */
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
        alert(
            ""
        );
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
                alert(
                    "当前环境无法使用保存。"
                );
            } else {
                alert((err && err.message) || String(err));
            }
        });
    });
}

/** 开局首屏加载时长（ms），与 #loading 动画衔接 */
var DONGTIAN_BOOT_INTRO_MS = 640;

function shouldShowNameEntryForBoot() {
    if (!player || player.allocated) return false;
    if (typeof getParentPlayerName === "function" && getParentPlayerName()) return false;
    if (player.name && player.name !== "无名散修") return false;
    return true;
}

/** 赐名页 → 再进入塑道本源（不改 allocationPopup 内加点逻辑） */
function openNameEntryThenAllocation() {
    var hub = document.querySelector("#dungeon-main");
    if (hub) hub.style.display = "none";
    defaultModalElement.style.display = "flex";
    defaultModalElement.classList.remove("modal-container--allocate");
    var cur = (player && player.name) ? String(player.name) : "无名散修";
    defaultModalElement.innerHTML =
        '<div class="content name-entry-sheet">' +
        '<div class="content-head">' +
        "<h3>赐道号</h3>" +
        "</div>" +
        '<p class="name-entry-hint">一至十五字皆可；留空将用「无名散修」。</p>' +
        '<label class="name-entry-label" for="name-entry-input">道号</label>' +
        '<input type="text" id="name-entry-input" class="name-entry-input" maxlength="15" autocomplete="off" spellcheck="false" value="' +
        String(cur).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") +
        '" />' +
        '<button type="button" class="btn btn--primary name-entry-confirm" id="name-entry-confirm">踏入洞天</button>' +
        "</div>";
    var inp = document.getElementById("name-entry-input");
    var btn = document.getElementById("name-entry-confirm");
    if (inp) {
        try {
            inp.focus();
            inp.select();
        } catch (eInp) {}
        inp.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                btn.click();
            }
        });
    }
    btn.onclick = function () {
        var raw = (inp && inp.value) ? String(inp.value) : "";
        raw = raw
            .trim()
            .replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/g, "");
        if (raw.length < 1) {
            raw = "无名散修";
        }
        if (raw.length > 15) {
            raw = raw.slice(0, 15);
        }
        player.name = raw;
        if (typeof saveData === "function") saveData();
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
        if (hub) hub.style.display = "flex";
        allocationPopup();
    };
}

function startBootIntroSequence() {
    var loader = document.querySelector("#loading");
    var hub = document.querySelector("#dungeon-main");
    if (hub) hub.style.display = "none";
    if (loader) loader.style.display = "flex";
    setTimeout(function () {
        if (loader) loader.style.display = "none";
        if (player.allocated) {
            enterDungeon(true);
            return;
        }
        if (shouldShowNameEntryForBoot()) {
            openNameEntryThenAllocation();
        } else {
            if (hub) hub.style.display = "flex";
            allocationPopup();
        }
    }, DONGTIAN_BOOT_INTRO_MS);
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

/** 本地头像 data URL 长度上限（约数百 KB），避免撑爆 localStorage */
var DONGTIAN_AVATAR_DATAURL_MAX = 480000;

function refreshDongtianMenuPlayerButton() {
    var pm = document.querySelector("#player-menu");
    if (pm && player) {
        pm.innerHTML = '<i class="fas fa-user"></i>' + (player.name != null ? String(player.name) : "");
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

function dilaoGameBoot() {
    if (typeof loadDungeonStateFromStorage === "function") loadDungeonStateFromStorage();

    var parentName = getParentPlayerName();

    if (player === null) {
        var initialName = parentName || "无名散修";
        if (initialName.length < 3) {
            initialName = "无名散修";
        }
        createNewPlayer(initialName);
    } else if (parentName && typeof player === "object") {
        player.name = parentName;
        saveData();
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
        saveData();
    }
    if (typeof repairAllPlayerLegacyEquipmentScaling === "function") {
        if (repairAllPlayerLegacyEquipmentScaling()) {
            saveData();
        }
    }
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentFloorClampApplied2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentFloorClampApplied2026 = true;
        saveData();
    }
    /** 机缘四维缩放 0.3 + 当前封顶公式：对背包/身负再跑一遍 normalize（与上条独立标记，老档已做过层封顶也会执行一次） */
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentSecondaryCapScale03Migrate2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentSecondaryCapScale03Migrate2026 = true;
        saveData();
    }
    /** 敌势层上限公式调整（如 1.3+(n−1)×0.1）：背包 + 身负遗器再按新上限封顶一次 */
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentEnemyScalingCeilingMigrate2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentEnemyScalingCeilingMigrate2026 = true;
        saveData();
    }
    /** 遗器联合预算（各属性占各自上限比例之和 ≤1）：避免独立封顶后四维同时顶满；老档再跑一次 normalize */
    if (typeof repairAllPlayerEquipmentToFloorScalingCap === "function" && player && !player.equipmentJointStatBudgetMigrate2026) {
        repairAllPlayerEquipmentToFloorScalingCap();
        player.equipmentJointStatBudgetMigrate2026 = true;
        saveData();
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
        if (!("maxDungeonFloorSect" in player)) {
            player.maxDungeonFloorSect = player.sect || null;
            _changedMaxFloor = true;
        }
        if (_changedMaxFloor && typeof saveData === "function") saveData();
    }
    if (typeof playerLoadStats === "function") {
        playerLoadStats();
    }
    /** 读档/联网拉档后压一次修为条：与当前层封顶对齐（不会把 15「加」到 16；若存档已是 16 则仍为 16，除非另做降级迁移） */
    if (typeof dongtianDungeonPlayerExpApplyLevelUpsAndClamp === "function") {
        dongtianDungeonPlayerExpApplyLevelUpsAndClamp();
    }

    startBootIntroSequence();

    if (window.DONGTIAN_CLOUD_MODE && typeof startDongtianInboxPoll === "function") {
        startDongtianInboxPoll();
    }

    if (window.DONGTIAN_CLOUD_MODE) {
        window.initDongtianCloudMarketAndArenaUi();
        setTimeout(function () {
            window.initDongtianCloudMarketAndArenaUi();
        }, 0);
        setTimeout(function () {
            window.initDongtianCloudMarketAndArenaUi();
        }, 500);
    }

    // Unequip all items
    var unequipAllBtn = document.querySelector("#unequip-all");
    if (!unequipAllBtn) {
        // 行囊结构异常时仍应完成卷宗等绑定，避免修仙市场/武神坛永远不初始化
    } else unequipAllBtn.addEventListener("click", function () {

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

    var menuBtnEl = document.querySelector("#menu-btn");
    if (menuBtnEl) menuBtnEl.addEventListener("click", function () {
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
            <button type="button" id="player-menu"><i class="fas fa-user"></i>${player.name}</button>
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
            let playTime = new Date(player.playtime * 1000).toISOString().slice(11, 19);
            let maxFloor = typeof player.maxDungeonFloor === "number" && !isNaN(player.maxDungeonFloor) ? Math.floor(player.maxDungeonFloor) : 1;
            let maxLvl = typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl) ? Math.floor(player.maxDungeonFloorLvl) : player.lvl || 1;
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
                <p>${player.name}</p>
                <p id="profile-maxfloor">历史最高秘境层数：${maxFloor} 层</p>
                <p id="profile-maxlvl">当时修为：${maxLvl} 级 · ${maxSectName}</p>
                <p id="profile-maxlevel">历史最高等级：${maxLvl} 级</p>
                <p id="profile-kills">湮灭诸敌：${nFormatter(player.kills)}</p>
                <p id="profile-deaths">陨落劫数：${nFormatter(player.deaths)}</p>
                <p id="profile-playtime">修炼时长: ${playTime}</p>
            </div>`;
            let profileTab = document.querySelector('#profile-tab');
            profileTab.style.width = "15rem";
            let profileClose = document.querySelector('#profile-close');
            let profileTimer = setInterval(function () {
                try {
                    if (!defaultModalElement || defaultModalElement.style.display === "none") return;
                    var elMaxFloor = document.querySelector("#profile-maxfloor");
                    var elMaxLvl = document.querySelector("#profile-maxlvl");
                    var elMaxLevel = document.querySelector("#profile-maxlevel");
                    var elKills = document.querySelector("#profile-kills");
                    var elDeaths = document.querySelector("#profile-deaths");
                    var elPlayTime = document.querySelector("#profile-playtime");
                    if (!elMaxFloor || !elMaxLvl || !elMaxLevel || !elKills || !elDeaths || !elPlayTime) return;

                    let playTime2 = new Date(player.playtime * 1000).toISOString().slice(11, 19);
                    let maxFloor2 = typeof player.maxDungeonFloor === "number" && !isNaN(player.maxDungeonFloor) ? Math.floor(player.maxDungeonFloor) : 1;
                    let maxLvl2 = typeof player.maxDungeonFloorLvl === "number" && !isNaN(player.maxDungeonFloorLvl) ? Math.floor(player.maxDungeonFloorLvl) : player.lvl || 1;
                    let maxSectName2 = "未立门派";
                    if (typeof getSectById === "function" && player.maxDungeonFloorSect) {
                        var sectRow2 = getSectById(player.maxDungeonFloorSect);
                        if (sectRow2 && sectRow2.name) maxSectName2 = sectRow2.name;
                    }

                    elPlayTime.textContent = `修炼时长: ${playTime2}`;
                    elMaxFloor.textContent = `历史最高秘境层数：${maxFloor2} 层`;
                    elMaxLvl.textContent = `当时修为：${maxLvl2} 级 · ${maxSectName2}`;
                    elMaxLevel.textContent = `历史最高等级：${maxLvl2} 级`;
                    elKills.textContent = `湮灭诸敌：${nFormatter(player.kills)}`;
                    elDeaths.textContent = `陨落劫数：${nFormatter(player.deaths)}`;
                } catch (e) {}
            }, 1000);

            profileClose.onclick = function () {
                clearInterval(profileTimer);
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        // Dungeon run click function
        runMenu.onclick = function () {
            let runTime = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content" id="run-tab">
                <div class="content-head">
                    <h3>本轮秘境</h3>
                    <p id="run-close"><i class="fa fa-xmark"></i></p>
                </div>
                <p>${player.name} ${cultivationRealmLabel(player.lvl)}（${typeof getSectById === "function" && player.sect ? ((getSectById(player.sect) || {}).name || "—") : "—"}）</p>
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
                // Clear out everything, send the player back to meny and clear progress.
                let dimDungeon = document.querySelector('#dungeon-main');
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
            };
            cancel.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };

        // Close menu
        close.onclick = function () {
            continueExploring();
            menuModalElement.style.display = "none";
            menuModalElement.innerHTML = "";
            dimDungeon.style.filter = "brightness(100%)";
        };
    });
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

const enterDungeon = (skipRunLoad) => {
    if (skipRunLoad) {
        var loaderSk = document.querySelector("#loading");
        if (loaderSk) loaderSk.style.display = "none";
        var dmSk = document.querySelector("#dungeon-main");
        if (dmSk) dmSk.style.display = "flex";
    } else {
        runLoad("dungeon-main", "flex");
    }
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
        if (isValidEnemySnapshot(loadedEnemy)) {
            enemy = loadedEnemy;
            showCombatInfo();
            /** 重开页面续斗：无 combatTimerSync 时也要妖兽先手，由 combat.js 识别 */
            if (typeof window !== "undefined") window.__combatForceEnemyFirstAfterReload = true;
            startCombat();
        } else {
            // 旧档或异常状态：避免刷新后误进“null 敌人”斗法面板
            player.inCombat = false;
            if (typeof window.clearCombatTimerSyncOnly === "function") window.clearCombatTimerSyncOnly();
            if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
                dungeon.status.event = false;
            }
            saveData();
        }
    }
    /** 先加载秘境存档。勿在此处因 hp==0 调用 progressReset，否则会先清空洞天历时/劫数再读档，导致重启后两项被初始化。 */
    initialDungeonLoad();
    if (player.stats.hp < 1 && !player.inCombat) {
        if (window.DONGTIAN_CLOUD_MODE && typeof progressReset === "function" && typeof allocationPopup === "function") {
            /** 与斗法里点「重整再战」一致：含第 1 层第 1 劫战败（原仅在 hasRunProgress 时 reset，关页不点重整会只加满血、仍 allocated，界面错位成「图2」） */
            progressReset();
            setTimeout(function () {
                allocationPopup();
            }, 350);
        } else {
            player.stats.hp = player.stats.hpMax;
            saveData();
        }
    }
    playerLoadStats();
}

// Save all the data into local storage（嵌入主游戏时改为联网账号存档）
const saveData = () => {
    if (typeof window.syncCombatWallTimersToPlayer === "function") window.syncCombatWallTimersToPlayer();
    if (window.DONGTIAN_CLOUD_MODE) {
        // 云档尚未完成有效拉取时，禁止上传，防止空内存/新建角色覆盖线上旧档。
        if (!window.__dongtianCloudHydrated) return;
        /** 嵌入但走本机回退：与单机相同写入 localStorage，不上传云 */
        if (window.__dongtianCloudLocalFallback) {
            const playerData = JSON.stringify(player);
            const dungeonData = JSON.stringify(dungeon);
            const enemyData = JSON.stringify(enemy);
            try {
                localStorage.setItem("playerData", playerData);
                localStorage.setItem("dungeonData", dungeonData);
                localStorage.setItem("enemyData", enemyData);
            } catch (eLs) {}
            return;
        }
        scheduleDongtianCloudSave();
        return;
    }
    const playerData = JSON.stringify(player);
    const dungeonData = JSON.stringify(dungeon);
    const enemyData = JSON.stringify(enemy);
    localStorage.setItem("playerData", playerData);
    localStorage.setItem("dungeonData", dungeonData);
    localStorage.setItem("enemyData", enemyData);
}


var ATK_SPD_SOFT_CAP = 0.83;
var ATK_SPD_OVER_SOFT_CAP_MULT = 0.1;
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
        player.bonusStats.hp + pb.hpPct + eqSetBonus.hp + petB.hp + gemB.hp + titleB.hp;
    var atkPctTotal =
        player.bonusStats.atk + pb.atkPct + eqSetBonus.atk + petB.atk + gemB.atk + titleB.atk;
    var defPctTotal =
        player.bonusStats.def + pb.defPct + eqSetBonus.def + petB.def + gemB.def + titleB.def;
    var hpEquipMult = 1 + (hpPctTotal * hpFlatOppFrac) / 100;
    var atkEquipMult = 1 + (atkPctTotal * atkFlatOppFrac) / 100;
    var defEquipMult = 1 + (defPctTotal * defFlatOppFrac) / 100;

    player.stats.hpMax = Math.round(
        (playerHpBase + playerHpBase * (hpPctTotal / 100)) +
            player.equippedStats.hp * hpEquipMult +
            (pb.flatHp || 0)
    );
    var atkBeforeSectWeapon =
        (atkCore + atkCore * (atkPctTotal / 100)) +
        player.equippedStats.atk * atkEquipMult +
        (pb.flatAtk || 0);
    player.stats.atk = Math.round(atkBeforeSectWeapon * (1 + sectWeaponAtkPct / 100));
    player.stats.def = Math.round(
        (playerDefBase + playerDefBase * (defPctTotal / 100)) +
            player.equippedStats.def * defEquipMult +
            (pb.flatDef || 0)
    );
    var atkSpdRaw =
        (atkSpdCore +
            atkSpdCore * ((player.bonusStats.atkSpd + pb.atkSpdPct + eqSetBonus.atkSpd + petB.atkSpd + gemB.atkSpd + titleB.atkSpd) / 100)) +
        equipmentAtkSpd +
        (equipmentAtkSpd * (player.equippedStats.atkSpd / 100));
    var capAsp = typeof ATK_SPD_SOFT_CAP === "number" && isFinite(ATK_SPD_SOFT_CAP) ? ATK_SPD_SOFT_CAP : 0.83;
    var overMult =
        typeof ATK_SPD_OVER_SOFT_CAP_MULT === "number" && isFinite(ATK_SPD_OVER_SOFT_CAP_MULT)
            ? Math.max(0, ATK_SPD_OVER_SOFT_CAP_MULT)
            : 0.1;
    player.stats.atkSpd =
        atkSpdRaw <= capAsp ? atkSpdRaw : capAsp + (atkSpdRaw - capAsp) * overMult;
    player.stats.vamp =
        playerVampBase +
        player.bonusStats.vamp +
        player.equippedStats.vamp +
        pb.vamp +
        eqSetBonus.vamp +
        petB.vamp +
        titleB.vamp;
    player.stats.critRate =
        playerCRateBase +
        player.bonusStats.critRate +
        player.equippedStats.critRate +
        pb.critRate +
        eqSetBonus.critRate +
        petB.critRate +
        titleB.critRate;
    player.stats.critDmg =
        playerCDmgBase +
        player.bonusStats.critDmg +
        player.equippedStats.critDmg +
        pb.critDmg +
        eqSetBonus.critDmg +
        petB.critDmg +
        gemB.critDmg +
        titleB.critDmg;

    // Caps attack speed to 2.5
    if (player.stats.atkSpd > 2.5) {
        player.stats.atkSpd = 2.5;
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

    if (typeof dongtianResetSameRoomPlayerExpDecay === "function") dongtianResetSameRoomPlayerExpDecay();

    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();

    if (typeof resetDungeonCombatSideFlags === "function") resetDungeonCombatSideFlags();
    if (typeof restartDungeonHubTimers === "function") restartDungeonHubTimers();
    saveData();
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
    saveData();
}

