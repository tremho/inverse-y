
/**
 * Part of RequestEvent. Has information about a request originating from Http.
 */
export class HttpInfo {
    method = ""
    path = ""
    protocol = ""
    sourceIp = ""
    userAgent = ""
}

/**
 * Information about a request originating from http that has become an event
 * Part of ParsedRequest
 */
export class RequestEvent {
    version = ""
    routeKey = ""
    rawPath = ""
    rawQueryString = ""
    headers:any = {}
    requestContext:HttpInfo = new HttpInfo();
    body:any = {}
    isBase64Encoded = false
}
