/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  ITaskPlanner, 
  TaskPlan, 
  TaskStep, 
  TaskExecutionContext, 
  SequentialThinkingResponse 
} from './taskPlanner.js';

/**
 * Implementation of task planner for managing complex multi-step tasks
 */
export class TaskPlannerImpl implements ITaskPlanner {
  private executionContext: TaskExecutionContext = {
    currentPlan: null,
    isWaitingForPlanning: false,
    isExecutingStep: false,
  };

  /**
   * Check if a user request requires task planning
   */
  requiresTaskPlanning(request: string): boolean {
    // Keywords that indicate complex multi-step tasks
    const complexTaskKeywords = [
      '整理', '遍历', '分析', '移动', '批量', '所有', '每个',
      'organize', 'traverse', 'analyze', 'move', 'batch', 'all', 'each',
      '先.*然后', '首先.*接着', '第一.*第二',
      'first.*then', 'step by step', 'one by one'
    ];

    // Tool combination patterns that suggest multi-step workflow
    const multiToolPatterns = [
      '查找.*移动', '读取.*分析.*移动', '遍历.*筛选.*整理',
      'find.*move', 'read.*analyze.*move', 'scan.*filter.*organize'
    ];

    const lowerRequest = request.toLowerCase();
    
    // Check for complex task keywords
    const hasComplexKeywords = complexTaskKeywords.some(keyword => 
      new RegExp(keyword, 'i').test(lowerRequest)
    );
    
    // Check for multi-tool patterns
    const hasMultiToolPattern = multiToolPatterns.some(pattern =>
      new RegExp(pattern, 'i').test(lowerRequest)
    );
    
    // Check for step indicators
    const hasStepIndicators = /(\d+[.\s])|步骤|step|阶段|phase|first|then|next|finally/i.test(lowerRequest);
    
    const requiresPlanning = hasComplexKeywords || hasMultiToolPattern || hasStepIndicators;
    
    if (requiresPlanning) {
      console.log('🧠 Request requires task planning:', {
        complexKeywords: hasComplexKeywords,
        multiToolPattern: hasMultiToolPattern, 
        stepIndicators: hasStepIndicators
      });
    }
    
    return requiresPlanning;
  }

  /**
   * Request model to create a task plan using sequential thinking
   */
  async requestTaskPlanning(request: string): Promise<string> {
    this.executionContext.isWaitingForPlanning = true;
    this.executionContext.currentPlan = null;
    
    console.log('🧠 Requesting task planning for:', request.slice(0, 100) + '...');
    
    const planningPrompt = `
请使用sequential thinking工具来分析这个复杂任务并制定详细的执行计划：

**用户请求**: ${request}

**要求**:
1. 使用sequentialthinking工具进行思考和规划
2. 分解成具体的、可执行的步骤
3. 每个步骤明确需要使用的工具
4. 考虑步骤之间的依赖关系
5. 预估每个步骤的结果

请开始你的思考过程。

IMPORTANT: 请使用sequentialthinking工具来分析和规划这个任务。
`;

    return planningPrompt;
  }

  /**
   * Parse sequential thinking responses to build task plan
   */
  parseSequentialThinking(response: SequentialThinkingResponse): TaskPlan | null {
    try {
      console.log('🧠 Parsing sequential thinking response:', {
        thought: response.thought?.slice(0, 100) + '...',
        thoughtNumber: response.thoughtNumber,
        totalThoughts: response.totalThoughts,
        nextThoughtNeeded: response.nextThoughtNeeded
      });

      // If this is not the final thought, continue planning
      if (response.nextThoughtNeeded) {
        console.log('🧠 Planning in progress, waiting for more thoughts...');
        return null;
      }

      // Parse the final thought to extract task plan
      const thought = response.thought;
      const plan = this.extractTaskPlanFromThought(thought);
      
      if (plan) {
        this.executionContext.currentPlan = plan;
        this.executionContext.isWaitingForPlanning = false;
        console.log('✅ Task plan created:', {
          id: plan.id,
          totalSteps: plan.totalSteps,
          steps: plan.steps.map(s => ({ step: s.stepNumber, desc: s.description.slice(0, 50) + '...' }))
        });
      }
      
      return plan;
    } catch (error) {
      console.error('❌ Failed to parse sequential thinking response:', error);
      return null;
    }
  }

  /**
   * Extract structured task plan from sequential thinking output
   */
  private extractTaskPlanFromThought(thought: string): TaskPlan | null {
    try {
      // Look for step patterns in the thought
      const stepPatterns = [
        /第?(\d+)[步.、：]\s*([^第\n]*?)(?=第?\d+[步.、：]|$)/g,
        /步骤\s*(\d+)[.、：]\s*([^步骤\n]*?)(?=步骤\s*\d+|$)/g,
        /(\d+)[.、]\s*([^0-9\n]*?)(?=\d+[.、]|$)/g
      ];

      const steps: TaskStep[] = [];
      let stepNumber = 1;

      for (const pattern of stepPatterns) {
        let match;
        while ((match = pattern.exec(thought)) !== null) {
          const description = match[2]?.trim();
          if (description && description.length > 5) {
            const expectedTools = this.extractToolsFromDescription(description);
            
            steps.push({
              stepNumber: parseInt(match[1]) || stepNumber++,
              description: description,
              toolCalls: [],
              expectedTools: expectedTools,
              completed: false
            });
          }
        }
        
        if (steps.length > 0) break; // Found steps with this pattern
      }

      // Fallback: if no structured steps found, create single step
      if (steps.length === 0) {
        const expectedTools = this.extractToolsFromDescription(thought);
        steps.push({
          stepNumber: 1,
          description: thought.slice(0, 200) + '...',
          toolCalls: [],
          expectedTools: expectedTools,
          completed: false
        });
      }

      // Sort steps by number and renumber sequentially
      steps.sort((a, b) => a.stepNumber - b.stepNumber);
      steps.forEach((step, index) => {
        step.stepNumber = index + 1;
      });

      const planId = `plan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      
      return {
        id: planId,
        originalRequest: this.executionContext.lastResponse || '',
        totalSteps: steps.length,
        currentStep: 1,
        steps: steps,
        completed: false,
        startTime: Date.now(),
        status: 'executing'
      };
    } catch (error) {
      console.error('❌ Failed to extract task plan from thought:', error);
      return null;
    }
  }

  /**
   * Extract likely tools from step description
   */
  private extractToolsFromDescription(description: string): string[] {
    const toolKeywords = {
      'glob': ['查找', '搜索文件', '匹配', '遍历', 'find', 'search', 'match'],
      'read_file': ['读取', '查看', '打开', '读', 'read', 'view', 'open'],
      'write_file': ['写入', '创建', '保存', '生成', 'write', 'create', 'save'],
      'list_directory': ['列出', '列表', '目录', 'list', 'directory', 'ls'],
      'run_shell_command': ['执行', '运行', '命令', '移动', '复制', 'execute', 'run', 'move', 'copy', 'mkdir'],
      'replace': ['编辑', '修改', '替换', 'edit', 'modify', 'replace'],
      'search_file_content': ['搜索内容', '查找内容', 'grep', 'search content']
    };

    const tools: string[] = [];
    const lowerDesc = description.toLowerCase();

    for (const [tool, keywords] of Object.entries(toolKeywords)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword.toLowerCase()))) {
        tools.push(tool);
      }
    }

    return [...new Set(tools)]; // Remove duplicates
  }

  /**
   * Get current task execution context
   */
  getExecutionContext(): TaskExecutionContext {
    return { ...this.executionContext };
  }

  /**
   * Execute the next step in current plan
   */
  async executeNextStep(): Promise<string> {
    const plan = this.executionContext.currentPlan;
    if (!plan || plan.completed || plan.currentStep > plan.totalSteps) {
      return '';
    }

    this.executionContext.isExecutingStep = true;
    const currentStep = plan.steps[plan.currentStep - 1];
    
    console.log(`🚀 Executing step ${plan.currentStep}/${plan.totalSteps}:`, {
      description: currentStep.description,
      expectedTools: currentStep.expectedTools
    });

    // Generate step execution prompt
    const stepPrompt = `
继续执行任务计划的第${plan.currentStep}步：

**当前步骤**: ${currentStep.description}

**预期使用的工具**: ${currentStep.expectedTools.join(', ')}

**整体进度**: ${plan.currentStep}/${plan.totalSteps}

请执行这一步骤。使用JSON格式返回具体的工具调用。

IMPORTANT: 只执行当前这一步，不要尝试执行后续步骤。
`;

    return stepPrompt;
  }

  /**
   * Mark current step as completed
   */
  completeCurrentStep(result: string): void {
    const plan = this.executionContext.currentPlan;
    if (!plan) return;

    const currentStep = plan.steps[plan.currentStep - 1];
    if (currentStep) {
      currentStep.completed = true;
      currentStep.result = result;
      console.log(`✅ Step ${plan.currentStep} completed:`, result.slice(0, 100) + '...');
    }

    plan.currentStep++;
    this.executionContext.isExecutingStep = false;

    // Check if all steps completed
    if (plan.currentStep > plan.totalSteps) {
      plan.completed = true;
      plan.status = 'completed';
      plan.endTime = Date.now();
      console.log('🎉 All steps completed! Task finished.');
    }
  }

  /**
   * Mark current step as failed
   */
  failCurrentStep(error: string): void {
    const plan = this.executionContext.currentPlan;
    if (!plan) return;

    const currentStep = plan.steps[plan.currentStep - 1];
    if (currentStep) {
      currentStep.error = error;
      console.log(`❌ Step ${plan.currentStep} failed:`, error);
    }

    plan.status = 'failed';
    this.executionContext.isExecutingStep = false;
  }

  /**
   * Check if should continue execution
   */
  shouldContinueExecution(): boolean {
    const plan = this.executionContext.currentPlan;
    return !!(plan && 
             !plan.completed && 
             plan.status === 'executing' && 
             plan.currentStep <= plan.totalSteps);
  }

  /**
   * Get progress summary
   */
  getProgressSummary(): string {
    const plan = this.executionContext.currentPlan;
    if (!plan) return '';

    const completedSteps = plan.steps.filter(s => s.completed).length;
    const totalSteps = plan.totalSteps;
    
    return `进度: ${completedSteps}/${totalSteps} 步骤已完成 (${Math.round(completedSteps/totalSteps*100)}%)`;
  }

  /**
   * Reset current plan
   */
  resetPlan(): void {
    this.executionContext.currentPlan = null;
    this.executionContext.isWaitingForPlanning = false;
    this.executionContext.isExecutingStep = false;
    console.log('🔄 Task plan reset');
  }
}