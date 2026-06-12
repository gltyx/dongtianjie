/**
 * 按顺序加载洞天劫脚本；版本号来自 window.__DONGTIAN_ASSET_BUILD（URL ?v= 或主站 API 下发）。
 * 勿再手改 index.html 里每个 ?v=dongtian-embed-XX。
 */
(function () {
    var build = window.__DONGTIAN_ASSET_BUILD;
    if (build == null || build === "") build = "dev";
    var loadNonce = String(Date.now());

    function assetUrl(path) {
        var sep = path.indexOf("?") >= 0 ? "&" : "?";
        return path + sep + "b=" + encodeURIComponent(String(build)) + "&_t=" + loadNonce;
    }

    var scripts = [
        "assets/js/dongtian-cloud.js",
        "assets/js/cnkey.js",
        "assets/js/transcore.js",
        "./assets/js/utility.js",
        "./assets/js/sect-passives.js",
        "./assets/js/xiuxian.js",
        "./assets/js/elements.js",
        "./assets/js/pet.js",
        "./assets/js/dongtian-anticheat-clock.js",
        "./assets/js/player.js",
        "./assets/js/weapon-names-xiuxian.js",
        "./assets/js/enhancement.js",
        "./assets/js/dongtian-material-delta.js",
        "./assets/js/dongtian-forge-local.js",
        "./assets/js/dongtian-forge.js",
        "./assets/js/dongtian-linggen-xuemai.js",
        "./assets/js/dongtian-yuqi.js",
        "./assets/js/dongtian-dungeon-material-drops.js",
        "./assets/js/gems.js",
        "./assets/js/equipment.js",
        "./assets/js/combat.js",
        "./assets/js/titles.js",
        "./assets/js/dungeon.js",
        "./assets/js/enemy-affixes.js",
        "./assets/js/enemy.js",
        "./assets/js/dongtian-sword-spirit-data-bundled.js",
        "./assets/js/dongtian-sword-spirit-local.js",
        "./assets/js/dongtian-sword-spirit.js",
        "./assets/js/dongtian-cloud-save-guard.js",
        "./assets/js/main.js",
        "./assets/js/xiu-market.js",
        "./assets/js/dongtian-gift-inbox.js",
        "./assets/js/wushen-arena.js",
        "./assets/js/dongtian-molong.js",
        "./assets/js/dongtian-lingtian-local.js",
        "./assets/js/dongtian-lingtian.js",
        "./assets/js/dongtian-dragon-tower.js",
        "./assets/js/dongtian-demon-tower.js",
        "./assets/js/dongtian-divine-realm.js",
        "./assets/js/dongtian-spirit-beast-realm.js",
        "./assets/js/dongtian-ghost-realm.js",
        "./assets/js/dongtian-alchemy-local.js",
        "./assets/js/dongtian-alchemy.js",
        "./assets/js/dongtian-pet-equipment.js",
        "./assets/js/dongtian-hub-menu.js",
        "./assets/js/dongtian-shitu.js",
        "./assets/js/dongtian-zongmen.js",
        "./assets/js/dongtian-treasure-map-local.js",
        "./assets/js/dongtian-treasure-map.js",
        "./assets/js/dongtian-stock-local.js",
        "./assets/js/dongtian-stock.js",
    ];

    function loadAt(i) {
        if (i >= scripts.length) return;
        var s = document.createElement("script");
        s.src = assetUrl(scripts[i]);
        s.async = false;
        s.onload = function () {
            loadAt(i + 1);
        };
        s.onerror = function () {
            loadAt(i + 1);
        };
        document.body.appendChild(s);
    }

    loadAt(0);
})();
