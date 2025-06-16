// background.js - Main orchestrator for the SmartFind extension

import { log } from './utils.js';
import { setupMessageListener, sendMessageToContentScript } from './messaging.js';
import { handleStartupSync, handleInstallSync } from './authentication.js';

log('Background script loaded');

// Setup message handling
setupMessageListener();

// Auto-sync tokens on startup for authenticated users (but only if it's been a while since last sync)
chrome.runtime.onStartup.addListener(handleStartupSync);

// Also sync when extension is installed or updated (but only on first install)
chrome.runtime.onInstalled.addListener(handleInstallSync);

// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    log('Extension icon clicked, tab:', tab.id);
    if (tab.id) {
        sendMessageToContentScript(tab.id, { action: "toggleUI" });
    }
});

// Listen for the Ctrl+F keyboard shortcut to activate enhanced search
chrome.commands.onCommand.addListener((command) => {
    log('Command received:', command);
    if (command === "toggle-smartfind") {
        // Send a message to the active tab's content script to toggle the enhanced search UI
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                log('Activating SmartFind enhanced search on tab:', tabs[0].id);
                sendMessageToContentScript(tabs[0].id, { action: "toggleUI" });
            }
        });
    }
});