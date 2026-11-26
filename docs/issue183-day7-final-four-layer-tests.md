# Issue #183：Beta Day 7 最终行为候选四层全量封板回归与收官测试基线

日期：2026-11-22（Beta 冲刺 Day 7 · 第二次正式验收与最终交付封板日）  
关联任务：[Issue #183](https://github.com/Liangbai2333/tongzhang/issues/183)（为 `B21` 4 点与 `B22` 4 点最终封板提供全量四层测试背书与格式核准，不重复估点；因 `#177` 尚未锁定最终 Behavior SHA 且 `#181` 尚未提交 `B21` 关联 PR，本单先归档当前主线候选 `58707d5` 上的三层全量封板回归与隔离库 15 张表前后零残留证据，关联 PR 使用 `Refs #183` 而非 `Closes #183`，**不提前核销 `B21`/`B22` 点数**）。  
负责人：李润君（`@range-e`）；第二审查人：饶慧（`@whisper-uoo`）、叶银珍（`@hisoka-morow527`）。

---

## 1. 候选基线与代码冻结边界核验

- **当前验证基线（`origin/main`）**：`58707d5638600eb2e32d077c10944b9a517ab13d`（短哈希 `58707d5`）。
- **最近已构建并发布的独立 Release Android APK 候选**：
  - 构建提交：`ef3cf8607bff38444bd580cb69fcbc2abe7ade05`（短哈希 `ef3cf86`）
  - GitHub Prerelease：[`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121)
  - 包体文件：`tongzhang-ef3cf86-standalone.apk`（`136,832,199` 字节）
  - 64 位 SHA-256：`ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`
- **行为代码变更边界核对**：执行 `git diff --stat ef3cf86..58707d5 -- apps/ packages/ infra/` 确认，自 `ef3cf86` 至 `58707d5` 之间**仅 4 个服务端测试文件有改动**（`ai-draft-double.test.ts`、`ai-draft.test.ts`、`b17-gates-and-capacity.integration.test.ts`、`settlement-reminder.integration.test.ts`），`apps/mobile/src`、`apps/server/src`、`packages/contracts`、`packages/domain`、Drizzle 迁移与 `infra/` 均为 **0 行改动**。
- **锁定边界声明**：截至本记录归档时，[#177](https://github.com/Liangbai2333/tongzhang/issues/177) 尚未正式锁定最终 Behavior SHA 与最终 GitHub Release；若 `#177` 确认沿用当前行为树且不再改动业务代码、Schema 或原生配置，则本基线三层回归结论继续适用；若后续合入新的行为或原生改动，须在锁定后的最终 Behavior SHA 上重跑补录。

---

## 2. 四层封板回归结果（四行分列，严禁跨层相加）

本轮回归在自 `origin/main`（`58707d5`）新建的干净独立工作树中执行（宿主机：macOS ARM64、Node `v26.13.0`、pnpm `12.6.0`、Docker `29.9.3`）。下列四层计数严格分列，**严禁跨层相加成一个总数**：

| 层                                 | 基线提交  | 执行命令 / 方式                                                                                                                        | 实际结果与原始日志                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 无数据库测试                    | `58707d5` | `pnpm test`                                                                                                                            | **27 个测试文件、208 项测试全部通过**（耗时 `3.80s`；含 `delivery-audit.test.mjs`、`deploy.test.mjs`、`ai-draft-double.test.ts`、`ai-draft.test.ts`、`settlement.test.ts`、`beta-negative.test.ts` 等）。日志：[layer1-unit.txt](evidence/issue183/layer1-unit.txt)                                                                                                                                                                                                                                                                             |
| 2. 移动端双平台组件测试            | `58707d5` | `pnpm test:mobile`                                                                                                                     | **38 个测试套件（iOS / Android 各 19）、382 项测试全部通过**（耗时 `36.353s`；含 `b17-401-gates.test.tsx`、`b20-ui-fixes.test.tsx`、`ai-draft-reminder-ui.test.tsx`、`write-recovery.test.tsx` 等）。JS 组件测试不等于原生安装验收。日志：[layer2-mobile.txt](evidence/issue183/layer2-mobile.txt)                                                                                                                                                                                                                                              |
| 3. 隔离 `TEST_DATABASE_URL` 集成   | `58707d5` | 临时 `postgres:17-alpine`（PostgreSQL `17.11`，`127.0.0.1:55483`，库名 `tongzhang_test`），`pnpm migrate:db` + `pnpm test:integration` | **25 个测试文件、199 项测试全部通过**（耗时 `8.03s`）；执行前与全部通过后 15 张核心公共表 `COUNT(*)` 均为 **0** 行，临时容器已在退出钩子中销毁清理。日志：[pg17-migrate.txt](evidence/issue183/pg17-migrate.txt)、[layer3-integration.txt](evidence/issue183/layer3-integration.txt)、[pg17-tables-pre.txt](evidence/issue183/pg17-tables-pre.txt)、[pg17-tables-post.txt](evidence/issue183/pg17-tables-post.txt)                                                                                                                              |
| 4. 原生客户端状态（APK 提交/哈希） | `ef3cf86` | 本单未执行原生构建或设备/模拟器安装                                                                                                    | 本单未改动业务代码、移动端源码、原生依赖或构建配置。最近已发布独立 Release APK 为 [`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121) 的 `tongzhang-ef3cf86-standalone.apk`（提交 `ef3cf86`，SHA-256 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`，Day 6 当天核对见 [#173](issue173-standalone-apk-https-daily-check.md)）；Day 7 `B21` 第二次正式验收与最终独立 APK 哈希锁定待 `#177`/`#181` 交付，本单不复用 Day 6 当天核对充当第二次正式验收，亦不编造未产出的新包哈希。 |

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

## 4. `B21`（#181）第二次正式验收四栏格式核准状态与核查清单

截至本报告归档时，詹铖煜（`@sunny-light233`）负责的 [#181](https://github.com/Liangbai2333/tongzhang/issues/181)（`B21` 第二次正式验收）尚未创建关联 PR 或提交四栏正式验收报告。依据 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律与 [#175](issue175-day6-four-layer-tests.md) 同口径，**材料未到前本单不虚构或提前签署格式核准结论**。

待 `#181` 提交 PR 后，按以下核查清单逐项核对并在该 PR 下留下具体书面批注，再回填本单收口：

1. **四栏结构合规**：正式验收主表严格包含「`版本 / 环境 / 步骤 / 结果`」四栏（参照 Day 4 首次正式验收 [issue141-b12-first-acceptance.md](issue141-b12-first-acceptance.md) 格式），版本栏写明锁定的最终候选提交号；
2. **干净隔离环境证据**：环境栏明确脱离开发电脑本机 API、Metro 与 `adb reverse`，并留存端口/转发为空的原始日志；
3. **三方 SHA-256 一致性**：宿主机 `SHA256SUMS.txt`、GitHub Release 资产摘要与终验设备 `base.apk` 实测 SHA-256 逐位一致；
4. **原始日志与截图归档**：成功/失败原始日志文件名与路径有效、截图可读、全仓 `pnpm check:delivery` 无断链；
5. **检验用词边界**：仅在满足上述全部前提时使用“第二次正式验收”措辞，且不跨层加总测试数。

---

## 5. 完成记录与审查口径

- 本单仅新增 Day 7 最终行为候选四层回归基线报告与原始测试日志，未修改任何业务代码、契约、Schema 或迁移。
- **待补闭环项**：
  1. 待 `#181`（`B21` 第二次正式验收）提交 PR 后，在对应 PR 留下四栏格式与日志归档书面核准批注并补充批注链接；
  2. 若 `#177` 锁定的最终 Behavior SHA 与本次基线 `58707d5` 不同或发布新独立 Release APK，补充对应提交号与 SHA-256 并按需重跑；
  3. 第二审查人饶慧（`@whisper-uoo`）、叶银珍（`@hisoka-morow527`）书面审查批注须由其本人在本单 PR 下留下，本文不代写。
