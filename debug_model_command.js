#!/usr/bin/env node

// Simple debug script to test the model command loading
import { CommandService } from './packages/cli/dist/src/services/CommandService.js';

console.log('Testing CommandService...');

const service = new CommandService();
await service.loadCommands();
const commands = service.getCommands();

console.log('Loaded commands:', commands.map(c => c.name));

const modelCommand = commands.find(c => c.name === 'model');
if (modelCommand) {
  console.log('✅ Model command found:', modelCommand.name);
  console.log('Description:', modelCommand.description);
  console.log('Has action:', !!modelCommand.action);
  console.log('Has subCommands:', !!modelCommand.subCommands);
  if (modelCommand.subCommands) {
    console.log('Subcommands:', modelCommand.subCommands.map(sc => sc.name));
  }
} else {
  console.log('❌ Model command NOT found');
}