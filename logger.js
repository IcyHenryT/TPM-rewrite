const { createLogger, format, transports } = require('winston');
const { combine, printf, colorize } = format;
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const axios = require('axios');

let messages = [];
let tracking = false;
let currentIgns = [];
let ignColors = {};
const directoryPath = './logs';
let webServerInstance = null;

const colors = {
    '1': '\x1b[34m',
    '2': '\x1b[32m',
    '3': '\x1b[36m',
    '4': '\x1b[31m',
    '6': '\x1b[33m',
    '9': '\x1b[94m',
    'a': '\x1b[92m',
    'b': '\x1b[96m',
    'c': '\x1b[91m',
    'd': '\x1b[95m',
    'e': '\x1b[93m',
    '7': '\x1b[37m',
    '8': '\x1b[90m',
    'f': '\x1b[97m',
    '0': '\x1b[30m',
    '5': '\x1b[35m'
};

const colorKeys = Object.keys(colors);
const badColors = new Set(['§0', '§5', '§f', '§8', '§7', '§2', '§9']);

function setWebServer(ws) {
    webServerInstance = ws;
    console.log('WebServer instance set in logger');
}

function updateIgns(ign) {
    currentIgns.push(ign);
}

function removeIgn(ign) {
    const index = currentIgns.indexOf(ign);
    if (index === -1) {
        debug(`Failed to remove ${ign} from ${JSON.stringify(currentIgns)}`);
        return;
    }

    currentIgns.splice(index, 1);

}

function getIgns() {
    return currentIgns;
}

async function logmc(string) {
    let msg = '';
    if (!string) return;
    if (tracking) messages.push(string.replace(/§./g, ''));

    if (webServerInstance) {
        try {
            webServerInstance.addLog(string);
        } catch (e) {
            console.error('Error adding log to webserver:', e);
        }
    }

    let split = string.split('§');
    msg += split[0];

    for (let a of string.split('§').slice(1, split.length)) {
        let color = a.charAt(0);
        let message = a.substring(1, a.length);

        if (colors[color]) {
            msg += colors[color];
        }
        msg += message;
    }

    info('\x1b[0m\x1b[1m\x1b[90m' + msg + '\x1b[0m');
}

function getPrefix(ign) {
    if (currentIgns.length === 1) return "";
    return `${customIGNColor(ign)}${ign}: `
}

function customIGNColor(ign, attempt = 0) {
    if (ignColors[ign]) return ignColors[ign];
    const randomColor = "§" + colorKeys[Math.floor(Math.random() * 11)];
    if ((Object.values(ignColors).includes(randomColor) || badColors.has(randomColor)) && attempt < 8) return customIGNColor(ign, attempt + 1);
    ignColors[ign] = randomColor;
    return randomColor;
}

if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath);
}

function formatDate() {
    const date = new Date();

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';

    hours = hours % 12;
    hours = hours ? hours : 12;
    const strMinutes = minutes < 10 ? '0' + minutes : minutes;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear().toString().slice(-2);
    const formattedDate = `${month}-${day}-${year}_${hours}-${strMinutes}${ampm}`;
    return formattedDate;
}

const latestLogPath = `${directoryPath}/latest.log`;
const timelog = `${directoryPath}/${formatDate()}.log`;

if (!fs.existsSync(latestLogPath)) {
    fs.writeFileSync(latestLogPath, '');
} else {
    fs.truncateSync(latestLogPath, 0);
}

const ansiRegex = /\x1b\[[0-9;]*m/g;

const regex = /[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:'",. <>/?`~\\]/g;

const plainFormat = printf(({ message }) => {
    message = message.replace(ansiRegex, '');
    message = message.match(regex)?.join('') || '';
    return `${Date.now()}: ${message}`;
});

const normalFormat = printf(({ message }) => {
    return message;
});

const logger = createLogger({
    level: 'silly',
    transports: [
        new transports.Console({
            level: 'info',
            format: combine(
                colorize(),
                normalFormat
            )
        }),
        new transports.File({
            filename: latestLogPath,
            format: plainFormat
        }),
        new transports.File({
            filename: timelog,
            format: plainFormat
        })
    ]
});

async function silly(...args) {
    logger.silly(args.join(' '), "silly");
}

async function debug(...args) {
    logger.debug(args.join(' '), "debug");
}

async function error(...args) {
    logger.error(args.join(' '), "error");
}

async function info(...args) {
    logger.info(args.join(' '), "info");
}

function getLatestLog() {
    const logFilePath = path.join(process.pkg ? path.dirname(process.execPath) : __dirname, 'logs', 'latest.log');
    if (!fs.existsSync(logFilePath)) {
        throw new Error(`Log file not found at ${logFilePath}`);
    }
    const logFile = fs.createReadStream(logFilePath);
    const form = new FormData();
    form.setMaxListeners(20);
    form.append('file', logFile, 'latest.log');
    return form;
}

async function startTracker(timer = 10_000) {
    tracking = true;
    messages = [];
    await new Promise((resolve) => {
        setTimeout(resolve, timer)
    })
    tracking = false;
    return messages;
}

module.exports = { logmc, customIGNColor, silly, debug, error, info, getPrefix, updateIgns, removeIgn, getIgns, startTracker, getLatestLog, setWebServer };