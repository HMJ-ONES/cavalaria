// Cavalaria i18n test — the 7-language switcher, run in Node with a fake DOM.
// Proves: every key exists in all 7 languages (same params everywhere),
// switching changes the visible text on menu AND in-game screens, the
// choice persists in localStorage, navigator.language is honoured on a
// fresh load, engine reason/pass-note strings translate at render time,
// and every data-i18n attribute in index.html resolves to a real key.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engineSrc = blocks.find(s => s.includes('module.exports'));
const uiSrc = blocks.find(s => s.includes('attachConn'));
if (!engineSrc || !uiSrc) { console.error('FAIL: script blocks not found'); process.exit(1); }

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

// ---- fake DOM: parses the REAL index.html for data-i18n attributes so
// applyI18n() touches the same stub elements the test then inspects. ----
function makeEl(tag) {
  return {
    tagName: tag || 'div', style: {}, dataset: {}, children: [], _l: {}, _attrs: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    innerHTML: '', textContent: '', value: '', className: '', placeholder: '',
    getAttribute(a) { return this._attrs[a] || null; },
    setAttribute(a, v) { this._attrs[a] = v; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { this._l[ev] = fn; },
    click() { if (this._l.click) this._l.click(); },
  };
}
function makeStore(seed) {
  const m = Object.assign({}, seed || {});
  return { getItem(k) { return k in m ? m[k] : null; }, setItem(k, v) { m[k] = String(v); }, _m: m };
}
function makeCtx(navLang, storedLang) {
  const els = {};
  const byAttr = { 'data-i18n': [], 'data-i18n-html': [], 'data-i18n-ph': [] };
  // index every element in the real HTML that carries an i18n attribute
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)>/g;
  let tm;
  while ((tm = tagRe.exec(html)) !== null) {
    const attrs = tm[2] || '';
    if (!/data-i18n/.test(attrs)) continue;
    const el = makeEl(tm[1]);
    const idM = attrs.match(/id="([^"]+)"/);
    if (idM) { el._attrs.id = idM[1]; els[idM[1]] = el; }
    for (const a of Object.keys(byAttr)) {
      const am = attrs.match(new RegExp(a + '="([^"]+)"'));
      if (am) { el._attrs[a] = am[1]; byAttr[a].push(el); }
    }
  }
  const sandbox = {
    console,
    location: { search: '', origin: 'https://cavalaria.pages.dev', pathname: '/', href: 'https://cavalaria.pages.dev/' },
    navigator: { language: navLang || 'en-US' },
    window: {},
    localStorage: makeStore(storedLang ? { lang: storedLang } : {}),
    document: {
      title: '',
      documentElement: { lang: '' },
      getElementById(id) { return (els[id] = els[id] || makeEl()); },
      createElement(tag) { return makeEl(tag); },
      querySelectorAll(sel) { const key = sel.replace(/[\[\]]/g, ''); return byAttr[key] ? byAttr[key].slice() : []; },
      addEventListener() {},
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, crypto,
    module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(engineSrc, sandbox);
  vm.runInContext(uiSrc, sandbox);
  sandbox.__els = els;
  sandbox.__byAttr = byAttr;
  return sandbox;
}
const run = (ctx, code) => vm.runInContext(code, ctx);
const I18N = ctx => run(ctx, 'I18N');
const t = (ctx, key, params) => run(ctx, `t(${JSON.stringify(key)}${params ? ',' + JSON.stringify(params) : ''})`);

const ctx = makeCtx('en-US', null);
const dict = I18N(ctx);
const LANGS = ['en', 'pt', 'es', 'zh', 'ja', 'fr', 'ko'];
const enKeys = Object.keys(dict.en);

console.log('Dictionary coverage:');
check('exactly the 7 languages', LANGS.every(l => l in dict) && Object.keys(dict).length === 7, Object.keys(dict).join(','));
check('en has 100+ keys', enKeys.length >= 100, String(enKeys.length));
for (const l of LANGS) {
  const missing = enKeys.filter(k => !(k in dict[l]));
  const extra = Object.keys(dict[l]).filter(k => !enKeys.includes(k));
  const empty = enKeys.filter(k => typeof dict[l][k] !== 'string' || !dict[l][k].trim());
  check(l + ': all ' + enKeys.length + ' keys present, non-empty, no extras',
    missing.length === 0 && extra.length === 0 && empty.length === 0,
    'missing=' + JSON.stringify(missing) + ' extra=' + JSON.stringify(extra) + ' empty=' + JSON.stringify(empty));
}
{
  const paramsOf = s => [...(s.match(/\{[a-z]+\}/g) || [])].sort().join(',');
  let bad = [];
  for (const l of LANGS) for (const k of enKeys) if (paramsOf(dict.en[k]) !== paramsOf(dict[l][k])) bad.push(l + ':' + k);
  check('same {param} names in every language for every key', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
  // every key renders with no leftover {placeholders} when given its params
  let leftover = [];
  for (const l of LANGS) {
    run(ctx, `setLang(${JSON.stringify(l)})`);
    for (const k of enKeys) {
      const params = {};
      for (const p of [...(dict.en[k].match(/\{([a-z]+)\}/g) || [])]) params[p.slice(1, -1)] = 'X';
      const out = t(ctx, k, params);
      if (/\{|\}/.test(out)) leftover.push(l + ':' + k + ' -> ' + out.slice(0, 60));
    }
  }
  check('every key renders with no leftover {placeholders} in all 7 languages', leftover.length === 0, JSON.stringify(leftover.slice(0, 3)));
  run(ctx, "setLang('en')");
}

console.log('Fallback:');
{
  const ctx2 = makeCtx('en-US', null);
  run(ctx2, "delete I18N.pt.rule1");
  run(ctx2, "setLang('pt')");
  check('missing key falls back to English', t(ctx2, 'rule1') === dict.en.rule1);
  check('unknown key returns the key itself', t(ctx2, 'no-such-key-xyz') === 'no-such-key-xyz');
}

console.log('Switcher placement:');
{
  const selIdx = html.indexOf('id="langSelect"');
  const menuIdx = html.indexOf('id="menuScreen"');
  const gameIdx = html.indexOf('id="gameScreen"');
  check('language select exists in the header, before menu and game screens', selIdx > 0 && selIdx < menuIdx && selIdx < gameIdx);
  const opts = [...html.matchAll(/<option value="(en|pt|es|zh|ja|fr|ko)">/g)].map(m => m[1]);
  check('switcher offers all 7 languages', LANGS.every(l => opts.includes(l)), JSON.stringify(opts));
  check('switcher is a <select> (compact, no overlap with game controls)', /<select id="langSelect"/.test(html));
}

console.log('Attributes resolve:');
{
  const used = new Set();
  for (const a of ['data-i18n', 'data-i18n-html', 'data-i18n-ph']) {
    for (const m of html.matchAll(new RegExp(a + '="([^"]+)"', 'g'))) used.add(m[1]);
  }
  const unknown = [...used].filter(k => !enKeys.includes(k));
  check('every data-i18n(*) attribute in index.html is a real key (' + used.size + ' used)', unknown.length === 0, JSON.stringify(unknown));
  check('no v1.7 left in the file', !html.includes('v1.7'));
  check('footer key carries v1.8 in every language', LANGS.every(l => dict[l].footer.includes('v1.8')));
}

console.log('Switching changes visible text (menu):');
{
  const els = ctx.__els;
  run(ctx, "setLang('pt')");
  check('documentElement.lang is pt', ctx.document.documentElement.lang === 'pt');
  check('choice persisted to localStorage under key lang', ctx.localStorage.getItem('lang') === 'pt');
  const byText = ctx.__byAttr['data-i18n'].find(e => e._attrs['data-i18n'] === 'menuTitle');
  check('menuTitle textContent switches to Portuguese', byText && byText.textContent === dict.pt.menuTitle, byText && byText.textContent);
  const mode2 = ctx.__byAttr['data-i18n-html'].find(e => e._attrs['data-i18n-html'] === 'mode2Desc');
  check('mode2 description innerHTML switches', mode2 && mode2.innerHTML === dict.pt.mode2Desc);
  const ph = ctx.__byAttr['data-i18n-ph'].find(e => e._attrs['data-i18n-ph'] === 'phName');
  check('name placeholder switches', ph && ph.placeholder === dict.pt.phName);
  const btn = ctx.__byAttr['data-i18n-html'].find(e => e._attrs['data-i18n-html'] === 'btnCreate');
  check('Create room button switches', btn && btn.innerHTML === dict.pt.btnCreate);
  const foot = ctx.__byAttr['data-i18n-html'].find(e => e._attrs['data-i18n-html'] === 'footer');
  check('footer switches', foot && foot.innerHTML === dict.pt.footer);
  check('page title switches', ctx.document.title === dict.pt.pageTitle);
  check('nested @param resolves in current language', t(ctx, 'connBot', { level: '@botMedium' }).includes('Médio'));
}

console.log('Switching changes visible text (in game):');
{
  const els = ctx.__els;
  run(ctx, "setLang('ja')");
  run(ctx, "startGame('main', 1234, {playMode:'local', setupOpts:{boardSize:8, riverMode:'fixed'}})");
  check('status shows Japanese White-to-move', els.statusBox.innerHTML.includes('白の番'), els.statusBox.innerHTML.slice(0, 80));
  check('pills show Japanese', els.pillsBox.innerHTML.includes('♘ 白：16'), els.pillsBox.innerHTML.slice(0, 120));
  check('moves box shows Japanese empty text', els.movesBox.innerHTML === dict.ja.movesEmpty, els.movesBox.innerHTML.slice(0, 60));
  check('captured line shows Japanese', els.capWhite.textContent === t(ctx, 'capWhiteTook', { x: '—' }));
  // connection line re-translates on switch (stored as a key, not a string)
  run(ctx, "startGame('main', 1234, {playMode:'bot', myColor:'w', connKey:'connBot', connParams:{level:'@botMedium'}, setupOpts:{boardSize:8, riverMode:'fixed'}})");
  check('bot conn line is Japanese', els.connBox.innerHTML.includes('ボット'), els.connBox.innerHTML.slice(0, 80));
  run(ctx, "setLang('fr')");
  check('bot conn line re-translates to French on switch', els.connBox.innerHTML.includes('Robot'), els.connBox.innerHTML.slice(0, 80));
  check('status re-translates to French on switch', els.statusBox.innerHTML.includes('Aux Blancs de jouer'), els.statusBox.innerHTML.slice(0, 80));
  run(ctx, "setLang('en')");
  check('status back to English', els.statusBox.innerHTML.includes('White to move'), els.statusBox.innerHTML.slice(0, 80));
}

console.log('Empowerment + reason translation at render time:');
{
  const els = ctx.__els;
  // a board with one piece a side, White to move -> last-unit choice pending
  const board = new Array(64).fill(null);
  board[60] = { c: 'w', empowered: null, hasMoved: false };
  board[3] = { c: 'b', empowered: null, hasMoved: false };
  run(ctx, "setLang('es')");
  run(ctx, `startGame('main', 99, {playMode:'local', board:${JSON.stringify(board)}, setupOpts:{boardSize:8, riverMode:'off'}})`);
  check('empower modal text is Spanish', els.empowerText.textContent === t(ctx, 'empowerText', { color: t(ctx, 'colorWhite') }), els.empowerText.textContent);
  check('status shows Spanish last-unit line', els.statusBox.innerHTML.includes('última unidad'), els.statusBox.innerHTML.slice(0, 100));
  check('reason: White wiped out -> Spanish', run(ctx, "translateReason('White has no pieces left. Black wins!')") === dict.es.reasonWhiteOut);
  check('reason: resign -> Spanish', run(ctx, "translateReason('Black resigned.')") === t(ctx, 'reasonResigned', { color: t(ctx, 'colorBlack') }));
  check('reason: unknown string passes through untouched', run(ctx, "translateReason('something odd')") === 'something odd');
  check('pass note -> Spanish', run(ctx, "translatePassNote('White has no moves — turn passes to Black.')") === t(ctx, 'passNote', { color: t(ctx, 'colorWhite'), other: t(ctx, 'colorBlack') }));
  run(ctx, "setLang('en')");
}

console.log('Load-time detection:');
{
  const cKo = makeCtx('fr-FR', 'ko');
  check('stored choice wins over navigator.language', cKo.document.documentElement.lang === 'ko');
  const cEs = makeCtx('es-MX', null);
  check('navigator es-MX maps to es', cEs.document.documentElement.lang === 'es');
  const cZh = makeCtx('zh-TW', null);
  check('navigator zh-TW maps to zh', cZh.document.documentElement.lang === 'zh');
  const cDe = makeCtx('de-DE', null);
  check('unsupported navigator language falls back to en', cDe.document.documentElement.lang === 'en');
  const cPt = makeCtx('pt-BR', null);
  check('navigator pt-BR maps to pt', cPt.document.documentElement.lang === 'pt');
}

console.log('Formation diagrams are real mini-boards:');
{
  const els = ctx.__els;
  const pieces = id => els[id].children.filter(c => c.children.length && c.children[0].tagName === 'img').length;
  const water = id => els[id].children.filter(c => c.textContent === '~').length;
  check('Roman 8x8 shows 16 pieces on 24 squares', els.miniRoman8.children.length === 24 && pieces('miniRoman8') === 16,
    'cells=' + els.miniRoman8.children.length + ' pieces=' + pieces('miniRoman8'));
  check('Mongolian 8x8 shows 16 pieces on 24 squares', els.miniMongolian8.children.length === 24 && pieces('miniMongolian8') === 16);
  check('River 8x8 shows 8 water squares on 16', els.miniRiver8.children.length === 16 && water('miniRiver8') === 8);
  check('Roman 12x12 shows 28 pieces on 48 squares', els.miniRoman12.children.length === 48 && pieces('miniRoman12') === 28);
  check('Mongolian 12x12 shows 28 pieces on 48 squares', els.miniMongolian12.children.length === 48 && pieces('miniMongolian12') === 28);
  check('River 12x12 shows 12 water squares on 24', els.miniRiver12.children.length === 24 && water('miniRiver12') === 12);
  check('no ASCII diagram text left in the file', !html.includes('. . . X X') && !html.includes('X X . . . . X X'));
  check('name placeholder is Alex in every language, never Henrique',
    LANGS.every(l => dict[l].phName.includes('Alex') && !dict[l].phName.includes('Henrique')));
  check('name input default placeholder is e.g. Alex', html.includes('placeholder="e.g. Alex"'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
