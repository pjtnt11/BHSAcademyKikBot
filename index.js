	'use strict'

	var util = require('util')
	var http = require('http')
	var Bot = require('@kikinteractive/kik')
	var firebase = require('firebase')
	var schedule = require('node-schedule')
	var moment = require('moment')

	let bot = new Bot(
	{
		username: 'bhsacademybot',
		apiKey: '1c744fe4-c975-4036-acc5-77663632c1a3',
		baseUrl: 'http://ec2-52-41-29-101.us-west-2.compute.amazonaws.com',
		manuallySendReadReceipts: true
	})

	bot.updateBotConfiguration()

	firebase.initializeApp(
	{
		databaseURL: "https://bhs-academy-kik-bot.firebaseio.com/",
		serviceAccount: "/home/ec2-user/BHSAcademyBot/serviceAccountCredentials.json"
	})

	var database = firebase.database()
	var homeworkRef = database.ref("/homework")
	var usersRef = database.ref("/users")
	var announcementsRef = database.ref("/announcements")
	var votingRef = database.ref("/voting")
	var suggestComplaintRef = database.ref("/suggestComplaint")

	let userSuggestedResponses = ["📝 Homework", "📢 Announcements", "🗳 Voting", "ℹ️ Admins", "⚙ Settings", "📲 Complaints/Suggestions"]
	let adminSuggestedResponses = ["📝 Homework", "📢 Announcements", "🗳 Voting", "ℹ️ Admins", "⚙ Settings", "📲 Complaints/Suggestions", "📊 Stats", "🔒 Admin Actions"]

	var dailyHomeworkSchedule = schedule.scheduleJob('30 15 * * *', function ()
	{
		var users = []

		usersRef.on("child_added", function (snapshot)
		{
			if (snapshot.val().subscribed == true)
			{
				var UsersDecodedUsername = snapshot.key
				UsersDecodedUsername = UsersDecodedUsername.replace(/%2E/g, "\.")

				users.push(UsersDecodedUsername)
			}
		})

		usersRef.once("value", function (snapshot)
		{
			usersRef.off("child_added")
			getHomeworkString(function (homework)
			{
				homeworkRef.child("notifications_enabled").once("value", function (snapshot)
				{
					if (snapshot.val() == true)
					{
						let homeworkString = Bot.Message.text(homework).addResponseKeyboard(["Dismiss"])
						bot.broadcast(homeworkString, users)
						console.log("Daily homework notification sent to " + users.length + "users")
					}
				})
			})
		})
	})

	var clearHomeworkSchedule = schedule.scheduleJob('0 2 * * *', function ()
	{
		homeworkRef.child("auto_clear_enabled").once("value", function (snapshot)
		{
			if (snapshot.val() == true)
			{
				homeworkRef.child("items").set(null)
				console.log("Homework has been auto cleared")
			}
		})
	})

	function createUser(message, callback)
	{
		var data = {}

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		data[UsersEncodedUsername] = {
			context: "home",
			is_admin: false,
			subscribed: true
		}

		usersRef.update(data, function (error)
		{
			if (typeof callback === 'function')
			{
				callback(error)
			}
		})
	}

	function getContextMessage(message, context, callback)
	{
		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		switch (context)
		{
			case "home":
				let homeContextMessage = Bot.Message.text("How can I help you?")

				if (message.mention != "bhsacademybot")
				{
					adminCheck(message, function (isAdmin)
					{
						if (isAdmin)
						{
							callback(homeContextMessage.addResponseKeyboard(adminSuggestedResponses))
						}
						else
						{
							callback(homeContextMessage.addResponseKeyboard(userSuggestedResponses))
						}
					})
				}
				else
				{
					callback(null)
				}
				break

			case "settings":
				let settingsString = Bot.Message.text("Which setting would you like to change?")

				userRef.child("subscribed").once("value", function (snapshot)
				{
					if (snapshot.val() === true)
					{
						callback(settingsString.addResponseKeyboard(["Unsubscribe", "Cancel"]), message.from)
					}
					else
					{
						callback(settingsString.addResponseKeyboard(["Subscribe", "Cancel"]), message.from)
					}
				})
				break

			case "admin_actions":
				let adminActionsString = Bot.Message.text("What would you like to do?")

				adminCheck(message, function (is_admin)
				{
					callback(adminActionsString.addResponseKeyboard(["Homework", "Voting", "Make an announcement", "🏠 Back to home"]), message.from)
				})
				break

			case "add_homework_item":
				let addHomeworkItemString = Bot.Message.text("What class are you adding homework for?").addResponseKeyboard(["Physics", "Math", "PLTW-POE (Cotie)", "PLTW-POE (Stevens)", "PLTW-DE", "English (Warczynski)", "English (Brach)", "English (Flanagan)", "English (Miserendino)", "Health (Simons)", "Cancel"])

				callback(addHomeworkItemString)
				break

			case "add_homework_item_body":
				let addHomeworkItemBodyString = Bot.Message.text("What is the homework in that class?").addResponseKeyboard(["Cancel"], true)

				callback(addHomeworkItemBodyString)
				break

			case "remove_homework_item":
				var homeworkClasses = []
				var removeHomeworkItemString = Bot.Message.text("Which homework item would you like to remove?")

				homeworkRef.child("items").on("child_added", function (snapshot)
				{
					homeworkClasses.push(snapshot.key)
				})

				homeworkRef.child("items").once("value", function (snapshot)
				{
					usersRef.off("child_added")
					homeworkClasses.push("Cancel")
					removeHomeworkItemString.addResponseKeyboard(homeworkClasses)
					callback(removeHomeworkItemString)
				})
				break

			case "confirm_add_homework_item":
				let addHomeworkItemConfirmationString = Bot.Message.text("There is already homework registered for that class. Are you sure you want to overwrite it?").addResponseKeyboard(["Yes", "No"])
				callback(addHomeworkItemConfirmationString)
				break

			case "make_an_announcement":
				let makeAnAnnouncementString = Bot.Message.text("What is the title of the announcement that you would like to make?").addResponseKeyboard(["Cancel"], true)

				callback(makeAnAnnouncementString)
				break

			case "add_announcement_body":
				let addAnnouncementBodyString = Bot.Message.text("What is the body of your announcement?").addResponseKeyboard(["Cancel"], true)

				callback(addAnnouncementBodyString)
				break

			case "ask_announcement_image":
				let askAnnouncementImageString = Bot.Message.text("Would you like to add an image to your announcement?").addResponseKeyboard(["Yes", "No"])

				callback(askAnnouncementImageString)
				break

			case "confirm_make_announcement":
				let makeAnnouncementConfirmationString = Bot.Message.text("Are you sure that you want to create this announcement and send a message to eveyone on the subscribed list?").addResponseKeyboard(["Yes", "No"])

				callback(makeAnnouncementConfirmationString)
				break

			case "add_announcement_image":
				let addAnnouncementImageString = Bot.Message.text("Please send me the image you would like to attach to this announcement").addResponseKeyboard(["Cancel"])

				callback(addAnnouncementImageString)
				break

			case "homework_actions":
				var homeworkActionsList = ["Show homework", "Add homework item", "Remove homework item", "Manually clear homework"]

				homeworkRef.child("auto_clear_enabled").once("value", function (snapshot)
				{
					if (snapshot.val() == true)
					{
						homeworkActionsList.push("Disable homework auto clear")
					}
					else
					{
						homeworkActionsList.push("Enable homework auto clear")
					}

					homeworkRef.child("notifications_enabled").once("value", function (snapshot)
					{
						if (snapshot.val() == true)
						{
							homeworkActionsList.push("Disable homework notifications")
						}
						else
						{
							homeworkActionsList.push("Enable homework notifications")
						}

						homeworkActionsList.push("🔙 To Admin Actions")
						let homeworkActionsString = Bot.Message.text("What would you like to do concerning homework?").addResponseKeyboard(homeworkActionsList)

						callback(homeworkActionsString)
					})
				})
				break

			case "clear_homework":
				let clearHomeworkString = Bot.Message.text("Are you sure that you want to clear ALL of the currently registered homework?").addResponseKeyboard(["Yes", "No"])

				callback(clearHomeworkString)
				break

			case "enable_homework_auto_clear":
				let EnableHomeworkAutoClear = Bot.Message.text("Are you sure that you want to enable homework auto clear? (this happens everyday at 2:00AM)").addResponseKeyboard(["Yes", "No"])

				callback(EnableHomeworkAutoClear)
				break

			case "disable_homework_auto_clear":
				let DisableHomeworkAutoClear = Bot.Message.text("Are you sure that you want to disable homework auto clear?").addResponseKeyboard(["Yes", "No"])

				callback(DisableHomeworkAutoClear)
				break

			case "enable_homework_notifications":
				let EnableHomeworkNotifications = Bot.Message.text("Are you sure that you want enable homework notifications for everyone? (this happens everyday at 3:30PM)").addResponseKeyboard(["Yes", "No"])

				callback(EnableHomeworkNotifications)
				break

			case "disable_homework_notifications":
				let DisableHomeworkNotifications = Bot.Message.text("Are you sure that you want to disable homework notifications?").addResponseKeyboard(["Yes", "No"])

				callback(DisableHomeworkNotifications)
				break

			case "announcements":
				let announcements = []

				announcementsRef.child("items").orderByChild("negitive_timestamp").limitToFirst(5).on("child_added", function (snapshot)
				{
					announcements.push(snapshot.val().title)
				})

				announcementsRef.child("items").once("value", function (snapshot)
				{
					usersRef.off("child_added")
					announcements.push("🏠 Back to home")
					let announcementsString = Bot.Message.text("Here are the last 5 announcements. Tap one to get information on it").addResponseKeyboard(announcements)
					callback(announcementsString)
				})
				break

			case "voting_actions":
				let VotingActionsString = Bot.Message.text("What would you like to do concerning voting?").addResponseKeyboard(["Create a poll", "End a poll", "🔙 To Admin Actions"])

				callback(VotingActionsString)
				break

			case "create_a_poll":
				let createAPollString = Bot.Message.text("Send me all the votable items that you would lke to add to this poll in individual texts and end me \"Done\" when you have finished").addResponseKeyboard(["Cancel"], true)

				callback(createAPollString)
				break

			case "add_poll_title":
				let addPollTitleString = Bot.Message.text("What is the title of this poll?").addResponseKeyboard(["Cancel"], true)

				callback(addPollTitleString)
				break

			case "ask_make_poll_announcement":
				let askMakePollAnnouncement = Bot.Message.text("Do you want to send all of the subscribers a notification? (NOTE: ONLY DO THIS IF THE POLL IS IMPORTANT)").addResponseKeyboard(["Yes", "No"])

				callback(askMakePollAnnouncement)
				break

			case "confirm_create_poll":
				let ConfirmCreatePollString = Bot.Message.text("Are you sure you want to create this poll?").addResponseKeyboard(["Yes", "No"])

				callback(ConfirmCreatePollString)
				break

			case "voting":
				var pollTitles = []
				votingRef.child("polls").child("active").limitToLast(19).orderByChild("negitive_timestamp").on("child_added", function (snapshot)
				{
					pollTitles.push(snapshot.val().title)
				})

				votingRef.child("polls").child("active").once("value", function (snapshot)
				{
					pollTitles.push("🔙 To Voting Options")
					let votingString = Bot.Message.text("Here are the current active polls. Click one of them to vote").addResponseKeyboard(pollTitles)

					callback(votingString)
				})
				break

			case "voting_options":
				let votingOptionsString = Bot.Message.text("What do you want to do concerning voting?").addResponseKeyboard(["Vote for a poll", "View poll results", "🏠 Back to home"])

				callback(votingOptionsString)
				break

			case "end_a_poll":
				var pollTitles = []
				votingRef.child("polls").child("active").on("child_added", function (snapshot)
				{
					pollTitles.push(snapshot.val().title)
				})

				votingRef.child("polls").child("active").once("value", function (snapshot)
				{
					pollTitles.push("🔙 To Voting Actions")
					let endVotingString = Bot.Message.text("Here are the current active polls. Click one of them to stop taking responses").addResponseKeyboard(pollTitles)

					callback(endVotingString)
				})
				break

			case "view_poll_results":

				let activePolls = []

				votingRef.child("polls").child("active").on("child_added", function (snapshot)
				{
					activePolls.push(snapshot.val().title)
				})

				votingRef.child("polls").child("active").once("value", function (snapshot)
				{
					activePolls.push("🔙 To Voting Options")
					let viewActivePollsString = Bot.Message.text("Which poll would you like to view the results for?").addResponseKeyboard(activePolls)

					callback(viewActivePollsString)
				})
				break

			case "vote":
				var userVotePendingFound = false
				var userVotePendingKey = ""
				var votingItems = []
				votingRef.child("polls").child("active").on("child_added", function (snapshot)
				{
					var UsersEncodedUsername = message.from
					UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")
					if (snapshot.child("voters").child(UsersEncodedUsername).exists())
					{
						if (snapshot.child("voters").child(UsersEncodedUsername).val() == "pending")
						{
							userVotePendingFound = true
							userVotePendingKey = snapshot.key
						}
					}
				})

				votingRef.child("polls").child("active").once("value", function (snapshot)
				{
					if (userVotePendingFound)
					{
						votingRef.child("polls").child("active").child(userVotePendingKey).child("items").on("child_added", function (snapshot)
						{
							var UsersDecodedUsername = snapshot.key
							UsersDecodedUsername = UsersDecodedUsername.replace(/%2E/g, "\.")
							votingItems.push(UsersDecodedUsername)
						})

						votingRef.child("polls").child("active").child(userVotePendingKey).child("items").once("value", function (snapshot)
						{
							votingItems.push("Cancel")
							let votingItemsString = Bot.Message.text("Choose which item you would like to vote for (Note: you can not change this)").addResponseKeyboard(votingItems)

							callback(votingItemsString)
						})
					}
				})
				break

			case "suggestions_complaints":
				let SuggestComplaintActionsString = Bot.Message.text("Would you like to submit a suggestion or a complaint?").addResponseKeyboard(["Suggestion", "Complaint", "🏠 Back to Home"])

				callback(SuggestComplaintActionsString)
				break

			case "suggestion":
				let SuggestActionsString = Bot.Message.text("What is your suggestion?").addResponseKeyboard(["Cancel"], true)

				callback(SuggestActionsString)
				break

			case "complaint":
				let ComplaintActionsString = Bot.Message.text("What is your complaint?").addResponseKeyboard(["Cancel"], true)

				callback(ComplaintActionsString)
				break

			case "confirm_suggest_complaint":
				let ConfirmCreateSuggestComplaintString = Bot.Message.text("Are you sure this is all you want to say?").addResponseKeyboard(["Yes", "No"])

				callback(ConfirmCreateSuggestComplaintString)
				break
		}
	}

	function sendErrorMessage(message, errorType, callback)
	{
		if (typeof errorType === 'string')
		{
			switch (errorType)
			{
				case "context_error":
					bot.send(Bot.Message.text("There has been a fatal error. Please contact @pjtnt11 to get this issue resolved"), message.from)
					break
			}
		}
		if (typeof callback === 'function')
		{
			callback()
		}
	}


	function adminCheck(message, callback)
	{
		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)
		userRef.child("is_admin").once("value", function (snapshot)
		{
			callback(snapshot.val())
		})
	}


	function getHomeworkString(callback)
	{
		var homeworkString = "Here is today's Homework:\n\n"

		homeworkRef.child("items").on("child_added", function (snapshot)
		{
			var key = snapshot.key
			if (key != "homework")
			{
				homeworkString = homeworkString + snapshot.key + ": " + snapshot.val() + "\n\n"
			}
		})

		homeworkRef.child("items").once("value", function (snapshot)
		{
			usersRef.off("child_added")
			if (snapshot.val() !== null)
			{
				callback(homeworkString)
			}
			else
			{
				homeworkString = "There is no registered homework for today"
				callback(homeworkString)
			}
		})
	}

	bot.onStartChattingMessage((message) =>
	{

		console.log(message.from + "\: \(started chatting\)")

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		let sendingMessage = Bot.Message.text("Welcome to the Bartlett High School Academy Kik Bot!\n\nWith this bot you will be able to vote on current topics, receive daily homework information and get notified of announcements.\n\nThis bot was created from scratch by Patrick Stephen so if you have any questions, contact him at @pjtnt11")

		createUser(message, function (error)
		{
			if (error == null)
			{
				getContextMessage(message, "home", function (contextMessage)
				{
					bot.send([sendingMessage, contextMessage], message.from)
				})
			}
		})
	})

	bot.onPictureMessage((message) =>
	{

		message.markRead()

		console.log(message.from + ": (picture message) " + message.picUrl)

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		userRef.once("value", function (snapshot)
		{
			if (!snapshot.exists())
			{
				createUser(message)
			}
		})

		userRef.child("context").once("value", function (snapshot)
		{
			if (snapshot.val() == "add_announcement_image")
			{
				var announcementData = {}
				announcementData["picture_url"] = message.picUrl
				announcementsRef.child("pending").child(message.from).update(announcementData)

				userRef.update(
				{
					context: "confirm_make_announcement"
				})

				getContextMessage(message, "confirm_make_announcement", function (contextMessage)
				{
					bot.send(contextMessage, message.from)
				})
			}
			else
			{
				getContextMessage(message, snapshot.val(), function (contextMessage)
				{
					bot.send(contextMessage, message.from)
				})
			}
		})
	})

	bot.onVideoMessage((message) =>
	{

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		userRef.once("value", function (snapshot)
		{
			if (!snapshot.exists())
			{
				createUser(message)
			}
		})

		message.markRead()

		console.log(message.from + ": (video message) " + message.videoUrl)

		userRef.child("context").once("value", function (snapshot)
		{
			getContextMessage(message, snapshot.val(), function (contextMessage)
			{
				bot.send(contextMessage, message.from)
			})
		})
	})

	bot.onFriendPickerMessage((message) =>
	{

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		userRef.once("value", function (snapshot)
		{
			if (!snapshot.exists())
			{
				createUser(message)
			}
		})

		message.markRead()

		console.log(message.from + ": (friend picker message) " + message.picked)

		userRef.child("context").once("value", function (snapshot)
		{
			getContextMessage(message, snapshot.val(), function (contextMessage)
			{
				bot.send(contextMessage, message.from)
			})
		})
	})

	bot.onScanDataMessage((message) =>
	{

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		userRef.once("value", function (snapshot)
		{
			if (!snapshot.exists())
			{
				createUser(message)
			}
		})

		message.markRead()

		console.log(message.from + ": (scan data message) " + message.scanData)

		userRef.child("context").once("value", function (snapshot)
		{
			getContextMessage(message, snapshot.val(), function (contextMessage)
			{
				bot.send(contextMessage, message.from)
			})
		})
	})

	bot.onStickerMessage((message) =>
	{

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		userRef.once("value", function (snapshot)
		{
			if (!snapshot.exists())
			{
				createUser(message)
			}
		})

		message.markRead()

		console.log(message.from + ": (sticker message) " + message.stickerUrl)

		userRef.child("context").once("value", function (snapshot)
		{
			getContextMessage(message, snapshot.val(), function (contextMessage)
			{
				bot.send(contextMessage, message.from)
			})
		})
	})

	bot.onTextMessage((message) =>
	{
		console.log(message.from + ": " + message.body)

		if (message.body != "")
		{
			message.markRead()
		}

		var UsersEncodedUsername = message.from
		UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

		let userRef = usersRef.child(UsersEncodedUsername)

		userRef.child("context").once("value", function (snapshot)
		{
			if (!snapshot.exists())
			{
				createUser(message)
			}

			var context = snapshot.val()
			if (message.mention == "bhsacademybot")
			{
				context = "home"
			}
			else
			{
				context = snapshot.val()
			}

			switch (context)
			{

				case "home":
					///////////////////////////////
					// START "HOME" CONTEXT
					///////////////////////////////

					switch (message.body)
					{
						///////////////////////////////
						// START MESSAGE OPTIONS
						///////////////////////////////

						case "":
							message.ignore()
							break

						case "homework":
						case "Homework":
						case "📝":
						case "📝 homework":
						case "📝 Homework":
							getHomeworkString(function (homeworkString)
							{
								getContextMessage(message, context, function (contextMessage)
								{
									if (contextMessage != null)
									{
										message.reply([Bot.Message.text(homeworkString), contextMessage])
									}
									else
									{
										message.reply([Bot.Message.text(homeworkString)])
									}
								})
							})
							break

						case "admins":
						case "Admins":
						case "ℹ️":
						case "ℹ️ admins":
						case "ℹ️ Admins":
							var adminsString = "The current admins are:\n"

							usersRef.on("child_added", function (snapshot)
							{
								if (snapshot.val().is_admin == true && snapshot.key !== "pjtnt11")
								{
									adminsString = adminsString + "@" + snapshot.key + "\n"
								}
							})

							usersRef.once("value", function (snapshot)
							{
								usersRef.off("child_added")
								adminsString = adminsString + "\n" + "Also, @pjtnt11 is the owner and creator of the bot"

								getContextMessage(message, context, function (contextMessage)
								{
									if (contextMessage != null)
									{
										message.reply([Bot.Message.text(adminsString), contextMessage])
									}
									else
									{
										message.reply([Bot.Message.text(adminsString)])
									}
								})
							})
							break

						case "settings":
						case "Settings":
						case "⚙":
						case "⚙ settings":
						case "⚙ Settings":
							userRef.update(
							{
								context: "settings"
							})

							getContextMessage(message, "settings", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break



						case "Admin Actions":
						case "admin actions":
						case "Admin actions":
						case "🔒":
						case "🔒 admin actions":
						case "🔒 Admin actions":
						case "🔒 Admin Actions":

							adminCheck(message, function (is_admin)
							{
								if (is_admin)
								{
									let adminNoteString = Bot.Message.text("Note: Only admins can access this page. If you want to see a list of the current admins, use the \"admins\" command")

									userRef.update(
									{
										context: "admin_actions"
									})

									getContextMessage(message, "admin_actions", function (contextMessage)
									{
										bot.send([adminNoteString, contextMessage], message.from)
									})
								}
								else
								{
									getContextMessage(message, context, function (contextMessage)
									{
										bot.send(contextMessage, message.from)
									})
								}
							})

							break
						case "Latest Announcement":
						case "latest announcement":
						case "Latest announcement":
						case "📢 latest announcement":
						case "📢 Latest Announcement":
							announcementsRef.child("items").limitToLast(1).once("child_added", function (snapshot)
							{
								let announcementString = "Announcement from @" + snapshot.val().from + " - \n\n" + snapshot.val().title + ":\n\n" + snapshot.val().body

								if (snapshot.val().picture_url !== undefined)
								{
									let picture = Bot.Message.picture(snapshot.val().picture_url)

									getContextMessage(message, context, function (contextMessage)
									{
										if (contextMessage !== null)
										{
											message.reply([announcementString, picture, contextMessage], message.from)
										}
										else
										{
											message.reply([announcementString, picture], message.from)
										}
									})
								}
								else
								{
									getContextMessage(message, context, function (contextMessage)
									{
										if (contextMessage !== null)
										{
											message.reply([announcementString, contextMessage], message.from)
										}
										else
										{
											message.reply([announcementString], message.from)
										}
									})
								}
							})
							break

						case "📢 Announcements":
						case "📢 announcements":
						case "announcements":
						case "Announcements":
							userRef.update(
							{
								context: "announcements"
							})

							getContextMessage(message, "announcements", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "🗳 Voting":
						case "Voting":
							userRef.update(
							{
								context: "voting_options"
							})

							getContextMessage(message, "voting_options", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "📊 Stats":
						case "Stats":
						case "stats":
							var numRegisteredUsers = 0
							var numSubscribedUsers = 0
							var numAdmins = 0

							usersRef.on("child_added", function (snapshot)
							{
								if (snapshot.val().subscribed == true)
								{
									numSubscribedUsers++
								}
								if (snapshot.val().is_admin == true)
								{
									numAdmins++
								}
							})

							usersRef.once("value", function (snapshot)
							{
								numRegisteredUsers = snapshot.numChildren()
								let statsString = Bot.Message.text("There are currently " + numRegisteredUsers + " users registered in the database. Of those, " + numSubscribedUsers + " are subscribed and " + numAdmins + " are admins")

								getContextMessage(message, "home", function (contextMessage)
								{
									if (contextMessage != null)
									{
										message.reply([statsString, contextMessage], message.from)
									}
									else
									{
										message.reply([statsString], message.from)
									}
								})
							})
							break

						case "📲 Complaints/Suggestions":
						case "📲 complaints/suggestions":
						case "📲 complaints/Suggestions":
						case "📲 Complaints/suggestions":
						case "📲 Suggestions/Complaints":
						case "📲 suggestions/complaints":
						case "📲 Suggestions/complaints":
						case "📲 suggestions/Complaints":
						case "Complaints/Suggestions":
						case "complaints/suggestions":
						case "complaints/Suggestions":
						case "Complaints/suggestions":
						case "Suggestions/Complaints":
						case "suggestions/complaints":
						case "Suggestions/complaints":
						case "suggestions/Complaints":
						case "Suggestions":
						case "suggestions":
						case "Complaints":
						case "complaints":
						case "📲":
							userRef.update(
							{
								context: "suggestions_complaints"
							})

							getContextMessage(message, "suggestions_complaints", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						default:
							//sendErrorMessage(message, "default")
							getContextMessage(message, context, function (contextMessage)
							{
								if (contextMessage !== null)
								{
									bot.send(contextMessage, message.from)
								}
							})
							break
					}
					///////////////////////////////
					// END MESSAGE OPTIONS
					///////////////////////////////

					break
					///////////////////////////////
					// END "HOME" CONTEXT
					///////////////////////////////

				case "settings":
					///////////////////////////////
					// START "SETTINGS" CONTEXT
					///////////////////////////////

					switch (message.body)
					{
						///////////////////////////////
						// START MESSAGE OPTIONS
						///////////////////////////////

						case "subscribe":
						case "Subscribe":

							userRef.once("value", function (snapshot)
							{
								if (!snapshot.exists())
								{
									createUser(message)
								}

								userRef.update(
								{
									context: "home"
								})
							})

							let subscribeSuccessText = Bot.Message.text("You are now subscribed to receive homework and announcement notifications")
							let subscribeErrorText = Bot.Message.text("You are already subscribed to receive homework and announcement notifications")

							userRef.child("subscribed").once("value", function (snapshot)
							{
								if (!snapshot.exists())
								{
									createUser(message)
								}

								if (snapshot.val() === true)
								{
									getContextMessage(message, "home", function (contextMessage)
									{
										bot.send([subscribeErrorText, contextMessage], message.from)
									})
								}
								else
								{
									userRef.update(
									{
										subscribed: true
									})

									getContextMessage(message, "home", function (contextMessage)
									{
										bot.send([subscribeSuccessText, contextMessage], message.from)
									})
								}
							})
							break

						case "unsubscribe":
						case "Unsubscribe":

							userRef.update(
							{
								context: "home"
							})

							let unsubscribeSuccessText = Bot.Message.text("You are now unsubscribed")
							let unsubscribeErrorText = Bot.Message.text("You already aren't subscribed to receive homework and announcement notifications")

							userRef.child("subscribed").once("value", function (snapshot)
							{
								if (snapshot.val() === false)
								{
									getContextMessage(message, "home", function (contextMessage)
									{
										if (contextMessage !== null)
										{
											bot.send([unsubscribeErrorText, contextMessage], message.from)
										}
										else
										{
											bot.send([unsubscribeErrorText], message.from)
										}
									})
								}
								else
								{
									userRef.update(
									{
										subscribed: false
									})
									getContextMessage(message, "home", function (contextMessage)
									{
										if (contextMessage !== null)
										{
											bot.send([unsubscribeSuccessText, contextMessage], message.from)
										}
										else
										{
											bot.send([unsubscribeSuccessText], message.from)
										}
									})
								}
							})
							break

						case "cancel":
						case "Cancel":

							userRef.update(
							{
								context: "home"
							})

							getContextMessage(message, "home", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						default:
							//sendErrorMessage(message)
							getContextMessage(message, context, function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break
					}

					break
					///////////////////////////////
					// END "SETTINGS" CONTEXT
					///////////////////////////////

				case "admin_actions":
					///////////////////////////////
					// START "ADMIN ACTIONS" CONTEXT
					///////////////////////////////

					switch (message.body)
					{
						case "back":
						case "Back":
						case "🔙":
						case "🏠 Back to home":
							userRef.update(
							{
								context: "home"
							})

							getContextMessage(message, "home", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "Homework":
						case "homework":
							userRef.update(
							{
								context: "homework_actions"
							})

							getContextMessage(message, "homework_actions", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "Voting":
						case "voting":
							userRef.update(
							{
								context: "voting_actions"
							})

							getContextMessage(message, "voting_actions", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "Make an announcement":

							userRef.update(
							{
								context: "make_an_announcement"
							})

							getContextMessage(message, "make_an_announcement", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						default:
							getContextMessage(message, context, function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
					}
					break
					///////////////////////////////
					// END "ADMIN ACTIONS" CONTEXT
					///////////////////////////////

				case "voting":

					var pollTitles = []
					var titleMatch = false

					var pollRef = votingRef.child("polls")
					votingRef.child("polls").child("active").on("child_added", function (snapshot)
					{
						if (snapshot.val().title == message.body)
						{
							titleMatch = true
							pollRef = votingRef.child("polls").child("active").child(snapshot.key)
						}
					})

					votingRef.child("polls").child("active").once("value", function (snapshot)
					{
						if (titleMatch == true)
						{

							var UsersEncodedUsername = message.from
							UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

							pollRef.child("voters").child(UsersEncodedUsername).once("value", function (snapshot)
							{
								if (!snapshot.exists())
								{
									var data = {}
									data[UsersEncodedUsername] = "pending"
									pollRef.child("voters").update(data)

									userRef.update(
									{
										context: "vote"
									})

									getContextMessage(message, "vote", function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
								}
								else
								{
									userRef.update(
									{
										context: "voting"
									})

									getContextMessage(message, "voting", function (contextMessage)
									{
										let votingErrorString = "You have already voted for this poll"
										bot.send([votingErrorString, contextMessage], message.from)
									})
								}
							})
						}
						else
						{
							switch (message.body)
							{
								case "🔙 To Voting Options":
									userRef.update(
									{
										context: "voting_options"
									})

									getContextMessage(message, "voting_options", function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
									break

								default:
									getContextMessage(message, context, function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
									break
							}
						}
					})
					break

				case "announcements":

					var announcementFound = false

					announcementsRef.child("items").orderByChild("negitive_timest`amp").limitToFirst(5).on("child_added", function (snapshot)
					{
						if (snapshot.val().title === message.body)
						{
							announcementFound = true
							let announcementString = "Announcement from @" + snapshot.val().from + " -\n\n" + snapshot.val().body

							if (snapshot.val().picture_url !== undefined)
							{

								let picture = Bot.Message.picture(snapshot.val().picture_url)

								getContextMessage(message, context, function (contextMessage)
								{
									if (contextMessage !== null)
									{
										bot.send([announcementString, picture, contextMessage], message.from)

									}
									else
									{
										bot.send([announcementString, picture], message.from)

									}
								})
							}
							else
							{

								getContextMessage(message, context, function (contextMessage)
								{
									if (contextMessage !== null)
									{
										bot.send([announcementString, contextMessage], message.from)

									}
									else
									{
										bot.send([announcementString], message.from)

									}
								})
							}
						}
					})

					announcementsRef.child("items").once("value", function (snapshot)
					{
						if (announcementFound === false)
						{
							if (message.body == "🏠 Back to home")
							{
								userRef.update(
								{
									context: "home"
								})

								getContextMessage(message, "home", function (contextMessage)
								{
									bot.send(contextMessage, message.from)
								})
							}
							else
							{
								getContextMessage(message, context, function (contextMessage)
								{
									bot.send(contextMessage, message.from)
								})
							}
						}
					})
					break

				case "vote":

					var userVotePendingFound = false
					var userVotePendingKey = ""

					if (message.body == "Cancel")
					{

						votingRef.child("polls").child("active").on("child_added", function (snapshot)
						{
							var UsersEncodedUsername = message.from
							UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")
							if (snapshot.child("voters").child(UsersEncodedUsername).exists())
							{
								if (snapshot.child("voters").child(UsersEncodedUsername).val() == "pending")
								{
									userVotePendingFound = true
									userVotePendingKey = snapshot.key
								}
							}
						})

						votingRef.child("polls").child("active").once("value", function (snapshot)
						{
							if (userVotePendingFound)
							{
								votingRef.child("polls").child("active").child(userVotePendingKey).child("voters").child(message.from).set(null)
							}
						})

						userRef.update(
						{
							context: "voting"
						})

						getContextMessage(message, "voting", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						var UsersEncodedUsername = message.from
						UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")
						votingRef.child("polls").child("active").on("child_added", function (snapshot)
						{
							if (snapshot.child("voters").child(UsersEncodedUsername).exists())
							{
								if (snapshot.child("voters").child(UsersEncodedUsername).val() == "pending")
								{
									userVotePendingFound = true
									userVotePendingKey = snapshot.key
								}
							}
						})

						var encodedItemName = message.body
						encodedItemName = encodedItemName.replace(/\./g, "%2E")
						votingRef.child("polls").child("active").child(userVotePendingKey).child("items").child(encodedItemName).once("value", function (snapshot)
						{

							if (snapshot.exists())
							{
								var VoteData = {}
								votingRef.child("polls").child("active").child(userVotePendingKey).child("items").child(encodedItemName).once("value", function (snapshot)
								{
									VoteData[encodedItemName] = snapshot.val() + 1
								})
								votingRef.child("polls").child("active").child(userVotePendingKey).child("items").update(VoteData)

								var UsersEncodedUsername = message.from
								UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

								var VoterData = {}
								VoterData[UsersEncodedUsername] = message.body

								votingRef.child("polls").child("active").child(userVotePendingKey).child("voters").update(VoterData)

								userRef.update(
								{
									context: "voting"
								})

								getContextMessage(message, "voting", function (contextMessage)
								{
									let thanksForVotingString = "Thank you for voting!"
									bot.send([thanksForVotingString, contextMessage], message.from)
								})
							}
							else
							{
								getContextMessage(message, context, function (contextMessage)
								{
									bot.send([contextMessage], message.from)
								})
							}
						})
					}
					break

				case "homework_actions":
					switch (message.body)
					{
						case "Add homework item":
							userRef.update(
							{
								context: "add_homework_item"
							})

							getContextMessage(message, "add_homework_item", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "Show homework":
						case "homework":
						case "Homework":
							getHomeworkString(function (homeworkString)
							{
								getContextMessage(message, context, function (contextMessage)
								{
									if (contextMessage != null)
									{
										bot.send([Bot.Message.text(homeworkString), contextMessage], message.from)
									}
									else
									{
										bot.send([Bot.Message.text(homeworkString)], message.from)
									}
								})
							})

							break

						case "Remove homework item":
							userRef.update(
							{
								context: "remove_homework_item"
							})

							getContextMessage(message, "remove_homework_item", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "Manually clear homework":
							userRef.update(
							{
								context: "clear_homework"
							})

							getContextMessage(message, "clear_homework", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "Enable homework auto clear":
							userRef.update(
							{
								context: "enable_homework_auto_clear"
							})

							getContextMessage(message, "enable_homework_auto_clear", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "Disable homework auto clear":
							userRef.update(
							{
								context: "disable_homework_auto_clear"
							})

							getContextMessage(message, "disable_homework_auto_clear", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "Enable homework notifications":
							userRef.update(
							{
								context: "enable_homework_notifications"
							})

							getContextMessage(message, "enable_homework_notifications", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "Disable homework notifications":
							userRef.update(
							{
								context: "disable_homework_notifications"
							})

							getContextMessage(message, "disable_homework_notifications", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "🔙 To Admin Actions":
							userRef.update(
							{
								context: "admin_actions"
							})

							getContextMessage(message, "admin_actions", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						default:
							getContextMessage(message, context, function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})

							break
					}

					break

				case "add_poll_title":
					if (message.body == "Cancel")
					{
						votingRef.child("pending").child(message.from).set(null)
						userRef.update(
						{
							context: "voting_actions"
						})

						getContextMessage(message, "voting_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						let data = {}
						data["title"] = message.body
						votingRef.child("pending").child(message.from).update(data)

						userRef.update(
						{
							context: "create_a_poll"
						})

						getContextMessage(message, "create_a_poll", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "voting_actions":
					switch (message.body)
					{

						case "Create a poll":
							userRef.update(
							{
								context: "add_poll_title"
							})

							getContextMessage(message, "add_poll_title", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "End a poll":
							userRef.update(
							{
								context: "end_a_poll"
							})

							getContextMessage(message, "end_a_poll", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "🔙 To Admin Actions":
							userRef.update(
							{
								context: "admin_actions"
							})

							getContextMessage(message, "admin_actions", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break
					}
					break

				case "suggestions_complaints":
					switch (message.body)
					{

						case "Suggestion":
							userRef.update(
							{
								context: "suggestion"
							})

							getContextMessage(message, "suggestion", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "Complaint":
							userRef.update(
							{
								context: "complaint"
							})

							getContextMessage(message, "complaint", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						case "🏠 Back to Home":
							userRef.update(
							{
								context: "home"
							})

							getContextMessage(message, "home", function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break

						default:
							getContextMessage(message, context, function (contextMessage)
							{
								bot.send([contextMessage], message.from)
							})
							break
					}
					break

				case "clear_homework":
					if (message.body == "Yes")
					{

						homeworkRef.child("items").set(null)

						userRef.update(
						{
							context: "homework_actions"
						})

						let clearedAllHomeworkString = "Homework has been cleared"
						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([clearedAllHomeworkString, contextMessage], message.from)
						})
					}
					else if (message.body == "No")
					{
						homeworkRef.child("pending_items").child(message.from).set(null)

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "enable_homework_notifications":
					if (message.body == "Yes")
					{

						homeworkRef.update(
						{
							notifications_enabled: true
						})

						userRef.update(
						{
							context: "homework_actions"
						})

						let EnableHomeworkNotificationsString = "Homework notifications has been enabled"

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([EnableHomeworkNotificationsString, contextMessage], message.from)
						})
					}
					else if (message.body == "No")
					{

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([contextMessage], message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "disable_homework_notifications":
					if (message.body == "Yes")
					{

						homeworkRef.update(
						{
							notifications_enabled: false
						})

						userRef.update(
						{
							context: "homework_actions"
						})

						let DisableHomeworkNotificationsString = "Homework notifications has been disabled"

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([DisableHomeworkNotificationsString, contextMessage], message.from)
						})
					}
					else if (message.body == "No")
					{

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([contextMessage], message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "enable_homework_auto_clear":
					if (message.body == "Yes")
					{

						homeworkRef.update(
						{
							auto_clear_enabled: true
						})

						userRef.update(
						{
							context: "homework_actions"
						})

						let EnableHomeworkAutoClearString = "Homework auto clear has been enabled"

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([EnableHomeworkAutoClearString, contextMessage], message.from)
						})
					}
					else if (message.body == "No")
					{

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([contextMessage], message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "end_a_poll":
					var titleMatch = false
					var pollRef = votingRef.child("polls")

					votingRef.child("polls").child("active").on("child_added", function (snapshot)
					{
						if (snapshot.val().title == message.body)
						{
							titleMatch = true
							pollRef = votingRef.child("polls").child("active").child(snapshot.key)
						}
					})

					votingRef.child("polls").child("active").once("value", function (snapshot)
					{
						if (titleMatch == true)
						{
							let pendingVoters = []
							pollRef.child("voters").on("child_added", function (snapshot)
							{

								if (snapshot.val() == "pending")
								{
									var UsersDecodedUsername = snapshot.key
									UsersDecodedUsername = UsersDecodedUsername.replace(/%2E/g, "\.")
									pendingVoters.push(UsersDecodedUsername)
								}
							})

							pollRef.child("voters").once("value", function (snapshot)
							{
								getContextMessage(message, "voting_actions", function (contextMessage)
								{
									if (pendingVoters.length != 0)
									{
										bot.broadcast(["Sorry, this poll has been deactivated", contextMessage], pendingVoters)
									}
								})

								pendingVoters.forEach(function (userName)
								{
									var encodedUsersUsername = userName
									encodedUsersUsername = encodedUsersUsername.replace(/\./g, "%2E")
									usersRef.child(encodedUsersUsername).update(
									{
										context: "voting_options"
									})
								})
							})

							pollRef.once("value", function (snapshot)
							{
								var data = {}
								data[snapshot.key] = snapshot.val()
								votingRef.child("polls").child("deactivated").update(data)
								pollRef.set(null)

								userRef.update(
								{
									context: "voting_actions"
								})

								getContextMessage(message, "voting_actions", function (contextMessage)
								{
									bot.send([contextMessage], message.from)
								})

							})
						}
						else
						{
							switch (message.body)
							{
								case "🔙 To Voting Actions":
									userRef.update(
									{
										context: "voting_actions"
									})

									getContextMessage(message, "voting_actions", function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
									break

								default:
									getContextMessage(message, context, function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
									break
							}
						}
					})
					break

				case "disable_homework_auto_clear":
					if (message.body == "Yes")
					{

						homeworkRef.update(
						{
							auto_clear_enabled: false
						})

						let DisableHomeworkAutoClearString = "Homework auto clear has been disabled"

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([DisableHomeworkAutoClearString, contextMessage], message.from)
						})
					}
					else if (message.body == "No")
					{

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([contextMessage], message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "add_homework_item":

					if (message.body != "Cancel" && message.body != "cancel")
					{
						var homeworkData = {}

						homeworkRef.child("items").child(message.body).once("value", function (snapshot)
						{
							if (snapshot.exists())
							{
								homeworkData[message.from] = message.body
								homeworkRef.child("pending_items").set(homeworkData)

								userRef.update(
								{
									context: "confirm_add_homework_item"
								})

								getContextMessage(message, "confirm_add_homework_item", function (contextMessage)
								{
									bot.send(contextMessage, message.from)
								})
							}
							else
							{
								homeworkData[message.from] = message.body
								homeworkRef.child("pending_items").set(homeworkData)

								userRef.update(
								{
									context: "add_homework_item_body"
								})

								getContextMessage(message, "add_homework_item_body", function (contextMessage)
								{
									bot.send(contextMessage, message.from)
								})
							}
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						userRef.update(
						{
							context: "admin_actions"
						})

						getContextMessage(message, "admin_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "add_homework_item_body":

					if (message.body != "Cancel" && message.body != "cancel")
					{
						let addedHomeworkConfirmation = "Homework item added"
						var homeworkData = {}

						homeworkRef.child("pending_items").child(message.from).once("value", function (snapshot)
						{
							homeworkData[snapshot.val()] = message.body
							homeworkRef.child("items").update(homeworkData)
							homeworkRef.child("pending_items").child(message.from).set(null)
						})

						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send([addedHomeworkConfirmation, contextMessage], message.from)
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						userRef.update(
						{
							context: "homework_actions"
						})

						getContextMessage(message, "homework_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "remove_homework_item":
					if (message.body != "Cancel")
					{
						homeworkRef.child("items").child(message.body).once("value", function (snapshot)
						{
							if (snapshot.exists())
							{
								let homeworkItemRemovedString = "Successfully removed homework item"
								homeworkRef.child("items").child(message.body).set(null)
								userRef.update(
								{
									context: "homework_actions"
								})
								getContextMessage(message, "homework_actions", function (contextMessage)
								{
									bot.send(contextMessage, message.from)
								})
							}
							else
							{
								getContextMessage(message, "homework_actions", function (contextMessage)
								{
									bot.send([contextMessage], message.from)
								})
							}
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						userRef.update(
						{
							context: "admin_actions"
						})
						getContextMessage(message, "admin_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "confirm_add_homework_item":
					var homeworkData = {}

					if (message.body == "Yes")
					{
						userRef.update(
						{
							context: "add_homework_item_body"
						})

						getContextMessage(message, "add_homework_item_body", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "No")
					{
						homeworkRef.child("pending_items").child(message.from).set(null)

						userRef.update(
						{
							context: "admin_actions"
						})

						getContextMessage(message, "admin_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "make_an_announcement":
					if (message.body != "Cancel")
					{
						var announcementData = {}
						announcementData["title"] = message.body
						announcementsRef.child("pending").child(message.from).update(announcementData)

						userRef.update(
						{
							context: "add_announcement_body"
						})

						getContextMessage(message, "add_announcement_body", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						userRef.update(
						{
							context: "admin_actions"
						})

						getContextMessage(message, "admin_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "add_announcement_body":
					if (message.body != "Cancel")
					{
						var announcementData = {}
						announcementData["body"] = message.body
						announcementsRef.child("pending").child(message.from).update(announcementData)

						userRef.update(
						{
							context: "ask_announcement_image"
						})

						getContextMessage(message, "ask_announcement_image", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						announcementsRef.child("pending").child(message.from).set(null)
						userRef.update(
						{
							context: "admin_actions"
						})

						getContextMessage(message, "admin_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "ask_announcement_image":

					if (message.body == "Yes")
					{
						userRef.update(
						{
							context: "add_announcement_image"
						})

						getContextMessage(message, "add_announcement_image", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "No")
					{
						userRef.update(
						{
							context: "confirm_make_announcement"
						})

						getContextMessage(message, "confirm_make_announcement", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "create_a_poll":
					if (message.body == "Cancel")
					{
						votingRef.child("pending").child(message.from).set(null)
						userRef.update(
						{
							context: "voting_actions"
						})

						getContextMessage(message, "voting_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "Done")
					{
						userRef.update(
						{
							context: "ask_make_poll_announcement"
						})

						getContextMessage(message, "ask_make_poll_announcement", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else if (message.body == "Dismiss")
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						var encodedVoteResponce = message.body
						encodedVoteResponce = encodedVoteResponce.replace(/\./g, "%2E")

						var usersEncodedUsername = message.from
						usersEncodedUsername = usersEncodedUsername.replace(/\./g, "%2E")
						let data = {}

						data[encodedVoteResponce] = true
						votingRef.child("pending").child(usersEncodedUsername).child("items").update(data)

						bot.send(Bot.Message.text("\"" + message.body + "\" added").addResponseKeyboard(["Done", "Cancel"], true), message.from)
					}
					break

				case "confirm_create_poll":
					if (message.body == "Yes")
					{
						let pollRef = votingRef.child("polls").child("active").push()
						var timestamp = {}
						var data = {}
						timestamp["negitive_timestamp"] = (new Date() / 1000) * -1
						pollRef.update(timestamp)
						votingRef.child("pending").child(message.from).child("items").on("child_added", function (snapshot)
						{
							data[snapshot.key] = 0
							pollRef.child("items").update(data)
						})

						votingRef.child("pending").child(message.from).child("title").once("value", function (snapshot)
						{
							let makeAnnouncement = false

							var usersEncodedUsername = message.from
							usersEncodedUsername = usersEncodedUsername.replace(/\./g, "%2E")

							votingRef.child("pending").child(usersEncodedUsername).child("make_announcement").once("value", function (snapshot)
							{
								let makeAnnouncement = snapshot.val()
							})

							var data = {}
							data["title"] = snapshot.val()
							data["from"] = message.from
							pollRef.update(data)
							votingRef.child("pending").child(message.from).set(null)

							var subscribers = []

							usersRef.on("child_added", function (snapshot)
							{
								var UsersEncodedUsername = message.from
								UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

								if (snapshot.val().subscribed == true && snapshot.key !== UsersEncodedUsername)
								{
									var UsersDecodedUsername = snapshot.key
									UsersDecodedUsername = UsersDecodedUsername.replace(/%2E/g, "\.")

									subscribers.push(UsersDecodedUsername)
								}
							})

							usersRef.once("value", function (snapshot)
							{

								userRef.update(
								{
									context: "voting_actions"
								})

								usersRef.off("child_added")
								var UsersEncodedUsername = message.from
								UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

								let votingAnnouncementString = Bot.Message.text("A new poll has been created by @" + message.from + " with the question \"" + data["title"] + "\" go cast your vote in the voting menu!").addResponseKeyboard(["Dismiss"])
								if (makeAnnouncement)
								{
									bot.broadcast(votingAnnouncementString, subscribers)
								}
								getContextMessage(message, "voting_actions", function (contextMessage)
								{
									bot.send(["Poll created", contextMessage], message.from)
								})
							})
						})
					}
					else if (message.body == "No")
					{
						votingRef.child("pending").child(message.from).set(null)
						userRef.update(
						{
							context: "voting_actions"
						})

						getContextMessage(message, "voting_actions", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "ask_make_poll_announcement":
					if (message.body == "Yes")
					{
						var UsersEncodedUsername = message.from
						UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

						var data = {}
						data["make_announcement"] = true

						votingRef.child("pending").child(UsersEncodedUsername).update(data)

						userRef.update(
						{
							context: "confirm_create_poll"
						})

						getContextMessage(message, "confirm_create_poll", function (contextMessage)
						{
							bot.send([contextMessage], message.from)
						})
					}
					else if (message.body == "No")
					{
						var UsersEncodedUsername = message.from
						UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")
						var data = {}
						data["make_announcement"] = false
						votingRef.child("pending").child(UsersEncodedUsername).update(data)
						userRef.update(
						{
							context: "confirm_create_poll"
						})

						getContextMessage(message, "confirm_create_poll", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "voting_options":
					switch (message.body)
					{
						case "Vote for a poll":
							userRef.update(
							{
								context: "voting"
							})

							getContextMessage(message, "voting", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "View poll results":
							userRef.update(
							{
								context: "view_poll_results"
							})

							getContextMessage(message, "view_poll_results", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						case "🏠 Back to home":
							userRef.update(
							{
								context: "home"
							})

							getContextMessage(message, "home", function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break

						default:
							getContextMessage(message, context, function (contextMessage)
							{
								bot.send(contextMessage, message.from)
							})
							break
					}
					break

				case "view_poll_results":
					var pollTitles = []
					var titleMatch = false

					var pollRef = votingRef.child("polls")
					votingRef.child("polls").child("active").on("child_added", function (snapshot)
					{
						if (snapshot.val().title == message.body)
						{
							titleMatch = true
							pollRef = votingRef.child("polls").child("active").child(snapshot.key)
						}
					})

					votingRef.child("polls").child("active").once("value", function (snapshot)
					{
						if (titleMatch == true)
						{

							var UsersEncodedUsername = message.from

							UsersEncodedUsername = UsersEncodedUsername.replace(/\./g, "%2E")

							pollRef.child("voters").child(UsersEncodedUsername).once("value", function (snapshot)
							{
								if (snapshot.exists())
								{
									var votingResultString = "Here are the current results for this poll:\n\n"

									pollRef.child("items").on("child_added", function (snapshot)
									{
										var decodedPollResponce = snapshot.key
										decodedPollResponce = decodedPollResponce.replace(/%2E/g, "\.")
										votingResultString = votingResultString + decodedPollResponce + " - " + snapshot.val() + "\n"
									})

									pollRef.child("items").once("value", function (snapshot)
									{
										getContextMessage(message, context, function (contextMessage)
										{
											bot.send([votingResultString, contextMessage], message.from)
										})
									})
								}
								else
								{
									getContextMessage(message, "view_poll_results", function (contextMessage)
									{
										let viewVotingErrorString = "You must vote for this poll before you can view its results"
										bot.send([viewVotingErrorString, contextMessage], message.from)
									})
								}
							})
						}
						else
						{
							switch (message.body)
							{
								case "🔙 To Voting Options":
									userRef.update(
									{
										context: "voting_options"
									})

									getContextMessage(message, "voting_options", function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
									break

								default:
									getContextMessage(message, context, function (contextMessage)
									{
										bot.send([contextMessage], message.from)
									})
									break
							}
						}
					})
					break

				case "confirm_make_announcement":
					if (message.body == "Yes")
					{
						announcementsRef.child("pending").child(message.from).once("value", function (snapshot)
						{

							let announcementRef = announcementsRef.child("items").push()

							let announcementItems = []
							var announcementData = {}
							announcementData["title"] = snapshot.val().title
							announcementData["body"] = snapshot.val().body
							announcementData["from"] = message.from
							announcementData["negitive_timestamp"] = (new Date() / 1000) * -1

							announcementsRef.child("pending").child(message.from).child("picture_url").once("value", function (snapshot)
							{
								if (snapshot.exists())
								{
									announcementData["picture_url"] = snapshot.val()
								}
								announcementRef.update(announcementData)
							})

							announcementItems.push(Bot.Message.text("New announcement from @" + message.from + " - \n\n" + snapshot.val().title + ":\n\n" + snapshot.val().body).addResponseKeyboard(["Dismiss"]))

							announcementsRef.child("pending").child(message.from).child("picture_url").once("value", function (snapshot)
							{
								if (snapshot.exists())
								{
									announcementItems.push(Bot.Message.picture(snapshot.val()).addResponseKeyboard(["Dismiss"]))
								}
							})

							var subscribers = []

							usersRef.on("child_added", function (snapshot)
							{
								if (snapshot.val().subscribed == true && snapshot.key !== message.from)
								{
									var UsersDecodedUsername = snapshot.key
									UsersDecodedUsername = UsersDecodedUsername.replace(/%2E/g, "\.")

									subscribers.push(UsersDecodedUsername)
								}
							})

							usersRef.once("value", function (snapshot)
							{
								usersRef.off("child_added")
								bot.broadcast(announcementItems, subscribers)

								announcementsRef.child("pending").child(message.from).set(null)

								let announcementSentConfirmation = "Your announcement has been sent"
								userRef.update(
								{
									context: "admin_actions"
								})

								getContextMessage(message, "admin_actions", function (contextMessage)
								{
									bot.send([announcementSentConfirmation, contextMessage], message.from)
								})
							})
						})
					}
					else if (message.body == "No")
					{
						announcementsRef.child("pending").child(message.from).set(null)

						userRef.update(
						{
							context: "admin_actions"
						})

						getContextMessage(message, "admin_actions", function (contextMessage)
						{
							bot.send([contextMessage], message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "suggestion":
					var suggestRef = suggestComplaintRef.child("suggestions")

					var usersEncodedUsername = message.from
					usersEncodedUsername = usersEncodedUsername.replace(/\./g, "%2E")

					if (message.body == "Cancel")
					{
						suggestRef.child("pending").child(usersEncodedUsername).set(null)
						userRef.update(
						{
							context: "suggestions_complaints"
						})

						getContextMessage(message, "suggestions_complaints", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						let data = {}
						data["body"] = message.body
						suggestRef.child("pending").child(usersEncodedUsername).update(data)

						userRef.update(
						{
							context: "confirm_suggest"
						})

						getContextMessage(message, "confirm_suggest_complaint", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "complaint":
					var complaintRef = suggestComplaintRef.child("complaints")

					var usersEncodedUsername = message.from
					usersEncodedUsername = usersEncodedUsername.replace(/\./g, "%2E")

					if (message.body == "Cancel")
					{
						complaintRef.child("pending").child(usersEncodedUsername).set(null)
						userRef.update(
						{
							context: "suggestions_complaints"
						})

						getContextMessage(message, "suggestions_complaints", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						let data = {}
						data["body"] = message.body
						complaintRef.child("pending").child(usersEncodedUsername).update(data)

						userRef.update(
						{
							context: "confirm_complaint"
						})

						getContextMessage(message, "confirm_suggest_complaint", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "confirm_suggest":
					if (message.body == "Yes")
					{
						let suggestRef = suggestComplaintRef.child("suggestions").child("items").push()
						var data = {}

						var usersEncodedUsername = message.from
						usersEncodedUsername = usersEncodedUsername.replace(/\./g, "%2E")

						suggestComplaintRef.child("suggestions").child("pending").child(usersEncodedUsername).child("body").once("value", function (snapshot)
						{
							var data = {}
							data["timestamp"] = (new Date() / 1000)
							data["suggestion"] = snapshot.val()
							data["from"] = message.from
							suggestRef.update(data)

							suggestComplaintRef.child("suggestions").child("pending").child(usersEncodedUsername).set(null)

							usersRef.on("child_added", function (snapshot)
							{

								usersRef.once("value", function (snapshot)
								{

									userRef.update(
									{
										context: "home"
									})

									usersRef.off("child_added")
									getContextMessage(message, "home", function (contextMessage)
									{
										bot.send(["Thanks for the suggestion! We'll review it and hopefully add it as soon as we can.", contextMessage], message.from)
									})
								})
							})
						})
					}
					else if (message.body == "No")
					{
						suggestComplaintRef.child("pending").child(message.from).set(null)
						userRef.update(
						{
							context: "suggestion"
						})

						getContextMessage(message, "suggestion", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				case "confirm_complaint":
					if (message.body == "Yes")
					{
						let complaintRef = suggestComplaintRef.child("complaints").child("items").push()
						var data = {}

						var usersEncodedUsername = message.from
						usersEncodedUsername = usersEncodedUsername.replace(/\./g, "%2E")

						suggestComplaintRef.child("complaints").child("pending").child(usersEncodedUsername).child("body").once("value", function (snapshot)
						{
							var data = {}
							data["timestamp"] = (new Date() / 1000)
							data["body"] = snapshot.val()
							data["from"] = message.from
							complaintRef.update(data)
							suggestComplaintRef.child("complaints").child("pending").child(usersEncodedUsername).set(null)

							usersRef.on("child_added", function (snapshot)
							{

								usersRef.once("value", function (snapshot)
								{

									userRef.update(
									{
										context: "home"
									})

									usersRef.off("child_added")
									getContextMessage(message, "home", function (contextMessage)
									{
										bot.send(["Sorry about that, we'll get to fixing it right away!", contextMessage], message.from)
									})
								})
							})
						})
					}
					else if (message.body == "No")
					{
						suggestComplaintRef.child("pending").child(message.from).set(null)
						userRef.update(
						{
							context: "complaint"
						})

						getContextMessage(message, "complaint", function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					else
					{
						getContextMessage(message, context, function (contextMessage)
						{
							bot.send(contextMessage, message.from)
						})
					}
					break

				default:
					sendErrorMessage(message, "context_error")
					break
			}
		})
	})

	let server = http
		.createServer(bot.incoming())
		.listen(80)
	console.log("Server running")
