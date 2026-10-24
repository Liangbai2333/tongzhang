# 消费新增事务边界(T09 / T22)

`createExpense` 在一个事务内按顺序执行:

1. 幂等键咨询锁(`lockIdempotencyKey`)。
2. `authorize`:校验账本成员身份(重放前也会校验)。
3. 重放检查;非重放则继续。
4. `SELECT ... FOR UPDATE` 锁账本行,并要求账本状态为 `ACTIVE`。
5. 校验付款人、每个分摊成员均属于该账本。
6. 服务端用 `@tongzhang/domain` 的 `allocateExpense` 重算分摊,金额为 bigint 整数分。
7. 写入 `expenses`、`expense_splits`,账本 `version + 1`,写 `operation_logs`。
8. 保存幂等成功结果。

任一步失败整体回滚,不留部分记录。

## 与图片模块(T22)的接口

`ReceiptBinder.bind(tx, { ledgerId, expenseId, imageId, userId })` 在第 7 步中、版本更新之前调用。

- 必须使用传入的 `tx`,不得自行开启事务。
- 负责校验图片为该用户上传、类型为 RECEIPT、尚未绑定,并写入 `expense_images`。
- 图片模块未接通前,默认实现返回 501 `FEATURE_NOT_READY`,消费不会在缺少图片的情况下保存成功。
