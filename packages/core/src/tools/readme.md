# Core Tools

This directory within `@gemini-cli/core/src` contains the implementations of all the tools that the Gemini model can invoke to interact with the user's environment. Each file typically represents a single tool or a set of related tool functionalities, providing the concrete logic for operations like file system manipulation, shell command execution, web fetching, and more.

## Purpose:

*   **Tool Definitions**: Define the actual functions and logic that correspond to the tools exposed to the Gemini model.
*   **Abstraction Layer**: Provide a clean interface between the AI's requests and the underlying system operations.
*   **Extensibility**: Allow for easy addition of new tools by following established patterns.

## Key Contents:

*   `read-file.ts`, `write-file.ts`, `glob.ts`, `grep.ts`, `ls.ts`, `edit.ts`, `read-many-files.ts`: Implementations for various file system and content search/manipulation tools.
*   `shell.ts`: Implementation for executing shell commands (`run_shell_command`).
*   `web-fetch.ts`: Implementation for fetching content from URLs (`web_fetch`).
*   `web-search.ts`: Implementation for performing web searches (`google_web_search`).
*   `memoryTool.ts`: Implementation for the `save_memory` tool.
*   `tool-registry.ts`: Manages the registration and discovery of all available tools.
*   `tools.ts`: Likely an aggregation or export file for all tools.
*   `mcp-tool.ts`, `mcp-client.ts`: Related to the Model Context Protocol (MCP) for server interactions.
*   `modifiable-tool.ts`: A base or utility for tools that can be modified.
*   `diffOptions.ts`: Options related to diffing operations, likely used by editing tools.
*   `*.test.ts`: Unit tests for individual tool implementations.

Each tool is designed to be self-contained and perform a specific, well-defined action, enabling the Gemini model to interact with the user's system in a structured and controlled manner.