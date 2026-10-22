# 开发说明

## 1. 初始化

使用 `.node-version` 中的 Node 24 版本、根 package.json 固定的 pnpm 12.6.0。执行：

```bash
pnpm install
pnpm env:setup
pnpm db:up
pnpm db:migrate
```

`env:setup` 只复制缺失的环境文件，不覆盖已有配置。开发数据库的固定口令仅供本机使用；端口 35432 只绑定 127.0.0.1。

当前没有业务表。`db:migrate` 会验证数据库可连接并明确提示暂无迁移；后续定义 schema 后执行 `db:generate`，审查生成 SQL，再执行 `db:migrate`。

## 2. 启动

两个终端分别执行 `pnpm dev:api` 和 `pnpm dev:mobile`。两条命令均先构建共享包，随后监听其变更；API 默认监听 0.0.0.0:3300，Expo 默认使用 8081。

若同时运行两端，可减少重复的共享包 watcher：第一终端正常运行 `pnpm dev:api`，第二终端使用 `pnpm --filter @tongzhang/mobile dev`。

在浏览器打开 `http://localhost:3300/docs` 可查看开发接口；这只是接口文档，不是产品 Web 版本。

## 3. 真机与模拟器

修改 `apps/mobile/.env` 中的 `EXPO_PUBLIC_API_BASE_URL`：

| 设备                  | 地址                                                 |
| --------------------- | ---------------------------------------------------- |
| iOS 模拟器            | `http://localhost:3300`                              |
| Android Studio 模拟器 | `http://10.0.2.2:3300`                               |
| 真实手机              | `http://电脑局域网IP:3300`，手机与电脑处于可互通网络 |
| 演示安装包            | 已部署的 HTTPS API 域名                              |

修改环境变量后重启 Expo。变量会编入客户端，不可包含服务端密钥。

首次使用开发客户端，需要本机 Android SDK / Xcode 或 EAS 构建环境：

```bash
# 本机 Android 构建并安装
pnpm --filter @tongzhang/mobile android

# 本机 iOS 构建并安装（macOS + Xcode）
pnpm --filter @tongzhang/mobile ios
```

没有原生工具链时，可在安装了兼容 SDK 57 的 Expo Go 后，临时用 `pnpm --filter @tongzhang/mobile exec expo start --go` 查看骨架。后续涉及原生配置的正式联调使用 Development Build。

EAS 构建配置已提供，但尚未绑定 Expo 项目、账号或签名；不会在本阶段自动发起云构建。包名暂定 `com.tongzhang.app`，正式签名前确认唯一性。

开发构建允许局域网 HTTP；preview / production 禁止明文通信，必须配置 HTTPS。当前移动端仅支持 GET 联调；认证头、提交幂等键和上传在业务阶段接入，不存在已完成的登录能力。

## 4. 检查与测试

```bash
pnpm check
pnpm test
pnpm build:api
pnpm mobile:export
pnpm --filter @tongzhang/mobile exec expo install --check
pnpm dlx expo-doctor apps/mobile
```

`mobile:export` 只导出 Android / iOS JS 包到被忽略的 `apps/mobile/dist`，不生成 APK / IPA。使用原型业务前仍需真机验证。

集成测试使用独立测试库：

```bash
docker compose -f infra/compose.dev.yml exec -T postgres createdb -U tongzhang tongzhang_test
TEST_DATABASE_URL=postgresql://tongzhang:tongzhang_local_only@127.0.0.1:35432/tongzhang_test pnpm test:integration
```

创建测试库只需一次。后续业务测试不能连接生产数据库。

## 5. 新增模块

1. 在 `packages/contracts/src` 增加接口 Schema 和类型，并导出。
2. 在 `apps/api/src/db/schema` 增加需要的表，生成并审查迁移。
3. 在 `apps/api/src/modules` 实现路由、业务服务和 Repository，在 `app.ts` 注册。
4. 在 `apps/mobile/src/features` 实现业务页面；`app` 中只放导航入口。
5. 验证权限、金额和数据库事务；检查通过后提交。

服务端共享包导入使用包名，内部 ESM 导入使用 `.js` 后缀。移动端使用 `@/` 指向 `src/`。API 源码仅用 Node 环境，避免往共享包引入 `pg` 或 Node 内建模块。

## 6. 容器与部署

构建 API 镜像：

```bash
docker build -f infra/api.Dockerfile -t tongzhang-api:dev .
```

生产 Compose 是部署起点，尚未部署。先复制 `infra/.env.example` 为未跟踪的 `infra/.env`，配置域名、强口令和对应的数据库 URL（密码中的特殊字符需 URL 编码）。随后在服务器执行：

```bash
docker compose --env-file infra/.env -f infra/compose.prod.yml build api
docker compose --env-file infra/.env -f infra/compose.prod.yml up -d --wait postgres
docker compose --env-file infra/.env -f infra/compose.prod.yml run --rm api node --experimental-strip-types scripts/migrate.ts
docker compose --env-file infra/.env -f infra/compose.prod.yml up -d
```

数据库不暴露公网，Caddy 对外提供 HTTPS。镜像保留迁移工具和源码供单独迁移使用；后续需要缩小镜像时再拆运行与迁移镜像。

`pnpm db:down` 停止本地数据库并保留卷。不要通过删除卷处理普通启动问题。备份定时任务与恢复演练在部署阶段落实。
