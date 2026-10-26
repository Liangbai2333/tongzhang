# Issue #31：消费、收据与正式冻结原生验收

2026-10-26，负责人陈林祺（@lllin7）。关联 [Issue #31](https://github.com/Liangbai2333/tongzhang/issues/31)，本报告与 [#34 接口操作说明](expense-settlement-api-guide.md)共用同一次运行和证据，不重复开发既有消费或结算功能。

## 版本与环境

- 从远程 `main` `5abf9b095ea27311bd3d9e5c6e5ec01a631175a0` 新建 worktree，分支 `fix/31-34-native-acceptance`。首次原生验收源码为该基线加 `e653669b9613fb6403b2aba1d2a166dc92cae515`；首次交付的其余提交只整理文档和证据。之后的审查修复与验证单列在本文末尾，不改写首次原生截图的版本归属。
- 唯一源码修改是 `CreateExpenseScreen.tsx` 的收据错误位置。其 SHA-256 为 `9bdafcbce9b5b9ae029cb40b7c82b355dc94673d5030d79c95555ca3b6c09b63`。`02` 是修复前缺陷证据；`03` 起为修复后运行，`01` 是修复前的人均面板基线。
- Node.js 24.22.0、工作区 pnpm 12.6.0、Expo SDK 57 / App 0.1.0。复用已安装的 iPhone 18 Pro / iOS 27.0 开发客户端，Metro 8091；没有原生依赖或配置变更。
- API 3331 运行本 worktree 编译的 Fastify / service / repository；3332 为记录请求及故障控制的本地代理。PostgreSQL 17 专用库 `tongzhang_issue31_34`，从空库应用仓库迁移，不写开发业务库。
- 通过真实注册接口创建甲、乙及非成员丙，App 正常密码登录甲/乙并在线读取 `/me`；凭据仅在本机未提交文件中，不注入 App 会话。账本和消费均通过真实 API 创建，没有替身余额或成员。
- 原生实操约为 UTC 12:54–13:02（本地 America/Los_Angeles 05:54–06:02）。截图由 `simctl io booted screenshot` 当场保存，保留原始像素；不是 Web、设计图或历史截图。收据内容是已有的 TEST DATA ONLY 测试图片（图片内日期 10/25），本次重新经系统相册选入、压缩、上传和鉴权读取。齿轮是开发客户端控件。

## 用例预期、实际与证据

| 用例                   | 预期                                           | 本次实际                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N01 两成员人均 ¥120    | 各摊 ¥60，服务端重算                           | App 人均面板各 ¥60；保存后两账号 API 详情均为 `6000` 分。[人均](evidence/issue31-34/01-equal-split.png)、[甲详情](evidence/issue31-34/05-expense-detail.png)、[乙详情](evidence/issue31-34/15-member-expense.png)                                                                                               |
| N02 收据上传与读取     | 绑定真实图片；两成员可读、非成员拒绝           | 原生相册选入后压缩为 138919 字节 JPEG；一次成功上传。甲/乙 App 均可打开收据；HTTP 内容 SHA-256 相同，丙 403。[甲收据](evidence/issue31-34/06-authorized-receipt.png)、[乙收据](evidence/issue31-34/16-member-receipt.png)                                                                                       |
| N03 上传连接失败       | 不新增消费；保留表单与选图；手动再试           | 代理在转发上传前断开，App 显示网络错误；未发送消费 POST。发现提示被滚动区域遮住，修复后固定操作区可见，点击保存才重试。[修复前](evidence/issue31-34/02-upload-error-hidden-before.png)、[修复后](evidence/issue31-34/03-upload-error-visible-after.png)                                                         |
| N04 消费响应丢失       | 结果未知，锁定输入，保留上传引用，同键显式重试 | 真实 API 返回 201 后代理丢弃连接；App 保留输入与“收据已上传”状态。点击“重试原消费提交”后进入同一详情，未再次上传。[未知结果](evidence/issue31-34/04-expense-unknown.png)                                                                                                                                        |
| N05 余额与只读预览     | 甲 +¥60、乙 −¥60，一笔乙→甲 ¥60；不冻结        | 原生余额及预览正确；取消冻结面板后再查，账本 ACTIVE/version 3、A24 404、批次 0。[余额](evidence/issue31-34/07-balances.png)、[预览](evidence/issue31-34/08-preview.png)                                                                                                                                         |
| N06 正式确认与重复点击 | 只有创建者可冻结；提交禁用；一个批次           | App 双击确认，代理延迟 7 秒再转真实服务，仅一个 POST；确认和返回均禁用。随后 SETTLING，批次 `229d7f11-e55c-467a-b249-130d15e094f9`，0/1 已登记。[确认](evidence/issue31-34/09-freeze-confirm.png)、[提交中](evidence/issue31-34/10-freeze-submitting.png)、[正式记录](evidence/issue31-34/11-formal-record.png) |
| N07 冻结后新增         | App 拒绝进入表单，API 也拒绝写入               | 原生直达有效 `expenses/create` 路由显示冻结；真实新增 POST 为 409 `LEDGER_FROZEN`，原消费仍 1 笔。[冻结提示](evidence/issue31-34/12-frozen-create.png)                                                                                                                                                          |
| N08 版本冲突           | 原摘要保留，提示重新预览，不自动确认           | 独立账本打开 version 2 确认面板后，真实 API 新增 ¥1 消费至 version 3；旧版本 POST 返回 409 `VERSION_CONFLICT`。App 提示重查，重查后 ¥1 / 一笔 ¥0.50，仍 ACTIVE、无批次。[冲突](evidence/issue31-34/13-version-conflict.png)、[重查](evidence/issue31-34/14-refreshed-preview.png)                               |
| N09 成员与非成员权限   | 成员读取，普通成员无冻结入口，丙拒绝读取       | 乙 App 读取同一消费与收据；独立 ACTIVE 账本预览只有查看/复制，无正式发起按钮。乙直接 POST 冻结为 403；丙消费列表/详情/余额/预览/收据/正式记录均 403。[成员预览](evidence/issue31-34/17-member-no-freeze.png)                                                                                                    |

N04 的两次消费提交幂等键摘要均为 `bab7985c6f56`，首次真实落库后重放仍返回同一消费 `fed2da49-980b-4900-ac92-e6427648769e`。重试请求人为延迟期间曾尝试再次点击，但自动化元素已失效，因此不把该次操作计作消费原生双击验收；重复点击的原生证据以 N06 为准，消费重复点击由既有组件测试覆盖。

完整[请求时序](evidence/issue31-34/requests.json)只含方法、路径、状态、时间、故障类型和幂等键摘要。前段含真实账号及账本准备，N03 第一条为修复前，第二条为修复后；没有 Authorization、密码、令牌或原始幂等键。N04/N06 代理不制造成功响应，仍由真实服务完成写入；数据库保留了此次数据。

## 局部缺陷、修复与复测

F01：原收据错误位于滚动区末端。提交后用户仍停留在原滚动位置，错误落在固定 footer 以下，看起来像保存无响应。现将 `receipt.error` 与消费错误统一呈现在固定保存操作区，继续复用 `InlineError`；没有增加全屏错误路由，也没有改业务校验、上传或幂等流程。

视觉依据为 [Figma 页面](https://www.figma.com/design/tngbOd0rJkD29C7Qe2r2zh/?node-id=1-3) 的 `3:134` 消费表单，本次读取了该节点高保真上下文和截图。参考锁定：保留金额卡、白色信息卡、黄色主操作、圆角与原图标；错误使用现有红色反馈组件，放在已有 footer；动态收据继续来自 API。辅助依据为 Refero 的表单错误可见性准则。仅移动错误文本，没有新增或替换静态资产；表单涉及的编辑、勾选、相册、相机、移除和选择箭头继续使用现有本地原 SVG 与根尺寸。保留既有字体、安全区、人数与内容适配差异，不宣称全屏像素一致，也不调整本次无关画面。

复测顺序：修复版本重新填相同 ¥120 和名称 → 系统选相同测试收据 → 再次断开上传连接 → 原位置看到错误 → 恢复连接后 App 未自行上传 → 手动保存 → 正常上传后丢弃消费响应 → 原引用同键重试 → 真实详情及数据库核对成功。开发热更新会重新挂载表单，故修复前输入未作为修复后保留证据；保留与重试的断言均在修复后的连续运行中完成。

## 数据库及接口复核

[预览与访问权限记录](evidence/issue31-34/preview-and-access.json)记录取消确认后的 ACTIVE 与无批次结果、两个账号的详情/余额/预览和图片哈希。后续 #34 经真实 API 登记、结清、个人归档后，[数据库记录](evidence/issue31-34/database.json)显示主账本 SETTLED/version 5，仍只有 1 笔消费、2 条分摊、1 条收据绑定和 1 个批次；仅甲的 `archived_at` 非空。对应 [API 生命周期结果](evidence/issue31-34/lifecycle-and-images.json)与 [App 结清读取](evidence/issue31-34/18-settled-after-api.png)可交叉核对。

## 验证命令与结果

| 验证                                              | 实际结果                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                  | 通过，锁文件无变动                                                                                                      |
| `PGDATABASE=tongzhang_issue31_34 pnpm migrate:db` | 独立空库迁移通过                                                                                                        |
| `pnpm check`                                      | 共享包构建、类型、Lint、格式通过。首次检查发现本次新增内容格式未整理，格式化后复跑通过                                  |
| `pnpm test`                                       | 18 文件 / 112 项通过，无数据库测试                                                                                      |
| `pnpm test:mobile`                                | iOS/Android 20 套件 / 178 项通过，含上传失败、未知结果、同键重试、重复点击与冻结；使用 API/原生模块替身，不充当原生证据 |
| `pnpm export:mobile`                              | Android / iOS JS 导出通过，没有 Web 构建                                                                                |
| `NODE_USE_ENV_PROXY=1 pnpm doctor:mobile`         | 21/21 通过                                                                                                              |
| 本次真实 API / PostgreSQL / iOS App               | 上表 N01–N09 及 #34 操作核对通过                                                                                        |

日志：[检查](evidence/issue31-34/check.log)、[无数据库测试](evidence/issue31-34/unit-tests.log)、[移动端测试](evidence/issue31-34/mobile-tests.log)、[JS 导出](evidence/issue31-34/export.log)、[Doctor](evidence/issue31-34/doctor.log)。没有服务端业务逻辑变更，本轮未重复跑全量 `pnpm test:integration`；真实 HTTP/SQL 实操与该测试命令明确分开。

## 交付边界

本日消费/收据/预览/冻结验收和 F01 修复已完成；不据此宣布 T16/T27/T28 整项闭环完成，不改冲刺点数。登记已还、结清、归档写入以 API 验证，App 的对应写入口仍未接；已有归档读取入口确实可用，见 [#34 操作说明](expense-settlement-api-guide.md)。没有 Android 原生安装、物理设备、相机拍摄/拒权或生产部署验收；JS 导出不是这些验收的替代。

## PR #40 合并前审查补充

2026-10-26 审查时发现 F02：已上传收据且消费保存明确失败后，用户再次拍摄失败，原收据和图片 ID 仍保留；随后保存若遇到网络错误，原先 `error ?? receipt.error ?? write.error` 的优先级会用旧拍摄错误遮住最新保存错误。修复为在同一固定操作区分别渲染消费错误和收据错误，继续保留当前输入、上传引用和原幂等键，不修改上传、权限或写入规则。修复源码为 `cd68852ca6924f83b6bc1914b159ed3658e5df4d`。

新增回归先在原 PR 上验证，iOS/Android 均因找不到“保存结果尚未确认”而失败；修复后两平台均通过，且断言原收据只上传一次、两次消费请求内容及幂等键相同、未知结果时输入禁用。完整移动端回归为 20 套件 / 180 项通过，`pnpm check` 通过。日志：[修复前](evidence/issue40-review/regression-before.log)、[修复后](evidence/issue40-review/regression-after.log)、[完整移动端回归](evidence/issue40-review/mobile-tests.log)、[检查](evidence/issue40-review/check.log)。这些新增用例使用 API/选图替身，不作为新增原生或真实数据库验收。

审查同时核对了原 31 份证据文件的字节数与 SHA-256、原生验收源码提交中的文件哈希、文档相对链接、接口路径/角色/状态以及 App 未接通边界。未改写原证据清单或复用其截图宣称 F02 的原生复测。首次交付的远程 CI [check/container](https://github.com/Liangbai2333/tongzhang/actions/runs/40328372417)均通过，包含数据库集成测试；审查修复后的最终 CI 以 PR 当前 head 的检查为准，合并前须再次通过。
