# Issue #137：B13 客户端接入准备、B14 部署与独立 APK 链路核对记录

日期：2026-11-19（Beta 冲刺 Day 4）  
关联任务：[Issue #137](https://github.com/Liangbai2333/tongzhang/issues/137)（推进 `B13` 6 点与 `B14` 6 点接入及部署准备，计划 2026-11-20 完成；按冲刺规则今日不重复估点、不提前预扣整项点数）。  
负责人：饶恩哲（`@Liangbai2333`）  
第二审查人：陈林祺（`@lllin7`）、詹铖煜（`@sunny-light233`）

---

## 1. B13 移动端客户端接入准备（A31 / A32 / A33 / A34）

### 1.1 客户端接口绑定与模块入口

| 接口  | 操作名                 | 客户端入口                                                                                                                                                                                                                     | 说明                                                                                                                       |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `A31` | `parseExpenseDraft`    | [expenses/api.ts](../apps/mobile/src/features/expenses/api.ts)、[expenses/ai-draft.ts](../apps/mobile/src/features/expenses/ai-draft.ts)                                                                                       | 只读草稿解析；通过 `applyExpenseDraftToForm` 仅回填 `ExpenseForm` 可编辑状态，**严禁直写库或自动调用 `A13 createExpense`** |
| `A32` | `remindTransfer`       | [settlements/api.ts](../apps/mobile/src/features/settlements/api.ts)、[settlements/reminder.ts](../apps/mobile/src/features/settlements/reminder.ts)、[settlements/model.ts](../apps/mobile/src/features/settlements/model.ts) | 结算页内嵌 `remind-confirm` 面板（不新建全屏路由）；使用 `useIdempotentWrite` 生成并持有稳定 `Idempotency-Key`             |
| `A33` | `listNotifications`    | [profile/api.ts](../apps/mobile/src/features/profile/api.ts)、[profile/query-keys.ts](../apps/mobile/src/features/profile/query-keys.ts)、[profile/notifications.ts](../apps/mobile/src/features/profile/notifications.ts)     | 支持游标分页与 `unreadOnly` 筛选，点击条目经 `notificationTargetRoute` 直达 `/ledgers/[ledgerId]/settlement`               |
| `A34` | `markNotificationRead` | [profile/api.ts](../apps/mobile/src/features/profile/api.ts)、[profile/notifications.ts](../apps/mobile/src/features/profile/notifications.ts)                                                                                 | 仅提醒接收人本人标记已读；客户端 `applyNotificationRead` 幂等保留首次 `readAt`                                             |

### 1.2 状态流转与权限口径

1. **记账页 AI 草稿回填（`A31 → ExpenseForm → A13`）**：
   - 状态流转：`idle → parsing → prefilled | degraded | error`；
   - 金额通过 `@tongzhang/domain` 的 `formatYuan(BigInt(amountCents))` 转换，全程无浮点；
   - 草稿字段为 `null` 时保留表单当前输入；若上游异常包含非当前账本成员 ID，客户端再次兜底过滤并追加告警提示，由用户人工核对后手动点击「保存」走 `A13` 落库。
2. **结算页一键催还（`A32`）**：
   - `canRemindTransfer` 与服务端 [remind.ts](../apps/server/src/modules/settlements/remind.ts) 严格对齐：仅 `ledger.status === 'SETTLING'` 且 `transfer.status === 'PENDING'`，且当前成员非付款人本人，同时为该笔收款人或账本创建者时显示催还入口；
   - 成功返回 `{ remindedAt, cooldownEndsAt }` 后由 `isReminderInCooldown` 在 6 小时冷却窗口内禁用重复触发；提示文案绝不泄露对方 `notification_enabled` 偏好。
3. **站内提醒列表与已读（`A33 / A34`）**：
   - 列表与未读筛选通过 `profileKeys.notifications(userId, unreadOnly)` 隔离缓存，切换账号或退出时随 `['user', userId]` 清理；
   - 点击提醒标记已读并跳转对应账本结算页，无 APNs/FCM 或外部推送依赖（遵守 `X05` 零点边界）。

### 1.3 错误码映射与写操作六格状态表对齐（全链路 `autoRetry: false`）

| 接口      | HTTP / 错误码                                               | 客户端反馈类型         | 表单/幂等键与六格状态表约束                                                                                                        |
| --------- | ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `A31`     | `503 AI_DRAFT_UNAVAILABLE`                                  | `unavailable`          | 保留当前表单输入，提示服务端未启用 AI 辅助记账，引导手工填写；`autoRetry: false`、`manualRetryAllowed: false`                      |
| `A31`     | `502 AI_DRAFT_UPSTREAM_ERROR`                               | `upstream_error`       | 保留当前表单与收据，提示解析服务暂不可用，允许用户手动点击重试或手工填写；`autoRetry: false`                                       |
| `A31`     | `409 LEDGER_FROZEN`                                         | `frozen`               | 保留当前提示，引导「刷新账本状态」；`autoRetry: false`                                                                             |
| `A31`     | `400 IMAGE_INVALID` / `VALIDATION_ERROR`                    | `validation`           | 保留表单输入，提示核对文本或重选收据图片；`autoRetry: false`                                                                       |
| `A31`     | `401 UNAUTHENTICATED`                                       | `unauthenticated`      | 触发 401 门禁（六格第 2/3 格），保留存活进程内存表单，同账号 `getMe` 核验恢复后须手动重触发                                        |
| `A31`     | `REQUEST_TIMEOUT` / `NETWORK_ERROR`                         | `network`              | 断网不自动重试（六格第 5 格），保留输入，允许手动重试或手工填写                                                                    |
| `A32`     | `429 REMINDER_COOLDOWN`                                     | `cooldown`             | 提示 6 小时冷却期内不可重复催还，**不泄露对方通知开关状态**；`autoRetry: false`                                                    |
| `A32`     | `409 LEDGER_STATE_INVALID`                                  | `state_invalid`        | 提示账本或转账状态已变更，引导「刷新结算页」；`autoRetry: false`                                                                   |
| `A32`     | `409 IDEMPOTENCY_CONFLICT`                                  | `idempotency_conflict` | 提示提交内容与原键不一致，引导「刷新结算页」后重新操作；`autoRetry: false`                                                         |
| `A32`     | `404 TRANSFER_NOT_FOUND`                                    | `not_found`            | 提示未找到该笔待还转账，引导「刷新结算页」；`autoRetry: false`                                                                     |
| `A32`     | `403 FORBIDDEN`                                             | `forbidden`            | 提示仅收款人或非付款人创建者可催还；`autoRetry: false`                                                                             |
| `A32`     | `401 UNAUTHENTICATED`                                       | `unauthenticated`      | 保留备注与原 `Idempotency-Key`（六格第 2/3 格），同账号在线核验恢复后由用户手动再次提交；换账号立即清空（第 4 格）                 |
| `A32`     | `REQUEST_TIMEOUT` / `NETWORK_ERROR` / `>= 500`              | `uncertain`            | 进入不确定态并保留原 `Idempotency-Key`（六格第 5 格），24 小时内仅允许用户手动重试或刷新确认；迟到 `200` 在门禁期间丢弃（第 6 格） |
| `A33/A34` | `403 FORBIDDEN` / `404 NOT_FOUND` / `401` / `NETWORK_ERROR` | 对应枚举               | 全部 `autoRetry: false`，引导手动刷新列表或重新核验会话                                                                            |

---

## 2. B14 云端 HTTPS Compose 与独立 Android APK 链路核对

### 2.1 云端 Docker Compose（PostgreSQL + Fastify API + Caddy HTTPS）自检

1. **发现并修复缺口**：核对 [compose.prod.yml](../infra/compose.prod.yml) 与 [infra/.env.example](../infra/.env.example) 时发现 `x-server` 此前未声明 `AI_DRAFT_API_BASE_URL`、`AI_DRAFT_API_KEY`、`AI_DRAFT_MODEL`、`AI_DRAFT_TIMEOUT_MS` 透传；若云端部署启用 `A31`，容器会静默丢失环境变量。本次已在 `x-server` 显式补充带安全默认空值/超时值的透传，并在 [infra/.env.example](../infra/.env.example) 与 [development.md](development.md) 同步说明（密钥仅驻服务端环境，严禁进入移动端）。
2. **配置与容器核对**：
   - `docker compose --env-file infra/.env.example -f infra/compose.prod.yml config --quiet`（显式提供测试 `AUTH_JWT_SECRET`）通过；
   - `infra/Caddyfile` 保持 `{$API_DOMAIN}` 自动 HTTPS 反向代理至 `server:3300`，API 仅信任 `PROXY_SUBNET` 专用代理网段，数据库位于 `internal: true` 的 `backend` 网络，无宿主机数据库/API 端口暴露；
   - `infra/deploy.sh` 保持「校验 Compose → 锁文件 → 拉镜像 → 等待 PostgreSQL → `pg_dump` 备份 → 独立 `migrate` → 更新 `server`/`caddy` → 公网 HTTPS `/health/ready` 校验」顺序，失败即中止。

### 2.2 脱离本机 Metro 的独立 Android APK 构建脚本与 `SHA256SUMS.txt` 流程

- 新增 [build-android-apk.mjs](../scripts/build-android-apk.mjs) 及根目录命令 `pnpm build:apk`：
  1. 强校验 `APP_VARIANT=production`（使 [app.config.ts](../apps/mobile/app.config.ts) 关闭 `usesCleartextTraffic`）；
  2. 强校验 `EXPO_PUBLIC_API_BASE_URL` 为不含凭据/查询/片段的公网 `https://` 地址，拒绝 `localhost`、`127.0.0.1`、`10.0.2.2` 等回环地址；
  3. 扫描并拒绝在 `EXPO_PUBLIC_*` 中注入疑似密钥变量；
  4. 支持 `--preflight` 预检模式（校验配置与 `infra/` 部署文件，不触发 Gradle）；
  5. 正式构建前检查本机 JDK 17（拒绝 JDK 25 CMake 不兼容）与 `ANDROID_HOME`，依次执行 `pnpm build:shared`、`expo prebuild --platform android --clean`、`./gradlew assembleRelease`（内嵌 JS Bundle 脱离 Metro），并输出 `dist/android/tongzhang-<shortSha>-standalone.apk` 与标准格式 `SHA256SUMS.txt`。
- 本单仅完成构建配置与脚本自检，**尚未执行真实云端上线部署与独立 APK 原生编译安装**（留待 Day 5 `B14` 实操交付）。

---

## 3. Beta Day 4（11-19）`B09～B12` PR 终审与合并跟踪

| 任务  | 点数 | 关联 Issue / PR                                                                                                              | 当前状态                   | 说明                                                                                           |
| ----- | ---: | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `B09` |    8 | [#139](https://github.com/Liangbai2333/tongzhang/issues/139) / PR [#147](https://github.com/Liangbai2333/tongzhang/pull/147) | 已合并 `main`（`eae5095`） | 完成 AI 草稿图文边界加固与零写库验证，已通过双人审查并合入                                     |
| `B10` |    6 | [#140](https://github.com/Liangbai2333/tongzhang/issues/140) / PR [#145](https://github.com/Liangbai2333/tongzhang/pull/145) | 已合并 `main`（`e4929aa`） | 完成催还并发冷却、静默无侧信道与鼓山守恒核对，已通过双人审查并合入                             |
| `B11` |    8 | [#138](https://github.com/Liangbai2333/tongzhang/issues/138) / PR [#146](https://github.com/Liangbai2333/tongzhang/pull/146) | 已合并 `main`（`b859ba9`） | 完成 `A32 → notifications → A33/A34` 端到端集成与 Day 4 站会四格决策记录，已通过双人审查并合入 |
| `B12` |    4 | [#141](https://github.com/Liangbai2333/tongzhang/issues/141)、[#142](https://github.com/Liangbai2333/tongzhang/issues/142)   | 进行中（`OPEN`）           | 待詹铖煜提交干净环境独立安装第一次正式验收记录与陈林祺复核后完成双关口核销                     |

---

## 4. 实际验证结果（四层分列，不跨层相加）

基于最新 `origin/main`（`b859ba9`）新建独立 worktree 分支 `feat/137-ai-reminder-deploy-prep` 执行：

- **静态检查与构建**：
  - `pnpm check`（`build:shared` + `typecheck` + `eslint . --max-warnings=0` + `prettier --check .`）：通过；
  - `pnpm build:server`：通过；
  - `pnpm export:mobile`：Android（1704 modules）与 iOS（1844 modules）JS 导出通过（仅校验 JS 打包，不等同于原生 APK 安装）；
  - `pnpm doctor:mobile`：21/21 项通过；
  - `pnpm build:apk --preflight --api-url https://api.tongzhang.example.com` 与 `docker compose --env-file infra/.env.example -f infra/compose.prod.yml config --quiet`：通过。
- **第 1 层（无数据库测试 `pnpm test`）**：26 个测试文件、191 项测试全部通过（含新增 [standalone-apk.test.mjs](../scripts/tests/standalone-apk.test.mjs) 6 项）。
- **第 2 层（移动端组件/逻辑测试 `pnpm test:mobile`）**：28 个测试套件（iOS + Android）、320 项测试全部通过（含新增 [ai-draft-reminder-prep.test.tsx](../apps/mobile/tests/ai-draft-reminder-prep.test.tsx) 9 项 × 2 平台）。
- **第 3 层（真实 PostgreSQL 集成 / 容器验证）**：本单未改动数据库 Schema、迁移或服务端业务逻辑，未重跑 `pnpm test:integration`；容器配置改动已通过 `docker build` + `pnpm test:container` 全项实测（真实 PostgreSQL 17 两次迁移 15 表、双令牌认证与撤销、`cleanup-images` 临时图清理及 `caddy validate` 均通过）。
- **第 4 层（原生客户端状态）**：本单未修改原生依赖或原生权限配置，未执行 `pnpm build:android` / `pnpm build:apk` 真实原生编译与真机安装。
