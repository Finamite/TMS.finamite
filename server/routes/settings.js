// routes/settings.js
import express from 'express';
import { google } from 'googleapis';
import Settings from '../models/Settings.js';

const router = express.Router();

// --- Ensure env variables are present ---
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
}

// Helper to create a new OAuth2 client
const createOAuthClient = () =>
  new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

// ---------------------------
// Task Completion endpoints
// ---------------------------
router.get('/task-completion', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'taskCompletion', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'taskCompletion',
        companyId,
        data: {
          pendingTasks: {
            allowAttachments: false,
            mandatoryAttachments: false,
            mandatoryRemarks: false
          },
          pendingRecurringTasks: {
            allowAttachments: false,
            mandatoryAttachments: false,
            mandatoryRemarks: false
          }
        }
      });
      await settings.save();
    }

    res.json(settings.data);
  } catch (error) {
    console.error('Error fetching task completion settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/task-completion', async (req, res) => {
  try {
    const { companyId, ...settingsData } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await Settings.findOneAndUpdate(
      { type: 'taskCompletion', companyId },
      { $set: { data: settingsData } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Settings saved successfully', data: settings.data });
  } catch (error) {
    console.error('Error saving task completion settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// Revision endpoints
// ---------------------------
router.get('/revision', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'revision', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'revision',
        companyId,
        data: {
          limit: 3,
          scoringModel: 'stepped',
          enableRevisions: false,
          maxDays: 7,
          scoringRules: [
            {
              id: 'default',
              name: 'Default Scoring',
              enabled: true,
              // 0 = initial, 1..limit = revisions
              mapping: {
                0: 100,
                1: 70,
                2: 40,
                3: 0
              }
            }
          ]
        }
      });
      await settings.save();
    }

    res.json(settings.data);
  } catch (error) {
    console.error('Error fetching revision settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/revision', async (req, res) => {
  try {
    const { companyId, ...settingsData } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await Settings.findOneAndUpdate(
      { type: 'revision', companyId },
      { $set: { data: settingsData } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Revision settings saved successfully', data: settings.data });
  } catch (error) {
    console.error('Error saving revision settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// Email endpoints (Gmail OAuth)
// ---------------------------

// GET /email - fetch email settings for a company (safe)
router.get('/email', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'email', companyId });

    if (!settings) {
      // create default email doc (no tokens)
      settings = new Settings({
        type: 'email',
        companyId,
        data: {
          enabled: false,
          email: '',
          // googleTokens will be added on successful OAuth
        }
      });
      await settings.save();
    }

    // Return safe data (do not include tokens)
    const safeData = { ...settings.data };
    if (safeData.googleTokens) delete safeData.googleTokens;
    res.json(safeData);
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /email - save email settings (non-sensitive fields)
router.post('/email', async (req, res) => {
  try {
    const { companyId, ...settingsData } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    // Keep existing googleTokens if present in DB; don't overwrite tokens from frontend
    const existing = await Settings.findOne({ type: 'email', companyId });
    const tokens = existing?.data?.googleTokens;

    const newData = {
      ...settingsData,
      ...(tokens ? { googleTokens: tokens } : {})
    };

    const settings = await Settings.findOneAndUpdate(
      { type: 'email', companyId },
      { $set: { data: newData } },
      { upsert: true, new: true }
    );

    const safeData = { ...settings.data };
    if (safeData.googleTokens) delete safeData.googleTokens;
    res.json({ message: 'Email settings saved successfully', data: safeData });
  } catch (error) {
    console.error('Error saving email settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /email/google-auth - returns Google OAuth URL
router.get('/email/google-auth', (req, res) => {
  try {
    const oauth2Client = createOAuthClient();

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // get refresh_token
      prompt: 'consent',
      scope: scopes
    });

    res.json({ url });
  } catch (error) {
    console.error('Error generating google auth url:', error);
    res.status(500).json({ message: 'Failed to create google auth url' });
  }
});

// GET /google/callback - Google redirects here after user consents
// The frontend should open the auth URL in a popup and this endpoint will store tokens and close the popup.
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    // `state` will be used to pass companyId from frontend (we append it on client)
    const companyId = state || req.query.companyId;

    if (!code || !companyId) {
      return res.status(400).json({ message: 'Missing code or companyId (state)' });
    }

    const oauth2Client = createOAuthClient();

    const { tokens } = await oauth2Client.getToken(String(code));
    oauth2Client.setCredentials(tokens);

    // Use Google OAuth2 API to fetch the authenticated user's email
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userinfo = await oauth2.userinfo.get();

    const userEmail = userinfo?.data?.email || '';

    // Save tokens into Settings (do not expose these in GET)
    const settings = await Settings.findOneAndUpdate(
      { type: 'email', companyId: String(companyId) },
      {
        $set: {
          data: {
            enabled: true,
            email: userEmail,
            googleTokens: tokens
          }
        }
      },
      { upsert: true, new: true }
    );

    // Notify opener (frontend) and close popup
    // small HTML page that posts message to parent and closes
    res.send(`
      <html>
        <body>
          <script>
            try {
              window.opener.postMessage({ type: 'googleConnected' }, '*');
            } catch(e) {}
            // show a tiny message then close
            document.write('<p>Google connected. You can close this window.</p>');
            setTimeout(function(){ window.close(); }, 800);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google callback error:', error);
    res.status(500).json({ message: 'Google authentication failed', error: String(error) });
  }
});

// POST /email/test - send a test email using Gmail API and stored tokens
router.post('/email/test', async (req, res) => {
  try {
    const admin = await User.findOne({
      companyId,
      role: "admin",
      isActive: true
    });

    const to = admin.email;
    const subject = "Test Email - System Working";
    const text = "Your Gmail integration is working successfully!";
    if (!companyId || !to || !subject || !text) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const emailSettings = await Settings.findOne({ type: 'email', companyId });
    if (!emailSettings?.data) {
      return res.status(400).json({ message: 'Email settings not configured' });
    }

    const tokens = emailSettings.data.googleTokens;
    if (!tokens) {
      return res.status(400).json({ message: 'Google account not connected. Please connect first.' });
    }

    // create oauth client and set credentials from DB
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials(tokens);

    // Create Gmail client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build the raw email message and base64url encode it
    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text
    ].join('\r\n');

    const encodedMessage = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Error sending test email:', error);

    // If token expired or invalid, give a helpful message
    const errMsg = (error && error.response && error.response.data) ? JSON.stringify(error.response.data) : String(error);
    res.status(500).json({ message: 'Failed to send email', error: errMsg });
  }
});

// Optional: endpoint to disconnect / revoke tokens (not required, but handy)
router.post('/email/disconnect', async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await Settings.findOne({ type: 'email', companyId });
    if (!settings?.data?.googleTokens) {
      return res.json({ message: 'No google connection found' });
    }

    // Remove tokens from DB but keep the email & enabled false
    const updated = await Settings.findOneAndUpdate(
      { type: 'email', companyId },
      { $set: { data: { enabled: false, email: '' } } },
      { new: true }
    );

    res.json({ message: 'Disconnected Google account', data: updated.data });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ message: 'Failed to disconnect', error: error.message });
  }
});

export default router;
