// Service API Module
// adapted from original version created in tremho-services for Express
// This one is geared toward AWS lambda via API Gateway w/proxy event
import * as SessionManager from "./session/SessionManager";
import {UserReturnState} from "./session/SessionManager";
import {logger as Log} from "./Logger"
import * as fs from 'fs'



/**
 * Defines the declaration of a parameter
 * including some optional constraints (min, max, oneOf, match) and an optional default value
 */

export class ParamDef {
    name: string = ''
    type: string = ''
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

    /**
     * validate a value received for this parameter
     * @param value
     *
     * @return empty string if no error, otherwise a description of the error
     */
    validate(value:any):string {
        if(value === undefined && this.default !== undefined) {
            value = this.default
        }
        let vt:string = typeof value
        if(vt === 'object') {
            if(Array.isArray(value)) {
                vt = typeof value[0]
                if(vt === 'undefined') vt = ''
                vt += '[]'  // e.g. string[] or number[]
            }
        }
        let typeOk = false
        const types = this.type.split('|')
        for(let t of types) {
            t = t.trim()
            if(vt === t) {
                typeOk = true
                break;
            }
        }
        if(!typeOk) {
            return `Expected parameter "${this.name}" type to be ${this.type}, got ${vt}`
        }
        if(vt === 'number') {
            if(this.min !== undefined) {
                if(value < this.min) {
                    return `Parameter "${this.name}" value of ${value} is less than ${this.min}`
                }
            }
            if(this.max !== undefined) {
                if(value > this.max) {
                    return `Parameter "${this.name}" value of ${value} is greater than ${this.max}`
                }
            }
        }
        if(this.oneOf && this.oneOf.length) {
            let found = false
            for(let t of this.oneOf) {
                if(value === t) {
                    found = true;
                    break;
                }
            }
            if(!found) {
                return `Parameter "${this.name}" value "${value}" is not one of ${this.oneOf}`
            }
        }
        if(vt === 'string') {
            if(this.match) {
                const str:string = value
                const regx = new RegExp(this.match)
                if(!str.match(regx)) {
                    return `Parameter "${this.name}" value string "${value}" does not match pattern "${this.match}"`
                }
            }
        }
        return ''
    }

    /**
     * Documentation output for this parameter
     */
    document(format = 'html') {
        let out = '<li>'
        out += '<p>'
        if(this.default || this.type.indexOf('undefined') !== -1) {
            out += '['
        }
        out += `<strong>${this.name}</strong> {${this.type}}`
        if(this.default || this.type.indexOf('undefined') !== -1) {
            out += `] (default = ${this.default}`
        }
        out += `</p><p>`
        out += this.description
        out += '</p>'
        // out += '</li>'
        return out
    }
}

/**
 * Declares the return from the service
 * Used for server-side validation. Will throw on error.
 * Also used for documentation of API return.
 * @throws Error on validation problem
 */
export class ReturnDef {
    type: 'file'|'text'|'js'|''
    description: string = ''
    props: ParamDef[] = []

    constructor(type?:'file'|'text'|'js'|'', description?:string, props:ParamDef[] = []) {
        this.type = type || ''
        this.description = description || ''
        this.props = props
    }
    validate(value:any) {
        let vt:string = typeof value
        if(vt === 'object') {
            if(Array.isArray(value)) {
                vt = typeof value[0]
                if(vt === 'undefined') vt = ''
                vt += '[]'  // e.g. string[] or number[]
            }
        }
        let typeOk = false
        const types = this.type.split('|')
        for(let t of types) {
            t = t.trim()
            if(t === 'file' || t === 'text') t = 'string' // value is path
            if(t === 'js') {
                t = 'object'
                if(vt === 'undefined') {
                    vt = 'object'
                    value = {}
                }
            }
            if(vt === t) {
                typeOk = true
                break;
            }
        }
        if(!typeOk) {
            throw Error(`Return type ${types} expected, ${vt} found`)
        }
        if(vt === 'object' && this.props.length) {
            for(let p of this.props) {
                let rv = value[p.name]
                if(rv === undefined && p.default !== undefined) {
                    rv = p.default
                }
                let vt:string = typeof rv
                if(vt === 'object') {
                    if(Array.isArray(value)) {
                        vt = typeof value[0]
                        if(vt === 'undefined') vt = ''
                        vt += '[]'  // e.g. string[] or number[]
                    }
                }
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
                    throw Error(`Expected return property "${p.name}" to be ${p.type}`)
                }
                if(vt === 'number') {
                    if(p.min !== undefined) {
                        if(rv < p.min) {
                            throw Error(`Return property ${p.name} value of ${rv} is less than ${p.min}`)
                        }
                    }
                    if(p.max !== undefined) {
                        if(rv > p.max) {
                            throw Error(`Return property ${p.name} value of ${rv} is greater than ${p.max}`)
                        }
                    }
                }
                if(p.oneOf && p.oneOf.length) {
                    let found = false
                    for(let t of p.oneOf) {
                        if(rv === t) {
                            found = true;
                            break;
                        }
                    }
                    if(!found) {
                        throw Error(`Return property ${p.name} value of ${rv} is not one of ${p.oneOf}`)
                    }
                }
                if(vt === 'string') {
                    if(p.match) {
                        const str:string = rv
                        const regx = new RegExp(p.match)
                        if(!str.match(regx)) {
                            throw Error(`Return property ${p.name} value of ${rv} does not match pattern "${p.match}"`)
                        }
                    }
                }
            }
        }
    }
    document(format = 'html') {
        let out = '<li>'
        out += '<p>'
        out += `<strong>${this.type}</strong>`
        out += `</p><p>`
        out += this.description
        out += '</p>'
        if(this.props.length) {
            out += '<p>detail:</p>'
            out += '<li>'
            for(let p of this.props) {
                out += '<p>'
                if(p.default || this.type.indexOf('undefined') !== -1) {
                    out += '['
                }
                out += `<strong>${p.name}</strong> {${p.type}}`
                if(p.default || this.type.indexOf('undefined') !== -1) {
                    out += `] (default = ${p.default}`
                }
                out += `</p><p>`
                out += p.description
                out += '</p>'
            }
            out += '</li>'
        }

        return out
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

// Used to record all declared APIs so we can list them for documentation
const serviceApis:any = {}

// Used to record the routing by method/path
const routing:any = {}

/** Declares the callback format for handling service API business */
export type ServiceAction = (paramSet:ParamSet, session?:any, req?:any) => any

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
 * Defines how our proxy request values are mapped for our lanbda requests via API gateway
 * This is set up in the MappingTemplate of the API Gateway configuration for the API.
 */
export class LambdaRequestEvent {
    body:string  = '' // POST or other body in string form
    bodyObj:any       // body as an object depending upon content type
    requestId:string = '' // we'll use this for logging purposes.
    path:string = '' // as passed
    querystring:any // key/value pair POJSO
    headers:any // key/value pair POJSO
}
/**
 lambda proxy expects this format of a return
 */
export class LambdaResponse {
    statusCode: number = 200   // HTTP Response code
    headers:any = {}           // key/value pair POJSO
    body:string|object = ''    // response body.  If object is sent, response contains the stringified JSON
    resolver:any               // resolver function for sending response.  Set by constructor


    /**
     * Construct with a response callback (promise resolver)
     * @param responseCallback will be called with the LambdaResponse object on `send`
     */
    constructor(responseCallback:any) {
        this.resolver = responseCallback
    }
    /** Sets the status */
    status(statusCode:number) {
        this.statusCode = statusCode
    }
    /** set a value of a response header */
    setHeader(name:string, value:string) {
        this.headers[name] = 'value'
    }
    /** Sends the body response, and optionally a status code, if it was not previously set (or 200 by default) */
    send(body:string|object, statusCode?:number) {
        if(statusCode) this.status(statusCode)
        if(typeof body === 'object') {
            try {
                body = JSON.stringify(body)
            } catch(e) {}
        }
        this.body = body
        let respStr = JSON.stringify(this)
        this.resolver(respStr)
    }
    /** Reads a file at the given path and returns its contents */
    sendFile(path:string) {
        const contents = fs.readFileSync(path).toString()
    }
}

/**
 * The definition of the service
 */
export class ServiceDefinition {
    endpoint:string = ''
    method:Method = Method.GET
    sessionRequired:boolean = true
    userRequired: boolean = false
    description: string = ''
    parameters: ParamDef[] = []
    returns: ReturnDef = new ReturnDef()
}

/**
 * The handling object for a declared Service
 */
export class ServiceAPI {
    definition:ServiceDefinition = new ServiceDefinition()

    /**
     * Construct by passing a definition
     * or else no parameters
     * @param def
     */
    constructor(def?:ServiceDefinition) {
        if(def) this.setDefinition(def)
    }

    /**
     * Set or change the definition of this service
     * @param def
     */
    setDefinition(def:ServiceDefinition) {
        this.definition = def
    }

    /**
     * Validates the incoming request of a service call
     * @param req The Express Request object
     */
    validate(req:any):ParamSet|string {
        const pset = new ParamSet()
        const parameters = this.definition.parameters
        let message = ''
        for(let p of parameters) {
            let v = req.query[p.name]  // TODO: Expand to be aware of post parameters in different formats also
            let vresp = p.validate(v)
            if(vresp) {
                if(message) message += '\n'
                message += vresp
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
     * document this service api
     * @param format
     */
    document(format = 'html') {
        const def = this.definition
        let out = `<h2>${def.endpoint}</h2>`
        out += `<p>${def.description}</p>`
        out += `<p>Parameters:</p>`
        if(this.definition.parameters && this.definition.parameters.length) {
            out += '<ul>'
            for (let p of this.definition.parameters) {
                out += p.document(format)
            }
            out += '</ul>'
        }
        out += `<p>Returns:</p>`
        out += this.definition.returns.document(format)
        return out
    }
}


export function declareApi(def:ServiceDefinition, callback:ServiceAction) {
    let serviceApi = new ServiceAPI(def)
    let method: Method = serviceApi.definition.method
    let endpoint = serviceApi.definition.endpoint

    // Record
    serviceApis[endpoint] = serviceApi

    if(routing[method] && routing[method][endpoint]) {
        console.error(`Route Already Defined for ${endpoint} [${method}] -- declaration ignored`)
        return
    }
    const methodActor = routing[method] ?? {}
    methodActor[endpoint] = (req:LambdaRequestEvent, res:LambdaResponse) => {
        // get and validate the params per definition into a paramSet
        const psorst = serviceApi.validate(req)
        if (typeof psorst === 'string') {
            res.status(400) // bad request
            return res.send(psorst) // the accounting of all sins
        }

        // do the business
        let session:any;
        if(serviceApi.definition.sessionRequired) {
            const sessionId = SessionManager.enterSessionApi(req)
            session = SessionManager.getSession(sessionId)
        }
        let userState: UserReturnState = UserReturnState.NO_USER
        if (session) {
            userState = SessionManager.testUser(session)
        }
        if(serviceApi.definition.userRequired) {
            if (userState === UserReturnState.NO_USER) {
                Log.info('Informing login required')
                res.status(403)
                return res.send({message: 'login required'})
            } else {
                Log.info('returning user, user state is', userState.toString())
            }
        }


        Promise.resolve(callback(psorst, session, req)).then((result: any) => {
            if(session) SessionManager.leaveSessionApi(res, session)
            serviceApi.definition.returns.validate(result)
            // then return result
            if(serviceApi.definition.returns.type === 'file') {
                res.sendFile(result)
            } else {
                res.send(result)
            }
        })

    }
}

export function apiList() {

    let out = `<html>
<head>
<title>API Reference</title>
</head>
<body>
<ul>
`
    for(let n of Object.getOwnPropertyNames(serviceApis)) {
        const href = `/apidoc${n}`
        out += `<li><a href="${href}">${n}</a></li>\n`
    }
    out += '</ul>\n</body>\n</html>'
    return out
}

export function apiDoc(apiName:string, res:any) {
    const api = serviceApis[apiName]
    if(!api) {
        res.status(404)
        res.send('api not found')
    }
    res.send(api.document())
}