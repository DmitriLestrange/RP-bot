// ===== Required modules =====
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();

// ===== Keep-alive server for Render =====
app.get('/', (req, res) => res.send('Bot is running on Render.'));
app.listen(3000, () => console.log('✅ Web server started.'));

// ===== Discord client setup =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== Data storage =====
const dataPath = path.join(__dirname, 'data.json');
function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({ users: {}, encounters: {} }, null, 2));
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// ===== Economy functions =====
function getUser(id, character = null) {
  const data = loadData();
  const key = character ? `${id}-${character}` : id;
  if (!data.users[key]) {
    data.users[key] = { balance: 0, inventory: [], tier: 1 };
    saveData(data);
  }
  return data.users[key];
}
function addBalance(id, amount, character = null) {
  const data = loadData();
  const key = character ? `${id}-${character}` : id;
  const user = getUser(id, character);
  user.balance += amount;
  data.users[key] = user;
  saveData(data);
  return user.balance;
}
function addItem(id, item, character = null) {
  const data = loadData();
  const key = character ? `${id}-${character}` : id;
  const user = getUser(id, character);
  user.inventory.push(item);
  data.users[key] = user;
  saveData(data);
  return user.inventory;
}

// ===== Encounter / NPC functions =====
function pickEnemy(channelName, playerTier) {
  const data = loadData();
  if (!data.encounters[channelName] || !data.encounters[channelName].npcs) return null;

  const enemies = Object.entries(data.encounters[channelName].npcs).filter(([_, npc]) => npc.type === 'enemy');

  const eligible = enemies.filter(([_, npc]) => {
    if (npc.boss) return npc.tier <= playerTier + 3;
    return Math.abs(npc.tier - playerTier) <= 1;
  });

  if (eligible.length === 0) return null;

  const [name, npc] = eligible[Math.floor(Math.random() * eligible.length)];
  return { name, tier: npc.tier, boss: npc.boss || false };
}

// ===== AI narrative =====
async function generateNarrative(playerActions, enemyName, enemyTier) {
  const prompt = `
You are an enemy in a dark fantasy RP. Multiple players attacked you:
${playerActions.join('\n')}
You are ${enemyName}, tier ${enemyTier}.
Write a short cinematic narrative describing your reaction to all player actions.
Do not include stats or dice rolls.
`;
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "system", content: prompt }] },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error(err);
    return `${enemyName} reacts aggressively!`;
  }
}

// ===== Active encounter tracker =====
let activeEncounters = {}; // { channelName: { enemy, players: [], playerActions: [], turn: 0 } }

// ===== Main message handler =====
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  const args = msg.content.trim().split(/ +/);
  const command = args[0].toLowerCase();
  const userId = msg.author.id;
  const channelName = msg.channel.name;
  const data = loadData();

  const user = getUser(userId);

  // ===== Random encounter chance (optional) =====
  if (!activeEncounters[channelName] && Math.random() < 0.05) {
    const enemy = pickEnemy(channelName, user.tier);
    if (enemy) {
      activeEncounters[channelName] = { enemy, players: [userId], playerActions: [], turn: 0 };
      msg.channel.send(`⚔️ A **${enemy.name}** appeared! Other players can join with !joinencounter`);
    }
  }

  // ===== Join encounter =====
  if (command === '!joinencounter') {
    if (!activeEncounters[channelName]) return msg.reply("No encounter active.");
    if (!activeEncounters[channelName].players.includes(userId)) {
      activeEncounters[channelName].players.push(userId);
      msg.reply(`${msg.member.displayName} joined the encounter!`);
    }
  }

  // ===== Player submits action =====
  if (activeEncounters[channelName] && !command.startsWith('!')) {
    const encounter = activeEncounters[channelName];
    if (encounter.players.includes(userId)) {
      encounter.playerActions.push(`${msg.member.displayName}: ${msg.content}`);

      if (encounter.playerActions.length >= encounter.players.length) {
        const narrative = await generateNarrative(encounter.playerActions, encounter.enemy.name, encounter.enemy.tier);
        msg.channel.send(`⚔️ ${narrative}`);

        // Resolve tier-based outcomes
        encounter.players.forEach(pid => {
          const playerData = getUser(pid);
          const success = Math.random() < (playerData.tier / (encounter.enemy.tier + playerData.tier));
          if (success) {
            addBalance(pid, encounter.enemy.tier * 10);
            addItem(pid, `Looted ${encounter.enemy.name}`);
          }
        });

        activeEncounters[channelName] = null; // encounter ends
      }
    }
  }

  // ===== Economy commands =====
  if (command === '!balance') msg.reply(`💰 You have ${user.balance}G.`);
  if (command === '!inventory') msg.reply(`🎒 Inventory: ${user.inventory.join(', ') || 'Empty'}`);

  // ===== Admin-only NPC commands =====
  const isAdmin = msg.member.permissions.has("Administrator");
  if (command.startsWith('!addnpc') && isAdmin) {
    const [_, npcName, tier, type, bossFlag] = args;
    if (!data.encounters[channelName]) data.encounters[channelName] = { npcs: {}, chance: 0.1 };
    data.encounters[channelName].npcs[npcName] = { tier: parseInt(tier), type, boss: bossFlag === 'true' };
    saveData(data);
    msg.reply(`✅ NPC "${npcName}" added.`);
  }
  if (command.startsWith('!npclist') && isAdmin) {
    if (!data.encounters[channelName] || !data.encounters[channelName].npcs) return msg.reply("No NPCs in this area.");
    const list = Object.entries(data.encounters[channelName].npcs).map(([n, npc]) => `${n} (Tier ${npc.tier}, ${npc.type}${npc.boss ? ', Boss' : ''})`);
    msg.reply(`NPCs: \n${list.join('\n')}`);
  }

  // ===== Help =====
  if (command === '!help') {
    msg.channel.send(`
📜 Commands:
!balance - show G
!inventory - show items
!encounter / !search - trigger encounter
!joinencounter - join active encounter
!checkarea - list NPCs/enemies
(Admin only)
!addnpc !npclist ... 
    `);
  }
});

// ===== Bot login =====
client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));
client.login(process.env.TOKEN);
