const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const config = require('./config/default');
const mime = require('./mime');
const utils = require('./utils');

class StaticServer {
    constructor() {
        this.port = config.port;                /*默认端口*/
        this.root = config.root;                /*文件根目录*/
        this.indexPage = config.indexPage;      /*请求目录默认返回文件*/
    }
    /**
     * 返回资源404
     * @Author   LHK
     * @DateTime 2018-04-25
     * @version  [version]
     * @param    {[type]}   req [请求体]
     * @param    {[type]}   res [返回体]
     * @return   {[type]}       [description]
     */
    respondNotFound(req, res) {
        res.writeHead(404, {
            'Content-Type': 'text/html'
        });
        res.end(`<h1>Not Found</h1><p>The requested URL ${req.url} was not found on this server.</p>`);
    }
    /**
     * 返回静态资源
     * @Author   LHK
     * @DateTime 2018-04-25
     * @version  [version]
     * @param    {[type]}   pathName [请求资源路径]
     * @param    {[type]}   req      [请求体]
     * @param    {[type]}   res      [返回体]
     * @return   {[type]}            [description]
     */
    respondFile(pathName, req, res) {
        res.setHeader('Content-Type', mime.lookup(pathName));
        console.info('请求的资源的类型是--',mime.lookup(pathName));
        const readStream = fs.createReadStream(pathName);
        readStream.pipe(res);
    }
    /**
     * 处理url和pathname 决定如何返回静态资源
     * @Author   LHK
     * @DateTime 2018-04-25
     * @version  [version]
     * @param    {[type]}   pathName [请求资源路径]
     * @param    {[type]}   req      [请求体]
     * @param    {[type]}   res      [返回体]
     * @return   {[type]}            [description]
     */
    routeHandler(pathName, req, res) {
        /*异步获取文件信息,stat = new fs,stats*/
        fs.stat(pathName, (err, stat) => {
            if (!err) {
                /*把url转换为url的对象,查看pathname
                    如果请求的是一个文件夹,那么返回文件夹的内容
                    否则返回请求的文件
                */
                const requestedPath = url.parse(req.url).pathname;
                 console.info('是否请求文件夹--',stat.isDirectory());
                if (stat.isDirectory()) {
                    this.respondDirectory(pathName, req, res);
                }else {
                    this.respondFile(pathName, req, res);
                }
            } else {
                this.respondNotFound(req, res);
            }
        });
    }
    /**
     * 返回文件夹默认资源|返回文件夹内静态资源
     * @Author   LHK
     * @DateTime 2018-04-25
     * @version  [version]
     * @param    {[type]}   pathName [请求资源路径]
     * @param    {[type]}   req      [请求体]
     * @param    {[type]}   res      [返回体]
     * @return   {[type]}            [description]
     */
    respondDirectory(pathName, req, res) {
        const indexPagePath = path.join(pathName, this.indexPage);
        if (fs.existsSync(indexPagePath)) {
            this.respondFile(indexPagePath, req, res);
        } else {
            fs.readdir(pathName, (err, files) => {
                if (err) {
                    res.writeHead(500);
                    return res.end(err);
                }
                const requestPath = url.parse(req.url).pathname;
                let content = `<h1>Index of ${requestPath}</h1>`;
                files.forEach(file => {
                    let itemLink = path.join(requestPath,file);
                    const stat = fs.statSync(path.join(pathName, file));
                    if (stat && stat.isDirectory()) {
                        itemLink = path.join(itemLink, '/');
                    }                 
                    content += `<p><a href='${itemLink}'>${file}</a></p>`;
                });
                res.writeHead(200, {
                    'Content-Type': 'text/html'
                });
                res.end(content);
            });
        }
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