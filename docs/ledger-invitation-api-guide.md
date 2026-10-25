# 建账与邀请接口索引、双账号操作说明

2026-10-25，负责人袁湘湘（@circlexxl）。对应 [Issue #20](https://github.com/Liangbai2333/tongzhang/issues/20) 的账本/邀请文档交付；本轮不重复开发 #8 协议弹窗，不代表 T18 整项完成或重复扣减 T08 点数。

本次按已合入 [PR #21](https://github.com/Liangbai2333/tongzhang/pull/21)、[PR #25](https://github.com/Liangbai2333/tongzhang/pull/25) 后的 `main` `3cb6e0bc7e5167d991b8454b1fce084739077b41` 核对。API、客户端、截图均对应这份实现；[本轮原生与环境实操记录](issue19-native-environment-validation.md)提供复现环境、命令、结果和边界。

## 来源与共同约定

字段和路由以 [endpoints.ts](../packages/contracts/src/endpoints.ts)、[ledgers.ts](../packages/contracts/src/ledgers.ts)、[invitations.ts](../packages/contracts/src/invitations.ts)、[scalars.ts](../packages/contracts/src/scalars.ts) 为准；错误与权限顺序核对[账本 service](../apps/server/src/modules/ledgers/service.ts)、[邀请 service](../apps/server/src/modules/invitations/service.ts)、[HTTP 适配](../apps/server/src/http/operation.ts)、[错误转换](../apps/server/src/http/errors.ts)及[幂等事务](../apps/server/src/db/idempotency.ts)。移动端入口见 `apps/mobile/app`，实际页面位于 `apps/mobile/src/features/ledgers` 与 `invitations`。

- 下表是完整 API 路径。本地常规地址为 `http://localhost:3300`，本轮隔离实操使用 `http://127.0.0.1:3319`；Android 模拟器和真机地址规则见[开发说明](development.md#3-移动端地址与发布配置)。所有操作在线。
- A05–A12 全部要求 `Authorization: Bearer <accessToken>`，邀请码不是认证凭据。通过真实注册/登录取得会话；A01 注册为 `{username,email,password,acceptTerms:true}`，A02 登录为 `{account,password}`，令牌在响应 `data` 中，勿写入日志或截图。
- 有 JSON body 的请求发送 `Content-Type: application/json`。没有 body 的 GET 和 A10 不发送 JSON `{}`，A10 收到请求体会返回 400。
- 表中标记“必需”的 `Idempotency-Key` 为 UUID；同一用户、操作路径、键、原内容重放返回首次成功响应；同键改内容为 409。成功结果保留 7 天，业务写入与幂等结果在同一事务提交。查询及 preview 不要求幂等键。
- 请求中的 ID 是 UUID；时间是带时区的 ISO 字符串；所有金额是整数分十进制**字符串**，例如 `"0"`，不使用浮点金额。
- 成功统一包在 `data` 中；列表例外是 `{data:[],page:{nextCursor:null或字符串}}`。失败形状见下文，不返回成功的 `data`。

## A05–A12 接口索引

| 编号 / 操作         | 方法与实际路径                                    | 请求                                          | 成功响应                                                  | 权限与幂等                           |
| ------------------- | ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| A05 createLedger    | `POST /api/v1/ledgers`                            | body：`name`、`coverKey` 或 `coverImageId`    | 201 `{data:{ledger:LedgerSummary,invitation:Invitation}}` | 已登录；**必需**幂等键               |
| A06 listLedgers     | `GET /api/v1/ledgers`                             | query：`archived`、`limit`、`cursor`，无 body | 200 `{data:LedgerSummary[],page:{nextCursor}}`            | 仅本人的成员账本；不使用幂等键       |
| A07 getLedger       | `GET /api/v1/ledgers/:ledgerId`                   | path：`ledgerId`，无 body                     | 200 `{data:LedgerDetail}`                                 | 账本成员；不使用幂等键               |
| A08 listMembers     | `GET /api/v1/ledgers/:ledgerId/members`           | path：`ledgerId`，无 body                     | 200 `{data:Member[]}`                                     | 账本成员；不使用幂等键               |
| A09 getInvitation   | `GET /api/v1/ledgers/:ledgerId/invitation`        | path：`ledgerId`，无 body                     | 200 `{data:Invitation}`                                   | 仅创建者；不使用幂等键               |
| A10 resetInvitation | `POST /api/v1/ledgers/:ledgerId/invitation/reset` | path：`ledgerId`，**无 body**                 | 200 `{data:Invitation}`                                   | 仅 ACTIVE 账本创建者；**必需**幂等键 |
| A11 previewJoin     | `POST /api/v1/invitations/preview`                | body：`{code}`                                | 200 `{data:JoinPreview}`                                  | 已登录；只读，不使用幂等键           |
| A12 joinLedger      | `POST /api/v1/invitations/join`                   | body：`{code}`                                | 200 `{data:{ledgerId,memberId,alreadyMember}}`            | 已登录；**必需**幂等键               |

### 请求字段

| 字段             | 约束与默认值                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A05 name         | 去除首尾空格后 1–40 字符，必填                                                                                                                                 |
| A05 coverKey     | 可选枚举 `mountain` / `dining` / `city` / `plain`                                                                                                              |
| A05 coverImageId | 可选 UUID；与 coverKey 必须且只能提供一个。契约允许但当前业务返回 501 `FEATURE_NOT_READY`，App 只允许预设封面                                                  |
| A06 archived     | query 字符串 `"true"` / `"false"`，默认 `"false"`；筛选当前成员个人归档状态，**不是财务状态筛选**。false 包括所有未个人归档的 ACTIVE / SETTLING / SETTLED 账本 |
| A06 limit        | 1–50 整数，默认 20                                                                                                                                             |
| A06 cursor       | 可选 1–512 字符，只传上一页 `page.nextCursor` 原值，不构造或修改；为空/无下一页时省略。按本人成员加入时间及成员 ID 倒序分页                                    |
| A11/A12 code     | 六位大写字符，字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`，不含 0/1/I/O。HTTP 不自动转大写；当前 App 输入会 trim 并转大写                                        |

A05 与邀请码 body 使用 strict schema，多余字段被拒绝。邀请有效期自创建或重置起 7 天；二维码载荷 `tongzhang:invite:v1:<六位码>`。二维码展示已接通，App 扫码入口仍禁用，不能把二维码载荷格式当成扫码功能已经完成。

### 响应字段

以下列出完整字段；可空字段标记为 `null`，其余为必有字段。

| 类型          | 字段与含义                                                                                                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LedgerSummary | `id` UUID、`name` string、`coverKey` 枚举或 null、`coverImageId` UUID 或 null、`status` ACTIVE/SETTLING/SETTLED、`version` 正整数、`memberCount` 1–12 整数、`expenseTotalCents` 非负整数分字符串、`myRemainingNetCents` 有符号整数分字符串、`archivedAt` 时间或 null、`createdAt` 时间 |
| LedgerDetail  | 包含 LedgerSummary 全字段；另有 `creatorUserId` UUID、`myMemberId` UUID、`myPaidCents` / `mySharedCents` 非负整数分字符串、`myNetCents` 有符号整数分字符串、`members` Member 数组（最多 12）                                                                                           |
| Member        | `id` 成员 UUID（不是用户 ID）、`userId` 用户 UUID、`username` string、`role` CREATOR/MEMBER、`joinedAt` 时间、`netCents` / `remainingNetCents` 有符号整数分字符串                                                                                                                      |
| Invitation    | `id` 邀请 UUID、`code` 六位码、`expiresAt` 时间、`expired` boolean、`qrPayload` string                                                                                                                                                                                                 |
| JoinPreview   | `ledgerId` UUID、`name` string、`creatorName` string、`memberCount` 整数（最多 12）、`alreadyMember` boolean、`canJoin` boolean；不含流水、成员明细或财务数值                                                                                                                          |
| JoinResult    | `ledgerId` UUID、`memberId` 成员 UUID、`alreadyMember` boolean；首次成功加入为 false，已经在账本内则 true                                                                                                                                                                              |

新建账本为 ACTIVE、version=1、成员数 1，创建者也是成员；首次加入递增账本版本并增加一名成员；重复加入不增加成员、不递增版本；重置邀请也不改变账本版本或既有成员。净额正数表示应收、负数表示应付；还款不是消费。

### 实际错误行为

失败 envelope：`{error:{code,message,fieldErrors?},requestId}`。`fieldErrors` 虽在契约中可选，当前这些服务端校验通常只返回通用 `message`，不能依赖逐字段错误。App 的名称和码格式会先作本地校验。

| HTTP / code              | 实际触发及界面处理                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400 VALIDATION_ERROR     | 名称、封面组合、UUID、query、码格式不合法，缺少/非法幂等键，或 A10 携带 body。参数校验通常为“请求参数不正确”；缺少键为“缺少有效的 Idempotency-Key”。原页核对输入 |
| 401 UNAUTHENTICATED      | 未登录、令牌/会话无效；客户端按认证流程处理，无法续期时重新登录                                                                                                  |
| 403 FORBIDDEN            | A07/A08 非成员；不存在账本也统一 403。A09/A10 普通成员与非成员同样被拒绝。App 不展示创建者管理入口                                                               |
| 400 INVITE_INVALID       | A11/A12 码不存在或已重置撤销，提示核对邀请码；已是成员也不能使用被撤销的码                                                                                       |
| 409 INVITE_INVALID       | A09 在创建者有权限但没有当前邀请时，提示重新生成；区别于 preview/join 的 400                                                                                     |
| 409 INVITE_EXPIRED       | 非成员 preview 或实际 join 时邀请已过期，提示联系创建者重新生成；已是成员使用未撤销的过期码仍能预览/进入，join 返回 alreadyMember:true                           |
| 409 MEMBER_LIMIT_REACHED | **确认加入**时已达 12 人；预览本身返回 200、canJoin:false。已有成员不受这项阻止                                                                                  |
| 409 LEDGER_FROZEN        | A10 重置或非成员 A12 加入时已非 ACTIVE；**预览仍为 200、canJoin:false**。已是成员仍可预览/进入；A09 可读取当前邀请                                               |
| 409 IDEMPOTENCY_CONFLICT | 同一用户/操作/键但内容不同；核对原提交，不直接换键重复写                                                                                                         |
| 501 FEATURE_NOT_READY    | A05 自定义封面、A27 个人归档等未接通业务；不展示为可用                                                                                                           |
| 429 RATE_LIMITED         | 认证后这些路由每分钟每路由限流 120 次，提示稍后手动重试                                                                                                          |

preview 是只读事务，不冻结、不增加成员；确认加入会重新核验状态、邀请与人数，所以预览成功后仍可能过期、被重置、满员或冻结。满员/冻结已是成员的优先行为，按上表区分；不要把所有 409 一概当成无效码。A09 返回 200 `expired:true` 表示当前邀请存在但过期，不能直接把这个成功状态当成可分享。

客户端写入提交中禁用重复点击；网络错误、超时、5xx 等结果未知时保留原表单与键，只有用户明确点击才重试原提交或回列表在线核对。不建立离线队列、不自动重试业务写入。[客户端提交封装](../apps/mobile/src/lib/use-idempotent-write.ts)只允许在首次尝试起 24 小时内显式重试，超过后要求先在线核对；这是客户端限制，区别于服务端 7 天幂等结果保留。成功重放返回首次快照，成员数/版本可能较当前旧，应重新 GET 详情。

## 从 App 实操：甲创建、乙加入

前置：真实 API/数据库已迁移，开发客户端已安装，Metro 与 App 的 API 地址一致。首次或原生配置变更先执行 `pnpm build:ios` / `pnpm build:android`；日常按[开发说明](development.md)启动。两个独立真实账号先完成注册或由测试准备步骤通过真实注册接口创建；本轮使用后者，App 中正常输入账号密码登录。不要使用假登录或注入会话。

1. **甲登录。** 进入账本列表，点右上角 + →「创建新账本」。填 1–40 字名称、选择预设封面 →「创建并邀请成员」。本轮建账名称为 `Issue19-20 Native`，成功进入邀请页，显示真实码 `ATTJK6`、创建者甲、1/12 人。[创建后的实际页面](evidence/issue19/01-created-invitation.png)。自定义封面入口标明暂未开放。
2. **核对甲端。** 点「进入账本」→「查看成员」，甲为创建者。邀请页可复制邀请码；成员面板与详情中的邀请入口只向 ACTIVE 创建者展示。系统分享不改变账本成员；用户必须在乙端再次预览、确认。
3. **切换乙。** 返回列表 →「我的」→「退出登录」→「确认退出」，乙正常登录。本轮乙加入前列表为空，不能读取甲的私有账本。
4. **先检查错误。** + →「有邀请码？加入账本」。非法格式会提示“请输入 6 位邀请码（不含 0、1、I、O）”；格式合法但不存在的 `ZZZZZZ` 得到服务端无效码错误，留在原页并保留输入。[无效码](evidence/issue19/02-invalid-code.png)。输入过期的真实码得到过期提示，应联系甲重置；不是连续点加入。[过期码](evidence/issue19/03-expired-code.png)。本轮过期通过精确修改隔离邀请时间复现，已恢复；实际成员不需要操作数据库。
5. **乙预览。** 输入甲的有效六位码 →「查看账本」，面板核对名称、创建者、人数；此时仍 1/12，没有加入。可「暂不加入」取消。[本轮预览](evidence/issue19/04-preview-one-member.png)。扫码按钮当前不可用，按手输路径操作。
6. **乙确认。** 点「加入Issue19-20 Native」，请求成功才进入账本；成员为 2/12，甲是创建者、乙是成员，乙没有重置/邀请入口。[乙成员面板](evidence/issue19/05-b-members.png)。若确认时已过期等，在原确认面板处理错误；确定失败后取消再获取新预览，未知结果使用原提交重试或回列表核对。
7. **核对重复操作与恢复。** 乙再次从加入入口输入同一码，提示已是成员，点击「进入账本」直接导航，不再发 join 写请求。[已是成员](evidence/issue19/06-already-member.png)。终止并重开 App，在线恢复会话后仍读到该账本。[冷启动列表](evidence/issue19/07-b-cold-start.png)。甲重新登录后看到相同两人及角色。[甲成员面板](evidence/issue19/08-a-members.png)。
8. **核对重置。** 甲在成员面板选择「重置邀请码」→「确认重置」，成功后显示 `F2KNYV`，人数仍 2/12。[新邀请](evidence/issue19/09-reset-invitation.png)。旧码 `ATTJK6` 此后不可再用；把新码提供给尚未加入的人，既有成员不受影响。邀请码是本轮测试状态，后续复现必须使用当时实际返回的新码。

本轮在同一台 iPhone 18 Pro / iOS 27.0 模拟器中先后切换账号，没有宣称双设备同时验证。截图均为当前主线 JS 配合已安装开发客户端，不代表本轮重新编译原生安装包。Android 组件测试、双端 JS 导出与物理真机验收互不替代。

## 核对结果与仍未开放项

按上述路径实际操作通过，版本与环境见 [#19 记录](issue19-native-environment-validation.md)。[原生请求日志](evidence/issue19/native-requests.json)证明一次创建、一次加入、一次重置及相应查询；[额外 HTTP/SQL 验证](evidence/issue19/http-database.json)核对完整响应字段、双账号列表/详情/成员一致、权限、幂等重放/冲突、无效参数、旧码撤销和重复加入。额外 HTTP 重复加入不是 App 的重复写请求。最终 SQL 为账本 1、成员 2、version=2、当前邀请 1、消费 0。

本轮主要接口/手输流程依赖已齐备。App 扫码、封面图片绑定、个人归档仍未开放；消费改删、统计、完整结算进度/登记已还/结清也不在本索引的已完成功能中。A27 即使在 contracts 登记也仍返回 501（先检查成员）；不要将 `archived=true` 查询存在误解为已能个人归档。

后续接口实现变更应同时更新本索引、对应模块说明和实际复测记录；截图或结论必须注明新的提交。本文交付账本/邀请阶段，不改 Issue 全部任务的点数，也不把后续 T18 内容提前写成完成。
