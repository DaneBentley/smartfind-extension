// Test script for flexible payment system
// Run this in browser console to test the payment functionality

console.log('🧪 Testing SmartFind Flexible Payment System');

// Test token calculation function
function testTokenCalculation() {
    console.log('\n📊 Testing Token Calculation:');
    
    const testCases = [
        { amount: 1, expected: 100 },
        { amount: 5, expected: 500 },
        { amount: 10, expected: 1000 },
        { amount: 15.50, expected: 1550 },
        { amount: 25, expected: 2500 },
        { amount: 100, expected: 10000 },
        { amount: 500, expected: 50000 }
    ];
    
    testCases.forEach(test => {
        const tokens = Math.floor(test.amount * 100);
        const passed = tokens === test.expected;
        console.log(`$${test.amount} → ${tokens} tokens ${passed ? '✅' : '❌'}`);
    });
}

// Test amount validation
function testAmountValidation() {
    console.log('\n🔍 Testing Amount Validation:');
    
    const testCases = [
        { amount: 0.5, valid: false, reason: 'Below minimum' },
        { amount: 1, valid: true, reason: 'At minimum' },
        { amount: 10, valid: true, reason: 'Normal amount' },
        { amount: 500, valid: true, reason: 'At maximum' },
        { amount: 501, valid: false, reason: 'Above maximum' },
        { amount: -5, valid: false, reason: 'Negative amount' }
    ];
    
    testCases.forEach(test => {
        const isValid = test.amount >= 1 && test.amount <= 500;
        const passed = isValid === test.valid;
        console.log(`$${test.amount} → ${isValid ? 'Valid' : 'Invalid'} (${test.reason}) ${passed ? '✅' : '❌'}`);
    });
}

// Test API payload structure
function testAPIPayload() {
    console.log('\n📡 Testing API Payload Structure:');
    
    const testAmount = 15.75;
    const expectedTokens = Math.floor(testAmount * 100);
    
    const payload = {
        userId: 'test_user_123',
        amount: testAmount
    };
    
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log(`Expected tokens: ${expectedTokens}`);
    console.log(`Amount in cents: ${Math.round(testAmount * 100)}`);
}

// Test UI update function (simulated)
function testUIUpdate() {
    console.log('\n🎨 Testing UI Update Logic:');
    
    function simulateUpdateTokenDisplay(type, amount) {
        const numAmount = parseFloat(amount) || 0;
        const tokens = Math.floor(numAmount * 100);
        return { type, amount: numAmount, tokens };
    }
    
    const testCases = [
        { type: 'auth', amount: '5' },
        { type: 'anon', amount: '12.50' },
        { type: 'auth', amount: '25' },
        { type: 'anon', amount: '100' }
    ];
    
    testCases.forEach(test => {
        const result = simulateUpdateTokenDisplay(test.type, test.amount);
        console.log(`${test.type}: $${result.amount} → ${result.tokens.toLocaleString()} tokens`);
    });
}

// Run all tests
function runAllTests() {
    testTokenCalculation();
    testAmountValidation();
    testAPIPayload();
    testUIUpdate();
    
    console.log('\n🎉 All tests completed!');
    console.log('\n💡 To test in the extension:');
    console.log('1. Load the extension in Chrome');
    console.log('2. Use it until you hit the search limit');
    console.log('3. Try different amounts in the payment field');
    console.log('4. Verify token calculations update in real-time');
}

// Auto-run tests
runAllTests();

// Export for manual testing
window.SmartFindPaymentTests = {
    testTokenCalculation,
    testAmountValidation,
    testAPIPayload,
    testUIUpdate,
    runAllTests
}; 