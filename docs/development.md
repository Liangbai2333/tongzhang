# 环境、开发与部署

## 1. 职责与配置来源

| 层级       | 职责                                                   | 入口                                               |
| ---------- | ------------------------------------------------------ | -------------------------------------------------- |
| 应用配置   | 校验变量、生成数据库连接参数；不启动容器               | 服务端 `src/config/env.ts`、移动端 `app.config.ts` |
| 开发初始化 | 创建缺失的配置、启动开发数据库、执行首次迁移           | `pnpm setup`                                       |
| 开发运行   | 检查数据库与端口、首次编译、启动 watcher / API / Metro | `pnpm dev`、`dev:ios`、`dev:android`               |
| 原生构建   | Prebuild 应用 config plugin，然后编译安装开发客户端    | `pnpm ios:build`、`android:build`                  |
| 基础设施   | 数据库、卷、容器网络、HTTPS                            | `infra/compose.*.yml`                              |
| 数据库迁移 | 独立执行已提交 SQL；失败即中止                         | `pnpm db:migrate`、生产 `migrate` 服务             |
| CI         | 检查、测试、构建及容器验证，不访问生产                 | `.github/workflows/ci.yml`                         |
| 镜像发布   | 手动触发检查，发布验证过的镜像到 GHCR                  | `.github/workflows/publish.yml`                    |
| 生产部署   | 拉取指定镜像、备份、迁移、更新、健康验收               | `bash infra/deploy.sh`                             |

只有三份人工维护的环境文件：

| 文件                  | 读取者                       | 用途                                 |
| --------------------- | ---------------------------- | ------------------------------------ |
| `apps/server/.env`    | 本机 API、迁移、开发 Compose | 本地数据库连接与 API 运行参数        |
| `apps/mobile/.env`    | 本机 Expo                    | 公开 API 地址、构建类型              |
| 服务器的 `infra/.env` | 生产 Compose                 | 发布镜像、域名、数据库凭据与日志设置 |

真实 `.env` 不提交、不进入镜像。模板为对应 `.env.example`。`env:setup` 只创建缺失文件，不覆盖已有值，也不生成生产配置。服务端仅在本地开发加载自己的 `.env`，生产、测试和 CI 只使用进程环境变量；进程中已设置的值优先。移动端发布配置由 EAS 的对应 environment 提供，API 地址会进入安装包，绝不能填密钥。

Compose 的 `--env-file` 给 `${变量}` 提供值，只有 `environment` 显式声明的变量才进入容器。宿主机 shell 中的同名变量优先于 env 文件；部署时避免遗留同名变量。不要把整个部署文件用 `env_file` 注入所有服务。

### 服务端与数据库变量

| 变量                                   | 开发示例           | 说明                                              |
| -------------------------------------- | ------------------ | ------------------------------------------------- |
| `NODE_ENV`                             | `development`      | 生产 Compose 固定为 `production`                  |
| `HOST` / `PORT`                        | `0.0.0.0` / `3300` | API 监听地址与端口                                |
| `PGHOST`                               | `127.0.0.1`        | 本机 API 访问宿主机；容器里固定为 `postgres`      |
| `PGPORT`                               | `35432`            | 开发数据库发布到宿主机的端口；容器间固定为 `5432` |
| `PGUSER` / `PGPASSWORD` / `PGDATABASE` | 见模板             | 同时提供给开发数据库和本机 API                    |
| `LOG_LEVEL`                            | `info`             | 服务端日志级别                                    |
| `TRUST_PROXY`                          | 空                 | 本机不信任转发头；生产只信任专用代理网段          |

生产只定义一次 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`，Compose 将其分别映射给 PostgreSQL 和 API 的 `PG*` 变量。密码直接传给数据库驱动，无需 URL 编码。含 `$` 的 dotenv 值用单引号包裹，其他引号按 dotenv 规则转义。

旧版 `DATABASE_URL` 已停用；已有开发文件需要拆成上述五个 `PG*` 参数，并移除旧变量。`TEST_DATABASE_URL` 专供真实数据库测试，不是应用运行配置。

数据库镜像的初始化变量只在空数据卷首次初始化时生效。修改 `.env` 不会自动修改已有数据库的用户或口令；需要显式修改数据库并同步配置，不能通过删卷解决。

## 2. 首次准备与日常开发

环境使用 `.node-version` 指定的 Node 24 和根 `packageManager` 指定的 pnpm。手动启动 Docker Desktop；脚本不会打开桌面应用。

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm ios:build
pnpm dev:ios
```

Android 将后两条换成 `pnpm android:build`、`pnpm dev:android`，需要本机 Android SDK。iOS 需要 macOS、Xcode、模拟器 runtime 和 CocoaPods。原生构建不依赖 API 或数据库，也不启动 Metro。

### Android 本机工具链

安装 Android Studio，并在 SDK Manager 中安装 Android SDK Platform 36、Build-Tools 36.0.0、Platform-Tools 和 Android Emulator。当前 React Native 依赖使用 NDK 27.1.12297006；首次 Gradle 构建会在已接受 SDK 许可后下载缺少的组件。Apple Silicon 使用 ARM64 模拟器，已有 Android 14 或更高版本的模拟器即可，不必为编译 API 36 另建同版本模拟器。

使用 JDK 17，将 `ANDROID_HOME` 指向本机 SDK，将其 `platform-tools` 和 `emulator` 目录加入 PATH。使用 mise 时，可将本机配置放在根目录 `mise.local.toml`（已忽略，不提交机器路径）：

```toml
[tools]
java = "corretto-17"

[env]
ANDROID_HOME = "/你的用户目录/Library/Android/sdk"
GRADLE_OPTS = "-Dorg.gradle.workers.max=2"

[env._]
path = ["/你的用户目录/Library/Android/sdk/platform-tools", "/你的用户目录/Library/Android/sdk/emulator"]
```

`mise install` 后可通过 `mise exec -- pnpm android:build` 使用这套工具链。已在 shell 激活 mise 时，进入项目后直接执行 pnpm 命令即可。两名 Gradle worker 用于降低本机首次构建负载；不影响发布配置。

```bash
java -version
adb devices
emulator -list-avds
pnpm android:build --device Medium_Phone  # 替换为上一步列出的模拟器名称
```

若 iOS 与 Android 共用 `http://localhost:3300`，在 Android 模拟器启动后执行 `adb reverse tcp:3300 tcp:3300`，将设备的 API 端口转发到电脑。然后执行 `pnpm dev:android`；已有 Metro 时直接在其终端按 `a`，无需启动第二套开发进程。设备重启或重新连接后需重新执行端口转发；多设备时用 `adb -s <序列号> reverse ...`。也可按下表将 Android 的 API 地址设为 `10.0.2.2`。

工具安装参考 [Expo Android 模拟器说明](https://docs.expo.dev/workflow/android-studio-emulator/)。首次构建会下载 Gradle、SDK/NDK 和 Maven 依赖；完成后保留缓存，日常只运行 Metro 与开发客户端。

### 日常运行

日常使用：

```bash
pnpm db:up       # 数据库没运行时执行
pnpm dev:ios     # 或 dev:android；dev 不自动打开平台
```

`dev` 检查数据库与端口，按依赖顺序构建共享包和 API，再启动一个共享包 watcher、API watcher 与 Metro。初始编译保证没有 `dist` 的干净工作区也可运行。它不会执行迁移、原生构建、复用旧 API 或修改模拟器系统偏好。端口已占用时明确报错。Ctrl+C 停止本次开发进程，保留数据库和模拟器。

Metro 独占终端输入和原生终端输出；其他进程的日志带名称前缀。可以按 `i` / `a` 打开平台、`Shift+i` / `Shift+a` 选设备、`r` 刷新。设备选择、安装和 deep link 由 Expo CLI 管理。

添加原生依赖、修改 app config/config plugin 后，停止 dev，再执行 `pnpm ios:build` 或 `pnpm android:build`。命令先运行 Prebuild，再执行 `expo run:* --no-bundler`。可传 `--device` 进入 Expo 设备选择，例如 `pnpm ios:build --device`。保留 SDK 57 的 `enableSceneSupport`，满足 Xcode 27 / iOS 27 要求。不要手工修改生成的 ios/android。

仅启动 API 可用 `pnpm dev:server`（包含共享包 watcher）。配合它时，在另一终端执行 `pnpm dev:mobile`；后者只做一次共享包构建并启动 Metro，不再开第二组 watcher。

## 3. 移动端地址与发布配置

| 环境                 | `EXPO_PUBLIC_API_BASE_URL` |
| -------------------- | -------------------------- |
| iOS 模拟器           | `http://localhost:3300`    |
| Android 模拟器       | `http://10.0.2.2:3300`     |
| 物理真机             | `http://电脑局域网IP:3300` |
| preview / production | 实际部署的 HTTPS API 地址  |

修改 `apps/mobile/.env` 后重启 Metro。若改变 API 端口，同步更新移动端地址。所有地址都指向 API；本项目没有 Web 应用。

`APP_VARIANT=development` 允许开发 HTTP；`production` 禁止原生明文通信。preview 和 production 的 EAS profile 显式设置生产 variant，缺失或无效的 HTTPS API 地址会在读取 app config 时失败。EAS environments 分别为 development / preview / production，需要在 Expo 项目中设置各自的 `EXPO_PUBLIC_API_BASE_URL`。目前尚未绑定 Expo 项目、签名或执行云构建。

## 4. 迁移、检查与测试

首次迁移由 setup 执行；拉到新迁移后执行：

```bash
pnpm db:migrate
```

修改 Schema 后执行 `pnpm db:generate`，审查并提交 `apps/server/drizzle` SQL，再迁移。迁移入口使用同一连接持有 advisory lock，串行执行；缺失迁移清单会失败。API 启动不会修改表结构，`/health/ready` 只证明数据库可连接，不代表迁移已应用。

```bash
pnpm check
pnpm test
pnpm build:server
pnpm mobile:deps
pnpm mobile:doctor
pnpm mobile:export
```

真实数据库测试使用名称以 `_test` 结尾的专用库。以下命令采用模板的默认开发参数；若修改了凭据或端口，请对应调整：

```bash
docker compose --env-file apps/server/.env -f infra/compose.dev.yml exec -T postgres createdb -U tongzhang tongzhang_test
TEST_DATABASE_URL=postgresql://tongzhang:tongzhang_local_only@127.0.0.1:35432/tongzhang_test pnpm test:integration
```

测试库创建一次即可；测试自行应用迁移。`pnpm test` 不需要数据库。`mobile:export` 只验证 Android / iOS JavaScript 打包，不生成 APK/IPA，不等于原生安装或真机验收。

容器验证使用临时 Compose 项目和独立数据库，不读取开发或生产 `.env`：

```bash
docker build --build-arg NODE_VERSION="$(cat .node-version)" -f infra/server.Dockerfile -t tongzhang-server:check .
pnpm container:test
```

它验证真实数据库、两次迁移、HTTP 健康接口、生产 docs 关闭、原生 Node 依赖、非 root 用户和 Caddy 配置，并清理自己的临时卷。它不验证域名 DNS 或真实 TLS 证书。默认测试网段为 `172.31.240.0/28`，冲突时设置 `TEST_PROXY_SUBNET`。

## 5. 生产发布与部署

生产主机需要 Docker Compose、bash 和支持 `--retry-all-errors` 的 curl，不需要 Node、pnpm 或源码编译。只需复制 `infra/compose.prod.yml`、`Caddyfile`、`deploy.sh` 和部署 `.env`。

1. 在 GitHub Actions 手动触发 **Publish server image**，选择要发布的 ref。工作流先执行完整 CI，再构建、验证并推送同一个镜像到 GHCR。当前 GitHub Linux runner 产出 linux/amd64 镜像，适用于 x86_64 服务器；ARM 服务器需单独提供对应架构产物。
2. 将工作流摘要中的完整镜像 digest 填入服务器 `.env` 的 `SERVER_IMAGE`。仓库只读令牌用于私有 GHCR 的 `docker login`，不要放入移动端。普通 PR CI 不使用生产凭据或发布镜像。
3. 从 `infra/.env.example` 创建服务器 `.env`，设置数据库凭据和 `API_DOMAIN`，限制文件权限为 600。域名解析指向服务器，并开放 80/443。API 和数据库都没有宿主机端口。
4. 执行发布：

```bash
bash infra/deploy.sh
# 也可显式传入服务器上的配置文件
bash infra/deploy.sh /secure/tongzhang.env
```

发布顺序：校验 Compose → 获取本机发布锁 → 拉取镜像 → 等待 PostgreSQL → 保存部署前备份 → 独立迁移 → 更新 API/Caddy 并等待健康 → 验证公网 HTTPS readiness → 记录发布结果。任一步失败即停止，不自动重试迁移和写操作；只对只读 HTTPS 检查做有限重试。失败不会自动执行数据库降级。

生产 API 仅信任 `PROXY_SUBNET` 中的代理转发头，Caddy 与 API 使用专用网络，数据库位于另一个内部网络。网段冲突时调整 `.env`；不要把 `TRUST_PROXY` 改为无条件信任。数据库暂时不可用时 readiness 返回 503。

生产 Node 版本与 `.node-version` 对齐。PostgreSQL/Caddy 当前固定主版本标签，拉取可能更新其补丁版本；正式运维如要求完全复现，应将这两个基础设施镜像也固定到审核过的 digest，并主动安排更新。

### 备份与恢复

发布前备份保存在 `infra/backups`，发布成功记录在 `infra/.deployments.log`，均不提交。没有部署时也需要每日备份，部署前备份不能代替定时备份；服务器运维需配置备份计划、保留周期、加密异机副本，并定期恢复验证。

手动备份（从仓库/部署目录根执行）：

```bash
umask 077
mkdir -p infra/backups
docker compose --env-file infra/.env -f infra/compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > infra/backups/manual.dump
```

恢复演练使用新建的独立数据库，不覆盖线上库：

```bash
docker compose --env-file infra/.env -f infra/compose.prod.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" tongzhang_restore_test'
docker compose --env-file infra/.env -f infra/compose.prod.yml exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d tongzhang_restore_test' < infra/backups/manual.dump
```

检查表、关键业务数据和图片后再记录演练结果。应用回退前确认旧镜像兼容当前 Schema，再将 `SERVER_IMAGE` 改回上一 digest 并更新 server；回退应用不会回退数据库。破坏性迁移需单独安排维护窗口和数据库恢复方案。不要在生产运行 `down --volumes`。

## 6. 模块开发入口

接口与类型放 `packages/contracts`；业务表放 `apps/server/src/db/schema`；服务端模块执行权限、事务和业务规则；移动端页面放 `src/features`，`app` 仅放路由入口。模块边界与验收要求见 [模块架构](modules/README.md) 和 [AGENTS.md](../AGENTS.md)。

参考：[Expo CLI](https://docs.expo.dev/more/expo-cli/)、[SDK 57 BuildProperties](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/)、[Compose 环境变量插值](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)。
