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
        log('Free tier limit reached and no paid tokens');
        sendResponse({ error: "Free tier limit reached. Please purchase more tokens to continue." });
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

    // Create a prompt that emphasizes exact extraction over summarization
    const prompt = `You are a text extraction tool. Your job is to find and copy exact text snippets from the provided content that match the user's query. Try to decode typos and abbreviations.

CRITICAL RULES:
1. COPY text exactly as it appears - do NOT paraphrase, summarize, or rewrite
2. Return the most relevant text that directly answers the query
3. For specific data (names, emails, phones): Return short, precise answers
4. For concepts, explanations, or summaries: Return complete sentences or paragraphs that best address the query
5. If you find multiple relevant sections, separate them with "|||"
6. If no exact matches exist, return "NO_MATCH_FOUND"
7. Do NOT add your own commentary, formatting, or explanations
8. Do NOT use markdown formatting like ** or bullets
9. PRESERVE the original capitalization, punctuation, and spacing

RESPONSE LENGTH GUIDELINES:
- For "names" or "people": Return actual person names "John Smith"
- For "email": Return email addresses "help@company.com"
- For "phone": Return phone numbers "(555) 123-4567"
- For "summary", "tldr", "main point", "explanation", or concept queries: Return complete relevant text that best answers the question (can be longer)
- For "what is", "how does", "why": Return best fit explanation (can be multiple sentences)

Examples of GOOD responses for comparion:
- Query: "names" → "John Smith" ||| "Dr. Sarah Johnson" ||| "Mike Chen"
- Query: "email" → "help@company.com"
- Query: "phone" → "(555) 123-4567"
- Query: "main point" "tldr" "summary" "conclusion"→ find a sentince or paragraph that sums up the content best
- Query: "what is post-labor economy" → "The foundational premise of a post-labor economy is..."

User Query: "${query}"

Text Content:
---
${truncatedContent}
---

Extract exact matching text that answers the query (separate multiple results with |||):`;

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
            
            // Check for explicit no match response
            if (text === "NO_MATCH_FOUND" || text.toLowerCase().includes('no match found')) {
                log('API explicitly returned no matches');
                return null;
            }
            
            // Parse multiple results separated by |||
            const results = text.split('|||')
                .map(snippet => snippet.trim())
                .filter(snippet => snippet.length > 0 && snippet !== "NO_MATCH_FOUND" && !snippet.toLowerCase().includes('no match found'));
            
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