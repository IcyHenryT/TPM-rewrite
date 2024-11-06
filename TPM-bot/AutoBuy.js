const { getPackets } = require('./packets.js');
const { config } = require('../config.js');
const { stripItemName, IHATETAXES, normalizeDate, getWindowName, isSkin, sleep, normalNumber, getSlotLore, sendDiscord, noColorCodes, betterOnce} = require('./Utils.js');
const { logmc, debug, removeIgn, error } = require('../logger.js');
let { delay, waittime, skip: skipSettings, clickDelay, bedSpam, delayBetweenClicks, angryCoopPrevention: coop } = config;
let { always: useSkip, minProfit: skipMinProfit, userFinder: skipUser, skins: skipSkins } = skipSettings;
skipMinProfit = normalNumber(skipMinProfit);
delayBetweenClicks = delayBetweenClicks || 3;

class AutoBuy {

    constructor(bot, WebhookManager, coflSocket, ign, state, relist) {
        this.bot = bot;
        this.webhook = WebhookManager;
        this.coflSocket = coflSocket;
        this.ws = coflSocket.getWs();
        this.ign = ign;
        this.state = state;
        this.relist = relist;
        this.recentProfit = 0;
        this.recentFinder = 0;
        this.recentlySkipped = false;
        this.recentName = null;
        this.bedFailed = false;
        this.currentOpen = null;
        this.packets = getPackets(ign);
        this.currentlyTimingBed = false;//failsafe

        this.flipHandler();
        this.initQueue();
    }

    async flipHandler() {
        const { webhook, bot, ws, state, packets } = this;
        let firstGui;

        bot._client.on('open_window', async (window) => {
            const windowID = window.windowId;
            const nextWindowID = windowID === 100 ? 1 : windowID + 1
            const windowName = window.windowTitle;
            debug(`Got new window ${windowName}, ${windowID}`);
            packets.confirmClick(windowID);
            if (windowName === '{"italic":false,"extra":[{"text":"BIN Auction View"}],"text":""}' && state.get() !== 'listing') {
                const finderCheck = this.recentFinder === "USER" && skipUser;
                const skinCheck = isSkin(this.recentName) && skipSkins;
                const profitCheck = this.recentProfit > skipMinProfit;
                let useSkipOnFlip = profitCheck || skinCheck || finderCheck || useSkip;
                firstGui = Date.now();
                webhook.setBuySpeed(firstGui);
                let item = (await this.itemLoad(31))?.name;
                if (item === 'gold_nugget') {
                    packets.click(31, windowID, 371);
                    bot.betterClick(31, 0, 0);
                    if (useSkipOnFlip) {
                        packets.click(11, nextWindowID, 159);
                        this.recentlySkipped = true;
                        if (useSkip) {
                            logmc(`§6[§bTPM§6] §cUsed skip because you have skip always enabled in config`);
                            return;
                        }
                        let skipReasons = [];
                        if (finderCheck) skipReasons.push('it was a user flip');
                        if (profitCheck) skipReasons.push('it was over skip min profit');
                        if (skinCheck) skipReasons.push('it was a skin');
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
                        const secondItem = (await this.itemLoad(31, true))?.name;
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
                            const lore = getSlotLore(bot.currentWindow.slots[13]);
                            debug(`lore: ${lore}`);
                            if (!lore) {
                                logmc(`§6[§bTPM§6] §cNot claiming sold auction because I can't find the lore :( so idk if you sold it or your coop.`);
                                if (bot.currentWindow) debug(JSON.stringify(bot.currentWindow.slots[13]));
                                state.set(null);
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
                                bot.betterClick(31);
                                this.relist.declineSoldAuction();
                            } else {
                                logmc("§6[§bTPM§6] §cItem was sold by coop! Not claiming.");
                                bot.betterWindowClose();
                            }
                        } else {
                            bot.betterClick(31);
                            this.relist.declineSoldAuction();
                        }
                        state.set(null);
                        state.setAction(firstGui);
                        break;
                    case "poisonous_potato":
                        logmc(`§6[§bTPM§6]§c Too poor to buy it :(`);
                        bot.betterWindowClose();
                        state.set(null);
                        state.setAction(firstGui);
                        break;
                    case "gold_ingot":
                        debug(`INGOT!!!`);
                        debug(JSON.stringify(bot.currentWindow?.slots[31]));
                        bot.betterWindowClose();
                        state.set(null);
                        state.setAction(firstGui);
                        sendDiscord({
                            title: 'Gold ingot madness',
                            color: 2615974,
                            fields: [
                                {
                                    name: '',
                                    value: "send the log of this to icyhenryt please",
                                }
                            ],
                            thumbnail: {
                                url: `https://mc-heads.net/head/${this.bot.uuid}.png`,
                            },
                            footer: {
                                text: `TPM Rewrite`,
                                icon_url: 'https://media.discordapp.net/attachments/1223361756383154347/1263302280623427604/capybara-square-1.png?ex=6699bd6e&is=66986bee&hm=d18d0749db4fc3199c20ff973c25ac7fd3ecf5263b972cc0bafea38788cef9f3&=&format=webp&quality=lossless&width=437&height=437',
                            }
                        })
                        break;
                    case "stained_glass_pane":
                        if (state.get() === 'delisting') this.bot.betterClick(33);
                        else {
                            bot.betterWindowClose();
                            state.set(null);
                            state.setAction(firstGui);
                        }
                        break;
                    case "gold_nugget":
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
                if (!this.recentlySkipped) bot.betterClick(11, 0, 0);
                state.set(null);
                await bot.waitForTicks(3);
                while (getWindowName(bot.currentWindow) === 'Confirm Purchase') {//Sometimes click doesn't register
                    bot.betterClick(11, 0, 0);
                    await bot.waitForTicks(5);
                }
            } else if (windowName === '{"italic":false,"extra":[{"text":"Auction View"}],"text":""}') {//failsafe if they have normal auctions turned on
                bot.betterWindowClose();
                state.set(null);
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
            if (ready) packets.sendMessage(`/viewauction ${auctionID}`); this.windowResponse(Date.now())//Put this earlier so that it doesn't get slowed down (but it's kinda ugly :( )
            const { finder, purchaseAt, target, startingBid, tag, itemName } = data;//I hate this :(
            let weirdItemName = stripItemName(itemName);
            let profit = IHATETAXES(target) - startingBid;
            let ending = new Date(normalizeDate(purchaseAt)).getTime();
            let bed = 'NUGGET';
            if (ready) {
                logmc(`§6[§bTPM§6] §6Opening ${itemName}`);
                this.currentOpen = auctionID;
                this.recentProfit = profit;
                this.recentFinder = finder;
                this.recentName = itemName;
                this.bedFailed = false;
                state.set('buying');
                state.setAction(currentTime);
                if (currentTime < ending) {
                    if (!bedSpam) this.timeBed(ending, auctionID);
                    bed = 'BED';
                }
            } else if (currentState !== 'moving' && currentState !== 'getting ready') {
                let reasons = [];
                if (!windowCheck) reasons.push(`${getWindowName(bot.currentWindow)} is open`);
                if (!stateCheck) reasons.push(`state is ${currentState}`);
                if (!lastUpdated) reasons.push(`last action was too recent`);
                state.queueAdd({ finder, profit, tag, itemName, auctionID }, 'buying', 0);
                logmc(`§6[§bTPM§6] §3${itemName}§3 added to pipeline because ${reasons.join(' and ')}!`);
            } else {
                logmc(`§6[§bTPM§6] §cCan't open flips while ${currentState} :(`);
            }
            webhook.objectAdd(weirdItemName, startingBid, target, profit, auctionID, bed, finder, itemName, tag);
            debug(`Found flip ${auctionID}`);
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

    openExternalFlip(ahid, profit, finder, itemname, price = null) {//queue and buy from discord (maybe webpage in future?) ONLY CALL IF READY!!!
        this.packets.sendMessage(`/viewauction ${ahid}`);
        this.recentFinder = finder;
        this.recentProfit = profit;
        this.currentOpen = ahid;
        this.bedFailed = true;
        if (price) {//For queue flips, don't include price
            this.webhook.objectAdd(stripItemName(itemname), price, null, null, ahid, 'EXTERNAL', finder);
        }
    }

    async timeBed(ending, currentID) {
        const start = Date.now();

        debug(`Timing bed ${currentID}`);
        this.currentlyTimingBed = true;

        await sleep(ending - start - waittime);
        for (let i = 0; i < 5; i++) {
            if (getWindowName(this.bot.currentWindow)?.includes('BIN Auction View') && this.currentOpen === currentID) {
                this.bot.betterClick(31, 0, 0);
                this.binClickResponse(Date.now())
                debug(`Clicking ${currentID} bed`);
                await sleep(delayBetweenClicks);
            } else {
                break;
            }
        }

        await sleep(5000);
        const windowName = getWindowName(this.bot.currentWindow)
        if (windowName?.includes('BIN Auction View') && this.currentOpen === currentID) {
            this.bot.closeWindow(this.bot.currentWindow);
            this.state.set(null);
            logmc(`§6[§bTPM§6] §cBed timing failed and we had to abort the auction :( Please lower your waittime if this continues or turn on bedspam`);
        } else if (!windowName && this.currentOpen === currentID && this.state.get() === 'buying') {
            logmc(`§6[§bTPM§6] §cWindow somehow closed after bed timing (possibly died)`);
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
                this.bot.betterClick(31, 0, 0);
                this.binClickResponse(Date.now())
                undefinedCount++
                return;
            }
            if ((!this.bedFailed && !config.bedSpam && this.currentlyTimingBed) || getWindowName(window) !== 'BIN Auction View' || item !== 'bed') {
                clearInterval(bedSpam);
                debug('Clearing bed spam', this.bedFailed, config.bedSpam, this.currentlyTimingBed, getWindowName(window), item);
                return;
            };
            this.bot.betterClick(31, 0, 0);
            this.binClickResponse(Date.now())
        }, clickDelay)
    }

    initQueue() {
        setInterval(() => {
            const current = this.state.getHighest();
            if (!current) return;
            const currentTime = Date.now();
            if (!this.bot.currentWindow && currentTime > this.state.getTime() + delay && !this.state.get()) {
                switch (current.state) {
                    case "buying": {
                        const { finder, profit, itemName, auctionID } = current.action;
                        this.openExternalFlip(auctionID, profit, finder, itemName);
                        break;
                    }
                    case "claiming":
                        this.bot.chat(current.action);
                        break;
                    case "listing": {
                        const { profit, finder, itemName, tag, auctionID, price, weirdItemName } = current.action;
                        if (!this.relist.checkRelist(profit, finder, itemName, tag, auctionID, price, weirdItemName, true)) return;
                        this.relist.listAuction(auctionID, price, profit, weirdItemName);
                        break;
                    }
                    case "listingNoName": {
                        const { auctionID, price } = current.action;
                        if (!this.relist.externalListCheck()) {
                            debug(`Didn't pass relist check`);
                            return;
                        };
                        const { relist: relistObject } = this.webhook.getObjects();
                        try {
                            var { weirdItemName, pricePaid } = relistObject[auctionID]; //ew var
                        } catch {
                            var weirdItemName = auctionID; //ew var
                            var pricePaid = 0; //ew var
                        }
                        let profit = IHATETAXES(price) - pricePaid;
                        this.relist.listAuction(auctionID, price, profit, weirdItemName, true);
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
                        this.bot.quit();
                        this.coflSocket.closeSocket();
                        removeIgn(this.ign);
                        logmc(`§6[§bTPM§6] §c${this.ign} is now dead. May he rest in peace.`)
                    }
                }
                this.state.setAction(currentTime);
                this.state.set(current.state);
                this.state.queueRemove();
                debug(`QUEUE: Running ${current}`);
            }
        }, delay)
    }

    async windowResponse(callTime){
        await betterOnce(this.bot._client, `open_window`);
        logmc(`§6[§bTPM§6] §cResponse time from /ah to window was: ${Date.now() - callTime}`)
    }
    
    async binClickResponse(callTime){
        await betterOnce(this.bot._client, 'chat', msg => {
            return msg.message == `{"italic":false,"extra":[{"color":"red","text":""},{"color":"red","text":"This BIN sale is still in its grace period!"}],"text":""}`
        })
        logmc(`§6[§bTPM§6] §cResponse time from click to grace: ${Date.now() - callTime}`)
    }
    

}

module.exports = AutoBuy;