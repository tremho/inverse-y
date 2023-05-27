
const winston = require('winston');
const Path = require('path')
const FS = require('fs')

const { combine, timestamp, json, simple } = winston.format;

const logdir = Path.join(__dirname, '..', 'logs'); // out of build

if (!FS.existsSync(logdir)) {
  FS.mkdirSync(logdir)
}

export const transports = {
  console: new winston.transports.Console({
    level: 'debug',
    handleExceptions: true,
    format:  combine(
      timestamp({
        format: 'HH:mm:ss'
      }),
      simple()
    )
  }),
  file: new winston.transports.File({
    filename: Path.join(logdir,'tremho.log'),
    level: 'debug',
    handleExceptions: true,
    format: combine(
      timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      json()
    )
  })
};

export const logger = winston.createLogger({

  //levels -- use the default npm levels of error, warn, info, http, verbose, debug, silly

  transports: [
    transports.console,
    transports.file
  ],

  exitOnError: false

})

logger.exception = function(optmsg:string, e:any) {
  if(!e) {
    // single parameter error object
    e = optmsg
    optmsg = ''
  }
  let message
  if(optmsg) message = optmsg + ':: ' + e.name + ': ' + e.message
  else message = e.message
  let stackArray = (e.stack || '').split('\n')
  stackArray.shift() // throw away first
  let where = '\n'+ stackArray.join('\n')
  logger.error('Exception: ' +  message + " " + where)
}

logger.trace = function(msg = '') {
  logger.debug('[trace] '+msg)
}

// alternative to JSON.stringify for revealing an object (first level only)
logger.dumpObject = function(obj:any, name:string= '', deep=false) {
  if(typeof obj === 'object') {
    if(Array.isArray(obj)) {
      logger.debug('array '+name+' '+obj.toString())
    } else {
      logger.debug('object '+name)
      Object.getOwnPropertyNames(obj).forEach(p => {
        logger.debug( ' .'+p+ ' : {' + typeof obj[p] + '} ' + obj[p])
      })
    }
  } else {
    logger.debug('value '+name+ ' : {' + typeof obj + '} ' + obj)
  }
}
