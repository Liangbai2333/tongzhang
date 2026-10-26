# 正式结算进度、已还登记与结清验证

关联 [Issue #30](https://github.com/Liangbai2333/tongzhang/issues/30)。本次完成 A24、A25、A26 服务端接口，承接 A23 已保存的正式批次。

## 接口与行为

所有接口验证真实会话和账本成员，响应设置 `Cache-Control: no-store`。不存在的账本与非成员统一返回 `403 FORBIDDEN`。

| 接口                                                                       | 实际行为                                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A24 `GET /api/v1/ledgers/:ledgerId/settlement`                             | 返回唯一正式批次、冻结前版本、消费总额、转账总额、算法、创建时间、冻结时的 `netSnapshot`、按 sequence 排序的转账、登记信息、当前账本状态和进度。没有正式批次返回 `404 SETTLEMENT_NOT_FOUND`，不返回空成功。           |
| A25 `POST /api/v1/ledgers/:ledgerId/settlement/transfers/:transferId/paid` | 必须提供 UUID `Idempotency-Key`；请求体 `{ "note": "可选，最多200字" }`，没有备注时发送 `{}`。仅付款人或创建者在 SETTLING 登记整笔 PAID，返回 transfer 和 progress；跨账本或不存在转账返回 `404 TRANSFER_NOT_FOUND`。 |
| A26 `POST /api/v1/ledgers/:ledgerId/settle`                                | 必须提供 UUID `Idempotency-Key`，不接受请求体。仅创建者确认；所有正式转账均 PAID 且每位成员剩余净额为零才进入 SETTLED，返回 ledgerId、status 和 settledAt。                                                           |

A24 使用 repeatable-read 只读事务覆盖权限、状态、批次与转账查询，避免并发登记/结清时拼接多个时点的数据。金额始终为 bigint 整数分，API 和净额快照均为整数字符串。`progress.remainingCents` 是尚未登记转账的合计；结清另行检查每位成员的 remainingNetCents，而不是只检查全员之和。

`settlementDetailsSchema` 在原批次契约上增加必需的 `netSnapshot: [{ memberId, netCents }]`，仅用于 A24。A23 响应契约保持原形，已有持久化幂等结果仍能原样重放。两者共用批次 DTO 映射，不重新求解或替换冻结快照。

## 事务、重复请求与权限

A25、A26 与既有 A23、新增消费遵守相同锁顺序：先幂等事务锁，再账本 `FOR UPDATE` 行锁，在锁内重新检查实时权限与状态。业务写入、审计和成功幂等响应共用同一个 service 事务，响应契约在提交前校验。

首次登记保存当前成员、时间与备注，更新账本 updatedAt，写入一条 TRANSFER_PAID 审计；不新增消费、不修改分摊、原始净额、批次或消费总额。最后一笔登记后仍为 SETTLING，等待创建者确认。

同键同内容返回首次成功的完整响应；之后其他转账已登记时，该响应中的 progress 仍代表首次提交时刻，最新进度应查询 A24。同键改备注返回 `409 IDEMPOTENCY_CONFLICT`。不同键再次登记 PAID 转账也保留首次登记人、时间和备注，不增加重复审计；合法调用者在结清后仍可读取该登记结果。所有重放都重新检查实时成员和角色权限。

结清仅更新账本状态、settledAt、updatedAt、version 和 LEDGER_SETTLED 审计。未正式结算返回 `409 LEDGER_STATE_INVALID`；尚有 PENDING、转账记录数量不符或任一成员剩余净额非零，返回 `409 SETTLEMENT_INCOMPLETE`。失败不保存幂等结果。既有零转账直接 SETTLED 批次，以及已确认结清的账本，创建者重复确认返回原 settledAt，不再次增加版本或审计。

## 验证环境与覆盖

使用本机 Node.js 24.22.0、pnpm 12.6.0 和 Docker PostgreSQL 17.11，创建独立 `tongzhang_issue30_test` 数据库。显式设置 `TEST_DATABASE_URL`，由全局 setup 应用仓库已提交的 SQL 迁移。没有对开发业务库执行迁移或测试，没有 schema 变化和新依赖。

新增 `apps/server/tests/settlement-progress.integration.test.ts`，使用生产 HTTP 路由、真实认证与 PostgreSQL，共 14 项测试：

- 四人三笔消费 30000 分，快照净额 +3000、+6000、−3000、−6000；两笔转账 3000/6000 分，分步登记、创建者结清后原消费总额仍为 30000 分，所有成员剩余净额为零。
- A24 未产生批次、匿名、非成员、不存在账本；A25 非付款人/收款人拒绝、跨账本转账；缺少或非法幂等键、超长备注、部分金额登记和带请求体结清均拒绝。
- 同键并发、UUID 大小写归一、不同键重复登记及原登记元数据保留；两笔转账同时登记及同/异键同时结清均无重复效果。
- 提前结清、全部 PAID 但成员仍有剩余净额均拒绝；零转账已直接结清批次兼容。
- 幂等结果重放前，以及等待账本行锁后，重新检查角色或成员权限。
- 在最终幂等 INSERT 添加仅命中本次随机键的临时数据库 CHECK 约束，分别验证 A25 和 A26 失败时转账、账本、审计及幂等全部回滚，移除约束后同键显式重试成功。
- 最后一笔登记与结清两个方向竞争：使用独立 PostgreSQL 连接持有账本锁，并通过 `pg_blocking_pids` 确认排队顺序。登记先提交时结清成功；结清先执行时拒绝并允许显式重试。等待期间 A24 可读取完整已提交进度，竞争结束后状态与转账一致。

## 验证结果

| 命令                                                    | 实际结果                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                        | 通过，锁文件未修改                                               |
| `pnpm check`                                            | 共享包构建、工作区类型检查、ESLint 和 Prettier 全部通过          |
| `pnpm test`                                             | 18 个文件、112 项无数据库测试通过                                |
| 显式设置 `TEST_DATABASE_URL` 后 `pnpm test:integration` | 12 个文件、110 项真实 PostgreSQL 测试通过，含本次新增 14 项      |
| `pnpm build:server`                                     | 通过                                                             |
| `pnpm export:mobile`                                    | iOS 和 Android JS 导出通过，未新增 Web 构建                      |
| `NODE_USE_ENV_PROXY=1 pnpm doctor:mobile`               | 21/21 项通过；首次普通运行因 Expo API TLS 连接中断失败，重试通过 |

本次修改共享契约，因此执行移动端导出和 Expo Doctor；没有依赖、Expo API、原生配置或移动端路由修改，不需要重建开发客户端。JS 导出通过只验证打包兼容性，不代表原生安装或真机验收。

## 遗留与验收边界

Issue #30 的服务端 A24–A26 无遗留占位接口。移动端已有对应 API 方法，但正式冻结、进度记录、登记已还与结清的界面接线不属于本次后端任务；当前仍只开放只读预览。个人归档 A27、消费改删和自定义封面绑定仍由各自任务完成。本次没有界面改动，不提供界面截图，不声称完成原生安装或真机全流程验收。

Issue 状态、验收勾选及冲刺剩余点数留待系统架构负责人审核后更新；本 PR 不执行合并。
