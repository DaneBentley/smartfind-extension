// Highlight management module

export class HighlightManager {
    constructor() {
        this.currentHighlights = [];
        this.currentHighlightIndex = -1;
        this.totalMatches = 0;
    }

    // Highlight matches in the DOM
    highlightMatches(matches, searchType = 'keyword') {
        this.clearHighlights();
        
        matches.forEach((match, index) => {
            try {
                // Handle cross-node matches differently
                if (match.matchType === 'cross-node' && match.crossNodeMatches) {
                    console.log('SmartFind: Highlighting cross-node match with', match.crossNodeMatches.length, 'parts');
                    this.highlightCrossNodeMatch(match.crossNodeMatches, index, searchType);
                    return;
                }
                
                // Standard single-node highlighting
                this.highlightSingleNode(match, index, searchType);
                
            } catch (e) {
                console.warn('SmartFind: Failed to highlight match:', e, match);
            }
        });
        
        this.totalMatches = this.currentHighlights.length;
        console.log('SmartFind: Highlighted', this.totalMatches, 'matches');
    }

    highlightSingleNode(match, index, searchType) {
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
        this.setHighlightClasses(highlight, searchType, false);
        highlight.setAttribute('data-smartfind-index', index);
        
        range.surroundContents(highlight);
        this.currentHighlights.push(highlight);
        
        // Remove animation class after animation
        setTimeout(() => {
            highlight.classList.remove('smartfind-new');
        }, 200);
    }

    highlightCrossNodeMatch(nodeMatches, matchIndex, searchType) {
        nodeMatches.forEach((nodeMatch, partIndex) => {
            try {
                if (!nodeMatch.node || !nodeMatch.node.textContent) {
                    console.warn('SmartFind: Invalid cross-node match part:', nodeMatch);
                    return;
                }
                
                const nodeLength = nodeMatch.node.textContent.length;
                const start = Math.max(0, Math.min(nodeMatch.start, nodeLength));
                const end = Math.max(start, Math.min(nodeMatch.end, nodeLength));
                
                if (start >= end || start >= nodeLength) {
                    console.warn('SmartFind: Invalid cross-node range:', { start, end, nodeLength, nodeMatch });
                    return;
                }
                
                const range = document.createRange();
                range.setStart(nodeMatch.node, start);
                range.setEnd(nodeMatch.node, end);
                
                const highlight = document.createElement('span');
                this.setHighlightClasses(highlight, searchType, true);
                highlight.setAttribute('data-smartfind-index', matchIndex);
                highlight.setAttribute('data-smartfind-part', partIndex);
                
                range.surroundContents(highlight);
                this.currentHighlights.push(highlight);
                
                setTimeout(() => {
                    highlight.classList.remove('smartfind-new');
                }, 200);
                
            } catch (e) {
                console.warn('SmartFind: Failed to highlight cross-node match part:', e, nodeMatch);
            }
        });
    }

    setHighlightClasses(highlight, searchType, isCrossNode) {
        const baseClasses = ['smartfind-highlight', 'smartfind-new'];
        
        if (searchType === 'ai') {
            baseClasses.push('smartfind-ai-highlight');
        } else {
            baseClasses.push('smartfind-keyword-highlight');
        }
        
        if (isCrossNode) {
            baseClasses.push('smartfind-cross-node');
        }
        
        highlight.className = baseClasses.join(' ');
    }

    // Clear all highlights
    clearHighlights() {
        this.currentHighlights.forEach(highlight => {
            const parent = highlight.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            }
        });
        this.currentHighlights = [];
        this.currentHighlightIndex = -1;
        this.totalMatches = 0;
    }

    // Navigate through search results
    navigateResults(direction) {
        if (this.totalMatches === 0) return { current: 0, total: 0 };
        
        // Remove current highlight
        if (this.currentHighlightIndex >= 0 && this.currentHighlights[this.currentHighlightIndex]) {
            this.currentHighlights[this.currentHighlightIndex].classList.remove('smartfind-current');
        }
        
        // Calculate new index
        this.currentHighlightIndex += direction;
        if (this.currentHighlightIndex >= this.totalMatches) {
            this.currentHighlightIndex = 0;
        } else if (this.currentHighlightIndex < 0) {
            this.currentHighlightIndex = this.totalMatches - 1;
        }
        
        // Highlight current match and scroll to it
        this.scrollToHighlight(this.currentHighlightIndex);
        
        return {
            current: this.currentHighlightIndex + 1,
            total: this.totalMatches
        };
    }

    // Scroll to specific highlight
    scrollToHighlight(index) {
        if (index >= 0 && index < this.currentHighlights.length) {
            const highlight = this.currentHighlights[index];
            highlight.classList.add('smartfind-current');
            
            // Scroll to the highlight with instant behavior for faster productivity
            highlight.scrollIntoView({
                behavior: 'instant',
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    // Get current highlight info
    getCurrentHighlightInfo() {
        return {
            current: this.totalMatches > 0 ? this.currentHighlightIndex + 1 : 0,
            total: this.totalMatches
        };
    }

    // Initialize highlights (set first as current)
    initializeHighlights() {
        if (this.totalMatches > 0) {
            this.currentHighlightIndex = 0;
            this.scrollToHighlight(0);
            return this.getCurrentHighlightInfo();
        }
        return { current: 0, total: 0 };
    }
} 