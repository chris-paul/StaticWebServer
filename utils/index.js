/**
 * url的结尾是否带有/
 * @Author   LHK
 * @DateTime 2018-04-25
 * @version  [version]
 * @param    {[type]}   url [url]
 * @return   {[type]}       [true|false]
 */
const hasTrailingSlash = url => url[url.length - 1] === '/';

module.exports = {
    hasTrailingSlash
};