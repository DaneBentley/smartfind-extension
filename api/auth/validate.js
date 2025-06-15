const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

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
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);

        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (jwtError) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Check if user still exists and is active
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, name, auth_type, profile_picture, is_active')
            .eq('id', decoded.userId)
            .eq('is_active', true)
            .single();

        if (userError || !user) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        // Return user data
        const userData = {
            id: user.id,
            email: user.email,
            name: user.name,
            authType: user.auth_type,
            profilePicture: user.profile_picture
        };

        res.status(200).json({
            valid: true,
            user: userData
        });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
} 