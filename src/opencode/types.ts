/**
 * Re-export relevant types from the OpenCode SDK
 *
 * This provides a convenient single import point for commonly used types.
 */

export type {
  // Core types
  Session,
  Message,
  UserMessage,
  AssistantMessage,

  // Message parts
  Part,
  TextPart,
  ToolPart,
  FilePart,
  ReasoningPart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,

  // Tool states
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,

  // Events
  Event,
  EventMessageUpdated,
  EventMessagePartUpdated,
  EventSessionStatus,
  EventSessionIdle,
  EventSessionError,
  EventPermissionUpdated,
  EventTodoUpdated,

  // Session status
  SessionStatus,

  // Permissions
  Permission,

  // Errors
  ProviderAuthError,
  UnknownError,
  MessageOutputLengthError,
  MessageAbortedError,
  ApiError,

  // File types
  FileDiff,
  FileSource,
  SymbolSource,

  // Input types for creating messages
  TextPartInput,
  FilePartInput,
  AgentPartInput,
  SubtaskPartInput,

  // Todo
  Todo,

  // Config types
  Config,
  AgentConfig,
  ProviderConfig,
} from '@opencode-ai/sdk';
