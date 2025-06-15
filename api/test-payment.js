export default async function handler(req, res) {
  // Enable CORS for Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;

  res.status(200).json({ 
    message: 'Payment API test endpoint',
    timestamp: new Date().toISOString(),
    environment: {
      hasStripeKey,
      hasWebhookSecret,
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    endpoints: [
      '/api/purchase-tokens - POST - Create payment session',
      '/api/webhook - POST - Handle Stripe webhooks',
      '/api/test-payment - GET - This test endpoint'
    ]
  });
} 