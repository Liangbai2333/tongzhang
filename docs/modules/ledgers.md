# 账本与成员模块设计

## 1 职责与边界

创建账本、本人列表/历史、详情、成员查询、个人归档；提供共享成员访问与状态策略。

成员关系归本模块所有；邀请模块加入时使用同一tx写成员。所有影响结算的消费或成员变化递增账本version。

当前公共成员检查 `requireLedgerMember(dbOrTx, ledgerId, userId)` 已实现，并从本模块 `index.ts` 导出；其他模块通过该出口复用。详情、成员和归档入口会先检查真实成员身份，非成员/不存在的账本统一拒绝 403。权限/幂等基础验证见 [自动化回归记录](../auth-regression-validation.md)。

**已实现（A05–A08）：** `createLedger`、`listLedgers`、`getLedger`、`listMembers`。**未实现（A27）：** `archiveLedger` 先检查成员身份，再返回 501 `FEATURE_NOT_READY`，由后续个人归档任务实现。

### 联调契约与错误说明

| 接口           | 成功                                                                                              | 说明                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `createLedger` | 201 `{ data: { ledger, invitation } }`                                                            | 必带 `Idempotency-Key`；`coverKey` 与 `coverImageId` 二选一，均已支持；自定义封面必须为本人上传、未绑定的 COVER          |
| `listLedgers`  | 200 `{ data, page: { nextCursor } }`                                                              | `archived=false`（默认）为未个人归档（不限财务状态），`true` 为个人已归档；按加入时间倒序，`cursor` 只用服务端返回的原值 |
| `getLedger`    | 200 `{ data }`，含 `members`、`myPaidCents`、`mySharedCents`、`myNetCents`、`myRemainingNetCents` | 与成员接口、列表摘要来自同一份真实数据                                                                                   |
| `listMembers`  | 200 `{ data: Member[] }`                                                                          | `netCents`、`remainingNetCents` 复用余额模块公式                                                                         |

| HTTP | `error.code`           | 触发                                                            | 前端处理                   |
| ---- | ---------------------- | --------------------------------------------------------------- | -------------------------- |
| 400  | `VALIDATION_ERROR`     | 名称为空/超长、封面同时给出或都没给、缺少或非法幂等键、游标无效 | 留在表单显示字段错误       |
| 401  | `UNAUTHENTICATED`      | 未登录或会话失效                                                | 清除会话并回到登录         |
| 403  | `FORBIDDEN`            | 非成员，或账本不存在（二者响应相同，不泄露账本是否存在）        | 提示无权访问，返回列表     |
| 409  | `IDEMPOTENCY_CONFLICT` | 同一幂等键复用于不同内容                                        | 提示核对原提交，不换键重发 |
| 501  | `FEATURE_NOT_READY`    | `archiveLedger`                                                 | 隐藏入口或提示暂未开放     |

创建事务一次写入账本、可选封面绑定、创建者成员、邀请、审计和幂等结果；任一步失败整体回滚。同一键重放返回首次的响应，不新增账本。

### 个人归档接口边界（后续任务）

`POST /ledgers/:ledgerId/archive`（A27，需 `Idempotency-Key`）只修改当前成员的 `ledger_members.archived_at`，仅允许 `SETTLED` 账本，不改变账本版本与财务状态，也不影响其他成员；成功后该账本从 `listLedgers` 默认列表移到 `archived=true`。本任务不实现，调用时在成员检查通过后返回 501。

| 项目     | 归属                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| 服务端   | `apps/server/src/modules/ledgers/`                                                         |
| 移动端   | `apps/mobile/src/features/ledgers/`                                                        |
| 共享契约 | `packages/contracts/src/ledgers.ts` 与 `endpoints.ts`                                      |
| 数据     | ledgers、ledger_members；创建时invitations、image_assets、operation_logs、idempotency_keys |

## 2 子功能与接口

| 编号 | 操作            | 方法与路径                               | 幂等键 |
| ---- | --------------- | ---------------------------------------- | ------ |
| A05  | `createLedger`  | `POST /api/v1/ledgers`                   | 必需   |
| A06  | `listLedgers`   | `GET /api/v1/ledgers`                    | 不使用 |
| A07  | `getLedger`     | `GET /api/v1/ledgers/:ledgerId`          | 不使用 |
| A08  | `listMembers`   | `GET /api/v1/ledgers/:ledgerId/members`  | 不使用 |
| A27  | `archiveLedger` | `POST /api/v1/ledgers/:ledgerId/archive` | 必需   |

## 3 调用过程

创建者输入名称/封面 → 事务内创建账本 → 锁定并绑定可选临时封面 → 创建首名成员和邀请 → 同事务提交。列表以本人成员关系和archived_at过滤。

## 4 数据规则与事务

创建事务覆盖账本、创建者成员、邀请、封面绑定、审计和幂等结果。个人归档仅允许已结清账本；锁账本并核对SETTLED后更新当前成员archived_at，不改变财务状态。

最多12人；ACTIVE可变更账务，SETTLING冻结，SETTLED只读。requireExpenseEditor允许创建者或原记录人，requireTransferRegistrar允许创建者或转账付款人。

## 5 移动端组织与交互

账本列表、创建、详情、历史为页面；封面选择、更多操作、归档确认使用面板；归档返回原列表并给历史入口。

## 6 开发与验收

建议贯通路径：创建 → 加入三人 → 详情 → 结算结清 → 个人归档。

验收覆盖：重复创建重试、未结清归档、跨账本访问、个人归档不影响其他人、无效封面引用。

## 7 当前操作索引与实测

完整路径、请求/响应字段、错误及双账号 App 步骤见[建账与邀请操作索引](../ledger-invitation-api-guide.md)；当前主线原生实操和 CI 证据见 [Issue #19 验证](../issue19-native-environment-validation.md)。列表 archived 条件是个人归档筛选，不是 ACTIVE 状态筛选。

自定义封面绑定先在事务内插入带临时预设封面的新账本，再锁定 `image_assets` 行，核对上传者、COVER 类型及未绑定状态，写图片 `ledger_id`，最后将账本切换到 `cover_key = NULL`、`cover_image_id = 图片 ID`。这是为满足双向外键安排的事务内顺序，临时预设值不会提交或返回给客户端。不存在/其他用户图片返回 403 `FORBIDDEN`，错误类型/已绑定返回 400 `IMAGE_INVALID`；失败连同成员、邀请、审计及幂等结果整体回滚。同键重放原结果，不重新绑定。实测见 [Issue #29 验证](../cover-cleanup-validation.md)。
