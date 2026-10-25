const nodemailer = require("nodemailer");

// One place that sends email (Gmail account from .env).
async function sendMail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
}

module.exports = { sendMail };