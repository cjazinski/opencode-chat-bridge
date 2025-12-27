/**
 * OpenCode module - Clean API for OpenCode Server communication
 *
 * This module provides a wrapper around the OpenCode SDK for
 * managing sessions and message handling via the HTTP Server API.
 */

// Main client
export {
  OpenCodeClient,
  extractTextFromParts,
  extractToolsFromParts,
  extractFilesFromParts,
  extractReasoningFromParts,
  type OpenCodeClientOptions,
  type OpenCodeClientEvents,
  type MessageResponse,
} from './OpenCodeClient.js';

// Re-export commonly used types
export * from './types.js';
