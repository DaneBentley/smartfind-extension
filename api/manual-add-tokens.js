const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const userId = decoded.userId;

        // Get the number of tokens to add
        const { tokens, reason } = req.body;
        
        if (!tokens || typeof tokens !== 'number' || tokens <= 0) {
            return res.status(400).json({ error: 'Valid token amount required' });
        }

        if (tokens > 1000) {
            return res.status(400).json({ error: 'Maximum 1000 tokens per request' });
        }

        // Add tokens to user account
        const { error: syncError } = await supabase
            .rpc('sync_user_data', {
                user_uuid: userId,
                local_tokens: tokens,
                local_usage: 0
            });

        if (syncError) {
            throw syncError;
        }

        // Record the manual addition
        const { error: recordError } = await supabase
            .from('purchases')
            .insert({
                user_id: userId,
                stripe_session_id: `manual_${Date.now()}`,
                stripe_payment_intent_id: null,
                amount_cents: 0,
                tokens_purchased: tokens,
                status: 'completed',
                metadata: {
                    type: 'manual_addition',
                    reason: reason || 'Manual token addition',
                    addedBy: 'system',
                    timestamp: new Date().toISOString()
                }
            });

        if (recordError) {
            console.error('Failed to record manual addition:', recordError);
            // Don't fail the request if recording fails
        }

        res.status(200).json({ 
            success: true,
            message: `${tokens} tokens added successfully`,
            userId: userId,
            tokensAdded: tokens
        });

    } catch (error) {
        console.error('Manual add tokens error:', error);
        res.status(500).json({ 
            error: 'Failed to add tokens',
            details: error.message
        });
    }
} 