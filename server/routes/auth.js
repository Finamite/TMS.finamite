import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    // Normalize email
    email = email.trim().toLowerCase();

    const user = await User.findOne({
      email: email,
      isActive: true
    });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user's company is active (for non-superadmin users)
    if (user.role !== 'superadmin' && user.companyId) {
      const Company = (await import('../models/Company.js')).default;
      const company = await Company.findOne({ companyId: user.companyId });

      if (!company || !company.isActive) {
        return res.status(401).json({ message: 'Company account is inactive. Please contact support.' });
      }
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Get company info if user is not superadmin
    let companyInfo = null;
    if (user.role !== 'superadmin' && user.companyId) {
      const Company = (await import('../models/Company.js')).default;
      companyInfo = await Company.findOne({ companyId: user.companyId });
    }

    // Return user data (without password)
    const userData = {
      id: user._id,
      companyId: user.companyId,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      company: companyInfo ? {
        companyId: companyInfo.companyId,
        companyName: companyInfo.companyName,
        limits: companyInfo.limits,
        permissions: companyInfo.permissions
      } : null
    };

    res.json({
      message: 'Login successful',
      user: userData
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;