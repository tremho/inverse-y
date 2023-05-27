import {RequestEvent} from "./EventTypes";

export class ParsedRequest
{
    private eventData:any = {}
    private method:string

    constructor(reqEvent:RequestEvent) {
        let event = {}
        // build event from query string (applies to all rest methods)
        let qs = (reqEvent.rawQueryString ?? "").trim()
        if(qs.charAt(0) === '?') qs = qs.substring(1);
        const qitems = qs.split("&") //?foo=42&bar=69
        for(let pair of qitems) {
            const kv = pair.split('=');
            let [key,value] = kv;
            key = key.trim();
            value = value.trim();
            // @ts-ignore
            event[key] = value;
        }
        this.method = (reqEvent.requestContext?.method ?? "").toLowerCase()
        if (this.method === 'post') {
            // @ts-ignore
            event = Object.assign(event,reqEvent.body ?? {});
        } else if (this.method === 'get') {
        } else if (this.method === 'patch') {
        } else if (this.method === 'delete') {
        } else {
            event = (reqEvent as any);
            this.method = "event"
        }
        this.eventData = event


    }
}