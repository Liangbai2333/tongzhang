# 工程骨架验收记录

> 启动与部署入口已调整；本页历史验收不代表新流程验收，当前命令见 [开发说明](development.md)。历史命令 `pnpm build:api` 现已更名为 `pnpm build:server`。
> 日期：2026-10-13。此页保留初始骨架验收结果；当前模块骨架、数据库与依赖验证见[模块骨架验证记录](module-skeleton-validation.md)。

| 验证项                  | 结果                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| 工作区                  | 2 个应用 + 2 个共享包，单一 pnpm 锁文件                                             |
| `pnpm check`            | 类型、Lint、格式检查通过                                                            |
| `pnpm test`             | 11 项测试通过                                                                       |
| `pnpm test:integration` | 专用 PostgreSQL 测试库，1 项通过                                                    |
| `pnpm build:api`        | API 与共享包编译通过                                                                |
| `pnpm export:mobile`    | Android / iOS 的 Hermes JS 包导出通过                                               |
| Expo Doctor             | 21/21 检查通过                                                                      |
| 依赖兼容性              | `expo install --check` 通过；`pnpm peers check` 无冲突                              |
| 本机 API                | 3300 端口，存活、数据库就绪、项目约定及 OpenAPI 请求均返回 200                      |
| 热更新                  | API 与共享包 watcher 可启动；共享包重新编译触发 API 重启                            |
| 移动端开发服务          | Metro 在 8081 正常启动                                                              |
| iOS 快捷启动            | `pnpm dev:ios` 自动启动数据库/API/模拟器；已安装时跳过原生编译；Ctrl+C 停止开发进程 |
| iOS 原生验证            | Xcode 27、iPhone 18 Pro / iOS 27：编译安装成功，联调页显示 API 与数据库已连接       |
| Docker                  | 镜像构建通过；容器连接 PostgreSQL，健康检查返回 200；生产 `/docs` 返回 404          |
| 迁移入口                | 本机及容器均可执行；当前无业务表，明确提示暂无迁移                                  |
| 配置                    | `.env`、编译结果和依赖目录已忽略；生产 Compose 配置校验通过                         |

本机数据库保留运行，数据卷保留；验证用 API、Metro 进程和临时 API 容器已停止。使用 README 的命令重新启动。

未验收：物理真机、Android 原生安装、发行 APK/IPA、云端 CI 执行、真实域名部署。尚未实现业务表、认证、记账、邀请和结算。

iOS 已通过 `expo-build-properties` 启用 `enableSceneSupport`，修复 iOS 27 启动时退出的问题；配置依据见 [Expo 官方说明](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27)。原生构建有本机 Metal toolchain 路径及上游构建脚本的警告，未阻止安装与运行。

依赖基线：Node 24.21.0、pnpm 12.6.0、TypeScript 6.0.3、Expo SDK 57、React 19.2.3、React Native 0.86.3、Fastify 5.12.7、Drizzle ORM 0.45.4、PostgreSQL 17。具体解析版本以锁文件为准。

## 2026-10-22 环境与部署流程调整验证

- `pnpm check`、`git diff --check` 通过；无数据库测试 36 项通过（含配置校验、可信代理限流、发布迁移失败中止测试）。
- 专用 PostgreSQL 测试库的 4 项集成测试通过；`pnpm setup` 在已有开发配置与数据卷上成功执行。
- Docker 镜像使用 Node 24.21.0，生产依赖裁剪成功。隔离容器测试验证含特殊字符的密码、两次迁移、真实数据库、健康接口、生产 `/docs` 关闭、Argon2/Sharp、非 root 用户及 Caddy 配置。
- `check:mobile-deps`、Expo Doctor 21/21、生产 variant 的 Android/iOS JS 导出通过。
- Xcode 27 / iPhone 18 Pro / iOS 27 下，`pnpm build:ios --device <UUID>` 完成 Prebuild、编译、安装与打开。存在 Metal toolchain 路径及上游构建脚本警告，未阻止构建。
- `pnpm dev` 保留 Metro 终端快捷键，`pnpm dev:ios` 自动打开已安装客户端；联调页显示 API 与数据库已连接。端口占用会明确失败；Ctrl+C 后 API/Metro 端口释放，开发数据库保留。
- 发布脚本顺序与迁移失败路径使用模拟命令验证；没有执行实际生产发布。尚未执行 GitHub 云端工作流、推送镜像、真实域名 TLS 部署、生产备份恢复或 Android 原生安装。

## 2026-10-22 Android 本机配置与原生验收

- 本机验收使用已安装的 Corretto JDK 17、现有 Android SDK 路径和两个 Gradle worker；机器路径未提交到仓库。
- Gradle 安装了 Platform 36、NDK 27.1.12297006、Build-Tools 35.0.0 和 CMake 3.22.1；已有 Build-Tools 36.0.0 继续作为项目配置值。未手工修改生成的 Android 源码。
- `pnpm build:android --device Medium_Phone` 完成 Prebuild 并启动首次构建；下载长时间无输出后中止该次构建，使用同一工具链、详细日志和较短网络超时重新执行 `expo run:android --no-bundler --device Medium_Phone`，最终原生构建成功，APK 安装并打开。
- 验收设备为现有 Medium_Phone 模拟器（Android 14、ARM64）。`adb reverse tcp:3300 tcp:3300` 后共用现有 `localhost:3300` API 地址和 Metro，联调页显示“API 与数据库已连接”，Android 崩溃日志为空。
- `pnpm check`、`git diff --check` 通过。Android SDK XML 版本及上游依赖弃用警告未阻止构建。未验证物理 Android 真机、发行 APK/AAB、签名或商店发布。
