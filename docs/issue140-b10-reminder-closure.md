# Issue #140：B10 待还转账催还冷却防刷、提醒联动与结算守恒收口复核

日期：2026-11-19（Beta 冲刺 Day 4）  
关联任务：[Issue #140](https://github.com/Liangbai2333/tongzhang/issues/140)（收口 `B10` 整项 6 点，待第二审查人书面批注与双关口确认后核销）。

---

## 1. A32 契约、权限、状态机与防刷逐项复核

对照服务端 [remind.ts](../apps/server/src/modules/settlements/remind.ts)、[repository.ts](../apps/server/src/modules/settlements/repository.ts)、[profile/service.ts](../apps/server/src/modules/profile/service.ts)、共享契约 [settlements.ts](../packages/contracts/src/settlements.ts) / [endpoints.ts](../packages/contracts/src/endpoints.ts) 与接口索引 [api-reference.md](api-reference.md)，完成以下闭环核对：

| 核对维度             | 契约与实现边界                                                                                                                                                                                                                                                                                                                 | 自动化核对依据                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **认证与参数校验**   | 匿名访问返回 `401 UNAUTHENTICATED`；缺失或非 UUID `Idempotency-Key`、空白/超长（>120 字）`note` 及未知多余字段返回 `400 VALIDATION_ERROR`；合法 `note` 前后空白自动 `trim` 后落库                                                                                                                                              | [settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts)                                                                |
| **成员、跨账与角色** | 非成员/不存在账本统一 `403 FORBIDDEN`；不存在或跨账本 `transferId` 返回 `404 TRANSFER_NOT_FOUND`；仅该笔收款人或非付款人创建者可发起，付款人本人（含同时为创建者）与无关第三方成员返回 `403 FORBIDDEN`                                                                                                                         | [settlement.test.ts](../apps/server/tests/settlement.test.ts)、[settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts) |
| **生命周期状态机**   | 仅 `ledger.status === 'SETTLING'` 且 `transfer.status === 'PENDING'` 允许新催还；`ACTIVE`、`SETTLED` 账本与已 `PAID` 转账发起新催还均返回 `409 LEDGER_STATE_INVALID`                                                                                                                                                           | [settlement.test.ts](../apps/server/tests/settlement.test.ts)、[settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts) |
| **6 小时冷却与并发** | 事务内通过 `SELECT ... FOR UPDATE` 锁账本行后查询 `operation_logs`（`action = 'TRANSFER_REMINDED'`）；同转账 6 小时内由收款人或创建者换新键重复催还（含并发竞态）仅放行 1 次、其余返回 `429 REMINDER_COOLDOWN`；同账本其他转账独立互不干扰                                                                                     | [settlement.test.ts](../apps/server/tests/settlement.test.ts)、[settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts) |
| **幂等作用域与重放** | 按 `(userId, operation, key)` 串行加锁与隔离；同键同体在冷却期内、转账 `PAID` 后及账本 `SETTLED` 后重放均返回首次 `200` 响应且不重复写提醒或审计；同键异体返回 `409 IDEMPOTENCY_CONFLICT`；不同用户复同键不重放；同用户跨转账复同键互不冲突                                                                                    | [settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts)                                                                |
| **A29 偏好静默联动** | 付款人关闭 `A29 notification_enabled` 时静默不写 `notifications` 行，`A33` 未读列表为空；响应仍返回相同 `200` 结构 `{ ledgerId, transferId, remindedAt, cooldownEndsAt }` 且同样记入 6 小时冷却，冷却期 `429` 错码与文案与开启状态完全一致，无侧信道泄露；冷却期满且重新开启 `A29` 后可正常入库并经 `A33`/`A34` 读取与标记已读 | [settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts)                                                                |

---

## 2. 财务守恒与零账务改动核对

基于“鼓山一日”四人基准账（消费总额 `30000` 分、净额 `+3000 / +6000 / -3000 / -6000`、最少 2 笔转账 `chenToAn = 3000`、`dingToBai = 6000`、待还总额 `9000` 分），在首次催还、同键并发/串行重放、429 冷却拒绝、跨转账独立催还、`A29` 静默催还、冷却过期二次催还、`A34` 标记已读以及 `SETTLED` 后重放/判冲前后分别采集完整快照，核对以下表与只读接口严格零变化：

- 数据库表：`ledgers`（`status`、`version`、`updated_at`）、`settlement_batches`、`settlement_transfers`、`expenses`、`expense_splits`。
- 只读查询接口：`A20 getBalances`、`A21 getStatistics`、`A24 getSettlement`（含 `progress` 与 `netSnapshot`）。

---

## 3. 本次实跑验证结果（四层分列，禁止跨层相加）

- **静态检查与构建**：`pnpm check`（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .`）与 `pnpm build:server` 全部通过。
- **无数据库测试（`pnpm test`）**：25 个测试文件、182 项用例全部通过（含 [settlement.test.ts](../apps/server/tests/settlement.test.ts) 5 项用例）。
- **真实 PostgreSQL 集成测试（显式 `TEST_DATABASE_URL`，临时 `postgres:17-alpine` 容器，用后已停止清理）**：`pnpm migrate:db` 后运行 `pnpm test:integration`，23 个测试文件、188 项用例全部通过（含 [settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts) 7 项完整集成场景）。
- **移动端与原生客户端状态**：本单未修改移动端源码、共享包、原生依赖或构建配置，未执行 `pnpm test:mobile`、JS 导出或原生客户端重装。

---

## 4. 审查与完成记录

- 负责人：叶银珍（@hisoka-morow527）；第二审查人：饶慧（@whisper-uoo）、李润君（@range-e）。
- 第二审查人书面批注由其本人在对应 PR 下留下，本文不代写；`B10`（6 点）待第二审查人书面批注与系统架构负责人终审合入后核销。
