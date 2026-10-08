(function () {
    if (typeof Laya === 'undefined' || !Laya.stage) return { kind: 'other' };
    var root = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
    var trial = root.__mgssGhostTrial;
    if (!trial || !trial.snapshot().active) return { kind: 'ghost-damage-test', error: 'Self trial is not active' };
    function callers(event) {
        return (Array.isArray(event) ? event : event ? [event] : []).map(function (handler) { return handler.caller; });
    }
    var actor = null;
    callers((Laya.stage._events || {}).showInvBtn).forEach(function (panel) {
        callers(panel && panel.imv && panel.imv._events && panel.imv._events.mouseup).forEach(function (input) {
            if (input && input.azc && input.azc.constructor.name === 'nn') actor = input.azc.player;
        });
    });
    if (!actor || actor.constructor.name !== 'ms' || !Object.prototype.hasOwnProperty.call(actor, 'ljq')) {
        return { kind: 'ghost-damage-test', error: 'Controlled actor changed' };
    }
    if (actor.ixd > 0 || actor.oat || !Number.isFinite(actor.vku) || actor.vku <= 0) {
        return { kind: 'ghost-damage-test', error: 'Shield or invulnerability would invalidate damage evidence',
            shield: actor.ixd, invulnerable: actor.oat, reduction: actor.vku };
    }
    function snapshot() { return JSON.parse(JSON.stringify(trial.snapshot())); }
    var before = snapshot();
    var normalDamage = Math.max(1, Math.floor(actor.hfv / 10 / actor.vku));
    actor.hit(normalDamage);
    var normal = snapshot();
    if (normal.health !== normal.maximum || normal.blocked <= before.blocked) {
        return { kind: 'ghost-damage-test', error: 'Normal damage was not intercepted; lethal test skipped', before: before, normal: normal };
    }
    var lethalDamage = Math.ceil(actor.hfv * 2 / actor.vku);
    actor.hit(lethalDamage);
    var lethal = snapshot();
    return { kind: 'ghost-damage-test', source: 'explicit calls to the real game hit method, not natural enemy hits',
        normalDamage: normalDamage, lethalDamage: lethalDamage, before: before, normal: normal, lethal: lethal,
        pass: lethal.health === lethal.maximum && lethal.blocked > normal.blocked };
})()
