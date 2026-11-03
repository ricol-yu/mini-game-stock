#!/usr/bin/env node
/**
 * UI v2 四档截图自检（320×568 / 375×667 / 390×844 / 430×932）
 *
 * 用法：node tools/shot-v2.js [--art0] [--only=320]
 *   --art0  额外截一组 ?art=0（无图占位态），用于核对「占位态与有图态版式一致」
 *   每档两张：第 1 天 / 滑 6 天后（滑卡用 mouse 拖 #stage 的主卡，与真机手势同一条链路）
 *
 * 产出：.shots/v2-<w>x<h>-d1.png / -d6.png（--art0 则加 -art0 后缀）
 * 同时打印每档的实测布局数字（stage / mkt / art / 卡片是否溢出），便于和
 * docs/design/ui-adaptation.md §1.3 的高度分配表对账。
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIEWS = [[320, 568], [375, 667], [390, 844], [430, 932]];
const args = process.argv.slice(2);
const ART0 = args.includes('--art0');
const ONLY = (args.find((a) => a.indexOf('--only=') === 0) || '').split('=')[1];
const TIER = args.includes('--tier');   // 扫降级区间（stage 140~260），验「正文不被裁 + tape 显隐正确」

function fileUrl(artOn) {
  return 'file:///' + path.join(ROOT, 'prototype.html').replace(/\\/g, '/') +
    '?clean=1' + (artOn ? '' : '&art=0');
}

async function swipe(page, dir) {
  const card = page.locator('#stage .card:last-child');
  const box = await card.boundingBox();
  if (!box) throw new Error('no card to swipe');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = dir > 0 ? 200 : -200;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx * 0.4, cy, { steps: 6 });
  await page.mouse.move(cx + dx, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(640);          // 出牌 340ms + 下一张入场
}

const stats = (page) => page.evaluate(() => {
  const g = (s) => document.querySelector(s);
  const r = (el) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
  const ph = g('.phone');
  const card = g('#stage .card:last-child');
  const txt = card && card.querySelector('.txt');
  const art = card && card.querySelector('.art');
  const lab = g('#tape .u2-tape-lab');
  const labK = lab && lab.querySelector('.u2-lab-k');
  return {
    stage: Math.round(ph.getAttribute('data-stage') || 0),
    deg: ph.className.replace(/\s*clean/, '').trim() || '-',
    navH: r(g('.nav')), hudH: r(g('.hud')), stripH: r(g('.strip')),
    mktH: r(g('.mkt')), tapeH: r(g('#tape')), stageH: r(g('#stage')),
    cardH: r(card), artH: r(art), txtH: r(txt),
    // 卡面是否溢出（文字被裁 = 版式崩，必须为 false）
    clipped: !!(card && card.scrollHeight > card.clientHeight + 1),
    textClipped: !!(txt && txt.scrollHeight > txt.clientHeight + 1),
    // 图区三态：模式（flat/person/scene/none）、锚点类 .short、渲染出的图层数
    artMode: art ? art.getAttribute('data-mode') : '-',
    artShort: !!(art && /\bshort\b/.test(art.className)),
    artLayers: art ? art.querySelectorAll('img').length : 0,
    // 角标：宽 <375 时「今 ▲」这类定语应被 CSS 藏掉，只剩数值
    lab: lab ? (lab.textContent || '').trim() : '-',
    labKOn: !!(labK && getComputedStyle(labK).display !== 'none'),
    // 松手阈值（卡宽 × 0.22，clamp 64~94）：320→65 / 375→75 / 390→79 / 430→88
    th: typeof dragThreshold === 'function' && card ? dragThreshold(card) : 0,
    day: (g('#v-day') || {}).textContent,
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const out = [];
  if (TIER) {
    /* 降级阶梯回归：375 宽、屏高 470~590 逐档扫，stage 落在 140~240（deg1~deg6 全都可能踩到）
       的档位出图存 .shots/_tier-*.png。判据：cardClip / txtClip 必须全 false——
       96 地板时代的裁字洞（正文第三行切一半）就是在这个区间炸出来的。
       口径提醒：本模式用的是**真 viewport**（newContext 的 viewport，不是改 .phone 高度），
       而 stageH 由 .phone.clientHeight 反推，两种方式实测同值（375×530 都是 stage 202）；
       所以图里的 tape 显隐、deg 类都是真判定结果，可以直接拿这张图对账阶梯——
       375 档 tape 归 deg2（stage<270）管，不是 <360 的宽度规则（那条只管 320 档）。 */
    for (const H of [470, 490, 510, 530, 550, 570, 590]) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: H }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(fileUrl(true));
      await page.waitForTimeout(400);
      await page.click('#i-b');
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => {
        const g = (x) => document.querySelector(x);
        const ph = g('.phone');
        const card = g('#stage .card');
        const txt = card && card.querySelector('.txt');
        const art = card && card.querySelector('.art');
        const r = (el) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
        return {
          stage: Math.round(ph.getAttribute('data-stage') || 0),
          deg: ph.className.replace(/\s*clean/, '').trim(),
          tape: getComputedStyle(g('#tape')).display,
          mktH: r(g('.mkt')),
          cardH: r(card), artH: r(art), txtH: r(txt),
          artCls: art ? art.className : '-',
          cardClip: !!(card && card.scrollHeight > card.clientHeight + 1),
          txtClip: !!(txt && txt.scrollHeight > txt.clientHeight + 1),
        };
      });
      console.log(`375x${H}`, JSON.stringify(s));
      if (s.stage >= 188 && s.stage <= 240) {
        await page.screenshot({ path: path.join(ROOT, '.shots', `_tier-375x${H}-stage${s.stage}.png`) });
      }
      await ctx.close();
    }
    await browser.close();
    return;
  }
  for (const [w, h] of VIEWS) {
    if (ONLY && String(w) !== ONLY) continue;
    for (const artOn of ART0 ? [true, false] : [true]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto(fileUrl(artOn));
      await page.waitForTimeout(500);
      await page.click('#i-b');                       // 关开局页
      await page.waitForTimeout(450);
      const tag = artOn ? '' : '-art0';
      await page.screenshot({ path: path.join(ROOT, '.shots', `v2-${w}x${h}-d1${tag}.png`) });
      const d1 = await stats(page);
      // 序幕 3 张 + 正片 6 天
      for (let i = 0; i < 3 + 6; i++) await swipe(page, 1);
      await page.waitForTimeout(320);                  // 让 toast / 账目行现出来（顺便验它压不压 HUD）
      await page.screenshot({ path: path.join(ROOT, '.shots', `v2-${w}x${h}-d6${tag}.png`) });
      const d6 = await stats(page);
      out.push({ size: `${w}x${h}${tag}`, d1, d6 });
      await ctx.close();
    }
  }
  await browser.close();
  out.forEach((o) => {
    console.log('\n== ' + o.size + ' ==');
    console.log('  day1', JSON.stringify(o.d1));
    console.log('  day6', JSON.stringify(o.d6));
  });
})().catch((e) => { console.error(e); process.exit(1); });
