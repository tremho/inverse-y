import {RequestEvent} from "../request/EventTypes";
import {ServerError, Success} from "./Responses";
import {Log} from "../Logging/Logger"
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

// Returns a string. if the string != '' it is an validation error message
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
 *   "logLevel": "Debug",
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
    allowedMethods?: string = 'POST'
    logLevel?:string = 'None'   // will match to enum
    parameters?: ParamDef[] = []
    returns?: ReturnDef = new ReturnDef()
    schemas?: object
    sessionRequired?: boolean = true
    userRequired?: boolean = false
    onRequest?: (request: RequestEvent) => void
}

/** Declares the callback format for handling service API business */
export type Handler = (event?:any) => Promise<any>

/**
 * The handling object for a declared Service
 */
export class LambdaApi<TEvent> {
    definition:ServiceDefinition = new ServiceDefinition()
    handler?:Handler

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

    entryPoint(event: TEvent|RequestEvent, context:any, callback:any) {

        // start with fixup of event being passed in as string
        if(typeof event === 'string') event = JSON.parse(event);

        // console.log("EntryPoint")
        // console.log("context", context);
        // console.log("callback", callback);
        if((event as RequestEvent).version) {
            throw Error("Found a case of RequestEvent -- Don't remove that code after all!!");
            /*
            if(typeof this.definition.onRequest === 'function') {
                this.definition.onRequest(event as RequestEvent);
            }
            // assume this is a request. our event payload is in the body
            event = (event as RequestEvent).body;
             */
        }
        // console.log("EntryPoint validation")
        const v = this.validate((event as TEvent))
        // console.log("EntryPoint validation v = ", v)
        if (typeof v === 'string') {
            // console.log("EntryPoint validation v  is string")
            return ServerError("Parameter validation fails: "+v)
        }

        if(this.handler) {
            try {
                console.log(">> Predicate: Need to adorn event from ", {event, context})
                let xevent = adornEventFromLambdaRequest(event)
                console.log("calling handler, expecting promise "+JSON.stringify((xevent)))
                // TODO: Validate return
                return this.handler(xevent)
            } catch(e:any) {
                Log.Exception(e);
                return ServerError(e.message);
            }

        }
    }
}

function adornEventFromLambdaRequest(eventIn:any):Event
{
    if(!eventIn.requestContext) throw new Error("No request context in Event from Lambda!");
    const req = eventIn.requestContext;

    const domain = req.domainName;

    const path = "https://"+domain+req.resourcePath;
    console.log(">> path (originalurl) found to be "+path);
    let host = req.headers?.origin ?? domain
    if(!host) {
        host = req.headers?.referer ?? "";
        let ptci = path.indexOf("://")+3;
        let ei = path.indexOf("/", ptci);
        host = ptci > 3 ? path.substring(0, ei) : "";
    }
    if(!host) {
        // todo: http or https?
        host = "http://"+req.headers?.host ?? "";
    }
    console.log("host is "+host)

    var cookies:any = {};
    var cookieString = req.headers?.cookie ?? "";
    var crumbs = cookieString.split(';')
    for(let c of crumbs) {
        const pair:string[] = c.split('=');
        if(pair.length === 2) cookies[pair[0]] = pair[1]
    }
    // todo: this just grabs parameters from a "function request" and not from a templated path or query values
    // need the template here somehow in aws context.  This is otherwise done in express.
    const parameters:any = eventIn.parameters ?? {}

    const eventOut:any = {
        request: {
            originalUrl: path,
            headers: req.headers
        },
        cookies,
        parameters
    }
    return eventOut;
}
