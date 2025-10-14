const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const app = express();

app.get('/', (req, res) => res.send('Bot is running on Render.'));
app.listen(3000, () => console.log('✅ Web server started.'));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', (msg) => {
  if (msg.content === '!ping') {
    msg.reply('Pong!');
  }
});

client.login(process.env.TOKEN);
