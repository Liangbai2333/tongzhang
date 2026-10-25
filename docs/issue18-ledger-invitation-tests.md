# Issue #18：建账、邀请码与加入自动化测试

关联 [Issue #18](https://github.com/Liangbai2333/tongzhang/issues/18)，Refs #18。2026-10-25 完成本地测试补充及实际运行，不扣减 T15 整项点数。

## 范围与独立预期

负责人李润君（`range-e`）。从最新 `origin/main` 的 `574d58bad7cfd2c71f8f1a66ec40e340afb6b2e0` 新建 `test/18-ledgers-invitations`；不依赖另一分支尚未合并的移动端页面或 #17 提交。本次只补测试和验证文档，不改业务实现、接口、迁移、依赖或移动端。

独立核对后端既有交付 [PR #21](https://github.com/Liangbai2333/tongzhang/pull/21) 的 [账本说明](modules/ledgers.md)、[邀请说明](modules/invitations.md)、[业务约束](product-spec.md) 及 `packages/contracts/src/endpoints.ts`，固定预期为：创建者占首个名额、最多 12 人、预览只读、加入成功递增版本、重复加入不再增加成员/版本、同键异内容为 409、拒绝请求不留下成功效果。没有将服务端当前计算结果反过来作为预期，也没有宣称已和成员进行人工沟通。

沿用 #6 的 `integrationFixture()`、`testDatabaseUrl()`、迁移 global setup 和锁等待观察工具。所有请求走真实应用的 A05–A12 路由、认证、事务及 Repository；HTTP 使用项目约定的 `Fastify.inject()`，数据库为真实 PostgreSQL。没有注册测试专用业务路由，没有 mock service、数据库、令牌或响应；这不等于 TCP/TLS、移动端或真机验收。

## 覆盖及新增内容

主线已有 [ledgers.integration.test.ts](../apps/server/tests/ledgers.integration.test.ts) 的 12 项测试，覆盖创建后列表/详情/成员、重复创建及并发重放、创建同键异内容、无效输入、匿名/非成员拒绝、分页、真实账目金额、第二账号加入、非法/未知/过期/重置邀请码、邀请管理权限和满员加入。本次保留这些测试，补充 [ledger-invitation-regression.integration.test.ts](../apps/server/tests/ledger-invitation-regression.integration.test.ts) 的 11 项，不重复认领已有实现。

| 新增场景                              | 固定预期及真实断言                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 只读预览、双账号完整返回契约          | 连续两次预览不改版本、成员、邀请、审计、幂等结果；加入后两账号的列表/详情/成员响应一致，角色及 `myMemberId` 正确。完整响应与共享 schema 解析结果一致，检查额外字段泄露及包装结构。                                                   |
| 加入接口同键异邀请码                  | 同键加入 A 成功后换为另一个真实账本 B 的有效码，返回 409/IDEMPOTENCY_CONFLICT；A/B 状态均不变；原键重放 A 与首次响应相同，显式新键才可加入 B。                                                                                       |
| 同一用户并发加入，同键/不同键（2 项） | 四请求均 200，只有一个成员 ID、一次版本递增及一条加入审计。同键四次返回原成功体；不同键只有首次为 `alreadyMember: false`，其余为 true。成功结果条数也按键数核对。                                                                    |
| 加入缺少/非法幂等键（2 项）           | 均返回契约 400/VALIDATION_ERROR；版本、成员、邀请、审计和成功结果计数完全不变。                                                                                                                                                      |
| 八个已交付端点的匿名矩阵              | 创建、列表、详情、成员、读取/重置邀请、预览、加入全部返回契约 401，不泄露账本名/邀请码，无提交副作用。                                                                                                                               |
| 成员及非成员均不能管理邀请            | 读取及重置均 403/FORBIDDEN；旧邀请码仍可由创建者读取，邀请/审计/成功结果没有增加。                                                                                                                                                   |
| 预览后过期、拒绝不占幂等键            | 预览成功后使该夹具邀请过期，原键加入 409/INVITE_EXPIRED，无成功效果；恢复夹具邀请有效期后显式重试原键可成功。                                                                                                                        |
| 第 12 个名额的确定性并发              | 创建者加 10 个数据库夹具成员，共 11 人；两个真实注册用户的加入请求均已阻塞在同一账本锁上后释放锁。恰好一个 200、一个 409/MEMBER_LIMIT_REACHED，成员 12、版本只加 1、加入审计只加 1。满员后已有成员仍可重复加入，未加入者继续被拒绝。 |
| 数据清理隔离                          | API 创建/加入后关闭夹具；其用户、会话、刷新令牌、账本、成员、邀请、审计、幂等结果均为 0。另一个独立夹具的账号和账本仍能通过真实接口读取，最后单独清理。                                                                              |

人数边界的 10 个已有成员使用既有 `seedUser()` 和数据库插入准备，以避免注册端点每分钟 10 次限流；竞争加入的用户均经正式注册取得真实会话。预览后过期场景只修改本夹具的邀请行。并发测试等待 PostgreSQL 实际阻塞关系，不靠固定 sleep 猜测时序，失败也会释放锁并等待请求结束后清理。

## 数据库隔离与清理结果

本轮专门新建空库 `tongzhang_issue18_6100ab14_test`，使用显式 `TEST_DATABASE_URL`；没有使用成员开发库、共享业务库或 #17 的 App 验收数据。公共 guard 拒绝非 PostgreSQL 地址及名称不以 `_test` 结尾的目标，不输出包含凭据的 URL。

迁移由既有 global setup 应用已提交 SQL，完成后才并发启动测试。账号邮箱使用随机 UUID；夹具按跟踪的用户/账本 ID 清理，无全表 TRUNCATE。完整集成测试结束后，通过 SQL 核对 14 张 public 业务/支撑表全部为 0 行，再删除本轮自行创建的临时库。结果保存在 [verification.json](evidence/issue18/verification.json)；不提交连接串、密码、JWT 或 Refresh Token。

## 实际命令与输出

环境：Node.js 24、pnpm 12.6.0、PostgreSQL 17.11。先创建自己的专用空测试库，再将带连接参数的 `TEST_DATABASE_URL` 设置到当前进程环境；不要把真实凭据写入命令记录或仓库。项目不会替用户创建目标数据库，迁移由测试入口自动完成。

```bash
# 先在本机环境显式设置 TEST_DATABASE_URL，目标库名称必须以 _test 结尾。
pnpm test:integration apps/server/tests/ledgers.integration.test.ts
pnpm test:integration apps/server/tests/ledgers.integration.test.ts apps/server/tests/ledger-invitation-regression.integration.test.ts
pnpm check
pnpm test
pnpm test:integration
```

| 实际执行                 | 结果与原始输出                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 修改前主线账本/邀请基线  | 1 文件 / 12 项通过，exit 0。[baseline.txt](evidence/issue18/baseline.txt)                                                                                                                   |
| 原有 + 新增账本/邀请用例 | 2 文件 / 23 项通过，exit 0；其中新增 11 项。[focused.txt](evidence/issue18/focused.txt)                                                                                                     |
| `pnpm test`              | 18 文件 / 112 项无数据库测试通过，exit 0。[unit.txt](evidence/issue18/unit.txt)                                                                                                             |
| `pnpm test:integration`  | 11 文件 / 96 项真实 PostgreSQL 集成测试通过，exit 0；包含认证、权限、幂等、账本/邀请、消费、图片、余额及结算既有回归。[integration.txt](evidence/issue18/integration.txt)                   |
| `pnpm check`             | 共享包构建、所有类型检查（包含新增测试）及 ESLint 通过；Prettier 因原有未跟踪文件 `docs/sprint/2026-10-24/evidence/main-commits.json` 失败，exit 1。[check.txt](evidence/issue18/check.txt) |

没有遇到业务或测试断言失败；本次唯一失败为上述工作区既有格式问题。该文件不属于 #18，保持原样、未纳入提交，其 SHA-256 保存在 verification.json。本任务新增测试和文档另行通过定向 Prettier 检查，不能将此描述为全局 `pnpm check` 全通过。

## 本地交付

按用户要求，新增提交的 Author、Committer 均为 `range-e <2018906793@qq.com>`，提交标题和正文使用英文，包含 `Co-authored-by: Liangbai2333 <70431533+Liangbai2333@users.noreply.github.com>`。保留其他人的未提交 sprint 文档，不改 Git 全局配置或共享历史。

测试代码及验证证据作为本地提交交付，未推送、创建 PR、关闭 Issue 或扣减 T15 点数。使用 `Refs #18` 关联；仍需按 CONTRIBUTING 审核，并在任务整体验收通过后更新完成状态。
