// utils/sendEmail.js
import { google } from "googleapis";
import Settings from "../models/Settings.js";

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

// 👉 Main reusable email function
export async function sendSystemEmail(companyId, to, subject, text) {
  const emailSettings = await Settings.findOne({ type: "email", companyId });

  if (!emailSettings?.data?.enabled || !emailSettings?.data?.googleTokens) {
    console.log("Email not enabled or Gmail not connected.");
    return;
  }

  const oauth = createOAuthClient();
  oauth.setCredentials(emailSettings.data.googleTokens);

  const gmail = google.gmail({ version: "v1", auth: oauth });

  const rawMessage = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\n\r\n${text}`
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    resource: { raw: rawMessage }
  });

  console.log("Email sent to:", to);
}
