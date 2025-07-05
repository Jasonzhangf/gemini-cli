/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GEMINI_CONFIG_DIR } from '../tools/memoryTool.js';

export interface UserAuthInfo {
  userId: string;
  displayName?: string;
  email?: string;
  readableId?: string; // Human-readable identifier (email or display name)
  isActive: boolean;
  lastUsed: number;
  modelUsage: {
    [model: string]: {
      requestCount: number;
      lastRequestTime: number;
      rateLimited: boolean;
      rateLimitedUntil?: number;
    };
  };
}

export interface ModelRotationConfig {
  modelPriority: string[];
  userRotationEnabled: boolean;
  fallbackStrategy: 'next_user' | 'next_model' | 'both';
}

export class UserAuthManager {
  private geminiDir: string;
  private saveAuthDir: string;
  private usersConfigPath: string;
  private rotationConfig: ModelRotationConfig;
  private currentAuthPath: string;

  constructor() {
    this.geminiDir = path.join(os.homedir(), GEMINI_CONFIG_DIR);
    this.saveAuthDir = path.join(this.geminiDir, 'save_auth');
    this.usersConfigPath = path.join(this.saveAuthDir, 'users.json');
    this.currentAuthPath = path.join(this.geminiDir, 'oauth_creds.json');

    // Default model rotation configuration
    this.rotationConfig = {
      modelPriority: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
      userRotationEnabled: true,
      fallbackStrategy: 'both',
    };

    this.loadRotationConfig();
    this.ensureSaveAuthDirectory();
  }

  private ensureSaveAuthDirectory(): void {
    if (!fs.existsSync(this.saveAuthDir)) {
      fs.mkdirSync(this.saveAuthDir, { recursive: true });
    }
  }

  private loadRotationConfig(): void {
    const configPath = path.join(this.saveAuthDir, 'rotation.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        this.rotationConfig = { ...this.rotationConfig, ...config };
      } catch (_error) {
        console.warn('Failed to load rotation config, using defaults');
      }
    }

    // Load model priority from environment
    const envModels = process.env.GEMINI_MODEL_ROTATION_ORDER;
    if (envModels) {
      this.rotationConfig.modelPriority = envModels
        .split(',')
        .map((m) => m.trim());
    }
  }

  /**
   * Save user authentication information after OAuth flow
   * Saves to save_auth directory and optionally replaces current auth
   */
  saveUserAuth(
    authData: Record<string, unknown>,
    userId?: string,
    makeActive: boolean = true,
  ): UserAuthInfo {
    const extractedUserId = userId || this.extractUserIdFromAuth(authData);
    
    // Extract display name and email for readable filename
    let displayName: string | undefined;
    let email: string | undefined;

    if (typeof authData.id_token === 'string') {
      try {
        const parts = authData.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString(),
          );
          displayName = payload.name;
          email = payload.email;
        }
      } catch (_error) {
        // Fallback to other methods
      }
    }

    // Create readable filename based on email or displayName
    let readableFileName = extractedUserId;
    if (email) {
      // Use email as filename (sanitize for filesystem)
      readableFileName = email.replace(/[^a-zA-Z0-9@._-]/g, '_');
    } else if (displayName) {
      // Use displayName as filename (sanitize for filesystem)
      readableFileName = displayName.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
    
    const userAuthPath = path.join(this.saveAuthDir, `${readableFileName}.json`);

    // Save the full auth data to save_auth directory
    fs.writeFileSync(userAuthPath, JSON.stringify(authData, null, 2));

    // If making this user active, replace the current oauth_creds.json
    if (makeActive) {
      fs.writeFileSync(this.currentAuthPath, JSON.stringify(authData, null, 2));
    }

    // Create or update user info
    const userInfo: UserAuthInfo = {
      userId: extractedUserId,
      displayName:
        displayName ||
        (authData.user as Record<string, string>)?.name ||
        (authData.displayName as string),
      email:
        email ||
        (authData.user as Record<string, string>)?.email ||
        (authData.email as string),
      readableId: readableFileName,
      isActive: true,
      lastUsed: Date.now(),
      modelUsage: {},
    };

    this.updateUserList(userInfo);
    console.log(`✅ Saved authentication for user: ${extractedUserId}`);

    return userInfo;
  }

  /**
   * Backup current oauth_creds.json and add to user management
   */
  backupCurrentAuth(): UserAuthInfo | null {
    if (!fs.existsSync(this.currentAuthPath)) {
      console.log('No current oauth_creds.json found to backup');
      return null;
    }

    try {
      const authData = JSON.parse(
        fs.readFileSync(this.currentAuthPath, 'utf-8'),
      );
      const userId = this.extractUserIdFromAuth(authData);

      // Save this auth data to save_auth directory
      return this.saveUserAuth(authData, userId, false); // Don't replace current file
    } catch (error) {
      console.error('Failed to backup current auth:', error);
      return null;
    }
  }

  /**
   * Clear the current authentication to trigger fresh login process
   */
  public clearCurrentAuthentication(): void {
    try {
      if (fs.existsSync(this.currentAuthPath)) {
        // Backup current auth before clearing
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(
          this.saveAuthDir,
          `oauth_creds_backup_${timestamp}.json`,
        );

        // Ensure save_auth directory exists
        if (!fs.existsSync(this.saveAuthDir)) {
          fs.mkdirSync(this.saveAuthDir, { recursive: true });
        }

        // Create backup
        fs.copyFileSync(this.currentAuthPath, backupPath);
        console.log(
          `📋 Backed up current auth to: ${path.basename(backupPath)}`,
        );

        // Remove current authentication
        fs.unlinkSync(this.currentAuthPath);
        console.log('🗑️  Removed current oauth_creds.json');
      } else {
        console.log('ℹ️  No current authentication file found');
      }
    } catch (error) {
      console.error('❌ Failed to clear current authentication:', error);
      throw error;
    }
  }

  /**
   * Auto-detect and save current authenticated user
   * Compares by email address - if same email exists, update it; otherwise create new user
   */
  autoSaveCurrentUser(): UserAuthInfo | null {
    if (!fs.existsSync(this.currentAuthPath)) {
      return null;
    }

    try {
      const authData = JSON.parse(
        fs.readFileSync(this.currentAuthPath, 'utf-8'),
      );
      const userId = this.extractUserIdFromAuth(authData);
      const email = this.extractEmailFromAuth(authData);

      // Check if this user is already saved (compare by email first, then by userId)
      const existingUsers = this.getAllUsers();
      let existingUser = null;
      
      // First try to find by email (primary method)
      if (email) {
        existingUser = existingUsers.find((u) => u.email === email);
        if (existingUser) {
          console.log(`🔄 Found existing user by email: ${email}`);
        }
      }
      
      // If not found by email, try by userId (fallback)
      if (!existingUser) {
        existingUser = existingUsers.find((u) => u.userId === userId);
        if (existingUser) {
          console.log(`🔄 Found existing user by userId: ${userId}`);
        }
      }

      if (existingUser) {
        // Update existing user with latest auth data
        existingUser.isActive = true;
        existingUser.lastUsed = Date.now();
        
        // Update userId if it changed (in case we found by email but userId is different)
        if (existingUser.userId !== userId) {
          console.log(`🔄 Updating userId: ${existingUser.userId} → ${userId}`);
          existingUser.userId = userId;
        }
        
        // Update email if it was missing or changed
        if (email && existingUser.email !== email) {
          console.log(`🔄 Updating email: ${existingUser.email || 'N/A'} → ${email}`);
          existingUser.email = email;
        }

        // Deactivate other users
        existingUsers.forEach((u) => {
          if (u.userId !== userId && u.email !== email) {
            u.isActive = false;
          }
        });

        fs.writeFileSync(
          this.usersConfigPath,
          JSON.stringify(existingUsers, null, 2),
        );
        console.log(`✅ Updated existing user: ${email || userId}`);
        return existingUser;
      } else {
        // Save as new user
        const newUser = this.saveUserAuth(authData, userId, false);
        console.log(`✅ Auto-saved new user: ${email || userId}`);
        return newUser;
      }
    } catch (error) {
      console.warn('Failed to auto-save current user:', error);
      return null;
    }
  }

  /**
   * Extract email from auth data
   */
  private extractEmailFromAuth(authData: Record<string, unknown>): string | null {
    // Try to decode JWT id_token to get email
    if (typeof authData.id_token === 'string') {
      try {
        // Parse JWT payload (base64 decode middle part)
        const parts = authData.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString(),
          );
          if (payload.email) return payload.email;
        }
      } catch (_error) {
        console.warn('Failed to parse id_token for email:', _error);
      }
    }

    // Try other methods
    if (typeof (authData.user as Record<string, string>)?.email === 'string')
      return (authData.user as Record<string, string>)?.email;
    if (typeof authData.email === 'string') return authData.email;

    return null;
  }

  /**
   * Extract user ID from auth data
   */
  private extractUserIdFromAuth(authData: Record<string, unknown>): string {
    // Try to decode JWT id_token to get user info
    if (typeof authData.id_token === 'string') {
      try {
        // Parse JWT payload (base64 decode middle part)
        const parts = authData.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString(),
          );
          if (payload.sub) return payload.sub; // Google user ID
          if (payload.email) return payload.email.split('@')[0];
        }
      } catch (_error) {
        console.warn('Failed to parse id_token:', _error);
      }
    }

    // Try other methods
    if (typeof (authData.user as Record<string, string>)?.id === 'string')
      return (authData.user as Record<string, string>)?.id;
    if (typeof authData.userId === 'string') return authData.userId;
    if (typeof (authData.user as Record<string, string>)?.email === 'string')
      return (authData.user as Record<string, string>)?.email.split('@')[0];
    if (typeof authData.email === 'string') return authData.email.split('@')[0];

    // Fallback to timestamp-based ID
    return `user_${Date.now()}`;
  }

  /**
   * Update the users list - find by email first, then by userId
   */
  private updateUserList(userInfo: UserAuthInfo): void {
    let usersList: UserAuthInfo[] = [];

    if (fs.existsSync(this.usersConfigPath)) {
      try {
        usersList = JSON.parse(fs.readFileSync(this.usersConfigPath, 'utf-8'));
      } catch (_error) {
        console.warn('Failed to parse users list, creating new one');
      }
    }

    // Find existing user by email first (primary), then by userId (fallback)
    let existingIndex = -1;
    
    // Try to find by email first
    if (userInfo.email) {
      existingIndex = usersList.findIndex((u) => u.email === userInfo.email);
    }
    
    // If not found by email, try by userId
    if (existingIndex === -1) {
      existingIndex = usersList.findIndex((u) => u.userId === userInfo.userId);
    }

    if (existingIndex >= 0) {
      // Update existing user, preserving any existing data but overriding with new info
      usersList[existingIndex] = { ...usersList[existingIndex], ...userInfo };
    } else {
      // Add as new user
      usersList.push(userInfo);
    }

    fs.writeFileSync(this.usersConfigPath, JSON.stringify(usersList, null, 2));
  }

  /**
   * Get all available users
   */
  getAllUsers(): UserAuthInfo[] {
    if (!fs.existsSync(this.usersConfigPath)) {
      return [];
    }

    try {
      return JSON.parse(fs.readFileSync(this.usersConfigPath, 'utf-8'));
    } catch (_error) {
      console.warn('Failed to load users list');
      return [];
    }
  }

  /**
   * Get current active user
   */
  getCurrentUser(): UserAuthInfo | null {
    const users = this.getAllUsers();
    const activeUser = users.find((u) => u.isActive);

    if (activeUser) {
      return activeUser;
    }

    // If no active user, return the most recently used one
    if (users.length > 0) {
      return users.sort((a, b) => b.lastUsed - a.lastUsed)[0];
    }

    return null;
  }

  /**
   * Find user by readable ID (email, display name) or user ID
   */
  private findUserByIdentifier(identifier: string): UserAuthInfo | null {
    const users = this.getAllUsers();
    
    // First try to find by readable ID (email or display name)
    let targetUser = users.find((u) => 
      u.readableId === identifier || 
      u.email === identifier || 
      u.displayName === identifier
    );
    
    // If not found, try by user ID
    if (!targetUser) {
      targetUser = users.find((u) => u.userId === identifier);
    }
    
    return targetUser || null;
  }

  /**
   * Get the auth file path for a user (prioritizing readable filename)
   */
  private getUserAuthFilePath(userInfo: UserAuthInfo): string {
    // Try readable filename first
    if (userInfo.readableId) {
      const readablePath = path.join(this.saveAuthDir, `${userInfo.readableId}.json`);
      if (fs.existsSync(readablePath)) {
        return readablePath;
      }
    }
    
    // Fallback to userId filename
    return path.join(this.saveAuthDir, `${userInfo.userId}.json`);
  }

  /**
   * Switch to specific user by readable ID or user ID
   */
  switchToUser(identifier: string): UserAuthInfo | null {
    // Find target user by identifier (readable ID, email, display name, or user ID)
    const targetUser = this.findUserByIdentifier(identifier);
    if (!targetUser) {
      console.error(`❌ User not found: ${identifier}`);
      return null;
    }

    // Get the saved auth data for this user
    const userAuthPath = this.getUserAuthFilePath(targetUser);
    if (!fs.existsSync(userAuthPath)) {
      console.error(`❌ Auth file not found for user: ${identifier}`);
      return null;
    }

    try {
      // Read the saved auth data
      const authData = JSON.parse(fs.readFileSync(userAuthPath, 'utf-8'));

      // Replace the current oauth_creds.json with this user's auth data
      fs.writeFileSync(this.currentAuthPath, JSON.stringify(authData, null, 2));

      // Get all users and update their states
      const users = this.getAllUsers();
      users.forEach((u) => (u.isActive = false));
      targetUser.isActive = true;
      targetUser.lastUsed = Date.now();

      // Save updated users list
      fs.writeFileSync(this.usersConfigPath, JSON.stringify(users, null, 2));

      const displayId = targetUser.readableId || targetUser.email || targetUser.displayName || targetUser.userId;
      console.log(
        `🔄 Switched to user: ${displayId} (${targetUser.email || 'No email'})`,
      );
      console.log(
        `✅ Replaced oauth_creds.json with user ${displayId}'s credentials`,
      );
      return targetUser;
    } catch (error) {
      console.error(`❌ Failed to switch to user ${identifier}:`, error);
      return null;
    }
  }

  /**
   * Get authentication data for specific user from save_auth directory
   */
  getUserAuth(identifier: string): Record<string, unknown> | null {
    // Find user by identifier
    const targetUser = this.findUserByIdentifier(identifier);
    if (!targetUser) {
      return null;
    }

    // Get the auth file path
    const userAuthPath = this.getUserAuthFilePath(targetUser);

    if (!fs.existsSync(userAuthPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(userAuthPath, 'utf-8'));
    } catch (_error) {
      console.warn(`Failed to load auth for user ${identifier}`);
      return null;
    }
  }

  /**
   * Record model usage and check for rate limiting
   */
  recordModelUsage(
    userId: string,
    model: string,
    success: boolean,
    rateLimited: boolean = false,
  ): void {
    const users = this.getAllUsers();
    const user = users.find((u) => u.userId === userId);

    if (!user) return;

    if (!user.modelUsage[model]) {
      user.modelUsage[model] = {
        requestCount: 0,
        lastRequestTime: 0,
        rateLimited: false,
      };
    }

    const usage = user.modelUsage[model];
    usage.requestCount += 1;
    usage.lastRequestTime = Date.now();

    if (rateLimited) {
      usage.rateLimited = true;
      usage.rateLimitedUntil = Date.now() + 60 * 60 * 1000; // 1 hour default
      console.log(`⚠️  User ${userId} rate limited for model ${model}`);
    }

    this.updateUserList(user);
  }

  /**
   * Get next available user and model combination
   */
  getNextAvailableUserAndModel(
    currentUserId?: string,
    currentModel?: string,
  ): {
    userId: string;
    model: string;
    authData: Record<string, unknown>;
  } | null {
    const users = this.getAllUsers().filter(
      (u) => this.getUserAuth(u.userId) !== null,
    );

    if (users.length === 0) {
      console.error('❌ No authenticated users available');
      return null;
    }

    const models = this.rotationConfig.modelPriority;

    // Find current position
    const _currentUserIndex = currentUserId
      ? users.findIndex((u) => u.userId === currentUserId)
      : -1;
    const _currentModelIndex = currentModel
      ? models.findIndex((m) => m === currentModel)
      : -1;

    // Try to find next available combination
    for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
      const model = models[modelIdx];

      for (let userIdx = 0; userIdx < users.length; userIdx++) {
        const user = users[userIdx];

        // Skip if this is current combination
        if (user.userId === currentUserId && model === currentModel) {
          continue;
        }

        // Check if this user/model combination is available (not rate limited)
        const usage = user.modelUsage[model];
        if (
          usage?.rateLimited &&
          usage.rateLimitedUntil &&
          Date.now() < usage.rateLimitedUntil
        ) {
          continue; // Skip rate limited combinations
        }

        const authData = this.getUserAuth(user.userId);
        if (authData) {
          console.log(`🔄 Rotating to user ${user.userId} with model ${model}`);
          return {
            userId: user.userId,
            model: model,
            authData: authData,
          };
        }
      }
    }

    console.warn(
      '⚠️  All user/model combinations are rate limited or unavailable',
    );
    return null;
  }

  /**
   * Migrate existing user files to use readable filenames
   */
  private migrateUserFiles(): void {
    if (!fs.existsSync(this.saveAuthDir)) {
      return;
    }

    const users = this.getAllUsers();
    
    users.forEach((user) => {
      // Skip if user already has readable ID or if it's already using email/name as filename
      if (user.readableId) {
        return;
      }

      const oldPath = path.join(this.saveAuthDir, `${user.userId}.json`);
      if (!fs.existsSync(oldPath)) {
        return;
      }

      // Determine new readable filename
      let newFileName = user.userId;
      if (user.email) {
        newFileName = user.email.replace(/[^a-zA-Z0-9@._-]/g, '_');
      } else if (user.displayName) {
        newFileName = user.displayName.replace(/[^a-zA-Z0-9._-]/g, '_');
      }

      // Only migrate if we have a different, more readable name
      if (newFileName !== user.userId) {
        const newPath = path.join(this.saveAuthDir, `${newFileName}.json`);
        
        // Avoid conflicts
        if (!fs.existsSync(newPath)) {
          try {
            fs.renameSync(oldPath, newPath);
            
            // Update user info with readable ID
            user.readableId = newFileName;
            this.updateUserList(user);
            
            console.log(`📂 Migrated user file: ${user.userId} → ${newFileName}`);
          } catch (error) {
            console.warn(`Failed to migrate user file for ${user.userId}:`, error);
          }
        }
      }
    });
  }

  /**
   * List all users with their status
   */
  listUsers(): void {
    // Migrate existing files before listing
    this.migrateUserFiles();
    const users = this.getAllUsers();

    if (users.length === 0) {
      console.log('No authenticated users found');
      return;
    }

    console.log('\n📋 Available Users:');
    console.log('==================');

    users.forEach((user, index) => {
      const status = user.isActive ? '🟢 ACTIVE' : '⚪ Inactive';
      const lastUsed = new Date(user.lastUsed).toLocaleString();
      
      // Use readable ID as primary identifier, show email and user ID as additional info
      const primaryId = user.readableId || user.email || user.displayName || user.userId;
      const additionalInfo = [];
      
      if (user.email && user.email !== primaryId) {
        additionalInfo.push(user.email);
      }
      if (user.displayName && user.displayName !== primaryId) {
        additionalInfo.push(`Name: ${user.displayName}`);
      }
      if (user.userId !== primaryId) {
        additionalInfo.push(`ID: ${user.userId}`);
      }
      
      const infoString = additionalInfo.length > 0 ? ` (${additionalInfo.join(', ')})` : '';

      console.log(`${index + 1}. ${status} ${primaryId}${infoString}`);
      console.log(`   Last used: ${lastUsed}`);

      // Show model usage
      if (Object.keys(user.modelUsage).length > 0) {
        console.log('   Model usage:');
        Object.entries(user.modelUsage).forEach(([model, usage]) => {
          const rateLimitStatus = usage.rateLimited ? ' (RATE LIMITED)' : '';
          console.log(
            `     - ${model}: ${usage.requestCount} requests${rateLimitStatus}`,
          );
        });
      }
      console.log('');
    });
  }
}

// Global instance
export const userAuthManager = new UserAuthManager();
