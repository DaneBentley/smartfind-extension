# SmartFind Content Script Modules

This directory contains the refactored content script modules for better maintainability and scalability.

## Architecture Overview

The content script has been broken down into focused, single-responsibility modules:

### Core Modules

- **`main.js`** - Entry point that initializes and coordinates all modules
- **`utils.js`** - Shared utility functions used across modules

### Feature Modules

- **`content-monitor.js`** - Handles page content extraction and change detection
- **`ui-manager.js`** - Manages the search bar UI and user interactions  
- **`search-manager.js`** - Coordinates search strategies and orchestrates the search flow
- **`highlight-manager.js`** - Handles DOM highlighting and result navigation
- **`status-manager.js`** - Manages status messages and payment UI
- **`message-handler.js`** - Handles communication with background script

### Search Engine Modules

- **`keyword-search.js`** - Keyword/exact text search with shadow DOM and iframe support
- **`ai-search.js`** - AI result processing and fuzzy matching

## Module Dependencies

```
main.js
├── content-monitor.js
├── highlight-manager.js  
├── status-manager.js
├── ui-manager.js (depends on highlight-manager, status-manager)
├── search-manager.js (depends on content-monitor, highlight-manager, status-manager)
│   ├── keyword-search.js
│   └── ai-search.js
├── message-handler.js (depends on ui-manager)
└── utils.js (used by multiple modules)
```

## Key Benefits

1. **Separation of Concerns** - Each module has a single, well-defined responsibility
2. **Maintainability** - Changes can be made to individual features without affecting others
3. **Testability** - Modules can be tested in isolation
4. **Reusability** - Modules can be reused across different parts of the extension
5. **Scalability** - New features can be added as new modules without bloating existing code

## Module Communication

Modules communicate through:
- Constructor injection of dependencies
- Public method calls
- Event callbacks (e.g., content change notifications)
- Shared state management through the coordinating managers

## Migration Notes

The original `content.js` (1,948 lines) has been split into 9 focused modules averaging ~200-300 lines each, making the codebase much more manageable and following modern software engineering best practices. 