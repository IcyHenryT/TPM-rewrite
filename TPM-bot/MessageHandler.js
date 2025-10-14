const { logmc, getPrefix, debug } = require("../logger.js");
const { sendDiscord, stripItemName, nicerFinders, formatNumber, addCommasToNumber, onlyNumbers, betterOnce, sleep, IHATECLAIMINGTAXES, noColorCodes } = require('./Utils.js');
const { config } = require('../config.js');
const { webhookFormat, blockUselessMessages, useItemImage } = config;

const soldRegex = /^\[Auction\] (.+?) bought (.+?) for ([\d,]+) coins CLICK$/;
const boughtRegex = /^You purchased (.+?) for ([\d,]+) coins!$/;
const claimedRegex = /^You collected ([\d,]+) coins from selling (.+?) to (.+?) in an auction!$/
const partyRegex = /^-+\s*(.+?) has invited you to join their party!\s*You have 60 seconds to accept\. Click here to join!\s*-+$/m;
const visitRegex = /^\[SkyBlock\] (.+?) is visiting Your Island!$/
const listRegex = /^(.+?) created (.+?) for (.+?) at ([\d,]+) coins!$/
const cancelRegex = /^(.+?) cancelled an auction for (.+?)!$/
const collectedRegex = /^(.+?) collected an auction for ([\d,]+) coins!$/

const uselessMessages = ['items stashed away!', 'CLICK HERE to pick them up!', "materials stashed away!", "(This totals"];

class MessageHandler {

    constructor(ign, bot, socket, state, relist, island, updateSold, updateBought, tpm, updateFailed) {
        this.ign = ign;
        this.bot = bot;
        this.coflSocket = socket;
        this.island = island;
        this.ws = socket.getWs();
        this.state = state;
        this.relist = relist;
        this.updateSold = updateSold;
        this.updateBought = updateBought;
        this.updateFailed = updateFailed;
        this.tpm = tpm;
        this.webhookObject = {};
        this.relistObject = {};
        this.soldObject = {};
        this.firstGui = null;
        this.sentCookie = false;
        this.privacySettings = /no regex yet but I don't want it to crash so I'm putting regex/;

        this.messageListener();
        this.coflHandler = this.coflHandler.bind(this)
        this.coflHandler();
    }

    messageListener() {

        let buyspeed = null;
        let oldBuyspeed = null;

        this.bot.on('message', async (message, type) => {
            if (type !== 'chat') return;
            let sentMessage = false;
            let text = message.getText(null);
            if (text.trim() === '') sentMessage = true;
            this.sendChatBatch(text);
            switch (text) {
                case 'Putting coins in escrow...':
                    buyspeed = Date.now() - this.firstGui
                    if (buyspeed == oldBuyspeed) return;
                    oldBuyspeed = buyspeed;
                    logmc(`§6[§bTPM§6] §3Auction bought in ${buyspeed}ms`);
                    this.bot.betterWindowClose();
                    this.state.setAction();
                    break;
                case "This auction is unavailable!":
                case "This auction wasn't found!":
                    if (this.state.get() === 'buying' || this.state.get() === 'claiming') this.state.set(null);
                    this.state.setAction();
                    break;
                case "You cannot view this auction!":
                case "You need the Cookie Buff to use this command!":
                    if (this.sentCookie) return;
                    sendDiscord({
                        title: 'Cookie Gone!!!',
                        color: 13313596,
                        fields: [
                            {
                                name: '',
                                value: `${this.ign} doesn't have a cookie :( Automatically turning off relist and moving to hub`,
                            }
                        ],
                        thumbnail: {
                            url: `https://sky.coflnet.com/animated/icon/BOOSTER_COOKIE`,
                        },
                        footer: {
                            text: `TPM Rewrite - Purse ${formatNumber(this.bot.getPurse())}`,
                            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                        }
                    }, this.bot.head, true)
                    this.sentCookie = true;
                    this.relist.turnOffRelist();
                    this.island.setIsland(false, 'Hub', false);
                    logmc(`§6[§bTPM§6] §cCookie gone!!!`);
                case "The auctioneer has closed this auction!":
                case "This auction belongs to another profile!":
                case "You don't have enough coins to afford this bid!":
                case "You cannot bid this amount!":
                case "This auction has expired!":
                case "Invalid auction ID!":
                case "You didn't participate in this auction!":
                case "There was an error grabbing this auction!":
                case "Putting coins in escrow...":
                case "The auction house is temporarily unavailable!":
                    this.state.set(null);
                    this.bot.betterWindowClose();
                    this.state.setAction();
                    break;
            }

            const boughtMatch = text.match(boughtRegex);
            if (boughtMatch) {
                const item = boughtMatch[1];
                const price = boughtMatch[2];
                const priceNoCommas = price.replace(/,/g, '');
                const weirdBought = stripItemName(item);
                const objectIntance = this.webhookObject[`${weirdBought}:${priceNoCommas}`];
                debug(JSON.stringify(objectIntance));
                debug(`${weirdBought}:${priceNoCommas}`);
                if (objectIntance) {
                    let { profit, auctionID, target, bed, finder, itemTag, vol, profitPerc } = objectIntance;
                    finder = nicerFinders(finder);
                    target = formatNumber(target);
                    profitPerc = formatNumber(profitPerc);
                    let formattedProfit = formatNumber(profit);
                    let formattedPrice = formatNumber(priceNoCommas);
                    let formattedString = this.formatString(webhookFormat, item, formattedProfit, price, target, buyspeed, bed, finder, auctionID, formattedPrice, this.bot.username, vol, profitPerc);
                    this.updateBought(profit, {
                        itemName: item,
                        finder: finder,
                        price: parseInt(priceNoCommas, 10),
                        tag: itemTag
                    });
                    let thumbnail = this.bot.head;
                    if (useItemImage && itemTag) {
                        thumbnail = `https://sky.coflnet.com/static/icon/${itemTag}`;
                    }
                    if (profit < 100_000_000) {
                        sendDiscord({
                            title: 'Item purchased',
                            color: 2615974,
                            fields: [
                                {
                                    name: '',
                                    value: formattedString,
                                }
                            ],
                            thumbnail: {
                                url: thumbnail,
                            },
                            footer: {
                                text: `TPM Rewrite - Found by ${finder} - Purse ${formatNumber(this.bot.getPurse(true) - parseInt(priceNoCommas, 10))}`,
                                icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                            }
                        }, useItemImage ? this.bot.head : null, false, this.bot.username)
                    } else {
                        sendDiscord({
                            title: 'LEGENDARY FLIP WOOOOO!!!',
                            color: profit > 1_000_000_000 ? 15566847 : 16629250,
                            fields: [
                                {
                                    name: '',
                                    value: formattedString,
                                }
                            ],
                            thumbnail: {
                                url: thumbnail,
                            },
                            footer: {
                                text: `TPM Rewrite - Found by ${finder} - Purse ${formatNumber(this.bot.getPurse(true) - parseInt(priceNoCommas, 10))}`,
                                icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                            }
                        }, useItemImage ? this.bot.head : null, true, this.bot.username)
                    }

                    this.tpm.send(JSON.stringify({
                        type: "flip",
                        data: JSON.stringify({
                            user: this.ign,
                            bed: bed,
                            flip: item,
                            price: price,
                            profit: profit,
                            uuid: this.bot.uuid,
                            auctionId: auctionID,
                            finder: finder,
                            buyspeed: buyspeed
                        })
                    }))

                    this.state.setAction();

                    setTimeout(() => this.bot.getPurse(), 5000);

                    const relistObject = this.relistObject[auctionID];

                    const { profit: relistProfit, target: relistTarget, itemName, weirdItemName, finder: relistFinder, tag } = relistObject;

                    debug(JSON.stringify(relistObject));
                    setTimeout(() => {
                        if (this.relist.checkRelist(relistProfit, relistFinder, itemName, tag, auctionID, relistTarget, weirdItemName)) {
                            this.relist.listAuction(auctionID, relistTarget, relistProfit, weirdItemName);
                        }
                    }, 10000)

                }
                this.coflSocket.sendScoreboard();
            }

            const soldMatch = text.match(soldRegex);
            if (soldMatch) {
                if (!this.relist.getGottenReady()) return;
                this.updateSold();
                this.coflSocket.sendScoreboard();
                const item = soldMatch[2];
                const price = onlyNumbers(soldMatch[3]);
                const object = this.soldObject[`${stripItemName(item)}:${price}`];
                const clickEvent = message?.clickEvent?.value;
                const auctionID = clickEvent.replace('/viewauction ', '').replace(/-/g, '');
                if (!object) {
                    this.soldObject[`${stripItemName(item)}:${IHATECLAIMINGTAXES(price)}`] = { auctionID };
                    debug(`added sold object ${stripItemName(item)}:${Math.round(IHATECLAIMINGTAXES(price))} ${auctionID}`);
                }
                this.state.setAction();

                setTimeout(() => {
                    this.state.queueAdd(clickEvent, 'claiming', 1);
                }, 1500)

                setTimeout(() => this.bot.getPurse, 5000);

            }
            const claimedMatch = text.match(claimedRegex);
            if (claimedMatch && this.relist.getGottenReady()) {
                const price = claimedMatch[1];
                const item = claimedMatch[2];
                let buyer = claimedMatch[3];
                if (buyer.includes(' ')) buyer = buyer.split(' ')[1];
                const priceNoCommas = onlyNumbers(price);
                debug(`${stripItemName(item)}:${priceNoCommas}`);
                const object = this.soldObject[`${stripItemName(item)}:${priceNoCommas}`];
                debug(JSON.stringify(object));
                let profitMessage = '';
                if (object?.profit) profitMessage = ` (\`${formatNumber(object.profit)}\` profit)`
                debug(JSON.stringify(object));
                let thumbnail = this.bot.head;
                if (object?.itemTag) {
                    thumbnail = `https://sky.coflnet.com/static/icon/${object.itemTag}`;
                }
                this.relist.declineSoldAuction();
                setTimeout(() => {
                    sendDiscord({
                        title: 'Item Sold',
                        color: 16731310,
                        fields: [
                            {
                                name: '',
                                value: `Collected \`${addCommasToNumber(price)} coins\` for selling [\`${item}\`](https://sky.coflnet.com/auction/${object?.auctionID}) to \`${buyer}\`${profitMessage}`,
                            }
                        ],
                        thumbnail: {
                            url: thumbnail,
                        },
                        footer: {
                            text: `TPM Rewrite - Purse ${formatNumber(this.bot.getPurse(true) + priceNoCommas)}`,
                            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14879f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                        }
                    }, useItemImage ? this.bot.head : null, false, this.bot.username)
                    setTimeout(() => {
                        this.bot.getPurse();
                    }, 4000)
                }, 1000)
            }

            const partyMatch = text.match(partyRegex);
            if (partyMatch) {
                this.tpm.send(JSON.stringify({
                    type: "partyInvite",
                    data: JSON.stringify({
                        username: this.ign,
                        inviteUser: partyMatch[1],
                        botPurse: formatNumber(this.bot.getPurse()),
                        uuid: this.bot.uuid
                    })
                }))
            }

            const visitMatch = text.match(visitRegex);
            if (visitMatch) {
                let name = visitMatch[1];
                if (name.includes(' ')) name = name.split(' ')[1];
                name = noColorCodes(name);
                this.tpm.send(JSON.stringify({
                    type: "visit",
                    data: JSON.stringify({
                        username: this.ign,
                        inviteUser: name,
                        botPurse: formatNumber(this.bot.getPurse()),
                        uuid: this.bot.uuid
                    })
                }))
            }

            const listMatch = text.match(listRegex)
            if (listMatch) {
                let name = listMatch[1];
                if (name.includes(' ')) name = name.split(' ')[1];
                name = noColorCodes(name);
                debug("List name", name);
                if (name !== this.bot.username) this.relist.increaseSlots();
            }

            const cancelMatch = text.match(cancelRegex);
            if (cancelMatch) {
                let name = cancelMatch[1];
                if (name.includes(' ')) name = name.split(' ')[1];
                name = noColorCodes(name);
                debug("cancel name", name);
                if (name !== this.bot.username) this.relist.declineSoldAuction();
            }

            const collectedMatch = text.match(collectedRegex);
            if (collectedMatch) {
                let name = collectedMatch[1];
                if (name.includes(' ')) name = name.split(' ')[1];
                name = noColorCodes(name);
                debug("collected name", name);
                if (name !== this.bot.username) this.relist.declineSoldAuction();
            }

            if (blockUselessMessages) {
                for (const message of uselessMessages) {
                    if (text.includes(message)) {
                        sentMessage = true;
                        break;
                    }
                }
            }

            if (!sentMessage) logmc(`${getPrefix(this.ign)}${message.toMotd()}`);

        })

    }

    coflHandler() {
        this.ws.on('getInventory', this.sendInventory);
        this.ws.on('open', async () => {
            const test = async () => {
                debug(`Checking for scoreboard`)
                if (this.island.onIslandCheck()) {
                    debug(`Sending inital scoreboard`)
                    this.coflSocket.sendScoreboard();
                    return;
                }
                try {
                    await betterOnce(this.bot, 'spawn', null, 30_000);
                    await sleep(20_500);
                } catch (e) {
                    test();
                }
            };
            test();
        });
        const settings = msg => {
            const data = JSON.parse(msg.data);
            this.privacySettings = new RegExp(data.chatRegex);
            this.ws.off('settings', settings);
        };
        this.ws.on('settings', settings);
    }

    sendInventory = () => {
        this.coflSocket.send(JSON.stringify({
            type: 'uploadInventory',
            data: JSON.stringify(this.bot.inventory)
        }), false);
    };

    sendChatBatch(message) {
        if (this.privacySettings.test(message)) {

            this.coflSocket.send(
                JSON.stringify({
                    type: 'chatBatch',
                    data: JSON.stringify([message]),
                }), true
            );
        }
    }

    setBuySpeed(BINView) {
        this.firstGui = BINView;
    }

    objectAdd(weirdItemName, price, target, profit, auctionID, bed, finder, itemName, tag, volume, profitPerc) {
        const soldPrice = Math.round(IHATECLAIMINGTAXES(this.relist.roundNumber(this.relist.calcPriceCut(target) * target / 100)));
        debug(`Sold object added: ${weirdItemName}:${soldPrice}`);

        this.soldObject[`${weirdItemName}:${soldPrice}`] = {
            profit: profit,
            itemTag: tag
        };

        this.webhookObject[`${weirdItemName}:${price}`] = {
            auctionID: auctionID,
            target: target,
            profit: profit,
            bed: bed,
            finder: finder,
            itemTag: tag,
            volume: volume,
            profitPerc: profitPerc
        };

        this.relistObject[auctionID] = {
            target: target,
            profit: profit,
            itemName: itemName,
            finder: finder,
            tag: tag,
            weirdItemName: weirdItemName,
            pricePaid: price
        }
    }

    formatString(format, ...args) {
        return args.reduce((formatted, arg, index) => {
            const regex = new RegExp(`\\{${index}\\}`, 'g')
            return formatted.replace(regex, arg);
        }, format)
    }

    getObjects() {
        return { relist: this.relistObject, webhook: this.webhookObject, sold: this.soldObject };
    }

}

module.exports = MessageHandler;