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
        const decoded = verifyToken(req);
        const userId = decoded.userId;

        const { localTokens, localUsage, localUserId } = req.body;

        // Call the sync function in the database
        const { data: syncResult, error: syncError } = await supabase
            .rpc('sync_user_data', {
                user_uuid: userId,
                local_tokens: localTokens || 0,
                local_usage: localUsage || 0,
                legacy_id: localUserId
            });

        if (syncError) {
            console.error('Sync error:', syncError);
            return res.status(500).json({ error: 'Failed to sync data' });
        }

        const result = syncResult[0];

        res.status(200).json({
            success: true,
            cloudTokens: result.cloud_tokens,
            cloudUsage: result.cloud_usage,
            totalPurchased: result.total_purchased,
            userId: userId,
            message: 'Data synced successfully'
        });

    } catch (error) {
        console.error('Sync API error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
} 