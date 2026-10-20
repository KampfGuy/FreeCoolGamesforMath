// Multiplayer helpers: room codes, chat filter, nicknames (no network needed).
import { cleanText, cleanName, makeCode, normCode, MP_PREFIX, MAX_PLAYERS, COLORS } from '../js/mp.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const codes = new Set(Array.from({ length: 200 }, () => makeCode()));
ok([...codes].every((c) => /^[A-HJKMNP-Z2-9]{5}$/.test(c)), 'room codes: 5 chars, no 0/O/1/I/L');
ok(codes.size > 190, 'room codes are random');
ok(MP_PREFIX === 'fcgm-' && MAX_PLAYERS === 6 && COLORS.length >= 6, 'prefix fcgm-, 6 players, 6 colors');
ok(normCode(' ab-c d7 ') === 'ABCD7', 'join code normalized');
ok(cleanText('this is shit') === 'this is s***', 'bad word masked');
ok(cleanText('Sh1iit!') !== 'Sh1iit!', 'l33t / repeats masked');
ok(cleanText('Class assignment on Scunthorpe? no: hello pass') .includes('hello pass'), 'normal words kept');
ok(cleanText('<b>hi</b>') === 'bhi/b', 'no HTML');
ok(cleanText('x'.repeat(500)).length === 140, 'length capped');
ok(cleanName('') === 'Pilot' && cleanName('A very long nickname here').length <= 16, 'nicknames');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
