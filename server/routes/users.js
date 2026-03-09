import express from 'express';
import User from '../models/User.js';
import Company from '../models/Company.js';

const router = express.Router();

const getCompanyRoleCounts = async (companyId, excludeUserId = null) => {
  const match = { companyId, isActive: true };

  if (excludeUserId) {
    match._id = { $ne: excludeUserId };
  }

  const userCounts = await User.aggregate([
    { $match: match },
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);

  const counts = {
    admin: 0,
    manager: 0,
    employee: 0
  };

  userCounts.forEach(item => {
    counts[item._id] = item.count;
  });

  return counts;
};

const validateCompanyRoleLimit = async ({ companyId, role, excludeUserId = null }) => {
  if (!companyId || role === 'superadmin') {
    return null;
  }

  const company = await Company.findOne({ companyId });
  if (!company) {
    return { status: 404, message: 'Company not found' };
  }

  const counts = await getCompanyRoleCounts(companyId, excludeUserId);
  const limitsByRole = {
    admin: company.limits.adminLimit,
    manager: company.limits.managerLimit,
    employee: company.limits.userLimit
  };
  const labelsByRole = {
    admin: 'Admin',
    manager: 'Manager',
    employee: 'User'
  };

  if (counts[role] >= limitsByRole[role]) {
    return {
      status: 400,
      message: `${labelsByRole[role]} limit reached (${limitsByRole[role]})`
    };
  }

  return null;
};

router.use(async (req, res, next) => {
  try {
    const userId = req.headers['userid'];

    if (!userId) return next();

    const user = await User.findById(userId);
    if (!user) return next();

    // 🔥 If session invalidated → force logout
    if (user.sessionInvalidated) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    next();
  } catch (err) {
    next();
  }
});

// Get all users (filtered by company for non-superadmins)
router.get('/', async (req, res) => {
  try {
    const { companyId, role, includeInactive } = req.query;

    let filter = {};

    // If companyId is provided, filter by company
    if (companyId) {
      filter.companyId = companyId;
    }

    // Exclude superadmins from regular company views
    if (role !== 'superadmin') {
      filter.role = { $ne: 'superadmin' };
    }

    // Only show active users unless includeInactive=true
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/:id/access', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.addAccessLog();

    return res.json({
      lastAccess: user.lastAccess,
      accessLogs: user.accessLogs.slice(0, 10),
    });
  } catch (err) {
    console.error('Error logging access', err);
    return res.status(500).json({ message: "Server error" });
  }
});


router.get('/:id/access-logs', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('username lastAccess accessLogs');

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      username: user.username,
      lastAccess: user.lastAccess,
      accessLogs: user.accessLogs.slice(0, 10),
    });
  } catch (err) {
    console.error('Error fetching access logs', err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Create new user
router.post('/', async (req, res) => {
  try {
    const { username, email, password, role, permissions, companyId, department, phone } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Check if username exists within the same company
    if (companyId) {
      const existingUsername = await User.findOne({ username, companyId });
      if (existingUsername) {
        return res.status(400).json({ message: 'Username already exists in this company' });
      }
    }

    // Check company limits if creating within a company
    if (companyId && role !== 'superadmin') {
      const limitError = await validateCompanyRoleLimit({ companyId, role });
      if (limitError) {
        return res.status(limitError.status).json({ message: limitError.message });
      }
    }

    const user = new User({
      companyId: role === 'superadmin' ? undefined : companyId,
      username,
      email,
      password,
      role,
      department,
      phone,
      permissions
    });

    await user.save();

    // Return user without password
    const userResponse = await User.findById(user._id).select('-password');
    res.status(201).json({ message: 'User created successfully', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const { username, email, role, permissions, department, phone } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is being changed and if it already exists
    if (email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    if (username !== user.username && user.companyId) {
      const existingUsername = await User.findOne({
        username,
        companyId: user.companyId,
        _id: { $ne: userId }
      });
      if (existingUsername) {
        return res.status(400).json({ message: 'Username already exists in this company' });
      }
    }

    if (user.isActive && user.companyId && role !== 'superadmin') {
      const limitError = await validateCompanyRoleLimit({
        companyId: user.companyId,
        role,
        excludeUserId: user._id
      });
      if (limitError) {
        return res.status(limitError.status).json({ message: limitError.message });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        username,
        email,
        role,
        permissions,
        department,
        phone,
        sessionInvalidated: true   // 🔥 FORCE LOGOUT
      },
      { new: true }
    ).select('-password');

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user password
router.put('/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = password;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of superadmin
    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'Cannot deactivate superadmin' });
    }

    user.isActive = false;
    await user.save();

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ Toggle user active/inactive
router.put('/:id/toggle-active', async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (targetUser.role === 'superadmin') {
    return res.status(403).json({ message: 'Cannot deactivate superadmin' });
  }

  const actionUser = await User.findById(req.headers.userid);

  // 🔴 DEACTIVATE
  if (targetUser.isActive) {
    targetUser.isActive = false;
    targetUser.sessionInvalidated = true;

    // ✅ UPDATE ONLY ON DEACTIVATION
    targetUser.deactivatedAt = new Date();
    targetUser.deactivatedBy = {
      id: actionUser?._id,
      name: actionUser?.username || 'System'
    };

    await targetUser.save();

    return res.json({
      message: 'User deactivated successfully',
      user: targetUser
    });
  }

  // 🟢 ACTIVATE
  if (targetUser.companyId && targetUser.role !== 'superadmin') {
    const limitError = await validateCompanyRoleLimit({
      companyId: targetUser.companyId,
      role: targetUser.role
    });
    if (limitError) {
      return res.status(limitError.status).json({ message: limitError.message });
    }
  }

  targetUser.isActive = true;
  targetUser.sessionInvalidated = false;

  // ✅ DO NOT TOUCH deactivatedAt / deactivatedBy
  await targetUser.save();

  res.json({
    message: 'User activated successfully',
    user: targetUser
  });
});


router.delete('/:id/permanent', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of superadmin
    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'Superadmin cannot be deleted' });
    }

    await User.findByIdAndDelete(userId);

    return res.json({ message: 'User permanently deleted' });
  } catch (error) {
    return res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

export default router;
