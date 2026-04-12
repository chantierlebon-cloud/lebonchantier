const Stripe = require('stripe');
const { getEnv, getSupabaseAdmin } = require('./_lib');

// Vercel doit recevoir le corps brut pour que stripe.webhooks.constructEvent fonctionne
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'));
    const endpointSecret = getEnv('STRIPE_WEBHOOK_SECRET');
    const sig = req.headers['stripe-signature'];

    // Lire le corps brut (bodyParser désactivé)
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const supabase = getSupabaseAdmin();

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const milestoneId = session.metadata?.milestone_id;
      const missionId = session.metadata?.mission_id;

      if (milestoneId) {
        await supabase
          .from('mission_milestones')
          .update({
            status: 'paid_locked',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent
          })
          .eq('id', milestoneId);
      }

      if (missionId) {
        await supabase
          .from('missions')
          .update({ status: 'paid_locked' })
          .eq('id', missionId);
      }
    }

    if (stripeEvent.type === 'account.updated') {
      const account = stripeEvent.data.object;
      await supabase
        .from('artisans')
        .update({
          stripe_onboarding_complete: !!account.details_submitted,
          stripe_charges_enabled: !!account.charges_enabled,
          stripe_payouts_enabled: !!account.payouts_enabled,
          payout_status: account.payouts_enabled ? 'active' : 'pending_review'
        })
        .eq('stripe_account_id', account.id);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
