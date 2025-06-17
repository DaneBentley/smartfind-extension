// authentication.js - Authentication and user management

import { CONFIG } from './config.js';
import { getStorageValues, setStorageValues, log, logError } from './utils.js';

/**
 * Handle Google OAuth sign in
 */
export async function handleGoogleSignIn(request, sender, sendResponse) {
    try {
        log('Starting Google OAuth...');
        
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(token);
                }
            });
        });

        // Get user info from Google
        log('Fetching Google user info...');
        const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
        if (!userInfoResponse.ok) {
            const errorText = await userInfoResponse.text();
            logError('Google user info error:', errorText);
            throw new Error(`Failed to fetch Google user info: ${userInfoResponse.status} ${userInfoResponse.statusText}`);
        }
        const userInfo = await userInfoResponse.json();
        log('Google user info received:', userInfo.email);
        
        // Authenticate with our backend
        log('Authenticating with backend...');
        log('Backend URL:', `${CONFIG.PAYMENT_API_URL}/auth/oauth`);
        const authResponse = await fetch(`${CONFIG.PAYMENT_API_URL}/auth/oauth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'google',
                googleToken: token,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture
            })
        });

        log('Backend response status:', authResponse.status);
        
        if (!authResponse.ok) {
            const errorText = await authResponse.text();
            logError('Backend auth error response:', errorText);
            throw new Error(`Backend authentication failed: ${authResponse.status} ${authResponse.statusText}`);
        }

        let authResult;
        try {
            const responseText = await authResponse.text();
            log('Raw backend response:', responseText.substring(0, 200));
            authResult = JSON.parse(responseText);
            log('Backend authentication successful');
        } catch (jsonError) {
            logError('Failed to parse JSON response:', jsonError.message);
            logError('Raw response that failed to parse:', responseText);
            throw new Error(`Backend returned invalid JSON: ${jsonError.message}`);
        }

        // Save auth state
        await setStorageValues({
            authToken: authResult.token,
            currentUser: authResult.user
        });

        // Sync data after successful authentication
        await syncUserDataInternal();
        
        await setStorageValues({ lastSyncTime: Date.now() });

        sendResponse({ success: true, user: authResult.user, message: authResult.message });

    } catch (error) {
        logError('Google OAuth error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle email sign in
 */
export async function handleEmailSignIn(request, sender, sendResponse) {
    try {
        const { email, password } = request;
        
        log('Email sign-in request to:', `${CONFIG.PAYMENT_API_URL}/auth/signin`);
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        log('Email sign-in response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            logError('Email sign-in error response:', errorText);
            throw new Error(`Sign in failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        log('Email sign-in successful');

        // Save auth state
        await setStorageValues({
            authToken: result.token,
            currentUser: result.user
        });

        // Sync data after successful authentication
        await syncUserDataInternal();
        
        await setStorageValues({ lastSyncTime: Date.now() });

        sendResponse({ success: true, user: result.user, message: result.message });

    } catch (error) {
        logError('Email signin error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle email sign up
 */
export async function handleEmailSignUp(request, sender, sendResponse) {
    try {
        const { email, password, name } = request;
        
        log('Email sign-up request to:', `${CONFIG.PAYMENT_API_URL}/auth/signup`);
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });

        log('Email sign-up response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            logError('Email sign-up error response:', errorText);
            throw new Error(`Sign up failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        log('Email sign-up successful');

        // Save auth state
        await setStorageValues({
            authToken: result.token,
            currentUser: result.user
        });

        // Sync data after successful authentication
        await syncUserDataInternal();
        
        await setStorageValues({ lastSyncTime: Date.now() });

        sendResponse({ success: true, user: result.user, message: result.message });

    } catch (error) {
        logError('Email signup error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle sign out
 */
export async function handleSignOut(request, sender, sendResponse) {
    try {
        const { currentUser } = await getStorageValues(['currentUser']);
        
        // Revoke Google token if present
        if (currentUser?.authType === 'google') {
            chrome.identity.removeCachedAuthToken({ token: null }, () => {});
        }

        // Clear ALL user-specific data to prevent token caching across accounts
        await chrome.storage.local.remove([
            'authToken', 
            'currentUser',
            'paidTokens',
            'aiUsageCount',
            'userId',
            'lastTokenSyncCount',
            'lastSyncTime',
            'registrationDate',
            'lastReplenishmentDate',
            'purchasedTokens'
        ]);

        log('User signed out and all user data cleared');
        sendResponse({ success: true, message: 'Signed out successfully' });

    } catch (error) {
        logError('Sign out error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle user data sync
 */
export async function handleSyncUserData(request, sender, sendResponse) {
    try {
        const result = await syncUserDataInternal();
        sendResponse({ success: true, data: result });
    } catch (error) {
        logError('Sync error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle restore purchases - only restores tokens if there's evidence of data loss
 */
export async function handleRestorePurchases(request, sender, sendResponse) {
    try {
        const result = await handleRestorePurchasesInternal();
        if (result) {
            if (result.tokensRestored > 0) {
                log(`Purchases restored: ${result.tokensRestored} tokens`);
            } else {
                log('Purchases checked: No restoration needed');
            }
            sendResponse({ success: true, data: result });
        } else {
            throw new Error('No purchases found or authentication required');
        }
    } catch (error) {
        logError('Restore purchases error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle get authentication status
 */
export async function handleGetAuthStatus(request, sender, sendResponse) {
    try {
        const { authToken, currentUser } = await getStorageValues(['authToken', 'currentUser']);
        
        if (!authToken || !currentUser) {
            sendResponse({ success: true, isAuthenticated: false, user: null });
            return;
        }

        // Validate token with backend
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/auth/validate`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            sendResponse({ success: true, isAuthenticated: true, user: result.user });
        } else {
            // Token invalid, clear ALL user data to prevent token caching
            await chrome.storage.local.remove([
                'authToken', 
                'currentUser',
                'paidTokens',
                'aiUsageCount',
                'userId',
                'lastTokenSyncCount',
                'lastSyncTime',
                'registrationDate',
                'lastReplenishmentDate',
                'purchasedTokens'
            ]);
            sendResponse({ success: true, isAuthenticated: false, user: null });
        }

    } catch (error) {
        logError('Auth status error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Internal function to sync user data with cloud
 */
export async function syncUserDataInternal() {
    const { authToken } = await getStorageValues(['authToken']);
    if (!authToken) return null;

    try {
        // Get local data
        const localData = await getStorageValues(['paidTokens', 'aiUsageCount', 'userId']);
        
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/user/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                localTokens: localData.paidTokens || 0,
                localUsage: localData.aiUsageCount || 0,
                localUserId: localData.userId
            })
        });

        const result = await response.json();
        if (response.ok) {
            // FIXED SYNC LOGIC - Preserves actual consumption, includes free credits
            const updatedData = {
                userId: result.userId
            };

            const localTokens = localData.paidTokens || 0;
            const cloudTokens = result.cloudTokens || 0;
            const totalPurchased = result.totalPurchased || 0;  // Only paid tokens purchased
            const localUsage = localData.aiUsageCount || 0;
            const cloudUsage = result.cloudUsage || 0;
            
            // Use the MAXIMUM usage to ensure tokens consumed locally are not lost
            const maxUsage = Math.max(localUsage, cloudUsage);
            updatedData.aiUsageCount = maxUsage;
            
            // CRITICAL FIX: Include 50 free credits in calculation
            // Total available = purchased tokens + 50 free credits
            const totalAvailable = totalPurchased + 50;
            const expectedRemainingTokens = Math.max(0, totalAvailable - maxUsage);
            
            // Always use expected remaining tokens to prevent consumption from being lost
            updatedData.paidTokens = expectedRemainingTokens;
            
            if (localTokens !== expectedRemainingTokens) {
                log(`Token sync: Correcting token count - local: ${localTokens}, expected: ${expectedRemainingTokens} (${totalPurchased} purchased + 50 free - ${maxUsage} used)`);
            } else {
                log(`Token sync: Token count correct at ${expectedRemainingTokens}`);
            }

            // Update local storage
            await setStorageValues(updatedData);
            
            // Update sync tracking to current count
            await setStorageValues({ 
                lastTokenSyncCount: updatedData.paidTokens,
                lastSyncTime: Date.now() 
            });
            
            log('Data synced with cloud - consumption preserved');
            return result;
        }

    } catch (error) {
        logError('Internal sync error:', error);
    }
    return null;
}

/**
 * Internal function to handle restore purchases without sending response
 * Now properly calculates remaining tokens instead of total purchased tokens
 */
export async function handleRestorePurchasesInternal() {
    try {
        const { authToken } = await getStorageValues(['authToken']);
        if (!authToken) {
            log('No auth token available for purchase restoration');
            return null;
        }

        // CRITICAL FIX: Sync current local usage to cloud FIRST
        // This ensures the API has the latest usage count for accurate calculation
        log('Syncing current local usage to cloud before restore...');
        await syncUserDataInternal();

        log('Calling restore purchases API...');
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/user/restore-purchases`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const result = await response.json();
        if (!response.ok) {
            logError('Restore purchases API error:', result.error);
            throw new Error(result.error || 'Failed to restore purchases');
        }

        log('Restore purchases API response:', {
            totalTokens: result.totalTokens,
            totalPurchased: result.totalPurchased,
            totalUsed: result.totalUsed,
            tokensRestored: result.tokensRestored,
            correctionMade: result.correctionMade,
            message: result.message
        });

        // Update local storage with the corrected remaining tokens
        await setStorageValues({
            paidTokens: result.totalTokens,
            lastTokenSyncCount: result.totalTokens
        });
        
        if (result.correctionMade) {
            if (result.tokensRestored > 0) {
                log(`Purchases restored internally: ${result.tokensRestored} tokens restored (${result.totalPurchased} purchased + ${result.freeCredits || 50} free - ${result.totalUsed} used = ${result.totalTokens} remaining)`);
            } else {
                log(`Token count corrected internally: Set to ${result.totalTokens} tokens (${result.totalPurchased} purchased + ${result.freeCredits || 50} free - ${result.totalUsed} used)`);
            }
        } else {
            log('Purchases checked internally: No correction needed, user has correct balance');
        }
        return result;

    } catch (error) {
        logError('Internal restore purchases error:', error);
        return null;
    }
}

/**
 * Auto-sync tokens on startup for authenticated users
 */
export async function handleStartupSync() {
    log('Extension startup, checking for token sync...');
    try {
        const { authToken, lastSyncTime } = await getStorageValues(['authToken', 'lastSyncTime']);
        if (authToken) {
            const now = Date.now();
            const timeSinceLastSync = now - (lastSyncTime || 0);
            
            if (timeSinceLastSync > CONFIG.SYNC_INTERVAL) {
                log('Authenticated user detected, syncing tokens...');
                await syncUserDataInternal();
                
                await setStorageValues({ lastSyncTime: now });
            } else {
                log('Skipping sync, too recent');
            }
        }
    } catch (error) {
        logError('Startup sync error:', error);
    }
}

/**
 * Handle first install sync
 */
export async function handleInstallSync(details) {
    log('Extension installed/updated, checking for token sync...');
    try {
        const { authToken } = await getStorageValues(['authToken']);
        if (authToken && details.reason === 'install') {
            log('First install with auth token, syncing tokens...');
            await syncUserDataInternal();
            await setStorageValues({ lastSyncTime: Date.now() });
        }
    } catch (error) {
        logError('Install sync error:', error);
    }
} 