# #142 B12 第一次正式验收复核批注与 B18/B19 四人实测及组外调查台账准备

2026-11-19（Beta 冲刺第 4 天）。本记录对应 [#142](https://github.com/Liangbai2333/tongzhang/issues/142)，由陈林祺（`@lllin7`）作为 `B12` 独立复核人完成第一次正式验收书面复核，并同步落实 Day 6 `B18` 四人 300 元“鼓山一日”多账号实操核对表与 `B19` 组外 `≥ 12` 名真实同学实操调查三格台账准备；第二审查人为饶恩哲（`@Liangbai2333`）。

> **措辞、用户量与点数口径声明**（严格遵守 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律）：
>
> 1. **区分「正式验收」与「当天核对」**：`B12`（Day 4 中期带扫码客户端干净环境独立安装）与 `B21`（Day 7 最终候选独立 APK 干净环境新装）属**正式验收**；其余日常客户端回归与联调检查统一称**当天核对**，二者不混用。
> 2. **区分「验收账号」与「组外真实用户」**：四人“鼓山一日”多账号实操使用的四个固定测试账号统称**验收账号**，**不计入**组外用户量；`B19` 用户量仅统计非本小组成员的真实同学实操回收样本（目标 `≥ 12` 人）。
> 3. **点数核销口径**：本单配合闭环 `B12`（整项 `4` 点，计入詹铖煜名下，待双关口确认后核销）；同步推进 `B18`（整项 `8` 点，计划 2026-11-21 完成）与 `B19`（整项 `6` 点，计划 2026-11-21 完成）准备工作，**今日不重复估点，不提前扣减 `B18`、`B19` 整项点数**。

---

## 1. `B12` 中期干净环境独立安装第一次正式验收书面复核批注

- **复核对象**：詹铖煜（`@sunny-light233`）提交的 [issue141-b12-first-acceptance.md](issue141-b12-first-acceptance.md)（关联 [#141](https://github.com/Liangbai2333/tongzhang/issues/141) / [PR #149](https://github.com/Liangbai2333/tongzhang/pull/149)，原始提交 `dfabf8f` 及表格竖线修复 `a64a0a8`，已在 `a5dedac` 合入 `main`）。
- **复核依据**：[environment-setup.md（启动前必看）](environment-setup.md#启动前必看)、[apps/mobile/app.config.ts](../apps/mobile/app.config.ts)、[docs/evidence/issue141-b12-first-acceptance/](evidence/issue141-b12-first-acceptance/) 下全部 13 张真实运行截图与 10 份原始日志。

### 1.1 干净环境、构建归属、权限清单与原始日志逐项复核

| 复核维度         | 核对标准                                                                                                        | 实际核对证据与结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 复核结论 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **干净独立环境** | 独立工作树、空白隔离 Android 模拟器、独立 PostgreSQL 库，不复用旧开发客户端，不污染开发库                       | 从 `origin/main` `b859ba9` 检出独立工作树；独立容器 `tongzhang-b12-acceptance-db`（`postgres:17-alpine`，`127.0.0.1:35541`，库 `tongzhang_b12`，15 表）；空白隔离 AVD `Beta141`（`emulator-5586`，`-no-snapshot -wipe-data`，Android 17 / API 37、`arm64-v8a`、`1080 × 2400`），与 [pnpm-check-env-android.txt](evidence/issue141-b12-first-acceptance/pnpm-check-env-android.txt) 一致                                                                                                                   | **通过** |
| **构建哈希一致** | 服务端、Metro JS 与新装 APK 归属同一提交，宿主机 `app-debug.apk` 与设备内 `base.apk` SHA-256 一致               | 完整提交 `b859ba929f00be1c23cd83cb4da3328e36ee2209`（短哈希 `b859ba9`）；宿主机 `app-debug.apk`（`99,547,334` 字节）与设备内 `base.apk` SHA-256 均为 `3cbcb6a31d70efbc3cf2c081410a22d15af66ff29d8991aec3b3960230eac806`（见 [runtime-checks.txt](evidence/issue141-b12-first-acceptance/runtime-checks.txt) 第 1–6 行）                                                                                                                                                                                   | **通过** |
| **第一屏说明**   | 严格按第一屏端口（`3300` / `8081`）、`adb reverse`、JDK 17 与 `ANDROID_HOME` 执行，同时保留失败与成功日志文件名 | 失败日志 [build-failed-missing-sdk.txt](evidence/issue141-b12-first-acceptance/build-failed-missing-sdk.txt)（未设 `ANDROID_HOME`，`BUILD FAILED in 19s`，`SDK location not found`）验证第一屏要求；配置 Corretto JDK `17.0.20.1` + `ANDROID_HOME` 后 [build-success-jdk17.txt](evidence/issue141-b12-first-acceptance/build-success-jdk17.txt)（`BUILD SUCCESSFUL in 1m 26s`，475 tasks）与 [adb-install-success.txt](evidence/issue141-b12-first-acceptance/adb-install-success.txt) 一次通过           | **通过** |
| **相机权限清单** | Prebuild 后 `AndroidManifest.xml` 声明 `CAMERA` 且移除 `RECORD_AUDIO`，与 `app.config.ts` 一致                  | [expo-prebuild-android.txt](evidence/issue141-b12-first-acceptance/expo-prebuild-android.txt) 完成原生工程生成；[runtime-checks.txt](evidence/issue141-b12-first-acceptance/runtime-checks.txt) 第 18–25 行确认 `<uses-permission android:name="android.permission.CAMERA"/>` 与 `RECORD_AUDIO` `tools:node="remove"`，且系统权限弹窗仅请求拍照/录像不请求独立录音                                                                                                                                        | **通过** |
| **工程自检边界** | 依赖、Doctor、环境与 JS 导出日志齐全，且未将 `pnpm export:mobile` 当作原生安装验收                              | [pnpm-check-mobile-deps.txt](evidence/issue141-b12-first-acceptance/pnpm-check-mobile-deps.txt)（`Dependencies are up to date`）、[pnpm-doctor-mobile.txt](evidence/issue141-b12-first-acceptance/pnpm-doctor-mobile.txt)（`21/21 checks passed`）、[pnpm-check-env-tools.txt](evidence/issue141-b12-first-acceptance/pnpm-check-env-tools.txt)、[pnpm-export-mobile.txt](evidence/issue141-b12-first-acceptance/pnpm-export-mobile.txt)（Android `4.9MB` / iOS `4.6MB`，正文已明确不代替原生验收）均在列 | **通过** |

### 1.2 四栏正式验收步骤与 13 张运行截图逐项核对

对 `docs/issue141-b12-first-acceptance.md` 全部 10 行四栏记录、13 张 `1080 × 2400` PNG 原图以及 `runtime-checks.txt` 中的真实 HTTP 响应与 PostgreSQL 终态快照逐行交叉核验：

| 序号 | 正式验收步骤（`b859ba9` / 环境 A）            | 归档原图与日志印证                                                                                                                                                                                                                                                                                                                               | 复核意见                          |
| ---: | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
|    1 | 全新安装启动进入欢迎页                        | [01-fresh-welcome.png](evidence/issue141-b12-first-acceptance/01-fresh-welcome.png)：正常展示「同账 TongZhang」插画、「开始使用」与「已有账号？ 登录」，无白屏/闪退                                                                                                                                                                              | **通过**                          |
|    2 | 注册账号 `b12owner` 进入空账本列表            | [02-register-owner-empty-list.png](evidence/issue141-b12-first-acceptance/02-register-owner-empty-list.png) + `POST /api/v1/auth/register 201`、`GET /me 200`、`GET /ledgers 200`，底部双标签常驻                                                                                                                                                | **通过**                          |
|    3 | 「我的 → 账户信息」显式重新核验在线会话       | [03-online-session-verified.png](evidence/issue141-b12-first-acceptance/03-online-session-verified.png) + `GET /api/v1/me 200`，展示「当前账号已在线核验」与只读邮箱提示                                                                                                                                                                         | **通过**                          |
|    4 | 创建账本 `B12-Acceptance` 并核对邀请码/二维码 | [04-created-ledger-invitation.png](evidence/issue141-b12-first-acceptance/04-created-ledger-invitation.png) + `POST /api/v1/ledgers 201`，展示 `当前 1 / 12 人`、`XD3 EHF`、二维码与 7 天有效期                                                                                                                                                  | **通过**                          |
|    5 | 退出 `b12owner` 并登录第二账号 `b12member`    | [05-member-login-list.png](evidence/issue141-b12-first-acceptance/05-member-login-list.png) + `POST /auth/logout 200` → `POST /auth/login 200` → `GET /me 200`                                                                                                                                                                                   | **通过**                          |
|    6 | 「加入账本」页核对 6 位码框与「扫码加入」入口 | [06-join-ledger-qr-entry.png](evidence/issue141-b12-first-acceptance/06-join-ledger-qr-entry.png)：6 格输入框、「扫码加入」按钮与底部「查看账本」完整可见                                                                                                                                                                                        | **通过**                          |
|    7 | 首次点击「扫码加入」后拒权回退手输页          | [07-camera-permission-prompt.png](evidence/issue141-b12-first-acceptance/07-camera-permission-prompt.png) · [08-camera-denied-once-fallback.png](evidence/issue141-b12-first-acceptance/08-camera-denied-once-fallback.png)：拒权后留手输页并显示内联提示，无白屏/崩溃                                                                           | **通过**                          |
|    8 | 再次拒权触发永久拒绝并展示系统设置入口        | [09-camera-denied-permanent-settings.png](evidence/issue141-b12-first-acceptance/09-camera-denied-permanent-settings.png) + `CAMERA: granted=false, USER_SET\|USER_FIXED`；自动呈现「前往系统设置开启相机」                                                                                                                                      | **通过**                          |
|    9 | 永久拒权态保持手输 `XD3EHF` 预览并加入账本    | [10-fallback-manual-preview.png](evidence/issue141-b12-first-acceptance/10-fallback-manual-preview.png) · [11-fallback-manual-joined.png](evidence/issue141-b12-first-acceptance/11-fallback-manual-joined.png) + `POST /invitations/preview 200`、`POST /invitations/join 200`，库内 `ledgers.version=2`、`ledger_members=2`、`MEMBER_JOINED=1` | **通过**（见下方 1.3 非阻塞备注） |
|   10 | 授予相机权限打开扫码取景框并切回手输页        | [12-qr-scanner-camera-open.png](evidence/issue141-b12-first-acceptance/12-qr-scanner-camera-open.png) · [13-qr-scanner-closed-to-manual.png](evidence/issue141-b12-first-acceptance/13-qr-scanner-closed-to-manual.png)：虚拟相机取景与黄色扫描框渲染正常，关闭后平滑回到手输页                                                                  | **通过**                          |

### 1.3 复核中发现的两处非阻塞细节（不阻塞 `B12` 闭环）

1. **文档截图措辞微差（非功能问题）**：[issue141-b12-first-acceptance.md](issue141-b12-first-acceptance.md) 第 9 行描述 [11-fallback-manual-joined.png](evidence/issue141-b12-first-acceptance/11-fallback-manual-joined.png) 时称「右上角显示『查看成员 · 2 / 12』」，复核原图可见账本详情页右上角实际为「`...`」更多菜单按钮（「查看成员 · 2 / 12」收在更多菜单面板内）；结合 `runtime-checks.txt` 中 `POST /api/v1/invitations/join 200` 与 `tongzhang_b12` 终态 `ledgers.version=2`、`ledger_members=2`、`operation_logs: MEMBER_JOINED=1`，已确认加入结果完全真实有效。
2. **手输 6 格邀请码底层文本叠加细节（纳入 Day 6 `B18` 局部界面修复观察项）**：复核 [10-fallback-manual-preview.png](evidence/issue141-b12-first-acceptance/10-fallback-manual-preview.png) 可见，弹出「确认加入这个账本？」面板时，背景 6 格邀请码框左侧露出底层 `TextInput` 文本 `XD3EHF` 与前两格字符轻微重叠。该问题不影响预览、加入及相机拒权回退功能，归入 `缺陷`（低优 UI 细节，不加点），安排在 Day 6 `B18` 局部界面修复中一并排查并复测。

### 1.4 `B12` 正式验收书面复核结论

- **复核结论**：**通过**。
- **依据摘要**：四栏「版本、环境、步骤、结果」要素齐备（表格错列已在 `a64a0a8` 修正），干净独立环境严格遵循 `docs/environment-setup.md` 启动说明第一屏，新构建提交 `b859ba9` 与宿主机/设备内 `base.apk` SHA-256 完全一致，成功与失败日志（10 份）、真实运行截图（13 张）及隔离库终态相互印证；相机权限声明与拒权回退符合产品边界。
- **签收与闭环**：本书面复核意见对应 [#142](https://github.com/Liangbai2333/tongzhang/issues/142) 与 [#141](https://github.com/Liangbai2333/tongzhang/issues/141) / [PR #149](https://github.com/Liangbai2333/tongzhang/pull/149)，同意作为 `B12`（整项 `4` 点，计入詹铖煜名下）复核通过依据；待双关口（许雅欣确认完成口径、饶恩哲核销整项点数）确认后完成 `B12` 核销。

---

## 2. `B18` 前置准备：四人 300 元（`30000` 分）“鼓山一日”多账号实操核对表与验收账号清单

本节在 Day 2 [#108 四人基准算例清单](issue108-secondary-refresh-and-gushan-guide.md#2-鼓山一日四人-30000-分基准算例多账号分步实操清单b18-前置准备)基础上，结合 Day 3–Day 5 合入的 Beta 六项新增能力（消费改删、资料偏好、应用内扫码、多维统计图表、AI 草稿回填与站内催还提醒），固化为 Day 6（2026-11-21）`B18` 在**独立 Android APK + 线上 HTTPS API** 上的可执行核对表。

> **执行口径提醒**：Day 6 `B18` 实测须使用 `B14` 产出的带短哈希与 `SHA256SUMS.txt` 的独立 Android APK 直连线上 HTTPS 服务；若在 Day 5 提前用本机开发客户端预演，须标注为**当天核对**，不得替代 Day 6 独立 APK 实测。

### 2.1 四人实测验收账号清单（仅称「验收账号」，严禁计入用户量）

| 验收账号代号   | 账本展示用户名 | 建议独立验收邮箱（示例） | 账本内角色               | 本轮实测承担职责                                                                                                                                                              | 权限与隔离红线                                                                                                        |
| -------------- | -------------- | ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **验收账号 A** | `小安`         | `b18-an@accept.local`    | **创建者**（`creator`）  | 建账「鼓山一日」并生成邀请码/二维码；录第 1 笔「食堂 `¥120.00`」；验证 `A16/A17` 改删临时笔；发起正式冻结（`A23`）、催还（`A32`）、确认结清（`A26`）与本人归档（`A27`）       | 仅作 `B18` 验收账号，**不计入 `B19` 组外用户量**；唯一可调用 `A10`、`A23`、`A26`                                      |
| **验收账号 B** | `小白`         | `b18-bai@accept.local`   | 普通成员（收款方）       | 扫码加入（兼测相机拒权回退）；体验 `A31` AI 草稿回填后手动保存第 2 笔「鼓山门票 `¥120.00`」；冻结后发起对小丁的催还（`A32`）；结清后核对未归档隔离                            | 仅作 `B18` 验收账号，**不计入 `B19` 组外用户量**；不可发起 `A23`/`A26`（返 `403 FORBIDDEN`），不可替他人登记已还      |
| **验收账号 C** | `小陈`         | `b18-chen@accept.local`  | 普通成员（转账付款方 1） | 扫码/手输加入；录第 3 笔「车费 `¥60.00`」（仅小安、小陈 2 人均摊）；验证 `A28/A29` 改名与通知开关（测试关闭后静默不落未读提醒）；在 `SETTLING` 登记 `小陈 → 小安 ¥30.00` 已还 | 仅作 `B18` 验收账号，**不计入 `B19` 组外用户量**；仅可登记本人 `payerMemberId` 转账 `A25`，不可越权标记他人提醒 `A34` |
| **验收账号 D** | `小丁`         | `b18-ding@accept.local`  | 普通成员（转账付款方 2） | 扫码/手输加入；零垫付参与前两笔均摊；查收站内催还提醒（`A33`）并点击直达结算页标记已读（`A34`）；在 `SETTLING` 登记 `小丁 → 小白 ¥60.00` 已还                                 | 仅作 `B18` 验收账号，**不计入 `B19` 组外用户量**；全流程只读核对余额、统计图与结算批次，验证 `remainingNetCents` 归零 |

### 2.2 四人 `30000` 分基准算例 + Beta 六项能力实操核对表（12 步）

| 步骤 | 执行账号         | 操作步骤与覆盖接口                                                                                                                                                                                                                                                                                             | 金额（整数分）与状态不变量预期                                                                                                                                      | 必留证据（截图 / SQL）                 | 实测勾选 |
| ---: | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | :------: |
|    1 | A / B / C / D    | 四验收账号独立注册并完成在线核验（`A01` / `A04`）；验收账号 C 在「我的」修改用户名再改回 `小陈`（`A28`），确认邮箱只读                                                                                                                                                                                         | 全部进入空账本列表，`/api/v1/me` 返回 `200`；`A28` 更新即时同步，无本地假账本缓存                                                                                   | 注册/核验/改名截图                     |  `[ ]`   |
|    2 | 验收账号 A       | 新建账本 `鼓山一日`（可选上传 `≤ 1 MiB` 封面），进入「邀请一起记账」页（`A05` / `A09`）                                                                                                                                                                                                                        | `status = ACTIVE`、`version = 1`、`expenseTotalCents = "0"`；生成 6 位邀请码与 `tongzhang:invite:v1:<码>` 二维码（7 天有效）                                        | 建账与邀请码页截图                     |  `[ ]`   |
|    3 | 验收账号 B/C/D   | B 在「加入账本」点「扫码加入」走通相机拒权回退手输与授权扫码预览加入；C、D 依次预览并加入（`A11` / `A12`）                                                                                                                                                                                                     | 拒权留在手输页不白屏；预览不改库；四人齐全后成员数 `4 / 12`、`status = ACTIVE`、`version = 4`                                                                       | 扫码/拒权回退与 `4 / 12` 成员截图      |  `[ ]`   |
|    4 | 验收账号 A/B/C   | 录入 3 笔基准消费（`A13`）：① A 录 `食堂` `¥120.00`（`DINING`，4 人均摊各 `3000` 分）；② B 用 `A31` AI 文本/收据解析预填草稿，人工核对后手动保存 `鼓山门票` `¥120.00`（`TICKET`，4 人均摊各 `3000` 分）；③ C 录 `车费` `¥60.00`（`TRANSPORT`，仅 A、C 2 人均摊各 `3000` 分）                                   | `A31` 仅回填 `ExpenseForm` **不直写库**，手动提交 `A13` 后入账；3 笔有效消费合计 `30000` 分（`¥300.00`），`version = 7`                                             | AI 草稿预填截图 + 3 笔流水详情截图     |  `[ ]`   |
|    5 | 验收账号 A / B   | A 新增临时笔 `矿泉水` `¥10.00`（4 人均摊），编辑为 `¥12.00`（`A16`）；B 同时打开旧版本提交触发 `409 VERSION_CONFLICT` 并显式刷新；随后 A 软删除该临时笔（`A17`）                                                                                                                                               | `409 VERSION_CONFLICT` 明确提示且**不自动重试**；软删除后账本有效消费恢复精确 3 笔 `30000` 分（`¥300.00`），`version` 严格单调递增                                  | 改删、`409` 冲突与删后恢复 `¥300` 截图 |  `[ ]`   |
|    6 | 验收账号 D       | 进入「支出统计」（`A21`）核对分类占比 SVG 环形图、按日趋势柱图、单笔排行与成员「已付 vs 应摊」对比条形图                                                                                                                                                                                                       | 软删除临时笔不计入；总支出 `¥300.00`（餐饮 `40.0%` / 门票 `40.0%` / 交通 `20.0%`），成员已付 `12000/12000/6000/0` 与应摊 `9000/6000/9000/6000` 严格守恒             | 统计页完整截图（上半+下半）            |  `[ ]`   |
|    7 | 验收账号 B / D   | 进入「余额明细」与「结算」预览页（`A20` / `A22`）                                                                                                                                                                                                                                                              | 待转账总额 `¥90.00`（`9000` 分）、精确最少 `2` 笔（`小陈 → 小安 ¥30.00`、`小丁 → 小白 ¥60.00`）；预览不冻结，仍为 `ACTIVE`，普通成员不显示冻结按钮                  | 余额明细与只读结算预览截图             |  `[ ]`   |
|    8 | 验收账号 A / C   | A 点击「正式发起结算 → 确认冻结并结算」（`A23`）；冻结后 C 尝试编辑或删除历史消费验证拦截                                                                                                                                                                                                                      | 状态变为 `SETTLING`，`settlement_batches.source_version` 等于冻结前 `version`，详情隐藏「记一笔」；冻结后改删被服务端 `409 LEDGER_FROZEN` 拦截                      | 冻结确认与 `SETTLING` 详情截图         |  `[ ]`   |
|    9 | 验收账号 A/B/C/D | ① B 对 `小丁 → 小白 ¥60.00` 发起催还（`A32`），立即二次点击验证 6 小时冷却 `429 REMINDER_COOLDOWN`；② D 在站内提醒列表（`A33`）看到未读催还并点击直达结算页标记已读（`A34`）；③ C 先在设置关闭 `notification_enabled`（`A29`），A 对 `小陈 → 小安 ¥30.00` 发起催还，核对 A 侧响应不泄露偏好且 C 侧不落未读提醒 | 催还仅在 `SETTLING` + `PENDING` 允许，**不改变消费与转账金额**；关闭 `A29` 后静默不写 `notifications` 行且仍走冷却；`A34` 仅接收人本人幂等生效                      | 催还成功、冷却提示、提醒列表与已读截图 |  `[ ]`   |
|   10 | 验收账号 C / D   | C 在结算页对 `小陈 → 小安 ¥30.00` 点「登记已还」确认；随后 D 对 `小丁 → 小白 ¥60.00` 点「登记已还」确认（`A25`）                                                                                                                                                                                               | C 登记后进度 `1/2`、待还 `¥60.00`；D 登记后进度 `2/2`、待还 `¥0.00`，四人 `remainingNetCents` 均为 `"0"`，但状态仍为 `SETTLING`（不自动结清），消费总额仍 `¥300.00` | `1/2` 与 `2/2` 已还进度截图            |  `[ ]`   |
|   11 | 验收账号 A / B   | A 点「确认整本结清」（`A26`）进入 `SETTLED`；随后 A 执行「归档账本」（`A27`）并切至 B、C、D 核对当前列表与历史账本                                                                                                                                                                                             | 结清后展示绿底 `账本已结清 · ¥300.00 · 2 笔转账 · 4 位成员`；仅 A 移入「我的 → 历史账本」，B/C/D 仍在当前列表，归档前后财务字段字节一致                             | 结清汇总、A 已归档与 B 未归档对照截图  |  `[ ]`   |
|   12 | 数据库核对       | 在目标数据库执行 [issue108 SQL 快照查询](issue108-secondary-refresh-and-gushan-guide.md#4day-6-b18-数据库快照只读核验-sql) 与下方提醒表只读核验 SQL                                                                                                                                                            | `status = SETTLED`、3 笔有效消费 `30000` 分、10 行分摊 `30000` 分、2 笔 `PAID` 转账 `9000` 分、`notifications` 仅含小丁已读记录、小陈关闭通知期间无新增行           | 归档只读 SQL 终态输出文本              |  `[ ]`   |

### 2.3 鼓山算例整数分守恒速查表与新增提醒表只读 SQL

| 成员（验收账号） | 已付 `paidCents` | 应摊 `sharedCents` |    冻结净额 `netCents` | 零和子集 DP 最少转账（`zero-sum-dp-v1`）     | 全部登记已还及结清后 `remainingNetCents` |
| ---------------- | ---------------: | -----------------: | ---------------------: | -------------------------------------------- | ---------------------------------------: |
| 小安（A）        |          `12000` |             `9000` |                `+3000` | 收款：`小陈 → 小安 "3000"`（`¥30.00`）       |                                    `"0"` |
| 小白（B）        |          `12000` |             `6000` |                `+6000` | 收款：`小丁 → 小白 "6000"`（`¥60.00`）       |                                    `"0"` |
| 小陈（C）        |           `6000` |             `9000` |                `−3000` | 付款：`小陈 → 小安 "3000"`（`¥30.00`）       |                                    `"0"` |
| 小丁（D）        |              `0` |             `6000` |                `−6000` | 付款：`小丁 → 小白 "6000"`（`¥60.00`）       |                                    `"0"` |
| **守恒合计**     |      **`30000`** |        **`30000`** | **`0`（正项 `9000`）** | **精确最少 `2` 笔，共 `"9000"`（`¥90.00`）** |     **全员 `"0"`（有效消费仍 `30000`）** |

在 [issue108 只读 SQL](issue108-secondary-refresh-and-gushan-guide.md#4day-6-b18-数据库快照只读核验-sql) 的 3 条查询外，Day 6 `B18` 补充以下只读 SQL 核对 `notifications` 联动与 `A29` 静默结果：

```sql
-- 4. 核对站内催还提醒落库、已读时间戳与 A29 关闭静默结果（小丁应有已读记录，小陈关闭期间应无新行）
SELECT n.id, ru.username AS recipient, au.username AS actor,
       n.type, n.amount_cents, n.created_at, n.read_at
FROM notifications n
JOIN users ru ON ru.id = n.recipient_user_id
JOIN users au ON au.id = n.actor_user_id
WHERE n.ledger_id = '<LEDGER_ID>'
ORDER BY n.created_at;
```

---

## 3. `B19` 前置准备：组外 `≥ 12` 名真实同学实操调查安排与三格回收台账

### 3.1 招募分组与现场执行排期（拟邀 15 人，保底回收 `≥ 12` 份有效样本）

延续并细化 Day 3 [#125 候选排期](issue125-mobile-beta-daily-check.md#3-组外真实用户调查-12-人候选同学安排衔接-b18--b19)，全部受邀同学均为**非本小组成员**，由陈林祺牵头组织与回收，詹铖煜协助现场原话记录：

| 批次     | 候选来源（均非本小组成员）      |  拟邀人数 | 保底有效回收 | 预计实操时段           | 分配实操任务（仅给交付说明，不口头剧透）                                                      | 现场记录分工   |
| -------- | ------------------------------- | --------: | -----------: | ---------------------- | --------------------------------------------------------------------------------------------- | -------------- |
| 第 1 批  | 同年级软件工程相邻班级同学      |      5 人 |       ≥ 4 人 | Day 5 晚（11-20 晚）   | 独立安装 APK → 注册登录 → 建账/扫码加入 → 记账、改删、看统计图 → 冻结与登记已还               | 陈林祺、詹铖煜 |
| 第 2 批  | 同宿舍楼 / 社团熟人（非本小组） |      5 人 |       ≥ 4 人 | Day 6 上午（11-21 AM） | 独立安装 APK → 扫码加入（含拒权手输）→ 改用户名/通知开关 → AI 草稿预填记账 → 查看催还与已读   | 陈林祺、詹铖煜 |
| 第 3 批  | 跨专业本科生 / 日常拼餐高频用户 |      5 人 |       ≥ 4 人 | Day 6 下午（11-21 PM） | 陌生用户首次上手：只看交付说明与 App 首屏完成建账、分摊记账与结算预览，重点暴露文案与按钮歧义 | 陈林祺         |
| **合计** | **3 个独立组外群体**            | **15 人** |  **≥ 12 人** | **11-20 晚 – 11-21**   | **统一使用 `B14` 独立 APK + 线上 HTTPS 服务，记录统一版本短哈希与 `SHA256SUMS.txt`**          | —              |

### 3.2 现场调查与数据口径纪律

1. **严格分离验收账号与组外用户量**：第 2 节的 4 个验收账号仅计入 `B18` 实操核对，**绝不计入**本节 `≥ 12` 人组外体验样本。
2. **安装包与说明口径一致**：所有批次统一分发经 `B14` 产出且附短哈希与 `SHA256SUMS.txt` 的独立 Android APK，配套交付说明与 [app-user-guide.md](app-user-guide.md) 同版本一致。
3. **不提前口头引导、如实录原话**：体验者按说明自行安装并完成任务；前两栏未遇阻填「未卡」，遇阻先按体验者原话记下卡在哪句说明/哪个按钮再做最小化提示；第三栏记「愿意 / 不愿意 / 未回答」并保留原因原话。
4. **匿名脱敏红线**：三格回收台账中**只记反馈，严禁填写姓名、学号、真实邮箱/账号或联系方式**。
5. **问题三分类分流**：回收发现的高优阻碍按 `beta-sprint-plan.md` 归入 `缺陷`（进入 `B20` 缓冲池修复并复测，不加点），非本轮范围需求归入 `推迟` 写入 [known-limitations.md](known-limitations.md)。

### 3.3 组外 `≥ 12` 人三格回收台账模板（现场直接填写）

本台账严格沿用 [beta-external-user-observation-template.md](beta-external-user-observation-template.md) 的标准三格结构（每人一行，仅记反馈、不记任何身份信息；预置 15 行对应 3 批次 15 名拟邀同学，实操回收满 `≥ 12` 行有效记录即满足 `B19` 样本门槛）：

| 卡在哪句说明 | 卡在哪个按钮 | 是否愿意再用 |
| ------------ | ------------ | ------------ |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |
|              |              |              |

#### `B19` 回收汇总口径预留（Day 6 回收完成后据实填写）

- **发放独立 APK 提交号与 SHA-256**：待 Day 5 `B14` 产出后填入。
- **有效回收样本数**：`__ / 15` 份（达标门槛 `≥ 12` 份，均非本小组成员，不含 4 个验收账号）。
- **全程「未卡」人数与占比**：`__ / __`（`__%`）；高频卡点 Top 3（区分说明文案问题 vs 按钮交互问题）。
- **「是否愿意再用」分布**：愿意 `__` 人 / 不愿意 `__` 人 / 未回答 `__` 人（附代表性原话与进入 `B20` 缓冲池修复项编号）。

---

## 4. 本单验证记录（四层分列口径）

本单（`#142`）仅新增复核与准备文档 [issue142-b12-review-and-b18-b19-prep.md](issue142-b12-review-and-b18-b19-prep.md)，未修改任何业务源码、数据库 Schema、迁移脚本、接口契约或原生依赖：

- **静态检查与格式化（`pnpm check`）**：在基于最新 `origin/main`（`fd25526`）新建的独立工作树执行 `pnpm check`（含 `build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .`），全部通过。
- **证据文件交叉核对**：逐项核验 `docs/evidence/issue141-b12-first-acceptance/` 下全部 13 张 `1080 × 2400` PNG 截图与 10 份原始日志，以及 `docs/issue141-b12-first-acceptance.md`、`docs/environment-setup.md`、`docs/beta-external-user-observation-template.md` 本地相对链接全部有效。
- **第 1 层（无数据库测试 `pnpm test`） / 第 2 层（移动端组件测试 `pnpm test:mobile`） / 第 3 层（真实 PostgreSQL 集成测试） / 第 4 层（原生客户端状态）**：本单为文档复核与实测台账准备，未改动代码与原生配置，未重跑服务端/移动端测试套件，也未新构建或新安装原生客户端（`B12` 原生新装验收已由 `#141` 在 `b859ba9` 完成并经本单复核通过）。
