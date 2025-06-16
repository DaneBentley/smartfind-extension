# SmartFind Extension

A Chrome extension that provides intelligent search capabilities using AI-powered semantic search and traditional keyword matching.

## Features

- **Progressive Search**: Starts with keyword search, automatically falls back to AI when no matches found
- **Force Search Modes**: Use `/` prefix for AI search, `'` prefix for keyword-only search
- **Cross-Device Sync**: Sign in to sync tokens and purchases across all devices
- **Flexible Payment**: Pay any amount from $1-$500 (100 tokens per $1)
- **Visual Feedback**: Clear indicators show which search mode is active

## Quick Start

### 1. Install Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory

### 2. Usage
- Press **Ctrl+F** (or **Cmd+F** on Mac) to activate search
- Type your query and press Enter
- Use **/** prefix to force AI search (e.g., `/what are the main conclusions`)
- Use **'** prefix to force keyword search (e.g., `'Table 1`)

### 3. Authentication (Optional)
- Click the extension icon to open popup
- Sign in with Google or email to sync across devices
- Anonymous usage works without sign-in

## Deployment Setup

### 1. Backend Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
```

**Required Environment Variables:**
```bash
# AI Search
CEREBRAS_API_KEY=your_cerebras_api_key

# Payments  
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_webhook_secret

# Authentication & Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
JWT_SECRET=your_super_secret_jwt_key
```

### 2. Database Setup (Supabase)

1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Run SQL from `api/db-setup.sql` in Supabase SQL Editor
4. Get Project URL and Service Role Key from Settings > API

### 3. Payment Setup (Stripe)

1. Create account at [stripe.com](https://stripe.com)
2. Get Secret Key from Dashboard
3. Set up webhook endpoint: `https://your-vercel-app.vercel.app/api/webhook`
4. Select event: `checkout.session.completed`
5. Copy webhook secret to environment variables

### 4. Authentication Setup (Google OAuth - Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 Client ID for Chrome Extension
3. Add client ID to `manifest.json`:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["email", "profile"]
}
```

## How It Works

### Search System
1. **Progressive Search**: Tries keyword search first, automatically uses AI if no results
2. **Force Modes**: Users can force specific search types with prefixes
3. **Visual Feedback**: Blue highlighting for AI search, distinct styling for each mode

### Token System
- **Free Tier**: 50 searches per account
- **Paid Tokens**: $1 = 100 tokens (1¢ per search)
- **Flexible Payment**: Users choose any amount $1-$500
- **Cross-Device Sync**: Authenticated users get tokens on all devices

### Authentication
- **Anonymous**: Works without sign-in, tokens stored locally
- **Google OAuth**: One-click sign-in with Google account
- **Email/Password**: Traditional authentication with secure password hashing
- **Data Sync**: Cloud storage of tokens, usage, and purchase history

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Email signup
- `POST /api/auth/signin` - Email signin  
- `POST /api/auth/oauth` - Google OAuth
- `GET /api/auth/validate` - Token validation

### Search & Tokens
- `POST /api/ai-search` - AI search queries
- `POST /api/purchase-tokens` - Token purchases
- `POST /api/webhook` - Stripe webhook handler
- `GET /api/user/restore-purchases` - Restore user purchases

## Security Features

- JWT token authentication with expiration
- Row Level Security (RLS) on database tables
- Password hashing with bcrypt
- Google token validation
- CORS protection for Chrome extension
- Input validation and sanitization
- No API keys stored in extension code

## Development

### File Structure
```
/
├── manifest.json          # Extension manifest
├── popup.html/js         # Extension popup UI
├── content.js            # Content script (main functionality)
├── styles.css            # Extension styles
├── auth.js              # Authentication helper
├── api/                 # Backend API (Vercel)
│   ├── ai-search.js     # AI search endpoint
│   ├── purchase-tokens.js # Payment processing
│   ├── webhook.js       # Stripe webhooks
│   ├── auth/           # Authentication endpoints
│   └── user/           # User management endpoints
├── src/                # Modular source code
└── docs/               # Documentation
```

### Testing

```javascript
// Test in browser console on any webpage:

// Test search functionality
chrome.runtime.sendMessage({ 
  action: "aiSearch", 
  query: "test query" 
}, console.log);

// Test authentication
chrome.runtime.sendMessage({ 
  action: "signInWithGoogle" 
}, console.log);

// Check token balance
chrome.runtime.sendMessage({ 
  action: "getPaidTokens" 
}, console.log);
```

## Production Checklist

- [ ] All environment variables set in Vercel
- [ ] Supabase database schema deployed
- [ ] Stripe webhook configured and tested
- [ ] Google OAuth configured (if using)
- [ ] Extension loaded and tested in Chrome
- [ ] Payment flow tested with Stripe test cards
- [ ] Cross-device sync tested with authentication

## Support

### Search Tips
- **Normal search**: Tries keyword first, then AI automatically
- **Force AI**: Use `/` prefix (e.g., `/what is this about`)
- **Force keyword**: Use `'` prefix (e.g., `'specific term`)

### Common Issues
- **No results**: Try AI search with `/` prefix
- **Slow search**: Large pages may take a few seconds
- **Missing tokens**: Use "Check Purchases" button in popup
- **Sync issues**: Sign out and sign back in

---

**Pricing**: 50 free searches, then 1¢ per search with flexible payment amounts.
**Privacy**: No personal data stored except for authenticated users (email, purchase history).
**Browser**: Chrome extension using Manifest V3. 