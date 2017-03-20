const assert = require('assert')
const fork = require('child_process').fork
const http = require('http')
const drainStream = require('./drain-stream')
const POSTJSON = require('./post-json')

const WEBHOOK_SERVER_PORT = 8889
const WEBHOOK_SERVER_URL = `http://127.0.0.1:${WEBHOOK_SERVER_PORT}`
const log = process.stdout.write.bind(process.stdout)

function until(condition, timeout, cb) {
    const TRY_INTERVAL = 10

    if (condition())
        return void cb(true)

    if (timeout < 0)
        return void cb(false)

    setTimeout(() => void until(condition, timeout - TRY_INTERVAL, cb), TRY_INTERVAL)
}

// These let us clean up nicely if the test suite explodes halfway
let _dmsServerProcess
let _webhookServer
function startServers (env, onWebhook, cb) {
    if (_dmsServerProcess != null || _webhookServer != null)
        throw new Error('A test did not cleanly complete')

    let dmsServerProcess
    const webhookServer = http.createServer((req, res) => {
        drainStream(req, data => {
            onWebhook(JSON.parse(data))
            res.writeHead(200, {'Content-Type': 'text/plain'})
            res.end()
        })
    })
    .listen(WEBHOOK_SERVER_PORT, '127.0.0.1')

    const unexpectedExitHandler = (code, sig) => {
        throw new Error(`The forked process unexpectedly exited with ${code == null ? sig : code}`)
    }

    const close = (onClosed) => {
        let closedCount = 0

        dmsServerProcess.removeListener('close', unexpectedExitHandler)
        dmsServerProcess.on('close', (code, sig) => {
            _dmsServerProcess = null
            assert(code == null || code == 0, 'Should have an exit code of null or 0')
            assert(code != null || sig == 'SIGHUP', 'Should exit cleanly with SIGHUP')
            closedCount++
            closedCount === 2 && onClosed()
        })

        dmsServerProcess.kill('SIGHUP')
        webhookServer.close(() => {
            _webhookServer = null
            closedCount++
            closedCount === 2 && onClosed()
        })
    }

    webhookServer.on('listening', () => {
        // Make silent: false when debugging
        dmsServerProcess = fork('index.js', {env, silent: true})

        dmsServerProcess.on('close', unexpectedExitHandler)

        _dmsServerProcess = dmsServerProcess
        _webhookServer = webhookServer

        cb(dmsServerProcess, webhookServer, close)
    })
}

var zombies = 0
function test (thunks, cb) {
    if (thunks.length === 0)
        return void cb()

    zombies++
    thunks[0](() => {
        zombies--
        test(thunks.slice(1), cb)
    })
}

log('Testing test runner\n')

const tests = [
    // Make sure that the test helper works first
    next => {
        startServers({
            SECRET: 'OpenSesame',
            PORT: '8888',
            HOSTNAME: '127.0.0.1',
            TRIGGERS: 'foo:1000',
            WEBHOOK_URL: WEBHOOK_SERVER_URL,
        }, ()=>{}, (dmsServerProcess, webhookServer, close) => {
            close(() => {
                log('  Test helper works ✓\n')
                next()
            })
        })
    },
    // The "foo" event should almost immediately cause
    // a notification to the webhook server
    next => {
        let notifications = []
        const onNotify = (e) => void notifications.push(e)

        startServers({
            SECRET: 'OpenSesame',
            PORT: '8888',
            HOSTNAME: '127.0.0.1',
            TRIGGERS: 'foo:1',
            WEBHOOK_URL: WEBHOOK_SERVER_URL,
        }, onNotify, (dmsServerProcess, webhookServer, close) => {
            until(() => notifications.length === 1, 15000, ok => {
                assert(ok, 'Should notify the webhook server')
                assert.deepEqual(notifications, [{value1: 'foo', value2: '1st and final notification'}], 'Should notify with the trigger name')
                log('  Notified the webhook server when a trigger failed ✓\n')
                close(next)
            })
        })
    },
    // Test repeated notifications of a failed trigger
    next => {
        let notifications = []
        const onNotify = (e) => void notifications.push(e)

        startServers({
            SECRET: 'OpenSesame',
            PORT: '8888',
            HOSTNAME: '127.0.0.1',
            TRIGGERS: 'bar:1:5:100',
            WEBHOOK_URL: WEBHOOK_SERVER_URL,
        }, onNotify, (dmsServerProcess, webhookServer, close) => {
            until(() => notifications.length === 5, 15000, ok => {
                assert(ok, 'Should notify the webhook server five times')
                log('  Notified the webhook server multiple times when a trigger failed ✓\n')
                close(next)
            })
        })
    },
    // Test if a working trigger results in no notifications
    next => {
        let notifications = []
        const onNotify = (e) => void notifications.push(e)

        startServers({
            SECRET: 'OpenSesame',
            PORT: '8888',
            HOSTNAME: '127.0.0.1',
            TRIGGERS: 'baz:200:10:10',
            WEBHOOK_URL: WEBHOOK_SERVER_URL,
        }, onNotify, (dmsServerProcess, webhookServer, close) => {
            const keepalive = setInterval(() => {
                POSTJSON('http://127.0.0.1:8888/trigger/baz/with/key/OpenSesame', {}, 1000, (err, data) => {
                    assert.ifError(err, 'Should not error when triggered')
                    assert.equal(data, 'Congratulations! You\'ve fired the baz event')
                })
            }, 100)

            setTimeout(() => {
                assert.equal(notifications.length, 0, 'There should be no notifications')
                log('  Did not notify when a trigger was kept active ✓\n')
                clearInterval(keepalive)
                close(next)
            }, 1000)
        })
    },
]

// You can test this by commenting out the tests below
process.on('beforeExit', () => {
    process.stderr.write('Test suite unexpectedly terminated early\n')

    if (_dmsServerProcess != null) {
        _dmsServerProcess.on('close', () => {
            process.exit(1)
        })
        process.stderr.write('Killing child process\n')
        _dmsServerProcess.kill('SIGHUP')
    }
    else {
        process.exit(1)
    }
})

let a = []
test([
    (next) => a.push('f') && setTimeout(next, 1),
    (next) => a.push('o') && next(),
], () => {
    assert.equal(a.join(''), 'fo', 'Result should equal "fo"')
    assert.equal(zombies, 0, `There should be 0 zombies, got ${zombies}`)
    log('  Passing tests pass ✓\n')

    let b = []
    test([
        (next) => b.push('n') && next(),
        (next) => b.push('o'),
    ], () => {
        assert(false, 'This should not happen')
    })

    assert.equal(b.join(''), 'no', 'Result should equal "no"')
    assert.equal(zombies, 1, `There should be 1 zombie, got ${zombies}`)
    log('  Failing tests fail ✓\n')
    zombies = 0

    log('\n\nTesting Dead (Wo)man\'s Switch\n')
    test(tests, () => {
        assert.equal(zombies, 0, `There should be 0 zombies, got ${zombies}`)
        log(`${tests.length} tests passed\n`)
        process.exit(0)
    })
})
