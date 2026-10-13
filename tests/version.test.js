// Cache-busting consistency: every relative import / asset uses the same ?v= string, and sw.js matches.
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(root + f, 'utf8');
const vs = new Set(); let bad = [];
for (const f of readdirSync(root + 'js').filter((f) => f.endsWith('.js'))) {
  for (const m of read('js/' + f).matchAll(/from '(\.\/[^']+)'/g)) { const v = (m[1].match(/\?v=([\w-]+)$/) || [])[1]; if (!v) bad.push(`${f}: ${m[1]}`); else vs.add(v); }
}
const html = read('index.html');
for (const m of html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)) { const v = (m[1].match(/\?v=([\w-]+)$/) || [])[1]; if (!v) bad.push(`index.html: ${m[1]}`); else vs.add(v); }
const sw = read('sw.js'); const swv = (sw.match(/const V = '\?v=([\w-]+)'/) || [])[1]; const cache = (sw.match(/const CACHE = '([^']+)'/) || [])[1];
const main = read('js/main.js'); const mv = (main.match(/VERSION = '([\w-]+)'/) || [])[1];
const ok = bad.length === 0 && vs.size === 1 && [...vs][0] === swv && swv === mv && cache.endsWith(swv) && /cache: 'no-cache'/.test(sw) && /updateViaCache: 'none'/.test(main);
console.log(ok ? `PASS: version ${swv} consistent (cache ${cache})` : `FAIL: versions ${[...vs]} sw ${swv} main ${mv} cache ${cache} unversioned: ${bad.join(', ')}`);
process.exit(ok ? 0 : 1);
