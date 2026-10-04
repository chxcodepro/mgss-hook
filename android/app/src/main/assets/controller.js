(function (resources, wallet, data, players, root) {
    if (root.__mgssControl) return;
    var state = { running: false, gold: false, lightning: false, honey: false, ad: false, target: 999999 };
    var configured = false;
    var ads = installAds();
    var slots = installSlots();
    function local(id) {
        var player = players.instance.player;
        return player != null && id == player.rqp;
    }
    function fix(id, value) {
        if (!state.running || !value || !local(id)) return value;
        if (state.gold) value.gold1 = state.target;
        if (state.lightning) value.gold2 = state.target;
        return value;
    }
    function skipping() {
        return state.running === true && state.ad === true;
    }
    function platform() {
        if (typeof Laya !== 'undefined' && Laya && Laya.Browser && Laya.Browser.window) {
            var laya = Laya.Browser.window.wx;
            if (laya && typeof laya.createRewardedVideoAd === 'function') return laya;
        }
        if (root && root.wx && typeof root.wx.createRewardedVideoAd === 'function') return root.wx;
        if (typeof wx !== 'undefined' && wx && typeof wx.createRewardedVideoAd === 'function') return wx;
        return null;
    }
    function drop(list, handler) {
        var index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
    }
    function emit(list, argument) {
        var copy = list.slice();
        for (var index = 0; index < copy.length; index++) {
            try { copy[index](argument); } catch (ignored) { }
        }
    }
    function later(run) {
        if (typeof setTimeout === 'function') setTimeout(run, 80);
        else Promise.resolve().then(run);
    }
    // 激励视频代理：开关打开时立即以 isEnded=true 结算，游戏自身发奖分支完整执行；
    // 开关关闭时惰性创建真实广告对象并转发全部监听，行为与原始实现一致。
    function installAds() {
        var stats = { installed: false, skipped: 0, created: 0 };
        var entries = [];
        function wrap(api) {
            for (var index = 0; index < entries.length; index++) if (entries[index].api === api) return entries[index];
            var entry = { api: api, original: api.createRewardedVideoAd };
            entry.factory = function (options) { return build(entry, options); };
            try { api.createRewardedVideoAd = entry.factory; } catch (ignored) { return null; }
            if (api.createRewardedVideoAd !== entry.factory) return null;
            entries.push(entry);
            return entry;
        }
        function install() {
            var api = platform();
            if (api && wrap(api)) { stats.installed = true; return true; }
            return false;
        }
        function build(entry, options) {
            var listeners = { load: [], error: [], close: [] };
            var real = null;
            stats.created++;
            function connect() {
                if (real) return real;
                real = entry.original.call(entry.api, options);
                if (real) {
                    if (typeof real.onLoad === 'function') for (var i = 0; i < listeners.load.length; i++) real.onLoad(listeners.load[i]);
                    if (typeof real.onError === 'function') for (var j = 0; j < listeners.error.length; j++) real.onError(listeners.error[j]);
                    if (typeof real.onClose === 'function') for (var k = 0; k < listeners.close.length; k++) real.onClose(listeners.close[k]);
                }
                return real;
            }
            var ad = {
                onLoad: function (handler) { listeners.load.push(handler); if (real && real.onLoad) real.onLoad(handler); return ad; },
                offLoad: function (handler) { drop(listeners.load, handler); if (real && real.offLoad) real.offLoad(handler); return ad; },
                onError: function (handler) { listeners.error.push(handler); if (real && real.onError) real.onError(handler); return ad; },
                offError: function (handler) { drop(listeners.error, handler); if (real && real.offError) real.offError(handler); return ad; },
                onClose: function (handler) { listeners.close.push(handler); if (real && real.onClose) real.onClose(handler); return ad; },
                offClose: function (handler) { drop(listeners.close, handler); if (real && real.offClose) real.offClose(handler); return ad; },
                load: function () {
                    if (skipping()) return Promise.resolve();
                    if (real) return real.load ? real.load() : Promise.resolve();
                    if (!configured) return Promise.resolve();
                    var target = connect();
                    return target && target.load ? target.load() : Promise.resolve();
                },
                show: function () {
                    if (skipping()) {
                        stats.skipped++;
                        later(function () { emit(listeners.close, { isEnded: true, count: 1 }); });
                        return Promise.resolve();
                    }
                    var existed = real != null, target = connect();
                    if (!target || typeof target.show !== 'function') return Promise.reject(new Error('Rewarded video unavailable'));
                    if (existed) return Promise.resolve(target.show());
                    return Promise.resolve(typeof target.load === 'function' ? target.load() : null)
                        .then(function () { return target.show(); });
                },
                destroy: function () {
                    listeners.load = []; listeners.error = []; listeners.close = [];
                    if (real && typeof real.destroy === 'function') real.destroy();
                    real = null;
                    return ad;
                }
            };
            return ad;
        }
        install();
        return { stats: stats, install: install };
    }
    // 奖励位可能被服务端 shareWeight 随机分到分享分支；开关打开时把权重钉在 0，
    // 使 gwa 始终走视频分支，再由视频代理即时结算，避免分享门槛吞掉奖励。
    function installSlots() {
        var facade = typeof U !== 'undefined' ? U : null;
        if (!facade) return null;
        var adapter = null, config = null, forced = false, pinned = false, savedWeight = 0, savedPos = null;
        function bind() {
            var next = facade.pgg;
            if (!next || !next.ilu || !next.ilu.pos) return false;
            if (next !== adapter) { adapter = next; config = next.ilu; forced = false; pinned = false; savedPos = null; }
            return true;
        }
        function restore() {
            if (!forced || !config) return;
            try {
                if (pinned) Object.defineProperty(config, 'weight', { configurable: true, enumerable: true, writable: true, value: savedWeight });
                else config.weight = savedWeight;
            } catch (ignored) { }
            if (savedPos) for (var key in savedPos) config.pos[key] = savedPos[key];
            savedPos = null; forced = false; pinned = false;
        }
        return {
            route: function (on) {
                if (!bind()) return false;
                if (!on) { restore(); return true; }
                if (!forced) {
                    savedWeight = config.weight;
                    savedPos = {};
                    for (var key in config.pos) savedPos[key] = config.pos[key];
                    pinned = false;
                    try {
                        Object.defineProperty(config, 'weight', {
                            configurable: true, enumerable: true,
                            get: function () { return 0; },
                            set: function (value) { savedWeight = value; }
                        });
                        pinned = true;
                    } catch (ignored) { config.weight = 0; }
                    forced = true;
                }
                for (var slot in config.pos) config.pos[slot] = 1;
                return true;
            },
            routed: function () { return forced; }
        };
    }
    var read = resources.prototype.hsn, create = resources.prototype.frt, update = resources.prototype.xcl;
    resources.prototype.hsn = function (id) { return fix(id, read.call(this, id)); };
    resources.prototype.frt = function (id) { return fix(id, create.call(this, id)); };
    resources.prototype.xcl = function (id, gold, lightning) {
        var locked = state.running && local(id);
        if (locked) fix(id, this.prp[id]);
        var result = update.call(this, id, locked && state.gold ? 0 : gold, locked && state.lightning ? 0 : lightning);
        fix(id, this.prp[id]);
        return result;
    };
    var accessor = Object.getOwnPropertyDescriptor(wallet.prototype, 'gold'), add = wallet.prototype.wtn;
    Object.defineProperty(wallet.prototype, 'gold', {
        configurable: accessor.configurable, enumerable: accessor.enumerable,
        get: function () {
            if (state.running && state.honey) this._data._gold = state.target;
            return accessor.get.call(this);
        },
        set: function (value) { return accessor.set.call(this, state.running && state.honey ? state.target : value); }
    });
    wallet.prototype.wtn = function (value) {
        if (state.running && state.honey) this._data._gold = state.target;
        return add.call(this, state.running && state.honey ? 0 : value);
    };
    root.__mgssControl = {
        apply: function (next) {
            if (!next || !Number.isSafeInteger(next.target) || next.target < 0) throw new Error('Invalid lock config');
            var honeyChanged = next.running && next.honey && (!state.running || !state.honey || next.target !== state.target);
            state = next;
            configured = true;
            var player = players.instance.player;
            if (player) fix(player.rqp, data.instance.fli.prp[player.rqp]);
            if (honeyChanged) data.instance.player.gold = state.target;
            ads.install();
            if (slots) slots.route(skipping());
            return this.snapshot();
        },
        snapshot: function () {
            var player = players.instance.player;
            var value = player && data.instance.fli.prp[player.rqp];
            return { ready: true, goldValue: value ? value.gold1 : -1,
                lightningValue: value ? value.gold2 : -1, honeyValue: data.instance.player.gold,
                adValue: ads.stats.skipped, adSlots: ads.stats.created,
                revision: state.revision, running: state.running,
                goldApplied: state.running && state.gold, lightningApplied: state.running && state.lightning,
                honeyApplied: state.running && state.honey,
                adApplied: skipping() && ads.stats.installed, adInstalled: ads.stats.installed,
                adRouted: slots ? slots.routed() : false };
        }
    };
})(Ns, Ds, E, O, typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
