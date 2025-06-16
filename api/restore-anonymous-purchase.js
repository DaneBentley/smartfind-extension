const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'Session ID and User ID are required' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Payment system not configured' });
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if the session was completed successfully
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Get the metadata from the session
    const metadata = session.metadata || {};
    const tokenAmount = parseInt(metadata.tokenAmount) || 0;
    const originalUserId = metadata.userId;

    if (tokenAmount <= 0) {
      return res.status(400).json({ error: 'No tokens found in this purchase' });
    }

    // For anonymous purchases, we'll allow any user ID to claim the tokens
    // In a production system, you might want to implement additional security measures
    console.log(`Restoring ${tokenAmount} tokens for anonymous purchase. Session: ${sessionId}, User: ${userId}`);

    res.status(200).json({
      success: true,
      tokensAdded: tokenAmount,
      sessionId: sessionId,
      userId: userId,
      originalUserId: originalUserId,
      message: `Successfully restored ${tokenAmount} tokens`
    });

  } catch (error) {
    console.error('Anonymous purchase restoration error:', error);
    
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'Invalid session ID',
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to restore anonymous purchase',
      details: error.message 
    });
  }
} 