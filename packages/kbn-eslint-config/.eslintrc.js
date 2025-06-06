/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

const { USES_STYLED_COMPONENTS } = require('@kbn/babel-preset/styled_components_files');

module.exports = {
  extends: [
    './javascript.js',
    './typescript.js',
    './jest.js',
    './react.js',
    'plugin:@elastic/eui/recommended',
  ],

  plugins: [
    '@kbn/eslint-plugin-disable',
    '@kbn/eslint-plugin-eslint',
    '@kbn/eslint-plugin-imports',
    '@kbn/eslint-plugin-telemetry',
    '@kbn/eslint-plugin-i18n',
    '@kbn/eslint-plugin-eui-a11y',
    '@elastic/eui',
    'eslint-plugin-depend',
    'prettier',
  ],

  parserOptions: {
    ecmaVersion: 2018,
  },

  env: {
    es6: true,
  },

  rules: {
    // Suggests better replacements for packages: https://github.com/es-tooling/module-replacements/tree/main/docs/modules
    'depend/ban-dependencies': [
      'error',
      {
        allowed: [
          '^@kbn/*', // internal packages
          'lodash', // https://github.com/es-tooling/module-replacements/blob/main/docs/modules/lodash-underscore.md
          'moment', // https://github.com/es-tooling/module-replacements/blob/main/docs/modules/momentjs.md
          'jquery', // https://github.com/es-tooling/module-replacements/blob/main/docs/modules/jquery.md
        ],
      },
    ],

    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],

    '@kbn/eslint/module_migration': [
      'error',
      [
        {
          from: 'expect.js',
          to: '@kbn/expect',
        },
        {
          from: 'mkdirp',
          to: false,
          disallowedMessage: `Don't use 'mkdirp', use the new { recursive: true } option of Fs.mkdir instead`,
        },
        {
          from: 'numeral',
          to: '@elastic/numeral',
        },
        {
          from: '@kbn/elastic-idx',
          to: false,
          disallowedMessage: `Don't use idx(), use optional chaining syntax instead https://ela.st/optchain`,
        },
        {
          from: 'x-pack',
          toRelative: 'x-pack',
        },
        {
          from: 'react-router',
          to: 'react-router-dom',
        },
        {
          from: '@kbn/ui-shared-deps/monaco',
          to: '@kbn/monaco',
        },
        {
          from: 'monaco-editor',
          to: false,
          disallowedMessage: `Don't import monaco directly, use or add exports to @kbn/monaco`,
        },
        {
          from: 'tinymath',
          to: '@kbn/tinymath',
          disallowedMessage: `Don't use 'tinymath', use '@kbn/tinymath'`,
        },
        {
          from: '@kbn/test/types/ftr',
          to: '@kbn/test',
          disallowedMessage: `import from the root of @kbn/test instead`,
        },
        {
          from: 'react-intl',
          to: '@kbn/i18n-react',
          disallowedMessage: `import from @kbn/i18n-react instead`,
          exclude: [/src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-i18n-react/],
        },
        {
          from: 'zod',
          to: '@kbn/zod',
          disallowedMessage: `import from @kbn/zod instead`,
          exclude: [/src[\/\\]platform[\/\\]packages[\/\\]shared[\/\\]kbn-zod[\/\\]/],
        },
        {
          from: 'styled-components',
          to: false,
          exclude: USES_STYLED_COMPONENTS,
          disallowedMessage: `Prefer using @emotion/react instead. To use styled-components, ensure you plugin is enabled in packages/kbn-babel-preset/styled_components_files.js.`,
        },
        {
          from: '@kbn/test/jest',
          to: '@kbn/test-jest-helpers',
          disallowedMessage: `import from @kbn/test-jest-helpers instead`,
        },
        {
          from: '@kbn/utility-types/jest',
          to: '@kbn/utility-types-jest',
          disallowedMessage: `import from @kbn/utility-types-jest instead`,
        },
        {
          from: '@kbn/inspector-plugin',
          to: '@kbn/inspector-plugin/common',
          exact: true,
        },
        {
          from: '@kbn/expressions-plugin',
          to: '@kbn/expressions-plugin/common',
          exact: true,
        },
        {
          from: '@kbn/kibana-utils-plugin',
          to: '@kbn/kibana-utils-plugin/common',
          exact: true,
        },
        {
          from: '@elastic/safer-lodash-set',
          to: '@kbn/safer-lodash-set',
        },
        {
          from: '@elastic/apm-synthtrace',
          to: '@kbn/apm-synthtrace',
        },
        {
          from: 'rison-node',
          to: '@kbn/rison',
        },
        {
          from: 'react-dom/client',
          to: 'react-dom',
          exact: true,
          disallowedMessage:
            'Use `react-dom` instead of `react-dom/client` until upgraded to React 18',
        },
      ],
    ],

    /**
     * ESLint rule to aid with breaking up packages:
     *
     *  `from` the package/request where the exports used to be
     *  `to` the package/request where the exports are now
     *  `exportNames` the list of exports which used to be found in `from` and are now found in `to`
     *
     * TODO(@spalger): once packages have types we should be able to filter this rule based on the package type
     *  of the file being linted so that we could re-route imports from `plugin-client` types to a different package
     *  than `plugin-server` types.
     */
    '@kbn/imports/exports_moved_packages': [
      'error',
      [
        {
          from: '@kbn/dev-utils',
          to: '@kbn/tooling-log',
          exportNames: [
            'DEFAULT_LOG_LEVEL',
            'getLogLevelFlagsHelp',
            'LOG_LEVEL_FLAGS',
            'LogLevel',
            'Message',
            'ParsedLogLevel',
            'parseLogLevel',
            'pickLevelFromFlags',
            'ToolingLog',
            'ToolingLogCollectingWriter',
            'ToolingLogOptions',
            'ToolingLogTextWriter',
            'ToolingLogTextWriterConfig',
            'Writer',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/ci-stats-reporter',
          exportNames: [
            'CiStatsMetric',
            'CiStatsReporter',
            'CiStatsReportTestsOptions',
            'CiStatsTestGroupInfo',
            'CiStatsTestResult',
            'CiStatsTestRun',
            'CiStatsTestType',
            'CiStatsTiming',
            'getTimeReporter',
            'MetricsOptions',
            'TimingsOptions',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/ci-stats-core',
          exportNames: ['Config'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/jest-serializers',
          exportNames: [
            'createAbsolutePathSerializer',
            'createStripAnsiSerializer',
            'createRecursiveSerializer',
            'createAnyInstanceSerializer',
            'createReplaceSerializer',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/stdio-dev-helpers',
          exportNames: ['observeReadable', 'observeLines'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/sort-package-json',
          exportNames: ['sortPackageJson'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/dev-cli-runner',
          exportNames: [
            'run',
            'Command',
            'RunWithCommands',
            'CleanupTask',
            'Command',
            'CommandRunFn',
            'FlagOptions',
            'Flags',
            'RunContext',
            'RunFn',
            'RunOptions',
            'RunWithCommands',
            'RunWithCommandsOptions',
            'getFlags',
            'mergeFlagOptions',
          ],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/dev-cli-errors',
          exportNames: ['createFailError', 'createFlagError', 'isFailError'],
        },
        {
          from: '@kbn/dev-utils',
          to: '@kbn/dev-proc-runner',
          exportNames: ['withProcRunner', 'ProcRunner'],
        },
        {
          from: '@kbn/utils',
          to: '@kbn/repo-info',
          exportNames: [
            'REPO_ROOT',
            'UPSTREAM_BRANCH',
            'kibanaPackageJson',
            'isKibanaDistributable',
            'fromRoot',
          ],
        },
        {
          from: '@kbn/presentation-util-plugin/common',
          to: '@kbn/presentation-util-plugin/test_helpers',
          exportNames: ['functionWrapper', 'fontStyle'],
        },
        {
          from: '@kbn/fleet-plugin/common',
          to: '@kbn/fleet-plugin/common/mocks',
          exportNames: ['createFleetAuthzMock'],
        },
      ],
    ],

    '@kbn/disable/no_protected_eslint_disable': 'error',
    '@kbn/disable/no_naked_eslint_disable': 'error',
    '@kbn/eslint/no_async_promise_body': 'error',
    '@kbn/eslint/no_async_foreach': 'error',
    '@kbn/eslint/require_kibana_feature_privileges_naming': 'warn',
    '@kbn/eslint/no_trailing_import_slash': 'error',
    '@kbn/eslint/no_constructor_args_in_property_initializers': 'error',
    '@kbn/eslint/no_this_in_property_initializers': 'error',
    '@kbn/eslint/no_unsafe_console': 'error',
    '@kbn/eslint/no_unsafe_hash': 'error',
    '@kbn/imports/no_unresolvable_imports': 'error',
    '@kbn/imports/uniform_imports': 'error',
    '@kbn/imports/no_unused_imports': 'error',
    '@kbn/imports/no_boundary_crossing': 'error',
    '@kbn/imports/no_group_crossing_manifests': 'error',
    '@kbn/imports/no_group_crossing_imports': 'error',
    'no-new-func': 'error',
    'no-implied-eval': 'error',
    'no-prototype-builtins': 'error',

    /**
     * EUI Team rules
     */

    '@elastic/eui/no-restricted-eui-imports': [
      'warn',
      {
        patterns: ['@kbn/ui-theme'],
        message: 'For client-side, please use `useEuiTheme` instead.',
      },
    ],
  },
};
