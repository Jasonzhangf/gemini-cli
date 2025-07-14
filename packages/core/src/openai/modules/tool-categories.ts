/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCategories, PathMapping } from './types.js';

/**
 * 细菌式编程：工具分类操纵子
 * 小巧：仅包含工具分类逻辑
 * 模块化：独立的工具管理单元
 * 自包含：完整的工具分类系统
 */
export class ToolClassifier {
  private static readonly CATEGORIES: ToolCategories = {
    dangerous: new Set(['run_shell_command', 'write_file', 'replace']),
    complex: new Set(['write_file', 'replace'])
  };

  private static readonly PATH_MAPPINGS: PathMapping[] = [
    { toolName: 'read_file', pathArgs: ['absolute_path'] },
    { toolName: 'write_file', pathArgs: ['file_path'] },
    { toolName: 'list_directory', pathArgs: ['path'] },
    { toolName: 'replace', pathArgs: ['file_path'] },
    { toolName: 'glob', pathArgs: ['path'] },
    { toolName: 'grep', pathArgs: ['path'] }
  ];

  static isDangerous(toolName: string): boolean {
    return this.CATEGORIES.dangerous.has(toolName);
  }

  static isComplex(toolName: string): boolean {
    return this.CATEGORIES.complex.has(toolName);
  }

  static getPathArgs(toolName: string): string[] {
    const mapping = this.PATH_MAPPINGS.find(m => m.toolName === toolName);
    return mapping ? mapping.pathArgs : [];
  }

  static getAllDangerousTools(): string[] {
    return Array.from(this.CATEGORIES.dangerous);
  }

  static getAllComplexTools(): string[] {
    return Array.from(this.CATEGORIES.complex);
  }
}