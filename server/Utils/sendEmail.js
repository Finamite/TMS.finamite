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

// build multipart MIME with both text and html parts and attachments
function createMimeMessage({ to, from, subject, text, html, attachments = [] }) {
  const boundary = "__BOUNDARY__" + Date.now();

  let mime = "";
  mime += `From: ${from}\r\n`;
  mime += `To: ${to}\r\n`;
  mime += `Subject: ${subject}\r\n`;
  mime += `MIME-Version: 1.0\r\n`;
  mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  // Start alternative part (text + html)
  const altBoundary = "__ALT__" + Date.now();
  mime += `--${boundary}\r\n`;
  mime += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

  // plain text
  mime += `--${altBoundary}\r\n`;
  mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
  mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
  mime += `${text || (html ? "Please view this email in HTML capable client." : "")}\r\n\r\n`;

  // html part (if provided)
  if (html) {
    mime += `--${altBoundary}\r\n`;
    mime += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    mime += `${html}\r\n\r\n`;
  }

  mime += `--${altBoundary}--\r\n\r\n`;

  // Attach files
  for (const file of attachments || []) {
    try {
      // file should be { filename, path }
      if (!file || !file.path) {
        console.error("Skipping invalid attachment:", file);
        continue;
      }
      if (!fs.existsSync(file.path)) {
        console.error("Attachment path missing on disk, skipping:", file.path);
        continue;
      }

      const fileData = fs.readFileSync(file.path);
      const base64File = fileData.toString("base64");

      mime += `--${boundary}\r\n`;
      mime += `Content-Type: application/octet-stream; name="${file.filename}"\r\n`;
      mime += `Content-Disposition: attachment; filename="${file.filename}"\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
      mime += `${base64File}\r\n\r\n`;
    } catch (e) {
      console.error("Attachment error:", e);
    }
  }

  mime += `--${boundary}--`;

  return Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// MAIN EMAIL FUNCTION
export async function sendSystemEmail(companyId, to, subject, text = "", html = "", attachments = []) {
  try {
    const settings = await Settings.findOne({ type: "email", companyId });

    if (!settings?.data?.enabled || !settings?.data?.googleTokens) {
      console.log("Email disabled or Gmail not connected.");
      return;
    }

    const oauth = createOAuthClient();
    oauth.setCredentials(settings.data.googleTokens);

    const gmail = google.gmail({ version: "v1", auth: oauth });

    const formattedAttachments = (attachments || []).map((file) => {
      if (typeof file === "string") {
        return {
          filename: file.split("/").pop(),
          path: file
        };
      }
      // If already object format
      return {
        filename: file.filename || file.originalName || file.name || "attachment",
        path: file.path || file.url
      };
    });

    const raw = createMimeMessage({
      to,
      from: settings.data.email,
      subject,
      text,
      html,
      attachments: formattedAttachments
    });

    await gmail.users.messages.send({
      userId: "me",
      resource: { raw }
    });

    console.log("Email SENT to:", to);
  } catch (err) {
    console.error("SEND EMAIL FAILED:", err);
  }
}
