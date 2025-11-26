// utils/sendEmail.js
import { google } from "googleapis";
import Settings from "../models/Settings.js";
import fs from "fs";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
} = process.env;

const createOAuthClient = () =>
  new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

// 🔥 Helper function: Create MIME email with attachments
const createMimeEmail = ({ to, subject, text, attachments = [] }) => {
  let boundary = "----=_Part_" + Math.random().toString(36).substring(2);

  let message = `
Content-Type: multipart/mixed; boundary="${boundary}"
MIME-Version: 1.0
To: ${to}
Subject: ${subject}

--${boundary}
Content-Type: text/plain; charset="UTF-8"

${text}
`;

  // Add attachments
  for (const file of attachments) {
    try {
      const fileData = fs.readFileSync(file.path);
      const base64File = fileData.toString("base64");

      message += `
--${boundary}
Content-Type: application/octet-stream; name="${file.filename}"
Content-Disposition: attachment; filename="${file.filename}"
Content-Transfer-Encoding: base64

${base64File}
`;
    } catch (err) {
      console.error("Attachment read error:", err);
    }
  }

  message += `\n--${boundary}--`;

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

// 🚀 Main reusable email function (Supports Attachments)
export async function sendSystemEmail(companyId, to, subject, text, attachments = []) {
  try {
    const emailSettings = await Settings.findOne({ type: "email", companyId });

    if (!emailSettings?.data?.enabled || !emailSettings?.data?.googleTokens) {
      console.log("Email not enabled or Gmail not connected.");
      return;
    }

    const oauth = createOAuthClient();
    oauth.setCredentials(emailSettings.data.googleTokens);
    const gmail = google.gmail({ version: "v1", auth: oauth });

    // Prepare attachments in correct format
    const formattedAttachments = attachments.map((fileUrl) => ({
      filename: fileUrl.split("/").pop(),
      path: fileUrl
    }));

    // Create the raw MIME email
    const rawMessage = createMimeEmail({
      to,
      subject,
      text,
      attachments: formattedAttachments
    });

    // Send email with Gmail API
    await gmail.users.messages.send({
      userId: "me",
      resource: { raw: rawMessage }
    });

    console.log("Email sent to:", to);
  } catch (error) {
    console.error("Email sending failed:", error);
  }
}
