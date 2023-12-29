import ansiColors from "ansi-colors";
import {LogLevel} from "./LogLevel"


let clogLevel = LogLevel.All;
const forceInColorTo = false;

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
    let message = e.message
    if(e.stack) message += " @ " + e.stack;
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

export function formatClogMessage(level:LogLevel, message:string, inColor=true) {
    // inColor = forceInColorTo === undefined ? inColor : forceInColorTo;
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
    let datestr = `${yr}-${mo}-${dy} ${hr}:${mn}:${sec}.${ms}`;
    if (inColor) datestr = ansiColors.gray(datestr);

    return  (`${tag(level, inColor)} ${datestr} ${textColor(level,message,inColor)}`)+ (inColor ? ansiColors.reset("") : "");
}
function tag(level:LogLevel, inColor:boolean) {
    // inColor = forceInColorTo === undefined ? inColor : forceInColorTo;
    switch(level) {
        case LogLevel.Critical:
            return inColor ? ansiColors.bgRed.whiteBright("CRIT") : "CRIT"
        case LogLevel.Exception:
            return inColor? ansiColors.bgBlack.redBright("EXCP") : "EXCP"
        case LogLevel.Error:
            return inColor ? ansiColors.bgRed.white("ERR!") : "ERR!"
        case LogLevel.Warning:
            return inColor ? ansiColors.bgYellow.black("WARN") : "WARN"
        case LogLevel.Info:
            return inColor ? ansiColors.bgMagenta.white("INFO") : "INFO"
        case LogLevel.Debug:
            return inColor ? ansiColors.bgBlue.white("DBUG") : "DBUG"
        case LogLevel.Trace:
        default:
            return inColor ? ansiColors.bgBlackBright.cyanBright("TRAC") : "TRAC"
    }
}
function textColor(level:LogLevel, message:string, inColor:boolean) {
    // inColor = forceInColorTo === undefined ? inColor : forceInColorTo;
    if(!inColor) return message;
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