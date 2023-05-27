
import {logger as Log} from '../Logger'
import {S3Client,
    HeadBucketCommand,CreateBucketCommand,
    GetObjectCommand,PutObjectCommand
} from '@aws-sdk/client-s3'
import {fromIni} from "@aws-sdk/credential-provider-ini"
const awsCred = fromIni({profile:'tremho'})
const s3Client = new S3Client({
    credentials: awsCred
})
let crypto:any
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is disabled!');
}

// should put into a handy module
const streamToString = (stream:any):Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks:any[] = [];
        stream.on("data", (chunk:any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

async function resolveResponseObject(response:any) {
    let data
    const body = response && response.Body
    if(body) {
        const str:string = await streamToString(body)
        if(str) {
            try {
                data = JSON.parse(str)
            } catch(e) {}
        }
        return data
    }
}


// create with sso data

// verify permissions for purpose

// check age of validateion

// validate user info with sso provider

// add alternate property
// set preferred property


/**
 * Defines information provided by Sso
 * Note that different providers may supply different info and not all fields may be filed
 */
// todo: UserLogin in AppleSSo was the original source of this.  Refactor over there to use this
export class UserSsoInfo {
    siaToken:string = '' // our slot allocation ticket
    userToken:string = '' // the resolved user identifier we can bank on
    firstName:string =  '' // name info if we have it
    lastName:string = '' // name info if we have it
    email:string = ''  // email info, which we probably have
    provider:string = '' // apple, google, amazon, facebook, linkedIn, etc.
    validationError:string = '' // if things went sideways, here's what happened
}

/**
 * User as normalized in our services context
 */
export class User {
    userId: string = '' // our normalized user id
    appId: string = ''  // users are in app-specific buckets, so we can't share users across apps
    provider:MultiValue = new MultiValue('provider') // sso login provider of last login
    providerToken:string = '' // user id at the selected provider
    name: MultiValue = new MultiValue('name')
    email:MultiValue = new MultiValue('email')
    userInfo?:any // additional information about the user
    appData?:any // information collected for use by the app
}

/**
 * A property that can have multiple values
 * One of the values is 'preferred' and is available
 * with the `.value`  property.
 *
 * A MultiValue may be assigned a name, although one is not required.
 * A name must be given as the first parameter of a constructor assigning a value or values, however.
 * A MultiValue may be constructed with a name and value,
 * or a name, an array of values, and an index of which value in the array is the preferred one
 * A MultiValue may also be constructed by passing a JSON string of its serialized form to the constructor.
 * Values may be added to a MultiValue
 * Values can be tested for a value
 * A preferred value may be selected
 *
 * A value that exists as a property may be accessed as `prop.value`,
 * but if there is a chance the host object may have been rehydrated from JSON, use
 * the form `new MultiValue(prop).value` instead, which will work in either case.
 *
 *
 */
export class MultiValue {
    isMultiValue = true; // used for type identification
    name:string = '' // name of the value
    values:string[] = [] // the values
    preferred: number = 0 // preferred index

    constructor(name?:string|MultiValue, values?:string[]|string, preferred?:number) {
        if(name) {
            if((name as MultiValue).isMultiValue) {
                name = JSON.stringify(name)
            }
            // test for JSON
            name = (name as string).trim()
            if(name.charAt(0) === '{') {
                if(name.charAt(name.length-1) === '}') {
                    return this.fromJSON(name)
                }
            }
            this.name = name
        }
        if(values) {
            if(typeof values === 'string') {
                values = [values]
            }
            this.values = values
        }
        if(preferred) this.preferred = preferred
    }

    fromJSON(str:string) {
        Object.assign(this, JSON.parse(str))
        return this
    }

    /**
     * returns the preferred value of this property
     */
    get value() : string {
        return this.values[this.preferred]
    }

    /**
     * set value directly is the same as adding and making preferred
     * @param v
     */
    set value(v) {
        if(!this.hasValue(v)) {
            this.addValue(v)
        }
        this.setPreferred(v)
    }

    /**
     * returns true if the value given is one of the alternate values
     *
     * @param alternate
     */
    hasValue(alternate:string)  :boolean {
        let rt = false
        let lcc = alternate.toLowerCase()
        this.values.forEach(v => {
            if(v.toLowerCase() === lcc) {
                rt = true
            }
        })
        return rt
    }

    /**
     * sets the alternate to the be the preferred
     * @param {string} value THe value to set as preferred
     *
     * returns true if successful,
     * false if value is not in list of alternates
     */
    setPreferred(value:string): boolean {
        let rt = false
        let lcc = value.toLowerCase()
        for(let i=0; i<this.values.length; i++) {
            if(this.values[i].toLowerCase() === lcc) {
                rt = true
                this.preferred = i
            }
        }
        return rt
    }
    /**
     * Add a new alternate
     */
    addValue(value:string) {
        this.values.push(value)
    }
}

/*
A user is identifed by an SSO provider and the token for that provider
We can look that up in our records to find our user by ID (our Id)
the active user record shoudl retain the Sso and the Sso Token so we can
make future validation calls to the provider.

User properties can have multiple values, although one is selected as preferred.

from SSO data
- find associated user (by provider token)
- failing that, attempt to associate by email
- failing that, make a new user from this data

Also, add a timestamp for when we created/last validated a user

That's all we need for now.

later:
- check validation time and validate user with provider
- user interaction to collect additional information and/or to verify
- email user to validate, with trust pending reply

 */

/**
 * Makes a user bucket if we don't have one
 *
 * @param appId the app we are attached to
 *
 * @return Promise<boolean> true if we have a bucket, false if not
 *
 */
export async function ensureUserBucket(appId:string) {
    const bucketId = (appId+'-users').toLowerCase()
    const accountId = '545650260286' // TODO: probably should go into credentials if not in the ini somehow

    Log.trace('Checking for user bucket '+bucketId)
    // check if bucket exists
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/headbucketcommand.html
    const command = new HeadBucketCommand({
        Bucket: bucketId,
        ExpectedBucketOwner: accountId // awsCred.name // ? is this the right thing?
    });
    const response = await s3Client.send(command).catch((e:Error) => {
        if (e.message !== 'NotFound') {
            Log.exception('ensureUserBucket/HeadBucketCommand', e)
        }
    })
    const code = (response && response.$metadata.httpStatusCode) || 0
    const exists = code >= 200 && code < 300

    let success = exists

    Log.trace('bucket exists? '+exists)

    if(!exists) {
        // create it if not
        Log.info('Creating new user bucket for application ' + appId)
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/createbucketcommand.html
        const command = new CreateBucketCommand({
            ACL: "private",
            Bucket: bucketId,
        });
        const response = await s3Client.send(command).catch((e: Error) => {
            Log.exception('ensureUserBucket/CreateBucketCommand', e)
        })
        const code = (response && response.$metadata.httpStatusCode) || 0
        success = code >= 200 && code < 300

        if(success) {
            Log.trace('successfully created bucket '+ bucketId)
            Log.trace('now making stub user')
            // make a stub user
            const userData = new UserSsoInfo()
            userData.userToken = '--stub-entry-only--'
            userData.email = "admin@tremho.com"
            userData.provider = 'init'
            userData.firstName = "Admin"
            userData.lastName = "Stub"

            const userId = await makeNewUser(appId, userData)
            Log.trace('Stub user created as userId '+ userId)


        }
    }
    if(success) {
        await readTokenIndex(bucketId)
    }

    return success
}

/*
Let's keep an index of provider+token to userID for fast lookup
 */
let tokenIndex:any = {}

async function readTokenIndex(bucketId:string) {
    Log.trace('Reading tokenIndex from '+bucketId)
    const command = new GetObjectCommand({
        Bucket: bucketId,
        Key: 'tokenIndex'
    });
    const response = await s3Client.send(command).catch((e:Error) => {
        Log.exception('readTokenIndex', e)
    })
    const code = (response && response.$metadata.httpStatusCode) || 0
    const success = code >= 200 && code < 300
    if(success) {
        const data = await resolveResponseObject(response)
        if(data) {
            Log.trace('tokenIndex loaded with ' + Object.getOwnPropertyNames(data).length + ' entries')
            console.log(data)
            tokenIndex = data
        }
    }
}
async function addNewUser(user:User) {
    // add user object to s3 bucket
    const appId = user.appId
    const success = await saveUser(user)
    if(success) {
        const bucketId = (user.appId+'-users').toLowerCase()
        // make and add token index, save tokenIndex
        const provToken = user.provider.value + user.providerToken
        tokenIndex[provToken] = user.userId
        const str = JSON.stringify(tokenIndex)
        const command = new PutObjectCommand({
            Bucket: bucketId,
            Key: 'tokenIndex',
            Body: str
        });
        const response = await s3Client.send(command).catch((e:Error) => {
            Log.exception('addNewUser', e)
        })
        const code = (response && response.$metadata.httpStatusCode) || 0
        const success = code >= 200 && code < 300

        return success
    }
    return false;

}

async function makeNewUser(appId:string, userData:any) {

    const userId = crypto.randomUUID()
    const newUser = new User()
    newUser.userId = userId
    newUser.appId = appId
    newUser.provider.value = userData.provider
    newUser.providerToken = userData.userToken
    newUser.email.addValue(userData.email)
    let name = ((userData.firstName || '') +' '+(userData.lastName || '')).trim()
    if(name) newUser.name.addValue(name)

    const success = await addNewUser(newUser)
    return success ? userId : ''

}

export async function onboardUser(appId:string, userData:UserSsoInfo): Promise<string> {
    const provToken = userData.provider+userData.userToken
    Log.trace('onboarding user by provider token '+provToken)
    let userId = tokenIndex[provToken]
    let p = Promise.resolve(userId)
    if(userId) {
        Log.trace('found userId '+userId)
    } else {
        Log.trace('user not found')
        userId = await associateUser(appId, userData)
        if(!userId) {
            Log.trace('treating as new user')
            userId = await makeNewUser(appId, userData)
        }
    }
    Log.trace('associated to userId '+userId)
    return userId
}

async function associateUser(appId:string, userData:UserSsoInfo): Promise<string> {
    Log.trace('associating user')
    let foundUserId = ''
    let p = Promise.resolve(true)
    await enumerateUsers(appId, (user:User) => {
        if(user.email.hasValue(userData.email)) {
            foundUserId = user.userId
            let name = ((userData.firstName || '') +' '+(userData.lastName || '')).trim()
            if(name) {
                if(!user.name.hasValue(name)) {
                    user.name.addValue(name)
                }
            }
            // these are now switched to the most recent SSO source
            user.provider.value = userData.provider
            user.providerToken = userData.userToken

            // console.log('associated User', user)
            p = saveUser(user)
        }
    })
    return p.then((success:boolean) => {
        return success ? foundUserId : ''
    })

}

export async function enumerateUsers(appId:string, userCallback:any) {
    for( let p of Object.getOwnPropertyNames(tokenIndex)) {
        const userId = tokenIndex[p]
        const user = await fetchUser(appId, userId)
        let stop = userCallback(user)
        if(stop) break;
    }
}

export async function fetchUser(appId:string, userId:string): Promise<User> {
    const bucketId = (appId+'-users').toLowerCase()
    const command = new GetObjectCommand({
        Bucket: bucketId,
        Key: userId
    });
    const response = await s3Client.send(command).catch((e:Error) => {
        Log.exception('fetchUser', e)
    })
    const code = (response && response.$metadata.httpStatusCode) || 0
    const success = code >= 200 && code < 300
    let user
    if(success) {
        user = await resolveResponseObject(response)
        if(user) {
            user.email = new MultiValue(user.email)
            user.name = new MultiValue(user.name)
            user.provider = new MultiValue(user.provider)
        }

    }
    return user
}
export async function saveUser(user:User): Promise<boolean> {
    const appId = user.appId
    const bucketId = (appId+'-users').toLowerCase()
    const userPersist = JSON.stringify(user)
    const command = new PutObjectCommand({
        Bucket: bucketId,
        Key: user.userId,
        Body: userPersist
    });
    const response = await s3Client.send(command).catch((e:Error) => {
        Log.exception('saveUser', e)
    })
    const code = (response && response.$metadata.httpStatusCode) || 0
    const success = code >= 200 && code < 300
    return success
}