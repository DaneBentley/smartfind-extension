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
2. Enter any amount (e.g., $5, $15, $25) in the payment field
3. Click "Buy Tokens" 
4. Use Stripe test card: `4242 4242 4242 4242`

## How It Works

1. **Free Tier**: Users get 50 free searches
2. **Flexible Payment**: Users can pay any amount from $1 to $500
3. **Token Calculation**: 100 tokens per $1 (e.g., $15 = 1,500 tokens)
4. **Stripe Checkout**: Secure payment processing with custom amounts
5. **Token Addition**: Tokens automatically added to user's account
6. **Usage**: Extension uses paid tokens after free tier exhausted

## Pricing Structure

- **Free**: 50 searches
- **Flexible Paid**: $1 = 100 tokens, $10 = 1,000 tokens, $25 = 2,500 tokens, etc.
- **Rate**: 1¢ per search (100 tokens per dollar)
- **Minimum**: $1 (100 tokens)
- **Maximum**: $500 (50,000 tokens)

## Security Notes

- User IDs are generated locally (no personal data stored)
- Payments processed securely through Stripe
- Tokens stored locally in browser extension storage
- No sensitive data on your servers
- Amount validation prevents excessive charges

## Next Steps (Optional)

1. **Database**: Add proper user/token database (Supabase, Firebase)
2. **Analytics**: Track usage patterns and popular payment amounts
3. **Preset Options**: Add quick-select buttons for common amounts ($5, $10, $25)
4. **Subscriptions**: Monthly unlimited plans
5. **Admin Panel**: View payments and user stats
6. **Bulk Discounts**: Offer better rates for larger purchases

## Estimated Costs

- **Stripe**: 2.9% + 30¢ per transaction
- **Vercel**: Free tier (sufficient for most usage)
- **Example costs**:
  - $5 sale: ~$0.45 fee = $4.55 profit
  - $10 sale: ~$0.59 fee = $9.41 profit  
  - $25 sale: ~$1.03 fee = $23.97 profit

## Benefits of Flexible Pricing

1. **User Choice**: Users pay exactly what they want/need
2. **Better Conversion**: Lower barrier to entry with $1 minimum
3. **Higher Revenue**: Some users will pay more than the old $10 fixed price
4. **Scalability**: Accommodates both light and heavy users
5. **Transparency**: Clear 1¢ per search pricing 