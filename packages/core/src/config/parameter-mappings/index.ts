/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  ModelParameterMapping,
  ParameterMappingRegistry,
  MappingResult,
  ToolParameterMapping,
} from './types.js';
// Temporarily disable these imports to fix build
// import {
//   isComplexTool,
//   isSequentialThinkingTool,
// } from '../../tools/tool-registry.js';

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
      if (
        typeof config === 'object' &&
        config &&
        'models' in config &&
        'mappings' in config
      ) {
        this.mappings.push(config as ParameterMapping);
      }
      // Assume it's the old format and convert it
      else if (
        typeof config === 'object' &&
        config &&
        'model' in config &&
        'toolMappings' in config
      ) {
        const legacy = config as LegacyMapping;
        const converted: ParameterMapping = {
          name: `${legacy.provider} (legacy)`,
          models: [legacy.model],
          endpoints: legacy.endpointPattern
            ? [legacy.endpointPattern]
            : undefined,
          mappings: legacy.toolMappings,
        };
        this.mappings.push(converted);
      }
    }
    console.log(
      `🔧 Loaded ${this.mappings.length} parameter mapping configurations`,
    );
  }

  /**
   * Find a parameter mapping configuration that matches the given model and endpoint.
   * A mapping is considered a match if the model name matches one of the regex
   * patterns in `models` and, if specified, the endpoint matches one of the regex
   * patterns in `endpoints`.
   */
  findMapping(model: string, endpoint?: string): ParameterMapping | null {
    for (const mapping of this.mappings) {
      const modelMatch = mapping.models.some((pattern) =>
        new RegExp(pattern).test(model),
      );

      // If endpoint patterns are not defined, we only need to match the model
      if (modelMatch && !mapping.endpoints) {
        console.log(
          `🎯 Found parameter mapping for model '${model}': ${mapping.name}`,
        );
        return mapping;
      }

      // If endpoint patterns are defined, we need to match both
      if (modelMatch && mapping.endpoints) {
        const endpointMatch = mapping.endpoints.some((pattern) =>
          new RegExp(pattern).test(endpoint || ''),
        );
        if (endpointMatch) {
          console.log(
            `🎯 Found parameter mapping for model '${model}' and endpoint '${endpoint}': ${mapping.name}`,
          );
          return mapping;
        }
      }
    }
    console.log(
      `ℹ️  No parameter mapping found for model '${model}' with endpoint '${endpoint}'`,
    );
    return null;
  }

  /**
   * Applies the parameter mapping to the given arguments for a specific tool.
   * @returns The mapped arguments and a boolean indicating if any mapping was applied.
   */
  applyMapping(
    toolName: string,
    args: Record<string, unknown>,
    mapping: ParameterMapping,
  ): {
    mappedArgs: Record<string, unknown>;
    mapped: boolean;
    appliedMappings: string[];
  } {
    const toolMappings = mapping.mappings[toolName];
    if (!toolMappings) {
      return { mappedArgs: args, mapped: false, appliedMappings: [] };
    }

    let mapped = false;
    const appliedMappings: string[] = [];
    const mappedArgs = { ...args };

    // In complex tools, the arguments are nested inside a 'data' property.
    // Temporarily simplified logic
    const argsToProcess =
      (mappedArgs.data as Record<string, unknown>) || mappedArgs;

    for (const [sourceParam, targetParam] of Object.entries(toolMappings)) {
      if (sourceParam in argsToProcess) {
        let value = argsToProcess[sourceParam];

        // Special handling for file paths - convert relative to absolute
        if (
          this.isFilePathParameter(targetParam) &&
          typeof value === 'string'
        ) {
          value = this.ensureAbsolutePath(value);
          console.log(
            `🔧 [PathMapping] Converted '${argsToProcess[sourceParam]}' → '${value}'`,
          );
        }

        delete argsToProcess[sourceParam];
        argsToProcess[targetParam] = value;
        mapped = true;
        appliedMappings.push(`${sourceParam} → ${targetParam}`);
      }
    }

    // For sequential thinking tool, ensure 'thought' is not empty
    // Temporarily disabled complex tool type checking
    // if(isSequentialThinkingTool(toolName) && !argsToProcess.thought) {
    //   argsToProcess.thought = "Thinking...";
    // }

    // If it was a complex tool, put the processed args back into 'data'
    // Temporarily simplified logic
    if (mappedArgs.data && argsToProcess !== mappedArgs) {
      mappedArgs.data = argsToProcess;
    }

    return { mappedArgs, mapped, appliedMappings };
  }

  /**
   * Check if a parameter is a file path parameter that needs absolute path conversion
   */
  private isFilePathParameter(paramName: string): boolean {
    const filePathParams = [
      'file_path',
      'path',
      'absolute_path',
      'directory_path',
    ];
    return filePathParams.includes(paramName);
  }

  /**
   * Convert relative path to absolute path
   */
  private ensureAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Convert relative path to absolute based on current working directory
    const absolutePath = path.resolve(process.cwd(), filePath);
    return absolutePath;
  }
}

export const parameterMappingManager = new ParameterMappingManager();
