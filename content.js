// SmartFind content script

// Production logging configuration
const DEBUG_MODE = false; // Set to false for production (infinite loop fixed!)
const log = DEBUG_MODE ? (...args) => console.log('SmartFind:', ...args) : () => {};
const logError = (...args) => console.error('SmartFind Error:', ...args);

// Global variables
let searchBar = null;
let searchInput = null;
let searchResults = null;
let currentHighlights = [];
let currentHighlightIndex = -1;
let totalMatches = 0;
let isSearching = false;
let isSearchingInProgress = false; // NEW: Flag to prevent re-searches during search
let lastQuery = '';
let activeQuery = '';
let lastMeaningfulQuery = '';

// Add to prevent infinite loop from mutations
let isSmartFindModifyingDOM = false; // Flag to prevent infinite loops from our own DOM changes
let lastContentMutationTime = 0;
let lastSearchCompletedTime = 0; // Track when the last search completed

// Additional required variables
let mutationObserver = null;
let contentCache = null;
let lastContentUpdate = 0;

// Extended search state tracking
let pendingExtendedSearch = null;
let isWaitingForExtendedConfirmation = false;

// AI search debouncing
let aiSearchTimeout = null;
let pendingAISearchQuery = null;

// Cursor-based search tracking
let lastClickPosition = null;
let userHasClicked = false;

// Enhanced content extraction configuration
const CONTENT_EXTRACTION_CONFIG = {
    maxContentLength: 200000, // Increased from 50000 to handle more content
    cacheTimeout: 30000, // Increased from 5000 to 30 seconds for dynamic sites
    mutationDebounceTime: 100, // Reduced from 500ms to 100ms for faster response
    shadowDomDepth: 3,
    iframeTimeout: 2000,
    enableDynamicSearch: true, // New flag to enable continuous dynamic search
    // Hybrid search configuration
    extendedSearchThreshold: 50000, // Content length that triggers extended search prompt
    chunkSize: 22000, // Optimal chunk size for AI processing
    chunkOverlap: 2000, // Overlap between chunks to avoid missing content at boundaries
    maxChunks: 5, // Maximum number of chunks to search in parallel
    keywordPrefilterThreshold: 0.1 // Minimum keyword match ratio to include chunk
};

// Pending search variables for post-authentication retry
let pendingSearch = {
    query: null,
    mode: null,
    content: null
};

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Content script received message:', request.action);
    
    if (request.action === "ping") {
        sendResponse({ ready: true });
        return;
    }
    
    if (request.action === "toggleUI") {
        try {
            // Ensure DOM is ready before trying to create UI
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    toggleSearchBar();
                    sendResponse({ success: true });
                });
            } else {
                toggleSearchBar();
                sendResponse({ success: true });
            }
        } catch (error) {
            logError('Error in toggleUI:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Keep the message channel open for async response
    }
    
    if (request.action === "signInSuccess") {
        log('Sign-in successful, checking for pending search...');
        retryPendingSearch();
        sendResponse({ success: true });
        return;
    }
});

// Test if content script is working
log(' Content script setup complete');

// Send a ready signal to background script if needed
if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
        chrome.runtime.sendMessage({ action: "contentScriptReady" }, (response) => {
            // Ignore response, this is just to establish connection
        });
    } catch (error) {
        // Ignore errors, this is just a courtesy signal
    }
}

// Initialize enhanced content monitoring
initializeContentMonitoring();

// Initialize cursor tracking
initializeCursorTracking();

// Add immediate test for MutationObserver functionality
setTimeout(() => {
    log('Testing MutationObserver functionality...');
    log('MutationObserver exists:', !!mutationObserver);
    log('Dynamic search enabled:', CONTENT_EXTRACTION_CONFIG.enableDynamicSearch);
    
    // Add test element to trigger mutation
    const testElement = document.createElement('div');
    testElement.textContent = 'SmartFind test element for mutation detection';
    testElement.style.display = 'none'; // Hidden so it doesn't affect the page
    document.body.appendChild(testElement);
    
    // Remove it after a short delay
    setTimeout(() => {
        if (document.body.contains(testElement)) {
            document.body.removeChild(testElement);
            log('Test element cleanup completed');
        }
    }, 1000);
}, 2000);

// Add a simple test function that can be called from console
window.smartfindTest = function() {
    log(' Manual test triggered');
    toggleSearchBar();
};

// Debug functions disabled to prevent console spam

// Initialize cursor tracking to detect user clicks
function initializeCursorTracking() {
    log(' Initializing cursor tracking');
    
    // Track clicks on the page to determine search starting position
    document.addEventListener('click', (event) => {
        // Don't track clicks on SmartFind elements
        if (event.target.closest('#smartfind-search-bar, .smartfind-highlight')) {
            return;
        }
        
        // Store the click position and the element that was clicked
        lastClickPosition = {
            x: event.clientX,
            y: event.clientY,
            pageX: event.pageX,
            pageY: event.pageY,
            element: event.target,
            timestamp: Date.now()
        };
        
        userHasClicked = true;
        log(' User clicked at position:', lastClickPosition);
    }, { passive: true });
    
    // Also track when the user scrolls to update the relative position
    window.addEventListener('scroll', () => {
        // Update the click position relative to the new scroll position
        if (lastClickPosition && userHasClicked) {
            // Keep the click position valid for a reasonable time (30 seconds)
            const clickAge = Date.now() - lastClickPosition.timestamp;
            if (clickAge > 30000) {
                lastClickPosition = null;
                userHasClicked = false;
                log(' Click position expired due to age');
            }
        }
    }, { passive: true });
    
    log(' Cursor tracking initialized');
}

// Get the current scroll position and viewport information
function getViewportInfo() {
    return {
        scrollTop: window.pageYOffset || document.documentElement.scrollTop,
        scrollLeft: window.pageXOffset || document.documentElement.scrollLeft,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
    };
}

// Calculate the distance from a DOM element to the user's last click position
function calculateDistanceFromCursor(element) {
    if (!lastClickPosition || !userHasClicked) {
        // If no click position, use viewport center as reference
        const viewport = getViewportInfo();
        const rect = element.getBoundingClientRect();
        const elementCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
        const viewportCenter = {
            x: viewport.viewportWidth / 2,
            y: viewport.viewportHeight / 2
        };
        
        return Math.sqrt(
            Math.pow(elementCenter.x - viewportCenter.x, 2) + 
            Math.pow(elementCenter.y - viewportCenter.y, 2)
        );
    }
    
    try {
        const rect = element.getBoundingClientRect();
        const viewport = getViewportInfo();
        
        // Calculate element position relative to the page
        const elementPageX = rect.left + viewport.scrollLeft;
        const elementPageY = rect.top + viewport.scrollTop;
        
        // Calculate distance from click position
        const distance = Math.sqrt(
            Math.pow(elementPageX - lastClickPosition.pageX, 2) + 
            Math.pow(elementPageY - lastClickPosition.pageY, 2)
        );
        
        return distance;
    } catch (error) {
        // If we can't calculate distance, return a large number to deprioritize
        return 999999;
    }
}

// Sort matches by distance from cursor position while preserving quality
function sortMatchesByDistance(matches) {
    if (!matches || matches.length === 0) {
        return matches;
    }
    
    // Add distance information to each match
    const matchesWithDistance = matches.map(match => {
        let element = null;
        
        // Find the element containing the match
        if (match.node && match.node.parentElement) {
            element = match.node.parentElement;
        } else if (match.element) {
            element = match.element;
        }
        
        const distance = element ? calculateDistanceFromCursor(element) : 999999;
        
        return {
            ...match,
            distanceFromCursor: distance
        };
    });
    
    // For AI searches, balance quality with distance
    // For keyword searches, prioritize distance more heavily
    matchesWithDistance.sort((a, b) => {
        // If this is an AI search with quality scores, consider both quality and distance
        if (a.score !== undefined && b.score !== undefined) {
            const aQuality = a.score || 1;
            const bQuality = b.score || 1;
            
            // If quality difference is significant (>0.3), prioritize quality
            if (Math.abs(aQuality - bQuality) > 0.3) {
                return bQuality - aQuality; // Higher quality first
            }
            
            // If quality is similar, prioritize distance
            return a.distanceFromCursor - b.distanceFromCursor;
        }
        
        // For keyword searches or when no quality scores, sort by distance only
        return a.distanceFromCursor - b.distanceFromCursor;
    });
    
    log(` Sorted ${matches.length} matches by distance from cursor (with quality balance)`);
    if (userHasClicked && lastClickPosition) {
        log(' Using click position:', lastClickPosition);
    } else {
        log(' Using viewport center as reference');
    }
    
    return matchesWithDistance;
}

// Find the best starting index based on cursor position
function findBestStartingIndex(highlights) {
    if (!highlights || highlights.length === 0) {
        return 0;
    }
    
    if (!lastClickPosition || !userHasClicked) {
        // If no click position, start from the first visible result
        const viewport = getViewportInfo();
        
        for (let i = 0; i < highlights.length; i++) {
            const highlight = highlights[i];
            const rect = highlight.getBoundingClientRect();
            
            // Check if the highlight is in the current viewport
            if (rect.top >= 0 && rect.top <= viewport.viewportHeight) {
                log(' Starting from first visible result at index:', i);
                return i;
            }
        }
        
        return 0; // Fallback to first result
    }
    
    // Find the highlight closest to the click position
    let bestIndex = 0;
    let bestDistance = Infinity;
    
    for (let i = 0; i < highlights.length; i++) {
        const highlight = highlights[i];
        const distance = calculateDistanceFromCursor(highlight);
        
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }
    
    log(' Starting from closest result to click at index:', bestIndex, 'distance:', bestDistance);
    return bestIndex;
}

// Initialize content monitoring with MutationObserver
function initializeContentMonitoring() {
    log(' Initializing content monitoring');
    
    // Set up MutationObserver to detect dynamic content changes
    if (window.MutationObserver) {
        mutationObserver = new MutationObserver((mutations) => {
            debounce(handleContentMutation, CONTENT_EXTRACTION_CONFIG.mutationDebounceTime)(mutations);
        });
        
        mutationObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: false // We don't need attribute changes for content extraction
        });
        
        log(' MutationObserver initialized');
    }
    
    // Also listen for common dynamic content events
    ['load', 'DOMContentLoaded', 'readystatechange'].forEach(eventType => {
        document.addEventListener(eventType, () => {
            log(` ${eventType} event detected, invalidating content cache`);
            invalidateContentCache();
        });
    });
    
    // Listen for scroll events that might trigger dynamic content loading (MUCH more conservative)
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (CONTENT_EXTRACTION_CONFIG.enableDynamicSearch && activeQuery) {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                log(' Scroll detected with active query, checking for new content');
                // Only invalidate cache, don't automatically re-search on scroll
                // This prevents infinite loops while still allowing fresh content when user manually searches
                invalidateContentCache();
            }, 5000); // Much longer delay and only invalidate cache
        }
    }, { passive: true });
    
    // REMOVED: Periodic re-search mechanism that was causing infinite loops
    // The mutation observer should be sufficient for detecting real content changes
}

// Enhanced mutation detection for common dynamic loading patterns
function isSignificantContentMutation(mutations) {
    log('Checking mutations for significant content changes. Total mutations:', mutations.length);
    
    // CRITICAL: Check if SmartFind is modifying DOM to prevent infinite loops
    if (isSmartFindModifyingDOM) {
        return false;
    }
    
    // Much more conservative approach: require substantial changes
    let hasSmartFindMutations = false;
    let hasRealContentMutations = false;
    let substantialContentChanges = 0;
    
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        
        // Check if the mutation target or any added/removed nodes are SmartFind elements
        const isSmartFindMutation = () => {
            // Check target
            if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
                const element = mutation.target;
                if (element.classList && (element.classList.contains('smartfind-highlight') || element.id === 'smartfind-search-bar')) {
                    return true;
                }
                // Also check if target is inside a smartfind element
                if (element.closest && element.closest('.smartfind-highlight, #smartfind-search-bar')) {
                    return true;
                }
            }
            
            // Check added nodes
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node;
                    if (element.classList && (element.classList.contains('smartfind-highlight') || element.id === 'smartfind-search-bar')) {
                        return true;
                    }
                    // Check if any child has smartfind classes
                    if (element.querySelector && element.querySelector('.smartfind-highlight, #smartfind-search-bar')) {
                        return true;
                    }
                } else if (node.nodeType === Node.TEXT_NODE) {
                    // Check if text node is inside a SmartFind element
                    let parent = node.parentNode;
                    while (parent && parent.nodeType === Node.ELEMENT_NODE) {
                        if (parent.classList && parent.classList.contains('smartfind-highlight')) {
                            return true;
                        }
                        parent = parent.parentNode;
                    }
                }
            }
            
            // Check removed nodes
            for (const node of mutation.removedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node;
                    if (element.classList && (element.classList.contains('smartfind-highlight') || element.id === 'smartfind-search-bar')) {
                        return true;
                    }
                    // Check if any child had smartfind classes
                    if (element.querySelector && element.querySelector('.smartfind-highlight, #smartfind-search-bar')) {
                        return true;
                    }
                } else if (node.nodeType === Node.TEXT_NODE) {
                    // If we're removing text that was inside a SmartFind element, it's our mutation
                    // This is harder to detect after removal, so we'll be conservative
                    const textContent = node.textContent || '';
                    if (textContent.length < 100) { // Small text removals are likely SmartFind related
                        return true;
                    }
                }
            }
            
            return false;
        };
        
        if (isSmartFindMutation()) {
            hasSmartFindMutations = true;
            continue;
        }
        
        if (mutation.type === 'childList') {
            // MUCH more conservative: require substantial content additions
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node;
                        // Only count as substantial if it's a meaningful element with content
                        const textContent = element.textContent || '';
                        if (textContent.trim().length > 50 && // Must have substantial text
                            !element.classList.contains('smartfind-highlight') && // Not our element
                            element.tagName !== 'SCRIPT' && // Not scripts
                            element.tagName !== 'STYLE' && // Not styles
                            element.tagName !== 'LINK') { // Not links
                            substantialContentChanges++;
                        }
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        const textContent = node.textContent || '';
                        if (textContent.trim().length > 50) { // Only substantial text changes
                            // Check if this text node is inside a SmartFind highlight
                            let parent = node.parentNode;
                            let isSmartFindText = false;
                            while (parent && parent.nodeType === Node.ELEMENT_NODE) {
                                if (parent.classList && parent.classList.contains('smartfind-highlight')) {
                                    isSmartFindText = true;
                                    break;
                                }
                                parent = parent.parentNode;
                            }
                            
                            if (!isSmartFindText) {
                                substantialContentChanges++;
                            } else {
                            }
                        }
                    }
                }
            }
            
            // Be even more conservative with removals - only care about MAJOR removals
            if (mutation.removedNodes.length > 10) { // Only care about significant removals
                substantialContentChanges++;
            }
        }
        
        // Character data changes - be more conservative
        if (mutation.type === 'characterData') {
            const textContent = mutation.target.textContent || '';
            if (textContent.trim().length > 50) { // Only substantial text changes
                // Check if this character data change is on a SmartFind element
                let parent = mutation.target.parentNode;
                let isSmartFindText = false;
                while (parent && parent.nodeType === Node.ELEMENT_NODE) {
                    if (parent.classList && parent.classList.contains('smartfind-highlight')) {
                        isSmartFindText = true;
                        break;
                    }
                    parent = parent.parentNode;
                }
                
                if (!isSmartFindText) {
                    substantialContentChanges++;
                } else {
                }
            }
        }
    }
    
    // Only consider it significant if we have substantial changes AND they're not all SmartFind-related
    hasRealContentMutations = substantialContentChanges >= 2; // Require at least 2 substantial changes
    
    if (hasSmartFindMutations && !hasRealContentMutations) {
        return false;
    }
    
    if (hasRealContentMutations) {
        return true;
    }
    
    log('No significant content mutations detected');
    return false;
}

// Handle content mutations
function handleContentMutation(mutations) {
    // CRITICAL: Ignore mutations when WE are modifying the DOM (prevents infinite loops)
    if (isSmartFindModifyingDOM) {
        return;
    }
    
    // CRITICAL: Ignore mutations when a search is already in progress (prevents infinite loops)
    if (isSearchingInProgress) {
        return;
    }
    
    // CRITICAL: Check if all mutations are SmartFind-related before doing expensive analysis
    const allSmartFindMutations = mutations.every(mutation => {
        // Check if mutation target is a SmartFind element
        if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
            const element = mutation.target;
            if (element.classList && (element.classList.contains('smartfind-highlight') || element.id === 'smartfind-search-bar')) {
                return true;
            }
            if (element.closest && element.closest('.smartfind-highlight, #smartfind-search-bar')) {
                return true;
            }
        }
        
        // Check added/removed nodes
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node;
                if (element.classList && (element.classList.contains('smartfind-highlight') || element.id === 'smartfind-search-bar')) {
                    return true;
                }
                if (element.querySelector && element.querySelector('.smartfind-highlight, #smartfind-search-bar')) {
                    return true;
                }
            }
        }
        
        return false;
    });
    
    if (allSmartFindMutations) {
        return;
    }
    
    // Add timestamp check to prevent too frequent re-searches (increased from 500ms to 2 seconds)
    const now = Date.now();
    if (lastContentMutationTime && (now - lastContentMutationTime) < 2000) {
        return;
    }
    
    // CRITICAL: Prevent re-searches immediately after a search completes (prevents highlight clearing)
    if (lastSearchCompletedTime && (now - lastSearchCompletedTime) < 3000) {
        return;
    }
    
    lastContentMutationTime = now;
    
    log('Content mutation detected. Active query:', activeQuery, 'Dynamic search enabled:', CONTENT_EXTRACTION_CONFIG.enableDynamicSearch);
    invalidateContentCache();
    
    // Use the most recent meaningful query for dynamic re-search
    const queryToUse = activeQuery || lastMeaningfulQuery;
    
    // Enhanced dynamic search: re-run search if there's a meaningful query
    if (CONTENT_EXTRACTION_CONFIG.enableDynamicSearch && queryToUse && queryToUse.length >= 2) {
        log('Checking for significant mutations...');
        // Check if this is a significant content change
        if (isSignificantContentMutation(mutations)) {
            log('SmartFind: Significant content mutation detected. Query to use:', queryToUse);
            // Use a longer delay to allow DOM to stabilize after mutations (increased from 300ms to 1 second)
            setTimeout(() => {
                // Triple check we're not modifying DOM and not searching and query is still meaningful
                if (!isSmartFindModifyingDOM && !isSearchingInProgress) {
                    const finalQuery = activeQuery || lastMeaningfulQuery;
                    if (finalQuery && finalQuery.length >= 2) {
                        log('SmartFind: Re-running search due to significant content change');
                        handleSearchForQuery(finalQuery);
                    }
                } else {
                }
            }, 1000); // Longer delay to ensure DOM operations complete
        } else {
        }
    } else {
        log('Not re-running search. Dynamic search enabled:', CONTENT_EXTRACTION_CONFIG.enableDynamicSearch, 'Active query:', activeQuery);
    }
}

// Invalidate content cache
function invalidateContentCache() {
    contentCache = null;
    lastContentUpdate = 0;
}

// Retry pending search after successful sign-in
async function retryPendingSearch() {
    if (pendingSearch.query && pendingSearch.mode) {
        log('Retrying pending search:', pendingSearch.query, 'Mode:', pendingSearch.mode);
        
        // Clear the status to show we're retrying
        setStatus('Retrying search...', 'info');
        
        // Retry based on the stored mode
        if (pendingSearch.mode === 'forceAI') {
            await performForcedAISearch(pendingSearch.query);
        } else if (pendingSearch.mode === 'progressive') {
            await performProgressiveAISearch(pendingSearch.query);
        }
        
        // Clear pending search
        pendingSearch = {
            query: null,
            mode: null,
            content: null
        };
    } else {
        log('No pending search to retry');
    }
}

// Toggle search bar visibility
function toggleSearchBar() {
    log(' toggleSearchBar called, searchBar exists:', !!searchBar);
    log(' document.body exists:', !!document.body);
    log(' document.readyState:', document.readyState);
    
    if (!searchBar) {
        createSearchBar();
    } else {
        if (searchBar.classList.contains('smartfind-hidden')) {
            log(' Showing search bar');
            searchBar.classList.remove('smartfind-hidden');
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            log(' Hiding search bar');
            hideSearchBar();
        }
    }
}

// Hide search bar and clear highlights
function hideSearchBar() {
    if (searchBar) {
        searchBar.classList.add('smartfind-hidden');
        clearHighlights();
        
        // CRITICAL: Clear all queries and flags to prevent background re-searches
        activeQuery = ''; // Clear active query when hiding search bar
        lastMeaningfulQuery = ''; // Clear meaningful query when hiding search bar
        isSearchingInProgress = false; // Clear search flag
        
        // Cancel any pending AI search
        if (aiSearchTimeout) {
            clearTimeout(aiSearchTimeout);
            aiSearchTimeout = null;
        }
        
        // Reset cursor tracking when search is complete
        // Keep the click position for a bit longer in case user searches again soon
        setTimeout(() => {
            if (searchBar && searchBar.classList.contains('smartfind-hidden')) {
                lastClickPosition = null;
                userHasClicked = false;
                log(' Reset cursor tracking after search bar hidden');
            }
        }, 5000); // Reset after 5 seconds of inactivity
        
    }
}

// Cleanup function for when the extension is disabled or page unloads
function cleanup() {
    log(' Cleaning up');
    
    // Disconnect MutationObserver
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    
    // Clear highlights
    clearHighlights();
    
    // Clear cache
    invalidateContentCache();
    
    // Cancel any pending AI search
    if (aiSearchTimeout) {
        clearTimeout(aiSearchTimeout);
        aiSearchTimeout = null;
    }
    
    // Remove search bar
    if (searchBar && searchBar.parentNode) {
        searchBar.parentNode.removeChild(searchBar);
        searchBar = null;
        searchInput = null;
        searchResults = null;
    }
}

// Listen for page unload to cleanup
window.addEventListener('beforeunload', cleanup);

// Listen for extension context invalidation
if (chrome.runtime) {
    chrome.runtime.onConnect.addListener(() => {
        // Extension context is still valid
    });
}

// Create search bar UI
function createSearchBar() {
    log(' Creating search bar');
    
    // Check if document.body is available
    if (!document.body) {
        console.error('SmartFind: document.body is not available');
        return;
    }
    
    searchBar = document.createElement('div');
    searchBar.id = 'smartfind-search-bar';
    searchBar.className = 'smartfind-container';
    
    log(' Created div element:', searchBar);
    
    searchBar.innerHTML = `
        <div class="smartfind-search-box">
            <input type="text" id="smartfind-input" placeholder="Search..." autocomplete="off" spellcheck="false">
            <div class="smartfind-controls">
                <span id="smartfind-results" class="smartfind-results">0/0</span>
                <button id="smartfind-prev" class="smartfind-nav-btn" title="Previous result (Shift+Enter)">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M12 10L8 6L4 10"/>
                    </svg>
                </button>
                <button id="smartfind-next" class="smartfind-nav-btn" title="Next result (Enter)">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M4 6L8 10L12 6"/>
                    </svg>
                </button>
                <button id="smartfind-close" class="smartfind-close-btn" title="Close (Escape)">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M12 4L4 12M4 4L12 12"/>
                    </svg>
                </button>
            </div>
        </div>
        <div id="smartfind-status" class="smartfind-status"></div>
    `;
    
    log(' Set innerHTML, about to append to body');
    
    try {
        document.body.appendChild(searchBar);
        log(' Search bar added to DOM successfully');
        log(' Search bar element:', searchBar);
        log(' Search bar parent:', searchBar.parentElement);
    } catch (error) {
        console.error('SmartFind: Error appending to body:', error);
        return;
    }
    
    // Get references to elements
    searchInput = document.getElementById('smartfind-input');
    searchResults = document.getElementById('smartfind-results');
    
    log(' searchInput element:', searchInput);
    log(' searchResults element:', searchResults);
    
    if (!searchInput || !searchResults) {
        console.error('SmartFind: Failed to get references to search elements');
        console.error('SmartFind: searchInput found:', !!searchInput);
        console.error('SmartFind: searchResults found:', !!searchResults);
        return;
    }
    
    // Add event listeners
    setupEventListeners();
    
    // Show and focus the input
    log(' About to show search bar');
    
    if (searchInput) {
        searchInput.focus();
        log(' Focused input element');
    }
    
    log(' Search bar creation complete');
}

// Setup all event listeners
function setupEventListeners() {
    log(' Setting up event listeners');
    
    // Input events - reduced debounce for more responsive feel like Chrome
    searchInput.addEventListener('input', debounce(handleSearch, 150));
    searchInput.addEventListener('input', updatePlaceholder);
    searchInput.addEventListener('keydown', handleKeyDown);
    
    // Button events
    document.getElementById('smartfind-next').addEventListener('click', () => navigateResults(1));
    document.getElementById('smartfind-prev').addEventListener('click', () => navigateResults(-1));
    document.getElementById('smartfind-close').addEventListener('click', hideSearchBar);
    
    // Global escape key - native Chrome behavior: first escape clears input, second hides
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchBar && !searchBar.classList.contains('smartfind-hidden')) {
            if (searchInput.value.trim()) {
                // First escape: clear input
                searchInput.value = '';
                handleSearch();
                searchInput.focus();
            } else {
                // Second escape: hide search bar
                hideSearchBar();
            }
        }
    });
    
    log(' Event listeners set up successfully');
}

// Handle keyboard shortcuts in search input - simplified to match Chrome behavior
function handleKeyDown(e) {
    switch (e.key) {
        case 'Enter':
            e.preventDefault();
            
            // Handle extended search confirmation
            if (isWaitingForExtendedConfirmation) {
                
                if (pendingExtendedSearch && pendingExtendedSearch.query) {
                    const queryToSearch = pendingExtendedSearch.query; // Store query before clearing
                    clearExtendedSearchPrompt();
                    performExtendedAISearch(queryToSearch);
                    return;
                } else {
                    clearExtendedSearchPrompt();
                    // Fall through to regular search handling
                }
            }
            
            // On Enter, trigger immediate AI search if no keyword results found
            const currentQuery = searchInput?.value?.trim();
            if (currentQuery && currentHighlights.length === 0) {
                // Cancel any pending debounced search
                if (aiSearchTimeout) {
                    clearTimeout(aiSearchTimeout);
                    aiSearchTimeout = null;
                }
                // Trigger immediate AI search
                setInputStyling('ai', false);
                performProgressiveAISearch(currentQuery);
                return;
            }
            
            if (e.shiftKey) {
                navigateResults(-1); // Previous result
            } else {
                navigateResults(1);  // Next result  
            }
            break;
        case 'Escape':
            // Clear extended search confirmation if active
            if (isWaitingForExtendedConfirmation) {
                clearExtendedSearchPrompt();
                return;
            }
            
            if (searchInput.value.trim()) {
                // Clear input first
                searchInput.value = '';
                handleSearch();
            } else {
                // Hide search bar
                hideSearchBar();
            }
            break;
    }
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Main search handler - simplified for Chrome-like responsiveness
async function handleSearch() {
    const rawQuery = searchInput?.value?.trim();
    log('handleSearch called with query:', rawQuery);
    
    if (!rawQuery) {
        clearHighlights();
        updateResultsDisplay(0, 0);
        setStatus('');
        resetInputStyling();
        // DON'T clear activeQuery here - keep it for dynamic re-search
        // activeQuery will be cleared when search bar is hidden
        return;
    }
    
    // Don't search for the exact same query repeatedly (debouncing)
    if (rawQuery === lastQuery) return;
    
    // Delegate to the main search function
    await handleSearchForQuery(rawQuery);
}

// Parse search mode from query prefixes
function parseSearchMode(query) {
    if (query.startsWith('/')) {
        return {
            mode: 'forceAI',
            cleanQuery: query.substring(1).trim(),
            prefix: '/'
        };
    } else if (query.startsWith("'")) {
        return {
            mode: 'forceKeyword',
            cleanQuery: query.substring(1).trim(),
            prefix: "'"
        };
    } else if (query.startsWith('*')) {
        return {
            mode: 'regex',
            cleanQuery: query.substring(1).trim(),
            prefix: '*'
        };
    } else {
        return {
            mode: 'progressive',
            cleanQuery: query,
            prefix: null
        };
    }
}

// Parse multi-term queries separated by commas
function parseMultiTermQuery(query) {
    // Split by comma and clean up each term
    const terms = query.split(',')
        .map(term => term.trim())
        .filter(term => term.length > 0);
    
    return {
        isMultiTerm: terms.length > 1,
        terms: terms,
        originalQuery: query
    };
}

// Perform multi-term native search with different colors for each term
function performMultiTermSearch(terms) {
    log('Performing multi-term search for terms:', terms);
    clearHighlights();
    
    try {
        const allMatches = [];
        const processedNodes = new Set();
        
        // Search for each term separately
        terms.forEach((term, termIndex) => {
            if (!term.trim()) return;
            
            const termMatches = [];
            const termProcessedNodes = new Set();
            
            // Search in main document
            termMatches.push(...searchInDocument(document, term, termProcessedNodes));
            
            // Search in shadow DOMs
            termMatches.push(...searchInShadowDOMs(document, term, termProcessedNodes));
            
            // Search in accessible iframes
            termMatches.push(...searchInIframes(term, termProcessedNodes));
            
            // Add term index to each match for color assignment
            termMatches.forEach(match => {
                match.termIndex = termIndex;
                match.term = term;
            });
            
            allMatches.push(...termMatches);
            
            // Add processed nodes to global set to avoid re-processing
            termProcessedNodes.forEach(node => processedNodes.add(node));
        });
        
        log('Found', allMatches.length, 'total matches across all terms');
        
        // Remove duplicates and sort by distance from cursor
        let uniqueMatches = removeDuplicateMatches(allMatches);
        uniqueMatches = sortMatchesByDistance(uniqueMatches);
        
        // Highlight matches with multi-term colors
        highlightMultiTermMatches(uniqueMatches);
        
        // Start from the result closest to cursor position
        if (uniqueMatches.length > 0) {
            currentHighlightIndex = findBestStartingIndex(currentHighlights);
            scrollToHighlight(currentHighlightIndex);
            updateResultsDisplay(currentHighlightIndex + 1, uniqueMatches.length);
            
            // Show helpful message about multi-term search
            const termCount = terms.length;
            setStatus(`Found matches for ${termCount} terms`, 'info');
            setTimeout(() => setStatus(''), 3000);
        } else {
            updateResultsDisplay(0, 0);
        }
        
        return uniqueMatches.length;
        
    } catch (error) {
        console.error('SmartFind: Error in multi-term search:', error);
        updateResultsDisplay(0, 0);
        return 0;
    }
}

// Highlight matches with different colors for each term
function highlightMultiTermMatches(matches) {
    // Filter out invalid matches
    const validMatches = matches.filter(match => {
        if (!match || typeof match !== 'object') return false;
        if (!match.node || !match.node.textContent) return false;
        if (typeof match.start !== 'number' || typeof match.end !== 'number') return false;
        if (match.start < 0 || match.end <= match.start) return false;
        if (match.start >= match.node.textContent.length || match.end > match.node.textContent.length) return false;
        return true;
    });
    
    log(`Highlighting ${validMatches.length} multi-term matches`);
    
    // Set flag when modifying DOM
    isSmartFindModifyingDOM = true;
    
    try {
        clearHighlights();
        currentHighlights = [];
        totalMatches = validMatches.length;
        
        if (validMatches.length === 0) {
            updateResultsDisplay(0, 0);
            return;
        }
        
        validMatches.forEach((match, index) => {
            try {
                const nodeLength = match.node.textContent.length;
                const start = Math.max(0, Math.min(match.start, nodeLength));
                const end = Math.max(start, Math.min(match.end, nodeLength));
                
                // Skip if invalid range
                if (start >= end || start >= nodeLength || end > nodeLength) {
                    return;
                }
                
                // Create highlight element with term-specific color
                const highlight = document.createElement('span');
                const termIndex = match.termIndex || 0;
                const colorClass = `smartfind-multiterm-${termIndex % 8}`; // Cycle through 8 colors
                
                highlight.className = `smartfind-highlight smartfind-multiterm-highlight ${colorClass} smartfind-new`;
                highlight.setAttribute('data-smartfind-index', index);
                highlight.setAttribute('data-term-index', termIndex);
                highlight.setAttribute('data-term', match.term || '');
                
                // Use robust highlighting
                if (createRobustHighlight(match.node, start, end, highlight)) {
                    currentHighlights.push(highlight);
                    
                    // Remove animation class after animation completes
                    setTimeout(() => {
                        highlight.classList.remove('smartfind-new');
                    }, 200);
                }
                
            } catch (e) {
                // Silently skip failed highlights
                if (Math.random() < 0.01) {
                    console.warn('SmartFind: Failed to highlight multi-term match:', e.message);
                }
            }
        });
        
        log('Highlighted', currentHighlights.length, 'multi-term matches');
        
    } catch (error) {
        console.error('SmartFind: Error in highlightMultiTermMatches:', error);
    } finally {
        // Reset flag after DOM modifications
        setTimeout(() => {
            isSmartFindModifyingDOM = false;
        }, 500);
    }
}

// Set input styling based on search mode
function setInputStyling(mode, isForced) {
    if (!searchInput) return;
    
    // Reset all styling
    searchInput.classList.remove('smartfind-ai-mode', 'smartfind-forced-mode', 'smartfind-multiterm-mode', 'smartfind-regex-mode');
    
    if (mode === 'ai') {
        searchInput.classList.add('smartfind-ai-mode');
        if (isForced) {
            searchInput.classList.add('smartfind-forced-mode');
        }
    } else if (mode === 'multiterm') {
        searchInput.classList.add('smartfind-multiterm-mode');
    } else if (mode === 'regex') {
        searchInput.classList.add('smartfind-regex-mode');
        if (isForced) {
            searchInput.classList.add('smartfind-forced-mode');
        }
    } else if (mode === 'keyword' && isForced) {
        searchInput.classList.add('smartfind-forced-mode');
    }
}

// Reset input styling
function resetInputStyling() {
    if (!searchInput) return;
    searchInput.classList.remove('smartfind-ai-mode', 'smartfind-forced-mode', 'smartfind-multiterm-mode');
}

// Perform forced AI search
async function performForcedAISearch(query) {
    const content = extractPageContent();
    
    // Show loading state
    setAISearchLoadingState();
    
    const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "performAISearch",
            query: query,
            content: content,
            forceAI: true
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('SmartFind: Error sending message to background:', chrome.runtime.lastError);
                resolve({ error: chrome.runtime.lastError.message });
            } else {
                resolve(response);
            }
        });
    });
    
    // Clear loading state
    clearAISearchLoadingState();
    
    if (response.success) {
        if (response.result) {
            // AI returned results
            const actualHighlights = performAISearch(response.result);
            if (actualHighlights === 0) {
                // AI returned results but none matched on page
                setAIEmptyResultsState();
            }
        } else {
            // AI search succeeded but returned no results
            setAIEmptyResultsState();
        }
    } else if (response.error) {
        if (response.needsAuth) {
            // Store the search for retry after sign-in
            pendingSearch = {
                query: query,
                mode: 'forceAI',
                content: content
            };
            log('Stored pending forced AI search:', query);
            showSignInPrompt(response.error);
        } else if (response.error.includes('Credits exhausted') || response.error.includes('purchase more tokens')) {
            showPaymentOption(response.error);
        } else {
            // Actual AI search failure
            setStatus('AI search failed', 'error');
        }
    } else {
        // Unexpected response format
        setStatus('AI search failed', 'error');
    }
}

// Perform progressive AI search (fallback from keyword)
async function performProgressiveAISearch(query) {
    
    const content = extractPageContent();
    
    log('performProgressiveAISearch: Content length:', content.length);
    log('performProgressiveAISearch: Query:', query);
    
    // Check if this requires extended search
    const needsExtended = requiresExtendedSearch(content, query);
    log('performProgressiveAISearch: Needs extended search:', needsExtended);
    
    if (needsExtended) {
        const estimatedTokens = estimateExtendedSearchTokens(content);
        log('performProgressiveAISearch: Showing extended search prompt with', estimatedTokens, 'tokens');
        showExtendedSearchPrompt(query, estimatedTokens);
        return;
    }
    
    log('performProgressiveAISearch: Proceeding with regular AI search');
    
    try {
        // Show loading state
        setAISearchLoadingState();
        
        log('performProgressiveAISearch: Sending message to background script...');
        const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "performAISearch",
            query: query,
            content: content,
            fallbackFromKeyword: true
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('SmartFind: Error sending message to background:', chrome.runtime.lastError);
                resolve({ error: chrome.runtime.lastError.message });
            } else {
                log('performProgressiveAISearch: Received response from background:', response);
                resolve(response);
            }
        });
    });
    
    // Clear loading state
    clearAISearchLoadingState();
    
    log('performProgressiveAISearch: Processing response...', response);
    
    if (response.success) {
        log('performProgressiveAISearch: Response success=true, checking result...');
        if (response.result) {
            log('performProgressiveAISearch: AI returned results:', response.result);
            // AI returned results
            const actualHighlights = performAISearch(response.result);
            log('performProgressiveAISearch: Highlighted', actualHighlights, 'matches');
            if (actualHighlights === 0) {
                // AI returned results but none matched on page - fall back to keyword styling
                log('performProgressiveAISearch: No highlights found, falling back');
                resetInputStyling();
                setAIEmptyResultsState();
            }
        } else {
            log('performProgressiveAISearch: AI search succeeded but returned no results');
            // AI search succeeded but returned no results - fall back to keyword styling
            resetInputStyling();
            setAIEmptyResultsState();
        }
    } else if (response.error) {
        log('performProgressiveAISearch: Response has error:', response.error);
        if (response.needsAuth) {
            // Store the search for retry after sign-in
            pendingSearch = {
                query: query,
                mode: 'progressive',
                content: content
            };
            log('Stored pending progressive AI search:', query);
            showSignInPrompt(response.error);
        } else if (response.error.includes('Credits exhausted') || response.error.includes('purchase more tokens')) {
            showPaymentOption(response.error);
        } else {
            // Actual failure - fall back to keyword mode silently
            log('performProgressiveAISearch: AI search failed, falling back to keyword mode');
            resetInputStyling();
        }
    } else {
        log('performProgressiveAISearch: Unexpected response format:', response);
        // Unexpected response - fall back to keyword mode silently
        resetInputStyling();
    }
    
    } catch (error) {
        clearAISearchLoadingState();
        resetInputStyling();
        setStatus('AI search failed', 'error');
    }
}

// Extract readable content from the page
// Enhanced content extraction with caching, shadow DOM, and iframe support
function extractPageContent() {
    log(' Extracting page content');
    
    // Check cache first
    const now = Date.now();
    if (contentCache && (now - lastContentUpdate) < CONTENT_EXTRACTION_CONFIG.cacheTimeout) {
        log(' Using cached content');
        return contentCache;
    }
    
    try {
        let content = '';
        const processedElements = new Set();
        
        // Strategy 1: Extract from main document with enhanced selectors
        content += extractFromDocument(document, processedElements);
        
        // Strategy 2: Extract from shadow DOMs
        content += extractFromShadowDOMs(document, processedElements);
        
        // Strategy 3: Extract from accessible iframes
        content += extractFromIframes();
        
        // Strategy 4: Fallback to full document text if content is insufficient
        if (content.length < 500) {
            log(' Content too short, using fallback extraction');
            content += extractFallbackContent();
        }
        
        // Clean and limit content
        content = cleanExtractedContent(content);
        
        // Cache the result
        contentCache = content;
        lastContentUpdate = now;
        
        log(` Extracted ${content.length} characters of content`);
        return content;
        
    } catch (error) {
        console.error('SmartFind: Error in content extraction:', error);
        // Fallback to basic extraction
        return document.body?.textContent || document.documentElement?.textContent || '';
    }
}

// Extract content from a document with enhanced selectors
function extractFromDocument(doc, processedElements = new Set()) {
    log(' Extracting from document');
    
    // Priority content selectors (most important first)
    const prioritySelectors = [
        'main', 'article', '[role="main"]', '[role="article"]',
        '.content', '.post', '.entry', '.article-content', '.post-content',
        '.main-content', '.page-content', '.story-content'
    ];
    
    // Secondary content selectors
    const secondarySelectors = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'li', 'td', 'th', 'blockquote', 'pre',
        '.text', '.description', '.summary', '.excerpt'
    ];
    
    // Elements to exclude
    const excludeSelectors = [
        'script', 'style', 'noscript', 'iframe', 'object', 'embed',
        'nav', 'header', 'footer', 'aside', '.nav', '.navigation',
        '.ad', '.ads', '.advertisement', '.banner', '.popup',
        '.cookie', '.gdpr', '.consent', '.modal', '.overlay',
        '.social', '.share', '.comment-form', '.sidebar'
    ];
    
    let content = '';
    
    try {
        // First, try priority selectors
        for (const selector of prioritySelectors) {
            const elements = doc.querySelectorAll(selector);
            for (const element of elements) {
                if (processedElements.has(element)) continue;
                
                const text = extractTextFromElement(element, excludeSelectors);
                if (text && text.length > 30) {
                    content += text + '\n\n';
                    processedElements.add(element);
                    
                    // If we have enough content from priority elements, we can be more selective
                    if (content.length > 10000) break;
                }
            }
            if (content.length > 15000) break;
        }
        
        // If we don't have enough content, use secondary selectors
        if (content.length < 2000) {
            log(' Using secondary selectors for more content');
            for (const selector of secondarySelectors) {
                const elements = doc.querySelectorAll(selector);
                for (const element of elements) {
                    if (processedElements.has(element)) continue;
                    
                    const text = extractTextFromElement(element, excludeSelectors);
                    if (text && text.length > 10 && !isContentDuplicate(content, text)) {
                        content += text + '\n';
                        processedElements.add(element);
                    }
                }
                if (content.length > CONTENT_EXTRACTION_CONFIG.maxContentLength) break;
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in document extraction:', error);
    }
    
    return content;
}

// Extract text from an element while excluding unwanted content
function extractTextFromElement(element, excludeSelectors) {
    try {
        // Skip if element matches exclude selectors
        for (const excludeSelector of excludeSelectors) {
            if (element.matches && element.matches(excludeSelector)) {
                return '';
            }
        }
        
        // Clone element to avoid modifying original
        const clone = element.cloneNode(true);
        
        // Remove excluded child elements
        for (const excludeSelector of excludeSelectors) {
            clone.querySelectorAll(excludeSelector).forEach(el => el.remove());
        }
        
        const text = clone.textContent?.trim();
        return text || '';
        
    } catch (error) {
        console.warn('SmartFind: Error extracting text from element:', error);
        return '';
    }
}

// Extract content from shadow DOMs
function extractFromShadowDOMs(rootElement, processedElements, depth = 0) {
    if (depth >= CONTENT_EXTRACTION_CONFIG.shadowDomDepth) {
        return '';
    }
    
    log(` Extracting from shadow DOMs (depth ${depth})`);
    let content = '';
    
    try {
        // Find all elements that might have shadow roots
        const elementsWithShadow = rootElement.querySelectorAll('*');
        
        for (const element of elementsWithShadow) {
            try {
                if (element.shadowRoot) {
                    log(' Found shadow root in', element.tagName);
                    content += extractFromDocument(element.shadowRoot, processedElements);
                    
                    // Recursively check for nested shadow DOMs
                    content += extractFromShadowDOMs(element.shadowRoot, processedElements, depth + 1);
                }
            } catch (shadowError) {
                // Shadow root might not be accessible, continue
                console.debug('SmartFind: Shadow root not accessible:', shadowError);
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in shadow DOM extraction:', error);
    }
    
    return content;
}

// Extract content from accessible iframes
function extractFromIframes() {
    log(' Extracting from iframes');
    let content = '';
    
    try {
        const iframes = document.querySelectorAll('iframe');
        log(` Found ${iframes.length} iframes`);
        
        for (const iframe of iframes) {
            try {
                // Only try to access same-origin iframes
                if (iframe.contentDocument) {
                    log(' Accessing iframe content');
                    const iframeContent = extractFromDocument(iframe.contentDocument);
                    if (iframeContent && iframeContent.length > 50) {
                        content += iframeContent + '\n\n';
                    }
                }
            } catch (iframeError) {
                // Cross-origin iframe, skip
                console.debug('SmartFind: Cannot access iframe (likely cross-origin):', iframeError);
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in iframe extraction:', error);
    }
    
    return content;
}

// Fallback content extraction for difficult sites
function extractFallbackContent() {
    log(' Using fallback content extraction');
    
    try {
        // Try different fallback strategies
        let content = '';
        
        // Strategy 1: Get all visible text nodes
        content += extractVisibleTextNodes();
        
        // Strategy 2: Try common content containers
        const fallbackSelectors = ['body', '#content', '#main', '.container', '.wrapper'];
        for (const selector of fallbackSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const text = element.textContent?.trim();
                if (text && text.length > content.length) {
                    content = text;
                    break;
                }
            }
        }
        
        return content;
        
    } catch (error) {
        console.error('SmartFind: Error in fallback extraction:', error);
        return document.body?.textContent || '';
    }
}

// Extract visible text nodes using TreeWalker
function extractVisibleTextNodes() {
    let content = '';
    
    try {
        const walker = document.createTreeWalker(
            document.body || document.documentElement,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script and style elements
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName?.toLowerCase();
                    if (['script', 'style', 'noscript'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Check if element is visible
                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent?.trim();
            if (text && text.length > 5) {
                content += text + ' ';
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error extracting visible text nodes:', error);
    }
    
    return content;
}

// Clean and optimize extracted content
function cleanExtractedContent(content) {
    try {
        // Remove excessive whitespace
        content = content.replace(/\s+/g, ' ');
        
        // Remove repeated content (simple deduplication)
        const lines = content.split('\n');
        const uniqueLines = [];
        const seenLines = new Set();
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length > 10 && !seenLines.has(trimmedLine)) {
                uniqueLines.push(line);
                seenLines.add(trimmedLine);
            }
        }
        
        content = uniqueLines.join('\n');
        
        // Limit content length
        if (content.length > CONTENT_EXTRACTION_CONFIG.maxContentLength) {
            content = content.substring(0, CONTENT_EXTRACTION_CONFIG.maxContentLength);
            // Try to cut at a sentence boundary
            const lastSentence = content.lastIndexOf('.');
            if (lastSentence > CONTENT_EXTRACTION_CONFIG.maxContentLength * 0.8) {
                content = content.substring(0, lastSentence + 1);
            }
        }
        
        return content.trim();
        
    } catch (error) {
        console.error('SmartFind: Error cleaning content:', error);
        return content;
    }
}

// Check if content is duplicate (simple check)
function isContentDuplicate(existingContent, newText) {
    if (!existingContent || !newText) return false;
    
    // Simple substring check for exact duplicates
    if (existingContent.includes(newText.trim())) {
        return true;
    }
    
    // Check for similar content (first 50 characters)
    const newTextStart = newText.trim().substring(0, 50);
    if (newTextStart.length > 20 && existingContent.includes(newTextStart)) {
        return true;
    }
    
    return false;
}

// Enhanced native keyword search with shadow DOM and iframe support
function performNativeSearch(query) {
    log(' Performing enhanced native search for:', query);
    clearHighlights();
    
    try {
        const matches = [];
        const processedNodes = new Set();
        
        // Search in main document
        matches.push(...searchInDocument(document, query, processedNodes));
        
        // Search in shadow DOMs
        matches.push(...searchInShadowDOMs(document, query, processedNodes));
        
        // Search in accessible iframes
        matches.push(...searchInIframes(query, processedNodes));
        
        log(' Found', matches.length, 'enhanced native matches');
        
        // Remove duplicates and sort by distance from cursor
        let uniqueMatches = removeDuplicateMatches(matches);
        uniqueMatches = sortMatchesByDistance(uniqueMatches);
        
        // Highlight matches
        highlightMatches(uniqueMatches, 'keyword');
        
        // Start from the result closest to cursor position
        if (uniqueMatches.length > 0) {
            currentHighlightIndex = findBestStartingIndex(currentHighlights);
            scrollToHighlight(currentHighlightIndex);
            updateResultsDisplay(currentHighlightIndex + 1, uniqueMatches.length);
            
            // Show helpful message for cursor-based search (only for first search after click)
            if (userHasClicked && lastClickPosition && uniqueMatches.length > 1) {
                const clickAge = Date.now() - lastClickPosition.timestamp;
                if (clickAge < 2000) { // Only show for recent clicks (within 2 seconds)
                    setStatus('Starting from your click position ↗', 'info');
                    setTimeout(() => setStatus(''), 2000); // Clear after 2 seconds
                }
            }
        } else {
            updateResultsDisplay(0, 0);
        }
        
        return uniqueMatches.length;
        
    } catch (error) {
        console.error('SmartFind: Error in enhanced native search:', error);
        updateResultsDisplay(0, 0);
        return 0;
    }
}

// Perform regex search
function performRegexSearch(query) {
    log(' Performing regex search for:', query);
    clearHighlights();
    
    try {
        // Validate regex pattern
        let regex;
        try {
            regex = new RegExp(query, 'gi');
        } catch (regexError) {
            setStatus('Invalid regex pattern: ' + regexError.message, 'error');
            updateResultsDisplay(0, 0);
            return 0;
        }
        
        const matches = [];
        const processedNodes = new Set();
        
        // Search in main document
        matches.push(...searchInDocumentRegex(document, regex, processedNodes));
        
        // Search in shadow DOMs
        matches.push(...searchInShadowDOMsRegex(document, regex, processedNodes));
        
        // Search in accessible iframes
        matches.push(...searchInIframesRegex(regex, processedNodes));
        
        log(' Found', matches.length, 'regex matches');
        
        // Remove duplicates and sort by distance from cursor
        let uniqueMatches = removeDuplicateMatches(matches);
        uniqueMatches = sortMatchesByDistance(uniqueMatches);
        
        // Highlight matches
        highlightMatches(uniqueMatches, 'regex');
        
        // Start from the result closest to cursor position
        if (uniqueMatches.length > 0) {
            currentHighlightIndex = findBestStartingIndex(currentHighlights);
            scrollToHighlight(currentHighlightIndex);
            updateResultsDisplay(currentHighlightIndex + 1, uniqueMatches.length);
            
            // Show helpful message for regex search
            setStatus('Regex search completed', 'info');
            setTimeout(() => setStatus(''), 2000);
        } else {
            updateResultsDisplay(0, 0);
            setStatus('No regex matches found', 'warning');
            setTimeout(() => setStatus(''), 3000);
        }
        
        return uniqueMatches.length;
        
    } catch (error) {
        console.error('SmartFind: Error in regex search:', error);
        setStatus('Regex search error: ' + error.message, 'error');
        updateResultsDisplay(0, 0);
        return 0;
    }
}

// Search for text in a document
function searchInDocument(doc, query, processedNodes = new Set()) {
    const matches = [];
    
    try {
        // Determine the root element to search in
        let rootElement;
        if (doc instanceof ShadowRoot) {
            // For shadow roots, use the shadow root itself as the root
            rootElement = doc;
        } else if (doc instanceof Document) {
            // For documents, use body or documentElement
            rootElement = doc.body || doc.documentElement;
        } else if (doc instanceof Element) {
            // For regular elements, use the element itself
            rootElement = doc;
        } else {
            // Invalid document/element, skip silently
            return matches;
        }
        
        // Validate that we have a valid root element
        if (!rootElement) {
            return matches;
        }
        
        // Use TreeWalker to find all text nodes
        const walker = document.createTreeWalker(
            rootElement,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip if already processed
                    if (processedNodes.has(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Check parent element
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    // Skip script, style, and other non-content elements
                    const tagName = parent.tagName?.toLowerCase();
                    if (['script', 'style', 'noscript', 'template', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // More permissive hidden content detection for dynamic content
                    try {
                        // Only reject truly hidden elements (display: none)
                        const style = window.getComputedStyle(parent);
                        if (style.display === 'none') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        // Allow elements with visibility: hidden or opacity: 0 (might contain searchable content)
                        // Allow elements with zero dimensions (might be dynamic content loading)
                        
                        // REMOVED: Viewport filtering to search ALL content including dynamically loaded content
                        // This allows searching in infinite scroll content that's outside current viewport
                        
                    } catch (styleError) {
                        // If we can't get computed style, include the node (fail-safe)
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        let node;
        const regex = new RegExp(escapeRegExp(query), 'gi');
        
        while (node = walker.nextNode()) {
            try {
                const text = node.textContent;
                if (!text || !text.trim()) continue; // Skip empty text
                
                processedNodes.add(node);
                
                let match;
                regex.lastIndex = 0; // Reset regex state
                while ((match = regex.exec(text)) !== null) {
                    // Skip zero-length matches completely
                    if (match[0].length === 0) {
                        regex.lastIndex++;
                        continue;
                    }
                    
                    // Validate match bounds
                    if (match.index + match[0].length <= text.length) {
                        matches.push({
                            node: node,
                            start: match.index,
                            end: match.index + match[0].length,
                            text: match[0],
                            score: 1.0,
                            matchType: 'exact'
                        });
                    }
                }
            } catch (nodeError) {
                console.warn('SmartFind: Error processing node:', nodeError);
                continue;
            }
        }
        
    } catch (error) {
        // Rate limit error logging to prevent console spam
        if (Math.random() < 0.01) {
            console.error('SmartFind: Error in document search (sample error):', error.message);
        }
    }
    
    return matches;
}

// Search in shadow DOMs
function searchInShadowDOMs(rootElement, query, processedNodes, depth = 0) {
    if (depth >= CONTENT_EXTRACTION_CONFIG.shadowDomDepth) {
        return [];
    }
    
    const matches = [];
    
    try {
        // Find all elements that might have shadow roots
        const elementsWithShadow = rootElement.querySelectorAll('*');
        
        for (const element of elementsWithShadow) {
            try {
                if (element.shadowRoot) {
                    log(' Searching in shadow root of', element.tagName);
                    
                    // Validate shadow root before searching
                    if (element.shadowRoot instanceof ShadowRoot) {
                        const shadowMatches = searchInDocument(element.shadowRoot, query, processedNodes);
                        if (shadowMatches && shadowMatches.length > 0) {
                            matches.push(...shadowMatches);
                        }
                        
                        // Recursively search nested shadow DOMs
                        const nestedMatches = searchInShadowDOMs(element.shadowRoot, query, processedNodes, depth + 1);
                        if (nestedMatches && nestedMatches.length > 0) {
                            matches.push(...nestedMatches);
                        }
                    }
                }
            } catch (shadowError) {
                // Shadow root might not be accessible or search failed, continue silently
                // Only log occasionally to prevent console spam
                if (Math.random() < 0.01) {
                    console.debug('SmartFind: Shadow root search failed (sample error):', shadowError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in shadow DOM search:', error);
    }
    
    return matches;
}

// Search in accessible iframes
function searchInIframes(query, processedNodes) {
    const matches = [];
    
    try {
        const iframes = document.querySelectorAll('iframe');
        
        for (const iframe of iframes) {
            try {
                // Only try to access same-origin iframes
                if (iframe.contentDocument && iframe.contentDocument instanceof Document) {
                    log(' Searching in iframe');
                    const iframeMatches = searchInDocument(iframe.contentDocument, query, processedNodes);
                    if (iframeMatches && iframeMatches.length > 0) {
                        matches.push(...iframeMatches);
                    }
                }
            } catch (iframeError) {
                // Cross-origin iframe or search failed, skip silently
                // Only log occasionally to prevent console spam
                if (Math.random() < 0.01) {
                    console.debug('SmartFind: Iframe search failed (sample error):', iframeError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in iframe search:', error);
    }
    
    return matches;
}

// Search for regex in a document
function searchInDocumentRegex(doc, regex, processedNodes = new Set()) {
    const matches = [];
    
    try {
        // Determine the root element to search in
        let rootElement;
        if (doc instanceof ShadowRoot) {
            rootElement = doc;
        } else if (doc instanceof Document) {
            rootElement = doc.body || doc.documentElement;
        } else if (doc instanceof Element) {
            rootElement = doc;
        } else {
            return matches;
        }
        
        if (!rootElement) {
            return matches;
        }
        
        // Use TreeWalker to find all text nodes
        const walker = document.createTreeWalker(
            rootElement,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (processedNodes.has(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName?.toLowerCase();
                    if (['script', 'style', 'noscript', 'template', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    try {
                        const style = window.getComputedStyle(parent);
                        if (style.display === 'none') {
                            return NodeFilter.FILTER_REJECT;
                        }
                    } catch (styleError) {
                        // If we can't get computed style, include the node
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            try {
                const text = node.textContent;
                if (!text || !text.trim()) continue;
                
                processedNodes.add(node);
                
                let match;
                regex.lastIndex = 0; // Reset regex state
                while ((match = regex.exec(text)) !== null) {
                    // Skip zero-length matches
                    if (match[0].length === 0) {
                        regex.lastIndex++;
                        continue;
                    }
                    
                    // Validate match bounds
                    if (match.index + match[0].length <= text.length) {
                        matches.push({
                            node: node,
                            start: match.index,
                            end: match.index + match[0].length,
                            text: match[0],
                            score: 1.0,
                            matchType: 'regex'
                        });
                    }
                }
            } catch (nodeError) {
                console.warn('SmartFind: Error processing node in regex search:', nodeError);
                continue;
            }
        }
        
    } catch (error) {
        if (Math.random() < 0.01) {
            console.error('SmartFind: Error in document regex search (sample error):', error.message);
        }
    }
    
    return matches;
}

// Search in shadow DOMs with regex
function searchInShadowDOMsRegex(rootElement, regex, processedNodes, depth = 0) {
    if (depth >= CONTENT_EXTRACTION_CONFIG.shadowDomDepth) {
        return [];
    }
    
    const matches = [];
    
    try {
        const elementsWithShadow = rootElement.querySelectorAll('*');
        
        for (const element of elementsWithShadow) {
            try {
                if (element.shadowRoot && element.shadowRoot instanceof ShadowRoot) {
                    log(' Searching in shadow root with regex of', element.tagName);
                    
                    const shadowMatches = searchInDocumentRegex(element.shadowRoot, regex, processedNodes);
                    if (shadowMatches && shadowMatches.length > 0) {
                        matches.push(...shadowMatches);
                    }
                    
                    // Recursively search nested shadow DOMs
                    const nestedMatches = searchInShadowDOMsRegex(element.shadowRoot, regex, processedNodes, depth + 1);
                    if (nestedMatches && nestedMatches.length > 0) {
                        matches.push(...nestedMatches);
                    }
                }
            } catch (shadowError) {
                if (Math.random() < 0.01) {
                    console.debug('SmartFind: Shadow root regex search failed (sample error):', shadowError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in shadow DOM regex search:', error);
    }
    
    return matches;
}

// Search in accessible iframes with regex
function searchInIframesRegex(regex, processedNodes) {
    const matches = [];
    
    try {
        const iframes = document.querySelectorAll('iframe');
        
        for (const iframe of iframes) {
            try {
                if (iframe.contentDocument && iframe.contentDocument instanceof Document) {
                    log(' Searching in iframe with regex');
                    const iframeMatches = searchInDocumentRegex(iframe.contentDocument, regex, processedNodes);
                    if (iframeMatches && iframeMatches.length > 0) {
                        matches.push(...iframeMatches);
                    }
                }
            } catch (iframeError) {
                if (Math.random() < 0.01) {
                    console.debug('SmartFind: Iframe regex search failed (sample error):', iframeError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('SmartFind: Error in iframe regex search:', error);
    }
    
    return matches;
}

// Perform AI-enhanced search with improved selectivity
function performAISearch(aiResult) {
    log(' Performing AI search with result:', aiResult);
    clearHighlights();
    
    if (!aiResult) {
        updateResultsDisplay(0, 0);
        return 0;
    }
    
    // Handle both single results (string) and multiple results (array)
    const aiResults = Array.isArray(aiResult) ? aiResult : [aiResult];
    log(' Processing', aiResults.length, 'AI results:', aiResults);
    
    let allMatches = [];
    
    // Process each AI result with improved matching
    for (const result of aiResults) {
        log(' Processing AI result:', result);
        
        // Skip very short or generic results
        if (result.length < 3 || isGenericResult(result)) {
            log(' Skipping generic or short result:', result);
            continue;
        }
        
        // Find exact matches first (preferred)
        const exactMatches = findTextInDOM(result);
        log(' Exact matches found:', exactMatches.length);
        
        if (exactMatches.length > 0) {
            log(' Found exact matches for:', result);
            allMatches.push(...exactMatches.map(match => ({ ...match, matchType: 'exact' })));
        } else {
            // If exact match not found, try fuzzy matching with more lenient criteria
            log(' Trying fuzzy matching for:', result);
            const fuzzyMatches = findFuzzyMatches(result);
            log(' Fuzzy matches found:', fuzzyMatches.length);
            
            // For shorter results (likely names, emails, etc.), be more lenient
            const isShortResult = result.length < 50;
            const scoreThreshold = isShortResult ? 0.6 : 0.8;
            const minLength = isShortResult ? 3 : 10;
            
            // Only add fuzzy matches if they meet quality threshold
            const qualityMatches = fuzzyMatches.filter(match => 
                match.score >= scoreThreshold && match.text.length >= minLength
            );
            
            if (qualityMatches.length > 0) {
                log(' Found quality fuzzy matches:', qualityMatches.length);
                allMatches.push(...qualityMatches.map(match => ({ ...match, matchType: 'fuzzy' })));
            } else {
                log(' No quality matches found for:', result);
                
                // For very short results (like names), try word-by-word search
                if (isShortResult && result.split(/\s+/).length <= 3) {
                    log(' Trying word-by-word search for short result:', result);
                    const wordMatches = findWordMatches(result);
                    if (wordMatches.length > 0) {
                        log(' Found word matches:', wordMatches.length);
                        allMatches.push(...wordMatches.map(match => ({ ...match, matchType: 'word' })));
                    }
                }
            }
        }
    }
    
    // Remove duplicate matches (same position) and sort by distance from cursor (quality is considered within distance sorting)
    allMatches = removeDuplicateMatches(allMatches);
    allMatches = sortMatchesByDistance(allMatches);
    
    log(' Total matches after processing:', allMatches.length);
    
    // Limit the number of highlights to prevent performance issues and improve relevance
    const maxHighlights = 15; // Reduced from 20 for better selectivity
    if (allMatches.length > maxHighlights) {
        log(` Limiting highlights to ${maxHighlights} out of ${allMatches.length} matches`);
        allMatches = allMatches.slice(0, maxHighlights);
    }
    
    if (allMatches.length > 0) {
        highlightMatches(allMatches, 'ai');
        // Start from the result closest to cursor position
        currentHighlightIndex = findBestStartingIndex(currentHighlights);
        scrollToHighlight(currentHighlightIndex);
        updateResultsDisplay(currentHighlightIndex + 1, allMatches.length);
        
        // Show helpful message for cursor-based search (only for first search after click)
        if (userHasClicked && lastClickPosition && allMatches.length > 1) {
            const clickAge = Date.now() - lastClickPosition.timestamp;
            if (clickAge < 2000) { // Only show for recent clicks (within 2 seconds)
                setStatus('Starting from your click position ↗', 'info');
                setTimeout(() => setStatus(''), 2000); // Clear after 2 seconds
            }
        }
        
        log(` AI search completed - ${aiResults.length} AI results processed, ${allMatches.length} actual highlights found`);
        
        // Track when search completed to prevent immediate re-searches
        lastSearchCompletedTime = Date.now();
        
        return allMatches.length;
    } else {
        updateResultsDisplay(0, 0);
        log(` AI search completed - ${aiResults.length} AI results processed, 0 actual highlights found`);
        return 0;
    }
}

// Find matches for individual words (useful for names and short phrases)
function findWordMatches(searchText) {
    const matches = [];
    const words = searchText.trim().split(/\s+/);
    
    // Only use this for short phrases (1-3 words)
    if (words.length > 3) return matches;
    
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        const text = node.textContent;
        const textLower = text.toLowerCase();
        
        // Look for all words appearing in the same text node
        const wordPositions = words.map(word => {
            const pos = textLower.indexOf(word.toLowerCase());
            return pos !== -1 ? { word, pos, end: pos + word.length } : null;
        }).filter(Boolean);
        
        // If we found all words in this node
        if (wordPositions.length === words.length) {
            // Find the span that contains all words
            const minPos = Math.min(...wordPositions.map(wp => wp.pos));
            const maxEnd = Math.max(...wordPositions.map(wp => wp.end));
            
            // Only match if words are reasonably close together (within 100 characters)
            if (maxEnd - minPos <= 100) {
                matches.push({
                    node: node,
                    start: minPos,
                    end: maxEnd,
                    text: text.substring(minPos, maxEnd),
                    score: 0.9 // High score for word matches
                });
            }
        }
    }
    
    return matches.slice(0, 5); // Limit to top 5 matches
}

// Check if a result is too generic to be useful
function isGenericResult(result) {
    const genericPhrases = [
        'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'this', 'that', 'these', 'those', 'a', 'an', 'is', 'are', 'was', 'were',
        'click here', 'read more', 'learn more', 'see more', 'more info'
    ];
    
    const lowerResult = result.toLowerCase().trim();
    
    // Skip if it's just a generic phrase
    if (genericPhrases.includes(lowerResult)) {
        return true;
    }
    
    // Skip if it's mostly common words
    const words = lowerResult.split(/\s+/);
    const commonWords = words.filter(word => genericPhrases.includes(word));
    
    return commonWords.length / words.length > 0.7;
}

// Sort matches by quality (exact matches first, then by score)
function sortMatchesByQuality(matches) {
    return matches.sort((a, b) => {
        // Exact matches first
        if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
        if (b.matchType === 'exact' && a.matchType !== 'exact') return 1;
        
        // Then by score
        return (b.score || 1) - (a.score || 1);
    });
}

// Get search intent for status messages (simplified version)
function getSearchIntent(query) {
    // Simple keyword detection for basic user feedback
    if (/\b(emails?|email|contact)\b/i.test(query)) {
        return { description: 'email addresses' };
    }
    if (/\b(phone|tel|mobile|cell)\b/i.test(query)) {
        return { description: 'phone numbers' };
    }
    if (/\b(names?|people|persons?)\b/i.test(query)) {
        return { description: 'names and people' };
    }
    if (/\b(headings?|titles?|headers?)\b/i.test(query)) {
        return { description: 'headings and titles' };
    }
    if (/\b(links?|urls?|websites?)\b/i.test(query)) {
        return { description: 'links and URLs' };
    }
    if (/\b(dates?|times?|when)\b/i.test(query)) {
        return { description: 'dates and times' };
    }
    if (/\b(prices?|costs?|numbers?)\b/i.test(query)) {
        return { description: 'prices and numbers' };
    }
    if (/\b(addresses?|locations?)\b/i.test(query)) {
        return { description: 'addresses and locations' };
    }
    if (/\b(summary|summarize|tldr|key)\b/i.test(query)) {
        return { description: 'key information' };
    }
    
    return null; // Default case
}

// Find exact text matches in DOM
function findTextInDOM(searchText) {
    const matches = [];
    
    // First try simple single-node matching (fastest and most reliable)
    const singleNodeMatches = findTextInSingleNodes(searchText);
    if (singleNodeMatches.length > 0) {
        return singleNodeMatches;
    }
    
    // For longer text or multi-word phrases, try styled element matching first
    // This handles text that spans across formatting better than cross-node matching
    if (searchText.length > 10 || searchText.includes(' ')) {
        log(' Trying styled element matching for formatted text');
        const styledMatches = findTextInStyledElements(searchText);
        if (styledMatches.length > 0) {
            log(' Found matches in styled elements:', styledMatches.length);
            return styledMatches;
        }
    }
    
    // Try cross-node matching as fallback
    if (searchText.length > 15) {
        log(' Trying cross-node matching for longer text:', searchText.substring(0, 100) + '...');
        const crossNodeMatches = findTextAcrossNodes(searchText);
        if (crossNodeMatches.length > 0) {
            log(' Found cross-node matches:', crossNodeMatches.length);
            return crossNodeMatches;
        }
    }
    
    return matches;
}

// Find text that might be split across styled inline elements (em, strong, i, b, etc.)
function findTextInStyledElements(searchText) {
    const matches = [];
    const searchLower = searchText.toLowerCase();
    
    // Find all elements that commonly contain styled text, with special focus on Wikipedia elements
    const styledElements = document.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, article, section, .mw-parser-output, .mw-content-text');
    
    for (const element of styledElements) {
        // Skip Wikipedia citation and reference elements
        if (element.classList.contains('reference') || 
            element.classList.contains('citation') ||
            element.classList.contains('mw-editsection') ||
            element.querySelector('.reference, .citation, .mw-editsection')) {
            continue;
        }
        
        // Get the combined text content of the element
        const elementText = element.textContent;
        if (!elementText || elementText.length < searchText.length) {
            continue;
        }
        
        const elementTextLower = elementText.toLowerCase();
        let searchIndex = 0;
        
        // Look for matches in the combined text
        while (searchIndex < elementText.length) {
            const matchIndex = elementTextLower.indexOf(searchLower, searchIndex);
            if (matchIndex === -1) break;
            
            // Found a potential match - now find which text node(s) contain it
            const match = findMatchInElementNodes(element, matchIndex, searchText.length, searchText);
            if (match) {
                matches.push(match);
            }
            
            searchIndex = matchIndex + 1;
        }
        
        // Don't return too many matches for performance
        if (matches.length >= 10) {
            break;
        }
    }
    
    return matches;
}

// Find the actual text nodes within an element that contain the match
function findMatchInElementNodes(element, startOffset, length, originalText) {
    // Get all text nodes and build a map of their positions
    const textNodeMap = [];
    let totalOffset = 0;
    
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        const nodeText = node.textContent;
        textNodeMap.push({
            node: node,
            text: nodeText,
            start: totalOffset,
            end: totalOffset + nodeText.length
        });
        totalOffset += nodeText.length;
    }
    
    // Find which nodes contain the match
    const endOffset = startOffset + length;
    const nodeMatches = [];
    
    for (const nodeInfo of textNodeMap) {
        // Check if this node overlaps with the match range
        const overlapStart = Math.max(startOffset, nodeInfo.start);
        const overlapEnd = Math.min(endOffset, nodeInfo.end);
        
        if (overlapStart < overlapEnd) {
            // This node contains part of the match
            const startInNode = overlapStart - nodeInfo.start;
            const endInNode = overlapEnd - nodeInfo.start;
            
            // Make sure we don't exceed the actual node text length
            const actualStart = Math.max(0, Math.min(startInNode, nodeInfo.text.length));
            const actualEnd = Math.max(actualStart, Math.min(endInNode, nodeInfo.text.length));
            
            if (actualStart < actualEnd) {
                nodeMatches.push({
                    node: nodeInfo.node,
                    start: actualStart,
                    end: actualEnd,
                    text: nodeInfo.text.substring(actualStart, actualEnd)
                });
            }
        }
    }
    
    // Return a match object
    if (nodeMatches.length > 0) {
        if (nodeMatches.length === 1) {
            // Single node match
            return nodeMatches[0];
        } else {
            // Multi-node match
            const primaryMatch = nodeMatches[0];
            primaryMatch.crossNodeMatches = nodeMatches;
            primaryMatch.matchType = 'cross-node';
            return primaryMatch;
        }
    }
    
    return null;
}

// Find text matches within single text nodes - enhanced with hidden content filtering
function findTextInSingleNodes(searchText) {
    const matches = [];
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Check parent element
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                
                // Skip script, style, and other non-content elements
                const tagName = parent.tagName?.toLowerCase();
                if (['script', 'style', 'noscript', 'template', 'head'].includes(tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                // Enhanced hidden content detection like Chrome
                try {
                    // Check computed styles for visibility
                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || 
                        style.visibility === 'hidden' ||
                        style.opacity === '0') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Check if element has zero dimensions (collapsed)
                    const rect = parent.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                } catch (styleError) {
                    // If we can't get computed style, include the node (fail-safe)
                }
                
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        const text = node.textContent;
        
        // Skip empty or whitespace-only text nodes
        if (!text || !text.trim() || text.trim().length < 1) {
            continue;
        }
        
        // Look for case-insensitive matches
        let searchIndex = 0;
        const searchTextLower = searchText.toLowerCase();
        const textLower = text.toLowerCase();
        
        while (searchIndex < text.length) {
            const index = textLower.indexOf(searchTextLower, searchIndex);
            if (index === -1) break;
            
            // Ensure we don't exceed text bounds
            if (index + searchText.length <= text.length) {
                matches.push({
                    node: node,
                    start: index,
                    end: index + searchText.length,
                    text: text.substring(index, index + searchText.length)
                });
            }
            
            // Move search index forward to find additional matches in the same node
            searchIndex = index + 1;
        }
    }
    
    return matches;
}

// Find text that spans across multiple DOM nodes (enhanced for styled content)
function findTextAcrossNodes(searchText) {
    const matches = [];
    const searchLower = searchText.toLowerCase();
    
    // Try cross-node matching for shorter phrases too, especially for styled content
    const searchWords = searchLower.split(/\s+/).filter(word => word.length > 1);
    
    // Use cross-node matching for phrases that might be broken up by styling
    if (searchText.length < 10 && searchWords.length < 2) {
        return matches; // Skip very short single words
    }
    
    // Get all text nodes in order, including those in styled elements
    const textNodes = [];
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT')) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                // Skip Wikipedia citation markers and edit links
                if (parent && (
                    parent.classList.contains('reference') ||
                    parent.classList.contains('citation') ||
                    parent.classList.contains('mw-editsection') ||
                    parent.tagName === 'SUP' && parent.querySelector('a[href*="#cite"]')
                )) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                // Include all text nodes, even small ones (important for styled content)
                if (node.textContent.trim().length < 1) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) {
        textNodes.push({
            node: node,
            text: node.textContent,
            textLower: node.textContent.toLowerCase(),
            isInLink: node.parentElement && node.parentElement.closest('a'),
            isInFormatting: node.parentElement && node.parentElement.closest('i, b, em, strong, span[style*="italic"], span[style*="bold"]')
        });
    }
    
    // Look for the search text across consecutive text nodes
    for (let i = 0; i < textNodes.length; i++) {
        let combinedText = '';
        let nodeSpan = [];
        
        // Try combining up to 15 consecutive nodes for better Wikipedia support
        for (let j = i; j < Math.min(i + 15, textNodes.length); j++) {
            const currentNode = textNodes[j];
            
            // Add node text to combined text - handle spacing more intelligently for Wikipedia
            if (j === i) {
                combinedText += currentNode.text;
            } else {
                // Check if we need spacing based on the content and formatting context
                const prevText = combinedText.trim();
                const currentText = currentNode.text.trim();
                const prevNode = textNodes[j-1];
                
                if (prevText && currentText) {
                    // Special handling for Wikipedia formatting
                    let needsSpace = true;
                    
                    // No space needed if previous text ends with punctuation
                    if (/[.!?;:,)\]}]$/.test(prevText)) {
                        needsSpace = false;
                    }
                    // No space needed if current text starts with punctuation
                    else if (/^[.!?;:,(\[{]/.test(currentText)) {
                        needsSpace = false;
                    }
                    // No space needed between link text and following punctuation
                    else if (prevNode.isInLink && /^[.!?;:,)\]}]/.test(currentText)) {
                        needsSpace = false;
                    }
                    // No space needed if we're continuing within the same formatting context
                    else if (prevNode.isInFormatting && currentNode.isInFormatting) {
                        // Check if they're in the same formatting element
                        const prevParent = prevNode.node.parentElement.closest('i, b, em, strong');
                        const currentParent = currentNode.node.parentElement.closest('i, b, em, strong');
                        if (prevParent === currentParent) {
                            needsSpace = false;
                        }
                    }
                    
                    combinedText += (needsSpace ? ' ' : '') + currentNode.text;
                } else {
                    combinedText += currentNode.text;
                }
            }
            
            nodeSpan.push(currentNode);
            
            // Check if we have a match in the combined text
            const combinedLower = combinedText.toLowerCase();
            let searchIndex = 0;
            
            // Look for multiple potential matches in the combined text
            while (searchIndex < combinedText.length) {
                const matchIndex = combinedLower.indexOf(searchLower, searchIndex);
                if (matchIndex === -1) break;
                
                // Found a match! Create cross-node match
                const match = createCrossNodeMatch(nodeSpan, matchIndex, searchText.length, searchText);
                if (match) {
                    matches.push(match);
                    log(' Found cross-node match spanning', nodeSpan.length, 'nodes for styled content');
                }
                
                searchIndex = matchIndex + 1;
                
                // Limit matches per node span
                if (matches.length >= 3) break;
            }
            
            // Stop if combined text is getting too long relative to search text
            if (combinedText.length > searchText.length * 8) {
                break;
            }
            
            // For short search text, don't span too many nodes
            if (searchText.length < 30 && nodeSpan.length > 8) {
                break;
            }
            
            // Found matches, move to next starting position
            if (matches.length >= 3) break;
        }
        
        // Limit the total number of matches to prevent performance issues
        if (matches.length >= 10) {
            break;
        }
    }
    
    return matches;
}

// Create a match object for text spanning multiple nodes
function createCrossNodeMatch(nodeSpan, matchIndex, matchLength, originalText) {
    try {
        // Rebuild the combined text exactly as it was constructed to map positions correctly
        let combinedText = '';
        const nodePositions = [];
        
        for (let i = 0; i < nodeSpan.length; i++) {
            const nodeInfo = nodeSpan[i];
            const startPos = combinedText.length;
            
            if (i === 0) {
                combinedText += nodeInfo.text;
            } else {
                // Apply the same spacing logic as in findTextAcrossNodes
                const prevText = combinedText.trim();
                const currentText = nodeInfo.text.trim();
                
                if (prevText && currentText) {
                    const needsSpace = !/[.!?;:,)\]}]$/.test(prevText) && !/^[.!?;:,(\[{]/.test(currentText);
                    const spacer = needsSpace ? ' ' : '';
                    combinedText += spacer + nodeInfo.text;
                } else {
                    combinedText += nodeInfo.text;
                }
            }
            
            nodePositions.push({
                node: nodeInfo.node,
                text: nodeInfo.text,
                startInCombined: startPos,
                endInCombined: combinedText.length
            });
        }
        
        // Find which nodes contain the match
        const matchEnd = matchIndex + matchLength;
        const nodeMatches = [];
        
        for (const nodePos of nodePositions) {
            // Check if this node overlaps with the match range
            const overlapStart = Math.max(matchIndex, nodePos.startInCombined);
            const overlapEnd = Math.min(matchEnd, nodePos.endInCombined);
            
            if (overlapStart < overlapEnd) {
                // This node contains part of the match
                const startInNode = overlapStart - nodePos.startInCombined;
                const endInNode = overlapEnd - nodePos.startInCombined;
                
                // Make sure we don't exceed the actual node text length
                const actualStart = Math.max(0, Math.min(startInNode, nodePos.text.length));
                const actualEnd = Math.max(actualStart, Math.min(endInNode, nodePos.text.length));
                
                if (actualStart < actualEnd) {
                    nodeMatches.push({
                        node: nodePos.node,
                        start: actualStart,
                        end: actualEnd,
                        text: nodePos.text.substring(actualStart, actualEnd)
                    });
                }
            }
        }
        
        // Return a match object
        if (nodeMatches.length > 0) {
            const primaryMatch = nodeMatches[0];
            primaryMatch.crossNodeMatches = nodeMatches;
            primaryMatch.matchType = 'cross-node';
            return primaryMatch;
        }
        
    } catch (error) {
        console.warn('SmartFind: Error creating cross-node match:', error);
    }
    
    return null;
}

// Find fuzzy matches for AI results with improved precision
function findFuzzyMatches(aiResult) {
    const matches = [];
    
    // First try to find the exact AI result as a substring
    const exactMatches = findTextInDOM(aiResult);
    if (exactMatches.length > 0) {
        return exactMatches;
    }
    
    // If no exact match, try more precise fuzzy matching
    const words = aiResult.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    if (words.length === 0) return matches;
    
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        const text = node.textContent;
        const textLower = text.toLowerCase();
        
        // Calculate match score based on word overlap and proximity
        const matchScore = calculateMatchScore(aiResult, text);
        
        // Only consider high-quality matches (stricter threshold)
        if (matchScore >= 0.8) {
            // Find the best matching sentence or phrase
            const bestMatch = findBestMatchingPhrase(aiResult, text);
            if (bestMatch) {
                matches.push({
                    node: node,
                    start: bestMatch.start,
                    end: bestMatch.end,
                    text: bestMatch.text,
                    score: matchScore
                });
            }
        }
    }
    
    // Sort by match score and return top matches
    return matches.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
}

// Calculate match score between AI result and text
function calculateMatchScore(aiResult, text) {
    const aiWords = aiResult.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const textLower = text.toLowerCase();
    
    if (aiWords.length === 0) return 0;
    
    // Check for exact phrase match first
    if (textLower.includes(aiResult.toLowerCase())) {
        return 1.0;
    }
    
    // Calculate word overlap
    const matchedWords = aiWords.filter(word => textLower.includes(word));
    const wordOverlap = matchedWords.length / aiWords.length;
    
    // Check for word proximity (words appearing close together)
    let proximityScore = 0;
    if (matchedWords.length >= 2) {
        const positions = matchedWords.map(word => textLower.indexOf(word));
        const maxDistance = Math.max(...positions) - Math.min(...positions);
        const avgWordLength = aiResult.length / aiWords.length;
        proximityScore = Math.max(0, 1 - (maxDistance / (avgWordLength * aiWords.length * 3)));
    }
    
    // Combine scores with weights
    return (wordOverlap * 0.7) + (proximityScore * 0.3);
}

// Find the best matching phrase within a text node
function findBestMatchingPhrase(aiResult, text) {
    const aiWords = aiResult.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const sentences = text.split(/[.!?]+/);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence.length < 10) continue; // Skip very short sentences
        
        const score = calculateMatchScore(aiResult, trimmedSentence);
        if (score > bestScore && score >= 0.6) {
            const startIndex = text.indexOf(trimmedSentence);
            if (startIndex !== -1) {
                bestMatch = {
                    start: startIndex,
                    end: startIndex + trimmedSentence.length,
                    text: trimmedSentence
                };
                bestScore = score;
            }
        }
    }
    
    // If no good sentence match, try to find the best phrase
    if (!bestMatch && aiWords.length > 0) {
        const textLower = text.toLowerCase();
        const firstWord = aiWords[0];
        const lastWord = aiWords[aiWords.length - 1];
        
        const firstIndex = textLower.indexOf(firstWord);
        const lastIndex = textLower.lastIndexOf(lastWord);
        
        if (firstIndex !== -1 && lastIndex !== -1 && lastIndex > firstIndex) {
            const phraseEnd = lastIndex + lastWord.length;
            const phrase = text.substring(firstIndex, phraseEnd);
            
            if (calculateMatchScore(aiResult, phrase) >= 0.7) {
                bestMatch = {
                    start: firstIndex,
                    end: phraseEnd,
                    text: phrase
                };
            }
        }
    }
    
    return bestMatch;
}

// Remove duplicate matches based on position
function removeDuplicateMatches(matches) {
    const seen = new Set();
    return matches.filter(match => {
        // First validate the match is valid
        if (!match || typeof match !== 'object' || !match.node || !match.node.textContent) {
            return false; // Skip silently - invalid match
        }
        
        // Check for valid range
        const nodeLength = match.node.textContent.length;
        if (typeof match.start !== 'number' || typeof match.end !== 'number' ||
            match.start < 0 || match.end < 0 || match.start >= match.end || match.end > nodeLength) {
            return false; // Skip silently - invalid range
        }
        
        // Check for duplicates
        const key = `${match.node.textContent}-${match.start}-${match.end}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

// Highlight matches with improved error handling and Chrome-like behavior
function highlightMatches(matches, searchType = 'keyword') {
    // Filter out invalid matches before processing to prevent console spam
    const validMatches = matches.filter(match => {
        if (!match || typeof match !== 'object') return false;
        if (!match.node || !match.node.textContent) return false;
        if (typeof match.start !== 'number' || typeof match.end !== 'number') return false;
        if (match.start < 0 || match.end <= match.start) return false;
        if (match.start >= match.node.textContent.length || match.end > match.node.textContent.length) return false;
        return true;
    });
    
    // Only log if there's a significant difference
    const invalidCount = matches.length - validMatches.length;
    if (invalidCount > 0) {
        log(` Filtered ${invalidCount} invalid matches, processing ${validMatches.length} valid matches`);
        
        // If we're getting too many invalid matches, something might be wrong
        if (invalidCount > 100) {
            console.warn('SmartFind: Too many invalid matches detected, potential data corruption');
            updateResultsDisplay(0, 0);
            return; // Skip highlighting to prevent performance issues
        }
    } else {
        log(` Highlighting ${validMatches.length} matches`);
    }
    
    // PREVENT INFINITE LOOPS: Set flag when we're modifying DOM
    isSmartFindModifyingDOM = true;
    
    try {
        clearHighlights(); // Remove previous highlights
        currentHighlights = [];
        totalMatches = validMatches.length;
        
        if (validMatches.length === 0) {
            updateResultsDisplay(0, 0);
            return;
        }
        
        // Group matches by their match index for cross-node highlighting
        const matchGroups = new Map();
        
        validMatches.forEach((match, index) => {
            if (match.matchIndex !== undefined) {
                // This is part of a cross-node match
                if (!matchGroups.has(match.matchIndex)) {
                    matchGroups.set(match.matchIndex, []);
                }
                matchGroups.get(match.matchIndex).push({ ...match, partIndex: index });
            } else {
                // Regular single-node match
                try {
                    // Validate match object structure
                    if (!match || typeof match !== 'object') {
                        return; // Skip silently - invalid match object
                    }
                    
                    if (!match.node || !match.node.textContent || 
                        typeof match.start !== 'number' || typeof match.end !== 'number') {
                        return; // Skip silently - invalid match properties
                    }
                    
                    const nodeLength = match.node.textContent.length;
                    const start = Math.max(0, Math.min(match.start, nodeLength));
                    const end = Math.max(start, Math.min(match.end, nodeLength));
                    
                    // Skip if invalid range (zero-length or out of bounds)
                    if (start >= end || start >= nodeLength || end > nodeLength) {
                        return; // Skip silently - invalid range
                    }
                    
                    // Create highlight element
                    const highlight = document.createElement('span');
                    if (searchType === 'ai') {
                        highlight.className = 'smartfind-highlight smartfind-ai-highlight smartfind-new';
                    } else {
                        highlight.className = 'smartfind-highlight smartfind-keyword-highlight smartfind-new';
                    }
                    highlight.setAttribute('data-smartfind-index', index);
                    
                    // Use robust highlighting
                    if (createRobustHighlight(match.node, start, end, highlight)) {
                        currentHighlights.push(highlight);
                        
                        // Remove the animation class after animation completes
                        setTimeout(() => {
                            highlight.classList.remove('smartfind-new');
                        }, 200);
                    }
                    
                } catch (e) {
                    // Silently skip failed highlights to prevent console spam
                    // Only log critical errors occasionally
                    if (Math.random() < 0.01) { // Log only 1% of errors
                        console.warn('SmartFind: Failed to highlight match (sample error):', e.message);
                    }
                }
            }
        });
        
        // Handle cross-node matches
        matchGroups.forEach((nodeMatches, matchIndex) => {
            highlightCrossNodeMatch(nodeMatches, matchIndex, searchType);
        });
        
        log(' Highlighted', currentHighlights.length, 'matches');
        
    } catch (error) {
        console.error('SmartFind: Error in highlightMatches:', error);
    } finally {
        // CRITICAL: Reset flag after DOM modifications are complete
        // Use a longer delay to ensure all DOM changes and mutations have been processed
        setTimeout(() => {
            isSmartFindModifyingDOM = false;
        }, 500); // Increased delay to ensure all mutations are processed
    }
}

// Create a robust highlight that handles styled text (italics, bold, etc.)
function createRobustHighlight(textNode, start, end, highlight) {
    try {
        // Validate inputs first
        if (!textNode || !textNode.textContent || 
            typeof start !== 'number' || typeof end !== 'number' ||
            start < 0 || end <= start || end > textNode.textContent.length ||
            !highlight) {
            return false; // Skip silently - invalid parameters
        }
        
        // Check if the text node is inside a link or other interactive element
        const parentElement = textNode.parentElement;
        const isInInteractiveElement = parentElement && (
            parentElement.tagName === 'A' || 
            parentElement.tagName === 'BUTTON' ||
            parentElement.closest('a, button, [onclick], [role="button"]')
        );
        
        // For interactive elements, use a more careful approach
        if (isInInteractiveElement) {
            log(' Highlighting text inside interactive element, using careful approach');
            return createHighlightInInteractiveElement(textNode, start, end, highlight);
        }
        
        // First try the standard approach - it works for most cases
        try {
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, end);
            range.surroundContents(highlight);
            return true;
        } catch (surroundError) {
            // If surroundContents fails (likely due to styled content), fall back to manual splitting
            log(' surroundContents failed, using text splitting method for styled content');
            return createHighlightWithSplitting(textNode, start, end, highlight);
        }
        
    } catch (e) {
        // Rate limit error logging to prevent console spam
        if (Math.random() < 0.01) {
            console.warn('SmartFind: Failed to create robust highlight (sample error):', e.message);
        }
        return false;
    }
}

// Special handling for highlights inside interactive elements like links
function createHighlightInInteractiveElement(textNode, start, end, highlight) {
    try {
        // For links and buttons, we want to preserve their functionality
        // So we'll use a more subtle highlighting approach
        const originalText = textNode.textContent;
        const beforeText = originalText.substring(0, start);
        const matchText = originalText.substring(start, end);
        const afterText = originalText.substring(end);
        
        // Set the highlight content
        highlight.textContent = matchText;
        
        // Add a special class for interactive element highlights
        highlight.classList.add('smartfind-interactive-highlight');
        
        // Preserve multi-term color classes for interactive elements
        if (highlight.classList.contains('smartfind-multiterm-highlight')) {
            // Keep the color class for multi-term highlights in interactive elements
            const colorClasses = Array.from(highlight.classList).filter(cls => cls.startsWith('smartfind-multiterm-'));
            colorClasses.forEach(cls => highlight.classList.add(cls));
        }
        
        // Get the parent element
        const parent = textNode.parentNode;
        if (!parent) {
            return false;
        }
        
        // Create new text nodes for before and after text
        const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
        const afterNode = afterText ? document.createTextNode(afterText) : null;
        
        // Insert nodes in the correct order
        if (beforeNode) {
            parent.insertBefore(beforeNode, textNode);
        }
        parent.insertBefore(highlight, textNode);
        if (afterNode) {
            parent.insertBefore(afterNode, textNode);
        }
        
        // Remove the original text node
        parent.removeChild(textNode);
        
        return true;
        
    } catch (e) {
        // Rate limit error logging to prevent console spam
        if (Math.random() < 0.01) {
            console.warn('SmartFind: Failed to create highlight in interactive element (sample error):', e.message);
        }
        return false;
    }
}

// Create highlight by manually splitting text nodes
function createHighlightWithSplitting(textNode, start, end, highlight) {
    try {
        const originalText = textNode.textContent;
        const beforeText = originalText.substring(0, start);
        const matchText = originalText.substring(start, end);
        const afterText = originalText.substring(end);
        
        // Set the highlight content
        highlight.textContent = matchText;
        
        // Get the parent element
        const parent = textNode.parentNode;
        if (!parent) {
            return false;
        }
        
        // Create new text nodes for before and after text
        const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
        const afterNode = afterText ? document.createTextNode(afterText) : null;
        
        // Insert nodes in the correct order
        if (beforeNode) {
            parent.insertBefore(beforeNode, textNode);
        }
        parent.insertBefore(highlight, textNode);
        if (afterNode) {
            parent.insertBefore(afterNode, textNode);
        }
        
        // Remove the original text node
        parent.removeChild(textNode);
        
        return true;
        
    } catch (e) {
        // Rate limit error logging to prevent console spam
        if (Math.random() < 0.01) {
            console.warn('SmartFind: Failed to create highlight with splitting (sample error):', e.message);
        }
        return false;
    }
}

// Highlight a match that spans multiple nodes
function highlightCrossNodeMatch(nodeMatches, matchIndex, searchType) {
    nodeMatches.forEach((nodeMatch, partIndex) => {
        try {
            // Validate cross-node match structure
            if (!nodeMatch || typeof nodeMatch !== 'object' ||
                !nodeMatch.node || !nodeMatch.node.textContent ||
                typeof nodeMatch.start !== 'number' || typeof nodeMatch.end !== 'number') {
                return; // Skip silently - invalid cross-node match
            }
            
            const nodeLength = nodeMatch.node.textContent.length;
            const start = Math.max(0, Math.min(nodeMatch.start, nodeLength));
            const end = Math.max(start, Math.min(nodeMatch.end, nodeLength));
            
            // Skip if invalid range (zero-length or out of bounds)
            if (start >= end || start >= nodeLength || end > nodeLength) {
                return; // Skip silently - invalid cross-node range
            }
            
            // Create highlight element
            const highlight = document.createElement('span');
            if (searchType === 'ai') {
                highlight.className = 'smartfind-highlight smartfind-ai-highlight smartfind-cross-node smartfind-new';
            } else {
                highlight.className = 'smartfind-highlight smartfind-keyword-highlight smartfind-cross-node smartfind-new';
            }
            highlight.setAttribute('data-smartfind-index', matchIndex);
            highlight.setAttribute('data-smartfind-part', partIndex);
            
            // Use robust highlighting for cross-node matches too
            if (createRobustHighlight(nodeMatch.node, start, end, highlight)) {
                currentHighlights.push(highlight);
                
                // Remove the animation class after animation completes
                setTimeout(() => {
                    highlight.classList.remove('smartfind-new');
                }, 200);
            }
            
        } catch (e) {
            // Silently skip failed cross-node highlights to prevent console spam
            if (Math.random() < 0.01) { // Log only 1% of errors
                console.warn('SmartFind: Failed to highlight cross-node match (sample error):', e.message);
            }
        }
    });
}

// Clear all highlights - inline restoration like Chrome
function clearHighlights() {
    // PREVENT INFINITE LOOPS: Set flag when we're modifying DOM - keep it simple
    if (currentHighlights.length === 0) {
        return; // Nothing to clear
    }
    
    isSmartFindModifyingDOM = true;
    
    try {
        currentHighlights.forEach(highlight => {
            const parent = highlight.parentNode;
            if (parent) {
                // Restore original text inline
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize(); // Merge adjacent text nodes for clean DOM
            }
        });
        currentHighlights = [];
        currentHighlightIndex = -1;
        totalMatches = 0;
    } catch (error) {
        console.error('SmartFind: Error clearing highlights:', error);
    } finally {
        // Reset flag after DOM modifications - use setTimeout for more reliable timing
        setTimeout(() => {
            isSmartFindModifyingDOM = false;
        }, 500); // Increased delay to ensure all mutations are processed
    }
}

// Navigate through search results
function navigateResults(direction) {
    if (totalMatches === 0) return;
    
    // Remove current highlight
    if (currentHighlightIndex >= 0 && currentHighlights[currentHighlightIndex]) {
        currentHighlights[currentHighlightIndex].classList.remove('smartfind-current');
    }
    
    // Calculate new index - Chrome-style cycling
    currentHighlightIndex += direction;
    if (currentHighlightIndex >= totalMatches) {
        currentHighlightIndex = 0;
    } else if (currentHighlightIndex < 0) {
        currentHighlightIndex = totalMatches - 1;
    }
    
    // Highlight current match and scroll to it
    scrollToHighlight(currentHighlightIndex);
    updateResultsDisplay(currentHighlightIndex + 1, totalMatches);
}

// Scroll to specific highlight - instant like Chrome
function scrollToHighlight(index) {
    if (index >= 0 && index < currentHighlights.length) {
        const highlight = currentHighlights[index];
        highlight.classList.add('smartfind-current');
        
        // Chrome uses instant scrolling for better productivity
        highlight.scrollIntoView({
            behavior: 'instant',
            block: 'center',
            inline: 'nearest'
        });
    }
}

// Update results display - simplified to match Chrome behavior
function updateResultsDisplay(current, total) {
    if (searchResults) {
        if (total === 0) {
            searchResults.style.display = 'none';
        } else {
            searchResults.style.display = 'block';
            let displayText = total === 1 ? '1/1' : `${current}/${total}`;
            
            // Add a small indicator when using cursor-based search
            if (userHasClicked && lastClickPosition && total > 1) {
                displayText += ' ↗'; // Small arrow to indicate cursor-based ordering
            }
            
            searchResults.textContent = displayText;
        }
    }
    
    // Note: Removed button disable logic - Chrome allows navigation even with single results
}

// Set status message
function setStatus(message, type = '') {
    const statusElement = document.getElementById('smartfind-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `smartfind-status ${type}`;
        
        if (message) {
            statusElement.style.display = 'block';
        } else {
            statusElement.style.display = 'none';
        }
    }
}

// Show sign-in prompt when authentication is required
function showSignInPrompt(errorMessage) {
    const statusElement = document.getElementById('smartfind-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span>Sign in for smart search</span>
                <button id="smartfind-sign-in" style="
                    background: #0969da; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-size: 11px; 
                    cursor: pointer;
                    white-space: nowrap;
                ">Sign In</button>
            </div>
        `;
        statusElement.className = 'smartfind-status info';
        statusElement.style.display = 'block';
        
        // Add click handler for sign-in button
        const signInButton = document.getElementById('smartfind-sign-in');
        if (signInButton) {
            signInButton.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: "openPopup" });
                setStatus('Click the SmartFind extension icon to sign in', 'info');
            });
        }
    }
}

// Show payment option when user hits limit - user is already signed in, just needs more tokens
function showPaymentOption(errorMessage) {
    const statusElement = document.getElementById('smartfind-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span>Credits exhausted - Purchase more tokens</span>
                <button id="smartfind-credit-action" style="
                    background: #0969da; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-size: 11px; 
                    cursor: pointer;
                    white-space: nowrap;
                ">Get Tokens</button>
            </div>
        `;
        statusElement.className = 'smartfind-status error';
        statusElement.style.display = 'block';
        
        // Add click handler for action button
        const actionButton = document.getElementById('smartfind-credit-action');
        if (actionButton) {
            actionButton.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: "openPopup" });
                setStatus('Click the SmartFind extension icon to purchase tokens', 'info');
            });
        }
    }
}



// Update placeholder text based on input - simplified
function updatePlaceholder() {
    if (!searchInput) return;
    
    const value = searchInput.value;
    
    if (value.startsWith('/')) {
        searchInput.placeholder = 'AI search...';
    } else if (value.startsWith("'")) {
        searchInput.placeholder = 'Exact search...';
    } else if (value.startsWith('*')) {
        searchInput.placeholder = 'Regex search...';
    } else if (value.includes(',')) {
        searchInput.placeholder = 'Multi-term search...';
    } else {
        searchInput.placeholder = 'Search... (/, \', * for AI, exact, regex)';
    }
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Show loading state for AI search - minimal like Chrome
function setAISearchLoadingState() {
    const resultsElement = document.getElementById('smartfind-results');
    if (resultsElement) {
        resultsElement.textContent = '...';
    }
}

// Clear loading state for AI search - minimal like Chrome
function clearAISearchLoadingState() {
    // Status clears automatically when results are shown
}

// Show empty results state for AI search - minimal like Chrome
function setAIEmptyResultsState() {
    updateResultsDisplay(0, 0);
}

// Handle search for a specific query (used by both user input and dynamic re-search)
async function handleSearchForQuery(rawQuery) {
    log('handleSearchForQuery called with:', rawQuery);
    
    // CRITICAL: Prevent infinite loops by setting flag during search
    if (isSearchingInProgress) {
        return;
    }
    
    isSearchingInProgress = true; // Set flag to prevent mutation-triggered re-searches
    
    try {
        lastQuery = rawQuery;
        activeQuery = rawQuery; // Set active query for dynamic re-search
        
        // Track meaningful queries (2+ chars) for dynamic re-search
        if (rawQuery && rawQuery.length >= 2) {
            lastMeaningfulQuery = rawQuery;
        }
        
        log('Set activeQuery to:', activeQuery);
        
        // Parse search mode and clean query
        const searchMode = parseSearchMode(rawQuery);
        const query = searchMode.cleanQuery;
        
        log(' Search mode:', searchMode.mode, 'Clean query:', query);
        
        isSearching = true;
        
        try {
            // Check for multi-term query first
            const multiTermQuery = parseMultiTermQuery(query);
            
            if (multiTermQuery.isMultiTerm && searchMode.mode !== 'forceAI') {
                // Multi-term search - use different colors for each term
                log(' Detected multi-term search with', multiTermQuery.terms.length, 'terms');
                setInputStyling('multiterm', false);
                performMultiTermSearch(multiTermQuery.terms);
            } else if (searchMode.mode === 'forceKeyword') {
                // Force keyword search with ' prefix
                log(' Forcing keyword search');
                setInputStyling('keyword', true);
                performNativeSearch(query);
            } else if (searchMode.mode === 'regex') {
                // Force regex search with * prefix
                log(' Forcing regex search');
                setInputStyling('regex', true);
                performRegexSearch(query);
            } else if (searchMode.mode === 'forceAI') {
                // Force AI search with / prefix
                log(' Forcing AI search');
                setInputStyling('ai', true);
                await performForcedAISearch(query);
            } else {
                // Progressive search: keyword first for immediate response, then AI if no matches
                log(' Starting progressive search - trying keyword first');
                resetInputStyling();
                
                const keywordResults = performNativeSearch(query);
                
                if (keywordResults === 0) {
                    // No exact matches - schedule AI search after user stops typing
                    log(' No keyword matches, scheduling AI search...');
                    debouncedAISearch(query);
                }
            }
        } catch (error) {
            console.error('SmartFind search error:', error);
            
            // Simple error handling - fallback to keyword search
            try {
                performNativeSearch(query);
                setStatus('Using keyword search', 'warning');
            } catch (fallbackError) {
                console.error('SmartFind: Fallback search also failed:', fallbackError);
                setStatus('Search unavailable - please refresh page', 'error');
            }
            resetInputStyling();
        }
        
        isSearching = false;
        log('Search completed. ActiveQuery is still:', activeQuery);
        
    } finally {
        // CRITICAL: Always clear the flag, even if search fails
        isSearchingInProgress = false;
    }
}

// Show extended search confirmation prompt
function showExtendedSearchPrompt(query, estimatedTokens = 3) {
    
    const statusElement = document.getElementById('smartfind-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span>Smart Search? ~${estimatedTokens} tokens</span>
                <span style="font-size: 11px; color: #656d76;">Enter to continue</span>
            </div>
        `;
        statusElement.className = 'smartfind-status info';
        statusElement.style.display = 'block';
    }
    
    // Set the waiting state
    isWaitingForExtendedConfirmation = true;
    pendingExtendedSearch = { query, estimatedTokens };
}

// Clear extended search prompt
function clearExtendedSearchPrompt() {
    
    isWaitingForExtendedConfirmation = false;
    pendingExtendedSearch = null;
    setStatus('');
    
}

// Check if content requires extended search
function requiresExtendedSearch(content, query) {
    // Always check content length first
    if (content.length <= CONTENT_EXTRACTION_CONFIG.extendedSearchThreshold) {
        return false;
    }
    
    // For forced AI searches (/query), don't prompt - user already committed
    if (query.startsWith('/')) {
        return false;
    }
    
    // For natural language queries on large content, suggest extended search
    return true;
}

// Estimate tokens needed for extended search
function estimateExtendedSearchTokens(content) {
    const chunks = Math.min(
        Math.ceil(content.length / CONTENT_EXTRACTION_CONFIG.chunkSize),
        CONTENT_EXTRACTION_CONFIG.maxChunks
    );
    return Math.max(2, chunks); // Minimum 2, maximum based on chunks
}

// Smart content chunking with keyword pre-filtering
function createSmartChunks(content, query) {
    log('Creating smart chunks for content length:', content.length);
    
    // Step 1: Split content into semantic sections
    const sections = splitIntoSemanticSections(content);
    log('Split into', sections.length, 'semantic sections');
    
    // Step 2: Create chunks with optimal size
    const chunks = [];
    let currentChunk = '';
    let currentChunkSections = [];
    
    for (const section of sections) {
        // If adding this section would exceed chunk size, finalize current chunk
        if (currentChunk.length + section.length > CONTENT_EXTRACTION_CONFIG.chunkSize && currentChunk.length > 0) {
            chunks.push({
                content: currentChunk.trim(),
                sections: currentChunkSections,
                startIndex: chunks.length
            });
            currentChunk = '';
            currentChunkSections = [];
        }
        
        currentChunk += section + '\n\n';
        currentChunkSections.push(section);
        
        // If we've reached max chunks, break
        if (chunks.length >= CONTENT_EXTRACTION_CONFIG.maxChunks - 1) {
            break;
        }
    }
    
    // Add the last chunk
    if (currentChunk.trim().length > 0) {
        chunks.push({
            content: currentChunk.trim(),
            sections: currentChunkSections,
            startIndex: chunks.length
        });
    }
    
    // Step 3: Pre-filter chunks by keyword relevance
    const filteredChunks = prefilterChunksByKeywords(chunks, query);
    log('Filtered to', filteredChunks.length, 'relevant chunks');
    
    return filteredChunks.slice(0, CONTENT_EXTRACTION_CONFIG.maxChunks);
}

// Split content into semantic sections
function splitIntoSemanticSections(content) {
    const sections = [];
    
    // Split by multiple paragraph breaks first
    let parts = content.split(/\n\s*\n\s*\n/);
    
    for (const part of parts) {
        if (part.trim().length < 50) continue;
        
        // Further split by headings or strong separators
        const subParts = part.split(/(?=\n[A-Z][^\n]{10,100}\n)|(?=\n\d+\.\s)|(?=\n[•\-\*]\s)/);
        
        for (const subPart of subParts) {
            const trimmed = subPart.trim();
            if (trimmed.length >= 100) { // Minimum section size
                sections.push(trimmed);
            }
        }
    }
    
    // If we don't have good semantic sections, split by size
    if (sections.length < 3) {
        log('Falling back to size-based chunking');
        return splitBySize(content, CONTENT_EXTRACTION_CONFIG.chunkSize);
    }
    
    return sections;
}

// Fallback: split content by size with sentence boundaries
function splitBySize(content, chunkSize) {
    const chunks = [];
    const sentences = content.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += sentence + ' ';
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

// Pre-filter chunks based on keyword relevance
function prefilterChunksByKeywords(chunks, query) {
    // Extract meaningful keywords from query
    const keywords = extractKeywords(query);
    if (keywords.length === 0) {
        // If no keywords, return all chunks (probably a very natural language query)
        return chunks;
    }
    
    log('Extracted keywords:', keywords);
    
    // Score each chunk
    const scoredChunks = chunks.map(chunk => {
        const score = calculateKeywordScore(chunk.content, keywords);
        return { ...chunk, relevanceScore: score };
    });
    
    // Sort by relevance score
    scoredChunks.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Filter out chunks with very low scores, but always keep at least 2 chunks
    const threshold = CONTENT_EXTRACTION_CONFIG.keywordPrefilterThreshold;
    const relevantChunks = scoredChunks.filter(chunk => chunk.relevanceScore >= threshold);
    
    if (relevantChunks.length >= 2) {
        return relevantChunks;
    } else {
        // Keep top chunks even if below threshold
        return scoredChunks.slice(0, Math.max(2, Math.min(chunks.length, 3)));
    }
}

// Extract meaningful keywords from query
function extractKeywords(query) {
    // Remove common prefixes
    const cleanQuery = query.replace(/^[\/'"]/, '').toLowerCase();
    
    // Split into words and filter
    const words = cleanQuery.split(/\s+/).filter(word => {
        return word.length >= 3 && 
               !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'].includes(word);
    });
    
    // Also extract phrases (2-3 words)
    const phrases = [];
    for (let i = 0; i < words.length - 1; i++) {
        if (words[i].length >= 3 && words[i + 1].length >= 3) {
            phrases.push(words[i] + ' ' + words[i + 1]);
        }
    }
    
    return [...words, ...phrases];
}

// Calculate keyword relevance score for a chunk
function calculateKeywordScore(content, keywords) {
    const contentLower = content.toLowerCase();
    const totalWords = content.split(/\s+/).length;
    let matchCount = 0;
    
    for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        // Count occurrences, giving more weight to exact matches
        const exactMatches = (contentLower.match(new RegExp('\\b' + escapeRegExp(keywordLower) + '\\b', 'g')) || []).length;
        const partialMatches = (contentLower.match(new RegExp(escapeRegExp(keywordLower), 'g')) || []).length - exactMatches;
        
        matchCount += exactMatches * 2 + partialMatches * 0.5;
    }
    
    // Return ratio of matches to total words
    return matchCount / totalWords;
}

// Perform extended AI search with parallel chunk processing
async function performExtendedAISearch(query) {
    const content = extractPageContent();
    
    // Create smart chunks
    const chunks = createSmartChunks(content, query);
    log(`Performing extended search with ${chunks.length} chunks`);
    
    // Show loading state
    setStatus(`Searching ${chunks.length} sections...`, 'loading');
    setAISearchLoadingState();
    
    try {
        // Perform parallel AI searches
        const searchPromises = chunks.map((chunk, index) => 
            performChunkSearch(query, chunk, index)
        );
        
        const results = await Promise.all(searchPromises);
        
        // Clear loading state
        clearAISearchLoadingState();
        
        // Aggregate and process results
        const aggregatedResults = aggregateSearchResults(results, query);
        
        // Check if we got a credit error
        if (aggregatedResults && aggregatedResults.creditError) {
            clearAISearchLoadingState();
            showPaymentOption(aggregatedResults.errorMessage);
            return;
        }
        
        if (aggregatedResults && aggregatedResults.length > 0) {
            // Process successful results
            const actualHighlights = performAISearch(aggregatedResults);
            if (actualHighlights === 0) {
                setAIEmptyResultsState();
                setStatus('No matches found in content', 'warning');
            } else {
                setStatus(`Found in ${chunks.length} sections`, 'success');
            }
        } else {
            setAIEmptyResultsState();
            setStatus('No relevant content found', 'info');
        }
        
    } catch (error) {
        clearAISearchLoadingState();
        logError('Extended search failed:', error);
        setStatus('Extended search failed', 'error');
    }
}

// Perform AI search on a single chunk
async function performChunkSearch(query, chunk, chunkIndex) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "performAISearch",
            query: query,
            content: chunk.content,
            chunkIndex: chunkIndex,
            isExtendedSearch: true
        }, (response) => {
            if (chrome.runtime.lastError) {
                logError('Chunk search error:', chrome.runtime.lastError);
                resolve({ error: chrome.runtime.lastError.message, chunkIndex });
            } else {
                resolve({ ...response, chunkIndex });
            }
        });
    });
}

// Aggregate results from multiple chunk searches
function aggregateSearchResults(results, query) {
    log('Aggregating results from', results.length, 'chunks');
    
    const validResults = [];
    const errors = [];
    const creditErrors = [];
    
    for (const result of results) {
        if (result.error) {
            errors.push(result);
            // Check if this is a credit-related error
            if (result.error.includes('Credits exhausted') || 
                result.error.includes('purchase more tokens')) {
                creditErrors.push(result);
            }
        } else if (result.success && result.result) {
            // Add chunk info to results
            const chunkResults = Array.isArray(result.result) ? result.result : [result.result];
            for (const item of chunkResults) {
                validResults.push({
                    text: item,
                    chunkIndex: result.chunkIndex,
                    source: `chunk_${result.chunkIndex}`
                });
            }
        }
    }
    
    log(`Found ${validResults.length} valid results, ${errors.length} errors, ${creditErrors.length} credit errors`);
    
    // If we have credit errors, return them as a special error result
    if (creditErrors.length > 0) {
        return { 
            creditError: true, 
            errorMessage: creditErrors[0].error,
            totalErrors: creditErrors.length 
        };
    }
    
    if (errors.length > 0) {
        logError('Some chunk searches failed:', errors);
    }
    
    if (validResults.length === 0) {
        return null;
    }
    
    // Sort results by relevance and remove duplicates
    const rankedResults = rankAndDeduplicateResults(validResults, query);
    
    // Return top results (limit to avoid overwhelming the user)
    return rankedResults.slice(0, 10).map(result => result.text);
}

// Rank and deduplicate results
function rankAndDeduplicateResults(results, query) {
    // Calculate relevance scores
    const scoredResults = results.map(result => ({
        ...result,
        relevanceScore: calculateResultRelevance(result.text, query)
    }));
    
    // Sort by relevance
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Remove duplicates (similar results)
    const uniqueResults = [];
    for (const result of scoredResults) {
        const isDuplicate = uniqueResults.some(existing => 
            calculateTextSimilarity(result.text, existing.text) > 0.8
        );
        
        if (!isDuplicate) {
            uniqueResults.push(result);
        }
    }
    
    return uniqueResults;
}

// Calculate relevance score for a result
function calculateResultRelevance(text, query) {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return 0.5; // Default score for non-keyword queries
    
    return calculateKeywordScore(text, keywords);
}

// Calculate text similarity between two strings
function calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // Jaccard similarity
}

// Debounced AI search - only triggers after user stops typing
function debouncedAISearch(query) {
    
    // Clear any existing timeout
    if (aiSearchTimeout) {
        clearTimeout(aiSearchTimeout);
    }
    
    // Set new timeout
    aiSearchTimeout = setTimeout(async () => {
        
        // Check if this is still the current query
        if (query !== searchInput?.value?.trim()) {
            return;
        }
        
        // Check if we still need AI search (user might have found what they wanted with keyword search)
        if (currentHighlights.length > 0) {
            return;
        }
        
        // CRITICAL: Check authentication before attempting AI search
        try {
            const authCheck = await chrome.storage.local.get(['authToken', 'currentUser']);
            const isAuthenticated = !!(authCheck.authToken && authCheck.currentUser);
            
            if (!isAuthenticated) {
                showSignInPrompt("Please sign in to use AI search features. Click the SmartFind extension icon to sign in.");
                return;
            }
        } catch (error) {
            return;
        }
        
        setInputStyling('ai', false);
        await performProgressiveAISearch(query);
        
        aiSearchTimeout = null; // Clear the reference
    }, 800); // Wait 800ms after user stops typing
}
