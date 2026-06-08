/**
 * 洞天劫 · 御器：碎片养成、机缘加成、御器材料包（品质概率与宝石包类似）
 */
(function () {
    var MATERIAL_YUQI_PACK = "yuqi_material_pack";
    var MATERIAL_YUQI_PACK_ZH = "御器材料包";

    window.MATERIAL_YUQI_PACK = MATERIAL_YUQI_PACK;
    window.MATERIAL_YUQI_PACK_ZH = MATERIAL_YUQI_PACK_ZH;

    var TIER_ZH = {
        common: "普通",
        excellent: "优秀",
        rare: "稀有",
        epic: "史诗",
        legend: "传说",
    };

    var STAT_ZH = {
        hp: "气血",
        atk: "力道",
        def: "护体",
        critDmg: "爆伤",
        vamp: "吸血",
        atkSpd: "身法",
        critRate: "会心",
        petExp: "灵宠修为",
    };

    /** [id, name, tier, stat, maxLv, maxBonusAtLv, totalShards] — 与策划表一致 */
    var YUQI_RAW = [
        ["yq_mujian", "木剑", "common", "hp", 50, 100, 7000],
        ["yq_tiequantao", "铁拳套", "common", "atk", 50, 100, 7000],
        ["yq_mianbuyi", "棉布衣", "common", "def", 50, 100, 7000],
        ["yq_duanbi", "短匕", "common", "critDmg", 50, 60, 8500],
        ["yq_xixueteng", "吸血藤", "common", "vamp", 50, 20, 8500],
        ["yq_caoxie", "草鞋", "common", "atkSpd", 50, 20, 5500],
        ["yq_tongjiezhi", "铜戒指", "common", "critRate", 50, 10, 5500],
        ["yq_shougushao", "兽骨哨", "common", "petExp", 50, 20, 4000],
        ["yq_jinggangjian", "精钢剑", "excellent", "hp", 40, 200, 4000],
        ["yq_langyabang", "狼牙棒", "excellent", "atk", 40, 200, 4000],
        ["yq_pilinjia", "皮鳞甲", "excellent", "def", 40, 200, 4000],
        ["yq_pofengren", "破风刃", "excellent", "critDmg", 40, 120, 5000],
        ["yq_xuezhizhu", "血蛭珠", "excellent", "vamp", 40, 40, 5000],
        ["yq_qingyuxue", "轻羽靴", "excellent", "atkSpd", 40, 40, 3000],
        ["yq_ruimuzhui", "锐目坠", "excellent", "critRate", 40, 20, 3000],
        ["yq_huanlingdi", "唤灵笛", "excellent", "petExp", 40, 40, 2500],
        ["yq_hantiechangjian", "寒铁长剑", "rare", "hp", 30, 300, 2000],
        ["yq_suiyanchui", "碎岩锤", "rare", "atk", 30, 300, 2000],
        ["yq_xuantiejia", "玄铁甲", "rare", "def", 30, 300, 2000],
        ["yq_duanhoubi", "断喉匕", "rare", "critDmg", 30, 180, 2500],
        ["yq_yinxieya", "饮血牙", "rare", "vamp", 30, 60, 2500],
        ["yq_tayunlv", "踏云履", "rare", "atkSpd", 30, 60, 1500],
        ["yq_ningshenzhu", "凝神珠", "rare", "critRate", 30, 30, 1500],
        ["yq_lingshounang", "灵兽囊", "rare", "petExp", 30, 60, 1200],
        ["yq_longxuejvjian", "龙血巨剑", "epic", "hp", 20, 400, 1000],
        ["yq_kaishanfu", "开山斧", "epic", "atk", 20, 400, 1000],
        ["yq_xuanwujinjia", "玄武金甲", "epic", "def", 20, 400, 1000],
        ["yq_miehunsi", "灭魂刺", "epic", "critDmg", 20, 240, 1200],
        ["yq_xiemoxinzang", "血魔心脏", "epic", "vamp", 20, 80, 1200],
        ["yq_fengxingling", "风行令", "epic", "atkSpd", 20, 80, 800],
        ["yq_powangyan", "破妄眼", "epic", "critRate", 20, 40, 800],
        ["yq_yushouhuan", "御兽环", "epic", "petExp", 20, 80, 600],
        ["yq_panguxinzhi", "盘古之心", "legend", "hp", 10, 500, 500],
        ["yq_chiyougu", "蚩尤骨", "legend", "atk", 10, 500, 500],
        ["yq_bumielonglin", "不灭龙鳞", "legend", "def", 10, 500, 500],
        ["yq_wujijian", "无极剑", "legend", "critDmg", 10, 300, 600],
        ["yq_xiezuxinzhi", "血祖之心", "legend", "vamp", 10, 100, 600],
        ["yq_jiutianbu", "九天步", "legend", "atkSpd", 10, 100, 400],
        ["yq_tianyanyu", "天眼玉", "legend", "critRate", 10, 50, 400],
        ["yq_wanlingqi", "万灵契", "legend", "petExp", 10, 100, 300],
    ];

    var YUQI_DEFS = YUQI_RAW.map(function (r) {
        return {
            id: r[0],
            name: r[1],
            tier: r[2],
            stat: r[3],
            maxLv: r[4],
            maxBonus: r[5],
            totalShards: r[6],
        };
    });

    var YUQI_BY_ID = {};
    var YUQI_BY_TIER = { common: [], excellent: [], rare: [], epic: [], legend: [] };
    for (var i = 0; i < YUQI_DEFS.length; i++) {
        var d = YUQI_DEFS[i];
        YUQI_BY_ID[d.id] = d;
        if (YUQI_BY_TIER[d.tier]) YUQI_BY_TIER[d.tier].push(d);
    }

    function splitShardsAcrossLevels(total, n) {
        total = Math.max(0, Math.floor(Number(total) || 0));
        n = Math.max(1, Math.floor(Number(n) || 1));
        var base = Math.floor(total / n);
        var rem = total % n;
        var a = [];
        for (var j = 0; j < n; j++) {
            a.push(base + (j < rem ? 1 : 0));
        }
        return a;
    }

    function ensureDongtianYuqiState() {
        if (typeof player === "undefined" || !player) return;
        if (!player.dongtianYuqi || typeof player.dongtianYuqi !== "object") {
            player.dongtianYuqi = { levels: {}, shards: {} };
        }
        if (!player.dongtianYuqi.levels || typeof player.dongtianYuqi.levels !== "object") {
            player.dongtianYuqi.levels = {};
        }
        if (!player.dongtianYuqi.shards || typeof player.dongtianYuqi.shards !== "object") {
            player.dongtianYuqi.shards = {};
        }
    }

    function getYuqiLevel(id) {
        ensureDongtianYuqiState();
        var n = Math.floor(Number(player.dongtianYuqi.levels[id]) || 0);
        return Math.max(0, n);
    }

    function getYuqiShards(id) {
        ensureDongtianYuqiState();
        var n = Math.floor(Number(player.dongtianYuqi.shards[id]) || 0);
        return Math.max(0, n);
    }

    function addYuqiShards(id, qty) {
        ensureDongtianYuqiState();
        qty = Math.floor(Number(qty) || 0);
        if (!qty || !YUQI_BY_ID[id]) return 0;
        var cur = getYuqiShards(id);
        player.dongtianYuqi.shards[id] = Math.max(0, cur + qty);
        return qty;
    }

    function getYuqiDef(id) {
        return YUQI_BY_ID[id] || null;
    }

    function getCurrentYuqiStatBonus(def, level) {
        if (!def) return 0;
        level = Math.max(0, Math.min(def.maxLv, Math.floor(Number(level) || 0)));
        if (level < 1) return 0;
        return (def.maxBonus * level) / def.maxLv;
    }

    function getNextUpgradeShardCost(def, curLevel) {
        if (!def) return 0;
        curLevel = Math.max(0, Math.floor(Number(curLevel) || 0));
        if (curLevel >= def.maxLv) return 0;
        var parts = splitShardsAcrossLevels(def.totalShards, def.maxLv);
        return parts[curLevel] || 0;
    }

    function tryUpgradeYuqi(id) {
        var def = getYuqiDef(id);
        if (!def) return { ok: false, message: "御器不存在。" };
        var lv = getYuqiLevel(id);
        if (lv >= def.maxLv) return { ok: false, message: "此御器已蕴灵至满阶。" };
        var cost = getNextUpgradeShardCost(def, lv);
        var have = getYuqiShards(id);
        if (have < cost) return { ok: false, message: "碎片不足（需 " + cost + "，当前 " + have + "）。" };
        ensureDongtianYuqiState();
        player.dongtianYuqi.shards[id] = have - cost;
        player.dongtianYuqi.levels[id] = lv + 1;
        return {
            ok: true,
            message:
                "<span class=\"Epic\">" +
                def.name +
                "</span> 升阶至 <strong>" +
                (lv + 1) +
                "/" +
                def.maxLv +
                "</strong> 级。",
        };
    }

    function rollYuqiPackTier() {
        var r = Math.random() * 100;
        if (r < 70) return "common";
        if (r < 90) return "excellent";
        if (r < 96) return "rare";
        if (r < 99) return "epic";
        return "legend";
    }

    function pickRandomYuqiFromTier(tier) {
        var pool = YUQI_BY_TIER[tier];
        if (!pool || !pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function rollYuqiPackLootOnce() {
        var tier = rollYuqiPackTier();
        var def = pickRandomYuqiFromTier(tier);
        if (!def) return null;
        var n = 1 + Math.floor(Math.random() * 2);
        return { def: def, tier: tier, shards: n };
    }

    function tryOpenYuqiMaterialPack(opts) {
        opts = opts || {};
        if (typeof window.ensureDongtianYuqiMaterialsInInventory === "function") window.ensureDongtianYuqiMaterialsInInventory();
        else if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        if (!opts.skipMaterialDeduct) {
            var c =
                typeof getMaterialCount === "function" && typeof MATERIAL_YUQI_PACK !== "undefined"
                    ? getMaterialCount(MATERIAL_YUQI_PACK)
                    : 0;
            if (c < 1) return { ok: false, message: "没有御器材料包。" };
            if (typeof addMaterial === "function") addMaterial(MATERIAL_YUQI_PACK, -1);
        }
        var loot = rollYuqiPackLootOnce();
        if (!loot) return { ok: false, message: "天机紊乱，未得御器碎片。" };
        addYuqiShards(loot.def.id, loot.shards);
        var tzh = TIER_ZH[loot.tier] || loot.tier;
        return {
            ok: true,
            message:
                "封匣一开，灵屑归元：<span class=\"Rare\">" +
                loot.def.name +
                "</span>（" +
                tzh +
                "）碎片 <strong>+" +
                loot.shards +
                "</strong>。",
        };
    }

    function tryOpenYuqiMaterialPacksBatch(want, opts) {
        opts = opts || {};
        if (typeof getMaterialCount !== "function" || typeof addMaterial !== "function") {
            return { ok: false, message: "行囊未就绪。", effectFailed: true };
        }
        if (typeof window.ensureDongtianYuqiMaterialsInInventory === "function") window.ensureDongtianYuqiMaterialsInInventory();
        else if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        var n = Math.floor(Number(want) || 0);
        if (n < 1) return { ok: false, message: "份数至少为 1。", effectFailed: true };
        if (!opts.skipMaterialDeduct) {
            var c = getMaterialCount(MATERIAL_YUQI_PACK);
            if (c < 1) return { ok: false, message: "没有御器材料包。" };
            n = Math.min(n, c);
            addMaterial(MATERIAL_YUQI_PACK, -n);
        }
        var shardSum = {};
        for (var i = 0; i < n; i++) {
            var loot = rollYuqiPackLootOnce();
            if (!loot) continue;
            addYuqiShards(loot.def.id, loot.shards);
            shardSum[loot.def.id] = (shardSum[loot.def.id] || 0) + loot.shards;
        }
        var lines = [];
        for (var id in shardSum) {
            if (!Object.prototype.hasOwnProperty.call(shardSum, id)) continue;
            var def = getYuqiDef(id);
            if (!def) continue;
            var tzh = TIER_ZH[def.tier] || def.tier;
            lines.push("<span class=\"Rare\">" + def.name + "</span>（" + tzh + "）碎片 <strong>+" + shardSum[id] + "</strong>");
        }
        return {
            ok: true,
            message: "连续启封 <strong>" + n + "</strong> 份御器材料包：" + lines.join("；") + "。",
            opened: n,
        };
    }

    function zeroOpp() {
        return { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0 };
    }

    window.getDongtianYuqiOpportunityBonuses = function () {
        if (typeof player === "undefined" || !player) return zeroOpp();
        ensureDongtianYuqiState();
        var b = zeroOpp();
        for (var i = 0; i < YUQI_DEFS.length; i++) {
            var def = YUQI_DEFS[i];
            var lv = getYuqiLevel(def.id);
            if (lv < 1) continue;
            var val = getCurrentYuqiStatBonus(def, lv);
            if (def.stat === "hp") b.hp += val;
            else if (def.stat === "atk") b.atk += val;
            else if (def.stat === "def") b.def += val;
            else if (def.stat === "atkSpd") b.atkSpd += val;
            else if (def.stat === "vamp") b.vamp += val;
            else if (def.stat === "critRate") b.critRate += val;
            else if (def.stat === "critDmg") b.critDmg += val;
        }
        var ghostMul =
            typeof window.getDongtianGhostRealmYuqiBonusMultiplier === "function"
                ? window.getDongtianGhostRealmYuqiBonusMultiplier()
                : 1;
        if (ghostMul > 1 && isFinite(ghostMul)) {
            b.hp *= ghostMul;
            b.atk *= ghostMul;
            b.def *= ghostMul;
            b.atkSpd *= ghostMul;
            b.vamp *= ghostMul;
            b.critRate *= ghostMul;
            b.critDmg *= ghostMul;
        }
        return b;
    };

    /** 灵宠击杀修为：按御器「灵宠修为」条目线性加成，与其它乘区叠乘 */
    window.getDongtianYuqiPetExpKillMult = function () {
        if (typeof player === "undefined" || !player) return 1;
        ensureDongtianYuqiState();
        var pct = 0;
        for (var i = 0; i < YUQI_DEFS.length; i++) {
            var def = YUQI_DEFS[i];
            if (def.stat !== "petExp") continue;
            var lv = getYuqiLevel(def.id);
            if (lv < 1) continue;
            pct += getCurrentYuqiStatBonus(def, lv);
        }
        var m = 1 + pct / 100;
        return m > 0 && isFinite(m) ? m : 1;
    };

    window.ensureDongtianYuqiMaterialsInInventory = function () {
        if (typeof ensureInventoryMaterials !== "function") return;
        ensureInventoryMaterials();
        if (!player || !player.inventory || !player.inventory.materials) return;
        if (typeof readInventoryMaterialCount === "function") {
            player.inventory.materials[MATERIAL_YUQI_PACK] = readInventoryMaterialCount(
                player.inventory.materials[MATERIAL_YUQI_PACK]
            );
        }
    };

    window.tryOpenYuqiMaterialPack = tryOpenYuqiMaterialPack;
    window.tryOpenYuqiMaterialPacksBatch = tryOpenYuqiMaterialPacksBatch;
    window.tryUpgradeYuqi = tryUpgradeYuqi;
    window.getYuqiDefList = function () {
        return YUQI_DEFS.slice();
    };

    function toast(msg, isErr) {
        var el = document.getElementById("xiuMarketToast");
        if (!el) {
            if (isErr) alert(msg);
            return;
        }
        el.textContent = msg.replace(/<[^>]+>/g, "");
        el.style.display = "block";
        el.classList.toggle("xiu-market-toast--err", !!isErr);
        clearTimeout(el._dtYuqiToastT);
        el._dtYuqiToastT = setTimeout(function () {
            el.style.display = "none";
        }, 2800);
    }

    function tierCssClass(tier) {
        if (tier === "legend") return "Legendary";
        if (tier === "epic") return "Epic";
        if (tier === "rare") return "Rare";
        if (tier === "excellent") return "Uncommon";
        return "Common";
    }

    function renderYuqiModal(filterTier) {
        var body = document.getElementById("dongtianYuqiBody");
        if (!body) return;
        ensureDongtianYuqiState();

        var tabs = [
            { key: "all", zh: "全部" },
            { key: "common", zh: "普通" },
            { key: "excellent", zh: "优秀" },
            { key: "rare", zh: "稀有" },
            { key: "epic", zh: "史诗" },
            { key: "legend", zh: "传说" },
        ];
        var ft = filterTier && filterTier !== "all" ? filterTier : "all";

        var tabHtml = "";
        for (var t = 0; t < tabs.length; t++) {
            var tb = tabs[t];
            var on = tb.key === ft;
            tabHtml +=
                '<button type="button" class="dt-yuqi-tab' +
                (on ? " dt-yuqi-tab--active" : "") +
                '" data-yuqi-filter="' +
                tb.key +
                '">' +
                tb.zh +
                "</button>";
        }

        var list = YUQI_DEFS.filter(function (d) {
            return ft === "all" || d.tier === ft;
        });

        var cards = "";
        for (var i = 0; i < list.length; i++) {
            var def = list[i];
            var lv = getYuqiLevel(def.id);
            var shards = getYuqiShards(def.id);
            var bonus = getCurrentYuqiStatBonus(def, lv);
            var cost = getNextUpgradeShardCost(def, lv);
            var maxed = lv >= def.maxLv;
            var pct = maxed ? 100 : Math.min(100, (100 * lv) / def.maxLv);
            var statLabel = STAT_ZH[def.stat] || def.stat;
            var bDisp = Math.round(bonus * 10) / 10;
            var bonusStr;
            if (def.stat === "critDmg") {
                bonusStr = "暴伤 +" + bDisp + "（点）";
            } else if (def.stat === "petExp") {
                bonusStr = statLabel + " +" + bDisp + "%（击杀修为乘区）";
            } else {
                bonusStr = statLabel + " +" + bDisp + "%";
            }
            var tierZh = TIER_ZH[def.tier] || def.tier;
            var tierCls = tierCssClass(def.tier);
            var maxLine =
                def.stat === "critDmg"
                    ? statLabel + " 满阶 +" + def.maxBonus + "（点）"
                    : def.stat === "petExp"
                      ? statLabel + " 满阶 +" + def.maxBonus + "%"
                      : statLabel + " 满阶 +" + def.maxBonus + "%";
            cards +=
                '<article class="dt-yuqi-card" data-yuqi-id="' +
                def.id +
                '">' +
                '<div class="dt-yuqi-card__ribbon" aria-hidden="true"></div>' +
                '<header class="dt-yuqi-card__head">' +
                '<span class="dt-yuqi-card__tier ' +
                tierCls +
                '">' +
                tierZh +
                "</span>" +
                "<h4 class=\"dt-yuqi-card__name\">" +
                def.name +
                "</h4>" +
                '<p class="dt-yuqi-card__attr">' +
                maxLine +
                " · 总碎片 " +
                def.totalShards +
                "</p></header>" +
                '<div class="dt-yuqi-card__lv">蕴灵 <strong>' +
                lv +
                "</strong> / " +
                def.maxLv +
                "</div>" +
                '<div class="dt-yuqi-card__bar" role="progressbar" aria-valuenow="' +
                lv +
                '" aria-valuemax="' +
                def.maxLv +
                '"><span style="width:' +
                pct +
                '%"></span></div>' +
                '<p class="dt-yuqi-card__bonus">当前：' +
                bonusStr +
                "</p>" +
                '<p class="dt-yuqi-card__shards">碎片 <strong>' +
                shards +
                "</strong>" +
                (maxed ? " · 已满阶" : " · 下次蕴灵需 <strong>" + cost + "</strong>") +
                "</p>" +
                '<button type="button" class="btn btn--sm btn--primary dt-yuqi-up-btn" data-yuqi-up="' +
                def.id +
                '"' +
                (maxed ? " disabled" : "") +
                ">蕴灵升阶</button>" +
                "</article>";
        }

        body.innerHTML =
            '<div class="dt-yuqi-hero" aria-hidden="true">' +
            '<div class="dt-yuqi-hero__moon"></div>' +
            '<div class="dt-yuqi-hero__mist"></div>' +
            '<div class="dt-yuqi-hero__sigil">器</div>' +
            "</div>" +
            '<p class="dt-yuqi-lead">御器承劫纹，碎片养灵根；各器独立碎片，蕴灵逐级解锁机缘，与宝石、灵宠机缘同类合并。</p>' +
            '<div class="dt-yuqi-tabs" role="tablist">' +
            tabHtml +
            "</div>" +
            '<div class="dt-yuqi-grid">' +
            cards +
            "</div>" +
            '<section class="dt-yuqi-odds"><h4 class="dt-yuqi-odds__h">御器材料包 · 品质概率</h4>' +
            '<p class="dt-yuqi-odds__p">普通 <strong>70%</strong> · 优秀 <strong>20%</strong> · 稀有 <strong>6%</strong> · 史诗 <strong>3%</strong> · 传说 <strong>1%</strong>；每次随机一件该品质御器，得碎片 <strong>1–2</strong> 枚。</p></section>';

        body.querySelectorAll(".dt-yuqi-tab").forEach(function (btn) {
            btn.onclick = function () {
                var f = btn.getAttribute("data-yuqi-filter") || "all";
                renderYuqiModal(f);
            };
        });
        body.querySelectorAll(".dt-yuqi-up-btn").forEach(function (btn) {
            btn.onclick = function () {
                if (btn.disabled) return;
                var id = btn.getAttribute("data-yuqi-up");
                var res = tryUpgradeYuqi(id);
                if (!res.ok) {
                    toast(res.message || "蕴灵失败", true);
                    return;
                }
                toast(res.message.replace(/<[^>]+>/g, ""), false);
                if (typeof calculateStats === "function") calculateStats();
                if (typeof playerLoadStats === "function") playerLoadStats();
                if (window.DONGTIAN_CLOUD_MODE) {
                    if (typeof window.dongtianCancelBeforeServerPull === "function") {
                        window.dongtianCancelBeforeServerPull();
                    } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
                        window.dongtianCancelCloudSaveInFlight();
                    }
                    if (typeof window.dongtianFlushCloudSaveImmediate === "function") {
                        window.dongtianFlushCloudSaveImmediate();
                    } else if (typeof window.__dongtianCloudFlushSave === "function") {
                        window.__dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                    }
                }
                renderYuqiModal(ft);
            };
        });
    }

    function openYuqiModal() {
        var modal = document.getElementById("dongtianYuqiModal");
        if (!modal) return;
        modal.style.display = "flex";
        renderYuqiModal("all");
    }

    function closeYuqiModal() {
        var modal = document.getElementById("dongtianYuqiModal");
        if (modal) modal.style.display = "none";
    }

    window.initDongtianYuqiUI = function () {
        var hubBtn = document.getElementById("dongtianHubMenuYuqiBtn");
        if (hubBtn && !hubBtn._dtYuqiBound) {
            hubBtn._dtYuqiBound = true;
            hubBtn.onclick = function () {
                if (typeof window.closeDongtianHubMenuModal === "function") {
                    window.closeDongtianHubMenuModal();
                } else {
                    var hub = document.getElementById("dongtianHubMenuModal");
                    if (hub) hub.style.display = "none";
                }
                openYuqiModal();
            };
        }
        var closeBtn = document.getElementById("dongtianYuqiCloseBtn");
        if (closeBtn && !closeBtn._dtYuqiBound) {
            closeBtn._dtYuqiBound = true;
            closeBtn.onclick = closeYuqiModal;
        }
    };

    window.openDongtianYuqiModal = openYuqiModal;
    window.closeDongtianYuqiModal = closeYuqiModal;
})();
