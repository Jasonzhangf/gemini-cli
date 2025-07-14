/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { ToolClassifier } from './tool-categories.js';

/**
 * 细菌式编程：路径处理操纵子
 * 小巧：仅处理路径转换和验证
 * 模块化：独立的路径处理单元
 * 自包含：完整的路径处理功能
 */
export class PathProcessor {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  processToolArgs(toolName: string, args: any): any {
    const pathArgs = ToolClassifier.getPathArgs(toolName);
    if (pathArgs.length === 0) {
      return args;
    }

    const processedArgs = { ...args };
    
    for (const pathArg of pathArgs) {
      if (processedArgs[pathArg]) {
        processedArgs[pathArg] = this.ensureAbsolutePath(processedArgs[pathArg]);
      }
    }

    return processedArgs;
  }

  private ensureAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workingDirectory, filePath);
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}