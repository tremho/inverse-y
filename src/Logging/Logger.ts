
// implement in terms of gen-logger
import {createDefaultLogger, createMonochromeLogger, addCategory} from '@tremho/gen-logger'
addCategory('LambdaApi')
export const Log = createDefaultLogger()
export const LambdaSupportLog = createMonochromeLogger()
LambdaSupportLog.setDefaultCategoryName('LambdaApi')
LambdaSupportLog.setMinimumLevel('Console','warn')

