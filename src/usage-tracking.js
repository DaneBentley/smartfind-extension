// usage-tracking.js - Usage and token management

import { CONFIG, UNLIMITED_FREE_USERS } from './config.js';
import { getStorageValues, setStorageValues, log, logError } from './utils.js';
import { syncUserDataInternal } from './authentication.js';

/**
 * Gets the current API usage count from chrome.storage.
 */
export function getUsageCount(callback) {
    chrome.storage.local.get(['aiUsageCount'], (result) => {
        callback(result.aiUsageCount || 0);
    });
}

/**
 * Promise-based version of getUsageCount.
 */
export function getUsageCountPromise() {
    return new Promise(resolve => {
        chrome.storage.local.get(['aiUsageCount'], (result) => {
            resolve(result.aiUsageCount || 0);
        });
    });
}

/**
 * Increments the API usage count in chrome.storage.
 */
export async function incrementUsageCount() {
    let { aiUsageCount } = await getStorageValues(['aiUsageCount']);
    aiUsageCount = (aiUsageCount || 0) + 1;
    await setStorageValues({ aiUsageCount });
}

/**
 * Gets the current paid tokens count from chrome.storage.
 */
export function getPaidTokensCount(callback) {
    chrome.storage.local.get(['paidTokens'], (result) => {
        callback(result.paidTokens || 0);
    });
}

/**
 * Promise-based version of getPaidTokensCount.
 */
export function getPaidTokensCountPromise() {
    return new Promise(resolve => {
        chrome.storage.local.get(['paidTokens'], (result) => {
            resolve(result.paidTokens || 0);
        });
    });
}

/**
 * Checks and handles monthly token replenishment
 * Every 30 days after registration, users get replenished to 50 free tokens
 */
export async function checkAndHandleMonthlyReplenishment() {
    try {
        const { 
            registrationDate, 
            lastReplenishmentDate, 
            paidTokens, 
            authToken,
            currentUser 
        } = await getStorageValues([
            'registrationDate', 
            'lastReplenishmentDate', 
            'paidTokens', 
            'authToken',
            'currentUser'
        ]);

        // Only proceed if user is authenticated
        if (!authToken || !currentUser) {
            log('User not authenticated - skipping replenishment check');
            return { replenished: false, daysUntilNext: null };
        }

        const now = Date.now();
        const regDate = registrationDate || now;
        const lastReplen = lastReplenishmentDate || regDate;
        
        // If no registration date exists, set it now
        if (!registrationDate) {
            await setStorageValues({ registrationDate: now });
            log('Registration date set for authenticated user');
        }

        // Calculate days since registration and last replenishment
        const daysSinceRegistration = (now - regDate) / (1000 * 60 * 60 * 24);
        const daysSinceLastReplenishment = (now - lastReplen) / (1000 * 60 * 60 * 24);
        
        // Check if 30 days have passed since last replenishment
        if (daysSinceLastReplenishment >= 30) {
            const currentTokens = paidTokens || 0;
            
            // Calculate how many tokens were purchased (above the base 50 free)
            // We need to track purchased tokens separately to implement proper replenishment
            const { purchasedTokens = 0 } = await getStorageValues(['purchasedTokens']);
            
            // Ensure user has at least 50 free tokens
            // The new total should be: purchasedTokens + 50 (replenished free tokens)
            const newFreeTokens = 50;
            const newTotal = purchasedTokens + newFreeTokens;
            
            // Only update if the user has fewer than expected
            if (currentTokens < newTotal) {
                const tokensToAdd = newTotal - currentTokens;
                
                await setStorageValues({
                    paidTokens: newTotal,
                    lastReplenishmentDate: now,
                    lastTokenSyncCount: newTotal
                });
                
                log(`Monthly replenishment: Replenished to 50 free tokens (added ${tokensToAdd}, total: ${newTotal})`);
                return { 
                    replenished: true, 
                    tokensAdded: tokensToAdd,
                    newTotal: newTotal,
                    daysUntilNext: 30 
                };
            } else {
                // Update replenishment date even if no tokens were added
                await setStorageValues({ lastReplenishmentDate: now });
                log('Monthly replenishment: Already at or above expected tokens');
                return { replenished: false, daysUntilNext: 30 };
            }
        }
        
        // Calculate days until next replenishment
        const daysUntilNext = Math.ceil(30 - daysSinceLastReplenishment);
        return { replenished: false, daysUntilNext: Math.max(daysUntilNext, 0) };
        
    } catch (error) {
        logError('Monthly replenishment check error:', error);
        return { replenished: false, daysUntilNext: null };
    }
}

/**
 * Gets replenishment countdown information
 */
export async function getReplenishmentCountdown() {
    try {
        const { 
            registrationDate, 
            lastReplenishmentDate, 
            authToken,
            currentUser 
        } = await getStorageValues([
            'registrationDate', 
            'lastReplenishmentDate', 
            'authToken',
            'currentUser'
        ]);

        // Return null if user is not authenticated
        if (!authToken || !currentUser) {
            return null;
        }

        const now = Date.now();
        const regDate = registrationDate || now;
        const lastReplen = lastReplenishmentDate || regDate;
        
        const daysSinceLastReplenishment = (now - lastReplen) / (1000 * 60 * 60 * 24);
        const daysUntilNext = Math.ceil(30 - daysSinceLastReplenishment);
        
        return {
            daysUntilNext: Math.max(daysUntilNext, 0),
            hoursUntilNext: Math.max(Math.ceil((30 * 24) - (daysSinceLastReplenishment * 24)), 0)
        };
    } catch (error) {
        logError('Get replenishment countdown error:', error);
        return null;
    }
}

/**
 * Decrements the paid tokens count in chrome.storage.
 */
export async function decrementPaidTokens() {
    let { paidTokens, lastTokenSyncCount } = await getStorageValues(['paidTokens', 'lastTokenSyncCount']);
    paidTokens = Math.max((paidTokens || 0) - 1, 0);
    await setStorageValues({ paidTokens });
    
    // Sync with cloud occasionally to prevent data loss
    // Track how many tokens have been consumed since last sync
    const lastSyncCount = lastTokenSyncCount || 0;
    const tokensSinceLastSync = lastSyncCount - paidTokens;
    
    if (tokensSinceLastSync >= CONFIG.SYNC_TOKEN_INTERVAL) {
        try {
            const { authToken } = await getStorageValues(['authToken']);
            if (authToken) {
                log(`Syncing token usage to cloud (${tokensSinceLastSync} tokens consumed since last sync)...`);
                await syncUserDataInternal();
                
                // Update the sync tracking counter to current token count
                await setStorageValues({ lastTokenSyncCount: paidTokens });
            }
        } catch (error) {
            logError('Token sync error:', error);
        }
    }
}

/**
 * Adds paid tokens to the user's account.
 */
export async function addPaidTokens(amount, isPurchased = false) {
    let { paidTokens, purchasedTokens = 0 } = await getStorageValues(['paidTokens', 'purchasedTokens']);
    paidTokens = (paidTokens || 0) + amount;
    
    // Track purchased tokens separately for proper replenishment logic
    if (isPurchased) {
        purchasedTokens += amount;
    }
    
    await setStorageValues({ 
        paidTokens,
        purchasedTokens,
        lastTokenSyncCount: paidTokens // Initialize sync tracking to current count
    });
}

/**
 * Checks if user has usage permissions (requires authentication for AI features)
 * @returns {Promise<{canUse: boolean, isUnlimitedFree: boolean, usage: number, paidTokens: number, needsAuth: boolean}>}
 */
export async function checkUsagePermissions() {
    const usage = await getUsageCountPromise();
    let paidTokens = await getPaidTokensCountPromise();
    
    // Check authentication status
    const { authToken, currentUser, userId } = await getStorageValues(['authToken', 'currentUser', 'userId']);
    const isAuthenticated = !!(authToken && currentUser);
    
    // Require authentication for AI features
    if (!isAuthenticated) {
        return {
            canUse: false,
            isUnlimitedFree: false,
            usage,
            paidTokens,
            needsAuth: true
        };
    }
    
    // Check monthly replenishment for authenticated users
    await checkAndHandleMonthlyReplenishment();
    
    // Re-fetch tokens after potential replenishment
    const updatedData = await getStorageValues(['paidTokens']);
    paidTokens = updatedData.paidTokens || 0;
    
    // Check if user is on unlimited free list
    const isUnlimitedFree = userId && UNLIMITED_FREE_USERS.includes(userId);
    
    // FIXED: Ensure new authenticated users automatically get their 50 free credits
    // If user has no tokens and no usage, they should get their free credits
    if (paidTokens === 0 && usage === 0) {
        log('New authenticated user detected, granting 50 free credits');
        await addPaidTokens(50);
        paidTokens = 50;
        
        // Set registration date for new users
        const { registrationDate } = await getStorageValues(['registrationDate']);
        if (!registrationDate) {
            await setStorageValues({ 
                registrationDate: Date.now(),
                lastReplenishmentDate: Date.now()
            });
        }
    }
    
    // SIMPLIFIED LOGIC: Everyone gets 50 free credits as tokens
    // No more tracking free vs paid separately
    const canUse = isUnlimitedFree || paidTokens > 0;
    
    return {
        canUse,
        isUnlimitedFree,
        usage,
        paidTokens,
        needsAuth: false
    };
}

/**
 * Handles usage counting after successful AI search
 * FIXED: Increment usage counter AND decrement tokens
 * @param {boolean} isUnlimitedFree - Whether user has unlimited free access
 * @param {number} usage - Current usage count (legacy, not used in new system)
 */
export async function handleSuccessfulSearch(isUnlimitedFree, usage) {
    // Always increment usage counter to track total searches
    await incrementUsageCount();
    
    // Decrement tokens for non-unlimited users
    if (!isUnlimitedFree) {
        await decrementPaidTokens();
    }
} 