// auth.js - Authentication Service for SmartFind Extension

class AuthService {
    constructor() {
        this.API_BASE_URL = 'https://smartfind-extension-ffbscu551.vercel.app';
        this.currentUser = null;
        this.authToken = null;
        this.init();
    }

    async init() {
        // Load saved authentication state
        const savedAuth = await chrome.storage.local.get(['authToken', 'currentUser']);
        if (savedAuth.authToken && savedAuth.currentUser) {
            this.authToken = savedAuth.authToken;
            this.currentUser = savedAuth.currentUser;
            await this.validateToken();
        }
    }

    // Google OAuth Sign In
    async signInWithGoogle() {
        try {
            console.log('SmartFind: Starting Google OAuth...');
            
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(token);
                    }
                });
            });

            // Get user info from Google
            const userInfo = await this.fetchGoogleUserInfo(token);
            
            // Authenticate with our backend
            const authResult = await this.authenticateWithBackend({
                type: 'google',
                googleToken: token,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture
            });

            await this.saveAuthState(authResult);
            return authResult;

        } catch (error) {
            console.error('Google OAuth error:', error);
            throw error;
        }
    }

    // Email/Password Sign Up
    async signUpWithEmail(email, password, name) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Sign up failed');
            }

            await this.saveAuthState(result);
            return result;

        } catch (error) {
            console.error('Email signup error:', error);
            throw error;
        }
    }

    // Email/Password Sign In
    async signInWithEmail(email, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/auth/signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Sign in failed');
            }

            await this.saveAuthState(result);
            return result;

        } catch (error) {
            console.error('Email signin error:', error);
            throw error;
        }
    }

    // Sign Out
    async signOut() {
        try {
            // Revoke Google token if present
            if (this.currentUser?.authType === 'google') {
                chrome.identity.removeCachedAuthToken({ token: this.authToken }, () => {});
            }

            // Clear local state
            await chrome.storage.local.remove(['authToken', 'currentUser']);
            this.authToken = null;
            this.currentUser = null;

            console.log('SmartFind: User signed out');

        } catch (error) {
            console.error('Sign out error:', error);
        }
    }

    // Sync User Data (tokens, usage) with Cloud
    async syncUserData() {
        if (!this.authToken) return null;

        try {
            // Get local data
            const localData = await chrome.storage.local.get(['paidTokens', 'aiUsageCount', 'userId']);
            
            const response = await fetch(`${this.API_BASE_URL}/api/user/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    localTokens: localData.paidTokens || 0,
                    localUsage: localData.aiUsageCount || 0,
                    localUserId: localData.userId
                })
            });

            const result = await response.json();
            if (response.ok) {
                // Update local storage with cloud data
                await chrome.storage.local.set({
                    paidTokens: result.cloudTokens,
                    aiUsageCount: result.cloudUsage,
                    userId: result.userId
                });
                
                console.log('SmartFind: Data synced with cloud');
                return result;
            }

        } catch (error) {
            console.error('Sync error:', error);
        }
        return null;
    }

    // Restore Purchases from Cloud
    async restorePurchases() {
        if (!this.authToken) throw new Error('Not authenticated');

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/user/restore-purchases`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const result = await response.json();
            if (response.ok) {
                // Update local storage
                await chrome.storage.local.set({
                    paidTokens: result.totalTokens
                });
                
                console.log('SmartFind: Purchases restored');
                return result;
            } else {
                throw new Error(result.error || 'Failed to restore purchases');
            }

        } catch (error) {
            console.error('Restore purchases error:', error);
            throw error;
        }
    }

    // Helper Methods
    async fetchGoogleUserInfo(token) {
        const response = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
        if (!response.ok) {
            throw new Error('Failed to fetch Google user info');
        }
        return response.json();
    }

    async authenticateWithBackend(authData) {
        const response = await fetch(`${this.API_BASE_URL}/api/auth/oauth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authData)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Backend authentication failed');
        }

        return result;
    }

    async saveAuthState(authResult) {
        this.authToken = authResult.token;
        this.currentUser = authResult.user;
        
        await chrome.storage.local.set({
            authToken: this.authToken,
            currentUser: this.currentUser
        });

        // Sync data after successful authentication
        await this.syncUserData();
    }

    async validateToken() {
        if (!this.authToken) return false;

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/auth/validate`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (!response.ok) {
                // Token invalid, clear auth state
                await this.signOut();
                return false;
            }

            return true;

        } catch (error) {
            console.error('Token validation error:', error);
            await this.signOut();
            return false;
        }
    }

    // Getters
    isAuthenticated() {
        return !!this.authToken && !!this.currentUser;
    }

    getUser() {
        return this.currentUser;
    }

    getToken() {
        return this.authToken;
    }
}

// Make AuthService available globally
window.AuthService = AuthService;

// Create singleton instance
if (typeof chrome !== 'undefined' && chrome.runtime) {
    window.authService = new AuthService();
} 