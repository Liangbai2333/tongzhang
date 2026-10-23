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
