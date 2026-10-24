# 成员环境配置：macOS、Linux 与 Windows

按操作系统安装 Node、pnpm、JDK 和 Android SDK，配置本机环境变量，再运行项目命令。各平台的安装、检查和启动步骤如下。

本文面向本机开发；生产服务器配置见 [开发与部署说明](development.md)。工具链变量 `JAVA_HOME`、`ANDROID_HOME` 和 PATH 配在本机 shell 或系统中；应用变量仍放在 `apps/server/.env`、`apps/mobile/.env`，不把数据库凭据写进全局环境配置。

可先执行 `pnpm check:env --tools-only` 检查 Node/pnpm 与 Docker/Compose。完成初始化并启动 API 后，执行 `pnpm check:env --ios --json` 或 `pnpm check:env --android --json` 核对原生工具、真实数据库和移动端 API 连通；Windows 使用 `pnpm.cmd`。工具只读，不迁移、不安装、不输出凭据，失败返回非零；Node 24 的 patch 与仓库固定版本不同时明确警告。保留输出时同时记录实际安装/启动结果，不能仅凭工具检查认定原生应用已验收。当前实际环境和 CI 记录见[环境验证](environment-validation-2026-10-24.md)。

## 工具与版本

| 工具         | 项目要求与来源                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Node.js      | 按根目录 [.node-version](../.node-version) 安装，当前为 24.21.0                                                  |
| pnpm         | 按根目录 [package.json](../package.json) 的 `packageManager` 安装，当前为 12.6.0                                 |
| JDK          | 使用 JDK 17；Temurin、Corretto 等发行版均可                                                                      |
| Android SDK  | Platform 36、Build-Tools 36.0.0、Platform-Tools、Android Emulator                                                |
| 原生编译工具 | 当前依赖使用 NDK 27.1.12297006、CMake 3.22.1；构建还可能安装依赖需要的 Build-Tools 35.0.0                        |
| 数据库       | 开发 Compose 使用 PostgreSQL 17；macOS/Windows 使用 Docker Desktop，Linux 也可使用 Docker Engine 与 Compose 插件 |

API/NDK 版本来自已锁定的 React Native 依赖与 Expo Gradle 配置；CMake 3.22.1 是当前 Android Gradle Plugin 的默认选择。升级依赖后以实际构建要求为准，不手工修改生成的 `apps/mobile/android`。系统中已有其他版本的 CMake，不代表 SDK 中已有构建要求的版本。

通过 [Android Studio](https://developer.android.com/studio) 的 SDK Manager 安装组件。在 SDK Tools 中勾选 Show Package Details，可以选择指定的 NDK、CMake 和 Build-Tools 版本；同时安装 Android SDK Command-line Tools。也可让首次 Gradle 构建下载缺少的组件，前提是对应 SDK 许可已接受。下载或许可检查失败时，回 SDK Manager 完成安装与许可确认后重试。[Android 官方安装说明](https://developer.android.com/studio/projects/install-ndk)

## macOS

以下步骤使用 macOS 默认的 zsh 终端。

1. 安装 [Node.js](https://nodejs.org/en/download) 中与 `.node-version` 一致的版本，再执行 `npm install --global pnpm@12.6.0`。
2. 安装 JDK 17，例如 [Temurin 的 macOS 安装包](https://adoptium.net/installation/)。安装后执行 `/usr/libexec/java_home -V`，确认系统能找到 JDK 17。
3. 安装 Android Studio 和上表中的 SDK 组件，在 SDK Manager 确认 Android SDK Location。
4. 将以下内容加入 `~/.zshrc`。SDK 路径使用默认值；若安装位置不同，替换成 SDK Manager 显示的实际路径。

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

如果 JDK 是手工解压、未注册到 macOS 的安装，直接将 `JAVA_HOME` 设置为实际 JDK 根目录（里面应有 `bin/java`），无需依赖 `java_home`。

```bash
source ~/.zshrc
node --version
pnpm --version
java -version
javac -version
adb version
emulator -list-avds
```

安装并手动启动 Docker Desktop。在 Android Studio 的 Device Manager 中创建并启动模拟器，Apple Silicon 选择 ARM64 镜像。之后在项目根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm build:android
adb reverse tcp:3300 tcp:3300
pnpm dev:android
```

端口转发适用于模板中的 `http://localhost:3300`；模拟器重启后重新执行。只开发 Android 不需要 Xcode；本地 iOS 构建另需 Xcode、模拟器 runtime 和 CocoaPods，见 [开发说明](development.md)。

## Linux

安装同样版本的 Node、pnpm、JDK 17、Android Studio 和 SDK，配置 Docker Engine/Compose 或 Docker Desktop。JDK 可使用发行版包管理器或 [Temurin 安装包](https://adoptium.net/installation/)。

例如 Ubuntu/Debian 的默认 JDK 17 安装路径可按架构设置。确认已安装 `openjdk-17-jdk` 后，将以下内容加入 `~/.bashrc`；其他发行版将 `JAVA_HOME` 改为实际 JDK 17 根目录：

```bash
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-$(dpkg --print-architecture)"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

`ANDROID_HOME` 同样以 SDK Manager 显示的路径为准。执行 `source ~/.bashrc`，完成上节的版本检查和项目初始化命令。Android 模拟器需要可用的虚拟化/KVM 环境；也可使用开启 USB 调试的 Android 真机。[Expo 模拟器配置说明](https://docs.expo.dev/workflow/android-studio-emulator/)

## Windows

以下以 Windows 11 x64 和原生 PowerShell 为例。Node、JDK、Android Studio、模拟器及项目都放在 Windows 环境中。Docker Desktop 可以使用 WSL 2 后端；这不要求把项目或 Node 放进 WSL。此处不覆盖“WSL 中运行 Metro、Windows 中运行模拟器”的混合环境。

### 1. 安装工具

1. 安装 Git for Windows，将项目克隆到本机目录，例如 `C:\dev\tongzhang`。
2. 安装 `.node-version` 指定版本的 Node.js Windows 安装包，重新打开 PowerShell。
3. 使用 npm 安装项目要求的 pnpm：

```powershell
npm.cmd install --global pnpm@12.6.0
node --version
pnpm.cmd --version
```

本文显式使用 `npm.cmd`、`pnpm.cmd`，避免 PowerShell 优先选择 `.ps1` 启动文件时受到执行策略限制，无需为此放宽全局脚本执行策略。[pnpm 安装说明](https://pnpm.io/installation)

4. 安装 JDK 17，例如 [Temurin Windows MSI](https://adoptium.net/installation/)，记下实际安装目录。
5. 安装 Android Studio，按前面的版本表安装 SDK。SDK Manager 显示的默认路径通常为 `%LOCALAPPDATA%\Android\Sdk`。
6. 按 [Docker Desktop Windows 安装说明](https://docs.docker.com/desktop/setup/install/windows-install/) 启用所需虚拟化/WSL 2，安装并启动 Docker Desktop，使用 Linux containers。

### 2. 设置环境变量

打开 Windows“编辑账户的环境变量”，在用户变量中设置：

| 变量           | 值                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `JAVA_HOME`    | 实际 JDK 17 根目录，例如 `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`；把示例版本替换为已安装版本，目录内应有 `bin\java.exe` |
| `ANDROID_HOME` | SDK Manager 显示的完整路径，例如 `C:\Users\你的用户名\AppData\Local\Android\Sdk`                                                       |

编辑用户 `Path`，新增以下三项，保留已有项；在图形界面的值中不加引号：

```text
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

重新打开 PowerShell及 IDE 终端后检查：

```powershell
$env:JAVA_HOME
$env:ANDROID_HOME
Test-Path "$env:JAVA_HOME\bin\java.exe"
Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe"
where.exe java
java -version
javac -version
adb version
emulator -list-avds
docker info
docker compose version
```

两个 `Test-Path` 应为 `True`，Java/Javac 应为 17。若 `where.exe java` 的首项仍是其他版本，调整已有 Java PATH 项的顺序，或在当前 PowerShell 会话先执行：

```powershell
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
```

`JAVA_HOME` 与 SDK 路径用于本机工具，不写入应用 `.env` 或提交到仓库。也无需安装全局 Gradle，构建使用 Expo 生成工程中的 Gradle Wrapper。

### 3. 首次初始化与安装 Android 开发客户端

在 Android Studio 的 Device Manager 创建并启动一个适合主机架构的模拟器；普通 Intel/AMD Windows 电脑选择 x86_64 系统镜像。用 `adb devices` 确认设备状态为 `device`。

以下命令都在仓库根目录运行：

```powershell
Set-Location C:\dev\tongzhang
pnpm.cmd install --frozen-lockfile
pnpm.cmd setup
pnpm.cmd build:android
```

`setup` 创建缺失的应用 `.env`、启动数据库并迁移；Docker Desktop 必须已启动。`build:android` 生成原生工程并编译、安装开发客户端；首次下载 SDK/NDK/CMake 和 Gradle/Maven 依赖可能较久。多设备时可使用 `pnpm.cmd build:android --device` 选择设备。

保留 `apps/mobile/.env` 的 `EXPO_PUBLIC_API_BASE_URL=http://localhost:3300`，在模拟器启动后执行：

```powershell
adb reverse tcp:3300 tcp:3300
adb reverse --list
```

转发需要在设备重启/重连后重设；多个设备时加 `-s <序列号>`。Android 模拟器也可将 API 地址改为 `http://10.0.2.2:3300`，改后重启 Metro。通过局域网使用真机时，按 [移动端地址说明](development.md#3-移动端地址与发布配置) 设置电脑局域网 IP，并按需允许 Node 通过 Windows 防火墙的专用网络。

### 4. 日常开发与排障

统一入口 `pnpm dev` / `dev:android` 的预检查已改用当前 Node 的 `--run` 在目标包目录分发脚本，避免直接 spawn Windows `.cmd` 的兼容问题；带空格路径及失败传播已有脚本测试。仍需 Windows 成员在本机核对原生安装、Metro 交互和退出清理，不将跨平台设计与 macOS/Linux 测试描述为 Windows 整机验收。[Node --run 说明](https://nodejs.org/api/cli.html#--run)

启动数据库和模拟器、完成端口转发后，可执行 `pnpm.cmd dev:android`。需要分别观察服务端和 Metro 时，使用下面的双终端方式排障。

先在 Device Manager 启动模拟器。终端 A 进入仓库根目录，执行：

```powershell
pnpm.cmd up:db
adb reverse tcp:3300 tcp:3300
pnpm.cmd dev:server
```

终端 B 同样进入仓库根目录，执行：

```powershell
pnpm.cmd dev:mobile
```

待 Metro 就绪后按 `a` 打开 Android，按 `Shift+a` 选择设备。默认进入真实欢迎/登录页；在另一个终端执行 `pnpm.cmd check:env --android` 核对 API/数据库，再用真实账号验证客户端请求。也可在另一个 PowerShell 中检查 API：

```powershell
Invoke-RestMethod http://localhost:3300/health/ready
```

结束时分别在两个终端按 Ctrl+C；数据库和模拟器保留。新迁移用 `pnpm.cmd migrate:db`；新增原生依赖或修改原生配置后，先停止开发进程，再执行 `pnpm.cmd build:android`。

### 5. 检查与平台边界

```powershell
pnpm.cmd check
```

数据库集成测试需要独立测试库。使用模板默认开发参数时，在 PowerShell 中设置测试变量的写法如下；如果修改了数据库配置，要同步替换参数：

```powershell
docker compose --env-file apps/server/.env -f infra/compose.dev.yml exec -T postgres createdb -U tongzhang tongzhang_test
$env:TEST_DATABASE_URL = "postgresql://tongzhang:tongzhang_local_only@127.0.0.1:35432/tongzhang_test"
try { pnpm.cmd test:integration } finally { Remove-Item Env:TEST_DATABASE_URL }
```

测试库只需创建一次。PowerShell 不使用 Bash 的 `变量=值 命令` 写法。

`pnpm test` 中包含 Bash 部署脚本测试；`test:container` 与 `infra/deploy.sh` 也依赖 Bash/POSIX 工具。这部分以 Linux CI/部署环境为验证基线，不能将 Windows 上的类型检查通过当作全部测试通过。

Windows/Linux 可开发 Android、共享代码和服务端；本地 iOS 编译及 iOS 模拟器需要 macOS/Xcode。没有 Mac 而有 iPhone 的成员可使用团队提供的签名开发客户端或 EAS 云构建，但项目尚未绑定 EAS 项目与 iOS 签名，不能直接当成已配置好的流程。

本文补充的是安装与启动指引。目前原生构建实际验收环境为 macOS 上的 iOS、Android 模拟器；Windows/Linux 尚未完成本机安装、构建、Metro 交互及退出清理的端到端验收。
