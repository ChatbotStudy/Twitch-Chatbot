var fs  = require("fs");
const kao = require('./kaomoji.js')
const rita = require('rita')
const util = require('./util.js')
let datasetpath = "fixed.txt";
let datastring = ""; //this will be a very, very, long string
let rm; //markov object
let stage = -1; //global flag

function setupMarkov(path){
  console.log("SETUP MARKOV PATH ", path)
  datasetpath = path;
  rm = new rita.RiMarkov(5, true, true);
  fs.readFile(datasetpath, function(err, f){
    datastring = f.toString();
      
      testMarkov(datastring);
  });
}

function setupToddlerMarkov(){
  rm = new rita.RiMarkov(4, true, true);
  rm.loadText(datastring);
  stage = 0;
}

function toddlerTalk(){
  if(stage != 0) setupToddlerMarkov();
  if(rm.ready()){
    let tok = [];
    while(!hasNoun(tok) || tok.includes("I") || tok.includes("i"))
    {
      tok = rm.generateUntil(".", 2, 5);
    }
    let toks = tok.join(" ");
    toks = toks.replace(". ", "");
    return toks.toLowerCase() + " " + kao.getKaoRand();
  } else {
    console.log("MARKOV ERROR.");
    return kao.getKao("sad");
  }
}

function setupAdolescentMarkov(){
  rm = new rita.RiMarkov(3, true, true);
  rm.loadText(datastring);
  stage = 1;
}

function adolescentTalk(){
  if(stage != 1) setupAdolescentMarkov();
  if(rm.ready()){
    let tok = rm.generateSentence();
    let kaotalk = util.coin() ? kao.getKaoRand() : "";
    return tok.toLowerCase() + " " + kaotalk;
  } else {
    console.log("MARKOV ERROR.");
    return "ugh";
  }
}

function setupTeenageMarkov(){
  rm = new rita.RiMarkov(5, true, true);
  rm.loadText(datastring);
  stage = 2;
}

function teenageTalk(){
  if(stage != 2) setupTeenageMarkov();
  if (rm.ready()){
    let tok = rm.generateSentences(util.rand(2) + 1);
    return tok.join(" ").toLowerCase();
  } else {
    console.log("MARKOV ERROR.");
    return "ugh...";
  }
}

function testMarkov(){
  console.log("markov setup: testing now");
  console.log("\n----------\n")
  console.log("this is toddler talk.\n")
  for(var i = 0; i < 2; i++){
    console.log(toddlerTalk());
  }

  console.log("\n----------\n")
  console.log("this is adolescent talk.\n")
  for(var i = 0; i < 2; i++){
    console.log(adolescentTalk());
  }

  console.log("\n----------\n")
  console.log("this is teenage talk.\n")
  for(var i = 0; i < 2; i++){
    console.log(teenageTalk());
  }
  console.log("\n----------\n")
  console.log("completions.\n")
  console.log(respond("who are you"));
  console.log(respond("why are you so funny"));
  console.log(respond("I like babies"));
  console.log(respond("sometimes I think about god"));
  console.log(respond("i have a big headache"));''

}

function hasNoun(w){
  return ((w.filter((e)=>rita.isNoun(e))).length > 0);
}

function save(msg){
  console.log("saving... " + msg + " into markov");
  if(msg === "") return;
  rm.loadText(msg);
}

//startingWords is an array
function getCompletions(startingWords){
  let completearray = startingWords;
  for(var i = 0; i < 10; i++){
    let completions = rm.getCompletions(completearray);
    if(completions[0] === "." || completions.length === 0) break;
    let randomnum = completions.length <= 7 ? util.rand(completions.length) : util.rand(7);
    completearray.push(completions[randomnum]);
  }
  return completearray;
}

//takes in a string, returns a completion
function respond(statement){
  if(statement.indexOf("why") >= 0){
    return getCompletions(["because"]).join(" ");
  } else if (statement.indexOf("who") >= 0){
    return getCompletions(["I", "am"]).join(" ");
  } else {
    statement = statement.split(" ");
    let nouns = statement.filter(word => rita.RiTa.isNoun(word))
    if(nouns.length == 0) return null;

    let bestresponse = nouns.map(noun => getCompletions([noun])).reduce((a, b) => (a.length >= b.length ? a : b));
    if(bestresponse.length < 2) return null;
    return bestresponse.join(" ");
  }
}

//setupMarkov("fixed-old.txt");


module.exports = {
  save: save,
  setup: setupMarkov,
  toddler: toddlerTalk,
  adolescent: adolescentTalk,
  teenager: teenageTalk,
  complete: getCompletions,
  respond: respond
}
