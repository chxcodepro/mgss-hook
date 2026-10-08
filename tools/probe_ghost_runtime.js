(function () {
    if (typeof Laya === 'undefined' || !Laya.stage) return { kind: 'other' };
    var stage = Laya.stage, names = [], candidates = [], seen = [];
    function visit(object, path, depth) {
        if (!object || typeof object !== 'object' || seen.indexOf(object) >= 0 || depth > 5 || seen.length > 2500) return;
        seen.push(object);
        var name = object.constructor && object.constructor.name;
        if (name === 'nn' || name === 'rn' || name === 'ms') {
            var actor = object.player;
            candidates.push({ path: path, caller: name, actor: actor && actor.constructor.name,
                health: actor && actor.uje, maximum: actor && actor.hfv, ratio: actor && actor.hp,
                sprite: actor && actor.oob && actor.oob.name, keys: Object.keys(object).slice(0, 25) });
        }
        var keys = Object.keys(object);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (/^(parent|_parent|_cacheStyle|_graphics|_transform|_texture|_bitmap|_renderType)$/.test(key)) continue;
            var descriptor = Object.getOwnPropertyDescriptor(object, key);
            if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) visit(descriptor.value, path + '.' + key, depth + 1);
        }
    }
    var events = stage._events || {};
    Object.keys(events).forEach(function (key) {
        var values = Array.isArray(events[key]) ? events[key] : [events[key]];
        values.forEach(function (handler) {
            var caller = handler && (handler.caller || handler._caller);
            names.push({ event: key, caller: caller && caller.constructor.name });
            if (caller && caller.constructor && /^(nn|rn|ms|an|vn)$/.test(caller.constructor.name)) visit(caller, 'event:' + key, 0);
        });
    });
    visit(stage._children || [], 'stage', 0);
    return { kind: 'ghost-discovery', visited: seen.length, candidates: candidates,
        events: names.filter(function (event) { return event.caller !== 'Ue' && event.caller !== 't' && event.caller !== 'X'; }).slice(0, 80) };
})()
