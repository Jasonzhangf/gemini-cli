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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TTYSessionManager } from './TTYSessionManager';
import { TerminalSecurityPolicy } from './types';

describe('TTYSessionManager', () => {
  let sessionManager: TTYSessionManager;
  let securityPolicy: TerminalSecurityPolicy;

  beforeEach(() => {
    securityPolicy = {
      allowFileAccess: true,
      allowNetworkAccess: true,
      allowSystemModification: false,
      maxSessionDuration: 60000, // 1 minute for testing
      requireAuthentication: false,
    };

    sessionManager = new TTYSessionManager(securityPolicy);
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  describe('Session Creation', () => {
    it('should create a new session', async () => {
      const sessionId = await sessionManager.createSession('user1', '/test/path');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.userId).toBe('user1');
      expect(session?.projectPath).toBe('/test/path');
      expect(session?.isActive).toBe(true);
    });

    it('should create session with default dimensions', async () => {
      const sessionId = await sessionManager.createSession();
      const session = sessionManager.getSession(sessionId);

      expect(session?.dimensions).toEqual({ columns: 80, rows: 24 });
    });

    it('should create session with custom dimensions', async () => {
      const dimensions = { columns: 120, rows: 30 };
      const sessionId = await sessionManager.createSession('user1', '/test', dimensions);
      const session = sessionManager.getSession(sessionId);

      expect(session?.dimensions).toEqual(dimensions);
    });

    it('should emit sessionCreated event', async () => {
      const eventHandler = vi.fn();
      sessionManager.on('sessionCreated', eventHandler);

      const sessionId = await sessionManager.createSession('user1');

      expect(eventHandler).toHaveBeenCalledWith({
        sessionId,
        session: expect.objectContaining({ id: sessionId }),
        context: expect.objectContaining({ sessionId }),
      });
    });

    it('should create virtualizer and context for session', async () => {
      const sessionId = await sessionManager.createSession('user1', '/test/path');

      const virtualizer = sessionManager.getVirtualizer(sessionId);
      const context = sessionManager.getContext(sessionId);
      const metrics = sessionManager.getMetrics(sessionId);

      expect(virtualizer).toBeDefined();
      expect(context).toBeDefined();
      expect(metrics).toBeDefined();
      expect(context?.workingDirectory).toBe('/test/path');
    });
  });

  describe('Session Management', () => {
    let sessionId: string;

    beforeEach(async () => {
      sessionId = await sessionManager.createSession('user1', '/test/path');
    });

    it('should update session activity', () => {
      const session = sessionManager.getSession(sessionId);
      const originalActivity = session?.lastActivity;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        sessionManager.updateActivity(sessionId);
        const updatedSession = sessionManager.getSession(sessionId);
        expect(updatedSession?.lastActivity.getTime()).toBeGreaterThan(
          originalActivity?.getTime() || 0
        );
      }, 10);
    });

    it('should resize session', () => {
      const newDimensions = { columns: 100, rows: 25 };
      const result = sessionManager.resizeSession(sessionId, newDimensions);

      expect(result).toBe(true);

      const session = sessionManager.getSession(sessionId);
      const virtualizer = sessionManager.getVirtualizer(sessionId);

      expect(session?.dimensions).toEqual(newDimensions);
      expect(virtualizer?.getDimensions()).toEqual(newDimensions);
    });

    it('should emit sessionResized event', () => {
      const eventHandler = vi.fn();
      sessionManager.on('sessionResized', eventHandler);

      const newDimensions = { columns: 100, rows: 25 };
      sessionManager.resizeSession(sessionId, newDimensions);

      expect(eventHandler).toHaveBeenCalledWith({
        sessionId,
        dimensions: newDimensions,
      });
    });

    it('should send input to session', () => {
      const result = sessionManager.sendInput(sessionId, 'test command\n');
      expect(result).toBe(true);

      const metrics = sessionManager.getMetrics(sessionId);
      expect(metrics?.commandsExecuted).toBe(1);
      expect(metrics?.lastCommand).toBe('test command');
    });

    it('should reject invalid input based on security policy', () => {
      // Create session manager with blocked commands
      const restrictivePolicy: TerminalSecurityPolicy = {
        ...securityPolicy,
        blockedCommands: ['rm', 'sudo'],
      };
      const restrictiveManager = new TTYSessionManager(restrictivePolicy);

      restrictiveManager.createSession('user1').then((restrictiveSessionId) => {
        const eventHandler = vi.fn();
        restrictiveManager.on('inputRejected', eventHandler);

        const result = restrictiveManager.sendInput(restrictiveSessionId, 'rm -rf /');
        expect(result).toBe(false);
        expect(eventHandler).toHaveBeenCalledWith({
          sessionId: restrictiveSessionId,
          input: 'rm -rf /',
          reason: 'Security policy violation',
        });

        restrictiveManager.destroy();
      });
    });

    it('should close session', async () => {
      const result = await sessionManager.closeSession(sessionId);
      expect(result).toBe(true);

      const session = sessionManager.getSession(sessionId);
      expect(session).toBeUndefined();

      const virtualizer = sessionManager.getVirtualizer(sessionId);
      expect(virtualizer).toBeUndefined();
    });

    it('should emit sessionClosed event', async () => {
      const eventHandler = vi.fn();
      sessionManager.on('sessionClosed', eventHandler);

      await sessionManager.closeSession(sessionId);

      expect(eventHandler).toHaveBeenCalledWith({
        sessionId,
        session: expect.objectContaining({ id: sessionId }),
      });
    });
  });

  describe('Session Listing and Statistics', () => {
    it('should list all active sessions', async () => {
      const sessionId1 = await sessionManager.createSession('user1');
      const sessionId2 = await sessionManager.createSession('user2');

      const sessions = sessionManager.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain(sessionId1);
      expect(sessions.map(s => s.id)).toContain(sessionId2);
    });

    it('should list sessions for specific user', async () => {
      await sessionManager.createSession('user1');
      await sessionManager.createSession('user2');
      await sessionManager.createSession('user1');

      const user1Sessions = sessionManager.listSessions('user1');
      const user2Sessions = sessionManager.listSessions('user2');

      expect(user1Sessions).toHaveLength(2);
      expect(user2Sessions).toHaveLength(1);
      expect(user1Sessions.every(s => s.userId === 'user1')).toBe(true);
      expect(user2Sessions.every(s => s.userId === 'user2')).toBe(true);
    });

    it('should provide session statistics', async () => {
      const sessionId1 = await sessionManager.createSession('user1');
      const sessionId2 = await sessionManager.createSession('user2');

      // Send some input to generate metrics
      sessionManager.sendInput(sessionId1, 'command1\n');
      sessionManager.sendInput(sessionId2, 'command2\n');

      const stats = sessionManager.getSessionStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.totalCommandsExecuted).toBe(2);
      expect(stats.totalBytesTransferred).toBeGreaterThan(0);
    });
  });

  describe('Security and Validation', () => {
    it('should validate input against allowed commands', async () => {
      const restrictivePolicy: TerminalSecurityPolicy = {
        ...securityPolicy,
        allowedCommands: ['ls', 'pwd', 'echo'],
      };
      const restrictiveManager = new TTYSessionManager(restrictivePolicy);

      const sessionId = await restrictiveManager.createSession('user1');

      // Allowed command should work
      const result1 = restrictiveManager.sendInput(sessionId, 'ls -la\n');
      expect(result1).toBe(true);

      // Blocked command should fail
      const result2 = restrictiveManager.sendInput(sessionId, 'rm file.txt\n');
      expect(result2).toBe(false);

      restrictiveManager.destroy();
    });

    it('should handle authentication requirements', () => {
      const authPolicy: TerminalSecurityPolicy = {
        ...securityPolicy,
        requireAuthentication: true,
      };
      const authManager = new TTYSessionManager(authPolicy);

      // This would typically integrate with an authentication system
      // For now, we just verify the policy is stored
      expect((authManager as any).securityPolicy.requireAuthentication).toBe(true);

      authManager.destroy();
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup expired sessions', async () => {
      // Create session manager with very short session duration
      const shortDurationPolicy: TerminalSecurityPolicy = {
        ...securityPolicy,
        maxSessionDuration: 100, // 100ms
      };
      const shortDurationManager = new TTYSessionManager(shortDurationPolicy);

      const sessionId = await shortDurationManager.createSession('user1');
      expect(shortDurationManager.getSession(sessionId)).toBeDefined();

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 200));

      // Trigger cleanup manually (normally done by interval)
      (shortDurationManager as any).cleanupExpiredSessions();

      expect(shortDurationManager.getSession(sessionId)).toBeUndefined();

      shortDurationManager.destroy();
    });

    it('should emit sessionsExpired event', async () => {
      const shortDurationManager = new TTYSessionManager({
        ...securityPolicy,
        maxSessionDuration: 50,
      });

      const eventHandler = vi.fn();
      shortDurationManager.on('sessionsExpired', eventHandler);

      await shortDurationManager.createSession('user1');
      await new Promise(resolve => setTimeout(resolve, 100));

      (shortDurationManager as any).cleanupExpiredSessions();

      expect(eventHandler).toHaveBeenCalledWith({
        count: 1,
        sessionIds: expect.arrayContaining([expect.any(String)]),
      });

      shortDurationManager.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session IDs gracefully', () => {
      const invalidSessionId = 'invalid-session-id';

      expect(sessionManager.getSession(invalidSessionId)).toBeUndefined();
      expect(sessionManager.getVirtualizer(invalidSessionId)).toBeUndefined();
      expect(sessionManager.getContext(invalidSessionId)).toBeUndefined();
      expect(sessionManager.getMetrics(invalidSessionId)).toBeUndefined();

      expect(sessionManager.sendInput(invalidSessionId, 'test')).toBe(false);
      expect(sessionManager.resizeSession(invalidSessionId, { columns: 80, rows: 24 })).toBe(false);
    });

    it('should handle session close for non-existent session', async () => {
      const result = await sessionManager.closeSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Resource Management', () => {
    it('should cleanup all resources on destroy', async () => {
      const sessionId1 = await sessionManager.createSession('user1');
      const sessionId2 = await sessionManager.createSession('user2');

      expect(sessionManager.listSessions()).toHaveLength(2);

      sessionManager.destroy();

      // After destroy, all sessions should be closed
      expect(sessionManager.listSessions()).toHaveLength(0);
    });
  });
});