const { getStripe, getSupabaseAdmin, getEnv, setCors, getUserFromBearer } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromBearer(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();
    const siteUrl = getEnv('SITE_URL');

    // Accepte stripe_account_id depuis le body (passé par le client depuis le step 1)
    // ou le relit depuis la base en fallback
    let stripeAccountId = req.body?.stripe_account_id || null;

    if (!stripeAccountId) {
      const { data: artisan } = await supabase
        .from('artisans')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .single();
      stripeAccountId = artisan?.stripe_account_id || null;
    }

    if (!stripeAccountId) {
      return res.status(400).json({ error: 'Create Stripe account first' });
    }

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${siteUrl}/?stripe_refresh=1`,
      return_url: `${siteUrl}/?stripe_return=1`,
      type: 'account_onboarding'
    });

    return res.status(200).json({ url: link.url });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
