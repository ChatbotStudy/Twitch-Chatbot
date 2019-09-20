//thank you to http://kaomoji.ru/en/
const kao = {
  "negative":{
    "sad" : {
      "1": ["(-_-)",
            "(>_<)",
            "(╯_╰)",
            "(T_T)"],
      "2": ["( ╥ω╥ )",
            "(｡•́︿•̀｡)",
            "(╥﹏╥)",
            "( ; ω ; )"],
      "3": ["(´Ｏ`)",
            "*(>д<)*",
            "...(>﹏<)...",
            "''(＞_＜)''"]
    },
    "pain": {
      "1": ["(×_×) ...?",
            "(＋_＋) ... "],
      "2": ["(± _ ±) ...?"],
      "3": ["(×_×)⌒☆!"]
    },
    "sleepy":{
      "1": ["(－_－) zzZ"],
      "2": ["(－_－) zzZ"],
      "3": ["(－_－) zzZ"]
    },
    "angry": {
      "1": ["(`ー´)",
            "(҂ `з´ )",
            "(ﾒ` ﾛ ´)"],
      "2": ["(＃`Д´)",
            "(°ㅂ°╬)",
            "(`皿´＃)",
            "ヽ( `д´*)ノ"],
      "3": ["凸( ` ﾛ ´ )凸"]
    },
    "dissatisfied": {
      "1": ["(￣︿￣)",
            "(︶︹︺)",
            "(--_--)",
            "(⇀‸↼‶)"],
      "2": ["(￢_￢;)",
            "(￣ ￣|||)"],
      "3": ["(」°ロ°)"]
    }
  },
  'positive': {
    "happy":{
      "1": ["(* ^ ω ^)",
            "(￣▽￣)",
            "(o˘◡˘o)"],
      "2": ["(✯◡✯)",
            "ヽ(・∀・)ﾉ",
            "o(>ω<)o",
            "(*´▽`*)"],
      "3": ["｡ﾟ( ﾟ^∀^ﾟ)ﾟ｡",
            "°˖✧◝(⁰▿⁰)◜✧˖°",
            "o(≧▽≦)o"]
    }
  }
}

function rand(max){
  return Math.floor(max * Math.random());
}

function randEle(arr){
  let idx = rand(arr.length);
  return arr[idx];
}

function getRand(parent, tag, intensity){
  let ele = kao[parent][tag][intensity];
  return randEle(ele);
}

function getRandAny(parent, tag){
  let ele = kao[parent][tag]["1"].concat(kao[parent][tag]["2"].concat(kao[parent][tag]["3"]))
  return randEle(ele);
}

function getRandSad(){
  return getRandAny('negative', 'sad');
}

function getRandPain(){
  return getRandAny('negative', 'pain');
}

function getRandAngry(){
  return getRandAny('negative', 'angry');
}

function getRandDissatisfied(){
  return getRandAny('negative', 'dissatisfied');
}

function getKao(tag){
  if(tag === 'sad'
    || tag === 'dissatisfied'
    || tag === 'angry'
    || tag === 'pain'
    || tag === 'sleepy'){
      return getRandAny('negative', tag)
    } else {
      return getRandAny('positive', tag)
    }
}

function coin(){
  let coin = Math.floor(2 * Math.random());
  return (coin == 1);
}

function randEle(arr){
  let idx = rand(arr.length);
  return arr[idx];
}

function getKaoRand(){
  if(coin()) return getRandAny('negative',randEle(['sad','dissatisfied','angry','pain']))

  return getRandAny('positive', 'happy')
}

function getKaoIntensity(tag, intensity){
  if(tag === 'sad'
    || tag === 'dissatisfied'
    || tag === 'angry'
    || tag === 'pain'
    || tag === 'sleepy'){
      return getRand('negative', tag, intensity)
    } else {
      return getRand('positive', tag, intensity)
    }
}

module.exports = {
    getKao: getKao,
    getKaoRand: getKaoRand,
    getKaoIntensity: getKaoIntensity
};
