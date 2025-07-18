#!/bin/bash

# Neo4j 密码重置脚本
# 根据~/.gemini/.env配置重置Neo4j密码

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
    log_info "  New Password: $NEO4J_PASSWORD"
}

# 检查Neo4j是否运行
check_neo4j_running() {
    if curl -s http://localhost:7474 &> /dev/null; then
        log_success "Neo4j服务正在运行"
        return 0
    else
        log_error "Neo4j服务未运行。请先启动Neo4j服务："
        log_info "  brew services start neo4j"
        return 1
    fi
}

# 尝试不同的密码重置方法
reset_password_method1() {
    log_info "尝试方法1: 使用默认密码'neo4j'重置..."
    
    local temp_script=$(mktemp)
    cat > "$temp_script" << 'EOF'
const neo4j = require('neo4j-driver');

async function resetPassword() {
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
            console.log('SUCCESS: 使用默认密码重置成功');
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('FAILED: 使用默认密码重置失败:', error.message);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

resetPassword();
EOF

    export NEO4J_PASSWORD="$NEO4J_PASSWORD"
    
    if node "$temp_script" 2>/dev/null; then
        rm -f "$temp_script"
        return 0
    else
        rm -f "$temp_script"
        return 1
    fi
}

# 尝试使用当前配置的密码重置
reset_password_method2() {
    log_info "尝试方法2: 使用当前设置的密码'password'重置..."
    
    local temp_script=$(mktemp)
    cat > "$temp_script" << 'EOF'
const neo4j = require('neo4j-driver');

async function resetPassword() {
    const driver = neo4j.driver(
        'bolt://localhost:7687',
        neo4j.auth.basic('neo4j', 'password'),
        {
            encrypted: 'ENCRYPTION_OFF',
            trust: 'TRUST_ALL_CERTIFICATES'
        }
    );

    try {
        const session = driver.session({ database: 'system' });
        try {
            await session.run(
                `ALTER CURRENT USER SET PASSWORD FROM 'password' TO '${process.env.NEO4J_PASSWORD}'`
            );
            console.log('SUCCESS: 使用当前密码重置成功');
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('FAILED: 使用当前密码重置失败:', error.message);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

resetPassword();
EOF

    export NEO4J_PASSWORD="$NEO4J_PASSWORD"
    
    if node "$temp_script" 2>/dev/null; then
        rm -f "$temp_script"
        return 0
    else
        rm -f "$temp_script"
        return 1
    fi
}

# 尝试使用.env中的密码重置
reset_password_method3() {
    log_info "尝试方法3: 使用.env中的密码重置..."
    
    local temp_script=$(mktemp)
    cat > "$temp_script" << 'EOF'
const neo4j = require('neo4j-driver');

async function resetPassword() {
    const driver = neo4j.driver(
        'bolt://localhost:7687',
        neo4j.auth.basic('neo4j', process.env.NEO4J_PASSWORD),
        {
            encrypted: 'ENCRYPTION_OFF',
            trust: 'TRUST_ALL_CERTIFICATES'
        }
    );

    try {
        const session = driver.session({ database: 'system' });
        try {
            await session.run(
                `ALTER CURRENT USER SET PASSWORD FROM '${process.env.NEO4J_PASSWORD}' TO '${process.env.NEO4J_PASSWORD}'`
            );
            console.log('SUCCESS: 密码已经是正确的');
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('FAILED: 使用.env密码失败:', error.message);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

resetPassword();
EOF

    export NEO4J_PASSWORD="$NEO4J_PASSWORD"
    
    if node "$temp_script" 2>/dev/null; then
        rm -f "$temp_script"
        return 0
    else
        rm -f "$temp_script"
        return 1
    fi
}

# 停止并重置Neo4j
reset_neo4j_completely() {
    log_warning "尝试完全重置Neo4j..."
    
    # 停止服务
    log_info "停止Neo4j服务..."
    brew services stop neo4j || true
    
    # 删除数据目录
    log_info "删除Neo4j数据目录..."
    rm -rf "/opt/homebrew/var/lib/neo4j" || true
    rm -rf "/usr/local/var/lib/neo4j" || true
    
    # 重新启动服务
    log_info "重新启动Neo4j服务..."
    brew services start neo4j
    
    # 等待服务启动
    log_info "等待Neo4j服务启动..."
    sleep 15
    
    # 检查服务状态
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s http://localhost:7474 &> /dev/null; then
            log_success "Neo4j服务重启成功"
            break
        fi
        
        log_info "等待Neo4j启动... (尝试 $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "Neo4j服务重启失败"
        return 1
    fi
    
    # 现在使用默认密码设置新密码
    reset_password_method1
}

# 测试连接
test_connection() {
    log_info "测试Neo4j连接..."
    
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

    export NEO4J_URI="$NEO4J_URI"
    export NEO4J_USERNAME="$NEO4J_USERNAME"
    export NEO4J_PASSWORD="$NEO4J_PASSWORD"
    export NEO4J_ENCRYPTION="$NEO4J_ENCRYPTION"
    
    if node "$temp_script"; then
        log_success "Neo4j连接测试成功"
        rm -f "$temp_script"
        return 0
    else
        log_error "Neo4j连接测试失败"
        rm -f "$temp_script"
        return 1
    fi
}

# 主函数
main() {
    log_info "开始Neo4j密码重置..."
    
    # 读取环境配置
    read_env_config
    
    # 检查Neo4j是否运行
    if ! check_neo4j_running; then
        exit 1
    fi
    
    # 尝试不同的密码重置方法
    if reset_password_method3; then
        log_success "密码已经正确配置"
    elif reset_password_method1; then
        log_success "使用默认密码重置成功"
    elif reset_password_method2; then
        log_success "使用当前密码重置成功"
    else
        log_warning "常规方法失败，尝试完全重置..."
        if reset_neo4j_completely; then
            log_success "完全重置成功"
        else
            log_error "所有重置方法都失败了"
            exit 1
        fi
    fi
    
    # 测试连接
    if test_connection; then
        log_success "Neo4j密码重置完成！"
        log_info "用户名: $NEO4J_USERNAME"
        log_info "密码: $NEO4J_PASSWORD"
    else
        log_error "密码重置后连接测试失败"
        exit 1
    fi
}

# 运行主函数
main "$@"