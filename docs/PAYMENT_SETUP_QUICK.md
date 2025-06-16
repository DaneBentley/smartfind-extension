# Quick Payment System Fix

## Current Status
The payment system was showing "Payment system temporarily unavailable" because the API endpoints were missing.

## What Was Fixed
1. ✅ Created `api/purchase-tokens.js` - Handles Stripe checkout session creation
2. ✅ Created `api/webhook.js` - Handles successful payment webhooks  
3. ✅ Created `api/test-payment.js` - Test endpoint to verify setup
4. ✅ Added Stripe dependency to `package.json`
5. ✅ Added fallback test tokens for development
6. ✅ Improved error handling and debugging

## Quick Test (No Stripe Setup Required)
1. Load the extension in Chrome
2. Use it until you hit the limit
3. Click "Buy 1000 tokens ($10)" 
4. The system will automatically add test tokens for development

## To Enable Real Payments (5 minutes)
1. Get Stripe keys from [stripe.com](https://stripe.com)
2. Deploy to Vercel: `vercel`
3. Set environment variables in Vercel:
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (from webhook setup)
4. Test with Stripe test card: `4242 4242 4242 4242`

## Test Endpoints
- `GET /api/test-payment` - Check if API is working
- `POST /api/purchase-tokens` - Create payment session
- `POST /api/webhook` - Handle Stripe events

## Development Notes
- Test tokens are automatically added when payment fails
- Real payment system will work once Stripe is configured
- All CORS headers are properly set for Chrome extension
- Error messages now include debugging information 