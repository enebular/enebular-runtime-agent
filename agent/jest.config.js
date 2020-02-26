module.exports = {
    roots: ['<rootDir>'],
    testMatch : [ '**/__tests__/**/(*.)(test).js'],
    verbose: true,
    collectCoverage: false,
    coverageDirectory: './coverage-agent',
    collectCoverageFrom: [
      'lib/asset-manager.js',
      '!**/node_modules/**'
    ],
    coverageThreshold: {
      global: {
        statements: 0,
        branches: 0,
        lines: 0,
        functions: 0
      }
    }
  }
