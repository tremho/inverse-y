/**
 * Return the current time in Unix Seconds
 */
export function nowSeconds()
{
    return Math.floor(Date.now() / 1000 )
}

/**
 * TIme in seconds, hex format
 */
export function nowSecondsHex() {
    const ns = nowSeconds();
    return ns.toString(16);
}

/**
 * Parse the hex format
 * @param hex
 */
export function secondsFromHex(hex:string) {
    return parseInt(hex, 16)
}
