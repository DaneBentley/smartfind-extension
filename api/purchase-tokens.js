const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');

export default async function handler(req, res) {
  // Enable CORS for Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400');

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

    // Get custom amount from request body
    const customAmount = req.body.amount;
    
    if (!customAmount || typeof customAmount !== 'number' || customAmount < 1) {
      return res.status(400).json({ error: 'Valid amount is required (minimum $1)' });
    }

    // Set maximum amount for safety
    if (customAmount > 500) {
      return res.status(400).json({ error: 'Maximum amount is $500' });
    }

    // Calculate tokens: 100 tokens per dollar
    const tokensToGrant = Math.floor(customAmount * 100);
    const amountInCents = Math.round(customAmount * 100);

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Payment system not configured' });
    }

    // Create Stripe checkout session with custom amount
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SmartFind Tokens',
              description: `${tokensToGrant} AI search tokens for SmartFind extension`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://smartfind-api.vercel.app/api/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://smartfind-api.vercel.app/api/success?cancelled=true`,
      metadata: {
        userId: userId,
        userEmail: userEmail || '',
        tokenAmount: tokensToGrant.toString(),
        customAmount: customAmount.toString(),
        isAuthenticated: authHeader ? 'true' : 'false'
      },
    });

    res.status(200).json({ 
      sessionId: session.id,
      url: session.url,
      amount: customAmount,
      tokens: tokensToGrant
    });

  } catch (error) {
    console.error('Stripe session creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create payment session',
      details: error.message 
    });
  }
} 