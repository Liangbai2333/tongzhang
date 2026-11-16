# Issue #90：B15 Day 1 四层测试基线

关联 [Issue #90](https://github.com/Liangbai2333/tongzhang/issues/90)，Refs #90。2026-11-16 完成 B15 Day 1 的代码部分：Beta 契约反例单测、隔离 PostgreSQL 改删并发夹具，以及本文的四层基线。依赖尚未合并的 [PR #96](https://github.com/Liangbai2333/tongzhang/pull/96)（`dailyTrendTruncated`、去掉 `SETTLEMENT_STARTED` 与催还结果的 `delivered`），分支从其提交 `4ac13ef` 切出。

## 四层结果

四层分别运行、分别计数，**不跨层相加**。被测提交均为 `3b1f65c`（本文与证据由后续文档提交加入，不改代码）。

| 层                    | 命令                                        | 提交      | 实际结果                                       | 原始输出                                                                              |
| --------------------- | ------------------------------------------- | --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. 无数据库           | `pnpm test`                                 | `3b1f65c` | 22 个文件、157 项测试全部通过                  | [layer1-pnpm-test.txt](evidence/issue90/layer1-pnpm-test.txt)                         |
| 2. 移动端组件         | `pnpm test:mobile`                          | `3b1f65c` | 24 个套件（iOS/Android 各 12）、258 项通过     | [layer2-pnpm-test-mobile.txt](evidence/issue90/layer2-pnpm-test-mobile.txt)           |
| 3. 隔离 PostgreSQL    | `TEST_DATABASE_URL=… pnpm test:integration` | `3b1f65c` | 17 个文件、152 项测试全部通过                  | [layer3-pnpm-test-integration.txt](evidence/issue90/layer3-pnpm-test-integration.txt) |
| 4. 原生开发客户端/APK | 未执行                                      | —         | **本任务没有重建任何原生客户端，也未真机安装** | —                                                                                     |

补充：`pnpm export:mobile` 在 `3b1f65c` 上导出成功（[extra-pnpm-export-mobile.txt](evidence/issue90/extra-pnpm-export-mobile.txt)），只证明 JS 可打包，不等同于原生编译或安装。`pnpm check` 同提交通过。

## 运行环境

- 本机 Node.js v26.13.0（仓库 `engines` 声明 `>=24 <25`，本次未切换版本，如需严格复核请用 Node 24 重跑）、pnpm 12.6.0。
- 第 3 层使用一次性容器 `postgres:17-alpine`（PostgreSQL 17.11），库名 `tongzhang_test`，映射到本机 `55442`；迁移由既有 global setup 执行。没有使用开发库或共享库。
- 测试结束后核对 `users`、`ledgers`、`expenses`、`expense_splits`、`operation_logs`、`idempotency_keys` 均为 0 行（[residual-rows-after-integration.txt](evidence/issue90/residual-rows-after-integration.txt)），随后停止并删除容器。
- 原始输出中的本机路径已替换为 `<worktree>`，连接串密码以 `***` 表示。

## 本次新增

### 契约反例（第 1 层）

[beta-negative.test.ts](../packages/contracts/tests/beta-negative.test.ts) 新增 21 项，只补 [business.test.ts](../packages/contracts/tests/business.test.ts) 尚未覆盖的反例：

| 契约                                  | 新增反例                                                                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A21 `statisticsSchema`                | 所有金额字段的小数、负数、`-0`、前导零、科学计数、空白、非数字及数字类型；笔数/百分比格式；类别、排行、按日趋势超限；逐字段缺失；截断标记非布尔、截断后笔数超出、空账截断；重复类别/日期/排行/成员；排行超笔数或超总额；已付合计不守恒 |
| A31 `parseExpenseDraftBodySchema`     | 文本超 500 字、非字符串、空串、只给参考日期、非法 UUID/日期、额外字段                                                                                                                                                                  |
| A31 `expenseDraftSchema`              | 非法金额、`0` 分、标题/类别/日期/付款人格式；严格对象缺字段或多字段；提示条数/空白/超长；重复成员、超 12 人、份数非法、按金额缺总额、分摊金额非法                                                                                      |
| A32 `remindTransferBodySchema` / 结果 | 备注超 120 字、空串、`null`、非字符串、多字段；结果缺字段、无时区时间、带时区冷却时间早于催还；服务端多发 `delivered` 时解析结果不含该字段                                                                                             |
| A33/A34 通知列表、通知项、已读结果    | `unreadOnly` 只接受 `true`/`false` 字符串；分页上下限与游标长度；金额、类型大小写、账本名、备注、时间格式、逐字段缺失；已读结果 `readAt` 为空或缺失                                                                                    |
| 邀请二维码                            | `0/1/I/O` 与小写逐个拒绝；前缀大小写、版本 `v0/v10`、分隔符、尾随换行和查询串；长度 4/8；空串、`undefined`、数字、布尔、对象、数组                                                                                                     |

### 隔离 PostgreSQL 夹具（第 3 层）

[fixtures/expenses.ts](../apps/server/tests/fixtures/expenses.ts) 沿用 `integrationFixture()` 与 `waitForBlockedQueries()`，供后续 B15 回归复用：

- `seedMultiMemberLedger()`：通过真实注册接口得到带令牌的成员并建账（默认“鼓山一日”四人）；`seedGushanExpenses()` 按规范录入 12000/12000/6000 三笔。
- `createExpense()`、`expenseBody()`、`updateExpenseRequest()`、`deleteExpenseRequest()`：真实 A15/A16/A17 HTTP 请求。
- `raceExpenseWrites()`：先持有账本行锁，确认全部请求都已阻塞在该锁上再释放，使改删真正并发，不依赖 sleep。
- `readSoftDeletedExpenses()`、`readExpenseRow()`：直接读取已软删除的行及其分摊。

[expense-concurrency.integration.test.ts](../apps/server/tests/expense-concurrency.integration.test.ts) 新增 3 项：

1. 同一消费并发编辑与删除（均带版本 1）：恰好一个 200，账本版本只加 1。编辑先提交时删除为 `409 VERSION_CONFLICT`；删除先提交时编辑为 `404 NOT_FOUND`（已软删除的消费对 A16 不可见，与现有 A17 测试一致），软删除行与分摊保留。
2. 同一消费两次并发编辑：一个 200、一个 `409 VERSION_CONFLICT`，最终金额与胜者一致。
3. 不同消费并发删除与编辑：均成功，账本版本加 2，有效消费恢复为 30000 分，误记行以软删除保留且分摊合计 5000 分。

第 1 项的胜者由数据库调度决定，两种结果都有断言；如需固定得到 `409` 的路径，可在后续任务中按顺序先编辑再删除。

## 未完成（需人工）

- 詹铖煜四栏测试记录的书面格式核对，以及相邻职责第二审查人的书面意见，留给李润君和审查人完成；本文不代为填写。
- 原生开发客户端与独立 APK 未重建、未安装，第 4 层不作通过结论。
