# `@gemini-cli/cli` Package

This directory contains the source code for the `@gemini-cli/cli` package, which is the main command-line interface application for interacting with the Gemini model. It is responsible for handling user input, displaying output, and orchestrating calls to the core functionalities.

## Key Responsibilities:

*   **User Interface (UI)**: Manages the interactive command-line interface using Ink (React for CLIs).
*   **Command Parsing**: Interprets user commands and arguments.
*   **Configuration Management**: Handles CLI-specific settings, themes, and authentication.
*   **Tool Integration**: Orchestrates the execution and display of results from various tools (e.g., file system operations, web search, shell commands).
*   **Session Management**: Manages the conversational flow and history of interactions with the Gemini model.

## Key Contents:

*   `src/`: Contains the main source code for the CLI.
    *   `src/gemini.tsx`: The main React component for the interactive CLI application.
    *   `src/nonInteractiveCli.ts`: Logic for non-interactive CLI operations.
    *   `src/ui/`: Components, hooks, and utilities related to the Ink-based user interface.
    *   `src/config/`: Configuration management for the CLI.
    *   `src/utils/`: General utility functions.
*   `package.json`: Defines package metadata, dependencies, and scripts specific to the CLI.
*   `tsconfig.json`: TypeScript configuration for this package.
*   `vitest.config.ts`: Vitest testing framework configuration for CLI tests.

This package serves as the primary interface for users to interact with the Gemini CLI, providing a rich and interactive experience.