const { logmc, debug, error, startTracker } = require('./logger.js');
const { sleep, normalNumber, sendDiscord, sendLatestLog } = require('./TPM-bot/Utils.js');
const { config } = require('./config.js');
let { igns, webhook, discordID, allowedIDs } = config;

if (allowedIDs) {
    if (!allowedIDs.includes(discordID)) allowedIDs.push(discordID);
} else {
    allowedIDs = [discordID];
}

const WebSocket = require('ws');

class TpmSocket {

    constructor(bots, destroyBot, startBot) {
        this.ws = null;
        this.bots = bots;
        this.destroyBot = destroyBot;
        this.startBot = startBot;
        this.sentFailureMessage = false;
        this.storedMessages = [];//if socket is down, send all of these at once
        this.settings = [];
        this.makeWebsocket();
    }

    makeWebsocket() {
        try {
            debug(`Making new TPM socket`);
            this.ws = new WebSocket('ws://107.152.38.30:1241');//random VPS

            this.ws.on('open', async () => {
                this.sentFailureMessage = false;
                logmc('§6[§bTPM§6] §3Connected to the TPM websocket!');
                await this.botsReady();
                if (this.settings.length === 0) await this.getSettings();
                if (this.storedMessages.length > 0) {
                    this.send(JSON.stringify({
                        type: "batch",
                        data: JSON.stringify(this.storedMessages)
                    }))
                }
                this.send(JSON.stringify({
                    type: "loggedIn",
                    data: JSON.stringify({
                        discordID: discordID,
                        webhook: webhook,
                        igns: igns,
                        settings: this.settings,
                        allowedIDs: allowedIDs
                    })
                }), false)
            })

            this.ws.on('error', async (e) => {
                debug(`TPM Socket error 1`);
                if (e.code === 'ECONNREFUSED') {
                    if (!this.sentFailureMessage) {
                        logmc('§6[§bTPM§6] §cTPM websocket down. Please report to a dev!');
                        this.sentFailureMessage = true;
                    }
                } else {
                    error('WS error1:', e);
                }
            });

            this.ws.on('close', async (e) => {
                debug(`TPM Socket closed`);
                if (!this.sentFailureMessage) {
                    logmc('§6[§bTPM§6] §cTPM websocket down. Please report to a dev!');
                    this.sentFailureMessage = true;
                }
                await sleep(5000);
                this.makeWebsocket();
            });

            this.ws.on('message', this.handleMessage.bind(this));

        } catch (e) {
            error(`WS error2:`, e);
        }
    }

    send(message, batch = true) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            debug(`Sending ${message}`);
            this.ws.send(message);
        } else if (batch) {
            this.storedMessages.push(message);
            debug(`Not currently connected`)
        }
    }

    async handleMessage(message) {
        const msg = JSON.parse(message);
        const data = JSON.parse(msg.data);//This isn't safe and if it's not JSON format then it'll crash but that's intentional!
        debug(message.toString());
        switch (msg.type) {
            case "list": {
                const bot = this.bots[data.username];
                data.price = normalNumber(data.price);
                debug(JSON.stringify(data));
                if (!bot) {
                    debug(`Didn't find a bot for ${data.username}`);
                    return;
                }
                bot.state.queueAdd(data, 'listingNoName', 2);
                break;
            }
            case "log":
                sendLatestLog({
                    title: 'Latest log!',
                    color: 7448274,
                    fields: [
                        {
                            name: '',
                            value: `Here you go`,
                        }
                    ],
                    thumbnail: {
                        url: `https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888`,
                    },
                    footer: {
                        text: `TPM Rewrite`,
                        icon_url: 'https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888',
                    }
                });
                break;
            case "allStats":
                for (const ign in this.bots) {
                    const bot = this.bots[ign];
                    bot.handleTerminal('/stats');
                }
                break;
            case "stats":
                for (const ign in this.bots) {
                    const bot = this.bots[ign];
                    bot.handleTerminal('/ping');
                }
                break;
            case "delist": {
                const bot = this.bots[data.username];
                if (!bot) {
                    debug(`Didn't find a bot for ${data.username}`);
                    return;
                }
                bot.state.queueAdd(data, 'delisting', 3);
                break;
            }
            case "startBot": {
                debug(`Starting ${data.username}`)
                this.startBot(data.username, this, true);
                break;
            }
            case "killBot": {
                debug(`Killing ${data.username}`)
                this.destroyBot(data.username);
                break;
            }
            case "buyFlip": {
                let username = data.username;
                if (!username) {
                    username = Object.keys(this.bots)[0];
                }
                const bot = this.bots[username];
                if (!bot) {
                    debug(`Didn't find a bot for ${username}`);
                    return;
                }
                bot.state.queueAdd({ finder: "EXTERNAL", profit: 0, itemName: data.auctionId, auctionID: data.auctionId }, 'buying', 4);
                break;
            }
            case "sendTerminal": {
                let username = data.username;
                if (!username) {
                    username = Object.keys(this.bots)[0];
                }
                const bot = this.bots[username];
                if (!bot) {
                    debug(`Didn't find a bot for ${username}`);
                    return;
                }
                const split = data.command.split(' ');
                const command = split.shift();
                bot.handleTerminal(command, split.join(' '));
                const messages = await startTracker();
                sendDiscord({
                    title: 'Command!',
                    color: 13313596,
                    fields: [
                        {
                            name: '',
                            value: `\`\`Messages for the past 10 seconds:\`\`\n${messages.join('\n')}`,
                        }
                    ],
                    thumbnail: {
                        url: `https://mc-heads.net/head/${bot.getBot().uuid}.png`,
                    },
                    footer: {
                        text: `TPM Rewrite`,
                        icon_url: 'https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888',
                    }
                })
                break;
            }
            case "timeout": {
                const time = data.timeout;
                let username = data.username;
                if (!username) {
                    username = Object.keys(this.bots)[0];
                }

                const bot = this.bots[username];
                if (!bot) {
                    debug(`Didn't find a bot for ${username}`);
                    return;
                }

                sendDiscord({
                    title: 'Set timeout!',
                    color: 2615974,
                    fields: [
                        {
                            name: '',
                            value: `Your macro will stop <t:${Math.round((Date.now() + time) / 1000)}:R>`,
                        }
                    ],
                    thumbnail: {
                        url: `https://mc-heads.net/head/${bot.getBot().uuid}.png`,
                    },
                    footer: {
                        text: `TPM Rewrite`,
                        icon_url: 'https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888',
                    }
                })
                setTimeout(() => {
                    this.destroyBot(username);
                    sendDiscord({
                        title: 'Stopping account!',
                        color: 15755110,
                        fields: [
                            {
                                name: '',
                                value: `It's your timeout!!! May ${username} rest in peace`,
                            }
                        ],
                        thumbnail: {
                            url: `https://mc-heads.net/head/${bot.getBot().uuid}.png`,
                        },
                        footer: {
                            text: `TPM Rewrite`,
                            icon_url: 'https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888',
                        }
                    })
                }, time);
                break;
            }
            case "block": {
                let { username, command, blockee } = data;
                if (!username) {
                    username = Object.keys(this.bots)[0];
                }

                const bot = this.bots[username].getBot();
                if (!bot) {
                    debug(`Didn't find a bot for ${username}`);
                    return;
                }

                bot.chat(command);

                sendDiscord({
                    title: 'Blocked',
                    color: 15755110,
                    fields: [
                        {
                            name: '',
                            value: `${username} blocked ${blockee}!`,
                        }
                    ],
                    thumbnail: {
                        url: `https://mc-heads.net/head/${bot.uuid}.png`,
                    },
                    footer: {
                        text: `TPM Rewrite`,
                        icon_url: 'https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888',
                    }
                })
            }
        }
    }

    async getSettings() {
        const settingsPromises = Object.keys(this.bots).map((botKey) => {
            return new Promise((resolve) => {
                const ws = this.bots[botKey].ws;
                const coflSocket = this.bots[botKey].coflSocket;
                coflSocket.handleCommand(`/cofl get json`);
                ws.once('jsonSettings', (msg) => {
                    this.settings.push(msg);
                    resolve();
                });
            });
        });

        await Promise.all(settingsPromises);
    }

    async botsReady() {
        return new Promise(async (resolve) => {
            while (Object.keys(this.bots).length !== igns.length) {
                await sleep(10_000);
            }
            resolve();
        });
    }
}

module.exports = TpmSocket;