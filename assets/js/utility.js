// Format large numbers
const nFormatter = (num) => {
    let lookup = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "M" },
        { value: 1e9, symbol: "B" },
        { value: 1e12, symbol: "T" },
        { value: 1e15, symbol: "P" },
        { value: 1e18, symbol: "E" }
    ];
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    let item = lookup.slice().reverse().find(function (item) {
        return num >= item.value;
    });
    return item ? (num / item.value).toFixed(2).replace(rx, "$1") + item.symbol : "0";
}

/** 灵石获取倍率（1 为原版，0.5 为入账减半；仅作用于收入，不影响花费） */
var PLAYER_GOLD_GAIN_MULT = 0.5;

/** 身法实效倍率（1 为原版；1/3 即整体身法削弱三倍，出手间隔约为原来三倍） */
var PLAYER_ATKSPD_EFFECT_MULT = 1;

/** 供 calculateStats / 塑道界面共用：读倍率并兼容曾误缓存的 1/3（否则先天 0.11 会显示成 0.06） */
function getPlayerAtkSpdEffectMult() {
    var m = typeof PLAYER_ATKSPD_EFFECT_MULT === "number" ? PLAYER_ATKSPD_EFFECT_MULT : 1;
    if (!isFinite(m) || m <= 0) return 1;
    if (Math.abs(m - 1 / 3) < 1e-5) return 1;
    return m;
}

function applyGoldGainMult(amount) {
    var n = Number(amount);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.round(n * PLAYER_GOLD_GAIN_MULT));
}

// Get a randomized number between 2 integers
const randomizeNum = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.round(Math.floor(Math.random() * (max - min + 1)) + min); //The maximum is inclusive and the minimum is inclusive 
}

// Get a randomized decimal between 2 numbers
const randomizeDecimal = (min, max) => {
    return Math.random() * (max - min) + min;
}

/** 数字等级 → 修仙境界文案：炼气～渡劫各十层，之后真仙、金仙…，再高为鸿蒙第N阶 */
function cultivationRealmLabel(lvl) {
    const n = Math.max(1, Math.floor(Number(lvl)) || 1);
    const baseRealms = ["炼气", "筑基", "金丹", "元婴", "化神", "炼虚", "合体", "大乘", "渡劫"];
    if (n <= 90) {
        const idx = Math.floor((n - 1) / 10);
        const layer = ((n - 1) % 10) + 1;
        return `${baseRealms[idx]}·${layer}层`;
    }
    const postRealms = ["真仙", "金仙", "大罗", "混元", "道祖", "超脱", "圣人", "天尊"];
    const rest = n - 91;
    const maxPost = postRealms.length * 10;
    if (rest < maxPost) {
        const pi = Math.floor(rest / 10);
        const layer = (rest % 10) + 1;
        return `${postRealms[pi]}·${layer}层`;
    }
    return `鸿蒙·第${n - 90 - maxPost}阶`;
}

/** 遗器品阶（存档仍用英文 rarity，界面显示修仙品名） */
var EQUIPMENT_RARITY_ZH = {
    Common: "凡尘器",
    Uncommon: "蕴灵胚",
    Rare: "玄纹铸",
    Epic: "地脉珍",
    Legendary: "天敕珍",
    Heirloom: "古遗宝",
    Etherbound: "界壁宝",
    StellarSign: "星斗印",
    Nullforge: "太虚胚",
    Chronarch: "光阴器",
    Apexother: "劫外道兵"
};

function equipmentRarityLabel(key) {
    if (!key) return "";
    return EQUIPMENT_RARITY_ZH[key] || key;
}