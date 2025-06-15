# SmartFind Extension

A Chrome extension that provides intelligent search capabilities using AI.

## Setup Instructions

### 1. Set Up Vercel Backend

1. Install Vercel CLI if you haven't already:
   ```bash
   npm i -g vercel
   ```

2. Set up your environment variables in `.env.local`:
   ```bash
   CEREBRAS_API_KEY=your_actual_cerebras_api_key_here
   ```

3. Deploy to Vercel or run locally:
   ```bash
   # For local development
   vercel dev
   
   # For deployment
   vercel
   ```

4. Set the environment variable in your Vercel dashboard:
   - Go to your Vercel project settings
   - Add `CEREBRAS_API_KEY` with your actual API key

### 2. Configure Extension

The extension now uses your Vercel backend as a proxy, so no API keys need to be stored in the extension files.

### 3. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory

### 4. Usage

- Click the extension icon or use the keyboard shortcut to activate
- Type your search query in natural language
- The extension will intelligently choose between AI search and keyword search

## Security Notes

- **Never commit `.env` or `.env.local` files with real API keys to version control**
- The `.gitignore` file is configured to exclude sensitive files
- API keys are stored securely in Vercel environment variables
- The extension uses a secure proxy pattern to avoid exposing API keys in client code

## Development

This extension uses:
- Cerebras AI for intelligent search
- Stripe for payment processing
- Chrome Extension Manifest V3

## Payment System

The extension includes a token-based payment system:
- Free tier: 50 searches
- Paid tier: $10 for 1000 tokens (1¢ per search) 