import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Task from '../models/Task.js';

const router = express.Router();

// Define __dirname for ES modules (ADD THIS BLOCK)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // CHANGE: Use absolute path relative to this file
    // Go up one level (..) from 'routes' to root, then into 'uploads/chat'
    const uploadDir = path.join(__dirname, '../uploads/chat');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|csv|xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and documents are allowed.'));
    }
  }
});

router.post('/create-chat', async (req, res) => {
  try {
    const { adminId, userId, companyId } = req.body;

    // Check if chat already exists
    let chat = await Chat.findOne({
      companyId,
      chatType: 'direct',
      'participants.userId': { $all: [adminId, userId] },
      deletedBy: null,
      deletedAt: null
    });

    if (!chat) {
      const admin = await User.findById(adminId);
      const user = await User.findById(userId);

      chat = new Chat({
        companyId,
        chatType: "direct",
        participants: [
          { userId: admin._id, username: admin.username, role: admin.role },
          { userId: user._id, username: user.username, role: user.role }
        ]
      });

      await chat.save();
    }

    res.json(chat);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});


// Get or create chat for support (user to admin/managers)
router.post('/support-chat', async (req, res) => {
  try {
    const { userId, companyId } = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find existing support chat for this user
    let chat = await Chat.findOne({
      companyId,
      chatType: 'support',
      'participants.userId': userId
    })

    if (!chat) {
      // Get all admin and manager users from the same company
      const adminManagers = await User.find({
        companyId,
        role: { $in: ['admin', 'manager'] },
        isActive: true
      });

      // Create participants array
      const participants = [
        {
          userId: user._id,
          username: user.username,
          role: user.role
        },
        ...adminManagers.map(am => ({
          userId: am._id,
          username: am.username,
          role: am.role
        }))
      ];

      // Create new support chat
      chat = new Chat({
        companyId,
        participants,
        chatType: 'support'
      });

      await chat.save();
    }

    res.json(chat);
  } catch (error) {
    console.error('Error creating support chat:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:chatId', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Auto clear typing if stale
    if (chat.typing && chat.typing.lastUpdated) {
      const diff = Date.now() - new Date(chat.typing.lastUpdated).getTime();

      if (diff > 3000) {
        chat.typing = null;
        await chat.save();
      }
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get chats for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId } = req.query;

    // Find current user to check role
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Build query
    const query = {
      companyId,
      'participants.userId': userId,
      deletedBy: null,
      deletedAt: null
    };
    // Employees only see active chats
    if (currentUser.role === "employee") {
      query.isActive = true;
    }

    const chats = await Chat.find(query)
      .populate('participants.userId', 'username email role')
      .sort({ lastMessageAt: -1 });

    // Fetch last message for each chat
    const chatsWithLastMessage = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await Message.findOne({
          chatId: chat._id,
          isDeleted: false
        }).sort({ createdAt: -1 });

        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          isDeleted: false,
          'readBy.userId': { $ne: userId }
        });

        // [FIX] Explicitly convert to object and ensure typing is passed
        const chatObj = chat.toObject();

        return {
          ...chatObj,
          lastMessage,
          unreadCount,
          typing: chatObj.typing // Now this will exist because of the Schema change
        };
      })
    );

    res.json(chatsWithLastMessage);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Get messages for a chat
router.get('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50, search } = req.query;

    let query = {
      chatId,
      isDeleted: false
    };

    // Add search functionality
    if (search) {
      query.$text = { $search: search };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('senderId', 'username email role');

    const total = await Message.countDocuments(query);

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send message
router.post('/:chatId/messages', upload.array('attachments', 5), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, content, taggedTaskId, taggedTaskType } = req.body;

    // Find sender
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(404).json({ message: 'Sender not found' });
    }

    // Verify chat exists and user is participant
    const chat = await Chat.findOne({
      _id: chatId,
      'participants.userId': senderId
    });

    if (!chat) {
      return res.status(403).json({ message: 'Chat not found or access denied' });
    }

    // Prepare attachments
    const attachments = req.files ? req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    })) : [];

    // Prepare tagged task info if provided
    let taggedTask = null;
    if (taggedTaskId) {
      const task = await Task.findById(taggedTaskId);
      if (task) {
        taggedTask = {
          taskId: task._id.toString(),
          taskTitle: task.title,
          taskType: taggedTaskType || task.taskType,
          dueDate: task.dueDate
        };
      }
    }

    let replyTo = null;
    if (req.body.replyToMessageId) {
      const original = await Message.findById(req.body.replyToMessageId);
      if (original) {
        replyTo = {
          messageId: original._id,
          content: original.content?.slice(0, 50) || "Attachment",
          senderName: original.senderInfo.username,
          messageType: original.messageType
        };
      }
    }

    // Determine message type
    let messageType = 'text';
    if (attachments.length > 0) {
      messageType = 'file';
    } else if (taggedTask) {
      messageType = 'task-tag';
    }

    // Create message
    const message = new Message({
      chatId,
      senderId,
      senderInfo: {
        username: sender.username,
        role: sender.role
      },
      content: content || '',
      messageType,
      attachments,
      taggedTask,
      replyTo
    });

    await message.save();

    // Update chat's lastMessageAt
    chat.lastMessageAt = new Date();
    await chat.save();

    // Populate sender info for response
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username email role')
      .lean();

    if (replyTo) {
      populatedMessage.replyTo = replyTo;
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);

    // Clean up uploaded files if there was an error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


router.post('/:chatId/typing', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    await Chat.findByIdAndUpdate(chatId, {
      typing: { userId, lastUpdated: new Date() }
    });

    res.json({ message: "Typing updated" });
  } catch (error) {
    console.error("Typing error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


router.post('/:chatId/typing-stop', async (req, res) => {
  try {
    const { chatId } = req.params;

    await Chat.findByIdAndUpdate(chatId, {
      typing: null
    });

    res.json({ message: "Typing stopped" });
  } catch (error) {
    console.error("Typing stop error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// Delete message (admin/manager only)
router.delete('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { deletedBy } = req.body;

    const user = await User.findById(deletedBy);
    if (!user || !['admin', 'manager'].includes(user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Delete all messages
    await Message.deleteMany({ chatId });

    // Mark chat deleted
    chat.isActive = false;
    chat.deletedBy = deletedBy;
    chat.deletedAt = new Date();
    await chat.save();

    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get user's pending tasks for tagging
router.get('/user/:userId/tasks', async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId } = req.query;

    // Get pending one-time tasks
    const pendingTasks = await Task.find({
      assignedTo: userId,
      companyId,
      taskType: 'one-time',
      status: { $in: ['pending', 'overdue'] },
      isActive: true
    }).select('_id title description dueDate priority')
      .sort({ dueDate: 1 });

    // Get pending recurring tasks
    const recurringTasks = await Task.find({
      assignedTo: userId,
      companyId,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      status: { $in: ['pending', 'overdue'] },
      isActive: true
    }).select('_id title description dueDate priority taskType')
      .sort({ dueDate: 1 });

    res.json({
      pendingTasks,
      recurringTasks
    });
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark messages as read
router.put('/:chatId/messages/read', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    await Message.updateMany(
      {
        chatId,
        'readBy.userId': { $ne: userId },
        isDeleted: false
      },
      {
        $push: {
          readBy: {
            userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deletedBy } = req.body;

    const user = await User.findById(deletedBy);
    if (!user || !['admin', 'manager'].includes(user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.isDeleted = true;
    message.deletedBy = deletedBy;
    message.deletedAt = new Date();
    await message.save();

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;