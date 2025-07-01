# ESLint Rules

This directory contains custom ESLint rules developed specifically for the Gemini CLI project. These rules enforce coding standards, best practices, and architectural conventions that are unique to this codebase, ensuring code quality and consistency.

## Purpose:

*   **Enforce Coding Standards**: Ensure all code adheres to the project's specific style and quality guidelines.
*   **Prevent Anti-Patterns**: Identify and flag common mistakes or undesirable coding patterns.
*   **Maintain Architectural Integrity**: Enforce rules that support the project's modular structure and prevent unintended dependencies.

## Key Contents:

*   `no-relative-cross-package-imports.js`: A custom ESLint rule designed to prevent relative imports between different packages within the monorepo, promoting explicit package imports and maintaining clear module boundaries.
*   `readme.md`: This file, describing the purpose and contents of the `eslint-rules` directory.

These custom rules are integrated into the project's linting process (configured via `eslint.config.js` at the root) to provide automated feedback to developers and ensure a high standard of code quality.