/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentMarkers } from './types.js';

/**
 * 细菌式编程：内容隔离操纵子
 * 小巧：仅负责内容标记和解析
 * 模块化：独立的内容处理单元
 * 自包含：完整的内容隔离功能
 */
export class ContentIsolator {
  private static readonly MARKERS: ContentMarkers = {
    START: '<*#*#CONTENT#*#*>',
    END: '</*#*#CONTENT#*#*>',
    PATTERN: /<\*#\*#CONTENT#\*#\*>([\s\S]*?)<\/\*#\*#CONTENT#\*#\*>/g
  };

  static isolateContent(content: string): string {
    return `${this.MARKERS.START}${content}${this.MARKERS.END}`;
  }

  static extractContent(text: string): string[] {
    const matches: string[] = [];
    let match;
    
    while ((match = this.MARKERS.PATTERN.exec(text)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  static removeMarkers(text: string): string {
    return text.replace(this.MARKERS.PATTERN, '$1');
  }

  static hasMarkers(text: string): boolean {
    return this.MARKERS.PATTERN.test(text);
  }
}