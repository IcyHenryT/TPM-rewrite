const { createBot } = require("mineflayer");
const { logmc, customIGNColor, debug } = require("../logger.js");
const { getPackets, makePackets } = require("./packets.js");
const { getTokenInfo } = require('./TokenHandler.js');
const axios = require('axios');

async function makeBot(ign, safeIgn) {
    return new Promise(async (resolve) => {

        logmc(`${customIGNColor(safeIgn)}Trying to log into ${safeIgn}`);

        let bot;
        if (ign.length > 16) {//person used token to log in
            let { username, uuid } = await getTokenInfo(ign);
            bot = createBot({
                host: 'play.hypixel.net',
                port: 25565,
                version: '1.8.9',
                username: username,
                session: {
                    accessToken: ign,
                    clientToken: uuid,
                    selectedProfile: {
                        id: uuid,
                        name: username,
                        keepAlive: false,
                    },
                },
                auth: 'mojang',
                skipValidation: true,
            });
            bot.username = username;
            ign = username;
        } else {
            bot = createBot({
                username: ign,
                auth: 'microsoft',
                version: '1.8.9',
                host: 'play.hypixel.net',
            });
        }

        bot.betterClick = function (slot, mode1 = 0, mode2 = 0) {
            if (!bot.currentWindow) {
                debug(`No window found for clicking ${slot}`);
                return;
            }
            let packets = getPackets(ign);
            if (!packets) {
                debug(`Packets weren't made for betterclick`);
                return;
            }
            packets.bump();
            bot.currentWindow.requiresConfirmation = false;
            bot.clickWindow(slot, mode1, mode2);
        };

        bot.betterWindowClose = function () {

            if (!bot.currentWindow) {
                debug(`No window found for closing`);
                return;
            }

            try { bot.closeWindow(bot.currentWindow) } catch { };

        };

        bot.editSign = function (line) {
            bot._client.write('update_sign', {
                location: bot.entity.position.offset(-1, 0, 0),
                text1: line,
                text2: '{"italic":false,"extra":["^^^^^^^^^^^^^^^"],"text":""}',
                text3: '{"italic":false,"extra":["    Auction    "],"text":""}',
                text4: '{"italic":false,"extra":["     hours     "],"text":""}'
            });
        };

        bot.recentPurse = null;

        bot.getPurse = function (recent = null) {
            let pursey;
            let scoreboard = bot?.scoreboard?.sidebar?.items?.map(item => item?.displayName?.getText(null)?.replace(item?.name, ''));
            scoreboard?.forEach(e => {
                if (e.includes('Purse:') || e.includes('Piggy:')) {
                    let purseString = e.substring(e.indexOf(':') + 1).trim();
                    if (purseString.includes('(')) purseString = purseString.split('(')[0];
                    pursey = parseInt(purseString.replace(/\D/g, ''), 10);
                }
            });
            debug(`Recent purse ${bot.recentPurse}. Current found ${pursey}. Recent: ${recent}`);
            if (recent) {
                const inLowerBound = bot.recentPurse * .99 >= pursey;
                const inUpperBound = bot.recentPurse * 1.01 <= pursey;
                if (inLowerBound || inUpperBound) {
                    return bot.recentPurse;
                }
            }
            bot.recentPurse = pursey;
            return pursey;
        }

        makePackets(ign, bot._client);

        bot.setMaxListeners(20);

        bot.once("login", async () => {
            if (!bot.uuid) bot.uuid = await getUUID(ign);
            bot.head = `https://mc-heads.net/head/${bot.uuid}.png`;
            logmc(`${customIGNColor(ign)}${ign} logged in!`);
            resolve(bot);
        });

    });
}

async function getUUID(ign, attempt = 0) {
    if (attempt == 3) return null;
    try {
        return (await axios.get(`https://api.mojang.com/users/profiles/minecraft/${ign}`)).data.id;
    } catch (e) {
        debug(e);
        return getUUID(ign, ++attempt);
    }
}

module.exports = { makeBot };