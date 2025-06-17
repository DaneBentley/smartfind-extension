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
    
    // Handle extended search differently - always use AI
    if (request.isExtendedSearch) {
        log('Processing extended search chunk:', request.chunkIndex);
    } else {
        // Skip the shouldUseAI check if this is a fallback from keyword search or forced AI
        if (!request.fallbackFromKeyword && !request.forceAI && !shouldUseAI(request.query)) {
            log('Query classified as keyword search');
            sendResponse({ success: true, useNativeSearch: true });
            return;
        }
    }

    const permissions = await checkUsagePermissions();
    log('Current usage:', permissions.usage, 'Paid tokens:', permissions.paidTokens, 'Unlimited free:', permissions.isUnlimitedFree, 'Needs auth:', permissions.needsAuth);

    // Check if user needs to authenticate
    if (permissions.needsAuth) {
        log('User needs to authenticate for AI features');
        sendResponse({ 
            error: "Please sign in to use AI search features. Click the SmartFind extension icon to sign in.",
            needsAuth: true 
        });
        return;
    }

    if (!permissions.canUse) {
        log('User has run out of credits');
        
        // Show error badge on extension icon
        if (sender && sender.tab) {
            chrome.runtime.sendMessage({
                action: "showCreditErrorBadge",
                tabId: sender.tab.id
            });
        }
        
        // Provide clear, specific error message
        const errorMessage = "Credits exhausted. Please purchase more tokens to continue using AI search.";
            
        sendResponse({ error: errorMessage });
        return;
    }

    try {
        log('Calling Cerebras API...');
        const aiResponse = await callCerebrasAPI(request.query, request.content);
        
        // Check if we got a valid response with results
        if (aiResponse && !aiResponse.error && aiResponse !== null) {
            await handleSuccessfulSearch(permissions.isUnlimitedFree, permissions.usage);
            log('AI search successful');
            sendResponse({ success: true, result: aiResponse });
        } else {
            // Handle different failure scenarios
            let errorMessage = 'AI search failed';
            
            if (aiResponse === null) {
                log('AI search found no matches, falling back to keyword search');
                errorMessage = 'No matches found';
            } else if (aiResponse && aiResponse.error) {
                log('AI search failed with error, falling back to keyword search');
                errorMessage = aiResponse.error;
            } else {
                log('AI search failed for unknown reason, falling back to keyword search');
            }
            
            // Fallback to keyword search if AI fails (unless forced)
            if (request.forceAI) {
                sendResponse({ error: errorMessage });
            } else {
                sendResponse({ success: true, useNativeSearch: true, aiError: errorMessage });
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
    // Intelligently truncate content to avoid exceeding token limits
    // Prioritize keeping the beginning and end of content for better context
    let truncatedContent = content;
    if (content.length > CONFIG.MAX_CONTENT_LENGTH) {
        const halfLength = Math.floor(CONFIG.MAX_CONTENT_LENGTH / 2);
        const beginning = content.substring(0, halfLength);
        const ending = content.substring(content.length - halfLength);
        truncatedContent = beginning + "\n\n[... content truncated ...]\n\n" + ending;
    }

    // Create a prompt that emphasizes exact extraction over summarization, focused on semantic understanding
    const prompt = `
    You are a text extraction tool. Return only exact snippets from the provided content that semantically match the user's query.
    
    Rules:
    - DO NOT paraphrase, summarize, or invent content.
    - DO NOT echo the query or generate explanations.
    - DO NOT add quotes, punctuation, or formatting not in the original.
    - DO NOT include markup (e.g., [edit], [update], etc.).
    - DO NOT start your answer with the user's query.
    
    Behavior:
    - Copy text exactly as it appears in the original content.
    - Return one or more relevant text snippets, separated by "|||".
    - Return as many results as you recon the user wants to see based on the query.
    - Use semantic understanding to understand what the user is asking for, and return the most relevant text snippets.
    - If nothing matches, return: NO_MATCH_FOUND
    
    Examples:
    - Query: "summary" "tldr" "conclusion" → Return actual summary sentences or conclusions if found.
    - Query: "what is machine learning" → Return existing definitions or explanations.
    - Query: "how does it work" → Return process descriptions from the text.
    - Query: "CEO" or "person" → Return actual names or mentions of people.
    
    Note:
    - Regex-based queries (emails, phones, links) are handled separately.
    - Prioritize meaningful, content-based matches over keyword matches.
    - Preserve capitalization, spacing, and punctuation exactly.
        
User Query: "${query}"

Text Content:
---
${truncatedContent}
---

Find and copy exact text from the content above that semantically answers the query (separate multiple results with |||):`;

    const apiUrl = `${CONFIG.API_BASE_URL}/api/cerebras`;
    
    try {
        log('Making API request via proxy...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-4-scout-17b-16e-instruct",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 800,
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
        log('Raw API response:', JSON.stringify(result, null, 2));

        if (result.choices && result.choices.length > 0 && result.choices[0].message && result.choices[0].message.content) {
            let text = result.choices[0].message.content.trim();
            
            // Handle empty or invalid responses
            if (!text || text.length === 0) {
                log('API returned empty content');
                return null;
            }
            
            // Clean up potential formatting from the model
            if (text.startsWith('```') && text.endsWith('```')) {
                text = text.substring(3, text.length - 3).trim();
            }
            
            // Remove quotes if the model added them
            if ((text.startsWith('"') && text.endsWith('"')) || 
                (text.startsWith("'") && text.endsWith("'"))) {
                text = text.substring(1, text.length - 1);
            }
            
            // Remove any remaining quotes around individual results
            text = text.replace(/^"([^"]*)"$/g, '$1').replace(/^'([^']*)'$/g, '$1');
            
            // Check for explicit no match response
            if (text === "NO_MATCH_FOUND" || text.toLowerCase().includes('no match found')) {
                log('API explicitly returned no matches');
                return null;
            }
            
            // Parse multiple results separated by |||
            const results = text.split('|||')
                .map(snippet => snippet.trim())
                .filter(snippet => {
                    // Clean up the snippet first
                    snippet = snippet.trim();
                    
                    // Remove quotes around individual snippets
                    if ((snippet.startsWith('"') && snippet.endsWith('"')) || 
                        (snippet.startsWith("'") && snippet.endsWith("'"))) {
                        snippet = snippet.substring(1, snippet.length - 1).trim();
                    }
                    
                    // Filter out empty results
                    if (snippet.length === 0) return false;
                    
                    // Filter out explicit no match responses
                    if (snippet === "NO_MATCH_FOUND" || snippet.toLowerCase().includes('no match found')) return false;
                    
                    // Filter out results that are just echoing the query
                    const queryLower = query.toLowerCase().trim();
                    const snippetLower = snippet.toLowerCase().trim();
                    if (snippetLower === queryLower) {
                        log(`Filtering out query echo: "${snippet}"`);
                        return false;
                    }
                    
                    // Filter out results that start with the query followed by whitespace/newlines
                    if (snippetLower.startsWith(queryLower + ' ') || 
                        snippetLower.startsWith(queryLower + '\n') ||
                        snippetLower.startsWith(queryLower + '\t')) {
                        log(`Filtering out query-prefixed result: "${snippet}"`);
                        return false;
                    }
                    
                    // Filter out results that are too short to be meaningful (unless they're specific data like emails/phones)
                    if (snippet.length < 10 && !snippet.includes('@') && !snippet.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)) {
                        log(`Filtering out too-short result: "${snippet}"`);
                        return false;
                    }
                    
                    // Filter out results that start with "The main point of the text is" or similar AI-generated phrases
                    const aiGeneratedPhrases = [
                        'the main point of the text is',
                        'the text is about',
                        'this text discusses',
                        'the document explains',
                        'the content describes',
                        'the article states',
                        'according to the text',
                        'the passage mentions'
                    ];
                    
                    for (const phrase of aiGeneratedPhrases) {
                        if (snippetLower.startsWith(phrase)) {
                            log(`Filtering out AI-generated summary: "${snippet}"`);
                            return false;
                        }
                    }
                    
                    return true;
                })
                .map(snippet => {
                    // Final cleanup: remove quotes and trim
                    snippet = snippet.trim();
                    if ((snippet.startsWith('"') && snippet.endsWith('"')) || 
                        (snippet.startsWith("'") && snippet.endsWith("'"))) {
                        snippet = snippet.substring(1, snippet.length - 1).trim();
                    }
                    return snippet;
                });
            
            log(`Raw AI response: "${text}"`);
            log(`Parsed into ${results.length} result(s):`, results);
            
            // Return array of results if multiple, single result if one, null if none
            if (results.length > 0) {
                log(`API returned ${results.length} valid result(s)`);
                return results;
            } else {
                log('API response contained no valid results after filtering');
                return null;
            }
        } else {
            logError("Unexpected API response structure:", result);
            return { error: 'Invalid API response structure' };
        }

    } catch (error) {
        logError("Error calling Cerebras API:", error);
        return { error: error.message };
    }
} 