# Issue #171：AI 草稿确定性替身与消费边界复核

本次复核日期：2026-11-26。基线：`origin/main` `5646e7065339b34eb1b4f36f29b62b38dd15fb75`。关联 `Refs #171`；本文不是 11 月 21 日线上联调的补录证据，不核销 B17/B20 点数。

B17 关联 [PR #186 的具体审查批注](https://github.com/Liangbai2333/tongzhang/pull/186#issuecomment-7185463721) 已提交。批注明确为用户委托的 AI 辅助复核，不替代团队真实成员独立签核。

## 逐条断言审查

对照 `docs/code-standards.md`、消费契约和实际实现，未放宽既有断言。

| 范围                | 实现与断言核对                                                                                                                                      | 本次结论                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 正常结构化草稿      | `ai-draft-double.test.ts` 对 EQUAL/SHARES/AMOUNT 精确断言整数分、成员与模式；`ai-draft.test.ts` 验证 schema 和 AMOUNT 守恒                          | 预期符合契约；解析不等于保存                                                                                     |
| 非法 JSON / 非对象  | provider 将响应 JSON 解析失败映射为 `502 AI_DRAFT_UPSTREAM_ERROR`；normalizer 拒绝 null、数组及标量                                                 | 补充外层合法而模型 content 为残缺 JSON 的替身，区别于原有响应体本身不是 JSON                                     |
| 越界成员            | normalizer 仅允许快照成员，过滤未知和重复分摊成员；未知付款人清空并告警                                                                             | 既有精确断言保持不变                                                                                             |
| 负数、零、超限总额  | 合法总额为 `1..999999999` 分；不允许通过浮点数或非法 cents 回退到有效 yuan 掩盖错误                                                                 | 新增负 cents、零 cents、超限 cents、负 yuan、超限 yuan，以及非法 cents 与有效 yuan 同时出现的 6 组断言           |
| 非法分摊金额        | AMOUNT 分摊允许零，负数与单项超限非法；不满足守恒时退回 EQUAL 并提示                                                                                | 新增负数与单项超限两组断言，确认有效总额保留、成员保留、警告明确                                                 |
| 非本人 / 已绑定收据 | `ai-draft.integration.test.ts` 断言非本人 `403 FORBIDDEN`、已绑定（含软删和其他账本）`400 IMAGE_INVALID`，且 provider 不被调用                      | 源码与既有测试审查；已在本次隔离库回归验证                                                                       |
| 上游与未配置        | 替身及 provider 测试精确断言上游/超时为 `502 AI_DRAFT_UPSTREAM_ERROR`、未配置为 `503 AI_DRAFT_UNAVAILABLE`                                          | 保持错误码与状态码，不依靠宽泛异常断言                                                                           |
| 快照与零写库        | `expenses/service.ts` 的 A31 以 `repeatable read` / `read only` 事务读取权限、成员、本人未绑定收据，事务结束后才调用 provider；本路径无业务写入调用 | 源码审查确认事务配置与 provider 调用位置；本次隔离库集成回归通过，测试检查消费、分摊、绑定、审计、幂等及账本版本 |

## A13～A17 / A31 联调边界

A31 只返回可编辑草稿；A13 手工确认时仍独立验证成员、整数分与图片归属。A16/A17 仅允许 ACTIVE 账本的记录人或创建者，锁账本后检查消费版本，同事务更新收据、分摊、账本版本、审计及幂等结果。冻结后不允许新增键改写；既有 `expense-concurrency.integration.test.ts`、`expense-profile-regression.integration.test.ts` 与 `b15-gushan-closure.integration.test.ts` 覆盖竞态、重放、冲突和鼓山四人账守恒。

本次没有可归因于线上真实模型或四人实操的新缺陷证据，因此不修改业务实现，不声称完成 B14/B18 线上联调。

## AI 配置隔离

静态检查服务端 `src/config/env.ts`、`app.ts`、`infra/compose.prod.yml` 与服务端 `.env.example`：模型凭据由服务端环境注入。移动端 `.env.example` 仅公开 API URL，`app.config.ts` 不读取模型密钥。移动端源码的 `AI_DRAFT_TIMEOUT_MS` 是请求超时常量，不是模型凭据。现有 provider 测试使用虚构密钥和确定性 fetch，覆盖错误信息不包含密钥。

扫描发布 APK 的 1,492 个归档条目和公网 `/api/v1/system/info` 响应，均未匹配 `AI_DRAFT_API_KEY`、`DEEPSEEK_API_KEY`、`AI_DRAFT_BASE_URL` 或 `AI_DRAFT_MODEL`。尚未核对实际部署环境及密钥字面值。

## 本次验证与阻塞

使用临时工具环境 Node `v24.22.3` / pnpm `12.6.0`，在上述基线及本次修改上实际执行：

- 静态检查 `pnpm check`：通过（共享包构建、全仓类型检查、ESLint、Prettier）。
- 第 1 层 `pnpm test`：26 个测试文件、203 项通过；包含新增 8 项参数化金额边界，非法 content 分支并入既有替身用例。
- 第 2 层移动端组件：本任务未运行、未修改移动端。
- 第 3 层专用数据库集成：在仅监听本机的 PostgreSQL 17.12 专用库执行迁移和 `pnpm test:integration`，25 个文件、199 项通过。
- 第 4 层原生安装 / 云端实操：未执行。不同层不加总。

原始本机命令日志保留在独立工作区旁 `issue171-scratch/check.log` 与 `test.log`（临时日志，不提交凭据或声称其为线上证据）。本次集成回归使用专用本地库，未连接共享库或线上库。本任务未执行原生业务操作、云端四人实操或部署密钥字面值核对。并行 #173 已取得历史候选 APK 并对公网 HTTPS 做有限预检，其结果不能代替本任务的四人全链路验证或包体零暴露证明。

本 Issue 保持部分完成；完整闭环仍需线上四人实测、独立 APK 密钥值核验，以及真实相邻职责成员的书面复核。
