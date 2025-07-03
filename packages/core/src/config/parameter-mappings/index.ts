/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { 
  ModelParameterMapping, 
  ParameterMappingRegistry, 
  MappingResult,
  ToolParameterMapping 
} from './types.js';

// Import mapping configurations
import aistudioProxyMapping from './aistudio-proxy.json' with { type: 'json' };
import lmStudioQwenMapping from './lm-studio-qwen.json' with { type: 'json' };

/**
 * Parameter Mapping Manager
 * Handles loading and applying parameter mappings for different models
 */
export class ParameterMappingManager {
  private static instance: ParameterMappingManager;
  private mappingRegistry: ParameterMappingRegistry = {};

  private constructor() {
    this.loadBuiltinMappings();
  }

  public static getInstance(): ParameterMappingManager {
    if (!ParameterMappingManager.instance) {
      ParameterMappingManager.instance = new ParameterMappingManager();
    }
    return ParameterMappingManager.instance;
  }

  /**
   * Load built-in parameter mappings
   */
  private loadBuiltinMappings(): void {
    // Load AIStudio Proxy mapping
    this.mappingRegistry['aistudio-gemini-2.5-flash'] = aistudioProxyMapping as ModelParameterMapping;
    
    // Load LM Studio Qwen mapping  
    this.mappingRegistry['lmstudio-qwen-qwq-32b'] = lmStudioQwenMapping as ModelParameterMapping;

    console.log(`🔧 Loaded ${Object.keys(this.mappingRegistry).length} parameter mapping configurations`);
  }

  /**
   * Find appropriate mapping for a model and endpoint
   */
  public findMapping(actualModel: string, endpoint?: string): ModelParameterMapping | null {
    // Try exact model match first
    for (const [key, mapping] of Object.entries(this.mappingRegistry)) {
      if (mapping.model === actualModel) {
        // If endpoint pattern is specified, check it matches
        if (mapping.endpointPattern && endpoint) {
          if (endpoint.includes(mapping.endpointPattern) || 
              mapping.endpointPattern.includes(endpoint.split('/')[2])) { // Check domain/port
            console.log(`🎯 Found parameter mapping for model '${actualModel}' with endpoint '${endpoint}': ${key}`);
            return mapping;
          }
        } else {
          console.log(`🎯 Found parameter mapping for model '${actualModel}': ${key}`);
          return mapping;
        }
      }
    }

    // Try endpoint-based matching for known endpoints
    if (endpoint) {
      for (const [key, mapping] of Object.entries(this.mappingRegistry)) {
        if (mapping.endpointPattern && 
            (endpoint.includes(mapping.endpointPattern) || 
             mapping.endpointPattern.includes(endpoint.split('/')[2]))) {
          console.log(`🎯 Found parameter mapping for endpoint '${endpoint}': ${key} (model: ${mapping.model})`);
          return mapping;
        }
      }
    }

    console.log(`ℹ️  No parameter mapping found for model '${actualModel}' with endpoint '${endpoint}'`);
    return null;
  }

  /**
   * Apply parameter mappings to tool arguments
   */
  public applyMapping(
    toolName: string, 
    args: Record<string, unknown>, 
    mapping: ModelParameterMapping
  ): MappingResult {
    const result: MappingResult = {
      mapped: false,
      mappedArgs: { ...args },
      appliedMappings: []
    };

    // Get tool-specific mappings
    const toolMapping = mapping.toolMappings[toolName];
    if (!toolMapping) {
      return result; // No mappings for this tool
    }

    // Apply parameter mappings
    for (const [originalParam, standardParam] of Object.entries(toolMapping)) {
      if (originalParam in args) {
        // Move the value from original parameter name to standard parameter name
        result.mappedArgs[standardParam] = args[originalParam];
        
        // Only delete the original parameter if it's different from the mapped parameter
        if (originalParam !== standardParam) {
          delete result.mappedArgs[originalParam];
        }
        
        result.mapped = true;
        result.appliedMappings.push({
          toolName,
          originalParam,
          mappedParam: standardParam
        });

        console.log(`🔄 Mapped parameter: ${toolName}.${originalParam} → ${standardParam}`);
      }
    }

    return result;
  }

  /**
   * Get all available mappings (for debugging)
   */
  public getAllMappings(): ParameterMappingRegistry {
    return { ...this.mappingRegistry };
  }

  /**
   * Add a new mapping (for dynamic discovery)
   */
  public addMapping(key: string, mapping: ModelParameterMapping): void {
    this.mappingRegistry[key] = mapping;
    console.log(`✅ Added new parameter mapping: ${key}`);
  }
}

// Export singleton instance
export const parameterMappingManager = ParameterMappingManager.getInstance();