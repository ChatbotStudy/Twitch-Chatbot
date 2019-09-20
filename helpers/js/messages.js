const fs = require('fs');
const rita = require('rita')
const csvWriter = require('csv-write-stream');
const util = require('./util.js')
const markov = require('./markov.js')
const emoteJson = require('../text-lists/emotesList.json')
const badWords = require('../text-lists/badwords.json').list;
var writer;

//filenames for data writing/reading
//"write" and "read" file names should actually be the same,
//but for debugging purposes i've separated them here in case you want to test the bot with
//a bigger dataset of lanugage but save the incoming messages to a different file
//fixedData should be the pathname for a file that we will write our "fixed" data to
//the fixed data only contains lexicon in rita.js and has been parsed appropriately so
//it is ready to be fed into the markov chain
const rawDataWrite =  __dirname + "/language/" + "out.csv"; //writes new raw messages to ths file
const rawDataRead = __dirname + "/language/" + "out.csv"; //reads in raw messages from this file
const fixedData = __dirname + "/language/" + "fixed.txt"; //both writing & reading from fixed.txt

/* these are frequency tables for the nextNoun(), nextVerb(), etc functions
frequency data is saved in the .txt files (nouns.txt, verbs.txt, etc)*/
let nounTable = {};
let verbTable = {};
let adverbTable = {};
let adjectiveTable = {};
let emoteTable = {};

//create file writing streams

/* fixedData will contain the phrases that have been
postprocessed with RiTa and are okay to be used for rita's markov chains

calling the save() will continue to write new fixed phrases to it
while the bot script is running

calling setup() with postprocessing set to true will clear fixedData, and
regenerate the contents using the raw data from rawDataRead */
var stream = fs.createWriteStream((fixedData), {flags: 'a'});
var allStream = fs.createWriteStream((__dirname + "/language/all.txt"), {flags: 'a'});

/*the files below store the nouns, verbs, adverbs, adj, emotes that we
encounter while either postprocessing the raw data or
when bot.js uses the save function for a message

these are used to create a frequency table that will be used for
questions that the bot can ask & emotes that the bot will use

the filenames for the noun, verb, other word information */

const nounFilename = __dirname + "/language/nouns.json";
const verbFilename = __dirname + "/language/verbs.json";
const adverbFilename = __dirname + "/language/adverbs.json";
const adjectiveFilename = __dirname + "/language/adjectives.json";
const emoteFilename =  __dirname + "/language/emotes.json";

/* this function performs the setup for message saving / language processing
if needToPostprocess is true, it will clear the files with all of the
processed information, and rebuild them from scratch using rawDataRead
once all of this is done, it will set up the markov chains using the
newly generated fixedData

otherwise, if needToPostprocess is false, it then sets up frequency
tables using preexisting data from the nouns.txt, verbs.txt, etc.. files
then, it sets up the markov chains using the preexisting fixedData

the needToPostprocess option should only be set to true if rawDataRead is
no longer aligned with fixedData for some reason
otherwise, leaving it on true will create a long delay at the beginning
if rawDataRead is a large file
*/
function setupMessageReaderWriter(needToPostprocess){

  if(needToPostprocess){
    fs.truncate(fixedData, 0, function(){console.log('done')})
    fs.truncate(nounFilename, 0, function(){console.log('done')})
    fs.truncate(verbFilename, 0, function(){console.log('done')})
    fs.truncate(adverbFilename, 0, function(){console.log('done')})
    fs.truncate(adjectiveFilename, 0, function(){console.log('done')})
    fs.truncate(emoteFilename, 0, function(){console.log('done')})

    postprocessData(rawDataRead);
  } else {
    setupTables();
    markov.setup(fixedData);
  }
}

/*this function adds a msg (line) to the frequency table
if the message doesn't exist it makes an entry for it
else, it updates the frequency */
function addLineToTable(table, l){
  if (table != emoteTable){
  	var line = l.toLowerCase()
  } else {
  	var line = l
  }
  if(table[line]){
    table[line].freq++;
  } else {
    table[line] = {'freq':1, 'used':false};
  }
}

/*this function sets up the frequency tables
it assumes that our ___.txt files contain lines that have one single
word per line, and just counts the number of occurances
of that word within the file to count frequency

should only be called if needToPostprocess is false
otherwise, the postprocessing setup will add to the tables instead

prints out frequent words in the table to debug*/
function setupTables(){
  nounTable = require(nounFilename);
  verbTable = require(verbFilename);
  adverbTable = require(adverbFilename);
  adjectiveTable = require(adjectiveFilename);
  emoteTable = require(emoteFilename);

  console.log("these are the nouns", nounTable);
  console.log("these are the verbs", verbTable);
  console.log("these are the adverb", adverbTable);
  console.log("these are the adjectives", adjectiveTable);
  console.log("these are the emotes", emoteTable);
}

/* saves the raw message into a csv file called rawDataWrite

currently writing in placeholdertext after the msg as a hacky
way for my linereader to parse the csv contents, by detecting the position
",placeholdertext" we hopefully know where "msg" ends

saves msg, date, time, display name, userid and username

doesn't send headers because it assumes the file rawDataWrite
already has headers
IF YOU MAKE A NEW TEXT FILE TO HOLD THE DATA, MAKE SURE THE FIRST LINE IS THE HEADER LINE
OR ELSE IT WILL STOP SAVING MESSAGES IF IT THINKS YOUR HEADERS ARE WRONG

you can turn sendHeaders on to true for a quick second just to generate the header, but
try to keep if off because it will send headers every time, not just once*/
function saveMessageCsv(context, msg){

  let writer = csvWriter({ headers: ["message", "placeholder", "date", "time", "display name", "userid", "username"], sendHeaders: false})
  writer.pipe(fs.createWriteStream((rawDataWrite), {flags: 'a'}));
  let timestamp = util.getDateTime();
  writer.write([ msg, "placeholdertext", timestamp[0], timestamp[1], context['display-name'], context['user-id'], context['username']]);
  writer.end();

}

/* this function is exported to be used by bot.js
used to save a message DURING runtime, when someone in the chat
says something, we parse that message, write the contents
to the relevant files, and then pass it in as a token for the markov chains */
function save(context, msg){
  let badwords = badWords.filter((ele)=>(msg.indexOf(ele)>=0));
  if(badwords.length > 0){
    console.log("found bad words",  badwords);
    return;
  }
  console.log("saving... " + msg + " within messages.js");
  saveMessageCsv(context, msg); //save raw data to csv
  saveMessage(msg, false); //postprocess is set to false
}

function saveToAll(target, context, msg){
  let message = target + "," + context.username + "," + msg + "\n";
  allStream.write(message);
}

/* save the message by parsing it,
retrieving the rita lexicon recognized snippets of text
retrieving the nouns/verbs/adverbs/adjs/emotes
saving those into relevant files
then adding the piece's info the frequency tables */
function saveMessage(msg, postprocess){

  let res = parseMsg(msg); //parse the message
  let phrases = res.phrases;
  let nouns = res.nouns;
  let verbs = res.verbs;
  let adverbs = res.adverbs;
  let adjectives = res.adjectives;
  let emotes = res.emotes;
  //console.log(res);

  //write the phrases into the fixedData file
  //if postprocess is false, this means it's runtime
  //so we send the tokens over to markov to update it
  for( var i = 0; i < phrases.length; i++ ){
    stream.write(phrases[i]);
    console.log("saving... " + msg + "postprocess is", postprocess);
    if(!postprocess) markov.save(phrases[i]);
  }

  //save the words into the relevant files, update table info
  for(var i = 0; i < verbs.length; i++){
    let n = verbs[i];
    addLineToTable(verbTable, n);
  }
  for(var i = 0; i < adverbs.length; i++){
    let n = adverbs[i];
    addLineToTable(adverbTable, n);
  }
  for(var i = 0; i < adjectives.length; i++){
    let n = adjectives[i];
    addLineToTable(adjectiveTable, n);
  }
  for(var i = 0; i < nouns.length; i++){
    let n = nouns[i];
    addLineToTable(nounTable, n);
  }
  for(var i = 0; i < emotes.length; i++){
    let n = emotes[i];
    addLineToTable(emoteTable, n);
  }
}

function saveToJson(filename, json){
  var jsonData = JSON.stringify(json);
  var fs = require('fs');
  console.log("saving to json", json)
  fs.writeFileSync(filename, jsonData, function(err) {
    if (err) {
      console.log("error saving config.json", err);
    }
  });
}

//checks if the word is in the json file of general emotes
function isEmote(word){

  if(emoteJson[word]) return true;
  return false;

}

/*parses the raw message
discards message if not all ASCII characters

phrases: rita approved snippets of words. all words must be within the rita
lexicon, there must be at least 5 consecutive good words, and must end
with a noun

nouns: any nouns we found

adverbs: any adverbs we found

etc... */
function parseMsg(msg){
  let res =
    {'phrases': [],
      'nouns' : [],
      'adverbs' : [],
      'verbs' : [],
      'adjectives' : [],
      'emotes' : []
    }
  if(msg == null) return;
  if(!isASCII(msg)) return res;

  //console.log("parsing message.... 1");

  msg = msg.charAt(0).toUpperCase() + msg.slice(1);
  msg = msg.replace(" i ", " I ");
  msg = msg.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '');
  msg = msg.replace(" youre ", " you are ");
  msg = msg.replace(" im ", " I am ");

  var words = msg.split(' ');
  var sen = "";
  var senLen = 0;
  var endidx = 0;
  var numValid = 0;

  for(var i = 0; i < words.length; i++){
    let word = words[i];
    //let word = words[i].toLowerCase();
    if(rita.RiTa.containsWord(word) || (word === "I")){
      sen += " " + word;
      senLen++;
      if(rita.RiTa.isNoun(word)){
        endidx = sen.length;
        numValid = senLen;
        if(word.length > 6 && !rita.RiTa.isAdjective(word)){
          let sing = rita.RiTa.singularize(word);
          res.nouns.push(sing);
        }
      } else if(rita.RiTa.isVerb(word)){
        if(word.length > 3){
          res.verbs.push(word);
        }
      } else if(rita.RiTa.isAdverb(word)){
        if(word.length > 6){
          res.adverbs.push(word);
        }
      } else if (rita.RiTa.isAdjective(word)){
        if(word.length > 6){
          res.adjectives.push(word);
        }
      }
    } else {
      if (isEmote(words[i])){
        res.emotes.push(words[i]);
      }

      if (numValid > 4){
        res.phrases.push(sen.substring(0, endidx) + ".");
      }
      numValid = 0;
      senLen = 0;
      endidx = 0;
      sen = "";
    }
  }
  if (numValid > 4){
    res.phrases.push(sen.substring(0, endidx) + ".");
  }
  return res;
}

//checks if string is all ASCII characters
function isASCII(str) {
    return /^[\x00-\x7F]*$/.test(str);
}

//postprocesses the data using filename as the raw data source
//writes the output to fixedData file
function postprocessData(filename){

  var lineReader = require('readline').createInterface({
    input: fs.createReadStream(filename)
  });

  lineReader.on('line', function (line) {
    let idx = line.indexOf(",,,")
    if(line.indexOf(",placeholdertext") > 0){
      idx = line.indexOf(",placeholdertext");
    } else {
      idx = line.indexOf(",,,")
    }
    let msg = line.substring(0, idx);

    saveMessage(msg, true);

  }).on('close', function () {

    markov.setup(fixedData);

    saveToJson(nounFilename, nounTable);
    saveToJson(verbFilename, verbTable);
    saveToJson(adverbFilename, adverbTable);
    saveToJson(adjectiveFilename, adjectiveTable);
    saveToJson(emoteFilename, emoteTable);

    console.log("postprocessing done. here are some high frequency words.")
    for(var i = 0; i < 10; i++){
      console.log(getNextHighFreqNoun());
      console.log(getNextHighFreqVerb());
      console.log(getNextHighFreqAdverb());
      console.log(getNextHighFreqAdjective());
      console.log(getEmote());
      console.log("---------")

    }
  });
}

//should be using a priority queue to make this more efficient
//grabs next most frequent noun that hasn't been visited yet
//then it marks the noun as used
function getNextHighFreqNoun(){

  var maxkey = "";
  for (const [key, value] of Object.entries(nounTable)) {
    if(maxkey === "" && !value.used) maxkey = key;
    if(!value.used && value.freq >= nounTable[maxkey].freq) maxkey = key;
  }
  if(maxkey === ""){
    console.log("no words in table yet... exiting");
    return "something..?";
  }
  nounTable[maxkey].used = true;
  return maxkey;
}

//see noun documentation above
function getNextHighFreqVerb(){

  var maxkey = "";
  for (const [key, value] of Object.entries(verbTable)) {
    if(maxkey === "" && !value.used) maxkey = key;
    if(!value.used && value.freq >= verbTable[maxkey].freq) maxkey = key;
  }
  if(maxkey === ""){
    console.log("no words in table yet... exiting");
    return "something..?";
  }
  verbTable[maxkey].used = true;
  return maxkey;
}

//see noun documentation above
function getNextHighFreqAdjective(){

  var maxkey = "";
  for (const [key, value] of Object.entries(adjectiveTable)) {
    if(maxkey === "" && !value.used) maxkey = key;
    if(!value.used && value.freq >= adjectiveTable[maxkey].freq) maxkey = key;
  }
  if(maxkey === ""){
    console.log("no words in table yet... exiting");
    return "something..?";
  }
  adjectiveTable[maxkey].used = true;
  return maxkey;
}

//see noun documentation above
function getNextHighFreqAdverb(){

  var maxkey = "";
  for (const [key, value] of Object.entries(adverbTable)) {
    if(maxkey === "" && !value.used) maxkey = key;
    if(!value.used && value.freq >= adverbTable[maxkey].freq) maxkey = key;
  }
  if(maxkey === ""){
    console.log("no words in table yet... exiting");
    return "something..?";
  }
  adverbTable[maxkey].used = true;
  return maxkey;
}

//this one is different because it does't care about reusing emotes
//just randomly grabs one
//todo - sort table by frequency
function getEmote(){

  let entries = Object.entries(emoteTable);
  if(entries.length == 0){
    console.log("no emotes in table yet... exiting");
    return "";
  }
  let ran = util.rand(entries.length);
  return entries[ran][0];
}

//in case of ctrl-c, we need to save our tables
function forceSaveTables(){
  saveToJson(nounFilename, nounTable);
  saveToJson(verbFilename, verbTable);
  saveToJson(adverbFilename, adverbTable);
  saveToJson(adjectiveFilename, adjectiveTable);
  saveToJson(emoteFilename, emoteTable);
}

//uncomment line below if testing messages.js file
//setupMessageReaderWriter(true);

module.exports = {
   nextNoun: getNextHighFreqNoun,
   nextVerb: getNextHighFreqVerb,
   nextAdjective: getNextHighFreqAdjective,
   nextAdverb: getNextHighFreqAdverb,
   getEmote: getEmote,
   setup: setupMessageReaderWriter,
   save: save,
   toddler: markov.toddler,
   adolescent: markov.adolescent,
   teenager: markov.teenager,
   respond: markov.respond,
   forceSaveTables: forceSaveTables,
   saveToAll: saveToAll
}
