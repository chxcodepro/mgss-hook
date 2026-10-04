# 电脑诊断工具

[返回 README](../README.md)

电脑端控制器支持资源扫描与币值逻辑改写；广告跳过由 Android 模块提供。手机独立运行时无需启动这些工具。

## 环境与启动

- Python 3.12+、[uv](https://docs.astral.sh/uv/)、ADB。
- 已 Root 的 Android 设备，开启 USB 调试并连接电脑。
- 在设备上部署并启动与 Python 客户端匹配的 `frida-server 17.9.11`。
- 微信中已打开「猛鬼宿舍」。

在项目根目录执行，设备序列号可通过 `adb devices` 获取：

```powershell
uv sync
uv run python tools/wx_currency.py --serial YOUR_DEVICE_SERIAL
```

工具通过 `HorrorDormitory` 内存标识自动定位 `com.tencent.mm:appbrandN` 进程。启动器尝试查找 wx-mp-mcp 解包目录中的 `app/js/game.js`，并推送到 `/data/local/tmp/mgss-js-game.js`。自动路径不可用时指定：

```powershell
uv run python tools/wx_currency.py --serial YOUR_DEVICE_SERIAL --bundle-source C:\path\to\app\js\game.js
```

也可设置 `MGSS_BUNDLE_SOURCE` 环境变量。自动识别较慢时，用 `adb shell ps -A` 查找 appbrand PID，再通过 `--pid PID` 附加。微信重启后 PID 会变化。

## 目标字段

| 项目 | 标识 |
| --- | --- |
| 小游戏 AppID | `wx0c4a175295d64921` |
| CDN 资源标识 | `HorrorDormitory` |
| 蜜獾币持久化字段 | `PlayerData._gold` |
| 局内金币 | `gold1` |
| 局内闪电 | `gold2` |

默认方案拦截微信小游戏 JSRuntime 的 `h.k0` 批量执行入口，将目标 `https://usr/js/game.js` 的 WXA 文件描述符替换为改写后的解包源码。金币和闪电仅在 `playerId === O.instance.player.rqp` 时锁定；蜜獾币通过本机 `PlayerData.gold` 锁定。

## 运行时补丁

附加成功后，在工具控制台输入：

```text
runtime-lock 999999
runtime-status
```

然后通过微信右上角菜单重新进入小程序，让 bundle 在已挂钩进程中重新加载。`requestHits` 和 `patchHits` 大于零，且五项 `lastReplacementCounts` 均为 `1`，表示补丁已进入运行脚本。

新局中，本机 `gold1`、`gold2` 和 `PlayerData.gold` 固定为指定值，其他玩家继续正常增减。`runtime-unlock` 停止拦截后续加载；已载入的补丁会持续到当前小游戏 JSRuntime 被重新创建。

## 内存扫描

内存扫描用于版本变化后的诊断。以界面显示蜜獾币 `100069` 为例：

```text
scan honey 100069
```

领取或花费一次，再按新界面值筛选：

```text
exact honey 100068
list honey 20
select honey 3
set honey 999999
lock honey 999999 100
persist 999999
```

局内金币随床铺增长，可按方向筛选：

```text
scan gold 32
increased gold
increased gold
list gold 20
lock gold 999999 100
```

闪电同理：

```text
scan lightning 8
exact lightning 10
list lightning 20
lock lightning 999999 100
```

写入默认限制为 64 个候选地址。候选过多时继续筛选，直到结果稳定收敛。退出控制台会卸载脚本并解除内存锁定；微信重启后需重新扫描。

`persist VALUE` 使用微信 MMKV 的 `PlayerData` 读写钩子。首次返回 `ready: false` 时，在游戏中触发一次保存操作后重试；捕获实例后将 `PlayerData._gold` 持久化为目标值。

## 命令参考

```text
scan SLOT VALUE [TYPE,...]
exact SLOT VALUE
changed SLOT
unchanged SLOT
increased SLOT
decreased SLOT
list SLOT [LIMIT]
select SLOT INDEX[,INDEX]
set SLOT VALUE [MAX_WRITES]
lock SLOT VALUE [MS] [MAX_WRITES]
persist VALUE
storage
runtime-lock VALUE
runtime-source DEVICE_PATH
runtime-status
runtime-unlock
unlock SLOT
clear SLOT
status
quit
```

`SLOT` 通常使用 `gold`、`lightning` 或 `honey`。

## 源码与界面探查

查看解包源码关键词上下文：

```powershell
python tools/probe_bundle.py artifacts/source/game.js ctx 关键字 --window 300
```

`count` 模式统计出现次数。实机界面可通过 ADB 导出并列出可点击坐标：

```powershell
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml artifacts/ui.xml
python tools/ui_nodes.py artifacts/ui.xml
```
