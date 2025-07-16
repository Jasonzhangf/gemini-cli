#!/usr/bin/env node

/**
 * 迁移存储路径从 ~/.gemini/Projects/ 到 ~/.gemini/projects/
 * 这个脚本会将旧的大写P目录迁移到新的小写p目录
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function migrateStoragePaths() {
    console.log('开始迁移存储路径...');
    
    const homeDir = os.homedir();
    const oldProjectsDir = path.join(homeDir, '.gemini', 'Projects');
    const newProjectsDir = path.join(homeDir, '.gemini', 'projects');
    
    try {
        // 检查旧目录是否存在
        const oldDirExists = await fs.access(oldProjectsDir).then(() => true).catch(() => false);
        
        if (!oldDirExists) {
            console.log('没有找到旧的Projects目录，无需迁移');
            return;
        }
        
        // 确保新目录存在
        await fs.mkdir(newProjectsDir, { recursive: true });
        
        // 读取旧目录内容
        const oldEntries = await fs.readdir(oldProjectsDir, { withFileTypes: true });
        
        console.log(`找到${oldEntries.length}个项目需要迁移`);
        
        for (const entry of oldEntries) {
            if (entry.isDirectory()) {
                const oldPath = path.join(oldProjectsDir, entry.name);
                const newPath = path.join(newProjectsDir, entry.name);
                
                // 检查新位置是否已存在
                const newExists = await fs.access(newPath).then(() => true).catch(() => false);
                
                if (!newExists) {
                    console.log(`迁移项目: ${entry.name}`);
                    await fs.rename(oldPath, newPath);
                } else {
                    console.log(`跳过项目: ${entry.name} (已存在)`);
                }
            }
        }
        
        // 检查旧目录是否为空
        const remainingEntries = await fs.readdir(oldProjectsDir);
        if (remainingEntries.length === 0) {
            console.log('删除空的旧Projects目录');
            await fs.rmdir(oldProjectsDir);
        } else {
            console.log(`旧目录中还有${remainingEntries.length}个项目未迁移`);
        }
        
        console.log('迁移完成！');
        
    } catch (error) {
        console.error('迁移失败:', error);
    }
}

// 运行迁移
migrateStoragePaths();