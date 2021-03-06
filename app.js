process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api'),
  sqlite3 = require('sqlite3'),
  { open } = require('sqlite'),
  path = require('path'),
  dotenv = require('dotenv');

dotenv.config();

const bot = new TelegramBot(process.env.TOKEN, { polling: true });
const lc = process.env.LOCALE || 'it';
const locale = require(path.join(__dirname, 'locales', lc + '.json'));

let db;

open({
  filename: process.env.DB_FILE || path.join(__dirname, 'db.sqlite'),
  driver: sqlite3.Database
}).then(async _db => {
  db = _db;
  console.log('Connected to db');
  await _db.run(`CREATE TABLE IF NOT EXISTS presentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    presentation TEXT NOT NULL
  )`);
  await _db.run(`CREATE TABLE IF NOT EXISTS pending_presentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL
  )`);
  initBot(_db);
});


const welcome = async msg => {
  let p = await db.all('SELECT * FROM presentations WHERE chat_id = ?', [msg.chat.id]);
  let text = locale.WELCOME.replace('{0}', msg.new_chat_member.username ? '@' + msg.new_chat_member.username : msg.new_chat_member.first_name);
  text = text.replace('{1}', p.map(u => `${u.username}: ${u.presentation}`).join('\n'));
  let reply = await bot.sendMessage(msg.chat.id, text, {
    reply_to_message_id: msg.message_id
  });
  await db.run('INSERT INTO pending_presentations (chat_id, message_id, user_id) VALUES (?, ?, ?)', [reply.chat.id, reply.message_id, msg.new_chat_member.id]);
};

const bye = async msg => {
  await db.run('DELETE FROM presentations WHERE chat_id = ? AND user_id = ?', [msg.chat.id, msg.left_chat_member.id]);
  await db.run('DELETE FROM pending_presentations WHERE chat_id = ? AND user_id = ?', [msg.chat.id, msg.left_chat_member.id]);
  return bot.sendMessage(msg.chat.id, locale.BYE, {
    reply_to_message_id: msg.message_id
  });
};

const presentami = async msg => {
  let reply = await bot.sendMessage(msg.chat.id, locale.PRESENTAMI, {
    reply_to_message_id: msg.message_id,
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: locale.CANCEL, callback_data: 'presentami:cancel' }]
      ]
    })
  });
  await db.run('INSERT INTO pending_presentations (chat_id, message_id, user_id) VALUES (?, ?, ?)', [reply.chat.id, reply.message_id, msg.from.id]);
}

const ripasserotti = async msg => {
  let p = await db.all('SELECT * FROM presentations WHERE chat_id = ?', [msg.chat.id]);
  let text = locale.RIPASSEROTTI.replace('{0}', p.map(u => `${u.username}: ${u.presentation}`).join('\n'));
  await bot.sendMessage(msg.chat.id, text, {
    reply_to_message_id: msg.message_id
  });
};

const addPresentation = async (msg, pending, replace) => {
  if (pending.user_id !== msg.from.id) return;
  await db.run('DELETE FROM presentations WHERE chat_id = ? AND user_id = ?', [
    msg.chat.id,
    msg.from.id
  ]);
  await db.run('INSERT INTO presentations (chat_id, user_id, username, presentation) VALUES (?,?,?,?)', [
    msg.chat.id,
    msg.from.id,
    msg.from.username ? '@' + msg.from.username : msg.from.first_name,
    msg.text
  ]);
  await db.run('DELETE FROM pending_presentations WHERE chat_id = ? AND message_id = ?', [pending.chat_id, pending.message_id]);
  if (replace) {
    await bot.editMessageText(locale.PRES_DONE, {
      chat_id: pending.chat_id,
      message_id: pending.message_id
    });
  }
  else {
    await bot.sendMessage(msg.chat.id, locale.PRES_DONE, {
      reply_to_message_id: msg.message_id
    });
  }
};

const initBot = () => {
  bot.on('message', async msg => {
    if (msg.new_chat_member) {
      return await welcome(msg);
    }
    if (msg.left_chat_member) {
      return await bye(msg);
    }
    if (!msg.text) return;
    let text = msg.text.replace('@RipasseroBot', '');
    if (text === '/presentami' || text === '/p') {
      return await presentami(msg);
    }
    if (text === '/ripasserotti' || text === '/r') {
      return await ripasserotti(msg);
    }
    if (msg.reply_to_message) {
      let pending = await db.get('SELECT * FROM pending_presentations WHERE chat_id = ? AND message_id = ?', [msg.chat.id, msg.reply_to_message.message_id]);
      if (pending) {
        return await addPresentation(msg, pending, msg.reply_to_message.text === locale.PRESENTAMI);
      }
    }
  });

  bot.on('callback_query', async msg => {
    if (msg.data === 'presentami:cancel') {
      await db.run('DELETE FROM pending_presentations WHERE chat_id = ? AND message_id = ?', [msg.message.chat.id, msg.message.message_id]);
      await bot.editMessageText('Annullato', {
        chat_id: msg.message.chat.id,
        message_id: msg.message.message_id
      });
    }
  });
}
