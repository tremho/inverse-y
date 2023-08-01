"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestEvent = exports.HttpInfo = void 0;
class HttpInfo {
    constructor() {
        this.method = "";
        this.path = "";
        this.protocol = "";
        this.sourceIp = "";
        this.userAgent = "";
    }
}
exports.HttpInfo = HttpInfo;
class RequestEvent {
    constructor() {
        this.version = "";
        this.routeKey = "";
        this.rawPath = "";
        this.rawQueryString = "";
        this.headers = {};
        this.requestContext = new HttpInfo();
        this.body = {};
        this.isBase64Encoded = false;
    }
}
exports.RequestEvent = RequestEvent;
//# sourceMappingURL=EventTypes.js.map