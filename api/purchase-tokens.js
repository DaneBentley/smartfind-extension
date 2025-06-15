const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');

export default async function handler(req, res) {
  // Enable CORS for Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let userId = null;
    let userEmail = null;
    
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
        userEmail = decoded.email;
      } catch (jwtError) {
        console.log('Invalid auth token, falling back to anonymous purchase');
      }
    }
    
    // Fallback to legacy anonymous user ID
    if (!userId && req.body.userId) {
      userId = req.body.userId;
    }
    
    if (!userId) {
      // Generate anonymous user ID if none provided
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Payment system not configured' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SmartFind Tokens',
              description: '1000 AI search tokens for SmartFind extension',
            },
            unit_amount: 1000, // $10.00 in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://example.com'}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://example.com'}`,
      metadata: {
        userId: userId,
        userEmail: userEmail || '',
        tokenAmount: '1000',
        isAuthenticated: authHeader ? 'true' : 'false'
      },
    });

    res.status(200).json({ 
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Stripe session creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create payment session',
      details: error.message 
    });
  }
} 