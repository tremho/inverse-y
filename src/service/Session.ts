/**
 * Handle login and obtaining a new or former session
 */
import {
    s3GetObject,
    s3PutObject,
    s3Delete
} from "../Support/S3Actions"
import {
    createSiaToken,
    reserveSlotForSIA
} from "../Support/SiaToken"
import {randomUUID} from "crypto";
import http from "http";


const BUCKET_SESSION = "tremho-services-session"

let _loginHost = "";

/**
 * Defines the basic properties of a Session.
 * Apps should put all of their specifics in the app section
 */
export class Session {
    id: string = ""
    appId: string = ""
    authenticatedAt: Date = new Date(0)
    provider: string = ""
    app: any = {}
}

// get session, use an id if given, otherwise skip to not found. also record any passed domain for later.
// try to retrieve former session
// if not found: create an empty session with a new uuid
// return whatever we found/created

/**
 * Tries to retrieve the session referenced from the incoming session Id
 * If there is none, or this fails to find a session, then a new one is created.
 * The host domain is passed in because this is used for fetching the sso login page
 * The caller should record the Id of the returned session for future calls.
 * Sessions will expire in 24 hours.
 * @param incomingSessionId
 * @param hostDomain
 */
export async function sessionGet(incomingSessionId:string, hostDomain:string):Promise<Session>
{
    if(hostDomain) _loginHost = hostDomain;

    const session = incomingSessionId ? await s3GetObject(BUCKET_SESSION, incomingSessionId) : new Session();
    if(!session.id) {
        session.id = randomUUID();
        await sessionSave(session);
    }
    return session
}

/**
 * Check to see if this session is still valid or if a new login is needed
 * @param session
 */
export function sessionIsValid(session:Session):boolean
{
    const expireMS = 24 * 3600 * 1000; // 24 hours
    var valid = !!session.id;
    valid = valid && !!session.provider
    valid = valid && Date.now() - session.authenticatedAt.getTime() < expireMS;

    return valid
}

/**
 * Save the session and all of its values
 * @param session
 */
export async function sessionSave(session:Session)
{
    await s3PutObject(BUCKET_SESSION, session.id, session);
}

/**
 * Return the HTML page content that initiates the login
 * using the given provider, and for the given application.
 * @param appId
 * @param providerId
 */
export async function sessionGetLoginPage(appId:string, providerId:string)
{
    const jwt = await createSiaToken(appId ?? "");
    await reserveSlotForSIA(appId ?? "", jwt);
    const t = Date.now();
    const page = await sessionSSOforProvider(appId ?? "", providerId ?? "", jwt);
    return page
}

async function sessionSSOforProvider(appId:string, providerId:string, siaToken:string)
{
    return new Promise(resolve => {
        http.get(`${_loginHost}/sso/${providerId}.html`, res =>{
            if(res.statusCode === 200)
            {
                let data = '';
                res.on('data', chunk => { data += chunk });
                res.on('close', () => {
                    resolve(data
                        .replace("SIA_TOKEN_GOES_HERE", siaToken)
                        .replace("APPID_GOES_HERE", appId)
                    );
                })
            }
        })
    })
}
