#!/usr/bin/env node

// Debug script to test the slash command processor
import { renderHook } from '@testing-library/react';
import { useSlashCommandProcessor } from './packages/cli/dist/src/ui/hooks/slashCommandProcessor.js';

// Create mock dependencies
const mockConfig = {
  getProjectRoot: () => '/test',
  getSessionId: () => 'test-session',
  getDebugMode: () => false,
  getGeminiClient: () => ({ tryCompressChat: () => Promise.resolve(null) }),
  getOpenAIMode: () => false,
  getModel: () => 'test-model'
};

const mockSettings = {
  merged: { contextFileName: 'GEMINI.md' }
};

const mockAddItem = () => {};
const mockClearItems = () => {};
const mockLoadHistory = () => {};
const mockRefreshStatic = () => {};
const mockSetShowHelp = () => {};
const mockOnDebugMessage = () => {};
const mockOpenThemeDialog = () => {};
const mockOpenAuthDialog = () => {};
const mockOpenEditorDialog = () => {};
const mockToggleCorgiMode = () => {};
const mockSetQuittingMessages = () => {};
const mockOpenPrivacyNotice = () => {};

console.log('Testing useSlashCommandProcessor...');

try {
  const { result } = renderHook(() =>
    useSlashCommandProcessor(
      mockConfig,
      mockSettings,
      [],
      mockAddItem,
      mockClearItems,
      mockLoadHistory,
      mockRefreshStatic,
      mockSetShowHelp,
      mockOnDebugMessage,
      mockOpenThemeDialog,
      mockOpenAuthDialog,
      mockOpenEditorDialog,
      mockToggleCorgiMode,
      false,
      mockSetQuittingMessages,
      mockOpenPrivacyNotice,
    )
  );

  console.log('Available commands from processor:', result.current.slashCommands.map(c => c.name));
  
  const modelCommand = result.current.slashCommands.find(c => c.name === 'model');
  if (modelCommand) {
    console.log('✅ Model command found in processor');
  } else {
    console.log('❌ Model command NOT found in processor');
  }
} catch (error) {
  console.error('Error testing processor:', error);
}