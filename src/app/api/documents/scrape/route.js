import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/lib/models/Document';
import { authenticateRequest } from '@/lib/auth';
import * as cheerio from 'cheerio';

function chunkText(text, chunkSize = 500, overlap = 100) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > chunkSize && current.length > 0) {
      chunks.push({
        content: current.trim(),
        index: chunks.length,
        pageNumber: 1,
      });
      const words = current.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(' ') + ' ' + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) {
    chunks.push({
      content: current.trim(),
      index: chunks.length,
      pageNumber: 1,
    });
  }
  return chunks;
}

function sanitizeText(text) {
  return text
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const PYTHON_PIPELINE_URL = process.env.PYTHON_PIPELINE_URL || 'http://127.0.0.1:8000';

export async function POST(request) {
  try {
    const decoded = authenticateRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    if (!isValidUrl(url)) {
      return NextResponse.json({ error: 'Invalid URL. Must start with http:// or https://' }, { status: 400 });
    }

    // Fetch URL content with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({ error: 'Request timed out. The website took too long to respond.' }, { status: 408 });
      }
      // Handle common network errors
      const errorMsg = fetchError.message || '';
      if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
        return NextResponse.json({ error: 'Domain not found. Please check the URL.' }, { status: 400 });
      }
      if (errorMsg.includes('ECONNREFUSED')) {
        return NextResponse.json({ error: 'Connection refused by the server.' }, { status: 400 });
      }
      if (errorMsg.includes('CERT_') || errorMsg.includes('SSL') || errorMsg.includes('certificate')) {
        return NextResponse.json({ error: 'SSL/Certificate error. The website has an invalid certificate.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Failed to connect to URL: ' + fetchError.message }, { status: 400 });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch URL (HTTP ${response.status})` }, { status: 400 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({ error: 'URL does not return HTML content. Content-Type: ' + contentType }, { status: 400 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title BEFORE removing elements
    const title = $('title').text().trim() || $('h1').first().text().trim() || new URL(url).hostname;

    // Remove non-content elements
    $('script, style, nav, footer, header, aside, iframe, noscript, svg, form, button, input, select, textarea').remove();
    $('[role="navigation"], [role="banner"], [role="complementary"], [aria-hidden="true"]').remove();
    $('.sidebar, .nav, .menu, .footer, .header, .ad, .advertisement, .cookie-banner').remove();

    // Extract text content
    const textContent = sanitizeText($('body').text());

    if (textContent.length < 50) {
      return NextResponse.json({ error: 'Could not extract enough text from URL. The page may be dynamically loaded (JavaScript-rendered) or access-restricted.' }, { status: 400 });
    }

    // Limit text to ~50K chars to stay within free tier embedding rate limits
    const trimmedText = textContent.length > 50000 ? textContent.substring(0, 50000) : textContent;
    const chunks = chunkText(trimmedText);

    const doc = await Document.create({
      userId: decoded.userId,
      name: title.substring(0, 200),
      type: 'url',
      originalSize: textContent.length,
      chunkCount: chunks.length,
      chunks,
      sourceUrl: url,
      status: 'processing',
    });

    // Send chunks to Python pipeline for embeddings + summarization
    try {
      console.log(`[Scrape] Sending ${chunks.length} chunks to Python pipeline...`);
      const pipelineResponse = await fetch(`${PYTHON_PIPELINE_URL}/api/pipeline/process-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_id: doc._id.toString(),
          chunks: chunks,
          full_text: trimmedText,
        }),
      });

      if (!pipelineResponse.ok) {
        const errText = await pipelineResponse.text();
        throw new Error(`Python pipeline error: ${errText}`);
      }

      const pipelineResult = await pipelineResponse.json();
      console.log(`[Scrape] Pipeline processed: ${pipelineResult.embeddingsCount} embeddings, ${pipelineResult.processingTime}ms`);

      // Store summary
      if (pipelineResult.summary) {
        doc.summary = {
          extractive: pipelineResult.summary.extractive,
          abstractive: pipelineResult.summary.abstractive,
          keywords: pipelineResult.summary.keywords,
          stats: pipelineResult.summary.stats,
          generatedAt: new Date(),
        };
        console.log(`[Scrape] Summary generated: ${pipelineResult.summary.abstractive?.length || 0} chars, ${pipelineResult.summary.keywords?.length || 0} keywords`);
      }

      doc.status = 'ready';
      await doc.save();
    } catch (embError) {
      console.error('Pipeline error:', embError);
      doc.status = 'error';
      await doc.save();
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
        sourceUrl: doc.sourceUrl,
        createdAt: doc.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json({ error: 'Failed to scrape URL: ' + error.message }, { status: 500 });
  }
}
