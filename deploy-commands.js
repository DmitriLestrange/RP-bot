import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import config from './config.json' assert { type: 'json' };

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

async function deploy() {
  try {
    console.log('Started refreshing slash commands…');

    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands },
    );

    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
}

deploy();
