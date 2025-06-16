// Test script to verify token count fix
// Run this in the browser console on any page with the extension loaded

console.log('🧪 Testing Token Count Fix...');

async function testTokenDecrement() {
    console.log('\n1️⃣ Testing Token Decrement...');
    
    // Get initial token count
    const initialTokens = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "getPaidTokens" }, resolve);
    });
    console.log(`Initial tokens: ${initialTokens}`);
    
    if (initialTokens <= 0) {
        console.log('⚠️  No tokens available. Adding test tokens...');
        await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: "addTestTokens" }, resolve);
        });
        
        const newTokens = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: "getPaidTokens" }, resolve);
        });
        console.log(`Tokens after adding test tokens: ${newTokens}`);
    }
    
    // Simulate token usage by performing an AI search
    console.log('🔍 Performing AI search to use a token...');
    const searchResult = await new Promise(resolve => {
        chrome.runtime.sendMessage({
            action: "performAISearch",
            query: "What is artificial intelligence?",
            content: "This is test content for AI search"
        }, resolve);
    });
    
    if (searchResult.success) {
        console.log('✅ AI search successful');
        
        // Check token count after usage
        const tokensAfterUse = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: "getPaidTokens" }, resolve);
        });
        console.log(`Tokens after use: ${tokensAfterUse}`);
        
        if (tokensAfterUse < initialTokens) {
            console.log('✅ Token count decremented correctly!');
            return true;
        } else {
            console.log('❌ Token count did not decrement');
            return false;
        }
    } else {
        console.log('❌ AI search failed:', searchResult.error);
        return false;
    }
}

async function testSyncBehavior() {
    console.log('\n2️⃣ Testing Sync Behavior...');
    
    // Get token count before sync
    const tokensBeforeSync = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "getPaidTokens" }, resolve);
    });
    console.log(`Tokens before sync: ${tokensBeforeSync}`);
    
    // Trigger a sync
    console.log('🔄 Triggering sync...');
    const syncResult = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "syncUserData" }, resolve);
    });
    
    if (syncResult.success) {
        console.log('✅ Sync completed');
        
        // Check token count after sync
        const tokensAfterSync = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: "getPaidTokens" }, resolve);
        });
        console.log(`Tokens after sync: ${tokensAfterSync}`);
        
        if (tokensAfterSync === tokensBeforeSync) {
            console.log('✅ Token count preserved after sync!');
            return true;
        } else {
            console.log('❌ Token count changed after sync');
            console.log(`Expected: ${tokensBeforeSync}, Got: ${tokensAfterSync}`);
            return false;
        }
    } else {
        console.log('❌ Sync failed:', syncResult.error);
        return false;
    }
}

async function runTests() {
    console.log('🚀 Starting Token Fix Tests...\n');
    
    const test1 = await testTokenDecrement();
    const test2 = await testSyncBehavior();
    
    console.log('\n📊 Test Results:');
    console.log(`Token Decrement: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Sync Behavior: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    
    if (test1 && test2) {
        console.log('\n🎉 All tests passed! Token count fix is working correctly.');
    } else {
        console.log('\n⚠️  Some tests failed. The fix may need additional work.');
    }
}

// Run the tests
runTests().catch(console.error);

// Export for manual testing
window.testTokenFix = {
    runTests,
    testTokenDecrement,
    testSyncBehavior
}; 