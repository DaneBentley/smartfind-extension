# SmartFind Extension - User Guide

## Overview
SmartFind is an intelligent browser extension that enhances your web browsing experience with AI-powered search capabilities. It provides both traditional keyword search and advanced AI-powered semantic search to help you find information on web pages more effectively.

## Getting Started

### Installation & Setup
1. Install the SmartFind extension from your browser's extension store
2. Click the SmartFind icon in your browser toolbar to sign in
3. You'll receive free tokens to get started with AI search features

### Basic Usage
- **Keyboard Shortcut**: Press `Ctrl+F` (Windows/Linux) or `Cmd+F` (Mac) to activate SmartFind
- **Extension Icon**: Click the SmartFind icon in your browser toolbar

## Search Modes

### 1. Smart Progressive Search (Default)
When you type a query, SmartFind automatically:
1. First tries keyword search for immediate results
2. If no matches found, automatically tries AI search
3. Shows results with intelligent highlighting

### 2. Forced Keyword Search
- **Prefix**: Start your query with `'` (single quote)
- **Example**: `'exact phrase`
- **Use for**: Finding exact text matches, technical terms, URLs

### 3. Forced AI Search
- **Prefix**: Start your query with `/` (forward slash)
- **Example**: `/what is the main point`
- **Use for**: Natural language queries, summaries, concept searches

### 4. **NEW: Google Workspace Integration**
SmartFind automatically detects when you're on Google Workspace applications and uses the browser's native search instead:

- **Supported Apps**: Google Docs, Google Sheets, Google Slides, Google Forms, Google Drive
- **Automatic Detection**: No setup required - works automatically
- **Visual Feedback**: Shows a notification when switching to native search
- **Why**: Google Workspace apps use complex rendering that works better with the browser's built-in search

**When SmartFind detects Google Workspace:**
- Pressing `Ctrl+F` or `Cmd+F` will trigger the browser's native search
- A brief notification appears: "📄 SmartFind detected Google Docs - Opening browser's native search instead"
- No tokens are used since it's using the browser's built-in functionality

### 5. **NEW: Extended AI Search**
For long pages with lots of content, SmartFind now offers extended search:

- **When**: Automatically detected on pages with >50,000 characters of content
- **Prompt**: You'll see "Search all? ~3 tokens" with "Press Enter to continue"
- **How it works**: 
  - Intelligently chunks the page into semantic sections
  - Pre-filters chunks based on keyword relevance
  - Searches multiple sections in parallel
  - Aggregates and ranks results
- **Token cost**: 2-5 tokens depending on page size (vs 1 token for standard search)

## AI Search Examples

### Perfect for natural language queries:
- `"what is the main argument"`
- `"find contact information"`
- `"summarize the key points"`
- `"show me phone numbers"`
- `"names of people mentioned"`

### Concept and analysis queries:
- `"explain the methodology"`
- `"what are the conclusions"`
- `"list the benefits"`
- `"find the author's opinion"`

## Extended Search Benefits

The new hybrid extended search provides:

✅ **Complete Coverage**: Searches entire page content, not just beginning/end  
✅ **Smart Filtering**: Only processes relevant sections  
✅ **Parallel Processing**: Multiple sections searched simultaneously  
✅ **Better Accuracy**: Higher chance of finding relevant content  
✅ **User Control**: Always asks permission before using extra tokens  

## Token System

### Free Tier
- 50 free AI searches per month
- Resets automatically each month
- Keyword search always free

### Extended Searches
- Uses 2-5 tokens depending on page complexity
- Always shows estimated cost before proceeding
- Can be canceled with Escape key

### Paid Tokens
- Purchase additional tokens for heavy usage
- Never expire
- Used before free tokens

## Tips for Best Results

### For Standard AI Search:
1. **Be specific**: "find email addresses" vs "contact"
2. **Use natural language**: "what is the main point" vs "main point"
3. **Try different phrasings** if first attempt doesn't work

### For Extended Search:
1. **Accept the prompt** for comprehensive results on long pages
2. **Use descriptive queries** - the system will find relevant sections
3. **Try broad concepts** - the chunking system handles complex topics well

## Troubleshooting

### Common Issues:
- **No results found**: Try rephrasing your query or using keyword search with `'`
- **Sign-in required**: Click the extension icon to authenticate
- **Token limit reached**: Sign in to get monthly refresh or purchase more tokens

### Extended Search Issues:
- **Prompt not appearing**: Page might be under 50k characters (working as intended)
- **Search taking long**: Extended search processes multiple sections - wait for completion
- **Unexpected token usage**: Extended search uses more tokens for better coverage

## Privacy & Security
- No search data is stored permanently
- All processing happens securely via encrypted connections
- Only processes visible webpage content

## Keyboard Shortcuts
- `Enter`: Navigate to next result / Confirm extended search
- `Shift+Enter`: Navigate to previous result
- `Escape`: Clear search / Cancel extended search prompt
- `Ctrl+F` / `Cmd+F`: Activate SmartFind

## Debug Commands (Advanced Users)

For testing the new hybrid functionality, open browser console and try:

```javascript
// Test extended search prompt
smartfindHybridDebug.testExtendedSearch('find important information');

// Test content chunking
smartfindHybridDebug.testChunking();

// Test keyword extraction
smartfindHybridDebug.testKeywordExtraction('artificial intelligence research');

// Check current status
smartfindHybridDebug.getStatus();
```

## Support
For additional help or to report issues, visit [SmartFind Support](your-support-url) or contact our team. 