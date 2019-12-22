# Twitch Bot

## Install

to install the code and dependencies
```
git clone https://github.com/ChatbotStudy/Pete-Chatbot
npm install
```
Fill out the missing parts of the code, including all of the authorization tokens and configurations.

## Using a different account
If you need to use a different account, you can
1. generate an authorization token for that different account [here](https://twitchapps.com/tmi/)
2. change the username value accordingly inside opts (which is inside bot.js)
```
const opts = {
  options:{
    debug: true
  },
  identity: {
    username: <YOUR USERNAME HERE>,
    password: <YOUR OAUTH TOKEN HERE, including the oauth: in the beginning>
  },
  connection: {
        reconnect: true
  },
  channels: [
    channel,
    configs.bot.username
  ]
};
```
3. change the username value within configs.json.
4. You might also want to change check_baby_bot(), which is stored inside of util.js. That function checks for some possible misspellings of pete_bot_ in case the members misspell it, but if the username changes you can replace those with possible misspellings of the new username.

## Running
```
node bot.js
```
You will see a lot of information being logged initially upon startup. Then, it will loop, logging the current state upon each loop, along with additional debug information.

## Debug

to run with the debugger

[more info about npm debugging](https://nodejs.org/de/docs/guides/debugging-getting-started/)
```
node --inspect bot.js
```
to decrease the amount of debug messages,
change the options for the bot from
```
const opts = {
  options:{
    debug: true
  },
  identity: {
    username: "YOUR USERNAME",
    password: "YOUR OAUTH"
  },
  connection: {
        reconnect: true
  },
  channels: [
    channel,
    configs.bot.username
  ]
};
```
to
```
const opts = {
  options:{
    debug: false
  },
  identity: {
    username: "YOUR USERNAME",
    password: "YOUR OAUTH"
  },
  connection: {
        reconnect: true
  },
  channels: [
    channel,
    configs.bot.username
  ]
};
```

to debug just messages.js without needing to run bot.js, uncomment the line near the end of the file, that says
```
setupMessageReaderWriter(false);
```
and then run, in your terminal
```
node messages.js
```

## Key Files

### bot.js
This is the main file to run the bot. It contains most of the main code.

### messages.js
This is the code that contains the message parsing. It will save the messages into text files, make the word tables, and funnel the data into the markov chain.

### markov.js
This is the file that handles the markov chain. The functions from here are exported into messages.js, so most of the language preprocessing can still be handled in messages.js.

### util.js
This contains many utility functions for use in bot.js.

### scoring.js
This contains the functions used to assign scores to words for feeding and singing to the bot.

### kaomoji.js
Helper functions for making cute faces.

### configs.json
This file contains configurations for the bot. When the bot gets stopped, the current state information will overwrite the information within configs.json. This also means that it ends up being formatted all in one line when it gets saved by the bot.

* general:
  * secondsPerLoop: How many seconds it waits between each loop iteration. Right now, queued messages are sent within the bot loops, so it's recommended not to wait too long between each loop.
  * stateSwitchRate: a value, between 0 to 1, that is the the likelihood of the bot going into a non-idle state. When I'm testing it, the best values are between 0.05 and 0.1
  * growthRate: How much you add to the age each time the bot loops. Turn this value down to have it age slower, or alternatively, modify the ageMultiplier value in configs.
  * iterationsUntilQuit: How many iterations of bot_loop it goes through before quitting the stage if not completed by the chat members.
  * iterationsUntilNotOverwhelemed: How many iterations it will wait until it's not overwhelmed anymore.
  * iterationsUntilPlaytimeOver: How many iterations it stays when visiting another channel.
  * iterationsUntilPlaytimeLeave: How many iterations it waits before it absolutely needs to head home. This is different than iterationsUntilPlaytimeOver because iterationsUntilPlaytimeOver will ask the the chat to find someone to bring it home first, or ask the chat if they want to take a clip for it to bring home. However, in the case that they don't respond, we go home after this many iterations.
  * sendRate: The minimum number of seconds it will wait between sending messages. Use this in case Twitch sends error messages about sending messages too fast.
  * ageMultiplier: The real "human" age of the bot is calculated using (bot's age)/ageMultiplier. For example, if in the code current.age is 900 and the multiplier is 50, then the human age, as displayed to the chat, would be 18.
  * maturityIncrease/decrease: these values aren't being used right now, but they would be used to control by how much the emotional maturity of the bot increases/decreases by.
* channel:
  * name: the name of the channel that the bot will be sent to (its home channel). **Changing this value changes where it's sent to.**
* welcome: the welcome message sent to the user when the bot first starts up.
* bot:
  * name: the name of the bot.
  * username: the username of the bot. **change this value if the username of the bot changes.**
  * currentState: the current state of the bot
    * age: current age of the bot, when testing the bot you can change this value. keep in mind that the age you're targeting should be age/ageMultiplier as described above. this automatically updates when the bot is running, you will see the change AFTER it stops.
    * start: whether or not the welcome message has been sent. **SET THIS TO FALSE WHEN YOU FIRST BEGIN A SESSION** this will be automatically set to true once the welcome message has been sent.
    * maturity: not currently in use, but would contain the maturity level of the bot
    * knownMembers: the currently known members of the bot, along with the frequency of interaction. this is automatically updated once the bot stops.

### stateDetails.json
The file contains textual information used for the different non-idle states of the bot. Many of the fields for the states aren't in use, but are kept for consistency. For example, while some states use vocal_cue, some don't, but all of them have this field with some placeholder value.

### questions.json
Contains the possible hardcoded questions that the bot can ask in each age phase. The string @user is replaced during runtime.

### nouns, verbs, adverbs, adjectives, emotes.json
These json files contain dictionaries of the words that the bot has seen and whether or not it has asked about those words already or not. They should be automatically overwritten when the values change, so there's no need to edit these files.

### badwords.json
If a phrase contains a word in this file, it will be ignored. Add words to this file to blacklist those words.

### all.txt
A newline separated text file of every message sent in every channel that the bot is watching. Includes the bot's own messages.

### fixed.txt
The current file that the processed text is saved to. This is where the markov chain draws its information from.

### out.csv
Used for language during testing.

### count_message_stats.py
Used to count up the message statistics after the study.
