/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

export const CAI_ATTACHMENTS_INDEX_MAPPINGS: MappingTypeMapping = {
  dynamic: false,
  properties: {
    '@timestamp': {
      type: 'date',
    },
    case_id: {
      type: 'keyword',
    },
    type: {
      type: 'keyword',
    },
    created_at: {
      type: 'date',
    },
    created_by: {
      properties: {
        username: {
          type: 'keyword',
        },
        profile_uid: {
          type: 'keyword',
        },
        full_name: {
          type: 'keyword',
        },
        email: {
          type: 'keyword',
        },
      },
    },
    payload: {
      properties: {
        alerts: {
          properties: {
            id: {
              type: 'keyword',
            },
            index: {
              type: 'keyword',
            },
          },
        },
        file: {
          properties: {
            id: {
              type: 'keyword',
            },
            extension: {
              type: 'keyword',
            },
            mimeType: {
              type: 'keyword',
            },
            name: {
              type: 'keyword',
            },
          },
        },
      },
    },
    owner: {
      type: 'keyword',
    },
    space_ids: {
      type: 'keyword',
    },
  },
};
