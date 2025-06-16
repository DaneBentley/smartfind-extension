// utils.js - Utility functions

import { RESTRICTED_URL_PATTERNS, AI_INDICATORS, KEYWORD_INDICATORS } from './config.js';

/**
 * Checks if a URL is restricted for content script injection
 * @param {string} url - The URL to check
 * @returns {boolean} - True if the URL is restricted
 */
export function isRestrictedUrl(url) {
    return RESTRICTED_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Determines if a query should use AI or keyword search
 * @param {string} query The user's search query
 * @returns {boolean} True if should use AI, false for keyword search
 */
export function shouldUseAI(query) {
    // Check for AI indicators first
    const hasAIIndicators = AI_INDICATORS.some(pattern => pattern.test(query));
    
    // If no AI indicators, check if it's a simple keyword
    if (!hasAIIndicators) {
        const isSimpleKeyword = KEYWORD_INDICATORS.some(pattern => pattern.test(query));
        if (isSimpleKeyword && query.split(' ').length <= 2) {
            return false; // Use keyword search
        }
    }
    
    return hasAIIndicators || query.split(' ').length > 3;
}

/**
 * Get or create a user ID
 */
export async function getOrCreateUserId() {
    let { userId } = await chrome.storage.local.get('userId');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await chrome.storage.local.set({ userId });
    }
    return userId;
}

/**
 * Promise wrapper for chrome.storage.local.get with a single key
 * @param {string} key - Storage key to retrieve
 * @returns {Promise<any>} - The stored value
 */
export function getStorageValue(key) {
    return new Promise(resolve => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key]);
        });
    });
}

/**
 * Promise wrapper for chrome.storage.local.get with multiple keys
 * @param {string[]} keys - Storage keys to retrieve
 * @returns {Promise<object>} - Object with retrieved values
 */
export function getStorageValues(keys) {
    return new Promise(resolve => {
        chrome.storage.local.get(keys, resolve);
    });
}

/**
 * Promise wrapper for chrome.storage.local.set
 * @param {object} items - Object with key-value pairs to store
 * @returns {Promise<void>}
 */
export function setStorageValues(items) {
    return new Promise(resolve => {
        chrome.storage.local.set(items, resolve);
    });
}

/**
 * Show error badge on extension icon
 * @param {number} tabId - Tab ID to show badge on
 * @param {string} text - Badge text
 * @param {number} duration - How long to show the badge (ms)
 */
export function showErrorBadge(tabId, text = '!', duration = 3000) {
    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ff4444', tabId });
    setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId });
    }, duration);
}

/**
 * Clear badge on extension icon
 * @param {number} tabId - Tab ID to clear badge on
 */
export function clearBadge(tabId) {
    chrome.action.setBadgeText({ text: '', tabId });
}

// Production-safe logging
const isDevelopment = false; // Set to false for production

/**
 * Log with SmartFind prefix
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments
 */
export function log(message, ...args) {
    if (isDevelopment) {
        console.log(`SmartFind: ${message}`, ...args);
    }
    // Always log errors to console for debugging support issues
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
        console.warn(`SmartFind: ${message}`, ...args);
    }
}

/**
 * Log error with SmartFind prefix
 * @param {string} message - Error message
 * @param {...any} args - Additional arguments
 */
export function logError(message, ...args) {
    console.error(`SmartFind: ${message}`, ...args);
}

/**
 * Log warning with SmartFind prefix
 * @param {string} message - Warning message
 * @param {...any} args - Additional arguments
 */
export function logWarning(message, ...args) {
    console.warn(`SmartFind: ${message}`, ...args);
} 