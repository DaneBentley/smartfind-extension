// SmartFind Extension Test Script
// Run this in Chrome DevTools Console on any webpage

console.log('🧪 SmartFind Extension Test Suite');
console.log('================================');

// Test 1: Check if extension is loaded
function testExtensionLoaded() {
  console.log('\n1️⃣ Testing Extension Load...');
  
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log('✅ Extension runtime available');
    return true;
  } else {
    console.log('❌ Extension not loaded');
    return false;
  }
}

// Test 2: Check search functionality
function testSearchFunction() {
  console.log('\n2️⃣ Testing Search Function...');
  
  // Trigger search bar
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    code: 'KeyF',
    ctrlKey: true,
    shiftKey: true
  });
  document.dispatchEvent(event);
  
  setTimeout(() => {
    const searchBar = document.getElementById('smartfind-search-container');
    if (searchBar) {
      console.log('✅ Search bar appears');
      console.log('   Try searching: "what is this about" or "summarize main points"');
    } else {
      console.log('❌ Search bar not found');
    }
  }, 500);
}

// Test 3: Check token status
async function testTokenStatus() {
  console.log('\n3️⃣ Testing Token Status...');
  
  return new Promise((resolve) => {
    chrome.storage.local.get(['usageCount', 'paidTokens'], (result) => {
      const usage = result.usageCount || 0;
      const tokens = result.paidTokens || 0;
      
      console.log(`📊 Usage count: ${usage}/50`);
      console.log(`🪙 Paid tokens: ${tokens}`);
      
      if (usage >= 50 && tokens <= 0) {
        console.log('⚠️  At free tier limit - payment button should appear');
      } else if (usage < 50) {
        console.log('✅ Within free tier limit');
      } else {
        console.log('✅ Using paid tokens');
      }
      
      resolve({ usage, tokens });
    });
  });
}

// Test 4: Test payment system
function testPaymentSystem() {
  console.log('\n4️⃣ Testing Payment System...');
  
  chrome.runtime.sendMessage({ action: "purchaseTokens" }, (response) => {
    if (response) {
      if (response.success) {
        console.log('✅ Payment system working - would redirect to Stripe');
      } else {
        console.log('⚠️  Payment system unavailable - using test tokens');
        console.log('   Error:', response.error);
      }
    } else {
      console.log('❌ No response from payment system');
    }
  });
}

// Test 5: Add test tokens
function addTestTokens() {
  console.log('\n5️⃣ Adding Test Tokens...');
  
  chrome.runtime.sendMessage({ action: "addTestTokens" }, (response) => {
    if (response && response.success) {
      console.log('✅ Added 1000 test tokens');
    } else {
      console.log('❌ Failed to add test tokens');
    }
  });
}

// Test 6: Check API connectivity
async function testAPIConnectivity() {
  console.log('\n6️⃣ Testing API Connectivity...');
  
  try {
    const response = await fetch('https://smartfind-extension-ffbscu551.vercel.app/api/test-payment');
    const data = await response.json();
    
    console.log('✅ API accessible');
    console.log('   Stripe keys configured:', data.environment.hasStripeKey);
    console.log('   Webhook configured:', data.environment.hasWebhookSecret);
  } catch (error) {
    console.log('❌ API not accessible:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Running all tests...\n');
  
  testExtensionLoaded();
  testSearchFunction();
  await testTokenStatus();
  testPaymentSystem();
  await testAPIConnectivity();
  
  console.log('\n✨ Test complete! Check results above.');
  console.log('\n📝 Manual tests:');
  console.log('   1. Press Ctrl+Shift+F to open search');
  console.log('   2. Try AI queries like "summarize this page"');
  console.log('   3. Check that result count matches highlights');
  console.log('   4. Use searches until limit, test payment button');
}

// Utility functions for manual testing
window.SmartFindTest = {
  runAll: runAllTests,
  testTokens: testTokenStatus,
  addTokens: addTestTokens,
  testAPI: testAPIConnectivity,
  testPayment: testPaymentSystem
};

console.log('\n🔧 Available test functions:');
console.log('   SmartFindTest.runAll() - Run all tests');
console.log('   SmartFindTest.testTokens() - Check token status');
console.log('   SmartFindTest.addTokens() - Add test tokens');
console.log('   SmartFindTest.testAPI() - Test API connectivity');
console.log('   SmartFindTest.testPayment() - Test payment system');
console.log('\nRun SmartFindTest.runAll() to start testing!'); 