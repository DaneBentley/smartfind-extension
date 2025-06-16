// Search management and coordination module

import { parseSearchMode, getSearchIntent } from './utils.js';
import { KeywordSearchEngine } from './keyword-search.js';
import { AISearchEngine } from './ai-search.js';

export class SearchManager {
    constructor(contentMonitor, highlightManager, statusManager) {
        this.contentMonitor = contentMonitor;
        this.highlightManager = highlightManager;
        this.statusManager = statusManager;
        this.uiManager = null; // Will be set later
        
        // Search engines
        this.keywordSearch = new KeywordSearchEngine();
        this.aiSearch = new AISearchEngine();
        
        // State
        this.isSearching = false;
        this.lastQuery = '';
        
        // Set up content change callback
        this.contentMonitor.setContentChangeCallback(this.handleContentChange.bind(this));
    }

    setUIManager(uiManager) {
        this.uiManager = uiManager;
    }

    // Handle content mutations during active search
    handleContentChange() {
        if (this.isSearching && this.lastQuery && this.uiManager) {
            console.log('SmartFind: Re-running search due to content change');
            this.performSearch(this.lastQuery);
        }
    }

    // Main search orchestration method
    async performSearch(rawQuery) {
        console.log('SmartFind: SearchManager performing search for:', rawQuery);
        
        this.lastQuery = rawQuery;
        this.isSearching = true;
        
        // Parse search mode and clean query
        const searchMode = parseSearchMode(rawQuery);
        const query = searchMode.cleanQuery;
        
        console.log('SmartFind: Search mode:', searchMode.mode, 'Clean query:', query);
        
        this.statusManager.showLoading('Searching...');
        
        try {
            if (searchMode.mode === 'forceKeyword') {
                await this.performForcedKeywordSearch(query);
            } else if (searchMode.mode === 'forceAI') {
                await this.performForcedAISearch(query);
            } else {
                await this.performProgressiveSearch(query);
            }
        } catch (error) {
            console.error('SmartFind search error:', error);
            await this.handleSearchError(error, query);
        }
        
        this.isSearching = false;
    }

    // Force keyword search with ' prefix
    async performForcedKeywordSearch(query) {
        console.log('SmartFind: Forcing keyword search');
        this.uiManager.setInputStyling('keyword', true);
        
        const keywordResults = this.keywordSearch.search(query);
        
        if (keywordResults.length > 0) {
            this.highlightManager.highlightMatches(keywordResults, 'keyword');
            this.uiManager.initializeSearchResults(keywordResults.length);
            this.statusManager.showSuccess(`Keyword search (forced) - ${keywordResults.length} match${keywordResults.length > 1 ? 'es' : ''}`);
        } else {
            this.statusManager.showWarning('Keyword search (forced) - no matches');
            this.uiManager.initializeSearchResults(0);
        }
    }

    // Force AI search with / prefix
    async performForcedAISearch(query) {
        console.log('SmartFind: Forcing AI search');
        this.uiManager.setInputStyling('ai', true);
        
        const content = this.contentMonitor.extractPageContent();
        const intent = getSearchIntent(query);
        const searchDescription = intent ? intent.description : 'content';
        
        this.statusManager.showLoading(`AI searching for ${searchDescription}...`);
        
        const response = await this.sendAISearchRequest(query, content, true);
        
        if (response.success && response.result) {
            const aiResults = this.aiSearch.processAIResults(response.result);
            if (aiResults.length > 0) {
                this.highlightManager.highlightMatches(aiResults, 'ai');
                this.uiManager.initializeSearchResults(aiResults.length);
                this.statusManager.showSuccess(`Found ${aiResults.length} ${searchDescription} match${aiResults.length > 1 ? 'es' : ''}`);
            } else {
                this.statusManager.showWarning(`No ${searchDescription} found`);
                this.uiManager.initializeSearchResults(0);
            }
        } else if (response.error) {
            this.handleAISearchError(response.error);
        } else {
            this.statusManager.showError('AI search failed');
            this.uiManager.initializeSearchResults(0);
        }
    }

    // Progressive search: keyword first, then AI if no matches
    async performProgressiveSearch(query) {
        console.log('SmartFind: Starting progressive search - trying keyword first');
        this.uiManager.resetInputStyling();
        
        const keywordResults = this.keywordSearch.search(query);
        
        if (keywordResults.length > 0) {
            // Found exact matches - we're done!
            this.highlightManager.highlightMatches(keywordResults, 'keyword');
            this.uiManager.initializeSearchResults(keywordResults.length);
            this.statusManager.showSuccess(`Found ${keywordResults.length} exact match${keywordResults.length > 1 ? 'es' : ''}`);
        } else {
            // No exact matches - try AI search
            console.log('SmartFind: No keyword matches, trying AI search...');
            await this.performProgressiveAISearch(query);
        }
    }

    // Progressive AI search (fallback from keyword)
    async performProgressiveAISearch(query) {
        const content = this.contentMonitor.extractPageContent();
        const intent = getSearchIntent(query);
        const searchDescription = intent ? intent.description : 'related content';
        
        this.statusManager.showLoading('No exact matches. Searching with AI...');
        this.uiManager.setInputStyling('ai', false);
        
        const response = await this.sendAISearchRequest(query, content, false);
        
        if (response.success && response.result) {
            const aiResults = this.aiSearch.processAIResults(response.result);
            if (aiResults.length > 0) {
                this.highlightManager.highlightMatches(aiResults, 'ai');
                this.uiManager.initializeSearchResults(aiResults.length);
                this.statusManager.showSuccess(`AI found ${aiResults.length} ${searchDescription} match${aiResults.length > 1 ? 'es' : ''}`);
            } else {
                this.statusManager.showWarning(`No ${searchDescription} found`);
                this.uiManager.resetInputStyling();
                this.uiManager.initializeSearchResults(0);
            }
        } else if (response.error) {
            this.handleAISearchError(response.error);
        } else {
            this.statusManager.showWarning(`No ${searchDescription} found`);
            this.uiManager.resetInputStyling();
            this.uiManager.initializeSearchResults(0);
        }
    }

    // Send AI search request to background script
    async sendAISearchRequest(query, content, forceAI) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: "performAISearch",
                query: query,
                content: content,
                forceAI: forceAI,
                fallbackFromKeyword: !forceAI
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('SmartFind: Error sending message to background:', chrome.runtime.lastError);
                    resolve({ error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });
    }

    // Handle AI search errors
    handleAISearchError(error) {
        if (error.includes('Free tier limit reached') || error.includes('purchase more tokens')) {
            this.statusManager.showPaymentOption(error);
        } else {
            this.statusManager.showError(`AI search failed: ${error}`);
        }
        this.uiManager.initializeSearchResults(0);
    }

    // Handle general search errors
    async handleSearchError(error, query) {
        console.error('SmartFind: Search error details:', error);
        
        if (error instanceof DOMException) {
            console.error('SmartFind: DOM Exception occurred:', error.name, error.message);
            this.statusManager.showError('Search error - please try again');
        } else if (error instanceof RangeError) {
            console.error('SmartFind: Range Error occurred:', error.message);
            this.statusManager.showError('Search error - please try again');
        } else {
            // Fallback to keyword search for other errors
            try {
                const fallbackResults = this.keywordSearch.search(query);
                if (fallbackResults.length > 0) {
                    this.highlightManager.highlightMatches(fallbackResults, 'keyword');
                    this.uiManager.initializeSearchResults(fallbackResults.length);
                    this.statusManager.showWarning('Search error - using keyword search');
                } else {
                    this.statusManager.showError('Search error - please try again');
                    this.uiManager.initializeSearchResults(0);
                }
            } catch (fallbackError) {
                console.error('SmartFind: Fallback search also failed:', fallbackError);
                this.statusManager.showError('Search unavailable - please refresh page');
                this.uiManager.initializeSearchResults(0);
            }
        }
        
        this.uiManager.resetInputStyling();
    }
} 