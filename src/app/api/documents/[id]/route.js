import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/lib/models/Document';
import { authenticateRequest } from '@/lib/auth';

const PYTHON_PIPELINE_URL = process.env.PYTHON_PIPELINE_URL || 'http://127.0.0.1:8000';

export async function DELETE(request, { params }) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const doc = await Document.findOneAndDelete({
      _id: id,
      userId: decoded.userId,
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Remove from Python vector store
    try {
      await fetch(`${PYTHON_PIPELINE_URL}/api/pipeline/document/${id}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Pipeline delete error:', e);
    }

    return NextResponse.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
