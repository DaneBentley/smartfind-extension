# SmartFind Extension - Complete Setup Guide

## Overview

This guide covers the complete setup of SmartFind extension including backend deployment, database setup, authentication, and payment processing.

## Prerequisites

- Chrome browser for extension development
- Vercel account (free tier sufficient)
- Stripe account for payments
- Supabase account for database
- Google Cloud Console access (optional, for OAuth)

## Step 1: Backend Deployment

### 1.1 Install Vercel CLI
```bash
npm install -g vercel
```

### 1.2 Deploy to Vercel
```bash
# In your project directory
vercel

# Follow prompts to link to Vercel account
```

### 1.3 Configure Environment Variables

In your Vercel dashboard, add these environment variables:

```bash
# Required: AI Search
CEREBRAS_API_KEY=your_cerebras_api_key_here

# Required: Payments
STRIPE_SECRET_KEY=sk_live_or_test_key_here
STRIPE_WEBHOOK_SECRET=whsec_webhook_secret_here

# Required: Database & Authentication
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
JWT_SECRET=your_super_secret_jwt_key_here
```

## Step 2: Database Setup (Supabase)

### 2.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create account
2. Click "New Project"
3. Choose organization and project name
4. Wait for project to initialize

### 2.2 Set Up Database Schema
1. Go to SQL Editor in Supabase dashboard
2. Copy entire contents of `api/db-setup.sql`
3. Paste into SQL Editor
4. Click "Run" to create tables and functions

### 2.3 Get API Credentials
1. Go to Settings > API in Supabase dashboard
2. Copy "Project URL" 
3. Copy "service_role" key (not anon key)
4. Add both to Vercel environment variables

## Step 3: Payment Setup (Stripe)

### 3.1 Create Stripe Account
1. Go to [stripe.com](https://stripe.com) and create account
2. Complete account verification process

### 3.2 Get API Keys
1. Go to Stripe Dashboard
2. Navigate to Developers > API keys
3. Copy "Secret key" (starts with `sk_`)
4. Add to Vercel environment variables

### 3.3 Configure Webhook
1. In Stripe Dashboard, go to Developers > Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://your-vercel-app.vercel.app/api/webhook`
4. Events to send: Select `checkout.session.completed`
5. Click "Add endpoint"
6. Copy "Signing secret" from webhook details
7. Add to Vercel environment variables as `STRIPE_WEBHOOK_SECRET`

### 3.4 Test Payment Flow
1. Use test mode in Stripe
2. Test card: `4242 4242 4242 4242`
3. Any future expiry date and CVC

## Step 4: Authentication Setup (Optional)

### 4.1 Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable "Google+ API"
4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID
5. Application type: "Chrome Extension"
6. Add your extension ID (get from `chrome://extensions/`)

### 4.2 Update Extension Manifest
Add to `manifest.json`:
```json
{
  "oauth2": {
    "client_id": "YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["email", "profile"]
  }
}
```

## Step 5: Extension Installation

### 5.1 Load Extension in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" toggle (top right)
3. Click "Load unpacked"
4. Select your project directory
5. Note the Extension ID that appears

### 5.2 Update Extension Configuration
1. No configuration needed - extension auto-detects your Vercel backend
2. Verify extension icon appears in Chrome toolbar

## Step 6: Testing & Verification

### 6.1 Test Search Functionality
1. Go to any webpage
2. Press `Ctrl+F` (or `Cmd+F` on Mac) to activate search
3. Try search queries:
   - Regular: `summary` (should try keyword first)
   - Force AI: `/what is this about`
   - Force keyword: `'specific term`

### 6.2 Test Authentication
1. Click extension icon to open popup
2. Try "Continue with Google" (if configured)
3. Try "Sign in with Email" with test account

### 6.3 Test Payment Flow
1. Use search until you hit 50 free searches
2. Try purchasing tokens with test card
3. Verify tokens are added to account

### 6.4 Test Cross-Device Sync
1. Sign in on one device
2. Purchase tokens
3. Sign in on second device
4. Verify tokens appear on second device

## Troubleshooting

### Common Issues

**Extension doesn't load:**
- Check manifest.json syntax
- Verify all required files are present
- Check Chrome developer console for errors

**Search not working:**
- Verify Vercel deployment is live
- Check CEREBRAS_API_KEY is set correctly
- Test API endpoint directly

**Payments failing:**
- Verify Stripe keys are correct
- Check webhook endpoint is accessible
- Test with Stripe test cards first

**Authentication issues:**
- Verify Supabase credentials
- Check JWT_SECRET is set
- Test database connection

**Token sync not working:**
- Verify user is signed in
- Check Supabase database has data
- Try "Check Purchases" button in popup

### Debug Commands

Test in browser console:
```javascript
// Test search
chrome.runtime.sendMessage({action: "aiSearch", query: "test"}, console.log);

// Test auth status
chrome.runtime.sendMessage({action: "getAuthStatus"}, console.log);

// Test token count
chrome.runtime.sendMessage({action: "getPaidTokens"}, console.log);
```

## Production Deployment

### Pre-deployment Checklist
- [ ] Switch Stripe to live mode and update keys
- [ ] Use production Cerebras API key
- [ ] Verify all environment variables are set
- [ ] Test complete user flow end-to-end
- [ ] Verify webhook endpoint is accessible
- [ ] Test on multiple websites and browsers

### Security Considerations
- Never commit API keys to version control
- Use strong JWT_SECRET (32+ random characters)
- Enable Stripe webhook signature verification
- Test with real payment amounts in staging
- Monitor Vercel function logs for errors

## Cost Estimates

**Development:**
- Vercel: Free tier (sufficient for development)
- Supabase: Free tier (500MB database)
- Stripe: Free (pay only transaction fees)

**Production:**
- Vercel: $20/month for Pro (if needed)
- Supabase: $25/month for Pro (if needed)
- Stripe: 2.9% + 30¢ per transaction

This guide should get your SmartFind extension fully operational with all features working end-to-end. 