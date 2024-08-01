import {RequestEvent} from "../request/EventTypes";
import {ServerError, Success} from "./Responses";
import {LambdaSupportLog, Log} from "../Logging/Logger"
export {RequestEvent as RequestEvent}


/**
 * Defines the declaration of a parameter
 * including some optional constraints (min, max, oneOf, match) and an optional default value
 */
export class ParamDef {
    name: string = ''
    type: string = ''
    "in": string = '' // path, query, body
    "required"?: boolean
    description: string = ''
    default?: string
    min?: number = 0
    max?: number = Number.MAX_SAFE_INTEGER
    oneOf?: string[] = []
    match?: string|RegExp = ''

    /**
     * Constructs a parameter definition
     * @param name name of the parameter
     * @param type value type of this parameter
     * @param description Documentation of parameter purpose
     * @param options Constraints defined here
     */
    constructor(name:string, type:string, description?:string, options?:any) {
        this.name = name;
        this.type = type;
        if(description) this.description = description;
        if(options) {
            this.default = options.default
            if (options.min) this.min = options.min
            if (options.max) this.max = options.max
            if (options.oneOf) this.oneOf = options.oneOf
            if (options.match) this.match = options.match
        }
    }
}

// Returns a string. if the string != '' it is a validation error message
function validateParameter(p:ParamDef, value:any): string
{
    if(value === undefined && p.default !== undefined) {
        value = p.default
    }
    let vt:string = typeof value
    if(vt === 'object') {
        if(Array.isArray(value)) {
            vt = typeof value[0]
            if(vt === 'undefined') vt = ''
            vt += '[]'  // e.g. string[] or number[]
        }
    }
    if(!p.type) p.type = p.default ? typeof p.default : ""
    let typeOk = false
    const types = p.type.split('|')
    for(let t of types) {
        t = t.trim()
        if(vt === t) {
            typeOk = true
            break;
        }
    }
    if(!typeOk) {
        return `Expected parameter "${p.name}" type to be ${p.type}, got ${vt}`
    }
    if(vt === 'number') {
        if(p.min !== undefined) {
            if(value < p.min) {
                return `Parameter "${p.name}" value of ${value} is less than ${p.min}`
            }
        }
        if(p.max !== undefined) {
            if(value > p.max) {
                return `Parameter "${p.name}" value of ${value} is greater than ${p.max}`
            }
        }
    }
    if(p.oneOf && p.oneOf.length) {
        let found = false
        for(let t of p.oneOf) {
            if(value === t) {
                found = true;
                break;
            }
        }
        if(!found) {
            return `Parameter "${p.name}" value "${value}" is not one of ${p.oneOf}`
        }
    }
    if(vt === 'string') {
        if(p.match) {
            const str:string = value
            const regx = new RegExp(p.match)
            if(!str.match(regx)) {
                return `Parameter "${p.name}" value string "${value}" does not match pattern "${p.match}"`;
            }
        }
    }
    return ''
}

/**
 * Declares the return from the service
 * Used for server-side validation. Will throw on error.
 * Also used for documentation of API return.
 * @throws Error on validation problem
 */
export class ReturnDef {
    type?: string
    schema?: object // schema or type
    content?: string
    mime?: string // alias for content
    min?: number = 0
    max?: number = Number.MAX_SAFE_INTEGER
    oneOf?: string[] = []
    match?: string|RegExp = ''
    description: string = ''
    props?: ParamDef[] = []

    constructor(type?:'file'|'text'|'js'|'', description?:string, props:ParamDef[] = []) {
        this.type = type || ''
        this.description = description || ''
        this.props = props
    }
}

/**
 * Captures parameters received and validated into a simple object set
 */
export class ParamSet {
    body:any = this

    set(name:string, value:any) {
        this.body[name] = value
    }
    get(name:string) {
        return this.body[name]
    }
}

/** Types of methods **/
export enum Method {
    'HEAD'= 'HEAD',
    'OPTIONS' = 'OPTIONS',
    'GET' = 'GET',
    'POST' = 'POST',
    'PATCH' = 'PATCH',
    'PUT' = 'PUT',
    'DELETE' = 'DELETE'
}

/**
 * The definition of the service
 * This has minimal meaning  here; mostly used for openApi / lambda api construction
 * Keep this definition synchronized with actual JSON templates used
 *
 *  "name": "$$FUNCTION_NAME$$",
 *   "description": "",
 *   "version": "1.0.0",
 *   "pathMap": "",
 *   "allowedMethods": "",
 *   "LambdaSupportLogLevel": "Debug",
 *   "sessionRequired": false,
 *   "userRequired": false,
 *   "schemas": {
 *   },
 *   "parameters": [],
 *   "returns": {
 *       "200": {
 *           "type"
 *           "description"
 *       }
 *   }
 *   */
export class ServiceDefinition {
    name: string = ''
    version? :string
    description?: string = ''
    pathMap: string = ''
    method?: string = 'POST'
    parameters?: ParamDef[] = []
    returns?: ReturnDef = new ReturnDef()
    schemas?: object
}

/** Declares the callback format for handling service API business */
export type Handler = (event?:any) => Promise<any>

/**
 * The handling object for a declared Service
 */
export class LambdaApi<TEvent> {
    definition:ServiceDefinition = new ServiceDefinition()
    handler?:Handler
    funcName?:string

    /**
     * Construct by passing a definition
     * or else no parameters
     * @param def
     */
    constructor(def?:ServiceDefinition,  handler?:Handler) {
        if (def) this.setDefinition(def)
        if (handler) this.setHandler(handler)
    }

    /**
     * Set or change the definition of this service
     * @param def - The details of the service
     */
    setDefinition(def:ServiceDefinition) {
        this.definition = def
        this.validateEventDefinition();
    }

    /**
     * Set or change the handling unction of the service
     * @param handler - The handling function
     */
    setHandler(handler:Handler) {
        this.handler = handler
    }

    validateEventDefinition() {
        let buildEvent:any = {}

        function emptyDefault(type:string):any {
            switch(type) {
                case 'string': return "";
                case 'number': return 0;
                case 'boolean': return false;
                case 'null': return null;
                case 'undefined': return undefined;
                case 'object': return {};
            }
        }

        const parameters = this.definition.parameters
        for(let p of parameters ?? []) {
            buildEvent[p.name] = p.default ?? emptyDefault(p.type)
        }
        let t:TEvent = buildEvent;
        return (t == buildEvent);
    }

    /**
     * Validates the incoming event of a service call against parameter definitions
     * @param event - the incoming event
     */
    validate(event:TEvent):ParamSet|string {
        const pset = new ParamSet()
        const parameters = this.definition.parameters
        let message = ''
        for(let p of parameters ?? []) {
            let place:any = (p.in === 'body') ? ((event as any)?.body) : event;
            let v = place[p.name]

            let vresp = validateParameter(p, v);
            if (vresp) {
                if(message) message += '\n'+vresp;
            } else {
                pset.set(p.name, v)
            }
        }
        if(message) {
            // invalid
            return message
        }
        return pset
    }

    /**
     * Main entry point for all launch methods
     * @param event - incoming event
     * @param context - incoming context
     * @param callback - callback to the main function handler
     */
    async entryPoint(event: TEvent|RequestEvent, context:any, callback:any) {

        const isAws = (event as any).requestContext?.stage !== undefined
        // LambdaSupportLog.Info(isAws ? "AWS Lamdba context detected" : "Local context detected");
        // LambdaSupportLog.Info("Service Definition", this.definition);

        // if(isAws) LambdaSupportLog.Info("Service entry event", event);

        if(isAws) {
            Log.enableColor('Console', false)
            LambdaSupportLog.setMinimumLevel('Console', 'trace')
            LambdaSupportLog.enableColor('Console', false)
        }


        if(this.handler) {
            try {
                let anyEvent:any = {};
                if(!isAws) {
                    anyEvent = event as any;
                    anyEvent.requestContext = {};
                }
                let xevent:any = adornEventFromLambdaRequest(event, this.definition.pathMap ?? "")

                if(!isAws) {
                    // If a local request, get adornment values from there
                    xevent.parameters = anyEvent.local?.parameters ?? anyEvent.parameters ?? {}
                    xevent.cookies = anyEvent.local?.cookies ?? anyEvent.cookies ?? {}
                    xevent.headers = anyEvent.local?.headers ?? anyEvent.headers ?? {}
                    xevent.body = anyEvent.local?.body ?? anyEvent.body ?? {}
                }

                LambdaSupportLog.Trace("XEvent after adornment", xevent)
                LambdaSupportLog.Trace("Calling handler...")
                const oldDefName = Log.setDefaultCategoryName(this.definition.name)
                const rawReturn = await this.handler(xevent);
                Log.setDefaultCategoryName(oldDefName)
                LambdaSupportLog.Trace("RawReturn is", rawReturn);

                const resp = AwsStyleResponse(rawReturn);
                LambdaSupportLog.Debug("response out", resp);
                return resp;
            } catch(e:any) {
                LambdaSupportLog.Exception(e);
                return ServerError(e.message);
            }

        }
    }
}

// More fixup mapping for request events
function adornEventFromLambdaRequest(eventIn:any, template:string):Event
{
    try {
        if (!eventIn.requestContext) throw new Error("No request context in Event from Lambda!");
        const req = eventIn.requestContext;

        if(req.stage !== undefined) LambdaSupportLog.Debug("Incoming request context", req)
        let cookiesFromSomewhere = eventIn.multiValueHeaders?.Cookie ?? [eventIn.headers?.Cookie];
        if(eventIn.cookies) {
            cookiesFromSomewhere = [];
            for(let k of Object.getOwnPropertyNames(eventIn.cookies)) {
                let v = eventIn.cookies[k];
                cookiesFromSomewhere.push(`${k}=${v}`)
            }
        }

        const domain = req.domainName ?? "";

        const pathLessStage = req.stage ? req.path.substring(req.stage.length + 1) : req.path;
        if(req.stage) LambdaSupportLog.Trace(`path values`, {path: req.path, stage: req.stage, pathLessStage})
        let path = domain ? "https://" + domain + pathLessStage : req.path ?? eventIn.request?.originalUrl ?? "";

        let host = req.headers?.origin ?? domain
        if (!host) {
            host = req.headers?.referer ?? "";
            let ptci = path.indexOf("://") + 3;
            let ei = path.indexOf("/", ptci);
            host = ptci > 3 ? path.substring(0, ei) : "";
        }
        if (!host) {
            // todo: http or https?npm
            host = "http://" + req.headers?.host;
        }
        // console.LambdaSupportLog("host is "+host)
        // if(!domain) path = host + req.path;

        const parameters: any = eventIn.parameters ?? {}
        if(req.stage) { // ignore for local request
            var cookies: any = {};
            var cookieString = req.headers?.cookie ?? (cookiesFromSomewhere ?? []).join(';');
            LambdaSupportLog.Trace("Request Cookies", cookieString)
            var crumbs = cookieString.split(';')
            for (let c of crumbs) {
                const pair: string[] = c.split('=');
                if (pair.length === 2) cookies[pair[0]] = pair[1]
                LambdaSupportLog.Debug(`setting cookie ${pair[0]} = ${pair[1]}`)
            }
            const tslots = template.split('/').slice(1);
            const pslots = path.split('/').slice(3);
            for (let i = 0; i < tslots.length; i++) {
                const brknm = (tslots[i] ?? "").trim();
                if (brknm.charAt(0) === '{') {
                    const pn = brknm.substring(1, brknm.length - 1);
                    if (parameters[pn] === undefined) {
                        parameters[pn] = (pslots[i] ?? "").trim();
                        // LambdaSupportLog.Debug("values:", {pn, value: parameters[pn]})
                    }
                }
            }
            LambdaSupportLog.Trace("queryStringParameters", eventIn.queryStringParameters);
            if (eventIn.queryStringParameters && typeof eventIn.queryStringParameters === "object") {
                for (let p of Object.getOwnPropertyNames(eventIn.queryStringParameters)) {
                    parameters[p] = eventIn.queryStringParameters[p]
                }
            }
        }
        const eventOut: any = {
            request: {
                originalUrl: path,
                headers: req.headers
            },
            stage: req.stage,
            cookies,
            parameters,
            body: eventIn.body
        }
        return eventOut;
    }
    catch(e:any) {
        LambdaSupportLog.Exception(e);
        throw e;
    }
}

// format response in AWS style
export function AwsStyleResponse(resp:any):any
{
    LambdaSupportLog.Trace("In AwsStyleResponse with incoming resp", resp)
    if(resp) {
        if(resp.isBase64Encoded !== undefined && resp.statusCode && resp.headers && resp.body) return resp; // it's already aws form

        const aws:any = { statusCode: 500, body: "Error: No response mapped!", headers:{"content-type": "text/plain"} }
        if(typeof resp != "object") {
            LambdaSupportLog.Trace(`Resp istype ${ typeof resp }`)
            resp = {
                statusCode: 200,
                body: ""+resp,
            }
        }
        resp.cookies ??= {}
        if (resp.headers) {
            if (resp.headers['Set-Cookie'] || resp.headers['set-cookie']) {
                LambdaSupportLog.Debug('Migrating set-cookie directives for AWS compatibility')
                LambdaSupportLog.Trace('headers to migrate?', resp.headers)
                let sca = resp.headers['Set-Cookie'] ?? resp.headers['set-cookie'] ?? []
                if (!Array.isArray(sca)) sca = [sca];
                LambdaSupportLog.Trace("sca array", sca)
                delete resp.headers ['Set-Cookie']
                delete resp.headers['set-cookie']
                for (let c of sca) {
                    let n = c.indexOf('=')
                    if (n !== -1) {
                        const k = c.substring(0, n);
                        let n2 = c.indexOf(';')
                        if (n2 == -1) n2 = c.length;
                        const v = c.substring(n + 1, n2)
                        resp.cookies[k] = v
                    }
                }
            }
        }
        if (resp.cookies !== undefined) {
            LambdaSupportLog.Trace("AwsStyleResponse - Setting cookies", resp.cookies)
            let cookieCount = 0;
            // delete resp.expireSeconds;
            Object.getOwnPropertyNames(resp.cookies).forEach(name => {
                // LambdaSupportLog.Trace('name ',{name})
                let age = resp.cookies.expireSeconds
                var value = resp.cookies[name];
                // LambdaSupportLog.Trace('type ', typeof value)
                if(typeof value !== 'function') {
                    if (!value) age = 0;
                    // LambdaSupportLog.Trace("cookie parts", {age, name, value})
                    let cval = age === undefined ? `${name}=${value}; Path=/; SameSite=Strict; HttpOnly`
                        : `${name}=${value}; Path=/; Max-Age=${age} SameSite=Strict; HttpOnly`
                    // LambdaSupportLog.Trace('calling AwsSetCookie', {cval, cookieCount})
                    AwsSetCookie(aws, cval, cookieCount++)
                }
            })
        }
        // LambdaSupportLog.Trace("AwsStyleResponse -- other headers")
        if (resp.headers !== undefined) {

            for (var hdr of Object.getOwnPropertyNames(resp.headers)) {
                LambdaSupportLog.Trace("AwsStyleResponse -- header", {hdr, value: resp.headers[hdr]})
                aws.headers[hdr] = resp.headers[hdr]
            }
            // delete resp.headers;
        }
        if (resp.statusCode !== undefined) {
            aws.statusCode = resp.statusCode;
            // delete resp.statusCode
        }
        // content type resolution
        let body = resp.body ?? resp.result ?? resp
        LambdaSupportLog.Trace('ContentType resolution, body type =', typeof body)
        LambdaSupportLog.Trace('pre-existing contentType', resp.contentType)
        if(typeof body === 'object') {
            resp.body = JSON.stringify(body)
            resp.contentType = 'application/json'
            LambdaSupportLog.Trace('Body stringified to ', body)
        } else if(typeof body == 'string') {
            if(!resp.contentType) // don't change if already set by caller
                if(resp.isBinary || resp.isBase64Encoded) {
                    resp.contentType = 'application/octet-stream'
                } else {
                    if (body.indexOf("<html>") !== -1) {
                        resp.contentType = "text/html"
                    } else {
                        resp.contentType = "text/plain"
                    }
                }
        }


        if (resp.contentType !== undefined && resp.statusCode != 301 && resp.statusCode != 302) {
            LambdaSupportLog.Debug("Content-type is being set to "+ resp.contentType)
            aws.headers["content-type"] = resp.contentType
            // delete resp.contentType
        }

        if(""+resp.statusCode == "302") {
            delete aws.headers["content-type"];
            // aws.headers['Access-Control-Allow-Origin'] = "*"
        }

        // if marked is binary, body is already base64 encoded by caller
        aws.isBase64Encoded = resp.isBinary || false;
        aws.body = resp?.body ?? resp?.result ?? "";

        // console.LambdaSupportLog("AWS response ", aws);
        LambdaSupportLog.Debug("AWS Response", aws);
        return aws;
    }
}

// Lambda only allows one value per header, so to set multiple cookies
// we must set multiple case variations between "set-cookie" and "SET-COOKIE".
// There are 512 combinations, which should be enough.
function AwsSetCookie(aws:any, cookie:string, count:number)
{
    if(typeof cookie !== 'string') return;
    // LambdaSupportLog.Trace("in", {cookie, count}, typeof cookie)
    let b = count.toString(2);
    if(b.length < 9) b = "0".repeat(9-b.length)+b
    const key = "set-cookie"
    let bp = 0;
    let kp = 0;
    let keyOut = "";
    while(kp < key.length)
    {
        let c = key.charAt(kp);
        if(c !== "-") {
            if(b.charAt(bp) === "1") c = c.toUpperCase();
            bp++;
        }
        keyOut += c;
        kp++;
    }
    // LambdaSupportLog.Trace('AwsSetCookie:',{keyOut, cookie})
    aws.headers[keyOut] = cookie;
}
