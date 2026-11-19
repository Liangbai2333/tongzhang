# Issue #124：B06 多维支出统计前后端联调复核与 B10 待还转账催还校验记录

日期：2026-11-18（Beta 冲刺 Day 3）  
关联任务：[Issue #124](https://github.com/Liangbai2333/tongzhang/issues/124)（收口 `B06` 整项 8 点，待第二审查人书面批注与双关口确认后核销；同步推进 `B10` 整项 6 点，计划 11 月 19 日完成，本单不提前扣减 `B10` 点数）。

---

## 1. B06 收口：A21 多维支出统计前后端数据绑定核对

对照服务端 [statistics-reader.ts](../apps/server/src/modules/balances/statistics-reader.ts) / [statistics.ts](../apps/server/src/modules/balances/statistics.ts)、共享契约 [balances.ts](../packages/contracts/src/balances.ts) 与移动端 B08 实现 [StatisticsScreen.tsx](../apps/mobile/src/features/balances/screens/StatisticsScreen.tsx) / [StatisticsCharts.tsx](../apps/mobile/src/features/balances/components/StatisticsCharts.tsx)，逐项复核五类展示场景与整数分守恒：

| 核对项                  | 服务端 `A21` 快照输出                                                                                                                                                                   | 移动端 SVG 页面消费与展示                                                                                                                                                                                                     | 核对结论 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **空账本（零消费）**    | `expenseTotalCents: "0"`、`expenseCount: 0`、`categories: []`、`dailyTrend: []`、`dailyTrendTruncated: false`、`topExpenses: []`、`members` 各成员三项为 `"0"`                          | `StatisticsScreen` 以 `expenseCount === 0 \|\| BigInt(expenseTotalCents) === 0n` 切换 `EmptyState`（「暂无消费统计」），不挂载 Donut / Trend SVG；`centsRatio` 对 `totalCents <= 0n` 返回 `0`，无除零与 `NaN`                 | 一致     |
| **多类别占比**          | `categories` 按 `amountCents` 降序、同额按契约固定枚举序，使用 `bigint` 四舍五入生成 1 位小数 `percentage` 字符串；分类总额与笔数之和严格等于 `expenseTotalCents` 与 `expenseCount`     | `CategoryDonutChart` 使用 `CATEGORY_CHART_COLORS` 覆盖全部 6 类枚举；环段比例由 `centsRatio(item.amountCents, BigInt(totalCents))` 整数缩放计算，图例逐行展示类别中文名、`expenseCount`、`percentage%` 与 `yuan(amountCents)` | 一致     |
| **按日趋势与截断标记**  | `dailyRows` 按 `occurredOn DESC` 查询 `LIMIT 367`，保留最近 366 天逆序升序输出，超出时置 `dailyTrendTruncated: true`；未截断时按日金额/笔数之和严格等于总额/总笔数                      | `DailyTrendChart` 头部展示 `共 ${dailyTrend.length} 天`，`truncated === true` 时展示截断提示横幅；横向滚动 SVG 柱图按 `BigInt` 最大值缩放，展示 `MM-DD` 与 `¥${formatYuan(BigInt(item.amountCents))}`                         | 一致     |
| **Top 10 单笔排行**     | 按 `amountCents DESC, occurredOn DESC, id ASC` 最多返回 10 笔未软删除消费，含 `id`、`title`、`amountCents`、`category`、`occurredOn`、`payerMemberId`、`payerName`                      | 展示「单笔支出排行 · 前 N 笔」，逐项显示名次、标题、类别/付款人/日期及 `yuan(item.amountCents)`，点击直达消费详情 `/ledgers/[ledgerId]/expenses/[expenseId]`                                                                  | 一致     |
| **成员已付 / 应摊拆解** | 与 `A20` 共用同一只读 `REPEATABLE READ` 事务快照的 `computeBalances(snapshot.members)`，保证 `paidCents - sharedCents === netCents` 且全员已付合计 = 全员应摊合计 = `expenseTotalCents` | `MemberComparisonChart` 逐成员展示用户名、`netAmount(netCents)`、`已付 … · 应摊 …` 与双色水平 SVG 条形对比，均按 `BigInt` 整数缩放                                                                                            | 一致     |

---

## 2. B10 推进：A32 待还转账催还实现与安全边界核对

实现位于 [remind.ts](../apps/server/src/modules/settlements/remind.ts)、[repository.ts](../apps/server/src/modules/settlements/repository.ts) 与 [service.ts](../apps/server/src/modules/settlements/service.ts)，移除原 `notReady('remindTransfer')` 的 `501` 占位并复用 `profile` 模块公开出口 `deliverSettlementReminderNotification`：

| 核对维度                   | 实现与验证结果                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **权限与角色**             | 强制登录（匿名 `401`）；非成员或不存在账本统一 `403 FORBIDDEN`；跨账本或不存在转账 `404 TRANSFER_NOT_FOUND`；仅该笔收款人或非付款人的账本创建者可发起，付款人本人（即使同时是账本创建者）与无关第三方成员均返回 `403 FORBIDDEN`（满足 `ck_notifications_parties` 约束）                                                                                                                        |
| **状态机校验**             | 仅 `ledger.status === 'SETTLING'` 且 `transfer.status === 'PENDING'` 允许新催还；`ACTIVE`、`SETTLED` 账本或已 `PAID` 转账发起新催还均返回 `409 LEDGER_STATE_INVALID`                                                                                                                                                                                                                           |
| **冷却窗口与隐私保护**     | 以 `operation_logs`（`action = 'TRANSFER_REMINDED'`）配合账本行锁 `SELECT ... FOR UPDATE` 执行同转账 6 小时冷却窗口；冷却期内由收款人或创建者换新键重复触发返回 `429 REMINDER_COOLDOWN`，同账本另一笔转账不受影响。付款人关闭 `A29` `notification_enabled` 时静默不写 `notifications` 行，响应字段仍严格为 `{ ledgerId, transferId, remindedAt, cooldownEndsAt }` 且同样计入冷却，无侧信道泄露 |
| **事务、幂等与零账务改动** | 全程单事务遵循 `executeIdempotent -> lockLedger -> 权限/状态/冷却 -> deliverSettlementReminderNotification -> appendAudit`；同键同体在冷却期内或结清后重放返回首次 `200` 结果，同键异体返回 `409 IDEMPOTENCY_CONFLICT`；调用前后 `ledgers.version`、`ledgers.updated_at`、`settlement_batches`、`settlement_transfers`、`expenses`、`expense_splits` 与 `A21` 快照零变化                       |
| **文档同步**               | 同 PR 同步更新 [api-reference.md](api-reference.md) 与 [known-limitations.md](known-limitations.md)                                                                                                                                                                                                                                                                                            |

---

## 3. 当天核对验证结果（四层分列，禁止跨层相加）

- **静态检查与构建**：`pnpm check`（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .`）与 `pnpm build:server` 全部通过。
- **无数据库测试（`pnpm test`）**：24 个测试文件、179 项用例全部通过（含 [settlement.test.ts](../apps/server/tests/settlement.test.ts) 新增的 `A32` 权限、状态机与冷却边界单测，以及既有 [statistics.test.ts](../apps/server/tests/statistics.test.ts) 10 项单测）。
- **移动端组件测试（`pnpm test:mobile`）**：26 个测试套件、286 项用例全部通过（Android + iOS 双项目，含 [statistics-ui.test.tsx](../apps/mobile/tests/statistics-ui.test.tsx) 覆盖空账本、鼓山四人基准账与 `dailyTrendTruncated` 截断横幅）。
- **真实 PostgreSQL 集成测试（显式 `TEST_DATABASE_URL`，临时 `postgres:17-alpine` 容器，用后已停止清理）**：`pnpm migrate:db` 后运行 `pnpm test:integration`，22 个测试文件、183 项用例全部通过（含新增 [settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts) 4 项完整场景及既有 [statistics.integration.test.ts](../apps/server/tests/statistics.integration.test.ts) 9 项场景）。
- **原生客户端状态**：本单未修改移动端源码、原生依赖或构建配置，未新构建也未新装原生客户端。

---

## 4. 审查与完成记录

- 负责人：叶银珍（@hisoka-morow527）；第二审查人：饶慧（@whisper-uoo）、饶恩哲（@Liangbai2333）。
- 第二审查人书面批注由其本人在对应 PR 下留下，本文不代写；`B06`（8 点）待双关口确认后核销，`B10`（6 点）按冲刺计划推进，本单不提前扣点。
