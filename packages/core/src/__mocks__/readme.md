# `__mocks__` Directory

This directory contains mock implementations of modules and dependencies used specifically for testing within the `@gemini-cli/core` package. Mocking allows tests to isolate the code under test from its external dependencies, ensuring predictable and repeatable test results.

## Purpose:

*   **Isolate Tests**: Prevent tests from relying on actual external systems (e.g., file system, network) or complex internal modules.
*   **Control Behavior**: Define predictable behavior for mocked dependencies, enabling specific test scenarios (e.g., simulating file read errors, network delays).
*   **Improve Performance**: Speed up test execution by avoiding real I/O operations.

## Key Contents:

*   `fs/`: Contains mock implementations for Node.js's built-in `fs` (file system) module, allowing file operations to be simulated without touching the actual disk.

When writing tests in the `core` package, developers can leverage these mocks (or add new ones as needed) to create controlled testing environments. Vitest's mocking capabilities are used to integrate these mock implementations during test runs.