/* import helper libraries */
const fs = require('fs'); //filesystem, for saving configs like age upon quit
const tmi = require('tmi.js'); //tmi is the twitch chatbot helper library
const rita = require('rita') //rita is the language processing library
const stateOptions = require('./helpers/text-lists/stateDetails.json'); //the json file with details for each stage
const kao = require('./helpers/js/kaomoji.js') //kaomojis for the happy/sad faces that the bot makes
const scoring = require('./helpers/js/scoring.js') //the scoring system for the baby interactions
const util = require('./helpers/js/util.js') //various helper functions, such as random number functions, speech functions
const messages = require('./helpers/js/messages.js') //for message parsing and saving
const setupMessage = false; //SET TO TRUE IF YOU WANT TO RE-POSTPROCESS THE TEXTUAL DATA - read messages.js function setup_message_reader_writer for more info

/*
NOTE:
-phase: age phase that the bot is on (baby, toddler, etc.)
-state: current state that the bot is in (wanting food, sleeping, etc.)
-stage: what stage we are on within the current non-idle state (not fed, fed once, full)
*/

/* import questions for each stage from questions.json */
const questions = require('./helpers/text-lists/questions.json');
const teenagerQuestions = questions.teenager;
const adolescentQuestions = questions.adolescent;
const toddlerQuestions = questions.toddler;

/* set up firebase connection */
var firebase = require("firebase/app");
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECTID"
};
require("firebase/database");
let fb = firebase.initializeApp(firebaseConfig);
let fdata = firebase.database();
var waitingForExtension = false; //waiting for extension to finish voting

//configurations for the bot
var configs = require('./config.json');
const secondsPerLoop = configs.general.secondsPerLoop;
const growthRate = configs.general.growthRate;
const iterationsUntilQuit = configs.general.iterationsUntilQuit;
const iterationsUntilNotOverwhelmed = configs.general.iterationsUntilNotOverwhelmed;
const iterationsUntilPlaydateOver = configs.general.iterationsUntilPlaydateOver;
const iterationsUntilPlaydateLeave = configs.general.iterationsUntilPlaydateLeave;
const stateSwitchRate = configs.general.stateSwitchRate;
const playdateRate = configs.general.playdateRate;
const foodRate = configs.general.foodRate;
const sleepRate = configs.general.sleepRate;
const visitRate = configs.general.visitRate;
//the two variables below aren't being used since emotional maturity hasn't been implemented
// const maturityIncrease = configs.general.maturityIncrease;
// const maturityDecrease = configs.general.maturityDecrease;
var current = configs.bot["currentState"];
var knownMembers = current.knownMembers;
const channel = configs.channel.name;
const usernameWithAt = "@" + configs.bot.username;
let botInterval; //will hold the interval object of botLoop, needed later for clearInterval to stop the interval

/* if we have already started, we won't need to send the starting message */
let start = current.start;
let newday = current.newday;

//variables used for queueing the bot messages to be sent at one per sendRate.
var sendrate = configs.general.sendRate;
var lastSentTime = new Date();
var tosend = [];

//enums for different phases
const botPhases = util.botPhases;

/* used to prevent duplicate responses */
let lastState = null; //prevent dupliate states
let lastResponse = null; //prevent duplicate response types
const responseType = {
    QUESTION: "question",
    MARKOV: "markov",
    SMILE: "smile",
    REPEAT: "repeat"
}

/*tracking past few messages*/
var pastMessages = [] //past 5 minutes, used to activate the bot
var pastMessagesAtBabyBot = [] //past 1 minute, used to make the bot "overwhelmed"

/* for dealing with different phases */
var stage = 0; //the stage within the the current state
//counts how many loops we have gone through within the current state
//if iterationCounter exceeds iterationsUntilQuit, we exit the state
var iterationCounter = 0;

//for baby stage entertainment stage
var collaborators = new Set(); //set of people who have participated (sets prevent duplicates by nature)
var halfComplete = false; //true if at least one person has participated

//for baby stage holding
var lastInteracter = null;
var botPlayingWith = null;

//for playdate
var playdateChannel = null;
let playIterations = 0;
let pickedUp = false;
let pickerUpper = "Someone";
let pickedUpNotified = false;

//for returning from playdate
let visiting = false;
let pastChannel = null;

//uncomment if sending messages about high activity
let highActivity = false;

//let them opt out
let optedOutUsers = [];

// Define configuration options
const opts = {
  options:{
    debug: true
  },
  identity: {
    username: "YOUR_CHATBOT_USERNAME",
    password: "YOUR AUTHORIZATION KEY"
  },
  connection: {
        reconnect: true
  },
  channels: [
    channel,
    configs.bot.username
  ]
};

// Create a client with our options
const client = new tmi.client(opts);

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {

  console.log(`* Connected to ${addr}:${port}`);
  console.log("this will loop every "  + secondsPerLoop + " seconds");
  console.log("setting up message reading/writing")
  console.log("postprocessing is ", setupMessage);
  messages.setup(setupMessage);

  //prints welcome message if start variable is false
  //start variable is stored within the configs.json
  if(!start){
    clientSay(configs.welcome);
    current.start = true;
  }

  else if(newday){
    clientSay(configs.sayhi);
    current.newday = false;
  }

  //start the loop
  botInterval = setInterval(botLoop, secondsPerLoop * 1000);

  // //set up firebase watching the switchref - this is how it knows voting has ended
  // var switchref = firebase.database().ref('votes/switch');
  // switchref.on('value', function(snapshot) {
  //   if(waitingForExtension) {
  //
  //   }
  //   waitingForExtension = false;
  // });

  //set up firebase watching the opted out users list, and keeping it updated
  var optoutref = firebase.database().ref('opted_out_users');
  optoutref.on('value', function(snapshot) {
    var data = Object.values(snapshot.val())
    console.log("here are the currently opted out users", data);
    optedOutUsers = data;
  });

  //get current phase from the code, make sure the number in firebase is equal
  //so that the extension is correctly paired
  let phase = util.getPhase(current.age);
  var ageRef = firebase.database().ref('stage');
  if(phase == botPhases.BABY){
    ageRef.set(1);
  } else if(phase == botPhases.TODDLER || phase == botPhases.ADOLESCENT){
    ageRef.set(3);
  } else if (phase == botPhases.TEENAGER){
    ageRef.set(5);
  } else {
    ageRef.set(6);
  }

}

/********** BOT LOOP MAIN FUNCTIONS **********/
//this will loop every 10 seconds, updating the age and randomly changing the bot's state
//if the bot is already in a non-base state, it'll just update the age and exit.
function botLoop () {
  if(current.condition === "away"){
    playBotLoop();
  } else {
    homeBotLoop();
  }
}

//if bot is not on a playdate, this is what the botLoop does
function homeBotLoop(){

  //log a few details about our current state
  console.log("loop: current age is " + current.age + " current state is: " + current.condition + " iteration c :" + iterationCounter + "\n");

  //remove pastMessages that are too old
  //these arrays are meant to track "activity" levels
  util.purgeOutdated(pastMessages, 5); //remove messages that are more than 5 minutes old
  util.purgeOutdated(pastMessagesAtBabyBot, 1); //remove messages that were @baby_bot_ that are more than 1 minute old

  if(tosend.length > 0) sendNextMsg(); //if we have any messages left to send

  if(waitingForExtension) return; //if we are waiting for voting to finish within the extension, then don't do anything

  //check if we need to alert the user of a phase change
  if(util.getRealAge(current.age) == stateOptions.baby["maxAge"]){
    resetToIdle();
    writeStageToFb(2);
    startVotingTimer();
    clientSay("/me is now a toddler! It needs to move to a new home with more space. Please help it decide where to move by voting in the extension!");
  }
  if(util.getRealAge(current.age) == stateOptions.toddler["maxAge"]){
    resetToIdle();
    clientSay("/me is now an adolescent!")
  }
  if(util.getRealAge(current.age) == stateOptions.adolescent["maxAge"]){
    resetToIdle();
    writeStageToFb(4);
    startVotingTimer();
    clientSay("/me is now a teenager! It needs to move to a new home with more space. Please help it decide where to move by voting in the extension!")
  }
  if(util.getRealAge(current.age) == stateOptions.teenager["maxAge"]){
    resetToIdle();
    clientSay("/me is now an adult!")
  }

  current.age+= growthRate; //increase age

  if(current.condition == 'idle' && pastMessages.length < 3){
    return; //chat too slow, stay idle in order to not bombard the chat
  }

  //if there's lots of activity, send a message on the baby_bot_ channel that a clip should be taken
  //COMMENT/UNCOMMENT BELOW IF YOU DONT WANT/WANT THIS FEATURE
  if(pastMessages.length > 20 && !highActivity){
    client.say(configs.bot.username,`lots of activity, take a clip!`);
    highActivity = true;
  } else if (pastMessages.length <= 20 && highActivity){
    highActivity = false;
  }

  //handle overwhelmed behavior
  //if we are currently overwhelmed, increment the counter
  if(current.condition == "overwhelmed" && iterationCounter < iterationsUntilNotOverwhelmed ){
    iterationCounter++;
    return;
  }
  //if done being overwhelmed, reset to idle and clear the past messages
  else if (current.condition == "overwhelmed"){
    resetToIdle();
    tosend = [];
    pastMessagesAtBabyBot = [];
  }
  //if not currently overwhelmed, check if we need to be
  else if ( pastMessagesAtBabyBot.length > util.getOverwhelmNumber(current.age)){
    resetToIdle();
    current.condition = "overwhelmed";
    tosend = [];
    clientSay("/me is overwhelmed by all of the messages and is hiding until it recovers...");
    return;
  }

  //get current phase
  let phase = util.getPhase(current.age);

  //baby
  if(phase == botPhases.BABY){
    babyState();
  }
  //toddler
  else if (phase == botPhases.TODDLER){
    toddlerState();
  }
  //adolescent is mostly the same as toddler, just different ways of talking
  else if (phase == botPhases.ADOLESCENT){
    adolescentState();
  }
  //teenager
  else if (phase == botPhases.TEENAGER){
    teenagerState();
  }
  //adult
  else {
    botSpeak("hey guys... I'm all grown up now and think it's time for me leave home. thank you for taking care of me.");
    client.say(configs.bot.username,`send them the clips you took!`);

    var ageRef = firebase.database().ref('stage');
    ageRef.set(6);
    //send remaining messages
    while(tosend.length > 0){
      sendNextMsg();
    }
    console.log("CLEARING BOT INTERVAL. END")
    clearInterval(botInterval); //stop the botLoop
  }
}

//what gets called in botLoop when the bot is away from home channel
function playBotLoop(){

  if(tosend.length > 0) sendNextMsg(); //if we still have messages to send

  if(playIterations >= iterationsUntilPlaydateOver){
    if(!visiting && !pickedUp){ //if on a playdate and not picked up
      if(!pickedUpNotified){ //not yet notified, let them know
        botSpeak("I want to go home, but I can't until someone I know from my home channel" + " @" + channel + " comes to pick me up! Can you contact them for me? please?");
        pickedUpNotified = true;
      } else {
        //notified, not yet picked up. randomly whine about wanting to go home once in a while
        let num = util.rand(50);
        if(num < 1){
          botSpeak("i want to go home... " + kao.getKao("sad"));
        }
      }
      return;
    } else if(!visiting){
      //it was picked up! go home
      botSpeak(pickerUpper + " from my home channel is here! We're going home now!");
      playdateReturn();
      return;
    } else if (playIterations == iterationsUntilPlaydateOver){
      //else, it's not on a playdate, its a teenager so its just visiting
      botSpeak("hi, i'm going home now! I'd love to bring back a clip of the stream to show my home channel. is that okay with you? type !yes if so!")
    } else if (playIterations > iterationsUntilPlaydateLeave){
      //say goodbye and leave if we are staying too long. don't want to stay forever even if no response
      botSpeak("goodbye and thank you!");
      playdateReturn();
    }
    playIterations++;
  } else {
    //if it's not time to go yet
    let randomnum = util.rand(2 / stateSwitchRate);
    if(randomnum == 0){
      generatePhrase(); //generate a phrase
    } else if (randomnum == 1){
		  let greet = "@user " + util.randomGreeting();
		  let idx = greet.indexOf("@user"); //or randomly greet the channel owner
		  let bef = greet.substring(0, idx);
		  let aft = greet.substring(idx + 5);
		  let randUser = playdateChannel; //set default person to ask about as channel owner
		  if(pastMessages.length > 0){
			 //change user to be from past messages if there are any to choose from
			 randUser = util.randEle(pastMessages).user;
		  }
		  greet = bef + "@" + randUser + aft;
		  botSpeak(greet);
    	}
    playIterations++;
  }
}

/********** MESSAGE HANDLERS **********/

// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {

  //do not do anything if they've opted out.
  if(checkIfOptedOut(context.username)) return;

  messages.saveToAll(target, context, msg); //save every message we get

  // Ignore messages from the bot
  if (self) return;
  if(msg === "") return;

  //if on playdate or visiting, parse it differently
  if(current.condition === "away"){
    playMessage(target, context, msg, self);
  }
  //else, if we're in our home channel
  else {
    homeMessageHandler(target, context, msg, self);
  }
}

//handle messages from home channel
function homeMessageHandler (target, context, msg, self) {

  if(target.indexOf(channel) < 0) return; //if not home channel

  //if voting in the extension is going on but someone tries to interact with baby bot,
  //just respond with this and do nothing
  if((waitingForExtension) && (msg.indexOf("!inspect") >= 0 || msg.indexOf("@pete_bot") >=0)){
    clientSay("/me is currently boxed up. Check the extension.");
  }

  //bot shouldn't respond while extension voting is going on
  if(waitingForExtension) return;

  const words = msg.split(" "); // Remove whitespace and get first part

  //if we haven't seen this user before, make an entry for them in the knownMembers table
  if(!knownMembers[context['username']]){
    knownMembers[context['username']] = {"username": context['username'], "score": 0}
  }

  //if someone is trying to inspect or @baby_bot_ but it's too overwhelmed, just send this message
  if(((msg.indexOf("!inspect") >= 0) || (msg.indexOf(usernameWithAt) >= 0 ))
    && current.condition === "overwhelmed"){

    clientSay("/me is too overwhelmed to talk right now, try again later.");
  }

  //don't do anything if overwhelmed
  if (current.condition === "overwhelmed") return;

  //push the message into pastMessages
  pastMessages.push({'time': new Date(), 'msg': words, 'user': context['username']})

  //special case for commands that we've seen before
  if((msg.indexOf("!grow") >= 0)
    || (msg.indexOf("!learn") >= 0)
    || (msg.indexOf("!adult") >= 0)){

      clientSay("/me doesn't grow with !grow or !learn or similar commands... you need to take care of it and love it for it to grow :)");
      return;
  }
  //else if((msg.indexOf("!play") >= 0)){
  //    clientSay("/me is done playing for today");
  //    return;
  //}

  let phase = util.getPhase(current.age);

  if(phase == botPhases.BABY){
    babyMessageResponse(target, context, msg, self, words);
  } else if (phase == botPhases.TODDLER || phase == botPhases.ADOLESCENT){
    toddlerAdolescentResponse(target, context, msg, self, words)
  } else if (phase == botPhases.TEENAGER){
    teenagerMessageResponse(target, context, msg, self, words);
  } else {
    //do nothing. it's an adult and it has "left"
    if(words.includes("!inspect") || words.includes(usernameWithAt)){
      clientSay("/me has grown up and has left the chatroom to experience the world.");
    }
  }
}

//message handler when bot is away from home channel
function playMessage (target, context, msg, self) {

    if(target.indexOf(playdateChannel) < 0) return; //if not the playdate channel, exit

    //if it wanted to be picked up and the user is known
    if(pickedUpNotified && knownMembers[context['username']]){
      pickedUp = true;
      pickerUpper = context['username'];
    }

    const words = msg.split(" "); // Remove whitespace and get first part

    if(words.includes("!yes")){
      //they want us to take a clip to "bring home"
      //say, on the baby_bot_ channel, that a clip needs to be taken
      client.say(configs.bot.username,`the bot is returning from ${playdateChannel}, you have a min to take a clip!`);
      //tell channel that you're visiting that you'll make a clip
      botSpeak("Okay, i'll make a clip starting in a few seconds, and then I will go home! goodbye and thank you!");
      //go home in a minute
      setTimeout(function(){
        client.say(configs.bot.username, `okay, the bot is going home now! after it says "hi, i'm home!" write "here's a clip from where i visited! ____clip url____"`);
        playdateReturn(); // return home
      }, 60000);
    } else if(words.includes("!no")){
      //no clip will be made, go home
      botSpeak("gotcha! no clip will be made. goodbye and thank you!");
      playdateReturn();
    } else if(util.checkBabyBot(words)){
      //if it was talked to
      botTalkedTo(context, words, msg);
    } else if(words[0].substring(0, 1) == "!"){
      //they're trying to do a command on it
      botSpeak("/me isn't interested in that right now.");
    }
}


//reset from non-idle state to idle state
//set all vars possibly affected back to base state
function resetToIdle(){
  halfComplete = false;
  stage = 0;
  collaborators = new Set();
  iterationCounter = 0;
  current.condition = "idle";
  lastInteracter = null;
  botPlayingWith = null;
  playdateChannel = null;
  playIterations = 0;
  pickedUp = false;
  pickedUpNotified = false;
  pickerUpper = "Someone";
}

//changing the state value in firebase triggers the voting stage in the extension
function writeStageToFb(stage){
  var ageRef = firebase.database().ref('stage');
  ageRef.set(stage);
  waitingForExtension = true; //set to true while we wait for voting to finish
}

let minutesLeft = 20;

function startVotingTimer(){
  votingTimer = setInterval(votingLoop, 60000);
}

function votingLoop(){
  minutesLeft--;

  var timeRef = firebase.database().ref('timeleft');
  timeRef.set(minutesLeft);

  if(minutesLeft <= 0){

    clearInterval(votingTimer)

    var linkref = firebase.database().ref('votes');
    linkref.once('value', function(snapshot){

      let votes = snapshot.val();
      console.log(votes);
      let phase = util.getPhase(current.age);
      clientSay("/me has decided where it's moving! voting is over.")
      var ageRef = firebase.database().ref('stage');
      if(phase == botPhases.BABY){
        ageRef.set(1);
      } else if(phase == botPhases.TODDLER || phase == botPhases.ADOLESCENT){
        if(votes.sock > votes.sponge){
          firebase.database().ref('toddler_house').set(0)
        } else {
          firebase.database().ref('toddler_house').set(1)
        }
        ageRef.set(3);
      } else if (phase == botPhases.TEENAGER){
        if(votes.mat > votes.plate){
          firebase.database().ref('teenager_house').set(0);
        } else {
          firebase.database().ref('teenager_house').set(1);
        }
        ageRef.set(5);
      } else {
        ageRef.set(6);
      }
      waitingForExtension = false;
    })

  }
}

function checkIfOptedOut(username){
  return optedOutUsers.includes(username.toLowerCase());
}

//speech functions
function decorateSpeech(message){
  //if baby phase
  if(util.getPhase(current.age) == botPhases.BABY){
    let gurgle = util.randomBabyGurgle();
    message = util.coin() ? message + " " + gurgle : gurgle + " " + message;
  }
  //otherwise, normal speech with some emotes added on
  else {
    if(util.rand(5)<2){
      let numemotes = util.rand(3);
      let emote = messages.getEmote();
      for(var i = 0; i < numemotes; i++){
        message += " " + emote;
      }
    }
  }
  return message;
}

//function that is called when the bot is speaking - adds speech "decoration"
function botSpeak(msg){
  if(msg === null || (msg === "pete_bot_")) return;
  let message = decorateSpeech(msg)
  clientSay(message);
}

//function that is called when the bot is not speaking... no added decoration, just sends the message
//i usually use this for the "/me is doing something" messages
function clientSay(msg){
  if(msg == null) return;
  if(current.condition === "away"){
    sendMsg(playdateChannel, msg);
  } else {
    sendMsg(channel, msg);
  }
}

//sends the message, but makes sure that there is at least sendrate seconds between each message
//not entirely sure if needed, but it helps a little with messages not being sent sometimes

//also turned on moderator mode for the bot to increase # of messages its allowed to send

//duplicate messages will inevitably be skipped. for example, if two people !inpsect the bot in
//the same state, then it will print the same message, which twitch will see as a duplicate and not allow.
function sendMsg(chnl, msg){
  if(!util.inChronOrder(tosend)){
    console.log("messages to be sent are not in chronological order")
    debugger;
  }
  let currentTime = new Date();
  let secsAgo = util.addMinutes(currentTime, (-1 * sendrate)/60.0);
  if(lastSentTime > secsAgo){
    console.log("storing message..." + msg);
    tosend.push(
     { msg:msg,
       time: currentTime,
       channel: chnl
     });
  } else {
    console.log("sending message..." + msg);
    lastSentTime = currentTime;
    client.say(chnl, msg).then((data) => {
    }).catch((err) => {
      console.log("failed to send message", err);
    });
  }
}

//send next message in the queued list of things to send
function sendNextMsg(){
  if(!util.inChronOrder(tosend)){
    console.log("messages to be sent are not in chronological order")
    debugger;
  }
  let wts = tosend.shift(); //get first from list
  let msg = wts.msg;
  let currentTime = new Date();
  let secsAgo = util.addMinutes(currentTime, (-1 * sendrate)/60.0);
  if(lastSentTime > secsAgo){
    tosend.unshift(wts); //put back in front
  } else {
    //send it
    lastSentTime = currentTime;
    client.say(wts.channel, wts.msg).catch((err) => {
      console.log("failed to send message" ,err);
    });
  }
}

//function called in homeBotLoop if in baby state
function babyState(){
  let baby = stateOptions.baby;
  let botStates = baby.botStates;
  let randomnum = util.rand(botStates.length / stateSwitchRate);
  if(current.condition == "idle" && (randomnum < botStates.length)){

    if(botStates[randomnum] != lastState){

      iterationCounter = 0;
      current.condition = botStates[randomnum];
      lastState = current.condition;
      let vocalCue = baby[current.condition]['vocalCue'];
      botSpeak(kao.getKao(vocalCue));
    }

  }
  //special extra case for going to sleep
  else if (current.condition == "idle" && (randomnum == botStates.length)){
    if (util.coin() && ('sleep' != lastState)){
      iterationCounter = 0;
      current.condition = 'sleep';
      lastState = current.condition;
      clientSay("/me is now sleeping...");
    }
  }
  //if not idle, if we were in an active state
  else if (current.condition != "idle" ){
    iterationCounter++;
    if(iterationCounter >= iterationsUntilQuit){
      if(current.condition === "sleep"){
        clientSay("/me is awake!");
      } else if(halfComplete){
        botSpeak(kao.getKaoIntensity(baby[current.condition]['onHalfCompletion'], 1));
        //current.maturity += maturityDecrease * baby[current.condition]["maturityBoost"][0];
      } else {
        botSpeak(kao.getKao('dissatisfied'));
        //current.maturity += maturityDecrease * baby[current.condition]["maturityLoss"][0];
      }
      resetToIdle();
    }
  }
}

/*function called in homeBotLoop if in toddler state
this code is structured very slightly different than the baby state
because some of the "states" that it can go into just trigger an action
and don't change the current condition of the bot */
function toddlerState(){

  let toddler = stateOptions.toddler;
  let botStates = toddler.botStates;
  let randomnum = util.rand(botStates.length / stateSwitchRate);

  //reset to idle if changed ages
  if(current.condition != "idle" &&
    !botStates.includes(current.condition)
    && !userStates.includes(current.condition)){
    botSpeak(kao.getKao('dissatisfied'));
    resetToIdle();
    //this means we changed ages
  }
  if(current.condition == "idle" && (randomnum < botStates.length)){

    if(botStates[randomnum] != lastState){

      iterationCounter = 0;
      let currState = botStates[randomnum];
      lastState = currState;
      switch (currState){
        case "talk":
          generatePhrase();
          break;
        case "question":
          current.condition = "question";
          askQuestion();
          break;
        case "lonely":
          if(util.rand(1/playdateRate) < 1){
            current.condition = "lonely";
            botSpeak(kao.getKao(toddler[current.condition]['vocalCue']));
          } else {
            console.log("skipping the playdate this time")
          }
          break;
        case "food":
          if(util.rand(1/foodRate) < 1){
            current.condition = "food";
            botSpeak(kao.getKao(toddler[current.condition]['vocalCue']));
          } else {
            console.log("skipping the eating this time")
          }
          break;
        case "sleep":
          if(util.rand(1/sleepRate) < 1){
            current.condition = 'sleep';
            clientSay("/me is now sleeping...");
          } else {
            console.log("skipping the sleeping this time")
          }
          break;
        case "story":
        	current.condition = "story";
        	botSpeak("tell me a story?");
        	break;

      }
    }
  }
  //if not idle, if we were in an active state
  if (current.condition != "idle"){
      iterationCounter++; //increment counter
      if(iterationCounter >= iterationsUntilQuit){ //if done with state
          if(current.condition === "sleep"){
            //wake up
            clientSay("/me is awake!");
          } else if(current.condition == "question"){
            //give up on having question be answered
            botSpeak("okay...");
          }
          else{
            //otherwise, express sadness that they didn't complete the phase
            botSpeak(kao.getKao('dissatisfied'));
            //current.maturity += maturityDecrease * toddler[current.condition]["maturityLoss"][0];
          }
          resetToIdle();
      }
    }
}

//function called in homeBotLoop if in adolescent state
function adolescentState(){

  let adolescent = stateOptions.adolescent;
  let botStates = adolescent.botStates;
  let randomnum = util.rand(botStates.length / stateSwitchRate);

  if(current.condition != "idle" &&
    !botStates.includes(current.condition)
    && !userStates.includes(current.condition)){
    botSpeak(kao.getKao('dissatisfied'));
    resetToIdle();
    //this means we changed ages
  }
  if(current.condition == "idle" && (randomnum < botStates.length)){

    if(botStates[randomnum] != lastState){
      iterationCounter = 0;
      let currState = botStates[randomnum];
      lastState = currState;
      switch (currState){
        case "talk":
          generatePhrase();
          break;
        case "question":
          current.condition = "question";
          askQuestion();
          break;
        case "lonely":
          if(util.rand(1/playdateRate) < 1){
            current.condition = "lonely";
            botSpeak(adolescent[current.condition]['vocalCue']);
          } else {
            console.log("skipping the playdate this time");
          }
          break;
        case "sleep":
          if(util.rand(1/sleepRate) < 1){
            current.condition = 'sleep';
            clientSay("/me is now sleeping...");
          } else {
            console.log("skipping the sleeping this time")
          }
          break;
      }
    }
  } else if (current.condition != "idle"){
      iterationCounter++;
      if(iterationCounter >= iterationsUntilQuit){
          if(current.condition === "sleep"){
            clientSay("/me is awake!");
          } else if(current.condition == "question"){
            botSpeak("okay...");
          }
          else{
            botSpeak(kao.getKao('dissatisfied'));
            //current.maturity += maturityDecrease * adolescent[current.condition]["maturityLoss"][0];
          }
          resetToIdle();
      }
    }
}

//function called in homeBotLoop if in teenager state
function teenagerState(){

  let teenager = stateOptions.teenager;
  let botStates = teenager.botStates;
  let randomnum = util.rand(botStates.length / stateSwitchRate);

  if(current.condition != "idle" &&
    !botStates.includes(current.condition)
    && !userStates.includes(current.condition)){
    botSpeak(kao.getKao('dissatisfied'));
    resetToIdle();
    //this means we changed ages
  }
  if(current.condition == "idle" && (randomnum < botStates.length)){
    if(botStates[randomnum] != lastState){

      iterationCounter = 0;
      let currState = botStates[randomnum];
      lastState = currState;

      switch (currState){
        case "talk":
          generatePhrase();
          break;
        case "question":
          current.condition = "question";
          askQuestion();
          break;
        case "visit":
          if(util.rand(1/visitRate) < 1){
            visit();
          } else {
            console.log("skipping the playdate this time")
          }
          break;
        case "sleep":
          if (util.coin()){
            current.condition = 'sleep';
            clientSay("/me is now sleeping...");
          }
          break;
      }
    }
  }  else if (current.condition != "idle"){
      iterationCounter++;
      if(iterationCounter >= iterationsUntilQuit){
          if(current.condition === "sleep"){
            clientSay("/me is awake!");
          } else if(current.condition == "question"){
            botSpeak("okay...");
          }
          else{
            botSpeak(kao.getKao('dissatisfied'));
            //current.maturity += maturityDecrease * teenager[current.condition]["maturityLoss"][0];
          }
          resetToIdle();
      }
    }
}

//teenager state, visiting another channel
function visit(){
  playdateChannel = util.randEle(configs.visitableChannels);
  botSpeak("hey, i'm going to visit " + playdateChannel + ", be back soon!");
  visiting = true;
  playdate();
}

//toddler/adolescent state, playdate with another channel
function playdate(){
  while(tosend.length > 0){
    sendNextMsg();
  }
  if(playdateChannel == null){
    return;
  }
  client.join(playdateChannel).then((data) => {
      current.condition = "away";
      if (visiting){
        botSpeak("hi! I'm a bot from " + channel + ". I'm visiting this channel for a little bit! I'm doing my best to learn and grow, please talk to me with " + usernameWithAt + ". See here for more information YOUR_WEBISTE_HERE");
      } else {
        botSpeak("hi! I'm baby bot from " + channel + ". I'm here for a playdate. I'm doing my best to learn and grow, please talk to me with " + usernameWithAt + ". See here for more information or to opt-out: YOUR_WEBSITE_HERE");
      }
    }).catch((err) => {
      console.log("error joining channel", err);
  });
}

//returning from playdate
function playdateReturn(){
  while(tosend.length > 0){
    sendNextMsg();
  }
  botSpeak("I'm going home now!");
  if(visiting){
    pastChannel = playdateChannel;
    visiting = false;
  }
  resetToIdle();
  botSpeak("I'm home!");
}

//update interaction count for user in the known user table
function updateUserEntry(username){
  if(knownMembers[username]){
    knownMembers[username].freq++;
  } else {
    knownMembers[username] = {'username': username,'freq':1};
  }
}

////baby response to messages
function babyMessageResponse(target, context, msg, self, words){
  if(util.checkBabyBot(words)){
    babyTalkedTo(target, context, msg);
  } else if (msg.indexOf('!inspect') >= 0){
    inspectBot();
  } else if (msg.indexOf('!feed') >= 0){
    feedBot(context, words);
  } else if (msg.indexOf('!sing') >= 0){
    entertainBot(context, words);
  } else if (msg.indexOf('!wake') >= 0){
    wakeBot(context, words);
  } else if (msg.indexOf('!hold') >= 0){
    holdBot(context);
  } else if(msg.substring(0, 1) !== "!"){
    messages.save(context, msg);
  }
}

//toddler and adolescent response to messages
function toddlerAdolescentResponse(target, context, msg, self, words){
  //context moderator context[mod] isn't working for me, the streamer?
  //need to look more into this later :(
  //let moderator = true;
  //UNCOMMENT below if you want only moderators to be able to send it on a playdate
  let moderator = context.mod || (channel === context.username);
  if (msg.indexOf("playdate") >= 0 && moderator){
    let channelName = util.findUsername(words);
    if(channelName == null){
      clientSay('/me does not know what channel you are referencing. Use "!playdate @channelName"');
    } else {
      playdateChannel = channelName.substring(1);
      clientSay('/me is ready! It is leaving for '+ playdateChannel +' now!');
      playdate();
    }
  } else if (msg.indexOf("playdate") >= 0){
    clientSay("/me can't be sent on a playdate by anyone who isn't a moderator.");
  } else if(util.checkBabyBot(words)){
    botTalkedTo(context, words, msg);
  } else if (words.includes("!inspect")){
    inspectBot();
  } else if (words.includes("!feed") && util.getPhase(current.age) == botPhases.TODDLER){
    feedBot(context, words);
  } else if (words.includes('!wake')){
    wakeBot(context, words);
  } else if (msg.substring(0, 1) !== "!"){
    messages.save(context, msg);
  }
}

//teenager response to messages
function teenagerMessageResponse(target, context, msg, self, words){
  if (words.includes("visit") || words.includes("playdate")){
    clientSay("/me is too grown up to listen to suggestions anymore.");
  } else if(util.checkBabyBot(words)){
    botTalkedTo(context, words, msg);
  } else if (words.includes("!inspect")){
    inspectBot();
  } else if (msg.indexOf('!wake') >= 0){
    wakeBot(context, words);
  } else if(msg.substring(0, 1) !== "!"){
    messages.save(context, msg);
  }
}

//asks a question
function askQuestion(){
  //50% chance of asking a question about what a word means
  if(util.coin()){
    let randnum = util.rand(4);
    switch (randnum){
      case 0:
        botSpeak("whats a " + messages.nextNoun() + "?");
        break;
      case 1:
        botSpeak("what does it mean to " + messages.nextVerb() + "?");
        break;
      case 2:
        botSpeak('what does "' + messages.nextAdverb() + '" mean?');
        break;
      case 3:
        botSpeak('what does "' + messages.nextAdjective() + '" mean?');
        break;
    }
  } else{
    //else ask a question from the bank of questions
    let questions;
    switch (util.getPhase(current.age)){
      case botPhases.BABY:
        return;
      case botPhases.TODDLER:
        questions = toddlerQuestions;
        break;
      case botPhases.ADOLESCENT:
        questions = adolescentQuestions;
        break;
      case botPhases.TEENAGER:
        questions = adolescentQuestions;
        break;
    }
    let unusedQuestions = questions.filter(q => !q.used);
    console.log(unusedQuestions)
    if(unusedQuestions.length == 0) return;
    let q = util.randEle(unusedQuestions);
    let ques = q.question;
    q.used = true;
    let idx = ques.indexOf("@user");
    //if the question needs "@user" to be replaced with an actual user
    if(idx >= 0){
      q.used = false;
      let bef = ques.substring(0, idx);
      let aft = ques.substring(idx + 5);
      let randUser = channel; //set default person to ask about as channel owner
      if(pastMessages.length > 0){
         let askableUserMessages = pastMessages.filter(msg => !q.users.includes(msg.user))
         if(askableUserMessages.length == 0){
           resetToIdle();
           return;
         }         //change user to be from past messages if there are any to choose from
         randUser = util.randEle(askableUserMessages).user;
         q.users.push(randUser);
      }  else {
         resetToIdle();
         return;
      }
      ques = bef + "@" + randUser + aft;
    }
    botSpeak(ques);
  }
}

//generate phrase from markov chain
function generatePhrase(){
  var phase = util.getPhase(current.age);
  if(phase == botPhases.TODDLER){
    botSpeak(messages.toddler());
  } else if (phase == botPhases.ADOLESCENT) {
    botSpeak(messages.adolescent());
  } else {
    botSpeak(messages.teenager());
  }
}

//generate a response when someone does @baby_bot_
function generateResponse(words, msg, username){

  //if sleeping, just print a sleepy message and return
  if(current.condition === "sleep") {
    botSpeak( "@" + username + " " + kao.getKao("sleepy"));
    return;
  }

  //respond to "hold old are you?"
  if(words.includes("how")
  && words.includes("old")){
    botSpeak( "@" + username + " I'm " + util.getRealAge(current.age) + " bot-years");
    return;
  }

  //respond to hi, hello, hey
  if(words.includes("hi")
  || words.includes("hello")
  || words.includes("hey")){
    botSpeak( "@" + username + " " + util.randomGreeting() + " " + kao.getKao("happy"));
    return;
  }

  //if I asked a question previously and am waiting for a response,
  //this is hopefully the response to that, so we reset to idle
  if(current.condition == "question"){
    //if they asked me a question in response
    if(msg.indexOf("?") > 0){
      botSpeak("@" + username + " i dont know");
      resetToIdle();
      return;
    }
    //either say "okay i see" or "ok"
    if(util.coin()) {
      botSpeak("@" + username + " okay.. I see...");
    } else {
      botSpeak("@" + username + " ok");
    }
    resetToIdle();
    return;
  }

  //if they are asking "how are you"
  //have to be stricter about this one because there's lots of questions with
  //the words how, are and you
  if(msg.toLowerCase().indexOf("how are you") >= 0){
    if(util.coin()){
      botSpeak("@" + username + " I'm okay");
    } else {
      botSpeak("@" + username + " good! you?");
    }
    return;
  }

  //parse for common questions in playtest
  if((msg.indexOf("!function") >= 0)
    || (msg.indexOf("rules") >= 0
    && msg.indexOf("what are") >= 0
    && msg.indexOf(usernameWithAt) >= 0)){
        clientSay("/me can be interacted with using !inspect or " + usernameWithAt);
        return;
  }

  let phase = util.getPhase(current.age);

  //if not a toddler, we respond with either a smile or by generating a phrase
  if(phase == botPhases.TEENAGER || phase == botPhases.ADOLESCENT)
  {
    if(util.coin()){
    //respond by generating a phrase
      // if(phase == botPhases.TEENAGER) {
      //   botSpeak("@" + username + " " + messages.teenager());
      // } else if (phase == botPhases.ADOLESCENT)
      //   botSpeak("@" + username + " " + messages.adolescent());
      let response = messages.respond(msg.toLowerCase());
      if(response){
        botSpeak("@" + username + " " + response);
      } else {
        if(phase == botPhases.TEENAGER) {
          botSpeak("@" + username + " " + messages.teenager());
        } else if (phase == botPhases.ADOLESCENT)
          botSpeak("@" + username + " " + messages.adolescent());
      }
    }
    //else respond by sending a happy kaomoji
    else {
      botSpeak("@" + username + " " + kao.getKao("happy"));
      return;
    }
  }
  //if its a toddler, we either do "their question + ?", a smile, or "their.... question... ?"
  //we favor the non-smile response, but do the smile in the case of a repeating type
  else {
    let randnum = util.rand(2);
    //if question type response
    if (randnum == 0){
      //if we already responded with a question before, we just do a smile this time
      if(lastResponse == responseType.QUESTION){
        botSpeak("@" + username + " " + kao.getKao("happy"));
        lastResponse = responseType.SMILE;
      } else {
        words.shift();
        for(var i = words.length-1; i--;){
          if ( words[i] === 'pete_bot_') words.splice(i, 1);
          else if ( words[i] === '@pete_bot_') words.splice(i, 1);
        }
        //botSpeak("@" + username + " " + words.join(" ") + "?");
        //people seem to hate the ? response
        botSpeak("@" + username + " " + messages.toddler());
        lastResponse = responseType.QUESTION;
      }

    } else {
      //else if "..." type response
      if(lastResponse == responseType.QUESTION){
        botSpeak("@" + username + " " + kao.getKao("happy"));
        lastResponse = responseType.SMILE;
      } else {
        let max = util.rand(words.length);
        let res = [];
        for(var i = 0; i < max; i++){
          if(words[i] != usernameWithAt){
             res.push(util.randEle(words));
          }
        }
        botSpeak("@" + username + " " + res.join("... ") + "..?");
        lastResponse = responseType.REPEAT;
      }
    }
  }
}

//helper function for when the bot is talked to
function botTalkedTo(context, words, msg){

  //is the bot is currently on a playdate or visiting somewhere
  if(current.condition != "away"){
    pastMessagesAtBabyBot.push({'time': new Date(), 'msg': words, 'user': context['username']});
    updateUserEntry(context["username"]);
  }

  generateResponse(words, msg, context['username']);
  words = words.filter((ele => !util.checkBabyBot([ele])))
  if(words.length > 0) messages.save(context, words.join(" "));
}

//if bot is talked to while it's a baby, there's a different function because it should just smile
function babyTalkedTo(target, context, msg){

  pastMessagesAtBabyBot.push({'time': new Date(), 'msg': msg.split(" "), 'user': context['username']});

  if(current.condition === "sleep") {
    botSpeak(kao.getKao("sleepy"));
    return;
  }

  updateUserEntry(context["username"]);
  botSpeak(kao.getKao("happy"));
  let messageToBeSaved = msg.replace(usernameWithAt, "")
  if(msg.length > 11) messages.save(context, messageToBeSaved);
}

//if bot is talked to with !sing
function entertainBot(context, words){

  if(!checkIfInState("entertainment")) return;
  updateUserEntry(context["username"]);

  var stages = stateOptions.baby.entertainment.stages;
  var username = context['username']
  collaborators.add(context['userId'], context['userId']); //set ensures all unique id
  words.shift();
  let score = scoring.song(words);
  let rating = ""
  switch (score){
    case 0:
      rating = "bad..."
      break
    case 1:
      rating = "just okay"
      break
    case 2:
      rating = "amazing"
      break
    default:
      rating = "super excellent"
      break;
  }
  if(stage == 0){
    clientSay("/me thinks " + username + "'s singing is " + rating + " and " + stages[stage]);
    halfComplete = true;
    stage++;
  } else if(collaborators.size == 1){
    clientSay("/me thinks " + username + "'s singing is " + rating + " and still " + stages[1]);
  } else {
    clientSay("/me thinks " + username + "'s singing is " + rating + " and " + stages[stage]);
    stage++;
  }
  iterationCounter--;
  if(stage >= stages.length){
    botSpeak(kao.getKaoIntensity(stateOptions.baby.entertainment["onCompletion"], 5));
    //uncomment below if you want to implement emotional maturity
    //current.maturity += maturityIncrease * stateOptions.baby.entertainment["maturityBoost"][1];
    resetToIdle();
  }
}

//if bot is talked to with !sing
function wakeBot(context, words){

  if(!checkIfInState("sleep")) return;
  updateUserEntry(context["username"]);

  var stages = stateOptions.baby.sleep.stages;
  var username = context['username']
  collaborators.add(context['userId'], context['userId']); //set ensures all unique id
  if(stage == 0){
    clientSay("/me is shifting around a little... ");
    stage++;
  } else if(collaborators.size == 1){
    clientSay("/me is shifting around a little... maybe someone else wants to try waking it up too?");
  } else {
    clientSay("/me is waking up..");
    stage++;
  }
  iterationCounter--;
  if(stage >= stages.length){
    clientSay("/me is awake!");
    resetToIdle();
  }
}

/*executes the bot feeding command for the baby bot needs food state */
function feedBot(context, words){

  if(!checkIfInState("food")) return;
  updateUserEntry(context["username"]);
  words.shift();

  if(words.length == 0){
    clientSay("/me can't eat empty words!");
    return;

  } else if(words.filter(word => !rita.RiTa.containsWord(word)).length > 0){
    clientSay("/me makes a grossed-out face (>_<)");
    return;
  }
  let score = scoring.food(words);
  let rating = 0;
  switch (score){
    case 0:
      rating = "bad"
      break
    case 1:
      rating = "just okay"
      break
    case 2:
      rating = "yummy"
      break
    default:
      rating = "sublime"
      break;
  }
  var stages = stateOptions.baby.food.stages;
  clientSay("/me thinks " + context['username'] + "'s food tastes " + rating + " and " + stages[stage]);
  stage++;
  iterationCounter--;
  if(stage >= stages.length){
    botSpeak(kao.getKaoIntensity(stateOptions.baby.food["onCompletion"], 2));
    //uncomment below if you want to implement emotional maturity
    //current.maturity += maturityIncrease * stateOptions.baby.food["maturityBoost"];
    resetToIdle();
  }
}

/*executes the bot holding command for the baby bot needs love state */
function holdBot(context){

  if(!checkIfInState("love")) return; //check if !hold is the correct command

  updateUserEntry(context["username"]); //update the interaction frequency count for this user
  //the next few lines are used to enforce multiple collaborators
  currInteracter = context['userId']
  let newPerson = (lastInteracter != null) && (currInteracter != lastInteracter);
  var stages = stateOptions.baby.love.stages;
  if(newPerson){
    clientSay( "/me has switched to being held by " + context['username'] + " and " + stages[stage]);
  }
  else{
    clientSay( "/me is being held by " + context['username'] + " and " + stages[stage]);
  }
  stage++;
  iterationCounter--;
  if(stage >= stages.length){
    botSpeak(kao.getKaoIntensity(stateOptions.baby.love["onCompletion"], 3));
    //uncomment below if you want to implement emotional maturity
    //current.maturity += maturityIncrease * stateOptions.baby.love["maturityBoost"];
    resetToIdle();
  }
  lastInteracter = context['userId']
}

//checks the state of the bot when people try to execute a command
//just returns true if the command is correct for the condition
//otherwise, it prints an "error" message to the chat
function checkIfInState(state){
    if(current.condition === state){
      return true;
    } else if(current.condition === 'idle'){
      switch (state){
        case 'entertainment':
          clientSay("/me isn't interested in being entertained right now.");
          break;
        case 'sleep':
          clientSay("/me isn't interested in being woken up right now.");
          break;
        case 'food':
          clientSay("/me isn't hungry right now.");
          break;
        case 'love':
          clientSay("/me isn't interested in being held right now.");
          break;
        default:
          clientSay("/me busy being idle.");
          break;
      }
      return false;
    } else {
      clientSay("/me isn't interested in that right now.");
      return false;
    }
}

//if someone does !inpsect, respond
function inspectBot(){
  console.log("inspection");
  let inspectionRes = stateOptions[util.getPhase(current.age)][current.condition]["inspectionResult"];
  clientSay("/me " + inspectionRes);
}

//upon SIGINT (which is usually ctrl-c)
//save the configurations like current age, known members, before we exit, then exit
process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    resetToIdle();
    var jsonData = JSON.stringify(configs);
    var questionJsonData = JSON.stringify(questions);
    var fs = require('fs');
    fs.writeFileSync("config.json", jsonData, function(err) {
      if (err) {
        console.log("error saving config.json", err);
      }
    });
    fs.writeFileSync("questions.json", questionJsonData , function(err) {
      if (err) {
        console.log("error saving config.json", err);
      }
    });
    messages.forceSaveTables();
    process.exit();
});

//upon some uncaught exception, it would usually exit, but i prevent this
//generally, we want the bot to keep going, even if there's an uncaught bug
//because having the bot quit altogether is more noticable then having it not respond
//to a message. this is just in case of a bug that I haven't detected yet. the error that is caught is printed.
process.on('uncaughtException', function(err) {
    console.log("UNCAUGHT exception: ", err);
    var jsonData = JSON.stringify(configs);
    console.log(jsonData);
    var fs = require('fs');
    fs.writeFileSync("config.json", jsonData, function(err) {
      if (err) {
        console.log(err);
      }
    });
});
