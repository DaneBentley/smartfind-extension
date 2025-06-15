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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { type, googleToken, email, name, picture } = req.body;

        if (type !== 'google') {
            return res.status(400).json({ error: 'Only Google OAuth is supported' });
        }

        if (!googleToken || !email) {
            return res.status(400).json({ error: 'Google token and email are required' });
        }

        // Verify Google token by calling Google's API
        const googleVerifyResponse = await fetch(
            `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${googleToken}`
        );

        if (!googleVerifyResponse.ok) {
            return res.status(401).json({ error: 'Invalid Google token' });
        }

        const googleData = await googleVerifyResponse.json();
        if (googleData.email !== email) {
            return res.status(401).json({ error: 'Token email mismatch' });
        }

        // Extract Google ID from token info or use email as fallback
        const googleId = googleData.user_id || googleData.sub || email;

        // Check if user exists with this Google ID or email
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .or(`google_id.eq.${googleId},email.eq.${email}`)
            .single();

        let user;

        if (existingUser) {
            // Update existing user with Google info if needed
            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({
                    google_id: googleId,
                    auth_type: 'google',
                    profile_picture: picture || existingUser.profile_picture,
                    name: name || existingUser.name
                })
                .eq('id', existingUser.id)
                .select()
                .single();

            if (updateError) {
                console.error('User update error:', updateError);
                return res.status(500).json({ error: 'Failed to update user' });
            }

            user = updatedUser;
        } else {
            // Create new user
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    email,
                    name: name || email.split('@')[0],
                    google_id: googleId,
                    profile_picture: picture,
                    auth_type: 'google'
                })
                .select()
                .single();

            if (createError) {
                console.error('User creation error:', createError);
                return res.status(500).json({ error: 'Failed to create user' });
            }

            user = newUser;

            // Create initial user data record
            const { error: dataError } = await supabase
                .from('user_data')
                .insert({
                    user_id: user.id,
                    paid_tokens: 0,
                    usage_count: 0
                });

            if (dataError) {
                console.error('User data creation error:', dataError);
                // Don't fail the auth for this
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email,
                authType: 'google'
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '30d' }
        );

        // Return user data
        const userData = {
            id: user.id,
            email: user.email,
            name: user.name,
            authType: 'google',
            profilePicture: user.profile_picture
        };

        res.status(200).json({
            success: true,
            token,
            user: userData,
            message: existingUser ? 'Signed in successfully' : 'Account created and signed in'
        });

    } catch (error) {
        console.error('OAuth error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
} 