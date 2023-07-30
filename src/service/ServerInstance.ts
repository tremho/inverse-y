/**
 * Instance id maintained centrally.
 * This is used for crypto signing of the JWT stuff.
 * The instance id is static.  It will change with version, but will be the same for all code deployed together.
 */
let crypto:any
try {
    crypto = require('crypto');
} catch (err) {
    console.log('crypto support is disabled!');
}

import fs from 'fs';
import path from 'path';


function generateNewInstanceKeys() {
    try {
        if(crypto) {
            const pkgFile = path.join(__dirname, "..", "..", "package.json");
            let version = "dev";
            try {
                if (fs.existsSync(pkgFile)) {
                    const pkgJson = JSON.parse(fs.readFileSync(pkgFile).toString());
                    version = pkgJson.version;
                }
            } catch(e) {};
            serverInstance.instanceId = 'sso-manager-'+version;
            serverInstance.secretKey = crypto.createSecretKey(serverInstance.instanceId, 'utf-8')
        } else {
            throw Error('crypto is not supported')
        }
    } catch(e) {
        console.error('generateNewInstanceKeys', e)
        throw e;
    }
}

// -- ServerInstance id and keys --
// on each server restart, make a new key.  this will be our serverInstanceID for UUID purposes as well as our validation key.
// only drawback is that keys issued by our predecessor will no longer be valid, and will reject forcing a retry.
// which is only a problem if we are subject to a lot of restarts for some failure reason.
export const serverInstance:any = {
}
generateNewInstanceKeys()
