
export function Success(result:any, contentType:string | undefined = undefined, isBinary: boolean = false) {
    const statusCode = (result === undefined || result === null) ? 204 : 200
    return {statusCode, body:result, contentType, isBinary}
}

export function BadRequest(message:string) {
    const statusCode = 400
    return {statusCode, body: "BadRequest: "+message}
}
export function Unauthorized(message:string) {
    const statusCode = 401
    return {statusCode, body: "Unauthorized: "+message}
}
export function Forbidden(message:string)  {
    const statusCode = 403
    return {statusCode, body: "Forbidden: "+message}
}
export function NotFound(message:string)  {
    const statusCode = 404
    return {statusCode, body: "NotFound: "+message}
}
export function MethodNotAllowed(message:string)  {
    const statusCode = 405
    return {statusCode, body: "Method Not Allowed: "+message}
}
export function ServerError(message:string) {
    const statusCode = 500
    return {statusCode, body: "Internal Server Error: "+message}
}
export function ServerException(e:Error) {
    return ServerError(e.stack ?? e.message ?? "");
}
export function NotImplemented(message:string) {
    const statusCode = 501
    return {statusCode, body: "Not Implemented: "+message}
}
