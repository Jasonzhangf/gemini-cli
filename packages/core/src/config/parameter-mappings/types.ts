/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parameter mapping for a specific tool
 * Maps third-party parameter names to our standard parameter names
 */
export interface ToolParameterMapping {
  [thirdPartyParamName: string]: string; // maps to standardParamName
}

/**
 * Complete parameter mapping configuration for a model
 */
export interface ModelParameterMapping {
  /** Model identifier (actual model name) */
  model: string;

  /** Provider/endpoint identifier */
  provider: string;

  /** API endpoint pattern for matching */
  endpointPattern?: string;

  /** Human readable description */
  description?: string;

  /** When this mapping was last verified */
  lastVerified?: string;

  /** Mapping rules for each tool */
  toolMappings: {
    [toolName: string]: ToolParameterMapping;
  };
}

/**
 * Registry of all parameter mappings
 */
export interface ParameterMappingRegistry {
  [modelKey: string]: ModelParameterMapping;
}

/**
 * Result of applying parameter mapping to tool arguments
 */
export interface MappingResult {
  /** Whether any mappings were applied */
  mapped: boolean;

  /** The transformed arguments */
  mappedArgs: Record<string, unknown>;

  /** List of mappings that were applied */
  appliedMappings: Array<{
    toolName: string;
    originalParam: string;
    mappedParam: string;
  }>;
}
