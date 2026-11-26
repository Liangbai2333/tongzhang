# #173 独立 Release Android APK 直连云端 HTTPS 当天核对与终验预检记录

日期：2026-11-21（Beta 冲刺第 6 天 · 全链路实测、用户调查与缓冲收口日）  
关联任务：[Issue #173](https://github.com/Liangbai2333/tongzhang/issues/173)（配合闭环 `B14` 6 点与 `B19` 6 点，前置预检 `B21` 4 点；基线 `origin/main` `5646e70`）  
负责人：詹铖煜（`@sunny-light233`）；第二审查人：陈林祺（`@lllin7`）、袁湘湘（`@circlexxl`）。

> **检验用词与点数纪律**：本记录严格记作独立环境 **当天核对**，**不称**「正式验收」（Day 4 `B12` 为第一次正式验收，明日 Day 7 `B21` 才称第二次正式验收；今日不重复估点，不提前预扣 `B21` 整项 4 点）。

---

## 1. 脱离本机 API / Metro / `adb reverse` 的独立 APK 安装与三方哈希核对

依据 [app-user-guide.md（独立 Android APK 下载校验与安装）](app-user-guide.md#独立-android-apk-下载校验与安装)，从 GitHub Prerelease [`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121) 获取最新独立包体与校验清单，在关闭本机 API（`3300`）、关闭 Metro（`8081`）并执行 `adb reverse --remove-all` 的干净 ARM64 Android 模拟器（`Medium_Phone_API_37.0`，系统语言设为英文以同步复核 `D-158-01`）上完成新装核对：

| 核对维度                | 实测结果                                                                                                                                                                      | 原始证据                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Release 资产摘要        | `tongzhang-ef3cf86-standalone.apk`（`136,832,199` 字节），GitHub Digest `sha256:ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`                             | [release-verification.json](evidence/issue173/release-verification.json)       |
| 宿主机 `SHA256SUMS.txt` | `shasum -a 256 -c SHA256SUMS.txt` → `tongzhang-ef3cf86-standalone.apk: OK`                                                                                                    | [adb-isolation-and-sha256.txt](evidence/issue173/adb-isolation-and-sha256.txt) |
| 设备内 `base.apk` 哈希  | `adb shell sha256sum /data/app/.../com.tongzhang.app-.../base.apk` → `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`（**三方逐位一致**）                   | [adb-isolation-and-sha256.txt](evidence/issue173/adb-isolation-and-sha256.txt) |
| 隔离条件核查            | `lsof` 无本机 `3300`/`8081` 监听；`adb reverse --list` 为空；安装前 `pm path com.tongzhang.app` 未安装                                                                        | [adb-isolation-and-sha256.txt](evidence/issue173/adb-isolation-and-sha256.txt) |
| 内嵌 Bundle 与公网探针  | 内嵌 `assets/index.android.bundle`（`4,023,444` 字节）直指 `https://tongzhang.worldboot.net` 且零服务端密钥暴露；`/health/ready` 与 `/api/v1/system/info` 均返回 `HTTP/2 200` | [https-probes.txt](evidence/issue173/https-probes.txt)                         |

已在 `B14` 关联 [PR #189 评论区](https://github.com/Liangbai2333/tongzhang/pull/189#issuecomment-7185453182) 同步按说明独立安装核对批注。

---

## 2. 独立 APK 直连公网 HTTPS 首链当天核对与运行截图

在零 Metro、零 `adb reverse` 条件下冷启动 `com.tongzhang.app`（`LaunchState: COLD`，`TotalTime: 901ms`），直连公网 `https://tongzhang.worldboot.net` 走通欢迎页 → 注册与登录核验 → 创建账本 → 二维码/6 位邀请码 → 扫码入口及相机拒权回退 → 英文系统语言站内提醒展示，核对结束后已清理线上临时测试记录：

| 序号 | 当天核对环节                             | 实测现象与结论                                                                                                                               | 实机/模拟器截图                                                                              |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | 离线束冷启动欢迎页                       | 无 Metro 条件下冷启动 `901ms` 直达欢迎页，无红屏与开发菜单                                                                                   | [01-welcome.png](evidence/issue173/01-welcome.png)                                           |
| 2    | 公网注册、登录与在线会话核验             | 直连 `https://tongzhang.worldboot.net` 注册并登录账号 `Sunny173`，正常进入在线账本首页，无断网横幅                                           | [02-ledgers-online.png](evidence/issue173/02-ledgers-online.png)                             |
| 3    | 新建账本与二维码邀请页                   | 创建账本 `DailyCheck173`（`1 / 12 人`），正常生成 6 位邀请码 `K6J9DF` 与二维码                                                               | [03-invitation-qr.png](evidence/issue173/03-invitation-qr.png)                               |
| 4    | 账本主页状态核对                         | 点击「进入账本」进入 `DailyCheck173` 主页（状态 `进行中`、总额 `¥0.00`、功能入口完整）                                                       | [04-ledger-detail.png](evidence/issue173/04-ledger-detail.png)                               |
| 5    | 扫码加入入口与相机拒权回退               | 在「加入账本」页点击「扫码加入」弹出系统相机授权框，点击 `Don't allow` 后平稳回退并提示「未获得相机权限，请直接在上方输入 6 位邀请码加入。」 | [05-scanner-denied-fallback.png](evidence/issue173/05-scanner-denied-fallback.png)           |
| 6    | 英文系统语言下站内提醒格式（`D-158-01`） | 接收线上催还提醒后打开「站内提醒」面板，时间稳定显示为 `YYYY-MM-DD HH:mm`（`2026-11-26 01:02`），无 `AM/PM` 漂移                             | [06-notifications-english-locale.png](evidence/issue173/06-notifications-english-locale.png) |

---

## 3. 协助 `B19` 组外调查发放核验与 `B21` 第二次正式验收预检

1. **`B19` 组外同学实操包体发放核验**：已核对发放给非本组真实同学的包体 `tongzhang-ef3cf86-standalone.apk` 与 `SHA256SUMS.txt` 一致，现场严格遵循 [beta-external-user-observation-template.md](beta-external-user-observation-template.md) 无口头剧透观察纪律与匿名脱敏红线（不记姓名、学号、联系方式，排除组内验收账号）；`≥ 12` 份组外真实同学三格原话汇总台账统一归档于 `#174`。
2. **`B21` 终验安装步骤预检结论**：逐条对照 [app-user-guide.md](app-user-guide.md)「独立 Android APK 下载校验与安装」章节核对下载、SHA-256 校验、旧签名包冲突卸载提示、未知来源安装授权、首次冷启动注册建账与相机拒权回退说明，步骤闭环无缺项，满足明日 Day 7 `B21` 第二次正式验收启动门禁（若明日最终锁定候选提交更新重新打包，将对新候选包体重新执行三方 SHA-256 一致性校验）。

---

## 4. 四层验证结果（严格分层单列，不跨层相加）

本单仅新增独立 APK 当天核对报告、原始校验日志与模拟器截图，未改动业务源码、契约或原生配置：

| 验证层级                   | 执行命令 / 方式                                                                                         | 结果明细                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 静态检查                   | `pnpm check`                                                                                            | 通过（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .` 全部退出 `0`）                                                         |
| 第 1～3 层自动化测试       | 本单未改动代码或测试用例                                                                                | 沿用基线 `5646e70` 已合入全绿结果，不重复计入本单                                                                                                           |
| 第 4 层：独立 APK 当天核对 | 干净 ARM64 Android 模拟器安装 `tongzhang-ef3cf86-standalone.apk` 直连 `https://tongzhang.worldboot.net` | Release / 宿主机 / 设备 `base.apk` 三方 SHA-256（`ece352d6...`）完全一致；冷启动、注册登录、建账、二维码/扫码拒权回退与英文 Locale 站内提醒当天核对全部通过 |
