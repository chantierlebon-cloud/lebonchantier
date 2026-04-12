const { getStripe, getSupabaseAdmin, setCors, getUserFromBearer } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromBearer(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const { data: artisan } = await supabase
      .from('artisans')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artisan) return res.status(400).json({ error: 'Artisan profile not found' });

    if (artisan.stripe_account_id) {
      return res.status(200).json({
        stripe_account_id: artisan.stripe_account_id,
        already_exists: true
      });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type: 'individual',
      metadata: { user_id: user.id, platform: 'LeBonChantier' }
    });

    await supabase
      .from('artisans')
      .update({ stripe_account_id: account.id, payout_status: 'pending_onboarding' })
      .eq('user_id', user.id);

    return res.status(200).json({ stripe_account_id: account.id, already_exists: false });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
