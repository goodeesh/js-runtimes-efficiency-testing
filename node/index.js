import * as http from 'node:http'

const server = http.createServer((req, res) => {
    const { url } = req
    switch (url) {
        case '/json':
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: 'JSON endpoint' }))
            break
        case '/about':
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('About page\n')
            break
        default:
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('404 Not Found\n')
            break
    }
})

server.listen(3000)
