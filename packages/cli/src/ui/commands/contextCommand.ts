/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandContext, SlashCommandActionReturn } from './types.js';
import { AnalysisMode } from '@google/gemini-cli-core';

export const contextCommand: SlashCommand = {
  name: 'context',
  description: 'Manage context settings and semantic analysis configuration',
  subCommands: [
    {
      name: 'status',
      description: 'Show current context management status and settings',
      action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
        const { config } = context.services;
        
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config service not available'
          };
        }

        try {
          const contextManager = config.getContextManager();
          const contextAgent = config.getContextAgent();
          const analysisSettings = config.getAnalysisSettings();
          
          let statusMessage = '# 🧠 Context Management Status\n\n';
          
          // Context Manager Status
          statusMessage += '## 📋 Context Manager\n';
          statusMessage += `- **Status**: ${contextManager ? '✅ Active' : '❌ Inactive'}\n`;
          
          if (contextManager) {
            const contextData = contextManager.getContext();
            statusMessage += `- **Maintenance Mode**: ${contextManager.isInMaintenanceMode() ? '🎯 Enabled' : '⏸️ Disabled'}\n`;
            statusMessage += `- **Dynamic Context Items**: ${contextData.dynamicContext?.length || 0}\n`;
            statusMessage += `- **History Records**: ${contextData.historyRecords?.length || 0}\n`;
          }
          
          // Context Agent Status
          statusMessage += '\n## 🤖 Context Agent (Semantic Analysis)\n';
          if (contextAgent) {
            statusMessage += `- **Status**: ${contextAgent.isInitialized() ? '✅ Initialized' : '🔄 Not Initialized'}\n`;
            statusMessage += `- **Analysis Mode**: **${analysisSettings?.mode || 'static'}**\n`;
            statusMessage += `- **L0-L4 Layers**: 🚀 **Enabled** (Unlimited Token Budget)\n`;
            
            // Show available analysis modes
            statusMessage += '\n### 📊 Available Analysis Modes:\n';
            statusMessage += '- **static**: Basic project structure analysis (fast)\n';
            statusMessage += '- **llm**: Advanced LLM-based semantic analysis (comprehensive)\n';
            statusMessage += '- **vector**: Vector-based similarity analysis (balanced)\n';
          } else {
            statusMessage += '- **Status**: ❌ Not Available\n';
          }
          
          // Configuration Info
          statusMessage += '\n## ⚙️ Configuration\n';
          statusMessage += `- **Debug Mode**: ${config.getDebugMode() ? '🔍 Enabled' : '🔇 Disabled'}\n`;
          statusMessage += `- **Context Enhancement**: ${process.env.GEMINI_CONTEXT_ENHANCEMENT !== 'false' ? '✅ Enabled' : '❌ Disabled'}\n`;
          
          statusMessage += '\n## 🛠️ Quick Commands\n';
          statusMessage += '- `/context mode <static|llm|vector>` - Switch analysis mode\n';
          statusMessage += '- `/context debug` - Toggle debug mode\n';
          statusMessage += '- `/context reset` - Reset context data\n';
          statusMessage += '- `/context layers` - Show layer information\n';

          return {
            type: 'message',
            messageType: 'info',
            content: statusMessage
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to get context status: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    },
    {
      name: 'mode',
      description: 'Switch semantic analysis mode (static|llm|vector)',
      action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
        const { config } = context.services;
        
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config service not available'
          };
        }

        const mode = args.trim().toLowerCase();
        
        if (!mode) {
          const currentMode = config.getAnalysisSettings()?.mode || 'static';
          return {
            type: 'message',
            messageType: 'info',
            content: `Current analysis mode: **${currentMode}**\n\nAvailable modes:\n- **static**: Basic project analysis\n- **llm**: Advanced LLM-based analysis\n- **vector**: Vector-based analysis\n\nUsage: /context mode <static|llm|vector>`
          };
        }

        if (!['static', 'llm', 'vector'].includes(mode)) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Invalid mode. Available: static, llm, vector'
          };
        }

        try {
          // Update analysis settings
          const analysisSettings = config.getAnalysisSettings() || { mode: AnalysisMode.STATIC };
          analysisSettings.mode = mode as AnalysisMode;
          config.setAnalysisSettings(analysisSettings);
          
          // Reinitialize context agent with new mode
          const contextAgent = config.getContextAgent();
          if (contextAgent) {
            await contextAgent.initialize();
          }

          return {
            type: 'message',
            messageType: 'info',
            content: `🔄 Semantic analysis mode switched to: **${mode}**\n\nThe new mode will take effect on the next context generation.`
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to switch mode: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    },
    {
      name: 'layers',
      description: 'Show information about L0-L4 context layers',
      action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
        return {
          type: 'message',
          messageType: 'info',
          content: `# 🏗️ Context Layer Architecture (L0-L4)

## 📚 Layer Structure
Our context system uses a 5-layer architecture for comprehensive semantic understanding:

### L0 - Project Discovery 🔍
- **Purpose**: Basic project structure analysis
- **Content**: File tree, dependencies, documentation
- **Speed**: Very Fast
- **Status**: ✅ **Always Enabled**

### L1 - Code Analysis 📝
- **Purpose**: Function and class mapping
- **Content**: Code entities, imports, exports
- **Speed**: Fast
- **Status**: ✅ **Always Enabled**

### L2 - Semantic Relationships 🔗
- **Purpose**: Cross-file dependencies and relationships
- **Content**: Call graphs, data flows
- **Speed**: Medium
- **Status**: ✅ **Always Enabled**

### L3 - Contextual Patterns 🎯
- **Purpose**: Usage patterns and architectural insights
- **Content**: Design patterns, anti-patterns
- **Speed**: Medium-Slow
- **Status**: ✅ **Always Enabled**

### L4 - Intelligent Inference 🧠
- **Purpose**: Deep semantic understanding
- **Content**: Intent inference, optimization suggestions
- **Speed**: Slow (LLM-powered)
- **Status**: ✅ **Always Enabled**

## ⚡ Performance Settings
- **Token Budget**: 🚀 **Unlimited** (100k tokens)
- **Caching**: ✅ **L0/L1 Enabled** for performance
- **Real-time Updates**: ✅ **Enabled** for all layers

## 🎛️ Mode Impact
- **static**: Uses L0-L2 layers
- **llm**: Uses all L0-L4 layers with LLM inference
- **vector**: Uses L0-L3 with vector similarity

Current mode: **${context.services.config?.getAnalysisSettings()?.mode || 'static'}**`
        };
      }
    },
    {
      name: 'debug',
      description: 'Toggle debug mode for context operations',
      action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
        const { config } = context.services;
        
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config service not available'
          };
        }

        try {
          const currentDebug = config.getDebugMode();
          config.setDebugMode(!currentDebug);
          
          return {
            type: 'message',
            messageType: 'info',
            content: `🔍 Debug mode ${!currentDebug ? 'enabled' : 'disabled'}.\n\n${!currentDebug ? 
              'Context operations will now show detailed logging.' : 
              'Context operations will use normal logging.'}`
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to toggle debug mode: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    },
    {
      name: 'reset',
      description: 'Reset context data and reinitialize',
      action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
        const { config } = context.services;
        
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config service not available'
          };
        }

        try {
          const contextManager = config.getContextManager();
          const contextAgent = config.getContextAgent();
          
          // Clear dynamic context
          if (contextManager) {
            contextManager.clearDynamicContext();
            contextManager.setHistoryRecords([]);
          }
          
          // Reinitialize context agent
          if (contextAgent) {
            await contextAgent.initialize();
          }

          return {
            type: 'message',
            messageType: 'info',
            content: '🔄 Context data reset and reinitialized successfully.\n\nThe context system is ready for fresh analysis.'
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to reset context: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    },
    {
      name: 'enhance',
      description: 'Toggle context enhancement feature',
      action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
        const currentState = process.env.GEMINI_CONTEXT_ENHANCEMENT !== 'false';
        
        // Toggle the environment variable
        process.env.GEMINI_CONTEXT_ENHANCEMENT = currentState ? 'false' : 'true';
        
        return {
          type: 'message',
          messageType: 'info',
          content: `🎯 Context enhancement ${!currentState ? 'enabled' : 'disabled'}.\n\n${!currentState ? 
            'Enhanced context with semantic analysis is now active.' : 
            'Basic context mode is now active.'}\n\nNote: Restart may be required for full effect.`
        };
      }
    }
  ]
};