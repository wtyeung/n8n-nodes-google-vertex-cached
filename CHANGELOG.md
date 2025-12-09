# Changelog

All notable changes to this project will be documented in this file.

## [0.2.7] - 2024-12-09

### Fixed
- **Critical Fix**: Added missing `N8nLlmTracing` callback handler to enable proper LLM call logging in n8n's AI Agent interface
  - LLM invocations are now properly tracked and displayed in the AI Agent logs
  - Previously, only memory access was logged while LLM calls were invisible
  - Implemented the same logging pattern used by all standard n8n LLM nodes (OpenAI, Google Vertex AI, Ollama, etc.)

### Added
- Created `N8nLlmTracing.ts` - Standard n8n callback handler for LLM event tracking
  - Logs LLM start events with input messages and options
  - Logs LLM completion events with responses and token usage
  - Logs LLM errors with proper error handling

### Changed
- Added `@types/lodash` as dev dependency for TypeScript support

### Technical Notes
- **Important**: The `model.bind()` method does not exist at runtime on `ChatVertexAI` instances, despite being present in TypeScript definitions
  - This is why we use manual `RunnableBinding` construction instead of the native `.bind()` method
  - Attempting to use `model.bind({ cachedContent: '...' })` will fail with "bind is not a function" error
  - The `RunnableBinding` approach is the correct implementation for injecting custom parameters like `cachedContent`

## [0.2.6] - 2024-12-09

### Added
- **Developer Experience**: Enhanced the Tools + Cache conflict error. It now automatically converts your n8n tools into **Vertex AI Function Declaration JSON**, which you can directly copy and paste into your cache creation request to enable tools with cached content.

## [0.2.4]

### Added
- **Developer Experience**: Added a helpful error message when attempting to use Tools + Cache. The error now includes the **JSON Tool Schema**, allowing users to copy it and use it for creating a cache with baked-in tools.
- **Documentation**: Added the "Agent as a Tool" architecture guide to help users implement RAG + Dynamic Tools workflows.

## [0.2.1]

### Fixed
- **Major Stability Fix**: Downgraded internal dependencies to align with n8n's core (`@langchain/core` 0.3.x), resolving "Unsupported message type" and "SystemMessage.isInstance" errors.
- **Critical Fix**: Fixed parameter passing (Temperature, TopP, etc.) so the model respects user settings and doesn't get stuck in cached personas.

### Changed
- **Improved Defaults**: Default temperature increased to 0.9 for better responsiveness.
- **Robust Binding**: Implemented "Flattened Binding" strategy for tools + cache to ensure reliability.

### Added
- Documentation updates to reflect correct technical implementation and dependency versions.

## [0.1.0 - 0.1.3] - Beta

### Added
- Initial development and binding fixes.
- Basic context caching support for Google Vertex AI
- Tool binding compatibility with n8n AI Agent
