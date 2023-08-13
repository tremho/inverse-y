/**
 * Support for SIA tokens used in Login
 */

import {serverInstance} from "../service/ServerInstance";
import {nowSeconds, nowSecondsHex} from "./TimeHelper";
import short from "short-uuid"
import { SignJWT,jwtVerify } from "jose"
import sha1 from "sha1"
import {Log} from "../Logging/Logger"
import {s3PutObject, s3GetObject} from "./S3Actions";
import {Session} from "../service/Session";

const BUCKET_SIA_SLOTS = 'tremho-services-sia-slots'


let crypto:any
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is disabled!');
}

/**
 * Format of the data in a slot
 * Provider data differs per provider, and may be empty. Additional info, not required, but may be useful.
 * userId is created by SSO handler as a sha1 from provider values
 */
export class SlotData {
    appId: string = ""
    siaToken: string = ""
    redirect: string = ""
    sessionId: string = ""
    createdMs: number = Date.now()
    filledMs: number = 0;
    providerData: any = {}
    userId: string = "";
}

/**
 * Create a SIA token needed for login authorization
 * @param appId
 */
export async function createSiaToken(appId:string):Promise<string> // returns token or ''
{
    const slotId = `${nowSecondsHex()}-${short.generate()}`;
    console.log(`SIA-ID`, {slotId});

    const siaToken = new SignJWT({
        "com.tremho.jwt.sia": true,
        slotId
    })
    siaToken.setAudience(appId)
    let uNow = nowSeconds()
    siaToken.setIssuedAt(uNow)
    siaToken.setNotBefore(uNow)
    siaToken.setExpirationTime('1h') // expires in 1 hour
    siaToken.setIssuer('https://tremho.com')
    siaToken.setSubject(appId+':sso:'+slotId)
    siaToken.setJti(createJTI(slotId)) // a 'uuid'. Make this a hash of time and slot and server instance ID
    siaToken.setProtectedHeader({"alg": "HS256"})
    return siaToken.sign(serverInstance.secretKey).then(signature => {
        return signature
    }).catch(e => {
        // TODO: other such patterns
        console.error('SIA JWT signing failed', e)
        return ''
    })
}

function createJTI(slotId:string):string {
    try {
        return sha1(serverInstance.id + '\n' + slotId + '\n' + Date.now()).toString();
    } catch(e) {
        console.error(e)
        return ''
    }
}

/**
 * Get the slot ID from the sia token
 * @param appId
 * @param siaToken
 */
export async function getSlotIdFromToken(
    appId: string,
    siaToken:string
):Promise<string>
{
    const jwt = await jwtVerify(siaToken, serverInstance.secretKey);
    Log.Trace('successful return of jwtVerify (verify SIA)')
    Log.Trace('    ' + JSON.stringify(jwt))
    Log.Trace('')
    Log.Trace(' -- protected Header-- ')
    Log.Trace('   ' + JSON.stringify(jwt.protectedHeader))
    Log.Trace(' -- payload-- ')
    Log.Trace('   ' + JSON.stringify(jwt.payload))

    // more validation
    let validationError = ''
    let slot:string = '';
    if (jwt.payload.iss !== 'https://tremho.com') {
        validationError += ' invalid iss'
    }
    if (appId !== '*' && jwt.payload.aud !== appId) {
        validationError += ' invalid aud'
    }
    let exp:number = jwt.payload.exp ?? 0;
    let iat:number = jwt.payload.iat ?? 0;
    let auth_time:number = (jwt.payload as any).auth_time ?? 0;
    if (auth_time * 1000 >= Date.now()) {
        validationError = ' created in future/clock error'
    } else if (iat < auth_time||0) {
        validationError = ' bad iat/auth_time'
    } else if (exp * 1000 < Date.now()) {
        validationError = ' expired token'
    }
    slot = (jwt.payload as any).slotId ?? ""
    // deep validation of c_hash to 'code' value of idToken could be possible, but we'll skip that

    if (validationError) {
        Log.Error('SIA validation error: ' + validationError)
        slot = ""
    }
    Log.Info("Resolved slot id as "+slot)
    return slot

}

/**
 * Reserves a slot for where the provider data will go for this siaToken
 * @param siaToken
 */
export async function reserveSlotForSIA(
    session:Session,
    siaToken:string
)
{
    // first off, get the slotId out of the JWT
    const slotId = await getSlotIdFromToken(session.appId, siaToken);

    // Create empty slot data
    const data = new SlotData();
    data.appId = session.appId;
    data.siaToken = siaToken
    data.sessionId = session.id;

    try {
        await s3PutObject(BUCKET_SIA_SLOTS, slotId, data)
        console.log("Slot data put at "+slotId)
    }
    catch(e) {
        Log.Exception(e);
        throw e
    }
}

export async function getSlotData(slotId:string):Promise<SlotData>
{
    try {
        console.log("retrieving slot data at "+slotId)
        return  await s3GetObject(BUCKET_SIA_SLOTS, slotId)
    }
    catch(e) {
        console.error("failed to get slot data at "+slotId)
        Log.Exception(e);
        throw e
    }
}




