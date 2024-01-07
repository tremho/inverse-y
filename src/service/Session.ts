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

/**
 * Defines the basic properties of a Session.
 * Apps should put all of their specifics in the app section
 */
export class Session {
    id: string = ""
    appId: string = ""
    userToken: string = ""
    provider: string = ""
    siaToken:string = ""
    createdAt: number = Date.now()
    authenticatedAt: number = 0;
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
export async function sessionGet(incomingSessionId?:string):Promise<Session | undefined>
{
    let session = new Session();
    try {
        if (incomingSessionId) session = await s3GetObject(BUCKET_SESSION, incomingSessionId);
    }
    catch(e)
    { }

    if (!session.id) {
        session.id = randomUUID();
        session.authenticatedAt = 0; // invalid
        // await sessionSave(session); // don't save an empty session
    }
    return session // if no session matches, we will login to find or create one for user
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
    valid = valid && Date.now() - session.authenticatedAt < expireMS;

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
 * Delete the session
 * @param session
 */
export async function sessionDelete(sessionId:string)
{
    try {
        await s3Delete(BUCKET_SESSION, sessionId)
    } catch(e:any) {
        // ignore exception
    }
}

