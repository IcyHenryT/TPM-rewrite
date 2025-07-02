const fs = require('fs');
const { patch } = require('golden-fleece');
const JSON5 = require("json5");

const defaultConfig = `{

    //Put your minecraft IGN here. To use multiple, follow this format: ["account1", "account2"],
    "igns": [""],

    //Used in backend. Get it from the /get_discord_id command in TPM server
    "discordID": "",

    //Refer to https://discord.com/channels/1261825756615540836/1265035635845234792 for help
    "webhook": "",

    //{0} is item. {1} is profit. {2} is price. {3} is target. {4} is buyspeed. {5} is BED or NUGGET. {6} is finder. {7} is the auctionID. {8} is the shortened price. {9} is the bot's username. {10} is the flip volume. {11} is the flip profit percentage
    "webhookFormat": "You bought [\`\`{0}\`\`](https://sky.coflnet.com/auction/{7}) for \`\`{2}\`\` (\`\`{1}\`\` profit) in \`\`{4}ms\`\`",
    
    //Send every flip seen to this webhook. Good for testing configs
    "sendAllFlips": "",

    //Flip on a friend's island
    "visitFriend": "",

    //Required to use relist!! Will flip in if you don't have a cookie
    "useCookie": true,

    //If cookie is under this time then buy a new one. Leave blank to never auto buy a cookie.
    //Use y, d, or h to set time
    "autoCookie": "1h",

    //Don't claim coop's auctions
    "angryCoopPrevention": false,

    //Automatically list auctions
    "relist": true,

    //Pings you when TPM updates (webhook required)
    "pingOnUpdate": false,

    //Delay between actions. For example, opening flips
    "delay": 250,

    //Delay for beds. Refer to https://discord.com/channels/1261825756615540836/1275546557508223048 for help
    "waittime": 15,

    //Set up different list price ranges and their corresponding percent off of target price. (The lower value of the range is inclusive, the higher value is exclusive)
    "percentOfTarget": ["0", "10b", 97],

    //Amount of time (hours) to list an auction.
    //Works the same as percentOfTarget but for time auctions are listed!
    "listHours": ["0", "10b", 48],

    //Delay between clicks for bed spam (ideally use 100-125)
    "clickDelay": 125,

    //Decides the way to  
    "bedSpam": false,

    //Won't show spam messages
    "blockUselessMessages": true,

    //Digit to round relist price to. For example 6 would round 1,234,567 to 1,200,000
    "roundTo": 6,

    //Skip the confirm screen on NUGGET flips (50ms faster but higher ban rate)
    //This is an OR statement btw
    "skip": {

        //Skip on every flip
        "always": false,

        //Skip on flips with a profit over x
        "minProfit": "25m",

        //Skip on flips over this %
        "profitPercentage": "500",

        //Skip on flips over this price
        "minPrice": "500m",

        //Skip on user finder flips
        "userFinder": true,

        //Skip on cosmetic flips
        "skins": true

    },

    //Items that you don't want automatically listed
    "doNotRelist": {

        //Items over x profit
        "profitOver": "50m",

        //Cosmetic items
        "skinned": true,

        //Don't list certain item tags
        "tags": ["HYPERION"],

        //Finders to not list. Options: USER, CraftCost, TFM, AI, SNIPER, STONKS, FLIPPER
        "finders": ["USER", "CraftCost"],

        //If an item is in a new stack then this controls if it's listed
        //For example, if you have 1 spooky fragment in your inventory and then buy 4 you will now obviously have 5 in a stack.
        //If this is set to true, it will list the 5 fragments for the price of 1 fragment multiplied by 5.
        "stacks": false,

        //Pings you when an item doesn't list
        "pingOnFailedListing": false,

        //Doesn't list a drill if it has any parts (It will then automatically remove and sell the parts)
        "drillWithParts": true,

        //Will automatically get a price from the cofl API and relist auctions that are expired with the new price. False = don't list. True = list
        "expiredAuctions": false,

        //Pricing to use for expired auctions. Set to 1 if you want to use cofl lore pricing stuff, set to 2:x if you want to cut away x percentage from the price
        "relistMode": "2:97"

    },

    //Choose how long to flip for and rest for in hours.
    "autoRotate": {

        //Put your IGN (CAPS MATTER).
        //If you run multiple accounts, put a , after the value (second quote), press enter, and follow the same format as the first.
        //Add an r after the number that you want it to rest for and an F for how long you want it to flip for.
        "ign": "12r:12f"

    },
    
    //Cofl account password. DO NOT SHARE
    "session": ""

}`;

const parsedDefaultConfig = JSON5.parse(defaultConfig);

if (!fs.existsSync('./config.json5')) {
    fs.writeFileSync('./config.json5', defaultConfig);
}

let config = { ...parsedDefaultConfig, ...JSON5.parse(fs.readFileSync('./config.json5', 'utf8')) };

config.doNotRelist = { ...parsedDefaultConfig.doNotRelist, ...config.doNotRelist }
config.skip = { ...parsedDefaultConfig.skip, ...config.skip };
config.autoRotate = { ...parsedDefaultConfig.autoRotate, ...config.autoRotate };

function updateConfig(data) {//golden-fleece my savior idk how to spell that
    const newConfig = patch(defaultConfig, data);
    fs.writeFileSync('./config.json5', newConfig, 'utf-8');
}

updateConfig(config);

module.exports = { config, updateConfig };