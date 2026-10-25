# 消费查询、图片与收据绑定阶段验证

关联 [Issue #15](https://github.com/Liangbai2333/tongzhang/issues/15)，T09 / T22 的 10/25 阶段交付，不代表两项冲刺任务全部完成。分支 `feat/15-expense-queries-images`，基于 `main` 的 `2b83e270c00a95c5d26e332b588fd8c63ca73d9d`。

## 本次实际接口

| 接口                                                    | 实际行为                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A13 `POST /api/v1/ledgers/:ledgerId/expenses`           | 保留服务端重算、账本锁、权限及幂等事务；已接入真实收据绑定                                                                 |
| A14 `GET /api/v1/ledgers/:ledgerId/expenses`            | 真实数据库查询；日期区间含两端，付款人、类别取交集；排除软删除；按 `occurred_on DESC, id DESC` 游标分页，最多 50 条        |
| A15 `GET /api/v1/ledgers/:ledgerId/expenses/:expenseId` | 返回真实付款人/记录人名称、分摊、备注、收据 ID、版本和编辑权限；成员可读冻结账本；缺失、软删除或不属于此账本的消费返回 404 |
| A18 `POST /api/v1/images`                               | 真实 multipart 上传，独立 `image_assets.content bytea` 存储；返回图片 ID、实际 MIME、字节数及尺寸                          |
| A19 `GET /api/v1/images/:imageId`                       | 鉴权后返回真实二进制及 MIME，`Cache-Control: no-store`；未绑定仅上传者可读，绑定后重新查账本成员权限                       |

列表、详情和图片读取在只读 repeatable-read 事务中完成权限及数据查询。非成员查询与新增消费均返回 403，不泄露账本内容。列表不包含图片二进制，不通过浮点数计算金额。

## 图片校验与事务边界

- 只接受实际 JPEG / PNG，声明 MIME 必须与解码格式一致。单张 `1..1048576` 字节，宽高各不超过 4096、总像素不超过 16000000，不接受多帧图片。
- Sharp 先查格式、尺寸，再以 `failOn: 'warning'` 强制完整像素解码；仅能读出 metadata 的损坏/截断图片也会拒绝。超限返回 413，非法图片返回 400，不写资产记录。实现依据 [Sharp 构造参数](https://sharp.pixelplumbing.com/api-constructor/) 与 [metadata 只读头部的边界](https://sharp.pixelplumbing.com/api-input/)。
- 上传成功独立提交，保存 SHA-256、真实尺寸和原始字节。所有上传初始均为 `ledger_id = NULL`；可选 multipart `ledgerId` 仅提前检查成员身份和 ACTIVE 状态，不构成绑定，也不会提前授权其他成员读取。
- `ReceiptBinder.bind(tx, ...)` 使用消费 Service 传入的同一个 `tx`。锁顺序为幂等咨询锁 → 账本行 → 图片行；检查图片存在、由当前用户上传、为 RECEIPT、尚未绑定。不存在/其他用户图片返回 403，类型不符/已绑定返回 400。
- 同事务更新图片账本归属、写 `expense_images`、消费、分摊、账本版本、审计和幂等成功结果。原上传不随消费失败回滚，但本次绑定完全回滚。两个账本并发竞争同一收据只能成功一次，不能挪用别的消费收据。
- 相同幂等键重放已有成功结果；不同键再次引用已绑定图片被拒绝。写操作仍只由用户显式重试。

## 调用方式

消费收据：使用现有移动端 `imagesApi.upload({ kind: 'RECEIPT', ledgerId }, nativeImage)` 上传，取 `data.imageId` 放入新增消费的 `receiptImageId`，使用一个稳定的 `Idempotency-Key` 提交。保存失败保留图片 ID 和内存表单供手动重试；成功后详情返回同一收据 ID。读取使用 `imagesApi.read(imageId)`，必须携带当前会话，不能当作公开 URL。

账本封面：`imagesApi.upload({ kind: 'COVER' }, nativeImage)` 已可真实上传，并由上传者鉴权预览。最终建账契约使用 `coverImageId`，与 `coverKey` 二选一；但当前主线 `createLedger` 未实现，[PR #21](https://github.com/Liangbai2333/tongzhang/pull/21) 也明确拒绝自定义封面（501）。本次不宣称封面业务绑定完成。后续必须在建账同一事务锁定该用户的未绑定 COVER，更新图片 `ledger_id`，并写入 `ledgers.cover_image_id`，不能把 `ReceiptBinder` 用于封面，也不能仅在上传时填写 `ledgerId` 冒充绑定。

## 实际验证

在独立 worktree 安装冻结锁文件依赖，使用单独的 PostgreSQL 17 容器和专用 `tongzhang_issue15_test` 数据库；没有访问或修改开发库。未新增依赖、共享契约、迁移、移动端路由或原生配置。

| 命令 / 场景                                             | 结果                                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                            | 通过：共享包编译、全工作区类型检查、ESLint、Prettier                                                                        |
| `pnpm test`                                             | 18 个测试文件、112 项无数据库测试通过；包含真实 Sharp JPEG/PNG 解码、伪造 MIME、损坏图片、尺寸与像素上限、恰好 1 MiB 和超限 |
| 显式设置 `TEST_DATABASE_URL` 后 `pnpm test:integration` | 8 个文件、60 项真实数据库集成测试通过                                                                                       |
| `pnpm build:server`                                     | 通过                                                                                                                        |
| 独立副本叠加 PR #21，运行下述端到端用例                 | 1 项真实 HTTP / PostgreSQL 联调通过                                                                                         |

数据库测试覆盖两人 12000 分消费、服务端各分摊 6000、重复及并发请求不多记、非成员读写拒绝、组合筛选、同日分页、软删除、冻结后只读、越账本详情拒绝；同时覆盖真实 multipart/bytea 往返、临时与绑定后读取权限、图片重复绑定、两个账本竞争收据、绑定后异常、版本更新后审计插入失败的完整回滚，以及回滚后使用原幂等键显式重试。

### 与建账和成员模块联调

联调依赖 PR #21 的 `7b97e2eb4cbe67a860c72c12d78abd51a0bd99eb`。只在临时副本叠加其账本、邀请实现及测试夹具，没有把它的实现并入本分支或更改原工作目录。

完整流程全部通过真实接口执行：注册三个账号 → 建账 → 第二人通过邀请码加入 → 成员接口返回两人 → 上传 JPEG 收据 → 新增 12000 分消费 → 同键重放 → 第二人查询列表和详情 → 第二人读取同一收据。核对列表仅一笔、分摊各 6000、消费总额 12000、付款人净额 +6000、另一人净额 −6000；第三人查询消费、读取收据和新增均为 403。

可执行联调用例保存在 [pr21-ledger-flow.patch](evidence/expense-images/pr21-ledger-flow.patch)，用于独立验证副本，不直接应用到当前主线（主线缺少建账实现）。重现方式：

1. 将本分支当前提交用 `git archive` 导出到临时目录。
2. 在该副本叠加上面 PR #21 提交中的 `apps/server/src/modules/ledgers`、`apps/server/src/modules/invitations`、`apps/server/src/modules/index.ts` 和 `apps/server/tests/fixtures/integration.ts`。模块注册处保留 `createImagesService(app.db.orm)`，消费服务使用本分支的真实默认收据 Binder。
3. 在副本执行 `git apply docs/evidence/expense-images/pr21-ledger-flow.patch`，再执行 `pnpm install --frozen-lockfile && pnpm build:shared`。
4. 显式配置独立测试库 `TEST_DATABASE_URL`，执行 `pnpm exec vitest run --config vitest.integration.config.ts apps/server/tests/issue15-ledger-flow.integration.test.ts`。

## 尚未接通

- 当前主线的建账、成员与邀请业务依赖 PR #21；本分支自身的消费和图片集成测试使用真实数据库夹具创建账本/成员，不能据此声称已交付建账 API。
- 自定义封面的最终业务绑定、消费修改/删除及原收据保留/替换逻辑、超过 24 小时未绑定图片的定时清理尚未实现。
- 移动端已有上传/读取 API 封装，本次没有实现选图、压缩及收据展示界面，没有执行原生安装或真机验收。
- 未推送、未创建 PR、未合并，也未更新 Issue 完成状态或燃尽点数；这些阶段验证不代表 T09 / T22 整项验收完成。
