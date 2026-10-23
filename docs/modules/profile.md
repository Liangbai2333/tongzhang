# 个人资料与设置模块设计

## 1 职责与边界

读取本人资料、修改用户名、绝对值更新通知偏好。

账号模块负责创建用户；后续资料写入由本模块负责。退出由auth处理，不能仅删除UI缓存当作服务端撤销。

| 项目     | 归属                                                  |
| -------- | ----------------------------------------------------- |
| 服务端   | `apps/server/src/modules/profile/`                    |
| 移动端   | `apps/mobile/src/features/profile/`                   |
| 共享契约 | `packages/contracts/src/profile.ts` 与 `endpoints.ts` |
| 数据     | users；operation_logs（用户名修改）                   |

## 2 子功能与接口

| 编号 | 操作                | 方法与路径                     | 幂等键 |
| ---- | ------------------- | ------------------------------ | ------ |
| A04  | `getMe`             | `GET /api/v1/me`               | 不使用 |
| A28  | `updateProfile`     | `PATCH /api/v1/me`             | 不使用 |
| A29  | `updatePreferences` | `PATCH /api/v1/me/preferences` | 不使用 |

## 3 调用过程

以会话userId定位本人 → 白名单字段校验 → 更新资料 → 映射UserSelf。

## 4 数据规则与事务

修改用户名与审计同事务；通知使用notificationEnabled绝对值，不使用toggle命令，重复提交同值不产生反转。

响应不返回passwordHash，不允许提交userId修改别人；邮箱与人民币固定只读。

## 5 移动端组织与交互

个人中心和应用设置是页面；用户名、隐私、协议与退出确认是面板。通知开关即时提交，无保存设置按钮。

## 6 开发与验收

建议贯通路径：本人资料、设置、协议。

验收覆盖：跨用户修改、额外字段、非法用户名、通知保存失败恢复旧值。
