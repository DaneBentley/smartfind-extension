// test-auth-debug.js - Debug authentication issues

console.log('🔍 SmartFind Authentication Debug Tool');
console.log('=====================================');

// Test the API endpoints directly
async function testAPIEndpoints() {
    const API_BASE_URL = 'https://smartfind-extension-ffbscu551.vercel.app';
    
    console.log('\n1️⃣ Testing API Base URL...');
    try {
        const response = await fetch(`${API_BASE_URL}/api/test`);
        console.log('✅ API Base URL Status:', response.status);
        const text = await response.text();
        console.log('📄 Response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    } catch (error) {
        console.error('❌ API Base URL Error:', error.message);
    }

    console.log('\n2️⃣ Testing OAuth Endpoint...');
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/oauth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'google',
                googleToken: 'test-token',
                email: 'test@example.com',
                name: 'Test User'
            })
        });
        console.log('✅ OAuth Endpoint Status:', response.status);
        const text = await response.text();
        console.log('📄 Response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        
        // Try to parse as JSON
        try {
            const json = JSON.parse(text);
            console.log('✅ Valid JSON response');
        } catch (jsonError) {
            console.error('❌ Invalid JSON response - this is likely the issue!');
            console.error('🔍 First 500 chars of response:', text.substring(0, 500));
        }
    } catch (error) {
        console.error('❌ OAuth Endpoint Error:', error.message);
    }

    console.log('\n3️⃣ Testing Google Token Info API...');
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=invalid-token');
        console.log('✅ Google API Status:', response.status);
        const text = await response.text();
        console.log('📄 Response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    } catch (error) {
        console.error('❌ Google API Error:', error.message);
    }
}

// Test Chrome extension OAuth
async function testChromeOAuth() {
    console.log('\n4️⃣ Testing Chrome OAuth...');
    
    if (typeof chrome !== 'undefined' && chrome.identity) {
        try {
            console.log('🔑 Attempting to get auth token...');
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError) {
                    console.log('ℹ️ No cached token:', chrome.runtime.lastError.message);
                    console.log('💡 Try interactive: true to sign in');
                } else {
                    console.log('✅ Got cached token:', token ? 'Yes' : 'No');
                    if (token) {
                        testGoogleUserInfo(token);
                    }
                }
            });
        } catch (error) {
            console.error('❌ Chrome OAuth Error:', error.message);
        }
    } else {
        console.log('ℹ️ Chrome identity API not available (run this in extension context)');
    }
}

// Test Google user info with token
async function testGoogleUserInfo(token) {
    console.log('\n5️⃣ Testing Google User Info...');
    try {
        const response = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
        console.log('✅ Google User Info Status:', response.status);
        
        if (response.ok) {
            const userInfo = await response.json();
            console.log('✅ User Info:', { email: userInfo.email, name: userInfo.name });
        } else {
            const text = await response.text();
            console.log('❌ Error Response:', text);
        }
    } catch (error) {
        console.error('❌ Google User Info Error:', error.message);
    }
}

// Check environment setup
function checkEnvironment() {
    console.log('\n6️⃣ Environment Check...');
    console.log('🌐 User Agent:', navigator.userAgent);
    console.log('🔗 Current URL:', window.location.href);
    console.log('🎯 Chrome Extension:', typeof chrome !== 'undefined' ? 'Available' : 'Not Available');
    console.log('🔐 Chrome Identity:', typeof chrome !== 'undefined' && chrome.identity ? 'Available' : 'Not Available');
}

// Run all tests
async function runDebugTests() {
    checkEnvironment();
    await testAPIEndpoints();
    await testChromeOAuth();
    
    console.log('\n🎯 Debug Complete!');
    console.log('================');
    console.log('💡 If you see "Invalid JSON response", check your Vercel environment variables:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_SERVICE_KEY'); 
    console.log('   - JWT_SECRET');
    console.log('\n💡 If Google OAuth fails, check your manifest.json client_id');
    console.log('\n💡 Run this in the browser console while on any webpage');
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    runDebugTests();
}

// Export for manual testing
if (typeof module !== 'undefined') {
    module.exports = { runDebugTests, testAPIEndpoints, testChromeOAuth };
} 