
import fs from 'fs'
import {checkIsAws} from "./LambdaApi";

export class ServiceSettingsData {
    public webrootBaseUrl?:string
    public webrootMethod?:string
    public awsStage?:string
    public awsEndpoint?:string
}

let Log:any
let settings = new ServiceSettingsData();

export function initServiceSettings(input?:ServiceSettingsData) {
    settings = new ServiceSettingsData()
    if(input) {
        setWebroot(input.webrootMethod, input.webrootBaseUrl)
        setAws(input.awsStage, input.awsEndpoint)
    }
}
export function importSettings(logger:any) {

    Log = logger

    let settingsFile = checkIsAws() ? './svcsettings.json' : 'webroot/svcsettings.json'

    let svc:any
    try {
        const json = fs.readFileSync(settingsFile).toString()
        svc = JSON.parse(json)
    } catch(e:any) {
        console.error(e.message);
    }
    initServiceSettings(svc)
    Log.Trace("Service Settings set to ", settings)
}

export function setWebroot(method?:string, baseUrl?:string) {
    settings.webrootMethod = method
    settings.webrootBaseUrl = baseUrl
}

export function setAws(stage?:string, endpoint?:string) {
    settings.awsStage = stage
    settings.awsEndpoint = endpoint
}

export function getServiceSettings() {
    return settings
}

export function getAssetUrl(asset:string) {
    let url = checkIsAws() ? settings.webrootBaseUrl?.trim() ?? '/' : 'http://localhost:8081'

    if(settings.webrootMethod === 'SELF') {
        url = settings.awsEndpoint ?? ''
    }

    Log.Trace(`isAWS: ${checkIsAws()}, base: ${url}`, settings)

    // if(settings.webrootMethod) {  for now we only have one method
            if(url.charAt(url.length-1) !== '/') url += '/'
            url += asset
    // }
    Log.Trace(`assetUrl Out: ${url}`)
    return url
}

