// Headless capture: boot the game, skip the intro, walk a bit, save frames.
import puppeteer from '/home/kali/space/mura/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--disable-gpu-sandbox',
         '--window-size=1440,900', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url().slice(0, 90)));

await page.goto('http://127.0.0.1:5191/index.html', { waitUntil: 'load', timeout: 60000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(3000);

await page.click('#go');
await wait(1500);
await page.screenshot({ path: `${OUT}/01_intro.png` });

// skip the cinematic, land in the village
await page.click('#skip');
await wait(2500);
await page.screenshot({ path: `${OUT}/02_spawn.png` });

// walk toward the level crossing
for (let i = 0; i < 3; i++) {
  await page.keyboard.down('KeyW');
  await wait(1400);
  await page.keyboard.up('KeyW');
  await wait(400);
  await page.screenshot({ path: `${OUT}/03_walk_${i}.png` });
}

// wait out a train cycle
await wait(9000);
await page.screenshot({ path: `${OUT}/04_wait.png` });
await wait(9000);
await page.screenshot({ path: `${OUT}/05_train.png` });

const info = await page.evaluate(() => ({
  meshes: (() => { let n = 0; scene.traverse(o => { if (o.isMesh) n++; }); return n; })(),
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  textures: renderer.info.memory.textures,
  geometries: renderer.info.memory.geometries,
  phase: typeof phase !== 'undefined' ? phase : '?',
  player: player.position.toArray().map(v => +v.toFixed(2)),
}));
console.log(JSON.stringify(info, null, 1));
console.log(errors.length ? errors.slice(0, 12).join('\n') : 'no errors');
await browser.close();
