// lib/projects.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { parseRequiredSkills } from '@/lib/skills';
import type { Project, ProjectPatch, ProjectRow, ProjectSummary } from '@/types/compass';

// AES-256-GCM for the sensitive text columns (manfaat, risk_analysis).
// Stored as "enc:v1:<iv>:<tag>:<ciphertext>", each part base64.
const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const raw = process.env.COMPASS_ENCRYPTION_KEY;
  const key = raw ? Buffer.from(raw, 'base64') : undefined;
  if (key === undefined || key.length !== 32) {
    throw new ApiError(500, 'config_error', 'COMPASS_ENCRYPTION_KEY must be 32 bytes, base64');
  }
  return key;
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${body.toString('base64')}`;
}

/** Values without the prefix are treated as legacy plaintext and returned as is. */
export function decryptText(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const parts = stored.slice(PREFIX.length).split(':');
  const [iv = '', tag = '', body = ''] = parts;
  if (parts.length !== 3 || iv === '' || tag === '') {
    throw new ApiError(500, 'decrypt_failed', 'Malformed ciphertext');
  }
  const key = encryptionKey();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    throw new ApiError(500, 'decrypt_failed', 'Could not decrypt stored value');
  }
}

/** Encrypts the sensitive fields of a write payload. */
export function seal(patch: ProjectPatch): ProjectPatch {
  const out: ProjectPatch = { ...patch };
  if (typeof out.manfaat === 'string') out.manfaat = encryptText(out.manfaat);
  if (typeof out.risk_analysis === 'string') out.risk_analysis = encryptText(out.risk_analysis);
  return out;
}

const open = (value: string | null): string | null => (value === null ? null : decryptText(value));

export function toProject(row: ProjectRow): Project {
  return {
    ...row,
    required_skills: parseRequiredSkills(row.required_skills),
    manfaat: open(row.manfaat),
    risk_analysis: open(row.risk_analysis),
  };
}

/** List view: the encrypted columns are dropped, not decrypted. */
export function toSummary(row: ProjectRow): ProjectSummary {
  const { manfaat: _manfaat, risk_analysis: _risk, ...rest } = row;
  return { ...rest, required_skills: parseRequiredSkills(rest.required_skills) };
}
