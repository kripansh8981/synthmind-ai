import mongoose from 'mongoose';

const ChunkSchema = new mongoose.Schema({
  content: String,
  index: Number,
  pageNumber: Number,
});

// Summary sub-schema: stores TF-IDF extractive + LLM abstractive summaries
const SummarySchema = new mongoose.Schema({
  extractive: {
    type: String,
    default: '',
  },
  abstractive: {
    type: String,
    default: '',
  },
  keywords: {
    type: [String],
    default: [],
  },
  stats: {
    type: Object,
    default: {},
  },
  generatedAt: {
    type: Date,
    default: null,
  },
});

const DocumentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['pdf', 'docx', 'txt', 'url'],
    required: true,
  },
  originalSize: {
    type: Number,
    default: 0,
  },
  chunkCount: {
    type: Number,
    default: 0,
  },
  chunks: [ChunkSchema],
  sourceUrl: {
    type: String,
    default: '',
  },
  summary: {
    type: SummarySchema,
    default: () => ({}),
  },
  status: {
    type: String,
    enum: ['processing', 'ready', 'error'],
    default: 'processing',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Document || mongoose.model('Document', DocumentSchema);
