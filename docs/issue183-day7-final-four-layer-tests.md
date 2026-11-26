# Issue #183：Beta Day 7 最终行为候选四层全量封板回归与收官测试基线

日期：2026-11-22（Beta 冲刺 Day 7 · 第二次正式验收与最终交付封板日）  
关联任务：[Issue #183](https://github.com/Liangbai2333/tongzhang/issues/183)（为 `B21` 4 点与 `B22` 4 点最终封板提供全量四层测试背书与 `B21` 四栏格式核准，不重复估点）。  
负责人：李润君（`@range-e`）；第二审查人：饶慧（`@whisper-uoo`）、叶银珍（`@hisoka-morow527`）。

---

## 1. 候选基线与代码冻结边界核验

- **回归执行基线**：`58707d5638600eb2e32d077c10944b9a517ab13d`（合入 `#174` 与 `#181` 后主线业务源码、契约、Schema 与 `infra/` 仍保持 **0 行改动**）。
- **最近已构建并发布的独立 Release Android APK 候选**：
  - 构建提交：`ef3cf8607bff38444bd580cb69fcbc2abe7ade05`（短哈希 `ef3cf86`）
  - GitHub Prerelease：[`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121)
  - 包体文件：`tongzhang-ef3cf86-standalone.apk`（`136,832,199` 字节）
  - 64 位 SHA-256：`ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`
- **行为代码变更边界核对**：执行 `git diff --stat ef3cf86..58707d5 -- apps/ packages/ infra/` 确认，自 `ef3cf86` 至 `58707d5` 之间**仅 4 个服务端测试文件有改动**（`ai-draft-double.test.ts`、`ai-draft.test.ts`、`b17-gates-and-capacity.integration.test.ts`、`settlement-reminder.integration.test.ts`），`apps/mobile/src`、`apps/server/src`、`packages/contracts`、`packages/domain`、Drizzle 迁移与 `infra/` 均为 **0 行改动**。
- **行为树一致性核验**：自独立 APK 构建提交 `ef3cf86` 至当前主线仅上述 4 个服务端测试文件有改动，运行时行为与 `tongzhang-ef3cf86-standalone.apk` 完全同源。

---

## 2. 四层封板回归结果（四行分列，严禁跨层相加）

本轮回归在自 `origin/main`（`58707d5`）新建的干净独立工作树中执行（宿主机：macOS ARM64、Node `v26.13.0`、pnpm `12.6.0`、Docker `29.9.3`）。下列四层计数严格分列，**严禁跨层相加成一个总数**：

| 层                                 | 基线提交  | 执行命令 / 方式                                                                                                                        | 实际结果与原始日志                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. 无数据库测试                    | `58707d5` | `pnpm test`                                                                                                                            | **27 个测试文件、208 项测试全部通过**（耗时 `3.80s`；含 `delivery-audit.test.mjs`、`deploy.test.mjs`、`ai-draft-double.test.ts`、`ai-draft.test.ts`、`settlement.test.ts`、`beta-negative.test.ts` 等）。日志：[layer1-unit.txt](evidence/issue183/layer1-unit.txt)                                                                                                                                                |
| 2. 移动端双平台组件测试            | `58707d5` | `pnpm test:mobile`                                                                                                                     | **38 个测试套件（iOS / Android 各 19）、382 项测试全部通过**（耗时 `36.353s`；含 `b17-401-gates.test.tsx`、`b20-ui-fixes.test.tsx`、`ai-draft-reminder-ui.test.tsx`、`write-recovery.test.tsx` 等）。JS 组件测试不等于原生安装验收。日志：[layer2-mobile.txt](evidence/issue183/layer2-mobile.txt)                                                                                                                 |
| 3. 隔离 `TEST_DATABASE_URL` 集成   | `58707d5` | 临时 `postgres:17-alpine`（PostgreSQL `17.11`，`127.0.0.1:55483`，库名 `tongzhang_test`），`pnpm migrate:db` + `pnpm test:integration` | **25 个测试文件、199 项测试全部通过**（耗时 `8.03s`）；执行前与全部通过后 15 张核心公共表 `COUNT(*)` 均为 **0** 行，临时容器已在退出钩子中销毁清理。日志：[pg17-migrate.txt](evidence/issue183/pg17-migrate.txt)、[layer3-integration.txt](evidence/issue183/layer3-integration.txt)、[pg17-tables-pre.txt](evidence/issue183/pg17-tables-pre.txt)、[pg17-tables-post.txt](evidence/issue183/pg17-tables-post.txt) |
| 4. 原生客户端状态（APK 提交/哈希） | `ef3cf86` | 空白擦除 ARM64 Android 17 模拟器零 Metro / 零 `adb reverse` 全新安装（由 `#181` 执行）                                                 | 独立 Release APK `tongzhang-ef3cf86-standalone.apk`（[`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121)，SHA-256 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`）已在 [#181 第二次正式验收](issue181-b21-second-acceptance.md) 完成三方 SHA-256 一致性校验与直连 `https://tongzhang.worldboot.net` 13 步全链复测通过。                          |

补充静态与交付门禁检查：

- **整仓静态检查（`pnpm check`）**：`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .` 全部通过。
- **交付契约与全仓链接审计（`pnpm check:delivery`）**：`A01～A34` 契约与 [api-reference.md](api-reference.md) 零偏差、全仓 Markdown 本地相对路径与标题锚点 `100%` 命中、活跃交付文档与业务模块零过期 `501` 残留。

---

## 3. 隔离 PostgreSQL 17 执行前后 15 张核心公共表零残留核验

在临时容器 `tongzhang-issue183-pg17`（`PostgreSQL 17.11 on aarch64-unknown-linux-musl`）完成 `pnpm migrate:db` 后、运行 `pnpm test:integration` 前后分别对 `public` 模式全部 15 张核心业务与基础表执行 `SELECT COUNT(*)`，结果完全一致为 `0` 行：

| 序号 | 表名（`public`）       | 执行前行数（`PRE`） | 执行后行数（`POST`） | 原始证据                                                                                                                      |
| ---- | ---------------------- | ------------------: | -------------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `auth_refresh_tokens`  |                   0 |                    0 | [pg17-tables-pre.txt](evidence/issue183/pg17-tables-pre.txt) / [pg17-tables-post.txt](evidence/issue183/pg17-tables-post.txt) |
| 2    | `auth_sessions`        |                   0 |                    0 | 同上                                                                                                                          |
| 3    | `expense_images`       |                   0 |                    0 | 同上                                                                                                                          |
| 4    | `expense_splits`       |                   0 |                    0 | 同上                                                                                                                          |
| 5    | `expenses`             |                   0 |                    0 | 同上                                                                                                                          |
| 6    | `idempotency_keys`     |                   0 |                    0 | 同上                                                                                                                          |
| 7    | `image_assets`         |                   0 |                    0 | 同上                                                                                                                          |
| 8    | `invitations`          |                   0 |                    0 | 同上                                                                                                                          |
| 9    | `ledger_members`       |                   0 |                    0 | 同上                                                                                                                          |
| 10   | `ledgers`              |                   0 |                    0 | 同上                                                                                                                          |
| 11   | `notifications`        |                   0 |                    0 | 同上                                                                                                                          |
| 12   | `operation_logs`       |                   0 |                    0 | 同上                                                                                                                          |
| 13   | `settlement_batches`   |                   0 |                    0 | 同上                                                                                                                          |
| 14   | `settlement_transfers` |                   0 |                    0 | 同上                                                                                                                          |
| 15   | `users`                |                   0 |                    0 | 同上                                                                                                                          |

---

## 4. `B21`（#181）第二次正式验收四栏格式核准结论

对照 [issue181-b21-second-acceptance.md](issue181-b21-second-acceptance.md)（[PR #199](https://github.com/Liangbai2333/tongzhang/pull/199)）及 `docs/evidence/issue181-b21-second-acceptance/` 归档产物逐项核验如下：

| 核查项                  | 核验事实与依据                                                                                                                                                                                                                                                                      | 结论     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1. 四栏结构合规         | 第 3 节主表严格包含「`版本 / 环境 / 步骤 / 结果`」四栏（13 步），版本栏明确锁定行为提交 `ef3cf86`                                                                                                                                                                                   | 核准通过 |
| 2. 干净隔离环境证据     | [adb-isolation-and-sha256.txt](evidence/issue181-b21-second-acceptance/adb-isolation-and-sha256.txt) 与 [runtime-verification.txt](evidence/issue181-b21-second-acceptance/runtime-verification.txt) 记录运行前后本机 `3300/8081` 无监听、`adb reverse --list` 为空、安装前未装旧包 | 核准通过 |
| 3. 三方 SHA-256 一致性  | Release 资产摘要、宿主机 `SHA256SUMS.txt` 与设备 `/data/app/.../base.apk` 均为 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`                                                                                                                                   | 核准通过 |
| 4. 原始日志与截图归档   | 5 份原始日志（含线上库守恒与清理记录）及 `01`～`13` 共 13 张 `1080 × 2400` PNG 全部入库，`pnpm check:delivery` 零断链                                                                                                                                                               | 核准通过 |
| 5. 检验用词与禁加总边界 | 满足干净环境新装与三方哈希一致前提，规范使用“第二次正式验收”措辞，第 5 节分层单列无跨层加总                                                                                                                                                                                         | 核准通过 |

---

## 5. 完成记录

- 负责人：李润君（`@range-e`）；第二审查人：饶慧（`@whisper-uoo`）、叶银珍（`@hisoka-morow527`）。
- 已完成候选基线三层全量回归（无库单测 `27` 文件 `208` 项、移动端双平台 `38` 套件 `382` 项、隔离 PostgreSQL 17 集成 `25` 文件 `199` 项且前后 15 张表 `0` 行残留）及 `B21`（[PR #199](https://github.com/Liangbai2333/tongzhang/pull/199)）四栏格式书面核准。
