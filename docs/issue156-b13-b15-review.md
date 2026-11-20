# Issue #156：B13 结算页一键催还交互守恒边界与 B15 多维统计鼓山算例回归复核

日期：2026-11-20（Beta 冲刺第 5 天 · 功能冻结日）  
关联任务：[Issue #156](https://github.com/Liangbai2333/tongzhang/issues/156)（`Closes #156`）、[Issue #153](https://github.com/Liangbai2333/tongzhang/issues/153)（`Refs #153`）、[Issue #159](https://github.com/Liangbai2333/tongzhang/issues/159)（`Refs #159`）  
负责人：叶银珍（`@hisoka-morow527`，`balances` / `settlements` 模块作者）；第二审查人：李润君（`@range-e`）、饶慧（`@whisper-uoo`）  
燃尽口径：本复核任务配合闭环 `B13`（整项 6 点，计入饶恩哲名下）与 `B15`（整项 8 点，计入李润君名下），不重复估点。

---

## 1. B13 `A32` 结算页一键催还前后端边界复核

- **审查对象**：PR [#161](https://github.com/Liangbai2333/tongzhang/pull/161)（已合入基线 `b1cfad3`）及书面复核批注：[PR #161 书面批注](https://github.com/Liangbai2333/tongzhang/pull/161#issuecomment-7043361041)
- **对照源码**：[reminder.ts](../apps/mobile/src/features/settlements/reminder.ts)、[RemindTransferSheet.tsx](../apps/mobile/src/features/settlements/components/RemindTransferSheet.tsx)、[SettlementRecordScreen.tsx](../apps/mobile/src/features/settlements/screens/SettlementRecordScreen.tsx)、[use-idempotent-write.ts](../apps/mobile/src/lib/use-idempotent-write.ts)、[remind.ts](../apps/server/src/modules/settlements/remind.ts)、[repository.ts](../apps/server/src/modules/settlements/repository.ts)、[profile/service.ts](../apps/server/src/modules/profile/service.ts)、[idempotency.ts](../apps/server/src/db/idempotency.ts)、[settlements.ts](../packages/contracts/src/settlements.ts)

| 复核维度                 | 边界规则与实际对照结论                                                                                                                                                                                                                                                                                                                                                                    | 关联依据与自动化断言                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **入口展示与权限矩阵**   | 仅当 `ledgerStatus === 'SETTLING'` 且 `transfer.status === 'PENDING'`，且当前成员（`myMemberId`）非该笔付款人同时为收款人或 `role === 'CREATOR'` 时展示「提醒对方」；`SETTLED` 走 `SettledTransferCard` 隐藏入口，付款人本人（含创建者）及无关成员无入口且服务端 `requireReminderRole` 返回 `403 FORBIDDEN`；面板为结算页内嵌 `RemindTransferSheet`（`remind-confirm`），不单独建全屏路由 | [SettlementRecordScreen.tsx](../apps/mobile/src/features/settlements/screens/SettlementRecordScreen.tsx)、[remind.ts](../apps/server/src/modules/settlements/remind.ts)、[ai-draft-reminder-ui.test.tsx](../apps/mobile/tests/ai-draft-reminder-ui.test.tsx)          |
| **6 小时冷却与防刷**     | 催还成功后客户端记录 `cooldownEndsAt` 并将按钮置为禁用态「已催还（冷却中）」；服务端在 `SELECT ... FOR UPDATE` 账本行锁下查询 `operation_logs`（`action = 'TRANSFER_REMINDED'`）实施转账级 6 小时冷却（`DEFAULT_REMINDER_COOLDOWN_MS`），冷却期新键重复请求返回 `429 REMINDER_COOLDOWN`                                                                                                   | [remind.ts](../apps/server/src/modules/settlements/remind.ts)、[settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts)、[ai-draft-reminder-ui.test.tsx](../apps/mobile/tests/ai-draft-reminder-ui.test.tsx)           |
| **零侧信道与隐私静默**   | 服务端 `deliverSettlementReminderNotification` 在付款人关闭 `A29 notification_enabled` 时静默不写入 `notifications` 行但照常写入审计与计入 6 小时冷却；成功响应 `transferReminderResultSchema`（不含任何偏好标记）与 `429 REMINDER_COOLDOWN` 提示文案均不泄露付款人是否关闭通知                                                                                                           | [profile/service.ts](../apps/server/src/modules/profile/service.ts)、[reminder.ts](../apps/mobile/src/features/settlements/reminder.ts)、[settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts)                      |
| **幂等键保持与手动重试** | 全链路 `autoRetry: false`；`REQUEST_TIMEOUT` / `NETWORK_ERROR` / 5xx 与 `401 UNAUTHENTICATED` 均保留已输入的 `note` 与同一个 `Idempotency-Key`，仅由用户显式点击「手动重试催还」或重新核验后手动发送；`verifySettlementState` 在核对仍为 `SETTLING + PENDING` 时保持面板挂载以防换键误触 `429`                                                                                            | [use-idempotent-write.ts](../apps/mobile/src/lib/use-idempotent-write.ts)、[RemindTransferSheet.tsx](../apps/mobile/src/features/settlements/components/RemindTransferSheet.tsx)、[ai-draft-reminder-ui.test.tsx](../apps/mobile/tests/ai-draft-reminder-ui.test.tsx) |
| **财务与版本零改动**     | 服务端 `createRemindTransfer` 仅写入 `notifications`（条件）、`operation_logs` 与 `idempotency_keys`，不触碰 `expenses`、`expense_splits`、`settlement_batches`、`settlement_transfers` 或 `ledgers.version`；移动端 `onSuccess` 仅更新本页冷却状态并失效当前用户 `notifications` 查询，进度与转账金额保持不变                                                                            | [remind.ts](../apps/server/src/modules/settlements/remind.ts)、[SettlementRecordScreen.tsx](../apps/mobile/src/features/settlements/screens/SettlementRecordScreen.tsx)、[ai-draft-reminder-ui.test.tsx](../apps/mobile/tests/ai-draft-reminder-ui.test.tsx)          |

### 复核发现与修复（提交 `a33086c`、`d134cc9`）

1. **问题定位**：由于服务端 `executeIdempotent` 先校验 `idempotency_keys` 重放、未命中时再执行 `work()` 中的 `assertReminderNotInCooldown`，当首次催还遭遇超时或 5xx（`write.uncertain === true`），用户随后以原 `Idempotency-Key` 手动重试却收到确定性终态拒收（`429 REMINDER_COOLDOWN`、`403 FORBIDDEN` 或超出 24 小时窗的 `RETRY_WINDOW_EXPIRED`）时，说明该原键未成功落库且业务处于终态拒绝。原 `RemindTransferSheet` 因 `useIdempotentWrite` 维持 `uncertain === true` 而隐藏重试按钮、禁用「取消」与硬件返回键，且 `verifySettlementState` 在转账仍为 `SETTLING + PENDING` 时拒绝关闭面板，造成模态死锁；同时 `state_invalid` / `idempotency_conflict` / `not_found` 会同时渲染「刷新结算页」与「刷新结算页核对」两个重复按钮。
2. **修复措施**：
   - 在 [reminder.ts](../apps/mobile/src/features/settlements/reminder.ts) 显式映射 `RETRY_WINDOW_EXPIRED`（`kind: 'retry_expired'`，`actionLabel: '刷新结算页'`，`autoRetry: false`）。
   - 在 [RemindTransferSheet.tsx](../apps/mobile/src/features/settlements/components/RemindTransferSheet.tsx) 区分输入锁定（`locked = write.busy || write.uncertain || checking` 保持草稿不可篡改）与退出允许（`canDismiss = !write.busy && !checking && (!write.uncertain || needsRefresh)`），在终态拒收下收拢为单一「刷新结算页」按钮并解除「取消」与返回键锁定，同时在 `needsRefresh` 时隐藏重复的「刷新结算页核对」按钮。
   - 在 [ai-draft-reminder-prep.test.tsx](../apps/mobile/tests/ai-draft-reminder-prep.test.tsx) 与 [ai-draft-reminder-ui.test.tsx](../apps/mobile/tests/ai-draft-reminder-ui.test.tsx) 补齐 4 人角色矩阵、`401` 保键重发、超时转 `429` 解锁、「刷新结算页核对」识别 `PAID` 关窗及 `409` 去重回归。

---

## 2. B15 `A21` 多维支出统计与鼓山四人 30000 分守恒回归审查

- **审查对象**：PR [#162](https://github.com/Liangbai2333/tongzhang/pull/162)（已合入基线 `b1cfad3`）及书面审查批注：[PR #162 书面批注](https://github.com/Liangbai2333/tongzhang/pull/162#issuecomment-7043361795)
- **对照源码与测试**：[b15-gushan-closure.integration.test.ts](../apps/server/tests/b15-gushan-closure.integration.test.ts)、[statistics-reader.ts](../apps/server/src/modules/balances/statistics-reader.ts)、[snapshot.ts](../apps/server/src/modules/balances/snapshot.ts)、[issue159-day5-test-results.md](issue159-day5-test-results.md)

### 鼓山四人基准账（30000 分）精确守恒矩阵

| 校验面                            | 期望整数分与守恒约束                                                                                                                                                                                                                                                                                                                                                                                 | 核对结果 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A16 编辑与 A17 软删除**         | 食堂 `10000` → `12000`（`DINING`），门票 `12000`（`TICKET`），车费 `6000`（`TRANSPORT`，小安/小陈均分）；误记 `4500`（`SHOPPING`）软删除后库内保留 `expenses` 与完整 `expense_splits`（`4500n`），同键重放（含 `SETTLING` 冻结后）返缓存 `200`、异体返 `409 IDEMPOTENCY_CONFLICT`、冻结后新键返 `409 LEDGER_FROZEN` 且零写 `idempotency_keys`                                                        | 通过     |
| **A21 多维支出统计**              | 仅计入有效 3 笔消费：`expenseTotalCents = '30000'`、`expenseCount = 3`、`dailyTrendTruncated = false`；分类占比 `DINING 12000 (40.0)`、`TICKET 12000 (40.0)`、`TRANSPORT 6000 (20.0)` 且分类之和 `30000n`；按日趋势 `2026-11-15: 24000 (2 笔)`、`2026-11-16: 6000 (1 笔)` 且趋势之和 `30000n`；`topExpenses` 按金额降序、同额同日 `id ASC`（末位车费 `6000`）                                        | 通过     |
| **成员余额与 A20/A21 跨接口守恒** | 小安 `12000 / 9000 / +3000`、小白 `12000 / 6000 / +6000`、小陈 `6000 / 9000 / -3000`、小丁 `0 / 6000 / -6000`；`sum(paid) = 30000n`、`sum(shared) = 30000n`、`sum(net) = 0n`；`ACTIVE` 态下 `A20 getBalances` 与 `A21` 成员字段一致且 `remainingNetCents === netCents`                                                                                                                               | 通过     |
| **A22 → A27 结算与归档闭环**      | `A22` 只读预览不递增 `ledgers.version`，最少 `2` 笔转账共 `9000` 分（小陈→小安 `3000`、小丁→小白 `6000`）；`A23` 冻结写入 `netSnapshot`（之和 `0n`）；`A25` 全额登记与 `A26` 结清（`SETTLED`）后全员 `remainingNetCents === '0'`，且 `A20`/`A21` 总消费与净额保持 `30000` 分不变（还款不是消费）；`A27` 小丁个人归档后本人 `archivedAt !== null`，小安 `archivedAt === null` 且 `A20`/`A21` 快照不变 | 通过     |

### 业务断言补强收口（提交 `d134cc9`）

在保留原有隔离库回归场景的前提下，对 [b15-gushan-closure.integration.test.ts](../apps/server/tests/b15-gushan-closure.integration.test.ts) 补充 4 处精确断言：

1. 将 `topExpenses` 由无序集合比对升级为确定性排序断言（`[...tiedTopIds, fare.id]`）并校对改单后食堂标题、金额、类别与日期。
2. 将 `preview.transfers` 金额排序从字典序 `localeCompare` 改为 `BigInt` 整数分比较。
3. 补充 `dailyTrendTruncated === false`、分类与按日金额/笔数显式求和、`ACTIVE` 阶段 `A20 getBalances` 与 `A21` 成员跨接口守恒，以及 `A23` 冻结后 `A24 getSettlement` 的 `netSnapshot` 与进度断言。
4. 补充 `SETTLED` 后 `A20` 与 `A21` 成员净额比对，以及 `A27` 个人归档后本人/他人的 `archivedAt` 与 `A20 getBalances` 隔离断言。

---

## 3. 本次实跑验证结果（四行分列，严禁跨层相加）

被测代码提交：`d134cc9`（基于 `origin/main` `b1cfad3`，含修复提交 `a33086c` 与测试补强提交 `d134cc9`）；本文档随后提交归档。

| 层                                   | 命令 / 方式                                                                                                            | 提交 / 安装包状态                                                                                                                                  | 实际结果                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **静态检查与导出辅助**               | `pnpm check`、`pnpm doctor:mobile`、`pnpm export:mobile`                                                               | `d134cc9`（文档归档后复跑 `pnpm check`）                                                                                                           | `pnpm check`（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .`）通过；`pnpm doctor:mobile` 21/21 项通过；`pnpm export:mobile` Android 与 iOS JS Bundle 导出通过（仅验证 JS 打包，**不等同于原生安装验收**） |
| **1. 无数据库**                      | `pnpm test`                                                                                                            | `d134cc9`                                                                                                                                          | **26** 个测试文件、**194** 项测试全部通过                                                                                                                                                                                                 |
| **2. 移动端组件**                    | `pnpm test:mobile`                                                                                                     | `d134cc9`                                                                                                                                          | **34** 个测试套件（iOS 17 + Android 17）、**358** 项测试全部通过（含 `ai-draft-reminder-prep.test.tsx` 与 `ai-draft-reminder-ui.test.tsx` 双端 **46** 项）                                                                                |
| **3. 隔离 `TEST_DATABASE_URL` 集成** | 临时 `postgres:17-alpine` 容器（用后已停止销毁），`pnpm migrate:db` 后运行 `TEST_DATABASE_URL=… pnpm test:integration` | `d134cc9`                                                                                                                                          | **25** 个测试文件、**197** 项测试全部通过（含强化后的 `b15-gushan-closure.integration.test.ts` 与 `settlement-reminder.integration.test.ts`）；测试前与全部通过后 15 张核心公共表均为 **0** 行残留                                        |
| **4. 原生客户端状态**                | 本次复核任务未重建原生客户端或执行真机/模拟器安装                                                                      | 未新构建；最近合入主线的原生验收包为 `B12` 提交 `b859ba9`（`base.apk` SHA-256 `3cbcb6a31d70efbc3cf2c081410a22d15af66ff29d8991aec3b3960230eac806`） | 本次改动仅涉及移动端 JS/TS 面板逻辑、组件测试与服务端集成测试，未新增原生依赖或修改原生配置，未重新执行原生安装验收                                                                                                                       |

---

## 4. 手册、契约与接口同步核对

本次修改仅修复前端 `RemindTransferSheet` 在不确定态遇终态拒收的面板解锁交互并补强前后端回归断言，未改变任何外部 HTTP 路由、请求/响应 Schema、错误码或限制范围，既有 [api-reference.md](api-reference.md)、[app-user-guide.md](app-user-guide.md) 与 [known-limitations.md](known-limitations.md) 中的 `A21` / `A32` 描述保持准确同步。
