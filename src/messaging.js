// messaging.js - Message handling and content script communication

import { CONFIG } from './config.js';
import { isRestrictedUrl, getOrCreateUserId, showErrorBadge, clearBadge, log, logWarning, logError } from './utils.js';
import { getUsageCount, getPaidTokensCount, addPaidTokens, getReplenishmentCountdown, checkAndHandleMonthlyReplenishment } from './usage-tracking.js';
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
import { handleTokenPurchase, handlePurchaseCompleted } from './payment.js';
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
            
            case "getReplenishmentCountdown":
                handleGetReplenishmentCountdown(request, sendResponse);
                return true;
            
            case "checkMonthlyReplenishment":
                handleCheckMonthlyReplenishment(request, sendResponse);
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
            
            case "contentScriptReady":
                handleContentScriptReady(request, sender, sendResponse);
                return true;
            
            case "showCreditErrorBadge":
                handleShowCreditErrorBadge(request, sender, sendResponse);
                return true;
            
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
    await addPaidTokens(request.amount, request.isPurchased || false);
    sendResponse({ success: true });
}

/**
 * Handle getting replenishment countdown
 */
async function handleGetReplenishmentCountdown(request, sendResponse) {
    try {
        const countdown = await getReplenishmentCountdown();
        sendResponse({ success: true, countdown });
    } catch (error) {
        logError('Get replenishment countdown error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle checking monthly replenishment
 */
async function handleCheckMonthlyReplenishment(request, sendResponse) {
    try {
        const result = await checkAndHandleMonthlyReplenishment();
        sendResponse({ success: true, result });
    } catch (error) {
        logError('Check monthly replenishment error:', error);
        sendResponse({ success: false, error: error.message });
    }
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
 * Handle content script ready signal
 */
function handleContentScriptReady(request, sender, sendResponse) {
    // This is just a courtesy signal from content script to establish connection
    // Log it for debugging but don't spam the console
    if (sender.tab) {
        log(`Content script ready on tab ${sender.tab.id}: ${sender.tab.url}`);
    }
    sendResponse({ success: true, acknowledged: true });
}

/**
 * Handle showing credit error badge
 */
function handleShowCreditErrorBadge(request, sender, sendResponse) {
    const tabId = request.tabId || (sender && sender.tab ? sender.tab.id : null);
    if (tabId) {
        showErrorBadge(tabId, '💳', CONFIG.BADGE_DISPLAY_DURATION * 2); // Show longer for credit errors
        log(`Showing credit error badge on tab ${tabId}`);
    }
    sendResponse({ success: true });
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
                // Only log warning if it's not a common connection error
                const error = chrome.runtime.lastError.message;
                if (!error.includes('Could not establish connection') && !error.includes('Receiving end does not exist')) {
                    logWarning('Content script not ready, attempting to inject...', error);
                }
                // Try to inject the content script if it's not loaded
                injectContentScriptAndRetry(tabId, message);
            } else if (response && response.ready) {
                log('Content script is ready, sending message');
                // Content script is ready, send the actual message
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        const error = chrome.runtime.lastError.message;
                        if (!error.includes('Could not establish connection') && !error.includes('Receiving end does not exist')) {
                            logError('Error sending message to ready content script:', error);
                        }
                    } else {
                        log('Message sent successfully to content script');
                        // Clear any error badge
                        clearBadge(tabId);
                    }
                });
            } else {
                log('Content script ping failed, attempting injection');
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
        // Inject the content script
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        // Inject the CSS
        await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['styles.css']
        });
        
        log('Content script injected successfully');
        
        // Wait a moment for the script to initialize, then retry
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    if (!error.includes('Could not establish connection') && !error.includes('Receiving end does not exist')) {
                        logError('Failed to send message after injection:', error);
                    }
                    // Try one more time with a longer delay
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, message, (response) => {
                            if (chrome.runtime.lastError) {
                                const error = chrome.runtime.lastError.message;
                                if (!error.includes('Could not establish connection') && !error.includes('Receiving end does not exist')) {
                                    logError('Final attempt failed:', error);
                                }
                            } else {
                                log('Message sent successfully on final attempt');
                            }
                        });
                    }, CONFIG.CONTENT_SCRIPT_RETRY_DELAY);
                } else {
                    log('Message sent successfully after injection');
                }
            });
        }, CONFIG.CONTENT_SCRIPT_INJECTION_DELAY);
        
    } catch (injectionError) {
        logError('Failed to inject content script:', injectionError);
        // Show error badge
        showErrorBadge(tabId, '✗', CONFIG.BADGE_DISPLAY_DURATION);
    }
} 