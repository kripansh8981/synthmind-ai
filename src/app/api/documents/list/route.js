import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/lib/models/Document';
import { authenticateRequest } from '@/lib/auth';

const PYTHON_PIPELINE_URL = process.env.PYTHON_PIPELINE_URL || 'http://127.0.0.1:8000';

export async function GET(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const documents = await Document.find({ userId: decoded.userId })
      .select('-chunks')
      .sort({ createdAt: -1 });

    // Re-index any documents not in Python vector store
    for (const doc of documents) {
      if (doc.status === 'ready') {
        try {
          // Check if doc exists in Python vector store
          const existsRes = await fetch(`${PYTHON_PIPELINE_URL}/api/pipeline/document/${doc._id.toString()}/exists`);
          const existsData = existsRes.ok ? await existsRes.json() : { exists: false };

          if (!existsData.exists) {
            const fullDoc = await Document.findById(doc._id);
            if (fullDoc && fullDoc.chunks && fullDoc.chunks.length > 0) {
              const chunks = fullDoc.chunks.map(c => ({
                content: c.content,
                index: c.index,
                pageNumber: c.pageNumber || 1,
              }));

              // Re-index via Python pipeline
              await fetch(`${PYTHON_PIPELINE_URL}/api/pipeline/reindex`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  doc_id: doc._id.toString(),
                  chunks,
                  full_text: chunks.map(c => c.content).join(' '),
                }),
              });
            }
          }
        } catch (e) {
          console.error('Re-index error for doc:', doc._id, e);
        }
      }
    }

    return NextResponse.json({
      documents: documents.map(doc => ({
        id: doc._id,
        name: doc.name,
        type: doc.type,
        chunkCount: doc.chunkCount,
        status: doc.status,
        sourceUrl: doc.sourceUrl,
        summary: doc.summary?.abstractive || '',
        extractiveSummary: doc.summary?.extractive || '',
        keywords: doc.summary?.keywords || [],
        summaryStats: doc.summary?.stats || null,
        createdAt: doc.createdAt,
      })),
    });
  } catch (error) {
    console.error('List documents error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
