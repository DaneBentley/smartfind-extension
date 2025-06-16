// payment.js - Payment and token purchase handling

import { CONFIG } from './config.js';
import { getStorageValues, setStorageValues, getOrCreateUserId, log, logError } from './utils.js';
import { addPaidTokens } from './usage-tracking.js';
import { syncUserDataInternal, handleRestorePurchasesInternal } from './authentication.js';

/**
 * Handles token purchase requests.
 */
export async function handleTokenPurchase(request, sender, sendResponse) {
    try {
        // Generate a unique user ID if not exists
        const userId = await getOrCreateUserId();

        // Get auth token if available
        const { authToken } = await getStorageValues(['authToken']);
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Get the custom amount from the request (default to $10 if not provided)
        const amount = request.amount || 10;
        log('Background: Processing payment with amount:', amount);
        log('Background: Full request:', JSON.stringify(request, null, 2));

        // Call your payment API with custom amount
        log('Background: Making API request to:', `${CONFIG.PAYMENT_API_URL}/purchase-tokens`);
        log('Background: Request headers:', headers);
        log('Background: Request body:', JSON.stringify({ userId, amount }));
        
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/purchase-tokens`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ userId, amount })
        });

        log('Background: API response status:', response.status);
        log('Background: API response headers:', [...response.headers.entries()]);

        if (!response.ok) {
            const errorText = await response.text();
            logError('Background: API error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        log('Background: API success response:', result);
        
        if (result.url) {
            // Redirect to Stripe checkout
            chrome.tabs.create({ url: result.url });
            sendResponse({ success: true, message: "Redirecting to payment..." });
        } else if (result.sessionId) {
            // Fallback: construct URL manually
            chrome.tabs.create({ url: `https://checkout.stripe.com/c/pay/${result.sessionId}` });
            sendResponse({ success: true, message: "Redirecting to payment..." });
        } else {
            sendResponse({ error: result.error || "Failed to create payment session" });
        }
    } catch (error) {
        logError('Token purchase error:', error);
        logError('PAYMENT_API_URL:', CONFIG.PAYMENT_API_URL);
        logError('Error details:', error.message);
        logError('Error stack:', error.stack);
        
        // Provide more specific error messages
        let errorMessage = "Payment system temporarily unavailable";
        if (error.message.includes('Failed to fetch')) {
            errorMessage = "Network error: Unable to connect to payment system. Please check your internet connection.";
        } else if (error.message.includes('CORS')) {
            errorMessage = "CORS error: Payment system configuration issue.";
        } else if (error.message.includes('HTTP 4')) {
            errorMessage = "Payment request error: " + error.message;
        } else if (error.message.includes('HTTP 5')) {
            errorMessage = "Payment server error: " + error.message;
        }
        
        sendResponse({ 
            error: errorMessage,
            details: error.message,
            url: CONFIG.PAYMENT_API_URL,
            stack: error.stack
        });
    }
}

/**
 * Handle API connectivity test
 */
export async function handleTestAPI(request, sender, sendResponse) {
    try {
        log('Testing API connectivity...');
        
        const response = await fetch(`${CONFIG.PAYMENT_API_URL}/test-payment`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        log('Test API response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        log('Test API success:', result);
        
        sendResponse({ 
            success: true, 
            message: 'API connectivity test successful',
            data: result
        });

    } catch (error) {
        logError('API test error:', error);
        sendResponse({ 
            success: false, 
            error: error.message,
            details: 'Failed to connect to payment API'
        });
    }
}

/**
 * Handle purchase completion notification
 */
export async function handlePurchaseCompleted(request, sender, sendResponse) {
    try {
        log('Purchase completed, syncing user data...');
        
        // First try to sync authenticated user data
        const syncResult = await syncUserDataInternal();
        
        if (syncResult) {
            log('Authenticated user data synced after purchase');
            sendResponse({ success: true, message: 'Tokens synced successfully' });
        } else {
            // For anonymous purchases, try to restore purchases using the session ID
            log('No auth token, attempting anonymous purchase restoration...');
            
            if (request.sessionId) {
                try {
                    // Call the restore purchases API for anonymous users
                    const response = await fetch(`${CONFIG.PAYMENT_API_URL}/restore-anonymous-purchase`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            sessionId: request.sessionId,
                            userId: await getOrCreateUserId()
                        })
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        if (result.tokensAdded > 0) {
                            await addPaidTokens(result.tokensAdded);
                            log(`Added ${result.tokensAdded} tokens from anonymous purchase`);
                            sendResponse({ success: true, message: `Added ${result.tokensAdded} tokens successfully` });
                            return;
                        }
                    }
                } catch (error) {
                    logError('Anonymous purchase restoration failed:', error);
                }
            }
            
            // Fallback: trigger a general restore purchases
            try {
                const restoreResult = await handleRestorePurchasesInternal();
                if (restoreResult && restoreResult.totalTokens > 0) {
                    log('Tokens restored via general restore');
                    sendResponse({ success: true, message: 'Tokens restored successfully' });
                } else {
                    sendResponse({ success: true, message: 'Purchase completed (anonymous)' });
                }
            } catch (error) {
                logError('General restore failed:', error);
                sendResponse({ success: true, message: 'Purchase completed (anonymous)' });
            }
        }
    } catch (error) {
        logError('Purchase completion error:', error);
        sendResponse({ success: false, error: error.message });
    }
} 