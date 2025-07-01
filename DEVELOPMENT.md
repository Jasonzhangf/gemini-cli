# 开发指南

## 快速更新全局安装

### 手动更新（推荐用于发布前测试）

每次修改代码后，运行以下命令更新全局安装的版本：

```bash
# 方式1: 使用脚本
./update-global.sh

# 方式2: 使用npm脚本
npm run update-global
```

这个脚本会：
1. 🧹 清理之前的构建文件
2. 🔨 重新构建所有包
3. 🗑️ 卸载旧的全局版本
4. 📦 安装当前本地版本到全局
5. ✅ 验证安装和劫持配置

### 自动监控模式（推荐用于开发）

启动开发监控模式，自动监控文件变化并重新安装：

```bash
# 方式1: 使用脚本
./dev-watch.sh

# 方式2: 使用npm脚本
npm run dev
```

这个脚本会：
1. 👀 监控 `packages/` 目录下的 `.ts`, `.tsx`, `.js`, `.json` 文件
2. 📝 检测到文件变化时自动运行 `./update-global.sh`
3. ⏹️ 按 `Ctrl+C` 退出监控

#### 系统要求

**macOS 用户**（推荐）：
```bash
brew install fswatch
```

**Linux 用户**：
```bash
# Ubuntu/Debian
sudo apt-get install inotify-tools

# CentOS/RHEL
sudo yum install inotify-tools
```

## 开发工作流

### 典型开发流程

1. **启动监控模式**（推荐）：
   ```bash
   npm run dev
   ```

2. **修改代码**：
   - 编辑 `packages/core/src/` 或 `packages/cli/src/` 下的文件
   - 保存文件后会自动触发重新构建和安装

3. **测试更改**：
   ```bash
   # 在任何目录测试
   gemini -m gemini-2.5-flash -p "测试消息"
   ```

### 手动工作流

如果不想使用监控模式，可以手动执行：

1. **修改代码**
2. **手动更新**：
   ```bash
   npm run update-global
   ```
3. **测试更改**

## 劫持配置验证

更新脚本会自动检查劫持配置状态：

```bash
# 脚本输出示例
✅ 劫持配置已启用
🏷️  当前活跃提供商: HIJACK
```

如果看到警告信息，请检查 `~/.gemini/.env` 文件配置。

## 故障排除

### 1. 全局命令找不到

```bash
# 检查安装位置
which gemini

# 重新安装
npm run update-global
```

### 2. 版本不匹配

```bash
# 检查版本
gemini --version
cat package.json | grep version

# 强制重新安装
npm uninstall -g @fanzheng/gemini-cli-hijack
npm run update-global
```

### 3. 劫持配置不生效

```bash
# 检查配置文件
cat ~/.gemini/.env | grep HIJACK

# 确保包含以下基本配置：
# HIJACK_ENABLED=true
# HIJACK_ACTIVE_PROVIDER=HIJACK
# HIJACK_API_ENDPOINT=http://your-endpoint/v1
# HIJACK_ACTUAL_MODEL=your-model-name
# HIJACK_API_KEY=your-api-key
```

### 4. 监控模式不工作

```bash
# macOS 安装 fswatch
brew install fswatch

# Linux 安装 inotify-tools
sudo apt-get install inotify-tools  # Ubuntu/Debian
sudo yum install inotify-tools      # CentOS/RHEL
```

## 其他有用命令

```bash
# 只构建不安装
npm run build

# 清理构建文件
npm run clean

# 运行测试
npm test

# 运行代码检查
npm run preflight
```

## 提示

- 🚀 **推荐使用监控模式**：开发时运行 `npm run dev`，保存文件即可自动更新
- 📝 **测试频繁**：每次重要更改后都要测试劫持功能是否正常
- 🔄 **版本管理**：重要功能完成后考虑升版本号
- 🐛 **问题调试**：如果遇到问题，先运行 `npm run update-global` 确保使用最新代码