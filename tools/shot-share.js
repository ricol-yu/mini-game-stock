#!/usr/bin/env node
/**
 * 结局战绩分享卡 · 自验截图
 * 构造 5 个不同结局（覆盖 T1–T5 五套模板）的状态，每个结局点一次「存图」，
 * 把生成的 canvas 存成 .shots/share-T1.png ~ share-T5.png。
 * 另拍 390/320 两个宽度的结局页入口（fx=0），检查分享槽不挤压主按钮、不撑出滚动条。
 *
 * 用法：node tools/shot-share.js
 * UA 用 iPhone：强制走「长按保存面板」路径，避免桌面端每次点存图都触发真实下载。
 */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

/* 5 个结局 → 5 套模板的「最省事」状态构造：直接改 S 再调 check()。
   注意 debt/creditLimit 的关系：借不动了（≥creditLimit）会抢先判成穿仓，
   所以 T4 复利葬礼的债要 < 额度（net>0 也不会进穿仓分支）。 */
const CASES = [
  { file: 'share-T1.png', tpl: 'T1', name: '快进快出',
    setup: () => { S.tut = 3; reset(); S.day = 50; S.cash = 82000; S.equity = 0; S.debt = 0; S.trades = 41; S.risk = 20; check(); } },
  { file: 'share-T2.png', tpl: 'T2', name: '温水煮蛙',
    setup: () => { S.tut = 3; reset(); S.day = 45; S.cash = 6000; S.equity = 0; S.debt = 0; S.trades = 30; S.flags.lossStreak = 25; S.mdd = 0.35; check(); } },
  { file: 'share-T3.png', tpl: 'T3', name: '穿仓',
    setup: () => { S.tut = 3; reset(); S.day = 47; S.cash = 0; S.equity = 0; S.debt = creditLimit(); S.trades = 96; S.risk = 92; S.mdd = 0.71; check(); } },
  { file: 'share-T4.png', tpl: 'T4', name: '复利葬礼',
    setup: () => { S.tut = 3; reset(); S.day = 61; S.cash = 5000; S.equity = 0; S.debt = 5000; S.trades = 96; S.flags.intPaid = 110000; S.risk = 66; check(); } },
  { file: 'share-T5.png', tpl: 'T5', name: '两个人',
    setup: () => { S.tut = 3; reset(); S.day = 70; S.cash = 34000; S.equity = 0; S.debt = 0; S.trades = 18; S.did.fam_wed_day_01 = 'l'; S.social = 72; S.mind = 55; check(); } },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--allow-file-access-from-files'],   // file:// 下画 scene webp 不污染画布，toDataURL 才可用
  });
  const iphone = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  };
  let fail = 0;

  for (const c of CASES) {
    const ctx = await browser.newContext(iphone);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const url = 'file:///' + path.resolve(ROOT, 'prototype.html').replace(/\\/g, '/') + '?clean=1';
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(c.setup);
    await page.waitForTimeout(1700);              // 预生成 1200ms + 绘制

    const ended = await page.evaluate(() => ({ name: (document.getElementById('o-t') || {}).textContent, slot: (document.getElementById('sh-tx') || {}).textContent }));
    await page.click('#sh-slot');                 // 「存图」→ 生成 → 长按面板（iPhone UA）
    await page.waitForTimeout(1500);

    const res = await page.evaluate(async () => {
      const cv = document.getElementById('shareCv');
      const hold = document.getElementById('sh-hold');
      const img = document.getElementById('sh-hold-img');
      // 面板里的 blob 图：能 fetch、尺寸是 1080×1440
      let holdOK = false, holdW = 0, holdH = 0, holdErr = '', src = '';
      if (img && img.src) {
        src = img.src.slice(0, 40);
        if (img.src.startsWith('blob:')) {
          try {
            const b = await (await fetch(img.src)).blob();
            const bmp = await createImageBitmap(b);
            holdW = bmp.width; holdH = bmp.height; holdOK = bmp.width === 1080 && bmp.height === 1440;
          } catch (e) { holdErr = String(e && e.message || e).slice(0, 80); }
        }
      }
      return {
        holdVisible: !!(hold && !hold.hidden), holdOK, holdW, holdH, holdErr, src,
        backing: { w: cv.width, h: cv.height },
      };
    });
    /* 用同一套绘制管线在 1:1 画布上重画一张，取 1080×1440 的 dataURL 存盘 */
    const data = await page.evaluate(() => new Promise(resolve => {
      let out = window.__shotCv;
      if (!out) { out = document.createElement('canvas'); out.width = 1080; out.height = 1440; window.__shotCv = out; }
      const octx = out.getContext('2d');
      const keepCv = _shCv, keepDpr = _shDpr;
      _shCv = out; _shDpr = 1;
      shDrawCard(octx, SHARE.data, function () {
        _shCv = keepCv; _shDpr = keepDpr;
        try { resolve(out.toDataURL('image/png')); } catch (e) { resolve('ERR:' + e.message); }
      });
    }));
    const ok64 = data.startsWith('data:image/png');
    const png = Buffer.from(ok64 ? data.split(',')[1] : '', 'base64');
    res.head = data.slice(0, 30);
    if (!png.length || !ok64) {
      fail++;
      console.log(`  ✗ ${c.tpl} ${c.name} → 画布导出失败 ${res.head}`);
    } else {
      fs.writeFileSync(path.join(OUT, c.file), png);
      console.log(`  ✓ ${c.tpl} ${c.name} → ${(png.length / 1024).toFixed(0)}KB  面板:${res.holdVisible ? '开' : '关'} blob图:${res.holdOK ? `${res.holdW}x${res.holdH}` : (res.holdErr || 'src=' + res.src)}  导出画布:${res.backing.w}x${res.backing.h}`);
    }
    if (errors.length) { fail++; console.log('    页面异常: ' + errors.join(' | ').slice(0, 300)); }
    if (ended.name !== c.name) { fail++; console.log(`    ✗ 结局不是 ${c.name}，是 ${ended.name}（分享槽文案：${ended.slot}）`); }
    else console.log(`    结局页分享槽文案：${ended.slot}`);
    await ctx.close();
  }

  /* 入口布局检查：390 / 320 两个宽度 + fx=0，分享槽不挤压主按钮、不撑出滚动条 */
  for (const [w, h] of [[390, 844], [320, 568]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const url = 'file:///' + path.resolve(ROOT, 'prototype.html').replace(/\\/g, '/') + '?clean=1&fx=0';
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => { S.tut = 3; reset(); S.day = 40; S.cash = 0; S.equity = 0; S.debt = creditLimit(); check(); });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), rgt: Math.round(b.right), h: Math.round(b.height) }; };
      const ec = document.querySelector('.endcard');
      return {
        ob: r('o-b'), home: r('o-home'), slot: r('sh-slot'),
        /* 横向溢出才是分享槽会引入的风险（竖向 scrollHeight 超 viewport 是 .legend
           的既有行为，与结局页无关，见 prototype.html clean 模式说明） */
        overflowX: document.documentElement.scrollWidth > innerWidth,
        cardScroll: ec.scrollHeight - ec.clientHeight,
        slotText: (document.getElementById('sh-tx') || {}).textContent,
        iconHidden: document.getElementById('sh-ico').style.display === 'none',
      };
    });
    const overlap = m.slot.l < m.home.rgt - 2;
    const ctaOK = m.ob.b <= h && m.ob.t >= 0;
    const foldOK = w < 360 ? (m.slotText === '存图' && m.iconHidden) : true;
    console.log(`  ${w}x${h} 入口：主CTA ${m.ob.t}~${m.ob.b}${ctaOK ? ' 首屏内' : ' 溢出!'} · 槽 ${m.slot.l}~${m.slot.rgt} 文案「${m.slotText}」图标${m.iconHidden ? '隐藏' : '显示'}${w < 360 ? '（320 应强制折叠）' : ''} · 重叠:${overlap ? '有!' : '无'} · 横向溢出:${m.overflowX ? '有!' : '无'} · 卡内滚动:${m.cardScroll > 0 ? m.cardScroll + 'px' : '无'}`);
    if (overlap || m.overflowX || !ctaOK || !foldOK) fail++;
    await page.screenshot({ path: path.join(OUT, `_share-entry-${w}.png`) });
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `\n✗ shot-share 有 ${fail} 处失败` : '\n✓ shot-share 全部通过');
  process.exit(fail ? 1 : 0);
})();
