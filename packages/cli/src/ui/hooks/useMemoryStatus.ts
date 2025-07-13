/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Config } from '@google/gemini-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

interface MemoryStatus {
  globalMemories: number;
  projectMemories: number;
  globalRules: number;
  projectRules: number;
  isLoaded: boolean;
  error?: string;
}

/**
 * Hook to load and track memory system status
 */
export const useMemoryStatus = (config: Config): MemoryStatus => {
  const [status, setStatus] = useState<MemoryStatus>({
    globalMemories: 0,
    projectMemories: 0,
    globalRules: 0,
    projectRules: 0,
    isLoaded: false,
  });

  useEffect(() => {
    const loadMemoryStatus = async () => {
      try {
        const projectDir = config.getTargetDir();
        
        // Count global memories (correct path: ~/.gemini/memories/Memory.md)
        const globalMemoryPath = path.join(homedir(), '.gemini', 'memories', 'Memory.md');
        let globalMemories = 0;
        try {
          const globalContent = await fs.readFile(globalMemoryPath, 'utf-8');
          globalMemories = (globalContent.match(/^##\s/gm) || []).length;
        } catch {
          // File doesn't exist, which is fine
        }

        // Count project memories (correct path: ./.gemini/memories/Memory.md)
        const projectMemoryPath = path.join(projectDir, '.gemini', 'memories', 'Memory.md');
        let projectMemories = 0;
        try {
          const projectContent = await fs.readFile(projectMemoryPath, 'utf-8');
          projectMemories = (projectContent.match(/^##\s/gm) || []).length;
        } catch {
          // File doesn't exist, which is fine
        }

        // Count global rules (rules are still in globalrules directory)
        const globalRulesDir = path.join(homedir(), '.gemini', 'globalrules');
        let globalRules = 0;
        try {
          const globalRuleFiles = await fs.readdir(globalRulesDir);
          globalRules = globalRuleFiles.filter(f => f.endsWith('.md') && f !== 'Memory.md').length;
        } catch {
          // Directory doesn't exist
        }

        // Count project rules (rules are still in localrules directory) 
        const projectRulesDir = path.join(projectDir, '.gemini', 'localrules');
        let projectRules = 0;
        try {
          const projectRuleFiles = await fs.readdir(projectRulesDir);
          projectRules = projectRuleFiles.filter(f => f.endsWith('.md') && f !== 'Memory.md').length;
        } catch {
          // Directory doesn't exist
        }

        setStatus({
          globalMemories,
          projectMemories,
          globalRules,
          projectRules,
          isLoaded: true,
        });

        // Always log memory status for debugging
        console.log(`[Memory System] Loaded - Global: ${globalMemories} memories, ${globalRules} rules | Project: ${projectMemories} memories, ${projectRules} rules`);
        console.log(`[Memory System] Paths checked - Global: ${globalMemoryPath}, Project: ${projectMemoryPath}`);

      } catch (error) {
        setStatus(prev => ({
          ...prev,
          isLoaded: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    };

    loadMemoryStatus();
  }, [config]);

  return status;
};