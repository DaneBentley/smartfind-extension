#!/usr/bin/env node

/**
 * Console Log Cleanup Script for SmartFind Extension
 * This script replaces development console.log statements with production-safe alternatives
 * Run with: node cleanup-console-logs.js
 */

const fs = require('fs');
const path = require('path');

// Files to process
const filesToProcess = [
    'content.js',
    'popup.js', 
    'auth.js',
    'background.js',
    'src/background.js',
    'src/authentication.js',
    'src/messaging.js',
    'src/payment.js',
    'src/usage-tracking.js'
];

// Replacement patterns
const replacements = [
    // Replace console.log with conditional logging
    {
        pattern: /console\.log\('SmartFind: ([^']+)'(.*)\);/g,
        replacement: "// log('$1'$2); // Disabled for production"
    },
    // Replace console.log with template literals
    {
        pattern: /console\.log\(`SmartFind: ([^`]+)`(.*)\);/g,
        replacement: "// log(`$1`$2); // Disabled for production"
    },
    // Replace generic console.log
    {
        pattern: /console\.log\(([^)]+)\);/g,
        replacement: "// console.log($1); // Disabled for production"
    }
];

function processFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    console.log(`Processing ${filePath}...`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    // Apply replacements
    replacements.forEach(({ pattern, replacement }) => {
        content = content.replace(pattern, replacement);
    });
    
    if (content !== originalContent) {
        // Create backup
        const backupPath = `${filePath}.backup`;
        fs.writeFileSync(backupPath, originalContent);
        
        // Write cleaned content
        fs.writeFileSync(filePath, content);
        console.log(`✅ Cleaned ${filePath} (backup saved as ${backupPath})`);
    } else {
        console.log(`⏭️  No changes needed for ${filePath}`);
    }
}

// Process all files
console.log('🧹 Starting console.log cleanup for production...\n');

filesToProcess.forEach(processFile);

console.log('\n✨ Console.log cleanup complete!');
console.log('\n📋 Next steps:');
console.log('1. Review the changes in git diff');
console.log('2. Test the extension thoroughly');
console.log('3. Remove .backup files if satisfied: rm *.backup src/*.backup');
console.log('4. Commit with: git add -A && git commit -m "Remove debug console.log for production"'); 