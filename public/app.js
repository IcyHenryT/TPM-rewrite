let ws;
let reconnectInterval;
let currentBot = null;
let inventoryData = null;
let auctionsData = null;

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
            console.log('Received:', message.type);

            switch (message.type) {
                case 'init':
                    console.log('Init - bots:', message.data.bots.length, 'logs:', message.data.logs.length);
                    updateBots(message.data.bots);
                    updateBotSelector(message.data.bots);
                    if (message.data.logs && message.data.logs.length > 0) {
                        message.data.logs.forEach(log => addLogLine(log));
                    }
                    break;
                case 'update':
                    updateBots(message.data);
                    updateBotSelector(message.data);
                    break;
                case 'log':
                    addLogLine(message.data);
                    break;
                case 'inventoryData':
                    handleInventoryData(message.data);
                    break;
                case 'auctionsData':
                    handleAuctionsData(message.data);
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

function updateBotSelector(bots) {
    const select = document.getElementById('bot-select');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Select Bot</option>' +
        bots.map(bot => `<option value="${bot.name}">${bot.name}</option>`).join('');

    if (currentValue && bots.find(b => b.name === currentValue)) {
        select.value = currentValue;
    } else if (bots.length === 1) {
        select.value = bots[0].name;
        currentBot = bots[0].name;
    }
}

function handleInventoryData(data) {
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    inventoryData = parsedData;
    displayInventory(parsedData.invData);
}

function handleAuctionsData(data) {
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    auctionsData = parsedData;
    displayAuctions(parsedData.auctions);
}

function displayInventory(items) {
    const container = document.getElementById('inventory-container');

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="loading">No items in inventory</div>';
        return;
    }

    container.innerHTML = items.map(item => {
        const imageUrl = `https://sky.coflnet.com/static/icon/${item.tag}`;
        const count = item.count > 1 ? `<div class="item-count">${item.count}</div>` : '';
        const price = item.goodPrice > 0 ? `<div class="item-price">${formatNumber(item.goodPrice)}</div>` : '';

        return `
            <div class="item-slot" data-item='${JSON.stringify(item)}'>
                <img src="${imageUrl}" class="item-image" alt="${item.itemName}" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='">
                ${count}
                ${price}
            </div>
        `;
    }).join('');

    addTooltipListeners();
}

function displayAuctions(auctions) {
    const container = document.getElementById('auctions-container');

    if (!auctions || auctions.length === 0) {
        container.innerHTML = '<div class="loading">No active auctions</div>';
        return;
    }

    container.innerHTML = auctions.map(auction => {
        const imageUrl = `https://sky.coflnet.com/static/icon/${auction.tag}`;
        const count = auction.count > 1 ? `<div class="item-count">${auction.count}</div>` : '';
        const price = `<div class="item-price">${formatNumber(auction.price)}</div>`;
        const timeLeft = auction.timeLeft > 0 ? `<div class="auction-time">${formatTime(auction.timeLeft)}</div>` : '';

        return `
            <div class="item-slot" data-item='${JSON.stringify(auction)}'>
                <img src="${imageUrl}" class="item-image" alt="${auction.itemName}" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='">
                ${count}
                ${price}
                ${timeLeft}
            </div>
        `;
    }).join('');

    addTooltipListeners();
}

function addTooltipListeners() {
    const tooltip = document.getElementById('tooltip');
    const items = document.querySelectorAll('.item-slot');

    items.forEach(slot => {
        slot.addEventListener('mouseenter', (e) => {
            const item = JSON.parse(slot.dataset.item);
            showTooltip(e, item, tooltip);
        });

        slot.addEventListener('mousemove', (e) => {
            tooltip.style.left = e.clientX + 15 + 'px';
            tooltip.style.top = e.clientY + 15 + 'px';
        });

        slot.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}

function showTooltip(e, item, tooltip) {
    let content = '';

    if (item.lore) {
        content = item.lore.map(line => {
            const cleaned = line.replace(/§./g, '');
            return `<div class="tooltip-line">${cleaned}</div>`;
        }).join('');
    }

    tooltip.innerHTML = content;
    tooltip.classList.add('show');
    tooltip.style.left = e.clientX + 15 + 'px';
    tooltip.style.top = e.clientY + 15 + 'px';
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
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

document.getElementById('bot-select').addEventListener('change', (e) => {
    currentBot = e.target.value;
});

document.getElementById('refresh-inventory').addEventListener('click', () => {
    if (!currentBot) {
        alert('Please select a bot first');
        return;
    }

    document.getElementById('inventory-container').innerHTML = '<div class="loading">Loading inventory...</div>';
    ws.send(JSON.stringify({
        type: 'requestInventory',
        username: currentBot
    }));
});

document.getElementById('refresh-auctions').addEventListener('click', () => {
    if (!currentBot) {
        alert('Please select a bot first');
        return;
    }

    document.getElementById('auctions-container').innerHTML = '<div class="loading">Loading auctions...</div>';
    ws.send(JSON.stringify({
        type: 'requestAuctions',
        username: currentBot
    }));
});

connect();