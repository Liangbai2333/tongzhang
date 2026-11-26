# #181 Beta Day 7 第二次正式验收（B21）：最终候选独立 APK 干净环境新装复测与哈希核对

日期：2026-11-22（Beta 冲刺第 7 天 · 第二次正式验收与最终交付封板日；实测采样时间戳 `2026-11-26T12:47Z–13:12Z`）  
关联任务：[Issue #181](https://github.com/Liangbai2333/tongzhang/issues/181)（任务 `B21`，整项 4 点；基线 `origin/main` `a9bd589`，锁定行为提交 `ef3cf86`）  
负责人：詹铖煜（`@sunny-light233`）；第二审查人：陈林祺（`@lllin7`，独立复核）、李润君（`@range-e`，四栏格式核准）。

> **第二次正式验收口径**：本次在完全脱离本机 API（`3300`）、本机 Metro（`8081`）与 `adb reverse` 的空白擦除 Android 17 独立模拟器（`Medium_Phone_API_37.0`，`-no-snapshot -wipe-data`）中，严格仅按 [app-user-guide.md（独立 Android APK 下载校验与安装）](app-user-guide.md#独立-android-apk-下载校验与安装) 下载 GitHub Prerelease [`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121) 最终候选独立 Release Android APK（`tongzhang-ef3cf86-standalone.apk`，源码行为提交 `ef3cf8607bff38444bd580cb69fcbc2abe7ade05`，自 `ef3cf86` 至 `a9bd589` 业务源码、契约、Schema 与原生配置零改动），通过 `SHA256SUMS.txt` 校验并全新安装，核对 GitHub Release 摘要、宿主机下载包与设备内 `/data/app/.../base.apk` 三方 SHA-256 逐位一致后，直连云端公网 HTTPS API（`https://tongzhang.worldboot.net`）完成全链复测（属于 **Beta 冲刺第二次正式验收**）。

---

## 1. 脱离开发电脑的隔离核查与三方 SHA-256 核对

| 核对维度                | 实测结果                                                                                                                                                                                                                                                                                          | 原始证据                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 本地进程与端口隔离      | 运行前与运行后执行 `lsof -nP -iTCP:3300,8081 -sTCP:LISTEN` 均无任何本地 API 或 Metro 监听                                                                                                                                                                                                         | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt)                   |
| `adb reverse` 零转发    | 运行前执行 `adb -s emulator-5554 reverse --remove-all`，运行前后 `adb reverse --list` 均为空                                                                                                                                                                                                      | [runtime-verification.txt](evidence/issue181-b21-second-acceptance/runtime-verification.txt)                           |
| 安装前干净设备确认      | 空白擦除模拟器安装前 `adb shell pm path com.tongzhang.app` 为空（未安装任何旧版或开发客户端）                                                                                                                                                                                                     | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt)                   |
| GitHub Release 资产摘要 | `beta-day6-20261121` 资产 `tongzhang-ef3cf86-standalone.apk`（`136,832,199` 字节），Digest `sha256:ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`                                                                                                                              | [release-verification.json](evidence/issue181-b21-second-acceptance/release-verification.json)                         |
| 宿主机 `SHA256SUMS.txt` | `shasum -a 256 -c SHA256SUMS.txt` → `tongzhang-ef3cf86-standalone.apk: OK`                                                                                                                                                                                                                        | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt)                   |
| 设备内 `base.apk` 哈希  | `adb shell sha256sum /data/app/~~3tYO_fH50Ocr4w3uhogdWA==/com.tongzhang.app-DLtd_zWUw-mbp7SMEi4vvA==/base.apk` → `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`                                                                                                               | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt)                   |
| 三方 SHA-256 结论       | **三方逐位一致（`THREE-WAY SHA-256 MATCH: PASS`）**                                                                                                                                                                                                                                               | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt)                   |
| 云端 HTTPS 与内嵌束核验 | `GET /health/ready` 与 `GET /api/v1/system/info` 均返回 `HTTP/2 200`；内嵌 `assets/index.android.bundle`（`4,023,444` 字节）指向 `https://tongzhang.worldboot.net` 且零服务端密钥暴露                                                                                                             | [https-probes.txt](evidence/issue181-b21-second-acceptance/https-probes.txt)                                           |
| 云端库守恒与洁净清理    | 线上 PostgreSQL 17 核实 `B21SecondAccept`（`SETTLING`、`version = 4`）、`Hotpot dinner` `18000` 分 = 2 行分摊合计 `18000` 分、`zero-sum-dp-v1` 批次 `source_version = 3` / `transfer_total_cents = 9000`、`SETTLEMENT_REMINDER` `is_read = t`；复核后清理临时测试数据，15 张公共表全部恢复 `0` 行 | [cloud-db-conservation-and-cleanup.txt](evidence/issue181-b21-second-acceptance/cloud-db-conservation-and-cleanup.txt) |

---

## 2. 环境定义（环境 B）

- **环境 B（干净独立设备直连云端公网 HTTPS）**：
  - 设备：空白擦除 Android 17（API 37）`arm64-v8a` 模拟器 `Medium_Phone_API_37.0`（`emulator-5554`，`1080 × 2400`，启动参数 `-no-snapshot -wipe-data -gpu swiftshader_indirect -no-audio -no-boot-anim`，英文系统默认 Locale）。
  - 网络与隔离：宿主机未运行本机 API（`3300`）与 Metro（`8081`），`adb reverse --list` 全程为空；App 通过内嵌生产 JS Bundle 直连公网 `https://tongzhang.worldboot.net`。
  - 独立测试账号（与业务及组外调查账号完全隔离）：
    - 账号甲（创建者 / 付款人）：用户名 `b21owner`，邮箱 `b21owner181@tongzhang.test`；
    - 账号乙（普通成员 / 垫付人 / 收款人）：用户名 `b21member`，邮箱 `b21member181@tongzhang.test`。
  - 测试账本：`B21SecondAccept`（6 位邀请码 `EPA8NA`）。

---

## 3. 四栏正式验收记录（版本 / 环境 / 步骤 / 结果）

| 版本      | 环境 | 步骤                                                                                                                                                                                | 结果                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ef3cf86` | B    | 仅按 [app-user-guide.md](app-user-guide.md#独立-android-apk-下载校验与安装) 下载 `tongzhang-ef3cf86-standalone.apk` 与 `SHA256SUMS.txt`，完成三方 SHA-256 校验与全新安装后冷启动。  | **通过**。`am start -W` 返回 `LaunchState: COLD`（`TotalTime: 4481ms`），无 Metro、无 `adb reverse` 条件下直达「同账 TongZhang」欢迎页，主插画、「开始使用」与「已有账号？ 登录」渲染正常，无红屏与开发菜单。[冷启动欢迎页 01](evidence/issue181-b21-second-acceptance/01-cold-start-welcome.png)                                                                                                      |
| `ef3cf86` | B    | 在欢迎页点「开始使用」注册账号甲（用户名 `b21owner`，邮箱 `b21owner181@tongzhang.test`），勾选同意用户协议与隐私说明并点「注册并开始」，核对直连公网 HTTPS 登录后进入在线账本首页。 | **通过**。直连 `https://tongzhang.worldboot.net` 完成注册与会话建立，进入在线账本首页，显示「早上好，b21owner」、「全部账本」、「站内提醒」与空态提示「还没有账本」，无断网横幅。[账号甲注册登录首页 02](evidence/issue181-b21-second-acceptance/02-register-owner-home.png)                                                                                                                           |
| `ef3cf86` | B    | 账号甲切至底部「我的」→ 点「账户信息」→ 点「重新核验登录状态」，确认在线会话核验流程与页面状态提示。                                                                                | **通过**。在线调用 `GET /api/v1/me` 核验成功；「账户信息」面板展示「当前账号已在线核验」、用户名 `b21owner` 及只读邮箱 `b21owner181@tongzhang.test`（提示「邮箱暂不支持修改。」）。[在线会话核验 03](evidence/issue181-b21-second-acceptance/03-online-session-verified.png)                                                                                                                           |
| `ef3cf86` | B    | 账号甲切回「账本」→ 右上角「+」→「创建账本」，输入名称 `B21SecondAccept`，点「创建并邀请成员」，核对邀请页人数、6 位邀请码与二维码。                                                | **通过**。在线创建账本成功，自动跳转「邀请一起记账」页，展示 `B21SecondAccept`、`b21owner（我）`、`当前 1 / 12 人`、真实 6 位邀请码 `EPA 8NA`（`EPA8NA`）与二维码、7 天有效期及「进入账本」入口。[新建账本与邀请页 04](evidence/issue181-b21-second-acceptance/04-created-ledger-invitation.png)                                                                                                       |
| `ef3cf86` | B    | 账号甲退出登录后注册账号乙（`b21member` / `b21member181@tongzhang.test`），点「+」→「加入账本」→ 点「扫码加入」，在系统相机权限弹窗点「Don’t allow」拒绝授权，核对回退行为。        | **通过**。拒绝相机权限后停留在「加入账本」手输页，无白屏或闪退，内联提示「未获得相机权限，请直接在上方输入 6 位邀请码加入。」，上方 6 位邀请码输入与「查看账本」保持可用。[扫码相机拒权回退 05](evidence/issue181-b21-second-acceptance/05-scanner-denied-fallback.png)                                                                                                                                |
| `ef3cf86` | B    | 账号乙在「加入账本」页手输 `EPA8NA` → 点「查看账本」核对预览面板（账本名、创建者 `b21owner`、`1 / 12 人`）→ 点「加入B21SecondAccept」。                                             | **通过**。预览面板信息准确无残影（`D-142-01` 保持消除）；确认加入后进入 `B21SecondAccept` 账本详情，右上角显示「查看成员 · 2 / 12」，状态 `进行中`，总额 `¥0.00`。[手输邀请码加入成功 06](evidence/issue181-b21-second-acceptance/06-join-ledger-success.png)                                                                                                                                          |
| `ef3cf86` | B    | 账号乙点「记第一笔」→ 点「AI 生成草稿」，输入 `Hotpot dinner 180 yuan split equally` 后点「生成消费草稿」，核对云端 AI 草稿回填与零自动落库边界。                                   | **通过**。直连公网 `A31` 返回草稿并自动关闭面板，回填消费金额 `¥180.00`、名称 `Hotpot dinner`、类别 `餐饮`、参与分摊 `2 位成员`、分摊方式 `人均`；顶部提示条单行完整展示「AI 草稿已回填，请核对后手动点击「保存消费」」（`D-158-02` 保持消除）并列出 3 条核对告警，未自动写入数据库。[AI 草稿回填表单 07](evidence/issue181-b21-second-acceptance/07-ai-draft-backfilled.png)                          |
| `ef3cf86` | B    | 账号乙核对回填后的消费表单（付款人 `b21member`、两人人均各 `¥90.00`），手动点「保存消费」提交落库并查看消费详情。                                                                   | **通过**。手动保存走 `A13` 成功进入「消费详情」，展示 `餐饮 · 人均`、`Hotpot dinner`、`¥180.00`、付款人 `b21member`、日期 `2026-11-26`，分摊明细 `b21member ¥90.00`、`b21owner ¥90.00`（整数分守恒），底部展示记录人可见的「编辑消费」「删除消费」。[手动保存消费详情 08](evidence/issue181-b21-second-acceptance/08-expense-saved-detail.png)                                                         |
| `ef3cf86` | B    | 账号乙返回账本详情，点「支出统计」查看多维支出统计图表。                                                                                                                            | **通过**。「支出统计」页在线加载 `B21SecondAccept · 1 笔有效消费`、`进行中`、`有效消费总额 ¥180.00`，SVG「分类占比」环形图（`餐饮 1 笔 · 100.0% ¥180.00`）、「按日消费趋势」柱状图（`共 1 天`、`11-26`）与「单笔支出排行」（`第 1 名 Hotpot dinner ¥180.00`）渲染完整。[多维支出统计 09](evidence/issue181-b21-second-acceptance/09-statistics-charts.png)                                             |
| `ef3cf86` | B    | 切换回账号甲（创建者），打开 `B21SecondAccept` → 点「结算」→ 点「正式发起结算」→ 点「确认冻结并结算」，核对冻结状态与正式结算批次。                                                 | **通过**。账本由 `ACTIVE` 进入 `SETTLING`（标题 `B21SecondAccept · 结算中`、`账单已冻结`），生成唯一正式批次 `0 / 1 笔已登记`、`待登记 ¥90.00`（`b21owner → b21member`），页面提供「登记已还」「复制转账信息」「确认整本结清」。[正式冻结结算页 10](evidence/issue181-b21-second-acceptance/10-settlement-frozen.png)                                                                                  |
| `ef3cf86` | B    | 切换回账号乙（该笔收款人），打开 `B21SecondAccept` →「结算记录」→ 点「提醒对方」，填写催还备注 `B21 reminder check` 后点「确认发送提醒」，核对冷却态切换。                          | **通过**。催还面板展示 `b21owner → b21member ¥90.00` 与 6 小时冷却说明；发送后 `A32` 成功，底部提示「已发送站内催还提醒，6 小时内不可重复催还。」，按钮切换为禁用态「已催还（冷却中）」，未修改消费与转账金额。[发起催还与冷却态 11](evidence/issue181-b21-second-acceptance/11-reminder-sent-cooldown.png)                                                                                            |
| `ef3cf86` | B    | 切换回账号甲（待还付款人），在首页点「站内提醒」打开提醒面板，核对未读提醒条目、备注与时间格式。                                                                                    | **通过**。`A33` 在线加载未读催还条目：`B21SecondAccept`（标签 `未读`）、「b21member 提醒你处理待还转账 ¥90.00」、「备注：B21 reminder check」、时间戳 `2026-11-26 05:10 · 点击查看结算页`（英文系统下仍稳定保持 `YYYY-MM-DD HH:mm`，`D-158-01` 保持消除）。[站内提醒未读条目 12](evidence/issue181-b21-second-acceptance/12-notifications-unread.png)                                                  |
| `ef3cf86` | B    | 账号甲点击该未读站内提醒条目，核对自动标记已读（`A34`）并直达结算页；随后返回首页重开「站内提醒」切至「仅看未读」核对已读落库。                                                     | **通过**。点击后调用 `A34` 标记已读、关闭面板并直接跳转 `B21SecondAccept · 结算中` 正式结算页；返回重开「站内提醒」切「仅看未读」显示「暂无未读提醒 / 所有待还提醒都已查看。」（`UNREAD_EMPTY_AFTER_A34=true`）。[已读直达结算页 13](evidence/issue181-b21-second-acceptance/13-notification-jumped-settlement.png) · [已读核对日志](evidence/issue181-b21-second-acceptance/runtime-verification.txt) |

---

## 4. 原始日志与截图归档清单

全部原始产物归档于 `docs/evidence/issue181-b21-second-acceptance/`：

| 类别     | 文件名                                                                                                                 | 内容摘要                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 原始日志 | [release-verification.json](evidence/issue181-b21-second-acceptance/release-verification.json)                         | `gh release view beta-day6-20261121` 资产元数据与 GitHub SHA-256 Digest                                   |
| 原始日志 | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt)                   | 运行前端口隔离、空 `adb reverse`、`SHA256SUMS.txt` 校验、ADB 全新安装、三方 SHA-256 一致与冷启动          |
| 原始日志 | [https-probes.txt](evidence/issue181-b21-second-acceptance/https-probes.txt)                                           | 云端 HTTPS `/health/ready`、`/api/v1/system/info` 探针与内嵌 Hermes Bundle URL/密钥隔离检查               |
| 原始日志 | [runtime-verification.txt](evidence/issue181-b21-second-acceptance/runtime-verification.txt)                           | 运行后端口隔离、空 `adb reverse` 与 `A34` 标记已读后「仅看未读」为空核对日志                              |
| 原始日志 | [cloud-db-conservation-and-cleanup.txt](evidence/issue181-b21-second-acceptance/cloud-db-conservation-and-cleanup.txt) | 阿里云生产 PostgreSQL 17 账务整数分守恒快照与验收后 15 张公共表 `0` 行残留清理记录                        |
| 运行原图 | `01-cold-start-welcome.png` ～ `13-notification-jumped-settlement.png`（共 13 张，`1080 × 2400` PNG）                  | 完整覆盖冷启动、注册登录、会话核验、建账邀请、拒权回退、加入、AI 草稿回填与保存、统计、冻结催还与提醒跳转 |

---

## 5. 四层验证结果（严格分层单列，禁止跨层相加）

本单仅新增第二次正式验收报告与原始证据文件，未修改业务源码、接口契约、数据库 Schema 或原生配置：

| 验证层级                         | 执行命令 / 方式                                                                                         | 结果明细                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 静态检查与格式化                 | `pnpm check`                                                                                            | 通过（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .` 全部退出 `0`）                                                                    |
| 交付契约与链接审计               | `pnpm check:delivery`                                                                                   | 通过（全仓 Markdown 本地相对链接、标题锚点与 `A01～A34` 契约零偏差）                                                                                                   |
| 第 1～3 层自动化测试             | 本单未修改代码或测试用例                                                                                | 沿用 Day 7 四层封板基线全绿结果，不重复计入本单                                                                                                                        |
| 第 4 层：第二次正式验收（`B21`） | 空白擦除 ARM64 Android 17 模拟器零 Metro / 零 `adb reverse` 全新安装 `tongzhang-ef3cf86-standalone.apk` | Release / 宿主机 / 设备 `base.apk` 三方 SHA-256（`ece352d6...`）完全一致；直连 `https://tongzhang.worldboot.net` 全部 13 步核心路径与新入口一次通过，无新发现缺陷（0） |

---

## 6. 复核与点数核销口径

- 负责人：詹铖煜（`@sunny-light233`）；四栏格式核准：李润君（`@range-e`）；独立复核人：陈林祺（`@lllin7`）。
- 关联审查批注留存于 [PR #199](https://github.com/Liangbai2333/tongzhang/pull/199)；`B21`（整项 `4` 点）随 Day 7 `#177` 双关口终审与 `B22` 一并执行归零核销。
