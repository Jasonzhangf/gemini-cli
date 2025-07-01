# `@gemini-cli/core/src`

This directory contains the primary source code for the `@gemini-cli/core` package. It is the heart of the Gemini CLI, housing all the fundamental logic, services, tools, and configurations that enable interaction with the Gemini model and execution of various software engineering tasks.

## Purpose:

*   **Centralized Logic**: Consolidate all core functionalities in one place for maintainability and reusability.
*   **Modular Organization**: Structure the codebase into logical subdirectories based on concerns (e.g., `core`, `tools`, `services`).
*   **API Implementation**: Provide the concrete implementations for the public APIs exposed by the `@gemini-cli/core` package.

## Key Contents:

*   `core/`: Contains the core conversational logic, Gemini API interaction, content generation, and tool scheduling mechanisms.
*   `tools/`: Houses the implementations of all available tools that the Gemini model can invoke, such as file system operations, shell command execution, and web interactions.
*   `services/`: Includes services that interact with external systems or provide specific functionalities, like Git operations or file discovery.
*   `config/`: Defines core configuration settings and models for the package.
*   `telemetry/`: Contains logic for collecting and reporting telemetry data.
*   `utils/`: A collection of shared utility functions used across the core package.
*   `code_assist/`: Logic related to code analysis, transformation, and assistance features.
*   `__mocks__/`: Mock implementations for dependencies, primarily used in testing.
*   `index.ts`: The main entry point for the `@gemini-cli/core` package.
*   `index.test.ts`: Unit tests for the main `index.ts` file.

This directory is critical for the operation of the Gemini CLI, as it defines how the AI interacts with the user's environment and performs requested actions.