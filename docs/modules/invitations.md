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
