# OpenCode Chat Bridge

> Node/Express API wrapper for OpenCode - enables AI coding agent interaction
> via Telegram, Slack, Discord chat interfaces

**Bridge your chat platforms to OpenCode** - interact with your AI coding agent
from Telegram, Slack, Discord, or any other chat interface.

## Features

- **Telegram Bot Integration** - Full-featured Telegram bot with inline
  keyboards
- **OpenCode Server API** - Uses the official `@opencode-ai/sdk` for clean,
  structured output
- **Real-time Streaming** - SSE-based event streaming for live responses
- **Thinking Indicator** - Animated status while AI is processing your request
- **Session Management** - Persistent sessions that survive restarts
- **Project Switching** - Dynamically switch between projects in `~/projects`
- **Permission Handling** - Interactive permission prompts with Allow/Reject
  buttons
- **API Key Security** - Secure REST API with authentication
- **Chunked Output** - Long responses automatically split for chat platform
  limits

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│  Telegram Bot   │────▶│   Express Server     │────▶│  OpenCode Server  │
│  (telegraf)     │◀────│   Session Manager    │◀────│  (@opencode-ai/sdk)│
└─────────────────┘     └──────────────────────┘     └───────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   SSE Event Stream   │
                        │  - message.part.updated │
                        │  - session.status    │
                        │  - permission.updated│
                        └──────────────────────┘
```

### How It Works

1. **User sends a message** via Telegram
2. **TelegramAdapter** receives the message and forwards it to the Session
3. **Session** uses `OpenCodeClient` to send the message to the OpenCode server
4. **OpenCode Server** processes the request with the configured AI model (e.g.,
   Claude Sonnet 4.5)
5. **SSE Events** stream back with response parts, status updates, and
   permission requests
6. **Session** accumulates the response and sends it back to Telegram when
   complete

## Quick Start

### Prerequisites

- Node.js 20+
- OpenCode CLI installed (`npm install -g opencode` or via installer)
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### Installation

```bash
# Clone the repository
git clone https://github.com/jazinski/opencode-chat-bridge.git
cd opencode-chat-bridge

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
```

### Configuration

Edit `.env` with your settings:

```bash
# Server
PORT=3000
NODE_ENV=production

# Security - REQUIRED
API_KEY=your-secure-api-key-here

# Telegram - REQUIRED
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ALLOWED_USERS=123456789  # Your Telegram user ID

# OpenCode Server
OPENCODE_SERVER_PORT=0            # 0 = auto-select port
OPENCODE_SERVER_HOSTNAME=localhost

# Projects
PROJECTS_DIR=~/projects

# Sessions
SESSION_TIMEOUT_MINUTES=30
SESSION_PERSIST_DIR=./sessions

# Logging
LOG_LEVEL=info
```

### OpenCode Configuration

The bridge uses your OpenCode configuration from
`~/.config/opencode/opencode.json`. Make sure you have a model configured:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "github-copilot/claude-sonnet-4.5",
  ...
}
```

Available models can be listed with:

```bash
opencode models
```

### Getting Your Telegram User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your user ID
3. Add this ID to `TELEGRAM_ALLOWED_USERS`

### Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## Telegram Commands

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `/start`         | Start the bot and show help           |
| `/help`          | Show available commands               |
| `/projects`      | List available projects in ~/projects |
| `/switch <name>` | Switch to a different project         |
| `/status`        | Show current session status           |
| `/clear`         | Clear/reset the current session       |
| `/stop`          | Interrupt current operation           |

## Features in Detail

### Thinking Indicator

When you send a message, the bot shows an animated thinking indicator:

- Cycles through phrases: "Thinking...", "Analyzing...", "Processing...", etc.
- Shows elapsed time after 5 seconds
- Sends Telegram "typing" action periodically
- Automatically disappears when the response arrives

### Permission Handling

When OpenCode needs permission for an action (file writes, command execution,
etc.):

- Bot shows a permission request with details
- Inline buttons: **Allow Once**, **Always Allow**, **Reject**
- Response is sent back to OpenCode to continue or cancel

### Project Switching

Switch between projects without losing session context:

- Use `/projects` to see available projects
- Tap a project button or use `/switch <name>`
- Session reconnects to OpenCode with the new project path

## REST API

All API endpoints require the `X-API-Key` header.

### Endpoints

```
GET  /api/health                    - Health check
GET  /api/sessions                  - List all active sessions
GET  /api/sessions/:chatId          - Get session details
DELETE /api/sessions/:chatId        - Clear a session
POST /api/sessions/:chatId/message  - Send message to session
POST /api/sessions/:chatId/interrupt - Interrupt current operation
```

### Example API Usage

```bash
# Health check
curl http://localhost:3000/api/health

# List sessions
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/sessions

# Send a message
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello OpenCode!"}' \
  http://localhost:3000/api/sessions/12345/message
```

## Project Structure

```
opencode-chat-bridge/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/
│   │   └── index.ts          # Configuration loader
│   ├── server/
│   │   ├── app.ts            # Express application
│   │   └── routes/
│   │       └── api.ts        # API endpoints
│   ├── sessions/
│   │   ├── Session.ts        # Individual session (uses OpenCodeClient)
│   │   └── SessionManager.ts # Session lifecycle management
│   ├── adapters/
│   │   ├── BaseAdapter.ts    # Abstract adapter interface
│   │   ├── index.ts          # Adapter exports
│   │   └── TelegramAdapter.ts # Telegram bot implementation
│   ├── opencode/
│   │   ├── OpenCodeClient.ts # OpenCode SDK wrapper
│   │   ├── types.ts          # TypeScript types
│   │   └── index.ts          # OpenCode exports
│   └── utils/
│       ├── logger.ts         # Winston logger
│       └── messageFormatter.ts # Message formatting utilities
├── package.json
├── tsconfig.json
└── .env.example
```

## Session Persistence

Sessions are automatically saved when:

- You switch projects
- The server shuts down gracefully

Sessions are restored when:

- You send `/start` to the bot
- You send any message after a restart

To clear a session completely: `/clear`

## Adding More Chat Platforms

The adapter pattern makes it easy to add new platforms:

1. Create a new adapter in `src/adapters/` implementing `ChatAdapter`
2. Add configuration options to `src/config/index.ts`
3. Initialize the adapter in `src/index.ts`

Example adapters to add:

- `SlackAdapter.ts` - Using `@slack/bolt`
- `DiscordAdapter.ts` - Using `discord.js`

## Development

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Security Considerations

1. **API Key**: Always set a strong `API_KEY` in production
2. **Telegram Users**: Only allow trusted user IDs in `TELEGRAM_ALLOWED_USERS`
3. **Projects Directory**: Limit to directories you want to expose
4. **Network**: Consider running behind a reverse proxy with HTTPS
5. **OpenCode Permissions**: The AI can execute code - review permission
   requests carefully

## Troubleshooting

### OpenCode not found

Ensure OpenCode is installed and in your PATH:

```bash
which opencode
opencode --version
```

### No response from AI

1. Check your OpenCode model configuration in `~/.config/opencode/opencode.json`
2. Verify the model is available: `opencode models`
3. Check logs for SSE event errors: `LOG_LEVEL=debug npm run dev`

### Telegram bot not responding

1. Check your bot token is correct
2. Verify your user ID is in `TELEGRAM_ALLOWED_USERS`
3. Check logs for errors: `LOG_LEVEL=debug npm run dev`

### Session issues

Clear the session and restart:

```
/clear
```

### Thinking indicator doesn't disappear

This usually means SSE events aren't being received properly:

1. Check OpenCode server is running (logs should show "OpenCode server started")
2. Verify SSE subscription is active
3. Try `/clear` and send a new message

## License

MIT

## Contributing

Pull requests welcome! Please follow the existing code style and add tests for
new features.
