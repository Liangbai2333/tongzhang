# Issue #122 站内提醒表迁移、A33/A34 服务推进及 Beta Day 3 站会决策记录

日期：2026-11-18（Beta 冲刺 Day 3）  
关联任务：[Issue #122](https://github.com/Liangbai2333/tongzhang/issues/122)（关联冲刺任务 `B11`，整项 8 点，计划 2026-11-19 完成；今日推进 `notifications` 表 Schema 与 SQL 迁移、`A33` 提醒分页列表与 `A34` 仅本人标记已读服务实现，以及 `A29` 通知偏好联动口径，并主持记录 Day 3 站会，不重复估点、不提前扣减 `B11` 整项点数）。

---

## 1. Beta Day 3（2026-11-18）站立会四格决策记录

本次站立会由组长许雅欣主持，围绕 Day 3 当日完成口径、移动端新入口与原生重建衔接、以及 Day 4 后端新能力（`B09` AI 解析、`B10` 催还校验、`B11` 站内提醒）前置推进形成四格决策记录；本日无新增已否决项，既有 `X01～X06` 维持 `0` 点：

| 议题                                                     | 放弃的做法                                                                        | 采用的做法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 确认人                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Day 3 完成口径与燃尽核销                              | 无。不按推进进度提前拆分扣点，也不把当天核对写成正式验收                          | Day 3 仅在 `B06`（[#124](https://github.com/Liangbai2333/tongzhang/issues/124)，8 点）、`B07` 与 `B08`（[#121](https://github.com/Liangbai2333/tongzhang/issues/121)，6+6 点）整项核对通过并经第二审查人书面批注与双关口确认后核销，计划合计 `20` 点；[#122](https://github.com/Liangbai2333/tongzhang/issues/122)（`B11`）、[#123](https://github.com/Liangbai2333/tongzhang/issues/123)（`B09`）、[#126](https://github.com/Liangbai2333/tongzhang/issues/126)（`B15/B17`）、[#127](https://github.com/Liangbai2333/tongzhang/issues/127)（`B12`）、[#128](https://github.com/Liangbai2333/tongzhang/issues/128)（`B16`）今日只推进不预扣点 | 许雅欣、饶恩哲、饶慧、叶银珍、李润君、陈林祺、袁湘湘、詹铖煜 |
| 2. 站内提醒表结构、迁移与 `A29` 偏好口径                 | 放弃仅靠单列外键关联 `transfer_id` 或在 `A29` 关闭后隐藏/删除已落库历史提醒的做法 | `notifications` 表采用 `(ledger_id, transfer_id)` 复合外键（`ON DELETE RESTRICT`）指向 `settlement_transfers(ledger_id, id)` 防止跨账本串改；人工审查生成的 `0001_add_notifications.sql` 并将唯一约束调整到复合外键之前；`profile` 模块公开导出 `deliverSettlementReminderNotification`，当接收人 `notification_enabled = false` 时静默不落未读记录，已落库历史提醒仍对本人可读可标已读；`A34` 跨用户返回 `403 FORBIDDEN`，不存在返回 `404 NOT_FOUND`                                                                                                                                                                                         | 许雅欣、叶银珍、李润君、饶恩哲                               |
| 3. 移动端新入口、扫码 Prebuild 与 Day 4 中期独立安装衔接 | 无。不拿旧开发包或 JS 导出替代扫码 Prebuild 后的原生重建结果                      | `#121` 完成消费改删、资料与偏好、SVG 统计图及相机扫码原生配置与 Prebuild；`#125` 围绕新入口执行当天核对并留存提交号；`#127` 预先核对扫码 Prebuild 后的第一屏构建说明，为 Day 4 干净环境第一次正式验收（`B12`）扫清障碍；`#128` 随新入口合入同步手册与已知限制                                                                                                                                                                                                                                                                                                                                                                                 | 饶恩哲、陈林祺、詹铖煜、袁湘湘                               |

### 1.1 当日完成口径

1. **双关口核销**：本单（#122）为 `B11`（8 点，计划 Day 4 完成）的前置推进，本单不提前核销 `B11` 点数；第二审查人（叶银珍、李润君）的**书面批注由其本人在对应 PR 下留下，本文不代写**。
2. **燃尽三行附注**：Day 3 必做剩余点数按 Day 2 末基线 `114` 点起算（`B06`、`B07`、`B08` 合计 20 点待各自闭环确认后核销，本单不扣减 `B11`）；明确不做与已否决为 `X01～X06`（`0` 点）；当天新发现缺陷数 `0`。
3. **用词**：Day 3 日常检查统称“当天核对”，正式“验收”保留用于 Day 4 中期干净环境独立安装（`B12`）与 Day 7 最终候选交付（`B21`）。

---

## 2. `notifications` 表 Schema 与 Drizzle SQL 迁移审查

在 [tables.ts](../apps/server/src/db/schema/tables.ts) 新增 `notifications` 表并在 `settlement_transfers` 补充 `uq_settlement_transfers_ledger_id_id(ledger_id, id)` 唯一约束，通过 `pnpm generate:db --name add_notifications` 生成 [0001_add_notifications.sql](../apps/server/drizzle/0001_add_notifications.sql) 并完成人工审查：

1. **列与非空约束**：`id`（UUID PK）、`recipient_user_id`（NOT NULL）、`actor_user_id`（NOT NULL）、`type`（`varchar(32)` NOT NULL）、`ledger_id`（NOT NULL）、`transfer_id`（NOT NULL）、`amount_cents`（`bigint` NOT NULL）、`note`（`varchar(120)` 可空）、`read_at`（`timestamptz` 可空）、`created_at`（`timestamptz` NOT NULL 默认 `now()`）；整库由 14 表 112 列演进为 15 表 122 列。
2. **外键与检查约束**：
   - 四个外键均采用 `ON DELETE RESTRICT ON UPDATE RESTRICT`：`recipient_user_id -> users(id)`、`actor_user_id -> users(id)`、`ledger_id -> ledgers(id)`、复合外键 `(ledger_id, transfer_id) -> settlement_transfers(ledger_id, id)`。
   - 五项 `CHECK`：`ck_notifications_type`（仅 `'SETTLEMENT_REMINDER'`）、`ck_notifications_parties`（`recipient_user_id <> actor_user_id`）、`ck_notifications_amount`（`amount_cents > 0`）、`ck_notifications_note`（空或去空白后 1–120 字符）、`ck_notifications_read_at`（`read_at IS NULL OR read_at >= created_at`）。
3. **索引设计**：
   - `ix_notifications_recipient_time(recipient_user_id, created_at DESC, id DESC)` 覆盖 `A33` 全量分页查询；
   - `ix_notifications_recipient_unread(recipient_user_id, created_at DESC, id DESC) WHERE read_at IS NULL` 覆盖 `unreadOnly=true` 筛选分页；
   - `ix_notifications_transfer_time(ledger_id, transfer_id, created_at DESC)` 覆盖按转账维度的催还审计与查询。
4. **人工审查修正**：`drizzle-kit generate` 初始将 `ALTER TABLE "settlement_transfers" ADD CONSTRAINT "uq_settlement_transfers_ledger_id_id" UNIQUE("ledger_id","id")` 排在 `fk_notifications_ledger_id_transfer_id` 之后；审查时已调整至外键创建之前，并在空库 `tongzhang_empty` 与隔离测试库 `tongzhang_test` 均验证首次及重复迁移通过。

---

## 3. `A33` / `A34` 实现与 `A29` 偏好口径对齐核对

实现位于 [profile/repository.ts](../apps/server/src/modules/profile/repository.ts)、[profile/service.ts](../apps/server/src/modules/profile/service.ts)、[profile/mapper.ts](../apps/server/src/modules/profile/mapper.ts) 与公开出口 [profile/index.ts](../apps/server/src/modules/profile/index.ts)，覆盖测试见 [profile.test.ts](../apps/server/tests/profile.test.ts) 与 [notifications.integration.test.ts](../apps/server/tests/notifications.integration.test.ts)：

| 审查维度                         | 实现与验证结论                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **认证与协议边界**               | `A33`、`A34` 均强制 `app.authenticate`，匿名、格式错误及已登出令牌返回 `401 UNAUTHENTICATED`；`A34` 禁止请求体（传 `{}` 返回 `400 VALIDATION_ERROR`）；两接口已彻底移除 `notReady` 占位                                                                                         |
| **本人隔离与 `unreadOnly` 分页** | `A33` 仅按 `recipient_user_id = principal.userId` 在只读 `REPEATABLE READ` 事务内查询，支持 `unreadOnly=true/false` 与 `(created_at DESC, id DESC)` 游标分页（含同毫秒/同秒并列排序）；实时关联 `ledgers.name` 与 `users.username`，发起人经 `A28` 改名后立即反映且不改原提醒行 |
| **仅接收人标记已读**             | `A34` 在事务内 `SELECT ... FOR UPDATE` 锁定提醒行：不存在返回 `404 NOT_FOUND`，非接收人（含催还发起人与无关用户）返回 `403 FORBIDDEN`；首次标记写入 `read_at` 并同事务写 `NOTIFICATION_READ` 操作审计，重复调用保留首次 `read_at` 不覆盖                                        |
| **`A29` 偏好口径对齐**           | `profile` 公开导出 `deliverSettlementReminderNotification(tx, input)` 供 `settlements`（`B10`）跨模块调用：接收人关闭 `notification_enabled` 时静默返回 `{ delivered: false, notificationId: null }` 不写未读提醒；此前已落库提醒仍对本人可见且可标记已读，重新开启后恢复写入   |
| **金额与文档同步**               | `amount_cents` 使用 PostgreSQL `BIGINT` 与 TypeScript `bigint`，响应转为十进制整数分字符串，不涉及消费/结算表改写；同 PR 同步更新 [api-reference.md](api-reference.md) 与 [known-limitations.md](known-limitations.md)                                                          |

---

## 4. 当天核对验证结果（四层分列）

本轮在 macOS 本机及临时 `postgres:17-alpine` 容器（空库 `tongzhang_empty` 与隔离测试库 `tongzhang_test`，完成后清理容器）上执行，各层分列如下，**不跨层相加**：

- **静态检查与服务端编译**：`pnpm check`（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .`）全部通过；`pnpm build:server` 通过。
- **空库与隔离库迁移**：对全新空库 `tongzhang_empty` 连续执行两次 `pnpm migrate:db` 均通过，`\d notifications` 确认 10 列、4 外键、5 检查约束、3 二级索引完整；对隔离测试库 `tongzhang_test` 执行 `pnpm migrate:db` 通过。
- **无数据库测试（`pnpm test`）**：23 个测试文件、169 项用例全部通过（含 [profile.test.ts](../apps/server/tests/profile.test.ts) 新增的 `A33`/`A34` 未鉴权拦截、DTO 严格映射与非法游标校验）。
- **移动端组件测试（`pnpm test:mobile`）**：本单未修改移动端源码，未运行该层。
- **真实 PostgreSQL 集成测试（显式 `TEST_DATABASE_URL`）**：`pnpm test:integration` 共 20 个测试文件、176 项用例全部通过，其中 [schema.integration.test.ts](../apps/server/tests/schema.integration.test.ts) 验证 15 表 122 列及二次迁移幂等，[notifications.integration.test.ts](../apps/server/tests/notifications.integration.test.ts) 4 项用例覆盖表约束与复合外键、`A33` 隔离分页与改名联动、`A34` 仅本人已读与跨用户拒绝、`A29` 偏好静默联动。
- **原生客户端状态**：本单仅修改服务端数据库迁移、业务服务、测试与文档，未修改移动端代码、原生依赖或构建配置，未新构建也未新装客户端。

---

## 5. 完成记录

- 负责人：许雅欣（@XYX-v）；第二审查人：叶银珍（@hisoka-morow527）、李润君（@range-e）。
- 站会四格决策记录：见第 1 节。
- 第二审查人书面批注：**待叶银珍、李润君本人在对应 PR 下留下**；`B11` 整项点数待 Day 4 联调收口后按双关口规则核销。
- PR 链接：提交 PR 后补充。
