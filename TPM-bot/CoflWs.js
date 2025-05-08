const WebSocket = require('ws');
const EventEmitter = require('events');

const { config } = require('../config.js');
const { logmc, customIGNColor, debug, error } = require('../logger.js');
const { formatNumber, noColorCodes, sleep, sendDiscord } = require('./Utils.js');
const { getPackets } = require('./packets.js');

const { blockUselessMessages, session } = config;

const connectionRegex = /\[Coflnet\]:  Your connection id is ([a-f0-9]{32}), copy that if you encounter an error/;
const startedRegex = /You have (.+?) until (.+?)$/
const freeRegex = /You use the FREE version of the flip finder/;

class CoflWs {

    constructor(ign, bot) {
        this.ws = new EventEmitter();
        this.ws.setMaxListeners(20);
        this.websocket = null;
        this.link = null;
        this.ign = ign;
        this.bot = bot;
        this.reconnect = true;
        this.connectionID = null;
        this.handleCommand = this.handleCommand.bind(this);//Can call in other places now!!!
        this.dead = false;

        this.startWs();
    }

    startWs(link = null) {

        if (link === null) {
            link = `wss://sky.coflnet.com/modsocket?version=1.5.1-af&player=${this.ign}&SId=${session}`;
            this.link = link;
        }//There's no option to use regular socket because it's slower. 

        this.websocket = new WebSocket(link);
        const { websocket, ws } = this;

        websocket.on('open', (message) => {
            if(this.dead) {
                this.closeSocket();
                return;
            }
            this.reconnect = true;
            logmc(`§6[§bTPM§6] §eStarted cofl connection!`);
            ws.emit("open", message);
        })

        websocket.on('close', async () => {
            if (this.reconnect) {
                await sleep(5000);
                this.startWs(link);
                logmc(`§6[§bTPM§6] §cCofl connection stopped. Auto reconnecting`);
            }
        })

        websocket.on('error', (e) => {
            error(`Error with cofl socket! `, e);
            this.closeSocket();
            setTimeout(() => {//Make sure there's no overlapping
                this.startWs(link);
            }, 500);
        })

        websocket.on('message', (message) => {
            const msg = this.parseMessage(message);
            if (this.testMessage(msg)) {
                logmc(msg);
            } else {
                debug(`Blocked cofl message: ${noColorCodes(msg)}`);
            }
        })

    }

    getWs() { return this.ws }//This is the one that will prob always get used. It's an event emitter so that you can easily sort through the messaages

    getCoflWs() { return this.websocket }//Tbh will prob never get used but

    getCurrentLink() { return this.link }//Might be used for utils or smth idrk

    getConnectionId() { return this.connectionID }//Used in relistHandler

    getAccountTier() { return this.accountTier }//Used in relistHandler

    getAccountEndingTime() { return this.accountEndTime }//Used in relistHandler
    
    kill() { 
        this.closeSocket();
        this.dead = true;
    }

    parseMessage(message) {
        const msg = JSON.parse(message);
        if (!msg || !msg.type) return "no";
        let data = JSON.parse(msg.data)
        let text;
        switch (msg.type) {
            case "flip":
                this.ws.emit("flip", data);
                text = `§6[§bTPM§6] ${customIGNColor(this.ign)}${this.ign} is trying to purchase ${data.itemName}${customIGNColor(this.ign)} for ${formatNumber(data.startingBid)} §7(target ${formatNumber(data.target)})`
                break;
            case "writeToChat":
            case "chatMessage":
                this.ws.emit("message", msg);
                text = smallMessageParse(data);
                this.ws.emit("messageText", text);
                break;
            case "loggedIn":
            case "playSound":
            case "ping":
            case "countdown":
            case "createAuction":
                break;
            case "settings":
                this.ws.emit('jsonSettings', msg);
                break;
            case "getInventory":
                this.ws.emit('getInventory', msg);
                break;
            case "privacySettings":
                this.ws.emit('settings', msg);
                break;
            case "execute":
                if (data.includes('/cofl')) {
                    if (data.includes('/cofl connect')) {//switch region stuff
                        this.closeSocket();
                        setTimeout(() => {
                            this.startWs(`${data.split(' ')[2]}?version=1.5.1-af&player=${this.ign}&SId=${session}`);
                        }, 5000);
                        break;
                    } else {
                        this.handleCommand(data);
                    }
                } else {
                    const packets = getPackets(this.ign);
                    if (!packets) return;
                    packets.sendMessage(data);
                }
                break;
        }
        return text;
    }

    handleCommand(command, type = false) {
        const args = command.split(' ');
        const first = args[1];
        args.shift();
        args.shift();
        const joined = JSON.stringify(args.join(' '));
        const send = JSON.stringify({
            type: first,
            data: joined
        })
        this.send(send, type);
    }

    send(msg, type = true) {
        if (this.websocket?.readyState !== WebSocket.OPEN) {
            if (type) logmc(`§6[§bTPM§6] §cCan't send to websocket because not connected`);
            return;
        }
        this.websocket.send(msg);
        if (type) debug(msg);
    }

    testMessage(msg) {
        if (!msg) return false;
        msg = noColorCodes(msg);
        if (msg.includes('[Chat]')) return true;//Don't try and use cofl chat to trigger other things :(

        const connectionMatch = msg.match(connectionRegex);
        if (connectionMatch) {
            debug(`Got connection ID ${connectionMatch[1]}`);
            this.connectionID = connectionMatch[1];
            this.handleCommand('/cofl get json');
        }

        const startMatch = msg.match(startedRegex);
        if (startMatch) {
            debug(`Got start stuff ${JSON.stringify(startMatch)}`);
            switch (startMatch[1]) {
                case "PREMIUM PLUS":
                    this.accountTier = "Premium Plus";
                    break;
                case "PREMIUM":
                    this.accountTier = "Premium";
                    break;
                default:
                    this.accountTier = startMatch[1];
                    break;
            }
            this.accountEndTime = Math.round(new Date(startMatch[2]).getTime() / 1000);//convert to milliseconds!!!
        }

        const freeMatch = msg.match(freeRegex);
        if (freeMatch) {
            debug(`Got free tier`);
            this.accountTier = "Free";
            this.accountEndTime = Math.round(Date.now() * 100);
        }

        if (msg.includes(`Until you do you are using the free version which will make less profit and your settings won't be saved`)) {//logged out
            this.handleCommand('/cofl s maxItemsInInventory 1');
            //TODO add webhook here
        }

        if (msg.includes("Your premium tier is about to expire in 1 minutes.")) {
            let message = `Your ${this.getAccountTier()} is expiring in a minute!!!`
            if (this.getCurrentLink().includes("sky-us") && this.getAccountTier() == "Premium Plus") {
                this.handleCommand('/cofl switchregion EU');
                message += "\nYou're now on the EU socket so that it doesn't spam :)"
            }

            sendDiscord({
                title: 'Premium expiring!',
                color: 7448274,
                fields: [
                    {
                        name: '',
                        value: message,
                    }
                ],
                thumbnail: {
                    url: this.bot.head,
                },
                footer: {
                    text: `TPM Rewrite`,
                    icon_url: 'https://media.discordapp.net/attachments/1261825756615540839/1304911212760530964/983ecb82e285eee55ef25dd2bfbe9d4d.png?ex=67311cc5&is=672fcb45&hm=de4e5dd382d13870fdefa948d295fc5d1ab8de6678f86c36cd61fa1fd0cc5dd2&=&format=webp&quality=lossless&width=888&height=888',
                }
            }, this.bot.head, true, this.bot.username);
        }

        if (blockUselessMessages) {
            if (msg.includes('matched your Whitelist')) return false;
            if (msg.includes('There was no ah price found for')) return false;
        }

        return true;
    }

    closeSocket() {
        debug(`Intentional socket close`);
        this.reconnect = false;
        this.websocket.close();
    }

    sendScoreboard() {
        debug(`Sending scoreboard`);
        setTimeout(() => {
            if (!this.bot?.scoreboard?.sidebar?.items) return;
            let scoreboard = this.bot.scoreboard.sidebar.items.map(item => item.displayName.getText(null).replace(item.name, ''));
            if (scoreboard.find(e => e.includes('Purse:') || e.includes('Piggy:'))) {
                this.send(
                    JSON.stringify({
                        type: 'uploadScoreboard',
                        data: JSON.stringify(scoreboard)
                    }), true
                );
            }
        }, 5500);
    }

}

function smallMessageParse(msg) {
    if (Array.isArray(msg)) return msg.map(msg => msg.text).join(' ');
    return msg?.text;
}

module.exports = CoflWs;