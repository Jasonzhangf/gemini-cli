# Core Package

This package is the heart of the Gemini CLI, containing all the core logic and business operations. It is responsible for:

- **Content Generation**: Interacting with different AI models (like Google's Gemini, OpenAI-compatible APIs, etc.).
- **Model Hijacking**: Implementing the logic to intercept and redirect model requests based on user configuration.
- **Configuration Management**: Loading, parsing, and managing user settings from environment variables and configuration files.
- **API Abstractions**: Providing a consistent interface for communicating with various model providers.

This package is designed to be a self-contained unit with no user interface dependencies, allowing it to be potentially used in other environments beyond the CLI. All business logic should reside here. 