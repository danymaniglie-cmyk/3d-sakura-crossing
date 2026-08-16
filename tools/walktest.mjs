// Behaviour checks: does the player step onto kerbs, and do walls stop them?
import puppeteer from '/home/kali/space/mura/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5191/index.html', { waitUntil: 'load', timeout: 60000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(2500);
await page.click('#go'); await wait(600);
// The intro was removed, so #skip may not exist any more: click it only if it does.
await page.evaluate(() => document.getElementById('skip')?.click());
await wait(1200);

const results = [];

// --- 1. the ground query itself
const probe = await page.evaluate(() => ({
  road:      +GROUND.heightAt(0, 20).toFixed(3),
  sidewalk:  +GROUND.heightAt(8, 20).toFixed(3),
  kerb:      +GROUND.heightAt(6.5, 20).toFixed(3),
  crossing:  +GROUND.heightAt(0, 0).toFixed(3),
  wallHouse: GROUND.blocked(13, 1, 0.4),
  openRoad:  GROUND.blocked(0, 20, 0.4),
}));
results.push(['quote del suolo', probe]);

// --- 2. walk sideways from the road onto the raised sidewalk
const stepTest = await page.evaluate(async () => {
  player.position.set(5.4, 0, 20);     // appena prima del cordolo (x=6.5)
  yaw = Math.PI;
  const log = [];
  keys['KeyD'] = true;
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    await new Promise(r => requestAnimationFrame(r));
    log.push([+player.position.x.toFixed(2), +player.position.y.toFixed(3)]);
  }
  keys['KeyD'] = false;
  // riassunto: quota a scaglioni di 2 metri
  const out = {};
  log.forEach(([x, y]) => { const b = (x).toFixed(1); if (out[b] === undefined) out[b] = y; });
  return { finale: log[log.length - 1], quotePerX: out };
});
results.push(['salita sul marciapiede', stepTest]);

// --- 3. walk straight into a building and check we stop short of it
const wallTest = await page.evaluate(async () => {
  player.position.set(8.6, 0.36, 20);  // sul marciapiede, verso il muretto a x=10.2
  yaw = Math.PI;
  const start = player.position.x;
  keys['KeyD'] = true;
  const t0 = performance.now();
  while (performance.now() - t0 < 5000) await new Promise(r => requestAnimationFrame(r));
  keys['KeyD'] = false;
  return { start: +start.toFixed(2), end: +player.position.x.toFixed(2),
           fermato: player.position.x < 10.0 };
});
results.push(['muro davanti', wallTest]);

// --- 4. W must move the way the camera is looking
const dirTest = await page.evaluate(async () => {
  player.position.set(0, 0, 20);
  yaw = Math.PI;                       // avanti = -z
  const before = player.position.z;
  keys['KeyW'] = true;
  await new Promise(r => setTimeout(r, 700));
  keys['KeyW'] = false;
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const moved = new THREE.Vector3(0, 0, player.position.z - before);
  return { dz: +(player.position.z - before).toFixed(2),
           atteso: +fwd.z.toFixed(2), concorde: moved.z * fwd.z > 0 };
});
results.push(['W va dove guarda la camera', dirTest]);

for (const [name, val] of results) console.log(name + ':', JSON.stringify(val));
console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();
