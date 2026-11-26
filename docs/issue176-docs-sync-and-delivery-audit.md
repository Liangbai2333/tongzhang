# Issue #176：Day 6 手册与已知限制同日同步及 `B22` 交付契约链接审计脚本预跑记录

日期：2026-11-21（Beta 冲刺第 6 天 · 全链路实测、用户调查与缓冲收口日）  
关联任务：[Issue #176](https://github.com/Liangbai2333/tongzhang/issues/176)（维护 `B16` 文档同日同步纪律；推进 `B22` 前置审计准备，合并 `#194` 后基线 `a3cc0a1`）  
负责人：袁湘湘（`@circlexxl`）；第二审查人：饶恩哲（`@Liangbai2333`）、詹铖煜（`@sunny-light233`）。

> **点数与口径声明**（严格遵守 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律）：
>
> 1. **不提前预扣 `B22` 点数**：`B22`（整项 `4` 点）计划于明日 Day 7（2026-11-22）随最终候选包体封板后核销，本单仅完成 `B22` 前置交付核对审计脚本开发与预跑，**今日不提前扣减 `B22` 4 点**。
> 2. **严格区分「当天核对」与「第二次正式验收」**：同步写入的公网 HTTPS（`https://tongzhang.worldboot.net`）与独立 Release Android APK（`tongzhang-ef3cf86-standalone.apk` / `beta-day6-20261121`）结论均如实标注为 Day 6 当天核对与实测（见 [#169](issue169-b14-https-b20-ui-fixes.md) / [#173](issue173-standalone-apk-https-daily-check.md) / [#174](issue174-b18-gushan-and-b19-survey.md)），不替代 Day 7 `B21` 第二次正式验收。
> 3. **同日同步冻结后 `推迟` 项与诚实反映 `B19` 状态**：已在 [known-limitations.md](known-limitations.md#冻结后-推迟-项清单链回-beta-冲刺规划) 将 `P-158-01` 与 `#174` 实测新登记的 `P-174-01` 同日写入独立表格并链回 [beta-sprint-plan.md](beta-sprint-plan.md)；同时如实注明 `#174` 的 `B19`（`≥ 12` 份组外真实同学现场原话）保持待真人采集回填，未提前编造调查结论。

---

## 1. Day 6 核心交付文档同日同步明细

| 文档                                         | 同步更新内容                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 依据记录                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [README.md](../README.md)                    | 登记阿里云公网 HTTPS 地址（`https://tongzhang.worldboot.net`，`/health/ready = 200`、`/api/v1/system/info = 200`）、GitHub Prerelease [`beta-day6-20261121`](https://github.com/Liangbai2333/tongzhang/releases/tag/beta-day6-20261121) 独立 Release APK（`tongzhang-ef3cf86-standalone.apk` 与 `SHA256SUMS.txt` 校验值 `ece352d613919d11512b8cef74f3a711671d0d6f0065c50d9f42104f471fae54`）与 Day 6 当天核对边界；在验证章节补充 `pnpm check:delivery` 命令入口 | [#169](issue169-b14-https-b20-ui-fixes.md)、[#173](issue173-standalone-apk-https-daily-check.md)                                                                                                                                                                                  |
| [app-user-guide.md](app-user-guide.md)       | 同步 `B14` 公网 HTTPS 地址与 `beta-day6-20261121` 独立 APK 文件名、字节数（`136,832,199` 字节）及 64 位 SHA-256 校验值；更新 Linux / macOS / PowerShell 校验与 ADB 安装示例命令；同步标注 `B20` 三项界面缺陷（`D-142-01`、`D-158-01`、`D-158-02`）已合入并随 `ef3cf86` 打包                                                                                                                                                                                      | [#169](issue169-b14-https-b20-ui-fixes.md)、[#173](issue173-standalone-apk-https-daily-check.md)                                                                                                                                                                                  |
| [known-limitations.md](known-limitations.md) | 同步 Day 6 公网 HTTPS 部署、`D-142-01` / `D-158-01` / `D-158-02` 修复与复测、`#170` 公网多账号隔离复核、`#171` 公网真实 DeepSeek 模型 `A31` 联调与密钥隔离扫描、`#173` 当天核对及 `#174` 四人鼓山全链路实测；新增「冻结后 `推迟` 项清单（链回 Beta 冲刺规划）」同日登记 `P-158-01` 与 `P-174-01` 并如实标注 `B19` 待补录原话口径                                                                                                                                 | [#169](issue169-b14-https-b20-ui-fixes.md)、[#170](issue170-day6-profile-review.md)、[#171](issue171-ai-draft-boundary-review.md)、[#173](issue173-standalone-apk-https-daily-check.md)、[#174](issue174-b18-gushan-and-b19-survey.md)、[#175](issue175-day6-four-layer-tests.md) |

---

## 2. `B22` 交付核对审计脚本实现与预跑结果

新增 [scripts/audit-delivery.mjs](../scripts/audit-delivery.mjs)（在 [package.json](../package.json) 登记为 `pnpm check:delivery`，并由 [delivery-audit.test.mjs](../scripts/tests/delivery-audit.test.mjs) 随 CI `static` 任务的 `pnpm test` 自动执行全仓审计），自动校验三项交付红线：

1. **契约与接口索引零偏差（`A01～A34`）**：直接读取 `@tongzhang/contracts` 导出的 `endpoints`，逐项比对 [api-reference.md](api-reference.md) 全量表中的 34 项接口编号（`A01～A34`）、操作名、HTTP 方法、规范化路径（展开 `L` 前缀）、成功状态码与幂等键标记（`必需` / `—`）。
2. **全仓 Markdown 本地相对链接与标题锚点 `100%` 命中**：递归扫描全仓所有 `.md` 文件（排除 `.git`、`node_modules`、`dist`、`.expo`、`android`、`ios`），忽略代码块与外链，按 GitHub 标题锚点规则（含中文字符与重复分隔符）校验每个本地相对路径及 `#anchor`。
3. **无过期 `501` 残留**：校验 7 份活跃交付文档（`README.md`、`docs/api-reference.md`、`docs/app-user-guide.md`、`docs/known-limitations.md`、`docs/development.md`、`docs/environment-setup.md`、`docs/multi-device-testing.md`）无过期 `501` / `FEATURE_NOT_READY` / `NOT_IMPLEMENTED` 残留，且 `apps/server/src/modules/` 业务模块无 `notReadyHandler` 占位调用。

### 2.1 首次预跑发现并顺手修复的 3 处失效标题锚点

首次在 `origin/main`（`a564568`）预跑审计脚本时，检出历史文档中 3 处指向 [issue142-b12-review-and-b18-b19-prep.md](issue142-b12-review-and-b18-b19-prep.md) 的锚点因 `组外 \`≥ 12\``两侧空格在 GitHub 规则下生成双连字符`--12-`而误写为单连字符`-12-`：

- [issue157-standalone-apk-daily-check.md](issue157-standalone-apk-daily-check.md) 第 67 行、第 100 行
- [issue158-b13-daily-check-and-survey-batch1.md](issue158-b13-daily-check-and-survey-batch1.md) 第 57 行

以上 3 处失效锚点已随本 PR 修正，复跑 `pnpm check:delivery` 全仓零失效通过。

---

## 3. 验证结果（严格分层单列）

| 验证层级                 | 执行命令                                                                        | 结果明细                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 静态检查与格式化         | `pnpm check`                                                                    | 通过（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .` 全绿）                                                                                                                                |
| 交付契约与链接审计       | `pnpm check:delivery`                                                           | 通过（`A01～A34` 契约与 `api-reference.md` `34/34` 零偏差；全仓 `103` 个 Markdown 文件、`1,719` 处本地相对链接与 `59` 处标题锚点 `100%` 命中；`7` 份活跃交付文档与服务端业务模块零过期 `501` 残留）                        |
| 第 1 层：无数据库单测    | `pnpm test`                                                                     | **27 个测试文件、208 项测试全部通过**（含新增 [delivery-audit.test.mjs](../scripts/tests/delivery-audit.test.mjs) 5 项正反用例，覆盖 GitHub 锚点规则、契约偏差拦截、断链/失效锚点拦截、过期 `501` 拦截与当前仓库全量审计） |
| 第 2～4 层测试与原生构建 | 本单仅变更交付文档与审计脚本，未修改移动端/服务端业务源码、数据库迁移或原生依赖 | 不重复宣称重跑移动端组件、隔离库集成或原生打包（沿用基线 `a564568` 既有结果）                                                                                                                                              |
