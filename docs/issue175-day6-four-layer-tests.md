# Issue #175：收口 AI 替身、催还冷却、满员并发与 401 门禁回归并记录第六日四层测试

日期：2026-11-21（Beta 冲刺 Day 6；本记录于 2026-11-26 在当前 `main` 基线 `ace50a3` 上补跑归档）  
关联任务：[Issue #175](https://github.com/Liangbai2333/tongzhang/issues/175)（闭环 `B17` 整项 6 点，计划 11 月 21 日完成；配合 `B20` 回归把关。第二审查人书面批注和双关口确认前**不提前扣减 `B17` 点数**，因此关联 PR 使用 `Refs` 而非 `Closes`）。

---

## 1. `B17` 四大专项与既有用例对照

`main` 上 Day 4 / Day 5 已合入替身、催还、满员行锁与 401 门禁主干。本单不重复实现已覆盖路径，只补 **第 12 人入座后第 13 人顺序加入** 这一缺口，并按四行禁加总规则记录 Day 6 四层结果。

| 专项                        | 断言要点                                                                                                                       | 既有/本次用例                                                                                                                                                                                                                                                                                                                                        | 备注                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| AI 草稿确定性替身           | 结构化回填；非法/越界/非对象输出；非本人或已绑定 `receiptImageId` 拒绝；上游 `502`、未配置 `503`；`repeatable-read` 只读零写库 | [ai-draft-double.test.ts](../apps/server/tests/ai-draft-double.test.ts)、[ai-draft.test.ts](../apps/server/tests/ai-draft.test.ts)、[ai-draft.integration.test.ts](../apps/server/tests/ai-draft.integration.test.ts)、[ai-draft-notifications-fixture.integration.test.ts](../apps/server/tests/ai-draft-notifications-fixture.integration.test.ts) | 本单未改 `src`                                                                                  |
| 催还越权与 6 小时冷却       | 仅收款人或非付款人创建者；冷却期 `429 REMINDER_COOLDOWN`；金额与账本 `version` 零变化；不泄露 `notification_enabled`           | [settlement-reminder.integration.test.ts](../apps/server/tests/settlement-reminder.integration.test.ts)、[settlement.test.ts](../apps/server/tests/settlement.test.ts)                                                                                                                                                                               | 快照堆序抖动见 [#172](https://github.com/Liangbai2333/tongzhang/issues/172)，不并入本分支       |
| 第 12 人并发满员 + 第 13 人 | 行锁下第 12 席 1×`200` + 其余 `409`；第 13 人顺序加入同样 `409`，不消耗幂等键                                                  | 既有并发见 [b17-gates-and-capacity.integration.test.ts](../apps/server/tests/b17-gates-and-capacity.integration.test.ts)；**本单新增**第 13 人顺序加入用例                                                                                                                                                                                           | Issue 正文写 `LEDGER_MEMBER_LIMIT`，契约与实现锁定为 `409 MEMBER_LIMIT_REACHED`，测试按契约断言 |
| 401 三条门禁                | 同账号保留草稿与原幂等键且不自动提交；迟到 `200` 不越门禁；换账号清空上一账号查询缓存                                          | [b17-401-gates.test.tsx](../apps/mobile/tests/b17-401-gates.test.tsx)；失效令牌后端零写库见同文件隔离库用例                                                                                                                                                                                                                                          | 双端 iOS / Android                                                                              |

---

## 2. 本次代码改动

[b17-gates-and-capacity.integration.test.ts](../apps/server/tests/b17-gates-and-capacity.integration.test.ts) 新增 1 项：账本已有 12 名成员后，第 13 人携带新幂等键调用 `A12 joinLedger`，返回 `409 MEMBER_LIMIT_REACHED`；`ledger_members` 仍为 12 行；该键不写入 `idempotency_keys`；随后 `A11 previewJoin` 为 `memberCount=12, canJoin=false`。

未改动 `apps/server/src`、`apps/mobile/src`、契约或 Schema。

---

## 3. 四层测试结果（四行分列，禁止跨层相加）

基线 `origin/main` `ace50a3`。下列计数在本工作树包含新增 1 项隔离库用例时测得，**严禁跨层相加成一个总数**。

| 层                               | 命令 / 方式                                                                                                           | 实际结果                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 无数据库                      | `pnpm test`                                                                                                           | 26 个文件、194 项：192 项通过；**2 项失败**，均为 `scripts/tests/deploy.test.mjs`（`ENOENT ... calls.log`）。该用例依赖 bash 部署脚本，Windows 本机无法运行；本单未改部署脚本，不据此宣称通过。                                                                                                                                                                                                               |
| 2. 移动端组件                    | `pnpm test:mobile`                                                                                                    | **36 个套件（iOS / Android 各 18）、376 项全部通过**（含 `b17-401-gates.test.tsx`、`ai-draft-reminder-ui.test.tsx`、`ai-draft-reminder-prep.test.tsx`）。JS 组件测试不等于原生安装验收。                                                                                                                                                                                                                      |
| 3. 隔离 `TEST_DATABASE_URL` 集成 | 临时 `postgres:17-alpine`（`127.0.0.1:55432`，库名 `tongzhang_test`），`pnpm test:integration -- --testTimeout=60000` | **25 个文件、199 项全部通过**（`b17-gates-and-capacity.integration.test.ts` 3 项 = 既有 2 项 + 本次 1 项）。测试后 `COUNT(*)` 查询 15 张核心公共表均为 **0** 行。                                                                                                                                                                                                                                             |
| 4. 原生客户端状态                | 本单未执行原生构建或安装                                                                                              | 未改动移动端源码、原生依赖或构建配置，未重建开发客户端或独立 APK。最近已合入中期验收包为 `B12` `b859ba9`；Day 5 独立 Release APK（`e09353c`，SHA-256 `4e844e5a985af0e5db0a52ebc35fbb8850cbb63d741c743a11739b26d897a241`）的公网 HTTPS 连通仍由 [#169](https://github.com/Liangbai2333/tongzhang/issues/169) / [#173](https://github.com/Liangbai2333/tongzhang/issues/173) 实操，本单不登记未执行的新包哈希。 |

运行环境：Windows 11 x64，Node.js `v24.21.0`，pnpm `12.11.2`，Docker `29.9.3`，PostgreSQL 17 Alpine。整仓 `pnpm check:format` 仍可能因 `core.autocrlf=true` 对未改动文件报 CRLF，不属于本次改动；本单测试文件 `prettier --check` 与 `eslint --max-warnings=0` 通过。

---

## 4. 完成记录

- 本单为 `B17` 收口切片与 Day 6 四层记录，不重复估点；`B17`（6 点）待第二审查人饶慧（`@whisper-uoo`）、许雅欣（`@XYX-v`）留下具体书面批注，并由双关口确认后核销。
- 第二审查人书面批注：**须本人在本单 PR 下留下，本文不代写**。
- 詹铖煜当日四栏预检格式核对依赖 [#173](https://github.com/Liangbai2333/tongzhang/issues/173) 提交材料，材料未到前本单不虚构核准结论。
