/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { APM_TELEMETRY_SAVED_OBJECT_ID } from '../../common/apm_saved_object_constants';

export const apmTelemetry: SavedObjectsType = {
  name: APM_TELEMETRY_SAVED_OBJECT_ID,
  hidden: false,
  namespaceType: 'agnostic',
  mappings: {
    dynamic: false,
    properties: {},
  },
  modelVersions: {
    '1': {
      changes: [],
      schemas: {
        create: schema.object({}, { unknowns: 'allow' }),
      },
    },
  },
};
