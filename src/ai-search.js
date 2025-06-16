// ai-search.js - AI search functionality

import { CONFIG } from './config.js';
import { shouldUseAI, log, logError } from './utils.js';
import { checkUsagePermissions, handleSuccessfulSearch } from './usage-tracking.js';

/**
 * Handles keyword search requests (fallback to native search)
 */
export function handleKeywordSearch(request, sender, sendResponse) {
    // For keyword searches, we let the content script handle it with native find()
    sendResponse({ success: true, useNativeSearch: true });
}

/**
 * Handles the AI search request from the content script.
 * It checks usage limits before proceeding with the API call.
 */
export async function handleAISearch(request, sender, sendResponse) {
    log('Handling AI search for query:', request.query);
    
    // Skip the shouldUseAI check if this is a fallback from keyword search or forced AI
    if (!request.fallbackFromKeyword && !request.forceAI && !shouldUseAI(request.query)) {
        log('Query classified as keyword search');
        sendResponse({ success: true, useNativeSearch: true });
        return;
    }

    const permissions = await checkUsagePermissions();
    log('Current usage:', permissions.usage, 'Paid tokens:', permissions.paidTokens, 'Unlimited free:', permissions.isUnlimitedFree);

    if (!permissions.canUse) {
        log('Free tier limit reached and no paid tokens');
        sendResponse({ error: "Free tier limit reached. Please purchase more tokens to continue." });
        return;
    }

    try {
        log('Calling Cerebras API...');
        const aiResponse = await callCerebrasAPI(request.query, request.content);
        if (aiResponse && !aiResponse.error) {
            await handleSuccessfulSearch(permissions.isUnlimitedFree, permissions.usage);
            log('AI search successful');
            sendResponse({ success: true, result: aiResponse });
        } else {
            log('AI search failed, falling back to keyword search');
            // Fallback to keyword search if AI fails (unless forced)
            if (request.forceAI) {
                sendResponse({ error: aiResponse.error || 'AI search failed' });
            } else {
                sendResponse({ success: true, useNativeSearch: true, aiError: aiResponse.error });
            }
        }
    } catch (error) {
        logError("AI Search Error:", error);
        // Fallback to keyword search on error (unless forced)
        if (request.forceAI) {
            sendResponse({ error: error.message });
        } else {
            sendResponse({ success: true, useNativeSearch: true, aiError: error.message });
        }
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
    const truncatedContent = content.substring(0, CONFIG.MAX_CONTENT_LENGTH);

    // Create a single intelligent catch-all prompt
    const prompt = `You are an intelligent search assistant. Your task is to find the most relevant information from the provided text content that answers the user's query.

**Instructions:**
1. Read the user's query carefully to understand exactly what they're looking for.
2. Thoroughly scan the provided text content to find relevant information.
3. Be intelligent about what the user wants:
   - For email searches: Find email addresses and contact information
   - For phone searches: Find phone numbers and telephone contact information  
   - For name searches: Find names of people, authors, speakers, or contacts
   - For heading searches: Find headings, titles, section headers, or structural elements
   - For link searches: Find URLs, web addresses, and website references
   - For date searches: Find dates, times, schedules, or temporal information
   - For number searches: Find prices, costs, amounts, statistics, or numerical data
   - For address searches: Find addresses, locations, places, or geographical information
   - For summary requests: Find the most important and relevant key information
   - For general queries: Find sentences or paragraphs directly relevant to the query
4. Be selective and precise - only return content that clearly relates to what the user is asking for.
5. Return the most relevant text snippets, each on a separate line, separated by "|||".
6. Each snippet should be an exact sentence or phrase from the content.
7. Order results by relevance (most relevant first).
8. If no relevant information is found, respond with "NO_MATCH_FOUND".

**User Query:** "${query}"

**Text Content:**
---
${truncatedContent}
---

**Your Response (relevant snippets separated by |||):`;

    const apiUrl = `${CONFIG.API_BASE_URL}/api/cerebras`;
    
    try {
        log('Making API request via proxy...');
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

        log('API response status:', response.status);

        if (!response.ok) {
            const errorBody = await response.text();
            logError("Cerebras API Error:", errorBody);
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }
        
        const result = await response.json();
        log('API response received');

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
            logError("Unexpected API response structure:", result);
            return null;
        }

    } catch (error) {
        logError("Error calling Cerebras API:", error);
        return { error: error.message };
    }
} 