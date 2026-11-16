# #89 Beta Day 1 独立复走与常驻导航核对

2026-11-16。运行源码为 `9f45c5d`，包含 #83 和截至 `4102d32` 的导航与下拉刷新增量。本次按 [#91 四栏书面步骤](https://github.com/Liangbai2333/tongzhang/pull/100)重新操作，使用另一套设备、Metro、API、数据库和账号，各图均为本轮设备原始截图。

**客户端为复用提交 `9f45c5d` 的新构建 APK。** APK 来自 #91 的 Beta 构建，本次重新安装在空白 Beta89 AVD（`emulator-5586`，Android 17/API 37、ARM64、1080 × 2400），安装包与设备 `base.apk` 的 SHA-256 均为 `46bded20357008eca49deda986670bedc190c7ae1078dd5dcacc099a369649dc`。Metro 和 API 从 #89 worktree 编译／启动，同一提交。设备上的 8074 转发到独立 Metro 8089，3374 转发到独立 API 入口 3390（真实服务 3389），独立 PostgreSQL 17 数据库 `beta89` 已执行仓库迁移。

测试邮箱与账本均在隔离库准备。通过真实 API 为该账号预置 9 本账，以便核对在线账本可见性与滚动位置；实际登录、断网、选图、名称校验、切标签和下拉均从 App 操作。陈林祺可在 PR 留下复走签收意见。

## #91 书面步骤复走结论

| 用例                   | 实际复走                                                                                                                                                                                  | 意见与证据                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 错误密码及未登记邮箱   | 两个请求均返回真实 401，登录页显示相同的「账号或密码错误」。                                                                                                                              | **通过**。[错误密码 01](evidence/issue89-beta-independent-review/01-review-wrong-password.png) · [未登记邮箱 02](evidence/issue89-beta-independent-review/02-review-unregistered-email.png)                                                                                                                                                                                                            |
| 断网冷启动             | 先在线载入真实账本，结束 App 进程，关闭 Wi-Fi 和移动数据，保留开发客户端的 ADB 转发，冷启进入「暂时无法核验登录状态」。账本列表不可见。选择「退出并返回登录」，登录提交仍提示网络未连接。 | **无业务缓存与登录拦截通过。** #91 如要求冷启首屏直接显示登录表单，建议退回对齐描述；本轮和四栏记录复现的是核验门禁，再返回登录。[在线对照 03](evidence/issue89-beta-independent-review/03-review-online-ledgers.png) · [断网冷启 04](evidence/issue89-beta-independent-review/04-review-offline-cold-start.png) · [登录拦截 05](evidence/issue89-beta-independent-review/05-review-offline-login.png) |
| 空名、纯空白与封面保留 | 恢复网络并登录。在建账表单从系统相册选图，分别以空名称和 3 个普通空格点击「创建并邀请成员」。两次均提示名称须为 1–40 个字符，封面预览保留。                                               | **通过**。两次拦截前后，库内始终为 9 本账、0 个封面图片、9 条邀请码。[选图 06](evidence/issue89-beta-independent-review/06-review-cover-selected.png) · [空名 07](evidence/issue89-beta-independent-review/07-review-empty-name.png) · [纯空白 08](evidence/issue89-beta-independent-review/08-review-whitespace-name.png)                                                                             |

## 双标签与下拉刷新

1. 在「账本」列表滚动至较低位置，切到「我的」，再点回「账本」。返回时列表内容和滚动位置保持。复核切换前和刷新中的可访问性树，6 个可见账本条目的边界逐项一致，包含被裁在顶部的一条。可查 [切换前 09](evidence/issue89-beta-independent-review/09-list-before-tab.png)、[我的 10](evidence/issue89-beta-independent-review/10-account-tab.png)、[切回刷新中 11](evidence/issue89-beta-independent-review/11-list-focus-refetch.png)、[刷新结束 12](evidence/issue89-beta-independent-review/12-list-focus-settled.png)。
2. 在列表顶部再次切换到「我的」并返回。此时真实账本请求仍在等待响应，原列表继续显示且没有下拉刷新指示器。等请求完成后手势下拉，指示器出现，请求完成后消失。见 [切回时 13](evidence/issue89-beta-independent-review/13-focus-at-top-no-spinner.png)、[手势下拉 14](evidence/issue89-beta-independent-review/14-pull-refresh-spinner.png)、[响应完成 15](evidence/issue89-beta-independent-review/15-pull-refresh-settled.png)。

通过。为使刷新中间态可截图，测试转发只将真实 `GET /api/v1/ledgers` 响应延后约 5 秒，保持真实状态码与返回内容。请求与 SQL 核对见[运行记录](evidence/issue89-beta-independent-review/runtime-checks.txt)。现有导航及反馈组件测试在 Android、iOS Jest 项目共 90 项通过。运行截图对应 Android 模拟器。

组外体验记录使用[三格模板](beta-external-user-observation-template.md)，本单交付模板供后续真实用户测试使用。B03 整项依 Beta 计划验收。
