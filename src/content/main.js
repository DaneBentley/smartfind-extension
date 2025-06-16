// SmartFind content script main entry point

import { ContentMonitor } from './content-monitor.js';
import { UIManager } from './ui-manager.js';
import { SearchManager } from './search-manager.js';
import { MessageHandler } from './message-handler.js';
import { HighlightManager } from './highlight-manager.js';
import { StatusManager } from './status-manager.js';

console.log('SmartFind: Content script loaded on:', window.location.href);

try {

    // Initialize all managers
    const contentMonitor = new ContentMonitor();
    const highlightManager = new HighlightManager();
    const statusManager = new StatusManager();
    const uiManager = new UIManager(highlightManager, statusManager);
    const searchManager = new SearchManager(contentMonitor, highlightManager, statusManager);
    const messageHandler = new MessageHandler(uiManager);

    // Initialize the system
    async function initialize() {
        try {
            console.log('SmartFind: Initializing content script modules');
            
            // Initialize content monitoring
            contentMonitor.initialize();
            
            // Set up message handling
            messageHandler.initialize();
            
            // Send ready signal to background script
            if (chrome.runtime && chrome.runtime.sendMessage) {
                try {
                    chrome.runtime.sendMessage({ action: "contentScriptReady" }, (response) => {
                        // Ignore response, this is just to establish connection
                    });
                } catch (error) {
                    // Ignore errors, this is just a courtesy signal
                }
            }
            
            // Set up search manager with UI manager reference
            searchManager.setUIManager(uiManager);
            uiManager.setSearchManager(searchManager);
            
            console.log('SmartFind: Content script initialization complete');
            
        } catch (error) {
            console.error('SmartFind: Error during initialization:', error);
        }
    }

    // Add global test function
    window.smartfindTest = function() {
        console.log('SmartFind: Manual test triggered');
        uiManager.toggleSearchBar();
    };

    // Cleanup function
    function cleanup() {
        console.log('SmartFind: Cleaning up');
        contentMonitor.cleanup();
        highlightManager.clearHighlights();
        uiManager.cleanup();
    }

    // Listen for page unload to cleanup
    window.addEventListener('beforeunload', cleanup);

    // Start initialization
    initialize();

    // Export for testing purposes
    window.SmartFind = {
        contentMonitor,
        uiManager,
        searchManager,
        messageHandler,
        highlightManager,
        statusManager
    };
    
    console.log('SmartFind: Script setup complete, globals exported');
    
} catch (error) {
    console.error('SmartFind: Critical error during script loading:', error);
    console.error('SmartFind: Stack trace:', error.stack);
} 