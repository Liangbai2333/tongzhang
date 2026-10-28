# Issue #55 账本权限与个人归档候选回归

2026-10-28，复核 [Issue #55](https://github.com/Liangbai2333/tongzhang/issues/55) 的四项标准。当前候选的创建、邀请、成员读取、个人归档与历史分页回归通过，未发现需修复的业务缺陷。本次只交付核对结果与实际输出，复用已有实现和用例，不新增同义测试。审核与合并由系统架构负责人处理，不提前核销 T15/T16/T26/T27 或重复扣减已交付任务点数。

## 候选与环境

原工作区执行 `git fetch origin main`、`git merge --ff-only origin/main`，同步到 `bbf267b91aae7a4cd4cd282991d7bd59049a9c52`。从 `origin/main` 新建 worktree 和 `test/55-archive-permission-regression` 分支，原工作区未跟踪的冲刺文档保持原样。提交使用已配置的 Liangbai2333 身份，不冒用 Issue 原负责人的姓名或邮箱。

| 对象     | 实际环境与范围                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 验证源码 | `bbf267b91aae7a4cd4cd282991d7bd59049a9c52`；最终文档提交由 PR 记录                                                                                            |
| 工作目录 | `/Users/liangbai/.codex/worktrees/issue-55-archive-permissions/tongzhang`                                                                                     |
| 运行时   | macOS arm64、Node 24.22.0、pnpm 12.6.0；Node patch 与 `.node-version` 的 24.21.0 不同，未修改仓库约定                                                         |
| 数据库   | 独立临时 `postgres:17-alpine` 容器 `tongzhang-55-postgres`，PostgreSQL 17.11；本机随机端口 49703，专用 `tongzhang_issue55_test`，显式设置 `TEST_DATABASE_URL` |
| 数据来源 | 真实注册/生产路由与 PostgreSQL；归档状态边界另有数据库种子夹具；没有操作开发库、共享库或既有原生验收库                                                        |
| App 检查 | 当前源码核对和 Jest Expo 双平台组件测试，接口与原生依赖使用替身                                                                                               |
| 原生证据 | 引用原日期、原源码的 #43–#45 与 #49 记录；本轮未重新操作或安装原生 App                                                                                        |

环境、源码树比较及证据摘要见 [manifest.json](evidence/issue55/manifest.json)。对 `7616adb`（#49 原生实操源码）与当前候选执行 `git diff --exit-code 7616adb bbf267b -- apps packages pnpm-lock.yaml`，结果为空；当前 App/API/共享包与该次原生实操的对应代码相同。旧截图继续归属原实操，不能当成本轮重新采集的结果。

## 验收矩阵

表中用例均为当前候选已有覆盖，本轮重新执行；详细用例名称与结果见 [45 项定向回归输出](evidence/issue55/targeted-integration.txt)。

| 标准               | 已有用例与本轮结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 创建与成员读取     | [ledgers.integration.test.ts](../apps/server/tests/ledgers.integration.test.ts) 的 `makes the creator a member...` 核对创建 201、创建者成员、邀请、列表/详情/成员一致；`refuses anonymous and non-member reads...` 核对匿名 401、非成员及不存在账本统一 403、无数据泄漏。[ledger-invitation-regression.integration.test.ts](../apps/server/tests/ledger-invitation-regression.integration.test.ts) 的 `keeps preview read-only...` 核对双账号真实加入后同一份契约、成员和列表，预览不写入                                                          |
| 邀请与重复加入     | `ledgers.integration.test.ts` 的 `lets a second user preview and join...` 核对同键重放/新键重复加入只有一条成员关系、版本只增一次；`rejects malformed, unknown, expired and replaced codes` 分别核对 400/409、旧码作废及失败无成员写入。`protects the invitation endpoints...` 与独立回归中的 `requires authentication on every shipped ledger and invitation endpoint`、`denies invitation management...` 核对匿名 401、普通成员/非成员无权管理邀请 403。并发第 12 人限制由 `allows exactly one of two blocked joiners...` 复跑，不再增加重复用例 |
| 归档状态与幂等     | [archive.integration.test.ts](../apps/server/tests/archive.integration.test.ts) 的 `rejects active and settling ledgers...` 核对两种状态 409 `LEDGER_STATE_INVALID`，无归档时间或成功幂等结果；非成员 403、匿名 401、缺键 400。`archives only the caller...` 核对仅 SETTLED 可归档、同键响应相同、新键保留首次 `archivedAt`、只有一次审计；账本状态/version/settledAt 不变。`lets the other member archive independently...` 核对另一成员独立归档不移动首人的时间                                                                                  |
| 归档后的列表与权限 | 同一归档用例核对本人从当前列表移出、本人历史与详情仍可读、另一成员当前列表与历史不变。[settlement-progress.integration.test.ts](../apps/server/tests/settlement-progress.integration.test.ts) 的 `keeps the formal settlement readable after personal archive in the real closing flow` 在真实冻结/已还/结清后核对两成员读取同一正式记录；`returns explicit missing errors and rejects anonymous, nonmembers...` 核对正式记录匿名 401、非成员 403                                                                                                  |
| 财务和快照隔离     | 上述真实结清用例逐字段比较归档前后 ledger、expenses、splits、batches、transfers；[full-lifecycle.integration.test.ts](../apps/server/tests/full-lifecycle.integration.test.ts) 的 `preserves the 12000/6000 lifecycle...` 使用真实 TCP HTTP：12000 分、两人各摊 6000、一笔 6000 转账；归档后消费、分摊、收据引用、bytea 内容、正式快照和 PAID 转账不变，另一成员当前列表仍可读，双方剩余为 0，七类业务审计各一次                                                                                                                                   |
| 历史分页与空态     | `archive.integration.test.ts` 的 `paginates only the caller's archived memberships...` 经真实正式结算/归档准备 3 本历史，`archived=true&limit=1` 连续 3 页，返回恰好 3 个预期 ID、无漏项或重复、末页游标 null；不混入本人当前账本或另一成员历史，另一成员历史返回 `{data:[],page:{nextCursor:null}}`。`ledgers.integration.test.ts` 的 `pages the list with a stable cursor...` 另覆盖默认列表、非法游标及不存在日期返回 400                                                                                                                       |
| App 过滤与游标     | [LedgerListScreen.tsx](../apps/mobile/src/features/ledgers/screens/LedgerListScreen.tsx) 使用包含用户/历史过滤的查询键，每页传相同 `archived` 与 `limit:20`，原样传服务端 `nextCursor`，末页 null 终止加载；[ledgers-ui.test.tsx](../apps/mobile/tests/ledgers-ui.test.tsx) 的 `keeps archive filtering when fetching the next history page`、`shows an online empty history instead of the current-list empty copy` 与当前/历史切换用例在 iOS/Android 分别复跑。组件结果只证明过滤/传参/展示，不代替数据库分页                                    |

`archive.integration.test.ts` 的状态边界用例含直接写入 SETTLED 的种子夹具，用于归档规则验证；完整财务一致性结论来自生产结算、登记、结清流程的 `settlement-progress` 与 TCP `full-lifecycle` 用例，不将种子状态称为业务结清成功。

## API 多夹具与原生单账本证据

多页无漏项/重复的结论来自本轮 PostgreSQL 路由测试（3 本历史、每页 1 本）；App 组件测试证明历史分页继续带 `archived=true` 和原游标。没有声称在设备上准备超过 App 每页 20 本的历史数据。

已有 Android 原生操作继续按原版本引用：

- [#43–#45 原生补充步骤](issues43-45-integration-validation.md#本轮原生补充步骤)：单个零转账账本归档前的[历史空态](evidence/issues43-45/05-history-empty.png)、归档后的[历史条目](evidence/issues43-45/06-history-populated.png)与[正式记录](evidence/issues43-45/07-archived-zero-record.png)。源码/包归属保持原报告记录。
- [#49 双账号实操](issue49-documentation-validation.md#双账号逐步实操验收表)：源码 `7616adb`，单个两人主账本；创建者[当前列表移出](evidence/issue49/23-owner-current.png)、[历史可见](evidence/issue49/24-owner-history.png)、[历史正式记录](evidence/issue49/27-history-batch.png)；另一成员[当前列表不变](evidence/issue49/28-member-current.png)、[历史为空](evidence/issue49/30-member-history.png)。原 [App 请求](evidence/issue49/app-requests.json)、[归档后数据库](evidence/issue49/db-archived.json)与[环境](evidence/issue49/environment.json)保留实际业务写入、角色、批次和归档时间。

## 实际执行与清理

冻结锁文件安装通过；本次没有修改业务代码、测试、契约、路由、依赖或原生配置，不触发新增原生构建、Expo Doctor 或 JS 导出要求。

| 命令                                                                                          | 实际结果                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                  | 类型、ESLint、Prettier 通过；[输出](evidence/issue55/check.txt)                                                           |
| `pnpm test`                                                                                   | 19 文件 / 120 项通过；[输出](evidence/issue55/unit.txt)                                                                   |
| `pnpm test:mobile`                                                                            | iOS/Android 24 套件 / 232 项通过；[输出](evidence/issue55/mobile.txt)                                                     |
| 显式设置专用 `TEST_DATABASE_URL` 后，`pnpm test:integration --reporter=verbose` 加下述 6 文件 | 6 文件 / 45 项通过；[逐用例输出](evidence/issue55/targeted-integration.txt)                                               |
| 同一专用 URL 下 `pnpm test:integration`                                                       | 15 文件 / 130 项通过；[输出](evidence/issue55/integration.txt)；定向 45 项是其中子集，不累加计数                          |
| 夹具与连接清理                                                                                | 14 张业务/会话/幂等表行数均为 0，其他本库连接、等待锁、预备事务均为 0；[查询结果](evidence/issue55/database-cleanup.json) |

定向文件为 `ledgers`、`ledger-invitation-regression`、`access`、`archive`、`settlement-progress`、`full-lifecycle` 的 `.integration.test.ts`，均位于 `apps/server/tests/`。集成测试使用仓库原全局迁移入口和默认并行配置，没有关闭并行、跳过失败或放宽断言。SQL 清理核对只读查询本次专用数据库。

完成后停止并删除本次专用容器及其匿名卷，见[资源清理输出](evidence/issue55/resource-cleanup.txt)。开发库、既有验收库和原工作区未提交文件均保留。

第一次移动端命令误加 `-- --watch=false`，被 Jest 当作路径，结果为 `No tests found` / 退出 1，未执行用例；[原始输出](evidence/issue55/mobile-command-error.txt)保留。随后使用标准 `pnpm test:mobile` 执行，属于命令调用修正，没有业务修复。

## 协作交付与剩余范围

通过本 Issue 的完成评论向陈林祺（@lllin7，#58）、李润君（@range-e，#59）共享当前候选、PR、此检查矩阵和输出；只认领本次账本/归档/权限核对，不重复认领其完整原生路径、T28 或 T15/T26 整项验收。Issue 在合并前保持打开，验收核销由架构负责人汇总。

本轮未发现需要修复的实际缺陷。原生证据为既有 Android 模拟器操作；本轮未新增物理真机、iOS 原生安装或设备多页历史验收。若候选业务代码变化，按影响范围复跑相关 API/组件测试，原生路径变化由 #58 补新实操；旧证据不改写归属。
