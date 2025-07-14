/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandContext, SlashCommandActionReturn } from './types.js';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Initialize ContextAgent knowledge graph for the current project',
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const { services, ui } = context;
    const { config } = services;
    const { addItem } = ui;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Error: Configuration not available'
      };
    }

    try {
      const baseTime = Date.now();
      
      addItem({
        type: 'info', 
        text: '🔄 Initializing ContextAgent knowledge graph...'
      }, baseTime);

      // Get ContextAgent and force re-initialization
      const contextAgent = config.getContextAgent();
      await contextAgent.reinitialize();
      
      // Get statistics
      const stats = contextAgent.getStatistics();
      
      let message = '✅ ContextAgent initialization complete!\n\n';
      
      if (stats) {
        message += `📊 **Knowledge Graph Statistics:**\n`;
        message += `• Total nodes: ${stats.totalNodes}\n`;
        message += `• Total relationships: ${stats.totalEdges}\n`;
        message += `• Files analyzed: ${stats.fileNodes}\n`;
        message += `• Functions/methods: ${stats.functionNodes}\n`;
        message += `• Classes: ${stats.classNodes}\n`;
        message += `• External modules: ${stats.moduleNodes}\n\n`;
        message += `📈 **Relationship Types:**\n`;
        message += `• Import relationships: ${stats.importRelations}\n`;
        message += `• Function calls: ${stats.callRelations}\n`;
        message += `• Contains relationships: ${stats.containsRelations}\n\n`;
      }

      message += '🎯 The knowledge graph has been saved to `.gemini/context_graph.json`\n';
      message += '💡 Future interactions will benefit from enhanced project understanding.';

      addItem({
        type: 'info',
        text: message
      }, baseTime + 1);

      return {
        type: 'message',
        messageType: 'info',
        content: 'ContextAgent initialization complete!'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ ContextAgent initialization failed: ${errorMessage}`
      };
    }
  }
};