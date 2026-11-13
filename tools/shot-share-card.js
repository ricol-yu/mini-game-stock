/* 结局战绩分享卡 · 五套模板样张整页截图
   用法：node tools/shot-share-card.js
   输出：design/share-card-demo.png（整页，2x）          */
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({
    viewport: { width: 1780, height: 1200 },
    deviceScaleFactor: 2,
  });
  const file = 'file:///' + path.resolve(__dirname, '../design/share-card-demo.html').replace(/\\/g, '/');
  await page.goto(file, { waitUntil: 'load' });
  // 等字体与两张 webp 落地，否则 T5 会拍成空白
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.resolve(__dirname, '../design/share-card-demo.png'),
    fullPage: true,
  });
  const box = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    imgs: [...document.images].map(i => ({ src: i.currentSrc.split('/').pop(), w: i.naturalWidth, h: i.naturalHeight })),
  }));
  console.log('page size', JSON.stringify({ w: box.w, h: box.h }));
  console.log('imgs', JSON.stringify(box.imgs));
  await browser.close();
})();
