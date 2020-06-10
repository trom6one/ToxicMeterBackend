
let channelId = "";
const updateAmountTime = 5000;

$(function() {
    let searchParams = new URLSearchParams(window.location.search)
    let channelParam = searchParams.get('channel')
    channelId = channelParam;

    initAmountTimer(channelId);
});

async function initAmountTimer() {
    localUpdateLine();
    await sleep(parseInt(updateAmountTime));
    initAmountTimer();
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

function localUpdateLine() {
    $.get('https://toxicmeterdev.herokuapp.com/amounts', function (data) {
        var stringified = JSON.stringify(data);
        var obj = JSON.parse(stringified);
        var amount = obj[channelId] || 0;
        // $(".progress .water").css("top", 100 - amount + "%");
        $(".progress .water").animate({ top: 100 - amount + "%"}, 'easeInOutCubic', function(){ 
            /* animation comlete */ 
        });
    });
}