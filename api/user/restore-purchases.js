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

        // Calculate total tokens purchased (includes 50 free credits for everyone)
        const totalPurchasedTokens = purchases.reduce((sum, purchase) => sum + purchase.tokens_purchased, 0);
        const actualPaidTokens = totalPurchasedTokens; // What user actually bought
        const totalIncludingFree = totalPurchasedTokens + 50; // Including 50 free credits
        const totalSpent = purchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);

        // Get current user data to check remaining tokens
        const { data: currentUserData, error: userDataError } = await supabase
            .from('user_data')
            .select('paid_tokens, usage_count, last_sync_at')
            .eq('user_id', userId)
            .single();

        if (userDataError && userDataError.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('User data fetch error:', userDataError);
            return res.status(500).json({ error: 'Failed to fetch user data' });
        }

        const currentTokens = currentUserData?.paid_tokens || 0;
        const totalUsage = currentUserData?.usage_count || 0;
        
        console.log('Debug - User data retrieved:', {
            currentTokens,
            totalUsage,
            actualPaidTokens,
            totalIncludingFree,
            userDataExists: !!currentUserData,
            rawUsageCount: currentUserData?.usage_count,
            rawPaidTokens: currentUserData?.paid_tokens
        });
        
        // SIMPLIFIED RESTORE LOGIC - Always return correct calculation
        // Formula: (purchased tokens + 50 free) - usage = remaining
        
        const correctRemainingTokens = Math.max(0, totalIncludingFree - totalUsage);
        
        console.log('FIXED Calculation:', {
            purchased: actualPaidTokens,
            freeCredits: 50,
            totalAvailable: totalIncludingFree,
            totalUsage: totalUsage,
            correctRemaining: correctRemainingTokens,
            currentInDB: currentTokens
        });
        
        // Always update the database to reflect the correct calculation
        const { data: updatedData, error: updateError } = await supabase
            .from('user_data')
            .upsert({
                user_id: userId,
                paid_tokens: correctRemainingTokens,
                usage_count: totalUsage,
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

        // Determine if this was a correction or already correct
        const wasCorrection = currentTokens !== correctRemainingTokens;
        const difference = correctRemainingTokens - currentTokens;
        
        let message;
        if (!wasCorrection) {
            message = `Account is accurate. You have ${correctRemainingTokens} tokens (${actualPaidTokens} purchased + 50 free - ${totalUsage} used).`;
        } else if (difference > 0) {
            message = `Corrected account: Added ${difference} tokens. You now have ${correctRemainingTokens} tokens (${actualPaidTokens} purchased + 50 free - ${totalUsage} used).`;
        } else {
            message = `Corrected account: Removed ${Math.abs(difference)} tokens. You now have ${correctRemainingTokens} tokens (${actualPaidTokens} purchased + 50 free - ${totalUsage} used).`;
        }

        res.status(200).json({
            success: true,
            totalTokens: correctRemainingTokens,
            totalPurchased: actualPaidTokens,
            freeCredits: 50,
            totalIncludingFree: totalIncludingFree,
            totalUsed: totalUsage,
            actualRemaining: correctRemainingTokens,
            totalSpent: totalSpent / 100,
            purchaseCount: purchases.length,
            tokensRestored: Math.max(0, difference), // Only count positive differences as "restored"
            previousTokens: currentTokens,
            correctionMade: wasCorrection,
            message: message,
            purchases: purchases.map(p => ({
                id: p.id,
                tokens: p.tokens_purchased,
                amount: p.amount_cents / 100,
                date: p.created_at,
                stripeSessionId: p.stripe_session_id
            }))
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