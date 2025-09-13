import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-please-change-in-production';

export interface AppConfig {
  imdbCredentials?: {
    email: string;
    encryptedPassword: string;
  };
  settings?: {
    syncInterval: string;
    autoSync: boolean;
    enableNotifications: boolean;
  };
}

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

function encrypt(text: string): string {
  const cipher = crypto.createCipher('aes192', ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedText: string): string {
  const decipher = crypto.createDecipher('aes192', ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function saveCredentials(email: string, password: string): Promise<void> {
  const config = await loadConfig();
  config.imdbCredentials = {
    email,
    encryptedPassword: encrypt(password)
  };
  await saveConfig(config);
}

export async function getCredentials(): Promise<{ email: string; password: string } | null> {
  const config = await loadConfig();
  
  if (!config.imdbCredentials) {
    return null;
  }

  try {
    return {
      email: config.imdbCredentials.email,
      password: decrypt(config.imdbCredentials.encryptedPassword)
    };
  } catch (error) {
    console.error('Error decrypting credentials:', error);
    return null;
  }
}

export async function hasCredentials(): Promise<boolean> {
  const config = await loadConfig();
  return !!(config.imdbCredentials?.email && config.imdbCredentials?.encryptedPassword);
}

export async function clearCredentials(): Promise<void> {
  const config = await loadConfig();
  delete config.imdbCredentials;
  await saveConfig(config);
}