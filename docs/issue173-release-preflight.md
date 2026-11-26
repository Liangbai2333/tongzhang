# #173 独立 APK 公网当天核对预检与待补证据

本记录对应 [Issue #173](https://github.com/Liangbai2333/tongzhang/issues/173)，实际执行日期为 **2026-11-26（Asia/Shanghai）**，源码基线为 `5646e7065339b34eb1b4f36f29b62b38dd15fb75`。Issue 的计划业务日是 2026-11-21；本文不倒填为该日已完成，不将本次预检称为 Day 7 `B21` 第二次正式验收。关联使用 `Refs #173`，验收勾选、`B14/B19/B21` 点数均保持原状态。

## 1. 本次实际完成

- 已阅读根目录 `AGENTS.md`、`CONTRIBUTING.md`、README、产品约束、代码审查规范及独立安装说明；从最新远端 `main` 创建独立 worktree 与 `docs/173-release-preflight` 分支。
- 从 GitHub Prerelease [beta-day6-20261121](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121) 下载 `tongzhang-ef3cf86-standalone.apk` 和 `SHA256SUMS.txt`，重新运行 `shasum -a 256 -c SHA256SUMS.txt`，结果为 `OK`。包体为 **136,832,199** 字节，宿主机 SHA-256 为 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`，与 Release 资产摘要一致。Release 实际发布时间为 `2026-11-26T06:42:00Z`。
- APK 存在 `assets/index.android.bundle`（4,023,444 字节），字节检索找到 `https://tongzhang.worldboot.net`；未找到 `AI_DRAFT_API_KEY`、`DEEPSEEK_API_KEY` 这两个变量名。此有限静态检索不能证明所有可能形式的密钥均不存在，也不能代替运行时直连测试。
- 只读请求 `https://tongzhang.worldboot.net/health/ready` 返回 HTTP 200、`database=connected`。公开 `/api/v1/system/info` 首次请求返回 HTTP 200；保存原始输出时出现一次 `curl (35) SSL_ERROR_SYSCALL`，重试仍返回退出码 35（见原始 stderr 与退出码），因此本次未取得该探针的可归档成功响应。短时探针不证明持续可用，也不证明 App 注册、登录或账本写入已成功。
- 运行 `node scripts/build-android-apk.mjs --preflight --api-url https://tongzhang.worldboot.net` 通过配置预检；实际原生构建尝试退出 1：未检测到有效 `ANDROID_HOME / ANDROID_SDK_ROOT`，**未生成新 APK**。

原始记录见 [release-preflight.json](evidence/issue173-release-preflight/release-preflight.json)、[宿主机校验](evidence/issue173-release-preflight/host-sha256.txt)、[发布元数据](evidence/issue173-release-preflight/release-metadata.json)、[环境与构建输出](evidence/issue173-release-preflight/environment-and-build.txt)、[健康探针](evidence/issue173-release-preflight/health-ready.json)。APK 仅作为本地临时检查资产，未把二进制包重复提交到仓库。

## 2. Android 与权限阻塞

默认 PATH 原为 Node 22.23.2 / pnpm 11.25.0，与仓库要求不符；后续临时启用 Node 24.22.3 / pnpm 12.6.0（Node 主版本符合要求，较 `.node-version` 的 24.21.0 更新），重复构建配置预检通过，实际构建仍在 SDK 门禁处失败。未修改锁文件或仓库工具版本要求。

本机 JDK 为 Microsoft OpenJDK 17.0.20.1 arm64。PATH 及常见安装位置检查未发现 Android Studio、Android SDK、`adb`、`sdkmanager` 或 `emulator`，`ANDROID_HOME/ANDROID_SDK_ROOT` 未配置。本次没有可用 Android 设备连接、隔离 AVD 或原生安装环境。因此下列项目全部 **未执行**：

| 必需证据                                           | 本次状态与下一步                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 干净隔离模拟器、无本机 API/Metro、无 `adb reverse` | 待提供可用 SDK、系统镜像与独立设备，先记录 `adb reverse --list` 和安装前包状态                                                           |
| 宿主机 APK 与设备 `base.apk` SHA-256 一致          | 仅宿主机校验完成；安装后通过 `pm path com.tongzhang.app` 定位并拉取包体再比对                                                            |
| 冷启动直连 HTTPS 的注册、登录、在线核验、建账      | 待在已校验包体上逐项实操并保存真实日志/截图；未创建线上测试账号或账本                                                                    |
| 扫码入口与拒权回退                                 | 待设备实操；不以 Bundle 存在或配置预检代替相机权限行为                                                                                   |
| B14 关联 PR 的独立安装审查批注                     | 已提交[有限范围预检批注](https://github.com/Liangbai2333/tongzhang/pull/189#issuecomment-7185453182)；安装通过的具体批注须待上述证据齐全 |
| B19 组外真实同学无口头剧透观察                     | 本次观察人数为 **0**，不得把自动化操作或验收账号计为参与者                                                                               |

GitHub 读取、发布资产下载权限本次可用；网络读取需当前环境的联网授权。设备缺失不是 GitHub 权限问题。当前操作者为实际登录账号，不能冒充 Issue 中的指定负责人或第二审查人签收。

## 3. B19 现场采集与 B21 前置门禁

沿用 [组外真实用户三格表](beta-external-user-observation-template.md)，不另建虚构样本。现场由真实非本组同学按最终候选说明自行操作，观察者不口头讲解流程，仅记录「卡在哪句说明 / 卡在哪个按钮 / 是否愿意再用」的原话；不记姓名、学号、邮箱、账号或联系方式，联调验收账号不计人数。当前没有回收原话，不填写调查结论。

最终候选如与本次 `ef3cf86` 不同，须重新下载对应包与摘要，重新完成宿主机、Release 摘要、设备 `base.apk` 三方一致；不得复用本次哈希给新候选背书。仅在最终候选、安装说明、HTTPS 就绪、干净新装、完整路径、原始日志/截图和本人书面审查均齐备后，才进入 `B21` 第二次正式验收；本单继续使用「当天核对」。

## 4. 本分支检查

只新增预检说明和原始证据，没有更改业务源码、数据库、权限、金额、状态、事务、幂等或接口错误码，也没有增加功能范围。

| 检查层                | 本次结果                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| 静态检查 `pnpm check` | 通过（Node 24.22.3 / pnpm 12.6.0；共享包构建、类型检查、ESLint、Prettier 全部退出 0） |
| 无数据库测试          | 文档与证据变更，未执行；不引用历史测试数作为本次结果                                  |
| 移动端组件测试        | 未执行，无客户端逻辑变更                                                              |
| 真实 PostgreSQL 集成  | 未执行，没有专用测试库配置；线上只读健康探针不属于集成测试                            |
| 原生客户端            | 未安装、未运行；构建在 SDK 检查处失败                                                 |
