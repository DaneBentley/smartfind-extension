// usage-tracking.js - Usage and token management

import { CONFIG, UNLIMITED_FREE_USERS } from './config.js';
import { getStorageValues, setStorageValues, log, logError } from './utils.js';

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
    let { paidTokens } = await getStorageValues(['paidTokens']);
    paidTokens = Math.max((paidTokens || 0) - 1, 0);
    await setStorageValues({ paidTokens });
    
    // Sync with cloud occasionally (every 10 token uses) to prevent data loss
    if (paidTokens % CONFIG.SYNC_TOKEN_INTERVAL === 0) {
        try {
            const { authToken } = await getStorageValues(['authToken']);
            if (authToken) {
                log('Syncing token usage to cloud...');
                const { syncUserDataInternal } = await import('./authentication.js');
                await syncUserDataInternal();
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
    await setStorageValues({ paidTokens });
}

/**
 * Checks if user has usage permissions (either within free tier or has paid tokens)
 * @returns {Promise<{canUse: boolean, isUnlimitedFree: boolean, usage: number, paidTokens: number}>}
 */
export async function checkUsagePermissions() {
    const usage = await getUsageCountPromise();
    const paidTokens = await getPaidTokensCountPromise();
    
    // Check if user is on unlimited free list
    let { userId } = await getStorageValues(['userId']);
    const isUnlimitedFree = userId && UNLIMITED_FREE_USERS.includes(userId);
    
    const canUse = isUnlimitedFree || usage < CONFIG.FREE_TIER_LIMIT || paidTokens > 0;
    
    return {
        canUse,
        isUnlimitedFree,
        usage,
        paidTokens
    };
}

/**
 * Handles usage counting after successful AI search
 * @param {boolean} isUnlimitedFree - Whether user has unlimited free access
 * @param {number} usage - Current usage count
 */
export async function handleSuccessfulSearch(isUnlimitedFree, usage) {
    // If user has exceeded free tier, use paid tokens (unless unlimited free)
    if (!isUnlimitedFree && usage >= CONFIG.FREE_TIER_LIMIT) {
        await decrementPaidTokens();
    } else {
        await incrementUsageCount();
    }
} 