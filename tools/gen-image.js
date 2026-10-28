#!/usr/bin/env node
/* 胜算云（router.shengsuanyun.com）异步生图工具 —— 游戏素材专用
 *
 * 协议（2026-10 文档）：POST /v1/tasks/generations 提交 → 返回 data.request_id
 *                      GET  /v1/tasks/generations/{request_id} 轮询，COMPLETED 后
 *                      产物在 data.data.url[] 里（官方示例字段也可能叫 image_urls）
 *
 * 用法：
 *   node tools/gen-image.js --prompt "描述" --out assets/char/laopo.webp
 *   node tools/gen-image.js --prompt "改表情" --image assets/char/laopo.webp --out assets/char/laopo_happy.webp
 *   node tools/gen-image.js --prompt "..." --out x.webp --ratio 3:4 --size 1K --model google/gemini-nano-banana-2.1
 *
 * key 读取顺序：环境变量 SSY_API_KEY → ~/.ssy_key 文件（推荐，避免进 shell 历史）
 *
 * --out 给 .webp 时会自动按素材规范处理：裁 7:8 → 缩 560×640 → WebP q0.82。
 * 参考图 --image 支持本地文件（转成 base64 data URI 上传）或公网 URL。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const API = 'https://router.shengsuanyun.com/api/v1/tasks/generations';
const DEFAULT_MODEL = 'google/gemini-nano-banana-2.1';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function getKey() {
  if (process.env.SSY_API_KEY) return process.env.SSY_API_KEY.trim();
  const f = path.join(os.homedir(), '.ssy_key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('缺少 API Key：设环境变量 SSY_API_KEY，或把 key 写进 ~/.ssy_key');
  process.exit(2);
}

function mimeOf(p) {
  const e = path.extname(p).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function main() {
  const key = getKey();
  const prompt = arg('prompt');
  const out = arg('out', 'gen.png');
  const model = arg('model', DEFAULT_MODEL);
  const ratio = arg('ratio', '3:4');           // 卡面 7:8 最接近 3:4，出图后裁
  const size = arg('size', '1K');
  const ref = arg('image');
  const timeoutMs = parseInt(arg('timeout', '180'), 10) * 1000;

  if (!prompt) { console.error('缺少 --prompt'); process.exit(2); }

  const body = { model, prompt, aspect_ratio: ratio, size, response_modalities: ['IMAGE'] };
  if (ref) {
    if (/^https?:\/\//.test(ref)) body.image = ref;
    else {
      const b = fs.readFileSync(ref).toString('base64');
      body.image = 'data:' + mimeOf(ref) + ';base64,' + b;
    }
  }

  console.log('→ 提交任务 model=' + model + ' ratio=' + ratio + ' size=' + size + (ref ? ' 参考图=' + path.basename(ref) : ''));
  const r1 = await fetch(API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t1 = await r1.text();
  if (!r1.ok) { console.error('提交失败 HTTP ' + r1.status + '\n' + t1.slice(0, 800)); process.exit(1); }
  let j1; try { j1 = JSON.parse(t1); } catch { console.error('返回非 JSON：\n' + t1.slice(0, 800)); process.exit(1); }
  const reqId = j1?.data?.request_id || j1?.request_id;
  if (!reqId) { console.error('没拿到 request_id：\n' + JSON.stringify(j1).slice(0, 800)); process.exit(1); }
  console.log('  request_id=' + reqId + ' status=' + (j1?.data?.status || '?'));

  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    const r2 = await fetch(API + '/' + encodeURIComponent(reqId), { headers: { Authorization: 'Bearer ' + key } });
    const t2 = await r2.text();
    if (!r2.ok) { console.error('轮询失败 HTTP ' + r2.status + '\n' + t2.slice(0, 500)); continue; }
    let j2; try { j2 = JSON.parse(t2); } catch { continue; }
    const st = j2?.data?.status || '?';
    const pg = j2?.data?.progress || '';
    if (st + pg !== last) { console.log('  ' + st + ' ' + pg); last = st + pg; }
    if (st === 'COMPLETED') {
      const d = j2?.data?.data || {};
      const urls = d.url || d.image_urls || d.urls || [];
      const url = Array.isArray(urls) ? urls[0] : urls;
      if (!url) { console.error('任务完成但没找到图片 URL：\n' + JSON.stringify(j2).slice(0, 800)); process.exit(1); }
      console.log('← 图片 ' + url);
      await download(url, out);
      return;
    }
    if (st === 'FAILED' || st === 'ERROR') {
      console.error('任务失败：\n' + JSON.stringify(j2).slice(0, 800));
      process.exit(1);
    }
  }
  console.error('超时 ' + timeoutMs / 1000 + 's 还没完成，request_id=' + reqId + '（可自行轮询）');
  process.exit(1);
}

async function download(url, out) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('下载失败 HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const raw = out.replace(/\.webp$/, '') + '.raw.png';
  fs.writeFileSync(out.endsWith('.webp') ? raw : out, buf);
  console.log('  已下载 ' + Math.round(buf.length / 1024) + 'KB → ' + (out.endsWith('.webp') ? raw : out));
  if (!out.endsWith('.webp')) return;
  await toSpec(raw, out);
  fs.unlinkSync(raw);
}

/* 按素材规范处理：裁 7:8（保顶部，切掉右侧水印）→ 560×640 → WebP q0.82 */
async function toSpec(src, out) {
  let chromium;
  try { chromium = require('playwright-core').chromium; }
  catch { console.error('  缺少 playwright-core，跳过规格处理：npm i -D playwright-core'); return; }
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
  const b64 = await page.evaluate(async (s) => {
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = s; });
    const W = 560, H = 640, want = W / H;          // 7:8
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (sw / sh > want) { sw = sh * want; }                        // 太宽：裁右
    else { sh = sw / want; }                                       // 太高：裁底
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return cv.toDataURL('image/webp', 0.82).split(',')[1];
  }, dataUrl);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  await browser.close();
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('  规格处理 560×640 WebP → ' + out + ' (' + kb + 'KB' + (kb > 45 ? ' ⚠ 超预算45KB' : '') + ')');
}

main().catch(e => { console.error(e); process.exit(1); });
