// SmartFind Authentication Test Suite
// Run this in Chrome DevTools Console on any webpage

console.log('🔐 SmartFind Authentication Test Suite');
console.log('=====================================');

// Test Results Storage
let testResults = {
    passed: 0,
    failed: 0,
    results: []
};

function logTest(testName, passed, details = '') {
    const status = passed ? '✅' : '❌';
    const message = `${status} ${testName}`;
    console.log(message + (details ? ` - ${details}` : ''));
    
    testResults.results.push({ testName, passed, details });
    if (passed) testResults.passed++;
    else testResults.failed++;
}

// Test 1: Check Authentication Status
async function testAuthStatus() {
    console.log('\n1️⃣ Testing Authentication Status...');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getAuthStatus" }, (response) => {
            if (response && response.success) {
                logTest('Auth Status Check', true, 
                    `Authenticated: ${response.isAuthenticated}, User: ${response.user?.email || 'None'}`);
                resolve(response);
            } else {
                logTest('Auth Status Check', false, response?.error || 'No response');
                resolve(null);
            }
        });
    });
}

// Test 2: Test Email Signup
async function testEmailSignup() {
    console.log('\n2️⃣ Testing Email Signup...');
    
    const testEmail = `test.${Date.now()}@smartfind.test`;
    const testPassword = 'SecureTestPassword123!';
    const testName = 'Test User';
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
            action: "signUpWithEmail",
            email: testEmail,
            password: testPassword,
            name: testName
        }, (response) => {
            if (response && response.success) {
                logTest('Email Signup', true, `User created: ${response.user.email}`);
                resolve({ email: testEmail, password: testPassword, user: response.user });
            } else {
                logTest('Email Signup', false, response?.error || 'No response');
                resolve(null);
            }
        });
    });
}

// Test 3: Test Email Signin
async function testEmailSignin(credentials) {
    console.log('\n3️⃣ Testing Email Signin...');
    
    if (!credentials) {
        logTest('Email Signin', false, 'No credentials from signup test');
        return null;
    }
    
    // First sign out
    await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "signOut" }, resolve);
    });
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
            action: "signInWithEmail",
            email: credentials.email,
            password: credentials.password
        }, (response) => {
            if (response && response.success) {
                logTest('Email Signin', true, `Signed in: ${response.user.email}`);
                resolve(response.user);
            } else {
                logTest('Email Signin', false, response?.error || 'No response');
                resolve(null);
            }
        });
    });
}

// Test 4: Test Google OAuth
async function testGoogleOAuth() {
    console.log('\n4️⃣ Testing Google OAuth...');
    console.log('⚠️  This test requires user interaction - clicking through Google OAuth popup');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "signInWithGoogle" }, (response) => {
            if (response && response.success) {
                logTest('Google OAuth', true, `Signed in: ${response.user.email}`);
                resolve(response.user);
            } else {
                logTest('Google OAuth', false, response?.error || 'User may have cancelled OAuth');
                resolve(null);
            }
        });
    });
}

// Test 5: Test Data Sync
async function testDataSync() {
    console.log('\n5️⃣ Testing Data Synchronization...');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "syncUserData" }, (response) => {
            if (response && response.success) {
                const data = response.data;
                logTest('Data Sync', true, 
                    `Tokens: ${data?.cloudTokens || 0}, Usage: ${data?.cloudUsage || 0}`);
                resolve(data);
            } else {
                logTest('Data Sync', false, response?.error || 'No response');
                resolve(null);
            }
        });
    });
}

// Test 6: Test Purchase Flow (with Auth)
async function testAuthenticatedPurchase() {
    console.log('\n6️⃣ Testing Authenticated Purchase Flow...');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "purchaseTokens" }, (response) => {
            if (response && response.success) {
                logTest('Authenticated Purchase', true, 'Payment redirect initiated');
                resolve(true);
            } else {
                logTest('Authenticated Purchase', false, response?.error || 'No response');
                resolve(false);
            }
        });
    });
}

// Test 7: Test Purchase Restoration
async function testRestorePurchases() {
    console.log('\n7️⃣ Testing Purchase Restoration...');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "restorePurchases" }, (response) => {
            if (response && response.success) {
                const data = response.data;
                logTest('Restore Purchases', true, 
                    `Total tokens: ${data.totalTokens}, Purchases: ${data.purchaseCount}`);
                resolve(data);
            } else {
                logTest('Restore Purchases', false, response?.error || 'No response');
                resolve(null);
            }
        });
    });
}

// Test 8: Test Token Storage Sync
async function testTokenSync() {
    console.log('\n8️⃣ Testing Token Storage Sync...');
    
    // Add some test tokens locally
    await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "addTestTokens" }, resolve);
    });
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Sync data
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "syncUserData" }, (response) => {
            if (response && response.success) {
                logTest('Token Sync', true, 'Test tokens synced to cloud');
                resolve(true);
            } else {
                logTest('Token Sync', false, response?.error || 'Sync failed');
                resolve(false);
            }
        });
    });
}

// Test 9: Test Sign Out
async function testSignOut() {
    console.log('\n9️⃣ Testing Sign Out...');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "signOut" }, (response) => {
            if (response && response.success) {
                logTest('Sign Out', true, 'Successfully signed out');
                resolve(true);
            } else {
                logTest('Sign Out', false, response?.error || 'No response');
                resolve(false);
            }
        });
    });
}

// Test 10: Verify Anonymous Mode Still Works
async function testAnonymousMode() {
    console.log('\n🔟 Testing Anonymous Mode (Post Sign-Out)...');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getAuthStatus" }, (response) => {
            if (response && response.success && !response.isAuthenticated) {
                logTest('Anonymous Mode', true, 'Extension works without authentication');
                resolve(true);
            } else {
                logTest('Anonymous Mode', false, 'Still appears authenticated');
                resolve(false);
            }
        });
    });
}

// Main Test Runner
async function runAllAuthTests() {
    console.log('🚀 Running authentication test suite...\n');
    
    try {
        // Basic functionality tests
        const initialAuthStatus = await testAuthStatus();
        
        // Authentication tests
        const signupResult = await testEmailSignup();
        const signinResult = await testEmailSignin(signupResult);
        
        // If email auth works, test advanced features
        if (signinResult) {
            await testDataSync();
            await testTokenSync();
            await testAuthenticatedPurchase();
            await testRestorePurchases();
        }
        
        // OAuth test (optional - requires user interaction)
        console.log('\n🔄 Google OAuth Test (Optional)');
        console.log('📝 Uncomment the next line to test Google OAuth (requires user interaction)');
        // await testGoogleOAuth();
        
        // Cleanup tests
        await testSignOut();
        await testAnonymousMode();
        
    } catch (error) {
        console.error('❌ Test suite error:', error);
        logTest('Test Suite', false, error.message);
    }
    
    // Display results
    console.log('\n📊 Test Results Summary');
    console.log('=======================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📋 Total: ${testResults.results.length}`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.results
            .filter(r => !r.passed)
            .forEach(r => console.log(`   • ${r.testName}: ${r.details}`));
    }
    
    console.log('\n✨ Authentication test suite complete!');
    
    // Return results for programmatic access
    return testResults;
}

// Test Individual Components
async function testAuthComponent(component) {
    switch (component) {
        case 'status':
            return await testAuthStatus();
        case 'signup':
            return await testEmailSignup();
        case 'signin':
            return await testEmailSignin();
        case 'google':
            return await testGoogleOAuth();
        case 'sync':
            return await testDataSync();
        case 'purchase':
            return await testAuthenticatedPurchase();
        case 'restore':
            return await testRestorePurchases();
        case 'signout':
            return await testSignOut();
        default:
            console.log('❌ Unknown component:', component);
            return null;
    }
}

// Make functions available globally
window.SmartFindAuthTest = {
    runAll: runAllAuthTests,
    test: testAuthComponent,
    testStatus: testAuthStatus,
    testSignup: testEmailSignup,
    testSignin: testEmailSignin,
    testGoogle: testGoogleOAuth,
    testSync: testDataSync,
    testPurchase: testAuthenticatedPurchase,
    testRestore: testRestorePurchases,
    testSignout: testSignOut
};

console.log('\n🔧 Available authentication test functions:');
console.log('   SmartFindAuthTest.runAll() - Run complete test suite');
console.log('   SmartFindAuthTest.test("component") - Test specific component');
console.log('   SmartFindAuthTest.testGoogle() - Test Google OAuth (requires interaction)');
console.log('   SmartFindAuthTest.testStatus() - Check authentication status');
console.log('   SmartFindAuthTest.testSync() - Test data synchronization');
console.log('\nRun SmartFindAuthTest.runAll() to start testing!'); 