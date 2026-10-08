(function () {
    if (typeof Laya === 'undefined' || !Laya.stage) return { kind: 'other' };
    var root = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
    var trial = root.__mgssGhostTrial;
    if (!trial || !trial.snapshot().active) return { kind: 'ghost-restore-test', error: 'Trial not active' };
    function callers(event) {
        return (Array.isArray(event) ? event : event ? [event] : []).map(function (handler) { return handler.caller; });
    }
    var actor;
    callers((Laya.stage._events || {}).showInvBtn).forEach(function (panel) {
        callers(panel && panel.imv && panel.imv._events && panel.imv._events.mouseup).forEach(function (input) {
            if (input && input.azc && input.azc.constructor.name === 'nn') actor = input.azc.player;
        });
    });
    if (!actor || actor.constructor.name !== 'ms' || actor.uje < actor.hfv || actor.ixd > 0 || actor.oat || actor.vku <= 0) {
        return { kind: 'ghost-restore-test', error: 'Cannot safely validate original damage' };
    }
    var proto = Object.getPrototypeOf(actor), descriptor;
    while (proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, 'ljq'))) proto = Object.getPrototypeOf(proto);
    var originalSetter = 'function set(t){t=this.ava(t),this.uje=t,this.ljq>this.hfv&&(this.uje=this.hfv),this.nci=this.hp;}';
    var unchanged = descriptor && String(descriptor.set) === originalSetter;
    if (!unchanged) return { kind: 'ghost-restore-test', error: 'Shared prototype changed unexpectedly' };
    var trialBefore = JSON.parse(JSON.stringify(trial.snapshot()));
    trial.stop();
    var before = actor.uje, damage = 1 / actor.vku;
    actor.hit(damage);
    return { kind: 'ghost-restore-test', sharedPrototypeUnchanged: true,
        instanceHookRemoved: !Object.prototype.hasOwnProperty.call(actor, 'ljq'),
        before: before, after: actor.uje, expectedDamage: 1,
        pass: actor.uje === before - 1, trialBefore: trialBefore };
})()
