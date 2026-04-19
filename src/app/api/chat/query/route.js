import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/lib/models/User';
import ChatSession from '@/lib/models/ChatSession';
import QueryLog from '@/lib/models/QueryLog';
import { authenticateRequest } from '@/lib/auth';

const PYTHON_PIPELINE_URL = process.env.PYTHON_PIPELINE_URL || 'http://127.0.0.1:8000';

export async function POST(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { query, documentId, sessionId } = await request.json();

    if (!query || !documentId) {
      return NextResponse.json({ error: 'Query and documentId are required' }, { status: 400 });
    }

    // Check credits
    const user = await User.findById(decoded.userId);
    if (!user || user.credits <= 0) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 });
    }

    // Get conversation history from session
    let conversationHistory = [];
    let session = null;
    if (sessionId) {
      session = await ChatSession.findById(sessionId);
      if (session) {
        conversationHistory = session.messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content,
        }));
      }
    }

    // Run the pipeline via Python backend
    const startTime = Date.now();

    const pipelineResponse = await fetch(`${PYTHON_PIPELINE_URL}/api/pipeline/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        doc_id: documentId,
        conversation_history: conversationHistory,
      }),
    });

    if (!pipelineResponse.ok) {
      const errData = await pipelineResponse.json().catch(() => ({}));
      const errMsg = errData.detail || 'Pipeline request failed';
      return NextResponse.json({ error: errMsg }, { status: pipelineResponse.status });
    }

    const result = await pipelineResponse.json();
    const responseTime = Date.now() - startTime;

    // Create or update chat session
    if (!session) {
      session = await ChatSession.create({
        userId: decoded.userId,
        documentId,
        title: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
        messages: [],
      });
    }

    // Add messages
    session.messages.push({
      role: 'user',
      content: query,
    });
    session.messages.push({
      role: 'assistant',
      content: result.answer,
      pipelineSteps: result.pipeline?.steps || {},
      confidence: result.confidence,
      citations: result.citations,
      responseTime,
    });
    session.updatedAt = new Date();
    await session.save();

    // Update user credits and stats
    if (!result.cached) {
      user.credits = Math.max(0, user.credits - 1);
    }
    user.totalQueries += 1;
    await user.save();

    // Log query
    await QueryLog.create({
      userId: decoded.userId,
      documentId,
      query,
      responseTime,
      cached: result.cached || false,
      confidence: result.confidence,
      pipelineSteps: result.pipeline?.steps || {},
    });

    return NextResponse.json({
      answer: result.answer,
      confidence: result.confidence,
      citations: result.citations,
      cached: result.cached || false,
      cacheType: result.cacheType || null,
      responseTime,
      pipeline: result.pipeline,
      sessionId: session._id,
      creditsRemaining: user.credits,
    });
  } catch (error) {
    console.error('Chat query error:', error);
    return NextResponse.json({ error: 'Pipeline error: ' + error.message }, { status: 500 });
  }
}
