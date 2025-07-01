# Packages

This directory serves as the root for all internal npm packages within the Gemini CLI monorepo. It encapsulates distinct, reusable modules that collectively form the complete application. This structure promotes modularity, separation of concerns, and easier management of dependencies.

## Purpose:

*   **Monorepo Management**: Organize and manage multiple related packages within a single repository.
*   **Modularity**: Break down the application into smaller, independent, and reusable units.
*   **Code Reusability**: Facilitate sharing of code and functionalities between different parts of the Gemini CLI.
*   **Clear Boundaries**: Define clear responsibilities and APIs for each package.

## Key Contents:

*   `cli/`: Contains the `@gemini-cli/cli` package, which is the main command-line interface application.
*   `core/`: Contains the `@gemini-cli/core` package, which provides the core logic, Gemini API interaction, and tool execution functionalities.

Each subdirectory within `packages/` represents a self-contained npm package with its own `package.json`, `tsconfig.json`, and source code. This setup allows for independent development, testing, and versioning of each component while benefiting from the unified monorepo workflow.