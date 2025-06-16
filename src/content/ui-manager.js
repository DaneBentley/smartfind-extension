// UI management module for search bar and controls

import { debounce } from './utils.js';

export class UIManager {
    constructor(highlightManager, statusManager) {
        this.highlightManager = highlightManager;
        this.statusManager = statusManager;
        this.searchManager = null; // Will be set later
        
        // UI elements
        this.searchBar = null;
        this.searchInput = null;
        this.searchResults = null;
        
        // State
        this.lastQuery = '';
    }

    setSearchManager(searchManager) {
        this.searchManager = searchManager;
    }

    // Toggle search bar visibility
    toggleSearchBar() {
        console.log('SmartFind: toggleSearchBar called, searchBar exists:', !!this.searchBar);
        console.log('SmartFind: document.body exists:', !!document.body);
        console.log('SmartFind: document.readyState:', document.readyState);
        
        if (!this.searchBar) {
            this.createSearchBar();
        } else {
            if (this.searchBar.classList.contains('smartfind-hidden')) {
                console.log('SmartFind: Showing search bar');
                this.searchBar.classList.remove('smartfind-hidden');
                if (this.searchInput) {
                    this.searchInput.focus();
                }
            } else {
                console.log('SmartFind: Hiding search bar');
                this.hideSearchBar();
            }
        }
    }

    // Hide search bar and clear highlights
    hideSearchBar() {
        if (this.searchBar) {
            this.searchBar.classList.add('smartfind-hidden');
            this.highlightManager.clearHighlights();
            this.statusManager.clearStatus();
        }
    }

    // Create search bar UI
    createSearchBar() {
        console.log('SmartFind: Creating search bar');
        
        if (!document.body) {
            console.error('SmartFind: document.body is not available');
            return;
        }
        
        this.searchBar = document.createElement('div');
        this.searchBar.id = 'smartfind-search-bar';
        this.searchBar.className = 'smartfind-container';
        
        this.searchBar.innerHTML = `
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
        
        try {
            document.body.appendChild(this.searchBar);
            console.log('SmartFind: Search bar added to DOM successfully');
        } catch (error) {
            console.error('SmartFind: Error appending to body:', error);
            return;
        }
        
        // Get references to elements
        this.searchInput = document.getElementById('smartfind-input');
        this.searchResults = document.getElementById('smartfind-results');
        
        if (!this.searchInput || !this.searchResults) {
            console.error('SmartFind: Failed to get references to search elements');
            return;
        }
        
        // Set up status manager reference
        this.statusManager.setStatusElement(document.getElementById('smartfind-status'));
        
        // Add event listeners
        this.setupEventListeners();
        
        // Focus the input
        if (this.searchInput) {
            this.searchInput.focus();
            console.log('SmartFind: Focused input element');
        }
        
        console.log('SmartFind: Search bar creation complete');
    }

    // Setup all event listeners
    setupEventListeners() {
        console.log('SmartFind: Setting up event listeners');
        
        // Input events
        this.searchInput.addEventListener('input', debounce(this.handleSearch.bind(this), 300));
        this.searchInput.addEventListener('input', this.updatePlaceholder.bind(this));
        this.searchInput.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Button events
        document.getElementById('smartfind-next').addEventListener('click', () => this.navigateResults(1));
        document.getElementById('smartfind-prev').addEventListener('click', () => this.navigateResults(-1));
        document.getElementById('smartfind-close').addEventListener('click', this.hideSearchBar.bind(this));
        
        // Global escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.searchBar && !this.searchBar.classList.contains('smartfind-hidden')) {
                this.hideSearchBar();
            }
        });
        
        console.log('SmartFind: Event listeners set up successfully');
    }

    // Handle keyboard shortcuts in search input
    handleKeyDown(e) {
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                if (e.shiftKey) {
                    this.navigateResults(-1); // Previous
                } else {
                    this.navigateResults(1); // Next
                }
                break;
            case 'Escape':
                this.hideSearchBar();
                break;
        }
    }

    // Handle search input
    async handleSearch() {
        const rawQuery = this.searchInput.value.trim();
        console.log('SmartFind: handleSearch called with query:', rawQuery);
        
        if (!rawQuery) {
            this.highlightManager.clearHighlights();
            this.updateResultsDisplay(0, 0);
            this.statusManager.clearStatus();
            this.resetInputStyling();
            return;
        }
        
        if (rawQuery === this.lastQuery) return;
        this.lastQuery = rawQuery;
        
        // Delegate to search manager
        if (this.searchManager) {
            await this.searchManager.performSearch(rawQuery);
        }
    }

    // Navigate through search results
    navigateResults(direction) {
        const result = this.highlightManager.navigateResults(direction);
        this.updateResultsDisplay(result.current, result.total);
    }

    // Update results display
    updateResultsDisplay(current, total) {
        if (this.searchResults) {
            if (total === 0) {
                this.searchResults.style.display = 'none';
            } else {
                this.searchResults.style.display = 'block';
                if (total === 1) {
                    this.searchResults.textContent = '1 result';
                } else {
                    this.searchResults.textContent = `${current} of ${total}`;
                }
            }
        }
    }

    // Set input styling based on search mode
    setInputStyling(mode, isForced) {
        if (!this.searchInput) return;
        
        // Reset all styling
        this.searchInput.style.borderLeft = '';
        this.searchInput.classList.remove('smartfind-ai-mode', 'smartfind-keyword-mode', 'smartfind-forced-mode');
        
        if (mode === 'ai') {
            this.searchInput.style.borderLeft = '3px solid #0969da';
            this.searchInput.classList.add('smartfind-ai-mode');
            if (isForced) {
                this.searchInput.classList.add('smartfind-forced-mode');
            }
        } else if (mode === 'keyword') {
            this.searchInput.style.borderLeft = '3px solid #1a7f37';
            this.searchInput.classList.add('smartfind-keyword-mode');
            if (isForced) {
                this.searchInput.classList.add('smartfind-forced-mode');
            }
        }
    }

    // Reset input styling
    resetInputStyling() {
        if (!this.searchInput) return;
        this.searchInput.style.borderLeft = '';
        this.searchInput.classList.remove('smartfind-ai-mode', 'smartfind-keyword-mode', 'smartfind-forced-mode');
    }

    // Update placeholder text based on input
    updatePlaceholder() {
        if (!this.searchInput) return;
        
        const value = this.searchInput.value;
        
        if (value.startsWith('/')) {
            this.searchInput.placeholder = 'AI search: emails, phone numbers, names, headings, etc.';
        } else if (value.startsWith("'")) {
            this.searchInput.placeholder = 'Keyword search: Enter exact terms...';
        } else {
            this.searchInput.placeholder = 'Search: emails, names, headings, or ask a question...';
        }
    }

    // Initialize search results (called when search completes)
    initializeSearchResults(total) {
        if (total > 0) {
            const result = this.highlightManager.initializeHighlights();
            this.updateResultsDisplay(result.current, result.total);
        } else {
            this.updateResultsDisplay(0, 0);
        }
    }

    // Get current search query
    getCurrentQuery() {
        return this.searchInput ? this.searchInput.value.trim() : '';
    }

    // Cleanup function
    cleanup() {
        if (this.searchBar && this.searchBar.parentNode) {
            this.searchBar.parentNode.removeChild(this.searchBar);
            this.searchBar = null;
            this.searchInput = null;
            this.searchResults = null;
        }
    }
} 