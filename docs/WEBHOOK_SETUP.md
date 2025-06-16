# Stripe Webhook Setup for SmartFind Extension

## Problem
Your $1 purchase wasn't processed because Stripe doesn't know where to send webhook notifications when payments complete. The webhook is what tells your backend to add tokens to the user's account.

## Solution
You need to configure a webhook endpoint in your Stripe dashboard.

## Steps to Fix

### 1. Go to Stripe Dashboard
- Visit [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
- Make sure you're in the correct account/mode (Test vs Live)

### 2. Add Webhook Endpoint
- Click **"Add endpoint"**
- Enter the endpoint URL: `https://smartfind-api.vercel.app/api/webhook`
- Select events to listen for:
  - ✅ `checkout.session.completed`
  - ✅ `payment_intent.succeeded` (optional, for additional confirmation)

### 3. Get Webhook Secret
- After creating the webhook, click on it
- Copy the **"Signing secret"** (starts with `whsec_`)
- This is your `STRIPE_WEBHOOK_SECRET`

### 4. Add Environment Variable
- Go to your Vercel dashboard
- Navigate to your project settings
- Add environment variable:
  - **Name**: `STRIPE_WEBHOOK_SECRET`
  - **Value**: `whsec_xxxxxxxxxxxxx` (the signing secret from step 3)

### 5. Redeploy
- Run `vercel --prod` to deploy with the new environment variable

## Testing the Webhook

### Test with Stripe CLI (Recommended)
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to your Stripe account
stripe login

# Forward webhooks to your local development
stripe listen --forward-to https://smartfind-api.vercel.app/api/webhook

# Test a webhook event
stripe trigger checkout.session.completed
```

### Test with a Real Purchase
1. Make a small test purchase ($1)
2. Check the webhook logs in Stripe dashboard
3. Verify tokens are added to your account

## Webhook Endpoint Details

**URL**: `https://smartfind-api.vercel.app/api/webhook`
**Method**: POST
**Events**: `checkout.session.completed`

The webhook will:
1. ✅ Verify the signature using `STRIPE_WEBHOOK_SECRET`
2. ✅ Extract purchase details from the event
3. ✅ Add tokens to the user's account in Supabase
4. ✅ Sync user data if they're authenticated

## Current Status
- ❌ **Webhook not configured** - This is why your $1 purchase didn't add tokens
- ✅ **API endpoints working** - Backend is ready to receive webhooks
- ✅ **Database setup complete** - Supabase is configured correctly

## Immediate Fix
Use the `fix-missing-tokens.html` page to manually add your missing 100 tokens from the $1 purchase.

## Future Purchases
Once the webhook is configured, all future purchases will automatically add tokens to user accounts. 