'use strict';
/* Headless harness: minimal DOM stub + vm sandbox to execute CURSED PAWN. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAME_DIR = path.resolve(__dirname, '..', '..');

function makeEl(tag) {
  const classes = new Set();
  const children = [];
  const listeners = {};
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    parentNode: null,
    style: {
      setProperty(k, v) { this[k] = v; },
      removeProperty(k) { delete this[k]; },
      getPropertyValue(k) { return this[k] == null ? '' : this[k]; }
    },
    dataset: {},
    _text: '',
    _classes: classes,
    disabled: false,
    value: '',
    offsetWidth: 120,
    offsetHeight: 40,
    _listeners: listeners,
    appendChild(c) { children.push(c); c.parentNode = el; return c; },
    removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); },
    remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    setAttribute(k, v) { el.dataset[k] = String(v); },
    getAttribute(k) { return el.dataset[k] == null ? null : el.dataset[k]; },
    querySelectorAll(sel) { return descendants(el).filter(n => matches(n, sel)); },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || makeEl('div'); },
    getBoundingClientRect() { return { left: 10, top: 10, right: 110, bottom: 50, width: 100, height: 40 }; },
    get classList() {
      return {
        add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); }
          else if (force) classes.add(c); else classes.delete(c);
        },
        contains: (c) => classes.has(c)
      };
    },
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
    get textContent() { return el._text + children.map(c => c.textContent).join(''); },
    set textContent(v) { el._text = String(v); children.length = 0; },
    get innerHTML() { return ''; },
    set innerHTML(v) { el._text = ''; children.length = 0; }
  };
  Object.defineProperty(el, 'children', { get: () => children });
  return el;
}

function descendants(root) {
  const out = [];
  (function walk(node) {
    (node.children || []).forEach(c => { out.push(c); walk(c); });
  })(root);
  return out;
}

function matches(node, sel) {
  sel = String(sel).trim();
  if (sel.startsWith('.')) return node._classes && node._classes.has(sel.slice(1));
  if (sel.startsWith('#')) return node._id === sel.slice(1);
  if (sel.startsWith('[')) return false;
  return node.tagName === sel.toUpperCase();
}

function makeDocument() {
  const byId = {};
  const doc = {
    readyState: 'complete',
    documentElement: makeEl('html'),
    body: makeEl('body'),
    title: '',
    createElement: (tag) => makeEl(tag),
    getElementById(id) {
      if (!byId[id]) { const e = makeEl('div'); e._id = id; byId[id] = e; }
      return byId[id];
    },
    querySelector(sel) {
      if (sel === '#overlay-result .result-modal') return doc.getElementById('__result_modal');
      return makeEl('div');
    },
    querySelectorAll(sel) {
      if (sel === '.screen') return [doc.getElementById('screen-title'), doc.getElementById('screen-game')];
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    _byId: byId
  };
  return doc;
}

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store
  };
}

function buildSandbox(opts) {
  const document = makeDocument();
  const storage = makeStorage();
  const sandbox = {
    console: {
      log: (...a) => { if (opts.verbose) console.log('[game]', ...a); },
      warn: (...a) => { if (opts.verbose) console.log('[game:warn]', ...a); },
      info: () => {},
      error: (...a) => console.log('[game:error]', ...a)
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, parseInt, parseFloat,
    document,
    localStorage: storage,
    navigator: { userAgent: 'harness' },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    fetch: opts.fetch
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return { sandbox, document, storage };
}

function runGame(sandbox) {
  const i18n = fs.readFileSync(path.join(GAME_DIR, 'js/i18n.js'), 'utf8');
  const audio = fs.readFileSync(path.join(GAME_DIR, 'js/audio.js'), 'utf8');
  const game = fs.readFileSync(path.join(GAME_DIR, 'js/game.js'), 'utf8');
  vm.runInContext(i18n, sandbox, { filename: 'i18n.js' });
  vm.runInContext(audio, sandbox, { filename: 'audio.js' });
  vm.runInContext(game, sandbox, { filename: 'game.js' });
}

module.exports = { buildSandbox, runGame, makeEl, GAME_DIR };
