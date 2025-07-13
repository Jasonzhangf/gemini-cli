# Hash Command Testing Guide - 简化版

## 🚀 新的简化命令

### 1. 快速保存命令
- Input: `#g 学到了新的React技巧`
- Expected: 直接保存到全局记忆

- Input: `#p 这个项目使用TypeScript配置`
- Expected: 直接保存到项目记忆

### 2. 查看记忆
- Input: `#v`
- Expected: 显示记忆统计信息

### 3. 智能类型选择
- Input: `# 这是一条记忆内容`
- Expected: 显示简化的类型选择提示，包含 `#g` 和 `#p` 命令

### 4. 帮助命令
- Input: `#help`
- Expected: 显示完整的命令帮助

### 5. 安静模式
- Input: `#`（仅输入#）
- Expected: 不显示任何内容，让用户继续输入

## 🎯 用户体验改进

1. **不会弹出菜单**
   - 输入 `#` 不会立即显示帮助
   - 只有完整命令才有响应

2. **超简洁命令**
   - `#g` = 保存全局记忆
   - `#p` = 保存项目记忆  
   - `#v` = 查看记忆

3. **智能提示**
   - `# 内容` 会显示简化的选择提示
   - 提供准确的命令供复制

## 📋 完整测试场景

### 快速工作流
```
#g TypeScript的泛型可以这样使用          # 保存全局
#p 这个项目的API地址是localhost:3000    # 保存项目  
#v                                     # 查看统计
```

### 交互式保存
```
# 学到了一个新的编程模式              # 显示选择
#g 学到了一个新的编程模式             # 复制建议保存全局
```

## 📁 文件位置检查

- `~/.gemini/globalrules/Memory.md` (全局记忆)
- `./gemini/localrules/Memory.md` (项目记忆)

## 🔄 向后兼容

所有旧命令仍然可用：
- `#save global <内容>`
- `#save project <内容>`
- `#view`, `#list`, `#cleanup`