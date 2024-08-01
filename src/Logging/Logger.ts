
// implement in terms of gen-logger
import {createDefaultLogger, addCategory} from '@tremho/gen-logger'
addCategory('LambdaApi')
export const Log = createDefaultLogger()
export const LambdaSupportLog = createDefaultLogger()
LambdaSupportLog.setDefaultCategoryName('LambdaApi')
LambdaSupportLog.setMinimumLevel('Console','warn')

