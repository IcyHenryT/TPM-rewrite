const prompt = require('prompt-sync')();
const { randomUUID } = require('crypto');
const { logmc, updateIgns, getIgns, error, debug, setWebServer } = require('./logger.js');
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const AhBot = require('./TPM-bot/AhBot.js');
const TpmSocket = require('./TpmSocket.js');
const WebServer = require('./WebServer.js');
const { sendDiscord, sendLatestLog, sleep } = require('./TPM-bot/Utils.js');
const { getTokenInfo } = require('./TPM-bot/TokenHandler.js');
const { config, updateConfig } = require('./config.js');

let { igns, autoRotate, useItemImage, webPort } = config;
let bots = {};
let askPrefixes = {};
let tws;
let webServer;

function testIgn() {
    if (!igns[0] || igns[0].trim() === "") {
        const newIgn = (prompt(`What's your minecraft name (caps matter): `) || "").trim();
        if (newIgn !== "") {
            igns[0] = newIgn;
            config.igns = igns;
            updateConfig(config);
        } else {
            testIgn();
        }
    }
}

testIgn();

(async () => {

    if (!config.session) {
        config.session = randomUUID();
        updateConfig(config);
    }

    let message = '';

    tws = new TpmSocket(bots, destroyBot, startBot);

    webServer = new WebServer(webPort || 3000, bots);
    webServer.start();
    setWebServer(webServer);

    for (const ign of igns) {
        const started = await startBot(ign, tws);
        if (started) message += `Logged in as \`\`${started}\`\`\n`;
    }

    tws.makeWebsocket();

    let thumbnail = 'https://images-ext-1.discordapp.net/external/7YiWo1jf2r78hL_2HpVRGNDcx_Nov0aDjtrG7AZ4Hxc/%3Fsize%3D4096/https/cdn.discordapp.com/icons/1261825756615540836/983ecb82e285eee55ef25dd2bfbe9d4d.png?format=webp&quality=lossless&width=889&height=889';
    let avatar = null;
    let webhookName = null;

    const botNames = Object.keys(bots);

    if (botNames.length == 1) {
        const bot = bots[botNames[0]].getBot()
        thumbnail = bot.head;
        if (useItemImage) {
            avatar = thumbnail;
            webhookName = bot.username;
        }
    }

    sendDiscord({
        title: 'Started TPM',
        color: 16629250,
        fields: [
            {
                name: '',
                value: message,
            }
        ],
        thumbnail: {
            url: thumbnail,
        },
        footer: {
            text: `The "Perfect" Macro Rewrite`,
            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
        }
    }, avatar, false, webhookName)

})();

async function destroyBot(ign, secondary = true) {
    const ahBot = bots[ign];
    if (!ahBot) return;
    const bot = ahBot.getBot();
    ahBot.stop();
    delete askPrefixes[bots[ign].initAskPrefix(igns)?.toLowerCase()]
    delete bots[ign];
    if (secondary) {
        sendDiscord({
            title: 'Killed bot',
            color: 13320532,
            fields: [
                {
                    name: '',
                    value: `Rip ${ign}`,
                }
            ],
            thumbnail: {
                url: bot.head,
            },
            footer: {
                text: `The "Perfect" Macro Rewrite`,
                icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
            }
        }, useItemImage ? bot.head : null, false, bot.username)
    }

}

async function startBot(ign, tws, secondary = false, fromRotate = false) {
    return new Promise(async (resolve) => {
        if (!fromRotate && autoRotate[ign] && autoRotate[ign].split(':')[0].includes('r')) {
            rotate(ign, true);
            resolve(false);
            debug(`Not starting ${ign} cause of autorotate`);
        } else {
            let safeIgn = ign;
            if(ign.length > 16) {
                safeIgn = (await getTokenInfo(ign))?.username;
            }
            const tempBot = new AhBot(ign, tws, destroyBot, safeIgn);
            await tempBot.createBot();
            bots[safeIgn] = tempBot;
            askPrefixes[bots[safeIgn].initAskPrefix(igns)?.toLowerCase()] = safeIgn;
            updateIgns(safeIgn);
            if (autoRotate[safeIgn] && !fromRotate && !secondary) {
                rotate(ign);
            }
            if (secondary) {
                sendDiscord({
                    title: 'Started flipping',
                    color: 16629250,
                    fields: [
                        {
                            name: '',
                            value: `Logged in as \`\`${ign}\`\`\n`,
                        }
                    ],
                    thumbnail: {
                        url: tempBot.getBot().head,
                    },
                    footer: {
                        text: `The "Perfect" Macro Rewrite`,
                        icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                    }
                }, useItemImage ? tempBot.getBot().head : null, false, safeIgn)
            }
            resolve(safeIgn);
        }
    })
}

async function rotate(ign, first = false) {
    const timings = autoRotate[ign].split(':');
    const firstTime = parseFloat(timings[0].replace(/r|f/g, '')) * 3_600_000;
    const secondTime = parseFloat(timings[1].replace(/r|f/g, '')) * 3_600_000;
    const bot = bots[ign]?.getBot();
    let firstFunc = timings[0].toLowerCase().includes('r') ?
        () => rotateStart(ign, tws, bot, secondTime) :
        () => rotateStop(ign, bot, secondTime);
    let secondFunc = timings[0].toLowerCase().includes('r') ?
        () => rotateStop(ign, bot, firstTime) :
        () => rotateStart(ign, tws, bot, firstTime);
    if (first) {
        setTimeout(() => {
            sendDiscord({
                title: 'Waiting',
                color: 13320532,
                fields: [
                    {
                        name: '',
                        value: `\`${ign}\` rests first so it wasn't started. It will log on in <t:${Math.round((Date.now() + secondTime) / 1000)}:R>`,
                    }
                ],
                thumbnail: {
                    url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                },
                footer: {
                    text: `The "Perfect" Macro Rewrite`,
                    icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                }
            });
        }, 500)
    }

    await sleep(secondTime);
    firstFunc();
    await sleep(firstTime);
    secondFunc();
    rotate(ign);
}

async function rotateStart(ign, tws, bot, stop) {
    startBot(ign, tws, false, true);
    sendDiscord({
        title: 'Started flipping',
        color: 16629250,
        fields: [
            {
                name: '',
                value: `Logged in as \`\`${ign}\`\`\n Will log off in <t:${Math.round((Date.now() + stop) / 1000)}:R>`,
            }
        ],
        thumbnail: {
            url: bot ? bot.head : 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
        },
        footer: {
            text: `The "Perfect" Macro Rewrite`,
            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
        }
    }, null, false, ign)
}

async function rotateStop(ign, bot, start) {
    destroyBot(ign, false);
    sendDiscord({
        title: 'Killed bot',
        color: 13320532,
        fields: [
            {
                name: '',
                value: `Rip \`\`${ign}\`\`\n Will log on in <t:${Math.round((Date.now() + start) / 1000)}:R>`,
            }
        ],
        thumbnail: {
            url: bot ? bot.head : 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
        },
        footer: {
            text: `The "Perfect" Macro Rewrite`,
            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
        }
    }, bot ? bot.head : 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888', false, ign)
}

async function crashReport(e) {
    error('There was an error:', e);
    error(`Stack trace`, e.stack);
    await sendLatestLog({
        title: 'Crash :(',
        color: 15755110,
        fields: [
            {
                name: '',
                value: `Error: ${e}\nPlease report to a dev!`,
            }
        ],
        thumbnail: {
            url: `https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888`,
        },
        footer: {
            text: `TPM Rewrite`,
            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
        }
    });

    setTimeout(() => {
        process.exit(1);
    }, 500)
}

function askUser() {
    rl.question(`> `, async (input) => {
        const args = input.trim().split(/\s+/);
        let bot;
        if (getIgns().length === 0) {
            logmc(`No accounts currently running! Start one from discord`);
            askUser();
            return;
        }
        if (getIgns().length !== 1) {
            let prefix = args[0].toLowerCase().trim();
            let askPrefix = askPrefixes[prefix];
            args.shift();
            if (askPrefix) {
                bot = bots[askPrefix];
            } else {
                logmc(`Hey that's not a valid prefix! Use one of these: ${Object.keys(askPrefixes).join(', ')}`);
                askUser();
                return;
            }
        } else {
            bot = bots[getIgns()[0]];
        }
        let message = args.slice(1).join(' ');
        if (bot) bot.handleTerminal(args[0], message);
        askUser();
    });
}

askUser();

process.on('unhandledRejection', crashReport);
process.on('uncaughtException', crashReport);