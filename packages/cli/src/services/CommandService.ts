/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { initCommand } from '../ui/commands/initCommand.js';
import { contextCommand } from '../ui/commands/contextCommand.js';
import { modelCommand } from '../ui/commands/modelCommand.js';

const loadBuiltInCommands = async (): Promise<SlashCommand[]> => [
  clearCommand,
  contextCommand,
  helpCommand,
  initCommand,
  memoryCommand,
  modelCommand,
  themeCommand,
];

export class CommandService {
  private commands: SlashCommand[] = [];
  private loaded = false;

  constructor(
    private commandLoader: () => Promise<SlashCommand[]> = loadBuiltInCommands,
  ) {
    // The constructor can be used for dependency injection in the future.
    // Load commands synchronously if possible
    this.loadCommandsSync();
  }

  private loadCommandsSync(): void {
    try {
      // Load built-in commands synchronously since they're static
      this.commands = [
        clearCommand,
        contextCommand,
        helpCommand,
        initCommand,
        memoryCommand,
        modelCommand,
        themeCommand,
      ];
      this.loaded = true;
    } catch (error) {
      console.warn('[CommandService] Failed to load commands synchronously:', error);
    }
  }

  async loadCommands(): Promise<void> {
    if (this.loaded) {
      return; // Already loaded synchronously
    }
    
    // For now, we only load the built-in commands.
    // File-based and remote commands will be added later.
    this.commands = await this.commandLoader();
    this.loaded = true;
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}
