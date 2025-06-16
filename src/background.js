// background.js - Main orchestrator for the SmartFind extension

import { log } from './utils.js';
import { setupMessageListener, sendMessageToContentScript } from './messaging.js';
import { handleStartupSync, handleInstallSync } from './authentication.js';
import { checkAndHandleMonthlyReplenishment } from './usage-tracking.js';

log('Background script loaded');

// Setup message handling
setupMessageListener();

// Auto-sync tokens on startup for authenticated users (but only if it's been a while since last sync)
chrome.runtime.onStartup.addListener(handleStartupSync);

// Also sync when extension is installed or updated (but only on first install)
chrome.runtime.onInstalled.addListener(handleInstallSync);

// Check authentication status and update icon
async function updateExtensionIcon() {
    try {
        const { authToken, currentUser } = await chrome.storage.local.get(['authToken', 'currentUser']);
        const isAuthenticated = !!(authToken && currentUser);
        
        if (isAuthenticated) {
            // User is signed in - show normal state
            chrome.action.setTitle({ title: "SmartFind: AI-Enhanced Search" });
            chrome.action.setBadgeText({ text: "" });
            
            // Check for monthly replenishment
            await checkAndHandleMonthlyReplenishment();
        } else {
            // User is not signed in - show sign-in prompt
            chrome.action.setTitle({ title: "SmartFind: Click to Sign In" });
            chrome.action.setBadgeText({ text: "!" });
            chrome.action.setBadgeBackgroundColor({ color: "#0969da" });
        }
    } catch (error) {
        log('Error updating extension icon:', error);
    }
}

// Update icon on startup
updateExtensionIcon();

// Update icon when storage changes (authentication state changes)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.authToken || changes.currentUser)) {
        updateExtensionIcon();
    }
});

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

// Periodic check for monthly replenishment (every hour)
chrome.alarms.create('monthlyReplenishmentCheck', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'monthlyReplenishmentCheck') {
        log('Performing periodic replenishment check');
        checkAndHandleMonthlyReplenishment();
    }
});