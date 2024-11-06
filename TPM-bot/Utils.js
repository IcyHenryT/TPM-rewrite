const { config } = require('../config.js');
const { debug, error} = require('../logger.js');
const { webhook } = config;
const axios = require('axios');

const DISCORD_PING = !config.discordID ? "" : `<@${config.discordID}>`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function formatNumber(num) {
    let negative = num < 0;
    num = Math.abs(num);
    let thingy;
    if (num >= 1000000000) {
        thingy = (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
        thingy = (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        thingy = (num / 1000).toFixed(1) + 'K';
    } else {
        thingy = num.toString();
    }
    return `${negative ? '-' : ''}${thingy}`;
}


function stripItemName(name) {
    const noCodes = noColorCodes(name);
    const stripped = noCodes.replace(/\b(?:[1-9]|[1-5][0-9]|6[0-4])x\b\s*|[!.]|-us/g, "")
    debug(`Stripped ${name} => ${stripped}`);
    return stripped;
}

function IHATETAXES(price) {
    if (price < 10000000) {
        return price * .98
    } else if (price < 100000000) {
        return price * .97
    } else {
        return price * .965
    }
}

function IHATECLAIMINGTAXES(price) {
    if (price < 1_000_000) return price;
    if ((price * .99) < 1_000_000) return 1_000_000;
    return price * .99;
}

function normalizeDate(dateString) {
    try {
        const isoFormatWithoutMillisUTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
        const isoFormatWithMillisUTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,3}Z$/;
        const isoFormatWithoutMillisOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})$/;
        const isoFormatWithMillisOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,3}(?:[+-]\d{2}:\d{2})$/;

        if (isoFormatWithoutMillisUTC.test(dateString)) {
            // If the date string does not have milliseconds and ends with 'Z', add them
            return dateString.replace('Z', '.000Z');
        } else if (isoFormatWithMillisUTC.test(dateString)) {
            // Normalize milliseconds to three digits for 'Z'
            return dateString.replace(/(\.\d{1,2})Z$/, (match) => match.slice(0, -1).padEnd(4, '0') + 'Z');
        } else if (isoFormatWithoutMillisOffset.test(dateString)) {
            // If the date string does not have milliseconds and ends with offset, add them
            return dateString.replace(/([+-]\d{2}:\d{2})$/, '.000$1');
        } else if (isoFormatWithMillisOffset.test(dateString)) {
            // Normalize milliseconds to three digits for offset
            return dateString.replace(/(\.\d{1,2})([+-]\d{2}:\d{2})$/, (match, p1, p2) => p1.padEnd(4, '0') + p2);
        } else {
            throw new Error('Invalid date format');
        }
    } catch (error) {
        debug(`Date normalization error: ${error.message} for ${dateString}`);
        return dateString; // Fallback to the original string
    }
}

function getWindowName(window) {
    if (!window) return null;
    try {
        return JSON.parse(window.title).extra[0].text;
    } catch (e) {
        return null;
    }
}

function isSkin(item) {
    return item?.includes('✦') || item?.toLowerCase()?.includes('skin') || item?.includes('✿');
}

function noColorCodes(text) {
    return text?.replace(/§./g, '')?.replace('§', '')//cofl sometimes sends messages that are cut off so I need the second one aswell
}

async function sendDiscord(embed, ping = false, attempt = 0) {
    if (webhook) {
        try {
            if (Array.isArray(webhook)) {
                webhook.forEach(async (hook) => {
                    await axios.post(hook, {
                        username: "TPM",
                        avatar_url: "https://media.discordapp.net/attachments/1235761441986969681/1263290313246773311/latest.png?ex=6699b249&is=669860c9&hm=87264b7ddf4acece9663ce4940a05735aecd8697adf1335de8e4f2dda3dbbf07&=&format=webp&quality=lossless",
                        content: ping ? DISCORD_PING : "",
                        embeds: [embed]
                    });
                })
            } else {
                await axios.post(webhook, {
                    username: "TPM",
                    avatar_url: "https://media.discordapp.net/attachments/1235761441986969681/1263290313246773311/latest.png?ex=6699b249&is=669860c9&hm=87264b7ddf4acece9663ce4940a05735aecd8697adf1335de8e4f2dda3dbbf07&=&format=webp&quality=lossless",
                    content: ping ? DISCORD_PING : "",
                    embeds: [embed]
                });
            }
        } catch (e) {
            error(`Webhook error`, e)
            if (attempt < 3) {
                await sleep(5000)
                await sendDiscord(embed, attempt + 1);
            }
        }
    }
}

function nicerFinders(finder) {
    switch (finder) {
        case "USER":
            return "User";
        case "SNIPER_MEDIAN":
            return 'Median Sniper';
        case "TFM":
            return "TFM";
        case "AI":
            return 'AI';
        case "CraftCost":
            return "Craft Cost";
        case "SNIPER":
            return 'Sniper';
        case "STONKS":
            return 'Stonks';
        case "FLIPPER":
            return 'Flipper'
    }
    return finder;
}

async function betterOnce(listener, event, callback = false, timeframe = 5000) {
    return new Promise((resolve, reject) => {

        const listen = (msg) => {
            if (callback) {
                if (!callback(msg)) return;
            }
            listener.off(event, listen);
            resolve(msg);
        };

        setTimeout(() => {
            listener.off(event, listen);
            resolve(`Didn't find in time!`);
        }, timeframe);

        listener.on(event, listen);
    });
}

function getSlotLore(slot) {
    return slot?.nbt?.value?.display?.value?.Lore?.value?.value;
}

function onlyNumbers(text) {
    return parseInt(text.replace(/[^\d,]/g, '').replace(/,/g, ''), 10);
}

function addCommasToNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function normalNumber(num) {
    if (typeof num === 'number') return num;
    if (!num) return NaN;
    num = num.toLowerCase();
    if (num.includes('t')) {
        return parseInt(num.replace('t', '')) * 1_000_000_000_000;
    } else if (num.includes('b')) {
        return parseInt(num.replace('b', '')) * 1_000_000_000;
    } else if (num.includes('m')) {
        return parseInt(num.replace('m', '')) * 1_000_000;
    } else if (num.includes('k')) {
        return parseInt(num.replace('k', '')) * 1_000;
    }
    return parseInt(num);
}

function isSkinned(item) {
    return item.includes('✦') || item.toLowerCase().includes('skin') || item.includes('✿');
}

function getLatestLog() {
    const logFilePath = path.join(process.pkg ? path.dirname(process.execPath) : __dirname, 'logs', 'latest.log');
    const logFile = fs.createReadStream(logFilePath);
    const form = new FormData();
    form.append('file', logFile, 'latest.log');
    return form;
}

async function checkHypixelPing(bot) {
    return new Promise((resolve, reject) => {
        let sent = false;
        bot.chat('/social pingwars');
        const pingwarsRegex = /Your Ping - ([\d,]+)ms/;
        const cooldownRegex = /You must wait to use social commands again!/;
        const badAtGame = /You do not have a high enough Social Skill to use this!/;
        const listen = (message, type) => {
            let text = noColorCodes(message.getText(null));
            if (type === 'chat') {

                const match = text.match(pingwarsRegex);
                if (match) {
                    bot.off('message', listen);
                    sent = true;
                    //console.log(`found ${match[1]}ms hypixel ping`);
                    resolve(`${match[1]}ms`);
                }
                if (text.match(cooldownRegex)) {
                    bot.off('message', listen);
                    sent = true;
                    //console.log(`found ${match[1]}ms hypixel ping`);
                    resolve(`Pingwars is on cooldown :(`);
                }
                if (text.match(badAtGame)) {
                    bot.off('message', listen);
                    sent = true;
                    //console.log(`found ${match[1]}ms hypixel ping`);
                    resolve(`You need social level 4 for this`);
                }

            }
        };
        setTimeout(() => {
            bot.off('message', listen);
            if (!sent) resolve(`Didn't get hypixel ping. Make sure you're social level 4`);
        }, 10000);
        bot.on('message', listen);
    });
}


async function checkCoflPing(ws, handleCommand) {
    return new Promise((resolve, reject) => {
        handleCommand('/cofl ping');
        let sent = false;
        const listen = (message) => {
            message = noColorCodes(message);
            debug(message);
            const pingRegex = /The time to receive flips is estimated to be ([\d.]+)ms/;
            const match = message.match(pingRegex);
            if (match) {
                ws.off('messageText', listen);
                sent = true;
                //console.log(`found ${match[1]}ms cofl ping`);
                resolve(`${match[1]}ms`);
            }
        };
        ws.on('messageText', listen);
        setTimeout(() => {
            ws.off('messageText', listen);
            if (!sent) resolve(`Didn't get cofl ping.`);
        }, 10000);
    });
}


async function checkCoflDelay(ws, handleCommand) {
    return new Promise((resolve, reject) => {
        handleCommand('/cofl delay');
        let sent = false;
        const listen = (message) => {
            message = noColorCodes(message);
            //error(message)
            const pingRegex = /You are currently delayed by ([\d.]+)s on api/;
            const match = message.match(pingRegex);
            if (match) {
                ws.off('messageText', listen);
                sent = true;
                //console.log(`found ${match[1]} delay`);
                resolve(`${match[1]}s`);
            }
            if (message.includes('You are currently not delayed at all')) {
                ws.off('messageText', listen);
                sent = true;
                //console.log(`found ${match[1]} delay`);
                resolve(`0s`);
            }
        };
        ws.on('messageText', listen);
        setTimeout(() => {
            ws.off('messageText', listen);
            if (!sent) resolve(`Didn't get cofl delay.`);
        }, 10000);
    });
}

async function TheBig3(bot, handleCommand, ws) {
    const [delay, coflPing, hypixelPing] = await Promise.all([
        checkCoflDelay(ws, handleCommand),
        checkCoflPing(ws, handleCommand),
        checkHypixelPing(bot)
    ]);
    return { delay: delay, coflPing: coflPing, hypixelPing: hypixelPing };
}

const colorCodes = [
    "213328",
    "213071",
    "148820",
    "19033",
    "20318",
    "21603",
    "23144",
    "24429",
    "25714",
    "27254",
    "30079",
    "31364",
    "32904",
    "34444",
    "35728",
    "37268",
    "37525"
];

function randomWardenDye() {
    return colorCodes[Math.floor(Math.random() * colorCodes.length)];
}

const luckyDyeColorCodes = [
    "8912695",
    "8517692",
    "8254527",
    "7991106",
    "7596356",
    "7333191",
    "6938441",
    "6608971",
    "6148685",
    "5753934",
    "5424465",
    "4898386",
    "4503378",
    "4043091",
    "3582803",
    "3188051",
    "2727764",
    "2333012",
    "1938771",
    "1544531",
    "1018962",
    "624722",
    "33616",
    "32079",
    "30541",
    "29515",
    "28489",
    "27719",
    "26948"
]

function randomLucky() {
    return luckyDyeColorCodes[Math.floor(Math.random() * luckyDyeColorCodes.length)];
}

async function getStats(bot, handleCommand, ws, soldNum, profitList, start) {
    const { delay, coflPing, hypixelPing } = await TheBig3(bot, handleCommand, ws);
    const boughtNum = profitList.length;
    const timeSpan = Date.now() - start;
    let overallProfit = 0;
    let uff = 0;
    profitList.forEach(profit => { if (!isNaN(profit) && profit > 0) overallProfit += profit; else uff++ });
    const profitPerHour = overallProfit / (timeSpan / 3600000);
    sendDiscord({
        title: `Stats for ${bot.username}`,
        color: randomLucky(),
        fields: [
            {
                name: '',
                value: `**Profit/Hour:** ${formatNumber(profitPerHour)}\n**Total Profit:** ${formatNumber(overallProfit)}\n**User Finder Flips:** ${uff}\n**Cofl Delay:** ${delay}\n**Cofl Ping:** ${coflPing}\n**Hypixel Ping:** ${hypixelPing}\n**Purse:** ${formatNumber(bot.getPurse() || 0)}\n\n**Started** <t:${Math.floor(start / 1000)}:R>`,
            }
        ],
        thumbnail: {
            url: `https://mc-heads.net/head/${bot.uuid}.png`,
        },
        footer: {
            text: `TPM Rewrite - Bought ${boughtNum} - Sold ${soldNum}`,
            icon_url: 'https://media.discordapp.net/attachments/1223361756383154347/1263302280623427604/capybara-square-1.png?ex=6699bd6e&is=66986bee&hm=d18d0749db4fc3199c20ff973c25ac7fd3ecf5263b972cc0bafea38788cef9f3&=&format=webp&quality=lossless&width=437&height=437',
        }
    })
}

async function getPingStats(bot, handleCommand, ws, soldNum, profitList) {
    const { delay, coflPing, hypixelPing } = await TheBig3(bot, handleCommand, ws);
    sendDiscord({
        title: `Stats for ${bot.username}`,
        color: randomWardenDye(),
        fields: [
            {
                name: '',
                value: `**Cofl Delay:** ${delay}\n**Cofl Ping:** ${coflPing}\n**Hypixel Ping:** ${hypixelPing}`,
            }
        ],
        thumbnail: {
            url: `https://mc-heads.net/head/${bot.uuid}.png`,
        },
        footer: {
            text: `TPM Rewrite - Bought ${profitList.length} - Sold ${soldNum}`,
            icon_url: 'https://media.discordapp.net/attachments/1223361756383154347/1263302280623427604/capybara-square-1.png?ex=6699bd6e&is=66986bee&hm=d18d0749db4fc3199c20ff973c25ac7fd3ecf5263b972cc0bafea38788cef9f3&=&format=webp&quality=lossless&width=437&height=437',
        }
    })
}

module.exports = { DISCORD_PING, getPingStats, IHATECLAIMINGTAXES, getStats, TheBig3, getLatestLog, isSkinned, normalNumber, addCommasToNumber, onlyNumbers, getSlotLore, formatNumber, sleep, betterOnce, stripItemName, IHATETAXES, normalizeDate, getWindowName, isSkin, noColorCodes, sendDiscord, nicerFinders, betterOnce };