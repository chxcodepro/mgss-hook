// Analysis harness only. This does not patch the controller, APK, or phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const bundlePath = process.argv[2] || new URL('../artifacts/source/game.js', import.meta.url);
const source = fs.readFileSync(bundlePath, 'utf8');
const B = { Normal: 0, Troll: 1, Puppet: 2, TwoOnline: 7 };
const T = { mode: B.Troll };
const E = { instance: { fli: { plg: true } } };
const O = { instance: { player: { rqp: 7 }, angel: null } };
const events = [];
const Laya = { stage: { event: (...args) => events.push(args) } };
const A = { instance: { njs: 'health-effect', mvx: (...args) => events.push(args) } };
const wt = { xvv: { cnd: 'low-health', bsv: 'half-health' } };
const ghostManager = { tmi: null };
const _ = { instance: ghostManager };
let switches = { running: true, selfGhostHp: true };

function descriptor(className, key) {
    const start = source.indexOf(`var ${className}=/*#__PURE__*/function`);
    const end = source.indexOf(`return ${className};}`, start);
    assert.ok(start >= 0 && end > start, `Missing class ${className}`);
    const body = source.slice(start, end);
    const token = `{key:"${key}",`;
    const at = body.indexOf(token);
    assert.ok(at >= 0 && body.indexOf(token, at + 1) < 0, `Non-unique ${className}.${key}`);
    const next = body.indexOf('},{key:', at + token.length);
    assert.ok(next > at, `Missing descriptor boundary ${className}.${key}`);
    return { offset: start + at, value: eval(`(${body.slice(at, next + 1)})`) };
}

const evidence = {};
function original(className, key) {
    const found = descriptor(className, key);
    evidence[`${className}.${key}`] = found.offset;
    return found.value;
}
const health = original('yi', 'ljq');
const maximum = original('yi', 'hfv');
const ratio = original('yi', 'hp');
const hit = original('yi', 'hit').value;
const controlled = original('nn', 'player').get;
const managerActor = original('_', 'xax').get;
const managerSprite = original('_', 'troll').get;
Object.defineProperty(ghostManager, 'xax', { get: managerActor });
Object.defineProperty(ghostManager, 'troll', { get: managerSprite });

function mayLock(receiver) {
    if (!switches.running || !switches.selfGhostHp || T.mode !== B.Troll || !E.instance.fli.plg) return false;
    const sprite = ghostManager.troll;
    return receiver === ghostManager.xax && receiver === controlled.call({ fjf: null })
        && sprite != null && receiver.oob === sprite && sprite.parent != null
        && sprite.visible === true && sprite.destroyed !== true
        && Number.isFinite(receiver.uje) && receiver.uje > 0
        && Number.isFinite(receiver.hfv) && receiver.hfv > 0;
}

function makeGhost() {
    const actor = {
        uje: 270, mke: 270, bonus: 30, gav: { isOpen: false },
        oat: false, ixd: 0, vku: 1, laj: false, etk: false,
        oob: { parent: {}, visible: true, destroyed: false },
        ava: value => value, yir() { return this.bonus; },
    };
    Object.defineProperties(actor, {
        hfv: { get: maximum.get, set: maximum.set },
        hp: { get: ratio.get },
        ljq: {
            get: health.get,
            set(value) { health.set.call(this, mayLock(this) ? this.hfv : value); },
        },
    });
    return actor;
}

let cases = 0;
for (const mode of Object.values(B)) {
    for (const running of [false, true]) {
        for (const enabled of [false, true]) {
            for (const own of [false, true]) {
                T.mode = mode; switches = { running, selfGhostHp: enabled };
                const mine = makeGhost(), other = makeGhost();
                ghostManager.tmi = mine;
                const actor = own ? mine : other;
                const expectedLock = mode === B.Troll && running && enabled && own;
                assert.equal(mayLock(actor), expectedLock);
                hit.call(actor, 100);
                assert.equal(actor.uje, expectedLock ? actor.hfv : 170);
                if (mode === B.Normal) assert.equal(actor.uje, 170, 'Survivor mode must allow enemy ghost damage');
                cases++;
            }
        }
    }
}

T.mode = B.Troll; switches = { running: true, selfGhostHp: true };
let mine = makeGhost(); ghostManager.tmi = mine;
hit.call(mine, 1000000);
assert.equal(mine.uje, 300, 'Lethal damage must be intercepted before death checks');
assert.equal(mine.hp, 1);
mine.mke = 540; mine.bonus = 60;
hit.call(mine, 25);
assert.equal(mine.uje, 600, 'Health cap follows upgrades and equipment');
switches.selfGhostHp = false;
hit.call(mine, 25);
assert.equal(mine.uje, 575, 'Switch off resumes original damage immediately');

for (const invalidate of [
    actor => { actor.oob.parent = null; },
    actor => { actor.oob.visible = false; },
    actor => { actor.oob.destroyed = true; },
    actor => { actor.uje = 0; },
    actor => { actor.mke = Number.NaN; },
]) {
    switches = { running: true, selfGhostHp: true };
    mine = makeGhost(); ghostManager.tmi = mine; invalidate(mine);
    assert.equal(mayLock(mine), false);
    cases++;
}
mine = makeGhost(); ghostManager.tmi = mine; E.instance.fli.plg = false;
assert.equal(mayLock(mine), false);
cases++;
E.instance.fli.plg = true;
const priorGhost = mine;
ghostManager.tmi = makeGhost();
assert.equal(mayLock(priorGhost), false, 'Do not retain the previous round actor');
cases++;

console.log(JSON.stringify({
    status: 'analysis-only: candidate guard passed, not deployed',
    matrixCases: 32, additionalBoundaryCases: cases - 32 + 3,
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    evidenceCharOffsets: evidence,
    conclusions: ['Troll mode and controlled object identity are both required',
        'Normal/Puppet/TwoOnline mode follows original damage',
        'Health setter uses current cap and stops at switch-off or actor invalidation'],
}, null, 2));
