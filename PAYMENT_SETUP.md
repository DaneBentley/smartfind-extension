# SmartFind Payment Setup Guide

## Quick Setup (15 minutes)

### 1. Create Stripe Account
1. Go to [stripe.com](https://stripe.com) and create an account
2. Get your **Secret Key** from the Stripe Dashboard
3. Get your **Publishable Key** (for frontend if needed later)

### 2. Deploy to Vercel (Free)
1. Install Vercel CLI: `npm i -g vercel`
2. In your project directory, run: `vercel`
3. Follow the prompts to deploy
4. Set environment variables in Vercel dashboard:
   - `STRIPE_SECRET_KEY` = your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET` = (get this from Stripe webhook settings)

### 3. Configure Stripe Webhooks
1. In Stripe Dashboard, go to Webhooks
2. Add endpoint: `https://your-vercel-app.vercel.app/api/webhook`
3. Select event: `checkout.session.completed`
4. Copy the webhook secret to your Vercel environment variables

### 4. Update Extension
1. In `background.js`, replace `PAYMENT_API_URL` with your Vercel URL
2. Reload your extension in Chrome

### 5. Test
1. Use your extension until you hit the 50 search limit
2. Click "Buy 1000 tokens ($10)"
3. Use Stripe test card: `4242 4242 4242 4242`

## How It Works

1. **Free Tier**: Users get 50 free searches
2. **Payment Flow**: When limit reached, user sees "Buy tokens" button
3. **Stripe Checkout**: User pays $10 for 1000 tokens
4. **Token Addition**: Tokens automatically added to user's account
5. **Usage**: Extension uses paid tokens after free tier exhausted

## Pricing Structure

- **Free**: 50 searches
- **Paid**: $10 = 1000 tokens (1¢ per search)
- **Future**: Easy to add different token packages

## Security Notes

- User IDs are generated locally (no personal data stored)
- Payments processed securely through Stripe
- Tokens stored locally in browser extension storage
- No sensitive data on your servers

## Next Steps (Optional)

1. **Database**: Add proper user/token database (Supabase, Firebase)
2. **Analytics**: Track usage patterns
3. **Multiple Packages**: Add $5/500 tokens, $20/2500 tokens options
4. **Subscriptions**: Monthly unlimited plans
5. **Admin Panel**: View payments and user stats

## Estimated Costs

- **Stripe**: 2.9% + 30¢ per transaction
- **Vercel**: Free tier (sufficient for most usage)
- **Total cost per $10 sale**: ~$0.59

Your profit per $10 sale: ~$9.41 