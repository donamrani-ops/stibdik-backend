const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'donamrani@gmail.com';
const FROM_EMAIL  = 'noreply@stibdik.ma';

// Transporter — utilise les variables d'environnement Render
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

// ── Email à l'admin quand un nouveau ticket est créé ─────────────────────────
exports.notifyAdminNewTicket = async (ticket) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from:    `"Stibdik Support" <${FROM_EMAIL}>`,
      to:      ADMIN_EMAIL,
      subject: `🎫 Nouveau ticket #${ticket.number} — ${ticket.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#00796B;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">🎫 Nouveau ticket support</h2>
          </div>
          <div style="background:#f9f9f9;padding:20px;border:1px solid #e0e0e0">
            <p><strong>Ticket #${ticket.number}</strong></p>
            <p><strong>Sujet :</strong> ${ticket.subject}</p>
            <p><strong>Catégorie :</strong> ${ticket.category}</p>
            <p><strong>De :</strong> ${ticket.userName} (${ticket.userEmail})</p>
            <p><strong>Message :</strong></p>
            <blockquote style="background:#fff;border-left:4px solid #00796B;padding:12px;margin:0">
              ${ticket.messages?.[0]?.content || ''}
            </blockquote>
            <br>
            <a href="https://stibdik.pages.dev"
               style="background:#00796B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
              Répondre dans le dashboard →
            </a>
          </div>
          <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">
            Stibdik — Marketplace Maroc
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('Email admin failed:', err.message);
  }
};

// ── Email de confirmation à l'utilisateur quand ticket créé ──────────────────
exports.confirmTicketCreated = async (ticket) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from:    `"Stibdik Support" <${FROM_EMAIL}>`,
      to:      ticket.userEmail,
      subject: `✅ Ticket #${ticket.number} reçu — ${ticket.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#00796B;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">✅ Votre ticket a été reçu</h2>
          </div>
          <div style="background:#f9f9f9;padding:20px;border:1px solid #e0e0e0">
            <p>Bonjour <strong>${ticket.userName}</strong>,</p>
            <p>Votre ticket <strong>#${ticket.number}</strong> a bien été reçu.</p>
            <p><strong>Sujet :</strong> ${ticket.subject}</p>
            <p>Notre équipe vous répondra dans les plus brefs délais.</p>
            <br>
            <a href="https://stibdik.pages.dev"
               style="background:#00796B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
              Voir mes tickets →
            </a>
          </div>
          <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">
            Stibdik — Marketplace Maroc
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('Email confirmTicket failed:', err.message);
  }
};

// ── Email de réinitialisation du mot de passe ─────────────────────────────────
exports.sendResetPassword = async (user, resetUrl) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from:    `"Stibdik" <${FROM_EMAIL}>`,
      to:      user.email,
      subject: '🔑 Réinitialisation de votre mot de passe Stibdik',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f5f7f8">
          <div style="background:linear-gradient(135deg,#00796B,#4CAF50);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:26px;font-weight:900">Stibdik</h1>
            <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px">Marketplace Maroc</p>
          </div>

          <div style="background:#fff;padding:32px 24px;border:1px solid #e8ecef;border-top:none">
            <h2 style="font-size:20px;font-weight:800;color:#1a1d23;margin:0 0 8px">
              🔑 Réinitialisation du mot de passe
            </h2>
            <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">
              Bonjour <strong>${user.name}</strong>,<br><br>
              Vous avez demandé à réinitialiser votre mot de passe Stibdik.
              Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
            </p>

            <div style="text-align:center;margin:32px 0">
              <a href="${resetUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#00796B,#4CAF50);
                        color:#fff;padding:16px 32px;border-radius:50px;text-decoration:none;
                        font-size:15px;font-weight:800;box-shadow:0 4px 16px rgba(0,121,107,.3)">
                🔑 Réinitialiser mon mot de passe →
              </a>
            </div>

            <p style="color:#9e9e9e;font-size:12px;line-height:1.6;margin:24px 0 0;
                       padding:16px;background:#f9f9f9;border-radius:8px;border-left:4px solid #FF9800">
              ⚠️ Ce lien expire dans <strong>1 heure</strong>.<br>
              Si vous n'avez pas demandé cette réinitialisation, ignorez cet email —
              votre mot de passe reste inchangé.
            </p>

            <p style="color:#bbb;font-size:11px;margin:16px 0 0">
              Ou copiez ce lien dans votre navigateur :<br>
              <a href="${resetUrl}" style="color:#00796B;word-break:break-all">${resetUrl}</a>
            </p>
          </div>

          <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:16px">
            Stibdik — Marketplace Maroc ·
            <a href="https://stibdik.pages.dev" style="color:#9e9e9e">stibdik.pages.dev</a>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('sendResetPassword email failed:', err.message);
  }
};
