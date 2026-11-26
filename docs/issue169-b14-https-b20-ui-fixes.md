# #169 云端 HTTPS 部署切换、移动端界面遗留缺陷修复与独立 APK 产物更新记录

2026-11-21（Beta 冲刺第 6 天 · 全链路实测、用户调查与缓冲收口日）。本记录对应 [#169](https://github.com/Liangbai2333/tongzhang/issues/169)，由饶恩哲（`@Liangbai2333`）收口顺延自 Day 5 的 `B14`（云端 Docker Compose + PostgreSQL 17 + Fastify API + Caddy HTTPS 部署切换与独立 Release Android APK 重签打包）并推进 `B20` 公共缓冲池中的三项已登记移动端界面缺陷修复（`D-142-01`、`D-158-01`、`D-158-02`）；第二审查人为陈林祺（`@lllin7`，交互复核）与詹铖煜（`@sunny-light233`，按说明独立安装核对）。

> **措辞、范围与点数核销声明**（严格遵守 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律）：
>
> 1. **严格区分「当天核对」与「正式验收」**：本单记录公网 HTTPS 连通核验、移动端缺陷修复与独立 APK 重新打包，服务于 Day 6 全链路当天核对与组外用户实操发放，**不称**「正式验收」（Day 4 `B12` 为第一次正式验收，Day 7 `B21` 才称第二次正式验收）。
> 2. **点数核销门禁**：`B14`（整项 `6` 点，自 Day 5 顺延）与 `B20` 关联缓冲工作量须待陈林祺（`@lllin7`）与詹铖煜（`@sunny-light233`）完成复核并留下具体书面审查批注、PR 合入 `main` 后再行核销，严禁未过双关口提前销点。
> 3. **缓冲池不虚增总点数**：`D-142-01`、`D-158-01`、`D-158-02` 均归属既有 `B20`（公共缓冲池 `12` 点）统筹消化，不向冲刺待办池新增点数。

---

## 1. `B14` 云端 HTTPS 生产部署与同机双站点共存核验

### 1.1 部署拓扑与 `infra/deploy.sh` 增强

- **目标主机与域名**：阿里云 ECS（`47.96.226.41`），公开 API 域名 `https://tongzhang.worldboot.net`，与同机既有线上站点 `https://zhihui.worldboot.net` 共享 `80/443` 端口共存。
- **双站无损共存方案**：在不修改仓库标准 [compose.prod.yml](../infra/compose.prod.yml) 的前提下，增强 [deploy.sh](../infra/deploy.sh)：
  1. 当服务器目录存在宿主机专用 `compose.host.yml` 时自动附加 `-f compose.host.yml`，通过外部 Docker 网络接入既有反向代理拓扑，由 Caddy 统一签发并托管 `tongzhang.worldboot.net`（反代 `server:3300`）与 `zhihui.worldboot.net`（反代 `app:3000`）的 Let's Encrypt TLS 证书；
  2. 新增 `DEPLOY_PULL_POLICY`（默认 `always`，支持 `never` 复用已离线导入并校验摘要的不可变镜像），严格保留「`pg_dump` 备份 → `run --rm migrate` 数据库迁移 → `up -d --wait` 启动服务与健康检查」的既定顺序；并在 [deploy.test.mjs](../scripts/tests/deploy.test.mjs) 补充自动化单测覆盖。
- **运行镜像与迁移结果**：
  - 服务端镜像基于 CI 发布摘要 `sha256:a52f8126389a9f816fc6c8b3ad1d099a5d523199c21b4a3dae0ce1ec44f0cade` 与 `node:24-slim` 组装为 `ghcr.io/liangbai2333/tongzhang-server:sha-e09353cf51e63ed2eddbb5e9688c27597b2ac04a`；
  - 执行 `deploy.sh` 完成迁移前 `pg_dump` 备份（落盘于 `/opt/tongzhang/infra/backups/`）、Drizzle 迁移与容器健康等待，`tongzhang-postgres-1`（`healthy`）、`tongzhang-server-1`（`healthy`）、`tongzhang-caddy-1`（`Up`）与同机 `zhihui-prod-app-1`（`healthy`）、`zhihui-prod-db-1`（`healthy`）全部在线。

### 1.2 公网 HTTPS 连通性与密钥隔离核验

| 核验项                | 请求目标                                                    | 实测响应                                                                                     | 结论 |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| 公网数据库就绪探针    | `GET https://tongzhang.worldboot.net/health/ready`          | `HTTP/2 200` `{"data":{"status":"ok","database":"connected"}}`                               | 通过 |
| 公网系统元信息接口    | `GET https://tongzhang.worldboot.net/api/v1/system/info`    | `HTTP/2 200` `{"data":{"name":"同账","currency":"CNY","minorUnit":2,"maxLedgerMembers":12}}` | 通过 |
| 同机既有站点回归      | `HEAD https://zhihui.worldboot.net`                         | `HTTP/2 200`（`via: 1.1 Caddy`）                                                             | 通过 |
| `AI_DRAFT_*` 密钥隔离 | `/opt/tongzhang/infra/.env`、`system/info`、APK 内嵌 Bundle | `AI_DRAFT_*` 仅驻宿主机 `600` 权限 `.env`；公开响应与客户端 Bundle 零密钥字符串              | 通过 |

---

## 2. `B20` 移动端界面遗留缺陷修复明细

针对 Day 4（`#142`）与 Day 5（`#158`）当天核对登记的三项移动端界面遗留问题逐项修复，并新增 [b20-ui-fixes.test.tsx](../apps/mobile/tests/b20-ui-fixes.test.tsx) 回归测试：

| 缺陷编号   | 现象与复现场景                                                                                  | 根因定位                                                                                                                                                                                                                      | 修复方案与涉及文件                                                                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D-142-01` | 输入 6 位邀请码弹出「确认加入这个账本？」底部面板时，背景码框上方叠出原始输入字符残影           | [InviteCodeField.tsx](../apps/mobile/src/features/invitations/components/InviteCodeField.tsx) 覆盖在 6 格视图上的隐藏 `TextInput` 仅设透明字色而未在遮罩面板打开时卸载，Android 原生输入框合成层在 Modal 半透明遮罩下透出文本 | 为 `InviteCodeField` 新增 `overlayOpen` 属性并在 [JoinLedgerScreen.tsx](../apps/mobile/src/features/invitations/screens/JoinLedgerScreen.tsx) 传入 `preview !== null \|\| scanning`，面板或扫码层打开期间卸载底层 `TextInput` 并抑制当前格高亮，同时对 `styles.input` 补充 `opacity: 0` 与 `fontSize: 1` |
| `D-158-01` | 英文系统语言设备上「站内提醒」底部面板时间显示为 `11/21/2026, 2:19:21 PM`，与中文界面混排不一致 | [NotificationsSheet.tsx](../apps/mobile/src/features/profile/components/NotificationsSheet.tsx) 直接调用 `new Date(item.createdAt).toLocaleString()`，受宿主系统 Locale 影响                                                  | 在 [notifications.ts](../apps/mobile/src/features/profile/notifications.ts) 新增无 Locale 依赖的 `formatNotificationTime(iso)`，统一输出 `YYYY-MM-DD HH:mm`（非法时间字符串安全原样回退），并在 `NotificationsSheet.tsx` 替换调用                                                                        |
| `D-158-02` | `1080 × 2400` 屏幕上 AI 草稿回填后提示横幅首行末尾「」」单字折到第二行                          | [ExpenseForm.tsx](../apps/mobile/src/features/expenses/components/ExpenseForm.tsx) 横幅内边距与 `13px` 字号在含左侧图标与间距时超出单行可用宽度                                                                               | 保持提示文案 `"AI 草稿已回填，请核对后手动点击「保存消费」"` 一字不改，收紧 `draftNotice` 水平内边距（`10`）、图标间距（`gap: 6`）与标题字号（`fontSize: 12`、`lineHeight: 18`），并设置 `numberOfLines={1}`                                                                                             |

此外，执行 `pnpm doctor:mobile` 时检出 Expo SDK 57 上游新发布的 9 个补丁小版本（`expo ~57.0.34`、`expo-router ~57.0.32` 等，不涉及 `react` 与 `react-native` 版本变更），已按工程约定执行 `pnpm --filter @tongzhang/mobile exec expo install --fix` 同步更新 [apps/mobile/package.json](../apps/mobile/package.json) 与 [pnpm-lock.yaml](../pnpm-lock.yaml)，`CI=true pnpm check:mobile-deps` 与 `pnpm doctor:mobile`（`21/21`）全部恢复绿灯。

---

## 3. 内嵌线上 HTTPS 域名的独立 Release Android APK 更新与发布

基于包含上述全部修复的代码提交 `ef3cf86`（`ef3cf8607bff38444bd580cb69fcbc2abe7ade05`），使用 Corretto JDK 17 与 Android SDK 重新执行 `pnpm build:apk --api-url https://tongzhang.worldboot.net`：

- **产物文件名**：`tongzhang-ef3cf86-standalone.apk`（`136,832,199` 字节）
- **配套校验文件**：`SHA256SUMS.txt`
  ```text
  ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54  tongzhang-ef3cf86-standalone.apk
  ```
- **产物内嵌校验**：
  - `shasum -a 256 -c SHA256SUMS.txt` 输出 `tongzhang-ef3cf86-standalone.apk: OK`；
  - APK 内置 `assets/index.android.bundle`（`4,023,444` 字节），静态核验已内嵌 `https://tongzhang.worldboot.net`，`usesCleartextTraffic=false`，且不含任何 `AI_DRAFT_API_KEY` / `DEEPSEEK_API_KEY` 等服务端密钥字符串；
  - 可完全脱离本机 Metro 与 `adb reverse` 直连公网 `https://tongzhang.worldboot.net` 工作。
- **可下载发布地址**：GitHub Prerelease [`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121)（含 `tongzhang-ef3cf86-standalone.apk` 与 `SHA256SUMS.txt`，供 `#173`、`#174`、`#176`、`#181` 直接下载校验与安装核对）。

---

## 4. 四层验证结果（严格分层单列，不跨层相加）

| 验证层级                             | 执行命令                                                                                   | 结果明细                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 第一层：静态检查、依赖与导出门禁     | `pnpm check`、`CI=true pnpm check:mobile-deps`、`pnpm doctor:mobile`、`pnpm export:mobile` | 全部通过（`typecheck`、`eslint --max-warnings=0`、`prettier --check .` 零告警；`expo-doctor` `21/21` 通过；Android 与 iOS Hermes Bundle 正常导出） |
| 第二层：无数据库单测（Vitest）       | `pnpm test`                                                                                | `26` 个测试文件、`195` 项测试全部通过（含新增 `deploy.sh` 宿主机叠加编排与拉取策略单测）                                                           |
| 第三层：移动端组件与交互测试（Jest） | `pnpm test:mobile`                                                                         | `38` 个测试套件、`382` 项测试全部通过（含新增 `b20-ui-fixes.test.tsx` 在 Android / iOS 双平台对 `D-142-01`、`D-158-01`、`D-158-02` 的回归验证）    |
| 第四层：集成测试、容器与线上实机核验 | PR CI `integration` + `container` 及阿里云 `deploy.sh` 实机核验                            | 线上 PostgreSQL 17 迁移与 `/health/ready = 200`、双站 HTTPS 共存已实测通过；PR CI 全量运行 PostgreSQL 17 集成测试与生产容器构建探针                |
