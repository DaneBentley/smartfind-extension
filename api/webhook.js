const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Utility function to read raw body
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const body = await getRawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('Payment successful for session:', session.id);
      console.log('User ID:', session.metadata.userId);
      console.log('Token amount:', session.metadata.tokenAmount);
      console.log('Is authenticated:', session.metadata.isAuthenticated);
      
      try {
        // Store purchase in database
        let userId = session.metadata.userId;
        
        // If user is authenticated, use their UUID, otherwise store as legacy
        if (session.metadata.isAuthenticated === 'true' && session.metadata.userEmail) {
          // Find the authenticated user
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('email', session.metadata.userEmail)
            .single();
          
          if (user) {
            userId = user.id;
          }
        }
        
        // Store the purchase
        const { data: purchase, error: purchaseError } = await supabase
          .from('purchases')
          .insert({
            user_id: userId,
            stripe_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent,
            amount_cents: session.amount_total,
            tokens_purchased: parseInt(session.metadata.tokenAmount),
            status: 'completed',
            metadata: {
              customerEmail: session.customer_details?.email,
              isAuthenticated: session.metadata.isAuthenticated === 'true',
              legacyUserId: session.metadata.isAuthenticated !== 'true' ? session.metadata.userId : null
            }
          });

        if (purchaseError) {
          console.error('Failed to store purchase:', purchaseError);
        } else {
          console.log('Purchase stored successfully:', purchase);
          
          // Update user tokens if authenticated
          if (session.metadata.isAuthenticated === 'true') {
            const { error: syncError } = await supabase
              .rpc('sync_user_data', {
                user_uuid: userId,
                local_tokens: parseInt(session.metadata.tokenAmount),
                local_usage: 0
              });
            
            if (syncError) {
              console.error('Failed to sync user data after purchase:', syncError);
            }
          }
        }
        
      } catch (dbError) {
        console.error('Database error in webhook:', dbError);
      }
      
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).json({ received: true });
}

// Disable body parsing for webhooks to get raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
} 