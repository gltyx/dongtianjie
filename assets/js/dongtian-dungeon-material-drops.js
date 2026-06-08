/**
 * 洞天劫 · 秘境斗法额外材料掉落（神萃石、御器材料包）
 * 与藏宝图相同：击杀邪修独立 3% 判定；置之不理连战 5 场、登龙塔/魔神塔等特殊战斗不掉。
 */
(function () {
    "use strict";

    var DUNGEON_GOD_ESSENCE_DROP_CHANCE = 0.03;
    var DUNGEON_YUQI_PACK_DROP_CHANCE = 0.03;

    function shouldSkipDungeonCombatMaterialDrop() {
        try {
            if (typeof window.isDongtianTowerCombatSession === "function" && window.isDongtianTowerCombatSession()) {
                return true;
            }
        } catch (eTower) {}
        return false;
    }

    function logMaterialDrop(context, html) {
        if (context === "combat" && typeof addCombatLog === "function") addCombatLog(html);
        else if (context === "dungeon" && typeof addDungeonLog === "function") addDungeonLog(html);
    }

    function persistStandaloneMaterialDrop() {
        if (typeof saveData === "function" && !(typeof window !== "undefined" && window.DONGTIAN_CLOUD_MODE)) {
            saveData();
        }
    }

    function godEssenceStoneId() {
        if (typeof MATERIAL_GOD_ESSENCE_STONE !== "undefined") return MATERIAL_GOD_ESSENCE_STONE;
        if (typeof window !== "undefined" && window.MATERIAL_GOD_ESSENCE_STONE) return window.MATERIAL_GOD_ESSENCE_STONE;
        return "god_essence_stone";
    }

    function godEssenceStoneZh() {
        if (typeof MATERIAL_GOD_ESSENCE_STONE_ZH !== "undefined") return MATERIAL_GOD_ESSENCE_STONE_ZH;
        if (typeof window !== "undefined" && window.MATERIAL_GOD_ESSENCE_STONE_ZH) {
            return window.MATERIAL_GOD_ESSENCE_STONE_ZH;
        }
        return "神萃石";
    }

    function yuqiPackId() {
        if (typeof window !== "undefined" && typeof window.MATERIAL_YUQI_PACK === "string") {
            return window.MATERIAL_YUQI_PACK;
        }
        return "yuqi_material_pack";
    }

    function yuqiPackZh() {
        if (typeof window !== "undefined" && typeof window.MATERIAL_YUQI_PACK_ZH === "string") {
            return window.MATERIAL_YUQI_PACK_ZH;
        }
        return "御器材料包";
    }

    window.tryRollGodEssenceStoneDrop = function (context) {
        if (shouldSkipDungeonCombatMaterialDrop()) return false;
        if (typeof player === "undefined" || !player) return false;
        if (Math.random() >= DUNGEON_GOD_ESSENCE_DROP_CHANCE) return false;
        if (typeof addMaterial !== "function") return false;
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        addMaterial(godEssenceStoneId(), 1);
        var zh = godEssenceStoneZh();
        logMaterialDrop(
            context,
            '<span class="Legendary">劫尘凝萃！</span>得<span class="Legendary">' + zh + "</span> ×1。"
        );
        persistStandaloneMaterialDrop();
        return true;
    };

    window.tryRollYuqiMaterialPackDrop = function (context) {
        if (shouldSkipDungeonCombatMaterialDrop()) return false;
        if (typeof player === "undefined" || !player) return false;
        if (Math.random() >= DUNGEON_YUQI_PACK_DROP_CHANCE) return false;
        if (typeof addMaterial !== "function") return false;
        if (typeof ensureInventoryMaterials === "function") ensureInventoryMaterials();
        addMaterial(yuqiPackId(), 1);
        var zh = yuqiPackZh();
        logMaterialDrop(
            context,
            '<span class="Rare">灵屑归匣！</span>得<span class="Rare">' + zh + "</span> ×1。"
        );
        persistStandaloneMaterialDrop();
        return true;
    };

    window.DUNGEON_GOD_ESSENCE_DROP_CHANCE = DUNGEON_GOD_ESSENCE_DROP_CHANCE;
    window.DUNGEON_YUQI_PACK_DROP_CHANCE = DUNGEON_YUQI_PACK_DROP_CHANCE;
})();
