const http = require('http');
const path = require('path');
const fs = require('fs');
const config = require('./config/default');
const mime = require('./mime');

class StaticServer {
    constructor() {
        this.port = config.port;
        this.root = config.root;
        this.indexPage = config.indexPage;
    }
    respondNotFound(req, res) {
        res.writeHead(404, {
            'Content-Type': 'text/html'
        });
        res.end(`<h1>Not Found</h1><p>The requested URL ${req.url} was not found on this server.</p>`);
    }

    respondFile(pathName, req, res) {
        console.info(mime.lookup(pathName));
        res.setHeader('Content-Type', mime.lookup(pathName));
        const readStream = fs.createReadStream(pathName);
        readStream.pipe(res);
    }
    routeHandler(pathName, req, res) {
        /*异步获取文件信息,stat = new fs,stats*/
        fs.stat(pathName, (err, stat) => {
            if (!err) {
                this.respondFile(pathName, req, res);
            } else {
                this.respondNotFound(req, res);
            }
        });
    }
    start() {
        http.createServer((req, res) => {
            //规范化url并链接
            const pathName = path.join(this.root, path.normalize(req.url));
            console.info(`Requeste path: ${pathName}`);
            this.routeHandler(pathName, req, res);
        }).listen(this.port, err => {
            if (err) {
                console.error(err);
                console.info('createServer fail');
            } else {
                console.info(`Server started on port ${this.port}`);
            }
        });
    }
}

module.exports = StaticServer;