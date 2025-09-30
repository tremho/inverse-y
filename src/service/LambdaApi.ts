import {RequestEvent} from "../request/EventTypes";
import {ServerError, Success} from "./Responses";
import {LambdaSupportLog, Log} from "../Logging/Logger"
import {base64url} from "jose";
import {importSettings, setAws} from "./ServiceSettings";
export {RequestEvent as RequestEvent}

let areWeRunningUnderAws = false;
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

        // LambdaSupportLog.Trace("Welcome to the debugging trace at Line 287")

        const stage = (event as any).requestContext?.stage
        const isAws = stage !== undefined && stage !== "undefined"
        LambdaSupportLog.Trace("AWS stage", {isAws, stage})
        areWeRunningUnderAws = isAws

        importSettings(LambdaSupportLog)

        // LambdaSupportLog.Info(isAws ? "AWS Lamdba context detected" : "Local context detected");
        // LambdaSupportLog.Info("Service Definition", this.definition);

        // if(isAws) LambdaSupportLog.Info("Service entry event", event);

        // LambdaSupportLog.Trace("entry point 1")

        if(isAws) {
            Log.enableColor('Console', false)
            LambdaSupportLog.setMinimumLevel('Console', 'trace')
            LambdaSupportLog.enableColor('Console', false)
        }

        // LambdaSupportLog.Trace("entry point 2")

        if(this.handler) {
            // LambdaSupportLog.Trace("Line 312")

            try {
                // LambdaSupportLog.Trace("entry point 3 - before adornment")

                let anyEvent:any = {};
                if(!isAws) {
                    anyEvent = event as any;
                    anyEvent.requestContext = {};
                }
                let xevent:any = adornEventFromLambdaRequest(event, this.definition)

                // LambdaSupportLog.Trace("entry point 3B - past adornment")

                if(!isAws) {
                    // LambdaSupportLog.Trace("entry point 3C")
                    // If a local request, get adornment values from there
                    xevent.parameters = anyEvent.local?.parameters ?? anyEvent.parameters ?? {}
                    xevent.cookies = anyEvent.local?.cookies ?? anyEvent.cookies ?? {}
                    xevent.headers = anyEvent.local?.headers ?? anyEvent.headers ?? {}
                    xevent.body = anyEvent.local?.body ?? anyEvent.body ?? {}
                    // LambdaSupportLog.Trace("entry point 3D")
                    // LambdaSupportLog.Trace("possible alternate body adjust point")

                }
                // LambdaSupportLog.Trace("Line 335")

                // LambdaSupportLog.Trace("entry point 4")
                // LambdaSupportLog.Trace("XEvent after adornment", xevent)
                LambdaSupportLog.Trace("Calling handler...")
                const oldDefName = Log.setDefaultCategoryName(this.definition.name)
                const rawReturn = await this.handler(xevent);
                Log.setDefaultCategoryName(oldDefName)
                // LambdaSupportLog.Trace("RawReturn is", rawReturn);

                // LambdaSupportLog.Trace("entry point 5")

                const resp = AwsStyleResponse(rawReturn, isAws);
                // LambdaSupportLog.Debug("response out", resp);
                return resp;
            } catch(e:any) {
                // LambdaSupportLog.Trace("entry point 6")
                LambdaSupportLog.Exception(e);
                return ServerError(e.message);
            }

        }
    }
}

let method

// More fixup mapping for request events
function adornEventFromLambdaRequest(eventIn:any, def:any):Event
{
    const template = def?.pathMap ?? ''
    const bodyType = def?.bodyType ?? 'text'

    // LambdaSupportLog.Trace('>>> adornEventFromLambdaRequest', {eventIn})
    let headers = eventIn?.request?.headers ?? eventIn?.headers ?? {}
    // LambdaSupportLog.Trace('>>> headers at adornment ', {headers})
    // LambdaSupportLog.Trace("Line 363")
    try {
        if (!eventIn.requestContext) throw new Error("No request context in Event from Lambda!");
        const req = eventIn.requestContext;

        if(req.stage !== undefined) LambdaSupportLog.Debug("Incoming request context", req)
        method = req.httpMethod
        let cookiesFromSomewhere = eventIn.multiValueHeaders?.Cookie ?? [headers?.Cookie];
        if(eventIn.cookies) {
            cookiesFromSomewhere = [];
            for(let k of Object.getOwnPropertyNames(eventIn.cookies)) {
                let v = eventIn.cookies[k];
                cookiesFromSomewhere.push(`${k}=${v}`)
            }
        }
        // LambdaSupportLog.Trace("Line 378")

        const domain = req.domainName ?? "";

        const stage = (req.path?.indexOf(req.stage) !== -1 && req.stage) ? req.stage : ''
        Log.trace('qualified stage', {stage})

        const pathLessStage = stage ? req.path.substring(stage.length + 1) : req.path;
        if(stage) LambdaSupportLog.Trace(`path values`, {path: req.path, stage, pathLessStage})
        let path = domain ? "https://" + domain + pathLessStage : req.path ?? eventIn.request?.originalUrl ?? "";

        setAws(stage, "https://" + domain + '/' + stage)

        let host = headers?.origin ?? domain
        if (!host) {
            host = headers?.referer ?? "";
            let ptci = path.indexOf("://") + 3;
            let ei = path.indexOf("/", ptci);
            host = ptci > 3 ? path.substring(0, ei) : "";
        }
        if (!host) {
            // todo: http or https?npm
            host = "http://" + headers?.host;
        }
        // console.LambdaSupportLog("host is "+host)
        // if(!domain) path = host + req.path;

        // LambdaSupportLog.Trace("Line 403")

        const parameters: any = eventIn.parameters ?? {}
        if(req.stage) { // ignore for local request
            var cookies: any = {};
            var cookieString = headers?.cookie ?? (cookiesFromSomewhere ?? []).join(';');
            LambdaSupportLog.Trace("Request Cookies", cookieString)
            var crumbs = cookieString.split(';')
            for (let c of crumbs) {
                c = c.trim();
                if(!c) continue;
                const pair: string[] = c.split('=');
                if (pair.length === 2) cookies[pair[0].trim()] = pair[1]
                LambdaSupportLog.Debug(`setting cookie '${pair[0]}' = '${pair[1]}'`)
            }
            LambdaSupportLog.Trace('Resulting cookie set', {cookies})
            const tslots = template.split('/').slice(1);
            let pslots = path.split('/').slice(3);
            LambdaSupportLog.Trace('pslots and tslots', {pslots, tslots})
            if(tslots[0] !== 'webroot' && tslots[0] !== 'fileserve') {
                while (pslots.length > 0 && pslots[0] !== tslots[0]) { // align on first non-dynamic path in common (these may be different at first because of deployment path prefixing)
                    pslots = pslots.slice(1)
                }
            }
            LambdaSupportLog.Trace("extracting path parameters", {tslots, pslots})
            for (let i = 0; i < tslots.length; i++) {
                const brknm = (tslots[i] ?? "").trim();
                if (brknm.charAt(0) === '{') {
                    const pn = brknm.substring(1, brknm.length - 1);
                    if (parameters[pn] === undefined) {
                        let pv:string|undefined =  (pslots[i] ?? "").trim();
                        if(pv === 'undefined' || pv === '~') pv = undefined
                        parameters[pn] = pv
                        // LambdaSupportLog.Trace("values:", {pn, value: parameters[pn]})
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
        // LambdaSupportLog.Trace("Line 447")

        //=====
        // let's see if we can form our bodies to match expectations
        //++++++
        let body: any = eventIn.body ?? ''
        if(checkIsAws()) {
            let type = bodyType
            const options: any = {
                "text": "text",
                "json": "json",
                "application/json": "json",
            }
            if (type) {
                type = type.toLowerCase().trim()
                if (type.substring(0, 5) === 'text/') type = "text"
                else type = options[type]
            }
            LambdaSupportLog.Info("Checking LambdaAPI body2Buffer")
            // if it's a binary body, we want to make it a buffer
            // keep any text bodies as they are
            LambdaSupportLog.Info("eventIn.body type incoming = ", typeof body)
            LambdaSupportLog.Info("The type we want per bodyType = ", type)
            if (type === 'text') {
                // LambdaSupportLog.Info("We want text")
                if(typeof req.body === 'object') {
                    LambdaSupportLog.Info("We have object")
                    if(Buffer.isBuffer(body)) {
                        LambdaSupportLog.Info("We are converting a buffer to string")
                        body = body.toString()
                    } else {
                        LambdaSupportLog.Info("We are assuming the object is json", body)
                        LambdaSupportLog.Info("We can test it for properties. this has ", Object.getOwnPropertyNames(body).length)
                        body = JSON.stringify(body)
                    }
                }
            }
            else if (type === 'json') {
                LambdaSupportLog.Info('We want JSON')
                if(typeof body === 'object') {
                    LambdaSupportLog.Info("We have object")
                    if(Buffer.isBuffer(body)) {
                        LambdaSupportLog.Info("and it's a buffer, so we turn it to a string here")
                        body = body.toString()
                    }
                }
                if (typeof body === 'string') {
                    LambdaSupportLog.Info("We have a string")
                    try {
                        LambdaSupportLog.Info("So we parse it as JSON")
                        body = JSON.parse(body)
                    } catch (e: any) {
                        LambdaSupportLog.Error('Failed request body JSON parse')
                    }
                }
            } else {
                // binary expects a buffer
                LambdaSupportLog.Info("We want a buffer")
                if (Buffer.isBuffer(body)) {
                    LambdaSupportLog.Info("we are one already")
                } else {
                    LambdaSupportLog.Info("and we aren't one")
                    if (typeof body === 'object') {
                        LambdaSupportLog.Info("but we are an object, so stringify it first")
                        body = JSON.stringify(body) // make a string first before we bufferize the json
                    }
                    LambdaSupportLog.Info("Bufferizing the body")
                    let summary = "Binary Body Summary:\n"
                    summary += "- body is type "+ typeof body+ '\n'
                    if(typeof body === 'string') summary += '- length = '+body.length + "\n"
                    summary += '- checking if AWS used base64 encoding: '+eventIn.isBase64Encoded +'\n'
                    LambdaSupportLog.Info("turning binary string to buffer")
                    const encoding = eventIn.isBase64Encoded ? 'base64' : 'binary'
                    summary += '- encoding '+ encoding + '\n'
                    const buffer = Buffer.from(body, encoding)
                    summary += '- buffer bytelength is '+buffer.byteLength + '\n'
                    summary += 'First 16 bytes: ' + buffer.subarray(0, 16).toString('hex') + '\n'
                    // let off =
                    summary += 'Last 16 bytes: ' + buffer.subarray(buffer.byteLength - 16).toString('hex') + '\n'

                    body = buffer
                    LambdaSupportLog.Info(summary)
                }
            }
            LambdaSupportLog.Trace("past if/else (type) ", type)
            //------
        }
        LambdaSupportLog.Trace("at top of eventOut start, body type is now " + typeof body)
        let isProxyPath;
        if(parameters["proxy+"]) {
            delete parameters["proxy+"]
            isProxyPath = true
        }
        const eventOut: any = {
            request: {
                originalUrl: path,
                headers
            },
            method,
            isProxyPath,
            pathParts: pathLessStage?.substring(1).split('/') ?? [],
            stage: req.stage,
            cookies,
            parameters,
            body
        }
        LambdaSupportLog.Info("eventOut complete")
        return eventOut;
    }
    catch(e:any) {
        // LambdaSupportLog.Trace("catch at line 526")
        LambdaSupportLog.Exception(e);
        throw e;
    }
}

// format response in AWS style
export function AwsStyleResponse(resp:any, isAws?:boolean):any
{
    LambdaSupportLog.Trace("In AwsStyleResponse"); // with incoming resp", resp)
    if(resp) {
        if(resp.isBase64Encoded !== undefined && resp.statusCode && resp.headers && resp.body) return resp; // it's already aws form

        const aws:any = { statusCode: 500, body: "Error: No response mapped!", headers:{"content-type": "text/plain"} }
        if(typeof resp != "object") {
            LambdaSupportLog.Trace('Resp is type '+typeof resp )
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
        LambdaSupportLog.Trace("AwsStyleResponse -- adding CORS headers")
        aws.headers['Access-Control-Allow-Origin'] = '*'
        aws.headers['Access-Control-Allow-Headers'] = '*'
        aws.headers['Access-Control-Allow-Credentials'] = 'true'
        aws.headers['Access-Control-Allow-Methods'] = '*'

        if (resp.statusCode !== undefined) {
            aws.statusCode = resp.statusCode;
            // delete resp.statusCode
        }
        // content type resolution
        let body = resp.body ?? resp.result ?? resp
        LambdaSupportLog.Trace('ContentType resolution, body type =', typeof body)
        LambdaSupportLog.Trace('pre-existing contentType', resp.contentType)
        if(typeof body === 'object') {
            if(resp.isBinary) {
                // if(isAws) {
                //     if(body instanceof Buffer) {
                //         resp.body = body.toString('base64')
                //         resp.isBase64Encoded = true
                //         LambdaSupportLog.Trace("body converted to base64")
                //     }
                // } else {
                    resp.body = body;
                    resp.isBinary = resp.isBase64Encoded = false
                // }
            } else {
                resp.body = JSON.stringify(body)
                resp.contentType = 'application/json'
                // LambdaSupportLog.Trace('Body stringified to ', body)
            }
        } else if(typeof body == 'string') {
            if(resp.isBinary && !resp.isBase64Encoded) {
                Log.Debug("Body said to be binary, but not base64")
                Log.Debug('>>> Body is unaltered from binary provided')
            }
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

        LambdaSupportLog.Debug("AWS Response body length ", {length: aws.body?.length ?? 0});
        if(aws.body?.length < 2500) {
            LambdaSupportLog.Debug("AWS response ", aws)
        }
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

export function checkIsAws() {
    return areWeRunningUnderAws
}
