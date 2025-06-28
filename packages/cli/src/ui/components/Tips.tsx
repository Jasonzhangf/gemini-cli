/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config, getHijackInfo } from '@fanzhang/gemini-cli-core-hijack';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  const hijackInfo = getHijackInfo();

  return (
    <Box flexDirection="column" marginBottom={1}>
      {hijackInfo.enabled && (
        <Box
          flexDirection="column"
          marginBottom={1}
          paddingX={1}
          borderStyle="round"
          borderColor="yellow"
        >
          <Text color="yellow" bold>
            🔄 Model Hijack Active
          </Text>
          <Text color={Colors.Foreground}>
            📍 {hijackInfo.targetModel} → {hijackInfo.actualModel}
          </Text>
          <Text color={Colors.Foreground}>
            🔗 Endpoint: {hijackInfo.endpoint}
          </Text>
          <Text color="green">✅ Configuration loaded from ~/.gemini/.env</Text>
        </Box>
      )}

      <Text color={Colors.Foreground}>Tips for getting started:</Text>
      <Text color={Colors.Foreground}>
        1. Ask questions, edit files, or run commands.
      </Text>
      <Text color={Colors.Foreground}>
        2. Be specific for the best results.
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={Colors.Foreground}>
          3. Create{' '}
          <Text bold color={Colors.AccentPurple}>
            GEMINI.md
          </Text>{' '}
          files to customize your interactions with Gemini.
        </Text>
      )}
      <Text color={Colors.Foreground}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        for more information.
      </Text>
    </Box>
  );
};
