// Targeted look: teleport the player, force the crossing state, capture close-ups.
import puppeteer from '/home/kali/space/mura/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/probe';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5191/index.html', { waitUntil: 'load', timeout: 60000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(2500);
await page.click('#go'); await wait(800);
await page.click('#skip'); await wait(1500);

// helper injected once
await page.evaluate(() => {
  window.__put = (x, z, y, p) => {
    player.position.set(x, 0, z);
    if (y !== undefined) { yaw = y; }
    camPos.set(x - Math.sin(yaw) * 5.6, 3.1, z - Math.cos(yaw) * 5.6);
    if (p !== undefined) pitch = p;
  };
});

const shots = [
  ['10_crossing',  [0, 9, Math.PI, -0.05]],
  ['11_house',     [-8.5, -8, Math.PI / 2 + 0.4, 0.05]],
  ['12_sakura',    [-6.5, -11, -Math.PI / 2, 0.25]],
  ['13_shrine',    [-8, 18, -Math.PI / 2 - 0.4, 0]],
  ['14_vending',   [-5.4, -3.5, -Math.PI / 2, 0]],
];
for (const [name, args] of shots) {
  await page.evaluate(a => window.__put(...a), args);
  await wait(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// aerial look at the town and the backdrop
for (const [name, pos, look] of [
  ['16_bikes',    [-4.2, 1.5, 12.5], [-7.0, 0.7, 9.6]],
  ['17_sky',      [0, 6, 30],        [40, 60, -120]],
  ['20_air_low',  [0, 26, 62],   [0, 4, 0]],
  ['21_air_high', [60, 78, 96],  [0, 6, -10]],
  ['22_air_back', [-70, 40, -80], [0, 5, 0]],
]) {
  // fermare il loop non basta: il frame gia' in coda gira comunque e rimette
  // la camera dietro al personaggio. Prima si ferma, poi si lascia scadere.
  await page.evaluate(() => {
    if (!window.__raf) { window.__raf = window.requestAnimationFrame.bind(window); }
    window.requestAnimationFrame = () => 0;
  });
  await wait(400);
  await page.evaluate((p, l) => {
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(l[0], l[1], l[2]);
    POST.render();
  }, pos, look);
  await wait(200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
await page.evaluate(() => {
  window.requestAnimationFrame = window.__raf;
  window.__raf = null;
  tick();
});
await wait(400);

// force a train pass and catch it mid-crossing
await page.evaluate(() => {
  window.__put(0, 11, Math.PI, -0.02);
  phase = 'pass'; gateT = 1; train.visible = true; train.position.set(-60, 0, 0);
});
await wait(1600);
await page.screenshot({ path: `${OUT}/15_train.png` });

console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no errors');
await browser.close();
