const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getStripe() {
  return new Stripe(getEnv('STRIPE_SECRET_KEY'));
}

function getSupabaseAdmin() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, stripe-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function setCors(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

function getAuthToken(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

async function getUserFromBearer(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = { getEnv, getStripe, getSupabaseAdmin, setCors, getUserFromBearer };
