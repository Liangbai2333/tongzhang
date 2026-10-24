# 账号与会话模块设计

## 1 职责与边界

注册、登录、访问令牌验证、刷新、在线恢复和退出；将账号身份交给后续账本权限判断。JWT 不保存账本权限，成员授权仍在业务服务实时执行。

| 项目     | 归属                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 服务端   | `apps/server/src/modules/auth/`                                                                                           |
| 移动端   | `apps/mobile/src/features/auth/`、`src/lib/auth-session.ts`、`src/lib/session-token.ts`、`src/providers/AuthProvider.tsx` |
| 共享契约 | `packages/contracts/src/auth.ts` 与 `endpoints.ts`                                                                        |
| 数据     | users（注册写入）、auth_sessions、auth_refresh_tokens                                                                     |

## 2 子功能与接口

| 编号 | 操作       | 方法与路径                   | 幂等键 |
| ---- | ---------- | ---------------------------- | ------ |
| A01  | `register` | `POST /api/v1/auth/register` | 不使用 |
| A02  | `login`    | `POST /api/v1/auth/login`    | 不使用 |
| A03  | `logout`   | `POST /api/v1/auth/logout`   | 不使用 |
| A30  | `refresh`  | `POST /api/v1/auth/refresh`  | 不使用 |

注册和登录返回 `{ data: { user, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } }`。刷新仅接收 `{ refreshToken }`，返回相同的四个令牌字段，不要求未过期的 Access Token；退出仍使用 Access Token 的 Bearer 认证。所有响应 `Cache-Control: no-store`。注册、登录、刷新每来源 IP 每分钟最多 10 次。

`getMe`（A04）由 profile 模块提供，移动端在线恢复时调用。刷新不写业务幂等结果表，不支持通过重复刷新取回丢失的响应；客户端不得自动重试。

## 3 令牌和数据规则

- 密码使用 Argon2id。注册在同一事务写 users、auth_sessions、auth_refresh_tokens；重复邮箱返回 EMAIL_TAKEN。登录仅创建独立会话，用户名重名要求使用邮箱。
- Access Token 为 HS256 JWT，`typ=at+jwt`，`iss=tongzhang-api`，`aud=tongzhang-mobile`，`sub` 是用户 UUID，`sid` 是会话 UUID，包含 `iat` 和 `exp`。最长 15 分钟，不超过会话绝对到期时间。严格校验算法、签名、类型、签发者、受众、字段与有效期。
- `AUTH_JWT_SECRET` 为随机 32 字节的小写 hex（64 字符），只在服务端环境配置，无默认共享密钥。配置非法或缺失即拒绝启动。JWT 不包含密码、邮箱、余额或成员权限。
- Refresh Token 为随机 32 字节的 base64url 字符串；服务端只保存 SHA-256 摘要。会话从创建起固定最长 30 天，轮换不延长期限。
- `auth_sessions` 保存会话 ID、用户 ID、创建、到期和撤销时间。`auth_refresh_tokens` 保存摘要主键、会话 ID、消费与创建时间；删除会话时级联删除其摘要。
- 每次 API 请求验签后仍查会话表，校验身份与会话匹配、未过期且未撤销。在线退出提交后，后续请求携带任一旧 Access Token 都返回 401；已经进入处理的请求不承诺取消。

## 4 刷新事务与并发

1. 根据摘要找到会话，在 service 管理的事务中锁定该会话行，再读取令牌消费状态。
2. 会话不存在、到期或已撤销，返回统一 UNAUTHENTICATED（401）。
3. 如果摘要已消费，撤销所属会话。先提交事务，再返回 401，不能抛错回滚撤销。
4. 否则将旧摘要标为已消费，创建新随机令牌及摘要，签发新 Access Token，原子提交后返回新令牌对。

已消费摘要必须保留到会话清理，以识别任意旧令牌重放。并发重复刷新中至多一个请求轮换成功，另一请求检测重放并撤销会话，包括刚签发的令牌对。刷新与退出通过同一会话行锁串行化，退出成功后的最终状态始终撤销。不同登录各自使用独立会话。

密码、原始令牌不进入日志、业务缓存或幂等结果。无效和重放均不向客户端暴露数据库或摘要信息。

## 5 移动端组织与交互

`auth-session.ts` 管理内存 Access Token、并发刷新、凭据写入顺序及会话版本；`session-token.ts` 注入 SecureStore 和真实刷新请求。仅 Refresh Token 持久化。使用版本隔离，已退出或切换账号后迟到的刷新不能恢复旧令牌，旧请求的 401 也不能清除新账号。

`AuthProvider` 提供用户、恢复状态、错误及登录/注册/恢复/退出方法；App 启动在线恢复并获取 `getMe`。登录/注册 API 成功保存凭据后，Provider 再在线获取用户资料。恢复网络失败可由界面显式重试，不伪造已登录用户。默认进入欢迎、登录和注册页面；成功后进入受保护的真实账号页，未接通的账本功能仅显示未就绪说明。恢复状态和错误保留在根容器内，不新增全屏错误路由。

受保护的 JSON 与图片接口共享同一请求前检查，Access Token 剩余不足 30 秒时刷新，并发请求只发起一次。业务请求发送失败后不自动重试，即使返回 401 也不自动刷新并重放；401 清除会话，写表单保留内存输入及原幂等键供手动处理。

刷新预检查离线或明确返回 429 时保留凭据；超时、连接中断、无效响应或服务端错误导致轮换结果不确定时清除本地凭据，提示重新登录，避免重用可能已经消费的 Refresh Token。401 直接清除会话。

退出分别尝试服务端撤销与本地清理，返回 `serverRevoked` / `localCleared` 两项结果。Provider 保留跨导航的结果提示并清空用户查询缓存；远端未确认或本地删除失败时不能声称已完全退出，本地清理失败提供显式重试入口。注册/登录表单和协议仍沿用原页面与面板约定；退出/切换账号时卸载用户页面以清除表单状态。

## 6 迁移与验证

`0001` 迁移撤销全部旧单令牌会话，删除会话上的旧 token_hash，新增刷新摘要表。客户端删除旧 `tongzhang.session.token` 项，使用新的 Refresh Token 项，用户必须重新登录。发布时按既有独立迁移流程执行，API 启动不迁移。

无数据库测试覆盖 JWT 验证、客户端单次刷新、提前刷新、写请求不重发、401 清理、刷新不确定结果和迟到响应。真实 PostgreSQL 集成测试覆盖注册/登录/资料、轮换和摘要存储、重放撤销、并发刷新、刷新与退出竞态、绝对到期及不同会话隔离。原生安装与真机交互须单独验收，JavaScript 导出通过不代表真机通过。本轮 iOS 模拟器真实账号验证和截图见[移动端认证实现与验证](../mobile-auth-validation.md)。
