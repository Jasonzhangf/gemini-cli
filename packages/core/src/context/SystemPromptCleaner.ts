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

/**
 * SystemPromptCleaner class
 * Removes RAG explanations and other unnecessary content from system prompts
 */
export class SystemPromptCleaner {
  /**
   * Clean system prompt by removing RAG explanations
   * @param systemPrompt Original system prompt
   * @returns Cleaned system prompt
   */
  public static cleanSystemPrompt(systemPrompt: string): string {
    // Remove RAG explanation headers and content
    let cleanedPrompt = systemPrompt;
    
    // Remove Context & Analysis section
    cleanedPrompt = cleanedPrompt.replace(/# 🧠 Context & Analysis[\s\S]*?(?=\n#|\n---|\n\n|$)/g, '');
    
    // Remove Advanced RAG Context Analysis section
    cleanedPrompt = cleanedPrompt.replace(/# 🧠 Advanced RAG Context Analysis[\s\S]*?(?=\n#|\n---|\n\n|$)/g, '');
    
    // Remove Generated using LightRAG text
    cleanedPrompt = cleanedPrompt.replace(/\*Generated using LightRAG-inspired semantic analysis\*/g, '');
    
    // Remove Context Layers explanation
    cleanedPrompt = cleanedPrompt.replace(/\*\*Context Layers \(L0-L4\)\*\*:[\s\S]*?(?=\n#|\n---|\n\n|$)/g, '');
    
    // Remove Analysis Mode and Debug Mode lines
    cleanedPrompt = cleanedPrompt.replace(/\*\*Analysis Mode\*\*:.*\n/g, '');
    cleanedPrompt = cleanedPrompt.replace(/\*\*Debug Mode\*\*:.*\n/g, '');
    
    // Remove explanation about RAG system
    cleanedPrompt = cleanedPrompt.replace(/This system uses advanced context analysis with RAG[\s\S]*?(?=\n#|\n---|\n\n|$)/g, '');
    
    // Remove File Operations section
    cleanedPrompt = cleanedPrompt.replace(/## 📁 File Operations[\s\S]*?(?=\n#|\n---|\n\n|$)/g, '');
    
    // Remove Shell Commands section
    cleanedPrompt = cleanedPrompt.replace(/## 💻 Shell Commands[\s\S]*?(?=\n#|\n---|\n\n|$)/g, '');
    
    // Clean up multiple newlines
    cleanedPrompt = cleanedPrompt.replace(/\n{3,}/g, '\n\n');
    
    // Remove any remaining --- markers
    cleanedPrompt = cleanedPrompt.replace(/---\n/g, '');
    
    return cleanedPrompt.trim();
  }
  
  /**
   * Clean all RAG explanations from any text
   * @param text Text to clean
   * @returns Cleaned text
   */
  public static cleanRagExplanations(text: string): string {
    // Apply the same cleaning as for system prompts
    return this.cleanSystemPrompt(text);
  }
}