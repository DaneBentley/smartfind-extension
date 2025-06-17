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
        
        // Remove automatic sync that was causing unwanted token restoration
        // Users can manually sync via the "Restore Purchases" button if needed
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
            this.handleTokenPurchase();
        });



        // Restore Purchases
        document.getElementById('restore-purchases').addEventListener('click', () => {
            this.handleRestorePurchases();
        });

        // Amount input listeners for real-time token calculation
        document.getElementById('amount-auth').addEventListener('input', (e) => {
            this.updateTokenDisplay('auth', e.target.value);
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

        // Help and Privacy links
        document.getElementById('help-link').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ 
                url: 'https://smartfind-website-do06q9tyz-danebentley2004-gmailcoms-projects.vercel.app/contact.html' 
            });
        });

        document.getElementById('privacy-link').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ 
                url: 'https://smartfind-website-do06q9tyz-danebentley2004-gmailcoms-projects.vercel.app/privacy.html' 
            });
        });
    }

    async updateUI() {
        const authenticatedView = document.getElementById('authenticated-view');
        const unauthenticatedView = document.getElementById('unauthenticated-view');

        // log('updateUI called - currentUser:', this.currentUser, 'authToken:', this.authToken); // Disabled for production

        if (this.currentUser && this.authToken) {
            // log('Showing authenticated view'); // Disabled for production
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
            // log('Showing unauthenticated view'); // Disabled for production
            // Show unauthenticated view
            authenticatedView.classList.add('hidden');
            unauthenticatedView.classList.remove('hidden');
        }
    }

    async loadStats() {
        try {
            const result = await chrome.storage.local.get(['paidTokens', 'aiUsageCount']);
            const remainingTokens = result.paidTokens || 0;
            const searchesUsed = result.aiUsageCount || 0;

            // Update authenticated view stats
            document.getElementById('token-count').textContent = remainingTokens.toLocaleString();
            document.getElementById('usage-count').textContent = searchesUsed.toLocaleString();

            // Show credit status warning if needed
            this.updateCreditStatus(remainingTokens);

            // Load replenishment countdown for authenticated users
            if (this.currentUser && this.authToken) {
                await this.loadReplenishmentCountdown();
            }

        } catch (error) {
            console.error('Failed to load stats:', error);
            this.showStatus('Failed to load statistics', 'error');
        }
    }

    updateCreditStatus(remainingTokens) {
        // Show prominent warning when credits are low or exhausted
        if (remainingTokens === 0) {
            this.showStatus('⚠️ Credits exhausted! Purchase more tokens or wait for monthly replenishment.', 'error');
            
            // Also update the token count display to be more prominent
            const tokenElement = document.getElementById('token-count');
            if (tokenElement) {
                tokenElement.style.color = '#cf222e';
                tokenElement.style.fontWeight = 'bold';
            }
        } else if (remainingTokens <= 5) {
            this.showStatus(`⚠️ Only ${remainingTokens} credits remaining. Consider purchasing more tokens.`, 'error');
            
            // Make low credit count more visible
            const tokenElement = document.getElementById('token-count');
            if (tokenElement) {
                tokenElement.style.color = '#d1242f';
                tokenElement.style.fontWeight = 'bold';
            }
        } else {
            // Clear any previous credit warnings and reset styling
            this.hideStatus();
            const tokenElement = document.getElementById('token-count');
            if (tokenElement) {
                tokenElement.style.color = '';
                tokenElement.style.fontWeight = '';
            }
        }
    }

    async loadReplenishmentCountdown() {
        try {
            const response = await this.sendMessage({ action: "getReplenishmentCountdown" });
            
            if (response.success && response.countdown) {
                const { daysUntilNext, hoursUntilNext } = response.countdown;
                
                let countdownText = '';
                if (daysUntilNext > 0) {
                    countdownText = `${daysUntilNext} day${daysUntilNext !== 1 ? 's' : ''}`;
                } else if (hoursUntilNext > 0) {
                    countdownText = `${hoursUntilNext} hour${hoursUntilNext !== 1 ? 's' : ''}`;
                } else {
                    countdownText = 'Available now!';
                }
                
                document.getElementById('replenishment-countdown').textContent = countdownText;
                
                // If tokens are available now, trigger a check
                if (daysUntilNext <= 0 && hoursUntilNext <= 0) {
                    await this.checkForReplenishment();
                }
            } else {
                document.getElementById('replenishment-countdown').textContent = 'N/A';
            }
        } catch (error) {
            console.error('Failed to load replenishment countdown:', error);
            document.getElementById('replenishment-countdown').textContent = 'Error';
        }
    }

    async checkForReplenishment() {
        try {
            const response = await this.sendMessage({ action: "checkMonthlyReplenishment" });
            
            if (response.success && response.result && response.result.replenished) {
                this.showStatus(`Monthly replenishment: +${response.result.tokensAdded} tokens!`, 'success');
                await this.loadStats(); // Refresh stats
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 3000);
            }
        } catch (error) {
            console.error('Failed to check replenishment:', error);
        }
    }

    updateTokenDisplay(type, amount) {
        const numAmount = parseFloat(amount) || 0;
        const tokens = Math.floor(numAmount * 100); // 100 tokens per dollar
        const tokenElement = document.getElementById(`tokens-${type}`);
        // Update token display calculation
        if (tokenElement) {
            tokenElement.textContent = tokens.toLocaleString();
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
                
                // Notify content script about successful sign-in
                this.notifyContentScriptSignIn();
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 2000);
            } else {
                this.showStatus(response.error || 'Google sign in failed', 'error');
            }
        } catch (error) {
            console.error('Google sign in error:', error);
            this.showStatus('Google sign in failed', 'error');
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
                
                // Notify content script about successful sign-in
                this.notifyContentScriptSignIn();
                
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
        // log('Starting sign out process...'); // Disabled for production
        this.showStatus('Signing out...', 'info');
        this.setLoading(true);

        try {
            // Clear ALL user-specific storage to prevent token caching across accounts
            // log('Clearing all user storage...'); // Disabled for production
            await chrome.storage.local.remove([
                'authToken', 
                'currentUser',
                'paidTokens',
                'aiUsageCount',
                'userId',
                'lastTokenSyncCount',
                'lastSyncTime',
                'registrationDate',
                'lastReplenishmentDate',
                'purchasedTokens'
            ]);
            
            // Verify storage is cleared
            const storageCheck = await chrome.storage.local.get(['authToken', 'currentUser']);
            // log('Storage after clearing:', storageCheck); // Disabled for production
            
            // Clear local state immediately
            this.currentUser = null;
            this.authToken = null;
            // log('Local state cleared'); // Disabled for production
            
            // Send sign out message to backend (but don't wait for it)
            // log('Sending sign out message to backend...'); // Disabled for production
            this.sendMessage({ action: "signOut" }).catch(error => {
                // log('Backend sign out failed (non-critical):', error); // Disabled for production
            });
            
            // Update UI immediately
            // log('Updating UI...'); // Disabled for production
            await this.updateUI();
            
            // Reload stats to show anonymous view
            // log('Reloading stats...'); // Disabled for production
            await this.loadStats();
            
            // log('Sign out completed successfully'); // Disabled for production
            this.showStatus('Signed out successfully', 'success');
            
            // Auto-hide status after success
            setTimeout(() => this.hideStatus(), 2000);
            
        } catch (error) {
            console.error('SmartFind: Sign out error:', error);
            
            // Even on error, ensure we're signed out locally
            this.currentUser = null;
            this.authToken = null;
            
            try {
                await chrome.storage.local.remove([
                    'authToken', 
                    'currentUser',
                    'paidTokens',
                    'aiUsageCount',
                    'userId',
                    'lastTokenSyncCount',
                    'lastSyncTime',
                    'registrationDate',
                    'lastReplenishmentDate',
                    'purchasedTokens'
                ]);
                await this.updateUI();
                await this.loadStats();
            } catch (cleanupError) {
                console.error('SmartFind: Cleanup error:', cleanupError);
            }
            
            this.showStatus('Signed out successfully', 'success');
            setTimeout(() => this.hideStatus(), 2000);
        } finally {
            this.setLoading(false);
        }
    }

    async handleTokenPurchase() {
        // Only authenticated users can purchase tokens
        if (!this.currentUser || !this.authToken) {
            this.showStatus('Please sign in to purchase tokens', 'error');
            return;
        }

        // Get the custom amount from the authenticated input field
        const amountInput = document.getElementById('amount-auth');
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

        this.showStatus('Redirecting to payment...', 'info');
        this.setLoading(true);

        try {
            // console.log('SmartFind Popup: Sending payment request with amount:', amount); // Disabled for production
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
        this.showStatus('Checking purchases...', 'info');
        this.setLoading(true);

        try {
            const response = await this.sendMessage({ action: "restorePurchases" });
            
            if (response.success) {
                const data = response.data;
                
                if (data.tokensRestored > 0) {
                    this.showStatus(`✅ Restored ${data.tokensRestored.toLocaleString()} missing tokens! You now have ${data.totalTokens.toLocaleString()} tokens.`, 'success');
                } else {
                    this.showStatus(`✅ No restoration needed. You have ${data.totalTokens.toLocaleString()} tokens from ${data.purchaseCount} purchases.`, 'success');
                }
                
                await this.loadStats();
                
                // Auto-hide status after success
                setTimeout(() => this.hideStatus(), 4000);
            } else {
                this.showStatus(response.error || 'Failed to check purchases', 'error');
            }
        } catch (error) {
            console.error('Restore purchases error:', error);
            this.showStatus('Failed to check purchases', 'error');
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

    // Notify content script about successful sign-in for automatic search retry
    async notifyContentScriptSignIn() {
        try {
            // Get active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                // Send message to content script
                chrome.tabs.sendMessage(tabs[0].id, { action: "signInSuccess" }, (response) => {
                    if (chrome.runtime.lastError) {
                        // log('Could not notify content script (tab may not have SmartFind active)'); // Disabled for production
                    } else {
                        // log('Notified content script of successful sign-in'); // Disabled for production
                    }
                });
            }
        } catch (error) {
            // log('Error notifying content script:', error); // Disabled for production
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