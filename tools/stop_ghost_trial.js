(function () {
    if (typeof Laya === 'undefined' || !Laya.stage) return { kind: 'other' };
    var root = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
    return root.__mgssGhostTrial ? root.__mgssGhostTrial.stop() : { kind: 'ghost-trial', installed: false };
})()
