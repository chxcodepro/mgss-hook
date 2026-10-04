import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = process.argv[2] || process.env.MGSS_BUNDLE_SOURCE || path.join(root, 'artifacts', 'source', 'game.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const controller = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'assets', 'controller.js'), 'utf8');

// Pull the real ad methods out of the shipped bundle so this test runs the code
// that actually executes on the phone instead of a paraphrase of it.
function method(anchor, next) {
  const start = bundle.indexOf(anchor);
  assert.ok(start > 0, `Missing ${anchor}`);
  const end = bundle.indexOf(`}},{key:"${next}"`, start);
  assert.ok(end > start, `Unterminated ${anchor}`);
  return bundle.slice(start, end + 1);
}

const xjw = new Function('w', `return (${method('function xjw(){var i,s;this.cew=', 'gwa')});`);
const gwa = new Function('M', `return (${method('function gwa(s,e){var h=this.ilu.qgw[e];', 'loadSubpackage')});`);
const facade = new Function('E', 'w', 'T', 'B', 'A', 'D', 'c', `return (${method('function gwa(i){var _this307=this;', 'psk')});`);

// ---------------------------------------------------------------------------
// Fixtures: wx double plus the game-side singletons the ad code touches.
// ---------------------------------------------------------------------------
function realAd(options) {
  const handlers = [];
  return {
    options,
    shown: 0,
    onLoad: () => undefined,
    offLoad: () => undefined,
    onError: () => undefined,
    offError: () => undefined,
    onClose: (handler) => { handlers.push(handler); },
    offClose: () => undefined,
    load: () => Promise.resolve(),
    show: function () { this.shown += 1; return Promise.resolve(); },
    destroy: () => undefined,
    close(result) { handlers.slice().forEach((handler) => handler(result)); },
    get closeHandlers() { return handlers.length; },
  };
}

function platform() {
  const created = [];
  return {
    created,
    api: { createRewardedVideoAd(options) { const ad = realAd(options); created.push(ad); return ad; } },
  };
}

const toasts = [], dots = [];
const player = { npu: 0, fragment: 0 };
const E = { instance: { fli: { prp: {} }, player } };
const O = { instance: { player: { rqp: 7 } } };
const w = { iin: (ms) => toasts.push(ms) };
const c = { kkt: (slot) => dots.push(slot) };
const analytics = { instance: { mvx: () => undefined, cjh: 1, cuu: 2 } };
const clock = { mode: 0, TwoOnline: 7 };
const network = { tgp: false };
const M = { hnj: () => 0 };

function Ns() { this.prp = {}; }
Ns.prototype.hsn = function () { return null; };
Ns.prototype.frt = function () { return { gold1: 0, gold2: 0 }; };
Ns.prototype.xcl = function () { };
function Ds() { this._data = { _gold: 50 }; }
Ds.prototype.wtn = function (value) { this._data._gold += value; };
Object.defineProperty(Ds.prototype, 'gold', { configurable: true, enumerable: true, get() { return this._data._gold; }, set(value) { this._data._gold = value; } });

function boot({ withFacade }) {
  const { api, created } = platform();
  const sandbox = { console, setTimeout, Promise, Ns, Ds, E, O, GameGlobal: {} };
  sandbox.wx = api;
  sandbox.GameGlobal.wx = api;
  if (withFacade) {
    sandbox.U = { pgg: null };
    sandbox.facade = facade(E, w, clock, clock, analytics, network, c);
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(controller, context);
  const control = sandbox.GameGlobal.__mgssControl;
  const adapter = {
    bcc: 'adunit-test',
    qg: api,
    ilu: { weight: 0.35, pos: { RewardBtn: 2, door: 1, dog: 1 }, qgw: { 0: 'door', 2: 'RewardBtn' } },
    osk: [], qxl: [],
    cew: null,
    gwa: gwa(M),
  };
  xjw(w).call(adapter);
  if (withFacade) sandbox.U.pgg = adapter;
  return { api, created, control, adapter, context, sandbox };
}

function apply(control, extra) {
  return control.apply({
    running: true, gold: true, lightning: true, honey: true, ad: true,
    target: 999999, revision: 1, ...extra,
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 150));

// 1. Skipping: the ad object is taken over, no real video is ever built, and the
//    game's own close handler still receives isEnded=true.
{
  const { created, control, adapter } = boot({ withFacade: true });
  apply(control, {});
  const snapshot = control.snapshot();
  assert.equal(snapshot.adInstalled, true);
  assert.equal(snapshot.adApplied, true);
  assert.equal(snapshot.adSlots, 1, 'xjw must obtain its ad object through the proxy');

  const rewards = [];
  adapter.cew((value) => rewards.push(value));
  await tick();
  assert.deepEqual(rewards, [true], 'Completed-ad reward must still be granted');
  assert.equal(created.length, 0, 'No rewarded video may be requested while skipping');
  assert.equal(control.snapshot().adValue, 1);
  assert.deepEqual(toasts, [], 'The ad-error handler must not fire');
}

// 2. Slot routing: share-gated reward slots fall back to the video branch, which
//    the proxy then settles instantly; turning the switch off restores the config.
{
  const { control, adapter, sandbox } = boot({ withFacade: true });
  apply(control, {});
  assert.equal(adapter.ilu.weight, 0, 'Share weight must be pinned while skipping');
  assert.deepEqual(adapter.ilu.pos, { RewardBtn: 1, door: 1, dog: 1 });
  assert.equal(control.snapshot().adRouted, true);

  const rewards = [];
  sandbox.facade.call({ pgg: adapter }, (value) => rewards.push(value), 2, true, 2);
  await tick();
  assert.deepEqual(rewards, [true], 'Share-gated slot must grant through the video branch');
  assert.deepEqual(dots, [2]);
  assert.equal(adapter.jtl, false, 'Loading guard must be released');

  adapter.ilu.weight = 0.4;
  assert.equal(adapter.ilu.weight, 0, 'Server config cannot reopen the share gate');
  assert.equal(apply(control, { revision: 2 }).adRouted, true);

  apply(control, { ad: false, revision: 3 });
  assert.equal(adapter.ilu.weight, 0.4, 'Server weight must survive the round trip');
  assert.deepEqual(adapter.ilu.pos, { RewardBtn: 2, door: 1, dog: 1 });
  assert.equal(control.snapshot().adRouted, false);
}

// 3. Switch off: one lazily created real ad, listeners forwarded, and an
//    abandoned ad must not pay out.
{
  const { created, control, adapter } = boot({ withFacade: false });
  apply(control, { ad: false });
  const rewards = [];
  adapter.cew((value) => rewards.push(value));
  await tick();
  assert.equal(created.length, 1, 'Real ad is created on first use');
  assert.equal(created[0].options.adUnitId, 'adunit-test');
  assert.equal(created[0].closeHandlers, 1, 'Close listener must be forwarded to the real ad');
  assert.equal(created[0].shown, 1);

  created[0].close({ isEnded: false });
  assert.deepEqual(rewards, [false], 'Skipped-to-end ad must not grant');

  apply(control, { revision: 2 });
  const before = control.snapshot().adValue;
  adapter.cew((value) => rewards.push(value));
  await tick();
  assert.deepEqual(rewards, [false, true]);
  assert.equal(control.snapshot().adValue, before + 1);
  assert.equal(created.length, 1, 'Real ad must not be rebuilt after toggling back');
  assert.equal(created[0].shown, 1, 'Skipping must not drive the real ad');
}

// 4. Installation is idempotent: repeated heartbeats and a second injection in
//    the same runtime must not stack proxies.
{
  const { api, control, context, sandbox } = boot({ withFacade: false });
  const factory = api.createRewardedVideoAd;
  for (let i = 0; i < 5; i++) apply(control, { revision: i, ad: i % 2 === 0 });
  assert.equal(api.createRewardedVideoAd, factory, 'Factory must not be wrapped twice');
  vm.runInContext(controller, context);
  assert.equal(sandbox.GameGlobal.__mgssControl, control, 'Runtime must not be wrapped twice');
  assert.equal(api.createRewardedVideoAd, factory, 'Re-injection must not stack proxies');
}

// 5. Missing facade symbol on a future bundle: video ads are still captured.
{
  const { control, adapter } = boot({ withFacade: false });
  assert.equal(apply(control, {}).adRouted, false);
  assert.equal(control.snapshot().adApplied, true);
  const rewards = [];
  adapter.cew((value) => rewards.push(value));
  await tick();
  assert.deepEqual(rewards, [true]);
}

console.log('PASS: rewarded video proxy skips ads, keeps rewards, defers real ads and pins share slots');
