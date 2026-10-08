import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(process.argv[2] || new URL('../artifacts/source/game.js', import.meta.url), 'utf8');
const extension = fs.readFileSync(new URL('../android/app/src/main/assets/ghost.js', import.meta.url), 'utf8');
const B = { Normal: 0, Troll: 1, Puppet: 2, TwoOnline: 7 }, T = { mode: B.Troll };
const E = { instance: { fli: { plg: true } } }, O = { instance: { player: { rqp: 7 }, angel: null } };
const _ = { instance: { tmi: null } };
const A = { instance: { mvx() {}, rwn: 'refresh', njs: 'health' } };
const f = { instance: { hee() {}, bxk: { poy: 'up' } } }, mi = { open() {} }, u = { sxs: '' }, X = { Toast: '' };
const Laya = { stage: { event() {} } }, wt = { xvv: { cnd: '', bsv: '' } };

function original(cls, key) {
    const start = source.indexOf(`var ${cls}=/*#__PURE__*/function`), end = source.indexOf(`return ${cls};}`, start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end), token = `{key:"${key}",`, at = body.indexOf(token);
    const next = body.indexOf('},{key:', at + token.length);
    assert.ok(at >= 0 && next > at);
    return eval(`(${body.slice(at, next + 1)})`);
}
function yi() {
    this.cuj = 1; this.uje = 200; this.mke = 200;
    this.fxq = Array.from({ length: 14 }, (_, i) => 10 * (i + 1));
    this.gdp = Array.from({ length: 14 }, (_, i) => 200 * (i + 1));
    this.vrw = Array.from({ length: 13 }, (_, i) => 10 + i);
    this.tbn = 10; this.qga = 10; this.ipw = 0; this.oat = false; this.ixd = 0; this.vku = 1;
    this.laj = false; this.etk = false; this.gav = { isOpen: false };
    this.oob = { parent: {}, visible: true, destroyed: false }; this.bqo = { text: 'Lv.1' };
    this.czs = 0; this.xxe = []; this.uzm = { visible: false };
}
yi.prototype.ava = value => value;
yi.prototype.yir = () => 0;
yi.prototype.nmg = () => 0;
yi.prototype.kbj = () => '';
Object.defineProperty(yi.prototype, 'lsh', { get() { return 0; } });
for (const key of ['ljq', 'hfv', 'hp', 'level', 'dta']) {
    const d = original('yi', key);
    Object.defineProperty(yi.prototype, key, { get: d.get, set: d.set, configurable: true });
}
for (const key of ['hit', 'xxl', 'yok']) yi.prototype[key] = original('yi', key).value;
function nn() {}
Object.defineProperty(nn.prototype, 'player', { get: original('nn', 'player').get });
Object.defineProperty(_.instance, 'xax', { get: original('_', 'xax').get });
Object.defineProperty(_.instance, 'troll', { get: original('_', 'troll').get });
const GameGlobal = {};
vm.runInNewContext(extension, { yi, _, T, B, nn, E, A, GameGlobal });
const controls = GameGlobal.__mgssGhost;
let next = { running: true, selfGhostHp: true };
let mine = new yi(), enemy = new yi(); _.instance.tmi = mine;
controls.apply(next);
mine.hit(100000); enemy.hit(50);
assert.equal(mine.uje, mine.hfv); assert.equal(enemy.uje, 150);
for (const mode of [B.Normal, B.Puppet, B.TwoOnline]) {
    T.mode = mode; mine.uje = 200;
    controls.apply(next); mine.hit(50);
    assert.equal(mine.uje, 150, 'Enemy primary ghost must take damage outside Troll mode');
    assert.equal(controls.snapshot().ghostSelf, false);
}
T.mode = B.Troll; controls.apply(next);
function command(kind, value, id = Math.random().toString(), token = controls.snapshot().ghostToken) {
    return controls.apply({ ...next, ghostCommand: { kind, value, id, token } });
}
let result = command('step', 1, 'up-one');
assert.equal(result.ghostLevel, 2); assert.equal(mine.tbn, mine.fxq[2]); assert.equal(mine.mke, mine.gdp[2]);
const previous = mine.level;
command('step', 1, 'up-one'); assert.equal(mine.level, previous, 'Acknowledged commands cannot execute twice');
result = command('set', 7); assert.equal(result.ghostLevel, 7); assert.equal(mine.mke, mine.gdp[7]);
assert.equal(mine.uje, mine.hfv);
result = command('step', -1); assert.equal(result.ghostLevel, 6); assert.equal(mine.tbn, mine.fxq[6]); assert.equal(mine.mke, mine.gdp[6]);
result = command('set', 1); assert.equal(result.ghostLevel, 1); assert.equal(mine.mke, mine.gdp[0]);
result = command('set', 13); assert.equal(result.ghostLevel, 13);
result = command('step', 1); assert.ok(result.ghostCommandError); assert.equal(mine.level, 13);
for (const level of [0, 14, 1.5, NaN]) assert.ok(command('set', level).ghostCommandError);
assert.ok(command('other', 1).ghostCommandError);
assert.ok(command('step', 2).ghostCommandError);
const priorLevel = mine.level;
result = controls.apply({ ...next, ghostCommand: { kind: 'set', value: 1, id: 'expired', token: controls.snapshot().ghostToken, expiresAt: Date.now() - 1 } });
assert.ok(result.ghostCommandError); assert.equal(mine.level, priorLevel, 'Expired operations cannot execute late');
const oldToken = controls.snapshot().ghostToken;
mine.oob = { parent: {}, visible: true, destroyed: false };
assert.ok(command('set', 2, 'old-round', oldToken).ghostCommandError);
assert.equal(mine.level, 13, 'Old round commands cannot affect a new sprite');
T.mode = B.Normal; result = command('set', 2); assert.ok(result.ghostCommandError); assert.equal(mine.level, 13);
T.mode = B.Troll; next.selfGhostHp = false; controls.apply(next); mine.hit(5); assert.equal(mine.uje, mine.hfv - 5);
next.running = false; next.selfGhostHp = true; controls.apply(next); mine.hit(5); assert.equal(mine.uje, mine.hfv - 10);
mine.uje = 0; next.running = true; controls.apply(next); assert.equal(mine.uje, 0, 'Do not revive a dead actor');
assert.equal(controls.snapshot().ghostSelf, false);
console.log('PASS: actual game health/upgrade methods, identity isolation, downgrade tables, bounds, command deduplication, round tokens, stop and no revival');
