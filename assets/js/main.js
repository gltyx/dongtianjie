function getParentPlayerName() {
    try {
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

function resizeImageToAvatarDataUrl(file, callback) {
    var maxSide = 128;
    var img = new Image();
    var objUrl = URL.createObjectURL(file);
    img.onload = function () {
        try {
            URL.revokeObjectURL(objUrl);
            var w = img.width;
            var h = img.height;
            var scale = Math.min(1, maxSide / Math.max(w, h));
            var nw = Math.max(1, Math.round(w * scale));
            var nh = Math.max(1, Math.round(h * scale));
            var c = document.createElement("canvas");
            c.width = nw;
            c.height = nh;
            var ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, nw, nh);
            var dataUrl = c.toDataURL("image/jpeg", 0.82);
            if (dataUrl.length > 520000) {
                dataUrl = c.toDataURL("image/jpeg", 0.65);
            }
            if (dataUrl.length > 520000) {
                callback(new Error("图片仍过大，请换一张较小的图。"));
                return;
            }
            callback(null, dataUrl);
        } catch (e) {
            callback(e);
        }
    };
    img.onerror = function () {
        try {
            URL.revokeObjectURL(objUrl);
        } catch (e2) {}
        callback(new Error("无法读取图片。"));
    };
    img.src = objUrl;
}

const GAME_CHANGELOG_HTML = `
<p class="update-log__date">2026-04-03（QQ群902481027）</p>
<p class="update-log__item">· 此游戏是金币冒险者分支游戏，如果觉得有意思，后续会加入到金币冒险者在开启联网模式（所有装备材料都可以玩家交易）。</p>
<p class="update-log__item">· 设置 / 存档中可修改道号与自定义头像（本地压缩保存）游戏有很多事件每个事件都影响后续怪物强度，可以有厉害的BOSS，挖矿和跑商（凝结后开启）。</p>
`;

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
            materials: { enhance_stone: 0, gem_material_pack: 0, socket_opener: 0, talent_fruit: 0 },
            gems: { hp: {}, atk: {}, def: {}, atkSpd: {}, critDmg: {} },
            bagTab: "equip",
            uiFilter: { rarity: "All", slotType: "All" },
            autoBatchSell: false
        },
        equipped: [],
        gold: 0,
        playtime: 0,
        kills: 0,
        deaths: 0,
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
        avatar: ""
    };
    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();
    calculateStats();
    player.stats.hp = player.stats.hpMax;
    saveData();
}

window.addEventListener("load", function () {
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
    if (player && player.inventory && player.inventory.bagTab !== "equip" && player.inventory.bagTab !== "mat" && player.inventory.bagTab !== "gem") {
        player.inventory.bagTab = "equip";
    }
    if (typeof ensurePlayerGemStacks === "function") ensurePlayerGemStacks();
    if (typeof ensureGemMaterialsInInventory === "function") ensureGemMaterialsInInventory();
    if (player && (!player.miningDaily || typeof player.miningDaily !== "object")) {
        player.miningDaily = { tickets: 5, lastTs: Date.now() };
    }
    if (player && typeof player === "object" && typeof player.avatar !== "string") {
        player.avatar = "";
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
    if (typeof ensurePlayerPetCollection === "function") ensurePlayerPetCollection();
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

    if (player.allocated) {
        enterDungeon();
    } else {
        document.querySelector("#dungeon-main").style.display = "flex";
        showCultivationIntroScreen(function () {
            allocationPopup();
        });
    }

    // Unequip all items
    document.querySelector("#unequip-all").addEventListener("click", function () {

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

    document.querySelector("#menu-btn").addEventListener("click", function () {
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
                <h3>卷宗丶加QQ群902481027</h3>
                <p id="close-menu"><i class="fa fa-xmark"></i></p>
            </div>
            <button id="player-menu"><i class="fas fa-user"></i>${player.name}</button>
            <button id="stats">本轮秘境</button>
            <button id="settings-save">设置 / 存档</button>
            <button id="changelog-menu">更新日记</button>
            <button id="quit-run">退出秘境</button>
        </div>`;

        let close = document.querySelector('#close-menu');
        let playerMenu = document.querySelector('#player-menu');
        let runMenu = document.querySelector('#stats');
        let settingsSave = document.querySelector('#settings-save');
        let changelogMenu = document.querySelector('#changelog-menu');
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

        // Settings / Save (encrypted TXT)
        settingsSave.onclick = function () {
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content" id="settings-save-tab">
                <div class="content-head">
                    <h3>设置 / 存档</h3>
                    <p id="settings-save-close"><i class="fa fa-xmark"></i></p>
                </div>
                <div class="settings-profile-block">
                    <p class="settings-profile-block__title">角色</p>
                    <label class="settings-profile-block__lbl" for="settings-player-name">道号</label>
                    <input id="settings-player-name" type="text" maxlength="15" autocomplete="nickname" placeholder="2–15 字" />
                    <button type="button" id="settings-save-name">保存道号</button>
                    <div class="settings-profile-block__avatar-row">
                        <div id="settings-avatar-preview" class="settings-avatar-preview" aria-hidden="true"></div>
                        <div class="settings-profile-block__avatar-actions">
                            <input id="settings-avatar-file" type="file" accept="image/*" style="display:none" />
                            <button type="button" id="settings-avatar-pick">选择头像</button>
                            <button type="button" id="settings-avatar-clear" class="btn btn--ghost">恢复默认</button>
                        </div>
                    </div>
                    <p class="settings-profile-block__hint">头像会压缩后存于本地，约 128px。</p>
                </div>
                <p class="settings-save-divider">加密存档</p>
                <p style="opacity:.85;font-size:.9rem;line-height:1.2rem;">
                    加密存档会用你填写的密码加密为 TXT。<b>忘记密码将无法恢复</b>。
                </p>
                <input id="save-pass" type="password" placeholder="密码（至少 4 位）" autocomplete="new-password" />
                <input id="save-pass2" type="password" placeholder="再次输入密码（导出用）" autocomplete="new-password" />
                <div class="button-container">
                    <button id="btn-save-download">加密下载 TXT</button>
                    <button id="btn-save-import">导入 TXT</button>
                </div>
                <input id="save-file" type="file" accept=".txt,application/json,text/plain" style="display:none" />
                <p id="save-msg" style="min-height:1.2rem;opacity:.9;"></p>
            </div>`;

            const tab = document.querySelector("#settings-save-tab");
            if (tab) tab.style.width = "19rem";
            const closeBtn = document.querySelector("#settings-save-close");
            const passEl = document.querySelector("#save-pass");
            const pass2El = document.querySelector("#save-pass2");
            const msgEl = document.querySelector("#save-msg");
            const btnDownload = document.querySelector("#btn-save-download");
            const btnImport = document.querySelector("#btn-save-import");
            const fileEl = document.querySelector("#save-file");
            const nameInput = document.querySelector("#settings-player-name");
            const btnSaveName = document.querySelector("#settings-save-name");
            const avatarFile = document.querySelector("#settings-avatar-file");
            const avatarPick = document.querySelector("#settings-avatar-pick");
            const avatarClear = document.querySelector("#settings-avatar-clear");
            const avatarPreview = document.querySelector("#settings-avatar-preview");

            function setMsg(t) {
                if (msgEl) msgEl.textContent = t || "";
            }

            function syncSettingsAvatarPreview() {
                if (!avatarPreview) return;
                if (player && player.avatar && typeof player.avatar === "string" && player.avatar.indexOf("data:") === 0) {
                    avatarPreview.classList.add("settings-avatar-preview--custom");
                    avatarPreview.style.backgroundImage = "url(" + JSON.stringify(player.avatar) + ")";
                } else {
                    avatarPreview.classList.remove("settings-avatar-preview--custom");
                    avatarPreview.style.backgroundImage = "";
                }
            }

            if (nameInput) nameInput.value = player && player.name ? String(player.name) : "";
            syncSettingsAvatarPreview();

            if (btnSaveName) {
                btnSaveName.onclick = function () {
                    try {
                        setMsg("");
                        var raw = nameInput && nameInput.value ? String(nameInput.value).trim() : "";
                        if (raw.length < 2) throw new Error("道号至少 2 字。");
                        if (raw.length > 15) throw new Error("道号至多 15 字。");
                        if (player) {
                            player.name = raw.replace(/[<>\"&]/g, "");
                            saveData();
                            playerLoadStats();
                            setMsg("道号已保存。");
                        }
                    } catch (e) {
                        setMsg(e && e.message ? e.message : "保存失败。");
                    }
                };
            }

            if (avatarPick && avatarFile) {
                avatarPick.onclick = function () {
                    setMsg("");
                    avatarFile.click();
                };
            }

            if (avatarFile) {
                avatarFile.onchange = function () {
                    try {
                        setMsg("");
                        var f = avatarFile.files && avatarFile.files[0] ? avatarFile.files[0] : null;
                        if (!f) return;
                        if (!/^image\//.test(f.type)) throw new Error("请选择图片文件。");
                        if (f.size > 4 * 1024 * 1024) throw new Error("图片请小于 4MB。");
                        resizeImageToAvatarDataUrl(f, function (err, dataUrl) {
                            if (err) {
                                setMsg(err.message || "处理失败。");
                                return;
                            }
                            if (player) {
                                player.avatar = dataUrl;
                                saveData();
                                playerLoadStats();
                                syncSettingsAvatarPreview();
                                setMsg("头像已更新。");
                            }
                            avatarFile.value = "";
                        });
                    } catch (e) {
                        setMsg(e && e.message ? e.message : "选择失败。");
                        avatarFile.value = "";
                    }
                };
            }

            if (avatarClear) {
                avatarClear.onclick = function () {
                    setMsg("");
                    if (player) {
                        player.avatar = "";
                        saveData();
                        playerLoadStats();
                        syncSettingsAvatarPreview();
                        setMsg("已恢复默认头像。");
                    }
                    if (avatarFile) avatarFile.value = "";
                };
            }

            closeBtn.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };

            btnDownload.onclick = async function () {
                try {
                    setMsg("");
                    const p1 = (passEl && passEl.value) ? passEl.value : "";
                    const p2 = (pass2El && pass2El.value) ? pass2El.value : "";
                    if (p1.length < 4) throw new Error("密码至少 4 位。");
                    if (p1 !== p2) throw new Error("两次输入的密码不一致。");
                    const snap = _buildSaveSnapshot();
                    const txt = await encryptSaveSnapshotToTxt(snap, p1);
                    const stamp = new Date().toISOString().slice(0, 10);
                    const safeName = String((player && player.name) ? player.name : "player").replace(/[\\\/:*?"<>|]/g, "_");
                    _downloadTextFile(`dilao_save_${safeName}_${stamp}.txt`, txt);
                    setMsg("已生成加密 TXT 存档。");
                } catch (e) {
                    setMsg(e && e.message ? e.message : "导出失败。");
                }
            };

            btnImport.onclick = function () {
                try {
                    setMsg("");
                    if (fileEl) fileEl.click();
                } catch (e) {
                    setMsg("无法打开文件选择器。");
                }
            };

            fileEl.onchange = async function () {
                try {
                    setMsg("");
                    const f = fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
                    if (!f) return;
                    const txt = await f.text();
                    const p = (passEl && passEl.value) ? passEl.value : "";
                    if (p.length < 4) throw new Error("请输入密码（至少 4 位）再导入。");
                    const snap = await decryptTxtToSaveSnapshot(txt, p);
                    applySaveSnapshotToLocalStorage(snap);
                    setMsg("导入成功，正在刷新页面…");
                    setTimeout(() => location.reload(), 350);
                } catch (e) {
                    setMsg(e && e.message ? e.message : "导入失败。");
                } finally {
                    if (fileEl) fileEl.value = "";
                }
            };
        };

        if (changelogMenu) {
            changelogMenu.onclick = function () {
                menuModalElement.style.display = "none";
                defaultModalElement.style.display = "flex";
                defaultModalElement.innerHTML = `
                <div class="content" id="update-log-tab">
                    <div class="content-head">
                        <h3>更新日志</h3>
                        <p id="update-log-close"><i class="fa fa-xmark"></i></p>
                    </div>
                    <div class="update-log-body scrollable">${GAME_CHANGELOG_HTML}</div>
                </div>`;
                var updateLogTab = document.querySelector("#update-log-tab");
                if (updateLogTab) updateLogTab.style.width = "18rem";
                var updateLogClose = document.querySelector("#update-log-close");
                if (updateLogClose) {
                    updateLogClose.onclick = function () {
                        defaultModalElement.style.display = "none";
                        defaultModalElement.innerHTML = "";
                        menuModalElement.style.display = "flex";
                    };
                }
            };
        }

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

const enterDungeon = () => {
    runLoad("dungeon-main", "flex");
    if (player.inCombat) {
        let loadedEnemy = null;
        try {
            loadedEnemy = JSON.parse(localStorage.getItem("enemyData"));
        } catch (e) {
            loadedEnemy = null;
        }
        if (isValidEnemySnapshot(loadedEnemy)) {
            enemy = loadedEnemy;
            showCombatInfo();
            startCombat();
        } else {
            player.inCombat = false;
            if (typeof dungeon !== "undefined" && dungeon && dungeon.status) {
                dungeon.status.event = false;
            }
            saveData();
        }
    }
    initialDungeonLoad();
    if (player.stats.hp < 1 && !player.inCombat) {
        player.stats.hp = player.stats.hpMax;
        saveData();
    }
    playerLoadStats();
}

// Save all the data into local storage
const saveData = () => {
    const playerData = JSON.stringify(player);
    const dungeonData = JSON.stringify(dungeon);
    const enemyData = JSON.stringify(enemy);
    localStorage.setItem("playerData", playerData);
    localStorage.setItem("dungeonData", dungeonData);
    localStorage.setItem("enemyData", enemyData);
}

function _b64EncodeBytes(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function _b64DecodeToBytes(b64) {
    const bin = atob(String(b64 || "").trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function _downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function _buildSaveSnapshot() {
    // 用 localStorage 里的 JSON 串作为“最终权威”，避免内存状态被别处迁移逻辑覆盖/不同步
    const playerData = localStorage.getItem("playerData") || JSON.stringify(player || null);
    const dungeonData = localStorage.getItem("dungeonData") || JSON.stringify(dungeon || null);
    const enemyData = localStorage.getItem("enemyData") || JSON.stringify(enemy || null);
    return {
        format: "dilao-save",
        version: 1,
        createdAt: Date.now(),
        payload: { playerData, dungeonData, enemyData },
    };
}

async function _deriveAesKeyFromPassword(password, saltBytes, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptSaveSnapshotToTxt(snapshotObj, password) {
    if (!crypto || !crypto.subtle) throw new Error("当前环境不支持 WebCrypto（crypto.subtle）。");
    if (typeof password !== "string" || password.length < 4) throw new Error("密码至少 4 位。");

    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 120000;
    const key = await _deriveAesKeyFromPassword(password, salt, iterations);

    const plain = enc.encode(JSON.stringify(snapshotObj));
    const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    const ct = new Uint8Array(ctBuf);

    const wrapper = {
        format: "dilao-save-encrypted",
        version: 1,
        kdf: { name: "PBKDF2", hash: "SHA-256", iterations: iterations, saltB64: _b64EncodeBytes(salt) },
        cipher: { name: "AES-GCM", ivB64: _b64EncodeBytes(iv), ctB64: _b64EncodeBytes(ct) },
    };
    return JSON.stringify(wrapper, null, 2);
}

async function decryptTxtToSaveSnapshot(txt, password) {
    if (!crypto || !crypto.subtle) throw new Error("当前环境不支持 WebCrypto（crypto.subtle）。");
    if (typeof password !== "string" || password.length < 4) throw new Error("密码至少 4 位。");

    let obj;
    try {
        obj = JSON.parse(txt);
    } catch (e) {
        throw new Error("TXT 内容不是有效 JSON。");
    }

    if (obj && obj.format === "dilao-save" && obj.payload) return obj;

    if (!obj || obj.format !== "dilao-save-encrypted" || !obj.kdf || !obj.cipher) {
        throw new Error("不是本游戏的加密存档格式。");
    }
    if (obj.kdf.name !== "PBKDF2" || obj.cipher.name !== "AES-GCM") {
        throw new Error("不支持的加密参数。");
    }

    const salt = _b64DecodeToBytes(obj.kdf.saltB64);
    const iv = _b64DecodeToBytes(obj.cipher.ivB64);
    const ct = _b64DecodeToBytes(obj.cipher.ctB64);
    const iterations = Math.max(1, Number(obj.kdf.iterations || 0));

    const key = await _deriveAesKeyFromPassword(password, salt, iterations);
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    } catch (e) {
        throw new Error("解密失败：密码错误或文件损坏。");
    }
    const dec = new TextDecoder();
    const snapshot = JSON.parse(dec.decode(new Uint8Array(plainBuf)));
    if (!snapshot || snapshot.format !== "dilao-save" || !snapshot.payload) {
        throw new Error("解密成功但内容不是有效存档。");
    }
    return snapshot;
}

function applySaveSnapshotToLocalStorage(snapshot) {
    if (!snapshot || !snapshot.payload) throw new Error("存档内容不完整。");
    const p = snapshot.payload;
    if (typeof p.playerData !== "string" || typeof p.dungeonData !== "string" || typeof p.enemyData !== "string") {
        throw new Error("存档字段类型异常。");
    }
    localStorage.setItem("playerData", p.playerData);
    localStorage.setItem("dungeonData", p.dungeonData);
    localStorage.setItem("enemyData", p.enemyData);
}

function showCultivationIntroScreen(onContinue) {
    // 仅用于“首次/未分配先天点数”的封面页，不提供按钮，点击任意处继续
    const root = document.querySelector("#dungeon-main");
    if (root) root.style.filter = "brightness(50%)";
    defaultModalElement.style.display = "flex";
    defaultModalElement.classList.add("modal-container--intro");
    defaultModalElement.innerHTML = `
    <div class="intro-screen" id="intro-screen" role="dialog" aria-label="修仙序章">
        <div class="intro-screen__inner">
            <div class="intro-hero" aria-hidden="true">
                <div class="intro-hero__bg"></div>
                <div class="intro-hero__frame">
                    <img class="intro-hero__img" src="assets/img/xiu.png" alt="洞天劫印记"
                        onerror="this.onerror=null;this.src='assets/img/duotianjie-sigil.svg';" />
                </div>
            </div>
            <h2 class="intro-screen__title">洞天劫</h2>
            <p class="intro-screen__sub">踏上你的长生之路</p>
            <div class="intro-screen__divider" aria-hidden="true"></div>
            <p class="intro-screen__lore">一念入道，百劫成仙。今以先天为骨，择一脉为心。</p>
            <p class="intro-screen__lore intro-screen__lore--em">自此步入洞天，问鼎长生。</p>
            <p class="intro-screen__hint">点击任意处继续</p>
        </div>
    </div>`;

    const el = document.querySelector("#intro-screen");
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        try {
            defaultModalElement.classList.remove("modal-container--intro");
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
        } catch (e) {}
        if (root) root.style.filter = "brightness(50%)"; // 继续进入分配面板时仍需暗背景
        if (typeof onContinue === "function") onContinue();
    };
    if (el) {
        el.addEventListener("click", finish, { once: true });
        el.addEventListener("touchend", finish, { once: true });
        el.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " " || ev.key === "Escape") finish();
        });
        el.tabIndex = 0;
        el.focus();
    } else {
        finish();
    }
}

// Calculate every player stat
const calculateStats = () => {
    var eqSetBonus = { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    if (typeof aggregateEquipmentSetBonuses === "function" && player && Array.isArray(player.equipped)) {
        eqSetBonus = aggregateEquipmentSetBonuses(player.equipped);
    }
    player.equipmentSetBonusStats = eqSetBonus;

    let equipmentAtkSpd = player.baseStats.atkSpd * (player.equippedStats.atkSpd / 100);
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

    player.stats.hpMax = Math.round(
        (playerHpBase + playerHpBase * ((player.bonusStats.hp + pb.hpPct + eqSetBonus.hp + petB.hp) / 100)) + player.equippedStats.hp + (pb.flatHp || 0)
    );
    var atkBeforeSectWeapon =
        (atkCore + atkCore * ((player.bonusStats.atk + pb.atkPct + eqSetBonus.atk + petB.atk) / 100)) + player.equippedStats.atk + (pb.flatAtk || 0);
    player.stats.atk = Math.round(atkBeforeSectWeapon * (1 + sectWeaponAtkPct / 100));
    player.stats.def = Math.round(
        (playerDefBase + playerDefBase * ((player.bonusStats.def + pb.defPct + eqSetBonus.def + petB.def) / 100)) + player.equippedStats.def + (pb.flatDef || 0)
    );
    player.stats.atkSpd =
        (atkSpdCore + atkSpdCore * ((player.bonusStats.atkSpd + pb.atkSpdPct + eqSetBonus.atkSpd + petB.atkSpd) / 100)) +
        equipmentAtkSpd +
        (equipmentAtkSpd * (player.equippedStats.atkSpd / 100));
    player.stats.vamp = playerVampBase + player.bonusStats.vamp + player.equippedStats.vamp + pb.vamp + eqSetBonus.vamp + petB.vamp;
    player.stats.critRate = playerCRateBase + player.bonusStats.critRate + player.equippedStats.critRate + pb.critRate + eqSetBonus.critRate + petB.critRate;
    player.stats.critDmg = playerCDmgBase + player.bonusStats.critDmg + player.equippedStats.critDmg + pb.critDmg + eqSetBonus.critDmg + petB.critDmg;

    // Caps attack speed to 2.5
    if (player.stats.atkSpd > 2.5) {
        player.stats.atkSpd = 2.5;
    }
    var aspMult = typeof PLAYER_ATKSPD_EFFECT_MULT === "number" ? PLAYER_ATKSPD_EFFECT_MULT : 1;
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
        enemyScaling: 1.1,
        deferredEvent: null,
        eventMemory: { faction: 0, ledger: 0 },
        chainTitleBuff: null,
    };
    delete dungeon.enemyMultipliers;
    delete player.allocated;
    dungeon.backlog.length = 0;
    dungeon.action = 0;
    dungeon.statistics.runtime = 0;
    combatBacklog.length = 0;
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
            atkSpd: 0.33 + (0.02 * (allocation.atkSpd - 5))
        }
    }
    updateStats();
    let points = 10;
    const statLabelZh = { hp: "气血", atk: "力道", def: "护体", atkSpd: "身法" };
    const rxFmt = /\.0+$|(\.[0-9]*[1-9])0+$/;
    /** 与 calculateStats 一致：身法实效 = 先天基数 × PLAYER_ATKSPD_EFFECT_MULT，下限 0.06 */
    const allocAtkSpdDisplayValue = function (baseAtkSpd) {
        var mult = typeof PLAYER_ATKSPD_EFFECT_MULT === "number" ? PLAYER_ATKSPD_EFFECT_MULT : 1;
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
                <button type="button" class="allocate-sheet__close" id="allocate-close" aria-label="关闭"><i class="fa fa-xmark"></i></button>
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
    let close = document.querySelector("#allocate-close");
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
    close.onclick = function () {
        defaultModalElement.style.display = "none";
        defaultModalElement.classList.remove("modal-container--allocate");
        defaultModalElement.innerHTML = "";
        document.querySelector("#dungeon-main").style.filter = "brightness(100%)";
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
    saveData();
}

