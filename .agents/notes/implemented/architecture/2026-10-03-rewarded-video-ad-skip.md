# Agent Note: 模块内接管激励视频，跳过广告但不丢奖励

Status: implemented

## Problem

币值锁定完成后，游戏里所有「看视频领奖励」入口仍要求真人看完一段激励视频；用常规广告屏蔽会令 `onClose` 永不触发，奖励随之丢失。

已确认的广告链路（当前线上包）：

- `U.init()`（由 `Ls.mvo()` 调用）→ `new Hs()` → `Hs.init()` → `xjw()`，全包唯一一次 `this.qg.createRewardedVideoAd({adUnitId:this.bcc})`，`qg` 即 `Laya.Browser.window.wx`；该对象被 `cew` 闭包持有，供全部 23 处 `U.gwa` 复用。
- 发奖路径为 `i.show()` → `onClose({isEnded})` → `h(t){s&&s(!!t.isEnded)}` → `U.gwa` 的 `i(t)` 回调，奖励在游戏自身回调内发放；`U.gwa` 另有首次碎片奖励 `h()`。
- `Hs.gwa(s,e)` 会先查 `this.ilu.qgw[e]` 与 `this.ilu.pos[...]`：服务端 `shareWx.json` 的 `shareWeight` 经 `kbo()` 可把奖励位随机改判到分享分支（`yev`），此时不看视频也无法领奖。
- `U.pgg` 在注入点仍为 `null`（`U.pgg=null` 为类定义时赋值，`U.init()` 在 `new yr()` 内才执行），因此实例级钩子必须在注入后才绑定。

## Decision

注入控制器（`android/app/src/main/assets/controller.js`）在 bundle 载入前接管全局 `wx.createRewardedVideoAd`，游戏拿到的就是代理对象：

- 开关打开：`show()` 立即兑现，80ms 后以 `{isEnded:true,count:1}` 触发已注册的 `onClose`，游戏照原路径发奖；同时不向微信请求任何广告素材。
- 开关关闭：首次 `show()` 时才惰性创建真实广告对象，转发全部 `onLoad/onError/onClose` 监听并链式 `load()→show()`，中途完播（`isEnded:false`）依旧不发奖，原始行为不变。
- 分流修正：开关打开时把 `Hs.ilu.weight` 用访问器钉为 `0`（服务端写入被暂存，关闭时原值回填），并把 `ilu.pos` 各项置 `1`，使奖励位始终走视频分支，再由代理即时结算。
- 取证：快照新增 `adValue`（已接管结算次数）、`adSlots`、`adInstalled`、`adApplied`、`adRouted`；面板「跳过广告」行显示 `已跳过 N 次` 或 `广告接口不可用`。

安装时机由 `TAIL` 注入点保证：控制器代码位于 `return new yr(),s.Main=yr,s;` 之前，而 `xjw()` 在 `new yr()` 之后执行，因此 `createRewardedVideoAd` 一定先被接管。接管无需任何游戏源码特征；`U` 符号缺失时只降级为视频接管，不报错。

## Alternatives considered

强制游戏自带白名单 `D.tgp`（会员模式）只需一行赋值，且`U.gwa` 会直接 `i(true)` 发奖并附带白名单奖励；但同一开关还决定活动概率表、抽奖判定、`_isGetWhiteReward` 加奖与时间门槛，副作用超出「跳过广告」，故不采用。

只包装 `U.gwa` 并立即回调 `cb(true)` 会绕过 `pgg.jtl` 加载守卫与 `c.kkt` 打点，语义偏离真实完播；只包装 `Hs.cew` 需要 `U.pgg` 实例，而实例晚于注入点创建，还多一处名称依赖。

按币值那样做包内源码替换（改 `xjw` 文本）可行，但广告分支一改名即失效；`wx` 层接管不依赖源码特征，风险更低。

## Consequences

收益是手机端无需电脑即可跳过全部激励视频并保留奖励，且奖励由游戏自身回调发放，不改动任何发奖数值。代价是开关关闭时首次广告需现拉素材（不再于 `xjw()` 里预加载），比原始实现略慢一拍；服务端若未来改用服务端广告完播校验，代理结算不会计入微信广告收入。

`tests/test_ad_skip.mjs` 用包内真实的 `xjw`、`Hs.gwa` 与 `U.gwa` 片段验证：跳过时不创建真实广告、奖励回调收到 `true`、分享位回落到视频分支、关闭后惰性创建并转发监听、放弃完播不发奖、重复心跳与二次注入不叠加代理、`U` 缺失时仍能接管视频。锚点变化即测试失败，作为版本变更预警。

2026-10-03 实机（1.0.2）：主界面「跳过广告」显示 `已跳过 1 次`／`2 次`，两次皮肤位奖励即时到手并变为使用中；关闭该开关后同一按钮播放真实激励视频（试玩类广告），计数器不增长；打开后幸运卡奖励位同样即时结算。面板与小游戏窗口的层叠顺序取创建时机——先开小游戏再点运行，或关闭悬浮窗后重新运行。
