const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
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
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const { data: user, error: userError } = await supabase
            .from('users')
            .insert({
                email,
                name: name || email.split('@')[0],
                password_hash: passwordHash,
                auth_type: 'email'
            })
            .select()
            .single();

        if (userError) {
            console.error('User creation error:', userError);
            return res.status(500).json({ error: 'Failed to create user' });
        }

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
            // Don't fail the signup for this
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email,
                authType: 'email'
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '30d' }
        );

        // Return user data (without password hash)
        const userData = {
            id: user.id,
            email: user.email,
            name: user.name,
            authType: 'email',
            profilePicture: user.profile_picture
        };

        res.status(201).json({
            success: true,
            token,
            user: userData,
            message: 'Account created successfully'
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
} 