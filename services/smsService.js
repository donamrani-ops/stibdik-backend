// services/smsService.js
// Adaptateur SMS configurable : mode test (gratuit) ou Twilio (payant)
// Bascule via la variable d'environnement SMS_PROVIDER

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'test'; // 'test' | 'twilio'

// ── Adaptateur TEST (gratuit) ─────────────────────────────────────────────────
// N'envoie pas de vrai SMS. Logue le code et le retourne pour affichage dev.
async function sendViaTest(phone, message, code) {
  console.log(`📱 [SMS TEST] Vers ${phone}: ${message}`);
  console.log(`📱 [SMS TEST] Code OTP: ${code}`);
  return { success: true, provider: 'test', devCode: code };
}

// ── Adaptateur TWILIO (payant) ────────────────────────────────────────────────
async function sendViaTwilio(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Configuration Twilio manquante (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
  }

  // Appel API Twilio via fetch (pas de dépendance npm)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To:   phone,
    From: fromNumber,
    Body: message,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Twilio: ${data.message || 'Échec envoi SMS'}`);
  }
  return { success: true, provider: 'twilio', sid: data.sid };
}

// ── Interface publique ────────────────────────────────────────────────────────
exports.sendOtp = async (phone, code) => {
  const message = `Stibdik : votre code de vérification est ${code}. Valable 5 minutes. Ne le partagez avec personne.`;

  switch (SMS_PROVIDER) {
    case 'twilio':
      return sendViaTwilio(phone, message);
    case 'test':
    default:
      return sendViaTest(phone, message, code);
  }
};

exports.getProvider = () => SMS_PROVIDER;
