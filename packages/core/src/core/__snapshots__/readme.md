# `__snapshots__` Directory

This directory within `packages/core/src/core` is used by the Vitest testing framework to store snapshots of test outputs. Snapshots are pre-recorded representations of rendered components, serialized data structures, or other values that are compared against the current output during subsequent test runs.

## Purpose:

*   **Regression Detection**: Automatically detect unintended changes to UI components, generated content, or data structures by comparing current outputs against saved snapshots.
*   **Simplified Assertions**: Provide a convenient way to assert complex outputs without manually writing lengthy assertions.

## Key Contents:

*   `prompts.test.ts.snap`: A snapshot file associated with `prompts.test.ts`, likely containing the expected output of prompt generation or related logic.

When tests are run, if the generated output differs from the saved snapshot, Vitest will flag it as a test failure, prompting the developer to either fix the code or update the snapshot if the change was intentional.