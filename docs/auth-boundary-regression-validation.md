# 登录边界与限流补充回归

日期：2026-10-27。关联 [Issue #6 / T15](https://github.com/Liangbai2333/tongzhang/issues/6)，承接既有 [登录、权限与幂等自动化回归](auth-regression-validation.md)。本轮按"不重复认领"原则核对既有覆盖，仅补充三个此前缺失的真实缺口，使用 `Refs #6`，不提前关闭整项任务。

## 与既有覆盖的关系

既有 `auth.integration.test.ts`（10 项）、`access.integration.test.ts`（2 项）、`idempotency.integration.test.ts`（11 项）已覆盖任务验收标准中的绝大多数场景：正确/错误/未知凭据、重名用户名 409、双令牌轮换与撤销、退出撤销后受保护请求 401、过期访问令牌与绝对会话到期、匿名/非成员/不存在账本的 401/403 且不泄露账本名、同键同内容重放、同键异内容 409 冲突、四并发同键只产生一次业务效果、并发冲突恰好一个赢家、事务回滚、按用户/资源路径隔离、过期重放记录替换。本轮不重复编写这些用例，运行时确认它们全部通过。

本轮新增 `apps/server/tests/auth-boundary-regression.integration.test.ts`（3 项）：

| 场景 | 固定预期与实际断言 |
| --- | --- |
| 唯一用户名登录 | 仅重名用户名有 409 断言、登录成功只有邮箱路径断言，唯一用户名登录此前无覆盖；本轮断言 200、契约解析通过、不含 passwordHash、refreshToken 与注册会话不同、两枚访问令牌均可在 getMe 使用、未撤销会话数为 2 |
| 匿名退出与 getMe | `POST /api/v1/auth/logout` 无凭据 401 UNAUTHENTICATED；非法 Bearer 头 401 UNAUTHENTICATED；匿名 `GET /api/v1/me` 401 UNAUTHENTICATED（service 层与 authenticate 中间件的显式拒绝此前无直接断言） |
| 未认证接口限流 | 未认证端点 `rateLimit max: 10/min` 从未测试；本轮连续 11 次登录（未知账号）断言前 10 次 401 INVALID_CREDENTIALS 语义链路、第 11 次 429 RATE_LIMITED（全局错误处理器将 429 映射为该码），且不产生任何用户/会话副作用 |

## 实际运行

显式 `TEST_DATABASE_URL`（PostgreSQL 17.11 独立 `_test` 库）运行：

- 目标文件 + 既有认证/权限/幂等 4 文件批：26 项全部通过。
- 分批复跑其余集成（本机杀软周期性锁定 PostgreSQL 数据文件导致 PANIC 崩溃恢复循环，采用 `--no-file-parallelism` + 分文件/分 describe 重试）：images 10、schema 3、database 1、settlements 13、expenses 16、balances 7、cover-archive-repayment 6+10 todo 全部通过；`ledgers.integration.test.ts` 的 createLedger 组 7 项与 invitations 组前 4 项通过。
- 单元（无数据库）：83 通过 / 2 失败——2 项失败为 `scripts/tests/deploy.test.mjs`，其以冒号拼接 PATH 注入桩程序，在 Windows 上该分隔符无效，属环境差异而非本轮改动（本轮未触碰 scripts/infra）。
- `pnpm -r typecheck` 语义等价逐包 tsc：contracts、domain、server、server-tools、mobile 全部通过（本轮新增文件初次暴露一处 `noUncheckedIndexedAccess` 报错，已改为 `.at()` 后通过）。
- `eslint . --max-warnings=0` 无告警；prettier 对新增文件 `--check` 通过。

## 环境故障与阻塞记录

1. 本机杀软/防护约每 40-90 秒锁定一次 PostgreSQL 数据文件（`global/pg_control`、`base/…`），触发 `PANIC: could not open file ... Permission denied` 与崩溃恢复循环；换用 `C:\Users\Public` 与工作区数据目录、关闭 fsync、非沙箱启动均无法根除。缓解手段为分文件/分 describe 缩短运行窗口并自动重试。受此影响，`ledgers.integration.test.ts > never exceeds 12 members`（批量 seedUser 高频写库，单用例触发锁概率最高）今日 20 次重试均失败，[既有验证](auth-regression-validation.md)中该文件曾在正常环境下全部通过；ledger-invitation-regression 同因未能今日复跑。此为环境问题，非代码回归。
2. 中途一次 `pnpm exec` 触发的依赖校验因网络与 store 写入被拒，损坏了 hoisted node_modules（@jridgewell 系列、@eslint 系列及整棵 expo 依赖树丢失、workspace junction 被清空）。已按 lockfile 版本逐包恢复 server/eslint 依赖并重建 junction 后恢复验证；expo 树未恢复，mobile 的 2 个测试文件因此无法运行，与本轮改动无关（本轮仅新增 server 测试文件）。
3. 环境验证期间发现 `node --run` 在含非 ASCII 字符的临时目录下无法定位 package.json（22.22.2 与 24.21.0 均复现），将 `TMP/TEMP` 指向 ASCII 路径后 `scripts/tests/environment.test.mjs` 恢复通过。

## 后续

- 429 限流与匿名拒绝已补齐；T15 剩余范围（正式写入接口的数据库闭环回归）继续保留。
- 待本机防护环境恢复后复跑 `never exceeds 12 members` 与 `ledger-invitation-regression.integration.test.ts` 以补齐当日证据。
