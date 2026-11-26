// Cavalaria render test — the river overlay, run in Node by extracting the
// REAL smoothPath/boardOverlaySVG from index.html (same technique as
// tools/svgtool/river-preview.js). Proves: the river curve runs left to
// right across the board (never doubling back) in BOTH orientations, and
// the flipped river is the 180-degree rotation of the unflipped one.
// Regression test for Nov 26, 2026: flipping the board looped the river,
// because the squares were sorted by board file while the path's edge
// extensions assumed screen order.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function smoothPath');
const end = html.indexOf('\nbuildBoard(8);', start);
if (start < 0 || end < 0) { console.error('FAIL: river code not found'); process.exit(1); }
const code = html.slice(start, end);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

function makeSVG(state, flipped, selected) {
  const fn = new Function('state', 'flipped', 'selected', code + '; return boardOverlaySVG();');
  return fn(state, flipped, selected);
}
// Endpoints of the water path: M x y, then each C's last pair is its end.
function waterEndpoints(svg) {
  const m = svg.match(/<path d="([^"]+)" fill="none" stroke="url\(#rivw\)"/);
  if (!m) return null;
  const d = m[1];
  const pts = [];
  const mm = d.match(/^M([-\d.]+) ([-\d.]+)/);
  if (mm) pts.push([parseFloat(mm[1]), parseFloat(mm[2])]);
  for (const c of d.matchAll(/C([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)/g))
    pts.push([parseFloat(c[5]), parseFloat(c[6])]);
  return pts;
}
function landRects(svg) {
  const out = [];
  for (const r of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)"[^>]*fill="rgba\(110,170,80,0\.30\)"/g))
    out.push([parseFloat(r[1]), parseFloat(r[2])]);
  return out;
}

const fixed8 = [24, 25, 30, 31, 34, 35, 36, 37];
const fixed12 = [60, 61, 62, 69, 70, 71, 75, 76, 77, 78, 79, 80];
function stub(river, size, seed) {
  return { size, river, history: [], board: Array(size * size).fill(null), seed };
}

for (const [name, river, size, seed] of [['8x8 fixed', fixed8, 8, 7], ['12x12 fixed', fixed12, 12, 42]]) {
  console.log(name + ':');
  const up = makeSVG(stub(river, size, seed), false, -1);
  const fl = makeSVG(stub(river, size, seed), true, -1);
  const eUp = waterEndpoints(up), eFl = waterEndpoints(fl);
  check('water path exists, unflipped and flipped', !!eUp && !!eFl && eUp.length > 2 && eFl.length > 2);
  if (eUp && eFl) {
    const mono = a => a.every((p, i) => i === 0 || p[0] >= a[i - 1][0] - 0.01);
    check('unflipped path starts off the left edge', eUp[0][0] < 0, 'x=' + eUp[0][0]);
    check('unflipped path ends off the right edge', eUp[eUp.length - 1][0] > 100, 'x=' + eUp[eUp.length - 1][0]);
    check('unflipped path never goes back left', mono(eUp), JSON.stringify(eUp.map(p => p[0])));
    check('flipped path starts off the left edge', eFl[0][0] < 0, 'x=' + eFl[0][0]);
    check('flipped path ends off the right edge', eFl[eFl.length - 1][0] > 100, 'x=' + eFl[eFl.length - 1][0]);
    check('flipped path never goes back left', mono(eFl), JSON.stringify(eFl.map(p => p[0])));
    // Flipped = 180-degree rotation of unflipped, in reverse order.
    let mirror = eUp.length === eFl.length;
    if (mirror) for (let i = 0; i < eUp.length; i++) {
      const a = eUp[i], b = eFl[eFl.length - 1 - i];
      if (Math.abs(a[0] + b[0] - 100) > 0.02 || Math.abs(a[1] + b[1] - 100) > 0.02) { mirror = false; break; }
    }
    check('flipped path is the 180-degree rotation of the unflipped path', mirror);
  }
  const rUp = landRects(up), rFl = landRects(fl);
  check('one land tint per river square, both orientations', rUp.length === river.length && rFl.length === river.length,
    'up=' + rUp.length + ' fl=' + rFl.length + ' river=' + river.length);
  if (rUp.length === river.length && rFl.length === river.length) {
    // Each flipped rect is the mirror of an unflipped one (centres at
    // 100-x, 100-y). Tolerance, not exact match: 12x12 cells are 100/12,
    // so the 2-decimal rounding in the SVG wobbles by ~0.01.
    const cell = 100 / size, w = cell - 1.2;
    const center = p => [p[0] + w / 2, p[1] + w / 2];
    const mirrored = rUp.map(p => { const c = center(p); return [100 - c[0], 100 - c[1]]; });
    const ok = rFl.every(p => {
      const c = center(p);
      return mirrored.some(q => Math.abs(c[0] - q[0]) < 0.03 && Math.abs(c[1] - q[1]) < 0.03);
    });
    check('flipped land tints mirror the unflipped ones', ok);
  }
  // Decorations stay glued to the same square when flipped: same seed,
  // same tuft/weed/ripple count in both orientations.
  const count = (svg, re) => (svg.match(re) || []).length;
  check('same decoration count flipped as unflipped (seeded by board square)',
    count(up, /stroke="#4c8a3f"/g) === count(fl, /stroke="#4c8a3f"/g) &&
    count(up, /stroke="#2e7d4f"/g) === count(fl, /stroke="#2e7d4f"/g),
    'tufts up=' + count(up, /stroke="#4c8a3f"/g) + ' fl=' + count(fl, /stroke="#4c8a3f"/g));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
