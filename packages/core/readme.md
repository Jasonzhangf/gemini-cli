# `@gemini-cli/core` Package

This directory contains the core logic and functionalities that power the Gemini CLI. It is designed to be a reusable and independent package, providing the fundamental building blocks for interacting with the Gemini model and managing various software engineering tasks.

## Key Responsibilities:

*   **Gemini API Interaction**: Handles communication with the Gemini API, including sending requests and processing responses.
*   **Tool Execution**: Provides the mechanisms for executing various tools (e.g., file system operations, shell commands, web search) as instructed by the Gemini model.
*   **Code Assistance**: Contains logic for code analysis, transformation, and generation.
*   **Telemetry**: Manages the collection and reporting of usage metrics and error information.
*   **Utility Functions**: Offers a collection of general-purpose utilities used across the project.

## Key Contents:

*   `src/`: Contains the main source code for the core functionalities.
    *   `src/core/`: Core components related to Gemini chat, content generation, and tool scheduling.
    *   `src/tools/`: Implementations of various tools available to the Gemini model.
    *   `src/config/`: Core configuration settings.
    *   `src/services/`: Services for interacting with external systems like Git.
    *   `src/telemetry/`: Telemetry related code.
    *   `src/utils/`: Shared utility functions.
    *   `src/code_assist/`: Logic for code manipulation and assistance.
*   `package.json`: Defines package metadata, dependencies, and scripts specific to the core package.
*   `tsconfig.json`: TypeScript configuration for this package.
*   `vitest.config.ts`: Vitest testing framework configuration for core tests.
*   `test-setup.ts`: Setup file for Vitest tests.

This package is the backbone of the Gemini CLI, encapsulating the essential intelligence and operational capabilities.