import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ChatSession from '@/lib/models/ChatSession';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const sessions = await ChatSession.find({ userId: decoded.userId })
      .select('title documentId createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(20);

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');

    await connectDB();
    await ChatSession.findOneAndDelete({
      _id: sessionId,
      userId: decoded.userId,
    });

    return NextResponse.json({ message: 'Session deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
