# #108 二级页面下拉刷新当天核对、“鼓山一日”四人算例实操清单与 B03 书面复核

2026-11-17（Beta 冲刺第 2 天）。本记录对应 [#108](https://github.com/Liangbai2333/tongzhang/issues/108)，协助闭环 `B03`（[#104](https://github.com/Liangbai2333/tongzhang/issues/104) / [PR #116](https://github.com/Liangbai2333/tongzhang/pull/116)，整项 4 点）并为 Day 6 `B18` 四人多账号全链路实测提供可复现分步清单。按 [beta-sprint-plan.md](beta-sprint-plan.md) 过程纪律，本文客户端检查属 **Beta Day 2 当天核对**，不等同于 Day 4 中期或 Day 7 最终候选干净环境独立安装正式验收。

---

## 1. Android 客户端二级页面与归档列表当天核对

### 1.1 客户端构建归属与运行环境

- **服务端与 Metro JS 源码提交**：`5890e16`（完整提交 `5890e160954ae42dfe5d5e00a6267ff6a2995718`，含 `B03` 收口提交 `f6c7e72`）。
- **原生客户端标注**：**复用提交号 `9f45c5d` 构建的 Beta 开发客户端 APK**（核对 `git diff 9f45c5d 5890e16 -- apps/mobile/package.json apps/mobile/app.config.ts pnpm-lock.yaml` 无任何原生依赖或原生配置变更）。本次在空白隔离 Android 17（API 37 / ARM64、`1080 × 2400`、`-gpu swiftshader_indirect` 软件渲染）模拟器 `Beta108`（`emulator-5584`）全新安装，宿主机 APK 与设备内 `/data/app/.../com.tongzhang.app.../base.apk` 的 SHA-256 一致：

```text
46bded20357008eca49deda986670bedc190c7ae1078dd5dcacc099a369649dc
```

- **隔离服务与可复现端口映射**：
  - 独立 PostgreSQL 17 容器库 `beta108`（`127.0.0.1:35508`），执行仓库 `pnpm migrate:db` 初始化。
  - 本机真实 Fastify API 监听 `127.0.0.1:3387`，前置本地只读计时转发入口 `127.0.0.1:3388`（原样透传真实状态码、响应头与 JSON 载荷；仅在截图采集在途刷新窗口时对业务 `GET` 响应延后约 `4500 ms`，`/health/*` 与 `/api/v1/me` 不延后），Metro 开发服务监听 `8088`。
  - `adb -s emulator-5584 reverse` 配置 `tcp:3388 -> tcp:3388`、`tcp:8088 -> tcp:8088`（兼容映射 `3374 -> 3388`、`8074 -> 8088`），与宿主机其他并行工作树完全隔离。完整毫秒级请求日志与期末数据库快照见 [runtime-checks.txt](evidence/issue108-secondary-refresh-gushan/runtime-checks.txt)。

### 1.2 二级页面及「我的 → 已归档账本」逐页核对结果

核对账目使用真实 API 在 `beta108` 库录入的“鼓山一日”四人 `30000` 分（`¥300.00`）基准账（账本 ID `9db8c958-9639-4650-b27d-30df2a69b883`）。

| 核对页面 / 路径                                                                   | 切页 / 焦点恢复表现（非手势重取）                                                                                                                                                                                                                                    | 手动下拉手势刷新表现                                                                                                                                                                                                                                                  | 结论与原始截图                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **账本详情页**（`LedgerDetailScreen`）                                            | 首次进入完整展示 `¥300.00` 与 3 笔流水；从消费详情页点「返回」回退触发 `GET /ledgers/:id` 与 `GET /expenses?limit=20` 在途重取期间，原汇总与流水保持挂载，**不误弹顶部下拉转圈**。                                                                                   | 下拉手势同时触发账本头部与 `ExpenseList` 重取，两者均完成后指示器收起。                                                                                                                                                                                               | **通过**。[进行中基线 01](evidence/issue108-secondary-refresh-gushan/01-ledger-detail-gushan-active.png) · [从消费详情返回在途无转圈 19](evidence/issue108-secondary-refresh-gushan/19-ledger-detail-return-from-expense-no-spinner.png)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **消费详情页**（`ExpenseDetailScreen` · 食堂 `¥120.00`）                          | 从账本详情推入及从系统后台切回前台完成 `GET /api/v1/me` 会话恢复期间，4 人人均 `¥30.00` 分摊卡片保持原位，**不误弹下拉转圈**。                                                                                                                                       | 手指下拉触发 `GET /expenses/:expenseId`（在途 `4500 ms`），顶部居中正常弹出圆形刷新指示器且详情内容不闪烁；响应返回 `200` 后指示器立即消失。                                                                                                                          | **通过**。[恢复核验无转圈 02](evidence/issue108-secondary-refresh-gushan/02-expense-detail-focus-refetch-no-spinner.png) · [手势下拉显示转圈 03](evidence/issue108-secondary-refresh-gushan/03-expense-detail-pull-refresh-spinner.png) · [刷新完成收起 04](evidence/issue108-secondary-refresh-gushan/04-expense-detail-pull-settled.png)                                                                                                                                                                                                                                                                                                                      |
| **成员余额页**（`BalancesScreen`）                                                | 先推入「结算预览」再点左上角「返回」回退至余额页，触发真实子栈焦点恢复（`GET /balances` + `GET /ledgers/:id` 在途 `4500 ms`），4 名成员已付/应摊/待收付明细保持可见，**不误弹下拉转圈**。                                                                            | 手指下拉触发 `Promise.all([getBalances, getLedger])`，顶部正常出现圆形刷新指示器；双请求返回 `200` 后指示器收起，数值保持 `¥300.00` / 待转账 `¥90.00`。                                                                                                               | **通过**。[子栈返回在途无转圈 05](evidence/issue108-secondary-refresh-gushan/05-balances-focus-return-no-spinner.png) · [手势下拉显示转圈 06](evidence/issue108-secondary-refresh-gushan/06-balances-pull-refresh-spinner.png) · [刷新完成收起 07](evidence/issue108-secondary-refresh-gushan/07-balances-pull-settled.png)                                                                                                                                                                                                                                                                                                                                     |
| **结算预览页**（`SettlementPreviewScreen` · `ACTIVE`）                            | 从余额页/账本详情进入及前后台恢复核验期间，两笔最少转账预览（`小丁 → 小白 ¥60.00`、`小陈 → 小安 ¥30.00`）稳定展示，**不误弹下拉转圈**。                                                                                                                              | 手指下拉触发 `getLedger` + `previewSettlement` 在途重取：顶部正常显示刷新指示器，**原预览方案保持挂载不闪烁**（已消除旧 `key={generation}` 销毁重建），且底部「正式发起结算」按钮置灰禁用（无障碍节点 `enabled="false"`）防止确认旧 `ledgerVersion`；完成后恢复可点。 | **通过**。[切入与恢复无转圈 08](evidence/issue108-secondary-refresh-gushan/08-settlement-preview-focus-no-spinner.png) · [手势下拉转圈且冻结按钮置灰 09](evidence/issue108-secondary-refresh-gushan/09-settlement-preview-pull-spinner.png) · [刷新完成恢复可点 10](evidence/issue108-secondary-refresh-gushan/10-settlement-preview-pull-settled.png)                                                                                                                                                                                                                                                                                                          |
| **正式结算页**（`SettlementRecordScreen` · `SETTLING` / `SETTLED`）               | 创建者冻结进入 `SETTLING`（`0 / 2 笔已登记 · 待登记 ¥90.00`）、前后台恢复及逐笔「登记已还」完成回调 `query.refetch()` 期间均**不误弹下拉转圈**；整本结清进入 `SETTLED` 后点「历史账单」经 `router.dismissTo` 回退账本详情，不重复入栈。                              | 在「结算中」页手动下拉触发 `getSettlement` + `getLedger` 在途重取，顶部正常展示刷新指示器并在响应完成后收起。                                                                                                                                                         | **通过**。[结算中恢复无转圈 11](evidence/issue108-secondary-refresh-gushan/11-settlement-record-focus-no-spinner.png) · [结算中手势下拉转圈 12](evidence/issue108-secondary-refresh-gushan/12-settlement-record-pull-spinner.png) · [整本结清汇总与历史入口 13](evidence/issue108-secondary-refresh-gushan/13-settlement-settled-summary.png)                                                                                                                                                                                                                                                                                                                   |
| **「我的 → 已归档账本」**（`AccountScreen` ↔ `LedgerListScreen` `view=archived`） | 小安执行个人归档后切至常驻「我的」标签（显示 `我参与的账本 0`、`历史账本 1`）；点「历史账本」跨标签切入已归档列表及从归档账本详情点「返回」回退触发 `GET /ledgers?limit=20&archived=true` 在途重取期间，列表卡片保活、顶部「返回当前账本」置灰防重入且**零误转圈**。 | 在已归档列表手动下拉正常展示顶部圆形刷新指示器，响应完成后收起；点「返回当前账本」写回 `view=current` 后再次从「我的 → 历史账本」进入仍准确切回归档视图；换小白登录验证其当前列表仍保留「鼓山一日 · 已结清」。                                                        | **通过**。[我的历史统计卡 14](evidence/issue108-secondary-refresh-gushan/14-account-tab-history-entry.png) · [跨标签切入在途无转圈 18](evidence/issue108-secondary-refresh-gushan/18-tab-switch-my-to-archived-no-spinner.png) · [详情返回在途无转圈 15](evidence/issue108-secondary-refresh-gushan/15-archived-list-focus-no-spinner.png) · [归档页手势下拉转圈 16](evidence/issue108-secondary-refresh-gushan/16-archived-list-pull-spinner.png) · [刷新完成收起 17](evidence/issue108-secondary-refresh-gushan/17-archived-list-pull-settled.png) · [小白未归档隔离对照 20](evidence/issue108-secondary-refresh-gushan/20-member-bai-unarchived-settled.png) |

---

## 2. “鼓山一日”四人 `30000` 分基准算例多账号分步实操清单（`B18` 前置准备）

本清单严格依据 [product-spec.md](product-spec.md) 与 [code-standards.md](code-standards.md) 第 2.3 节固化，供 Day 6（`B18`）在独立 APK + 线上 HTTPS API 上用四个独立验收测试账号（不计入 ≥ 12 人组外真实用户量）逐项实操复现。

### 2.1 四账号角色与接口权限矩阵

| 账号代号 | 建议用户名 | 建议验收邮箱（示例）     | 账本内角色               | 业务职责与关键操作                                                                                   | 权限边界核对点（服务端强制校验）                                                                          |
| -------- | ---------- | ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 账号 A   | `小安`     | `gushan-an@test.local`   | **创建者**（`creator`）  | 创建「鼓山一日」并获取 6 位邀请码；录入第 1 笔消费（食堂）；发起正式冻结、确认整本结清、执行本人归档 | 唯一可执行 `A10` 重置邀请码、`A23` 正式发起结算、`A26` 确认整本结清；亦可代任意待还转账执行 `A25`         |
| 账号 B   | `小白`     | `gushan-bai@test.local`  | 普通成员（收款方）       | 凭邀请码预览加入；录入第 2 笔消费（鼓山门票）；结清后核对未归档隔离                                  | 在结算预览页不展示冻结入口（直调 `A23`/`A26` 返 `403 FORBIDDEN`）；作为收款人不能对他人付款转账直调 `A25` |
| 账号 C   | `小陈`     | `gushan-chen@test.local` | 普通成员（转账付款方 1） | 凭邀请码预览加入；录入第 3 笔消费（车费）；在 `SETTLING` 登记本人 `小陈 → 小安 3000 分` 已还         | 作为该笔转账 `payerMemberId` 可执行本人转账的 `A25` 登记已还，不可替小丁登记另一笔转账                    |
| 账号 D   | `小丁`     | `gushan-ding@test.local` | 普通成员（转账付款方 2） | 凭邀请码预览加入；零垫付参与前两笔均摊；在 `SETTLING` 登记本人 `小丁 → 小白 6000 分` 已还            | 作为该笔转账 `payerMemberId` 可执行本人转账的 `A25` 登记已还；只读查看全部流水、余额、统计与批次          |

### 2.2 十步多账号客户端实操步骤

1. **四账号独立注册与在线核验（`A01` / `A04`）**
   - 四台设备（或分步切换登录，每次操作前在「我的」核对当前用户名与邮箱）分别注册 `小安`、`小白`、`小陈`、`小丁`，确认进入空账本列表。
2. **创建者建账并获取邀请凭证（`A05` → `A09`）**
   - `小安` 点击右上角「+」→「创建账本」，名称填 `鼓山一日`，选择预设山地封面（或上传 `≤ 1 MiB` 自定义封面），点击「创建并邀请成员」。
   - 核对邀请页：显示「鼓山一日」、「当前 1 / 12 人」、6 位邀请码（不含 `0`/`1`/`I`/`O`）及 `tongzhang:invite:v1:<6位码>` 二维码；此时 `status = ACTIVE`、`ledgers.version = 1`、`expenseTotalCents = "0"`。
3. **三名成员依次加入账本（`A11` → `A12`）**
   - `小白`、`小陈`、`小丁` 依次点击「+」→「加入账本」，输入同一 6 位邀请码（或 `B07` 合入后直接应用内扫码）→「查看账本」预览（确认 `alreadyMember: false, canJoin: true`，预览不改库）→ 点击「加入鼓山一日」。
   - 三人全部加入后，任一端打开右上角成员面板核对「账本成员 · 4 / 12」；此时 `status = ACTIVE`、`ledgers.version = 4`、`expenseTotalCents = "0"`。
4. **录入第 1 笔消费：食堂 `¥120.00`（`A13`，`version: 4 → 5`）**
   - `小安` 在账本详情点「记第一笔」：金额输入 `120`（`12000` 分），名称填 `食堂`，类别选「餐饮」（`DINING`），付款人选 `小安`，分摊方式选「人均」（`EQUAL`）并勾选**全部 4 人**（小安、小白、小陈、小丁，每人预览 `¥30.00` / `3000` 分），点击「保存消费」。
5. **录入第 2 笔消费：鼓山门票 `¥120.00`（`A13`，`version: 5 → 6`）**
   - `小白` 打开「鼓山一日」点「记一笔」：金额输入 `120`（`12000` 分），名称填 `鼓山门票`，类别选「门票」（`TICKET`），付款人选 `小白`，分摊方式选「人均」（`EQUAL`）并勾选**全部 4 人**（每人 `¥30.00` / `3000` 分），点击「保存消费」。
6. **录入第 3 笔消费：车费 `¥60.00`（`A13`，`version: 6 → 7`）**
   - `小陈` 打开「鼓山一日」点「记一笔」：金额输入 `60`（`6000` 分），名称填 `车费`，类别选「交通」（`TRANSPORT`），付款人选 `小陈`，点击「参与分摊」切换为**仅勾选 `小安`、`小陈` 2 人**、分摊方式「人均」（`EQUAL`，两人各 `¥30.00` / `3000` 分；小白、小丁不参与此笔），点击「保存消费」。
7. **核对成员余额与只读结算预览（`A20`、`A22`，不改状态与版本）**
   - 任一普通成员（如 `小白` 或 `小丁`）进入「余额明细」与「结算」预览页：核对总支出 `¥300.00`、成员之间还需转账 `¥90.00`、转账笔数 `2 笔`（`小陈 → 小安 ¥30.00`、`小丁 → 小白 ¥60.00`），且底部提示「只有账本创建者可以发起结算。」，账本仍为 `ACTIVE`、`version = 7`（新增消费仍开放）。
8. **创建者正式发起结算冻结账本（`A23`，`ACTIVE → SETTLING`，`version: 7 → 8`）**
   - `小安` 进入「结算预览」页，点击「正式发起结算」，在「冻结账单，开始结算？」确认面板核对「鼓山一日 · 总支出 ¥300.00 / 需要 2 笔转账，共 ¥90.00」后点击「确认冻结并结算」（请求携带 `expectedVersion: 7`）。
   - 核对冻结结果：状态变为 `SETTLING`（`version = 8`，`settlement_batches.source_version = 7`），账本详情隐藏「记一笔」并提示「消费已冻结，不能再记账」；此时任意消费新增/编辑/删除或新成员加入均须被服务端以 `409 LEDGER_FROZEN` 拦截。
9. **转账付款人分别登记整笔已还（`A25`，保持 `SETTLING` 与 `version = 8`）**
   - `小陈` 进入「结算记录」，找到 `小陈 → 小安 ¥30.00` 点击「登记已还」→「确认登记已还」：核对进度变为 `1 / 2 笔已登记`、`待登记 ¥60.00`，小安与小陈剩余净额先归零，账本总支出仍为 `¥300.00`。
   - `小丁` 进入「结算记录」，找到 `小丁 → 小白 ¥60.00` 点击「登记已还」→「确认登记已还」：核对进度变为 `2 / 2 笔已登记`、`待登记 ¥0.00`，四人 `remainingNetCents` 全部为 `"0"`，但账本仍处于 `SETTLING`（未自动结清），普通成员页面提示「全部登记后，由账本创建者确认结清。」。
10. **创建者确认整本结清与单人归档隔离核对（`A26` → `A27`）**
    - `小安` 刷新「结算记录」，确认「确认整本结清」按钮可用后点击 →「确认结清」：账本进入 `SETTLED`、`ledgers.version = 9`，保存 `settled_at`，展示绿底「账本已结清 · ¥300.00 · 2 笔转账 · 4 位成员」。
    - `小安` 点击「归档账本」→「确认归档」：`鼓山一日` 从小安「全部账本」移入「我的 → 历史账本（已归档账本）」，只读可查流水、余额与结算记录；切换 `小白`、`小陈`、`小丁` 核对，「鼓山一日 · 已结清」仍在三人当前「全部账本」列表中、各自「历史账本」为 `0`，且归档前后财务表字段字节完全一致。

### 2.3 消费拆解、成员净额与最少转账核对表

#### （1）三笔消费录入与整数分分摊表

| 序号 | 消费标题 | 记录人 / 付款人 | 类别（枚举）        | 输入元   | `amountCents` | 分摊模式 | 参与成员与服务端重算 `expense_splits.amount_cents`                      | 录入后 `ledgers.version` |
| ---: | -------- | --------------- | ------------------- | -------- | ------------: | -------- | ----------------------------------------------------------------------- | -----------------------: |
|    1 | 食堂     | 小安 / 小安     | 餐饮（`DINING`）    | `120`    |       `12000` | `EQUAL`  | 小安 `3000`、小白 `3000`、小陈 `3000`、小丁 `3000`（合计 `12000`）      |                      `5` |
|    2 | 鼓山门票 | 小白 / 小白     | 门票（`TICKET`）    | `120`    |       `12000` | `EQUAL`  | 小安 `3000`、小白 `3000`、小陈 `3000`、小丁 `3000`（合计 `12000`）      |                      `6` |
|    3 | 车费     | 小陈 / 小陈     | 交通（`TRANSPORT`） | `60`     |        `6000` | `EQUAL`  | 小安 `3000`、小陈 `3000`（合计 `6000`；小白、小丁不参与）               |                      `7` |
| 合计 | —        | —               | 3 类共 3 笔         | `300.00` |       `30000` | —        | 四人应摊合计 `9000 + 6000 + 9000 + 6000 = 30000` 分（严格守恒，零余分） |                      `7` |

#### （2）四成员全生命周期净额流转核对表（单位：整数分字符串 / 界面展示元）

| 成员 |   已付 `paidCents` | 应摊 `sharedCents` |     冻结快照净额 `netCents` | 冻结刚完成 `remainingNetCents` | 小陈登记 `3000` 后 `remainingNetCents` | 小丁登记 `6000` 后及 `SETTLED` / 归档后 `remainingNetCents` |
| ---- | -----------------: | -----------------: | --------------------------: | -----------------------------: | -------------------------------------: | ----------------------------------------------------------: |
| 小安 | `12000`（¥120.00） |   `9000`（¥90.00） |    `+3000`（待收回 ¥30.00） |      `"3000"`（待收回 ¥30.00） |                        `"0"`（已平衡） |                         `"0"`（已平衡，有效消费仍 `30000`） |
| 小白 | `12000`（¥120.00） |   `6000`（¥60.00） |    `+6000`（待收回 ¥60.00） |      `"6000"`（待收回 ¥60.00） |              `"6000"`（待收回 ¥60.00） |                         `"0"`（已平衡，有效消费仍 `30000`） |
| 小陈 |   `6000`（¥60.00） |   `9000`（¥90.00） |    `−3000`（待支付 ¥30.00） |     `"-3000"`（待支付 ¥30.00） |                        `"0"`（已平衡） |                         `"0"`（已平衡，有效消费仍 `30000`） |
| 小丁 |       `0`（¥0.00） |   `6000`（¥60.00） |    `−6000`（待支付 ¥60.00） |     `"-6000"`（待支付 ¥60.00） |             `"-6000"`（待支付 ¥60.00） |                         `"0"`（已平衡，有效消费仍 `30000`） |
| 守恒 |       合计 `30000` |       合计 `30000` | 代数和 `0`（正项和 `9000`） |      正项和 `9000`（2 笔待还） |              正项和 `6000`（1 笔待还） |     全部 `"0"`（`paidCount = 2/2`，`remainingCents = "0"`） |

#### （3）零和子集 DP（`zero-sum-dp-v1`）最少转账核对与 `sequence` 排序说明

| 转账集合项（无序不变量） | 付款人 `payer` | 收款人 `payee` | 转账金额 `amountCents` | 展示金额     | 算法与实测核对要点                                                                                                                                                                                                           |
| ------------------------ | -------------- | -------------- | ---------------------: | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 零和子集 A               | `小陈`         | `小安`         |               `"3000"` | `¥30.00`     | 子集净额 `(-3000) + (+3000) = 0`，1 笔结清                                                                                                                                                                                   |
| 零和子集 B               | `小丁`         | `小白`         |               `"6000"` | `¥60.00`     | 子集净额 `(-6000) + (+6000) = 0`，1 笔结清                                                                                                                                                                                   |
| **批次汇总**             | —              | —              | **`"9000"`（`2` 笔）** | **`¥90.00`** | 四非零成员可唯一拆分为 2 个互不相交的零和子集，精确最少笔数为 `4 - 2 = 2` 笔（优于任意贪心错配可能产生的 3 笔）。`sequence`（`1` 或 `2`）按各子集最小 `ledger_members.id`（随机 UUIDv4）字典序稳定排列，实测核对集合相等即可 |

#### （4）Day 6 `B18` 数据库快照只读核验 SQL

实测完成后可在目标 PostgreSQL 库执行以下只读 SQL 归档快照证据：

```sql
-- 1. 核对账本终态、版本号（应为 SETTLED, version = 9）与成员归档隔离（仅归档执行者 archived = true）
SELECT l.id, l.name, l.status, l.version, u.username,
       (l.created_by_user_id = u.id) AS is_creator,
       (lm.archived_at IS NOT NULL) AS archived
FROM ledgers l
JOIN ledger_members lm ON lm.ledger_id = l.id
JOIN users u ON u.id = lm.user_id
WHERE l.name = '鼓山一日'
ORDER BY u.username;

-- 2. 核对有效消费总额（3 笔共 30000 分）与分摊明细守恒（10 行共 30000 分）
SELECT COUNT(*) AS active_expenses, COALESCE(SUM(amount_cents), 0) AS expense_total_cents
FROM expenses
WHERE ledger_id = '<LEDGER_ID>' AND deleted_at IS NULL;

-- 3. 核对正式结算批次与两笔 PAID 转账（source_version = 7, transfer_total_cents = 9000, transfer_count = 2）
SELECT sb.source_version, sb.algorithm_version, sb.expense_total_cents,
       sb.transfer_total_cents, sb.transfer_count,
       st.sequence, pu.username AS payer, ru.username AS payee, st.amount_cents, st.status
FROM settlement_batches sb
JOIN settlement_transfers st ON st.batch_id = sb.id
JOIN ledger_members pm ON pm.id = st.payer_member_id
JOIN users pu ON pu.id = pm.user_id
JOIN ledger_members rm ON rm.id = st.payee_member_id
JOIN users ru ON ru.id = rm.user_id
WHERE sb.ledger_id = '<LEDGER_ID>'
ORDER BY st.sequence;
```

---

## 3. 作为第二审查人对 `B03`（`#104` / PR `#116`）的书面核对意见

审查对象：[PR #116](https://github.com/Liangbai2333/tongzhang/pull/116)（提交 `f6c7e72`，合入 `main`），对照 [code-standards.md](code-standards.md) 第 3.1、3.3 节与本次 Android 客户端实操结果逐项复核：

1. **焦点感知下拉刷新与离屏状态清理（`apps/mobile/src/components/Screen.tsx`）**
   - `usePullIndicator(refreshing, Boolean(onRefresh))` 与 `FocusedRefreshControl` 同时约束 `pulled && refreshing && focused && enabled`：页面切入或从子栈返回触发 `useOnlineQuery` / `useFocusEffect` 静默重取时 `pulled === false`，不会误弹顶部刷新转圈；页面失焦（切标签或推入详情页）、`onRefresh` 因忙碌/弹窗置空或组件卸载时立即清理 `pulled` 与 `1000 ms` 兜底定时器，消除了离屏完成刷新后返回页面残留转圈的边界缺陷。
2. **结算预览保活刷新与冻结版本防呆（`apps/mobile/src/features/settlements/screens/SettlementPreviewScreen.tsx`）**
   - 移除 `key={generation}` 子树重建后，下拉刷新同时调用 `onRefreshLedger()` 与 `query.refetch()` 并执行 `write.reset()`，预览卡片保持原位挂载不闪白；同时「正式发起结算」按钮使用 `disabled={busy || ledgerFetching || query.isFetching}`（客户端实操截图 `09` 及 UI 树核验 `enabled="false"`），确保任一查询未落定前无法以旧 `ledgerVersion` 打开确认面板。
3. **跨常驻标签参数同步与各业务页刷新口径统一（`LedgerListScreen`、`AccountScreen`、`LedgerDetailScreen`、`ExpenseList`、`BalancesScreen`、`ExpenseDetailScreen`、`SettlementRecordScreen`、`InvitationScreen`）**
   - `LedgerListScreen` 通过 `selectArchived` 同步写回 `router.setParams({ view: next ? 'archived' : 'current' })`，修复了列表内切回当前账本后再次点击「我的 → 历史账本」因 `view` 参数未变而不切换视图的问题。
   - 各业务页统一改用 `query.isRefetching` 驱动 `refreshing`；`LedgerDetailScreen` 汇总 `query.isRefetching || expensesRefreshing` 等待账本头部与流水首屏共同完成，而分页 `fetchNextPage` 不置位 `isRefetching`，不误触顶部转圈；`SettlementRecordScreen` 已结清态「历史账单」改用 `router.dismissTo` 返回账本详情，避免栈重复增长。
4. **`AppState` 前后台核验降噪与六格状态表合规（`AuthProvider.tsx`、`AppProviders.tsx`、`auth/controller.ts`）**
   - 仅在经历真实 `background` 后回到 `active` 时触发 `restore()` 与 `focusManager.setFocused(true)`，忽略 iOS `inactive` 瞬态；前台直接断网时传入 `NETWORK_UNAVAILABLE` 错误切换至带「重新核验」「退出并返回登录」按钮的显式恢复页，底层页面内存草稿、已上传图片引用与原 `Idempotency-Key` 均原样保留，恢复联网不自动重交写操作，严格满足写操作六格状态表。
5. **审查发现的小细节修复（同单顺带收口）**
   - 在本轮执行 `pnpm export:mobile` 生成 `apps/mobile/.expo/types/router.d.ts`（`typedRoutes`）后再运行 `pnpm check` 时，发现 `f6c7e72` 新增的 `apps/mobile/tests/ledgers-ui.test.tsx:153` 中 `jest.mocked(router.setParams).mockImplementation((next: { view?: string }) => ...)` 与泛型 `Partial<RouteInputParams<T>>` 参数逆变冲突（`TS2345`；裸检出尚未运行 `expo start` / `expo export` 时未生成 `.expo/types` 故 CI 未暴露）。已在本分支将该测试桩收敛为兼容有/无 `.expo/types` 两种环境的类型安全写法，不涉及任何运行时业务逻辑改动。
6. **四项强制审查事实核对结论**
   - **权限与状态**：客户端门禁仍仅在 `status === 'authenticated'` 放行业务请求，不改变服务端权限及 `ACTIVE → SETTLING → SETTLED` 单向状态机。
   - **金额与守恒**：零浮点改动，所有展示仍经 `@tongzhang/domain` 整数分格式化，预览刷新期间冻结按钮锁定最新 `ledgerVersion`。
   - **事务与幂等**：服务端事务与锁顺序未变，前端刷新显式重置空闲写状态而在 `write.uncertain` 期间禁用下拉并保留原幂等键。
   - **错误码与手册同步**：HTTP 契约与错误码无变更，`docs/modules/auth.md` 已同步更新会话恢复说明。

**审查结论**：在补齐上述 `ledgers-ui.test.tsx` `typedRoutes` 测试桩类型兼容后，代码静态检查（含生成 `.expo/types` 前后两次 `pnpm check`）、无数据库单测（`pnpm test` 23 文件 167 项通过）、移动端双端组件测试（`pnpm test:mobile` 24 套件 266 项通过）、JS 导出与 `expo-doctor`（21/21）及 Android 17 客户端二级页面与归档列表实操当天核对全部通过，同意作为 `B03` 收口依据（陈林祺 `@lllin7` 本人账号签收可在此核对记录基础上直接确认）。
