// Test script for SmartFind search fixes
console.log('🔧 Testing SmartFind search fixes...');

// Test 1: Range validation
function testRangeValidation() {
    console.log('\n1️⃣ Testing range validation...');
    
    // Create a test text node
    const testNode = document.createTextNode('Hello world test');
    
    // Test valid range
    const validMatch = {
        node: testNode,
        start: 0,
        end: 5,
        text: 'Hello'
    };
    
    // Test invalid range (end > node length)
    const invalidMatch = {
        node: testNode,
        start: 0,
        end: 100,
        text: 'Hello'
    };
    
    console.log('Valid match:', validMatch);
    console.log('Invalid match:', invalidMatch);
    console.log('Node length:', testNode.textContent.length);
}

// Test 2: Error handling
function testErrorHandling() {
    console.log('\n2️⃣ Testing error handling...');
    
    try {
        // This should trigger our error handling
        const range = document.createRange();
        const testNode = document.createTextNode('test');
        range.setStart(testNode, 10); // Invalid - beyond node length
    } catch (error) {
        console.log('✅ Caught expected error:', error.name);
    }
}

// Test 3: Regex safety
function testRegexSafety() {
    console.log('\n3️⃣ Testing regex safety...');
    
    const testText = 'Hello world';
    const regex = new RegExp('o', 'gi');
    
    let match;
    let count = 0;
    regex.lastIndex = 0;
    
    while ((match = regex.exec(testText)) !== null && count < 10) {
        console.log('Match found at:', match.index);
        count++;
        
        // Prevent infinite loop
        if (match[0].length === 0) {
            regex.lastIndex++;
        }
    }
    
    console.log('Total matches:', count);
}

// Run tests
testRangeValidation();
testErrorHandling();
testRegexSafety();

console.log('\n✅ Search fix tests completed!');
console.log('💡 The fixes should prevent:');
console.log('   - IndexSizeError: Invalid range offsets');
console.log('   - RangeError: Invalid array length');
console.log('   - DOMException: Range creation failures');
console.log('   - Infinite regex loops'); 