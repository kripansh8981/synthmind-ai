import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/lib/models/User';
import { verifyPassword, generateToken } from '@/lib/auth';

export async function POST(request) {
  try {
    await connectDB();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const searchEmail = email.toLowerCase().trim();
    console.log('Login attempt for email:', searchEmail);
    
    const user = await User.findOne({ email: searchEmail });
    if (!user) {
      console.log('User NOT found in database for email:', searchEmail);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    
    console.log('User found:', user.email, '| Password hash length:', user.password?.length);

    const isValid = await verifyPassword(password, user.password);
    console.log('Password verification result:', isValid);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = generateToken(user._id.toString(), user.email);

    return NextResponse.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        credits: user.credits,
        plan: user.plan || 'free',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
