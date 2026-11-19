# Issue #126：B15/B17 Day 3 移动端新增交互回归、AI 替身与站内提醒夹具及四层测试记录

关联 [Issue #126](https://github.com/Liangbai2333/tongzhang/issues/126)，Refs #126。基于最新 `main`（`9d3be6a`，已含 `#121`、`#122`、`#123`、`#124`、`#127` 与 `#128`）补充消费编辑/软删除、个人中心资料与偏好修改、多维统计图表及扫码拒权回退的移动端组件回归断言，搭建 `A31` AI 草稿解析确定性替身（Test Double）与站内提醒隔离库测试夹具并验证零残留，完成詹铖煜当日扫码 Prebuild 四栏预检记录格式核对，并按四行禁加总规则记录 Beta Day 3 四层测试结果。

本单关联冲刺任务 `B15`（整项 8 点，计划 2026-11-20 完成）与 `B17`（整项 6 点，计划 2026-11-21 完成）；今日推进新增交互回归、替身夹具与第三日四层测试记录，**不重复估点，不提前扣减 `B15`/`B17` 整项点数**。

## 四层测试结果（四行分列，禁止跨层相加）

被测代码提交为 `33d9a3a`（本文与原始输出由后续文档提交归档，不改动代码或测试逻辑）。四层独立执行、独立计数，**严禁跨层相加成一个总数**：

| 层                               | 命令 / 方式                                 | 提交 / 安装包状态                                            | 实际结果                                                                                                                                                                                  | 原始输出                                                                               |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. 无数据库                      | `pnpm test`                                 | `33d9a3a`                                                    | 25 个文件、182 项测试全部通过（含 `ai-draft-double.test.ts` 3 项与 `deploy.test.mjs` 2 项）                                                                                               | [layer1-pnpm-test.txt](evidence/issue126/layer1-pnpm-test.txt)                         |
| 2. 移动端组件                    | `pnpm test:mobile`                          | `33d9a3a`                                                    | 26 个套件（iOS / Android 各 13）、302 项测试全部通过                                                                                                                                      | [layer2-pnpm-test-mobile.txt](evidence/issue126/layer2-pnpm-test-mobile.txt)           |
| 3. 隔离 `TEST_DATABASE_URL` 集成 | `TEST_DATABASE_URL=… pnpm test:integration` | `33d9a3a`                                                    | 23 个文件、185 项测试全部通过；测试后 15 张核心表均残留 0 行                                                                                                                              | [layer3-pnpm-test-integration.txt](evidence/issue126/layer3-pnpm-test-integration.txt) |
| 4. 原生客户端状态                | 本单未执行原生构建或安装                    | 未新构建；当日预检在提交 `82c69aa` 新构建 Android 开发客户端 | 本任务未修改移动端业务源码、原生依赖或构建配置，未在本单重建 APK 或执行原生安装；当日 [#127 / PR #134](https://github.com/Liangbai2333/tongzhang/pull/134) 在 `82c69aa` 新构建 APK 并预检 | —                                                                                      |

## 运行环境与跨用例零脏数据核对

- 工具链：macOS ARM64，Node.js `v24.21.0`（与 `.node-version` 及 `engines` `>=24 <25` 一致）、pnpm `12.6.0`、Docker `29.8.2`。
- 隔离数据库：一次性容器 `postgres:17-alpine`（PostgreSQL `17.11`，容器名 `tongzhang-issue126-pg`，映射 `127.0.0.1:55426`，库名 `tongzhang_test`），由 `vitest.integration.config.ts` 的 `migrate-database.ts` 执行迁移（含 `0001_add_notifications.sql`），未使用开发库或共享库。
- 零残留核对：整套 23 个集成测试文件全部通过后，查询 `users`、`auth_sessions`、`auth_refresh_tokens`、`ledgers`、`ledger_members`、`invitations`、`image_assets`、`expenses`、`expense_splits`、`expense_images`、`settlement_batches`、`settlement_transfers`、`notifications`、`operation_logs`、`idempotency_keys` 共 15 张公共表均为 `0` 行（见 [residual-rows-after-integration.txt](evidence/issue126/residual-rows-after-integration.txt)），随后销毁临时容器。
- 脱敏处理：原始日志中的工作树绝对路径统一替换为 `<worktree>`，测试库口令脱敏为 `***`。

## 本次新增回归断言、AI 确定性替身与站内提醒夹具

### 1. 移动端新增交互组件回归（Layer 2）

| 测试文件                                                              | 新增回归边界                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [expenses-ui.test.tsx](../apps/mobile/tests/expenses-ui.test.tsx)     | 冻结态（`SETTLING`）拦截进入编辑模式并可安全返回；软删除取消不触发写请求；软删除超时进入未确认态且手动重试复用同一幂等键；软删除 `409 VERSION_CONFLICT` 提示刷新而不误退页          |
| [auth-ui.test.tsx](../apps/mobile/tests/auth-ui.test.tsx)             | 用户名超长（31 字）本地拦截不发请求；改名失败保留草稿且不调用 `syncUser`，关闭重开面板恢复已核验用户名；通知开关保存失败不误同步状态                                                |
| [statistics-ui.test.tsx](../apps/mobile/tests/statistics-ui.test.tsx) | 统计接口失败展示显式错误态并支持手动重试恢复全图表；已结清账本单分类/单日/零支付成员边界渲染无 `NaN` 或崩溃                                                                         |
| [ledgers-ui.test.tsx](../apps/mobile/tests/ledgers-ui.test.tsx)       | 永久拒权点「前往系统设置开启相机」调用 `Linking.openSettings`；首次拒权（`canAskAgain=true`）留在手输页不显示设置按钮且手输邀请码预览加入通过；扫码面板点「改用手输邀请码」平滑关闭 |

### 2. `A31` AI 草稿解析确定性替身与站内提醒隔离库夹具（Layer 1 & Layer 3）

| 文件                                                                                                                          | 用途与覆盖要点                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ai-draft-double.ts](../apps/server/tests/fixtures/ai-draft-double.ts)                                                        | 提供 `createDeterministicAiDraftDouble`（支持 `valid-equal`、`valid-shares`、`valid-amount`、`dirty-output`、`upstream-502`、`unavailable-503` 与请求录制）及 `createDeterministicOpenAiFetchDouble`（零外网确定性 HTTP 替身）                   |
| [notifications.ts](../apps/server/tests/fixtures/notifications.ts)                                                            | 提供 `seedSettlingReminderScenario`（真实 HTTP 构建 3 人 `SETTLING` 待还转账场景，封装 `A32`/`A33`/`A34`/`A29`/`A25`）及 `countCorePublicTableRows`（15 张核心表行数核对辅助）                                                                   |
| [ai-draft-double.test.ts](../apps/server/tests/ai-draft-double.test.ts)                                                       | 无数据库验证确定性替身在 `EQUAL`/`SHARES`/`AMOUNT`、脏输出清洗告警、`502`/`503` 显式错误与 OpenAI 兼容 Provider（Markdown 围栏 JSON、500、畸形 JSON、超时中止）下的确定性行为                                                                    |
| [ai-draft-notifications-fixture.integration.test.ts](../apps/server/tests/ai-draft-notifications-fixture.integration.test.ts) | 隔离库端到端验证 `A31` 文本+收据解析/脏输出/502 均零写库且不递增 `ledgers.version`，经人工 `A13` 确认后落库绑定收据；验证 `A32` 权限/冷却、`A33` 收件箱、`A34` 跨用户 `403 FORBIDDEN` 与本人已读、`A29` 关闭静默不落通知及测试关闭后核心表零残留 |

## 詹铖煜当日四栏预检记录核对与后端 PR 核查

- **詹铖煜四栏格式核对（[#127 / PR #134](https://github.com/Liangbai2333/tongzhang/pull/134)）**：已核查 `docs/issue127-qr-prebuild-preflight.md`（提交 `129488f`，合入 `9d3be6a`）与 `docs/evidence/issue127-qr-prebuild-preflight/` 下 8 张截图、6 份原始日志，结论为**四栏格式合规**，已留下书面核对意见：[PR #134 评论](https://github.com/Liangbai2333/tongzhang/pull/134#issuecomment-7011017079)。
- **Day 3 新增后端接口核查**：[PR #129](https://github.com/Liangbai2333/tongzhang/pull/129)（`A31`）、[PR #130](https://github.com/Liangbai2333/tongzhang/pull/130)（`A33`/`A34` 迁移与服务）与 [PR #132](https://github.com/Liangbai2333/tongzhang/pull/132)（`A21` 联调与 `A32` 催还）均已合入主线，本单新增的确定性替身与隔离库夹具已在真实 PostgreSQL 17 上对其权限、状态、静默偏好与零残留边界完成端到端回归验证。

## 待完成（需人工）

- 第二审查人饶恩哲（`@Liangbai2333`）与饶慧（`@whisper-uoo`）的具体书面审查批注待其本人在本单 PR 下补充，本文与 PR 不代写。
