# Issue #171：AI 草稿确定性替身回归审查与消费/解析线上联调核验

日期：2026-11-21（Beta 冲刺第 6 天 · 全链路实测、用户调查与缓冲收口日）  
关联任务：[Issue #171](https://github.com/Liangbai2333/tongzhang/issues/171)（配合闭环 `B17` 6 点并承担 `B20` 消费与 AI 辅助记账跨模块联调边界核验；基线 `origin/main` `5646e70`）  
负责人：饶慧（`@whisper-uoo`）；第二审查人：许雅欣（`@XYX-v`）、李润君（`@range-e`）。

---

## 1. `B17` AI 草稿解析确定性替身与归一化断言复核

作为 `expenses`（`A13～A17` 与 `A31`）模块主作者，逐条复核 [ai-draft-double.test.ts](../apps/server/tests/ai-draft-double.test.ts)、[ai-draft.test.ts](../apps/server/tests/ai-draft.test.ts)、[ai-draft.integration.test.ts](../apps/server/tests/ai-draft.integration.test.ts) 及 [ai-draft-normalizer.ts](../apps/server/src/modules/expenses/ai-draft-normalizer.ts) / [ai-draft-provider.ts](../apps/server/src/modules/expenses/ai-draft-provider.ts)，并对缺口边界补齐 9 项确定性断言（已同步在 [PR #186 审查批注](https://github.com/Liangbai2333/tongzhang/pull/186#issuecomment-7185463721) 归档）：

| 审查维度               | 服务端规则与既有断言核对                                                                                                                                                                                         | 本单补强与复核结论                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 正常结构化草稿         | `EQUAL` / `SHARES` / `AMOUNT` 统一归一化为整数分字符串并通过 `expenseDraftSchema` 强校验；草稿仅回填客户端表单，不直接入账                                                                                       | 符合契约规格                                                                                     |
| 外层与内层非法 JSON    | 上游 HTTP 非法 JSON、空 `choices` 及外层合法但 `message.content` 为残缺 JSON 均映射为 `502 AI_DRAFT_UPSTREAM_ERROR`；非对象负载同样受控拒绝                                                                      | 在 `ai-draft-double.test.ts` 新增 `content: '{"amountCents":'` 残缺内层 JSON 替身断言            |
| 越界与重复成员         | 仅保留当前账本快照内成员，过滤越界 `memberId` 与重复成员并生成中文告警；未知付款人置 `null` 并提示手动选择                                                                                                       | 既有精确断言完整，未放宽预期                                                                     |
| 负数、零与超限总额     | 合法总额严格限制在 `1..999999999` 分，禁止浮点输入，且禁止在 `amountCents` 非法时静默回退读取 `amountYuan` 掩盖错误                                                                                              | 在 `ai-draft.test.ts` 新增负分、零分、超限分、负元、超限元及“非法分+合法元并存”共 6 组参数化断言 |
| 非法 `AMOUNT` 单项分摊 | `AMOUNT` 明细允许 `0` 分但拒绝负数与超限分；明细非法或合计不等于总额时保留合法总额与成员并回退为 `EQUAL`                                                                                                         | 在 `ai-draft.test.ts` 新增负分与超限分 2 组单项分摊降级断言                                      |
| 非本人与已绑定收据图   | 非上传者本人收据返 `403 FORBIDDEN`，已绑定消费（含已软删或跨账本消费）收据返 `400 IMAGE_INVALID`，且拦截发生在调用上游模型之前                                                                                   | 隔离库集成测试已精确断言状态码与 `parseSpy` 零调用                                               |
| 上游异常与未配置降级   | 网络超时 / `5xx` 返 `502 AI_DRAFT_UPSTREAM_ERROR`；未配置 `AI_DRAFT_*` 返 `503 AI_DRAFT_UNAVAILABLE`                                                                                                             | 状态码与错误码精确匹配，无宽泛异常放行                                                           |
| 只读快照与零写库       | [expenses/service.ts](../apps/server/src/modules/expenses/service.ts) 在 `{ isolationLevel: 'repeatable read', accessMode: 'read only' }` 事务内读取成员与未绑定收据，事务结束后再调用模型，全路径无任何写库语句 | 隔离库与线上实测均确认消费、分摊、图片绑定、幂等键、审计与账本 `version` 零变化                  |

---

## 2. 公网云端 HTTPS 下 `A31` 与 `A13～A17` 全链路联调核验

针对已部署上线的 `https://tongzhang.worldboot.net`（服务端接入真实 DeepSeek 模型）执行 `A31` 草稿解析与 `A13～A17` 消费增改删实测，核验后已清理临时联调数据恢复线上库洁净状态：

| 联调步骤                | 实测请求摘要                                                                                    | 实测响应与账务状态核对                                                                                                                                                    | 结论                             |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `A31 parseExpenseDraft` | 双成员账本发送 `"今天小安联调买鼓山门票花了 120 元，2 人均分"`（`referenceDate: "2026-11-21"`） | 返回 `200`：`title="鼓山门票"`、`amountCents="12000"`、`category="TICKET"`、`splitMode="EQUAL"`、2 名成员均分；调用前后账本 `version` 与 `expenseTotalCents="0"` 完全不变 | 通过（真实模型解析与零写库成立） |
| `A13 createExpense`     | 将 `A31` 草稿经人工确认参数携带幂等键提交入账（`12000` 分）                                     | 返回 `201`，服务端独立复核成员与整数分守恒，账本 `expenseTotalCents` 更新为 `"12000"`                                                                                     | 通过                             |
| `A16 updateExpense`     | 携带当前消费 `version` 将金额修改为 `"14000"` 分、标题更新为 `"鼓山门票（含观景台）"`           | 返回 `200`，同事务重算分摊并递增消费与账本 `version`                                                                                                                      | 通过                             |
| `A17 deleteExpense`     | 携带查询参数 `?version=2` 与幂等键软删除单人测试消费（`5000` 分）                               | 返回 `200`，软删除后账本 `expenseTotalCents` 准确回落至 `"0"`，无浮点误差                                                                                                 | 通过                             |

本轮线上与隔离库联调未发现新的后端代码缺陷，无需额外改动 `apps/server/src`。

---

## 3. `AI_DRAFT_*` 服务端密钥隔离核验

1. **服务端环境隔离**：复核 [env.ts](../apps/server/src/config/env.ts)、[compose.prod.yml](../infra/compose.prod.yml) 与阿里云宿主机 `/opt/tongzhang/infra/.env`（文件权限 `600`），`AI_DRAFT_API_BASE_URL`、`AI_DRAFT_API_KEY`、`AI_DRAFT_MODEL` 仅由服务端进程读取；公开接口 `GET https://tongzhang.worldboot.net/api/v1/system/info` 仅返回应用名、币种、最小金额单位与成员上限，零模型配置字段。
2. **移动端源码与独立 APK 核验**：移动端仅使用 `EXPO_PUBLIC_API_BASE_URL`（[expenses/api.ts](../apps/mobile/src/features/expenses/api.ts) 中的 `AI_DRAFT_TIMEOUT_MS` 仅为前端请求超时毫秒常量）；静态扫描 `beta-day6-20261121` 发布的 `tongzhang-ef3cf86-standalone.apk` 全部 `1,492` 个归档条目及 `assets/index.android.bundle`（`4,023,444` 字节），未检出任何 `AI_DRAFT_API_KEY`、`DEEPSEEK_API_KEY` 或线上密钥字面值。

---

## 4. 四层验证结果（严格分层单列，不跨层相加）

| 验证层级                                 | 执行命令                                                               | 结果明细                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 静态检查                                 | `pnpm check`                                                           | 通过（`build:shared`、`typecheck`、`eslint . --max-warnings=0`、`prettier --check .` 全部零告警）       |
| 第 1 层：无数据库单测                    | `pnpm test`                                                            | **26 个测试文件、203 项测试全部通过**（含本单新增的 8 项归一化金额边界与 1 项残缺内层 JSON 替身断言）   |
| 第 2 层：移动端组件测试                  | `pnpm test:mobile`                                                     | **38 个测试套件（iOS / Android 各 19）、382 项测试全部通过**                                            |
| 第 3 层：隔离 PostgreSQL 17 集成测试     | 临时 `postgres:17-alpine` + `pnpm migrate:db && pnpm test:integration` | **25 个测试文件、199 项测试全部通过**；测试后核查 15 张核心公共表行数均为 `0` 行，临时容器已销毁        |
| 第 4 层：线上 HTTPS 实测与原生客户端状态 | 公网 `https://tongzhang.worldboot.net` 接口联调；本单未改原生依赖      | 公网 `A31` 与 `A13～A17` 实测通过且临时数据已清零；独立 APK 原生当天核对与四人实测分别见 `#173`、`#174` |
