import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
  },

  phone: {
    type: String,
    required: true,
  },

  source: {
    type: String,
    required: true,
    default: 'unknown',
  },

  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Lead', LeadSchema);
