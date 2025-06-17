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

// Regex pattern indicators - queries that should use regex search automatically
export const REGEX_INDICATORS = [
    // Email searches
    /^emails?$/i,
    /^email addresses?$/i,
    /^find emails?$/i,
    /^show emails?$/i,
    /^all emails?$/i,
    
    // Phone number searches
    /^phones?$/i,
    /^phone numbers?$/i,
    /^find phones?$/i,
    /^show phones?$/i,
    /^all phones?$/i,
    /^telephone$/i,
    /^tel$/i,
    
    // URL/link searches
    /^links?$/i,
    /^urls?$/i,
    /^websites?$/i,
    /^find links?$/i,
    /^show links?$/i,
    /^all links?$/i,
    
    // Date searches
    /^dates?$/i,
    /^find dates?$/i,
    /^show dates?$/i,
    /^all dates?$/i,
    
    // Number searches (when clearly looking for numeric data)
    /^numbers?$/i,
    /^find numbers?$/i,
    /^show numbers?$/i,
    /^prices?$/i,
    /^amounts?$/i,
    /^costs?$/i,
    
    // Social media handles
    /^@\w+$/,
    /^handles?$/i,
    /^usernames?$/i,
    /^twitter$/i,
    /^instagram$/i,
    
    // IP addresses
    /^ips?$/i,
    /^ip addresses?$/i,
    
    // Hashtags
    /^#\w+$/,
    /^hashtags?$/i,
    
    // Postal codes
    /^zip codes?$/i,
    /^postal codes?$/i,
    /^postcodes?$/i
];

// Common regex patterns for auto-detection
export const REGEX_PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    url: /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,
    date: /\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi,
    number: /\b\d+(?:\.\d+)?\b/g,
    price: /\$\d+(?:\.\d{2})?|\b\d+(?:\.\d{2})?\s*(?:dollars?|USD|cents?)\b/gi,
    socialHandle: /@[A-Za-z0-9_]+/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    hashtag: /#[A-Za-z0-9_]+/g,
    zipCode: /\b\d{5}(?:-\d{4})?\b/g
};

// AI search indicators for query classification (simplified to focus on semantic understanding)
export const AI_INDICATORS = [
    // Question words
    /^(what|where|when|why|how|who|which|can|does|is|are|will|would|should)/i,
    // Natural language patterns
    /\b(explain|describe|tell me|about|regarding|concerning)\b/i,
    // Summarization and analysis intents
    /\b(tldr|tl;dr|tl dr|summary|summarize|summarise|in a nutshell|key takeaway|key takeaways|main point|main points|gist|essence|overview|recap|brief|highlights|important|crucial|significant|notable|bottom line|core|central|primary|fundamental)\b/i,
    // Intent phrases for summaries
    /\b(give me the|what's the|whats the).*(summary|gist|main point|key|important|essence)\b/i,
    // Analysis and understanding intents
    /\b(analyze|analyse|break down|interpret|meaning|significance|implication|conclusion|insight|understanding|perspective)\b/i,
    // Complex phrases (more than 3 words with common connecting words)
    /\b(and|or|but|with|without|that|which|where|when)\b.*\b(and|or|but|with|without|that|which|where|when)\b/i
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