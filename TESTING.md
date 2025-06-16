# SmartFind Extension Testing Guide

After the refactoring from a monolithic `content.js` to modular components, use this guide to verify everything works correctly.

## Quick Test Steps

1. **Load the Extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory
   - Verify no errors in console

2. **Test Content Script Loading**:
   - Navigate to any website
   - Open DevTools Console (F12)
   - Look for these messages:
     ```
     SmartFind: Content script loaded on: [URL]
     SmartFind: Initializing content script modules
     SmartFind: Content script initialization complete
     ```

3. **Test Search Bar Toggle**:
   - Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac)
   - Search bar should appear in top-right corner
   - Try the console command: `smartfindTest()`

4. **Test Search Functionality**:
   - Type a keyword search (e.g., "button")
   - Should highlight matches with green background
   - Try AI search with "?" prefix (e.g., "?what is this page about")
   - Should show blue highlights for AI results

5. **Test Navigation**:
   - Use up/down arrow keys to navigate between results
   - Current match should have darker highlight
   - Results counter should update (e.g., "1/5")

## Module Testing

Test individual modules via browser console:

```javascript
// Test content monitor
SmartFind.contentMonitor.extractPageContent();

// Test UI manager
SmartFind.uiManager.toggleSearchBar();

// Test search manager
SmartFind.searchManager.performSearch("test");

// Test highlight manager
SmartFind.highlightManager.clearHighlights();
```

## Common Issues to Check

1. **ES Module Errors**: Check console for import/export errors
2. **Auth.js Conflicts**: Should be removed from content scripts
3. **CSS Loading**: Search bar should have proper styling
4. **Background Communication**: Extension icon click should toggle search
5. **Cross-node Highlighting**: Long text spans should highlight correctly

## File Structure Verification

Ensure these key files exist:
- `src/content/main.js` (entry point)
- `src/content/*.js` (all 10 modules)
- `manifest.json` points to `src/content/main.js`
- `styles.css` loads correctly

## Performance Check

- Page load should not be noticeably slower
- Search should respond within 1-2 seconds
- Memory usage should be reasonable (check DevTools > Memory)

## Rollback if Needed

If issues persist, the refactoring can be reverted by:
1. Restoring original `content.js` from git history
2. Updating manifest.json to use `content.js`
3. Removing `"type": "module"` from content_scripts 