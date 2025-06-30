# Scripts

This directory contains various build, utility, and automation scripts used throughout the project's development lifecycle.

### Overview

These scripts are primarily written in JavaScript (Node.js) and are used to automate repetitive tasks such as building packages, cleaning the workspace, and preparing for publishing.

### Key Scripts

- **`build_all_packages.js`**: The main build script that compiles all packages in the `packages/` directory.
- **`clean.js`**: Removes build artifacts and temporary files from the project.
- **`start.js`**: A development script used to run the application in watch mode.
- **`prepublish.js`**: A script that runs before publishing packages to NPM, often handling tasks like version bumping and dependency checks.
- **`switch-provider.sh`**: A shell script to easily switch between configured model providers (see `CLAUDE.MD` for more details on model hijacking).

For details on a specific script, please refer to the source code within the file itself. 