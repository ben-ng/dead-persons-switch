const http = require('http')
const url = require('url')
const POSTJSON = require('./post-json')

const PROCESSING_INTERVAL = 10

const keyPattern = '.+'
const triggerNamePattern = '\\w+'
const triggerPathRegExp =
    new RegExp(`^/trigger/(${triggerNamePattern})/with/key/(${keyPattern})$`)
// {0,14} guards against integer overflows
const intPattern = '[1-9][0-9]{0,14}'
const oneConfPattern = `${triggerNamePattern}:${intPattern}(:${intPattern}:${intPattern})?`
const configPattern = `^(${oneConfPattern},)*{oneConfPattern}$`
const configRegExp = new RegExp(configPattern)
const log = process.stdout.write.bind(process.stdout)

let triggers = {}

if (process.env.SECRET == null)
    throw new Error('Must define the SECRET environment variable')

if (process.env.PORT == null)
    throw new Error('Must define the PORT environment variable')

if (process.env.TRIGGERS == null)
    throw new Error('Must define the TRIGGERS environment variable')

if (process.env.WEBHOOK_URL == null)
    throw new Error('Must define the WEBHOOK_URL environment variable')

try {
    url.parse(process.env.WEBHOOK_URL)
}
catch (e) {
    throw new Error('Invalid WEBHOOK_URL')
}

if (configRegExp.test(process.env.TRIGGERS))
    throw new Error('TRIGGERS must be "foo:1000,bar:5000:6:10000,[...]"')

process.env.TRIGGERS.split(',').forEach(tuple => {
    const t = tuple.split(':'),
        triggerName = t[0],
        delay = parseInt(t[1], 10),
        notificationAttempts = t.length < 4 ? 1 : parseInt(t[2], 10)
        notificationInterval = t.length < 4 ? 0 : parseInt(t[3], 10)

    if (triggers[triggerName] != null)
        throw new Error(`Duplicate event ${triggerName}`)

    triggers[triggerName] = {
        delay,
        notificationAttempts,
        notificationInterval,
        lastTriggerEpoch: Date.now(),
        notificationAttemptsRemaining: null,
        lastNotificationEpoch: null,
        lastNotificationStatus: null,
    }
})

process.stdout.write('Config: \n ' + JSON.stringify(triggers, null, 2) + '\n\n')

const server = http.createServer((req, res) => {
    function respondWith (code, msg, contentType) {
        res.writeHead(code, {'Content-Type': contentType || 'text/plain'})
        res.end(msg)
    }

    if (req.method === 'POST') {
        const reqPath = url.parse(req.url).path
        const matches = reqPath.match(triggerPathRegExp)
        if (matches == null)
            return void respondWith(400,
                `Cannot POST ${reqPath}`)

        const triggerName = matches[1]
        const secretKey = matches[2]

        if (secretKey !== process.env.SECRET)
            return void respondWith(403, 'Forbidden')

        if (triggers[triggerName] == null)
            return void respondWith(404, 'There is no such trigger')

        triggers[triggerName].lastTriggerEpoch = Date.now()
        log(`Triggered ${triggerName} @ ` +
            `${new Date(triggers[triggerName].lastTriggerEpoch)}\n`)
        return void respondWith(200,
            `Congratulations! You've fired the ${triggerName} event`)
    }
    else if (req.method === 'GET') {
        const secretKey = url.parse(req.url, true).query.key

        if (secretKey == null)
            return void respondWith(200, 'Your Dead Person\'s Switch is working')

        if (secretKey !== process.env.SECRET)
            return void respondWith(403, 'Forbidden')

        var output = JSON.stringify(triggers, null, 2)
        return void respondWith(200, output, 'application/json')
    }
    else {
        return void respondWith(400, 'Unknown request')
    }
}).listen(process.env.PORT, process.env.HOSTNAME || null)

const watcher = setInterval(() => {
    const now = Date.now()
    for (triggerName in triggers) {
        const trigger = triggers[triggerName]

        // The trigger is broken, queue up notifications
        const downFor = now - trigger.lastTriggerEpoch
        if (downFor > trigger.delay) {
            // Don't queue up notifications if there's an existing queue
            if (trigger.notificationAttemptsRemaining == null) {
                log(`DOWN: ${triggerName} @ ${new Date()} (${downFor} ms)\n`)
                trigger.notificationAttemptsRemaining = trigger.notificationAttempts
            }
        }
        // The trigger has recovered, stop notifying
        else if (trigger.notificationAttemptsRemaining != null) {
            log(`UP: ${triggerName} @ ${new Date()}\n`)
            trigger.notificationAttemptsRemaining = null
        }
    }
}, PROCESSING_INTERVAL)

const notifier = setInterval(() => {
    for (triggerName in triggers) {
        const trigger = triggers[triggerName]
        
        // trigger.notificationAttemptsRemaining may be null
        // but null > 0 is false so this is fine
        if (trigger.notificationAttemptsRemaining > 0 &&
            (trigger.lastNotificationEpoch == null || 
            Date.now() - trigger.lastNotificationEpoch >
            trigger.notificationInterval)
        ) {
            
            trigger.notificationAttemptsRemaining--
            trigger.lastNotificationEpoch = Date.now()

            let description = ''
            const notificationIndex = trigger.notificationAttempts - trigger.notificationAttemptsRemaining
            switch (notificationIndex) {
                case 1: description = '1st'; break
                case 2: description = '2nd'; break
                case 3: description = '3rd'; break
                default: description = `${notificationIndex}th`
            }

            if (trigger.notificationAttemptsRemaining === 0)
                description += ' and final'
            
            description += ' notification'

            POSTJSON(process.env.WEBHOOK_URL, {
                value1: triggerName,
                value2: description
            },
                5000, (err, res) => {
                if (err) {
                    log(`Failed to notify webhook about ${triggerName} ` +
                        `@ ${new Date()}: ${err.message}\n`)
                    trigger.lastNotificationStatus = err.message
                }
                else {
                    log(`Notified webhook about ${triggerName} @ ` +
                        `${new Date()}\n`)
                    trigger.lastNotificationStatus = 'OK'
                }
            })
        }
    }
}, PROCESSING_INTERVAL)

function cleanlyExit () {
    clearInterval(watcher)
    clearInterval(notifier)
    server.close(() => {
        process.exit(0)
    })
}
process.on('SIGINT', cleanlyExit)
process.on('SIGHUP', cleanlyExit)
process.on('SIGTERM', cleanlyExit)
