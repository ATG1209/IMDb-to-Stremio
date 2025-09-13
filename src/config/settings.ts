import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import bcrypt from 'bcrypt';
import { logger } from '../util/logger.js';

export interface IMDbCredentials {
  email: string;
  password: string; // Will be encrypted
}

export interface SyncSettings {
  interval: string; // Cron expression (e.g., '*/15 * * * *')
  enableTrakt: boolean;
  enableStremio: boolean;
  maxRetries: number;
  retryDelayMs: number;
  enableNotifications: boolean;
}

export interface FilterSettings {
  includeGenres: string[];
  excludeGenres: string[];
  includeTypes: string[]; // movie, tv, etc.
  excludeTypes: string[];
  minRating?: number;
  maxRating?: number;
}

export interface AppConfig {
  version: string;
  imdbCredentials?: IMDbCredentials;
  syncSettings: SyncSettings;
  filterSettings: FilterSettings;
  traktSettings?: {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
    refreshToken?: string;
  };
  logging: {
    level: string;
    enableFileLogging: boolean;
    logDirectory: string;
  };
  storage: {
    databasePath: string;
    backupEnabled: boolean;
    backupDirectory: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  syncSettings: {
    interval: '*/15 * * * *', // Every 15 minutes
    enableTrakt: true,
    enableStremio: false,
    maxRetries: 3,
    retryDelayMs: 5000,
    enableNotifications: false
  },
  filterSettings: {
    includeGenres: [],
    excludeGenres: [],
    includeTypes: ['movie', 'tv'],
    excludeTypes: []
  },
  logging: {
    level: 'info',
    enableFileLogging: true,
    logDirectory: path.join(os.homedir(), '.imdb-sync', 'logs')
  },
  storage: {
    databasePath: path.join(os.homedir(), '.imdb-sync', 'sync.db'),
    backupEnabled: true,
    backupDirectory: path.join(os.homedir(), '.imdb-sync', 'backups')
  }
};

export class ConfigManager {
  private configPath: string;
  private config: AppConfig;
  private encryptionKey: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.imdb-sync', 'config.json');
    this.encryptionKey = this.getOrCreateEncryptionKey();
    this.config = this.loadConfig();
  }

  private getOrCreateEncryptionKey(): string {
    const keyPath = path.join(path.dirname(this.configPath), '.key');
    
    try {
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8').trim();
      } else {
        // Generate a new encryption key
        const key = bcrypt.genSaltSync(10);
        this.ensureDirectoryExists(path.dirname(keyPath));
        fs.writeFileSync(keyPath, key, { mode: 0o600 }); // Read/write for owner only
        return key;
      }
    } catch (error) {
      logger.error('Error managing encryption key:', error);
      throw new Error('Failed to initialize encryption');
    }
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private loadConfig(): AppConfig {
    try {
      this.ensureDirectoryExists(path.dirname(this.configPath));

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const parsedConfig = JSON.parse(configData);
        
        // Merge with defaults to handle new config options
        const config = this.mergeWithDefaults(parsedConfig);
        
        logger.info('Configuration loaded successfully');
        return config;
      } else {
        logger.info('No configuration file found, using defaults');
        this.saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }
    } catch (error) {
      logger.error('Error loading configuration:', error);
      logger.info('Using default configuration');
      return { ...DEFAULT_CONFIG };
    }
  }

  private mergeWithDefaults(config: Partial<AppConfig>): AppConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      syncSettings: {
        ...DEFAULT_CONFIG.syncSettings,
        ...config.syncSettings
      },
      filterSettings: {
        ...DEFAULT_CONFIG.filterSettings,
        ...config.filterSettings
      },
      logging: {
        ...DEFAULT_CONFIG.logging,
        ...config.logging
      },
      storage: {
        ...DEFAULT_CONFIG.storage,
        ...config.storage
      },
      traktSettings: config.traktSettings ? {
        ...config.traktSettings
      } : undefined
    };
  }

  private saveConfig(config?: AppConfig): void {
    try {
      const configToSave = config || this.config;
      const configData = JSON.stringify(configToSave, null, 2);
      
      this.ensureDirectoryExists(path.dirname(this.configPath));
      fs.writeFileSync(this.configPath, configData, { mode: 0o600 });
      
      logger.debug('Configuration saved successfully');
    } catch (error) {
      logger.error('Error saving configuration:', error);
      throw new Error('Failed to save configuration');
    }
  }

  // Public methods

  getConfig(): AppConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.config = this.mergeWithDefaults({ ...this.config, ...updates });
    this.saveConfig();
    logger.info('Configuration updated');
  }

  // IMDb credentials management
  async setIMDbCredentials(email: string, password: string): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      this.config.imdbCredentials = {
        email,
        password: hashedPassword
      };
      
      this.saveConfig();
      logger.info('IMDb credentials updated');
    } catch (error) {
      logger.error('Error setting IMDb credentials:', error);
      throw new Error('Failed to save credentials');
    }
  }

  async getIMDbCredentials(): Promise<{ email: string; password: string } | null> {
    if (!this.config.imdbCredentials) {
      return null;
    }

    // Note: In a real implementation, you'd need to store the original password
    // securely or use a different approach. This is a simplified version.
    return {
      email: this.config.imdbCredentials.email,
      password: this.config.imdbCredentials.password // This would need to be decrypted
    };
  }

  clearIMDbCredentials(): void {
    delete this.config.imdbCredentials;
    this.saveConfig();
    logger.info('IMDb credentials cleared');
  }

  // Sync settings
  setSyncInterval(interval: string): void {
    this.config.syncSettings.interval = interval;
    this.saveConfig();
    logger.info(`Sync interval updated to: ${interval}`);
  }

  getSyncSettings(): SyncSettings {
    return { ...this.config.syncSettings };
  }

  updateSyncSettings(settings: Partial<SyncSettings>): void {
    this.config.syncSettings = { ...this.config.syncSettings, ...settings };
    this.saveConfig();
    logger.info('Sync settings updated');
  }

  // Filter settings
  getFilterSettings(): FilterSettings {
    return { ...this.config.filterSettings };
  }

  updateFilterSettings(settings: Partial<FilterSettings>): void {
    this.config.filterSettings = { ...this.config.filterSettings, ...settings };
    this.saveConfig();
    logger.info('Filter settings updated');
  }

  // Trakt settings
  setTraktCredentials(clientId: string, clientSecret: string): void {
    this.config.traktSettings = {
      clientId,
      clientSecret,
      ...this.config.traktSettings
    };
    this.saveConfig();
    logger.info('Trakt credentials updated');
  }

  setTraktTokens(accessToken: string, refreshToken: string): void {
    if (!this.config.traktSettings) {
      throw new Error('Trakt credentials must be set first');
    }

    this.config.traktSettings.accessToken = accessToken;
    this.config.traktSettings.refreshToken = refreshToken;
    this.saveConfig();
    logger.info('Trakt tokens updated');
  }

  getTraktSettings(): typeof this.config.traktSettings {
    return this.config.traktSettings ? { ...this.config.traktSettings } : undefined;
  }

  // Logging settings
  setLogLevel(level: string): void {
    this.config.logging.level = level;
    this.saveConfig();
    logger.info(`Log level updated to: ${level}`);
  }

  getLoggingSettings(): typeof this.config.logging {
    return { ...this.config.logging };
  }

  // Storage settings
  getStorageSettings(): typeof this.config.storage {
    return { ...this.config.storage };
  }

  updateStorageSettings(settings: Partial<typeof this.config.storage>): void {
    this.config.storage = { ...this.config.storage, ...settings };
    this.saveConfig();
    logger.info('Storage settings updated');
  }

  // Backup and restore
  async createBackup(backupPath?: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `config-backup-${timestamp}.json`;
      const backupFilePath = backupPath || path.join(this.config.storage.backupDirectory, backupFileName);
      
      this.ensureDirectoryExists(path.dirname(backupFilePath));
      
      const backupData = {
        timestamp: new Date().toISOString(),
        version: this.config.version,
        config: this.config
      };
      
      fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
      
      logger.info(`Configuration backup created: ${backupFilePath}`);
      return backupFilePath;
    } catch (error) {
      logger.error('Error creating backup:', error);
      throw new Error('Failed to create backup');
    }
  }

  async restoreFromBackup(backupPath: string): Promise<void> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      
      if (!backupData.config) {
        throw new Error('Invalid backup file format');
      }

      // Create a backup of current config before restoring
      await this.createBackup();
      
      this.config = this.mergeWithDefaults(backupData.config);
      this.saveConfig();
      
      logger.info(`Configuration restored from backup: ${backupPath}`);
    } catch (error) {
      logger.error('Error restoring from backup:', error);
      throw new Error('Failed to restore from backup');
    }
  }

  // Validation
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate sync interval (cron expression)
    try {
      // Basic cron validation (you might want to use a proper cron parser)
      const parts = this.config.syncSettings.interval.split(' ');
      if (parts.length !== 5) {
        errors.push('Invalid cron expression in sync interval');
      }
    } catch {
      errors.push('Invalid sync interval format');
    }

    // Validate retry settings
    if (this.config.syncSettings.maxRetries < 0 || this.config.syncSettings.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10');
    }

    if (this.config.syncSettings.retryDelayMs < 1000) {
      errors.push('Retry delay must be at least 1000ms');
    }

    // Validate paths
    try {
      this.ensureDirectoryExists(path.dirname(this.config.storage.databasePath));
    } catch {
      errors.push('Invalid database path');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Reset to defaults
  resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
    logger.info('Configuration reset to defaults');
  }
}