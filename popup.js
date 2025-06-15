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
        if (!isAuthenticated) {
            // Show confirmation dialog for anonymous purchase
            const proceed = confirm(
                'Purchase tokens without an account?\n\n' +
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
            const response = await this.sendMessage({ action: "purchaseTokens" });
            
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});

// Listen for storage changes to update UI
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        // Reload stats if token or usage data changed
        if (changes.paidTokens || changes.aiUsageCount) {
            const popup = window.popupManager;
            if (popup) {
                popup.loadStats();
            }
        }
    }
}); 