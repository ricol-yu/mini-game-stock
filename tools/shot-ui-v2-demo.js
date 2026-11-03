/* UI v2 定稿样张整页截图 */
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto('file:///C:/Users/ZhuanZ/WorkBuddy/mini-game-stock/design/ui-v2-demo.html');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'C:/Users/ZhuanZ/WorkBuddy/mini-game-stock/design/ui-v2-demo.png', fullPage: true });
  const box = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  console.log('page size', JSON.stringify(box));
  await browser.close();
})();
