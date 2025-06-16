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
export async function addPaidTokens(amount) {
    let { paidTokens } = await getStorageValues(['paidTokens']);
    paidTokens = (paidTokens || 0) + amount;
    await setStorageValues({ 
        paidTokens,
        lastTokenSyncCount: paidTokens // Initialize sync tracking to current count
    });
}

/**
 * Checks if user has usage permissions (either within free tier or has paid tokens)
 * @returns {Promise<{canUse: boolean, isUnlimitedFree: boolean, usage: number, paidTokens: number}>}
 */
export async function checkUsagePermissions() {
    const usage = await getUsageCountPromise();
    let paidTokens = await getPaidTokensCountPromise();
    
    // Check if user is on unlimited free list
    let { userId } = await getStorageValues(['userId']);
    const isUnlimitedFree = userId && UNLIMITED_FREE_USERS.includes(userId);
    
    // FIXED: Ensure new users automatically get their 50 free credits
    // If user has no tokens and no usage, they should get their free credits
    if (paidTokens === 0 && usage === 0) {
        log('New user detected, granting 50 free credits');
        await addPaidTokens(50);
        paidTokens = 50;
    }
    
    // SIMPLIFIED LOGIC: Everyone gets 50 free credits as tokens
    // No more tracking free vs paid separately
    const canUse = isUnlimitedFree || paidTokens > 0;
    
    return {
        canUse,
        isUnlimitedFree,
        usage,
        paidTokens
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