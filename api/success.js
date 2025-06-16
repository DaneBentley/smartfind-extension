// Success page for post-purchase redirect

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const sessionId = req.query.session_id;
    const cancelled = req.query.cancelled;
    
    // Simple success page HTML
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SmartFind - ${cancelled ? 'Payment Cancelled' : 'Payment Successful'}</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                padding: 40px 20px;
                background: #f8f9fa;
                color: #24292f;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                text-align: center;
            }
            .success-icon {
                font-size: 64px;
                color: #28a745;
                margin-bottom: 20px;
            }
            .cancel-icon {
                font-size: 64px;
                color: #dc3545;
                margin-bottom: 20px;
            }
            h1.success {
                color: #28a745;
                margin-bottom: 16px;
            }
            h1.cancelled {
                color: #dc3545;
                margin-bottom: 16px;
            }
            .session-id {
                font-family: monospace;
                background: #f6f8fa;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                color: #656d76;
                margin: 20px 0;
            }
            .instructions {
                background: #ddf4ff;
                border: 1px solid #9ec8ff;
                border-radius: 8px;
                padding: 20px;
                margin: 24px 0;
            }
            .instructions.cancelled {
                background: #fff5f5;
                border: 1px solid #fed7d7;
            }
            .instructions h3 {
                margin-top: 0;
                color: #0969da;
            }
            .instructions.cancelled h3 {
                color: #dc3545;
            }
            .step {
                text-align: left;
                margin: 12px 0;
                padding-left: 24px;
                position: relative;
            }
            .step::before {
                content: counter(step-counter);
                counter-increment: step-counter;
                position: absolute;
                left: 0;
                top: 0;
                background: #0969da;
                color: white;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                font-size: 12px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .steps {
                counter-reset: step-counter;
            }
            .footer {
                margin-top: 32px;
                font-size: 14px;
                color: #656d76;
            }
            .close-btn {
                background: #0969da;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                margin-top: 20px;
            }
            .close-btn:hover {
                background: #0860ca;
            }
            .close-btn.cancelled {
                background: #6c757d;
            }
            .close-btn.cancelled:hover {
                background: #5a6268;
            }
            .status-message {
                background: #d1ecf1;
                border: 1px solid #bee5eb;
                border-radius: 6px;
                padding: 12px;
                margin: 16px 0;
                font-size: 14px;
                color: #0c5460;
            }
            .auto-sync {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
                padding: 12px;
                border-radius: 6px;
                margin: 16px 0;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            ${cancelled ? `
                <div class="cancel-icon">❌</div>
                <h1 class="cancelled">Payment Cancelled</h1>
                <p>Your payment was cancelled. No charges were made to your account.</p>
                
                <div class="instructions cancelled">
                    <h3>What's Next?</h3>
                    <p>You can try purchasing tokens again anytime by clicking the SmartFind extension icon and selecting "Buy Tokens".</p>
                </div>
            ` : `
                <div class="success-icon">✅</div>
                <h1 class="success">Payment Successful!</h1>
                <p>Your SmartFind tokens have been purchased successfully.</p>
                
                ${sessionId ? `<div class="session-id">Session ID: ${sessionId}</div>` : ''}
                
                <div class="auto-sync" id="sync-status">
                    🔄 Automatically syncing your tokens...
                </div>
                
                <div class="instructions">
                    <h3>🚀 Your Tokens Are Ready!</h3>
                    <div class="steps">
                        <div class="step">Your tokens have been automatically added to your account</div>
                        <div class="step">Return to any webpage where you want to search</div>
                        <div class="step">Click the <strong>SmartFind extension icon</strong> or use <strong>Ctrl+Shift+F</strong></div>
                        <div class="step">Start searching immediately - no manual sync needed!</div>
                    </div>
                </div>
            `}
            
            <button class="close-btn ${cancelled ? 'cancelled' : ''}" onclick="closeTab()">Close This Tab</button>
            
            <div class="footer">
                ${cancelled ? `
                    <p>Need help? Contact support if you have any questions.</p>
                ` : `
                    <p>Your tokens are now available in the SmartFind extension.</p>
                    <p>If you don't see your tokens immediately, the extension popup will refresh automatically.</p>
                `}
            </div>
        </div>
        
        <script>
            let syncAttempts = 0;
            const maxSyncAttempts = 5;
            
            function closeTab() {
                window.close();
            }
            
            // Auto-close after 15 seconds if user doesn't interact
            setTimeout(() => {
                if (document.hasFocus()) {
                    closeTab();
                }
            }, 15000);
            
            // Only attempt sync if payment was successful
            ${!cancelled && sessionId ? `
                // Function to attempt token sync
                async function attemptTokenSync() {
                    syncAttempts++;
                    const statusEl = document.getElementById('sync-status');
                    
                    try {
                        // Try to communicate with the extension
                        if (window.chrome && chrome.runtime) {
                            // Send message to extension to trigger sync
                            chrome.runtime.sendMessage('${process.env.EXTENSION_ID || 'nkjoelppkclkgjlmapppnjkmngpgnhjh'}', {
                                action: 'purchaseCompleted',
                                sessionId: '${sessionId}'
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.log('Extension communication failed:', chrome.runtime.lastError.message);
                                    if (syncAttempts < maxSyncAttempts) {
                                        statusEl.innerHTML = '🔄 Retrying token sync... (attempt ' + syncAttempts + ')';
                                        setTimeout(attemptTokenSync, 2000);
                                    } else {
                                        statusEl.innerHTML = '⚠️ Auto-sync failed. Please click the extension icon to refresh your tokens.';
                                        statusEl.style.background = '#fff3cd';
                                        statusEl.style.borderColor = '#ffeaa7';
                                        statusEl.style.color = '#856404';
                                    }
                                } else {
                                    statusEl.innerHTML = '✅ Tokens synced successfully!';
                                    statusEl.style.background = '#d4edda';
                                    statusEl.style.borderColor = '#c3e6cb';
                                    statusEl.style.color = '#155724';
                                }
                            });
                        } else {
                            throw new Error('Chrome extension API not available');
                        }
                    } catch (e) {
                        console.log('Sync attempt failed:', e);
                        if (syncAttempts < maxSyncAttempts) {
                            statusEl.innerHTML = '🔄 Retrying token sync... (attempt ' + syncAttempts + ')';
                            setTimeout(attemptTokenSync, 2000);
                        } else {
                            statusEl.innerHTML = '⚠️ Auto-sync failed. Please click the extension icon to refresh your tokens.';
                            statusEl.style.background = '#fff3cd';
                            statusEl.style.borderColor = '#ffeaa7';
                            statusEl.style.color = '#856404';
                        }
                    }
                }
                
                // Start sync attempts after a short delay
                setTimeout(attemptTokenSync, 1000);
            ` : ''}
        </script>
    </body>
    </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
} 