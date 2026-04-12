const { getStripe, getSupabaseAdmin, getEnv, setCors, getUserFromBearer } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromBearer(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { milestone_id: milestoneId } = req.body || {};
    if (!milestoneId) return res.status(400).json({ error: 'Missing milestone_id' });

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();
    const platformFeeBps = parseInt(getEnv('PLATFORM_FEE_BPS'), 10) || 800;

    const { data: milestone, error: milestoneError } = await supabase
      .from('mission_milestones')
      .select('*, missions(*)')
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) return res.status(404).json({ error: 'Milestone not found' });
    if (milestone.missions.client_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
    if (milestone.status !== 'paid_locked') return res.status(400).json({ error: 'Milestone must be paid_locked' });

    const mission = milestone.missions;

    const { data: artisan, error: artisanError } = await supabase
      .from('artisans')
      .select('stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled')
      .eq('user_id', mission.artisan_id)
      .single();

    if (artisanError || !artisan?.stripe_account_id) {
      return res.status(400).json({ error: 'Artisan Stripe account missing' });
    }

    const amount = milestone.amount;
    const commission = Math.round((amount * platformFeeBps) / 10000);
    const transferAmount = amount - commission;
    if (transferAmount <= 0) return res.status(400).json({ error: 'Invalid transfer amount' });

    const transfer = await stripe.transfers.create({
      amount: transferAmount,
      currency: mission.currency || 'eur',
      destination: artisan.stripe_account_id,
      transfer_group: mission.stripe_transfer_group,
      metadata: {
        mission_id: mission.id,
        milestone_id: milestone.id,
        platform_fee: String(commission)
      }
    });

    await supabase
      .from('mission_milestones')
      .update({
        status: 'released',
        stripe_transfer_id: transfer.id,
        validated_at: new Date().toISOString(),
        released_at: new Date().toISOString()
      })
      .eq('id', milestone.id);

    const { data: remaining } = await supabase
      .from('mission_milestones')
      .select('id,status')
      .eq('mission_id', mission.id);

    const allReleased = (remaining || []).every((m) => m.status === 'released');
    await supabase
      .from('missions')
      .update(allReleased
        ? { status: 'released', commission_amount: commission }
        : { status: 'in_progress' })
      .eq('id', mission.id);

    return res.status(200).json({
      ok: true,
      transfer_id: transfer.id,
      released_amount: transferAmount,
      commission_amount: commission
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
