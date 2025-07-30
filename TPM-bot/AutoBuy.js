const { getPackets } = require('./packets.js');
const { config } = require('../config.js');
const { stripItemName, IHATETAXES, normalizeDate, getWindowName, isSkin, sleep, normalNumber, normalTime, getSlotLore, noColorCodes, sendDiscord, formatNumber, nicerFinders, betterOnce } = require('./Utils.js');
const { logmc, debug, removeIgn, error } = require('../logger.js');

const {
    SLOT_MAIN_ITEM,
    SLOT_CONFIRM_BUTTON,
    SLOT_LORE,
    SLOT_ALTERNATE_ITEM,
    SLOT_DELIST,
    CLICK_PACKET_PRIMARY,
    CLICK_PACKET_SKIP,
    MAX_BED_CLICK_ATTEMPTS,
    BED_SPAM_MAX_UNDEFINED,
    DEFAULT_DELAY_BETWEEN_CLICKS,
    MIN_DELAY_WITH_SKIP,
} = require('./constants.js');

let { delay, waittime, skip: skipSettings, clickDelay, bedSpam, delayBetweenClicks, angryCoopPrevention: coop, sendAllFlips: flipsWebhook, useItemImage } = config;
let { always: useSkip, minProfit: skipMinProfit, userFinder: skipUser, skins: skipSkins, profitPercentage: skipMinPercent, minPrice: skipMinPrice } = skipSettings;
skipMinProfit = normalNumber(skipMinProfit);
skipMinPercent = normalNumber(skipMinPercent);
skipMinPrice = normalNumber(skipMinPrice);
delayBetweenClicks = delayBetweenClicks || DEFAULT_DELAY_BETWEEN_CLICKS;
if (useSkip && delay < MIN_DELAY_WITH_SKIP) delay = MIN_DELAY_WITH_SKIP;

class AutoBuy {

    constructor(bot, WebhookManager, coflSocket, ign, state, relist, bank) {
        this.bot = bot;
        this.webhook = WebhookManager;
        this.coflSocket = coflSocket;
        this.ws = coflSocket.getWs();
        this.ign = ign;
        this.state = state;
        this.bank = bank;
        this.relist = relist;
        this.recentProfit = 0;
        this.recentPercent = 0;
        this.recentFinder = 0;
        this.recentPrice = 0;
        this.recentlySkipped = false;
        this.recentName = null;
        this.fromCoflSocket = false;
        this.bedFailed = false;
        this.currentOpen = null;
        this.packets = getPackets(ign);
        this.currentlyTimingBed = false;//failsafe
        this.setFromCoflSocket = this.setFromCoflSocket.bind(this);
        relist.giveSetCoflSocket(this.setFromCoflSocket)

        this.flipHandler();
        this.initQueue();
    }

    async flipHandler() {
        const { webhook, bot, ws, state, packets } = this;
        let firstGui;

        bot._client.on('open_window', async (window) => {
            const windowID = window.windowId;
            const nextWindowID = windowID === 100 ? 1 : windowID + 1;
            const windowName = window.windowTitle;
            debug(`Got new window ${windowName}, ${windowID} ${this.fromCoflSocket}`);
            packets.confirmClick(windowID);
            if (windowName === '{"italic":false,"extra":[{"text":"BIN Auction View"}],"text":""}' && state.get() !== 'listing') {
                const finderCheck = this.recentFinder === "USER" && skipUser;
                const skinCheck = isSkin(this.recentName) && skipSkins;
                const profitCheck = this.recentProfit > skipMinProfit;
                const percentCheck = this.recentPercent > skipMinPercent;
                const priceCheck = this.recentPrice > skipMinPrice;
                let useSkipOnFlip = (profitCheck || skinCheck || finderCheck || percentCheck || priceCheck || useSkip) && this.fromCoflSocket;
                this.fromCoflSocket = false;
                debug(`Set from cofl socket to false`);
                firstGui = Date.now();
                webhook.setBuySpeed(firstGui);
                let item = (await this.itemLoad(SLOT_MAIN_ITEM))?.name;
                if (item === 'gold_nugget') {
                    packets.click(SLOT_MAIN_ITEM, windowID, CLICK_PACKET_PRIMARY);
                    bot.betterClick(SLOT_MAIN_ITEM, 0, 0);
                    if (useSkipOnFlip) {
                        packets.click(SLOT_CONFIRM_BUTTON, nextWindowID, CLICK_PACKET_SKIP);
                        this.recentlySkipped = true;
                        if (useSkip) {
                            logmc(`§6[§bTPM§6] §cUsed skip because you have skip always enabled in config`);
                            return;
                        }
                        let skipReasons = [];
                        if (finderCheck) skipReasons.push('it was a user flip');
                        if (profitCheck) skipReasons.push('it was over skip min profit');
                        if (skinCheck) skipReasons.push('it was a skin');
                        if (percentCheck) skipReasons.push('it was over skip min percentage');
                        if (priceCheck) skipReasons.push('it was over min price');
                        logmc(`§6[§bTPM§6] §8Used skip because ${skipReasons.join(' and ')}. You can change this in your config`);
                        return;
                    }
                }

                this.recentlySkipped = false;

                switch (item) {
                    case "bed":
                        logmc(`§6[§bTPM§6]§6 Found a bed!`)
                        if (!bedSpam && !this.bedFailed && !this.currentlyTimingBed) this.bedFailed = true;//Sometimes beds aren't timed idk why but this should be a good failsafe
                        this.initBedSpam();
                        break;
                    case null:
                    case undefined:
                    case "potato":
                        logmc(`§6[§bTPM§6]§c Potatoed :(`);
                        bot.betterWindowClose();
                        state.set(null);
                        state.setAction(firstGui);
                        break;
                    case "feather":
                        const secondItem = (await this.itemLoad(SLOT_MAIN_ITEM, true))?.name;
                        if (secondItem === 'potato') {
                            logmc(`§6[§bTPM§6]§c Potatoed :(`)
                            bot.betterWindowClose();
                            state.set(null);
                            state.setAction(firstGui);
                            break;
                        } else if (secondItem !== 'gold_block') {
                            debug(`Found a weird item on second run through ${secondItem}`);
                            bot.betterWindowClose();
                            state.set(null);
                            state.setAction(firstGui);
                            break;
                        }
                    case "gold_block":
                        if (coop) {
                            await bot.waitForTicks(15);
                            const lore = getSlotLore(bot.currentWindow?.slots?.[13]);
                            debug(`lore: ${lore}`);
                            if (!lore) {
                                logmc(`§6[§bTPM§6] §cNot claiming sold auction because I can't find the lore :( so idk if you sold it or your coop.`);
                                if (bot.currentWindow) debug(JSON.stringify(bot.currentWindow.slots[13]));
                                if (state.get() !== "getting ready") state.set(null);
                                state.setAction(firstGui);
                                bot.betterWindowClose();
                                break;
                            }
                            const found = lore.find(line => {
                                const result = noColorCodes(line)?.includes(bot.username);
                                debug(`Found line ${noColorCodes(line)} and ${result}`);
                                return result;
                            });
                            if (found) {
                                bot.betterClick(SLOT_MAIN_ITEM);
                            } else {
                                logmc("§6[§bTPM§6] §cItem was sold by coop! Not claiming.");
                                bot.betterWindowClose();
                            }
                        } else {
                            bot.betterClick(SLOT_MAIN_ITEM);
                        }
                        if (state.get() !== "getting ready") state.set(null);
                        state.setAction(firstGui);
                        break;
                    case "poisonous_potato":
                        logmc(`§6[§bTPM§6]§c Too poor to buy it :(`);
                        bot.betterWindowClose();
                        state.set(null);
                        state.setAction(firstGui);
                        break;
                    case "stained_glass_pane":
                        if (state.get() === 'delisting') {
                            this.bot.betterClick(33);
                            debug(`clicked delist`);
                        } else if (state.get() == "expired") {//This means that it didn't actually expire but it thinks that it did
                            const slot = bot.currentWindow.slots[13];
                            const lore = getSlotLore(slot);
                            const endsInTime = lore.find(line => line.includes('Ends in:'));
                            const endTime = normalTime(endsInTime);
                            setTimeout(() => {//Remove auctions when they expire
                                state.queueAdd(this.relist.getItemUuid(slot), "expired", 4);
                            }, endTime)
                            bot.betterWindowClose();
                            state.set(null);
                            state.setAction(firstGui);
                            sendDiscord({
                                title: 'Funny story',
                                color: 13320532,
                                fields: [
                                    {
                                        name: '',
                                        value: `Ok so like super funny story. Remember that auction that I just told you expired so like it kinda actually didn't expire ikr and like hypixel rounds numbers so like TPM thought it expired cause yk the round numbers make the time not exact and like it didn't actually expire so like yea sorry about that it'll send a new expire thingy when it actually does unless the rounding thing happens again yk ok have a good day and gl flipping man`,
                                    }
                                ],
                                thumbnail: {
                                    url: bot.head,
                                },
                                footer: {
                                    text: `TPM Rewrite`,
                                    icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                                }
                            }, useItemImage ? bot.head : null, false, bot.username);
                        } else {
                            bot.betterWindowClose();
                            state.set(null);
                            state.setAction(firstGui);
                        }
                        break;
                    case "gold_nugget":
                        if (state.get() === "expired") {
                            state.setAction();
                            state.set(null);
                            this.relist.declineSoldAuction();
                        }
                        break;
                    default:
                        error(`Weird item ${item} found. Idk man`);
                        error(JSON.stringify(bot.currentWindow.slots[31]));
                        bot.betterWindowClose();
                        state.set(null);
                        state.setAction(firstGui);
                        break;
                }

            } else if (windowName === '{"italic":false,"extra":[{"text":"Confirm Purchase"}],"text":""}') {
                let confirmAt = Date.now() - firstGui;
                state.setAction(firstGui);
                logmc(`§6[§bTPM§6] §3Confirm at ${confirmAt}ms`);
                if (!this.recentlySkipped) bot.betterClick(SLOT_CONFIRM_BUTTON, 0, 0);
                await bot.waitForTicks(3);
                while (getWindowName(bot.currentWindow) === 'Confirm Purchase') {//Sometimes click doesn't register
                    bot.betterClick(SLOT_CONFIRM_BUTTON, 0, 0);
                    await bot.waitForTicks(5);
                }
                state.set(null);
            } else if (windowName === '{"italic":false,"extra":[{"text":"Auction View"}],"text":""}') {//failsafe if they have normal auctions turned on
                let item = (await this.itemLoad(29))?.name;
                if (item === "gold_nugget" && state.get() == 'expired') {
                    bot.betterClick(29);
                    this.relist.declineSoldAuction();
                    return;
                }
                bot.betterWindowClose();
                if (state.get() !== "getting ready") state.set(null);
                logmc(`§6[§bTPM§6] §cPlease turn off normal auctions!`);
            }
            await sleep(500);
            webhook.sendInventory();
        })

        ws.on('flip', (data) => {
            let currentTime = Date.now();
            const currentState = state.get();
            const stateCheck = currentState === null;
            const lastUpdated = currentTime - state.getTime() > delay;
            const windowCheck = !bot.currentWindow;
            const ready = windowCheck && lastUpdated && stateCheck;
            let auctionID = data.id;
            if (ready) bot._client.chat(`/viewauction ${auctionID}`);//Put this earlier so that it doesn't get slowed down (but it's kinda ugly :( )
            const { finder, vol, purchaseAt, target, startingBid, tag, itemName, profitPerc } = data;//I hate this :(
            let weirdItemName = stripItemName(itemName);
            let profit = IHATETAXES(target) - startingBid;
            let ending = new Date(normalizeDate(purchaseAt)).getTime();
            let bed = 'NUGGET';
            if (ready) {
                logmc(`§6[§bTPM§6] §6Opening ${itemName}`);
                this.recentlySkipped = false;
                this.currentOpen = auctionID;
                this.recentProfit = profit;
                this.recentFinder = finder;
                this.recentName = itemName;
                this.recentPercent = profitPerc;
                this.recentPrice = startingBid;
                this.bedFailed = false;
                this.fromCoflSocket = true;
                debug(`Set from cofl socket to true`);
                state.set('buying');
                state.setAction(currentTime);
                if (currentTime < ending) {
                    this.timeBed(ending, auctionID);
                    bed = 'BED';
                }
            } else if (currentState !== 'moving' && currentState !== 'getting ready') {
                let reasons = [];
                if (!windowCheck) reasons.push(`${getWindowName(bot.currentWindow)} is open`);
                if (!stateCheck) reasons.push(`state is ${currentState}`);
                if (!lastUpdated) reasons.push(`last action was too recent`);
                state.queueAdd({ finder, profit, tag, itemName, auctionID, startingBid }, 'buying', 0);
                logmc(`§6[§bTPM§6] §3${itemName}§3 added to pipeline because ${reasons.join(' and ')}!`);
            } else {
                logmc(`§6[§bTPM§6] §cCan't open flips while ${currentState} :(`);
            }
            webhook.objectAdd(weirdItemName, startingBid, target, profit, auctionID, bed, finder, itemName, tag, vol, profitPerc);
            debug(`Found flip ${auctionID}`);
            if (flipsWebhook) {
                sendDiscord({
                    title: 'Flip Found',
                    color: 9929727,
                    fields: [
                        {
                            name: '',
                            value: `${nicerFinders(finder)}: [\`${noColorCodes(itemName)}\`](https://sky.coflnet.com/a/${auctionID}) \`${formatNumber(startingBid)}\` ⇨ \`${formatNumber(target)}\` (\`${formatNumber(profit)}\` profit) [${bed}] \`${vol}\` volume`,
                        }
                    ],
                    thumbnail: {
                        url: bot.head,
                    },
                    footer: {
                        text: `TPM Rewrite - Found by ${nicerFinders(finder)}`,
                        icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                    }
                }, bot.head, false, "TPM", null, true)
            }
        })

    }

    async itemLoad(slot, alreadyLoaded = false) {
        return new Promise((resolve) => {
            const { bot } = this;
            let index = 1;
            let found = false;
            const first = bot.currentWindow?.slots[slot]?.name;
            const interval = alreadyLoaded ? setInterval(() => {
                const check = bot.currentWindow?.slots[slot];
                if (check?.name !== first) {
                    clearInterval(interval);
                    found = true;
                    resolve(check);
                    debug(`Found ${check?.name} on ${index}`);
                }
                index++
            }, 1) : setInterval(() => {
                const check = bot.currentWindow?.slots[slot];
                if (check) {
                    clearInterval(interval);
                    found = true;
                    resolve(check);
                    debug(`Found ${check?.name} on ${index}`);
                }
                index++
            }, 1);

            setTimeout(() => {
                if (found) return;
                debug(`Failed to find an item :(`);
                clearInterval(interval);
                resolve(null);
            }, delay * 3);
        });
    }

    //ok so the reason we have a fake price is so that I don't have to recode the whole price thing from queue yk yk
    openExternalFlip(ahid, profit, finder, itemname, tag, price = null, fakePrice = null) {//queue and buy from discord (maybe webpage in future?) ONLY CALL IF READY!!!
        this.bot.chat(`/viewauction ${ahid}`);
        this.recentFinder = finder;
        this.recentProfit = profit;
        this.currentOpen = ahid;
        this.bedFailed = true;
        this.recentName = itemname;
        this.recentlySkipped = false;

        if (price) {//For queue flips, don't include price
            this.webhook.objectAdd(stripItemName(itemname), price, null, null, ahid, 'EXTERNAL', finder, itemname, tag);
            this.recentPercent = profit / price * 100;
            this.recentPrice = price;
        } else {
            this.recentPercent = profit / fakePrice * 100;
            this.recentPrice = fakePrice;
        }
    }

    async timeBed(ending, currentID) {
        const start = Date.now();

        debug(`Timing bed ${currentID} ${ending - start - waittime}`);
        this.currentlyTimingBed = true;
        if (!bedSpam) {
            await sleep(ending - start - waittime);
            for (let i = 0; i < 5; i++) {
                if (getWindowName(this.bot.currentWindow)?.includes('BIN Auction View') && this.currentOpen === currentID) {
                    this.bot.betterClick(SLOT_MAIN_ITEM, 0, 0);
                    debug(`Clicking ${currentID} bed`);
                    await sleep(delayBetweenClicks);
                } else {
                    break;
                }
            }
        }

        await sleep(5000);
        const windowName = getWindowName(this.bot.currentWindow)
        if (windowName?.includes('BIN Auction View') && this.currentOpen === currentID && this.state.get() === 'buying') {
            this.bot.closeWindow(this.bot.currentWindow);
            this.state.set(null);
            if (!bedSpam) logmc(`§6[§bTPM§6] §cBed timing failed and we had to abort the auction :( Please lower your waittime if this continues or turn on bedspam`);
        } else if (!windowName && this.currentOpen === currentID && this.state.get() === 'buying') {
            logmc(`§6[§bTPM§6] §cWindow somehow closed after bed (possibly died)`);
            this.state.set(null);
        } else {
            debug(`Timed ${currentID} correctly. CurrentOpen: ${this.currentOpen}. Window Name: ${windowName}`);
        }

        this.currentlyTimingBed = false;

    }

    initBedSpam() {
        let undefinedCount = 0;
        const bedSpam = setInterval(() => {
            const window = this.bot.currentWindow;
            const item = window?.slots[31]?.name;
            if (item == undefined) {
                undefinedCount++
                if (undefinedCount == 5) {
                    clearInterval(bedSpam);
                    debug(`Clearing bed spam because of undefined count`, this.bedFailed, config.bedSpam, this.currentlyTimingBed, getWindowName(window), item);
                }
                return;
            }
            if (item == "gold_nugget") {//idk man sometimes it happens
                this.bot.betterClick(SLOT_MAIN_ITEM, 0, 0);
                undefinedCount++
                return;
            } else if (item == "potato") {
                this.bot.betterWindowClose();
                this.state.set(null);
                this.state.setAction();
            }
            if ((!this.bedFailed && !config.bedSpam && this.currentlyTimingBed) || getWindowName(window) !== 'BIN Auction View' || item !== 'bed') {
                clearInterval(bedSpam);
                debug('Clearing bed spam', this.bedFailed, config.bedSpam, this.currentlyTimingBed, getWindowName(window), item);
                return;
            };
            this.bot.betterClick(SLOT_MAIN_ITEM, 0, 0);
        }, clickDelay)
    }

    initQueue() {
        setInterval(async () => {
            const current = this.state.getHighest();
            if (!current) return;
            const currentTime = Date.now();
            if (!this.bot.currentWindow && currentTime > this.state.getTime() + delay && !this.state.get()) {
                switch (current.state) {
                    case "buying": {
                        const { finder, profit, itemName, auctionID, price } = current.action;
                        this.openExternalFlip(auctionID, profit, finder, itemName, null, price);
                        logmc(`§6[§bTPM§6] Opening ${itemName}§6 from queue (${formatNumber(profit)} profit)!`);
                        break;
                    }
                    case "claiming":
                        this.bot.chat(current.action);
                        break;
                    case "listing": {
                        const { profit, finder, itemName, tag, auctionID, price, weirdItemName } = current.action;
                        const shouldList = this.relist.checkRelist(profit, finder, itemName, tag, auctionID, price, weirdItemName, true);
                        if (!shouldList) {
                            if (shouldList == 'remove') this.state.queueRemove();
                            return;
                        }
                        this.relist.listAuction(auctionID, price, profit, weirdItemName, tag);
                        break;
                    }
                    case "listingNoName": {
                        const { auctionID, price, time, inv } = current.action;
                        if (!this.relist.externalListCheck()) return;
                        const { relist: relistObject } = this.webhook.getObjects();
                        try {
                            var { weirdItemName, pricePaid, tag } = relistObject[auctionID]; //ew var
                        } catch {
                            var weirdItemName = auctionID; //ew var
                            var pricePaid = 0; //ew var
                        }
                        let profit = IHATETAXES(price) - pricePaid;
                        this.relist.listAuction(auctionID, price, profit, weirdItemName, tag, time || null, true, inv);
                        current.state = 'listing';
                        break;
                    }
                    case "delisting": {
                        const { auctionID, itemUuid } = current.action;
                        const { relist: relistObject } = this.webhook.getObjects();
                        try {
                            var { weirdItemName } = relistObject[auctionID]; //ew var
                        } catch {
                            var weirdItemName = auctionID; //ew var
                        }
                        this.relist.delistAuction(itemUuid, auctionID, weirdItemName);
                        break;
                    }
                    case "death": {
                        this.state.set('DEAAAATHHH');
                        debug('dying', this.bot.username);
                        this.bot.quit();
                        // this.coflSocket.closeSocket();
                        this.coflSocket.kill();
                        removeIgn(this.ign);
                        this.bot.removeAllListeners();
                        try {
                            await betterOnce(this.bot, "end");//Ok so the await here like lowkey breaks everyything so I remove the old queue before
                        } catch (e) {
                            debug(`Error disconnecting`, e);
                            for (let i = 0; i < 10; i++) {
                                this.bot.end();//just spam it!
                            }
                        }
                        logmc(`§6[§bTPM§6] §c${this.ign} is now dead. May he rest in peace.`)
                        break;
                    }
                    case "externalBuying": {
                        const { finder, profit, itemName, auctionID, startingBid, tag } = current.action;
                        this.openExternalFlip(auctionID, profit, finder, itemName, tag, startingBid);
                        current.state = 'buying';
                        break;
                    }
                    case "bids": {
                        this.relist.checkBids();
                        break;
                    }
                    case "expired": {
                        const itemUuid = current.action;
                        this.relist.removeExpiredAuction(itemUuid);
                        break;
                    }
                    case "bank": {
                        const { amount, withdraw, personal } = current.action;
                        this.bank.coins(withdraw, personal, amount);
                        break;
                    }
                }
                this.state.setAction(currentTime);
                this.state.set(current.state);
                this.state.queueRemove();
                debug(`QUEUE: Running ${current}`);
            }
        }, delay)
    }

    setFromCoflSocket(newState = false) {
        this.fromCoflSocket = newState;
    }

}

module.exports = AutoBuy;