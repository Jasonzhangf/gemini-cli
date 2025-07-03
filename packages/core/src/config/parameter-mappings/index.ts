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
import {
  isComplexTool,
  isSequentialThinkingTool,
} from '../../tools/tool-registry.js';

// Import mapping configurations
import aistudioProxyMapping from './aistudio-proxy.json' with { type: 'json' };
import lmStudioQwenMapping from './lm-studio-qwen.json' with { type: 'json' };

// New, more flexible structure for mappings
export interface ParameterMapping {
  name: string;
  models: string[];
  endpoints?: string[];
  mappings: {
    [toolName: string]: {
      [sourceParam: string]: string;
    };
  };
}

/**
 * @deprecated The old mapping structure. Will be removed in a future version.
 */
interface LegacyMapping {
  model: string;
  provider: string;
  endpointPattern?: string;
  toolMappings: {
    [toolName: string]: {
      [sourceParam: string]: string;
    };
  };
}

/**
 * Parameter Mapping Manager
 * Handles loading and applying parameter mappings for different models
 */
export class ParameterMappingManager {
  private mappings: ParameterMapping[] = [];

  constructor() {
    this.loadMappings();
  }

  private loadMappings() {
    // Manually import and process mappings
    const allConfigs: unknown[] = [aistudioProxyMapping, lmStudioQwenMapping];
    
    for (const config of allConfigs) {
      // Check if it's the new format
      if (typeof config === 'object' && config && 'models' in config && 'mappings' in config) {
        this.mappings.push(config as ParameterMapping);
      } 
      // Assume it's the old format and convert it
      else if (typeof config === 'object' && config &&'model' in config && 'toolMappings' in config) {
        const legacy = config as LegacyMapping;
        const converted: ParameterMapping = {
          name: `${legacy.provider} (legacy)`,
          models: [legacy.model],
          endpoints: legacy.endpointPattern ? [legacy.endpointPattern] : undefined,
          mappings: legacy.toolMappings,
        };
        this.mappings.push(converted);
      }
    }
    console.log(`🔧 Loaded ${this.mappings.length} parameter mapping configurations`);
  }

  /**
   * Find a parameter mapping configuration that matches the given model and endpoint.
   * A mapping is considered a match if the model name matches one of the regex
   * patterns in `models` and, if specified, the endpoint matches one of the regex 
   * patterns in `endpoints`.
   */
  public findMapping(model: string, endpoint?: string): ParameterMapping | null {
    for (const mapping of this.mappings) {
      const modelMatch = mapping.models.some(pattern => new RegExp(pattern).test(model));
      
      // If endpoint patterns are not defined, we only need to match the model
      if (modelMatch && !mapping.endpoints) {
        console.log(`🎯 Found parameter mapping for model '${model}': ${mapping.name}`);
        return mapping;
      }

      // If endpoint patterns are defined, we need to match both
      if (modelMatch && mapping.endpoints) {
        const endpointMatch = mapping.endpoints.some(pattern => new RegExp(pattern).test(endpoint || ''));
        if (endpointMatch) {
          console.log(`🎯 Found parameter mapping for model '${model}' and endpoint '${endpoint}': ${mapping.name}`);
          return mapping;
        }
      }
    }
    console.log(`ℹ️  No parameter mapping found for model '${model}' with endpoint '${endpoint}'`);
    return null;
  }

  /**
   * Applies the parameter mapping to the given arguments for a specific tool.
   * @returns The mapped arguments and a boolean indicating if any mapping was applied.
   */
  public applyMapping(
    toolName: string,
    args: any,
    mapping: ParameterMapping
  ): { mappedArgs: any; mapped: boolean, appliedMappings: string[] } {
    const toolMappings = mapping.mappings[toolName];
    if (!toolMappings) {
      return { mappedArgs: args, mapped: false, appliedMappings: [] };
    }

    let mapped = false;
    const appliedMappings: string[] = [];
    const mappedArgs = { ...args };
    
    // In complex tools, the arguments are nested inside a 'data' property.
    const argsToProcess = isComplexTool(toolName) ? mappedArgs.data || {} : mappedArgs;

    for (const [sourceParam, targetParam] of Object.entries(toolMappings)) {
      if (sourceParam in argsToProcess) {
        const value = argsToProcess[sourceParam];
        delete argsToProcess[sourceParam];
        argsToProcess[targetParam] = value;
        mapped = true;
        appliedMappings.push(`${sourceParam} → ${targetParam}`);
      }
    }
    
    // For sequential thinking tool, ensure 'thought' is not empty
    if(isSequentialThinkingTool(toolName) && !argsToProcess.thought) {
      argsToProcess.thought = "Thinking...";
    }

    // If it was a complex tool, put the processed args back into 'data'
    if (isComplexTool(toolName)) {
        mappedArgs.data = argsToProcess;
    }

    return { mappedArgs, mapped, appliedMappings };
  }
}

export const parameterMappingManager = new ParameterMappingManager();