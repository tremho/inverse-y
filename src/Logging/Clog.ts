import ansiColors from "ansi-colors";
import {LogLevel} from "./LogLevel"


let clogLevel = LogLevel.Error;

export function Clog(level:LogLevel, message:string, ...other:any[]) {
    // if(level >= clogLevel) {
        let [others] = other
        console.log(formatClogMessage(level, message), ...others);

    // console.log(typeof other, Array.isArray(other), other.length, other.join(','))
    // }
}
export function ClogCritical(message:string, ...other:any[]) {
    Clog(LogLevel.Critical, message, other)
}
export function ClogException(e:Error, ...other:any[]) {
    const message = e.message
    other.unshift(e);
    Clog(LogLevel.Exception, message, other);
}
export function ClogError(message:string, ...other:any[]) {
    Clog(LogLevel.Error, message, other)
}
export function ClogWarn(message:string, ...other:any[]) {
    Clog(LogLevel.Warning, message, other)
}
export function ClogInfo(message:string, ...other:any[]) {
    Clog(LogLevel.Info, message, other)
}
export function ClogDebug(message:string, ...other:any[]) {
    Clog(LogLevel.Debug, message, other)
}
export function ClogTrace(message:string, ...other:any[]) {
    Clog(LogLevel.Trace, message, other)
}

export function setClogLevel(level:LogLevel) {
    clogLevel = level
}

export function formatClogMessage(level:LogLevel, message:string) {
    // [levl] yyyy-mm-dd hh:mm:ss.sss message text here
    let date = new Date();
    const yr = date.getFullYear()
    let mo = ''+(date.getMonth()+1)
    if(mo.length === 1) mo = '0'+mo
    let dy = ''+date.getDate()
    if(dy.length === 1) dy = '0'+dy
    let hr = ''+date.getHours()
    if(hr.length === 1) hr ='0'+hr
    let mn = ''+date.getMinutes()
    if(mn.length === 1) mn = '0'+mn
    let sec = ''+date.getSeconds();
    if(sec.length === 1) sec = '0'+sec
    let ms = ''+date.getMilliseconds();
    while(ms.length < 3) ms+= '0'
    let datestr = ansiColors.gray(`${yr}-${mo}-${dy} ${hr}:${mn}:${sec}.${ms}`)

    return  `${tag(level)} ${datestr} ${textColor(level,message)}`+ansiColors.reset("")
}
function tag(level:LogLevel) {
    switch(level) {
        case LogLevel.Critical:
            return ansiColors.bgRed.whiteBright("CRIT")
        case LogLevel.Exception:
            return ansiColors.bgBlack.redBright("EXCP")
        case LogLevel.Error:
            return ansiColors.bgRed.white("ERR!")
        case LogLevel.Warning:
            return ansiColors.bgYellow.black("WARN")
        case LogLevel.Info:
            return ansiColors.bgMagenta.white("INFO")
        case LogLevel.Debug:
            return ansiColors.bgBlue.white("DBUG")
        case LogLevel.Trace:
        default:
            return ansiColors.bgBlackBright.cyanBright("TRAC")
    }
}
function textColor(level:LogLevel, message:string) {
    switch(level) {
        case LogLevel.Critical:
            return ansiColors.red(message)
        case LogLevel.Exception:
            return ansiColors.red(message)
        case LogLevel.Error:
            return ansiColors.red(message)
        case LogLevel.Warning:
            return ansiColors.bgYellow.black(message)
        case LogLevel.Info:
            return ansiColors.green(message)
        case LogLevel.Debug:
            return ansiColors.blue(message)
        case LogLevel.Trace:
        default:
            return ansiColors.gray.italic(message);
    }
}