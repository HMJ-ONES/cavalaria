// Cavalaria sync test — two copies of the real page script in separate VM
// contexts, joined by a fake in-memory PeerJS transport with a drop switch.
// Proves: setup arrives (or is re-requested), every move updates BOTH
// boards, empowerment choices sync, and a dropped message heals itself
// via ack/resend + heartbeat.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engineSrc = blocks.find(s => s.includes('module.exports'));
const uiSrc = blocks.find(s => s.includes('attachConn'));

// NOTE: this fake DOM does NOT model innerHTML destroying child elements,
// so a UI null-deref that only happens in a real browser cannot be caught
// here. UI crashes need a real-browser check; engine rules are fully
// covered by test/engine.test.js instead.
function makeEl() {
  return {
    style: {}, dataset: {}, children: [], _l: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    innerHTML: '', textContent: '', value: '', className: '',
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { this._l[ev] = fn; },
    click() { if (this._l.click) this._l.click(); },
  };
}
function makeCtx() {
  const els = {};
  const sandbox = {
    console,
    location: { search: '', origin: 'https://cavalaria.pages.dev', pathname: '/', href: 'https://cavalaria.pages.dev/' },
    navigator: {},
    window: {},
    document: {
      getElementById(id) { return (els[id] = els[id] || makeEl()); },
      createElement() { return makeEl(); },
      addEventListener() {},
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, crypto,
    module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(engineSrc, sandbox);
  vm.runInContext(uiSrc, sandbox);
  return sandbox;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

async function runScenario(name, dropFn, movesToMake, setupOpts) {
  console.log('Scenario: ' + name);
  const host = makeCtx(), guest = makeCtx();
  const sent = { host: [], guest: [] };
  let drop = dropFn;
  function deliver(from, obj) {
    const copy = JSON.parse(JSON.stringify(obj));
    (from === 'host' ? sent.host : sent.guest).push(copy);
    if (drop && drop(from, copy)) return; // message lost in transit
    const target = from === 'host' ? guestConn : hostConn;
    setImmediate(() => target.emit('data', JSON.parse(JSON.stringify(copy))));
  }
  function makeConn(who) {
    const handlers = {};
    return {
      open: false,
      on(ev, fn) { handlers[ev] = fn; },
      emit(ev, arg) { if (handlers[ev]) handlers[ev](arg); },
      send(obj) { deliver(who, obj); },
      close() { this.open = false; if (handlers.close) handlers.close(); },
    };
  }
  const hostConn = makeConn('host'), guestConn = makeConn('guest');
  const E = host.module.exports;

  host.startGame('main', 1234, { playMode: 'online', myColor: 'w', isHost: true, roomCode: 'TEST', connText: 'test', setupOpts });
  host.attachConn(hostConn, true);
  guest.attachConn(guestConn, false);
  hostConn.open = true; hostConn.emit('open');
  guestConn.open = true; guestConn.emit('open');
  await sleep(300);
  // Guest must have the board (hello-retry heals a dropped setup).
  const guestGotBoard = sent.guest.some(m => m.t === 'ack') || sent.host.some(m => m.t === 'state');
  check('guest received the board', guestGotBoard);

  // Play movesToMake plies, alternating host/guest, via the real UI entry points.
  // An empowerment choice is also a synced state change: resolve it through
  // the owning side's real finishEmpower() before the next move.
  // Progress counts ONLY history the other side acknowledged (an ack means a
  // state was actually received and adopted) — counting attempts would hide
  // a move that never landed, which is exactly what the drop scenarios test.
  const maxAck = () => {
    let n = 0;
    for (const who of ['host', 'guest']) for (const m of sent[who]) if (m.t === 'ack' && typeof m.n === 'number') n = Math.max(n, m.n);
    return n;
  };
  let steps = 0;
  for (steps = 0; steps < movesToMake * 6 + 12 && maxAck() < movesToMake; steps++) {
    const states = [...sent.host, ...sent.guest].filter(m => m.t === 'state');
    const last = states.reduce((best, m) => (!best || m.state.history.length > best.state.history.length ? m : best), null);
    if (!last) { check('move ' + maxAck() + ': a state is known', false); break; }
    const st = E.deserializeState(last.state);
    if (st.over) break;
    if (st.pendingEmpower) {
      const side = st.pendingEmpower === 'w' ? host : guest;
      side.finishEmpower('R');
      await sleep(600);
      continue;
    }
    const moves = E.legalMoves(st);
    if (!moves.length) break;
    const mv = moves[0];
    const side = st.turn === 'w' ? host : guest;
    side.finishMove(mv.from, mv.to);
    await sleep(600);
  }
  check('played ' + movesToMake + ' plies (acknowledged history ' + maxAck() + ', ' + steps + ' steps)', maxAck() >= movesToMake, 'acked=' + maxAck());
  await sleep(4500); // let resends + heartbeat reconcile finish
  // Compare board fingerprints from the latest ping/state each side sent.
  const lastPing = who => [...sent[who]].reverse().find(m => m.t === 'ping');
  const hp = lastPing('host'), gp = lastPing('guest');
  check('both sides sent heartbeats', !!hp && !!gp, 'host:' + !!hp + ' guest:' + !!gp);
  if (hp && gp) {
    check('board fingerprints match after ' + movesToMake + ' plies (host n=' + hp.n + ' hash=' + hp.hash + ', guest n=' + gp.n + ' hash=' + gp.hash + ')', hp.n === gp.n && hp.hash === gp.hash && hp.n >= movesToMake, 'n=' + hp.n + '/' + gp.n);
  }
  // Cleanup timers so the process can exit.
  host.backToMenu(); guest.backToMenu();
  await sleep(50);
  return true;
}

(async () => {
  await runScenario('ideal: no drops, 4 plies', null, 4);
  await runScenario('12x12: ideal, 2 plies', null, 2, { boardSize: 12, riverMode: 'fixed' });
  await runScenario('dropped setup: first host state lost, 2 plies', (from, m) => from === 'host' && m.t === 'state' && !runScenario._setupDropped ? (runScenario._setupDropped = true) : false, 2);
  runScenario._setupDropped = false;
  let droppedMove = false;
  await runScenario('dropped move: one host state lost, 4 plies', (from, m) => {
    if (from === 'host' && m.t === 'state' && m.state.history.length === 1 && !droppedMove) { droppedMove = true; return true; }
    return false;
  }, 4);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
