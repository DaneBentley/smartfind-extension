const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Middleware to verify JWT token
function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
    }

    const token = authHeader.substring(7);
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify authentication
        const decoded = verifyToken(req);
        const userId = decoded.userId;

        // Get all completed purchases for this user
        const { data: purchases, error: purchasesError } = await supabase
            .from('purchases')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });

        if (purchasesError) {
            console.error('Purchases fetch error:', purchasesError);
            return res.status(500).json({ error: 'Failed to fetch purchases' });
        }

        // Calculate total tokens purchased
        const totalTokens = purchases.reduce((sum, purchase) => sum + purchase.tokens_purchased, 0);
        const totalSpent = purchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);

        // Update user_data with the total tokens
        const { data: updatedData, error: updateError } = await supabase
            .from('user_data')
            .upsert({
                user_id: userId,
                paid_tokens: totalTokens,
                last_sync_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select()
            .single();

        if (updateError) {
            console.error('Update user data error:', updateError);
            return res.status(500).json({ error: 'Failed to update user data' });
        }

        res.status(200).json({
            success: true,
            totalTokens,
            totalSpent: totalSpent / 100, // Convert cents to dollars
            purchaseCount: purchases.length,
            purchases: purchases.map(p => ({
                id: p.id,
                tokens: p.tokens_purchased,
                amount: p.amount_cents / 100,
                date: p.created_at,
                stripeSessionId: p.stripe_session_id
            })),
            message: `Restored ${totalTokens} tokens from ${purchases.length} purchases`
        });

    } catch (error) {
        console.error('Restore purchases API error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
} 