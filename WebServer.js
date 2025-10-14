const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { formatNumber } = require('./TPM-bot/Utils.js');

class WebServer {
    constructor(port, bots) {
        this.port = port;
        this.bots = bots;
        this.server = null;
        this.wss = null;
        this.clients = new Set();
        this.logBuffer = [];
        this.maxLogs = 500;
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
        }, 1000);
    }

    handleRequest(req, res) {
        const url = req.url === '/' ? '/index.html' : req.url;
        const filePath = path.join(__dirname, 'public', url);
        const extname = path.extname(filePath);

        const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json'
        };

        const contentType = mimeTypes[extname] || 'text/plain';

        if (url === '/api/bots') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.getBotsData()));
            return;
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
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
                uptime: timeSpan
            });
        }

        return botsData;
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