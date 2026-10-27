# Issue #42：已还、结清、个人归档与自定义封面

2026-10-27，关联 [Issue #42](https://github.com/Liangbai2333/tongzhang/issues/42)。从最新远程 `main`（`0cacf94`）创建独立 worktree，分支 `feat/42-settlement-cover`。原工作区未跟踪的冲刺文档未修改。本次接通移动端 A25、A26、A27 和自定义封面；未新增服务端接口、共享契约、依赖、迁移或 Web 构建。

## 界面与交互

以用户指定的 [Figma · 04 — Screens](https://www.figma.com/design/tngbOd0rJkD29C7Qe2r2zh?node-id=1-3) 为实现目标，读取完整设计上下文和截图。复用项目 `Screen`、`Sheet`、`Button`、`Field`、颜色及本地原始图标，不修改 Figma 文件。

| 节点                      | 实现对应                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `5:100` 创建账本          | 保留预设预览、选项和横向上传行，开放真实系统相册；自定义图片是动态业务内容    |
| `96:1451` 登记还款确认    | 白色底部面板、20px 标题、12px 圆角摘要、双方及整笔金额、选填说明、确认与取消  |
| `160:1307` 全部已还待结清 | 实时登记进度、零剩余金额、创建者确认入口                                      |
| `160:1398` 整本结清确认   | 标题及关闭、真实账本与登记笔数、只读说明、确认/返回核对                       |
| `5:274` 已结清            | 薄荷绿摘要、完成图标、总支出、人数/转账数、转账登记元数据、历史账单及归档入口 |
| `96:1677` 归档确认        | 24px 顶部圆角、左侧拖动指示、账本摘要、确认/暂不归档、个人影响说明            |

`settlement-completion/` 的 8 个 SVG 直接从上述上下文下载，分别按 26、7、7、24、20、14、20、20px 根尺寸用于完成、统计点、方向、历史、箭头和归档槽位；未将设计截图作为界面图片。新增批次信息、可选说明、复制、真实长名称换行及故障恢复内容依契约补充，列表不伪造原型分类计数。

登记仅创建者或转账付款人可见，只整笔登记。结清仅创建者可见，全部登记且逐人剩余净额为零才可确认。服务端仍执行最终权限、状态与余额校验。`OnlineWriteSheet` 持有单次内存尝试：提交时防重复点击，未知结果保留原内容/键并阻止关闭，仅允许显式重试或在线核对；核对未完成不会清掉原键。查询失败不展示旧结果为最新数据。无应用层自动重试、持久业务缓存或离线队列。

封面复用收据的选图、JPEG 压缩和临时文件清理链路，以 `COVER` 上传，建账时仅传 `coverImageId`；预设则仅传 `coverKey`。上传成功但创建失败仍保留引用，不再次上传；未知建账结果锁住名称和封面。列表、详情及历史均经鉴权在线读取图片，禁用图片缓存。

归档只修改本人状态。成功返回当前列表并给出历史入口；本人通过 `archived=true` 读取历史，消费、收据、成员和正式批次仍可在线查看；其他成员列表不变。未结清不开放归档。

## Android 完整原生操作

设备为 Android 17 / API 37、`Medium_Phone_API_37.0`、1080×2400 模拟器。业务 JavaScript 从本 worktree Metro `8042` 加载，真实 API 为 `3342`，专用 PostgreSQL 库为 `tongzhang_issue42`，不使用开发业务库。先通过注册接口准备三个独立测试账号，随后甲乙均在 App 输入账号密码正常登录；未注入会话。测试封面与收据标有 TEST DATA ONLY，经设备系统相册选择。

主账本 `74e59955-693b-4333-b9ee-1ba8f0e69ce0`。所有成功业务写入均由 App 完成，没有手工 API 补写用户步骤。补充 HTTP 检查只读取业务结果并验证拒绝越权操作。

| App 步骤                   | 实际结果与原生截图                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 甲登录、选封面、建账       | [登录](evidence/issue42/01-owner-login.png)、[系统相册](evidence/issue42/02-system-cover-picker.png)、[保留名称与压缩预览](evidence/issue42/03-custom-cover-form.png)、[邀请码](evidence/issue42/04-created-invitation.png)；封面压缩为 37140 字节                                                              |
| 乙登录、预览邀请并加入     | [乙登录](evidence/issue42/06-member-login.png)、[预览](evidence/issue42/07-member-join-preview.png)、[加入后授权读取封面](evidence/issue42/08-member-cover-read.png)，真实两名成员                                                                                                                              |
| 乙记 ¥120 人均消费并附收据 | [系统选收据](evidence/issue42/09-receipt-picker.png)、[表单](evidence/issue42/10-expense-receipt-form.png)、[消费详情](evidence/issue42/11-expense-detail.png)、[授权收据](evidence/issue42/12-member-receipt.png)；收据 43782 字节，每人应摊 6000 分                                                           |
| 余额与只读预览             | [余额](evidence/issue42/13-balances.png)、[乙预览无冻结入口](evidence/issue42/14-member-preview-readonly.png)；甲应付 6000 分，乙应收 6000 分                                                                                                                                                                   |
| 甲正式冻结                 | [冻结确认](evidence/issue42/15-owner-freeze-confirm.png)、[未登记不能结清](evidence/issue42/16-pending-cannot-settle.png)；版本 3，唯一正式批次                                                                                                                                                                 |
| 甲整笔登记 ¥60             | [登记确认](evidence/issue42/17-registration-confirm.png)、[全部已登记](evidence/issue42/18-all-paid.png)；备注、登记人和时间真实保存，原消费仍为 ¥120                                                                                                                                                           |
| 创建者确认结清             | [结清确认](evidence/issue42/19-settle-confirm.png)、[未知结果](evidence/issue42/20-settle-unknown.png)、[显式原键重试后结清](evidence/issue42/21-settled.png)                                                                                                                                                   |
| 甲个人归档                 | [归档确认](evidence/issue42/22-archive-confirm.png)、[未知结果保留](evidence/issue42/23-archive-unknown.png)、[在线核对后当前列表移出](evidence/issue42/24-owner-archived-list.png)                                                                                                                             |
| 甲历史读取                 | [历史列表](evidence/issue42/25-owner-history-list.png)、[历史详情](evidence/issue42/26-owner-history-detail.png)、[原正式记录](evidence/issue42/27-owner-history-record.png)、[只读消费](evidence/issue42/28-owner-history-expense-readonly.png)、[历史授权收据](evidence/issue42/29-owner-history-receipt.png) |
| 乙视图不受个人归档影响     | [乙当前列表](evidence/issue42/30-member-current-list-unchanged.png)、[详情](evidence/issue42/31-member-detail-unchanged.png)、[正式记录](evidence/issue42/32-member-settled-record.png)，乙未归档且剩余净额零                                                                                                   |

界面实现提交为 `541e2e1`。01–14 在实现阶段采集，15–32 基于该提交；03 之后涉及的建账/选图代码与该提交一致。33 为原生网络配置修复 `e5a83ca` 重建安装后的读取；34–36 为最终 `2097271` 再次重建后的复测。截图由 `adb exec-out screencap -p` 直接保存，非 Web、设计稿或物理真机截图。系统字体、安全区和 Expo 开发工具浮层保留原生实际状态；请求的 UTC 时间及源码/图片哈希见证据清单。

## 故障恢复与原生网络配置

验收 API 使用临时 `onSend` 测试 hook，仅记录脱敏响应与请求键摘要，正式业务实现、事务及数据库均未替换。结清和归档在业务已提交后将响应改为 503，分别验证显式原键重试和在线核对；该故障响应不充当业务失败回滚或模拟成功。唯一结清时间、唯一登记和单次审计可由数据库核对。

首轮直接断连接测试发现，旧 Android APK 的底层 OkHttp 自动重发 POST。两次登记使用同一键摘要 `6911072bc825`，登记时间和审计仍只有一次；这不能算作用户显式重试通过。针对该实际缺陷新增 Expo config plugin：在 React/Expo 创建客户端前安装共享 OkHttp factory，关闭连接失败重发及自动重定向。首轮关闭重试后，长时间停留系统相册再返回曾遇到空闲连接失效导致核验失败，随后补充禁用空闲连接复用，并修正插件对已生成配置的升级处理；最终重装后选图返回保留表单。插件重复 Prebuild 不重复插入，未知原生模板直接报错；没有手工编辑或提交生成的 `android` 目录。

按工程要求执行 `pnpm build:android`（含 Prebuild、编译、安装），`BUILD SUCCESSFUL in 51s`；补充空闲连接策略后再次构建安装，最终为 `BUILD SUCCESSFUL in 30s`。最终重建后的断连接复测、请求次数和安装包哈希见 [native-final.json](evidence/issue42/native-final.json)；最终 App 还重新读取了原账本与自定义封面，[重装后原账本](evidence/issue42/33-rebuilt-member-main-ledger.png)。

在补充账本 `Issue42-Native-Retry` 中，最终 APK 再次从系统相册选封面，[返回保留名称和图片](evidence/issue42/34-final-picker-preserved.png)。实际建账提交成功后直接断连接，[原生显示结果未知并锁住输入](evidence/issue42/35-final-create-unknown.png)，显式操作前服务端只有 1 次 POST。随后点击“重试原提交”，[恢复同一账本及邀请码](evidence/issue42/36-final-explicit-retry-created.png)，前后请求键摘要相同、上传引用未变。SQL 为 1 账本、1 邀请、1 图片绑定、1 创建审计；没有再次上传图片或自动提交。该补充账本与主验收账本分开记录。

## 数据与权限核对

[只读 SQL](evidence/issue42/database.json)及[真实 HTTP 核对](evidence/issue42/http-verification.json)覆盖主账本：SETTLED/version 5，1 笔消费 12000 分、2 条分摊各 6000 分、唯一批次/6000 分转账、登记和结清审计各 1 条。甲有 `archivedAt`、乙为 null，双方剩余净额为零，甲当前列表不含该账本、历史含该账本，乙正好相反。

封面与收据各有独立 bytea 行，实际长度等于 `byte_size`；甲乙授权读取 200、内容摘要与数据库一致，非成员 403、无认证 401，响应 `Cache-Control: no-store`。乙作为非创建者收款人调用登记或结清均 403，没有产生业务写入。这些补充 HTTP 检查与原生用户步骤分开记账，不声称是 App 点击验收。

## 自动化检查与范围

| 命令                                                | 结果                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm check`                                        | 共享包构建、类型、ESLint、格式通过                         |
| `pnpm test`                                         | 19 文件 / 120 项通过，无数据库，含原生配置回归             |
| `pnpm test:mobile`                                  | iOS / Android 22 套件 / 208 项通过，接口与原生模块使用替身 |
| 显式 `TEST_DATABASE_URL` 后 `pnpm test:integration` | 独立 `tongzhang_issue42_test`，14 文件 / 128 项通过        |
| `pnpm export:mobile`                                | Android / iOS JavaScript 导出通过，无 Web                  |
| `NODE_USE_ENV_PROXY=1 pnpm doctor:mobile`           | 21/21 通过                                                 |
| `pnpm build:android`                                | Prebuild、原生编译及安装成功，最终 APK 原生复测另见上文    |

最初集成命令指定了非 `_test` 后缀的空专用库，被测试库保护检查拒绝；改用合规独立测试库后通过，未对原生验收库执行集成测试。首次配置检查提示 CommonJS 插件的 require 规则，已在该插件单行注明 Expo CommonJS 加载原因后通过。开发中的临时 JSX/Metro 错误已修复，不计为最终验收成功证据。

本轮未进行物理真机或 iOS 原生安装验收；iOS 仅组件测试和 JS 导出通过。Android 网络配置修复的行为结论限于最终重建的 Android APK。自动化与原生截图不互相替代。PR 提交给系统架构负责人审核，本轮不合并、不关闭 Issue、不修改冲刺完成状态或剩余点数。
