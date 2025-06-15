// background.js

// --- Globals ---
const FREE_TIER_LIMIT = 50;
// Use stable Vercel alias that won't change
const API_BASE_URL = 'https://smartfind-extension-ffbscu551.vercel.app';
const PAYMENT_API_URL = `${API_BASE_URL}/api`;

// Whitelist of user IDs that get unlimited free usage
const UNLIMITED_FREE_USERS = [
    // Add your personal user IDs here
    // 'user_1234567890_abcdef123',  // Example format
];

console.log('SmartFind: Background script loaded');

// --- Action Click Listener ---
// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    console.log('SmartFind: Extension icon clicked, tab:', tab.id);
    if (tab.id) {
        sendMessageToContentScript(tab.id, { action: "toggleUI" });
    }
});

// --- Command Listener ---
// Listen for the keyboard shortcut to activate the extension
chrome.commands.onCommand.addListener((command) => {
    console.log('SmartFind: Command received:', command);
    if (command === "toggle-smartfind") {
        // Send a message to the active tab's content script to toggle the search UI
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                console.log('SmartFind: Sending toggle message to tab:', tabs[0].id);
                sendMessageToContentScript(tabs[0].id, { action: "toggleUI" });
            }
        });
    }
});

// --- Message Listener from Content Script ---
// Handles requests from the content script (e.g., performing an AI search)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('SmartFind: Message received from content script:', request.action);
    
    if (request.action === "performAISearch") {
        handleAISearch(request, sender, sendResponse);
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === "performKeywordSearch") {
        handleKeywordSearch(request, sender, sendResponse);
        return true;
    } else if (request.action === "getUsage") {
        getUsageCount(sendResponse);
        return true;
    } else if (request.action === "purchaseTokens") {
        handleTokenPurchase(request, sender, sendResponse);
        return true;
    } else if (request.action === "getPaidTokens") {
        getPaidTokensCount(sendResponse);
        return true;
    } else if (request.action === "addTokens") {
        addPaidTokens(request.amount);
        sendResponse({ success: true });
        return true;
    } else if (request.action === "addTestTokens") {
        // Temporary development/testing function
        (async () => {
            await addPaidTokens(1000);
            sendResponse({ success: true, message: "Added 1000 test tokens" });
        })();
        return true;
    } else if (request.action === "getMyUserId") {
        // Helper to get current user ID for whitelist
        (async () => {
            let { userId } = await chrome.storage.local.get('userId');
            if (!userId) {
                userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                await chrome.storage.local.set({ userId });
            }
            sendResponse({ userId: userId, isUnlimitedFree: UNLIMITED_FREE_USERS.includes(userId) });
        })();
        return true;
    } else if (request.action === "signInWithGoogle") {
        handleGoogleSignIn(request, sender, sendResponse);
        return true;
    } else if (request.action === "signInWithEmail") {
        handleEmailSignIn(request, sender, sendResponse);
        return true;
    } else if (request.action === "signUpWithEmail") {
        handleEmailSignUp(request, sender, sendResponse);
        return true;
    } else if (request.action === "signOut") {
        handleSignOut(request, sender, sendResponse);
        return true;
    } else if (request.action === "syncUserData") {
        handleSyncUserData(request, sender, sendResponse);
        return true;
    } else if (request.action === "restorePurchases") {
        handleRestorePurchases(request, sender, sendResponse);
        return true;
    } else if (request.action === "getAuthStatus") {
        handleGetAuthStatus(request, sender, sendResponse);
        return true;
    } else if (request.action === "openPopup") {
        handleOpenPopup(request, sender, sendResponse);
        return true;
    }
});

/**
 * Determines if a query should use AI or keyword search
 * @param {string} query The user's search query
 * @returns {boolean} True if should use AI, false for keyword search
 */
function shouldUseAI(query) {
    // Use AI for natural language questions and complex queries
    const aiIndicators = [
        // Question words
        /^(what|where|when|why|how|who|which|can|does|is|are|will|would|should)/i,
        // Natural language patterns
        /\b(explain|describe|find|show|tell me|about|regarding|concerning)\b/i,
        // Summarization and analysis intents
        /\b(tldr|tl;dr|tl dr|summary|summarize|summarise|in a nutshell|key takeaway|key takeaways|main point|main points|gist|essence|overview|recap|brief|highlights|important|crucial|significant|notable|bottom line|core|central|primary|fundamental)\b/i,
        // Intent phrases for summaries
        /\b(give me the|what's the|whats the).*(summary|gist|main point|key|important|essence)\b/i,
        // Analysis and understanding intents
        /\b(analyze|analyse|break down|interpret|meaning|significance|implication|conclusion|insight|understanding|perspective)\b/i,
        // Complex phrases (more than 3 words with common connecting words)
        /\b(and|or|but|with|without|that|which|where|when)\b.*\b(and|or|but|with|without|that|which|where|when)\b/i
    ];
    
    // Don't use AI for simple keyword searches
    const keywordIndicators = [
        // Single words or simple phrases
        /^[\w\s]{1,15}$/,
        // Technical terms, URLs, emails
        /[@\.\/\\:]/,
        // Numbers, dates, codes
        /^\d+/,
        // Quoted exact matches
        /^".*"$/
    ];
    
    // Check for AI indicators first
    const hasAIIndicators = aiIndicators.some(pattern => pattern.test(query));
    
    // If no AI indicators, check if it's a simple keyword
    if (!hasAIIndicators) {
        const isSimpleKeyword = keywordIndicators.some(pattern => pattern.test(query));
        if (isSimpleKeyword && query.split(' ').length <= 3) {
            return false; // Use keyword search
        }
    }
    
    return hasAIIndicators || query.split(' ').length > 3;
}

/**
 * Handles keyword search requests (fallback to native search)
 */
function handleKeywordSearch(request, sender, sendResponse) {
    // For keyword searches, we let the content script handle it with native find()
    sendResponse({ success: true, useNativeSearch: true });
}

/**
 * Handles the AI search request from the content script.
 * It checks usage limits before proceeding with the API call.
 */
async function handleAISearch(request, sender, sendResponse) {
    console.log('SmartFind: Handling AI search for query:', request.query);
    
    // First check if this should actually be a keyword search
    if (!shouldUseAI(request.query)) {
        console.log('SmartFind: Query classified as keyword search');
        sendResponse({ success: true, useNativeSearch: true });
        return;
    }

    const usage = await getUsageCountPromise();
    const paidTokens = await getPaidTokensCountPromise();
    
    // Check if user is on unlimited free list
    let { userId } = await chrome.storage.local.get('userId');
    const isUnlimitedFree = userId && UNLIMITED_FREE_USERS.includes(userId);
    
    console.log('SmartFind: Current usage:', usage, 'Paid tokens:', paidTokens, 'Unlimited free:', isUnlimitedFree);

    if (!isUnlimitedFree && usage >= FREE_TIER_LIMIT && paidTokens <= 0) {
        console.log('SmartFind: Free tier limit reached and no paid tokens');
        sendResponse({ error: "Free tier limit reached. Please purchase more tokens to continue." });
        return;
    }

    try {
        console.log('SmartFind: Calling Cerebras API...');
        const aiResponse = await callCerebrasAPI(request.query, request.content);
        if (aiResponse && !aiResponse.error) {
            // If user has exceeded free tier, use paid tokens (unless unlimited free)
            if (!isUnlimitedFree && usage >= FREE_TIER_LIMIT) {
                await decrementPaidTokens();
            } else {
                await incrementUsageCount();
            }
            console.log('SmartFind: AI search successful');
            sendResponse({ success: true, result: aiResponse });
        } else {
            console.log('SmartFind: AI search failed, falling back to keyword search');
            // Fallback to keyword search if AI fails
            sendResponse({ success: true, useNativeSearch: true, aiError: aiResponse.error });
        }
    } catch (error) {
        console.error("SmartFind - AI Search Error:", error);
        // Fallback to keyword search on error
        sendResponse({ success: true, useNativeSearch: true, aiError: error.message });
    }
}

/**
 * Calls the Cerebras API with llama3.1-8b model to get a semantic answer.
 * @param {string} query The user's natural language query.
 * @param {string} content The text content of the webpage.
 * @returns {Promise<string>} The most relevant text snippet from the content.
 */
async function callCerebrasAPI(query, content) {
    // Truncate content to avoid exceeding token limits
    const maxContentLength = 25000; // Conservative limit for llama3.1-8b
    const truncatedContent = content.substring(0, maxContentLength);

    // Detect if this is a summarization/analysis query
    const isSummarizationQuery = /\b(tldr|tl;dr|tl dr|summary|summarize|summarise|in a nutshell|key takeaway|key takeaways|main point|main points|gist|essence|overview|recap|brief|highlights|important|crucial|significant|notable|bottom line|core|central|primary|fundamental)\b/i.test(query) ||
                                /\b(give me the|what's the|whats the).*(summary|gist|main point|key|important|essence)\b/i.test(query);
    
    const prompt = isSummarizationQuery ? 
        `You are an intelligent search assistant. The user is asking for a summary or key information from the provided text content.

**Instructions:**
1. Read the user's query carefully to understand what type of summary they want.
2. Thoroughly scan the provided text content.
3. For summarization requests (TLDR, summary, key takeaways, etc.), find ALL important and relevant information that addresses their request.
4. Return up to 5 relevant text snippets, each on a separate line, separated by "|||".
5. Each snippet should be an exact sentence or short paragraph from the content.
6. Order them by relevance (most relevant first).
7. Your response format: snippet1|||snippet2|||snippet3 (etc.)
8. If no relevant text is found, respond with "NO_MATCH_FOUND".

**User Query:** "${query}"

**Text Content:**
---
${truncatedContent}
---

**Your Response (multiple snippets separated by |||):` :
        `You are an intelligent search assistant. Your task is to find ALL relevant sentences or short paragraphs from the provided text content that answer the user's query.

**Instructions:**
1. Read the user's query carefully.
2. Thoroughly scan the provided text content.
3. Identify ALL sentences or short paragraphs that are relevant to the query.
4. Return up to 5 relevant text snippets, each on a separate line, separated by "|||".
5. Each snippet should be an exact sentence or short paragraph from the content.
6. Order them by relevance (most relevant first).
7. Your response format: snippet1|||snippet2|||snippet3 (etc.)
8. If no relevant text is found, respond with "NO_MATCH_FOUND".

**User Query:** "${query}"

**Text Content:**
---
${truncatedContent}
---

**Your Response (multiple snippets separated by |||):`;

    const apiUrl = `${API_BASE_URL}/api/cerebras`;
    
    try {
        console.log('SmartFind: Making API request via proxy...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama3.1-8b",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 400,
                temperature: 0.1,
                top_p: 0.9
            })
        });

        console.log('SmartFind: API response status:', response.status);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("SmartFind - Cerebras API Error:", errorBody);
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }
        
        const result = await response.json();
        console.log('SmartFind: API response received');

        if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            let text = result.choices[0].message.content.trim();
            
            // Clean up potential formatting from the model
            if (text.startsWith('```') && text.endsWith('```')) {
                text = text.substring(3, text.length - 3).trim();
            }
            
            // Remove quotes if the model added them
            if ((text.startsWith('"') && text.endsWith('"')) || 
                (text.startsWith("'") && text.endsWith("'"))) {
                text = text.substring(1, text.length - 1);
            }
            
            if (text === "NO_MATCH_FOUND") {
                return null;
            }
            
            // Parse multiple results separated by |||
            const results = text.split('|||')
                .map(snippet => snippet.trim())
                .filter(snippet => snippet.length > 0 && snippet !== "NO_MATCH_FOUND");
            
            // Return array of results if multiple, single result if one, null if none
            return results.length > 0 ? results : null;
        } else {
            console.error("SmartFind - Unexpected API response structure:", result);
            return null;
        }

    } catch (error) {
        console.error("SmartFind - Error calling Cerebras API:", error);
        return { error: error.message };
    }
}

// --- Usage Tracking ---

/**
 * Gets the current API usage count from chrome.storage.
 */
function getUsageCount(callback) {
    chrome.storage.local.get(['aiUsageCount'], (result) => {
        callback(result.aiUsageCount || 0);
    });
}

/**
 * Promise-based version of getUsageCount.
 */
function getUsageCountPromise() {
    return new Promise(resolve => {
        chrome.storage.local.get(['aiUsageCount'], (result) => {
            resolve(result.aiUsageCount || 0);
        });
    });
}

/**
 * Increments the API usage count in chrome.storage.
 */
async function incrementUsageCount() {
    let { aiUsageCount } = await chrome.storage.local.get('aiUsageCount');
    aiUsageCount = (aiUsageCount || 0) + 1;
    await chrome.storage.local.set({ aiUsageCount });
}

// --- Paid Tokens Management ---

/**
 * Gets the current paid tokens count from chrome.storage.
 */
function getPaidTokensCount(callback) {
    chrome.storage.local.get(['paidTokens'], (result) => {
        callback(result.paidTokens || 0);
    });
}

/**
 * Promise-based version of getPaidTokensCount.
 */
function getPaidTokensCountPromise() {
    return new Promise(resolve => {
        chrome.storage.local.get(['paidTokens'], (result) => {
            resolve(result.paidTokens || 0);
        });
    });
}

/**
 * Decrements the paid tokens count in chrome.storage.
 */
async function decrementPaidTokens() {
    let { paidTokens } = await chrome.storage.local.get('paidTokens');
    paidTokens = Math.max((paidTokens || 0) - 1, 0);
    await chrome.storage.local.set({ paidTokens });
}

/**
 * Adds paid tokens to the user's account.
 */
async function addPaidTokens(amount) {
    let { paidTokens } = await chrome.storage.local.get('paidTokens');
    paidTokens = (paidTokens || 0) + amount;
    await chrome.storage.local.set({ paidTokens });
}

/**
 * Handles token purchase requests.
 */
async function handleTokenPurchase(request, sender, sendResponse) {
    try {
        // Generate a unique user ID if not exists
        let { userId } = await chrome.storage.local.get('userId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            await chrome.storage.local.set({ userId });
        }

        // Get auth token if available
        const { authToken } = await chrome.storage.local.get('authToken');
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Call your payment API
        const response = await fetch(`${PAYMENT_API_URL}/purchase-tokens`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ userId })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
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
        console.error('Token purchase error:', error);
        console.error('PAYMENT_API_URL:', PAYMENT_API_URL);
        console.error('Error details:', error.message);
        sendResponse({ 
            error: "Payment system temporarily unavailable",
            details: error.message,
            url: PAYMENT_API_URL
        });
    }
}

/**
 * Sends a message to content script with improved error handling
 * @param {number} tabId - The tab ID to send the message to
 * @param {object} message - The message to send
 */
async function sendMessageToContentScript(tabId, message) {
    try {
        // First check if the tab is valid and accessible
        const tab = await chrome.tabs.get(tabId);
        
        // Check if the URL is restricted
        if (isRestrictedUrl(tab.url)) {
            console.warn('SmartFind: Cannot inject into restricted URL:', tab.url);
            // Optionally show a notification to the user
            chrome.action.setBadgeText({ text: '!', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#ff4444', tabId: tabId });
            setTimeout(() => {
                chrome.action.setBadgeText({ text: '', tabId: tabId });
            }, 3000);
            return;
        }

        // First ping to check if content script is ready
        chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('SmartFind: Content script not ready, attempting to inject...', chrome.runtime.lastError.message);
                // Try to inject the content script if it's not loaded
                injectContentScriptAndRetry(tabId, message);
            } else if (response && response.ready) {
                console.log('SmartFind: Content script is ready, sending message');
                // Content script is ready, send the actual message
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('SmartFind: Error sending message to ready content script:', chrome.runtime.lastError.message);
                    } else {
                        console.log('SmartFind: Message sent successfully to content script');
                        // Clear any error badge
                        chrome.action.setBadgeText({ text: '', tabId: tabId });
                    }
                });
            } else {
                console.warn('SmartFind: Content script ping failed, attempting injection');
                injectContentScriptAndRetry(tabId, message);
            }
        });
    } catch (error) {
        console.error('SmartFind: Error getting tab info:', error);
    }
}

/**
 * Checks if a URL is restricted for content script injection
 * @param {string} url - The URL to check
 * @returns {boolean} - True if the URL is restricted
 */
function isRestrictedUrl(url) {
    const restrictedPatterns = [
        /^chrome:\/\//,
        /^chrome-extension:\/\//,
        /^moz-extension:\/\//,
        /^edge-extension:\/\//,
        /^about:/,
        /^file:\/\//,
        /^data:/,
        /^blob:/
    ];
    
    return restrictedPatterns.some(pattern => pattern.test(url));
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
        
        console.log('SmartFind: Content script injected successfully');
        
        // Wait a moment for the script to initialize, then retry
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('SmartFind: Failed to send message after injection:', chrome.runtime.lastError.message);
                    // Try one more time with a longer delay
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, message, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('SmartFind: Final attempt failed:', chrome.runtime.lastError.message);
                            } else {
                                console.log('SmartFind: Message sent successfully on final attempt');
                            }
                        });
                    }, 500);
                } else {
                    console.log('SmartFind: Message sent successfully after injection');
                }
            });
        }, 200);
        
    } catch (injectionError) {
        console.error('SmartFind: Failed to inject content script:', injectionError);
        // Show error badge
        chrome.action.setBadgeText({ text: '✗', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#ff4444', tabId: tabId });
        setTimeout(() => {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }, 3000);
    }
}

// --- Authentication Handlers ---

/**
 * Handle Google OAuth sign in
 */
async function handleGoogleSignIn(request, sender, sendResponse) {
    try {
        console.log('SmartFind: Starting Google OAuth...');
        
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
        console.log('SmartFind: Fetching Google user info...');
        const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
        if (!userInfoResponse.ok) {
            const errorText = await userInfoResponse.text();
            console.error('Google user info error:', errorText);
            throw new Error(`Failed to fetch Google user info: ${userInfoResponse.status} ${userInfoResponse.statusText}`);
        }
        const userInfo = await userInfoResponse.json();
        console.log('SmartFind: Google user info received:', userInfo.email);
        
        // Authenticate with our backend
        console.log('SmartFind: Authenticating with backend...');
        console.log('SmartFind: Backend URL:', `${PAYMENT_API_URL}/auth/oauth`);
        const authResponse = await fetch(`${PAYMENT_API_URL}/auth/oauth`, {
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

        console.log('SmartFind: Backend response status:', authResponse.status);
        
        if (!authResponse.ok) {
            const errorText = await authResponse.text();
            console.error('Backend auth error response:', errorText);
            throw new Error(`Backend authentication failed: ${authResponse.status} ${authResponse.statusText}`);
        }

        let authResult;
        try {
            const responseText = await authResponse.text();
            console.log('SmartFind: Raw backend response:', responseText.substring(0, 200));
            authResult = JSON.parse(responseText);
            console.log('SmartFind: Backend authentication successful');
        } catch (jsonError) {
            console.error('SmartFind: Failed to parse JSON response:', jsonError.message);
            console.error('SmartFind: Raw response that failed to parse:', responseText);
            throw new Error(`Backend returned invalid JSON: ${jsonError.message}`);
        }

        // Save auth state
        await chrome.storage.local.set({
            authToken: authResult.token,
            currentUser: authResult.user
        });

        // Sync data after successful authentication
        await syncUserDataInternal();

        sendResponse({ success: true, user: authResult.user, message: authResult.message });

    } catch (error) {
        console.error('Google OAuth error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle email sign in
 */
async function handleEmailSignIn(request, sender, sendResponse) {
    try {
        const { email, password } = request;
        
        console.log('SmartFind: Email sign-in request to:', `${PAYMENT_API_URL}/auth/signin`);
        const response = await fetch(`${PAYMENT_API_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        console.log('SmartFind: Email sign-in response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Email sign-in error response:', errorText);
            throw new Error(`Sign in failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('SmartFind: Email sign-in successful');

        // Save auth state
        await chrome.storage.local.set({
            authToken: result.token,
            currentUser: result.user
        });

        // Sync data after successful authentication
        await syncUserDataInternal();

        sendResponse({ success: true, user: result.user, message: result.message });

    } catch (error) {
        console.error('Email signin error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle email sign up
 */
async function handleEmailSignUp(request, sender, sendResponse) {
    try {
        const { email, password, name } = request;
        
        console.log('SmartFind: Email sign-up request to:', `${PAYMENT_API_URL}/auth/signup`);
        const response = await fetch(`${PAYMENT_API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });

        console.log('SmartFind: Email sign-up response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Email sign-up error response:', errorText);
            throw new Error(`Sign up failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('SmartFind: Email sign-up successful');

        // Save auth state
        await chrome.storage.local.set({
            authToken: result.token,
            currentUser: result.user
        });

        // Sync data after successful authentication
        await syncUserDataInternal();

        sendResponse({ success: true, user: result.user, message: result.message });

    } catch (error) {
        console.error('Email signup error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle sign out
 */
async function handleSignOut(request, sender, sendResponse) {
    try {
        const { currentUser } = await chrome.storage.local.get(['currentUser']);
        
        // Revoke Google token if present
        if (currentUser?.authType === 'google') {
            chrome.identity.removeCachedAuthToken({ token: null }, () => {});
        }

        // Clear local state
        await chrome.storage.local.remove(['authToken', 'currentUser']);

        console.log('SmartFind: User signed out');
        sendResponse({ success: true, message: 'Signed out successfully' });

    } catch (error) {
        console.error('Sign out error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle user data sync
 */
async function handleSyncUserData(request, sender, sendResponse) {
    try {
        const result = await syncUserDataInternal();
        sendResponse({ success: true, data: result });
    } catch (error) {
        console.error('Sync error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle restore purchases
 */
async function handleRestorePurchases(request, sender, sendResponse) {
    try {
        const { authToken } = await chrome.storage.local.get(['authToken']);
        if (!authToken) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${PAYMENT_API_URL}/user/restore-purchases`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to restore purchases');
        }

        // Update local storage
        await chrome.storage.local.set({
            paidTokens: result.totalTokens
        });
        
        console.log('SmartFind: Purchases restored');
        sendResponse({ success: true, data: result });

    } catch (error) {
        console.error('Restore purchases error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle get authentication status
 */
async function handleGetAuthStatus(request, sender, sendResponse) {
    try {
        const { authToken, currentUser } = await chrome.storage.local.get(['authToken', 'currentUser']);
        
        if (!authToken || !currentUser) {
            sendResponse({ success: true, isAuthenticated: false, user: null });
            return;
        }

        // Validate token with backend
        const response = await fetch(`${PAYMENT_API_URL}/auth/validate`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            sendResponse({ success: true, isAuthenticated: true, user: result.user });
        } else {
            // Token invalid, clear auth state
            await chrome.storage.local.remove(['authToken', 'currentUser']);
            sendResponse({ success: true, isAuthenticated: false, user: null });
        }

    } catch (error) {
        console.error('Auth status error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Internal function to sync user data with cloud
 */
async function syncUserDataInternal() {
    const { authToken } = await chrome.storage.local.get(['authToken']);
    if (!authToken) return null;

    try {
        // Get local data
        const localData = await chrome.storage.local.get(['paidTokens', 'aiUsageCount', 'userId']);
        
        const response = await fetch(`${PAYMENT_API_URL}/user/sync`, {
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
            // Update local storage with cloud data
            await chrome.storage.local.set({
                paidTokens: result.cloudTokens,
                aiUsageCount: result.cloudUsage,
                userId: result.userId
            });
            
            console.log('SmartFind: Data synced with cloud');
            return result;
        }

    } catch (error) {
        console.error('Internal sync error:', error);
    }
    return null;
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
        console.error('Open popup error:', error);
        sendResponse({ success: false, error: error.message });
    }
}
