# Project Root

This directory serves as the root of the Gemini CLI project. It contains top-level configuration files, build scripts, documentation, and the main entry points for the application.

## Key Contents:

*   `package.json`, `package-lock.json`: Node.js project metadata, dependencies, and scripts.
*   `tsconfig.json`: TypeScript configuration for the entire project.
*   `eslint.config.js`, `.prettierrc.json`: Code linting and formatting configurations.
*   `Makefile`: Contains various build and development automation tasks.
*   `Dockerfile`: Defines the Docker image for the application.
*   `scripts/`: Directory containing various utility scripts for building, testing, and deploying the project.
*   `packages/`: Contains individual npm packages that make up the monorepo (e.g., `cli`, `core`).
*   `docs/`: Project documentation, including architecture, deployment, and tool usage.
*   `integration-tests/`: End-to-end tests for various functionalities.
*   `.github/`: GitHub Actions workflows and issue templates.
*   `.vscode/`: VS Code specific configurations.
*   `venv/`: Python virtual environment (likely for internal tooling or specific integrations).

This directory orchestrates the entire project, providing the necessary configurations and scripts to build, test, and run the Gemini CLI and its associated packages.