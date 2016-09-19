	'use strict'

	var util     = require('util')
	var fs       = require('fs')
	var http     = require('http')
	var Bot      = require('@kikinteractive/kik')

	var contents = fs.readFileSync("BHSAcademyBot.json");
	var botData = JSON.parse(contents);

	var bot = new Bot(botData)

	bot.updateBotConfiguration()

	bot.onTextMessage((message) =>
	{
		message.reply("Sorry, the bot is offline right now. Please don't rely on the bot to get homework information for at least the rest of today (possably longer). There is too many glitches that are crashing the bot that I havent had time to debug. Sorry and hope you guys understand.\n-Patrick S.")
	})

	let server = http
		.createServer(bot.incoming())
		.listen(80)
	console.log("Server running")
