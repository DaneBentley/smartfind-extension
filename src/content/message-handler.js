// Message handling module for background script communication

export class MessageHandler {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    initialize() {
        console.log('SmartFind: Setting up message listener');
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }

    handleMessage(request, sender, sendResponse) {
        console.log('SmartFind: Content script received message:', request.action);
        
        try {
            switch (request.action) {
                case "ping":
                    sendResponse({ ready: true });
                    return false; // Don't keep message channel open
                    
                case "toggleUI":
                    this.handleToggleUI(sendResponse);
                    return true; // Keep message channel open for async response
                    
                default:
                    console.warn('SmartFind: Unknown message action:', request.action);
                    sendResponse({ success: false, error: 'Unknown action' });
                    return false;
            }
        } catch (error) {
            console.error('SmartFind: Error handling message:', error);
            sendResponse({ success: false, error: error.message });
            return false;
        }
    }

    handleToggleUI(sendResponse) {
        try {
            // Ensure DOM is ready before trying to create UI
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.uiManager.toggleSearchBar();
                    sendResponse({ success: true });
                });
            } else {
                this.uiManager.toggleSearchBar();
                sendResponse({ success: true });
            }
        } catch (error) {
            console.error('SmartFind: Error in toggleUI:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
} 