# Integration Tests

This directory contains integration tests for the Gemini CLI project. These tests focus on verifying the end-to-end functionality of various tools and core features by simulating real-world scenarios and interactions.

## Purpose:

*   **End-to-End Validation**: Ensure that different components and tools work together correctly as a complete system.
*   **Tool Reliability**: Verify the proper execution and output of individual tools (e.g., `write_file`, `run_shell_command`, `web_search`).
*   **Scenario Testing**: Cover common user workflows and interactions to catch regressions.

## Key Contents:

*   `*.test.js`: Individual test files, each focusing on a specific tool or integration scenario (e.g., `file-system.test.js`, `google_web_search.test.js`).
*   `run-tests.js`: A script to orchestrate the execution of these integration tests.
*   `test-helper.js`: Utility functions and setup common to the integration tests.

These tests are crucial for maintaining the stability and correctness of the Gemini CLI, especially as new features are added and existing ones are modified.