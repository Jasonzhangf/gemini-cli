/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, ContentGenerator } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer, HttpOptions } from './server.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
  authType: AuthType,
  sessionId?: string,
  forceAccountSelection?: boolean,
): Promise<ContentGenerator> {
  if (authType === AuthType.LOGIN_WITH_GOOGLE) {
    const authClient = await getOauthClient(forceAccountSelection);
    const projectId = await setupUser(authClient);
    
    // Auto-save authenticated user after successful OAuth login
    // This handles both --newid and regular OAuth login cases
    try {
      const { userAuthManager } = await import('../config/userAuth.js');
      const savedUser = userAuthManager.autoSaveCurrentUser();
      if (savedUser) {
        if (forceAccountSelection) {
          console.log(`✅ Auto-saved user after account selection: ${savedUser.email || savedUser.userId}`);
        } else {
          console.log(`✅ Auto-saved current user: ${savedUser.email || savedUser.userId}`);
        }
      }
    } catch (error) {
      console.warn('Failed to auto-save user after OAuth login:', error);
    }
    
    return new CodeAssistServer(authClient, projectId, httpOptions, sessionId);
  }

  throw new Error(`Unsupported authType: ${authType}`);
}
