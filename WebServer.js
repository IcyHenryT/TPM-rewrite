const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { formatNumber, getSlotLore, noColorCodes, onlyNumbers, normalTime, sleep } = require('./TPM-bot/Utils.js');
const axios = require('axios');
const { config, updateConfig } = require('./config.js');

class WebServer {
    constructor(port, bots) {
        this.port = port;
        this.bots = bots;
        this.server = null;
        this.wss = null;
        this.clients = new Set();
        this.logBuffer = [];
        this.maxLogs = 500;
        this.flipHistory = [];
        this.maxHistory = 1000;
        this.autoLoadedBots = new Set();
    }

    start() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', (ws) => {
            this.clients.add(ws);

            ws.send(JSON.stringify({
                type: 'init',
                data: {
                    bots: this.getBotsData(),
                    logs: this.logBuffer
                }
            }));

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleWebSocketMessage(data, ws);
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            });

            ws.on('close', () => {
                this.clients.delete(ws);
            });
        });

        this.server.listen(this.port, () => {
            console.log(`Web interface: http://localhost:${this.port}`);
        });

        setInterval(() => {
            this.broadcast({
                type: 'update',
                data: this.getBotsData()
            });
            this.checkAutoLoad();
        }, 1000);
    }

    async handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (url.pathname === '/api/check-pin' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const { pin } = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ valid: pin === config.webPin }));
            });
            return;
        }

        if (url.pathname === '/api/config' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(config));
            return;
        }

        if (url.pathname === '/api/config' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const newConfig = JSON.parse(body);
                    updateConfig(newConfig);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        if (url.pathname === '/api/restart' && req.method === 'POST') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Server restarting...' }));

            setTimeout(() => {
                console.log('Restarting TPM server...');
                process.exit(0);
            }, 1000);
            return;
        }

        if (url.pathname === '/api/analytics') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.getAnalyticsData()));
            return;
        }

        if (url.pathname === '/api/flip-history') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.flipHistory));
            return;
        }

        if (url.pathname === '/api/ping-stats') {
            const stats = await this.getPingStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats));
            return;
        }

        const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
        const fullPath = path.join(__dirname, 'public', filePath);
        const extname = path.extname(fullPath);

        const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json'
        };

        const contentType = mimeTypes[extname] || 'text/plain';

        fs.readFile(fullPath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }

    async handleWebSocketMessage(data, ws) {
        if (data.type === 'requestInventory') {
            const username = data.username;
            const bot = this.bots[username];

            if (!bot) {
                console.log(`Bot not found: ${username}`);
                return;
            }

            try {
                const slots = bot.getBot().inventory.slots;

                const pricingData = (await axios.post('https://sky.coflnet.com/api/price/nbt', {
                    jsonNbt: JSON.stringify(bot.getBot().inventory),
                }, {
                    headers: {
                        'accept': 'text/plain',
                        'Content-Type': 'application/json-patch+json',
                    },
                })).data;

                let invData = slots.slice(9, slots.length).map(slot => {
                    if (!slot) return null;
                    const uuid = bot.relist.getItemUuid(slot);
                    const lore = getSlotLore(slot);
                    const itemName = slot?.nbt?.value?.display?.value?.Name?.value;
                    const tag = bot.relist.getName(slot?.nbt?.value?.ExtraAttributes?.value);
                    const count = slot.count;
                    let priceData = pricingData[slot?.slot];
                    if (!priceData) {
                        priceData = {
                            median: 0,
                            lbin: 0,
                            volume: 0
                        }
                    }
                    let goodPrice = bot.relist.sillyPriceAlg(priceData?.median, priceData?.volume, priceData?.lbin);
                    return {
                        lore,
                        uuid,
                        itemName,
                        tag,
                        count,
                        goodPrice: Math.round(goodPrice)
                    }
                }).filter(slot => slot !== null);

                ws.send(JSON.stringify({
                    type: 'inventoryData',
                    data: JSON.stringify({
                        invData,
                        username,
                        uuid: bot.getBot().uuid
                    })
                }));
            } catch (e) {
                console.error('Error getting inventory:', e);
            }
        } else if (data.type === 'requestAuctions') {
            const username = data.username;
            const bot = this.bots[username];

            if (!bot) {
                console.log(`Bot not found: ${username}`);
                return;
            }

            try {
                const auctionData = await this.getAuctionData(bot);

                ws.send(JSON.stringify({
                    type: 'auctionsData',
                    data: JSON.stringify({
                        auctions: auctionData,
                        username,
                        uuid: bot.getBot().uuid
                    })
                }));
            } catch (e) {
                console.error('Error getting auctions:', e);
            }
        }
    }

    async getAuctionData(bot) {
        const botInstance = bot.getBot();
        botInstance.chat('/ah');
        await sleep(1000);

        if (!botInstance.currentWindow) {
            return [];
        }

        botInstance.betterClick(15);
        await sleep(500);

        const auctionSlots = [];
        if (botInstance.currentWindow && botInstance.currentWindow.slots) {
            for (const slot of botInstance.currentWindow.slots) {
                if (!slot || !slot.nbt) continue;
                const lore = getSlotLore(slot);
                if (!lore) continue;

                const hasSeller = lore.find(line => line.includes('Seller:'));
                if (!hasSeller || !hasSeller.includes(botInstance.username)) continue;

                const itemName = slot?.nbt?.value?.display?.value?.Name?.value;
                const tag = bot.relist.getName(slot?.nbt?.value?.ExtraAttributes?.value);
                const uuid = bot.relist.getItemUuid(slot);
                const count = slot.count;

                const endsInTime = lore.find(line => line.includes('Ends in:'));
                const priceLine = lore.find(line => noColorCodes(line).includes('Buy it now') || noColorCodes(line).includes('Starting bid'));
                const hasBuyer = lore.find(line => line.includes('Buyer:'));

                const timeLeft = endsInTime ? normalTime(endsInTime) : 0;
                const price = priceLine ? onlyNumbers(noColorCodes(priceLine)) : 0;
                const status = hasBuyer ? 'sold' : 'active';

                auctionSlots.push({
                    itemName,
                    tag,
                    uuid,
                    count,
                    price,
                    timeLeft,
                    status,
                    lore
                });
            }
        }

        botInstance.betterWindowClose();
        return auctionSlots;
    }

    getBotsData() {
        const botsData = [];

        for (const [name, botInstance] of Object.entries(this.bots)) {
            const bot = botInstance.getBot();
            const timeSpan = Date.now() - botInstance.start;
            const hoursRunning = timeSpan / 3600000;

            let totalProfit = 0;
            let userFlips = 0;
            botInstance.bought.forEach(profit => {
                if (!isNaN(profit) && profit > 0) {
                    totalProfit += profit;
                } else {
                    userFlips++;
                }
            });

            const profitPerHour = hoursRunning > 0 ? totalProfit / hoursRunning : 0;
            const purchasesPerHour = hoursRunning > 0 ? botInstance.bought.length / hoursRunning : 0;

            botsData.push({
                name: name,
                uuid: bot.uuid,
                purse: bot.getPurse() || 0,
                totalProfit: totalProfit,
                profitPerHour: profitPerHour,
                purchased: botInstance.bought.length,
                sold: botInstance.sold,
                failed: botInstance.failed,
                purchasesPerHour: purchasesPerHour,
                userFlips: userFlips,
                state: botInstance.state.get(),
                uptime: timeSpan,
                onIsland: botInstance.island?.onIslandCheck?.() || false
            });
        }

        return botsData;
    }

    getAnalyticsData() {
        const hourlyData = {};
        const finderStats = {};

        this.flipHistory.forEach(flip => {
            const hour = new Date(flip.timestamp).getHours();
            if (!hourlyData[hour]) {
                hourlyData[hour] = { profit: 0, count: 0 };
            }
            hourlyData[hour].profit += flip.profit;
            hourlyData[hour].count++;

            if (!finderStats[flip.finder]) {
                finderStats[flip.finder] = { profit: 0, count: 0 };
            }
            finderStats[flip.finder].profit += flip.profit;
            finderStats[flip.finder].count++;
        });

        return {
            hourlyData,
            finderStats,
            totalFlips: this.flipHistory.length
        };
    }

    async getPingStats() {
        const { TheBig3 } = require('./TPM-bot/Utils.js');
        const stats = {};

        const promises = Object.entries(this.bots).map(async ([name, botInstance]) => {
            try {
                const bot = botInstance.getBot();
                const coflSocket = botInstance.coflSocket;
                const ws = coflSocket.getWs();
                const handleCommand = coflSocket.handleCommand.bind(coflSocket);

                const pingData = await TheBig3(bot, handleCommand, ws);
                stats[name] = {
                    coflPing: pingData.coflPing,
                    hypixelPing: pingData.hypixelPing,
                    coflDelay: pingData.delay
                };
            } catch (e) {
                stats[name] = {
                    coflPing: 'Error',
                    hypixelPing: 'Error',
                    coflDelay: 'Error'
                };
            }
        });

        await Promise.all(promises);
        return stats;
    }

    addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { time: timestamp, message };

        this.logBuffer.push(logEntry);
        if (this.logBuffer.length > this.maxLogs) {
            this.logBuffer.shift();
        }

        this.broadcast({
            type: 'log',
            data: logEntry
        });
    }

    addFlip(username, itemName, profit, finder, price, tag) {
        const flip = {
            timestamp: Date.now(),
            username,
            itemName,
            profit,
            finder,
            price,
            tag
        };

        this.flipHistory.unshift(flip);
        if (this.flipHistory.length > this.maxHistory) {
            this.flipHistory.pop();
        }
    }

    checkAutoLoad() {
        for (const [name, botInstance] of Object.entries(this.bots)) {
            const bot = botInstance.getBot();
            const onIsland = botInstance.island?.onIslandCheck?.() || false;
            const botReady = botInstance.relist?.getGottenReady?.() || false;

            if (onIsland && botReady && !this.autoLoadedBots.has(name)) {
                this.autoLoadedBots.add(name);

                setTimeout(() => {
                    this.broadcast({
                        type: 'autoLoadInventory',
                        data: { username: name }
                    });
                }, 2000);

                setTimeout(() => {
                    this.broadcast({
                        type: 'autoLoadAuctions',
                        data: { username: name }
                    });
                }, 4000);
            }
        }
    }

    broadcast(data) {
        const message = JSON.stringify(data);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}

module.exports = WebServer;