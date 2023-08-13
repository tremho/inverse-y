import {createSiaToken, getSlotData, getSlotIdFromToken, reserveSlotForSIA} from "../Support/SiaToken";
import http from "http";
import {Session, sessionSave} from "./Session";


/**
 * Call to begin login to a session that is not authenticated.
 * Return will be page html to send to client for sso login per provider
 * Session will be equipped with the siaToken used for login purposes
 * @param session
 * @param invokingUrl
 */
export async function loginBegin(session:Session, invokingUrl:string):Promise<string>
{
    const jwt = await createSiaToken(session.appId);
    session.siaToken = jwt;
    await reserveSlotForSIA(session, jwt);
    const t = Date.now();
    // http(s)://mydomain:port/
    const ptci = invokingUrl.indexOf("://");
    if(ptci === -1) {
        throw new Error("Unable to resolve host from invokingUrl");
    }
    let hei = invokingUrl.indexOf('/', ptci+3)
    if(hei === -1) hei = invokingUrl.length;
    const host = invokingUrl.substring(0, hei);
    const page = await loadAndReturnPageForProvider(host, session.appId, session.provider, jwt);
    return page
}

/**
 * Simultaneous to returning the login page data to the client, the calling function should
 * call here to wait for the login async process to conclude.
 * At the end of this, then session will be authorizwd
 * An error is thrown if login fails
 * @param session
 * @param incomingSessionId
 */
export async function loginWaitFinish(session:Session, incomingSessionId:string):Promise<Session>
{
    // todo: throw LoginFailed on a timeout
    await waitforSlotResponse(session)
    return session; // session should be filled at this point
    // but wait -- what we really need to do is call the invoking url again...
    // I think this is best done via a redirect returned by the sso responder
}

async function loadAndReturnPageForProvider(host:string, appId:string, providerId:string, siaToken:string):Promise<string>
{
    return new Promise(resolve => {
        http.get(`${host}/sso/${providerId}.html`, res =>{
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

async function wait(ms:number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
async function waitforSlotResponse(session:Session):Promise<boolean> {
    let time = 10000;
    let running = true;
    return new Promise(resolve => {
        while(running) {
            // wait for a given amount of time
            wait(time).then(() => {
                // then call another function
                checkSlotForResponse(session).then((result: boolean) => {
                    if (result) {
                        running = false;
                        resolve(true);
                    }
                    time /= 2;
                    if (time < 1000) time = 1000;
                })
            })
        }
    })
}

async function checkSlotForResponse(session:Session):Promise<boolean>
{
    // get slot from sia
    const slotId = await getSlotIdFromToken(session.appId, session.siaToken)
    // open the slot
    const slotData = await getSlotData(slotId)

    if(slotData.filledMs > 0)
    {
        // set the session as authenticated with the incoming credentials
        // TODO: throw LoginFailed if authorization checks don't jibe.
        session.authenticatedAt = new Date();
        sessionSave(session);
        return true;
    }
    return false;
}

