#!/usr/bin/env node
/**
 * 一次性插入：2026-10-26 第四轮「让钱有去处」
 *   ① 8 张花钱卡（手机屏碎、牙、眼镜、空调、押一付三、爸妈手机、老婆年假、电动车被偷）
 *   ② 1 张离场确认卡（urgent）：上岸不再自动触发
 *
 * 用法：node tools/add-spend-cards.js   （可重复执行，已存在则跳过）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.resolve(__dirname, '..', 'data', 'cards.json');
const data = JSON.parse(fs.readFileSync(P, 'utf8'));
const have = new Set(data.cards.map(c => c.id));

const NEW = [
  /* ---- 花钱卡：每一张都是「掏钱保住某样东西，还是省下钱让它坏着」 ---- */
  {
    id: 'life_phone_01', who: '手机', whoId: 'shouji', avatar: '📱', tag: '自己',
    text: '手机掉在地上，屏幕裂成一张网。',
    left: { label: '贴张膜凑合用', effects: { mind: -5, social: -3, risk: 3 } },
    right: { label: '换块屏，1,800', effects: { spend: 1800, mind: 5, energy: -4 } },
  },
  {
    id: 'life_tooth_01', who: '牙医', whoId: 'yisheng', avatar: '🦷', tag: '自己',
    text: '后槽牙疼了三天，半边脸都肿了。',
    left: { label: '吃止痛药顶着', effects: { mind: -7, energy: -6, risk: 2 } },
    right: { label: '拔了，4,200', effects: { spend: 4200, mind: 6, energy: -8 } },
  },
  {
    id: 'life_glasses_01', who: '你自己', whoId: 'ziji', avatar: '👓', tag: '自己',
    text: '眼镜腿断了。看盘时数字重出两个影子。',
    left: { label: '用胶带缠一缠', effects: { mind: -4, social: -3, risk: 3 } },
    right: { label: '配副新的，2,600', effects: { spend: 2600, mind: 4, energy: -5 } },
  },
  {
    id: 'life_aircon_01', who: '你自己', whoId: 'ziji', avatar: '🌡', tag: '房子',
    text: '空调半夜罢工，屋里 33 度。',
    left: { label: '开着风扇扛', effects: { mind: -6, energy: -10, social: -3 } },
    right: { label: '换台新的，3,400', effects: { spend: 3400, mind: 6, energy: -6 } },
  },
  {
    id: 'life_deposit_01', who: '房东', whoId: 'fangdong', avatar: '🏠', tag: '房子',
    text: '房东说下季度起押一付三，得先补上。',
    left: { label: '跟他掰扯半天', effects: { mind: -6, social: -5, risk: 3 } },
    right: { label: '补 4,800', effects: { spend: 4800, mind: -3, social: 2 } },
  },
  {
    id: 'life_parents_01', who: '老妈', whoId: 'laoma', avatar: '👵', tag: '家人',
    text: '我妈说手机卡得打不开视频了。说了两遍。',
    left: { label: '教她清内存', effects: { social: 3, mind: -3, energy: -8 } },
    right: { label: '买台新的，2,300', effects: { spend: 2300, social: 9, mind: 5 } },
  },
  {
    id: 'life_travel_01', who: '老婆', whoId: 'laopo', avatar: '💍', tag: '伴侣',
    text: '她说年假再不休就作废了。', when: 'did:fam_hunli_01', window: [45, 320],
    left: { label: '让她自己去吧', effects: { mind: -6, social: -9 } },
    right: { label: '一起去，6,800', effects: { spend: 6800, mind: 12, social: 10, energy: -10 } },
  },
  {
    id: 'life_ebike_01', who: '你自己', whoId: 'ziji', avatar: '🛵', tag: '房子',
    text: '楼下电动车的锁被剪断了。',
    left: { label: '以后挤地铁', effects: { mind: -4, energy: -12, social: -2 } },
    right: { label: '再买一台，2,800', effects: { spend: 2800, mind: 2, energy: -5 } },
  },

  /* ---- 关键卡：上岸确认 ----
     条件是「清仓 + 无债 + 现金 3 万」，也就是原来 check() 里自动判的那一行。
     区别在于：现在它只说明"你可以走了"，走不走由玩家自己滑。
     urgent = 不走袋子，条件满足就插队来问；隔两天再问，一局最多问 4 次。 */
  {
    id: 'self_exit_01', who: '你自己', whoId: 'ziji', avatar: '🌅', tag: '决策',
    text: '账上全是现金，一分没欠。今晚它又涨了。',
    when: 'equity<1; debt<1; cash>30000', urgent: true, cap: 4,
    left: { label: '再玩两天', effects: { mind: 4, risk: 6, energy: -2 } },
    right: { label: '收手，删掉 App', effects: { mind: 5, social: 5, energy: -8 } },
  },
];

let added = 0;
NEW.forEach(c => {
  if (have.has(c.id)) { console.log('· 跳过（已存在）：' + c.id); return; }
  const full = {
    id: c.id, who: c.who, whoId: c.whoId, avatar: c.avatar, tag: c.tag, text: c.text,
    when: c.when || null, alwaysStatus: null,
  };
  if (c.window) full.window = c.window;
  if (c.cap) full.cap = c.cap;
  if (c.urgent) full.urgent = true;
  full.left = c.left; full.right = c.right;
  data.cards.push(full);
  added++;
  console.log('+ ' + c.id + '　' + c.text);
});

fs.writeFileSync(P, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('\n✓ 新增 ' + added + ' 张，卡池共 ' + data.cards.length + ' 张 → ' + P);
