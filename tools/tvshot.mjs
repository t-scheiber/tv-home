// Debug helper: screenshot / evaluate on the TV through the webOS remote inspector (Developer Mode).
// Reads TVH_TV_HOST from .env in the repo root (a variable already set in the shell wins).
// Usage: node tools/tvshot.mjs <appTitleOrIdPart> <out.png> ["js expression"] ["key:Right,Down,Enter"]
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const host = process.env.TVH_TV_HOST;
if (!host) { console.error('TVH_TV_HOST is not set. Copy .env.example to .env and fill it in.'); process.exit(1); }

const [match = 'tvhome', out = 'shot.png', expr = '', keys = ''] = process.argv.slice(2);
const pages = await (await fetch(`http://${host}:9998/json`)).json();
const page = pages.find((p) => p.url.includes(match) || p.title.includes(match)) || pages[0];
if (!page) { console.error('no inspectable page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiting = new Map(); const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const k of keys.replace(/^key:/, '').split(',').filter(Boolean)) {
  const code = { Left: 37, Up: 38, Right: 39, Down: 40, Enter: 13, Back: 461 }[k];
  for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key: k });
  await sleep(350);
}
await sleep(800);
if (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log('EVAL', JSON.stringify(r.result?.result?.value ?? r.result));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('page:', page.title, '| saved', out);
logs.forEach((l) => console.log(l));
ws.close();
