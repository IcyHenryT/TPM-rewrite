let ws;
let reconnectInterval;

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected to server');
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received:', message.type, message);

            switch (message.type) {
                case 'init':
                    console.log('Init - bots:', message.data.bots.length, 'logs:', message.data.logs.length);
                    updateBots(message.data.bots);
                    if (message.data.logs && message.data.logs.length > 0) {
                        message.data.logs.forEach(log => addLogLine(log));
                    }
                    break;
                case 'update':
                    updateBots(message.data);
                    break;
                case 'log':
                    console.log('Adding log line:', message.data);
                    addLogLine(message.data);
                    break;
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected from server');
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log('Attempting to reconnect...');
                connect();
            }, 3000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function formatNumber(num) {
    const absNum = Math.abs(num);
    let result;

    if (absNum >= 1000000000) {
        result = (num / 1000000000).toFixed(1) + 'B';
    } else if (absNum >= 1000000) {
        result = (num / 1000000).toFixed(1) + 'M';
    } else if (absNum >= 1000) {
        result = (num / 1000).toFixed(1) + 'K';
    } else {
        result = num.toFixed(0);
    }

    return result;
}

function formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

function updateBots(bots) {
    const container = document.getElementById('bots-container');

    if (bots.length === 0) {
        container.innerHTML = '<div style="color: #666; text-align: center; padding: 40px;">No active bots</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-card">
            <div class="bot-header">
                <div class="bot-name">${bot.name}</div>
                <div class="bot-state">${bot.state || 'idle'}</div>
            </div>
            <div class="bot-stats">
                <div class="stat-item">
                    <div class="stat-label">Purse</div>
                    <div class="stat-value">${formatNumber(bot.purse)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Profit/hr</div>
                    <div class="stat-value positive">${formatNumber(bot.profitPerHour)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Total Profit</div>
                    <div class="stat-value positive">${formatNumber(bot.totalProfit)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Purchases/hr</div>
                    <div class="stat-value">${bot.purchasesPerHour.toFixed(1)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Purchased</div>
                    <div class="stat-value">${bot.purchased}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Sold</div>
                    <div class="stat-value">${bot.sold}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Failed</div>
                    <div class="stat-value negative">${bot.failed}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">User Flips</div>
                    <div class="stat-value">${bot.userFlips}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Uptime</div>
                    <div class="stat-value uptime">${formatTime(bot.uptime)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function addLogLine(log) {
    const consoleEl = document.getElementById('console');
    if (!consoleEl) {
        console.error('Console element not found!');
        return;
    }

    const line = document.createElement('div');
    line.className = 'console-line';

    const cleanMessage = String(log.message || '').replace(/§./g, '');
    const time = log.time || new Date().toLocaleTimeString();

    line.innerHTML = `<span class="console-time">${time}</span>${cleanMessage}`;

    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;

    while (consoleEl.children.length > 500) {
        consoleEl.removeChild(consoleEl.firstChild);
    }

    console.log('Log line added to console');
}

connect();