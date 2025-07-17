/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from 'vitest';
import { SystemPromptCleaner } from './SystemPromptCleaner.js';

describe('SystemPromptCleaner', () => {
  describe('cleanSystemPrompt', () => {
    it('should remove RAG explanation headers and content', () => {
      const systemPrompt = `
# System Instructions

You are an AI assistant.

# 🧠 Context & Analysis
**Analysis Mode**: vector
**Debug Mode**: Enabled
This system uses advanced context analysis with RAG (Retrieval-Augmented Generation) to provide relevant code context and semantic understanding of your project.

**Context Layers (L0-L4)**:
- **L0**: Project structure discovery
- **L1**: Code entity mapping  
- **L2**: Semantic relationships
- **L3**: Contextual patterns
- **L4**: Intelligent inference

The context system will automatically provide relevant information based on your queries and the current project state.

# User Guidelines

Please be specific in your requests.
`;

      const expected = `
# System Instructions

You are an AI assistant.

# User Guidelines

Please be specific in your requests.
`;

      const cleaned = SystemPromptCleaner.cleanSystemPrompt(systemPrompt);
      expect(cleaned).toBe(expected.trim());
    });

    it('should remove Advanced RAG Context Analysis section', () => {
      const systemPrompt = `
# System Instructions

You are an AI assistant.

# 🧠 Advanced RAG Context Analysis
*Generated using LightRAG-inspired semantic analysis*

Here are some relevant documents:
1. Document A
2. Document B

# User Guidelines

Please be specific in your requests.
`;

      const expected = `
# System Instructions

You are an AI assistant.

# User Guidelines

Please be specific in your requests.
`;

      const cleaned = SystemPromptCleaner.cleanSystemPrompt(systemPrompt);
      expect(cleaned).toBe(expected.trim());
    });

    it('should remove File Operations and Shell Commands sections', () => {
      const systemPrompt = `
# System Instructions

You are an AI assistant.

## 📁 File Operations
- Always read files before modifying them to understand the current content
- Use absolute paths for all file operations
- For large files, consider using Content Isolation format
- Verify file existence before attempting operations

## 💻 Shell Commands
- Always explain what a command will do before executing it
- Use safe commands that don't modify system state without permission
- Prefer built-in tools over shell commands when possible
- Be cautious with commands that can affect system stability

# User Guidelines

Please be specific in your requests.
`;

      const expected = `
# System Instructions

You are an AI assistant.

# User Guidelines

Please be specific in your requests.
`;

      const cleaned = SystemPromptCleaner.cleanSystemPrompt(systemPrompt);
      expect(cleaned).toBe(expected.trim());
    });

    it('should handle multiple RAG sections and clean up newlines', () => {
      const systemPrompt = `
# System Instructions

You are an AI assistant.

# 🧠 Context & Analysis
**Analysis Mode**: vector
**Debug Mode**: Enabled
This system uses advanced context analysis with RAG.

---

# 🧠 Advanced RAG Context Analysis
*Generated using LightRAG-inspired semantic analysis*

Here are some relevant documents.

---

# User Guidelines

Please be specific in your requests.
`;

      const expected = `
# System Instructions

You are an AI assistant.

# User Guidelines

Please be specific in your requests.
`;

      const cleaned = SystemPromptCleaner.cleanSystemPrompt(systemPrompt);
      expect(cleaned).toBe(expected.trim());
    });
  });

  describe('cleanRagExplanations', () => {
    it('should clean RAG explanations from any text', () => {
      const text = `
Here's some information about your project:

# 🧠 Context & Analysis
**Analysis Mode**: vector
**Debug Mode**: Enabled
This system uses advanced context analysis with RAG.

The file you're looking for is in the src directory.
`;

      const expected = `
Here's some information about your project:

The file you're looking for is in the src directory.
`;

      const cleaned = SystemPromptCleaner.cleanRagExplanations(text);
      expect(cleaned).toBe(expected.trim());
    });
  });
});