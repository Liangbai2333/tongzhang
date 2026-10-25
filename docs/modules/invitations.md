# 成员邀请与加入模块设计

## 1 职责与边界

读取/重置六位邀请、解析二维码、最小加入预览、确认加入。

A08成员列表归ledgers；码预览只返回账本名、创建者、人数和可加入性，不暴露流水。

| 项目     | 归属                                                      |
| -------- | --------------------------------------------------------- |
| 服务端   | `apps/server/src/modules/invitations/`                    |
| 移动端   | `apps/mobile/src/features/invitations/`                   |
| 共享契约 | `packages/contracts/src/invitations.ts` 与 `endpoints.ts` |
| 数据     | invitations；通过账本边界写ledger_members、ledgers        |

## 2 子功能与接口

| 编号 | 操作              | 方法与路径                                        | 幂等键 |
| ---- | ----------------- | ------------------------------------------------- | ------ |
| A09  | `getInvitation`   | `GET /api/v1/ledgers/:ledgerId/invitation`        | 不使用 |
| A10  | `resetInvitation` | `POST /api/v1/ledgers/:ledgerId/invitation/reset` | 必需   |
| A11  | `previewJoin`     | `POST /api/v1/invitations/preview`                | 不使用 |
| A12  | `joinLedger`      | `POST /api/v1/invitations/join`                   | 必需   |

### 联调契约与错误说明

当前已实现 A09–A12。`previewJoin` 只读，不加锁、不写入；`joinLedger` 与 `resetInvitation` 必带 `Idempotency-Key`。邀请码为 6 位，字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`（不含 0/1/I/O），二维码载荷 `tongzhang:invite:v1:<码>`。

| HTTP | `error.code`           | 触发                                                                | 前端处理               |
| ---- | ---------------------- | ------------------------------------------------------------------- | ---------------------- |
| 400  | `VALIDATION_ERROR`     | 码格式不是 6 位合法字符、缺少幂等键                                 | 输入框内提示           |
| 400  | `INVITE_INVALID`       | 码不存在或已被重置作废                                              | 提示邀请码无效         |
| 409  | `INVITE_EXPIRED`       | 码超过 7 天有效期（非成员）                                         | 提示联系创建者重新生成 |
| 409  | `MEMBER_LIMIT_REACHED` | 确认加入时账本已有 12 人（预览为 200、canJoin:false）               | 提示人数已满           |
| 409  | `LEDGER_FROZEN`        | 确认加入或重置时账本已进入结算或已结清（预览为 200、canJoin:false） | 提示账本不可加入       |
| 401  | `UNAUTHENTICATED`      | 未登录                                                              | 回到登录               |
| 403  | `FORBIDDEN`            | 非成员或非创建者读取/重置邀请                                       | 隐藏创建者操作         |
| 409  | `IDEMPOTENCY_CONFLICT` | 同一幂等键复用于不同内容                                            | 核对原提交，不换键重发 |

预览返回 `canJoin`、`alreadyMember`、`memberCount`；已是成员的用户重复加入返回 200 `alreadyMember: true`，不新增成员、不递增版本。加入事务按“幂等键锁 → 账本行锁 → 重读邀请 → 查成员 → 计数 → 写成员/版本/审计/幂等结果”执行，任一步失败整体回滚；被拒绝的加入不留成员行与幂等结果。

## 3 调用过程

手输六位码或解析tongzhang:invite:v1:载荷 → 查询最小预览 → 确认加入 → 重新核验邀请和人数 → 新增成员。

## 4 数据规则与事务

重置先锁账本再撤销旧码、创建新码；加入锁账本后重读邀请、查已有成员、计数，防止并发突破12人；与版本、审计、幂等结果一起提交。

只有创建者管理邀请；有效期7天；只有ACTIVE可加入。码不是登录凭证，查询/加入需已登录。重置后旧码无效。

## 5 移动端组织与交互

邀请页含复制与分享；分享直接调系统面板。扫码、加入确认和重置确认是面板，不追加中转分享页。

## 6 开发与验收

建议贯通路径：邀请 → 扫码/手输 → 确认加入。

验收覆盖：过期/撤销/非法码、并发最后名额、重复加入、正式结算期间加入、无权管理。

## 7 当前操作索引与实测

完整字段与错误顺序见[建账与邀请操作索引](../ledger-invitation-api-guide.md)。A09 创建者可读取过期邀请并得到 expired:true；非成员 preview/join 过期为 409。已有成员使用未撤销的码可预览/进入，重复加入不新增成员；撤销码仍无效。App 手输预览、确认、重复进入与创建者重置已实际核对，扫码按钮仍暂未开放。证据见 [Issue #19 验证](../issue19-native-environment-validation.md)。
