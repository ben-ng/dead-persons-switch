module.exports = function drainStream(stream, cb) {
    let body = []
    stream.on('data', chunk => void body.push(chunk))
    stream.on('end', () => {
    	cb(Buffer.concat(body).toString())
    })
}
