/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { TTYVirtualizer } from './TTYVirtualizer';
import { 
  TerminalSession, 
  TerminalContext, 
  TerminalSecurityPolicy,
  TerminalMetrics 
} from './types';

/**
 * TTY Session Manager handles multiple terminal sessions
 * with security, monitoring, and lifecycle management
 */
export class TTYSessionManager extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private virtualizers: Map<string, TTYVirtualizer> = new Map();
  private contexts: Map<string, TerminalContext> = new Map();
  private metrics: Map<string, TerminalMetrics> = new Map();
  private securityPolicy: TerminalSecurityPolicy;
  private cleanupInterval: NodeJS.Timeout;

  constructor(securityPolicy: Partial<TerminalSecurityPolicy> = {}) {
    super();
    
    this.securityPolicy = {
      allowFileAccess: true,
      allowNetworkAccess: true,
      allowSystemModification: false,
      maxSessionDuration: 24 * 60 * 60 * 1000, // 24 hours
      requireAuthentication: true,
      ...securityPolicy,
    };

    // Start cleanup interval for expired sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Check every minute
  }

  /**
   * Create a new terminal session
   */
  public async createSession(
    userId?: string,
    projectPath?: string,
    dimensions: { columns: number; rows: number } = { columns: 80, rows: 24 }
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date();

    // Create session
    const session: TerminalSession = {
      id: sessionId,
      userId,
      projectPath,
      createdAt: now,
      lastActivity: now,
      isActive: true,
      dimensions,
    };

    // Create TTY virtualizer
    const virtualizer = new TTYVirtualizer({
      columns: dimensions.columns,
      rows: dimensions.rows,
      enableColors: true,
      bufferSize: 1000,
    });

    // Create context
    const context: TerminalContext = {
      sessionId,
      workingDirectory: projectPath || process.cwd(),
      environment: Object.fromEntries(
        Object.entries(process.env).filter(([, value]) => value !== undefined)
      ) as Record<string, string>,
      user: {
        id: userId,
        permissions: this.getUserPermissions(userId),
      },
    };

    // Initialize metrics
    const metrics: TerminalMetrics = {
      sessionId,
      commandsExecuted: 0,
      bytesTransferred: 0,
      uptime: 0,
      errorCount: 0,
    };

    // Store all components
    this.sessions.set(sessionId, session);
    this.virtualizers.set(sessionId, virtualizer);
    this.contexts.set(sessionId, context);
    this.metrics.set(sessionId, metrics);

    // Set up virtualizer event handlers
    this.setupVirtualizerEvents(sessionId, virtualizer);

    this.emit('sessionCreated', { sessionId, session, context });
    return sessionId;
  }

  /**
   * Get a terminal session by ID
   */
  public getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get TTY virtualizer for a session
   */
  public getVirtualizer(sessionId: string): TTYVirtualizer | undefined {
    return this.virtualizers.get(sessionId);
  }

  /**
   * Get terminal context for a session
   */
  public getContext(sessionId: string): TerminalContext | undefined {
    return this.contexts.get(sessionId);
  }

  /**
   * Get metrics for a session
   */
  public getMetrics(sessionId: string): TerminalMetrics | undefined {
    return this.metrics.get(sessionId);
  }

  /**
   * Update session activity timestamp
   */
  public updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Resize terminal session
   */
  public resizeSession(
    sessionId: string, 
    dimensions: { columns: number; rows: number }
  ): boolean {
    const session = this.sessions.get(sessionId);
    const virtualizer = this.virtualizers.get(sessionId);

    if (session && virtualizer) {
      session.dimensions = dimensions;
      virtualizer.setDimensions(dimensions.columns, dimensions.rows);
      this.sessions.set(sessionId, session);
      this.updateActivity(sessionId);
      
      this.emit('sessionResized', { sessionId, dimensions });
      return true;
    }

    return false;
  }

  /**
   * Send input to a terminal session
   */
  public sendInput(sessionId: string, input: string): boolean {
    const virtualizer = this.virtualizers.get(sessionId);
    const metrics = this.metrics.get(sessionId);

    if (virtualizer && metrics) {
      try {
        // Validate input based on security policy
        if (!this.validateInput(sessionId, input)) {
          this.emit('inputRejected', { sessionId, input, reason: 'Security policy violation' });
          return false;
        }

        // Send to virtualizer
        const inputStream = virtualizer.getInputStream();
        inputStream.write(input);

        // Update metrics
        metrics.bytesTransferred += Buffer.byteLength(input);
        if (input.trim()) {
          metrics.commandsExecuted++;
          metrics.lastCommand = input.trim();
          metrics.lastCommandTime = new Date();
        }

        this.updateActivity(sessionId);
        this.emit('inputSent', { sessionId, input });
        return true;
      } catch (error) {
        const metricsData = this.metrics.get(sessionId);
        if (metricsData) {
          metricsData.errorCount++;
        }
        this.emit('inputError', { sessionId, input, error });
        return false;
      }
    }

    return false;
  }

  /**
   * Close a terminal session
   */
  public async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.isActive = false;
      
      // Clean up resources
      const virtualizer = this.virtualizers.get(sessionId);
      if (virtualizer) {
        virtualizer.removeAllListeners();
      }

      // Remove from maps
      this.sessions.delete(sessionId);
      this.virtualizers.delete(sessionId);
      this.contexts.delete(sessionId);
      this.metrics.delete(sessionId);

      this.emit('sessionClosed', { sessionId, session });
      return true;
    }

    return false;
  }

  /**
   * List all active sessions
   */
  public listSessions(userId?: string): TerminalSession[] {
    const sessions = Array.from(this.sessions.values());
    
    if (userId) {
      return sessions.filter(session => session.userId === userId && session.isActive);
    }
    
    return sessions.filter(session => session.isActive);
  }

  /**
   * Get session statistics
   */
  public getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalBytesTransferred: number;
    totalCommandsExecuted: number;
  } {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.isActive);
    const allMetrics = Array.from(this.metrics.values());

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      totalBytesTransferred: allMetrics.reduce((sum, m) => sum + m.bytesTransferred, 0),
      totalCommandsExecuted: allMetrics.reduce((sum, m) => sum + m.commandsExecuted, 0),
    };
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now - session.createdAt.getTime();
      const inactivityTime = now - session.lastActivity.getTime();

      // Check if session has expired
      if (sessionAge > this.securityPolicy.maxSessionDuration || 
          inactivityTime > 30 * 60 * 1000) { // 30 minutes of inactivity
        expiredSessions.push(sessionId);
      }
    }

    // Close expired sessions
    for (const sessionId of expiredSessions) {
      this.closeSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.emit('sessionsExpired', { count: expiredSessions.length, sessionIds: expiredSessions });
    }
  }

  /**
   * Set up event handlers for a virtualizer
   */
  private setupVirtualizerEvents(sessionId: string, virtualizer: TTYVirtualizer): void {
    virtualizer.on('output', (outputs) => {
      const metrics = this.metrics.get(sessionId);
      if (metrics) {
        const totalBytes = outputs.reduce((sum: number, output: any) => sum + Buffer.byteLength(output.content), 0);
        metrics.bytesTransferred += totalBytes;
      }
      
      this.updateActivity(sessionId);
      this.emit('sessionOutput', { sessionId, outputs });
    });

    virtualizer.on('input', (input) => {
      this.emit('sessionInput', { sessionId, input });
    });

    virtualizer.on('resize', (dimensions) => {
      this.emit('sessionResized', { sessionId, dimensions });
    });
  }

  /**
   * Validate input based on security policy
   */
  private validateInput(sessionId: string, input: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    // Check blocked commands
    if (this.securityPolicy.blockedCommands) {
      const command = input.trim().split(' ')[0];
      if (this.securityPolicy.blockedCommands.includes(command)) {
        return false;
      }
    }

    // Check allowed commands (if specified)
    if (this.securityPolicy.allowedCommands) {
      const command = input.trim().split(' ')[0];
      if (!this.securityPolicy.allowedCommands.includes(command)) {
        return false;
      }
    }

    // Additional security checks can be added here
    return true;
  }

  /**
   * Get user permissions (placeholder for actual implementation)
   */
  private getUserPermissions(userId?: string): string[] {
    // This would typically integrate with an authentication system
    return userId ? ['read', 'write', 'execute'] : ['read'];
  }

  /**
   * Cleanup resources on shutdown
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      this.closeSession(sessionId);
    }

    this.removeAllListeners();
  }
}