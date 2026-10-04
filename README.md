# MGSS Hook · 猛鬼宿舍锁定面板

[![Android APK](https://github.com/chxcodepro/mgss-hook/actions/workflows/android.yml/badge.svg)](https://github.com/chxcodepro/mgss-hook/actions/workflows/android.yml)
[![Release](https://img.shields.io/github/v/release/chxcodepro/mgss-hook)](https://github.com/chxcodepro/mgss-hook/releases/latest)
[![Android](https://img.shields.io/badge/Android-11%2B-3DDC84?logo=android&logoColor=white)](#运行要求)

用于微信小游戏「猛鬼宿舍」的 Android LSPosed 模块，提供本机资源锁定、激励视频跳过和悬浮窗控制。安装后可在手机上独立运行。

## 目录

- [功能](#功能)
- [运行要求](#运行要求)
- [下载与安装](#下载与安装)
- [使用方法](#使用方法)
- [本地构建](#本地构建)
- [自动构建与发布](#自动构建与发布)
- [测试](#测试)
- [常见问题](#常见问题)
- [项目结构](#项目结构)
- [贡献与反馈](#贡献与反馈)
- [许可](#许可)

## 功能

| 功能 | 说明 |
| --- | --- |
| 金币锁定 | 将本机玩家局内金币固定为 `999999` |
| 闪电锁定 | 将本机玩家局内闪电固定为 `999999` |
| 蜜獾币锁定 | 将本机 `PlayerData.gold` 固定为 `999999` |
| 跳过广告 | 接管激励视频接口，触发完播奖励回调，并显示已跳过次数 |
| 独立开关 | 各项单独启停，取消锁定后从当前值继续正常增减 |
| 悬浮窗 | 支持拖动、收起；关闭时解除全部锁定与广告接管 |
| 动态补丁 | 读取当前 WXA 请求源码，特征不匹配时保持原游戏运行 |

模块仅改写本机玩家的资源逻辑。手机端运行无需电脑、USB、Frida 服务或 Python/JavaScript 启动脚本。

## 运行要求

- Android 11（API 30）或更高版本。
- 已取得 Root 权限，并安装可用的 LSPosed 环境。
- 微信（`com.tencent.mm`），并能正常进入「猛鬼宿舍」。
- 为「宿舍 · 锁定」开启显示悬浮窗权限。

目标小游戏 AppID 为 `wx0c4a175295d64921`，资源标识为 `HorrorDormitory`。补丁依赖微信与小游戏的运行时特征，兼容性以实际版本验证结果为准。

## 下载与安装

1. 前往 [最新 Release](https://github.com/chxcodepro/mgss-hook/releases/latest)，下载 `mgss-lock-<版本>.apk`。
2. 在手机上安装 APK。
3. 在 LSPosed 中启用「宿舍 · 锁定」，勾选微信作用域。
4. 完全关闭并重新启动微信。
5. 打开「宿舍 · 锁定」，允许显示悬浮窗。

Release 同时提供 `SHA256SUMS.txt`。Linux 可将两个文件放在同一目录后执行 `sha256sum --check SHA256SUMS.txt`，macOS 可执行 `shasum -a 256 -c SHA256SUMS.txt`；Windows 可执行：

```powershell
Get-FileHash .\mgss-lock-1.0.2.apk -Algorithm SHA256
```

将输出与校验文件中的值比较。正式 Release 使用固定发布签名；如此前安装的是本地调试签名 APK，首次切换需要卸载旧版后安装，后续正式版本可覆盖升级。

## 使用方法

1. 打开微信并进入「猛鬼宿舍」。
2. 打开「宿舍 · 锁定」，点击 **运行**。
3. 返回小游戏，等待悬浮窗显示连接成功。
4. 按需开启金币、闪电、蜜獾币锁定或 **跳过广告**。
5. 关闭单项开关恢复该项正常逻辑；关闭悬浮窗解除全部控制。

### 激励视频行为

- 开启跳过广告后，代理 `show()` 立即返回，并以 `{ isEnded: true }` 触发游戏注册的 `onClose`，进入游戏自身的完播发奖分支。
- 模块同时将 `shareWeight` 固定为 `0`，将分享分流回视频奖励分流。
- 关闭开关后，首次 `show()` 时创建真实广告对象并转发监听，恢复真实视频播放；未完播（`isEnded: false`）不发奖。
- 面板中的 **已跳过 N 次** 表示已接管的广告位结算次数；**广告接口不可用** 表示当前版本没有可接管接口。

## 本地构建

### 环境

- JDK 17 或更高版本（CI 使用 JDK 17）。
- Android SDK Platform 34、Build Tools 35.0.0。
- 项目自带 Gradle Wrapper 8.11.1，Android Gradle Plugin 8.10.1。

通过 `ANDROID_HOME` 或本地 `android/local.properties` 中的 `sdk.dir` 指定 SDK 路径。`local.properties` 不提交到 Git。

Windows PowerShell：

```powershell
$env:ANDROID_HOME = 'C:\path\to\Android\Sdk'
cd android
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

Linux/macOS：

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

输出为 `android/app/build/outputs/apk/debug/app-debug.apk`。

本地运行 `:app:assembleRelease` 时，如果未提供发布签名环境变量，使用调试签名。要使用正式签名，需同时提供 `MGSS_KEYSTORE_PATH`、`MGSS_STORE_PASSWORD`、`MGSS_KEY_ALIAS` 和 `MGSS_KEY_PASSWORD`。

## 自动构建与发布

工作流位于 [`.github/workflows/android.yml`](.github/workflows/android.yml)。

| 触发方式 | 结果 |
| --- | --- |
| 推送到 `main` | 构建 Debug APK、运行 Android lint、上传 Actions Artifacts |
| 向 `main` 提交 Pull Request | 执行相同构建检查 |
| 推送 `v<versionName>` 标签 | 构建固定签名 Release APK、运行 lint、发布 GitHub Release |
| 手动运行 | 选择分支时构建 Debug；选择版本标签时重新构建并发布该版本 |

Actions 构建产物和 lint 报告保留 14 天，正式 APK 及 SHA-256 文件保存在 Release 中。标签必须与 `android/app/build.gradle` 中的 `versionName` 完全一致，否则任务失败。

### 发布签名配置

在仓库 **Settings → Secrets and variables → Actions** 中配置：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 发布 keystore 文件的 Base64 编码 |
| `ANDROID_STORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 签名密钥别名 |
| `ANDROID_KEY_PASSWORD` | 签名密钥密码 |

每次发布必须复用同一份密钥，妥善备份 keystore 和密码。CI 在任何签名 Secret 缺失时停止发布。

### 发布新版本

1. 更新 `android/app/build.gradle` 的 `versionName`，并递增 `versionCode`。
2. 更新 [CHANGELOG.md](CHANGELOG.md)，提交并推送到 `main`。
3. 创建与版本号一致的标签并推送。例如下一版本为 `1.0.3`：

```bash
git tag -a v1.0.3 -m "Release v1.0.3"
git push origin v1.0.3
```

4. 在 [Actions](https://github.com/chxcodepro/mgss-hook/actions) 检查任务结果，并在 [Releases](https://github.com/chxcodepro/mgss-hook/releases) 下载 APK。

## 测试

行为测试需要自行准备当前小游戏的 WXA 包，游戏包和解包源码不包含在仓库中。以下命令在项目根目录执行，需要 Python 3.12+、Node.js 和 JDK：

```bash
python tools/extract_wxa.py path/to/package.wxapkg artifacts/source/game.js
node tests/test_mobile_controller.mjs artifacts/source/game.js
node tests/test_ad_skip.mjs artifacts/source/game.js
node tests/test_scoped_bundle.mjs artifacts/source/game.js
javac -d artifacts/test-classes android/app/src/main/java/io/github/mgss/lock/BundlePatcher.java tests/BundlePatcherTest.java
java -cp artifacts/test-classes io.github.mgss.lock.BundlePatcherTest path/to/package.wxapkg android/app/src/main/assets/controller.js
```

`test_ad_skip.mjs` 会检查广告链路锚点（`xjw`、`Hs.gwa`、`U.gwa`）；特征变化时测试直接失败。公开 CI 运行 APK 构建与 Android lint，以上依赖游戏样本的行为测试在本地执行。

电脑端 Frida 调试、资源扫描和运行时命令详见 [电脑诊断工具](docs/diagnostics.md)。

## 常见问题

**面板被小游戏遮挡**

窗口层叠顺序取决于创建时机。先进入小游戏，再点击 **运行**；如仍被遮挡，关闭悬浮窗后重新点击 **运行**。

**模块没有连接或资源没有锁定**

确认 LSPosed 已启用模块并勾选微信，完全重启微信，检查悬浮窗权限。微信或小游戏更新后，运行时特征可能变化；匹配失败时模块保留原游戏运行。

**显示广告接口不可用**

当前微信版本没有可接管的激励视频接口，请在反馈中提供微信版本、模块版本和 LSPosed 日志。

**安装时提示签名冲突**

本地调试版、Actions Debug 产物与正式 Release 的签名可能不同。卸载旧签名版本后再安装；后续使用同一正式签名的 Release 可覆盖升级。

## 项目结构

```text
.
├── .github/workflows/android.yml  # 构建、检查与 Release 发布
├── android/                      # Android 应用与 LSPosed 模块
│   └── app/src/main/
│       ├── assets/controller.js  # 手机端运行时控制器
│       └── java/io/github/mgss/lock/
├── docs/diagnostics.md           # 电脑端调试与命令说明
├── frida/wx_currency.js          # Frida 诊断控制器
├── tests/                       # Java 与 JavaScript 行为测试
├── tools/                       # WXA 解包、源码探查、设备诊断
├── pyproject.toml               # 电脑诊断工具 Python 依赖
└── CHANGELOG.md
```

## 贡献与反馈

问题与建议请提交到 [Issues](https://github.com/chxcodepro/mgss-hook/issues)，包含 Android 版本、微信版本、LSPosed 版本、模块版本、复现步骤和相关日志。

欢迎通过 Pull Request 提交改进。提交前运行对应构建和行为测试；兼容性修改请说明验证过的微信与小游戏版本。请勿提交设备标识、私人数据、签名密钥、游戏包或构建产物。

## 许可

当前仓库尚未声明项目许可证。使用的 Gradle Wrapper 与 Xposed API 等第三方组件遵循各自许可。
