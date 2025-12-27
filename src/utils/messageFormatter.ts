/**
 * Message Formatter - Convert OpenCode SDK message parts to readable Telegram messages
 *
 * This module handles the conversion of structured message parts (TextPart, ToolPart, FilePart, etc.)
 * into clean, readable text suitable for display in Telegram.
 */

import type {
  Part,
  TextPart,
  ToolPart,
  FilePart,
  ReasoningPart,
  StepStartPart,
  StepFinishPart,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
} from '@opencode-ai/sdk';

/**
 * Maximum message length for Telegram
 */
const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Maximum length for code blocks (leave room for formatting)
 */
const CODE_BLOCK_MAX_LENGTH = TELEGRAM_MAX_LENGTH - 50;

/**
 * Options for formatting messages
 */
export interface FormatOptions {
  /** Include tool execution details (default: true) */
  includeTools?: boolean;
  /** Include file changes (default: true) */
  includeFiles?: boolean;
  /** Include reasoning/thinking (default: false - it's verbose) */
  includeReasoning?: boolean;
  /** Include step indicators (default: true) */
  includeSteps?: boolean;
  /** Use markdown formatting (default: true) */
  useMarkdown?: boolean;
  /** Compact mode - less verbose output (default: false) */
  compact?: boolean;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  includeTools: true,
  includeFiles: true,
  includeReasoning: false,
  includeSteps: true,
  useMarkdown: true,
  compact: false,
};

/**
 * Type guards for ToolState variants
 */
function isToolStatePending(state: ToolState): state is ToolStatePending {
  return state.status === 'pending';
}

function isToolStateRunning(state: ToolState): state is ToolStateRunning {
  return state.status === 'running';
}

function isToolStateCompleted(state: ToolState): state is ToolStateCompleted {
  return state.status === 'completed';
}

function isToolStateError(state: ToolState): state is ToolStateError {
  return state.status === 'error';
}

/**
 * Format a single message part to readable text
 */
export function formatPart(part: Part, options: FormatOptions = {}): string | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (part.type) {
    case 'text':
      return formatTextPart(part as TextPart);

    case 'tool':
      if (!opts.includeTools) return null;
      return formatToolPart(part as ToolPart, opts);

    case 'file':
      if (!opts.includeFiles) return null;
      return formatFilePart(part as FilePart, opts);

    case 'reasoning':
      if (!opts.includeReasoning) return null;
      return formatReasoningPart(part as ReasoningPart, opts);

    case 'step-start':
      if (!opts.includeSteps) return null;
      return formatStepStartPart(part as StepStartPart);

    case 'step-finish':
      if (!opts.includeSteps) return null;
      return formatStepFinishPart(part as StepFinishPart);

    default:
      return null;
  }
}

/**
 * Format text part - this is the main content
 */
function formatTextPart(part: TextPart): string {
  return part.text || '';
}

/**
 * Format tool part - shows tool execution status and results
 */
function formatToolPart(part: ToolPart, opts: Required<FormatOptions>): string {
  const tool = part.tool;
  const state = part.state;

  // Status emoji based on state
  const getStatusEmoji = (s: ToolState): string => {
    if (isToolStatePending(s)) return '';
    if (isToolStateRunning(s)) return '';
    if (isToolStateCompleted(s)) return '';
    if (isToolStateError(s)) return '';
    return '';
  };

  const statusEmoji = getStatusEmoji(state);
  const toolName = formatToolName(tool);

  if (opts.compact) {
    if (isToolStateCompleted(state)) {
      return `${statusEmoji} ${toolName}`;
    } else if (isToolStateError(state)) {
      return `${statusEmoji} ${toolName}: ${state.error || 'Error'}`;
    } else if (isToolStateRunning(state)) {
      return `${statusEmoji} ${toolName}...`;
    } else {
      return `${statusEmoji} ${toolName}`;
    }
  }

  // Detailed format
  const lines: string[] = [];

  if (isToolStateRunning(state)) {
    lines.push(`${statusEmoji} *${toolName}*...`);
    if (state.title) {
      lines.push(state.title);
    }
  } else if (isToolStateCompleted(state)) {
    lines.push(`${statusEmoji} *${toolName}*`);
    // Show summary of result if available
    const summary = getToolResultSummary(tool, state);
    if (summary) {
      lines.push(summary);
    }
  } else if (isToolStateError(state)) {
    lines.push(`${statusEmoji} *${toolName}* failed`);
    if (state.error) {
      lines.push(`Error: ${state.error}`);
    }
  } else if (isToolStatePending(state)) {
    lines.push(`${statusEmoji} *${toolName}* pending...`);
  }

  return lines.join('\n');
}

/**
 * Get a human-readable tool name
 */
function formatToolName(tool: string): string {
  // Map common tool names to readable versions
  const toolNames: Record<string, string> = {
    read: 'Reading file',
    write: 'Writing file',
    edit: 'Editing file',
    bash: 'Running command',
    glob: 'Finding files',
    grep: 'Searching code',
    list: 'Listing files',
    webfetch: 'Fetching web page',
    todoread: 'Reading tasks',
    todowrite: 'Writing tasks',
  };

  return toolNames[tool] || tool;
}

/**
 * Get a summary of the tool result
 */
function getToolResultSummary(
  tool: string,
  state: ToolStateCompleted | ToolStateRunning | ToolStatePending | ToolStateError
): string | null {
  // Get input from state
  const input = state.input;
  if (!input) return null;

  switch (tool) {
    case 'read':
      return input.filePath ? `Read: \`${input.filePath}\`` : null;
    case 'write':
      return input.filePath ? `Wrote: \`${input.filePath}\`` : null;
    case 'edit':
      return input.filePath ? `Edited: \`${input.filePath}\`` : null;
    case 'bash':
      return input.command ? `\`${truncate(String(input.command), 50)}\`` : null;
    case 'glob':
      return input.pattern ? `Pattern: \`${input.pattern}\`` : null;
    case 'grep':
      return input.pattern ? `Search: \`${input.pattern}\`` : null;
    default:
      // For completed state, show the title if available
      if (isToolStateCompleted(state) && state.title) {
        return state.title;
      }
      return null;
  }
}

/**
 * Format file part - shows file changes
 */
function formatFilePart(part: FilePart, opts: Required<FormatOptions>): string {
  const filename = part.filename || 'unknown file';

  if (opts.compact) {
    return ` \`${filename}\``;
  }

  return ` *File:* \`${filename}\``;
}

/**
 * Format reasoning part - shows AI thinking (usually hidden)
 */
function formatReasoningPart(part: ReasoningPart, opts: Required<FormatOptions>): string {
  const text = part.text || '';

  if (opts.compact || !text) {
    return ' _Thinking..._';
  }

  return ` _Thinking:_ ${truncate(text, 200)}`;
}

/**
 * Format step start indicator
 */
function formatStepStartPart(_part: StepStartPart): string {
  return ' Starting step...';
}

/**
 * Format step finish indicator
 */
function formatStepFinishPart(_part: StepFinishPart): string {
  // Usually we don't need to show step finish if we showed step start
  return '';
}

/**
 * Format an array of parts into readable messages
 */
export function formatParts(parts: Part[], options: FormatOptions = {}): string {
  const formatted = parts
    .map((part) => formatPart(part, options))
    .filter((text): text is string => text !== null && text.length > 0);

  return formatted.join('\n');
}

/**
 * Format parts into multiple Telegram messages if needed (chunking)
 */
export function formatPartsForTelegram(parts: Part[], options: FormatOptions = {}): string[] {
  const text = formatParts(parts, options);

  if (text.length === 0) {
    return [];
  }

  if (text.length <= TELEGRAM_MAX_LENGTH) {
    return [text];
  }

  // Chunk the message
  return chunkMessage(text, TELEGRAM_MAX_LENGTH);
}

/**
 * Format a streaming delta update
 * Used when receiving partial updates via SSE
 */
export function formatDelta(part: Part, delta: string | undefined): string | null {
  if (!delta) return null;

  // For text parts, just return the delta
  if (part.type === 'text') {
    return delta;
  }

  // For other parts, we typically don't show deltas
  return null;
}

/**
 * Format a permission request for user confirmation
 */
export function formatPermissionRequest(permission: {
  id: string;
  title?: string;
  metadata?: unknown;
}): string {
  const lines: string[] = [];

  lines.push(' *Permission Required*');
  lines.push('');

  if (permission.title) {
    lines.push(permission.title);
  }

  lines.push('');
  lines.push('Please respond: Allow Once, Always Allow, or Reject');

  return lines.join('\n');
}

/**
 * Format session status for display
 */
export function formatSessionStatus(
  status: 'idle' | 'busy' | 'error' | string,
  errorMessage?: string
): string {
  switch (status) {
    case 'idle':
      return ' Ready';
    case 'busy':
      return ' Working...';
    case 'error':
      return errorMessage ? ` Error: ${errorMessage}` : ' Error';
    default:
      return ` ${status}`;
  }
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Chunk a long message into smaller pieces for Telegram
 * Tries to split at natural boundaries (newlines, sentences)
 */
export function chunkMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point
    let breakPoint = maxLength;

    // Look for newline near the end
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    if (lastNewline > maxLength * 0.5) {
      breakPoint = lastNewline + 1;
    } else {
      // Look for sentence end
      const lastPeriod = remaining.lastIndexOf('. ', maxLength);
      if (lastPeriod > maxLength * 0.5) {
        breakPoint = lastPeriod + 2;
      } else {
        // Look for space
        const lastSpace = remaining.lastIndexOf(' ', maxLength);
        if (lastSpace > maxLength * 0.5) {
          breakPoint = lastSpace + 1;
        }
      }
    }

    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}

/**
 * Escape markdown characters for Telegram
 */
export function escapeMarkdown(text: string): string {
  // Telegram uses a subset of markdown
  // We need to escape: * _ ` [ ]
  return text.replace(/([*_`\[\]])/g, '\\$1');
}

/**
 * Format code for Telegram (wrap in code block)
 */
export function formatCode(code: string, language?: string): string {
  const lang = language || '';
  const wrapped = `\`\`\`${lang}\n${code}\n\`\`\``;

  if (wrapped.length <= TELEGRAM_MAX_LENGTH) {
    return wrapped;
  }

  // Need to truncate the code
  const maxCodeLength = CODE_BLOCK_MAX_LENGTH - lang.length - 10;
  const truncated = truncate(code, maxCodeLength);
  return `\`\`\`${lang}\n${truncated}\n\`\`\``;
}

export default {
  formatPart,
  formatParts,
  formatPartsForTelegram,
  formatDelta,
  formatPermissionRequest,
  formatSessionStatus,
  escapeMarkdown,
  formatCode,
  chunkMessage,
};
