# Core Logic

This directory within `@gemini-cli/core/src` contains the fundamental logic that drives the Gemini CLI's interaction with the Gemini model and its overall conversational flow. It encapsulates the core components responsible for managing turns, generating content, scheduling tools, and handling model-related configurations.

## Purpose:

*   **Conversational Flow Management**: Orchestrate the turns of a conversation, including user input, AI responses, and tool executions.
*   **Content Generation**: Interface with the Gemini API to generate textual content based on prompts and context.
*   **Tool Scheduling**: Determine when and how to invoke available tools based on the AI's needs.
*   **Model Configuration**: Manage settings and checks related to the Gemini model.

## Key Contents:

*   `turn.ts`: Defines the structure and logic for individual turns in a conversation.
*   `geminiChat.ts`: Manages the overall chat session with the Gemini model.
*   `contentGenerator.ts`, `openaiCompatibleContentGenerator.ts`: Handle the generation of content from the Gemini model, potentially with compatibility layers.
*   `coreToolScheduler.ts`: Responsible for deciding which tools to run and executing them.
*   `geminiRequest.ts`: Manages requests sent to the Gemini API.
*   `prompts.ts`: Contains definitions and logic for constructing prompts sent to the Gemini model.
*   `modelCheck.ts`: Performs checks related to the Gemini model's capabilities or status.
*   `tokenLimits.ts`: Manages token limits for interactions with the model.
*   `logger.ts`: Provides logging functionalities for core operations.
*   `nonInteractiveToolExecutor.ts`: Executes tools in a non-interactive context.
*   `client.ts`: The main client for interacting with the Gemini API.
*   `__snapshots__/`: Directory for Jest/Vitest snapshots, typically used for testing UI components or large data structures.
*   `*.test.ts`: Unit tests for the core logic components.

This directory is central to the Gemini CLI's intelligence, enabling it to understand user requests, generate relevant responses, and perform actions through its integrated tools.