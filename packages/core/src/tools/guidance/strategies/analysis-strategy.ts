/**
 * @license
 * Copyright 2025 Jason Zhang
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptBuilder } from '../prompt-builder.js';

/**
 * 细菌式编程：分析策略操纵子
 * 小巧：仅负责分析工作流引导
 * 模块化：独立的分析策略单元
 * 自包含：完整的分析引导功能
 */
export class AnalysisStrategy {
  static buildPrompt(): string {
    return PromptBuilder.create()
      .addToolCallFormat()
      .addCustomSection('Analysis Guidelines', this.getAnalysisGuidelines())
      .addCustomSection('Data Collection Methods', this.getDataCollectionMethods())
      .addCustomSection('Reporting Standards', this.getReportingStandards())
      .build();
  }

  private static getAnalysisGuidelines(): string {
    return `
**Systematic Approach:**
- Start with high-level overview before diving into details
- Collect quantitative data to support findings
- Cross-reference multiple sources for accuracy
- Document assumptions and limitations

**Investigation Process:**
1. Define scope and objectives clearly
2. Gather relevant data systematically
3. Analyze patterns and relationships
4. Draw evidence-based conclusions
5. Present findings in clear, actionable format

**Tools for Analysis:**
- \`[tool_call: glob for pattern '**/*']\` - Discover all files
- \`[tool_call: ls for path '/project/root']\` - List directory contents
- \`[tool_call: grep for pattern 'TODO|FIXME|BUG']\` - Find issues
- \`[tool_call: run_shell_command for 'wc -l **/*.js']\` - Count lines of code
`;
  }

  private static getDataCollectionMethods(): string {
    return `
**File System Analysis:**
- Directory structure and organization
- File types and distribution
- File sizes and modification dates
- Naming conventions and patterns

**Code Analysis:**
- Language and framework usage
- Code complexity and quality metrics
- Dependency relationships
- Test coverage and quality

**Configuration Analysis:**
- Build system configuration
- Environment settings
- External dependencies
- Deployment configuration

**Documentation Analysis:**
- README files and project documentation
- Code comments and inline documentation
- API documentation
- Change logs and version history
`;
  }

  private static getReportingStandards(): string {
    return `
**Report Structure:**
1. **Executive Summary** - Key findings and recommendations
2. **Methodology** - How the analysis was conducted
3. **Findings** - Detailed results with supporting data
4. **Recommendations** - Actionable next steps
5. **Appendix** - Raw data and detailed metrics

**Data Presentation:**
- Use tables for structured data
- Include file paths and line numbers for references
- Provide concrete examples to illustrate points
- Quantify findings with numbers and percentages

**Quality Standards:**
- Verify all claims with evidence
- Include source information for all data
- Use consistent formatting and terminology
- Provide context for technical findings
`;
  }

  static getAnalysisTemplates(): Record<string, string[]> {
    return {
      'project-analysis': [
        'Analyze project structure and organization',
        'Examine dependencies and technologies',
        'Review documentation and configuration',
        'Identify patterns and conventions',
        'Generate comprehensive report'
      ],
      'code-quality': [
        'Scan for code quality issues',
        'Analyze test coverage',
        'Check for security vulnerabilities',
        'Review documentation quality',
        'Provide improvement recommendations'
      ],
      'dependency-analysis': [
        'Map external dependencies',
        'Identify version conflicts',
        'Check for security vulnerabilities',
        'Analyze update requirements',
        'Recommend optimization strategies'
      ]
    };
  }
}