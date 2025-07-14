### `gemini-cli` 上下文理解与语义分析能力增强行动计划

**总体目标：** 全面重构并提升 `gemini-cli` 的上下文感知与处理能力。我们将通过优化现有的上下文注入流程、集成先进的大语言模型进行语义分析，并构建一个可插拔的高性能向量检索引擎，最终实现对用户意图的精准理解和高效响应。

---

#### **第一阶段：基础架构固化与响应流净化**

本阶段旨在清理现有架构中的临时性修改，并为后续的功能增强打下坚实基础。

*   **任务 1.1：永久化 `ContextAgent` 的核心配置**
    *   **目标：** 将当前对 L0/L1 缓存的强制开启和 Token 预算的取消，确定为标准行为。
    *   **行动：**
        1.  进入 `packages/core/src/context/contextAgent.ts` 文件。
        2.  在 `getContextForPrompt` 方法中，移除表明其为临时修改的注释（如 `MODIFIED`, `FORCE ENABLED`）。
        3.  将该行为固化为默认逻辑，并添加新的注释，清晰地说明：“为确保功能完整性和最佳上下文分析效果，L0/L1 缓存默认开启，且不设 Token 限制。”

*   **任务 1.2：实现模型思维过程的自动过滤**
    *   **目标：** 在模型响应被下游模块（尤其是 `ContextAgent`）处理前，完全剥离其内部思考过程（`<think>...</think>` 标签）。
    *   **行动：**
        1.  定位处理模型最终响应的核心函数（预计在 `packages/core/src/core/client.ts` 或相关模块中）。
        2.  在接收到模型的完整或流式输出后，立即使用正则表达式 `/<think>[\s\S]*?<\/think>/g` 对其进行清洗。
        3.  确保只有纯净的用户导向内容被传递到系统的其他部分。

---

#### **第二阶段：集成大模型实现高级语义分析**

本阶段的核心是引入 `gemini-1.5-flash` 的强大能力，以替代原有的静态分析，实现对用户输入和模型输出的深度语义理解。

*   **任务 2.1：构建 `SemanticAnalysisService` 服务**
    *   **目标：** 封装与外部 Gemini 模型交互的逻辑，遵循模块化设计原则。
    *   **行动：**
        1.  创建新文件 `packages/core/src/analysis/semanticAnalysisService.ts`。
        2.  在此文件中定义 `SemanticAnalysisService` 类，并设计一个核心公共方法 `analyze(text: string): Promise<AnalysisResult>`，其中 `AnalysisResult` 是一个明确的 `type` 或 `interface`。

*   **任务 2.2：实现基于子进程的 Gemini 命令调用**
    *   **目标：** 在 `SemanticAnalysisService` 内部，安全、可靠地执行 `gemini -p` 命令。
    *   **行动：**
        1.  使用 Node.js 的 `child_process.exec` 或 `spawn` 模块。
        2.  在 `analyze` 方法中，构造命令，例如：`gemini -p "请识别以下文本中的核心实体、意图和关键概念: ${text}"`。
        3.  实现对子进程的 `stdout`（标准输出）的捕获和 `stderr`（错误输出）的处理，确保调用的健壮性。
        4.  将命令返回的 JSON 字符串解析为 `AnalysisResult` 类型的结构化数据。

*   **任务 2.3：将新服务集成到 `ContextAgent`**
    *   **目标：** 让 `ContextAgent` 在需要时可以使用新的语义分析能力。
    *   **行动：**
        1.  在 `ContextAgent` 的 `getContextForPrompt` 方法中，导入并实例化 `SemanticAnalysisService`。
        2.  在需要进行语义分析的逻辑分支（例如，处理用户新输入时），调用 `semanticAnalysisService.analyze(userInput)`。

*   **任务 2.4：添加配置开关以实现动态切换**
    *   **目标：** 保证系统的灵活性，允许在不同分析模式间切换。
    *   **行动：**
        1.  在 `packages/core/src/config/config.ts` 的 `Config` 类中，添加一个配置项，例如：`analysis: { mode: 'llm' | 'vector' | 'static' }`，默认值为 `'static'`。
        2.  修改 `ContextAgent` 的逻辑，使其根据此配置项的值，来决定是调用 `SemanticAnalysisService` (`llm` 模式)，还是执行后续将要开发的向量搜索 (`vector` 模式) 或保留旧的静态分析 (`static` 模式)。

---

#### **第三阶段：构建基于向量嵌入的高性能语义搜索**

本阶段将实现业界领先的向量搜索方案，为 `gemini-cli` 提供一个速度更快、资源消耗更低的语义理解选项。

*   **子阶段 3.A：知识图谱的离线索引构建**
    *   **任务 3.A.1：** 在 `package.json` 中添加 `@xenova/transformers` (一个功能强大的 JS 库，内置了多种嵌入模型) 和 `faiss-node` (或更易于安装的 `hnswlib-node`) 依赖，并执行 `npm install`。
    *   **任务 3.A.2：** 创建一个独立的命令行脚本 `scripts/build-knowledge-index.ts`。
    *   **任务 3.A.3：** 在该脚本中，使用 `glob` 遍历项目代码，并利用 AST 解析器（如 `@babel/parser`）精确提取所有函数、类、接口及其相关注释，形成“知识节点”。
    *   **任务 3.A.4：** 加载轻量级嵌入模型 (如 `all-MiniLM-L6-v2`)，将每个“知识节点”的文本描述转换为向量，并使用 FAISS 或 HNSWlib 将所有向量构建成一个索引，最终将索引文件保存到 `.gemini/knowledge.index`。

*   **子阶段 3.B：在线查询服务的实现与集成**
    *   **任务 3.B.1：** 创建 `packages/core/src/analysis/vectorSearchService.ts` 文件，定义 `VectorSearchService` 类。该类在初始化时将加载 `.gemini/knowledge.index` 索引文件和嵌入模型。
    *   **任务 3.B.2：** 实现 `search(query: string, topK: number): Promise<SearchResult[]>` 方法。该方法接收用户查询，将其向量化，并在加载的索引中执行高效的 k-近邻搜索。
    *   **任务 3.B.3：** 将 `VectorSearchService` 集成到 `ContextAgent` 中，当 `config.analysis.mode` 设置为 `'vector'` 时，调用此服务来替代大模型分析。
