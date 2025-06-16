// AI search engine for processing AI results and finding DOM matches

import { 
    isGenericResult, 
    removeDuplicateMatches, 
    sortMatchesByQuality,
    calculateMatchScore,
    findBestMatchingPhrase
} from './utils.js';

export class AISearchEngine {
    constructor() {
        this.config = {
            maxHighlights: 15,
            fuzzyThreshold: 0.8,
            shortResultThreshold: 50,
            minLength: 10
        };
    }

    // Process AI results and find matches in DOM
    processAIResults(aiResult) {
        console.log('SmartFind: Processing AI search results:', aiResult);
        
        if (!aiResult) {
            return [];
        }
        
        // Handle both single results (string) and multiple results (array)
        const aiResults = Array.isArray(aiResult) ? aiResult : [aiResult];
        console.log('SmartFind: Processing', aiResults.length, 'AI results:', aiResults);
        
        let allMatches = [];
        
        // Process each AI result with improved matching
        for (const result of aiResults) {
            console.log('SmartFind: Processing AI result:', result);
            
            // Skip very short or generic results
            if (result.length < 3 || isGenericResult(result)) {
                console.log('SmartFind: Skipping generic or short result:', result);
                continue;
            }
            
            // Find exact matches first (preferred)
            const exactMatches = this.findTextInDOM(result);
            console.log('SmartFind: Exact matches found:', exactMatches.length);
            
            if (exactMatches.length > 0) {
                console.log('SmartFind: Found exact matches for:', result);
                allMatches.push(...exactMatches.map(match => ({ ...match, matchType: 'exact' })));
            } else {
                // If exact match not found, try fuzzy matching
                console.log('SmartFind: Trying fuzzy matching for:', result);
                const fuzzyMatches = this.findFuzzyMatches(result);
                console.log('SmartFind: Fuzzy matches found:', fuzzyMatches.length);
                
                // For shorter results (likely names, emails, etc.), be more lenient
                const isShortResult = result.length < this.config.shortResultThreshold;
                const scoreThreshold = isShortResult ? 0.6 : this.config.fuzzyThreshold;
                const minLength = isShortResult ? 3 : this.config.minLength;
                
                // Only add fuzzy matches if they meet quality threshold
                const qualityMatches = fuzzyMatches.filter(match => 
                    match.score >= scoreThreshold && match.text.length >= minLength
                );
                
                if (qualityMatches.length > 0) {
                    console.log('SmartFind: Found quality fuzzy matches:', qualityMatches.length);
                    allMatches.push(...qualityMatches.map(match => ({ ...match, matchType: 'fuzzy' })));
                } else {
                    console.log('SmartFind: No quality matches found for:', result);
                    
                    // For very short results (like names), try word-by-word search
                    if (isShortResult && result.split(/\s+/).length <= 3) {
                        console.log('SmartFind: Trying word-by-word search for short result:', result);
                        const wordMatches = this.findWordMatches(result);
                        if (wordMatches.length > 0) {
                            console.log('SmartFind: Found word matches:', wordMatches.length);
                            allMatches.push(...wordMatches.map(match => ({ ...match, matchType: 'word' })));
                        }
                    }
                }
            }
        }
        
        // Remove duplicate matches and sort by quality
        allMatches = removeDuplicateMatches(allMatches);
        allMatches = sortMatchesByQuality(allMatches);
        
        console.log('SmartFind: Total matches after processing:', allMatches.length);
        
        // Limit the number of highlights for better selectivity
        if (allMatches.length > this.config.maxHighlights) {
            console.log(`SmartFind: Limiting highlights to ${this.config.maxHighlights} out of ${allMatches.length} matches`);
            allMatches = allMatches.slice(0, this.config.maxHighlights);
        }
        
        console.log(`SmartFind: AI search completed - ${aiResults.length} AI results processed, ${allMatches.length} actual highlights found`);
        return allMatches;
    }

    // Find exact text matches in DOM
    findTextInDOM(searchText) {
        // First try simple single-node matching (fastest)
        const singleNodeMatches = this.findTextInSingleNodes(searchText);
        if (singleNodeMatches.length > 0) {
            return singleNodeMatches;
        }
        
        // If no single-node matches, try cross-node matching for longer text
        if (searchText.length > 50) {
            console.log('SmartFind: Trying cross-node matching for longer text:', searchText.substring(0, 100) + '...');
            const crossNodeMatches = this.findTextAcrossNodes(searchText);
            if (crossNodeMatches.length > 0) {
                console.log('SmartFind: Found cross-node matches:', crossNodeMatches.length);
                return crossNodeMatches;
            }
        }
        
        return [];
    }

    // Find text matches within single text nodes
    findTextInSingleNodes(searchText) {
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

    // Find text that spans across multiple DOM nodes
    findTextAcrossNodes(searchText) {
        const matches = [];
        const searchLower = searchText.toLowerCase();
        const searchWords = searchLower.split(/\s+/).filter(word => word.length > 2);
        
        if (searchWords.length < 3) {
            return matches; // Only use cross-node matching for longer phrases
        }
        
        // Get all text nodes in order
        const textNodes = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const parent = node.parentElement;
                    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Only include nodes with meaningful text
                    if (node.textContent.trim().length < 3) {
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
                textLower: node.textContent.toLowerCase()
            });
        }
        
        // Look for the search text across consecutive text nodes
        for (let i = 0; i < textNodes.length - 1; i++) {
            let combinedText = '';
            let nodeSpan = [];
            
            // Try combining up to 5 consecutive nodes
            for (let j = i; j < Math.min(i + 5, textNodes.length); j++) {
                combinedText += textNodes[j].text + ' ';
                nodeSpan.push(textNodes[j]);
                
                // Check if we have a match in the combined text
                const combinedLower = combinedText.toLowerCase();
                const matchIndex = combinedLower.indexOf(searchLower);
                
                if (matchIndex !== -1) {
                    // Found a match! Create a cross-node match
                    const match = this.createCrossNodeMatch(nodeSpan, matchIndex, searchText.length, searchText);
                    if (match) {
                        matches.push(match);
                        console.log('SmartFind: Found cross-node match spanning', nodeSpan.length, 'nodes');
                    }
                    break; // Found match for this starting position
                }
                
                // If combined text is getting too long, stop
                if (combinedText.length > searchText.length * 3) {
                    break;
                }
            }
            
            // Limit the number of matches to prevent performance issues
            if (matches.length >= 3) {
                break;
            }
        }
        
        return matches;
    }

    // Create a match object for text spanning multiple nodes
    createCrossNodeMatch(nodeSpan, matchIndex, matchLength, originalText) {
        try {
            // For cross-node matches, we'll highlight each node separately
            const nodeMatches = [];
            let currentIndex = 0;
            let remainingMatchLength = matchLength;
            let matchStarted = false;
            
            for (const nodeInfo of nodeSpan) {
                const nodeText = nodeInfo.text + ' '; // Add space as we did in combination
                const nodeLength = nodeText.length;
                
                // Check if the match starts in this node
                if (!matchStarted && currentIndex <= matchIndex && matchIndex < currentIndex + nodeLength) {
                    matchStarted = true;
                    const startInNode = matchIndex - currentIndex;
                    const lengthInNode = Math.min(remainingMatchLength, nodeLength - startInNode);
                    
                    nodeMatches.push({
                        node: nodeInfo.node,
                        start: startInNode,
                        end: startInNode + lengthInNode,
                        text: nodeInfo.text.substring(startInNode, startInNode + lengthInNode)
                    });
                    
                    remainingMatchLength -= lengthInNode;
                } else if (matchStarted && remainingMatchLength > 0) {
                    // Continue the match in subsequent nodes
                    const lengthInNode = Math.min(remainingMatchLength, nodeLength);
                    
                    nodeMatches.push({
                        node: nodeInfo.node,
                        start: 0,
                        end: lengthInNode,
                        text: nodeInfo.text.substring(0, lengthInNode)
                    });
                    
                    remainingMatchLength -= lengthInNode;
                }
                
                currentIndex += nodeLength;
                
                if (remainingMatchLength <= 0) {
                    break;
                }
            }
            
            // Return the first node match as the primary match
            if (nodeMatches.length > 0) {
                const primaryMatch = nodeMatches[0];
                primaryMatch.crossNodeMatches = nodeMatches; // Store all node matches
                primaryMatch.matchType = 'cross-node';
                return primaryMatch;
            }
            
        } catch (error) {
            console.warn('SmartFind: Error creating cross-node match:', error);
        }
        
        return null;
    }

    // Find fuzzy matches for AI results with improved precision
    findFuzzyMatches(aiResult) {
        const matches = [];
        
        // First try to find the exact AI result as a substring
        const exactMatches = this.findTextInDOM(aiResult);
        if (exactMatches.length > 0) {
            return exactMatches;
        }
        
        // If no exact match, try more precise fuzzy matching
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
            
            // Calculate match score based on word overlap and proximity
            const matchScore = calculateMatchScore(aiResult, text);
            
            // Only consider high-quality matches (stricter threshold)
            if (matchScore >= this.config.fuzzyThreshold) {
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

    // Find matches for individual words (useful for names and short phrases)
    findWordMatches(searchText) {
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
} 