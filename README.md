# SmartFind Extension

A Chrome extension that provides intelligent search capabilities using AI.

## Setup Instructions

### 1. Configure API Keys

1. Copy `config.example.json` to `config.json`:
   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json` and replace the placeholder values with your actual API keys:
   - `cerebras_api_key`: Your Cerebras AI API key
   - `stripe_publishable_key`: Your Stripe publishable key (for payments)
   - `payment_api_url`: Your payment API endpoint

3. Update `rules.json` with your Cerebras API key:
   - Replace `YOUR_CEREBRAS_API_KEY_HERE` with your actual API key

### 2. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory

### 3. Usage

- Click the extension icon or use the keyboard shortcut to activate
- Type your search query in natural language
- The extension will intelligently choose between AI search and keyword search

## Security Notes

- **Never commit `config.json` or `rules.json` with real API keys to version control**
- The `.gitignore` file is configured to exclude sensitive files
- Always use environment variables in production deployments

## Development

This extension uses:
- Cerebras AI for intelligent search
- Stripe for payment processing
- Chrome Extension Manifest V3

## Payment System

The extension includes a token-based payment system:
- Free tier: 50 searches
- Paid tier: $10 for 1000 tokens (1¢ per search) 