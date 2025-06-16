// Status and UI feedback management module

export class StatusManager {
    constructor() {
        this.statusElement = null;
    }

    // Set the status element reference
    setStatusElement(element) {
        this.statusElement = element;
    }

    // Set status message with optional type styling
    setStatus(message, type = '') {
        if (!this.statusElement) {
            this.statusElement = document.getElementById('smartfind-status');
        }
        
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.className = `smartfind-status ${type}`;
            
            if (message) {
                this.statusElement.style.display = 'block';
            } else {
                this.statusElement.style.display = 'none';
            }
        }
    }

    // Show payment option when user hits limit
    showPaymentOption(errorMessage) {
        if (!this.statusElement) {
            this.statusElement = document.getElementById('smartfind-status');
        }
        
        if (this.statusElement) {
            this.statusElement.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span>${errorMessage}</span>
                    <button id="smartfind-buy-tokens" style="
                        background: #0969da; 
                        color: white; 
                        border: none; 
                        padding: 4px 8px; 
                        border-radius: 4px; 
                        font-size: 11px; 
                        cursor: pointer;
                        white-space: nowrap;
                    ">Buy Tokens</button>
                </div>
            `;
            this.statusElement.className = 'smartfind-status error';
            this.statusElement.style.display = 'block';
            
            // Add click handler for buy button
            const buyButton = document.getElementById('smartfind-buy-tokens');
            if (buyButton) {
                buyButton.addEventListener('click', this.handleTokenPurchase.bind(this));
            }
        }
    }

    // Show sign-in prompt for token purchase
    showSignInPrompt() {
        if (!this.statusElement) {
            this.statusElement = document.getElementById('smartfind-status');
        }
        
        if (this.statusElement) {
            this.statusElement.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span>Sign in to sync your purchase across devices</span>
                        <button id="smartfind-open-popup" style="
                            background: #0969da; 
                            color: white; 
                            border: none; 
                            padding: 4px 8px; 
                            border-radius: 4px; 
                            font-size: 11px; 
                            cursor: pointer;
                            white-space: nowrap;
                        ">Sign In</button>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-size: 11px; color: #656d76;">Or continue without account:</span>
                        <button id="smartfind-buy-anonymous" style="
                            background: #6f42c1; 
                            color: white; 
                            border: none; 
                            padding: 4px 8px; 
                            border-radius: 4px; 
                            font-size: 11px; 
                            cursor: pointer;
                            white-space: nowrap;
                        ">Buy Tokens</button>
                    </div>
                </div>
            `;
            this.statusElement.className = 'smartfind-status info';
            this.statusElement.style.display = 'block';
            
            // Add click handlers
            const signInButton = document.getElementById('smartfind-open-popup');
            if (signInButton) {
                signInButton.addEventListener('click', () => {
                    chrome.runtime.sendMessage({ action: "openPopup" });
                    this.setStatus('Click the SmartFind extension icon to sign in', 'info');
                });
            }
            
            const anonymousButton = document.getElementById('smartfind-buy-anonymous');
            if (anonymousButton) {
                anonymousButton.addEventListener('click', () => {
                    chrome.runtime.sendMessage({ action: "openPopup" });
                    this.setStatus('Click the SmartFind extension icon to purchase tokens', 'info');
                });
            }
        }
    }

    // Handle token purchase
    handleTokenPurchase() {
        chrome.runtime.sendMessage({ action: "openPopup" });
        this.setStatus('Click the SmartFind extension icon to purchase tokens', 'info');
    }

    // Clear status
    clearStatus() {
        this.setStatus('');
    }

    // Show loading status
    showLoading(message = 'Searching...') {
        this.setStatus(message, 'loading');
    }

    // Show success status
    showSuccess(message) {
        this.setStatus(message, 'success');
    }

    // Show warning status
    showWarning(message) {
        this.setStatus(message, 'warning');
    }

    // Show error status
    showError(message) {
        this.setStatus(message, 'error');
    }

    // Show info status
    showInfo(message) {
        this.setStatus(message, 'info');
    }
} 