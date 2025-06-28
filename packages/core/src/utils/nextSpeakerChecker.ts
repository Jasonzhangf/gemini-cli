/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, SchemaUnion, Type } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { GeminiChat } from '../core/geminiChat.js';
import { isFunctionResponse } from './messageInspectors.js';

const CHECK_PROMPT = `Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the 'user' or the 'model' (you).
**Decision Rules (apply in order):**
1.  **After Tool Execution:** If the conversation history shows that a tool was just executed and provided results (tool output, file content, command results, etc.), then the **'model'** should speak next to process and respond to that information, regardless of what your last response said about next_speaker.
2.  **Model Continues:** If your last response explicitly states an immediate next action *you* intend to take (e.g., "I'll help you...", "Let me...", "I will...", "Now I'll process...", "Moving on to analyze...", indicates a commitment to perform a task that requires tool execution), OR if the response seems clearly incomplete (cut off mid-thought without a natural conclusion), then the **'model'** should speak next.
3.  **Question to User:** If your last response ends with a direct question specifically addressed *to the user*, then the **'user'** should speak next.
4.  **Waiting for User:** If your last response completed a thought, statement, or task *and* does not meet the criteria for Rules 1-3, it implies a pause expecting user input or reaction. In this case, the **'user'** should speak next.
**Output Format:**
Respond *only* in JSON format according to the following schema. Do not include any text outside the JSON structure.
\`\`\`json
{
  "type": "object",
  "properties": {
    "reasoning": {
        "type": "string",
        "description": "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn."
    },
    "next_speaker": {
      "type": "string",
      "enum": ["user", "model"],
      "description": "Who should speak next based *only* on the preceding turn and the decision rules."
    }
  },
  "required": ["next_speaker", "reasoning"]
}
\`\`\`
`;

const RESPONSE_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn.",
    },
    next_speaker: {
      type: Type.STRING,
      enum: ['user', 'model'],
      description:
        'Who should speak next based *only* on the preceding turn and the decision rules',
    },
  },
  required: ['reasoning', 'next_speaker'],
};

export interface NextSpeakerResponse {
  reasoning: string;
  next_speaker: 'user' | 'model';
}

export async function checkNextSpeaker(
  chat: GeminiChat,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
): Promise<NextSpeakerResponse | null> {
  // We need to capture the curated history because there are many moments when the model will return invalid turns
  // that when passed back up to the endpoint will break subsequent calls. An example of this is when the model decides
  // to respond with an empty part collection if you were to send that message back to the server it will respond with
  // a 400 indicating that model part collections MUST have content.
  const curatedHistory = chat.getHistory(/* curated */ true);

  // Ensure there's a model response to analyze
  if (curatedHistory.length === 0) {
    // Cannot determine next speaker if history is empty.
    return null;
  }

  const comprehensiveHistory = chat.getHistory();
  // If comprehensiveHistory is empty, there is no last message to check.
  // This case should ideally be caught by the curatedHistory.length check earlier,
  // but as a safeguard:
  if (comprehensiveHistory.length === 0) {
    return null;
  }
  const lastComprehensiveMessage =
    comprehensiveHistory[comprehensiveHistory.length - 1];

  // If the last message is a user message containing only function_responses,
  // then the model should speak next.
  if (
    lastComprehensiveMessage &&
    isFunctionResponse(lastComprehensiveMessage)
  ) {
    return {
      reasoning:
        'The last message was a function response, so the model should speak next.',
      next_speaker: 'model',
    };
  }

  // Additional check: if the last few messages show a tool execution pattern
  // (model with function call followed by user with function response), force model to continue
  if (comprehensiveHistory.length >= 2) {
    const lastMessage = comprehensiveHistory[comprehensiveHistory.length - 1];
    const secondLastMessage = comprehensiveHistory[comprehensiveHistory.length - 2];
    
    // Check if we have a pattern: model -> tool call -> user -> tool response
    if (
      secondLastMessage &&
      secondLastMessage.role === 'model' &&
      secondLastMessage.parts &&
      secondLastMessage.parts.some(part => part.functionCall) &&
      lastMessage &&
      lastMessage.role === 'user' &&
      lastMessage.parts &&
      lastMessage.parts.some(part => part.functionResponse)
    ) {
      return {
        reasoning:
          'Tool execution pattern detected: model made function call, then user provided function response. Model should continue.',
        next_speaker: 'model',
      };
    }
  }

  if (
    lastComprehensiveMessage &&
    lastComprehensiveMessage.role === 'model' &&
    lastComprehensiveMessage.parts &&
    lastComprehensiveMessage.parts.length === 0
  ) {
    lastComprehensiveMessage.parts.push({ text: '' });
    return {
      reasoning:
        'The last message was a filler model message with no content (nothing for user to act on), model should speak next.',
      next_speaker: 'model',
    };
  }

  // Things checked out. Lets proceed to potentially making an LLM request.

  const lastMessage = curatedHistory[curatedHistory.length - 1];
  if (!lastMessage || lastMessage.role !== 'model') {
    // Cannot determine next speaker if the last turn wasn't from the model
    // or if history is empty.
    return null;
  }

  const contents: Content[] = [
    ...curatedHistory,
    { role: 'user', parts: [{ text: CHECK_PROMPT }] },
  ];

  try {
    const parsedResponse = (await geminiClient.generateJson(
      contents,
      RESPONSE_SCHEMA,
      abortSignal,
    )) as unknown as NextSpeakerResponse;

    if (
      parsedResponse &&
      parsedResponse.next_speaker &&
      ['user', 'model'].includes(parsedResponse.next_speaker)
    ) {
      return parsedResponse;
    }
    return null;
  } catch (error) {
    console.warn(
      'Failed to talk to Gemini endpoint when seeing if conversation should continue.',
      error,
    );
    return null;
  }
}
