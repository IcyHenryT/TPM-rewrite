const { makeBot } = require("./bot.js");
const { getPackets } = require("./packets.js");
const { debug, logmc } = require("../logger.js");
const { config } = require('../config.js');
const { getStats, getPingStats, sendDiscord, formatNumber } = require('./Utils.js');
const CoflWs = require("./CoflWs.js");
const StateManager = require("./StateManager.js");
const AutoIsland = require('./AutoIsland.js');
const MessageHandler = require('./MessageHandler.js');
const AutoBuy = require('./AutoBuy.js');
const RelistHandler = require('./RelistHandler.js');
const BankHandler = require("./BankHandler.js");
const { webhookFormat, useItemImage } = config;


class AhBot {

    constructor(ign, TPMSocket, destroyBot, safeIgn) {
        this.ign = ign;
        this.bot = null;
        this.autoBuy = null;
        this.webhook = null;
        this.ws = null;
        this.coflSocket = null;
        this.island = null;
        this.state = null;
        this.packets = null;
        this.relist = null;
        this.bank = null;
        this.sold = 0;
        this.bought = [];
        this.boughtDetails = [];
        this.failed = 0;
        this.tpm = TPMSocket;
        this.start = Date.now();
        this.destroyBot = destroyBot;
        this.safeIgn = safeIgn;

        this.updateBought = this.updateBought.bind(this);
        this.updateSold = this.updateSold.bind(this);
        this.updateFailed = this.updateFailed.bind(this);
    }

    async startBot() {
        const { bot, safeIgn: ign, tpm } = this

        let packets = getPackets(ign);

        const state = new StateManager(bot);
        state.saveQueue()

        const coflSocket = new CoflWs(ign, bot);
        const ws = coflSocket.getWs();

        const relist = new RelistHandler(bot, state, tpm, this.updateSold, coflSocket);

        const island = new AutoIsland(ign, state, bot);

        const webhook = new MessageHandler(ign, bot, coflSocket, state, relist, island, this.updateSold, this.updateBought, tpm, this.updateFailed);

        const bank = new BankHandler(bot, state);

        const autoBuy = new AutoBuy(bot, webhook, coflSocket, ign, state, relist, bank, this.updateFailed);

        this.autoBuy = autoBuy;
        this.webhook = webhook;
        this.ws = ws;
        this.relist = relist;
        this.coflSocket = coflSocket;
        this.island = island;
        this.state = state;
        this.bank = bank;
        this.packets = packets;

        bot.on('kicked', (reason) => {
            coflSocket.closeSocket();
            state.set(null);
            try {
                reason = JSON.parse(reason).extra.map((element) => { return element.text });
            } catch { }
            logmc(`§6[§bTPM§6] §c${ign} kicked because ${reason} :(`);
            sendDiscord({
                title: 'Bot kicked!',
                color: 12058678,
                fields: [
                    {
                        name: '',
                        value: `${ign} kicked because \`${reason}\``,
                    }
                ],
                thumbnail: {
                    url: this.bot.head,
                },
                footer: {
                    text: `TPM Rewrite`,
                    icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                }
            }, this.bot.head, true)
            this.destroyBot(ign, true);
        })

    }

    async createBot() {
        return new Promise(async (resolve) => {
            this.bot = await makeBot(this.ign, this.safeIgn);
            this.startBot();
            resolve();
        })
    }

    async stop() {
        this.state.queueAdd('rip', "death", 3);
    }

    handleTerminal(command, message) {
        switch (command) {
            case 'chat':
                this.packets?.sendMessage(message);
                break;
            case '/cofl':
            case "/tpm":
            case '/icymacro':
                this.coflSocket.handleCommand(`/cofl ${message}`);
                break;
            case "/fc":
                this.coflSocket.handleCommand(`/cofl chat ${message}`);
                break;
            case "/stats":
                getStats(this.bot, this.coflSocket.handleCommand, this.ws, this.sold, this.bought, this.start);
                break;
            case "/ping":
                getPingStats(this.bot, this.coflSocket.handleCommand, this.ws, this.sold, this.bought);
                break;
            case "/test":
                sendDiscord({
                    title: 'LEGENDARY FLIP WOOOOO!!!',
                    color: 16629250,
                    fields: [
                        {
                            name: '',
                            value: this.webhook.formatString(webhookFormat, 'Hyperion', '1.7B', '100,000', '1.7B', '50', "NUGGET", "Craft Cost", "000000000000000000", "100K", this.bot.username, "24", "100m"),
                        }
                    ],
                    thumbnail: {
                        url: useItemImage ? `https://sky.coflnet.com/static/icon/HYPERION` : this.bot.head,
                    },
                    footer: {
                        text: `TPM Rewrite - Found by Craft Cost - Purse ${formatNumber(this.bot.getPurse(true))}`,
                        icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                    }
                }, this.bot.head, true, this.bot.username)
                sendDiscord({
                    title: 'Item purchased',
                    color: 2615974,
                    fields: [
                        {
                            name: '',
                            value: this.webhook.formatString(webhookFormat, 'Hyperion', '1.7B', '100,000', '1.7B', '50', "NUGGET", "Craft Cost", "000000000000000000", "100K", this.bot.username),
                        }
                    ],
                    thumbnail: {
                        url: useItemImage ? `https://sky.coflnet.com/static/icon/HYPERION` : this.bot.head,
                    },
                    footer: {
                        text: `TPM Rewrite - Found by Craft Cost - Purse ${formatNumber(this.bot.getPurse(true))}`,
                        icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                    }
                }, this.bot.head, false, this.bot.username)
                break;
            case "checkBids": {
                this.relist.checkBids();
            }
        }
    }

    initAskPrefix(igns, sub = 3) {
        debug(igns);
        let thisPrefix = this.ign.substring(0, sub);
        debug(`|${thisPrefix}|`)
        if (sub > 10) return this.safeIgn;
        try {
            igns.forEach(ign => {
                if (ign.substring(0, sub) == thisPrefix && ign !== this.ign) {
                    debug(`${ign} start was the same as ${thisPrefix}.`)
                    sex
                }
            })
        } catch (e) {
            debug(`retrying, ${e}`)
            return this.initAskPrefix(igns, ++sub);
        }

        return thisPrefix;
    }

    getBot() {
        return this.bot;
    }

    updateSold() {
        this.sold++;
    }

    updateBought(profit, details = null) {
        this.bought.push(profit);
        if (details) {
            this.boughtDetails.push(details);
        }
    }

    updateFailed() {
        this.failed++;
    }
}

module.exports = AhBot;