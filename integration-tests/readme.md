# Integration Tests

This directory contains integration tests for the Gemini CLI. These tests are designed to validate the end-to-end functionality of the application, ensuring that different parts of the system (CLI, core logic, model interaction) work together correctly.

### Framework

- The tests are written using **Vitest**.
- They typically involve spawning the CLI as a child process and asserting its output or the side effects it produces (e.g., file creation).

### Running Tests

To run the integration tests, use the following command from the project root:

```bash
npm run test:integration
```

Please refer to the existing test files for examples of how to write new integration tests. 