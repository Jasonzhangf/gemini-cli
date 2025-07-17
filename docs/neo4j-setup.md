# Neo4j Graph RAG 部署指南

本指南将帮助您部署Neo4j作为Gemini CLI的Graph RAG备份方案，采用非Docker方式。

## 📋 目录

- [系统要求](#系统要求)
- [安装Neo4j](#安装neo4j)
- [配置Neo4j](#配置neo4j)
- [集成到Gemini CLI](#集成到gemini-cli)
- [测试验证](#测试验证)
- [性能优化](#性能优化)
- [故障排除](#故障排除)

## 🔧 系统要求

### 硬件要求
- **内存**: 最少2GB，推荐4GB+
- **存储**: 最少1GB可用空间
- **CPU**: 2核心以上推荐

### 软件要求
- **Java**: JDK 17或更高版本
- **操作系统**: 
  - macOS 10.15+
  - Ubuntu 18.04+
  - Windows 10+
- **Node.js**: 20.x+ (for Gemini CLI)

## 📦 安装Neo4j

### macOS安装

#### 方法1: 使用Homebrew（推荐）
```bash
# 安装Homebrew（如果未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装Neo4j
brew install neo4j

# 启动Neo4j服务
brew services start neo4j
```

#### 方法2: 手动安装
```bash
# 下载Neo4j Community Edition
curl -O https://dist.neo4j.org/neo4j-community-5.15.0-unix.tar.gz

# 解压
tar -xf neo4j-community-5.15.0-unix.tar.gz

# 移动到应用目录
sudo mv neo4j-community-5.15.0 /usr/local/neo4j

# 创建符号链接
sudo ln -s /usr/local/neo4j/bin/neo4j /usr/local/bin/neo4j
sudo ln -s /usr/local/neo4j/bin/cypher-shell /usr/local/bin/cypher-shell
```

### Ubuntu/Debian安装

```bash
# 更新包管理器
sudo apt update

# 安装Java 17
sudo apt install openjdk-17-jdk

# 添加Neo4j仓库
wget -O - https://debian.neo4j.com/neotechnology.gpg.key | sudo apt-key add -
echo 'deb https://debian.neo4j.com stable latest' | sudo tee -a /etc/apt/sources.list.d/neo4j.list
sudo apt update

# 安装Neo4j
sudo apt install neo4j=1:5.15.0

# 启动Neo4j服务
sudo systemctl enable neo4j.service
sudo systemctl start neo4j.service
```

### Windows安装

1. 下载Neo4j Community Edition Windows安装包
2. 运行安装程序
3. 选择安装路径
4. 配置服务运行选项
5. 完成安装并启动服务

## ⚙️ 配置Neo4j

### 基本配置

编辑Neo4j配置文件：

**macOS (Homebrew)**: `/opt/homebrew/etc/neo4j/neo4j.conf`  
**macOS (手动安装)**: `/usr/local/neo4j/conf/neo4j.conf`  
**Ubuntu**: `/etc/neo4j/neo4j.conf`  
**Windows**: `C:\Program Files\Neo4j CE 5.15.0\conf\neo4j.conf`

```bash
# 允许远程连接
server.default_listen_address=0.0.0.0

# 设置HTTP端口
server.http.listen_address=:7474

# 设置Bolt端口  
server.bolt.listen_address=:7687

# 启用APOC插件（可选，用于高级功能）
dbms.security.procedures.unrestricted=apoc.*

# 内存配置
server.memory.heap.initial_size=1G
server.memory.heap.max_size=2G
server.memory.pagecache.size=512M

# 日志配置
dbms.logs.query.enabled=INFO
dbms.logs.query.threshold=1s
```

### 安全配置

```bash
# 设置初始密码
neo4j-admin dbms set-initial-password your_secure_password

# 或者使用环境变量
export NEO4J_AUTH=neo4j/your_secure_password
```

### 启动服务

```bash
# macOS/Linux
neo4j start

# 或者使用systemctl (Ubuntu)
sudo systemctl start neo4j

# Windows (命令提示符以管理员身份运行)
neo4j.bat install-service
neo4j.bat start
```

## 🔌 集成到Gemini CLI

### 1. 安装Neo4j驱动依赖

```bash
cd /path/to/gemini-cli
npm install neo4j-driver
```

### 2. 环境变量配置

创建或编辑 `.env` 文件：

```bash
# Neo4j连接配置
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_secure_password
NEO4J_DATABASE=neo4j

# 启用Neo4j Graph RAG
ENABLE_NEO4J_GRAPH_RAG=true
NEO4J_DEBUG=false

# 备份配置
NEO4J_BACKUP_ENABLED=true
NEO4J_HEALTH_CHECK_INTERVAL=30000
NEO4J_SYNC_INTERVAL=300000
```

### 3. 使用Neo4j Graph RAG

在代码中配置使用Neo4j Graph RAG：

```typescript
import { ContextProviderFactory } from '@google/gemini-cli-core';

const factory = ContextProviderFactory.getInstance();

// 创建Neo4j Graph RAG配置
const neo4jConfig = factory.createRecommendedSetup('medium', true);

// 或者创建备份配置
const backupConfig = factory.createNeo4jBackupSetup(primaryConfig);
```

### 4. 备份管理器使用

```typescript
import { Neo4jBackupManager } from '@google/gemini-cli-core';

const backupManager = new Neo4jBackupManager({
  primaryExtractor: {
    type: 'rag',
    config: {}
  },
  backupExtractor: {
    type: 'neo4j-graph-rag',
    config: {
      enableDebug: true
    }
  },
  failoverConfig: {
    enableAutoFailover: true,
    healthCheckInterval: 30000
  }
});

await backupManager.initialize();
```

## ✅ 测试验证

### 1. 连接测试

```bash
# 测试Neo4j连接
cypher-shell -u neo4j -p your_secure_password "RETURN 'Hello Neo4j!' as message;"
```

### 2. Web界面访问

打开浏览器访问: `http://localhost:7474`

- 用户名: `neo4j`
- 密码: `your_secure_password`

### 3. Gemini CLI测试

```bash
# 运行增强版测试编排器
node enhanced-test-orchestrator.js --debug "测试Neo4j Graph RAG功能"

# 检查Neo4j模块状态
node -e "
const { ContextProviderFactory } = require('./packages/core/src/context/providers/contextProviderFactory.js');
const factory = ContextProviderFactory.getInstance();
console.log('Available providers:', factory.getAvailableProviders());
"
```

### 4. 功能验证脚本

创建测试脚本 `test-neo4j.js`：

```javascript
import { Neo4jKnowledgeGraphProvider } from './packages/core/src/context/providers/graph/Neo4jKnowledgeGraphProvider.js';

async function testNeo4j() {
  const provider = new Neo4jKnowledgeGraphProvider({
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    enableDebug: true
  });

  try {
    await provider.initialize();
    console.log('✅ Neo4j连接成功');

    const stats = await provider.getStatistics();
    console.log('📊 数据库统计:', stats);

    const isHealthy = await provider.healthCheck();
    console.log('🏥 健康检查:', isHealthy ? '通过' : '失败');

    await provider.dispose();
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

testNeo4j();
```

运行测试：
```bash
node test-neo4j.js
```

## 🚀 性能优化

### 1. 内存配置优化

根据系统内存调整 `neo4j.conf`：

```bash
# 4GB系统推荐配置
server.memory.heap.initial_size=1G
server.memory.heap.max_size=2G
server.memory.pagecache.size=1G

# 8GB系统推荐配置
server.memory.heap.initial_size=2G
server.memory.heap.max_size=4G
server.memory.pagecache.size=2G
```

### 2. 索引优化

在Neo4j Browser中执行：

```cypher
-- 创建性能优化索引
CREATE INDEX node_content_fulltext IF NOT EXISTS FOR (n:Node) ON (n.content);
CREATE INDEX relationship_weight_range IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.weight);

-- 查看索引状态
SHOW INDEXES;
```

### 3. 查询优化

```cypher
-- 使用PROFILE分析查询性能
PROFILE MATCH (n:Node) 
WHERE n.type = 'function' AND n.content CONTAINS 'test'
RETURN n LIMIT 10;

-- 使用EXPLAIN查看执行计划
EXPLAIN MATCH (n:Node)-[r:RELATES_TO]->(m:Node)
WHERE n.type = 'class'
RETURN n, r, m;
```

## 🔧 故障排除

### 常见问题

#### 1. 连接被拒绝
```
Neo4j.ClientError.Security.Unauthorized
```

**解决方案**:
- 检查用户名密码是否正确
- 确认Neo4j服务已启动
- 检查端口7687是否开放

#### 2. Java版本问题
```
Unsupported major.minor version
```

**解决方案**:
```bash
# 检查Java版本
java -version

# 安装正确版本的Java
# macOS
brew install openjdk@17

# Ubuntu
sudo apt install openjdk-17-jdk
```

#### 3. 内存不足
```
java.lang.OutOfMemoryError: Java heap space
```

**解决方案**:
- 增加heap size配置
- 减少page cache大小
- 关闭不必要的服务

#### 4. 权限问题 (Linux/macOS)
```
Permission denied
```

**解决方案**:
```bash
# 修改Neo4j文件权限
sudo chown -R neo4j:neo4j /var/lib/neo4j
sudo chmod -R 755 /var/log/neo4j
```

### 日志查看

```bash
# macOS (Homebrew)
tail -f /opt/homebrew/var/log/neo4j/neo4j.log

# Ubuntu
tail -f /var/log/neo4j/neo4j.log

# 或查看debug日志
tail -f /var/log/neo4j/debug.log
```

### 性能监控

访问Neo4j Browser (`http://localhost:7474`) 并执行：

```cypher
-- 查看活动查询
SHOW TRANSACTIONS;

-- 查看系统信息
CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Configuration") 
YIELD attributes
RETURN attributes.HeapMemoryUsage, attributes.NonHeapMemoryUsage;

-- 查看缓存状态
CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Page cache") 
YIELD attributes
RETURN attributes;
```

## 📚 进一步资源

- [Neo4j官方文档](https://neo4j.com/docs/)
- [Neo4j驱动程序文档](https://neo4j.com/docs/javascript-manual/current/)
- [Cypher查询语言参考](https://neo4j.com/docs/cypher-manual/current/)
- [Neo4j性能优化指南](https://neo4j.com/docs/operations-manual/current/performance/)

## 🎯 下一步

1. 完成Neo4j部署和配置
2. 运行测试验证功能
3. 根据项目需求调整配置
4. 设置监控和备份策略
5. 集成到生产环境

完成这些步骤后，您的Gemini CLI将拥有强大的Graph RAG功能和自动故障转移能力！