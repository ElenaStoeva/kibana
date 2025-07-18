/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { FtrConfigProviderContext } from '@kbn/test';

export default async function ({ readConfigFile }: FtrConfigProviderContext) {
  const apiIntegrationConfig = await readConfigFile(require.resolve('../../config.js'));

  return {
    ...apiIntegrationConfig.getAll(),
    testFiles: [require.resolve('.')],
    kbnTestServer: {
      ...apiIntegrationConfig.get('kbnTestServer'),
      serverArgs: [
        ...apiIntegrationConfig.get('kbnTestServer.serverArgs'),
        '--share.url_expiration.enabled=true',
        '--share.url_expiration.url_limit=5',
      ],
    },
  };
}
