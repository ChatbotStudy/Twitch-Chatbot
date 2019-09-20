//this file contains functions for scoring strings

const rita = require('rita');

function combine(words){
  let msg = words.length < 1 ? "" : words.reduce((x, y) => x + y)
  return msg;
}

//scores the song
function scoreSong(words){
  let song = combine(words)
  let len = song.length;
  if(len < 2) return 0; //bad song, too short :(
  let longestConsectutive = 0;
  let currConsecutive = 0;
  let prev = song.charAt(0);
  for(var i = 1; i < len; i ++)
  {
    if(song.charAt(i) == prev){
      currConsecutive++;
    } else {
      if(currConsecutive > longestConsectutive) longestConsectutive = currConsecutive;
      currConsecutive = 0;
    }
    prev = song.charAt(i)
  }
  let score = longestConsectutive + len;
  score = (score > 59.9) ? 59.9 : score;
  return Math.trunc((score/20) + 1); //int division keeps it in the range between 1 - 3
}

//scores the word for food
function scoreWord(words){
  console.log("these are the words: ", words)
  let word = combine(words)
  let score = rita.RiTa.getSyllables(word).length
  let numalliterations = 0;
  let numrhymes = 0;
  for(var i = 0; i < word.length - 2; i++){
    if(rita.RiTa.isAlliteration(word[i], word[i + 1])) numalliterations++;
    if(rita.RiTa.isRhyme(word[i], word[i + 1])) numrhymes++;
  }
  score += numalliterations + numrhymes;
  console.log("scoring..." + score, numalliterations, numrhymes)
  return Math.floor((score < 29 ? score : 29)/10);
}

module.exports = {
  song : scoreSong,
  food : scoreWord
}
