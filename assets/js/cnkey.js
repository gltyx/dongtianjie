// 英文字符串 → 中文（供界面替换脚本使用）
var cnItems = {
    _OTHER_: [],

    //未分类：
    'HP': '气血',
    'ATK': '力道',
    'DEF': '护体',
    'ATK.SPD': '身法',
    'Remnant Razor': '残墟斩痕',
    'Titan\'s Will': '巨灵残响',
    'Devastator': '崩域狂刃',
    'Blade Dance': '剑影轮舞',
    'Paladin\'s Heart': '圣誓心壁',
    'Aegis Thorns': '棘环反噬',
    'Rampager': '狂岚叠刃',
    'Equip': '披甲',
    'Close': '关闭',
    'Unequip': '褪甲',
    'ATK.SPD提升': '身法提升',
    'C.DMG提升': '暴伤提升',
    'C.RATE提升': '会心提升',
    'HP提升': '气血提升',
    'VAMP提升': '吸血提升',
    'DEF提升': '护体提升',
    'ATK提升': '力道提升',
    'Etherbound': '界壁宝',
    'StellarSign': '星斗印',
    'Nullforge': '太虚胚',
    'Chronarch': '光阴器',
    'Apexother': '劫外道兵',
    '': '',

}


//需处理的前缀
var cnPrefix = {
    "Common": "凡尘器",
    "Uncommon": "蕴灵胚",
    "Rare": "玄纹铸",
    "Epic": "地脉珍",
    "Legendary": "天敕珍",
    "Heirloom": "古遗宝",
    "Etherbound": "界壁宝",
    "StellarSign": "星斗印",
    "Nullforge": "太虚胚",
    "Chronarch": "光阴器",
    "Apexother": "劫外道兵",
    " Plate Lv.": "板甲 Lv.",
    " Sword Lv.": "剑 Lv.",
    " Axe Lv.": "斧 Lv.",
    " Hammer Lv.": "锤 Lv.",
    " Dagger Lv.": "匕首 Lv.",
    " Flail Lv.": "连枷 Lv.",
    " Scythe Lv.": "镰刀 Lv.",
    " Tower Lv.": "塔盾 Lv.",
    " Kite Lv.": "轻盾 Lv.",
    " Buckler Lv.": "圆盾 Lv.",
    " Great Helm Lv.": "重盔 Lv.",
    " Horned Helm Lv.": "角盔 Lv.",
    " Chain Lv.": "链甲 Lv.",
    " Leather Lv.": "皮甲 Lv.",
    "HP+": "气血+",
    "C.DMG+": "暴伤+",
    "VAMP+": "吸血+",
    "DEF+": "护体+",
    "ATK.SPD+": "身法+",
    "ATK+": "力道+",
    "C.RATE+": "会心+",
    "提升HP ": "气血提升",
    "提升ATK.SPD ": "身法提升",
    "提升C.DMG ": "暴伤提升",
    "提升C.RATE ": "会心提升",
    "提升VAMP ": "吸血提升",
    "提升DEF ": "护体提升",
    "提升ATK ": "力道提升",
    "你从祝福获得HP": "天眷灌注气血",
    "你从祝福获得ATK.SPD": "天眷灌注身法",
    "你从祝福获得C.DMG": "天眷灌注暴伤",
    "你从祝福获得C.RATE": "天眷灌注会心",
    "你从祝福获得VAMP": "天眷灌注吸血",
    "你从祝福获得DEF": "天眷灌注护体",
    "你从祝福获得ATK": "天眷灌注力道",
    "": "",
}

//需处理的后缀
var cnPostfix = {
    "(Paladin's Heart)": "(圣誓心壁)",
    "(Remnant Razor)": "(残墟斩痕)",
    "(Titan\'s Will)": "(巨灵残响)",
    "(Devastator)": "(崩域狂刃)",
    "(Blade Dance)": "(剑影轮舞)",
    "(Aegis Thorns)": "(棘环反噬)",
    "(Rampager)": "(狂岚叠刃)",
    "damage.": "伤痕.",
    "crit ": "暴击",
    " Plate": "板甲",
    " Sword": "剑",
    " Axe": "斧",
    " Hammer": "锤",
    " Dagger": "匕首",
    " Flail": "连枷",
    " Scythe": "镰刀",
    " Tower": "塔盾",
    " Kite": "轻盾",
    " Buckler": "圆盾",
    " Great Helm": "重盔",
    " Horned Helm": "角盔",
    " Chain": "链甲",
    " Leather": "皮甲",
    "": "",
}

//需排除的，正则匹配
var cnExcludeWhole = [
    /^x?\d+(\.\d+)?[A-Za-z%]{0,2}(\s.C)?\s*$/, //12.34K,23.4 °C
    /^x?\d+(\.\d+)?(e[+\-]?\d+)?\s*$/, //12.34e+4
    /^\s*$/, //纯空格
    /^\d+(\.\d+)?[A-Za-z]{0,2}.?\(?([+\-]?(\d+(\.\d+)?[A-Za-z]{0,2})?)?$/, //12.34M (+34.34K
    /^(\d+(\.\d+)?[A-Za-z]{0,2}\/s)?.?\(?([+\-]?\d+(\.\d+)?[A-Za-z]{0,2})?\/s\stot$/, //2.74M/s (112.4K/s tot
    /^\d+(\.\d+)?(e[+\-]?\d+)?.?\(?([+\-]?(\d+(\.\d+)?(e[+\-]?\d+)?)?)?$/, //2.177e+6 (+4.01+4
    /^(\d+(\.\d+)?(e[+\-]?\d+)?\/s)?.?\(?([+\-]?(\d+(\.\d+)?(e[+\-]?\d+)?)?)?\/s\stot$/, //2.177e+6/s (+4.01+4/s tot
];
var cnExcludePostfix = [
    /:?\s*x?\d+(\.\d+)?(e[+\-]?\d+)?\s*$/, //12.34e+4
    /:?\s*x?\d+(\.\d+)?[A-Za-z]{0,2}$/, //: 12.34K, x1.5
]

//正则替换，带数字的固定格式句子
//纯数字：(\d+)
//逗号：([\d\.,]+)
//小数点：([\d\.]+)
//原样输出的字段：(.+)
var cnRegReplace = new Map([
    [/^Increases letters per click by (.+). Also gives the ability to manually generate letters.$/, '每次点击可将信件增加$1。还提供了手动生成信件的功能。'],
    [/^Increases deliveries per click by 1 every (.+) seconds.$/, '每 $1 秒将每次点击的投放量提高1。'],
    [/^Generates 3 Pigeons every (.+) seconds at no cost.$/, '每 $1 秒免费产生3鸽子。'],
    [/^Delivers 1 letter every (.+) seconds.$/, '每 $1 秒发送1个信件。'],
    [/^Generates 1 letter every (.+) seconds.$/, '每 $1 秒产生1个信件。'],
    [/^Generates 1 Mailbox every (.+) seconds at no cost.$/, '每 $1 秒免费生成1个信箱。'],
    [/^Generates 1 Mailman and Factory every (.+) seconds at no cost.$/, '每 $1 秒免费产生1个邮递员和工厂。'],
    [/^Deliver 1 letter every (.+) seconds. Pigeons do not get more expensive.$/, '每 $1 秒发送1个信件。 鸽子不会变得更昂贵。'],
    [/^Deliveries per click multiplied by 2. If Bootstrap was selected in Phase 1 then the Boostrap increment will be multiplied by 2.$/, '每次点击的投放数乘以2。如果在阶段1中选择了引导程序，则引导程序的增量将乘以2。'],
    [/^workers: (\d+)\/$/, '工人：$1\/'],

]);
