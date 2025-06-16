// config.js - Configuration and constants

export const CONFIG = {
    FREE_TIER_LIMIT: 50,
    API_BASE_URL: 'https://smartfind-api.vercel.app',
    MAX_CONTENT_LENGTH: 25000, // Conservative limit for llama3.1-8b
    SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
    SYNC_TOKEN_INTERVAL: 10, // Sync every 10 token uses
    
    // Timeouts and delays
    CONTENT_SCRIPT_INJECTION_DELAY: 200,
    CONTENT_SCRIPT_RETRY_DELAY: 500,
    BADGE_DISPLAY_DURATION: 3000,
    
    // API endpoints
    get PAYMENT_API_URL() {
        return `${this.API_BASE_URL}/api`;
    }
};

// Whitelist of user IDs that get unlimited free usage
export const UNLIMITED_FREE_USERS = [
    // Add your personal user IDs here
    // 'user_1234567890_abcdef123',  // Example format
];

// Restricted URL patterns for content script injection
export const RESTRICTED_URL_PATTERNS = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^edge-extension:\/\//,
    /^about:/,
    /^file:\/\//,
    /^data:/,
    /^blob:/
];

// AI search indicators for query classification
export const AI_INDICATORS = [
    // Question words
    /^(what|where|when|why|how|who|which|can|does|is|are|will|would|should)/i,
    // Natural language patterns
    /\b(explain|describe|find|show|tell me|about|regarding|concerning)\b/i,
    // Summarization and analysis intents
    /\b(tldr|tl;dr|tl dr|summary|summarize|summarise|in a nutshell|key takeaway|key takeaways|main point|main points|gist|essence|overview|recap|brief|highlights|important|crucial|significant|notable|bottom line|core|central|primary|fundamental)\b/i,
    // Intent phrases for summaries
    /\b(give me the|what's the|whats the).*(summary|gist|main point|key|important|essence)\b/i,
    // Analysis and understanding intents
    /\b(analyze|analyse|break down|interpret|meaning|significance|implication|conclusion|insight|understanding|perspective)\b/i,
    // Complex phrases (more than 3 words with common connecting words)
    /\b(and|or|but|with|without|that|which|where|when)\b.*\b(and|or|but|with|without|that|which|where|when)\b/i,
    // Specific content type searches
    /\b(emails?|phone numbers?|names?|headings?|titles?|links?|addresses?|dates?|prices?|numbers?|contacts?|people|persons?)\b/i,
    // Intent-based searches
    /\b(all|every|find all|show all|list all|get all)\s+(emails?|phone numbers?|names?|headings?|titles?|links?|addresses?|dates?|prices?|numbers?|contacts?)\b/i
];

// Keyword search indicators
export const KEYWORD_INDICATORS = [
    // Technical terms, URLs, emails (when searching for exact match)
    /^[@\.\/\\:]+[\w@\.\/\\:]*$/,
    // Numbers, dates, codes (when searching for exact match)
    /^\d+[\d\-\/\.]*$/,
    // Quoted exact matches
    /^".*"$/,
    // Single technical words
    /^[a-zA-Z0-9_\-\.]+$/
]; 