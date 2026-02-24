const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch only the specific shared packages the mobile app imports
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages', 'shared-types'),
  path.resolve(monorepoRoot, 'packages', 'core'),
  path.resolve(monorepoRoot, 'apps', 'api'),
]

// Exclude node_modules inside watched packages and heavy directories
// to prevent Metro from crawling them and blowing the JS heap.
config.resolver.blockList = [
  /packages\/.*\/node_modules\/.*/,
  /apps\/api\/node_modules\/.*/,
  /apps\/web\/.*/,
]

// Resolve modules from both the mobile app and monorepo root.
// Mobile's node_modules is checked first for version-specific packages.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// In pnpm hoisted monorepos, the root may have a different React version
// (e.g. 19.2.0 from Next.js) while mobile needs 19.1.0 (from React Native).
// Packages like zustand, react-query, react-native-paper are hoisted to root
// and their internal require('react') would find root's React via standard
// node walk-up resolution, creating TWO React instances and breaking hooks.
//
// Fix: For all react imports, disable hierarchical (walk-up) lookup and ONLY
// resolve from mobile's node_modules where React 19.1.0 lives.
const mobileNodeModules = path.resolve(projectRoot, 'node_modules')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(
      {
        ...context,
        disableHierarchicalLookup: true,
        nodeModulesPaths: [mobileNodeModules],
      },
      moduleName,
      platform
    )
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
