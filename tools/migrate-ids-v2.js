#!/usr/bin/env node
/**
 * 一次性迁移：cards.json  c001..c063  →  语义 id + schema v2 字段
 *
 * 用法：node tools/migrate-ids-v2.js
 *
 * 为什么显式列 63 个映射而不是写自动生成规则？
 *   语义 id 一旦定下就永不改（关联卡、素材 manifest 都会引用它），
 *   自动规则生成的东西看起来聪明，但无法人工审查。
 *   这份表就是「命名定案」，迁移完成后此文件保留作历史记录，不再运行。
 *
 * schema v2 新增字段：
 *   whoId   人物/主体标识（拼音小写），N4 素材 manifest 的锚点 —— 全量写入
 *   window  出现日期窗口 [起,止]（1..60），缺省 = 全程
 *   weight  抽取权重（0.1..10），缺省 = 1        —— 注：prototype 选卡逻辑尚未
 *   once    单局最多出现 1 次，缺省 = false         消费这四个字段（N3 实装），
 *   hidden  隐藏卡（图鉴剪影），缺省 = false        本迁移只入库 + 过校验
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'cards.json');

/* ---------- 语义 id 定案（与旧顺序一一对应，共 63 条） ---------- */
const ID_MAP = [
  'fam_mortgage_01',    // c001 老婆·房贷
  'fam_tutor_01',       // c002 老婆·补习班
  'fam_confess_01',     // c003 老婆·问亏损
  'fam_dinner_01',      // c004 老婆·吃饭
  'fam_pregnant_01',    // c005 老婆·怀孕
  'fam_divorce_01',     // c006 老婆·离婚
  'fam_daughter_01',    // c007 女儿·看手机
  'fam_parentmeet_01',  // c008 老师·家长会
  'fam_hospital_01',    // c009 老妈·住院
  'fam_eldermoney_01',  // c010 老妈·养老钱
  'fam_inlaws_01',      // c011 丈母娘·闲钱
  'fam_fever_01',       // c012 孩子·发烧
  'fam_babysfirst_01',  // c013 孩子·叫爸爸
  'fam_rent_01',        // c014 房东·涨租
  'work_layoff_01',     // c015 老板·优化
  'work_options_01',    // c016 老板·期权
  'work_fired_01',      // c017 HR·被裁
  'work_jobhunt_01',    // c018 招聘软件·已读不回
  'work_offer_01',      // c019 老同事·降薪 offer
  'work_gossip_01',     // c020 同事·茶水间聊票
  'work_tip_01',        // c021 同事小王·表哥内幕
  'work_overtime_01',   // c022 项目·通宵
  'inc_salary_01',      // c023 工资
  'inc_sidejob_01',     // c024 私活
  'inc_bonus_01',       // c025 年终奖
  'soc_wedding_01',     // c026 朋友·结婚随礼
  'soc_lend_01',        // c027 朋友·借钱
  'soc_reunion_01',     // c028 同学·聚会
  'soc_banquet_01',     // c029 张阿姨·寿宴
  'soc_scam_01',        // c030 老同学·稳赚项目
  'soc_whisper_01',     // c031 饭局·耳边消息
  'self_checkup_01',    // c032 体检报告
  'self_night_01',      // c033 凌晨三点
  'self_mirror_01',     // c034 镜子
  'self_weekend_01',    // c035 周末
  'self_hairloss_01',   // c036 地漏
  'self_birthday_01',   // c037 生日
  'mkt_easing_01',      // c038 银行·放水
  'mkt_macro_01',       // c039 新闻·美联储
  'mkt_policy_01',      // c040 新闻联播
  'mkt_earnings_01',    // c041 公司公告·盈利降
  'mkt_insidersell_01', // c042 公司公告·减持
  'dec_takeprofit_01',  // c043 你的票·涨了卖不卖
  'dec_stoploss_01',    // c044 你的票·止损
  'dec_limitup_01',     // c045 你的票·涨停
  'mkt_bubble_01',      // c046 所有人·泡沫起点
  'mkt_fomo_01',        // c047 所有人·阿姨荐股
  'mkt_paperwin_01',    // c048 你的票·泡沫浮盈
  'mkt_crisis_01',      // c049 新闻头条·危机起点
  'mkt_panic_01',       // c050 公司群·裁员传闻
  'mkt_halt_01',        // c051 交易所·停牌起
  'mkt_haltwait_01',    // c052 交易所·停牌中
  'risk_margin_01',     // c053 配资公司
  'risk_loanad_01',     // c054 网贷广告
  'risk_card_01',       // c055 信用卡
  'risk_scam_01',       // c056 荐股群
  'risk_influencer_01', // c057 大 V
  'risk_leak_01',       // c058 微信群·内幕
  'risk_callmargin_01', // c059 券商短信·追保
  'risk_repay_01',      // c060 你的债
  'risk_dca_01',        // c061 网友·定投
  'risk_scoreboard_01', // c062 年度账单
  'acc_cat_01',         // c063 你的猫
];

/* ---------- whoId 定案（人物/主体 → 素材锚点） ---------- */
const WHO_ID = {
  '老婆': 'laopo', '女儿': 'nver', '老师': 'laoshi', '老妈': 'laoma',
  '丈母娘': 'zhangmuniang', '孩子': 'haizi', '房东': 'fangdong',
  '老板': 'laoban', 'HR': 'hr', '招聘软件': 'zhaopin', '老同事': 'laotongshi',
  '同事': 'tongshi', '同事小王': 'tongshi_xiaowang', '项目': 'xiangmu',
  '工资': 'gongzi', '私活': 'sihuo', '年终奖': 'nianzhongjiang',
  '朋友': 'pengyou', '同学': 'tongxue', '张阿姨': 'zhangayi',
  '老同学': 'laotongxue', '饭局': 'fanju', '体检报告': 'tijian',
  '凌晨三点': 'lingsan', '镜子': 'jingzi', '周末': 'zhoumo',
  '地漏': 'dilou', '生日': 'shengri', '银行': 'yinhang', '新闻': 'xinwen',
  '新闻联播': 'xinwenlianbo', '公司公告': 'gongsi_gonggao', '你的票': 'nidepiao',
  '所有人': 'suoyouren', '新闻头条': 'xinwentoutiao', '公司群': 'gongsiqun',
  '交易所': 'jiaoyisuo', '配资公司': 'peizigongsi', '网贷广告': 'wangdai',
  '信用卡': 'xinyongka', '荐股群': 'jianguqun', '大 V': 'dawei',
  '微信群': 'weixinqun', '券商短信': 'quanshang', '你的债': 'nidezhai',
  '网友': 'wangyou', '年度账单': 'nianduzhangdan', '你的猫': 'nidemao',
};

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
if (data.cards.length !== ID_MAP.length) {
  console.error(`✗ 卡数不匹配：json ${data.cards.length} vs 映射表 ${ID_MAP.length}，拒绝迁移`);
  process.exit(1);
}

// 幂等保护：已经是语义 id 就不重复迁移
if (!/^c\d{3}$/.test(data.cards[0].id)) {
  console.error('✗ 第一张卡不是 c001 格式，看起来已迁移过，拒绝重复执行');
  process.exit(1);
}

const seen = new Set();
data.cards.forEach((c, i) => {
  const nid = ID_MAP[i];
  if (seen.has(nid)) { console.error('✗ 映射表内 id 重复：' + nid); process.exit(1); }
  seen.add(nid);
  c.id = nid;
  c.whoId = WHO_ID[c.who] || null;
  if (!c.whoId) { console.error(`✗ ${nid} 的 who「${c.who}」没有 whoId 映射`); process.exit(1); }
  // window / weight / once / hidden 缺省即默认值，不写入，保持 JSON 干净
});

data.version = 'v3-schema2';
data.source = 'data/cards.json';
data.total = data.cards.length;

fs.writeFileSync(SRC, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('✓ 已迁移 ' + data.cards.length + ' 张卡 → 语义 id + whoId（schema v2）');
console.log('  示例：c001 → ' + ID_MAP[0] + '；c063 → ' + ID_MAP[62]);
console.log('  下一步：node tools/sync-json-to-prototype.js && node tools/validate-cards.js');
