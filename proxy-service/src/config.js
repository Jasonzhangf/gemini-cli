/**
 * Configuration for Claude Code Router
 * 
 * @author Jason Zhang
 */

export const config = {
  // Server configuration
  port: process.env.CCR_PORT || 3457,
  host: process.env.CCR_HOST || 'localhost',
  
  // Target provider configuration
  provider: {
    // Default to SHUAIHONG, but can be configured
    name: process.env.CCR_PROVIDER || 'shuaihong',
    baseUrl: process.env.CCR_BASE_URL || 'https://ai.shuaihong.fun/v1',
    apiKey: process.env.CCR_API_KEY || 'sk-g4hBumofoYFvLjLivj9uxeIYUR5uE3he2twZERTextAgsXPl',
    model: process.env.CCR_MODEL || 'gpt-4o'
  },
  
  // Supported providers
  providers: {
    shuaihong: {
      baseUrl: 'https://ai.shuaihong.fun/v1',
      chatEndpoint: '/chat/completions',
      model: 'gpt-4o'
    },
    deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      chatEndpoint: '/chat/completions',
      model: 'deepseek-chat'
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      chatEndpoint: '/chat/completions',
      model: 'gpt-4'
    },
    claude: {
      baseUrl: 'https://api.anthropic.com/v1',
      chatEndpoint: '/messages',
      model: 'claude-3-sonnet-20240229'
    },
    // Add more providers as needed
    custom: {
      baseUrl: process.env.CCR_CUSTOM_BASE_URL || '',
      chatEndpoint: process.env.CCR_CUSTOM_ENDPOINT || '/chat/completions',
      model: process.env.CCR_CUSTOM_MODEL || 'custom-model'
    }
  },
  
  // Debug mode
  debug: process.env.CCR_DEBUG === 'true' || false,
  
  // CORS configuration
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-goog-api-key']
  }
};