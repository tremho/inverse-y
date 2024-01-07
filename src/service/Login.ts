import {createSiaToken, getSlotData, getSlotIdFromToken, reserveSlotForSIA} from "../Support/SiaToken";
import {Log} from "../Logging/Logger"
import axios from "axios";
import {Session, sessionSave, sessionGet} from "./Session";
import {Success} from "./Responses";
import {AwsStyleResponse} from "./LambdaApi"


/**
 * Call to begin login to a session that is not authenticated.
 * Return will be page html to send to client for sso login per provider
 * Session will be equipped with the siaToken used for login purposes
 * @param session
 * @param invokingUrl
 */
export async function loginBegin(session:Session, invokingUrl:string):Promise<any>
{
    const jwt = await createSiaToken(session.appId);
    session.siaToken = jwt;
    // console.log(">>>>>>>>>>>>>>>>>>>>>>> Reserve slot for SIA with session", session)
    await reserveSlotForSIA(session, jwt);
    const t = Date.now();
    // http(s)://mydomain:port/
    Log.Debug("invokingUrl", invokingUrl);
    const ptci = invokingUrl.indexOf("://");
    if(ptci === -1) {
        throw new Error("Unable to resolve host from invokingUrl");
    }
    let hei = invokingUrl.indexOf('/', ptci+3)
    if(hei === -1) hei = invokingUrl.length;
    const host = invokingUrl.substring(0, hei);
    Log.Debug("host", host)
    // console.log(">>>>>>>>>>>>>> Invoking login -- see you on the otehr side...")
    const webhost = host+"/Dev" // todo: stage
    Log.Debug("webhost", webhost);
    const page = await loadAndReturnPageForProvider(webhost, session.appId, session.provider, jwt);
    return AwsStyleResponse(Success(page));
}

/**
 * Simultaneous to returning the login page data to the client, the calling function should
 * call here to wait for the login async process to conclude.
 * At the end of this, then session will be authorizwd
 * An error is thrown if login fails
 * @param session
 * @param incomingSessionId
 */
export async function loginWaitFinish(session:Session, userToken:string):Promise<Session>
{
    console.log(">>>>>>>>>>>>> waiting for login to finish")
    // todo: throw LoginFailed on a timeout
    await waitforSlotResponse(session)
    session.userToken = userToken;
    console.log(">>>>>>>>>>>> updated session", session);
    return session; // session should be filled at this point
    // but wait -- what we really need to do is call the invoking url again...
    // I think this is best done via a redirect returned by the sso responder
}

async function loadAndReturnPageForProvider(webhost:string, appId:string, providerId:string, siaToken:string):Promise<string>
{
    // return returnStaticHtmlForProvider();
    return new Promise(resolve => {
        axios.get(`${webhost}/sso/${providerId}.html`).then(res =>{
            if(res.status === 200)
            {
                let data = res.data;
                resolve(data
                    .replace("SIA_TOKEN_GOES_HERE", siaToken)
                    .replace("APPID_GOES_HERE", appId)
                );
            }
        })
    })
}

async function returnStaticHtmlForProvider():Promise<string>
{
    return Promise.resolve("<html><head><title>Temp Test Content</title></head><body><h3>Hello, World</h3></body></html>");
}


let  waitTimerId:any;

async function wait(ms:number) {
    clearTimeout(waitTimerId);
    return new Promise(resolve => {
        waitTimerId = setTimeout(resolve, ms);
    });
}
async function waitforSlotResponse(session:Session):Promise<boolean> {

    return new Promise(resolve => {
        console.log(">>>>> starting waitForSlotResponse")
        const LoopTillFound:any = async (time: number) => {
            console.log(".... checking...")
            if (await checkSlotForResponse(session)) {
                console.log("... Found!")
                clearTimeout(waitTimerId);
                resolve(true);
            }
            console.log(".... wait", time)
            await wait(time)
            time /= 2
            if (time < 500) {
                clearTimeout(waitTimerId);
                throw Error("Timeout");
            }
            console.log(".... looping")
            return LoopTillFound(time)
        }
        LoopTillFound(10000);
    })
}

async function checkSlotForResponse(session:Session):Promise<boolean>
{
    // get slot from sia
    console.log("->->->->->->-> Checking slot for session", session)
    if(!session.appId || !session.siaToken) return false;
    const slotId = await getSlotIdFromToken(session.appId, session.siaToken)
    // open the slot
    const slotData = await getSlotData(slotId)
    console.log(`Slot data from slotId ${slotId}`, slotData);

    // if(slotData.filledMs == 0)
    {
        // set the session as authenticated with the incoming credentials
        // TODO: throw LoginFailed if authorization checks don't jibe.
        session.authenticatedAt = Date.now();
        console.log("Creating new session -- date should be current", session.authenticatedAt)
        await sessionSave(session);
        return true;
    }
    return false;
}

