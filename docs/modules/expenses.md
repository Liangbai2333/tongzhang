# 消费、流水与分摊模块设计

## 1 职责与边界

新增、按权限修改和软删除消费，维护分摊与收据关联，提供组合筛选。

软删除设置deleted_at，所有汇总排除它。A14按日期、付款人、类别取交集；排序occurred_on、id均降序。

| 项目     | 归属                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 服务端   | `apps/server/src/modules/expenses/`                                                                   |
| 移动端   | `apps/mobile/src/features/expenses/`                                                                  |
| 共享契约 | `packages/contracts/src/expenses.ts` 与 `endpoints.ts`                                                |
| 数据     | expenses、expense_splits、expense_images；关联image_assets、ledgers、operation_logs、idempotency_keys |

## 2 子功能与接口

| 编号 | 操作            | 方法与路径                                             | 幂等键 |
| ---- | --------------- | ------------------------------------------------------ | ------ |
| A13  | `createExpense` | `POST /api/v1/ledgers/:ledgerId/expenses`              | 必需   |
| A14  | `listExpenses`  | `GET /api/v1/ledgers/:ledgerId/expenses`               | 不使用 |
| A15  | `getExpense`    | `GET /api/v1/ledgers/:ledgerId/expenses/:expenseId`    | 不使用 |
| A16  | `updateExpense` | `PATCH /api/v1/ledgers/:ledgerId/expenses/:expenseId`  | 必需   |
| A17  | `deleteExpense` | `DELETE /api/v1/ledgers/:ledgerId/expenses/:expenseId` | 必需   |

## 3 调用过程

填写表单 → 本地Zod校验与domain分摊预览 → 上传可选收据 → 携带幂等键提交 → 服务端重算 → 同事务写入 → 刷新详情、列表、余额、统计和预览。

## 4 数据规则与事务

事务内按账本锁、消费版本、成员和图片归属校验；主记录、分摊、收据绑定、账本版本、审计和幂等结果一起提交。改删消费不能修改记录人。

消费1～999999999分；三种模式EQUAL/SHARES/AMOUNT。付款人可不参与分摊；人数1～12、同账本且不重复；手工金额合计严格相等。

## 5 移动端组织与交互

新增/编辑复用消费表单；分摊方式与金额预览在一个分摊面板完成；筛选、收据预览、删除确认用面板。

## 6 开发与验收

建议贯通路径：三笔消费 → 余额 → 编辑/删除 → 重新核对。

验收覆盖：1分多人、100元三人、2:1份数、重名成员、非法日期、版本冲突、部分成员分摊、删除后所有派生值更新。

## 7 当前移动端范围

已接通 A13 新增、A14 流水与组合筛选/游标分页、A15 详情，以及三种分摊面板、付款人/类别/日期选择、收据上传/授权预览。保存失败保留表单与已上传图片 ID，未知结果只允许显式同键重试。A16/A17 服务端仍未实现，移动端不开放改删。验证与原生截图见 [消费与收据接入验证](../mobile-expenses-validation.md)。
