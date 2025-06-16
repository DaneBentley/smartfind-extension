// Content monitoring and extraction module

import { debounce } from './utils.js';

export class ContentMonitor {
    constructor() {
        this.mutationObserver = null;
        this.contentCache = null;
        this.lastContentUpdate = 0;
        this.config = {
            maxContentLength: 50000,
            cacheTimeout: 5000, // 5 seconds
            mutationDebounceTime: 1000,
            shadowDomDepth: 3,
            iframeTimeout: 2000
        };
        this.onContentChangeCallback = null;
    }

    initialize() {
        console.log('SmartFind: Initializing content monitoring');
        this.setupMutationObserver();
        this.setupEventListeners();
    }

    setupMutationObserver() {
        if (window.MutationObserver) {
            this.mutationObserver = new MutationObserver(
                debounce(this.handleContentMutation.bind(this), this.config.mutationDebounceTime)
            );
            
            this.mutationObserver.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: false
            });
            
            console.log('SmartFind: MutationObserver initialized');
        }
    }

    setupEventListeners() {
        ['load', 'DOMContentLoaded', 'readystatechange'].forEach(eventType => {
            document.addEventListener(eventType, () => {
                console.log(`SmartFind: ${eventType} event detected, invalidating content cache`);
                this.invalidateContentCache();
            });
        });
    }

    handleContentMutation(mutations) {
        console.log('SmartFind: Content mutation detected, invalidating cache');
        this.invalidateContentCache();
        
        // Notify listeners of content change
        if (this.onContentChangeCallback) {
            this.onContentChangeCallback();
        }
    }

    setContentChangeCallback(callback) {
        this.onContentChangeCallback = callback;
    }

    invalidateContentCache() {
        this.contentCache = null;
        this.lastContentUpdate = 0;
    }

    extractPageContent() {
        console.log('SmartFind: Extracting page content');
        
        // Check cache first
        const now = Date.now();
        if (this.contentCache && (now - this.lastContentUpdate) < this.config.cacheTimeout) {
            console.log('SmartFind: Using cached content');
            return this.contentCache;
        }
        
        try {
            let content = '';
            const processedElements = new Set();
            
            // Extract from main document
            content += this.extractFromDocument(document, processedElements);
            
            // Extract from shadow DOMs
            content += this.extractFromShadowDOMs(document, processedElements);
            
            // Extract from accessible iframes
            content += this.extractFromIframes();
            
            // Fallback if content is insufficient
            if (content.length < 500) {
                console.log('SmartFind: Content too short, using fallback extraction');
                content += this.extractFallbackContent();
            }
            
            // Clean and limit content
            content = this.cleanExtractedContent(content);
            
            // Cache the result
            this.contentCache = content;
            this.lastContentUpdate = now;
            
            console.log(`SmartFind: Extracted ${content.length} characters of content`);
            return content;
            
        } catch (error) {
            console.error('SmartFind: Error in content extraction:', error);
            return document.body?.textContent || document.documentElement?.textContent || '';
        }
    }

    extractFromDocument(doc, processedElements = new Set()) {
        console.log('SmartFind: Extracting from document');
        
        const prioritySelectors = [
            'main', 'article', '[role="main"]', '[role="article"]',
            '.content', '.post', '.entry', '.article-content', '.post-content',
            '.main-content', '.page-content', '.story-content'
        ];
        
        const secondarySelectors = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'li', 'td', 'th', 'blockquote', 'pre',
            '.text', '.description', '.summary', '.excerpt'
        ];
        
        const excludeSelectors = [
            'script', 'style', 'noscript', 'iframe', 'object', 'embed',
            'nav', 'header', 'footer', 'aside', '.nav', '.navigation',
            '.ad', '.ads', '.advertisement', '.banner', '.popup',
            '.cookie', '.gdpr', '.consent', '.modal', '.overlay',
            '.social', '.share', '.comment-form', '.sidebar'
        ];
        
        let content = '';
        
        try {
            // Try priority selectors first
            for (const selector of prioritySelectors) {
                const elements = doc.querySelectorAll(selector);
                for (const element of elements) {
                    if (processedElements.has(element)) continue;
                    
                    const text = this.extractTextFromElement(element, excludeSelectors);
                    if (text && text.length > 30) {
                        content += text + '\n\n';
                        processedElements.add(element);
                        
                        if (content.length > 10000) break;
                    }
                }
                if (content.length > 15000) break;
            }
            
            // Use secondary selectors if needed
            if (content.length < 2000) {
                console.log('SmartFind: Using secondary selectors for more content');
                for (const selector of secondarySelectors) {
                    const elements = doc.querySelectorAll(selector);
                    for (const element of elements) {
                        if (processedElements.has(element)) continue;
                        
                        const text = this.extractTextFromElement(element, excludeSelectors);
                        if (text && text.length > 10 && !this.isContentDuplicate(content, text)) {
                            content += text + '\n';
                            processedElements.add(element);
                        }
                    }
                    if (content.length > this.config.maxContentLength) break;
                }
            }
            
        } catch (error) {
            console.error('SmartFind: Error in document extraction:', error);
        }
        
        return content;
    }

    extractTextFromElement(element, excludeSelectors) {
        try {
            // Skip excluded elements
            for (const excludeSelector of excludeSelectors) {
                if (element.matches && element.matches(excludeSelector)) {
                    return '';
                }
            }
            
            // Clone to avoid modifying original
            const clone = element.cloneNode(true);
            
            // Remove excluded children
            for (const excludeSelector of excludeSelectors) {
                clone.querySelectorAll(excludeSelector).forEach(el => el.remove());
            }
            
            return clone.textContent?.trim() || '';
            
        } catch (error) {
            console.warn('SmartFind: Error extracting text from element:', error);
            return '';
        }
    }

    extractFromShadowDOMs(rootElement, processedElements, depth = 0) {
        if (depth >= this.config.shadowDomDepth) {
            return '';
        }
        
        console.log(`SmartFind: Extracting from shadow DOMs (depth ${depth})`);
        let content = '';
        
        try {
            const elementsWithShadow = rootElement.querySelectorAll('*');
            
            for (const element of elementsWithShadow) {
                try {
                    if (element.shadowRoot) {
                        console.log('SmartFind: Found shadow root in', element.tagName);
                        content += this.extractFromDocument(element.shadowRoot, processedElements);
                        content += this.extractFromShadowDOMs(element.shadowRoot, processedElements, depth + 1);
                    }
                } catch (shadowError) {
                    console.debug('SmartFind: Shadow root not accessible:', shadowError);
                }
            }
            
        } catch (error) {
            console.error('SmartFind: Error in shadow DOM extraction:', error);
        }
        
        return content;
    }

    extractFromIframes() {
        console.log('SmartFind: Extracting from iframes');
        let content = '';
        
        try {
            const iframes = document.querySelectorAll('iframe');
            console.log(`SmartFind: Found ${iframes.length} iframes`);
            
            for (const iframe of iframes) {
                try {
                    if (iframe.contentDocument) {
                        console.log('SmartFind: Accessing iframe content');
                        const iframeContent = this.extractFromDocument(iframe.contentDocument);
                        if (iframeContent && iframeContent.length > 50) {
                            content += iframeContent + '\n\n';
                        }
                    }
                } catch (iframeError) {
                    console.debug('SmartFind: Cannot access iframe (likely cross-origin):', iframeError);
                }
            }
            
        } catch (error) {
            console.error('SmartFind: Error in iframe extraction:', error);
        }
        
        return content;
    }

    extractFallbackContent() {
        console.log('SmartFind: Using fallback content extraction');
        
        try {
            let content = '';
            
            // Extract visible text nodes
            content += this.extractVisibleTextNodes();
            
            // Try common content containers
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

    extractVisibleTextNodes() {
        let content = '';
        
        try {
            const walker = document.createTreeWalker(
                document.body || document.documentElement,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;
                        
                        const tagName = parent.tagName?.toLowerCase();
                        if (['script', 'style', 'noscript'].includes(tagName)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        // Check visibility
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

    cleanExtractedContent(content) {
        try {
            // Remove excessive whitespace
            content = content.replace(/\s+/g, ' ');
            
            // Simple deduplication
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
            if (content.length > this.config.maxContentLength) {
                content = content.substring(0, this.config.maxContentLength);
                const lastSentence = content.lastIndexOf('.');
                if (lastSentence > this.config.maxContentLength * 0.8) {
                    content = content.substring(0, lastSentence + 1);
                }
            }
            
            return content.trim();
            
        } catch (error) {
            console.error('SmartFind: Error cleaning content:', error);
            return content;
        }
    }

    isContentDuplicate(existingContent, newText) {
        if (!existingContent || !newText) return false;
        
        if (existingContent.includes(newText.trim())) {
            return true;
        }
        
        const newTextStart = newText.trim().substring(0, 50);
        if (newTextStart.length > 20 && existingContent.includes(newTextStart)) {
            return true;
        }
        
        return false;
    }

    cleanup() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.invalidateContentCache();
    }
} 