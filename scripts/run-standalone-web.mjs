import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webDirectory = path.join(rootDirectory, 'apps', 'web')
const require = createRequire(path.join(webDirectory, 'package.json'))
const { loadWebEnv } = require('@phoenix/config/env')
process.env.PORT = String(loadWebEnv().webPort)

const serverPath = path.join(webDirectory, 'deploy', 'server.js')

require(serverPath)
