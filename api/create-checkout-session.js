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
    const siteUrl = getEnv('SITE_URL');

    const { data: milestone, error: milestoneError } = await supabase
      .from('mission_milestones')
      .select('*, missions(*)')
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) return res.status(404).json({ error: 'Milestone not found' });
    if (milestone.missions.client_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
    if (milestone.status !== 'awaiting_payment') return res.status(400).json({ error: 'Milestone is not payable' });

    const mission = milestone.missions;
    const transferGroup = mission.stripe_transfer_group || `mission_${mission.id}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${siteUrl}/?checkout_success=1&mission_id=${mission.id}`,
      cancel_url: `${siteUrl}/?checkout_cancel=1&mission_id=${mission.id}`,
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: mission.currency || 'eur',
            product_data: {
              name: `TrouvePro — ${milestone.title}`,
              description: `Mission ${mission.title || mission.id}`
            },
            unit_amount: milestone.amount
          },
          quantity: 1
        }
      ],
      metadata: {
        mission_id: mission.id,
        milestone_id: milestone.id,
        client_id: mission.client_id,
        artisan_id: mission.artisan_id,
        transfer_group: transferGroup,
        platform: 'TrouvePro'
      },
      payment_intent_data: {
        transfer_group: transferGroup,
        metadata: {
          mission_id: mission.id,
          milestone_id: milestone.id,
          client_id: mission.client_id,
          artisan_id: mission.artisan_id,
          transfer_group: transferGroup,
          platform: 'TrouvePro'
        }
      }
    });

    await supabase
      .from('missions')
      .update({ stripe_transfer_group: transferGroup, status: 'awaiting_payment' })
      .eq('id', mission.id);

    await supabase
      .from('mission_milestones')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', milestone.id);

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
