# Issue #32：主线测试核对与清理竞争增量

2026-10-26，关联 [Issue #32](https://github.com/Liangbai2333/tongzhang/issues/32)。同步远程 `main` 后，从 `8bd297bf16653f854cc9f89e3715c20e8f05aa02` 创建独立 worktree，分支为 `test/32-regression-gaps`。负责人为李润君（`range-e`）；按用户要求，新提交的作者和提交者均沿用仓库历史提交 `a9aba79` 的 `range-e <2018906793@qq.com>`。

## 先核对已有覆盖

未修改测试的主线先在本次专用数据库运行 `pnpm test:integration`：14 个文件、124 项通过，见[基线原始输出](evidence/issue32/baseline-integration.txt)。以下均为主线已经交付的覆盖，本任务复用复验，不重复认领。

| Issue #32 验收项                                           | 主线已有测试与断言                                                                                                                                                                                                                                                                                                                  | 本次处理                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 封面越权、错误类型、已绑定拒绝、事务回滚、并发绑定         | [cover-cleanup.integration.test.ts](../apps/server/tests/cover-cleanup.integration.test.ts)：`rejects foreign, missing, wrong-kind and already-bound images`、`rolls back cover, ledger, member, invitation, audit and idempotency`、`serializes different keys competing for one cover`                                            | 原样复用，未新增同义用例                                                       |
| 清理保留有效引用、未过期图片与已绑定无引用图片             | 同文件 `deletes old unbound COVER/RECEIPT only`，检查 23 小时 59 分钟、近期图片、封面、收据及无引用但有 ledgerId 的图片；另有批次上限和并发清理                                                                                                                                                                                     | 原样复用                                                                       |
| 绑定与清理竞争                                             | 同文件 COVER/RECEIPT 锁等待时清理跳过、清理先完成后建账拒绝；`837683a` 已提供夹具锁探针隔离                                                                                                                                                                                                                                         | 保留原覆盖，仅补清理尚未提交时的真实重叠窗口                                   |
| 冻结后拒绝消费、旧版本冲突、正式记录一致性                 | [settlements.integration.test.ts](../apps/server/tests/settlements.integration.test.ts)：只读预览、冻结写拒绝、旧版本重算、四人快照；`serializes a real expense/freeze race` 两个锁顺序；[settlement-progress.integration.test.ts](../apps/server/tests/settlement-progress.integration.test.ts) 比较正式记录、原始净额和持久化数据 | 原样复用两个竞争方向，不新增冻结测试                                           |
| 归档只影响本人、其他成员与财务状态不变                     | [archive.integration.test.ts](../apps/server/tests/archive.integration.test.ts) 检查本人列表/历史、另一成员独立归档、时间不变与状态拒绝；`settlement-progress` 中真实消费→冻结→已还→结清→归档验证原批次、转账、消费、分摊不变                                                                                                       | 原样复用，不新增归档测试                                                       |
| 还款权限、重复登记保留时间、并发登记、提前结清拒绝、零转账 | `settlement-progress` 已覆盖付款人/创建者权限、收款人拒绝、同/异键重复与并发、原登记人/时间/备注、提前及逐人余额不零拒绝、零转账、最后一笔和结清双向竞争、回滚与重放前权限复查                                                                                                                                                      | 接口 A24–A26 已就绪，全部使用真实 HTTP/PostgreSQL 复验，无占位成功或待接口场景 |

## 本次仅新增 4 项

扩展既有 `cover-cleanup.integration.test.ts`，参数为 `COVER/RECEIPT × commit/rollback`。原有“清理已完成后再绑定”不能证明清理持锁尚未提交时，绑定请求会等待并依据最终提交结果处理。

测试实际上传图片并设为 25 小时前；收据场景创建隔离账本。仅在测试库安装随机命名、只命中该图片 ID 的 DELETE 触发器，以真实 advisory lock 暂停生产 `cleanupTemporaryImages`，不替换 Service、Repository 或 SQL 返回值。先通过 `pg_blocking_pids` 确认清理已持有候选图片锁并等待，再发送真实建账/消费请求，确认同一锁链上有清理与绑定两个本夹具连接。此时其他连接仍能读取完整已提交图片。

- 清理提交：确实删除 1 张；等待中的绑定返回 `403 FORBIDDEN`。封面建账无账本、成员、邀请、审计、幂等残留；收据场景原账本整行不变，无消费、分摊、收据引用、审计或成功幂等结果。
- 清理失败：触发器抛出明确的测试数据库异常，真实事务回滚；等待中的绑定返回 201。原图片内容和元数据保留，仅增加账本绑定；鉴权读取原字节成功，后续清理保留有效绑定。

`finally` 释放 advisory lock、等待请求结束并删除本用例触发器/函数，之后沿用 #18 的按夹具账号和账本 ID 清理流程。没有全表清空，没有自动重试写请求，没有禁用集成文件并行或放宽锁探针断言。

## 实际验证

环境：Node.js 24.22.0、pnpm 12.6.0、PostgreSQL 17.11（`postgres:17-alpine`）。新建独立容器 `tongzhang-issue32-postgres`，专用数据库 `tongzhang_issue32_test`；端口仅绑定本机随机端口 50797。随机密码只放在 `/tmp/tongzhang-issue32/postgres.env`（权限 0600），测试进程显式注入 `TEST_DATABASE_URL`；未复制开发 `.env`、未访问开发或生产业务库。

| 命令 / 检查                                                                                                        | 实际结果与原始输出                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                   | 成功，依赖及锁文件无修改                                                                                                                                                                                                                    |
| 基线 `TEST_DATABASE_URL=… pnpm test:integration`                                                                   | 14 个文件、124 项通过；[输出](evidence/issue32/baseline-integration.txt)                                                                                                                                                                    |
| `TEST_DATABASE_URL=… pnpm test:integration apps/server/tests/cover-cleanup.integration.test.ts --reporter=verbose` | 1 个文件、14 项通过，含原有 10 项与新增 4 项；[逐项输出](evidence/issue32/cleanup-race.txt)                                                                                                                                                 |
| `pnpm check`                                                                                                       | 共享包构建、全工作区类型检查、ESLint、Prettier 通过；[输出](evidence/issue32/check.txt)                                                                                                                                                     |
| `pnpm test`                                                                                                        | 18 个文件、112 项无数据库测试通过；[输出](evidence/issue32/unit.txt)                                                                                                                                                                        |
| `TEST_DATABASE_URL=… pnpm test:integration --reporter=verbose`                                                     | 保持默认文件并行，14 个文件、128 项全部通过；[逐项输出](evidence/issue32/integration.txt)                                                                                                                                                   |
| 基线及最终清理审计                                                                                                 | 两次 public 下全部 14 张表均为 0 行；临时触发器、函数、约束、夹具连接与 advisory lock 均为 0；[基线](evidence/issue32/baseline-cleanup.txt)、[最终](evidence/issue32/final-cleanup.txt)、[实际审计 SQL](evidence/issue32/cleanup-audit.sql) |

全局 setup 在并行测试启动前应用仓库已提交迁移，没有新增 schema 或使用 schema push。输出保留进程时钟，清理审计另记录数据库 UTC 时间；提交证据时仅去除工具输出的行末空白与多余末尾空行。

审计完成后执行 `docker rm -f -v tongzhang-issue32-postgres`，核对专用容器与其匿名卷均已不存在，并删除 `/tmp/tongzhang-issue32` 中的随机密码和本次临时启动脚本。保留任务 worktree 与提交内验证资料，见[资源清理原始记录](evidence/issue32/resources-cleanup.txt)。

测试和 `pnpm check` 无非预期失败。清理回滚两项中的 `issue32 injected cleanup rollback` 是主动注入并断言的数据库失败。首次人工只读清理审计误写不存在的 `user_settings`，查询失败；[失败输出](evidence/issue32/audit-first-attempt.txt)保留，之后改为按 `pg_tables` 枚举全部 14 张实际业务表并核对，不靠人工删除数据得到零残留。

本次仅修改服务端测试及验证资料，未修改共享包、移动端路由、依赖、原生配置或业务实现，不涉及 Expo API。没有运行移动端导出、Doctor 或原生重建，也不将 HTTP/数据库验证表述为真机验收。T15/T26 整项的完成状态和剩余点数保持原值，交由系统架构负责人验收；PR 不合并。

## 重跑

提供名称以 `_test` 结尾的专用 PostgreSQL 数据库，通过环境注入其连接串，勿将真实密码写入仓库或测试输出：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
TEST_DATABASE_URL='<专用测试库连接串>' pnpm test:integration --reporter=verbose
```

测试数据库账号需允许应用迁移以及创建、删除测试用触发器/函数，与既有数据库 CHECK 失败注入测试一样仅在专用测试库执行。测试结束后，可用 `psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off -f docs/evidence/issue32/cleanup-audit.sql` 复核表数据与临时对象清理情况。
