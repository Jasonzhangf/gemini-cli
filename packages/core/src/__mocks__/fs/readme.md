# `fs` Mock Directory

This directory within `packages/core/src/__mocks__` provides mock implementations for Node.js's built-in `fs` (file system) module, specifically focusing on the `promises` API. These mocks are used during unit and integration testing to simulate file system operations without performing actual disk I/O.

## Purpose:

*   **Decouple Tests from File System**: Allow tests to run independently of the actual file system state, preventing side effects and ensuring test isolation.
*   **Control Test Scenarios**: Enable the simulation of various file system behaviors, such as successful reads/writes, file not found errors, permission issues, or specific file contents.
*   **Improve Test Speed**: Avoid the overhead of real disk operations, leading to faster test execution.

## Key Contents:

*   `promises.ts`: Contains mock implementations for the `fs/promises` API, including functions like `readFile`, `writeFile`, `readdir`, etc. These mocks typically use in-memory data structures to simulate file system state.

When tests in the `@gemini-cli/core` package interact with file system operations, Vitest is configured to use these mock implementations, ensuring a controlled and predictable testing environment.