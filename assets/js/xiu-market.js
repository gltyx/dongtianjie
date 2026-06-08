/**
 * 洞天劫 · 修仙市场（仅嵌入主游戏联网模式）：联网币，装备/材料/灵宠，一口价与竞拍
 */
(function () {
    function api(method, path, body) {
        try {
            var req = window.parent && window.parent.goldGameApiRequest;
            if (!req) return Promise.reject(new Error("无联网接口"));
            return req(method, path, body, true);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function getNetworkCoinAmount() {
        try {
            var fn = window.parent && window.parent.goldGameGetNetworkCoin;
            if (typeof fn !== "function") return Promise.resolve(0);
            return fn().then(function (res) {
                return res && typeof res.amount === "number" ? res.amount : 0;
            });
        } catch (e) {
            return Promise.resolve(0);
        }
    }

    function playerNameBody() {
        var n = "";
        if (typeof player !== "undefined" && player && player.name) {
            n = typeof formatDongtianDisplayName === "function" ? formatDongtianDisplayName(player.name) : String(player.name);
        }
        return { playerName: n };
    }

    /** 市场列表/成交记录：卖方、买方展示「名字（灵网 id）」 */
    function xiuPeerLine(rawName, publicId, fallback) {
        var s =
            rawName != null && String(rawName).trim() !== ""
                ? String(rawName).trim()
                : fallback != null
                  ? String(fallback)
                  : "";
        if (typeof formatDongtianPeerDisplayName === "function") {
            return formatDongtianPeerDisplayName(s, publicId);
        }
        return s;
    }

    /** @returns {Promise<boolean>} 是否已成功把服务端洞天存档合并进当前内存 */
    function reloadDongtianStateFromServer() {
        if (typeof window.dongtianPullServerSaveAfterMutation === "function") {
            return window.dongtianPullServerSaveAfterMutation({
                skipPreFlush: true,
                preferLocalDungeonIfAhead: true,
                fromServerMutation: true,
                respectServerInventoryAuthority: true,
            });
        }
        function tryPull() {
            return api("GET", "/api/dongtian-jie/save", undefined)
                .then(function (res) {
                    if (res && res.ok && res.data && res.data.player) {
                        if (typeof window.dongtianApplyServerPayload === "function") {
                            window.dongtianApplyServerPayload(res.data, {
                                forceServerPlayer: true,
                                fromServerMutation: true,
                                preferLocalDungeonIfAhead: true,
                                respectServerInventoryAuthority: true,
                            });
                        }
                        return true;
                    }
                    return false;
                })
                .catch(function () {
                    return false;
                });
        }
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        }
        window.__dongtianCloudReloading = true;
        return tryPull()
            .then(function (ok) {
                if (ok) return true;
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        tryPull().then(resolve);
                    }, 450);
                });
            })
            .finally(function () {
                window.__dongtianCloudReloading = false;
            });
    }

    var state = {
        page: 1,
        pageSize: 12,
        mine: false,
        filter: "",
        itemType: "",
        equipRarity: "",
        equipSlotType: "",
        equipLvlMin: "",
        equipLvlMax: "",
        petKind: "",
        petAgeTier: "",
        peqType: "",
        peqSlot: "",
        peqRarity: "",
        peqLvlMin: "",
        peqLvlMax: "",
    };
    var equipFilterDebounceTimer;

    function syncEquipFiltersFromDom() {
        var r = document.getElementById("xiuMarketEquipRarity");
        var st = document.getElementById("xiuMarketEquipSlotType");
        var mn = document.getElementById("xiuMarketEquipLvlMin");
        var mx = document.getElementById("xiuMarketEquipLvlMax");
        if (r) state.equipRarity = r.value || "";
        if (st) state.equipSlotType = st.value || "";
        if (mn) state.equipLvlMin = mn.value === "" ? "" : mn.value;
        if (mx) state.equipLvlMax = mx.value === "" ? "" : mx.value;
    }

    function syncPetFiltersFromDom() {
        var pk = document.getElementById("xiuMarketPetKind");
        var pa = document.getElementById("xiuMarketPetAgeTier");
        if (pk) state.petKind = pk.value || "";
        if (pa) state.petAgeTier = pa.value || "";
    }

    function syncPetEquipFiltersFromDom() {
        var pt = document.getElementById("xiuMarketPeqType");
        var ps = document.getElementById("xiuMarketPeqSlot");
        var pr = document.getElementById("xiuMarketPeqRarity");
        var mn = document.getElementById("xiuMarketPeqLvlMin");
        var mx = document.getElementById("xiuMarketPeqLvlMax");
        if (pt) state.peqType = pt.value || "";
        if (ps) state.peqSlot = ps.value || "";
        if (pr) state.peqRarity = pr.value || "";
        if (mn) state.peqLvlMin = mn.value === "" ? "" : mn.value;
        if (mx) state.peqLvlMax = mx.value === "" ? "" : mx.value;
    }

    function updateEquipFilterVisibility() {
        var wrap = document.getElementById("xiuMarketEquipFilters");
        if (!wrap) return;
        var t = state.itemType;
        wrap.hidden = t === "material" || t === "pet" || t === "pet_equip";
    }

    function updatePetFilterVisibility() {
        var wrap = document.getElementById("xiuMarketPetFilters");
        if (!wrap) return;
        wrap.hidden = state.itemType !== "pet";
    }

    function updatePetEquipFilterVisibility() {
        var wrap = document.getElementById("xiuMarketPetEquipFilters");
        if (!wrap) return;
        wrap.hidden = state.itemType !== "pet_equip";
    }

    function scheduleEquipFilterReload() {
        clearTimeout(equipFilterDebounceTimer);
        equipFilterDebounceTimer = setTimeout(function () {
            syncEquipFiltersFromDom();
            syncPetEquipFiltersFromDom();
            state.page = 1;
            loadList();
        }, 320);
    }

    function fmtTime(ts) {
        if (!ts) return "—";
        var d = new Date(ts);
        return d.toLocaleString("zh-CN", { hour12: false });
    }

    function xiuEsc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    var LT_HERB_EFFECTS = {
        lt_herb_huiqicao: { name: "回气草", combats: 10, bonus: { hp: 10 } },
        lt_herb_ningluhua: { name: "凝露花", combats: 10, bonus: { atk: 10 } },
        lt_herb_tufuling: { name: "土茯苓", combats: 10, bonus: { def: 10 } },
        lt_herb_qinglingmu: { name: "青灵木", combats: 20, bonus: { hp: 30 } },
        lt_herb_fenglingcao: { name: "风铃草", combats: 20, bonus: { atk: 30 } },
        lt_herb_huazaoshu: { name: "火枣树", combats: 20, bonus: { def: 30 } },
        lt_herb_jinxianteng: { name: "金线藤", combats: 20, bonus: { hp: 50 } },
        lt_herb_xuanbinggu: { name: "玄冰菇", combats: 20, bonus: { atk: 50 } },
        lt_herb_bingxinlian: { name: "冰心莲", combats: 30, bonus: { def: 50 } },
        lt_herb_longxueshu: { name: "龙血树", combats: 30, bonus: { atk: 100 } },
        lt_herb_leijizhu: { name: "雷击竹", combats: 30, bonus: { atk: 100 } },
        lt_herb_huanxinlan: { name: "幻心兰", combats: 30, bonus: { atk: 100 } },
        lt_herb_luhuacao: { name: "露华草", combats: 20, bonus: { atkSpd: 5 } },
        lt_herb_diyuancao: { name: "地元草", combats: 20, bonus: { critRate: 5 } },
        lt_herb_jifengye: { name: "疾风叶", combats: 20, bonus: { vamp: 5 } },
        lt_herb_qingluteng: { name: "青露藤", combats: 20, bonus: { critDmg: 10 } },
        lt_herb_hanxicao: { name: "寒息草", combats: 20, bonus: { atk: 50, vamp: 5 } },
        lt_herb_huolinghua: { name: "火灵花", combats: 20, bonus: { atk: 50, critRate: 5 } },
        lt_herb_tulingmu: { name: "土灵木", combats: 20, bonus: { hp: 30, def: 30, critDmg: 30 } },
        lt_herb_jinluhua: { name: "金露花", combats: 20, bonus: { hp: 40, atk: 25 } },
        lt_herb_fengyinmu: { name: "风吟木", combats: 20, bonus: { def: 30, atkSpd: 5, critDmg: 20, vamp: 5 } },
        lt_herb_fenghuocao: { name: "风火草", combats: 20, bonus: { def: 30, atk: 20 } },
        lt_herb_bingfenggu: { name: "冰风菇", combats: 20, bonus: { atk: 50, critDmg: 20, vamp: 5 } },
        lt_herb_jinyanteng: { name: "金焰藤", combats: 20, bonus: { hp: 20, def: 40, critDmg: 20 } },
        lt_herb_binghuolingguo: { name: "冰火灵果", combats: 20, bonus: { atkSpd: 10, critRate: 5, vamp: 5 } },
        lt_herb_xuanbinglian: { name: "玄冰莲", combats: 20, bonus: { atkSpd: 20, critRate: 10, critDmg: 50 } },
        lt_herb_xuebingguo: { name: "血冰果", combats: 20, bonus: { hp: 100, atk: 50, vamp: 5 } },
        lt_herb_huolongmu: { name: "火龙木", combats: 20, bonus: { atk: 50, critRate: 10, critDmg: 20, vamp: 5 } },
        lt_herb_jinleiteng: { name: "金雷藤", combats: 20, bonus: { atk: 100, atkSpd: 10 } },
        lt_herb_leiyinmu: { name: "雷音木", combats: 20, bonus: { hp: 100, def: 30, critDmg: 20, vamp: 5 } },
        lt_herb_huanfengye: { name: "幻风叶", combats: 20, bonus: { hp: 100, atk: 100, vamp: 5 } },
        lt_herb_bingleiteng: { name: "冰雷藤", combats: 50, bonus: { atk: 100, def: 100, critDmg: 20 } },
        lt_herb_huanbinglan: { name: "幻冰兰", combats: 50, bonus: { atk: 100, atkSpd: 20 } },
        lt_herb_xuejinteng: { name: "血金藤", combats: 50, bonus: { def: 100, critRate: 10, critDmg: 50 } },
        lt_herb_huanleihua: { name: "幻雷花", combats: 50, bonus: { def: 300, atk: 300, atkSpd: 20, vamp: 5 } },
        lt_herb_hundunya: { name: "混沌芽", combats: 50, bonus: { hp: 300, atk: 300, atkSpd: 20, vamp: 5 } },
    };
    var LT_HERB_STAT_LABEL = {
        hp: "气血",
        atk: "力道",
        def: "护体",
        atkSpd: "攻速",
        vamp: "吸血",
        critRate: "暴击",
        critDmg: "暴伤",
    };
    function ltHerbBonusText(bonus) {
        if (!bonus || typeof bonus !== "object") return "";
        var out = [];
        var order = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg"];
        for (var i = 0; i < order.length; i++) {
            var k = order[i];
            var v = Number(bonus[k] || 0);
            if (v > 0) out.push((LT_HERB_STAT_LABEL[k] || k) + "+" + v + "%");
        }
        return out.join("、");
    }
    function ltHerbHintLong(materialKey) {
        var ef = LT_HERB_EFFECTS[String(materialKey || "")];
        if (!ef) return "";
        return "服用后接下来" + ef.combats + "场斗法中，机缘" + ltHerbBonusText(ef.bonus) + "。";
    }
    function ltHerbHintShort(materialKey) {
        var ef = LT_HERB_EFFECTS[String(materialKey || "")];
        if (!ef) return "";
        return ef.combats + "场：" + ltHerbBonusText(ef.bonus);
    }

    function xiuMaterialLabelZh(key) {
        var k = String(key == null ? "" : key).trim();
        var map = {};
        if (typeof MATERIAL_ENHANCE_STONE !== "undefined") {
            map[MATERIAL_ENHANCE_STONE] = typeof MATERIAL_ENHANCE_STONE_ZH !== "undefined" ? MATERIAL_ENHANCE_STONE_ZH : "强化石";
        }
        if (typeof MATERIAL_ENCHANT_STONE !== "undefined") {
            map[MATERIAL_ENCHANT_STONE] = typeof MATERIAL_ENCHANT_STONE_ZH !== "undefined" ? MATERIAL_ENCHANT_STONE_ZH : "附魔石";
        }
        if (typeof MATERIAL_GEM_PACK !== "undefined") {
            map[MATERIAL_GEM_PACK] = typeof MATERIAL_GEM_PACK_ZH !== "undefined" ? MATERIAL_GEM_PACK_ZH : "宝石材料包";
        }
        if (typeof window !== "undefined" && typeof window.MATERIAL_YUQI_PACK === "string") {
            map[window.MATERIAL_YUQI_PACK] =
                typeof window.MATERIAL_YUQI_PACK_ZH === "string" ? window.MATERIAL_YUQI_PACK_ZH : "御器材料包";
        }
        map.yuqi_material_pack = "御器材料包";
        if (typeof MATERIAL_SOCKET_OPENER !== "undefined") {
            map[MATERIAL_SOCKET_OPENER] = typeof MATERIAL_SOCKET_OPENER_ZH !== "undefined" ? MATERIAL_SOCKET_OPENER_ZH : "开孔器";
        }
        if (typeof MATERIAL_TALENT_FRUIT !== "undefined") {
            map[MATERIAL_TALENT_FRUIT] = typeof MATERIAL_TALENT_FRUIT_ZH !== "undefined" ? MATERIAL_TALENT_FRUIT_ZH : "天赋果";
        }
        if (typeof MATERIAL_LIFE_POTION !== "undefined") {
            map[MATERIAL_LIFE_POTION] = typeof MATERIAL_LIFE_POTION_ZH !== "undefined" ? MATERIAL_LIFE_POTION_ZH : "生命药剂";
        }
        if (typeof MATERIAL_PET_EXP_FRUIT !== "undefined") {
            map[MATERIAL_PET_EXP_FRUIT] = typeof MATERIAL_PET_EXP_FRUIT_ZH !== "undefined" ? MATERIAL_PET_EXP_FRUIT_ZH : "灵宠经验果实";
        }
        if (typeof MATERIAL_GOD_ESSENCE_STONE !== "undefined") {
            map[MATERIAL_GOD_ESSENCE_STONE] =
                typeof MATERIAL_GOD_ESSENCE_STONE_ZH !== "undefined" ? MATERIAL_GOD_ESSENCE_STONE_ZH : "神萃石";
        }
        map.god_essence_stone = "神萃石";
        map.lt_mutate_charm = "变异概率符";
        map.lt_speed_talisman_small = "加速符（小）";
        map.lt_talisman_remove_pest = "除虫符";
        map.lt_talisman_water = "浇水符";
        map.lt_talisman_weed = "除草符";
        map.lt_seed_pack_common = "普通种子包";
        map.lt_seed_pack_rare = "珍稀种子包";
        map.lt_seed_pack_mutant = "变异种子包";
        map.lt_seed_huiqicao = "回气草种";
        map.lt_seed_ningluhua = "凝露花种";
        map.lt_seed_tufuling = "土茯苓种";
        map.lt_seed_qinglingmu = "青灵木种";
        map.lt_seed_fenglingcao = "风铃草种";
        map.lt_seed_huazaoshu = "火枣树种";
        map.lt_seed_jinxianteng = "金线藤种";
        map.lt_seed_xuanbinggu = "玄冰菇种";
        map.lt_seed_bingxinlian = "冰心莲种";
        map.lt_seed_longxueshu = "龙血树种";
        map.lt_seed_leijizhu = "雷击竹种";
        map.lt_seed_huanxinlan = "幻心兰种";
        map.lt_seed_luhuacao = "露华草种";
        map.lt_seed_diyuancao = "地元草种";
        map.lt_seed_jifengye = "疾风叶种";
        map.lt_seed_qingluteng = "青露藤种";
        map.lt_seed_hanxicao = "寒息草种";
        map.lt_seed_huolinghua = "火灵花种";
        map.lt_seed_tulingmu = "土灵木种";
        map.lt_seed_jinluhua = "金露花种";
        map.lt_seed_fengyinmu = "风吟木种";
        map.lt_seed_fenghuocao = "风火草种";
        map.lt_seed_bingfenggu = "冰风菇种";
        map.lt_seed_jinyanteng = "金焰藤种";
        map.lt_seed_binghuolingguo = "冰火灵果种";
        map.lt_seed_xuanbinglian = "玄冰莲种";
        map.lt_seed_xuebingguo = "血冰果种";
        map.lt_seed_huolongmu = "火龙木种";
        map.lt_seed_jinleiteng = "金雷藤种";
        map.lt_seed_leiyinmu = "雷音木种";
        map.lt_seed_huanfengye = "幻风叶种";
        map.lt_seed_bingleiteng = "冰雷藤种";
        map.lt_seed_huanbinglan = "幻冰兰种";
        map.lt_seed_xuejinteng = "血金藤种";
        map.lt_seed_huanleihua = "幻雷花种";
        map.lt_seed_hundunya = "混沌芽种";
        map.secret_realm_warp = "秘境穿梭器";
        map.lt_herb_huiqicao = "回气草";
        map.lt_herb_ningluhua = "凝露花";
        map.lt_herb_tufuling = "土茯苓";
        map.lt_herb_qinglingmu = "青灵木";
        map.lt_herb_fenglingcao = "风铃草";
        map.lt_herb_huazaoshu = "火枣树";
        map.lt_herb_jinxianteng = "金线藤";
        map.lt_herb_xuanbinggu = "玄冰菇";
        map.lt_herb_bingxinlian = "冰心莲";
        map.lt_herb_longxueshu = "龙血树";
        map.lt_herb_leijizhu = "雷击竹";
        map.lt_herb_huanxinlan = "幻心兰";
        map.dt_pill_jinling = "金灵丹";
        map.dt_pill_shuiling = "水灵丹";
        map.dt_pill_tuling = "土灵丹";
        map.dt_pill_muling = "木灵丹";
        map.dt_pill_huoling = "火灵丹";
        map.dt_pill_fengling = "风铃丹";
        map.dt_pill_jinteng = "金藤丹";
        map.dt_pill_xuanbing = "玄冰丹";
        map.dt_pill_xinlian = "心莲丹";
        map.dt_pill_longxue = "龙血丹";
        map.dt_pill_leishen = "雷神丹";
        map.dt_pill_huanshen = "幻神丹";
        Object.keys(LT_HERB_EFFECTS).forEach(function (hk) {
            var it = LT_HERB_EFFECTS[hk];
            if (it && it.name) map[hk] = it.name;
        });
        if (map[k]) return map[k];
        if (/^lt_herb_/i.test(k)) return "灵田灵药";
        if (/^lt_seed_/i.test(k)) return "灵田灵种";
        return k;
    }

    /**
     * 材料一行标题：优先接口 displayName；若仍为 raw_key×数量 则用本地表翻译（避免缓存旧 JS 或旧成交文案）。
     */
    function xiuResolveMaterialLine(displayNameOpt, materialKey, materialAmount) {
        var srv = String(displayNameOpt == null ? "" : displayNameOpt).trim();
        var asciiMat = /^([a-zA-Z0-9_]{1,64})\s*[xX×]\s*(\d{1,12})$/;
        var m = srv.match(asciiMat);
        if (m) {
            return xiuMaterialLabelZh(m[1]) + " ×" + m[2];
        }
        if (srv) {
            return srv;
        }
        var mk = materialKey == null ? "" : String(materialKey).trim();
        if (!mk) {
            return "—";
        }
        var amt = materialAmount;
        var n = typeof amt === "number" ? amt : parseInt(String(amt), 10);
        if (!Number.isFinite(n)) n = 0;
        return xiuMaterialLabelZh(mk) + " ×" + String(n);
    }

    /** 主标题：专名 / 材料中文名 / 灵宠名 */
    function xiuMarketRowTitle(r) {
        if (r.itemType === "equip" && r.equipPreview) {
            if (typeof weaponOrArmorDisplayName === "function") return weaponOrArmorDisplayName(r.equipPreview);
            return r.displayName || "遗器";
        }
        if (r.itemType === "material") {
            return xiuResolveMaterialLine(r.displayName, r.materialKey, r.materialAmount);
        }
        if (r.itemType === "pet" && r.petPreview) return String(r.petPreview.name || r.displayName || "灵宠");
        if (r.itemType === "pet_equip" && r.petEquipPreview) {
            return String(r.petEquipPreview.name || r.displayName || "灵宠法器");
        }
        return r.displayName || "";
    }

    function showMarketMaterialPreview(materialKey, materialAmount, displayNameFromServer) {
        if (typeof defaultModalElement === "undefined" || !defaultModalElement) return;
        var titleLine = xiuResolveMaterialLine(displayNameFromServer, materialKey, materialAmount);
        var hk = String(materialKey == null ? "" : materialKey).trim();
        var hints = {
            enhance_stone: "用于遗器淬火升星，成败依星阶，高星失败会掉星。",
            enchant_stone: "用于遗器附魔，可获得属性百分比增幅。",
            gem_material_pack: "启封后可得三枚随机一级宝石（可重复）。",
            yuqi_material_pack:
                "启封后按品质概率随机一件御器，获得该御器碎片 1–2 枚（普通 70%、优秀 20%、稀有 6%、史诗 3%、传说 1%）；于「御器」界面蕴灵升阶。",
            socket_opener: "用于遗器开孔，每器至多三窍。",
            talent_fruit: "喂养出战灵宠，增加妖力以推动年份进阶。",
            life_potion: "服用后恢复气血上限的 50%。头领及以上妖躯有概率掉落。",
            pet_exp_fruit: "服用后多场斗法中灵宠击杀修为翻倍，可叠加。仅最后一劫镇守概率掉落。",
            secret_realm_warp: "每次使用消耗 1 个。可输入目标层数并跳转至该层第 1 劫（仅可高于当前层，且不超过历史最高层 - 1）。击杀秘境第 20 劫层主有 50% 概率掉落。",
            lt_seed_pack_common: "开启后随机获得 1~3 颗基础灵植种子。",
            lt_seed_pack_rare: "开启后随机获得 1 颗珍稀灵植种子。",
            lt_seed_pack_mutant: "开启后随机获得 1 颗已发现的变异灵种。",
            god_essence_stone: "用于遗器神萃：每成功 1 级全词条 +2%（上限 +100 级）。消耗随神萃档位递增；麒麟岛、坊市等可得。",
            dt_pill_jinling: "炼丹阁所得：为灵宠淬炼金系灵根（每只同丹至多 20 次）。",
            dt_pill_shuiling: "炼丹阁所得：为灵宠淬炼水系灵根（每只同丹至多 20 次）。",
            dt_pill_tuling: "炼丹阁所得：为灵宠淬炼土系灵根（每只同丹至多 20 次）。",
            dt_pill_muling: "炼丹阁所得：为灵宠淬炼木系灵根（每只同丹至多 20 次）。",
            dt_pill_huoling: "炼丹阁所得：为灵宠淬炼火系灵根（每只同丹至多 20 次）。",
            dt_pill_fengling: "炼丹阁所得：为灵宠淬炼水系灵根（每只同丹至多 20 次）。",
            dt_pill_jinteng: "炼丹阁所得：为灵宠淬炼金系灵根（每只同丹至多 20 次）。",
            dt_pill_xuanbing: "炼丹阁所得：为灵宠淬炼水系灵根（每只同丹至多 20 次）。",
            dt_pill_xinlian: "炼丹阁所得：为灵宠淬炼土系灵根（每只同丹至多 20 次）。",
            dt_pill_longxue: "炼丹阁所得：为灵宠淬炼火系灵根（每只同丹至多 20 次）。",
            dt_pill_leishen: "炼丹阁所得：为灵宠淬炼五行灵根（每只同丹至多 20 次）。",
            dt_pill_huanshen: "炼丹阁所得：为灵宠大幅淬炼五行灵根（每只同丹至多 20 次）。",
        };
        var hint =
            hints[hk] ||
            ltHerbHintLong(hk) ||
            (/^lt_herb_/i.test(hk) ? "灵田成熟灵药，可服用获得多场斗法临时机缘加成。" : "") ||
            (/^dt_pill_/i.test(hk) ? "炼丹阁灵丹：在灵宠栏「丹药」中为灵宠淬炼灵根。" : "洞天劫材料，购入后将进入你的行囊材料栏。");
        dungeon.status.exploring = false;
        defaultModalElement.style.display = "flex";
        defaultModalElement.style.zIndex = "5080";
        defaultModalElement.classList.add("modal-container--market-preview");
        defaultModalElement.innerHTML =
            '<div class="content xiu-mat-preview">' +
            '<p class="xiu-market-preview-hint">挂单预览 · 材料信息</p>' +
            "<h4>" +
            xiuEsc(titleLine) +
            "</h4>" +
            '<p class="xiu-mat-preview-desc">' +
            xiuEsc(hint) +
            "</p>" +
            '<div class="button-container"><button type="button" id="close-market-mat-preview">关闭</button></div></div>';
        var xiuM = document.getElementById("xiuMarketModal");
        var sellM = document.getElementById("xiuMarketSellModal");
        if (xiuM && xiuM.style.display === "flex") xiuM.style.filter = "brightness(55%)";
        if (sellM && sellM.style.display === "flex") sellM.style.filter = "brightness(55%)";
        var dm = document.querySelector("#dungeon-main");
        if (dm) dm.style.filter = "brightness(92%)";
        var inv = document.querySelector("#inventory");
        if (inv && inv.style.display === "flex") inv.style.filter = "brightness(55%)";
        var btn = document.getElementById("close-market-mat-preview");
        if (btn) {
            btn.onclick = function () {
                defaultModalElement.style.display = "none";
                defaultModalElement.style.zIndex = "";
                defaultModalElement.classList.remove("modal-container--market-preview");
                defaultModalElement.innerHTML = "";
                if (xiuM) xiuM.style.filter = "";
                if (sellM) sellM.style.filter = "";
                if (dm) dm.style.filter = "";
                if (inv) inv.style.filter = "";
                if (typeof continueExploring === "function") continueExploring();
            };
        }
    }

    /** 副行：品阶 · 星阶 · 修为 / 材料用途 / 灵宠年份与系别 */
    function xiuMarketRowDesc(r) {
        if (r.itemType === "equip" && r.equipPreview) {
            var eq = r.equipPreview;
            var parts = [];
            if (typeof equipmentRarityLabel === "function" && eq.rarity) parts.push(equipmentRarityLabel(eq.rarity));
            if (typeof eq.enhanceStars === "number" && eq.enhanceStars > 0) parts.push("淬火 " + eq.enhanceStars + "★");
            if (typeof cultivationRealmLabel === "function" && eq.lvl != null) parts.push("修为 " + cultivationRealmLabel(eq.lvl));
            var enT = typeof eq.enchantTier === "number" ? eq.enchantTier : Number(eq.enchantTier);
            var enP = typeof eq.enchantPct === "number" ? eq.enchantPct : Number(eq.enchantPct);
            if (Number.isFinite(enT) && Number.isFinite(enP) && enT > 0 && enP > 0) {
                parts.push("附魔 T" + Math.floor(enT) + " · " + Math.floor(enP) + "%");
            }
            return parts.join(" · ");
        }
        if (r.itemType === "material") {
            var hints = {
                enhance_stone: "用于遗器淬火升星",
                enchant_stone: "用于遗器附魔增幅",
                gem_material_pack: "启封后可得随机一级宝石",
                yuqi_material_pack: "御器碎片材料包（随机品质御器）",
                socket_opener: "用于遗器开孔（每器至多三窍）",
                talent_fruit: "喂养灵宠，增加妖力以进阶年份",
                life_potion: "服用恢复气血 50%",
                pet_exp_fruit: "灵宠击杀修为翻倍（多场，可叠加）",
                secret_realm_warp: "跳转至指定更高秘境层（第1劫）",
                god_essence_stone: "遗器神萃，逐级提升全词条百分比",
            };
            var hk = String(r.materialKey || "");
            return hints[hk] || ltHerbHintShort(hk) || (/^lt_herb_/i.test(hk) ? "灵田灵药（可服用获临时机缘）" : "洞天劫材料");
        }
        if (r.itemType === "pet" && r.petPreview) {
            var p = r.petPreview;
            var parts = [];
            if (typeof getPetAgeTierDef === "function" && p.ageTier) {
                var d = getPetAgeTierDef(p.ageTier);
                if (d && d.name) parts.push(d.name);
            }
            if (typeof PET_TYPE_LABEL_ZH !== "undefined" && p.type && PET_TYPE_LABEL_ZH[p.type]) parts.push(PET_TYPE_LABEL_ZH[p.type]);
            if (typeof cultivationRealmLabel === "function" && p.lvl != null) parts.push("修为 " + cultivationRealmLabel(p.lvl));
            return parts.join(" · ");
        }
        if (r.itemType === "pet_equip" && r.petEquipPreview) {
            var pe = r.petEquipPreview;
            var peParts = [];
            if (typeof PET_EQUIP_SLOT_ZH !== "undefined" && pe.slot) peParts.push(PET_EQUIP_SLOT_ZH[pe.slot] || pe.slot);
            if (typeof PET_EQUIP_TYPE_ZH !== "undefined" && pe.petType) peParts.push(PET_EQUIP_TYPE_ZH[pe.petType] || pe.petType);
            if (typeof PET_EQUIP_RARITY_ZH !== "undefined" && pe.rarity) peParts.push(PET_EQUIP_RARITY_ZH[pe.rarity] || pe.rarity);
            if (typeof cultivationRealmLabel === "function" && pe.lvl != null) peParts.push("修为 " + cultivationRealmLabel(pe.lvl));
            return peParts.join(" · ");
        }
        return "";
    }

    function openModal() {
        var m = document.getElementById("xiuMarketModal");
        if (!m) return;
        m.style.display = "flex";
        try {
            document.body.classList.add("xiu-market-open");
        } catch (e) {}
        state.page = 1;
        var ft = document.getElementById("xiuMarketFilterType");
        if (ft) state.itemType = ft.value || "";
        syncEquipFiltersFromDom();
        syncPetFiltersFromDom();
        updateEquipFilterVisibility();
        updatePetFilterVisibility();
        updatePetEquipFilterVisibility();
        refreshAll();
        syncParentViewportForXiuUi();
    }

    function closeModal() {
        var m = document.getElementById("xiuMarketModal");
        if (m) m.style.display = "none";
        try {
            document.body.classList.remove("xiu-market-open");
        } catch (e) {}
        syncParentViewportForXiuUi();
    }

    /** 与主界面无限深渊联网聊天一致：锁定父页 viewport，避免聚焦输入/下拉时整页缩放（嵌套 iframe 时父页 meta 仍会参与） */
    var _xiuParentViewportHooked = false;
    function isDongtianOverlayOpen(el) {
        return !!(el && el.style && el.style.display === "flex");
    }
    /** 任一 .modal-container 或灵田数量浮层打开即锁定（避免漏掉赠送/行囊/剑灵等弹窗） */
    function anyDongtianEmbedOverlayOpen() {
        var nodes = document.querySelectorAll(".modal-container");
        for (var i = 0; i < nodes.length; i++) {
            if (isDongtianOverlayOpen(nodes[i])) return true;
        }
        var lingtianQty = document.getElementById("lingtianNumberDialog");
        if (isDongtianOverlayOpen(lingtianQty)) return true;
        return false;
    }
    function syncParentViewportForXiuUi() {
        var any = anyDongtianEmbedOverlayOpen();
        try {
            var p = window.parent;
            if (any) {
                if (!_xiuParentViewportHooked && typeof p.lockMobileViewportNoZoom === "function") {
                    p.lockMobileViewportNoZoom();
                    _xiuParentViewportHooked = true;
                }
            } else if (_xiuParentViewportHooked && typeof p.unlockMobileViewportNoZoom === "function") {
                p.unlockMobileViewportNoZoom();
                _xiuParentViewportHooked = false;
            }
        } catch (e) {}
    }
    window.syncParentViewportForDongtianEmbeds = syncParentViewportForXiuUi;
    function attachDongtianOverlayViewportObserver(el) {
        if (!el || el._dtViewportObs) return;
        el._dtViewportObs = true;
        try {
            var obs = new MutationObserver(function () {
                syncParentViewportForXiuUi();
            });
            obs.observe(el, { attributes: true, attributeFilter: ["style"] });
        } catch (eObs) {}
    }
    function hookDongtianEmbedModalViewportObservers() {
        if (window._dongtianEmbedModalViewportHooked) return;
        window._dongtianEmbedModalViewportHooked = true;
        document.querySelectorAll(".modal-container").forEach(attachDongtianOverlayViewportObserver);
        attachDongtianOverlayViewportObserver(document.getElementById("lingtianNumberDialog"));
        try {
            var bodyObs = new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    for (var i = 0; i < m.addedNodes.length; i++) {
                        var n = m.addedNodes[i];
                        if (!n || n.nodeType !== 1) continue;
                        if (n.classList && n.classList.contains("modal-container")) {
                            attachDongtianOverlayViewportObserver(n);
                        }
                        if (n.querySelectorAll) {
                            n.querySelectorAll(".modal-container").forEach(attachDongtianOverlayViewportObserver);
                        }
                    }
                });
                syncParentViewportForXiuUi();
            });
            bodyObs.observe(document.body, { childList: true, subtree: true });
        } catch (eBody) {}
        function isDongtianFormField(el) {
            if (!el || !el.matches) return false;
            return el.matches(
                "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), select, textarea"
            );
        }
        function lockParentViewportForFormField(e) {
            var t = e.target;
            if (!t || !t.closest) return;
            var field = t.closest(
                "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), select, textarea"
            );
            if (!field || !isDongtianFormField(field)) return;
            try {
                if (window.parent && typeof window.parent.lockMobileViewportNoZoom === "function") {
                    window.parent.lockMobileViewportNoZoom();
                }
            } catch (eLock) {}
            syncParentViewportForXiuUi();
        }
        document.addEventListener("pointerdown", lockParentViewportForFormField, true);
        document.addEventListener("touchstart", lockParentViewportForFormField, { capture: true, passive: true });
        document.addEventListener(
            "focusin",
            function (e) {
                if (!isDongtianFormField(e.target)) return;
                syncParentViewportForXiuUi();
            },
            true
        );
        document.addEventListener(
            "focusout",
            function () {
                setTimeout(function () {
                    var ae = document.activeElement;
                    if (ae && isDongtianFormField(ae)) return;
                    if (anyDongtianEmbedOverlayOpen()) {
                        syncParentViewportForXiuUi();
                        return;
                    }
                    try {
                        var p = window.parent;
                        if (p && typeof p.unlockMobileViewportNoZoom === "function") p.unlockMobileViewportNoZoom();
                        if (
                            p &&
                            (p._mobileViewportNoZoomLockCount || 0) <= 0 &&
                            typeof p.forceRestoreMobileViewportAfterChatSend === "function"
                        ) {
                            p.forceRestoreMobileViewportAfterChatSend();
                        }
                    } catch (eUnlock) {}
                }, 80);
            },
            true
        );
    }
    window.hookDongtianEmbedModalViewportObservers = hookDongtianEmbedModalViewportObservers;

    /** 关闭洞天 iframe 前由主游戏调用，避免父页 viewport 仍被锁定 */
    window.__releaseXiuMarketParentViewport = function () {
        if (!_xiuParentViewportHooked) return;
        try {
            if (window.parent && typeof window.parent.unlockMobileViewportNoZoom === "function") {
                window.parent.unlockMobileViewportNoZoom();
            }
        } catch (e) {}
        _xiuParentViewportHooked = false;
    };

    /** 移动端双指缩放易触发父页/浏览器缩放或误触刷新，导致 iframe 内界面像「整页刷新」、内容叠层；在模态根上拦截多指移动与 iOS 捏合手势 */
    function ensureXiuModalPinchGuards(el) {
        if (!el || el._xiuPinchGuards) return;
        el._xiuPinchGuards = true;
        function blockMultiTouchMove(ev) {
            if (ev.touches && ev.touches.length > 1) ev.preventDefault();
        }
        function blockGesture(ev) {
            ev.preventDefault();
        }
        el.addEventListener("touchmove", blockMultiTouchMove, { passive: false });
        el.addEventListener("gesturestart", blockGesture, { passive: false });
        el.addEventListener("gesturechange", blockGesture, { passive: false });
        el.addEventListener("gestureend", blockGesture, { passive: false });
    }

    function bindXiuModalPinchGuards() {
        ["xiuMarketModal", "xiuMarketSellModal", "xiuMarketConfirmModal", "xiuMarketGiftModal"].forEach(function (id) {
            ensureXiuModalPinchGuards(document.getElementById(id));
        });
    }

    function refreshParentNetworkCoinIfPossible() {
        try {
            if (window.parent && typeof window.parent.goldGameGetNetworkCoin === "function") {
                window.parent.goldGameGetNetworkCoin().catch(function () {});
            }
        } catch (ePc) {}
    }

    function upsertXiuMarketCoinDisplay() {
        getNetworkCoinAmount().then(function (amt) {
            var coinEl = document.getElementById("xiuMarketCoin");
            if (coinEl) coinEl.textContent = String(amt);
        });
    }

    function refreshAll() {
        var coinEl = document.getElementById("xiuMarketCoin");
        getNetworkCoinAmount().then(function (amt) {
            if (coinEl) coinEl.textContent = String(amt);
        });
        loadList();
    }

    /** 坊市上架/赠送前：等待行囊变更落盘，避免界面有货而服务端报「行囊中没有该装备」 */
    function flushDongtianInventoryBeforeTrade(opts) {
        if (typeof window.dongtianPrepareMarketTrade === "function") {
            return window.dongtianPrepareMarketTrade(opts || {});
        }
        if (typeof window.dongtianFlushInventoryBeforeTrade === "function") {
            return window.dongtianFlushInventoryBeforeTrade().then(function (ok) {
                return { ok: !!ok };
            });
        }
        return Promise.resolve({ ok: true });
    }

    /** 上架/购买/赠送成功后：本地先扣减展示，再作废在途 POST 并拉服务端档 */
    function applyLocalSellDeduction(kind, ex) {
        applyLocalGiftDeduction(kind, ex);
    }

    /** 上架/购买/赠送成功后同步云端存档并刷新行囊/灵宠 UI */
    function refreshAfterDongtianTrade() {
        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.cancelPendingDongtianCloudSave === "function") {
            window.cancelPendingDongtianCloudSave();
        }
        if (typeof window.dongtianInvalidateCloudSaveResponses === "function") {
            window.dongtianInvalidateCloudSaveResponses();
        }
        var pull =
            typeof window.dongtianPullServerSaveAfterMutation === "function"
                ? window.dongtianPullServerSaveAfterMutation({
                      skipPreFlush: true,
                      preferLocalDungeonIfAhead: true,
                      fromServerMutation: true,
                      /** 坊市 API 已从服务端扣物：勿用更长本地行囊盖回（上架/赠送复制品 BUG） */
                      respectServerInventoryAuthority: true,
                  })
                : reloadDongtianStateFromServer();
        return pull.then(function (syncOk) {
            if (syncOk && typeof window.dongtianClearInventoryShadow === "function") {
                window.dongtianClearInventoryShadow();
            }
            if (
                syncOk &&
                !(typeof window.dongtianCloudSavePending === "function" && window.dongtianCloudSavePending())
            ) {
                try {
                    window.__dongtianLocalPlayerDirty = false;
                } catch (eClr) {}
            } else if (
                syncOk &&
                window.__dongtianLocalPlayerDirty &&
                !(typeof window.dongtianMaterialDeltasPending === "function" && window.dongtianMaterialDeltasPending())
            ) {
                if (typeof window.dongtianFlushCloudSaveImmediate === "function") {
                    window.dongtianFlushCloudSaveImmediate();
                } else if (typeof window.__dongtianCloudFlushSave === "function") {
                    window.__dongtianCloudFlushSave({ immediate: true, forceCloud: true, playerMutation: true });
                }
            } else if (!syncOk) {
                showXiuToast("服务端已结算，但拉取洞天存档失败：请稍后重开修仙市场或刷新页面以看到新物品", true);
            }
            if (typeof showEquipment === "function") showEquipment();
            if (typeof renderInventoryMaterialsPanel === "function") renderInventoryMaterialsPanel();
            if (typeof renderPetPanel === "function") renderPetPanel();
            if (typeof window.refreshDongtianPetEquipModalIfOpen === "function") {
                window.refreshDongtianPetEquipModalIfOpen();
            }
            var m = document.getElementById("xiuMarketModal");
            if (m && m.style.display === "flex") {
                refreshAll();
            }
            return syncOk;
        });
    }

    function applyLocalGiftDeduction(kind, ex) {
        ex = ex || {};
        if (typeof player === "undefined" || !player) return;
        try {
            if (kind === "equip" && player.inventory && Array.isArray(player.inventory.equipment)) {
                var eqIdx = parseInt(ex.equipIndex, 10);
                if (Number.isFinite(eqIdx) && eqIdx >= 0 && eqIdx < player.inventory.equipment.length) {
                    player.inventory.equipment.splice(eqIdx, 1);
                }
            } else if (kind === "material" && ex.materialKey && player.inventory && player.inventory.materials) {
                var mk = String(ex.materialKey);
                var take = parseInt(ex.materialAmount, 10) || 0;
                var have = parseInt(player.inventory.materials[mk], 10) || 0;
                if (take > 0 && have >= take) {
                    player.inventory.materials[mk] = have - take;
                    if (typeof saveData === "function") {
                        saveData({ forceCloud: true, playerMutation: true, skipMarkMutation: true });
                    }
                }
            } else if (kind === "pet" && ex.petId && Array.isArray(player.petCollection)) {
                var pid = String(ex.petId);
                var pIdx = player.petCollection.findIndex(function (p) {
                    return p && String(p.id) === pid;
                });
                if (pIdx >= 0) {
                    player.petCollection.splice(pIdx, 1);
                    if (player.activePetId && String(player.activePetId) === pid) {
                        player.activePetId = player.petCollection.length ? player.petCollection[0].id : null;
                    }
                }
            } else if (kind === "pet_equip" && ex.petEquipId && Array.isArray(player.petEquipmentBag)) {
                var peid = String(ex.petEquipId);
                var peIdx = player.petEquipmentBag.findIndex(function (it) {
                    return it && String(it.id) === peid;
                });
                if (peIdx >= 0) player.petEquipmentBag.splice(peIdx, 1);
            }
            /** 勿 markPlayerMutation：专用 API 已扣物，下一帧 refreshAfter 以服务端为准；避免在途 POST/影子把已转出遗器写回 */
        } catch (eLoc) {}
    }

    var sellState = { kind: null, extra: null, saleMode: "fixed" };
    var giftState = { kind: null, extra: null };
    var toastTimer;
    var confirmCallback = null;

    function showXiuToast(msg, isErr) {
        var el = document.getElementById("xiuMarketToast");
        if (!el) {
            if (typeof alert !== "undefined") alert(msg);
            return;
        }
        el.textContent = msg;
        el.classList.toggle("xiu-market-toast--err", !!isErr);
        el.style.display = "block";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.style.display = "none";
        }, 2600);
    }

    /** 挂单「信息」：统一入口，避免列表重绘时逐按钮绑定失效；并对缺数据/异常给出提示 */
    function openXiuListingInfo(listingIdAttr) {
        var holder = document.getElementById("xiuMarketList");
        var rows = holder && holder._xiuListRows;
        var lid = listingIdAttr == null ? "" : String(listingIdAttr);
        if (!rows || !lid) {
            showXiuToast("无法读取挂单数据", true);
            return;
        }
        var row = rows.find(function (x) {
            return String(x.listingId) === lid;
        });
        if (!row) {
            showXiuToast("未找到该挂单（列表可能已刷新）", true);
            return;
        }
        try {
            if (row.itemType === "equip") {
                if (!row.equipPreview) {
                    showXiuToast("暂无遗器预览数据", true);
                    return;
                }
                if (typeof window.showMarketEquipPreview !== "function") {
                    showXiuToast("预览模块未就绪", true);
                    return;
                }
                window.showMarketEquipPreview(row.equipPreview);
            } else if (row.itemType === "pet") {
                if (!row.petPreview) {
                    showXiuToast("暂无灵宠预览数据", true);
                    return;
                }
                if (typeof window.showMarketPetPreview !== "function") {
                    showXiuToast("预览模块未就绪", true);
                    return;
                }
                window.showMarketPetPreview(row.petPreview);
            } else if (row.itemType === "pet_equip") {
                if (!row.petEquipPreview) {
                    showXiuToast("暂无法器预览数据", true);
                    return;
                }
                if (typeof window.showMarketPetEquipPreview !== "function") {
                    showXiuToast("预览模块未就绪", true);
                    return;
                }
                window.showMarketPetEquipPreview(row.petEquipPreview);
            } else if (row.itemType === "material") {
                showMarketMaterialPreview(row.materialKey, row.materialAmount, row.displayName);
            } else {
                showXiuToast("未知商品类型", true);
            }
        } catch (err) {
            showXiuToast((err && err.message) || "预览打开失败", true);
        }
    }

    function closeXiuConfirm() {
        var modal = document.getElementById("xiuMarketConfirmModal");
        if (modal) modal.style.display = "none";
        confirmCallback = null;
        syncParentViewportForXiuUi();
    }

    function showXiuConfirm(text, onOk) {
        var modal = document.getElementById("xiuMarketConfirmModal");
        var tx = document.getElementById("xiuConfirmText");
        if (!modal || !tx) {
            if (typeof confirm !== "undefined" && confirm(text)) onOk();
            return;
        }
        confirmCallback = onOk;
        tx.textContent = text;
        modal.style.display = "flex";
        syncParentViewportForXiuUi();
    }

    function setSellSaleMode(mode) {
        sellState.saleMode = mode;
        var fixedBtn = document.getElementById("xiuSellModeFixed");
        var aucBtn = document.getElementById("xiuSellModeAuction");
        var ff = document.getElementById("xiuSellFieldsFixed");
        var af = document.getElementById("xiuSellFieldsAuction");
        if (fixedBtn) fixedBtn.classList.toggle("xiu-sell-mode-btn--active", mode === "fixed");
        if (aucBtn) aucBtn.classList.toggle("xiu-sell-mode-btn--active", mode === "auction");
        if (ff) ff.hidden = mode !== "fixed";
        if (af) af.hidden = mode !== "auction";
        requestAnimationFrame(function () {
            focusSellModalPrimaryInput();
        });
    }

    function focusSellModalPrimaryInput() {
        var kind = sellState.kind;
        var mode = sellState.saleMode || "fixed";
        var matRow = document.getElementById("xiuSellMatRow");
        if (kind === "material" && matRow && !matRow.hidden) {
            var q = document.getElementById("xiuSellMatQty");
            if (q) {
                q.focus();
                try {
                    q.select();
                } catch (e) {}
                return;
            }
        }
        var el =
            mode === "auction" ? document.getElementById("xiuSellMinBid") : document.getElementById("xiuSellPriceFixed");
        if (el) {
            el.focus();
            try {
                if (typeof el.select === "function") el.select();
            } catch (e2) {}
        }
    }

    function closeSellModal() {
        var m = document.getElementById("xiuMarketSellModal");
        if (m) m.style.display = "none";
        try {
            document.body.classList.remove("xiu-sell-open");
        } catch (e) {}
        sellState.kind = null;
        sellState.extra = null;
        syncParentViewportForXiuUi();
    }

    function closeGiftModal() {
        var m = document.getElementById("xiuMarketGiftModal");
        if (m) m.style.display = "none";
        try {
            document.body.classList.remove("xiu-sell-open");
        } catch (eG) {}
        giftState.kind = null;
        giftState.extra = null;
        syncParentViewportForXiuUi();
    }

    function openGiftModal(kind, extra) {
        giftState.kind = kind;
        giftState.extra = extra || {};
        var errEl = document.getElementById("xiuGiftErr");
        if (errEl) errEl.textContent = "";
        var title = document.getElementById("xiuGiftTitle");
        var hint = document.getElementById("xiuGiftHint");
        var matRow = document.getElementById("xiuGiftMatRow");
        var petRow = document.getElementById("xiuGiftPetRow");
        var petEquipRow = document.getElementById("xiuGiftPetEquipRow");
        var cap = document.getElementById("xiuGiftMatCap");
        var qtyInp = document.getElementById("xiuGiftMatQty");
        var pidInp = document.getElementById("xiuGiftTargetPid");
        if (pidInp) pidInp.value = "";

        if (title) {
            title.textContent =
                kind === "equip"
                    ? "赠送遗器"
                    : kind === "material"
                    ? "赠送材料"
                    : kind === "pet"
                    ? "赠送灵宠"
                    : kind === "pet_equip"
                    ? "赠送灵宠法器"
                    : "赠送物品";
        }
        if (hint) {
            hint.textContent =
                kind === "equip"
                    ? "输入对方灵网身份（1–10000）；确认后从行囊转出该遗器。"
                    : kind === "material"
                    ? "填写数量与对方灵网身份；从行囊材料中转出。"
                    : kind === "pet_equip"
                    ? "输入对方灵网身份；从法器行囊转出该灵宠法器（须未锁定、未佩戴）。"
                    : "输入对方灵网身份；从灵宠栏转出该灵宠（须未锁定）。";
        }
        if (matRow) matRow.hidden = kind !== "material";
        if (petRow) petRow.hidden = kind !== "pet";
        if (petEquipRow) petEquipRow.hidden = kind !== "pet_equip";
        if (kind === "material" && giftState.extra.maxAmount != null) {
            var mx = parseInt(giftState.extra.maxAmount, 10) || 1;
            if (qtyInp) {
                qtyInp.max = mx;
                qtyInp.min = 1;
                qtyInp.value = String(Math.min(mx, 1));
            }
            if (cap) cap.textContent = "最多可赠送 " + mx + " 个";
        }

        var m = document.getElementById("xiuMarketGiftModal");
        if (m) m.style.display = "flex";
        try {
            document.body.classList.add("xiu-sell-open");
        } catch (eGo) {}
        syncParentViewportForXiuUi();
        requestAnimationFrame(function () {
            if (kind === "material" && matRow && !matRow.hidden && qtyInp) {
                qtyInp.focus();
                try {
                    qtyInp.select();
                } catch (eQ) {}
            } else if (pidInp) {
                pidInp.focus();
            }
        });
    }

    function submitGiftModal() {
        var errEl = document.getElementById("xiuGiftErr");
        if (errEl) errEl.textContent = "";
        var kind = giftState.kind;
        var ex = giftState.extra || {};
        if (!kind) return;

        var pidInp = document.getElementById("xiuGiftTargetPid");
        var targetPid = pidInp ? Math.floor(Number(String(pidInp.value || "").trim())) : NaN;
        if (!Number.isFinite(targetPid) || targetPid < 1 || targetPid > 10000) {
            if (errEl) errEl.textContent = "请输入有效的对方灵网身份（1–10000）";
            return;
        }

        var body = Object.assign(
            {
                itemType:
                    kind === "equip"
                        ? "equip"
                        : kind === "material"
                        ? "material"
                        : kind === "pet_equip"
                        ? "pet_equip"
                        : "pet",
                targetPublicId: targetPid,
            },
            playerNameBody()
        );

        if (kind === "equip") body.equipIndex = ex.equipIndex;
        if (kind === "pet") body.petId = ex.petId;
        if (kind === "pet_equip") body.petEquipId = ex.petEquipId;
        if (kind === "material") {
            var mx = parseInt(ex.maxAmount, 10) || 0;
            var qtyInp = document.getElementById("xiuGiftMatQty");
            var qty = qtyInp ? parseInt(qtyInp.value, 10) : NaN;
            if (!Number.isFinite(qty) || qty < 1 || qty > mx) {
                if (errEl) errEl.textContent = "数量无效（1～" + mx + "）";
                return;
            }
            body.materialKey = ex.materialKey;
            body.materialAmount = qty;
            ex = Object.assign({}, ex, { materialAmount: qty });
        }

        if (typeof window.dongtianCancelBeforeServerPull === "function") {
            window.dongtianCancelBeforeServerPull();
        } else if (typeof window.dongtianCancelCloudSaveInFlight === "function") {
            window.dongtianCancelCloudSaveInFlight();
        }

        var submitBtn = document.getElementById("xiuGiftSubmit");
        if (submitBtn) submitBtn.disabled = true;

        var prepOpts = { kind: kind };
        if (kind === "material") {
            prepOpts.materialKey = body.materialKey;
            prepOpts.materialAmount = body.materialAmount;
        } else if (kind === "equip") {
            prepOpts.equipIndex = body.equipIndex;
        } else if (kind === "pet") {
            prepOpts.petId = body.petId;
        } else if (kind === "pet_equip") {
            prepOpts.petEquipId = body.petEquipId;
        }

        flushDongtianInventoryBeforeTrade(prepOpts)
            .then(function (prep) {
                if (!prep || !prep.ok) {
                    if (submitBtn) submitBtn.disabled = false;
                    var waitMsg = (prep && prep.message) || "行囊变更尚未同步至云端，请稍候再试赠送";
                    if (errEl) errEl.textContent = waitMsg;
                    else showXiuToast(waitMsg, true);
                    return null;
                }
                return api("POST", "/api/dongtian-market/gift", body);
            })
            .then(function (res) {
                if (res === null) return;
                if (submitBtn) submitBtn.disabled = false;
                if (res && res.ok) {
                    applyLocalGiftDeduction(kind, ex);
                    if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
                        window.dongtianSyncRevisionFromTradeApi(res);
                    }
                    if (typeof window.dongtianClearInventoryShadow === "function") {
                        window.dongtianClearInventoryShadow();
                    }
                    closeGiftModal();
                    refreshParentNetworkCoinIfPossible();
                    upsertXiuMarketCoinDisplay();
                    return refreshAfterDongtianTrade().then(function (syncOk) {
                        showXiuToast(
                            syncOk ? res.message || "赠送成功，对方可在行囊收件箱领取" : "赠送已提交，对方可在行囊收件箱领取",
                            !syncOk
                        );
                    });
                } else {
                    var msg = (res && res.message) || "赠送失败";
                    if (errEl) errEl.textContent = msg;
                    else showXiuToast(msg, true);
                }
            })
            .catch(function (e) {
                if (submitBtn) submitBtn.disabled = false;
                var msg = (e && e.message) || "赠送请求失败（请检查联网与登录）";
                if (errEl) errEl.textContent = msg;
                else showXiuToast(msg, true);
            });
    }

    function bindGiftModal() {
        var cancel = document.getElementById("xiuGiftCancel");
        if (cancel) cancel.onclick = closeGiftModal;
        var sub = document.getElementById("xiuGiftSubmit");
        if (sub) sub.onclick = submitGiftModal;
        var giftModal = document.getElementById("xiuMarketGiftModal");
        if (giftModal && !giftModal._xiuGiftBackdropBound) {
            giftModal._xiuGiftBackdropBound = true;
            giftModal.addEventListener("click", function (ev) {
                if (ev.target === giftModal) closeGiftModal();
            });
        }
    }
    bindGiftModal();

    function openSellModal(kind, extra) {
        sellState.kind = kind;
        sellState.extra = extra || {};
        var errEl = document.getElementById("xiuSellErr");
        if (errEl) errEl.textContent = "";
        var title = document.getElementById("xiuSellTitle");
        var hint = document.getElementById("xiuSellHint");
        var matRow = document.getElementById("xiuSellMatRow");
        var petRow = document.getElementById("xiuSellPetRow");
        var petEquipRow = document.getElementById("xiuSellPetEquipRow");
        var cap = document.getElementById("xiuSellMatCap");
        var qtyInp = document.getElementById("xiuSellMatQty");

        if (title) {
            title.textContent =
                kind === "equip"
                    ? "上架遗器"
                    : kind === "material"
                    ? "上架材料"
                    : kind === "pet"
                    ? "上架灵宠"
                    : kind === "pet_equip"
                    ? "上架灵宠法器"
                    : "上架至修仙市场";
        }
        if (hint) {
            hint.textContent =
                kind === "equip"
                    ? "选择固定一口价或竞拍，并填写联网币价格。"
                    : kind === "material"
                    ? "填写上架数量后，再选择出售方式与价格。"
                    : kind === "pet_equip"
                    ? "选择出售方式与价格；灵宠法器将从法器行囊取出挂单。"
                    : "选择出售方式与价格；灵宠将从栏中取出挂单。";
        }
        if (matRow) matRow.hidden = kind !== "material";
        if (petRow) petRow.hidden = kind !== "pet";
        if (petEquipRow) petEquipRow.hidden = kind !== "pet_equip";
        if (kind === "material" && sellState.extra.maxAmount != null) {
            var mx = parseInt(sellState.extra.maxAmount, 10) || 1;
            if (qtyInp) {
                qtyInp.max = mx;
                qtyInp.min = 1;
                qtyInp.value = String(Math.min(mx, 1));
            }
            if (cap) cap.textContent = "最多可上架 " + mx + " 个";
        }
        var pf = document.getElementById("xiuSellPriceFixed");
        var mb = document.getElementById("xiuSellMinBid");
        var bn = document.getElementById("xiuSellBuyNow");
        if (pf) pf.value = "1";
        if (mb) mb.value = "1";
        if (bn) bn.value = "";

        setSellSaleMode("fixed");

        var m = document.getElementById("xiuMarketSellModal");
        if (m) m.style.display = "flex";
        try {
            document.body.classList.add("xiu-sell-open");
        } catch (e) {}
        syncParentViewportForXiuUi();
    }

    function submitSellModal() {
        var errEl = document.getElementById("xiuSellErr");
        if (errEl) errEl.textContent = "";
        var kind = sellState.kind;
        var ex = sellState.extra || {};
        if (!kind) return;

        var body = Object.assign(
            {
                itemType:
                    kind === "equip"
                        ? "equip"
                        : kind === "material"
                        ? "material"
                        : kind === "pet_equip"
                        ? "pet_equip"
                        : "pet",
                saleMode: sellState.saleMode || "fixed",
            },
            playerNameBody()
        );

        if (kind === "equip") body.equipIndex = ex.equipIndex;
        if (kind === "pet") body.petId = ex.petId;
        if (kind === "pet_equip") body.petEquipId = ex.petEquipId;
        if (kind === "material") {
            var mx = parseInt(ex.maxAmount, 10) || 0;
            var qtyInp = document.getElementById("xiuSellMatQty");
            var qty = qtyInp ? parseInt(qtyInp.value, 10) : NaN;
            if (!Number.isFinite(qty) || qty < 1 || qty > mx) {
                if (errEl) errEl.textContent = "数量无效（1～" + mx + "）";
                return;
            }
            body.materialKey = ex.materialKey;
            body.materialAmount = qty;
        }

        var mode = sellState.saleMode || "fixed";
        if (mode === "fixed") {
            var pr = parseInt(document.getElementById("xiuSellPriceFixed").value, 10);
            if (!Number.isFinite(pr) || pr < 0) {
                if (errEl) errEl.textContent = "一口价无效";
                return;
            }
            body.price = pr;
        } else {
            var minB = parseInt(document.getElementById("xiuSellMinBid").value, 10);
            if (!Number.isFinite(minB) || minB < 1) {
                if (errEl) errEl.textContent = "起拍价须为至少 1 的整数";
                return;
            }
            body.minBid = minB;
            var bnInp = document.getElementById("xiuSellBuyNow");
            var bnStr = bnInp ? bnInp.value : "";
            if (bnStr && String(bnStr).trim() !== "") {
                var bnVal = parseInt(bnStr, 10);
                if (!Number.isFinite(bnVal) || bnVal < minB) {
                    if (errEl) errEl.textContent = "可选一口价须 ≥ 起拍价";
                    return;
                }
                body.buyNowPrice = bnVal;
            }
        }

        var submitBtn = document.getElementById("xiuSellSubmit");
        if (submitBtn) submitBtn.disabled = true;

        var sellPrepOpts = { kind: sellState.kind };
        if (sellState.kind === "material") {
            sellPrepOpts.materialKey = body.materialKey;
            sellPrepOpts.materialAmount = body.materialAmount;
        } else if (sellState.kind === "equip") {
            sellPrepOpts.equipIndex = body.equipIndex;
        } else if (sellState.kind === "pet") {
            sellPrepOpts.petId = body.petId;
        } else if (sellState.kind === "pet_equip") {
            sellPrepOpts.petEquipId = body.petEquipId;
        }

        flushDongtianInventoryBeforeTrade(sellPrepOpts)
            .then(function (prep) {
                if (!prep || !prep.ok) {
                    if (submitBtn) submitBtn.disabled = false;
                    var waitMsg = (prep && prep.message) || "行囊变更尚未同步至云端，请稍候再试上架";
                    if (errEl) errEl.textContent = waitMsg;
                    else showXiuToast(waitMsg, true);
                    return null;
                }
                return api("POST", "/api/dongtian-market/sell", body);
            })
            .then(function (res) {
                if (res === null) return;
                if (submitBtn) submitBtn.disabled = false;
                if (res && res.ok) {
                    applyLocalSellDeduction(sellState.kind, sellState.extra);
                    if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
                        window.dongtianSyncRevisionFromTradeApi(res);
                    }
                    if (typeof window.dongtianClearInventoryShadow === "function") {
                        window.dongtianClearInventoryShadow();
                    }
                    closeSellModal();
                    return refreshAfterDongtianTrade().then(function (syncOk) {
                        showXiuToast(
                            syncOk ? "上架成功" : "上架成功但行囊未同步，请重开修仙市场",
                            !syncOk
                        );
                    });
                } else {
                    var msg = (res && res.message) || "上架失败";
                    if (errEl) errEl.textContent = msg;
                    else showXiuToast(msg, true);
                }
            })
            .catch(function (e) {
                if (submitBtn) submitBtn.disabled = false;
                var msg = (e && e.message) || "上架请求失败（请检查联网与登录）";
                if (errEl) errEl.textContent = msg;
                else showXiuToast(msg, true);
            });
    }

    function bindXiuSellAndConfirm() {
        var modeFixed = document.getElementById("xiuSellModeFixed");
        var modeAuc = document.getElementById("xiuSellModeAuction");
        if (modeFixed)
            modeFixed.onclick = function () {
                setSellSaleMode("fixed");
            };
        if (modeAuc)
            modeAuc.onclick = function () {
                setSellSaleMode("auction");
            };
        var cancel = document.getElementById("xiuSellCancel");
        if (cancel) cancel.onclick = closeSellModal;
        var sub = document.getElementById("xiuSellSubmit");
        if (sub) sub.onclick = submitSellModal;
        var ok = document.getElementById("xiuConfirmOk");
        var cx = document.getElementById("xiuConfirmCancel");
        if (ok)
            ok.onclick = function () {
                var cb = confirmCallback;
                var modal = document.getElementById("xiuMarketConfirmModal");
                if (modal) modal.style.display = "none";
                confirmCallback = null;
                if (typeof cb === "function") cb();
            };
        if (cx) cx.onclick = closeXiuConfirm;
        var sellModal = document.getElementById("xiuMarketSellModal");
        if (sellModal)
            sellModal.addEventListener("click", function (ev) {
                if (ev.target === sellModal) closeSellModal();
            });
        var confModal = document.getElementById("xiuMarketConfirmModal");
        if (confModal)
            confModal.addEventListener("click", function (ev) {
                if (ev.target === confModal) closeXiuConfirm();
            });
        document.addEventListener(
            "keydown",
            function (ev) {
                var t = ev.target;
                if (!t || !t.closest) return;
                if (
                    t.closest("#xiuMarketSellModal") ||
                    t.closest("#xiuMarketGiftModal") ||
                    t.closest("#xiuMarketConfirmModal") ||
                    t.closest("#xiuMarketModal")
                ) {
                    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
                        ev.stopPropagation();
                    }
                }
            },
            true
        );
        document.addEventListener(
            "keydown",
            function (ev) {
                if (ev.key !== "Escape" && ev.keyCode !== 27) return;
                var conf = document.getElementById("xiuMarketConfirmModal");
                if (conf && conf.style.display === "flex") {
                    closeXiuConfirm();
                    ev.preventDefault();
                    return;
                }
                var sell = document.getElementById("xiuMarketSellModal");
                if (sell && sell.style.display === "flex") {
                    closeSellModal();
                    ev.preventDefault();
                    return;
                }
                var gift = document.getElementById("xiuMarketGiftModal");
                if (gift && gift.style.display === "flex") {
                    closeGiftModal();
                    ev.preventDefault();
                    return;
                }
                var xm = document.getElementById("xiuMarketModal");
                if (xm && xm.style.display === "flex") {
                    closeModal();
                    ev.preventDefault();
                }
            },
            true
        );
    }
    bindXiuSellAndConfirm();

    function loadList() {
        var q = "?page=" + state.page + "&pageSize=" + state.pageSize;
        if (state.mine) q += "&mine=1";
        if (state.itemType === "equip" || state.itemType === "material" || state.itemType === "pet" || state.itemType === "pet_equip") {
            q += "&itemType=" + encodeURIComponent(state.itemType);
        }
        if (state.equipRarity) q += "&equipRarity=" + encodeURIComponent(state.equipRarity);
        if (state.equipSlotType) q += "&equipSlotType=" + encodeURIComponent(state.equipSlotType);
        if (state.equipLvlMin !== "" && state.equipLvlMin != null) q += "&equipLvlMin=" + encodeURIComponent(String(state.equipLvlMin));
        if (state.equipLvlMax !== "" && state.equipLvlMax != null) q += "&equipLvlMax=" + encodeURIComponent(String(state.equipLvlMax));
        if (state.itemType === "pet") {
            if (state.petKind) q += "&petType=" + encodeURIComponent(state.petKind);
            if (state.petAgeTier) q += "&petAgeTier=" + encodeURIComponent(state.petAgeTier);
        }
        if (state.itemType === "pet_equip") {
            if (state.peqType) q += "&peqType=" + encodeURIComponent(state.peqType);
            if (state.peqSlot) q += "&peqSlot=" + encodeURIComponent(state.peqSlot);
            if (state.peqRarity) q += "&peqRarity=" + encodeURIComponent(state.peqRarity);
            if (state.peqLvlMin !== "" && state.peqLvlMin != null) q += "&equipLvlMin=" + encodeURIComponent(String(state.peqLvlMin));
            if (state.peqLvlMax !== "" && state.peqLvlMax != null) q += "&equipLvlMax=" + encodeURIComponent(String(state.peqLvlMax));
        }
        var holder = document.getElementById("xiuMarketList");
        if (holder) holder.innerHTML = '<p class="xiu-market-muted">加载中…</p>';
        api("GET", "/api/dongtian-market/list" + q, undefined)
            .then(function (res) {
                if (!res || !res.ok) {
                    if (holder) holder.innerHTML = '<p class="xiu-market-err">' + (res && res.message ? res.message : "加载失败") + "</p>";
                    return;
                }
                renderList(res.list || [], res.total || 0, res.page || 1);
                var hist = document.getElementById("xiuMarketSoldHistory");
                if (hist) {
                    var soldHistory = (res.soldHistory && res.soldHistory.length) ? res.soldHistory.slice(-12).reverse() : [];
                    if (soldHistory.length) {
                        hist.innerHTML = soldHistory
                            .map(function (s) {
                                var buyerDisplay = xiuPeerLine(s.buyerPlayerName, s.buyerDongtianPublicId, s.buyerName || "某玩家");
                                var sellerDisplay = xiuPeerLine(s.sellerPlayerName, s.sellerDongtianPublicId, s.sellerName || "某玩家");
                                var soldName = xiuResolveMaterialLine(s.displayName, null, null);
                                var price = s.price != null ? s.price : 0;
                                var line =
                                    xiuEsc(buyerDisplay) +
                                    " 购买了 " +
                                    xiuEsc(sellerDisplay) +
                                    " 的 【" +
                                    xiuEsc(soldName) +
                                    "】，" +
                                    xiuEsc(String(price)) +
                                    " 联网币 · " +
                                    fmtTime(s.time);
                                return '<div class="xiu-market-sold-row">' + line + "</div>";
                            })
                            .join("");
                    } else {
                        hist.innerHTML = '<p class="xiu-market-muted">暂无成交记录</p>';
                    }
                }
            })
            .catch(function (e) {
                if (holder) holder.innerHTML = '<p class="xiu-market-err">' + (e && e.message ? e.message : "网络错误") + "</p>";
            });
    }

    function renderList(rows, total, page) {
        var holder = document.getElementById("xiuMarketList");
        if (!holder) return;
        if (!rows.length) {
            holder.innerHTML = '<p class="xiu-market-muted">暂无挂单</p>';
            renderPager(total, page);
            return;
        }
        var html = rows
            .map(function (r) {
                var isAuc = r.saleMode === "auction";
                var priceLine = isAuc
                    ? "竞拍 当前 " +
                      (r.currentBid || 0) +
                      " / 起拍 " +
                      (r.minBid || r.price || 0) +
                      (r.buyNowPrice != null ? " · 一口价 " + r.buyNowPrice : "")
                    : "一口价 " + (r.price || 0);
                var timeLine = isAuc
                    ? "截止 " + fmtTime(r.auctionEndsAt)
                    : "到期 " + fmtTime(r.autoDelistAt);
                var typeLabel =
                    r.itemType === "equip"
                        ? "遗器"
                        : r.itemType === "pet"
                        ? "灵宠"
                        : r.itemType === "pet_equip"
                        ? "灵宠法器"
                        : "材料";
                var rowTitle = xiuEsc(xiuMarketRowTitle(r));
                var rowDesc = xiuMarketRowDesc(r);
                var descLine = rowDesc ? '<div class="xiu-market-row-desc">' + xiuEsc(rowDesc) + "</div>" : "";
                var nameCls = "";
                if (r.itemType === "equip" && r.equipPreview && r.equipPreview.rarity) {
                    nameCls = ' class="' + xiuEsc(r.equipPreview.rarity) + '"';
                }
                var infoBtn =
                    '<button type="button" class="btn btn--sm btn--ghost xiu-market-info-btn" title="查看属性" data-listing-id="' +
                    xiuEsc(r.listingId) +
                    '"><i class="fas fa-circle-info" aria-hidden="true"></i>信息</button>';
                var actions = "";
                if (!state.mine) {
                    if (isAuc) {
                        actions +=
                            '<div class="xiu-market-row-actions">' +
                            '<input type="number" class="xiu-market-inp xiu-bid-inp" data-id="' +
                            r.listingId +
                            '" placeholder="出价" min="1" />' +
                            '<button type="button" class="btn btn--sm btn--ghost" data-bid="' +
                            r.listingId +
                            '">出价</button>';
                        if (r.buyNowPrice != null) {
                            actions +=
                                '<button type="button" class="btn btn--sm btn--primary" data-buynow="' +
                                r.listingId +
                                '">一口价</button>';
                        }
                        actions += "</div>";
                    } else {
                        actions =
                            '<button type="button" class="btn btn--sm btn--primary" data-buy="' + r.listingId + '">购买</button>';
                    }
                }
                if (state.mine && r.saleMode === "fixed") {
                    actions +=
                        '<button type="button" class="btn btn--sm btn--ghost" data-delist="' + r.listingId + '">下架</button>';
                }
                return (
                    '<div class="xiu-market-row">' +
                    '<div class="xiu-market-row-main">' +
                    '<span class="xiu-market-tag">' +
                    typeLabel +
                    "</span>" +
                    '<span class="xiu-market-row-nameblock">' +
                    "<strong" +
                    nameCls +
                    ">" +
                    rowTitle +
                    "</strong>" +
                    infoBtn +
                    "</span>" +
                    '<span class="xiu-market-seller">卖方：' +
                    xiuEsc(xiuPeerLine(r.sellerPlayerName, r.sellerDongtianPublicId, r.sellerName || "")) +
                    "</span>" +
                    "</div>" +
                    descLine +
                    '<div class="xiu-market-row-meta">' +
                    priceLine +
                    " · " +
                    timeLine +
                    "</div>" +
                    actions +
                    "</div>"
                );
            })
            .join("");
        holder.innerHTML = html;
        holder._xiuListRows = rows;
        holder.querySelectorAll("[data-buy]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-buy");
                showXiuConfirm("确认花费联网币购买？", function () {
                    api("POST", "/api/dongtian-market/buy", Object.assign({ listingId: id }, playerNameBody()))
                        .then(function (res) {
                            if (res && res.ok) {
                                if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
                                    window.dongtianSyncRevisionFromTradeApi(res);
                                }
                                return refreshAfterDongtianTrade().then(function (syncOk) {
                                    showXiuToast(
                                        syncOk ? "购买成功" : "购买成功但行囊未同步，请重开修仙市场",
                                        !syncOk
                                    );
                                });
                            } else {
                                showXiuToast((res && res.message) || "失败", true);
                            }
                        })
                        .catch(function (e) {
                            showXiuToast((e && e.message) || "请求失败", true);
                        });
                });
            };
        });
        holder.querySelectorAll("[data-buynow]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-buynow");
                showXiuConfirm("确认一口价购买？", function () {
                    api("POST", "/api/dongtian-market/buy", Object.assign({ listingId: id }, playerNameBody()))
                        .then(function (res) {
                            if (res && res.ok) {
                                if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
                                    window.dongtianSyncRevisionFromTradeApi(res);
                                }
                                return refreshAfterDongtianTrade().then(function (syncOk) {
                                    showXiuToast(
                                        syncOk ? "成交" : "成交但行囊未同步，请重开修仙市场",
                                        !syncOk
                                    );
                                });
                            } else {
                                showXiuToast((res && res.message) || "失败", true);
                            }
                        })
                        .catch(function (e) {
                            showXiuToast((e && e.message) || "请求失败", true);
                        });
                });
            };
        });
        holder.querySelectorAll("[data-bid]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-bid");
                var inp = holder.querySelector('.xiu-bid-inp[data-id="' + id + '"]');
                var amt = inp ? parseInt(inp.value, 10) : NaN;
                if (!Number.isFinite(amt) || amt < 1) {
                    showXiuToast("请输入有效出价", true);
                    return;
                }
                api("POST", "/api/dongtian-market/bid", Object.assign({ listingId: id, bidAmount: amt }, playerNameBody()))
                    .then(function (res) {
                        if (res && res.ok) {
                            showXiuToast("出价成功", false);
                            refreshAll();
                        } else {
                            showXiuToast((res && res.message) || "失败", true);
                        }
                    })
                    .catch(function (e) {
                        showXiuToast((e && e.message) || "请求失败", true);
                    });
            };
        });
        holder.querySelectorAll("[data-delist]").forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute("data-delist");
                api("POST", "/api/dongtian-market/delist", { listingId: id })
                    .then(function (res) {
                        if (res && res.ok) {
                            if (typeof window.dongtianSyncRevisionFromTradeApi === "function") {
                                window.dongtianSyncRevisionFromTradeApi(res);
                            }
                            return refreshAfterDongtianTrade().then(function (syncOk) {
                                showXiuToast(
                                    syncOk ? "已下架" : "已下架但行囊未同步，请重开修仙市场",
                                    !syncOk
                                );
                            });
                        } else {
                            showXiuToast((res && res.message) || "失败", true);
                        }
                    })
                    .catch(function (e) {
                        showXiuToast((e && e.message) || "请求失败", true);
                    });
            };
        });
        renderPager(total, page);
    }

    function renderPager(total, page) {
        var el = document.getElementById("xiuMarketPager");
        if (!el) return;
        var pages = Math.max(1, Math.ceil(total / state.pageSize));
        el.innerHTML =
            '<button type="button" class="btn btn--sm btn--ghost" id="xiuMarketPrev">上一页</button>' +
            "<span>第 " +
            page +
            " / " +
            pages +
            " 页（共 " +
            total +
            " 条）</span>" +
            '<button type="button" class="btn btn--sm btn--ghost" id="xiuMarketNext">下一页</button>';
        var prev = document.getElementById("xiuMarketPrev");
        var next = document.getElementById("xiuMarketNext");
        if (prev)
            prev.onclick = function () {
                if (state.page > 1) {
                    state.page--;
                    loadList();
                }
            };
        if (next)
            next.onclick = function () {
                if (page < pages) {
                    state.page++;
                    loadList();
                }
            };
    }

    window.dongtianMarketOpenSellEquip = function (equipIndex) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (typeof player !== "undefined" && player && player.inventory && typeof parseInventoryEquipmentEntry === "function") {
            var sellEq = parseInventoryEquipmentEntry(player.inventory.equipment[equipIndex]);
            if (sellEq && typeof equipmentHasSocketedGems === "function" && equipmentHasSocketedGems(sellEq)) {
                showXiuToast("遗器镶嵌有宝石，需先卸下后方可上架", true);
                return;
            }
            if (sellEq && typeof isEquipmentMarketRestricted === "function" && isEquipmentMarketRestricted(sellEq)) {
                showXiuToast("10星遗器无法上架修仙市场", true);
                return;
            }
        }
        openSellModal("equip", { equipIndex: equipIndex });
    };
    window.dongtianMarketOpenSellMaterial = function (materialKey, maxAmount) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        var max = parseInt(maxAmount, 10) || 0;
        if (max < 1) {
            showXiuToast("数量不足", true);
            return;
        }
        openSellModal("material", { materialKey: materialKey, maxAmount: max });
    };
    window.dongtianMarketOpenSellPet = function (petId) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (!petId) return;
        if (typeof getPetById === "function") {
            var sellPet = getPetById(petId);
            if (sellPet) {
                if (typeof normalizePetObject === "function") normalizePetObject(sellPet);
                if (sellPet.locked) {
                    showXiuToast("该灵宠已锁定，无法上架", true);
                    return;
                }
            }
        }
        openSellModal("pet", { petId: petId });
    };

    window.dongtianMarketOpenSellPetEquip = function (petEquipId) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (!petEquipId) return;
        if (typeof getPetEquipmentById === "function") {
            var sellPe = getPetEquipmentById(petEquipId);
            if (sellPe) {
                if (sellPe.locked === true || sellPe.locked === 1 || sellPe.locked === "1") {
                    showXiuToast("该法器已锁定，无法上架", true);
                    return;
                }
                if (sellPe.equippedOn) {
                    showXiuToast("请先卸下法器再上架", true);
                    return;
                }
            }
        }
        openSellModal("pet_equip", { petEquipId: petEquipId });
    };

    window.dongtianMarketOpenGiftEquip = function (equipIndex) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (typeof player !== "undefined" && player && player.inventory && typeof parseInventoryEquipmentEntry === "function") {
            var giftEq = parseInventoryEquipmentEntry(player.inventory.equipment[equipIndex]);
            if (giftEq && typeof equipmentHasSocketedGems === "function" && equipmentHasSocketedGems(giftEq)) {
                showXiuToast("遗器镶嵌有宝石，需先卸下后方可赠送", true);
                return;
            }
            if (giftEq && typeof isEquipmentMarketRestricted === "function" && isEquipmentMarketRestricted(giftEq)) {
                showXiuToast("10星遗器无法赠送", true);
                return;
            }
        }
        openGiftModal("equip", { equipIndex: equipIndex });
    };
    window.dongtianMarketOpenGiftMaterial = function (materialKey, maxAmount) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        var max = parseInt(maxAmount, 10) || 0;
        if (max < 1) {
            showXiuToast("数量不足", true);
            return;
        }
        openGiftModal("material", { materialKey: materialKey, maxAmount: max });
    };
    window.dongtianMarketOpenGiftPet = function (petId) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (!petId) return;
        if (typeof getPetById === "function") {
            var gPet = getPetById(petId);
            if (gPet) {
                if (typeof normalizePetObject === "function") normalizePetObject(gPet);
                if (gPet.locked) {
                    showXiuToast("该灵宠已锁定，无法赠送", true);
                    return;
                }
            }
        }
        openGiftModal("pet", { petId: petId });
    };

    window.dongtianMarketOpenGiftPetEquip = function (petEquipId) {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        if (!petEquipId) return;
        if (typeof getPetEquipmentById === "function") {
            var gPe = getPetEquipmentById(petEquipId);
            if (gPe) {
                if (gPe.locked === true || gPe.locked === 1 || gPe.locked === "1") {
                    showXiuToast("该法器已锁定，无法赠送", true);
                    return;
                }
                if (gPe.equippedOn) {
                    showXiuToast("请先卸下法器再赠送", true);
                    return;
                }
            }
        }
        openGiftModal("pet_equip", { petEquipId: petEquipId });
    };

    window.initXiuMarketUI = function () {
        if (!window.DONGTIAN_CLOUD_MODE) return;
        bindGiftModal();
        if (typeof window.ensureCloudMarketBarStructure === "function") {
            window.ensureCloudMarketBarStructure();
        }
        var bar = document.getElementById("xiuMarketBar");
        var btn = document.getElementById("xiuMarketOpenBtn");
        if (bar) bar.style.display = "flex";
        if (btn)
            btn.onclick = function () {
                var m = document.getElementById("xiuMarketModal");
                if (m && m.style.display === "flex") {
                    closeModal();
                } else {
                    openModal();
                }
            };
        var closeBtn = document.getElementById("xiuMarketCloseBtn");
        if (closeBtn) closeBtn.onclick = closeModal;
        var xiuM = document.getElementById("xiuMarketModal");
        if (xiuM && !xiuM._xiuMarketBackdropBound) {
            xiuM._xiuMarketBackdropBound = true;
            xiuM.addEventListener("click", function (ev) {
                if (ev.target === xiuM) closeModal();
            });
        }
        var refBtn = document.getElementById("xiuMarketRefreshBtn");
        if (refBtn) refBtn.onclick = refreshAll;
        var mineChk = document.getElementById("xiuMarketMineOnly");
        if (mineChk)
            mineChk.onchange = function () {
                state.mine = !!mineChk.checked;
                state.page = 1;
                loadList();
            };
        var ft = document.getElementById("xiuMarketFilterType");
        if (ft)
            ft.onchange = function () {
                state.itemType = ft.value || "";
                if (state.itemType === "material" || state.itemType === "pet" || state.itemType === "pet_equip") {
                    state.equipRarity = "";
                    state.equipSlotType = "";
                    state.equipLvlMin = "";
                    state.equipLvlMax = "";
                    var er = document.getElementById("xiuMarketEquipRarity");
                    var est = document.getElementById("xiuMarketEquipSlotType");
                    var emin = document.getElementById("xiuMarketEquipLvlMin");
                    var emax = document.getElementById("xiuMarketEquipLvlMax");
                    if (er) er.value = "";
                    if (est) est.value = "";
                    if (emin) emin.value = "";
                    if (emax) emax.value = "";
                }
                if (state.itemType !== "pet") {
                    state.petKind = "";
                    state.petAgeTier = "";
                    var pk = document.getElementById("xiuMarketPetKind");
                    var pa = document.getElementById("xiuMarketPetAgeTier");
                    if (pk) pk.value = "";
                    if (pa) pa.value = "";
                }
                if (state.itemType !== "pet_equip") {
                    state.peqType = "";
                    state.peqSlot = "";
                    state.peqRarity = "";
                    state.peqLvlMin = "";
                    state.peqLvlMax = "";
                    var pt = document.getElementById("xiuMarketPeqType");
                    var ps = document.getElementById("xiuMarketPeqSlot");
                    var pr = document.getElementById("xiuMarketPeqRarity");
                    var pmin = document.getElementById("xiuMarketPeqLvlMin");
                    var pmax = document.getElementById("xiuMarketPeqLvlMax");
                    if (pt) pt.value = "";
                    if (ps) ps.value = "";
                    if (pr) pr.value = "";
                    if (pmin) pmin.value = "";
                    if (pmax) pmax.value = "";
                }
                state.page = 1;
                updateEquipFilterVisibility();
                updatePetFilterVisibility();
                updatePetEquipFilterVisibility();
                loadList();
            };
        var er = document.getElementById("xiuMarketEquipRarity");
        if (er)
            er.onchange = function () {
                syncEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        var est = document.getElementById("xiuMarketEquipSlotType");
        if (est)
            est.onchange = function () {
                syncEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        var emin = document.getElementById("xiuMarketEquipLvlMin");
        var emax = document.getElementById("xiuMarketEquipLvlMax");
        /** initXiuMarketUI 会被 initDongtianCloudMarketAndArenaUi 多次调用：勿重复 addEventListener，否则输入一次触发 N 次 loadList、内存与卡顿 */
        if (emin && !emin._xiuMarketEquipLvlInputBound) {
            emin._xiuMarketEquipLvlInputBound = true;
            emin.addEventListener("input", scheduleEquipFilterReload);
        }
        if (emax && !emax._xiuMarketEquipLvlInputBound) {
            emax._xiuMarketEquipLvlInputBound = true;
            emax.addEventListener("input", scheduleEquipFilterReload);
        }
        var pk = document.getElementById("xiuMarketPetKind");
        var pa = document.getElementById("xiuMarketPetAgeTier");
        if (pk)
            pk.onchange = function () {
                syncPetFiltersFromDom();
                state.page = 1;
                loadList();
            };
        if (pa)
            pa.onchange = function () {
                syncPetFiltersFromDom();
                state.page = 1;
                loadList();
            };
        var pt = document.getElementById("xiuMarketPeqType");
        var ps = document.getElementById("xiuMarketPeqSlot");
        var pr = document.getElementById("xiuMarketPeqRarity");
        if (pt)
            pt.onchange = function () {
                syncPetEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        if (ps)
            ps.onchange = function () {
                syncPetEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        if (pr)
            pr.onchange = function () {
                syncPetEquipFiltersFromDom();
                state.page = 1;
                loadList();
            };
        var pmin = document.getElementById("xiuMarketPeqLvlMin");
        var pmax = document.getElementById("xiuMarketPeqLvlMax");
        if (pmin && !pmin._xiuMarketPeqLvlInputBound) {
            pmin._xiuMarketPeqLvlInputBound = true;
            pmin.addEventListener("input", scheduleEquipFilterReload);
        }
        if (pmax && !pmax._xiuMarketPeqLvlInputBound) {
            pmax._xiuMarketPeqLvlInputBound = true;
            pmax.addEventListener("input", scheduleEquipFilterReload);
        }
        updateEquipFilterVisibility();
        updatePetFilterVisibility();
        updatePetEquipFilterVisibility();
        var listEl = document.getElementById("xiuMarketList");
        if (listEl && !listEl._xiuMarketInfoDelegated) {
            listEl._xiuMarketInfoDelegated = true;
            listEl.addEventListener(
                "click",
                function (ev) {
                    var ib = ev.target && ev.target.closest ? ev.target.closest(".xiu-market-info-btn") : null;
                    if (!ib || !listEl.contains(ib)) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    openXiuListingInfo(ib.getAttribute("data-listing-id"));
                },
                false
            );
        }
        bindXiuModalPinchGuards();
    };

})();
