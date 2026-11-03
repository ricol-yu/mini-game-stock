/* 三版风格稿整页截图（临时脚本，跑完可删） */
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto('file:///C:/Users/ZhuanZ/WorkBuddy/mini-game-stock/design/style-explore.html');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'C:/Users/ZhuanZ/WorkBuddy/mini-game-stock/design/style-explore.png', fullPage: true });
  await browser.close();
  console.log('done');
})();
