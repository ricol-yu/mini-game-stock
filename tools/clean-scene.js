/* 场景图后处理：① 克隆左下同水平贴片盖掉右下角「AI生成 WORKBUDDY」水印
   ② 统一转 640×720 WebP（art-spec v3 §6 的画布）。
   用法：node tools/clean-scene.js [输入目录]（默认 assets/bg，输出同名 .webp，PNG 保留） */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const DIR = process.argv[2] || 'assets/bg';
(async()=>{
  const b = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const p = await b.newPage();
  const files = fs.readdirSync(DIR).filter(x=>x.endsWith('.png'));
  for(const f of files){
    const data = fs.readFileSync(path.join(DIR,f)).toString('base64');
    await p.setContent('<body><canvas id=c width=1024 height=1152></canvas><script>' +
      'window.ready=new Promise(r=>{const i=new Image();i.onload=()=>{document.getElementById("c").getContext("2d").drawImage(i,0,0);r()};i.src="data:image/png;base64,' + data + '"})</script>');
    await p.evaluate(()=>window.ready);
    const url = await p.evaluate(()=>{
      const c=document.getElementById('c'), x=c.getContext('2d');
      // 水印 bbox ≈ (890..1024, 1075..1152)；源贴片取同 y 的左侧 (740..874)——纹理连续、横缝对齐
      x.drawImage(c, 740,1075,134,77, 890,1075,134,77);
      // 缩到 640x720 导出 webp
      const o=document.createElement('canvas'); o.width=640; o.height=720;
      o.getContext('2d').drawImage(c,0,0,1024,1152,0,0,640,720);
      return o.toDataURL('image/webp',0.82);
    });
    const out = path.join(DIR, f.replace(/\.png$/,'.webp'));
    // 上面 replace 组合可能产生怪名，直接按时间戳顺序命名由调用方处理；这里用文件名尾巴时间戳映射
    console.log('done', f, '->', out, Math.round(url.length*0.75/1024)+'KB(base64)');
    fs.writeFileSync(out, Buffer.from(url.split(',')[1],'base64'));
  }
  await b.close();
})();
