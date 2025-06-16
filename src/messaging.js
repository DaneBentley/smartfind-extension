// messaging.js - Message handling and content script communication

import { CONFIG } from './config.js';
import { isRestrictedUrl, getOrCreateUserId, showErrorBadge, clearBadge, log, logWarning, logError } from './utils.js';
import { getUsageCount, getPaidTokensCount, addPaidTokens } from './usage-tracking.js';
import { handleAISearch, handleKeywordSearch } from './ai-search.js';
import { 
    handleGoogleSignIn, 
    handleEmailSignIn, 
    handleEmailSignUp, 
    handleSignOut, 
    handleSyncUserData, 
    handleRestorePurchases, 
    handleGetAuthStatus 
} from './authentication.js';
import { handleTokenPurchase, handleTestAPI, handlePurchaseCompleted } from './payment.js';
import { UNLIMITED_FREE_USERS } from './config.js';

/**
 * Main message listener that routes requests to appropriate handlers
 */
export function setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        log('Message received from content script:', request.action);
        
        // Route messages to appropriate handlers
        switch (request.action) {
            case "performAISearch":
                handleAISearch(request, sender, sendResponse);
                return true;
            
            case "performKeywordSearch":
                handleKeywordSearch(request, sender, sendResponse);
                return true;
            
            case "getUsage":
                getUsageCount(sendResponse);
                return true;
            
            case "purchaseTokens":
                handleTokenPurchase(request, sender, sendResponse);
                return true;
            
            case "getPaidTokens":
                getPaidTokensCount(sendResponse);
                return true;
            
            case "addTokens":
                handleAddTokens(request, sendResponse);
                return true;
            
            case "addTestTokens":
                handleAddTestTokens(request, sendResponse);
                return true;
            
            case "getMyUserId":
                handleGetMyUserId(request, sendResponse);
                return true;
            
            case "signInWithGoogle":
                handleGoogleSignIn(request, sender, sendResponse);
                return true;
            
            case "signInWithEmail":
                handleEmailSignIn(request, sender, sendResponse);
                return true;
            
            case "signUpWithEmail":
                handleEmailSignUp(request, sender, sendResponse);
                return true;
            
            case "signOut":
                handleSignOut(request, sender, sendResponse);
                return true;
            
            case "syncUserData":
                handleSyncUserData(request, sender, sendResponse);
                return true;
            
            case "restorePurchases":
                handleRestorePurchases(request, sender, sendResponse);
                return true;
            
            case "getAuthStatus":
                handleGetAuthStatus(request, sender, sendResponse);
                return true;
            
            case "openPopup":
                handleOpenPopup(request, sender, sendResponse);
                return true;
            
            case "purchaseCompleted":
                handlePurchaseCompleted(request, sender, sendResponse);
                return true;
            
            case "testAPI":
                handleTestAPI(request, sender, sendResponse);
                return true;
            
            case "contentScriptReady":
                // Content script is announcing it's ready - just acknowledge
                log('Content script ready on tab:', sender.tab?.id || 'unknown');
                sendResponse({ success: true });
                return false;
                
            default:
                logWarning('Unknown message action:', request.action);
                sendResponse({ success: false, error: 'Unknown action' });
                return false;
        }
    });
}

/**
 * Handle adding tokens to user account
 */
async function handleAddTokens(request, sendResponse) {
    await addPaidTokens(request.amount);
    sendResponse({ success: true });
}

/**
 * Handle adding test tokens (development/testing function)
 */
async function handleAddTestTokens(request, sendResponse) {
    await addPaidTokens(1000);
    sendResponse({ success: true, message: "Added 1000 test tokens" });
}

/**
 * Handle getting current user ID for whitelist purposes
 */
async function handleGetMyUserId(request, sendResponse) {
    const userId = await getOrCreateUserId();
    const isUnlimitedFree = UNLIMITED_FREE_USERS.includes(userId);
    sendResponse({ userId: userId, isUnlimitedFree: isUnlimitedFree });
}

/**
 * Handle opening the extension popup
 */
async function handleOpenPopup(request, sender, sendResponse) {
    try {
        // Note: chrome.action.openPopup() is not available in Manifest V3
        // The popup will open when user clicks the extension icon
        // This handler just acknowledges the request
        sendResponse({ success: true, message: 'Please click the SmartFind extension icon to open the popup' });
    } catch (error) {
        logError('Open popup error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Sends a message to content script with improved error handling
 * @param {number} tabId - The tab ID to send the message to
 * @param {object} message - The message to send
 */
export async function sendMessageToContentScript(tabId, message) {
    try {
        // First check if the tab is valid and accessible
        const tab = await chrome.tabs.get(tabId);
        
        // Check if the URL is restricted
        if (isRestrictedUrl(tab.url)) {
            logWarning('Cannot inject into restricted URL:', tab.url);
            // Optionally show a notification to the user
            showErrorBadge(tabId, '!', CONFIG.BADGE_DISPLAY_DURATION);
            return;
        }

        // First ping to check if content script is ready
        chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
            if (chrome.runtime.lastError) {
                logWarning('Content script not ready, attempting to inject...', chrome.runtime.lastError.message);
                // Try to inject the content script if it's not loaded
                injectContentScriptAndRetry(tabId, message);
            } else if (response && response.ready) {
                log('Content script is ready, sending message');
                // Content script is ready, send the actual message
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        logError('Error sending message to ready content script:', chrome.runtime.lastError.message);
                    } else {
                        log('Message sent successfully to content script');
                        // Clear any error badge
                        clearBadge(tabId);
                    }
                });
            } else {
                logWarning('Content script ping failed, attempting injection');
                injectContentScriptAndRetry(tabId, message);
            }
        });
    } catch (error) {
        logError('Error getting tab info:', error);
    }
}

/**
 * Attempts to inject content script and retry sending the message
 * @param {number} tabId - The tab ID
 * @param {object} message - The message to send after injection
 */
async function injectContentScriptAndRetry(tabId, message) {
    try {
        // For ES modules, we cannot inject via chrome.scripting.executeScript
        // The content script should be automatically registered via manifest.json
        // If it's not loading, it's likely due to a page restriction or timing issue
        
        logWarning('Content script not found - may be due to page restrictions or timing');
        logWarning('ES modules are registered declaratively and cannot be manually injected');
        
        // Try refreshing the tab to trigger content script registration
        const tab = await chrome.tabs.get(tabId);
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
            // Wait a bit longer for ES modules to load, then retry
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
                    if (chrome.runtime.lastError) {
                        logError('Content script still not available after waiting');
                        logError('Try reloading the page to trigger content script registration');
                        showErrorBadge(tabId, '!', CONFIG.BADGE_DISPLAY_DURATION);
                    } else if (response && response.ready) {
                        log('Content script is now ready, sending message');
                        chrome.tabs.sendMessage(tabId, message, (response) => {
                            if (chrome.runtime.lastError) {
                                logError('Error sending message:', chrome.runtime.lastError.message);
                            } else {
                                log('Message sent successfully');
                                clearBadge(tabId);
                            }
                        });
                    }
                });
            }, CONFIG.CONTENT_SCRIPT_INJECTION_DELAY * 2); // Wait longer for ES modules
        } else {
            logWarning('Cannot run content script on restricted URL:', tab.url);
            showErrorBadge(tabId, '!', CONFIG.BADGE_DISPLAY_DURATION);
        }
        
    } catch (injectionError) {
        logError('Failed to handle content script injection:', injectionError);
        showErrorBadge(tabId, '✗', CONFIG.BADGE_DISPLAY_DURATION);
    }
} 