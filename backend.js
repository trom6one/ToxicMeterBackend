var express = require('express')
var app = express()

////////////////////////

const Boom = require('boom');
// const color = require('color');
const ext = require('commander');
const jsonwebtoken = require('jsonwebtoken');
const request = require('request');
const bodyParser = require('body-parser');

// The developer rig uses self-signed certificates.  Node doesn't accept them
// by default.  Do not use this in production.
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Use verbose logging during development.  Set this to false for production.
const verboseLogging = true;
const verboseLog = verboseLogging ? console.log.bind(console) : () => { };

const serverTokenDurationSec = 30;          // our tokens for pubsub expire after 30 seconds
const userCooldownClearIntervalMs = 30000;  // interval to reset our tracking object
const channelCooldownMs = 1000;             // maximum broadcast rate per channel
const bearerPrefix = 'Bearer ';             // HTTP authorization headers have this prefix

const feedbackFormsURL = 'https://forms.gle/aXyuymYT9yZcjGLBA';

const initialAmount = 0;
var maxAmount = 100;
var amountLiveTime = 15000;
var userCooldownMs = 1000;

const channelCooldowns = {};
const channelAmounts = {};
const vievewsCounts = {};
let userCooldowns = {};

var timerIsActive = false;

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

////////////////////////

const ownerId = 'trom666one';
const secret = Buffer.from('//pilJ5gU4baX2atR1gx+o2zhdqXVqMC8eDwHFiLbII=', 'base64');
const clientId = 'cu6xkebsgerd6ikki3cq08ov1koygc';

////////////////////////

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






app.get('/', function(req, res) {
    res.redirect(feedbackFormsURL);
})

app.get('/obs-overlay/:channel', function(req , res){
  var channel = req.params.channel;
  res.sendFile(__dirname + '/obs-overlay.html', {channel: channel});
})

app.get('/amounts', function(req, res) {
    res.send(channelAmounts);
  })

app.get('/cooldowns', function(req, res) {
    res.send(userCooldowns);
  })

app.get('/viewers', function(req, res) {
    res.send(vievewsCounts);
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
  changeAmount(req);
  res.send('POST');
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
})






setInterval(() => { userCooldowns = {}; }, userCooldownClearIntervalMs);

// function changeMaxAmount(req){
//   const payload = verifyAndDecode(req.headers.authorization);
//   //console.log(payload);
//   const { channel_id: channelId, user_id: userId } = payload;
//
//   if(userId == channelId){
//     // console.log('opaque_user_id == channel_id');
//     console.log("req.data = " + req.headers);
//     maxAmount = parseInt(req.data);
//     console.log("maxAmount = " + parseInt(maxAmount));
//   }
// }

function changeAmount(req) {

    // Verify all requests.
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, opaque_user_id: opaqueUserId } = payload;
  
    let currentAmount = channelAmounts[channelId] || parseInt(initialAmount);
  
    // Bot abuse prevention:  don't allow a user to spam the button.
    if (userIsInCooldown(opaqueUserId)) {
      // throw Boom.tooManyRequests(STRINGS.cooldown);
      // verboseLog('USER_COOLDOWN');
      return;
    }
    
    let lastAmount = currentAmount;

    let viewersCount = vievewsCounts[channelId];
    let changeValue = viewersCount > 1 ? (1 / viewersCount).toFixed(5) : 0.5; 

    currentAmount = Math.min(Math.max(parseFloat(currentAmount) + parseFloat(changeValue), 0), parseInt(maxAmount));
  
    // Amount (channelID %s) changed from %s to %s, with %s
    // verboseLog(STRINGS.amountChanged, channelId, lastAmount, currentAmount, changeValue);

    // Save the new color for the channel.
    channelAmounts[channelId] = currentAmount;
  
    // Broadcast the color change to all other extension instances on this channel.
    attemptAmountBroadcast(channelId);
  
    if (!timerIsActive){
      timerIsActive = true;
      initAmountTimer(channelId);
    }
    
    return currentAmount;
  }

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

  function sendAmountBroadcast(channelId) {
    
    // curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE1MDMzNDM5NDcsInVzZXJfaWQiOiIyNzQxOTAxMSIsImNoYW5uZWxfaWQiOiIyNzQxOTAxMSIsInJvbGUiOiJleHRlcm5hbCIsInB1YnN1Yl9wZXJtcyI6eyJzZW5kIjpbIioiXX19.TiDAzrq58XczdymAozwsdVilRkjr9KN8C0pCv7px-FM" \
    // -H "Client-Id: pxifeyz7vxk9v6yb202nq4cwsnsp1t" \
    // -H "Content-Type: application/json" \
    // -d '{"content_type":"application/json", "message":"{\"foo\":\"bar\"}", "targets":["broadcast"]}' \
    // -X POST https://api.twitch.tv/extensions/message/${channelId}

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
    request(
      `https://api.twitch.tv/extensions/message/${channelId}`,
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
      
    // curl -H 'Accept: application/vnd.twitchtv.v5+json' \ -H 'Client-ID: cu6xkebsgerd6ikki3cq08ov1koygc' \ -X GET 'https://api.twitch.tv/kraken/streams/174360102'

    //
    // Обновить количество зрителей на канале
    // GET https://api.twitch.tv/kraken/streams/<channel ID>
    // https://dev.twitch.tv/docs/v5/reference/streams

    // curl -H 'Accept: application/vnd.twitchtv.v5+json' \
    // -H 'Client-ID: uo6dggojyb8d6soh92zknwmi5ej1q2' \
    // -X GET 'https://api.twitch.tv/kraken/streams/44322889'

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
          var stream = JSON.parse(res.body)["stream"];
          if(stream !== null){
            vievewsCounts[channelId] = JSON.parse(res.body)["stream"].viewers;
          }
          else{
            // verboseLog("stream == null");
          }
          
          // verboseLog(STRINGS.responseChanelViewers, vievewsCounts[channelId], channelId);
        }
      });
  }

//////////////////////////////////////////////////

function getAmount(req) {
  // Verify all requests.
  const payload = verifyAndDecode(req.headers.authorization);

  // Get the color for the channel from the payload and return it.
  const { channel_id: channelId, opaque_user_id: opaqueUserId } = payload;
  const currentAmount = channelAmounts[channelId] || parseInt(initialAmount);
  // verboseLog(STRINGS.sendAmount, currentAmount, opaqueUserId);
  return currentAmount;
}

//////////////////////////////////////////////////

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
  
  //////////////////////////////////////////////////
  
  async function initAmountTimer(channelId) {
    await sleep(parseInt(amountLiveTime));
    decreaseAmount(channelId);
  }
  
  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }   
  
  function decreaseAmount(channelId){
    channelAmounts[channelId] = Math.min(Math.max(parseFloat(channelAmounts[channelId]) - 1.0, 0), parseInt(maxAmount));
    // console.log(`Amount (decreased) = ` + channelAmounts[channelId]);
  
    if(channelAmounts[channelId] == 0){
      timerIsActive = false;
    }
    else{
      initAmountTimer(channelId);
    }
    attemptAmountBroadcast(channelId);
  }

  //////////////////////////////////////////////////
  
  function usingValue(name) {
    return `Using environment variable for ${name}`;
  }
  
  //////////////////////////////////////////////////
  
  function missingValue(name, variable) {
    const option = name.charAt(0);
    return `Extension ${name} required.\nUse argument "-${option} <${name}>" or environment variable "${variable}".`;
  }

//////////////////////////////////////////////////

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