import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const shapes = JSON.parse(await readFile(new URL('src/components/brand/logo-shapes.json', root)));
const type = JSON.parse(await readFile(new URL('scripts/brand-typography.json', root)));
const silver = '#f0f6fc';
const ink = '#0d1117';
const blue = '#58a6ff';

function artwork(light = false) {
  return `<g stroke="${light ? '#0969da' : blue}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="${shapes.tail}"/><path d="${shapes.fork}"/></g>
<path class="logo-trace" d="${shapes.travel}" pathLength="1" stroke="${light ? ink : silver}" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0"/>
<circle cx="104" cy="43" r="6" fill="${light ? '#0969da' : blue}"/><circle cx="104" cy="43" r="2.5" fill="${light ? '#fff' : ink}"/>
<g class="logo-node"><circle cx="116" cy="57" r="6" fill="${light ? '#0969da' : blue}"/><circle cx="116" cy="57" r="2.5" fill="${light ? '#fff' : ink}"/></g>
<path d="${shapes.body}" fill="${light ? '#0969da' : blue}"/>
<g class="logo-head"><path d="${shapes.head}" fill="${light ? ink : silver}"/><path d="${shapes.ear}" fill="${light ? '#79c0ff' : blue}"/>
<g class="logo-prompt" stroke="${light ? '#f0f6fc' : ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="${shapes.prompt}"/><path d="${shapes.cursor}"/></g></g>`;
}
function svg(viewBox, title, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" role="img" aria-labelledby="brand-title"><title id="brand-title">${title}</title>\n${content}\n</svg>\n`;
}
const css = `
.logo-head{transform-origin:56px 78px}.logo-prompt{transform-origin:55px 55px}.logo-node{transform-origin:116px 57px}
.logo-trace{stroke-dasharray:1;stroke-dashoffset:0}
.is-playing .logo-head{animation:curious calc(.9s * var(--speed,1)) cubic-bezier(.22,1,.36,1) both}
.is-playing .logo-prompt{animation:blink calc(.23s * var(--speed,1)) calc(.28s * var(--speed,1)) cubic-bezier(.22,1,.36,1) both}
.is-playing .logo-trace{animation:commit calc(.84s * var(--speed,1)) calc(.12s * var(--speed,1)) cubic-bezier(.22,1,.36,1) both}
.is-playing .logo-node{animation:arrive calc(.34s * var(--speed,1)) calc(.65s * var(--speed,1)) cubic-bezier(.22,1,.36,1) both}
.is-paused *{animation-play-state:paused!important}
@keyframes curious{0%,100%{transform:rotate(0deg)}36%{transform:rotate(-6deg)}}
@keyframes blink{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.12)}}
@keyframes commit{0%{stroke-dashoffset:1;opacity:0}15%{opacity:1}78%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes arrive{0%,100%{transform:scale(1)}50%{transform:scale(1.26)}}
.reduce-motion *{animation:none!important}
@media(prefers-reduced-motion:reduce){.is-playing *{animation:none!important}}
`;
const tile = svg(
  '0 0 1024 1024',
  'GitSomething application icon',
  `<rect width="1024" height="1024" rx="224" fill="${ink}"/><rect x="12" y="12" width="1000" height="1000" rx="214" stroke="#3d444d" stroke-width="3"/><g transform="scale(8)">${artwork()}</g>`,
);
const mark = svg('0 0 128 128', 'GitSomething prompt cat', artwork());
const animated = mark
  .replace('<svg ', '<svg class="is-playing" ')
  .replace('<g stroke=', `<style>${css}</style><g stroke=`);
await Promise.all([
  writeFile(new URL('public/brand/gitsomething-app-icon.svg', root), tile),
  writeFile(new URL('public/gitsomething.svg', root), tile),
  writeFile(new URL('public/brand/gitsomething-mark.svg', root), mark),
  writeFile(
    new URL('public/brand/gitsomething-mark-light.svg', root),
    svg('0 0 128 128', 'GitSomething prompt cat', artwork(true)),
  ),
  writeFile(new URL('public/brand/gitsomething-mark-animated.svg', root), animated),
  ...[false, true].map((light) =>
    writeFile(
      new URL(`public/brand/gitsomething-wordmark-${light ? 'light' : 'dark'}.svg`, root),
      svg(
        '0 0 401 80',
        'GitSomething',
        `<g transform="scale(.625)">${artwork(light)}</g><g fill="${light ? ink : silver}">${type.wordmarkPaths}</g>`,
      ),
    ),
  ),
]);
const banner = svg(
  '0 0 1280 640',
  'GitSomething: make your next commit clearer.',
  `<rect width="1280" height="640" fill="${ink}"/><path d="M824 72V568" stroke="#3d444d"/><g transform="translate(66 68) scale(.6)">${artwork()}</g>${type.bannerGroups.map((group) => `<g fill="${group.fill}">${group.paths}</g>`).join('')}<g transform="translate(842 150) scale(2.5)">${artwork()}</g>`,
);
await writeFile(new URL('public/brand/gitsomething-release-banner.svg', root), banner);

const icon = svg('0 0 128 128', 'GitSomething', artwork());
const preview = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitSomething — logo motion</title>
<style>
*{box-sizing:border-box}body{margin:0;background:${ink};color:${silver};font:15px/1.6 system-ui,sans-serif;color-scheme:dark}body.light{background:#fff;color:${ink};color-scheme:light}main{max-width:1040px;padding:40px 32px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:1px solid #3d444d;padding-bottom:20px}h1{font-size:22px;margin:0;letter-spacing:-.6px}header p{margin:2px 0 0;color:#9198a1}.stage{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:40px;padding:56px 24px}.stage svg{display:block;width:100%;max-width:300px;margin:auto;overflow:visible}.stage h2{font-size:32px;line-height:1.2;letter-spacing:-1px;margin:0 0 16px}.stage p{max-width:35ch;color:#9198a1}button,select{border:1px solid #3d444d;background:transparent;color:inherit;border-radius:7px;padding:9px 14px;font:inherit;cursor:pointer}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid ${blue};outline-offset:4px}.controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:20px 0;border-top:1px solid #3d444d}.controls label{display:inline-flex;align-items:center;gap:8px}.sizes{display:flex;align-items:end;gap:40px;padding:32px 0;flex-wrap:wrap}.sizes figure{margin:0;text-align:center}.sizes svg{display:block;overflow:visible}.sizes figcaption{font-size:12px;color:#9198a1;margin-top:12px}.footer{font-size:12px;color:#9198a1;border-top:1px solid #3d444d;padding-top:20px}#motion-status{font-size:13px;color:#9198a1}body.light .logo-head>path:first-child{fill:${ink}}body.light .logo-prompt{stroke:${silver}}body.light .logo-head>path:nth-child(2){fill:${blue}}@media(max-width:600px){main{padding:24px}.stage{grid-template-columns:1fr;padding:24px 0;gap:16px}.stage svg{max-width:180px}.stage h2{font-size:26px}.sizes{gap:22px}header{display:block}header p{margin-top:6px}}${css}</style>
<main><header><div><h1>GitSomething</h1><p>Original prompt cat · vector motion preview</p></div><span id="motion-status" role="status">Ready to replay</span></header>
<section class="stage"><div class="main-logo">${icon}</div><div><h2>A little curiosity.<br>A new branch.</h2><p>A prompt for a face. A commit graph for a tail. A short moment of curiosity, then back to work.</p></div></section>
<div class="controls"><button id="replay" type="button">Replay animation</button><button id="pause" type="button" aria-pressed="false">Pause</button><label>Speed <select id="speed"><option value="1">Normal</option><option value="2">0.5×</option><option value="4">0.25×</option></select></label><button id="theme" type="button" aria-pressed="false">Light background</button><label><input type="checkbox" id="reduce">Static preview</label></div>
<section class="sizes" aria-label="Actual logo sizes">${[16, 24, 32, 48, 64, 128].map((size) => `<figure>${icon.replaceAll('brand-title', `brand-title-${size}`).replace('<svg ', `<svg width="${size}" height="${size}" `)}<figcaption>${size}px</figcaption></figure>`).join('')}</section>
<p class="footer">One short sequence, no continuous loop. Your system’s reduced-motion preference always takes priority. Native app icons and GitHub authorization screens use the static mark. Original artwork; independent of GitHub.</p></main>
<script>
const stage=document.querySelector('.main-logo'),status=document.querySelector('#motion-status'),pause=document.querySelector('#pause'),reduce=document.querySelector('#reduce'),preference=matchMedia('(prefers-reduced-motion: reduce)');
function replay(){stage.classList.remove('is-playing','is-paused');pause.textContent='Pause';pause.setAttribute('aria-pressed','false');if(preference.matches||reduce.checked||document.hidden){status.textContent='Static preview';return}void stage.offsetWidth;stage.classList.add('is-playing');status.textContent='Playing'}
document.querySelector('#replay').onclick=replay;
pause.onclick=()=>{if(!stage.classList.contains('is-playing'))return;const paused=stage.classList.toggle('is-paused');pause.textContent=paused?'Resume':'Pause';pause.setAttribute('aria-pressed',String(paused));status.textContent=paused?'Paused':'Playing'};
document.querySelector('#speed').onchange=e=>{stage.style.setProperty('--speed',e.target.value);replay()};
document.querySelector('#theme').onclick=e=>{const light=document.body.classList.toggle('light');e.target.textContent=light?'Dark background':'Light background';e.target.setAttribute('aria-pressed',String(light))};
reduce.onchange=()=>{stage.classList.toggle('reduce-motion',reduce.checked);replay()};preference.onchange=replay;
document.addEventListener('visibilitychange',()=>{if(document.hidden){stage.classList.remove('is-playing','is-paused');status.textContent='Ready to replay'}});
stage.addEventListener('animationend',e=>{if(e.animationName==='arrive'){status.textContent='Ready to replay';stage.classList.remove('is-playing')}});
replay();
</script></html>`;
await writeFile(new URL('public/brand/gitsomething-logo-preview.html', root), preview);

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [source, destination, width, height] of [
    [tile, 'gitsomething-app-icon-1024.png', 1024, 1024],
    [tile, 'github-oauth-logo-256.png', 256, 256],
    [tile, 'github-oauth-logo-512.png', 512, 512],
    [banner, 'gitsomething-release-banner.png', 1280, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${source}`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`public/brand/${destination}`, root)),
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}
console.log(
  'Built original SVG brand assets, motion preview, and PNG exports from shared geometry.',
);
