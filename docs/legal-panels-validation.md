# 关于、协议与隐私面板实现与验证

关联：[Issue #8 / T08](https://github.com/Liangbai2333/tongzhang/issues/8)。正文修订日期：2026-10-24。本记录对应任务分支 `feat/8-about-legal-panels`，记录实现范围、实际检查及验收边界。

## 实现范围

- 三份完整正文位于 `apps/mobile/src/features/profile/documents.ts`，面板位于该 feature 的 `components/DocumentSheet.tsx`。个人中心提供“关于同账”“用户协议”“隐私说明”三个入口；登录、注册复用协议与隐私面板。不新增全屏路由、依赖、原生配置、后端接口或业务缓存。
- 正文说明服务范围、开发状态、账号安全、共同账目权限、人工还款、在线使用、失败重试、信息用途、设备权限、保存与退出、数据处理及联系渠道；明确区分已接通能力与尚在开发的功能。关于面板从 Expo 配置读取实际应用版本。
- 维护主体使用用户确认的“同账项目维护团队”，一般反馈使用项目 GitHub Issues；涉及个人信息时仅先申请非公开沟通，不要求在公开 Issue 提交账号、账目或收据。项目地址支持文本选择复制，阅读过程中不跳转外部页面。
- 保持公共 Sheet 的退出动画；正文滚动区可收缩，标题与 44 点关闭操作固定，正文支持系统字体缩放与文本选择。切换不同文档会重建滚动区，从正文开头阅读；关闭动画期间保留原正文及滚动区。
- 顶部关闭、正文末尾“关闭”、遮罩和系统关闭请求都只更新面板状态。阅读不会代为勾选、提交认证、退出账号或清空表单。

## 使用路径

1. 欢迎页进入登录或注册，点击“用户协议”或“隐私说明”。向上拖动正文阅读后续内容；可随时点右上角关闭，也可点遮罩或末尾“关闭”。返回后继续编辑原表单。
2. 注册需由用户明确勾选同意；单纯阅读、关闭不改变勾选状态。字段错误、服务端错误、密码显隐和输入继续保留。
3. 登录后在“我的”页的“了解同账”区域打开任一文档，关闭后仍在原账号页。完整应用设置页、用户名修改和通知偏好不属于本任务。

原型说明中的 09.04—09.06 仍记录原型的示例正文与热点，本次移动端交付以这里的操作和截图为准。

## 视觉依据与取舍

本次沿用已有 Screen、Sheet、Button、系统字体和主题，参考只补充阅读结构：

| 决定                                   | 来源                                                                                             | 采用范围                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 保留白色底部面板、既有圆角、留白和配色 | 现有组件与 `docs/prototype-guide.md` 的 09.04—09.06                                              | 同页阅读，不重建导航或主题                               |
| 日期、分节标题和单列正文               | [Vectary 文档样式](https://vectary.com)、[Expo 文档样式](https://expo.dev) 的 Refero 参考        | 仅采用信息层级与段落节奏，不引入其品牌色、字体或页面框架 |
| 标题与关闭固定在滚动正文之外           | [Brilliant iOS 隐私阅读参考](https://refero.design/screens/18e79df6-0db6-40c1-9ee1-7424692f82c2) | 长文始终可退出，保留原表单                               |

API 核对参考：[Expo SDK 57 Constants](https://docs.expo.dev/versions/v57.0.0/sdk/constants/)、[React Native Modal](https://reactnative.dev/docs/0.86/modal)、[ScrollView](https://reactnative.dev/docs/0.86/scrollview)。

## 自动检查

| 命令                 | 实际结果                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm check`         | 通过：共享包构建、全仓类型、ESLint 和格式检查                     |
| `pnpm test:mobile`   | 10 个套件、56 项测试通过，分别使用 iOS / Android 环境；未使用快照 |
| `pnpm export:mobile` | Android、iOS 两端 JavaScript 导出通过                             |
| `pnpm doctor:mobile` | 21/21 项通过                                                      |

新增行为覆盖：登录和注册打开两份不同正文后保留全部输入、勾选、错误、密码显隐；阅读不额外调用登录/注册；未勾选时通过顶部、遮罩与系统关闭仍未勾选；个人中心三个入口对应各自正文并返回同一账号，不触发退出或重新核验。

组件测试使用现有认证回调与原生模块替身。系统返回覆盖的是 Modal 的原生关闭回调，不等同于 Android 设备按键人工验收。滚动布局由下述原生客户端核对。

## iOS 原生页面验收（首轮）

使用现有 Expo SDK 57 开发客户端连接本仓库 Metro。iPhone 账号登录实际请求本机 API 和开发 PostgreSQL；没有使用模拟登录或构造账号页。没有修改原生配置，本轮未重建原生二进制。

| 场景                                               | 实际结果与证据                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone 17 / iOS 27.0，注册阅读隐私                 | [首屏](evidence/legal-panels/register-privacy-top.png)到[末尾](evidence/legal-panels/register-privacy-bottom.png)可触摸滚动，顶部关闭始终可见，末尾反馈地址与关闭可达                                                     |
| 关闭后表单状态                                     | 从末尾关闭后，[用户名、邮箱、密码、确认密码、未勾选状态及校验错误仍保留](evidence/legal-panels/register-restored.png)                                                                                                     |
| 协议正文与遮罩退出                                 | [用户协议首屏](evidence/legal-panels/register-terms-top.png)展示对应正文；点击面板上方遮罩返回原注册表单                                                                                                                  |
| 登录入口                                           | [登录页打开隐私说明](evidence/legal-panels/login-privacy-top.png)，顶部关闭后账号和密码仍保留，随后使用真实 API 登录本轮专用账号                                                                                          |
| 个人中心三个入口                                   | [真实账号页](evidence/legal-panels/account-entries.png)提供三个入口；[关于面板](evidence/legal-panels/account-about.png)显示配置版本 0.1.0，协议和隐私也分别打开对应正文，顶部关闭后仍为同一账号                          |
| iPad mini (A17 Pro) / iPadOS 27.0 的手机兼容窄窗口 | [首屏](evidence/legal-panels/ipad-window-privacy-top.png)到[末尾](evidence/legal-panels/ipad-window-privacy-bottom.png)可滚动，标题与关闭未被长文挤出；关闭回到原登录页。这是现有手机兼容窗口检查，不宣称完整平板布局支持 |

截图保留 Device Hub 外框和原生开发工具按钮。iPhone 开发工具浮动齿轮靠近面板关闭图标，实际顶部关闭已操作通过；开发工具不属于产品面板。

首轮 iOS 验收只创建一个专用本地 QA 账号，注册表单保留错误场景未提交成功，也未创建账本。验收结束通过原生页面退出，随后按该账号的精确 ID 与邮箱清理 1 个账号、2 个会话及 2 条刷新摘要；[清理记录](evidence/legal-panels/database-cleanup.json)只保留计数，不记录密码或令牌。该轮新增启动的 iPad 模拟器已停止，原有 iPhone 与开发服务保留。

## Android 原生与小屏键盘补充验收

2026-10-24 补齐复审中发现的 Android 原生与短屏覆盖缺口。本次仅新增截图和验证记录，未修改应用代码、依赖或原生配置；上表自动检查结果来自实现与复审阶段，补验不将组件测试或 JS 导出当作原生运行证据。

环境为 `Medium_Phone` AVD，Android 14 / API 34 / ARM64，使用已安装的 `com.tongzhang.app` 0.1.0 Expo SDK 57 开发客户端，通过 Metro 加载本任务分支。已核对安装包摘要与本机现有 debug APK 一致，未重新编译原生二进制。账号登录请求真实本机 API 与开发 PostgreSQL。经用户明确授权，使用本机 ADB 输入、点击、系统返回事件、UIAutomator 状态核对及 `screencap` 保存原生截图，没有注入模拟登录或直接修改组件状态。

先验证原始 1080×2400 px、420 dpi 的显示，再用 Android `wm` 将同一模拟器临时改为 720×1280 px、320 dpi，即完整屏幕 360×640 dp，分别重新进入登录和注册场景。小屏截图来自实际原生窗口尺寸变化，没有缩放截图冒充适配验收。环境、断言结果、安装包及全部截图摘要见 [Android 原生检查记录](evidence/legal-panels/android-native-checks.json)。

| 场景                                    | 实际结果与截图                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 标准尺寸注册页：长文与系统返回          | [阅读前](evidence/legal-panels/android-register-before-reading.png)录入用户名、邮箱、密码及不一致的确认密码，保留校验错误且不勾选；隐私说明可从[首屏](evidence/legal-panels/android-register-privacy-top.png)滚动到[末尾](evidence/legal-panels/android-register-privacy-bottom.png)，顶部关闭及末尾关闭在系统导航栏上方；发送原生 Back 后[返回原注册页](evidence/legal-panels/android-back-restored.png)，四个字段、错误及未勾选状态保留                  |
| 标准尺寸登录页：四种关闭路径            | [用户协议](evidence/legal-panels/android-login-terms-top.png)展示对应正文；顶部关闭后[输入保留](evidence/legal-panels/android-login-header-restored.png)。另外分别操作隐私面板遮罩、滚动末尾“关闭”和协议面板系统 Back，均回到相同账号与密码的[登录页](evidence/legal-panels/android-login-back-restored.png)，未因阅读自动登录                                                                                                                             |
| 真实账号的个人中心                      | 使用专用本地账号真实登录，[个人中心三个入口](evidence/legal-panels/android-account-entries.png)均可打开对应正文；[关于面板](evidence/legal-panels/android-account-about.png)显示 0.1.0，顶部关闭或系统 Back 后仍为相同账号，验证结束显式退出                                                                                                                                                                                                               |
| 360×640 dp 登录页：软键盘展开           | [密码框聚焦与软键盘](evidence/legal-panels/android-small-login-keyboard.png)真实可见，固定登录按钮位于键盘上方；拖动表单后按现有 `keyboardDismissMode="on-drag"` 行为收起键盘，[协议入口可达](evidence/legal-panels/android-small-login-links-after-drag.png)，输入未丢失                                                                                                                                                                                  |
| 360×640 dp 阅读与继续编辑               | 隐私说明从[首屏](evidence/legal-panels/android-small-privacy-top.png)滚动到[末尾](evidence/legal-panels/android-small-privacy-bottom.png)，标题和关闭可达；顶部关闭后[登录输入保留](evidence/legal-panels/android-small-login-restored.png)，再次聚焦密码框[继续输入并展开键盘](evidence/legal-panels/android-small-login-resumed-keyboard.png)成功                                                                                                        |
| 360×640 dp 注册页：键盘、错误和同意状态 | 四个字段逐一可滚动到达并编辑；校验失败后再次聚焦确认密码，[软键盘和固定注册按钮可用](evidence/legal-panels/android-small-register-keyboard.png)。拖动收起键盘后可打开[用户协议](evidence/legal-panels/android-small-register-terms.png)，系统 Back 后[密码、错误、未勾选状态](evidence/legal-panels/android-small-register-restored.png)保留；滚动回上方核对[用户名、邮箱与密码](evidence/legal-panels/android-small-register-restored-fields.png)也未丢失 |

键盘场景走真实用户路径：表单聚焦并输入 → 拖动时收起键盘 → 点击文档入口 → 阅读与关闭 → 返回继续编辑。没有强制保持键盘与阅读面板同时叠加，也没有把键盘已收起的截图称为“键盘展开”。截图保留系统三键导航、原生软键盘和开发工具浮钮。

Android 补验另创建 1 个专用本地账号供个人中心真实登录；普通与小屏注册表单均因密码不一致及未同意而未完成注册，未新增账本或其他业务记录。原生退出后按精确账号 ID 与邮箱清理 1 个账号、2 个会话及 2 条刷新摘要，见 [Android 账号清理计数](evidence/legal-panels/android-database-cleanup.json)。已恢复显示到 1080×2400 px、420 dpi，软键盘设置保持原值，删除本次临时 UI dump 和端口映射，并停止本轮启动的 Android 模拟器；原有 iPhone、API 和 Metro 保留。

本轮未发现需要修复的应用代码问题。记录与 JSON 格式、截图摘要及文档相对文件链接已核对；应用代码仍保持上轮通过检查的版本。

## 验收边界与状态

已补齐 Android 开发客户端原生运行、系统返回与其他关闭路径、标准尺寸和 360×640 dp 小屏软键盘场景。仍未进行物理真机、其他 Android 系统版本、系统大字体或屏幕阅读器的人工验收；本轮不将模拟器结果扩展为这些场景已通过。

2026-10-24 提交前复核：#8 的四项验收标准均有对应实现与证据。三个入口展示独立正文；长文滚动及关闭后状态保留已由组件测试与原生操作交叉核对；面板位于 profile feature、没有新增全屏路由，标准尺寸与 360×640 dp 小屏可阅读和关闭；登录与注册共用相同正文，并保留适用检查与实际截图。提交前再次运行 `pnpm check`、`pnpm test:mobile`、`pnpm export:mobile` 和 `pnpm doctor:mobile`，结果均通过，与上表一致。

Issue 完成状态与冲刺点数保持原状，待负责人审查 PR 并确认整项验收后更新。
