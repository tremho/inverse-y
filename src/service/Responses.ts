
export function Success(result:any, contentType:string | undefined = undefined) {
    const statusCode = (result === undefined || result === null) ? 204 : 200
    return {statusCode, result, contentType}
}

export function BadRequest(message:string) {
    const statusCode = 400
    return {statusCode, result: "BadRequest: "+message}
}
export function Unauthorized(message:string) {
    const statusCode = 401
    return {statusCode, result: "Unauthorized: "+message}
}
export function Forbidden(message:string)  {
    const statusCode = 403
    return {statusCode, result: "Forbidden: "+message}
}
export function NotFound(message:string)  {
    const statusCode = 404
    return {statusCode, result: "NotFound: "+message}
}
export function MethodNotAllowed(message:string)  {
    const statusCode = 405
    return {statusCode, result: "Method Not Allowed: "+message}
}
export function ServerError(message:string) {
    const statusCode = 500
    return {statusCode, result: "Internal Server Error: "+message}
}
export function ServerException(e:Error) {
    return ServerError(e.stack ?? e.message ?? "");
}
export function NotImplemented(message:string) {
    const statusCode = 501
    return {statusCode, result: "Not Implemented: "+message}
}
