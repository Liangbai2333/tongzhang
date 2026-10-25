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
- 图片模块已提供真实 `receiptBinder`，作为 `createExpensesService` 的默认实现；在账本锁之后锁定图片行，校验上传者、RECEIPT 类型及 `ledger_id IS NULL`，再同时更新图片归属、写入 `expense_images`。
- 不再使用 501 占位绑定。不存在或属于其他用户的图片返回 403；类型不符或已绑定返回 400。相同幂等键重放原成功结果，新键不能挪用已绑定收据。
- 上传是先前独立提交的操作；消费失败会回滚本次图片绑定，但保留未绑定上传供手动重试。
- 真实数据库验证覆盖绑定后抛错，以及版本更新后审计写入失败；消费、分摊、图片归属/引用、版本、审计及幂等记录均不残留部分结果。

查询、上传、授权读取、封面调用边界及实际验证结果见 [消费查询与图片阶段验证](expense-images-validation.md)。
