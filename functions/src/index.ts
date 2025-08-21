import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import Stripe from 'stripe';
import OpenAI from 'openai';
import { z } from 'zod';

admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY as string;
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helpers
async function getOrCreateStripeCustomer(uid: string, email?: string) {
  const docRef = db.collection('users').doc(uid);
  const docSnap = await docRef.get();
  const data = docSnap.data() || {};
  if (data.stripeCustomerId) {
    return data.stripeCustomerId as string;
  }
  const customer = await stripe.customers.create({ email });
  await docRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// Callable: create portal session
export const createStripePortal = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
  const uid = context.auth.uid;
  const email = context.auth.token.email as string | undefined;
  const customerId = await getOrCreateStripeCustomer(uid, email);
  const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: data.returnUrl || 'https://example.com' });
  return { url: portal.url };
});

// Webhooks
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err: any) {
    res.status(400).send(`Webhook error: ${err.message}`);
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id as string | undefined;
      if (uid) {
        await db.doc(`users/${uid}/subscription/status`).set({ status: 'active', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = invoice.subscription as string | undefined;
      // nothing to do per se; ensure status active if mapped
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const uid = (sub.metadata?.uid as string) || undefined;
      if (uid) {
        await db.doc(`users/${uid}/subscription/status`).set({ status: 'canceled', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      break;
    }
  }
  res.json({ received: true });
});

// Callable: AI chat proxy with gating
const ChatSchema = z.object({
  prompt: z.string().min(1),
  tier: z.enum(['free', 'premium']).default('free'),
  context: z.any().optional(),
});

export const proxyAIChat = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
  const { prompt, tier } = ChatSchema.parse(data);

  // read subscription
  const uid = context.auth.uid;
  const subDoc = await db.doc(`users/${uid}/subscription/status`).get();
  const sub = subDoc.data() as any | undefined;
  const isPremium = sub?.status === 'active';

  if (tier === 'premium' && !isPremium) {
    throw new functions.https.HttpsError('permission-denied', 'Premium required');
  }

  const system = tier === 'premium'
    ? 'You are a fitness coach. Provide detailed reasoning and adjust plans.'
    : 'You are concise. Answer briefly. Do not provide plan adjustments.';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    max_tokens: tier === 'premium' ? 600 : 120,
    temperature: 0.7,
  });
  const text = completion.choices[0]?.message?.content ?? '';
  return { text };
});

// Scheduled analysis of last 7 days weights
export const weeklyAnalysis = functions.pubsub.schedule('every 168 hours').onRun(async () => {
  const usersSnap = await db.collection('users').get();
  const today = new Date();
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const since = new Date(today);
    since.setDate(since.getDate() - 7);
    const weightsSnap = await db.collection('weights').where('uid', '==', uid).where('date', '>=', since.toISOString().slice(0,10)).get();
    const weights = weightsSnap.docs.map(d => d.data()) as any[];
    if (weights.length < 2) continue;
    const sorted = weights.sort((a,b) => a.date.localeCompare(b.date));
    const change = Number(sorted[sorted.length-1].weightKg) - Number(sorted[0].weightKg);
    const checkInRef = db.collection('checkIns').where('uid','==',uid).orderBy('createdAt','desc').limit(1);
    const lastCheckInSnap = await checkInRef.get();
    if (lastCheckInSnap.empty) continue;
    const checkInDoc = lastCheckInSnap.docs[0];
    const checkIn = checkInDoc.data() as any;

    let lissDelta = 0;
    let kcalDelta = 0;
    let stepsDelta = 0;
    if (Math.abs(change) <= 0.1) {
      // flat weight
      if (checkIn.program === 'fat_loss') lissDelta = 5; else lissDelta = -5;
    }

    // 4 day recheck logic could be separate; simplified in scheduled task
    const updated: any = {};
    if (lissDelta !== 0) updated.lissMinutesTarget = (checkIn.lissMinutesTarget || 0) + lissDelta;

    if (checkIn.program === 'fat_loss' && lissDelta === 5) {
      // after 4 days adjust calories -100 carbs only; we store suggestion field
      updated.suggestedCalorieAdjustment = -100;
      updated.suggestedMacroFocus = 'carbs';
    } else if (lissDelta === -5) {
      updated.suggestedCalorieAdjustment = 100;
    }

    // else after another 4 days: -700 steps
    updated.suggestedStepAdjustment = -700;

    await checkInDoc.ref.set({ ...updated, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  return null;
});

