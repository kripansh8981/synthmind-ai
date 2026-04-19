import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/lib/models/Document';
import { authenticateRequest } from '@/lib/auth';

// Parse PDF
async function parsePDF(buffer) {
  const { PDFParse, VerbosityLevel } = await import('pdf-parse');
  const pdf = new PDFParse({
    data: new Uint8Array(buffer),
    verbosity: VerbosityLevel.ERRORS,
  });
  const result = await pdf.getText();
  // Strip page separator markers added by pdf-parse v2 (e.g. "-- 1 of 5 --")
  const text = (result.text || '').replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim();
  return text;
}

// Parse DOCX
async function parseDOCX(buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// Split text into chunks
function chunkText(text, chunkSize = 500, overlap = 100) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  let pageEstimate = 1;

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > chunkSize && current.length > 0) {
      chunks.push({
        content: current.trim(),
        index: chunks.length,
        pageNumber: pageEstimate,
      });
      // Overlap: keep last portion
      const words = current.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(' ') + ' ' + sentence;
      pageEstimate = Math.floor(chunks.length / 3) + 1;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) {
    chunks.push({
      content: current.trim(),
      index: chunks.length,
      pageNumber: pageEstimate,
    });
  }
  return chunks;
}

const PYTHON_PIPELINE_URL = process.env.PYTHON_PIPELINE_URL || 'http://127.0.0.1:8000';

export async function POST(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = fileName.split('.').pop().toLowerCase();

    // Parse file content
    let textContent = '';
    console.log(`[Upload] Parsing file: ${fileName}, type: ${fileType}, size: ${fileBuffer.length} bytes`);
    try {
      switch (fileType) {
        case 'pdf':
          textContent = await parsePDF(fileBuffer);
          break;
        case 'docx':
          textContent = await parseDOCX(fileBuffer);
          break;
        case 'txt':
          textContent = fileBuffer.toString('utf-8');
          break;
        default:
          return NextResponse.json({ error: 'Unsupported file type. Use PDF, DOCX, or TXT.' }, { status: 400 });
      }
    } catch (parseError) {
      console.error('[Upload] Parse error:', parseError);
      return NextResponse.json({ error: 'Failed to parse file: ' + parseError.message }, { status: 400 });
    }
    console.log(`[Upload] Extracted text length: ${textContent?.length || 0}`);

    if (!textContent || textContent.trim().length < 10) {
      return NextResponse.json({ error: 'Could not extract text from file. Extracted: ' + (textContent?.length || 0) + ' chars' }, { status: 400 });
    }

    // Chunk the text
    const chunks = chunkText(textContent);

    // Create document in DB
    const doc = await Document.create({
      userId: decoded.userId,
      name: fileName,
      type: fileType,
      originalSize: fileBuffer.length,
      chunkCount: chunks.length,
      chunks,
      status: 'processing',
    });

    // Send chunks to Python pipeline for embeddings + summarization
    try {
      console.log(`[Upload] Sending ${chunks.length} chunks to Python pipeline...`);
      const pipelineResponse = await fetch(`${PYTHON_PIPELINE_URL}/api/pipeline/process-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_id: doc._id.toString(),
          chunks: chunks,
          full_text: textContent,
        }),
      });

      if (!pipelineResponse.ok) {
        const errText = await pipelineResponse.text();
        throw new Error(`Python pipeline error: ${errText}`);
      }

      const pipelineResult = await pipelineResponse.json();
      console.log(`[Upload] Pipeline processed: ${pipelineResult.embeddingsCount} embeddings, ${pipelineResult.processingTime}ms`);

      // Store summary in document
      if (pipelineResult.summary) {
        doc.summary = {
          extractive: pipelineResult.summary.extractive,
          abstractive: pipelineResult.summary.abstractive,
          keywords: pipelineResult.summary.keywords,
          stats: pipelineResult.summary.stats,
          generatedAt: new Date(),
        };
        console.log(`[Upload] Summary generated: ${pipelineResult.summary.abstractive?.length || 0} chars, ${pipelineResult.summary.keywords?.length || 0} keywords`);
      }

      doc.status = 'ready';
      await doc.save();
    } catch (embError) {
      console.error('Pipeline error:', embError);
      doc.status = 'error';
      await doc.save();
      return NextResponse.json({ error: 'Failed to process document: ' + embError.message }, { status: 500 });
    }

    return NextResponse.json({
      document: {
        id: doc._id,
        name: doc.name,
        type: doc.type,
        chunkCount: doc.chunkCount,
        status: doc.status,
        summary: doc.summary?.abstractive || '',
        keywords: doc.summary?.keywords || [],
        createdAt: doc.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload document: ' + error.message }, { status: 500 });
  }
}

