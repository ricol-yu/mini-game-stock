/* 动效自检：不只看「类挂上了」，还要看「动画真的在跑、位移真的发生了」。
   用法：node tools/shot-fx.js  → .shots/fx-*.png + 控制台断言 */
const { chromium } = require('playwright-core');
const B = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const U = 'file:///C:/Users/ZhuanZ/WorkBuddy/mini-game-stock/prototype.html?clean=1';
(async () => {
  const b = await chromium.launch({ executablePath: B });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto(U);
  await p.waitForTimeout(600);
  // 开局页入场（.intro-card 的 overPop）
  console.log('intro anim =', await p.evaluate(() => getComputedStyle(document.querySelector('.intro-card')).animationName));
  await p.screenshot({ path: '.shots/fx-0-intro.png' });
  await p.click('#i-b'); await p.waitForTimeout(500);

  // 发牌：刚 nextCard 后 60ms 读卡片动画
  const deal = await p.evaluate(() => {
    const c = document.querySelector('#stage .card:not(.under):not(.under2)');
    return { anim: getComputedStyle(c).animationName, cls: c.className };
  });
  console.log('deal =', JSON.stringify(deal));

  // 拖到阈值：印章应弹一下（fx-lock）
  const r = await p.evaluate(() => {
    const c = document.querySelector('#stage .card:not(.under):not(.under2)');
    const b = c.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
  });
  await p.mouse.move(r.x, r.y); await p.mouse.down();
  await p.mouse.move(r.x + 30, r.y, { steps: 4 }); await p.waitForTimeout(60);
  const s1 = await p.evaluate(() => {
    const L = document.querySelector('.stamp.L'), R = document.querySelector('.stamp.R');
    return { L: L && L.className, R: R && R.className, Lop: L && L.style.opacity, Rop: R && R.style.opacity };
  });
  console.log('drag 30px =', JSON.stringify(s1));
  await p.mouse.move(r.x + Math.round(r.w * 0.30), r.y, { steps: 6 }); await p.waitForTimeout(50);
  const s2 = await p.evaluate(() => {
    const L = document.querySelector('.stamp.L'), R = document.querySelector('.stamp.R');
    return { R: R && R.className, Rop: R && R.style.opacity,
             cardT: document.querySelector('#stage .card:not(.under):not(.under2)').style.transform };
  });
  console.log('past threshold =', JSON.stringify(s2));
  await p.screenshot({ path: '.shots/fx-1-drag.png' });

  // 松手出牌：卡片飞出 + 屏震
  await p.mouse.up();
  const fly = await p.evaluate(() => ({
    card: getComputedStyle(document.querySelector('#stage .card:not(.under):not(.under2)') || document.body).transform,
    phone: getComputedStyle(document.querySelector('.phone')).animationName,
    phoneT: getComputedStyle(document.querySelector('.phone')).transform
  }));
  console.log('fly =', JSON.stringify(fly));
  await p.screenshot({ path: '.shots/fx-2-fly.png' });

  // 连打 12 张，抓各种触发（涨停/扣命/欠款）
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(430);
    const rr = await p.evaluate(() => {
      const c = document.querySelector('#stage .card:not(.under):not(.under2)');
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
    });
    if (!rr) break;
    await p.mouse.move(rr.x, rr.y); await p.mouse.down();
    await p.mouse.move(rr.x + Math.round(rr.w * 0.3), rr.y, { steps: 5 });
    await p.mouse.up();
    const st = await p.evaluate(() => ({
      phone: getComputedStyle(document.querySelector('.phone')).animationName,
      mkt: getComputedStyle(document.querySelector('#mkt')).animationName,
      vit: [].map.call(document.querySelectorAll('.vit-i'), e => getComputedStyle(e).animationName).join('|'),
      net: document.getElementById('v-net').textContent
    }));
    if (st.phone !== 'none' || st.mkt !== 'none' || st.vit.indexOf('u2') >= 0)
      console.log('day', i + 1, JSON.stringify(st));
  }
  await p.waitForTimeout(400);
  await p.screenshot({ path: '.shots/fx-3-late.png' });

  // ?fx=0 对照：屏震类永不挂
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p2.goto(U + '&fx=0'); await p2.waitForTimeout(400);
  await p2.click('#i-b'); await p2.waitForTimeout(500);
  console.log('fx=0 →', JSON.stringify(await p2.evaluate(() => ({
    off: document.documentElement.className,
    cardAnim: getComputedStyle(document.querySelector('.card')).animationDuration
  }))));
  await b.close();
})();
