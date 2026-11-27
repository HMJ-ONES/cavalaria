// Cavalaria engine tests — extracts the pure engine <script> from index.html
// and runs it in Node. No DOM needed.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
// engine block is the one exporting via module.exports
const engineSrc = blocks.find(s => s.includes('module.exports'));
if (!engineSrc) { console.error('FAIL: engine script block not found'); process.exit(1); }

const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);
const E = sandbox.module.exports;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}
function setOf(arr) { return new Set(arr); }
function sameSet(a, b) { const sa = setOf(a), sb = setOf(b); if (sa.size !== sb.size) return false; for (const x of sa) if (!sb.has(x)) return false; return true; }
function squaresOf(board, color) { const out = []; for (let i = 0; i < board.length; i++) if (board[i] && board[i].c === color) out.push(i); return out; }
function movesFrom(moves, from) { return moves.filter(m => m.from === from).map(m => m.to); }
function C(c, extra) { return Object.assign({ c, empowered: null, hasMoved: false }, extra || {}); }
function boardWith(list) { const b = new Array(64).fill(null); for (const [i, p] of list) b[i] = p; return b; }

console.log('Formations — exact squares (16 pieces a side):');
{
  // Roman, White: rank1 all (56-63), rank2 a,c,d,e,f,h, rank3 d,e
  const rw = [56,57,58,59,60,61,62,63,48,50,51,52,53,55,43,44];
  // Roman, Black (mirrored): rank8 all (0-7), rank7 a,c,d,e,f,h, rank6 d,e
  const rb = [0,1,2,3,4,5,6,7,8,10,11,12,13,15,19,20];
  // Mongolian, White: rank1 b-g, rank2 a,b,c,f,g,h, rank3 a,b,g,h
  const mw = [57,58,59,60,61,62,48,49,50,53,54,55,40,41,46,47];
  // Mongolian, Black: rank8 b-g, rank7 a,b,c,f,g,h, rank6 a,b,g,h
  const mb = [1,2,3,4,5,6,8,9,10,13,14,15,16,17,22,23];
  const sRR = E.genSetup('choose', 7, { whiteFormation: 'roman', blackFormation: 'roman', riverMode: 'off' });
  check('Roman/Roman: white on the exact Roman squares', sameSet(squaresOf(sRR.board, 'w'), rw));
  check('Roman/Roman: black on the exact Roman squares', sameSet(squaresOf(sRR.board, 'b'), rb));
  const sMM = E.genSetup('choose', 7, { whiteFormation: 'mongolian', blackFormation: 'mongolian', riverMode: 'off' });
  check('Mongolian/Mongolian: white on the exact Mongolian squares', sameSet(squaresOf(sMM.board, 'w'), mw));
  check('Mongolian/Mongolian: black on the exact Mongolian squares', sameSet(squaresOf(sMM.board, 'b'), mb));
  for (const s of [sRR, sMM]) {
    check('16 pieces a side', E.countPieces(s.board, 'w') === 16 && E.countPieces(s.board, 'b') === 16);
  }
}

console.log('The user\'s example board (White Roman, Black Mongolian, fixed river):');
{
  const s = E.genSetup('choose', 7, { whiteFormation: 'roman', blackFormation: 'mongolian', riverMode: 'fixed' });
  // Rows top->bottom as given: rank8 .XXXXXX. / rank7 XXX..XXX / rank6 XX....XX /
  // rank5 __....__ / rank4 ..____.. / rank3 ...XX... / rank2 X.XXXX.X / rank1 XXXXXXXX
  const expected = {};
  const put = (row, cols, color) => { for (const c of cols) expected[row * 8 + c] = color; };
  put(0, [1,2,3,4,5,6], 'b'); put(1, [0,1,2,5,6,7], 'b'); put(2, [0,1,6,7], 'b');
  put(5, [3,4], 'w'); put(6, [0,2,3,4,5,7], 'w'); put(7, [0,1,2,3,4,5,6,7], 'w');
  let ok = true;
  for (let i = 0; i < 64; i++) {
    const want = expected[i] || null;
    const got = s.board[i] ? s.board[i].c : null;
    if (want !== got) { ok = false; console.log('   square ' + i + ': want ' + want + ' got ' + got); }
  }
  check('example board pieces match exactly', ok);
  check('fixed river is ranks 5+4, a/b/g/h + c/d/e/f', JSON.stringify(s.river) === JSON.stringify([24,25,30,31,34,35,36,37]));
  check('White moves first in the example', s.turn === 'w');
}

console.log('Modes:');
{
  const main = E.genSetup('main', 7, { riverMode: 'fixed' });
  check('Main: White Mongolian, Black Roman', main.whiteFormation === 'mongolian' && main.blackFormation === 'roman');
  check('Main: river is the fixed river', JSON.stringify(main.river) === JSON.stringify(E.FIXED_RIVER));
  check('Main: Mongolian (White) moves first', main.turn === 'w');
  const mainOff = E.genSetup('main', 7, { riverMode: 'off' });
  check('Main with river off: no river squares', mainOff.river.length === 0);
  check('firstTurnFor: mongol vs roman -> w', E.firstTurnFor('mongolian', 'roman') === 'w');
  check('firstTurnFor: roman vs mongol -> w (White always first)', E.firstTurnFor('roman', 'mongolian') === 'w');
  check('firstTurnFor: same formation -> w', E.firstTurnFor('roman', 'roman') === 'w');
  check('firstTurnFor: same formation -> w', E.firstTurnFor('roman', 'roman') === 'w' && E.firstTurnFor('mongolian', 'mongolian') === 'w');
  const choose = E.genSetup('choose', 7, { whiteFormation: 'roman', blackFormation: 'mongolian', riverMode: 'off' });
  check('Choose: picks are honoured, river off', choose.whiteFormation === 'roman' && choose.blackFormation === 'mongolian' && choose.river.length === 0);
}

console.log('Fixed river:');
{
  check('FIXED_RIVER is exactly the example pattern', JSON.stringify(E.FIXED_RIVER) === JSON.stringify([24,25,30,31,34,35,36,37]));
  check('fixed river is connected', E.riverConnected(E.FIXED_RIVER));
  const perFile = {};
  for (const i of E.FIXED_RIVER) { perFile[i % 8] = (perFile[i % 8] || 0) + 1; }
  check('fixed river: exactly one square per file', Object.keys(perFile).length === 8 && Object.values(perFile).every(n => n === 1));
  check('fixed river: every square on rank 4 or 5', E.FIXED_RIVER.every(i => { const r = (i / 8) | 0; return r === 3 || r === 4; }));
}

console.log('Random mode:');
{
  let sawRomanW = false, sawMongolW = false, sawRomanB = false, sawMongolB = false, sawRiver5 = false, sawRiver4 = false;
  for (let s = 1; s <= 200; s++) {
    const g = E.genSetup('random', s);
    if (g.whiteFormation === 'roman') sawRomanW = true; else sawMongolW = true;
    if (g.blackFormation === 'roman') sawRomanB = true; else sawMongolB = true;
    if (g.river.length !== 8) throw new Error('seed ' + s + ': river has ' + g.river.length + ' squares');
    const perFile = {};
    for (const i of g.river) {
      perFile[i % 8] = (perFile[i % 8] || 0) + 1;
      const rank = 8 - ((i / 8) | 0);
      if (rank !== 4 && rank !== 5) throw new Error('seed ' + s + ': river square on rank ' + rank);
      if (rank === 4) sawRiver4 = true; else sawRiver5 = true;
    }
    if (Object.keys(perFile).length !== 8 || Object.values(perFile).some(n => n !== 1))
      throw new Error('seed ' + s + ': river is not exactly one square per file');
    if (!E.riverConnected(g.river)) throw new Error('seed ' + s + ': random river is not connected');
    if (E.countPieces(g.board, 'w') !== 16 || E.countPieces(g.board, 'b') !== 16)
      throw new Error('seed ' + s + ': piece counts wrong');
  }
  check('200 seeds: random river is always 8 squares, one per file, ranks 4/5, connected', true);
  check('random formations vary for White (saw Roman and Mongolian)', sawRomanW && sawMongolW);
  check('random formations vary for Black (saw Roman and Mongolian)', sawRomanB && sawMongolB);
  check('random river uses both ranks across seeds', sawRiver4 && sawRiver5);
  const a = JSON.stringify(E.genSetup('random', 42)), b = JSON.stringify(E.genSetup('random', 42));
  check('same seed reproduces identical random setup', a === b);
  const c = JSON.stringify(E.genSetup('random', 43));
  check('different seed gives a different setup', a !== c);
}

console.log('Pawn moves:');
{
  // White e2 (52), Black a8 (0): forward 1 + double + 6 knight moves
  const st = E.newGame('main', 1, { board: boardWith([[52, C('w')], [0, C('b')]]), river: [], turn: 'w' });
  const mv = movesFrom(E.legalMoves(st), 52);
  check('pawn+knight from e2: 8 moves (pawn 1, pawn 2, 6 knight)', mv.length === 8, 'got ' + mv.length + ': ' + mv.join(','));
  check('includes forward 1 (e3) and double (e4)', mv.includes(44) && mv.includes(36));
  check('no sideways pawn move', !mv.includes(51) && !mv.includes(53));
  // Blocked straight ahead: black on e3 (44) blocks pawn, knight still jumps
  const stB = E.newGame('main', 1, { board: boardWith([[52, C('w')], [44, C('b')]]), river: [], turn: 'w' });
  const mvB = movesFrom(E.legalMoves(stB), 52);
  check('pawn blocked straight ahead: no forward, no double, knight still jumps', !mvB.includes(44) && !mvB.includes(36) && mvB.length === 6, 'got ' + mvB.join(','));
  // Diagonal capture: black on d3 (43) is captured; straight blocked too
  const stC = E.newGame('main', 1, { board: boardWith([[52, C('w')], [43, C('b')], [44, C('b')]]), river: [], turn: 'w' });
  const mvC = movesFrom(E.legalMoves(stC), 52);
  check('diagonal pawn capture offered (d3)', mvC.includes(43));
  check('blocked pawn + capture: 7 moves (6 knight + 1 capture)', mvC.length === 7, 'got ' + mvC.length);
  // Double only on the first move: a moved pawn has no double
  const moved = E.pseudoMoves(boardWith([[44, C('w', { hasMoved: true })], [0, C('b')]]), [], 'w');
  const mvM = movesFrom(moved, 44);
  check('moved pawn: single forward yes, double no', mvM.includes(36) && !mvM.includes(28), 'got ' + mvM.join(','));
}

console.log('Knight moves + river:');
{
  // Centre d4 (35), no river: 8 knight + pawn 1 + pawn 2 = 10
  const st = E.newGame('main', 1, { board: boardWith([[35, C('w')], [0, C('b')]]), river: [], turn: 'w' });
  const mv = movesFrom(E.legalMoves(st), 35);
  check('knight in the open: 8 jumps + pawn 1 + pawn 2 = 10', mv.length === 10, 'got ' + mv.join(','));
  check('knight jumps include c6/b5/b3/c2/e2/f3/f5/e6', [18,20,25,29,41,45,50,52].every(x => mv.includes(x)));
  // Knight jumps over pieces: own pawn on d5 (27) blocks the pawn but not the jumps
  const stJ = E.newGame('main', 1, { board: boardWith([[35, C('w')], [27, C('w')], [0, C('b')]]), river: [], turn: 'w' });
  const mvJ = movesFrom(E.legalMoves(stJ), 35);
  check('knight jumps over a blocking own piece', mvJ.length === 8 && [18,20,25,29,41,45,50,52].every(x => mvJ.includes(x)), 'got ' + mvJ.join(','));
  // From a river square: only the 1+1 diagonal steps out (the mini L)
  // and the pawn step — a piece in the water never does a full L, front
  // or back (v1.13).
  const stR = E.newGame('main', 1, { board: boardWith([[35, C('w')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvR = movesFrom(E.legalMoves(stR), 35);
  check('knight from the river: 4 diagonals + pawn 1 = 5', mvR.length === 5, 'got ' + mvR.join(','));
  check('river knight diagonals are c5/e5/c3/e3', [26,28,42,44].every(x => mvR.includes(x)));
  check('river knight never does a full L from inside the water (b5/f5/b3/f3/c2/e2)', [25,29,41,45,50,52].every(x => !mvR.includes(x)));
  check('river knight has NO forward L that leaves the river', [18,20].every(x => !mvR.includes(x)));
  // Regression, Nov 27 2026 (screenshot 6, 8x8, seed 3153760945, Mongol vs
  // Romano, FIXED_RIVER): White on a5 (24, in the water), Black on c4
  // (34, in the water). The piece was offered the backward full Ls to b3
  // (41) and to c4 (34, capture) — from inside the water it may only do
  // the mini L. Expected: pawn step a6 (16) + diagonals b6 (17), b4 (33).
  const stA5 = E.newGame('main', 1, { board: boardWith([[24, C('w')], [34, C('b')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvA5 = movesFrom(E.legalMoves(stA5), 24);
  check('a5 in the water: only the mini Ls out (b6/b4) + pawn step (a6) = 3', mvA5.length === 3, 'got ' + mvA5.join(','));
  check('a5 never does a backward full L (b3) or a backward full-L capture (c4)', [41,34].every(x => !mvA5.includes(x)));
  check('no double-step out of the river', !mvR.includes(19));
  check('pawn still steps 1 forward out of the river', mvR.includes(27));
  // Entering the river is a normal move: b2 knight lands on river c4 (34)
  const stE = E.newGame('main', 1, { board: boardWith([[49, C('w')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvE = movesFrom(E.legalMoves(stE), 49);
  check('knight entering the river is a normal 2+1 jump (c4)', mvE.includes(34));
  // Pawn diagonal capture from the river still works
  const stP = E.newGame('main', 1, { board: boardWith([[35, C('w')], [26, C('b')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  check('pawn captures diagonally out of the river (c5)', movesFrom(E.legalMoves(stP), 35).includes(26));
}

console.log('River blocks the way (v1.9 — nothing jumps over it):');
{
  // Bank, White on d3 (43, rank 3, one rank below the river zone rows 3-4):
  // forward Ls shrink to mini Ls (1+1 into the water); lateral and
  // backward Ls stay full 2+1.
  const stB = E.newGame('main', 1, { board: boardWith([[43, C('w')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvB = movesFrom(E.legalMoves(stB), 43);
  check('bank: forward Ls become mini Ls (c4/e4)', [34, 36].every(x => mvB.includes(x)), 'got ' + mvB.join(','));
  check('bank: forward 2+1 jumps over the river are gone (c5/e5)', [26, 28].every(x => !mvB.includes(x)));
  check('bank: lateral Ls stay full (b4/f4)', [33, 37].every(x => mvB.includes(x)));
  check('bank: backward Ls stay full (c1/e1, b2/f2)', [58, 60, 49, 53].every(x => mvB.includes(x)));
  check('bank: pawn step into the river is fine (d4), double-step over water to dry land is blocked (d5)', mvB.includes(35) && !mvB.includes(27));
  check('bank: 9 moves total (1 pawn + 2 mini + 2 lateral + 4 backward)', mvB.length === 9, 'got ' + mvB.join(','));
  // Bank, Black on d6 (19, rank 6, one rank above the zone): mirror image.
  const stK = E.newGame('main', 1, { board: boardWith([[19, C('b')], [63, C('w')]]), river: E.FIXED_RIVER, turn: 'b' });
  const mvK = movesFrom(E.legalMoves(stK), 19);
  check('bank (Black): forward Ls land on water, so they stay full (c4/e4)', [34, 36].every(x => mvK.includes(x)), 'got ' + mvK.join(','));
  check('bank (Black): no mini Ls when the full L lands in the water (c5/e5)', [26, 28].every(x => !mvK.includes(x)));
  check('bank (Black): lateral + backward Ls stay full', [25, 29, 2, 4, 9, 13].every(x => mvK.includes(x)));
  // Two ranks away the mini L does NOT apply: d2 (51) still jumps 2+1
  // into the river (c4/e4).
  const stF = E.newGame('main', 1, { board: boardWith([[51, C('w')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvF = movesFrom(E.legalMoves(stF), 51);
  check('two ranks away: full 2+1 jump into the river (c4/e4)', [34, 36].every(x => mvF.includes(x)));
  // Dry square INSIDE the zone (c5, 26 — not a river square): only single
  // diagonal steps, no 2+1 leap over the water to the opposite bank.
  const stD = E.newGame('main', 1, { board: boardWith([[26, C('w')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvD = movesFrom(E.legalMoves(stD), 26);
  check('dry zone square: 4 backward Ls only, NO pawn step/double onto the far side (4 moves)', mvD.length === 4 && [32, 36, 41, 43].every(x => mvD.includes(x)), 'got ' + mvD.join(','));
  check('dry zone square: a dry pawn cannot step or double onto the far side (c6/c7)', [18, 10].every(x => !mvD.includes(x)));
  check('dry zone square: the backward Ls are offered (a4/e4/a3/e3)', [32, 36, 41, 43].every(x => mvD.includes(x)));
  check('dry zone square: a dry piece gets no 1+1 diagonal steps (b6/d6/b4/d4)', [17, 19, 33, 35].every(x => !mvD.includes(x)));
  check('dry zone square: NO forward L that leaves the river', [8, 12, 40, 44, 16, 20].every(x => !mvD.includes(x)));
  // Slides stop at the water: empowered rook on d2 (51) slides up the file
  // to d3, then d4 (river) is the last square — never d5+.
  const stR = E.newGame('main', 1, { board: boardWith([[51, C('w', { empowered: 'R' })], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvR = movesFrom(E.legalMoves(stR), 51);
  check('rook slide stops at the first river square (d4)', mvR.includes(43) && mvR.includes(35), 'got ' + mvR.join(','));
  check('rook slide never passes the river (no d5/d6/d7/d8)', [27, 19, 11, 3].every(x => !mvR.includes(x)));
  check('rook slide along the rank is unaffected (a2..h2)', [48, 49, 50, 52, 53, 54, 55].every(x => mvR.includes(x)));
  // A slide may still capture ON the river square, then stops.
  const stRC = E.newGame('main', 1, { board: boardWith([[51, C('w', { empowered: 'R' })], [35, C('b')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvRC = movesFrom(E.legalMoves(stRC), 51);
  check('rook slide captures on the river square (d4) and stops', mvRC.includes(35) && !mvRC.includes(27));
  // Bishop diagonal stops at the water: b2 (49) -> c3, then d4 (river).
  const stBi = E.newGame('main', 1, { board: boardWith([[49, C('w', { empowered: 'B' })], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvBi = movesFrom(E.legalMoves(stBi), 49);
  check('bishop slide stops at the first river square (d4)', mvBi.includes(42) && mvBi.includes(35) && !mvBi.includes(28) && !mvBi.includes(21));
  // Black rook from the far side: d7 (11) slides down to d6, d5, then d4.
  const stBR = E.newGame('main', 1, { board: boardWith([[11, C('b', { empowered: 'R' })], [63, C('w')]]), river: E.FIXED_RIVER, turn: 'b' });
  const mvBR = movesFrom(E.legalMoves(stBR), 11);
  check('rook slide from the far side stops at the river (d4)', [19, 27, 35].every(x => mvBR.includes(x)) && [43, 51, 59].every(x => !mvBR.includes(x)));
  // Pawn capture + mini L to the same square is listed once.
  const stDu = E.newGame('main', 1, { board: boardWith([[43, C('w')], [34, C('b')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvDu = movesFrom(E.legalMoves(stDu), 43);
  check('pawn capture and mini L to the same square are one move', mvDu.filter(x => x === 34).length === 1 && mvDu.length === 9, 'got ' + mvDu.join(','));
  // 12x12 bank: White on f7 (89, row 7, one rank below the zone rows 5-6).
  const st12 = E.newGame('main', 1, { board: boardWith([[89, C('w')], [0, C('b')]]), river: E.FIXED_RIVER_12, turn: 'w', size: 12 });
  const mv12 = movesFrom(E.legalMoves(st12), 89);
  check('12x12 bank: forward Ls become mini Ls (76/78)', [76, 78].every(x => mv12.includes(x)), 'got ' + mv12.join(','));
  check('12x12 bank: forward 2+1 jumps over the river are gone (64/66)', [64, 66].every(x => !mv12.includes(x)));
  check('12x12 bank: lateral Ls stay full (75/79)', [75, 79].every(x => mv12.includes(x)));
  // Regression, Nov 27 2026 (screenshot 1): White on b3 (41). The river
  // curves, so the water in file a sits on rank 5 (a5) while the water in
  // file c sits on rank 4 (c4). The left forward L lands on water (a5),
  // so it stays a full L; the right one would land on dry c5, so it
  // shrinks to the mini L (c4). The old row-based rule shrank both.
  const stB3 = E.newGame('main', 1, { board: boardWith([[41, C('w')], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvB3 = movesFrom(E.legalMoves(stB3), 41);
  check('curved river, bank b3: left forward L stays full (a5)', mvB3.includes(24), 'got ' + mvB3.join(','));
  check('curved river, bank b3: no left mini L (a4)', !mvB3.includes(32));
  check('curved river, bank b3: right forward L shrinks to mini L (c4)', mvB3.includes(34) && !mvB3.includes(26));
  check('curved river, bank b3: 8 moves total', mvB3.length === 8, 'got ' + mvB3.join(','));
  // Regression, Nov 27 2026 (screenshot 2): White on g4 (38), a dry square
  // inside the zone. The forward diagonal to f5 crosses the river's bend
  // (f4 and g5 are both water), so it is forbidden; the forward diagonal
  // to h5 (water) is fine, the pawn step to g5 is fine, and the backward
  // Ls are regular full Ls (retreat is never restricted).
  const stG4 = E.newGame('main', 1, { board: boardWith([[38, C('w', { hasMoved: true })], [0, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvG4 = movesFrom(E.legalMoves(stG4), 38);
  check('curved river, g4: no free 1+1 steps for a dry piece (f5/f3/h3)', [29, 45, 47].every(x => !mvG4.includes(x)), 'got ' + mvG4.join(','));
  check('curved river, g4: blocked forward L shrinks to a mini L into the water (h5)', mvG4.includes(31));
  check('curved river, g4: blocked forward L with a dry mini L is just gone (f5)', !mvG4.includes(29));
  check('curved river, g4: no in-zone L for a dry piece (e5)', !mvG4.includes(28));
  check('curved river, g4: pawn step forward is fine (g5)', mvG4.includes(30));
  check('curved river, g4: backward Ls are regular (f2/h2/e3)', [53, 55, 44].every(x => mvG4.includes(x)));
  check('curved river, g4: no forward L leaves the river (f6/h6)', [21, 23].every(x => !mvG4.includes(x)));
  check('curved river, g4: 5 moves total', mvG4.length === 5, 'got ' + mvG4.join(','));
  // Regression, Nov 27 2026 (screenshot 3, 12x12 Random, seed 2021622213):
  // White on k6 (82), a DRY square inside the zone — the river at file k
  // sits on rank 7 (k7), so k6 is not in the water. The river is
  // a7 b7 c7 d6 e6 f6 g6 h7 i6 j6 k7 l7. A dry piece gets no free 1+1 steps
  // (so no j5/l5) and no in-zone L (so no i7, whose (1+2) path runs over
  // the water at j6/i6). Backward Ls are regular; the blocked forward L
  // to l8 shrinks to a mini L into the water at l7.
  const K6_RIVER = [60, 61, 62, 67, 70, 71, 75, 76, 77, 78, 80, 81];
  const stK6 = E.newGame('main', 1, { board: boardWith([[82, C('w', { hasMoved: true })], [0, C('b')]]), river: K6_RIVER, turn: 'w', size: 12 });
  const mvK6 = movesFrom(E.legalMoves(stK6), 82);
  check('dry zone k6: no free 1+1 steps (j5/l5)', [93, 95].every(x => !mvK6.includes(x)), 'got ' + mvK6.join(','));
  check('dry zone k6: no in-zone L over the water (i7)', !mvK6.includes(68));
  check('dry zone k6: blocked forward L shrinks to a mini L into the water (l7)', mvK6.includes(71));
  check('dry zone k6: blocked forward L with a dry mini L is just gone (j7)', !mvK6.includes(69));
  check('dry zone k6: backward Ls are regular (j4/l4/i5)', [105, 107, 92].every(x => mvK6.includes(x)));
  check('dry zone k6: pawn step into the water is fine (k7)', mvK6.includes(70));
  check('dry zone k6: 5 moves total', mvK6.length === 5, 'got ' + mvK6.join(','));
  // Regression, Nov 27 2026 (screenshot 4, 8x8 Random, seed 838240930):
  // White on e3 (44, bank, dry) — the river is a4 b4 c4 d4 e4 f5 g4 h4.
  // The pawn double-step to e5 (28) passes over the water at e4 and lands
  // on dry land, so it is blocked even on the first move.
  const E3_RIVER = [29, 32, 33, 34, 35, 36, 38, 39];
  const stE3 = E.newGame('main', 1, { board: boardWith([[44, C('w')], [0, C('b')]]), river: E3_RIVER, turn: 'w' });
  const mvE3 = movesFrom(E.legalMoves(stE3), 44);
  check('pawn double-step over water to dry land is blocked, even first move (e5)', !mvE3.includes(28), 'got ' + mvE3.join(','));
  check('pawn step into the water is fine (e4)', mvE3.includes(36));
  check('e3: 9 moves total', mvE3.length === 9, 'got ' + mvE3.join(','));
  // Regression, Nov 27 2026 (screenshot 5, 8x8, river a5 b5 c5 d5 e5 f5 g5
  // h4): White on h2 (55). The forward L to g4 (38) passes over the water
  // at h4, but g4 is NOT past the water in its file (the water at file g
  // sits on rank 5), so the jump stays on the same side and is a full L.
  // A move is blocked only when its destination lands past the water.
  const H2_RIVER = [24, 25, 26, 27, 28, 29, 30, 39];
  const stH2 = E.newGame('main', 1, { board: boardWith([[55, C('w')], [0, C('b')]]), river: H2_RIVER, turn: 'w' });
  const mvH2 = movesFrom(E.legalMoves(stH2), 55);
  check('jump over water to the same side is a full L (h2->g4)', mvH2.includes(38), 'got ' + mvH2.join(','));
  check('h2: 5 moves total', mvH2.length === 5, 'got ' + mvH2.join(','));
  // A pawn capture across the river is blocked even to kill: White on d5
  // (27, dry zone) with Black on c6 (18) and e6 (20) — both are on the far
  // side, so the captures, the step to d6 (19) and the double to d7 (11)
  // are all forbidden. Only the 4 backward Ls remain.
  const stCap = E.newGame('main', 1, { board: boardWith([[27, C('w')], [56, C('w')], [18, C('b')], [20, C('b')]]), river: E.FIXED_RIVER, turn: 'w' });
  const mvCap = movesFrom(E.legalMoves(stCap), 27);
  check('pawn capture across the river is blocked even to kill (c6/e6)', [18, 20].every(x => !mvCap.includes(x)), 'got ' + mvCap.join(','));
  check('pawn step/double across the river is blocked (d6/d7)', [19, 11].every(x => !mvCap.includes(x)));
  check('pawn capture across the river: 4 moves total', mvCap.length === 4, 'got ' + mvCap.join(','));
  // A bishop cannot slip diagonally between two staggered river squares:
  // White bishop on b5 (85, 12x12, river a7 b7 c7 d6 e6 f6 g6 h7 i6 j6 k7
  // l7) slides up-right through c6 (74) and d5 (63) — both dry zone
  // squares — but must stop before e4 (52), on the far side.
  const stBi2 = E.newGame('main', 1, { board: boardWith([[85, C('w', { empowered: 'B', hasMoved: true })], [0, C('b')]]), river: K6_RIVER, turn: 'w', size: 12 });
  const mvBi2 = movesFrom(E.legalMoves(stBi2), 85);
  check('bishop slide slips between staggered water squares but stops before the water in the next file (c6, not d5)', mvBi2.includes(74) && !mvBi2.includes(63), 'got ' + mvBi2.join(','));
  check('bishop slide never steps onto the far side (e4)', !mvBi2.includes(52));
}

console.log('Last-unit empowerment:');
{
  // White e4 (36) + a1 (56); Black d6 (19) + a8 (0). White knight 36->19 captures.
  function setup() {
    return E.newGame('main', 1, { board: boardWith([[36, C('w')], [56, C('w')], [19, C('b')], [0, C('b')]]), river: [], turn: 'w' });
  }
  const st = setup();
  const mv = E.doMove(st, { from: 36, to: 19 });
  check('knight captures, leaving Black with one piece', !!mv && E.countPieces(st.board, 'b') === 1);
  check('last unit triggers pending empowerment for Black', st.pendingEmpower === 'b' && st.turn === 'b');
  check('no moves allowed while empowerment is pending', E.doMove(st, { from: 0, to: 8 }) === null);
  check('bot empowerment choice is Rook or Bishop', ['R','B'].includes(E.botEmpowerChoice(st, 'b')));
  const okR = E.resolveEmpower(st, 'R');
  check('resolving empowerment to Rook works', okR && st.board[0].empowered === 'R' && st.pendingEmpower === null);
  const mvR = movesFrom(E.legalMoves(st), 0);
  check('empowered rook slides along rank 8 and file a', mvR.includes(1) && mvR.includes(7) && mvR.includes(8) && mvR.includes(48));
  check('empowered rook captures the white piece on a1', mvR.includes(56));
  check('empowered piece keeps its knight jumps', mvR.includes(10) && mvR.includes(17));
  check('empowered piece keeps its pawn step (a7)', mvR.includes(8));
  check('rook power does NOT slide diagonally', !mvR.includes(9));
  // Bishop variant
  const stB = setup();
  E.doMove(stB, { from: 36, to: 19 });
  E.resolveEmpower(stB, 'B');
  const mvB = movesFrom(E.legalMoves(stB), 0);
  check('empowered bishop slides diagonally (b7, e4 capture)', mvB.includes(9) && mvB.includes(36));
  check('bishop power does NOT slide along the rank', !mvB.includes(1));
  check('empowered bishop keeps its knight jumps', mvB.includes(10) && mvB.includes(17));
  check('invalid empowerment choice rejected', E.resolveEmpower(setup(), 'Q') === false);
  // Win: capture the last piece
  const stW = E.newGame('main', 1, { board: boardWith([[36, C('w')], [56, C('w')], [19, C('b')]]), river: [], turn: 'w' });
  const mvW = E.doMove(stW, { from: 36, to: 19 });
  check('capturing the last enemy piece wins the game', !!mvW && stW.over && stW.winner === 'w');
}

console.log('No stalemate: a side with pieces always has a move:');
{
  // Knight moves connect the whole board, so a side is only ever stuck if
  // its pieces form a knight-closed set — for a connected graph that means
  // the whole board, i.e. the other side is already gone and the game is
  // over. The pass rule is kept as a guard; verify it never fires in play.
  let zeroMove = 0;
  for (let s = 1; s <= 200; s++) {
    const st = E.newGame(s % 2 ? 'random' : 'main', s * 131 + 7);
    if (!st.over && E.legalMoves(st).length === 0) zeroMove++;
  }
  check('200 fresh setups: the side to move always has a move', zeroMove === 0);
  // And in the middle of bot games too (checked again below).
  const st = E.newGame('main', 1);
  E.doMove(st, E.botMove(st, 'medium'));
  check('passNote stays empty in normal play', (st.passNote || '') === '');
}

console.log('Voluntary pass (doPass):');
{
  // A pass flips the turn, is recorded in history, and notes itself.
  const st = E.newGame('main', 1, { board: boardWith([[52, C('w')], [56, C('w')], [0, C('b')], [7, C('b')]]), river: [], turn: 'w' });
  check('pass succeeds on your turn', E.doPass(st) === true);
  check('pass flips the turn', st.turn === 'b');
  check('pass is a history entry', st.history.length === 1 && st.history[0].pass === true && st.history[0].color === 'w');
  check('pass sets the pass note', st.passNote === 'White passed.');
  check('one pass does not end the game', !st.over);
  // A real move after a pass resets the chain — no draw.
  const mv = E.doMove(st, { from: 0, to: 8 });
  check('opponent can still move after a pass', !!mv);
  check('a real move resets consecPasses', st.consecPasses === 0);
  check('no draw after pass + move', !st.over);
  // Two passes in a row end the game as a draw.
  const st2 = E.newGame('main', 1, { board: boardWith([[52, C('w')], [56, C('w')], [0, C('b')], [7, C('b')]]), river: [], turn: 'w' });
  E.doPass(st2);
  check('second pass in a row ends the game', E.doPass(st2) === true && st2.over);
  check('two passes = draw, no winner', st2.winner === null && st2.reason === 'Both sides passed in a row — draw.');
  check('pass history survives serialize/deserialize', (() => {
    const s2 = E.deserializeState(E.serializeState(st2));
    return s2.consecPasses === 2 && s2.history.length === 2 && s2.history[1].pass === true && s2.over;
  })());
  // No passing while an empowerment choice is pending, or after game over.
  const stE = E.newGame('main', 1, { board: boardWith([[36, C('w')], [56, C('w')], [19, C('b')], [0, C('b')]]), river: [], turn: 'w' });
  E.doMove(stE, { from: 36, to: 19 });
  check('no pass while empowerment is pending', stE.pendingEmpower === 'b' && E.doPass(stE) === false);
  const stW = E.newGame('main', 1, { board: boardWith([[36, C('w')], [56, C('w')], [19, C('b')]]), river: [], turn: 'w' });
  E.doMove(stW, { from: 36, to: 19 });
  check('no pass after the game is over', stW.over && E.doPass(stW) === false);
}

console.log('Full bot-vs-bot games terminate sensibly:');
{
  let wins = 0, draws = 0, ongoing = 0, errors = 0, zeroMoveMid = 0;
  for (let s = 1; s <= 30; s++) {
    try {
      const st = E.newGame(s % 3 === 0 ? 'random' : s % 3 === 1 ? 'main' : 'choose', s * 7919, s % 3 === 2 ? { whiteFormation: 'roman', blackFormation: 'mongolian', riverMode: 'fixed' } : {});
      let guard = 0;
      while (!st.over && guard < 3000) {
        if (st.pendingEmpower) { E.resolveEmpower(st, E.botEmpowerChoice(st, st.pendingEmpower)); continue; }
        if (E.legalMoves(st).length === 0) { zeroMoveMid++; break; }
        const m = E.botMove(st, 'medium');
        if (!m) break;
        E.doMove(st, m); guard++;
      }
      if (st.over) { if (st.winner) wins++; else draws++; }
      else { ongoing++; }
    } catch (e) { errors++; console.log('  ERROR seed ' + s + ': ' + e.message); }
  }
  check('30 bot-vs-bot games: 0 engine errors', errors === 0);
  check('no zero-move position mid-game', zeroMoveMid === 0);
  check('bot games end in wins, draws or are still going (' + wins + ' wins, ' + draws + ' draws, ' + ongoing + ' ongoing)', wins + draws + ongoing === 30);
}

console.log('Serialization round-trip:');
{
  const st = E.newGame('random', 99);
  for (let i = 0; i < 6 && !st.over; i++) {
    if (st.pendingEmpower) { E.resolveEmpower(st, E.botEmpowerChoice(st, st.pendingEmpower)); continue; }
    const m = E.botMove(st, 'easy'); if (!m) break; E.doMove(st, m);
  }
  const s2 = E.deserializeState(E.serializeState(st));
  check('state survives serialize/deserialize', JSON.stringify(s2.board) === JSON.stringify(st.board) && s2.turn === st.turn && JSON.stringify(s2.river) === JSON.stringify(st.river) && s2.whiteFormation === st.whiteFormation && s2.pendingEmpower === st.pendingEmpower);
  check('boardKey is stable across the round-trip', E.boardKey(s2) === E.boardKey(st));
}

console.log('12x12 formations — exact squares (28 pieces a side):');
{
  // Roman 12, White (nearest rank first): row12 b,d-i,k; row11 a,c-j,l; row10 d-i; row9 e-h
  const rw = [133,135,136,137,138,139,140,142,120,122,123,124,125,126,127,128,129,131,111,112,113,114,115,116,100,101,102,103];
  // Roman 12, Black (mirrored): row1 b,d-i,k; row2 a,c-j,l; row3 d-i; row4 e-h
  const rb = [1,3,4,5,6,7,8,10,12,14,15,16,17,18,19,20,21,23,27,28,29,30,31,32,40,41,42,43];
  // Mongolian 12, White: row12 c-j; row11 b-e,h-k; row10 a-d,i-l; row9 a,b,k,l
  const mw = [134,135,136,137,138,139,140,141,121,122,123,124,127,128,129,130,108,109,110,111,116,117,118,119,96,97,106,107];
  // Mongolian 12, Black: row1 c-j; row2 b-e,h-k; row3 a-d,i-l; row4 a,b,k,l
  const mb = [2,3,4,5,6,7,8,9,13,14,15,16,19,20,21,22,24,25,26,27,32,33,34,35,36,37,46,47];
  const sRR = E.genSetup('choose', 7, { whiteFormation: 'roman', blackFormation: 'roman', riverMode: 'off', boardSize: 12 });
  check('Roman/Roman 12x12: white on the exact Roman squares', sameSet(squaresOf(sRR.board, 'w'), rw));
  check('Roman/Roman 12x12: black on the exact Roman squares', sameSet(squaresOf(sRR.board, 'b'), rb));
  const sMM = E.genSetup('choose', 7, { whiteFormation: 'mongolian', blackFormation: 'mongolian', riverMode: 'off', boardSize: 12 });
  check('Mongolian/Mongolian 12x12: white on the exact Mongolian squares', sameSet(squaresOf(sMM.board, 'w'), mw));
  check('Mongolian/Mongolian 12x12: black on the exact Mongolian squares', sameSet(squaresOf(sMM.board, 'b'), mb));
  for (const s of [sRR, sMM]) {
    check('12x12: 28 pieces a side', E.countPieces(s.board, 'w') === 28 && E.countPieces(s.board, 'b') === 28);
    check('12x12: board has 144 squares', s.board.length === 144 && s.size === 12);
  }
  const main12 = E.genSetup('main', 7, { riverMode: 'fixed', boardSize: 12 });
  check('Main 12x12: White Mongolian, Black Roman', main12.whiteFormation === 'mongolian' && main12.blackFormation === 'roman');
  check('Main 12x12: river is the fixed 12x12 river', JSON.stringify(main12.river) === JSON.stringify(E.FIXED_RIVER_12));
  check('Main 12x12: Mongolian (White) moves first', main12.turn === 'w');
  check('sqName works on 12x12 (a12, f6, l1)', E.sqName(0, 12) === 'a12' && E.sqName(77, 12) === 'f6' && E.sqName(143, 12) === 'l1');
}

console.log('The user\'s 12x12 board (White Roman, Black Mongolian, fixed river):');
{
  const s = E.genSetup('choose', 7, { whiteFormation: 'roman', blackFormation: 'mongolian', riverMode: 'fixed', boardSize: 12 });
  const expected = {};
  const put = (row, cols, color) => { for (const c of cols) expected[row * 12 + c] = color; };
  put(0, [2,3,4,5,6,7,8,9], 'b'); put(1, [1,2,3,4,7,8,9,10], 'b'); put(2, [0,1,2,3,8,9,10,11], 'b'); put(3, [0,1,10,11], 'b');
  put(8, [4,5,6,7], 'w'); put(9, [3,4,5,6,7,8], 'w'); put(10, [0,2,3,4,5,6,7,8,9,11], 'w'); put(11, [1,3,4,5,6,7,8,10], 'w');
  let ok = true;
  for (let i = 0; i < 144; i++) {
    const want = expected[i] || null;
    const got = s.board[i] ? s.board[i].c : null;
    if (want !== got) { ok = false; console.log('   square ' + i + ': want ' + want + ' got ' + got); }
  }
  check('12x12 example board pieces match exactly', ok);
  check('12x12 fixed river is ranks 7+6, a/b/c/j/k/l + d/e/f/g/h/i', JSON.stringify(s.river) === JSON.stringify([60,61,62,69,70,71,75,76,77,78,79,80]));
  check('White moves first on the 12x12 example too', s.turn === 'w');
}

console.log('12x12 fixed river:');
{
  check('FIXED_RIVER_12 is exactly the example pattern', JSON.stringify(E.FIXED_RIVER_12) === JSON.stringify([60,61,62,69,70,71,75,76,77,78,79,80]));
  check('12x12 fixed river is connected', E.riverConnected(E.FIXED_RIVER_12, 12));
  const perFile = {};
  for (const i of E.FIXED_RIVER_12) { perFile[i % 12] = (perFile[i % 12] || 0) + 1; }
  check('12x12 fixed river: exactly one square per file', Object.keys(perFile).length === 12 && Object.values(perFile).every(n => n === 1));
  check('12x12 fixed river: every square on rank 6 or 7', E.FIXED_RIVER_12.every(i => { const rank = 12 - ((i / 12) | 0); return rank === 6 || rank === 7; }));
}

console.log('12x12 random mode:');
{
  let sawRomanW = false, sawMongolW = false;
  for (let s = 1; s <= 200; s++) {
    const g = E.genSetup('random', s, { boardSize: 12 });
    if (g.whiteFormation === 'roman') sawRomanW = true; else sawMongolW = true;
    if (g.river.length !== 12) throw new Error('seed ' + s + ': river has ' + g.river.length + ' squares');
    const perFile = {};
    for (const i of g.river) {
      perFile[i % 12] = (perFile[i % 12] || 0) + 1;
      const rank = 12 - ((i / 12) | 0);
      if (rank !== 6 && rank !== 7) throw new Error('seed ' + s + ': river square on rank ' + rank);
    }
    if (Object.keys(perFile).length !== 12 || Object.values(perFile).some(n => n !== 1))
      throw new Error('seed ' + s + ': river is not exactly one square per file');
    if (!E.riverConnected(g.river, 12)) throw new Error('seed ' + s + ': random river is not connected');
    if (E.countPieces(g.board, 'w') !== 28 || E.countPieces(g.board, 'b') !== 28)
      throw new Error('seed ' + s + ': piece counts wrong');
  }
  check('200 seeds: 12x12 random river is always 12 squares, one per file, ranks 6/7, connected', true);
  check('12x12 random formations vary for White', sawRomanW && sawMongolW);
  const a = JSON.stringify(E.genSetup('random', 42, { boardSize: 12 })), b = JSON.stringify(E.genSetup('random', 42, { boardSize: 12 }));
  check('same seed reproduces identical 12x12 random setup', a === b);
}

console.log('12x12 moves:');
{
  // Centre f6 (77), no river: 8 knight + pawn 1 + pawn 2 = 10
  const st = E.newGame('main', 1, { board: boardWith([[77, C('w')], [0, C('b')]]), river: [], turn: 'w', size: 12 });
  const mv = movesFrom(E.legalMoves(st), 77);
  check('12x12 knight in the open: 8 jumps + pawn 1 + pawn 2 = 10', mv.length === 10, 'got ' + mv.join(','));
  check('12x12 knight jumps land on the right squares', [52,54,63,67,87,91,100,102].every(x => mv.includes(x)));
  // Same square IS a river square in the fixed 12x12 river: only 1+1 diagonals + pawn 1
  const stR = E.newGame('main', 1, { board: boardWith([[77, C('w')], [0, C('b')]]), river: E.FIXED_RIVER_12, turn: 'w', size: 12 });
  const mvR = movesFrom(E.legalMoves(stR), 77);
  check('12x12 knight from the river: 4 diagonals + pawn 1 = 5', mvR.length === 5, 'got ' + mvR.join(','));
  check('12x12 river knight diagonals are e7/g7/e5/g5', [64,66,88,90].every(x => mvR.includes(x)));
  check('12x12 river knight does NOT complete the L past the water in its file (d7/h7)', [63,67].every(x => !mvR.includes(x)));
  check('12x12 river knight never does a full L from inside the water (d7/h7/d5/h5/e4/g4)', [63,67,87,91,100,102].every(x => !mvR.includes(x)));
  check('12x12 river knight has NO forward L that leaves the river and no double-step', [52,54,53].every(x => !mvR.includes(x)));
}

console.log('12x12 bot games + serialization:');
{
  let wins = 0, ongoing = 0, errors = 0, zeroMoveMid = 0;
  for (let s = 1; s <= 10; s++) {
    try {
      const st = E.newGame(s % 2 ? 'random' : 'main', s * 7919, { boardSize: 12 });
      let guard = 0;
      while (!st.over && guard < 4000) {
        if (st.pendingEmpower) { E.resolveEmpower(st, E.botEmpowerChoice(st, st.pendingEmpower)); continue; }
        if (E.legalMoves(st).length === 0) { zeroMoveMid++; break; }
        const m = E.botMove(st, 'medium');
        if (!m) break;
        E.doMove(st, m); guard++;
      }
      if (st.over) { if (st.winner) wins++; }
      else { ongoing++; }
    } catch (e) { errors++; console.log('  ERROR seed ' + s + ': ' + e.message); }
  }
  check('10 bot-vs-bot 12x12 games: 0 engine errors', errors === 0);
  check('no zero-move position mid-game on 12x12', zeroMoveMid === 0);
  check('12x12 bot games end in wins or are still going (' + wins + ' wins, ' + ongoing + ' ongoing)', wins + ongoing === 10);
  const st = E.newGame('random', 99, { boardSize: 12 });
  for (let i = 0; i < 6 && !st.over; i++) {
    if (st.pendingEmpower) { E.resolveEmpower(st, E.botEmpowerChoice(st, st.pendingEmpower)); continue; }
    const m = E.botMove(st, 'easy'); if (!m) break; E.doMove(st, m);
  }
  const s2 = E.deserializeState(E.serializeState(st));
  check('12x12 state survives serialize/deserialize (size kept)', s2.size === 12 && JSON.stringify(s2.board) === JSON.stringify(st.board) && JSON.stringify(s2.river) === JSON.stringify(st.river));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
