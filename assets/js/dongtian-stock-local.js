/**
 * 洞天劫 · 修仙股票 · 单机本地逻辑（由 dongtian-stock-api.js 移植）
 */
(function () {
    'use strict';

    var TICK_MS = 10 * 60 * 1000;
    var HISTORY_MAX = 72;
    var SHOCK_MAX = 0.02;
    var MEAN_REVERT = 0.015;
    var MIN_PRICE_RATIO = 0.55;
    var MAX_PRICE_RATIO = 1.85;
    var LEDGER_MAX = 80;
    var GLOBAL_LEDGER_MAX = 50;
    var QTY_HARD_CEIL = 9007199254740990;
    var LOCAL_MARKET_KEY = 'dongtianStockLocalMarket_v1';
    var MATERIAL_YUQI_PACK = 'yuqi_material_pack';
    /** 单机商场：每档御器材料包数量（与联网版一致 ×50） */
    var SHOP_YUQI_PACK_AMOUNT = 50;

    var STOCK_CATALOG = [
        { id: 'daluo', code: 'DLF', name: '大罗符宗', sector: '符箓', basePrice: 158000000, desc: '符道至尊，一张符箓可镇一界气运。' },
        { id: 'lingyuan', code: 'LXY', name: '灵元仙酿', sector: '灵植', basePrice: 38, desc: '灵植酿制，低阶修士亦可问津的入门仙股。' },
        { id: 'gulong', code: 'GLK', name: '古龙矿脉', sector: '矿脉', basePrice: 168000, desc: '矿脉深处龙气未绝，灵石产出稳定。' },
        { id: 'yuxu', code: 'YXB', name: '玉虚宝阁', sector: '奇珍', basePrice: 220, desc: '奇珍异宝汇聚，价格波动随天机而动。' },
        { id: 'hunyuan', code: 'HYH', name: '混元商行', sector: '综合', basePrice: 4800000, desc: '五域通商，综合指数型仙股龙头。' },
        { id: 'wanxiang', code: 'WXM', name: '万象灵市', sector: '综合', basePrice: 3680, desc: '包罗万象的坊市联盟，适合分散布局。' },
        { id: 'fengling', code: 'FLF', name: '风灵符宗', sector: '符箓', basePrice: 95, desc: '符箓新秀，涨跌灵敏。' },
        { id: 'dengxian', code: 'DXF', name: '登仙洞府', sector: '洞府', basePrice: 12500000, desc: '洞府地产龙头，仙府稀缺性支撑高价。' },
        { id: 'taiyin', code: 'TYF', name: '太阴符海', sector: '符箓', basePrice: 42300, desc: '太阴符力如潮，中阶符道代表。' },
        { id: 'cangjing', code: 'CJX', name: '藏经仙阁', sector: '功法', basePrice: 175, desc: '功法典籍流通，随悟道热潮起伏。' },
        { id: 'guixu', code: 'GXK', name: '归墟矿髓', sector: '矿脉', basePrice: 358000000, desc: '归墟遗矿，亿级基准的硬核矿脉股。' },
        { id: 'taiji', code: 'TJZ', name: '太极阵门', sector: '阵法', basePrice: 128, desc: '阵法入门派系，走势偏稳。' },
        { id: 'lingxiao', code: 'LXF', name: '凌霄仙府', sector: '洞府', basePrice: 2650000, desc: '凌霄之上仙府拍卖，百万级洞府蓝筹。' },
        { id: 'zixiao', code: 'ZXQ', name: '紫霄炼器', sector: '器修', basePrice: 1250, desc: '千级器修代表，炼器景气风向标。' },
        { id: 'tianxu', code: 'TXD', name: '天虚丹坊', sector: '丹道', basePrice: 68, desc: '丹道老字号，低价位高流动性。' },
        { id: 'hongmeng', code: 'HMD', name: '鸿蒙丹境', sector: '丹道', basePrice: 36800000, desc: '鸿蒙丹火不熄，千万级丹道核心资产。' },
        { id: 'qingyun', code: 'QYJ', name: '青云剑阁', sector: '器修', basePrice: 256, desc: '剑修圣地，器修板块人气股。' },
        { id: 'xinghe', code: 'XHK', name: '星河矿脉', sector: '矿脉', basePrice: 356000, desc: '星河矿带开采权，十万级矿脉精品。' },
        { id: 'chixiao', code: 'CXJ', name: '赤霄剑派', sector: '器修', basePrice: 15600, desc: '万级器修先锋，剑意炽烈波动大。' },
        { id: 'xuanbing', code: 'XBL', name: '玄冰灵矿', sector: '矿脉', basePrice: 142, desc: '寒脉灵矿，四季供需分明。' },
        { id: 'tiandao', code: 'TDZ', name: '天道阵眼', sector: '阵法', basePrice: 428000000, desc: '阵眼枢纽，亿级阵法至尊股。' },
        { id: 'wuxing', code: 'WXS', name: '五行商行', sector: '综合', basePrice: 108, desc: '五行均衡，适合新手练手。' },
        { id: 'jiuzhuan', code: 'JZT', name: '九转丹塔', sector: '丹道', basePrice: 8900, desc: '近万基准丹塔股，中级丹道热门。' },
        { id: 'taigu', code: 'TGC', name: '太古藏经', sector: '功法', basePrice: 720000, desc: '太古功法残卷，十万级功法蓝筹。' },
        { id: 'yuanshi', code: 'YSB', name: '元始宝坛', sector: '奇珍', basePrice: 520000000, desc: '元始遗宝，全仙市最高基准之一。' },
        { id: 'wanshou', code: 'WSY', name: '万兽灵园', sector: '灵植', basePrice: 98500, desc: '灵植灵兽共育，万级灵植成长股。' },
        { id: 'hundun', code: 'HDB', name: '混沌宝阙', sector: '奇珍', basePrice: 1380000, desc: '混沌奇珍，百万级收藏型仙股。' },
        { id: 'wuji', code: 'WJY', name: '无极剑域', sector: '器修', basePrice: 88000000, desc: '剑域开辟，千万级器修旗舰。' },
        { id: 'longmai', code: 'LMD', name: '龙脉洞府', sector: '洞府', basePrice: 388, desc: '龙脉洞府开发，中低价位洞府股。' },
        { id: 'taichu', code: 'TCL', name: '太初灵根', sector: '灵植', basePrice: 268000000, desc: '太初灵根复苏，亿级灵植概念龙头。' },
    ];

    var STOCK_BY_ID = {};
    for (var si = 0; si < STOCK_CATALOG.length; si++) {
        STOCK_BY_ID[STOCK_CATALOG[si].id] = STOCK_CATALOG[si];
    }

    var SHOP_CATALOG = [
        { id: 'shop_1e6', goldCost: 1000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e7', goldCost: 10000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e8', goldCost: 100000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e9', goldCost: 1000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e10', goldCost: 10000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_5e10', goldCost: 50000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e11', goldCost: 100000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_5e11', goldCost: 500000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e12', goldCost: 1000000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_5e12', goldCost: 5000000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e13', goldCost: 10000000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_5e13', goldCost: 50000000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_1e14', goldCost: 100000000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
        { id: 'shop_5e14', goldCost: 500000000000000, yuqiMaterialPack: SHOP_YUQI_PACK_AMOUNT },
    ];
    var SHOP_BY_ID = {};
    for (var qi = 0; qi < SHOP_CATALOG.length; qi++) {
        SHOP_BY_ID[SHOP_CATALOG[qi].id] = SHOP_CATALOG[qi];
    }

    function roundPrice(n) {
        return Math.round(Number(n) * 100) / 100;
    }

    function round2(n) {
        return roundPrice(n);
    }

    function clampPrice(price, basePrice) {
        var lo = basePrice * MIN_PRICE_RATIO;
        var hi = basePrice * MAX_PRICE_RATIO;
        return roundPrice(Math.max(lo, Math.min(hi, price)));
    }

    function alignTickAnchor(ts) {
        return Math.floor(Number(ts) / TICK_MS) * TICK_MS;
    }

    function parseShanghai(ms) {
        var d = new Date(typeof ms === 'number' && isFinite(ms) ? ms : Date.now());
        var tp = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(d);
        function pick(t) {
            var x = tp.find(function (p) {
                return p.type === t;
            });
            return x ? Number(x.value) : 0;
        }
        var Y = pick('year');
        var M = pick('month');
        var D = pick('day');
        var h = pick('hour');
        var mi = pick('minute');
        return { Y: Y, M: M, D: D, h: h, mi: mi, mins: h * 60 + mi };
    }

    function formatYmd(y, m, d) {
        return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function stockCycleKey(ms) {
        var p = parseShanghai(ms);
        if (p.mins >= 12 * 60 + 1) return formatYmd(p.Y, p.M, p.D);
        var jd = new Date(Date.UTC(p.Y, p.M - 1, p.D));
        jd.setUTCDate(jd.getUTCDate() - 1);
        return formatYmd(jd.getUTCFullYear(), jd.getUTCMonth() + 1, jd.getUTCDate());
    }

    function stockNextResetAt(ms) {
        var p = parseShanghai(ms);
        var ty = p.Y;
        var tm = p.M;
        var td = p.D;
        if (p.mins >= 12 * 60 + 1) {
            var jd = new Date(Date.UTC(p.Y, p.M - 1, p.D));
            jd.setUTCDate(jd.getUTCDate() + 1);
            ty = jd.getUTCFullYear();
            tm = jd.getUTCMonth() + 1;
            td = jd.getUTCDate();
        }
        return Date.UTC(ty, tm - 1, td, 4, 1, 0);
    }

    function initMarketRow(def) {
        var p = roundPrice(def.basePrice);
        return { price: p, prevPrice: p, history: Array.from({ length: 12 }, function () { return p; }), updatedAt: Date.now() };
    }

    function normalizeMarket(raw) {
        var out = raw && typeof raw === 'object' ? raw : {};
        var dirty = !raw || typeof raw !== 'object' || !raw.stocks;
        if (!out.stocks || typeof out.stocks !== 'object') out.stocks = {};
        for (var i = 0; i < STOCK_CATALOG.length; i++) {
            var def = STOCK_CATALOG[i];
            if (!out.stocks[def.id] || typeof out.stocks[def.id] !== 'object') {
                out.stocks[def.id] = initMarketRow(def);
                dirty = true;
                continue;
            }
            var row = out.stocks[def.id];
            var bp = def.basePrice;
            row.price = clampPrice(Number(row.price) || bp, bp);
            row.prevPrice = clampPrice(Number(row.prevPrice) || row.price, bp);
            if (!Array.isArray(row.history) || !row.history.length) {
                row.history = [row.price];
                dirty = true;
            } else {
                row.history = row.history
                    .map(function (v) { return clampPrice(Number(v) || row.price, bp); })
                    .slice(-HISTORY_MAX);
            }
            row.updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : Date.now();
        }
        if (typeof out.lastTickAt !== 'number' || !isFinite(out.lastTickAt)) {
            out.lastTickAt = alignTickAnchor(Date.now());
            dirty = true;
        }
        if (!Array.isArray(out.globalLedger)) {
            out.globalLedger = [];
            dirty = true;
        } else if (out.globalLedger.length > GLOBAL_LEDGER_MAX) {
            out.globalLedger = out.globalLedger.slice(-GLOBAL_LEDGER_MAX);
            dirty = true;
        }
        if (dirty) out._marketDirty = true;
        out.updatedAt = Date.now();
        return out;
    }

    function loadMarket() {
        try {
            var raw = localStorage.getItem(LOCAL_MARKET_KEY);
            if (raw) return normalizeMarket(JSON.parse(raw));
        } catch (eLoad) {}
        return normalizeMarket({});
    }

    function persistMarket(data) {
        var m = normalizeMarket(data || {});
        m.updatedAt = Date.now();
        try {
            localStorage.setItem(LOCAL_MARKET_KEY, JSON.stringify(m));
        } catch (eSave) {}
        return m;
    }

    function tickOneStock(row, def) {
        var cur = Number(row.price) || def.basePrice;
        var pull = ((def.basePrice - cur) / def.basePrice) * MEAN_REVERT;
        var shock = (Math.random() * 2 - 1) * SHOCK_MAX;
        row.prevPrice = cur;
        row.price = clampPrice(cur * (1 + pull + shock), def.basePrice);
        if (!Array.isArray(row.history)) row.history = [];
        row.history.push(row.price);
        if (row.history.length > HISTORY_MAX) row.history = row.history.slice(-HISTORY_MAX);
        row.updatedAt = Date.now();
    }

    function applyMarketTicks(now) {
        var m = loadMarket();
        var ts = typeof now === 'number' ? now : Date.now();
        var last = typeof m.lastTickAt === 'number' ? m.lastTickAt : alignTickAnchor(ts);
        var ticks = 0;
        while (ts - last >= TICK_MS && ticks < 48) {
            for (var i = 0; i < STOCK_CATALOG.length; i++) {
                tickOneStock(m.stocks[STOCK_CATALOG[i].id], STOCK_CATALOG[i]);
            }
            last += TICK_MS;
            ticks += 1;
        }
        m.lastTickAt = last;
        if (ticks > 0 || m._marketDirty) {
            delete m._marketDirty;
            m = persistMarket(m);
        }
        return m;
    }

    function pctChange(cur, prev) {
        var c = Number(cur);
        var p = Number(prev);
        if (!isFinite(c) || !isFinite(p) || p <= 0) return 0;
        return round2(((c - p) / p) * 100);
    }

    function profitPctFrom(profit, basis) {
        var pl = Number(profit);
        var b = Number(basis);
        if (!isFinite(pl) || !isFinite(b) || b <= 0) return null;
        return round2((pl / b) * 100);
    }

    function ensurePlayerStockShape(p) {
        if (!p.dongtianStock || typeof p.dongtianStock !== 'object') p.dongtianStock = {};
        var s = p.dongtianStock;
        if (!s.holdings || typeof s.holdings !== 'object') s.holdings = {};
        if (!s.costBasis || typeof s.costBasis !== 'object') s.costBasis = {};
        if (!Array.isArray(s.ledger)) s.ledger = [];
        if (typeof s.realizedProfit !== 'number' || !isFinite(s.realizedProfit)) s.realizedProfit = 0;
        return s;
    }

    function readPlayerGold(p) {
        return typeof p.gold === 'number' && isFinite(p.gold) ? Math.max(0, Math.floor(p.gold)) : 0;
    }

    function readPlayerDisplayName(p) {
        var n = p && p.name != null ? String(p.name).trim() : '';
        if (n) return n.slice(0, 24);
        return '本座修士';
    }

    function readPlayerPublicId(p) {
        if (!p || typeof p !== 'object') return null;
        var id = Math.floor(Number(p.dongtianPublicId));
        if (isFinite(id) && id >= 1 && id <= 10000) return id;
        return null;
    }

    function ensureMaterials(p) {
        if (!p.inventory || typeof p.inventory !== 'object') p.inventory = {};
        if (!p.inventory.materials || typeof p.inventory.materials !== 'object') p.inventory.materials = {};
        return p.inventory.materials;
    }

    function getYuqiPackCount(p) {
        var mats = ensureMaterials(p);
        return Math.max(0, Math.floor(Number(mats[MATERIAL_YUQI_PACK]) || 0));
    }

    function addYuqiPack(p, n) {
        var amt = Math.max(0, Math.floor(Number(n) || 0));
        if (amt <= 0) return;
        var mats = ensureMaterials(p);
        mats[MATERIAL_YUQI_PACK] = Math.max(0, Math.floor(Number(mats[MATERIAL_YUQI_PACK]) || 0)) + amt;
    }

    function ensureShopPurchases(p) {
        var s = ensurePlayerStockShape(p);
        if (!s.shop || typeof s.shop !== 'object') s.shop = {};
        var ck = stockCycleKey(Date.now());
        if (s.shop.cycleKey !== ck) {
            s.shop.cycleKey = ck;
            s.shop.bought = {};
        }
        if (!s.shop.bought || typeof s.shop.bought !== 'object') s.shop.bought = {};
        return s.shop.bought;
    }

    function buildShopPayload(p) {
        var gold = p ? readPlayerGold(p) : 0;
        var bought = p ? ensureShopPurchases(p) : {};
        var products = SHOP_CATALOG.map(function (def) {
            var wasBought = !!(bought && bought[def.id]);
            return {
                id: def.id,
                goldCost: def.goldCost,
                yuqiMaterialPack: def.yuqiMaterialPack,
                networkCoin: def.yuqiMaterialPack,
                bought: wasBought,
                canBuy: !wasBought && gold >= def.goldCost,
            };
        });
        return {
            ok: true,
            cycleKey: stockCycleKey(Date.now()),
            nextResetAt: stockNextResetAt(Date.now()),
            serverNow: Date.now(),
            playerGold: gold,
            yuqiMaterialPack: p ? getYuqiPackCount(p) : 0,
            networkCoin: p ? getYuqiPackCount(p) : 0,
            products: products,
            rules: { dailyLimitPerProduct: 1, resetNote: '北京时间每日 12:01 刷新限购' },
            localMode: true,
        };
    }

    function buildStockPublicRow(def, row) {
        var price = roundPrice(row.price);
        var prev = roundPrice(row.prevPrice);
        return {
            id: def.id,
            code: def.code,
            name: def.name,
            sector: def.sector,
            basePrice: def.basePrice,
            desc: def.desc || '',
            price: price,
            prevPrice: prev,
            changePct: pctChange(price, prev),
            history: Array.isArray(row.history) ? row.history.slice(-HISTORY_MAX) : [price],
        };
    }

    function buildPortfolio(p, market) {
        var s = ensurePlayerStockShape(p);
        var positions = [];
        var marketValue = 0;
        var costTotal = 0;
        Object.keys(s.holdings).forEach(function (id) {
            var def = STOCK_BY_ID[id];
            if (!def) return;
            var qty = Math.max(0, Math.floor(Number(s.holdings[id]) || 0));
            if (qty <= 0) return;
            var row = market.stocks[id];
            var price = row ? roundPrice(row.price) : def.basePrice;
            var prevPrice = row ? roundPrice(row.prevPrice) : price;
            var basis = Math.max(0, Math.floor(Number(s.costBasis[id]) || 0));
            var mv = Math.floor(qty * price);
            var pl = mv - basis;
            var todayPl = Math.floor(qty * (price - prevPrice));
            marketValue += mv;
            costTotal += basis;
            positions.push({
                id: id,
                code: def.code,
                name: def.name,
                sector: def.sector,
                qty: qty,
                price: price,
                prevPrice: prevPrice,
                avgCost: qty > 0 ? roundPrice(basis / qty) : 0,
                costBasis: basis,
                marketValue: mv,
                profit: pl,
                profitPct: profitPctFrom(pl, basis),
                todayProfit: todayPl,
                todayProfitPct: pctChange(price, prevPrice),
                changePct: pctChange(price, prevPrice),
            });
        });
        positions.sort(function (a, b) { return b.marketValue - a.marketValue; });
        var unrealizedProfit = marketValue - costTotal;
        var realizedProfit = Math.floor(Number(s.realizedProfit) || 0);
        var gold = readPlayerGold(p);
        var totalAssets = gold + marketValue;
        return {
            gold: gold,
            holdings: s.holdings,
            positions: positions,
            marketValue: marketValue,
            costTotal: costTotal,
            totalAssets: totalAssets,
            unrealizedProfit: unrealizedProfit,
            unrealizedProfitPct: profitPctFrom(unrealizedProfit, costTotal),
            realizedProfit: realizedProfit,
            totalStockProfit: unrealizedProfit + realizedProfit,
            cashRatio: totalAssets > 0 ? round2((gold / totalAssets) * 100) : 0,
            stockRatio: totalAssets > 0 ? round2((marketValue / totalAssets) * 100) : 0,
        };
    }

    function buildStatePayload() {
        if (typeof player === 'undefined' || !player) {
            return { ok: false, message: '无存档' };
        }
        var market = applyMarketTicks(Date.now());
        var nextTickAt = (typeof market.lastTickAt === 'number' ? market.lastTickAt : Date.now()) + TICK_MS;
        var stocks = STOCK_CATALOG.map(function (def) {
            return buildStockPublicRow(def, market.stocks[def.id]);
        });
        return {
            ok: true,
            tickIntervalMs: TICK_MS,
            lastTickAt: market.lastTickAt,
            nextTickAt: nextTickAt,
            serverNow: Date.now(),
            stocks: stocks,
            portfolio: buildPortfolio(player, market),
            globalLedger: Array.isArray(market.globalLedger) ? market.globalLedger.slice(-GLOBAL_LEDGER_MAX).reverse() : [],
            catalog: STOCK_CATALOG.map(function (d) {
                return { id: d.id, code: d.code, name: d.name, sector: d.sector, basePrice: d.basePrice, desc: d.desc || '' };
            }),
            stockCount: STOCK_CATALOG.length,
            rules: { unifiedMarket: true, tradeMovesPrice: false, tradeImpactNote: '单机天机行情，每 10 分钟波动' },
            localMode: true,
        };
    }

    function pushGlobalLedger(market, entry) {
        if (!market || typeof market !== 'object') return;
        if (!Array.isArray(market.globalLedger)) market.globalLedger = [];
        market.globalLedger.push(entry);
        if (market.globalLedger.length > GLOBAL_LEDGER_MAX) {
            market.globalLedger = market.globalLedger.slice(-GLOBAL_LEDGER_MAX);
        }
    }

    function persistLocalSave() {
        if (typeof saveData === 'function') saveData();
        if (typeof updateStats === 'function') updateStats();
        if (typeof showInventory === 'function') showInventory();
    }

    function handleTrade(body) {
        if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
        var stockId = String(body && body.stockId != null ? body.stockId : '').trim();
        var side = String(body && body.side != null ? body.side : '').trim().toLowerCase();
        var qty = Math.floor(Number(body && body.qty));
        var def = STOCK_BY_ID[stockId];
        if (!def) return { ok: false, message: '无效股票' };
        if (side !== 'buy' && side !== 'sell') return { ok: false, message: '请选择买入或卖出' };
        if (!isFinite(qty) || qty <= 0) return { ok: false, message: '请输入有效数量' };
        if (qty > QTY_HARD_CEIL) return { ok: false, message: '数量超出系统上限' };

        var market = applyMarketTicks(Date.now());
        var row = market.stocks[stockId];
        var price = row ? roundPrice(row.price) : def.basePrice;
        var p = player;
        var s = ensurePlayerStockShape(p);
        var gold = readPlayerGold(p);
        var tradeSummary = null;

        if (side === 'buy') {
            var cost = Math.ceil(qty * price);
            if (cost <= 0) return { ok: false, message: '交易金额无效' };
            if (gold < cost) return { ok: false, message: '灵石不足，需要 ' + cost + ' 灵石' };
            p.gold = gold - cost;
            s.holdings[stockId] = Math.max(0, Math.floor(Number(s.holdings[stockId]) || 0)) + qty;
            s.costBasis[stockId] = Math.max(0, Math.floor(Number(s.costBasis[stockId]) || 0)) + cost;
            tradeSummary = { side: side, stockId: stockId, qty: qty, price: price, amount: cost };
        } else {
            var have = Math.max(0, Math.floor(Number(s.holdings[stockId]) || 0));
            if (have < qty) return { ok: false, message: '持仓不足，当前持有 ' + have + ' 股' };
            var proceeds = Math.floor(qty * price);
            if (proceeds <= 0) return { ok: false, message: '卖出金额无效' };
            var basisTotal = Math.max(0, Math.floor(Number(s.costBasis[stockId]) || 0));
            var basisSold = have > 0 ? Math.floor((basisTotal * qty) / have) : 0;
            p.gold = gold + proceeds;
            var left = have - qty;
            if (left <= 0) {
                delete s.holdings[stockId];
                delete s.costBasis[stockId];
            } else {
                s.holdings[stockId] = left;
                s.costBasis[stockId] = Math.max(0, basisTotal - basisSold);
            }
            tradeSummary = { side: side, stockId: stockId, qty: qty, price: price, amount: proceeds, profit: proceeds - basisSold };
            s.realizedProfit = Math.floor(Number(s.realizedProfit) || 0) + (proceeds - basisSold);
        }

        if (!Array.isArray(s.ledger)) s.ledger = [];
        s.ledger.push({
            side: side,
            stockId: stockId,
            code: def.code,
            name: def.name,
            qty: qty,
            price: price,
            amount: tradeSummary.amount,
            profit: tradeSummary.profit != null ? tradeSummary.profit : undefined,
            at: Date.now(),
        });
        if (s.ledger.length > LEDGER_MAX) s.ledger = s.ledger.slice(-LEDGER_MAX);

        pushGlobalLedger(market, {
            playerName: readPlayerDisplayName(p),
            playerPublicId: readPlayerPublicId(p),
            side: side,
            stockId: stockId,
            code: def.code,
            name: def.name,
            sector: def.sector,
            qty: qty,
            price: price,
            amount: tradeSummary.amount,
            at: Date.now(),
        });
        persistMarket(market);
        persistLocalSave();

        var payload = buildStatePayload();
        var verb = side === 'buy' ? '买入' : '卖出';
        payload.ok = true;
        payload.trade = tradeSummary;
        payload.playerGold = readPlayerGold(p);
        payload.message = verb + '成功：' + def.name + ' ×' + qty + '，单价 ' + price + ' 灵石，合计 ' + tradeSummary.amount + ' 灵石';
        return payload;
    }

    function handleShopBuy(body) {
        if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
        var productId = String(body && body.productId != null ? body.productId : '').trim();
        var product = SHOP_BY_ID[productId];
        if (!product) return { ok: false, message: '无效商品' };
        var bought = ensureShopPurchases(player);
        if (bought[productId]) return { ok: false, message: '今日已兑换过该商品，请等待 12:01 刷新' };
        var gold = readPlayerGold(player);
        if (gold < product.goldCost) return { ok: false, message: '灵石不足，需要 ' + product.goldCost + ' 灵石' };
        player.gold = gold - product.goldCost;
        bought[productId] = true;
        addYuqiPack(player, product.yuqiMaterialPack);
        persistLocalSave();
        var statePayload = buildStatePayload();
        var shop = buildShopPayload(player);
        statePayload.shop = shop;
        statePayload.purchase = { productId: productId, goldCost: product.goldCost, yuqiMaterialPack: product.yuqiMaterialPack };
        statePayload.playerGold = readPlayerGold(player);
        statePayload.yuqiMaterialPack = getYuqiPackCount(player);
        statePayload.message = '兑换成功：消耗 ' + product.goldCost + ' 灵石，获得御器材料包 ×' + product.yuqiMaterialPack;
        return statePayload;
    }

    function handleLeaderboard() {
        if (typeof player === 'undefined' || !player) return { ok: false, message: '无存档' };
        var market = applyMarketTicks(Date.now());
        var pf = buildPortfolio(player, market);
        var row = {
            rank: 1,
            score: pf.totalAssets,
            totalAssets: pf.totalAssets,
            gold: pf.gold,
            marketValue: pf.marketValue,
            displayName: readPlayerDisplayName(player),
            playerName: readPlayerDisplayName(player),
            playerPublicId: readPlayerPublicId(player),
        };
        return { ok: true, list: [row], queryRank: row, metric: 'totalAssets', localMode: true };
    }

    function handleLocalApi(method, path, body) {
        try {
            var p = String(path || '');
            if (method === 'GET') {
                if (p.indexOf('/leaderboard') >= 0) return handleLeaderboard();
                if (p.indexOf('/shop') >= 0) return buildShopPayload(typeof player !== 'undefined' ? player : null);
                if (p.indexOf('/state') >= 0) return buildStatePayload();
            }
            if (method === 'POST') {
                if (p.indexOf('/shop/buy') >= 0) return handleShopBuy(body);
                if (p.indexOf('/trade') >= 0) return handleTrade(body);
            }
            return { ok: false, message: '不支持的操作' };
        } catch (e) {
            return { ok: false, message: (e && e.message) || '修仙股票操作失败' };
        }
    }

    window.dongtianStockIsLocalMode = function () {
        return !window.DONGTIAN_CLOUD_MODE;
    };

    window.dongtianStockLocalApi = function (method, path, body) {
        return Promise.resolve(handleLocalApi(method, path, body));
    };
})();
