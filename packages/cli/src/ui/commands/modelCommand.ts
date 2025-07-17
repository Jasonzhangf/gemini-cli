/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandContext, MessageActionReturn } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ModelProvider {
  id: string;
  name: string;
  description: string;
  available: boolean;
  current: boolean;
  models?: string[];
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  provider: string;
  current: boolean;
}

/**
 * Get available model providers from environment configuration
 */
function getAvailableProviders(context: CommandContext): ModelProvider[] {
  const providers: ModelProvider[] = [];
  
  try {
    // Load current provider from environment
    let currentProvider = process.env.OPENAI_PROVIDER || 'GEMINI';
    
    // If in OpenAI mode, respect the current provider setting
    if (context.services.config?.getOpenAIMode()) {
      // Already using currentProvider from environment
    } else {
      currentProvider = 'GEMINI';
    }

    // Check for SiliconFlow
    const siliconflowApiKey = process.env.SILICONFLOW_API_KEY;
    providers.push({
      id: 'SILICONFLOW',
      name: 'SiliconFlow',
      description: 'SiliconFlow API (Qwen models)',
      available: !!siliconflowApiKey,
      current: currentProvider === 'SILICONFLOW',
      models: [
        'Qwen/Qwen3-8B',
        'Qwen/Qwen3-14B', 
        'Qwen/Qwen3-72B',
        'deepseek-ai/deepseek-llm-67b-chat',
        'internlm/internlm2_5-7b-chat',
        'BAAI/bge-large-en-v1.5'
      ]
    });

    // Check for DOUBAO
    const doubaoApiKey = process.env.DOUBAO_API_KEY;
    providers.push({
      id: 'DOUBAO',
      name: 'DOUBAO',
      description: 'Volcano Engine DOUBAO API',
      available: !!doubaoApiKey,
      current: currentProvider === 'DOUBAO',
      models: [
        'ep-20241216165142-hsgmt',
        'doubao-lite-4k',
        'doubao-lite-32k',
        'doubao-pro-4k',
        'doubao-pro-32k'
      ]
    });

    // Check for LMStudio
    const lmstudioEndpoint = process.env.LMSTUDIO_API_ENDPOINT;
    providers.push({
      id: 'LMSTUDIO',
      name: 'LM Studio',
      description: 'Local LM Studio server',
      available: !!lmstudioEndpoint,
      current: currentProvider === 'LMSTUDIO',
      models: [
        'unsloth/qwen3-235b-a22b-gguf/qwen3-235b-a22b-ud-q4_k_xl-00001-of-00003.gguf',
        'local-model'
      ]
    });

    // Gemini (always available if not in OpenAI mode)
    providers.push({
      id: 'GEMINI',
      name: 'Gemini',
      description: 'Google Gemini API',
      available: !context.services.config?.getOpenAIMode() || currentProvider === 'GEMINI',
      current: currentProvider === 'GEMINI' || !context.services.config?.getOpenAIMode(),
      models: [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash'
      ]
    });

  } catch (error) {
    console.error('[Model Command] Error checking providers:', error);
  }

  return providers;
}

/**
 * Get current model information
 */
function getCurrentModel(context: CommandContext): { provider: string; model: string } {
  const currentProvider = process.env.OPENAI_PROVIDER || 'GEMINI';
  
  if (context.services.config?.getOpenAIMode()) {
    // In OpenAI mode, get the actual model from environment
    switch (currentProvider) {
      case 'SILICONFLOW':
        return {
          provider: 'SILICONFLOW',
          model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B'
        };
      case 'DOUBAO':
        return {
          provider: 'DOUBAO', 
          model: process.env.DOUBAO_ACTUAL_MODEL || 'ep-20241216165142-hsgmt'
        };
      case 'LMSTUDIO':
        return {
          provider: 'LMSTUDIO',
          model: process.env.LMSTUDIO_ACTUAL_MODEL || 'local-model'
        };
      default:
        return { provider: currentProvider, model: 'unknown' };
    }
  } else {
    // In Gemini mode
    return {
      provider: 'GEMINI',
      model: context.services.config?.getDisplayModel() || 'gemini-2.5-pro'
    };
  }
}

/**
 * Get available models for current provider
 */
function getAvailableModels(context: CommandContext): ModelInfo[] {
  const providers = getAvailableProviders(context);
  const currentProviderData = providers.find(p => p.current);
  const currentModel = getCurrentModel(context);
  
  if (!currentProviderData || !currentProviderData.models) {
    return [];
  }
  
  return currentProviderData.models.map(modelId => ({
    id: modelId,
    name: modelId,
    description: `${currentProviderData.name} model`,
    provider: currentProviderData.id,
    current: modelId === currentModel.model
  }));
}

/**
 * Switch to a specific model within current provider
 */
function switchModel(modelId: string, context: CommandContext): MessageActionReturn {
  try {
    const currentModel = getCurrentModel(context);
    const currentProvider = currentModel.provider;
    
    // Update environment variable for the current provider
    let envVarName: string;
    switch (currentProvider) {
      case 'SILICONFLOW':
        envVarName = 'SILICONFLOW_MODEL';
        break;
      case 'DOUBAO':
        envVarName = 'DOUBAO_ACTUAL_MODEL';
        break;
      case 'LMSTUDIO':
        envVarName = 'LMSTUDIO_ACTUAL_MODEL';
        break;
      case 'GEMINI':
        // For Gemini, we might need to use the config system
        if (context.services.config) {
          context.services.config.setModel(modelId);
          return {
            type: 'message',
            messageType: 'info',
            content: `✅ Switched to ${modelId} model in ${currentProvider} provider.`
          };
        }
        return {
          type: 'message',
          messageType: 'error',
          content: '❌ Cannot switch Gemini model: config not available.'
        };
      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ Model switching not supported for provider: ${currentProvider}`
        };
    }
    
    // Update project .env file
    const projectEnvFile = path.join(process.cwd(), '.env');
    if (fs.existsSync(projectEnvFile)) {
      let envContent = fs.readFileSync(projectEnvFile, 'utf-8');
      
      if (envContent.includes(`${envVarName}=`)) {
        envContent = envContent.replace(new RegExp(`${envVarName}=.*`, 'g'), `${envVarName}=${modelId}`);
      } else {
        envContent += `\n${envVarName}=${modelId}\n`;
      }
      
      fs.writeFileSync(projectEnvFile, envContent);
    }

    // Update global .env file
    const globalEnvFile = path.join(os.homedir(), '.gemini', '.env');
    if (fs.existsSync(globalEnvFile)) {
      let envContent = fs.readFileSync(globalEnvFile, 'utf-8');
      
      if (envContent.includes(`${envVarName}=`)) {
        envContent = envContent.replace(new RegExp(`${envVarName}=.*`, 'g'), `${envVarName}=${modelId}`);
      } else {
        envContent += `\n${envVarName}=${modelId}\n`;
      }
      
      fs.writeFileSync(globalEnvFile, envContent);
    }

    // Update process environment
    process.env[envVarName] = modelId;

    return {
      type: 'message',
      messageType: 'info',
      content: `✅ Switched to ${modelId} model in ${currentProvider} provider. Restart CLI for changes to take effect.`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ Failed to switch model: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Switch to a specific model provider
 */
function switchProvider(providerId: string, context: CommandContext): MessageActionReturn {
  try {
    // Update project .env file
    const projectEnvFile = path.join(process.cwd(), '.env');
    if (fs.existsSync(projectEnvFile)) {
      let envContent = fs.readFileSync(projectEnvFile, 'utf-8');
      
      // Update or add OPENAI_PROVIDER
      if (envContent.includes('OPENAI_PROVIDER=')) {
        envContent = envContent.replace(/OPENAI_PROVIDER=.*/g, `OPENAI_PROVIDER=${providerId}`);
      } else {
        envContent += `\nOPENAI_PROVIDER=${providerId}\n`;
      }
      
      fs.writeFileSync(projectEnvFile, envContent);
    }

    // Also update global .env file
    const globalEnvFile = path.join(os.homedir(), '.gemini', '.env');
    if (fs.existsSync(globalEnvFile)) {
      let envContent = fs.readFileSync(globalEnvFile, 'utf-8');
      
      if (envContent.includes('OPENAI_PROVIDER=')) {
        envContent = envContent.replace(/OPENAI_PROVIDER=.*/g, `OPENAI_PROVIDER=${providerId}`);
      } else {
        envContent += `\nOPENAI_PROVIDER=${providerId}\n`;
      }
      
      fs.writeFileSync(globalEnvFile, envContent);
    }

    // Update process environment
    process.env.OPENAI_PROVIDER = providerId;

    return {
      type: 'message',
      messageType: 'info',
      content: `✅ Switched to ${providerId} provider. Restart the CLI for changes to take effect.`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ Failed to switch provider: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Manage model providers and models',
  subCommands: [
    {
      name: 'provider',
      description: 'Switch between model providers',
      completion: async (context: CommandContext, partialArg: string): Promise<string[]> => {
        const providers = getAvailableProviders(context);
        const availableProviders = providers
          .filter(p => p.available)
          .map(p => p.id.toLowerCase());
        
        return availableProviders.filter(provider => 
          provider.startsWith(partialArg.toLowerCase())
        );
      }
    },
    {
      name: 'switch',
      description: 'Switch models within current provider',
      completion: async (context: CommandContext, partialArg: string): Promise<string[]> => {
        const models = getAvailableModels(context);
        const availableModels = models
          .filter(m => !m.current)
          .map(m => m.id);
        
        return availableModels.filter(model => 
          model.toLowerCase().includes(partialArg.toLowerCase())
        );
      }
    },
    {
      name: 'list',
      description: 'Show current status and available options'
    }
  ],
  action: (context: CommandContext, args: string): MessageActionReturn => {
    const trimmedArgs = args.trim();
    
    // If no arguments, show current status
    if (!trimmedArgs) {
      const currentModel = getCurrentModel(context);
      const providers = getAvailableProviders(context);
      const currentProvider = providers.find(p => p.current);
      
      let content = '🤖 **Current Model Status**\n\n';
      content += `📍 **Provider**: ${currentProvider?.name || 'Unknown'}\n`;
      content += `🎯 **Model**: ${currentModel.model}\n\n`;
      
      content += '💡 **Available Commands**:\n';
      content += '  • `/model provider` - Switch to different provider\n';
      content += '  • `/model switch` - Switch models in current provider\n';
      content += '  • `/model list` - Show detailed information\n';
      
      return {
        type: 'message',
        messageType: 'info',
        content
      };
    }

    // Handle subcommands
    const [subCommand, ...subArgs] = trimmedArgs.split(' ');
    
    switch (subCommand.toLowerCase()) {
      case 'list': {
        const currentModel = getCurrentModel(context);
        const providers = getAvailableProviders(context);
        const currentProvider = providers.find(p => p.current);
        const models = getAvailableModels(context);
        
        let content = '🤖 **Model Management Overview**\n\n';
        content += `📍 **Current Configuration**:\n`;
        content += `  • Provider: ${currentProvider?.name || 'Unknown'}\n`;
        content += `  • Model: ${currentModel.model}\n\n`;
        
        content += '🏢 **Available Providers**:\n';
        for (const provider of providers) {
          const status = provider.current ? '🟢 (current)' : provider.available ? '🟡 (available)' : '🔴 (not configured)';
          content += `  • **${provider.name}** ${status}\n`;
        }
        
        if (models.length > 0) {
          content += `\n🎯 **Available Models in ${currentProvider?.name}**:\n`;
          for (const model of models) {
            const status = model.current ? '🟢 (current)' : '🟡 (available)';
            content += `  • ${model.name} ${status}\n`;
          }
        }
        
        content += '\n💡 **Commands**:\n';
        content += '  • `/model provider <name>` - Switch provider\n';
        content += '  • `/model switch <model>` - Switch model in current provider\n';
        
        return {
          type: 'message',
          messageType: 'info',
          content
        };
      }

      case 'provider':
        if (subArgs.length === 0) {
          // Show available providers
          const providers = getAvailableProviders(context);
          const availableProviders = providers.filter(p => p.available);
          
          let content = '🏢 **Available Model Providers**:\n\n';
          for (const provider of availableProviders) {
            const status = provider.current ? '🟢 (current)' : '🟡 (switch to)';
            content += `  • \`/model provider ${provider.id.toLowerCase()}\` - ${provider.name} ${status}\n`;
            content += `    ${provider.description}\n\n`;
          }
          
          return {
            type: 'message',
            messageType: 'info',
            content
          };
        }
        
        const targetProvider = subArgs[0].toUpperCase();
        const providers = getAvailableProviders(context);
        const provider = providers.find(p => p.id === targetProvider);
        
        if (!provider) {
          return {
            type: 'message',
            messageType: 'error',
            content: `❌ Unknown provider: ${subArgs[0]}. Use \`/model provider\` to see available providers.`
          };
        }
        
        if (!provider.available) {
          return {
            type: 'message',
            messageType: 'error',
            content: `❌ Provider ${provider.name} is not configured. Please check your environment variables.`
          };
        }
        
        if (provider.current) {
          return {
            type: 'message',
            messageType: 'info',
            content: `ℹ️ Already using ${provider.name} provider.`
          };
        }
        
        return switchProvider(targetProvider, context);
        
      case 'switch':
        if (subArgs.length === 0) {
          // Show available models in current provider
          const models = getAvailableModels(context);
          const currentModel = getCurrentModel(context);
          
          if (models.length === 0) {
            return {
              type: 'message',
              messageType: 'info',
              content: `ℹ️ No models available for switching in ${currentModel.provider} provider.`
            };
          }
          
          const availableModels = models.filter(m => !m.current);
          
          if (availableModels.length === 0) {
            return {
              type: 'message',
              messageType: 'info',
              content: `ℹ️ No other models available to switch to in ${currentModel.provider} provider.`
            };
          }
          
          let content = `🎯 **Available Models in ${currentModel.provider}**:\n\n`;
          content += `📍 Current: ${currentModel.model}\n\n`;
          content += '🔄 **Switch to**:\n';
          for (const model of availableModels) {
            content += `  • \`/model switch ${model.id}\` - ${model.name}\n`;
          }
          
          return {
            type: 'message',
            messageType: 'info',
            content
          };
        }
        
        const targetModel = subArgs.join(' '); // Support model names with spaces
        const models = getAvailableModels(context);
        const model = models.find(m => m.id === targetModel);
        
        if (!model) {
          return {
            type: 'message',
            messageType: 'error',
            content: `❌ Unknown model: ${targetModel}. Use \`/model switch\` to see available models.`
          };
        }
        
        if (model.current) {
          return {
            type: 'message',
            messageType: 'info',
            content: `ℹ️ Already using ${model.name} model.`
          };
        }
        
        return switchModel(targetModel, context);
        
      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ Unknown subcommand: ${subCommand}. Use \`/model\` to see available commands.`
        };
    }
  },
  completion: async (context: CommandContext, partialArg: string): Promise<string[]> => {
    const parts = partialArg.trim().split(' ');
    
    if (parts.length <= 1) {
      // Complete subcommands
      return ['list', 'provider', 'switch'].filter(cmd => cmd.startsWith(parts[0] || ''));
    }
    
    if (parts[0] === 'provider' && parts.length === 2) {
      // Complete provider names
      const providers = getAvailableProviders(context);
      const availableProviders = providers
        .filter(p => p.available)
        .map(p => p.id.toLowerCase());
      
      return availableProviders.filter(provider => 
        provider.startsWith(parts[1].toLowerCase())
      );
    }
    
    if (parts[0] === 'switch' && parts.length >= 2) {
      // Complete model names within current provider
      const models = getAvailableModels(context);
      const availableModels = models
        .filter(m => !m.current)
        .map(m => m.id);
      
      const partialModel = parts.slice(1).join(' ');
      return availableModels.filter(model => 
        model.toLowerCase().includes(partialModel.toLowerCase())
      );
    }
    
    return [];
  }
};