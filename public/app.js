let ws;
let reconnectInterval;
let currentBot = null;
let inventoryData = null;
let auctionsData = null;
let authenticated = false;
let profitChart = null;
let finderChart = null;
let configData = null;

document.getElementById('pin-submit').addEventListener('click', checkPin);
document.getElementById('pin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPin();
});

async function checkPin() {
    const pin = document.getElementById('pin-input').value;
    const response = await fetch('/api/check-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
    });
    const result = await response.json();

    if (result.valid) {
        authenticated = true;
        document.getElementById('pin-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        connect();
        loadConfig();
    } else {
        document.getElementById('pin-error').textContent = 'Invalid PIN';
        setTimeout(() => {
            document.getElementById('pin-error').textContent = '';
        }, 2000);
    }
}

function connect() {
    if (!authenticated) return;

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
                    loadAnalytics();
                    loadFlipHistory();
                    loadPingStats();
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
                case 'autoLoadInventory':
                    if (message.data.username) {
                        currentBot = message.data.username;
                        document.getElementById('bot-select').value = currentBot;
                        ws.send(JSON.stringify({
                            type: 'requestInventory',
                            username: currentBot
                        }));
                    }
                    break;
                case 'autoLoadAuctions':
                    if (message.data.username) {
                        ws.send(JSON.stringify({
                            type: 'requestAuctions',
                            username: currentBot
                        }));
                    }
                    break;
                case 'configUpdated':
                    loadConfig();
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

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
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

async function loadAnalytics() {
    const response = await fetch('/api/analytics');
    const data = await response.json();

    const profitCtx = document.getElementById('profit-chart').getContext('2d');
    const finderCtx = document.getElementById('finder-chart').getContext('2d');

    const hours = Object.keys(data.hourlyData).sort((a, b) => a - b);
    const profitData = hours.map(h => data.hourlyData[h].profit);

    if (profitChart) profitChart.destroy();
    profitChart = new Chart(profitCtx, {
        type: 'line',
        data: {
            labels: hours.map(h => `${h}:00`),
            datasets: [{
                label: 'Hourly Profit',
                data: profitData,
                borderColor: '#00ff00',
                backgroundColor: 'rgba(0, 255, 0, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } }
            },
            scales: {
                y: {
                    ticks: { color: '#888', callback: (value) => formatNumber(value) },
                    grid: { color: '#222' }
                },
                x: {
                    ticks: { color: '#888' },
                    grid: { color: '#222' }
                }
            }
        }
    });

    const finders = Object.keys(data.finderStats);
    const finderProfits = finders.map(f => data.finderStats[f].profit);

    if (finderChart) finderChart.destroy();
    finderChart = new Chart(finderCtx, {
        type: 'bar',
        data: {
            labels: finders,
            datasets: [{
                label: 'Profit by Finder',
                data: finderProfits,
                backgroundColor: [
                    '#ff6384', '#36a2eb', '#cc65fe', '#ffce56',
                    '#4bc0c0', '#ff9f40', '#ff6384', '#c9cbcf'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    ticks: { color: '#888', callback: (value) => formatNumber(value) },
                    grid: { color: '#222' }
                },
                x: {
                    ticks: { color: '#888' },
                    grid: { color: '#222' }
                }
            }
        }
    });
}

async function loadFlipHistory() {
    const response = await fetch('/api/flip-history');
    const history = await response.json();
    displayFlipHistory(history);
}

function displayFlipHistory(history) {
    const container = document.getElementById('history-container');

    if (history.length === 0) {
        container.innerHTML = '<div class="loading">No flip history yet</div>';
        return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Time</th>
                <th>Bot</th>
                <th>Item</th>
                <th>Price</th>
                <th>Profit</th>
                <th>Finder</th>
            </tr>
        </thead>
        <tbody>
            ${history.map(flip => `
                <tr>
                    <td>${new Date(flip.timestamp).toLocaleTimeString()}</td>
                    <td>${flip.username}</td>
                    <td>${flip.itemName.replace(/§./g, '')}</td>
                    <td>${formatNumber(flip.price)}</td>
                    <td class="${flip.profit > 0 ? 'positive' : 'negative'}">${formatNumber(flip.profit)}</td>
                    <td>${flip.finder}</td>
                </tr>
            `).join('')}
        </tbody>
    `;

    container.innerHTML = '';
    container.appendChild(table);
}

async function loadPingStats() {
    const response = await fetch('/api/ping-stats');
    const stats = await response.json();

    const container = document.getElementById('info-container');
    const grid = document.createElement('div');
    grid.className = 'info-grid';

    for (const [bot, data] of Object.entries(stats)) {
        const card = document.createElement('div');
        card.className = 'info-card';
        card.innerHTML = `
            <h3>${bot}</h3>
            <div class="info-stats">
                <div class="info-stat">
                    <span class="label">Cofl Ping:</span>
                    <span class="value">${data.coflPing}</span>
                </div>
                <div class="info-stat">
                    <span class="label">Hypixel Ping:</span>
                    <span class="value">${data.hypixelPing}</span>
                </div>
                <div class="info-stat">
                    <span class="label">Cofl Delay:</span>
                    <span class="value">${data.coflDelay}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }

    container.innerHTML = '';
    container.appendChild(grid);
}

async function loadConfig() {
    const response = await fetch('/api/config');
    configData = await response.json();
    displayConfig(configData);
}

function displayConfig(config) {
    const editor = document.getElementById('config-editor');

    const basicSettings = ['igns', 'discordID', 'webhook', 'webPort', 'webHost', 'webPin', 'delay', 'waittime'];
    const relistSettings = ['relist', 'useCookie', 'autoCookie', 'percentOfTarget', 'listHours'];

    let html = '<div class="config-group"><h3>Basic Settings</h3>';
    basicSettings.forEach(key => {
        if (config[key] !== undefined) {
            const value = JSON.stringify(config[key]);
            html += `
                <div class="config-item">
                    <div class="config-label">${key}</div>
                    <input type="text" class="config-input" data-key="${key}" value='${value}'>
                </div>
            `;
        }
    });
    html += '</div>';

    html += '<div class="config-group"><h3>Relist Settings</h3>';
    relistSettings.forEach(key => {
        if (config[key] !== undefined) {
            const value = JSON.stringify(config[key]);
            html += `
                <div class="config-item">
                    <div class="config-label">${key}</div>
                    <input type="text" class="config-input" data-key="${key}" value='${value}'>
                </div>
            `;
        }
    });
    html += '</div>';

    editor.innerHTML = html;
}

async function saveConfig() {
    const inputs = document.querySelectorAll('.config-input');
    const newConfig = { ...configData };

    inputs.forEach(input => {
        const key = input.dataset.key;
        let value = input.value;

        try {
            newConfig[key] = JSON.parse(value);
        } catch (e) {
            newConfig[key] = value;
        }
    });

    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Config saved and applied', 'success');
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (e) {
        showNotification('Failed to save config', 'error');
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

function loadInventoryForCurrentBot() {
    if (!currentBot) {
        document.getElementById('inventory-container').innerHTML = '<div class="loading">Please select a bot first</div>';
        return;
    }

    document.getElementById('inventory-container').innerHTML = '<div class="loading">Loading inventory...</div>';
    ws.send(JSON.stringify({
        type: 'requestInventory',
        username: currentBot
    }));
}

function loadAuctionsForCurrentBot() {
    if (!currentBot) {
        document.getElementById('auctions-container').innerHTML = '<div class="loading">Please select a bot first</div>';
        return;
    }

    document.getElementById('auctions-container').innerHTML = '<div class="loading">Loading auctions...</div>';
    ws.send(JSON.stringify({
        type: 'requestAuctions',
        username: currentBot
    }));
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'analytics') loadAnalytics();
        if (tabName === 'history') loadFlipHistory();
        if (tabName === 'info') loadPingStats();
        if (tabName === 'inventory') loadInventoryForCurrentBot();
        if (tabName === 'auctions') loadAuctionsForCurrentBot();
    });
});

document.getElementById('bot-select').addEventListener('change', (e) => {
    currentBot = e.target.value;
});

document.getElementById('refresh-inventory').addEventListener('click', () => {
    loadInventoryForCurrentBot();
});

document.getElementById('refresh-auctions').addEventListener('click', () => {
    loadAuctionsForCurrentBot();
});

document.getElementById('save-config').addEventListener('click', saveConfig);

document.getElementById('history-search').addEventListener('input', (e) => {
    filterHistory(e.target.value);
});

document.getElementById('history-filter').addEventListener('change', (e) => {
    filterHistoryByType(e.target.value);
});

async function filterHistory(search) {
    const response = await fetch('/api/flip-history');
    const history = await response.json();
    const filtered = history.filter(flip =>
        flip.itemName.toLowerCase().includes(search.toLowerCase()) ||
        flip.username.toLowerCase().includes(search.toLowerCase()) ||
        flip.finder.toLowerCase().includes(search.toLowerCase())
    );
    displayFlipHistory(filtered);
}

async function filterHistoryByType(type) {
    const response = await fetch('/api/flip-history');
    const history = await response.json();
    let filtered = history;

    if (type === 'profit') {
        filtered = history.filter(flip => flip.profit > 0);
    } else if (type === 'loss') {
        filtered = history.filter(flip => flip.profit <= 0);
    }

    displayFlipHistory(filtered);
}