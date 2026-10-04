# Agent Note: GitHub Actions APK 构建与发布

Status: implemented

## Problem

项目只有本地构建产物和调试签名；公开仓库需要从源码构建、可持续升级的 APK，以及明确的 Release 触发规则。

## Decision

GitHub Actions 在 main、Pull Request 和手动运行时构建并检查 APK；v 标签必须与 android/app/build.gradle 的 versionName 完全一致，只有成功构建并通过 lint 的标签任务才发布 GitHub Release。versionCode 必须随下一次发布递增。

发布构建读取四个 GitHub Secrets：ANDROID_KEYSTORE_BASE64、ANDROID_STORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。密钥固定复用，私钥文件只在临时目录恢复，步骤结束后清理。Gradle 在提供部分签名参数时失败；本地未提供签名参数时沿用调试签名，CI 标签任务在任何 Secret 缺失时失败。

构建任务仅有 contents: read；独立发布任务有 contents: write，下载已构建 APK、校验 SHA-256 后上传。Actions 使用固定提交 SHA。源码仓库排除 APK、解包游戏源码、设备截图、调试数据、编辑器状态和签名密钥。

## Alternatives considered

- 沿用每个 Runner 自动创建的调试签名：配置简单，但密钥随环境变化，后续 APK 无法覆盖安装，因此发布使用固定密钥。
- 把 APK 提交到 Git：可以直接获取文件，但会累积二进制历史并脱离构建记录，因此 APK 通过 Actions Artifacts 和 Release 提供。
- 每次 main 推送都发布 Release：无需标签操作，但文档修改也会成为正式版本，因此主分支只构建，标签发布。

## Consequences

首次公开发布保留应用现有版本 1.0.2。后续发布需要同时修改 versionName、递增 versionCode 并推送对应标签。保管同一份签名密钥和 Secrets 是持续覆盖安装的前提；旧的本地调试签名 APK 需要卸载后安装首次正式签名 APK。

本地包含游戏样本的行为测试用于检查现有功能；公开 CI 运行 APK 构建和 Android lint，不上传或依赖私有游戏样本。发布任务的成功状态、Release 附件和 APK 签名共同作为交付验证。

历史审计：现有三篇 architecture 笔记描述运行时控制及广告接管，与发布流程无重叠，继续保留。

## Testing

本地 assembleDebug、lintDebug、固定签名 assembleRelease 和 lintRelease 均通过。现有三项 JavaScript 行为测试及 BundlePatcherTest 通过；actionlint、笔记目录和格式校验通过。首次正式交付还需验证 GitHub Actions 的标签任务及实际 Release 附件。
