// Keyword search engine with enhanced DOM support

import { escapeRegExp, removeDuplicateMatches } from './utils.js';

export class KeywordSearchEngine {
    constructor() {
        this.config = {
            shadowDomDepth: 3,
            maxMatches: 100
        };
    }

    // Main search method
    search(query) {
        console.log('SmartFind: Performing enhanced keyword search for:', query);
        
        try {
            const matches = [];
            const processedNodes = new Set();
            
            // Search in main document
            matches.push(...this.searchInDocument(document, query, processedNodes));
            
            // Search in shadow DOMs
            matches.push(...this.searchInShadowDOMs(document, query, processedNodes));
            
            // Search in accessible iframes
            matches.push(...this.searchInIframes(query, processedNodes));
            
            console.log('SmartFind: Found', matches.length, 'keyword matches');
            
            // Remove duplicates and limit results
            const uniqueMatches = removeDuplicateMatches(matches);
            const limitedMatches = uniqueMatches.slice(0, this.config.maxMatches);
            
            return limitedMatches;
            
        } catch (error) {
            console.error('SmartFind: Error in keyword search:', error);
            return [];
        }
    }

    // Search for text in a document
    searchInDocument(doc, query, processedNodes = new Set()) {
        const matches = [];
        
        try {
            // Use TreeWalker to find all text nodes
            const walker = document.createTreeWalker(
                doc.body || doc.documentElement,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => this.shouldProcessNode(node, processedNodes)
                }
            );
            
            const regex = new RegExp(escapeRegExp(query), 'gi');
            let node;
            
            while (node = walker.nextNode()) {
                try {
                    const text = node.textContent;
                    if (!text) continue;
                    
                    processedNodes.add(node);
                    
                    let match;
                    regex.lastIndex = 0; // Reset regex state
                    while ((match = regex.exec(text)) !== null) {
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
            
        } catch (error) {
            console.error('SmartFind: Error in document search:', error);
        }
        
        return matches;
    }

    // Check if a node should be processed
    shouldProcessNode(node, processedNodes) {
        // Skip if already processed
        if (processedNodes.has(node)) {
            return NodeFilter.FILTER_REJECT;
        }
        
        // Skip script and style elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName?.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
        }
        
        // Skip hidden elements
        try {
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return NodeFilter.FILTER_REJECT;
            }
        } catch (styleError) {
            // If we can't get computed style, include the node
        }
        
        return NodeFilter.FILTER_ACCEPT;
    }

    // Search in shadow DOMs
    searchInShadowDOMs(rootElement, query, processedNodes, depth = 0) {
        if (depth >= this.config.shadowDomDepth) {
            return [];
        }
        
        const matches = [];
        
        try {
            // Find all elements that might have shadow roots
            const elementsWithShadow = rootElement.querySelectorAll('*');
            
            for (const element of elementsWithShadow) {
                try {
                    if (element.shadowRoot) {
                        console.log('SmartFind: Searching in shadow root of', element.tagName);
                        matches.push(...this.searchInDocument(element.shadowRoot, query, processedNodes));
                        
                        // Recursively search nested shadow DOMs
                        matches.push(...this.searchInShadowDOMs(element.shadowRoot, query, processedNodes, depth + 1));
                    }
                } catch (shadowError) {
                    // Shadow root might not be accessible, continue
                    console.debug('SmartFind: Shadow root not accessible for search:', shadowError);
                }
            }
            
        } catch (error) {
            console.error('SmartFind: Error in shadow DOM search:', error);
        }
        
        return matches;
    }

    // Search in accessible iframes
    searchInIframes(query, processedNodes) {
        const matches = [];
        
        try {
            const iframes = document.querySelectorAll('iframe');
            
            for (const iframe of iframes) {
                try {
                    // Only try to access same-origin iframes
                    if (iframe.contentDocument) {
                        console.log('SmartFind: Searching in iframe');
                        matches.push(...this.searchInDocument(iframe.contentDocument, query, processedNodes));
                    }
                } catch (iframeError) {
                    // Cross-origin iframe, skip
                    console.debug('SmartFind: Cannot search iframe (likely cross-origin):', iframeError);
                }
            }
            
        } catch (error) {
            console.error('SmartFind: Error in iframe search:', error);
        }
        
        return matches;
    }
} 