
export class HttpInfo {
    method = ""
    path = ""
    protocol = ""
    sourceIp = ""
    userAgent = ""
}

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
