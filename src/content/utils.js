// Utility functions for content script modules

// Debounce function to limit function calls
export function debounce(func, wait) {
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

// Escape special regex characters
export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse search mode from query prefixes
export function parseSearchMode(query) {
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

// Get search intent for status messages
export function getSearchIntent(query) {
    const intents = [
        { pattern: /\b(emails?|email|contact)\b/i, description: 'email addresses' },
        { pattern: /\b(phone|tel|mobile|cell)\b/i, description: 'phone numbers' },
        { pattern: /\b(names?|people|persons?)\b/i, description: 'names and people' },
        { pattern: /\b(headings?|titles?|headers?)\b/i, description: 'headings and titles' },
        { pattern: /\b(links?|urls?|websites?)\b/i, description: 'links and URLs' },
        { pattern: /\b(dates?|times?|when)\b/i, description: 'dates and times' },
        { pattern: /\b(prices?|costs?|numbers?)\b/i, description: 'prices and numbers' },
        { pattern: /\b(addresses?|locations?)\b/i, description: 'addresses and locations' },
        { pattern: /\b(summary|summarize|tldr|key)\b/i, description: 'key information' }
    ];
    
    for (const intent of intents) {
        if (intent.pattern.test(query)) {
            return { description: intent.description };
        }
    }
    
    return null;
}

// Check if a result is too generic to be useful
export function isGenericResult(result) {
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

// Remove duplicate matches based on position
export function removeDuplicateMatches(matches) {
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

// Sort matches by quality (exact matches first, then by score)
export function sortMatchesByQuality(matches) {
    return matches.sort((a, b) => {
        // Exact matches first
        if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
        if (b.matchType === 'exact' && a.matchType !== 'exact') return 1;
        
        // Then by score
        return (b.score || 1) - (a.score || 1);
    });
}

// Calculate match score between AI result and text
export function calculateMatchScore(aiResult, text) {
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
export function findBestMatchingPhrase(aiResult, text) {
    const aiWords = aiResult.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const sentences = text.split(/[.!?]+/);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence.length < 10) continue;
        
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