# 团队协作规范

技术约束见 [AGENTS.md](AGENTS.md)，安装与启动见 [README.md](README.md)。

## 任务与 Issue

- 系统架构负责人统一创建、分派任务；成员也可以创建问题反馈。
- 每项任务写清负责人、工作内容和可核对的验收标准；已有相同任务就继续使用，不重复创建。
- 负责人在 Issue 更新进展、阻塞和完成结果，附对应 PR、提交或验证记录。

## 分支与提交

从最新 `main` 创建任务分支，一条分支集中完成一个任务：

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/12-create-expense
```

- 分支使用 `<类型>/<Issue编号>-<简短描述>`；无 Issue 时可省略编号。例如 `feat/12-create-expense`、`fix/login-error`、`test/auth`、`docs/setup`；工程与 CI 任务使用 `chore/`、`ci/`。
- 每人使用自己的 Git 姓名、邮箱和 GitHub 账号提交，只提交本次任务相关文件。
- 提交格式：`类型: 修改内容`。常用类型为 `feat`、`fix`、`test`、`docs`、`chore`、`ci`。
- 不随意强制推送或改写已共享的提交；需要整理历史时由系统架构负责人协调。

## PR 与合并

- 成员通过 PR 向 `main` 提交修改，不直接推送 `main`；未完成但需要讨论时使用 Draft PR。
- PR 不使用固定模板，简要写清关联任务、修改内容和实际验证结果；界面改动附截图。
- 按 [AGENTS.md](AGENTS.md) 执行适用检查：代码修改运行 `pnpm check`，业务或基础设施逻辑修改运行对应测试；移动端和依赖改动补充规定检查。
- 系统架构负责人审核，成员在原分支继续修改；检查通过、意见处理完后，由系统架构负责人合并。
- 统一使用 **Rebase and merge** 保持线性历史；合并后删除任务分支，成员同步最新 `main`。

## 关联与完成

- 部分完成使用 `Refs #12` 关联；完整解决任务才使用 `Closes #12`。
- `Closes #12` 可以写在提交信息或 PR 描述中；对应提交进入默认分支 `main` 后自动关闭 Issue。
- 完成后建议在 Issue 留言：`已完成，见 PR #18；验证结果：……`。已关闭的 Issue 也可以留言。
- 任务完整验收通过后才更新为完成，并扣减燃尽图对应点数；未完成的部分继续保留。
