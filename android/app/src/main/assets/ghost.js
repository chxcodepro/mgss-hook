(function (Ghost, manager, mode, Modes, Input, data, events, root) {
    if (root.__mgssGhost) return;
    var running = false, healthLock = false, lastActor = null, lastSprite = null;
    var sequence = 0, token = '', requestId = '', commandError = '';
    var session = Date.now().toString(36) + Math.random().toString(36).slice(2);
    var health = Object.getOwnPropertyDescriptor(Ghost.prototype, 'ljq');
    var controlled = Object.getOwnPropertyDescriptor(Input.prototype, 'player').get;
    function self() {
        try {
            if (mode.mode !== Modes.Troll || !data.instance.fli.plg) return null;
            var actor = manager.instance.xax, sprite = manager.instance.troll;
            if (!actor || controlled.call({ fjf: null }) !== actor || !sprite || actor.oob !== sprite
                || !sprite.parent || !sprite.visible || sprite.destroyed
                || !Number.isFinite(actor.uje) || actor.uje <= 0 || !Number.isFinite(actor.hfv) || actor.hfv <= 0) return null;
            return actor;
        } catch (ignored) { return null; }
    }
    function identify(actor) {
        if (!actor) { lastActor = null; lastSprite = null; token = ''; return ''; }
        if (lastActor !== actor || lastSprite !== actor.oob) {
            lastActor = actor; lastSprite = actor.oob; token = session + ':' + (++sequence);
        }
        return token;
    }
    function maximumLevel(actor) {
        if (!actor || !Array.isArray(actor.fxq) || !Array.isArray(actor.gdp) || !Array.isArray(actor.vrw)) return 0;
        return Math.max(0, Math.min(13, actor.fxq.length - 1, actor.gdp.length - 1, actor.vrw.length));
    }
    Object.defineProperty(Ghost.prototype, 'ljq', {
        configurable: health.configurable, enumerable: health.enumerable, get: health.get,
        set: function (value) {
            health.set.call(this, running && healthLock && self() === this ? this.hfv : value);
        }
    });
    function setLevel(actor, target) {
        var maximum = maximumLevel(actor);
        if (!Number.isInteger(target) || target < 1 || target > maximum) throw new Error('请输入 1–' + maximum);
        if (target === actor.level) return;
        if (target > actor.level) {
            var remaining = maximum;
            while (actor.level < target && remaining-- > 0) {
                if (self() !== actor) throw new Error('角色已变化');
                var previous = actor.level; actor.xxl();
                if (actor.level !== previous + 1) throw new Error('升级未完成');
            }
        } else {
            var index = target === 1 ? 0 : target;
            var attack = actor.fxq[index], cap = actor.gdp[index], speed = actor.vrw[target - 1];
            if (![attack, cap, speed].every(Number.isFinite) || attack < 0 || cap <= 0 || speed < 0) throw new Error('等级数据不可用');
            var ratio = Math.min(1, Math.max(0, actor.uje / actor.hfv));
            actor.level = target; actor.dta = attack; actor.hfv = cap;
            actor.hli = 1; actor.rqo = 1; actor.laj = false; actor.qga = speed; actor.ipw = 0;
            actor.ljq = Math.max(1, ratio * actor.hfv);
            if (actor.uzm) actor.uzm.visible = false;
            events.instance.mvx(events.instance.rwn);
        }
    }
    root.__mgssGhost = {
        apply: function (config) {
            running = config.running === true; healthLock = config.selfGhostHp === true;
            var actor = self(), currentToken = identify(actor);
            if (actor && running && healthLock && actor.uje < actor.hfv) actor.ljq = actor.hfv;
            var command = config.ghostCommand;
            if (command && command.id && command.id !== requestId) {
                requestId = String(command.id); commandError = '';
                try {
                    if (!running || !actor || String(command.token) !== currentToken) throw new Error('仅本人玩鬼时可用');
                    if (Number.isFinite(command.expiresAt) && Date.now() > command.expiresAt) throw new Error('操作超时');
                    var value = Number(command.value);
                    if (!Number.isInteger(value)) throw new Error('等级必须是整数');
                    if (command.kind !== 'step' && command.kind !== 'set') throw new Error('未知操作');
                    if (command.kind === 'step' && value !== -1 && value !== 1) throw new Error('无效操作');
                    setLevel(actor, command.kind === 'step' ? actor.level + value : value);
                } catch (failure) { commandError = failure.message || String(failure); }
            }
            return this.snapshot();
        },
        snapshot: function () {
            var actor = self(); identify(actor);
            return { ghostAvailable: true, ghostSelf: !!actor, ghostToken: token,
                selfGhostHpApplied: running && healthLock && !!actor,
                ghostLevel: actor ? actor.level : 0, ghostMaxLevel: maximumLevel(actor),
                ghostHp: actor ? actor.uje : -1, ghostMaxHp: actor ? actor.hfv : -1,
                ghostRequestId: requestId, ghostCommandError: commandError };
        }
    };
})(yi, _, T, B, nn, E, A, typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
