var express = require('express')
var app = express()

///

const Boom = require('boom');
// const ext = require('commander');
const jsonwebtoken = require('jsonwebtoken');
const request = require('request');
const bodyParser = require('body-parser');
const fs = require('fs');
const jwt = require('jsonwebtoken');

///

const verboseLogging = true;
const verboseLog = verboseLogging ? console.log.bind(console) : () => { };

///

const serverTokenDurationSec = 30;          // our tokens for pubsub expire after 30 seconds
const userCooldownClearIntervalMs = 30000;  // interval to reset our tracking object
const channelCooldownMs = 1000;             // maximum broadcast rate per channel
const bearerPrefix = 'Bearer ';             // HTTP authorization headers have this prefix

///

const feedbackFormsURL = 'https://forms.gle/aXyuymYT9yZcjGLBA';

///

const initialAmount = 0;
const maxAmount = 100;
const amountDecreaseTimer = 10000;
const amountLiveTime = 300;
const userCooldownMs = 1000;

///

var channelCooldowns = {};
var channelAmounts = {};
var vievewsCounts = {};
var userCooldowns = {};
var decreaseTimer = {};
var decreaseTimerActive = {};
var channelNames = {};

var channelChatMessageForbidden = {};

///

const STRINGS = {
  secretEnv: usingValue('secret'),
  clientIdEnv: usingValue('client-id'),
  ownerIdEnv: usingValue('owner-id'),
  serverStarted: 'Server running at %s',
  secretMissing: missingValue('secret', 'EXT_SECRET'),
  clientIdMissing: missingValue('client ID', 'EXT_CLIENT_ID'),
  ownerIdMissing: missingValue('owner ID', 'EXT_OWNER_ID'),
  messageSendError: 'Error sending message to channel %s: %s',
  pubsubResponse: 'Message to c:%s returned %s',
  amountChanged: 'Amount (channelID %s) changed from %s to %s, with %s',
  amountBroadcast: 'Broadcasting new amount %s (old c:%s)',
  getChanelViewers: 'Try GET channel %s viewers count.',
  responseChanelViewers: 'Twitch return %s viewers count for %s channel ID',
  senAmount: 'Sending new amount %s (old c:%s)',
  cooldown: 'Please wait before clicking again',
  invalidAuthHeader: 'Invalid authorization header',
  invalidJwt: 'Invalid JWT',
};

///

const ownerId = 'trom666one';
const secret = Buffer.from('//pilJ5gU4baX2atR1gx+o2zhdqXVqMC8eDwHFiLbII=', 'base64');
const clientId = 'cu6xkebsgerd6ikki3cq08ov1koygc';

const extVersion = '0.0.3';

///
///
///

app.set('port', (process.env.PORT || 5000))

app.use(express.static(__dirname)) // __dirname + '/public'

app.use(function (req, res, next) {
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', '*');
  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization');
  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);
  // Pass to next layer of middleware
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

///
///
///


///
///
///


app.get('/', function(req, res) {
    res.redirect(feedbackFormsURL);
})

app.get('/obs-overlay/:channel', function(req , res){
  var channel = req.params.channel;
  res.sendFile(__dirname + '/obs-overlay.html', {channel: channel});
})

app.get('/channels', function(req, res) {
    res.sendFile(__dirname + '/channelsData.json');
})

app.get('/viewers', function(req, res) {
    res.send(vievewsCounts);
})

app.get('/amounts', function(req, res) {
  res.send(channelAmounts);
})

app.get('/names', function(req, res) {
  res.send(channelNames);
})

app.get('/chat', function(req, res) {
  res.send(channelChatMessageForbidden);
})

app.get('/fill/query', function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  let value = getAmount(req);
  //console.log("GET /fill/query = " + value);
  res.send(value.toString());
})

app.post('/fill/amount', function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  //console.log("POST /fill/amount");
  changeAmount(req, 1);
  res.send('POST');
})

app.post('/fill/demount', function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  //console.log("POST /fill/amount");
  changeAmount(req, -1);
  res.send('POST');
})





   


app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));

  //initDataSaveTimer(10000);
});

/*
async function initDataSaveTimer(ms) {
  await sleepDataSaveTimer(parseInt(ms));

  var tmpJson = {
    "channelAmounts": {},
    "vievewsCounts": {},
    "userCooldowns": {},
    "decreaseTimer": {},
    "decreaseTimerActive": {},
    "channelCooldowns": {}
  }

  tmpJson.channelAmounts = channelAmounts;
  tmpJson.vievewsCounts = vievewsCounts;
  tmpJson.userCooldowns = userCooldowns;
  tmpJson.decreaseTimer = decreaseTimer;
  tmpJson.decreaseTimerActive = decreaseTimerActive;
  tmpJson.channelCooldowns = channelCooldowns;

  fs.writeFile(__dirname + '/channelsData.json', JSON.stringify(tmpJson), err => {
    if (err) {
        console.log('Error writing file', err)
    } else {
        // console.log('Successfully wrote file')
    }
  });

  initDataSaveTimer(ms);
}

function sleepDataSaveTimer(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}   
*/
///

setInterval(() => { userCooldowns = {}; }, userCooldownClearIntervalMs);

///














function changeAmount(req, value) {
  // Verify all requests.
  const payload = verifyAndDecode(req.headers.authorization);
  const { channel_id: channelId, opaque_user_id: opaqueUserId } = payload;

  let currentAmount = channelAmounts[channelId] || parseInt(initialAmount);
  
  decreaseTimer[channelId] = 10000;

  // Bot abuse prevention:  don't allow a user to spam the button.
  if (userIsInCooldown(opaqueUserId)) {
    // throw Boom.tooManyRequests(STRINGS.cooldown);
    // verboseLog('USER_COOLDOWN');
    return;
  }
  

  let viewersCount = vievewsCounts[channelId];
  let changeValue = viewersCount > 1 ? (parseInt(value) / viewersCount).toFixed(5) : parseInt(value); // 1 / (4000 / 20)
  currentAmount = Math.min(Math.max(parseFloat(currentAmount) + parseFloat(changeValue), 0), parseInt(maxAmount));

  // Save the new color for the channel.
  channelAmounts[channelId] = currentAmount.toFixed(1);


  if(!channelNames[channelId]){
    request(`https://api.twitch.tv/kraken/channels?client_id=${clientId}&api_version=5&id=${channelId}`, function (err, res, body) {
      if (err) {
        console.log(STRINGS.messageSendError, channelId, err);
      } else{
      var name = JSON.parse(body).channels[0].display_name;
      channelNames[channelId] = name;
      }
    });
  }

  channelChatMessageForbidden[channelId] = channelChatMessageForbidden[channelId] || false;

  if(channelChatMessageForbidden[channelId] && channelAmounts[channelId] < 50.0){
    channelChatMessageForbidden[channelId] = false;
  }

  if(!channelChatMessageForbidden[channelId] && channelAmounts[channelId] >= 100.0){ // channelId == 174360102 && 
    sendChatMessage(channelId);
  }

  // Broadcast the color change to all other extension instances on this channel.
  attemptAmountBroadcast(channelId);

  // var timer = decreaseTimer[channelId] || false;

  // if (!timer){
  //   decreaseTimer[channelId] = true;
  //   initDecreaseAmountTimer(channelId);
  // }

  decreaseTimer[channelId] = 10000;
  var timerActive = decreaseTimerActive[channelId] || false;
  if (!timerActive){
    decreaseTimerActive[channelId] = true;
    initDecreaseAmountTimer(channelId, 10);
  }

  return currentAmount;
}

///
///
///
///
///

// TODO переделать с учетом makeServerToken

function sendChatMessage(channelId){
// https://api.twitch.tv/extensions/<client ID>/<extension version>/channels/<channel ID>/chat

        // let twitch_id = channelId; // 'destination_channel_id'

        // var secr = Buffer.from(secret, 'base64');

        var payload = {
            'exp':          Math.floor(new Date().getTime() / 1000) + 60,
            'user_id':      ''+channelId,
            'role':         'external'
        }

        var sig = jwt.sign(payload, secret);

        // tell everyone
        var payload = JSON.stringify({
            'text': `Toxicity 100% NotLikeThis`
        });

		let url = 'https://api.twitch.tv/extensions/'
            + clientId + '/'
            + extVersion
            + '/channels/'
            + channelId
            + '/chat';

        request.post({
            url: url,
            headers: {
                'Accept': 'application/vnd.twitchtv.v5+json',
                'Authorization': 'Bearer ' + sig,
                'Client-ID': clientId,
                'Content-Type': 'application/json'
            },
            body: payload,
            gzip: true
        }, function(e, r, b) {
            if (e) {
                console.log(e);
            } else if (r.statusCode == 204) {
                console.log('Relay chat OK');
                channelChatMessageForbidden[channelId] = true;
            } else {
                console.log('Got ' + r.statusCode);
                console.log(b);
            }
        });













  // var channelName = channelNames[channelId];

  // const headers = {
  //   // 'Client-ID': clientId,
  //   'Content-Type': 'text',
  //   // 'Authorization': bearerPrefix + makeServerToken(channelId),
  //   'channelId': channelId,
  //   'channelName': channelName,
  // };

  // request(`https://toxicmeterbot.herokuapp.com/toxic`, //https://toxicmeterbot.herokuapp.com/toxic?channel=${channelId}&name=${channelName}
  // {
  //   method: 'POST',
  //   headers,
  // }, (err, res) => {
  //   if (err) {
  //     console.log(STRINGS.messageSendError, channelId, err);
  //   } else {
  //     channelChatMessageForbidden[channelId] = true;
  //   }
  // });

}

///
///
///
///
///

function attemptAmountBroadcast(channelId) {
  // Check the cool-down to determine if it's okay to send now.
  const now = Date.now();
  const cooldown = channelCooldowns[channelId];
  if (!cooldown || cooldown.time < now) {
    // It is.
    sendAmountBroadcast(channelId);
    channelCooldowns[channelId] = { time: now + channelCooldownMs };
  } else if (!cooldown.trigger) {
    // It isn't; schedule a delayed broadcast if we haven't already done so.
    cooldown.trigger = setTimeout(sendAmountBroadcast, now - cooldown.time, channelId);
  }
}

///

function sendAmountBroadcast(channelId) {
  // Set the HTTP headers required by the Twitch API.
  const headers = {
    'Client-ID': clientId,
    'Content-Type': 'application/json',
    'Authorization': bearerPrefix + makeServerToken(channelId),
  };

  // Create the POST body for the Twitch API request.
  const currentAmount = channelAmounts[channelId];
  const body = JSON.stringify({
    content_type: 'application/json',
    message: currentAmount,
    targets: ['broadcast'],
  });

  // Send the broadcast request to the Twitch API.
  // verboseLog(STRINGS.amountBroadcast, currentAmount, channelId);
  request(`https://api.twitch.tv/extensions/message/${channelId}`,
  {
    method: 'POST',
    headers,
    body,
  }
  , (err, res) => {
    if (err) {
      console.log(STRINGS.messageSendError, channelId, err);
    } else {
      // verboseLog(STRINGS.pubsubResponse, channelId, res.statusCode);
    }
  });
    

  // verboseLog(STRINGS.getChanelViewers, channelId);
  request(
    `https://api.twitch.tv/kraken/streams/${channelId}?client_id=${clientId}&api_version=5`,
    {
      method: 'GET'
    }
    , (err, res) => {
      if (err) {
        console.log(STRINGS.messageSendError, channelId, err);
      } else {
        // var text = res.body;
        if(isJson(res.body)){
          var stream = JSON.parse(res.body)["stream"];
          var error = JSON.parse(res.body)["error"] || null;
          if(stream !== null && error == null){
            vievewsCounts[channelId] = JSON.parse(res.body)["stream"].viewers;
          }
        }  
        // if (/^[\],:{}\s]*$/.test(text.replace(/\\["\\\/bfnrtu]/g, '@').
        // replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
        // replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) 
        // {
          
        //   else{
        //     // verboseLog("stream == null");
        //   }
        // }else{
        
        //   console.log("--------------------------------------");
        //   console.log(res.body);
        //   console.log("--------------------------------------");
        // }


        
        
        // verboseLog(STRINGS.responseChanelViewers, vievewsCounts[channelId], channelId);
      }
    });
}

function isJson(str) {
  try {
      JSON.parse(str);
  } catch (e) {
      return false;
  }
  return true;
}


///
///
///

function getAmount(req) {
  // Verify all requests.
  const payload = verifyAndDecode(req.headers.authorization);

  // Get the color for the channel from the payload and return it.
  const { channel_id: channelId, opaque_user_id: opaqueUserId } = payload;
  const currentAmount = channelAmounts[channelId] || parseInt(initialAmount);
  // verboseLog(STRINGS.sendAmount, currentAmount, opaqueUserId);
  return currentAmount;
}

///
///
///

// Create and return a JWT for use by this service.
function makeServerToken(channelId) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + serverTokenDurationSec,
    channel_id: channelId,
    user_id: ownerId, // extension owner ID for the call to Twitch PubSub
    role: 'external',
    pubsub_perms: {
      send: ['*'],
    },
  };
  return jsonwebtoken.sign(payload, secret, { algorithm: 'HS256' });
}

///
///
///
  
function userIsInCooldown(opaqueUserId) {
  // Check if the user is in cool-down.
  const cooldown = userCooldowns[opaqueUserId];
  const now = Date.now();
  if (cooldown && cooldown > now) {
    return true;
  }

  // Voting extensions must also track per-user votes to prevent skew.
  userCooldowns[opaqueUserId] = now + parseInt(userCooldownMs);
  return false;
}
 
///
///
///

async function initDecreaseAmountTimer(channelId, ms) {
  var timer = decreaseTimer[channelId];
  //console.log(timer); ///
  await sleep(parseInt(ms));
  if(timer <= 0){
    decreaseAmount(channelId);
  }
  else{
    timer-=parseInt(ms);
    decreaseTimer[channelId] = timer;
    initDecreaseAmountTimer(channelId, 10);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}   

function decreaseAmount(channelId){
  channelAmounts[channelId] = Math.min(Math.max(
    parseFloat(channelAmounts[channelId]) - 0.1, 0), parseInt(maxAmount));

  if(channelAmounts[channelId] == 0){
    decreaseTimerActive[channelId] = false;
  }
  else{
    initDecreaseAmountTimer(channelId, amountLiveTime);
  }
  attemptAmountBroadcast(channelId);
}

///
///
///

// async function initDecreaseAmountTimer(channelId) {
//   await sleep(parseInt(amountLiveTime));
//   decreaseAmount(channelId);
// }

// function sleep(ms) {
//   return new Promise((resolve) => {
//     setTimeout(resolve, ms);
//   });
// }   

// function decreaseAmount(channelId){
//   channelAmounts[channelId] = Math.min(Math.max(parseFloat(channelAmounts[channelId]) - 0.1, 0), parseInt(maxAmount));

//   //console.log(`Amount (decreased) = ` + channelAmounts[channelId]);

//   if(channelAmounts[channelId] == 0){
//     decreaseTimer[channelId] = false;
//   }
//   else{
//     initDecreaseAmountTimer(channelId);
//   }
//   attemptAmountBroadcast(channelId);
// }

///
///
///
  
function usingValue(name) {
  return `Using environment variable for ${name}`;
}
  
///
///
///
  
function missingValue(name, variable) {
  const option = name.charAt(0);
  return `Extension ${name} required.\nUse argument "-${option} <${name}>" or environment variable "${variable}".`;
}

///
///
///

// Verify the header and the enclosed JWT.
function verifyAndDecode(header) {
  if (header.startsWith(bearerPrefix)) {
    try {
      const token = header.substring(bearerPrefix.length);
      return jsonwebtoken.verify(token, secret, { algorithms: ['HS256'] });
    }
    catch (ex) {
      throw Boom.unauthorized(STRINGS.invalidJwt);
    }
  }
  throw Boom.unauthorized(STRINGS.invalidAuthHeader);
}