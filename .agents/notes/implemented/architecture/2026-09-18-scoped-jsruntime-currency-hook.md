# Agent Note: 按本机玩家作用域注入小游戏币值锁

Status: implemented

## Problem

固定内存地址会随 V8 垃圾回收漂移，且按相邻候选猜测字段可能写到引擎参数。对 `Math.round` 的全局 `xcl()` 调用栈钩子虽然能锁住局内金币和闪电，但会同时影响所有玩家，违背只修改本机玩家资源的要求。

## Decision

控制器通过微信 `com.tencent.mm.plugin.appbrand.jsruntime.h.k0(ArrayList, String, hl.v0)` 的批量执行入口拦截目标 bundle。微信把 `https://usr/js/game.js` 作为 `V8ScriptWxaFileDescriptor` 执行；启动器把 wx-mp-mcp 解包得到的同版本 `app/js/game.js` 推送到设备，命中目标脚本名后读取该源码、精确改写并把请求切换为 `SCRIPT_TYPE_TEXT`。

源码必须同时唯一命中五个特征，否则原始 WXA 请求保持不变并记录错误：

- `hsn(playerId)` 仅在 `playerId === O.instance.player.rqp` 时把该资源对象的 `gold1`、`gold2` 设为目标值。
- `frt(playerId)` 仅为本机玩家创建目标初始值，其他玩家仍从零开始。
- `xcl(playerId, ...)` 仅为本机玩家维持目标值，其他玩家完整执行原始加减和取整逻辑。
- `PlayerData.gold` getter/setter 与 `wtn()` 维持蜜獾币目标值。

普通的 `M`、`Q`、`c0`、`evaluateJavascript` 和 `precompile` 字符串入口继续作为兼容路径；当前微信版本的目标 bundle 实际命中 `h.k0`。设备源码路径默认为 `/data/local/tmp/mgss-js-game.js`，可通过 RPC 与启动参数同步覆盖。内存扫描命令继续保留为版本变化后的诊断后备。

## Alternatives considered

固定地址周期写入实现简单，且已验证蜜獾币可被修改；但 V8 对象移动会令候选失效，错误候选还可能破坏画布交互。

全局 `Math.round` 调用栈钩子无需重载 bundle，且实机已触发数千次；但 `xcl()` 管理所有玩家资源，无法稳定取得当前调用的本机对象，因此会修改所有人机。

只拦截普通字符串执行入口可以直接改写源码；但当前微信把目标脚本封装为 WXA 文件描述符，这些入口没有收到 bundle，必须在 `h.k0` 改写请求。

只改 UI 文本风险最低，但购买和升级仍读取真实资源对象，无法满足可消费且锁定的行为。

## Consequences

收益是本机币值锁与人机资源逻辑由明确的玩家 ID 分支隔离，不再依赖易漂移的 V8 地址。代价是运行前必须提供与线上包同版本的解包源码；微信或小游戏更新改变脚本名、请求类型或五个源码特征时，补丁会停止生效并报告精确计数。

实机重载验证得到 `requestHits=2`、`patchHits=2`、五个替换计数均为 `1`、`lastError=null`，主界面蜜獾币显示 `999999`。`tests/test_scoped_bundle.mjs` 证明本机资源固定为 `999999/999999`，人机资源继续按原增量变化且新建值仍为 `0/0`。两次进入房间均在完成画面复验前被猎梦者击杀，因此局内 UI 的第三次实机复验仍是后续验收项。
