const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const app = express();

app.get('/', (req, res) => res.send('Bot is running on Render.'));
app.listen(3000, () => console.log('✅ Web server started.'));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const userId = msg.author.id;

  if (msg.content === '!balance') {
    const user = getUser(userId);
    msg.reply(`💰 You have ${user.balance} coins.`);
  }

  if (msg.content.startsWith('!give ')) {
    const [_, mention, amount] = msg.content.split(' ');
    const targetId = mention.replace(/[<@!>]/g, '');
    const amt = parseInt(amount);

    if (isNaN(amt)) return msg.reply('❌ Invalid amount.');

    if (removeBalance(userId, amt) === false) return msg.reply('❌ Not enough coins.');
    addBalance(targetId, amt);

    msg.reply(`✅ You gave <@${targetId}> ${amt} coins.`);
  }

  if (msg.content.startsWith('!inventory')) {
    const user = getUser(userId);
    msg.reply(`🎒 Your inventory: ${user.inventory.join(', ') || 'Empty'}`);
  }

  if (msg.content.startsWith('!additem ')) {
    const item = msg.content.slice(9);
    addItem(userId, item);
    msg.reply(`✅ Added "${item}" to your inventory.`);
  }
});


client.login(process.env.TOKEN);

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, 'data.json');

// Helper functions for economy
function loadData() {
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getUser(id) {
  const data = loadData();
  if (!data.users[id]) {
    data.users[id] = { balance: 100, inventory: [] }; // start users with 100 coins
    saveData(data);
  }
  return data.users[id];
}

function addBalance(id, amount) {
  const data = loadData();
  const user = getUser(id);
  user.balance += amount;
  data.users[id] = user;
  saveData(data);
  return user.balance;
}

function removeBalance(id, amount) {
  const user = getUser(id);
  if (user.balance < amount) return false;
  user.balance -= amount;
  const data = loadData();
  data.users[id] = user;
  saveData(data);
  return user.balance;
}

function addItem(id, item) {
  const data = loadData();
  const user = getUser(id);
  user.inventory.push(item);
  data.users[id] = user;
  saveData(data);
  return user.inventory;
}
