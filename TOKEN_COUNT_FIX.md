# Token Count Fix

## Problem Description

The extension had an issue where token counts were being "reloaded" back to the original purchased amount each time a user used a token, instead of properly decrementing. This was caused by the automatic synchronization system that was designed to prevent data loss but was too aggressive.

## Root Causes

1. **Aggressive Auto-Sync**: The extension was automatically syncing data on:
   - Extension startup
   - Extension installation/update
   - After every authentication
   - When the popup opened

2. **Database Sync Logic**: The database sync function used `GREATEST()` to always take the maximum value between local and cloud data, which meant:
   - User uses token: local count goes from 100 → 99
   - Cloud still has 100
   - Sync happens: takes GREATEST(99, 100) = 100
   - Token count is "restored" to 100

3. **No Sync Throttling**: There was no mechanism to prevent frequent syncing, leading to constant overwrites of local changes.

## Solution Implemented

### 1. Smart Database Sync Logic

Modified the `sync_user_data()` function in `api/db-setup.sql` to use intelligent sync logic:

```sql
-- Smart token sync logic:
-- If local tokens are less than cloud tokens, user has used tokens locally
-- If local tokens are greater than cloud tokens, user has purchased tokens locally  
-- If purchased tokens are greater than both, new purchases have been made
IF purchased_tokens > GREATEST(current_data.paid_tokens, local_tokens) THEN
    -- New purchases detected, use purchased tokens
    final_tokens := purchased_tokens;
ELSIF local_tokens < current_data.paid_tokens THEN
    -- Tokens used locally, use local count (lower value)
    final_tokens := local_tokens;
ELSE
    -- Use the greater of local or cloud (for cases where tokens were added locally)
    final_tokens := GREATEST(current_data.paid_tokens, local_tokens);
END IF;
```

### 2. Sync Throttling

Added time-based throttling to prevent excessive syncing:

- **Startup Sync**: Only sync if more than 5 minutes have passed since last sync
- **Install Sync**: Only sync on first install, not on updates
- **Popup Auto-Sync**: Only sync if more than 5 minutes have passed
- **Sync Tracking**: Added `lastSyncTime` to track when syncs occur

### 3. Periodic Token Usage Sync

Modified `decrementPaidTokens()` to occasionally sync token usage to the cloud:

```javascript
// Sync with cloud occasionally (every 10 token uses) to prevent data loss
if (paidTokens % 10 === 0) {
    // Sync to cloud
}
```

## Files Modified

1. **`api/db-setup.sql`**: Updated `sync_user_data()` function with smart sync logic
2. **`background.js`**: 
   - Added sync throttling with `lastSyncTime` tracking
   - Modified startup and install listeners
   - Updated `decrementPaidTokens()` for periodic syncing
3. **`popup.js`**: Added sync throttling to auto-sync function

## Testing

Created `test-token-fix.js` to verify the fix works correctly:

1. **Token Decrement Test**: Verifies tokens are properly decremented when used
2. **Sync Behavior Test**: Verifies sync doesn't restore token counts inappropriately

## Usage

To test the fix:

1. Load the test script in browser console: `test-token-fix.js`
2. Run: `window.testTokenFix.runTests()`
3. Or run individual tests:
   - `window.testTokenFix.testTokenDecrement()`
   - `window.testTokenFix.testSyncBehavior()`

## Benefits

- ✅ Token counts now properly decrement when used
- ✅ Sync system still prevents data loss from purchases
- ✅ Reduced unnecessary API calls and syncing
- ✅ Better user experience with accurate token tracking
- ✅ Cross-device sync still works for legitimate cases

## Backward Compatibility

The fix is fully backward compatible and doesn't require any user action or data migration. 