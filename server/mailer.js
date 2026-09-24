const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}

async function sendMail({ subject, text, html, to }) {
  const t = getTransporter();
  const recipient = to || process.env.NOTIFY_EMAIL;
  if (!t || !recipient) {
    // SMTP not configured yet — don't crash the request, just log it so
    // local development still works without email set up.
    console.log('--- EMAIL NOT SENT (SMTP not configured) ---');
    console.log('To:', recipient);
    console.log('Subject:', subject);
    console.log(text);
    console.log('---------------------------------------------');
    return { sent: false, reason: 'SMTP not configured' };
  }
  await t.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: recipient,
    subject,
    text,
    html
  });
  return { sent: true };
}

module.exports = { sendMail };
