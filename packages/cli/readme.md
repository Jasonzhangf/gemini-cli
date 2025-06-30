# CLI Package

This package provides the command-line interface (CLI) for the Gemini CLI application. It is built using [Ink](https://github.com/vadimdemedes/ink) to create a rich, interactive user experience in the terminal.

### Responsibilities

- **Command Parsing**: Parsing user arguments, flags, and inputs.
- **User Interaction**: Managing user prompts, spinners, and displaying output.
- **Component Rendering**: Using React and Ink to render UI components in the terminal.
- **Core Logic Invocation**: Calling the functionalities exposed by the `core` package to execute user commands.
- **Output Formatting**: Formatting and presenting the results from the core logic to the user in a readable way.

All code related to the terminal user interface, command handling, and presentation logic should be located within this package. 