# #182 Beta Day 7 第二次正式验收独立复核与调查实测证据封板核对（B21 / B22）

日期：2026-11-22（Beta 冲刺第 7 天 · 第二次正式验收与最终交付封板日）  
关联任务：[Issue #182](https://github.com/Liangbai2333/tongzhang/issues/182)（配合闭环 `B21` 4 点（计入詹铖煜名下）与 `B22` 4 点（计入袁湘湘名下），不重复估点）  
负责人：陈林祺（`@lllin7`）；第二审查人：饶恩哲（`@Liangbai2333`）、许雅欣（`@XYX-v`）。

> **验收措辞、账号隔离与点数核销口径声明**（严格遵守 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律）：
>
> 1. **严格保持「第二次正式验收」措辞规范**：仅 Day 7 `#181` / `#182` 在脱离本机 API（`3300`）、Metro（`8081`）与 `adb reverse` 的干净环境新装最终候选独立 Release APK 并完成三方 SHA-256 核对后称 **第二次正式验收**（Day 4 `B12` / `#141` 为第一次正式验收）；Day 6 `#173` 首链检查与 `#174` `B18` 四人“鼓山一日”实测统一称 **当天核对 / 线上实测**，不与正式验收混用。
> 2. **严格隔离「内部验收账号」与「组外真实用户样本」**：`B18` 鼓山实测 4 个内部验收账号（`gushan174-an/bai/chen/ding@test.example`）与 `B21` 第二次正式验收 2 个内部验收账号（`b21owner181@tongzhang.test`、`b21member181@tongzhang.test`）均已在云端生产库清理至 `0` 残留，**`0` 计入 `B19` 组外用户量**；`B19` 仅纳入非本小组成员亲手实操有效样本 **`87` 份**（总回收 `98` 份，严格剔除 `11` 份仅看别人演示的旁观样本）。
> 3. **点数核销门禁**：本单为 `B21` 与 `B22` 配合复核与封板对齐单，不重复估点；`B21`（4 点）与 `B22`（4 点）须随 `#177` / `#184` 完成双关口（许雅欣确认完成口径、饶恩哲核销整项点数）后统一归零。

---

## 1. `B21` 第二次正式验收独立书面复核

- **复核对象**：詹铖煜（`@sunny-light233`）提交的 [issue181-b21-second-acceptance.md](issue181-b21-second-acceptance.md)（关联 [#181](https://github.com/Liangbai2333/tongzhang/issues/181) / [PR #199](https://github.com/Liangbai2333/tongzhang/pull/199)）及 `docs/evidence/issue181-b21-second-acceptance/` 下全部 5 份原始日志与 13 张 `1080 × 2400` 运行原图。
- **PR 独立书面复核批注**：已留存于 [PR #199 独立复核批注](https://github.com/Liangbai2333/tongzhang/pull/199#issuecomment-7193743083)。
- **复核依据**：[app-user-guide.md（独立 Android APK 下载校验与安装）](app-user-guide.md#独立-android-apk-下载校验与安装)、[apps/mobile/app.config.ts](../apps/mobile/app.config.ts)、[issue183-day7-final-four-layer-tests.md](issue183-day7-final-four-layer-tests.md)（行为代码变更边界核验）及云端 PostgreSQL 17 终态快照。

### 1.1 脱离开发电脑隔离、三方 SHA-256 与权限清单复核

| 复核维度                | 核对标准                                                                                    | 实际核对证据与结果                                                                                                                                                                                                                                                                                                                                  | 复核结论 |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **本地进程与端口隔离**  | 运行前后宿主机无本机 API（`3300`）与 Metro（`8081`）监听，且 `adb reverse --list` 全程为空  | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt) 与 [runtime-verification.txt](evidence/issue181-b21-second-acceptance/runtime-verification.txt) 实证运行前后均 `OK: no process listening on TCP 3300 or 8081` 且 `adb reverse` 为空                                                            | **通过** |
| **空白设备与全新安装**  | 空白擦除 ARM64 Android 17 模拟器安装前未装旧包，严格按最终手册完成新装与冷启动              | 安装前 `com.tongzhang.app not installed`；`adb install` 返回 `Success`；冷启动 `LaunchState: COLD`（`TotalTime: 4481ms`）直达欢迎页，无红屏与开发菜单                                                                                                                                                                                               | **通过** |
| **三方 SHA-256 一致**   | GitHub Release 摘要、宿主机 `SHA256SUMS.txt` 与设备内 `/data/app/.../base.apk` 三方逐位一致 | [release-verification.json](evidence/issue181-b21-second-acceptance/release-verification.json)（`beta-day6-20261121`，`136,832,199` 字节，目标提交 `ef3cf8607bff38444bd580cb69fcbc2abe7ade05`）、宿主机校验与设备 `base.apk` 均为 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`                                                | **通过** |
| **行为代码冻结边界**    | 自独立 APK 构建提交 `ef3cf86` 至当前主线无业务源码、契约、Schema 或原生配置变更             | 执行 `git log --oneline ef3cf86..HEAD -- apps/ packages/ infra/` 确认仅测试文件与集成测试夹具有改动，`apps/mobile/src`、`apps/server/src`、`packages/contracts`、`packages/domain`、Drizzle 迁移与 `infra/` 零改动                                                                                                                                  | **通过** |
| **公网 HTTPS 与零密钥** | 直连 `https://tongzhang.worldboot.net` 健康，内嵌 Hermes Bundle 无服务端密钥残留            | [https-probes.txt](evidence/issue181-b21-second-acceptance/https-probes.txt) 确认 `/health/ready` 与 `/api/v1/system/info` 均为 `HTTP/2 200`，内嵌 `assets/index.android.bundle`（`4,023,444` 字节）指向 `https://tongzhang.worldboot.net` 且 `ZERO_SERVER_SECRETS_FOUND`                                                                           | **通过** |
| **最小相机权限清单**    | 仅声明扫码/拍照所需相机权限，关闭独立录音权限；相机拒权后平稳回退手输邀请码页               | [apps/mobile/app.config.ts](../apps/mobile/app.config.ts) 显式配置 `expo-camera` `microphonePermission: false`、`recordAudioAndroid: false` 与 `expo-image-picker` `microphonePermission: false`；[05-scanner-denied-fallback.png](evidence/issue181-b21-second-acceptance/05-scanner-denied-fallback.png) 实证拒权后停留在手输页并展示内联回退提示 | **通过** |
| **云端库守恒与零残留**  | 线上 PostgreSQL 17 整数分守恒、批次版本与提醒已读状态准确，验后临时数据全部归零清理         | [cloud-db-conservation-and-cleanup.txt](evidence/issue181-b21-second-acceptance/cloud-db-conservation-and-cleanup.txt) 实证 `Hotpot dinner` `18000` 分 = 2 行分摊 `18000` 分、`zero-sum-dp-v1` `source_version = 3` / `transfer_total_cents = 9000`、`SETTLEMENT_REMINDER` `is_read = t`、验后 15 张公共表全部 `0` 行                               | **通过** |

### 1.2 四栏正式验收步骤（13 步）与 13 张原图逐项交叉复核

对 [issue181-b21-second-acceptance.md](issue181-b21-second-acceptance.md) 第 3 节全部 13 行四栏记录（「版本 / 环境 / 步骤 / 结果」）及 13 张 `1080 × 2400` PNG 原图逐张实看核验：

| 序号 | 正式验收步骤（`ef3cf86` / 环境 B）                      | 归档原图与日志交叉印证                                                                                                                                                                                     | 复核意见                        |
| ---: | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
|    1 | 按手册校验安装独立 APK 并无 Metro 冷启动                | [01-cold-start-welcome.png](evidence/issue181-b21-second-acceptance/01-cold-start-welcome.png) + `adb-isolation-and-sha256.txt`：冷启动 `4481ms` 直达欢迎页，无开发菜单与红屏                              | **通过**                        |
|    2 | 注册 `b21owner` 直连公网 HTTPS 进入在线账本首页         | [02-register-owner-home.png](evidence/issue181-b21-second-acceptance/02-register-owner-home.png)：展示「早上好，b21owner」「全部账本」「站内提醒」「还没有账本」，双标签常驻                               | **通过**                        |
|    3 | 「我的 → 账户信息」显式重新核验在线会话                 | [03-online-session-verified.png](evidence/issue181-b21-second-acceptance/03-online-session-verified.png)：展示「当前账号已在线核验」、`b21owner` 与只读邮箱 `b21owner181@tongzhang.test`                   | **通过**                        |
|    4 | 创建账本 `B21SecondAccept` 并进入邀请页                 | [04-created-ledger-invitation.png](evidence/issue181-b21-second-acceptance/04-created-ledger-invitation.png)（见 1.4 备注 1）+ `cloud-db-conservation-and-cleanup.txt`（`LEDGER_CREATED = 1`）             | **通过**（见 1.4 非阻塞备注 1） |
|    5 | 切号注册 `b21member`，点击「扫码加入」后拒绝相机权限    | [05-scanner-denied-fallback.png](evidence/issue181-b21-second-acceptance/05-scanner-denied-fallback.png)：停留在手输页，红字内联提示「未获得相机权限，请直接在上方输入 6 位邀请码加入。」                  | **通过**                        |
|    6 | 手输 6 位邀请码 `EPA8NA` 预览并加入 `B21SecondAccept`   | [06-join-ledger-success.png](evidence/issue181-b21-second-acceptance/06-join-ledger-success.png)（见 1.4 备注 2）+ `12-notifications-unread.png`（`2 位成员`）+ 库快照（`MEMBER_JOINED = 1`）              | **通过**（见 1.4 非阻塞备注 2） |
|    7 | 记账页调用公网 `A31` AI 生成草稿回填表单（不直写库）    | [07-ai-draft-backfilled.png](evidence/issue181-b21-second-acceptance/07-ai-draft-backfilled.png)：回填 `¥180.00`、`Hotpot dinner`、`餐饮`、`2 位成员`、`人均` 与 3 条告警；横幅单行无折行                  | **通过**（`D-158-02` 零回退）   |
|    8 | 人工核对后点「保存消费」（`A13`）落库并进入消费详情     | [08-expense-saved-detail.png](evidence/issue181-b21-second-acceptance/08-expense-saved-detail.png)（见 1.4 备注 1）+ `09-statistics-charts.png` + 库快照（`18000` 分 = 2 行分摊，`EXPENSE_CREATED = 1`）   | **通过**（见 1.4 非阻塞备注 1） |
|    9 | 打开「支出统计」（`A21`）核对 SVG 图表与排行            | [09-statistics-charts.png](evidence/issue181-b21-second-acceptance/09-statistics-charts.png)：`1 笔有效消费`、`¥180.00`、SVG 环形图 `餐饮 100.0%`、按日柱图 `11-26` 与单笔排行 `Hotpot dinner`             | **通过**                        |
|   10 | 创建者 `b21owner` 发起正式冻结进入 `SETTLING`（`A23`）  | [10-settlement-frozen.png](evidence/issue181-b21-second-acceptance/10-settlement-frozen.png)：`B21SecondAccept · 结算中`、`账单已冻结`、`0 / 1 笔已登记`、`待登记 ¥90.00`（`b21owner → b21member`）        | **通过**                        |
|   11 | 收款人 `b21member` 发起站内催还并切换冷却态（`A32`）    | [11-reminder-sent-cooldown.png](evidence/issue181-b21-second-acceptance/11-reminder-sent-cooldown.png)：底部提示 6 小时冷却，按钮灰置「已催还（冷却中）」，转账金额未变                                    | **通过**                        |
|   12 | 付款人 `b21owner` 打开「站内提醒」（`A33`）查看未读条目 | [12-notifications-unread.png](evidence/issue181-b21-second-acceptance/12-notifications-unread.png)：未读条目展示 `¥90.00`、备注 `B21 reminder check` 与 `2026-11-26 05:10`（无 `AM/PM`）                   | **通过**（`D-158-01` 零回退）   |
|   13 | 点击未读提醒自动标记已读（`A34`）直达结算页并复查未读空 | [13-notification-jumped-settlement.png](evidence/issue181-b21-second-acceptance/13-notification-jumped-settlement.png) + `runtime-verification.txt`（`UNREAD_EMPTY_AFTER_A34=true`）+ 库快照 `is_read = t` | **通过**                        |

### 1.3 前期局部界面修复项（`B20`）零回退复核

| 缺陷编号   | 修复内容（`#169` 合入 `ef3cf86`）                         | `B21` 第二次正式验收复核依据                                                                                                                                                                                                                        | 回归结论   |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `D-142-01` | 6 位邀请码「确认加入」弹窗弹出时背景输入框零字符残影      | 本次 `B21` 使用与 `#174` 逐位同哈希包体 `tongzhang-ef3cf86-standalone.apk`（`ef3cf86` 源码零改动）；弹窗遮罩零残影已由 `#174` [03-join-preview-d14201-fixed.png](evidence/issue174/03-join-preview-d14201-fixed.png) 直接实证，本次手输预览加入正常 | **零回退** |
| `D-158-01` | 英文系统语言下「站内提醒」时间统一格式 `YYYY-MM-DD HH:mm` | 空白擦除英文 Locale 模拟器原图 [12-notifications-unread.png](evidence/issue181-b21-second-acceptance/12-notifications-unread.png) 稳定显示 `2026-11-26 05:10 · 点击查看结算页`，无 `AM/PM` 混排                                                     | **零回退** |
| `D-158-02` | `1080 × 2400` 屏幕上 AI 草稿回填横幅单行展示零折行        | 原图 [07-ai-draft-backfilled.png](evidence/issue181-b21-second-acceptance/07-ai-draft-backfilled.png) 顶部提示条「AI 草稿已回填，请核对后手动点击「保存消费」」单行完整无折行                                                                       | **零回退** |

### 1.4 逐图复核发现的非阻塞细节（透明记录，不阻断 `B21` 闭环）

1. **瞬态加载截屏时机（`04` 与 `08`）**：[04-created-ledger-invitation.png](evidence/issue181-b21-second-acceptance/04-created-ledger-invitation.png) 与 [08-expense-saved-detail.png](evidence/issue181-b21-second-acceptance/08-expense-saved-detail.png) 截取于页面跳转后的瞬态「正在加载 / 请稍候。」画面，未拍到加载完成后的最终卡片。但后续 [06-join-ledger-success.png](evidence/issue181-b21-second-acceptance/06-join-ledger-success.png)、[09-statistics-charts.png](evidence/issue181-b21-second-acceptance/09-statistics-charts.png)（明确展示 `B21SecondAccept · 1 笔有效消费`、`¥180.00`、`餐饮 100.0%`、`Hotpot dinner`）以及 [cloud-db-conservation-and-cleanup.txt](evidence/issue181-b21-second-acceptance/cloud-db-conservation-and-cleanup.txt)（`LEDGER_CREATED = 1`、`MEMBER_JOINED = 1`、`EXPENSE_CREATED = 1`、`Hotpot dinner` `18000` 分 = 2 行分摊 `18000` 分）已充分交叉印证底层接口落库与守恒完全有效。
2. **截图画面与局部文案微差（`06`）**：[06-join-ledger-success.png](evidence/issue181-b21-second-acceptance/06-join-ledger-success.png) 呈现加入后的账本详情页，右上角实际展示为「`...`」更多菜单按钮（「查看成员 · 2 / 12」收在更多菜单面板内），且未单截「确认加入这个账本？」预览弹窗；结合 [12-notifications-unread.png](evidence/issue181-b21-second-acceptance/12-notifications-unread.png)（「`2 位成员`」）、库快照（`ledger_members = 2`）及同哈希包体 `#174` 的 [03-join-preview-d14201-fixed.png](evidence/issue174/03-join-preview-d14201-fixed.png)，确认成员加入与 `D-142-01` 修复均真实有效。

### 1.5 `B21` 第二次正式验收独立复核结论

- **复核结论**：**通过**。
- **签收说明**：已于 [PR #199](https://github.com/Liangbai2333/tongzhang/pull/199#issuecomment-7193743083) 留下具体书面复核批注；同意作为 `B21`（整项 `4` 点，计入詹铖煜名下）独立复核通过依据，随 `#177` 双关口终审完成点数归零。

---

## 2. `B18` 实测与 `B19` 组外调查归档材料同最终交付封板索引的一致性核对

配合 `B22`（`#184` 交付封板与置顶汇总索引整理），对 `B18`（四人 `300` 元 / `30000` 分“鼓山一日”独立 APK 线上实测）与 `B19`（`≥ 12` 份组外真实同学匿名三格调查台账）的全部原始归档产物及仓内引用做逐项封板核对：

### 2.1 `B18` 与 `B19` 原始归档完整性及独立复算核对

| 核对对象                                                                                                                        | 归档产物与独立复算核验结果                                                                                                                                                                                                                                                                            | 一致性结论 |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `B18` 独立包体与三方 SHA-256（[isolation-and-sha256.txt](evidence/issue174/isolation-and-sha256.txt)）                          | 与 `B21` 严格同源：均使用 `beta-day6-20261121` 的 `tongzhang-ef3cf86-standalone.apk`（`ef3cf86`，SHA-256 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`），宿主机 `3300/8081` 无监听、`adb reverse` 为空                                                                          | **一致**   |
| `B18` 四人 `30000` 分“鼓山一日”运行原图（`docs/evidence/issue174/`）                                                            | `01-welcome-standalone.png` ～ `13-bai-unarchived-settled.png` 共 **13 张** `1080 × 2400` 原图全部在库，完整覆盖十步原主链、Beta 六项新增能力与 `D-142-01` / `D-158-01` / `D-158-02` 复测                                                                                                             | **一致**   |
| `B18` 线上 PostgreSQL 17 守恒快照（[cloud-db-conservation-snapshot.txt](evidence/issue174/cloud-db-conservation-snapshot.txt)） | 独立复核：`鼓山一日` `SETTLED` / `version = 12`；有效消费 3 笔（食堂 `12000` + 鼓山门票 `12000` + 车费 `6000`）= `30000` 分 = 10 行分摊 `30000` 分（软删 `14000` 分被排除）；`zero-sum-dp-v1` `2` 笔 `PAID` 转账合计 `9000` 分；验后单事务清理 `remaining_174_users = 0`、`remaining_174_ledgers = 0` | **一致**   |
| `B19` 脱敏问卷原始表（[b19-microsoft-forms-98.csv](evidence/issue174/b19-microsoft-forms-98.csv)）                              | 独立脚本核验：共 **99 行**（1 行表头 + **98 条**答卷记录）；勾选「今天按说明自己操作过」精确 **`87` 条**；勾选「只看过别人演示，自己没点过」精确 **`11` 条**（序号 `#16, #22, #34, #38, #41, #44, #61, #77, #78, #85, #98`，已全部剔除）；正则扫描邮箱与手机号零命中（零 PII 泄露）                   | **一致**   |
| `B19` 匿名三格原话台账与三分类（[issue174-b18-gushan-and-b19-survey.md](issue174-b18-gushan-and-b19-survey.md)）                | 第 4.3 节完整收录 `U-01`～`U-87` 共 **`87` 份**（达 `≥ 12` 份门槛的 `7.25` 倍）；新增阻断级 `缺陷 = 0`、新增 `加范围 = 0`；全部非阻断建议按 `P-174-01`～`P-174-05` 及 `X01/X03/X05` 归类                                                                                                              | **一致**   |

### 2.2 仓内交付文档与封板索引引用一致性核对

| 交付索引 / 汇总文档                                                                | 当前引用内容核对                                                                                                                                                                                                                                                                                                                                                          | 供 `#184`（`B22`）封板对齐备注                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [README.md](../README.md)                                                          | 第 7 行已准确引用 `beta-day6-20261121`、`tongzhang-ef3cf86-standalone.apk`、`ece352d6...`、[#173](issue173-standalone-apk-https-daily-check.md)、[#174](issue174-b18-gushan-and-b19-survey.md)（四人 `30000` 分鼓山实测及 `87` 份非本组实操调查）及 [#181](issue181-b21-second-acceptance.md) / [#182](issue182-b21-review-and-b22-evidence-seal.md) `B21` 第二次正式验收 | 已由 [#184](issue184-b22-delivery-seal.md)（`B22`）封板同步对齐                      |
| [known-limitations.md](known-limitations.md)                                       | 已将 `B21` 第二次正式验收移入「原生实测」基线，完整登记 `P-158-01` 与 `P-174-01`～`P-174-05` 共 6 项 `推迟`（`0` 点）并链回 [beta-sprint-plan.md](beta-sprint-plan.md)，同步 `98` 份回收、`11` 份旁观剔除、`87` 份有效亲手实操及 `X01/X03/X05` 零点边界                                                                                                                   | 已由 [#184](issue184-b22-delivery-seal.md)（`B22`）封板同步对齐                      |
| [issue180-settlement-statistics-seal.md](issue180-settlement-statistics-seal.md)   | 第 2 节完整复算并引用 `#174`（`B18` 鼓山 `30000` 分守恒快照）与 `#181`（`B21` 第二次正式验收 `18000` 分守恒快照），数值与原始日志逐位一致                                                                                                                                                                                                                                 | 已对齐，无需改动                                                                     |
| [issue183-day7-final-four-layer-tests.md](issue183-day7-final-four-layer-tests.md) | 准确锁定 `ef3cf86` 行为基线、`tongzhang-ef3cf86-standalone.apk`（`ece352d6...`）与 `#181` 第二次正式验收四栏格式核准                                                                                                                                                                                                                                                      | 已对齐，无需改动                                                                     |
| 置顶集合随笔与最终交付证据索引（由 `#184` 统筹落盘）                               | 本单已锁定 `B18`、`B19` 与 `B21` 的唯一规范证据入口：`issue174-b18-gushan-and-b19-survey.md`、`evidence/issue174/`、`issue181-b21-second-acceptance.md`、`evidence/issue181-b21-second-acceptance/` 与本复核报告 `issue182-b21-review-and-b22-evidence-seal.md`                                                                                                           | 供袁湘湘在 `#184`（`B22`）封板索引与置顶集合随笔直接引用，避免路径分叉或数字口径漂移 |

### 2.3 验收账号与组外真实用户样本隔离核查表

| 账号 / 样本类别                 | 具体标识与归属                                                                                                                                | 所属任务与用途                                                              | 线上生产库清理状态                                                                                                                                                               | 是否计入 `B19` 组外用户量     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **`B18` 内部验收账号（4 个）**  | `小安` / `小白`（后改名 `小白174`） / `小陈` / `小丁`（`gushan174-an/bai/chen/ding@test.example`）                                            | `#174` `B18` 四人 `30000` 分“鼓山一日”线上实测                              | 已于单事务内彻底清理（`remaining_174_users = 0`、`remaining_174_ledgers = 0`，见 [cloud-db-conservation-snapshot.txt](evidence/issue174/cloud-db-conservation-snapshot.txt)）    | **否（`0` 计入）**            |
| **`B21` 内部验收账号（2 个）**  | `b21owner`（`b21owner181@tongzhang.test`）、`b21member`（`b21member181@tongzhang.test`）                                                      | `#181` `B21` 独立 APK 第二次正式验收                                        | 验后已彻底清理，线上库全部 15 张公共表均恢复 `0` 行（见 [cloud-db-conservation-and-cleanup.txt](evidence/issue181-b21-second-acceptance/cloud-db-conservation-and-cleanup.txt)） | **否（`0` 计入）**            |
| **`B19` 旁观剔除样本（11 份）** | Microsoft Forms 导出序号 `#16, #22, #34, #38, #41, #44, #61, #77, #78, #85, #98`（「只看过别人演示，自己没点过」）                            | 保留于原始脱敏 CSV 中备查，严格从有效指标口径剔除                           | 不涉及线上库账号                                                                                                                                                                 | **否（已剔除）**              |
| **`B19` 组外有效样本（87 份）** | `U-01`～`U-87`（「不是该小组成员，今天按说明自己操作过」，归档于 [b19-microsoft-forms-98.csv](evidence/issue174/b19-microsoft-forms-98.csv)） | `#174` `B19` 组外真实同学匿名三格原话实操调查（达 `≥ 12` 份门槛 `7.25` 倍） | 匿名脱敏表零姓名、零学号、零邮箱、零手机号                                                                                                                                       | **是（唯一有效来源，87 份）** |

---

## 3. 四层验证结果（严格分层单列，禁止跨层相加）

本单仅新增 `#182` 独立复核与封板核对文档，未修改业务源码、接口契约、数据库 Schema 或原生配置：

| 验证层级                | 执行命令 / 方式       | 结果明细                                                                                                                           |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 静态检查与格式化        | `pnpm check`          | 通过（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .` 全部零告警退出 `0`）                          |
| 交付契约与全仓链接审计  | `pnpm check:delivery` | 通过（`A01～A34` 契约与 [api-reference.md](api-reference.md) 零偏差，全仓 Markdown 本地相对链接与标题锚点 `failures=0`）           |
| 第 1～3 层自动化测试    | 本单未改动代码或测试  | 沿用 [issue183-day7-final-four-layer-tests.md](issue183-day7-final-four-layer-tests.md) Day 7 四层封板基线全绿结果，不重复计入     |
| 第 4 层：原生客户端状态 | 独立复核既有交付包    | 本单未重建或新装包体；已独立复核 `tongzhang-ef3cf86-standalone.apk`（`ef3cf86` / `ece352d6...`）在 `#181` 的第二次正式验收全套产物 |

---

## 4. 完成记录与双关口核销口径

- 负责人：陈林祺（`@lllin7`）；第二审查人：饶恩哲（`@Liangbai2333`）、许雅欣（`@XYX-v`）。
- `B21` 独立书面复核批注已留存于 [PR #199](https://github.com/Liangbai2333/tongzhang/pull/199#issuecomment-7193743083)；`B18`（四人 `30000` 分鼓山实测）与 `B19`（`87` 份组外真实同学亲手实操调查）归档材料、推迟项同步与账号隔离核对已完成，供 `#184`（`B22`）最终封板直接引用。
- 点数口径：本单不重复估点；`B21`（4 点，计入詹铖煜名下）与 `B22`（4 点，计入袁湘湘名下）待 `#177` / `#184` 双关口终审通过后核销归零。
