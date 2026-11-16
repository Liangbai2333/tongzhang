# 同账 · 全栈代码、测试与审查规范（Beta 基线）

本规范定义同账仓库在 Beta 阶段执行的编码、架构边界、数据库事务、AI 与统计扩展、分层测试及分支审查要求，与根目录 [AGENTS.md](../AGENTS.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)、[eslint.config.mjs](../eslint.config.mjs) 和 [.prettierrc.json](../.prettierrc.json) 保持一致。冲刺任务与排期见 [beta-sprint-plan.md](beta-sprint-plan.md)。

## 1. 规范等级与修订重点

所有条款分为三级：

- **【强制】**：合入 `main` 的硬门槛，静态检查、自动化测试或人工审查未通过不得合并。
- **【推荐】**：默认遵守；确需例外时在 PR 说明原因并经第二审查人与系统架构确认。
- **【参考】**：设计与调优时备查，不单独阻断合并。

相较 Alpha 初始规范，Beta 基线重点固化六处演进：

1. **双令牌会话模型**：内存短期 HS256 Access Token + `SecureStore` 256 位轮换 Refresh Token（`auth_refresh_tokens` 存 SHA-256 摘要，旧令牌重用撤销整条会话）。
2. **写操作六格状态表**：覆盖未登录、真实 `401` 保留草稿、同账号 `getMe` 在线核验恢复（仍手动提交）、跨账号清空、断网禁自动重交、迟到 `200` 丢弃。
3. **消费改删双版本校验**：`A16`/`A17` 校验 `ACTIVE` 状态、记录人/创建者权限与消费 `version`，同一 `tx` 内重算整数分、换绑收据并递增账本 `version`。
4. **新增特性安全边界**：多维统计（`A21`）使用单一只读一致性快照，不建统计缓存表；AI 记账只做服务端解析回填 `ExpenseForm`，严禁直接写 `expenses` 表，模型密钥严禁进入客户端；站内催还限定 `SETTLING` + `PENDING`、带冷却防刷并尊重 `A29` 通知偏好；**跨账本合并结算强制禁止**。
5. **分支与双人审查门禁**：分支统一使用 `feat/`、`fix/`、`test/`、`docs/`、`chore/`、`ci/` 前缀（不使用 `codex/`），本人身份签入，优先 `git merge --ff-only`；合并前须有相邻职责第二人书面复核，行为变更同 PR 同步手册。
6. **四层测试与构建区分**：测试结果按四层附提交号独立汇报、禁止加总；严格区分 JS 导出、旧包复用、本地开发包与内嵌 Bundle 的独立交付 APK。

## 2. 前后端共用规范

### 2.1 语言与跨包边界

- 【强制】全仓开启 TypeScript `strict`。禁止用 `any` 绕过检查；外部 JSON、环境变量、二维码文本与大模型输出一律按 `unknown` 经 Zod Schema 校验后再访问。禁止提交无说明的 `@ts-ignore` / `@ts-expect-error`。
- 【强制】标识符使用准确英文命名，禁止拼音或 `tmp`、`data2` 等无意义命名；面向用户的文案与错误提示使用简体中文。
- 【强制】`apps/mobile` 与 `apps/server` 仅通过 `@tongzhang/contracts`、`@tongzhang/domain` 共享代码，由 [eslint.config.mjs](../eslint.config.mjs) 的 `no-restricted-imports` 强制阻断越界导入：
  - `packages/*/src` 禁止依赖 `node:*`、`react-native`、`expo*`、`fastify`、`drizzle-orm`、`pg` 或应用源码。
  - `apps/mobile` 禁止导入 `@tongzhang/server`、`drizzle-orm`、`pg`。
  - `apps/server/src/{config,db,http}` 禁止反向导入业务模块 `modules/*`。
  - 服务端跨业务模块仅允许导入对方的 `../<module>/index.js` 公开出口。

### 2.2 命名与排版

| 对象                   | 风格                               | 示例                                            |
| ---------------------- | ---------------------------------- | ----------------------------------------------- |
| 类型、组件             | `PascalCase`（不加 `I` 前缀）      | `ExpenseDetail`、`SplitEditorSheet`             |
| 函数、变量、JSON 字段  | `camelCase`                        | `parseYuan`、`remainingNetCents`                |
| 业务上限与算法常量     | `UPPER_SNAKE_CASE`                 | `MAX_LEDGER_MEMBERS`、`MAX_IMAGE_BYTES`         |
| 状态、枚举与错误码取值 | `UPPER_SNAKE_CASE`                 | `SETTLING`、`LEDGER_FROZEN`、`VERSION_CONFLICT` |
| 组件文件 / 非组件文件  | `PascalCase.tsx` / `kebab-case.ts` | `ExpenseForm.tsx` / `use-idempotent-write.ts`   |
| 数据库表名与列名       | `snake_case`（实体表用复数）       | `expense_splits`、`amount_cents`                |

- 【强制】格式以 [.prettierrc.json](../.prettierrc.json) 为唯一标准（2 空格、单引号、保留分号、`trailingComma: 'all'`、`printWidth: 100`、UTF-8 + LF）；执行 `pnpm lint`（`--max-warnings=0`）不得留下错误或警告。
- 【推荐】注释只解释业务原因、锁顺序和不变量，不保留废弃注释块或空模板头；单函数超过 80 行、单组件超过 200 行时在审查中评估职责拆分。

### 2.3 金额表示与基准算例

- 【强制】页面输入与展示用元字符串，调用 `@tongzhang/domain` 的 `parseYuan` / `formatYuan` 转换；HTTP JSON 用十进制整数分字符串（字段名带 `Cents` 后缀）；运行时与数据库计算一律使用 TypeScript `bigint` 与 PostgreSQL `BIGINT`，严禁浮点金额计算。

```ts
import { formatYuan, parseYuan } from '@tongzhang/domain';

const amountCents: bigint = parseYuan('120.50'); // 12050n
const dto = { amountCents: amountCents.toString() }; // "12050"
const text = `¥${formatYuan(amountCents)}`; // "¥120.50"
```

- 【强制】分摊、统计、改删恢复与结算测试均须覆盖**“鼓山一日”四人基准账**：小安付食堂 `12000` 分（四人均分）、小白付门票 `12000` 分（四人均分）、小陈付车费 `6000` 分（小安、小陈均分）；总消费 `30000` 分，净额依次 `+3000`、`+6000`、`−3000`、`−6000`；最少转账为小陈→小安 `3000` 分、小丁→小白 `6000` 分（2 笔共 `9000` 分）；登记已还后剩余净额归零，有效消费总额仍为 `30000` 分。

## 3. 移动端（React Native / Expo SDK 57）规范

### 3.1 路由、常驻导航与面板

- 【强制】API 用法遵循 [Expo SDK 57 文档](https://docs.expo.dev/versions/v57.0.0/)，不新增 Web 页面或 Web 构建。路由位于 `apps/mobile/app`，业务实现位于 `apps/mobile/src/features/<模块>`。
- 【强制】主导航 `(app)/(tabs)` 保持底部标签常驻挂载，子栈返回列表使用 `router.dismissTo`；下拉刷新转圈仅由用户主动下拉手势触发，后台核验或静默重取不触发顶部转圈或卸载列表。
- 【强制】分摊编辑、流水筛选、消费改删确认、相机扫码、AI 记账草稿回填、催还确认及错误/断网状态均使用当前页 Sheet、Dialog 或内联状态，不单独新建全屏错误路由。

### 3.2 组件、SVG 图表与原生依赖

- 【强制】使用函数组件与 `FlatList`（以稳定业务 UUID 为 `key`）；移动端只用 `@tongzhang/domain` 做分摊输入预览（准确展示余分），最终分摊与最少转账方案以服务端返回为准。
- 【强制】多维统计图表基于 `react-native-svg` 与主题变量实现，处理零消费空态，避免除零产生 `NaN`。
- 【强制】原生依赖在 `apps/mobile` 通过 `pnpm exec expo install` 安装，不手工编辑 `ios/`、`android/`，不独立升级 `react` / `react-native`。新增扫码相机等原生权限通过 `app.config.ts` 配置并执行 Prebuild 重建；相机或相册拒权时保留当前表单并提供设置引导或手输邀请码降级，禁止白屏。

### 3.3 双令牌、401 门禁与写操作六格状态表

- 【强制】Access Token 仅存内存，Refresh Token 存入 `SecureStore`，严禁写入 `AsyncStorage`、日志或截图。所有写请求禁用离线队列与自动重试。
- 【强制】所有写交互合入前须满足以下六格状态表：

| 状态格                               | 移动端必须满足的行为                                                                         | 服务端库记录约束               |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------ |
| 1. 未登录                            | 拦截在 `(auth)` 区，不渲染上一次账号的业务缓存                                               | 零业务写入                     |
| 2. 收到真实 `401` 或刷新不确定失败   | 清除失效凭据并进入重登门禁，保留存活进程内存中的表单草稿、已传图片引用与原 `Idempotency-Key` | 零新增写入                     |
| 3. 同账号重登并通过 `getMe` 在线核验 | 恢复原内存草稿与原幂等键，等待用户手动点击提交，不自动重发                                   | 用户手动保存后按原键落库一次   |
| 4. 切换另一账号 / 主动放弃 / 退出    | 立即清空上一账号内存表单、图片引用与全部业务 Query 缓存                                      | 严禁将原草稿写入新账号账本     |
| 5. 提交前离线或核验中断网            | 当前页提示断网并保留内存输入；24 小时内手动重试复用原幂等键                                  | 至多存在原键一次记录           |
| 6. 断网或门禁期间迟到的 `200` 响应   | 丢弃过期的成功响应，未经新一轮显式在线核验不得解锁进入业务区                                 | 门禁期间新增消费与转账数为 `0` |

### 3.4 图片与 AI 记账前端边界

- 【强制】上传图片限制为 JPEG/PNG 且 `≤ 1 MiB`，读取走带鉴权的二进制接口并禁用磁盘持久缓存；选图取消时保留已填表单项。
- 【强制】AI 辅助记账在客户端仅将服务端返回的解析建议回填至 `ExpenseForm` 待用户核对修改，**严禁未经用户点击保存按钮直接调用 `A13 createExpense`**。

## 4. 服务端（Fastify 5）规范

### 4.1 契约登记、分层与错误处理

- 【强制】接口方法、路径、认证、幂等、状态码与 Schema 统一维护在 `packages/contracts/src/endpoints.ts`。模块内严格区分 `routes.ts`（协议校验与转发）、`service.ts`（权限、事务 `tx`、行锁、重算与状态机）、`repository.ts`（接收 `db` 或外层 `tx` 执行参数化查询，不私开独立事务）、`mapper.ts`（显式映射 DTO）。
- 【强制】成功 JSON 返回 `{ data }`（分页附 `page.nextCursor`）；异常经统一 `setErrorHandler` 输出 `{ error: { code, message, fieldErrors? }, requestId }`，不泄露 SQL、约束名或堆栈。已转正接口（`A16`、`A17`、`A21`、`A28`、`A29`）合入后彻底移除 `501` 占位。

### 4.2 事务、锁顺序、乐观锁与改写三问

- 【强制】新增或修改账务写接口前须明确三件事：**冻结态（`SETTLING`/`SETTLED`）是否拒绝、已登记 `PAID` 转账如何受影响、幂等键如何重放与判冲**。
- 【强制】写事务统一顺序：**会话与参数检查 → 开启 `tx` 获取幂等锁 → `SELECT ... FOR UPDATE` 锁定所属 `ledgers` 行 → 校验成员角色、账本状态与乐观锁 `version` → 执行业务写入、图片绑定/换绑、账本版本递增、审计与幂等结果保存**。
- 【强制】消费编辑（`A16`）与软删除（`A17`）仅在 `ACTIVE` 状态对记录人或创建者放行；必须校验消费 `version`（过期返 `409 VERSION_CONFLICT`），由服务端按 `@tongzhang/domain` 独立重算整数分分摊并递增 `ledgers.version`；软删除写入 `deleted_at`，所有流水、余额、多维统计与结算查询必须过滤 `deleted_at IS NULL`。

### 4.3 结算、统计、归档与站内催还

- 【强制】**严禁实现跨账本合并结算或部分还款**。成员余额（`A20`）与多维支出统计（`A21`：分类占比、按日趋势、单笔排行、个人已付/应摊对比）不在数据库建汇总缓存表，统一在只读 `REPEATABLE READ` 事务或单一 SQL 快照内实时派生。
- 【强制】个人归档（`A27`）仅在 `SETTLED` 状态更新本人 `ledger_members.archived_at`，不改动任何账务记录与其他成员视图。
- 【强制】站内催还仅在 `ledger.status === 'SETTLING'` 且 `transfer.status === 'PENDING'` 时允许收款人或创建者发起，执行同转账冷却窗口防刷，并遵守付款人 `users.notification_enabled` 偏好设置。

### 4.4 认证、AI 密钥隔离与日志脱敏

- 【强制】口令使用 Argon2id 哈希；JWT 固定 `HS256` 与 `typ=at+jwt` 并回查会话状态；Refresh Token 轮换在会话行锁事务内执行，检测到已消费摘要重用时撤销整条会话。
- 【强制】`AUTH_JWT_SECRET`、数据库连接串及 AI 大模型 API Key 仅存放在服务端未提交的 `.env` 或生产 Compose 环境，**严禁放入移动端配置或 `EXPO_PUBLIC_` 变量**。AI 解析结果须经服务端 Zod Schema 与 `parseYuan` 二次校验并过滤非本账本成员，严禁在解析接口内直接写业务表。日志严禁输出口令、令牌、密钥或图片二进制。

## 5. 数据库（PostgreSQL 17 / Drizzle）规范

- 【强制】表结构集中定义在 `apps/server/src/db/schema/tables.ts`，使用 `(ledger_id, ...)` 复合外键与 `RESTRICT` 策略防止跨账本串改与误级联删除；金额列用 `BIGINT`，发生日期用 `date`，操作时间点用 `timestamptz`。
- 【强制】图片二进制独立存 `image_assets`（`bytea`），业务表只存引用；`pnpm cleanup:images` 清理超时未绑定图片前须先锁候选行并跳过已绑定资产。
- 【强制】表结构变更严格执行：`修改 tables.ts → pnpm generate:db → 人工审查 SQL → 隔离测试库 pnpm migrate:db 与 pnpm test:integration → 提交 Schema 与迁移`。严禁使用 `schema push`，严禁修改已合并迁移，严禁在 API 启动时自动迁移（生产由 `infra/deploy.sh` 在备份后独立执行）。

## 6. 分层测试与交付构建规范

- 【强制】按四层维护测试并按层附提交短哈希汇报，**严禁将不同层通过数相加**：
  1. `pnpm test`：无数据库纯函数、契约 Schema、最少转账 DP 及 AI 解析替身测试（CI 严禁调公网大模型，须用确定性替身覆盖正常与异常返回）。
  2. `pnpm test:mobile`：移动端组件、SVG 图表、扫码拒权与 401 六格门禁测试。
  3. `TEST_DATABASE_URL=... pnpm test:integration`：隔离真实 PostgreSQL 事务、行锁、乐观锁、软删除过滤、鼓山四人账守恒与归档字节一致测试。
  4. 原生客户端实测：新装 APK 验证双账号/四账号完整操作、原生权限与真实网络门禁，记录设备名、提交号并区分“复用安装包”与“新构建安装包”。
- 【强制】冷启动等待超时仅作测试防误杀设置，不混同于产品响应耗时指标；`pnpm export:mobile` 仅验证 JS 导出，不等同于原生编译安装；交付时明确区分依赖本地 `3374`/`8074` 的开发客户端与内嵌 Bundle 连接线上 HTTPS 服务的独立 APK。

## 7. 分支、双人审查与合入检查

- 【强制】从最新 `main` 拉取 `<feat|fix|test|docs|chore|ci>/<Issue编号>-<简短描述>` 分支，不使用 `codex/` 前缀；本人 Git 账号签入，英文提交格式 `type: description`（阶段关联 `Refs #N`，整项完成写 `Closes #N`）；合并优先 `git merge --ff-only`，无法快进用普通 `merge` 保留原作者与时间，未经明确要求不 `rebase`。
- 【强制】PR 描述须交代关联任务、修改内容、实际验证命令/日志，并逐项说明**权限与状态、金额与守恒、事务与幂等、错误码与手册同步**四点事实（不新增仓库级 PR 固定模板文件）。
- 【强制】合入前须有作者之外至少一名留组相邻职责成员在 PR 留下具体书面复核意见；凡改变用户可见行为、启用/新增接口或变更限制范围的 PR，须在同一 PR 内更新 [app-user-guide.md](app-user-guide.md)、[api-reference.md](api-reference.md) 或 [known-limitations.md](known-limitations.md)。
- 【强制】按变更范围执行必跑检查：
  - 任意代码或文档变更：`pnpm check`
  - 领域、契约或服务端变更：`pnpm test`
  - 移动端变更：`pnpm test:mobile`；涉及共享包/路由/配置加跑 `pnpm export:mobile` 与 `pnpm doctor:mobile`；涉及依赖加跑 `pnpm check:mobile-deps`；涉及原生模块或权限配置执行 `pnpm build:android`（或 `pnpm build:ios`）重建并实测
  - 数据库、迁移、事务或统计查询变更：隔离测试库 `pnpm migrate:db` + `pnpm test:integration`
  - 服务端构建与容器部署变更：`pnpm build:server` + `pnpm test:container`
