/**
 * Gemini CLI Router - Main Server
 * A proxy service that routes Gemini API requests to third-party providers
 * 
 * @author Jason Zhang
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { GeminiTranslator } from './gemini-translator.js';
import { config } from './config.js';

// Retry mechanism with exponential backoff
async function retryWithBackoff(operation, options = {}) {
  const maxRetries = options.maxRetries || config.retry.maxRetries;
  const initialDelay = options.initialDelay || config.retry.initialDelay;
  const maxDelay = options.maxDelay || config.retry.maxDelay;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Check if response indicates overloaded model
      if (!result.ok) {
        const errorText = await result.text();
        
        // Check for specific overload errors
        const isRetryableError = (
          result.status === 503 || 
          result.status === 429 || // Rate limit
          result.status === 502 || // Bad Gateway
          result.status === 504 || // Gateway Timeout
          errorText.includes('overloaded') || 
          errorText.includes('UNAVAILABLE') ||
          errorText.includes('rate limit') ||
          errorText.includes('quota exceeded') ||
          errorText.includes('timeout') ||
          errorText.includes('temporarily unavailable')
        );
        
        if (isRetryableError && attempt < maxRetries) {
          const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay); // Exponential backoff with cap
          console.log(`[Retry] Model overloaded/rate limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
          console.log(`[Retry] Error details: ${result.status} - ${errorText.substring(0, 200)}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If all retries exhausted for retryable errors, log final failure
        if (isRetryableError && attempt >= maxRetries) {
          console.error(`[Retry] All ${maxRetries} retry attempts exhausted for ${result.status} error`);
        }
        
        // For non-retryable errors, create a mock response to preserve the error
        return {
          ok: false,
          status: result.status,
          text: () => Promise.resolve(errorText),
          json: () => Promise.resolve({ error: { message: errorText, code: result.status } })
        };
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Check if it's a network error worth retrying
      const isRetryableNetworkError = (
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message.includes('fetch failed') ||
        error.message.includes('network error')
      );
      
      if (isRetryableNetworkError && attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        console.log(`[Retry] Network error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        console.log(`[Retry] Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-retryable error, break out
      break;
    }
  }
  
  throw lastError || new Error(`Maximum retry attempts (${maxRetries}) exceeded`);
}

const app = express();

// Middleware
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/plain' }));

// Logging middleware
app.use((req, res, next) => {
  if (config.debug) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'gemini-cli-router',
    provider: config.provider.name,
    model: config.provider.model,
    timestamp: new Date().toISOString()
  });
});

// Configuration endpoint
app.get('/config', (req, res) => {
  res.json({
    provider: config.provider.name,
    model: config.provider.model,
    version: '1.0.0'
  });
});

// Standard Gemini API endpoints (used by official Gemini CLI)
app.all('/v1beta/*', async (req, res) => {
  try {
    const geminiRequest = req.body;
    
    if (config.debug) {
      console.log(`[Router] Received Gemini API request: ${req.method} ${req.path}`);
      if (geminiRequest) {
        console.log(`[Router] Request:`, JSON.stringify(geminiRequest, null, 2));
      }
    }
    
    // Handle different types of Gemini requests
    if (req.path.includes('/generateContent')) {
      // Translate Gemini request to provider format
      const translatedRequest = GeminiTranslator.translateRequest(geminiRequest);
      
      // Get provider configuration
      const providerConfig = config.providers[config.provider.name] || config.providers.custom;
      const targetUrl = `${config.provider.baseUrl}${providerConfig.chatEndpoint}`;
      
      // Check for third-party model specification in request headers or URL
      let targetModel = null;
      
      // Option 1: Check URL path for model name (e.g., /v1beta/models/gpt-4o/generateContent)
      const modelMatch = req.path.match(/\/models\/([^\/]+)\/generateContent/);
      if (modelMatch && modelMatch[1] !== 'gemini-pro') {
        targetModel = modelMatch[1];
      }
      
      // Option 2: Check custom header
      if (req.headers['x-third-party-model']) {
        targetModel = req.headers['x-third-party-model'];
      }
      
      // Set model priority: custom model > configured model > default
      if (!translatedRequest.model) {
        translatedRequest.model = targetModel || config.provider.model || providerConfig.model;
      }
      
      if (config.debug && targetModel) {
        console.log(`[Router] Using third-party model: ${targetModel}`);
      }
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.provider.apiKey}`
      };
      
      // Handle different provider authentication
      if (config.provider.name === 'claude') {
        headers['x-api-key'] = config.provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        delete headers['Authorization'];
      }
      
      if (config.debug) {
        console.log(`[Router] Making request to: ${targetUrl}`);
      }
      
      // Make request to target provider with retry mechanism
      const response = await retryWithBackoff(async () => {
        return await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(translatedRequest)
        });
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Router] Provider error (${response.status}):`, errorText);
        
        // Provide user-friendly error messages for common status codes
        let userMessage;
        switch (response.status) {
          case 502:
            userMessage = "Bad Gateway: The AI service is temporarily unavailable. Please try again later.";
            break;
          case 503:
            userMessage = "Service Unavailable: The AI model is overloaded or under maintenance. Please try again in a few moments.";
            break;
          case 504:
            userMessage = "Gateway Timeout: The request took too long to process. Please try again.";
            break;
          case 429:
            userMessage = "Rate Limited: Too many requests. Please wait a moment before trying again.";
            break;
          case 401:
            userMessage = "Authentication Error: Invalid or expired API key.";
            break;
          case 403:
            userMessage = "Access Denied: Insufficient permissions or quota exceeded.";
            break;
          case 500:
            userMessage = "Internal Server Error: The AI service encountered an error. Please try again later.";
            break;
          default:
            // For other status codes, check if it contains specific error patterns
            if (errorText.includes('overloaded') || errorText.includes('UNAVAILABLE')) {
              userMessage = "Model Overloaded: The AI model is currently overloaded. Please try again later.";
            } else if (errorText.includes('rate limit') || errorText.includes('quota exceeded')) {
              userMessage = "Rate Limit Exceeded: Please wait before making another request.";
            } else if (errorText.includes('timeout')) {
              userMessage = "Request Timeout: The request took too long to process. Please try again.";
            } else {
              // Truncate very long error messages
              userMessage = errorText.length > 200 ? 
                `Provider error: ${errorText.substring(0, 200)}...` : 
                `Provider error: ${errorText}`;
            }
        }
        
        return res.status(response.status).json({
          error: {
            message: userMessage,
            type: 'provider_error',
            code: response.status,
            ...(config.debug && { details: errorText }) // Include full details only in debug mode
          }
        });
      }
      
      const providerResponse = await response.json();
      
      if (config.debug) {
        console.log(`[Router] Provider response received`);
      }
      
      // Translate response back to Gemini format
      const geminiResponse = GeminiTranslator.translateResponse(providerResponse);
      
      res.json(geminiResponse);
      
    } else {
      // Handle other Gemini API endpoints (models list, etc.)
      res.json({
        models: [
          {
            name: `models/${config.provider.model}`,
            displayName: config.provider.model,
            description: `Model provided by ${config.provider.name}`,
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
          }
        ]
      });
    }
    
  } catch (error) {
    console.error('[Router] Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error',
        code: 500
      }
    });
  }
});

// OpenAI-compatible endpoint (used by SHUAIHONG provider)
app.post('/chat/completions', async (req, res) => {
  try {
    const openaiRequest = req.body;
    
    if (config.debug) {
      console.log(`[Router] Received OpenAI-compatible request`);
      console.log(`[Router] Request:`, JSON.stringify(openaiRequest, null, 2));
    }
    
    // Get provider configuration
    const providerConfig = config.providers[config.provider.name] || config.providers.custom;
    const targetUrl = `${config.provider.baseUrl}${providerConfig.chatEndpoint}`;
    
    // Set model if not specified
    if (!openaiRequest.model) {
      openaiRequest.model = config.provider.model || providerConfig.model;
    }
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.provider.apiKey}`
    };
    
    // Handle different provider authentication
    if (config.provider.name === 'claude') {
      headers['x-api-key'] = config.provider.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      delete headers['Authorization'];
    }
    
    if (config.debug) {
      console.log(`[Router] Making request to: ${targetUrl}`);
      console.log(`[Router] Headers:`, { ...headers, Authorization: '[REDACTED]' });
    }
    
    // Make request to target provider with retry mechanism
    const response = await retryWithBackoff(async () => {
      return await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(openaiRequest)
      });
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Router] Provider error (${response.status}):`, errorText);
      
      // Provide user-friendly error messages for common status codes
      let userMessage;
      switch (response.status) {
        case 502:
          userMessage = "Bad Gateway: The AI service is temporarily unavailable. Please try again later.";
          break;
        case 503:
          userMessage = "Service Unavailable: The AI model is overloaded or under maintenance. Please try again in a few moments.";
          break;
        case 504:
          userMessage = "Gateway Timeout: The request took too long to process. Please try again.";
          break;
        case 429:
          userMessage = "Rate Limited: Too many requests. Please wait a moment before trying again.";
          break;
        case 401:
          userMessage = "Authentication Error: Invalid or expired API key.";
          break;
        case 403:
          userMessage = "Access Denied: Insufficient permissions or quota exceeded.";
          break;
        case 500:
          userMessage = "Internal Server Error: The AI service encountered an error. Please try again later.";
          break;
        default:
          // For other status codes, check if it contains specific error patterns
          if (errorText.includes('overloaded') || errorText.includes('UNAVAILABLE')) {
            userMessage = "Model Overloaded: The AI model is currently overloaded. Please try again later.";
          } else if (errorText.includes('rate limit') || errorText.includes('quota exceeded')) {
            userMessage = "Rate Limit Exceeded: Please wait before making another request.";
          } else if (errorText.includes('timeout')) {
            userMessage = "Request Timeout: The request took too long to process. Please try again.";
          } else {
            // Truncate very long error messages
            userMessage = errorText.length > 200 ? 
              `Provider error: ${errorText.substring(0, 200)}...` : 
              `Provider error: ${errorText}`;
          }
      }
      
      return res.status(response.status).json({
        error: {
          message: userMessage,
          type: 'provider_error',
          code: response.status,
          ...(config.debug && { details: errorText }) // Include full details only in debug mode
        }
      });
    }
    
    const providerResponse = await response.json();
    
    if (config.debug) {
      console.log(`[Router] Provider response:`, JSON.stringify(providerResponse, null, 2));
    }
    
    // For SHUAIHONG and other OpenAI-compatible providers, pass through the response
    res.json(providerResponse);
    
  } catch (error) {
    console.error('[Router] Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error',
        code: 500
      }
    });
  }
});

// Gemini CLI internal endpoint (used by official CLI)
// Note: Express doesn't handle colons in paths well, so we use a catch-all
app.post('/v1internal*', async (req, res) => {
  try {
    const geminiRequest = req.body;
    
    if (config.debug) {
      console.log(`[Router] Received internal stream request`);
      console.log(`[Router] Request:`, JSON.stringify(geminiRequest, null, 2));
    }
    
    // Translate Gemini request to provider format
    const translatedRequest = GeminiTranslator.translateRequest(geminiRequest);
    
    // Get provider configuration
    const providerConfig = config.providers[config.provider.name] || config.providers.custom;
    const targetUrl = `${config.provider.baseUrl}${providerConfig.chatEndpoint}`;
    
    // Set model if not specified
    if (!translatedRequest.model) {
      translatedRequest.model = config.provider.model || providerConfig.model;
    }
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.provider.apiKey}`
    };
    
    // Handle different provider authentication
    if (config.provider.name === 'claude') {
      headers['x-api-key'] = config.provider.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      delete headers['Authorization'];
    }
    
    if (config.debug) {
      console.log(`[Router] Making request to: ${targetUrl}`);
      console.log(`[Router] Headers:`, { ...headers, Authorization: '[REDACTED]' });
    }
    
    // Make request to target provider with retry mechanism
    const response = await retryWithBackoff(async () => {
      return await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(translatedRequest)
      });
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Router] Provider error (${response.status}):`, errorText);
      
      // Provide user-friendly error messages for common status codes
      let userMessage;
      switch (response.status) {
        case 502:
          userMessage = "Bad Gateway: The AI service is temporarily unavailable. Please try again later.";
          break;
        case 503:
          userMessage = "Service Unavailable: The AI model is overloaded or under maintenance. Please try again in a few moments.";
          break;
        case 504:
          userMessage = "Gateway Timeout: The request took too long to process. Please try again.";
          break;
        case 429:
          userMessage = "Rate Limited: Too many requests. Please wait a moment before trying again.";
          break;
        case 401:
          userMessage = "Authentication Error: Invalid or expired API key.";
          break;
        case 403:
          userMessage = "Access Denied: Insufficient permissions or quota exceeded.";
          break;
        case 500:
          userMessage = "Internal Server Error: The AI service encountered an error. Please try again later.";
          break;
        default:
          // For other status codes, check if it contains specific error patterns
          if (errorText.includes('overloaded') || errorText.includes('UNAVAILABLE')) {
            userMessage = "Model Overloaded: The AI model is currently overloaded. Please try again later.";
          } else if (errorText.includes('rate limit') || errorText.includes('quota exceeded')) {
            userMessage = "Rate Limit Exceeded: Please wait before making another request.";
          } else if (errorText.includes('timeout')) {
            userMessage = "Request Timeout: The request took too long to process. Please try again.";
          } else {
            // Truncate very long error messages
            userMessage = errorText.length > 200 ? 
              `Provider error: ${errorText.substring(0, 200)}...` : 
              `Provider error: ${errorText}`;
          }
      }
      
      return res.status(response.status).json({
        error: {
          message: userMessage,
          type: 'provider_error',
          code: response.status,
          ...(config.debug && { details: errorText }) // Include full details only in debug mode
        }
      });
    }
    
    const providerResponse = await response.json();
    
    if (config.debug) {
      console.log(`[Router] Provider response:`, JSON.stringify(providerResponse, null, 2));
    }
    
    // Translate response back to Gemini format
    const geminiResponse = GeminiTranslator.translateResponse(providerResponse);
    
    // Add GCR signature to response for identification
    if (geminiResponse.candidates && geminiResponse.candidates[0] && geminiResponse.candidates[0].content) {
      const content = geminiResponse.candidates[0].content;
      if (content.parts && content.parts[0] && content.parts[0].text) {
        // Add subtle GCR signature at the end
        content.parts[0].text += '\n\n*[Response routed via Gemini CLI Router (GCR) through ' + config.provider.name.toUpperCase() + ' provider]*';
      }
    }
    
    if (config.debug) {
      console.log(`[Router] Translated response:`, JSON.stringify(geminiResponse, null, 2));
    }
    
    res.json(geminiResponse);
    
  } catch (error) {
    console.error('[Router] Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error',
        code: 500
      }
    });
  }
});

// Main Gemini API proxy endpoint
app.post('/v1beta/models/:model', async (req, res) => {
  try {
    const { model } = req.params;
    const geminiRequest = req.body;
    
    if (config.debug) {
      console.log(`[Router] Received request for model: ${model}`);
      console.log(`[Router] Gemini request:`, JSON.stringify(geminiRequest, null, 2));
    }
    
    // Translate Gemini request to Claude/OpenAI format
    const translatedRequest = GeminiTranslator.translateRequest(geminiRequest);
    
    if (config.debug) {
      console.log(`[Router] Translated request:`, JSON.stringify(translatedRequest, null, 2));
    }
    
    // Get provider configuration
    const providerConfig = config.providers[config.provider.name] || config.providers.custom;
    const targetUrl = `${config.provider.baseUrl}${providerConfig.chatEndpoint}`;
    
    // Override model if specified
    translatedRequest.model = config.provider.model || providerConfig.model;
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.provider.apiKey}`
    };
    
    // Handle different provider authentication
    if (config.provider.name === 'claude') {
      headers['x-api-key'] = config.provider.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      delete headers['Authorization'];
    }
    
    if (config.debug) {
      console.log(`[Router] Making request to: ${targetUrl}`);
      console.log(`[Router] Headers:`, { ...headers, Authorization: '[REDACTED]' });
    }
    
    // Make request to target provider with retry mechanism
    const response = await retryWithBackoff(async () => {
      return await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(translatedRequest)
      });
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Router] Provider error (${response.status}):`, errorText);
      
      // Provide user-friendly error messages for common status codes
      let userMessage;
      switch (response.status) {
        case 502:
          userMessage = "Bad Gateway: The AI service is temporarily unavailable. Please try again later.";
          break;
        case 503:
          userMessage = "Service Unavailable: The AI model is overloaded or under maintenance. Please try again in a few moments.";
          break;
        case 504:
          userMessage = "Gateway Timeout: The request took too long to process. Please try again.";
          break;
        case 429:
          userMessage = "Rate Limited: Too many requests. Please wait a moment before trying again.";
          break;
        case 401:
          userMessage = "Authentication Error: Invalid or expired API key.";
          break;
        case 403:
          userMessage = "Access Denied: Insufficient permissions or quota exceeded.";
          break;
        case 500:
          userMessage = "Internal Server Error: The AI service encountered an error. Please try again later.";
          break;
        default:
          // For other status codes, check if it contains specific error patterns
          if (errorText.includes('overloaded') || errorText.includes('UNAVAILABLE')) {
            userMessage = "Model Overloaded: The AI model is currently overloaded. Please try again later.";
          } else if (errorText.includes('rate limit') || errorText.includes('quota exceeded')) {
            userMessage = "Rate Limit Exceeded: Please wait before making another request.";
          } else if (errorText.includes('timeout')) {
            userMessage = "Request Timeout: The request took too long to process. Please try again.";
          } else {
            // Truncate very long error messages
            userMessage = errorText.length > 200 ? 
              `Provider error: ${errorText.substring(0, 200)}...` : 
              `Provider error: ${errorText}`;
          }
      }
      
      return res.status(response.status).json({
        error: {
          code: response.status,
          message: userMessage,
          status: 'PROVIDER_ERROR',
          ...(config.debug && { details: errorText }) // Include full details only in debug mode
        }
      });
    }
    
    const providerResponse = await response.json();
    
    if (config.debug) {
      console.log(`[Router] Provider response:`, JSON.stringify(providerResponse, null, 2));
    }
    
    // Translate response back to Gemini format
    const geminiResponse = GeminiTranslator.translateResponse(providerResponse);
    
    if (config.debug) {
      console.log(`[Router] Gemini response:`, JSON.stringify(geminiResponse, null, 2));
    }
    
    res.json(geminiResponse);
    
  } catch (error) {
    console.error('[Router] Error:', error);
    res.status(500).json({
      error: {
        code: 500,
        message: error.message,
        status: 'INTERNAL_ERROR'
      }
    });
  }
});

// Catch-all for other Gemini API endpoints
app.all('/v1beta/*', (req, res) => {
  if (config.debug) {
    console.log(`[Router] Unhandled endpoint: ${req.method} ${req.path}`);
  }
  
  res.status(404).json({
    error: {
      code: 404,
      message: `Endpoint not supported: ${req.path}`,
      status: 'NOT_FOUND'
    }
  });
});

// Start server
const server = app.listen(config.port, config.host, () => {
  console.log(`\n🚀 Gemini CLI Router started successfully!`);
  console.log(`📡 Server: http://${config.host}:${config.port}`);
  console.log(`🎯 Provider: ${config.provider.name} (${config.provider.model})`);
  console.log(`🔧 Debug mode: ${config.debug ? 'ON' : 'OFF'}`);
  console.log(`⚡ Ready to route Gemini API requests!\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;