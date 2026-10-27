# Issue #49：当前 App 手册、接口与双账号实操

2026-10-27，关联 [Issue #49](https://github.com/Liangbai2333/tongzhang/issues/49)。交付独立文档 PR，不改业务实现，不合并；使用已配置的 Liangbai2333 Git 身份，不冒用 Issue 原负责人的提交身份。不修改冲刺完成状态，不提前扣 T18 整项 8 点。最终文档提交与 CI 链接以 PR 描述为准。

## 基线、环境与证据归属

已阅读 AGENTS.md、CONTRIBUTING.md、README、product-spec、architecture 及相关 contracts、service、App feature。原工作区 main 执行 `git fetch origin main`、`git merge --ff-only origin/main`，同步到 `7616adb`；从该主线新建 worktree `/Users/liangbai/.codex/worktrees/issue49-docs/tongzhang` 和 `docs/49-app-manual`。原工作区未跟踪的冲刺文档保留。主线包含 #48 固定候选验收、#46/#47 修复与前序成果；本 PR 只有文档和采集证据。

| 对象        | 本轮实际版本/环境                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务源码    | `7616adb`；与 #48 业务候选 `af03672` 的业务实现相同，主线新增的是 #48 报告/证据工具；本轮 App 和 API 均从新 worktree 启动                                                                                               |
| 设备        | `emulator-5554`，Medium_Phone_API_37.0，Android 17/API 37、arm64-v8a，1080×2400/density 420；macOS，非物理真机                                                                                                          |
| 原生客户端  | com.tongzhang.app 0.1.0/versionCode 1；Expo 57.0.31、React Native 0.86.3、React 19.2.3；复用 #50 最终原生源码 `2097271` 构建安装的兼容 development 客户端，本轮未重新编译/安装                                          |
| APK         | 从设备 pm path 返回位置重新 pull，99,547,334 字节，SHA-256 `72504440573ae6985ad362bbd53854b03b46ac4d5a97c17513b0b53a61bbecf0`；原构建来源见 [#42 native-final](evidence/issue42/native-final.json)                      |
| 兼容性      | `git diff 2097271 7616adb -- apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.config.ts apps/mobile/plugins apps/mobile/assets` 为空；原生输入/资源及 variant 相同，允许复用                                     |
| 实际加载 JS | 新 Metro 8049，冷启动；设备沙盒 bundle 10,058,407 字节，SHA-256 `bc8b36de20684c44fdfacea5bbed63381e9eb65df9748cf4870573ff173b94a8`，包含新 worktree 和 API 3349；source map 的 102 份项目源码与磁盘逐字节一致，0 不匹配 |
| API/数据库  | 本 worktree `pnpm build:server` 的真实 Fastify/service/repository，127.0.0.1:3349；已有隔离 postgres:17-alpine 容器中新建独立 `tongzhang_49_native` 库，应用已提交迁移，不改 #48 原生库或开发库                         |
| 地址        | `APP_VARIANT=development EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3349`，Metro `8049 --localhost --clear`；设备 `adb reverse tcp:3349 tcp:3349`、`tcp:8049 tcp:8049`，不连接生产                                       |
| 工具        | Node 24.22.0、pnpm 12.6.0；Node patch 与仓库 .node-version 的 24.21.0 不同，明确保留，不修改版本约定                                                                                                                    |

[实际环境与源码匹配明细](evidence/issue49/environment.json)。本轮截图为 Android `adb exec-out screencap -p` 原始画面，未使用旧截图、设计稿或 Web 页面替代。测试图片内容沿用设备中标有 ISSUE 42 / TEST DATA ONLY 的素材；**素材不是旧截图**，选择、上传、绑定及截图均为本轮新操作。截图时钟由设备设置决定，API/SQL 时间记录为 UTC；验收日期按 America/Los_Angeles 记录。

#20/#34 原文只增加历史提示和新索引链接，原日期、源码、旧截图、API 补写步骤均不改写。#33/#42/#43–45/#46–47/#48 的异常路径及自动化结果继续归属原报告，不宣称本轮重验全部异常；新手册中的当前行为另外引用当前源码。本轮没有扩展消费改删、统计或扫码实现。

## 双账号逐步实操验收表

甲 `Issue49-owner`、乙 `Issue49-member` 是本轮通过真实注册接口准备的两个独立账号；**账号准备不算 App 注册验收**。两人在 App 的正常登录框输入各自邮箱/密码，没有注入会话。所有下列成功业务写入均通过 App 完成；没有用 HTTP/SQL 补写建账、加入、消费、冻结、已还、结清或归档。API onSend 仅记录真实响应，不伪造业务结果，不做延迟/丢包。本轮登记是测试数据，不代表发生真实资金支付。

主账本 `8fea9ea6-e34c-4e52-82c5-1639d2b4d087`；甲成员 `197d99f7-5cb3-4d63-8086-96dac8247ebd`，乙成员 `ed62c0a1-da73-4d6d-9e68-9808366fa447`；消费 `f681f10e-a843-4c85-882c-785a7829080d`；正式批次 `471c2421-3674-4646-920b-d648e24efb75`。表中各行源码均为 **7616adb**，账本版本单独列出。

| 步骤 / 角色 / 实际入口                                  | 预期金额与状态                                          | 实际结果与版本                                                                     | 有效新证据                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 甲：列表 + →创建账本→相册选封面→创建并邀请成员          | 自定义 COVER 绑定，1 人，¥0，ACTIVE/v1                  | App 上传 201、建账 201，真实码 48N8X6；coverKey=null、coverImageId 非空            | [提交中已上传封面](evidence/issue49/02-create-submitting.png)；成功 v1 响应见[请求](evidence/issue49/app-requests.json)。[邀请页补读](evidence/issue49/15-invitation-reread.png)发生于消费后 v3/2 人，不冒充 v1 截图                                                                                                  |
| 乙：+ →加入账本→手输码→查看账本→确认加入                | 预览不加入；确认后 2 人、ACTIVE/v2                      | App preview 200 显示甲/1 人，确认 join 200，返回本人 memberId；未通过 API 夹具加入 | [加入确认](evidence/issue49/03-join-preview.png)；join 响应见请求。[成员补读](evidence/issue49/14-members-reread.png)为 v3，角色仍甲创建者/乙成员                                                                                                                                                                     |
| 乙：记第一笔→120→人均两人→相册收据→保存                 | 乙付款、乙记录；总额12000分，两人各6000分；ACTIVE/v3    | 收据上传201、消费201，消费自身version=1；账本version=3。双方 App 可读同收据        | [分摊](evidence/issue49/05-equal-splits.png)、[保存提交中](evidence/issue49/07-expense-submitting.png)、[甲稳定详情](evidence/issue49/12-owner-expense-detail.png)、[乙收据](evidence/issue49/08-member-receipt.png)、[甲收据](evidence/issue49/13-owner-receipt.png)                                                 |
| 乙：余额明细→预览结算；甲：同账本→结算预览              | 甲−6000、乙+6000；一笔甲→乙6000，预览不冻结             | A20/A22均200；乙只读无冻结入口，甲有正式入口。SQL预览阶段0批次、ACTIVE/v3          | [余额](evidence/issue49/09-balances.png)、[甲预览](evidence/issue49/16-owner-preview.png)、[预览SQL](evidence/issue49/db-preview.json)；乙预览200在请求日志                                                                                                                                                           |
| 甲：正式发起结算→确认冻结并结算                         | expectedVersion=3；SETTLING/v4，待登记6000              | App201，唯一批次sourceVersion=3，一笔PENDING，创建者结清按钮禁用                   | [版本确认](evidence/issue49/17-freeze-confirm.png)、[正式冻结](evidence/issue49/18-frozen.png)、[冻结SQL](evidence/issue49/db-frozen.json)                                                                                                                                                                            |
| 甲（该笔付款人/创建者）：登记已还→说明Issue49-6000→确认 | 整笔6000，剩余0；原消费不变，仍SETTLING/v4              | App200，1/1 PAID，登记人为甲，说明保留；原消费/分摊/收据与冻结前相同               | [确认登记](evidence/issue49/19-paid-confirm.png)、[登记完成](evidence/issue49/20-paid.png)、[登记SQL](evidence/issue49/db-paid.json)                                                                                                                                                                                  |
| 甲创建者：确认整本结清→确认结清                         | 全部PAID且每人剩余0，SETTLED/v5                         | App200，消费仍12000、正式转账6000，批次不变                                        | [已结清](evidence/issue49/21-settled.png)、请求与最终SQL                                                                                                                                                                                                                                                              |
| 甲：归档账本→确认归档→查看历史账本                      | 只归档甲；SETTLED/v5不变，历史只读可读                  | App200；甲当前列表移出、历史出现同账本；可读消费/收据及同批次                      | [归档说明](evidence/issue49/22-archive-confirm.png)、[当前列表](evidence/issue49/23-owner-current.png)、[历史列表](evidence/issue49/24-owner-history.png)、[历史详情](evidence/issue49/25-history-detail.png)、[历史收据](evidence/issue49/26-history-receipt.png)、[历史批次](evidence/issue49/27-history-batch.png) |
| 乙再次登录：当前账本→正式记录；返回→已归档账本          | 乙未归档，当前列表仍有同账本、历史为空；同批次/登记信息 | App在线读取一致；乙archivedAt=null、剩余0，没有替乙归档                            | [乙当前列表](evidence/issue49/28-member-current.png)、[同一批次](evidence/issue49/29-member-batch.png)、[乙历史空态](evidence/issue49/30-member-history.png)、[最终SQL](evidence/issue49/db-archived.json)                                                                                                            |

提交中的图片仅证明输入/上传状态，成功结果以真实响应、稳定页面和只读 SQL 共同核对；没有将加载中画面写成成功截图。系统相册返回触发的核验和自动化点击早于动画完成的试跑，不计作额外业务成功步骤。

## 文档与协议交付验收表

| Issue #49 标准                                          | 交付与结果                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 两账号完整 App 路径，入口/角色/金额/状态/预期/实际/版本 | 上表及 [App 手册](app-user-guide.md)，本轮真实数据库和原生操作完成                                                                                               |
| 最终 contracts / 实现对应的索引                         | [30 项索引](api-reference.md)，[机器核对ID/方法/路径/幂等标记](evidence/issue49/endpoint-audit.json)，请求/响应字段另逐项对照各 Schema 与实际响应；501项明确标记 |
| 整数分字符串、成员ID、权限、幂等、版本冲突、未知恢复    | 索引通用规则/输入/响应/错误表与手册恢复表；明确7天服务端结果与24小时客户端窗口、上传非幂等、不自动重发业务写入                                                   |
| 已还不改消费、个人归档仅本人                            | 本轮[SQL阶段断言](evidence/issue49/native-assertions.json)和乙端App读取；不把人工登记当支付或消费                                                                |
| 图片授权、显式重试、首次原生安装/重建、API地址          | [成员环境](environment-setup.md)、[开发说明](development.md)、手册；明确兼容客户端复用与原生实测范围                                                             |
| 历史证据原版本保留、当前新附件                          | #20/#34只加历史导航，不改原结果；本轮目录独立保存新截图、响应与SQL                                                                                               |
| 独立文档PR、完整验收后关联关闭                          | 本文和PR描述列实际检查/限制；不合并、不改T18点数，源码不变；最终提交及其CI以PR为准                                                                               |

## 检查、复现与限制

本轮从新 worktree 执行锁定依赖安装、服务端构建及新库迁移，实际日志：[install](evidence/issue49/install.txt)、[build-server](evidence/issue49/build-server.txt)、[migrate](evidence/issue49/migrate.txt)。原生 App 使用上表实际 API/Metro 地址；两个账号密码、JWT密钥和完整令牌仅在权限0600的本机 `/tmp/tz49-*` 私有文件中，不提交。

采证方法：真实注册只准备账号；App业务写入用正常页面操作；onSend 记录 time/requestId/method/path/status、幂等键摘要及非认证JSON响应；SQL只读读取这一个账本的8类表，分别在预览/冻结/登记/归档后采集。读取设备实际APK与沙盒JS，并将同一Metro source map的项目源码与磁盘比较。全部截图为原图，不裁切、不合成；环境、证据与采集时间见[清单](evidence/issue49/manifest.json)。日志中注册、登录、退出、上一个夹具凭据的首次refresh 401均与业务步骤分开解释。

本轮文档检查：`pnpm check`、Markdown本地链接/锚点检查、根与移动端脚本名核对、30项接口表核对、`git diff --check`。结果及日志见 PR 描述和[文档检查记录](evidence/issue49/document-checks.json)、[全量检查](evidence/issue49/check.txt)。纯文档变更未重跑本地 unit/mobile/integration、Expo Doctor、JS导出或原生构建，不借用 #48 绿灯作为本PR结果；PR CI按当前head单独执行。

已知限制完整列在[限制表](known-limitations.md)：A16/A17消费改删、A21统计、A28/A29资料/偏好仍501，扫码未开放；本轮仅Android模拟器，非物理真机/iOS原生/成功拍照/物理弱网/签名发布验收；三种分摊中仅两人人均在本轮实操。应用无真实支付、离线业务缓存或持久草稿。生产服务与图片定时清理尚无实际部署验收。未重复开发已完成的面板。

## 候选变化后的复核

提交PR前再次fetch main并比较业务输入；若后续候选改变，按影响范围处理：contracts/service改变则更新字段/权限/状态及对应真实请求；App入口/面板/认证/重试改变则重走受影响原生步骤并补新截图；原生依赖、config plugin、app config或原生资源改变先重建安装再采证。新报告注明新源码/包/JS归属，旧证据保持原文件与原结果。仅文档变动不重复业务验收。系统架构负责人审核后方可合并；本PR不直接关闭Issue或提前扣T18整项点数。
