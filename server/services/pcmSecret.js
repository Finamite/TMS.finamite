import crypto from 'crypto';

const resolveSecret = () =>
  String(
    process.env.PCM_INTEGRATION_SECRET_KEY ||
      process.env.PCM_SECRET_KEY ||
      process.env.JWT_SECRET ||
      'tms-pcm-integration-secret'
  ).trim();

const getKey = () => crypto.createHash('sha256').update(resolveSecret()).digest();

export const encryptPcmSecret = (value) => {
  const plain = String(value || '').trim();
  if (!plain) return '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptPcmSecret = (payload) => {
  const encrypted = String(payload || '').trim();
  if (!encrypted) return '';

  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted PCM secret');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
};

export const maskPcmSecret = (last4) => {
  const suffix = String(last4 || '').trim();
  if (!suffix) return 'Not configured';
  return `••••••••${suffix}`;
};

export const getPcmSecretTail = (value) => String(value || '').trim().slice(-4);

