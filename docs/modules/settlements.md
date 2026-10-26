# 结算、转账与结清模块设计

## 1 职责与边界

精确最少笔数预览、正式冻结快照、读取进度、登记整笔已还和整本结清。

归档A27归ledgers；统计A20/A21归balances；本模块仅持有算法与正式结算数据。

| 项目     | 归属                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 服务端   | `apps/server/src/modules/settlements/`                                  |
| 移动端   | `apps/mobile/src/features/settlements/`                                 |
| 共享契约 | `packages/contracts/src/settlements.ts` 与 `endpoints.ts`               |
| 数据     | settlement_batches、settlement_transfers；状态写ledgers，读取消费和分摊 |

## 2 子功能与接口

| 编号 | 操作                | 方法与路径                                                             | 幂等键 |
| ---- | ------------------- | ---------------------------------------------------------------------- | ------ |
| A22  | `previewSettlement` | `GET /api/v1/ledgers/:ledgerId/settlement-preview`                     | 不使用 |
| A23  | `startSettlement`   | `POST /api/v1/ledgers/:ledgerId/settlement`                            | 必需   |
| A24  | `getSettlement`     | `GET /api/v1/ledgers/:ledgerId/settlement`                             | 不使用 |
| A25  | `markTransferPaid`  | `POST /api/v1/ledgers/:ledgerId/settlement/transfers/:transferId/paid` | 必需   |
| A26  | `settleLedger`      | `POST /api/v1/ledgers/:ledgerId/settle`                                | 必需   |

## 3 调用过程

读取净额 → zero-sum-dp-v1预览 → 创建者提交expectedVersion → 锁账本重新核对并计算 → 保存快照冻结 → 登记已还 → 创建者核对全部登记和逐人余额 → 结清。

## 4 数据规则与事务

预览只读不冻结；正式结算、登记、结清分别是完整写事务。正式确认先比对版本，再服务端重算；0笔结果保存批次并直接SETTLED。

算法O(n·2^n)，最多12人。创建者正式结算/结清；付款人或创建者登记。仅整笔登记，重复返回原结果，不改原登记时间；不提供撤销/重开。

## 5 移动端组织与交互

预览与正式结算记录是页面；冻结、已还、结清确认是面板。登记时间直接放记录卡片；复制方案不发写请求。

## 6 开发与验收

建议贯通路径：预览复制 → 正式冻结 → 两笔已还 → 结清。

验收覆盖：贪心反例[-4,-3,-3,6,4]最少3笔、全零、稳定排序、预览过期、并发记账冻结、重复登记、最后一笔与结清竞争。

## 7 当前实现状态

A22 只读预览与 A23 正式结算已接通真实数据库。A23 在幂等事务中按幂等锁 → 账本行锁的顺序执行，锁内重新校验创建者、ACTIVE 状态和 expectedVersion，并复用余额读取与求解器保存净额/转账快照。批次、转账、冻结状态、账本版本、审计和幂等响应原子提交；零转账直接 SETTLED。新增消费使用同一账本行锁，冻结后拒绝写入。后续消费改删也必须遵守该锁和版本约定。

A24、A25、A26 已接通真实 PostgreSQL。A24 在 repeatable-read 只读事务内检查成员并读取唯一正式批次、`netSnapshot`、有序转账和进度；没有批次返回 `404 SETTLEMENT_NOT_FOUND`。A25 仅允许付款人或创建者，按幂等锁 → 账本行锁顺序登记，重复保留原登记人、时间和备注；转账、账本更新时间、审计、幂等结果同事务提交。A26 在同样锁序下校验创建者、全部转账 PAID 及每位成员剩余净额为零，原子写入 SETTLED、结清时间、账本版本、审计和幂等结果；既有零转账已结清批次返回原结清时间。详见 [接口、错误语义与真实数据库验证](../settlement-progress-validation.md)。

移动端 A22 只读预览与复制已接通，正式冻结入口及后续进度/还款/结清流程尚未开放，见 [消费与余额预览验证](../mobile-expenses-validation.md)。权限、回滚、幂等及双向消费竞争的实际数据库验证见[正式结算与账本冻结验证](../settlement-freeze-validation.md)。
