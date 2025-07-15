const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
require('dotenv').config();

// Create a new client instance with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Store deleted messages per channel (channelId -> message data)
const deletedMessages = new Map();

// Maximum number of deleted messages to store per channel
const MAX_DELETED_MESSAGES = 10;

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    
    // Set bot activity
    client.user.setActivity('deleted messages 👀', { type: 'WATCHING' });
    
    // Start keep-alive system
    startKeepAliveSystem();
});

// Handle message deletion
client.on('messageDelete', async (message) => {
    // Skip if message is from a bot or system message
    if (message.author?.bot || message.system) return;
    
    // Skip if message content is empty
    if (!message.content && !message.attachments.size) return;
    
    const channelId = message.channel.id;
    
    // Get or create array for this channel
    if (!deletedMessages.has(channelId)) {
        deletedMessages.set(channelId, []);
    }
    
    const channelDeletedMessages = deletedMessages.get(channelId);
    
    // Store message data
    const messageData = {
        content: message.content || '[No text content]',
        author: {
            username: message.author?.username || 'Unknown User',
            displayName: message.author?.displayName || message.author?.username || 'Unknown User',
            id: message.author?.id || '0',
            avatarURL: message.author?.displayAvatarURL() || null
        },
        channel: {
            name: message.channel.name,
            id: message.channel.id
        },
        deletedAt: new Date(),
        attachments: message.attachments.size > 0 ? Array.from(message.attachments.values()).map(att => ({
            name: att.name,
            url: att.url,
            size: att.size
        })) : [],
        messageId: message.id
    };
    
    // Add to beginning of array (most recent first)
    channelDeletedMessages.unshift(messageData);
    
    // Keep only the most recent messages
    if (channelDeletedMessages.length > MAX_DELETED_MESSAGES) {
        channelDeletedMessages.splice(MAX_DELETED_MESSAGES);
    }
    
    console.log(`📝 Captured deleted message from ${messageData.author.username} in #${messageData.channel.name}`);
    
    // Send DM to all users with EGO role about deleted message
    await sendDMToEgoUsers(message.guild, {
        action: 'message_deleted',
        deletedMessage: messageData
    });
});

// Handle messages for commands
client.on('messageCreate', async (message) => {
    // Skip if message is from a bot
    if (message.author.bot) return;
    
    // Check for .snipe command
    if (message.content.toLowerCase().startsWith('.snipe')) {
        await handleSnipeCommand(message);
    }
    
    // Keep-alive ping command (hidden)
    if (message.content === '.ping' && message.author.id === client.user.id) {
        await message.delete().catch(() => {});
    }
});

// Handle snipe command
async function handleSnipeCommand(message) {
    try {
        // Check if user has EGO role
        const hasEgoRole = message.member.roles.cache.some(role => role.name === 'EGO');
        
        if (!hasEgoRole) {
            const unauthorizedEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('```ansi\n\u001b[31;1mchal bhosadike\u001b[0m\n```')
                .setTimestamp();
            return await message.reply({ embeds: [unauthorizedEmbed] });
        }
        
        const channelId = message.channel.id;
        const channelDeletedMessages = deletedMessages.get(channelId);
        
        // Check if there are any deleted messages in this channel
        if (!channelDeletedMessages || channelDeletedMessages.length === 0) {
            const noMessagesEmbed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('🔍 No Messages Found')
                .setDescription('No recently deleted messages to snipe in this channel.')
                .setTimestamp()
                .setFooter({ 
                    text: 'Snipe Bot',
                    iconURL: client.user.displayAvatarURL()
                });
            
            return await message.reply({ embeds: [noMessagesEmbed] });
        }
        
        // Get the most recent deleted message
        const deletedMessage = channelDeletedMessages[0];
        
        // Create embed for the sniped message
        const snipeEmbed = new EmbedBuilder()
            .setColor('#4dabf7')
            .setTitle('🎯 Message Sniped!')
            .setDescription(`**Message Content:**\n${deletedMessage.content}`)
            .addFields([
                {
                    name: '👤 Author',
                    value: `<@${deletedMessage.author.id}> (${deletedMessage.author.username})`,
                    inline: true
                },
                {
                    name: '📅 Deleted',
                    value: `<t:${Math.floor(deletedMessage.deletedAt.getTime() / 1000)}:R>`,
                    inline: true
                },
                {
                    name: '📍 Channel',
                    value: `<#${deletedMessage.channel.id}>`,
                    inline: true
                }
            ])
            .setTimestamp()
            .setFooter({ 
                text: 'Snipe Bot',
                iconURL: client.user.displayAvatarURL()
            });
        
        // Add author avatar if available
        if (deletedMessage.author.avatarURL) {
            snipeEmbed.setThumbnail(deletedMessage.author.avatarURL);
        }
        
        // Add attachment information if present
        if (deletedMessage.attachments.length > 0) {
            const attachmentText = deletedMessage.attachments.map(att => 
                `📎 ${att.name} (${formatFileSize(att.size)})`
            ).join('\n');
            
            snipeEmbed.addFields([{
                name: '📎 Attachments',
                value: attachmentText,
                inline: false
            }]);
        }
        
        await message.reply({ embeds: [snipeEmbed] });
        
        // Send DM to all users with EGO role
        await sendDMToEgoUsers(message.guild, {
            action: 'snipe_used',
            user: message.author,
            channel: message.channel,
            snipedMessage: deletedMessage
        });
        
        console.log(`🎯 ${message.author.username} sniped a message in #${message.channel.name}`);
        
    } catch (error) {
        console.error('Error handling snipe command:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff4757')
            .setTitle('❌ Error')
            .setDescription('An error occurred while trying to snipe the message. Please try again.')
            .setTimestamp()
            .setFooter({ 
                text: 'Snipe Bot',
                iconURL: client.user.displayAvatarURL()
            });
        
        await message.reply({ embeds: [errorEmbed] }).catch(console.error);
    }
}

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Keep-alive system variables
let lastActivity = new Date();
let keepAliveInterval;
let statusCheckInterval;

// Keep-alive system functions
function startKeepAliveSystem() {
    console.log('🔄 Starting keep-alive system...');
    
    // Update activity status every 30 seconds
    statusCheckInterval = setInterval(() => {
        updateBotStatus();
    }, 30000);
    
    // Send keep-alive ping every 5 minutes
    keepAliveInterval = setInterval(() => {
        sendKeepAlivePing();
    }, 300000);
    
    // Monitor for inactivity
    setInterval(() => {
        checkInactivity();
    }, 60000);
}

function updateBotStatus() {
    const totalMessages = Array.from(deletedMessages.values()).reduce((total, msgs) => total + msgs.length, 0);
    const activities = [
        `deleted messages 👀`,
        `${totalMessages} sniped messages`,
        `${client.guilds.cache.size} servers`,
        `EGO role commands`
    ];
    
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    client.user.setActivity(randomActivity, { type: 'WATCHING' });
    lastActivity = new Date();
}

function sendKeepAlivePing() {
    try {
        // Send a silent ping to maintain connection
        if (client.ws && client.ws.ping) {
            client.ws.ping();
            console.log('🏓 Keep-alive ping sent');
        } else {
            // Alternative keep-alive method
            client.user.setPresence({ status: 'online' });
            console.log('🏓 Keep-alive presence updated');
        }
        lastActivity = new Date();
    } catch (error) {
        console.error('❌ Keep-alive ping failed:', error);
    }
}

function checkInactivity() {
    const timeSinceLastActivity = new Date() - lastActivity;
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeSinceLastActivity > fiveMinutes) {
        console.log('⚠️ Bot has been inactive for 5+ minutes, sending keep-alive...');
        sendKeepAlivePing();
    }
}

// Function to send DMs to users with EGO role
async function sendDMToEgoUsers(guild, logData) {
    try {
        if (!guild) return;
        
        // Find all members with EGO role
        const egoRole = guild.roles.cache.find(role => role.name === 'EGO');
        if (!egoRole) return;
        
        const egoMembers = egoRole.members;
        
        for (const [userId, member] of egoMembers) {
            try {
                let embed;
                
                if (logData.action === 'message_deleted') {
                    const deletedMsg = logData.deletedMessage;
                    embed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('🗑️ Message Deleted')
                        .setDescription(`**Content:**\n${deletedMsg.content}`)
                        .addFields([
                            {
                                name: '👤 Author',
                                value: `${deletedMsg.author.username} (<@${deletedMsg.author.id}>)`,
                                inline: true
                            },
                            {
                                name: '📍 Channel',
                                value: `#${deletedMsg.channel.name}`,
                                inline: true
                            },
                            {
                                name: '🕒 Deleted At',
                                value: `<t:${Math.floor(deletedMsg.deletedAt.getTime() / 1000)}:F>`,
                                inline: false
                            }
                        ])
                        .setTimestamp()
                        .setFooter({ 
                            text: 'EGO Log System',
                            iconURL: client.user.displayAvatarURL()
                        });
                        
                    if (deletedMsg.attachments.length > 0) {
                        const attachmentText = deletedMsg.attachments.map(att => 
                            `📎 ${att.name} (${formatFileSize(att.size)})`
                        ).join('\n');
                        
                        embed.addFields([{
                            name: '📎 Attachments',
                            value: attachmentText,
                            inline: false
                        }]);
                    }
                    
                } else if (logData.action === 'snipe_used') {
                    const snipedMsg = logData.snipedMessage;
                    embed = new EmbedBuilder()
                        .setColor('#4dabf7')
                        .setTitle('🎯 Snipe Command Used')
                        .setDescription(`**${logData.user.username}** used .snipe command`)
                        .addFields([
                            {
                                name: '👤 User',
                                value: `${logData.user.username} (<@${logData.user.id}>)`,
                                inline: true
                            },
                            {
                                name: '📍 Channel',
                                value: `#${logData.channel.name}`,
                                inline: true
                            },
                            {
                                name: '🎯 Sniped Message',
                                value: `From: ${snipedMsg.author.username}\nContent: ${snipedMsg.content.substring(0, 100)}${snipedMsg.content.length > 100 ? '...' : ''}`,
                                inline: false
                            }
                        ])
                        .setTimestamp()
                        .setFooter({ 
                            text: 'EGO Log System',
                            iconURL: client.user.displayAvatarURL()
                        });
                }
                
                if (embed) {
                    await member.send({ embeds: [embed] });
                }
                
            } catch (error) {
                console.error(`Failed to send DM to EGO member ${member.user.username}:`, error);
            }
        }
        
    } catch (error) {
        console.error('Error in sendDMToEgoUsers:', error);
    }
}

// Handle bot errors
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Handle process errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Cleanup keep-alive system
function stopKeepAliveSystem() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        console.log('⏹️ Keep-alive ping stopped');
    }
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        console.log('⏹️ Status check stopped');
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🔄 Shutting down bot...');
    stopKeepAliveSystem();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔄 Shutting down bot...');
    stopKeepAliveSystem();
    client.destroy();
    process.exit(0);
});

// Get Discord bot token from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN environment variable is required');
    console.error('Please set your Discord bot token in the .env file');
    process.exit(1);
}

// Login to Discord
client.login(DISCORD_TOKEN)
    .then(() => {
        console.log('🚀 Bot login successful');
    })
    .catch(error => {
        console.error('❌ Failed to login to Discord:', error);
        process.exit(1);
    });

// Health check endpoint (for monitoring)
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            uptime: process.uptime(),
            guilds: client.guilds.cache.size,
            channels: client.channels.cache.size,
            users: client.users.cache.size,
            deletedMessagesCount: Array.from(deletedMessages.values()).reduce((total, msgs) => total + msgs.length, 0),
            keepAlive: {
                lastActivity: lastActivity,
                timeSinceLastActivity: new Date() - lastActivity,
                isActive: (new Date() - lastActivity) < 300000 // 5 minutes
            }
        }));
    } else if (req.url === '/ping') {
        // External ping endpoint for keep-alive services
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
        lastActivity = new Date();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Discord Snipe Bot is running');
    }
});const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
require('dotenv').config();

// Create a new client instance with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Store deleted messages per channel (channelId -> message data)
const deletedMessages = new Map();

// Maximum number of deleted messages to store per channel
const MAX_DELETED_MESSAGES = 10;

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    
    // Set bot activity
    client.user.setActivity('deleted messages 👀', { type: 'WATCHING' });
    
    // Start keep-alive system
    startKeepAliveSystem();
});

// Handle message deletion
client.on('messageDelete', async (message) => {
    // Skip if message is from a bot or system message
    if (message.author?.bot || message.system) return;
    
    // Skip if message content is empty
    if (!message.content && !message.attachments.size) return;
    
    const channelId = message.channel.id;
    
    // Get or create array for this channel
    if (!deletedMessages.has(channelId)) {
        deletedMessages.set(channelId, []);
    }
    
    const channelDeletedMessages = deletedMessages.get(channelId);
    
    // Store message data
    const messageData = {
        content: message.content || '[No text content]',
        author: {
            username: message.author?.username || 'Unknown User',
            displayName: message.author?.displayName || message.author?.username || 'Unknown User',
            id: message.author?.id || '0',
            avatarURL: message.author?.displayAvatarURL() || null
        },
        channel: {
            name: message.channel.name,
            id: message.channel.id
        },
        deletedAt: new Date(),
        attachments: message.attachments.size > 0 ? Array.from(message.attachments.values()).map(att => ({
            name: att.name,
            url: att.url,
            size: att.size
        })) : [],
        messageId: message.id
    };
    
    // Add to beginning of array (most recent first)
    channelDeletedMessages.unshift(messageData);
    
    // Keep only the most recent messages
    if (channelDeletedMessages.length > MAX_DELETED_MESSAGES) {
        channelDeletedMessages.splice(MAX_DELETED_MESSAGES);
    }
    
    console.log(`📝 Captured deleted message from ${messageData.author.username} in #${messageData.channel.name}`);
    
    // Send DM to all users with EGO role about deleted message
    await sendDMToEgoUsers(message.guild, {
        action: 'message_deleted',
        deletedMessage: messageData
    });
});

// Handle messages for commands
client.on('messageCreate', async (message) => {
    // Skip if message is from a bot
    if (message.author.bot) return;
    
    // Check for .snipe command
    if (message.content.toLowerCase().startsWith('.snipe')) {
        await handleSnipeCommand(message);
    }
    
    // Keep-alive ping command (hidden)
    if (message.content === '.ping' && message.author.id === client.user.id) {
        await message.delete().catch(() => {});
    }
});

// Handle snipe command
async function handleSnipeCommand(message) {
    try {
        // Check if user has EGO role
        const hasEgoRole = message.member.roles.cache.some(role => role.name === 'EGO');
        
        if (!hasEgoRole) {
            const unauthorizedEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('```ansi\n\u001b[31;1mchal bhosadike\u001b[0m\n```')
                .setTimestamp();
            return await message.reply({ embeds: [unauthorizedEmbed] });
        }
        
        const channelId = message.channel.id;
        const channelDeletedMessages = deletedMessages.get(channelId);
        
        // Check if there are any deleted messages in this channel
        if (!channelDeletedMessages || channelDeletedMessages.length === 0) {
            const noMessagesEmbed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('🔍 No Messages Found')
                .setDescription('No recently deleted messages to snipe in this channel.')
                .setTimestamp()
                .setFooter({ 
                    text: 'Snipe Bot',
                    iconURL: client.user.displayAvatarURL()
                });
            
            return await message.reply({ embeds: [noMessagesEmbed] });
        }
        
        // Get the most recent deleted message
        const deletedMessage = channelDeletedMessages[0];
        
        // Create embed for the sniped message
        const snipeEmbed = new EmbedBuilder()
            .setColor('#4dabf7')
            .setTitle('🎯 Message Sniped!')
            .setDescription(`**Message Content:**\n${deletedMessage.content}`)
            .addFields([
                {
                    name: '👤 Author',
                    value: `<@${deletedMessage.author.id}> (${deletedMessage.author.username})`,
                    inline: true
                },
                {
                    name: '📅 Deleted',
                    value: `<t:${Math.floor(deletedMessage.deletedAt.getTime() / 1000)}:R>`,
                    inline: true
                },
                {
                    name: '📍 Channel',
                    value: `<#${deletedMessage.channel.id}>`,
                    inline: true
                }
            ])
            .setTimestamp()
            .setFooter({ 
                text: 'Snipe Bot',
                iconURL: client.user.displayAvatarURL()
            });
        
        // Add author avatar if available
        if (deletedMessage.author.avatarURL) {
            snipeEmbed.setThumbnail(deletedMessage.author.avatarURL);
        }
        
        // Add attachment information if present
        if (deletedMessage.attachments.length > 0) {
            const attachmentText = deletedMessage.attachments.map(att => 
                `📎 ${att.name} (${formatFileSize(att.size)})`
            ).join('\n');
            
            snipeEmbed.addFields([{
                name: '📎 Attachments',
                value: attachmentText,
                inline: false
            }]);
        }
        
        await message.reply({ embeds: [snipeEmbed] });
        
        // Send DM to all users with EGO role
        await sendDMToEgoUsers(message.guild, {
            action: 'snipe_used',
            user: message.author,
            channel: message.channel,
            snipedMessage: deletedMessage
        });
        
        console.log(`🎯 ${message.author.username} sniped a message in #${message.channel.name}`);
        
    } catch (error) {
        console.error('Error handling snipe command:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff4757')
            .setTitle('❌ Error')
            .setDescription('An error occurred while trying to snipe the message. Please try again.')
            .setTimestamp()
            .setFooter({ 
                text: 'Snipe Bot',
                iconURL: client.user.displayAvatarURL()
            });
        
        await message.reply({ embeds: [errorEmbed] }).catch(console.error);
    }
}

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Keep-alive system variables
let lastActivity = new Date();
let keepAliveInterval;
let statusCheckInterval;

// Keep-alive system functions
function startKeepAliveSystem() {
    console.log('🔄 Starting keep-alive system...');
    
    // Update activity status every 30 seconds
    statusCheckInterval = setInterval(() => {
        updateBotStatus();
    }, 30000);
    
    // Send keep-alive ping every 5 minutes
    keepAliveInterval = setInterval(() => {
        sendKeepAlivePing();
    }, 300000);
    
    // Monitor for inactivity
    setInterval(() => {
        checkInactivity();
    }, 60000);
}

function updateBotStatus() {
    const totalMessages = Array.from(deletedMessages.values()).reduce((total, msgs) => total + msgs.length, 0);
    const activities = [
        `deleted messages 👀`,
        `${totalMessages} sniped messages`,
        `${client.guilds.cache.size} servers`,
        `EGO role commands`
    ];
    
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    client.user.setActivity(randomActivity, { type: 'WATCHING' });
    lastActivity = new Date();
}

function sendKeepAlivePing() {
    try {
        // Send a silent ping to maintain connection
        if (client.ws && client.ws.ping) {
            client.ws.ping();
            console.log('🏓 Keep-alive ping sent');
        } else {
            // Alternative keep-alive method
            client.user.setPresence({ status: 'online' });
            console.log('🏓 Keep-alive presence updated');
        }
        lastActivity = new Date();
    } catch (error) {
        console.error('❌ Keep-alive ping failed:', error);
    }
}

function checkInactivity() {
    const timeSinceLastActivity = new Date() - lastActivity;
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeSinceLastActivity > fiveMinutes) {
        console.log('⚠️ Bot has been inactive for 5+ minutes, sending keep-alive...');
        sendKeepAlivePing();
    }
}

// Function to send DMs to users with EGO role
async function sendDMToEgoUsers(guild, logData) {
    try {
        if (!guild) return;
        
        // Find all members with EGO role
        const egoRole = guild.roles.cache.find(role => role.name === 'EGO');
        if (!egoRole) return;
        
        const egoMembers = egoRole.members;
        
        for (const [userId, member] of egoMembers) {
            try {
                let embed;
                
                if (logData.action === 'message_deleted') {
                    const deletedMsg = logData.deletedMessage;
                    embed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('🗑️ Message Deleted')
                        .setDescription(`**Content:**\n${deletedMsg.content}`)
                        .addFields([
                            {
                                name: '👤 Author',
                                value: `${deletedMsg.author.username} (<@${deletedMsg.author.id}>)`,
                                inline: true
                            },
                            {
                                name: '📍 Channel',
                                value: `#${deletedMsg.channel.name}`,
                                inline: true
                            },
                            {
                                name: '🕒 Deleted At',
                                value: `<t:${Math.floor(deletedMsg.deletedAt.getTime() / 1000)}:F>`,
                                inline: false
                            }
                        ])
                        .setTimestamp()
                        .setFooter({ 
                            text: 'EGO Log System',
                            iconURL: client.user.displayAvatarURL()
                        });
                        
                    if (deletedMsg.attachments.length > 0) {
                        const attachmentText = deletedMsg.attachments.map(att => 
                            `📎 ${att.name} (${formatFileSize(att.size)})`
                        ).join('\n');
                        
                        embed.addFields([{
                            name: '📎 Attachments',
                            value: attachmentText,
                            inline: false
                        }]);
                    }
                    
                } else if (logData.action === 'snipe_used') {
                    const snipedMsg = logData.snipedMessage;
                    embed = new EmbedBuilder()
                        .setColor('#4dabf7')
                        .setTitle('🎯 Snipe Command Used')
                        .setDescription(`**${logData.user.username}** used .snipe command`)
                        .addFields([
                            {
                                name: '👤 User',
                                value: `${logData.user.username} (<@${logData.user.id}>)`,
                                inline: true
                            },
                            {
                                name: '📍 Channel',
                                value: `#${logData.channel.name}`,
                                inline: true
                            },
                            {
                                name: '🎯 Sniped Message',
                                value: `From: ${snipedMsg.author.username}\nContent: ${snipedMsg.content.substring(0, 100)}${snipedMsg.content.length > 100 ? '...' : ''}`,
                                inline: false
                            }
                        ])
                        .setTimestamp()
                        .setFooter({ 
                            text: 'EGO Log System',
                            iconURL: client.user.displayAvatarURL()
                        });
                }
                
                if (embed) {
                    await member.send({ embeds: [embed] });
                }
                
            } catch (error) {
                console.error(`Failed to send DM to EGO member ${member.user.username}:`, error);
            }
        }
        
    } catch (error) {
        console.error('Error in sendDMToEgoUsers:', error);
    }
}

// Handle bot errors
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Handle process errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Cleanup keep-alive system
function stopKeepAliveSystem() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        console.log('⏹️ Keep-alive ping stopped');
    }
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        console.log('⏹️ Status check stopped');
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🔄 Shutting down bot...');
    stopKeepAliveSystem();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔄 Shutting down bot...');
    stopKeepAliveSystem();
    client.destroy();
    process.exit(0);
});

// Get Discord bot token from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN environment variable is required');
    console.error('Please set your Discord bot token in the .env file');
    process.exit(1);
}

// Login to Discord
client.login(DISCORD_TOKEN)
    .then(() => {
        console.log('🚀 Bot login successful');
    })
    .catch(error => {
        console.error('❌ Failed to login to Discord:', error);
        process.exit(1);
    });

// Health check endpoint (for monitoring)
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            uptime: process.uptime(),
            guilds: client.guilds.cache.size,
            channels: client.channels.cache.size,
            users: client.users.cache.size,
            deletedMessagesCount: Array.from(deletedMessages.values()).reduce((total, msgs) => total + msgs.length, 0),
            keepAlive: {
                lastActivity: lastActivity,
                timeSinceLastActivity: new Date() - lastActivity,
                isActive: (new Date() - lastActivity) < 300000 // 5 minutes
            }
        }));
    } else if (req.url === '/ping') {
        // External ping endpoint for keep-alive services
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
        lastActivity = new Date();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Discord Snipe Bot is running');
    }
});

server.listen(8000, '0.0.0.0', () => {
    console.log('🌐 Health check server running on port 8000');
});

server.listen(8000, '0.0.0.0', () => {
    console.log('🌐 Health check server running on port 8000');
})
