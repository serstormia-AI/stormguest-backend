const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY debe ser un hex de 64 caracteres (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv:   iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag:  tag.toString('hex'),
  };
}

function decrypt(encryptedObj) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encryptedObj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encryptedObj.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedObj.data, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// Helpers para guardar/recuperar config con campos encriptados
function encryptField(value) {
  if (!value) return null;
  try { return encrypt(value); } catch { return null; }
}

function decryptField(enc) {
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

module.exports = { encrypt, decrypt, encryptField, decryptField };
