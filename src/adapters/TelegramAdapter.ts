import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { ChatAdapter } from '@/adapters/BaseAdapter.js';
import { sessionManager } from '@/sessions/SessionManager.js';
import { chunkMessage } from '@/utils/messageFormatter.js';
import { logger } from '@/utils/logger.js';
import config from '@/config';
import fs from 'fs';
import path from 'path';
import type { Session } from '@/sessions/Session.js';

/**
 * Telegram bot adapter for OpenCode
 * Now uses the OpenCode Server API for clean structured output
 */
export class TelegramAdapter implements ChatAdapter {
  private bot: Telegraf;
  private isRunning: boolean = false;

  constructor() {
    if (!config.telegramBotToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Telegraf(config.telegramBotToken);
    this.setupHandlers();
  }

  /**
   * Set up message and command handlers
   */
  private setupHandlers(): void {
    // Authorization middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;

      if (!userId) {
        logger.warn('Message received without user ID');
        return;
      }

      // Check if user is allowed
      if (config.telegramAllowedUsers.length > 0 && !config.telegramAllowedUsers.includes(userId)) {
        logger.warn(`Unauthorized access attempt from user ${userId}`);
        await ctx.reply('⛔ You are not authorized to use this bot.');
        return;
      }

      return next();
    });

    // Command handlers
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
    this.bot.command('projects', this.handleProjects.bind(this));
    this.bot.command('switch', this.handleSwitch.bind(this));
    this.bot.command('status', this.handleStatus.bind(this));
    this.bot.command('clear', this.handleClear.bind(this));
    this.bot.command('stop', this.handleStop.bind(this));

    // Callback query handler (for buttons)
    this.bot.on('callback_query', this.handleCallback.bind(this));

    // Message handler
    this.bot.on(message('text'), this.handleMessage.bind(this));

    // Error handler
    this.bot.catch((err: unknown) => {
      logger.error('Telegram bot error:', err);
    });
  }

  /**
   * /start command
   */
  private async handleStart(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);
    const userId = String(ctx.from?.id);

    await ctx.reply(
      `🤖 *OpenCode Chat Bridge*\n\n` +
        `I'm your bridge to OpenCode! Send me messages and I'll forward them to your OpenCode session.\n\n` +
        `*Commands:*\n` +
        `/projects - List available projects\n` +
        `/switch <project> - Switch to a project\n` +
        `/status - Show session status\n` +
        `/clear - Clear/reset session\n` +
        `/stop - Stop current operation\n` +
        `/help - Show this help\n\n` +
        `Send any text to interact with OpenCode!`,
      { parse_mode: 'Markdown' }
    );

    // Try to restore or create session
    let session = sessionManager.restore(chatId);
    if (!session) {
      session = sessionManager.getOrCreate(chatId, userId);
    }

    // Set up output handler
    this.setupSessionOutput(chatId, session);
  }

  /**
   * /help command
   */
  private async handleHelp(ctx: Context): Promise<void> {
    await this.handleStart(ctx);
  }

  /**
   * /projects command - list available projects
   */
  private async handleProjects(ctx: Context): Promise<void> {
    try {
      const projectsDir = config.projectsDir;

      if (!fs.existsSync(projectsDir)) {
        await ctx.reply(`📁 Projects directory not found: ${projectsDir}`);
        return;
      }

      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
      const projects = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name);

      if (projects.length === 0) {
        await ctx.reply('📁 No projects found in ' + projectsDir);
        return;
      }

      // Create inline keyboard with project buttons
      const buttons = projects
        .slice(0, 10)
        .map((project) => [Markup.button.callback(`📂 ${project}`, `switch:${project}`)]);

      await ctx.reply(`📁 *Available Projects*\n\nTap to switch, or use \`/switch <name>\``, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
    } catch (error) {
      logger.error('Error listing projects:', error);
      await ctx.reply('❌ Error listing projects');
    }
  }

  /**
   * /switch command - switch to a project
   */
  private async handleSwitch(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);
    const userId = String(ctx.from?.id);
    const text = (ctx.message as { text?: string })?.text || '';
    const args = text.split(/\s+/).slice(1);

    if (args.length === 0) {
      await ctx.reply('Usage: `/switch <project-name>`', { parse_mode: 'Markdown' });
      return;
    }

    const projectName = args.join(' ');
    await this.switchToProject(ctx, chatId, userId, projectName);
  }

  /**
   * Switch to a project
   */
  private async switchToProject(
    ctx: Context,
    chatId: string,
    userId: string,
    projectName: string
  ): Promise<void> {
    const projectPath = path.join(config.projectsDir, projectName);

    if (!fs.existsSync(projectPath)) {
      await ctx.reply(`❌ Project not found: ${projectName}`);
      return;
    }

    let session = sessionManager.get(chatId);

    try {
      if (session) {
        await ctx.reply(`🔄 Switching to project: *${projectName}*...`, {
          parse_mode: 'Markdown',
        });
        await session.switchProject(projectPath);
      } else {
        session = sessionManager.getOrCreate(chatId, userId, projectPath);
        this.setupSessionOutput(chatId, session);
        await session.start();
        await ctx.reply(`📂 Started session in: *${projectName}*`, {
          parse_mode: 'Markdown',
        });
      }

      // Persist the session
      sessionManager.persist(chatId);
    } catch (error) {
      logger.error('Error switching project:', error);
      await ctx.reply(`❌ Failed to switch to project: ${projectName}`);
    }
  }

  /**
   * /status command
   */
  private async handleStatus(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);
    const session = sessionManager.get(chatId);

    if (!session) {
      await ctx.reply('📊 No active session. Send a message to start one.');
      return;
    }

    const data = session.toJSON();
    const status = session.getStatus();
    const running = session.isRunning() ? '✅ Running' : '❌ Stopped';
    const opencodeSessionId = session.getOpencodeSessionId();

    await ctx.reply(
      `📊 *Session Status*\n\n` +
        `Status: ${status}\n` +
        `Process: ${running}\n` +
        `Project: \`${data.projectPath}\`\n` +
        `OpenCode Session: \`${opencodeSessionId || 'N/A'}\`\n` +
        `Created: ${data.createdAt.toISOString()}\n` +
        `Last Activity: ${data.lastActivity.toISOString()}`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * /clear command - reset session
   */
  private async handleClear(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);

    if (await sessionManager.clear(chatId)) {
      await ctx.reply('🧹 Session cleared. Send a message to start a new one.');
    } else {
      await ctx.reply('📊 No active session to clear.');
    }
  }

  /**
   * /stop command - interrupt current operation
   */
  private async handleStop(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);
    const session = sessionManager.get(chatId);

    if (session?.isRunning()) {
      try {
        await session.interrupt();
        await ctx.reply('⏹ Operation interrupted');
      } catch (error) {
        logger.error('Error interrupting session:', error);
        await ctx.reply('❌ Failed to interrupt operation');
      }
    } else {
      await ctx.reply('📊 No running operation to stop.');
    }
  }

  /**
   * Handle callback queries (button presses)
   */
  private async handleCallback(ctx: Context): Promise<void> {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    const chatId = String(ctx.chat?.id);
    const userId = String(ctx.from?.id);
    const data = callbackQuery.data;

    // Answer the callback to remove loading state
    await ctx.answerCbQuery();

    if (data.startsWith('switch:')) {
      const projectName = data.substring(7);
      await this.switchToProject(ctx, chatId, userId, projectName);
    } else if (data === 'permission:once') {
      const session = sessionManager.get(chatId);
      if (session) {
        try {
          await session.replyToLatestPermission('once');
          await ctx.reply('✅ Allowed once');
        } catch (error) {
          logger.error('Error replying to permission:', error);
          await ctx.reply('❌ Failed to respond to permission');
        }
      }
    } else if (data === 'permission:always') {
      const session = sessionManager.get(chatId);
      if (session) {
        try {
          await session.replyToLatestPermission('always');
          await ctx.reply('✅ Always allowed');
        } catch (error) {
          logger.error('Error replying to permission:', error);
          await ctx.reply('❌ Failed to respond to permission');
        }
      }
    } else if (data === 'permission:reject') {
      const session = sessionManager.get(chatId);
      if (session) {
        try {
          await session.replyToLatestPermission('reject');
          await ctx.reply('❌ Rejected');
        } catch (error) {
          logger.error('Error replying to permission:', error);
          await ctx.reply('❌ Failed to respond to permission');
        }
      }
    } else if (data === 'confirm:yes') {
      // Legacy confirmation support - map to permission:once
      const session = sessionManager.get(chatId);
      if (session) {
        try {
          await session.sendConfirmation(true);
        } catch (error) {
          logger.error('Error sending confirmation:', error);
        }
      }
    } else if (data === 'confirm:no') {
      // Legacy confirmation support - map to permission:reject
      const session = sessionManager.get(chatId);
      if (session) {
        try {
          await session.sendConfirmation(false);
        } catch (error) {
          logger.error('Error sending confirmation:', error);
        }
      }
    }
  }

  /**
   * Handle regular text messages
   */
  private async handleMessage(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);
    const userId = String(ctx.from?.id);
    const text = (ctx.message as { text?: string })?.text || '';

    logger.info(`Received message from ${chatId}: "${text.substring(0, 50)}..."`);

    // Get or create session
    let session = sessionManager.get(chatId);

    if (!session) {
      // Try to restore
      const restored = sessionManager.restore(chatId);
      if (restored) {
        session = restored;
        this.setupSessionOutput(chatId, session);
      }
    }

    if (!session) {
      // Create new session
      session = sessionManager.getOrCreate(chatId, userId);
      this.setupSessionOutput(chatId, session);
    }

    logger.info(`Session status: ${session.getStatus()}, isRunning: ${session.isRunning()}`);

    // Start if not running
    if (!session.isRunning()) {
      try {
        await ctx.reply('🚀 Starting OpenCode session...');
        await session.start();
        await ctx.reply('✅ OpenCode session ready!');
      } catch (error) {
        logger.error('Failed to start session:', error);
        await ctx.reply('❌ Failed to start OpenCode. Is it installed?');
        return;
      }
    }

    // Send the message
    try {
      logger.info(`Sending message to OpenCode session...`);
      await session.sendMessage(text);
      logger.info(`Message sent successfully`);
    } catch (error) {
      logger.error('Failed to send message:', error);
      await ctx.reply('❌ Failed to send message to OpenCode');
    }
  }

  /**
   * Set up output handler for a session
   * Now handles structured output from OpenCode Server API
   */
  private setupSessionOutput(chatId: string, session: Session | undefined): void {
    if (!session) return;

    // Handle regular output
    session.onOutput(async (data: string) => {
      try {
        // Check if this looks like a permission request
        if (data.includes('*Permission Required*')) {
          await this.bot.telegram.sendMessage(chatId, data, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('✅ Allow Once', 'permission:once'),
                Markup.button.callback('✅ Always', 'permission:always'),
              ],
              [Markup.button.callback('❌ Reject', 'permission:reject')],
            ]),
          });
          return;
        }

        // Chunk and send output
        const chunks = chunkMessage(data, 4096);

        for (const chunk of chunks) {
          await this.bot.telegram.sendMessage(chatId, chunk, {
            parse_mode: 'Markdown',
          });
        }
      } catch (error) {
        logger.error('Failed to send output to Telegram:', error);
        // Try without markdown if it fails (might have unescaped characters)
        try {
          await this.bot.telegram.sendMessage(chatId, data);
        } catch (retryError) {
          logger.error('Failed to send plain text output:', retryError);
        }
      }
    });

    // Handle permission events
    session.on('permission', async (permission) => {
      try {
        await this.bot.telegram.sendMessage(
          chatId,
          `🔐 *Permission Required*\n\n${permission.title}`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('✅ Allow Once', 'permission:once'),
                Markup.button.callback('✅ Always', 'permission:always'),
              ],
              [Markup.button.callback('❌ Reject', 'permission:reject')],
            ]),
          }
        );
      } catch (error) {
        logger.error('Failed to send permission request to Telegram:', error);
      }
    });

    // Handle streaming text
    // For now, we accumulate and let session.idle send the full response
    // In the future, we could implement message editing for live updates

    // Handle errors
    session.on('error', async (error) => {
      try {
        await this.bot.telegram.sendMessage(chatId, `❌ Error: ${error.message}`);
      } catch (sendError) {
        logger.error('Failed to send error to Telegram:', sendError);
      }
    });

    // Handle session terminated
    session.on('terminated', async () => {
      try {
        await this.bot.telegram.sendMessage(
          chatId,
          '📴 Session ended. Send a message to start a new one.'
        );
      } catch (sendError) {
        logger.error('Failed to send termination message:', sendError);
      }
    });
  }

  /**
   * Start the Telegram bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Telegram bot already running');
      return;
    }

    logger.info('Starting Telegram bot...');

    await this.bot.launch();
    this.isRunning = true;

    logger.info('Telegram bot started successfully');
  }

  /**
   * Stop the Telegram bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping Telegram bot...');
    this.bot.stop('SIGTERM');
    this.isRunning = false;
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    const chunks = chunkMessage(message, 4096);
    for (const chunk of chunks) {
      await this.bot.telegram.sendMessage(chatId, chunk);
    }
  }

  /**
   * Send a message with buttons
   */
  async sendWithButtons(
    chatId: string,
    message: string,
    buttons: Array<{ text: string; callbackData: string }>
  ): Promise<void> {
    const keyboard = buttons.map((b) => [Markup.button.callback(b.text, b.callbackData)]);

    await this.bot.telegram.sendMessage(chatId, message, {
      ...Markup.inlineKeyboard(keyboard),
    });
  }

  /**
   * Get adapter name
   */
  getName(): string {
    return 'telegram';
  }
}
