// SmartFind content script

console.log('SmartFind: Content script loaded on:', window.location.href);

// Global variables
let searchBar = null;
let searchInput = null;
let searchResults = null;
let currentHighlights = [];
let currentHighlightIndex = -1;
let totalMatches = 0;
let isSearching = false;
let lastQuery = '';

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('SmartFind: Content script received message:', request.action);
    
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
            console.error('SmartFind: Error in toggleUI:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Keep the message channel open for async response
    }
});

// Test if content script is working
console.log('SmartFind: Content script setup complete');

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

// Add a simple test function that can be called from console
window.smartfindTest = function() {
    console.log('SmartFind: Manual test triggered');
    toggleSearchBar();
};

// Toggle search bar visibility
function toggleSearchBar() {
    console.log('SmartFind: toggleSearchBar called, searchBar exists:', !!searchBar);
    console.log('SmartFind: document.body exists:', !!document.body);
    console.log('SmartFind: document.readyState:', document.readyState);
    
    if (!searchBar) {
        createSearchBar();
    } else {
        if (searchBar.classList.contains('smartfind-hidden')) {
            console.log('SmartFind: Showing search bar');
            searchBar.classList.remove('smartfind-hidden');
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            console.log('SmartFind: Hiding search bar');
            hideSearchBar();
        }
    }
}

// Hide search bar and clear highlights
function hideSearchBar() {
    if (searchBar) {
        searchBar.classList.add('smartfind-hidden');
        clearHighlights();
    }
}

// Create search bar UI
function createSearchBar() {
    console.log('SmartFind: Creating search bar');
    
    // Check if document.body is available
    if (!document.body) {
        console.error('SmartFind: document.body is not available');
        return;
    }
    
    searchBar = document.createElement('div');
    searchBar.id = 'smartfind-search-bar';
    searchBar.className = 'smartfind-container';
    
    console.log('SmartFind: Created div element:', searchBar);
    
    searchBar.innerHTML = `
        <div class="smartfind-search-box">
            <input type="text" id="smartfind-input" placeholder="Search: emails, names, headings, or ask a question..." autocomplete="off" spellcheck="false">
            <div class="smartfind-controls">
                <span id="smartfind-results" class="smartfind-results">0 of 0</span>
                <button id="smartfind-prev" class="smartfind-nav-btn" title="Previous result (Shift+Enter)">↑</button>
                <button id="smartfind-next" class="smartfind-nav-btn" title="Next result (Enter)">↓</button>
                <button id="smartfind-close" class="smartfind-close-btn" title="Close (Escape)">×</button>
            </div>
        </div>
        <div id="smartfind-status" class="smartfind-status"></div>
    `;
    
    console.log('SmartFind: Set innerHTML, about to append to body');
    
    try {
        document.body.appendChild(searchBar);
        console.log('SmartFind: Search bar added to DOM successfully');
        console.log('SmartFind: Search bar element:', searchBar);
        console.log('SmartFind: Search bar parent:', searchBar.parentElement);
    } catch (error) {
        console.error('SmartFind: Error appending to body:', error);
        return;
    }
    
    // Get references to elements
    searchInput = document.getElementById('smartfind-input');
    searchResults = document.getElementById('smartfind-results');
    
    console.log('SmartFind: searchInput element:', searchInput);
    console.log('SmartFind: searchResults element:', searchResults);
    
    if (!searchInput || !searchResults) {
        console.error('SmartFind: Failed to get references to search elements');
        console.error('SmartFind: searchInput found:', !!searchInput);
        console.error('SmartFind: searchResults found:', !!searchResults);
        return;
    }
    
    // Add event listeners
    setupEventListeners();
    
    // Show and focus the input
    console.log('SmartFind: About to show search bar');
    
    if (searchInput) {
        searchInput.focus();
        console.log('SmartFind: Focused input element');
    }
    
    console.log('SmartFind: Search bar creation complete');
}

// Setup all event listeners
function setupEventListeners() {
    console.log('SmartFind: Setting up event listeners');
    
    // Input events
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    searchInput.addEventListener('input', updatePlaceholder);
    searchInput.addEventListener('keydown', handleKeyDown);
    
    // Button events
    document.getElementById('smartfind-next').addEventListener('click', () => navigateResults(1));
    document.getElementById('smartfind-prev').addEventListener('click', () => navigateResults(-1));
    document.getElementById('smartfind-close').addEventListener('click', hideSearchBar);
    
    // Global escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchBar && !searchBar.classList.contains('smartfind-hidden')) {
            hideSearchBar();
        }
    });
    
    console.log('SmartFind: Event listeners set up successfully');
}

// Handle keyboard shortcuts in search input
function handleKeyDown(e) {
    switch (e.key) {
        case 'Enter':
            e.preventDefault();
            if (e.shiftKey) {
                navigateResults(-1); // Previous
            } else {
                navigateResults(1); // Next
            }
            break;
        case 'Escape':
            hideSearchBar();
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

// Main search handler with progressive search
async function handleSearch() {
    const rawQuery = searchInput.value.trim();
    console.log('SmartFind: handleSearch called with query:', rawQuery);
    
    if (!rawQuery) {
        clearHighlights();
        updateResultsDisplay(0, 0);
        setStatus('');
        resetInputStyling();
        return;
    }
    
    if (rawQuery === lastQuery) return;
    lastQuery = rawQuery;
    
    // Parse search mode and clean query
    const searchMode = parseSearchMode(rawQuery);
    const query = searchMode.cleanQuery;
    
    console.log('SmartFind: Search mode:', searchMode.mode, 'Clean query:', query);
    
    setStatus('Searching...', 'loading');
    isSearching = true;
    
    try {
        if (searchMode.mode === 'forceKeyword') {
            // Force keyword search with ' prefix
            console.log('SmartFind: Forcing keyword search');
            setInputStyling('keyword', true);
            const keywordResults = performNativeSearch(query);
            if (keywordResults > 0) {
                setStatus(`Keyword search (forced) - ${keywordResults} match${keywordResults > 1 ? 'es' : ''}`, 'success');
            } else {
                setStatus('Keyword search (forced) - no matches', 'warning');
            }
        } else if (searchMode.mode === 'forceAI') {
            // Force AI search with / prefix
            console.log('SmartFind: Forcing AI search');
            setInputStyling('ai', true);
            await performForcedAISearch(query);
        } else {
            // Progressive search: keyword first, then AI if no matches
            console.log('SmartFind: Starting progressive search - trying keyword first');
            resetInputStyling();
            
            const keywordResults = performNativeSearch(query);
            
            if (keywordResults > 0) {
                // Found exact matches - we're done!
                setStatus(`Found ${keywordResults} exact match${keywordResults > 1 ? 'es' : ''}`, 'success');
            } else {
                // No exact matches - try AI search
                console.log('SmartFind: No keyword matches, trying AI search...');
                setStatus('No exact matches. Searching with AI...', 'loading');
                setInputStyling('ai', false);
                
                await performProgressiveAISearch(query);
            }
        }
    } catch (error) {
        console.error('SmartFind search error:', error);
        
        // Handle specific error types
        if (error instanceof DOMException) {
            console.error('SmartFind: DOM Exception occurred:', error.name, error.message);
            setStatus('Search error - please try again', 'error');
        } else if (error instanceof RangeError) {
            console.error('SmartFind: Range Error occurred:', error.message);
            setStatus('Search error - please try again', 'error');
        } else {
            // Fallback to keyword search for other errors
            try {
                performNativeSearch(query);
                setStatus('Search error - using keyword search', 'warning');
            } catch (fallbackError) {
                console.error('SmartFind: Fallback search also failed:', fallbackError);
                setStatus('Search unavailable - please refresh page', 'error');
            }
        }
        resetInputStyling();
    }
    
    isSearching = false;
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
    } else {
        return {
            mode: 'progressive',
            cleanQuery: query,
            prefix: null
        };
    }
}

// Set input styling based on search mode
function setInputStyling(mode, isForced) {
    if (!searchInput) return;
    
    // Reset all styling
    searchInput.style.borderLeft = '';
    searchInput.classList.remove('smartfind-ai-mode', 'smartfind-keyword-mode', 'smartfind-forced-mode');
    
    if (mode === 'ai') {
        searchInput.style.borderLeft = '3px solid #0969da';
        searchInput.classList.add('smartfind-ai-mode');
        if (isForced) {
            searchInput.classList.add('smartfind-forced-mode');
        }
    } else if (mode === 'keyword') {
        searchInput.style.borderLeft = '3px solid #1a7f37';
        searchInput.classList.add('smartfind-keyword-mode');
        if (isForced) {
            searchInput.classList.add('smartfind-forced-mode');
        }
    }
}

// Reset input styling
function resetInputStyling() {
    if (!searchInput) return;
    searchInput.style.borderLeft = '';
    searchInput.classList.remove('smartfind-ai-mode', 'smartfind-keyword-mode', 'smartfind-forced-mode');
}

// Perform forced AI search
async function performForcedAISearch(query) {
    const content = extractPageContent();
    
    // Get search intent for better status messages
    const intent = getSearchIntent(query);
    const searchDescription = intent ? intent.description : 'content';
    
    setStatus(`AI searching for ${searchDescription}...`, 'loading');
    
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
    
    if (response.success && response.result) {
        const actualHighlights = performAISearch(response.result);
        if (actualHighlights > 0) {
            setStatus(`Found ${actualHighlights} ${searchDescription} match${actualHighlights > 1 ? 'es' : ''}`, 'success');
        } else {
            setStatus(`No ${searchDescription} found`, 'warning');
        }
    } else if (response.error) {
        if (response.error.includes('Free tier limit reached') || response.error.includes('purchase more tokens')) {
            showPaymentOption(response.error);
        } else {
            setStatus(`AI search failed: ${response.error}`, 'error');
        }
    } else {
        setStatus('AI search failed', 'error');
    }
}

// Perform progressive AI search (fallback from keyword)
async function performProgressiveAISearch(query) {
    const content = extractPageContent();
    
    // Get search intent for better status messages
    const intent = getSearchIntent(query);
    const searchDescription = intent ? intent.description : 'related content';
    
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
                resolve(response);
            }
        });
    });
    
    if (response.success && response.result) {
        const actualHighlights = performAISearch(response.result);
        if (actualHighlights > 0) {
            setStatus(`AI found ${actualHighlights} ${searchDescription} match${actualHighlights > 1 ? 'es' : ''}`, 'success');
        } else {
            setStatus(`No ${searchDescription} found`, 'warning');
            resetInputStyling();
        }
    } else if (response.error) {
        if (response.error.includes('Free tier limit reached') || response.error.includes('purchase more tokens')) {
            showPaymentOption(response.error);
        } else {
            setStatus(`No ${searchDescription} found`, 'warning');
            resetInputStyling();
        }
    } else {
        setStatus(`No ${searchDescription} found`, 'warning');
        resetInputStyling();
    }
}

// Extract readable content from the page
function extractPageContent() {
    // Remove script and style elements
    const elementsToRemove = document.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement');
    const tempContent = document.cloneNode(true);
    tempContent.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement').forEach(el => el.remove());
    
    // Get text content from main content areas
    const contentSelectors = [
        'main', 'article', '[role="main"]', '.content', '.post', '.entry',
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'div'
    ];
    
    let content = '';
    for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            const text = element.textContent?.trim();
            if (text && text.length > 20 && !content.includes(text)) {
                content += text + '\n\n';
            }
        }
        if (content.length > 20000) break; // Limit content size
    }
    
    return content || document.body.textContent || '';
}

// Perform native keyword search
function performNativeSearch(query) {
    console.log('SmartFind: Performing native search for:', query);
    clearHighlights();
    
    try {
        // Use TreeWalker to find all text nodes
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script and style elements
                    const parent = node.parentElement;
                    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        const matches = [];
        let node;
        const regex = new RegExp(escapeRegExp(query), 'gi');
        
        while (node = walker.nextNode()) {
            try {
                const text = node.textContent;
                if (!text) continue;
                
                let match;
                regex.lastIndex = 0; // Reset regex state
                while ((match = regex.exec(text)) !== null) {
                    // Validate match bounds
                    if (match.index + match[0].length <= text.length) {
                        matches.push({
                            node: node,
                            start: match.index,
                            end: match.index + match[0].length,
                            text: match[0]
                        });
                    }
                    
                    // Prevent infinite loop
                    if (match[0].length === 0) {
                        regex.lastIndex++;
                    }
                }
            } catch (nodeError) {
                console.warn('SmartFind: Error processing node:', nodeError);
                continue;
            }
        }
        
        console.log('SmartFind: Found', matches.length, 'native matches');
        
        // Highlight matches
        highlightMatches(matches, 'keyword');
        
        if (matches.length > 0) {
            currentHighlightIndex = 0;
            scrollToHighlight(0);
        }
        
        updateResultsDisplay(matches.length > 0 ? 1 : 0, matches.length);
        return matches.length;
        
    } catch (error) {
        console.error('SmartFind: Error in native search:', error);
        updateResultsDisplay(0, 0);
        return 0;
    }
}

// Perform AI-enhanced search with improved selectivity
function performAISearch(aiResult) {
    console.log('SmartFind: Performing AI search with result:', aiResult);
    clearHighlights();
    
    if (!aiResult) {
        updateResultsDisplay(0, 0);
        return 0;
    }
    
    // Handle both single results (string) and multiple results (array)
    const aiResults = Array.isArray(aiResult) ? aiResult : [aiResult];
    console.log('SmartFind: Processing', aiResults.length, 'AI results:', aiResults);
    
    let allMatches = [];
    
    // Process each AI result with improved matching
    for (const result of aiResults) {
        // Skip very short or generic results
        if (result.length < 5 || isGenericResult(result)) {
            console.log('SmartFind: Skipping generic or short result:', result);
            continue;
        }
        
        // Find exact matches first (preferred)
        const exactMatches = findTextInDOM(result);
        
        if (exactMatches.length > 0) {
            console.log('SmartFind: Found exact matches for:', result);
            allMatches.push(...exactMatches.map(match => ({ ...match, matchType: 'exact' })));
        } else {
            // If exact match not found, try fuzzy matching with stricter criteria
            console.log('SmartFind: Trying fuzzy matching for:', result);
            const fuzzyMatches = findFuzzyMatches(result);
            
            // Only add fuzzy matches if they meet quality threshold
            const qualityMatches = fuzzyMatches.filter(match => 
                match.score >= 0.8 && match.text.length >= 10
            );
            
            if (qualityMatches.length > 0) {
                console.log('SmartFind: Found quality fuzzy matches:', qualityMatches.length);
                allMatches.push(...qualityMatches.map(match => ({ ...match, matchType: 'fuzzy' })));
            } else {
                console.log('SmartFind: No quality matches found for:', result);
            }
        }
    }
    
    // Remove duplicate matches (same position) and sort by quality
    allMatches = removeDuplicateMatches(allMatches);
    allMatches = sortMatchesByQuality(allMatches);
    
    // Limit the number of highlights to prevent performance issues and improve relevance
    const maxHighlights = 15; // Reduced from 20 for better selectivity
    if (allMatches.length > maxHighlights) {
        console.log(`SmartFind: Limiting highlights to ${maxHighlights} out of ${allMatches.length} matches`);
        allMatches = allMatches.slice(0, maxHighlights);
    }
    
    if (allMatches.length > 0) {
        highlightMatches(allMatches, 'ai');
        updateResultsDisplay(1, allMatches.length);
        currentHighlightIndex = 0;
        scrollToHighlight(0);
        console.log(`SmartFind: AI search completed - ${aiResults.length} AI results processed, ${allMatches.length} actual highlights found`);
        return allMatches.length;
    } else {
        updateResultsDisplay(0, 0);
        console.log(`SmartFind: AI search completed - ${aiResults.length} AI results processed, 0 actual highlights found`);
        return 0;
    }
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
        const index = text.toLowerCase().indexOf(searchText.toLowerCase());
        if (index !== -1 && index + searchText.length <= text.length) {
            matches.push({
                node: node,
                start: index,
                end: index + searchText.length,
                text: searchText
            });
        }
    }
    
    return matches;
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
        const key = `${match.node.textContent}-${match.start}-${match.end}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

// Highlight matches in the DOM
function highlightMatches(matches, searchType = 'keyword') {
    clearHighlights();
    
    matches.forEach((match, index) => {
        try {
            // Validate the match before creating range
            if (!match.node || !match.node.textContent) {
                console.warn('SmartFind: Invalid match node:', match);
                return;
            }
            
            const nodeLength = match.node.textContent.length;
            const start = Math.max(0, Math.min(match.start, nodeLength));
            const end = Math.max(start, Math.min(match.end, nodeLength));
            
            // Skip if invalid range
            if (start >= end || start >= nodeLength) {
                console.warn('SmartFind: Invalid range:', { start, end, nodeLength, match });
                return;
            }
            
            const range = document.createRange();
            range.setStart(match.node, start);
            range.setEnd(match.node, end);
            
            const highlight = document.createElement('span');
            // Add different classes for different search types
            if (searchType === 'ai') {
                highlight.className = 'smartfind-highlight smartfind-ai-highlight smartfind-new';
            } else {
                highlight.className = 'smartfind-highlight smartfind-keyword-highlight smartfind-new';
            }
            highlight.setAttribute('data-smartfind-index', index);
            
            range.surroundContents(highlight);
            currentHighlights.push(highlight);
            
            // Remove the animation class after animation completes
            setTimeout(() => {
                highlight.classList.remove('smartfind-new');
            }, 200);
            
        } catch (e) {
            // If highlighting fails, log the error but continue
            console.warn('SmartFind: Failed to highlight match:', e, match);
        }
    });
    
    totalMatches = currentHighlights.length;
    console.log('SmartFind: Highlighted', totalMatches, 'matches');
}

// Clear all highlights
function clearHighlights() {
    currentHighlights.forEach(highlight => {
        const parent = highlight.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        }
    });
    currentHighlights = [];
    currentHighlightIndex = -1;
    totalMatches = 0;
}

// Navigate through search results
function navigateResults(direction) {
    if (totalMatches === 0) return;
    
    // Remove current highlight
    if (currentHighlightIndex >= 0 && currentHighlights[currentHighlightIndex]) {
        currentHighlights[currentHighlightIndex].classList.remove('smartfind-current');
    }
    
    // Calculate new index
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

// Scroll to specific highlight
function scrollToHighlight(index) {
    if (index >= 0 && index < currentHighlights.length) {
        const highlight = currentHighlights[index];
        highlight.classList.add('smartfind-current');
        
        // Scroll to the highlight with instant behavior for faster productivity
        highlight.scrollIntoView({
            behavior: 'instant',
            block: 'center',
            inline: 'nearest'
        });
    }
}

// Update results display
function updateResultsDisplay(current, total) {
    if (searchResults) {
        // Show count when there are results, hide when no results
        if (total === 0) {
            searchResults.style.display = 'none';
        } else {
            searchResults.style.display = 'block';
            if (total === 1) {
                searchResults.textContent = '1 result';
            } else {
                searchResults.textContent = `${current} of ${total}`;
            }
        }
    }
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

// Show payment option when user hits limit
function showPaymentOption(errorMessage) {
    const statusElement = document.getElementById('smartfind-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span>${errorMessage}</span>
                <button id="smartfind-buy-tokens" style="
                    background: #0969da; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-size: 11px; 
                    cursor: pointer;
                    white-space: nowrap;
                ">Buy Tokens</button>
            </div>
        `;
        statusElement.className = 'smartfind-status error';
        statusElement.style.display = 'block';
        
        // Add click handler for buy button
        const buyButton = document.getElementById('smartfind-buy-tokens');
        if (buyButton) {
            buyButton.addEventListener('click', handleTokenPurchase);
        }
    }
}

// Handle token purchase
function handleTokenPurchase() {
    // Open the extension popup for payment (where user can choose amount)
    chrome.runtime.sendMessage({ action: "openPopup" });
    setStatus('Click the SmartFind extension icon to purchase tokens', 'info');
}

// Show sign-in prompt for token purchase
function showSignInPrompt() {
    const statusElement = document.getElementById('smartfind-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span>Sign in to sync your purchase across devices</span>
                    <button id="smartfind-open-popup" style="
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
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span style="font-size: 11px; color: #656d76;">Or continue without account:</span>
                    <button id="smartfind-buy-anonymous" style="
                        background: #6f42c1; 
                        color: white; 
                        border: none; 
                        padding: 4px 8px; 
                        border-radius: 4px; 
                        font-size: 11px; 
                        cursor: pointer;
                        white-space: nowrap;
                    ">Buy Tokens</button>
                </div>
            </div>
        `;
        statusElement.className = 'smartfind-status info';
        statusElement.style.display = 'block';
        
        // Add click handler for sign-in button
        const signInButton = document.getElementById('smartfind-open-popup');
        if (signInButton) {
            signInButton.addEventListener('click', () => {
                // Open the extension popup by sending a message to background script
                chrome.runtime.sendMessage({ action: "openPopup" });
                setStatus('Click the SmartFind extension icon to sign in', 'info');
            });
        }
        
        // Add click handler for anonymous purchase
        const anonymousButton = document.getElementById('smartfind-buy-anonymous');
        if (anonymousButton) {
            anonymousButton.addEventListener('click', () => {
                // Open the extension popup for payment (where user can choose amount)
                chrome.runtime.sendMessage({ action: "openPopup" });
                setStatus('Click the SmartFind extension icon to purchase tokens', 'info');
            });
        }
    }
}

// Update placeholder text based on input
function updatePlaceholder() {
    if (!searchInput) return;
    
    const value = searchInput.value;
    
    if (value.startsWith('/')) {
        searchInput.placeholder = 'AI search: emails, phone numbers, names, headings, etc.';
    } else if (value.startsWith("'")) {
        searchInput.placeholder = 'Keyword search: Enter exact terms...';
    } else {
        searchInput.placeholder = 'Search: emails, names, headings, or ask a question...';
    }
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}