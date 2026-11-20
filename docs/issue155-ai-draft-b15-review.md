# Issue #155 复核记录：记账页 AI 草稿前后端契约与消费改删隔离库回归

- **关联任务**：`#155`（配合闭环 `B13` 与 `B15`，不重复估点）
- **复核对象**：[PR #161](https://github.com/Liangbai2333/tongzhang/pull/161)（`B13` 移动端接入，合入基线 `3b844b6`）、[PR #162](https://github.com/Liangbai2333/tongzhang/pull/162)（`B15` 第五日回归，合入基线 `b1cfad3`）
- **复核人 / 模块归属**：饶慧（`@whisper-uoo`，`expenses` 与 `A31` 后端模块作者）
- **复核分支与提交**：`test/155-ai-draft-b15-review`（基于 `origin/main` `b1cfad3`，补充修复与回归提交 `3df54bd`）

---

## 一、`B13` 记账页 `A31 → ExpenseForm → A13` 前后端契约复核

- **PR #161 书面审查批注**：[PR #161 Review Comment](https://github.com/Liangbai2333/tongzhang/pull/161#issuecomment-7043349037)

### 1.1 逐项契约核对结论

| 核对维度                           | 核验路径与关键证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 结论       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 入口范围与状态边界                 | [CreateExpenseScreen.tsx](../apps/mobile/src/features/expenses/screens/CreateExpenseScreen.tsx)、[ExpenseForm.tsx](../apps/mobile/src/features/expenses/components/ExpenseForm.tsx)、[AiDraftSheet.tsx](../apps/mobile/src/features/expenses/components/AiDraftSheet.tsx) 仅在 `ACTIVE` 新增消费页挂载内嵌面板（编辑态隐藏、`write.uncertain` 时禁用），不新建全屏路由                                                                                                                   | 通过       |
| 一句话文本与未绑定收据解析         | 前端通过 [parseExpenseDraftBodySchema](../packages/contracts/src/expenses.ts) 校验 trim 后 1–500 字文本或已选 `RECEIPT` 图片；`A18` 在 [images/service.ts](../apps/server/src/modules/images/service.ts) 仅校验成员与 `ACTIVE` 预检，`ledger_id` 保持 `NULL`；`A31` 在 [expenses/service.ts](../apps/server/src/modules/expenses/service.ts) 与 [images/binding.ts](../apps/server/src/modules/images/binding.ts) 于 `repeatable read` 只读事务校验成员、`ACTIVE` 及本人未绑定 `RECEIPT` | 通过       |
| `null` 字段保留与 `warnings` 展示  | [applyExpenseDraftToForm](../apps/mobile/src/features/expenses/ai-draft.ts) 对 `title`、`amountCents`、`occurredOn`、`payerMemberId`、`note`、`receiptImageId` 为 `null` 时保留当前表单输入；非成员付款人/分摊成员安全过滤并追加中文告警；[ExpenseForm.tsx](../apps/mobile/src/features/expenses/components/ExpenseForm.tsx) 全量展示 `warnings`                                                                                                                                         | 通过       |
| 整数分守恒与收据单次上传复用       | 草稿 `amountCents` 与 `AMOUNT` 分摊经 [money.ts](../packages/domain/src/money.ts) 的 `formatYuan(BigInt(...))` 转换回填，全程无浮点；[use-receipt.ts](../apps/mobile/src/features/images/use-receipt.ts) 在 AI 解析上传后缓存 `imageId`，用户手动点击「保存消费」走 `A13` 幂等提交时不重复上传                                                                                                                                                                                           | 通过       |
| 零直写库与人工确认提交             | [expenses/service.ts](../apps/server/src/modules/expenses/service.ts) 中 `A31` 事务为 `read only`；[AiDraftSheet.tsx](../apps/mobile/src/features/expenses/components/AiDraftSheet.tsx) 仅回调 `onApplyDraft` 回填可编辑表单，绝不自动调用 `A13 createExpense`                                                                                                                                                                                                                           | 通过       |
| `502/503/409` 受控降级与禁自动重试 | `503 AI_DRAFT_UNAVAILABLE`、`502 AI_DRAFT_UPSTREAM_ERROR`、`409 LEDGER_FROZEN`、`400 IMAGE_INVALID` / `VALIDATION_ERROR`、`403 FORBIDDEN`、`401 UNAUTHENTICATED`、`REQUEST_TIMEOUT` / `NETWORK_ERROR` / 断网均保留当前输入且 `autoRetry: false`                                                                                                                                                                                                                                          | 修复后通过 |
| `AI_DRAFT_*` 凭据服务端隔离        | 全仓检索确认 `AI_DRAFT_API_BASE_URL`、`AI_DRAFT_API_KEY`、`AI_DRAFT_MODEL`、`AI_DRAFT_TIMEOUT_MS` 仅存在于 [env.ts](../apps/server/src/config/env.ts)、[app.ts](../apps/server/src/app.ts)、[infra/compose.prod.yml](../infra/compose.prod.yml) 与服务端 `.env` 示例，移动端、[/api/v1/system/info](../apps/server/src/http/system.ts) 及错误信息零泄露                                                                                                                                  | 通过       |

### 1.2 复核发现与本单补充收口（提交 `3df54bd`）

1. **修复断网错误码映射缺口**：[http.ts](../apps/mobile/src/lib/http.ts) 在联网检测失败时抛出 `NETWORK_UNAVAILABLE`，此前 [ai-draft.ts](../apps/mobile/src/features/expenses/ai-draft.ts) 的 `aiDraftErrorFeedback` 未显式命中该错误码而落入 `unknown` 分支。已在 [ai-draft.ts](../apps/mobile/src/features/expenses/ai-draft.ts) 将 `NETWORK_UNAVAILABLE` 归入 `'network'` 分支，并在 [ai-draft-reminder-prep.test.tsx](../apps/mobile/tests/ai-draft-reminder-prep.test.tsx) 补齐断言。
2. **对齐客户端 `A31` 请求超时阈值**：服务端 `AI_DRAFT_TIMEOUT_MS` 默认 `15000ms`（上限 `60000ms`），而 [http.ts](../apps/mobile/src/lib/http.ts) 通用 JSON 请求默认 `10000ms`，多模态收据解析存在客户端先于服务端中止的风险。已在 [api.ts](../apps/mobile/src/lib/api.ts) 为 `CallOptions` 增加可选 `timeoutMs`（仅在显式传入时透传给 `requestJson`），并在 [expenses/api.ts](../apps/mobile/src/features/expenses/api.ts) 为 `parseExpenseDraft` 设置 `30000ms`（与 [images/api.ts](../apps/mobile/src/features/images/api.ts) 一致），同时在 [images-api.test.tsx](../apps/mobile/tests/images-api.test.tsx) 补充回归断言。
3. **补齐移动端组件关键路径覆盖**：在 [ai-draft-reminder-ui.test.tsx](../apps/mobile/tests/ai-draft-reminder-ui.test.tsx) 新增 3 项双端（iOS / Android）组件测试，分别覆盖「已选收据单次上传复用 `A31 AMOUNT` 草稿（含 `'0'` 分）回填并手动提交 `A13`」「草稿 `null` 字段保留手工输入并展示 `warnings`」「编辑态 `ExpenseForm` 隐藏 `AI 辅助填写` 入口」。
4. **交由 `#160` 跟进的非阻塞文档观察项**：[api-reference.md](./api-reference.md) 第 53 行 `A31` 描述仍残留「页面入口待 B13 开放」，本单不改公共手册以免与 `#160` 冲突，已在 PR #161 批注与本记录交接同步。

---

## 二、`B15` 消费改删（`A16`/`A17`）隔离库回归断言审查

- **PR #162 书面审查批注**：[PR #162 Review Comment](https://github.com/Liangbai2333/tongzhang/pull/162#issuecomment-7043350965)

### 2.1 自动化回归断言审查矩阵

逐行核验 [expense-concurrency.integration.test.ts](../apps/server/tests/expense-concurrency.integration.test.ts)、[expense-profile-regression.integration.test.ts](../apps/server/tests/expense-profile-regression.integration.test.ts) 与 [b15-gushan-closure.integration.test.ts](../apps/server/tests/b15-gushan-closure.integration.test.ts)（并对照核心实现 [expenses/service.ts](../apps/server/src/modules/expenses/service.ts)、[expenses/repository.ts](../apps/server/src/modules/expenses/repository.ts) 与基础回归 [expenses.integration.test.ts](../apps/server/tests/expenses.integration.test.ts)），**确认未通过放宽断言掩盖缺陷**：

| 审查主题                           | 核验文件与关键断言                                                                                                                                                                                                                                                                                                                                       | 审查结论       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 版本冲突（`409 VERSION_CONFLICT`） | `expense-profile-regression` 验证顺序过期 `A16`/`A17`/`A23` 均返回 `409 VERSION_CONFLICT` 且版本保持不变；`expense-concurrency` 基于 `ledgers FOR UPDATE` 门闸真实并发竞态，精确校验 `A16` vs `A16`（`200` + `409 VERSION_CONFLICT`）与 `A16` vs `A17`（胜负双分支 `VERSION_CONFLICT` / `NOT_FOUND`、有效总额及软删除保留分摊）                          | 严格准确       |
| 同键重放与异体冲突                 | `b15-gushan-closure` 校验 `A16`/`A17` 同 `Idempotency-Key` 重放返回与首次完全相等（`toEqual`）的 `200` 且不递增双版本（含 `SETTLING` 后重放）；同键改标题/金额/付款人或改删除版本号严格返回 `409 IDEMPOTENCY_CONFLICT` 且底层行未改动                                                                                                                    | 严格准确       |
| `SETTLING` / `SETTLED` 冻结拦截    | `expense-profile-regression` 与 `b15-gushan-closure` 经真实 `A23` 冻结与 `A26` 结清后，携带当前/过期版本发起新键 `A16`/`A17` 均严格返回 `409 LEDGER_FROZEN`，且拒绝请求零写入 `idempotency_keys`                                                                                                                                                         | 严格准确       |
| 鼓山四人 `30000` 分守恒与过滤      | `b15-gushan-closure` 校验 `A16` 改额与 `A17` 软删除后，`A21` 排除软删除项、分类占比 `40.0 / 40.0 / 20.0`、成员合计 `30000n / 30000n / 0n`、`A22` 只读 2 笔 `9000` 分、`A26` 结清全员 `remainingNetCents === '0'` 且 `A27` 归档不改快照                                                                                                                   | 严格准确       |
| 收据同事务换绑隔离库回归           | **缺口补充**：此前三份 `B15` 回归文件未覆盖 `A16` 收据换绑在幂等重放/冲突、并发版本竞态与 `SETTLING` 冻结下的原子性（原仅在 `expenses.integration.test.ts` 覆盖顺序换绑与注入失败回滚）。已在 `b15-gushan-closure` 新增 `covers A16 same-tx receipt rebinding across idempotency replay/conflict, concurrent version race, and SETTLING freeze` 用例补齐 | 补充后完整闭环 |

---

## 三、四层验证结果（提交 `3df54bd`，按层分列、禁止跨层相加）

- **静态检查与格式化**：`pnpm check`（`build:shared` + `typecheck` + `eslint . --max-warnings=0` + `prettier --check .`）全部通过。
- **移动端导出与诊断**：`pnpm export:mobile`（Android 1986 模块 / iOS 1828 模块 JS Bundle 导出，仅校验 JS 打包，不等同于原生安装验收）与 `pnpm doctor:mobile`（`21/21` 项通过）全部通过。
- **第 1 层（无数据库测试 `pnpm test`）**：`3df54bd` — **26 个测试文件、194 项测试全部通过**。
- **第 2 层（移动端组件测试 `pnpm test:mobile`）**：`3df54bd` — **34 个套件（iOS / Android 各 17）、358 项测试全部通过**（含本次新增双端 8 项回归）。
- **第 3 层（隔离 `TEST_DATABASE_URL` 集成测试 `pnpm test:integration`）**：`3df54bd` — 在临时 `postgres:17-alpine` PostgreSQL 17 容器（执行 `pnpm migrate:db`）上跑通 **25 个测试文件、198 项测试全部通过**（含 `b15-gushan-closure.integration.test.ts` 新增收据换绑原子性用例）；运行前后 15 张核心公共表（`auth_refresh_tokens`、`auth_sessions`、`expense_images`、`expense_splits`、`expenses`、`idempotency_keys`、`image_assets`、`invitations`、`ledger_members`、`ledgers`、`notifications`、`operation_logs`、`settlement_batches`、`settlement_transfers`、`users`）均核验为 **`0` 行残留**，测试完成后临时容器已销毁。
- **第 4 层（原生客户端状态）**：本单未新增原生依赖或修改原生配置，未在本地重新编译或安装原生客户端（最近一次主线开发端原生安装基线见 [issue159-day5-test-results.md](./issue159-day5-test-results.md)）。
