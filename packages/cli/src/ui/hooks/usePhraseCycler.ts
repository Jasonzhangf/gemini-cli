/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { type Config } from '@google/gemini-cli-core';

export const WITTY_LOADING_PHRASES = [
  "I'm Feeling Lucky",
  'Shipping awesomeness... ',
  'Painting the serifs back on...',
  'Navigating the slime mold...',
  'Consulting the digital spirits...',
  'Reticulating splines...',
  'Warming up the AI hamsters...',
  'Asking the magic conch shell...',
  'Generating witty retort...',
  'Polishing the algorithms...',
  "Don't rush perfection (or my code)...",
  'Brewing fresh bytes...',
  'Counting electrons...',
  'Engaging cognitive processors...',
  'Checking for syntax errors in the universe...',
  'One moment, optimizing humor...',
  'Shuffling punchlines...',
  'Untangling neural nets...',
  'Compiling brilliance...',
  'Loading wit.exe...',
  'Summoning the cloud of wisdom...',
  'Preparing a witty response...',
  "Just a sec, I'm debugging reality...",
  'Confuzzling the options...',
  'Tuning the cosmic frequencies...',
  'Crafting a response worthy of your patience...',
  'Compiling the 1s and 0s...',
  'Resolving dependencies... and existential crises...',
  'Defragmenting memories... both RAM and personal...',
  'Rebooting the humor module...',
  'Caching the essentials (mostly cat memes)...',
  'Running sudo make me a sandwich...',
  'Optimizing for ludicrous speed',
  "Swapping bits... don't tell the bytes...",
  'Garbage collecting... be right back...',
  'Assembling the interwebs...',
  'Converting coffee into code...',
  'Pushing to production (and hoping for the best)...',
  'Updating the syntax for reality...',
  'Rewiring the synapses...',
  'Looking for a misplaced semicolon...',
  "Greasin' the cogs of the machine...",
  'Pre-heating the servers...',
  'Calibrating the flux capacitor...',
  'Engaging the improbability drive...',
  'Channeling the Force...',
  'Aligning the stars for optimal response...',
  'So say we all...',
  'Loading the next great idea...',
  "Just a moment, I'm in the zone...",
  'Preparing to dazzle you with brilliance...',
  "Just a tick, I'm polishing my wit...",
  "Hold tight, I'm crafting a masterpiece...",
  "Just a jiffy, I'm debugging the universe...",
  "Just a moment, I'm aligning the pixels...",
  "Just a sec, I'm optimizing the humor...",
  "Just a moment, I'm tuning the algorithms...",
  'Warp speed engaged...',
  'Mining for more Dilithium crystals...',
  "I'm Giving Her all she's got Captain!",
  "Don't panic...",
  'Following the white rabbit...',
  'The truth is in here... somewhere...',
  'Blowing on the cartridge...',
  'Looking for the princess in another castle...',
  'Loading... Do a barrel roll!',
  'Waiting for the respawn...',
  'Finishing the Kessel Run in less than 12 parsecs...',
  "The cake is not a lie, it's just still loading...",
  'Fiddling with the character creation screen...',
  "Just a moment, I'm finding the right meme...",
  "Pressing 'A' to continue...",
  'Herding digital cats...',
  'Polishing the pixels...',
  'Finding a suitable loading screen pun...',
  'Distracting you with this witty phrase...',
  'Almost there... probably...',
  'Our hamsters are working as fast as they can...',
  'Giving Cloudy a pat on the head...',
  'Petting the cat...',
  'Rickrolling my boss...',
  'Never gonna give you up, never gonna let you down...',
  'Slapping the bass...',
  'Tasting the snozberries...',
  "I'm going the distance, I'm going for speed...",
  'Is this the real life? Is this just fantasy?...',
  "I've got a good feeling about this...",
  'Poking the bear...',
  'Doing research on the latest memes...',
  'Figuring out how to make this more witty...',
  'Hmmm... let me think...',
  'What do you call a fish with no eyes? A fsh...',
  'Why did the computer go to therapy? It had too many bytes...',
  "Why don't programmers like nature? It has too many bugs...",
  'Why do programmers prefer dark mode? Because light attracts bugs...',
  'Why did the developer go broke? Because he used up all his cache...',
  "What can you do with a broken pencil? Nothing, it's pointless...",
  'Applying percussive maintenance...',
  'Searching for the correct USB orientation...',
  'Ensuring the magic smoke stays inside the wires...',
  'Rewriting in Rust for no particular reason...',
  'Trying to exit Vim...',
  'Spinning up the hamster wheel...',
  "That's not a bug, it's an undocumented feature...",
  'Engage.',
  "I'll be back... with an answer.",
  'My other process is a TARDIS...',
  'Communing with the machine spirit...',
  'Letting the thoughts marinate...',
  'Just remembered where I put my keys...',
  'Pondering the orb...',
  "I've seen things you people wouldn't believe... like a user who reads loading messages.",
  'Initiating thoughtful gaze...',
  "What's a computer's favorite snack? Microchips.",
  "Why do Java developers wear glasses? Because they don't C#.",
  'Charging the laser... pew pew!',
  'Dividing by zero... just kidding!',
  'Looking for an adult superviso... I mean, processing.',
  'Making it go beep boop.',
  'Buffering... because even AIs need a moment.',
  'Entangling quantum particles for a faster response...',
  'Polishing the chrome... on the algorithms.',
  'Are you not entertained? (Working on it!)',
  'Summoning the code gremlins... to help, of course.',
  'Just waiting for the dial-up tone to finish...',
  'Recalibrating the humor-o-meter.',
  'My other loading screen is even funnier.',
  "Pretty sure there's a cat walking on the keyboard somewhere...",
  'Enhancing... Enhancing... Still loading.',
  "It's not a bug, it's a feature... of this loading screen.",
  'Have you tried turning it off and on again? (The loading screen, not me.)',
];

export const PHRASE_CHANGE_INTERVAL_MS = 5000; // Reduced from 15s to 5s for more responsive status updates

/**
 * Generate current status description based on system state
 */
const generateStatusDescription = (config?: Config): string => {
  if (!config) {
    return 'Initializing system...';
  }

  try {
    const contextManager = config.getContextManager();
    const isInMaintenanceMode = contextManager?.isInMaintenanceMode();
    
    if (isInMaintenanceMode) {
      const currentTask = contextManager?.getCurrentTask();
      if (currentTask) {
        const taskDescription = currentTask.description.length > 30 
          ? currentTask.description.substring(0, 27) + '...' 
          : currentTask.description;
        
        // Add status indicator based on task status
        const statusIcon = currentTask.status === 'in_progress' ? '🔄' : '⏳';
        return `${statusIcon} Task: ${taskDescription}`;
      } else {
        return '✅ All tasks completed - ready for new work';
      }
    }

    // Check various system states for more specific status
    const debugMode = config.getDebugMode();
    
    // Check RAG system status if available
    let ragStatus: { initialized: boolean; initializing: boolean } | null = null;
    try {
      const contextAgent = config.getContextAgent();
      if (contextAgent && typeof contextAgent.getRagStatus === 'function') {
        ragStatus = contextAgent.getRagStatus();
      }
    } catch (error) {
      // Ignore errors accessing contextAgent
    }
    
    // Show RAG status if available
    if (ragStatus) {
      if (ragStatus.initializing) {
        return '🔄 RAG system initializing in background...';
      } else if (ragStatus.initialized) {
        // RAG is ready, show normal processing messages
      } else {
        // RAG failed to initialize, still functional with fallback
      }
    }
    
    // Create rotating status messages that give insight into what's happening
    const currentTime = Date.now();
    const rotationIndex = Math.floor(currentTime / 3000) % 6; // Change every 3 seconds
    
    const statusMessages = [
      '🧠 Analyzing context and patterns...',
      '🔍 Processing your request...',
      '⚡ Consulting knowledge systems...',
      '🎯 Preparing intelligent response...',
      '📊 Optimizing solution approach...',
      debugMode ? '🐛 Debug mode: Enhanced logging active' : '✨ Generating response...',
    ];
    
    return statusMessages[rotationIndex];
  } catch (error) {
    return '⚙️ Processing your request...';
  }
};

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @param config Optional config object for status-based messages.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (isActive: boolean, isWaiting: boolean, config?: Config) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isWaiting) {
      setCurrentLoadingPhrase('Waiting for user confirmation...');
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    } else if (isActive) {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
      }
      
      // Check if user wants status-based phrases
      const useStatusBasedPhrases = config?.getAccessibility()?.useStatusBasedPhrases ?? true; // Default to status-based
      
      if (useStatusBasedPhrases) {
        // Set initial status-based phrase
        setCurrentLoadingPhrase(generateStatusDescription(config));

        phraseIntervalRef.current = setInterval(() => {
          // Update with current status description
          setCurrentLoadingPhrase(generateStatusDescription(config));
        }, PHRASE_CHANGE_INTERVAL_MS);
      } else {
        // Use traditional witty phrases
        const initialRandomIndex = Math.floor(
          Math.random() * WITTY_LOADING_PHRASES.length,
        );
        setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[initialRandomIndex]);

        phraseIntervalRef.current = setInterval(() => {
          const randomIndex = Math.floor(
            Math.random() * WITTY_LOADING_PHRASES.length,
          );
          setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[randomIndex]);
        }, 15000); // Keep original 15s interval for witty phrases
      }
    } else {
      // Idle or other states, clear the phrase interval
      // and reset to a default phrase for next active state.
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      const useStatusBasedPhrases = config?.getAccessibility()?.useStatusBasedPhrases ?? true;
      setCurrentLoadingPhrase(useStatusBasedPhrases ? '💬 Ready to assist...' : WITTY_LOADING_PHRASES[0]);
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting, config]);

  return currentLoadingPhrase;
};
