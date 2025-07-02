const { config } = require('../config.js');
const { sleep, betterOnce, getWindowName, noColorCodes, normalTime, getSlotLore, sendDiscord, onlyNumbers, addCommasToNumber, normalNumber, isSkinned, formatNumber } = require('./Utils.js');
const { logmc, error, debug } = require('../logger.js');
let { useCookie, relist, percentOfTarget, listHours, doNotRelist, useItemImage, autoCookie, roundTo, angryCoopPrevention } = config;
let { profitOver, skinned, tags, finders, stacks: stackedListing, pingOnFailedListing, drillWithParts, expiredAuctions: relistExpired, relistMode } = doNotRelist;
autoCookie = normalTime(autoCookie) / 1000;
profitOver = normalNumber(profitOver);
const axios = require('axios');

const coopRegexPlayers = /Co-op with (\d+) players:/;
const coopRegexSinglePlayer = /Co-op with (?:\[.*\]\s*)?([\w]+)/;

function calcDurationVisual(hours) {
    let itemDurationVisual = `${hours} Hour`;
    if (hours > 24) {
        if (hours > 336) {
            itemDurationVisual = `14 Days`;
        } else {
            itemDurationVisual = `${Math.floor(hours / 24).toString()} Day`
        }
    }
    return itemDurationVisual;
}

function calcListHours(price) {
    if (!Array.isArray(listHours)) return listHours;//Failsafe for people who haven't updated their config
    for (let i = 0; i < listHours.length; i += 3) {
        let lowerBound = normalNumber(listHours[i]);
        let upperBound = normalNumber(listHours[i + 1]);
        let percent = normalNumber(listHours[i + 2]);//why not use normal number!

        if (price >= lowerBound && price < upperBound) {
            return percent;
        }
    }
    logmc(`§6[§bTPM§6]§c Failed to find listing time for ${addCommasToNumber(price)}! Please change your config :(`)
    return listHours[3];
}

class RelistHandler {

    constructor(bot, state, tpm, updateSold, coflWs) {
        this.bot = bot;
        this.state = state;
        this.useRelist = relist;
        this.tpm = tpm;
        this.updateSold = updateSold;
        this.coflWs = coflWs;
        this.setFromCoflSocket = null;//So this is a function from AutoBuy and basically yea
        this.currentAuctions = 0;
        this.maxSlots = 14;
        this.hasCookie = true;
        this.cookieTime = null;
        this.ready = false;
        this.savedData = state.getFile("SavedData", `${bot.uuid}.json`);
        this.savedItems = [];
        this.getReady();

        this.removeExpiredAuction = this.removeExpiredAuction.bind(this);
        this.getNbtPrice = this.getNbtPrice.bind(this);
    }

    giveSetCoflSocket(func) {
        this.setFromCoflSocket = func;
    }

    declineSoldAuction() {//cba to add message listener twice so this will have to do
        if (this.ready) {
            this.currentAuctions--;
            debug(`Removing 1 sold auction`);
        }
    }

    increaseSlots() {//coop listing stuff
        if (this.ready) {
            this.currentAuctions++;
            debug(`Adding 1 listed auction`);
        }
    }

    getReady() {
        if (!useCookie) {
            this.ready = true;
            return;
        }
        const { bot, state } = this;
        var check = async () => {
            try {
                await sleep(20_500);
                if (state.get() == 'getting ready') {
                    bot.getPurse();
                    debug('getting ready!')
                    bot.off('spawn', check);
                    bot.chat('/profiles');
                    await betterOnce(bot, "windowOpen");
                    const profileLore = getSlotLore(bot.currentWindow?.slots?.find(block => block?.name === 'emerald_block'));
                    let coopLine = profileLore.find(line => line.includes('Co-op with'));
                    if (coopLine) {
                        coopLine = noColorCodes(coopLine);
                        const singleMatch = coopLine.match(coopRegexSinglePlayer);
                        const multiMatch = coopLine.match(coopRegexPlayers);
                        if (multiMatch) {
                            const numberOfPlayers = parseInt(multiMatch[1]);
                            this.maxSlots += numberOfPlayers * 3;
                        } else if (singleMatch) {
                            this.maxSlots += 3;
                        } else {
                            error('wtf is your coop', JSON.stringify(profileLore));
                        }
                    }

                    debug(`max slots set to ${this.maxSlots}`)

                    bot.betterWindowClose();

                    await sleep(250);

                    bot.chat('/ah');
                    await betterOnce(bot, 'windowOpen');
                    await sleep(250);
                    debug(`Got AH, opening bids menu`);
                    bot.betterClick(15);
                    await betterOnce(bot, 'windowOpen');
                    let claimAll = null;
                    let soldAuctions = [];//if there's no cauldron we click this
                    let expiredAuctons = [];
                    bot.currentWindow.slots.forEach(slot => {
                        const lore = getSlotLore(slot);
                        if (!lore) return;
                        const endsInTime = lore.find(line => line.includes('Ends in:'));
                        const BIN = lore.find(line => noColorCodes(line).includes('Buy it now'));
                        let soldByCoop = false;
                        if (endsInTime && BIN) {
                            const endTime = normalTime(endsInTime);
                            setTimeout(() => {//Remove auctions when they expire
                                state.queueAdd(this.getItemUuid(slot), "expired", 3);
                            }, endTime)
                        }
                        const hasSeller = lore.find(line => line.includes('Seller:'));
                        if (hasSeller) {
                            this.currentAuctions++;
                            soldByCoop = !hasSeller.includes(bot.username);
                        }
                        const hasBuyer = lore.find(line => line.includes('Buyer:'));
                        if (hasBuyer) {
                            if (soldByCoop && angryCoopPrevention) return;
                            this.currentAuctions--;
                            soldAuctions.push(slot);
                            this.updateSold();
                            return;
                        }
                        const expired = lore.find(line => line.includes('Expired'));
                        if (expired) {
                            expiredAuctons.push(slot);
                            return;
                        }
                        if (slot?.name === 'cauldron') claimAll = slot.slot;
                    });

                    if (claimAll) {
                        bot.betterClick(angryCoopPrevention ? claimAll - 1 : claimAll);
                    } else if (soldAuctions.length == 1) {
                        bot.betterClick(soldAuctions[0].slot);
                    } else if (expiredAuctons.length == 1) {
                        bot.betterClick(expiredAuctons[0].slot);
                    }

                    debug(`Currently has ${this.currentAuctions} auctions`);

                    let webhookMessage = "";

                    let totalSold = 0;

                    soldAuctions.forEach(auction => {
                        const lore = getSlotLore(auction);
                        const itemName = noColorCodes(auction.nbt.value.display.value.Name.value);
                        const soldLine = noColorCodes(lore.find(line => line.includes('Sold for:')));
                        const soldFor = onlyNumbers(soldLine);
                        totalSold += soldFor;
                        debug(soldLine);
                        debug(soldFor);
                        webhookMessage += `Collected \`${addCommasToNumber(soldFor)} coins\` for selling \`${itemName}\`\n`;
                    })

                    expiredAuctons.forEach(auction => {
                        const lore = getSlotLore(auction);
                        const itemName = noColorCodes(auction.nbt.value.display.value.Name.value);
                        const priceLine = noColorCodes(lore.find(line => line.includes('Buy it now') || line.includes('Starting bid')));
                        const price = onlyNumbers(priceLine);
                        webhookMessage += `Claimed \`${itemName}\` because it expired (It cost \`${formatNumber(price)}\` coins)`
                    })


                    await sleep(5000)//need a very long sleep because if a sold auction is claimed from the claim all then it closes the current GUI open
                    bot.chat('/sbmenu')//cookie. At this point they are forced to have a cookie because of the AH stuff so we can assume it

                    await betterOnce(bot, 'windowOpen');

                    try {
                        var cookieLore = getSlotLore(bot.currentWindow.slots[51]);
                        let duration = cookieLore.find(line => line.includes('Duration'));
                        var cookieTime = normalTime(duration);
                        this.cookieTime = cookieTime;
                        debug(`Cookie time`, cookieTime);
                        bot.betterWindowClose();
                        await this.buyCookie(cookieTime / 1000);
                        var cookieEnd = Math.round((Date.now() + cookieTime) / 1000);
                    } catch (e) {
                        bot.betterWindowClose();
                        error(`Error checking cookie`, e);
                    }

                    let bids = 0;

                    try {
                        bot.chat('/ah');
                        await betterOnce(bot, 'windowOpen');
                        bot.betterClick(13);//Open bids
                        try {
                            await betterOnce(bot, 'windowOpen');
                        } catch (e) {
                            debug(`Error opening bids, prob not a real error`, e);
                            throw new Error(`No bids so like I can't check them yk! Dw this isn't a real error`);
                        }

                        let uuids =
                            bot.currentWindow.slots
                                .map(slot => {
                                    if (slot?.slot < bot.currentWindow.slots.length - 36) {
                                        return this.getItemUuid(slot);
                                    }
                                    return null;
                                })
                                .filter(uuid => uuid !== null)
                        bids = uuids.length;
                        for (const uuid in this.savedData.bidData) {
                            debug(`Checking ${uuid}`);
                            if (uuids.includes(uuid)) continue;
                            debug(`Deleting UUID`);
                            delete this.savedData.bidData[uuid];//Remove old data
                        }
                        state.saveQueue(this.savedData.bidData);
                    } catch (e) {
                        error(`Error checking bids`, e);
                    }
                    bot.betterWindowClose();

                    sendDiscord({
                        title: `${this.bot.username} is now ready!`,
                        color: 8771327,
                        fields: [
                            {
                                name: '',
                                value: `>>> **Auction Slots:** \`${this.currentAuctions}\`/\`${this.maxSlots}\`\n**Cofl Tier:** ${this.coflWs.getAccountTier()}\n**Cofl expires <t:${this.coflWs.getAccountEndingTime()}:R>**\n**Booster Cookie ends <t:${cookieEnd}:R>**\n**Bids:** \`${bids}\`\n**Connection ID:** \`${this.coflWs.getConnectionId()}\``,
                            }
                        ],
                        thumbnail: {
                            url: this.bot.head,
                        },
                        footer: {
                            text: `TPM Rewrite - Purse: ${addCommasToNumber(bot.getPurse(true) + totalSold)}`,
                            icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                        }
                    }, useItemImage ? this.bot.head : null, false, this.bot.username);

                    if (webhookMessage) {
                        sendDiscord({
                            title: 'Claimed sold items!',
                            color: 16731310,
                            fields: [
                                {
                                    name: '',
                                    value: `${webhookMessage}${soldAuctions.length == 1 ? '' : `\nCollected \`${addCommasToNumber(totalSold)}\` coins in total!\nClaimed \`${expiredAuctons.length}\` expired auctions!`}`,
                                }
                            ],
                            thumbnail: {
                                url: this.bot.head,
                            },
                            footer: {
                                text: `TPM Rewrite - Purse: ${addCommasToNumber(bot.getPurse(true) + totalSold)}`,
                                icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                            }
                        }, useItemImage ? this.bot.head : null, false, this.bot.username)
                    } else {
                        bot.betterWindowClose();
                    }

                    state.set(null);
                    setTimeout(() => {
                        this.ready = true;
                    }, 5000)
                    this.coflWs.sendScoreboard();

                } else {
                    debug('not getting ready!!!');
                }
            } catch (e) {
                error(`Error getting relist ready! Not going to use relist for ${bot.username}`, e);
                this.useRelist = false;
                bot.betterWindowClose();
                state.set(null);
                this.ready = true;
            }
        }

        bot.on('spawn', check);
    }

    //Set inventory to the itemUUID if using it
    async listAuction(auctionID, price, profit, weirdItemName, tag, listingTime = null, override = false, inventory = false) {
        if (!this.useRelist && !override) return;
        debug(`Listing ${auctionID} for ${price}. From inventory : ${inventory}`);
        if (!listingTime) listingTime = calcListHours(price);
        let currentVisual = calcDurationVisual(listingTime);
        try {
            const { state, bot } = this;
            state.set('listing');
            if (!inventory) {
                var { uuid: itemUuid, count: itemCount, nbt } = await this.claimItem(auctionID);
            } else {
                let item = bot.inventory.slots.find(slot => this.getItemUuid(slot) === inventory);
                debug("inv listing item", JSON.stringify(item));
                var itemUuid = inventory;
                var itemCount = item.count;
                var nbt = item.nbt.value;
            }

            bot.chat('/ah');
            await betterOnce(bot, 'windowOpen');
            await sleep(500);
            const uuids = [];//item not found debugging
            for (const slot of bot.currentWindow.slots) {
                if (!slot || !slot.nbt) continue; // Skip empty or invalid slots
                const uuid = this.getItemUuid(slot);
                const count = slot.count;
                if (uuid === itemUuid) {
                    debug(`Found item in slot ${slot.slot}`);
                    if (count !== itemCount) {
                        if (!stackedListing) throw new Error('It was a stacked item that was changed :(');
                        const pricePerItem = price / itemCount;
                        price = pricePerItem * count; // Adjust price for stacked items
                        logmc(`§6[§bTPM§6]§c ${weirdItemName} had ${itemCount} in slot but combined with another item so there's now ${count}. Listing price is now ${price}`);
                    }
                    if (this.checkDrillParts(slot.nbt.value) && drillWithParts) {
                        bot.betterWindowClose();
                        this.removeDrillParts(auctionID, uuid, slot.nbt.value);
                        logmc(`§6[§bTPM§6]§c ${weirdItemName} has drill parts! Removing them!!!`);
                        return;
                    }
                    await sleep(2500);
                    bot.betterClick(slot.slot);
                    break;
                }
            }
            try { await betterOnce(bot, 'windowOpen') } catch { };
            debug(getWindowName(bot.currentWindow));
            if (getWindowName(bot.currentWindow) === 'Create Auction') {
                bot.betterClick(48);
                await sleep(250)
            } else if (getWindowName(bot.currentWindow).includes('Auction House')) {//includes allows for coop as well. This means item in slot most likely
                debug(uuids.join(' '));
                logmc(`§6[§bTPM§6] §cItem likely in slot already :(`);
                bot.betterClick(15);
                await betterOnce(bot, 'windowOpen');
                let createSlot = bot.currentWindow.slots.find(obj => obj?.nbt?.value?.display?.value?.Name?.value?.includes('Create Auction'));
                createSlot = createSlot.slot;
                debug(`Found create slot ${createSlot}`);
                if (!createSlot) {
                    throw new Error(`Failed to get create slot :(`);
                }
                bot.betterClick(createSlot);
                await betterOnce(bot, 'windowOpen');
                bot.betterClick(13);
                throw new Error(`Item in slot so can't list but I removed it!`);
            }

            let relistpercent = 100;
            if (!override) {
                relistpercent = this.calcPriceCut(price);
            }

            debug(relistpercent)

            const listPrice = override ? Math.round(price) : this.roundNumber(relistpercent * price / 100, roundTo);
            if (listPrice < 500) {
                throw new Error(`Most likely incorrect listing price ${listPrice}`);
            }

            debug(listPrice);

            bot.betterClick(31);//set price
            await sleep(250);
            bot.editSign(`"${listPrice}"`);
            await betterOnce(bot, 'windowOpen');
            bot.betterClick(33);//set price
            await betterOnce(bot, 'windowOpen');
            bot.betterClick(16);//set price
            await sleep(350);
            bot.editSign(listingTime.toString());
            await betterOnce(bot, 'windowOpen');

            const priceSlot = bot.currentWindow.slots[31]?.nbt?.value?.display?.value?.Name?.value;
            const timeSlot = bot.currentWindow.slots[33]?.nbt?.value?.display?.value?.Name?.value;

            if (!priceSlot.includes(addCommasToNumber(listPrice)) || !timeSlot.includes(currentVisual)) {//acts as a window dectector too!
                throw new Error(`Incorrect pricing or time ${priceSlot} ${timeSlot} not having ${addCommasToNumber(listPrice)} or ${currentVisual}`);
            }

            bot.betterClick(29);
            await betterOnce(bot, 'windowOpen');
            bot.betterClick(11);
            await betterOnce(bot, 'windowOpen');
            bot.betterWindowClose();
            state.set(null);
            state.setAction();
            this.currentAuctions++;

            this.tpm.send(JSON.stringify({
                type: "listed",
                data: JSON.stringify({
                    auctionID,
                    purse: formatNumber(bot.getPurse()),
                    username: bot.username,
                    message: `Listed [\`${weirdItemName}\`](https://sky.coflnet.com/auction/${auctionID}) for \`${addCommasToNumber(listPrice)}\` (\`${formatNumber(profit)}\` profit) [Slots: ${this.currentAuctions}/${this.maxSlots}]`,
                    uuid: this.bot.uuid,
                    itemUuid: itemUuid,
                    itemTag: tag,
                    useItemImage: useItemImage
                })
            }), false)

            setTimeout(() => {
                state.queueAdd(itemUuid, "expired", 3);
            }, listingTime * 3.6e+6)

        } catch (e) {
            if (getWindowName(this.bot.currentWindow)?.includes('Create')) this.bot.betterClick(13);//remove item from slot
            await sleep(250);
            error(`Error listing`, e);
            this.bot.betterWindowClose();
            this.state.set(null);
            this.state.setAction();
        }
    }

    getItemUuid(slot, message = false) {
        let uuid = slot?.nbt?.value?.ExtraAttributes?.value?.uuid?.value;
        if (!uuid) {
            if (message) logmc(`§6[§bTPM§6]§c Failed to get item uuid :( Resorting to item tag`);
            uuid = this.getName(slot?.nbt?.value?.ExtraAttributes?.value);
        }
        return uuid;
    }

    getName(ExtraAttributes) {
        if (!ExtraAttributes) return null;
        let id = ExtraAttributes.id?.value;
        const split = id?.split('_');
        const first = split[0];
        if (first === 'RUNE' || first === "UNIQUE") {//Don't want to list incorrect rune
            id = `${Object.keys(ExtraAttributes?.runes?.value)[0]}_RUNE`;
        }
        return id;
    }

    async addSavedData(auctionID, target, finder) {
        if (this.savedItems.includes(auctionID)) return;

        this.savedItems.push(auctionID);
        setTimeout(async () => {
            try {
                debug(`Saving ${auctionID}, target: ${target}, finder ${finder}`)
                const data = (await axios.get(`https://sky.coflnet.com/api/auction/${auctionID}`)).data;
                debug(JSON.stringify(data));
                if (!data.flatNbt.uuid) throw new Error(`No itemUUID for ${auctionID}. Was adding to saved bids`);
                const toSave = {};
                toSave.time = Date.now();
                if (finder !== "USER") toSave.target = target;
                else toSave.target = "It was user finder";
                toSave.auctionID = auctionID;
                this.savedData.bidData[data.flatNbt.uuid] = toSave;
                this.state.saveQueue(this.savedData.bidData);
            } catch (e) {
                error(e);
            }
        }, 60_000)//wait for nbt to sync

    }

    checkRelist(profit, finder, itemName, tag, auctionID, price, weirdItemName, fromQueue = false) {
        this.addSavedData(auctionID, price + profit, finder);
        if (!this.hasCookie) return false;
        if (!this.useRelist) {
            this.sendTPMSocket(auctionID, `relist is off`, itemName);
            return 'remove';
        }
        let reasons = [];
        if (tags.includes(tag)) reasons.push(`${tag} is a blocked tag`);
        if (profit > profitOver) reasons.push(`profit is over ${profitOver}`);
        if (isSkinned(itemName) && skinned) reasons.push(`it's skinned`);
        if (finders.includes(finder)) reasons.push(`${finder} is a blocked finder`);
        if (profit <= 0) reasons.push('proft is under 0');

        if (reasons.length > 0) {
            logmc(`§6[§bTPM§6] §c${itemName}§c is not being listing because ${reasons.join(' and ')}!`);
            this.sendTPMSocket(auctionID, reasons.join(' and '), itemName);
            return false;
        }

        if (this.currentAuctions == this.maxSlots || this.state.get() || this.bot.currentWindow) {
            if (!fromQueue) this.state.queueAdd({ profit, finder, itemName, tag, auctionID, price, weirdItemName }, 'listing', 10);
            return false;
        }

        return true;
    }

    externalListCheck() {
        return this.currentAuctions !== this.maxSlots;
    }

    sendTPMSocket(auctionID, reasons, itemName) {
        this.tpm.send(JSON.stringify({
            type: "failedList",
            data: JSON.stringify({
                auctionID: auctionID,
                reasons: reasons,
                itemName: itemName,
                username: this.bot.username,
                uuid: this.bot.uuid,
                ping: pingOnFailedListing,
            })
        }), false)
    }

    turnOffRelist() {//For when cookie runs out mid session
        debug(`Turning off relist`)
        this.useRelist = false;
        this.hasCookie = false;
    }

    getGottenReady() {//freaky ahh name
        return this.ready;
    }

    checkDrillParts(nbt) {
        if (!nbt) return false;
        try {
            const ExtraAttributes = nbt.ExtraAttributes?.value;
            if (ExtraAttributes.drill_part_fuel_tank) return true;//"Hey man why don't you use an OR state ment!!!" cause it would be so long
            if (ExtraAttributes.drill_part_engine) return true;
            if (ExtraAttributes.drill_part_upgrade_module) return true;
            return false;
        } catch (e) {
            debug(`Error checking parts: `, e);
            return false;
        }
    }

    async delistAuction(itemUuid, auctionID, weirdItemName) {
        if (!useCookie) return;
        this.state.set('delisting');
        const { bot } = this;
        try {
            bot.chat('/ah');
            await betterOnce(bot, 'windowOpen');
            bot.betterClick(15);
            await betterOnce(bot, 'windowOpen');
            debug(itemUuid)
            bot.currentWindow.slots.forEach(slot => {
                const uuid = this.getItemUuid(slot);
                debug(uuid, uuid === itemUuid)
                if (uuid === itemUuid) {
                    bot.betterClick(slot.slot);
                }
            })

            await betterOnce(bot._client, 'open_window');//Faster cause if we use windowOpen then it won't find it sometimes (open_window is used to claim it so yea)

            sendDiscord({
                title: 'Delisted auction',
                color: 13320532,
                fields: [
                    {
                        name: '',
                        value: `Delisted [\`${weirdItemName}\`](https://sky.coflnet.com/a/${auctionID})`,
                    }
                ],
                thumbnail: {
                    url: this.bot.head,
                },
                footer: {
                    text: `TPM Rewrite`,
                    icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                }
            }, useItemImage ? this.bot.head : null, false, this.bot.username);
            this.declineSoldAuction();

            await sleep(500);
            bot.betterWindowClose();//ensure window closes just in case it didn't delist
            this.state.set(null);
            this.state.setAction();
        } catch (e) {
            await sleep(250);
            error(`Error delisting`, e);
            bot.betterWindowClose();
            this.state.set(null);
            this.state.setAction();
        }
    }

    calcPriceCut(price) {
        for (let i = 0; i < percentOfTarget.length; i += 3) {
            let lowerBound = normalNumber(percentOfTarget[i]);
            let upperBound = normalNumber(percentOfTarget[i + 1]);
            let percent = normalNumber(percentOfTarget[i + 2]);

            if (price >= lowerBound && price < upperBound) {
                return percent;
            }
        }
    }

    roundNumber(number, roundTo) {
        const roundingFactor = Math.pow(10, roundTo - 1);
        const rounded = Math.round(number / roundingFactor) * roundingFactor;
        return rounded === 0 ? number : rounded;//Issues with listing items that are like really cheap so they're under the round number
    }

    async buyCookie(time = null) {
        return new Promise(async (resolve, reject) => {
            try {
                const { bot } = this;
                if (time && time > autoCookie) {
                    logmc(`§6[§bTPM§6]§3 Not buying a cookie because you have ${Math.round(time / 3600)}h`);
                    resolve(`Enough time`);
                } else {

                    const price = await this.getCookiePrice();

                    if (price > 20_000_000 || bot.getPurse() < price * 2) {
                        logmc(`§6[§bTPM§6]§c Cookie costs ${price} so not buying :(`);
                        resolve(`Cookie expensive :(`);
                    } else {
                        bot.chat(`/bz booster cookie`);
                        await betterOnce(bot, 'windowOpen');
                        bot.betterClick(11);
                        await betterOnce(bot, 'windowOpen');
                        await sleep(250);
                        bot.betterClick(10);
                        await betterOnce(bot, 'windowOpen');
                        await sleep(250);
                        bot.betterClick(10);//This click buys the cookie
                        try {//check for full inv
                            await betterOnce(bot, "message", (message) => {
                                let text = message.getText(null);
                                debug("cookie text", text);
                                return text == `One or more items didn't fit in your inventory and were added to your item stash! Click here to pick them up!`
                            })
                            logmc(`§6[§bTPM§6]§c Your inv is full so I can't eat this cookie. You have one in your stash now`);
                            resolve(`Full inv :(`);
                            bot.betterWindowClose();
                        } catch (e) {//if no message for full inv then yay we don't have one
                            debug(`cookie error (probably not an actual error)`, e);
                            bot.betterWindowClose();
                            await this.getItemAndMove('COOKIE');
                            await betterOnce(bot, 'windowOpen')
                            bot.betterClick(11)
                            debug("activated cookie");
                            bot.betterWindowClose();//just to be safe
                            logmc(`§6[§bTPM§6]§3 Automatically ate a booster cookie cause you had ${Math.round(time / 3600)} hours left. Now you have ${Math.round((time + 4 * 86400) / 3600)} hours`);
                            this.cookieTime += 4 * 8.64e+7;
                            resolve();
                        }

                    }

                }
            } catch (e) {
                error(`Error buying cookie: `, e);
                this.bot.betterWindowClose();
                //no need to change state because it'll safely go back to getting ready
                resolve(`Failed to buy cookie`);
            }

        });
    }

    getExtraAttribute(slotNum) {
        return this.bot.currentWindow?.slots?.[slotNum]?.nbt?.value?.ExtraAttributes?.value;
    }

    async removeDrillParts(auctionID, uuid) {
        return new Promise(async (resolve, reject) => {//resolve true/false
            const { bot } = this;
            this.state.set('listing');
            try {
                await this.getItemAndMove("ABIPHONE");
                debug(`Moved item maybe`);
                await betterOnce(bot, "windowOpen");
                let Jotraeline = (bot.currentWindow?.slots?.find(slot => slot?.nbt?.value?.display?.value?.Name?.value?.includes("Jotraeline Greatforge")))?.slot;
                if (!Jotraeline) throw new Error(`No slot found for clicking Jotraeline`);
                bot.betterClick(Jotraeline);
                await betterOnce(bot, "windowOpen", null, 20_000);//Give big timespan so that window can open
                let drillNbt = (bot.currentWindow.slots.find(slot => this.getItemUuid(slot) == uuid))
                let drillSlot = drillNbt.slot;
                debug("Drill nbt", JSON.stringify(drillSlot));
                const drillName = drillNbt?.nbt?.value?.display?.value?.Name?.value;
                bot.betterClick(drillSlot, 0, 1);//Shift click!
                debug(`Put drill into menu`);
                debug('Drill slot', bot.currentWindow?.slots?.[29]);
                let removedIds = [];
                await sleep(500);
                if (this.getName(this.getExtraAttribute(9)) !== null) removedIds.push(this.getName(this.getExtraAttribute(9)));
                bot.betterClick(9);//Feul tank
                await sleep(500);
                if (this.getName(this.getExtraAttribute(18)) !== null) removedIds.push(this.getName(this.getExtraAttribute(18)));
                bot.betterClick(18);//drill engine
                await sleep(500);
                if (this.getName(this.getExtraAttribute(27)) !== null) removedIds.push(this.getName(this.getExtraAttribute(27)));
                bot.betterClick(27);//Upgrade module?
                await sleep(100);
                bot.betterWindowClose();
                await sleep(230);
                debug(`Parts removed`, JSON.stringify(removedIds));
                let prices = {};
                this.state.set(null);
                const pricePromises = removedIds.map(async id => {
                    const price = await this.getItemPrice(id);
                    prices[id] = price;
                    debug(`Added ${id} to prices. ${price}`);
                });

                await Promise.all(pricePromises);//I love Promise.all!!!
                let message = "";
                for (const item in prices) {
                    message += `Removed \`${item}\`. Selling it for ${formatNumber(prices[item])}\n`
                    debug(`Adding ${item} ${prices[item]}`);
                    this.state.queueAdd(
                        {
                            price: prices[item],
                            inv: item,
                            auctionID: item,
                            time: null
                        },
                        'listingNoName',
                        10
                    );
                }

                sendDiscord({
                    title: 'Removed Drill parts!',
                    color: 13320532,
                    fields: [
                        {
                            name: '',
                            value: message + `\nRemoved from \`${noColorCodes(drillName)}\``,
                        }
                    ],
                    thumbnail: {
                        url: bot.head,
                    },
                    footer: {
                        text: `TPM Rewrite`,
                        icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                    }
                })

                this.sendTPMSocket(auctionID, "it's a drill with removed parts", drillName)

            } catch (e) {
                error(`Error removing parts`, e);
                bot.betterWindowClose();
                this.state.set(null);
                resolve(false);
                await sleep(200);
            }
        })
    }

    async claimItem(auctionID) {
        return new Promise(async (resolve, reject) => {
            try {
                const { bot } = this;
                bot.chat(`/viewauction ${auctionID}`);
                await betterOnce(bot, 'windowOpen');
                let itemUuid = this.getItemUuid(bot.currentWindow.slots[13], true);
                let itemCount = bot.currentWindow.slots[13]?.count;
                let nbt = bot.currentWindow.slots[13].nbt.value;
                if (!itemUuid) {
                    debug(`Failed to get item uuid :( ${itemUuid} ${JSON.stringify(bot.currentWindow.slots[13])}`);
                }
                debug(`Item uuid: ${itemUuid}`);
                debug(`Item count: ${itemCount}`);
                bot.betterClick(31);
                await sleep(250);
                bot.betterWindowClose();//safety
                await bot.waitForTicks(10);//hey look it's a race condition let's hope we win (When the item is claimed, the current GUI closes so if the next GUI in listing process is open it'll break)
                resolve({ count: itemCount, uuid: itemUuid, nbt: nbt });
            } catch (e) {
                debug(e);
                this.bot.betterWindowClose();//safety
                reject(e);
            }
        })
    }

    async getItemAndMove(itemName) {
        return new Promise(async (resolve, reject) => {
            const { bot } = this;
            try {
                bot.betterWindowClose();
                let slot = (bot.inventory.slots.find(slot => this.getName(slot?.nbt?.value?.ExtraAttributes?.value)?.includes(itemName)))?.slot;
                debug(`Got ${itemName} slot ${slot}`);
                if (!slot) {
                    reject(`No ${itemName} found`);
                    // debug(JSON.stringify(bot.inventory.slots));
                } else {
                    if (slot < 36) {//not in hotbar. It would auto go to hotbar so that mean it's full
                        bot.clickWindow(slot, 0, 2);//can't use betterclick because it has failsafe for no window open and we don't want one open!
                        await sleep(500);
                        slot = (bot.inventory.slots.find(slot => this.getName(slot?.nbt?.value?.ExtraAttributes?.value)?.includes(itemName)))?.slot;
                        debug(`Moved it maybe?`, slot);
                    }
                }
                await sleep(500);
                bot.setQuickBarSlot(slot - 36);
                await sleep(2500);
                bot.activateItem();
                resolve(true);
            } catch (e) {
                debug(e);
                this.bot.betterWindowClose();//safety
                reject(e);
            }
        })
    }

    async getCookiePrice() {
        try { return Math.round((await axios.get('https://api.hypixel.net/v2/skyblock/bazaar')).data.products.BOOSTER_COOKIE.quick_status.buyPrice) } catch (e) { error(e) };
    }

    async getItemPrice(id) {
        return new Promise(async (resolve) => {
            try {
                let { median, volume } = (await axios.get(`https://sky.coflnet.com/api/item/price/${id}`)).data;
                const { lowest: lbin } = (await axios.get(`https://sky.coflnet.com/api/item/price/${id}/bin`)).data;
                debug(`Got median ${median} volume ${volume} and lbin ${lbin}`);
                volume = volume / 5;//yes!
                resolve(this.sillyPriceAlg(median, volume, lbin));
            } catch (e) {
                error(e)
                resolve(null);
            };
        })
    }

    async getNbtPrice(slot) {//nbt needs to be json
        return new Promise(async (resolve, reject) => {
            try {
                slot = {
                    "_events": {},
                    "_eventsCount": 0,
                    "id": 0,
                    "type": "minecraft:inventory",
                    "title": "Inventory",
                    "slots": [slot]
                }
                const data = (await axios.post('https://sky.coflnet.com/api/price/nbt', {
                    jsonNbt: JSON.stringify(slot),
                }, {
                    headers: {
                        'accept': 'text/plain',
                        'Content-Type': 'application/json-patch+json',
                    },
                })).data
                debug(JSON.stringify(data));
                let { median, volume, lbin } = data[0];
                resolve(this.sillyPriceAlg(median, volume, lbin));
            } catch (e) {
                error(`Error getting price`, e);
                debug(JSON.stringify(slot));
                reject(e);
            }
        })
    }

    sillyPriceAlg(median, volume, lbin) {
        if (median < lbin) {
            if (volume <= 3) {
                return (median);
            } else {
                const difference = lbin - median;
                volume = volume / (volume - 1.5);
                volume = 2 - volume;
                return (median + (difference * volume));
            }
        } else if (lbin * 2 < median) {
            return (median - 1);
        } else {
            return (lbin - 1);
        }
    }

    async removeExpiredAuction(itemUuid) {
        const { state, bot } = this;
        try {
            if (!itemUuid) throw new Error(`No itemUuid given for ${itemUuid}`);
            debug(`Removing expired auction ${itemUuid}`);
            this.setFromCoflSocket(false);
            state.set('expired');
            bot.chat('/ah');
            await betterOnce(bot, 'windowOpen');
            bot.betterClick(15);//Open auctions
            await betterOnce(bot, 'windowOpen');
            for (const slot of bot.currentWindow.slots) {
                const uuid = this.getItemUuid(slot, false);
                if (uuid == itemUuid) {
                    const tag = this.getName(this.getExtraAttribute(slot.slot));
                    const name = noColorCodes(slot?.nbt?.value?.display?.value?.Name?.value);
                    const lore = getSlotLore(slot);
                    const priceLine = noColorCodes(lore.find(line => line.includes('Buy it now') || line.includes('Starting bid')));
                    const price = onlyNumbers(priceLine);
                    debug(`Got item to remove! ${slot.slot}`);
                    bot.betterClick(slot.slot);
                    //sendDiscord(, bot.head, false)
                    if (relistExpired) {
                        try {
                            let newPrice;
                            if (relistMode === '1') {
                                newPrice = await this.getNbtPrice(slot);
                            } else {
                                const percent = parseFloat(relistMode.split(':')[1]) / 100;
                                console.log(percent);
                                console.log(relistMode);
                                newPrice = price * percent;
                            }
                            debug(newPrice);
                            console.log(newPrice);
                            sendDiscord({
                                title: 'Removed Expired Auction',
                                color: 13320532,
                                fields: [
                                    {
                                        name: "",
                                        value: `Removed auction \`${name}\` because it expired! It was listed at \`${addCommasToNumber(price)}\` Ok relist haha ${formatNumber(newPrice)}`,
                                    }
                                ],
                                thumbnail: {
                                    url: useItemImage ? `https://sky.coflnet.com/static/icon/${tag}` : bot.head,
                                },
                                footer: {
                                    text: `TPM Rewrite`,
                                    icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                                }
                            }, useItemImage ? bot.head : null, false, bot.username);
                            setTimeout(() => {
                                state.queueAdd({
                                    price: newPrice,
                                    auctionID: uuid,
                                    username: bot.username,
                                    inv: uuid
                                }, 'listingNoName', 4);
                            }, 10_000)
                            return;
                        } catch (e) {
                            error(e);//Error and then don't return so that it sends to TPM socket meaning user can manually list :)
                        }
                    }
                    this.tpm.send(JSON.stringify({
                        type: "expired",
                        data: JSON.stringify({
                            username: bot.username,
                            itemUuid,
                            lore,
                            embed: {
                                title: 'Removed Expired Auction',
                                color: 13320532,
                                fields: [
                                    {
                                        name: "",
                                        value: `Removed auction \`${name}\` because it expired! It was listed at \`${addCommasToNumber(price)}\``,
                                    }
                                ],
                                thumbnail: {
                                    url: useItemImage ? `https://sky.coflnet.com/static/icon/${tag}` : bot.head,
                                },
                                footer: {
                                    text: `TPM Rewrite`,
                                    icon_url: 'https://media.discordapp.net/attachments/1303439738283495546/1304912521609871413/3c8b469c8faa328a9118bddddc6164a3.png?ex=67311dfd&is=672fcc7d&hm=8a14479f3801591c5a26dce82dd081bd3a0e5c8f90ed7e43d9140006ff0cb6ab&=&format=webp&quality=lossless&width=888&height=888',
                                }
                            }
                        })
                    }))
                    return;//Early return!!!
                }
            }
            const slotData = bot.currentWindow.slots.map(slot => this.getItemUuid(slot, false));
            throw new Error(`No item found to remove ${JSON.stringify(slotData)}! Was removing ${itemUuid}`);
        } catch (e) {
            error(`Error removing expired auction ${itemUuid}`, e);
            bot.betterWindowClose();
            state.set(null);
            state.setAction();
        }
    }

    async checkBids() {
        const { state, bot } = this;
        try {
            state.set('bids');
            bot.chat('/ah');
            await betterOnce(bot, 'windowOpen');
            bot.betterClick(13);//Open bids
            await betterOnce(bot, 'windowOpen');
            const slots = {}
            const uuids = new Set(bot.currentWindow.slots.map(slot => {
                if (slot?.slot < bot.currentWindow.slots.length - 36) {
                    slots[this.getItemUuid(slot)] = slot;
                    return this.getItemUuid(slot);
                }
                return null;
            }));//haha set
            for (const uuid in this.savedData.bidData) {
                debug(`Checking ${uuid}`);
                if (uuids.has(uuid)) continue;
                debug(`Deleting UUID`);
                delete this.savedData.bidData[uuid];//Remove old data
            }
            state.saveQueue(this.savedData.bidData);
            const data = {
                username: bot.username,
                bids: []
            };
            uuids.forEach(uuid => {
                if (!uuid) return;
                const bidData = this.savedData.bidData[uuid];
                const slot = slots[uuid];
                const lore = getSlotLore(slot);
                const itemName = slot?.nbt?.value?.display?.value?.Name?.value;
                if (!bidData) {
                    data.bids.push({
                        time: "Unknown",
                        target: "Unknown",
                        auctionID: "Unknown",
                        lore,
                        uuid,
                        itemName
                    })
                    return;
                }
                data.bids.push({ ...bidData, ...{ lore, uuid, itemName } });//Combine it all into 1
            })
            this.tpm.send(JSON.stringify({
                type: "bids",
                data: JSON.stringify({ ...data, ...{ uuid: bot.uuid } })
            }))
        } catch (e) {
            error(`Error checking bids ${e}`);
            state.setAction();
        }
        bot.betterWindowClose();
        state.set(null);
    }

    simplify(data) {//I stole this straight from prismarine-nbt I can't lie but like I didn't want another dependency cause like exe gets really big so I just did this
        const transform = (value, type) => {
            if (type === 'compound') {
                return Object.keys(value).reduce((acc, key) => {
                    acc[key] = this.simplify(value[key])
                    return acc
                }, {})
            }
            if (type === 'list') {
                return value.value.map(function (v) { return transform(v, value.type) })
            }
            return value
        }
        return transform(data.value, data.type)
    }


}

module.exports = RelistHandler;