import mongoose from 'mongoose';

const QueryLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
  },
  query: String,
  responseTime: Number,
  cached: {
    type: Boolean,
    default: false,
  },
  confidence: Number,
  pipelineSteps: Object,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.QueryLog || mongoose.model('QueryLog', QueryLogSchema);
