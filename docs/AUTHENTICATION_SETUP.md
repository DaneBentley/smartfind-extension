# SmartFind Authentication & Cloud Sync Setup

## Overview

SmartFind now supports user authentication with Google OAuth and email/password, plus cloud synchronization of tokens and usage across devices using Supabase.

## Features Added

- ✅ **Google OAuth Sign-In** - One-click authentication with Google accounts
- ✅ **Email/Password Authentication** - Traditional signup/signin with secure password hashing
- ✅ **Cloud Storage** - Supabase database for cross-device sync
- ✅ **Purchase Tracking** - All token purchases stored in cloud with full history
- ✅ **Device Sync** - Tokens and usage automatically sync across all user devices
- ✅ **Purchase Restoration** - Users can restore their purchases on new devices

## Required Environment Variables

Add these to your Vercel deployment:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here

# JWT Secret for token signing
JWT_SECRET=your_super_secret_jwt_key_here

# Existing Stripe Configuration (unchanged)
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_webhook_secret
```

## Setup Instructions

### 1. Set Up Supabase Database

1. **Create a Supabase account** at [supabase.com](https://supabase.com)
2. **Create a new project**
3. **Run the database schema** from `api/db-setup.sql`:
   - Go to SQL Editor in Supabase Dashboard
   - Copy and paste the entire contents of `api/db-setup.sql`
   - Click "Run" to create all tables and functions
4. **Get your credentials**:
   - Project URL: `https://your-project.supabase.co`
   - Service Role Key: Found in Settings > API > service_role key

### 2. Set Up Google OAuth (Optional but Recommended)

1. **Go to Google Cloud Console**:
   - Visit [console.cloud.google.com](https://console.cloud.google.com)
   - Create a new project or select existing one

2. **Enable Google OAuth**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Chrome Extension"
   - Add your extension ID to authorized origins

3. **Update manifest.json**:
   ```json
   "oauth2": {
     "client_id": "YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com",
     "scopes": ["email", "profile"]
   }
   ```

### 3. Deploy Updated Backend

1. **Update environment variables** in Vercel dashboard
2. **Install new dependencies**:
   ```bash
   npm install @supabase/supabase-js jsonwebtoken bcryptjs
   ```
3. **Deploy**:
   ```bash
   vercel --prod
   ```

### 4. Test the System

1. **Load the updated extension** in Chrome
2. **Test authentication**:
   ```javascript
   // Test Google OAuth
   chrome.runtime.sendMessage({ action: "signInWithGoogle" }, console.log);
   
   // Test email signup
   chrome.runtime.sendMessage({ 
     action: "signUpWithEmail", 
     email: "test@example.com", 
     password: "password123", 
     name: "Test User" 
   }, console.log);
   
   // Test data sync
   chrome.runtime.sendMessage({ action: "syncUserData" }, console.log);
   ```

## How It Works

### Authentication Flow

1. **User signs in** with Google or email/password
2. **Backend validates** credentials and creates JWT token
3. **Extension stores** token and user info locally
4. **Auto-sync** happens on sign-in and periodically

### Data Synchronization

- **Local storage** continues to work for offline usage
- **Cloud sync** occurs when user is authenticated
- **Conflict resolution** uses maximum values (prevents data loss)
- **Cross-device** tokens and usage stay in sync

### Purchase Tracking

- **Anonymous purchases** still work (stored with legacy user ID)
- **Authenticated purchases** are linked to user account
- **Purchase history** is fully tracked in database
- **Restore purchases** available for authenticated users

## Database Schema

### Tables Created

- **`users`** - User accounts (email, Google ID, profile info)
- **`user_data`** - Token counts and usage stats per user
- **`purchases`** - Complete purchase history from Stripe

### Key Functions

- **`sync_user_data()`** - Syncs local data with cloud
- **`get_user_total_purchased_tokens()`** - Calculates total tokens from purchases

## Migration Strategy

### For Existing Anonymous Users

1. **Seamless transition** - anonymous usage continues to work
2. **Account creation** - users can sign up and migrate data
3. **Legacy support** - old anonymous user IDs are preserved
4. **No data loss** - sync function uses maximum values

### For Existing Purchasers

1. **Purchase restoration** - authenticated users can restore all purchases
2. **Email matching** - Stripe customer email can link to user account
3. **Manual migration** - support team can link purchases if needed

## User Experience

### Anonymous Users (Existing Behavior)
- ✅ 50 free searches
- ✅ Can purchase tokens ($10 = 1000 tokens)
- ✅ Tokens stored locally only

### Authenticated Users (New Features)
- ✅ 50 free searches per account (not per device)
- ✅ Cloud-synced tokens across all devices
- ✅ Purchase history and restoration
- ✅ Account management
- ✅ Data backup and recovery

## API Endpoints Added

### Authentication
- `POST /api/auth/signup` - Email signup
- `POST /api/auth/signin` - Email signin  
- `POST /api/auth/oauth` - Google OAuth
- `GET /api/auth/validate` - Token validation

### User Management
- `POST /api/user/sync` - Sync user data
- `GET /api/user/restore-purchases` - Restore purchases

### Updated
- `POST /api/purchase-tokens` - Now supports authenticated users
- `POST /api/webhook` - Now stores purchases in database

## Security Features

- ✅ **Row Level Security** (RLS) on all database tables
- ✅ **JWT token authentication** with expiration
- ✅ **Password hashing** with bcrypt
- ✅ **Google token validation** 
- ✅ **CORS protection** for Chrome extension
- ✅ **Input validation** and sanitization

## Testing Commands

```javascript
// Check auth status
chrome.runtime.sendMessage({ action: "getAuthStatus" }, console.log);

// Sign in with Google
chrome.runtime.sendMessage({ action: "signInWithGoogle" }, console.log);

// Sign up with email
chrome.runtime.sendMessage({ 
  action: "signUpWithEmail", 
  email: "user@example.com", 
  password: "securepass123",
  name: "User Name"
}, console.log);

// Sync data
chrome.runtime.sendMessage({ action: "syncUserData" }, console.log);

// Restore purchases
chrome.runtime.sendMessage({ action: "restorePurchases" }, console.log);

// Sign out
chrome.runtime.sendMessage({ action: "signOut" }, console.log);
```

## Troubleshooting

### Common Issues

1. **"User already exists"** - Email already registered, use sign-in instead
2. **"Invalid token"** - Google OAuth not configured properly in manifest
3. **"Database error"** - Check Supabase credentials and schema setup
4. **"CORS error"** - Ensure Supabase URL is in host_permissions

### Debug Mode

Check console for detailed logs:
- Extension console: Right-click extension → Inspect views → Service worker
- Page console: F12 → Console tab

## Next Steps

1. **Add UI components** for sign-in/sign-up in the extension popup
2. **Implement account settings** page
3. **Add email verification** for new accounts
4. **Create admin dashboard** for user/purchase management
5. **Add subscription plans** for unlimited usage

## Cost Estimates

- **Supabase**: Free tier supports 50,000 monthly active users
- **Additional costs**: ~$0 for most usage levels
- **JWT tokens**: No additional cost (stateless)
- **Google OAuth**: Free for most usage levels 