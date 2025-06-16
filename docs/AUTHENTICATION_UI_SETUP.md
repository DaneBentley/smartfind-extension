# SmartFind Authentication UI Setup

## Overview

SmartFind now has a complete authentication user interface that prompts users to sign in before purchasing tokens. This ensures that purchases are properly linked to user accounts and can be synced across devices.

## New User Experience

### 1. Extension Popup Interface

When users click the SmartFind extension icon, they'll see:

**For Unauthenticated Users:**
- Welcome message encouraging sign-in for cross-device sync
- "Continue with Google" button (one-click OAuth)
- "Sign in with Email" button (reveals email/password form)
- Current session statistics (tokens, usage, free searches left)
- Token purchase option with warning about device-only storage

**For Authenticated Users:**
- User profile (name, email, avatar)
- Account statistics (synced across devices)
- Token purchase button (linked to account)
- "Restore Purchases" button
- Sign out option

### 2. Token Purchase Flow

**Before (Old Flow):**
1. User hits search limit
2. Sees "Buy tokens" button
3. Clicks → Redirected to Stripe
4. Purchase not linked to any account

**After (New Flow):**
1. User hits search limit
2. Sees authentication prompt with two options:
   - "Sign In" button → Opens extension popup for authentication
   - "Buy Tokens ($10)" button → Continues with anonymous purchase
3. If authenticated: Purchase is linked to account and synced
4. If anonymous: User gets confirmation dialog about device-only storage

## Technical Implementation

### Files Added/Modified

1. **`popup.html`** - New popup interface with authentication forms
2. **`popup.js`** - Popup logic handling auth, token management, UI updates
3. **`manifest.json`** - Updated to include `"default_popup": "popup.html"`
4. **`content.js`** - Modified token purchase to check authentication first
5. **`background.js`** - Added `openPopup` message handler

### Authentication States

The extension now properly handles three user states:

1. **Anonymous User** - No account, local storage only
2. **Authenticated User** - Signed in, cloud sync enabled
3. **Transitioning User** - Anonymous user prompted to create account

### Key Features

- **Seamless Google OAuth** - One-click sign-in with Google accounts
- **Email/Password Auth** - Traditional signup/signin option
- **Smart Purchase Prompts** - Users are encouraged to sign in before purchasing
- **Anonymous Purchase Option** - Still allows purchases without account (with warnings)
- **Real-time Stats** - Shows current tokens, usage, and free searches remaining
- **Cross-device Sync** - Authenticated users get automatic data synchronization

## Setup Requirements

### 1. Google OAuth Configuration

Update `manifest.json` with your actual Google OAuth client ID:

```json
"oauth2": {
  "client_id": "YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["email", "profile"]
}
```

### 2. Backend Environment Variables

Ensure these are set in your Vercel deployment:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret_key
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_webhook_secret
```

## User Journey Examples

### New User Journey (Recommended)
1. Install extension
2. Try searching (uses free tier)
3. Hit limit → See sign-in prompt
4. Click "Sign In" → Extension popup opens
5. Choose Google OAuth or email signup
6. Purchase tokens → Linked to account
7. Tokens sync across all devices

### Anonymous User Journey (Still Supported)
1. Install extension
2. Try searching (uses free tier)
3. Hit limit → See sign-in prompt
4. Click "Buy Tokens ($10)" → Anonymous purchase
5. Get confirmation dialog about device-only storage
6. Proceed to Stripe checkout
7. Tokens stored locally only

### Existing User Journey
1. Click extension icon
2. See current account status and token balance
3. Can purchase more tokens (linked to account)
4. Can restore purchases from other devices
5. Can sign out if needed

## Benefits

1. **Better User Experience** - Clear authentication flow with helpful prompts
2. **Account Linking** - Purchases are properly associated with user accounts
3. **Cross-device Sync** - Users can access their tokens on any device
4. **Purchase Recovery** - Users can restore purchases if they lose local data
5. **Analytics** - Better tracking of user behavior and purchase patterns
6. **Support** - Easier to help users with account-linked purchases

## Testing

To test the new authentication flow:

1. Load the extension in Chrome
2. Click the extension icon to see the popup
3. Try both Google OAuth and email authentication
4. Test token purchase flow both authenticated and anonymous
5. Verify data syncs across browser sessions

The authentication system is fully backward compatible - existing anonymous users can continue using the extension without any changes to their experience. 