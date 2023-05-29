
/*

SessionManager module
Handles the detail of recognizing and maintaining a session with a client application.
Sessions are identfied by ids that are maintained by passing between client and server on each exchange.
Session Ids are rotated each time for security.

Exports SESSION_ID, NEXT_SESSION_ID constants, SessionSpace class definition (not commonly needed to use)
and the enterSessionApi and leaveSessionApi functions (to be called for each session-aware API implementation)
 */


import {Log} from "../../Logging/Logger"
let crypto:any
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is disabled!');
}

// N.B. Header keys must be lowercase
export const SESSION_ID = 'x-tbd-session-id'
export const NEXT_SESSION_ID = 'x-tbd-next-session-id'

const initVector = crypto.randomBytes(16)
const securityKey = crypto.randomBytes(32)
class EncryptDecrypt {

    encrypt(message:string):string {
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(securityKey), initVector);
        let encrypted = cipher.update(message);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return encrypted.toString('hex')
    }
    decrypt(encrypted:string):string {
        let iv = Buffer.from(initVector.toString('hex'), 'hex');
        let encryptedText = Buffer.from(encrypted, 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(securityKey), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
}


const sessionSet:any = {}
const maxSessions = 1000

const crypter: EncryptDecrypt = new EncryptDecrypt()

export class SessionSpace {
    sessionId:string = ''
    createdAt:number = 0
    lastAccessedAt:number = 0
    intervalTime:number = 0
    firstApi:string = ''
    lastApi: string = ''
    appId?:string
    userId?:string
    data:any = {}
}

function newSession(fromApi:string, appId?:string) {
    let count = Object.getOwnPropertyNames(sessionSet).length
    if (count >= maxSessions) {
        Log.Info(`[clean] initiating cleanSessions at ${count} sessions retained`)
        cleanSessions()
    }
    const sessionId:string = makeNewSessionId()
    const sessionSpace:SessionSpace = sessionSet[sessionId] = new SessionSpace()
    sessionSpace.sessionId = sessionId
    sessionSpace.createdAt = sessionSpace.lastAccessedAt =Date.now()
    sessionSpace.firstApi = sessionSpace.lastApi = fromApi
    sessionSpace.appId = appId

    Log.Info('[session] created session ' + sessionId)

    return sessionSpace
}

function removeMostIdleSession() {
    const now = Date.now()
    let mostIdleId:string = ''
    let mostIdleTime:number = 0
    Object.getOwnPropertyNames(sessionSet).forEach(sessionId => {
        const session = sessionSet[sessionId]
        const idle = now - session.lastAccessedAt
        if(idle > mostIdleTime) {
            mostIdleId = sessionId
            mostIdleTime = idle
        }
    })
    if(mostIdleId) {
        Log.Info(`[clean] removing session ${mostIdleId}, idle for ${mostIdleTime} ms`)
        delete sessionSet[mostIdleId]
    }
}

function cleanSessions() {
    const threshold = maxSessions * 0.9
    while(Object.getOwnPropertyNames(sessionSet).length > threshold) {
        removeMostIdleSession()
    }
}

function makeNewSessionId(previousId?:string):string {
    let rawId = 0
    if(previousId) {
        rawId = Number(crypter.decrypt(previousId))
    }
    rawId++ // next Id
    const nextId = crypter.encrypt(''+rawId)
    return nextId
}

function updateSessionId(ssnParam:SessionSpace | string):string {

    let session:SessionSpace|undefined
    if(typeof ssnParam === 'string') {
        session = getSession(ssnParam as string)
    } else {
        session = (ssnParam as SessionSpace)
    }
    // make a new id
    if(session) {
        const newId = makeNewSessionId(session.sessionId)
        // remove our current self
        delete sessionSet[session.sessionId]
        // make our new self instead
        session.sessionId = newId
        sessionSet[session.sessionId] = session

        return session.sessionId // return new id
    }
    return '' // undefined session''
}

export function getSession(sessionId:string | undefined):SessionSpace|undefined {
    if(sessionId) {
        const sessionSpace: SessionSpace = sessionSet[sessionId]
        return sessionSpace
    }
}


/**
 * Call at the top of any API entry endpoint to resume a session or establish a new one
 * A valid Session ID in header will resume a session, otherwise a new one is started.
 * The session ID is returned and may be passed to internal APIs for session / user context.
 *
 * After processing the request, call `leaveSessionApi(res, sessionId)` to complete the
 * session transaction protocol, then send the response from the api.
 *
 * @param apiName Name of the Api endpoint that calls here.
 * @param req Incoming request object from express
 *
 */
export function enterSessionApi(req:any) {
    try {
        const sessionId = req.headers[SESSION_ID]
        const appId = req.query['appId']
        let apiName = req.originalUrl
        let n = apiName.indexOf('?')
        if(n === -1) n = apiName.length;
        apiName = apiName.substring(0, n)
        n = apiName.lastIndexOf('/')
        apiName = apiName.substring(n)
        if (!appId) {
            Log.Warn('no appId passed entering session Api ' + apiName)
        }
        let session = getSession(sessionId)
        if (!session) {
            session = newSession(apiName, appId)
        }
        session.intervalTime = session.lastAccessedAt ? Date.now() - session.lastAccessedAt : 0
        session.lastAccessedAt = Date.now()
        session.lastApi = apiName
        // @ts-ignore
        sessionSet[session.sessionId] = session
        return session.sessionId
    } catch(e) {
        Log.Exception(e)
    }
}

/**
 * Call after processing the api endpoint request, just prior to responding.
 * This will handle the updating of session Id for rotation and
 * populate the outgoing header with the new value
 *
 * @param res the Express Response object from the api handler
 * @param sessionId the sessionId provided by `enterSessionApi`
 */
export function leaveSessionApi(res:any, ssnParam?:string | SessionSpace) {
    let newId
    if(ssnParam) {
        try {
            newId = updateSessionId(ssnParam)
            res.header(NEXT_SESSION_ID, newId)
        } catch (e) {
            Log.Exception(e)
        }
    }
    return newId
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const userLoginExpired = 15 * MINUTE;// testing, else: 30 * DAY;
const welcomeBackLapseTime = 3 * MINUTE; // testing, else: 1.5 * HOUR

/**
 * Encodes the status of the user session.
 */
export enum UserReturnState  {
    NO_USER,
    ACTIVE_USER,
    IDLE_USER,
    LAPSED_USER
}

/**
 * Called for user-sensitive APIs to see what the active status is of the current user, if any
 * Server should return appropriate status to the client so that the client app can determine
 * how to respond to the information.
 * @param session The session identified by the service call
 * @returns {UserReturnState} value determines what the status this user falls into.
 */
export function testUser(session:SessionSpace) {
    const sessionAge = session.lastAccessedAt - session.createdAt // how old is this session
    const lapse = session.intervalTime // how long since previous API access
    if(session.userId) {
        // user has previously logged in
        if(lapse > userLoginExpired) {
            // request that the user login again
            return UserReturnState.LAPSED_USER

        } else if(lapse > welcomeBackLapseTime) {
            // request the client welcome back and confirm the user
            return UserReturnState.IDLE_USER
        }
        // otherwise, session user is recent enough we can trust it.
        return UserReturnState.ACTIVE_USER

    } else {
        // require a login
        return UserReturnState.NO_USER
    }
}