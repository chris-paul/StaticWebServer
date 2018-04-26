const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const zlib = require('zlib');
const config = require('./config/default');
const mime = require('./mime');
const utils = require('./utils');



var options = require( "yargs" )
    .option( "p", { alias: "port",  describe: "端口号", type: "number" } )
    .option( "r", { alias: "root", describe: "静态资源的根目录", type: "string" } )
    .option( "i", { alias: "index", describe: "默认文件", type: "string" } )
    .option( "c", { alias: "cachecontrol", default: true, describe: "开启Cache-Control缓存", type: "boolean" } )
    .option( "e", { alias: "expires", default: true, describe: "开启Expires缓存", type: "boolean" } )
    .option( "t", { alias: "etag", default: true, describe: "开启ETag缓存", type: "boolean" } )
    .option( "l", { alias: "lastmodified", default: true, describe: "开启Last-Modified缓存", type: "boolean" } )
    .option( "m", { alias: "maxage", describe: "开启文件有效期的缓存", type: "number" } )
    .help()
    .alias( "?", "help" )
    .argv;


class StaticServer {
    constructor() {
        this.port = config.port;                           /*默认端口*/
        this.root = config.root;                           /*文件根目录*/
        this.indexPage = config.indexPage;                 /*请求目录默认返回文件*/
        this.enableCacheControl = config.cacheControl;     /*是否开启cacheControl*/
        this.enableExpires = config.expires;               /*是否开启expires*/
        this.enableETag = config.etag;                     /*是否开启etag*/
        this.enableLastModified = config.lastModified;     /*是否开启lastModified*/ 
        this.maxAge = config.maxAge;                       /*是否设置maxAge*/
        this.zipMatch = new RegExp(config.zipMatch);       /*压缩哪些文件*/
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
     * @param    {[type]}   stat     [文件信息]
     * @param    {[type]}   pathName [请求资源路径]
     * @param    {[type]}   req      [请求体]
     * @param    {[type]}   res      [返回体]
     * @return   {[type]}            [description]
     */
    respondFile(stat,pathName, req, res) {
        res.setHeader('Content-Type', mime.lookup(pathName));
        res.setHeader('Accept-Ranges', 'bytes');
        console.info('请求的资源的类型是--',mime.lookup(pathName));
        let readStream;
        /*是否应该压缩*/
        let isCompress = path.extname(pathName).match(this.zipMatch);
        if (req.headers['range']) {
            readStream = this.rangeHandler(pathName, req.headers['range'], stat.size, res);
            if (!readStream) return;
        } else {
            readStream = fs.createReadStream(pathName);
        }
        if(isCompress){
            readStream = this.compressHandler(readStream, req, res);
        }
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
                    this.respond(pathName, req, res);
                }
            } else {
                this.respondNotFound(req, res);
            }
        });
    }
    /**判断是否设置缓存
     * @Author   LHK
     * @DateTime 2018-04-26
     * @version  [version]
     * @param    {[type]}   pathName [description]
     * @param    {[type]}   req      [description]
     * @param    {[type]}   res      [description]
     * @return   {[type]}            [description]
     */
    respond(pathName, req, res) {
        fs.stat(pathName, (err, stat) => {
            /*设置缓存的头部信息*/
            this.setFreshHeaders(stat, res);
            if (this.isFresh(req.headers, res._headers)) {
                this.responseNotModified(res);
            } else {
                this.respondFile(stat,pathName, req ,res);
            }
        })

    }
    /**获得文件的etag
     * @Author   LHK
     * @DateTime 2018-04-26
     * @version  [version]
     * @param    {[type]}   stat [description]
     * @return   {[type]}        [description]
     */
    generateETag(stat) {
        const mtime = stat.mtime.getTime().toString(16);
        const size = stat.size.toString(16);
        return `W/"${size}-${mtime}"`;
    }
    /**
     * @Author   LHK
     * @DateTime 2018-04-26
     * @version  [version]
     * @param    {[type]}   stat [description]
     * @param    {[type]}   res  [description]
     */
    setFreshHeaders(stat, res) {
        const lastModified = stat.mtime.toUTCString();
        if (this.enableExpires) {
            const expireTime = (new Date(Date.now() + this.maxAge * 1000)).toUTCString();
            res.setHeader('Expires', expireTime);
        }
        if (this.enableCacheControl) {
            res.setHeader('Cache-Control', `public, max-age=${this.maxAge}`);
        }
        if (this.enableLastModified) {
            res.setHeader('Last-Modified', lastModified);
        }
        if (this.enableETag) {
            res.setHeader('ETag', this.generateETag(stat));
        }
    }
    responseNotModified(res) {
        res.statusCode = 304;
        res.end();
    }
    /**判断是否需要使用缓存的资源
     * @Author   LHK
     * @DateTime 2018-04-26
     * @version  [version]
     * @param    {[type]}   reqHeaders [description]
     * @param    {[type]}   resHeaders [description]
     * @return   {Boolean}             [description]
     */
    isFresh(reqHeaders, resHeaders) {
        const  noneMatch = reqHeaders['if-none-match'];
        const  lastModified = reqHeaders['if-modified-since'];
        if (!(noneMatch || lastModified)) return false;
        if(noneMatch && (noneMatch !== resHeaders['etag'])) return false;
        if(lastModified && lastModified !== resHeaders['last-modified']) return false;
        return true;
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
            this.respond(indexPagePath, req, res);
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
    /**
     * 对文件内容进行压缩,支持gzip和deflate
     * @Author   LHK
     * @DateTime 2018-04-26
     * @version  [version]
     * @param    {[type]}   readStream [description]
     * @param    {[type]}   req        [description]
     * @param    {[type]}   res        [description]
     * @return   {[type]}              [description]
     */
    compressHandler(readStream, req, res) {
       const acceptEncoding = req.headers['accept-encoding'];
       if (!acceptEncoding || !acceptEncoding.match(/\b(gzip|deflate)\b/)) {
           return readStream;
       } else if (acceptEncoding.match(/\bgzip\b/)) {
           res.setHeader('Content-Encoding', 'gzip');
           return readStream.pipe(zlib.createGzip());
       } else if (acceptEncoding.match(/\bdeflate\b/)) {
           res.setHeader('Content-Encoding', 'deflate');
           return readStream.pipe(zlib.createDeflate());
       }
   }
   /**
    * 允许只请求文件的一部分
    * @Author   LHK
    * @DateTime 2018-04-27
    * @version  [version]
    * @param    {[type]}   pathName  [description]
    * @param    {[type]}   rangeText [description]
    * @param    {[type]}   totalSize [description]
    * @param    {[type]}   res       [description]
    * @return   {[type]}             [description]
    */
    rangeHandler(pathName, rangeText, totalSize, res) {
        const range = this.getRange(rangeText, totalSize);
        if (range.start > totalSize || range.end > totalSize || range.start > range.end) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${totalSize}`);
            res.end();
            return null;
        } else {
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${totalSize}`);
            return fs.createReadStream(pathName, { start: range.start, end: range.end });
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