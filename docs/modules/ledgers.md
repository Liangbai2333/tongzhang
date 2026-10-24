# 账本与成员模块设计

## 1 职责与边界

创建账本、本人列表/历史、详情、成员查询、个人归档；提供共享成员访问与状态策略。

成员关系归本模块所有；邀请模块加入时使用同一tx写成员。所有影响结算的消费或成员变化递增账本version。

当前公共成员检查 `requireLedgerMember(dbOrTx, ledgerId, userId)` 已实现，并从本模块 `index.ts` 导出；其他模块通过该出口复用。详情、成员和归档入口会先检查真实成员身份，非成员/不存在的账本统一拒绝 403；通过检查后的具体业务仍返回 501，尚未实现账本读写流程。权限/幂等基础验证见 [自动化回归记录](../auth-regression-validation.md)。

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

创建者输入名称/封面 → 锁定可选临时封面 → 创建账本和首名成员 → 生成邀请 → 同事务提交。列表以本人成员关系和archived_at过滤。

## 4 数据规则与事务

创建事务覆盖账本、创建者成员、邀请、封面绑定、审计和幂等结果。个人归档仅允许已结清账本；锁账本并核对SETTLED后更新当前成员archived_at，不改变财务状态。

最多12人；ACTIVE可变更账务，SETTLING冻结，SETTLED只读。requireExpenseEditor允许创建者或原记录人，requireTransferRegistrar允许创建者或转账付款人。

## 5 移动端组织与交互

账本列表、创建、详情、历史为页面；封面选择、更多操作、归档确认使用面板；归档返回原列表并给历史入口。

## 6 开发与验收

建议贯通路径：创建 → 加入三人 → 详情 → 结算结清 → 个人归档。

验收覆盖：重复创建重试、未结清归档、跨账本访问、个人归档不影响其他人、无效封面引用。
