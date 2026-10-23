# 模块骨架验证记录

> 启动与部署入口已调整；本页历史验收不代表新流程验收，当前命令见 [开发说明](development.md)。历史命令 `pnpm build:api` 现已更名为 `pnpm build:server`。
> 日期：2026-10-22。入口：[模块架构与设计](modules/README.md)。

## 1 交付范围

- 8个业务模块及审计支撑，服务端统一routes / service / repository边界。
- 29项共享接口契约及HTTP入口，移动端对应API、查询键与面板状态模型。
- 13张表、109个字段、约束、索引与首个Drizzle SQL迁移。
- 整数金额、三种分摊、最多12人的精确最少笔数算法。
- 真实会话校验、密码与令牌工具、权限策略、事务入口、幂等锁和上传大小限制。
- 表单、扫码、图片、复制分享、密码哈希、限流等依赖及原生权限配置。

## 2 检查结果

| 检查                             | 结果                                             |
| -------------------------------- | ------------------------------------------------ |
| `pnpm install --frozen-lockfile` | 安装通过，单一锁文件                             |
| `pnpm check`                     | 类型、Lint、格式检查通过                         |
| `pnpm test`                      | 6个文件、22项测试通过                            |
| `pnpm test:integration`          | 专用PostgreSQL 17测试库，2个文件、4项测试通过    |
| `pnpm build:api`                 | 服务端及共享包编译通过                           |
| `pnpm export:mobile`             | Android / iOS JavaScript与Hermes包导出通过       |
| `expo install --check`           | SDK 57依赖版本匹配                               |
| Expo Doctor                      | 21/21通过                                        |
| `pnpm generate:db`               | Schema与迁移快照一致，无新增迁移                 |
| sharp本机绑定                    | PNG编码/解码与元数据读取通过                     |
| Docker构建复验                   | 基础镜像下载持续无进展后主动中止，未验证本次镜像 |
| `pnpm peers check`               | 无peer依赖冲突                                   |

算法测试覆盖守恒、稳定结果、贪心反例，并对120组小规模输入与独立穷举结果比较。集成测试执行首次/重复迁移、9项数据库约束反例、300元示例账目、已还后余额归零、个人归档，以及真实会话撤销后的401响应。

迁移验证仅使用独立临时测试库，验证结束后已移除该临时容器；未对已有开发库执行迁移。SQL账目测试用于验证数据结构与约束，不等同于业务API全流程验收。

## 3 接入边界

当前交付为可编译的模块骨架。业务Service占位入口返回501 FEATURE_NOT_READY；默认移动端仍为联调页。幂等锁已有实现，完整请求摘要、成功结果持久化和重放由各业务事务接入。

本次未重新编译安装iOS/Android原生客户端。新增原生依赖后，已有开发客户端需要重建一次：

```bash
pnpm build:ios
```

后续按账号 → 账本/邀请 → 消费/图片 → 余额/结算 → 结清/归档顺序接通用例。开发库使用 `pnpm migrate:db` 应用已审查的迁移，不单独运行说明书中的建表SQL。

## 4 结构调整（同日）

在接通更多业务前整理模块边界与命名，不改变接口路径、数据库结构和业务行为：

| 调整       | 内容                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 服务端应用 | `apps/api` → `apps/server`，包名 `@tongzhang/server`；脚本 `dev:server` / `build:server`；`infra/server.Dockerfile`，生产 Compose 服务名 `server`；存活检查 service 标识 `tongzhang-server` |
| 服务端分层 | `shared/`、`plugins/` 拆为 `http/`（路由适配、上下文、错误、系统接口、501占位）与 `db/`（插件、事务、幂等锁、审计）；`modules/audit`、`modules/system` 不再作为业务模块                     |
| 依赖方向   | 会话校验移入 auth 模块，经 `app.authenticate` 注入；ESLint 禁止 `http/db/config` 导入业务模块，禁止跨模块深层导入                                                                           |
| 模块命名   | `users` → `profile`，`insights` → `balances`（服务端、契约 `module` 字段与 Swagger 标签、移动端 feature、模块文档）                                                                         |
| 契约文件   | `common.ts`/`primitives.ts` → `http.ts`、`scalars.ts`、`limits.ts`；`health.ts` → `system.ts`；删除未使用的路由参数 Schema                                                                  |
| 上限常量   | 人数 12、单笔金额上限统一来自 `@tongzhang/domain`，contracts、分摊、结算算法与系统接口引用同一常量                                                                                          |
| 骨架清理   | 删除只有接口声明、无实现的 Repository 文件；删除 auth 无用查询键；迁移重命名为 `0000_init`（内容不变，未在共享环境执行过）                                                                  |
| 模板残留   | 删除 Expo 模板 LICENSE、`react-dom` 直接依赖、空目录占位；`apps/mobile/AGENTS.md` 中的项目约定并入根目录 AGENTS.md 后删除                                                                   |

复验：`pnpm check`、`pnpm test`（22项）、`pnpm build:server`、`pnpm generate:db`（无新增迁移）、`pnpm export:mobile`、`expo install --check`、Expo Doctor 21/21 通过；临时 PostgreSQL 17 测试库执行 `pnpm test:integration` 4项通过，验证后已移除容器。未重新编译安装原生客户端；`react-dom` 仅为 Web 可选依赖，移除后建议下次原生构建时确认。
