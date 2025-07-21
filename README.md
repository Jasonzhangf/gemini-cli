# 🤖 Gemini CLI Router (GCR)

**Route your Gemini CLI requests to third-party AI providers seamlessly**

GCR is a comprehensive solution that enables Google Gemini CLI to work seamlessly with third-party AI providers like SHUAIHONG, DeepSeek, OpenAI, Claude, and others. Due to Google SDK's technical limitations (hardcoded endpoints, certificate binding, authentication mechanisms), we provide both a proxy service and necessary CLI modifications to achieve complete third-party integration.

## ✨ Features

- 🔄 **Complete Integration**: Modified CLI with enhanced UI showing proxy status and third-party models
- 🌐 **Multiple Providers**: Support for SHUAIHONG, DeepSeek, OpenAI, Claude
- 🔑 **Flexible Auth**: Support both API key and OAuth authentication
- 🎯 **Model Override**: Use `-m` parameter to override models on-the-fly
- ⚡ **Fast Setup**: One-command global installation
- 🛡️ **Privacy First**: Your API keys stay local in `~/.gemini-cli-router/.env`

## 🚀 Two Installation Options

### Option 1: 🔧 Modified CLI (Recommended - Full Features)

For complete third-party integration with enhanced UI, install our modified version:

```bash
# Clone the repository
git clone https://github.com/Jasonzhangf/gemini-cli-router.git
cd gemini-cli-router

# One-click build and install
./build-and-install.sh
```

**Features:**
- ✅ UI shows proxy status: `🔄 Proxy:3458 | SHUAIHONG | gpt-4o`
- ✅ Real-time proxy detection
- ✅ Third-party model display in footer
- ✅ Complete integration with all CLI features

**Usage:**
```bash
gemini-local -m gpt-4o -p "Hello GPT-4o!"
gemini-proxy -m claude-3.5-sonnet -p "Hi Claude!"
```

### Option 2: 📦 Proxy-Only (Original CLI + External Proxy)

Use with unmodified official Gemini CLI:

**Step 1: Install Official Gemini CLI**
```bash
npm install -g @google/gemini-cli
```

**Step 2: Install GCR Proxy**
```bash
npm install -g gemini-cli-router
```

**Limitations:**
- ❌ UI doesn't show proxy information
- ❌ Requires manual proxy management
- ❌ Less seamless integration

### Configuration

**Step 3: Configure GCR**

1. Edit your configuration file:
```bash
nano ~/.gemini-cli-router/.env
```

2. Add your provider settings:
```env
# Gemini API Key (optional, uses OAuth if not set)
GCR_API_KEY=your_gemini_api_key_here

# Provider Configuration
GCR_PROVIDER=shuaihong
GCR_TARGET_API_KEY=your_provider_api_key_here
GCR_BASE_URL=https://ai.shuaihong.fun/v1
GCR_MODEL=gemini-2.5-pro

# Server Configuration
GCR_PORT=3458
GCR_HOST=localhost
GCR_DEBUG=false
```

### Usage

**Step 4: Start Using GCR**

Once installed and configured, use `gcr` instead of `gemini`:

```bash
# Interactive chat
gcr chat "Hello, how are you?"

# Override model
gcr -m gpt-4o chat "Hello"

# Any gemini command works
gcr config
gcr --help
```

## 🔧 Supported Providers

| Provider | Base URL | Models |
|----------|----------|---------|
| **SHUAIHONG** | `https://ai.shuaihong.fun/v1` | `gemini-2.5-pro`, `gpt-4o`, `claude-3.5-sonnet` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-coder` |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4`, `gpt-3.5-turbo` |
| **Claude** | `https://api.anthropic.com/v1` | `claude-3.5-sonnet`, `claude-3-opus` |

## 📋 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GCR_API_KEY` | Gemini API key (optional) | OAuth |
| `GCR_PROVIDER` | Target provider | `shuaihong` |
| `GCR_TARGET_API_KEY` | Provider API key | *(required)* |
| `GCR_BASE_URL` | Provider base URL | Provider default |
| `GCR_MODEL` | Default model | `gpt-4o` |
| `GCR_PORT` | Proxy port | `3458` |
| `GCR_HOST` | Proxy host | `localhost` |
| `GCR_DEBUG` | Debug logging | `false` |

## 🛠️ How It Works

1. **Proxy Interception**: GCR starts a local proxy server on port 3458
2. **Environment Override**: Sets `GEMINI_API_BASE_URL` to point to the proxy
3. **API Translation**: Converts Gemini API calls to target provider format
4. **Response Translation**: Converts provider responses back to Gemini format
5. **Seamless Experience**: Your Gemini CLI works exactly as before

```
Gemini CLI → GCR Proxy → Third-Party Provider → Response Translation → Gemini CLI
```

## 🔐 Authentication

GCR supports both authentication methods:

### API Key (Recommended)
Set `GCR_API_KEY` in your config file to use API key authentication and avoid OAuth prompts.

### OAuth
Leave `GCR_API_KEY` empty to use OAuth authentication (you'll be prompted to authenticate).

## 📦 Complete Installation Guide

### Step-by-Step Installation

1. **Install Official Gemini CLI (Required)**
   ```bash
   npm install -g @google/gemini-cli
   ```

2. **Install GCR via NPM (Recommended)**
   ```bash
   npm install -g gemini-cli-router
   ```

3. **Alternative: Install from Source**
   ```bash
   git clone https://github.com/Jasonzhangf/gemini-cli-router.git
   cd gemini-cli-router
   npm install -g .
   ```

4. **Configure Your Provider**
   ```bash
   # Edit configuration
   nano ~/.gemini-cli-router/.env
   
   # Add your settings
   GCR_PROVIDER=shuaihong
   GCR_TARGET_API_KEY=your_api_key_here
   ```

5. **Start Using**
   ```bash
   gcr chat "Hello, world!"
   ```

## 🗑️ Uninstallation

```bash
# Uninstall GCR
npm uninstall -g gemini-cli-router

# Optional: Uninstall Official Gemini CLI
npm uninstall -g @google/gemini-cli
```

## 🧪 Testing

Test your setup:
```bash
# Test proxy functionality
node test-proxy.js

# Test with real conversation
gcr chat "Hello, test message"
```

## 🐛 Troubleshooting

### Common Issues

**Port 3458 already in use:**
```bash
# Kill existing processes
lsof -ti:3458 | xargs kill -9
```

**Permission errors:**
```bash
# Make scripts executable
chmod +x gcr-gemini install-gcr-simple.sh uninstall-gcr.sh
```

**OAuth every time:**
- Set `GCR_API_KEY` in `~/.gemini-cli-router/.env` to avoid OAuth prompts

**Official Gemini CLI not found:**
- Make sure you installed it first: `npm install -g @google/gemini-cli`

### Debug Mode

Enable debug logging:
```bash
export GCR_DEBUG=true
gcr chat "test"
```

## 🛠️ 技术原理：为什么需要修改Gemini CLI源码？

### 🎯 问题背景

虽然GCR项目最初设计为"零修改"方案，但在实际实现中发现，为了实现完整的第三方AI提供商路由转发，**必须对Gemini CLI源码进行适度修改**。这不是设计缺陷，而是Google Gemini CLI架构特性所决定的技术限制。

### 🔒 Google Gemini CLI的技术限制

#### 1. **API端点硬编码**
```javascript
// Google @google/genai SDK 内部硬编码
const API_ENDPOINT = "https://generativelanguage.googleapis.com";
```
- Google的SDK将API端点硬编码为Google服务器
- 无法通过配置文件或环境变量动态修改
- SDK内部包含端点验证逻辑，拒绝非Google域名

#### 2. **HTTPS证书和域名绑定**
- Google SDK内置了证书验证机制
- 只信任`*.googleapis.com`域名的证书
- 即使DNS劫持也会被SSL/TLS层阻止

#### 3. **认证机制深度绑定**
```javascript
// Google特定的认证流程
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/generative-language']
});
```
- CLI使用Google特定的OAuth2认证流程
- Token验证与Google Identity平台绑定
- 第三方提供商无法验证Google issued tokens

#### 4. **请求格式和响应处理**
- Gemini API使用独特的请求格式（与OpenAI/Claude不同）
- CLI内置了Gemini特定的错误处理和重试逻辑
- 响应解析代码假设特定的JSON结构

### ❌ 为什么外部代理方案不可行？

#### 1. **网络层拦截的局限性**
```bash
# 这些方法都行不通
✗ DNS劫持: generativelanguage.googleapis.com -> 127.0.0.1
  - HTTPS证书验证失败
  - SSL/TLS握手被拒绝

✗ HTTP代理: --proxy http://127.0.0.1:3458
  - CLI的--proxy选项期待CONNECT隧道代理
  - 不支持HTTP应用层代理

✗ iptables重定向: 443端口转发
  - 证书不匹配导致连接失败
  - 影响系统其他HTTPS请求
```

#### 2. **中间人攻击检测**
```javascript
// Google SDK内置安全检查
if (!cert.subject.includes('googleapis.com')) {
  throw new Error('Invalid certificate');
}
```

#### 3. **加密通道的不可突破性**
- HTTPS加密使内容检查和修改成为不可能
- 无法在传输层修改请求/响应格式
- 无法注入第三方认证Token

### ✅ 修改CLI源码的技术方案

#### 1. **API端点重定向**
```typescript
// packages/cli/src/config/config.ts
apiEndpoint: settings.apiEndpoint || 'http://127.0.0.1:3458'

// 效果：将所有API请求重定向到本地代理
// Google SDK -> http://127.0.0.1:3458/v1beta/models/*/generateContent
```

#### 2. **代理服务器格式转换**
```javascript
// proxy-service/src/server.js
app.post('/v1beta/*', async (req, res) => {
  // 1. 接收Gemini格式请求
  const geminiRequest = req.body;
  
  // 2. 转换为OpenAI格式
  const openaiRequest = GeminiTranslator.translateRequest(geminiRequest);
  
  // 3. 转发到第三方提供商
  const response = await fetch(providerUrl, {
    method: 'POST',
    body: JSON.stringify(openaiRequest)
  });
  
  // 4. 转换响应回Gemini格式
  const geminiResponse = GeminiTranslator.translateResponse(await response.json());
  res.json(geminiResponse);
});
```

#### 3. **UI界面增强**
```typescript
// packages/cli/src/ui/components/Footer.tsx
// 实时显示代理状态
🔄 Proxy:3458 | SHUAIHONG | gpt-4o

// packages/cli/src/ui/App.tsx
// 每30秒检测代理服务器状态
useEffect(() => {
  const detectProxy = async () => {
    const response = await fetch('http://127.0.0.1:3458/health');
    setProxyInfo(await response.json());
  };
}, []);
```

#### 4. **第三方模型支持**
```typescript
// -m参数增强支持
.option('model', {
  description: 'Model (supports third-party: gpt-4o, claude-3.5-sonnet, deepseek-chat)'
})

// URL路径传递模型信息
http://127.0.0.1:3458/v1beta/models/gpt-4o/generateContent
```

### 🎯 修改后的完整流程

```
用户输入: gemini-local -m gpt-4o -p "Hello"
    ↓
[修改后的CLI] 发送到: http://127.0.0.1:3458/v1beta/models/gpt-4o/generateContent
    ↓
[本地代理] 接收Gemini格式请求
    ↓
[格式转换] Gemini → OpenAI格式
    ↓
[转发请求] → https://ai.shuaihong.fun/v1/chat/completions
    ↓
[接收响应] ← OpenAI格式响应
    ↓
[格式转换] OpenAI → Gemini格式
    ↓
[返回CLI] ← Gemini格式响应
    ↓
[UI显示] Footer显示: 🔄 Proxy:3458 | SHUAIHONG | gpt-4o
```

### 💡 技术优势

1. **透明性**: 用户体验与原版CLI完全一致
2. **完整性**: 支持所有CLI功能和参数
3. **实时性**: UI实时显示代理状态和模型信息
4. **扩展性**: 轻松添加新的AI提供商
5. **安全性**: 本地代理，API密钥不会泄露

### 🔧 本地构建和安装

```bash
# 一键构建修改版CLI
./build-and-install.sh

# 使用修改版CLI
gemini-local -m gpt-4o -p "Hello GPT-4o!"
gemini-proxy -m claude-3.5-sonnet -p "Hi Claude!"
```

**总结**：虽然修改CLI源码增加了复杂性，但这是实现完整第三方AI集成的唯一可行技术方案。我们的修改是最小化的、针对性的，保持了原有功能的同时增加了强大的路由转发能力。

## 📁 Project Structure

```
gemini-cli-router/
├── gcr-gemini                 # Main executable
├── proxy-service/            # Proxy server code
│   ├── src/
│   │   ├── server.js         # Express server
│   │   ├── config.js         # Configuration
│   │   └── gemini-translator.js
│   └── package.json
├── install-gcr-simple.sh     # Simple installer
├── install-gcr.sh            # Advanced installer  
├── uninstall-gcr.sh          # Uninstaller
├── setup-post-install.js     # Post-install setup
├── cleanup-pre-uninstall.js  # Cleanup script
├── test-proxy.js             # Test utility
└── package.json              # NPM package config
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details.

## 👨‍💻 Author

**Jason Zhang** - [GitHub](https://github.com/Jasonzhangf)

## 🔗 Related Projects

- [Official Gemini CLI](https://github.com/google-gemini/gemini-cli) - The official Google Gemini CLI
- [Claude Code](https://github.com/anthropics/claude-code) - Claude's official CLI

---

**⭐ If you find GCR useful, please star this repository!**