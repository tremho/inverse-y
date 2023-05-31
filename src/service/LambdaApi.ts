import {RequestEvent} from "../request/EventTypes";
export {RequestEvent as RequestEvent}

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
            throw Error(`Expected parameter "${this.name}" type to be ${this.type}, got ${vt}`)
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
                throw Error(`Parameter "${this.name}" value "${value}" is not one of ${this.oneOf}`)
            }
        }
        if(vt === 'string') {
            if(this.match) {
                const str:string = value
                const regx = new RegExp(this.match)
                if(!str.match(regx)) {
                    throw Error(`Parameter "${this.name}" value string "${value}" does not match pattern "${this.match}"`)
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
    props?: ParamDef[] = []

    constructor(type?:'file'|'text'|'js'|'', description?:string, props:ParamDef[] = []) {
        this.type = type || ''
        this.description = description || ''
        this.props = props
    }

    validate(value:any) {
        let trace = ''
        let vt:string = typeof value
        trace = 'value in = '+value;
        if(vt === 'object') {
            trace = 'vt is object'
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
            throw Error(`Return type ${types} expected, ${vt} found (${trace})`)
        }
        if(vt === 'object' && this.props?.length) {
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
        if(this.props?.length) {
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
 */
export class ServiceDefinition {
    name: string = ''
    version? :string
    description?: string = ''
    uri: string = ''
    allowedMethods?: string = 'POST'
    logLevel?:string = 'None'   // will match to enum
    parameters?: ParamDef[] = []
    returns?: ReturnDef = new ReturnDef()
    sessionRequired?: boolean = true
    userRequired?: boolean = false
    onRequest?: (request: RequestEvent) => void
}

/** Declares the callback format for handling service API business */
export type Handler = (event?:any) => any

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
            let v = (event as any)[p.name]  // TODO: Expand to be aware of post parameters in different formats also
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

    entryPoint(event: TEvent|RequestEvent) {
        if((event as RequestEvent).version) {
            if(typeof this?.definition?.onRequest === 'function') {
                this.definition.onRequest(event as RequestEvent);
            }
            // assume this is a request. our event payload is in the body
            event = (event as RequestEvent).body;
        }
        const v = this.validate((event as TEvent))
        if (typeof v === 'string') {
            return LambdaApi.returnResult({statusCode: 500, result: "Parameter validation fails: "+v})
        }
        if(this.handler) {
            var resultObj = this.handler(event);
            if (resultObj.statusCode >= 200 && resultObj.statusCode < 300) {
                this.definition.returns?.validate(resultObj.result);
            }
            return LambdaApi.returnResult (resultObj);

        }
    }

    static returnResult(resp: { result:any, statusCode?:number })
    {
        return  {
            statusCode: resp.statusCode ?? 200,
            data: resp.result,
        };

    }


    /**
     * document this service api
     * @param format
     */
    document(format = 'html') {
        const def = this.definition
        let out = `<h2>${def.name}</h2>`
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
        out += this.definition.returns?.document(format) ?? "Not defined"
        return out
    }
}
