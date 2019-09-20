//this is a utility file for helper functions of all sorts

const stateOptions = require('../text-lists/stateDetails.json');
const configs = require('../../config.json');

//enum for different baby states
const botPhases = {
    BABY: "baby",
    TODDLER: "toddler",
    ADOLESCENT: "adolescent",
    TEENAGER: "teenager",
    ADULT: "adult"
}

//random function that goes up until max integer values [0, max)
function rand(max){
  return Math.floor(max * Math.random());
}

//gets a random element from the array arr
function randEle(arr){
  let idx = rand(arr.length);
  return arr[idx];
}

//gives a random greeting from this array
const hi = ["hi", "hi!", "hello", "hey", "hey hey", "hello!"];
function randomGreeting(){
  return randEle(hi);
}

//flips a "coin" - true 50% of the time and false 50% of the time
function coin(){
  let coin = Math.floor(2 * Math.random());
  return (coin == 1);
}

//https://stackoverflow.com/questions/16110758/generate-random-number-with-a-non-uniform-distribution
function randSkewLeft(){
  let unif = Math.random();
  let beta = Math.pow(Math.sin(unif*(3.14159)/2), 2);
  return (beta < 0.5) ? 2*beta : 2*(1-beta);
}

//not currently being used, but a random function that is skewed to the left with a max of max value
function randSkewLeftScaled(max){
    return Math.floor(max * randSkewLeft());
}

//date function from stackoverflow
//https://stackoverflow.com/questions/7357734/how-do-i-get-the-time-of-day-in-javascript-node-js
function getDateTime() {

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return [month + "-" + day + "-" + year, hour + ":" + min];

}

//gets the real age, "human" age, of the bot
function getRealAge(age){
  return age/(configs.general.ageMultiplier);
}

//get number of messages @baby_bot_ needed to overwhlem it
function getOverwhelmNumber(current_age){
  var age = getRealAge(current_age);
  if(age < stateOptions.baby["max-age"]) return 3;
  if(age < stateOptions.toddler["max-age"]) return 4;
  if(age < stateOptions.adolescent["max-age"]) return 5;
  if(age < stateOptions.teenager["max-age"]) return 6;
  return 15;
}

//get current phase of the bot
function getPhase(current_age){
    var age = getRealAge(current_age);
    if(age < stateOptions.baby["max-age"]) return botPhases.BABY;
    if(age < stateOptions.toddler["max-age"]) return botPhases.TODDLER;
    if(age < stateOptions.adolescent["max-age"]) return botPhases.ADOLESCENT;
    if(age < stateOptions.teenager["max-age"]) return botPhases.TEENAGER;
    return botPhases.ADULT;
}

//used for past message tracking, it adds minutes to the date and computes that date
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes*60000);
}

//checks if words contains any spelling or misspelling of the bot's username
//for example, @pete_bot_
function checkBabyBot(words){
  return words.includes("@" + configs.bot.username)
  || words.includes("@pete_bot_")
  || words.includes("@pete_bot")
  || words.includes("pete_bot")
  || words.includes("pete_bot_")
  || words.includes("pete_bot__")
  || words.includes("@pete_bot_")
  || words.includes("@Pete_Bot_")
  || words.includes("@Pete_bot_")
  || words.includes("Pete_Bot_")
  || words.includes("Pete_bot_")
}

//finds the username with a @, within the words array
function findUsername(words){
  for(var i = 0; i < words.length; i++){
    if(words[i].length > 0 && words[i] != "@YOUR_BOT_NAME"
      && words[i].substring(0, 1) === "@"){
      return words[i];
      }
    }
  return null;
}

//purges messages that are more than "goback" number of minutes old
//from the array named past
function purgeOutdated(past, goback){
  let current = new Date();
  let minAgo = addMinutes(current, -1 * goback);
  for(var i = 0; i < past.length; i++){
    if(past[i].time < minAgo){
      let rev = past.splice(i, 1)
    }
  }
}

//generates a random baby gugrle string
const babyGurgles = ["a", "e", "o", "u", "w", "!", "?", " "];
function randomBabyGurgle(){
  let len = rand(5);
  let str = "";
  for(let i = 0; i < len; i ++){
    str += babyGurgles[rand(babyGurgles.length)];
  }
  return str;
}

//invariant function
function inChronOrder(tosend){
  for(var i = 0; i < tosend.length - 1; i++){
    if(tosend[i].time > tosend[i + 1].time) return false;
  }
  return true;
}

module.exports = {
  rand : rand,
  randSkewLeft: randSkewLeftScaled,
  randEle: randEle,
  coin : coin,
  getDateTime: getDateTime,
  getOverwhelmNumber: getOverwhelmNumber,
  botPhases: botPhases,
  getPhase: getPhase,
  addMinutes: addMinutes,
  checkBabyBot: checkBabyBot,
  findUsername: findUsername,
  purgeOutdated: purgeOutdated,
  randomBabyGurgle: randomBabyGurgle,
  inChronOrder: inChronOrder,
  getRealAge: getRealAge,
  randomGreeting: randomGreeting
}
