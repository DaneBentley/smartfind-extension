# SmartFind Extension - Modular Background Script Architecture

This directory contains the refactored background script components, organized into focused modules for better maintainability and code organization.

## Module Structure

### Core Modules

#### `config.js`
- **Purpose**: Central configuration and constants
- **Contains**: 
  - API endpoints and URLs
  - Usage limits and timing constants
  - Whitelisted users for unlimited access
  - Regex patterns for AI vs keyword search classification
  - Restricted URL patterns for content script injection

#### `utils.js`
- **Purpose**: Common utility functions and helpers
- **Contains**:
  - URL validation functions
  - Search query classification logic
  - Storage helper functions (Promise-based wrappers)
  - Logging utilities with consistent prefixes
  - Badge management for extension icon
  - User ID generation

#### `background.js`
- **Purpose**: Main orchestrator that coordinates all modules
- **Contains**:
  - Event listeners setup (startup, install, action clicks, commands)
  - Module imports and initialization
  - Minimal glue code to connect all components

### Feature Modules

#### `usage-tracking.js`
- **Purpose**: Token and usage management
- **Contains**:
  - Free tier usage counting
  - Paid token management (increment/decrement)
  - Usage permission checking
  - Cloud sync integration for token usage

#### `ai-search.js` 
- **Purpose**: AI search functionality and Cerebras API integration
- **Contains**:
  - AI vs keyword search decision logic
  - Cerebras API communication
  - Search request handling and response processing
  - Fallback mechanisms for failed AI searches

#### `authentication.js`
- **Purpose**: User authentication and data synchronization
- **Contains**:
  - Google OAuth integration
  - Email sign-in/sign-up handling
  - User session management
  - Cloud data synchronization
  - Purchase restoration for authenticated users

#### `payment.js`
- **Purpose**: Payment processing and token purchases
- **Contains**:
  - Stripe integration for token purchases
  - Payment session creation
  - Anonymous purchase handling
  - API connectivity testing
  - Purchase completion processing

#### `messaging.js`
- **Purpose**: Message routing and content script communication
- **Contains**:
  - Central message listener with action routing
  - Content script injection and communication
  - Error handling for restricted URLs
  - Message retry logic and fallback mechanisms

## Key Improvements

### 1. Separation of Concerns
- Each module has a single, well-defined responsibility
- Dependencies are explicit through ES6 imports
- Configuration is centralized and shared

### 2. Better Error Handling
- Consistent logging with module-aware prefixes
- Improved error propagation and reporting
- Graceful fallbacks for various failure scenarios

### 3. Enhanced Maintainability
- Related functionality is grouped together
- Easier to test individual modules
- Clearer code organization and navigation
- Reduced code duplication

### 4. Improved Performance
- Smaller, focused modules enable better tree-shaking
- Lazy loading capabilities for non-critical modules
- More efficient memory usage

## Usage

The extension automatically loads all modules through the main `background.js` file. The manifest.json has been updated to:

```json
{
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  }
}
```

## Development Notes

- All modules use ES6 import/export syntax
- Functions are exported explicitly from each module
- Shared constants and utilities are imported where needed
- The original `background.js` has been backed up as `background.js.backup`

## Testing

To test the modular structure:

1. Load the extension in Chrome with the updated manifest
2. Verify all functionality works as expected
3. Check browser console for any import/export errors
4. Test each major feature (search, authentication, payments) to ensure module integration works correctly

## Migration Path

If you need to revert to the original monolithic structure:
1. Restore `background.js.backup` to `background.js`
2. Update manifest.json to remove the `"type": "module"` field
3. Change the service worker path back to `"background.js"` 