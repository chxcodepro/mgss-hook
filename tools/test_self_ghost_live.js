(function () {
    if (typeof Laya === 'undefined' || !Laya.stage) return { kind: 'other' };
    var root = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
    if (root.__mgssGhostTrial) return root.__mgssGhostTrial.snapshot();
    function callers(event) {
        var list = Array.isArray(event) ? event : event ? [event] : [];
        return list.map(function (handler) { return handler && handler.caller; });
    }
    var panels = callers((Laya.stage._events || {}).showInvBtn);
    var control = null;
    panels.forEach(function (panel) {
        var handlers = panel && panel.imv && panel.imv._events;
        callers(handlers && handlers.mouseup).forEach(function (input) {
            var candidate = input && input.azc;
            if (candidate && candidate.constructor.name === 'nn') control = candidate;
        });
    });
    if (!control) return { kind: 'ghost-trial', installed: false, error: 'Controlled input not found' };
    var playerDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'player');
    var expectedPlayer = 'function get(){return T.mode==B.Troll?_.instance.xax:null==this.fjf?null==O.instance.angel?O.instance.player:O.instance.angel:null;}';
    if (!playerDescriptor || String(playerDescriptor.get) !== expectedPlayer) {
        return { kind: 'ghost-trial', installed: false, error: 'Mode and ownership getter signature mismatch' };
    }
    var actor = control.player;
    if (!actor || actor.constructor.name !== 'ms') return { kind: 'ghost-trial', installed: false, error: 'Not the controlled Troll actor' };
    var equipmentOwners = callers((Laya.stage._events || {}).removeEquipmentByIndex);
    if (equipmentOwners.indexOf(actor) < 0) return { kind: 'ghost-trial', installed: false, error: 'Main ghost identity mismatch' };
    var owner = Object.getPrototypeOf(actor), descriptor;
    while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, 'ljq'))) owner = Object.getPrototypeOf(owner);
    var expectedSetter = 'function set(t){t=this.ava(t),this.uje=t,this.ljq>this.hfv&&(this.uje=this.hfv),this.nci=this.hp;}';
    if (!descriptor || String(descriptor.set) !== expectedSetter || Object.prototype.hasOwnProperty.call(actor, 'ljq')) {
        return { kind: 'ghost-trial', installed: false, error: 'Health setter signature mismatch' };
    }
    var sprite = actor.oob;
    var enabled = true, writes = 0, blocked = 0, history = [], started = Date.now();
    function active() {
        try {
            return enabled && control.player === actor && actor.constructor.name === 'ms'
                && actor.oob === sprite
                && actor.oob && actor.oob.parent && actor.oob.visible === true && !actor.oob.destroyed
                && Number.isFinite(actor.uje) && actor.uje > 0
                && Number.isFinite(actor.hfv) && actor.hfv > 0;
        } catch (ignored) { return false; }
    }
    if (!active()) return { kind: 'ghost-trial', installed: false, error: 'Actor inactive or dead; refusing to revive' };
    var before = actor.uje, beforeCap = actor.hfv;
    Object.defineProperty(actor, 'ljq', {
        configurable: true, enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: function (value) {
            var old = descriptor.get.call(this), cap = this.hfv;
            var protectedActor = this === actor && active();
            descriptor.set.call(this, protectedActor ? cap : value);
            writes++;
            if (protectedActor && value < old) {
                blocked++;
                if (history.length >= 12) history.shift();
                history.push({ at: Date.now(), before: old, attempted: value, after: this.uje, cap: cap });
            }
        }
    });
    root.__mgssGhostTrial = {
        snapshot: function () {
            return { kind: 'ghost-trial', installed: true, active: !!active(), enabled: enabled,
                actor: actor.constructor.name, currentIsSelf: control.player === actor,
                before: before, beforeCap: beforeCap, health: actor.uje, maximum: actor.hfv,
                ratio: actor.hp, writes: writes, blocked: blocked, elapsedMs: Date.now() - started, history: history.slice() };
        },
        stop: function () {
            enabled = false;
            delete actor.ljq;
            var result = this.snapshot(); result.installed = false;
            delete root.__mgssGhostTrial;
            return result;
        }
    };
    actor.ljq = actor.hfv;
    return root.__mgssGhostTrial.snapshot();
})()
