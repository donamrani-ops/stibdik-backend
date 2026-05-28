const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'donamrani@gmail.com';
const FROM_EMAIL  = 'noreply@stibdik.ma';

// Transporter — utilise les variables d'environnement Render
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

// Email à l'admin quand un nouveau ticket est créé
exports.notifyAdminNewTicket = async (ticket) => {
  if (!process.env.SMTP_USER) return; // pas de config email → silencieux
  try {
    await transporter.sendMail({
      from: `"Stibdik Support" <${FROM_EMAIL}>`,
      to:   ADMIN_EMAIL,
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
            <a href="https://stibdik.netlify.app" 
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

// Email de confirmation à l'utilisateur
exports.confirmTicketCreated = async (ticket) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from: `"Stibdik Support" <${FROM_EMAIL}>`,
      to:   ticket.userEmail,
      subject: `✅ Ticket #${ticket.number} reçu — ${ticket.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#00796B;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">✅ Votre ticket a été reçu</h2>
          </div>
          <div style="background:#f9f9f9;padding:20px;border:1px solid #e0e0e0">
            <p>Bonjour <strong>${ticket.userName}</strong>,</p>
            <p>Votre ticket <strong>#${ticket.number}</strong> a bien été créé.</p>
            <p><strong>Sujet :</strong> ${ticket.subject}</p>
            <p>Notre équipe vous répondra sous <strong>24h ouvrées</strong>.</p>
            <br>
            <a href="https://stibdik.netlify.app" 
               style="background:#00796B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
              Suivre mon ticket →
            </a>
          </div>
          <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">
            Stibdik — Marketplace Maroc · Ne pas répondre à cet email
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('Email user failed:', err.message);
  }
};

// Email à l'admin quand un utilisateur répond à un ticket
exports.notifyAdminTicketReply = async (ticket, message) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from: `"Stibdik Support" <${FROM_EMAIL}>`,
      to:   ADMIN_EMAIL,
      subject: `💬 Réponse sur ticket #${ticket.number} — ${ticket.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1565C0;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">💬 Nouvelle réponse utilisateur</h2>
          </div>
          <div style="background:#f9f9f9;padding:20px;border:1px solid #e0e0e0">
            <p><strong>Ticket #${ticket.number}</strong> — ${ticket.subject}</p>
            <p><strong>De :</strong> ${ticket.userName}</p>
            <blockquote style="background:#fff;border-left:4px solid #1565C0;padding:12px;margin:0">
              ${message}
            </blockquote>
            <br>
            <a href="https://stibdik.netlify.app" 
               style="background:#1565C0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
              Répondre →
            </a>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('Email admin reply failed:', err.message);
  }
};

// Email restock — notifier un abonné que le produit est de nouveau dispo
exports.sendRestockNotification = async (email, userName, productName, productId) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from: `"Stibdik" <${FROM_EMAIL}>`,
      to:   email,
      subject: `✅ "${productName}" est de nouveau disponible !`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#00796B;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">✅ Bonne nouvelle !</h2>
          </div>
          <div style="background:#f9f9f9;padding:20px;border:1px solid #e0e0e0">
            <p>Bonjour <strong>${userName}</strong>,</p>
            <p>Le produit que vous suiviez est de nouveau en stock :</p>
            <h3 style="color:#00796B">${productName}</h3>
            <p style="color:#f44336;font-weight:700">⚡ Dépêchez-vous, le stock est limité !</p>
            <br>
            <a href="https://stibdik.netlify.app"
               style="background:#00796B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
              Voir le produit →
            </a>
          </div>
          <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">
            Stibdik — Marketplace Maroc · Vous recevez cet email car vous avez demandé une notification de réapprovisionnement.
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('Restock email failed:', err.message);
  }
};

// Email de confirmation d'abonnement restock
exports.sendRestockSubscriptionConfirmation = async (email, userName, productName) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({
      from: `"Stibdik" <${FROM_EMAIL}>`,
      to:   email,
      subject: `🔔 Vous serez notifié dès le retour de "${productName}"`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#00796B;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">🔔 Notification activée</h2>
          </div>
          <div style="background:#f9f9f9;padding:20px;border:1px solid #e0e0e0">
            <p>Bonjour <strong>${userName}</strong>,</p>
            <p>Votre alerte a bien été enregistrée pour :</p>
            <h3 style="color:#00796B;margin:12px 0">${productName}</h3>
            <p>Vous recevrez un email dès que ce produit sera de nouveau disponible.</p>
            <p style="color:#9e9e9e;font-size:12px;margin-top:16px">
              Vous pouvez annuler cette notification depuis la page du produit sur Stibdik.
            </p>
          </div>
          <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">
            Stibdik — Marketplace Maroc
          </div>
        </div>
      `
    });
  } catch (err) {
    console.warn('Subscription confirmation email failed:', err.message);
  }
};

// Notification vendeur — nouvelle offre reçue
exports.notifyVendorNewOffer = async (email, vendorName, buyerName, productName, offerPrice, originalPrice, offerId) => {
  if (!process.env.SMTP_USER) return;
  const discount = Math.round((1 - offerPrice/originalPrice)*100);
  try {
    await transporter.sendMail({
      from: `"Stibdik" <${FROM_EMAIL}>`,
      to: email,
      subject: `💰 Nouvelle offre de ${buyerName} pour "${productName}"`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#00796B;color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">💰 Nouvelle offre reçue</h2>
        </div>
        <div style="background:#f9f9f9;padding:24px;border:1px solid #e0e0e0">
          <p>Bonjour <strong>${vendorName}</strong>,</p>
          <p><strong>${buyerName}</strong> a fait une offre pour <strong>"${productName}"</strong></p>
          <div style="background:#fff;border:2px solid #00796B;border-radius:12px;padding:20px;margin:16px 0;text-align:center">
            <div style="font-size:13px;color:#666;text-decoration:line-through">${originalPrice} DH</div>
            <div style="font-size:32px;font-weight:900;color:#00796B">${offerPrice} DH</div>
            <div style="font-size:12px;color:#FF9800;font-weight:700">-${discount}% de réduction</div>
          </div>
          <p>Connectez-vous pour accepter, refuser ou contre-offrir.</p>
        </div>
        <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">Stibdik — Marketplace Maroc</div>
      </div>`
    });
  } catch(e) { console.warn('notifyVendorNewOffer failed:', e.message); }
};

// Notification acheteur — réponse à son offre
exports.notifyBuyerOfferResponse = async (email, buyerName, productName, action, price, message) => {
  if (!process.env.SMTP_USER) return;
  const icons = { accept:'✅', decline:'❌', counter:'🔄' };
  const labels = { accept:'acceptée', decline:'refusée', counter:'contre-offre reçue' };
  try {
    await transporter.sendMail({
      from: `"Stibdik" <${FROM_EMAIL}>`,
      to: email,
      subject: `${icons[action]||'📩'} Votre offre pour "${productName}" a été ${labels[action]||'mise à jour'}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:${action==='accept'?'#00796B':action==='decline'?'#f44336':'#FF9800'};color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">${icons[action]||'📩'} Offre ${labels[action]||'mise à jour'}</h2>
        </div>
        <div style="background:#f9f9f9;padding:24px;border:1px solid #e0e0e0">
          <p>Bonjour <strong>${buyerName}</strong>,</p>
          ${action==='accept'?`<p>🎉 Le vendeur a <strong>accepté</strong> votre offre de <strong>${price} DH</strong> pour "${productName}". Finalisez votre achat !</p>`:''}
          ${action==='decline'?`<p>Le vendeur a refusé votre offre pour "${productName}".</p>${message?`<p><em>"${message}"</em></p>`:''}`:''}
          ${action==='counter'?`<p>Le vendeur vous propose <strong>${price} DH</strong> pour "${productName}". Connectez-vous pour accepter ou négocier.</p>${message?`<p><em>"${message}"</em></p>`:''}`:''}
        </div>
        <div style="text-align:center;font-size:11px;color:#9e9e9e;padding:12px">Stibdik — Marketplace Maroc</div>
      </div>`
    });
  } catch(e) { console.warn('notifyBuyerOfferResponse failed:', e.message); }
};
