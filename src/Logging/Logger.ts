
// create an array of logs in memory we can export later
// also send logs to CLog for console output
import {LogLevel} from "./LogLevel";
import {Clog, formatClogMessage, setClogLevel} from "./Clog";

const logRecord:string[] = []
let currentLevel = LogLevel.All;


/**
 * Logs a message at the given log level
 * @param level
 * @param message
 * @param other
 * @constructor
 */
export function LogAtLevel(level:any, message:string, ...other:any[]) {
    let [others] = other //
    if(level < currentLevel) {
        let outline = formatClogMessage(level, message, false)
        console.log(outline, ...other)
        if(others) {
            outline += " - " + logRecord.push(JSON.stringify(others))
        }
        logRecord.push(outline);
    }
    // Clog(level, message, other);
}

/**
 * Clears all logs from the in-memory record
 * @constructor
 */
export function ClearLogs() {
    logRecord.splice(0, logRecord.length);
}

/**
 * Sets the logging level for the in-memory record and for the console output
 * @param level - sets the level for recorded logs, and console output if consoleLevel is not given
 * @param [consoleLevel] - if given, sets a separate level for console output
 */
export function setLoggingLevel(level:any, consoleLevel?:LogLevel) {
    currentLevel = level;
    setClogLevel(consoleLevel ?? level);
}

/**
 * Returns the list of recorded log lines
 */
export function collectLogs():string[]
{
    return logRecord
}

/**
 * The Log API for emitting logs
 */
export class Log {
    static Crtical(message:string, ...other:any[]) {
        LogAtLevel(LogLevel.Critical, message, other)
    }
    static Error(message:string, ...other:any[]) {
        LogAtLevel(LogLevel.Error, message, other)
    }
    static Warn(message:string, ...other:any[]) {
        LogAtLevel(LogLevel.Warning, message, other)
    }
    static Info(message:string, ...other:any[]) {
        LogAtLevel(LogLevel.Info, message, other)
    }
    static Debug(message:string, ...other:any[]) {
        LogAtLevel(LogLevel.Debug, message, other)
    }
    static Trace(message:string, ...other:any[]) {
        LogAtLevel(LogLevel.Trace, message, other)
    }
    static Exception(e:any, ...other:any[]) {
        console.log("Logger Exception", e)
        LogAtLevel(LogLevel.Exception, e.message, other)
    }
}