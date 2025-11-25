import express from 'express';
import Lead from '../models/Leads.js';

const router = express.Router();

// Get all active leads
router.get('/', async (req, res) => {
  try {
    const leads = await Lead.find();
    res.json(leads);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
