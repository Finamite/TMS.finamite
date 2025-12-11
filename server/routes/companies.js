import express from 'express';
import Company from '../models/Company.js';
import User from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all companies (superadmin only)
router.get('/', async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });

    // Get user counts and admin name for each company
    const companiesWithDetails = await Promise.all(
      companies.map(async (company) => {
        // Find the admin user for the company
        const adminUser = await User.findOne({
          companyId: company.companyId,
          role: 'admin'
        }).select('username email phone')

        // Get user counts for each company
        const userCounts = await User.aggregate([
          { $match: { companyId: company.companyId, isActive: true } },
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        const counts = {
          admin: 0,
          manager: 0,
          employee: 0
        };

        userCounts.forEach(item => {
          if (item._id !== 'superadmin') {
            counts[item._id] = item.count;
          }
        });

        return {
          ...company.toObject(),
          userCounts: counts,
          admin: adminUser ? { username: adminUser.username, email: adminUser.email, phone: adminUser.phone} : null,
        };
      })
    );

    res.json(companiesWithDetails);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new company with admin
router.post('/', async (req, res) => {
  try {
    const { companyName, adminName, adminEmail, adminPhone, adminPassword, limits, permissions } = req.body;

    // Generate unique company ID
    const companyId = `comp_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Create company
    const company = new Company({
      companyId,
      companyName,
      limits: {
        adminLimit: limits?.adminLimit || 1,
        managerLimit: limits?.managerLimit || 5,
        userLimit: limits?.userLimit || 50
      },
      permissions: permissions || {}
    });

    await company.save();

    // Create company admin
    const admin = new User({
      companyId,
      username: adminName,
      email: adminEmail,
      phone: adminPhone,
      password: adminPassword,
      role: 'admin',
      permissions: {
        canViewTasks: true,
        canViewAllTeamTasks: true,
        canAssignTasks: true,
        canDeleteTasks: true,
        canEditTasks: true,
        canManageUsers: true,
        canEditRecurringTaskSchedules: true,
        canManageSettings: true,
        canManageRecycle: true,
      }
    });

    await admin.save();

    res.status(201).json({
      message: 'Company and admin created successfully',
      company: {
        ...company.toObject(),
        admin: {
          id: admin._id,
          username: admin.username,
          email: admin.email
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update company
router.put('/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { companyName, limits, adminDetails, permissions} = req.body;

    // Update company details
    const company = await Company.findOneAndUpdate(
      { companyId },
      { companyName, limits,permissions},
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Update admin details if provided
    if (adminDetails) {
      const adminUser = await User.findOne({ companyId, role: 'admin' });
      if (adminUser) {
        // Check if email is being changed and if it already exists
        if (adminDetails.email !== adminUser.email) {
          const existingUser = await User.findOne({ 
            email: adminDetails.email, 
            _id: { $ne: adminUser._id } 
          });
          if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
          }
        }

        // Check if username is being changed and if it already exists within the same company
        if (adminDetails.username !== adminUser.username) {
          const existingUsername = await User.findOne({ 
            username: adminDetails.username, 
            companyId, 
            _id: { $ne: adminUser._id } 
          });
          if (existingUsername) {
            return res.status(400).json({ message: 'Username already exists in this company' });
          }
        }

        await User.findByIdAndUpdate(adminUser._id, {
          username: adminDetails.username,
          email: adminDetails.email,
          phone: adminDetails.phone
        });
      }
    }
    res.json({ message: 'Company updated successfully', company });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update admin password
router.put('/:companyId/admin/password', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { newPassword } = req.body;

    const adminUser = await User.findOne({ companyId, role: 'admin' });
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    adminUser.password = newPassword;
    await adminUser.save();

    res.json({ message: 'Admin password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete company and all its users
router.delete('/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    // Delete all users in the company
    await User.deleteMany({ companyId });

    // Delete the company
    const company = await Company.findOneAndDelete({ companyId });

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json({ message: 'Company and all associated users deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle company status (activate/deactivate)
router.patch('/:companyId/status', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { isActive } = req.body;

    const company = await Company.findOneAndUpdate(
      { companyId },
      { isActive },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // When deactivating a company, also deactivate all its users
    // When activating a company, reactivate all its users
    await User.updateMany(
      { companyId },
      { isActive }
    );

    const statusText = isActive ? 'activated' : 'deactivated';
    const userStatusText = isActive ? 'reactivated' : 'deactivated';

    res.json({ 
      message: `Company ${statusText} successfully. All company users have been ${userStatusText}.`, 
      company 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


export default router;