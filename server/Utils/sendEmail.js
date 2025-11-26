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

function createMimeMessage({ to, from, subject, text, attachments }) {
  const boundary = "__BOUNDARY__" + Date.now();

  let mime = "";
  mime += `From: ${from}\r\n`;
  mime += `To: ${to}\r\n`;
  mime += `Subject: ${subject}\r\n`;
  mime += `MIME-Version: 1.0\r\n`;
  mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
  mime += `\r\n`;
  mime += `--${boundary}\r\n`;
  mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
  mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
  mime += `${text}\r\n\r\n`;

  // Attach files
  for (const file of attachments) {
    try {
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
export async function sendSystemEmail(companyId, to, subject, text, attachments = []) {
  try {
    const settings = await Settings.findOne({ type: "email", companyId });

    if (!settings?.data?.enabled || !settings?.data?.googleTokens) {
      console.log("Email disabled or Gmail not connected.");
      return;
    }

    const oauth = createOAuthClient();
    oauth.setCredentials(settings.data.googleTokens);

    const gmail = google.gmail({ version: "v1", auth: oauth });

    const formattedAttachments = attachments.map((fileUrl) => ({
      filename: fileUrl.split("/").pop(),
      path: fileUrl
    }));

    const raw = createMimeMessage({
      to,
      from: settings.data.email,
      subject,
      text,
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
