import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/lib/models/User';
import Document from '@/lib/models/Document';
import QueryLog from '@/lib/models/QueryLog';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(decoded.userId).select('-password');
    const docCount = await Document.countDocuments({ userId: decoded.userId });
    const queryLogs = await QueryLog.find({ userId: decoded.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const totalQueries = queryLogs.length;
    const avgResponseTime = totalQueries > 0
      ? Math.round(queryLogs.reduce((sum, q) => sum + (q.responseTime || 0), 0) / totalQueries)
      : 0;

    // Get total chunks for THIS user from MongoDB (not global pipeline count)
    const chunkAgg = await Document.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, total: { $sum: '$chunkCount' } } },
    ]);
    const totalChunks = chunkAgg.length > 0 ? chunkAgg[0].total : 0;

    // Recent queries
    const recentQueries = queryLogs.slice(0, 10).map(q => ({
      query: q.query?.substring(0, 100),
      responseTime: q.responseTime,
      cached: q.cached,
      confidence: q.confidence,
      createdAt: q.createdAt,
    }));

    // Query counts by day (last 7 days)
    const queriesByDay = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      const count = queryLogs.filter(q => 
        q.createdAt >= dayStart && q.createdAt <= dayEnd
      ).length;
      queriesByDay.push({
        date: dayStart.toISOString().split('T')[0],
        count,
      });
    }

    return NextResponse.json({
      stats: {
        documents: docCount,
        totalChunks,
        totalQueries: user.totalQueries || totalQueries,
        avgResponseTime,
        credits: user.credits,
      },
      recentQueries,
      queriesByDay,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
