import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import connectDB from '@/lib/mongodb';
import { authenticateRequest } from '@/lib/auth';

export async function POST(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { plan } = await request.json();

    const plans = {
      pro: { amount: 49900, credits: 5000, name: 'SynthMind Pro' },
      enterprise: { amount: 149900, credits: 25000, name: 'SynthMind Enterprise' },
    };

    const selectedPlan = plans[plan];
    if (!selectedPlan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    console.log('[Payment Debug] RAZORPAY_KEY_ID:', keyId ? `${keyId.substring(0, 10)}...` : 'MISSING');
    console.log('[Payment Debug] RAZORPAY_KEY_SECRET:', keySecret ? `${keySecret.substring(0, 4)}...(${keySecret.length} chars)` : 'MISSING');

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay credentials not configured' }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: selectedPlan.amount,
      currency: 'INR',
      receipt: `sm_${plan}_${decoded.userId.slice(-8)}_${Date.now().toString(36)}`,
      notes: {
        userId: decoded.userId,
        plan,
        credits: selectedPlan.credits,
      },
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      planName: selectedPlan.name,
      credits: selectedPlan.credits,
    });
  } catch (error) {
    console.error('Create order error:', error?.error || error);
    return NextResponse.json({ error: 'Failed to create order: ' + (error?.error?.description || error.message) }, { status: 500 });
  }
}
