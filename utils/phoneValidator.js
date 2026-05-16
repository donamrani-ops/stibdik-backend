// ─── Utilitaire validation + normalisation téléphone marocain ─────────────────
// Usage : const { normalizePhone, validatePhone } = require('../utils/phoneValidator');

/**
 * Formats acceptés :
 *   06XXXXXXXX       → 10 chiffres commençant par 06
 *   07XXXXXXXX       → 10 chiffres commençant par 07
 *   +2126XXXXXXXX    → préfixe +212 suivi de 6
 *   +2127XXXXXXXX    → préfixe +212 suivi de 7
 *   0212 6X...       → variantes avec espaces/tirets
 * 
 * Normalisation : tout est converti en 0XXXXXXXXX (10 chiffres)
 */

const MOROCCAN_PHONE_REGEX = /^(?:\+212|00212|0)([67]\d{8})$/;

/**
 * Normalise un numéro marocain vers le format 0XXXXXXXXX
 * @param {string} phone
 * @returns {string|null} numéro normalisé ou null si invalide
 */
function normalizePhone(phone) {
  if (!phone) return null;
  // Supprimer espaces, tirets, points
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  const match = cleaned.match(MOROCCAN_PHONE_REGEX);
  if (!match) return null;
  return '0' + match[1]; // ex: +212612345678 → 0612345678
}

/**
 * Valide un numéro marocain
 * @param {string} phone
 * @returns {{ valid: boolean, normalized?: string, error?: string }}
 */
function validatePhone(phone) {
  if (!phone || phone.trim() === '') {
    return { valid: true }; // champ optionnel
  }
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return {
      valid: false,
      error: 'Numéro invalide. Formats acceptés : 06XXXXXXXX, 07XXXXXXXX, +2126XXXXXXXX, +2127XXXXXXXX'
    };
  }
  return { valid: true, normalized };
}

module.exports = { normalizePhone, validatePhone, MOROCCAN_PHONE_REGEX };
