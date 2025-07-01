# Scripts

This directory contains various utility scripts used for building, testing, deploying, and managing the Gemini CLI project. These scripts automate common development and operational tasks, ensuring consistency and efficiency across the project lifecycle.

## Purpose:

*   **Build Automation**: Automate the compilation, bundling, and packaging of the project's components.
*   **Development Workflow**: Provide tools to streamline local development, such as setting up environments, running tests, and managing dependencies.
*   **Deployment Preparation**: Assist in preparing the application for deployment, including asset copying and version binding.
*   **Telemetry and Monitoring**: Scripts related to collecting and reporting telemetry data.

## Key Contents:

*   `build.js`, `build_package.js`, `build_all_packages.js`: Scripts for building individual packages and the entire monorepo.
*   `clean.js`: Script for cleaning build artifacts and temporary files.
*   `setup-dev.js`: Script for setting up the development environment.
*   `start.js`: Script for starting development servers or processes.
*   `prepublish.js`, `prepare-cli-packagejson.js`, `prepare-core-package.js`: Scripts executed before publishing packages.
*   `telemetry.js`, `telemetry_gcp.js`, `telemetry_utils.js`, `local_telemetry.js`: Scripts related to telemetry collection and reporting.
*   `sandbox.js`, `sandbox_command.js`, `build_sandbox.js`, `publish-sandbox.js`: Scripts for managing the sandboxing environment.
*   `copy_files.js`, `copy_bundle_assets.js`: Scripts for copying assets and files.
*   `bind_package_dependencies.js`, `bind_package_version.js`: Scripts for managing package dependencies and versions.
*   `generate-git-commit-info.js`: Script to generate Git commit information.
*   `check-build-status.js`: Script to check the build status.
*   `create_alias.sh`: Shell script for creating aliases.
*   `example-proxy.js`: Example proxy script.
*   `esbuild-banner.js`: Script for adding banners to esbuild outputs.

These scripts are essential for maintaining a robust and automated development and deployment pipeline for the Gemini CLI.