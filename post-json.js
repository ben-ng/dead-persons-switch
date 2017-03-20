const http = require('http')
const https = require('https')
const urlParse = require('url').parse
const drainStream = require('./drain-stream')

function once (fn) {
	let called = false

	return function () {
		if (called)
			return

		called = true
		fn.apply(this, arguments)
	}
}

module.exports = function POSTJSON (url, data, timeout, _cb) {
	const cb = once(_cb)
	const parsed = urlParse(url)
	const stringifiedData = JSON.stringify(data)
	const isHTTPS = parsed.protocol === 'https'
	const reqOpts = {
		timeout,
		hostname: parsed.hostname,
		port: parsed.port === '' ? (isHTTPS ? 443 : 80) : parsed.port,
		path: parsed.path,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(stringifiedData)
		}
	}
	const reqFn = isHTTPS ? https.request : http.request
	const req = reqFn(reqOpts)
	req.on('error', e => {
		cb(e)
	})
	req.on('response', res => {
		if (res.statusCode < 200 || res.statusCode > 299)
			return void cb(new Error(`Non-2XX Status Code: ${res.statusCode} ${res.statusMessage}`))

		drainStream(res, data => {
			cb(null, data)
		})
	})
	req.write(stringifiedData)
	req.end()
}
