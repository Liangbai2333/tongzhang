# Issue #109：B15 Day 2 消费改删与资料修改隔离库回归及四层测试记录

关联 [Issue #109](https://github.com/Liangbai2333/tongzhang/issues/109)，Refs #109。基于最新 `main`（`5890e16`，已含 `#104`、`#105`、`#106`、`#107`、`#111` 与并行 CI `#117`）补充 `A16`/`A17` 消费改删与 `A28`/`A29` 资料偏好修改的隔离 PostgreSQL 端到端回归断言，完成詹铖煜当日邀请加入边界四栏记录格式核对，并按四行禁加总规则记录 Beta Day 2 四层测试结果。

本单关联冲刺任务 `B15`（整项 8 点，计划 2026-11-20 完成）；今日推进隔离库回归与次日四层测试记录，**不重复估点，不提前扣减 `B15` 整项点数**。

## 四层测试结果（四行分列，禁止跨层相加）

被测代码提交为 `b6bec0e`（本文与原始输出由后续文档提交归档，不改动代码或测试逻辑）。四层独立执行、独立计数，**严禁跨层相加成一个总数**：

| 层                               | 命令 / 方式                                 | 提交 / 安装包状态                                     | 实际结果                                                                                                                                                                                       | 原始输出                                                                               |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. 无数据库                      | `pnpm test`                                 | `b6bec0e`                                             | 23 个文件、167 项测试全部通过（含 `deploy.test.mjs` 2 项）                                                                                                                                     | [layer1-pnpm-test.txt](evidence/issue109/layer1-pnpm-test.txt)                         |
| 2. 移动端组件                    | `pnpm test:mobile`                          | `b6bec0e`                                             | 24 个套件（iOS / Android 各 12）、266 项测试全部通过                                                                                                                                           | [layer2-pnpm-test-mobile.txt](evidence/issue109/layer2-pnpm-test-mobile.txt)           |
| 3. 隔离 `TEST_DATABASE_URL` 集成 | `TEST_DATABASE_URL=… pnpm test:integration` | `b6bec0e`                                             | 19 个文件、172 项测试全部通过；测试后 14 张核心表均残留 0 行                                                                                                                                   | [layer3-pnpm-test-integration.txt](evidence/issue109/layer3-pnpm-test-integration.txt) |
| 4. 原生客户端状态                | 本单未执行原生构建或安装                    | 未新构建；当日客户端核对复用 `9f45c5d` 开发客户端 APK | 本任务未修改移动端源码、原生依赖或配置，未重建 APK、不作本单原生实测结论；当日 [#110 / PR #118](https://github.com/Liangbai2333/tongzhang/pull/118) 在 JS 基线 `5890e16` 复用 `9f45c5d` 构建包 | —                                                                                      |

## 运行环境与跨用例零脏数据核对

- 工具链：macOS ARM64，Node.js `v24.21.0`（与 `.node-version` 及 `engines` `>=24 <25` 一致）、pnpm `12.6.0`、Docker `29.8.2`。
- 隔离数据库：一次性容器 `postgres:17-alpine`（PostgreSQL `17.11`，容器名 `tongzhang-issue109-pg`，映射 `127.0.0.1:55409`，库名 `tongzhang_test`），由 `vitest.integration.config.ts` 的 `migrate-database.ts` 执行迁移，未使用开发库或共享库。
- 稳定性与残留检查：[expense-profile-regression.integration.test.ts](../apps/server/tests/expense-profile-regression.integration.test.ts) 单独连续运行 5 次全部通过，随后跑完整套 19 个集成测试文件；结束后查询 `users`、`auth_sessions`、`auth_refresh_tokens`、`ledgers`、`ledger_members`、`invitations`、`image_assets`、`expenses`、`expense_splits`、`expense_images`、`settlement_batches`、`settlement_transfers`、`operation_logs`、`idempotency_keys` 共 14 张表均为 `0` 行（见 [residual-rows-after-integration.txt](evidence/issue109/residual-rows-after-integration.txt)），随后销毁临时容器。
- 脱敏处理：原始日志中的工作树绝对路径统一替换为 `<worktree>`，测试库口令脱敏为 `***`。

## 本次新增隔离库回归断言

在既有 `#86`、`#87`、`#90`、`#105`、`#106`、`#107` 测试基础上，[expense-profile-regression.integration.test.ts](../apps/server/tests/expense-profile-regression.integration.test.ts) 补齐跨模块端到端闭环共 4 项回归：

| 用例                                                       | 覆盖边界与关键断言                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 顺序过期版本冲突与 `A14` 筛选/游标及全读取视图同步      | `A16` 将消费改为 `AMOUNT` 精确分摊（`10001 = 2501 + 2500 × 3`）并变更类别、发生日与付款人后，顺序携带旧版本请求 `A16`、`A17` 与 `A23` 均确定性返回 `409 VERSION_CONFLICT`；验证 `A14` 旧筛选条件清空、新筛选命中、`limit + cursor` 键集分页跳过软删除记录、`A15` 按创建者/原记录人/付款人/旁观者区分 `canEdit`，且 `A06`/`A07`/`A08`/`A20`/`A21` 总额与净额逐分守恒                                                                                                                    |
| 2. 真实结算流转冻结拦截与冻结后 `A28`/`A29` 修改查询一致性 | 通过 `A16` 修正与 `A17` 软删除恢复“鼓山一日”四人 `30000` 分基准账，经真实 HTTP `A22 → A23（SETTLING）→ A25 × 2 → A26（SETTLED）→ A27（个人归档）` 全链路验证：`SETTLING` 与 `SETTLED` 下无论携带最新或旧 `version` 调用 `A16`/`A17` 均先被冻结守卫拦截为 `409 LEDGER_FROZEN`（零幂等键残留、`A15.canEdit = false`）；同时 `A28` 改名与 `A29` 通知偏好修改保持可用，新用户名实时同步至 `A04`/`A07`/`A08`/`A15`/`A20`/`A21`，且不改变 `ledgers.version`、结算快照与归档成员 `0` 剩余净额 |
| 3. `A23` 正式冻结与 `A16` 编辑在账本行锁上的真实并发竞争   | 复用 `raceExpenseWrites` 持有 `ledgers FOR UPDATE` 直至 `A23 startSettlement` 与 `A16 updateExpense` 同时排队后释放：冻结先胜则编辑返 `409 LEDGER_FROZEN` 且总额定格 `12000` 分；编辑先胜则冻结返 `409 VERSION_CONFLICT`、无结算批次产生且总额更新为 `16000` 分                                                                                                                                                                                                                        |
| 4. 同用户 `A28` 与 `A29` 在 `users FOR UPDATE` 行锁并发    | 持有 `users FOR UPDATE` 让同一账号的 `PATCH /me` 与 `PATCH /me/preferences` 真实并发排队后释放，验证两者在用户行锁下串行落库互不覆盖（`A04` 同时保留新用户名与 `notificationEnabled: false`），`operation_logs` 完整记录 `PROFILE_UPDATED` 与 `PREFERENCES_UPDATED`                                                                                                                                                                                                                    |

## 詹铖煜邀请加入边界四栏记录核对

已对詹铖煜提交的 [#110 / PR #118](https://github.com/Liangbai2333/tongzhang/pull/118)（`docs/issue110-beta-invite-boundaries.md`，提交 `a9ad67e`）逐项核查并留下书面格式核对意见：

- 核对结论：**四栏格式合规**。5 条记录（`A09`/`A10` 展示复制与重置作废、客户端格式错误拦截、服务端无效码/旧码 `400 INVITE_INVALID`、有效码预览加入 `A11`/`A12`、已加入成员重复预览与重复提交兜底）均齐全「版本、环境、步骤、结果」四栏要素；11 张运行截图、`runtime-checks.txt` 与 5 份导出/依赖基线日志文件名均有效，且正文明确区分“Beta Day 2 当天核对”与 Day 4 扫码 Prebuild 后的中期干净环境独立安装正式验收（`B12`）。
- 书面核对批注链接：[PR #118 评论](https://github.com/Liangbai2333/tongzhang/pull/118#issuecomment-6979150459)。

## 待完成（需人工）

- 第二审查人饶慧（`@whisper-uoo`）的具体书面审查批注待其本人在本单 PR 下补充，本文与 PR 不代写。
