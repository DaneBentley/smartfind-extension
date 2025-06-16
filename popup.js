// popup.js - SmartFind Extension Popup

class PopupManager {
    constructor() {
        this.isSignUpMode = false;
        this.currentUser = null;
        this.authToken = null;
        this.init();
    }

    async init() {
        await this.loadAuthState();
        this.setupEventListeners();
        await this.updateUI();
        await this.loadStats();
        
        // Initialize token displays with default values
        this.updateTokenDisplay('auth', '10');
        this.updateTokenDisplay('anon', '10');
        
        // Auto-sync tokens for authenticated users when popup opens
        if (this.authToken) {
            this.autoSyncTokens();
        }
    }

    async loadAuthState() {
        try {
            const result = await chrome.storage.local.get(['authToken', 'currentUser']);
            this.authToken = result.authToken;
            this.currentUser = result.currentUser;
        } catch (error) {
            console.error('Failed to load auth state:', error);
        }
    }

    setupEventListeners() {
        // Google Sign In
        document.getElementById('google-signin').addEventListener('click', () => {
            this.handleGoogleSignIn();
        });

        // Email Sign In Toggle
        document.getElementById('email-signin-toggle').addEventListener('click', () => {
            this.toggleEmailForm();
        });

        // Email Form Submit
        document.getElementById('email-submit').addEventListener('click', () => {
            this.handleEmailAuth();
        });

        // Auth Mode Toggle (Sign In / Sign Up)
        document.getElementById('auth-toggle').addEventListener('click', () => {
            this.toggleAuthMode();
        });

        // Sign Out
        document.getElementById('sign-out').addEventListener('click', () => {
            this.handleSignOut();
        });

        // Test API connection
        document.getElementById('test-api').addEventListener('click', () => {
            this.handleTestAPI();
        });

        // Token Purchase (Authenticated)
        document.getElementById('buy-tokens-auth').addEventListener('click', () => {
            this.handleTokenPurchase(true);
        });

        // Token Purchase (Anonymous)
        document.getElementById('buy-tokens-anon').addEventListener('click', () => {
            this.handleTokenPurchase(false);
        });

        // Restore Purchases
        document.getElementById('restore-purchases').addEventListener('click', () => {
            this.handleRestorePurchases();
        });

        // Amount input listeners for real-time token calculation
        document.getElementById('amount-auth').addEventListener('input', (e) => {
            this.updateTokenDisplay('auth', e.target.value);
        });

        document.getElementById('amount-anon').addEventListener('input', (e) => {
            this.updateTokenDisplay('anon', e.target.value);
        });

        // Enter key handling for forms
        document.getElementById('email').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleEmailAuth();
        });
        document.getElementById('password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleEmailAuth();
        });
        document.getElementById('name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleEmailAuth();
        });
    }

    async updateUI() {
        const authenticatedView = document.getElementById('authenticated-view');
        const unauthenticatedView = document.getElementById('unauthenticated-view');

        if (this.currentUser && this.authToken) {
            // Show authenticated view
            authenticatedView.classList.remove('hidden');
            unauthenticatedView.classList.add('hidden');

            // Update user info
            document.getElementById('user-name').textContent = this.currentUser.name || 'User';
            document.getElementById('user-email').textContent = this.currentUser.email || '';
            
            // Update avatar
            const avatar = document.getElementById('user-avatar');
            if (this.currentUser.picture) {
                avatar.innerHTML = `<img src="${this.currentUser.picture}" style="width: 100%; height: 100%; border-radius: 50%;">`;
            } else {
                avatar.textContent = (this.currentUser.name || 'U').charAt(0).toUpperCase();
            }
        } else {
            // Show unauthenticated view
            authenticatedView.classList.add('hidden');
            unauthenticatedView.classList.remove('hidden');
        }
    }

    async loadStats() {
        try {
            const result = await chrome.storage.local.get(['paidTokens', 'aiUsageCount']);
            const paidTokens = result.paidTokens || 0;
            const usageCount = result.aiUsageCount || 0;
            const freeSearchesLeft = Math.max(0, 50 - usageCount);

            // Update authenticated view stats
            document.getElementById('token-count').textContent = paidTokens.toLocaleString();
            document.getElementById('usage-count').textContent = usageCount.toLocaleString();
            document.getElementById('free-searches').textContent = freeSearchesLeft.toLocaleString();

            // Update anonymous view stats
            document.getElementById('token-count-anon').textContent = paidTokens.toLocaleString();
            document.getElementById('usage-count-anon').textContent = usageCount.toLocaleString();
            document.getElementById('free-searches-anon').textContent = freeSearchesLeft.toLocaleString();

        } catch (error) {
            console.error('Failed to load stats:', error);
            this.showStatus('Failed to load statistics', 'error');
        }
    }

    updateTokenDisplay(type, amount) {
        const numAmount = parseFloat(amount) || 0;
        const tokens = Math.floor(numAmount * 100); // 100 tokens per dollar
        const tokenElement = document.getElementById(`tokens-${type}`);
        console.log(`SmartFind Popup: Updating ${type} display - Amount: $${numAmount}, Tokens: ${tokens}`);
        if (tokenElement) {
            tokenElement.textContent = tokens.toLocaleString();
            console.log(`SmartFind Popup: Updated ${type} token display to ${tokens.toLocaleString()}`);
        } else {
            console.error(`SmartFind Popup: Could not find token element for ${type}`);
        }
    }

    toggleEmailForm() {
        const emailForm = document.getElementById('email-form');
        const toggleButton = document.getElementById('email-signin-toggle');
        
        if (emailForm.classList.contains('hidden')) {
            emailForm.classList.remove('hidden');
            toggleButton.textContent = 'Hide Email Form';
        } else {
            emailForm.classList.add('hidden');
            toggleButton.textContent = 'Sign in with Email';
        }
    }

    toggleAuthMode() {
        this.isSignUpMode = !this.isSignUpMode;
        const nameGroup = document.getElementById('name-group');
        const submitButton = document.getElementById('email-submit');
        const toggleLink = document.getElementById('auth-toggle');

        if (this.isSignUpMode) {
            nameGroup.style.display = 'block';
            submitButton.textContent = 'Sign Up';
            toggleLink.textContent = 'Already have an account? Sign in';
        } else {
            nameGroup.style.display = 'none';
            submitButton.textContent = 'Sign In';
            toggleLink.textContent = 'Need an account? Sign up';
        }
    }

    async handleGoogleSignIn() {
        this.showStatus('Signing in with Google...', 'info');
        this.setLoading(true);

        try {
            const response = await this.sendMessage({ action: "signInWithGoogle" });
            
            if (response.success) {
                this.showStatus('Successfully signed in!', 'success');
                await this.loadAuthState();
                await this.updateUI();
                await this.loadStats();
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 2000);
            } else {
                this.showStatus(response.error || 'Google sign-in failed', 'error');
            }
        } catch (error) {
            console.error('Google sign-in error:', error);
            this.showStatus('Google sign-in failed', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleEmailAuth() {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const name = document.getElementById('name').value.trim();

        if (!email || !password) {
            this.showStatus('Please fill in all required fields', 'error');
            return;
        }

        if (this.isSignUpMode && !name) {
            this.showStatus('Please enter your full name', 'error');
            return;
        }

        const action = this.isSignUpMode ? 'signUpWithEmail' : 'signInWithEmail';
        const statusMessage = this.isSignUpMode ? 'Creating account...' : 'Signing in...';
        
        this.showStatus(statusMessage, 'info');
        this.setLoading(true);

        try {
            const payload = { action, email, password };
            if (this.isSignUpMode) {
                payload.name = name;
            }

            const response = await this.sendMessage(payload);
            
            if (response.success) {
                this.showStatus('Successfully signed in!', 'success');
                await this.loadAuthState();
                await this.updateUI();
                await this.loadStats();
                
                // Clear form
                document.getElementById('email').value = '';
                document.getElementById('password').value = '';
                document.getElementById('name').value = '';
                
                // Hide email form
                document.getElementById('email-form').classList.add('hidden');
                document.getElementById('email-signin-toggle').textContent = 'Sign in with Email';
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 2000);
            } else {
                this.showStatus(response.error || 'Authentication failed', 'error');
            }
        } catch (error) {
            console.error('Email auth error:', error);
            this.showStatus('Authentication failed', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleSignOut() {
        this.showStatus('Signing out...', 'info');
        this.setLoading(true);

        try {
            const response = await this.sendMessage({ action: "signOut" });
            
            // Clear local state regardless of response
            this.currentUser = null;
            this.authToken = null;
            
            await this.updateUI();
            this.showStatus('Signed out successfully', 'success');
            
            // Auto-hide status after success
            setTimeout(() => this.hideStatus(), 2000);
        } catch (error) {
            console.error('Sign out error:', error);
            this.showStatus('Sign out completed', 'success');
        } finally {
            this.setLoading(false);
        }
    }

    async handleTokenPurchase(isAuthenticated) {
        // Get the custom amount from the appropriate input field
        const amountInputId = isAuthenticated ? 'amount-auth' : 'amount-anon';
        const amountInput = document.getElementById(amountInputId);
        const amount = parseFloat(amountInput.value) || 10;

        // Validate amount
        if (amount < 1) {
            this.showStatus('Minimum amount is $1', 'error');
            return;
        }
        if (amount > 500) {
            this.showStatus('Maximum amount is $500', 'error');
            return;
        }

        const tokens = Math.floor(amount * 100);

        if (!isAuthenticated) {
            // Show confirmation dialog for anonymous purchase
            const proceed = confirm(
                `Purchase ${tokens.toLocaleString()} tokens for $${amount}?\n\n` +
                'Your tokens will only be available on this device. ' +
                'Sign in to sync purchases across all your devices.\n\n' +
                'Click OK to continue with anonymous purchase, or Cancel to sign in first.'
            );
            
            if (!proceed) {
                this.showStatus('Sign in to sync your purchase across devices', 'info');
                return;
            }
        }

        this.showStatus('Redirecting to payment...', 'info');
        this.setLoading(true);

        try {
            console.log('SmartFind Popup: Sending payment request with amount:', amount);
            const response = await this.sendMessage({ 
                action: "purchaseTokens",
                amount: amount
            });
            
            if (response.success) {
                this.showStatus('Redirecting to payment...', 'info');
                // The background script will open the payment page
            } else {
                this.showStatus(response.error || 'Payment failed', 'error');
            }
        } catch (error) {
            console.error('Token purchase error:', error);
            this.showStatus('Payment system unavailable', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleRestorePurchases() {
        this.showStatus('Restoring purchases...', 'info');
        this.setLoading(true);

        try {
            const response = await this.sendMessage({ action: "restorePurchases" });
            
            if (response.success) {
                const data = response.data;
                this.showStatus(`Restored ${data.totalTokens} tokens from ${data.purchaseCount} purchases`, 'success');
                await this.loadStats();
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 3000);
            } else {
                this.showStatus(response.error || 'Failed to restore purchases', 'error');
            }
        } catch (error) {
            console.error('Restore purchases error:', error);
            this.showStatus('Failed to restore purchases', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleTestAPI() {
        this.showStatus('Testing API connection...', 'info');
        this.setLoading(true);

        try {
            const response = await this.sendMessage({ action: "testAPI" });
            
            if (response.success) {
                this.showStatus('✅ API connection successful!', 'success');
                console.log('API test result:', response.data);
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 3000);
            } else {
                this.showStatus(`❌ API test failed: ${response.error}`, 'error');
                console.error('API test failed:', response);
            }
        } catch (error) {
            console.error('API test error:', error);
            this.showStatus('❌ API test failed: Network error', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    showStatus(message, type = '') {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.classList.remove('hidden');
    }

    hideStatus() {
        const statusElement = document.getElementById('status');
        statusElement.classList.add('hidden');
    }

    setLoading(isLoading) {
        const body = document.body;
        if (isLoading) {
            body.classList.add('loading');
        } else {
            body.classList.remove('loading');
        }
    }

    sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                resolve(response || {});
            });
        });
    }

    async autoSyncTokens() {
        try {
            console.log('SmartFind Popup: Checking if sync is needed...');
            
            // Only sync if it's been a while since last sync
            const { lastSyncTime } = await chrome.storage.local.get(['lastSyncTime']);
            const now = Date.now();
            const timeSinceLastSync = now - (lastSyncTime || 0);
            const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
            
            if (timeSinceLastSync > SYNC_INTERVAL) {
                console.log('SmartFind Popup: Auto-syncing tokens...');
                const response = await this.sendMessage({ action: "syncUserData" });
                
                if (response.success) {
                    console.log('SmartFind Popup: Tokens auto-synced successfully');
                    await this.loadStats(); // Refresh the display
                } else {
                    console.log('SmartFind Popup: Auto-sync failed:', response.error);
                }
            } else {
                console.log('SmartFind Popup: Skipping auto-sync, too recent');
            }
        } catch (error) {
            console.error('SmartFind Popup: Auto-sync error:', error);
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.popupManager = new PopupManager();
});

// Listen for storage changes to update UI
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        // Reload stats if token or usage data changed
        if (changes.paidTokens || changes.aiUsageCount) {
            const popup = window.popupManager;
            if (popup) {
                popup.loadStats();
                
                // Show a brief notification if tokens were added
                if (changes.paidTokens && changes.paidTokens.newValue > (changes.paidTokens.oldValue || 0)) {
                    const tokensAdded = changes.paidTokens.newValue - (changes.paidTokens.oldValue || 0);
                    popup.showStatus(`✅ ${tokensAdded.toLocaleString()} tokens added to your account!`, 'success');
                    setTimeout(() => popup.hideStatus(), 3000);
                }
            }
        }
    }
}); 