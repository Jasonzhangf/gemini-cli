#!/bin/bash

# Neo4j 一键安装脚本
# 自动检测系统并安装Neo4j，根据~/.gemini/.env配置设置密码

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否运行在macOS上
check_macos() {
    if [[ "$OSTYPE" != "darwin"* ]]; then
        log_error "此脚本目前只支持macOS系统"
        exit 1
    fi
}

# 检查Homebrew是否安装
check_homebrew() {
    if ! command -v brew &> /dev/null; then
        log_error "Homebrew未安装。请先安装Homebrew："
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    log_success "Homebrew已安装"
}

# 读取.env配置
read_env_config() {
    local env_file="$HOME/.gemini/.env"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "配置文件不存在: $env_file"
        exit 1
    fi
    
    # 读取Neo4j配置
    NEO4J_URI=$(grep "^NEO4J_URI=" "$env_file" | cut -d'=' -f2)
    NEO4J_USERNAME=$(grep "^NEO4J_USERNAME=" "$env_file" | cut -d'=' -f2)
    NEO4J_PASSWORD=$(grep "^NEO4J_PASSWORD=" "$env_file" | cut -d'=' -f2)
    NEO4J_DATABASE=$(grep "^NEO4J_DATABASE=" "$env_file" | cut -d'=' -f2)
    NEO4J_ENCRYPTION=$(grep "^NEO4J_ENCRYPTION=" "$env_file" | cut -d'=' -f2)
    
    # 设置默认值
    NEO4J_URI=${NEO4J_URI:-"bolt://localhost:7687"}
    NEO4J_USERNAME=${NEO4J_USERNAME:-"neo4j"}
    NEO4J_PASSWORD=${NEO4J_PASSWORD:-"gemini123"}
    NEO4J_DATABASE=${NEO4J_DATABASE:-"neo4j"}
    NEO4J_ENCRYPTION=${NEO4J_ENCRYPTION:-"false"}
    
    log_info "读取配置完成："
    log_info "  URI: $NEO4J_URI"
    log_info "  Username: $NEO4J_USERNAME"
    log_info "  Database: $NEO4J_DATABASE"
    log_info "  Encryption: $NEO4J_ENCRYPTION"
}

# 检查Neo4j是否已安装
check_neo4j_installed() {
    if brew list neo4j &> /dev/null; then
        log_success "Neo4j已安装"
        return 0
    else
        log_info "Neo4j未安装"
        return 1
    fi
}

# 安装Neo4j
install_neo4j() {
    log_info "开始安装Neo4j..."
    
    # 更新Homebrew
    log_info "更新Homebrew..."
    brew update
    
    # 安装Neo4j
    log_info "安装Neo4j..."
    brew install neo4j
    
    log_success "Neo4j安装完成"
}

# 启动Neo4j服务
start_neo4j() {
    log_info "启动Neo4j服务..."
    
    # 检查服务是否已经在运行
    if brew services list | grep neo4j | grep started &> /dev/null; then
        log_success "Neo4j服务已在运行"
    else
        brew services start neo4j
        log_success "Neo4j服务已启动"
    fi
    
    # 等待服务完全启动
    log_info "等待Neo4j服务完全启动..."
    sleep 10
    
    # 检查服务状态
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s http://localhost:7474 &> /dev/null; then
            log_success "Neo4j服务启动成功"
            return 0
        fi
        
        log_info "等待Neo4j启动... (尝试 $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "Neo4j服务启动超时"
    return 1
}

# 设置Neo4j密码
setup_neo4j_password() {
    log_info "设置Neo4j密码..."
    
    # 创建临时Node.js脚本来设置密码
    local temp_script=$(mktemp)
    cat > "$temp_script" << 'EOF'
const neo4j = require('neo4j-driver');

async function setupPassword() {
    const driver = neo4j.driver(
        'bolt://localhost:7687',
        neo4j.auth.basic('neo4j', 'neo4j'),
        {
            encrypted: 'ENCRYPTION_OFF',
            trust: 'TRUST_ALL_CERTIFICATES'
        }
    );

    try {
        const session = driver.session({ database: 'system' });
        try {
            await session.run(
                `ALTER CURRENT USER SET PASSWORD FROM 'neo4j' TO '${process.env.NEO4J_PASSWORD}'`
            );
            console.log('密码设置成功');
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('密码设置失败:', error.message);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

setupPassword();
EOF

    # 设置环境变量并运行脚本
    export NEO4J_PASSWORD="$NEO4J_PASSWORD"
    
    if node "$temp_script"; then
        log_success "Neo4j密码设置完成"
    else
        log_error "Neo4j密码设置失败"
        rm -f "$temp_script"
        return 1
    fi
    
    rm -f "$temp_script"
}

# 测试Neo4j连接
test_neo4j_connection() {
    log_info "测试Neo4j连接..."
    
    # 创建临时Node.js脚本来测试连接
    local temp_script=$(mktemp)
    cat > "$temp_script" << 'EOF'
const neo4j = require('neo4j-driver');

async function testConnection() {
    const driver = neo4j.driver(
        process.env.NEO4J_URI,
        neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD),
        {
            encrypted: process.env.NEO4J_ENCRYPTION === 'true' ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
            trust: 'TRUST_ALL_CERTIFICATES'
        }
    );

    try {
        await driver.verifyConnectivity();
        console.log('连接验证成功');
        
        const session = driver.session();
        try {
            const result = await session.run('RETURN "Hello Neo4j!" as message');
            console.log('查询测试成功:', result.records[0].get('message'));
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('连接测试失败:', error.message);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

testConnection();
EOF

    # 设置环境变量并运行脚本
    export NEO4J_URI="$NEO4J_URI"
    export NEO4J_USERNAME="$NEO4J_USERNAME"
    export NEO4J_PASSWORD="$NEO4J_PASSWORD"
    export NEO4J_ENCRYPTION="$NEO4J_ENCRYPTION"
    
    if node "$temp_script"; then
        log_success "Neo4j连接测试成功"
    else
        log_error "Neo4j连接测试失败"
        rm -f "$temp_script"
        return 1
    fi
    
    rm -f "$temp_script"
}

# 主函数
main() {
    log_info "开始Neo4j一键安装和配置..."
    
    # 检查系统
    check_macos
    
    # 检查Homebrew
    check_homebrew
    
    # 读取环境配置
    read_env_config
    
    # 检查Neo4j是否已安装
    if ! check_neo4j_installed; then
        install_neo4j
    fi
    
    # 启动Neo4j服务
    start_neo4j
    
    # 设置密码
    setup_neo4j_password
    
    # 测试连接
    test_neo4j_connection
    
    log_success "Neo4j安装和配置完成！"
    log_info "Neo4j Web界面: http://localhost:7474"
    log_info "Neo4j连接地址: $NEO4J_URI"
    log_info "用户名: $NEO4J_USERNAME"
    log_info "密码: $NEO4J_PASSWORD"
}

# 运行主函数
main "$@"