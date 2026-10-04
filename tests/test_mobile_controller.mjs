import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bundle = fs.readFileSync(process.argv[2], 'utf8');
const controller = fs.readFileSync(new URL('../android/app/src/main/assets/controller.js', import.meta.url), 'utf8');
const O = { instance: { player: { rqp: 7 } } };
function original(name, next) {
  const start = bundle.indexOf(`function ${name}`);
  const end = bundle.indexOf(`}},{key:"${next}"`, start);
  assert.ok(start > 0 && end > start, `Missing ${name}`);
  return eval(`(${bundle.slice(start, end + 1)})`);
}
function Ns() { this.prp = { 7: { gold1: 10, gold2: 20 }, 8: { gold1: 30, gold2: 40 } }; }
Ns.prototype.hsn = original('hsn(t){', 'frt');
Ns.prototype.frt = original('frt(t){', 'htx');
Ns.prototype.xcl = original('xcl(t,i,s){', 'prr');
function Ds() { this._data = { _gold: 50 }; this.pyw = [{ text: '50' }]; this.saves = 0; }
Ds.prototype.qeg = function () { this.saves++; };
Ds.prototype.wtn = original('wtn(t){', 'stj');
const start = bundle.indexOf('{key:"gold",get:');
const end = bundle.indexOf('},{key:"lka"', start);
const descriptor = eval(`(${bundle.slice(start, end + 1)})`);
Object.defineProperty(Ds.prototype, 'gold', { get: descriptor.get, set: descriptor.set, configurable: true });
const E = { instance: { fli: new Ns(), player: new Ds() } };
const GameGlobal = {};
vm.runInNewContext(controller, { Ns, Ds, E, O, GameGlobal });
const control = GameGlobal.__mgssControl;
for (let mask = 0; mask < 8; mask++) {
  E.instance = { fli: new Ns(), player: new Ds() };
  const gold = !!(mask & 1), lightning = !!(mask & 2), honey = !!(mask & 4);
  control.apply({ running: false, gold: false, lightning: false, honey: false, target: 999999 });
  control.apply({ running: true, gold, lightning, honey, target: 999999, revision: mask });
  const manager = E.instance.fli, wallet = E.instance.player;
  manager.xcl(7, -3, -4); manager.xcl(8, 2.15, -5.35);
  assert.deepEqual(manager.hsn(7), { gold1: gold ? 999999 : 7, gold2: lightning ? 999999 : 16 });
  assert.deepEqual(manager.hsn(8), { gold1: 32.2, gold2: 34.7 });
  assert.deepEqual(manager.frt(9), { gold1: 0, gold2: 0 });
  manager.prp = {};
  assert.deepEqual(manager.frt(7), { gold1: gold ? 999999 : 0, gold2: lightning ? 999999 : 0 });
  assert.equal(wallet.gold, honey ? 999999 : 50);
  wallet.gold = 100; wallet.wtn(-20);
  assert.equal(wallet.gold, honey ? 999999 : 80);
  assert.equal(wallet.pyw[0].text, honey ? '999999' : '80');
  const before = wallet.saves;
  control.apply({ running: true, gold, lightning, honey, target: 999999, revision: mask });
  assert.equal(wallet.saves, before, 'Heartbeat must not persist honey repeatedly');
  control.apply({ running: false, gold, lightning, honey, target: 999999 });
  const initial = { ...manager.hsn(7) }, balance = wallet.gold;
  manager.xcl(7, -1, -2); wallet.wtn(-3);
  assert.deepEqual(manager.hsn(7), { gold1: initial.gold1 - 1, gold2: initial.gold2 - 2 });
  assert.equal(wallet.gold, balance - 3, 'Stop resumes normal spending');
}
O.instance.player = null;
assert.doesNotThrow(() => control.apply({ running: true, gold: true, lightning: true, honey: true, target: 999999 }));
assert.throws(() => control.apply({ target: -1 }));
const existing = GameGlobal.__mgssControl;
vm.runInNewContext(controller, { Ns, Ds, E, O, GameGlobal });
assert.equal(GameGlobal.__mgssControl, existing, 'Do not wrap a runtime twice');
console.log('PASS: 8 independent lock combinations, local scope, spending after stop, honey labels and persistence, no-player state');
