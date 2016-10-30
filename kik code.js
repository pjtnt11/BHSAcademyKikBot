	'use strict'

	var util     = require('util')
	var fs       = require('fs')
	var http     = require('http')
	var Bot      = require('@kikinteractive/kik')

	var contents = fs.readFileSync("BHSAcademyBot.json");
	var botData = JSON.parse(contents);

	var bot = new Bot(botData)

	bot.updateBotConfiguration()

	var kikCodeData = {}
	var data = {}

	data["abc"] = 123

	kikCodeData["color"] = 3
	//kikCodeData["size"] = 4000
	//kikCodeData["data"] = data

	console.log(kikCodeData);

	bot.getKikCodeUrl(kikCodeData)
	        .then((url) => {
	            console.log(url);
	        });
